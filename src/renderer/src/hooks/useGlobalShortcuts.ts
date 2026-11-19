import { useEffect } from 'react';
import { useAppStore } from '@renderer/store/useAppStore';

export function useGlobalShortcuts(): void {
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const refreshStatus = useAppStore((s) => s.refreshStatus);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        setActiveDialog(null);
        return;
      }

      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setActiveDialog('command-palette');
      } else if (key === ',') {
        e.preventDefault();
        setActiveDialog('preferences');
      } else if (key === 'b') {
        e.preventDefault();
        setActiveDialog('branches');
      } else if (key === 'o' && e.shiftKey) {
        e.preventDefault();
        setActiveDialog('clone-repo');
      } else if (key === 'r') {
        e.preventDefault();
        void refreshStatus();
      } else if (key === '1') {
        e.preventDefault();
        setActiveTab('changes');
      } else if (key === '2') {
        e.preventDefault();
        setActiveTab('history');
      } else if (key === '3') {
        e.preventDefault();
        setActiveTab('merge-requests');
      } else if (key === '4') {
        e.preventDefault();
        setActiveTab('pipelines');
      } else if (key === '5') {
        e.preventDefault();
        setActiveTab('issues');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [refreshStatus, setActiveDialog, setActiveTab]);
}
