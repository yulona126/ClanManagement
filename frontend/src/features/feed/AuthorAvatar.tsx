import { resolveAvatarUrl } from '../media/mediaUrl'
import { avatarInitial } from './time'

/** Feed / detail author disk: real photo if present, else relation initial. */
export function AuthorAvatar({
  label,
  avatarUrl,
  className = 'feed-avatar',
  size = 'sm',
}: {
  label: string
  avatarUrl?: string | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const src = resolveAvatarUrl(avatarUrl, size)

  if (src) {
    return (
      <div className={`${className} has-photo`} aria-hidden>
        <img src={src} alt="" loading="lazy" decoding="async" />
      </div>
    )
  }

  return (
    <div className={className} aria-hidden>
      {avatarInitial(label)}
    </div>
  )
}
