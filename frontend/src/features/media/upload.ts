import {
  completeMedia,
  putToUploadUrl,
  presignMedia,
  type MediaAsset,
  type MediaType,
} from '../../api/media'
import { extractVideoPoster } from './extractVideoPoster'
import {
  filterLivePhotoCompanions,
  inferContentType,
  isAudioFile,
  isImageFile,
  isVideoFile,
} from './fileKind'
import { parseImageExif } from './parseExif'
import { prepareImageForUpload } from './prepareImageForUpload'

export type UploadTarget = {
  recordId?: number
  albumId?: number
  forComment?: boolean
}

const UPLOAD_CONCURRENCY = 3

async function probeImageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      const dims = { width: bmp.width, height: bmp.height }
      bmp.close()
      if (dims.width && dims.height) return dims
    } catch {
      // fall through
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(
        img.naturalWidth && img.naturalHeight
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}
function mediaTypeForFile(file: File): MediaType {
  if (isVideoFile(file)) return 'video'
  if (isAudioFile(file)) return 'audio'
  return 'image'
}

async function uploadPosterObject(
  workspaceId: number,
  poster: File,
  target: UploadTarget,
): Promise<string> {
  const signed = await presignMedia(workspaceId, {
    filename: poster.name,
    content_type: poster.type || 'image/jpeg',
    media_type: 'image',
    record_id: target.recordId,
    album_id: target.albumId,
  })
  await putToUploadUrl(signed.upload_url, poster, signed.headers)
  return signed.object_key
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const i = next
        next += 1
        results[i] = await fn(items[i], i)
      }
    },
  )
  await Promise.all(workers)
  return results
}

export type UploadBatchProgress = {
  completed: number
  total: number
  /** Index into the filtered file list currently finishing / starting. */
  index: number
  phase: 'compress' | 'start' | 'done'
  /** Prepared upload size in bytes (after compress), when known. */
  uploadBytes?: number
}

async function uploadBatch(
  files: File[],
  uploadOne: (
    file: File,
    onPhase?: (phase: 'compress' | 'upload', uploadBytes?: number) => void,
  ) => Promise<MediaAsset>,
  onProgress?: (p: UploadBatchProgress) => void,
): Promise<MediaAsset[]> {
  const prepared = filterLivePhotoCompanions(files)
  const total = prepared.length
  let completed = 0
  return mapPool(prepared, UPLOAD_CONCURRENCY, async (file, index) => {
    onProgress?.({ completed, total, index, phase: 'compress' })
    const asset = await uploadOne(file, (phase, uploadBytes) => {
      onProgress?.({
        completed,
        total,
        index,
        phase: phase === 'compress' ? 'compress' : 'start',
        uploadBytes,
      })
    })
    completed += 1
    onProgress?.({ completed, total, index, phase: 'done' })
    return asset
  })
}

export async function uploadFileToWorkspace(
  workspaceId: number,
  file: File,
  target: UploadTarget = {},
  onPhase?: (phase: 'compress' | 'upload', uploadBytes?: number) => void,
): Promise<MediaAsset> {
  let uploadFile = file
  const rawType = mediaTypeForFile(file)

  // Parse EXIF from the original before canvas re-encode strips it.
  let exif =
    rawType === 'image' && isImageFile(file)
      ? await parseImageExif(file)
      : null

  if (rawType === 'image') {
    onPhase?.('compress')
    uploadFile = await prepareImageForUpload(file)
    // Re-encode bakes pixels; refresh width/height and drop orientation.
    if (uploadFile !== file && exif) {
      const dims = await probeImageSize(uploadFile)
      if (dims) {
        exif = {
          ...exif,
          width: dims.width,
          height: dims.height,
          orientation: undefined,
        }
      }
    }
  }

  const media_type = mediaTypeForFile(uploadFile)
  const content_type =
    media_type === 'audio'
      ? normalizeUploadContentType(inferContentType(uploadFile))
      : inferContentType(uploadFile)
  onPhase?.('upload', uploadFile.size)

  let thumbnail_object_key: string | undefined
  if (media_type === 'video') {
    const poster = await extractVideoPoster(uploadFile)
    if (poster) {
      try {
        thumbnail_object_key = await uploadPosterObject(
          workspaceId,
          poster,
          target,
        )
      } catch {
        thumbnail_object_key = undefined
      }
    }
  }

  const signed = await presignMedia(workspaceId, {
    filename: uploadFile.name,
    content_type,
    media_type,
    record_id: target.recordId,
    album_id: target.albumId,
  })

  await putToUploadUrl(signed.upload_url, uploadFile, signed.headers)

  return completeMedia(workspaceId, {
    record_id: target.recordId,
    album_id: target.albumId,
    object_key: signed.object_key,
    media_type,
    exif,
    thumbnail_object_key,
    for_comment: target.forComment || undefined,
  })
}

export async function uploadFileToRecord(
  workspaceId: number,
  recordId: number,
  file: File,
  options: { forComment?: boolean } = {},
  onPhase?: (phase: 'compress' | 'upload', uploadBytes?: number) => void,
): Promise<MediaAsset> {
  return uploadFileToWorkspace(
    workspaceId,
    file,
    {
      recordId,
      forComment: options.forComment,
    },
    onPhase,
  )
}

export async function uploadFilesToRecord(
  workspaceId: number,
  recordId: number,
  files: File[],
  onProgress?: (p: UploadBatchProgress) => void,
): Promise<MediaAsset[]> {
  return uploadBatch(
    files,
    (file, onPhase) =>
      uploadFileToRecord(workspaceId, recordId, file, {}, onPhase),
    onProgress,
  )
}

export async function uploadFilesToAlbum(
  workspaceId: number,
  albumId: number,
  files: File[],
  onProgress?: (p: UploadBatchProgress) => void,
): Promise<MediaAsset[]> {
  return uploadBatch(
    files,
    (file, onPhase) =>
      uploadFileToWorkspace(workspaceId, file, { albumId }, onPhase),
    onProgress,
  )
}

export async function uploadFilesToLibrary(
  workspaceId: number,
  files: File[],
  onProgress?: (p: UploadBatchProgress) => void,
): Promise<MediaAsset[]> {
  return uploadBatch(
    files,
    (file, onPhase) => uploadFileToWorkspace(workspaceId, file, {}, onPhase),
    onProgress,
  )
}

function extensionForMime(mimeType: string): string {
  const t = mimeType.toLowerCase()
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) {
    return 'm4a'
  }
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3'
  return 'webm'
}

/** Strip codecs=… so OSS signed Content-Type matches the PUT header. */
function normalizeUploadContentType(mimeType: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (base === 'audio/aac' || base === 'audio/x-m4a') return 'audio/mp4'
  if (base) return base
  return 'application/octet-stream'
}

export async function uploadAudioBlobToRecord(
  workspaceId: number,
  recordId: number,
  blob: Blob,
  mimeType: string,
  options: { forComment?: boolean } = {},
): Promise<MediaAsset> {
  const contentType = normalizeUploadContentType(
    mimeType || blob.type || 'audio/webm',
  )
  const ext = extensionForMime(contentType)
  const file = new File([blob], `voice-${Date.now()}.${ext}`, {
    type: contentType,
  })
  return uploadFileToRecord(workspaceId, recordId, file, options)
}
