import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { GrowthRecord } from '../../api/records'
import type { MediaAsset } from '../../api/media'
import { AudioPlayer } from '../../components/AudioPlayer'
import { resolveMediaUrl } from '../media/mediaUrl'
import { AuthorAvatar } from './AuthorAvatar'
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
      to={`/records/${recordId}?media=${asset.id}`}
      className={`feed-tile${isVideo ? ' feed-tile--video' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {isVideo && !poster ? (
        <span className="feed-tile-video-fallback" aria-hidden />
      ) : (
        <img
          src={poster || resolveMediaUrl(asset.file_url, asset.object_key)}
          alt=""
          loading="lazy"
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

export function FeedCard({ record }: { record: GrowthRecord }) {
  const [expanded, setExpanded] = useState(false)
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
    <article className="feed-card">
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

        <footer className="feed-card-foot">
          <time className="feed-time" dateTime={record.created_at}>
            {formatRelativeTime(record.created_at)}
          </time>
          <Link className="feed-action" to={`/records/${record.id}#comments`}>
            评论
          </Link>
        </footer>
      </div>
    </article>
  )
}
