import { useCallback, useMemo, useRef, useState } from 'react'
import { Rail, type RailHandle } from './Rail'
import { Ruler } from './Ruler'
import { buildTicks } from './rulerTicks'
import { ageLabel, type TimelineMoment } from './moments'

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}.${mm}.${dd}`
}

/**
 * 由动态列表生成刻度图案。
 *
 * 参考站口径：每个月占 `图片数 × 9` 个槽，每月第一个槽是长刻度并带月份名。
 * 槽总数决定标尺稀密——槽越多，单槽越窄，刻度越密。
 */
function useTicks(moments: TimelineMoment[]) {
  return useMemo(() => {
    // 分组键必须是完整 yyyy-MM，不能拿展示用的「4月」去比 ——
    // 早先写成 last.label === key，两边格式不同导致每条动态自成一月，
    // 刻度尺于是画出 24 个假月份、长短刻度全错。
    const groups: { key: string; label: string; count: number }[] = []
    for (const m of moments) {
      const key = m.created_at.slice(0, 7)
      const last = groups[groups.length - 1]
      if (last && last.key === key) {
        last.count += 1
      } else {
        groups.push({ key, label: `${Number(key.slice(5, 7))}月`, count: 1 })
      }
    }
    return buildTicks(groups)
  }, [moments])
}

/**
 * 模块一：横向图片轨道 + 底部时间刻度尺。
 *
 * 纵向真实滚动 → GSAP ScrollTrigger 映射成横向位移（见 Rail.tsx），
 * 同一个进度值同时驱动刻度尺，因此两者永远同步。
 *
 * 页面上**没有**标题 / 正文块：与参考站一致，轨道里只有图和 hover 才出现的
 * 编号与标签；正文留给后续的详情层。
 */
export function TimelineRail({
  moments,
  onOpen,
}: {
  moments: TimelineMoment[]
  onOpen: (moment: TimelineMoment) => void
}) {
  const railRef = useRef<RailHandle | null>(null)
  /** 用户明确跳转的目标（键盘 / 刻度尺 / 索引）——只有它驱动滚动 */
  const [targetIndex, setTargetIndex] = useState(0)
  /** 游标当前压着的下标（滚动推导）——只用于显示与高亮 */
  const [activeIndex, setActiveIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  const ticks = useTicks(moments)
  const total = moments.length
  const active = moments[Math.min(activeIndex, Math.max(0, total - 1))]

  /** ScrollTrigger 每帧回调，做一次阈值过滤再进 state。 */
  const handleProgress = useCallback((next: number) => {
    setProgress((prev) => (Math.abs(next - prev) < 0.0006 ? prev : next))
  }, [])

  /**
   * 点按 / 拖动刻度尺 → 直接把轨道拉到对应进度。
   *
   * 不换算成下标再转回来：刻度尺是进度的线性表示，
   * 中间多一道 round() 会因卡片间距产生半张卡的偏差。
   */
  const handleScrub = useCallback((next: number) => {
    railRef.current?.goToProgress(next)
  }, [])

  return (
    <div className="tlr">
      <Rail
        moments={moments}
        targetIndex={targetIndex}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        onProgress={handleProgress}
        onSelect={onOpen}
        onKeyNav={(i) => {
          const clamped = Math.min(Math.max(0, i), Math.max(0, total - 1))
          setActiveIndex(clamped)
          setTargetIndex(clamped)
        }}
        handleRef={railRef}
      />

      <Ruler ticks={ticks} progress={progress} onScrub={handleScrub} />

      {/*
        滚动提示：轨道是 fixed 的，两指滑动时画面几乎不动，容易被误认为
        "滚不了"。提示在真正滚动之后（progress > 0）淡出。
      */}
      <p className={`tlr-scrollhint${progress > 0.002 ? ' is-hidden' : ''}`} aria-hidden="true">
        {/* 触屏设备上"滚动"的说法不对，用两段文案按指针能力切换 */}
        <span className="tlr-scrollhint__desktop">向下滚动 翻阅时间轴</span>
        <span className="tlr-scrollhint__touch">左右滑动 翻阅时间轴</span>
        <i className="tlr-scrollhint__arrow" />
      </p>

      {/* 左下角：只留「第几张 + 日期」，其余信息交给 hover */}
      {active ? (
        <p className="tlr-foot">
          <span className="tlr-foot__no">
            {String(activeIndex + 1).padStart(2, '0')}
            <i>/{String(total).padStart(2, '0')}</i>
          </span>
          <span className="tlr-foot__date">
            {formatDay(active.created_at)}
            {/* 年龄为空时不要留下孤零零的分隔点 */}
            {ageLabel(active.dayIndex) ? ` · ${ageLabel(active.dayIndex)}` : ''}
          </span>
        </p>
      ) : null}
    </div>
  )
}
