import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { config } from '../lib/config.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';
import type { RoutingConfig, RoutingConfigInput } from '../types/index.js';

export function createMailboxesCommand(): Command {
  const cmd = new Command('mailboxes').description('Mailbox operations');

  cmd
    .command('list')
    .description('List mailboxes')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { page?: string }) => {
        const result = await client.listMailboxes(
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  cmd
    .command('view')
    .description('View a mailbox')
    .argument('<id>', 'Mailbox ID')
    .action(
      withErrorHandling(async (id: string) => {
        const mailbox = await client.getMailbox(parseIdArg(id, 'mailbox'));
        outputJson(mailbox);
      })
    );

  cmd
    .command('set-default')
    .description('Set default mailbox')
    .argument('<id>', 'Mailbox ID')
    .action(
      withErrorHandling(async (id: string) => {
        const mailboxId = parseIdArg(id, 'mailbox');
        config.setDefaultMailbox(String(mailboxId));
        outputJson({ message: `Default mailbox set to ${mailboxId}` });
      })
    );

  cmd
    .command('get-default')
    .description('Get default mailbox')
    .action(
      withErrorHandling(async () => {
        const mailboxId = config.getDefaultMailbox();
        outputJson({ defaultMailbox: mailboxId || null });
      })
    );

  cmd
    .command('clear-default')
    .description('Clear default mailbox')
    .action(
      withErrorHandling(async () => {
        config.clearDefaultMailbox();
        outputJson({ message: 'Default mailbox cleared' });
      })
    );

  cmd
    .command('fields')
    .description('List custom fields for a mailbox')
    .argument('<id>', 'Mailbox ID')
    .action(
      withErrorHandling(async (id: string) => {
        const fields = await client.listMailboxFields(parseIdArg(id, 'mailbox'));
        outputJson(fields);
      })
    );

  cmd
    .command('folders')
    .description('List inbox folders for a mailbox')
    .argument('<id>', 'Mailbox ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (id: string, options: { page?: string }) => {
        const result = await client.listMailboxFolders(
          parseIdArg(id, 'mailbox'),
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  cmd
    .command('routing')
    .description('Get routing configuration for a mailbox')
    .argument('<id>', 'Mailbox ID')
    .action(
      withErrorHandling(async (id: string) => {
        const routing = await client.getRoutingConfig(parseIdArg(id, 'mailbox'));
        outputJson(routing);
      })
    );

  cmd
    .command('update-routing')
    .description('Update routing configuration for a mailbox (merges with existing config)')
    .argument('<id>', 'Mailbox ID')
    .option('--state <state>', 'Routing state: enabled or disabled')
    .option('--assignment-limit <number>', 'Max conversations per user')
    .option('--assignment-method <method>', 'Assignment method: round_robin or balanced')
    .option('--user-ids <ids>', 'Comma-separated list of user IDs')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            state?: string;
            assignmentLimit?: string;
            assignmentMethod?: string;
            userIds?: string;
          }
        ) => {
          const data: Partial<RoutingConfigInput> = {};
          if (options.state) data.state = options.state as RoutingConfig['state'];
          if (options.assignmentLimit)
            data.assignmentLimit = parseInt(options.assignmentLimit, 10);
          if (options.assignmentMethod)
            data.assignmentMethod = options.assignmentMethod as RoutingConfig['assignmentMethod'];
          if (options.userIds)
            data.userIds = options.userIds.split(',').map((s) => parseInt(s.trim(), 10));
          await client.updateRoutingConfig(parseIdArg(id, 'mailbox'), data);
          outputJson({ message: `Routing configuration updated for mailbox ${id}` });
        }
      )
    );

  return cmd;
}
