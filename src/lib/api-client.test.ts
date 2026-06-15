import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpScoutClient } from './api-client.js';

function thread(id: number, type = 'customer') {
  return {
    id,
    type,
    body: `<p>Thread ${id}</p>`,
    createdAt: `2026-06-0${id}T00:00:00Z`,
  };
}

function paginatedThreads(threads: Array<Record<string, unknown>>, page: number, totalPages: number) {
  return Response.json({
    _embedded: { threads },
    page: {
      size: threads.length,
      totalElements: 3,
      totalPages,
      number: page,
    },
  });
}

describe('HelpScoutClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: HelpScoutClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    client = new HelpScoutClient({
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      getAppId: vi.fn().mockResolvedValue('app-id'),
      getAppSecret: vi.fn().mockResolvedValue('app-secret'),
      getRefreshToken: vi.fn().mockResolvedValue(null),
      setAccessToken: vi.fn().mockResolvedValue(true),
      setRefreshToken: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it('fetches all conversation thread pages', async () => {
    fetchMock
      .mockResolvedValueOnce(paginatedThreads([thread(1)], 1, 2))
      .mockResolvedValueOnce(paginatedThreads([thread(2, 'note'), thread(3, 'lineitem')], 2, 2));

    const threads = await client.getConversationThreads(123);

    expect(threads).toEqual([thread(1), thread(2, 'note'), thread(3, 'lineitem')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.helpscout.net/v2/conversations/123/threads?page=1'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.helpscout.net/v2/conversations/123/threads?page=2'
    );
  });

  it('stops fetching thread pages after maxResults is reached', async () => {
    fetchMock.mockResolvedValueOnce(paginatedThreads([thread(1), thread(2, 'note')], 1, 2));

    const threads = await client.getConversationThreads(123, 1);

    expect(threads).toEqual([thread(1)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a status patch request', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.updateConversationStatus(123, 'closed');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/conversations/123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ op: 'replace', path: '/status', value: 'closed' }),
      })
    );
  });

  it('hits the v3 path and preserves system_user attribution on getConversationV3', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: 123,
        createdBy: { id: 0, type: 'system_user' },
        assignee: { id: 0, type: 'system_user', first: 'AI', last: 'Agent', email: '' },
        closedByUser: { id: 0, type: 'system_user' },
      })
    );

    const conversation = await client.getConversationV3(123);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v3/conversations/123');
    expect(conversation.createdBy?.type).toBe('system_user');
    expect(conversation.assignee?.type).toBe('system_user');
    expect(conversation.closedByUser?.type).toBe('system_user');
  });

  it('fetches threads from the v3 path when version is v3', async () => {
    fetchMock.mockResolvedValueOnce(
      paginatedThreads([{ ...thread(1), createdBy: { id: 0, type: 'system_user' } }], 1, 1)
    );

    const threads = await client.getConversationThreads(123, undefined, 'v3');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.helpscout.net/v3/conversations/123/threads?page=1'
    );
    expect(threads[0].createdBy?.type).toBe('system_user');
  });

  it('downloads an attachment as raw bytes from the /file endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    );

    const buf = await client.downloadAttachment(123, 456);

    expect(buf).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.helpscout.net/v2/conversations/123/attachments/456/file'
    );
    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Accept).toBe('application/octet-stream');
    expect(init.redirect).toBe('manual');
  });

  it('follows a storage redirect without forwarding the Authorization header', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://s3.example.com/signed/x.png?sig=abc' },
        })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 9]), { status: 200 }));

    const buf = await client.downloadAttachment(123, 456);

    expect(buf).toEqual(Buffer.from([9, 9]));
    expect(fetchMock.mock.calls[1][0]).toBe('https://s3.example.com/signed/x.png?sig=abc');
    expect(fetchMock.mock.calls[1][1]).toBeUndefined();
  });

  it('throws HelpScoutApiError on a 404 so the command can fall back to base64', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'not found' }, { status: 404 }));

    await expect(client.downloadAttachment(123, 456)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates a customer thread and returns the new thread id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'Resource-ID': '999', Location: '/v2/conversations/123/threads/999' },
      })
    );

    const result = await client.createCustomerThread(123, {
      text: 'Imported message',
      customer: { id: 42 },
    });

    expect(result.id).toBe(999);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/conversations/123/customer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'Imported message', customer: { id: 42 } }),
      })
    );
  });

  it('creates chat and phone threads at their respective paths', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { 'Resource-ID': '5' } }))
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { 'Resource-ID': '6' } }));

    await client.createChatThread(123, { text: 'hi', customer: { email: 'a@b.com' } });
    await client.createPhoneThread(123, { text: 'called in', customer: { id: 7 } });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/conversations/123/chats');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.helpscout.net/v2/conversations/123/phones');
  });

  it('gets thread source as raw RFC 822 with the message/rfc822 Accept header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('From: a@b.com\r\nSubject: Hi\r\n\r\nbody', { status: 200 })
    );

    const raw = await client.getThreadSourceRfc822(123, 456);

    expect(raw).toBe('From: a@b.com\r\nSubject: Hi\r\n\r\nbody');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Accept).toBe(
      'message/rfc822'
    );
  });

  it('publishes a thread schedule with a state-replace PATCH', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.publishThreadSchedule(123, 456);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/conversations/123/threads/456/schedule',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ op: 'replace', path: '/state', value: 'published' }),
      })
    );
  });

  it('walks v3 customer pages via the _links.next cursor', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          _embedded: { customers: [{ id: 1, createdAt: '2026-06-02T00:00:00Z' }] },
          _links: { next: { href: 'https://api.helpscout.net/v3/customers?cursor=ABC123' } },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          _embedded: { customers: [{ id: 2, createdAt: '2026-06-01T00:00:00Z' }] },
          _links: {},
        })
      );

    const customers = await client.listAllCustomersV3();

    expect(customers.map((c) => c.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v3/customers');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.helpscout.net/v3/customers?cursor=ABC123');
  });

  it('stops the v3 cursor-walk at maxResults', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        _embedded: { customers: [{ id: 1 }, { id: 2 }] },
        _links: { next: { href: 'https://api.helpscout.net/v3/customers?cursor=X' } },
      })
    );

    const customers = await client.listAllCustomersV3({}, 1);

    expect(customers).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deletes a customer asynchronously via async=true', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    await client.deleteCustomerAsync(42);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/customers/42?async=true');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('reads the hyphenated customer-properties embedded key', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ _embedded: { 'customer-properties': [{ type: 'text', slug: 'car', name: 'Car' }] } })
    );

    const defs = await client.listCustomerPropertyDefinitions();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/customer-properties');
    expect(defs).toEqual([{ type: 'text', slug: 'car', name: 'Car' }]);
  });

  it('sends customer property updates as a JSON Patch array', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const ops = [
      { op: 'replace' as const, path: '/car', value: 'Tesla' },
      { op: 'remove' as const, path: '/revenue' },
    ];

    await client.updateCustomerProperties(100, ops);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/customers/100/properties',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(ops) })
    );
  });

  it('reads the hyphenated social-profiles embedded key', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ _embedded: { 'social-profiles': [{ id: 7, type: 'twitter', value: '@x' }] } })
    );

    const profiles = await client.listCustomerSocialProfiles(42);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.helpscout.net/v2/customers/42/social-profiles'
    );
    expect(profiles).toEqual([{ id: 7, type: 'twitter', value: '@x' }]);
  });

  it('gets a customer address from the singular address path', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 1, city: 'Dallas', state: 'TX' }));

    const address = await client.getCustomerAddress(42);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/customers/42/address');
    expect(address.city).toBe('Dallas');
  });

  it('creates a user via POST /users and parses the Resource-ID header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'Resource-ID': '4', Location: 'https://api.helpscout.net/v2/users/4' },
      })
    );

    const result = await client.createUser({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'user',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          role: 'user',
        }),
      })
    );
    expect(result.id).toBe(4);
  });

  it('deletes a user via DELETE /users/{id}', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.deleteUser(4);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/users/4');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('gets a single satisfaction rating by id', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ id: 77, rating: 'Great', ticketId: 123, createdAt: '2026-06-01T00:00:00Z' })
    );

    const rating = await client.getSatisfactionRating(77);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/ratings/77');
    expect(rating.rating).toBe('Great');
  });

  it('hits replies-sent with officeHours + viewBy', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ current: [{ date: '2026-06-01T00:00:00Z', replies: 42 }] })
    );

    const report = await client.getRepliesSentReport({
      start: '2026-06-01T00:00:00Z',
      end: '2026-06-30T23:59:59Z',
      officeHours: true,
      viewBy: 'week',
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('https://api.helpscout.net/v2/reports/productivity/replies-sent');
    expect(url).toContain('officeHours=true');
    expect(url).toContain('viewBy=week');
    expect(report.current[0].replies).toBe(42);
  });

  it('hits the docs report with sites and omits inbox-only filters', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ current: { searches: 100 }, topArticles: [{ id: 'a1', name: 'Start', count: 5 }] })
    );

    await client.getDocsReport({
      start: '2026-06-01T00:00:00Z',
      end: '2026-06-30T23:59:59Z',
      sites: '123,456',
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('https://api.helpscout.net/v2/reports/docs');
    expect(url).toContain('sites=123%2C456');
    expect(url).not.toContain('mailboxes=');
    expect(url).not.toContain('viewBy=');
  });

  it('hits the fields-drilldown path with field + fieldid', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ conversations: { pages: 1, page: 1, count: 0, results: [] } })
    );

    await client.getConversationsFieldDrilldownReport({
      start: '2026-06-01T00:00:00Z',
      end: '2026-06-30T23:59:59Z',
      field: 'tagid',
      fieldid: 99787,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('https://api.helpscout.net/v2/reports/conversations/fields-drilldown');
    expect(url).toContain('field=tagid');
    expect(url).toContain('fieldid=99787');
  });

  it('sends the required user param on the user resolutions report', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ current: [{ date: '2026-06-01T00:00:00Z', resolved: 12 }] })
    );

    const report = await client.getUserResolutions({
      user: 42,
      start: '2026-06-01T00:00:00Z',
      end: '2026-06-08T00:00:00Z',
      viewBy: 'day',
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v2/reports/user/resolutions');
    expect(url.searchParams.get('user')).toBe('42');
    expect(report.current[0].resolved).toBe(12);
  });

  it('hits /reports/user/ratings (not happiness-drilldown) for the user happiness drilldown', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ page: 1, pages: 1, count: 0, results: [] }));

    await client.getUserHappinessRatings({
      user: 7,
      start: '2026-06-01T00:00:00Z',
      end: '2026-06-08T00:00:00Z',
      rating: 'great',
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v2/reports/user/ratings');
    expect(url.searchParams.get('user')).toBe('7');
  });

  it('requests the chat channel report with no user param', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ current: { startDate: '', endDate: '' } }));

    await client.getChatReport({
      start: '2026-06-01T00:00:00Z',
      end: '2026-06-08T00:00:00Z',
      officeHours: true,
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v2/reports/chat');
    expect(url.searchParams.get('officeHours')).toBe('true');
    expect(url.searchParams.has('user')).toBe(false);
  });

  it('lists inbox folders for a mailbox', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        _embedded: {
          folders: [
            { id: 1, type: 'mytickets', name: 'Mine', totalCount: 3, activeCount: 2, updatedAt: '2026-06-01T00:00:00Z' },
          ],
        },
        page: { size: 1, totalElements: 1, totalPages: 1, number: 1 },
      })
    );

    const result = await client.listMailboxFolders(99);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/mailboxes/99/folders');
    expect(result.folders[0].name).toBe('Mine');
  });

  it('merges existing routing config on update (PUT replaces all fields)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          state: 'enabled',
          assignmentLimit: 10,
          assignmentMethod: 'round_robin',
          userIds: [1, 2],
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.updateRoutingConfig(99, { state: 'disabled' });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.helpscout.net/v2/mailboxes/99/routing',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          state: 'disabled',
          assignmentLimit: 10,
          assignmentMethod: 'round_robin',
          userIds: [1, 2],
        }),
      })
    );
  });

  it('lists system users from the v3 path with the underscored system_users key', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        _embedded: { system_users: [{ id: 0, type: 'system_user', firstName: 'AI', lastName: 'Agent' }] },
        page: { size: 1, totalElements: 1, totalPages: 1, number: 1 },
      })
    );

    const result = await client.listSystemUsers();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v3/system-users');
    expect(result.systemUsers[0].type).toBe('system_user');
  });

  it('reads the webhooks embedded key on listWebhooks', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        _embedded: {
          webhooks: [{ id: 10, url: 'https://x.test', state: 'enabled', events: ['convo.created'] }],
        },
        page: { size: 50, totalElements: 1, totalPages: 1, number: 1 },
      })
    );

    const result = await client.listWebhooks();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/webhooks');
    expect(result.webhooks[0].id).toBe(10);
  });

  it('posts a create webhook body and parses the Resource-ID header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'Resource-ID': '99', Location: 'https://api.helpscout.net/v2/webhooks/99' },
      })
    );

    const result = await client.createWebhook({
      url: 'https://x.test/hook',
      events: ['convo.assigned'],
      secret: 'mZ9XbGHodX',
      payloadVersion: 'V3',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/webhooks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://x.test/hook',
          events: ['convo.assigned'],
          secret: 'mZ9XbGHodX',
          payloadVersion: 'V3',
        }),
      })
    );
    expect(result.id).toBe(99);
  });

  it('preserves conversationCount on getCustomer', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ id: 42, createdAt: '2026-01-01T00:00:00Z', conversationCount: 10 })
    );

    const customer = await client.getCustomer(42);

    expect(customer.conversationCount).toBe(10);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.helpscout.net/v2/customers/42');
  });

  it('sends private notes with optional status', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));

    await client.createNote(123, { text: 'No action needed.', status: 'closed' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/conversations/123/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'No action needed.', status: 'closed' }),
      })
    );
  });
});
