import { resolveMediaUrl } from '../features/media/mediaUrl'

type Props = {
  src: string
  objectKey?: string
  className?: string
}

export function AudioPlayer({ src, objectKey, className }: Props) {
  const url = resolveMediaUrl(src, objectKey)
  return (
    <audio
      className={className ?? 'media-audio'}
      src={url}
      controls
      preload="metadata"
    />
  )
}
