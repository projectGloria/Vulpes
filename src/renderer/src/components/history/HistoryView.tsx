import { useEffect, useState } from 'react';
import { GitBranch, GitCommitHorizontal, RotateCcw, Search, Sparkles } from 'lucide-react';
import type { CommitInfo, FileDiff } from '@shared/types/git';
import { useAppStore } from '@renderer/store/useAppStore';
import { DiffViewer } from '../changes/DiffViewer';

export function HistoryView(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;

  const [search, setSearch] = useState('');
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitFiles, setCommitFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRepo) return;
    const timer = setTimeout(() => {
      void window.gitlabDesktop
        .invoke('git:getLog', {
          repoPath: activeRepo.path,
          search: search.trim() || undefined,
          limit: 100
        })
        .then((res) => {
          if (res.ok) {
            setCommits(res.data);
            setSelectedCommit((prev) =>
              prev && res.data.some((c) => c.sha === prev.sha) ? prev : (res.data[0] ?? null)
            );
          }
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [activeRepo, search]);

  useEffect(() => {
    if (!activeRepo || !selectedCommit) {
      setCommitFiles([]);
      setSelectedFile(null);
      setDiff(null);
      return;
    }
    void window.gitlabDesktop
      .invoke('git:getCommitFiles', { repoPath: activeRepo.path, sha: selectedCommit.sha })
      .then((res) => {
        if (res.ok) {
          setCommitFiles(res.data);
          setSelectedFile(res.data[0] ?? null);
        }
      });
  }, [activeRepo, selectedCommit]);

  useEffect(() => {
    if (!activeRepo || !selectedCommit || !selectedFile) {
      setDiff(null);
      return;
    }
    void window.gitlabDesktop
      .invoke('git:getCommitFileDiff', {
        repoPath: activeRepo.path,
        sha: selectedCommit.sha,
        filePath: selectedFile
      })
      .then((res) => {
        if (res.ok) setDiff(res.data);
      });
  }, [activeRepo, selectedCommit, selectedFile]);

  if (!activeRepo) return <div />;

  const handleCreateBranchFromCommit = async (): Promise<void> => {
    if (!selectedCommit) return;
    const name = window.prompt(
      `New branch name from ${selectedCommit.shortSha}:`,
      `branch-${selectedCommit.shortSha}`
    );
    if (!name?.trim()) return;
    const res = await window.gitlabDesktop.invoke('git:createBranch', {
      repoPath: activeRepo.path,
      name: name.trim(),
      startPoint: selectedCommit.sha
    });
    if (res.ok) {
      setFeedback(`Created and switched to branch "${name.trim()}"`);
      await refreshStatus();
    } else {
      setFeedback(res.error.message);
    }
  };

  return (
    <div className="split-pane">
      <div className="changes-left">
        <div className="changes-list-header" style={{ gap: 6 }}>
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            type="search"
            className="search-input"
            placeholder="Search commits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="changes-file-scroll">
          {commits.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
              No commits yet
            </div>
          ) : (
            commits.map((c) => (
              <div
                key={c.sha}
                className={`commit-row${selectedCommit?.sha === c.sha ? ' active' : ''}`}
                onClick={() => setSelectedCommit(c)}
              >
                <div className="commit-summary">{c.summary}</div>
                <div className="commit-meta">
                  <span>{c.authorName}</span>
                  <span>{c.shortSha}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="changes-right">
        {selectedCommit ? (
          <>
            <div className="commit-detail-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedCommit.summary}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    <GitCommitHorizontal size={13} style={{ verticalAlign: 'middle' }} />{' '}
                    <code>{selectedCommit.shortSha}</code> · {selectedCommit.authorName} (
                    {selectedCommit.authorEmail}) ·{' '}
                    {new Date(selectedCommit.authorDate).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={async () => {
                      const res = await window.gitlabDesktop.invoke('git:cherryPick', {
                        repoPath: activeRepo.path,
                        sha: selectedCommit.sha
                      });
                      setFeedback(res.ok ? `Cherry-picked ${selectedCommit.shortSha}` : res.error.message);
                      await refreshStatus();
                    }}
                  >
                    <Sparkles size={12} /> Cherry-pick
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={async () => {
                      const res = await window.gitlabDesktop.invoke('git:revertCommit', {
                        repoPath: activeRepo.path,
                        sha: selectedCommit.sha
                      });
                      setFeedback(res.ok ? `Reverted ${selectedCommit.shortSha}` : res.error.message);
                      await refreshStatus();
                    }}
                  >
                    <RotateCcw size={12} /> Revert
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() => void handleCreateBranchFromCommit()}
                  >
                    <GitBranch size={12} /> Branch
                  </button>
                </div>
              </div>
              {selectedCommit.body && (
                <pre className="commit-body-pre">{selectedCommit.body}</pre>
              )}
              {feedback && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--accent)' }}>{feedback}</div>
              )}
              {commitFiles.length > 0 && (
                <div className="commit-file-chips">
                  {commitFiles.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`btn-xs${selectedFile === f ? ' active' : ''}`}
                      onClick={() => setSelectedFile(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <DiffViewer diff={diff} readOnly />
          </>
        ) : (
          <div className="empty-state">Select a commit to inspect its changes.</div>
        )}
      </div>
    </div>
  );
}
