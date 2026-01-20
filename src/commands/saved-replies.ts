import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';

export function createSavedRepliesCommand(): Command {
  const cmd = new Command('saved-replies').description('Saved reply operations');

  cmd
    .command('list')
    .description('List saved replies for a mailbox')
    .argument('<mailboxId>', 'Mailbox ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (mailboxId: string, options: { page?: string }) => {
        const result = await client.listSavedReplies(
          parseIdArg(mailboxId, 'mailbox'),
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  cmd
    .command('view')
    .description('View a saved reply (includes full text)')
    .argument('<mailboxId>', 'Mailbox ID')
    .argument('<id>', 'Saved Reply ID')
    .action(
      withErrorHandling(async (mailboxId: string, id: string) => {
        const savedReply = await client.getSavedReply(
          parseIdArg(mailboxId, 'mailbox'),
          parseIdArg(id, 'saved reply')
        );
        outputJson(savedReply);
      })
    );

  return cmd;
}
