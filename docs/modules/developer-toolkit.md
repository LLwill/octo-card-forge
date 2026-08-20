# Developer Toolkit 模块

> 状态：Workspace facade 和 Preview Kit client 已完成，CLI package 迁移待实施
>
> 目标代码：`packages/workspace`、`packages/cli`

## 定位

为开发者和 Agent 提供本地 Card Workspace、CLI 和导入导出能力。

## 目标职责

- 安全加载 Card 目录；
- 路径越界防护；
- init/check/render/verify/artifact 命令；
- Profile package 发现；
- Repo-free Agent 工作流；
- 机器可读 JSON 输出；
- Catalog PR 辅助命令可以后置增加。
- 为本地 Preview 提供 Card/Workspace runtime；Preview HTTP 协议见 [`../preview-system-design.md`](../preview-system-design.md)。

## 不负责

内部账号、Token 保存、GitHub 权限判断、审批和部署政策。

## 完成标准

- 无网络可以完成本地开发；
- CLI 只编排 Contract/Core/Artifact；
- npm 包名和 bin 保持兼容；
- 外部工作目录不需要 clone Forge。

## 当前实现

- `packages/workspace` 已负责目录、Manifest、Template、Sample 和路径安全；
- 根 `src/core-adapter.ts` 将 Workspace Source、Profile 和 revision 交给 `packages/core`；
- `packages/preview-kit` 已提供 Preview API client 和共享 session/render 契约；
- 根 CLI/Server 的发布入口会 bundle 私有 workspace 包，独立 npm 安装不需要这些私有包；
- `packages/cli` 仍是后续迁移目标，当前根 CLI 继续保持兼容。
