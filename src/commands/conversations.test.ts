import { describe, expect, it } from 'vitest';
import { createConversationsCommand } from './conversations.js';

describe('conversations command', () => {
  // The fork uses flat attachment commands; upstream nests them under an
  // `attachments` group. Merging upstream verbatim registers a second
  // `attachments` command, which Commander rejects at module scope — taking
  // the whole binary down, `helpscout mcp` included. These assertions pin the
  // fork's shape so that collision cannot come back on the next sync.
  it('registers attachment commands flat, not under an "attachments" group', () => {
    const conversations = createConversationsCommand();
    const names = conversations.commands.map((command) => command.name());

    expect(names).toContain('attachments');
    expect(names).toContain('attachment-download');
    expect(names).toContain('attachment-upload');
    expect(names).toContain('attachment-delete');

    // `attachments` must stay a leaf listing command, not a parent group.
    const attachments = conversations.commands.find((command) => command.name() === 'attachments');
    expect(attachments?.commands).toHaveLength(0);
  });

  it('registers attachment-download with output and force options', () => {
    const conversations = createConversationsCommand();
    const download = conversations.commands.find(
      (command) => command.name() === 'attachment-download'
    );

    expect(download).toBeDefined();
    expect(download?.registeredArguments.map((argument) => argument.name())).toEqual([
      'conversationId',
      'attachmentId',
    ]);
    expect(download?.options.map((option) => option.flags)).toEqual([
      '-o, --output <path>',
      '-f, --force',
    ]);
  });
});
