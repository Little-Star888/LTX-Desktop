export const isElectron = typeof window !== 'undefined' && 
  typeof (window as any).electronAPI !== 'undefined'

export const isWeb = !isElectron

export function getApiBaseUrl(): string {
  if (isElectron) {
    return ''
  }
  return import.meta.env.VITE_API_URL || ''
}

export function getWebSocketBaseUrl(): string {
  if (isElectron) {
    return ''
  }
  const apiUrl = import.meta.env.VITE_API_URL || ''
  return apiUrl.replace('http://', 'ws://').replace('https://', 'wss://')
}
