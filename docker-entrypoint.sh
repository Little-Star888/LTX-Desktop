#!/usr/bin/env bash
set -euo pipefail

# ────────────────────────────────────────────────────────────
# LTX-2 Video Generation — Docker Entrypoint
# ────────────────────────────────────────────────────────────

# Fix glibc malloc arena allocator memory fragmentation
# Forces allocations >64KB to use mmap() which returns memory to OS immediately
export MALLOC_MMAP_THRESHOLD_=65536
export MALLOC_TRIM_THRESHOLD_=65536

echo "═══════════════════════════════════════════════════════"
echo " LTX-2 Video Generation Server (Docker)"
echo "═══════════════════════════════════════════════════════"

# Ensure data directories exist (important when volume is mounted)
mkdir -p "${LTX_APP_DATA_DIR}/models"
mkdir -p "${LTX_APP_DATA_DIR}/outputs"
mkdir -p "${LTX_APP_DATA_DIR}/uploads"

# ── Determine and log the runtime mode ──────────────────────
if [ "${LTX_FORCE_API_GENERATIONS:-}" = "true" ]; then
    echo ""
    echo "  Mode: API-only (LTX_FORCE_API_GENERATIONS=true)"
    echo "  Note: Video generation will use the LTX cloud API."
    echo "        Set LTX_API_KEY for text-to-video / image-to-video."
    echo ""
elif command -v nvidia-smi &>/dev/null 2>&1; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "unknown")
    GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null || echo "unknown")
    echo ""
    echo "  Mode: Local generation (GPU detected)"
    echo "  GPU:  ${GPU_NAME}"
    echo "  VRAM: ${GPU_MEM}"
    echo "  Note: ≥32 GB VRAM required for local generation."
    echo "        Lower VRAM will auto-fallback to API mode."
    echo ""
else
    echo ""
    echo "  Mode: No NVIDIA GPU detected in this container."
    echo "  The server will auto-detect at startup and likely"
    echo "  fall back to API-only mode."
    echo "  To force: set LTX_FORCE_API_GENERATIONS=true"
    echo ""
fi

echo "  Data dir:  ${LTX_APP_DATA_DIR}"
echo "  Models:    ${LTX_APP_DATA_DIR}/models"
echo "  Outputs:   ${LTX_APP_DATA_DIR}/outputs"
echo "  Uploads:   ${LTX_APP_DATA_DIR}/uploads"
echo "  Port:      ${LTX_PORT:-8000}"
echo ""

# ── Start FastAPI via uvicorn ───────────────────────────────
# WORKDIR is /app/backend (set in Dockerfile).
# `uv run` activates the project venv automatically.
# --host 0.0.0.0 makes the server reachable from outside the container.
# The ltx2_server:app module-level code handles CUDA detection,
# model warmup, and app creation. We skip its __main__ block
# (which binds to 127.0.0.1) by importing as a module.
exec uv run uvicorn ltx2_server:app \
    --host 0.0.0.0 \
    --port "${LTX_PORT:-8000}" \
    --log-level info \
    --access-log
