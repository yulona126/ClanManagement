import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { resolveMediaUrl } from './mediaUrl'

export type LightboxMedia = {
  id: number
  media_type: string
  object_key?: string
  file_url: string
  thumbnail_url: string
}

type VisualItem = LightboxMedia & {
  file: string
  thumb: string
}

function toVisual(m: LightboxMedia): VisualItem {
  const file = resolveMediaUrl(m.file_url, m.object_key)
  const thumb = m.thumbnail_url
    ? resolveMediaUrl(m.thumbnail_url)
    : m.media_type === 'image'
      ? file
      : ''
  return { ...m, file, thumb }
}

export function MediaLightboxHost({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxMedia[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
}) {
  const visuals = items.map(toVisual)
  const current = visuals[index]
  const touchStartX = useRef<number | null>(null)
  const multi = visuals.length > 1

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft' && multi) {
        e.preventDefault()
        onIndexChange((index - 1 + visuals.length) % visuals.length)
      } else if (e.key === 'ArrowRight' && multi) {
        e.preventDefault()
        onIndexChange((index + 1) % visuals.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, visuals.length, multi, onClose, onIndexChange])

  if (!current) return null

  function go(delta: number) {
    if (!multi) return
    onIndexChange((index + delta + visuals.length) % visuals.length)
  }

  return createPortal(
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="媒体预览"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start == null || !multi) return
        const end = e.changedTouches[0]?.clientX
        if (end == null) return
        const dx = end - start
        if (Math.abs(dx) < 48) return
        go(dx < 0 ? 1 : -1)
      }}
    >
      <button
        type="button"
        className="media-lightbox-close"
        aria-label="关闭"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>

      {multi ? (
        <p className="media-lightbox-count" aria-live="polite">
          {index + 1} / {visuals.length}
        </p>
      ) : null}

      {multi ? (
        <button
          type="button"
          className="media-lightbox-nav media-lightbox-nav--prev"
          aria-label="上一张"
          onClick={(e) => {
            e.stopPropagation()
            go(-1)
          }}
        >
          ‹
        </button>
      ) : null}

      <div
        className="media-lightbox-stage"
        onClick={(e) => e.stopPropagation()}
      >
        {current.media_type === 'video' ? (
          <video
            key={current.id}
            className="media-lightbox-media"
            src={current.file}
            poster={current.thumb || undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            key={current.id}
            className="media-lightbox-media"
            src={current.file}
            alt=""
          />
        )}
      </div>

      {multi ? (
        <button
          type="button"
          className="media-lightbox-nav media-lightbox-nav--next"
          aria-label="下一张"
          onClick={(e) => {
            e.stopPropagation()
            go(1)
          }}
        >
          ›
        </button>
      ) : null}
    </div>,
    document.body,
  )
}
