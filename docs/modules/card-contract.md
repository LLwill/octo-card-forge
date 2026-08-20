# Card Contract 模块

> 状态：待第一轮细化
>
> 目标代码：`packages/card-spec`

## 定位

定义模块之间交换的数据，不执行编译、文件读取或发布。

## 当前实现

类型主要位于 `src/types.ts`，Manifest 校验分散在 `src/registry.ts`、`src/validate.ts` 和
Profile 相关代码中。

## 目标职责

- Card Source/Manifest Schema；
- Render Profile Contract；
- Artifact v1 Schema；
- Catalog Snapshot v1 Schema；
- 稳定 ID、版本和错误结构；
- Decoder 与兼容读取策略。

## 不负责

- 模板编译；
- 文件路径解析；
- GitHub Release；
- 页面 ViewModel；
- Server 运行时协议。

## 输入与输出

输入是未知 JSON；输出是类型化对象或稳定的 Decode Issue。

## 依赖

不得依赖其他 Forge 业务模块。

## 初始完成标准

- Schema 与 TypeScript 类型一致；
- 当前 Manifest 可被兼容 Decoder 读取；
- 未知版本 fail-close；
- 所有公开 Schema 有 fixture 和版本策略。

## 待决问题

1. Source Manifest v1 的最小字段；
2. Card ID 与 Namespace 的语法；
3. Draft 是否保留语义 version hint；
4. Artifact 与 Source 的字段边界；
5. Snapshot 是否引用 Artifact URL 或内嵌摘要。
