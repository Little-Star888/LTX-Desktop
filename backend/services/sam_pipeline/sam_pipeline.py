"""SAM pipeline protocol definitions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from PIL.Image import Image as PILImage

if TYPE_CHECKING:
    import torch


class SamPipeline(Protocol):
    @staticmethod
    def create(
        model_path: str,
        device: torch.device,
    ) -> "SamPipeline":
        ...

    def generate_mask(
        self,
        image: PILImage,
        prompt: str,
    ) -> PILImage:
        """Generate a mask image from text prompt.

        Args:
            image: Input PIL Image
            prompt: Text description of the object to segment (e.g., "red dress", "person")

        Returns:
            PIL Image with white pixels for the masked region, black elsewhere
        """
        ...
