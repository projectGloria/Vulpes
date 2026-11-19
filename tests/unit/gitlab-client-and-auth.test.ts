import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { SecretStore, type SafeStorageLike } from '@main/services/secrets/SecretStore';
import { GitLabClient } from '@main/services/gitlab/GitLabClient';
import { createPkcePair, normalizeInstanceUrl } from '@main/services/gitlab/oauth';
import type { GitLabAccount, StoredTokenPayload } from '@shared/types/gitlab';

const mockCrypto: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buf) => buf.toString('utf8').replace(/^enc:/, '')
};

describe('SecretStore', () => {
  it('stores and retrieves encrypted tokens without writing plaintext', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gld-secrets-'));
    const store = new SecretStore(tmpDir, mockCrypto);
    store.setToken('acc-1', { accessToken: 'glpat-supersecret', refreshToken: 'ref-1' });

    const rawFile = fs.readFileSync(path.join(tmpDir, 'secrets.vault.json'), 'utf8');
    expect(rawFile).not.toContain('glpat-supersecret');

    expect(store.getToken('acc-1')).toEqual({
      accessToken: 'glpat-supersecret',
      refreshToken: 'ref-1'
    });

    store.deleteToken('acc-1');
    expect(store.getToken('acc-1')).toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws if OS keychain encryption is unavailable', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gld-secrets-unavail-'));
    const store = new SecretStore(tmpDir, {
      ...mockCrypto,
      isEncryptionAvailable: () => false
    });
    expect(() => store.setToken('acc-1', { accessToken: 'tok' })).toThrow(/Refusing to store/);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('OAuth helpers', () => {
  it('generates PKCE verifier, S256 challenge, and state', () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(40);
    expect(pair.challenge.length).toBeGreaterThanOrEqual(40);
    expect(pair.challenge).not.toBe(pair.verifier);
    expect(pair.state.length).toBeGreaterThanOrEqual(16);
  });

  it('normalizes GitLab instance URLs', () => {
    expect(normalizeInstanceUrl('gitlab.com')).toBe('https://gitlab.com');
    expect(normalizeInstanceUrl('https://git.corp.local:8443/sub/path')).toBe(
      'https://git.corp.local:8443'
    );
  });
});

describe('GitLabClient', () => {
  const oauthAccount: GitLabAccount = {
    id: 'acc-oauth',
    instanceUrl: 'https://gitlab.example.com',
    authMethod: 'oauth',
    userId: 7,
    username: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    oauthClientId: 'client-123'
  };

  it('refreshes OAuth token on 401 and retries once', async () => {
    const tokens = new Map<string, StoredTokenPayload>([
      [
        oauthAccount.id,
        {
          accessToken: 'expired-tok',
          refreshToken: 'ref-tok',
          expiresAt: Date.now() + 300_000
        }
      ]
    ]);

    const fetchMock = vi
      .fn<typeof fetch>()
      // 1st call: 401
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: '401 Unauthorized' }), { status: 401 }))
      // 2nd call: /oauth/token refresh
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'fresh-tok',
            refresh_token: 'ref-tok-2',
            expires_in: 7200
          }),
          { status: 200 }
        )
      )
      // 3rd call: retried /projects
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 42, name: 'demo' }]), { status: 200 }));

    const client = new GitLabClient({
      getToken: (id) => tokens.get(id) ?? null,
      saveToken: (id, tok) => tokens.set(id, tok),
      fetchImpl: fetchMock
    });

    const projects = await client.listProjects(oauthAccount);
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(42);
    expect(tokens.get(oauthAccount.id)?.accessToken).toBe('fresh-tok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('caches GET responses and invalidates by tag', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify([{ id: 1, name: 'p1' }]), { status: 200 })
      );

    const client = new GitLabClient({
      getToken: () => ({ accessToken: 'pat-123' }),
      saveToken: () => {},
      fetchImpl: fetchMock
    });

    const patAccount: GitLabAccount = { ...oauthAccount, id: 'acc-pat', authMethod: 'pat' };
    await client.listProjects(patAccount);
    await client.listProjects(patAccount);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    client.invalidateTag(`projects:${patAccount.id}`);
    await client.listProjects(patAccount);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
