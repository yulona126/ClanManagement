import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pagination } from 'antd'
import { fetchRecords, type GrowthRecord } from '../../api/records'
import {
  EmptyComposeLink,
  EmptyState,
  FeedSkeleton,
} from '../../components/EmptyState'
import { friendlyError } from '../../components/friendlyError'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { FeedCard } from './FeedCard'
import {
  getFeedPageCache,
  getFeedViewState,
  isFeedFresh,
  saveFeedViewState,
  setFeedPageCache,
} from './feedCache'

function dayKey(iso: string): string {
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return iso.slice(0, 10)
  }
}

function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString())
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = dayKey(yesterdayDate.toISOString())
  if (key === today) return '今天'
  if (key === yesterday) return '昨天'
  const [y, m, d] = key.split('-')
  const thisYear = String(new Date().getFullYear())
  if (y === thisYear) return `${Number(m)}月${Number(d)}日`
  return `${y}年${Number(m)}月${Number(d)}日`
}

function groupByDay(
  records: GrowthRecord[],
): { key: string; items: GrowthRecord[] }[] {
  const map = new Map<string, GrowthRecord[]>()
  for (const r of records) {
    const k = dayKey(r.created_at)
    const list = map.get(k) ?? []
    list.push(r)
    map.set(k, list)
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }))
}

export function FeedPage() {
  const { current, loading: wsLoading } = useWorkspace()
  const workspaceId = current?.id

  const initialView =
    workspaceId != null ? getFeedViewState(workspaceId) : { lastPage: 1, scrollY: 0 }
  const initialPageCache =
    workspaceId != null
      ? getFeedPageCache(workspaceId, initialView.lastPage)
      : null

  const [page, setPage] = useState(() => initialView.lastPage)
  const [records, setRecords] = useState<GrowthRecord[]>(
    () => initialPageCache?.records ?? [],
  )
  const [count, setCount] = useState(() => initialPageCache?.count ?? 0)
  const [loading, setLoading] = useState(() => !initialPageCache)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restoreScrollRef = useRef(
    initialPageCache ? initialView.scrollY : 0,
  )
  const pageRef = useRef(page)

  const canWrite =
    current?.my_role === 'owner' || current?.my_role === 'editor'

  useEffect(() => {
    pageRef.current = page
  }, [page])

  // Workspace switch → restore that space's last page / scroll.
  useEffect(() => {
    if (workspaceId == null) return
    const view = getFeedViewState(workspaceId)
    const snap = getFeedPageCache(workspaceId, view.lastPage)
    setPage(view.lastPage)
    setRecords(snap?.records ?? [])
    setCount(snap?.count ?? 0)
    setLoading(!snap)
    setError(null)
    restoreScrollRef.current = snap ? view.scrollY : 0
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (workspaceId == null || !current) {
        setRecords([])
        setCount(0)
        setLoading(false)
        return
      }

      const snap = getFeedPageCache(workspaceId, page)
      const hasCache = snap != null && snap.fetchedAt > 0

      if (hasCache) {
        setRecords(snap.records)
        setCount(snap.count)
        setLoading(false)
        if (isFeedFresh(snap)) return
        setRefreshing(true)
      } else {
        setLoading(true)
        setError(null)
      }

      try {
        const data = await fetchRecords(workspaceId, page)
        if (cancelled) return
        setRecords(data.results)
        setCount(data.count)
        setFeedPageCache(workspaceId, {
          records: data.results,
          count: data.count,
          page,
          fetchedAt: Date.now(),
        })
        saveFeedViewState(workspaceId, { page })
        setError(null)
      } catch (err) {
        if (!cancelled && !hasCache) {
          setError(friendlyError(err, '加载动态失败'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (workspaceId != null) {
        saveFeedViewState(workspaceId, {
          page: pageRef.current,
          scrollY: window.scrollY,
        })
      }
    }
  }, [current, workspaceId, page])

  useLayoutEffect(() => {
    const y = restoreScrollRef.current
    if (y <= 0 || records.length === 0 || loading) return
    const id = window.requestAnimationFrame(() => {
      window.scrollTo(0, y)
      restoreScrollRef.current = 0
    })
    return () => window.cancelAnimationFrame(id)
  }, [records, page, workspaceId, loading])

  const groups = useMemo(() => groupByDay(records), [records])
  const totalPages = Math.max(1, Math.ceil(count / 20))

  if (wsLoading) {
    return <FeedSkeleton />
  }

  return (
    <div className="feed-page">
      {loading && records.length === 0 ? <FeedSkeleton /> : null}
      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          message={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {!loading && records.length === 0 && !error ? (
        <EmptyState
          title="还没有动态"
          hint={canWrite ? '发一条文字、照片或语音吧。' : '等待家人分享第一刻。'}
          action={canWrite ? <EmptyComposeLink /> : undefined}
        />
      ) : null}

      {records.length > 0 ? (
        <div className={`feed-groups${refreshing ? ' is-refreshing' : ''}`}>
          {groups.map((g) => (
            <section key={g.key} className="feed-day">
              <h2 className="feed-day-label">
                <span>{dayLabel(g.key)}</span>
              </h2>
              <ul className="feed-list">
                {g.items.map((r) => (
                  <li key={r.id}>
                    <FeedCard record={r} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="feed-pager">
          <Pagination
            current={page}
            total={count}
            pageSize={20}
            disabled={loading}
            showSizeChanger={false}
            simple
            onChange={(p) => {
              if (workspaceId != null) {
                saveFeedViewState(workspaceId, { page: p, scrollY: 0 })
              }
              restoreScrollRef.current = 0
              window.scrollTo(0, 0)
              setPage(p)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
