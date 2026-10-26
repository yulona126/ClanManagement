import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { TimelineRail } from './TimelineRail'
import {
  MOMENTS,
  TIMELINE_MONTHS,
  TIMELINE_STATS,
  TIMELINE_SUBJECT,
  TAG_LABELS,
  type Moment,
} from './mockMoments'
import './timeline.css'
import './rail.css'

const WORDMARK_LINES = ['MEMORY', 'TAPE']

/**
 * 成长胶片 · 沉浸式展示页
 *
 * 结构（参考 tlb.betteroff.studio 的 Timeline 页）：
 *   开场遮罩 → 巨字标（逐字上抬）→ 横向图片轨道 + 底部时间刻度尺
 *
 * 整页没有纵向滚动：视口就是轨道，滚轮 / 拖拽都转成横向位移。
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

  const subjectName = current?.baby_name ?? TIMELINE_SUBJECT.nickname

  const openLightbox = useCallback((moment: Moment) => {
    const first = moment.media[0]
    if (!first) return
    setLightbox({ src: first.placeholder, alt: first.alt })
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

  const latest = MOMENTS[0]
  const firstMonth = TIMELINE_MONTHS[TIMELINE_MONTHS.length - 1]
  const lastMonth = TIMELINE_MONTHS[0]

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
          <span>/ {TIMELINE_SUBJECT.name.toUpperCase()}</span>
          <span>
            {firstMonth?.year ?? 2025}—{lastMonth?.year ?? 2026}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------- 开场 */}
      <div className={`tl-intro${introOpen ? '' : ' is-gone'}`} aria-hidden={!introOpen}>
        <div className="tl-intro__top">
          <span>Claner · Memory Tape</span>
          <span>{subjectName} 的成长胶片</span>
        </div>

        <div className="tl-intro__body">
          <span className="tl-intro__eyebrow">
            A digital capsule for {TIMELINE_SUBJECT.name}
          </span>
          <p className="tl-intro__quote">{TIMELINE_SUBJECT.tagline}</p>
          <div className="tl-intro__stats">
            <span>
              <b>{TIMELINE_STATS.total}</b> 条动态
            </span>
            <span>
              <b>{TIMELINE_STATS.photos}</b> 张照片
            </span>
            <span>
              <b>{TIMELINE_STATS.months}</b> 个月
            </span>
            <span>
              今天是出生第 <b>{TIMELINE_STATS.currentDay}</b> 天
            </span>
          </div>
        </div>

        <div className="tl-intro__bottom">
          <div className="tl-intro__months">
            {TIMELINE_MONTHS.slice(0, 6).map((g) => (
              <div key={g.key}>
                <b>
                  {g.year} · {g.label}
                </b>
                {g.tags
                  .map((t) => `${TAG_LABELS[t.tag] ?? t.tag} (${t.count})`)
                  .join(' ／ ')}
              </div>
            ))}
          </div>
          <button type="button" className="tl-intro__enter" onClick={enter}>
            进入时间轴
            <svg viewBox="0 0 12 10" aria-hidden="true">
              <path d="M7.36 9.49 6.34 8.53l2.93-3.11H0V4.05h9.27L6.34.94 7.36 0l4.39 4.74-4.39 4.75Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ------------------------------------------- 模块一：轨道 + 刻度尺 */}
      <TimelineRail moments={MOMENTS} onOpen={openLightbox} />

      {/* ---------------------------------------------------------- 角落 */}
      {/*
        左下的「第几张 + 日期」由 TimelineRail 渲染（.tlr-foot），
        所以这里只放右下角，避免两块文字叠在一起。
      */}
      {latest ? (
        <span className="tl-corner tl-corner--right">
          最新 {latest.created_at.slice(0, 10)}
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
            点击任意处或按 ESC 关闭 · 展示用占位图
          </span>
        </div>
      ) : null}
    </div>
  )
}
