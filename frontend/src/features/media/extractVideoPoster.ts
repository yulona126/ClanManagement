/** Grab one JPEG frame from a video File (upload-time poster; not on every view). */

export async function extractVideoPoster(
  file: File,
  seekSeconds = 1,
): Promise<File | null> {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
    return null
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.src = objectUrl

      let settled = false
      const finish = (value: Blob | null) => {
        if (settled) return
        settled = true
        video.removeAttribute('src')
        video.load()
        resolve(value)
      }

      const timeout = window.setTimeout(() => finish(null), 12000)

      video.onerror = () => {
        window.clearTimeout(timeout)
        finish(null)
      }

      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        const t =
          duration > 0
            ? Math.min(seekSeconds, Math.max(0.05, duration * 0.05))
            : seekSeconds
        try {
          video.currentTime = t
        } catch {
          window.clearTimeout(timeout)
          finish(null)
        }
      }

      video.onseeked = () => {
        window.clearTimeout(timeout)
        try {
          const w = video.videoWidth
          const h = video.videoHeight
          if (!w || !h) {
            finish(null)
            return
          }
          const maxW = 800
          const scale = w > maxW ? maxW / w : 1
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(w * scale))
          canvas.height = Math.max(1, Math.round(h * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            finish(null)
            return
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((b) => finish(b), 'image/jpeg', 0.85)
        } catch {
          finish(null)
        }
      }
    })

    if (!blob) return null
    const base = file.name.replace(/\.[^.]+$/, '') || 'video'
    return new File([blob], `${base}-poster.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
