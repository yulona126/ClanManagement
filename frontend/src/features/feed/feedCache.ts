import type { GrowthRecord } from '../../api/records'

export type FeedPageSnapshot = {
  records: GrowthRecord[]
  count: number
  page: number
  fetchedAt: number
}

type WorkspaceFeedCache = {
  pages: Map<number, FeedPageSnapshot>
  /** Last viewed page — restored when re-entering feed. */
  lastPage: number
  scrollY: number
}

/** Show cached feed instantly; background refresh after this age. */
export const FEED_STALE_MS = 60_000

/**
 * 内存里保留这么多页，其余丢掉（sessionStorage 空间有限）。
 * 一般只会用到当前页。
 */
const MAX_PAGES = 5

const STORAGE_PREFIX = 'claner.feed.v1.'
/** 结构变化时改这个，旧数据自然失效，不会读出脏结构。 */
const STORAGE_VERSION = 1

const byWorkspace = new Map<number, WorkspaceFeedCache>()

type Persisted = {
  v: number
  lastPage: number
  scrollY: number
  pages: [number, FeedPageSnapshot][]
}

function storageKey(workspaceId: number): string {
  return `${STORAGE_PREFIX}${workspaceId}`
}

function safeSession(): Storage | null {
  try {
    // 隐私模式下访问 sessionStorage 可能直接抛异常
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/**
 * 取（必要时从 sessionStorage 恢复）某个空间的缓存。
 *
 * 为什么要落 sessionStorage：缓存只放内存时，**任何一次真实的页面重载**
 * 都会让它消失——回到列表就变成重新请求 + 回到顶部 + 图片重新解码。
 * 放进 sessionStorage 后，刷新 / PWA 重启 / 浏览器丢弃页面都能立刻还原。
 */
function hydrate(workspaceId: number): WorkspaceFeedCache {
  let entry = byWorkspace.get(workspaceId)
  if (entry) return entry

  entry = { pages: new Map(), lastPage: 1, scrollY: 0 }
  const store = safeSession()
  const raw = store?.getItem(storageKey(workspaceId))
  if (raw) {
    try {
      const data = JSON.parse(raw) as Persisted
      if (data?.v === STORAGE_VERSION && Array.isArray(data.pages)) {
        entry.lastPage = data.lastPage || 1
        entry.scrollY = data.scrollY || 0
        for (const [page, snap] of data.pages) {
          if (snap && Array.isArray(snap.records)) entry.pages.set(page, snap)
        }
      }
    } catch {
      // 坏数据忽略即可，下次写入会覆盖
    }
  }
  byWorkspace.set(workspaceId, entry)
  return entry
}

function persist(workspaceId: number, entry: WorkspaceFeedCache): void {
  const store = safeSession()
  if (!store) return

  // 只留最近的若干页
  const pages = [...entry.pages.entries()]
    .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
    .slice(0, MAX_PAGES)

  const payload: Persisted = {
    v: STORAGE_VERSION,
    lastPage: entry.lastPage,
    scrollY: entry.scrollY,
    pages,
  }
  try {
    store.setItem(storageKey(workspaceId), JSON.stringify(payload))
  } catch {
    // 超配额（QuotaExceeded）时退化成纯内存缓存：先清掉旧数据
    try {
      store.removeItem(storageKey(workspaceId))
    } catch {
      /* 忽略 */
    }
  }
}

export function getFeedPageCache(
  workspaceId: number,
  page: number,
): FeedPageSnapshot | null {
  return hydrate(workspaceId).pages.get(page) ?? null
}

export function getFeedViewState(workspaceId: number): {
  lastPage: number
  scrollY: number
} {
  const entry = hydrate(workspaceId)
  return {
    lastPage: entry.lastPage,
    scrollY: entry.scrollY,
  }
}

export function setFeedPageCache(
  workspaceId: number,
  snapshot: FeedPageSnapshot,
): void {
  const entry = hydrate(workspaceId)
  entry.pages.set(snapshot.page, snapshot)
  entry.lastPage = snapshot.page
  persist(workspaceId, entry)
}

export function saveFeedViewState(
  workspaceId: number,
  state: { page?: number; scrollY?: number },
): void {
  const entry = hydrate(workspaceId)
  if (state.page != null) entry.lastPage = state.page
  if (state.scrollY != null) entry.scrollY = state.scrollY
  persist(workspaceId, entry)
}

/**
 * 清空缓存。
 *
 * 传 pages 表示只丢这几页（发完动态只让第 1 页失效，
 * 其它页的滚动位置仍然保留）。
 */
export function invalidateFeedCache(
  workspaceId?: number,
  pages?: number[],
): void {
  if (workspaceId == null) {
    const store = safeSession()
    if (store) {
      try {
        const keys = Object.keys(store).filter((k) =>
          k.startsWith(STORAGE_PREFIX),
        )
        for (const k of keys) store.removeItem(k)
      } catch {
        /* 忽略 */
      }
    }
    byWorkspace.clear()
    return
  }

  const entry = byWorkspace.get(workspaceId)
  if (pages?.length) {
    for (const p of pages) entry?.pages.delete(p)
    if (entry) persist(workspaceId, entry)
    return
  }

  byWorkspace.delete(workspaceId)
  const store = safeSession()
  try {
    store?.removeItem(storageKey(workspaceId))
  } catch {
    /* 忽略 */
  }
}

export function isFeedFresh(snapshot: FeedPageSnapshot | null): boolean {
  if (!snapshot || snapshot.fetchedAt <= 0) return false
  return Date.now() - snapshot.fetchedAt < FEED_STALE_MS
}
