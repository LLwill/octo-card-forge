# Card Engine 模块

> 状态：Phase 2B 第一版和根 facade 已完成
>
> 目标代码：`packages/core`

## 定位

Card Engine 是唯一的纯编译、校验、Inspection 和能力分析实现。

## 当前实现

`packages/core` 已抽出无 IO 的 `compileCardSource`、`inspectCard`、
`validateCompiledCard`、utility ID parser 和 Core 类型。Compile 接收
`ResolvedCardSourceV1`、ViewModel 和 Profile capabilities，输出统一 `CompileResult`。
它不读取文件、不访问 HTTP/Git、不依赖环境变量。

旧的 `src/validate.ts`、`src/inspect.ts` 仍保留作兼容入口；根 `src/compiler.ts` 已通过
`src/core-adapter.ts` 调用 Workspace 和 Core。纯对象 Compile API、根 CLI facade 和 Preview API
共用同一套编译语义。

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
- 根 CLI 旧路径行为保持不变，现有 parity/packaging/deploy 测试通过；
- Compile 已形成纯对象实现，旧 Validator/Inspection 文件只有在全部调用迁移后才删除。

## 下一步

1. 把 Preview Client/渲染适配抽为私有 `packages/preview-kit`；
2. 将旧 Validator/Inspection 调用逐个迁移并删除重复实现；
3. 将根 CLI 逐步迁入 `packages/cli`，保持发布入口兼容。
