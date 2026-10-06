import {
  completeMedia,
  putToUploadUrl,
  presignMedia,
  type MediaAsset,
  type MediaType,
} from '../../api/media'
import { extractVideoPoster } from './extractVideoPoster'
import { parseImageExif } from './parseExif'

export type UploadTarget = {
  recordId?: number
  albumId?: number
  forComment?: boolean
}

function mediaTypeForFile(file: File): MediaType {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (
    !file.type &&
    /\.(mp4|mov|webm|m4v)$/i.test(file.name)
  ) {
    return 'video'
  }
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

export async function uploadFileToWorkspace(
  workspaceId: number,
  file: File,
  target: UploadTarget = {},
): Promise<MediaAsset> {
  const media_type = mediaTypeForFile(file)
  const content_type = file.type || 'application/octet-stream'
  const exif =
    media_type === 'image' ? await parseImageExif(file) : null

  let thumbnail_object_key: string | undefined
  if (media_type === 'video') {
    const poster = await extractVideoPoster(file)
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
    filename: file.name,
    content_type,
    media_type,
    record_id: target.recordId,
    album_id: target.albumId,
  })

  await putToUploadUrl(signed.upload_url, file, signed.headers)

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
): Promise<MediaAsset> {
  return uploadFileToWorkspace(workspaceId, file, {
    recordId,
    forComment: options.forComment,
  })
}

export async function uploadFilesToRecord(
  workspaceId: number,
  recordId: number,
  files: File[],
): Promise<MediaAsset[]> {
  const out: MediaAsset[] = []
  for (const file of files) {
    out.push(await uploadFileToRecord(workspaceId, recordId, file))
  }
  return out
}

export async function uploadFilesToAlbum(
  workspaceId: number,
  albumId: number,
  files: File[],
): Promise<MediaAsset[]> {
  const out: MediaAsset[] = []
  for (const file of files) {
    out.push(
      await uploadFileToWorkspace(workspaceId, file, { albumId }),
    )
  }
  return out
}

export async function uploadFilesToLibrary(
  workspaceId: number,
  files: File[],
): Promise<MediaAsset[]> {
  const out: MediaAsset[] = []
  for (const file of files) {
    out.push(await uploadFileToWorkspace(workspaceId, file))
  }
  return out
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
    return 'm4a'
  }
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'webm'
}

export async function uploadAudioBlobToRecord(
  workspaceId: number,
  recordId: number,
  blob: Blob,
  mimeType: string,
  options: { forComment?: boolean } = {},
): Promise<MediaAsset> {
  const ext = extensionForMime(mimeType)
  const file = new File([blob], `voice-${Date.now()}.${ext}`, {
    type: mimeType || blob.type || 'audio/webm',
  })
  return uploadFileToRecord(workspaceId, recordId, file, options)
}
