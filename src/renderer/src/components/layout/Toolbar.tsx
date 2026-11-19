import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Command,
  ExternalLink,
  FolderGit2,
  GitBranch,
  RefreshCw,
  SlidersHorizontal,
  Upload,
  UserCircle
} from 'lucide-react';
import type { GitLabPipeline } from '@shared/types/gitlab';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';

export function Toolbar(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const statusLoading = useAppStore((s) => s.statusLoading);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const accounts = useAppStore((s) => s.accounts);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setRecentlyPublishedBranch = useAppStore((s) => s.setRecentlyPublishedBranch);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [latestPipeline, setLatestPipeline] = useState<GitLabPipeline | null>(null);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const branch = repoStatus?.branch;
  const hasRemote = (repoStatus?.remotes.length ?? 0) > 0;
  const projectId = activeRepo?.gitlabProjectId ?? activeRepo?.gitlabProjectPath;

  useEffect(() => {
    if (!activeRepo?.accountId || !projectId || !branch?.name) {
      setLatestPipeline(null);
      return;
    }
    void window.gitlabDesktop
      .invoke('gitlab:listPipelines', {
        accountId: activeRepo.accountId,
        projectId,
        ref: branch.name
      })
      .then((res) => {
        if (res.ok) setLatestPipeline(res.data[0] ?? null);
      });
  }, [activeRepo?.accountId, projectId, branch?.name, branch?.oid]);

  const syncAction = (): 'publish' | 'pull' | 'push' | 'fetch' => {
    if (!branch || !hasRemote) return 'fetch';
    if (!branch.upstream) return 'publish';
    if (branch.behind > 0) return 'pull';
    if (branch.ahead > 0) return 'push';
    return 'fetch';
  };

  const getSyncLabel = (): string => {
    if (syncing) return 'Syncing...';
    const action = syncAction();
    if (action === 'publish') return t('toolbar.publish');
    if (action === 'pull') return `${t('toolbar.pull')} (${branch?.behind ?? 0})`;
    if (action === 'push') return `${t('toolbar.push')} (${branch?.ahead ?? 0})`;
    return t('toolbar.fetch');
  };

  const handleSync = async (): Promise<void> => {
    if (!activeRepo || !hasRemote) {
      await refreshStatus();
      return;
    }
    setSyncing(true);
    setSyncError(null);
    const action = syncAction();
    const res =
      action === 'publish'
        ? await window.gitlabDesktop.invoke('git:push', {
            repoPath: activeRepo.path,
            publish: true,
            branch: branch?.name
          })
        : action === 'push'
          ? await window.gitlabDesktop.invoke('git:push', { repoPath: activeRepo.path })
          : action === 'pull'
            ? await window.gitlabDesktop.invoke('git:pull', { repoPath: activeRepo.path })
            : await window.gitlabDesktop.invoke('git:fetch', { repoPath: activeRepo.path });

    setSyncing(false);
    if (!res.ok) {
      setSyncError(res.error.message);
    } else if (action === 'publish' && branch?.name) {
      setRecentlyPublishedBranch(branch.name);
    }
    await refreshStatus();
  };

  const openOnGitLab = (): void => {
    if (!activeRepo?.gitlabInstanceUrl || !activeRepo.gitlabProjectPath) return;
    const base = `${activeRepo.gitlabInstanceUrl}/${activeRepo.gitlabProjectPath}`;
    const url = branch?.name ? `${base}/-/tree/${encodeURIComponent(branch.name)}` : base;
    void window.gitlabDesktop.invoke('app:openExternal', { url });
  };

  const action = syncAction();

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: 'var(--accent)',
            display: 'inline-block'
          }}
        />
        <span>{t('app.name')}</span>
      </div>

      <button type="button" className="toolbar-item" disabled={!activeRepo}>
        <FolderGit2 size={16} />
        <div>
          <div className="toolbar-item-label">{t('toolbar.currentRepo')}</div>
          <div className="toolbar-item-value">
            {activeRepo ? activeRepo.name : t('toolbar.noRepo')}
          </div>
        </div>
      </button>

      <button
        type="button"
        className="toolbar-item"
        disabled={!activeRepo}
        onClick={() => setActiveDialog('branches')}
      >
        <GitBranch size={16} />
        <div>
          <div className="toolbar-item-label">{t('toolbar.currentBranch')}</div>
          <div className="toolbar-item-value">{branch ? branch.name : '—'}</div>
        </div>
      </button>

      <button
        type="button"
        className="toolbar-item"
        disabled={!activeRepo || statusLoading || syncing}
        onClick={() => void handleSync()}
        title={syncError ?? t('toolbar.refresh')}
      >
        {action === 'publish' ? (
          <Upload size={16} />
        ) : action === 'pull' ? (
          <ArrowDown size={16} />
        ) : action === 'push' ? (
          <ArrowUp size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
        <div>
          <div className="toolbar-item-label" style={syncError ? { color: '#f85149' } : undefined}>
            {syncError ? 'Sync failed' : (repoStatus?.remotes[0]?.name ?? 'local')}
          </div>
          <div className="toolbar-item-value">{getSyncLabel()}</div>
        </div>
      </button>

      <div className="toolbar-spacer" />

      {latestPipeline && (
        <button
          type="button"
          className="toolbar-item"
          style={{ borderRight: 'none', borderLeft: '1px solid var(--border-toolbar)', minWidth: 130 }}
          onClick={() => setActiveTab('pipelines')}
          title={`Latest pipeline #${latestPipeline.id}: ${latestPipeline.status}`}
        >
          <Activity size={16} />
          <div>
            <div className="toolbar-item-label">Pipeline</div>
            <div className="toolbar-item-value">
              <span className={`pipeline-status ${latestPipeline.status}`}>
                {latestPipeline.status}
              </span>
            </div>
          </div>
        </button>
      )}

      {activeRepo?.gitlabInstanceUrl && activeRepo.gitlabProjectPath && (
        <button
          type="button"
          className="toolbar-item"
          style={{ borderRight: 'none', borderLeft: '1px solid var(--border-toolbar)', minWidth: 50 }}
          onClick={openOnGitLab}
          title="Open current branch on GitLab"
          aria-label="Open on GitLab"
        >
          <ExternalLink size={16} />
        </button>
      )}

      <button
        type="button"
        className="toolbar-item"
        style={{ borderRight: 'none', borderLeft: '1px solid var(--border-toolbar)', minWidth: 46 }}
        onClick={() => setActiveDialog('command-palette')}
        title="Command Palette (Ctrl+K)"
        aria-label="Command Palette"
      >
        <Command size={16} />
      </button>

      <button
        type="button"
        className="toolbar-item"
        style={{ borderRight: 'none', borderLeft: '1px solid var(--border-toolbar)', minWidth: 46 }}
        onClick={() => setActiveDialog('preferences')}
        title="Preferences (Ctrl+,)"
        aria-label="Preferences"
      >
        <SlidersHorizontal size={16} />
      </button>

      <button
        type="button"
        className="toolbar-item"
        style={{ borderRight: 'none', borderLeft: '1px solid var(--border-toolbar)', minWidth: 140 }}
        onClick={() => setActiveDialog('accounts')}
      >
        <UserCircle size={17} />
        <div>
          <div className="toolbar-item-label">GitLab</div>
          <div className="toolbar-item-value">
            {accounts.length === 0
              ? 'Sign in'
              : accounts.length === 1
                ? `@${accounts[0].username}`
                : `${accounts.length} accounts`}
          </div>
        </div>
      </button>
    </header>
  );
}
