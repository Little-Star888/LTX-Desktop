import { isElectron } from '../lib/environment'
import { api } from '../lib/api'

type FileType = 'image' | 'audio'

interface UploadResult {
  path: string
  filename?: string
  size?: number
}

export function useFileUpload() {
  const uploadFile = async (
    file: File | string,
    type: FileType
  ): Promise<UploadResult> => {
    if (isElectron && typeof file === 'string') {
      return { path: file }
    }

    if (typeof file === 'string') {
      throw new Error('Web mode requires File object, not file path')
    }

    const result = type === 'image'
      ? await api.uploadImage(file)
      : await api.uploadAudio(file)

    return {
      path: result.file_id,
      filename: result.filename,
      size: result.size,
    }
  }

  const selectAndUpload = async (
    type: FileType,
    accept?: string
  ): Promise<UploadResult | null> => {
    if (isElectron) {
      const filters = type === 'image'
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        : [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]

      const result = await window.electronAPI.showOpenFileDialog({
        title: `Select ${type}`,
        filters,
        properties: ['openFile'],
      })

      if (result && result.length > 0) {
        return { path: result[0] }
      }
      return null
    }

    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept || (type === 'image' ? 'image/*' : 'audio/*')
      
      input.onchange = async (e) => {
        const target = e.target as HTMLInputElement
        const selectedFile = target.files?.[0]
        
        if (selectedFile) {
          try {
            const result = await uploadFile(selectedFile, type)
            resolve(result)
          } catch (error) {
            console.error('Upload failed:', error)
            resolve(null)
          }
        } else {
          resolve(null)
        }
      }

      input.click()
    })
  }

  const readFileAsUrl = async (file: File | string): Promise<string> => {
    if (isElectron && typeof file === 'string') {
      const result = await window.electronAPI.readLocalFile(file)
      return `data:${result.mimeType};base64,${result.data}`
    }

    if (typeof file === 'string') {
      throw new Error('Web mode requires File object, not file path')
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  return {
    uploadFile,
    selectAndUpload,
    readFileAsUrl,
  }
}
