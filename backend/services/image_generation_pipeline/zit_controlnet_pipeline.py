"""Z-Image ControlNet pipeline for img2img and inpaint."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal, cast

import numpy as np
import torch
from PIL.Image import Image as PILImage
from PIL import Image as PILImageModule

from services.services_utils import ImagePipelineOutputLike, PILImageType, get_device_type


@dataclass(slots=True)
class _ZImageControlNetOutput:
    images: Sequence[PILImageType]


ImageToImageMode = Literal["img2img", "inpaint", "canny", "depth", "pose", "canny_img2img", "depth_img2img", "pose_img2img"]


class ZitControlNetPipeline:
    _depth_estimator = None
    _depth_processor = None
    _pose_detector = None

    @staticmethod
    def create(
        model_path: str,
        controlnet_path: str,
        device: str | None = None,
        depth_model_path: str | None = None,
        pose_model_path: str | None = None,
        person_detector_model_path: str | None = None,
    ) -> "ZitControlNetPipeline":
        return ZitControlNetPipeline(
            model_path=model_path,
            controlnet_path=controlnet_path,
            device=device,
            depth_model_path=depth_model_path,
            pose_model_path=pose_model_path,
            person_detector_model_path=person_detector_model_path,
        )

    def __init__(
        self,
        model_path: str,
        controlnet_path: str,
        device: str | None = None,
        depth_model_path: str | None = None,
        pose_model_path: str | None = None,
        person_detector_model_path: str | None = None,
    ) -> None:
        self._device: str | None = None
        self._cpu_offload_active = False
        self._model_path = model_path
        self._controlnet_path = controlnet_path
        self._depth_model_path = depth_model_path
        self._pose_model_path = pose_model_path
        self._person_detector_model_path = person_detector_model_path

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
        need_inpaint = mode in ("inpaint", "canny_img2img", "depth_img2img", "pose_img2img")
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

    def _get_depth_estimator(self):
        if ZitControlNetPipeline._depth_estimator is None or ZitControlNetPipeline._depth_processor is None:
            from transformers import DPTForDepthEstimation, DPTImageProcessor
            
            if self._depth_model_path:
                model_path = self._depth_model_path
            else:
                model_path = "Intel/dpt-hybrid-midas"
            
            device = self._resolve_generator_device()
            dtype = torch.float16 if device == "cuda" else torch.float32
            
            ZitControlNetPipeline._depth_estimator = DPTForDepthEstimation.from_pretrained(
                model_path,
                torch_dtype=dtype,
                device_map=device,
            )
            ZitControlNetPipeline._depth_processor = DPTImageProcessor.from_pretrained(model_path)
        return ZitControlNetPipeline._depth_estimator, ZitControlNetPipeline._depth_processor

    def _get_pose_detector(self):
        if ZitControlNetPipeline._pose_detector is None:
            if self._pose_model_path and self._person_detector_model_path:
                from services.pose_processor_pipeline.dw_pose_pipeline import DWPosePipeline
                device = torch.device(self._resolve_generator_device())
                ZitControlNetPipeline._pose_detector = DWPosePipeline.create(
                    pose_model_path=self._pose_model_path,
                    person_detector_model_path=self._person_detector_model_path,
                    device=device,
                )
            else:
                raise RuntimeError(
                    "Pose processor models not downloaded. "
                    "Please download 'pose_processor' and 'person_detector' models from Model Status menu."
                )
        return ZitControlNetPipeline._pose_detector

    def _prepare_control_image(
        self,
        image: PILImageType,
        mode: ImageToImageMode,
        target_width: int,
        target_height: int,
    ) -> PILImageType:
        if mode == "canny":
            import cv2
            import numpy as np

            np_image = np.array(image.convert("RGB"))
            canny_image = cv2.Canny(np_image, 100, 200)
            canny_image = canny_image[:, :, None]
            canny_image = np.concatenate([canny_image, canny_image, canny_image], axis=2)
            return PILImageModule.fromarray(canny_image).resize((target_width, target_height))

        if mode == "depth":
            import cv2
            import numpy as np

            depth_estimator, depth_processor = self._get_depth_estimator()
            device = self._resolve_generator_device()
            dtype = torch.float16 if device == "cuda" else torch.float32
            
            inputs = depth_processor(images=image.convert("RGB"), return_tensors="pt")
            inputs = {k: v.to(device=device, dtype=dtype) for k, v in inputs.items()}
            
            with torch.no_grad():
                predicted_depth = depth_estimator(**inputs).predicted_depth
            
            depth = torch.nn.functional.interpolate(
                predicted_depth.unsqueeze(1),
                size=(target_height, target_width),
                mode="bicubic",
                align_corners=False,
            )[0, 0]
            
            depth_np = depth.detach().float().cpu().numpy()
            min_depth = float(depth_np.min())
            max_depth = float(depth_np.max())
            if max_depth - min_depth <= 1e-6:
                depth_uint8 = np.zeros((target_height, target_width), dtype=np.uint8)
            else:
                normalized = (depth_np - min_depth) / (max_depth - min_depth)
                depth_uint8 = np.clip(normalized * 255.0, 0.0, 255.0).astype(np.uint8)
            
            colored = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_INFERNO)
            return PILImageModule.fromarray(cv2.cvtColor(colored, cv2.COLOR_BGR2RGB))

        if mode == "pose":
            import cv2
            import numpy as np

            pose_detector = self._get_pose_detector()
            
            np_image = np.array(image.convert("RGB"))
            np_image_bgr = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
            
            if hasattr(pose_detector, 'apply'):
                pose_result = pose_detector.apply(np_image_bgr)
            else:
                pose_result = pose_detector(image)
            
            if isinstance(pose_result, np.ndarray):
                if pose_result.shape[2] == 3:
                    pose_rgb = cv2.cvtColor(pose_result, cv2.COLOR_BGR2RGB)
                else:
                    pose_rgb = pose_result
            else:
                pose_rgb = np.array(pose_result.convert("RGB"))
            
            return PILImageModule.fromarray(pose_rgb).resize((target_width, target_height))

        return image.convert("RGB").resize((target_width, target_height))

    @torch.inference_mode()
    def generate_img2img(
        self,
        prompt: str,
        image: PILImageType,
        mask_image: PILImageType | None = None,
        mode: ImageToImageMode = "img2img",
        strength: float = 0.9,
        num_inference_steps: int = 8,
        guidance_scale: float = 0.5,
        controlnet_conditioning_scale: float = 0.5,
        negative_prompt: str = "",
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
                negative_prompt=negative_prompt if negative_prompt else None,
                generator=generator,
                output_type="pil",
                return_dict=True,
            )
        elif mode == "inpaint":
            pipeline = cast(Any, self._inpaint_pipeline)
            control_image = self._prepare_control_image(image, mode, width, height)

            if mask_image is not None:
                resized_mask = mask_image.convert("L").resize((width, height))
            else:
                raise ValueError("mask_image is required for inpaint mode")

            output = pipeline(
                prompt=prompt,
                image=resized_image,
                mask_image=resized_mask,
                control_image=control_image,
                strength=strength,
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                controlnet_conditioning_scale=controlnet_conditioning_scale,
                negative_prompt=negative_prompt if negative_prompt else None,
                generator=generator,
                output_type="pil",
                return_dict=True,
            )
        elif mode in ("canny", "depth", "pose"):
            pipeline = cast(Any, self._controlnet_pipeline)
            control_image = self._prepare_control_image(image, mode, width, height)
            output = pipeline(
                prompt=prompt,
                control_image=control_image,
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                controlnet_conditioning_scale=controlnet_conditioning_scale,
                negative_prompt=negative_prompt if negative_prompt else None,
                generator=generator,
                output_type="pil",
                return_dict=True,
            )
        else:
            pipeline = cast(Any, self._inpaint_pipeline)
            control_mode = mode.replace("_img2img", "")
            control_image = self._prepare_control_image(image, control_mode, width, height)
            
            white_mask = PILImageModule.fromarray(np.ones((height, width), dtype=np.uint8) * 255)
            
            output = pipeline(
                prompt=prompt,
                image=resized_image,
                mask_image=white_mask,
                control_image=control_image,
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                controlnet_conditioning_scale=controlnet_conditioning_scale,
                negative_prompt=negative_prompt if negative_prompt else None,
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
