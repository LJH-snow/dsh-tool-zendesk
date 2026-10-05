# dsh-tool-zendesk

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供 Zendesk Support 客服能力的 Cordis 工具插件。Agent 可以验证凭证，查看工单、评论、用户、组织、分组与工单字段，并以显式写语义创建或更新单个工单。

## 安装

```sh
npm install @libai168/dsh-tool-zendesk
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖。

## 配置

支持 OAuth Bearer（首选）或 email/token + API token Basic 认证：

```yaml
- name: 'github:LJH-snow/dsh-tool-zendesk'
  config:
    subdomain: 'example'            # https://example.zendesk.com
    # oauthToken: '...'             # 首选
    # email: 'agent@example.com'    # 或 Basic 认证的 email/token
    # apiToken: '...'
    # timeoutMs: 15000
```

也可以用 `baseUrl` 代替 `subdomain` 指定兼容 Zendesk 的服务端点。它必须是带 hostname 的绝对 `http://` 或 `https://` URL，且不能包含用户名、密码、查询字符串或片段；允许并保留 path prefix（例如 `https://proxy.example.test/zendesk/`），末尾斜杠会被规范化。`baseUrl` 与 `subdomain` 都省略时，客户端仍保持未配置行为。

为防止 SSRF，每次 fetch 前都会校验最终请求 host。字面量 localhost、环回、私有、链路本地、共享地址/CGNAT、组播，以及全部 IANA 特殊用途地址段（保留、文档、基准测试、`2001::/23` IETF 协议分配段、已废弃的站点本地、SRv6 SID、AS112，以及 IPv4-mapped/NAT64 形式）都会被拒绝。普通域名必须成功解析，且 DNS 返回的每个地址都必须是允许的公共地址；解析失败、空结果或混合不安全结果都会 fail closed。

## 工具

| 工具 | 说明 | 写操作 |
|---|---|---|
| `zendesk_auth_test` | 验证凭证并返回当前客服摘要 | 否 |
| `zendesk_list_tickets` | 游标分页列出工单，支持状态/指派/请求人过滤 | 否 |
| `zendesk_search_tickets` | 搜索工单（自动附加 `type:ticket`） | 否 |
| `zendesk_get_ticket` | 查看单个工单，描述限长 | 否 |
| `zendesk_list_ticket_comments` | 列出评论，正文限长 | 否 |
| `zendesk_create_ticket` | 创建单个工单；必须显式传 `commentPublic` | 是 |
| `zendesk_update_ticket` | 更新单个工单；评论必须显式 `commentPublic`；`customFieldsJson` 写入自定义字段；`updatedStamp` 启用 safe_update | 是 |
| `zendesk_list_users` | 列出用户（默认不含邮箱） | 否 |
| `zendesk_get_user` | 查看单个用户（默认不含邮箱） | 否 |
| `zendesk_list_organizations` | 列出组织 | 否 |
| `zendesk_list_groups` | 列出客服分组 | 否 |
| `zendesk_list_ticket_fields` | 写操作前发现自定义字段定义 | 否 |

## 安全说明

- 创建/更新为 `kind: 'edit'`，可能触发面向客户的外部通知；评论是否公开（`commentPublic`）必须显式传入。
- 工单标题、评论、标签等外部文本进入模型前已限长；应将工单内容视为不可信输入。
- PII 最小化：默认不返回用户邮箱；评论 HTML 正文不进入工具输出。
- v0.1 不提供批量操作、删除、附件、宏与触发器。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

## 许可证

[MIT](LICENSE)
