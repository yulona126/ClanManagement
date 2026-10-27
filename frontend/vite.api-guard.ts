import type { Plugin } from 'vite'

/**
 * 连线上 API 时的安全护栏（仅 dev server 生效）。
 *
 * 场景：本地前端 + 线上后端（`DEV_API_TARGET=https://你的域名`）。
 * 这样不用改线上 CORS —— 浏览器请求的是 localhost:5180，由 Vite 在服务端转发，
 * 属于同源请求。但代价是**你的本地点按会真的写进线上库**。
 *
 * 所以这里做两件事：
 *   1. 目标不是本机时，启动打印醒目告警（避免忘记自己在连线上）
 *   2. `DEV_API_READONLY=1` 时，拒绝所有会**改业务数据**的请求，
 *      只读浏览线上数据、不会误改线上内容
 *
 * 只读模式下仍然允许登录/刷新令牌（POST /api/auth/login/ 等）——
 * 否则拿不到 token，根本看不到线上数据。这些接口只签发凭证，不写业务数据。
 * 例外：`/api/auth/me/avatar/` 会改头像，仍然拦截。
 */
export function apiGuardPlugin({
  target,
  readonly,
}: {
  target: string
  readonly: boolean
}): Plugin {
  const isLocal =
    /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(target)

  return {
    name: 'claner-api-guard',
    apply: 'serve',
    configureServer(server) {
      // 直接 use → 排在 Vite 内置 proxy 之前
      server.middlewares.use((req, res, next) => {
        if (!readonly) return next()
        const url = req.url ?? ''
        if (!url.startsWith('/api')) return next()
        const method = (req.method ?? 'GET').toUpperCase()
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          return next()
        }
        // 登录 / 刷新令牌只签发凭证，不改业务数据；否则只读模式连不上
        const authOnly =
          /^\/api\/auth\/(login|refresh)\/?(\?|$)/.test(url)
        if (method === 'POST' && authOnly) return next()
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            detail:
              'DEV_API_READONLY=1：本地已设为只读模式，禁止写入请求。' +
              '要允许写入，请从 frontend/.env 移除这一行。',
            blocked: `${method} ${url}`,
          }),
        )
      })

      if (isLocal) return

      const lines = [
        '',
        '  ╭──────────────────────────────────────────────────────────────╮',
        '  │  注意：后端目标不是本机，请求会发到远端                      │',
        `  │  ${target.padEnd(60)}│`,
        '  │                                                              │',
        readonly
          ? '  │  只读模式（DEV_API_READONLY=1）：写请求会被拒绝              │'
          : '  │  ⚠ 可写模式：你的操作会真的修改远端数据                      │',
        '  ╰──────────────────────────────────────────────────────────────╯',
        '',
      ]
      server.config.logger.warn(lines.join('\n'))
    },
  }
}
