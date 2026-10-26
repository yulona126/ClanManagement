/**
 * Claner Timeline — 展示用假数据
 *
 * 与 `GrowthRecord` 字段命名保持一致（title / content / created_at / media /
 * author_relation_label），后续接真实 API 时只需把 `MOMENTS` 换成
 * `fetchRecords()` 的结果再做一次 map，展示页不用改结构。
 */

export type MomentKind = 'photo' | 'video' | 'voice' | 'note'

/** 与 `api/media.ts` 的 MediaAsset 保持同形的展示用结构。 */
export type MomentMedia = {
  id: number
  kind: 'image' | 'video'
  alt: string
  /** 占位渐变（本地生成，不依赖网络） */
  placeholder: string
}

export type Moment = {
  id: number
  /** 业务日：yyyy-MM-dd */
  created_at: string
  /** 出生后第几天（用于「出生 N 天」标识） */
  dayIndex: number
  title: string
  content: string
  author_relation_label: string
  author_avatar_url?: string
  kind: MomentKind
  /** 分类标签，对应参考站的 Articles / Podcast Episodes / Inspiration */
  tags: string[]
  media: MomentMedia[]
  /** 声音条时长文案（kind === 'voice' 时展示） */
  voiceDuration?: string
  location?: string
  /**
   * 高 / 宽。横向轨道靠它给每张图不同的高宽比，形成高低错落的观感
   * （参考站是 `--aspect: height/width` + `aspect-ratio: calc(1/var(--aspect))`）。
   */
  aspect: number
}

export const TIMELINE_SUBJECT = {
  name: 'hexia',
  nickname: '夏夏',
  birth: '2025-09-18',
  /** 展示页副标题 */
  tagline: '一天一张照片，把长大的过程卷成一卷胶片。',
}

export const TAG_LABELS: Record<string, string> = {
  日常: '日常',
  第一次: '第一次',
  外出: '外出',
  家人: '家人',
  睡梦: '睡梦',
  辅食: '辅食',
  体检: '体检',
  节日: '节日',
}

const GRADIENTS: [string, string, string][] = [
  ['#f4f1ec', '#ded6cb', '#b9ada0'],
  ['#eef1f4', '#d6dde3', '#aeb9c2'],
  ['#f3eee9', '#e0d3c6', '#c0a894'],
  ['#eef2ee', '#d7e0d8', '#adbcb1'],
  ['#f5f2f6', '#ddd5e2', '#b6a9bb'],
  ['#f2f2f0', '#dcdcd8', '#b3b3ad'],
]

/**
 * 用内联 SVG 生成占位图：本地渲染、可离线、不拉外网图。
 * 换成真实照片时把 placeholder 替换成 `media.file_url` 即可。
 */
export function momentPlaceholder(index: number, from: number, to: number): string {
  const [bg, mid, ink] = GRADIENTS[index % GRADIENTS.length]
  const cx = (from * 37) % 100
  const cy = (to * 23) % 100
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${bg}"/>
<stop offset="55%" stop-color="${mid}"/>
<stop offset="100%" stop-color="${ink}"/>
</linearGradient>
<radialGradient id="r" cx="${cx}%" cy="${cy}%" r="70%">
<stop offset="0%" stop-color="#ffffff" stop-opacity=".85"/>
<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="120" height="150" fill="url(#g)"/>
<rect width="120" height="150" fill="url(#r)"/>
<g fill="none" stroke="${ink}" stroke-opacity=".28" stroke-width=".6">
<circle cx="60" cy="62" r="26"/>
<circle cx="60" cy="62" r="38"/>
<path d="M0 118 Q30 96 60 112 T120 104"/>
</g>
<text x="60" y="68" text-anchor="middle" font-family="Manrope, sans-serif" font-size="13" font-weight="700" fill="#ffffff" fill-opacity=".92" letter-spacing=".5">${String(index + 1).padStart(2, '0')}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function img(index: number, alt: string): MomentMedia {
  return {
    id: 9000 + index,
    kind: 'image',
    alt,
    placeholder: momentPlaceholder(index, index * 2 + 1, index * 3 + 5),
  }
}

type Seed = Omit<Moment, 'media' | 'dayIndex' | 'aspect'> & {
  media?: MomentMedia[]
  /** 覆盖默认配图数量，0 表示纯文字 */
  shot?: number
}

const SEEDS: Seed[] = [
  {
    id: 24,
    created_at: '2026-04-06',
    title: '第一次自己扶着栏杆站起来',
    content:
      '今天她自己抓着婴儿床的栏杆站起来了，站了大概七秒。第三秒的时候她回头看我，眼睛亮得像刚发现新大陆。外婆说这是要会走路的前兆，我赶紧录了下来。',
    author_relation_label: '妈妈',
    kind: 'video',
    tags: ['第一次', '日常'],
    voiceDuration: '0:42',
    location: '家里 · 卧室',
    shot: 2,
  },
  {
    id: 23,
    created_at: '2026-04-04',
    title: '楼下的樱花开了',
    content: '推车出去转了一圈。她在樱花树下一直仰着头，风一吹花瓣飘下来，她就咯咯笑。',
    author_relation_label: '爸爸',
    kind: 'photo',
    tags: ['外出', '日常'],
    location: '小区 · 樱花道',
    shot: 3,
  },
  {
    id: 22,
    created_at: '2026-03-30',
    title: '今天的辅食是南瓜泥',
    content: '第一口表情很复杂，第二口就张嘴等了。最后碗底都刮干净，围兜上全是。',
    author_relation_label: '外婆',
    kind: 'photo',
    tags: ['辅食', '日常'],
    shot: 2,
  },
  {
    id: 21,
    created_at: '2026-03-22',
    title: '半岁体检 · 一切正常',
    content:
      '身高 68cm，体重 8.4kg，都在中上。医生说可以开始尝试颗粒状的食物了。抽血的时候哭了两声，看到护士的贴纸就不哭了。',
    author_relation_label: '妈妈',
    kind: 'note',
    tags: ['体检', '第一次'],
    location: '市妇幼保健院',
    shot: 1,
  },
  {
    id: 20,
    created_at: '2026-03-15',
    title: '凌晨三点的小夜灯',
    content: '又是一个哄睡的夜晚。她在我肩膀上打了一个小小的嗝，然后呼吸就慢下来了。',
    author_relation_label: '妈妈',
    kind: 'voice',
    tags: ['睡梦', '日常'],
    voiceDuration: '1:08',
    shot: 1,
  },
  {
    id: 19,
    created_at: '2026-03-08',
    title: '会翻身了',
    content: '从仰卧翻到俯卧，翻过去之后自己吓了一跳，趴在床上大喊。',
    author_relation_label: '爸爸',
    kind: 'video',
    tags: ['第一次'],
    shot: 2,
  },
  {
    id: 18,
    created_at: '2026-02-28',
    title: '奶奶寄来的小毛衣',
    content: '手工织的，领口绣了一个歪歪扭扭的「夏」字。有点大，明年应该刚好。',
    author_relation_label: '奶奶',
    kind: 'photo',
    tags: ['家人'],
    shot: 1,
  },
  {
    id: 17,
    created_at: '2026-02-17',
    title: '春节 · 第一次见这么多亲戚',
    content:
      '一屋子人轮流抱她，她全程面无表情地观察，直到太奶奶伸手才笑了一下。红包收了十三个。',
    author_relation_label: '爸爸',
    kind: 'photo',
    tags: ['节日', '家人', '第一次'],
    location: '老家 · 客厅',
    shot: 4,
  },
  {
    id: 16,
    created_at: '2026-02-02',
    title: '对着镜子里的自己笑',
    content: '今天发现镜子里有个小孩，兴奋地拍镜子，拍到手红。',
    author_relation_label: '妈妈',
    kind: 'photo',
    tags: ['日常', '第一次'],
    shot: 1,
  },
  {
    id: 15,
    created_at: '2026-01-20',
    title: '第一次笑出声',
    content: '爸爸学小狗叫的时候，她笑出了声音，很短，但我们都听见了。妈妈从厨房跑过来问「刚刚那个是不是她」。',
    author_relation_label: '妈妈',
    kind: 'voice',
    tags: ['第一次', '日常'],
    voiceDuration: '0:19',
    shot: 1,
  },
  {
    id: 14,
    created_at: '2026-01-06',
    title: '三个月的睡姿图鉴',
    content: '整理了一下手机，发现同一个角度拍了三十多张她睡觉的样子。删不掉，全留。',
    author_relation_label: '爸爸',
    kind: 'photo',
    tags: ['睡梦'],
    shot: 4,
  },
  {
    id: 13,
    created_at: '2025-12-24',
    title: '第一个平安夜',
    content: '给她戴了红色小帽子，戴了十秒就被扯掉了。只好趁她睡着偷偷拍。',
    author_relation_label: '妈妈',
    kind: 'photo',
    tags: ['节日', '睡梦'],
    shot: 2,
  },
  {
    id: 12,
    created_at: '2025-12-10',
    title: '满两个月 · 会追视了',
    content: '拿红色小球在她眼前慢慢移动，眼睛能跟着转一整圈，头也会转过去。',
    author_relation_label: '妈妈',
    kind: 'note',
    tags: ['体检', '第一次'],
    shot: 0,
  },
  {
    id: 11,
    created_at: '2025-11-28',
    title: '外婆的摇篮曲',
    content: '外婆用方言唱的，录了一段。她听两句就闭眼了。',
    author_relation_label: '外婆',
    kind: 'voice',
    tags: ['家人', '睡梦'],
    voiceDuration: '2:14',
    shot: 1,
  },
  {
    id: 10,
    created_at: '2025-11-15',
    title: '第一次出门晒太阳',
    content: '裹得像个小粽子。全程睡着，回来才醒。',
    author_relation_label: '爸爸',
    kind: 'photo',
    tags: ['外出', '第一次'],
    location: '小区 · 花园',
    shot: 3,
  },
  {
    id: 9,
    created_at: '2025-11-02',
    title: '脐带掉了',
    content: '换尿布的时候发现掉了，慌了一秒才想起这是正常的。小小的一个，收在信封里了。',
    author_relation_label: '妈妈',
    kind: 'note',
    tags: ['第一次'],
    shot: 0,
  },
  {
    id: 8,
    created_at: '2025-10-25',
    title: '深夜喂奶的第五十天',
    content: '窗外只有一盏路灯。她的手指抓住我的衣领，力气比我想象的大。',
    author_relation_label: '妈妈',
    kind: 'voice',
    tags: ['日常'],
    voiceDuration: '1:33',
    shot: 1,
  },
  {
    id: 7,
    created_at: '2025-10-12',
    title: '配方奶转母乳成功',
    content: '折腾了两周，今天终于全母乳了。妈妈辛苦了。',
    author_relation_label: '爸爸',
    kind: 'note',
    tags: ['日常'],
    shot: 0,
  },
  {
    id: 6,
    created_at: '2025-10-03',
    title: '家里第一张全家福',
    content: '用三脚架自拍的，她那时候还不会看镜头。爷爷把这张洗出来挂在客厅了。',
    author_relation_label: '爸爸',
    kind: 'photo',
    tags: ['家人', '日常'],
    shot: 3,
  },
  {
    id: 5,
    created_at: '2025-09-26',
    title: '出院回家第一天',
    content: '小心翼翼地把安全座椅提上楼。整个屋子都好安静，只有她的呼吸声。',
    author_relation_label: '爸爸',
    kind: 'photo',
    tags: ['第一次', '家人'],
    shot: 2,
  },
  {
    id: 4,
    created_at: '2025-09-20',
    title: '第一次洗澡',
    content: '哭到整层楼都能听见。护士说这很正常，我们不太信。',
    author_relation_label: '妈妈',
    kind: 'video',
    tags: ['第一次'],
    location: '医院 · 产科',
    shot: 2,
  },
  {
    id: 3,
    created_at: '2025-09-18',
    title: '今天，你来了',
    content:
      '凌晨 4:12，3240g，50cm。哭声很响。护士把她放在妈妈胸口的时候，她立刻就安静了。',
    author_relation_label: '爸爸',
    kind: 'note',
    tags: ['第一次', '节日'],
    location: '市妇幼保健院',
    shot: 0,
  },
  {
    id: 2,
    created_at: '2025-08-30',
    title: '待产包整理完毕',
    content: '衣服叠了三遍，还是觉得少。',
    author_relation_label: '妈妈',
    kind: 'note',
    tags: ['日常'],
    shot: 1,
  },
  {
    id: 1,
    created_at: '2025-05-12',
    title: '第一次听到心跳',
    content: '像一列很快的小火车。医生说 158 次/分，很有力。',
    author_relation_label: '妈妈',
    kind: 'note',
    tags: ['第一次', '体检'],
    location: '市妇幼保健院',
    shot: 1,
  },
]

const BIRTH_MS = new Date(`${TIMELINE_SUBJECT.birth}T00:00:00`).getTime()

export function dayIndexFromBirth(iso: string): number {
  const t = new Date(`${iso}T00:00:00`).getTime()
  return Math.max(0, Math.round((t - BIRTH_MS) / 86400000))
}

/** 出生前用「孕 N 周」；出生后用「出生 N 天 / N 个月」。 */
export function ageLabel(dayIndex: number): string {
  if (dayIndex === 0) return '出生当天'
  if (dayIndex < 0) return `孕 ${Math.max(0, 40 + Math.round(dayIndex / 7))} 周`
  if (dayIndex < 60) return `出生 ${dayIndex} 天`
  const months = Math.floor(dayIndex / 30.44)
  const rest = dayIndex - Math.round(months * 30.44)
  if (months < 12) return rest > 0 ? `${months} 个月 ${rest} 天` : `${months} 个月`
  const years = Math.floor(months / 12)
  const m = months % 12
  return m > 0 ? `${years} 岁 ${m} 个月` : `${years} 岁`
}

/**
 * 给每张图一个稳定的高宽比（0.72–1.55 之间），让横向轨道高低错落。
 * 用 id 做种子而不是随机，保证每次渲染 / 刷新都一致。
 */
function aspectFor(id: number, index: number): number {
  const seq = [1.25, 1.0, 0.8, 1.45, 1.1, 0.72, 1.33, 0.95, 1.18, 1.5, 0.85, 1.06]
  return seq[(id + index * 5) % seq.length]
}

export const MOMENTS: Moment[] = SEEDS.map((seed) => {
  const shots = Array.from({ length: seed.shot ?? 0 }, (_, i) =>
    img(seed.id * 10 + i, `${seed.title} 配图 ${i + 1}`),
  )
  return {
    ...seed,
    dayIndex: dayIndexFromBirth(seed.created_at),
    aspect: aspectFor(seed.id, 0),
    // 轨道是视觉主体，纯文字动态也给一张封面占位（shot:0 的条目）
    media: seed.media ?? (shots.length ? shots : [img(seed.id * 10 + 90, `${seed.title} 封面`)]),
  }
}).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

export type MonthGroup = {
  key: string
  /** 1–12 */
  month: number
  year: number
  label: string
  labelEn: string
  moments: Moment[]
  tags: { tag: string; count: number }[]
}

const MONTH_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function groupByMonth(moments: Moment[]): MonthGroup[] {
  const map = new Map<string, Moment[]>()
  for (const m of moments) {
    const key = m.created_at.slice(0, 7)
    const list = map.get(key) ?? []
    list.push(m)
    map.set(key, list)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => {
      const [y, mo] = key.split('-').map(Number)
      const counts = new Map<string, number>()
      for (const m of list) {
        for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
      }
      return {
        key,
        year: y,
        month: mo,
        label: `${mo} 月`,
        labelEn: MONTH_EN[mo - 1],
        moments: list,
        tags: [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => ({ tag, count })),
      }
    })
}

export const TIMELINE_MONTHS = groupByMonth(MOMENTS)

export const TIMELINE_STATS = {
  total: MOMENTS.length,
  photos: MOMENTS.reduce(
    (n, m) => n + m.media.filter((x) => x.kind === 'image').length,
    0,
  ),
  months: TIMELINE_MONTHS.length,
  authors: new Set(MOMENTS.map((m) => m.author_relation_label)).size,
  currentDay: dayIndexFromBirth(
    new Date().toISOString().slice(0, 10),
  ),
}

export const TIMELINE_TAGS = TIMELINE_MONTHS.reduce<{ tag: string; count: number }[]>(
  (acc, group) => {
    for (const t of group.tags) {
      const hit = acc.find((x) => x.tag === t.tag)
      if (hit) hit.count += t.count
      else acc.push({ ...t })
    }
    return acc
  },
  [],
).sort((a, b) => b.count - a.count)
