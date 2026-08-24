# GitHub Delivery 模块

> 状态：Delivery Contract 与首批 reusable Actions 已实现；Catalog 仓库接入待完成
>
> 目标代码：`actions/`、Catalog 仓库 `.github/workflows/`

## 定位

使用 GitHub 原生对象完成 Card Check、Review、Preview 和 Release 编排。

## 目标职责

- 可复用 `card-check` Action；
- 可复用 `card-release` Action；
- CODEOWNERS 和 Branch Protection 约定；
- Tag、Release Asset、checksum 规范；
- PR Preview 产物和链接约定。

## 当前 Contract

`actions/card-check` 用于 Pull Request：

- 固定安装精确版本的已发布 CLI 与 Render Profile；
- 对 Card Source 运行 `verify`，版本目录仍由 CLI 强制执行 immutable 约束；
- 输出每个 sample 的编译结果、verification report、Card Artifact 与 canonical digest；
- 可选上传 `card-check-<card-id>-<card-version>-<commit-prefix>` workflow artifact；
- 不创建 tag 或 GitHub Release。

`actions/card-release` 用于合并后的版本目录：

- 要求输入是 `versions/<version>` 下的 immutable release package；
- 运行 release verification、Artifact build/verify 和 Handoff 导出；
- 只允许从配置的 release branch 发布；
- tag 固定为 `card/<card-id>/v<version>`，已有 tag 或 Release 时失败；
- Release Asset 固定为 Artifact JSON、canonical digest、Handoff ZIP、ZIP checksum 和 verification report。

当前默认工具版本为 `@mlt-org/octo-card-cli@0.2.2` 与
`@mlt-org/octo-card-profile-octo-chat@1.2.0-rc.4`。Catalog Workflow 应同时固定
Action ref 和这两个输入版本，不使用 `latest`、范围版本或 workspace 源码。

## 不负责

编译、校验、账号数据库、审批策略引擎和 Server 业务逻辑。

## 完成标准

- Workflow 固定使用发布版本；
- PR 只验证，不发布正式版本；
- 同一 Card 版本不可覆盖；
- Secret 不进入日志、Artifact 或 Source；
- Actions 只调用 CLI/Package。
