import { isElectron, getApiBaseUrl, getWebSocketBaseUrl } from './environment'

let cachedCredentials: { url: string; token: string } | null = null

async function getCredentials(): Promise<{ url: string; token: string }> {
  if (isElectron) {
    if (!cachedCredentials) {
      cachedCredentials = await window.electronAPI.getBackend()
    }
    return cachedCredentials
  }
  return { url: getApiBaseUrl(), token: '' }
}

export function resetCredentials(): void {
  cachedCredentials = null
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { url, token } = await getCredentials()
  const headers = new Headers(init?.headers)
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  
  const fetchInit: RequestInit = {
    ...init,
    headers,
  }
  
  if (!isElectron) {
    fetchInit.credentials = 'include'
  }
  
  return fetch(`${url}${path}`, fetchInit)
}

export async function apiFetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function getWebSocketUrl(path: string): Promise<string> {
  if (isElectron) {
    const { url, token } = await getCredentials()
    const ws = url.replace('http://', 'ws://')
    const sep = path.includes('?') ? '&' : '?'
    return `${ws}${path}${sep}token=${token}`
  }
  
  const wsBase = getWebSocketBaseUrl()
  return `${wsBase}${path}`
}

export const api = {
  async getModels() {
    return apiFetchJson<{ id: string; name: string; description: string }[]>('/api/models')
  },

  async getModelsStatus() {
    return apiFetchJson('/api/models/status')
  },

  async getRequiredModels(skipTextEncoder = false) {
    return apiFetchJson(`/api/models/required-models?skipTextEncoder=${skipTextEncoder}`)
  },

  async startModelDownload(modelTypes: string[]) {
    return apiFetchJson('/api/models/download', {
      method: 'POST',
      body: JSON.stringify({ modelTypes }),
    })
  },

  async getDownloadProgress(sessionId: string) {
    return apiFetchJson(`/api/models/download/progress?sessionId=${sessionId}`)
  },

  async generateVideo(params: Record<string, unknown>) {
    return apiFetchJson('/api/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async generateImage(params: Record<string, unknown>) {
    return apiFetchJson('/api/generate-image', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async getGenerationProgress() {
    return apiFetchJson('/api/generation/progress')
  },

  async cancelGeneration() {
    return apiFetchJson('/api/generate/cancel', { method: 'POST' })
  },

  async uploadImage(file: File): Promise<{ file_id: string; filename: string; size: number }> {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await apiFetch('/api/remote/upload-image', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }
    
    return response.json()
  },

  async uploadAudio(file: File): Promise<{ file_id: string; filename: string; size: number }> {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await apiFetch('/api/remote/upload-audio', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }
    
    return response.json()
  },

  async uploadVideo(file: File): Promise<{ file_id: string; filename: string; size: number }> {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await apiFetch('/api/remote/upload-video', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }
    
    return response.json()
  },

  async listVideos() {
    return apiFetchJson('/api/remote/videos')
  },

  getVideoDownloadUrl(filename: string): string {
    const baseUrl = getApiBaseUrl()
    return `${baseUrl}/api/remote/download/${filename}`
  },

  async deleteVideo(filename: string) {
    return apiFetchJson(`/api/remote/videos/${filename}`, { method: 'DELETE' })
  },

  async getHealth() {
    return apiFetchJson('/health')
  },

  async getGpuInfo() {
    return apiFetchJson('/api/gpu-info')
  },

  async getSettings() {
    return apiFetchJson('/api/settings')
  },

  async updateSettings(settings: Record<string, unknown>) {
    return apiFetchJson('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    })
  },

  async retake(params: Record<string, unknown>) {
    return apiFetchJson('/api/retake', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async icLoraExtractConditioning(params: Record<string, unknown>) {
    return apiFetchJson('/api/ic-lora/extract-conditioning', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async icLoraGenerate(params: Record<string, unknown>) {
    return apiFetchJson('/api/ic-lora/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async suggestGapPrompt(params: Record<string, unknown>) {
    return apiFetchJson('/api/suggest-gap-prompt', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async remoteGenerate(formData: FormData) {
    const response = await apiFetch('/api/remote/generate', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`)
    }
    
    return response.json()
  },

  async preprocessImage(params: { image_path: string; mode: 'canny' | 'depth' | 'pose' | 'canny_img2img' | 'depth_img2img' | 'pose_img2img' }) {
    return apiFetchJson('/api/preprocess-image', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async imageToImage(params: Record<string, unknown>) {
    return apiFetchJson('/api/image-to-image', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },
}

export { apiFetch as backendFetch }
