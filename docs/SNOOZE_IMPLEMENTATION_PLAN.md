# Snooze Feature Implementation Plan

## Overview

This document outlines the implementation plan for adding conversation snooze functionality to the helpscout-cli fork. The snooze feature allows temporarily hiding conversations until a specified future datetime, at which point they automatically return to the inbox.

## Help Scout API Reference

### Update Snooze Endpoint

**PUT** `/v2/conversations/{conversationId}/snooze`

**Request Body:**
```json
{
  "snoozedUntil": "2026-02-15T12:57:43Z",
  "unsnoozeOnCustomerReply": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `snoozedUntil` | String | Yes | ISO 8601 datetime in the future (must not be after year 2100) |
| `unsnoozeOnCustomerReply` | Boolean | Yes | Whether a new customer reply automatically unsnoozes the conversation |

**Response:** `204 No Content`

### Delete Snooze Endpoint

**DELETE** `/v2/conversations/{conversationId}/snooze`

**Response:** `204 No Content`

When unsnoozing, the conversation is placed into its appropriate folder (Mine, Team, or Unassigned) based on assignee and reactivated if needed.

---

## 1. API Client Methods

**File:** `src/lib/api-client.ts`

Add two methods to the `HelpScoutClient` class:

```typescript
// Add after line 296 (after createNote method)

// Snooze
async snoozeConversation(
  conversationId: number,
  data: {
    snoozedUntil: string;
    unsnoozeOnCustomerReply?: boolean;
  }
) {
  await this.request<void>('PUT', `/conversations/${conversationId}/snooze`, {
    body: {
      snoozedUntil: data.snoozedUntil,
      unsnoozeOnCustomerReply: data.unsnoozeOnCustomerReply ?? true,
    },
  });
}

async unsnoozeConversation(conversationId: number) {
  await this.request<void>('DELETE', `/conversations/${conversationId}/snooze`);
}
```

### Implementation Notes

- `snoozedUntil` must be an ISO 8601 datetime string in the future
- `unsnoozeOnCustomerReply` defaults to `true` if not specified (most common use case)
- Both methods return void and rely on the 204 response handling already in the `request()` method

---

## 2. CLI Commands

**File:** `src/commands/conversations.ts`

Add two new commands after the existing `set-field` command (around line 431):

```typescript
// Add after the set-field command, before the return statement

cmd
  .command('snooze')
  .description('Snooze a conversation until a specific date/time')
  .argument('<id>', 'Conversation ID')
  .requiredOption('--until <datetime>', 'ISO 8601 datetime to snooze until (e.g., 2026-02-15T09:00:00Z)')
  .option('--wake-on-reply', 'Unsnooze when customer replies (default: true)', true)
  .option('--no-wake-on-reply', 'Keep snoozed even if customer replies')
  .action(
    withErrorHandling(
      async (
        id: string,
        options: {
          until: string;
          wakeOnReply: boolean;
        }
      ) => {
        // Validate datetime is in the future
        const snoozeDate = new Date(options.until);
        if (isNaN(snoozeDate.getTime())) {
          throw new Error('Invalid datetime format. Use ISO 8601 format (e.g., 2026-02-15T09:00:00Z)');
        }
        if (snoozeDate <= new Date()) {
          throw new Error('Snooze datetime must be in the future');
        }
        if (snoozeDate.getFullYear() > 2100) {
          throw new Error('Snooze datetime must not be after year 2100');
        }

        await client.snoozeConversation(parseIdArg(id, 'conversation'), {
          snoozedUntil: options.until,
          unsnoozeOnCustomerReply: options.wakeOnReply,
        });
        outputJson({
          message: 'Conversation snoozed',
          snoozedUntil: options.until,
          wakeOnReply: options.wakeOnReply,
        });
      }
    )
  );

cmd
  .command('unsnooze')
  .description('Remove snooze from a conversation and return it to the inbox')
  .argument('<id>', 'Conversation ID')
  .action(
    withErrorHandling(async (id: string) => {
      await client.unsnoozeConversation(parseIdArg(id, 'conversation'));
      outputJson({ message: 'Conversation unsnoozed' });
    })
  );
```

### CLI Usage Examples

```bash
# Snooze until a specific datetime
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z

# Snooze with automatic unsnooze on customer reply (default)
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z --wake-on-reply

# Snooze and stay snoozed even if customer replies
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z --no-wake-on-reply

# Remove snooze from a conversation
helpscout conversations unsnooze 456
```

---

## 3. MCP Server Tools

**File:** `src/mcp/server.ts`

### Update Tool Registry

Add to the `toolRegistry` array (around line 44):

```typescript
{ name: 'snooze_conversation', description: 'Snooze a conversation until a specific datetime' },
{ name: 'unsnooze_conversation', description: 'Remove snooze from a conversation' },
```

### Add Tool Definitions

Add after the `update_conversation_fields` tool (around line 451):

```typescript
server.tool(
  'snooze_conversation',
  'Snooze a conversation until a specific datetime',
  {
    conversationId: z.number().describe('Conversation ID'),
    snoozedUntil: z
      .string()
      .describe('ISO 8601 datetime to snooze until (e.g., 2026-02-15T09:00:00Z). Must be in the future and before year 2100.'),
    unsnoozeOnCustomerReply: z
      .boolean()
      .optional()
      .default(true)
      .describe('Automatically unsnooze when customer replies (default: true)'),
  },
  async ({ conversationId, snoozedUntil, unsnoozeOnCustomerReply }) => {
    // Validate datetime
    const snoozeDate = new Date(snoozedUntil);
    if (isNaN(snoozeDate.getTime())) {
      return jsonResponse({ error: 'Invalid datetime format. Use ISO 8601 format.' });
    }
    if (snoozeDate <= new Date()) {
      return jsonResponse({ error: 'Snooze datetime must be in the future' });
    }
    if (snoozeDate.getFullYear() > 2100) {
      return jsonResponse({ error: 'Snooze datetime must not be after year 2100' });
    }

    await client.snoozeConversation(conversationId, {
      snoozedUntil,
      unsnoozeOnCustomerReply,
    });
    return jsonResponse({ success: true, snoozedUntil, unsnoozeOnCustomerReply });
  }
);

server.tool(
  'unsnooze_conversation',
  'Remove snooze from a conversation',
  {
    conversationId: z.number().describe('Conversation ID'),
  },
  async ({ conversationId }) => {
    await client.unsnoozeConversation(conversationId);
    return jsonResponse({ success: true });
  }
);
```

---

## 4. README Documentation

**File:** `README.md`

Add after the existing conversation commands section (after line 61):

```markdown
# Snoozing
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z --no-wake-on-reply
helpscout conversations unsnooze 456
```

Or as a more detailed section:

```markdown
### Snoozing Conversations

```bash
# Snooze until a specific datetime (wakes on customer reply by default)
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z

# Snooze and stay snoozed even if customer replies
helpscout conversations snooze 456 --until 2026-02-15T09:00:00Z --no-wake-on-reply

# Remove snooze and return to inbox
helpscout conversations unsnooze 456
```
```

---

## 5. Implementation Checklist

- [ ] **API Client** (`src/lib/api-client.ts`)
  - [ ] Add `snoozeConversation()` method
  - [ ] Add `unsnoozeConversation()` method

- [ ] **CLI Commands** (`src/commands/conversations.ts`)
  - [ ] Add `snooze` command with `--until` and `--wake-on-reply` options
  - [ ] Add `unsnooze` command
  - [ ] Add datetime validation (future, before 2100, valid ISO 8601)

- [ ] **MCP Server** (`src/mcp/server.ts`)
  - [ ] Add entries to `toolRegistry` array
  - [ ] Add `snooze_conversation` tool with validation
  - [ ] Add `unsnooze_conversation` tool

- [ ] **README** (`README.md`)
  - [ ] Add snooze command examples

- [ ] **Testing**
  - [ ] Build: `bun run build`
  - [ ] Test CLI: `bun run src/cli.ts conversations snooze --help`
  - [ ] Test MCP: Verify tools appear in `search_tools` results

---

## 6. Testing Scenarios

### CLI Testing

```bash
# Test help output
bun run src/cli.ts conversations snooze --help
bun run src/cli.ts conversations unsnooze --help

# Test validation - should fail with helpful error messages
bun run src/cli.ts conversations snooze 123 --until invalid-date
bun run src/cli.ts conversations snooze 123 --until 2020-01-01T00:00:00Z  # Past date
bun run src/cli.ts conversations snooze 123 --until 2101-01-01T00:00:00Z  # After 2100

# Test with real conversation (requires auth)
bun run src/cli.ts conversations snooze 123456789 --until 2026-02-01T09:00:00Z
bun run src/cli.ts conversations unsnooze 123456789
```

### MCP Testing

After starting the MCP server, verify the tools are available:

```json
{
  "tool": "search_tools",
  "arguments": { "query": "snooze" }
}
```

Expected response:
```json
{
  "tools": [
    { "name": "snooze_conversation", "description": "Snooze a conversation until a specific datetime" },
    { "name": "unsnooze_conversation", "description": "Remove snooze from a conversation" }
  ]
}
```

---

## 7. Future Enhancements (Optional)

### Natural Language Date Parsing

Could add support for natural language dates like "tomorrow at 9am" or "next Monday" using a library like `chrono-node`:

```bash
helpscout conversations snooze 456 --until "tomorrow at 9am"
helpscout conversations snooze 456 --until "next Monday"
```

### Duration-based Snoozing

Could add a `--for` option as an alternative to `--until`:

```bash
helpscout conversations snooze 456 --for 2h    # Snooze for 2 hours
helpscout conversations snooze 456 --for 1d    # Snooze for 1 day
helpscout conversations snooze 456 --for 1w    # Snooze for 1 week
```

### Show Snooze Status

The conversation object may include snooze status when fetched. Could add `--show-snooze` flag to `view` command:

```bash
helpscout conversations view 456 --show-snooze
```

These enhancements are outside the scope of the initial implementation but could be added later.

---

## 8. Estimated Effort

| Component | Estimated Time |
|-----------|---------------|
| API Client methods | 10 minutes |
| CLI commands + validation | 20 minutes |
| MCP tools + validation | 15 minutes |
| README updates | 5 minutes |
| Testing | 15 minutes |
| **Total** | **~1 hour** |
