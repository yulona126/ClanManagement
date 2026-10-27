import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * 仅开发期使用：把 `/__mock__/<原始 url>` 变成假 API 响应。
 *
 * 配合 `scripts/devtools/mock-api.js`（在浏览器里把 `/api/*` 的 XHR 指到这里），
 * 可以在后端未启动 / 未登录时完整走通受保护路由，用于设计验收与截图。
 * `apply: 'serve'` 保证生产构建里不包含任何 mock 逻辑。
 */

function readBody(req: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    req.on('data', () => {})
    req.on('end', () => resolve())
  })
}

export function mockApiPlugin(): Plugin {
  return {
    name: 'claner-mock-api',
    apply: 'serve',
    configureServer(server) {
      // 注意：要在 middleware 入口同步取一次 req.url —— 异步读取 body 之后
      // 这个字段可能已经被后续中间件改掉了。
      server.middlewares.use('/__mock__', (req, res: ServerResponse) => {
        const originalUrl = req.url ?? ''
        void readBody(req).then(() => {
          if (process.env.CLANER_MOCK_DEBUG) {
            server.config.logger.info(`[mock-api] req.url=${originalUrl}`)
          }
          // req.url 是挂载点之后的部分（不含 `/__mock__`），
          // 但直接访问 `/__mock__/api/...` 时可能带前导斜杠，两种都兼容。
          const raw = decodeURIComponent(originalUrl).replace(/^\/+/, '')
          const path = `/${raw.replace(/^https?:\/\/[^/]+\//, '')}`
          let body: unknown = { count: 0, results: [] }
          if (path.startsWith('/api/auth/me')) {
            body = { id: 1, username: 'demo', display_name: '演示账号', is_staff: true }
          } else if (path.startsWith('/api/auth/refresh')) {
            body = { access: 'dev.fake.token' }
          } else if (/^\/api\/workspaces\/?(\?|$)/.test(path)) {
            body = [
              {
                id: 1,
                name: 'hexia 的空间',
                baby_name: 'hexia',
                my_role: 'owner',
                my_relation_label: '爸爸',
              },
            ]
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        })
      })
    },
  }
}
