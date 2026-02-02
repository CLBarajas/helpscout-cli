# Help Scout CLI Reports Implementation Plan

This document outlines the implementation plan for adding Help Scout Reports API support to the CLI.

## Overview

The Help Scout Reports API provides analytics and metrics for support team performance. Reports are available on Plus and Pro plans only.

**API Base:** `https://api.helpscout.net/v2/reports/`

## Reports to Implement

### Priority 1: Core Reports (Most Useful)

| Report | Endpoint | Description |
|--------|----------|-------------|
| Company Overall | `GET /v2/reports/company` | Team-wide performance metrics |
| Conversations Overall | `GET /v2/reports/conversations` | Volume, tags, busiest times |
| Productivity Overall | `GET /v2/reports/productivity` | Response/resolution times |
| Happiness Overall | `GET /v2/reports/happiness` | Customer satisfaction scores |

### Priority 2: Detailed Reports

| Report | Endpoint | Description |
|--------|----------|-------------|
| First Response Time | `GET /v2/reports/productivity/first-response-time` | Time series data |
| Happiness Ratings | `GET /v2/reports/happiness/ratings` | Individual rating records |

---

## 1. Type Definitions

**File:** `src/types/index.ts`

Add the following interfaces:

```typescript
// Report common types
export interface ReportTimeRange {
  startDate: string;
  endDate: string;
}

export interface ReportDelta {
  customersHelped?: number;
  totalReplies?: number;
  closed?: number;
  totalUsers?: number;
  repliesPerDayPerUser?: number;
}

// Company Report
export interface CompanyReportUser {
  user: string;
  name: string;
  customersHelped: number;
  replies: number;
  handleTime: number;
  happinessScore: number;
  previousCustomersHelped?: number;
  previousReplies?: number;
  previousHandleTime?: number;
  previousHappinessScore?: number;
}

export interface CompanyReportStats extends ReportTimeRange {
  customersHelped: number;
  closed: number;
  totalReplies: number;
  totalUsers: number;
  totalDays: number;
  repliesPerDayPerUser: number;
  repliesPerDay: number;
  resolvedPerDay: number;
}

export interface CompanyReport {
  filterTags: Array<{ id: number; name: string }>;
  current: CompanyReportStats;
  previous?: CompanyReportStats;
  deltas?: ReportDelta;
  users: CompanyReportUser[];
}

// Conversations Report
export interface ConversationsReportStats extends ReportTimeRange {
  total: number;
  activeConversations: number;
  pendingConversations: number;
  closedConversations: number;
  messagesReceived: number;
  newConversations: number;
}

export interface ConversationsReport {
  filterTags: Array<{ id: number; name: string }>;
  busiestDay: { day: number; hour: number; count: number };
  busyTimeStart: number;
  busyTimeEnd: number;
  current: ConversationsReportStats;
  previous?: ConversationsReportStats;
  deltas?: Record<string, number>;
  tags: Record<string, { count: number; previousCount?: number }>;
  customers: Record<string, { count: number; name: string }>;
  replies: Record<string, { count: number; name: string }>;
  workflows: Record<string, { count: number; name: string }>;
  customFields: Record<string, Record<string, number>>;
}

// Productivity Report
export interface ProductivityReportStats extends ReportTimeRange {
  totalConversations: number;
  resolved: number;
  closed: number;
  repliesSent: number;
  resolutionTime: number;
  responseTime: number;
  firstResponseTime: number;
  repliesToResolve: number;
  handleTime: number;
  percentResolvedOnFirstReply: number;
}

export interface ProductivityReport {
  filterTags: Array<{ id: number; name: string }>;
  current: ProductivityReportStats;
  previous?: ProductivityReportStats;
  deltas?: Record<string, number>;
  responseTime: Array<{ id: number; count: number; percent: number }>;
  firstResponseTime: Array<{ id: number; count: number; percent: number }>;
  handleTime: Array<{ id: number; count: number; percent: number }>;
  repliesToResolve: Array<{ id: number; count: number; percent: number }>;
}

// Happiness Report
export interface HappinessReportStats {
  ratingsPercent: number;
  great: number;
  okay: number;
  notGood: number;
  happinessScore: number;
  greatCount: number;
  okayCount: number;
  notGoodCount: number;
  ratingsCount: number;
  totalCustomersWithRatings: number;
  totalCustomers: number;
}

export interface HappinessReport {
  current: HappinessReportStats;
  previous?: HappinessReportStats;
  deltas?: Record<string, number>;
}

// First Response Time (Time Series)
export interface TimeSeriesDataPoint {
  date: string;
  time: number;
}

export interface FirstResponseTimeReport {
  current: TimeSeriesDataPoint[];
  previous?: TimeSeriesDataPoint[];
}

// Happiness Ratings (Individual Records)
export interface HappinessRating {
  number: number;
  id: number;
  threadid: number;
  type: string;
  threadCreatedAt: string;
  ratingId: number;
  ratingComments?: string;
  ratingCreatedAt: string;
  ratingCustomerId: number;
  ratingCustomerName: string;
  ratingUserId: number;
  ratingUserName: string;
}

export interface HappinessRatingsReport {
  page: number;
  pages: number;
  count: number;
  results: HappinessRating[];
}

// Common report params
export interface ReportParams {
  start: string;
  end: string;
  previousStart?: string;
  previousEnd?: string;
  mailboxes?: string;
  tags?: string;
  types?: string;
  folders?: string;
}

export interface ProductivityReportParams extends ReportParams {
  officeHours?: boolean;
}

export interface TimeSeriesReportParams extends ProductivityReportParams {
  viewBy?: 'day' | 'week' | 'month';
}

export interface HappinessRatingsParams extends ReportParams {
  page?: number;
  sortField?: 'number' | 'modifiedAt' | 'rating';
  sortOrder?: 'ASC' | 'DESC';
  rating?: 'great' | 'ok' | 'all' | 'not-good';
}
```

---

## 2. API Client Methods

**File:** `src/lib/api-client.ts`

Add these methods to the `HelpScoutClient` class:

```typescript
// Reports - Company
async getCompanyReport(params: ReportParams): Promise<CompanyReport> {
  return this.request<CompanyReport>('GET', '/reports/company', { params });
}

// Reports - Conversations
async getConversationsReport(params: ReportParams): Promise<ConversationsReport> {
  return this.request<ConversationsReport>('GET', '/reports/conversations', { params });
}

// Reports - Productivity
async getProductivityReport(params: ProductivityReportParams): Promise<ProductivityReport> {
  return this.request<ProductivityReport>('GET', '/reports/productivity', { params });
}

async getFirstResponseTimeReport(params: TimeSeriesReportParams): Promise<FirstResponseTimeReport> {
  return this.request<FirstResponseTimeReport>('GET', '/reports/productivity/first-response-time', { params });
}

// Reports - Happiness
async getHappinessReport(params: ReportParams): Promise<HappinessReport> {
  return this.request<HappinessReport>('GET', '/reports/happiness', { params });
}

async getHappinessRatings(params: HappinessRatingsParams): Promise<HappinessRatingsReport> {
  return this.request<HappinessRatingsReport>('GET', '/reports/happiness/ratings', { params });
}
```

---

## 3. CLI Command File

**File:** `src/commands/reports.ts`

```typescript
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
```

---

## 4. CLI Registration

**File:** `src/cli.ts`

Add the import and registration:

```typescript
// Add to imports
import { createReportsCommand } from './commands/reports.js';

// Add after other addCommand calls
program.addCommand(createReportsCommand());
```

---

## 5. MCP Server Tools

**File:** `src/mcp/server.ts`

Add to the `toolRegistry` array:

```typescript
{ name: 'get_company_report', description: 'Get company-wide performance metrics (Plus/Pro plans)' },
{ name: 'get_conversations_report', description: 'Get conversation volume and activity metrics' },
{ name: 'get_productivity_report', description: 'Get response and resolution time metrics' },
{ name: 'get_happiness_report', description: 'Get customer satisfaction scores' },
{ name: 'get_first_response_time', description: 'Get first response time as time series' },
{ name: 'get_happiness_ratings', description: 'List individual customer satisfaction ratings' },
```

Add the tool implementations:

```typescript
// Common date range schema for reports
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
    page: z.number().optional().describe('Page number'),
    sortField: z.enum(['number', 'modifiedAt', 'rating']).optional().describe('Sort field'),
    sortOrder: z.enum(['ASC', 'DESC']).optional().describe('Sort order'),
    rating: z.enum(['great', 'ok', 'not-good', 'all']).optional().describe('Filter by rating'),
  },
  async (params) => jsonResponse(await client.getHappinessRatings(params))
);
```

---

## 6. README Documentation

**File:** `README.md`

Add this section after "Saved Replies":

```markdown
### Reports

Reports are available on Plus and Pro plans only.

```bash
# Company-wide performance
helpscout reports company --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z

# Compare with previous period
helpscout reports company \
  --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z \
  --previous-start 2023-12-01T00:00:00Z --previous-end 2023-12-31T23:59:59Z

# Conversation volume metrics
helpscout reports conversations --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z

# Filter by mailbox
helpscout reports conversations \
  --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z \
  --mailboxes 123,456

# Productivity metrics (response/resolution times)
helpscout reports productivity --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z
helpscout reports productivity --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z --office-hours

# First response time (time series)
helpscout reports first-response-time \
  --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z \
  --view-by week

# Customer satisfaction
helpscout reports happiness --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z

# Individual ratings with comments
helpscout reports ratings \
  --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z \
  --rating great --sort-field modifiedAt --sort-order DESC
```

**Common Options:**

| Option | Description |
|--------|-------------|
| `--start` | Start date (ISO 8601, required) |
| `--end` | End date (ISO 8601, required) |
| `--previous-start` | Previous period start for comparison |
| `--previous-end` | Previous period end |
| `--mailboxes` | Filter by mailbox IDs (comma-separated) |
| `--tags` | Filter by tag IDs (comma-separated) |
| `--types` | Filter by types: email, chat, phone |
| `--folders` | Filter by folder IDs (comma-separated) |
```

---

## 7. Implementation Checklist

### Phase 1: Core Implementation

- [x] Add type definitions to `src/types/index.ts`
- [x] Add API client methods to `src/lib/api-client.ts`
- [x] Create `src/commands/reports.ts`
- [x] Register command in `src/cli.ts`
- [x] Test CLI commands locally

### Phase 2: MCP Integration

- [x] Add tools to `toolRegistry` in `src/mcp/server.ts`
- [x] Implement MCP tool handlers
- [ ] Test MCP server with Claude (requires restart)

### Phase 3: Documentation & Polish

- [x] Update README.md with reports section
- [x] Add usage examples (in TESTING.md)
- [x] Update CLAUDE.md with reports endpoints
- [x] Test with real Help Scout account (2026-01-29)

---

## 8. Usage Examples

### Weekly Support Briefing

```bash
# Get last week's metrics
START="2024-01-08T00:00:00Z"
END="2024-01-14T23:59:59Z"
PREV_START="2024-01-01T00:00:00Z"
PREV_END="2024-01-07T23:59:59Z"

# Company overview with comparison
helpscout reports company \
  --start "$START" --end "$END" \
  --previous-start "$PREV_START" --previous-end "$PREV_END" \
  | jq '{
    current_customers: .current.customersHelped,
    previous_customers: .previous.customersHelped,
    delta: .deltas.customersHelped,
    top_performers: [.users[:3] | .[] | {name, replies, happinessScore}]
  }'
```

### Response Time Analysis

```bash
# Monthly first response time trend
helpscout reports first-response-time \
  --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z \
  --view-by day --office-hours \
  | jq '.current | map({date: .date[:10], hours: (.time / 3600000 | floor)})'
```

### Customer Satisfaction Review

```bash
# Find all negative ratings with comments
helpscout reports ratings \
  --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z \
  --rating not-good \
  | jq '.results[] | {conversation: .number, customer: .ratingCustomerName, comment: .ratingComments}'
```

---

## Notes

- All report endpoints require Plus or Pro plan
- Date parameters must be ISO 8601 format
- Time values in responses are typically in milliseconds
- The `deltas` object only appears when previous period parameters are provided
- Some response fields vary based on account configuration
