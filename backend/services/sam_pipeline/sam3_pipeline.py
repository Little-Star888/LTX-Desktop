"""SAM 3.1 pipeline for automatic mask generation."""

from __future__ import annotations

from typing import Any, cast

import torch
from PIL.Image import Image as PILImage
from PIL import Image as PILImageModule

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

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        try:
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor

            dtype = torch.bfloat16 if self._device.type == "cuda" else torch.float32

            model = build_sam3_image_model(
                checkpoint_path=self._model_path,
                device=self._device,
                dtype=dtype,
            )
            self._processor = Sam3Processor(model)
            self._loaded = True

        except ImportError as e:
            raise RuntimeError(
                "SAM 3 package not installed. "
                "Please install it with: pip install git+https://github.com/facebookresearch/sam3.git"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Failed to load SAM 3.1 model: {e}") from e

    @torch.inference_mode()
    def generate_mask(
        self,
        image: PILImage,
        prompt: str,
    ) -> PILImage:
        """Generate a mask image from text prompt.

        Args:
            image: Input PIL Image
            prompt: Text description of the object to segment

        Returns:
            PIL Image with white pixels for the masked region, black elsewhere
        """
        self._ensure_loaded()

        import numpy as np

        inference_state = self._processor.set_image(image)

        output = self._processor.set_text_prompt(
            state=inference_state,
            prompt=prompt,
        )

        masks = output.get("masks", [])
        scores = output.get("scores", [])

        if not masks:
            return PILImageModule.new("L", image.size, 0)

        if scores:
            best_idx = int(np.argmax(scores))
            best_mask = masks[best_idx]
        else:
            best_mask = masks[0]

        if isinstance(best_mask, torch.Tensor):
            mask_np = best_mask.detach().cpu().numpy()
        else:
            mask_np = np.array(best_mask)

        if mask_np.dtype != np.uint8:
            mask_np = (mask_np * 255).astype(np.uint8)

        if mask_np.ndim == 3:
            mask_np = mask_np.squeeze()

        mask_image = PILImageModule.fromarray(mask_np, mode="L")

        if mask_image.size != image.size:
            mask_image = mask_image.resize(image.size, PILImageModule.NEAREST)

        return mask_image

    def generate_mask_from_point(
        self,
        image: PILImage,
        point_x: int,
        point_y: int,
    ) -> PILImage:
        """Generate a mask image from a point prompt.

        Args:
            image: Input PIL Image
            point_x: X coordinate of the point
            point_y: Y coordinate of the point

        Returns:
            PIL Image with white pixels for the masked region, black elsewhere
        """
        self._ensure_loaded()

        import numpy as np

        inference_state = self._processor.set_image(image)

        output = self._processor.set_point_prompt(
            state=inference_state,
            points=[[point_x, point_y]],
        )

        masks = output.get("masks", [])
        scores = output.get("scores", [])

        if not masks:
            return PILImageModule.new("L", image.size, 0)

        if scores:
            best_idx = int(np.argmax(scores))
            best_mask = masks[best_idx]
        else:
            best_mask = masks[0]

        if isinstance(best_mask, torch.Tensor):
            mask_np = best_mask.detach().cpu().numpy()
        else:
            mask_np = np.array(best_mask)

        if mask_np.dtype != np.uint8:
            mask_np = (mask_np * 255).astype(np.uint8)

        if mask_np.ndim == 3:
            mask_np = mask_np.squeeze()

        mask_image = PILImageModule.fromarray(mask_np, mode="L")

        if mask_image.size != image.size:
            mask_image = mask_image.resize(image.size, PILImageModule.NEAREST)

        return mask_image

    def generate_mask_from_box(
        self,
        image: PILImage,
        box_x1: int,
        box_y1: int,
        box_x2: int,
        box_y2: int,
    ) -> PILImage:
        """Generate a mask image from a bounding box prompt.

        Args:
            image: Input PIL Image
            box_x1: Top-left X coordinate
            box_y1: Top-left Y coordinate
            box_x2: Bottom-right X coordinate
            box_y2: Bottom-right Y coordinate

        Returns:
            PIL Image with white pixels for the masked region, black elsewhere
        """
        self._ensure_loaded()

        import numpy as np

        inference_state = self._processor.set_image(image)

        output = self._processor.set_box_prompt(
            state=inference_state,
            boxes=[[box_x1, box_y1, box_x2, box_y2]],
        )

        masks = output.get("masks", [])
        scores = output.get("scores", [])

        if not masks:
            return PILImageModule.new("L", image.size, 0)

        if scores:
            best_idx = int(np.argmax(scores))
            best_mask = masks[best_idx]
        else:
            best_mask = masks[0]

        if isinstance(best_mask, torch.Tensor):
            mask_np = best_mask.detach().cpu().numpy()
        else:
            mask_np = np.array(best_mask)

        if mask_np.dtype != np.uint8:
            mask_np = (mask_np * 255).astype(np.uint8)

        if mask_np.ndim == 3:
            mask_np = mask_np.squeeze()

        mask_image = PILImageModule.fromarray(mask_np, mode="L")

        if mask_image.size != image.size:
            mask_image = mask_image.resize(image.size, PILImageModule.NEAREST)

        return mask_image
