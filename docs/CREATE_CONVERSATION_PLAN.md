# Implementation Plan: Create Conversation

This document outlines the implementation plan for adding "create conversation" functionality to the helpscout-cli fork.

## Overview

The Help Scout API supports creating conversations via `POST /v2/conversations`. This feature will allow users to:

1. Create new email, chat, or phone conversations
2. Specify customer by ID or email (auto-creates customer if needed)
3. Include the initial thread content (customer message, note, or reply)
4. Set initial status, tags, assignee, and custom fields

## API Reference

**Endpoint:** `POST /v2/conversations`

**Response:** `201 Created` with `Resource-ID` header containing the new conversation ID

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `subject` | string | Conversation title |
| `type` | enum | `email`, `chat`, or `phone` |
| `status` | enum | `active`, `closed`, or `pending` |
| `mailboxId` | number | Target mailbox ID |
| `customer` | object | Customer `id` OR `email` (creates if not found) |
| `threads` | array | At least one thread required |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `assignTo` | number | User ID to assign (`null` for unassigned) |
| `tags` | array | Tag names to add |
| `fields` | array | Custom field ID-value pairs |
| `user` | number | User ID creating the conversation |
| `imported` | boolean | Historical import mode (no emails/notifications) |
| `autoReply` | boolean | Enable auto-reply |
| `createdAt` | string | ISO 8601 timestamp (imported only) |
| `closedAt` | string | ISO 8601 timestamp (imported only) |

### Customer Object

```typescript
interface CreateCustomer {
  id?: number;          // Existing customer ID (takes precedence)
  email?: string;       // Email (creates customer if not found)
  firstName?: string;   // 1-40 characters
  lastName?: string;    // 1-40 characters
  phone?: string;
  jobTitle?: string;
  organization?: string;
  location?: string;
}
```

### Thread Types

When creating a conversation, the first thread can be:

1. **customer** - Incoming message from customer
2. **note** - Internal note (not visible to customer)
3. **reply** - Outgoing message to customer

Each thread requires:
- `type`: The thread type
- `text`: The message content
- `customer`: (for customer threads) Customer object with id or email

---

## 1. API Client Changes

**File:** `src/lib/api-client.ts`

### Add Interface Definitions

```typescript
// Add after existing interfaces (around line 25)

interface CreateConversationThread {
  type: 'customer' | 'note' | 'reply' | 'chat' | 'phone';
  text: string;
  customer?: {
    id?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  user?: number;
  imported?: boolean;
  createdAt?: string;
  cc?: string[];
  bcc?: string[];
}

interface CreateConversationData {
  subject: string;
  type: 'email' | 'chat' | 'phone';
  status?: 'active' | 'closed' | 'pending';
  mailboxId: number;
  customer: {
    id?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    jobTitle?: string;
    organization?: string;
    location?: string;
  };
  threads: CreateConversationThread[];
  assignTo?: number | null;
  tags?: string[];
  fields?: Array<{ id: number; value: string }>;
  user?: number;
  imported?: boolean;
  autoReply?: boolean;
  createdAt?: string;
  closedAt?: string;
}

interface CreateConversationResponse {
  conversationId: number;
}
```

### Add API Method

```typescript
// Add to HelpScoutClient class (after deleteConversation method, around line 260)

async createConversation(data: CreateConversationData): Promise<CreateConversationResponse> {
  // Build request body
  const body: Record<string, unknown> = {
    subject: data.subject,
    type: data.type,
    status: data.status || 'active',
    mailboxId: data.mailboxId,
    customer: data.customer,
    threads: data.threads,
  };

  // Add optional fields
  if (data.assignTo !== undefined) {
    body.assignTo = data.assignTo;
  }
  if (data.tags?.length) {
    body.tags = data.tags;
  }
  if (data.fields?.length) {
    body.fields = data.fields;
  }
  if (data.user) {
    body.user = data.user;
  }
  if (data.imported) {
    body.imported = data.imported;
    if (data.createdAt) body.createdAt = data.createdAt;
    if (data.closedAt) body.closedAt = data.closedAt;
  }
  if (data.autoReply) {
    body.autoReply = data.autoReply;
  }

  // Make request and extract conversation ID from response header
  const response = await this.requestWithHeaders<void>('POST', '/conversations', { body });

  // The API returns the conversation ID in the Resource-ID header
  const resourceId = response.headers.get('Resource-ID');
  if (!resourceId) {
    throw new HelpScoutCliError('Failed to get conversation ID from response', 500);
  }

  return { conversationId: parseInt(resourceId, 10) };
}
```

### Add Helper Method for Headers

The current `request` method doesn't return headers. Add a variant that does:

```typescript
// Add after the existing request method (around line 185)

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

  if (response.status === 201) {
    // Created - return empty data with headers
    return { data: {} as T, headers: response.headers };
  }

  if (response.status === 204) {
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

## 2. CLI Command Changes

**File:** `src/commands/conversations.ts`

### Add Create Command

Add after the `list` command (around line 198):

```typescript
cmd
  .command('create')
  .description('Create a new conversation')
  .requiredOption('-s, --subject <text>', 'Conversation subject')
  .requiredOption('-m, --mailbox <id>', 'Mailbox ID')
  .requiredOption('--customer-email <email>', 'Customer email address')
  .requiredOption('--text <text>', 'Initial message text')
  .option('--customer-id <id>', 'Customer ID (overrides email lookup)')
  .option('--customer-first-name <name>', 'Customer first name')
  .option('--customer-last-name <name>', 'Customer last name')
  .option('--type <type>', 'Conversation type (email, chat, phone)', 'email')
  .option('--thread-type <type>', 'First thread type (customer, note, reply)', 'customer')
  .option('--status <status>', 'Initial status (active, closed, pending)', 'active')
  .option('--assignee <userId>', 'User ID to assign to')
  .option('--tags <tags>', 'Comma-separated tag names')
  .option('--imported', 'Mark as imported (no emails/notifications sent)')
  .option('--auto-reply', 'Enable auto-reply')
  .action(
    withErrorHandling(
      async (options: {
        subject: string;
        mailbox: string;
        customerEmail: string;
        text: string;
        customerId?: string;
        customerFirstName?: string;
        customerLastName?: string;
        type?: string;
        threadType?: string;
        status?: string;
        assignee?: string;
        tags?: string;
        imported?: boolean;
        autoReply?: boolean;
      }) => {
        // Build customer object
        const customer: {
          id?: number;
          email?: string;
          firstName?: string;
          lastName?: string;
        } = {};

        if (options.customerId) {
          customer.id = parseIdArg(options.customerId, 'customer');
        } else {
          customer.email = options.customerEmail;
        }

        if (options.customerFirstName) {
          customer.firstName = options.customerFirstName;
        }
        if (options.customerLastName) {
          customer.lastName = options.customerLastName;
        }

        // Build thread
        const thread: {
          type: string;
          text: string;
          customer?: typeof customer;
        } = {
          type: options.threadType || 'customer',
          text: options.text,
        };

        // Customer threads need the customer object
        if (thread.type === 'customer') {
          thread.customer = customer;
        }

        // Build conversation data
        const data = {
          subject: options.subject,
          type: (options.type || 'email') as 'email' | 'chat' | 'phone',
          status: (options.status || 'active') as 'active' | 'closed' | 'pending',
          mailboxId: parseIdArg(options.mailbox, 'mailbox'),
          customer,
          threads: [thread],
          assignTo: options.assignee ? parseIdArg(options.assignee, 'assignee') : undefined,
          tags: options.tags?.split(',').map((t) => t.trim()),
          imported: options.imported,
          autoReply: options.autoReply,
        };

        const result = await client.createConversation(data);
        outputJson({
          message: 'Conversation created',
          conversationId: result.conversationId,
        });
      }
    )
  );
```

---

## 3. MCP Server Changes

**File:** `src/mcp/server.ts`

### Update Tool Registry

Add to the `toolRegistry` array (around line 14):

```typescript
{ name: 'create_conversation', description: 'Create a new conversation with customer and initial message' },
```

### Add MCP Tool

Add after the `update_conversation` tool (around line 424):

```typescript
server.tool(
  'create_conversation',
  'Create a new conversation with customer and initial message',
  {
    subject: z.string().describe('Conversation subject'),
    mailboxId: z.number().describe('Mailbox ID'),
    customerEmail: z.string().describe('Customer email address'),
    text: z.string().describe('Initial message text'),
    customerId: z.number().optional().describe('Customer ID (overrides email lookup)'),
    customerFirstName: z.string().optional().describe('Customer first name'),
    customerLastName: z.string().optional().describe('Customer last name'),
    type: z.enum(['email', 'chat', 'phone']).optional().describe('Conversation type'),
    threadType: z.enum(['customer', 'note', 'reply']).optional().describe('First thread type'),
    status: z.enum(['active', 'closed', 'pending']).optional().describe('Initial status'),
    assignTo: z.number().optional().describe('User ID to assign to'),
    tags: z.array(z.string()).optional().describe('Tag names to add'),
    imported: z.boolean().optional().describe('Mark as imported (no emails/notifications)'),
    autoReply: z.boolean().optional().describe('Enable auto-reply'),
  },
  async ({
    subject,
    mailboxId,
    customerEmail,
    text,
    customerId,
    customerFirstName,
    customerLastName,
    type,
    threadType,
    status,
    assignTo,
    tags,
    imported,
    autoReply,
  }) => {
    // Build customer object
    const customer: {
      id?: number;
      email?: string;
      firstName?: string;
      lastName?: string;
    } = customerId ? { id: customerId } : { email: customerEmail };

    if (customerFirstName) customer.firstName = customerFirstName;
    if (customerLastName) customer.lastName = customerLastName;

    // Build thread
    const thread: {
      type: string;
      text: string;
      customer?: typeof customer;
    } = {
      type: threadType || 'customer',
      text,
    };

    if (thread.type === 'customer') {
      thread.customer = customer;
    }

    const result = await client.createConversation({
      subject,
      type: type || 'email',
      status: status || 'active',
      mailboxId,
      customer,
      threads: [thread],
      assignTo,
      tags,
      imported,
      autoReply,
    });

    return jsonResponse({
      success: true,
      conversationId: result.conversationId,
    });
  }
);
```

---

## 4. README Documentation

**File:** `README.md`

Add to the Conversations section (after line 61):

```markdown
# Create conversations
helpscout conversations create \
  --subject "New support request" \
  --mailbox 123 \
  --customer-email "customer@example.com" \
  --text "Hi, I need help with..."

# Create with customer name and tags
helpscout conversations create \
  --subject "Billing question" \
  --mailbox 123 \
  --customer-email "customer@example.com" \
  --customer-first-name "John" \
  --customer-last-name "Doe" \
  --text "I have a question about my invoice." \
  --tags billing,priority

# Create with assignment
helpscout conversations create \
  --subject "Technical issue" \
  --mailbox 123 \
  --customer-email "customer@example.com" \
  --text "The app is crashing." \
  --assignee 456 \
  --status pending

# Create an internal note thread (not visible to customer)
helpscout conversations create \
  --subject "Internal tracking" \
  --mailbox 123 \
  --customer-email "internal@example.com" \
  --text "This is an internal note" \
  --thread-type note

# Import historical conversation (no notifications sent)
helpscout conversations create \
  --subject "Historical ticket" \
  --mailbox 123 \
  --customer-email "customer@example.com" \
  --text "Archived message content" \
  --imported
```

---

## 5. Type Definitions

**File:** `src/types/index.ts`

Add after the `Mailbox` interface (around line 211):

```typescript
export interface CreateConversationThread {
  type: 'customer' | 'note' | 'reply' | 'chat' | 'phone';
  text: string;
  customer?: {
    id?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  user?: number;
  imported?: boolean;
  createdAt?: string;
  cc?: string[];
  bcc?: string[];
}

export interface CreateConversationData {
  subject: string;
  type: 'email' | 'chat' | 'phone';
  status?: 'active' | 'closed' | 'pending';
  mailboxId: number;
  customer: {
    id?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    jobTitle?: string;
    organization?: string;
    location?: string;
  };
  threads: CreateConversationThread[];
  assignTo?: number | null;
  tags?: string[];
  fields?: Array<{ id: number; value: string }>;
  user?: number;
  imported?: boolean;
  autoReply?: boolean;
  createdAt?: string;
  closedAt?: string;
}

export interface CreateConversationResponse {
  conversationId: number;
}
```

---

## Implementation Checklist

- [ ] Add type definitions to `src/types/index.ts`
- [ ] Add `requestWithHeaders` method to `HelpScoutClient` class
- [ ] Add `createConversation` method to `HelpScoutClient` class
- [ ] Add `create` subcommand to conversations CLI command
- [ ] Add `create_conversation` MCP tool
- [ ] Update tool registry in MCP server
- [ ] Update README with usage examples
- [ ] Test CLI command with various options
- [ ] Test MCP tool integration
- [ ] Verify conversation ID is correctly extracted from response headers

---

## Testing Commands

```bash
# Build and link locally
bun run build && bun link

# Test basic creation
helpscout conversations create \
  --subject "Test conversation" \
  --mailbox <your-mailbox-id> \
  --customer-email "test@example.com" \
  --text "This is a test message"

# Verify it was created
helpscout conversations view <returned-id>
```

---

## Edge Cases to Handle

1. **Missing mailbox ID**: Return helpful error suggesting `helpscout mailboxes list`
2. **Invalid customer email**: API will return 400, pass through error message
3. **Thread limit exceeded**: API returns 412, handle gracefully
4. **Customer not found with ID**: API returns 404, suggest using email instead
5. **Missing required fields**: Commander.js handles required options

---

## Future Enhancements

1. **Attachments support**: Add `--attachment` flag for file attachments
2. **CC/BCC support**: Add `--cc` and `--bcc` flags for email conversations
3. **Custom fields**: Add `--field` flag for setting custom field values
4. **Interactive mode**: Prompt for missing required fields
5. **Template support**: Create from saved reply template
