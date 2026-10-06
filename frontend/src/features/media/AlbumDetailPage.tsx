import { App, Dropdown, Input, Modal } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  addAlbumItems,
  deleteAlbum,
  fetchAlbum,
  fetchAlbumItems,
  removeAlbumItem,
  updateAlbum,
  type Album,
} from '../../api/albums'
import { fetchMediaLibrary, type MediaAsset } from '../../api/media'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { PhotoWall } from './PhotoWall'
import { uploadFilesToAlbum } from './upload'

export function AlbumDetailPage() {
  const { albumId } = useParams()
  const aid = Number(albumId)
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const { current, loading: wsLoading } = useWorkspace()
  const fileRef = useRef<HTMLInputElement>(null)

  const [album, setAlbum] = useState<Album | null>(null)
  const [items, setItems] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [picking, setPicking] = useState(false)
  const [library, setLibrary] = useState<MediaAsset[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [savingPick, setSavingPick] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const canEdit =
    current?.my_role === 'owner' || current?.my_role === 'editor'

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!current || !Number.isFinite(aid)) {
        setAlbum(null)
        setItems([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const [a, page] = await Promise.all([
          fetchAlbum(current.id, aid),
          fetchAlbumItems(current.id, aid, { page: 1, page_size: 120 }),
        ])
        if (cancelled) return
        setAlbum(a)
        setItems(page.results)
        setEditTitle(a.title)
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
  }, [current?.id, aid, reloadKey])

  async function openPicker() {
    if (!current) return
    setPicking(true)
    setSelected(new Set())
    try {
      const data = await fetchMediaLibrary(current.id, {
        page: 1,
        media_type: 'image',
        page_size: 100,
      })
      const inAlbum = new Set(items.map((i) => i.id))
      setLibrary(data.results.filter((m) => !inAlbum.has(m.id)))
    } catch (err) {
      message.error(friendlyError(err, '加载照片失败'))
      setPicking(false)
    }
  }

  async function confirmPick() {
    if (!current || !album || selected.size === 0) return
    setSavingPick(true)
    try {
      const res = await addAlbumItems(current.id, album.id, [...selected])
      message.success(`已添加 ${res.added} 张`)
      setPicking(false)
      setReloadKey((k) => k + 1)
    } catch (err) {
      message.error(friendlyError(err, '添加失败'))
    } finally {
      setSavingPick(false)
    }
  }

  async function onUpload(files: File[]) {
    if (!current || !album || !files.length) return
    setUploading(true)
    try {
      const added = await uploadFilesToAlbum(current.id, album.id, files)
      message.success(`已上传 ${added.length} 张`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      message.error(friendlyError(err, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  async function onSaveMeta() {
    if (!current || !album || !editTitle.trim()) return
    try {
      const updated = await updateAlbum(current.id, album.id, {
        title: editTitle.trim(),
        description: album.description,
      })
      setAlbum(updated)
      setEditing(false)
      message.success('已保存')
    } catch (err) {
      message.error(friendlyError(err, '保存失败'))
    }
  }

  function onDeleteAlbum() {
    if (!current || !album) return
    modal.confirm({
      title: '删除这个相册？',
      content: '相册内的照片不会被删除，仍可在「全部照片」中查看。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        await deleteAlbum(current.id, album.id)
        message.success('相册已删除')
        navigate('/album', { replace: true })
      },
    })
  }

  function onRemoveItem(mediaId: number) {
    if (!current || !album) return
    modal.confirm({
      title: '从相册移除？',
      content: '仅移出本相册，不会删除原图。',
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        await removeAlbumItem(current.id, album.id, mediaId)
        setItems((prev) => prev.filter((m) => m.id !== mediaId))
        message.success('已移除')
      },
    })
  }

  if (!Number.isFinite(aid)) {
    return <Navigate to="/album" replace />
  }

  if (wsLoading || loading) return <p className="meta">加载中…</p>

  if (error || !album) {
    return (
      <>
        <p className="form-error">{error || '相册不存在'}</p>
        <Button variant="link" to="/album">
          返回相册
        </Button>
      </>
    )
  }

  return (
    <>
      <header className="page-header album-home-header">
        <div>
          <Link className="meta album-back" to="/album">
            ← 相册
          </Link>
          <h1>{album.title}</h1>
          <p className="meta">{album.item_count} 张</p>
        </div>
        {canEdit ? (
          <div className="btn-row album-detail-actions">
            <Button variant="ghost" type="button" onClick={() => void openPicker()}>
              从全部添加
            </Button>
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
              {uploading ? '上传中…' : '上传'}
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'rename',
                    label: '重命名',
                    onClick: () => setEditing(true),
                  },
                  {
                    key: 'delete',
                    label: '删除相册',
                    danger: true,
                    onClick: () => onDeleteAlbum(),
                  },
                ],
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button
                variant="ghost"
                type="button"
                aria-label="更多"
                className="album-more-btn"
              >
                ⋯
              </Button>
            </Dropdown>
          </div>
        ) : null}
      </header>

      <PhotoWall
        items={items}
        onRemove={canEdit ? onRemoveItem : undefined}
        empty={
          <EmptyState
            title="相册还是空的"
            hint={canEdit ? '上传新照片，或从全部照片中挑选。' : undefined}
            action={
              canEdit ? (
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  上传照片
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Modal
        title="重命名相册"
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={() => void onSaveMeta()}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: !editTitle.trim() }}
        centered
        destroyOnHidden
      >
        <Input
          value={editTitle}
          maxLength={120}
          onChange={(e) => setEditTitle(e.target.value)}
          onPressEnter={() => void onSaveMeta()}
          autoFocus
        />
      </Modal>

      <Modal
        title="从全部照片添加"
        open={picking}
        onCancel={() => !savingPick && setPicking(false)}
        onOk={() => void confirmPick()}
        okText={selected.size ? `添加 ${selected.size} 张` : '添加'}
        cancelText="取消"
        confirmLoading={savingPick}
        okButtonProps={{ disabled: selected.size === 0 }}
        centered
        width={560}
        destroyOnHidden
      >
        {library.length === 0 ? (
          <p className="meta">没有可添加的照片了。</p>
        ) : (
          <PhotoWall
            items={library}
            selectable
            selectedIds={selected}
            onToggleSelect={(id) => {
              setSelected((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
          />
        )}
      </Modal>
    </>
  )
}
