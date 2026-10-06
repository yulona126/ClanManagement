import { api } from './client'
import type { MediaAsset } from './media'

export type Comment = {
  id: number
  author_id: number
  author_relation_label: string
  record_id: number | null
  media_id: number | null
  body: string
  audio: MediaAsset | null
  created_at: string
}

export type CommentWritePayload = {
  body?: string
  audio_id?: number
}

export type PaginatedComments = {
  count: number
  next: string | null
  previous: string | null
  results: Comment[]
}

export async function fetchRecordComments(
  workspaceId: number,
  recordId: number,
  page = 1,
): Promise<PaginatedComments> {
  const { data } = await api.get<PaginatedComments>(
    `/api/workspaces/${workspaceId}/records/${recordId}/comments/`,
    { params: { page, page_size: 30 } },
  )
  return data
}

export async function postRecordComment(
  workspaceId: number,
  recordId: number,
  payload: CommentWritePayload,
): Promise<Comment> {
  const { data } = await api.post<Comment>(
    `/api/workspaces/${workspaceId}/records/${recordId}/comments/`,
    payload,
  )
  return data
}

export async function fetchMediaComments(
  workspaceId: number,
  mediaId: number,
  page = 1,
): Promise<PaginatedComments> {
  const { data } = await api.get<PaginatedComments>(
    `/api/workspaces/${workspaceId}/media/${mediaId}/comments/`,
    { params: { page, page_size: 30 } },
  )
  return data
}

export async function postMediaComment(
  workspaceId: number,
  mediaId: number,
  payload: CommentWritePayload,
): Promise<Comment> {
  const { data } = await api.post<Comment>(
    `/api/workspaces/${workspaceId}/media/${mediaId}/comments/`,
    payload,
  )
  return data
}

export async function deleteComment(
  workspaceId: number,
  commentId: number,
): Promise<void> {
  await api.delete(`/api/workspaces/${workspaceId}/comments/${commentId}/`)
}
