# LTX-Desktop API 接口详细文档

> 基于 `/home/bread/poker/LTX-Desktop/backend/_routes/` 目录下的路由定义
> 服务地址: `http://localhost:8000`

---

## 目录

- [1. 系统与健康检查](#1-系统与健康检查)
- [2. 模型管理](#2-模型管理)
- [3. 视频生成](#3-视频生成)
- [4. 图像生成](#4-图像生成)
  - [4.1 文生图](#41-文生图)
  - [4.2 图生图 (Image-to-Image)](#42-图生图-image-to-image)
- [5. 视频剪辑/重生成](#5-视频剪辑重生成)
- [6. IC-LoRA 控制生成](#6-ic-lora-控制生成)
- [7. 提示词建议](#7-提示词建议)
- [8. 文件管理 (Remote)](#8-文件管理-remote)
- [9. 设置管理](#9-设置管理)
- [10. 运行时策略](#10-运行时策略)

---

## 1. 系统与健康检查

### 1.1 健康检查

检查服务是否正常运行。

```bash
curl http://localhost:8000/health
```

**响应示例:**
```json
{
  "status": "ok",
  "models_loaded": false,
  "active_model": null,
  "gpu_info": {
    "name": "NVIDIA GeForce RTX 5090",
    "vram": 32768,
    "vramUsed": 0
  },
  "sage_attention": false,
  "models_status": [
    {"id": "fast", "name": "LTX-2 Fast (Distilled)", "loaded": false, "downloaded": false}
  ]
}
```

---

### 1.2 获取 GPU 信息

```bash
curl http://localhost:8000/api/gpu-info
```

**响应示例:**
```json
{
  "cuda_available": true,
  "mps_available": false,
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 5090",
  "vram_gb": 32,
  "gpu_info": {
    "name": "NVIDIA GeForce RTX 5090",
    "vram": 32768,
    "vramUsed": 0
  }
}
```

---

### 1.3 关闭服务

**注意:** 仅允许本地调用 (127.0.0.1/localhost)

```bash
curl -X POST http://localhost:8000/api/system/shutdown
```

---

## 2. 模型管理

### 2.1 获取模型列表

```bash
curl http://localhost:8000/api/models
```

**响应示例:**
```json
[
  {"id": "fast", "name": "Fast (Distilled)", "description": "8 steps + 2x upscaler"},
  {"id": "pro", "name": "Pro (Full)", "description": "20 steps + 2x upscaler"}
]
```

---

### 2.2 获取模型状态

```bash
curl http://localhost:8000/api/models/status
```

**响应示例:**
```json
{
  "models": [
    {
      "id": "checkpoint",
      "name": "ltx-2.3-22b-distilled.safetensors",
      "description": "Main transformer model",
      "downloaded": true,
      "size": 43000000000,
      "expected_size": 43000000000,
      "required": true,
      "is_folder": false
    }
  ],
  "all_downloaded": false,
  "total_size": 100900000000,
  "downloaded_size": 43000000000,
  "total_size_gb": 94.0,
  "downloaded_size_gb": 40.0,
  "models_path": "/data/models",
  "has_api_key": false,
  "text_encoder_status": {
    "downloaded": false,
    "size_bytes": 25000000000,
    "size_gb": 23.3,
    "expected_size_gb": 23.3
  },
  "use_local_text_encoder": false
}
```

---

### 2.3 获取必需模型列表

```bash
# 查看所有必需模型
curl http://localhost:8000/api/models/required-models

# 跳过 text_encoder (如果有 API Key)
curl "http://localhost:8000/api/models/required-models?skipTextEncoder=true"
```

**响应示例:**
```json
{
  "modelTypes": ["checkpoint", "upsampler", "zit"]
}
```

---

### 2.4 开始下载模型

**参数:** `modelTypes` - 模型类型数组

| 模型类型 | 说明 | 大小 |
|---------|------|------|
| `checkpoint` | 主模型 | 43 GB |
| `upsampler` | 2x 放大器 | 2 GB |
| `zit` | 图像生成 | 31 GB |
| `zit_controlnet` | ControlNet (图生图) | 2.5 GB |
| `text_encoder` | 文本编码器 | 25 GB |
| `distilled_lora` | LoRA (可选) | 400 MB |
| `ic_lora` | IC-LoRA (可选) | 654 MB |
| `depth_processor` | 深度处理 (可选) | 500 MB |
| `person_detector` | 人物检测 (可选) | 217 MB |
| `pose_processor` | 姿态处理 (可选) | 135 MB |

```bash
# 下载所有必需模型
curl -X POST http://localhost:8000/api/models/download \
  -H "Content-Type: application/json" \
  -d '{"modelTypes": ["checkpoint", "upsampler", "zit"]}'

# 下载所有模型
curl -X POST http://localhost:8000/api/models/download \
  -H "Content-Type: application/json" \
  -d '{"modelTypes": ["checkpoint", "upsampler", "zit", "zit_controlnet", "text_encoder", "distilled_lora", "ic_lora", "depth_processor", "person_detector", "pose_processor"]}'

# 下载单个模型
curl -X POST http://localhost:8000/api/models/download \
  -H "Content-Type: application/json" \
  -d '{"modelTypes": ["zit"]}'
```

**响应示例:**
```json
{
  "status": "started",
  "message": "Model download started",
  "sessionId": "abc123def456..."
}
```

---

### 2.5 查询下载进度

```bash
curl "http://localhost:8000/api/models/download/progress?sessionId=abc123def456..."
```

**响应示例:**
```json
{
  "status": "downloading",
  "current_downloading_file": "checkpoint",
  "current_file_progress": 45.5,
  "total_progress": 30.2,
  "total_downloaded_bytes": 31000000000,
  "expected_total_bytes": 103000000000,
  "completed_files": ["upsampler"],
  "all_files": ["checkpoint", "upsampler", "zit"],
  "error": null,
  "speed_bytes_per_sec": 52428800
}
```

**状态值:**
- `downloading` - 下载中
- `complete` - 下载完成
- `error` - 下载出错
- `cancelled` - 下载取消

---

### 2.6 下载文本编码器

```bash
curl -X POST http://localhost:8000/api/text-encoder/download
```

**响应示例:**
```json
{
  "status": "started",
  "message": "Text encoder download started",
  "sessionId": "xyz789..."
}
```

---

## 3. 视频生成

### 3.1 文本生视频

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a beautiful sunset over ocean waves, cinematic",
    "resolution": "720p",
    "model": "fast",
    "duration": "5",
    "fps": "24",
    "aspectRatio": "16:9",
    "cameraMotion": "dolly_in",
    "negativePrompt": "blurry, low quality",
    "audio": "false"
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt` | string | 必需 | 提示词 |
| `resolution` | string | "512p" | 分辨率: 540p, 720p, 1080p (不支持值会映射到 540p) |
| `model` | string | "fast" | 模型: fast (本地仅支持 fast) |
| `duration` | string | "2" | 时长 (秒): 受分辨率限制，见附录 C |
| `fps` | string | "24" | 帧率: 24, 25, 50 |
| `aspectRatio` | string | "16:9" | 宽高比: 16:9, 9:16 |
| `cameraMotion` | string | "none" | 相机运动: none, dolly_in, dolly_out, dolly_left, dolly_right, jib_up, jib_down, static, focus_shift |
| `negativePrompt` | string | "" | 负面提示词 |
| `audio` | string | "false" | 是否生成音频: true, false |
| `imagePath` | string | null | 图片路径 (图生视频) |
| `audioPath` | string | null | 音频路径 (音频生视频) |

**响应示例:**
```json
{
  "status": "success",
  "video_path": "/data/outputs/video_20240326_123456.mp4"
}
```

---

### 3.2 图生视频

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "camera moving forward slowly",
    "imagePath": "/home/bread/poker/LTX-Desktop/data/outputs/zit_image_20260327_020927_74aee54b.png",
    "resolution": "720p",
    "model": "fast",
    "duration": "5"
  }'
```

---

### 3.3 音频生视频

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "music visualization with abstract shapes",
    "audioPath": "/data/uploads/audio.wav",
    "audio": "true",
    "resolution": "720p",
    "duration": "5"
  }'
```

> **注意:** 音频生视频 (A2V) 使用不同的分辨率映射，详见附录 C。

---

### 3.4 查询生成进度

```bash
curl http://localhost:8000/api/generation/progress
```

**响应示例:**
```json
{
  "status": "running",
  "phase": "inference",
  "progress": 65,
  "currentStep": 13,
  "totalSteps": 20
}
```

---

### 3.5 取消生成

```bash
curl -X POST http://localhost:8000/api/generate/cancel
```

**响应示例:**
```json
{
  "status": "cancelled",
  "id": "generation-123"
}
```

---

## 4. 图像生成

### 4.1 文生图

```bash
curl -X POST http://localhost:8000/api/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a beautiful landscape with mountains and a lake",
    "width": 1024,
    "height": 1024,
    "numSteps": 4,
    "numImages": 1
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt` | string | 必需 | 提示词 |
| `width` | int | 1024 | 图片宽度 (会被对齐到 16 的倍数) |
| `height` | int | 1024 | 图片高度 (会被对齐到 16 的倍数) |
| `numSteps` | int | 4 | 推理步数 |
| `numImages` | int | 1 | 生成图片数量 (1-12) |

**响应示例:**
```json
{
  "status": "success",
  "image_paths": [
    "/data/outputs/image_20240326_123456.png"
  ]
}
```

---

### 4.2 图生图 (Image-to-Image)

使用 ControlNet 从图片生成新图片，支持多种模式。

**前置条件 - 需要下载的模型:**

| 模型 | 模式 | 大小 | 说明 |
|------|------|------|------|
| `zit` | 所有模式 | ~31GB | Z-Image-Turbo 基础模型 |
| `zit_controlnet` | inpaint/canny/depth/pose 及增强模式 | ~3.5GB | ControlNet Union 模型 |
| `depth_processor` | depth, depth_img2img | ~500MB | DPT-Hybrid MiDaS 深度估计模型 |
| `pose_processor` | pose, pose_img2img | ~135MB | DWPose 姿态检测模型 |
| `person_detector` | pose, pose_img2img | ~218MB | YOLOX 人体检测模型 |
| `sam` | inpaint (auto_mask) | ~3.5GB | SAM 3.1 自动蒙版生成模型 |

> **注意:** 模型可在应用的 "Model Status" 菜单中下载。使用 depth 或 pose 相关模式前，请确保已下载对应的预处理模型。使用 inpaint 模式的 auto_mask 功能前，请确保已下载 SAM 模型。

**模式说明:**

| 模式 | Pipeline | 效果 | 适用场景 |
|------|----------|------|---------|
| `img2img` | ZImageImg2ImgPipeline | 基础图生图，根据提示词修改原图 | 简单风格调整 |
| `inpaint` | ZImageControlNetInpaintPipeline | 局部重绘，仅修改蒙版区域 | 换衣服、替换物体 |
| `canny` | ZImageControlNetPipeline | **完全重绘**，只保留边缘结构 | 完全重制场景 |
| `depth` | ZImageControlNetPipeline | **完全重绘**，只保留深度结构 | 完全重制场景 |
| `pose` | ZImageControlNetPipeline | **完全重绘**，只保留人物姿态 | 把普通人变成钢铁侠 |
| `canny_img2img` | ZImageControlNetInpaintPipeline | **保留原图色彩** + 边缘控制 | 照片变油画风格 |
| `depth_img2img` | ZImageControlNetInpaintPipeline | **保留原图色彩** + 深度控制 | 场景风格转换 |
| `pose_img2img` | ZImageControlNetInpaintPipeline | **保留原图色彩** + 姿态控制 | 人物风格转换 |

> **技术原理详解:**
> 
> **API 参数:** 用户只需要传递原图路径 (`image_path`)，后端会自动进行预处理。不需要传递预处理后的图片路径。
> 
> **内部处理流程:**
> 
> | 模式类型 | 内部处理 | 传递给 Pipeline 的参数 |
> |---------|---------|---------------------|
> | `img2img` | 无预处理 | `image` (原图) |
> | `inpaint` | 预处理原图 | `image` + `mask_image` + `control_image` |
> | **标准模式** (`canny/depth/pose`) | 预处理原图 | **只传** `control_image` (预处理图) |
> | **增强模式** (`*_img2img`) | 预处理原图 + 生成全白 mask | `image` (原图) + `mask_image` (全白) + `control_image` (预处理图) |
> 
> **标准模式 vs 增强模式:**
> - **标准模式** (`canny/depth/pose`): 使用 `ZImageControlNetPipeline`，这是**纯文生图**管道。只传预处理后的控制图，原图的色彩、背景会完全丢失，AI 会根据提示词从零开始生成。适用于"完全重制"场景。
> - **增强模式** (`canny_img2img/depth_img2img/pose_img2img`): 使用 `ZImageControlNetInpaintPipeline` + 全白 mask 的"黑科技"方案。同时传入原图和预处理后的控制图，既能保留原图的色彩信息，又能用 ControlNet 控制结构。适用于"风格转换"场景。

#### 示例 1: 图生图 (img2img 模式) - 将照片转换为油画风格

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "oil painting style, artistic brushstrokes, masterpiece",
    "image_path": "/data/uploads/666.png",
    "mode": "img2img",
    "strength": 0.7,
    "num_inference_steps": 20,
    "guidance_scale": 7.0
  }'
```

#### 示例 2: 图生图 (img2img 模式) - 轻微风格调整

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "add sunset lighting, warm colors, golden hour",
    "image_path": "/data/uploads/666.png",
    "mode": "img2img",
    "strength": 0.3,
    "num_inference_steps": 20,
    "guidance_scale": 7.0
  }'
```

#### 示例 3: 局部重绘 (inpaint 模式) - 替换图片中的物体

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a cat sitting on the chair",
    "image_path": "/data/uploads/666.png",
    "mask_path": "/data/uploads/room_mask.png",
    "mode": "inpaint",
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "controlnet_conditioning_scale": 0.8
  }'
```

> **注意:** inpaint 模式需要提供蒙版图片 (mask_path)，蒙版中白色区域为需要重绘的部分。

#### 示例 3.1: 局部重绘 (inpaint 模式) - 使用 SAM 自动生成蒙版

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a red dress, elegant design",
    "image_path": "/data/uploads/person.png",
    "mode": "inpaint",
    "auto_mask": true,
    "mask_prompt": "dress",
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "controlnet_conditioning_scale": 0.8
  }'
```

> **注意:** 使用 `auto_mask: true` 时，SAM 会根据 `mask_prompt` 自动识别并分割对应区域。如果不提供 `mask_prompt`，则使用 `prompt` 作为分割依据。

#### 示例 4: 边缘检测标准模式 (canny) - 完全重绘保留边缘

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a futuristic cyberpunk cityscape at night, neon lights, rain",
    "image_path": "/data/uploads/666.png",
    "mode": "canny",
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "controlnet_conditioning_scale": 0.8
  }'
```

> **效果:** 原图的色彩、背景会完全丢失，AI 会根据提示词从零开始生成，只保留边缘结构。

#### 示例 5: 边缘检测增强模式 (canny_img2img) - 风格转换保留色彩

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "oil painting style, van gogh inspired, artistic brushstrokes",
    "image_path": "/data/uploads/portrait.png",
    "mode": "canny_img2img",
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "controlnet_conditioning_scale": 0.8
  }'
```

> **效果:** 保留原图的色彩和氛围，同时用边缘控制结构，生成油画风格。

#### 示例 6: 深度图标准模式 (depth) - 完全重绘保留空间结构

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a mystical forest with glowing mushrooms, fantasy art style",
    "image_path": "/data/uploads/666.png",
    "mode": "depth",
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "controlnet_conditioning_scale": 0.8
  }'
```

> **效果:** 原图的色彩、背景会完全丢失，AI 会根据提示词从零开始生成，只保留深度结构。

#### 示例 7: 深度图增强模式 (depth_img2img) - 场景风格转换

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "underwater scene style, blue tones, ocean atmosphere",
    "image_path": "/data/uploads/landscape.png",
    "mode": "depth_img2img",
    "num_inference_steps": 25,
    "guidance_scale": 7.5,
    "controlnet_conditioning_scale": 0.9
  }'
```

> **效果:** 保留原图的色彩基调，同时用深度控制空间结构，生成水下风格。

#### 示例 8: 姿态检测标准模式 (pose) - 完全重绘保留姿态

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "iron man armor, marvel superhero, high tech suit, glowing arc reactor",
    "image_path": "/data/uploads/person.png",
    "mode": "pose",
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "controlnet_conditioning_scale": 0.8
  }'
```

> **效果:** 原图的色彩、背景、人物长相会完全丢失，AI 会根据提示词从零开始生成钢铁侠，只保留原人物的姿态。

#### 示例 9: 姿态检测增强模式 (pose_img2img) - 人物风格转换

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "anime style character, vibrant colors, cel shading",
    "image_path": "/data/uploads/portrait.png",
    "mode": "pose_img2img",
    "num_inference_steps": 25,
    "guidance_scale": 8.0,
    "controlnet_conditioning_scale": 0.7
  }'
```

> **效果:** 保留原图的人物特征和背景，同时用姿态控制确保人物结构不变，生成动漫风格。

#### 示例 10: 使用随机种子生成可复现结果

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "watercolor painting style, soft colors, artistic",
    "image_path": "/data/uploads/flower.png",
    "mode": "img2img",
    "strength": 0.6,
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "seed": 12345
  }'
```

#### 示例 11: 生成多张图片

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "impressionist painting style, monet inspired",
    "image_path": "/data/uploads/garden.png",
    "mode": "img2img",
    "strength": 0.5,
    "num_inference_steps": 20,
    "guidance_scale": 7.0,
    "num_images": 4
  }'
```

#### 示例 12: 使用反向提示词避免不想要的元素

```bash
curl -X POST http://localhost:8000/api/image-to-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a beautiful woman portrait, professional photography",
    "image_path": "/data/uploads/portrait.png",
    "mode": "img2img",
    "strength": 0.5,
    "num_inference_steps": 25,
    "guidance_scale": 7.5,
    "negative_prompt": "ugly, deformed, bad anatomy, extra fingers, watermark, text, blurry"
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt` | string | 必需 | 提示词 |
| `image_path` | string | 必需 | 输入图片路径（原图） |
| `mask_path` | string | null | 蒙版图片路径（**仅 inpaint 模式必需**，优先级高于 auto_mask） |
| `mode` | string | "img2img" | 模式: img2img, inpaint, canny, depth, pose, canny_img2img, depth_img2img, pose_img2img |
| `strength` | float | 0.8 | 重绘幅度（**仅 img2img 模式有效**） |
| `num_inference_steps` | int | 20 | 推理步数 |
| `guidance_scale` | float | 7.0 | CFG 引导强度 |
| `controlnet_conditioning_scale` | float | 0.8 | ControlNet 条件强度（**inpaint/canny/depth/pose 及增强模式有效**） |
| `negative_prompt` | string | "" | 反向提示词，用于排除不想要的元素 |
| `seed` | int | null | 随机种子（null 则自动生成） |
| `num_images` | int | 1 | 生成图片数量 |
| `auto_mask` | bool | false | 是否使用 SAM 自动生成蒙版（**仅 inpaint 模式有效**） |
| `mask_prompt` | string | null | SAM 分割提示词，用于指定要分割的对象（**仅 auto_mask=true 时有效**） |

**参数详解:**

**`strength` (仅 img2img 模式):**
- 控制对原图的改变程度
- 范围: 0.1 - 1.0
- 0.1-0.3: 轻微变化，保留大部分原图细节
- 0.4-0.6: 中等变化，平衡原图和创意
- 0.7-1.0: 大幅变化，几乎完全重绘

**`controlnet_conditioning_scale` (inpaint/canny/depth/pose 及增强模式):**
- 控制生成结果与原图结构的相似程度
- 范围: 0.3 - 1.5
- 0.3-0.6: 更自由发挥，变化较大
- 0.7-0.9: 平衡原图结构和创意
- 1.0-1.5: 严格遵循原图结构

**模式选择指南:**

| 想要的效果 | 推荐模式 | 说明 |
|-----------|---------|------|
| 简单风格调整 | `img2img` | 使用 strength 控制变化程度 |
| 换衣服、替换物体 | `inpaint` | 只修改 mask 区域 |
| 把普通人变成钢铁侠 | `pose` | 完全重绘，只保留姿态 |
| 照片变油画风格 | `canny_img2img` | 保留色彩 + 边缘控制 |
| 场景风格转换 | `depth_img2img` | 保留色彩 + 深度控制 |
| 人物风格转换 | `pose_img2img` | 保留色彩 + 姿态控制 |

**`negative_prompt` (所有模式):**
- 反向提示词，用于排除不想要的元素
- 示例: "ugly, text, watermark, bad anatomy, blurry"
- 建议在以下场景使用:
  - inpaint 模式: 避免生成奇怪的手指、水印等
  - img2img 模式: 避免生成文字、变形等
  - canny/depth/pose 模式: 控制生成质量

**`mask_path` (仅 inpaint 模式):**
- 黑白蒙版图片，白色区域为需要重绘的部分
- 必须与原图尺寸相同
- 支持格式: png, jpg, jpeg
- **优先级高于 auto_mask**：如果同时提供 mask_path 和 auto_mask=true，将使用 mask_path

**`auto_mask` (仅 inpaint 模式):**
- 是否使用 SAM 3.1 自动生成蒙版
- 需要先下载 SAM 模型
- 适用于不想手动制作蒙版的场景
- 工作流程：
  1. SAM 根据 mask_prompt 识别图片中的对象
  2. 自动生成对应区域的蒙版
  3. 使用蒙版进行 inpaint 重绘

**`mask_prompt` (仅 auto_mask=true 时有效):**
- SAM 分割提示词，用于指定要分割的对象
- 示例：
  - `"dress"` - 分割衣服
  - `"person"` - 分割人物
  - `"car"` - 分割汽车
  - `"background"` - 分割背景
- 如果不提供，则使用 prompt 作为分割依据
- 建议使用简洁明确的名词

**响应示例:**
```json
{
  "status": "complete",
  "image_paths": [
    "/data/outputs/img2img_20240326_123456_abc12345.png"
  ]
}
```

---

## 5. 视频剪辑/重生成

### 5.1 Retake (片段重生成)

```bash
curl -X POST http://localhost:8000/api/retake \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/outputs/video.mp4",
    "start_time": 2.0,
    "duration": 5.0,
    "prompt": "replace this scene with a beach",
    "mode": "replace_audio_and_video"
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `video_path` | string | 必需 | 视频文件路径 |
| `start_time` | float | 必需 | 开始时间 (秒) |
| `duration` | float | 必需 | 重生成时长 (秒)，最小 2 秒 |
| `prompt` | string | "" | 提示词 |
| `mode` | string | "replace_audio_and_video" | 模式 |

**mode 选项:**
- `replace_audio_and_video` - 替换音视频
- `replace_video` - 仅替换视频
- `replace_audio` - 仅替换音频

**响应示例:**
```json
{
  "status": "success",
  "video_path": "/data/outputs/video_retake_20240326_123456.mp4",
  "result": {
    "original_duration": 10.0,
    "retake_duration": 5.0,
    "retake_start_time": 2.0
  }
}
```

---

## 6. IC-LoRA 控制生成

### 6.1 提取条件特征

从视频中提取 Canny 或 Depth 条件特征。

```bash
curl -X POST http://localhost:8000/api/ic-lora/extract-conditioning \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/outputs/video.mp4",
    "conditioning_type": "canny",
    "frame_time": 0
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `video_path` | string | 必需 | 视频文件路径 |
| `conditioning_type` | string | "canny" | 条件类型: canny, depth |
| `frame_time` | float | 0 | 提取的帧时间 |

**响应示例:**
```json
{
  "conditioning": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "original": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "conditioning_type": "canny",
  "frame_time": 0.0
}
```

> **注意:** `conditioning` 和 `original` 字段返回的是 base64 编码的 JPEG 图片数据，带有 `data:image/jpeg;base64,` 前缀。

---

### 6.2 IC-LoRA 生成

```bash
curl -X POST http://localhost:8000/api/ic-lora/generate \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/outputs/video.mp4",
    "conditioning_type": "canny",
    "prompt": "a person walking in the park",
    "conditioning_strength": 1.0,
    "num_inference_steps": 30,
    "cfg_guidance_scale": 1.0,
    "negative_prompt": "blurry, low quality",
    "images": []
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `video_path` | string | 必需 | 视频文件路径 |
| `conditioning_type` | string | 必需 | 条件类型: canny, depth |
| `prompt` | string | 必需 | 提示词 |
| `conditioning_strength` | float | 1.0 | 条件强度 |
| `num_inference_steps` | int | 30 | 推理步数 |
| `cfg_guidance_scale` | float | 1.0 | CFG 引导强度 |
| `negative_prompt` | string | "" | 负面提示词 |
| `images` | array | [] | 参考图片数组，每项包含 `path` (string), `frame` (int, 默认 0), `strength` (float, 默认 1.0) |

**响应示例:**
```json
{
  "status": "success",
  "video_path": "/data/outputs/ic_lora_20240326_123456.mp4"
}
```

---

## 7. 提示词建议

### 7.1 AI 提示词建议

为视频间隙生成提示词建议。

```bash
curl -X POST http://localhost:8000/api/suggest-gap-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "beforePrompt": "a person walking in the park",
    "afterPrompt": "person enters a building",
    "beforeFrame": "/data/outputs/frame_before.png",
    "afterFrame": "/data/outputs/frame_after.png",
    "gapDuration": 5,
    "mode": "t2v",
    "inputImage": null
  }'
```

**请求参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `beforePrompt` | string | "" | 前一段提示词 |
| `afterPrompt` | string | "" | 后一段提示词 |
| `beforeFrame` | string | null | 前一帧图片路径 |
| `afterFrame` | string | null | 后一帧图片路径 |
| `gapDuration` | float | 5 | 间隙时长 |
| `mode` | string | "t2v" | 模式: t2v, i2v |
| `inputImage` | string | null | 输入图片 |

**响应示例:**
```json
{
  "status": "success",
  "suggested_prompt": "transition scene showing the person walking towards the building entrance"
}
```

---

## 8. 文件管理 (Remote)

### 8.1 上传图片

```bash
curl -X POST http://localhost:8000/api/remote/upload-image \
  -F "file=@/path/to/image.png"
```

> **限制:** 图片文件最大 50 MB

**响应示例:**
```json
{
  "file_id": "/data/uploads/image.png",
  "filename": "image.png",
  "size": 1234567
}
```

---

### 8.2 上传音频

```bash
curl -X POST http://localhost:8000/api/remote/upload-audio \
  -F "file=@/path/to/audio.wav"
```

> **限制:** 音频文件最大 100 MB

**响应示例:**
```json
{
  "file_id": "/data/uploads/audio.wav",
  "filename": "audio.wav",
  "size": 9876543
}
```

---

### 8.3 一键生成 (推荐)

**支持直接上传文件，无需先调用 upload 接口**

```bash
curl -X POST http://localhost:8000/api/remote/generate \
  -F "prompt=a beautiful sunset over ocean" \
  -F "resolution=768p" \
  -F "model=fast" \
  -F "duration=5" \
  -F "fps=24" \
  -F "aspectRatio=16:9" \
  -F "cameraMotion=dolly_in" \
  -F "negativePrompt=blurry, low quality" \
  -F "audio=false" \
  -F "image=@/path/to/image.png" \
  -F "audioFile=@/path/to/audio.wav"
```

**参数说明:**

| Form 字段 | 说明 |
|----------|------|
| `prompt` | 提示词 (必需) |
| `resolution` | 分辨率 (默认 768p，不支持时回退到 540p): 540p, 720p, 1080p |
| `model` | 模型 (默认 fast) |
| `duration` | 时长 (默认 5): 受分辨率限制，见附录 C |
| `fps` | 帧率 (默认 24): 24, 25, 50 |
| `aspectRatio` | 宽高比 (默认 16:9) |
| `cameraMotion` | 相机运动 |
| `negativePrompt` | 负面提示词 |
| `audio` | 是否生成音频 |
| `image` | 直接上传图片文件 |
| `audioFile` | 直接上传音频文件 |
| `imagePath` | 已上传图片的路径 |
| `audioPath` | 已上传音频的路径 |

**响应示例:**
```json
{
  "status": "success",
  "video_path": "/data/outputs/video_20240326_123456.mp4",
  "download_url": "/api/remote/download/video_20240326_123456.mp4"
}
```

---

### 8.4 列出所有视频

```bash
curl http://localhost:8000/api/remote/videos
```

**响应示例:**
```json
{
  "videos": [
    {
      "filename": "video_20240326_123456.mp4",
      "size": 12345678,
      "created_at": "2024-03-26T12:34:56",
      "download_url": "/api/remote/download/video_20240326_123456.mp4"
    }
  ],
  "total": 1
}
```

---

### 8.5 下载视频

```bash
# 下载到当前目录
curl -O http://localhost:8000/api/remote/download/video_20240326_123456.mp4

# 指定输出文件名
curl -o output.mp4 http://localhost:8000/api/remote/download/video_20240326_123456.mp4
```

---

### 8.6 删除视频

```bash
curl -X DELETE http://localhost:8000/api/remote/videos/video_20240326_123456.mp4
```

**响应示例:**
```json
{
  "status": "deleted",
  "filename": "video_20240326_123456.mp4"
}
```

---

### 8.7 清理上传目录

```bash
curl -X POST http://localhost:8000/api/remote/cleanup-uploads
```

**响应示例:**
```json
{
  "status": "cleaned",
  "deleted_files": 5
}
```

---

## 9. 设置管理

### 9.1 获取设置

```bash
curl http://localhost:8000/api/settings
```

---

### 9.2 更新设置

```bash
curl -X POST http://localhost:8000/api/settings \
  -H "Content-Type: application/json" \
  -d '{
    "models_dir": "/data/models",
    "ltx_api_key": "your-api-key"
  }'
```

---

## 10. 运行时策略

### 10.1 获取运行时策略

```bash
curl http://localhost:8000/api/runtime-policy
```

**响应示例:**
```json
{
  "force_api_generations": false
}
```

---

## 附录

### A. 认证方式

如果配置了 `LTX_AUTH_TOKEN`，在请求头中添加：

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/models/status
```

---

### B. 完整生成脚本示例

```bash
#!/bin/bash

BASE_URL="http://localhost:8000"

# 1. 检查服务状态
echo "检查服务状态..."
curl -s $BASE_URL/health | jq .

# 2. 检查模型状态
echo -e "\n检查模型状态..."
curl -s $BASE_URL/api/models/status | jq '.models[] | {id, downloaded}'

# 3. 文本生视频
echo -e "\n开始文本生视频..."
curl -s -X POST $BASE_URL/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a beautiful sunset over ocean waves",
    "resolution": "720p",
    "model": "fast",
    "duration": "5"
  }' | jq .

# 4. 查询进度
echo -e "\n查询生成进度..."
curl -s $BASE_URL/api/generation/progress | jq .

# 5. 下载生成的视频
echo -e "\n视频已生成，可通过以下地址下载:"
echo "$BASE_URL/api/remote/videos"
```

---

### C. 本地生成分辨率和时长限制

#### 视频生成 (T2V/I2V) 分辨率映射

| 分辨率标签 | 16:9 (宽x高) | 9:16 (宽x高) | 最大时长 |
|-----------|-------------|-------------|---------|
| `540p` | 960x544 | 544x960 | 20 秒 |
| `720p` | 1280x704 | 704x1280 | 10 秒 |
| `1080p` | 1920x1088 | 1088x1920 | 5 秒 |

#### 音频生视频 (A2V) 分辨率映射

| 分辨率标签 | 宽x高 |
|-----------|-------|
| `540p` | 960x576 |
| `720p` | 1280x704 |
| `1080p` | 1920x1088 |

> **注意:** A2V 仅支持 16:9 宽高比。

#### 帧率选项

| 帧率 | 说明 |
|------|------|
| `24` | 电影标准 |
| `25` | PAL 标准 |
| `50` | 高帧率 |

#### 图像生成参数

| 参数 | 默认值 | 范围 |
|------|--------|------|
| `width` | 1024 | 会被对齐到 16 的倍数 |
| `height` | 1024 | 会被对齐到 16 的倍数 |
| `numSteps` | 4 | 推理步数 |
| `numImages` | 1 | 1-12 |

#### 图生图参数

| 参数 | 默认值 | 范围 |
|------|--------|------|
| `strength` | 0.8 | 0.0-1.0，图生图强度 |
| `num_inference_steps` | 20 | 推理步数 |
| `guidance_scale` | 7.0 | CFG 引导强度 |
| `controlnet_conditioning_scale` | 0.8 | ControlNet 条件强度 |
| `num_images` | 1 | 生成图片数量 |

#### Retake 参数限制

| 参数 | 限制 |
|------|------|
| `duration` | 最小 2 秒 |
| `mode` | replace_audio_and_video, replace_video, replace_audio |

---

*文档生成时间: 2026-04-02*
