import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../features/workspaces/WorkspaceContext'
import { SiteMenu } from './SiteMenu'

/**
 * 用户端外壳：顶栏（品牌 / 空间 / 胶囊菜单）+ 主内容。
 *
 * 导航不再平铺一行文字 —— 收进 SiteMenu 的胶囊里，
 * 顶栏只剩三件东西，7 个栏目也不会把顶栏挤爆。
 */
export function UserTopBar() {
  const { current } = useWorkspace()

  return (
    <header className="topbar site-header">
      <Link to="/" className="topbar-brand">
        Claner
      </Link>
      {current ? (
        <Link to="/spaces" className="chip site-chip site-chip--link" title="切换空间">
          {current.baby_name}
          <span className="meta"> · {current.my_relation_label}</span>
        </Link>
      ) : null}
      <div className="topbar-spacer" />
      <SiteMenu />
    </header>
  )
}

export function UserShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell user-shell">
      <UserTopBar />
      <div className="main user-main">{children}</div>
    </div>
  )
}
