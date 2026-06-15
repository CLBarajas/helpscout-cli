import { auth } from './auth.js';
import { HelpScoutCliError, HelpScoutApiError } from './errors.js';
import type {
  Conversation,
  ConversationStatus,
  Customer,
  CustomerAddress,
  CustomerAddressInput,
  CustomerOverwriteInput,
  CustomerPropertyDefinition,
  CustomerPropertyOperation,
  DraftConversationStatus,
  Webhook,
  WebhookInput,
  MailboxFolder,
  RoutingConfig,
  RoutingConfigInput,
  SystemUser,
  ThreadAttachmentInput,
  ThreadOriginalSource,
  ThreadScheduleInput,
  CreateUserInput,
  Rating,
  Tag,
  Workflow,
  Mailbox,
  Thread,
  PageInfo,
  Attachment,
  AttachmentData,
  CompanyReport,
  ConversationsReport,
  ProductivityReport,
  HappinessReport,
  FirstResponseTimeReport,
  HappinessRatingsReport,
  ReportParams,
  ProductivityReportParams,
  TimeSeriesReportParams,
  HappinessRatingsParams,
} from '../types/index.js';

const API_ROOT = 'https://api.helpscout.net';
const API_BASE = `${API_ROOT}/v2`;
type ApiVersion = 'v2' | 'v3';

// v3 endpoints (e.g. List Customers v3) use cursor pagination: the next page's
// opaque cursor token is embedded in _links.next.href, with no page/totalPages.
interface CursorPaginatedResponse<T> {
  _embedded: T;
  _links?: {
    self?: { href: string };
    first?: { href: string };
    next?: { href: string };
  };
}
const TOKEN_URL = 'https://api.helpscout.net/v2/oauth2/token';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

interface PaginatedResponse<T> {
  _embedded: T;
  page: PageInfo;
}

interface AuthProvider {
  getAccessToken(): Promise<string | null>;
  setAccessToken(token: string): Promise<boolean>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<boolean>;
  getAppId(): Promise<string | null>;
  getAppSecret(): Promise<string | null>;
}

export class HelpScoutClient {
  private accessToken: string | null = null;

  constructor(private readonly authManager: AuthProvider = auth) {}

  clearToken(): void {
    this.accessToken = null;
  }

  async refreshAccessToken(): Promise<string> {
    const appId = await this.authManager.getAppId();
    const appSecret = await this.authManager.getAppSecret();
    const refreshToken = await this.authManager.getRefreshToken();

    if (!appId || !appSecret) {
      throw new HelpScoutCliError('Not configured. Please run: helpscout auth login', 401);
    }

    if (refreshToken) {
      try {
        const response = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: appId,
            client_secret: appSecret,
            refresh_token: refreshToken,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as TokenResponse;
          await this.authManager.setAccessToken(data.access_token);
          if (data.refresh_token) {
            await this.authManager.setRefreshToken(data.refresh_token);
          }
          this.accessToken = data.access_token;
          return data.access_token;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(
          JSON.stringify({
            warning: 'Refresh token failed, using client credentials',
            reason: message,
          })
        );
      }
    }

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: appId,
          client_secret: appSecret,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new HelpScoutCliError(`Network request failed during authentication: ${message}`, 0);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new HelpScoutApiError('OAuth token request failed', error, response.status);
    }

    const data = (await response.json()) as TokenResponse;
    await this.authManager.setAccessToken(data.access_token);
    this.accessToken = data.access_token;
    return data.access_token;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const storedToken = await this.authManager.getAccessToken();
    if (storedToken) {
      this.accessToken = storedToken;
      return storedToken;
    }

    return this.refreshAccessToken();
  }

  private async rawRequest(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      retry?: boolean;
      rateLimitRetry?: boolean;
      version?: ApiVersion;
      accept?: string;
      redirect?: 'follow' | 'error' | 'manual';
    } = {}
  ): Promise<Response> {
    const {
      params,
      body,
      retry = true,
      rateLimitRetry = true,
      version = 'v2',
      accept,
      redirect,
    } = options;

    const base = version === 'v3' ? `${API_ROOT}/v3` : API_BASE;
    const url = new URL(`${base}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (accept) {
      headers.Accept = accept;
    }
    const fetchOptions: RequestInit = { method, headers };
    if (redirect) {
      fetchOptions.redirect = redirect;
    }
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
      return this.rawRequest(method, path, { ...options, retry: false });
    }

    if (response.status === 429 && rateLimitRetry) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
      const waitSeconds = Math.min(retryAfter, 120);
      console.error(
        JSON.stringify({ warning: `Rate limited. Waiting ${waitSeconds}s before retry...` })
      );
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      return this.rawRequest(method, path, { ...options, rateLimitRetry: false });
    }

    // Under manual redirect, surface 3xx to the caller instead of treating it as
    // a non-ok error (so the caller can re-fetch the Location without auth).
    if (redirect === 'manual' && response.status >= 300 && response.status < 400) {
      return response;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new HelpScoutApiError('API request failed', error, response.status);
    }

    return response;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      retry?: boolean;
      rateLimitRetry?: boolean;
      version?: ApiVersion;
    } = {}
  ): Promise<T> {
    const response = await this.rawRequest(method, path, options);
    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  private async requestForCreation(
    path: string,
    body: unknown,
    options: { retry?: boolean; rateLimitRetry?: boolean } = {}
  ): Promise<{ id: number; url: string }> {
    const { retry = true, rateLimitRetry = true } = options;

    const url = `${API_BASE}${path}`;
    const token = await this.getAccessToken();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new HelpScoutCliError(`Network request failed: ${message}`, 0);
    }

    if (response.status === 401 && retry) {
      this.accessToken = null;
      await this.refreshAccessToken();
      return this.requestForCreation(path, body, { ...options, retry: false });
    }

    if (response.status === 429 && rateLimitRetry) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
      const waitSeconds = Math.min(retryAfter, 120);
      console.error(
        JSON.stringify({ warning: `Rate limited. Waiting ${waitSeconds}s before retry...` })
      );
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      return this.requestForCreation(path, body, { ...options, rateLimitRetry: false });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new HelpScoutApiError('API request failed', error, response.status);
    }

    const resourceId = response.headers.get('Resource-ID');
    const webLocation = response.headers.get('Location') || '';

    return {
      id: resourceId ? parseInt(resourceId, 10) : 0,
      url: webLocation,
    };
  }

  // Conversations
  async listConversations(
    params: {
      mailbox?: string;
      status?: string;
      tag?: string;
      assignedTo?: string;
      sortField?: string;
      sortOrder?: string;
      page?: number;
      embed?: string;
      query?: string;
    } = {}
  ) {
    const response = await this.request<PaginatedResponse<{ conversations: Conversation[] }>>(
      'GET',
      '/conversations',
      { params }
    );
    return {
      conversations: response._embedded?.conversations || [],
      page: response.page,
    };
  }

  async listAllConversations(
    params: {
      mailbox?: string;
      status?: string;
      tag?: string;
      assignedTo?: string;
      query?: string;
      embed?: string;
    } = {},
    maxResults?: number
  ): Promise<Conversation[]> {
    const allConversations: Conversation[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await this.listConversations({ ...params, page });
      allConversations.push(...result.conversations);
      if (maxResults && allConversations.length >= maxResults) {
        return allConversations.slice(0, maxResults);
      }
      totalPages = result.page.totalPages;
      page++;
    } while (page <= totalPages);

    return allConversations;
  }

  async getConversation(conversationId: number, embed?: string) {
    const params = embed ? { embed } : undefined;
    return this.request<Conversation>('GET', `/conversations/${conversationId}`, { params });
  }

  /**
   * Get Conversation via the v3 endpoint, which returns the real actor `type`
   * (including "system_user" for AI agents) on createdBy/assignee/closedByUser.
   * v2 normalizes system_user to user. Additive: same shape otherwise.
   */
  async getConversationV3(conversationId: number, embed?: string) {
    const params = embed ? { embed } : undefined;
    return this.request<Conversation>('GET', `/conversations/${conversationId}`, {
      params,
      version: 'v3',
    });
  }

  /**
   * Resolve a conversation reference to its internal API id.
   *
   * Help Scout exposes two identifiers: the internal `id`, which the detail
   * endpoint requires, and the visible ticket `number` (e.g. #12345) shown in
   * the UI and notifications. A "#"-prefixed value is treated as a ticket
   * number and resolved via search; anything else is parsed as an internal id
   * directly.
   */
  async resolveConversationId(ref: string | number): Promise<number> {
    const value = String(ref).trim();

    if (value.startsWith('#')) {
      const digits = value.slice(1);
      const number = /^\d+$/.test(digits) ? parseInt(digits, 10) : NaN;
      if (isNaN(number) || number <= 0) {
        throw new HelpScoutCliError(`Invalid conversation number: "${ref}"`, 400);
      }
      const { conversations } = await this.listConversations({
        query: `number:${number}`,
        status: 'all',
      });
      const match = conversations.find((c) => c.number === number);
      if (!match) {
        throw new HelpScoutCliError(`No conversation found with number #${number}`, 404);
      }
      return match.id;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new HelpScoutCliError(`Invalid conversation ID: "${ref}"`, 400);
    }
    return parsed;
  }

  async getConversationThreads(
    conversationId: number,
    maxResults?: number,
    version: ApiVersion = 'v2'
  ) {
    const threads: Thread[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.request<PaginatedResponse<{ threads: Thread[] }>>(
        'GET',
        `/conversations/${conversationId}/threads`,
        { params: { page }, version }
      );

      threads.push(...(response._embedded?.threads || []));
      if (maxResults && threads.length >= maxResults) {
        return threads.slice(0, maxResults);
      }

      totalPages = response.page.totalPages;
      page++;
    } while (page <= totalPages);

    return threads;
  }

  async updateConversation(
    conversationId: number,
    operations: Array<{ op: string; path: string; value?: unknown }>
  ) {
    // Help Scout expects one operation at a time as a single object, not an array
    // Execute each operation sequentially
    for (const operation of operations) {
      await this.request<void>('PATCH', `/conversations/${conversationId}`, { body: operation });
    }
  }

  async updateConversationStatus(conversationId: number, status: ConversationStatus) {
    await this.updateConversation(conversationId, [{ op: 'replace', path: '/status', value: status }]);
  }

  async deleteConversation(conversationId: number) {
    await this.request<void>('DELETE', `/conversations/${conversationId}`);
  }

  async createConversation(data: {
    subject: string;
    customer: { email: string } | { id: number };
    mailboxId: number;
    text: string;
    status?: string;
    draft?: boolean;
    user?: number;
    assignTo?: number;
    tags?: string[];
  }): Promise<{ id: number; url: string }> {
    const threads = [
      {
        type: 'reply' as const,
        customer: data.customer,
        text: data.text,
        ...(data.draft && { draft: true }),
      },
    ];

    const body: Record<string, unknown> = {
      type: 'email',
      subject: data.subject,
      customer: data.customer,
      mailboxId: data.mailboxId,
      status: data.status || 'active',
      threads,
    };

    if (data.user) {
      body.user = data.user;
    }
    if (data.assignTo) {
      body.assignTo = data.assignTo;
    }
    if (data.tags) {
      body.tags = data.tags;
    }

    return this.requestForCreation('/conversations', body);
  }

  async addConversationTag(conversationId: number, tag: string) {
    const conversation = await this.getConversation(conversationId);
    const existingTags = conversation?.tags?.map((t) => (t as any).tag || t.name).filter(Boolean) || [];
    if (!existingTags.includes(tag)) {
      existingTags.push(tag);
    }
    await this.request<void>('PUT', `/conversations/${conversationId}/tags`, {
      body: { tags: existingTags },
    });
  }

  async removeConversationTag(conversationId: number, tag: string) {
    const conversation = await this.getConversation(conversationId);
    const existingTags = conversation?.tags?.map((t) => (t as any).tag || t.name).filter(Boolean) || [];
    const newTags = existingTags.filter((t) => t !== tag);
    await this.request<void>('PUT', `/conversations/${conversationId}/tags`, {
      body: { tags: newTags },
    });
  }

  async createDraftReply(
    conversationId: number,
    data: {
      text: string;
      user?: number;
    }
  ) {
    await this.request<void>('POST', `/conversations/${conversationId}/reply`, {
      body: { ...data, draft: true },
    });
  }

  async createReply(
    conversationId: number,
    data: {
      text: string;
      customer: number;
      user?: number;
      draft?: boolean;
      status?: string;
    }
  ) {
    // Help Scout API requires customer object format
    const body = {
      ...data,
      customer: { id: data.customer },
    };
    await this.request<void>('POST', `/conversations/${conversationId}/reply`, { body });
  }

  async createDraftConversation(data: {
    subject: string;
    mailboxId: number;
    customerEmail: string;
    text: string;
    type?: 'email' | 'chat' | 'phone';
    status?: DraftConversationStatus;
    user?: number;
    tags?: string[];
  }): Promise<{ id: number }> {
    const {
      subject,
      mailboxId,
      customerEmail,
      text,
      type = 'email',
      status = 'active',
      user,
      tags,
    } = data;
    const response = await this.rawRequest('POST', '/conversations', {
      body: {
        subject,
        mailboxId,
        type,
        status,
        customer: { email: customerEmail },
        threads: [
          {
            type: 'reply',
            customer: { email: customerEmail },
            text,
            draft: true,
            ...(user !== undefined && { user }),
          },
        ],
        ...(tags && { tags }),
      },
    });

    const location = response.headers.get('Location') || '';
    const match = location.match(/\/conversations\/(\d+)/);
    if (!match) {
      throw new HelpScoutCliError(
        'Draft conversation created but could not parse ID from Location header',
        0
      );
    }
    return { id: parseInt(match[1], 10) };
  }

  async createNote(
    conversationId: number,
    data: {
      text: string;
      user?: number;
      status?: ConversationStatus;
    }
  ) {
    await this.request<void>('POST', `/conversations/${conversationId}/notes`, { body: data });
  }

  async updateThread(
    conversationId: number,
    threadId: number,
    operation: { op: 'replace'; path: '/text' | '/hidden'; value: string | boolean }
  ) {
    await this.request<void>(
      'PATCH',
      `/conversations/${conversationId}/threads/${threadId}`,
      { body: operation }
    );
  }

  // Customers
  async listCustomers(
    params: {
      mailbox?: string;
      firstName?: string;
      lastName?: string;
      sortField?: string;
      sortOrder?: string;
      page?: number;
      query?: string;
    } = {}
  ) {
    const response = await this.request<PaginatedResponse<{ customers: Customer[] }>>(
      'GET',
      '/customers',
      { params }
    );
    return {
      customers: response._embedded?.customers || [],
      page: response.page,
    };
  }

  async getCustomer(customerId: number) {
    return this.request<Customer>('GET', `/customers/${customerId}`);
  }

  async createCustomer(data: {
    firstName?: string;
    lastName?: string;
    emails?: Array<{ type: string; value: string }>;
    phones?: Array<{ type: string; value: string }>;
  }): Promise<{ id: number; url: string }> {
    return this.requestForCreation('/customers', data);
  }

  async updateCustomer(
    customerId: number,
    data: Partial<{
      firstName: string;
      lastName: string;
      jobTitle: string;
      location: string;
      organization: string;
      background: string;
    }>
  ) {
    await this.request<void>('PUT', `/customers/${customerId}`, { body: data });
  }

  async deleteCustomer(customerId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}`);
  }

  // Customer Emails
  async listCustomerEmails(customerId: number) {
    const response = await this.request<{
      _embedded?: { emails: Array<{ id: number; type: string; value: string }> };
    }>('GET', `/customers/${customerId}/emails`);
    return response._embedded?.emails || [];
  }

  async createCustomerEmail(customerId: number, data: { type: string; value: string }) {
    await this.request<void>('POST', `/customers/${customerId}/emails`, { body: data });
  }

  async updateCustomerEmail(
    customerId: number,
    emailId: number,
    data: { type?: string; value?: string }
  ) {
    await this.request<void>('PUT', `/customers/${customerId}/emails/${emailId}`, { body: data });
  }

  async deleteCustomerEmail(customerId: number, emailId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}/emails/${emailId}`);
  }

  // Customer Phones
  async listCustomerPhones(customerId: number) {
    const response = await this.request<{
      _embedded?: { phones: Array<{ id: number; type: string; value: string }> };
    }>('GET', `/customers/${customerId}/phones`);
    return response._embedded?.phones || [];
  }

  async createCustomerPhone(customerId: number, data: { type: string; value: string }) {
    await this.request<void>('POST', `/customers/${customerId}/phones`, { body: data });
  }

  async updateCustomerPhone(
    customerId: number,
    phoneId: number,
    data: { type?: string; value?: string }
  ) {
    await this.request<void>('PUT', `/customers/${customerId}/phones/${phoneId}`, { body: data });
  }

  async deleteCustomerPhone(customerId: number, phoneId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}/phones/${phoneId}`);
  }

  // Customer chat handles
  async listCustomerChats(customerId: number) {
    const response = await this.request<{
      _embedded?: { chats: Array<{ id: number; type: string; value: string }> };
    }>('GET', `/customers/${customerId}/chats`);
    return response._embedded?.chats || [];
  }

  async createCustomerChat(customerId: number, data: { type: string; value: string }) {
    await this.request<void>('POST', `/customers/${customerId}/chats`, { body: data });
  }

  async updateCustomerChat(
    customerId: number,
    chatId: number,
    data: { type?: string; value?: string }
  ) {
    await this.request<void>('PUT', `/customers/${customerId}/chats/${chatId}`, { body: data });
  }

  async deleteCustomerChat(customerId: number, chatId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}/chats/${chatId}`);
  }

  // Customer social profiles
  async listCustomerSocialProfiles(customerId: number) {
    const response = await this.request<{
      _embedded?: { 'social-profiles': Array<{ id: number; type: string; value: string }> };
    }>('GET', `/customers/${customerId}/social-profiles`);
    return response._embedded?.['social-profiles'] || [];
  }

  async createCustomerSocialProfile(customerId: number, data: { type: string; value: string }) {
    await this.request<void>('POST', `/customers/${customerId}/social-profiles`, { body: data });
  }

  async updateCustomerSocialProfile(
    customerId: number,
    socialProfileId: number,
    data: { type?: string; value?: string }
  ) {
    await this.request<void>('PUT', `/customers/${customerId}/social-profiles/${socialProfileId}`, {
      body: data,
    });
  }

  async deleteCustomerSocialProfile(customerId: number, socialProfileId: number) {
    await this.request<void>(
      'DELETE',
      `/customers/${customerId}/social-profiles/${socialProfileId}`
    );
  }

  // Customer websites
  async listCustomerWebsites(customerId: number) {
    const response = await this.request<{
      _embedded?: { websites: Array<{ id: number; value: string }> };
    }>('GET', `/customers/${customerId}/websites`);
    return response._embedded?.websites || [];
  }

  async createCustomerWebsite(customerId: number, data: { value: string }) {
    await this.request<void>('POST', `/customers/${customerId}/websites`, { body: data });
  }

  async updateCustomerWebsite(customerId: number, websiteId: number, data: { value: string }) {
    await this.request<void>('PUT', `/customers/${customerId}/websites/${websiteId}`, {
      body: data,
    });
  }

  async deleteCustomerWebsite(customerId: number, websiteId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}/websites/${websiteId}`);
  }

  // Customer address (a single address per customer; no ID in the path)
  async getCustomerAddress(customerId: number) {
    return this.request<CustomerAddress>('GET', `/customers/${customerId}/address`);
  }

  async createCustomerAddress(customerId: number, data: CustomerAddressInput) {
    await this.request<void>('POST', `/customers/${customerId}/address`, { body: data });
  }

  async updateCustomerAddress(customerId: number, data: CustomerAddressInput) {
    await this.request<void>('PUT', `/customers/${customerId}/address`, { body: data });
  }

  async deleteCustomerAddress(customerId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}/address`);
  }

  // Webhooks
  async listWebhooks(page?: number) {
    const response = await this.request<PaginatedResponse<{ webhooks: Webhook[] }>>(
      'GET',
      '/webhooks',
      { params: page ? { page } : undefined }
    );
    return {
      webhooks: response._embedded?.webhooks || [],
      page: response.page,
    };
  }

  async getWebhook(webhookId: number) {
    return this.request<Webhook>('GET', `/webhooks/${webhookId}`);
  }

  async createWebhook(data: WebhookInput): Promise<{ id: number; url: string }> {
    return this.requestForCreation('/webhooks', data);
  }

  // Help Scout does a full PUT replace; url/events/secret are all required (the
  // secret is never returned by GET, so there is no safe read-then-merge).
  async updateWebhook(webhookId: number, data: WebhookInput) {
    await this.request<void>('PUT', `/webhooks/${webhookId}`, { body: data });
  }

  async deleteWebhook(webhookId: number) {
    await this.request<void>('DELETE', `/webhooks/${webhookId}`);
  }

  // Inbox folders + routing
  async listMailboxFolders(mailboxId: number, page?: number) {
    const response = await this.request<PaginatedResponse<{ folders: MailboxFolder[] }>>(
      'GET',
      `/mailboxes/${mailboxId}/folders`,
      { params: page ? { page } : undefined }
    );
    return {
      folders: response._embedded?.folders || [],
      page: response.page,
    };
  }

  async getRoutingConfig(mailboxId: number) {
    return this.request<RoutingConfig>('GET', `/mailboxes/${mailboxId}/routing`);
  }

  // PUT replaces all fields; GET-then-merge so a partial update doesn't wipe others.
  async updateRoutingConfig(mailboxId: number, data: Partial<RoutingConfigInput>) {
    const existing = await this.getRoutingConfig(mailboxId);
    const merged: RoutingConfigInput = {
      state: data.state ?? existing.state,
      assignmentLimit: data.assignmentLimit ?? existing.assignmentLimit,
      assignmentMethod: data.assignmentMethod ?? existing.assignmentMethod,
      userIds: data.userIds ?? existing.userIds,
    };
    await this.request<void>('PUT', `/mailboxes/${mailboxId}/routing`, { body: merged });
  }

  // System Users (v3 API) — identifies AI agents (type === 'system_user').
  // NOTE: the v3 list embeds under the underscored key `system_users`.
  async listSystemUsers(page?: number) {
    const response = await this.request<PaginatedResponse<{ system_users: SystemUser[] }>>(
      'GET',
      '/system-users',
      { params: page ? { page } : undefined, version: 'v3' }
    );
    return {
      systemUsers: response._embedded?.system_users || [],
      page: response.page,
    };
  }

  async getSystemUser(systemUserId: number) {
    return this.request<SystemUser>('GET', `/system-users/${systemUserId}`, { version: 'v3' });
  }

  // List Customers v3 — cursor pagination (no page/totalPages; spans all mailboxes).
  // Pass no cursor for page one; pass the token from the previous page for the next.
  async listCustomersV3(
    params: {
      firstName?: string;
      lastName?: string;
      email?: string;
      createdSince?: string;
      modifiedSince?: string;
      query?: string;
      cursor?: string;
    } = {}
  ) {
    const response = await this.request<CursorPaginatedResponse<{ customers: Customer[] }>>(
      'GET',
      '/customers',
      { params, version: 'v3' }
    );
    const nextHref = response._links?.next?.href;
    const nextCursor = nextHref
      ? (new URL(nextHref).searchParams.get('cursor') ?? undefined)
      : undefined;
    return {
      customers: response._embedded?.customers || [],
      nextCursor,
    };
  }

  // Fetch-all helper: walks _links.next until it disappears.
  async listAllCustomersV3(
    params: {
      firstName?: string;
      lastName?: string;
      email?: string;
      createdSince?: string;
      modifiedSince?: string;
      query?: string;
    } = {},
    maxResults?: number
  ): Promise<Customer[]> {
    const all: Customer[] = [];
    let cursor: string | undefined;
    do {
      const { customers, nextCursor } = await this.listCustomersV3({ ...params, cursor });
      all.push(...customers);
      if (maxResults && all.length >= maxResults) {
        return all.slice(0, maxResults);
      }
      cursor = nextCursor;
    } while (cursor);
    return all;
  }

  // Overwrite Customer — full-replace PUT; any omitted field is cleared by Help Scout.
  async overwriteCustomer(customerId: number, data: CustomerOverwriteInput) {
    await this.request<void>('PUT', `/customers/${customerId}`, { body: data });
  }

  // Delete Customer Asynchronously — same path as the sync delete plus ?async=true (202).
  async deleteCustomerAsync(customerId: number) {
    await this.request<void>('DELETE', `/customers/${customerId}`, { params: { async: true } });
  }

  // Customer property definitions (company-wide). List embeds under the hyphenated key.
  async listCustomerPropertyDefinitions() {
    const response = await this.request<{
      _embedded?: { 'customer-properties': CustomerPropertyDefinition[] };
    }>('GET', '/customer-properties');
    return response._embedded?.['customer-properties'] || [];
  }

  async createCustomerPropertyDefinition(data: {
    type: 'number' | 'text' | 'url' | 'date' | 'dropdown';
    slug: string;
    name: string;
    options?: Array<{ id?: string; label: string }>;
  }) {
    await this.request<void>('POST', '/customer-properties', { body: data });
  }

  // Deleted by slug (not numeric id).
  async deleteCustomerPropertyDefinition(slug: string) {
    await this.request<void>('DELETE', `/customer-properties/${encodeURIComponent(slug)}`);
  }

  // Update a customer's property VALUES — JSON Patch array sent whole (ops: replace/remove).
  async updateCustomerProperties(customerId: number, operations: CustomerPropertyOperation[]) {
    await this.request<void>('PATCH', `/customers/${customerId}/properties`, { body: operations });
  }

  // Thread creation (customer/chat/phone). `customer` is a nested {id} or {email}.
  async createCustomerThread(
    conversationId: number,
    data: {
      text: string;
      customer: { id: number } | { email: string };
      imported?: boolean;
      cc?: string[];
      bcc?: string[];
      createdAt?: string;
      attachments?: ThreadAttachmentInput[];
    }
  ): Promise<{ id: number; url: string }> {
    return this.requestForCreation(`/conversations/${conversationId}/customer`, data);
  }

  async createChatThread(
    conversationId: number,
    data: {
      text: string;
      customer: { id: number } | { email: string };
      imported?: boolean;
      createdAt?: string;
      attachments?: ThreadAttachmentInput[];
    }
  ): Promise<{ id: number; url: string }> {
    return this.requestForCreation(`/conversations/${conversationId}/chats`, data);
  }

  async createPhoneThread(
    conversationId: number,
    data: {
      text: string;
      customer: { id: number } | { email: string };
      imported?: boolean;
      createdAt?: string;
      attachments?: ThreadAttachmentInput[];
    }
  ): Promise<{ id: number; url: string }> {
    return this.requestForCreation(`/conversations/${conversationId}/phones`, data);
  }

  // Thread original source — JSON variant returns { original }.
  async getThreadSource(conversationId: number, threadId: number) {
    return this.request<ThreadOriginalSource>(
      'GET',
      `/conversations/${conversationId}/threads/${threadId}/original-source`
    );
  }

  // Thread original source — RFC 822 (raw .eml). Same path, content-negotiated via
  // Accept; must read raw text (request<T> would JSON.parse and throw).
  async getThreadSourceRfc822(conversationId: number, threadId: number): Promise<string> {
    const response = await this.rawRequest(
      'GET',
      `/conversations/${conversationId}/threads/${threadId}/original-source`,
      { accept: 'message/rfc822' }
    );
    return response.text();
  }

  // Thread schedule (Send Later) — manage an existing scheduled draft thread.
  async updateThreadSchedule(conversationId: number, threadId: number, data: ThreadScheduleInput) {
    await this.request<void>(
      'PUT',
      `/conversations/${conversationId}/threads/${threadId}/schedule`,
      { body: data }
    );
  }

  async publishThreadSchedule(conversationId: number, threadId: number) {
    await this.request<void>(
      'PATCH',
      `/conversations/${conversationId}/threads/${threadId}/schedule`,
      { body: { op: 'replace', path: '/state', value: 'published' } }
    );
  }

  async deleteThreadSchedule(conversationId: number, threadId: number) {
    await this.request<void>(
      'DELETE',
      `/conversations/${conversationId}/threads/${threadId}/schedule`
    );
  }

  // Tags
  async listTags(page?: number) {
    const response = await this.request<PaginatedResponse<{ tags: Tag[] }>>('GET', '/tags', {
      params: page ? { page } : undefined,
    });
    return {
      tags: response._embedded?.tags || [],
      page: response.page,
    };
  }

  async getTag(tagId: number) {
    return this.request<Tag>('GET', `/tags/${tagId}`);
  }

  // Workflows
  async listWorkflows(params: { mailbox?: number; type?: string; page?: number } = {}) {
    const response = await this.request<PaginatedResponse<{ workflows: Workflow[] }>>(
      'GET',
      '/workflows',
      { params: { mailboxId: params.mailbox, type: params.type, page: params.page } }
    );
    return {
      workflows: response._embedded?.workflows || [],
      page: response.page,
    };
  }

  async runWorkflow(workflowId: number, conversationIds: number[]) {
    await this.request<void>('POST', `/workflows/${workflowId}/run`, {
      body: { conversationIds },
    });
  }

  async updateWorkflowStatus(workflowId: number, status: 'active' | 'inactive') {
    await this.request<void>('PATCH', `/workflows/${workflowId}`, {
      body: { op: 'replace', path: '/status', value: status },
    });
  }

  // Mailboxes
  async listMailboxes(page?: number) {
    const response = await this.request<PaginatedResponse<{ mailboxes: Mailbox[] }>>(
      'GET',
      '/mailboxes',
      { params: page ? { page } : undefined }
    );
    return {
      mailboxes: response._embedded?.mailboxes || [],
      page: response.page,
    };
  }

  async getMailbox(mailboxId: number) {
    return this.request<Mailbox>('GET', `/mailboxes/${mailboxId}`);
  }

// Users
  async listUsers(params: { email?: string; mailbox?: number; page?: number } = {}) {
    const response = await this.request<
      PaginatedResponse<{
        users: Array<{
          id: number;
          firstName: string;
          lastName: string;
          email: string;
          role: string;
          timezone: string;
          photoUrl?: string;
          mention?: string;
        }>;
      }>
    >('GET', '/users', { params: { email: params.email, mailbox: params.mailbox, page: params.page } });
    return {
      users: response._embedded?.users || [],
      page: response.page,
    };
  }

  async getUser(userId: number) {
    return this.request<{
      id: number;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      timezone: string;
      photoUrl?: string;
    }>('GET', `/users/${userId}`);
  }

  async getCurrentUser() {
    return this.request<{
      id: number;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      timezone: string;
      photoUrl?: string;
    }>('GET', '/users/me');
  }

  async createUser(data: CreateUserInput): Promise<{ id: number; url: string }> {
    return this.requestForCreation('/users', data);
  }

  async deleteUser(userId: number) {
    await this.request<void>('DELETE', `/users/${userId}`);
  }

  // Ratings — a single satisfaction rating by id (distinct from the
  // /reports/happiness/ratings aggregate report).
  async getSatisfactionRating(ratingId: number) {
    return this.request<Rating>('GET', `/ratings/${ratingId}`);
  }

  // Teams
  async listTeams(page?: number) {
    const response = await this.request<
      PaginatedResponse<{
        teams: Array<{ id: number; name: string; createdAt: string; updatedAt: string }>;
      }>
    >('GET', '/teams', { params: page ? { page } : undefined });
    return {
      teams: response._embedded?.teams || [],
      page: response.page,
    };
  }

  async getTeam(teamId: number) {
    return this.request<{ id: number; name: string; createdAt: string; updatedAt: string }>(
      'GET',
      `/teams/${teamId}`
    );
  }

  async listTeamMembers(teamId: number, page?: number) {
    const response = await this.request<
      PaginatedResponse<{
        users: Array<{ id: number; firstName: string; lastName: string; email: string }>;
      }>
    >('GET', `/teams/${teamId}/members`, { params: page ? { page } : undefined });
    return {
      users: response._embedded?.users || [],
      page: response.page,
    };
  }

  // Custom Fields
  async listMailboxFields(mailboxId: number) {
    const response = await this.request<{
      _embedded?: {
        fields: Array<{
          id: number;
          name: string;
          type: string;
          required: boolean;
          order: number;
          options?: Array<{ id: number; label: string; order: number }>;
        }>;
      };
    }>('GET', `/mailboxes/${mailboxId}/fields`);
    return response._embedded?.fields || [];
  }

  async getConversationFields(conversationId: number) {
    // Custom fields are embedded in the conversation response, not a separate endpoint
    const conversation = await this.getConversation(conversationId);
    return conversation.customFields || [];
  }

  async updateConversationFields(
    conversationId: number,
    fields: Array<{ id: number; value: string }>
  ) {
    // The API does a full PUT replace, so we must read-then-merge to avoid
    // wiping fields the caller didn't intend to change.
    const existing = await this.getConversationFields(conversationId);
    const updateIds = new Set(fields.map((f) => f.id));
    const merged = [
      ...existing
        .filter((f: { id: number }) => !updateIds.has(f.id))
        .map((f: { id: number; value: string }) => ({ id: f.id, value: f.value })),
      ...fields,
    ];
    await this.request<void>('PUT', `/conversations/${conversationId}/fields`, {
      body: { fields: merged },
    });
  }

  // Saved Replies
  // Note: This endpoint returns a flat array, not a paginated _embedded response
  async listSavedReplies(mailboxId: number, page?: number) {
    const response = await this.request<
      Array<{ id: number; name: string; preview: string; chatPreview?: string }>
    >('GET', `/mailboxes/${mailboxId}/saved-replies`, { params: page ? { page } : undefined });
    return {
      savedReplies: Array.isArray(response) ? response : [],
    };
  }

  async getSavedReply(mailboxId: number, savedReplyId: number) {
    return this.request<{
      id: number;
      name: string;
      text: string;
    }>('GET', `/mailboxes/${mailboxId}/saved-replies/${savedReplyId}`);
  }

  async createSavedReply(mailboxId: number, data: { name: string; text: string }) {
    await this.request<void>('POST', `/mailboxes/${mailboxId}/saved-replies`, { body: data });
  }

  async updateSavedReply(
    mailboxId: number,
    savedReplyId: number,
    data: { name?: string; text?: string }
  ) {
    await this.request<void>('PUT', `/mailboxes/${mailboxId}/saved-replies/${savedReplyId}`, {
      body: data,
    });
  }

  async deleteSavedReply(mailboxId: number, savedReplyId: number) {
    await this.request<void>('DELETE', `/mailboxes/${mailboxId}/saved-replies/${savedReplyId}`);
  }

  // Snooze
  async snoozeConversation(
    conversationId: number,
    snoozedUntil: string,
    unsnoozeOnCustomerReply?: boolean
  ) {
    const body = {
      snoozedUntil,
      unsnoozeOnCustomerReply: unsnoozeOnCustomerReply ?? false,
    };
    await this.request<void>('PUT', `/conversations/${conversationId}/snooze`, { body });
  }

  async unsnoozeConversation(conversationId: number) {
    await this.request<void>('DELETE', `/conversations/${conversationId}/snooze`);
  }

  // Attachments
  // List all attachments across all threads in a conversation
  async listConversationAttachments(conversationId: number): Promise<{
    attachments: Array<Attachment & { threadId: number }>;
  }> {
    const threads = await this.getConversationThreads(conversationId);
    const attachments: Array<Attachment & { threadId: number }> = [];

    for (const thread of threads) {
      const threadAttachments = thread._embedded?.attachments || [];
      for (const attachment of threadAttachments) {
        attachments.push({ ...attachment, threadId: thread.id });
      }
    }

    return { attachments };
  }

  // Get attachment data (base64 encoded)
  async getAttachmentData(
    conversationId: number,
    attachmentId: number
  ): Promise<AttachmentData> {
    return this.request<AttachmentData>(
      'GET',
      `/conversations/${conversationId}/attachments/${attachmentId}/data`
    );
  }

  // Download attachment file via the streaming endpoint (raw bytes, no base64
  // inflation; added to the HS API 2026-01-29). Documented as a direct 200, but
  // if HS ever 30x-redirects to storage we must NOT forward the Authorization
  // header to the storage host — hence manual redirect + a bare re-fetch.
  async downloadAttachment(conversationId: number, attachmentId: number): Promise<Buffer> {
    const response = await this.rawRequest(
      'GET',
      `/conversations/${conversationId}/attachments/${attachmentId}/file`,
      { accept: 'application/octet-stream', redirect: 'manual' }
    );

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) {
        throw new HelpScoutCliError(
          'Attachment download redirected without a Location header',
          response.status
        );
      }
      const redirected = await fetch(location); // bare fetch: no auth header on the storage hop
      if (!redirected.ok) {
        throw new HelpScoutCliError(
          `Attachment storage fetch failed: ${redirected.status}`,
          redirected.status
        );
      }
      return Buffer.from(await redirected.arrayBuffer());
    }

    return Buffer.from(await response.arrayBuffer());
  }

  // Upload attachment to a thread
  async createAttachment(
    conversationId: number,
    threadId: number,
    data: {
      fileName: string;
      mimeType: string;
      data: string; // Base64-encoded file content
    }
  ): Promise<void> {
    await this.request<void>(
      'POST',
      `/conversations/${conversationId}/threads/${threadId}/attachments`,
      { body: data }
    );
  }

  // Delete attachment (only works on draft conversations)
  async deleteAttachment(conversationId: number, attachmentId: number): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/conversations/${conversationId}/attachments/${attachmentId}`
    );
  }

  // Reports (Plus/Pro plans only)
  async getCompanyReport(params: ReportParams): Promise<CompanyReport> {
    return this.request<CompanyReport>('GET', '/reports/company', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }

  async getConversationsReport(params: ReportParams): Promise<ConversationsReport> {
    return this.request<ConversationsReport>('GET', '/reports/conversations', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }

  async getProductivityReport(params: ProductivityReportParams): Promise<ProductivityReport> {
    return this.request<ProductivityReport>('GET', '/reports/productivity', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }

  async getFirstResponseTimeReport(params: TimeSeriesReportParams): Promise<FirstResponseTimeReport> {
    return this.request<FirstResponseTimeReport>('GET', '/reports/productivity/first-response-time', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }

  async getHappinessReport(params: ReportParams): Promise<HappinessReport> {
    return this.request<HappinessReport>('GET', '/reports/happiness', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }

  async getHappinessRatings(params: HappinessRatingsParams): Promise<HappinessRatingsReport> {
    return this.request<HappinessRatingsReport>('GET', '/reports/happiness/ratings', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }
}

export const client = new HelpScoutClient();
