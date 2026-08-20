# Card Engine 模块

> 状态：Phase 2B 进行中
>
> 目标代码：`packages/core`

## 定位

Card Engine 是唯一的纯编译、校验、Inspection 和能力分析实现。

## 当前实现

`packages/core` 已抽出无 IO 的 `inspectCard`、`validateCompiledCard`、utility ID parser
和 Core 类型。它不读取文件、不访问 HTTP/Git、不依赖环境变量。

旧的 `src/compiler.ts`、`src/validate.ts`、`src/inspect.ts` 仍是根 CLI 的兼容入口；纯对象
Compile API 和 old/new Golden parity 仍在 Phase 2B 收敛。

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

- `inspectCard` 和 `validateCompiledCard` 可独立测试；
- Core 无文件系统、HTTP、Git、环境变量依赖；
- 根 CLI 旧路径行为保持不变，25 个测试文件、132 个测试通过；
- Compile 尚未切换，Validator 仍存在 legacy/new 两份实现，直到 parity gate 完成。

## 下一步

1. 接收 `ResolvedCardSourceV1`，实现纯对象 Template + ViewModel 编译；
2. 将旧 `src/validate.ts` 与 Core 输出逐样本对账；
3. 建立兼容 facade，再把根 CLI 的文件加载逻辑留在 Workspace 层。
