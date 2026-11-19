/**
 * Validates that an external URL is safe to open with shell.openExternal.
 * Only http: and https: protocols are allowed.
 */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface ParsedGitRemote {
  protocol: 'https' | 'http' | 'ssh';
  host: string;
  port?: string;
  projectPath: string; // e.g., "group/subgroup/repo"
  baseUrl: string; // e.g., "https://gitlab.com"
}

/**
 * Parses common Git remote URL formats:
 * - https://gitlab.com/group/project.git
 * - https://gitlab.example.com:8443/group/sub/project
 * - git@gitlab.com:group/project.git
 * - ssh://git@gitlab.example.com:2222/group/project.git
 */
export function parseGitRemoteUrl(remoteUrl: string): ParsedGitRemote | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  // SCP-like SSH syntax: git@host:path/to/repo.git
  const scpMatch = /^(?:[^@]+@)?([^:/\s]+):(.+)$/.exec(trimmed);
  if (scpMatch && !trimmed.includes('://')) {
    const host = scpMatch[1];
    const projectPath = normalizeProjectPath(scpMatch[2]);
    if (!host || !projectPath) return null;
    return {
      protocol: 'ssh',
      host,
      projectPath,
      baseUrl: `https://${host}`
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'ssh:') {
      return null;
    }
    const projectPath = normalizeProjectPath(url.pathname);
    if (!url.hostname || !projectPath) return null;

    const protocol = url.protocol.replace(':', '') as 'https' | 'http' | 'ssh';
    const isHttp = protocol === 'http';
    const portSuffix =
      url.port &&
      !((protocol === 'https' && url.port === '443') ||
        (protocol === 'http' && url.port === '80') ||
        (protocol === 'ssh' && url.port === '22'))
        ? `:${url.port}`
        : '';

    const webScheme = isHttp ? 'http' : 'https';
    const webPort = protocol === 'ssh' ? '' : portSuffix;

    return {
      protocol,
      host: url.hostname,
      port: url.port || undefined,
      projectPath,
      baseUrl: `${webScheme}://${url.hostname}${webPort}`
    };
  } catch {
    return null;
  }
}

function normalizeProjectPath(rawPath: string): string {
  return rawPath
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
}
