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

  return cmd;
}
