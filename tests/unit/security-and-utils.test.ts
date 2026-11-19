import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, parseGitRemoteUrl } from '@shared/utils/url';
import { createRepoSchema, openExternalSchema } from '@shared/ipc/schemas';
import { redactString, redactValue } from '@main/services/logging/logger';

describe('URL validation & remote parsing', () => {
  it('allows only http and https external URLs', () => {
    expect(isSafeExternalUrl('https://gitlab.com/group/project')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:8080/repo')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///C:/Windows/System32')).toBe(false);
    expect(isSafeExternalUrl('not-a-url')).toBe(false);
  });

  it('parses HTTPS and SSH GitLab remote URLs including subgroups and custom ports', () => {
    expect(parseGitRemoteUrl('https://gitlab.com/acme/sub/app.git')).toEqual({
      protocol: 'https',
      host: 'gitlab.com',
      port: undefined,
      projectPath: 'acme/sub/app',
      baseUrl: 'https://gitlab.com'
    });

    expect(parseGitRemoteUrl('git@gitlab.internal.org:team/service.git')).toEqual({
      protocol: 'ssh',
      host: 'gitlab.internal.org',
      projectPath: 'team/service',
      baseUrl: 'https://gitlab.internal.org'
    });

    expect(parseGitRemoteUrl('https://git.corp.local:8443/ops/infra.git')).toEqual({
      protocol: 'https',
      host: 'git.corp.local',
      port: '8443',
      projectPath: 'ops/infra',
      baseUrl: 'https://git.corp.local:8443'
    });
  });
});

describe('IPC schemas', () => {
  it('rejects invalid repo names and unsafe URLs', () => {
    expect(createRepoSchema.safeParse({ parentDir: '/tmp', name: '../evil' }).success).toBe(false);
    expect(createRepoSchema.safeParse({ parentDir: '/tmp', name: 'my-repo' }).success).toBe(true);
    expect(openExternalSchema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
    expect(openExternalSchema.safeParse({ url: 'https://gitlab.com' }).success).toBe(true);
  });
});

describe('Logger redaction', () => {
  it('redacts GitLab tokens, Bearer headers, and sensitive keys', () => {
    expect(redactString('Authorization: Bearer super_secret_token_123')).toBe(
      'Authorization: Bearer [REDACTED]'
    );
    expect(redactString('token glpat-abcdefghijklmnop1234')).toBe('token glpat-[REDACTED]');
    expect(redactValue({ accessToken: 'xyz', safeField: 'hello' })).toEqual({
      accessToken: '[REDACTED]',
      safeField: 'hello'
    });
  });
});
