import { App } from 'antd'
import { useEffect, useState, type FormEvent } from 'react'
import {
  deleteComment,
  fetchMediaComments,
  fetchRecordComments,
  postMediaComment,
  postRecordComment,
  type Comment,
} from '../../api/comments'
import { useAuth } from '../../auth/AuthContext'
import { VoiceBubble } from '../../components/VoiceBubble'
import { friendlyError } from '../../components/friendlyError'
import { HoldToTalkButton } from '../../hooks/HoldToTalkButton'
import { formatRelativeTime } from '../feed/time'
import { uploadAudioBlobToRecord } from './upload'

export function CommentsPanel({
  workspaceId,
  kind,
  targetId,
  parentRecordId,
  canPost,
  myRole,
  title = '评论',
  compact = false,
}: {
  workspaceId: number
  kind: 'record' | 'media'
  targetId: number
  parentRecordId: number
  canPost: boolean
  myRole: string | undefined
  title?: string
  /** Moments-style: hide large heading, tighter layout */
  compact?: boolean
}) {
  const { user } = useAuth()
  const { modal } = App.useApp()
  const [comments, setComments] = useState<Comment[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  /** Freshly sent voice duration hints (asset id → ms). */
  const [voiceDurations, setVoiceDurations] = useState<Record<number, number>>(
    {},
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setPage(1)
      try {
        const data =
          kind === 'record'
            ? await fetchRecordComments(workspaceId, targetId, 1)
            : await fetchMediaComments(workspaceId, targetId, 1)
        if (!cancelled) {
          setComments(data.results)
          setHasMore(Boolean(data.next))
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, '加载评论失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [workspaceId, kind, targetId])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    const nextPage = page + 1
    setLoadingMore(true)
    setError(null)
    try {
      const data =
        kind === 'record'
          ? await fetchRecordComments(workspaceId, targetId, nextPage)
          : await fetchMediaComments(workspaceId, targetId, nextPage)
      setComments((prev) => [...prev, ...data.results])
      setPage(nextPage)
      setHasMore(Boolean(data.next))
    } catch (err) {
      setError(friendlyError(err, '加载失败'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function submitComment(payload: { body?: string; audio_id?: number }) {
    setSaving(true)
    setError(null)
    try {
      const created =
        kind === 'record'
          ? await postRecordComment(workspaceId, targetId, payload)
          : await postMediaComment(workspaceId, targetId, payload)
      setComments((prev) => [created, ...prev])
      setBody('')
      setShowVoice(false)
    } catch (err) {
      setError(friendlyError(err, '发送失败'))
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !canPost) return
    await submitComment({ body: body.trim() })
  }

  async function onVoice(blob: Blob, mimeType: string, durationMs: number) {
    if (!canPost) return
    setSaving(true)
    setError(null)
    try {
      const asset = await uploadAudioBlobToRecord(
        workspaceId,
        parentRecordId,
        blob,
        mimeType,
        { forComment: true },
      )
      if (durationMs > 0) {
        setVoiceDurations((prev) => ({ ...prev, [asset.id]: durationMs }))
      }
      await submitComment({
        body: body.trim() || undefined,
        audio_id: asset.id,
      })
    } catch (err) {
      setError(friendlyError(err, '语音发送失败'))
    } finally {
      setSaving(false)
    }
  }

  function onDelete(cid: number) {
    modal.confirm({
      title: '删除这条评论？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          await deleteComment(workspaceId, cid)
          setComments((prev) => prev.filter((c) => c.id !== cid))
        } catch (err) {
          setError(friendlyError(err, '删除失败'))
          throw err
        }
      },
    })
  }

  const empty = !loading && comments.length === 0

  return (
    <section
      className={`comments-panel comments-panel--moments${compact ? ' is-compact' : ''}`}
    >
      {!compact ? (
        <h2 className="comments-heading sr-only">{title}</h2>
      ) : null}

      {loading ? <p className="meta comments-hint">加载评论…</p> : null}

      {!loading && !empty ? (
        <ul className="comment-list comment-list--moments">
          {comments.map((c) => {
            const canDelete = myRole === 'owner' || c.author_id === user?.id
            const name = c.author_relation_label || `用户 #${c.author_id}`
            return (
              <li key={c.id} className="comment-item comment-item--moments">
                <p className="comment-line">
                  <span className="comment-name">{name}</span>
                  {c.body ? (
                    <>
                      <span className="comment-colon">：</span>
                      <span className="comment-body-inline">{c.body}</span>
                    </>
                  ) : null}
                </p>
                {c.audio ? (
                  <div className="comment-audio">
                    <VoiceBubble
                      src={c.audio.file_url}
                      objectKey={c.audio.object_key}
                      durationMs={voiceDurations[c.audio.id] ?? null}
                    />
                  </div>
                ) : null}
                <div className="comment-foot">
                  <time className="meta">{formatRelativeTime(c.created_at)}</time>
                  {canDelete ? (
                    <button
                      type="button"
                      className="comment-delete"
                      onClick={() => onDelete(c.id)}
                    >
                      删除
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {!loading && empty ? (
        <p className="meta comments-hint">还没有评论，来说两句吧</p>
      ) : null}

      {!loading && hasMore ? (
        <button
          type="button"
          className="comment-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? '加载中…' : '查看更早评论'}
        </button>
      ) : null}

      {canPost ? (
        <div className="comment-compose comment-compose--moments">
          <form className="comment-bar" onSubmit={(e) => void onSubmit(e)}>
            <input
              className="comment-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="评论"
              disabled={saving}
              maxLength={2000}
            />
            <button
              type="button"
              className="comment-voice-toggle"
              disabled={saving}
              aria-pressed={showVoice}
              onClick={() => setShowVoice((v) => !v)}
            >
              语音
            </button>
            <button
              type="submit"
              className="comment-send"
              disabled={saving || !body.trim()}
            >
              发送
            </button>
          </form>
          {showVoice ? (
            <HoldToTalkButton
              disabled={saving}
              label="按住说话"
              onRecorded={(blob, mime, durationMs) =>
                void onVoice(blob, mime, durationMs)
              }
            />
          ) : null}
        </div>
      ) : (
        <p className="meta comments-hint">仅空间成员可评论</p>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </section>
  )
}
