import type { MediaAsset } from '../../api/media'

/** Age in completed years from birthday to captured moment; null if unknown. */
export function ageYearsAt(
  birthday: string | null | undefined,
  capturedAt: string | null | undefined,
): number | null {
  if (!birthday || !capturedAt) return null
  const birth = new Date(birthday)
  const at = new Date(capturedAt)
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime())) return null
  if (at < birth) return null
  let years = at.getFullYear() - birth.getFullYear()
  const m = at.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) years -= 1
  return Math.max(0, years)
}

export function ageBucketLabel(years: number | null): string {
  if (years == null) return '未知时间'
  if (years === 0) return '未满一岁'
  return `${years} 岁`
}

export type AgeBucket = {
  key: string
  label: string
  years: number | null
  items: MediaAsset[]
}

/** Group media into age buckets; "all" timeline is caller-side. */
export function groupByAge(
  items: MediaAsset[],
  birthday: string | null | undefined,
): AgeBucket[] {
  const map = new Map<string, AgeBucket>()
  for (const item of items) {
    const captured = item.captured_at || item.taken_at || item.created_at
    const years = ageYearsAt(birthday, captured)
    const key = years == null ? 'unknown' : `y${years}`
    const label = ageBucketLabel(years)
    let bucket = map.get(key)
    if (!bucket) {
      bucket = { key, label, years, items: [] }
      map.set(key, bucket)
    }
    bucket.items.push(item)
  }
  return [...map.values()].sort((a, b) => {
    if (a.years == null) return 1
    if (b.years == null) return -1
    return a.years - b.years
  })
}
