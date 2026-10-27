import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { TimelineRail } from './TimelineRail'
import {
  ageLabel,
  computeStats,
  fetchTimelineMoments,
  groupMonths,
  type TimelineMoment,
} from './moments'
import './timeline.css'
import './rail.css'

const WORDMARK_LINES = ['MEMORY', 'TAPE']

type LoadState = 'loading' | 'ready' | 'error'

/**
 * 成长胶片 · 沉浸式展示页
 *
 * 结构（参考 tlb.betteroff.studio 的 Timeline 页）：
 *   开场遮罩 → 巨字标（逐字上抬）→ 横向图片轨道 + 底部时间刻度尺
 *
 * 数据来自真实动态（`/api/workspaces/{id}/records/` 全部分页），
 * 时间正序排列——第 1 张就是最早的那条记录，符合「从头回放」的预期。
 *
 * 进度：**模块一**（轨道 + 刻度尺）已完成；
 * 模块二（月份 / 标签筛选 + 索引抽屉）待接入，见 docs/11-product-ia.md。
 */
export function TimelinePage() {
  const { current } = useWorkspace()
  const [introOpen, setIntroOpen] = useState(true)
  const [entered, setEntered] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const [moments, setMoments] = useState<TimelineMoment[]>([])
  // 初值就是 loading：effect 里不再同步 setState（避免级联渲染）
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string>('')

  const workspaceId = current?.id ?? null
  const babyName = current?.baby_name ?? ''
  const birth = current?.baby_birthday ?? null

  /* ------------------------------------------------------------ 拉数据 */
  useEffect(() => {
    if (!workspaceId) return
    let alive = true
    fetchTimelineMoments(workspaceId, birth)
      .then((list) => {
        if (!alive) return
        setMoments(list)
        setError('')
        setState('ready')
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : '加载失败')
        setState('error')
      })
    return () => {
      alive = false
    }
  }, [workspaceId, birth])

  const stats = useMemo(
    () => computeStats(moments, birth, current?.photo_count),
    [moments, birth, current?.photo_count],
  )
  const months = useMemo(() => groupMonths(moments), [moments])

  const openLightbox = useCallback((moment: TimelineMoment) => {
    const first = moment.media[0]
    if (!first) return
    setLightbox({ src: first.full, alt: first.alt })
  }, [])

  /* 滚动一段后让字标淡出，避免一直压在最上面 */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /*
   * 注意：**不能**锁 body 滚动。
   * 这个页面的纵向滚动就是轨道的驱动源（GSAP ScrollTrigger 把它映射成
   * 横向位移），锁住就没法滚了。
   */

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const enter = useCallback(() => {
    setIntroOpen(false)
    setEntered(true)
  }, [])

  const oldest = moments[0]
  const latest = moments[moments.length - 1]
  const recentMonths = months.slice(0, 6)

  return (
    <div className="tl-root tl-root--rail tl-root--scroll">
      <div className="tl-grain" aria-hidden="true" />

      {/* ------------------------------------------------------ 顶部字标 */}
      <div
        className={`tl-wordmark tl-wordmark--rail${entered ? ' is-in' : ''}${
          scrolled ? ' is-dim' : ''
        }`}
        aria-hidden="true"
      >
        <div className="tl-wordmark__main">
          {WORDMARK_LINES.map((line, li) => (
            <div className="tl-wordmark__line" key={line}>
              {line.split('').map((ch, ci) => (
                <span
                  key={`${ch}-${ci}`}
                  style={{ transitionDelay: `${(li * line.length + ci) * 0.045}s` }}
                >
                  {ch}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="tl-wordmark__meta">
          <span>
            CLANER<em>®</em>
          </span>
          <span>/ {(babyName || 'CLANER').toUpperCase()}</span>
          <span>
            {oldest?.created_at.slice(0, 4) ?? '—'}—{latest?.created_at.slice(0, 4) ?? '—'}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------- 开场 */}
      <div className={`tl-intro${introOpen ? '' : ' is-gone'}`} aria-hidden={!introOpen}>
        <div className="tl-intro__top">
          <span>Claner · Memory Tape</span>
          <span>{babyName ? `${babyName} 的成长胶片` : '成长胶片'}</span>
        </div>

        <div className="tl-intro__body">
          <span className="tl-intro__eyebrow">
            A digital capsule for {babyName || 'your family'}
          </span>
          <p className="tl-intro__quote">
            一天一张照片，把长大的过程卷成一卷胶片。
          </p>

          {state === 'loading' ? (
            <div className="tl-intro__stats">
              <span>正在整理这卷胶片…</span>
            </div>
          ) : state === 'error' ? (
            <div className="tl-intro__stats">
              <span>加载失败：{error}</span>
            </div>
          ) : state === 'ready' && stats.total > 0 ? (
            <div className="tl-intro__stats">
              <span>
                <b>{stats.total}</b> 条动态
              </span>
              <span>
                <b>{stats.photos}</b> 张照片
              </span>
              <span>
                <b>{stats.months}</b> 个月
              </span>
              {stats.currentDay !== null ? (
                <span>
                  今天是出生第 <b>{stats.currentDay}</b> 天
                </span>
              ) : null}
            </div>
          ) : (
            <div className="tl-intro__stats">
              <span>还没有动态，先去发一条吧。</span>
            </div>
          )}
        </div>

        <div className="tl-intro__bottom">
          <div className="tl-intro__months">
            {recentMonths.map((g) => (
              <div key={g.key}>
                <b>
                  {g.year} · {g.label}
                </b>
                {g.count} 条
              </div>
            ))}
          </div>

          {state === 'ready' && stats.total > 0 ? (
            <button type="button" className="tl-intro__enter" onClick={enter}>
              进入时间轴
              <svg viewBox="0 0 12 10" aria-hidden="true">
                <path d="M7.36 9.49 6.34 8.53l2.93-3.11H0V4.05h9.27L6.34.94 7.36 0l4.39 4.74-4.39 4.75Z" />
              </svg>
            </button>
          ) : state === 'ready' ? (
            <a className="tl-intro__enter" href="/publish">
              去发第一条
              <svg viewBox="0 0 12 10" aria-hidden="true">
                <path d="M7.36 9.49 6.34 8.53l2.93-3.11H0V4.05h9.27L6.34.94 7.36 0l4.39 4.74-4.39 4.75Z" />
              </svg>
            </a>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------- 模块一：轨道 + 刻度尺 */}
      {state === 'ready' && moments.length > 0 ? (
        <TimelineRail moments={moments} onOpen={openLightbox} />
      ) : null}

      {/* ---------------------------------------------------------- 角落 */}
      {latest ? (
        <span className="tl-corner tl-corner--right">
          最新 {latest.created_at}
          {latest.dayIndex !== null ? ` · ${ageLabel(latest.dayIndex)}` : ''}
        </span>
      ) : null}

      {/* ---------------------------------------------------------- 大图 */}
      {lightbox ? (
        <div
          className="tl-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox.src} alt={lightbox.alt} />
          <span className="tl-lightbox__hint">
            {lightbox.alt} · 点击任意处或按 ESC 关闭
          </span>
        </div>
      ) : null}
    </div>
  )
}
