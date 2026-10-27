import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useWorkspace } from '../features/workspaces/WorkspaceContext'
import { ThemeSwitch } from '../features/theme/ThemeSwitch'

type NavItem = {
  to: string
  label: string
  end?: boolean
  hidden?: boolean
  icon: ReactNode
}

/** 线性图标，统一 18px、1.5 描边，跟 Minimal White 的克制感一致。 */
const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const ICONS = {
  feed: (
    <svg {...iconProps}>
      <path d="M3 10.6 12 3.5l9 7.1" />
      <path d="M5.5 9.4V20h13V9.4" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </svg>
  ),
  timeline: (
    <svg {...iconProps}>
      <path d="M3 12h18M7 8v8M12 6v12M17 9v6" />
    </svg>
  ),
  album: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </svg>
  ),
  family: (
    <svg {...iconProps}>
      <circle cx="12" cy="7" r="3" />
      <circle cx="5.5" cy="17" r="2.4" />
      <circle cx="18.5" cy="17" r="2.4" />
      <path d="M12 10v3M12 13l-5 2M12 13l5 2" />
    </svg>
  ),
  compose: (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4Z" />
    </svg>
  ),
  me: (
    <svg {...iconProps}>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5 20c1.2-3.6 3.8-5.4 7-5.4s5.8 1.8 7 5.4" />
    </svg>
  ),
}

function useNavItems(): NavItem[] {
  const { current } = useWorkspace()
  const canWrite = current?.my_role === 'owner' || current?.my_role === 'editor'
  const isOwner = current?.my_role === 'owner'

  return [
    { to: '/', label: '动态', end: true, icon: ICONS.feed },
    { to: '/timeline', label: '胶片', icon: ICONS.timeline },
    { to: '/album', label: '相册', icon: ICONS.album },
    { to: '/family', label: '家族', icon: ICONS.family },
    { to: '/compose', label: '发布', hidden: !canWrite, icon: ICONS.compose },
    {
      to: '/settings/workspace',
      label: '设置',
      hidden: !isOwner,
      icon: ICONS.settings,
    },
    { to: '/me', label: '账号', icon: ICONS.me },
  ].filter((item) => !item.hidden)
}

/**
 * 顶栏导航：Dynamic Island 式胶囊。
 *
 * 折叠态只是一个胶囊（当前栏目 + 展开箭头），点开后原地长出一块面板：
 * 图标 + 文字的九宫格式排布，最下面是三态主题开关。
 *
 * 为什么这么做：导航项从 4 个涨到 7 个后，一行平铺的文字链接既占地方、
 * 又让「品牌 / 空间 / 导航」三块在视觉上抢位置。收进一个胶囊后，
 * 顶栏只留三件东西：牌子、空间、胶囊 —— 展开才露出细节。
 *
 * 交互：点外部 / Esc / 路由变化都会收起；⌘K（Ctrl+K）随时打开。
 */
export function SiteMenu() {
  const items = useNavItems()
  /*
   * 记录「在哪个路由上打开的」而不是布尔值：
   * 路由一变 open 自然变 false，不用再写一个 setState(false) 的 effect。
   */
  const [openPath, setOpenPath] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const location = useLocation()

  const open = openPath === location.pathname
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setOpenPath((prev) => {
        const isOpen = prev === location.pathname
        const wanted = typeof next === 'function' ? next(isOpen) : next
        return wanted ? location.pathname : null
      })
    },
    [location.pathname],
  )
  const close = useCallback(() => setOpenPath(null), [])

  /** 当前所在栏目的名字，折叠态显示它 —— 比只显示「菜单」信息量大。 */
  const currentItem =
    items.find((i) =>
      i.end ? location.pathname === i.to : location.pathname.startsWith(i.to),
    ) ?? items[0]

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenPath(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenPath(null)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* ⌘K / Ctrl+K 打开；再按一次收起 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpenPath((prev) =>
          prev === window.location.pathname ? null : window.location.pathname,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`site-menu${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="site-menu__pill"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? '关闭菜单' : '打开菜单'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="site-menu__pill-icon" aria-hidden>
          {currentItem.icon}
        </span>
        <span className="site-menu__pill-label">{currentItem.label}</span>
        <span className="site-menu__pill-chevron" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      <div
        id={panelId}
        className="site-menu__panel"
        role="dialog"
        aria-modal="false"
        aria-label="站点导航"
        aria-hidden={!open}
      >
        <nav className="site-menu__grid" aria-label="主导航">
          {items.map((item, index) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="site-menu__item"
              style={{ '--i': index } as React.CSSProperties}
              onClick={close}
            >
              <span className="site-menu__item-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="site-menu__item-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="site-menu__theme">
          <span className="site-menu__theme-label">外观</span>
          <ThemeSwitch />
        </div>

        <p className="site-menu__hint">
          <kbd>⌘</kbd>
          <kbd>K</kbd>
          <span>快速打开</span>
        </p>

        {/* 折叠态下也让品牌可点回首页，方便在面板里迷路时一键回退 */}
        <Link to="/" className="site-menu__home" onClick={close}>
          Claner · 回到动态
        </Link>
      </div>
    </div>
  )
}
