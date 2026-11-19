import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  parseBranches,
  parseGitLogZ,
  parseStashes,
  parseUnifiedDiff
} from '@main/services/git/diffParser';
import { buildPartialPatch } from '@shared/utils/patch';
import { GitService } from '@main/services/git/GitService';
import { DiscardBackupStore } from '@main/services/git/discardBackup';

describe('Diff, Log, Branch, and Stash parsers', () => {
  it('parses unified diff hunks and builds single-line partial patches', () => {
    const raw = [
      'diff --git a/app.ts b/app.ts',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 20;',
      '+const c = 30;',
      ' const d = 4;'
    ].join('\n');

    const hunks = parseUnifiedDiff(raw);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toHaveLength(5);

    // Stage only line index 2 (+const b = 20;)
    const patch = buildPartialPatch('app.ts', hunks[0], new Set([2]), false);
    expect(patch).toContain(' const b = 2;');
    expect(patch).toContain('+const b = 20;');
    expect(patch).not.toContain('+const c = 30;');
  });

  it('parses NUL-delimited git log output', () => {
    const out =
      'abcdef1234567890abcdef1234567890abcdef12\x1fabcdef1\x1fInitial commit\x1fBody line\x1fJane\x1fjane@ex.com\x1f2026-01-01T00:00:00Z\x1f\x1fHEAD -> main\0';
    const commits = parseGitLogZ(out);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      shortSha: 'abcdef1',
      summary: 'Initial commit',
      body: 'Body line',
      authorName: 'Jane',
      refs: ['HEAD -> main']
    });
  });

  it('parses branches and stashes', () => {
    const bOut = '*\x1frefs/heads/main\x1fmain\x1forigin/main\x1f2026-01-01T00:00:00Z\x1fabc1234\n';
    expect(parseBranches(bOut)[0]).toMatchObject({
      name: 'main',
      isCurrent: true,
      isRemote: false,
      upstream: 'origin/main'
    });

    const sOut = 'stash@{0}\x1fWIP on main\x1f2026-01-01T00:00:00Z\n';
    expect(parseStashes(sOut)[0]).toMatchObject({
      index: 0,
      ref: 'stash@{0}',
      message: 'WIP on main'
    });
  });
});

describe('GitService end-to-end daily workflow on a temp repo', () => {
  it('supports create, stage, commit, undo, discard-with-backup, branch, and stash', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gld-workflow-'));
    const backupStore = new DiscardBackupStore(path.join(tmpRoot, 'userdata'));
    const git = new GitService(undefined, backupStore);

    try {
      const repoPath = await git.createRepository({
        parentDir: tmpRoot,
        name: 'sample-repo',
        defaultBranch: 'main',
        initReadme: true
      });

      await git.saveRepoSettings({
        repoPath,
        authorName: 'Test Dev',
        authorEmail: 'dev@example.com'
      });

      // First commit
      await git.commit(repoPath, { summary: 'Initial commit', description: 'Hello world' });
      const log1 = await git.getLog(repoPath);
      expect(log1).toHaveLength(1);
      expect(log1[0].summary).toBe('Initial commit');

      // Edit file, stage, commit, then undo
      fs.writeFileSync(path.join(repoPath, 'hello.txt'), 'line 1\nline 2\n', 'utf8');
      await git.stageFile(repoPath, 'hello.txt');
      await git.commit(repoPath, {
        summary: 'Add hello.txt',
        coAuthors: ['Alice <alice@example.com>']
      });
      expect((await git.getLog(repoPath))).toHaveLength(2);

      const undone = await git.undoLastCommit(repoPath);
      expect(undone.summary).toBe('Add hello.txt');
      expect((await git.getLog(repoPath))).toHaveLength(1);

      // Re-commit hello.txt, modify it, then discard and verify backup exists
      await git.commit(repoPath, { summary: 'Add hello.txt' });
      fs.writeFileSync(path.join(repoPath, 'hello.txt'), 'modified content\n', 'utf8');
      const backup = await git.discardFile(repoPath, 'hello.txt', false);
      expect(backup).not.toBeNull();
      expect(fs.readFileSync(backup!.backupPath, 'utf8').replace(/\r\n/g, '\n')).toBe(
        'modified content\n'
      );
      expect(fs.readFileSync(path.join(repoPath, 'hello.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe(
        'line 1\nline 2\n'
      );

      // Branch create, stash push & pop
      await git.createBranch(repoPath, 'feat/demo');
      fs.writeFileSync(path.join(repoPath, 'hello.txt'), 'stashed work\n', 'utf8');
      await git.stashPush(repoPath, 'work in progress');
      expect(await git.stashList(repoPath)).toHaveLength(1);
      await git.stashPop(repoPath);
      expect(fs.readFileSync(path.join(repoPath, 'hello.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe(
        'stashed work\n'
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
