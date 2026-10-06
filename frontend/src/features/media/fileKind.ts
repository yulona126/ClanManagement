/** Shared file-type helpers for picker + upload (iOS HEIC / Live Photo aware). */

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return /\.(mp4|mov|webm|m4v)$/i.test(file.name)
}

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  return /\.(m4a|aac|mp3|ogg|wav|webm)$/i.test(file.name)
}

export function isHeicLike(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t.includes('heic') || t.includes('heif')) return true
  return /\.(heic|heif)$/i.test(file.name)
}

export function isImageFile(file: File): boolean {
  if (isVideoFile(file) || isAudioFile(file)) return false
  if (file.type.startsWith('image/')) return true
  if (isHeicLike(file)) return true
  return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file.name)
}

export function basenameWithoutExt(name: string): string {
  const base = name.split(/[/\\]/).pop() || name
  return base.replace(/\.[^.]+$/, '')
}

/**
 * iOS Live Photos often arrive as IMG_xxxx.HEIC/JPG + IMG_xxxx.MOV.
 * Keep the still; drop the paired short video companion so upload does not
 * treat the Live motion as a full video (large + often fails poster/EXIF path).
 */
export function filterLivePhotoCompanions(files: File[]): File[] {
  if (files.length < 2) return files

  const imageBases = new Set(
    files
      .filter(isImageFile)
      .map((f) => basenameWithoutExt(f.name).toLowerCase()),
  )

  return files.filter((f) => {
    if (!isVideoFile(f)) return true
    const base = basenameWithoutExt(f.name).toLowerCase()
    if (!imageBases.has(base)) return true
    // Paired Live Photo motion clip
    return false
  })
}

/** Infer a stable MIME for presign when iOS leaves `file.type` empty. */
export function inferContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type
  }
  const name = file.name.toLowerCase()
  if (name.endsWith('.heic')) return 'image/heic'
  if (name.endsWith('.heif')) return 'image/heif'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4'
  if (name.endsWith('.mov')) return 'video/quicktime'
  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.m4a')) return 'audio/mp4'
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  if (isVideoFile(file)) return 'video/mp4'
  if (isAudioFile(file)) return 'audio/mp4'
  if (isImageFile(file)) return 'image/jpeg'
  return 'application/octet-stream'
}
