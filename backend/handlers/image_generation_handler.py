"""Image generation orchestration handler."""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import TYPE_CHECKING

from _routes._errors import HTTPError
from api_types import GenerateImageRequest, GenerateImageResponse, ImageToImageRequest, ImageToImageResponse
from handlers.base import StateHandlerBase
from handlers.generation_handler import GenerationHandler
from handlers.pipelines_handler import PipelinesHandler
from runtime_config.model_download_specs import resolve_model_path
from services.interfaces import ZitAPIClient, ZitControlNetPipeline
from state.app_state_types import AppState

if TYPE_CHECKING:
    from runtime_config.runtime_config import RuntimeConfig

logger = logging.getLogger(__name__)


class ImageGenerationHandler(StateHandlerBase):
    def __init__(
        self,
        state: AppState,
        lock: RLock,
        generation_handler: GenerationHandler,
        pipelines_handler: PipelinesHandler,
        config: RuntimeConfig,
        zit_api_client: ZitAPIClient,
    ) -> None:
        super().__init__(state, lock, config)
        self._generation = generation_handler
        self._pipelines = pipelines_handler
        self._zit_api_client = zit_api_client

    def generate(self, req: GenerateImageRequest) -> GenerateImageResponse:
        if self._generation.is_generation_running():
            raise HTTPError(409, "Generation already in progress")

        width = (req.width // 16) * 16
        height = (req.height // 16) * 16
        num_images = max(1, min(12, req.numImages))

        generation_id = uuid.uuid4().hex[:8]
        settings = self.state.app_settings.model_copy(deep=True)
        if settings.seed_locked:
            seed = settings.locked_seed
            logger.info("Using locked seed for image: %s", seed)
        else:
            seed = int(time.time()) % 2147483647

        if self.config.force_api_generations:
            return self._generate_via_api(
                prompt=req.prompt,
                width=width,
                height=height,
                num_inference_steps=req.numSteps,
                seed=seed,
                num_images=num_images,
            )

        try:
            self._pipelines.load_zit_to_gpu()
            self._generation.start_generation(generation_id)
            output_paths = self.generate_image(
                prompt=req.prompt,
                width=width,
                height=height,
                num_inference_steps=req.numSteps,
                seed=seed,
                num_images=num_images,
            )
            self._generation.complete_generation(output_paths)
            return GenerateImageResponse(status="complete", image_paths=output_paths)
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                logger.info("Image generation cancelled by user")
                return GenerateImageResponse(status="cancelled")
            raise HTTPError(500, str(e)) from e

    def generate_img2img(self, req: ImageToImageRequest) -> ImageToImageResponse:
        if self._generation.is_generation_running():
            raise HTTPError(409, "Generation already in progress")

        image_path = Path(req.image_path)
        if not image_path.exists():
            raise HTTPError(400, f"Image file not found: {req.image_path}")

        mask_path: Path | None = None
        if req.mask_path:
            mask_path = Path(req.mask_path)
            if not mask_path.exists():
                raise HTTPError(400, f"Mask file not found: {req.mask_path}")

        controlnet_path = resolve_model_path(self.models_dir, self.config.model_download_specs, "zit_controlnet")
        if not controlnet_path.exists():
            raise HTTPError(400, "ControlNet model not downloaded. Please download it from Model Status menu.")

        generation_id = uuid.uuid4().hex[:8]
        settings = self.state.app_settings.model_copy(deep=True)
        if req.seed is not None:
            seed = req.seed
        elif settings.seed_locked:
            seed = settings.locked_seed
        else:
            seed = int(time.time()) % 2147483647

        try:
            self._generation.start_api_generation(generation_id)
            self._generation.update_progress("loading_model", 5, 0, req.num_images)

            self._pipelines.force_unload_gpu_pipeline()
            
            import gc
            import torch
            gc.collect()
            torch.cuda.empty_cache()
            
            zit_path = resolve_model_path(self.models_dir, self.config.model_download_specs, "zit")
            controlnet_pipeline = ZitControlNetPipeline.create(
                model_path=str(zit_path),
                controlnet_path=str(controlnet_path),
                device=self.config.device,
            )

            self._generation.update_progress("inference", 15, 0, req.num_images)

            from PIL import Image as PILImage

            input_image = PILImage.open(image_path).convert("RGB")
            mask_image = PILImage.open(mask_path).convert("L") if mask_path else None

            outputs: list[str] = []
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            for i in range(req.num_images):
                if self._generation.is_generation_cancelled():
                    raise RuntimeError("Generation was cancelled")

                progress = 15 + int((i / req.num_images) * 70)
                self._generation.update_progress("inference", progress, i, req.num_images)

                result = controlnet_pipeline.generate_img2img(
                    prompt=req.prompt,
                    image=input_image,
                    mask_image=mask_image,
                    mode=req.mode,
                    strength=req.strength,
                    num_inference_steps=req.num_inference_steps,
                    guidance_scale=req.guidance_scale,
                    controlnet_conditioning_scale=req.controlnet_conditioning_scale,
                    seed=seed + i,
                )

                output_path = self.config.outputs_dir / f"img2img_{timestamp}_{uuid.uuid4().hex[:8]}.png"
                result.images[0].save(str(output_path))
                outputs.append(str(output_path))

            del controlnet_pipeline
            gc.collect()
            torch.cuda.empty_cache()

            if self._generation.is_generation_cancelled():
                raise RuntimeError("Generation was cancelled")

            self._generation.update_progress("complete", 100, req.num_images, req.num_images)
            self._generation.complete_generation(outputs)
            return ImageToImageResponse(status="complete", image_paths=outputs)

        except HTTPError:
            self._generation.fail_generation("Image-to-image generation failed")
            raise
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                logger.info("Image-to-image generation cancelled by user")
                return ImageToImageResponse(status="cancelled")
            raise HTTPError(500, str(e)) from e

    def generate_image(
        self,
        prompt: str,
        width: int,
        height: int,
        num_inference_steps: int,
        seed: int | None,
        num_images: int,
    ) -> list[str]:
        if self._generation.is_generation_cancelled():
            raise RuntimeError("Generation was cancelled")

        self._generation.update_progress("loading_model", 5, 0, num_images)
        zit = self._pipelines.load_zit_to_gpu()
        self._generation.update_progress("inference", 15, 0, num_images)

        if seed is None:
            seed = int(time.time()) % 2147483647

        outputs: list[str] = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for i in range(num_images):
            if self._generation.is_generation_cancelled():
                raise RuntimeError("Generation was cancelled")

            result = zit.generate(
                prompt=prompt,
                height=height,
                width=width,
                guidance_scale=0.0,
                num_inference_steps=num_inference_steps,
                seed=seed + i,
            )

            output_path = self.config.outputs_dir / f"zit_image_{timestamp}_{uuid.uuid4().hex[:8]}.png"
            result.images[0].save(str(output_path))
            outputs.append(str(output_path))

        if self._generation.is_generation_cancelled():
            raise RuntimeError("Generation was cancelled")

        self._generation.update_progress("complete", 100, num_images, num_images)
        return outputs

    def _generate_via_api(
        self,
        *,
        prompt: str,
        width: int,
        height: int,
        num_inference_steps: int,
        seed: int,
        num_images: int,
    ) -> GenerateImageResponse:
        generation_id = uuid.uuid4().hex[:8]
        output_paths: list[Path] = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        settings = self.state.app_settings.model_copy(deep=True)

        try:
            self._generation.start_api_generation(generation_id)
            self._generation.update_progress("validating_request", 5, None, None)

            if not settings.fal_api_key.strip():
                raise HTTPError(500, "FAL_API_KEY_NOT_CONFIGURED")

            for idx in range(num_images):
                if self._generation.is_generation_cancelled():
                    raise RuntimeError("Generation was cancelled")

                inference_progress = 15 + int((idx / num_images) * 60)
                self._generation.update_progress("inference", inference_progress, None, None)
                image_bytes = self._zit_api_client.generate_text_to_image(
                    api_key=settings.fal_api_key,
                    prompt=prompt,
                    width=width,
                    height=height,
                    seed=seed + idx,
                    num_inference_steps=num_inference_steps,
                )

                if self._generation.is_generation_cancelled():
                    raise RuntimeError("Generation was cancelled")

                download_progress = 75 + int(((idx + 1) / num_images) * 20)
                self._generation.update_progress("downloading_output", download_progress, None, None)

                output_path = self.config.outputs_dir / f"zit_api_image_{timestamp}_{uuid.uuid4().hex[:8]}.png"
                output_path.write_bytes(image_bytes)
                output_paths.append(output_path)

            self._generation.update_progress("complete", 100, None, None)
            self._generation.complete_generation([str(path) for path in output_paths])
            return GenerateImageResponse(status="complete", image_paths=[str(path) for path in output_paths])
        except HTTPError as e:
            self._generation.fail_generation(e.detail)
            raise
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                for path in output_paths:
                    path.unlink(missing_ok=True)
                logger.info("Image generation cancelled by user")
                return GenerateImageResponse(status="cancelled")
            raise HTTPError(500, str(e)) from e
