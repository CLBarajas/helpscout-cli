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
        'update_conversation_status',
        'create_note',
      ])
    );
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
