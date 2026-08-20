# Forge Web 模块

> 状态：现有页面待重构
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

## 完成标准

- 当前 Web 功能迁移到新信息架构；
- Snapshot fixture 和真实 CI 数据行为一致；
- Preview 与 `octo-web` 使用同源 Profile；
- 页面具备完整 loading/error/empty/responsive 状态。
