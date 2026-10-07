import { App } from 'antd'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  createRecord,
  fetchRecord,
  updateRecord,
} from '../../api/records'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { invalidateFeedCache } from '../feed/feedCache'
import { uploadFilesToRecord } from '../media/upload'
import { extractVideoPoster } from '../media/extractVideoPoster'
import {
  filterLivePhotoCompanions,
  isVideoFile,
} from '../media/fileKind'
import { useWorkspace } from '../workspaces/WorkspaceContext'

type Mode = 'create' | 'edit'

type PendingItem = {
  uid: string
  file: File
  previewUrl?: string
  kind: 'image' | 'video'
}

type ItemUploadStatus = 'idle' | 'compressing' | 'uploading' | 'done'

type PublishPhase =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | {
      kind: 'uploading'
      completed: number
      total: number
      detail?: string
    }

const MAX_MEDIA = 9

function fileKind(file: File): PendingItem['kind'] {
  return isVideoFile(file) ? 'video' : 'image'
}

export function RecordFormPage({ mode }: { mode: Mode }) {
  const { recordId } = useParams()
  const rid = Number(recordId)
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { user } = useAuth()
  const { current } = useWorkspace()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pending, setPending] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(mode === 'edit')
  const [phase, setPhase] = useState<PublishPhase>({ kind: 'idle' })
  const [itemStatus, setItemStatus] = useState<
    Record<string, ItemUploadStatus>
  >({})
  const [forbidden, setForbidden] = useState(false)

  const busy = phase.kind !== 'idle'
  const canWrite =
    current?.my_role === 'owner' || current?.my_role === 'editor'

  useEffect(() => {
    return () => {
      pending.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mode !== 'edit' || !current || !Number.isFinite(rid)) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const record = await fetchRecord(current!.id, rid)
        if (cancelled) return
        if (current!.my_role === 'editor' && record.author_id !== user?.id) {
          setForbidden(true)
          return
        }
        setTitle(record.title)
        setContent(record.content)
      } catch (err) {
        if (!cancelled) message.error(friendlyError(err, '加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [mode, current, rid, user?.id, message])

  async function addFiles(files: File[]) {
    const room = MAX_MEDIA - pending.length
    if (room <= 0) {
      message.warning('最多 9 个图片/视频')
      return
    }
    const filtered = filterLivePhotoCompanions(files)
    if (filtered.length < files.length) {
      message.info('已忽略实况照片的配套短视频，只保留静止图')
    }
    const slice = filtered.slice(0, room)
    const next: PendingItem[] = []
    for (const file of slice) {
      const kind = fileKind(file)
      let previewUrl: string | undefined
      if (kind === 'image') {
        previewUrl = URL.createObjectURL(file)
      } else if (kind === 'video') {
        const poster = await extractVideoPoster(file)
        if (poster) previewUrl = URL.createObjectURL(poster)
      }
      next.push({
        uid: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl,
        kind,
      })
    }
    setPending((prev) => [...prev, ...next].slice(0, MAX_MEDIA))
  }

  function removePending(uid: string) {
    setPending((prev) => {
      const item = prev.find((p) => p.uid === uid)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((p) => p.uid !== uid)
    })
  }

  if (!current) {
    return <p className="meta">请先选择空间。</p>
  }

  if (!canWrite || forbidden) {
    return <Navigate to="/" replace />
  }

  async function onPublish() {
    if (!current) return
    if (!content.trim() && pending.length === 0) {
      message.warning('写点文字，或加一张照片吧')
      return
    }
    const workspaceId = current.id
    const pendingSnapshot = pending
    const hadMedia = pendingSnapshot.length > 0
    // Force paint so loading UI is visible before the first network await.
    flushSync(() => {
      setPhase({ kind: 'saving' })
      setItemStatus({})
    })
    let targetId = rid
    let recordCreated = mode === 'edit'
    try {
      if (mode === 'create') {
        const created = await createRecord(workspaceId, {
          title: '',
          content: content.trim(),
        })
        targetId = created.id
        recordCreated = true
      } else {
        await updateRecord(workspaceId, rid, {
          title: title.trim(),
          content: content.trim(),
        })
      }
      if (hadMedia) {
        const filteredFiles = filterLivePhotoCompanions(
          pendingSnapshot.map((p) => p.file),
        )
        const fileSet = new Set(filteredFiles)
        const uploadItems = pendingSnapshot.filter((p) => fileSet.has(p.file))
        if (uploadItems.length < pendingSnapshot.length) {
          message.info('已跳过实况照片配套短视频')
        }
        setPhase({
          kind: 'uploading',
          completed: 0,
          total: uploadItems.length,
        })
        await uploadFilesToRecord(
          workspaceId,
          targetId,
          uploadItems.map((p) => p.file),
          ({ completed, total: t, index, phase: p, uploadBytes }) => {
            const uid = uploadItems[index]?.uid
            if (uid) {
              setItemStatus((prev) => ({
                ...prev,
                [uid]:
                  p === 'done'
                    ? 'done'
                    : p === 'compress'
                      ? 'compressing'
                      : 'uploading',
              }))
            }
            const detail =
              p === 'compress'
                ? '正在压缩大图…'
                : p === 'start' && uploadBytes != null
                  ? `正在上传约 ${(uploadBytes / 1024).toFixed(0)}KB…`
                  : undefined
            setPhase({
              kind: 'uploading',
              completed,
              total: t,
              detail,
            })
          },
        )
      }
      invalidateFeedCache(workspaceId)
      message.success(mode === 'create' ? '已发布' : '已保存')
      navigate(`/records/${targetId}`)
    } catch (err) {
      const msg = friendlyError(err, '发布失败，请重试')
      if (recordCreated && hadMedia && Number.isFinite(targetId)) {
        invalidateFeedCache(workspaceId)
        navigate(`/records/${targetId}`, {
          replace: true,
          state: { uploadError: `动态已保存，但图片/视频上传失败：${msg}` },
        })
        return
      }
      message.error(msg)
      setPhase({ kind: 'idle' })
      setItemStatus({})
    }
  }

  if (loading) {
    return <p className="meta">加载中…</p>
  }

  const backTo = mode === 'edit' ? `/records/${rid}` : '/'
  const canAddMore = pending.length < MAX_MEDIA && !busy

  let submitLabel = mode === 'create' ? '发表' : '保存'
  if (phase.kind === 'saving') {
    submitLabel = '保存中…'
  } else if (phase.kind === 'uploading') {
    submitLabel =
      phase.total > 0
        ? `上传 ${phase.completed}/${phase.total}`
        : '上传中…'
  }

  let statusHint = ''
  if (phase.kind === 'saving') {
    statusHint = '正在保存动态…'
  } else if (phase.kind === 'uploading') {
    statusHint =
      phase.detail ||
      (phase.completed < phase.total
        ? `正在上传图片/视频（${phase.completed}/${phase.total}），请稍候`
        : '即将完成…')
  }

  return (
    <div
      className={`compose-form compose-form--moments${busy ? ' is-publishing' : ''}`}
      aria-busy={busy}
    >
      <header className="compose-top">
        {busy ? (
          <span className="compose-cancel is-disabled">取消</span>
        ) : (
          <Link className="compose-cancel" to={backTo}>
            取消
          </Link>
        )}
        <h1 className="compose-top-title">
          {mode === 'create' ? '发动态' : '编辑'}
        </h1>
        <Button
          variant="primary"
          type="button"
          className="compose-top-submit"
          disabled={busy}
          onClick={() => void onPublish()}
        >
          {submitLabel}
        </Button>
      </header>

      {statusHint ? (
        <p className="compose-upload-status" role="status" aria-live="polite">
          <span className="compose-upload-spinner" aria-hidden />
          {statusHint}
        </p>
      ) : null}

      {busy ? (
        <div className="compose-publish-overlay" role="alert" aria-live="assertive">
          <span className="compose-upload-spinner compose-upload-spinner--lg" aria-hidden />
          <strong>
            {phase.kind === 'saving'
              ? '正在保存…'
              : phase.kind === 'uploading'
                ? `上传中 ${phase.completed}/${phase.total}`
                : '处理中…'}
          </strong>
          <span>
            {phase.kind === 'uploading' && phase.detail
              ? phase.detail
              : '请勿关闭页面'}
          </span>
        </div>
      ) : null}

      <textarea
        className="compose-textarea compose-textarea--moments"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="这一刻的想法…"
        disabled={busy}
      />

      {pending.length > 0 || canAddMore ? (
        <ul className="compose-previews" aria-label="已选媒体">
          {pending.map((item) => {
            const st = itemStatus[item.uid] ?? 'idle'
            return (
              <li
                key={item.uid}
                className={`compose-preview-item${st !== 'idle' ? ` is-${st}` : ''}`}
              >
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt="" />
                ) : (
                  <span className="compose-file-chip">
                    {item.kind === 'video' ? '视频' : '文件'}
                  </span>
                )}
                {item.kind === 'video' && st === 'idle' ? (
                  <span className="compose-preview-play" aria-hidden>
                    ▶
                  </span>
                ) : null}
                {st === 'compressing' || st === 'uploading' ? (
                  <span className="compose-preview-overlay" aria-hidden>
                    <span className="compose-upload-spinner" />
                  </span>
                ) : null}
                {st === 'done' ? (
                  <span className="compose-preview-overlay is-done" aria-hidden>
                    ✓
                  </span>
                ) : null}
                <button
                  type="button"
                  className="compose-remove"
                  aria-label="移除"
                  disabled={busy}
                  onClick={() => removePending(item.uid)}
                >
                  ×
                </button>
              </li>
            )
          })}
          {canAddMore ? (
            <li className="compose-preview-item compose-preview-add">
              <input
                className="compose-file-input"
                type="file"
                accept="image/*,video/*,image/heic,image/heif"
                multiple
                disabled={busy}
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : []
                  e.target.value = ''
                  if (list.length) void addFiles(list)
                }}
              />
              <span className="compose-add-face">
                <span className="compose-add-plus">+</span>
                <span className="compose-add-label">照片/视频</span>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
