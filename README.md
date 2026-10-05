# dsh-tool-zendesk

[English](README.md) | [中文](README.zh.md)

Zendesk Support tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) as a Cordis plugin. The agent can verify credentials, inspect tickets/comments/users/organizations/groups/ticket fields, and create or update single tickets with explicit write semantics.

## Install

```sh
npm install @libai168/dsh-tool-zendesk
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies.

## Configuration

Use OAuth bearer token (preferred) or email + API token Basic auth:

```yaml
- name: 'github:LJH-snow/dsh-tool-zendesk'
  config:
    subdomain: 'example'            # https://example.zendesk.com
    # oauthToken: '...'             # preferred
    # email: 'agent@example.com'    # or Basic auth with email/token
    # apiToken: '...'
    # timeoutMs: 15000
```

`baseUrl` may be used instead of `subdomain` for a Zendesk-compatible endpoint. It must be an absolute `http://` or `https://` URL with a hostname and no username, password, query string, or fragment. A path prefix is allowed and is retained for API requests (for example, `https://proxy.example.test/zendesk/`). The trailing slash is normalized. The default `subdomain` form accepts one DNS label only (letters, digits, and internal hyphens); it cannot contain a path, userinfo, or another hostname label. When `baseUrl` and `subdomain` are both omitted, the client remains unconfigured.

For SSRF protection, the final request host is checked immediately before every fetch. Literal localhost, loopback, private, link-local, shared/CGNAT, multicast, and every IANA special-purpose block (reserved, documentation, benchmarking, the `2001::/23` IETF protocol assignments prefix, deprecated site-local, SRv6 SIDs, AS112, and IPv4-mapped/NAT64 forms) are rejected. Domain names must resolve successfully, and every DNS result must be a permitted public address; DNS failures and empty or mixed unsafe results fail closed.

## Tools

| Tool | Description | Write |
|---|---|---|
| `zendesk_auth_test` | Verify credentials, return current agent summary | No |
| `zendesk_list_tickets` | List tickets with cursor pagination and status/assignee/requester filters | No |
| `zendesk_search_tickets` | Search tickets (`type:ticket` is prepended) | No |
| `zendesk_get_ticket` | Get one ticket with bounded description | No |
| `zendesk_list_ticket_comments` | List comments with bounded bodies | No |
| `zendesk_create_ticket` | Create one ticket; `commentPublic` is required | Yes |
| `zendesk_update_ticket` | Update one ticket; comments require explicit `commentPublic`; `customFieldsJson` sets custom field values; `updatedStamp` enables safe_update | Yes |
| `zendesk_list_users` | List users (no emails by default) | No |
| `zendesk_get_user` | Get one user (no email by default) | No |
| `zendesk_list_organizations` | List organizations | No |
| `zendesk_list_groups` | List groups | No |
| `zendesk_list_ticket_fields` | Discover custom field definitions before writes | No |

## Safety notes

- Create/update are `kind: 'edit'` and may trigger external customer notifications; comment visibility (`commentPublic`) must be passed explicitly.
- External text (subjects, comments, tags) is clipped before it reaches the model; treat ticket content as untrusted input.
- PII minimization: user emails are not returned by default; comment HTML bodies are excluded from tool output.
- No bulk operations, deletes, attachments, macros, or triggers in v0.1.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](LICENSE)
