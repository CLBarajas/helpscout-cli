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

function paginatedThreads(threads: ReturnType<typeof thread>[], page: number, totalPages: number) {
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

  it('downloads attachment file bytes with response metadata', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff]);
    fetchMock.mockResolvedValueOnce(
      new Response(bytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.length),
          'Content-Disposition': 'attachment; filename="Invoice-BFFE9E51-0026.pdf"',
        },
      })
    );

    const attachment = await client.downloadAttachment(3361978051, 933302294);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.helpscout.net/v2/conversations/3361978051/attachments/933302294/file',
      expect.objectContaining({ method: 'GET' })
    );
    expect(Array.from(attachment.data)).toEqual(Array.from(bytes));
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.contentLength).toBe(bytes.length);
    expect(attachment.contentDisposition).toBe('attachment; filename="Invoice-BFFE9E51-0026.pdf"');
  });

  it('refreshes auth and retries attachment downloads after 401 responses', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    fetchMock
      .mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'fresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
      )
      .mockResolvedValueOnce(
        new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } })
      );

    const attachment = await client.downloadAttachment(3361978051, 933302294);

    expect(Array.from(attachment.data)).toEqual(Array.from(bytes));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.helpscout.net/v2/conversations/3361978051/attachments/933302294/file'
    );
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.helpscout.net/v2/oauth2/token');
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://api.helpscout.net/v2/conversations/3361978051/attachments/933302294/file'
    );
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      })
    );
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
