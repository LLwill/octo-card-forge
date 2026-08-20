# Artifact 模块

> 状态：Artifact v1 Contract 已定义，Builder、digest 和 verify 待实现
>
> 目标代码：`packages/artifact`

## 定位

把已验证的 Card Source 构建为可验证、可发布、可部署的不可变内容。

## 当前实现

- `packages/card-spec` 已定义 `CardArtifactV1`、Decoder、media type、digest 和 volatile field 约束；
- `packages/artifact` 当前仍为空壳；
- 现有 Handoff 是 legacy 实现，尚未由 Artifact 派生。

## 目标职责

- Artifact v1 Builder；
- canonical bytes；
- SHA-256 digest；
- verify/inspect；
- Validation/Inspection/Capability Report；
- Handoff 导出。

## 不负责

GitHub API、Release 创建、部署环境、用户和运行时实例。

## 完成标准

- 同一输入跨目录、跨重复运行产生相同 digest；
- Artifact 不含易变字段；
- Handoff 从 Artifact 派生；
- Artifact/Handoff 可以被业务后端 fixture 消费。
