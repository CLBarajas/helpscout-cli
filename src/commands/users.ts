import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg, requireConfirmation } from '../lib/command-utils.js';
import type { UserRole } from '../types/index.js';

export function createUsersCommand(): Command {
  const cmd = new Command('users').description('User operations');

  cmd
    .command('list')
    .description('List users')
    .option('--email <email>', 'Exact-match email filter')
    .option('-m, --mailbox <id>', 'Filter by mailbox ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { email?: string; mailbox?: string; page?: string }) => {
        const result = await client.listUsers({
          email: options.email,
          mailbox: options.mailbox ? parseIdArg(options.mailbox, 'mailbox') : undefined,
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

  cmd
    .command('create')
    .description('Create a user (sends an invite unless --no-send-invite)')
    .requiredOption('--first-name <name>', 'First name (max 40 chars)')
    .requiredOption('--last-name <name>', 'Last name (max 40 chars)')
    .requiredOption('--email <email>', 'Email address')
    .requiredOption('--role <role>', 'Role: admin | user | "light user"')
    .option('--timezone <tz>', 'Timezone (defaults to company timezone)')
    .option('--job-title <title>', 'Job title (max 50 chars)')
    .option('--phone <phone>', 'Phone number')
    .option('--no-send-invite', 'Do not send an invitation email')
    .action(
      withErrorHandling(
        async (options: {
          firstName: string;
          lastName: string;
          email: string;
          role: string;
          timezone?: string;
          jobTitle?: string;
          phone?: string;
          sendInvite: boolean;
        }) => {
          const result = await client.createUser({
            firstName: options.firstName,
            lastName: options.lastName,
            email: options.email,
            role: options.role as UserRole,
            ...(options.timezone && { timezone: options.timezone }),
            ...(options.jobTitle && { jobTitle: options.jobTitle }),
            ...(options.phone && { phone: options.phone }),
            sendInvite: options.sendInvite,
          });
          outputJson(result);
        }
      )
    );

  cmd
    .command('delete')
    .description('Delete a user (admins/owners only; cannot delete yourself)')
    .argument('<id>', 'User ID')
    .option('-y, --yes', 'Confirm deletion')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        requireConfirmation('user', options.yes);
        await client.deleteUser(parseIdArg(id, 'user'));
        outputJson({ message: 'User deleted', id: parseIdArg(id, 'user') });
      })
    );

  return cmd;
}
