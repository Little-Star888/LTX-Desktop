import { useCallback, useState, useRef } from 'react'
import { backendFetch } from '../lib/backend'
import { logger } from '../lib/logger'
import { pathToUrl } from '../lib/url-to-path'

export type RetakeMode = 'replace_audio_and_video' | 'replace_video' | 'replace_audio'

export interface RetakeSubmitParams {
  videoPath: string
  startTime: number
  duration: number
  prompt: string
  mode: RetakeMode
}

export interface RetakeResult {
  videoPath: string
  videoUrl: string
}

interface UseRetakeState {
  isRetaking: boolean
  retakeStatus: string
  retakeProgress: number
  retakeError: string | null
  result: RetakeResult | null
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

export function useRetake() {
  const [state, setState] = useState<UseRetakeState>({
    isRetaking: false,
    retakeStatus: '',
    retakeProgress: 0,
    retakeError: null,
    result: null,
  })

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPhaseRef = useRef<string>('')
  const inferenceStartTimeRef = useRef<number>(0)

  const submitRetake = useCallback(async (params: RetakeSubmitParams) => {
    if (!params.videoPath) return

    setState({
      isRetaking: true,
      retakeStatus: 'Starting...',
      retakeProgress: 0,
      retakeError: null,
      result: null,
    })

    lastPhaseRef.current = ''
    inferenceStartTimeRef.current = 0

    const estimatedInferenceTime = 60

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
            retakeProgress: displayProgress,
            retakeStatus: statusMessage,
          }))
        }
      } catch {
        // Ignore polling errors
      }
    }

    progressIntervalRef.current = setInterval(pollProgress, 500)

    try {
      const response = await backendFetch('/api/retake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: params.videoPath,
          start_time: params.startTime,
          duration: params.duration,
          prompt: params.prompt,
          mode: params.mode,
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
          isRetaking: false,
          retakeStatus: 'Retake complete!',
          retakeProgress: 100,
          retakeError: null,
          result: {
            videoPath: data.video_path,
            videoUrl,
          },
        })
        return
      }

      const errorMsg = data.error || 'Unknown error'
      setState({
        isRetaking: false,
        retakeStatus: '',
        retakeProgress: 0,
        retakeError: errorMsg,
        result: null,
      })
      logger.error(`Retake failed: ${errorMsg}`)
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      const message = (error as Error).message || 'Unknown error'
      logger.error(`Retake error: ${message}`)
      setState({
        isRetaking: false,
        retakeStatus: '',
        retakeProgress: 0,
        retakeError: message,
        result: null,
      })
    }
  }, [])

  const resetRetake = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setState({
      isRetaking: false,
      retakeStatus: '',
      retakeProgress: 0,
      retakeError: null,
      result: null,
    })
  }, [])

  return {
    submitRetake,
    resetRetake,
    isRetaking: state.isRetaking,
    retakeStatus: state.retakeStatus,
    retakeProgress: state.retakeProgress,
    retakeError: state.retakeError,
    retakeResult: state.result,
  }
}
