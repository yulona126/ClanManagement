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

export type AvatarDisplaySize = 'sm' | 'md' | 'lg' | 'cover'

/** Longest edge requested from OSS image process (≈2× UI size). */
const AVATAR_OSS_WIDTH: Record<AvatarDisplaySize, number> = {
  sm: 96,
  md: 160,
  lg: 360,
  cover: 720,
}

/**
 * Append Aliyun OSS image process for small avatar / cover displays.
 * Local `/media/...` and non-http URLs are returned unchanged.
 */
export function withOssImageResize(url: string, width: number): string {
  const u = (url || '').trim()
  if (!u || width <= 0) return u
  if (u.startsWith('/')) return u
  if (!/^https?:\/\//i.test(u)) return u
  if (u.includes('x-oss-process=')) return u
  // Skip obviously non-image / already processed query-heavy signed URLs carefully:
  // avatars use public_url without query string.
  const sep = u.includes('?') ? '&' : '?'
  return `${u}${sep}x-oss-process=image/resize,w_${width},m_lfit`
}

/** Avatar / workspace photo URL sized for the UI slot. */
export function resolveAvatarUrl(
  url: string | null | undefined,
  size: AvatarDisplaySize = 'sm',
): string {
  const base = resolveMediaUrl((url || '').trim() || undefined)
  if (!base) return ''
  return withOssImageResize(base, AVATAR_OSS_WIDTH[size])
}
