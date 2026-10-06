import { App } from 'antd'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  createRecord,
  fetchRecord,
  updateRecord,
} from '../../api/records'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { uploadFilesToRecord } from '../media/upload'
import { extractVideoPoster } from '../media/extractVideoPoster'
import { useWorkspace } from '../workspaces/WorkspaceContext'

type Mode = 'create' | 'edit'

type PendingItem = {
  uid: string
  file: File
  previewUrl?: string
  kind: 'image' | 'video'
}

const MAX_MEDIA = 9

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return /\.(mp4|mov|webm|m4v)$/i.test(file.name)
}

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
  const [saving, setSaving] = useState(false)
  const [forbidden, setForbidden] = useState(false)

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
    const slice = files.slice(0, room)
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
    setSaving(true)
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
        await uploadFilesToRecord(
          workspaceId,
          targetId,
          pendingSnapshot.map((p) => p.file),
        )
      }
      message.success(mode === 'create' ? '已发布' : '已保存')
      navigate(`/records/${targetId}`)
    } catch (err) {
      const msg = friendlyError(err, '发布失败，请重试')
      if (recordCreated && hadMedia && Number.isFinite(targetId)) {
        navigate(`/records/${targetId}`, {
          replace: true,
          state: { uploadError: `动态已保存，但图片/视频上传失败：${msg}` },
        })
        return
      }
      message.error(msg)
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="meta">加载中…</p>
  }

  const backTo = mode === 'edit' ? `/records/${rid}` : '/'
  const canAddMore = pending.length < MAX_MEDIA

  return (
    <div className="compose-form compose-form--moments">
      <header className="compose-top">
        <Link className="compose-cancel" to={backTo}>
          取消
        </Link>
        <h1 className="compose-top-title">
          {mode === 'create' ? '发动态' : '编辑'}
        </h1>
        <Button
          variant="primary"
          type="button"
          className="compose-top-submit"
          disabled={saving}
          onClick={() => void onPublish()}
        >
          {saving ? '…' : mode === 'create' ? '发表' : '保存'}
        </Button>
      </header>

      <textarea
        className="compose-textarea compose-textarea--moments"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="这一刻的想法…"
        disabled={saving}
      />

      {pending.length > 0 || canAddMore ? (
        <ul className="compose-previews" aria-label="已选媒体">
          {pending.map((item) => (
            <li key={item.uid} className="compose-preview-item">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" />
              ) : (
                <span className="compose-file-chip">
                  {item.kind === 'video' ? '视频' : '文件'}
                </span>
              )}
              {item.kind === 'video' ? (
                <span className="compose-preview-play" aria-hidden>
                  ▶
                </span>
              ) : null}
              <button
                type="button"
                className="compose-remove"
                aria-label="移除"
                disabled={saving}
                onClick={() => removePending(item.uid)}
              >
                ×
              </button>
            </li>
          ))}
          {canAddMore ? (
            <li className="compose-preview-item compose-preview-add">
              <input
                className="compose-file-input"
                type="file"
                accept="image/*,video/*,image/heic,image/heif"
                multiple
                disabled={saving}
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
