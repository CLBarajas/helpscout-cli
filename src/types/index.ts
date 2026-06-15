export interface OutputOptions {
  compact?: boolean;
  slim?: boolean;
  plain?: boolean;
  fields?: string;
}

export interface CommandOptions {
  compact?: boolean;
}

export interface HelpScoutError {
  name: string;
  detail: string;
  statusCode?: number;
}

export interface PageInfo {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export type ConversationStatus = 'active' | 'pending' | 'closed' | 'spam';
export type DraftConversationStatus = Exclude<ConversationStatus, 'spam'>;

export interface Conversation {
  id: number;
  number: number;
  threads: number;
  type: string;
  folderId: number;
  status: ConversationStatus;
  state: string;
  subject: string;
  preview: string;
  mailboxId: number;
  assignee?: {
    id: number;
    // v3 (GET /v3/conversations/{id}) returns the real actor type, including
    // "system_user" for AI agents; v2 normalizes it to "user".
    type?: string;
    first: string;
    last: string;
    email: string;
  };
  createdBy?: {
    id: number;
    type: string;
    email?: string;
  };
  createdAt: string;
  closedAt?: string;
  closedBy?: number;
  // v3 only: closing actor with real type (incl. "system_user").
  closedByUser?: {
    id: number;
    type: string;
    email?: string;
  };
  modifiedAt?: string;
  customerWaitingSince?: {
    time: string;
    friendly: string;
  };
  source?: {
    type: string;
    via: string;
  };
  tags?: Tag[];
  cc?: string[];
  bcc?: string[];
  primaryCustomer?: {
    id: number;
    first?: string;
    last?: string;
    email?: string;
  };
  customFields?: CustomField[];
  _embedded?: {
    threads?: Thread[];
  };
}

export interface Thread {
  id: number;
  type: string;
  status?: string;
  state?: string;
  action?: {
    type: string;
    text?: string;
  };
  body?: string;
  source?: {
    type: string;
    via: string;
  };
  customer?: {
    id: number;
    first?: string;
    last?: string;
    email?: string;
  };
  createdBy?: {
    id: number;
    type: string;
    first?: string;
    last?: string;
    email?: string;
  };
  assignedTo?: {
    id: number;
    // v3 (GET /v3/conversations/{id}/threads) returns the real actor type,
    // including "system_user" for AI agents; v2 normalizes it to "user".
    type?: string;
    first: string;
    last: string;
    email: string;
  };
  savedReplyId?: number;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  createdAt: string;
  openedAt?: string;
  _embedded?: {
    attachments?: Attachment[];
  };
}

export interface Attachment {
  id: number;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
  state?: 'valid' | 'virus';
  _links?: {
    self?: { href: string };
    data?: { href: string };
    web?: { href: string };
  };
}

export interface AttachmentData {
  data: string; // Base64-encoded file content
}

export interface Customer {
  id: number;
  firstName?: string;
  lastName?: string;
  gender?: string;
  jobTitle?: string;
  location?: string;
  organization?: string;
  photoType?: string;
  photoUrl?: string;
  background?: string;
  age?: string;
  // Total conversations associated with this customer. Returned by the v2
  // Get/List Customers endpoints since 2025-11-26.
  conversationCount?: number;
  createdAt: string;
  updatedAt?: string;
  emails?: CustomerEmail[];
  phones?: CustomerPhone[];
  chats?: CustomerChat[];
  socialProfiles?: CustomerSocialProfile[];
  websites?: CustomerWebsite[];
  addresses?: CustomerAddress[];
}

export interface CustomerEmail {
  id: number;
  value: string;
  type: string;
}

export interface CustomerPhone {
  id: number;
  value: string;
  type: string;
}

export interface CustomerChat {
  id: number;
  value: string;
  type: string;
}

export interface CustomerSocialProfile {
  id: number;
  value: string;
  type: string;
}

export interface CustomerWebsite {
  id: number;
  value: string;
}

export interface CustomerAddress {
  id: number;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  lines?: string[];
}

export interface CustomerAddressInput {
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  lines?: string[];
}

export type WebhookPayloadVersion = 'V2' | 'V3';
export type WebhookState = 'enabled' | 'disabled';

export interface Webhook {
  id: number;
  url: string;
  state: WebhookState;
  events: string[];
  notification: boolean;
  payloadVersion: WebhookPayloadVersion;
  label?: string;
  mailboxIds: number[];
}

export interface WebhookInput {
  url: string;
  events: string[];
  // Help Scout never returns the secret on GET, and update is a full PUT replace,
  // so the secret must be supplied on every create AND update.
  secret: string;
  notification?: boolean;
  label?: string;
  payloadVersion?: WebhookPayloadVersion;
  mailboxIds?: number[];
}

export interface MailboxFolder {
  id: number;
  type: string;
  name: string;
  totalCount: number;
  activeCount: number;
  userId?: number;
  updatedAt: string;
}

export type RoutingState = 'enabled' | 'disabled';
export type RoutingAssignmentMethod = 'round_robin' | 'balanced';

export interface RoutingConfigRotationEntry {
  userId: number;
  conversationsCount: number;
  eligible: boolean;
  reason?: string;
}

export interface RoutingConfig {
  state: RoutingState;
  assignmentLimit: number;
  assignmentMethod: RoutingAssignmentMethod;
  userIds: number[];
  rotation?: RoutingConfigRotationEntry[];
}

// PUT body — the four writable fields (rotation is read-only/computed).
export interface RoutingConfigInput {
  state: RoutingState;
  assignmentLimit: number;
  assignmentMethod: RoutingAssignmentMethod;
  userIds: number[];
}

// System Users are the v3 actor type for AI agents (type === 'system_user').
export interface SystemUser {
  id: number;
  type: 'system_user';
  firstName?: string;
  lastName?: string;
  initials?: string;
  email?: string;
  mention?: string;
  timezone?: string;
  role?: string;
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerPropertyDefinition {
  type: 'number' | 'text' | 'url' | 'date' | 'dropdown';
  slug: string;
  name: string;
  options?: Array<{ id: string; label: string }>; // dropdown only; id is a UUID
}

export type CustomerPropertyOperation =
  | { op: 'replace'; path: string; value: string | number }
  | { op: 'remove'; path: string };

// Full field set for Overwrite Customer (full-replace PUT; omitted fields are cleared).
export interface CustomerOverwriteInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  photoUrl?: string;
  jobTitle?: string;
  photoType?: string;
  background?: string;
  location?: string;
  organization?: string;
  organizationId?: number;
  gender?: string;
  age?: string;
}

// Inline attachment for thread creation (customer/chat/phone threads).
export interface ThreadAttachmentInput {
  fileName: string;
  mimeType: string;
  data: string; // Base64-encoded
}

// Response of GET .../original-source with Accept: application/json
export interface ThreadOriginalSource {
  original: string;
}

// Input for PUT .../schedule (Send Later)
export interface ThreadScheduleInput {
  scheduledFor: string; // ISO 8601, future, <= year 2100
  unscheduleOnCustomerReply: boolean;
  sendAsCreator?: boolean;
}

export interface User {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  timezone?: string;
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  type?: string;
  mention?: string;
  initials?: string;
  jobTitle?: string;
  phone?: string;
  alternateEmails?: string[];
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
  ticketCount?: number;
}

export interface Workflow {
  id: number;
  mailboxId: number;
  type: string;
  status: string;
  order: number;
  name: string;
  createdAt: string;
  modifiedAt: string;
}

export interface CustomField {
  id: number;
  name: string;
  value: string;
  type: string;
}

export interface Mailbox {
  id: number;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

// Reports API Types

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
