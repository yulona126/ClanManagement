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

/**
 * 解码图片。
 *
 * **不要**用 `createImageBitmap(src, {resizeWidth, resizeHeight})` 来做缩放：
 * WebKit 上这个调用对部分大图/带 EXIF 方向的照片会返回"空位图"，
 * 画到 canvas 上什么都不出现；canvas 又是 `alpha:false`（默认黑底），
 * 于是编码结果是**纯黑 JPEG**，且尺寸正好等于目标尺寸。
 *
 * 线上确实出现过这个：一张 1440×1920 的 JPEG，276 万像素全为 (0,0,0)、
 * 颜色数=1、无 EXIF —— 就是这条路径产生的。
 *
 * 因此这里只解码到原始尺寸，缩放交给 canvas 的 drawImage（久经考验）。
 */
async function decodeImage(file: File, _maxEdge: number): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      if (bmp.width && bmp.height) {
        return {
          source: bmp,
          width: bmp.width,
          height: bmp.height,
          close: () => bmp.close(),
        }
      }
      bmp.close()
    } catch {
      // 回退到 <img>
    }
  }

  return decodeWithImgElement(file)
}

/** 用 <img> 解码：兼容性最好，浏览器会自动处理 EXIF 方向。 */
function decodeWithImgElement(file: File): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('decode'))
        return
      }
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

/**
 * 判断编码出来的图是不是「整张纯黑」。
 *
 * 不是看平均亮度（夜景照片也可能很暗），而是要求**每个采样点的每个通道都是 0**。
 * 真实照片几乎不可能满足（传感器噪声、压缩误差都会留下非 0 值），
 * 而空 canvas 编码出来的图必然满足。
 *
 * 判断失败（解码异常等）时返回 false，不阻断上传。
 */
export async function isAllBlack(blob: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(blob)
    const size = 8
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      bmp.close()
      return false
    }
    ctx.drawImage(bmp, 0, 0, size, size)
    bmp.close()
    const { data } = ctx.getImageData(0, 0, size, size)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return false
    }
    return true
  } catch {
    return false
  }
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
/**
 * 把图片规范化后上传：
 * - HEIC/HEIF → JPEG
 * - 过大的 JPEG/PNG → 降尺寸 + 重压缩
 *
 * 关键防护：编码结果如果是「整张纯黑」，判定为失败并回退，绝不把黑图传上去。
 * 详见 decodeImage 里关于 createImageBitmap 缩放缺陷的说明。
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

  // 常见情况：本来就是浏览器能显示、体积也不大的图，原样上传（不再重编码）
  if (!heic && browserFriendly && file.size <= reencodeAboveBytes) {
    return file
  }

  /**
   * 编码一次并做黑图校验；返回 null 表示这次编码不可用。
   * decode 来源可选，用来在失败后换一条解码路径重试。
   */
  async function encodeOnce(source: Decoded): Promise<Blob | null> {
    const { width, height } = source
    if (!width || !height) return null

    const { w, h } = targetSize(width, height, maxEdge)
    const outW = Math.min(w, width)
    const outH = Math.min(h, height)

    let blob = await canvasToJpeg(source.source, outW, outH, jpegQuality)
    if (await isAllBlack(blob)) return null

    if (blob.size > targetMaxBytes) {
      const tighter = targetSize(outW, outH, Math.min(1600, maxEdge))
      const smaller = await canvasToJpeg(
        source.source,
        tighter.w,
        tighter.h,
        jpegQualityLow,
      )
      if (await isAllBlack(smaller)) return null
      blob = smaller
    }
    return blob
  }

  let blob: Blob | null = null

  // 第一次：常规解码（createImageBitmap，不缩放）
  const first = await tryDecode(file, maxEdge)
  if (first) {
    try {
      blob = await encodeOnce(first)
    } catch {
      blob = null
    } finally {
      first.close?.()
    }
  }

  // 第二次：换 <img> 解码再试（绕开某些浏览器 createImageBitmap 的怪问题）
  if (!blob) {
    const second = await tryDecodeWithImg(file)
    if (second) {
      try {
        blob = await encodeOnce(second)
      } catch {
        blob = null
      }
    }
  }

  if (!blob) {
    /*
     * 两条路径都拿不到可用结果。
     * - 非 HEIC：直接上传原文件。宁可文件大一点，也好过传一张黑图。
     * - HEIC：浏览器基本无法显示，必须转换，只能报错让用户换格式。
     */
    if (!heic) return file
    throw new Error(
      '这张照片转换失败（可能是 HEIC 特殊编码）。请在相册里用「导出 JPEG」后再试。',
    )
  }

  // 压缩后反而更大，且原文件本来就不大 → 用原文件
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
}

/** 解码失败时返回 null，交给调用方决定回退策略。 */
async function tryDecode(file: File, maxEdge: number): Promise<Decoded | null> {
  try {
    return await decodeImage(file, maxEdge)
  } catch {
    return null
  }
}

async function tryDecodeWithImg(file: File): Promise<Decoded | null> {
  try {
    return await decodeWithImgElement(file)
  } catch {
    return null
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
