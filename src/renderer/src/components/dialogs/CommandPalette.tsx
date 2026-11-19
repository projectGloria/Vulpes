import { useMemo, useState } from 'react';
import { Command, X } from 'lucide-react';
import { useAppStore } from '@renderer/store/useAppStore';

interface PaletteAction {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  const [query, setQuery] = useState('');

  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: 'tab-changes',
        label: 'View: Changes',
        shortcut: 'Ctrl+1',
        run: () => setActiveTab('changes')
      },
      {
        id: 'tab-history',
        label: 'View: Commit History',
        shortcut: 'Ctrl+2',
        run: () => setActiveTab('history')
      },
      {
        id: 'tab-mrs',
        label: 'View: Merge Requests',
        shortcut: 'Ctrl+3',
        run: () => setActiveTab('merge-requests')
      },
      {
        id: 'tab-pipelines',
        label: 'View: CI/CD Pipelines',
        shortcut: 'Ctrl+4',
        run: () => setActiveTab('pipelines')
      },
      {
        id: 'tab-issues',
        label: 'View: Issues',
        shortcut: 'Ctrl+5',
        run: () => setActiveTab('issues')
      },
      {
        id: 'branches',
        label: 'Branches & Stashes...',
        shortcut: 'Ctrl+B',
        run: () => setActiveDialog('branches')
      },
      {
        id: 'create-mr',
        label: 'GitLab: Create Merge Request...',
        run: () => setActiveDialog('create-mr')
      },
      {
        id: 'clone',
        label: 'Repository: Clone a Repository...',
        shortcut: 'Ctrl+Shift+O',
        run: () => setActiveDialog('clone-repo')
      },
      {
        id: 'add-repo',
        label: 'Repository: Add Local Repository...',
        run: () => setActiveDialog('add-repo')
      },
      {
        id: 'create-repo',
        label: 'Repository: Create New Repository...',
        run: () => setActiveDialog('create-repo')
      },
      {
        id: 'repo-settings',
        label: 'Repository: Settings...',
        run: () => setActiveDialog('repo-settings')
      },
      {
        id: 'accounts',
        label: 'GitLab: Manage Accounts...',
        run: () => setActiveDialog('accounts')
      },
      {
        id: 'preferences',
        label: 'App: Preferences...',
        shortcut: 'Ctrl+,',
        run: () => setActiveDialog('preferences')
      },
      {
        id: 'refresh',
        label: 'Git: Refresh Status',
        shortcut: 'Ctrl+R',
        run: () => void refreshStatus()
      },
      {
        id: 'logs',
        label: 'Help: Show Log File',
        run: () => void window.gitlabDesktop.invoke('app:openLogs')
      }
    ],
    [refreshStatus, setActiveDialog, setActiveTab]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  if (activeDialog !== 'command-palette') return null;

  const execute = (action: PaletteAction): void => {
    setQuery('');
    setActiveDialog(null);
    action.run();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={() => setActiveDialog(null)}
    >
      <div
        className="modal"
        style={{ width: 520, alignSelf: 'flex-start', marginTop: '12vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ gap: 8 }}>
          <Command size={15} />
          <input
            type="text"
            className="text-input"
            style={{ border: 'none', padding: 0, background: 'transparent' }}
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                e.preventDefault();
                execute(filtered[0]);
              }
            }}
            autoFocus
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setActiveDialog(null)}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>No matching commands.</div>
          ) : (
            filtered.map((action) => (
              <button
                key={action.id}
                type="button"
                className="repo-row"
                style={{ borderRadius: 0, padding: '9px 14px' }}
                onClick={() => execute(action)}
              >
                <span>{action.label}</span>
                {action.shortcut && (
                  <kbd
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {action.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
