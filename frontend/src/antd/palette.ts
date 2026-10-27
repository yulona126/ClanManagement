/**
 * Claner palette — keep in sync with `src/styles/tokens.css`.
 * Used by antd ConfigProvider (hex required so seed → hover/active can derive).
 */
export const clanerPalette = {
  ink: '#111111',
  inkSoft: '#333333',
  muted: '#737373',
  faint: '#a3a3a3',

  bg: '#ffffff',
  bgDeep: '#fafafa',
  surface: '#ffffff',
  border: '#eeeeee',
  borderStrong: '#e5e5e5',

  accent: '#111111',
  accentHover: '#333333',
  accentSoft: 'rgba(17, 17, 17, 0.06)',
  accentMist: 'rgba(17, 17, 17, 0.03)',

  ok: '#166534',
  okSoft: 'rgba(22, 101, 52, 0.08)',
  err: '#b42318',
  errSoft: 'rgba(180, 35, 24, 0.08)',
  onAccent: '#ffffff',

  warning: '#a16207',
  warningSoft: 'rgba(161, 98, 7, 0.1)',
} as const

export const clanerType = {
  fontBody:
    '"Manrope", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  fontDisplay:
    '"Instrument Serif", "Songti SC", "Noto Serif SC", serif',
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 15, // ~ --text-md 0.95rem
  lineHeight: 1.55,
} as const

export const clanerRadius = {
  sm: 8, // 0.5rem
  md: 12, // 0.75rem
  lg: 16, // 1rem
} as const

/**
 * 深色调色板 —— 与 `src/features/theme/theme.css` 的 `.dark` 一一对应。
 * 改色时两处一起改（antd 要 hex，CSS 变量可以随便写）。
 */
export const clanerDarkPalette = {
  ink: '#f4f4f2',
  inkSoft: '#d9d9d5',
  muted: '#9c9c96',
  faint: '#6e6e68',

  bg: '#0b0b0b',
  bgDeep: '#121211',
  surface: '#141413',
  border: '#26262a',
  borderStrong: '#38383d',

  accent: '#f4f4f2',
  accentHover: '#ffffff',
  accentSoft: 'rgba(244, 244, 242, 0.1)',
  accentMist: 'rgba(244, 244, 242, 0.05)',

  ok: '#57c785',
  okSoft: 'rgba(87, 199, 133, 0.14)',
  err: '#ef7a7a',
  errSoft: 'rgba(239, 122, 122, 0.14)',
  onAccent: '#0b0b0b',

  warning: '#d4a13a',
  warningSoft: 'rgba(212, 161, 58, 0.14)',
} as const
