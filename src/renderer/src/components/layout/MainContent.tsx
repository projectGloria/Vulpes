import {
  Activity,
  CircleDot,
  Clock,
  Download,
  FileDiff,
  FolderPlus,
  GitPullRequest,
  Plus,
  Settings,
  X
} from 'lucide-react';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';
import { ChangesView } from '../changes/ChangesView';
import { HistoryView } from '../history/HistoryView';
import { MergeRequestsView } from '../gitlab/MergeRequestsView';
import { PipelinesView } from '../gitlab/PipelinesView';
import { IssuesView } from '../gitlab/IssuesView';

export function MainContent(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const statusError = useAppStore((s) => s.statusError);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const recentlyPublishedBranch = useAppStore((s) => s.recentlyPublishedBranch);
  const setRecentlyPublishedBranch = useAppStore((s) => s.setRecentlyPublishedBranch);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;

  if (!activeRepo) {
    return (
      <main className="main-area">
        <div className="empty-state">
          <h2>{t('welcome.title')}</h2>
          <p>{t('welcome.subtitle')}</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setActiveDialog('clone-repo')}
            >
              <Download size={15} />
              Clone Repository
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveDialog('add-repo')}
            >
              <FolderPlus size={15} />
              {t('sidebar.addLocal')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveDialog('create-repo')}
            >
              <Plus size={15} />
              {t('sidebar.createNew')}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const changedCount = repoStatus?.files.length ?? 0;

  return (
    <main className="main-area">
      <div className="tab-bar" role="tablist">
        <div className="tab-group">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'changes'}
            className={`tab-btn${activeTab === 'changes' ? ' active' : ''}`}
            onClick={() => setActiveTab('changes')}
          >
            <FileDiff size={14} />
            <span>{t('tabs.changes')}</span>
            <span className="badge">{changedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`tab-btn${activeTab === 'history' ? ' active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={14} />
            <span>{t('tabs.history')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'merge-requests'}
            className={`tab-btn${activeTab === 'merge-requests' ? ' active' : ''}`}
            onClick={() => setActiveTab('merge-requests')}
          >
            <GitPullRequest size={14} />
            <span>Merge Requests</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pipelines'}
            className={`tab-btn${activeTab === 'pipelines' ? ' active' : ''}`}
            onClick={() => setActiveTab('pipelines')}
          >
            <Activity size={14} />
            <span>Pipelines</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'issues'}
            className={`tab-btn${activeTab === 'issues' ? ' active' : ''}`}
            onClick={() => setActiveTab('issues')}
          >
            <CircleDot size={14} />
            <span>Issues</span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeRepo.path}</span>
          <button
            type="button"
            className="icon-btn"
            title="Repository Settings"
            aria-label="Repository Settings"
            onClick={() => setActiveDialog('repo-settings')}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {recentlyPublishedBranch && (
        <div className="mr-prompt-banner">
          <span>
            Branch <strong>{recentlyPublishedBranch}</strong> was published to GitLab.
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => {
                setRecentlyPublishedBranch(null);
                setActiveDialog('create-mr');
              }}
            >
              <GitPullRequest size={13} /> Create Merge Request
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setRecentlyPublishedBranch(null)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="main-body" style={{ overflow: 'hidden' }}>
        {statusError ? (
          <div className="empty-state">
            <h2>Unable to read repository status</h2>
            <p className="error-inline">{statusError}</p>
          </div>
        ) : activeTab === 'changes' ? (
          <ChangesView />
        ) : activeTab === 'history' ? (
          <HistoryView />
        ) : activeTab === 'merge-requests' ? (
          <MergeRequestsView />
        ) : activeTab === 'pipelines' ? (
          <PipelinesView />
        ) : (
          <IssuesView />
        )}
      </div>
    </main>
  );
}
