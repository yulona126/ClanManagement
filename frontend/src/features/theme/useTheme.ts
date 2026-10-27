import { useSyncExternalStore } from 'react'
import {
  getThemeSnapshot,
  subscribeTheme,
  type ResolvedTheme,
  type ThemeMode,
} from './theme'

/** 读当前主题。任何组件都可以用，无需 Provider。 */
export function useTheme(): { mode: ThemeMode; resolved: ResolvedTheme } {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot)
}
