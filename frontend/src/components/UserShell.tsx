import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useWorkspace } from '../features/workspaces/WorkspaceContext'

type NavItem = {
  to: string
  label: string
  end?: boolean
  hidden?: boolean
}

function useNavItems(): NavItem[] {
  const { current } = useWorkspace()
  const canWrite =
    current?.my_role === 'owner' || current?.my_role === 'editor'
  const isOwner = current?.my_role === 'owner'

  return [
    { to: '/', label: '动态', end: true },
    { to: '/album', label: '相册' },
    { to: '/family', label: '家族' },
    { to: '/compose', label: '发布', hidden: !canWrite },
    { to: '/settings/workspace', label: '设置', hidden: !isOwner },
    { to: '/me', label: '账号' },
  ].filter((item) => !item.hidden)
}

function NavLinks({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  const items = useNavItems()
  return (
    <nav className={className} aria-label="主导航">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className="site-nav-link"
          onClick={onNavigate}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function UserTopBar() {
  const { current } = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const panelId = useId()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <>
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
        <NavLinks className="site-nav site-nav--desktop" />
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={menuOpen}
          aria-controls={panelId}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className={`menu-toggle-icon${menuOpen ? ' is-open' : ''}`} aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </button>
      </header>

      <div
        className={`nav-drawer${menuOpen ? ' is-open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          className="nav-drawer-backdrop"
          aria-label="关闭菜单"
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => setMenuOpen(false)}
        />
        <div
          id={panelId}
          className="nav-drawer-panel"
          role="dialog"
          aria-modal="true"
          aria-label="站点菜单"
        >
          <div className="nav-drawer-head">
            <button
              type="button"
              className="menu-toggle"
              aria-label="关闭菜单"
              onClick={() => setMenuOpen(false)}
            >
              <span className="menu-toggle-icon is-open" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </button>
          </div>
          <NavLinks
            className="site-nav site-nav--drawer"
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      </div>
    </>
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
