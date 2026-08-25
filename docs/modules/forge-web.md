# Forge Web 模块

> 状态：统一 Web 与 Server 重构已完成
>
> 目标代码：`apps/forge-web`、`packages/catalog-snapshot`

> 统一 Cards、Components、Playground、Install 以及 Server 分层的后续方案见
> [`../forge-web-server-refactor-plan.md`](../forge-web-server-refactor-plan.md)。

## 定位

静态优先、Artifact 驱动，同时支持 Published 与 Workspace 两种显式运行模式的 Card 工作台。

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

Published 模式只消费版本化 Catalog Snapshot、Artifact 和 Render Profile。Workspace 模式通过
CLI Server 的 Preview/Core adapter 读取显式 Card Package，不与 Published 数据静默混用。

本地开发阶段可以通过 [`../preview-system-design.md`](../preview-system-design.md) 定义的 Preview API
v1 获取 session、编译结果和 Profile 资源。该 API 是过渡性的本地/PR 运行面，不是 Forge Web 的
长期数据存储接口；静态 Forge Web 最终切换到 Snapshot/Artifact。

## 当前实现

- `apps/forge-web` 使用 React、Vite 和 React Router，统一承载 Cards、Components、Playground 与 Install；
- 页面通过 `/api/v1` 读取 Runtime、Catalog、Artifact、Component、Install 和 Preview 数据；
- 服务端与浏览器均按 canonical SHA-256 验证 Artifact，失败时关闭展示；
- Preview 按 Artifact 固定的 Profile npm 版本、HostConfig、CSS 和 Adaptive Cards SDK 版本隔离渲染；
- npm CLI 包与 deploy bundle 均携带 `apps/forge-web/dist`，CLI 在 `/forge/` 提供新工作台；
- Vite hashed asset、SPA deep link、Base Path 和 `file:` Hash Router 均受支持；
- Workspace Cards 提供 Sample、Contract、Validation 与 Handoff，Template Data 由 Server/Core 编译；
- Card JSON Playground 在 sandbox iframe 中运行，Action 只记录、不执行宿主副作用；
- PR Preview 通过 `window.__OCTO_FORGE_BOOTSTRAP__` 内嵌已验证 Snapshot/Artifact，解压后可从 `preview/index.html` 独立启动；
- 内嵌预览仍执行 Snapshot/Artifact canonical digest 校验，并使用 Artifact 固定的 Profile 与 SDK；
- legacy HTML/JS/CSS 已删除，`/`、`/components`、`/install` 仅保留到统一路由的 308 跳转；
- 旧 API 暂作为兼容 Adapter 保留，不再被正式 Web 直接消费。

## 完成标准

- 当前 Web 功能迁移到新信息架构；
- Snapshot fixture 和真实 CI 数据行为一致；
- Preview 与 `octo-web` 使用同源 Profile；
- 页面具备完整 loading/error/empty/responsive 状态。

完成证据：

- 正式页面与 PR Preview 均只消费版本化 Snapshot、Artifact 和同源 Profile；
- PR Preview 已在真实 Catalog PR 上生成、下载、复验并完成桌面与移动端浏览器验收；
- 页面覆盖 loading/error/empty/responsive 状态，Catalog 更新不要求修改 Web 代码。
