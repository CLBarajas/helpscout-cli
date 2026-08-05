import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let mcpServer: typeof import('./server.js');

beforeAll(async () => {
  Object.assign(globalThis, {
    __VERSION__: 'test',
    __HOMEPAGE__: '',
  });
  mcpServer = await import('./server.js');
});

afterAll(() => {
  delete (globalThis as { __VERSION__?: string }).__VERSION__;
  delete (globalThis as { __HOMEPAGE__?: string }).__HOMEPAGE__;
});

describe('Help Scout MCP server helpers', () => {
  it('registers the conversation tools needed for GTD triage', () => {
    const toolNames = mcpServer.getRegisteredToolsForTesting().map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'get_conversation',
        'get_conversation_threads',
        'download_attachment',
        'update_conversation_status',
        'create_note',
      ])
    );
  });

  // Locks the customFields[].type defect: the conversation list/search embed
  // returns custom fields as {id, name, value, text} with NO `type`, so a schema
  // that required `type` made search_by_customer (and search/list_conversations,
  // get_conversation) fail output validation on every conversation carrying
  // custom fields. This payload is a verbatim sample of that real embed shape.
  it('validates conversation custom fields without a `type` (real embed shape)', () => {
    const conversationWithEmbedCustomFields = {
      id: 3353621870,
      number: 185469,
      type: 'email',
      status: 'active',
      state: 'published',
      subject: 'Re: automatic end to recording',
      preview: 'Hi Chris, I have made that update...',
      mailboxId: 164710,
      createdAt: '2026-06-12T16:03:11Z',
      // The list/search embed shape: id/name/value/text, never `type`.
      customFields: [
        { id: 23628, name: 'Topic', value: '116010', text: 'App Support' },
        { id: 23657, name: 'App', value: '116013', text: 'Audio Hijack' },
      ],
    };

    const result = mcpServer.outputSchemasForTesting.searchByCustomer.safeParse({
      conversations: [conversationWithEmbedCustomFields],
      meta: {
        email: 'pm@philxmilstein.com',
        domain: 'philxmilstein.com',
        domainSearchSkipped: false,
        emailResults: 1,
        domainResults: 0,
        totalAfterDedup: 1,
      },
    });

    expect(result.success).toBe(true);

    // The same shared conversationSchema backs search/list, so the fix covers
    // those latent paths too.
    expect(
      mcpServer.outputSchemasForTesting.searchConversations.safeParse({
        conversations: [conversationWithEmbedCustomFields],
      }).success
    ).toBe(true);
    expect(
      mcpServer.outputSchemasForTesting.listConversations.safeParse({
        conversations: [conversationWithEmbedCustomFields],
        page: { size: 25, totalElements: 1, totalPages: 1, number: 1 },
      }).success
    ).toBe(true);
  });

  // Help Scout system-action threads (assigned/moved/merged) carry
  // action.associatedEntities. The action sub-object must stay passthrough so
  // its closed JSON output schema doesn't reject real payloads downstream.
  it('preserves unknown action fields on threads instead of rejecting them', () => {
    const thread = {
      id: 1,
      type: 'lineitem',
      createdAt: '2026-01-01T00:00:00Z',
      action: {
        type: 'movedFromMailbox',
        text: 'Moved from Sales',
        associatedEntities: { mailboxIds: [42] },
      },
    };

    const parsed = mcpServer.getThreadSchemaForTesting().parse(thread);

    expect(parsed.action?.associatedEntities).toEqual({ mailboxIds: [42] });
  });

  // Locks the search_tools discovery defect (was: 22 remembered vs 62 served).
  // Every tool registered on the MCP server must have a matching rememberTool()
  // entry, or it becomes invisible to the search_tools registry.
  it('remembers every tool registered on the MCP server', () => {
    const remembered = new Set(
      mcpServer.getRegisteredToolsForTesting().map((tool) => tool.name)
    );
    const served = mcpServer.getServerToolNamesForTesting();

    expect(served.length).toBeGreaterThan(0);

    const servedNotRemembered = served.filter((name) => !remembered.has(name));
    expect(servedNotRemembered).toEqual([]);

    const servedSet = new Set(served);
    const rememberedNotServed = [...remembered].filter((name) => !servedSet.has(name));
    expect(rememberedNotServed).toEqual([]);
  });
});
