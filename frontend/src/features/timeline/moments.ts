/**
 * 成长胶片：把真实动态（GrowthRecord）映射成轨道要用的展示结构。
 *
 * 为什么不直接在组件里用 API 类型：轨道只关心「一张图 + 一个日期 + 一个标签」，
 * 而记录里可能有多张图、视频、甚至纯文字。映射集中在这里，
 * 组件就不用到处判空。
 */

import type { GrowthRecord } from '../../api/records'
import { fetchRecords } from '../../api/records'
import type { MediaAsset } from '../../api/media'
import { resolveMediaUrl, withOssImageResize } from '../media/mediaUrl'

/** 轨道上的一张图（只取每张记录的第一张视觉素材）。 */
export type TimelineMedia = {
  id: number
  /** 轨道展示用（OSS 处理到 ~900px，省流量） */
  src: string
  /** 大图查看用（原图） */
  full: string
  alt: string
  kind: 'image' | 'video'
}

export type TimelineMoment = {
  id: number
  /** 业务日：yyyy-MM-dd（本地时区） */
  created_at: string
  /** 出生后第几天 */
  dayIndex: number | null
  title: string
  content: string
  /** 关系称呼，如「妈妈」；轨道 hover 时显示 */
  label: string
  authorName: string
  authorAvatarUrl: string
  /** 视觉素材；为空表示纯文字记录 */
  media: TimelineMedia[]
  /** 高 / 宽，用于卡片的 aspect-ratio；无图时给一个稳定默认值 */
  aspect: number
}

export type TimelineStats = {
  total: number
  photos: number
  months: number
  currentDay: number | null
}

export type TimelineMonth = {
  key: string
  label: string
  year: number
  count: number
}

/** 卡片高度/宽度取值范围：避免极端长图或全景图把轨道撑坏。 */
const MIN_ASPECT = 0.62
const MAX_ASPECT = 1.6
const DEFAULT_ASPECT = 1.28

/** 每次最多拉这么多页（DRF 默认每页 12 条）—— 防止超大空间把首屏拖死。 */
const MAX_PAGES = 20

/** 把 ISO 时间转成本地时区的 yyyy-MM-dd。 */
export function localDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** 出生后第几天；出生日期缺失或格式不对时返回 null。 */
export function dayIndexFromBirth(
  day: string,
  birth: string | null | undefined,
): number | null {
  if (!birth) return null
  const a = new Date(`${day}T00:00:00`)
  const b = new Date(`${birth}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

export function ageLabel(dayIndex: number | null): string {
  if (dayIndex === null) return ''
  // 出生前的记录（如孕期的 B 超）也给出有意义的标注，而不是留空
  if (dayIndex < 0) return `出生前 ${-dayIndex} 天`
  if (dayIndex === 0) return '出生当天'
  if (dayIndex < 31) return `出生 ${dayIndex} 天`
  const months = Math.floor(dayIndex / 30.44)
  if (months < 24) return `${months} 个月`
  return `${Math.floor(months / 12)} 岁`
}

/** 取记录里第一张可用于轨道的素材：优先图片，其次视频封面。 */
function pickVisual(record: GrowthRecord): MediaAsset | null {
  const images = record.media.filter((m) => m.media_type === 'image')
  if (images.length) return images[0]
  const videos = record.media.filter((m) => m.media_type === 'video')
  if (videos.length) return videos[0]
  return null
}

function toMedia(asset: MediaAsset, title: string): TimelineMedia {
  const isVideo = asset.media_type === 'video'
  const base = resolveMediaUrl(
    isVideo ? asset.thumbnail_url || asset.file_url : asset.file_url,
    asset.object_key,
  )
  return {
    id: asset.id,
    // 轨道上单张最大约 416px 宽，900px 够 2x；本地 /media 会被原样返回
    src: isVideo ? base : withOssImageResize(base, 900),
    full: resolveMediaUrl(asset.file_url, asset.object_key),
    alt: title || (isVideo ? '一段成长视频' : '一张成长照片'),
    kind: isVideo ? 'video' : 'image',
  }
}

/**
 * 记录 → 轨道项。
 *
 * 纯文字记录也保留（`media` 为空）：它们在轨道上是排版卡片，
 * 直接丢掉等于把「说了什么」从时间轴里抹掉。
 */
function toMoment(record: GrowthRecord, birth: string | null | undefined): TimelineMoment {
  const visual = pickVisual(record)
  const day = localDay(record.created_at)
  const ratio =
    visual && visual.width && visual.height ? visual.height / visual.width : null

  return {
    id: record.id,
    created_at: day,
    dayIndex: dayIndexFromBirth(day, birth),
    title: record.title || '',
    content: record.content || '',
    label: record.author_relation_label || '家人',
    authorName: record.author_relation_label || '',
    authorAvatarUrl: record.author_avatar_url || '',
    media: visual ? [toMedia(visual, record.title || record.content)] : [],
    aspect: ratio
      ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, ratio))
      : DEFAULT_ASPECT,
  }
}

/** 拉全部分页，按时间正序（最早在前）返回。 */
export async function fetchTimelineMoments(
  workspaceId: number,
  birth: string | null | undefined,
): Promise<TimelineMoment[]> {
  const all: GrowthRecord[] = []
  let page = 1
  while (page <= MAX_PAGES) {
    const data = await fetchRecords(workspaceId, page)
    all.push(...data.results)
    if (!data.next || data.results.length === 0) break
    page += 1
  }

  return all
    .map((r) => toMoment(r, birth))
    .sort((a, b) => {
      // 先按日期正序；同一天按 id 正序，保证顺序稳定
      if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? -1 : 1
      }
      return a.id - b.id
    })
}

export function computeStats(
  moments: TimelineMoment[],
  birth: string | null | undefined,
  photoCount?: number | null,
): TimelineStats {
  const photoIds = new Set<number>()
  let photos = 0
  const months = new Set<string>()
  for (const m of moments) {
    months.add(m.created_at.slice(0, 7))
    for (const media of m.media) {
      if (media.kind === 'image' && !photoIds.has(media.id)) {
        photoIds.add(media.id)
        photos += 1
      }
    }
  }
  const today = localDay(new Date().toISOString())
  return {
    total: moments.length,
    // 轨道上每条记录只显示首图，所以这里不能拿 moments 里的图去数 ——
    // 优先用空间汇总里的真实照片数（包含每条记录的其它图）。
    photos: typeof photoCount === 'number' ? photoCount : photos,
    months: months.size,
    currentDay: dayIndexFromBirth(today, birth),
  }
}

/** 月份分组（倒序，最近的月份在前），用于开场页的月份列表。 */
export function groupMonths(moments: TimelineMoment[]): TimelineMonth[] {
  const map = new Map<string, TimelineMonth>()
  for (const m of moments) {
    const key = m.created_at.slice(0, 7)
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
    } else {
      map.set(key, {
        key,
        label: `${Number(key.slice(5, 7))}月`,
        year: Number(key.slice(0, 4)),
        count: 1,
      })
    }
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
}
