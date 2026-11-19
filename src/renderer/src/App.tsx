import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { Toolbar } from './components/layout/Toolbar';
import { Sidebar } from './components/layout/Sidebar';
import { MainContent } from './components/layout/MainContent';
import { GitMissingBanner } from './components/common/GitMissingBanner';
import { AddRepoDialog } from './components/dialogs/AddRepoDialog';
import { CreateRepoDialog } from './components/dialogs/CreateRepoDialog';
import { CloneRepoDialog } from './components/dialogs/CloneRepoDialog';
import { RepoSettingsDialog } from './components/dialogs/RepoSettingsDialog';
import { BranchDialog } from './components/branches/BranchDialog';
import { CreateMrDialog } from './components/gitlab/CreateMrDialog';
import { AccountsDialog } from './components/dialogs/AccountsDialog';
import { PreferencesDialog } from './components/dialogs/PreferencesDialog';
import { CommandPalette } from './components/dialogs/CommandPalette';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';

export function App(): React.JSX.Element {
  const initialize = useAppStore((s) => s.initialize);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  useGlobalShortcuts();

  useEffect(() => {
    void initialize();
    const unsubscribe = window.gitlabDesktop.on('repo:changed', () => {
      void refreshStatus();
    });
    return () => {
      unsubscribe();
    };
  }, [initialize, refreshStatus]);

  return (
    <div className="app-shell">
      <Toolbar />
      <GitMissingBanner />
      <div className="workspace-body">
        <Sidebar />
        <MainContent />
      </div>
      <AddRepoDialog />
      <CreateRepoDialog />
      <CloneRepoDialog />
      <RepoSettingsDialog />
      <BranchDialog />
      <CreateMrDialog />
      <AccountsDialog />
      <PreferencesDialog />
      <CommandPalette />
    </div>
  );
}
