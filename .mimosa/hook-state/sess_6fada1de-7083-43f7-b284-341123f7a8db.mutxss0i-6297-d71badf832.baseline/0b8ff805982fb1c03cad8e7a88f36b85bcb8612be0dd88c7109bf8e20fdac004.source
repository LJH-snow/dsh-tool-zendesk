import { describe, expect, it } from 'vitest'
import { ZendeskClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

describe('dsh-tool-zendesk tools', () => {
  it('registers twelve tools', () => {
    const names = createTools(new ZendeskClient({ subdomain: 'example', oauthToken: 'token' })).map(tool => tool.name)
    expect(names).toEqual([
      'zendesk_auth_test',
      'zendesk_list_tickets',
      'zendesk_search_tickets',
      'zendesk_get_ticket',
      'zendesk_list_ticket_comments',
      'zendesk_create_ticket',
      'zendesk_update_ticket',
      'zendesk_list_users',
      'zendesk_get_user',
      'zendesk_list_organizations',
      'zendesk_list_groups',
      'zendesk_list_ticket_fields',
    ])
  })

  it('returns safe unavailable values without credentials', async () => {
    const tools = createTools(new ZendeskClient({}))
    const auth = tools.find(tool => tool.name === 'zendesk_auth_test')!
    const list = tools.find(tool => tool.name === 'zendesk_list_tickets')!
    expect(await auth.execute({}, {})).toMatchObject({ ok: false, reason: 'Zendesk subdomain and credentials are not configured.' })
    expect(await list.execute({}, {})).toMatchObject({ found: false, items: [], reason: 'Zendesk subdomain and credentials are not configured.' })
  })

  it('renders ticket summaries and write results', () => {
    const tools = createTools(new ZendeskClient({ subdomain: 'example', oauthToken: 'token' }))
    const list = tools.find(tool => tool.name === 'zendesk_list_tickets')!
    const listView = list.output.render({}, { found: true, items: [{ id: 10, subject: 'Broken login', status: 'open', priority: 'high', requesterId: 1, assigneeId: 2, tags: ['bug'] }] }) as Array<{ text: string }>
    expect(listView[0].text).toContain('#10 Broken login status=open priority=high')
    expect(listView[0].text).toContain('tags=bug')

    const create = tools.find(tool => tool.name === 'zendesk_create_ticket')!
    const createView = create.output.render({}, { ok: true, id: 11, subject: 'New issue', status: 'new', url: 'https://example/tickets/11' }) as Array<{ text: string }>
    expect(createView[0].text).toContain('Created Zendesk ticket #11 New issue')

    const update = tools.find(tool => tool.name === 'zendesk_update_ticket')!
    const updateView = update.output.render({}, { ok: true, id: 11, subject: 'New issue', status: 'pending', priority: 'normal' }) as Array<{ text: string }>
    expect(updateView[0].text).toContain('Updated Zendesk ticket #11 New issue')
    expect(updateView[0].text).toContain('status=pending priority=normal')
  })
})
