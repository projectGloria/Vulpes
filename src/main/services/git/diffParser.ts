import type { BranchInfo, CommitInfo, DiffHunk, DiffLine, StashEntry } from '@shared/types/git';

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parses a unified diff patch into structured hunks and numbered lines.
 */
export function parseUnifiedDiff(rawPatch: string): DiffHunk[] {
  if (!rawPatch.trim()) return [];
  const lines = rawPatch.split(/\r?\n/);
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const match = HUNK_HEADER_RE.exec(line);
    if (match) {
      oldLine = Number.parseInt(match[1], 10);
      const oldLines = match[2] !== undefined ? Number.parseInt(match[2], 10) : 1;
      newLine = Number.parseInt(match[3], 10);
      const newLines = match[4] !== undefined ? Number.parseInt(match[4], 10) : 1;
      current = {
        header: line,
        oldStart: oldLine,
        oldLines,
        newStart: newLine,
        newLines,
        lines: []
      };
      hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.lines.push({
        type: 'addition',
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine++
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.lines.push({
        type: 'deletion',
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: null
      });
    } else if (line.startsWith(' ')) {
      current.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++
      });
    } else if (line.startsWith('\\ No newline')) {
      current.lines.push({
        type: 'meta',
        content: line,
        oldLineNumber: null,
        newLineNumber: null
      });
    }
  }

  return hunks;
}

/**
 * Builds a valid single-hunk or selected-lines unified patch suitable for `git apply --cached`.
 */
export function buildPartialPatch(
  filePath: string,
  hunk: DiffHunk,
  selectedLineIndices?: Set<number>,
  reverse = false
): string {
  const patchLines: string[] = [];
  let oldCount = 0;
  let newCount = 0;

  hunk.lines.forEach((line: DiffLine, idx: number) => {
    const isSelected = !selectedLineIndices || selectedLineIndices.has(idx);

    if (line.type === 'context') {
      patchLines.push(` ${line.content}`);
      oldCount += 1;
      newCount += 1;
    } else if (line.type === 'addition') {
      if (isSelected) {
        patchLines.push(`+${line.content}`);
        newCount += 1;
      } else if (reverse) {
        // When unstaging, an unselected addition remains as context
        patchLines.push(` ${line.content}`);
        oldCount += 1;
        newCount += 1;
      }
    } else if (line.type === 'deletion') {
      if (isSelected) {
        patchLines.push(`-${line.content}`);
        oldCount += 1;
      } else if (!reverse) {
        // When staging, an unselected deletion stays as context
        patchLines.push(` ${line.content}`);
        oldCount += 1;
        newCount += 1;
      }
    }
  });

  const normalized = filePath.replace(/\\/g, '/');
  return [
    `diff --git a/${normalized} b/${normalized}`,
    `--- a/${normalized}`,
    `+++ b/${normalized}`,
    `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`,
    ...patchLines,
    ''
  ].join('\n');
}

/**
 * Parses NUL-delimited `git log` output formatted with:
 * %H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x00
 */
export function parseGitLogZ(stdout: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  const records = stdout.split('\0');
  for (const record of records) {
    const trimmed = record.replace(/^\n+/, '');
    if (!trimmed) continue;
    const fields = trimmed.split('\x1f');
    if (fields.length < 9) continue;
    const [sha, shortSha, summary, body, authorName, authorEmail, authorDate, parentsRaw, refsRaw] =
      fields;
    commits.push({
      sha,
      shortSha,
      summary,
      body: body.trim(),
      authorName,
      authorEmail,
      authorDate,
      parents: parentsRaw.trim() ? parentsRaw.trim().split(' ') : [],
      refs: refsRaw.trim()
        ? refsRaw
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : []
    });
  }
  return commits;
}

/**
 * Parses `git for-each-ref` branch listing formatted with:
 * %(HEAD)%x1f%(refname)%x1f%(refname:short)%x1f%(upstream:short)%x1f%(committerdate:iso-strict)%x1f%(objectname:short)
 */
export function parseBranches(stdout: string): BranchInfo[] {
  const branches: BranchInfo[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [headMark, fullRef, shortName, upstream, date, sha] = line.split('\x1f');
    if (!shortName || shortName.endsWith('/HEAD')) continue;
    branches.push({
      name: shortName,
      isCurrent: headMark === '*',
      isRemote: fullRef.startsWith('refs/remotes/'),
      upstream: upstream || null,
      lastCommitDate: date || '',
      lastCommitSha: sha || ''
    });
  }
  return branches;
}

/**
 * Parses `git stash list --format=%gd%x1f%gs%x1f%aI`
 */
export function parseStashes(stdout: string): StashEntry[] {
  const entries: StashEntry[] = [];
  let idx = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [ref, message, date] = line.split('\x1f');
    entries.push({
      index: idx++,
      ref: ref || `stash@{${idx - 1}}`,
      message: message || '',
      date: date || ''
    });
  }
  return entries;
}
