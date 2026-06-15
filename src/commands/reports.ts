import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/command-utils.js';

interface ReportOptions {
  start: string;
  end: string;
  previousStart?: string;
  previousEnd?: string;
  mailboxes?: string;
  tags?: string;
  types?: string;
  folders?: string;
  officeHours?: boolean;
  viewBy?: string;
  page?: string;
  sortField?: string;
  sortOrder?: string;
  rating?: string;
  rows?: string;
  field?: string;
  fieldid?: string;
  range?: string;
  rangeId?: string;
  user?: string;
  status?: string;
  sites?: string;
}

function addCommonReportOptions(cmd: Command): Command {
  return cmd
    .requiredOption('--start <date>', 'Start date (ISO 8601, e.g., 2024-01-01T00:00:00Z)')
    .requiredOption('--end <date>', 'End date (ISO 8601)')
    .option('--previous-start <date>', 'Previous period start (for comparison)')
    .option('--previous-end <date>', 'Previous period end')
    .option('--mailboxes <ids>', 'Filter by mailbox IDs (comma-separated)')
    .option('--tags <ids>', 'Filter by tag IDs (comma-separated)')
    .option('--types <types>', 'Filter by types: email, chat, phone (comma-separated)')
    .option('--folders <ids>', 'Filter by folder IDs (comma-separated)');
}

function buildReportParams(options: ReportOptions) {
  return {
    start: options.start,
    end: options.end,
    previousStart: options.previousStart,
    previousEnd: options.previousEnd,
    mailboxes: options.mailboxes,
    tags: options.tags,
    types: options.types,
    folders: options.folders,
  };
}

function addUserOption(cmd: Command): Command {
  return cmd.requiredOption('--user <id>', 'User ID (or Team ID for a team-level summary)');
}

const viewByOption = (cmd: Command): Command =>
  cmd.option('--view-by <period>', 'Data granularity: day, week, month');
const officeHoursOption = (cmd: Command): Command =>
  cmd.option('--office-hours', 'Calculate within office hours only');
const drilldownOptions = (cmd: Command): Command =>
  cmd
    .option('--page <number>', 'Page number')
    .option('--rows <number>', 'Results per page (default 25, max 50)');

const viewBy = (o: ReportOptions) => o.viewBy as 'day' | 'week' | 'month' | undefined;
const intOpt = (v?: string) => (v ? parseInt(v, 10) : undefined);

export function createReportsCommand(): Command {
  const cmd = new Command('reports').description(
    'Analytics and reporting (Plus/Pro plans only)'
  );

  // Company Overall Report
  addCommonReportOptions(
    cmd
      .command('company')
      .description('Get company-wide performance metrics')
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      const report = await client.getCompanyReport(buildReportParams(options));
      outputJson(report);
    })
  );

  // Conversations Overall Report
  addCommonReportOptions(
    cmd
      .command('conversations')
      .description('Get conversation volume and activity metrics')
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      const report = await client.getConversationsReport(buildReportParams(options));
      outputJson(report);
    })
  );

  // Productivity Overall Report
  addCommonReportOptions(
    cmd
      .command('productivity')
      .description('Get response and resolution time metrics')
  )
    .option('--office-hours', 'Calculate times within office hours only')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        const report = await client.getProductivityReport({
          ...buildReportParams(options),
          officeHours: options.officeHours,
        });
        outputJson(report);
      })
    );

  // First Response Time (Time Series)
  addCommonReportOptions(
    cmd
      .command('first-response-time')
      .description('Get first response time as time series data')
  )
    .option('--office-hours', 'Calculate within office hours only')
    .option('--view-by <period>', 'Data granularity: day, week, month (default: day)')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        const report = await client.getFirstResponseTimeReport({
          ...buildReportParams(options),
          officeHours: options.officeHours,
          viewBy: options.viewBy as 'day' | 'week' | 'month' | undefined,
        });
        outputJson(report);
      })
    );

  // Happiness Overall Report
  addCommonReportOptions(
    cmd
      .command('happiness')
      .description('Get customer satisfaction scores')
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      const report = await client.getHappinessReport(buildReportParams(options));
      outputJson(report);
    })
  );

  // Happiness Ratings (Individual Records)
  addCommonReportOptions(
    cmd
      .command('ratings')
      .description('List individual customer satisfaction ratings')
  )
    .option('--page <number>', 'Page number')
    .option('--sort-field <field>', 'Sort by: number, modifiedAt, rating')
    .option('--sort-order <order>', 'Sort order: ASC, DESC')
    .option('--rating <type>', 'Filter by rating: great, ok, not-good, all')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        const report = await client.getHappinessRatings({
          ...buildReportParams(options),
          page: options.page ? parseInt(options.page, 10) : undefined,
          sortField: options.sortField as 'number' | 'modifiedAt' | 'rating' | undefined,
          sortOrder: options.sortOrder as 'ASC' | 'DESC' | undefined,
          rating: options.rating as 'great' | 'ok' | 'not-good' | 'all' | undefined,
        });
        outputJson(report);
      })
    );

  // ===== Company family =====
  viewByOption(
    addCommonReportOptions(
      cmd.command('company-customers-helped').description('Company customers-helped over time')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getCompanyCustomersHelpedReport({
          ...buildReportParams(options),
          viewBy: viewBy(options),
        })
      );
    })
  );

  drilldownOptions(
    addCommonReportOptions(
      cmd.command('company-drilldown').description('Drill down into the company report')
    )
  )
    .option(
      '--range <type>',
      'replies, firstReplyResolved, resolved, responseTime, firstResponseTime, handleTime'
    )
    .option('--range-id <id>', 'Qualifier for --range')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        outputJson(
          await client.getCompanyDrilldownReport({
            ...buildReportParams(options),
            page: intOpt(options.page),
            rows: intOpt(options.rows),
            range: options.range as never,
            rangeId: intOpt(options.rangeId),
          })
        );
      })
    );

  // ===== Conversations family =====
  viewByOption(
    addCommonReportOptions(
      cmd.command('volumes-by-channel').description('Conversation volume by channel')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getVolumesByChannelReport({
          ...buildReportParams(options),
          viewBy: viewBy(options),
        })
      );
    })
  );

  addCommonReportOptions(
    cmd.command('busiest').description('Busiest time-of-day (day-of-week x hour)')
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(await client.getBusyTimesReport(buildReportParams(options)));
    })
  );

  drilldownOptions(
    addCommonReportOptions(
      cmd.command('conversations-drilldown').description('Drill down into the conversations report')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getConversationsDrilldownReport({
          ...buildReportParams(options),
          page: intOpt(options.page),
          rows: intOpt(options.rows),
        })
      );
    })
  );

  drilldownOptions(
    addCommonReportOptions(
      cmd
        .command('conversations-field-drilldown')
        .description('Drill down by tag, reply, workflow, or customer')
    )
  )
    .requiredOption('--field <field>', 'tagid, replyid, workflowid, or customerid')
    .requiredOption('--fieldid <id>', 'ID of the tag/reply/workflow/customer')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        outputJson(
          await client.getConversationsFieldDrilldownReport({
            ...buildReportParams(options),
            field: options.field as 'tagid' | 'replyid' | 'workflowid' | 'customerid',
            fieldid: parseInt(options.fieldid as string, 10),
            page: intOpt(options.page),
            rows: intOpt(options.rows),
          })
        );
      })
    );

  viewByOption(
    addCommonReportOptions(
      cmd.command('new-conversations').description('New conversation volume over time')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getNewConversationsReport({
          ...buildReportParams(options),
          viewBy: viewBy(options),
        })
      );
    })
  );

  drilldownOptions(
    addCommonReportOptions(
      cmd
        .command('new-conversations-drilldown')
        .description('Drill down into the new-conversations report')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getNewConversationsDrilldownReport({
          ...buildReportParams(options),
          page: intOpt(options.page),
          rows: intOpt(options.rows),
        })
      );
    })
  );

  viewByOption(
    addCommonReportOptions(
      cmd.command('received-messages').description('Received customer-message volume over time')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getReceivedMessagesReport({
          ...buildReportParams(options),
          viewBy: viewBy(options),
        })
      );
    })
  );

  // ===== Productivity family =====
  officeHoursOption(
    viewByOption(
      addCommonReportOptions(cmd.command('replies-sent').description('Replies sent over time'))
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getRepliesSentReport({
          ...buildReportParams(options),
          officeHours: options.officeHours,
          viewBy: viewBy(options),
        })
      );
    })
  );

  officeHoursOption(
    viewByOption(
      addCommonReportOptions(cmd.command('resolution-time').description('Resolution time over time'))
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getResolutionTimeReport({
          ...buildReportParams(options),
          officeHours: options.officeHours,
          viewBy: viewBy(options),
        })
      );
    })
  );

  officeHoursOption(
    viewByOption(
      addCommonReportOptions(cmd.command('resolved').description('Resolved counts over time'))
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getResolvedReport({
          ...buildReportParams(options),
          officeHours: options.officeHours,
          viewBy: viewBy(options),
        })
      );
    })
  );

  officeHoursOption(
    viewByOption(
      addCommonReportOptions(cmd.command('response-time').description('Response time over time'))
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getResponseTimeReport({
          ...buildReportParams(options),
          officeHours: options.officeHours,
          viewBy: viewBy(options),
        })
      );
    })
  );

  // ===== Docs (aggregate; only --sites beyond the date range) =====
  cmd
    .command('docs')
    .description('Get Docs usage metrics (searches, top articles, etc.)')
    .requiredOption('--start <date>', 'Start date (ISO 8601)')
    .requiredOption('--end <date>', 'End date (ISO 8601)')
    .option('--previous-start <date>', 'Previous period start')
    .option('--previous-end <date>', 'Previous period end')
    .option('--sites <ids>', 'Filter by Docs site IDs (comma-separated)')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        outputJson(
          await client.getDocsReport({
            start: options.start,
            end: options.end,
            previousStart: options.previousStart,
            previousEnd: options.previousEnd,
            sites: options.sites,
          })
        );
      })
    );

  // ===== User/Team family (require --user) =====
  officeHoursOption(
    addUserOption(
      addCommonReportOptions(cmd.command('user-overall').description('User/Team activity snapshot'))
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserOverallReport({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
          officeHours: options.officeHours,
        })
      );
    })
  );

  addUserOption(
    addCommonReportOptions(
      cmd.command('user-conversation-history').description("List a user's conversation history")
    )
  )
    .option('--office-hours', 'Calculate within office hours only')
    .option('--status <status>', 'Filter by status: active, pending, closed')
    .option('--page <number>', 'Page number')
    .option('--sort-field <field>', 'Sort: number, repliesSent, responseTime, resolveTime')
    .option('--sort-order <order>', 'Sort order: ASC, DESC')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        outputJson(
          await client.getUserConversationHistory({
            ...buildReportParams(options),
            user: parseInt(options.user as string, 10),
            officeHours: options.officeHours,
            status: options.status as 'active' | 'pending' | 'closed' | undefined,
            page: intOpt(options.page),
            sortField: options.sortField as
              | 'number'
              | 'repliesSent'
              | 'responseTime'
              | 'resolveTime'
              | undefined,
            sortOrder: options.sortOrder as 'ASC' | 'DESC' | undefined,
          })
        );
      })
    );

  viewByOption(
    addUserOption(
      addCommonReportOptions(
        cmd.command('user-customers-helped').description('Customers helped by a user over time')
      )
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserCustomersHelped({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
          viewBy: viewBy(options),
        })
      );
    })
  );

  drilldownOptions(
    addUserOption(
      addCommonReportOptions(
        cmd.command('user-drilldown').description("Drill down into a user's conversations")
      )
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserDrilldown({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
          page: intOpt(options.page),
          rows: intOpt(options.rows),
        })
      );
    })
  );

  addUserOption(
    addCommonReportOptions(
      cmd.command('user-happiness').description('Customer satisfaction scores for a user')
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserHappinessReport({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
        })
      );
    })
  );

  addUserOption(
    addCommonReportOptions(
      cmd.command('user-happiness-ratings').description("List a user's individual happiness ratings")
    )
  )
    .option('--page <number>', 'Page number')
    .option('--sort-field <field>', 'Sort: number, modifiedAt, rating')
    .option('--sort-order <order>', 'Sort order: ASC, DESC')
    .option('--rating <type>', 'Filter by rating: great, ok, not-good, all')
    .action(
      withErrorHandling(async (options: ReportOptions) => {
        outputJson(
          await client.getUserHappinessRatings({
            ...buildReportParams(options),
            user: parseInt(options.user as string, 10),
            page: intOpt(options.page),
            sortField: options.sortField as 'number' | 'modifiedAt' | 'rating' | undefined,
            sortOrder: options.sortOrder as 'ASC' | 'DESC' | undefined,
            rating: options.rating as 'great' | 'ok' | 'not-good' | 'all' | undefined,
          })
        );
      })
    );

  viewByOption(
    addUserOption(
      addCommonReportOptions(cmd.command('user-replies').description('Replies sent by a user over time'))
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserReplies({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
          viewBy: viewBy(options),
        })
      );
    })
  );

  viewByOption(
    addUserOption(
      addCommonReportOptions(
        cmd.command('user-resolutions').description('Conversations resolved by a user over time')
      )
    )
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserResolutions({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
          viewBy: viewBy(options),
        })
      );
    })
  );

  officeHoursOption(
    addUserOption(addCommonReportOptions(cmd.command('user-chat').description('User/Team chat metrics')))
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getUserChatReport({
          ...buildReportParams(options),
          user: parseInt(options.user as string, 10),
          officeHours: options.officeHours,
        })
      );
    })
  );

  // ===== Channel reports (no --user) =====
  officeHoursOption(
    addCommonReportOptions(cmd.command('chat').description('Chat channel report'))
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getChatReport({ ...buildReportParams(options), officeHours: options.officeHours })
      );
    })
  );

  officeHoursOption(
    addCommonReportOptions(cmd.command('email').description('Email channel report'))
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getEmailReport({ ...buildReportParams(options), officeHours: options.officeHours })
      );
    })
  );

  officeHoursOption(
    addCommonReportOptions(cmd.command('phone').description('Phone channel report'))
  ).action(
    withErrorHandling(async (options: ReportOptions) => {
      outputJson(
        await client.getPhoneReport({ ...buildReportParams(options), officeHours: options.officeHours })
      );
    })
  );

  return cmd;
}
