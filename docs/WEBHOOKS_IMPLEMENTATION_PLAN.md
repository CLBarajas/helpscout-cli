# Webhooks Implementation Plan

This document outlines the implementation plan for adding webhooks management to the helpscout-cli fork.

## API Reference

Based on the [Help Scout Mailbox API v2 Webhooks documentation](https://developer.helpscout.com/mailbox-api/endpoints/webhooks/):

### Endpoints

| Operation | Method | Endpoint | Response |
|-----------|--------|----------|----------|
| List Webhooks | GET | `/v2/webhooks` | 200 + paginated list |
| Get Webhook | GET | `/v2/webhooks/{webhookId}` | 200 + webhook object |
| Create Webhook | POST | `/v2/webhooks` | 201 + Resource-ID header |
| Update Webhook | PUT | `/v2/webhooks/{webhookId}` | 204 No Content |
| Delete Webhook | DELETE | `/v2/webhooks/{webhookId}` | 204 No Content |

### Webhook Object Structure

```typescript
interface Webhook {
  id: number;
  url: string;
  state: 'enabled' | 'disabled';
  events: string[];
  notification: boolean;
  payloadVersion: string;
  label: string;
  mailboxIds: number[];
}
```

### Available Events

```typescript
const WEBHOOK_EVENTS = [
  'convo.agent.reply.created',
  'convo.assigned',
  'convo.created',
  'convo.customer.reply.created',
  'convo.deleted',
  'convo.merged',
  'convo.moved',
  'convo.note.created',
  'convo.status',
  'convo.tags',
  'customer.created',
  'satisfaction.ratings',
] as const;
```

---

## 1. Type Definitions

**File:** `src/types/index.ts`

Add the following types:

```typescript
// Add to existing types
export interface Webhook {
  id: number;
  url: string;
  state: 'enabled' | 'disabled';
  events: string[];
  notification: boolean;
  payloadVersion: string;
  label: string;
  mailboxIds: number[];
}

export interface WebhookCreateInput {
  url: string;
  events: string[];
  secret: string;
  payloadVersion?: string;
  label?: string;
  notification?: boolean;
  mailboxIds?: number[];
}

export interface WebhookUpdateInput {
  url: string;
  events: string[];
  secret: string;
  payloadVersion?: string;
  label?: string;
  notification?: boolean;
  mailboxIds?: number[];
}

export const WEBHOOK_EVENTS = [
  'convo.agent.reply.created',
  'convo.assigned',
  'convo.created',
  'convo.customer.reply.created',
  'convo.deleted',
  'convo.merged',
  'convo.moved',
  'convo.note.created',
  'convo.status',
  'convo.tags',
  'customer.created',
  'satisfaction.ratings',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
```

---

## 2. API Client Methods

**File:** `src/lib/api-client.ts`

Add the following methods to the `HelpScoutClient` class:

```typescript
import type {
  // ... existing imports
  Webhook,
  WebhookCreateInput,
  WebhookUpdateInput,
} from '../types/index.js';

// Add to HelpScoutClient class:

// Webhooks
async listWebhooks(page?: number) {
  const response = await this.request<PaginatedResponse<{ webhooks: Webhook[] }>>(
    'GET',
    '/webhooks',
    { params: page ? { page } : undefined }
  );
  return {
    webhooks: response._embedded?.webhooks || [],
    page: response.page,
  };
}

async getWebhook(webhookId: number) {
  return this.request<Webhook>('GET', `/webhooks/${webhookId}`);
}

async createWebhook(data: WebhookCreateInput): Promise<number> {
  // POST returns 201 with Resource-ID header containing the new webhook ID
  const response = await this.requestWithHeaders<void>('POST', '/webhooks', { body: data });
  const resourceId = response.headers.get('Resource-ID');
  return resourceId ? parseInt(resourceId, 10) : 0;
}

async updateWebhook(webhookId: number, data: WebhookUpdateInput) {
  await this.request<void>('PUT', `/webhooks/${webhookId}`, { body: data });
}

async deleteWebhook(webhookId: number) {
  await this.request<void>('DELETE', `/webhooks/${webhookId}`);
}
```

### Note: Resource-ID Header Handling

The `createWebhook` method needs to capture the `Resource-ID` header from the 201 response. This requires a small modification to the request infrastructure. Add a helper method:

```typescript
private async requestWithHeaders<T>(
  method: string,
  path: string,
  options: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    retry?: boolean;
    rateLimitRetry?: boolean;
  } = {}
): Promise<{ data: T; headers: Headers }> {
  const { params, body, retry = true, rateLimitRetry = true } = options;

  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const token = await this.getAccessToken();
  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), fetchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    throw new HelpScoutCliError(`Network request failed: ${message}`, 0);
  }

  if (response.status === 401 && retry) {
    this.accessToken = null;
    await this.refreshAccessToken();
    return this.requestWithHeaders(method, path, { ...options, retry: false });
  }

  if (response.status === 429 && rateLimitRetry) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
    const waitSeconds = Math.min(retryAfter, 120);
    console.error(
      JSON.stringify({ warning: `Rate limited. Waiting ${waitSeconds}s before retry...` })
    );
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    return this.requestWithHeaders(method, path, { ...options, rateLimitRetry: false });
  }

  if (response.status === 201 || response.status === 204) {
    return { data: {} as T, headers: response.headers };
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new HelpScoutApiError('API request failed', error, response.status);
  }

  const data = await response.json() as T;
  return { data, headers: response.headers };
}
```

---

## 3. CLI Command

**File:** `src/commands/webhooks.ts` (new file)

```typescript
import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';
import { WEBHOOK_EVENTS } from '../types/index.js';

export function createWebhooksCommand(): Command {
  const cmd = new Command('webhooks').description('Webhook operations');

  cmd
    .command('list')
    .description('List all webhooks')
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
    .description('Get webhook details')
    .argument('<id>', 'Webhook ID')
    .action(
      withErrorHandling(async (id: string) => {
        const webhook = await client.getWebhook(parseIdArg(id, 'webhook'));
        outputJson(webhook);
      })
    );

  cmd
    .command('create')
    .description('Create a new webhook')
    .requiredOption('-u, --url <url>', 'Webhook endpoint URL')
    .requiredOption('-e, --events <events>', `Comma-separated events: ${WEBHOOK_EVENTS.join(', ')}`)
    .requiredOption('-s, --secret <secret>', 'Secret for signature verification (max 40 chars)')
    .option('-l, --label <label>', 'Human-readable label')
    .option('-n, --notification', 'Send only URI instead of full payload')
    .option('-m, --mailboxes <ids>', 'Comma-separated mailbox IDs (omit for all mailboxes)')
    .option('--payload-version <version>', 'Payload version (default: V2)')
    .action(
      withErrorHandling(
        async (options: {
          url: string;
          events: string;
          secret: string;
          label?: string;
          notification?: boolean;
          mailboxes?: string;
          payloadVersion?: string;
        }) => {
          const events = options.events.split(',').map((e) => e.trim());

          // Validate events
          const invalidEvents = events.filter(
            (e) => !WEBHOOK_EVENTS.includes(e as typeof WEBHOOK_EVENTS[number])
          );
          if (invalidEvents.length > 0) {
            outputJson({
              error: `Invalid events: ${invalidEvents.join(', ')}`,
              validEvents: WEBHOOK_EVENTS,
            });
            return;
          }

          // Validate secret length
          if (options.secret.length > 40) {
            outputJson({ error: 'Secret must be 40 characters or less' });
            return;
          }

          const webhookId = await client.createWebhook({
            url: options.url,
            events,
            secret: options.secret,
            label: options.label,
            notification: options.notification,
            mailboxIds: options.mailboxes
              ? options.mailboxes.split(',').map((id) => parseIdArg(id.trim(), 'mailbox'))
              : undefined,
            payloadVersion: options.payloadVersion,
          });

          outputJson({ message: 'Webhook created', id: webhookId });
        }
      )
    );

  cmd
    .command('update')
    .description('Update a webhook (replaces entire configuration)')
    .argument('<id>', 'Webhook ID')
    .requiredOption('-u, --url <url>', 'Webhook endpoint URL')
    .requiredOption('-e, --events <events>', `Comma-separated events: ${WEBHOOK_EVENTS.join(', ')}`)
    .requiredOption('-s, --secret <secret>', 'Secret for signature verification (max 40 chars)')
    .option('-l, --label <label>', 'Human-readable label')
    .option('-n, --notification', 'Send only URI instead of full payload')
    .option('-m, --mailboxes <ids>', 'Comma-separated mailbox IDs (omit for all mailboxes)')
    .option('--payload-version <version>', 'Payload version (default: V2)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            url: string;
            events: string;
            secret: string;
            label?: string;
            notification?: boolean;
            mailboxes?: string;
            payloadVersion?: string;
          }
        ) => {
          const events = options.events.split(',').map((e) => e.trim());

          // Validate events
          const invalidEvents = events.filter(
            (e) => !WEBHOOK_EVENTS.includes(e as typeof WEBHOOK_EVENTS[number])
          );
          if (invalidEvents.length > 0) {
            outputJson({
              error: `Invalid events: ${invalidEvents.join(', ')}`,
              validEvents: WEBHOOK_EVENTS,
            });
            return;
          }

          // Validate secret length
          if (options.secret.length > 40) {
            outputJson({ error: 'Secret must be 40 characters or less' });
            return;
          }

          await client.updateWebhook(parseIdArg(id, 'webhook'), {
            url: options.url,
            events,
            secret: options.secret,
            label: options.label,
            notification: options.notification,
            mailboxIds: options.mailboxes
              ? options.mailboxes.split(',').map((mid) => parseIdArg(mid.trim(), 'mailbox'))
              : undefined,
            payloadVersion: options.payloadVersion,
          });

          outputJson({ message: 'Webhook updated' });
        }
      )
    );

  cmd
    .command('delete')
    .description('Delete a webhook')
    .argument('<id>', 'Webhook ID')
    .action(
      withErrorHandling(async (id: string) => {
        await client.deleteWebhook(parseIdArg(id, 'webhook'));
        outputJson({ message: 'Webhook deleted' });
      })
    );

  cmd
    .command('events')
    .description('List all available webhook events')
    .action(
      withErrorHandling(async () => {
        outputJson({
          events: WEBHOOK_EVENTS,
          descriptions: {
            'convo.agent.reply.created': 'An agent replied to the conversation',
            'convo.assigned': 'Conversation was assigned',
            'convo.created': 'Conversation was created',
            'convo.customer.reply.created': 'The customer replied to the conversation',
            'convo.deleted': 'Conversation was deleted',
            'convo.merged': 'Conversation was merged',
            'convo.moved': 'Conversation was moved',
            'convo.note.created': 'A note was added to the conversation',
            'convo.status': 'Conversation status was updated',
            'convo.tags': 'Conversation tags were updated',
            'customer.created': 'A customer was created',
            'satisfaction.ratings': 'A satisfaction rating was received',
          },
        });
      })
    );

  return cmd;
}
```

---

## 4. CLI Registration

**File:** `src/cli.ts`

Add the webhooks command:

```typescript
// Add import
import { createWebhooksCommand } from './commands/webhooks.js';

// Add command registration (after existing commands)
program.addCommand(createWebhooksCommand());
```

---

## 5. MCP Server Tools

**File:** `src/mcp/server.ts`

Add webhook tools to the MCP server:

```typescript
// Add to toolRegistry array
{ name: 'list_webhooks', description: 'List all webhooks in the Help Scout account' },
{ name: 'get_webhook', description: 'Get detailed information about a specific webhook' },
{ name: 'create_webhook', description: 'Create a new webhook with URL, events, and secret' },
{ name: 'update_webhook', description: 'Update an existing webhook (full replacement)' },
{ name: 'delete_webhook', description: 'Delete a webhook' },

// Add tool implementations

server.tool(
  'list_webhooks',
  'List all webhooks in the Help Scout account',
  {
    page: z.number().optional().describe('Page number'),
  },
  async ({ page }) => jsonResponse(await client.listWebhooks(page))
);

server.tool(
  'get_webhook',
  'Get detailed information about a specific webhook',
  {
    webhookId: z.number().describe('Webhook ID'),
  },
  async ({ webhookId }) => jsonResponse(await client.getWebhook(webhookId))
);

server.tool(
  'create_webhook',
  'Create a new webhook with URL, events, and secret',
  {
    url: z.string().describe('Webhook endpoint URL'),
    events: z
      .array(z.string())
      .describe('Array of event types (e.g., convo.created, customer.created)'),
    secret: z.string().max(40).describe('Secret for signature verification (max 40 chars)'),
    label: z.string().optional().describe('Human-readable label'),
    notification: z
      .boolean()
      .optional()
      .describe('Send only URI instead of full payload'),
    mailboxIds: z
      .array(z.number())
      .optional()
      .describe('Mailbox IDs to filter (omit for all mailboxes)'),
    payloadVersion: z.string().optional().describe('Payload version (default: V2)'),
  },
  async ({ url, events, secret, label, notification, mailboxIds, payloadVersion }) => {
    const webhookId = await client.createWebhook({
      url,
      events,
      secret,
      label,
      notification,
      mailboxIds,
      payloadVersion,
    });
    return jsonResponse({ success: true, id: webhookId });
  }
);

server.tool(
  'update_webhook',
  'Update an existing webhook (full replacement - all fields required)',
  {
    webhookId: z.number().describe('Webhook ID to update'),
    url: z.string().describe('Webhook endpoint URL'),
    events: z.array(z.string()).describe('Array of event types'),
    secret: z.string().max(40).describe('Secret for signature verification'),
    label: z.string().optional().describe('Human-readable label'),
    notification: z.boolean().optional().describe('Send only URI instead of full payload'),
    mailboxIds: z.array(z.number()).optional().describe('Mailbox IDs to filter'),
    payloadVersion: z.string().optional().describe('Payload version'),
  },
  async ({ webhookId, url, events, secret, label, notification, mailboxIds, payloadVersion }) => {
    await client.updateWebhook(webhookId, {
      url,
      events,
      secret,
      label,
      notification,
      mailboxIds,
      payloadVersion,
    });
    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_webhook',
  'Delete a webhook',
  {
    webhookId: z.number().describe('Webhook ID to delete'),
  },
  async ({ webhookId }) => {
    await client.deleteWebhook(webhookId);
    return jsonResponse({ success: true });
  }
);
```

---

## 6. README Documentation

Add the following section to `README.md`:

```markdown
### Webhooks

Manage webhooks to receive notifications when events occur in Help Scout.

```bash
# List all webhooks
helpscout webhooks list

# Get webhook details
helpscout webhooks view <webhook-id>

# Create a webhook
helpscout webhooks create \
  --url https://example.com/webhook \
  --events convo.created,convo.assigned \
  --secret "your-secret-key" \
  --label "My Webhook"

# Update a webhook (full replacement)
helpscout webhooks update <webhook-id> \
  --url https://example.com/webhook \
  --events convo.created,customer.created \
  --secret "new-secret-key" \
  --label "Updated Webhook"

# Delete a webhook
helpscout webhooks delete <webhook-id>

# List available webhook events
helpscout webhooks events
```

#### Webhook Options

| Option | Description |
|--------|-------------|
| `-u, --url` | Required. The endpoint URL that receives webhook notifications |
| `-e, --events` | Required. Comma-separated list of event types to subscribe to |
| `-s, --secret` | Required. Secret for signature verification (max 40 chars) |
| `-l, --label` | Optional. Human-readable label for the webhook |
| `-n, --notification` | Optional. Send only resource URI instead of full payload |
| `-m, --mailboxes` | Optional. Comma-separated mailbox IDs (omit for all) |
| `--payload-version` | Optional. Payload format version (default: V2) |

#### Available Events

| Event | Description |
|-------|-------------|
| `convo.agent.reply.created` | An agent replied to the conversation |
| `convo.assigned` | Conversation was assigned |
| `convo.created` | Conversation was created |
| `convo.customer.reply.created` | The customer replied |
| `convo.deleted` | Conversation was deleted |
| `convo.merged` | Conversation was merged |
| `convo.moved` | Conversation was moved |
| `convo.note.created` | A note was added |
| `convo.status` | Status was updated |
| `convo.tags` | Tags were updated |
| `customer.created` | A customer was created |
| `satisfaction.ratings` | A satisfaction rating was received |

#### Webhook Security

When a webhook is triggered, Help Scout includes an `X-HelpScout-Signature` header containing an HMAC-SHA1 signature of the request body using your secret. Verify this signature on your server to ensure requests are authentic.

#### Notes

- Newly created webhooks are enabled by default
- The update operation replaces the entire webhook configuration (you must provide all fields including secret)
- After update, the webhook returns to enabled state
- The `customer.created` event triggers globally and cannot be filtered by mailbox
```

---

## 7. Implementation Checklist

- [ ] Add type definitions to `src/types/index.ts`
- [ ] Add `requestWithHeaders` helper to `src/lib/api-client.ts`
- [ ] Add webhook methods to `HelpScoutClient` class
- [ ] Create `src/commands/webhooks.ts`
- [ ] Register command in `src/cli.ts`
- [ ] Add MCP tools to `src/mcp/server.ts`
- [ ] Update `toolRegistry` array in MCP server
- [ ] Add documentation to README.md
- [ ] Run `bun run typecheck` to verify types
- [ ] Run `bun run lint` to check code style
- [ ] Test CLI commands manually
- [ ] Test MCP tools

---

## 8. Testing Commands

After implementation, test with:

```bash
# Build and link
bun run link

# Test list (should work even with no webhooks)
helpscout webhooks list

# Test events list
helpscout webhooks events

# Test create (use a valid URL you control)
helpscout webhooks create \
  --url https://webhook.site/your-uuid \
  --events convo.created \
  --secret "test-secret-12345" \
  --label "Test Webhook"

# Test view (use ID from create response)
helpscout webhooks view <id>

# Test update
helpscout webhooks update <id> \
  --url https://webhook.site/your-uuid \
  --events convo.created,convo.assigned \
  --secret "updated-secret" \
  --label "Updated Test"

# Test delete
helpscout webhooks delete <id>
```

---

## References

- [Help Scout Webhooks Overview](https://developer.helpscout.com/webhooks/)
- [List Webhooks API](https://developer.helpscout.com/mailbox-api/endpoints/webhooks/list/)
- [Get Webhook API](https://developer.helpscout.com/mailbox-api/endpoints/webhooks/get/)
- [Create Webhook API](https://developer.helpscout.com/mailbox-api/endpoints/webhooks/create/)
- [Update Webhook API](https://developer.helpscout.com/mailbox-api/endpoints/webhooks/update/)
- [Delete Webhook API](https://developer.helpscout.com/mailbox-api/endpoints/webhooks/delete/)
