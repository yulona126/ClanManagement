import { resolveMediaUrl } from '../media/mediaUrl'
import { avatarInitial } from './time'

/** Feed / detail author disk: real photo if present, else relation initial. */
export function AuthorAvatar({
  label,
  avatarUrl,
  className = 'feed-avatar',
}: {
  label: string
  avatarUrl?: string | null
  className?: string
}) {
  const src = (avatarUrl || '').trim()
    ? resolveMediaUrl(avatarUrl!.trim())
    : ''

  if (src) {
    return (
      <div className={`${className} has-photo`} aria-hidden>
        <img src={src} alt="" loading="lazy" />
      </div>
    )
  }

  return (
    <div className={className} aria-hidden>
      {avatarInitial(label)}
    </div>
  )
}
