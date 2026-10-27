import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import type { TimelineMoment } from './moments'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)

export type RailHandle = {
  /**
   * 跳到整条轨道的某个进度（0–1）。
   *
   * 刻度尺点按走这里，而不是「比例 → 下标 → 再换算成滚动位置」：
   * 刻度尺本身就是进度的线性表示，转两道会被卡片间距放大成半个卡片的偏差
   * （实测点 50% 会落到第 8 张而不是第 7 张）。
   */
  goToProgress: (progress: number) => void
}

/**
 * 横向图片轨道。
 *
 * 运动模型（参考 tlb.betteroff.studio 的 Timeline 页）：
 *   - 页面本身有**真实纵向滚动高度**（下面那段 `.tlr-spacer`），
 *     所以滚轮 / 触控板 / 触摸滑动都是原生滚动，自带惯性与平台手感
 *   - 轨道容器 `position: fixed` 钉在视口里，用 **GSAP ScrollTrigger**
 *     把纵向滚动进度映射成轨道的横向位移
 *   - 刻度尺与轨道共用同一个进度值，因此永远同步
 *
 * 比"监听 wheel 自己累加"好在：惯性 / 触控板 / 移动端触摸全部交给浏览器，
 * 不必自己写物理；刷新（resize、字体加载）由 ScrollTrigger 负责重算。
 */
export function Rail({
  moments,
  targetIndex,
  activeIndex,
  onIndexChange,
  onProgress,
  onSelect,
  onKeyNav,
  handleRef,
}: {
  moments: TimelineMoment[]
  /** 用户明确要求跳转到的下标（键盘 / 刻度尺 / 索引）；只有它才驱动滚动 */
  targetIndex: number
  /** 游标当前压着的下标（由滚动推导，仅用于显示与高亮） */
  activeIndex: number
  onIndexChange: (index: number) => void
  /** 整条轨道的滚动进度（0–1），给刻度尺用 */
  onProgress: (progress: number) => void
  onSelect: (moment: TimelineMoment) => void
  /** 键盘翻页：同时推进 target（驱动滚动）与 active（即时高亮） */
  onKeyNav: (index: number) => void
  handleRef?: RefObject<RailHandle | null>
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(activeIndex)
  /**
   * 是否正在执行"程序化滚动"（键盘 / 刻度尺 / 索引）。
   *
   * 必须区分「用户滚动」与「程序化滚动」：用户滚动时**不要**去写 activeIndex，
   * 否则滚动会推出新 index → 触发跳转 effect → 滚回该 index 的位置 →
   * 与用户滚动互相拉扯（实测滚到 9000 会被一路"吸"回 6930）。
   *
   * 它的生命周期绑定在 gsap 滚动补间上，补间结束即清除，不会卡住。
   */
  const jumpingRef = useRef(false)
  /** 下一次 targetIndex 变化是否来自用户明确操作（决定要不要滚） */
  const wantScrollRef = useRef(true)
  const stRef = useRef<ScrollTrigger | null>(null)
  /**
   * 把「当前进度 → 游标压着的下标」这段逻辑暴露给跳转补间用。
   *
   * 为什么不能只靠 ScrollTrigger.update()：进度没变时它不会重跑 onUpdate，
   * 而程序化滚动结束后正好是"进度已变、事件已停"的状态，于是编号不刷新。
   */
  const syncIndexRef = useRef<() => void>(() => {})
  /** 统一的程序化滚动入口（键盘 / 刻度尺共用，保证标记清理逻辑一致）。 */
  const jumpToRef = useRef<(y: number) => void>(() => {})

  /**
   * 轨道左右各留 pad = 视口一半 − 卡片一半 的内边距。
   *
   * 目的：让**第 1 张也能停在视口正中**（游标下）。
   * 没有这段 padding 时 shift=0 会把第 1 张贴到左边缘，游标实际压在第 2 张上
   * —— 这就是"一开始显示 2"的原因。
   */
  const padFor = (vw: number) => {
    const nodes = trackRef.current?.children
    const slideW = nodes?.[0] ? (nodes[0] as HTMLElement).offsetWidth : 0
    return Math.max(0, Math.round(vw / 2 - slideW / 2))
  }

  /** 更新占位高度，返回「一个循环周期」的位移量。 */
  const measure = () => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const spacer = spacerRef.current
    if (!viewport || !track || !spacer) return 0

    const vw = viewport.clientWidth
    const pad = padFor(vw)
    // padding 写在容器上，量出来的 offsetLeft 才包含它
    track.style.paddingLeft = `${pad}px`
    track.style.paddingRight = `${pad}px`

    const nodes = track.children
    const half = Math.floor(nodes.length / 2)
    if (!half) return 0

    /*
     * 循环周期 = 第 1 张 到 第 (half+1) 张（即第二份拷贝的首张）的距离。
     *
     * 这样定义的好处：周期结束时，后一份拷贝正好落在前一份的位置上，
     * 接缝与内部间距完全一致 —— 用"一份拷贝宽"会因为首张前面没有间距而差一个 gap。
     * 也不能用 `track.scrollWidth`：它把左右两段 pad 也算进去了。
     */
    const firstOfCopyA = nodes[0] as HTMLElement
    const firstOfCopyB = nodes[half] as HTMLElement
    const period = Math.max(
      1,
      firstOfCopyB.offsetLeft - firstOfCopyA.offsetLeft,
    )

    spacer.style.height = `${Math.round(window.innerHeight + period)}px`
    return period
  }

  /**
   * 首次渲染后测一次：算出 padding 与循环行程。
   *
   * `pos = 0` 时 `shift = pad`，第 1 张正好落在游标下 —— 所以不需要额外写位移，
   * 页面只要停在 scrollY = 0 即可（这就是"从 1 开始"）。
   */
  useLayoutEffect(() => {
    measure()
  }, [])

  useLayoutEffect(() => {
    const track = trackRef.current
    const spacer = spacerRef.current
    if (!track || !spacer) return

    /** 游标（视口中心）下面压着哪张。用循环后的坐标命中，第二份拷贝折回前半段。 */
    const indexAt = (shift: number, vw: number): number => {
      const nodes = track.children
      const center = shift + vw / 2
      const len = nodes.length
      const half = len / 2
      for (let i = 0; i < len; i += 1) {
        const el = nodes[i] as HTMLElement
        if (center >= el.offsetLeft && center < el.offsetLeft + el.offsetWidth) {
          return i % half
        }
      }
      return indexRef.current
    }

    /**
     * 立刻按「当前滚动进度」重算一次下标（不依赖 onUpdate 被再次触发）。
     * 跳转补间结束时调用 —— 那时进度已变但滚动事件已经停了。
     */
    syncIndexRef.current = () => {
      const st = stRef.current
      const viewport = viewportRef.current
      if (!st || !viewport) return
      const period = measure()
      if (!period) return
      const vw = viewport.clientWidth
      const shift = gsap.utils.wrap(0, period, st.progress * period)
      const idx = indexAt(shift, vw)
      if (idx !== indexRef.current) {
        indexRef.current = idx
        onIndexChange(idx)
      }
    }

    const ctx = gsap.context(() => {
      measure()

      stRef.current = ScrollTrigger.create({
        trigger: spacer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        invalidateOnRefresh: true,
        onRefresh: () => {
          measure()
        },
        onUpdate: (self) => {
          const period = measure()
          /*
           * **无限循环**：轨道位移取模，文档滚动保持线性。
           *
           * 为什么必须循环：滚动带惯性（触控板 / 触摸甩动），若位移在两端夹紧，
           * 撞底时 GSAP 的平滑与浏览器惯性会互相顶，出现明显顿挫。
           * 参考站同样是无限循环（`gsap.utils.wrap`）。
           *
           * shift = wrap(0, period, pos)：
           *   pos=0 时 shift=0 —— 居中由容器的左右 padding 提供；
           *   若把 pad 再加进 shift，第 1 张会被推到屏幕最左
           *   （实测 screenLeft=0，而它应停在 512）
           *   pos 增长到 period 时回到同一画面 → 无缝接回开头
           */
          const pos = self.progress * period
          const shift = gsap.utils.wrap(0, period, pos)
          onProgress(self.progress)

          gsap.set(track, { x: -shift })

          const vw = viewportRef.current?.clientWidth ?? 0
          const nodes = track.children
          for (let i = 0; i < nodes.length; i += 1) {
            const el = nodes[i] as HTMLElement
            const left = el.offsetLeft - shift
            el.style.visibility =
              left + el.offsetWidth > -80 && left < vw + 80 ? 'visible' : 'hidden'
          }

          const idx = indexAt(shift, vw)
          if (!jumpingRef.current && idx !== indexRef.current) {
            indexRef.current = idx
            onIndexChange(idx)
          }
        },
      })
    })

    const onResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      ctx.revert()
      stRef.current = null
      syncIndexRef.current = () => {}
    }
  }, [moments, onIndexChange, onProgress])

  /**
   * 只有「用户明确跳转」才驱动滚动。
   * 滚动自己推导出来的 activeIndex 不会回流到这里（它走 onIndexChange），
   * 所以不会出现"滚一下就被拉回去"的自我打架。
   */
  useEffect(() => {
    if (!wantScrollRef.current) return
    const st = stRef.current
    if (!st || !moments.length) return
    const ratio = moments.length > 1 ? targetIndex / (moments.length - 1) : 0
    const y = st.start + (st.end - st.start) * ratio
    indexRef.current = targetIndex
    jumpToRef.current(y)
  }, [targetIndex, moments.length])

  /** 统一的程序化滚动：滚动中屏蔽下标回写，结束后补算一次。 */
  useEffect(() => {
    jumpToRef.current = (y: number) => {
      jumpingRef.current = true
      gsap.to(window, {
        scrollTo: y,
        duration: 0.6,
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => {
          jumpingRef.current = false
          // 跳转期间 onUpdate 跳过了下标同步，停下后必须补一次，
          // 否则画面跳过去了、左下角编号还停在旧值。
          syncIndexRef.current()
        },
        onInterrupt: () => {
          jumpingRef.current = false
          syncIndexRef.current()
        },
      })
    }
  }, [])

  /** 对外暴露命令式跳转（刻度尺调用）。 */
  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      goToProgress(progress: number) {
        const st = stRef.current
        if (!st) return
        wantScrollRef.current = true
        const p = Math.min(1, Math.max(0, progress))
        jumpToRef.current(st.start + (st.end - st.start) * p)
      },
    }
  }, [handleRef])

  /*
   * 滚轮 → 无限滚动。
   *
   * 这里**接管**滚轮而不是依赖原生文档滚动，原因有两个：
   *   1. 这套布局（轨道 fixed + 文档靠 spacer 撑高）下原生 wheel 并不总是响应
   *   2. 真正的"无限"需要文档有界但滚动位置无界 —— 浏览器不会给你这个，
   *      只能自己维护：到边界就把 scrollTop 折回另一端（两侧画面本来就相同，
   *      所以这个折回是完全无缝的）
   *
   * 注意必须 passive: false，否则 preventDefault 无效。
   */
  useEffect(() => {
    let pending = 0
    let flushing = false

    const applyNow = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (max <= 0) return
      let y = window.scrollY + pending
      // 折回：一整个周期，两侧画面一致，所以看不出来
      y = ((y % max) + max) % max
      pending = 0
      window.scrollTo({ top: y, behavior: 'auto' })
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // 触控板捏合缩放，放行
      // 横向滚轮也换算成纵向：整页只有一条时间轴
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!raw) return
      // deltaMode: 0=像素 1=行 2=页
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      e.preventDefault()
      pending += raw * scale
      if (flushing) return
      flushing = true
      requestAnimationFrame(() => {
        flushing = false
        applyNow()
      })
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------------------------------------------------------------- 键盘 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === 'j') {
        wantScrollRef.current = true
        onKeyNav(indexRef.current + 1)
        e.preventDefault()
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        wantScrollRef.current = true
        onKeyNav(indexRef.current - 1)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKeyNav])

  return (
    <>
      {/* 真实滚动高度：原生滚动手感（惯性 / 触摸）由它提供 */}
      <div className="tlr-spacer" ref={spacerRef} aria-hidden="true" />

      <div className="tlr-viewport" ref={viewportRef}>
        <div className="tlr-track" ref={trackRef}>
          {/*
            渲染**两份**拷贝：滑到末尾时右侧必须有内容顶上来，否则无限循环会露白。
            第二份对无障碍隐藏；DOM 上的重复下标在游标命中计算里按 % half 折回。
          */}
          {[0, 1].map((copy) =>
            moments.map((m, i) => (
              <article
                key={`${copy}-${m.id}`}
                className={`tlr-slide${i === activeIndex ? ' is-active' : ''}`}
                onPointerUp={() => onSelect(m)}
                aria-selected={i === activeIndex}
                aria-hidden={copy === 1 ? true : undefined}
              >
                {/* 编号在图上沿、标签在图下沿；默认藏起来，hover 才滑出 */}
                <span className="tlr-slide__no" aria-hidden="true">
                  {i + 1}
                </span>
                <span
                  className="tlr-slide__frame"
                  style={{ aspectRatio: `1 / ${m.aspect}` }}
                >
                  {m.media[0] ? (
                    <img
                      src={m.media[0].src}
                      alt={copy === 0 ? m.media[0].alt : ''}
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    /* 纯文字记录：没有图，用标题排版成一张卡片，不塞占位图的假象 */
                    <span className="tlr-slide__plain">
                      <b className="tlr-slide__plain-title">
                        {m.title || m.content.slice(0, 40) || '一条记录'}
                      </b>
                      <i className="tlr-slide__plain-mark" aria-hidden="true">
                        {m.created_at.slice(5).replace('-', '.')}
                      </i>
                    </span>
                  )}
                </span>
                <span className="tlr-slide__label" aria-hidden="true">
                  {m.label} · {m.created_at.slice(0, 7).replace('-', '/')}
                </span>
              </article>
            )),
          )}
        </div>
      </div>

    </>
  )
}
