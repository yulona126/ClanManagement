# 前端视觉主题（Claner · Minimal White）

实现文件：

- [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css) — 设计 token
- [`frontend/src/styles/app.css`](../frontend/src/styles/app.css) — 全局样式 + `.ui-*` 组件
- [`frontend/src/components/ui/`](../frontend/src/components/ui/) — React 封装（**必用**）
- [`frontend/src/components/EmptyState.tsx`](../frontend/src/components/EmptyState.tsx) — 空状态 / 骨架

**本文锁定当前视觉。改 UI 只改 token 与组件，禁止页面各自发明 hover / outline / 下划线。**

---

## 1. 气质（固定）

| 项 | 值 |
| :--- | :--- |
| 背景 | `#ffffff`，无渐变氛围、无阴影卡片堆砌 |
| 主色 / 按钮 | `#111111` 底 + `#ffffff` 字 |
| 次要文字 | `#737373` |
| 边框 | `#eeeeee` / `#e5e5e5` |
| 错误 | `#b42318` |
| 品牌字 | Instrument Serif |
| 正文字 | Manrope |
| 圆角 | 小：`0.5rem`（按钮）；中：`0.75rem`（面板） |

不做：霓虹、毛玻璃、多层阴影、彩色主题、紫色渐变。

---

## 2. 交互规则（固定）

### 2.1 根因（必读）

全局有：

```css
a:hover { color: var(--color-accent-hover); } /* #000 */
```

若用裸 `<Link className="btn btn-primary">`，hover 时链接文字会被刷成黑色，叠在黑底上 → **按钮变纯黑块、字消失**。  
因此：**凡是长得像按钮的控件，一律走 `<Button />`（渲染为 `a.ui-btn` / `button.ui-btn`）**，CSS 用更高优先级把各变体的文字色钉死。

### 2.2 按钮 `.ui-btn` / `<Button />`

| 状态 | 行为 |
| :--- | :--- |
| 默认 | primary 黑底白字；ghost 细边框 |
| hover | **只变颜色**：primary `#111` → `#333`（白字不变）；ghost 浅灰底；无位移、无阴影、无填满/描边互换 |
| active | 略降透明度 `0.88` |
| focus-visible | `2px` 墨色描边，`outline-offset: 2px` |
| disabled | `opacity: 0.45`，`pointer-events: none` |

变体：

| variant | 用途 |
| :--- | :--- |
| `primary` | 主操作 |
| `ghost` | 次要（细边框） |
| `danger` | 破坏性 |
| `link` | 文字按钮（无底） |

### 2.3 文字链接

- 默认墨色；hover 仅颜色变深
- 顶栏 / plain 顶栏链接：muted → ink，**无** underline 跳动

### 2.4 表单

- 输入：底边线或细边框；focus 时边框变墨色
- **不要**大块外扩 box-shadow 光晕（易造成「框跑歪」观感）

### 2.5 空状态 `.ui-empty`

- **无**卡片边框（不要套 `.panel`）
- 标题 + 一行 hint + 可选一个 `<Button />`
- 不在空状态容器上加 hover / outline

### 2.6 列表行 / 卡片

- 行 hover：文字 underline 或背景 `#fafafa`，二选一、轻量
- Feed 卡片：hover 仅边框/背景微变，无跳动

---

## 3. 通用组件（必用）

| 组件 | 路径 | 用途 |
| :--- | :--- | :--- |
| `Button` | `components/ui/Button.tsx` | 按钮与「长得像按钮的链接」（壳 / 导航优先） |
| antd `Button` / `Upload` / `Input` | `antd` 按需 import | 表单、上传、复杂交互 |
| `EmptyState` / `EmptyComposeLink` | `components/EmptyState.tsx` | 空列表 |
| `FeedSkeleton` | 同上 | 加载骨架 |

**antd**：根节点已包 `AntdProvider`（中文 + Minimal White）。

| 文件 | 作用 |
| :--- | :--- |
| `frontend/src/antd/palette.ts` | 色板 / 字号 / 圆角（与 `tokens.css` 同步） |
| `frontend/src/antd/theme.ts` | `ConfigProvider` 的 `token` + 各组件覆写 |
| `frontend/src/antd/AntdProvider.tsx` | 挂载 locale、theme、`wave` 关闭、App 消息层 |

只 import 用到的组件；弹层用 `App.useApp()`。改主题色优先改 `palette.ts` 与 `tokens.css`。

用法：

```tsx
import { Button } from '../components/ui'
import { EmptyState, EmptyComposeLink } from '../components/EmptyState'

<Button variant="primary" onClick={...}>保存</Button>
<Button variant="primary" to="/compose">去发布</Button>
<Button variant="ghost" type="button">取消</Button>
<Button variant="link" to="/">返回</Button>

<EmptyState
  title="还没有动态"
  hint="发一条文字、照片或语音吧。"
  action={<EmptyComposeLink />}
/>
```

旧类名 `.btn` / `.btn-primary` **仅作短暂兼容**，新代码一律 `Button` + `.ui-btn`。  
**禁止**再写 `<Link className="btn …">` / `<button className="btn …">`。

---

## 4. 页面级约定

- 顶栏已显示宝宝名 → 页面 h1 不必重复长标题
- 账号 `/me`、选空间 `/spaces`：plain 顶栏，无 UserShell
- 进空间后：UserShell；切空间点顶栏宝宝 chip

---

## 5. 改动检查清单

- [ ] 新按钮是否用了 `<Button />`？
- [ ] Link 按钮是否避免了全局 `a:hover` 吃掉白字？
- [ ] focus 是否只用 `:focus-visible`？
- [ ] 有没有给整块 panel / empty 加 hover outline？
- [ ] 颜色是否只动 `tokens.css`？
