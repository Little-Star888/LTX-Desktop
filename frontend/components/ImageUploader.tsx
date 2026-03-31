import { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Image as ImageIcon, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { isElectron } from '../lib/environment'
import { api } from '../lib/api'

interface ImageUploaderProps {
  onImageSelect: (path: string | null) => void
  selectedImage: string | null
}

export function ImageUploader({ onImageSelect, selectedImage }: ImageUploaderProps) {
  const { t } = useTranslation()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [uploadError])
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    
    setUploadError(null)
    
    if (isElectron) {
      const filePath = (file as any).path as string | undefined
      if (filePath) {
        const normalized = filePath.replace(/\\/g, '/')
        const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
        onImageSelect(fileUrl)
        return
      }
    }
    
    setIsUploading(true)
    try {
      const previewUrl = URL.createObjectURL(file)
      const result = await api.uploadImage(file)
      onImageSelect(`uploaded|${result.file_id}|${previewUrl}`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
      onImageSelect(null)
    } finally {
      setIsUploading(false)
    }
  }, [onImageSelect])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
    noClick: !!selectedImage, // Disable click when image is loaded
  })

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    onImageSelect(null)
  }

  const replaceImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    open()
  }

  const getDisplayName = (path: string | null): string => {
    if (!path) return ''
    if (path.startsWith('uploaded|')) {
      const parts = path.split('|')
      const filePath = parts[1] || ''
      return filePath.split(/[/\\]/).pop() || 'uploaded image'
    }
    const name = path.split(/[/\\]/).pop()?.replace(/^file:/, '') || path
    const decoded = decodeURIComponent(name)
    const maxLength = 28
    if (decoded.length <= maxLength) return decoded
    const ext = decoded.split('.').pop() || ''
    const baseName = decoded.slice(0, decoded.length - ext.length - 1)
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4)
    return `${truncatedBase}...${ext ? '.' + ext : ''}`
  }

  const getPreviewUrl = (path: string | null): string | null => {
    if (!path) return null
    if (path.startsWith('uploaded|')) {
      const parts = path.split('|')
      return parts[2] || null
    }
    return path
  }

  const previewUrl = getPreviewUrl(selectedImage)

  return (
    <div className="w-full">
      <label className="block text-[12px] font-semibold text-zinc-500 mb-2 uppercase leading-4">
        {t('genSpace.inputImage')}
      </label>
      <div
        {...getRootProps()}
        className={cn(
          'relative border border-dashed border-zinc-600 rounded-lg cursor-pointer transition-colors',
          'hover:border-zinc-500',
          isDragActive && 'border-blue-500 bg-blue-500/5',
          selectedImage ? 'p-3' : 'p-6',
          isUploading && 'opacity-50 pointer-events-none'
        )}
      >
        <input {...getInputProps()} disabled={isUploading} />

        {isUploading ? (
          <div className="flex items-center justify-center gap-3 py-2">
            <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
            <p className="text-sm text-zinc-400">Uploading...</p>
          </div>
        ) : previewUrl ? (
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-zinc-800">
              <img
                src={previewUrl}
                alt={t('genSpace.selectImage')}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate" title={getDisplayName(selectedImage)}>
                {getDisplayName(selectedImage)}
              </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={clearImage}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                title={t('genSpace.clearImage')}
              >
                <Trash2 className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
              <button
                onClick={replaceImage}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                title={t('playground.upload.replaceImage')}
              >
                <RefreshCw className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-700 rounded-lg">
              {isDragActive ? (
                <Upload className="h-6 w-6 text-blue-400" />
              ) : (
                <ImageIcon className="h-6 w-6 text-zinc-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {t('playground.upload.dropImage')}
              </p>
              <p className="text-sm text-zinc-500">
                {t('playground.upload.or')} <span className="text-blue-400 underline">{t('playground.upload.uploadFile')}</span>
              </p>
            </div>
          </div>
        )}
      </div>
      {uploadError && (
        <p className="text-xs text-red-400 mt-2">{uploadError}</p>
      )}
      <p className="text-xs text-zinc-500 mt-2">
        {t('playground.upload.supportedFormats', { formats: 'png, jpeg, webp' })}. {t('playground.upload.maxSize', { size: '10MB' })}
      </p>
    </div>
  )
}
