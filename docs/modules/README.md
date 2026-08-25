# Forge 模块索引

> 状态：当前模块边界
>
> 总体架构：[`../architecture-design.md`](../architecture-design.md)

## 核心模块

| 顺序 | 模块 | 文档 | 当前状态 |
| ---: | --- | --- | --- |
| 1 | Card Contract | [`card-contract.md`](./card-contract.md) | Phase 2A 第一版已完成 |
| 2 | Card Engine | [`card-engine.md`](./card-engine.md) | Phase 2 单一实现 Gate 已完成 |
| 3 | Developer Toolkit | [`developer-toolkit.md`](./developer-toolkit.md) | Workspace、Preview transport 已完成；浏览器适配和 CLI 迁移待实施 |
| 4 | Render Profile | [`render-profile.md`](./render-profile.md) | 源码能力已存在，package 和 Component Catalog 待迁移 |
| 5 | Artifact | [`artifact.md`](./artifact.md) | Contract 已定义，Builder 待实现 |
| 6 | GitHub Delivery | [`github-delivery.md`](./github-delivery.md) | Actions v0.1.0、Catalog Workflow 与 Pilot Release 已完成 |
| 7 | Forge Web | [`forge-web.md`](./forge-web.md) | Phase 6B 已完成；正式 Snapshot/Artifact/Profile 只读工作台已上线，PR Preview 待补 |

工程支撑包 `testkit` 不作为业务模块单独讨论。

## 模块文档模板

每个模块必须记录：

```text
定位
当前实现
目标职责
明确不负责
输入
输出
依赖
公开契约
失败模型
测试要求
迁移步骤
完成标准
待决问题
```

模块文档不记录跨模块的新架构决策。跨模块决策必须进入 `docs/adr/`，并回写总体架构。

## 依赖规则

1. 下层模块不能依赖上层应用。
2. 业务规则只能存在于一个模块。
3. GitHub Actions 和页面不复制 Core 逻辑。
4. 文件路径只在 Workspace 边界出现。
5. GitHub API 只在 Delivery/展示链接层出现。
6. Forge 不直接调用 `octo-server`，业务后端接入不作为 Forge 模块实现。
7. 模块完成必须包含兼容迁移和旧代码删除条件。
