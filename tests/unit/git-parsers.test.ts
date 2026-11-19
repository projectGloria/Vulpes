import { describe, expect, it } from 'vitest';
import {
  parseGitVersion,
  parsePorcelainV2Status,
  parseRemotes
} from '@main/services/git/parsers';

describe('parseGitVersion', () => {
  it('parses standard git version output', () => {
    expect(parseGitVersion('git version 2.47.1.windows.1\n')).toBe('2.47.1.windows.1');
    expect(parseGitVersion('git version 2.45.0')).toBe('2.45.0');
  });

  it('returns null for unexpected strings', () => {
    expect(parseGitVersion('')).toBeNull();
  });
});

describe('parsePorcelainV2Status', () => {
  it('parses branch headers, ordinary files, renames, conflicts, and untracked files', () => {
    const raw = [
      '# branch.oid 1234567890abcdef1234567890abcdef12345678',
      '# branch.head feature/login',
      '# branch.upstream origin/feature/login',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/file with spaces.ts',
      '1 .D N... 100644 100644 000000 aaaaaaa aaaaaaa deleted.txt',
      '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 src/new name.ts',
      'src/old name.ts',
      'u UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflict.md',
      '? untracked file.txt',
      ''
    ].join('\0');

    const parsed = parsePorcelainV2Status(raw);

    expect(parsed.branch).toEqual({
      name: 'feature/login',
      oid: '1234567890abcdef1234567890abcdef12345678',
      upstream: 'origin/feature/login',
      ahead: 2,
      behind: 1,
      detached: false,
      unborn: false
    });

    expect(parsed.hasConflicts).toBe(true);
    expect(parsed.files).toHaveLength(5);

    expect(parsed.files[0]).toMatchObject({
      path: 'src/file with spaces.ts',
      kind: 'modified',
      staged: true,
      unstaged: false,
      conflicted: false
    });

    expect(parsed.files[1]).toMatchObject({
      path: 'deleted.txt',
      kind: 'deleted',
      staged: false,
      unstaged: true
    });

    expect(parsed.files[2]).toMatchObject({
      path: 'src/new name.ts',
      originalPath: 'src/old name.ts',
      kind: 'renamed',
      staged: true,
      unstaged: false
    });

    expect(parsed.files[3]).toMatchObject({
      path: 'conflict.md',
      kind: 'unmerged',
      conflicted: true
    });

    expect(parsed.files[4]).toMatchObject({
      path: 'untracked file.txt',
      kind: 'untracked',
      staged: false,
      unstaged: true
    });
  });

  it('handles unborn and detached HEAD states', () => {
    const unborn = ['# branch.oid (initial)', '# branch.head main', ''].join('\0');
    expect(parsePorcelainV2Status(unborn).branch).toMatchObject({
      name: 'main',
      oid: null,
      unborn: true,
      detached: false
    });

    const detached = ['# branch.oid abcdef1234567890', '# branch.head (detached)', ''].join('\0');
    expect(parsePorcelainV2Status(detached).branch).toMatchObject({
      name: 'abcdef1',
      detached: true,
      unborn: false
    });
  });
});

describe('parseRemotes', () => {
  it('parses fetch and push URLs per remote', () => {
    const stdout = [
      'origin\thttps://gitlab.com/acme/web.git (fetch)',
      'origin\thttps://gitlab.com/acme/web.git (push)',
      'upstream\tgit@gitlab.example.com:core/web.git (fetch)',
      'upstream\tgit@gitlab.example.com:core/web.git (push)'
    ].join('\n');

    expect(parseRemotes(stdout)).toEqual([
      {
        name: 'origin',
        fetchUrl: 'https://gitlab.com/acme/web.git',
        pushUrl: 'https://gitlab.com/acme/web.git'
      },
      {
        name: 'upstream',
        fetchUrl: 'git@gitlab.example.com:core/web.git',
        pushUrl: 'git@gitlab.example.com:core/web.git'
      }
    ]);
  });
});
