# Developer Toolkit 模块

> 状态：Workspace facade、Preview Kit client 和 legacy Card 页面 transport 接入已完成；共享浏览器适配和 CLI package 迁移待实施
>
> 目标代码：`packages/workspace`、`packages/preview-kit`、`packages/cli`

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
- legacy `web/app.js` 已消费 Preview Kit client，但 Adaptive Cards 浏览器渲染仍在页面内；
- legacy `web/components.js` 尚未接入 Preview Kit 或版本化 Component Catalog；
- 根 CLI/Server 的构建入口会 bundle 私有 workspace 包，npm tarball 只发布 CLI bundle 和必要 Web/Skill 资源；
- Server bundle 只进入部署包，不作为 npm 可导入入口发布；
- legacy `dist/*.js` 编译中间文件不进入 npm tarball，独立安装不需要私有 workspace 包；
- `packages/cli` 仍是后续迁移目标，当前根 CLI 继续保持兼容。
