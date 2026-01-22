import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { client } from '../lib/api-client.js';
import { auth } from '../lib/auth.js';
import { buildDateQuery } from '../lib/dates.js';
import type { Conversation } from '../types/index.js';

const toolRegistry = [
  { name: 'list_conversations', description: 'List conversations with optional filtering by status, mailbox, tag, assignee, or date range' },
  { name: 'get_conversation', description: 'Get detailed information about a specific conversation including threads' },
  { name: 'search_conversations', description: 'Search all conversations matching a query (fetches all pages)' },
  { name: 'get_conversations_summary', description: 'Get aggregated summary of conversations by status and tag (for weekly briefings)' },
  { name: 'update_conversation', description: 'Update conversation properties without adding a thread' },
  { name: 'list_mailboxes', description: 'List all mailboxes in the Help Scout account' },
  { name: 'get_mailbox', description: 'Get detailed information about a specific mailbox' },
  { name: 'list_mailbox_fields', description: 'List custom fields for a mailbox' },
  { name: 'list_customers', description: 'List customers with optional filtering' },
  { name: 'get_customer', description: 'Get detailed information about a specific customer' },
  { name: 'list_customer_emails', description: 'List emails for a customer' },
  { name: 'create_customer_email', description: 'Add an email to a customer' },
  { name: 'update_customer_email', description: 'Update a customer email' },
  { name: 'delete_customer_email', description: 'Delete a customer email' },
  { name: 'list_customer_phones', description: 'List phones for a customer' },
  { name: 'create_customer_phone', description: 'Add a phone to a customer' },
  { name: 'update_customer_phone', description: 'Update a customer phone' },
  { name: 'delete_customer_phone', description: 'Delete a customer phone' },
  { name: 'list_tags', description: 'List all tags in the Help Scout account' },
  { name: 'list_workflows', description: 'List workflows with optional filtering' },
  { name: 'list_saved_replies', description: 'List saved replies for a mailbox' },
  { name: 'get_saved_reply', description: 'Get a saved reply with full text' },
  { name: 'create_note', description: 'Add a private note to a conversation' },
  { name: 'create_reply', description: 'Send a reply to a conversation (visible to customer)' },
  { name: 'add_tag', description: 'Add a tag to a conversation' },
  { name: 'get_conversation_fields', description: 'Get custom field values for a conversation' },
  { name: 'update_conversation_fields', description: 'Update custom field values on a conversation' },
  { name: 'check_auth', description: 'Check if Help Scout authentication is configured' },
{ name: 'list_users', description: 'List users with optional mailbox filter' },
  { name: 'get_user', description: 'Get detailed information about a specific user' },
  { name: 'get_current_user', description: 'Get the currently authenticated user' },
  { name: 'list_teams', description: 'List all teams' },
  { name: 'get_team', description: 'Get team details' },
  { name: 'list_team_members', description: 'List members of a team' },
  { name: 'list_conversation_attachments', description: 'List all attachments in a conversation (across all threads)' },
  { name: 'get_attachment_data', description: 'Get attachment content as base64-encoded data' },
  { name: 'create_attachment', description: 'Upload an attachment to a thread' },
  { name: 'delete_attachment', description: 'Delete an attachment (only works on draft conversations)' },
  { name: 'search_tools', description: 'Search for available tools by regex' },
];

interface ConversationSummary {
  total: number;
  byStatus: Record<string, number>;
  byTag: Record<string, number>;
}

function summarizeConversations(conversations: Conversation[]): ConversationSummary {
  const byStatus: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const conv of conversations) {
    byStatus[conv.status] = (byStatus[conv.status] || 0) + 1;
    for (const tag of conv.tags || []) {
      byTag[tag.name] = (byTag[tag.name] || 0) + 1;
    }
  }

  return { total: conversations.length, byStatus, byTag };
}

const server = new McpServer({
  name: 'helpscout',
  version: '1.0.0',
});

function jsonResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

server.tool(
  'list_conversations',
  'List conversations with optional filtering by status, mailbox, tag, assignee, or date range',
  {
    status: z
      .enum(['active', 'pending', 'closed', 'spam', 'all'])
      .optional()
      .describe('Conversation status filter'),
    mailbox: z.string().optional().describe('Mailbox ID to filter by'),
    tag: z.string().optional().describe('Tag to filter by'),
    assignedTo: z.string().optional().describe('User ID assigned to'),
    query: z.string().optional().describe('Search query'),
    page: z.number().optional().describe('Page number'),
    createdSince: z.string().optional().describe('Show conversations created after this date (ISO 8601 or natural language like "2026-01-05")'),
    createdBefore: z.string().optional().describe('Show conversations created before this date'),
    modifiedSince: z.string().optional().describe('Show conversations modified after this date'),
    modifiedBefore: z.string().optional().describe('Show conversations modified before this date'),
  },
  async ({ status, mailbox, tag, assignedTo, query, page, createdSince, createdBefore, modifiedSince, modifiedBefore }) => {
    const dateQuery = buildDateQuery({ createdSince, createdBefore, modifiedSince, modifiedBefore }, query);
    return jsonResponse(await client.listConversations({ status, mailbox, tag, assignedTo, query: dateQuery, page }));
  }
);

server.tool(
  'get_conversation',
  'Get detailed information about a specific conversation including threads',
  {
    conversationId: z.number().describe('Conversation ID'),
    includeThreads: z.boolean().optional().describe('Include conversation threads'),
  },
  async ({ conversationId, includeThreads }) => {
    const conversation = await client.getConversation(conversationId);
    if (includeThreads) {
      const threads = await client.getConversationThreads(conversationId);
      return jsonResponse({ ...conversation, threads });
    }
    return jsonResponse(conversation);
  }
);

server.tool(
  'search_conversations',
  'Search all conversations matching a query (fetches all pages)',
  {
    query: z.string().optional().describe('Search query (e.g., "email:domain.com", "subject:billing")'),
    status: z.enum(['active', 'pending', 'closed', 'spam', 'all']).optional().describe('Status filter'),
    createdSince: z.string().optional().describe('Show conversations created after this date (ISO 8601)'),
    createdBefore: z.string().optional().describe('Show conversations created before this date'),
    modifiedSince: z.string().optional().describe('Show conversations modified after this date'),
    modifiedBefore: z.string().optional().describe('Show conversations modified before this date'),
  },
  async ({ query, status, createdSince, createdBefore, modifiedSince, modifiedBefore }) => {
    const dateQuery = buildDateQuery({ createdSince, createdBefore, modifiedSince, modifiedBefore }, query);
    return jsonResponse(await client.listAllConversations({ query: dateQuery, status }));
  }
);

server.tool(
  'get_conversations_summary',
  'Get aggregated summary of conversations by status and tag (for weekly briefings)',
  {
    status: z.enum(['active', 'pending', 'closed', 'spam', 'all']).optional().describe('Status filter'),
    mailbox: z.string().optional().describe('Mailbox ID to filter by'),
    tag: z.string().optional().describe('Tag to filter by'),
    createdSince: z.string().optional().describe('Show conversations created after this date (ISO 8601)'),
    createdBefore: z.string().optional().describe('Show conversations created before this date'),
    modifiedSince: z.string().optional().describe('Show conversations modified after this date'),
    modifiedBefore: z.string().optional().describe('Show conversations modified before this date'),
  },
  async ({ status, mailbox, tag, createdSince, createdBefore, modifiedSince, modifiedBefore }) => {
    const dateQuery = buildDateQuery({ createdSince, createdBefore, modifiedSince, modifiedBefore });
    const conversations = await client.listAllConversations({ status, mailbox, tag, query: dateQuery });
    return jsonResponse(summarizeConversations(conversations));
  }
);

server.tool('list_mailboxes', 'List all mailboxes in the Help Scout account', {}, async () =>
  jsonResponse(await client.listMailboxes())
);

server.tool(
  'get_mailbox',
  'Get detailed information about a specific mailbox',
  { mailboxId: z.number().describe('Mailbox ID') },
  async ({ mailboxId }) => jsonResponse(await client.getMailbox(mailboxId))
);

server.tool(
  'list_mailbox_fields',
  'List custom fields for a mailbox',
  { mailboxId: z.number().describe('Mailbox ID') },
  async ({ mailboxId }) => jsonResponse(await client.listMailboxFields(mailboxId))
);

server.tool(
  'list_customers',
  'List customers with optional filtering',
  {
    query: z.string().optional().describe('Search query'),
    firstName: z.string().optional().describe('Filter by first name'),
    lastName: z.string().optional().describe('Filter by last name'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ query, firstName, lastName, page }) =>
    jsonResponse(await client.listCustomers({ query, firstName, lastName, page }))
);

server.tool(
  'get_customer',
  'Get detailed information about a specific customer',
  { customerId: z.number().describe('Customer ID') },
  async ({ customerId }) => jsonResponse(await client.getCustomer(customerId))
);

// Customer Emails
server.tool(
  'list_customer_emails',
  'List emails for a customer',
  { customerId: z.number().describe('Customer ID') },
  async ({ customerId }) => jsonResponse(await client.listCustomerEmails(customerId))
);

server.tool(
  'create_customer_email',
  'Add an email to a customer',
  {
    customerId: z.number().describe('Customer ID'),
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
    customerId: z.number().describe('Customer ID'),
    emailId: z.number().describe('Email ID'),
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
    customerId: z.number().describe('Customer ID'),
    emailId: z.number().describe('Email ID'),
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
  { customerId: z.number().describe('Customer ID') },
  async ({ customerId }) => jsonResponse(await client.listCustomerPhones(customerId))
);

server.tool(
  'create_customer_phone',
  'Add a phone to a customer',
  {
    customerId: z.number().describe('Customer ID'),
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
    customerId: z.number().describe('Customer ID'),
    phoneId: z.number().describe('Phone ID'),
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
    customerId: z.number().describe('Customer ID'),
    phoneId: z.number().describe('Phone ID'),
  },
  async ({ customerId, phoneId }) => {
    await client.deleteCustomerPhone(customerId, phoneId);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'list_tags',
  'List all tags in the Help Scout account',
  { page: z.number().optional().describe('Page number') },
  async ({ page }) => jsonResponse(await client.listTags(page))
);

server.tool(
  'list_workflows',
  'List workflows with optional filtering',
  {
    mailbox: z.number().optional().describe('Mailbox ID to filter by'),
    type: z.enum(['automatic', 'manual']).optional().describe('Workflow type'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ mailbox, type, page }) => jsonResponse(await client.listWorkflows({ mailbox, type, page }))
);

server.tool(
  'list_saved_replies',
  'List saved replies for a mailbox',
  {
    mailboxId: z.number().describe('Mailbox ID'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ mailboxId, page }) => jsonResponse(await client.listSavedReplies(mailboxId, page))
);

server.tool(
  'get_saved_reply',
  'Get a saved reply with full text',
  {
    mailboxId: z.number().describe('Mailbox ID'),
    savedReplyId: z.number().describe('Saved Reply ID'),
  },
  async ({ mailboxId, savedReplyId }) =>
    jsonResponse(await client.getSavedReply(mailboxId, savedReplyId))
);

server.tool(
  'create_note',
  'Add a private note to a conversation',
  {
    conversationId: z.number().describe('Conversation ID'),
    text: z.string().describe('Note text content'),
    status: z
      .enum(['active', 'closed', 'pending'])
      .optional()
      .describe('Set conversation status after note'),
  },
  async ({ conversationId, text, status }) => {
    await client.createNote(conversationId, { text, status });
    return jsonResponse({ success: true });
  }
);

server.tool(
  'create_reply',
  'Send a reply to a conversation (visible to customer)',
  {
    conversationId: z.number().describe('Conversation ID'),
    text: z.string().describe('Reply text content'),
    user: z.number().optional().describe('User ID sending the reply'),
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

server.tool(
  'add_tag',
  'Add a tag to a conversation',
  {
    conversationId: z.number().describe('Conversation ID'),
    tag: z.string().describe('Tag name to add'),
  },
  async ({ conversationId, tag }) => {
    await client.addConversationTag(conversationId, tag);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'update_conversation',
  'Update conversation properties without adding a thread',
  {
    conversationId: z.number().describe('Conversation ID'),
    status: z
      .enum(['active', 'closed', 'pending', 'spam'])
      .optional()
      .describe('Change conversation status'),
    assignee: z
      .union([z.number(), z.literal('none')])
      .optional()
      .describe('User ID to assign to, or "none" to unassign'),
    customer: z.number().optional().describe('Change primary customer ID'),
    subject: z.string().optional().describe('Update subject line'),
    mailbox: z.number().optional().describe('Move to different mailbox'),
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
  { conversationId: z.number().describe('Conversation ID') },
  async ({ conversationId }) => jsonResponse(await client.getConversationFields(conversationId))
);

server.tool(
  'update_conversation_fields',
  'Update custom field values on a conversation',
  {
    conversationId: z.number().describe('Conversation ID'),
    fields: z
      .array(
        z.object({
          id: z.number().describe('Field ID'),
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

server.tool('check_auth', 'Check if Help Scout authentication is configured', {}, async () =>
  jsonResponse({ authenticated: await auth.isAuthenticated() })
);

server.tool(
  'list_users',
  'List users with optional mailbox filter',
  {
    mailbox: z.number().optional().describe('Mailbox ID to filter by'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ mailbox, page }) => jsonResponse(await client.listUsers({ mailbox, page }))
);

server.tool(
  'get_user',
  'Get detailed information about a specific user',
  { userId: z.number().describe('User ID') },
  async ({ userId }) => jsonResponse(await client.getUser(userId))
);

server.tool('get_current_user', 'Get the currently authenticated user', {}, async () =>
  jsonResponse(await client.getCurrentUser())
);

server.tool(
  'list_teams',
  'List all teams',
  { page: z.number().optional().describe('Page number') },
  async ({ page }) => jsonResponse(await client.listTeams(page))
);

server.tool(
  'get_team',
  'Get team details',
  { teamId: z.number().describe('Team ID') },
  async ({ teamId }) => jsonResponse(await client.getTeam(teamId))
);

server.tool(
  'list_team_members',
  'List members of a team',
  {
    teamId: z.number().describe('Team ID'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ teamId, page }) => jsonResponse(await client.listTeamMembers(teamId, page))
);

// Attachments
server.tool(
  'list_conversation_attachments',
  'List all attachments in a conversation (across all threads)',
  { conversationId: z.number().describe('Conversation ID') },
  async ({ conversationId }) => jsonResponse(await client.listConversationAttachments(conversationId))
);

server.tool(
  'get_attachment_data',
  'Get attachment content as base64-encoded data',
  {
    conversationId: z.number().describe('Conversation ID'),
    attachmentId: z.number().describe('Attachment ID'),
  },
  async ({ conversationId, attachmentId }) =>
    jsonResponse(await client.getAttachmentData(conversationId, attachmentId))
);

server.tool(
  'create_attachment',
  'Upload an attachment to a thread',
  {
    conversationId: z.number().describe('Conversation ID'),
    threadId: z.number().describe('Thread ID'),
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
    conversationId: z.number().describe('Conversation ID'),
    attachmentId: z.number().describe('Attachment ID'),
  },
  async ({ conversationId, attachmentId }) => {
    await client.deleteAttachment(conversationId, attachmentId);
    return jsonResponse({ success: true });
  }
);

server.tool(
  'search_tools',
  'Search for available tools by name or description using regex. Returns matching tool names.',
  {
    query: z.string().describe('Regex pattern to match against tool names and descriptions (case-insensitive)'),
  },
  async ({ query }) => {
    try {
      const pattern = new RegExp(query, 'i');
      const matches = toolRegistry.filter((t) => pattern.test(t.name) || pattern.test(t.description));
      return jsonResponse({ tools: matches });
    } catch {
      return jsonResponse({ error: 'Invalid regex pattern' });
    }
  }
);

export async function runMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
