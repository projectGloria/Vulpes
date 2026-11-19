import { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Search } from 'lucide-react';
import type { GitLabIssue } from '@shared/types/gitlab';
import { useAppStore } from '@renderer/store/useAppStore';
import { SafeMarkdown } from '../common/SafeMarkdown';

export function slugifyIssueBranch(iid: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${iid}-${slug || 'issue'}`;
}

export function IssuesView(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const projectId = activeRepo?.gitlabProjectId ?? activeRepo?.gitlabProjectPath;

  const [search, setSearch] = useState('');
  const [issues, setIssues] = useState<GitLabIssue[]>([]);
  const [selected, setSelected] = useState<GitLabIssue | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRepo?.accountId || !projectId) return;
    const timer = setTimeout(() => {
      void window.gitlabDesktop
        .invoke('gitlab:listIssues', {
          accountId: activeRepo.accountId!,
          projectId,
          search: search.trim() || undefined
        })
        .then((res) => {
          if (res.ok) {
            setIssues(res.data);
            setSelected((prev) =>
              prev && res.data.some((i) => i.iid === prev.iid) ? prev : (res.data[0] ?? null)
            );
          }
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [activeRepo?.accountId, projectId, search]);

  if (!activeRepo?.accountId || !projectId) {
    return (
      <div className="empty-state">
        <h2>Connect a GitLab account</h2>
        <p>Sign in to GitLab to browse issues and link them to branches.</p>
        <button type="button" className="btn btn-primary" onClick={() => setActiveDialog('accounts')}>
          Manage GitLab Accounts
        </button>
      </div>
    );
  }

  const handleCreateBranch = async (issue: GitLabIssue): Promise<void> => {
    const branchName = slugifyIssueBranch(issue.iid, issue.title);
    const res = await window.gitlabDesktop.invoke('git:createBranch', {
      repoPath: activeRepo.path,
      name: branchName
    });
    if (!res.ok) {
      setFeedback(res.error.message);
      return;
    }
    await refreshStatus();
    setActiveTab('changes');
  };

  return (
    <div className="split-pane">
      <div className="changes-left">
        <div className="changes-list-header" style={{ gap: 6 }}>
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            type="search"
            className="search-input"
            placeholder="Search issues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="changes-file-scroll">
          {issues.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>No open issues found.</div>
          ) : (
            issues.map((issue) => (
              <div
                key={issue.id}
                className={`commit-row${selected?.id === issue.id ? ' active' : ''}`}
                onClick={() => setSelected(issue)}
              >
                <div className="commit-summary">
                  #{issue.iid} {issue.title}
                </div>
                <div className="commit-meta">
                  <span>@{issue.author.username}</span>
                  <span>{issue.labels.slice(0, 2).join(', ')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="changes-right" style={{ overflow: 'auto', padding: 16 }}>
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  #{selected.iid} {selected.title}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Opened by @{selected.author.username}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleCreateBranch(selected)}
                >
                  <GitBranch size={14} /> Create Branch
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void window.gitlabDesktop.invoke('app:openExternal', { url: selected.web_url })
                  }
                >
                  <ExternalLink size={14} /> Open
                </button>
              </div>
            </div>
            {feedback && <div className="error-inline">{feedback}</div>}
            <div
              style={{
                padding: 12,
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                background: 'var(--bg-app)'
              }}
            >
              <SafeMarkdown content={selected.description} />
            </div>
          </div>
        ) : (
          <div className="empty-state">Select an issue to inspect it or create a linked branch.</div>
        )}
      </div>
    </div>
  );
}
