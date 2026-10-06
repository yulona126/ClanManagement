import { App } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMediaLibrary, type MediaAsset } from '../../api/media'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { groupByAge } from './ageBuckets'
import { PhotoWall } from './PhotoWall'
import { uploadFilesToLibrary } from './upload'

export function AllPhotosPage() {
  const { message } = App.useApp()
  const { current, loading: wsLoading } = useWorkspace()
  const fileRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<MediaAsset[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bucketKey, setBucketKey] = useState('all')
  const [reloadKey, setReloadKey] = useState(0)

  const canEdit =
    current?.my_role === 'owner' || current?.my_role === 'editor'

  useEffect(() => {
    setPage(1)
    setBucketKey('all')
  }, [current?.id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!current) {
        setItems([])
        setCount(0)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await fetchMediaLibrary(current.id, {
          page,
          media_type: 'image',
          page_size: 60,
        })
        if (!cancelled) {
          setItems(data.results)
          setCount(data.count)
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, '加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [current, page, reloadKey])

  const buckets = useMemo(
    () => groupByAge(items, current?.baby_birthday),
    [items, current?.baby_birthday],
  )

  const visible = useMemo(() => {
    if (bucketKey === 'all') return items
    return buckets.find((b) => b.key === bucketKey)?.items ?? []
  }, [bucketKey, buckets, items])

  async function onUpload(files: File[]) {
    if (!current || !files.length) return
    setUploading(true)
    try {
      const added = await uploadFilesToLibrary(current.id, files)
      message.success(`已上传 ${added.length} 张`)
      setReloadKey((k) => k + 1)
      setPage(1)
    } catch (err) {
      message.error(friendlyError(err, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  if (wsLoading) return <p className="meta">加载中…</p>

  const totalPages = Math.max(1, Math.ceil(count / 60))

  return (
    <>
      <header className="page-header album-home-header">
        <div>
          <Link className="meta album-back" to="/album">
            ← 相册
          </Link>
          <h1>全部照片</h1>
        </div>
        {canEdit ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,image/heic,image/heif"
              multiple
              hidden
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : []
                e.target.value = ''
                if (list.length) void onUpload(list)
              }}
            />
            <Button
              variant="primary"
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? '上传中…' : '上传照片'}
            </Button>
          </>
        ) : null}
      </header>

      <div className="age-tabs" role="tablist" aria-label="按年龄筛选">
        <button
          type="button"
          role="tab"
          className={`age-tab${bucketKey === 'all' ? ' is-active' : ''}`}
          aria-selected={bucketKey === 'all'}
          onClick={() => setBucketKey('all')}
        >
          全部 ({items.length})
        </button>
        {buckets.map((b) => (
          <button
            key={b.key}
            type="button"
            role="tab"
            className={`age-tab${bucketKey === b.key ? ' is-active' : ''}`}
            aria-selected={bucketKey === b.key}
            onClick={() => setBucketKey(b.key)}
          >
            {b.label} ({b.items.length})
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="meta">加载中…</p> : null}

      {!loading ? (
        <PhotoWall
          items={visible}
          empty={
            <EmptyState
              title="还没有图片"
              action={
                canEdit ? (
                  <Button variant="primary" to="/compose">
                    去发布
                  </Button>
                ) : undefined
              }
            />
          }
        />
      ) : null}

      {count > 60 ? (
        <div className="btn-row">
          <Button
            variant="ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="meta">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </>
  )
}
