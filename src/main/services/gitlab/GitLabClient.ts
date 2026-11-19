import type {
  GitLabAccount,
  GitLabIssue,
  GitLabJob,
  GitLabMergeRequest,
  GitLabPipeline,
  GitLabProject,
  GitLabUser,
  StoredTokenPayload
} from '@shared/types/gitlab';
import { ResponseCache } from './cache';
import { normalizeInstanceUrl, refreshOAuthToken } from './oauth';

export class GitLabApiError extends Error {
  public readonly status: number;
  public readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = 'GitLabApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface GitLabClientDeps {
  getToken: (accountId: string) => StoredTokenPayload | null;
  saveToken: (accountId: string, token: StoredTokenPayload) => void;
  updateAccountExpiry?: (accountId: string, expiresAt: number | null) => void;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  cacheTtlMs?: number;
  cacheTags?: string[];
  invalidateTags?: string[];
  signal?: AbortSignal;
  rawText?: boolean;
}

const EXPIRY_BUFFER_MS = 60_000;

export class GitLabClient {
  private readonly deps: GitLabClientDeps;
  private readonly fetchFn: typeof fetch;
  private readonly cache = new ResponseCache();
  private readonly avatarCache = new Map<string, string | null>();
  private readonly refreshInFlight = new Map<string, Promise<StoredTokenPayload>>();

  constructor(deps: GitLabClientDeps) {
    this.deps = deps;
    this.fetchFn = deps.fetchImpl ?? fetch;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public invalidateTag(tag: string): void {
    this.cache.invalidateTag(tag);
  }

  /**
   * Verifies a PAT or OAuth access token directly before an account record exists.
   */
  public async verifyCredentials(
    instanceUrl: string,
    accessToken: string,
    authMethod: 'oauth' | 'pat'
  ): Promise<GitLabUser> {
    const baseUrl = normalizeInstanceUrl(instanceUrl);
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (authMethod === 'oauth') {
      headers.Authorization = `Bearer ${accessToken}`;
    } else {
      headers['PRIVATE-TOKEN'] = accessToken;
    }

    const res = await this.fetchFn(`${baseUrl}/api/v4/user`, { headers });
    if (!res.ok) {
      throw new GitLabApiError(
        `Authentication failed (${res.status}): check your instance URL and token`,
        res.status,
        '/user'
      );
    }
    return (await res.json()) as GitLabUser;
  }

  public async getValidToken(account: GitLabAccount): Promise<StoredTokenPayload> {
    const token = this.deps.getToken(account.id);
    if (!token) {
      throw new GitLabApiError('Account token is missing. Please sign in again.', 401, '/auth');
    }

    const isExpiring =
      account.authMethod === 'oauth' &&
      typeof token.expiresAt === 'number' &&
      Date.now() + EXPIRY_BUFFER_MS >= token.expiresAt;

    if (isExpiring && token.refreshToken && account.oauthClientId) {
      return this.refreshAccountToken(account, token.refreshToken);
    }
    return token;
  }

  private async refreshAccountToken(
    account: GitLabAccount,
    refreshToken: string
  ): Promise<StoredTokenPayload> {
    const existing = this.refreshInFlight.get(account.id);
    if (existing) return existing;

    const promise = (async () => {
      if (!account.oauthClientId) {
        throw new GitLabApiError('Missing OAuth client ID for token refresh', 401, '/oauth/token');
      }
      const next = await refreshOAuthToken({
        baseUrl: account.instanceUrl,
        clientId: account.oauthClientId,
        refreshToken,
        fetchImpl: this.fetchFn
      });
      this.deps.saveToken(account.id, next);
      this.deps.updateAccountExpiry?.(account.id, next.expiresAt ?? null);
      return next;
    })().finally(() => {
      this.refreshInFlight.delete(account.id);
    });

    this.refreshInFlight.set(account.id, promise);
    return promise;
  }

  public async request<T>(
    account: GitLabAccount,
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const url = new URL(`${account.instanceUrl}/api/v4${endpoint}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const cacheKey = `${account.id}:${method}:${url.toString()}`;
    if (method === 'GET' && options.cacheTtlMs) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached !== undefined) return cached;
    }

    const execute = async (attemptRefresh: boolean, rateRetry = 0): Promise<T> => {
      const token = await this.getValidToken(account);
      const headers: Record<string, string> = {
        Accept: options.rawText ? 'text/plain' : 'application/json'
      };
      if (account.authMethod === 'oauth') {
        headers.Authorization = `Bearer ${token.accessToken}`;
      } else {
        headers['PRIVATE-TOKEN'] = token.accessToken;
      }
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal
      });

      if (res.status === 401 && attemptRefresh && token.refreshToken && account.oauthClientId) {
        await this.refreshAccountToken(account, token.refreshToken);
        return execute(false, rateRetry);
      }

      if (res.status === 429 && rateRetry < 2) {
        const retryAfterSec = Number.parseInt(res.headers.get('Retry-After') ?? '1', 10);
        const delayMs = Math.min(Math.max(retryAfterSec, 1) * 1000, 5000);
        await new Promise((r) => setTimeout(r, delayMs));
        return execute(attemptRefresh, rateRetry + 1);
      }

      if (!res.ok) {
        let message = `GitLab API error (${res.status})`;
        try {
          const errJson = (await res.json()) as { message?: string | Record<string, unknown>; error?: string };
          if (typeof errJson.message === 'string') message = errJson.message;
          else if (typeof errJson.error === 'string') message = errJson.error;
        } catch {
          // ignore non-json error body
        }
        throw new GitLabApiError(message, res.status, endpoint);
      }

      if (res.status === 204) {
        return undefined as T;
      }

      const data = options.rawText ? ((await res.text()) as T) : ((await res.json()) as T);

      if (method === 'GET' && options.cacheTtlMs) {
        this.cache.set(cacheKey, data, options.cacheTtlMs, options.cacheTags ?? []);
      }
      if (options.invalidateTags) {
        for (const tag of options.invalidateTags) {
          this.cache.invalidateTag(tag);
        }
      }

      return data;
    };

    return execute(true);
  }

  public async listProjects(
    account: GitLabAccount,
    params: { search?: string; page?: number; perPage?: number; membership?: boolean } = {}
  ): Promise<GitLabProject[]> {
    return this.request<GitLabProject[]>(account, '/projects', {
      query: {
        membership: params.membership ?? true,
        order_by: 'last_activity_at',
        sort: 'desc',
        search: params.search || undefined,
        page: params.page ?? 1,
        per_page: params.perPage ?? 30
      },
      cacheTtlMs: params.search ? 10_000 : 30_000,
      cacheTags: [`projects:${account.id}`]
    });
  }

  public async getProjectByPath(
    account: GitLabAccount,
    projectPath: string
  ): Promise<GitLabProject> {
    const encoded = encodeURIComponent(projectPath);
    return this.request<GitLabProject>(account, `/projects/${encoded}`, {
      cacheTtlMs: 60_000,
      cacheTags: [`project:${account.id}:${projectPath}`]
    });
  }

  public async listMergeRequests(
    account: GitLabAccount,
    projectId: number | string,
    params: {
      scope?: 'created_by_me' | 'assigned_to_me' | 'all';
      reviewerUsername?: string;
      state?: 'opened' | 'closed' | 'merged' | 'all';
    } = {}
  ): Promise<GitLabMergeRequest[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabMergeRequest[]>(account, `/projects/${encoded}/merge_requests`, {
      query: {
        state: params.state ?? 'opened',
        scope: params.scope,
        reviewer_username: params.reviewerUsername,
        order_by: 'updated_at',
        sort: 'desc',
        per_page: 30
      },
      cacheTtlMs: 15_000,
      cacheTags: [`mrs:${projectId}`]
    });
  }

  public async createMergeRequest(
    account: GitLabAccount,
    projectId: number | string,
    payload: {
      source_branch: string;
      target_branch: string;
      title: string;
      description?: string;
      assignee_ids?: number[];
      reviewer_ids?: number[];
      labels?: string;
      milestone_id?: number;
      squash?: boolean;
      remove_source_branch?: boolean;
    }
  ): Promise<GitLabMergeRequest> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabMergeRequest>(account, `/projects/${encoded}/merge_requests`, {
      method: 'POST',
      body: payload,
      invalidateTags: [`mrs:${projectId}`]
    });
  }

  public async listPipelines(
    account: GitLabAccount,
    projectId: number | string,
    ref?: string
  ): Promise<GitLabPipeline[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabPipeline[]>(account, `/projects/${encoded}/pipelines`, {
      query: { ref, per_page: 20 },
      cacheTtlMs: 10_000,
      cacheTags: [`pipelines:${projectId}`]
    });
  }

  public async listPipelineJobs(
    account: GitLabAccount,
    projectId: number | string,
    pipelineId: number
  ): Promise<GitLabJob[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabJob[]>(
      account,
      `/projects/${encoded}/pipelines/${pipelineId}/jobs`,
      { cacheTtlMs: 8_000, cacheTags: [`pipelines:${projectId}`] }
    );
  }

  public async getJobTrace(
    account: GitLabAccount,
    projectId: number | string,
    jobId: number
  ): Promise<string> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<string>(account, `/projects/${encoded}/jobs/${jobId}/trace`, {
      rawText: true
    });
  }

  public async retryPipeline(
    account: GitLabAccount,
    projectId: number | string,
    pipelineId: number
  ): Promise<GitLabPipeline> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabPipeline>(
      account,
      `/projects/${encoded}/pipelines/${pipelineId}/retry`,
      { method: 'POST', invalidateTags: [`pipelines:${projectId}`] }
    );
  }

  public async cancelPipeline(
    account: GitLabAccount,
    projectId: number | string,
    pipelineId: number
  ): Promise<GitLabPipeline> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabPipeline>(
      account,
      `/projects/${encoded}/pipelines/${pipelineId}/cancel`,
      { method: 'POST', invalidateTags: [`pipelines:${projectId}`] }
    );
  }

  public async listIssues(
    account: GitLabAccount,
    projectId: number | string,
    search?: string
  ): Promise<GitLabIssue[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabIssue[]>(account, `/projects/${encoded}/issues`, {
      query: { state: 'opened', search: search || undefined, per_page: 30 },
      cacheTtlMs: 15_000,
      cacheTags: [`issues:${projectId}`]
    });
  }

  public async getMergeRequestNotes(
    account: GitLabAccount,
    projectId: number | string,
    mrIid: number
  ): Promise<Array<{ id: number; body: string; author: GitLabUser; created_at: string; system: boolean }>> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request(account, `/projects/${encoded}/merge_requests/${mrIid}/notes`, {
      query: { sort: 'asc', per_page: 50 },
      cacheTtlMs: 10_000,
      cacheTags: [`mrs:${projectId}`]
    });
  }

  public async getMergeRequestApprovals(
    account: GitLabAccount,
    projectId: number | string,
    mrIid: number
  ): Promise<{ approved: boolean; approvals_left: number; approved_by: Array<{ user: GitLabUser }> }> {
    const encoded = encodeURIComponent(String(projectId));
    try {
      return await this.request(
        account,
        `/projects/${encoded}/merge_requests/${mrIid}/approvals`,
        { cacheTtlMs: 10_000, cacheTags: [`mrs:${projectId}`] }
      );
    } catch {
      return { approved: false, approvals_left: 0, approved_by: [] };
    }
  }

  public async listProjectMembers(
    account: GitLabAccount,
    projectId: number | string
  ): Promise<GitLabUser[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request<GitLabUser[]>(account, `/projects/${encoded}/members/all`, {
      query: { per_page: 50 },
      cacheTtlMs: 60_000,
      cacheTags: [`project:${projectId}`]
    });
  }

  public async listProjectMilestones(
    account: GitLabAccount,
    projectId: number | string
  ): Promise<Array<{ id: number; iid: number; title: string }>> {
    const encoded = encodeURIComponent(String(projectId));
    return this.request(account, `/projects/${encoded}/milestones`, {
      query: { state: 'active', per_page: 30 },
      cacheTtlMs: 60_000,
      cacheTags: [`project:${projectId}`]
    });
  }

  /**
   * Fetches a user or project avatar image in the main process and returns a data URL.
   * Sends GitLab authentication headers only when the target origin matches the account's instance.
   */
  public async fetchImageAsDataUrl(
    rawUrl: string,
    account?: GitLabAccount
  ): Promise<string | null> {
    let resolvedUrl = rawUrl.trim();
    if (!resolvedUrl) return null;

    if (resolvedUrl.startsWith('/') && account?.instanceUrl) {
      resolvedUrl = `${account.instanceUrl.replace(/\/+$/, '')}${resolvedUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(resolvedUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return null;
      }
    } catch {
      return null;
    }

    const cacheKey = `${account?.id ?? 'anon'}:${parsedUrl.toString()}`;
    if (this.avatarCache.has(cacheKey)) {
      return this.avatarCache.get(cacheKey) ?? null;
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'image/*'
      };

      if (account) {
        try {
          const instanceOrigin = new URL(account.instanceUrl).origin;
          if (parsedUrl.origin === instanceOrigin) {
            const token = await this.getValidToken(account);
            if (account.authMethod === 'oauth') {
              headers.Authorization = `Bearer ${token.accessToken}`;
            } else {
              headers['PRIVATE-TOKEN'] = token.accessToken;
            }
          }
        } catch {
          // Proceed unauthenticated if token lookup fails
        }
      }

      const res = await this.fetchFn(parsedUrl.toString(), { headers });
      if (!res.ok) {
        this.avatarCache.set(cacheKey, null);
        return null;
      }

      const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
      if (!contentType.startsWith('image/')) {
        this.avatarCache.set(cacheKey, null);
        return null;
      }

      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 2 * 1024 * 1024) {
        this.avatarCache.set(cacheKey, null);
        return null;
      }

      const dataUrl = `data:${contentType};base64,${Buffer.from(arrayBuf).toString('base64')}`;
      this.avatarCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch {
      this.avatarCache.set(cacheKey, null);
      return null;
    }
  }
}
