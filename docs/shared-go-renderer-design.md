# Octo Card 同源 Go/WASM Template Renderer 设计

> 状态：Proposal  
> 日期：2026-07-23  
> 适用范围：`octo-card-forge`、`octo-server` 以及 Card Package 发布链路
> 实现状态：尚未落地；当前 Forge 仍使用 TypeScript `adaptivecards-templating`，Server
> 仍使用现有 Go Builder。本文件描述目标方案，不描述当前已上线能力。

本文中的 **Template Renderer** 指“Template + Data → Adaptive Card JSON”。它不同于
[`render-profile-integration-rollout.md`](./render-profile-integration-rollout.md) 中把
“Adaptive Card JSON → DOM”交给 Adaptive Cards SDK 的 **Web Renderer**。总体边界见
[`architecture-design.md`](./architecture-design.md)。

## 1. 结论

Octo Card 使用一份 Go Renderer 源码提供两种构建产物：

- `octo-server` 链接原生 Go Library，在进程内完成生产渲染；
- Card Forge 加载由同一份源码编译出的 WASM，在 Preview 中完成设计态渲染。

Card Template 也只维护一份。Forge 负责 Template、ViewModel Schema、Samples、
Render Profile 与视觉验收；Server 负责领域数据映射、Action/Input 运行时绑定、metadata、
最终安全校验、发送、回调和更新。

```text
                         同一份 Go Renderer 源码
                        ┌──────────┴──────────┐
                        │                     │
                 Native Go Library       WASM Artifact
                        │                     │
Forge Template Bundle ──┼──▶ octo-server     └──▶ Forge Preview
                        │       │                    │
                        │       ├─ 补 Action         └─ Mock Runtime Binding
                        │       ├─ 注入 metadata
                        │       ├─ 最终校验
                        │       └─ 发送/更新
                        │
                        └─ Template + ViewModel → Adaptive Card UI JSON
```

不采用生产 HTTP Render Service，也不让生产 Go 进程承载 JS VM 或 WASM Runtime。
WASM 只服务于 Forge Preview，因此不会进入生产消息热路径。

## 2. 为什么选择这个方向

当前 Forge 的 `src/compiler.ts` 使用 `adaptivecards-templating` 展开 Template，后端的
Go Template 则独立构建同一张卡片的 UI。两套实现会产生布局、条件、字段和版本漂移。

直接让后端调用 Forge HTTP Render API 会增加网络依赖、SLA、超时、降级和容量成本；
把现有 JavaScript 引擎放进 WASM 后交给 Go 调用，又会在生产热路径中引入 JS Engine、
JSON 跨边界复制、实例池和额外内存开销。

同源 Go/WASM 方案同时满足：

1. 生产渲染是原生 Go 调用，无网络和虚拟机依赖；
2. Forge 与 Server 使用相同的模板语义和 Renderer 实现；
3. Template 仍然是可评审、可版本化的 JSON 制品；
4. Action、callback 和安全边界继续由 Server 掌控；
5. 迁移可以逐卡进行，旧 Go Builder 可作为灰度回退路径。

## 3. 职责边界

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Card Forge | Template、ViewModel Schema、Samples、Mock Runtime Binding、Preview、Profile/视觉校验、Bundle 发布 | 业务 Action ID、callback payload、权限、最终输入校验 |
| Shared Renderer | 把 Template + ViewModel + Runtime Binding 确定性地展开为 Adaptive Card JSON | 领域模型查询、业务状态判断、消息发送、权限 |
| octo-server | 领域数据到 ViewModel、真实 Runtime Binding、metadata、`cardmsg.Validate`、发送、回调、更新、fallback | 重写 Card UI 布局 |
| octo-web | 使用 Adaptive Cards SDK 和 Render Profile 渲染最终 JSON、执行通用交互 | 理解 Forge Template 或业务领域模型 |

这里的 Runtime Binding 是后端拥有、但 Template 渲染时需要的运行时数据，例如：

- `Action.Submit.id`；
- `Action.Submit.data`；
- Input 的业务 ID；
- 与 callback 路由相关的 owner/action type；
- 只在 Preview 中使用的假 Action。

Runtime Binding 不属于 ViewModel Schema，也不由 Forge 定义业务语义。

## 4. Renderer 工程形态

目标工程建议独立为 `octo-card-renderer`。PoC 阶段也可以先放在本仓库
`renderer-go/`，接口稳定后再拆分。

```text
octo-card-renderer/
├── renderer/
│   ├── compile.go       # Template JSON → 不可变 Program
│   ├── program.go       # AST/Program 类型
│   ├── render.go        # Program + 输入 → Card JSON
│   ├── expression.go    # 受限表达式解析与求值
│   ├── scope.go         # $root/$runtime/$data 作用域
│   ├── limits.go        # 资源限制
│   └── errors.go        # 稳定错误码
├── cmd/
│   ├── renderer-cli/    # 本地、CI、诊断使用
│   └── renderer-wasm/   # Forge Preview adapter
├── testdata/
│   ├── templates/
│   ├── samples/
│   └── goldens/
├── go.mod
└── package.json         # WASM npm 制品
```

同一个 Git tag 同时标识：

- Go module 版本；
- WASM/npm 包版本；
- Renderer 支持的 Template Engine major。

## 5. Go Core API

### 5.1 Compile

```go
package cardrenderer

type Limits struct {
	MaxTemplateBytes  int
	MaxTemplateNodes  int
	MaxExpressionSize int
	MaxLoopItems      int
	MaxDepth          int
	MaxOutputBytes    int
}

type CompileOptions struct {
	EngineVersion string // 例：octo-template@1
	Limits        Limits
}

// Program 在 Compile 后不可变，可被多个 goroutine 并发 Render。
type Program struct {
	// unexported compiled AST
}

func Compile(templateJSON []byte, options CompileOptions) (*Program, error)
```

Compile 只发生在 Registry 注册或 Forge 切换 Template 时。它负责：

1. 解析 JSON；
2. 校验 Template Engine 语法；
3. 把表达式编译成 AST；
4. 校验节点、深度、表达式和循环上限；
5. 返回不可变 Program。

### 5.2 Render

```go
type RenderInput struct {
	Model   json.RawMessage // Forge ViewModel
	Runtime json.RawMessage // Server Runtime Binding / Forge Preview Mock
}

type RenderResult struct {
	Card json.RawMessage
}

func (p *Program) Render(input RenderInput) (RenderResult, error)
```

Render 不读取磁盘、环境变量或网络，不允许动态加载 Template。相同 Program 和输入必须
得到相同 JSON 语义结果。

## 6. Template Engine v1

Template Engine 是构建期格式，不是新的消息协议。线上传输的结果仍然是标准
Adaptive Card JSON。

第一版只支持当前 Card Package 实际需要的受限语法。

### 6.1 字段读取与字符串插值

```json
{
  "text": "${document.title}",
  "altText": "申请人：${requester.name}"
}
```

字段查找支持对象属性、当前 `$data` scope、`$root` 和 `$runtime`。

### 6.2 类型保持

完整表达式必须保持原始 JSON 类型：

```json
{ "isMultiSelect": "${isMultiSelect}" }
```

当输入为 `true` 时输出 Boolean `true`，不能输出字符串 `"true"`。表达式与普通文本
混合时统一输出字符串。

### 6.3 条件

```json
{
  "text": "${if(equals(state, 'approved'), '已允许', '已拒绝')}"
}
```

v1 函数白名单：

```text
equals
if
and
or
not
empty
coalesce
```

函数必须是确定性的，不允许时间、随机数、IO 或动态函数调用。

### 6.4 `$when`

```json
{
  "$when": "${equals(state, 'rejected')}",
  "type": "TextBlock",
  "text": "${decision.rejectionReason}"
}
```

`$when=false` 时从父数组或对象中删除整个节点，不输出 `null`。

### 6.5 `$data`

```json
{
  "$data": "${options}",
  "title": "${label}",
  "value": "${value}"
}
```

`$data` 只接受数组，并为每一项建立当前 scope。循环次数受 `MaxLoopItems` 限制。

### 6.6 缺失字段

缺失字段默认返回可定位错误，不能静默生成 `undefined`：

```text
code: render.missing_value
path: $.body[3].text
expression: document.title
```

可选字段必须显式使用 `coalesce`，或在 Template 中使用 `$when` 排除节点。

## 7. Runtime Binding

Renderer 的根展示数据保持现有写法：

```json
{ "text": "${document.title}" }
```

后端专属内容通过 `$runtime` 访问：

```json
{
  "type": "ActionSet",
  "actions": "${$runtime.actions.footer}"
}
```

Forge Preview 可以传入：

```json
{
  "actions": {
    "footer": [
      {
        "type": "Action.Submit",
        "title": "允许",
        "id": "preview-approve"
      }
    ]
  }
}
```

Server 传入真实 Action：

```json
{
  "actions": {
    "footer": [
      {
        "type": "Action.Submit",
        "title": "允许",
        "id": "docs-access-approve",
        "data": {
          "owner": "docs",
          "action_type": "access_request.decision"
        }
      }
    ]
  }
}
```

顶层 actions 可以在 Render 后由 Server 直接追加。只有需要精确放进 Body 内部的
`ActionSet`、Input ID 或其它运行时值才使用 `$runtime`。

## 8. Forge 集成

### 8.1 WASM Adapter

`cmd/renderer-wasm` 只负责把 Go API 暴露给 JavaScript：

```text
compile(templateJSON, options) → handle
render(handle, modelJSON, runtimeJSON) → resultJSON
dispose(handle)
```

Forge 侧封装成 TypeScript API：

```ts
interface Renderer {
  compile(template: JsonObject, options: CompileOptions): Promise<TemplateHandle>;
  render(
    handle: TemplateHandle,
    model: JsonObject,
    runtime: JsonObject
  ): Promise<RenderResult>;
  dispose(handle: TemplateHandle): void;
}
```

行为要求：

- WASM 在 Catalog 启动时异步加载；
- Card/View 切换时 Compile 一次；
- Mock 编辑时只 Render；
- handle 以 Template checksum 缓存；
- 编辑输入使用 debounce；
- View 切换或页面卸载时释放 handle；
- WASM 初始化失败时显示明确错误，不静默切换另一套语义。

标准 Go WASM 先满足正确性。WASM 只运行在 Preview，首包大小和初始化开销不影响生产；
若后续确实影响体验，再评估 TinyGo。

### 8.2 当前 TypeScript Renderer 的迁移

现有 `src/compiler.ts` 在迁移期保留为参考实现：

```text
adaptivecards-templating 输出
             vs
Go Renderer WASM 输出
```

所有现有 Samples canonical JSON diff 通过后，Preview、CLI、check 和 handoff 默认切换到
WASM Renderer。旧实现只保留短期诊断开关，最终删除，避免长期双引擎。

### 8.3 Preview Mock

`samples/*.json` 只表示 ViewModel 示例。需要展示 Action/Input 时，使用独立的
`preview-runtime/*.json`，避免把假的 Action ID 混进 ViewModel Schema。

## 9. octo-server 集成

### 9.1 Registry 注册

```text
Registry.Register
  → 验证 Bundle checksum 和 Template Engine major
  → 加载每个 view 的 Template
  → cardrenderer.Compile
  → 缓存 view → Program
  → 使用 samples + 测试 Runtime Binding 自检
  → Freeze
```

建议 Entry 形态：

```go
type entry struct {
	meta     TemplateMeta
	programs map[ViewKey]*cardrenderer.Program
	adapter  BusinessAdapter
}
```

### 9.2 业务 Adapter

业务 Go 代码不再创建 `TextBlock`、`ColumnSet` 等 UI 节点，只负责模型和运行时绑定：

```go
type BusinessAdapter interface {
	BuildModel(
		ctx context.Context,
		state State,
		fields json.RawMessage,
		env BuildEnv,
	) (json.RawMessage, error)

	BuildRuntime(
		ctx context.Context,
		state State,
		fields json.RawMessage,
		env BuildEnv,
	) (json.RawMessage, error)

	FallbackText(
		state State,
		fields json.RawMessage,
		lang string,
	) (string, error)
}
```

名称可以在后端 RFC 中调整，关键是把“构建 UI”从业务 Adapter 中移除。

### 9.3 Render 热路径

```text
Registry.Render
  → Lookup exact id@version
  → Schema 校验 fields
  → state 映射 view
  → BusinessAdapter.BuildModel
  → BusinessAdapter.BuildRuntime
  → Program.Render（原生 Go）
  → 注入 metadata/render_profile
  → cardmsg.Validate
  → type-17 envelope
```

热路径没有磁盘读取、Template 解析、HTTP、Node、JS VM 或 WASM Runtime。

## 10. Bundle 与版本

目标 Card Bundle：

```text
docs.access-request@0.4.0/
├── manifest.json
├── contract/
│   └── view-model.schema.json
├── templates/
│   ├── pending.template.json
│   └── result.template.json
├── samples/
│   ├── pending.json
│   ├── approved.json
│   └── rejected.json
├── preview-runtime/
│   └── pending.json
├── goldens/
│   ├── pending.card.json
│   ├── approved.card.json
│   └── rejected.card.json
└── checksums.json
```

Manifest 增加：

```json
{
  "templateEngine": "octo-template@1",
  "rendererVersion": "0.1.0",
  "renderProfileCompatibility": "octo-chat/v1"
}
```

版本规则：

- `templateEngine` major 决定语法兼容边界；
- `rendererVersion` 记录产生/验证 Bundle 的精确 Renderer；
- Card Version 仍决定具体 Template 发布版本；
- Server 必须按精确 `id@version` 加载，生产不使用 `latest`；
- Bundle 发布后不可原地修改，Server 导入时验证 checksum。

## 11. 错误模型

Compile/Render 错误必须包含稳定 code 与 JSON path：

```go
type Error struct {
	Code       string
	Path       string
	Expression string
	Message    string
}
```

建议错误码：

```text
compile.invalid_json
compile.unsupported_engine
compile.unknown_directive
compile.unknown_function
compile.expression_too_large
compile.limit_exceeded
render.invalid_model
render.invalid_runtime
render.missing_value
render.type_mismatch
render.loop_limit
render.output_limit
```

错误不得包含敏感业务数据全文。

## 12. 性能与安全要求

### 12.1 性能

- Template 只在 Register/切换 View 时 Compile；
- Program 不可变、无锁并发；
- Render 不做 IO；
- 输出 Buffer 和临时上下文允许用 `sync.Pool` 复用；
- 首先以 `encoding/json` 保证正确性，基准证明瓶颈后再替换；
- 建立与当前手写 Go Builder 的相对性能门禁，不先拍绝对 SLA。

最低 Benchmark 集合：

```text
BenchmarkCompilePending
BenchmarkRenderPending
BenchmarkRenderResult
BenchmarkRenderArray10
BenchmarkRenderConcurrent
```

记录：ns/op、B/op、allocs/op、输出大小和并发吞吐。

### 12.2 安全

- 只允许白名单表达式和指令；
- 禁止 eval、反射式函数调用、网络、文件、环境变量、时间和随机数；
- Compile 和 Render 都执行节点、深度、循环和输出大小限制；
- 所有外部 URL、组件和 Action 的最终合法性仍由 `cardmsg.Validate` 判定；
- Renderer 不是安全校验终点，Server 始终拥有最终拒绝权。

## 13. 测试策略

### 13.1 Renderer 单测

- 每条表达式语义；
- 类型保持；
- `$when` 删除；
- `$data` scope；
- `$runtime` 隔离；
- 缺失字段；
- 各项资源限制；
- 并发 Render 与 race test；
- malformed JSON/表达式 fuzz test。

### 13.2 Native/WASM 一致性

相同 Template、Model 和 Runtime 必须得到 canonical JSON 等价结果：

```text
Native Go Result == WASM Result == Golden
```

### 13.3 跨仓一致性

Forge CI：

- 全部 Samples 通过 WASM Renderer；
- 输出与 Goldens 一致；
- Preview 截图回归通过。

Server CI：

- Bundle checksum 正确；
- 全部 Template 可 Compile；
- Samples 可 Render；
- 去除 Server metadata 后与 Forge Goldens 等价；
- 最终 `cardmsg.Validate` 通过。

## 14. 迁移计划

### Phase 0：PoC 与语义冻结

- 建立 Go Renderer 骨架；
- 支持 property、interpolation、`if/equals`、`$when`、`$data`；
- 跑通 `docs.access-request` Samples；
- 建立与现有 TypeScript 输出的 canonical diff；
- 建立 Go Benchmark。

退出条件：现有目标 Card 的输出一致，性能数据可接受，Template Engine v1 语义成文。

### Phase 1：Forge 双渲染

- 发布首个 WASM 制品；
- Catalog 同时运行旧 TypeScript 和 WASM Renderer；
- 页面展示结构 diff；
- check/handoff 增加 WASM 验证但暂不替换默认输出。

退出条件：全部 Samples 连续通过，Native/WASM/TypeScript 三方等价。

### Phase 2：Forge 切换

- Preview、CLI、check、handoff 默认使用 WASM；
- `samples` 与 `preview-runtime` 分离；
- 旧 TypeScript Renderer 仅保留临时诊断开关。

退出条件：Forge 内部不再依赖第二套生产语义。

### Phase 3：Server Shadow

- Registry 加载 Forge Template 并 Compile；
- 新 Renderer 与旧 Go Builder 同时生成；
- 生产仍发送旧结果，只记录有界 diff 指标；
- 比较性能、内存和错误率。

退出条件：目标 Card 无未解释 diff，性能达到既定门禁。

### Phase 4：逐卡灰度

- 先迁纯展示卡；
- 使用 feature gate 在新 Renderer/旧 Builder 间切换；
- 再迁带 Runtime Binding 的交互卡；
- 稳定后删除该卡的手写 UI Builder。

## 15. 验收标准

方案完成时必须满足：

1. Server 热路径使用原生 Go Renderer，不调用 HTTP/Node/WASM；
2. Forge Preview 使用同源 WASM Renderer；
3. 一张 Card 的 UI Template 只维护一份；
4. Native/WASM 对所有 Samples 输出 canonical JSON 等价；
5. 后端 Action/metadata 可独立注入，不进入 Forge ViewModel Schema；
6. Registry 启动期预编译并缓存 Program；
7. 资源限制、稳定错误码、fuzz/race/benchmark 门禁落地；
8. 每张迁移卡保留可控回滚路径，直至灰度完成。

## 16. 待共同确认

以下问题需要 Forge 与 Server 维护者在实现前冻结：

1. Renderer 独立仓库，还是先作为 Forge 子 Go module；
2. Template Engine v1 的最终函数白名单；
3. `$runtime` 的命名、结构和允许注入的位置；
4. Bundle 中保存原始 Template、编译 IR，还是两者都保存；
5. Native Go Builder 基线下允许的性能回退比例；
6. 第一张灰度卡及 feature gate 归属。
