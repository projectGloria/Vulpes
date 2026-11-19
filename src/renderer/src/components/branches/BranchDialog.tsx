import { useEffect, useMemo, useState } from 'react';
import { Archive, Edit2, GitBranch, Plus, Trash2, X } from 'lucide-react';
import type { BranchInfo, StashEntry } from '@shared/types/git';
import { useAppStore } from '@renderer/store/useAppStore';

export function BranchDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;

  const [tab, setTab] = useState<'branches' | 'stashes'>('branches');
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [search, setSearch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [stashMessage, setStashMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async (): Promise<void> => {
    if (!activeRepo) return;
    const [bRes, sRes] = await Promise.all([
      window.gitlabDesktop.invoke('git:listBranches', { repoPath: activeRepo.path }),
      window.gitlabDesktop.invoke('git:stashList', { repoPath: activeRepo.path })
    ]);
    if (bRes.ok) setBranches(bRes.data);
    if (sRes.ok) setStashes(sRes.data);
  };

  useEffect(() => {
    if (activeDialog === 'branches' && activeRepo) {
      setError(null);
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialog, activeRepo?.id]);

  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, search]);

  if (activeDialog !== 'branches' || !activeRepo) return null;

  const close = (): void => setActiveDialog(null);
  const isDirty = (repoStatus?.files.length ?? 0) > 0;

  const handleSwitch = async (branchName: string): Promise<void> => {
    setError(null);
    if (isDirty) {
      const shouldStash = window.confirm(
        `You have uncommitted changes. Stash them before switching to "${branchName}"?\n\nClick OK to stash & switch, or Cancel to try switching with changes.`
      );
      if (shouldStash) {
        const st = await window.gitlabDesktop.invoke('git:stashPush', {
          repoPath: activeRepo.path,
          message: `Auto-stash before switching to ${branchName}`
        });
        if (!st.ok) {
          setError(st.error.message);
          return;
        }
      }
    }
    const res = await window.gitlabDesktop.invoke('git:switchBranch', {
      repoPath: activeRepo.path,
      name: branchName.replace(/^origin\//, '')
    });
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await refreshStatus();
    close();
  };

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    const res = await window.gitlabDesktop.invoke('git:createBranch', {
      repoPath: activeRepo.path,
      name: newBranchName.trim()
    });
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setNewBranchName('');
    await refreshStatus();
    close();
  };

  const handleRename = async (oldName: string): Promise<void> => {
    const next = window.prompt(`Rename branch "${oldName}" to:`, oldName);
    if (!next?.trim() || next.trim() === oldName) return;
    const res = await window.gitlabDesktop.invoke('git:renameBranch', {
      repoPath: activeRepo.path,
      oldName,
      newName: next.trim()
    });
    if (!res.ok) setError(res.error.message);
    else {
      await loadData();
      await refreshStatus();
    }
  };

  const handleDelete = async (name: string): Promise<void> => {
    if (!window.confirm(`Delete branch "${name}"?`)) return;
    const res = await window.gitlabDesktop.invoke('git:deleteBranch', {
      repoPath: activeRepo.path,
      name
    });
    if (!res.ok) setError(res.error.message);
    else await loadData();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="branches-title">
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-header">
          <span id="branches-title">Branches & Stashes</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn${tab === 'branches' ? ' btn-primary' : ''}`}
              onClick={() => setTab('branches')}
            >
              <GitBranch size={14} /> Branches ({branches.length})
            </button>
            <button
              type="button"
              className={`btn${tab === 'stashes' ? ' btn-primary' : ''}`}
              onClick={() => setTab('stashes')}
            >
              <Archive size={14} /> Stashes ({stashes.length})
            </button>
          </div>

          {tab === 'branches' ? (
            <>
              <form className="field-row" onSubmit={(e) => void handleCreate(e)}>
                <input
                  type="text"
                  className="text-input"
                  placeholder="New branch name (e.g. feat/login)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  <Plus size={14} /> Create
                </button>
              </form>

              <input
                type="search"
                className="text-input"
                placeholder="Filter branches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div
                style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6
                }}
              >
                {filteredBranches.map((b) => (
                  <div
                    key={`${b.isRemote ? 'r' : 'l'}:${b.name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: b.isCurrent ? 'var(--bg-selected)' : 'transparent'
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        flex: 1
                      }}
                      onClick={() => !b.isCurrent && void handleSwitch(b.name)}
                    >
                      <div style={{ fontWeight: b.isCurrent ? 700 : 500 }}>
                        {b.name} {b.isCurrent ? '(current)' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {b.isRemote ? 'remote' : 'local'} · {b.lastCommitSha}
                      </div>
                    </button>
                    {!b.isRemote && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Rename branch"
                          onClick={() => void handleRename(b.name)}
                        >
                          <Edit2 size={13} />
                        </button>
                        {!b.isCurrent && (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Delete branch"
                            onClick={() => void handleDelete(b.name)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="field-row">
                <input
                  type="text"
                  className="text-input"
                  placeholder="Optional stash message..."
                  value={stashMessage}
                  onChange={(e) => setStashMessage(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isDirty}
                  onClick={async () => {
                    const res = await window.gitlabDesktop.invoke('git:stashPush', {
                      repoPath: activeRepo.path,
                      message: stashMessage.trim() || undefined
                    });
                    if (!res.ok) setError(res.error.message);
                    else {
                      setStashMessage('');
                      await loadData();
                      await refreshStatus();
                    }
                  }}
                >
                  Stash Changes
                </button>
              </div>
              {stashes.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', padding: 12 }}>No stashes saved.</div>
              ) : (
                stashes.map((s) => (
                  <div
                    key={s.ref}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.ref}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-xs"
                        onClick={async () => {
                          const res = await window.gitlabDesktop.invoke('git:stashPop', {
                            repoPath: activeRepo.path,
                            ref: s.ref
                          });
                          if (!res.ok) setError(res.error.message);
                          else {
                            await loadData();
                            await refreshStatus();
                          }
                        }}
                      >
                        Restore (Pop)
                      </button>
                      <button
                        type="button"
                        className="btn-xs"
                        onClick={async () => {
                          await window.gitlabDesktop.invoke('git:stashDrop', {
                            repoPath: activeRepo.path,
                            ref: s.ref
                          });
                          await loadData();
                        }}
                      >
                        Drop
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {error && <div className="error-inline">{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
