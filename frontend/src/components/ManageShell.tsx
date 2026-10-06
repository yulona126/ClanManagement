import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Button } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/manage', end: true, label: '概览' },
  { to: '/manage/users', label: '用户' },
  { to: '/manage/workspaces', label: '宝宝空间' },
  { to: '/manage/memberships', label: '成员关系' },
] as const

export function ManageShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className={`manage-shell${mobileOpen ? ' is-nav-open' : ''}`}>
      <header className="manage-topbar">
        <button
          type="button"
          className="menu-toggle manage-topbar-toggle"
          aria-label={mobileOpen ? '关闭导航' : '打开导航'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span className={`menu-toggle-icon${mobileOpen ? ' is-open' : ''}`} aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </button>
        <Link to="/manage" className="topbar-brand" onClick={() => setMobileOpen(false)}>
          Claner Admin
        </Link>
        <div className="topbar-spacer" />
        <span className="meta manage-topbar-user">{user?.username}</span>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          className="manage-nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside className="manage-sidebar">
        <div className="manage-sidebar-brand">
          <Link to="/manage" className="topbar-brand" onClick={() => setMobileOpen(false)}>
            Claner
          </Link>
          <span className="manage-sidebar-sub meta">管理台</span>
        </div>
        <p className="manage-nav-section">资源</p>
        <nav className="manage-nav" aria-label="管理导航">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="manage-sidebar-foot">
          <p className="meta">{user?.username} · staff</p>
          <Button
            variant="ghost"
            to="/"
            onClick={() => setMobileOpen(false)}
          >
            返回用户端
          </Button>
          <Button variant="ghost" type="button" onClick={logout}>
            退出登录
          </Button>
        </div>
      </aside>
      <div className="manage-main">{children}</div>
    </div>
  )
}
