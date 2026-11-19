import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  RotateCcw,
  Trash2,
  Undo2
} from 'lucide-react';
import type { FileChange, FileDiff } from '@shared/types/git';
import { useAppStore } from '@renderer/store/useAppStore';
import { DiffViewer } from './DiffViewer';

export function ChangesView(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const files = repoStatus?.files ?? [];

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffStagedMode, setDiffStagedMode] = useState(false);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [coAuthorsText, setCoAuthorsText] = useState('');
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentFileObj: FileChange | undefined = files.find((f) => f.path === selectedFile);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFile(null);
      setDiff(null);
      return;
    }
    if (!selectedFile || !files.some((f) => f.path === selectedFile)) {
      setSelectedFile(files[0].path);
    }
  }, [files, selectedFile]);

  const loadDiff = async (file: FileChange, staged: boolean, showFull = false): Promise<void> => {
    if (!activeRepo) return;
    setDiffLoading(true);
    const res = await window.gitlabDesktop.invoke('git:getFileDiff', {
      repoPath: activeRepo.path,
      filePath: file.path,
      staged,
      untracked: file.kind === 'untracked',
      showFull
    });
    setDiffLoading(false);
    if (res.ok) setDiff(res.data);
  };

  useEffect(() => {
    if (!currentFileObj) return;
    const preferStaged = currentFileObj.staged && !currentFileObj.unstaged ? true : diffStagedMode;
    if (preferStaged !== diffStagedMode && !currentFileObj.unstaged) {
      setDiffStagedMode(true);
    }
    void loadDiff(currentFileObj, preferStaged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFileObj?.path, currentFileObj?.staged, currentFileObj?.unstaged, diffStagedMode]);

  if (!activeRepo || !repoStatus) return <div />;

  const stagedCount = files.filter((f) => f.staged).length;
  const allStaged = files.length > 0 && files.every((f) => f.staged);

  const handleToggleStage = async (file: FileChange): Promise<void> => {
    setError(null);
    if (file.staged && !file.unstaged) {
      await window.gitlabDesktop.invoke('git:unstageFile', {
        repoPath: activeRepo.path,
        filePath: file.path
      });
    } else {
      await window.gitlabDesktop.invoke('git:stageFile', {
        repoPath: activeRepo.path,
        filePath: file.path
      });
    }
    await refreshStatus();
  };

  const handleToggleAll = async (): Promise<void> => {
    if (allStaged) {
      await window.gitlabDesktop.invoke('git:unstageAll', { repoPath: activeRepo.path });
    } else {
      await window.gitlabDesktop.invoke('git:stageAll', { repoPath: activeRepo.path });
    }
    await refreshStatus();
  };

  const handleDiscard = async (file: FileChange): Promise<void> => {
    const confirmed = window.confirm(
      `Discard all local changes in "${file.path}"?\n\nA recoverable backup will be saved automatically.`
    );
    if (!confirmed) return;
    const res = await window.gitlabDesktop.invoke('git:discardFile', {
      repoPath: activeRepo.path,
      filePath: file.path,
      untracked: file.kind === 'untracked'
    });
    if (res.ok) {
      setMessage(
        res.data
          ? `Discarded ${file.path} (backup saved to ${res.data.backupPath})`
          : `Discarded ${file.path}`
      );
      await refreshStatus();
    } else {
      setError(res.error.message);
    }
  };

  const handleCommit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!summary.trim()) {
      setError('Commit summary is required.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);

    // If nothing is staged yet, stage all (GitHub Desktop default ergonomics)
    if (stagedCount === 0 && !amend && files.length > 0) {
      await window.gitlabDesktop.invoke('git:stageAll', { repoPath: activeRepo.path });
    }

    const coAuthors = coAuthorsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Auto-reference linked GitLab issue when branch starts with "<issueId>-"
    const issueMatch = /^(\d+)-/.exec(repoStatus.branch.name);
    let finalDescription = description.trim();
    if (issueMatch && !finalDescription.includes(`#${issueMatch[1]}`) && !summary.includes(`#${issueMatch[1]}`)) {
      finalDescription = finalDescription
        ? `${finalDescription}\n\nRefs #${issueMatch[1]}`
        : `Refs #${issueMatch[1]}`;
    }

    const res = await window.gitlabDesktop.invoke('git:commit', {
      repoPath: activeRepo.path,
      summary: summary.trim(),
      description: finalDescription || undefined,
      coAuthors: coAuthors.length > 0 ? coAuthors : undefined,
      amend
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    setSummary('');
    setDescription('');
    setCoAuthorsText('');
    setAmend(false);
    setMessage('Commit created.');
    await refreshStatus();
  };

  const handleUndoLastCommit = async (): Promise<void> => {
    const res = await window.gitlabDesktop.invoke('git:undoLastCommit', {
      repoPath: activeRepo.path
    });
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSummary(res.data.summary);
    setDescription(res.data.body);
    setMessage('Undid last commit (changes kept staged).');
    await refreshStatus();
  };

  const handleResolveConflict = async (
    filePath: string,
    strategy: 'ours' | 'theirs' | 'mark-resolved'
  ): Promise<void> => {
    const res = await window.gitlabDesktop.invoke('git:resolveConflict', {
      repoPath: activeRepo.path,
      filePath,
      strategy
    });
    if (!res.ok) setError(res.error.message);
    await refreshStatus();
  };

  const conflictMode: 'merge' | 'rebase' | null = repoStatus.isRebasing
    ? 'rebase'
    : repoStatus.isMerging
      ? 'merge'
      : null;

  return (
    <div className="split-pane">
      <div className="changes-left">
        <div className="changes-list-header">
          <label className="checkbox-row" style={{ fontWeight: 600, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={allStaged}
              disabled={files.length === 0}
              onChange={() => void handleToggleAll()}
            />
            <span>
              {files.length} changed {files.length === 1 ? 'file' : 'files'}
            </span>
          </label>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {stagedCount} staged
          </span>
        </div>

        <div className="changes-file-scroll">
          {files.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
              Working tree clean
            </div>
          ) : (
            files.map((file) => {
              const isSelected = file.path === selectedFile;
              return (
                <div
                  key={file.path}
                  className={`change-row${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedFile(file.path)}
                >
                  <input
                    type="checkbox"
                    checked={file.staged}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => void handleToggleStage(file)}
                    aria-label={`Stage ${file.path}`}
                  />
                  <span className="change-path" title={file.path}>
                    {file.path}
                  </span>
                  <span className={`status-pill ${file.kind}`}>{file.kind[0].toUpperCase()}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Discard changes"
                    aria-label={`Discard ${file.path}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDiscard(file);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <form className="commit-box" onSubmit={(e) => void handleCommit(e)}>
          <input
            type="text"
            className="text-input"
            placeholder="Summary (required)"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            aria-label="Commit summary"
          />
          <textarea
            className="text-input"
            rows={3}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ resize: 'vertical' }}
            aria-label="Commit description"
          />
          <input
            type="text"
            className="text-input"
            placeholder="Co-author: Name <email@example.com>"
            value={coAuthorsText}
            onChange={(e) => setCoAuthorsText(e.target.value)}
            aria-label="Co-authors"
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="checkbox-row" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={amend}
                onChange={(e) => setAmend(e.target.checked)}
              />
              <span>Amend last commit</span>
            </label>
            <button
              type="button"
              className="btn-xs"
              onClick={() => void handleUndoLastCommit()}
              disabled={repoStatus.branch.unborn}
              title="Soft reset HEAD~1 and keep changes staged"
            >
              <Undo2 size={12} /> Undo last
            </button>
          </div>
          {error && <div className="error-inline">{error}</div>}
          {message && <div style={{ fontSize: 11, color: 'var(--success)' }}>{message}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ justifyContent: 'center' }}
            disabled={busy || (files.length === 0 && !amend) || repoStatus.hasConflicts}
          >
            <Check size={14} />
            {amend ? 'Amend commit' : `Commit to ${repoStatus.branch.name}`}
          </button>
        </form>
      </div>

      <div className="changes-right">
        {(conflictMode || repoStatus.hasConflicts) && (
          <div className="conflict-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <strong>
                {conflictMode === 'rebase' ? 'Rebase in progress' : 'Merge conflict detected'}
              </strong>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {currentFileObj?.conflicted && (
                <>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() => void handleResolveConflict(currentFileObj.path, 'ours')}
                  >
                    Use Ours
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() => void handleResolveConflict(currentFileObj.path, 'theirs')}
                  >
                    Use Theirs
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() =>
                      void window.gitlabDesktop.invoke('app:openInEditor', {
                        repoPath: activeRepo.path,
                        filePath: currentFileObj.path
                      })
                    }
                  >
                    <ExternalLink size={11} /> Open Editor
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() => void handleResolveConflict(currentFileObj.path, 'mark-resolved')}
                  >
                    Mark Resolved
                  </button>
                </>
              )}
              {conflictMode && !repoStatus.hasConflicts && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={async () => {
                    const res = await window.gitlabDesktop.invoke('git:continueOperation', {
                      repoPath: activeRepo.path,
                      mode: conflictMode
                    });
                    if (!res.ok) setError(res.error.message);
                    await refreshStatus();
                  }}
                >
                  Continue {conflictMode}
                </button>
              )}
              {conflictMode && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={async () => {
                    await window.gitlabDesktop.invoke('git:abortOperation', {
                      repoPath: activeRepo.path,
                      mode: conflictMode
                    });
                    await refreshStatus();
                  }}
                >
                  <RotateCcw size={12} /> Abort {conflictMode}
                </button>
              )}
            </div>
          </div>
        )}

        {currentFileObj && currentFileObj.staged && currentFileObj.unstaged && (
          <div className="diff-mode-bar">
            <button
              type="button"
              className={`btn-xs${!diffStagedMode ? ' active' : ''}`}
              onClick={() => setDiffStagedMode(false)}
            >
              Unstaged changes
            </button>
            <button
              type="button"
              className={`btn-xs${diffStagedMode ? ' active' : ''}`}
              onClick={() => setDiffStagedMode(true)}
            >
              Staged changes
            </button>
          </div>
        )}

        <DiffViewer
          diff={diff}
          loading={diffLoading}
          stagedMode={diffStagedMode}
          onLoadFullDiff={
            currentFileObj ? () => void loadDiff(currentFileObj, diffStagedMode, true) : undefined
          }
          onApplyPartial={async (patch, reverse) => {
            const res = await window.gitlabDesktop.invoke('git:applyPartialPatch', {
              repoPath: activeRepo.path,
              patch,
              reverse
            });
            if (!res.ok) {
              setError(res.error.message);
              return;
            }
            await refreshStatus();
          }}
        />
      </div>
    </div>
  );
}
