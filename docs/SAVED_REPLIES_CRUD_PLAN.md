# Saved Replies CRUD Implementation Plan

**Status:** Planning
**Date:** 2026-01-19
**Author:** Chris Barajas

## Overview

Complete the saved replies CRUD operations in the helpscout-cli fork. The existing implementation has `list` and `view` commands. This plan adds `create`, `update`, and `delete` operations across all three interfaces: API client, CLI commands, and MCP tools.

## API Reference

Based on [Help Scout Mailbox API 2.0 documentation](https://developer.helpscout.com/mailbox-api/):

| Operation | Method | Endpoint | Status Code |
|-----------|--------|----------|-------------|
| List | GET | `/v2/mailboxes/{mailboxId}/saved-replies` | 200 |
| Get | GET | `/v2/mailboxes/{mailboxId}/saved-replies/{savedReplyId}` | 200 |
| **Create** | POST | `/v2/mailboxes/{mailboxId}/saved-replies` | 201 |
| **Update** | PUT | `/v2/mailboxes/{mailboxId}/saved-replies/{savedReplyId}` | 204 |
| **Delete** | DELETE | `/v2/mailboxes/{mailboxId}/saved-replies/{savedReplyId}` | 204 |

### Request Body Structure (Create/Update)

```typescript
{
  name: string;      // Required
  text?: string;     // HTML content for email replies
  chatText?: string; // Plain text for chat replies
}
```

**Note:** At least one of `text` or `chatText` should be provided for a useful saved reply.

---

## 1. API Client (`src/lib/api-client.ts`)

### Add SavedReply Type

Add to `src/types/index.ts`:

```typescript
export interface SavedReply {
  id: number;
  mailboxId: number;
  name: string;
  text?: string;
  chatText?: string;
  createdAt: string;
  modifiedAt: string;
  createdBy?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  modifiedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

export interface SavedReplyListItem {
  id: number;
  name: string;
  preview?: string;
  chatPreview?: string;
  createdAt: string;
  modifiedAt: string;
}
```

### Add API Client Methods

Add to `HelpScoutClient` class in `src/lib/api-client.ts`:

```typescript
// After existing getSavedReply method (around line 597)

async createSavedReply(
  mailboxId: number,
  data: {
    name: string;
    text?: string;
    chatText?: string;
  }
): Promise<{ id: number }> {
  // POST returns 201 with Location header containing new resource URL
  // We need to extract the ID from the Location header
  const response = await this.requestWithHeaders<void>(
    'POST',
    `/mailboxes/${mailboxId}/saved-replies`,
    { body: data }
  );

  // Extract ID from Location header: /v2/mailboxes/123/saved-replies/456
  const location = response.headers.get('Location') || response.headers.get('Resource-ID');
  const id = location ? parseInt(location.split('/').pop() || '0', 10) : 0;

  return { id };
}

async updateSavedReply(
  mailboxId: number,
  savedReplyId: number,
  data: {
    name?: string;
    text?: string;
    chatText?: string;
  }
): Promise<void> {
  await this.request<void>(
    'PUT',
    `/mailboxes/${mailboxId}/saved-replies/${savedReplyId}`,
    { body: data }
  );
}

async deleteSavedReply(mailboxId: number, savedReplyId: number): Promise<void> {
  await this.request<void>(
    'DELETE',
    `/mailboxes/${mailboxId}/saved-replies/${savedReplyId}`
  );
}
```

### Handle Location Header for Create

The `createSavedReply` method needs access to response headers to extract the new resource ID. Two options:

**Option A: Add `requestWithHeaders` method** (Recommended)

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
  // Same logic as request() but return both data and headers
  // ... (copy request() implementation)

  return {
    data: response.status === 204 ? ({} as T) : await response.json(),
    headers: response.headers,
  };
}
```

**Option B: Simpler approach - fetch the created resource**

```typescript
async createSavedReply(
  mailboxId: number,
  data: {
    name: string;
    text?: string;
    chatText?: string;
  }
): Promise<{ success: true }> {
  await this.request<void>('POST', `/mailboxes/${mailboxId}/saved-replies`, { body: data });
  return { success: true };
}
```

**Recommendation:** Use Option B for simplicity. The Help Scout API returns 201 with no body, and extracting the ID from the Location header adds complexity. Users can list saved replies to find the new one if needed.

---

## 2. CLI Commands (`src/commands/saved-replies.ts`)

### Updated Command File

Replace the entire file with:

```typescript
import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIdArg } from '../lib/command-utils.js';

export function createSavedRepliesCommand(): Command {
  const cmd = new Command('saved-replies').description('Saved reply operations');

  // Existing: list
  cmd
    .command('list')
    .description('List saved replies for a mailbox')
    .argument('<mailboxId>', 'Mailbox ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (mailboxId: string, options: { page?: string }) => {
        const result = await client.listSavedReplies(
          parseIdArg(mailboxId, 'mailbox'),
          options.page ? parseInt(options.page, 10) : undefined
        );
        outputJson(result);
      })
    );

  // Existing: view
  cmd
    .command('view')
    .description('View a saved reply (includes full text)')
    .argument('<id>', 'Saved Reply ID')
    .action(
      withErrorHandling(async (id: string) => {
        const savedReply = await client.getSavedReply(parseIdArg(id, 'saved reply'));
        outputJson(savedReply);
      })
    );

  // NEW: create
  cmd
    .command('create')
    .description('Create a saved reply in a mailbox')
    .argument('<mailboxId>', 'Mailbox ID')
    .requiredOption('--name <name>', 'Saved reply name')
    .option('--text <text>', 'HTML text for email replies')
    .option('--chat-text <text>', 'Plain text for chat replies')
    .option('--file <path>', 'Read text content from file')
    .action(
      withErrorHandling(
        async (
          mailboxId: string,
          options: { name: string; text?: string; chatText?: string; file?: string }
        ) => {
          let text = options.text;

          // If --file provided, read content from file
          if (options.file) {
            const fs = await import('fs/promises');
            text = await fs.readFile(options.file, 'utf-8');
          }

          if (!text && !options.chatText) {
            console.error(
              JSON.stringify({
                error: { name: 'ValidationError', detail: 'Either --text, --chat-text, or --file is required' },
              })
            );
            process.exit(1);
          }

          await client.createSavedReply(parseIdArg(mailboxId, 'mailbox'), {
            name: options.name,
            text,
            chatText: options.chatText,
          });
          outputJson({ success: true, message: `Created saved reply "${options.name}"` });
        }
      )
    );

  // NEW: update
  cmd
    .command('update')
    .description('Update a saved reply')
    .argument('<mailboxId>', 'Mailbox ID')
    .argument('<savedReplyId>', 'Saved Reply ID')
    .option('--name <name>', 'Update name')
    .option('--text <text>', 'Update HTML text for email replies')
    .option('--chat-text <text>', 'Update plain text for chat replies')
    .option('--file <path>', 'Read text content from file')
    .action(
      withErrorHandling(
        async (
          mailboxId: string,
          savedReplyId: string,
          options: { name?: string; text?: string; chatText?: string; file?: string }
        ) => {
          let text = options.text;

          // If --file provided, read content from file
          if (options.file) {
            const fs = await import('fs/promises');
            text = await fs.readFile(options.file, 'utf-8');
          }

          if (!options.name && !text && !options.chatText) {
            console.error(
              JSON.stringify({
                error: { name: 'ValidationError', detail: 'At least one of --name, --text, --chat-text, or --file is required' },
              })
            );
            process.exit(1);
          }

          await client.updateSavedReply(
            parseIdArg(mailboxId, 'mailbox'),
            parseIdArg(savedReplyId, 'saved reply'),
            {
              ...(options.name && { name: options.name }),
              ...(text && { text }),
              ...(options.chatText && { chatText: options.chatText }),
            }
          );
          outputJson({ success: true });
        }
      )
    );

  // NEW: delete
  cmd
    .command('delete')
    .description('Delete a saved reply')
    .argument('<mailboxId>', 'Mailbox ID')
    .argument('<savedReplyId>', 'Saved Reply ID')
    .option('--force', 'Skip confirmation')
    .action(
      withErrorHandling(async (mailboxId: string, savedReplyId: string, options: { force?: boolean }) => {
        if (!options.force) {
          // For CLI, we can add interactive confirmation later
          // For now, require --force flag
          console.error(
            JSON.stringify({
              error: { name: 'ConfirmationRequired', detail: 'Use --force to confirm deletion' },
            })
          );
          process.exit(1);
        }

        await client.deleteSavedReply(
          parseIdArg(mailboxId, 'mailbox'),
          parseIdArg(savedReplyId, 'saved reply')
        );
        outputJson({ success: true });
      })
    );

  return cmd;
}
```

---

## 3. MCP Tools (`src/mcp/server.ts`)

### Add to Tool Registry

Add to `toolRegistry` array (around line 31):

```typescript
{ name: 'create_saved_reply', description: 'Create a new saved reply in a mailbox' },
{ name: 'update_saved_reply', description: 'Update an existing saved reply' },
{ name: 'delete_saved_reply', description: 'Delete a saved reply' },
```

### Add MCP Tool Definitions

Add after existing `get_saved_reply` tool (around line 331):

```typescript
server.tool(
  'create_saved_reply',
  'Create a new saved reply in a mailbox',
  {
    mailboxId: z.number().describe('Mailbox ID'),
    name: z.string().describe('Saved reply name'),
    text: z.string().optional().describe('HTML text for email replies'),
    chatText: z.string().optional().describe('Plain text for chat replies'),
  },
  async ({ mailboxId, name, text, chatText }) => {
    if (!text && !chatText) {
      return jsonResponse({ error: 'Either text or chatText is required' });
    }
    await client.createSavedReply(mailboxId, { name, text, chatText });
    return jsonResponse({ success: true, message: `Created saved reply "${name}"` });
  }
);

server.tool(
  'update_saved_reply',
  'Update an existing saved reply',
  {
    mailboxId: z.number().describe('Mailbox ID'),
    savedReplyId: z.number().describe('Saved Reply ID'),
    name: z.string().optional().describe('Update name'),
    text: z.string().optional().describe('Update HTML text for email replies'),
    chatText: z.string().optional().describe('Update plain text for chat replies'),
  },
  async ({ mailboxId, savedReplyId, name, text, chatText }) => {
    if (!name && !text && !chatText) {
      return jsonResponse({ error: 'At least one of name, text, or chatText is required' });
    }
    await client.updateSavedReply(mailboxId, savedReplyId, {
      ...(name && { name }),
      ...(text && { text }),
      ...(chatText && { chatText }),
    });
    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_saved_reply',
  'Delete a saved reply',
  {
    mailboxId: z.number().describe('Mailbox ID'),
    savedReplyId: z.number().describe('Saved Reply ID'),
  },
  async ({ mailboxId, savedReplyId }) => {
    await client.deleteSavedReply(mailboxId, savedReplyId);
    return jsonResponse({ success: true });
  }
);
```

---

## 4. README Updates (`README.md`)

Update the Saved Replies section (around line 124):

```markdown
### Saved Replies

```bash
helpscout saved-replies list 123           # List saved replies for mailbox 123
helpscout saved-replies view 456           # View saved reply with full text

# Create a saved reply
helpscout saved-replies create 123 --name "Welcome" --text "<p>Welcome to support!</p>"
helpscout saved-replies create 123 --name "Welcome" --file ./templates/welcome.html
helpscout saved-replies create 123 --name "Quick Chat" --chat-text "Thanks for reaching out!"

# Update a saved reply
helpscout saved-replies update 123 456 --name "New Name"
helpscout saved-replies update 123 456 --text "<p>Updated content</p>"
helpscout saved-replies update 123 456 --file ./templates/updated.html

# Delete a saved reply
helpscout saved-replies delete 123 456 --force
```
```

---

## 5. Implementation Order

1. **Types** - Add `SavedReply` interface to `src/types/index.ts`
2. **API Client** - Add three new methods to `src/lib/api-client.ts`
3. **CLI Commands** - Add create, update, delete to `src/commands/saved-replies.ts`
4. **MCP Tools** - Add three tools to `src/mcp/server.ts` and update registry
5. **README** - Update documentation
6. **Build & Test** - `bun run build && bun run typecheck`

---

## 6. Testing Checklist

### API Client
- [ ] `createSavedReply` creates and returns success
- [ ] `updateSavedReply` updates name, text, chatText independently
- [ ] `deleteSavedReply` removes the saved reply

### CLI Commands
- [ ] `saved-replies create` with --text works
- [ ] `saved-replies create` with --file reads file content
- [ ] `saved-replies create` with --chat-text works
- [ ] `saved-replies create` validates at least one content option
- [ ] `saved-replies update` with any combination of flags
- [ ] `saved-replies update` validates at least one flag provided
- [ ] `saved-replies delete` requires --force
- [ ] `saved-replies delete --force` works

### MCP Tools
- [ ] `create_saved_reply` works via MCP
- [ ] `update_saved_reply` works via MCP
- [ ] `delete_saved_reply` works via MCP
- [ ] `search_tools` finds new tools with regex

---

## 7. Estimated Effort

| Component | Estimated Time |
|-----------|----------------|
| Types | 5 min |
| API Client | 15 min |
| CLI Commands | 30 min |
| MCP Tools | 15 min |
| README | 10 min |
| Testing | 30 min |
| **Total** | ~1.5 hours |

---

## 8. Future Enhancements

- **Interactive confirmation** for delete (readline-based prompt when not using --force)
- **Bulk operations** - create/update multiple saved replies from a directory
- **Template variables** - document Help Scout's variable syntax in help text
- **Search** - add `saved-replies search` command to find by name/content
