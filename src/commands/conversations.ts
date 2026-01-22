import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { lookup } from 'mime-types';
import { client } from '../lib/api-client.js';
import { outputJson, htmlToPlainText, buildName } from '../lib/output.js';
import { withErrorHandling, requireConfirmation, parseIdArg } from '../lib/command-utils.js';
import { buildDateQuery } from '../lib/dates.js';
import type { Conversation, Thread } from '../types/index.js';

interface ParticipantInfo {
  name?: string;
  email?: string;
  messageCount: number;
  firstMessage?: string;
}

interface ConversationSummary {
  total: number;
  byStatus: Record<string, number>;
  byTag: Record<string, number>;
  conversations: Array<{
    id: number;
    subject: string;
    status: string;
    tags: string[];
    customer: ParticipantInfo;
    user: ParticipantInfo;
  }>;
}

const MAX_MESSAGE_LENGTH = 300;

function truncate(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  return text.slice(0, MAX_MESSAGE_LENGTH).trim() + '...';
}

function buildPersonName(info: { first?: string; last?: string } | undefined): string | undefined {
  if (!info) return undefined;
  return buildName(info.first, info.last);
}

function extractThreadInfo(threads: Thread[] | undefined): {
  customer: ParticipantInfo;
  user: ParticipantInfo;
} {
  if (!threads?.length) {
    return {
      customer: { messageCount: 0 },
      user: { messageCount: 0 },
    };
  }

  const sortedThreads = [...threads].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const customerThreads = sortedThreads.filter((t) => t.type === 'customer');
  const userThreads = sortedThreads.filter((t) => t.type === 'message');

  const firstCustomerWithBody = customerThreads.find((t) => t.body);
  const firstUserWithBody = userThreads.find((t) => t.body);
  const mostRecentUserThread = userThreads[userThreads.length - 1];

  const customerSource = firstCustomerWithBody?.customer || firstCustomerWithBody?.createdBy;
  const userSource = mostRecentUserThread?.createdBy;

  return {
    customer: {
      name: buildPersonName(customerSource),
      email: customerSource?.email,
      messageCount: customerThreads.length,
      firstMessage: firstCustomerWithBody?.body
        ? truncate(htmlToPlainText(firstCustomerWithBody.body))
        : undefined,
    },
    user: {
      name: buildPersonName(userSource),
      email: userSource?.email,
      messageCount: userThreads.length,
      firstMessage: firstUserWithBody?.body
        ? truncate(htmlToPlainText(firstUserWithBody.body))
        : undefined,
    },
  };
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

  return {
    total: conversations.length,
    byStatus,
    byTag,
    conversations: conversations.map((c) => {
      const threadInfo = extractThreadInfo(c._embedded?.threads);
      return {
        id: c.id,
        subject: c.subject,
        status: c.status,
        tags: (c.tags || []).map((t) => t.name),
        ...threadInfo,
      };
    }),
  };
}

export function createConversationsCommand(): Command {
  const cmd = new Command('conversations').description('Conversation operations');

  cmd
    .command('list')
    .description('List conversations')
    .option('-m, --mailbox <id>', 'Filter by mailbox ID')
    .option('-s, --status <status>', 'Filter by status (active, all, closed, open, pending, spam)')
    .option('-t, --tag <tags>', 'Filter by tag(s), comma-separated')
    .option('--assigned-to <id>', 'Filter by assignee user ID')
    .option('--created-since <date>', 'Show conversations created after this date')
    .option('--created-before <date>', 'Show conversations created before this date')
    .option('--modified-since <date>', 'Show conversations modified after this date')
    .option('--modified-before <date>', 'Show conversations modified before this date')
    .option(
      '--sort-field <field>',
      'Sort by field (createdAt, modifiedAt, number, status, subject)'
    )
    .option('--sort-order <order>', 'Sort order (asc, desc)')
    .option('--page <number>', 'Page number')
    .option('--embed <resources>', 'Embed resources (threads)')
    .option(
      '-q, --query <query>',
      'Advanced search query (see https://docs.helpscout.com/article/47-search-filters-with-operators)'
    )
    .option('--summary', 'Output aggregated summary instead of full conversation list')
    .action(
      withErrorHandling(
        async (options: {
          mailbox?: string;
          status?: string;
          tag?: string;
          assignedTo?: string;
          createdSince?: string;
          createdBefore?: string;
          modifiedSince?: string;
          modifiedBefore?: string;
          sortField?: string;
          sortOrder?: string;
          page?: string;
          embed?: string;
          query?: string;
          summary?: boolean;
        }) => {
          const query = buildDateQuery(
            {
              createdSince: options.createdSince,
              createdBefore: options.createdBefore,
              modifiedSince: options.modifiedSince,
              modifiedBefore: options.modifiedBefore,
            },
            options.query
          );

          if (options.summary) {
            const allConversations = await client.listAllConversations({
              mailbox: options.mailbox,
              status: options.status,
              tag: options.tag,
              assignedTo: options.assignedTo,
              query,
              embed: 'threads',
            });
            const summary = summarizeConversations(allConversations);
            outputJson(summary);
            return;
          }

          const result = await client.listConversations({
            mailbox: options.mailbox,
            status: options.status,
            tag: options.tag,
            assignedTo: options.assignedTo,
            sortField: options.sortField,
            sortOrder: options.sortOrder,
            page: options.page ? parseInt(options.page, 10) : undefined,
            embed: options.embed,
            query,
          });
          outputJson(result);
        }
      )
    );

  cmd
    .command('view')
    .description('View a conversation')
    .argument('<id>', 'Conversation ID')
    .action(
      withErrorHandling(async (id: string) => {
        const conversation = await client.getConversation(parseIdArg(id, 'conversation'), 'threads');
        const threadInfo = extractThreadInfo(conversation._embedded?.threads);
        const result = {
          ...conversation,
          customer: threadInfo.customer,
          user: threadInfo.user,
        };
        outputJson(result, { plain: true });
      })
    );

  cmd
    .command('threads')
    .description('List threads for a conversation (defaults to email communications only)')
    .argument('<id>', 'Conversation ID')
    .option('--include-notes', 'Include internal notes')
    .option('--all', 'Show all thread types including lineitems, workflows, etc.')
    .option(
      '-t, --type <types>',
      'Filter by specific thread type(s), comma-separated (customer, message, note, lineitem, chat, phone, forwardchild, forwardparent, beaconchat)'
    )
    .option('--html', 'Output thread bodies as HTML (default is plain text)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: { includeNotes?: boolean; all?: boolean; type?: string; html?: boolean }
        ) => {
          let threads = await client.getConversationThreads(parseIdArg(id, 'conversation'));

          if (options.type) {
            const types = options.type.split(',').map((t) => t.trim().toLowerCase());
            threads = threads.filter((t) => types.includes(t.type));
          } else if (!options.all) {
            const allowedTypes = options.includeNotes
              ? ['customer', 'message', 'note', 'chat', 'phone']
              : ['customer', 'message', 'chat', 'phone'];
            threads = threads.filter((t) => allowedTypes.includes(t.type));
          }

          outputJson(threads, { plain: !options.html });
        }
      )
    );

  cmd
    .command('delete')
    .description('Delete a conversation')
    .argument('<id>', 'Conversation ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        requireConfirmation('conversation', options.yes);
        await client.deleteConversation(parseIdArg(id, 'conversation'));
        outputJson({ message: 'Conversation deleted' });
      })
    );

  cmd
    .command('add-tag')
    .description('Add a tag to a conversation')
    .argument('<id>', 'Conversation ID')
    .argument('<tag>', 'Tag name')
    .action(
      withErrorHandling(async (id: string, tag: string) => {
        await client.addConversationTag(parseIdArg(id, 'conversation'), tag);
        outputJson({ message: `Tag "${tag}" added` });
      })
    );

  cmd
    .command('remove-tag')
    .description('Remove a tag from a conversation')
    .argument('<id>', 'Conversation ID')
    .argument('<tag>', 'Tag name')
    .action(
      withErrorHandling(async (id: string, tag: string) => {
        await client.removeConversationTag(parseIdArg(id, 'conversation'), tag);
        outputJson({ message: `Tag "${tag}" removed` });
      })
    );

  cmd
    .command('reply')
    .description('Reply to a conversation')
    .argument('<id>', 'Conversation ID')
    .requiredOption('--text <text>', 'Reply text')
    .option('--user <id>', 'User ID sending the reply')
    .option('--draft', 'Save as draft')
    .option('--status <status>', 'Set conversation status after reply (active, closed, pending)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            text: string;
            user?: string;
            draft?: boolean;
            status?: string;
          }
        ) => {
          const conversationId = parseIdArg(id, 'conversation');
          // Fetch conversation to get primary customer ID (required by Help Scout API)
          const conversation = await client.getConversation(conversationId);
          const customerId = conversation.primaryCustomer?.id;
          if (!customerId) {
            throw new Error('Could not determine customer ID from conversation');
          }
          await client.createReply(conversationId, {
            text: options.text,
            customer: customerId,
            user: options.user ? parseIdArg(options.user, 'user') : undefined,
            draft: options.draft,
            status: options.status,
          });
          outputJson({ message: 'Reply sent' });
        }
      )
    );

  cmd
    .command('note')
    .description('Add a note to a conversation')
    .argument('<id>', 'Conversation ID')
    .requiredOption('--text <text>', 'Note text')
    .option('--user <id>', 'User ID adding the note')
    .option('--status <status>', 'Set conversation status after note (active, closed, pending)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            text: string;
            user?: string;
            status?: string;
          }
        ) => {
          await client.createNote(parseIdArg(id, 'conversation'), {
            text: options.text,
            user: options.user ? parseIdArg(options.user, 'user') : undefined,
            status: options.status,
          });
          outputJson({ message: 'Note added' });
        }
      )
    );

  cmd
    .command('update')
    .description('Update conversation properties without adding a thread')
    .argument('<id>', 'Conversation ID')
    .option('--status <status>', 'Change status (active, closed, pending, spam)')
    .option('--assignee <userId>', 'Assign to user ID (or "none" to unassign)')
    .option('--customer <customerId>', 'Change primary customer')
    .option('--subject <text>', 'Update subject line')
    .option('--mailbox <mailboxId>', 'Move to different mailbox')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            status?: string;
            assignee?: string;
            customer?: string;
            subject?: string;
            mailbox?: string;
          }
        ) => {
          const operations: Array<{ op: string; path: string; value?: unknown }> = [];

          if (options.status) {
            operations.push({ op: 'replace', path: '/status', value: options.status });
          }
          if (options.assignee === 'none') {
            operations.push({ op: 'remove', path: '/assignTo' });
          } else if (options.assignee) {
            operations.push({
              op: 'replace',
              path: '/assignTo',
              value: parseInt(options.assignee, 10),
            });
          }
          if (options.customer) {
            operations.push({
              op: 'replace',
              path: '/primaryCustomer.id',
              value: parseInt(options.customer, 10),
            });
          }
          if (options.subject) {
            operations.push({ op: 'replace', path: '/subject', value: options.subject });
          }
          if (options.mailbox) {
            operations.push({
              op: 'replace',
              path: '/mailbox',
              value: parseInt(options.mailbox, 10),
            });
          }

          if (operations.length === 0) {
            throw new Error('At least one update option is required');
          }

          await client.updateConversation(parseIdArg(id, 'conversation'), operations);
          outputJson({ message: 'Conversation updated' });
        }
      )
    );

  cmd
    .command('fields')
    .description('Get custom fields for a conversation')
    .argument('<id>', 'Conversation ID')
    .action(
      withErrorHandling(async (id: string) => {
        const fields = await client.getConversationFields(parseIdArg(id, 'conversation'));
        outputJson(fields);
      })
    );

  cmd
    .command('set-field')
    .description('Set a custom field value on a conversation')
    .argument('<id>', 'Conversation ID')
    .requiredOption('--field-id <fieldId>', 'Custom field ID')
    .requiredOption('--value <value>', 'Field value')
    .action(
      withErrorHandling(async (id: string, options: { fieldId: string; value: string }) => {
        await client.updateConversationFields(parseIdArg(id, 'conversation'), [
          { id: parseInt(options.fieldId, 10), value: options.value },
        ]);
        outputJson({ message: 'Field updated' });
      })
    );

  // Attachment commands
  cmd
    .command('attachments')
    .description('List all attachments in a conversation (across all threads)')
    .argument('<id>', 'Conversation ID')
    .action(
      withErrorHandling(async (id: string) => {
        const result = await client.listConversationAttachments(parseIdArg(id, 'conversation'));
        outputJson(result);
      })
    );

  cmd
    .command('attachment-download')
    .description('Download an attachment')
    .argument('<conversationId>', 'Conversation ID')
    .argument('<attachmentId>', 'Attachment ID')
    .option('-o, --output <path>', 'Output file path (defaults to attachment filename)')
    .action(
      withErrorHandling(
        async (conversationId: string, attachmentId: string, options: { output?: string }) => {
          const convId = parseIdArg(conversationId, 'conversation');
          const attId = parseIdArg(attachmentId, 'attachment');

          // First, get attachment metadata to know the filename
          const { attachments } = await client.listConversationAttachments(convId);
          const attachment = attachments.find((a) => a.id === attId);

          // Get the attachment data
          const data = await client.getAttachmentData(convId, attId);

          // Decode base64 and write to file
          const buffer = Buffer.from(data.data, 'base64');
          const outputPath = options.output || attachment?.filename || `attachment-${attId}`;
          const resolvedPath = resolve(outputPath);
          writeFileSync(resolvedPath, buffer);

          outputJson({
            message: 'Attachment downloaded',
            path: resolvedPath,
            size: buffer.length,
            filename: attachment?.filename,
          });
        }
      )
    );

  cmd
    .command('attachment-upload')
    .description('Upload an attachment to a thread')
    .argument('<conversationId>', 'Conversation ID')
    .argument('<threadId>', 'Thread ID')
    .requiredOption('-f, --file <path>', 'Path to file to upload')
    .option('--filename <name>', 'Override filename (defaults to original filename)')
    .option('--mime-type <type>', 'Override MIME type (auto-detected from extension)')
    .action(
      withErrorHandling(
        async (
          conversationId: string,
          threadId: string,
          options: { file: string; filename?: string; mimeType?: string }
        ) => {
          const convId = parseIdArg(conversationId, 'conversation');
          const thrId = parseIdArg(threadId, 'thread');

          // Read file and encode as base64
          const filePath = resolve(options.file);
          const fileBuffer = readFileSync(filePath);
          const base64Data = fileBuffer.toString('base64');

          // Determine filename and MIME type
          const fileName = options.filename || basename(filePath);
          const mimeType = options.mimeType || lookup(filePath) || 'application/octet-stream';

          await client.createAttachment(convId, thrId, {
            fileName,
            mimeType,
            data: base64Data,
          });

          outputJson({
            message: 'Attachment uploaded',
            filename: fileName,
            mimeType,
            size: fileBuffer.length,
          });
        }
      )
    );

  cmd
    .command('attachment-delete')
    .description('Delete an attachment (only works on draft conversations)')
    .argument('<conversationId>', 'Conversation ID')
    .argument('<attachmentId>', 'Attachment ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(
        async (conversationId: string, attachmentId: string, options: { yes?: boolean }) => {
          requireConfirmation('attachment', options.yes);
          await client.deleteAttachment(
            parseIdArg(conversationId, 'conversation'),
            parseIdArg(attachmentId, 'attachment')
          );
          outputJson({ message: 'Attachment deleted' });
        }
      )
    );

  return cmd;
}
