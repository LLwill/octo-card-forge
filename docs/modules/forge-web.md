# Forge Web 模块

> 状态：Phase 6B 已完成；`apps/forge-web` 已只读接入正式 Snapshot、Artifact 和精确 Profile
>
> 目标代码：`apps/forge-web`、`packages/catalog-snapshot`

## 定位

静态、只读、Artifact 驱动的 Card 工作台。

## 目标职责

- Card Catalog；
- Namespace 搜索和筛选；
- Card Preview；
- Contract、Validation、Capability 报告；
- Version、Artifact digest、Source/PR/Release 链接；
- Profile 和 Components 查看；
- PR Preview Snapshot。

## 不负责

保存 Card、内部账号、在线协同编辑、审批、部署和数据库访问。

## 数据契约

只消费版本化 Catalog Snapshot、Artifact 和 Render Profile，不扫描 Card 目录。

本地开发阶段可以通过 [`../preview-system-design.md`](../preview-system-design.md) 定义的 Preview API
v1 获取 session、编译结果和 Profile 资源。该 API 是过渡性的本地/PR 运行面，不是 Forge Web 的
长期数据存储接口；静态 Forge Web 最终切换到 Snapshot/Artifact。

## 当前实现

- `apps/forge-web` 已提供静态、响应式 Card Catalog 工作台，覆盖 Cards、Preview、Contract、Validation 和 Versions；
- 页面通过 `/forge/api/` 同源代理读取不可变 Snapshot 和 Artifact，不扫描 Forge Card 目录；
- 服务端与浏览器均按 canonical SHA-256 验证 Artifact，失败时关闭展示；
- Preview 按 Artifact 固定的 Profile npm 版本、HostConfig、CSS 和 Adaptive Cards SDK 版本隔离渲染；
- npm CLI 包与 deploy bundle 均携带 `apps/forge-web/dist`，CLI 在 `/forge/` 提供新工作台；
- legacy `web/app.js` 已通过 Preview Kit client 使用 Preview API v1；
- legacy `web/components.js` 仍消费 `/api/component-baseline` 并直接初始化 Adaptive Cards；
- legacy `/` 页面暂时保留，Phase 6C 完成 PR Preview Snapshot 后再收敛迁移入口。

## 完成标准

- 当前 Web 功能迁移到新信息架构；
- Snapshot fixture 和真实 CI 数据行为一致；
- Preview 与 `octo-web` 使用同源 Profile；
- 页面具备完整 loading/error/empty/responsive 状态。

当前剩余 Gate：

- PR 使用独立 Snapshot 生成 Preview；
- Preview 与 `octo-web` 完成同源 Profile 的实际展示对照；
- 评估并迁移 legacy Components 页面。
