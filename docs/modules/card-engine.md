# Card Engine 模块

> 状态：待细化
>
> 目标代码：`packages/core`

## 定位

Card Engine 是唯一的纯编译、校验、Inspection 和能力分析实现。

## 当前实现

逻辑分散在 `src/compiler.ts`、`src/validate.ts`、`src/inspect.ts`、
`src/component-baseline.ts` 和部分 Registry 代码中。

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

## 完成标准

- 纯函数边界可独立测试；
- old/new Golden 无未解释差异；
- Validator 只有一份权威实现；
- 不再通过全局 Registry 获取 Card。
