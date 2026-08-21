# ADR 0002：平台 Monorepo 与独立 Card Catalog

- 状态：Accepted
- 日期：2026-08-20

## 背景

平台代码和 Card 内容拥有不同的维护者、权限和发布节奏。继续把正式 Card 放在 Forge 代码仓库会
让业务变更与工具链发布耦合。

## 决策

保留 `octo-card-forge` 作为平台 Monorepo，新增一个 `octo-card-catalog` 纯内容仓库。
`octo-web` 和 `octo-server` 继续作为既有独立仓库。

仓库之间只通过 npm 包、GitHub Action tag、Card Artifact、Handoff、Catalog Snapshot 和既有运行时
协议通信。Forge 不直接调用 `octo-server`。

## 后果

- Card PR 不需要修改平台代码；
- 平台维护者和 Card 生产者权限可以分开；
- 必须维护跨仓版本兼容和契约测试；
- 不使用 submodule、源码复制或跨仓相对依赖。
