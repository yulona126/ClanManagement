import { api } from './client'

export type MediaType = 'image' | 'video' | 'audio'

export type MediaAsset = {
  id: number
  record_id: number | null
  media_type: MediaType | string
  object_key: string
  file_url: string
  thumbnail_url: string
  width?: number | null
  height?: number | null
  taken_at: string | null
  captured_at?: string
  taken_at_source?: 'exif' | 'upload' | string
  camera_make?: string
  camera_model?: string
  orientation?: number | null
  latitude?: string | null
  longitude?: string | null
  /** Present on detail / complete responses; omitted from list payloads. */
  exif_json?: Record<string, unknown>
  created_at: string
}

export type PaginatedMedia = {
  count: number
  next: string | null
  previous: string | null
  results: MediaAsset[]
}

export type ExifPayload = {
  width?: number
  height?: number
  taken_at?: string
  orientation?: number
  make?: string
  model?: string
  gps?: { lat: number; lng: number }
  extra?: Record<string, unknown>
}

export type PresignResponse = {
  upload_url: string
  file_url: string
  object_key: string
  headers: Record<string, string>
  expires_in: number
}

export async function fetchMediaLibrary(
  workspaceId: number,
  params: { page?: number; media_type?: string; page_size?: number } = {},
): Promise<PaginatedMedia> {
  const { data } = await api.get<PaginatedMedia>(
    `/api/workspaces/${workspaceId}/media/`,
    {
      params: {
        page: params.page ?? 1,
        media_type: params.media_type ?? 'image',
        page_size: params.page_size ?? 40,
      },
    },
  )
  return data
}

export async function presignMedia(
  workspaceId: number,
  payload: {
    filename: string
    content_type: string
    media_type: MediaType
    record_id?: number | null
    album_id?: number | null
  },
): Promise<PresignResponse> {
  const { data } = await api.post<PresignResponse>(
    `/api/workspaces/${workspaceId}/media/presign/`,
    payload,
  )
  return data
}

export async function completeMedia(
  workspaceId: number,
  payload: {
    object_key: string
    media_type: MediaType
    record_id?: number | null
    album_id?: number | null
    exif?: ExifPayload | null
    /** Uploaded poster JPEG key (video only); not registered as its own MediaAsset. */
    thumbnail_object_key?: string
    /** Voice comment asset — excluded from post media / gallery. */
    for_comment?: boolean
  },
): Promise<MediaAsset> {
  const { data } = await api.post<MediaAsset>(
    `/api/workspaces/${workspaceId}/media/complete/`,
    payload,
  )
  return data
}

/** Scale PUT timeout with size (min 60s, ~80KB/s floor, cap 10 min). */
function putTimeoutMs(byteLength: number): number {
  const fromSize = Math.ceil(byteLength / 80_000) * 1000
  return Math.min(600_000, Math.max(60_000, fromSize))
}

export async function putToUploadUrl(
  uploadUrl: string,
  file: Blob,
  headers: Record<string, string>,
): Promise<void> {
  const controller = new AbortController()
  const timer = window.setTimeout(
    () => controller.abort(),
    putTimeoutMs(file.size),
  )
  let res: Response
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: file,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('上传超时，请检查网络后重试（大图已会自动压缩）。')
    }
    throw new Error(
      '无法直传对象存储（多为 CORS 或 Bucket 配置问题）。请对生产域名执行 configure_oss_cors --origin https://你的域名',
    )
  } finally {
    window.clearTimeout(timer)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 403) {
      throw new Error(
        '上传被拒绝（403）。常见原因：预签名 Content-Type 与文件不一致，或 OSS CORS/权限未配好。',
      )
    }
    throw new Error(
      `上传失败 HTTP ${res.status}${text ? ` ${text.slice(0, 120)}` : ''}`,
    )
  }
}
