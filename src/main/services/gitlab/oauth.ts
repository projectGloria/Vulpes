import crypto from 'crypto';
import http from 'http';
import type { StoredTokenPayload } from '@shared/types/gitlab';

export interface PkcePair {
  verifier: string;
  challenge: string;
  state: string;
}

export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  return { verifier, challenge, state };
}

export function normalizeInstanceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('GitLab instance URL must use https:// or http://');
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  created_at?: number;
}

export const DEFAULT_OAUTH_LOOPBACK_PORT = 42891;
export const DEFAULT_OAUTH_REDIRECT_URI = `http://127.0.0.1:${DEFAULT_OAUTH_LOOPBACK_PORT}/oauth/callback`;

export interface LoopbackOAuthOptions {
  instanceUrl: string;
  clientId: string;
  scopes?: string;
  port?: number;
  openBrowser: (url: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Runs OAuth 2.0 Authorization Code + PKCE against gitlab.com or any self-hosted GitLab
 * using a loopback redirect URI (http://127.0.0.1:<port>/oauth/callback).
 */
export async function runLoopbackOAuthFlow(
  options: LoopbackOAuthOptions
): Promise<StoredTokenPayload> {
  const baseUrl = normalizeInstanceUrl(options.instanceUrl);
  const { verifier, challenge, state } = createPkcePair();
  const scopes = options.scopes ?? 'api read_user read_repository write_repository';
  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 180_000;

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      const server = http.createServer();
      let settled = false;

      const finish = (err: Error | null, result?: { code: string; redirectUri: string }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.close();
        if (err) reject(err);
        else if (result) resolve(result);
      };

      const timer = setTimeout(() => {
        finish(new Error('OAuth sign-in timed out. Please try again.'));
      }, timeoutMs);

      server.on('request', (req, res) => {
        try {
          const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
          if (reqUrl.pathname !== '/oauth/callback') {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }

          const returnedError = reqUrl.searchParams.get('error');
          const returnedState = reqUrl.searchParams.get('state');
          const codeParam = reqUrl.searchParams.get('code');

          if (returnedError) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h2>Vulpes Sign-In Cancelled</h2><p>You may close this tab.</p>');
            finish(new Error(`OAuth authorization failed: ${returnedError}`));
            return;
          }

          if (!codeParam || returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h2>Invalid OAuth State</h2><p>Please retry sign-in from Vulpes.</p>');
            finish(new Error('OAuth state mismatch. Possible CSRF or stale callback.'));
            return;
          }

          const addr = server.address();
          const port = typeof addr === 'object' && addr ? addr.port : 0;
          const callbackUri = `http://127.0.0.1:${port}/oauth/callback`;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
              '<h2>Signed in to Vulpes</h2>' +
              '<p>Authentication succeeded. You can close this browser tab and return to Vulpes.</p>' +
              '</body></html>'
          );

          finish(null, { code: codeParam, redirectUri: callbackUri });
        } catch (err) {
          finish(err instanceof Error ? err : new Error('OAuth callback error'));
        }
      });

      server.on('error', (err) => finish(err));

      server.listen(options.port ?? DEFAULT_OAUTH_LOOPBACK_PORT, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr !== 'object') {
          finish(new Error('Unable to bind loopback OAuth port'));
          return;
        }
        const callbackUri = `http://127.0.0.1:${addr.port}/oauth/callback`;
        const authUrl = new URL(`${baseUrl}/oauth/authorize`);
        authUrl.searchParams.set('client_id', options.clientId);
        authUrl.searchParams.set('redirect_uri', callbackUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scopes);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        void options.openBrowser(authUrl.toString()).catch((err) => {
          finish(err instanceof Error ? err : new Error('Failed to open system browser'));
        });
      });
    }
  );

  return exchangeAuthorizationCode({
    baseUrl,
    clientId: options.clientId,
    code,
    redirectUri,
    codeVerifier: verifier,
    fetchImpl: fetchFn
  });
}

export async function exchangeAuthorizationCode(params: {
  baseUrl: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<StoredTokenPayload> {
  const fetchFn = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: params.clientId,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier
  });

  const res = await fetchFn(`${params.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OAuth token exchange failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as OAuthTokenResponse;
  return toStoredToken(data);
}

export async function refreshOAuthToken(params: {
  baseUrl: string;
  clientId: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<StoredTokenPayload> {
  const fetchFn = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: params.clientId,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token'
  });

  const res = await fetchFn(`${params.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    throw new Error(`OAuth token refresh failed (${res.status}). Please sign in again.`);
  }

  const data = (await res.json()) as OAuthTokenResponse;
  return toStoredToken(data);
}

function toStoredToken(data: OAuthTokenResponse): StoredTokenPayload {
  const expiresAt =
    typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    tokenType: data.token_type ?? 'Bearer'
  };
}
