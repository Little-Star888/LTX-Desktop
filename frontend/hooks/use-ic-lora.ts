import { useCallback, useState, useRef } from 'react'
import { backendFetch } from '../lib/backend'
import { logger } from '../lib/logger'
import { pathToUrl } from '../lib/url-to-path'

export type IcLoraConditioningType = 'canny' | 'depth' | 'pose'

export interface IcLoraSubmitParams {
  videoPath: string
  conditioningType: IcLoraConditioningType
  conditioningStrength: number
  prompt: string
}

export interface IcLoraResult {
  videoPath: string
  videoUrl: string
}

interface UseIcLoraState {
  isGenerating: boolean
  status: string
  progress: number
  error: string | null
  result: IcLoraResult | null
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

export function useIcLora() {
  const [state, setState] = useState<UseIcLoraState>({
    isGenerating: false,
    status: '',
    progress: 0,
    error: null,
    result: null,
  })

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPhaseRef = useRef<string>('')
  const inferenceStartTimeRef = useRef<number>(0)

  const submitIcLora = useCallback(async (params: IcLoraSubmitParams) => {
    if (!params.videoPath || !params.prompt.trim()) return

    setState({
      isGenerating: true,
      status: 'Starting...',
      progress: 0,
      error: null,
      result: null,
    })

    lastPhaseRef.current = ''
    inferenceStartTimeRef.current = 0

    const estimatedInferenceTime = 120

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
      const response = await backendFetch('/api/ic-lora/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: params.videoPath,
          conditioning_type: params.conditioningType,
          conditioning_strength: params.conditioningStrength,
          prompt: params.prompt,
        }),
      })

      const data = await response.json()

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }

      if (response.ok && data.status === 'complete' && data.video_path) {
        const videoUrl = pathToUrl(data.video_path)
        setState({
          isGenerating: false,
          status: 'Generation complete!',
          progress: 100,
          error: null,
          result: {
            videoPath: data.video_path,
            videoUrl,
          },
        })
        return
      }

      const errorMsg = data.error || 'Unknown error'
      logger.error(`IC-LoRA failed: ${errorMsg}`)
      setState({
        isGenerating: false,
        status: '',
        progress: 0,
        error: errorMsg,
        result: null,
      })
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      const message = (error as Error).message || 'Unknown error'
      logger.error(`IC-LoRA error: ${message}`)
      setState({
        isGenerating: false,
        status: '',
        progress: 0,
        error: message,
        result: null,
      })
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
    })
  }, [])

  return {
    submitIcLora,
    resetIcLora: reset,
    isIcLoraGenerating: state.isGenerating,
    icLoraStatus: state.status,
    icLoraProgress: state.progress,
    icLoraError: state.error,
    icLoraResult: state.result,
  }
}
