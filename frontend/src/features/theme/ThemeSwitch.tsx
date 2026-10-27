import { setThemeMode, toggleTheme, type ThemeMode } from './theme'
import { useTheme } from './useTheme'

type Option = {
  value: ThemeMode
  label: string
  icon: React.ReactNode
}

const ICON = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const OPTIONS: Option[] = [
  {
    value: 'system',
    label: '跟随系统',
    icon: (
      <svg {...ICON}>
        <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
        <path d="M8 20h8" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: '浅色',
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: '深色',
    icon: (
      <svg {...ICON}>
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
    ),
  },
]

/**
 * 三态主题开关（跟随系统 / 浅色 / 深色）。
 *
 * 每一档都从**点击位置**扩散切换 —— 坐标用 clientX/clientY（视口坐标），
 * 与 clip-path: circle(at X Y) 同一坐标系。
 */
export function ThemeSwitch() {
  const { mode } = useTheme()

  return (
    <div className="theme-switch" role="radiogroup" aria-label="外观主题">
      {OPTIONS.map((option) => {
        const active = mode === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`theme-switch__option${active ? ' is-active' : ''}`}
            onClick={(event) => {
              // 用真实点击坐标：键盘触发时 clientX/Y 为 0，退回按钮中心
              const rect = event.currentTarget.getBoundingClientRect()
              const x = event.clientX || rect.left + rect.width / 2
              const y = event.clientY || rect.top + rect.height / 2
              setThemeMode(option.value, { x, y })
            }}
            title={option.label}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 单键切换（浅 ↔ 深），适合放在图标按钮里。 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolved } = useTheme()
  return (
    <button
      type="button"
      className={className ?? 'theme-toggle'}
      aria-label={resolved === 'dark' ? '切换到浅色' : '切换到深色'}
      title={resolved === 'dark' ? '切换到浅色' : '切换到深色'}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        toggleTheme({
          x: event.clientX || rect.left + rect.width / 2,
          y: event.clientY || rect.top + rect.height / 2,
        })
      }}
    >
      {resolved === 'dark' ? OPTIONS[1].icon : OPTIONS[2].icon}
    </button>
  )
}
