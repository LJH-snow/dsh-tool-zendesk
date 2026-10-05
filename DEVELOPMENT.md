# dsh-tool-zendesk 开发文档

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-zendesk` |
| 定位 | DeepSeek Harness 的外部客服/ITSM 插件 |
| 版本 | v0.3.1 |
| 架构 | Cordis 插件 + `ctx.tools.register(defineTool(...))` |
| API | Zendesk Support API v2 |
| 认证 | OAuth Bearer 或 `email/token:<apiToken>` Basic |

### 1.1 目录

```text
src/client.ts       ZendeskClient：认证、游标分页、fetch 注入、超时、URL 安全校验、错误映射
src/url-security.ts URL 规范化、IP 特殊地址分类与 DNS fail-closed 校验
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
- `customFieldsJson`（v0.2.0）接受 `[{id, value}]` JSON 数组并映射为 Zendesk `custom_fields` 请求体；非法 JSON 返回 `{ ok: false }`，字段定义可先经 `zendesk_list_ticket_fields` 发现。
- 不实现批量、删除、附件上传、宏、触发器。

### 2.4 PII 与不可信文本

- 用户列表/详情、认证结果默认不含 email；评论不含 `html_body`。
- 标题 200、描述 1000、评论正文 800、tag 80、附件名 120 字符上限（客户端输出与工具返回一致裁剪）。
- 工单描述/评论为不可信外部输入，render 只做纯文本拼接。

### 2.5 URL 安全

- `baseUrl` 仅接受带 hostname 的绝对 `http://`/`https://` URL，拒绝 username、password、query 和 fragment；path prefix 会保留，末尾斜杠会规范化。未提供 `baseUrl` 时，`subdomain` 只接受一个 DNS label（字母、数字和中间连字符），防止配置值改变实际 hostname；两者都缺省时保留空配置行为。
- 请求在真正调用 `fetch` 前校验最终 URL。字面量 localhost、环回、私有、链路本地、CGNAT、组播、保留、文档和基准测试 IPv4/IPv6 地址均拒绝。
- 阻断清单与 IANA IPv4/IPv6 Special-Purpose Address Registry 对齐，额外覆盖 `2001::/23`（IETF Protocol Assignments，含 Teredo、AMT、AS112-v6、ORCHID/ORCHIDv2、DRiP）、`5f00::/16`（SRv6 SID）、`100:0:0:1::/64`（RFC 9780）、`2620:4f:8000::/48`、`fec0::/10`（已废弃站点本地）及 IPv4-mapped/NAT64 形式；该清单需与 aws/dockerhub/pagerduty 三个同源插件保持一致，不得只改其中一份。
- 普通 hostname 使用 `dns.promises.lookup(hostname, { all: true })`，解析失败、空结果或任一解析结果属于阻断地址时 fail closed。`lookupImpl` 仅作为 `ZendeskClientOptions` 的测试注入点，插件配置接口不暴露它。
- URL 安全错误统一包装为不回显敏感 URL 或凭证的 `ZendeskError`。

### 2.6 错误映射

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

当前客户端测试覆盖：Basic/OAuth 认证头、游标分页（含 next link 游标提取）、搜索与评论、创建/更新请求体与 safe_update 参数、custom_fields 请求体映射、显式 publicComment 约束、用户/组织/分组/字段映射、缺凭证保护、HTTP 错误映射，以及 baseUrl path prefix/非法 URL、字面量特殊地址（含 IANA 特殊用途网段）、DNS 私网结果、混合结果与解析失败的 fail-closed 行为。

## 4. 后续方向

- 401 清除态重试与 429 Retry-After 处理。
- 创建工单时的自定义字段写入（当前仅更新路径支持）。
- Ticket audit/只读宏浏览。
