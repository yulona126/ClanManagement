import { MembersPanel } from '../workspaces/MembersPanel'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { Button } from '../../components/ui'
import { WorkspaceProfilePanel } from './WorkspaceProfilePanel'

export function WorkspaceSettingsPage() {
  const { current } = useWorkspace()
  const isOwner = current?.my_role === 'owner'

  if (!isOwner) {
    return (
      <>
        <header className="page-header">
          <h1>空间设置</h1>
        </header>
        <p className="meta">仅 owner 可管理成员。</p>
        <Button variant="link" to="/">
          返回动态
        </Button>
      </>
    )
  }

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>空间设置</h1>
        <p className="lede">管理宝宝资料、照片与成员。</p>
      </header>
      <div className="settings-stack">
        <WorkspaceProfilePanel />
        <MembersPanel />
      </div>
    </div>
  )
}
