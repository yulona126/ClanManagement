import { api } from './client'
import type { Membership, WorkspaceRole } from './workspaces'

export type ManageUser = {
  id: number
  username: string
  email: string
  is_staff: boolean
}

export type ManageWorkspace = {
  id: number
  name: string
  baby_name: string
  baby_birthday: string | null
  avatar_url: string
  created_at: string
}

export type ManageMembership = Membership & {
  workspace_id: number
  workspace_name: string
  baby_name: string
}

export async function listManageUsers(): Promise<ManageUser[]> {
  const { data } = await api.get<ManageUser[]>('/api/manage/users/')
  return data
}

export async function createManageUser(payload: {
  username: string
  password: string
  email?: string
}): Promise<ManageUser> {
  const { data } = await api.post<ManageUser>('/api/manage/users/', payload)
  return data
}

export async function listManageWorkspaces(): Promise<ManageWorkspace[]> {
  const { data } = await api.get<ManageWorkspace[]>('/api/manage/workspaces/')
  return data
}

export async function createManageWorkspace(payload: {
  name?: string
  baby_name: string
  baby_birthday?: string | null
}): Promise<ManageWorkspace> {
  const { data } = await api.post<ManageWorkspace>(
    '/api/manage/workspaces/',
    payload,
  )
  return data
}

export async function patchManageWorkspace(
  workspaceId: number,
  payload: {
    name?: string
    baby_name?: string
    baby_birthday?: string | null
  },
): Promise<ManageWorkspace> {
  const { data } = await api.patch<ManageWorkspace>(
    `/api/manage/workspaces/${workspaceId}/`,
    payload,
  )
  return data
}

export async function uploadManageWorkspaceAvatar(
  workspaceId: number,
  file: File,
): Promise<ManageWorkspace> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<ManageWorkspace>(
    `/api/manage/workspaces/${workspaceId}/avatar/`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function listManageMemberships(
  workspaceId?: number,
): Promise<ManageMembership[]> {
  const { data } = await api.get<ManageMembership[]>('/api/manage/memberships/', {
    params: workspaceId ? { workspace_id: workspaceId } : undefined,
  })
  return data
}

export async function createManageMembership(payload: {
  user_id: number
  workspace_id: number
  role: WorkspaceRole
  relation_label: string
  anchor_membership_id?: number
  anchor_label?: string
}): Promise<Membership> {
  const { data } = await api.post<Membership>('/api/manage/memberships/', payload)
  return data
}
