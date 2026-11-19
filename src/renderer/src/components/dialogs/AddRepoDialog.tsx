import { useState } from 'react';
import { X } from 'lucide-react';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';

export function AddRepoDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const addRepository = useAppStore((s) => s.addRepository);

  const [repoPath, setRepoPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (activeDialog !== 'add-repo') return null;

  const close = (): void => {
    setError(null);
    setRepoPath('');
    setActiveDialog(null);
  };

  const handleBrowse = async (): Promise<void> => {
    const res = await window.gitlabDesktop.invoke('app:pickDirectory', {
      title: t('dialog.addRepo.title')
    });
    if (res.ok && res.data.path) {
      setRepoPath(res.data.path);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!repoPath.trim()) {
      setError('Please select a folder.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await addRepository(repoPath.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to add repository');
    } else {
      setRepoPath('');
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-repo-title">
      <form className="modal" onSubmit={(e) => void handleSubmit(e)}>
        <div className="modal-header">
          <span id="add-repo-title">{t('dialog.addRepo.title')}</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="add-repo-path">{t('dialog.addRepo.pathLabel')}</label>
            <div className="field-row">
              <input
                id="add-repo-path"
                type="text"
                className="text-input"
                placeholder={t('dialog.addRepo.pathPlaceholder')}
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn" onClick={() => void handleBrowse()}>
                {t('dialog.browse')}
              </button>
            </div>
          </div>
          {error && <div className="error-inline">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {t('dialog.addRepo.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
