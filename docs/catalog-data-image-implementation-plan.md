# Catalog 数据镜像实施计划

> 状态：Ready for implementation
>
> 日期：2026-08-27
>
> 前置基线：Forge PR #40 与 Catalog PR #4 已合并
>
> 关联决策：[`ADR 0004`](./adr/0004-catalog-data-image-deployment.md)

## 1. 目的

本文将 Catalog 数据镜像方案拆成可以独立开发、测试、评审和回滚的工程任务。

最终结果：

```text
Card GitHub Release
  → Forge GitLab Catalog Pipeline
  → Catalog bundle
  → octo-card-catalog@sha256
  → deploy-files MR
  → 人工 argocd_sync
  → initContainer 准备本地 Catalog
  → Forge 只读消费
```

正式 Registry：

```text
tbj7-xtiao-tcr1.tencentcloudcr.com/dmwork/octo-card-catalog
```

## 2. 实施原则

1. 生产只消费已经发布的 Card Release，不把 Card 根目录草稿直接装入数据镜像。
2. 所有输入使用完整 Git SHA、精确版本或 OCI digest，不使用 `latest`。
3. Forge GitLab CI 负责构建和推送 Catalog 数据镜像。
4. Catalog GitHub Workflow 只触发 Pipeline，并传递不可变输入。
5. Forge 与 Catalog 镜像独立发布，`deploy-files` 保存当前生效组合。
6. 第一阶段保留人工 `argocd_sync`。
7. 迁移期间允许远端 Snapshot 与本地 Catalog 并存；完成生产验收后删除远端路径。

## 3. 目标运行结构

```text
Pod
├── initContainer: catalog-seed
│   ├── image: octo-card-catalog@sha256:<digest>
│   ├── source: /catalog
│   └── target: /catalog-data
├── container: forge
│   ├── image: octo-card-forge@sha256:<digest>
│   ├── CATALOG_ROOT=/app/catalog
│   └── mount /app/catalog readOnly
└── volume: catalog-data
    └── emptyDir
```

Catalog 更新会创建新 ReplicaSet。旧 Pod 在新 Pod 完成数据复制、启动校验并通过 `/readyz` 后退出。

## 4. 发布输入与输出

### 4.1 Forge GitLab Pipeline 输入

| 变量 | 必填 | 规则 |
| --- | --- | --- |
| `PIPELINE_MODE` | 是 | 固定为 `catalog` |
| `CATALOG_REPOSITORY` | 是 | 允许列表内的 HTTPS 或 SSH clone URL |
| `CATALOG_REVISION` | 是 | 40 位小写 Git commit SHA |
| `CATALOG_RELEASE` | 是 | 可审计的 Catalog Release 标识 |
| `CATALOG_GITHUB_REPOSITORY` | 是 | `owner/repository`，用于读取 Card Releases |
| `CATALOG_DEPLOY` | 否 | 默认 `false`；仅决定是否创建部署 MR，不控制镜像构建 |

这些变量必须写入 Pipeline 摘要和最终 `release.json`。Token、密码和临时目录不得写入。

### 4.2 Catalog bundle 输出

```text
.release/catalog/
  release.json
  catalog-snapshot.v1.json
  catalog-snapshot.v1.sha256
  artifacts/<card-id>/<version>.artifact.json
  handoffs/<card-id>/<version>.handoff.zip
  handoff-indexes/<card-id>/<version>.json
  handoff-files/<card-id>/<version>/**
  profiles/<profile-id>/<version>/**
```

### 4.3 数据镜像输出

```text
tbj7-xtiao-tcr1.tencentcloudcr.com/dmwork/octo-card-catalog:<catalog-release>
tbj7-xtiao-tcr1.tencentcloudcr.com/dmwork/octo-card-catalog@sha256:<digest>
```

Tag 用于人工识别，Deployment 只能使用 digest。

## 5. 兼容清单

### 5.1 Forge 能力源文件

新增：

```text
compatibility/forge-runtime.v1.json
```

```json
{
  "schemaVersion": 1,
  "supports": {
    "catalogSnapshot": [1],
    "cardArtifact": [1],
    "handoffLayout": [1],
    "profileBundle": [1],
    "features": [
      "handoff-index-v1",
      "local-profile-assets-v1"
    ]
  }
}
```

该文件只在 Forge 实际增加或删除协议能力时修改，不跟随普通 Patch 版本机械更新。

Forge 构建产物包含：

```text
/app/forge-runtime.json
```

它由能力源文件加上当前 `package.json` 版本和 Git SHA 生成。

### 5.2 Catalog 要求清单

Catalog bundle 构建器自动生成 `/catalog/release.json`：

```json
{
  "formatVersion": 1,
  "catalogRevision": "<catalog-sha>",
  "builtByForgeRevision": "<forge-sha>",
  "snapshotSha256": "<sha256>",
  "requires": {
    "catalogSnapshot": 1,
    "cardArtifact": [1],
    "handoffLayout": 1,
    "profileBundle": 1,
    "features": ["handoff-index-v1", "local-profile-assets-v1"]
  },
  "builtWith": {
    "forgeCli": "0.2.4"
  },
  "cards": 3,
  "versions": 6
}
```

### 5.3 判断规则

Catalog `requires` 必须是 Forge `supports` 的子集。检查执行两次：

1. `deploy-files` MR 创建前执行，失败时不允许更新部署；
2. Forge 启动时执行，失败时 `/readyz` 返回非 200。

`builtWith.forgeCli` 只用于审计，不作为兼容门禁。

## 6. PR 1：Bundle 契约与构建器

### 6.1 范围

在 Forge 仓库实现可重复调用的 Catalog bundle 构建和验证能力，不修改生产部署。

建议新增或修改：

```text
compatibility/forge-runtime.v1.json
packages/card-spec/src/catalog-release-v1.ts
packages/card-spec/src/index.ts
packages/cli/src/catalog-bundle.ts
packages/cli/src/cli.ts
scripts/build-forge-runtime-manifest.mjs
tests/catalog-bundle.test.ts
tests/catalog-compatibility.test.ts
```

### 6.2 CLI 接口

```bash
octo-card catalog bundle build \
  --records <catalog-release-records.json> \
  --catalog-revision <full-sha> \
  --out <directory> \
  --format json

octo-card catalog bundle verify <directory> --format json

octo-card catalog compatibility \
  --forge <forge-runtime.json> \
  --catalog <release.json> \
  --format json
```

`bundle build` 执行：

1. 读取 Catalog Release records；
2. 下载每个不可变 Artifact 和 Handoff；
3. 校验 URL、HTTP 状态、SHA256、Card ID 和版本；
4. 将 Artifact/Handoff 写入固定目录；
5. 校验 Handoff ZIP 路径、文件数量、压缩和解压大小；
6. 生成 Handoff index，并提取允许预览的文本文件；
7. 收集所有精确 Render Profile 版本的静态资源；
8. 生成使用本地资源引用的部署 Snapshot；
9. 生成 Snapshot SHA256 和 `release.json`；
10. 对整个目录执行 bundle verify。

### 6.3 网络和文件安全

实现统一下载函数：

```ts
fetchVerified({
  url,
  expectedSha256,
  allowedOrigins,
  timeoutMs,
  maxBytes,
})
```

必须支持：

- HTTPS only；
- Host allowlist；
- `AbortSignal.timeout()`；
- 流式累计大小，超过限制立即中断；
- 下载完成后 SHA256 校验；
- 临时文件写入完成后原子 rename；
- 不在错误信息中打印 Authorization header。

ZIP 限制采用架构文档中的默认值，并拒绝绝对路径、`..`、符号链接和重复文件名。

### 6.4 测试

- 同一输入重复构建的所有文件摘要一致；
- Artifact/Handoff 摘要错误时失败；
- Card ID 或版本与 record 不一致时失败；
- 非允许域名、HTTP URL、重定向到非允许域名时失败；
- 缺失 Profile 资源时失败；
- ZIP traversal、ZIP bomb、文件数和大小超限时失败；
- Forge supports 不满足 Catalog requires 时失败；
- bundle 中不包含 Token、绝对工作区路径、`.git` 或 Card Source。

### 6.5 完成条件

```bash
pnpm typecheck
pnpm test
pnpm build
octo-card catalog bundle build ...
octo-card catalog bundle verify ...
```

全部通过，并能使用 Catalog 当前三个 Card Release 生成完整 bundle。

## 7. PR 2：Forge GitLab Catalog Pipeline

### 7.1 范围

在 Forge 项目的 GitLab CI 中增加 Catalog 专用 Pipeline，不修改现有 Forge Tag 发布行为。

建议新增或修改：

```text
.gitlab-ci.yml
.gitlab/catalog-image.yml
Dockerfile.catalog
scripts/clone-catalog.mjs
scripts/render-deploy-catalog-update.mjs
```

是否使用独立 include 文件以实际 CI 可维护性为准；Catalog Job 必须有独立 `rules`，避免普通 Forge
MR 或 Tag Pipeline 意外推送 Catalog 镜像。

### 7.2 Job 拆分

```text
catalog_validate_input
  → catalog_checkout
  → catalog_bundle
  → catalog_package
  → catalog_verify_image
  → catalog_prepare_deploy_mr
```

`catalog_checkout`：

- 校验 Repository 在允许列表；
- 校验 revision 是完整 SHA；
- 使用只读凭证浅克隆并 checkout 精确 SHA；
- 验证 `git rev-parse HEAD` 与输入完全一致。

`catalog_bundle`：

- 从 Catalog 生成 release records；
- 使用 PR 1 的 CLI 构建和验证 bundle；
- 保存 bundle 和摘要为短期 GitLab Artifact。

`catalog_package`：

- 使用 `Dockerfile.catalog`；
- Tag 使用经过规范化的 Catalog Release；
- 推送 TCR；
- 使用 `docker inspect` 获取 RepoDigest；
- 输出 `CATALOG_IMAGE_DIGEST` dotenv Artifact。

`catalog_verify_image`：

- 通过 digest 拉取刚推送的镜像；
- 从镜像读取 `/catalog/release.json`；
- 执行 `catalog bundle verify`；
- 确认镜像不含 `.git`、Source、Token 和临时文件。

### 7.3 Catalog 镜像

Catalog 镜像不运行长期服务，但 initContainer 需要 `sh` 和 `cp`。建议使用与 Forge 相同来源的最小
Alpine 镜像，避免额外供应链：

```dockerfile
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
COPY --chown=10001:10001 catalog /catalog
USER 10001
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["test -f /catalog/release.json"]
```

构建时写入 OCI Labels：

```text
org.opencontainers.image.revision=<catalog-sha>
org.opencontainers.image.version=<catalog-release>
org.octo-card.forge-revision=<forge-sha>
```

### 7.4 `deploy-files` 更新规则

Forge 发布 Pipeline 只能修改 Forge container image。
Catalog 发布 Pipeline 只能修改 `catalog-seed` initContainer image。

不能继续把仓库中的完整模板覆盖到 `deploy-files`，否则两个独立 Pipeline 会互相覆盖 digest。建议使用
结构化 YAML 修改工具按容器名定向更新，并对最终 diff 设置断言：

```text
Catalog MR 只允许改变：
spec.template.spec.initContainers[name=catalog-seed].image
metadata annotations 中的 catalog revision
```

第一阶段复用 `deploy-files` 默认审批规则。Pipeline 创建 MR，但不自动合并，也不自动执行 ArgoCD。

### 7.5 完成条件

- 手工触发 Pipeline，传入 Catalog 主干完整 SHA；
- TCR 中产生可通过 digest 拉取的数据镜像；
- 镜像内容验证通过；
- Pipeline 输出 digest；
- `CATALOG_DEPLOY=false` 时不修改 `deploy-files`；
- `CATALOG_DEPLOY=true` 时创建最小 diff 的部署 MR。

## 8. PR 3：Catalog 触发与贡献治理

### 8.1 范围

在 `octo-card-catalog` 中把正式 Card Release 与 Forge GitLab Catalog Pipeline 连接起来。

建议新增或修改：

```text
.github/workflows/card-release.yml
.github/pull_request_template.md
.github/CODEOWNERS
scripts/validate-version-policy.mjs
README.md
```

### 8.2 触发时机

只有以下条件全部成立才触发 Forge GitLab：

- 所有变化的 `versions/<version>` 已成功创建不可变 Card Release；
- Catalog Snapshot 构建和验证成功；
- Snapshot Release 已创建或验证与现有资产完全一致；
- 当前事件发生在受保护 `main`；
- Catalog commit SHA 为 40 位完整 SHA。

GitHub 保存最小权限的 GitLab Pipeline Trigger Token。触发请求只发送 Repository、Revision、Release 和
是否准备部署 MR，不发送 TCR 或 `deploy-files` 凭证。

### 8.3 贡献 Gate

PR 必须满足：

- Card ID 与目录一致；
- 新版本目录与 Manifest SemVer 一致；
- 已发布版本目录字节未改变；
- Patch/Minor/Major 与契约变化匹配；
- Sample 覆盖所有声明视图；
- Golden 更新有可见差异说明；
- 不包含凭证、真实用户数据或生产 Payload；
- `card:new` 与 `card:breaking` 获得 Contract Owner Review；
- 普通内容变化获得 Namespace Owner Review。

### 8.4 发布后的状态

```text
PR merge
  ≠ production deployed

Card Release success
  ≠ production deployed

Catalog image pushed
  ≠ production deployed

deploy-files MR merged + manual argocd_sync + smoke pass
  = production deployed
```

每一阶段都需要提供上一阶段的链接或 revision，确保能够从线上镜像反查到 Catalog commit、Card PR 和
Card Release。

### 8.5 完成条件

- 一张测试 Card 的新版本可从 PR Preview 走到 Card Release；
- GitHub 自动触发 Forge GitLab Catalog Pipeline；
- 重复触发同一 commit 不覆盖已有不可变 Card Release；
- GitLab Pipeline 能识别重复 bundle 并安全复用或产生相同内容摘要；
- 失败不会创建生产部署 MR。

## 9. PR 4：Forge 本地 Catalog Runtime

### 9.1 范围

Forge Server 从挂载目录读取数据，同时保留远端 Snapshot 作为迁移期兼容路径。

建议新增或修改：

```text
packages/cli/src/server/catalog-store.ts
packages/cli/src/server/local-catalog.ts
packages/cli/src/server/published-catalog.ts
packages/cli/src/server/types.ts
packages/cli/src/server/runtime.ts
packages/cli/src/server/legacy-api.ts
packages/cli/src/server.ts
scripts/start-service.mjs
apps/forge-web/src/data.ts
tests/server.test.ts
tests/forge-web.test.ts
```

### 9.2 Store 抽象

```ts
interface CatalogStore {
  initialize(): Promise<CatalogRuntimeState>;
  getSnapshot(): Promise<CatalogSnapshotV1>;
  getArtifact(reference: string): Promise<CardArtifactV1>;
  getHandoff(reference: string): Promise<Buffer>;
  getHandoffContents(reference: string): Promise<HandoffIndex>;
  getHandoffFile(reference: string, path: string): Promise<Buffer>;
  getProfileAsset(reference: string, asset: string): Promise<Buffer>;
}
```

实现：

- `LocalCatalogStore`：生产目标，从 `CATALOG_ROOT` 读取；
- `RemoteCatalogStore`：迁移兼容，仅在未配置 `CATALOG_ROOT` 时使用；
- Workspace 模式继续使用显式 `cardRoot`，不经过 Catalog Store。

### 9.3 启动与健康检查

优先级：

```text
cardRoot       → Workspace mode
CATALOG_ROOT   → Local Published mode
Snapshot URL   → Transitional Remote Published mode
都没有         → 启动失败
```

`startServer()` 必须在 listen 前执行 `store.initialize()`。初始化校验：

- `release.json`；
- Forge/Catalog 能力兼容；
- Snapshot SHA256；
- Snapshot Schema；
- Snapshot 中所有本地资源路径位于 `CATALOG_ROOT`；
- Card reference 唯一。

端点：

- `/healthz`：进程存活；
- `/readyz`：Catalog 初始化完成；
- `/api/v1/runtime`：返回 Forge/Catalog revision、digest、数量和模式。

### 9.4 本地资源读取

- Artifact 读取后继续执行 canonical SHA256 与身份校验；
- Handoff 下载直接读取本地 ZIP；
- Handoff 列表读取构建期生成的 index；
- 单文件预览读取构建期提取的安全目录，不在请求期间解压 ZIP；
- Profile 和 Adaptive Cards 静态资源通过 Forge 同源 API 提供；
- Forge Web 不再生成 jsDelivr URL。

所有文件访问都必须使用 root containment 检查并拒绝符号链接逃逸。

### 9.5 完成条件

- 使用本地测试 bundle 启动 Published Server；
- Cards、Detail、Preview、Contract、Handoff 全部可用；
- 禁网环境下页面仍能完整渲染；
- 不兼容或损坏 bundle 无法通过 readiness；
- Workspace 模式和 Repo-free CLI 无回归；
- 远端 Snapshot 兼容模式仍通过原有测试。

## 10. PR 5：Kubernetes 与生产切换

### 10.1 Deployment 修改

修改：

```text
manifests/deploy.yaml
.gitlab-ci.yml
README.md
```

增加：

- `catalog-seed` initContainer；
- `catalog-data` emptyDir；
- Forge 容器只读挂载；
- `CATALOG_ROOT=/app/catalog`；
- `/readyz` readinessProbe；
- `maxUnavailable: 0`、`maxSurge: 1`；
- Catalog revision 与 digest annotations。

第一阶段保留人工 `argocd_sync`。

### 10.2 生产切换顺序

1. 推送第一份 Catalog 数据镜像；
2. 部署支持本地 Catalog、但仍保留远端回退的 Forge；
3. 更新 Deployment，加入 initContainer 和 `CATALOG_ROOT`；
4. 执行人工 ArgoCD Sync；
5. Smoke Test 验证本地模式和 Catalog revision；
6. 观察至少一个正常发布周期；
7. 新 PR 删除生产 `CATALOG_SNAPSHOT_URL` 和远端读取实现。

不得在同一次生产变更中同时首次引入本地 Store、initContainer 和删除远端回退。

### 10.3 Smoke Test

```text
GET /healthz
GET /readyz
GET /api/v1/runtime
GET /api/v1/cards
GET /api/v1/cards/<reference>/artifact
GET /api/v1/cards/<reference>/handoff/contents
GET /api/v1/cards/<reference>/handoff/file?path=<known-file>
```

Runtime 必须返回预期 Catalog SHA 和 `mode=published-local` 或等价的明确标识。

## 11. 开发与合并顺序

| 顺序 | 仓库 | PR | 是否可独立合并 |
| --- | --- | --- | --- |
| 1 | Forge | Bundle 契约与构建器 | 是 |
| 2 | Forge | GitLab Catalog Pipeline | 是，不影响生产 |
| 3 | Catalog | Release 后触发 Forge GitLab | 是，默认不自动部署 |
| 4 | Forge | Local Catalog Runtime | 是，保留远端兼容 |
| 5 | Forge/deploy-files | initContainer 与生产切换 | 最后执行 |

每个 PR 都应只承担一类失败面。前四个 PR 不应自动改变生产流量。

## 12. 测试矩阵

| 层级 | 覆盖内容 |
| --- | --- |
| Unit | Schema、兼容集合、路径、安全限制、摘要 |
| Fixture | 最小 Bundle、损坏 Bundle、版本不兼容 Bundle |
| Integration | 当前三个真实 Card Release 组装完整 Bundle |
| Container | Catalog 镜像内容、用户权限、可复制性、无源码凭证 |
| Server | Local Store API、readiness、Profile 静态资源 |
| Deployment | 双 digest、initContainer、RollingUpdate |
| Production Smoke | 列表、预览、契约、Handoff、revision |

## 13. 运维与回滚手册

### Catalog 构建失败

- 不创建部署 MR；
- 当前生产 Catalog digest 不变；
- 从 Forge GitLab Pipeline 查看失败的 Card reference 和校验阶段。

### 新 Pod 无法 Ready

- ArgoCD/Kubernetes 保留旧 Pod；
- 检查 initContainer 日志、`release.json` 和兼容错误；
- 不手工修改 Pod 内文件。

### 新 Catalog 有功能问题

- 恢复上一个 Catalog digest；
- 人工执行 `argocd_sync`；
- 验证 Runtime Catalog revision 已回退；
- 在 Catalog 新 PR 中修复并发布新版本，不覆盖原版本。

### Forge 与 Catalog 同时需要升级

- 先发布向后兼容的新 Forge；
- 再发布需要新能力的 Catalog；
- 最后清理 Forge 的旧格式支持。

## 14. 外部配置清单

实施过程中需要平台侧提供或确认：

| 配置 | 保存位置 | 权限 |
| --- | --- | --- |
| TCR 用户名/密码 | Forge GitLab Protected Variables | push Catalog repository |
| Catalog clone credential | Forge GitLab Protected Variables | read-only |
| GitLab Pipeline Trigger Token | Catalog GitHub Actions Secret | trigger Forge project only |
| `deploy-files` Token | Forge GitLab Protected Variables | 创建分支/MR |
| ArgoCD Token | Forge GitLab Protected Variables | 保持现有人工 Job 使用 |

所有凭证必须 Masked、Protected，不通过 Docker build args 传入。

## 15. 第一开发切片

第一轮只实现 PR 1，不碰 GitLab、ArgoCD 或生产配置：

1. 新增 Forge capability manifest；
2. 定义并验证 Catalog `release.json`；
3. 实现 `catalog bundle build/verify/compatibility`；
4. 使用当前 Catalog 三张卡的 Release 构建本地 bundle；
5. 补齐确定性、安全和错误场景测试；
6. 输出 bundle 文件树、总大小和摘要报告。

该切片完成后，再以真实 bundle 设计 Dockerfile 和 GitLab Job，避免 CI 先于数据契约成型。
