# 线上管理面板 patch 的源码还原

## 目标和范围

将历史 `management.html` 构建产物上追加的功能迁回当前 React/TypeScript 源码，保留当前 fork 已有的 v8 配置编辑、运行策略、模型能力、OAuth 和配额功能。不是退回历史面板版本，也不追求压缩产物逐字节一致。

本轮只修改前端源码、回归测试与文档；没有修改线上 `management.html`、后端源码、生产配置或凭据。

## 来源和恢复对应关系

基线为 fork `752e0ee`。调查使用生产静态文件的官方备份、mk1/mk2/mk3、pre-mk4、pre-multikey 和 live 版本。对相邻构建产物进行代码块对齐，并复核最终 live 逻辑。字符串差集仅用于找线索，不作为“无差异”证明。

| 历史段 | 经源码块复核的行为 | 当前源码落点 |
|---|---|---|
| official → mk1 | Codex 打开 API 密钥条目编辑，读取和写入原生 `api-key-entries`，条目保留代理、权重和 authIndex | `descriptors.ts`、`BaseProviderForm.tsx`、`bundledKeys.ts`、API transformers/providers |
| mk1 → mk2 | Codex/xAI 模型发现和 Responses 连通性测试从条目列表回退取可用 key | `useModelDiscovery.ts`、`useConnectivityTest.ts` |
| mk2 → mk3 | 逐 key/全部 key 测试允许 Codex/xAI；不是零改动，只是字符串字面量集合没有变化 | `useConnectivityTest.ts`、共享 `ApiKeyEntriesEditor.tsx` |
| mk3 → pre-mk4 | 老单 key 以留空密码框回显，原 key 保留；父级代理和权重不被第一条目旧值覆盖；单 key 提交保持兼容 | `bundledKeys.ts`、`buildProviderKeyConfig` |
| pre-mk4 → pre-multikey | TypeSafe 分类、默认服务地址、配置读取、创建/更新/删除及表单入口 | 类型、descriptor、adapter、Workbench、API、四种 locale |
| pre-multikey → live | bundled-only 配置不能丢掉；TypeSafe/Codex/xAI 提交携带条目代理和权重 | `normalizeProviderKeyConfig`、`serializeProviderKey`、表单配置转换 |

当前 fork 原本已有 OpenAI compatibility 的多 key 编辑和持久化身份保护，不复制另一套实现。原生提供商的 nested `api-key-entries` 与 OpenAI 的 group-level `keys` 是两个不同契约，不互相替换。

官方备份与 mk1 同时包含重新打包造成的变量/依赖代码变化。恢复的是已复核的业务行为，而非所有构建器或依赖版本差异；最终产物与历史 live 的字节差异不能用于宣称完全等价。

## 保存与测试约束

- Codex/xAI 的逐 key 测试使用 `/responses` 请求体（`input`），OpenAI compatibility 仍使用 Chat Completions。
- TypeSafe 是独立执行协议，不提供普通 Responses 连通性测试或模型发现按钮；保持线上 descriptor 的能力限制。TypeSafe 仍支持主 key 和 bundled `api-key-entries` 编辑。
- TypeSafe 主 key 与 bundled key 双入口，密码框留空保留原 key。
- 轮换/重排原生 bundled keys 以 `sourceIndex` 标识持久化条目；保留未知后端字段，写入时剔除响应元数据 `auth-index`。
- 共用 v8 配置写入的并发冲突和连接切换保护，不增加 v0 回退。
- 页面只显示脱敏 fixture 截图，测试不向真实上游发推理请求。

## 后端前置条件

正式运行要求后端 v8 配置映射包含 `typesafe-api-key → api-keys.typesafe`。服务器新版源码已有此映射和迁移测试；较旧 `cliproxy-src` 的映射未列出 TypeSafe。上线本前端前必须核对实际后端的 v8 支持，不能仅凭旧 `/v0/management/typesafe-api-key` 存在就认为 v8 可用。

本轮检查从服务器下载非敏感源码契约：`config_types.go`（TypeSafeKey = CodexKey，支持 APIKeyEntries）、`config_lists.go`、新旧 `config_v8.go` 和 v8 路由文件；本地没有相邻 `../CLIProxyAPI` checkout，因此不声称在生产 v8 API 上完成端到端验证。

## 验证记录

使用仓库固定 Bun 1.3.14，依赖 `bun install --frozen-lockfile`。Windows Bun 在临时目录报 AccessDenied，改在服务器独立目录执行前端测试/构建，未改变 Windows 文件权限和生产部署目录。

- 改动前全量基线：1475 pass / 5 fail（1480 tests）。
- 最终全量：1495 pass / 0 fail（1495 tests），其中本次新增 15 个测试。

基线的 5 个失败不是业务缺陷，而是测试自身与运行平台耦合，随本次一并修正后才可能全绿：

1. `providerModelOptions.test.ts` 断言 i18n key 字面量，而组件渲染的是翻译后的文案；改为用同一 i18n 实例取值。
2. `authFileCooldowns.test.ts` 断言 `title` 属性的原文，未考虑 React 转义；改为比对同源渲染出的属性。
3. `logRequests.test.ts`、`providerProbeProxy.test.ts`、`quotaToolbar.test.ts` 用 `\n` 匹配源码，在 CRLF 检出下失败；读取时统一换行后再断言，Linux 上为无操作，不影响 CI。

- focused suites：还原测试、providerGroupsV8、providerWeightTransformers 共 47 pass / 0 fail。
- TypeScript type-check 和 Vite single-file build 通过。
- lint 通过，0 error、0 warning。
- 实际 Chromium 浏览器使用回环假后端：TypeSafe 分类/编辑/轮换保存正常，主 key、另一个条目、代理权重保留；TypeSafe 测试按钮隐藏；Codex 多 key 编辑与“全部测试”发出两条对应 key 的 Responses 请求。

前端单文件产物依赖后端 v8 的 `api-keys.typesafe`，因此必须与 `CLIProxyAPI` 的后端改动同时上线；单独部署本前端会让 TypeSafe 条目无法读写。构建成功不等于自动获准部署。
