# Forge 模块索引

> 状态：当前模块边界
>
> 总体架构：[`../architecture-design.md`](../architecture-design.md)

## 核心模块

| 顺序 | 模块 | 文档 | 当前状态 |
| ---: | --- | --- | --- |
| 1 | Card Contract | [`card-contract.md`](./card-contract.md) | 待细化 |
| 2 | Card Engine | [`card-engine.md`](./card-engine.md) | 待细化 |
| 3 | Developer Toolkit | [`developer-toolkit.md`](./developer-toolkit.md) | 待细化 |
| 4 | Render Profile | [`render-profile.md`](./render-profile.md) | 现有能力较多，待收敛 |
| 5 | Artifact | [`artifact.md`](./artifact.md) | 待设计 v1 |
| 6 | GitHub Delivery | [`github-delivery.md`](./github-delivery.md) | 待设计 |
| 7 | Forge Web | [`forge-web.md`](./forge-web.md) | 现有页面待重构 |

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
