import { App, Input, Modal } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createAlbum,
  fetchAlbums,
  type Album,
} from '../../api/albums'
import { fetchMediaLibrary } from '../../api/media'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { resolveMediaUrl } from './mediaUrl'
import { useWorkspace } from '../workspaces/WorkspaceContext'

export function AlbumHomePage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { current, loading: wsLoading } = useWorkspace()
  const [albums, setAlbums] = useState<Album[]>([])
  const [allCount, setAllCount] = useState(0)
  const [allCover, setAllCover] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const canEdit =
    current?.my_role === 'owner' || current?.my_role === 'editor'

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!current) {
        setAlbums([])
        setAllCount(0)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const [albumList, library] = await Promise.all([
          fetchAlbums(current.id),
          fetchMediaLibrary(current.id, {
            page: 1,
            media_type: 'image',
            page_size: 1,
          }),
        ])
        if (cancelled) return
        setAlbums(albumList)
        setAllCount(library.count)
        const first = library.results[0]
        setAllCover(
          first
            ? resolveMediaUrl(
                first.thumbnail_url || first.file_url,
                first.object_key,
              )
            : '',
        )
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
  }, [current?.id])

  async function onCreate() {
    if (!current || !title.trim()) return
    setSaving(true)
    try {
      const album = await createAlbum(current.id, { title: title.trim() })
      message.success('相册已创建')
      setCreating(false)
      setTitle('')
      navigate(`/album/${album.id}`)
    } catch (err) {
      message.error(friendlyError(err, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  if (wsLoading || loading) return <p className="meta">加载中…</p>

  return (
    <>
      <header className="page-header album-home-header">
        <h1>相册</h1>
        {canEdit ? (
          <Button
            variant="primary"
            type="button"
            onClick={() => setCreating(true)}
          >
            新建相册
          </Button>
        ) : null}
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <ul className="album-grid">
        <li>
          <AlbumCard
            to="/album/all"
            title="全部照片"
            subtitle={`${allCount} 张`}
            coverUrl={allCover}
          />
        </li>
        {albums.map((a) => (
          <li key={a.id}>
            <AlbumCard
              to={`/album/${a.id}`}
              title={a.title}
              subtitle={`${a.item_count} 张`}
              coverUrl={a.cover_url}
            />
          </li>
        ))}
      </ul>

      {!loading && albums.length === 0 && allCount === 0 ? (
        <EmptyState
          title="还没有照片"
          hint={
            canEdit
              ? '发布动态时带上照片，或新建相册后直接上传。'
              : '等待家人分享照片。'
          }
          action={
            canEdit ? (
              <Button variant="primary" to="/compose">
                去发布
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <Modal
        title="新建相册"
        open={creating}
        onCancel={() => !saving && setCreating(false)}
        onOk={() => void onCreate()}
        okText="创建"
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{ disabled: !title.trim() }}
        centered
        destroyOnHidden
      >
        <Input
          placeholder="相册名称"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={() => void onCreate()}
          autoFocus
        />
      </Modal>
    </>
  )
}

function AlbumCard({
  to,
  title,
  subtitle,
  coverUrl,
}: {
  to: string
  title: string
  subtitle: string
  coverUrl: string
}) {
  return (
    <Link to={to} className="album-card">
      <div className="album-card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="album-card-empty" aria-hidden />
        )}
      </div>
      <div className="album-card-meta">
        <p className="album-card-title">{title}</p>
        <p className="album-card-sub">{subtitle}</p>
      </div>
    </Link>
  )
}
