import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Music, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { isElectron } from '../lib/environment'

interface AudioUploaderProps {
  onAudioSelect: (path: string | null) => void
  selectedAudio: string | null
}

export function AudioUploader({ onAudioSelect, selectedAudio }: AudioUploaderProps) {
  const { t } = useTranslation()
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      const filePath = (file as any).path as string | undefined
      if (isElectron && filePath) {
        const normalized = filePath.replace(/\\/g, '/')
        const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
        onAudioSelect(fileUrl)
      } else {
        // In web mode, use blob URL
        const url = URL.createObjectURL(file)
        onAudioSelect(url)
      }
    }
  }, [onAudioSelect])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/ogg': ['.ogg'],
      'audio/aac': ['.aac'],
      'audio/flac': ['.flac'],
      'audio/mp4': ['.m4a'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false,
    noClick: !!selectedAudio,
  })

  const clearAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAudioSelect(null)
  }

  const replaceAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    open()
  }

  const getDisplayName = (path: string | null): string => {
    if (!path) return ''
    const name = path.split(/[/\\]/).pop()?.replace(/^file:/, '') || path
    const decoded = decodeURIComponent(name)
    const maxLength = 28
    if (decoded.length <= maxLength) return decoded
    const ext = decoded.split('.').pop() || ''
    const baseName = decoded.slice(0, decoded.length - ext.length - 1)
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4)
    return `${truncatedBase}...${ext ? '.' + ext : ''}`
  }

  return (
    <div className="w-full">
      <label className="block text-[12px] font-semibold text-zinc-500 mb-2 uppercase leading-4">
        {t('genSpace.inputAudio')}
      </label>
      <div
        {...getRootProps()}
        className={cn(
          'relative border border-dashed border-zinc-600 rounded-lg cursor-pointer transition-colors',
          'hover:border-zinc-500',
          isDragActive && 'border-emerald-500 bg-emerald-500/5',
          selectedAudio ? 'p-3' : 'p-6'
        )}
      >
        <input {...getInputProps()} />

        {selectedAudio ? (
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-zinc-800 flex items-center justify-center">
              <Music className="h-6 w-6 text-emerald-400" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate" title={getDisplayName(selectedAudio)}>
                {getDisplayName(selectedAudio)}
              </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={clearAudio}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                title={t('genSpace.clearAudio')}
              >
                <Trash2 className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
              <button
                onClick={replaceAudio}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                title={t('playground.upload.replaceAudio')}
              >
                <RefreshCw className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-700 rounded-lg">
              {isDragActive ? (
                <Upload className="h-6 w-6 text-emerald-400" />
              ) : (
                <Music className="h-6 w-6 text-zinc-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {t('playground.upload.dropAudio')}
              </p>
              <p className="text-sm text-zinc-500">
                {t('playground.upload.or')} <span className="text-emerald-400 underline">{t('playground.upload.uploadFile')}</span>
              </p>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-500 mt-2">
        {t('playground.upload.supportedFormats', { formats: 'mp3, wav, ogg, aac, flac, m4a' })}. {t('playground.upload.maxSize', { size: '50MB' })}
      </p>
    </div>
  )
}
