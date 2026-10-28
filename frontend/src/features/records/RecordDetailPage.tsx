import { App, Modal } from 'antd'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  deleteRecord,
  fetchRecord,
  reorderRecordMedia,
  type GrowthRecord,
} from '../../api/records'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { SkeletonBlock } from '../../components/EmptyState'
import { HoldToTalkButton } from '../../hooks/HoldToTalkButton'
import { CommentsPanel } from '../media/CommentsPanel'
import { MediaFilePicker } from '../media/MediaFilePicker'
import { MediaGallery } from '../media/MediaGallery'
import { invalidateFeedCache } from '../feed/feedCache'
import { uploadAudioBlobToRecord, uploadFilesToRecord } from '../media/upload'
import { AuthorAvatar } from '../feed/AuthorAvatar'
import { formatRelativeTime } from '../feed/time'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { usePointerReorder } from '../common/usePointerReorder'

const MENU_ICONS = {
  edit: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  ),
  add: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  ),
  order: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h9M4 12h13M4 17h7" />
      <path d="M18 14l3 3-3 3" />
    </svg>
  ),
  trash: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13h10l1-13" />
    </svg>
  ),
}

type DetailLocationState = {
  uploadError?: string
}

export function RecordDetailPage() {
  const { recordId } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const focusMedia = Number(searchParams.get('media'))
  const initialMediaId = Number.isFinite(focusMedia) ? focusMedia : null
  const rid = Number(recordId)
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const { user } = useAuth()
  const { current } = useWorkspace()
  const [record, setRecord] = useState<GrowthRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadWarning, setUploadWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAddMedia, setShowAddMedia] = useState(false)
  /** 调整媒体顺序（已发布的也能改） */
  const [reorderOpen, setReorderOpen] = useState(false)
  const [orderDraft, setOrderDraft] = useState<number[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const state = location.state as DetailLocationState | null
    if (state?.uploadError) {
      setUploadWarning(state.uploadError)
      navigate(location.pathname + location.search, { replace: true, state: null })
    }
  }, [location, navigate])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!current || !Number.isFinite(rid)) {
        setRecord(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await fetchRecord(current.id, rid)
        if (!cancelled) setRecord(data)
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
  }, [current, rid])

  useEffect(() => {
    if (window.location.hash === '#comments') {
      document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [record])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [menuOpen])

  const canEdit =
    !!record &&
    !!current &&
    (current.my_role === 'owner' ||
      (current.my_role === 'editor' && record.author_id === user?.id))

  const canComment = Boolean(current)

  /** 把 id 从当前位置挪到目标位置（排序弹窗与手机拖拽共用） */
  function moveOrder(fromId: number, toId: number) {
    setOrderDraft((prev) => {
      const fromIdx = prev.indexOf(fromId)
      const toIdx = prev.indexOf(toId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const next = [...prev]
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, fromId)
      return next
    })
  }

  const { handlers: reorderHandlers } = usePointerReorder((from, to) =>
    moveOrder(Number(from), Number(to)),
  )

  async function saveOrder() {
    if (!current || !record) return
    setSavingOrder(true)
    try {
      await reorderRecordMedia(current.id, record.id, orderDraft)
      // 本地重排，避免整页刷新；其余媒体（语音）保持原样接在后面
      const map = new Map(record.media.map((m) => [m.id, m]))
      const ordered = orderDraft
        .map((mid) => map.get(mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
      const rest = record.media.filter((m) => !orderDraft.includes(m.id))
      setRecord({ ...record, media: [...ordered, ...rest] })
      invalidateFeedCache(current.id)
      setReorderOpen(false)
    } catch (err) {
      setError(friendlyError(err, '保存顺序失败'))
    } finally {
      setSavingOrder(false)
    }
  }

  function onDelete() {
    if (!current || !record) return
    setMenuOpen(false)
    modal.confirm({
      title: '确定删除这条动态？',
      content: '删除后不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          await deleteRecord(current.id, record.id)
          invalidateFeedCache(current.id)
          navigate('/')
        } catch (err) {
          setError(friendlyError(err, '删除失败'))
          setDeleting(false)
          throw err
        }
      },
    })
  }

  async function onAddMedia(files: File[]) {
    if (!current || !record) return
    setUploading(true)
    setError(null)
    try {
      const added = await uploadFilesToRecord(current.id, record.id, files)
      setRecord({ ...record, media: [...record.media, ...added] })
      invalidateFeedCache(current.id)
      setUploadWarning(null)
      setShowAddMedia(false)
    } catch (err) {
      setError(friendlyError(err, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  async function onAddVoice(blob: Blob, mimeType: string) {
    if (!current || !record) return
    setUploading(true)
    setError(null)
    try {
      const added = await uploadAudioBlobToRecord(
        current.id,
        record.id,
        blob,
        mimeType,
      )
      setRecord({ ...record, media: [...record.media, added] })
      invalidateFeedCache(current.id)
    } catch (err) {
      setError(friendlyError(err, '语音上传失败'))
    } finally {
      setUploading(false)
    }
  }

  if (!current) {
    return <p className="meta">请先选择空间。</p>
  }

  if (loading) {
    return (
      <div className="post-skeleton" aria-busy>
        <SkeletonBlock className="skeleton-line short" />
        <SkeletonBlock className="skeleton-line" />
        <SkeletonBlock className="skeleton-thumb tall" />
      </div>
    )
  }

  if (error && !record) {
    return (
      <>
        <p className="form-error">{error}</p>
        <Button variant="link" to="/">
          返回动态
        </Button>
      </>
    )
  }

  if (!record) {
    return <p className="meta">内容不存在。</p>
  }

  const author = record.author_relation_label || `用户 #${record.author_id}`
  const images = record.media.filter((m) => m.media_type !== 'audio')
  const audios = record.media.filter((m) => m.media_type === 'audio')

  return (
    <article className="post-detail post-detail--moments">
      <div className="post-toolbar">
        <Button variant="link" to="/">
          ← 动态
        </Button>
        {canEdit ? (
          <div className="post-menu" ref={menuRef}>
            <Button
              variant="ghost"
              type="button"
              className="post-menu-trigger"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              ···
            </Button>
            {menuOpen ? (
              <div className="post-menu-panel" role="menu">
                <Link
                  role="menuitem"
                  className="post-menu-item"
                  to={`/records/${record.id}/edit`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="post-menu-icon">{MENU_ICONS.edit}</span>
                  编辑文字
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="post-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowAddMedia(true)
                  }}
                >
                  <span className="post-menu-icon">{MENU_ICONS.add}</span>
                  添加照片/视频
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="post-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    setOrderDraft(
                      record.media
                        .filter((m) => m.media_type !== 'audio')
                        .map((m) => m.id),
                    )
                    setReorderOpen(true)
                  }}
                >
                  <span className="post-menu-icon">{MENU_ICONS.order}</span>
                  调整照片顺序
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="post-menu-item danger"
                  disabled={deleting || uploading}
                  onClick={() => void onDelete()}
                >
                  <span className="post-menu-icon">{MENU_ICONS.trash}</span>
                  {deleting ? '删除中…' : '删除'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <header className="moments-post-head">
        <AuthorAvatar
          className="moments-avatar"
          label={author}
          avatarUrl={record.author_avatar_url}
        />
        <div className="moments-post-meta">
          <p className="moments-author">{author}</p>
          <time className="meta">{formatRelativeTime(record.created_at)}</time>
        </div>
      </header>

      {uploadWarning ? (
        <p className="form-error" role="alert">
          {uploadWarning}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      {record.content ? (
        <div className="post-body moments-body">
          {record.content.split('\n').map((line, i) => (
            <p key={i}>{line || '\u00a0'}</p>
          ))}
        </div>
      ) : null}

      {/*
        调整顺序：拖动缩略图即可重排，第一张作为封面。
        已发布的动态也能改（走 records/{id}/media/reorder/）。
      */}
      <Modal
        open={reorderOpen}
        title="调整照片顺序"
        okText="保存顺序"
        cancelText="取消"
        confirmLoading={savingOrder}
        onCancel={() => setReorderOpen(false)}
        onOk={() => void saveOrder()}
        width={520}
      >
        <p className="meta" style={{ marginTop: 0 }}>
          拖动缩略图调整顺序，第一张作为封面。
        </p>
        <ul className="reorder-grid">
          {orderDraft.map((mid, index) => {
            const asset = record.media.find((m) => m.id === mid)
            if (!asset) return null
            return (
              <li
                key={mid}
                className="reorder-item"
                {...reorderHandlers(String(mid))}
              >
                <img
                  src={
                    asset.thumbnail_url
                      ? asset.thumbnail_url
                      : asset.file_url
                  }
                  alt=""
                  draggable={false}
                />
                <span className="reorder-item__no">{index + 1}</span>
              </li>
            )
          })}
        </ul>
      </Modal>

      {images.length > 0 ? (
        <MediaGallery
          items={images}
          variant="detail"
          initialMediaId={initialMediaId}
          onLightboxClose={() => {
            if (!searchParams.has('media')) return
            const next = new URLSearchParams(searchParams)
            next.delete('media')
            navigate(
              { pathname: location.pathname, search: next.toString() },
              { replace: true },
            )
          }}
        />
      ) : null}

      {audios.length > 0 ? (
        <div className="moments-audio-block">
          <MediaGallery items={audios} variant="detail" />
        </div>
      ) : null}

      {canEdit && showAddMedia ? (
        <div className="post-add-media moments-add-media">
          <div className="btn-row">
            <MediaFilePicker
              disabled={uploading || deleting}
              label={uploading ? '上传中…' : '从相册选择'}
              onFiles={onAddMedia}
            />
            <HoldToTalkButton
              disabled={uploading || deleting}
              label="按住说话"
              onRecorded={(blob, mime) => void onAddVoice(blob, mime)}
            />
            <Button
              variant="link"
              type="button"
              onClick={() => setShowAddMedia(false)}
            >
              收起
            </Button>
          </div>
        </div>
      ) : null}

      <div id="comments" className="moments-comments-wrap">
        <CommentsPanel
          workspaceId={current.id}
          kind="record"
          targetId={record.id}
          parentRecordId={record.id}
          canPost={!!canComment}
          myRole={current.my_role}
          title="评论"
          compact
        />
      </div>
    </article>
  )
}
