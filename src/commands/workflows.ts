import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/command-utils.js';

export function createWorkflowsCommand(): Command {
  const cmd = new Command('workflows').description('Workflow operations');

  cmd
    .command('list')
    .description('List workflows')
    .option('-m, --mailbox <id>', 'Filter by mailbox ID', parseInt)
    .option('-t, --type <type>', 'Filter by type (manual, automatic)')
    .option('--page <number>', 'Page number', parseInt)
    .action(withErrorHandling(async (options: {
      mailbox?: number;
      type?: string;
      page?: number;
    }) => {
      const result = await client.listWorkflows({
        mailboxId: options.mailbox,
        type: options.type,
        page: options.page,
      });
      outputJson(result);
    }));

  cmd
    .command('run')
    .description('Run a manual workflow on conversations')
    .argument('<workflow-id>', 'Workflow ID')
    .requiredOption('--conversations <ids>', 'Comma-separated conversation IDs')
    .action(withErrorHandling(async (workflowId: string, options: { conversations: string }) => {
      const conversationIds = options.conversations.split(',').map(id => parseInt(id.trim()));
      const result = await client.runWorkflow(parseInt(workflowId), conversationIds);
      outputJson({ message: 'Workflow executed', ...result });
    }));

  cmd
    .command('activate')
    .description('Activate a workflow')
    .argument('<id>', 'Workflow ID')
    .action(withErrorHandling(async (id: string) => {
      const result = await client.updateWorkflowStatus(parseInt(id), 'active');
      outputJson({ message: 'Workflow activated', ...result });
    }));

  cmd
    .command('deactivate')
    .description('Deactivate a workflow')
    .argument('<id>', 'Workflow ID')
    .action(withErrorHandling(async (id: string) => {
      const result = await client.updateWorkflowStatus(parseInt(id), 'inactive');
      outputJson({ message: 'Workflow deactivated', ...result });
    }));

  return cmd;
}
