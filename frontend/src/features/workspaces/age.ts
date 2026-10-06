/** Baby age label from birthday (zh-CN), e.g. 「8 个月 12 天」. */

export function formatBabyAge(
  birthday: string | null | undefined,
  now = new Date(),
): string | null {
  if (!birthday) return null
  const born = new Date(`${birthday}T00:00:00`)
  if (Number.isNaN(born.getTime())) return null
  if (born > now) return null

  let years = now.getFullYear() - born.getFullYear()
  let months = now.getMonth() - born.getMonth()
  let days = now.getDate() - born.getDate()

  if (days < 0) {
    months -= 1
    const prev = new Date(now.getFullYear(), now.getMonth(), 0)
    days += prev.getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years <= 0 && months <= 0) {
    return days <= 0 ? '今天出生' : `${days} 天`
  }
  if (years <= 0) {
    return days > 0 ? `${months} 个月 ${days} 天` : `${months} 个月`
  }
  if (months <= 0) {
    return `${years} 岁`
  }
  return `${years} 岁 ${months} 个月`
}
