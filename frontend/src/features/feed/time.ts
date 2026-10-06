/** Relative time for feed / Moments-style timelines (zh-CN). */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  try {
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return ''
    const diffSec = Math.max(0, Math.floor((now - t) / 1000))
    if (diffSec < 45) return '刚刚'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`

    const d = new Date(iso)
    const today = new Date(now)
    const startToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime()
    const startThat = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
    ).getTime()
    const dayDiff = Math.round((startToday - startThat) / 86400000)
    const hm = d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (dayDiff === 0) return `今天 ${hm}`
    if (dayDiff === 1) return `昨天 ${hm}`
    if (d.getFullYear() === today.getFullYear()) {
      return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
    }
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return ''
  }
}

export function avatarInitial(label: string, fallback = '?'): string {
  const t = label.trim()
  if (!t) return fallback
  // Prefer first CJK / letter char
  const m = t.match(/[\u4e00-\u9fffA-Za-z0-9]/)
  return m?.[0] ?? t.slice(0, 1)
}
