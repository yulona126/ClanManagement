import type { WorkspaceRole } from '../../api/workspaces'

export const ROLE_OPTIONS: { value: WorkspaceRole; label: string }[] = [
  { value: 'owner', label: '所有者' },
  { value: 'editor', label: '编辑者' },
  { value: 'viewer', label: '只读' },
]

export function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role
}
