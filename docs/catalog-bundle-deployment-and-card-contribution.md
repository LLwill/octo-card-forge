# Catalog 数据镜像部署与 Card 贡献流程

> 状态：Proposed，待架构评审和实施验收
>
> 日期：2026-08-27
>
> 适用仓库：`octo-card-forge`、`octo-card-catalog`、`deploy-files`

## 1. 决策摘要

生产环境采用两个相互独立、以 digest 固定的 OCI 镜像：

| 镜像 | 内容 | 发布触发 |
| --- | --- | --- |
| Forge 应用镜像 | Server、Forge Web、Card 契约与读取能力 | Forge 代码发布 |
| Catalog 数据镜像 | Snapshot、Artifact、Handoff、Profile 静态资源 | Card Catalog 发布 |

Kubernetes Pod 使用 `initContainer` 将 Catalog 数据镜像中的 `/catalog` 复制到 Pod 内共享的
`emptyDir`。Forge 容器以只读方式挂载该目录，并只读取本地、不可变的发布数据。

```text
octo-card-catalog                         octo-card-forge
Card Source                              Server / Forge Web
      │                                         │
      ├─ check / preview                        ├─ build / test
      ├─ release Artifact / Handoff             └─ Forge image@sha256
      └─ Catalog data image@sha256
                     │                    │
                     └──── deploy-files ──┘
                                │
                              ArgoCD
                                │
                  Pod: initContainer + Forge
```

本方案不让生产 Pod 克隆 Git 仓库、现场编译 Card 或在请求期间依赖 GitHub Release、npm CDN。

## 2. 目标与非目标

### 2.1 目标

1. Card Source 与 Forge 平台代码保持独立发布。
2. Card 更新不需要重新构建 Forge 应用镜像。
3. 一次部署始终对应明确的 Forge revision 和 Catalog revision。
4. 发布过程可审计、可重复构建、可回滚。
5. 运行时不依赖外部 Git、Release 或 CDN 可用性。
6. Card 作者能够在 PR 阶段获得真实预览和明确检查结果。
7. 未来从集中 Catalog 仓库迁移到多个 Card 仓库时，不改变 Forge 的消费方式。

### 2.2 非目标

- 不建设 Forge Database、账号系统或在线 Card 编辑器。
- 不允许生产环境动态扫描 Card Source。
- 不允许覆盖已经发布的 `card-id@version`。
- 不把审批、发布状态和部署状态保存在 Forge Web 中。
- 不追求 Card 合并后立即热更新到运行中的 Pod。

## 3. 为什么不在 Pod 中拉取并编译源码

Pod 启动时执行 `git clone` 和编译看似直接，但会引入以下问题：

- 同一个应用镜像可能因拉取时间不同而获得不同 Card 内容；
- Git、npm、外部网络或凭证故障会阻止 Pod 启动；
- 构建日志、产物摘要和源提交之间难以形成稳定审计关系；
- 扩容时每个 Pod 都重复编译；
- 回滚应用镜像不能保证同时回滚 Card；
- Git 凭证容易进入容器环境或日志。

因此，源码拉取和编译只能发生在 CI。生产 Pod 只消费 CI 已经生成并推送的不可变数据镜像。

## 4. 仓库职责

### 4.1 `octo-card-forge`

负责：

- Card Source、Artifact、Snapshot 的版本化契约；
- Card 编译、校验、检查和 Handoff 构建工具；
- Forge Web 与 Server；
- Catalog bundle 的读取、索引和展示；
- Forge GitLab 中的 Catalog bundle 构建、数据镜像构建和 TCR 推送任务；
- GitHub Delivery Actions；
- 与当前生产 Catalog bundle 的兼容测试。

不负责：

- 保存正式业务 Card Source；
- 决定某个 Card 版本何时发布、弃用或隐藏；
- 在运行时访问 Card Git 仓库。

### 4.2 `octo-card-catalog`

负责：

- 当前集中管理的 Card Source、Schema、Template、Sample 和 Golden；
- Namespace 的 CODEOWNERS 和 Required Review；
- PR Preview、Card Release 和 Catalog Release；
- 不可变 Artifact、Handoff 和 Card Release；
- 合并或发布后，以完整 Catalog commit SHA 触发 Forge GitLab 的 Catalog bundle Pipeline；
- 少量发布策略，例如弃用和隐藏。

### 4.3 `deploy-files`

负责记录当前生产组合：

```yaml
forge:
  image: registry.example.com/octo-card-forge@sha256:<forge-digest>
catalog:
  image: registry.example.com/octo-card-catalog@sha256:<catalog-digest>
  revision: <catalog-git-sha>
```

该文件是“生产当前运行什么”的唯一事实来源。Tag、`latest` 或分支名不得进入生产 Deployment。

正式 Catalog 镜像沿用 Forge 当前 TCR 和 `dmwork` 命名空间：

```text
tbj7-xtiao-tcr1.tencentcloudcr.com/dmwork/octo-card-catalog@sha256:<catalog-digest>
```

Forge 镜像继续使用：

```text
tbj7-xtiao-tcr1.tencentcloudcr.com/dmwork/octo-card-forge@sha256:<forge-digest>
```

## 5. Catalog 数据镜像契约

### 5.1 目录结构

```text
/catalog/
  release.json
  catalog-snapshot.v1.json
  catalog-snapshot.v1.sha256
  artifacts/
    <card-id>/
      <version>.artifact.json
  handoffs/
    <card-id>/
      <version>.handoff.zip
  handoff-indexes/
    <card-id>/
      <version>.json
  handoff-files/
    <card-id>/
      <version>/
        ...previewable files
  profiles/
    <profile-id>/
      <version>/
        manifest.json
        host-config.json
        theme.css
        styles.css
        adaptivecards.min.js
```

目录中的所有路径由 Catalog 构建器生成，不能接受 Card Source 提供的绝对路径或 `..` 路径。

### 5.2 `release.json`

```json
{
  "formatVersion": 1,
  "catalogRevision": "<full-git-sha>",
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

`release.json` 不参与 Card 内容摘要，但用于启动诊断、兼容检查和部署审计。

### 5.3 不可变规则

1. 镜像必须使用 registry digest 部署。
2. 已发布 `card-id@version` 的 Artifact 和 Handoff 不得覆盖。
3. 相同 Catalog Git SHA 必须生成相同 Snapshot、Artifact 和 Handoff 字节。
4. 构建结果不得包含时间戳、工作区绝对路径、Token 或环境专属 URL。
5. 数据镜像不得包含 `.git`、Card Source 或 CI 凭证。

## 6. Kubernetes 与 ArgoCD 流程

### 6.1 Pod 结构

```yaml
volumes:
  - name: catalog-data
    emptyDir: {}

initContainers:
  - name: prepare-catalog
    image: registry.example.com/octo-card-catalog@sha256:<catalog-digest>
    command: ["sh", "-c", "cp -a /catalog/. /catalog-data/"]
    volumeMounts:
      - name: catalog-data
        mountPath: /catalog-data

containers:
  - name: forge
    image: registry.example.com/octo-card-forge@sha256:<forge-digest>
    env:
      - name: CATALOG_ROOT
        value: /app/catalog
    volumeMounts:
      - name: catalog-data
        mountPath: /app/catalog
        readOnly: true
```

`emptyDir` 是 Pod 生命周期内的临时共享目录，不是宿主机目录，也不需要 PVC。Pod 删除后目录随之删除；
新 Pod 会从固定 Catalog 镜像重新准备一份完整数据。

### 6.2 零停机滚动更新

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

发布顺序：

1. Catalog GitHub Workflow 将完整 Catalog commit SHA 发送给 Forge GitLab 的受保护 Pipeline Trigger。
2. Forge GitLab CI 拉取该精确 SHA，构建 Catalog bundle 和数据镜像，并推送 TCR。
3. Forge GitLab CI 向 `deploy-files` 创建只修改 Catalog digest 的 MR。
4. MR 校验 Forge/Catalog 兼容范围和镜像可拉取性。
5. MR 获批并合并。
6. 保持当前人工 `argocd_sync` 任务同步 Deployment，不在第一阶段改变该审批边界。
7. Kubernetes 创建新 ReplicaSet。
8. 新 Pod 的 `initContainer` 准备 Catalog 数据。
9. Forge 启动并验证 `release.json`、Snapshot 摘要和兼容版本。
10. `/readyz` 成功后，新 Pod 才接收流量。
11. 旧 Pod 在新 Pod 就绪后退出。

Forge GitLab Pipeline 至少接收以下受保护变量：

```text
PIPELINE_MODE=catalog
CATALOG_REPOSITORY=<catalog clone URL>
CATALOG_REVISION=<full 40-character commit SHA>
CATALOG_RELEASE=<release identifier>
```

Pipeline 必须在普通 CI 工作区拉取 Catalog，再将生成后的 bundle 放入 Docker build context。Git 凭证不得通过
Docker build argument、镜像 layer 或 bundle 文件传递。镜像 Label 和 `release.json` 同时记录 Catalog SHA
与实际执行构建的 Forge SHA。

`/healthz` 只表示进程存活；`/readyz` 必须表示本地 Catalog 已加载并可消费。

### 6.3 回滚

回滚不重新编译，也不修改 Card 文件：

1. 将 `deploy-files` 中的 Catalog digest 恢复为上一版本；
2. ArgoCD 再次同步；
3. Kubernetes 按相同流程启动旧 Catalog 数据的新 Pod；
4. Smoke Test 通过后完成回滚。

## 7. Card 贡献流程

### 7.1 角色与责任

| 角色 | 责任 |
| --- | --- |
| Contributor | 修改 Card Source、补充 Sample/Golden、说明变更和兼容性 |
| Namespace Owner | 判断业务语义、交互和文案是否正确；通过 CODEOWNERS 审批 |
| Contract Owner | 审核新 Card、Schema、Action、Wire Profile 和破坏性变更 |
| Catalog Maintainer | 维护发布 Workflow、Policy、不可变 Release 和数据镜像 |
| Deploy Approver | 审核目标 Catalog digest、Smoke Test 和生产发布 |

一个人可以承担多个角色，但发布流程必须留下 PR Review、Workflow 和部署审批记录。普通 Card 内容变更
不要求 Forge 平台维护者逐次审批；只有新契约或破坏性变化需要 Contract Owner。

### 7.2 创建新 Card

贡献者从 Catalog 创建分支，并新增：

```text
cards/<namespace>/<card-key>/
  manifest.json
  contract/data.schema.json
  templates/
  samples/
  goldens/
```

提交前至少执行：

```bash
octo-card check --card cards/<namespace>/<card-key>
octo-card artifact build --card cards/<namespace>/<card-key>
```

首次创建 Card ID 时，PR 必须由对应 Namespace CODEOWNER 和 Forge Contract Owner 审核。

### 7.3 修改草稿

Card 根目录表示下一版本的可变草稿。贡献者可以反复修改根目录，但不得修改已经发布的
`versions/<version>/`。

PR Check 自动执行：

- Manifest、Schema 和目录安全校验；
- 所有 Template 与 Sample 编译；
- Render Profile 能力检查；
- Golden 差异；
- Artifact 和 Handoff 确定性构建；
- 自包含 PR Preview；
- 敏感信息和异常文件检查。

PR 页面只表达“候选变更”，不会产生正式 Card Release，也不会改变生产 Catalog。

### 7.4 版本号规则

| 变化 | SemVer |
| --- | --- |
| 修正文案、布局或样式，不改变数据和动作契约 | Patch |
| 增加可选字段、Sample、向后兼容视图或动作 | Minor |
| 删除/重命名字段、改变字段语义、删除视图或改变既有动作协议 | Major |

仅修改 Sample 或 Golden、但不发布新 Card 内容时，可以只更新草稿，不创建版本目录。CI 必须比较上一正式版本，
在检测到明显破坏性变化但版本号没有正确提升时阻止发布。

### 7.5 发布新版本

贡献者执行以下操作：

1. 更新草稿 `manifest.json` 的 SemVer；
2. 将准备发布的内容复制到新的 `versions/<version>/`；
3. 在 PR 中填写变更摘要、兼容性和预览证据；
4. 等待 Required Review 和所有检查通过；
5. 合并 `main`。

合并后，Catalog Workflow 自动：

1. 检查 `card-id@version` 是否已经存在；
2. 创建受保护 Tag `card/<card-id>/v<version>`；
3. 创建不可变 Card GitHub Release；
4. 生成 Artifact、Handoff 和 checksum；
5. 汇总所有正式 Card Release；
6. 使用完整 Catalog commit SHA 触发 Forge GitLab Catalog Pipeline；
7. Forge GitLab 生成 Catalog Snapshot、数据镜像和镜像 digest；
8. Forge GitLab 创建生产 Catalog digest 更新 MR。

生产部署继续保留人工批准。Card Release 成功不等于已经进入生产。

### 7.6 PR Label 的用途

PR Label 只驱动流程，不作为长期事实来源。建议第一阶段只使用：

| Label | 作用 |
| --- | --- |
| `card:new` | 新 Card，需要 Contract Owner 参与审核 |
| `card:release` | PR 包含准备发布的新版本目录 |
| `card:breaking` | 数据契约或行为存在破坏性变化 |
| `catalog:policy` | 只修改弃用、隐藏等发布策略 |

Card ID、版本和 Profile 仍以 `manifest.json` 为准；正式发布身份以受保护 Git Tag 为准。

### 7.7 状态和可见性

第一阶段不实现复杂状态机：

- Branch/PR 中、尚未合并的内容天然是 Draft；
- 已创建正式 Card Release 的版本天然是 Stable；
- Deprecated 和 Hidden 是少量例外，由 Catalog Policy 明确记录。

```yaml
deprecated:
  ai.decision-action@0.3.0:
    replacedBy: ai.decision-action@0.4.0

hidden:
  - ai.decision-action@0.2.0
```

Catalog Policy 是经过 Review 的持久文件。Label 可以要求 Workflow 生成或校验该变更，但运行时不能
直接读取可随时修改的 PR Label。

### 7.8 弃用、隐藏和删除

- Deprecated：仍显示、可访问和下载，同时提示推荐替代版本。
- Hidden：不出现在默认列表，但精确版本链接仍可访问。
- 已发布版本不做物理删除；法律、安全或隐私事件除外。
- 紧急撤回必须保留审计记录，并发布新的 Catalog bundle。
- `latest` 只选择最高 Stable 版本，不选择草稿、预发布、Deprecated 或 Hidden 版本。

## 8. 多仓 Card 的演进路径

当前 Card 数量少，Source 可以继续集中在 `octo-card-catalog`。当团队和发布频率增长时，可以逐步迁移为：

```text
独立 Card 仓库
  → 使用统一 card-check / card-release Action
  → 发布 Artifact、Handoff 和 checksum
  → 向 Catalog 提交 release record PR
  → Catalog 验证并组装数据镜像
```

Catalog 后续可以只保存 release record 和治理策略，而不保存所有 Source。无论 Source 是集中还是分散，
Forge 始终只读取同一种 Catalog bundle，因此不需要再次重构部署面。

## 9. 兼容性与升级

### 9.1 兼容检查

兼容性不使用手工维护的 `compatibleForge: ">=x <y"` 作为部署门禁。应用版本号可以帮助定位问题，
但不能准确表达一个 Forge 是否真正支持某种 Catalog 数据格式。

Forge 仓库维护 `compatibility/forge-runtime.v1.json`：

```json
{
  "schemaVersion": 1,
  "supports": {
    "catalogSnapshot": [1],
    "cardArtifact": [1],
    "handoffLayout": [1],
    "profileBundle": [1],
    "features": ["handoff-index-v1", "local-profile-assets-v1"]
  }
}
```

该文件由 Forge 维护者在实现新的读取能力时修改。Forge 镜像构建时将 `package.json` 版本、Git SHA
和该能力文件组合成 `/app/forge-runtime.json`。

Catalog 不手工维护兼容范围。Catalog CI 根据实际生成的数据，在 `/catalog/release.json` 中声明：

- 使用的 Snapshot format version；
- 包含的 Artifact format versions；
- Handoff layout version；
- Profile bundle version；
- 数据依赖的 feature identifiers；
- 生成数据所用 Forge CLI 的精确版本，仅用于审计。

部署 MR 校验规则是：Catalog 的每项 `requires` 必须包含在 Forge 的 `supports` 中。检查通过才允许合并。
Forge 启动时再次执行相同检查；不兼容时 `/readyz` 失败，Pod 不接收流量。

例如：

```text
Catalog requires cardArtifact 1
Forge supports cardArtifact [1, 2]
结果：兼容

Catalog requires handoff-index-v2
Forge supports handoff-index-v1
结果：不兼容，禁止部署
```

因此兼容信息分别由两个文件承担：

| 文件 | 维护方 | 含义 |
| --- | --- | --- |
| `octo-card-forge/compatibility/forge-runtime.v1.json` | Forge | 运行时能够读取什么 |
| Catalog 镜像 `/catalog/release.json` | Catalog CI 自动生成 | 当前数据要求什么 |

`deploy-files` MR 在合并前使用目标 Forge 镜像和目标 Catalog 镜像运行组合 Smoke Test。

### 9.2 破坏性升级

契约升级使用 expand/contract：

1. Forge 先发布同时读取旧格式和新格式的版本；
2. Catalog 再开始发布新格式；
3. 生产运行稳定后，后续 Forge 版本才能删除旧格式支持。

禁止在一次部署中同时要求 Forge 和 Catalog 互相等待对方的新格式。

## 10. 安全与资源约束

Catalog 构建阶段必须拒绝：

- 绝对路径、`..`、符号链接逃逸和重复归档路径；
- 超过限制的 Handoff、文件数量、单文件和解压总量；
- Token、Cookie、私钥、真实用户数据和生产 Payload；
- 非确定性字段；
- 未固定版本的 Render Profile 或 runtime 依赖。

建议初始限制：

| 项目 | 限制 |
| --- | --- |
| Handoff 压缩包 | 10 MiB |
| Handoff 解压总量 | 40 MiB |
| Handoff 文件数 | 200 |
| 单个可预览文件 | 1 MiB |
| Catalog Snapshot | 2 MiB |

Catalog 镜像需要包含可执行 `sh` 和 `cp`，但不得以 root 写入 Forge 容器。Forge 对共享目录使用只读挂载。

## 11. 可观测性与验收

Forge Runtime API 至少暴露：

```json
{
  "mode": "published",
  "forgeRevision": "<sha>",
  "catalogRevision": "<sha>",
  "catalogImageDigest": "sha256:...",
  "cards": 3,
  "versions": 6,
  "ready": true
}
```

部署 Smoke Test 必须验证：

1. `/healthz` 和 `/readyz`；
2. Runtime 返回预期 Catalog revision；
3. 卡片列表非空且数量符合 release manifest；
4. 至少一个 Artifact 摘要和身份校验成功；
5. 至少一个真实样例能够渲染；
6. 至少一个 Handoff 可以下载、列出并读取文本文件。

## 12. 失败处理

| 失败点 | 行为 |
| --- | --- |
| Card PR Check 失败 | 禁止合并，不创建 Release |
| Card Release 失败 | 保留已发布不可变资产，Catalog bundle 不升级 |
| Catalog 数据镜像构建失败 | 不创建部署 MR |
| Forge/Catalog 兼容检查失败 | 禁止合并部署 MR |
| initContainer 失败 | 新 Pod 不启动，旧 Pod 继续服务 |
| `/readyz` 失败 | 新 Pod 不接流量 |
| Smoke Test 失败 | 回滚 Catalog digest，并保留失败证据 |

## 13. 分阶段实施

### Phase 1：Catalog bundle

- 定义 `release.json` 和 bundle 目录；
- Forge 增加可接收精确 Catalog SHA 的 bundle 构建命令；
- 确定性和安全限制测试；
- Forge GitLab CI 构建并推送 Catalog 数据镜像；
- Catalog GitHub Workflow 在正式 Release 完成后触发 Forge GitLab Pipeline。

### Phase 2：Forge 本地消费

- 增加 `CATALOG_ROOT`；
- 从本地 Snapshot、Artifact、Handoff 和 Profile 资源读取；
- Handoff 列表使用预生成 index；
- 增加 `/readyz` 和 Runtime revision 信息；
- 生产模式取消远端 `CATALOG_SNAPSHOT_URL`。

### Phase 3：部署编排

- Deployment 增加 initContainer、`emptyDir` 和只读挂载；
- `deploy-files` 同时锁定两个镜像 digest；
- 增加组合 Smoke Test、人工批准和自动回滚指引。

### Phase 4：贡献治理

- 完善 CODEOWNERS、PR Template 和 Branch Protection；
- 增加 `card:new`、`card:release`、`card:breaking`、`catalog:policy` Label；
- 增加 Catalog Policy 校验；
- 编写贡献者命令和故障排查文档。

## 14. 完成标准

本方案只有同时满足以下条件才算完成：

- Forge 镜像和部署包不包含业务 Card Source；
- Card 更新只构建 Catalog 镜像，不构建 Forge 镜像；
- 生产 Pod 不访问 Card Git 仓库、GitHub Release 或 npm CDN；
- 新 Pod 在 Catalog 校验完成前不接流量；
- Forge/Catalog 任一组合不兼容时部署 MR 无法合并；
- 同一 Card 版本无法覆盖发布；
- 可以仅通过恢复 Catalog digest 完成回滚；
- Card 作者可以从 PR Preview 到生产发布追踪完整证据链。

## 15. 已确认实施参数

| 项目 | 决策 |
| --- | --- |
| Catalog Registry | `tbj7-xtiao-tcr1.tencentcloudcr.com/dmwork/octo-card-catalog` |
| Catalog 镜像构建 | 由 Forge 项目的 GitLab CI 完成并推送现有 TCR |
| 部署 MR 审批 | 第一阶段复用 `deploy-files` 默认审批规则，不新增专属审批角色 |
| ArgoCD | 保持当前人工 `argocd_sync`，第一阶段不改 Auto Sync |
| 兼容性 | Forge 能力清单与 Catalog 自动生成的要求清单做集合匹配，不维护人工 SemVer 范围 |

Forge GitLab 复用当前 Runner、TCR 登录凭证和 `deploy-files` 写入能力。Catalog GitHub 只保存最小权限的
Pipeline Trigger 凭证；Catalog Repository 的读取凭证只存在于 Forge GitLab CI，不写入 Docker layer、
Catalog bundle 或 Forge 镜像。
