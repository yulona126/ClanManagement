# frontend — Claner Web

React + Vite + TypeScript + PWA。

## 当前状态

- **阶段 0–2.5 ✅**：含管理台 `/manage`、Owner 邀请、App 壳 UI  
- **U1–U4 ✅**：双端分壳、朋友圈 Feed、管理台多页  
- **展示页 ✅**：成长胶片 `/timeline`（沉浸式时间轴，当前用假数据）  
- **主题**：[`docs/10-frontend-theme.md`](../docs/10-frontend-theme.md)
- **UI 库**：antd（按需 ESM 引入，见下方）

下一阶段：U3 日历与「一天一张」。

## antd（按需）

Vite + antd v5/v6 默认 ESM tree-shake，**不要**整包 `import 'antd/dist/reset.css'`，也**不必** `babel-plugin-import`。

```tsx
// ✅ 只用到的组件
import { Button, Upload, App } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

// ❌ 避免
import * as antd from 'antd'
```

全局主题 / 中文：`src/antd/`（`palette.ts` 色板 ↔ `tokens.css`，`theme.ts` 全局 ConfigProvider）。弹消息用 `App.useApp().message`。
改品牌色：同时改 `tokens.css` 与 `src/antd/palette.ts`。

## 快速启动

```bash
cd frontend
cp .env.example .env
# VITE_API_BASE_URL 须与后端端口一致
npm install
npm run dev
```

打开 Local 地址 → `/login`。用 Django Admin / `createsuperuser` 创建的用户登录。

## 脚本

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 开发服务器（含 PWA dev SW） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产包 |
| `npm run lint` | oxlint |

## 目录

| 路径 | 说明 |
| :--- | :--- |
| `src/styles/tokens.css` | 设计 token |
| `src/styles/app.css` | 全局与通用组件类 |
| `src/api/` | HTTP 客户端与接口 |
| `src/auth/` | token、AuthContext、RequireAuth |
| `src/features/auth/` | 登录页、登录后首页 |
| `src/features/timeline/` | 成长胶片展示页 `/timeline`（`mockMoments.ts` 假数据、`Rail.tsx` 横向轨道、`Ruler.tsx` canvas 刻度尺） |
| `src/features/workspaces/` | WorkspaceContext、切换器、成员面板 |
| `src/routes/` | 路由表 |
| `src/pwa/` | SW 更新提示 |

## 展示页与本地调试

成长胶片 `/timeline` 目前跑在假数据上，**不依赖后端**即可完整调试。
完整说明见 [`scripts/devtools/README.md`](./scripts/devtools/README.md)，速查：

| 方式 | 命令 / 地址 | 用途 |
| :--- | :--- | :--- |
| 布局体检 | `node scripts/devtools/measure.mjs` | 量 DOM：溢出 / 撑破一屏 / 错位 / 横向滚动 |
| 批量截图 | `node scripts/devtools/shot.mjs /tmp/shots` | 一次跑完 8 个状态 |
| 假 API | `vite.mock-api.ts` + `scripts/devtools/mock-api.js` | 后端未起时也能进受保护路由 |

```bash
cd frontend
npm run dev                                   # 先起服务，脚本不代起
node scripts/devtools/measure.mjs             # problems: [] 即全绿
SHOT_W=390 SHOT_H=844 node scripts/devtools/shot.mjs /tmp/shots   # 手机视口
```

`vite.mock-api.ts` 仅在 `apply: 'serve'` 生效，生产构建不含任何 mock 逻辑；
上线前删掉 `vite.mock-api.ts` + `scripts/devtools/mock-api.js` 即可。

PWA 配置在 `vite.config.ts`。更多：`docs/07-dev-setup.md`、`docs/09-scaffold.md`、`docs/11-product-ia.md`。
