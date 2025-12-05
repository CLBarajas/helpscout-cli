import { auth } from './auth.js';
import { config } from './config.js';
import { HelpScoutCliError, handleHelpScoutError } from './errors.js';
import dotenv from 'dotenv';
import type {
  Conversation,
  Customer,
  Tag,
  Workflow,
  Mailbox,
  Thread,
  PageInfo,
} from '../types/index.js';

dotenv.config();

const API_BASE = 'https://api.helpscout.net/v2';
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

export class HelpScoutClient {
  private accessToken: string | null = null;

  clearToken(): void {
    this.accessToken = null;
  }

  async refreshAccessToken(): Promise<string> {
    const appId = await auth.getAppId();
    const appSecret = await auth.getAppSecret();
    const refreshToken = await auth.getRefreshToken();

    if (!appId || !appSecret) {
      throw new HelpScoutCliError(
        'Not configured. Please run: helpscout auth login',
        401,
      );
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
          await auth.setAccessToken(data.access_token);
          if (data.refresh_token) {
            await auth.setRefreshToken(data.refresh_token);
          }
          this.accessToken = data.access_token;
          return data.access_token;
        }
      } catch {
        // Fall through to client credentials
      }
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw { ...error, statusCode: response.status };
    }

    const data = (await response.json()) as TokenResponse;
    await auth.setAccessToken(data.access_token);
    this.accessToken = data.access_token;
    return data.access_token;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const storedToken = await auth.getAccessToken();
    if (storedToken) {
      this.accessToken = storedToken;
      return storedToken;
    }

    return this.refreshAccessToken();
  }

  async getMailboxId(mailboxIdOrDefault?: string): Promise<string> {
    const mailboxId =
      mailboxIdOrDefault ||
      config.getDefaultMailbox() ||
      process.env.HELPSCOUT_MAILBOX_ID;

    if (!mailboxId) {
      throw new HelpScoutCliError(
        'No mailbox specified. Use --mailbox flag, set default with "helpscout mailboxes set-default", or set HELPSCOUT_MAILBOX_ID environment variable',
        400,
      );
    }

    return mailboxId;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      retry?: boolean;
    } = {},
  ): Promise<T> {
    const { params, body, retry = true } = options;

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
    const response = await fetch(url.toString(), fetchOptions);

    if (response.status === 401 && retry) {
      this.accessToken = null;
      await this.refreshAccessToken();
      return this.request(method, path, { ...options, retry: false });
    }

    if (response.status === 204) {
      return {} as T;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw { ...error, statusCode: response.status };
    }

    return response.json() as Promise<T>;
  }

  private async withErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      handleHelpScoutError(error);
    }
  }

  // Conversations
  async listConversations(params: {
    mailbox?: string;
    status?: string;
    tag?: string;
    assignedTo?: string;
    modifiedSince?: string;
    sortField?: string;
    sortOrder?: string;
    page?: number;
    embed?: string;
  } = {}) {
    return this.withErrorHandling(async () => {
      const response = await this.request<PaginatedResponse<{ conversations: Conversation[] }>>(
        'GET',
        '/conversations',
        { params },
      );
      return {
        conversations: response._embedded?.conversations || [],
        page: response.page,
      };
    });
  }

  async getConversation(conversationId: number, embed?: string) {
    return this.withErrorHandling(async () => {
      const params = embed ? { embed } : undefined;
      return this.request<Conversation>('GET', `/conversations/${conversationId}`, { params });
    });
  }

  async getConversationThreads(conversationId: number) {
    return this.withErrorHandling(async () => {
      const response = await this.request<PaginatedResponse<{ threads: Thread[] }>>(
        'GET',
        `/conversations/${conversationId}/threads`,
      );
      return response._embedded?.threads || [];
    });
  }

  async updateConversation(
    conversationId: number,
    data: Partial<{
      op: string;
      path: string;
      value: unknown;
    }>,
  ) {
    return this.withErrorHandling(async () => {
      await this.request<void>('PATCH', `/conversations/${conversationId}`, { body: data });
      return { success: true };
    });
  }

  async deleteConversation(conversationId: number) {
    return this.withErrorHandling(async () => {
      await this.request<void>('DELETE', `/conversations/${conversationId}`);
      return { success: true };
    });
  }

  async addConversationTag(conversationId: number, tag: string) {
    return this.withErrorHandling(async () => {
      await this.request<void>('PUT', `/conversations/${conversationId}/tags`, {
        body: { tags: [tag] },
      });
      return { success: true };
    });
  }

  async removeConversationTag(conversationId: number, tag: string) {
    return this.withErrorHandling(async () => {
      const conversation = await this.getConversation(conversationId);
      const existingTags = conversation?.tags?.map(t => t.name) || [];
      const newTags = existingTags.filter(t => t !== tag);
      await this.request<void>('PUT', `/conversations/${conversationId}/tags`, {
        body: { tags: newTags },
      });
      return { success: true };
    });
  }

  async createReply(
    conversationId: number,
    data: {
      text: string;
      user?: number;
      draft?: boolean;
      status?: string;
    },
  ) {
    return this.withErrorHandling(async () => {
      await this.request<void>('POST', `/conversations/${conversationId}/reply`, { body: data });
      return { success: true };
    });
  }

  async createNote(
    conversationId: number,
    data: {
      text: string;
      user?: number;
    },
  ) {
    return this.withErrorHandling(async () => {
      await this.request<void>('POST', `/conversations/${conversationId}/notes`, { body: data });
      return { success: true };
    });
  }

  // Customers
  async listCustomers(params: {
    mailbox?: string;
    firstName?: string;
    lastName?: string;
    modifiedSince?: string;
    sortField?: string;
    sortOrder?: string;
    page?: number;
    query?: string;
  } = {}) {
    return this.withErrorHandling(async () => {
      const response = await this.request<PaginatedResponse<{ customers: Customer[] }>>(
        'GET',
        '/customers',
        { params },
      );
      return {
        customers: response._embedded?.customers || [],
        page: response.page,
      };
    });
  }

  async getCustomer(customerId: number) {
    return this.withErrorHandling(async () => {
      return this.request<Customer>('GET', `/customers/${customerId}`);
    });
  }

  async createCustomer(data: {
    firstName?: string;
    lastName?: string;
    emails?: Array<{ type: string; value: string }>;
    phones?: Array<{ type: string; value: string }>;
  }) {
    return this.withErrorHandling(async () => {
      const response = await this.request<void>('POST', '/customers', { body: data });
      return response;
    });
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
    }>,
  ) {
    return this.withErrorHandling(async () => {
      await this.request<void>('PUT', `/customers/${customerId}`, { body: data });
      return { success: true };
    });
  }

  async deleteCustomer(customerId: number) {
    return this.withErrorHandling(async () => {
      await this.request<void>('DELETE', `/customers/${customerId}`);
      return { success: true };
    });
  }

  // Tags
  async listTags(page?: number) {
    return this.withErrorHandling(async () => {
      const response = await this.request<PaginatedResponse<{ tags: Tag[] }>>(
        'GET',
        '/tags',
        { params: page ? { page } : undefined },
      );
      return {
        tags: response._embedded?.tags || [],
        page: response.page,
      };
    });
  }

  async getTag(tagId: number) {
    return this.withErrorHandling(async () => {
      return this.request<Tag>('GET', `/tags/${tagId}`);
    });
  }

  // Workflows
  async listWorkflows(params: {
    mailboxId?: number;
    type?: string;
    page?: number;
  } = {}) {
    return this.withErrorHandling(async () => {
      const response = await this.request<PaginatedResponse<{ workflows: Workflow[] }>>(
        'GET',
        '/workflows',
        { params },
      );
      return {
        workflows: response._embedded?.workflows || [],
        page: response.page,
      };
    });
  }

  async runWorkflow(workflowId: number, conversationIds: number[]) {
    return this.withErrorHandling(async () => {
      await this.request<void>('POST', `/workflows/${workflowId}/run`, {
        body: { conversationIds },
      });
      return { success: true };
    });
  }

  async updateWorkflowStatus(workflowId: number, status: 'active' | 'inactive') {
    return this.withErrorHandling(async () => {
      await this.request<void>('PATCH', `/workflows/${workflowId}`, {
        body: { op: 'replace', path: '/status', value: status },
      });
      return { success: true };
    });
  }

  // Mailboxes
  async listMailboxes(page?: number) {
    return this.withErrorHandling(async () => {
      const response = await this.request<PaginatedResponse<{ mailboxes: Mailbox[] }>>(
        'GET',
        '/mailboxes',
        { params: page ? { page } : undefined },
      );
      return {
        mailboxes: response._embedded?.mailboxes || [],
        page: response.page,
      };
    });
  }

  async getMailbox(mailboxId: number) {
    return this.withErrorHandling(async () => {
      return this.request<Mailbox>('GET', `/mailboxes/${mailboxId}`);
    });
  }
}

export const client = new HelpScoutClient();
