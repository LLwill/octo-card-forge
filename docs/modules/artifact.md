# Artifact 模块

> 状态：Artifact v1 Contract、Builder、canonical bytes、digest、verify 和 Handoff 派生已实现
>
> 目标代码：`packages/artifact`

## 定位

把已验证的 Card Source 构建为可验证、可发布、可部署的不可变内容。

## 当前实现

- `packages/card-spec` 已定义 `CardArtifactV1`、Decoder、JSON Schema、media type 和 volatile field 约束；
- `packages/artifact` 已实现纯对象输入的 build、canonical bytes、SHA-256 和 verify；
- Builder 使用 Core 编译每个 view/sample，拒绝任何 error，并在 Artifact 中保留带 view/sample 来源的 warning；
- Profile 必须使用与 manifest 一致的精确版本引用；
- verify 可直接验证对象、JSON 字符串或 UTF-8 bytes，不依赖 Workspace、Git 或 Profile 文件；
- legacy Handoff JSON/ZIP 已改为从 canonical Artifact 派生，外层适配器只额外负责文件解析和 Profile 资源打包。

## Canonical bytes

- 对象 key 递归按确定性的字符串顺序排列；
- 数组顺序保留，Builder 在写入 Artifact 前按 sample name 排序；
- 使用无缩进、无尾随换行的紧凑 JSON；
- 编码固定为 UTF-8；
- digest 是 canonical bytes 的小写 64 位 SHA-256 hex。

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
