import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import gsap from 'gsap'
import type { RulerTick } from './rulerTicks'

/**
 * 底部时间刻度尺。
 *
 * 复刻参考站的三个关键做法：
 *   1. **刻度是 canvas 逐帧画的，不是 DOM** —— 上千根 1px 竖线做成 DOM 会拖垮渲染
 *   2. **游标固定在画布正中**，是标尺从它下面滑过；那根刻度被放大到 50px、alpha 1
 *   3. 月份标签是 DOM（`left = index × 槽宽`），双份轨道做无缝循环
 *
 * 参考站这里有个 bug：刻度间距 11px，但滚动→标尺的换算用了 step=16，
 * 于是标尺每滑过一条轨道会多绕 45%。这里对齐成同一个槽宽，刻度与轨道严格 1:1。
 */

/** 刻度视觉参数（取自参考站 Sticks 组件）。 */
const CFG = {
  lineWidth: 1,
  /** 短刻度高度 */
  minorHeight: 12,
  /** 月份起点刻度高度 */
  majorHeight: 22,
  /** 游标刻度高度 */
  cursorHeight: 50,
  /** 普通刻度透明度 */
  alpha: 0.25,
  /** 游标透明度 */
  cursorAlpha: 1,
  /** 悬停影响半径（以槽为单位） */
  hoverNear: 10,
  /** 悬停最多加高 */
  hoverBoost: 18,
  /** 衰减曲线指数参数 */
  fall: 0.55,
  /** 高度缓动系数（按 60fps 归一） */
  ease: 0.1,
}

/**
 * 画布高度（px）。参考站是 6rem = 60px（1rem=10px），其中最高的是游标刻度
 * 50px；这里留到 80px 给悬停加高一点余地，视觉上仍是"贴底一条细刻度带"。
 */
const CANVAS_HEIGHT = 80

function ease(ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1)
}

export function Ruler({
  ticks,
  /** 0–1：整条轨道的滚动进度（与 Rail 共用同一个值，因此永远同步） */
  progress,
  onScrub,
}: {
  ticks: RulerTick[]
  progress: number
  /** 点击 / 按住拖动刻度尺：把比例回传给轨道 */
  onScrub?: (progress: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const fracRef = useRef(progress)
  /**
   * ticks 放 ref。父组件每帧都会重渲染（刻度尺的 frac 来自 rAF），
   * 把 ticks 放进 effect 依赖会让监听器被反复拆装 —— 正好落在拆装空档的
   * 那次点击就会「没反应」。canvas 绘制本身也只读 ref，不需要重挂。
   */
  const ticksRef = useRef(ticks)
  useEffect(() => {
    ticksRef.current = ticks
  }, [ticks])
  const heightsRef = useRef<Float64Array>(new Float64Array(0))
  /** 鼠标位置（画布坐标），用于刻度加高 */
  const hoverRef = useRef<{ x: number; active: boolean }>({ x: -1, active: false })

  const len = ticks.length

  // frac 走 ref，避免每次变化都重建渲染循环；渲染期不写 ref，放到 effect 里
  useEffect(() => {
    fracRef.current = progress
  }, [progress])

  const labels = useMemo(() => {
    const out: { text: string; index: number }[] = []
    ticks.forEach((t, i) => {
      if (t.major && t.label) out.push({ text: t.label, index: i })
    })
    return out
  }, [ticks])

  /**
   * 可见槽数决定每槽像素。它只跟 len 有关，因此可以在渲染期直接算出来，
   * 不必读 ref（渲染期读 ref 会触发 react-hooks 的 refs 规则）。
   */
  const visibleSlots = Math.max(1, Math.floor(len / 2))
  const labelStep = `calc(100% / ${visibleSlots})`

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas || !len) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastLabelOffset = Number.NaN

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.floor(CANVAS_HEIGHT * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${CANVAS_HEIGHT}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // 每槽像素宽度 = 画布宽 / 可见槽数
      // 每槽像素 = 画布宽 / 可见槽数；标签定位用 CSS calc 表达同一比例
    }

    const draw = () => {
      const ratio = 1

      const width = canvas.width / Math.min(window.devicePixelRatio || 1, 2)
      const cursorX = width * 0.5

      ctx.clearRect(0, 0, width, CANVAS_HEIGHT)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = CFG.lineWidth

      /*
       * 刻度条定位：把「月份槽序列」当作一条比视口更长的带子，按进度整体左移。
       *
       * 关键点：每槽宽度 = 画布宽 / 槽数（只够铺满一屏），但可用行程远大于
       * 一个屏宽，所以进度推进时必须让**新的槽从右侧补进来**。
       * 早先把槽固定锚在画布原点，结果滚到中段后刻度只剩左边一小撮。
       */
      const visibleSlots = Math.max(1, Math.floor(len / 2))
      const slotPx = width / visibleSlots
      const scrolled = fracRef.current * (len - visibleSlots)
      const first = Math.max(0, Math.floor(scrolled) - 1)
      const lastTick = Math.min(len - 1, Math.ceil(scrolled + visibleSlots) + 1)

      const heights = heightsRef.current
      if (heights.length !== len) heightsRef.current = new Float64Array(len)
      const h = heightsRef.current

      for (let i = first; i <= lastTick; i += 1) {
        // 槽 i 在画布上的 x：整条带子按进度左移
        const x = (i - scrolled) * slotPx
        if (x < -slotPx || x > width + slotPx) continue
        const base = ticksRef.current[i]?.major ? CFG.majorHeight : CFG.minorHeight

        // 目标加高：中心刻度补到 cursorHeight；指针附近按衰减曲线加 boost
        let extra = 0
        const distToCursor = Math.abs(x - cursorX)
        if (distToCursor < slotPx * 0.5) {
          extra = CFG.cursorHeight - base
        } else if (hoverRef.current.active) {
          const d = Math.abs(x - hoverRef.current.x)
          const radius = CFG.hoverNear * slotPx
          if (d < radius) {
            const ss = d / radius
            extra = CFG.hoverBoost * Math.pow(1 - ss, 1 / CFG.fall)
          }
        }

        // 手写 lerp 缓动高度，避免刻度突然跳
        h[i] += (extra - h[i]) * CFG.ease * ratio
        const height = base + h[i]

        const alpha = distToCursor < slotPx * 0.5 ? CFG.cursorAlpha : CFG.alpha

        ctx.globalAlpha = ease(alpha)
        const px = Math.round(x) + 0.5
        ctx.beginPath()
        ctx.moveTo(px, CANVAS_HEIGHT)
        ctx.lineTo(px, CANVAS_HEIGHT - height)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // 月份标签：与刻度同一套 (scrolled, slotPx)，所以永远对齐
      const track = trackRef.current
      if (track) {
        const offset = scrolled * slotPx
        if (offset !== lastLabelOffset) {
          track.style.transform = `translate3d(${-offset}px,0,0)`
          lastLabelOffset = offset
          // 贴到左右边缘的标签会被切掉半个字（最左的「8月」曾只剩「月」），
          // 靠边时淡出，比切一半干净。
          const width = canvasRef.current?.clientWidth ?? 0
          for (let i = 0; i < track.children.length; i += 1) {
            const el = track.children[i] as HTMLElement
            const screenX = el.offsetLeft - offset
            el.style.opacity =
              screenX < 18 || screenX > width - 18 ? '0' : '1'
          }
        }
      }

    }

    resize()
    // 挂在 gsap.ticker 上：与 ScrollTrigger 同一帧，读到的一定是当前进度
    gsap.ticker.add(draw)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    const onEnter = () => {
      hoverRef.current.active = true
    }
    const onLeave = () => {
      hoverRef.current.active = false
      hoverRef.current.x = -1
    }
    const onMove = (e: MouseEvent) => {
      const rect = wrap.getBoundingClientRect()
      hoverRef.current.x = e.clientX - rect.left
    }

    wrap.addEventListener('mouseenter', onEnter)
    wrap.addEventListener('mouseleave', onLeave)
    wrap.addEventListener('mousemove', onMove)

    return () => {
      gsap.ticker.remove(draw)
      window.removeEventListener('resize', onResize)
      wrap.removeEventListener('mouseenter', onEnter)
      wrap.removeEventListener('mouseleave', onLeave)
      wrap.removeEventListener('mousemove', onMove)
    }
  }, [len])

  /* 点击 / 按住拖动刻度尺 → 反推 frac（用 React 事件属性，避免监听器被反复拆装） */
  const scrubbingRef = useRef(false)

  const scrubTo = useCallback(
    (clientX: number) => {
      const wrap = wrapRef.current
      if (!wrap || !onScrub) return
      const rect = wrap.getBoundingClientRect()
      const ratio = (clientX - rect.left) / Math.max(1, rect.width)
      onScrub(Math.min(Math.max(ratio, 0), 1))
    },
    [onScrub],
  )

  const handleDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!onScrub) return
      scrubbingRef.current = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // 某些环境（合成事件 / 指针已释放）会抛 InvalidPointerId；
        // 抓不到指针也不影响一次性的跳转。
      }
      scrubTo(e.clientX)
    },
    [onScrub, scrubTo],
  )

  const handleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (scrubbingRef.current) scrubTo(e.clientX)
    },
    [scrubTo],
  )

  const handleUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div
      className="tlr-ruler"
      ref={wrapRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <div className="tlr-ruler__canvas-box">
        <canvas ref={canvasRef} className="tlr-ruler__canvas" />
      </div>
      <div className="tlr-ruler__labels">
        <div className="tlr-ruler__labels-track" ref={trackRef}>
          {labels.map((l) => (
            <span
              key={`${l.text}-${l.index}`}
              className="tlr-ruler__label"
              // 与 canvas 同一个每槽宽度（画布宽 / 可见槽数），因此标签与刻度必然对齐
              style={{ left: `calc(${l.index} * ${labelStep})` }}
            >
              {l.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
