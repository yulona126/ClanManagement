import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { postRecordComment, type Comment } from '../../api/comments'
import type { RecordCommentPreview } from '../../api/records'
import { friendlyError } from '../../components/friendlyError'

/** 列表里最多预览几条；再多给「查看全部」。 */
const PREVIEW_LIMIT = 3

/**
 * 朋友圈式的动态评论区。
 *
 * 直接在卡片下方显示最近几条评论，并可以就地回复 —— 不用进详情页。
 * 数据来自列表接口自带的 `latest_comments` / `comment_count`
 * （后端已用 Prefetch 一次取回，不是每条动态一个请求）。
 *
 * 旧版后端没有这两个字段时，这里退化成只显示「评论」链接。
 */
export function FeedComments({
  recordId,
  workspaceId,
  count,
  initial,
  canPost,
  open,
}: {
  recordId: number
  workspaceId: number
  count: number
  initial: RecordCommentPreview[]
  canPost: boolean
  /** 没有评论时默认收起，点「评论」才展开输入框，避免整屏都是灰块 */
  open: boolean
}) {
  const [comments, setComments] = useState<RecordCommentPreview[]>(initial)
  const [total, setTotal] = useState(count)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || posting) return
    setPosting(true)
    setError(null)
    try {
      const created: Comment = await postRecordComment(workspaceId, recordId, {
        body: text,
      })
      // 直接插入本地列表：不整页刷新，评论区原地长出来
      setComments((prev) => [
        ...prev,
        {
          id: created.id,
          author_id: created.author_id,
          author_relation_label: created.author_relation_label,
          body: created.body,
          has_audio: Boolean(created.audio),
          created_at: created.created_at,
        },
      ].slice(-PREVIEW_LIMIT))
      setTotal((n) => n + 1)
      setDraft('')
    } catch (err) {
      setError(friendlyError(err, '评论失败'))
    } finally {
      setPosting(false)
    }
  }

  const hidden = Math.max(0, total - comments.length)
  if (!open) return null

  return (
    <div className="feed-comments">
      {comments.length > 0 ? (
        <ul className="feed-comments-list">
          {comments.map((c) => (
            <li key={c.id} className="feed-comment">
              <b className="feed-comment-name">
                {c.author_relation_label || '家人'}
              </b>
              <span className="feed-comment-body">
                {c.has_audio ? '［语音评论］' : c.body}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="feed-comments-foot">
        {hidden > 0 ? (
          <Link className="feed-comments-all" to={`/records/${recordId}#comments`}>
            查看全部 {total} 条评论
          </Link>
        ) : null}
      </div>

      {canPost ? (
        <form className="feed-comment-form" onSubmit={(e) => void onSubmit(e)}>
          <input
            className="feed-comment-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="说点什么…"
            maxLength={500}
            aria-label="写评论"
            disabled={posting}
          />
          <button
            type="submit"
            className="feed-comment-send"
            disabled={posting || !draft.trim()}
          >
            {posting ? '发送中' : '发送'}
          </button>
        </form>
      ) : null}

      {error ? <p className="feed-comment-error">{error}</p> : null}
    </div>
  )
}
