import { isElectron } from './environment'

/**
 * Extract a filesystem path from a `file://` URL.
 * Returns `null` when the URL is not a file URL.
 */
export function fileUrlToPath(url: string): string | null {
  if (url.startsWith('file://')) {
    let p = decodeURIComponent(url.slice(7)) // file:///Users/x -> /Users/x
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
    return p
  }
  return null
}

/**
 * Convert a filesystem path to a URL that can be loaded by the browser.
 * In Electron mode, returns a file:// URL.
 * In Web mode, converts /data/outputs paths to /outputs URLs.
 */
export function pathToUrl(path: string): string {
  if (isElectron) {
    const normalized = path.replace(/\\/g, '/')
    return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
  }
  
  // Web mode: convert /data/outputs/... to /outputs/...
  const normalized = path.replace(/\\/g, '/')
  if (normalized.startsWith('/data/outputs/')) {
    return normalized.replace('/data/outputs/', '/outputs/')
  }
  if (normalized.startsWith('/data/uploads/')) {
    return normalized.replace('/data/uploads/', '/uploads/')
  }
  
  // Fallback: return as-is (might not work, but better than nothing)
  return normalized
}
