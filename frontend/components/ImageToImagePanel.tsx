import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, Loader2, Image as ImageIcon, Sparkles,
  RefreshCw, Download, AlertCircle, Trash2, Settings2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { logger } from '../lib/logger'
import { fileUrlToPath, pathToUrl } from '../lib/url-to-path'
import { isElectron } from '../lib/environment'
import { api } from '../lib/api'
import { ImageToImageMode } from '../hooks/use-image-to-image'

export const IMAGE_TO_IMAGE_MODES: { value: ImageToImageMode; labelKey: string; descKey: string }[] = [
  { value: 'img2img', labelKey: 'img2img.img2img', descKey: 'img2img.img2imgDesc' },
  { value: 'inpaint', labelKey: 'img2img.inpaint', descKey: 'img2img.inpaintDesc' },
  { value: 'canny', labelKey: 'img2img.canny', descKey: 'img2img.cannyDesc' },
  { value: 'depth', labelKey: 'img2img.depth', descKey: 'img2img.depthDesc' },
]

interface ImageToImagePanelProps {
  initialImageUrl?: string | null
  initialImagePath?: string | null
  initialMaskUrl?: string | null
  initialMaskPath?: string | null
  resetKey?: number
  fillHeight?: boolean
  isProcessing?: boolean
  processingStatus?: string
  processingProgress?: number
  mode?: ImageToImageMode
  onModeChange?: (mode: ImageToImageMode) => void
  strength?: number
  onStrengthChange?: (strength: number) => void
  guidanceScale?: number
  onGuidanceScaleChange?: (scale: number) => void
  controlnetScale?: number
  onControlnetScaleChange?: (scale: number) => void
  numInferenceSteps?: number
  onNumInferenceStepsChange?: (steps: number) => void
  outputImageUrl?: string | null
  onChange?: (data: {
    imageUrl: string | null
    imagePath: string | null
    maskUrl: string | null
    maskPath: string | null
    mode: ImageToImageMode
    ready: boolean
  }) => void
}

export function ImageToImagePanel({
  initialImageUrl,
  initialImagePath,
  initialMaskUrl,
  initialMaskPath,
  resetKey,
  fillHeight = false,
  isProcessing = false,
  processingStatus = '',
  processingProgress = 0,
  mode: modeProp,
  onModeChange,
  strength: strengthProp,
  onStrengthChange,
  guidanceScale: guidanceScaleProp,
  onGuidanceScaleChange,
  controlnetScale: controlnetScaleProp,
  onControlnetScaleChange,
  numInferenceSteps: numInferenceStepsProp,
  onNumInferenceStepsChange,
  outputImageUrl,
  onChange,
}: ImageToImagePanelProps) {
  const { t } = useTranslation()
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl || null)
  const [imagePath, setImagePath] = useState<string | null>(initialImagePath || null)
  const [maskUrl, setMaskUrl] = useState<string | null>(initialMaskUrl || null)
  const [maskPath, setMaskPath] = useState<string | null>(initialMaskPath || null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isMaskDragOver, setIsMaskDragOver] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [localMode, setLocalMode] = useState<ImageToImageMode>('img2img')
  const [localStrength, setLocalStrength] = useState(0.8)
  const [localGuidanceScale, setLocalGuidanceScale] = useState(7.0)
  const [localControlnetScale, setLocalControlnetScale] = useState(0.8)
  const [localNumInferenceSteps, setLocalNumInferenceSteps] = useState(20)

  const mode = modeProp ?? localMode
  const strength = strengthProp ?? localStrength
  const guidanceScale = guidanceScaleProp ?? localGuidanceScale
  const controlnetScale = controlnetScaleProp ?? localControlnetScale
  const numInferenceSteps = numInferenceStepsProp ?? localNumInferenceSteps

  useEffect(() => {
    if (resetKey === undefined) return
    setImageUrl(initialImageUrl || null)
    setImagePath(initialImagePath || null)
    setMaskUrl(initialMaskUrl || null)
    setMaskPath(initialMaskPath || null)
  }, [resetKey, initialImageUrl, initialImagePath, initialMaskUrl, initialMaskPath])

  useEffect(() => {
    const ready = !!imagePath
    onChange?.({
      imageUrl,
      imagePath,
      maskUrl,
      maskPath,
      mode,
      ready,
    })
  }, [imageUrl, imagePath, maskUrl, maskPath, mode, onChange])

  const handleModeChange = useCallback((newMode: ImageToImageMode) => {
    if (onModeChange) {
      onModeChange(newMode)
    } else {
      setLocalMode(newMode)
    }
  }, [onModeChange])

  const handleStrengthChange = useCallback((newStrength: number) => {
    if (onStrengthChange) {
      onStrengthChange(newStrength)
    } else {
      setLocalStrength(newStrength)
    }
  }, [onStrengthChange])

  const handleGuidanceScaleChange = useCallback((newScale: number) => {
    if (onGuidanceScaleChange) {
      onGuidanceScaleChange(newScale)
    } else {
      setLocalGuidanceScale(newScale)
    }
  }, [onGuidanceScaleChange])

  const handleControlnetScaleChange = useCallback((newScale: number) => {
    if (onControlnetScaleChange) {
      onControlnetScaleChange(newScale)
    } else {
      setLocalControlnetScale(newScale)
    }
  }, [onControlnetScaleChange])

  const handleNumInferenceStepsChange = useCallback((newSteps: number) => {
    if (onNumInferenceStepsChange) {
      onNumInferenceStepsChange(newSteps)
    } else {
      setLocalNumInferenceSteps(newSteps)
    }
  }, [onNumInferenceStepsChange])

  const handleBrowse = useCallback(async () => {
    if (isElectron) {
      const paths = await window.electronAPI.showOpenFileDialog({
        title: 'Select Image',
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
      })
      if (paths && paths.length > 0) {
        const filePath = paths[0]
        setImagePath(filePath)
        setImageUrl(pathToUrl(filePath))
      }
    }
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isElectron) {
      const filePath = (file as any).path as string | undefined
      if (filePath) {
        setImagePath(filePath)
        setImageUrl(pathToUrl(filePath))
        return
      }
    }

    try {
      const previewUrl = URL.createObjectURL(file)
      const result = await api.uploadImage(file)
      setImagePath(result.file_id)
      setImageUrl(previewUrl)
    } catch (error) {
      logger.error('Failed to upload image:', error)
    }
  }, [])

  const handleMaskFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isElectron) {
      const filePath = (file as any).path as string | undefined
      if (filePath) {
        setMaskPath(filePath)
        setMaskUrl(pathToUrl(filePath))
        return
      }
    }

    try {
      const previewUrl = URL.createObjectURL(file)
      const result = await api.uploadImage(file)
      setMaskPath(result.file_id)
      setMaskUrl(previewUrl)
    } catch (error) {
      logger.error('Failed to upload mask:', error)
    }
  }, [])

  const handleClear = useCallback(() => {
    setImageUrl(null)
    setImagePath(null)
    setMaskUrl(null)
    setMaskPath(null)
  }, [])

  const handleClearMask = useCallback(() => {
    setMaskUrl(null)
    setMaskPath(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const assetData = e.dataTransfer.getData('asset')
    if (assetData) {
      try {
        const asset = JSON.parse(assetData) as { type?: string; url?: string; path?: string }
        if (asset.type === 'image' && asset.url) {
          const path = asset.path || fileUrlToPath(asset.url) || null
          setImageUrl(asset.url)
          setImagePath(path)
          return
        }
      } catch {
        // fall through to file handling
      }
    }

    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      if (isElectron) {
        const filePath = (file as any).path as string | undefined
        if (filePath) {
          setImagePath(filePath)
          setImageUrl(pathToUrl(filePath))
          return
        }
      }

      try {
        const previewUrl = URL.createObjectURL(file)
        const result = await api.uploadImage(file)
        setImagePath(result.file_id)
        setImageUrl(previewUrl)
      } catch (error) {
        logger.error('Failed to upload image:', error)
      }
    }
  }, [])

  const handleMaskDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsMaskDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      if (isElectron) {
        const filePath = (file as any).path as string | undefined
        if (filePath) {
          setMaskPath(filePath)
          setMaskUrl(pathToUrl(filePath))
          return
        }
      }

      try {
        const previewUrl = URL.createObjectURL(file)
        const result = await api.uploadImage(file)
        setMaskPath(result.file_id)
        setMaskUrl(previewUrl)
      } catch (error) {
        logger.error('Failed to upload mask:', error)
      }
    }
  }, [])

  const showMaskUpload = mode === 'inpaint'

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col ${fillHeight ? 'h-full min-h-0' : ''}`}>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp"
        onChange={handleFileSelect}
        className="hidden"
        id="img2img-input"
      />
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp"
        onChange={handleMaskFileSelect}
        className="hidden"
        id="img2img-mask-input"
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">{t('img2img.title')}</span>
          {imagePath && (
            <span className="text-xs text-zinc-500 truncate max-w-[200px]">
              {imagePath.split(/[/\\]/).pop()}
            </span>
          )}
        </div>
        {imageUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title={t('img2img.clearImage')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                if (isElectron) {
                  handleBrowse()
                } else {
                  document.getElementById('img2img-input')?.click()
                }
              }}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title={t('img2img.replaceImage')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {!imageUrl ? (
          <div
            className={`p-8 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl transition-colors ${
              isDragOver ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="p-3 rounded-full bg-zinc-800">
              <Upload className="h-5 w-5 text-zinc-400" />
            </div>
            <div className="text-center">
              <p className="text-sm text-white">{t('img2img.dropImage')}</p>
              <p className="text-xs text-zinc-500">{t('img2img.dropImageHint')}</p>
            </div>
            <button
              onClick={() => {
                if (isElectron) {
                  handleBrowse()
                } else {
                  document.getElementById('img2img-input')?.click()
                }
              }}
              className="px-4 py-1.5 text-xs font-medium rounded-md bg-white text-black hover:bg-zinc-200 transition-colors"
            >
              {t('img2img.browse')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden bg-black">
              <img
                src={outputImageUrl || imageUrl}
                alt="Input"
                className="w-full h-auto max-h-64 object-contain"
              />
              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                  <span className="text-sm text-white">{processingStatus}</span>
                  <div className="w-48 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                  {t('img2img.mode')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {IMAGE_TO_IMAGE_MODES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => handleModeChange(m.value)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                        mode === m.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {t(m.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {showMaskUpload && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                    {t('img2img.mask')}
                  </label>
                  {maskUrl ? (
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <img
                        src={maskUrl}
                        alt="Mask"
                        className="w-full h-32 object-contain"
                      />
                      <button
                        onClick={handleClearMask}
                        className="absolute top-2 right-2 p-1 rounded bg-black/60 hover:bg-black/80 text-white transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`p-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg transition-colors ${
                        isMaskDragOver ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700'
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setIsMaskDragOver(true) }}
                      onDragLeave={() => setIsMaskDragOver(false)}
                      onDrop={handleMaskDrop}
                      onClick={() => document.getElementById('img2img-mask-input')?.click()}
                    >
                      <Upload className="h-4 w-4 text-zinc-500" />
                      <span className="text-xs text-zinc-500">{t('img2img.dropMask')}</span>
                    </div>
                  )}
                </div>
              )}

              {mode === 'img2img' && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                    {t('img2img.strength')}: {strength.toFixed(2)}
                  </label>
                  <p className="text-xs text-zinc-500 mb-1.5">{t('img2img.strengthHint')}</p>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={strength}
                    onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
              )}

              {mode !== 'img2img' && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                    {t('img2img.controlnetScale')}: {controlnetScale.toFixed(2)}
                  </label>
                  <p className="text-xs text-zinc-500 mb-1.5">{t('img2img.controlnetScaleHint')}</p>
                  <input
                    type="range"
                    min="0.3"
                    max="1.5"
                    step="0.05"
                    value={controlnetScale}
                    onChange={(e) => handleControlnetScaleChange(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
              )}

              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t('img2img.advancedSettings')}
              </button>

              {showAdvanced && (
                <div className="space-y-3 pl-2 border-l-2 border-zinc-700">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                      {t('img2img.guidanceScale')}: {guidanceScale.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="0.5"
                      value={guidanceScale}
                      onChange={(e) => handleGuidanceScaleChange(parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                      {t('img2img.inferenceSteps')}: {numInferenceSteps}
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="50"
                      step="1"
                      value={numInferenceSteps}
                      onChange={(e) => handleNumInferenceStepsChange(parseInt(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
