# GitHub Delivery 模块

> 状态：待细化
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

## 不负责

编译、校验、账号数据库、审批策略引擎和 Server 业务逻辑。

## 完成标准

- Workflow 固定使用发布版本；
- PR 只验证，不发布正式版本；
- 同一 Card 版本不可覆盖；
- Secret 不进入日志、Artifact 或 Source；
- Actions 只调用 CLI/Package。
