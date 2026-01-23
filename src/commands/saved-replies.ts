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

  cmd
    .command('create')
    .description('Create a new saved reply')
    .argument('<mailboxId>', 'Mailbox ID')
    .requiredOption('--name <name>', 'Name for the saved reply')
    .requiredOption('--text <text>', 'HTML text content of the saved reply')
    .action(
      withErrorHandling(async (mailboxId: string, options: { name: string; text: string }) => {
        await client.createSavedReply(parseIdArg(mailboxId, 'mailbox'), {
          name: options.name,
          text: options.text,
        });
        outputJson({ success: true, message: 'Saved reply created' });
      })
    );

  cmd
    .command('update')
    .description('Update an existing saved reply')
    .argument('<mailboxId>', 'Mailbox ID')
    .argument('<id>', 'Saved Reply ID')
    .option('--name <name>', 'New name for the saved reply')
    .option('--text <text>', 'New HTML text content')
    .action(
      withErrorHandling(
        async (mailboxId: string, id: string, options: { name?: string; text?: string }) => {
          if (!options.name && !options.text) {
            outputJson({ error: 'At least one of --name or --text is required' });
            return;
          }
          const data: { name?: string; text?: string } = {};
          if (options.name) data.name = options.name;
          if (options.text) data.text = options.text;
          await client.updateSavedReply(
            parseIdArg(mailboxId, 'mailbox'),
            parseIdArg(id, 'saved reply'),
            data
          );
          outputJson({ success: true, message: 'Saved reply updated' });
        }
      )
    );

  cmd
    .command('delete')
    .description('Delete a saved reply')
    .argument('<mailboxId>', 'Mailbox ID')
    .argument('<id>', 'Saved Reply ID')
    .action(
      withErrorHandling(async (mailboxId: string, id: string) => {
        await client.deleteSavedReply(
          parseIdArg(mailboxId, 'mailbox'),
          parseIdArg(id, 'saved reply')
        );
        outputJson({ success: true, message: 'Saved reply deleted' });
      })
    );

  return cmd;
}
