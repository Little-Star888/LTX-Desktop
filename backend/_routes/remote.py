"""Remote upload + download routes for headless/scripted usage.

Allows uploading images and audio via multipart, triggering generation,
and downloading the resulting video files — all over HTTP.

Security:
- File paths are sanitized (no path traversal).
- imagePath/audioPath references are validated to live inside the uploads dir.
- All endpoints are protected by the existing LTX_AUTH_TOKEN middleware.
"""

from __future__ import annotations

import re
import shutil
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from api_types import GenerateVideoRequest
from state import get_state_service
from app_handler import AppHandler

router = APIRouter(prefix="/api/remote", tags=["remote"])

_UPLOADS_DIR_NAME = "uploads"


def _get_uploads_dir(handler: AppHandler) -> Path:
    uploads_dir = handler.config.outputs_dir.parent / _UPLOADS_DIR_NAME
    uploads_dir.mkdir(parents=True, exist_ok=True)
    return uploads_dir


def _safe_filename(original: str) -> str:
    name = re.sub(r"[^\w.\-]", "_", original)
    if not name or name.startswith("."):
        name = f"file_{int(time.time())}"
    return name


def _validate_filename(filename: str) -> None:
    if not filename or ".." in filename or filename.startswith("/"):
        raise HTTPException(400, "Invalid filename")


def _resolve_safe_path(raw: str, allowed_dir: Path) -> Path:
    """Resolve a user-supplied path and verify it stays inside allowed_dir."""
    resolved = Path(raw).resolve()
    if not str(resolved).startswith(str(allowed_dir.resolve())):
        raise HTTPException(400, "Path is outside the allowed directory")
    if not resolved.is_file():
        raise HTTPException(400, "File not found")
    return resolved


# ──────────────────────────────────────────────
# Upload endpoints
# ──────────────────────────────────────────────


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    handler: AppHandler = Depends(get_state_service),
):
    """Upload an image file.  Returns a ``file_id`` (absolute path) to pass
    as ``imagePath`` in the generate endpoint."""
    _validate_filename(file.filename or "")
    uploads_dir = _get_uploads_dir(handler)

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 50 MB)")

    safe_name = _safe_filename(file.filename or "image.png")
    dest = uploads_dir / safe_name
    dest.write_bytes(content)

    return {"file_id": str(dest), "filename": safe_name, "size": len(content)}


@router.post("/upload-audio")
async def upload_audio(
    file: UploadFile = File(...),
    handler: AppHandler = Depends(get_state_service),
):
    """Upload an audio file.  Returns a ``file_id`` (absolute path) to pass
    as ``audioPath`` in the generate endpoint."""
    _validate_filename(file.filename or "")
    uploads_dir = _get_uploads_dir(handler)

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(400, "Audio too large (max 100 MB)")

    safe_name = _safe_filename(file.filename or "audio.wav")
    dest = uploads_dir / safe_name
    dest.write_bytes(content)

    return {"file_id": str(dest), "filename": safe_name, "size": len(content)}


@router.post("/upload-video")
async def upload_video(
    file: UploadFile = File(...),
    handler: AppHandler = Depends(get_state_service),
):
    """Upload a video file.  Returns a ``file_id`` (absolute path) to pass
    as video path in retake or IC-LoRA endpoints."""
    _validate_filename(file.filename or "")
    uploads_dir = _get_uploads_dir(handler)

    content = await file.read()
    if len(content) > 500 * 1024 * 1024:
        raise HTTPException(400, "Video too large (max 500 MB)")

    safe_name = _safe_filename(file.filename or "video.mp4")
    dest = uploads_dir / safe_name
    dest.write_bytes(content)

    return {"file_id": str(dest), "filename": safe_name, "size": len(content)}


# ──────────────────────────────────────────────
# All-in-one generate endpoint (multipart)
# ──────────────────────────────────────────────


@router.post("/generate")
async def remote_generate(
    prompt: str = Form(...),
    resolution: str = Form("768p"),
    model: str = Form("fast"),
    duration: str = Form("5"),
    fps: str = Form("24"),
    aspectRatio: str = Form("16:9"),
    cameraMotion: str = Form("none"),
    negativePrompt: str = Form(""),
    audio: str = Form("false"),
    # Direct upload fields
    image: UploadFile | None = File(None),
    audioFile: UploadFile | None = File(None),
    # Pre-uploaded file references
    imagePath: str | None = Form(None),
    audioPath: str | None = Form(None),
    handler: AppHandler = Depends(get_state_service),
):
    """Generate a video.  Accepts files either as direct uploads (``image``,
    ``audioFile``) or as previously uploaded ``file_id`` references
    (``imagePath``, ``audioPath``).

    Reuses the existing :class:`VideoGenerationHandler` internally — no
    business logic is duplicated.
    """
    uploads_dir = _get_uploads_dir(handler)

    # ── Image ──────────────────────────────────
    actual_image_path: str | None = None
    if image is not None:
        safe_name = _safe_filename(image.filename or "image.png")
        content = await image.read()
        if len(content) > 50 * 1024 * 1024:
            raise HTTPException(400, "Image too large (max 50 MB)")
        dest = uploads_dir / safe_name
        dest.write_bytes(content)
        actual_image_path = str(dest)
    elif imagePath:
        _resolve_safe_path(imagePath, uploads_dir)
        actual_image_path = imagePath

    # ── Audio ──────────────────────────────────
    actual_audio_path: str | None = None
    if audioFile is not None:
        safe_name = _safe_filename(audioFile.filename or "audio.wav")
        content = await audioFile.read()
        if len(content) > 100 * 1024 * 1024:
            raise HTTPException(400, "Audio too large (max 100 MB)")
        dest = uploads_dir / safe_name
        dest.write_bytes(content)
        actual_audio_path = str(dest)
    elif audioPath:
        _resolve_safe_path(audioPath, uploads_dir)
        actual_audio_path = audioPath

    # ── Delegate to existing handler ──────────
    req = GenerateVideoRequest(
        prompt=prompt,
        resolution=resolution,
        model=model,
        duration=duration,
        fps=fps,
        aspectRatio=aspectRatio,
        cameraMotion=cameraMotion,
        negativePrompt=negativePrompt,
        audio=audio,
        imagePath=actual_image_path,
        audioPath=actual_audio_path,
    )

    result = handler.video_generation.generate(req)

    payload = result.model_dump()
    if payload.get("video_path"):
        video_name = Path(payload["video_path"]).name
        payload["download_url"] = f"/api/remote/download/{video_name}"

    return payload


# ──────────────────────────────────────────────
# Listing & download endpoints
# ──────────────────────────────────────────────


@router.get("/videos")
async def list_videos(
    handler: AppHandler = Depends(get_state_service),
):
    """List all generated videos in the outputs directory."""
    outputs_dir = handler.config.outputs_dir
    videos: list[dict] = []
    if outputs_dir.exists():
        for f in sorted(outputs_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if f.is_file() and f.suffix == ".mp4":
                stat = f.stat()
                videos.append(
                    {
                        "filename": f.name,
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "download_url": f"/api/remote/download/{f.name}",
                    }
                )
    return {"videos": videos, "total": len(videos)}


@router.get("/download/{filename}")
async def download_video(
    filename: str,
    handler: AppHandler = Depends(get_state_service),
):
    """Download a generated video by filename."""
    _validate_filename(filename)
    video_path = handler.config.outputs_dir / filename
    if not video_path.is_file():
        raise HTTPException(404, "Video not found")
    return FileResponse(path=str(video_path), media_type="video/mp4", filename=filename)


@router.delete("/videos/{filename}")
async def delete_video(
    filename: str,
    handler: AppHandler = Depends(get_state_service),
):
    """Delete a generated video."""
    _validate_filename(filename)
    video_path = handler.config.outputs_dir / filename
    if not video_path.is_file():
        raise HTTPException(404, "Video not found")
    video_path.unlink()
    return {"status": "deleted", "filename": filename}


@router.post("/cleanup-uploads")
async def cleanup_uploads(
    handler: AppHandler = Depends(get_state_service),
):
    """Remove all files from the uploads directory."""
    uploads_dir = _get_uploads_dir(handler)
    count = 0
    for f in uploads_dir.iterdir():
        if f.is_file():
            f.unlink()
            count += 1
    return {"status": "cleaned", "deleted_files": count}
