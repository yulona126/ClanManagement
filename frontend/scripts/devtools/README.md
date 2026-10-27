# 调试成长胶片（`/timeline`）

展示页是纯前端的全屏页面，**不需要后端**也能完整调。这里有三种层次的调试方式，
按「你想确认什么」来选：

| 想确认 | 用什么 | 耗时 |
| :--- | :--- | :--- |
| 页面长什么样、动画/交互对不对 | 浏览器 DevTools | 秒级 |
| 有没有溢出 / 撑破一屏 / 错位 | `scripts/devtools/measure.mjs` | ~15s |
| 要给别人看的一整套截图 | `scripts/devtools/shot.mjs` | ~30s |

---

## 0. 先起服务

```bash
cd frontend
npm run dev          # http://127.0.0.1:5180
```

下面所有命令都假设这个服务在跑（截图/体检脚本**不会**替你起服务）。

---

## 1. 浏览器里调（最快）

### 免登录跑起来

受保护路由，正常流程是：`/login` → 选空间 → 点顶栏「胶片」或 Feed 顶部横幅。

**没有后端时**（这台机器上 8001 端口是别的服务）走假 API：

```bash
node scripts/devtools/shot.mjs /tmp/x   # 会自己注入假登录，顺手截图
```

或者手工在 DevTools Console 里跑：

```js
localStorage.setItem('claner.access', 'dev')
localStorage.setItem('claner.refresh', 'dev')
localStorage.setItem('claner.currentWorkspaceId', '1')
location.href = '/timeline'
```

⚠️ 只设 `currentWorkspaceId` 直接进 `/` 会被弹回 `/spaces` —— 这是**既有设计**
（要求显式选过空间），不是 bug。从 `/spaces` 点一次卡片就正常了。

### 看真实页面

```
http://127.0.0.1:5180/timeline
```

受保护路由，正常流程是：`/login` → 选空间 → 点顶栏「胶片」或 Feed 顶部横幅。

**没有后端时**（这台机器上 8001 端口是别的服务）走假 API：

```bash
node scripts/devtools/shot.mjs /tmp/x   # 它会自己注入假登录，顺手截图
```

或者手工在 DevTools Console 里跑：

```js
localStorage.setItem('claner.access', 'dev')
localStorage.setItem('claner.refresh', 'dev')
localStorage.setItem('claner.currentWorkspaceId', '1')
location.href = '/timeline'
```

⚠️ 注意：只设 `currentWorkspaceId` 直接进 `/` 会被弹回 `/spaces` ——
这是**既有设计**（要求显式选过空间），不是 bug。从 `/spaces` 点一次卡片就正常了。

### 断点打在哪

| 想调 | 位置 |
| :--- | :--- |
| 开场遮罩 / 字标动画 | [`TimelinePage.tsx`](../src/features/timeline/TimelinePage.tsx) 的 `enter()`、`introOpen` |
| 筛选逻辑 | 同文件 `filtered`（`useMemo`），按 `monthFilter` / `tagFilter` |
| 滚动高亮当前条 | 同文件 `activeIndex` 的 `IntersectionObserver` |
| 让时间轴有内容 | 先跑 `manage.py seed_demo_content` 灌演示动态（见 `docs/07-dev-setup.md`） |
| 视觉 | [`timeline.css`](../src/features/timeline/timeline.css)，类名 `tl-` 前缀 |

### DevTools 里几个好用的

```js
// 看轨道当前状态
document.querySelector('.tlr-track').style.transform          // 左移量
document.querySelector('.tlr-readout__no')?.textContent       // 当前读数

// 点按刻度尺（必须用真实鼠标事件，见下）
// 合成 PointerEvent 不会被 React 的委托事件收到

// 关掉动效看静态布局
document.querySelector('.tl-root').classList.add('no-motion')
```

### 一次搞清 CSS 到底是谁生效

展示页的坑基本都在「两条规则打架」上（比如这次 `img` 上同时写
`max-height` 和 `aspect-ratio`，结果图片溢出 `figure`）。别猜，直接量：

```js
const img = document.querySelector('.tl-shot--lead img')
const s = getComputedStyle(img)
// aspect-ratio 是不是 auto？height 到底算出来多少？
console.table({ aspect: s.aspectRatio, height: s.height, maxHeight: s.maxHeight })
// 图片有没有超出它的 figure
console.log(img.offsetHeight, img.closest('figure').offsetHeight)
```

`offsetHeight` 不含 transform，所以带 `scale()` 的进场动画不会干扰判断。

---

## 2. 布局体检（截图看不出来的问题用这个）

```bash
node scripts/devtools/measure.mjs

# 小屏
SHOT_W=390 SHOT_H=844 node scripts/devtools/measure.mjs

```

它不看像素，只量 DOM，直接给结论。**这个工具这次抓到了 3 个截图看不出的
布局 bug**：`img` 的 `max-height` 与 `aspect-ratio` 打架导致图片溢出、
文案块被 grid 拉伸没垂直居中、4 图布局撑破一屏（24 条里只有 2 条，
肉眼翻很容易漏）。

输出字段：

| 字段 | 含义 |
| :--- | :--- |
| `horizontalScroll` | 是否出现横向滚动（小屏最容易出） |
| `exhibits[].fitsViewport` | 单条展台是否一屏放得下（超出会在翻阅时被截断） |
| `exhibits[].flipped` | 左右是否交替（应为 `false, true, false, ...`） |
| `overflowingImages` | 图片是否溢出它的 `figure` 容器 |
| `alignment[].centered` | 文案与图组是否垂直居中（单列小屏自动跳过） |
| `dock.overlapsShots` | 右下角控件是否压住图片 |
| `problems` | **上面所有检查的汇总结论，空数组就是全绿** |

看最后一行就行：

```json
"problems": []
```

---

## 3. 批量截图（给别人看 / 存证）

```bash
node scripts/devtools/shot.mjs /tmp/claner-shots
```

默认走完 8 个状态：开场 → 首屏 → 两种展台 → 语音条 → 页脚 → 索引抽屉 → 大图。

| 环境变量 | 作用 |
| :--- | :--- |
| `SHOT_STEPS=02,03` | 只跑指定步骤（调一个局部时用） |
| `SHOT_W=390 SHOT_H=844` | 换视口，`<700` 自动切 mobile 模式 |
| `SHOT_APP=http://127.0.0.1:5180` | 换地址（如局域网访问手机预览） |
| `CHROME_PATH=...` | 换浏览器 |

页面里的 `console.error` 和未捕获异常会被打到终端（`[page]` 前缀），
所以截图前顺手也当了一次控制台检查。

---

## 4. 假 API 是怎么回事 / 怎么改

链路是两段，缺一不可：

```
浏览器 XHR  ──(mock-api.js 改写 URL)──▶  /__mock__/api/...
                                          │
                          vite.mock-api.ts (dev-only 中间件) ──▶ 假 JSON
```

| 文件 | 作用 | 生产构建 |
| :--- | :--- | :--- |
| `scripts/devtools/mock-api.js` | 在页面里把 `/api/*` 的 XHR 改写成 `/__mock__/*` | 不参与 |
| `vite.mock-api.ts` | dev server 中间件，返回假响应；`apply: 'serve'` | 不参与 |

**为什么要绕这一圈**：直接伪造 `XMLHttpRequest` 的 `status` / `responseText`
会让 axios 的 XHR adapter 卡住（它依赖原生 `readyState` 流转）。用 Proxy
包住真对象、只改 URL，其余走浏览器原生实现，axios 就能正常解析。

改假数据就改 `vite.mock-api.ts` 里的 `bodyFor` 分支；想加新接口，
在 `if / else if` 链里加一条即可，浏览器侧不用动。

自检：

```bash
curl 'http://127.0.0.1:5180/__mock__/api/auth/me/'
# {"id":1,"username":"demo",...}
```

排查要点：中间件的 `req.url` 是挂载点**之后**的部分
（`/__mock__` 已被 vite 剥掉），且要在 middleware 入口**同步**取一次 ——
异步读完 body 后这个字段可能已被后续中间件改掉。这两个坑都踩过，
代码里有注释。

**上线前删干净**：删掉 `vite.mock-api.ts` + `scripts/devtools/mock-api.js`，
以及 `vite.config.ts` 里那两行 `mockApiPlugin` 引入即可，其余代码不依赖它们。

---

## 4.5 这个页面特有的坑（都踩过）

改轨道 / 刻度尺前值得先读一遍，这些是我实际调试时踩出来的：

| 现象 | 根因 |
| :--- | :--- |
| 整屏空白、一张图都看不见 | `position` 的符号约定错（轨道左移量 vs 取模区间）。统一为：`position` 是左移量，`slide 屏幕 x = left - position`，写 transform 时取负 |
| 滚动被"吸"回去（滚到 9000 弹回 6930） | 滚动推出的下标触发了跳转 effect，又把窗口滚回该下标位置。**必须区分 `targetIndex`（用户跳转，驱动滚动）与 `activeIndex`（滚动推导，只做显示）** |
| 滚到两端有顿挫 / 走不动 | 轨道位移**必须取模循环**（`gsap.utils.wrap`），不能夹紧；文档滚动到边界后由 wheel 处理器折回另一端。参考站也是无限循环 |
| 一开始显示的是第 2 张 | 轨道左右要留 `视口一半 − 卡片一半` 的 padding，否则 shift=0 时第 1 张贴左、游标实际压在第 2 张上 |
| 滚轮完全没反应 | 这套布局（轨道 fixed + 文档靠 spacer 撑高）下原生滚动不一定响应 wheel。现在由 `Rail.tsx` **接管** wheel（`preventDefault` + `scrollBy`），保证各浏览器一致；**不要**改回"原生 + 兜底"，那样在原生生效的浏览器里会滚出双倍速度 |
| 刻度尺 canvas 画不出来 | ① 被 `.tlr-viewport`（fixed inset-0）盖住 → 刻度尺要更高 z-index；② 自己的 rAF 没跟 ScrollTrigger 同帧 → 挂到 `gsap.ticker` |
| 轨道整体错位、每张各自偏移 | transform 写到了每张 slide 上。**只能写轨道容器**，逐张只做可见性裁剪 |
| 按 `←` `→` 没反应 | 渲染循环 effect 依赖了回调 → 每次渲染重建；重建时按"游标命中谁"回写 index，把刚设的 index 吃掉。改成回调放 ref、循环只依赖 `reduced` |
| 拖刻度尺没反应 | 一个标志位兼了两个职责（抑制 index 回写 / 标记刻度尺跳转），刻度尺的目标被吞掉。拆成 `scrubRef` + `skipIndexEffectRef` + `indexJumpRef` |
| 位置总被重置回开头 | `measure()` 里做了"首次落位"，而它会因 inline ref callback 反复触发 |
| 刻度尺点了没反应（但代码对） | 用 `new PointerEvent(...)` 合成的事件 **React 收不到**；要用 CDP 的 `Input.dispatchMouseEvent` |
| 刻度尺标签数 = 条目数 | 分组时拿展示用的「4月」去比 `2026-04`，两边格式不同导致每条自成一月 |

另外注意：同一目录下**只差大小写**的文件名在 macOS 上会撞车
（`TS1261: Already included file name ... differs only in casing`）。
例如曾经存在 `Rail.tsx` 与 `rail.ts`，后来 `rail.ts` 因为改用 GSAP 驱动而删除；
再有类似拆分时记得取互不为大小写变体的名字。

## 5. 常见现象对照

| 现象 | 原因 / 处理 |
| :--- | :--- |
| 打开 `/timeline` 跳到 `/login` | 没登录态。用上面的假 token，或走正常登录 |
| 打开 `/` 跳到 `/spaces` | 正常：需要显式选过空间。从 `/spaces` 点一次卡片 |
| 截图脚本报 Chrome 超时 | 受限环境必须带 `--no-sandbox --disable-breakpad` 那组开关，已在 `cdp.mjs` 里 |
| 截图整页空白 | 先看终端 `诊断:` 那行；`exhibits: 0` 说明路由没进对，多是登录态 |
| `problems` 里报某条展台超视口 | 该条图片太多/太高，调 `timeline.css` 里对应 `data-count` 的图片高度 |
| 图片和容器对不上 | 同一元素别同时写 `height`/`max-height` 和 `aspect-ratio`，二选一 |
| 改了 CSS 没生效 | 确认 dev server 在跑；PWA dev SW 已关闭，通常存盘即生效 |

---

## 6. 提交前自查

```bash
cd frontend
npx tsc -b        # 类型
npx oxlint        # lint
npm run build     # 生产构建
node scripts/devtools/measure.mjs   # 布局全绿（problems: []）
```

另外记得：`prefers-reduced-motion` 下动效要能降级 ——
DevTools → Rendering → **Emulate CSS media feature prefers-reduced-motion**。
