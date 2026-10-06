import { api } from './client'

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export type LatestMemory = {
  id: number
  content_preview: string
  created_at: string
  cover_thumbnail_url: string
  cover_media_type: string
}

export type Workspace = {
  id: number
  name: string
  baby_name: string
  baby_birthday: string | null
  avatar_url: string
  created_at: string
  my_role: WorkspaceRole
  my_relation_label: string
  photo_count: number
  video_count: number
  member_count: number
  last_activity_at: string
  latest_memory: LatestMemory | null
}

export type WorkspaceCreatePayload = {
  baby_name: string
  relation_label: string
  name?: string
  baby_birthday?: string | null
}

export type Membership = {
  id: number
  user_id: number
  username: string
  role: WorkspaceRole
  relation_label: string
  display_name?: string
  avatar_url?: string
  bio?: string
  generation?: number | null
  created_at: string
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const { data } = await api.get<Workspace[]>('/api/workspaces/')
  return data
}

export async function fetchWorkspace(id: number): Promise<Workspace> {
  const { data } = await api.get<Workspace>(`/api/workspaces/${id}/`)
  return data
}

export async function createWorkspace(
  payload: WorkspaceCreatePayload,
): Promise<Workspace> {
  const { data } = await api.post<Workspace>('/api/workspaces/', payload)
  return data
}

export type WorkspaceUpdatePayload = {
  name?: string
  baby_name?: string
  baby_birthday?: string | null
}

export async function patchWorkspace(
  workspaceId: number,
  payload: WorkspaceUpdatePayload,
): Promise<Workspace> {
  const { data } = await api.patch<Workspace>(
    `/api/workspaces/${workspaceId}/`,
    payload,
  )
  return data
}

export async function uploadWorkspaceAvatar(
  workspaceId: number,
  file: File,
): Promise<Workspace> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<Workspace>(
    `/api/workspaces/${workspaceId}/avatar/`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function fetchMembers(workspaceId: number): Promise<Membership[]> {
  const { data } = await api.get<Membership[]>(
    `/api/workspaces/${workspaceId}/members/`,
  )
  return data
}

export async function patchMember(
  workspaceId: number,
  membershipId: number,
  payload: Partial<Pick<Membership, 'role' | 'relation_label'>>,
): Promise<Membership> {
  const { data } = await api.patch<Membership>(
    `/api/workspaces/${workspaceId}/members/${membershipId}/`,
    payload,
  )
  return data
}

export async function inviteMember(
  workspaceId: number,
  payload: {
    username: string
    password?: string
    role: WorkspaceRole
    relation_label: string
    anchor_membership_id?: number
    anchor_label?: string
  },
): Promise<Membership> {
  const { data } = await api.post<Membership>(
    `/api/workspaces/${workspaceId}/members/invite/`,
    payload,
  )
  return data
}

export async function removeMember(
  workspaceId: number,
  membershipId: number,
): Promise<void> {
  await api.delete(`/api/workspaces/${workspaceId}/members/${membershipId}/`)
}
