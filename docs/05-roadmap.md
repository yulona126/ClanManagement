# 文档 5：开发阶段与任务清单

按顺序执行。**每个阶段验收通过再进入下一阶段。**

## 阶段依赖

```
阶段0 初始化
    │
    ▼
阶段1 用户与鉴权
    │
    ▼
阶段2 Workspace 与成员管理  ← 核心地基
    │
    ├──────────────┐
    ▼              ▼
阶段3 成长记录    阶段4 媒体上传
    │              │
    └──────┬───────┘
           ▼
      阶段5 录音功能
           │
           ▼
      阶段6 体验优化与上线
           │
           ▼
      产品增强（可并行规划）
      · 一天一张照片
      · 写给 hexia
      · Timeline
      · PWA 深化
```

---

## 阶段 0：项目初始化

**目标：** 前后端骨架跑通，能互相调通健康检查。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| 创建 Django 项目 + DRF + JWT 配置 | 后端可启动，`GET /api/health/` 返回 200 | ⬜ |
| 创建 React + Vite + TS 项目 | 前端可启动，能请求到后端健康检查 | ⬜ |
| 配置数据库（SQLite 开发 / PostgreSQL 生产占位） | migration 可执行 | ⬜ |
| 配置 django-storages（先用本地存储占位） | 文件存储后端就绪 | ⬜ |
| 配置 CORS、环境变量管理 | 前后端跨域可通信 | ⬜ |

**验收：** 前端页面显示「后端连接成功」。

---

## 阶段 1：用户与鉴权

**目标：** 用户能登录，拿到 JWT，访问受保护接口。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| 使用 Django 内置 User 模型 | 无需自定义 | ⬜ |
| 实现 `POST /api/auth/login/` | 返回 access + refresh | ⬜ |
| 实现 `POST /api/auth/refresh/` | 刷新 access | ⬜ |
| 实现 `GET /api/auth/me/` | 当前用户信息 | ⬜ |
| 前端：登录页 + token 存储 + 请求拦截器 | 登录后自动带 token | ⬜ |
| 前端：路由守卫 | 未登录跳转登录页 | ⬜ |

**验收：** Admin 创建用户 → 前端登录成功 → 能访问 `/api/auth/me/`。

> 注册接口可选；MVP 默认 Admin 创建。

---

## 阶段 2：Workspace 与成员管理（地基）

**目标：** 用户能查看自己的 Workspace；owner 能改角色与称呼。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| 创建 Workspace 模型 | 宝宝信息可存储 | ⬜ |
| 创建 Membership 模型（role + relation_label） | 关系可存储 | ⬜ |
| Django Admin 注册两模型 | 可手动建数据 | ⬜ |
| `GET /api/workspaces/` | 含 `my_role`、`my_relation_label` | ⬜ |
| `GET /api/workspaces/{id}/` | 详情 | ⬜ |
| `GET /api/workspaces/{id}/members/` | 成员列表 | ⬜ |
| `PATCH /api/workspaces/{id}/members/{mid}/` | owner 可改 | ⬜ |
| DRF Permission：`IsWorkspaceMember` 等 | 接口自动鉴权 | ⬜ |
| 前端：Workspace 切换器 | 切换后称呼更新 | ⬜ |

**验收：** 两用户 × 两 Workspace 交叉角色；各自只看到有权限的 Workspace；称呼正确。

---

## 阶段 3：成长记录

**目标：** 记录 CRUD + 权限生效。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| GrowthRecord 模型 | 可存储 | ⬜ |
| `GET/POST .../records/` | 列表分页；创建限 owner/editor | ⬜ |
| `GET/PATCH/DELETE .../records/{rid}/` | 详情与分级权限 | ⬜ |
| 前端：列表页 | 标题、摘要、时间、作者称呼 | ⬜ |
| 前端：详情页 | 完整内容 | ⬜ |
| 前端：创建/编辑表单 | 仅 owner/editor 可见 | ⬜ |

**验收：** viewer 无创建按钮且 POST→403；editor 不可删他人记录；owner 可以。

---

## 阶段 4：媒体上传

**目标：** 图片/视频上 OSS，记录中可展示。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| MediaAsset 模型 | 元数据可存储 | ⬜ |
| `POST .../media/presign/` | 预签名 URL | ⬜ |
| `POST .../media/complete/` | 写库 | ⬜ |
| 前端：上传组件（直传 + 回调） | 闭环 | ⬜ |
| 详情页展示图/视频 | 可用 | ⬜ |
| OSS 图片处理 + 列表缩略图 | 列表加速 | ⬜ |
| 图片懒加载 | 首屏可控 | ⬜ |

**验收：** 上传一张图 → OSS 有原图 → 列表缩略图 → 可看大图。开发期本地存储时，用等价本地 PUT/保存路径验收流程。

---

## 阶段 5：录音

**目标：** 按住说话 → 上传 → 可播放。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| `useVoiceRecorder` Hook | MediaRecorder 生命周期 | ⬜ |
| 按住说话按钮 | 触摸/鼠标 | ⬜ |
| 录音走预签名直传 | 复用上传逻辑 | ⬜ |
| `media_type=audio` | 后端支持 | ⬜ |
| 音频播放器组件 | `<audio>` 封装 | ⬜ |

**验收：** 按住说话，松手上传，记录中可播放。

---

## 阶段 6：体验优化与上线

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| CDN 加速 OSS | 媒体更快 | ⬜ |
| OSS 生命周期规则 | 低频存储 / 清理临时前缀 | ⬜ |
| 骨架屏 / 加载态 | 减少白屏 | ⬜ |
| 错误边界与友好提示 | 401/403/网络错误 | ⬜ |
| 生产：PostgreSQL + gunicorn + nginx | 可部署 | ⬜ |
| CI/CD（可选） | 自动构建 | ⬜ |
| README 部署章节 | 可维护 | ⬜ |

**验收：** 家人可访问；图视频流畅。

---

## 产品增强（主干稳定后）

优先级与愿景对齐：

### E1. 一天一张照片

| 任务 | 说明 |
| :--- | :--- |
| 业务日期 | `record_date` 或按日聚合视图 |
| 日历 UI | 有照片的日子标记；空日可补录 |
| 约束（可选） | 「每日一张」软提示或硬限制，产品再定 |

### E2. 写给 hexia

| 任务 | 说明 |
| :--- | :--- |
| `record_kind=letter` | 或独立 Letter 表 |
| 信件列表 / 详情 | 偏阅读体验的排版 |
| 权限 | 仍走 Workspace Membership |

### E3. Timeline

| 任务 | 说明 |
| :--- | :--- |
| 数据 | 复用 records + media，按时间排序 |
| 交互参考 | [The Lookback — Codrops](https://tympanus.net/codrops/2026/03/03/the-lookback-a-digital-capsule-for-better-off-studios-creative-past/) |
| 实现 | 前端沉浸式滚动/章节；注意移动端性能与媒体懒加载 |

### E4. PWA

| 任务 | 说明 |
| :--- | :--- |
| Web App Manifest | 名称、图标、`display=standalone` |
| Service Worker | 壳层 + API 列表缓存策略；原片按需 |
| HTTPS | 生产必备 |
| （可选）推送 | 「该拍今日照片」等提醒 |

---

## 开发原则（再次强调）

1. **阶段 2 是地基**，多花时间值得。
2. **不要跳过鉴权**，第一天就挂 Permission。
3. **媒体可晚于文字记录**。
4. **录音与产品增强放后半程**。
5. **单阶段跑通再开下一阶段**。
