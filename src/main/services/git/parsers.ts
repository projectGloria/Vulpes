import type { BranchSummary, FileChange, FileChangeKind, RemoteInfo } from '@shared/types/git';

export interface ParsedPorcelainV2Status {
  branch: BranchSummary;
  files: FileChange[];
  hasConflicts: boolean;
}

/**
 * Parses `git --version` output, e.g. "git version 2.47.1.windows.1".
 */
export function parseGitVersion(stdout: string): string | null {
  const match = /git version\s+([^\s]+)/i.exec(stdout.trim());
  return match ? match[1] : null;
}

/**
 * Parses `git status --porcelain=v2 --branch -z --untracked-files=all`.
 * Uses NUL delimiters so filenames with spaces, quotes, or unicode are preserved losslessly.
 */
export function parsePorcelainV2Status(stdout: string): ParsedPorcelainV2Status {
  const branch: BranchSummary = {
    name: 'HEAD',
    oid: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    unborn: false
  };

  const files: FileChange[] = [];
  let hasConflicts = false;

  const entries = stdout.split('\0');
  let i = 0;

  while (i < entries.length) {
    const entry = entries[i];
    i += 1;
    if (!entry) continue;

    if (entry.startsWith('# ')) {
      parseBranchHeader(entry, branch);
      continue;
    }

    const type = entry[0];

    if (type === '1') {
      // Ordinary changed entry:
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const parsed = splitFixedFields(entry, 8);
      if (!parsed) continue;
      const xy = parsed.fields[1];
      const indexStatus = xy[0] ?? '.';
      const worktreeStatus = xy[1] ?? '.';
      const filePath = parsed.rest;

      files.push({
        path: filePath,
        indexStatus,
        worktreeStatus,
        kind: classifyXY(indexStatus, worktreeStatus),
        staged: indexStatus !== '.',
        unstaged: worktreeStatus !== '.',
        conflicted: false
      });
    } else if (type === '2') {
      // Renamed or copied entry:
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\0<origPath>
      const parsed = splitFixedFields(entry, 9);
      const originalPath = entries[i] ?? undefined;
      i += 1;
      if (!parsed) continue;
      const xy = parsed.fields[1];
      const indexStatus = xy[0] ?? '.';
      const worktreeStatus = xy[1] ?? '.';
      const scoreToken = parsed.fields[8] ?? '';
      const filePath = parsed.rest;

      files.push({
        path: filePath,
        originalPath,
        indexStatus,
        worktreeStatus,
        kind: scoreToken.startsWith('C') ? 'copied' : 'renamed',
        staged: indexStatus !== '.',
        unstaged: worktreeStatus !== '.',
        conflicted: false
      });
    } else if (type === 'u') {
      // Unmerged entry:
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const parsed = splitFixedFields(entry, 10);
      if (!parsed) continue;
      const xy = parsed.fields[1];
      hasConflicts = true;
      files.push({
        path: parsed.rest,
        indexStatus: xy[0] ?? 'U',
        worktreeStatus: xy[1] ?? 'U',
        kind: 'unmerged',
        staged: false,
        unstaged: true,
        conflicted: true
      });
    } else if (type === '?') {
      // Untracked entry: ? <path>
      const filePath = entry.slice(2);
      files.push({
        path: filePath,
        indexStatus: '?',
        worktreeStatus: '?',
        kind: 'untracked',
        staged: false,
        unstaged: true,
        conflicted: false
      });
    }
  }

  return { branch, files, hasConflicts };
}

function parseBranchHeader(line: string, branch: BranchSummary): void {
  if (line.startsWith('# branch.oid ')) {
    const oid = line.slice('# branch.oid '.length).trim();
    if (oid === '(initial)') {
      branch.unborn = true;
      branch.oid = null;
    } else {
      branch.oid = oid;
    }
  } else if (line.startsWith('# branch.head ')) {
    const head = line.slice('# branch.head '.length).trim();
    if (head === '(detached)') {
      branch.detached = true;
      branch.name = branch.oid ? branch.oid.slice(0, 7) : 'HEAD';
    } else {
      branch.name = head;
    }
  } else if (line.startsWith('# branch.upstream ')) {
    branch.upstream = line.slice('# branch.upstream '.length).trim() || null;
  } else if (line.startsWith('# branch.ab ')) {
    const match = /\+(\d+)\s+-(\d+)/.exec(line);
    if (match) {
      branch.ahead = Number.parseInt(match[1], 10);
      branch.behind = Number.parseInt(match[2], 10);
    }
  }
}

function splitFixedFields(line: string, count: number): { fields: string[]; rest: string } | null {
  const fields: string[] = [];
  let cursor = 0;

  for (let i = 0; i < count; i += 1) {
    const spaceIdx = line.indexOf(' ', cursor);
    if (spaceIdx === -1) return null;
    fields.push(line.slice(cursor, spaceIdx));
    cursor = spaceIdx + 1;
  }

  return {
    fields,
    rest: line.slice(cursor)
  };
}

function classifyXY(x: string, y: string): FileChangeKind {
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'C' || y === 'C') return 'copied';
  return 'modified';
}

/**
 * Parses `git remote -v` output.
 */
export function parseRemotes(stdout: string): RemoteInfo[] {
  const map = new Map<string, RemoteInfo>();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^(\S+)\s+(.+)\s+\((fetch|push)\)$/.exec(line);
    if (!match) continue;
    const [, name, url, kind] = match;
    const existing = map.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
    if (kind === 'fetch') existing.fetchUrl = url;
    if (kind === 'push') existing.pushUrl = url;
    map.set(name, existing);
  }
  return Array.from(map.values());
}
