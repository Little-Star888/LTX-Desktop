"""Z-Image ControlNet pipeline for img2img and inpaint."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal, cast

import torch
from PIL.Image import Image as PILImage
from PIL import Image as PILImageModule

from services.services_utils import ImagePipelineOutputLike, PILImageType, get_device_type


@dataclass(slots=True)
class _ZImageControlNetOutput:
    images: Sequence[PILImageType]


ImageToImageMode = Literal["img2img", "inpaint", "canny", "depth", "pose"]


class ZitControlNetPipeline:
    @staticmethod
    def create(
        model_path: str,
        controlnet_path: str,
        device: str | None = None,
    ) -> "ZitControlNetPipeline":
        return ZitControlNetPipeline(
            model_path=model_path,
            controlnet_path=controlnet_path,
            device=device,
        )

    def __init__(
        self,
        model_path: str,
        controlnet_path: str,
        device: str | None = None,
    ) -> None:
        self._device: str | None = None
        self._cpu_offload_active = False
        self._model_path = model_path
        self._controlnet_path = controlnet_path

        from diffusers import ZImageControlNetModel

        self._controlnet = ZImageControlNetModel.from_single_file(
            controlnet_path,
            torch_dtype=torch.bfloat16,
        )

        self._img2img_pipeline = None
        self._inpaint_pipeline = None
        self._controlnet_pipeline = None

        if device is not None:
            self.to(device)

    def _resolve_generator_device(self) -> str:
        if self._cpu_offload_active:
            return "cuda"
        if self._device is not None:
            return self._device
        return "cpu"

    def _ensure_pipeline_loaded(self, mode: ImageToImageMode) -> None:
        need_img2img = mode == "img2img"
        need_inpaint = mode == "inpaint"
        need_controlnet = mode in ("canny", "depth", "pose")
        
        if need_img2img and self._img2img_pipeline is None:
            from diffusers import ZImageImg2ImgPipeline
            self._img2img_pipeline = ZImageImg2ImgPipeline.from_pretrained(
                self._model_path,
                torch_dtype=torch.bfloat16,
            )
            if self._device:
                try:
                    self._img2img_pipeline.enable_sequential_cpu_offload(device=self._device)
                    self._cpu_offload_active = True
                except Exception:
                    try:
                        self._img2img_pipeline.enable_model_cpu_offload(device=self._device)
                        self._cpu_offload_active = True
                    except Exception:
                        self._img2img_pipeline.to(self._device)
        
        if need_inpaint and self._inpaint_pipeline is None:
            from diffusers import ZImageControlNetInpaintPipeline
            self._inpaint_pipeline = ZImageControlNetInpaintPipeline.from_pretrained(
                self._model_path,
                controlnet=self._controlnet,
                torch_dtype=torch.bfloat16,
            )
            if self._device:
                try:
                    self._inpaint_pipeline.enable_sequential_cpu_offload(device=self._device)
                    self._cpu_offload_active = True
                except Exception:
                    try:
                        self._inpaint_pipeline.enable_model_cpu_offload(device=self._device)
                        self._cpu_offload_active = True
                    except Exception:
                        self._inpaint_pipeline.to(self._device)
        
        if need_controlnet and self._controlnet_pipeline is None:
            from diffusers import ZImageControlNetPipeline
            self._controlnet_pipeline = ZImageControlNetPipeline.from_pretrained(
                self._model_path,
                controlnet=self._controlnet,
                torch_dtype=torch.bfloat16,
            )
            if self._device:
                try:
                    self._controlnet_pipeline.enable_sequential_cpu_offload(device=self._device)
                    self._cpu_offload_active = True
                except Exception:
                    try:
                        self._controlnet_pipeline.enable_model_cpu_offload(device=self._device)
                        self._cpu_offload_active = True
                    except Exception:
                        self._controlnet_pipeline.to(self._device)

    @staticmethod
    def _normalize_output(output: object) -> ImagePipelineOutputLike:
        images = getattr(output, "images", None)
        if not isinstance(images, Sequence):
            raise RuntimeError("Unexpected ZIT ControlNet pipeline output format: missing images sequence")

        images_list = cast(Sequence[object], images)
        validated_images: list[PILImageType] = []
        for image in images_list:
            if not isinstance(image, PILImage):
                raise RuntimeError("Unexpected ZIT ControlNet pipeline output format: images must be PIL.Image instances")
            validated_images.append(image)

        return _ZImageControlNetOutput(images=validated_images)

    def _prepare_control_image(
        self,
        image: PILImageType,
        mode: ImageToImageMode,
    ) -> PILImageType:
        if mode == "canny":
            import cv2
            import numpy as np

            np_image = np.array(image.convert("RGB"))
            canny_image = cv2.Canny(np_image, 100, 200)
            canny_image = canny_image[:, :, None]
            canny_image = np.concatenate([canny_image, canny_image, canny_image], axis=2)
            return PILImageModule.fromarray(canny_image)

        if mode == "depth":
            return image.convert("RGB")

        if mode == "pose":
            return image.convert("RGB")

        return image.convert("RGB")

    @torch.inference_mode()
    def generate_img2img(
        self,
        prompt: str,
        image: PILImageType,
        mask_image: PILImageType | None = None,
        mode: ImageToImageMode = "img2img",
        strength: float = 0.8,
        num_inference_steps: int = 20,
        guidance_scale: float = 7.0,
        controlnet_conditioning_scale: float = 0.8,
        seed: int = 0,
    ) -> ImagePipelineOutputLike:
        self._ensure_pipeline_loaded(mode)
        
        generator = torch.Generator(device=self._resolve_generator_device()).manual_seed(seed)

        width, height = image.size
        width = (width // 16) * 16
        height = (height // 16) * 16

        resized_image = image.convert("RGB").resize((width, height))

        if mode == "img2img":
            pipeline = cast(Any, self._img2img_pipeline)
            output = pipeline(
                prompt=prompt,
                image=resized_image,
                strength=strength,
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                generator=generator,
                output_type="pil",
                return_dict=True,
            )
        elif mode == "inpaint":
            pipeline = cast(Any, self._inpaint_pipeline)
            control_image = self._prepare_control_image(image, mode)

            if mask_image is not None:
                resized_mask = mask_image.convert("L").resize((width, height))
            else:
                raise ValueError("mask_image is required for inpaint mode")

            output = pipeline(
                prompt=prompt,
                image=resized_image,
                mask_image=resized_mask,
                control_image=control_image.resize((width, height)),
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                controlnet_conditioning_scale=controlnet_conditioning_scale,
                generator=generator,
                output_type="pil",
                return_dict=True,
            )
        else:
            pipeline = cast(Any, self._controlnet_pipeline)
            control_image = self._prepare_control_image(image, mode)
            output = pipeline(
                prompt=prompt,
                control_image=control_image.resize((width, height)),
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                controlnet_conditioning_scale=controlnet_conditioning_scale,
                generator=generator,
                output_type="pil",
                return_dict=True,
            )

        return self._normalize_output(output)

    def to(self, device: str) -> None:
        runtime_device = get_device_type(device)
        self._device = runtime_device
        
        if self._img2img_pipeline is not None:
            self._img2img_pipeline.to(runtime_device)
        if self._inpaint_pipeline is not None:
            self._inpaint_pipeline.to(runtime_device)
        if self._controlnet_pipeline is not None:
            self._controlnet_pipeline.to(runtime_device)
        
        self._cpu_offload_active = False
