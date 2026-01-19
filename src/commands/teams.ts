import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';

export function createTeamsCommand(): Command {
  const cmd = new Command('teams').description('Team operations');

  cmd
    .command('list')
    .description('List all teams')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { page?: string }) => {
        const result = await client.listTeams(options.page ? parseInt(options.page, 10) : undefined);
        outputJson(result);
      })
    );

  cmd
    .command('view')
    .description('View a team')
    .argument('<id>', 'Team ID')
    .action(
      withErrorHandling(async (id: string) => {
        const team = await client.getTeam(parseIdArg(id, 'team'));
        outputJson(team);
      })
    );

  cmd
    .command('members')
    .description('List team members')
    .argument('<id>', 'Team ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (id: string, options: { page?: string }) => {
        const result = await client.listTeamMembers(
          parseIdArg(id, 'team'),
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  return cmd;
}
