# ADR 0001：使用 GitHub-native 治理

- 状态：Accepted
- 日期：2026-08-20

## 背景

Forge 需要生产者协作、评审、版本和发布治理，但当前没有足够需求支撑自建数据库、账号和
策略系统。

## 决策

使用 GitHub Account、Organization Team、Repository Role、Pull Request、CODEOWNERS、Actions 和
Release 承担身份、权限、评审、构建和发布编排。

Forge 只提供无状态工具、Artifact 和静态 Web。

## 后果

优点：

- 不维护账号、密码、Session、RBAC 和 Audit Database；
- 直接复用现有工程流程；
- Commit/PR/Release 构成可追踪记录；
- 未来 GitHub Organization 接入企业 SSO 时不迁移 Forge 用户。

限制：

- 生产者需要 GitHub 使用能力；
- 不提供实时协同编辑；
- 复杂运营查询和细粒度授权能力有限；
- GitHub 不可用时治理流程不可用。

## 重新评估条件

出现大量非 GitHub 用户、实时多人编辑、脱离 GitHub 的商业交付、复杂租户隔离或监管审计要求。
