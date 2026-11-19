import { useState } from 'react';
import { X } from 'lucide-react';
import type { CreateRepoOptions } from '@shared/types/git';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';

export function CreateRepoDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const createRepository = useAppStore((s) => s.createRepository);

  const [name, setName] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [initReadme, setInitReadme] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] =
    useState<CreateRepoOptions['gitignoreTemplate']>('none');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (activeDialog !== 'create-repo') return null;

  const close = (): void => {
    setError(null);
    setActiveDialog(null);
  };

  const handleBrowse = async (): Promise<void> => {
    const res = await window.gitlabDesktop.invoke('app:pickDirectory', {
      title: t('dialog.createRepo.parentLabel')
    });
    if (res.ok && res.data.path) {
      setParentDir(res.data.path);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim() || !parentDir.trim()) {
      setError('Repository name and parent folder are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createRepository({
      name: name.trim(),
      parentDir: parentDir.trim(),
      defaultBranch: defaultBranch.trim() || 'main',
      initReadme,
      gitignoreTemplate
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to create repository');
    } else {
      setName('');
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-repo-title"
    >
      <form className="modal" onSubmit={(e) => void handleSubmit(e)}>
        <div className="modal-header">
          <span id="create-repo-title">{t('dialog.createRepo.title')}</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="create-repo-name">{t('dialog.createRepo.nameLabel')}</label>
            <input
              id="create-repo-name"
              type="text"
              className="text-input"
              placeholder={t('dialog.createRepo.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="create-repo-parent">{t('dialog.createRepo.parentLabel')}</label>
            <div className="field-row">
              <input
                id="create-repo-parent"
                type="text"
                className="text-input"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
              />
              <button type="button" className="btn" onClick={() => void handleBrowse()}>
                {t('dialog.browse')}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="create-repo-branch">{t('dialog.createRepo.branchLabel')}</label>
            <input
              id="create-repo-branch"
              type="text"
              className="text-input"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="create-repo-ignore">{t('dialog.createRepo.gitignore')}</label>
            <select
              id="create-repo-ignore"
              className="select-input"
              value={gitignoreTemplate}
              onChange={(e) =>
                setGitignoreTemplate(e.target.value as CreateRepoOptions['gitignoreTemplate'])
              }
            >
              <option value="none">None</option>
              <option value="node">Node.js</option>
              <option value="python">Python</option>
              <option value="rust">Rust</option>
              <option value="go">Go</option>
            </select>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={initReadme}
              onChange={(e) => setInitReadme(e.target.checked)}
            />
            <span>{t('dialog.createRepo.readme')}</span>
          </label>

          {error && <div className="error-inline">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {t('dialog.createRepo.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
