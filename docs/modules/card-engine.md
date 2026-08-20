# Card Engine 模块

> 状态：Phase 2 单一实现 Gate 已完成
>
> 目标代码：`packages/core`

## 定位

Card Engine 是唯一的纯编译、校验、Inspection 和能力分析实现。

## 当前实现

`packages/core` 已抽出无 IO 的 `compileCardSource`、`inspectCard`、
`validateCompiledCard`、utility ID parser 和 Core 类型。Compile 接收
`ResolvedCardSourceV1`、ViewModel 和 Profile capabilities，输出统一 `CompileResult`。
它不读取文件、不访问 HTTP/Git、不依赖环境变量。

根 `src/validate.ts`、`src/inspect.ts` 和 `src/utility-id.ts` 只保留为 Core 的精确 re-export；根
`src/compiler.ts` 已通过 `src/core-adapter.ts` 调用 Workspace 和 Core。纯对象 Compile API、根 CLI
facade 和 Preview API 共用同一套编译、校验和 Inspection 语义。

## 目标职责

- Template + ViewModel → 标准 Adaptive Card JSON；
- ViewModel Schema 校验；
- Adaptive Card/Profile 校验；
- Action/Input/Toggle Inspection；
- Required Capabilities；
- 稳定 Issue code/path/details。

## 不负责

文件、Git、HTTP、环境变量、Profile 安装、Artifact 发布和 Server 调用。

## 输入与输出

接收已解析 Source、ViewModel 和 Profile；输出 Compile Result 与 Report。

## 当前 Gate

- `compileCardSource`、`inspectCard` 和 `validateCompiledCard` 可独立测试；
- Core 无文件系统、HTTP、Git、环境变量依赖；
- 根 CLI 旧路径行为保持不变，parity、CLI validate、build 和 npm pack 检查通过；
- Validator、Inspection 和 utility ID parser 只有一份业务实现；
- facade identity tests 防止根入口重新引入重复规则。

## 下一步

1. Phase 3E 迁移根 CLI package 时删除不再需要的 facade 文件；
2. 在此之前保持旧 import path 和 npm bin 行为兼容。
