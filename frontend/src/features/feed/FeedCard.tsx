import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GrowthRecord } from '../../api/records'
import type { MediaAsset } from '../../api/media'
import { AudioPlayer } from '../../components/AudioPlayer'
import { resolveMediaUrl } from '../media/mediaUrl'
import { AuthorAvatar } from './AuthorAvatar'
import { FeedComments } from './FeedComments'
import { formatRelativeTime } from './time'

const BODY_COLLAPSE_AT = 120

function gridModifier(n: number): string {
  if (n <= 1) return 'feed-grid--1'
  if (n === 2) return 'feed-grid--2'
  if (n === 4) return 'feed-grid--4'
  return 'feed-grid--3'
}

function VisualTile({
  asset,
  recordId,
}: {
  asset: MediaAsset
  recordId: number
}) {
  const isVideo = asset.media_type === 'video'
  const poster = asset.thumbnail_url
    ? resolveMediaUrl(asset.thumbnail_url)
    : null

  return (
    <Link
      /*
       * 不再带 ?media=：点图应该先进详情页，在详情里再点图才全屏。
       * 之前直接带参数会让详情页一进来就弹大图，跳过了「看这条动态」本身。
       */
      to={`/records/${recordId}`}
      className={`feed-tile${isVideo ? ' feed-tile--video' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {isVideo && !poster ? (
        <span className="feed-tile-video-fallback" aria-hidden />
      ) : (
        <img
          src={poster || resolveMediaUrl(asset.file_url, asset.object_key)}
          alt=""
          /*
           * 不要 lazy：从详情页返回时整个列表会重新挂载，lazy 会让可见区域外的
           * 图片重新走一遍「等待进入视口 → 解码 → 绘制」，肉眼就是一片闪。
           * eager + sync 让图片在首帧就完成解码，返回时不再空白。
           * 图片本身是 400px 缩略图（见 thumbnail_url），解码开销很小。
           */
          loading="eager"
          decoding="sync"
        />
      )}
      {isVideo ? (
        <span className="feed-tile-play" aria-label="视频">
          ▶
        </span>
      ) : null}
    </Link>
  )
}

export function FeedCard({
  record,
  workspaceId,
  canComment = false,
}: {
  record: GrowthRecord
  /** 评论要在卡片里就地提交，需要知道空间 */
  workspaceId: number
  /** 该空间成员都可以评论（后端 CanPostComment 只要求成员） */
  canComment?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  /** 无评论时点「评论」就地展开输入框 */
  const [commentOpen, setCommentOpen] = useState(false)
  const navigate = useNavigate()

  /*
   * 整张卡片都能点进详情（原来只有作者名和标题是链接）。
   * 卡片里还有图片链接、评论输入框、音频条、按钮 —— 用 closest 一次性排除，
   * 比在每个子元素上挂 stopPropagation 可靠。
   * 选中文字时不跳转，避免用户想复制正文却被带走。
   */
  function onCardClick(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement
    if (target.closest('a, button, input, textarea, audio, video')) return
    if (window.getSelection()?.toString()) return
    navigate(`/records/${record.id}`)
  }
  const author = record.author_relation_label || `用户 #${record.author_id}`
  const visuals = record.media
    .filter((m) => m.media_type === 'image' || m.media_type === 'video')
    .slice(0, 9)
  const audios = record.media.filter((m) => m.media_type === 'audio')
  const firstAudio = audios[0]
  const content = record.content.trim()
  const collapsible = content.length > BODY_COLLAPSE_AT
  const shown =
    !collapsible || expanded
      ? content
      : `${content.slice(0, BODY_COLLAPSE_AT)}…`
  const moreCount =
    record.media.filter((m) => m.media_type === 'image' || m.media_type === 'video')
      .length - visuals.length

  return (
    <article className="feed-card feed-card--clickable" onClick={onCardClick}>
      <AuthorAvatar
        label={author}
        avatarUrl={record.author_avatar_url}
      />

      <div className="feed-card-main">
        <header className="feed-card-head">
          <Link to={`/records/${record.id}`} className="feed-author">
            {author}
          </Link>
        </header>

        {record.title ? (
          <h3 className="feed-card-title">
            <Link to={`/records/${record.id}`}>{record.title}</Link>
          </h3>
        ) : null}

        {content ? (
          <div className="feed-card-body">
            <p>{shown}</p>
            {collapsible ? (
              <button
                type="button"
                className="feed-expand"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? '收起' : '全文'}
              </button>
            ) : null}
          </div>
        ) : null}

        {visuals.length > 0 ? (
          <div className={`feed-grid ${gridModifier(visuals.length)}`}>
            {visuals.map((m) => (
              <VisualTile key={m.id} asset={m} recordId={record.id} />
            ))}
          </div>
        ) : null}

        {moreCount > 0 ? (
          <p className="feed-more-media meta">另有 {moreCount} 个媒体</p>
        ) : null}

        {firstAudio ? (
          <div className="feed-audio">
            <AudioPlayer
              src={firstAudio.file_url}
              objectKey={firstAudio.object_key}
            />
            {audios.length > 1 ? (
              <span className="meta">另有 {audios.length - 1} 条语音</span>
            ) : null}
          </div>
        ) : null}

        {/*
          朋友圈式评论区：直接显示最近几条 + 就地回复。
          旧版后端没有 latest_comments 时退回成只有「评论」链接。
        */}
        {record.latest_comments !== undefined ? (
          <FeedComments
            recordId={record.id}
            workspaceId={workspaceId}
            count={record.comment_count ?? record.latest_comments.length}
            initial={record.latest_comments}
            canPost={canComment}
            open={commentOpen || (record.comment_count ?? 0) > 0}
          />
        ) : null}

        <footer className="feed-card-foot">
          <time className="feed-time" dateTime={record.created_at}>
            {formatRelativeTime(record.created_at)}
          </time>
          {/*
            有评论：链接到详情看完整讨论。
            没评论：就地展开输入框 —— 家庭场景下"想留一句话"是主路径，
            不该逼用户先进详情页。
          */}
          {(record.comment_count ?? 0) > 0 ? (
            <Link className="feed-action" to={`/records/${record.id}#comments`}>
              评论 {record.comment_count}
            </Link>
          ) : canComment && record.latest_comments !== undefined ? (
            <button
              type="button"
              className="feed-action feed-action--button"
              onClick={() => setCommentOpen(true)}
            >
              评论
            </button>
          ) : (
            <Link className="feed-action" to={`/records/${record.id}#comments`}>
              评论
            </Link>
          )}
        </footer>
      </div>
    </article>
  )
}
