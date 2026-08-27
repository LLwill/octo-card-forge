# Architecture Decision Records

ADR 记录已经接受的跨模块架构决策及其重新评估条件。

| ADR | 决策 | 状态 |
| --- | --- | --- |
| [`0001-github-native-governance.md`](./0001-github-native-governance.md) | 使用 GitHub 原生治理 | Accepted |
| [`0002-repository-topology.md`](./0002-repository-topology.md) | Forge Monorepo + 独立 Card Catalog | Accepted |
| [`0003-no-forge-database-or-accounts.md`](./0003-no-forge-database-or-accounts.md) | 当前不建设 Forge Database 和账号体系 | Accepted |
| [`0004-catalog-data-image-deployment.md`](./0004-catalog-data-image-deployment.md) | 使用独立 Catalog 数据镜像部署 Card 发布物 | Accepted |

新决策不得静默改写已接受 ADR。需要改变方向时新增 ADR，并在旧 ADR 中标记 `Superseded by`。
