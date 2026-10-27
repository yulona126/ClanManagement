import { api } from './client'
import type { MediaAsset } from './media'

/** 列表里带出的评论摘要（朋友圈式，避免每条动态单独请求评论）。 */
export type RecordCommentPreview = {
  id: number
  author_id: number
  author_relation_label: string
  author_avatar_url?: string
  body: string
  has_audio?: boolean
  created_at: string
}

export type GrowthRecord = {
  id: number
  title: string
  content: string
  author_id: number
  author_relation_label: string
  author_avatar_url?: string
  created_at: string
  updated_at: string
  media: MediaAsset[]
  /**
   * 评论总数与最近 3 条。
   *
   * 旧版后端没有这两个字段（undefined）——此时前端回退为「不展示预览」，
   * 而不是显示成 0 条。
   */
  comment_count?: number
  latest_comments?: RecordCommentPreview[]
}

export type PaginatedRecords = {
  count: number
  next: string | null
  previous: string | null
  results: GrowthRecord[]
}

export type RecordWritePayload = {
  title?: string
  content?: string
}

export async function fetchRecords(
  workspaceId: number,
  page = 1,
): Promise<PaginatedRecords> {
  const { data } = await api.get<PaginatedRecords>(
    `/api/workspaces/${workspaceId}/records/`,
    { params: { page } },
  )
  return data
}

export async function fetchRecord(
  workspaceId: number,
  recordId: number,
): Promise<GrowthRecord> {
  const { data } = await api.get<GrowthRecord>(
    `/api/workspaces/${workspaceId}/records/${recordId}/`,
  )
  return data
}

export async function createRecord(
  workspaceId: number,
  payload: RecordWritePayload,
): Promise<GrowthRecord> {
  const { data } = await api.post<GrowthRecord>(
    `/api/workspaces/${workspaceId}/records/`,
    payload,
  )
  return data
}

export async function updateRecord(
  workspaceId: number,
  recordId: number,
  payload: RecordWritePayload,
): Promise<GrowthRecord> {
  const { data } = await api.patch<GrowthRecord>(
    `/api/workspaces/${workspaceId}/records/${recordId}/`,
    payload,
  )
  return data
}

export async function deleteRecord(
  workspaceId: number,
  recordId: number,
): Promise<void> {
  await api.delete(`/api/workspaces/${workspaceId}/records/${recordId}/`)
}
