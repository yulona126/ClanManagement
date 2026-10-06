import { inferContentType, isHeicLike, isImageFile } from './fileKind'

/** Longest edge after re-encode (keeps family photos sharp, cuts phone original size). */
const MAX_EDGE = 2560
/** Re-encode JPEG/PNG when larger than this (bytes), even if already under MAX_EDGE. */
const REENCODE_IF_LARGER_THAN = 1_800_000
const JPEG_QUALITY = 0.82

type Decoded = {
  source: CanvasImageSource
  width: number
  height: number
  close?: () => void
}

async function decodeImage(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        close: () => bmp.close(),
      }
    } catch {
      // Fall through — Safari sometimes needs <img> for HEIC.
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
  const ctx = canvas.getContext('2d')
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
 * - HEIC/HEIF → JPEG (browsers + OSS image process struggle with raw HEIC)
 * - Downscale long edge > 2560
 * - Recompress oversized JPEG/PNG
 *
 * Returns the original File when no change is needed.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isImageFile(file)) return file

  const heic = isHeicLike(file)
  const type = inferContentType(file).toLowerCase()
  const isJpeg = type === 'image/jpeg' || type === 'image/jpg'
  const isPng = type === 'image/png'
  const browserFriendly =
    isJpeg || type === 'image/webp' || type === 'image/gif'

  // Skip decode for already-web-friendly files under the size budget.
  if (!heic && browserFriendly && file.size <= REENCODE_IF_LARGER_THAN) {
    return file
  }

  let decoded: Decoded
  try {
    decoded = await decodeImage(file)
  } catch {
    if (heic) {
      throw new Error(
        '无法处理这张 HEIC/实况照片。请在系统相册中用「拷贝照片」或导出为 JPEG 后再试。',
      )
    }
    return file
  }

  try {
    const { width, height } = decoded
    if (!width || !height) {
      if (heic) {
        throw new Error(
          '无法解码这张 HEIC 照片。请导出为 JPEG 后再上传。',
        )
      }
      return file
    }

    const longEdge = Math.max(width, height)
    const needsScale = longEdge > MAX_EDGE
    const needsFormat =
      heic || (isPng && file.size > REENCODE_IF_LARGER_THAN)
    const needsCompress =
      file.size > REENCODE_IF_LARGER_THAN || needsScale || needsFormat

    if (!needsCompress) {
      return file
    }

    const scale = needsScale ? MAX_EDGE / longEdge : 1
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const blob = await canvasToJpeg(decoded.source, w, h, JPEG_QUALITY)

    // If re-encode grew the file (rare), keep original unless HEIC (must convert).
    if (!heic && blob.size >= file.size && !needsScale) {
      return file
    }

    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } finally {
    decoded.close?.()
  }
}
