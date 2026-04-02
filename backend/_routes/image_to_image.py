"""Route handlers for /api/image-to-image."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api_types import ImageToImageRequest, ImageToImageResponse
from state import get_state_service
from app_handler import AppHandler

router = APIRouter(prefix="/api", tags=["image"])


@router.post("/image-to-image", response_model=ImageToImageResponse)
def route_image_to_image(
    req: ImageToImageRequest,
    handler: AppHandler = Depends(get_state_service),
) -> ImageToImageResponse:
    """POST /api/image-to-image - Generate image from image with ControlNet."""
    return handler.image_generation.generate_img2img(req)
