# dsh-tool-zendesk 开发文档

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-zendesk` |
| 定位 | DeepSeek Harness 的外部客服/ITSM 插件 |
| 版本 | v0.1.0 |
| 架构 | Cordis 插件 + `ctx.tools.register(defineTool(...))` |
| API | Zendesk Support API v2 |
| 认证 | OAuth Bearer 或 `email/token:<apiToken>` Basic |

### 1.1 目录

```text
src/client.ts       ZendeskClient：认证、游标分页、fetch 注入、超时、错误映射
src/index.ts        12 个 defineTool 定义与插件 apply
tests/client.spec.ts  客户端契约测试（两种认证、分页、写 body、安全约束）
tests/tools.spec.ts   工具注册、render 测试
examples/cordis.yml   dsh 组合配置示例
```

## 2. 技术决策

### 2.1 认证

- OAuth token 走 `Authorization: Bearer`；否则 `Basic base64(email/token:apiToken)`。
- 凭证只从插件配置注入，不进入任何输出。

### 2.2 分页

- 列表统一游标分页（`page[after]`/`page[size]`）。`meta.after_cursor` 缺失时从 `links.next` 提取 `page[after]` 查询参数；提取失败返回空串而不是完整 URL（避免把 URL 当 opaque cursor 传递）。

### 2.3 写操作安全

- `createTicket`/`updateTicket` 必须显式传 `commentPublic`，否则抛 `ZendeskError`，杜绝隐式公开回复触发客户通知。
- `updatedStamp` 传入时按 Zendesk `safe_update` 协议发送 `updated_stamp` 字段并追加 `safe_update=true` 查询参数，实现乐观并发控制；不发送只读的 `updated_at`。
- 不实现批量、删除、附件上传、宏、触发器。

### 2.4 PII 与不可信文本

- 用户列表/详情、认证结果默认不含 email；评论不含 `html_body`。
- 标题 200、描述 1000、评论正文 800、tag 80、附件名 120 字符上限（客户端输出与工具返回一致裁剪）。
- 工单描述/评论为不可信外部输入，render 只做纯文本拼接。

### 2.5 错误映射

| 场景 | 返回/行为 |
|---|---|
| 未配置凭证 | `{ ok: false }` / `{ found: false, reason }` |
| 写操作缺显式参数 | 抛 `ZendeskError`（400） |
| HTTP 4xx/5xx | 抛 `ZendeskError`，工具层转规范化失败值 |

## 3. 测试

```sh
npm install
npm run typecheck
npm test
npm run build
```

当前 10 个测试覆盖：Basic/OAuth 认证头、游标分页（含 next link 游标提取）、搜索与评论、创建/更新请求体与 safe_update 参数、显式 publicComment 约束、用户/组织/分组/字段映射、缺凭证保护、HTTP 错误映射。

## 4. 后续方向

- 401 清除态重试与 429 Retry-After 处理。
- 自定义字段写入（`custom_fields`）。
- Ticket audit/只读宏浏览。
