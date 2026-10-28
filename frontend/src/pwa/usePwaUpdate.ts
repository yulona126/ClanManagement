import { useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA 更新检查。
 *
 * 为什么光靠默认注册不够：
 *   1. 浏览器只在**导航**时才会去取 sw.js。已安装的 PWA 常常是从后台恢复，
 *      iOS 甚至能挂好几天不重新加载 —— 期间永远看不到新版本。
 *   2. sw.js 若被 HTTP 缓存（nginx 默认没有 Cache-Control），连导航都不会重新取。
 *      （服务端已加 no-store，见 frontend/nginx.conf）
 *
 * 所以这里主动补三处检查：打开/恢复前台、窗口获得焦点、以及长时间挂在前台时定期查。
 */

const CHECK_INTERVAL_MS = 20 * 60 * 1000

/**
 * 应用更新后的冷却期。
 *
 * 为什么需要：CDN（例如 Cloudflare）可能在不同边缘节点缓存到不同版本的 sw.js，
 * 浏览器于是反复"发现新版本 → 应用 → 又发现"。

 * 冷却期内不再提示、也不再自动应用，避免一直弹更新。
 */
const APPLY_COOLDOWN_MS = 10 * 60 * 1000
const APPLIED_AT_KEY = 'claner:pwa-applied-at'

function markApplied(): void {
  try {
    window.localStorage.setItem(APPLIED_AT_KEY, String(Date.now()))
  } catch {
    /* 隐私模式忽略 */
  }
}

function isCoolingDown(): boolean {
  try {
    const at = Number(window.localStorage.getItem(APPLIED_AT_KEY) || 0)
    return at > 0 && Date.now() - at < APPLY_COOLDOWN_MS
  } catch {
    return false
  }
}

export type PwaUpdate = {
  needRefresh: boolean
  offlineReady: boolean
  /** 立即应用更新（会 reload） */
  apply: () => void
  /** 本次先不更新 */
  dismiss: () => void
}

async function checkForUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    // update() 会带 cache: 'no-store' 去取 sw.js，绕过 HTTP 缓存
    await reg?.update()
  } catch {
    /* 离线 / 权限问题：静默失败，下次再试 */
  }
}

export function usePwaUpdate(): PwaUpdate {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW()

  const [dismissed, setDismissed] = useState(false)
  const [coolingDown, setCoolingDown] = useState(() => isCoolingDown())

  useEffect(() => {
    const runCheck = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }

    // 打开 / 从后台恢复（iOS 的"重新打开 PWA"大多走这条）
    document.addEventListener('visibilitychange', runCheck)
    window.addEventListener('focus', runCheck)
    // 首帧后再查一次，别和首屏渲染抢带宽
    const initial = window.setTimeout(runCheck, 3000)
    const timer = window.setInterval(runCheck, CHECK_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', runCheck)
      window.removeEventListener('focus', runCheck)
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [])

  /*
   * 用户把应用切到后台时，如果有待应用的更新就顺手装上。
   * 下次回到前台就是新版本 —— 不用等人点提示。
   */
  useEffect(() => {
    if (!needRefresh || coolingDown) return
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        markApplied()
        void updateServiceWorker(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [needRefresh, coolingDown, updateServiceWorker])

  /* 冷却结束（10 分钟后）再允许提示一次，不必刷新页面 */
  useEffect(() => {
    if (!coolingDown) return
    const timer = window.setTimeout(() => setCoolingDown(false), APPLY_COOLDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [coolingDown])

  const apply = useCallback(() => {
    markApplied()
    setCoolingDown(true)
    void updateServiceWorker(true)
  }, [updateServiceWorker])

  const dismiss = useCallback(() => {
    setDismissed(true)
    setNeedRefresh(false)
  }, [setNeedRefresh])

  return {
    // 冷却期内静默：宁可晚 10 分钟提示，也不要一直弹
    needRefresh: needRefresh && !dismissed && !coolingDown,
    offlineReady,
    apply,
    dismiss,
  }
}
