import { useEffect, useState } from 'react'

/**
 * 全站加载页。
 *
 * 视觉沿用「成长胶片」的语言：衬线字标 + 刻度尺 + 颗粒。
 * 中间那排刻度就是时间轴刻度尺的缩影 —— 一道高光从左扫到右，
 * 像胶片在曝光/冲洗，比转圈或骨架屏更贴本站。
 *
 * 细节：
 * - 延迟 `delay` 毫秒才淡入：快速加载（命中缓存）时不会闪一下加载页
 * - `prefers-reduced-motion` 下不扫光，只保留静态刻度
 */
export function PageLoader({
  label = '正在冲洗这卷胶片',
  delay = 140,
}: {
  label?: string
  delay?: number
}) {
  const [visible, setVisible] = useState(delay <= 0)

  useEffect(() => {
    if (delay <= 0) return
    const timer = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [delay])

  return (
    <div
      className={`page-loader${visible ? ' is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="page-loader__inner">
        <p className="page-loader__mark" aria-label="Claner">
          {'Claner'.split('').map((ch, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </p>

        {/* 胶片齿孔 + 刻度：时间轴刻度尺的缩影，一道高光扫过像在曝光 */}
        <div className="page-loader__film" aria-hidden="true">
          <div className="page-loader__ruler">
            {Array.from({ length: 29 }, (_, i) => (
              <i key={i} />
            ))}
            <b className="page-loader__sweep" />
          </div>
        </div>

        <p className="page-loader__label">{label}</p>
      </div>
    </div>
  )
}

/** 页面内部的轻量加载态（不整屏遮罩）。 */
export function InlineLoader({ label = '加载中' }: { label?: string }) {
  return (
    <div className="inline-loader" role="status" aria-live="polite">
      <span className="inline-loader__ticks" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </span>
      <span className="inline-loader__label">{label}</span>
    </div>
  )
}
