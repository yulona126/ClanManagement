# 文档 8：测试用例

## 8.1 权限核心（必过）

| 编号 | 前置条件 | 操作 | 预期结果 |
| :--- | :--- | :--- | :--- |
| TC-01 | 用户 A 是宝宝 1 的 viewer | `POST /api/workspaces/1/records/` | 403 |
| TC-02 | 用户 A 是宝宝 1 的 editor | `POST /api/workspaces/1/records/` | 201 |
| TC-03 | 用户 A 是宝宝 1 的 owner | `PATCH /api/workspaces/1/members/5/` 改 role | 200 |
| TC-04 | 用户 A 不是宝宝 2 的成员 | `GET /api/workspaces/2/records/` | 403（或统一 404） |
| TC-05 | A 同时是宝宝 1 owner 与宝宝 2 viewer | `GET /api/workspaces/` | 两条；`my_role` 分别为 owner、viewer |
| TC-06 | editor，记录作者是他人 | `DELETE .../records/{rid}/` | 403 |
| TC-07 | owner，记录作者是他人 | `DELETE .../records/{rid}/` | 204/200 |
| TC-08 | viewer | `POST .../media/presign/` | 403 |
| TC-09 | 未带 token | 任意受保护接口 | 401 |

## 8.2 数据隔离

| 编号 | 操作 | 预期 |
| :--- | :--- | :--- |
| TC-10 | 用 Workspace 1 的 record_id 调 Workspace 2 的 detail/patch | 403/404，且不泄露 |
| TC-11 | complete 回调中 `object_key` 前缀不属于该 Workspace | 400/403，不写库 |

## 8.3 阶段验收烟测

| 阶段 | 烟测 |
| :--- | :--- |
| 0 | 前端显示「后端连接成功」 |
| 1 | 登录 → `/api/auth/me/` 有用户名 |
| 2 | 切换 Workspace，界面称呼变化；非成员 Workspace 不出现 |
| 3 | viewer 无创建按钮；editor 可建记录 |
| 4 | 上传图片 → 列表缩略图 → 大图 |
| 5 | 录音上传可播放 |
| 6 | 生产域名 HTTPS 下主流程可用 |

## 8.4 自动化建议

- 后端：pytest + DRF `APIClient`，先覆盖 TC-01～TC-09。
- 前端：阶段后期再补关键路径 E2E（Playwright）；前期手工验收即可。

## 8.5 测试数据命名约定

Admin / fixture 中建议：

- 用户：`parent_a` / `relative_b`
- Workspace：`baby_xiaoman` / `baby_xiaohe`
- 角色组合覆盖：owner、editor、viewer 各至少一例
