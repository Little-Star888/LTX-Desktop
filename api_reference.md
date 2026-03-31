# LTX-Desktop API 接口详细文档

> 基于 `/home/bread/poker/LTX-Desktop/backend/_routes/` 目录下的路由定义
> 服务地址: `http://localhost:8000`

---

## 目录

- [1. 系统与健康检查](#1-系统与健康检查)
- [2. 模型管理](#2-模型管理)
- [3. 视频生成](#3-视频生成)
- [4. 图像生成](#4-图像生成)
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
  -d '{"modelTypes": ["checkpoint", "upsampler", "zit", "text_encoder", "distilled_lora", "ic_lora", "depth_processor", "person_detector", "pose_processor"]}'

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
| `resolution` | 分辨率 (默认 720p): 540p, 720p, 1080p |
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

#### Retake 参数限制

| 参数 | 限制 |
|------|------|
| `duration` | 最小 2 秒 |
| `mode` | replace_audio_and_video, replace_video, replace_audio |

---

*文档生成时间: 2026-03-31*
