import { useEffect, useLayoutEffect, useRef } from 'react'

function readY(key: string): number {
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

function writeY(key: string, y: number): void {
  try {
    window.sessionStorage.setItem(key, String(Math.round(y)))
  } catch {
    /* 配额 / 隐私模式：忽略即可，退化成不记忆 */
  }
}

/**
 * 记住列表页的滚动位置。
 *
 * 场景：照片墙 / 相册里点开一张 → 返回 → 又回到顶部。
 * 数据由各页自己决定是否缓存，这里只负责「位置」：
 *   - 离开时（卸载、pagehide、切后台）把 scrollY 写进 sessionStorage
 *   - 数据就绪后同步恢复，不留可见跳动
 *
 * 用 sessionStorage 而不是内存：真实刷新 / PWA 重启后也要还原。
 *
 * @param key 区分不同列表（建议带路由与空间 id）
 * @param ready 数据是否已渲染出来；未就绪时不要恢复（页面还太矮，滚不到目标位置）
 */
export function useScrollMemory(key: string, ready: boolean): void {
  /** 离开时要知道数据是否曾就绪，否则会把位置覆盖成 0 */
  const readyRef = useRef(false)
  /** 同一个 key 只自动恢复一次，避免用户手动滚动后又被拉回 */
  const restoredForRef = useRef<string | null>(null)

  useEffect(() => {
    readyRef.current = ready
  }, [ready])

  useEffect(() => {
    // 换了列表（如切相册）就允许再次恢复
    restoredForRef.current = null
    readyRef.current = false
  }, [key])

  useLayoutEffect(() => {
    if (!ready || restoredForRef.current === key) return
    restoredForRef.current = key
    const y = readY(key)
    if (y > 0) window.scrollTo(0, y)
  }, [ready, key])

  useLayoutEffect(() => {
    const save = () => {
      if (!readyRef.current) return
      writeY(key, window.scrollY)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      save()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key])
}
