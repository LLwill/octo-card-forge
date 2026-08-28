# Octo Card Forge

面向开发者和外部 Agent 的 Adaptive Cards 设计、校验、预览与制品工具链。

Forge 负责 Card Contract、编译 Core、Workspace Loader、CLI、Render Profile、Artifact 和
Forge Web。正式 Card Source、评审、Release 与 Catalog Snapshot 由独立的
[`octo-card-catalog`](https://github.com/LLwill/octo-card-catalog) 仓库负责。

Forge **不内置、不扫描业务卡源码**。本地 Card 开发必须显式传入 Card Package 目录；
Published Server 只消费 Catalog Snapshot、Artifact 和 Handoff。

## 快速开始

```bash
pnpm install
pnpm cli init docs.share-notification \
  --name "文档分享通知" \
  --out ./docs.share-notification
pnpm cli check --card ./docs.share-notification
pnpm cli inspect --card ./docs.share-notification --sample default
pnpm cli render --card ./docs.share-notification --sample default
pnpm cli dev --card ./docs.share-notification
```

Workspace Web 默认位于 `http://127.0.0.1:4318/forge/`。它只展示通过 `--card` 绑定的
Card Package，并提供样例预览、自由 JSON 预览、数据契约和交付包导出。

## 两种运行模式

### Published

不传 `cardRoot` 时，Server 进入 Published 模式：

- `/api/v1/cards` 读取 Catalog Snapshot。
- Card 详情读取不可变 Artifact。
- Server 交付内容读取 Handoff ZIP。
- 不提供本地 Card 源码扫描或模板编译。

```bash
CATALOG_ROOT=/app/catalog \
pnpm start
```

生产环境必须使用 `CATALOG_ROOT`。`CATALOG_SNAPSHOT_URL` 仅保留给本地开发和旧集成测试，
不会作为本地 Bundle 校验失败时的降级路径。

### Workspace

CLI `dev` 必须使用 `--card <dir>`，Server 只加载该目录：

```bash
pnpm cli dev --card ./docs.share-notification --host 127.0.0.1 --port 4318
```

Workspace API 支持源码样例、模板数据编译、数据契约和 Handoff 导出。它用于开发联调，
不是生产消息链路。

## CLI

```text
octo-card presets [--format json]
octo-card init <card-id> --name <name> [--out <dir>] [--preset blank|bot-token|docs-forward]

octo-card discover [query] [--profile octo-chat@latest] [--format json]
octo-card explain utility <token> [--profile octo-chat@latest] [--format json]
octo-card validate --input <card.json> [--wire-profile octo/v1|octo/v2] [--format json]

octo-card lint --card <dir> [--profile-dir <dir> | --profile-package <pkg>] [--format json]
octo-card check --card <dir> [--profile-dir <dir> | --profile-package <pkg>] [--format json]
octo-card inspect --card <dir> [--sample <name>] [--format json]
octo-card contract --card <dir> [--format json]
octo-card render --card <dir> --sample <name>
octo-card render --card <dir> --view <view> --data <file>
octo-card handoff --card <dir> [--output handoff]
octo-card artifact build --card <dir> [--out <file>] [--format json]
octo-card artifact verify <file> [--sha256 <hash>] [--format json]
octo-card verify --card <dir> [--release] [--emit-dir <dir>] [--handoff <dir>]
octo-card dev --card <dir> [--host 127.0.0.1] [--port 4318]

octo-card profile validate <profile@version>
octo-card profile bundle <profile@version> [--output .release]
octo-card profile pack <profile@version> [--output .release]
octo-card snapshot build --input <records.json> --revision <revision> [--channel release|preview]
octo-card snapshot verify <file> [--sha256 <digest>]

octo-card agent init [--target generic] [--workspace <dir>]
octo-card agent doctor [--workspace <dir>]
octo-card agent upgrade --check [--workspace <dir>]
```

## Card Package

Card Package 是独立目录，至少包含：

```text
manifest.json
contract/data.schema.json
templates/*.template.json
samples/*.json
```

Draft 通常使用 `octo-chat@latest`；Release 必须固定具体 Render Profile 版本。CLI 读取
`--card` 指定的目录，不根据 Card ID 在 Forge 仓库中查找源码。

## Agent 工作流

仓库提供 [`octo-design-cards`](skills/octo-design-cards/SKILL.md) Skill。典型的 repo-free
流程如下：

```bash
npm install --save-dev \
  @mlt-org/octo-card-cli \
  @mlt-org/octo-card-profile-octo-chat
npx --no-install octo-card agent init --target generic
npx --no-install octo-card init bot.token-view \
  --name "Bot Token 查看" \
  --out ./bot.token-view \
  --preset bot-token
npx --no-install octo-card verify \
  --card ./bot.token-view \
  --emit-dir compiled \
  --handoff handoff \
  --format json
```

## 质量检查

```bash
pnpm workspace:check
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:repo-free-agent
pnpm smoke:published-consumer
```

Forge 自身的通用测试卡位于 `tests/fixtures/cards/`，不代表正式 Catalog 内容。

## 部署

```bash
pnpm package:deploy
```

生成的 `.release/octo-card-forge-deploy-<version>.tgz` 包含 Server、Forge Web、当前
Render Profile、Skill manifest 和生产依赖锁文件，不包含业务 Card Source。

运行环境变量：

- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `4318`
- `BASE_PATH`：可选反向代理前缀
- `CATALOG_ROOT`：生产 Catalog Bundle 的只读挂载目录
- `CATALOG_IMAGE_DIGEST`：当前 Catalog 数据镜像摘要，用于运行诊断
- `CATALOG_REVISION`：部署清单声明的 Catalog 完整 Git SHA；必须与 Bundle 一致
- `FORGE_REVISION`：当前 Forge 完整 Git SHA，用于运行诊断
- `CATALOG_SNAPSHOT_URL`：仅用于本地开发和兼容测试的远端 Snapshot 地址

构建 Catalog Bundle：

```bash
pnpm catalog:bundle -- \
  --snapshot <immutable-snapshot-url> \
  --output .release/catalog \
  --catalog-revision <catalog-commit-sha> \
  --forge-revision <forge-commit-sha> \
  --builder-image-digest sha256:<builder-digest>
```

构建过程会下载并校验 Artifact、Handoff 和固定版本的 Profile 资源，输出
`release.json`、`bundle-manifest.json` 及逐文件 SHA-256。

Forge 标签流水线构建应用镜像；Catalog Trigger Pipeline 从 `deploy-files` 读取当前生产 Forge
镜像 digest，并用它构建 Catalog 数据镜像。两条流水线都通过部署 MR 更新 `deploy-files`，等待
MR 合并和人工 ArgoCD 同步，并在部署后检查 `/readyz` 与 `/api/v1/runtime`。

GitLab 只需长期配置受保护变量 `CATALOG_DATA_BASE_IMAGE`，并使用 `@sha256:` 固定。首次切换到
双镜像部署时，在 GitLab `main` 手动运行 Pipeline，传入 `PIPELINE_MODE=bootstrap` 和一个已有
Snapshot Release 的完整 `CATALOG_REVISION`。Bootstrap 会连续构建 Forge 与 Catalog 镜像，并用
两个 digest 创建同一个 `deploy-files` MR。首次部署完成后，Catalog 发布自动传递 revision，Forge
发布自动继承生产 Catalog digest，不再需要手工维护 Builder 镜像变量。Registry 必须保留所有仍可能
用于生产或回滚的 Forge/Catalog digest。

## 文档

- [`docs/architecture-design.md`](docs/architecture-design.md)：总体架构与仓库边界
- [`docs/refactor-roadmap.md`](docs/refactor-roadmap.md)：分阶段重构路线
- [`docs/forge-web-server-refactor-plan.md`](docs/forge-web-server-refactor-plan.md)：Web/Server 重构方案
- [`docs/catalog-bundle-deployment-and-card-contribution.md`](docs/catalog-bundle-deployment-and-card-contribution.md)：Catalog 数据镜像部署与 Card 贡献流程
- [`docs/repo-free-card-authoring-implementation.md`](docs/repo-free-card-authoring-implementation.md)：Repo-free Card 开发方案
- [`docs/render-profile-integration-rollout.md`](docs/render-profile-integration-rollout.md)：Render Profile 接入与发布
