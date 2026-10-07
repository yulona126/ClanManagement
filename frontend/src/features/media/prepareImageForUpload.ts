import { inferContentType, isHeicLike, isImageFile } from './fileKind'

export type PrepareImageOptions = {
  /** Longest edge after re-encode. Default 1920 (feed); use ~1280 for avatars. */
  maxEdge?: number
  /** Always recompress when larger than this. */
  reencodeAboveBytes?: number
  /** Prefer final JPEG under this size. */
  targetMaxBytes?: number
  jpegQuality?: number
  jpegQualityLow?: number
}

const DEFAULTS = {
  maxEdge: 1920,
  reencodeAboveBytes: 1_200_000,
  targetMaxBytes: 1_200_000,
  jpegQuality: 0.72,
  jpegQualityLow: 0.58,
} as const

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

async function decodeImage(file: File, maxEdge: number): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
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
        return {
          source: full,
          width,
          height,
          close: () => full.close(),
        }
      }
    } catch {
      // Fall through
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
 * Normalize phone photos before upload:
 * - HEIC/HEIF → JPEG
 * - Downscale + recompress oversized JPEG/PNG
 */
export async function prepareImageForUpload(
  file: File,
  options: PrepareImageOptions = {},
): Promise<File> {
  if (!isImageFile(file)) return file

  const maxEdge = options.maxEdge ?? DEFAULTS.maxEdge
  const reencodeAboveBytes =
    options.reencodeAboveBytes ?? DEFAULTS.reencodeAboveBytes
  const targetMaxBytes = options.targetMaxBytes ?? DEFAULTS.targetMaxBytes
  const jpegQuality = options.jpegQuality ?? DEFAULTS.jpegQuality
  const jpegQualityLow = options.jpegQualityLow ?? DEFAULTS.jpegQualityLow

  const heic = isHeicLike(file)
  const type = inferContentType(file).toLowerCase()
  const isJpeg = type === 'image/jpeg' || type === 'image/jpg'
  const browserFriendly =
    isJpeg || type === 'image/webp' || type === 'image/gif'

  if (!heic && browserFriendly && file.size <= reencodeAboveBytes) {
    return file
  }

  let decoded: Decoded
  try {
    decoded = await decodeImage(file, maxEdge)
  } catch {
    if (heic || file.size > reencodeAboveBytes) {
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

    const { w, h } = targetSize(width, height, maxEdge)
    const outW = Math.min(w, width)
    const outH = Math.min(h, height)

    let blob = await canvasToJpeg(
      decoded.source,
      outW,
      outH,
      jpegQuality,
    )

    if (blob.size > targetMaxBytes) {
      const tighter = targetSize(outW, outH, Math.min(1600, maxEdge))
      blob = await canvasToJpeg(
        decoded.source,
        tighter.w,
        tighter.h,
        jpegQualityLow,
      )
    }

    if (!heic && blob.size >= file.size) {
      if (file.size <= targetMaxBytes) return file
      throw new Error(
        `图片压缩后仍约 ${(blob.size / 1024 / 1024).toFixed(1)}MB，上传可能失败。请换一张较小的照片。`,
      )
    }

    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch (err) {
    if (
      err instanceof Error &&
      err.message &&
      !err.message.includes('canvas') &&
      !err.message.includes('toBlob') &&
      !err.message.includes('decode')
    ) {
      throw err
    }
    if (heic || file.size > reencodeAboveBytes) {
      throw new Error(
        '压缩这张照片失败（常见于超大 JPEG）。请再试一次，或先缩小后再上传。',
      )
    }
    return file
  } finally {
    decoded.close?.()
  }
}

/** Stricter prep for avatar / cover (display is tiny; keep files small). */
export function prepareAvatarForUpload(file: File): Promise<File> {
  return prepareImageForUpload(file, {
    maxEdge: 640,
    reencodeAboveBytes: 120_000,
    targetMaxBytes: 180_000,
    jpegQuality: 0.8,
    jpegQualityLow: 0.65,
  })
}
