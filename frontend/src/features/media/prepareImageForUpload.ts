import { inferContentType, isHeicLike, isImageFile } from './fileKind'

/** Longest edge after re-encode — favours upload speed on mobile networks. */
const MAX_EDGE = 1920
/** Always recompress when larger than this. */
const REENCODE_IF_LARGER_THAN = 1_200_000
/** Prefer not to upload anything larger than this after prepare. */
const TARGET_MAX_BYTES = 1_200_000
const JPEG_QUALITY = 0.72
const JPEG_QUALITY_LOW = 0.58

type Decoded = {
  source: CanvasImageSource
  width: number
  height: number
  close?: () => void
}

function targetSize(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) {
    return { w: width, h: height, scaled: false }
  }
  const scale = maxEdge / longEdge
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
    scaled: true,
  }
}

/**
 * Decode and preferably downscale in one step (avoids keeping a 12MP bitmap
 * around on phones when we only need ~1920 long edge).
 */
async function decodeImage(file: File, maxEdge: number): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      // First pass: get natural size (needed for correct aspect).
      const full = await createImageBitmap(file)
      const { width, height } = full
      const { w, h, scaled } = targetSize(width, height, maxEdge)
      if (!scaled) {
        return {
          source: full,
          width,
          height,
          close: () => full.close(),
        }
      }
      try {
        const small = await createImageBitmap(full, {
          resizeWidth: w,
          resizeHeight: h,
          resizeQuality: 'medium',
        })
        full.close()
        return {
          source: small,
          width: small.width,
          height: small.height,
          close: () => small.close(),
        }
      } catch {
        // Fall back to drawing the full bitmap into a smaller canvas later.
        return {
          source: full,
          width,
          height,
          close: () => full.close(),
        }
      }
    } catch {
      // Fall through — Safari HEIC / older WebViews.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    img.src = url
  })
}

function canvasToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return Promise.reject(new Error('canvas'))
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function jpegName(original: string): string {
  const base = original.replace(/\.[^.]+$/, '') || 'photo'
  return `${base}.jpg`
}

/**
 * Normalize phone photos before OSS PUT:
 * - HEIC/HEIF → JPEG
 * - Downscale long edge > 1920
 * - Recompress oversized JPEG/PNG (e.g. 9MB phone originals → ~300–800KB)
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isImageFile(file)) return file

  const heic = isHeicLike(file)
  const type = inferContentType(file).toLowerCase()
  const isJpeg = type === 'image/jpeg' || type === 'image/jpg'
  const browserFriendly =
    isJpeg || type === 'image/webp' || type === 'image/gif'

  if (!heic && browserFriendly && file.size <= REENCODE_IF_LARGER_THAN) {
    return file
  }

  let decoded: Decoded
  try {
    decoded = await decodeImage(file, MAX_EDGE)
  } catch {
    if (heic || file.size > REENCODE_IF_LARGER_THAN) {
      throw new Error(
        '图片过大或无法解码。请换一张，或在相册里用「导出 JPEG / 缩小」后再试。',
      )
    }
    return file
  }

  try {
    const { width, height } = decoded
    if (!width || !height) {
      throw new Error('无法读取图片尺寸，请换一张后再试。')
    }

    const { w, h } = targetSize(width, height, MAX_EDGE)
    // decoded may already be resized; draw at its bitmap size if smaller target applied.
    const outW = Math.min(w, width)
    const outH = Math.min(h, height)

    let blob = await canvasToJpeg(
      decoded.source,
      outW,
      outH,
      JPEG_QUALITY,
    )

    // Still huge (detail-rich scene): one more pass at lower quality / edge.
    if (blob.size > TARGET_MAX_BYTES) {
      const tighter = targetSize(outW, outH, 1600)
      blob = await canvasToJpeg(
        decoded.source,
        tighter.w,
        tighter.h,
        JPEG_QUALITY_LOW,
      )
    }

    if (!heic && blob.size >= file.size) {
      // Re-encode didn't help — keep original only if it is already modest.
      if (file.size <= TARGET_MAX_BYTES) return file
      throw new Error(
        `图片压缩后仍约 ${(blob.size / 1024 / 1024).toFixed(1)}MB，上传可能失败。请换一张较小的照片。`,
      )
    }

    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch (err) {
    if (err instanceof Error && err.message && !err.message.includes('canvas') && !err.message.includes('toBlob') && !err.message.includes('decode')) {
      throw err
    }
    if (heic || file.size > REENCODE_IF_LARGER_THAN) {
      throw new Error(
        '压缩这张照片失败（常见于超大 JPEG）。请再试一次，或先缩小后再上传。',
      )
    }
    return file
  } finally {
    decoded.close?.()
  }
}
