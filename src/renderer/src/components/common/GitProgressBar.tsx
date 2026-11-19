import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, GitCommitHorizontal, RefreshCw, X } from 'lucide-react';
import { useAppStore } from '@renderer/store/useAppStore';

export function GitProgressBar(): React.JSX.Element | null {
  const gitProgress = useAppStore((s) => s.gitProgress);
  const setGitProgress = useAppStore((s) => s.setGitProgress);

  if (!gitProgress) return null;

  const { operation, stage, percent, status, message } = gitProgress;
  const isDeterminate = typeof percent === 'number' && !Number.isNaN(percent);

  const renderIcon = (): React.JSX.Element => {
    if (status === 'done') return <CheckCircle2 size={13} />;
    if (status === 'error') return <AlertCircle size={13} />;
    if (operation === 'pull') return <ArrowDown size={13} />;
    if (operation === 'push') return <ArrowUp size={13} />;
    if (operation === 'commit') return <GitCommitHorizontal size={13} />;
    return <RefreshCw size={13} className="icon-spin" />;
  };

  const operationLabel =
    operation === 'fetch'
      ? 'Fetch'
      : operation === 'pull'
        ? 'Pull'
        : operation === 'push'
          ? 'Push'
          : operation === 'commit'
            ? 'Commit'
            : 'Clone';

  return (
    <div className={`git-progress-shell status-${status}`} role="status" aria-live="polite">
      <div className="git-progress-track">
        <div
          className={`git-progress-fill${!isDeterminate && status === 'running' ? ' indeterminate' : ''}`}
          style={isDeterminate ? { width: `${percent}%` } : undefined}
        />
      </div>
      <div className="git-progress-meta">
        <div className="git-progress-left">
          <span className="git-progress-icon">{renderIcon()}</span>
          <span className="git-progress-op">{operationLabel}</span>
          <span className="git-progress-sep">·</span>
          <span className="git-progress-stage" title={message ?? stage}>
            {status === 'error' && message ? message : stage}
          </span>
        </div>
        <div className="git-progress-right">
          {isDeterminate && status === 'running' && (
            <span className="git-progress-pct">{percent}%</span>
          )}
          {status !== 'running' && (
            <button
              type="button"
              className="git-progress-dismiss"
              onClick={() => setGitProgress(null)}
              aria-label="Dismiss progress"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
