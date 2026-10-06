import { useEffect, useMemo, useState } from 'react'
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
  const [records, setRecords] = useState<GrowthRecord[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canWrite =
    current?.my_role === 'owner' || current?.my_role === 'editor'

  useEffect(() => {
    setPage(1)
  }, [current?.id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!current) {
        setRecords([])
        setCount(0)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await fetchRecords(current.id, page)
        if (!cancelled) {
          setRecords(data.results)
          setCount(data.count)
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, '加载动态失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [current, page])

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
        <div className="feed-groups">
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
            onChange={setPage}
          />
        </div>
      ) : null}
    </div>
  )
}
