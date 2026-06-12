import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { client } from '../lib/api-client.js';
import { auth } from '../lib/auth.js';
import { normalizeConversationStatus } from '../lib/conversation-status.js';
import { buildDateQuery } from '../lib/dates.js';
import { normalizeSearchQuery } from '../lib/search.js';
import { buildConversationThreadsResult } from './conversation-threads.js';
import type {
  Conversation,
  Customer,
  Mailbox,
  Tag,
  Thread,
  User,
  Workflow,
} from '../types/index.js';

declare const __VERSION__: string;
declare const __HOMEPAGE__: string;

const DEFAULT_MAX_RESULTS = 25;
const DEFAULT_MAX_THREADS = 20;

type JsonObject = Record<string, unknown>;
type ResourceLinkBlock = {
  type: 'resource_link';
  uri: string;
  name: string;
  description: string;
  mimeType: 'application/json';
};

/**
 * Strip HAL navigation links, photo URLs, placeholder values, and tag styles
 * from API responses. Keeps _embedded (carries actual data like threads) and
 * HTML bodies (LLMs parse structured HTML better than flattened plain text).
 */
function cleanForMcp(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(cleanForMcp);
  if (data === null || typeof data !== 'object') return data;

  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === '_links') continue;
    if (key === 'photoUrl') continue;
    if (key === 'color' && Object.keys(obj).includes('name') && Object.keys(obj).includes('slug'))
      continue; // tag style
    if (key === 'styles' && Object.keys(obj).includes('name') && Object.keys(obj).includes('slug'))
      continue; // tag style

    // Strip zero-valued IDs (Help Scout placeholder convention)
    if (key === 'id' && value === 0) continue;
    // Strip first/last when we'll synthesize a combined name below
    if ((key === 'first' || key === 'last') && ('first' in obj || 'last' in obj)) continue;

    result[key] = cleanForMcp(value);
  }

  // Synthesize combined name from first/last on person objects
  if ('first' in obj || 'last' in obj) {
    const first = typeof obj.first === 'string' ? obj.first : '';
    const last = typeof obj.last === 'string' ? obj.last : '';
    const name = `${first} ${last}`.trim();
    if (name) result.name = name;
  }

  return result;
}

function asRecord(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function normalizeConversation(conversation: Conversation): JsonObject {
  const cleaned = asRecord(cleanForMcp(conversation));

  if (typeof cleaned.threads === 'number') {
    const { threads, ...rest } = cleaned;
    return { ...rest, threadCount: threads };
  }

  return cleaned;
}

function normalizeConversations(conversations: Conversation[]) {
  return conversations.map(normalizeConversation);
}

function cleanCustomer(customer: Customer) {
  return asRecord(cleanForMcp(customer));
}

function cleanMailbox(mailbox: Mailbox) {
  return asRecord(cleanForMcp(mailbox));
}

function cleanTag(tag: Tag) {
  return asRecord(cleanForMcp(tag));
}

function cleanUser(user: User) {
  return asRecord(cleanForMcp(user));
}

function cleanWorkflow(workflow: Workflow) {
  return asRecord(cleanForMcp(workflow));
}

function jsonTextContent(data: unknown) {
  return {
    type: 'text' as const,
    text: JSON.stringify(data, null, 2),
  };
}

function resourceLinkContent(uri: string, name: string, description: string): ResourceLinkBlock {
  return {
    type: 'resource_link',
    uri,
    name,
    description,
    mimeType: 'application/json',
  };
}

function structuredJsonResult<T extends JsonObject>(
  structuredContent: T,
  extraContent: ResourceLinkBlock[] = []
) {
  return {
    content: [jsonTextContent(structuredContent), ...extraContent],
    structuredContent,
  };
}

function textJsonResult(data: unknown, isError = false) {
  return {
    content: [jsonTextContent(data)],
    ...(isError && { isError: true }),
  };
}

/** Backward-compat alias used by fork-added server.tool() registrations. */
const jsonResponse = textJsonResult;

/** Wrap search results with omission metadata when capped. */
function withOmissionMeta(all: Conversation[], maxResults: number) {
  const total = all.length;
  const conversations = total > maxResults ? all.slice(0, maxResults) : all;
  return {
    conversations: normalizeConversations(conversations),
    ...(total > maxResults && {
      total_results: total,
      returned: maxResults,
      omitted: total - maxResults,
    }),
  };
}

/** Cap threads, keeping first (original) + most recent. */
function capThreads(threads: Thread[], maxThreads: number) {
  if (threads.length <= maxThreads) {
    return { threads: cleanForMcp(threads) as unknown[] };
  }

  const kept = maxThreads <= 1 ? [threads[0]] : [threads[0], ...threads.slice(-(maxThreads - 1))];

  return {
    threads: cleanForMcp(kept) as unknown[],
    total_threads: threads.length,
    returned_threads: kept.length,
    omitted_threads: threads.length - kept.length,
  };
}

async function getConversationDetail(
  conversationId: number,
  includeThreads = false,
  maxThreads = DEFAULT_MAX_THREADS
) {
  const conversation = await client.getConversation(conversationId);
  const detail: JsonObject = { conversation: normalizeConversation(conversation) };

  if (!includeThreads) {
    return detail;
  }

  const threads = await client.getConversationThreads(conversationId);
  return { ...detail, ...capThreads(threads, maxThreads) };
}

function buildJsonResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function parseTemplateNumber(value: unknown, variableName: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${variableName}: ${String(raw)}`);
  }

  return parsed;
}

function conversationResourceUri(conversationId: number) {
  return `helpscout://conversation/${conversationId}`;
}

function customerResourceUri(customerId: number) {
  return `helpscout://customer/${customerId}`;
}

function userResourceUri(userId: number) {
  return `helpscout://user/${userId}`;
}

const pageInfoSchema = z.object({
  size: z.number(),
  totalElements: z.number(),
  totalPages: z.number(),
  number: z.number(),
});

const personSchema = z
  .object({
    id: z.number().optional(),
    type: z.string().optional(),
    email: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const sourceSchema = z
  .object({
    type: z.string(),
    via: z.string(),
  })
  .passthrough();

const tagSchema = z
  .object({
    id: z.number().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
    tag: z.string().optional(),
    color: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    ticketCount: z.number().optional(),
  })
  .passthrough();

const customFieldSchema = z
  .object({
    id: z.number().optional(),
    name: z.string(),
    value: z.string(),
    type: z.string(),
  })
  .passthrough();

const conversationSchema = z
  .object({
    id: z.number(),
    number: z.number(),
    type: z.string(),
    folderId: z.number().optional(),
    status: z.string(),
    state: z.string(),
    subject: z.string(),
    preview: z.string(),
    mailboxId: z.number(),
    assignee: personSchema.optional(),
    createdBy: personSchema.optional(),
    createdAt: z.string(),
    closedAt: z.string().optional(),
    closedBy: z.number().optional(),
    modifiedAt: z.string().optional(),
    customerWaitingSince: z
      .object({
        time: z.string(),
        friendly: z.string(),
      })
      .optional(),
    source: sourceSchema.optional(),
    tags: z.array(tagSchema).optional(),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    primaryCustomer: personSchema.optional(),
    customFields: z.array(customFieldSchema).optional(),
    threadCount: z.number().optional(),
  })
  .passthrough();

const threadSchema = z
  .object({
    id: z.number().optional(),
    type: z.string(),
    // Not present on every thread type (e.g. lineitem and other system-generated
    // threads omit them), so these are optional rather than required.
    status: z.string().optional(),
    state: z.string().optional(),
    action: z
      .object({
        type: z.string(),
        text: z.string().optional(),
      })
      .optional(),
    body: z.string().optional(),
    source: sourceSchema.optional(),
    customer: personSchema.optional(),
    createdBy: personSchema.optional(),
    assignedTo: personSchema.optional(),
    savedReplyId: z.number().optional(),
    to: z.array(z.string()).optional(),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    createdAt: z.string(),
    openedAt: z.string().optional(),
  })
  .passthrough();

const customerSchema = z
  .object({
    id: z.number(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    gender: z.string().optional(),
    jobTitle: z.string().optional(),
    location: z.string().optional(),
    organization: z.string().optional(),
    photoType: z.string().optional(),
    background: z.string().optional(),
    age: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    emails: z
      .array(
        z
          .object({
            id: z.number().optional(),
            value: z.string(),
            type: z.string(),
          })
          .passthrough()
      )
      .optional(),
    phones: z
      .array(
        z
          .object({
            id: z.number().optional(),
            value: z.string(),
            type: z.string(),
          })
          .passthrough()
      )
      .optional(),
    chats: z
      .array(
        z
          .object({
            id: z.number().optional(),
            value: z.string(),
            type: z.string(),
          })
          .passthrough()
      )
      .optional(),
    socialProfiles: z
      .array(
        z
          .object({
            id: z.number().optional(),
            value: z.string(),
            type: z.string(),
          })
          .passthrough()
      )
      .optional(),
    websites: z
      .array(
        z
          .object({
            id: z.number().optional(),
            value: z.string(),
          })
          .passthrough()
      )
      .optional(),
    addresses: z
      .array(
        z
          .object({
            id: z.number().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            postalCode: z.string().optional(),
            country: z.string().optional(),
            lines: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const userSchema = z
  .object({
    id: z.number(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    role: z.string().optional(),
    timezone: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    type: z.string().optional(),
    mention: z.string().optional(),
    initials: z.string().optional(),
    jobTitle: z.string().optional(),
    phone: z.string().optional(),
    alternateEmails: z.array(z.string()).optional(),
  })
  .passthrough();

const mailboxSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    email: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const workflowSchema = z
  .object({
    id: z.number(),
    mailboxId: z.number(),
    type: z.string(),
    status: z.string(),
    order: z.number(),
    name: z.string(),
    createdAt: z.string(),
    modifiedAt: z.string(),
  })
  .passthrough();

const listConversationsOutputSchema = z.object({
  conversations: z.array(conversationSchema),
  page: pageInfoSchema,
});

const conversationDetailOutputSchema = z.object({
  conversation: conversationSchema,
  threads: z.array(threadSchema).optional(),
  total_threads: z.number().optional(),
  returned_threads: z.number().optional(),
  omitted_threads: z.number().optional(),
});

const conversationThreadsOutputSchema = z.object({
  conversationId: z.number(),
  threads: z.array(threadSchema),
  total_threads: z.number(),
  matching_threads: z.number(),
  returned_threads: z.number(),
  omitted_threads: z.number().optional(),
  filtered_types: z.array(z.string()).optional(),
});

const searchConversationsOutputSchema = z.object({
  conversations: z.array(conversationSchema),
  total_results: z.number().optional(),
  returned: z.number().optional(),
  omitted: z.number().optional(),
});

/**
 * Accepts either an internal conversation id or a visible ticket number
 * prefixed with "#" (e.g. "#12345"). Resolved to an internal id via
 * client.resolveConversationId() before use.
 */
const conversationRefSchema = z
  .union([z.number().int().positive(), z.string().min(1)])
  .describe(
    'Conversation ID (internal numeric id), or visible ticket number prefixed with "#" (e.g. "#12345")'
  );

const searchByCustomerOutputSchema = searchConversationsOutputSchema.extend({
  meta: z.object({
    email: z.string(),
    domain: z.string(),
    domainSearchSkipped: z.boolean(),
    emailResults: z.number(),
    domainResults: z.number(),
    totalAfterDedup: z.number(),
  }),
});

const conversationSummaryOutputSchema = z.object({
  total: z.number(),
  byStatus: z.record(z.string(), z.number()),
  byTag: z.record(z.string(), z.number()),
});

const listMailboxesOutputSchema = z.object({
  mailboxes: z.array(mailboxSchema),
  page: pageInfoSchema,
});

const listCustomersOutputSchema = z.object({
  customers: z.array(customerSchema),
  page: pageInfoSchema,
});

const listUsersOutputSchema = z.object({
  users: z.array(userSchema),
  page: pageInfoSchema,
});

const listTagsOutputSchema = z.object({
  tags: z.array(tagSchema),
  page: pageInfoSchema,
});

const listWorkflowsOutputSchema = z.object({
  workflows: z.array(workflowSchema),
  page: pageInfoSchema,
});

const authStatusOutputSchema = z.object({
  authenticated: z.boolean(),
});

const conversationActionOutputSchema = z.object({
  success: z.literal(true),
  conversationId: z.number(),
});

const conversationStatusOutputSchema = conversationActionOutputSchema.extend({
  status: z.enum(['active', 'pending', 'closed', 'spam']),
});

const noteOutputSchema = conversationActionOutputSchema.extend({
  status: z.enum(['active', 'pending', 'closed', 'spam']).optional(),
});

const taggedConversationOutputSchema = conversationActionOutputSchema.extend({
  tag: z.string(),
});

const draftConversationOutputSchema = z.object({
  success: z.literal(true),
  conversationId: z.number(),
});

const READ_ONLY_REMOTE_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

const READ_ONLY_LOCAL_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const MUTATING_REMOTE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const toolRegistry: Array<{ name: string; description: string }> = [];

type ConversationSummary = JsonObject & {
  total: number;
  byStatus: Record<string, number>;
  byTag: Record<string, number>;
};

function summarizeConversations(conversations: Conversation[]): ConversationSummary {
  const byStatus: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const conv of conversations) {
    byStatus[conv.status] = (byStatus[conv.status] || 0) + 1;
    for (const tag of conv.tags || []) {
      const label = tag.name ?? (tag as { tag?: string }).tag ?? 'unknown';
      byTag[label] = (byTag[label] || 0) + 1;
    }
  }

  return { total: conversations.length, byStatus, byTag };
}

const server = new McpServer({
  name: 'helpscout',
  version: __VERSION__,
  ...(__HOMEPAGE__ ? { websiteUrl: __HOMEPAGE__ } : {}),
  description: 'Help Scout MCP server for mailbox, customer, tag, and workflow operations.',
});

function rememberTool(name: string, description: string) {
  toolRegistry.push({ name, description });
}

export function getRegisteredToolsForTesting() {
  return [...toolRegistry];
}

const dateFilterSchema = {
  createdSince: z
    .string()
    .optional()
    .describe(
      'Filter by creation date — returns only conversations created after this date. Does not include older conversations with recent activity; use modifiedSince for that.'
    ),
  createdBefore: z
    .string()
    .optional()
    .describe('Filter by creation date — returns only conversations created before this date'),
  modifiedSince: z
    .string()
    .optional()
    .describe(
      'Filter by last activity date — returns conversations with ANY activity (replies, notes, status changes, tag changes) after this date, including old conversations. Use createdSince to filter by creation date instead.'
    ),
  modifiedBefore: z
    .string()
    .optional()
    .describe(
      'Filter by last activity date — returns conversations with last activity before this date'
    ),
};

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'hey.com',
  'protonmail.com',
  'proton.me',
  'fastmail.com',
  'tutanota.com',
]);

server.registerResource(
  'conversation-resource',
  new ResourceTemplate('helpscout://conversation/{conversationId}', { list: undefined }),
  {
    title: 'Help Scout Conversation',
    description: 'Detailed Help Scout conversation JSON, including capped threads.',
    mimeType: 'application/json',
  },
  async (uri, variables) => {
    const conversationId = parseTemplateNumber(variables.conversationId, 'conversationId');
    const detail = await getConversationDetail(conversationId, true, DEFAULT_MAX_THREADS);
    return buildJsonResource(uri.toString(), detail);
  }
);

server.registerResource(
  'customer-resource',
  new ResourceTemplate('helpscout://customer/{customerId}', { list: undefined }),
  {
    title: 'Help Scout Customer',
    description: 'Detailed Help Scout customer JSON.',
    mimeType: 'application/json',
  },
  async (uri, variables) => {
    const customerId = parseTemplateNumber(variables.customerId, 'customerId');
    const customer = cleanCustomer(await client.getCustomer(customerId));
    return buildJsonResource(uri.toString(), customer);
  }
);

server.registerResource(
  'user-resource',
  new ResourceTemplate('helpscout://user/{userId}', { list: undefined }),
  {
    title: 'Help Scout User',
    description: 'Detailed Help Scout user JSON, including mention handle when available.',
    mimeType: 'application/json',
  },
  async (uri, variables) => {
    const userId = parseTemplateNumber(variables.userId, 'userId');
    const user = cleanUser(await client.getUser(userId));
    return buildJsonResource(uri.toString(), user);
  }
);

server.registerPrompt(
  'summarize_ticket',
  {
    title: 'Summarize Ticket',
    description: 'Generate an internal summary of a Help Scout conversation.',
    argsSchema: {
      conversationId: z.number().describe('Conversation ID to summarize'),
      focus: z
        .string()
        .optional()
        .describe('Optional area to emphasize, such as billing, bugs, or customer sentiment'),
      maxThreads: z
        .number()
        .optional()
        .default(DEFAULT_MAX_THREADS)
        .describe('Maximum threads to include in the prompt context (default 20)'),
    },
  },
  async ({ conversationId, focus, maxThreads }) => {
    const detail = await getConversationDetail(conversationId, true, maxThreads);
    const instructions = [
      'Summarize this Help Scout conversation for an internal support teammate.',
      focus
        ? `Focus especially on: ${focus}.`
        : 'Focus on the customer issue, the current status, unresolved questions, and the next recommended action.',
      'Do not draft a reply to the customer.',
      `Conversation resource URI: ${conversationResourceUri(conversationId)}`,
      'Conversation JSON:',
      JSON.stringify(detail, null, 2),
    ].join('\n\n');

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: instructions,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  'draft_reply',
  {
    title: 'Draft Reply',
    description: 'Draft a customer-facing reply from a Help Scout conversation.',
    argsSchema: {
      conversationId: z.number().describe('Conversation ID to reply to'),
      tone: z
        .string()
        .optional()
        .describe('Desired tone, such as concise, warm, direct, or apologetic'),
      goal: z
        .string()
        .optional()
        .describe(
          'Specific reply goal, such as resolving billing confusion or asking for a reproduction'
        ),
      maxThreads: z
        .number()
        .optional()
        .default(DEFAULT_MAX_THREADS)
        .describe('Maximum threads to include in the prompt context (default 20)'),
    },
  },
  async ({ conversationId, tone, goal, maxThreads }) => {
    const detail = await getConversationDetail(conversationId, true, maxThreads);
    const instructions = [
      'Draft a Help Scout reply to the customer using the conversation data below.',
      tone ? `Tone: ${tone}.` : 'Tone: clear, professional, and empathetic.',
      goal
        ? `Primary goal: ${goal}.`
        : 'Primary goal: move the conversation toward a clear next step.',
      'Do not claim the message has already been sent.',
      `Conversation resource URI: ${conversationResourceUri(conversationId)}`,
      'Conversation JSON:',
      JSON.stringify(detail, null, 2),
    ].join('\n\n');

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: instructions,
          },
        },
      ],
    };
  }
);

rememberTool(
  'list_conversations',
  'List conversations with optional filtering by status, mailbox, tag, assignee, or date range'
);
server.registerTool(
  'list_conversations',
  {
    title: 'List Conversations',
    description:
      'List conversations with optional filtering by status, mailbox, tag, assignee, or date range',
    inputSchema: {
      status: z
        .enum(['active', 'pending', 'closed', 'spam', 'all'])
        .optional()
        .describe('Conversation status filter (defaults to "all" to include resolved tickets)'),
      mailbox: z.string().optional().describe('Mailbox ID to filter by'),
      tag: z.string().optional().describe('Tag to filter by'),
      assignedTo: z.string().optional().describe('User ID assigned to'),
      query: z
        .string()
        .optional()
        .describe(
          'Search query. Multi-word queries are automatically AND-joined unless explicit boolean operators (AND, OR, NOT) are present.'
        ),
      page: z.number().optional().describe('Page number'),
      ...dateFilterSchema,
    },
    outputSchema: listConversationsOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({
    status = 'all',
    mailbox,
    tag,
    assignedTo,
    query,
    page,
    createdSince,
    createdBefore,
    modifiedSince,
    modifiedBefore,
  }) => {
    const normalizedQuery = normalizeSearchQuery(query);
    const dateQuery = buildDateQuery(
      { createdSince, createdBefore, modifiedSince, modifiedBefore },
      normalizedQuery
    );
    const result = await client.listConversations({
      status,
      mailbox,
      tag,
      assignedTo,
      query: dateQuery,
      page,
    });

    return structuredJsonResult({
      conversations: normalizeConversations(result.conversations),
      page: result.page,
    });
  }
);

rememberTool(
  'get_conversation',
  'Get detailed information about a specific conversation. When includeThreads is true, the result includes capped threads as a separate array.'
);
server.registerTool(
  'get_conversation',
  {
    title: 'Get Conversation',
    description:
      'Get detailed information about a specific conversation. When includeThreads is true, the result includes capped threads as a separate array.',
    inputSchema: {
      conversationId: conversationRefSchema,
      includeThreads: z.boolean().optional().describe('Include conversation threads'),
      maxThreads: z
        .number()
        .optional()
        .default(DEFAULT_MAX_THREADS)
        .describe('Maximum threads to return (default 20). Keeps original message + most recent.'),
    },
    outputSchema: conversationDetailOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId: conversationRef, includeThreads = false, maxThreads }) => {
    const conversationId = await client.resolveConversationId(conversationRef);
    const detail = await getConversationDetail(conversationId, includeThreads, maxThreads);

    return structuredJsonResult(detail, [
      resourceLinkContent(
        conversationResourceUri(conversationId),
        `Conversation ${conversationId}`,
        'Detailed Help Scout conversation resource'
      ),
    ]);
  }
);

rememberTool(
  'get_conversation_threads',
  'Get the full thread history for a conversation, including notes, workflow events, status events, and other system thread types returned by Help Scout. Accepts internal ids or visible ticket numbers like "#12345".'
);
server.registerTool(
  'get_conversation_threads',
  {
    title: 'Get Conversation Threads',
    description:
      'Get the full thread history for a conversation, including notes, workflow events, status events, and other system thread types returned by Help Scout. Accepts internal ids or visible ticket numbers like "#12345".',
    inputSchema: {
      conversationId: conversationRefSchema,
      types: z
        .array(z.string())
        .optional()
        .describe(
          'Optional thread type filter, such as ["customer", "message", "note", "lineitem"]. Omit to return all thread types.'
        ),
      maxThreads: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional cap on returned threads. Omit for full history.'),
    },
    outputSchema: conversationThreadsOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId: conversationRef, types, maxThreads }) => {
    const conversationId = await client.resolveConversationId(conversationRef);
    const threads = await client.getConversationThreads(conversationId);

    return structuredJsonResult(
      buildConversationThreadsResult(conversationId, threads, {
        types,
        maxThreads,
        cleanThreads: (items) => cleanForMcp(items) as unknown[],
      }),
      [
        resourceLinkContent(
          conversationResourceUri(conversationId),
          `Conversation ${conversationId}`,
          'Detailed Help Scout conversation resource'
        ),
      ]
    );
  }
);

rememberTool(
  'search_conversations',
  'Search conversations matching a query. Results are capped by maxResults (default 25). If results are truncated, use date filters or more specific search terms to narrow. WARNING: Compound filters are unreliable — use one filter per call.'
);
server.registerTool(
  'search_conversations',
  {
    title: 'Search Conversations',
    description:
      'Search conversations matching a query. Results are capped by maxResults (default 25). If results are truncated, use date filters or more specific search terms to narrow. WARNING: Compound filters are unreliable — use one filter per call.',
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe(
          'Search query (e.g., "email:domain.com", "subject:billing"). Compound queries mixing a prefix filter with keywords are unreliable — make separate calls for each filter.'
        ),
      status: z
        .enum(['active', 'pending', 'closed', 'spam', 'all'])
        .optional()
        .describe('Status filter (defaults to "all")'),
      maxResults: z
        .number()
        .optional()
        .default(DEFAULT_MAX_RESULTS)
        .describe(
          'Maximum conversations to return (default 25). Use date filters to narrow large result sets.'
        ),
      ...dateFilterSchema,
    },
    outputSchema: searchConversationsOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({
    query,
    status = 'all',
    maxResults,
    createdSince,
    createdBefore,
    modifiedSince,
    modifiedBefore,
  }) => {
    const normalizedQuery = normalizeSearchQuery(query);
    const dateQuery = buildDateQuery(
      { createdSince, createdBefore, modifiedSince, modifiedBefore },
      normalizedQuery
    );
    const all = await client.listAllConversations({ query: dateQuery, status }, maxResults);
    return structuredJsonResult(withOmissionMeta(all, maxResults));
  }
);

rememberTool(
  'get_conversations_summary',
  'Get aggregated summary of conversations by status and tag. Fetches up to maxResults conversations (default 25) for summarization. Use date filters to scope the window.'
);
server.registerTool(
  'get_conversations_summary',
  {
    title: 'Summarize Conversations',
    description:
      'Get aggregated summary of conversations by status and tag. Fetches up to maxResults conversations (default 25) for summarization. Use date filters to scope the window.',
    inputSchema: {
      status: z
        .enum(['active', 'pending', 'closed', 'spam', 'all'])
        .optional()
        .describe('Status filter'),
      mailbox: z.string().optional().describe('Mailbox ID to filter by'),
      tag: z.string().optional().describe('Tag to filter by'),
      maxResults: z
        .number()
        .optional()
        .default(DEFAULT_MAX_RESULTS)
        .describe('Maximum conversations to summarize (default 25)'),
      ...dateFilterSchema,
    },
    outputSchema: conversationSummaryOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({
    status,
    mailbox,
    tag,
    maxResults,
    createdSince,
    createdBefore,
    modifiedSince,
    modifiedBefore,
  }) => {
    const dateQuery = buildDateQuery({
      createdSince,
      createdBefore,
      modifiedSince,
      modifiedBefore,
    });
    const conversations = await client.listAllConversations(
      { status, mailbox, tag, query: dateQuery },
      maxResults
    );
    return structuredJsonResult(summarizeConversations(conversations));
  }
);

server.tool(
  'create_conversation',
  'Create a new conversation',
  {
    subject: z.string().describe('Subject line'),
    customerEmail: z.string().optional().describe('Customer email (provide this or customerId)'),
    customerId: z.coerce.number().optional().describe('Customer ID (provide this or customerEmail)'),
    mailboxId: z.coerce.number().describe('Mailbox ID'),
    text: z.string().describe('Message body'),
    status: z.enum(['active', 'closed', 'pending']).optional().describe('Conversation status (default: active)'),
    draft: z.boolean().optional().describe('Save as draft without sending'),
    user: z.coerce.number().optional().describe('User ID sending the message'),
    assignTo: z.coerce.number().optional().describe('Assign to user ID'),
    tags: z.array(z.string()).optional().describe('Tag names to apply'),
  },
  async ({ subject, customerEmail, customerId, mailboxId, text, status, draft, user, assignTo, tags }) => {
    if (customerEmail && customerId) {
      return jsonResponse({ error: 'Provide customerEmail or customerId, not both' });
    }
    if (!customerEmail && !customerId) {
      return jsonResponse({ error: 'Either customerEmail or customerId is required' });
    }

    const customer = customerEmail ? { email: customerEmail } : { id: customerId! };

    const result = await client.createConversation({
      subject,
      customer,
      mailboxId,
      text,
      status,
      draft,
      user,
      assignTo,
      tags,
    });

    return jsonResponse({
      success: true,
      id: result.id,
      url: result.url,
      message: 'Conversation created',
    });
  }
);

rememberTool('list_mailboxes', 'List all mailboxes in the Help Scout account');
server.registerTool(
  'list_mailboxes',
  {
    title: 'List Mailboxes',
    description: 'List all mailboxes in the Help Scout account',
    outputSchema: listMailboxesOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async () => {
    const result = await client.listMailboxes();
    return structuredJsonResult({
      mailboxes: result.mailboxes.map(cleanMailbox),
      page: result.page,
    });
  }
);

rememberTool('get_mailbox', 'Get detailed information about a specific mailbox');
server.registerTool(
  'get_mailbox',
  {
    title: 'Get Mailbox',
    description: 'Get detailed information about a specific mailbox',
    inputSchema: {
      mailboxId: z.number().describe('Mailbox ID'),
    },
    outputSchema: mailboxSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ mailboxId }) => structuredJsonResult(cleanMailbox(await client.getMailbox(mailboxId)))
);

server.tool(
  'list_mailbox_fields',
  'List custom fields for a mailbox',
  { mailboxId: z.coerce.number().describe('Mailbox ID') },
  async ({ mailboxId }) => jsonResponse(await client.listMailboxFields(mailboxId))
);

rememberTool('list_customers', 'List customers with optional filtering');
server.registerTool(
  'list_customers',
  {
    title: 'List Customers',
    description: 'List customers with optional filtering',
    inputSchema: {
      query: z.string().optional().describe('Search query'),
      firstName: z.string().optional().describe('Filter by first name'),
      lastName: z.string().optional().describe('Filter by last name'),
      page: z.number().optional().describe('Page number'),
    },
    outputSchema: listCustomersOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ query, firstName, lastName, page }) => {
    const result = await client.listCustomers({ query, firstName, lastName, page });
    return structuredJsonResult({
      customers: result.customers.map(cleanCustomer),
      page: result.page,
    });
  }
);

rememberTool('get_customer', 'Get detailed information about a specific customer');
server.registerTool(
  'get_customer',
  {
    title: 'Get Customer',
    description: 'Get detailed information about a specific customer',
    inputSchema: {
      customerId: z.number().describe('Customer ID'),
    },
    outputSchema: customerSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ customerId }) => {
    const customer = cleanCustomer(await client.getCustomer(customerId));

    return structuredJsonResult(customer, [
      resourceLinkContent(
        customerResourceUri(customerId),
        `Customer ${customerId}`,
        'Detailed Help Scout customer resource'
      ),
    ]);
  }
);

server.tool(
  'create_customer',
  'Create a new customer',
  {
    firstName: z.string().optional().describe('First name'),
    lastName: z.string().optional().describe('Last name'),
    email: z.string().optional().describe('Email address'),
    phone: z.string().optional().describe('Phone number'),
  },
  async ({ firstName, lastName, email, phone }) => {
    const data = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(email && { emails: [{ type: 'work', value: email }] }),
      ...(phone && { phones: [{ type: 'work', value: phone }] }),
    };
    const result = await client.createCustomer(data);
    return jsonResponse({ success: true, id: result.id, message: 'Customer created' });
  }
);

server.tool(
  'update_customer',
  'Update an existing customer',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    firstName: z.string().optional().describe('First name'),
    lastName: z.string().optional().describe('Last name'),
    jobTitle: z.string().optional().describe('Job title'),
    location: z.string().optional().describe('Location'),
    organization: z.string().optional().describe('Organization'),
    background: z.string().optional().describe('Background notes'),
  },
  async ({ customerId, firstName, lastName, jobTitle, location, organization, background }) => {
    const data = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(jobTitle && { jobTitle }),
      ...(location && { location }),
      ...(organization && { organization }),
      ...(background && { background }),
    };
    await client.updateCustomer(customerId, data);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_customer',
  'Delete a customer',
  { customerId: z.coerce.number().describe('Customer ID') },
  async ({ customerId }) => {
    await client.deleteCustomer(customerId);
    return jsonResponse({ success: true });
  }
);

// Customer Emails
server.tool(
  'list_customer_emails',
  'List emails for a customer',
  { customerId: z.coerce.number().describe('Customer ID') },
  async ({ customerId }) => jsonResponse(await client.listCustomerEmails(customerId))
);

server.tool(
  'create_customer_email',
  'Add an email to a customer',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    type: z.enum(['home', 'work', 'other']).describe('Email type'),
    value: z.string().describe('Email address'),
  },
  async ({ customerId, type, value }) => {
    await client.createCustomerEmail(customerId, { type, value });
    return jsonResponse({ success: true });
  }
);

server.tool(
  'update_customer_email',
  'Update a customer email',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    emailId: z.coerce.number().describe('Email ID'),
    type: z.enum(['home', 'work', 'other']).optional().describe('Email type'),
    value: z.string().optional().describe('Email address'),
  },
  async ({ customerId, emailId, type, value }) => {
    const data = {
      ...(type && { type }),
      ...(value && { value }),
    };
    await client.updateCustomerEmail(customerId, emailId, data);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_customer_email',
  'Delete a customer email',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    emailId: z.coerce.number().describe('Email ID'),
  },
  async ({ customerId, emailId }) => {
    await client.deleteCustomerEmail(customerId, emailId);
    return jsonResponse({ success: true });
  }
);

// Customer Phones
server.tool(
  'list_customer_phones',
  'List phones for a customer',
  { customerId: z.coerce.number().describe('Customer ID') },
  async ({ customerId }) => jsonResponse(await client.listCustomerPhones(customerId))
);

server.tool(
  'create_customer_phone',
  'Add a phone to a customer',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    type: z.enum(['home', 'work', 'mobile', 'fax', 'pager', 'other']).describe('Phone type'),
    value: z.string().describe('Phone number'),
  },
  async ({ customerId, type, value }) => {
    await client.createCustomerPhone(customerId, { type, value });
    return jsonResponse({ success: true });
  }
);

server.tool(
  'update_customer_phone',
  'Update a customer phone',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    phoneId: z.coerce.number().describe('Phone ID'),
    type: z.enum(['home', 'work', 'mobile', 'fax', 'pager', 'other']).optional().describe('Phone type'),
    value: z.string().optional().describe('Phone number'),
  },
  async ({ customerId, phoneId, type, value }) => {
    const data = {
      ...(type && { type }),
      ...(value && { value }),
    };
    await client.updateCustomerPhone(customerId, phoneId, data);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_customer_phone',
  'Delete a customer phone',
  {
    customerId: z.coerce.number().describe('Customer ID'),
    phoneId: z.coerce.number().describe('Phone ID'),
  },
  async ({ customerId, phoneId }) => {
    await client.deleteCustomerPhone(customerId, phoneId);
    return jsonResponse({ success: true });
  }
);

rememberTool('list_users', 'List Help Scout users and mention handles with optional exact email, mailbox, and page filters');
server.registerTool(
  'list_users',
  {
    title: 'List Users',
    description:
      'List Help Scout users and mention handles with optional exact email, mailbox, and page filters',
    inputSchema: {
      email: z.string().email().optional().describe('Exact-match email filter'),
      mailbox: z.number().optional().describe('Mailbox ID to filter by'),
      page: z.number().optional().describe('Page number'),
    },
    outputSchema: listUsersOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ email, mailbox, page }) => {
    const result = await client.listUsers({ email, mailbox, page });
    return structuredJsonResult({
      users: result.users.map(cleanUser),
      page: result.page,
    });
  }
);

rememberTool(
  'get_user',
  'Get detailed information about a specific Help Scout user, including the mention handle for @mentions'
);
server.registerTool(
  'get_user',
  {
    title: 'Get User',
    description:
      'Get detailed information about a specific Help Scout user, including the mention handle for @mentions',
    inputSchema: {
      userId: z.number().describe('User ID'),
    },
    outputSchema: userSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ userId }) => {
    const user = cleanUser(await client.getUser(userId));

    return structuredJsonResult(user, [
      resourceLinkContent(
        userResourceUri(userId),
        `User ${userId}`,
        'Detailed Help Scout user resource'
      ),
    ]);
  }
);

rememberTool('list_tags', 'List all tags in the Help Scout account');
server.registerTool(
  'list_tags',
  {
    title: 'List Tags',
    description: 'List all tags in the Help Scout account',
    inputSchema: {
      page: z.number().optional().describe('Page number'),
    },
    outputSchema: listTagsOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ page }) => {
    const result = await client.listTags(page);
    return structuredJsonResult({
      tags: result.tags.map(cleanTag),
      page: result.page,
    });
  }
);

rememberTool('list_workflows', 'List workflows with optional filtering');
server.registerTool(
  'list_workflows',
  {
    title: 'List Workflows',
    description: 'List workflows with optional filtering',
    inputSchema: {
      mailbox: z.number().optional().describe('Mailbox ID to filter by'),
      type: z.enum(['automatic', 'manual']).optional().describe('Workflow type'),
      page: z.number().optional().describe('Page number'),
    },
    outputSchema: listWorkflowsOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({ mailbox, type, page }) => {
    const result = await client.listWorkflows({ mailbox, type, page });
    return structuredJsonResult({
      workflows: result.workflows.map(cleanWorkflow),
      page: result.page,
    });
  }
);

server.tool(
  'list_saved_replies',
  'List saved replies for a mailbox',
  {
    mailboxId: z.coerce.number().describe('Mailbox ID'),
    page: z.coerce.number().optional().describe('Page number'),
  },
  async ({ mailboxId, page }) => jsonResponse(await client.listSavedReplies(mailboxId, page))
);

server.tool(
  'get_saved_reply',
  'Get a saved reply with full text',
  {
    mailboxId: z.coerce.number().describe('Mailbox ID'),
    savedReplyId: z.coerce.number().describe('Saved Reply ID'),
  },
  async ({ mailboxId, savedReplyId }) =>
    jsonResponse(await client.getSavedReply(mailboxId, savedReplyId))
);

server.tool(
  'create_saved_reply',
  'Create a new saved reply',
  {
    mailboxId: z.coerce.number().describe('Mailbox ID'),
    name: z.string().describe('Name for the saved reply'),
    text: z.string().describe('HTML text content of the saved reply'),
  },
  async ({ mailboxId, name, text }) => {
    await client.createSavedReply(mailboxId, { name, text });
    return jsonResponse({ success: true, message: 'Saved reply created' });
  }
);

server.tool(
  'update_saved_reply',
  'Update an existing saved reply',
  {
    mailboxId: z.coerce.number().describe('Mailbox ID'),
    savedReplyId: z.coerce.number().describe('Saved Reply ID'),
    name: z.string().optional().describe('New name for the saved reply'),
    text: z.string().optional().describe('New HTML text content'),
  },
  async ({ mailboxId, savedReplyId, name, text }) => {
    if (!name && !text) {
      return jsonResponse({ error: 'At least one of name or text is required' });
    }
    const data: { name?: string; text?: string } = {};
    if (name) data.name = name;
    if (text) data.text = text;
    await client.updateSavedReply(mailboxId, savedReplyId, data);
    return jsonResponse({ success: true, message: 'Saved reply updated' });
  }
);

server.tool(
  'delete_saved_reply',
  'Delete a saved reply',
  {
    mailboxId: z.coerce.number().describe('Mailbox ID'),
    savedReplyId: z.coerce.number().describe('Saved Reply ID'),
  },
  async ({ mailboxId, savedReplyId }) => {
    await client.deleteSavedReply(mailboxId, savedReplyId);
    return jsonResponse({ success: true, message: 'Saved reply deleted' });
  }
);

rememberTool('create_note', 'Add a private note to a conversation');
server.registerTool(
  'create_note',
  {
    title: 'Create Note',
    description: 'Add a private note to a conversation',
    inputSchema: {
      conversationId: conversationRefSchema,
      text: z.string().describe('Note text content'),
      status: z
        .string()
        .optional()
        .describe(
          'Optionally set the conversation status after adding the note (active, open, pending, closed, spam)'
        ),
    },
    outputSchema: noteOutputSchema,
    annotations: MUTATING_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId: conversationRef, text, status }) => {
    const conversationId = await client.resolveConversationId(conversationRef);
    const normalizedStatus = status ? normalizeConversationStatus(status) : undefined;
    await client.createNote(conversationId, { text, status: normalizedStatus });
    return structuredJsonResult({
      success: true,
      conversationId,
      ...(normalizedStatus && { status: normalizedStatus }),
    });
  }
);

server.tool(
  'create_reply',
  'Send a reply to a conversation (visible to customer)',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    text: z.string().describe('Reply text content'),
    user: z.coerce.number().optional().describe('User ID sending the reply'),
    draft: z.boolean().optional().describe('Save as draft instead of sending'),
    status: z.enum(['active', 'closed', 'pending']).optional().describe('Set conversation status after reply'),
  },
  async ({ conversationId, text, user, draft, status }) => {
    // Fetch conversation to get primary customer ID (required by Help Scout API)
    const conversation = await client.getConversation(conversationId);
    const customerId = conversation.primaryCustomer?.id;
    if (!customerId) {
      throw new Error('Could not determine customer ID from conversation');
    }
    await client.createReply(conversationId, { text, customer: customerId, user, draft, status });
    return jsonResponse({ success: true });
  }
);

rememberTool('create_draft_reply', 'Create a draft reply on an existing conversation (saves without sending). Use this when responding to an existing ticket — the draft is reviewed and sent from the Help Scout UI. For starting a brand-new outbound conversation, use create_draft_conversation instead.');
server.registerTool(
  'create_draft_reply',
  {
    title: 'Create Draft Reply',
    description:
      'Create a draft reply on an existing conversation (saves without sending). Use this when responding to an existing ticket — the draft is reviewed and sent from the Help Scout UI. For starting a brand-new outbound conversation, use create_draft_conversation instead.',
    inputSchema: {
      conversationId: conversationRefSchema,
      text: z.string().describe('Draft reply text content (HTML or plain text)'),
    },
    outputSchema: conversationActionOutputSchema,
    annotations: MUTATING_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId: conversationRef, text }) => {
    const conversationId = await client.resolveConversationId(conversationRef);
    await client.createDraftReply(conversationId, { text });
    return structuredJsonResult({ success: true, conversationId });
  }
);

rememberTool(
  'create_draft_conversation',
  'Create a brand-new outbound draft conversation for proactive customer outreach (saves without sending). Use this when starting a new ticket from scratch — the draft is reviewed and sent from the Help Scout UI. For replying to an existing conversation, use create_draft_reply instead.'
);
server.registerTool(
  'create_draft_conversation',
  {
    title: 'Create Draft Conversation',
    description:
      'Create a brand-new outbound draft conversation for proactive customer outreach (saves without sending). Use this when starting a new ticket from scratch — the draft is reviewed and sent from the Help Scout UI. For replying to an existing conversation, use create_draft_reply instead.',
    inputSchema: {
      mailboxId: z.number().describe('Mailbox ID to create the conversation in'),
      customerEmail: z.string().email().describe('Recipient customer email address'),
      subject: z.string().describe('Conversation subject line'),
      text: z.string().describe('Draft message body (HTML or plain text)'),
      type: z
        .enum(['email', 'chat', 'phone'])
        .optional()
        .describe('Conversation medium (default "email")'),
      status: z
        .enum(['active', 'pending', 'closed'])
        .optional()
        .describe('Conversation status (default "active")'),
      tags: z.array(z.string()).optional().describe('Tags to apply to the conversation'),
    },
    outputSchema: draftConversationOutputSchema,
    annotations: MUTATING_REMOTE_ANNOTATIONS,
  },
  async ({ mailboxId, customerEmail, subject, text, type, status, tags }) => {
    const result = await client.createDraftConversation({
      mailboxId,
      customerEmail,
      subject,
      text,
      type,
      status,
      tags,
    });
    return structuredJsonResult({ success: true, conversationId: result.id });
  }
);

rememberTool(
  'update_conversation_status',
  'Change the status of an existing conversation. Accepts active, open, pending, closed, or spam; open is normalized to active.'
);
server.registerTool(
  'update_conversation_status',
  {
    title: 'Update Conversation Status',
    description:
      'Change the status of an existing conversation. Accepts active, open, pending, closed, or spam; open is normalized to active.',
    inputSchema: {
      conversationId: conversationRefSchema,
      status: z
        .enum(['active', 'open', 'pending', 'closed', 'spam'])
        .describe('New conversation status. "open" is treated as "active".'),
    },
    outputSchema: conversationStatusOutputSchema,
    annotations: MUTATING_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId: conversationRef, status }) => {
    const conversationId = await client.resolveConversationId(conversationRef);
    const normalizedStatus = normalizeConversationStatus(status);
    await client.updateConversationStatus(conversationId, normalizedStatus);
    return structuredJsonResult({ success: true, conversationId, status: normalizedStatus });
  }
);

rememberTool('add_tag', 'Add a tag to a conversation');
server.registerTool(
  'add_tag',
  {
    title: 'Add Tag',
    description: 'Add a tag to a conversation',
    inputSchema: {
      conversationId: conversationRefSchema,
      tag: z.string().describe('Tag name to add'),
    },
    outputSchema: taggedConversationOutputSchema,
    annotations: MUTATING_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId: conversationRef, tag }) => {
    const conversationId = await client.resolveConversationId(conversationRef);
    await client.addConversationTag(conversationId, tag);
    return structuredJsonResult({ success: true, conversationId, tag });
  }
);

server.tool(
  'remove_tag',
  'Remove a tag from a conversation',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    tag: z.string().describe('Tag name to remove'),
  },
  async ({ conversationId, tag }) => {
    await client.removeConversationTag(conversationId, tag);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'snooze_conversation',
  'Snooze a conversation until a specified date',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    snoozedUntil: z.string().describe('Snooze until date (ISO 8601, e.g., 2026-02-10T09:00:00Z)'),
    unsnoozeOnCustomerReply: z.boolean().optional().describe('Automatically unsnooze when customer replies'),
  },
  async ({ conversationId, snoozedUntil, unsnoozeOnCustomerReply }) => {
    await client.snoozeConversation(conversationId, snoozedUntil, unsnoozeOnCustomerReply);
    return jsonResponse({ success: true, snoozedUntil });
  }
);

server.tool(
  'unsnooze_conversation',
  'Immediately unsnooze a conversation',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
  },
  async ({ conversationId }) => {
    await client.unsnoozeConversation(conversationId);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'update_thread',
  'Update a thread (change text or hide/unhide)',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    threadId: z.coerce.number().describe('Thread ID'),
    text: z.string().optional().describe('New thread text'),
    hidden: z.boolean().optional().describe('Hide (true) or unhide (false) the thread'),
  },
  async ({ conversationId, threadId, text, hidden }) => {
    if (text === undefined && hidden === undefined) {
      return jsonResponse({ error: 'At least one of text or hidden is required' });
    }

    if (text !== undefined) {
      await client.updateThread(conversationId, threadId, {
        op: 'replace',
        path: '/text',
        value: text,
      });
    }
    if (hidden !== undefined) {
      await client.updateThread(conversationId, threadId, {
        op: 'replace',
        path: '/hidden',
        value: hidden,
      });
    }

    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_conversation',
  'Delete a conversation',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
  },
  async ({ conversationId }) => {
    await client.deleteConversation(conversationId);
    return jsonResponse({ success: true, message: 'Conversation deleted' });
  }
);

server.tool(
  'update_conversation',
  'Update conversation properties without adding a thread',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    status: z
      .enum(['active', 'closed', 'pending', 'spam'])
      .optional()
      .describe('Change conversation status'),
    assignee: z
      .union([z.coerce.number(), z.literal('none')])
      .optional()
      .describe('User ID to assign to, or "none" to unassign'),
    customer: z.coerce.number().optional().describe('Change primary customer ID'),
    subject: z.string().optional().describe('Update subject line'),
    mailbox: z.coerce.number().optional().describe('Move to different mailbox'),
  },
  async ({ conversationId, status, assignee, customer, subject, mailbox }) => {
    const operations: Array<{ op: string; path: string; value?: unknown }> = [];

    if (status) {
      operations.push({ op: 'replace', path: '/status', value: status });
    }
    if (assignee === 'none') {
      operations.push({ op: 'remove', path: '/assignTo' });
    } else if (assignee) {
      operations.push({ op: 'replace', path: '/assignTo', value: assignee });
    }
    if (customer) {
      operations.push({ op: 'replace', path: '/primaryCustomer.id', value: customer });
    }
    if (subject) {
      operations.push({ op: 'replace', path: '/subject', value: subject });
    }
    if (mailbox) {
      operations.push({ op: 'replace', path: '/mailbox', value: mailbox });
    }

    if (operations.length === 0) {
      return jsonResponse({ error: 'At least one update option is required' });
    }

    await client.updateConversation(conversationId, operations);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'get_conversation_fields',
  'Get custom field values for a conversation',
  { conversationId: z.coerce.number().describe('Conversation ID') },
  async ({ conversationId }) => jsonResponse(await client.getConversationFields(conversationId))
);

server.tool(
  'update_conversation_fields',
  'Update custom field values on a conversation',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    fields: z
      .array(
        z.object({
          id: z.coerce.number().describe('Field ID'),
          value: z.string().describe('Field value'),
        })
      )
      .describe('Array of field updates'),
  },
  async ({ conversationId, fields }) => {
    await client.updateConversationFields(conversationId, fields);
    return jsonResponse({ success: true });
  }
);

server.tool('get_current_user', 'Get the currently authenticated user', {}, async () =>
  jsonResponse(await client.getCurrentUser())
);

server.tool(
  'list_teams',
  'List all teams',
  { page: z.coerce.number().optional().describe('Page number') },
  async ({ page }) => jsonResponse(await client.listTeams(page))
);

server.tool(
  'get_team',
  'Get team details',
  { teamId: z.coerce.number().describe('Team ID') },
  async ({ teamId }) => jsonResponse(await client.getTeam(teamId))
);

server.tool(
  'list_team_members',
  'List members of a team',
  {
    teamId: z.coerce.number().describe('Team ID'),
    page: z.coerce.number().optional().describe('Page number'),
  },
  async ({ teamId, page }) => jsonResponse(await client.listTeamMembers(teamId, page))
);

// Attachments
server.tool(
  'list_conversation_attachments',
  'List all attachments in a conversation (across all threads)',
  { conversationId: z.coerce.number().describe('Conversation ID') },
  async ({ conversationId }) => jsonResponse(await client.listConversationAttachments(conversationId))
);

server.tool(
  'get_attachment_data',
  'Get attachment content as base64-encoded data',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    attachmentId: z.coerce.number().describe('Attachment ID'),
  },
  async ({ conversationId, attachmentId }) =>
    jsonResponse(await client.getAttachmentData(conversationId, attachmentId))
);

server.tool(
  'create_attachment',
  'Upload an attachment to a thread',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    threadId: z.coerce.number().describe('Thread ID'),
    fileName: z.string().describe('Name of the attachment file'),
    mimeType: z.string().describe('MIME type of the attachment (e.g., "image/png", "application/pdf")'),
    data: z.string().describe('Base64-encoded file content'),
  },
  async ({ conversationId, threadId, fileName, mimeType, data }) => {
    await client.createAttachment(conversationId, threadId, { fileName, mimeType, data });
    return jsonResponse({ success: true });
  }
);

server.tool(
  'delete_attachment',
  'Delete an attachment (only works on draft conversations)',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    attachmentId: z.coerce.number().describe('Attachment ID'),
  },
  async ({ conversationId, attachmentId }) => {
    await client.deleteAttachment(conversationId, attachmentId);
    return jsonResponse({ success: true });
  }
);

// Reports (Plus/Pro plans only)
const reportDateSchema = {
  start: z.string().describe('Start date (ISO 8601, e.g., 2024-01-01T00:00:00Z)'),
  end: z.string().describe('End date (ISO 8601)'),
  previousStart: z.string().optional().describe('Previous period start for comparison'),
  previousEnd: z.string().optional().describe('Previous period end'),
  mailboxes: z.string().optional().describe('Filter by mailbox IDs (comma-separated)'),
  tags: z.string().optional().describe('Filter by tag IDs (comma-separated)'),
  types: z.string().optional().describe('Filter by types: email, chat, phone'),
  folders: z.string().optional().describe('Filter by folder IDs (comma-separated)'),
};

server.tool(
  'get_company_report',
  'Get company-wide performance metrics including customers helped, replies, and user stats (Plus/Pro plans)',
  reportDateSchema,
  async (params) => jsonResponse(await client.getCompanyReport(params))
);

server.tool(
  'get_conversations_report',
  'Get conversation volume, busiest times, tag usage, and activity metrics',
  reportDateSchema,
  async (params) => jsonResponse(await client.getConversationsReport(params))
);

server.tool(
  'get_productivity_report',
  'Get response time, resolution time, and first response metrics',
  {
    ...reportDateSchema,
    officeHours: z.boolean().optional().describe('Calculate within office hours only'),
  },
  async (params) => jsonResponse(await client.getProductivityReport(params))
);

server.tool(
  'get_happiness_report',
  'Get customer satisfaction scores (great/okay/not good percentages)',
  reportDateSchema,
  async (params) => jsonResponse(await client.getHappinessReport(params))
);

server.tool(
  'get_first_response_time',
  'Get first response time as time series data for charting',
  {
    ...reportDateSchema,
    officeHours: z.boolean().optional().describe('Calculate within office hours only'),
    viewBy: z.enum(['day', 'week', 'month']).optional().describe('Data granularity'),
  },
  async (params) => jsonResponse(await client.getFirstResponseTimeReport(params))
);

server.tool(
  'get_happiness_ratings',
  'List individual customer satisfaction ratings with comments',
  {
    ...reportDateSchema,
    page: z.coerce.number().optional().describe('Page number'),
    sortField: z.enum(['number', 'modifiedAt', 'rating']).optional().describe('Sort field'),
    sortOrder: z.enum(['ASC', 'DESC']).optional().describe('Sort order'),
    rating: z.enum(['great', 'ok', 'not-good', 'all']).optional().describe('Filter by rating'),
  },
  async (params) => jsonResponse(await client.getHappinessRatings(params))
);

rememberTool('search_by_customer', "Find conversations involving a customer by email. Searches primary email and domain (for CC'd/teammate tickets). Results deduplicated and capped by maxResults (default 25). Use date filters to narrow large result sets.");
server.registerTool(
  'search_by_customer',
  {
    title: 'Search By Customer',
    description:
      "Find conversations involving a customer by email. Searches primary email and domain (for CC'd/teammate tickets). Results deduplicated and capped by maxResults (default 25). Use date filters to narrow large result sets.",
    inputSchema: {
      email: z.string().email().describe('Customer email address'),
      status: z
        .enum(['active', 'pending', 'closed', 'spam', 'all'])
        .optional()
        .describe('Status filter (defaults to "all")'),
      maxResults: z
        .number()
        .optional()
        .default(DEFAULT_MAX_RESULTS)
        .describe('Maximum conversations to return (default 25)'),
      ...dateFilterSchema,
    },
    outputSchema: searchByCustomerOutputSchema,
    annotations: READ_ONLY_REMOTE_ANNOTATIONS,
  },
  async ({
    email,
    status = 'all',
    maxResults,
    createdSince,
    createdBefore,
    modifiedSince,
    modifiedBefore,
  }) => {
    const domain = email.split('@')[1];
    const dateFilters = { createdSince, createdBefore, modifiedSince, modifiedBefore };

    const emailQuery = buildDateQuery(dateFilters, `email:${email}`);
    const emailSearch = client.listAllConversations({ query: emailQuery, status }, maxResults);

    const isGenericDomain = GENERIC_EMAIL_DOMAINS.has(domain);
    const domainSearch = isGenericDomain
      ? Promise.resolve([] as Conversation[])
      : client.listAllConversations(
          {
            query: buildDateQuery(dateFilters, `@${domain}`),
            status,
          },
          maxResults
        );

    const [emailResults, domainResults] = await Promise.all([emailSearch, domainSearch]);

    const seen = new Set<number>();
    const all: Conversation[] = [];

    for (const conv of emailResults) {
      seen.add(conv.id);
      all.push(conv);
    }

    for (const conv of domainResults) {
      if (!seen.has(conv.id)) {
        seen.add(conv.id);
        all.push(conv);
      }
    }

    return structuredJsonResult({
      ...withOmissionMeta(all, maxResults),
      meta: {
        email,
        domain,
        domainSearchSkipped: isGenericDomain,
        emailResults: emailResults.length,
        domainResults: domainResults.length,
        totalAfterDedup: all.length,
      },
    });
  }
);

rememberTool('check_auth', 'Check if Help Scout authentication is configured');
server.registerTool(
  'check_auth',
  {
    title: 'Check Authentication',
    description: 'Check if Help Scout authentication is configured',
    outputSchema: authStatusOutputSchema,
    annotations: READ_ONLY_LOCAL_ANNOTATIONS,
  },
  async () => structuredJsonResult({ authenticated: await auth.isAuthenticated() })
);

rememberTool(
  'search_tools',
  'Search for available tools by name or description using regex. Returns matching tool names.'
);
server.registerTool(
  'search_tools',
  {
    title: 'Search Tools',
    description:
      'Search for available tools by name or description using regex. Returns matching tool names.',
    inputSchema: {
      query: z
        .string()
        .describe('Regex pattern to match against tool names and descriptions (case-insensitive)'),
    },
    annotations: READ_ONLY_LOCAL_ANNOTATIONS,
  },
  async ({ query }) => {
    try {
      const pattern = new RegExp(query, 'i');
      const matches = toolRegistry.filter(
        (tool) => pattern.test(tool.name) || pattern.test(tool.description)
      );
      return textJsonResult({ tools: matches });
    } catch {
      return textJsonResult({ error: 'Invalid regex pattern' }, true);
    }
  }
);

export async function runMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
