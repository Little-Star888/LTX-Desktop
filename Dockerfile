# ──────────────────────────────────────────────────────────────
# LTX-2 Video Generation — Full Stack (CUDA + Web Frontend)
# ──────────────────────────────────────────────────────────────
#
# Prerequisites (host):
#   - Docker Engine 24+
#   - NVIDIA Container Toolkit (for GPU mode):
#     https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html
#   - NVIDIA Driver ≥ 525.60 (CUDA 12.x forward compatibility)
#
# Build:
#   docker build -t ltx-video-web .
#
# Run (local generation, requires NVIDIA GPU with ≥32 GB VRAM):
#   docker run --gpus all \
#     -p 8000:8000 \
#     -v ltx-data:/data \
#     -e LTX_AUTH_TOKEN=your_secret \
#     ltx-video
#
# Run (API-only mode, no GPU required):
#   docker run --gpus '' \
#     -p 8000:8000 \
#     -v ltx-data:/data \
#     -e LTX_AUTH_TOKEN=your_secret \
#     -e LTX_FORCE_API_GENERATIONS=true \
#     ltx-video
#
# Compose:
#   GPU mode:   docker compose up
#   API-only:   docker compose -f docker-compose.yml -f docker-compose.api.yml up
#
# Web UI:
#   After starting, open http://localhost:8000 in browser
#
# ──────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════
# Stage 1: Build Frontend (Node.js)
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Configure npm registry to use China mirror (for corepack)
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Copy package files first (for better cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Configure mirror in .npmrc and replace URLs in lockfile
RUN echo -e "registry=https://registry.npmmirror.com\nminimum-release-age=10080\naudit=true\nsave-exact=true" > .npmrc && \
    sed -i 's/registry\.npmjs\.org/registry.npmmirror.com/g' pnpm-lock.yaml

# Install dependencies (skip electron download for web build)
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV PNPM_NETWORK_TIMEOUT=300000
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Copy frontend source files
COPY frontend/ ./frontend/
COPY vite.config.ts tsconfig.json tsconfig.node.json index.html ./
COPY postcss.config.js tailwind.config.js ./

# Build frontend for web mode (API URL will be same origin)
ENV VITE_MODE=web
ENV VITE_API_URL=
RUN pnpm build:web

# ═══════════════════════════════════════════════════════════════
# Stage 2: Python Backend Base
# ═══════════════════════════════════════════════════════════════
FROM python:3.13-slim-trixie AS base

# Configure China mirror for Debian
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources

# ── System dependencies ──────────────────────────────────────
# build-essential:  gcc/g++/make (for C/C++ extension builds)
# libgl1/libglib2.0: OpenCV runtime deps
# libgomp1:         OpenMP runtime (torch, opencv, transformers)
# git:              for git-based Python deps (diffusers, ltx-core, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ── uv (Python package manager) — install via pip to avoid cross-registry issues ──
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple uv

# ── Backend code (layered COPY for Docker cache) ─────────────
WORKDIR /app/backend

# Layer 1: lockfile + project metadata (changes rarely)
COPY backend/pyproject.toml backend/uv.lock ./

# Layer 2: source code (changes often)
COPY backend/ ./
# Remove .python-version so uv doesn't demand an exact 3.13.x patch version;
# --python 3.13 already selects the container's Python 3.13.x.
RUN rm -f .python-version

# ── Install Python dependencies ──────────────────────────────
#
# Key details:
#   - --frozen:          use lockfile as-is, never modify it
#   - --no-dev:          skip test/debug deps (pytest, pyright, debugpy)
#   - --python 3.13:     accept any 3.13.x (overrides .python-version pin)
#
# The pyproject.toml [tool.uv.sources] maps torch to the CUDA 12.9 wheel
# index, so uv automatically pulls torch+cu129 on Linux — no system CUDA
# toolkit needed inside the container.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    UV_HTTP_TIMEOUT=300

# ── Copy vendor and setup git URL redirection ───────────────
# Redirect GitHub URLs to local vendor (preserves official source code)
COPY vendor/ /vendor/
RUN git config --global \
    url."file:///vendor/diffusers".insteadOf \
    "https://github.com/huggingface/diffusers.git" && \
    git config --global \
    url."file:///vendor/ltx-2".insteadOf \
    "https://github.com/Lightricks/LTX-2.git" && \
    git config --global \
    url."file:///vendor/sam3".insteadOf \
    "https://github.com/facebookresearch/sam3.git"

# ── Checkout vendor repos to specific revisions ──────────────
# Ensure vendor repos match the rev specified in pyproject.toml
RUN cd /vendor/diffusers && \
    git fetch origin && \
    git checkout 01de02e8b4f2cc91df4f3e91cb6535ebcbeb490c

RUN uv sync --no-dev --python 3.13

# ── SageAttention (optional CUDA attention speedup) ───────────
# Already in uv.lock as a pure-Python wheel (sageattention 1.0.6).
# The C++/CUDA kernels compile lazily at runtime via torch.cpp_extension.
# This separate install step ensures the build tools are available if a
# source build is ever needed.
RUN uv pip install --no-build-isolation "sageattention>=1.0.0" || true

# ── Runtime environment ──────────────────────────────────────
ENV LTX_APP_DATA_DIR=/data \
    LTX_PORT=8000 \
    LTX_AUTH_TOKEN="" \
    LTX_ADMIN_TOKEN="" \
    LTX_FORCE_API_GENERATIONS="" \
    LTX_API_KEY="" \
    PYTHONUNBUFFERED=1 \
    TORCH_CUDA_ALLOC_CONF=expandable_segments:True \
    PYTHONPATH=/app/backend

# Data directories (models ~100 GB, outputs, uploads for remote API)
RUN mkdir -p /data/models /data/outputs /data/uploads

# ── Copy frontend build from Stage 1 ─────────────────────────
COPY --from=frontend-builder /app/dist-web /app/frontend

VOLUME ["/data"]
EXPOSE 8000

# ── Health check ─────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

# ── Entrypoint ───────────────────────────────────────────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
