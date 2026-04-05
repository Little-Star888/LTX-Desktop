"""Keyword extraction service using lightweight LLM."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = logging.getLogger(__name__)


CHINESE_TO_ENGLISH = {
    "衣服": "clothes",
    "裙子": "dress",
    "裤子": "pants",
    "上衣": "shirt",
    "头发": "hair",
    "脸": "face",
    "眼睛": "eyes",
    "嘴巴": "mouth",
    "鼻子": "nose",
    "耳朵": "ears",
    "手": "hand",
    "脚": "foot",
    "背景": "background",
    "天空": "sky",
    "草地": "grass",
    "树木": "trees",
    "房子": "house",
    "汽车": "car",
    "自行车": "bicycle",
    "人物": "person",
    "男人": "man",
    "女人": "woman",
    "小孩": "child",
    "动物": "animal",
    "猫": "cat",
    "狗": "dog",
    "鸟": "bird",
    "花": "flower",
    "水": "water",
    "山": "mountain",
    "海": "sea",
    "河": "river",
    "路": "road",
    "建筑": "building",
    "窗户": "window",
    "门": "door",
    "桌子": "table",
    "椅子": "chair",
    "床": "bed",
    "灯": "lamp",
    "书": "book",
    "手机": "phone",
    "电脑": "computer",
    "帽子": "hat",
    "鞋子": "shoes",
    "眼镜": "glasses",
    "手表": "watch",
    "包": "bag",
    "伞": "umbrella",
}


def contains_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


class KeywordExtractor:
    _instance: Optional["KeywordExtractor"] = None
    _model = None
    _tokenizer = None

    EXTRACTION_PROMPT = """You are a keyword extraction assistant. Extract the main object/subject from the image editing request. Output ONLY a single English word representing the object. Do not output anything else.

Examples:
Request: "把裙子改成红色"
Output: dress

Request: "Change the background to a beach"
Output: background

Request: "给人物添加帽子"
Output: person

Request: "把头发染成金色"
Output: hair

Request: "Replace the car with a bicycle"
Output: car

Request: "Make the sky more blue"
Output: sky

Request: "修改衣服颜色"
Output: clothes

Request: "{prompt}"
Output:"""

    @classmethod
    def get_instance(
        cls,
        device: str = "cuda",
        model_path: Optional[Path] = None,
    ) -> "KeywordExtractor":
        if cls._instance is None:
            cls._instance = cls(device=device, model_path=model_path)
        return cls._instance

    def __init__(
        self,
        model_name: str = "Qwen/Qwen3-0.6B",
        device: str = "cuda",
        model_path: Optional[Path] = None,
    ):
        self._model_name = model_name
        self._model_path = model_path
        self._device = device
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        try:
            if self._model_path and self._model_path.exists():
                logger.info(f"Loading keyword extraction model from local path: {self._model_path}")
                model_source = str(self._model_path)
            else:
                logger.info(f"Loading keyword extraction model from Hugging Face: {self._model_name}")
                model_source = self._model_name
            
            self._tokenizer = AutoTokenizer.from_pretrained(
                model_source,
                trust_remote_code=True,
            )
            
            self._model = AutoModelForCausalLM.from_pretrained(
                model_source,
                torch_dtype=torch.bfloat16 if self._device == "cuda" else torch.float32,
                device_map=self._device,
                trust_remote_code=True,
            )
            self._model.eval()
            self._loaded = True
            logger.info("Keyword extraction model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load keyword extraction model: {e}")
            raise RuntimeError(f"Failed to load keyword extraction model: {e}") from e

    @torch.inference_mode()
    def extract_keyword(self, prompt: str) -> str:
        """Extract the main object keyword from an image editing prompt.
        
        Args:
            prompt: The image editing prompt (e.g., "把裙子改成红色")
            
        Returns:
            The extracted keyword in English (e.g., "dress")
        """
        self._ensure_loaded()

        full_prompt = self.EXTRACTION_PROMPT.format(prompt=prompt)
        
        # Use Qwen3 chat template with thinking disabled
        messages = [{"role": "user", "content": full_prompt}]
        text = self._tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False
        )
        
        inputs = self._tokenizer(text, return_tensors="pt").to(self._device)
        
        outputs = self._model.generate(
            **inputs,
            max_new_tokens=20,
            do_sample=True,
            temperature=0.7,
            top_p=0.8,
            pad_token_id=self._tokenizer.eos_token_id,
        )
        
        generated_text = self._tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1]:],
            skip_special_tokens=True,
        ).strip()
        
        generated_text = generated_text.split("\n")[0].strip()
        generated_text = generated_text.split(".")[0].strip()
        
        if contains_chinese(generated_text):
            if generated_text in CHINESE_TO_ENGLISH:
                translated = CHINESE_TO_ENGLISH[generated_text]
                logger.info(f"Translated Chinese keyword '{generated_text}' to English '{translated}'")
                generated_text = translated
            else:
                translated = self._translate_to_english(generated_text)
                if translated:
                    logger.info(f"Translated Chinese keyword '{generated_text}' to English '{translated}' via model")
                    generated_text = translated
                else:
                    logger.warning(f"Keyword extraction returned Chinese '{generated_text}', translation failed")
        
        if not generated_text or len(generated_text) > 30:
            logger.warning(f"Keyword extraction may have failed, got: '{generated_text}'")
            return prompt
        
        logger.info(f"Extracted keyword '{generated_text}' from prompt '{prompt}'")
        return generated_text

    def _translate_to_english(self, chinese_text: str) -> Optional[str]:
        """Translate Chinese text to English using the same model."""
        translate_prompt = f"""Translate the following Chinese word to English. Output ONLY the English word, nothing else.

Chinese: {chinese_text}
English:"""
        
        messages = [{"role": "user", "content": translate_prompt}]
        text = self._tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False
        )
        
        inputs = self._tokenizer(text, return_tensors="pt").to(self._device)
        
        outputs = self._model.generate(
            **inputs,
            max_new_tokens=20,
            do_sample=False,
            temperature=0.3,
            top_p=0.9,
            pad_token_id=self._tokenizer.eos_token_id,
        )
        
        translated = self._tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1]:],
            skip_special_tokens=True,
        ).strip()
        
        translated = translated.split("\n")[0].strip()
        translated = translated.split(" ")[0].strip()
        
        if contains_chinese(translated):
            return None
        
        return translated if translated else None

    def unload(self) -> None:
        """Unload the model to free memory."""
        if self._model is not None:
            del self._model
            self._model = None
        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None
        self._loaded = False
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        KeywordExtractor._instance = None
        logger.info("Keyword extraction model unloaded")
