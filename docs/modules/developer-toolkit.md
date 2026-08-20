# Developer Toolkit 模块

> 状态：待细化
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

## 不负责

内部账号、Token 保存、GitHub 权限判断、审批和部署政策。

## 完成标准

- 无网络可以完成本地开发；
- CLI 只编排 Contract/Core/Artifact；
- npm 包名和 bin 保持兼容；
- 外部工作目录不需要 clone Forge。
