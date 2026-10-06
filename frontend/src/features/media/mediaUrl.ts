/** Resolve media URL for display; rewrite localhost absolute URLs for LAN/phone. */
export function resolveMediaUrl(
  url: string | null | undefined,
  objectKey?: string,
): string {
  if (objectKey) {
    const localPath = `/media/${objectKey.replace(/^\//, '')}`
    if (!url) return localPath
    if (
      url.includes('127.0.0.1') ||
      url.includes('localhost') ||
      url.startsWith('/media/')
    ) {
      // Prefer same-origin /media (Vite proxy) when URL is local or already relative.
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        return localPath
      }
      return url.startsWith('/') ? url : localPath
    }
    return url
  }
  return url || ''
}
