import { useEffect, useState } from 'react';
import { GitPullRequest, X } from 'lucide-react';
import type { GitLabUser } from '@shared/types/gitlab';
import { useAppStore } from '@renderer/store/useAppStore';

export function CreateMrDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const sourceBranch = repoStatus?.branch.name ?? '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetBranch, setTargetBranch] = useState('main');
  const [labels, setLabels] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [squash, setSquash] = useState(true);
  const [removeSourceBranch, setRemoveSourceBranch] = useState(true);
  const [members, setMembers] = useState<GitLabUser[]>([]);
  const [milestones, setMilestones] = useState<Array<{ id: number; iid: number; title: string }>>(
    []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeDialog !== 'create-mr' || !activeRepo) return;
    setTitle(sourceBranch.replace(/[-_/]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
    setError(null);
    const projectId = activeRepo.gitlabProjectId ?? activeRepo.gitlabProjectPath;
    if (activeRepo.accountId && projectId) {
      void window.gitlabDesktop
        .invoke('gitlab:listProjectMeta', { accountId: activeRepo.accountId, projectId })
        .then((res) => {
          if (res.ok) {
            setMembers(res.data.members);
            setMilestones(res.data.milestones);
          }
        });
    }
  }, [activeDialog, activeRepo, sourceBranch]);

  if (activeDialog !== 'create-mr' || !activeRepo) return null;

  const projectId = activeRepo.gitlabProjectId ?? activeRepo.gitlabProjectPath;
  const close = (): void => setActiveDialog(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!activeRepo.accountId || !projectId) {
      setError('This repository is not linked to a signed-in GitLab account.');
      return;
    }
    if (!title.trim()) {
      setError('Merge request title is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await window.gitlabDesktop.invoke('gitlab:createMr', {
      accountId: activeRepo.accountId,
      projectId,
      sourceBranch,
      targetBranch: targetBranch.trim() || 'main',
      title: title.trim(),
      description: description.trim() || undefined,
      assigneeIds: assigneeId ? [Number(assigneeId)] : undefined,
      reviewerIds: reviewerId ? [Number(reviewerId)] : undefined,
      labels: labels.trim() || undefined,
      milestoneId: milestoneId ? Number(milestoneId) : undefined,
      squash,
      removeSourceBranch
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    setActiveDialog(null);
    setActiveTab('merge-requests');
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-mr-title">
      <form className="modal" style={{ width: 580 }} onSubmit={(e) => void handleSubmit(e)}>
        <div className="modal-header">
          <span id="create-mr-title">Create Merge Request</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <code>{sourceBranch}</code> →{' '}
            <input
              type="text"
              className="text-input"
              style={{ width: 150, padding: '3px 6px' }}
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              aria-label="Target branch"
            />
          </div>

          <div className="field">
            <label htmlFor="mr-title">Title</label>
            <input
              id="mr-title"
              type="text"
              className="text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="mr-desc">Description (Markdown)</label>
            <textarea
              id="mr-desc"
              className="text-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="mr-assignee">Assignee</label>
              <select
                id="mr-assignee"
                className="select-input"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (@{m.username})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="mr-reviewer">Reviewer</label>
              <select
                id="mr-reviewer"
                className="select-input"
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
              >
                <option value="">None</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (@{m.username})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="mr-labels">Labels (comma-separated)</label>
              <input
                id="mr-labels"
                type="text"
                className="text-input"
                placeholder="bug, frontend"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="mr-milestone">Milestone</label>
              <select
                id="mr-milestone"
                className="select-input"
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
              >
                <option value="">None</option>
                {milestones.map((ms) => (
                  <option key={ms.id} value={ms.id}>
                    {ms.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={squash} onChange={(e) => setSquash(e.target.checked)} />
            <span>Squash commits when merge request is accepted</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={removeSourceBranch}
              onChange={(e) => setRemoveSourceBranch(e.target.checked)}
            />
            <span>Delete source branch when merge request is accepted</span>
          </label>

          {error && <div className="error-inline">{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <GitPullRequest size={14} />
            {submitting ? 'Creating...' : 'Create Merge Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
