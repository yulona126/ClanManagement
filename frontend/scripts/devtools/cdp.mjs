/**
 * 本地调试用的 CDP 小工具 —— 仅供开发，不参与构建。
 *
 * 为什么不用 Playwright / Puppeteer：
 * 这台机器上只有系统 Chrome，且受限环境下 Chrome 需要一组
 * `--no-sandbox / --disable-breakpad ...` 才能起来（否则 crashpad 与 GPU
 * 进程初始化失败会直接拖垮浏览器）。这里用系统 Chrome + 原生 WebSocket
 * 直连 DevTools 协议，零依赖。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

export { sleep }

export const APP = process.env.SHOT_APP ?? 'http://127.0.0.1:5180'

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** 受限环境下让 Chrome 能起来的必要开关。 */
const CHROME_FLAGS = [
  '--headless=new',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--disable-setuid-sandbox',
  '--disable-crash-reporter',
  '--disable-breakpad',
  '--disable-gpu',
  '--force-device-scale-factor=1',
]

/**
 * 启动 headless Chrome 并连上 DevTools，返回一组便捷方法。
 * @param {{ width?: number, height?: number, mobile?: boolean }} opts
 */
export async function launch({
  width = 1440,
  height = 900,
  mobile = false,
  profile = '/tmp/claner-chrome-profile',
  onConsole = null,
} = {}) {
  const chrome = spawn(
    CHROME,
    [
      ...CHROME_FLAGS,
      `--window-size=${width},${height}`,
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )

  const endpoint = await new Promise((resolve, reject) => {
    let buf = ''
    const onData = (d) => {
      buf += String(d)
      const m = buf.match(/ws:\/\/[^\s]+/)
      if (m) resolve(m[0])
    }
    chrome.stderr.on('data', onData)
    chrome.stdout.on('data', onData)
    chrome.on('error', reject)
    setTimeout(() => reject(new Error('Chrome DevTools 端点超时')), 15000)
  })

  let nextId = 1
  const pending = new Map()
  const ws = new WebSocket(endpoint)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) {
        p.reject(new Error(JSON.stringify(msg.error)))
      } else {
        p.resolve(msg.result)
      }
      return
    }
    if (!onConsole) return
    if (msg.method === 'Runtime.exceptionThrown') {
      onConsole(`exception: ${msg.params.exceptionDetails.text}`)
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      onConsole(
        `error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`,
      )
    }
  })

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)

  await call('Page.enable')
  await call('Runtime.enable')
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  })

  /** 求值并取回结果（支持 Promise）。 */
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(
        `页面求值异常: ${r.exceptionDetails.text} ${
          r.exceptionDetails.exception?.description ?? ''
        }`,
      )
    }
    return r.result?.value
  }

  const goto = async (url, settleMs = 2500) => {
    await call('Page.navigate', { url })
    await sleep(settleMs)
  }

  const screenshot = async (file) => {
    const { data } = await call('Page.captureScreenshot', { format: 'png' })
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { dirname } = await import('node:path')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }

  const scrollTo = async (y, settleMs = 700) => {
    await evaluate(`window.scrollTo({ top: ${y}, behavior: 'instant' })`)
    await sleep(settleMs)
  }

  return { evaluate, goto, screenshot, scrollTo, call, close: () => chrome.kill() }
}

/**
 * 后端未起 / 未登录时也能访问受保护路由：
 * 1. 注入脚本把 /api/* 的 XHR 指向 dev 中间件的假响应
 * 2. 写入假 token
 */
export async function loginAsMockUser(session, { workspaceId = 1, path = '/login' } = {}) {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('./mock-api.js', import.meta.url), 'utf8')
  await session.call('Page.addScriptToEvaluateOnNewDocument', { source })
  await session.goto(`${APP}${path}`, 1000)
  await session.evaluate(`
    localStorage.setItem('claner.access','dev.fake.token');
    localStorage.setItem('claner.refresh','dev.fake.refresh');
    localStorage.setItem('claner.currentWorkspaceId','${workspaceId}');
  `)
}

/** 进入时间轴：绕过开场遮罩。 */
export async function enterTimeline(session) {
  await session.evaluate(`document.querySelector('.tl-intro__enter')?.click()`)
  await sleep(800)
}

/** 把某个展台滚到视口正中，返回它的几何信息。 */
export async function focusExhibit(session, index) {
  const info = await session.evaluate(`(() => {
    const el = document.querySelectorAll('.tl-exhibit')[${index}]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return JSON.stringify({ top: Math.round(r.top + window.scrollY), height: Math.round(r.height) })
  })()`)
  if (!info) return null
  const { top, height } = JSON.parse(info)
  const offset = Math.max(0, (await session.evaluate('window.innerHeight')) - height) / 2
  await session.scrollTo(Math.round(top - offset), 800)
  return { top, height }
}
