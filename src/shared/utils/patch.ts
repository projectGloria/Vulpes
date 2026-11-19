import type { DiffHunk, DiffLine } from '../types/git';

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
        patchLines.push(` ${line.content}`);
        oldCount += 1;
        newCount += 1;
      }
    } else if (line.type === 'deletion') {
      if (isSelected) {
        patchLines.push(`-${line.content}`);
        oldCount += 1;
      } else if (!reverse) {
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
