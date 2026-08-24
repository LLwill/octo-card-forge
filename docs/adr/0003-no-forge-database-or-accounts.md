# ADR 0003：当前不建设 Forge Database 和账号体系

- 状态：Accepted
- 日期：2026-08-20

## 背景

曾考虑使用数据库保存 Draft、Revision、Artifact 元数据、账号、权限和审计，但当前真实工作流可以
由 GitHub 仓库和发布对象表达。

## 决策

本轮重构不建设：

- Forge Database；
- Forge 用户与登录；
- OIDC/RBAC/Service Account；
- `forge-api`；
- `forge-worker`；
- 动态 Artifact Registry 服务。

Forge Web 保持静态只读，CLI 复用现有 Git/`gh` 凭证，GitHub Actions 执行异步构建和发布。

## 后果

系统更简单，但不会提供实时协同编辑、自定义账号体验或复杂查询。

## 重新评估条件

GitHub-native 模型无法满足已发生的业务需求，而不是仅仅基于未来假设。
