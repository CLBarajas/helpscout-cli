import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/command-utils.js';

export function createTagsCommand(): Command {
  const cmd = new Command('tags').description('Tag operations');

  cmd
    .command('list')
    .description('List all tags')
    .option('--page <number>', 'Page number', parseInt)
    .action(withErrorHandling(async (options: { page?: number }) => {
      const result = await client.listTags(options.page);
      outputJson(result);
    }));

  cmd
    .command('view')
    .description('View a tag')
    .argument('<id>', 'Tag ID')
    .action(withErrorHandling(async (id: string) => {
      const tag = await client.getTag(parseInt(id));
      outputJson(tag);
    }));

  return cmd;
}
