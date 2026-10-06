import { api } from './client'
import type { MediaAsset, PaginatedMedia } from './media'

export type Album = {
  id: number
  title: string
  description: string
  cover_url: string
  item_count: number
  created_at: string
  updated_at: string
}

export async function fetchAlbums(workspaceId: number): Promise<Album[]> {
  const { data } = await api.get<Album[]>(
    `/api/workspaces/${workspaceId}/albums/`,
  )
  return data
}

export async function createAlbum(
  workspaceId: number,
  payload: { title: string; description?: string },
): Promise<Album> {
  const { data } = await api.post<Album>(
    `/api/workspaces/${workspaceId}/albums/`,
    payload,
  )
  return data
}

export async function fetchAlbum(
  workspaceId: number,
  albumId: number,
): Promise<Album> {
  const { data } = await api.get<Album>(
    `/api/workspaces/${workspaceId}/albums/${albumId}/`,
  )
  return data
}

export async function updateAlbum(
  workspaceId: number,
  albumId: number,
  payload: { title: string; description?: string },
): Promise<Album> {
  const { data } = await api.patch<Album>(
    `/api/workspaces/${workspaceId}/albums/${albumId}/`,
    payload,
  )
  return data
}

export async function deleteAlbum(
  workspaceId: number,
  albumId: number,
): Promise<void> {
  await api.delete(`/api/workspaces/${workspaceId}/albums/${albumId}/`)
}

export async function fetchAlbumItems(
  workspaceId: number,
  albumId: number,
  params: { page?: number; page_size?: number } = {},
): Promise<PaginatedMedia> {
  const { data } = await api.get<PaginatedMedia>(
    `/api/workspaces/${workspaceId}/albums/${albumId}/items/`,
    {
      params: {
        page: params.page ?? 1,
        page_size: params.page_size ?? 60,
      },
    },
  )
  return data
}

export async function addAlbumItems(
  workspaceId: number,
  albumId: number,
  mediaIds: number[],
): Promise<{ added: number }> {
  const { data } = await api.post<{ added: number }>(
    `/api/workspaces/${workspaceId}/albums/${albumId}/items/`,
    { media_ids: mediaIds },
  )
  return data
}

export async function removeAlbumItem(
  workspaceId: number,
  albumId: number,
  mediaId: number,
): Promise<void> {
  await api.delete(
    `/api/workspaces/${workspaceId}/albums/${albumId}/items/${mediaId}/`,
  )
}

export type { MediaAsset }
