/**
 * 主题：三态（light / dark / system）+ 圆形扩散切换 + 零首屏闪烁。
 *
 * 设计要点（与 index.html 的首帧内联脚本共用同一套 key/类名）：
 *   1. 颜色只由 CSS 变量决定，`.dark` 类只重声明变量；
 *      组件里不写任何「深色变体」，否则一定会漏。
 *   2. 首帧由 index.html 的内联同步脚本决定，避免白闪。
 *   3. 切换用 View Transitions + clip-path 圆形扩散，从点击位置长出来；
 *      不支持时（旧浏览器 / 用户要求减少动效）退化为瞬时切换。
 *
 * 不用状态库：一个模块级 store + useSyncExternalStore 足够，
 * 也避免为此引入额外依赖。
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** 必须与 index.html 内联脚本里的 key 完全一致，否则「首屏对、点一下弹回去」。 */
export const THEME_STORAGE_KEY = 'claner:theme'

type ThemeState = {
  mode: ThemeMode
  resolved: ResolvedTheme
}

const listeners = new Set<() => void>()

function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light'
  return mode
}

function readStoredMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* 隐私模式：用默认值 */
  }
  return 'system'
}

/**
 * 初始值从 DOM 读：
 * 首帧脚本已经加好了 .dark，这里照抄即可，避免首渲染与已画的界面不一致。
 */
function initialState(): ThemeState {
  if (typeof document === 'undefined') {
    return { mode: 'system', resolved: 'light' }
  }
  return {
    mode: readStoredMode(),
    resolved: document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  }
}

let state: ThemeState = initialState()

function emit(): void {
  for (const fn of listeners) fn()
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getThemeSnapshot(): ThemeState {
  return state
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b0b0b' : '#ffffff')
}

function persistMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    /* 忽略 */
  }
}

type Point = { x: number; y: number }

/**
 * 执行一次主题切换。
 *
 * @param point 触发控件在视口中的坐标（clientX/clientY）。没有就退化为从中心扩散。
 */
export function setThemeMode(mode: ThemeMode, point?: Point): void {
  const nextResolved = resolveTheme(mode)

  // 颜色没变（例如 dark → system，而系统本来就是深色）：只换标记，不做扩散
  if (nextResolved === state.resolved) {
    state = { mode, resolved: nextResolved }
    applyTheme(nextResolved)
    persistMode(mode)
    emit()
    return
  }

  const commit = () => {
    state = { mode, resolved: nextResolved }
    applyTheme(nextResolved)
    persistMode(mode)
    emit()
  }

  const canTransition =
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!canTransition) {
    commit()
    return
  }

  const root = document.documentElement
  const x = point?.x ?? window.innerWidth / 2
  const y = point?.y ?? window.innerHeight / 2
  // 到最远角的距离，保证圆一定盖满视口
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )

  root.classList.add('theme-switching')

  const transition = document.startViewTransition(() => {
    commit()
  })

  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 900,
          easing: 'cubic-bezier(0.33, 0.0, 0.2, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        },
      )
      // 旧画面略压暗，制造「被覆盖」的层次
      root.animate(
        { opacity: [1, 0.72] },
        {
          duration: 900,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-old(root)',
        },
      )
    })
    .catch(() => undefined)

  transition.finished
    .catch(() => undefined)
    .finally(() => {
      root.classList.remove('theme-switching')
    })
}

/** 在 light / dark 之间来回切（跟随系统时按当前实际颜色反着来）。 */
export function toggleTheme(point?: Point): void {
  setThemeMode(state.resolved === 'dark' ? 'light' : 'dark', point)
}

/** 系统配色变化：仅在 system 模式下跟随，且不做扩散。 */
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (state.mode !== 'system') return
    const resolved = resolveTheme('system')
    if (resolved === state.resolved) return
    state = { ...state, resolved }
    applyTheme(resolved)
    emit()
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
