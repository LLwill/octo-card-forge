# Card Contract 模块

> 状态：Phase 2A 已完成第一版，后续按兼容矩阵演进
>
> 目标代码：`packages/card-spec`

## 定位

定义模块之间交换的数据，不执行编译、文件读取或发布。

## 当前实现

`packages/card-spec` 已提供无 IO 的 Contract API：

- `CardSourceManifestV2` / `decodeCardSourceManifest`；
- `ResolvedCardSourceV1` / `decodeResolvedCardSourceV1`；
- `RenderProfileManifestV1` / `RenderCapabilitiesV1`，支持 legacy unversioned compatibility mode；
- `CardArtifactV1` 和 `CatalogSnapshotV1` 的结构与语义 Decoder；
- RFC 6901 JSON Pointer 诊断、稳定错误码、ID/SemVer/Profile reference 解析；
- `schemas/*.schema.json` 作为结构约束的公开入口。

根 `src/types.ts` 和 `src/registry.ts` 暂时保留为 legacy facade，未切换根 CLI 的运行时依赖。

## 目标职责

- Card Source/Manifest Schema；
- Render Profile Contract；
- Artifact v1 Schema；
- Catalog Snapshot v1 Schema；
- Component Catalog / Component Specimen Schema；
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

## 已完成标准

- 当前 Draft/Release Manifest 可被 Decoder 和 legacy validator 双向对账；
- 未知版本、未知字段和非法路径 fail-close；
- Profile canonical v1 与 legacy compatibility 路径均有测试；
- Artifact/Snapshot 的 media type、reference 和 volatile field 约束已固定；
- Snapshot 中的 Artifact digest 已约束 SHA-256 字符串格式，Artifact canonical bytes 和 digest 算法留在 Phase 4 定义。

## 后续工作

1. 定义 `ComponentCatalogV1` 和 `ComponentSpecimenV1`，供 Profile、Preview Kit 和 Forge Web 交换组件样例；
2. 用 AJV/Schema fixture 做结构 parity，Decoder 负责语义 invariant；
3. 将 Profile capabilities 的组件/utility 深层结构约束收紧；
4. 根 CLI 迁移到 workspace package 后再删除 legacy contract facade。
