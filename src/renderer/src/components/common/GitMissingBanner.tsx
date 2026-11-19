import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { t } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/useAppStore';

export function GitMissingBanner(): React.JSX.Element | null {
  const gitInstall = useAppStore((s) => s.gitInstall);
  const checkGitInstall = useAppStore((s) => s.checkGitInstall);

  if (!gitInstall || gitInstall.installed) return null;

  const openGitDownloads = (): void => {
    void window.gitlabDesktop.invoke('app:openExternal', {
      url: 'https://git-scm.com/downloads'
    });
  };

  return (
    <div className="banner-error" role="alert">
      <div className="banner-error-text">
        <AlertTriangle size={18} />
        <div>
          <strong>{t('gitMissing.title')}</strong>
          <div style={{ fontSize: 12 }}>{t('gitMissing.body')}</div>
        </div>
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button type="button" className="btn" onClick={openGitDownloads}>
          <ExternalLink size={14} />
          {t('gitMissing.download')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void checkGitInstall()}>
          <RefreshCw size={14} />
          {t('gitMissing.retry')}
        </button>
      </div>
    </div>
  );
}
