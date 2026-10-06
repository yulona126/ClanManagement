import { useState, type ReactNode } from 'react'
import type { MediaAsset } from '../../api/media'
import { resolveMediaUrl } from './mediaUrl'
import { MediaLightboxHost } from './MediaLightbox'

/** Grid of photos/videos that opens a fullscreen lightbox on tap. */
export function PhotoWall({
  items,
  empty,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onRemove,
}: {
  items: MediaAsset[]
  empty?: ReactNode
  selectable?: boolean
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onRemove?: (id: number) => void
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (!items.length) {
    return empty ? <>{empty}</> : null
  }

  return (
    <>
      <ul className="media-wall">
        {items.map((m, index) => {
          const thumb = resolveMediaUrl(
            m.thumbnail_url || m.file_url,
            m.object_key,
          )
          const selected = selectedIds?.has(m.id)
          return (
            <li key={m.id}>
              <div
                className={`media-wall-card${selected ? ' is-selected' : ''}`}
              >
                <button
                  type="button"
                  className="media-wall-open"
                  onClick={() => {
                    if (selectable && onToggleSelect) {
                      onToggleSelect(m.id)
                      return
                    }
                    setLightboxIndex(index)
                  }}
                  aria-label={selectable ? '选择照片' : '查看'}
                >
                  <img src={thumb} alt="" loading="lazy" />
                  {m.media_type === 'video' ? (
                    <span className="media-wall-play" aria-hidden>
                      ▶
                    </span>
                  ) : null}
                </button>
                {onRemove && !selectable ? (
                  <button
                    type="button"
                    className="media-wall-remove"
                    aria-label="从相册移除"
                    onClick={() => onRemove(m.id)}
                  >
                    ×
                  </button>
                ) : null}
                {selectable ? (
                  <span
                    className={`media-wall-check${selected ? ' is-on' : ''}`}
                    aria-hidden
                  >
                    {selected ? '✓' : ''}
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {lightboxIndex != null ? (
        <MediaLightboxHost
          items={items}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  )
}
