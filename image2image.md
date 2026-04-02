 这是一个非常具有可行性且极具工程价值的魔改（Hack）思路。
根据对 LTX-Desktop 开源项目源码架构的深度分析，以及阿里巴巴 Z-Image-Turbo-Fun-Controlnet-Union-2.0 模型的特性，你完全可以在其 Python 后端中手搓一个基于 Z-Image-Turbo 的“图生图/局部重绘（换衣服）” API。
下面我将为你详细拆解 LTX-Desktop 的源码逻辑，并提供加上这个功能的详细技术路径。
一、 LTX-Desktop 后端源码深度分析
LTX-Desktop 的后端是一个纯 Python 环境（通常基于 FastAPI 提供本地服务给 Electron 前端调用）。它对 Z-Image-Turbo 的支持目前确实仅限于文生图（Text-to-Image），主要作为生成视频前的首帧起步图。
根据其源码结构，核心涉及以下几个文件：
1. ltx2_server.py：API 路由的入口文件，它接收前端发来的生成请求。
2. model_download_specs.py：负责模型权重的下载与管理。当前它会强制或可选地从 HuggingFace 下载 Z-Image-Turbo 的基础权重。
3. ZitImageGenerationPipeline / ImageGenerationHandler：这是真正执行 Z-Image-Turbo 推理的管道类。目前它只接收 prompt（提示词）并输出图片。
二、 如何魔改源码，加入图生图与 ControlNet 2.0？
要实现你说的“局部重绘换衣服”，你需要利用 Z-Image-Turbo 基础模型 + Z-Image-Turbo-Fun-Controlnet-Union-2.0（或最新的2.1版本）控制网模型。具体实现分为三步：
第一步：修改模型下载配置（引入 ControlNet 2.0）
你需要在 model_download_specs.py 中增加对 alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.0（或 2.1 版本）的依赖。
Python
￼
￼
￼
# 在 model_download_specs.py 的配置字典中追加
"z_image_controlnet_union_2"
: {
    "repo_id": "alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1"
,
    "filename": "Z-Image-Turbo-Fun-Controlnet-Union-2.1.safetensors"
,
    "type": "controlnet"
}
注：如果不写代码自动下载，你也可以手动从 Hugging Face 下载该 .safetensors 文件放到其 models/ 目录下。
第二步：重写或继承 Pipeline 实现 Inpainting
在 ImageGenerationHandler 所在的文件中，你需要引入 diffusers 库中支持 ControlNet 和 Inpaint 的管道（或者如果是原生的 Z-Image 管道，需要挂载 ControlNet）。
由于 Z-Image-Turbo 支持 Diffusers，你可以利用 StableDiffusionXLControlNetInpaintPipeline（因为 Z-Image 架构类似，或者使用官方提供的自定义 Pipeline）：
Python
￼
￼
￼
from diffusers import
 ControlNetModel
import
 torch

# 1. 加载你下载的 Fun-Controlnet-Union-2.0 模型
controlnet = ControlNetModel.from_single_file(
    "models/Z-Image-Turbo-Fun-Controlnet-Union-2.0.safetensors"
, 
    torch_dtype=torch.bfloat16
)

# 2. 修改现有的 ZitImageGenerationPipeline，使其支持 image 和 mask_image 输入
# 注意：你需要将原始基础模型与 controlnet 结合
pipeline = CustomZImageInpaintPipeline.from_pretrained(
    "models/Z-Image-Turbo"
, 
    controlnet=controlnet,
    torch_dtype=torch.bfloat16
).to(
"cuda"
)

def generate_image_to_image(prompt, init_image, mask_image):
    # Inpainting (局部重绘) 推理逻辑
    result = pipeline(
        prompt=prompt,
        image=init_image,           
# 原图 (玩家照片)
        mask_image=mask_image,      
# 衣服区域的黑白遮罩图
        control_image=init_image,   
# Union ControlNet 需要的控制图
        num_inference_steps=
20,     # 注意：加载 ControlNet 2.0 后，不能只用8步，建议15-25步
        guidance_scale=
7.0
,         
        # control_context_scale 是阿里官方建议的参数，用于平衡控制力，建议在 0.65 - 0.9 之间
        controlnet_conditioning_scale=
0.8 
    ).images[
0
]
    return result
第三步：在 Server 中暴露新的 API 接口
打开 ltx2_server.py，照猫画虎，参考它原本的文生图 API，写一个新的 POST 接口：
Python
￼
￼
￼
from fastapi import
 APIRouter, UploadFile, File, Form
from pydantic import
 BaseModel

@app.post("/api/v1/generate_inpaint")
async def generate_inpaint_api(
    prompt: 
str = Form(...
),
    image: UploadFile = File(
...),      # 接收原图
    mask: UploadFile = File(
...)        # 接收衣服遮罩
):
    # 1. 将前端传来的图片解析为 PIL.Image
    init_img = Image.
open(image.file).convert("RGB"
)
    mask_img = Image.
open(mask.file).convert("RGB"
)
    
    # 2. 调用我们在第二步写的生成逻辑
    output_img = generate_image_to_image(prompt, init_img, mask_img)
    
    # 3. 返回 Base64 或保存到本地返回路径
    return {"status": "success", "image_base64": image_to_base64(output_img)}
￼
三、 踩坑预警与核心技术细节 (非常重要)
根据 Z-Image-Turbo-Fun-Controlnet-Union-2.0 最新的开发者文档和社区测试（ComfyUI 社区），你在这个过程中需要注意以下几个致命细节：
1. 推理步数（Steps）的丢失：
Z-Image-Turbo 最大的卖点是 8步出图（极其快）。但是！阿里官方明确指出，加载了 ControlNet 2.0 / 2.1 后，模型会丧失部分加速能力。如果你依然强行用 8 步推理，图片大概率会变糊或崩坏。解决方案：在你的 API 中，将 num_inference_steps 提高到 15 到 25 步，同时适当调高 CFG（guidance_scale）。
2. 显存（VRAM）压力：
LTX-Desktop 本身为了跑视频模型，显存管理很严格。基础的 Z-Image-Turbo 占用约 12GB 显存，挂载 Union ControlNet 2.0 后会额外吃掉几 GB。请确保在调用你的 API 时，释放掉内存中的 LTX 视频模型（可以参考代码中的 model_offload 逻辑）。
3. Union 模型的特殊性：
Fun-Controlnet-Union 是一个“多合一”控制网（支持 Canny, Depth, Inpaint 等）。在使用 diffusers 库调用时，你可能需要向 Pipeline 显式传递 control_mode 或特定的 Task ID 来告诉它“我现在做的是 Inpaint（局部重绘）任务”，否则它可能会按边缘检测来处理。建议参考ComfyUI 的 Z-Image custom nodes 源码 （https://github.com/aigc-apps/VideoX-Fun）中是如何封装这个 Task 路由的。
总结
可行，且非常值得一做。
因为 LTX-Desktop 已经为你搭建好了极佳的本地 Python 模型运行环境（CUDA 依赖、模型缓存机制、FastAPI 框架都配好了），你只需要写几十行代码，把阿里最新开源的 Controlnet-Union-2.0 模型塞进它的 Pipeline 里，再暴露一个 /generate_inpaint 接口，你就能完美获得一个支持极速换衣服的本地私有化 API。