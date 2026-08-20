# Forge Web 模块

> 状态：legacy Card 页面已接入 Preview API v1；Components 页面和目标 `apps/forge-web` 待重构
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

- legacy `web/app.js` 已通过 Preview Kit client 使用 Preview API v1；
- Adaptive Cards SDK 初始化仍在页面内，尚未形成共享浏览器渲染适配；
- legacy `web/components.js` 仍消费 `/api/component-baseline` 并直接初始化 Adaptive Cards；
- `apps/forge-web` 当前为空壳，不能将 legacy 页面接入视为 Phase 6 已开始。

## 完成标准

- 当前 Web 功能迁移到新信息架构；
- Snapshot fixture 和真实 CI 数据行为一致；
- Preview 与 `octo-web` 使用同源 Profile；
- 页面具备完整 loading/error/empty/responsive 状态。
