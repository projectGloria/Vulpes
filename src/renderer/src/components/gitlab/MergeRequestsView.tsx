import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, MessageSquare, Plus } from 'lucide-react';
import type { GitLabMergeRequest, GitLabUser } from '@shared/types/gitlab';
import { useAppStore } from '@renderer/store/useAppStore';
import { SafeMarkdown } from '../common/SafeMarkdown';

type MrFilter = 'opened_by_me' | 'assigned_to_me' | 'review_requested' | 'all';

export function MergeRequestsView(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const projectId = activeRepo?.gitlabProjectId ?? activeRepo?.gitlabProjectPath;

  const [filter, setFilter] = useState<MrFilter>('all');
  const [mrs, setMrs] = useState<GitLabMergeRequest[]>([]);
  const [selected, setSelected] = useState<GitLabMergeRequest | null>(null);
  const [details, setDetails] = useState<{
    approvals: { approved: boolean; approvals_left: number; approved_by: Array<{ user: GitLabUser }> };
    notes: Array<{ id: number; body: string; author: GitLabUser; created_at: string; system: boolean }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRepo?.accountId || !projectId) return;
    setLoading(true);
    setError(null);
    void window.gitlabDesktop
      .invoke('gitlab:listMrs', { accountId: activeRepo.accountId, projectId, filter })
      .then((res) => {
        setLoading(false);
        if (res.ok) {
          setMrs(res.data);
          setSelected((prev) =>
            prev && res.data.some((m) => m.iid === prev.iid) ? prev : (res.data[0] ?? null)
          );
        } else {
          setError(res.error.message);
        }
      });
  }, [activeRepo?.accountId, projectId, filter]);

  useEffect(() => {
    if (!activeRepo?.accountId || !projectId || !selected) {
      setDetails(null);
      return;
    }
    void window.gitlabDesktop
      .invoke('gitlab:getMrDetails', {
        accountId: activeRepo.accountId,
        projectId,
        mrIid: selected.iid
      })
      .then((res) => {
        if (res.ok) setDetails(res.data);
      });
  }, [activeRepo?.accountId, projectId, selected]);

  if (!activeRepo?.accountId || !projectId) {
    return (
      <div className="empty-state">
        <h2>Connect a GitLab account</h2>
        <p>Sign in to GitLab to view and create Merge Requests for this repository.</p>
        <button type="button" className="btn btn-primary" onClick={() => setActiveDialog('accounts')}>
          Manage GitLab Accounts
        </button>
      </div>
    );
  }

  return (
    <div className="split-pane">
      <div className="changes-left">
        <div className="changes-list-header" style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}>Merge Requests</strong>
            <button
              type="button"
              className="btn-xs"
              onClick={() => setActiveDialog('create-mr')}
            >
              <Plus size={12} /> New MR
            </button>
          </div>
          <select
            className="select-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as MrFilter)}
            aria-label="Filter merge requests"
          >
            <option value="all">All open</option>
            <option value="opened_by_me">Opened by me</option>
            <option value="assigned_to_me">Assigned to me</option>
            <option value="review_requested">Review requested</option>
          </select>
        </div>

        <div className="changes-file-scroll">
          {loading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading merge requests...</div>
          ) : error ? (
            <div style={{ padding: 16 }} className="error-inline">
              {error}
            </div>
          ) : mrs.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>No merge requests found.</div>
          ) : (
            mrs.map((mr) => (
              <div
                key={mr.id}
                className={`commit-row${selected?.id === mr.id ? ' active' : ''}`}
                onClick={() => setSelected(mr)}
              >
                <div className="commit-summary">
                  !{mr.iid} {mr.title}
                </div>
                <div className="commit-meta">
                  <span>
                    {mr.source_branch} → {mr.target_branch}
                  </span>
                  <span>@{mr.author.username}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="changes-right" style={{ overflow: 'auto', padding: 16 }}>
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  !{selected.iid} {selected.title}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  <code>{selected.source_branch}</code> → <code>{selected.target_branch}</code> ·
                  Opened by @{selected.author.username}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void window.gitlabDesktop.invoke('app:openExternal', { url: selected.web_url })
                }
              >
                <ExternalLink size={14} /> Open on GitLab
              </button>
            </div>

            {details && (
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={14} color={details.approvals.approved ? 'var(--success)' : undefined} />
                  {details.approvals.approved
                    ? 'Approved'
                    : `${details.approvals.approved_by.length} approvals`}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MessageSquare size={14} />
                  {details.notes.filter((n) => !n.system).length} comments
                </span>
              </div>
            )}

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

            {details && details.notes.filter((n) => !n.system).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <strong style={{ fontSize: 12 }}>Discussions</strong>
                {details.notes
                  .filter((n) => !n.system)
                  .map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: 10,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <strong>@{note.author.username}</strong> ·{' '}
                        {new Date(note.created_at).toLocaleString()}
                      </div>
                      <SafeMarkdown content={note.body} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">Select a merge request to view details.</div>
        )}
      </div>
    </div>
  );
}
