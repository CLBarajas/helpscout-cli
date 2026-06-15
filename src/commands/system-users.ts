import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';

export function createSystemUsersCommand(): Command {
  const cmd = new Command('system-users').description('System user operations (AI agents)');

  cmd
    .command('list')
    .description('List all system users (AI agents)')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { page?: string }) => {
        const result = await client.listSystemUsers(
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  cmd
    .command('view')
    .description('View a system user')
    .argument('<id>', 'System user ID')
    .action(
      withErrorHandling(async (id: string) => {
        const systemUser = await client.getSystemUser(parseIdArg(id, 'system user'));
        outputJson(systemUser);
      })
    );

  return cmd;
}
