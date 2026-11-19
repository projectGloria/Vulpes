import { useEffect, useState } from 'react';
import { Download, Globe, Link2, Search, X } from 'lucide-react';
import type { CloneProgressEvent } from '@shared/types/git';
import type { GitLabProject } from '@shared/types/gitlab';
import { Avatar } from '@renderer/components/common/Avatar';
import { useAppStore } from '@renderer/store/useAppStore';

export function CloneRepoDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const accounts = useAppStore((s) => s.accounts);
  const reloadRepositories = useAppStore((s) => s.reloadRepositories);

  const [tab, setTab] = useState<'gitlab' | 'url'>('gitlab');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GitLabProject | null>(null);
  const [protocol, setProtocol] = useState<'https' | 'ssh'>('https');
  const [customUrl, setCustomUrl] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [cloning, setCloning] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [progress, setProgress] = useState<CloneProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeDialog !== 'clone-repo') return;
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
    if (accounts.length === 0) {
      setTab('url');
    }
  }, [activeDialog, accounts, selectedAccountId]);

  useEffect(() => {
    if (activeDialog !== 'clone-repo' || tab !== 'gitlab' || !selectedAccountId) return;
    let cancelled = false;
    setLoadingProjects(true);
    const timer = setTimeout(() => {
      void window.gitlabDesktop
        .invoke('gitlab:listProjects', {
          accountId: selectedAccountId,
          search: search.trim() || undefined
        })
        .then((res) => {
          if (cancelled) return;
          setLoadingProjects(false);
          if (res.ok) setProjects(res.data);
          else setError(res.error.message);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeDialog, tab, selectedAccountId, search]);

  useEffect(() => {
    if (!operationId) return;
    return window.gitlabDesktop.on('repo:cloneProgress', (evt) => {
      if (evt.operationId === operationId) {
        setProgress(evt);
      }
    });
  }, [operationId]);

  if (activeDialog !== 'clone-repo') return null;

  const close = (): void => {
    if (cloning && operationId) {
      void window.gitlabDesktop.invoke('repo:cancelOperation', { operationId });
    }
    setCloning(false);
    setProgress(null);
    setError(null);
    setActiveDialog(null);
  };

  const handleBrowse = async (): Promise<void> => {
    const res = await window.gitlabDesktop.invoke('app:pickDirectory', {
      title: 'Choose destination parent folder'
    });
    if (res.ok && res.data.path) {
      setParentDir(res.data.path);
    }
  };

  const resolvedUrl =
    tab === 'gitlab' && selectedProject
      ? protocol === 'ssh'
        ? selectedProject.ssh_url_to_repo
        : selectedProject.http_url_to_repo
      : customUrl.trim();

  const repoFolderName =
    tab === 'gitlab' && selectedProject
      ? selectedProject.path
      : resolvedUrl
          .split(/[/:]/)
          .pop()
          ?.replace(/\.git$/i, '') || 'repository';

  const handleClone = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!resolvedUrl) {
      setError('Select a GitLab project or enter a repository URL.');
      return;
    }
    if (!parentDir.trim()) {
      setError('Please choose a local destination folder.');
      return;
    }

    const opId = `clone-${Date.now()}`;
    setOperationId(opId);
    setCloning(true);
    setError(null);
    setProgress({ operationId: opId, stage: 'Starting clone', percent: null, raw: '' });

    const sep = parentDir.includes('\\') ? '\\' : '/';
    const targetDir = `${parentDir.replace(/[\\/]+$/, '')}${sep}${repoFolderName}`;

    const account = accounts.find((a) => a.id === selectedAccountId);
    const res = await window.gitlabDesktop.invoke('repo:clone', {
      operationId: opId,
      url: resolvedUrl,
      targetDir,
      accountId: tab === 'gitlab' ? selectedAccountId : undefined,
      gitlabProjectId: tab === 'gitlab' ? selectedProject?.id : undefined,
      gitlabProjectPath: tab === 'gitlab' ? selectedProject?.path_with_namespace : undefined,
      gitlabInstanceUrl: tab === 'gitlab' ? account?.instanceUrl : undefined,
      avatarUrl:
        tab === 'gitlab'
          ? (selectedProject?.avatar_url ?? selectedProject?.namespace?.avatar_url ?? null)
          : undefined
    });

    setCloning(false);
    setOperationId(null);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    await reloadRepositories();
    setActiveDialog(null);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clone-title">
      <form className="modal" style={{ width: 580 }} onSubmit={(e) => void handleClone(e)}>
        <div className="modal-header">
          <span id="clone-title">Clone a Repository</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn${tab === 'gitlab' ? ' btn-primary' : ''}`}
              onClick={() => setTab('gitlab')}
              disabled={accounts.length === 0}
            >
              <Globe size={14} />
              GitLab Projects
            </button>
            <button
              type="button"
              className={`btn${tab === 'url' ? ' btn-primary' : ''}`}
              onClick={() => setTab('url')}
            >
              <Link2 size={14} />
              URL
            </button>
          </div>

          {tab === 'gitlab' ? (
            <>
              <div className="field-row">
                <select
                  className="select-input"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  aria-label="GitLab account"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username} ({a.instanceUrl})
                    </option>
                  ))}
                </select>
                <select
                  className="select-input"
                  style={{ maxWidth: 110 }}
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value as 'https' | 'ssh')}
                  aria-label="Clone protocol"
                >
                  <option value="https">HTTPS</option>
                  <option value="ssh">SSH</option>
                </select>
              </div>

              <div className="field-row" style={{ alignItems: 'center' }}>
                <Search size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="search"
                  className="text-input"
                  placeholder="Search personal & group projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6
                }}
              >
                {loadingProjects ? (
                  <div style={{ padding: 14, color: 'var(--text-muted)' }}>Loading projects...</div>
                ) : projects.length === 0 ? (
                  <div style={{ padding: 14, color: 'var(--text-muted)' }}>
                    No projects found.
                  </div>
                ) : (
                  projects.map((p) => {
                    const active = selectedProject?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProject(p)}
                        className={`clone-project-row${active ? ' active' : ''}`}
                      >
                        <Avatar
                          src={p.avatar_url ?? p.namespace?.avatar_url}
                          accountId={selectedAccountId}
                          name={p.name}
                          size={28}
                          shape="rounded"
                        />
                        <div className="clone-project-info">
                          <div style={{ fontWeight: 600 }}>{p.path_with_namespace}</div>
                          {p.description && (
                            <div className="clone-project-desc">{p.description}</div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="clone-url">Repository URL (HTTPS or SSH)</label>
              <input
                id="clone-url"
                type="text"
                className="text-input"
                placeholder="https://gitlab.com/group/project.git or git@gitlab.com:group/project.git"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="clone-parent">Local Parent Folder</label>
            <div className="field-row">
              <input
                id="clone-parent"
                type="text"
                className="text-input"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="Choose where to clone this repository"
              />
              <button type="button" className="btn" onClick={() => void handleBrowse()}>
                Browse...
              </button>
            </div>
          </div>

          {cloning && progress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {progress.stage}
                {progress.percent !== null ? ` (${progress.percent}%)` : '...'}
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--bg-hover)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progress.percent ?? 35}%`,
                    background: 'var(--accent)',
                    transition: 'width 150ms ease'
                  }}
                />
              </div>
            </div>
          )}

          {error && <div className="error-inline">{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            {cloning ? 'Cancel Clone' : 'Cancel'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={cloning}>
            <Download size={14} />
            {cloning ? 'Cloning...' : 'Clone'}
          </button>
        </div>
      </form>
    </div>
  );
}
