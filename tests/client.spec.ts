import { describe, expect, it, vi } from 'vitest'
import { ZendeskClient, ZendeskError } from '../src/client.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function client(fetchImpl: ReturnType<typeof vi.fn>) {
  return new ZendeskClient({ subdomain: 'example', email: 'agent@example.com', apiToken: 'api-secret', fetchImpl })
}

describe('ZendeskClient', () => {
  it('authenticates with API-token Basic auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ user: { id: 1, name: 'Agent', email: 'agent@example.com', role: 'agent', active: true } }))
    const result = await client(fetchImpl).authTest()
    expect(result).toMatchObject({ id: 1, name: 'Agent', role: 'agent', active: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.zendesk.com/api/v2/users/me.json')
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('agent@example.com/token:api-secret').toString('base64')}`)
  })

  it('uses OAuth bearer auth and cursor pagination for tickets', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tickets: [{ id: 10, subject: 'Broken login', status: 'open', priority: 'high', tags: ['login'] }], meta: { has_more: true, after_cursor: 'next-cursor', before_cursor: 'previous-cursor' } }))
    const pd = new ZendeskClient({ subdomain: 'example', oauthToken: 'oauth-secret', fetchImpl })
    const result = await pd.listTickets({ cursor: 'old-cursor', limit: 20, status: 'open' })
    expect(result).toMatchObject({ hasMore: true, nextCursor: 'next-cursor', previousCursor: 'previous-cursor' })
    expect(result.items[0]).toMatchObject({ id: 10, subject: 'Broken login', status: 'open', tags: ['login'] })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('page%5Bafter%5D=old-cursor')
    expect(url).toContain('page%5Bsize%5D=20')
    expect(url).toContain('status=open')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer oauth-secret')
  })

  it('searches and gets ticket comments', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 10, subject: 'Broken login', status: 'open' }], links: { next: 'https://example.zendesk.com/api/v2/search.json?page%5Bafter%5D=next-cursor' } }))
      .mockResolvedValueOnce(jsonResponse({ comments: [{ id: 99, author_id: 1, body: 'Investigating', public: false, attachments: [{ file_name: 'log.txt' }] }], meta: { has_more: false } }))
    const pd = client(fetchImpl)
    const search = await pd.searchTickets('login')
    const comments = await pd.listTicketComments(10)
    expect(search.items[0]).toMatchObject({ id: 10, subject: 'Broken login' })
    expect(search.nextCursor).toBe('next-cursor')
    expect(comments.items[0]).toMatchObject({ id: 99, authorId: 1, body: 'Investigating', public: false, attachments: ['log.txt'] })
  })

  it('creates and updates a ticket with explicit bodies', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ticket: { id: 11, subject: 'New issue', status: 'new', url: 'https://example.zendesk.com/agent/tickets/11' } }))
      .mockResolvedValueOnce(jsonResponse({ ticket: { id: 11, subject: 'New issue', status: 'pending', priority: 'normal', url: 'https://example.zendesk.com/agent/tickets/11' } }))
    const pd = client(fetchImpl)
    const created = await pd.createTicket({ subject: 'New issue', comment: 'Please investigate', publicComment: false, tags: ['bug'] })
    const updated = await pd.updateTicket({ ticketId: 11, status: 'pending', priority: 'normal', comment: 'Waiting for logs', publicComment: false, updatedStamp: '2026-01-01T00:00:00Z' })
    expect(created).toMatchObject({ id: 11, status: 'new' })
    expect(updated).toMatchObject({ id: 11, status: 'pending', priority: 'normal' })
    const firstInit = (fetchImpl.mock.calls[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(firstInit.body))).toEqual({ ticket: { subject: 'New issue', comment: { body: 'Please investigate', public: false }, tags: ['bug'] } })
    const secondCall = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(secondCall[0]).toContain('safe_update=true')
    const secondInit = secondCall[1]
    expect(JSON.parse(String(secondInit.body))).toEqual({ ticket: { status: 'pending', priority: 'normal', comment: { body: 'Waiting for logs', public: false }, updated_stamp: '2026-01-01T00:00:00Z' } })
  })

  it('maps users, organizations, groups, and ticket fields', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ users: [{ id: 1, name: 'Agent', role: 'agent', active: true }], meta: { has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ organizations: [{ id: 2, name: 'Acme', domain_names: ['acme.test'], shared_tickets: true }], meta: { has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ groups: [{ id: 3, name: 'Support', deleted: false }], meta: { has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ ticket_fields: [{ id: 4, title: 'Environment', type: 'tagger', custom_field: true, custom_field_options: [{ name: 'Prod', value: 'prod' }] }], meta: { has_more: false } }))
    const pd = client(fetchImpl)
    expect((await pd.listUsers()).items[0]).toMatchObject({ id: 1, name: 'Agent' })
    expect((await pd.listOrganizations()).items[0]).toMatchObject({ id: 2, name: 'Acme', domainNames: ['acme.test'] })
    expect((await pd.listGroups()).items[0]).toMatchObject({ id: 3, name: 'Support' })
    expect((await pd.listTicketFields()).items[0]).toMatchObject({ id: 4, title: 'Environment', options: 'Prod=prod' })
  })

  it('updates custom fields with the Zendesk custom_fields body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ticket: { id: 11, subject: 'New issue', status: 'open' } }))
    await client(fetchImpl).updateTicket({ ticketId: 11, customFields: [{ id: 123, value: 'prod' }] })
    const init = (fetchImpl.mock.calls[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({ ticket: { custom_fields: [{ id: 123, value: 'prod' }] } })
  })

  it('requires explicit comment visibility for writes', async () => {
    const fetchImpl = vi.fn()
    const pd = client(fetchImpl)
    await expect(pd.createTicket({ subject: 'Issue', comment: 'Details' } as never)).rejects.toThrow('publicComment must be explicitly set')
    await expect(pd.updateTicket({ ticketId: 11, comment: 'Details' } as never)).rejects.toThrow('publicComment must be explicitly set')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects missing credentials and maps API failures', async () => {
    await expect(new ZendeskClient({}).authTest()).rejects.toThrow(ZendeskError)
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'RecordNotFound', description: 'Ticket does not exist' }, 404))
    await expect(client(fetchImpl).getTicket(999)).rejects.toThrow('Ticket does not exist')
  })
})
