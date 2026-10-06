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
