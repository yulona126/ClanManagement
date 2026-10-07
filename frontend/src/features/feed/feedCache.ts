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

const byWorkspace = new Map<number, WorkspaceFeedCache>()

function ensureWorkspace(workspaceId: number): WorkspaceFeedCache {
  let entry = byWorkspace.get(workspaceId)
  if (!entry) {
    entry = { pages: new Map(), lastPage: 1, scrollY: 0 }
    byWorkspace.set(workspaceId, entry)
  }
  return entry
}

export function getFeedPageCache(
  workspaceId: number,
  page: number,
): FeedPageSnapshot | null {
  return byWorkspace.get(workspaceId)?.pages.get(page) ?? null
}

export function getFeedViewState(workspaceId: number): {
  lastPage: number
  scrollY: number
} {
  const entry = byWorkspace.get(workspaceId)
  return {
    lastPage: entry?.lastPage ?? 1,
    scrollY: entry?.scrollY ?? 0,
  }
}

export function setFeedPageCache(
  workspaceId: number,
  snapshot: FeedPageSnapshot,
): void {
  const entry = ensureWorkspace(workspaceId)
  entry.pages.set(snapshot.page, snapshot)
  entry.lastPage = snapshot.page
}

export function saveFeedViewState(
  workspaceId: number,
  state: { page?: number; scrollY?: number },
): void {
  const entry = ensureWorkspace(workspaceId)
  if (state.page != null) entry.lastPage = state.page
  if (state.scrollY != null) entry.scrollY = state.scrollY
}

export function invalidateFeedCache(workspaceId?: number): void {
  if (workspaceId == null) {
    byWorkspace.clear()
    return
  }
  byWorkspace.delete(workspaceId)
}

export function isFeedFresh(snapshot: FeedPageSnapshot | null): boolean {
  if (!snapshot || snapshot.fetchedAt <= 0) return false
  return Date.now() - snapshot.fetchedAt < FEED_STALE_MS
}
