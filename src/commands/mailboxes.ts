import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { config } from '../lib/config.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/command-utils.js';

export function createMailboxesCommand(): Command {
  const cmd = new Command('mailboxes').description('Mailbox operations');

  cmd
    .command('list')
    .description('List mailboxes')
    .option('--page <number>', 'Page number', parseInt)
    .action(withErrorHandling(async (options: { page?: number }) => {
      const result = await client.listMailboxes(options.page);
      outputJson(result);
    }));

  cmd
    .command('view')
    .description('View a mailbox')
    .argument('<id>', 'Mailbox ID')
    .action(withErrorHandling(async (id: string) => {
      const mailbox = await client.getMailbox(parseInt(id));
      outputJson(mailbox);
    }));

  cmd
    .command('set-default')
    .description('Set default mailbox')
    .argument('<id>', 'Mailbox ID')
    .action(withErrorHandling(async (id: string) => {
      config.setDefaultMailbox(id);
      outputJson({ message: `Default mailbox set to ${id}` });
    }));

  cmd
    .command('get-default')
    .description('Get default mailbox')
    .action(withErrorHandling(async () => {
      const mailboxId = config.getDefaultMailbox();
      outputJson({ defaultMailbox: mailboxId || null });
    }));

  cmd
    .command('clear-default')
    .description('Clear default mailbox')
    .action(withErrorHandling(async () => {
      config.clearDefaultMailbox();
      outputJson({ message: 'Default mailbox cleared' });
    }));

  return cmd;
}
