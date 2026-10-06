import { api } from './client'
import type { Membership, WorkspaceRole } from './workspaces'

export type GraphBaby = {
  id: string
  name: string
  birthday: string | null
  avatar_url: string
}

export type GraphNode = {
  id: string
  membership_id: number
  user_id: number
  username: string
  display_name: string
  relation_to_baby: string
  avatar_url: string
  bio: string
  generation: number | null
  role: WorkspaceRole
}

export type GraphLink = {
  id: number
  kind: 'to_baby' | 'peer'
  source: string
  target: string
  label: string
}

export type FamilyGraph = {
  baby: GraphBaby
  nodes: GraphNode[]
  links: GraphLink[]
}

export async function fetchGraph(workspaceId: number): Promise<FamilyGraph> {
  const { data } = await api.get<FamilyGraph>(
    `/api/workspaces/${workspaceId}/graph/`,
  )
  return data
}

export async function patchMyMembership(
  workspaceId: number,
  payload: Partial<
    Pick<Membership, 'display_name' | 'avatar_url' | 'bio' | 'generation'>
  >,
): Promise<Membership> {
  const { data } = await api.patch<Membership>(
    `/api/workspaces/${workspaceId}/members/me/`,
    payload,
  )
  return data
}

export async function createKinship(
  workspaceId: number,
  payload: {
    from_membership_id: number
    to_membership_id: number
    label: string
  },
): Promise<{ id: number }> {
  const { data } = await api.post(`/api/workspaces/${workspaceId}/kinship/`, payload)
  return data
}

export async function deleteKinship(
  workspaceId: number,
  kinshipId: number,
): Promise<void> {
  await api.delete(`/api/workspaces/${workspaceId}/kinship/${kinshipId}/`)
}
