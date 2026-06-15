import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';

export function createRatingsCommand(): Command {
  const cmd = new Command('ratings').description('Satisfaction rating operations');

  cmd
    .command('view')
    .description('View a single satisfaction rating')
    .argument('<id>', 'Rating ID')
    .action(
      withErrorHandling(async (id: string) => {
        const rating = await client.getSatisfactionRating(parseIdArg(id, 'rating'));
        outputJson(rating);
      })
    );

  return cmd;
}
