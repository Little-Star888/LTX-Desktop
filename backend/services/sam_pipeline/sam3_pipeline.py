"""SAM 3.1 pipeline for automatic mask generation."""

from __future__ import annotations

from typing import Any, cast
import contextlib

import torch
from PIL.Image import Image as PILImage
from PIL import Image as PILImageModule

# 关键：这里依赖上面那个独立文件
from services.sam_pipeline.sam_pipeline import SamPipeline


class Sam3Pipeline:
    _model = None
    _processor = None

    @staticmethod
    def create(
        model_path: str,
        device: torch.device,
    ) -> "Sam3Pipeline":
        return Sam3Pipeline(
            model_path=model_path,
            device=device,
        )

    def __init__(
        self,
        model_path: str,
        device: torch.device,
    ) -> None:
        self._device = device
        self._model_path = model_path
        self._loaded = False
        # RTX 5090 配合 SageAttention 必须使用 bfloat16
        self._dtype = torch.bfloat16 if device.type == "cuda" else torch.float32

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        try:
            # 必须配合 git+https://github.com/facebookresearch/sam3.git@sam3.1 库
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor

            model = build_sam3_image_model(
                checkpoint_path=self._model_path,
            )
            
            # 只移动到设备，不转换 dtype，让 autocast 在推理时自动处理
            model = model.to(self._device)
            model.eval()

            try:
                self._processor = Sam3Processor(model, device=str(self._device))
            except TypeError:
                self._processor = Sam3Processor(model)
            
            self._loaded = True

        except ImportError as e:
            raise RuntimeError(
                "SAM 3 package not installed or outdated. "
                "Please run: uv pip install --reinstall git+https://github.com/facebookresearch/sam3.git@sam3.1"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Failed to load SAM 3.1 model: {e}") from e

    @torch.inference_mode()
    def generate_mask(
        self,
        image: PILImage,
        prompt: str,
        fallback_to_full_mask: bool = True,
    ) -> PILImage:
        """Generate a mask image from text prompt.
        
        Args:
            image: Input image
            prompt: Text prompt for SAM segmentation
            fallback_to_full_mask: If True, return full image mask when SAM fails to segment anything
        """
        self._ensure_loaded()
        import numpy as np

        autocast_ctx = torch.autocast(device_type=self._device.type, dtype=self._dtype) if self._device.type == "cuda" else contextlib.nullcontext()

        with autocast_ctx:
            inference_state = self._processor.set_image(image)
            output = self._processor.set_text_prompt(
                state=inference_state,
                prompt=prompt,
            )

        masks = output.get("masks", [])
        scores = output.get("scores",[])

        if isinstance(masks, torch.Tensor):
            if masks.numel() == 0:
                if fallback_to_full_mask:
                    return PILImageModule.new("L", image.size, 255)
                return PILImageModule.new("L", image.size, 0)
        elif not masks:
            if fallback_to_full_mask:
                return PILImageModule.new("L", image.size, 255)
            return PILImageModule.new("L", image.size, 0)

        if isinstance(scores, torch.Tensor):
            best_idx = int(scores.argmax().item())
        elif scores:
            best_idx = int(np.argmax(scores))
        else:
            best_idx = 0
        best_mask = masks[best_idx]

        if isinstance(best_mask, torch.Tensor):
            mask_np = best_mask.detach().float().cpu().numpy()
        else:
            mask_np = np.array(best_mask, dtype=np.float32)

        if mask_np.ndim == 3:
            mask_np = mask_np.squeeze()

        mask_np = (mask_np > 0.5).astype(np.uint8) * 255

        if np.count_nonzero(mask_np) == 0 and fallback_to_full_mask:
            return PILImageModule.new("L", image.size, 255)

        mask_image = PILImageModule.fromarray(mask_np, mode="L")
        if mask_image.size != image.size:
            mask_image = mask_image.resize(image.size, PILImageModule.NEAREST)

        return mask_image

    def generate_mask_from_point(self, image: PILImage, point_x: int, point_y: int) -> PILImage:
        self._ensure_loaded()
        import numpy as np
        autocast_ctx = torch.autocast(device_type=self._device.type, dtype=self._dtype) if self._device.type == "cuda" else contextlib.nullcontext()
        with autocast_ctx:
            inference_state = self._processor.set_image(image)
            output = self._processor.set_point_prompt(state=inference_state, points=[[point_x, point_y]])
        masks, scores = output.get("masks", []), output.get("scores", [])
        if isinstance(masks, torch.Tensor):
            if masks.numel() == 0:
                return PILImageModule.new("L", image.size, 0)
        elif not masks:
            return PILImageModule.new("L", image.size, 0)
        if isinstance(scores, torch.Tensor):
            best_idx = int(scores.argmax().item())
        elif scores:
            best_idx = int(np.argmax(scores))
        else:
            best_idx = 0
        best_mask = masks[best_idx]
        mask_np = best_mask.detach().float().cpu().numpy() if isinstance(best_mask, torch.Tensor) else np.array(best_mask, dtype=np.float32)
        if mask_np.ndim == 3:
            mask_np = mask_np.squeeze()
        mask_np = (mask_np > 0.5).astype(np.uint8) * 255
        mask_image = PILImageModule.fromarray(mask_np, mode="L")
        return mask_image.resize(image.size, PILImageModule.NEAREST)

    def generate_mask_from_box(self, image: PILImage, box_x1: int, box_y1: int, box_x2: int, box_y2: int) -> PILImage:
        self._ensure_loaded()
        import numpy as np
        autocast_ctx = torch.autocast(device_type=self._device.type, dtype=self._dtype) if self._device.type == "cuda" else contextlib.nullcontext()
        with autocast_ctx:
            inference_state = self._processor.set_image(image)
            output = self._processor.set_box_prompt(state=inference_state, boxes=[[box_x1, box_y1, box_x2, box_y2]])
        masks, scores = output.get("masks", []), output.get("scores", [])
        if isinstance(masks, torch.Tensor):
            if masks.numel() == 0:
                return PILImageModule.new("L", image.size, 0)
        elif not masks:
            return PILImageModule.new("L", image.size, 0)
        if isinstance(scores, torch.Tensor):
            best_idx = int(scores.argmax().item())
        elif scores:
            best_idx = int(np.argmax(scores))
        else:
            best_idx = 0
        best_mask = masks[best_idx]
        mask_np = best_mask.detach().float().cpu().numpy() if isinstance(best_mask, torch.Tensor) else np.array(best_mask, dtype=np.float32)
        if mask_np.ndim == 3:
            mask_np = mask_np.squeeze()
        mask_np = (mask_np > 0.5).astype(np.uint8) * 255
        mask_image = PILImageModule.fromarray(mask_np, mode="L")
        return mask_image.resize(image.size, PILImageModule.NEAREST)