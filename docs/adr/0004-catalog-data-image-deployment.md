# ADR 0004：使用独立 Catalog 数据镜像部署 Card 发布物

- 状态：Accepted
- 日期：2026-08-27

## 背景

正式 Card Source 已从 Forge 仓库迁移到 `octo-card-catalog`。Forge Web 需要消费 Catalog Snapshot、
Artifact 和 Handoff，但生产环境直接请求远端 Release 资源会引入外部可用性、运行时网络、安全、缓存和
双仓一致性问题。

在 Forge 镜像构建时克隆 Catalog Source 可以解决运行时网络问题，但每次 Card 发布都必须重新构建
Forge 应用镜像，无法保持两个仓库的独立发布节奏。

## 决策

生产部署使用两个独立、以 digest 固定的 OCI 镜像：

1. Forge 应用镜像包含 Server、Web 和平台能力；
2. Catalog 数据镜像包含经过 CI 编译和验证的 Snapshot、Artifact、Handoff 与 Profile 静态资源。

Catalog 数据镜像由 Forge 项目的 GitLab CI 构建并推送现有 TCR。Catalog 发布流程只负责传递完整的
Catalog commit SHA 并触发受保护 Pipeline；构建任务不得读取浮动 `main` 作为发布输入。

Kubernetes 使用 Catalog 镜像作为 `initContainer`，将 `/catalog` 复制到 Pod 的 `emptyDir`。Forge
容器以只读方式挂载该目录。`deploy-files` 同时记录两个镜像 digest，ArgoCD 通过 Deployment 滚动更新
完成发布。

生产 Pod 不克隆 Git、不编译 Card，也不依赖远端 Snapshot 或 npm CDN。

完整契约和流程见
[`catalog-bundle-deployment-and-card-contribution.md`](../catalog-bundle-deployment-and-card-contribution.md)。

## 后果

正面影响：

- Card 和 Forge 可以独立构建与发布；
- 一个 Pod 内的应用和 Catalog 组合明确、不可变；
- 运行时没有外部 Card 数据依赖；
- 更新和回滚只需切换镜像 digest；
- Catalog 构建、部署审批和生产运行之间具有完整证据链。

成本：

- Catalog 变更会触发 Pod 滚动更新，但不会重新构建 Forge 镜像；
- Deployment 需要 initContainer 和共享 `emptyDir`；
- 必须维护 Forge/Catalog 兼容范围及组合 Smoke Test；
- Catalog 数据镜像必须包含最小复制工具，并接受私有 Registry 治理。

## 被拒绝的方案

### 生产运行时读取远端 Snapshot

拒绝原因：外部可用性、SSRF、超时、缓存、资源限制和回滚边界更复杂。

### Pod 启动时克隆并编译 Catalog Source

拒绝原因：不可重复、依赖 Git 和凭证、扩容重复编译、失败面过大。

### 将 Catalog 编译进 Forge 应用镜像

拒绝原因：任何 Card 发布都要求重新构建 Forge，重新耦合两个仓库的发布节奏。

### 使用数据库或动态 Registry 服务

拒绝原因：当前需求是只读、不可变发布和展示，数据库与在线 Registry 没有足够收益。

## 重新评估条件

出现以下任一条件时，可以新增 ADR 重新评估：

- Catalog bundle 大到无法在可接受时间内完成 Pod 初始化；
- Card 要求分钟级发布且 Pod 滚动不可接受；
- 多区域部署需要独立内容分发；
- Card 需要按租户动态授权或实时下发；
- Kubernetes 环境提供成熟、可移植的 OCI image volume，可以替代 initContainer 复制。
