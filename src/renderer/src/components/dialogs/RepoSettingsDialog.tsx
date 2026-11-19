import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { RepoSettings } from '@shared/types/git';
import { useAppStore } from '@renderer/store/useAppStore';

export function RepoSettingsDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;

  const [tab, setTab] = useState<'remotes' | 'identity' | 'gitignore'>('remotes');
  const [settings, setSettings] = useState<RepoSettings | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [gitignore, setGitignore] = useState('');
  const [newRemoteName, setNewRemoteName] = useState('');
  const [newRemoteUrl, setNewRemoteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeDialog !== 'repo-settings' || !activeRepo) return;
    setError(null);
    void window.gitlabDesktop
      .invoke('repo:getSettings', { repoPath: activeRepo.path })
      .then((res) => {
        if (res.ok) {
          setSettings(res.data);
          setAuthorName(res.data.authorName);
          setAuthorEmail(res.data.authorEmail);
          setGitignore(res.data.gitignore);
        } else {
          setError(res.error.message);
        }
      });
  }, [activeDialog, activeRepo]);

  if (activeDialog !== 'repo-settings' || !activeRepo) return null;

  const close = (): void => setActiveDialog(null);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const res = await window.gitlabDesktop.invoke('repo:saveSettings', {
      repoPath: activeRepo.path,
      authorName,
      authorEmail,
      gitignore
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSettings(res.data);
    await refreshStatus();
    close();
  };

  const handleAddRemote = async (): Promise<void> => {
    if (!newRemoteName.trim() || !newRemoteUrl.trim()) return;
    setError(null);
    const res = await window.gitlabDesktop.invoke('repo:saveSettings', {
      repoPath: activeRepo.path,
      addRemote: { name: newRemoteName.trim(), url: newRemoteUrl.trim() }
    });
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSettings(res.data);
    setNewRemoteName('');
    setNewRemoteUrl('');
    await refreshStatus();
  };

  const handleRemoveRemote = async (name: string): Promise<void> => {
    const res = await window.gitlabDesktop.invoke('repo:saveSettings', {
      repoPath: activeRepo.path,
      removeRemote: name
    });
    if (res.ok) {
      setSettings(res.data);
      await refreshStatus();
    } else {
      setError(res.error.message);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repo-settings-title"
    >
      <div className="modal" style={{ width: 580 }}>
        <div className="modal-header">
          <span id="repo-settings-title">Repository Settings — {activeRepo.name}</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn${tab === 'remotes' ? ' btn-primary' : ''}`}
              onClick={() => setTab('remotes')}
            >
              Remotes
            </button>
            <button
              type="button"
              className={`btn${tab === 'identity' ? ' btn-primary' : ''}`}
              onClick={() => setTab('identity')}
            >
              Git Identity
            </button>
            <button
              type="button"
              className={`btn${tab === 'gitignore' ? ' btn-primary' : ''}`}
              onClick={() => setTab('gitignore')}
            >
              Ignored Files (.gitignore)
            </button>
          </div>

          {!settings ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading settings...</div>
          ) : tab === 'remotes' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Default branch: <strong>{settings.defaultBranch}</strong>
                {activeRepo.gitlabProjectPath && (
                  <>
                    {' · '}GitLab: <strong>{activeRepo.gitlabProjectPath}</strong>
                  </>
                )}
              </div>

              {settings.remotes.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No remotes configured.</div>
              ) : (
                settings.remotes.map((r) => (
                  <div
                    key={r.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '8px 10px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {r.fetchUrl}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void handleRemoveRemote(r.name)}
                      title={`Remove remote ${r.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}

              <div className="field-row">
                <input
                  type="text"
                  className="text-input"
                  style={{ maxWidth: 120 }}
                  placeholder="origin"
                  value={newRemoteName}
                  onChange={(e) => setNewRemoteName(e.target.value)}
                />
                <input
                  type="text"
                  className="text-input"
                  placeholder="https://gitlab.com/group/repo.git"
                  value={newRemoteUrl}
                  onChange={(e) => setNewRemoteUrl(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => void handleAddRemote()}>
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>
          ) : tab === 'identity' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field">
                <label htmlFor="repo-author-name">Author Name (local repo override)</label>
                <input
                  id="repo-author-name"
                  type="text"
                  className="text-input"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="field">
                <label htmlFor="repo-author-email">Author Email (local repo override)</label>
                <input
                  id="repo-author-email"
                  type="email"
                  className="text-input"
                  value={authorEmail}
                  onChange={(e) => setAuthorEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="repo-gitignore">.gitignore</label>
              <textarea
                id="repo-gitignore"
                className="text-input"
                rows={10}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
                value={gitignore}
                onChange={(e) => setGitignore(e.target.value)}
              />
            </div>
          )}

          {error && <div className="error-inline">{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
