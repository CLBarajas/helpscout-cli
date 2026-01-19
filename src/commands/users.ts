import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';

export function createUsersCommand(): Command {
  const cmd = new Command('users').description('User operations');

  cmd
    .command('list')
    .description('List users')
    .option('-m, --mailbox <id>', 'Filter by mailbox ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { mailbox?: string; page?: string }) => {
        const result = await client.listUsers({
          mailbox: options.mailbox ? parseInt(options.mailbox, 10) : undefined,
          page: options.page ? parseInt(options.page, 10) : undefined,
        });
        outputJson(result);
      })
    );

  cmd
    .command('view')
    .description('View a user')
    .argument('<id>', 'User ID')
    .action(
      withErrorHandling(async (id: string) => {
        const user = await client.getUser(parseIdArg(id, 'user'));
        outputJson(user);
      })
    );

  cmd
    .command('me')
    .description('View current authenticated user')
    .action(
      withErrorHandling(async () => {
        const user = await client.getCurrentUser();
        outputJson(user);
      })
    );

  return cmd;
}
