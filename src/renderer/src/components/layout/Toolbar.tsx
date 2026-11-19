import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Command,
  Copy,
  ExternalLink,
  GitBranch,
  Minus,
  RefreshCw,
  SlidersHorizontal,
  Square,
  Upload,
  UserCircle,
  X
} from 'lucide-react';
import type { GitLabPipeline } from '@shared/types/gitlab';
import vulpesLogo from '@renderer/assets/vulpes.png';
import { Avatar } from '@renderer/components/common/Avatar';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';

export function Toolbar(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const accounts = useAppStore((s) => s.accounts);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setRecentlyPublishedBranch = useAppStore((s) => s.setRecentlyPublishedBranch);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [latestPipeline, setLatestPipeline] = useState<GitLabPipeline | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const branch = repoStatus?.branch;
  const hasRemote = (repoStatus?.remotes.length ?? 0) > 0;
  const projectId = activeRepo?.gitlabProjectId ?? activeRepo?.gitlabProjectPath;
  const primaryAccount =
    (activeRepo?.accountId ? accounts.find((a) => a.id === activeRepo.accountId) : null) ??
    accounts[0] ??
    null;

  useEffect(() => {
    void window.gitlabDesktop.invoke('window:isMaximized').then((res) => {
      if (res.ok) setIsMaximized(res.data.maximized);
    });
    return window.gitlabDesktop.on('window:maximizedChanged', ({ maximized }) => {
      setIsMaximized(maximized);
    });
  }, []);

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
    const action = syncAction();
    if (syncing) {
      if (action === 'publish') return 'Publishing...';
      if (action === 'pull') return 'Pulling...';
      if (action === 'push') return 'Pushing...';
      return 'Fetching...';
    }
    if (action === 'publish') return t('toolbar.publish');
    if (action === 'pull') return `${t('toolbar.pull')} (${branch?.behind ?? 0})`;
    if (action === 'push') return `${t('toolbar.push')} (${branch?.ahead ?? 0})`;
    return t('toolbar.fetch');
  };

  const handleSync = async (): Promise<void> => {
    if (!activeRepo || syncing) return;
    if (!hasRemote) {
      await refreshStatus(true);
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
    await refreshStatus(true);
  };

  const openOnGitLab = (): void => {
    if (!activeRepo?.gitlabInstanceUrl || !activeRepo.gitlabProjectPath) return;
    const base = `${activeRepo.gitlabInstanceUrl}/${activeRepo.gitlabProjectPath}`;
    const url = branch?.name ? `${base}/-/tree/${encodeURIComponent(branch.name)}` : base;
    void window.gitlabDesktop.invoke('app:openExternal', { url });
  };

  const action = syncAction();

  return (
    <header className="toolbar titlebar-drag">
      <div className="toolbar-brand">
        <img src={vulpesLogo} alt="Vulpes" className="brand-logo" draggable={false} />
        <span className="brand-name">{t('app.name')}</span>
      </div>

      <div className="toolbar-controls titlebar-no-drag">
        <button
          type="button"
          className="toolbar-pill"
          disabled={!activeRepo}
          onClick={() => setActiveDialog('repo-settings')}
          title={activeRepo ? activeRepo.path : t('toolbar.noRepo')}
        >
          {activeRepo ? (
            <Avatar
              src={activeRepo.avatarUrl}
              accountId={activeRepo.accountId}
              name={activeRepo.name}
              size={22}
              shape="rounded"
            />
          ) : (
            <span className="toolbar-pill-placeholder" />
          )}
          <div className="toolbar-pill-text">
            <div className="toolbar-item-label">{t('toolbar.currentRepo')}</div>
            <div className="toolbar-item-value">
              {activeRepo ? activeRepo.name : t('toolbar.noRepo')}
            </div>
          </div>
        </button>

        <button
          type="button"
          className="toolbar-pill"
          disabled={!activeRepo}
          onClick={() => setActiveDialog('branches')}
          title="Switch or manage branches (Ctrl+B)"
        >
          <GitBranch size={15} className="toolbar-pill-icon" />
          <div className="toolbar-pill-text">
            <div className="toolbar-item-label">{t('toolbar.currentBranch')}</div>
            <div className="toolbar-item-value branch-value">
              <span>{branch ? branch.name : '—'}</span>
              {branch && (branch.ahead > 0 || branch.behind > 0) && (
                <span className="branch-delta">
                  {branch.ahead > 0 && <span>↑{branch.ahead}</span>}
                  {branch.behind > 0 && <span>↓{branch.behind}</span>}
                </span>
              )}
            </div>
          </div>
        </button>

        <button
          type="button"
          className={`toolbar-pill sync-pill${action !== 'fetch' && hasRemote ? ' sync-accent' : ''}`}
          disabled={!activeRepo || syncing}
          onClick={() => void handleSync()}
          title={syncError ?? getSyncLabel()}
        >
          <span className="toolbar-pill-icon">
            {action === 'publish' ? (
              <Upload size={15} />
            ) : action === 'pull' ? (
              <ArrowDown size={15} />
            ) : action === 'push' ? (
              <ArrowUp size={15} />
            ) : (
              <RefreshCw size={15} className={syncing ? 'icon-spin' : undefined} />
            )}
          </span>
          <div className="toolbar-pill-text">
            <div className="toolbar-item-label" style={syncError ? { color: 'var(--danger)' } : undefined}>
              {syncError ? 'Sync failed' : (repoStatus?.remotes[0]?.name ?? 'local')}
            </div>
            <div className="toolbar-item-value">{getSyncLabel()}</div>
          </div>
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-right titlebar-no-drag">
        {latestPipeline && (
          <button
            type="button"
            className="toolbar-chip"
            onClick={() => setActiveTab('pipelines')}
            title={`Latest pipeline #${latestPipeline.id}: ${latestPipeline.status}`}
          >
            <Activity size={13} />
            <span className={`pipeline-status ${latestPipeline.status}`}>
              {latestPipeline.status}
            </span>
          </button>
        )}

        {activeRepo?.gitlabInstanceUrl && activeRepo.gitlabProjectPath && (
          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={openOnGitLab}
            title="Open current branch on GitLab"
            aria-label="Open on GitLab"
          >
            <ExternalLink size={15} />
          </button>
        )}

        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={() => setActiveDialog('command-palette')}
          title="Command Palette (Ctrl+K)"
          aria-label="Command Palette"
        >
          <Command size={15} />
        </button>

        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={() => setActiveDialog('preferences')}
          title="Preferences (Ctrl+,)"
          aria-label="Preferences"
        >
          <SlidersHorizontal size={15} />
        </button>

        <button
          type="button"
          className="toolbar-account-btn"
          onClick={() => setActiveDialog('accounts')}
          title={primaryAccount ? `${primaryAccount.name} (@${primaryAccount.username})` : 'Sign in to GitLab'}
        >
          {primaryAccount ? (
            <Avatar
              src={primaryAccount.avatarUrl}
              accountId={primaryAccount.id}
              name={primaryAccount.name || primaryAccount.username}
              size={24}
              shape="circle"
            />
          ) : (
            <UserCircle size={18} className="toolbar-pill-icon" />
          )}
          <span className="toolbar-account-label">
            {accounts.length === 0
              ? 'Sign in'
              : accounts.length === 1
                ? `@${accounts[0].username}`
                : `${accounts.length} accounts`}
          </span>
        </button>

        <div className="window-controls" aria-label="Window controls">
          <button
            type="button"
            className="win-btn"
            onClick={() => void window.gitlabDesktop.invoke('window:minimize')}
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="win-btn"
            onClick={() => void window.gitlabDesktop.invoke('window:maximizeToggle')}
            title={isMaximized ? 'Restore' : 'Maximize'}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button
            type="button"
            className="win-btn win-btn-close"
            onClick={() => void window.gitlabDesktop.invoke('window:close')}
            title="Close"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
