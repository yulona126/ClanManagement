/**
 * 页面截图调试 —— 跑完成长胶片的各个状态，输出 PNG。
 *
 * 用法：
 *   node scripts/devtools/shot.mjs [outDir]
 *
 * 环境变量：
 *   SHOT_PATH=/timeline                要截的路由
 *   SHOT_W=390 SHOT_H=844              视口尺寸（<700 自动走 mobile 模式）
 *   SHOT_APP=http://127.0.0.1:5180     应用地址
 *   SHOT_STEPS=01,02,03                只跑指定步骤
 *   CHROME_PATH=/path/to/chrome        自定义浏览器
 *
 * 前提：另开一个终端跑 `npm run dev`（截图脚本不会替你起服务）。
 */
import { APP, enterTimeline, launch, loginAsMockUser, sleep } from './cdp.mjs'

const outDir = process.argv[2] ?? '/tmp/claner-shots'
const width = Number(process.env.SHOT_W ?? 1440)
const height = Number(process.env.SHOT_H ?? 900)
const path = process.env.SHOT_PATH ?? '/timeline'
const only = process.env.SHOT_STEPS?.split(',').map((s) => s.trim())

const session = await launch({
  width,
  height,
  mobile: width < 700,
  onConsole: (line) => console.log('[page]', line),
})

const press = async (key, code, vk) => {
  await session.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
  })
  await session.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
  })
  await sleep(800)
}

const readout = () =>
  session.evaluate(`document.querySelector('.tlr-foot__no')?.textContent`)

/**
 * 拖拽轨道。
 * 用 CDP 真实鼠标事件（含 pointerId），否则 setPointerCapture 会因
 * 无效 pointerId 抛错，拖拽中途断掉。
 */
/** 滚到整条轨道的某个比例（ScrollTrigger 由纵向滚动驱动）。 */
const scrollToFraction = async (f) => {
  await session.evaluate(
    `window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * ${f})`,
  )
  await sleep(1300)
}

const steps = []
const step = (id, label, fn) => steps.push({ id, label, fn })

step('01', '开场遮罩', async () => {})

step('02', '轨道起点', async () => {
  await enterTimeline(session)
  await session.evaluate(`window.scrollTo(0, 0)`)
  await sleep(700)
  console.log('  读数:', await readout())
})

step('03', '滚动 25%', async () => {
  await scrollToFraction(0.25)
  console.log('  读数:', await readout())
})

step('04', '滚动 50%', async () => {
  await scrollToFraction(0.5)
  console.log('  读数:', await readout())
})

step('05', '滚动到底（夹紧）', async () => {
  await scrollToFraction(1)
  console.log('  读数:', await readout())
})

step('06', '键盘 →×2', async () => {
  await press('ArrowRight', 'ArrowRight', 39)
  await press('ArrowRight', 'ArrowRight', 39)
  console.log('  读数:', await readout())
})

step('07', 'hover 卡片', async () => {
  const box = JSON.parse(
    await session.evaluate(`(() => {
      const el = document.querySelectorAll('.tlr-slide')[3]
      const r = el.getBoundingClientRect()
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    })()`),
  )
  await session.call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: box.x,
    y: box.y,
  })
  await sleep(900)
})

console.log(`应用: ${APP}${path}  视口: ${width}x${height}  输出: ${outDir}`)

await loginAsMockUser(session)
await session.goto(`${APP}${path}`, 3000)
console.log(
  '诊断:',
  await session.evaluate(`JSON.stringify({
    path: location.pathname,
    slides: document.querySelectorAll('.tlr-slide').length,
    monthLabels: document.querySelectorAll('.tlr-ruler__label').length,
    scrollable: document.documentElement.scrollHeight > window.innerHeight + 10,
  })`),
)

for (const s of steps) {
  if (only && !only.includes(s.id)) continue
  await s.fn()
  const file = await session.screenshot(`${outDir}/${s.id}.png`)
  console.log(`saved ${file}  (${s.label})`)
}

session.close()
process.exit(0)
