# Render Profile 模块

> 状态：已有源码实现，待迁入 workspace package，并补充版本化 Component Catalog
>
> 目标代码：`packages/profile-octo-chat`

## 定位

定义 Forge Preview 与 `octo-web` 共同使用的视觉和能力标准。

## 目标职责

- CSS、Theme、HostConfig；
- Capability Manifest；
- Utility Token；
- Component Catalog、Component Specimen 和组合 Pattern；
- validate/build/pack；
- npm 发布和兼容区间。

## 不负责

Card Source、业务组件选择、Runtime 状态和按 Card 注入补丁。

## 完成标准

- Profile 可独立安装和验证；
- Forge Web 与 `octo-web` 消费同一 npm Artifact；
- Release Card 固定精确 Profile 版本；
- 历史 Profile 由制品库保存，不在源码树复制版本目录。
- Component Preview 的 specimen 内容只由 Profile 提供，页面不维护第二份组件样例。
