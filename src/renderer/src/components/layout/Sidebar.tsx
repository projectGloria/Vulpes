import { useMemo, useState } from 'react';
import { Download, FolderGit2, FolderPlus, Plus, Trash2 } from 'lucide-react';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';

export function Sidebar(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const removeRepository = useAppStore((s) => s.removeRepository);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);

  const [filter, setFilter] = useState('');

  const filteredRepos = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return repositories;
    return repositories.filter(
      (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
    );
  }, [repositories, filter]);

  return (
    <aside className="sidebar" aria-label={t('sidebar.repositories')}>
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <span className="sidebar-title">{t('sidebar.repositories')}</span>
          <div className="sidebar-actions">
            <button
              type="button"
              className="icon-btn"
              title="Clone Repository"
              aria-label="Clone Repository"
              onClick={() => setActiveDialog('clone-repo')}
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t('sidebar.addLocal')}
              aria-label={t('sidebar.addLocal')}
              onClick={() => setActiveDialog('add-repo')}
            >
              <FolderPlus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t('sidebar.createNew')}
              aria-label={t('sidebar.createNew')}
              onClick={() => setActiveDialog('create-repo')}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
        <input
          type="search"
          className="search-input"
          placeholder={t('sidebar.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={t('sidebar.filterPlaceholder')}
        />
      </div>

      <div className="repo-list" role="listbox" aria-label={t('sidebar.repositories')}>
        {filteredRepos.length === 0 ? (
          <div style={{ padding: '16px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
            {t('sidebar.empty')}
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const isActive = repo.id === activeRepoId;
            return (
              <div
                key={repo.id}
                role="option"
                aria-selected={isActive}
                className={`repo-row${isActive ? ' active' : ''}`}
                onClick={() => void selectRepo(repo.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void selectRepo(repo.id);
                  }
                }}
                tabIndex={0}
              >
                <FolderGit2 size={16} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                <div className="repo-row-main">
                  <div className="repo-name">{repo.name}</div>
                  <div className="repo-path" title={repo.path}>
                    {repo.path}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn repo-remove-btn"
                  title={t('sidebar.removeRepo')}
                  aria-label={`${t('sidebar.removeRepo')}: ${repo.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeRepository(repo.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
