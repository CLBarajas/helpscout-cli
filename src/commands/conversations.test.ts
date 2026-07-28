import { describe, expect, it } from 'vitest';
import { createConversationsCommand } from './conversations.js';

describe('conversations command', () => {
  it('registers the attachment download command and output options', () => {
    const conversations = createConversationsCommand();
    const attachments = conversations.commands.find((command) => command.name() === 'attachments');
    const download = attachments?.commands.find((command) => command.name() === 'download');

    expect(attachments).toBeDefined();
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
