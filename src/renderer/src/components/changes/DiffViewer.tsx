import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { Columns2, Rows2 } from 'lucide-react';
import type { DiffHunk, DiffLine, FileDiff } from '@shared/types/git';
import { buildPartialPatch } from '@shared/utils/patch';

interface DiffViewerProps {
  diff: FileDiff | null;
  loading?: boolean;
  stagedMode?: boolean;
  readOnly?: boolean;
  onApplyPartial?: (patch: string, reverse: boolean) => Promise<void>;
  onLoadFullDiff?: () => void;
}

function highlightLine(code: string, lang?: string): string {
  if (!code) return '&nbsp;';
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    html: 'xml',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sh: 'bash',
    yml: 'yaml',
    yaml: 'yaml'
  };
  return ext ? map[ext] : undefined;
}

export function DiffViewer({
  diff,
  loading,
  stagedMode = false,
  readOnly = false,
  onApplyPartial,
  onLoadFullDiff
}: DiffViewerProps): React.JSX.Element {
  const [mode, setMode] = useState<'unified' | 'split'>('unified');
  const [selectedLines, setSelectedLines] = useState<Map<number, Set<number>>>(new Map());

  const lang = useMemo(() => (diff ? detectLanguage(diff.path) : undefined), [diff]);

  if (loading) {
    return <div className="empty-state">Loading diff...</div>;
  }

  if (!diff) {
    return (
      <div className="empty-state">
        <p>Select a file to inspect its diff.</p>
      </div>
    );
  }

  if (diff.isImage) {
    return (
      <div className="diff-container">
        <div className="diff-header">
          <span className="diff-filename">{diff.path}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Image diff</span>
        </div>
        <div className="image-diff-grid">
          <div className="image-diff-card">
            <div className="image-diff-label">Previous (HEAD)</div>
            {diff.oldImageDataUrl ? (
              <img src={diff.oldImageDataUrl} alt="Previous version" />
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>No previous image</span>
            )}
          </div>
          <div className="image-diff-card">
            <div className="image-diff-label">Current (Working Tree)</div>
            {diff.newImageDataUrl ? (
              <img src={diff.newImageDataUrl} alt="Current version" />
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Deleted</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (diff.isTooLarge) {
    return (
      <div className="empty-state">
        <h2>Large diff hidden</h2>
        <p>
          This diff is {(diff.byteSize / 1024).toFixed(0)} KB and was hidden to keep the UI fast.
        </p>
        {onLoadFullDiff && (
          <button type="button" className="btn" onClick={onLoadFullDiff}>
            Show full diff anyway
          </button>
        )}
      </div>
    );
  }

  if (diff.isBinary) {
    return (
      <div className="empty-state">
        <h2>Binary file changed</h2>
        <p>{diff.path} is a binary file ({diff.byteSize} bytes).</p>
      </div>
    );
  }

  const toggleLine = (hunkIdx: number, lineIdx: number): void => {
    setSelectedLines((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(hunkIdx) ?? []);
      if (set.has(lineIdx)) set.delete(lineIdx);
      else set.add(lineIdx);
      if (set.size === 0) next.delete(hunkIdx);
      else next.set(hunkIdx, set);
      return next;
    });
  };

  const applyHunk = async (hunk: DiffHunk, hunkIdx: number, onlySelected: boolean): Promise<void> => {
    if (!onApplyPartial) return;
    const chosen = onlySelected ? selectedLines.get(hunkIdx) : undefined;
    const patch = buildPartialPatch(diff.path, hunk, chosen, stagedMode);
    await onApplyPartial(patch, stagedMode);
    setSelectedLines(new Map());
  };

  return (
    <div className="diff-container">
      <div className="diff-header">
        <span className="diff-filename">{diff.path}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className={`icon-btn${mode === 'unified' ? ' active-toggle' : ''}`}
            title="Unified diff"
            onClick={() => setMode('unified')}
          >
            <Rows2 size={14} />
          </button>
          <button
            type="button"
            className={`icon-btn${mode === 'split' ? ' active-toggle' : ''}`}
            title="Split diff"
            onClick={() => setMode('split')}
          >
            <Columns2 size={14} />
          </button>
        </div>
      </div>

      <div className="diff-scroll">
        {diff.hunks.length === 0 ? (
          <div className="empty-state">No textual differences in this view.</div>
        ) : (
          diff.hunks.map((hunk, hunkIdx) => {
            const hunkSelected = selectedLines.get(hunkIdx);
            const hasLineSelection = Boolean(hunkSelected && hunkSelected.size > 0);
            return (
              <div key={`${hunk.header}-${hunkIdx}`} className="diff-hunk">
                <div className="diff-hunk-header">
                  <span>{hunk.header}</span>
                  {!readOnly && onApplyPartial && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {hasLineSelection && (
                        <button
                          type="button"
                          className="btn-xs"
                          onClick={() => void applyHunk(hunk, hunkIdx, true)}
                        >
                          {stagedMode ? 'Unstage Selected Lines' : 'Stage Selected Lines'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-xs"
                        onClick={() => void applyHunk(hunk, hunkIdx, false)}
                      >
                        {stagedMode ? 'Unstage Hunk' : 'Stage Hunk'}
                      </button>
                    </div>
                  )}
                </div>

                {mode === 'unified' ? (
                  <table className="diff-table">
                    <tbody>
                      {hunk.lines.map((line, lineIdx) => {
                        const selectable =
                          !readOnly &&
                          Boolean(onApplyPartial) &&
                          (line.type === 'addition' || line.type === 'deletion');
                        const isPicked = hunkSelected?.has(lineIdx) ?? false;
                        return (
                          <tr
                            key={lineIdx}
                            className={`diff-line ${line.type}${isPicked ? ' line-selected' : ''}`}
                          >
                            <td className="diff-gutter">
                              {selectable ? (
                                <input
                                  type="checkbox"
                                  checked={isPicked}
                                  onChange={() => toggleLine(hunkIdx, lineIdx)}
                                  aria-label="Select line for partial staging"
                                />
                              ) : null}
                            </td>
                            <td className="diff-ln">{line.oldLineNumber ?? ''}</td>
                            <td className="diff-ln">{line.newLineNumber ?? ''}</td>
                            <td className="diff-sign">
                              {line.type === 'addition'
                                ? '+'
                                : line.type === 'deletion'
                                  ? '-'
                                  : ' '}
                            </td>
                            <td
                              className="diff-code"
                              dangerouslySetInnerHTML={{
                                __html: highlightLine(line.content, lang)
                              }}
                            />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <SplitHunkTable lines={hunk.lines} lang={lang} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SplitHunkTable({
  lines,
  lang
}: {
  lines: DiffLine[];
  lang?: string;
}): React.JSX.Element {
  const rows: Array<{ left: DiffLine | null; right: DiffLine | null }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'context' || line.type === 'meta') {
      rows.push({ left: line, right: line });
      i += 1;
    } else if (line.type === 'deletion') {
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'deletion') dels.push(lines[i++]);
      while (i < lines.length && lines[i].type === 'addition') adds.push(lines[i++]);
      const max = Math.max(dels.length, adds.length);
      for (let k = 0; k < max; k += 1) {
        rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
      }
    } else {
      rows.push({ left: null, right: line });
      i += 1;
    }
  }

  return (
    <table className="diff-table split">
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            <td className={`diff-ln ${row.left?.type ?? ''}`}>{row.left?.oldLineNumber ?? ''}</td>
            <td
              className={`diff-code ${row.left?.type ?? ''}`}
              dangerouslySetInnerHTML={{
                __html: row.left ? highlightLine(row.left.content, lang) : '&nbsp;'
              }}
            />
            <td className={`diff-ln ${row.right?.type ?? ''}`}>{row.right?.newLineNumber ?? ''}</td>
            <td
              className={`diff-code ${row.right?.type ?? ''}`}
              dangerouslySetInnerHTML={{
                __html: row.right ? highlightLine(row.right.content, lang) : '&nbsp;'
              }}
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
