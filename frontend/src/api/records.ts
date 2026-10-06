import { api } from './client'
import type { MediaAsset } from './media'

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
