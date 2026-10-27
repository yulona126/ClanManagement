/**
 * 布局体检 —— 不看截图，直接量 DOM，输出可判断的结论。
 *
 * 用途：调试「轨道偏移错位」「图片溢出容器」「一屏装不下」「横向滚动」
 * 这类在截图上靠肉眼很容易看漏的问题。
 *
 * 用法：
 *   node scripts/devtools/measure.mjs
 *   SHOT_W=390 SHOT_H=844 node scripts/devtools/measure.mjs
 *
 * 输出 JSON；末尾的 `problems` 是汇总结论，空数组即全绿。
 */
import { APP, enterTimeline, launch, loginAsMockUser } from './cdp.mjs'

const width = Number(process.env.SHOT_W ?? 1440)
const height = Number(process.env.SHOT_H ?? 900)
const path = process.env.SHOT_PATH ?? '/timeline'

const session = await launch({
  width,
  height,
  mobile: width < 700,
  onConsole: (line) => console.log('[page]', line),
})

await loginAsMockUser(session)
await session.goto(`${APP}${path}`, 2600)
await enterTimeline(session)

const report = await session.evaluate(`(() => {
  const round = (n) => Math.round(n)
  const track = document.querySelector('.tlr-track')
  const slides = [...document.querySelectorAll('.tlr-slide')]
  const spacer = document.querySelector('.tlr-spacer')
  const ruler = document.querySelector('.tlr-ruler')
  const canvas = document.querySelector('.tlr-ruler__canvas')

  // 清掉 ScrollTrigger 写进去的位移，量轨道静态布局
  const prev = track.style.transform
  track.style.transform = 'none'
  const geom = slides.map((el) => ({ left: el.offsetLeft, w: el.offsetWidth }))
  track.style.transform = prev

  const trackWidth = track.scrollWidth
  const vw = window.innerWidth
  const travel = Math.max(0, trackWidth - vw)
  const docH = document.documentElement.scrollHeight

  // canvas 是否真的画了东西
  let opaquePx = 0
  if (canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaquePx += 1
  }

  const overflowing = slides
    .flatMap((s) => [...s.querySelectorAll('img')])
    .filter((img) => img.offsetHeight > img.closest('.tlr-slide__frame').offsetHeight + 1.5)
    .map((img) => img.alt)

  const visible = slides.filter((el) => getComputedStyle(el).visibility === 'visible')

  return JSON.stringify({
    viewport: [window.innerWidth, window.innerHeight],
    document: {
      scrollHeight: docH,
      spacerHeight: round(parseFloat(spacer?.style.height || '0')),
      /** 滚动高度必须 > 视口，否则 ScrollTrigger 没有行程 */
      scrollable: docH > window.innerHeight + 10,
      horizontalScroll: document.documentElement.scrollWidth > vw + 1,
    },
    rail: {
      slides: slides.length,
      /** 无限循环：DOM 里是两份拷贝 */
      copies: 2,
      visible: visible.length,
      slideWidth: round(geom[0]?.w ?? 0),
      trackPadLeft: round(parseFloat(getComputedStyle(track).paddingLeft) || 0),
      trackWidth: round(trackWidth),
      /** 一个循环周期 = 文档可滚动行程 */
      period: round(docH - window.innerHeight),
      pxPerScroll: 1,
      /** 应停在游标下的内容下标（1 起） */
      startIndex: (() => {
        const sh = (() => {
          const tf = getComputedStyle(track).transform
          const m = tf === 'none' ? null : tf.match(/matrix\(([^)]+)\)/)
          return m ? Math.abs(Number(m[1].split(',')[4])) : 0
        })()
        const center = sh + window.innerWidth / 2
        const half = slides.length / 2
        for (let i = 0; i < slides.length; i += 1) {
          const el = slides[i]
          if (center >= el.offsetLeft && center < el.offsetLeft + el.offsetWidth) {
            return (i % half) + 1
          }
        }
        return null
      })(),
    },
    ruler: ruler
      ? {
          present: true,
          canvasWidth: canvas?.width ?? 0,
          canvasHeight: canvas?.height ?? 0,
          painted: opaquePx > 0,
          opaquePx,
          monthLabels: document.querySelectorAll('.tlr-ruler__label').length,
          bottom: getComputedStyle(ruler).bottom,
        }
      : { present: false },
    overflowingImages: overflowing,
    problems: [
      ...(docH <= window.innerHeight + 10
        ? ['页面没有可滚动高度（ScrollTrigger 不会有行程）']
        : []),
      ...(document.documentElement.scrollWidth > vw + 1 ? ['页面出现横向滚动'] : []),
      ...(slides.length === 0 ? ['轨道里没有任何 slide'] : []),
      ...(visible.length === 0 ? ['没有任何 slide 可见'] : []),
      ...(!ruler ? ['刻度尺未渲染'] : []),
      ...(ruler && opaquePx === 0 ? ['刻度尺 canvas 是空的（没画出来）'] : []),
      ...(ruler && (canvas?.width ?? 0) === 0 ? ['刻度尺 canvas 宽度为 0'] : []),
      ...(!getComputedStyle(track).paddingLeft || getComputedStyle(track).paddingLeft === '0px'
        ? ['轨道没有左右 padding：第 1 张无法停在游标下（会显示成第 2 张）']
        : []),
    ],
  }, null, 1)
})()`)

console.log(report)
session.close()
process.exit(0)
