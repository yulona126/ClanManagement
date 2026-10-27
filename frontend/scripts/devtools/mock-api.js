/**
 * 仅供本地截图 / 布局体检使用：把 /api/* 换成假响应，并记录 token 变更轨迹。
 *
 * 由 scripts/devtools/cdp.mjs 的 loginAsMockUser() 通过 CDP 的
 * Page.addScriptToEvaluateOnNewDocument 注入，在页面脚本之前执行。
 *
 * 原理：用 Proxy 包住真实 XMLHttpRequest，只在 open() 时把 URL 改写成
 * /__mock__/<原 url>，其余行为走浏览器原生实现 —— 这样 axios 的 XHR
 * adapter 能正常解析响应（直接伪造 status/responseText 会让 axios 卡住）。
 * /__mock__ 由 vite.mock-api.ts 这个 dev-only 中间件提供。
 */
;(() => {
  const trace = []
  window.__tlTrace = trace

  const origRemove = Storage.prototype.removeItem
  Storage.prototype.removeItem = function (k) {
    if (String(k).startsWith('claner.')) {
      trace.push('removeItem ' + k + ' @ ' + String(new Error().stack).split('\n')[2])
    }
    return origRemove.apply(this, arguments)
  }
  const origSet = Storage.prototype.setItem
  Storage.prototype.setItem = function (k, _v) {
    if (String(k).startsWith('claner.')) trace.push('setItem ' + k)
    return origSet.apply(this, arguments)
  }

  const me = { id: 1, username: 'demo', display_name: '演示账号', is_staff: true }
  const workspace = {
    id: 1,
    name: 'hexia 的空间',
    baby_name: 'hexia',
    my_role: 'owner',
    my_relation_label: '爸爸',
  }

  const bodyFor = (url) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    if (path.startsWith('/api/auth/me')) return me
    if (path.startsWith('/api/auth/refresh')) return { access: 'dev.fake.token' }
    if (path.startsWith('/api/workspaces')) return [workspace]
    if (path.startsWith('/api/')) return { count: 0, results: [] }
    return null
  }

  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const realFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url
    const hit = url ? bodyFor(url) : null
    if (hit) {
      trace.push('fetch ' + url)
      return Promise.resolve(json(hit))
    }
    return realFetch(input, init)
  }

  const RealXHR = window.XMLHttpRequest
  /**
   * 用 Proxy 包住真实 XHR：只在 open() 时把 URL 换成同源假端点，
   * 其余行为（readyState / status / onload）都走浏览器原生实现，
   * 这样 axios 的 XHR adapter 能正常解析响应。
   */
  window.XMLHttpRequest = new Proxy(RealXHR, {
    construct(Target, args) {
      const xhr = new Target(...args)
      const open = xhr.open.bind(xhr)
      const send = xhr.send.bind(xhr)
      let mocked = null
      xhr.open = (method, url, ...rest) => {
        mocked = bodyFor(url)
        if (mocked) {
          trace.push('xhr ' + method + ' ' + url)
          return open(method, '/__mock__/' + encodeURIComponent(url), ...rest)
        }
        return open(method, url, ...rest)
      }
      xhr.send = (...sendArgs) => {
        if (!mocked) return send(...sendArgs)
        xhr.setRequestHeader('Content-Type', 'application/json')
        return send(JSON.stringify(mocked))
      }
      return xhr
    },
  })
})()
