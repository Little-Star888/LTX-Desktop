"""Route handlers for image preprocessing."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from _routes._errors import HTTPError
from runtime_config.model_download_specs import resolve_model_path
from state import get_state_service
from app_handler import AppHandler

router = APIRouter(prefix="/api", tags=["image"])

PreprocessMode = Literal["canny", "depth", "pose"]


class PreprocessImageRequest(BaseModel):
    image_path: str
    mode: PreprocessMode


class PreprocessImageResponse(BaseModel):
    status: str
    preprocessed_path: str


@router.post("/preprocess-image", response_model=PreprocessImageResponse)
def route_preprocess_image(
    req: PreprocessImageRequest,
    handler: AppHandler = Depends(get_state_service),
) -> PreprocessImageResponse:
    """POST /api/preprocess-image - Preprocess image for ControlNet modes."""
    image_path = Path(req.image_path)
    if not image_path.exists():
        raise HTTPError(400, f"Image file not found: {req.image_path}")

    config = handler.config
    models_dir = handler.image_generation.models_dir

    if req.mode == "depth":
        depth_model_path = resolve_model_path(models_dir, config.model_download_specs, "depth_processor")
        if not depth_model_path.exists():
            raise HTTPError(
                400,
                "Depth processor model not downloaded. Please download 'depth_processor' model from Model Status menu."
            )
    elif req.mode == "pose":
        pose_model_path = resolve_model_path(models_dir, config.model_download_specs, "pose_processor")
        person_detector_path = resolve_model_path(models_dir, config.model_download_specs, "person_detector")
        if not pose_model_path.exists() or not person_detector_path.exists():
            raise HTTPError(
                400,
                "Pose processor models not downloaded. Please download 'pose_processor' and 'person_detector' models from Model Status menu."
            )

    import torch
    from PIL import Image as PILImage
    import numpy as np
    import cv2
    import uuid
    from datetime import datetime

    input_image = PILImage.open(image_path).convert("RGB")
    width, height = input_image.size
    width = (width // 16) * 16
    height = (height // 16) * 16
    resized_image = input_image.resize((width, height))

    if req.mode == "canny":
        np_image = np.array(resized_image)
        canny_image = cv2.Canny(np_image, 100, 200)
        canny_image = canny_image[:, :, None]
        canny_image = np.concatenate([canny_image, canny_image, canny_image], axis=2)
        result_image = PILImage.fromarray(canny_image)

    elif req.mode == "depth":
        depth_model_path = resolve_model_path(models_dir, config.model_download_specs, "depth_processor")
        
        from transformers import DPTForDepthEstimation, DPTImageProcessor
        
        device = config.device
        dtype = torch.float16 if device == "cuda" else torch.float32
        
        processor = DPTImageProcessor.from_pretrained(str(depth_model_path))
        model = DPTForDepthEstimation.from_pretrained(
            str(depth_model_path),
            torch_dtype=dtype,
            device_map=device,
        )
        model.eval()
        
        inputs = processor(images=resized_image, return_tensors="pt")
        inputs = {k: v.to(device=device, dtype=dtype) for k, v in inputs.items()}
        
        with torch.no_grad():
            predicted_depth = model(**inputs).predicted_depth
        
        depth = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=(height, width),
            mode="bicubic",
            align_corners=False,
        )[0, 0]
        
        depth_np = depth.detach().float().cpu().numpy()
        min_depth = float(depth_np.min())
        max_depth = float(depth_np.max())
        if max_depth - min_depth <= 1e-6:
            depth_uint8 = np.zeros((height, width), dtype=np.uint8)
        else:
            normalized = (depth_np - min_depth) / (max_depth - min_depth)
            depth_uint8 = np.clip(normalized * 255.0, 0.0, 255.0).astype(np.uint8)
        
        colored = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_INFERNO)
        result_image = PILImage.fromarray(cv2.cvtColor(colored, cv2.COLOR_BGR2RGB))
        
        del model
        del processor
        torch.cuda.empty_cache()

    elif req.mode == "pose":
        pose_model_path = resolve_model_path(models_dir, config.model_download_specs, "pose_processor")
        person_detector_path = resolve_model_path(models_dir, config.model_download_specs, "person_detector")
        
        from services.pose_processor_pipeline import DWPosePipeline
        
        device = torch.device(config.device)
        pose_pipeline = DWPosePipeline.create(
            pose_model_path=str(pose_model_path),
            person_detector_model_path=str(person_detector_path),
            device=device,
        )
        
        np_image = np.array(resized_image)
        np_image_bgr = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
        
        pose_result = pose_pipeline.apply(np_image_bgr)
        
        if pose_result.shape[2] == 3:
            pose_rgb = cv2.cvtColor(pose_result, cv2.COLOR_BGR2RGB)
        else:
            pose_rgb = pose_result
        
        result_image = PILImage.fromarray(pose_rgb)
        
        del pose_pipeline
        torch.cuda.empty_cache()
    else:
        raise HTTPError(400, f"Unknown preprocess mode: {req.mode}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"preprocess_{req.mode}_{timestamp}_{uuid.uuid4().hex[:8]}.png"
    output_path = config.outputs_dir / output_filename
    result_image.save(str(output_path))

    return PreprocessImageResponse(
        status="complete",
        preprocessed_path=str(output_path),
    )
