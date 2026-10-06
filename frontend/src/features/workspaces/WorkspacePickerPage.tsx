import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui'
import { resolveMediaUrl } from '../media/mediaUrl'
import { avatarInitial, formatRelativeTime } from '../feed/time'
import { formatBabyAge } from './age'
import { useWorkspace } from './WorkspaceContext'
import type { Workspace } from '../../api/workspaces'

function cardCover(ws: Workspace): { src: string | null; initial: string } {
  const avatar = (ws.avatar_url || '').trim()
  if (avatar) {
    return { src: resolveMediaUrl(avatar), initial: avatarInitial(ws.baby_name) }
  }
  const mem = ws.latest_memory
  const cover = (mem?.cover_thumbnail_url || '').trim()
  if (cover) {
    return { src: resolveMediaUrl(cover), initial: avatarInitial(ws.baby_name) }
  }
  return { src: null, initial: avatarInitial(ws.baby_name) }
}

function WorkspaceCard({
  ws,
  active,
  onEnter,
  index,
}: {
  ws: Workspace
  active: boolean
  onEnter: () => void
  index: number
}) {
  const age = formatBabyAge(ws.baby_birthday)
  const cover = cardCover(ws)
  const mem = ws.latest_memory
  const activityLabel = mem
    ? formatRelativeTime(mem.created_at)
    : formatRelativeTime(ws.last_activity_at || ws.created_at)

  const metaBits = [age, ws.my_relation_label].filter(Boolean)

  return (
    <button
      type="button"
      className={`ws-card${active ? ' is-current' : ''}`}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      onClick={onEnter}
    >
      <div className="ws-card-media" aria-hidden>
        {cover.src ? (
          <img className="ws-card-photo" src={cover.src} alt="" />
        ) : (
          <span className="ws-card-fallback">{cover.initial}</span>
        )}
        <span className="ws-card-media-shade" />
        {mem?.cover_media_type === 'video' ? (
          <span className="ws-card-play">▶</span>
        ) : null}
      </div>

      <div className="ws-card-body">
        <header className="ws-card-title-block">
          <h2 className="ws-card-name">{ws.baby_name}</h2>
          {metaBits.length ? (
            <p className="ws-card-meta">{metaBits.join(' · ')}</p>
          ) : null}
        </header>

        <div className="ws-card-memory">
          {mem ? (
            <>
              <p className="ws-card-memory-text">
                {mem.content_preview || '新的一条动态'}
              </p>
              <time className="ws-card-memory-time">{activityLabel}</time>
            </>
          ) : (
            <p className="ws-card-memory-empty">还没有动态 — 点进去写下第一笔</p>
          )}
        </div>

        <footer className="ws-card-foot">
          <p className="ws-card-stats">
            <span>{ws.photo_count ?? 0} 照片</span>
            <span className="ws-card-stats-sep" aria-hidden />
            <span>{ws.video_count ?? 0} 视频</span>
            <span className="ws-card-stats-sep" aria-hidden />
            <span>{ws.member_count ?? 0} 家人</span>
          </p>
          <span className="ws-card-enter">
            进入
            <span className="ws-card-enter-arrow" aria-hidden>
              →
            </span>
          </span>
        </footer>
      </div>
    </button>
  )
}

export function WorkspacePickerPage() {
  const { user, logout } = useAuth()
  const { workspaces, loading, error, setCurrentId, current } = useWorkspace()
  const navigate = useNavigate()

  function enter(id: number) {
    setCurrentId(id)
    navigate('/', { replace: true })
  }

  return (
    <div className="plain-page ws-picker">
      <header className="plain-top">
        <span>Claner</span>
        <nav>
          <Link to="/me">账号</Link>
          {user?.is_staff ? <Link to="/manage">管理</Link> : null}
          <button type="button" className="plain-text-btn" onClick={logout}>
            退出
          </button>
        </nav>
      </header>

      <main className="plain-main plain-main--wide ws-picker-main">
        <header className="ws-picker-intro">
          <p className="ws-picker-kicker">Family spaces</p>
          <h1 className="ws-picker-title">空间</h1>
          <p className="ws-picker-lede">选择宝宝，进入回忆</p>
        </header>

        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="meta">加载中…</p> : null}

        {!loading && workspaces.length === 0 ? (
          <div className="ws-picker-empty">
            <p className="ws-picker-empty-title">还没有可进入的宝宝空间</p>
            <p className="meta">
              {user?.is_staff
                ? '请先在管理台创建宝宝空间，并把自己加入成员。'
                : '请联系管理员把你加入某个宝宝空间。'}
            </p>
            {user?.is_staff ? (
              <Button variant="primary" to="/manage/workspaces">
                去管理台创建
              </Button>
            ) : null}
          </div>
        ) : null}

        {!loading && workspaces.length > 0 ? (
          <ul className="ws-card-list">
            {workspaces.map((ws, i) => (
              <li key={ws.id}>
                <WorkspaceCard
                  ws={ws}
                  index={i}
                  active={current?.id === ws.id}
                  onEnter={() => enter(ws.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {!loading && workspaces.length > 0 && user?.is_staff ? (
          <div className="ws-picker-cta">
            <Button variant="ghost" to="/manage/workspaces">
              管理宝宝空间
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
