import { useEffect, useState } from 'react'
import { resolveMediaUrl } from './mediaUrl'
import { MediaLightboxHost } from './MediaLightbox'

type MediaLike = {
  id: number
  media_type: string
  object_key?: string
  file_url: string
  thumbnail_url: string
}

function isVisual(m: MediaLike): boolean {
  return m.media_type === 'image' || m.media_type === 'video'
}

export function MediaGallery({
  items,
  variant = 'detail',
  initialMediaId = null,
  onLightboxClose,
}: {
  items: MediaLike[]
  variant?: 'list' | 'detail'
  /** Open lightbox on this media id (e.g. from `?media=`). */
  initialMediaId?: number | null
  onLightboxClose?: () => void
}) {
  const visuals = items.filter(isVisual)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    if (initialMediaId == null) return
    const idx = visuals.findIndex((v) => v.id === initialMediaId)
    if (idx >= 0) setLightboxIndex(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMediaId])

  if (!items.length) return null

  function openAt(id: number) {
    const idx = visuals.findIndex((v) => v.id === id)
    if (idx >= 0) setLightboxIndex(idx)
  }

  function closeLightbox() {
    setLightboxIndex(null)
    onLightboxClose?.()
  }

  return (
    <>
      <ul className={`media-gallery media-gallery--${variant}`}>
        {items.map((m) => {
          const file = resolveMediaUrl(m.file_url, m.object_key)
          const thumb = m.thumbnail_url
            ? resolveMediaUrl(m.thumbnail_url)
            : m.media_type === 'image'
              ? file
              : ''
          return (
            <li key={m.id} id={`media-${m.id}`} className="media-item">
              {m.media_type === 'video' ? (
                variant === 'detail' ? (
                  <button
                    type="button"
                    className="media-video-poster"
                    onClick={() => openAt(m.id)}
                    aria-label="全屏查看视频"
                  >
                    {thumb ? (
                      <img
                        className="media-image"
                        src={thumb}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className="media-video-poster-fallback" aria-hidden />
                    )}
                    <span className="media-video-poster-play" aria-hidden>
                      ▶
                    </span>
                  </button>
                ) : (
                  <video
                    className="media-video"
                    src={file}
                    controls
                    preload="metadata"
                    playsInline
                  />
                )
              ) : m.media_type === 'audio' ? (
                <audio
                  className="media-audio"
                  src={file}
                  controls
                  preload="metadata"
                />
              ) : (
                <button
                  type="button"
                  className="media-open"
                  onClick={() => openAt(m.id)}
                  aria-label="全屏查看图片"
                >
                  <img
                    className="media-image"
                    src={thumb || file}
                    alt=""
                    loading="lazy"
                  />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {lightboxIndex != null && visuals[lightboxIndex] ? (
        <MediaLightboxHost
          items={visuals}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      ) : null}
    </>
  )
}
