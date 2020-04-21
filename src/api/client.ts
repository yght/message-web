import { ServerMessage } from '../messages/types';

/**
 * Client for the MessagePlatform API.
 *
 * Endpoints match the .NET service in
 * https://github.com/yght/dotnet-showcase - MessagesController and
 * PollingController.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly reason: string | null;

  constructor(status: number, message: string, reason: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

export interface PollResponse {
  messages: ServerMessage[];
  /** Cursor to pass as `since` on the next poll. */
  until: string | null;
}

export interface ConversationPage {
  messages: ServerMessage[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchImpl?: typeof fetch;
}

export class MessageApi {
  private baseUrl: string;
  private getToken: () => string | null;
  private http: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken = options.getToken;
    this.http = options.fetchImpl || fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((init.headers as Record<string, string>) || {})
    };

    if (init.body) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const response = await this.http(this.baseUrl + path, { ...init, headers });

    if (!response.ok) {
      throw await toApiError(response);
    }

    // 204 on delete and on read receipts.
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  }

  sendMessage(input: {
    recipientId: string;
    body: string;
    clientMessageId: string;
  }): Promise<ServerMessage> {
    return this.request<ServerMessage>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  sendGroupMessage(input: {
    groupId: string;
    body: string;
    clientMessageId: string;
  }): Promise<ServerMessage> {
    return this.request<ServerMessage>('/api/messages/group', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  getConversation(userId: string, page = 1, pageSize = 50): Promise<ConversationPage> {
    const query = '?page=' + page + '&pageSize=' + pageSize;
    return this.request<ConversationPage>(
      '/api/messages/conversations/' + encodeURIComponent(userId) + query
    );
  }

  markAsRead(messageId: string): Promise<void> {
    return this.request<void>('/api/messages/' + encodeURIComponent(messageId) + '/read', {
      method: 'PUT'
    });
  }

  deleteMessage(messageId: string): Promise<void> {
    return this.request<void>('/api/messages/' + encodeURIComponent(messageId), {
      method: 'DELETE'
    });
  }

  search(query: string, page = 1, pageSize = 20): Promise<ConversationPage> {
    const qs =
      '?query=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + pageSize;
    return this.request<ConversationPage>('/api/messages/search' + qs);
  }

  /**
   * The long poll. The server holds this open for up to 30 seconds, so the
   * AbortSignal matters - without it, navigating away leaves a request
   * hanging and React complains about setting state on an unmounted tree.
   */
  poll(since: string | null, signal: AbortSignal): Promise<PollResponse> {
    const qs = since ? '?since=' + encodeURIComponent(since) : '';
    return this.request<PollResponse>('/api/polling/messages' + qs, { signal });
  }

  heartbeat(): Promise<void> {
    return this.request<void>('/api/polling/heartbeat', { method: 'POST' });
  }
}

/**
 * The API returns a problem-details body on failures. Pull the reason out
 * when it is there so the UI can say something specific.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let reason: string | null = null;
  let detail = response.statusText;

  try {
    const body = await response.json();
    reason = body.reason || body.error || null;
    detail = body.detail || body.message || detail;
  } catch (e) {
    // A non-JSON error body is not itself an error worth reporting.
  }

  return new ApiError(response.status, detail, reason);
}
