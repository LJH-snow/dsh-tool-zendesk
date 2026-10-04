import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ZendeskClient, ZendeskError } from './client.js'

export const name = 'dsh-tool-zendesk'
export const inject = ['tools']

export interface ZendeskPluginConfig {
  subdomain?: string
  baseUrl?: string
  oauthToken?: string
  email?: string
  apiToken?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: ZendeskPluginConfig = {}) {
  const client = new ZendeskClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}

function text(value: string) {
  return [{ type: 'text' as const, text: value }]
}

function clip(value: string | undefined, limit: number): string {
  return (value ?? '').slice(0, limit)
}

function asRecordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function unavailable(reason: string) {
  return { found: false, items: [], reason }
}

function errorReason(error: unknown): string {
  return error instanceof ZendeskError ? error.message : error instanceof Error ? error.message : String(error)
}

function renderTickets(items: Array<{ id?: number; subject?: string; status?: string; priority?: string; type?: string; requesterId?: number; assigneeId?: number; updatedAt?: string; tags?: string[] }>) {
  if (!items.length) return text('No Zendesk tickets found.')
  return text(items.map(ticket => `#${ticket.id ?? ''} ${clip(ticket.subject, 200)} status=${ticket.status ?? ''} priority=${ticket.priority ?? ''} type=${ticket.type ?? ''} requester=${ticket.requesterId ?? 0} assignee=${ticket.assigneeId ?? 0} updated=${ticket.updatedAt ?? ''} tags=${ticket.tags?.map(tag => clip(tag, 80)).join(', ') ?? ''}`).join('\n'))
}

function renderTicket(value: { id?: number; subject?: string; description?: string; status?: string; priority?: string; type?: string; requesterId?: number; assigneeId?: number; organizationId?: number; groupId?: number; tags?: string[]; createdAt?: string; updatedAt?: string; url?: string }) {
  return text([
    `#${value.id ?? ''} ${clip(value.subject, 200)}`,
    `status=${value.status ?? ''} priority=${value.priority ?? ''} type=${value.type ?? ''}`,
    `requester=${value.requesterId ?? 0} assignee=${value.assigneeId ?? 0} organization=${value.organizationId ?? 0} group=${value.groupId ?? 0}`,
    `tags=${value.tags?.map(tag => clip(tag, 80)).join(', ') ?? ''} created=${value.createdAt ?? ''} updated=${value.updatedAt ?? ''}`,
    value.description ? `description=${clip(value.description, 1000)}` : '',
    value.url ? `url=${value.url}` : '',
  ].filter(Boolean).join('\n'))
}

function renderComments(items: Array<{ id?: number; authorId?: number; body?: string; public?: boolean; createdAt?: string; attachments?: string[] }>) {
  if (!items.length) return text('No Zendesk ticket comments found.')
  return text(items.map(comment => `[${comment.createdAt ?? ''}] author=${comment.authorId ?? 0} public=${comment.public ? 'yes' : 'no'}${comment.attachments?.length ? ` attachments=${comment.attachments.map(name => clip(name, 120)).join(', ')}` : ''}\n${clip(comment.body, 800)}`).join('\n\n'))
}

function renderUsers(items: Array<{ id?: number; name?: string; role?: string; active?: boolean; organizationId?: number }>) {
  if (!items.length) return text('No Zendesk users found.')
  return text(items.map(user => `${clip(user.name, 200)} (#${user.id ?? ''}) role=${user.role ?? ''} active=${user.active ? 'yes' : 'no'} organization=${user.organizationId ?? 0}`).join('\n'))
}

function renderOrganizations(items: Array<{ id?: number; name?: string; domainNames?: string[]; groupId?: number; sharedTickets?: boolean }>) {
  if (!items.length) return text('No Zendesk organizations found.')
  return text(items.map(org => `${org.name ?? ''} (#${org.id ?? ''}) domains=${org.domainNames?.join(', ') ?? ''} group=${org.groupId ?? 0} sharedTickets=${org.sharedTickets ? 'yes' : 'no'}`).join('\n'))
}

function renderGroups(items: Array<{ id?: number; name?: string; deleted?: boolean; createdAt?: string }>) {
  if (!items.length) return text('No Zendesk groups found.')
  return text(items.map(group => `${group.name ?? ''} (#${group.id ?? ''}) deleted=${group.deleted ? 'yes' : 'no'} created=${group.createdAt ?? ''}`).join('\n'))
}

function renderFields(items: Array<{ id?: number; type?: string; title?: string; description?: string; active?: boolean; required?: boolean; customField?: boolean; options?: string }>) {
  if (!items.length) return text('No Zendesk ticket fields found.')
  return text(items.map(field => `#${field.id ?? ''} ${field.title ?? ''} type=${field.type ?? ''} active=${field.active ? 'yes' : 'no'} required=${field.required ? 'yes' : 'no'} custom=${field.customField ? 'yes' : 'no'}${field.options ? ` options=${field.options}` : ''}`).join('\n'))
}

function renderPageMeta(value: { nextCursor?: string; previousCursor?: string; hasMore?: boolean }) {
  return { nextCursor: value.nextCursor ?? '', previousCursor: value.previousCursor ?? '', hasMore: value.hasMore ?? false }
}

function ticketSummary(ticket: { id: number; subject: string; status: string; priority: string; type: string; requesterId: number; assigneeId: number; organizationId: number; groupId: number; tags: string[]; createdAt: string; updatedAt: string; url: string }) {
  return { id: ticket.id, subject: clip(ticket.subject, 200), status: ticket.status, priority: ticket.priority, type: ticket.type, requesterId: ticket.requesterId, assigneeId: ticket.assigneeId, organizationId: ticket.organizationId, groupId: ticket.groupId, tags: ticket.tags.map(tag => clip(tag, 80)), createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, url: ticket.url }
}

export function createTools(client: ZendeskClient) {
  return [
    defineTool({
      name: 'zendesk_auth_test',
      description: 'Verify Zendesk credentials and return the current agent summary.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, id: { type: 'number' }, name: { type: 'string' }, role: { type: 'string' }, active: { type: 'boolean' } } },
        render: (_args, value) => value.ok ? text(`${clip(value.name, 200)} (#${value.id ?? ''}) role=${value.role ?? ''} active=${value.active ? 'yes' : 'no'}`) : text(`Zendesk auth failed: ${value.reason ?? ''}`),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Verify Zendesk credentials', kind: 'read' } },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Zendesk subdomain and credentials are not configured.' }
        try {
          const user = await client.authTest(exec.signal)
          return { ok: true, id: user.id, name: user.name, role: user.role, active: user.active }
        } catch (error) { return { ok: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'zendesk_list_tickets',
      description: 'List Zendesk tickets using cursor pagination and optional status, requester, assignee, and update-time filters.',
      parameters: {
        cursor: { type: 'string', description: 'Opaque cursor from a previous response' },
        limit: { type: 'integer', description: 'Results per page, 1-100 (default 50)' },
        status: { type: 'string', description: 'Ticket status filter' },
        assigneeId: { type: 'integer', description: 'Assignee user ID' },
        requesterId: { type: 'integer', description: 'Requester user ID' },
        updatedSince: { type: 'string', description: 'ISO-8601 lower bound for updated_at' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, subject: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, type: { type: 'string' }, requesterId: { type: 'number' }, assigneeId: { type: 'number' }, organizationId: { type: 'number' }, groupId: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, createdAt: { type: 'string' }, updatedAt: { type: 'string' }, url: { type: 'string' } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderTickets(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Zendesk tickets', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        try {
          const result = await client.listTickets({ cursor: args.cursor as string, limit: args.limit as number, status: args.status as string, assigneeId: args.assigneeId as number, requesterId: args.requesterId as number, updatedSince: args.updatedSince as string, signal: exec.signal })
          return { found: true, ...result, items: result.items.map(ticketSummary), ...renderPageMeta(result) }
        } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'zendesk_search_tickets',
      description: 'Search Zendesk tickets with a constrained query and cursor pagination.',
      parameters: { query: { type: 'string', required: true, description: 'Zendesk search terms or field query' }, cursor: { type: 'string', description: 'Opaque cursor from a previous response' }, limit: { type: 'integer', description: 'Results per page, 1-100 (default 50)' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, subject: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, type: { type: 'string' }, requesterId: { type: 'number' }, assigneeId: { type: 'number' }, organizationId: { type: 'number' }, groupId: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, createdAt: { type: 'string' }, updatedAt: { type: 'string' }, url: { type: 'string' } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk search failed.') : renderTickets(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Search Zendesk tickets', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        if (!args.query) return unavailable('query is required.')
        try {
          const result = await client.searchTickets(args.query as string, { cursor: args.cursor as string, limit: args.limit as number, signal: exec.signal })
          return { found: true, ...result, items: result.items.map(ticketSummary), ...renderPageMeta(result) }
        } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'zendesk_get_ticket',
      description: 'Get one Zendesk ticket by ID with a bounded description summary.',
      parameters: { ticketId: { type: 'integer', required: true, description: 'Zendesk ticket ID' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, id: { type: 'number' }, subject: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, type: { type: 'string' }, requesterId: { type: 'number' }, assigneeId: { type: 'number' }, organizationId: { type: 'number' }, groupId: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, createdAt: { type: 'string' }, updatedAt: { type: 'string' }, url: { type: 'string' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderTicket(value),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Zendesk ticket ${args.ticketId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Zendesk subdomain and credentials are not configured.' }
        if (!args.ticketId) return { found: false, reason: 'ticketId is required.' }
        try {
          const ticket = await client.getTicket(args.ticketId as number, exec.signal)
          return { found: true, id: ticket.id, subject: clip(ticket.subject, 200), description: clip(ticket.description, 1000), status: ticket.status, priority: ticket.priority, type: ticket.type, requesterId: ticket.requesterId, assigneeId: ticket.assigneeId, organizationId: ticket.organizationId, groupId: ticket.groupId, tags: ticket.tags.map(tag => clip(tag, 80)), createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, url: ticket.url }
        } catch (error) { return { found: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'zendesk_list_ticket_comments',
      description: 'List comments for one Zendesk ticket with cursor pagination and bounded body output.',
      parameters: { ticketId: { type: 'integer', required: true, description: 'Zendesk ticket ID' }, cursor: { type: 'string', description: 'Opaque cursor from a previous response' }, limit: { type: 'integer', description: 'Results per page, 1-100 (default 50)' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, authorId: { type: 'number' }, body: { type: 'string' }, public: { type: 'boolean' }, createdAt: { type: 'string' }, attachments: { type: 'array', items: { type: 'string' } } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderComments(value.items ?? []),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Zendesk comments ${args.ticketId ?? ''}`, kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        if (!args.ticketId) return unavailable('ticketId is required.')
        try {
          const result = await client.listTicketComments(args.ticketId as number, { cursor: args.cursor as string, limit: args.limit as number, signal: exec.signal })
          const items = result.items.map(comment => ({ id: comment.id, authorId: comment.authorId, body: clip(comment.body, 800), public: comment.public, createdAt: comment.createdAt, attachments: comment.attachments.map(name => clip(name, 120)) }))
          return { found: true, ...result, items, ...renderPageMeta(result) }
        } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'zendesk_create_ticket',
      description: 'Create one Zendesk ticket. WRITE operation; may notify external users depending on account rules.',
      parameters: { subject: { type: 'string', required: true, description: 'Ticket subject' }, comment: { type: 'string', required: true, description: 'Initial ticket comment' }, commentPublic: { type: 'boolean', required: true, description: 'Explicitly choose whether the initial comment is public' }, requesterId: { type: 'integer', description: 'Requester user ID' }, priority: { type: 'string', description: 'Ticket priority' }, type: { type: 'string', description: 'Ticket type' }, tags: { type: 'array', items: { type: 'string' }, description: 'Ticket tags' }, assigneeId: { type: 'integer', description: 'Assignee user ID' }, groupId: { type: 'integer', description: 'Group ID' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, id: { type: 'number' }, subject: { type: 'string' }, status: { type: 'string' }, url: { type: 'string' } } },
        render: (_args, value) => value.ok ? text(`Created Zendesk ticket #${value.id ?? ''} ${value.subject ?? ''}\nstatus=${value.status ?? ''}\n${value.url ?? ''}`) : text(`Failed to create Zendesk ticket: ${value.reason ?? ''}`),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Create Zendesk ticket', kind: 'edit' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Zendesk subdomain and credentials are not configured.' }
        if (!args.subject || !args.comment || typeof args.commentPublic !== 'boolean') return { ok: false, reason: 'subject, comment, and commentPublic are required.' }
        try { const ticket = await client.createTicket({ subject: clip(args.subject as string, 200), comment: clip(args.comment as string, 10000), publicComment: args.commentPublic as boolean, requesterId: args.requesterId as number, priority: args.priority as string, type: args.type as string, tags: (args.tags as string[] | undefined)?.map(tag => clip(tag, 80)), assigneeId: args.assigneeId as number, groupId: args.groupId as number, signal: exec.signal }); return { ok: true, id: ticket.id, subject: clip(ticket.subject, 200), status: ticket.status, url: ticket.url } } catch (error) { return { ok: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'zendesk_update_ticket',
      description: 'Update one Zendesk ticket. WRITE operation; comment visibility must be explicit; customFieldsJson sets custom field values; updatedStamp enables safe_update.',
      parameters: { ticketId: { type: 'integer', required: true, description: 'Zendesk ticket ID' }, status: { type: 'string', description: 'New ticket status' }, priority: { type: 'string', description: 'New priority' }, assigneeId: { type: 'integer', description: 'Assignee user ID' }, groupId: { type: 'integer', description: 'Group ID' }, tags: { type: 'array', items: { type: 'string' }, description: 'Replacement ticket tags' }, comment: { type: 'string', description: 'Comment to append' }, commentPublic: { type: 'boolean', description: 'Required when comment is supplied; explicitly choose public or internal' }, customFieldsJson: { type: 'string', description: 'JSON array of {id, value} custom field entries, e.g. [{"id":123,"value":"prod"}]' }, updatedStamp: { type: 'string', description: 'Expected updated_stamp timestamp; enables safe_update' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, id: { type: 'number' }, subject: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, url: { type: 'string' } } },
        render: (_args, value) => value.ok ? text(`Updated Zendesk ticket #${value.id ?? ''} ${value.subject ?? ''}\nstatus=${value.status ?? ''} priority=${value.priority ?? ''}\n${value.url ?? ''}`) : text(`Failed to update Zendesk ticket: ${value.reason ?? ''}`),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Update Zendesk ticket ${args.ticketId ?? ''}`, kind: 'edit' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Zendesk subdomain and credentials are not configured.' }
        if (!args.ticketId) return { ok: false, reason: 'ticketId is required.' }
        if (args.comment !== undefined && typeof args.commentPublic !== 'boolean') return { ok: false, reason: 'commentPublic is required when comment is supplied.' }
        let customFields: Array<{ id: number; value: unknown }> | undefined
        if (args.customFieldsJson) {
          try {
            const parsed = JSON.parse(args.customFieldsJson as string) as unknown
            if (!Array.isArray(parsed)) return { ok: false, reason: 'customFieldsJson must be a JSON array of {id, value}.' }
            customFields = parsed.map(entry => ({ id: Number(asRecordValue(entry).id), value: asRecordValue(entry).value }))
          } catch {
            return { ok: false, reason: 'customFieldsJson must be a JSON array of {id, value}.' }
          }
        }
        try { const ticket = await client.updateTicket({ ticketId: args.ticketId as number, status: args.status as string, priority: args.priority as string, assigneeId: args.assigneeId as number, groupId: args.groupId as number, tags: (args.tags as string[] | undefined)?.map(tag => clip(tag, 80)), comment: args.comment === undefined ? undefined : clip(args.comment as string, 10000), publicComment: args.commentPublic as boolean, customFields, updatedStamp: args.updatedStamp as string, signal: exec.signal }); return { ok: true, id: ticket.id, subject: clip(ticket.subject, 200), status: ticket.status, priority: ticket.priority, url: ticket.url } } catch (error) { return { ok: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'zendesk_list_users',
      description: 'List Zendesk users with cursor pagination and optional role filter.',
      parameters: { cursor: { type: 'string', description: 'Opaque cursor from a previous response' }, limit: { type: 'integer', description: 'Results per page, 1-100 (default 50)' }, role: { type: 'string', description: 'User role filter' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, name: { type: 'string' }, role: { type: 'string' }, active: { type: 'boolean' }, organizationId: { type: 'number' }, timeZone: { type: 'string' }, createdAt: { type: 'string' } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderUsers(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Zendesk users', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        try {
          const result = await client.listUsers({ cursor: args.cursor as string, limit: args.limit as number, role: args.role as string, signal: exec.signal })
          const items = result.items.map(user => ({ id: user.id, name: user.name, role: user.role, active: user.active, organizationId: user.organizationId, timeZone: user.timeZone, createdAt: user.createdAt }))
          return { found: true, ...result, items, ...renderPageMeta(result) }
        } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'zendesk_get_user',
      description: 'Get one Zendesk user by ID.',
      parameters: { userId: { type: 'integer', required: true, description: 'Zendesk user ID' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, id: { type: 'number' }, name: { type: 'string' }, role: { type: 'string' }, active: { type: 'boolean' }, organizationId: { type: 'number' }, timeZone: { type: 'string' }, createdAt: { type: 'string' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : text(`${clip(value.name, 200)} (#${value.id ?? ''}) role=${value.role ?? ''} active=${value.active ? 'yes' : 'no'} organization=${value.organizationId ?? 0}`),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Zendesk user ${args.userId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Zendesk subdomain and credentials are not configured.' }
        if (!args.userId) return { found: false, reason: 'userId is required.' }
        try {
          const user = await client.getUser(args.userId as number, exec.signal)
          return { found: true, id: user.id, name: user.name, role: user.role, active: user.active, organizationId: user.organizationId, timeZone: user.timeZone, createdAt: user.createdAt }
        } catch (error) { return { found: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'zendesk_list_organizations',
      description: 'List Zendesk organizations with cursor pagination.',
      parameters: { cursor: { type: 'string', description: 'Opaque cursor from a previous response' }, limit: { type: 'integer', description: 'Results per page, 1-100 (default 50)' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, name: { type: 'string' }, domainNames: { type: 'array', items: { type: 'string' } }, groupId: { type: 'number' }, sharedTickets: { type: 'boolean' }, createdAt: { type: 'string' } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderOrganizations(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Zendesk organizations', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        try { const result = await client.listOrganizations({ cursor: args.cursor as string, limit: args.limit as number, signal: exec.signal }); return { found: true, ...result, ...renderPageMeta(result) } } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'zendesk_list_groups',
      description: 'List Zendesk groups with cursor pagination.',
      parameters: { cursor: { type: 'string', description: 'Opaque cursor from a previous response' }, limit: { type: 'integer', description: 'Results per page, 1-100 (default 50)' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, name: { type: 'string' }, deleted: { type: 'boolean' }, createdAt: { type: 'string' } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderGroups(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Zendesk groups', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        try { const result = await client.listGroups({ cursor: args.cursor as string, limit: args.limit as number, signal: exec.signal }); return { found: true, ...result, ...renderPageMeta(result) } } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'zendesk_list_ticket_fields',
      description: 'List Zendesk ticket fields for schema discovery before creating or updating tickets.',
      parameters: { cursor: { type: 'string', description: 'Opaque cursor from a previous response' }, limit: { type: 'integer', description: 'Results per page, 1-100 (default 100)' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'number' }, type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, active: { type: 'boolean' }, required: { type: 'boolean' }, customField: { type: 'boolean' }, options: { type: 'string' } } } }, nextCursor: { type: 'string' }, previousCursor: { type: 'string' }, hasMore: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Zendesk is not configured.') : renderFields(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Zendesk ticket fields', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Zendesk subdomain and credentials are not configured.')
        try { const result = await client.listTicketFields({ cursor: args.cursor as string, limit: args.limit as number, signal: exec.signal }); return { found: true, ...result, ...renderPageMeta(result) } } catch (error) { return unavailable(errorReason(error)) }
      },
    }),
  ]
}
