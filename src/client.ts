/** Zendesk Support API v2 client with OAuth or API-token authentication. */

export interface ZendeskClientOptions {
  subdomain?: string
  baseUrl?: string
  oauthToken?: string
  email?: string
  apiToken?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export class ZendeskError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | null = null) {
    super(message)
    this.name = 'ZendeskError'
  }
}

export interface ZendeskUserInfo {
  id: number
  name: string
  email: string
  role: string
  active: boolean
  organizationId: number
  timeZone: string
  createdAt: string
}

export interface ZendeskTicketInfo {
  id: number
  subject: string
  description: string
  status: string
  priority: string
  type: string
  requesterId: number
  assigneeId: number
  organizationId: number
  groupId: number
  tags: string[]
  createdAt: string
  updatedAt: string
  url: string
}

export interface ZendeskCommentInfo {
  id: number
  authorId: number
  body: string
  htmlBody: string
  public: boolean
  createdAt: string
  attachments: string[]
}

export interface ZendeskOrganizationInfo {
  id: number
  name: string
  domainNames: string[]
  groupId: number
  sharedTickets: boolean
  createdAt: string
}

export interface ZendeskGroupInfo {
  id: number
  name: string
  deleted: boolean
  createdAt: string
}

export interface ZendeskTicketFieldInfo {
  id: number
  type: string
  title: string
  description: string
  active: boolean
  required: boolean
  customField: boolean
  options: string
}

export interface ZendeskPage<T> {
  items: T[]
  nextCursor: string
  previousCursor: string
  hasMore: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function asBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true
}

function mapUser(value: unknown): ZendeskUserInfo {
  const r = asRecord(value)
  return { id: asNumber(r, 'id'), name: asString(r, 'name'), email: asString(r, 'email'), role: asString(r, 'role'), active: asBoolean(r, 'active'), organizationId: asNumber(r, 'organization_id'), timeZone: asString(r, 'time_zone'), createdAt: asString(r, 'created_at') }
}

function mapTicket(value: unknown): ZendeskTicketInfo {
  const r = asRecord(value)
  return { id: asNumber(r, 'id'), subject: asString(r, 'subject'), description: asString(r, 'description'), status: asString(r, 'status'), priority: asString(r, 'priority'), type: asString(r, 'type'), requesterId: asNumber(r, 'requester_id'), assigneeId: asNumber(r, 'assignee_id'), organizationId: asNumber(r, 'organization_id'), groupId: asNumber(r, 'group_id'), tags: asArray(r.tags).map(String), createdAt: asString(r, 'created_at'), updatedAt: asString(r, 'updated_at'), url: asString(r, 'url') }
}

function mapComment(value: unknown): ZendeskCommentInfo {
  const r = asRecord(value)
  const attachments = asArray(r.attachments).map(attachment => asString(asRecord(attachment), 'file_name')).filter(Boolean)
  return { id: asNumber(r, 'id'), authorId: asNumber(r, 'author_id'), body: asString(r, 'body'), htmlBody: asString(r, 'html_body'), public: asBoolean(r, 'public'), createdAt: asString(r, 'created_at'), attachments }
}

function mapOrganization(value: unknown): ZendeskOrganizationInfo {
  const r = asRecord(value)
  return { id: asNumber(r, 'id'), name: asString(r, 'name'), domainNames: asArray(r.domain_names).map(String), groupId: asNumber(r, 'group_id'), sharedTickets: asBoolean(r, 'shared_tickets'), createdAt: asString(r, 'created_at') }
}

function mapGroup(value: unknown): ZendeskGroupInfo {
  const r = asRecord(value)
  return { id: asNumber(r, 'id'), name: asString(r, 'name'), deleted: asBoolean(r, 'deleted'), createdAt: asString(r, 'created_at') }
}

function mapTicketField(value: unknown): ZendeskTicketFieldInfo {
  const r = asRecord(value)
  const options = asArray(r.custom_field_options).map(option => `${asString(asRecord(option), 'name')}=${asString(asRecord(option), 'value')}`).filter(Boolean).join(', ')
  return { id: asNumber(r, 'id'), type: asString(r, 'type'), title: asString(r, 'title'), description: asString(r, 'description'), active: asBoolean(r, 'active'), required: asBoolean(r, 'required'), customField: asBoolean(r, 'custom_field'), options }
}

function cursorFromLink(value: unknown): string {
  const link = typeof value === 'string' ? value : ''
  if (!link) return ''
  try {
    const url = new URL(link)
    return url.searchParams.get('page[after]') || url.searchParams.get('page[before]') || link
  } catch {
    return ''
  }
}

function page<T>(root: Record<string, unknown>, key: string, mapper: (value: unknown) => T): ZendeskPage<T> {
  const links = asRecord(root.links)
  const meta = asRecord(root.meta)
  const nextCursor = asString(meta, 'after_cursor') || cursorFromLink(links.next)
  const previousCursor = asString(meta, 'before_cursor') || cursorFromLink(links.prev)
  return { items: asArray(root[key]).map(mapper), nextCursor, previousCursor, hasMore: asBoolean(meta, 'has_more') || Boolean(nextCursor) }
}

export class ZendeskClient {
  private readonly baseUrl: string
  private readonly oauthToken: string
  private readonly email: string
  private readonly apiToken: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ZendeskClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? (options.subdomain ? `https://${options.subdomain}.zendesk.com` : '')).replace(/\/+$/, '')
    this.oauthToken = options.oauthToken ?? ''
    this.email = options.email ?? ''
    this.apiToken = options.apiToken ?? ''
    this.timeoutMs = options.timeoutMs ?? 15000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
  }

  hasCredentials(): boolean {
    return Boolean(this.baseUrl && (this.oauthToken || (this.email && this.apiToken)))
  }

  private async request<T = unknown>(method: string, path: string, options: { params?: Record<string, unknown>; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    if (!this.hasCredentials()) throw new ZendeskError('Zendesk subdomain and credentials are not configured.', 401)
    const url = new URL(`${this.baseUrl}${path}`)
    if (options.params) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
      }
      url.search = search.toString()
    }
    const headers: Record<string, string> = { accept: 'application/json' }
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    if (this.oauthToken) headers.authorization = `Bearer ${this.oauthToken}`
    else headers.authorization = `Basic ${Buffer.from(`${this.email}/token:${this.apiToken}`).toString('base64')}`
    const controller = new AbortController()
    const combined = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      const response = await this.fetchImpl(url.toString(), { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: combined })
      const raw = await response.text()
      let body: unknown = {}
      if (raw) { try { body = JSON.parse(raw) } catch { body = raw } }
      if (!response.ok) {
        const r = asRecord(body)
        const description = asString(r, 'description') || asString(r, 'error') || raw.slice(0, 300)
        throw new ZendeskError(`Zendesk API ${method} ${path} returned HTTP ${response.status}: ${description}`, response.status, asString(r, 'error') || null)
      }
      return body as T
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async authTest(signal?: AbortSignal): Promise<ZendeskUserInfo> {
    const raw = await this.request<{ user?: unknown }>('GET', '/api/v2/users/me.json', { signal })
    return mapUser(asRecord(raw).user)
  }

  async listTickets(options: { cursor?: string; limit?: number; status?: string; assigneeId?: number; requesterId?: number; updatedSince?: string; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskTicketInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/v2/tickets.json', { params: { 'page[after]': options.cursor, 'page[size]': options.limit ?? 50, status: options.status, assignee_id: options.assigneeId, requester_id: options.requesterId, 'updated_since': options.updatedSince }, signal: options.signal })
    return page(raw, 'tickets', mapTicket)
  }

  async searchTickets(query: string, options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskTicketInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/v2/search.json', { params: { query: `type:ticket ${query}`, 'page[after]': options.cursor, 'page[size]': options.limit ?? 50 }, signal: options.signal })
    return page(raw, 'results', mapTicket)
  }

  async getTicket(ticketId: number, signal?: AbortSignal): Promise<ZendeskTicketInfo> {
    const raw = await this.request<{ ticket?: unknown }>('GET', `/api/v2/tickets/${encodeURIComponent(ticketId)}.json`, { signal })
    return mapTicket(asRecord(raw).ticket)
  }

  async listTicketComments(ticketId: number, options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskCommentInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', `/api/v2/tickets/${encodeURIComponent(ticketId)}/comments.json`, { params: { 'page[after]': options.cursor, 'page[size]': options.limit ?? 50 }, signal: options.signal })
    return page(raw, 'comments', mapComment)
  }

  async createTicket(options: { subject: string; comment: string; publicComment: boolean; requesterId?: number; priority?: string; type?: string; tags?: string[]; assigneeId?: number; groupId?: number; signal?: AbortSignal }): Promise<ZendeskTicketInfo> {
    if (typeof options.publicComment !== 'boolean') throw new ZendeskError('publicComment must be explicitly set for a ticket comment.', 400)
    const ticket: Record<string, unknown> = { subject: options.subject, comment: { body: options.comment, public: options.publicComment } }
    for (const [key, value] of Object.entries({ requester_id: options.requesterId, priority: options.priority, type: options.type, tags: options.tags, assignee_id: options.assigneeId, group_id: options.groupId })) if (value !== undefined) ticket[key] = value
    const raw = await this.request<{ ticket?: unknown }>('POST', '/api/v2/tickets.json', { body: { ticket }, signal: options.signal })
    return mapTicket(asRecord(raw).ticket)
  }

  async updateTicket(options: { ticketId: number; status?: string; priority?: string; assigneeId?: number; groupId?: number; tags?: string[]; comment?: string; publicComment?: boolean; customFields?: Array<{ id: number; value: unknown }>; updatedStamp?: string; signal?: AbortSignal }): Promise<ZendeskTicketInfo> {
    const ticket: Record<string, unknown> = {}
    for (const [key, value] of Object.entries({ status: options.status, priority: options.priority, assignee_id: options.assigneeId, group_id: options.groupId, tags: options.tags })) if (value !== undefined) ticket[key] = value
    if (options.customFields?.length) ticket.custom_fields = options.customFields
    if (options.comment !== undefined) {
      if (typeof options.publicComment !== 'boolean') throw new ZendeskError('publicComment must be explicitly set when adding a comment.', 400)
      ticket.comment = { body: options.comment, public: options.publicComment }
    }
    if (options.updatedStamp !== undefined) ticket.updated_stamp = options.updatedStamp
    const params = options.updatedStamp !== undefined ? { safe_update: true } : undefined
    const raw = await this.request<{ ticket?: unknown }>('PUT', `/api/v2/tickets/${encodeURIComponent(options.ticketId)}.json`, { params, body: { ticket }, signal: options.signal })
    return mapTicket(asRecord(raw).ticket)
  }

  async listUsers(options: { cursor?: string; limit?: number; role?: string; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskUserInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/v2/users.json', { params: { 'page[after]': options.cursor, 'page[size]': options.limit ?? 50, role: options.role }, signal: options.signal })
    return page(raw, 'users', mapUser)
  }

  async getUser(userId: number, signal?: AbortSignal): Promise<ZendeskUserInfo> {
    const raw = await this.request<{ user?: unknown }>('GET', `/api/v2/users/${encodeURIComponent(userId)}.json`, { signal })
    return mapUser(asRecord(raw).user)
  }

  async listOrganizations(options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskOrganizationInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/v2/organizations.json', { params: { 'page[after]': options.cursor, 'page[size]': options.limit ?? 50 }, signal: options.signal })
    return page(raw, 'organizations', mapOrganization)
  }

  async listGroups(options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskGroupInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/v2/groups.json', { params: { 'page[after]': options.cursor, 'page[size]': options.limit ?? 50 }, signal: options.signal })
    return page(raw, 'groups', mapGroup)
  }

  async listTicketFields(options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ZendeskPage<ZendeskTicketFieldInfo>> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/v2/ticket_fields.json', { params: { 'page[after]': options.cursor, 'page[size]': options.limit ?? 100 }, signal: options.signal })
    return page(raw, 'ticket_fields', mapTicketField)
  }
}
