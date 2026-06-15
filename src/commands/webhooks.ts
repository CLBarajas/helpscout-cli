import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg, requireConfirmation } from '../lib/command-utils.js';
import { HelpScoutCliError } from '../lib/errors.js';
import type { WebhookInput, WebhookPayloadVersion } from '../types/index.js';

interface WebhookWriteOptions {
  url: string;
  events: string;
  secret: string;
  notification?: boolean;
  label?: string;
  payloadVersion?: string;
  mailboxIds?: string;
}

function buildWebhookBody(options: WebhookWriteOptions): WebhookInput {
  const payloadVersion = options.payloadVersion?.toUpperCase();
  if (payloadVersion && payloadVersion !== 'V2' && payloadVersion !== 'V3') {
    throw new HelpScoutCliError('--payload-version must be V2 or V3', 400);
  }
  return {
    url: options.url,
    events: options.events
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean),
    secret: options.secret,
    ...(options.notification !== undefined && { notification: options.notification }),
    ...(options.label && { label: options.label }),
    ...(payloadVersion && { payloadVersion: payloadVersion as WebhookPayloadVersion }),
    ...(options.mailboxIds && {
      mailboxIds: options.mailboxIds.split(',').map((id) => parseIdArg(id.trim(), 'mailbox')),
    }),
  };
}

export function createWebhooksCommand(): Command {
  const cmd = new Command('webhooks').description('Webhook operations');

  cmd
    .command('list')
    .description('List webhooks')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { page?: string }) => {
        const result = await client.listWebhooks(
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  cmd
    .command('view')
    .description('View a webhook (the signing secret is never returned by the API)')
    .argument('<id>', 'Webhook ID')
    .action(
      withErrorHandling(async (id: string) => {
        const webhook = await client.getWebhook(parseIdArg(id, 'webhook'));
        outputJson(webhook);
      })
    );

  cmd
    .command('create')
    .description('Create a webhook')
    .requiredOption('--url <url>', 'Destination URL that receives webhook calls')
    .requiredOption(
      '--events <events>',
      'Comma-separated event types (e.g. convo.created,convo.assigned)'
    )
    .requiredOption('--secret <secret>', 'Signing secret (max 40 characters)')
    .option('--notification', 'Send only the resource URI instead of the full payload')
    .option('--label <label>', 'Human-readable label')
    .option('--payload-version <version>', 'Payload version: V2 or V3 (V3 preserves system_user)')
    .option('--mailbox-ids <ids>', 'Comma-separated mailbox IDs to scope to (omit for all)')
    .action(
      withErrorHandling(async (options: WebhookWriteOptions) => {
        const result = await client.createWebhook(buildWebhookBody(options));
        outputJson({ message: 'Webhook created', id: result.id });
      })
    );

  cmd
    .command('update')
    .description('Update a webhook (full replace: url, events, and secret are all required)')
    .argument('<id>', 'Webhook ID')
    .requiredOption('--url <url>', 'Destination URL that receives webhook calls')
    .requiredOption('--events <events>', 'Comma-separated event types')
    .requiredOption('--secret <secret>', 'Signing secret (max 40 characters)')
    .option('--notification', 'Send only the resource URI instead of the full payload')
    .option('--label <label>', 'Human-readable label')
    .option('--payload-version <version>', 'Payload version: V2 or V3 (V3 preserves system_user)')
    .option('--mailbox-ids <ids>', 'Comma-separated mailbox IDs to scope to (omit for all)')
    .action(
      withErrorHandling(async (id: string, options: WebhookWriteOptions) => {
        await client.updateWebhook(parseIdArg(id, 'webhook'), buildWebhookBody(options));
        outputJson({ message: 'Webhook updated' });
      })
    );

  cmd
    .command('delete')
    .description('Delete a webhook')
    .argument('<id>', 'Webhook ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        requireConfirmation('webhook', options.yes);
        await client.deleteWebhook(parseIdArg(id, 'webhook'));
        outputJson({ message: 'Webhook deleted' });
      })
    );

  return cmd;
}
