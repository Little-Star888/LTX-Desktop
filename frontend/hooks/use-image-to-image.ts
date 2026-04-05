import { useCallback, useState, useRef } from 'react'
import { backendFetch } from '../lib/backend'
import { logger } from '../lib/logger'
import { pathToUrl } from '../lib/url-to-path'

export type ImageToImageMode = 
  | 'img2img' 
  | 'inpaint' 
  | 'canny' 
  | 'depth' 
  | 'pose' 
  | 'canny_img2img' 
  | 'depth_img2img' 
  | 'pose_img2img'

export interface ImageToImageParams {
  imagePath: string
  maskPrompt?: string
  prompt: string
  negativePrompt?: string
  mode: ImageToImageMode
  strength: number
  numInferenceSteps: number
  guidanceScale: number
  controlnetConditioningScale: number
  seed?: number
  numImages: number
}

export interface ImageToImageResult {
  imagePaths: string[]
  imageUrls: string[]
}

export interface PreviewMaskResult {
  maskPath: string
  maskUrl: string
  keyword: string
  coverage: number
}

interface UseImageToImageState {
  isGenerating: boolean
  status: string
  progress: number
  error: string | null
  result: ImageToImageResult | null
  isPreviewingMask: boolean
  previewMaskResult: PreviewMaskResult | null
  previewMaskError: string | null
}

interface GenerationProgress {
  status: string
  phase: string
  progress: number
  currentStep: number | null
  totalSteps: number | null
}

function getPhaseMessage(phase: string): string {
  switch (phase) {
    case 'validating_request':
      return 'Validating request...'
    case 'loading_model':
      return 'Loading model...'
    case 'inference':
      return 'Generating...'
    case 'complete':
      return 'Complete!'
    default:
      return 'Generating...'
  }
}

export function useImageToImage() {
  const [state, setState] = useState<UseImageToImageState>({
    isGenerating: false,
    status: '',
    progress: 0,
    error: null,
    result: null,
    isPreviewingMask: false,
    previewMaskResult: null,
    previewMaskError: null,
  })

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPhaseRef = useRef<string>('')
  const inferenceStartTimeRef = useRef<number>(0)

  const generate = useCallback(async (params: ImageToImageParams) => {
    if (!params.imagePath || !params.prompt.trim()) return

    setState({
      isGenerating: true,
      status: 'Starting...',
      progress: 0,
      error: null,
      result: null,
      isPreviewingMask: false,
      previewMaskResult: null,
      previewMaskError: null,
    })

    lastPhaseRef.current = ''
    inferenceStartTimeRef.current = 0

    const estimatedInferenceTime = params.numImages * 15

    const pollProgress = async () => {
      try {
        const res = await backendFetch('/api/generation/progress')
        if (res.ok) {
          const data: GenerationProgress = await res.json()

          let displayProgress = data.progress
          let statusMessage = getPhaseMessage(data.phase)

          if (data.phase === 'inference') {
            if (lastPhaseRef.current !== 'inference') {
              inferenceStartTimeRef.current = Date.now()
            }
            const elapsed = (Date.now() - inferenceStartTimeRef.current) / 1000
            const inferenceProgress = Math.min(elapsed / estimatedInferenceTime, 0.95)
            displayProgress = 15 + Math.floor(inferenceProgress * 80)
          }

          if (data.phase === 'complete' || data.status === 'complete') {
            displayProgress = 95
            statusMessage = 'Finalizing...'
          }

          lastPhaseRef.current = data.phase

          setState(prev => ({
            ...prev,
            progress: displayProgress,
            status: statusMessage,
          }))
        }
      } catch {
        // Ignore polling errors
      }
    }

    progressIntervalRef.current = setInterval(pollProgress, 500)

    try {
      const response = await backendFetch('/api/image-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: params.prompt,
          image_path: params.imagePath,
          mask_prompt: params.maskPrompt,
          mode: params.mode,
          strength: params.strength,
          num_inference_steps: params.numInferenceSteps,
          guidance_scale: params.guidanceScale,
          controlnet_conditioning_scale: params.controlnetConditioningScale,
          negative_prompt: params.negativePrompt,
          seed: params.seed,
          num_images: params.numImages,
        }),
      })

      const data = await response.json()

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }

      if (response.ok && data.status === 'complete' && data.image_paths) {
        const imageUrls = data.image_paths.map((path: string) => pathToUrl(path))
        setState({
          isGenerating: false,
          status: 'Generation complete!',
          progress: 100,
          error: null,
          result: {
            imagePaths: data.image_paths,
            imageUrls,
          },
          isPreviewingMask: false,
          previewMaskResult: null,
          previewMaskError: null,
        })
        return
      }

      const errorMsg = data.error || 'Unknown error'
      logger.error(`Image-to-image failed: ${errorMsg}`)
      setState({
        isGenerating: false,
        status: '',
        progress: 0,
        error: errorMsg,
        result: null,
        isPreviewingMask: false,
        previewMaskResult: null,
        previewMaskError: null,
      })
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      const message = (error as Error).message || 'Unknown error'
      logger.error(`Image-to-image error: ${message}`)
      setState({
        isGenerating: false,
        status: '',
        progress: 0,
        error: message,
        result: null,
        isPreviewingMask: false,
        previewMaskResult: null,
        previewMaskError: null,
      })
    }
  }, [])

  const previewMask = useCallback(async (params: { imagePath: string; prompt: string; maskPrompt?: string }) => {
    if (!params.imagePath || !params.prompt.trim()) return

    setState(prev => ({
      ...prev,
      isPreviewingMask: true,
      previewMaskResult: null,
      previewMaskError: null,
    }))

    try {
      const response = await backendFetch('/api/preview-mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: params.imagePath,
          prompt: params.prompt,
          mask_prompt: params.maskPrompt,
        }),
      })

      const data = await response.json()

      if (response.ok && data.mask_path) {
        setState(prev => ({
          ...prev,
          isPreviewingMask: false,
          previewMaskResult: {
            maskPath: data.mask_path,
            maskUrl: pathToUrl(data.mask_path),
            keyword: data.keyword,
            coverage: data.coverage,
          },
          previewMaskError: null,
        }))
      } else {
        const errorMsg = data.error || data.detail || 'Failed to generate mask preview'
        logger.error(`Mask preview failed: ${errorMsg}`)
        setState(prev => ({
          ...prev,
          isPreviewingMask: false,
          previewMaskResult: null,
          previewMaskError: errorMsg,
        }))
      }
    } catch (error) {
      const message = (error as Error).message || 'Unknown error'
      logger.error(`Mask preview error: ${message}`)
      setState(prev => ({
        ...prev,
        isPreviewingMask: false,
        previewMaskResult: null,
        previewMaskError: message,
      }))
    }
  }, [])

  const reset = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setState({
      isGenerating: false,
      status: '',
      progress: 0,
      error: null,
      result: null,
      isPreviewingMask: false,
      previewMaskResult: null,
      previewMaskError: null,
    })
  }, [])

  const clearPreviewMask = useCallback(() => {
    setState(prev => ({
      ...prev,
      previewMaskResult: null,
      previewMaskError: null,
    }))
  }, [])

  return {
    generate,
    reset,
    previewMask,
    clearPreviewMask,
    isGenerating: state.isGenerating,
    status: state.status,
    progress: state.progress,
    error: state.error,
    result: state.result,
    isPreviewingMask: state.isPreviewingMask,
    previewMaskResult: state.previewMaskResult,
    previewMaskError: state.previewMaskError,
  }
}
