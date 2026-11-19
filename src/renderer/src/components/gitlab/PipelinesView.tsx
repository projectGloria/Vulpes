import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Square } from 'lucide-react';
import type { GitLabJob, GitLabPipeline } from '@shared/types/gitlab';
import { useAppStore } from '@renderer/store/useAppStore';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function PipelinesView(): React.JSX.Element {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const repoStatus = useAppStore((s) => s.repoStatus);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) ?? null;
  const projectId = activeRepo?.gitlabProjectId ?? activeRepo?.gitlabProjectPath;
  const currentBranch = repoStatus?.branch.name;

  const [pipelines, setPipelines] = useState<GitLabPipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<GitLabPipeline | null>(null);
  const [jobs, setJobs] = useState<GitLabJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GitLabJob | null>(null);
  const [trace, setTrace] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadPipelines = async (): Promise<void> => {
    if (!activeRepo?.accountId || !projectId) return;
    setLoading(true);
    const res = await window.gitlabDesktop.invoke('gitlab:listPipelines', {
      accountId: activeRepo.accountId,
      projectId,
      ref: currentBranch
    });
    setLoading(false);
    if (res.ok) {
      setPipelines(res.data);
      setSelectedPipeline((prev) =>
        prev && res.data.some((p) => p.id === prev.id) ? prev : (res.data[0] ?? null)
      );
    }
  };

  useEffect(() => {
    void loadPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepo?.accountId, projectId, currentBranch]);

  useEffect(() => {
    if (!activeRepo?.accountId || !projectId || !selectedPipeline) {
      setJobs([]);
      setSelectedJob(null);
      setTrace('');
      return;
    }
    void window.gitlabDesktop
      .invoke('gitlab:listPipelineJobs', {
        accountId: activeRepo.accountId,
        projectId,
        pipelineId: selectedPipeline.id
      })
      .then((res) => {
        if (res.ok) {
          setJobs(res.data);
          setSelectedJob(res.data[0] ?? null);
        }
      });
  }, [activeRepo?.accountId, projectId, selectedPipeline]);

  useEffect(() => {
    if (!activeRepo?.accountId || !projectId || !selectedJob) {
      setTrace('');
      return;
    }
    void window.gitlabDesktop
      .invoke('gitlab:getJobTrace', {
        accountId: activeRepo.accountId,
        projectId,
        jobId: selectedJob.id
      })
      .then((res) => {
        if (res.ok) setTrace(res.data.replace(ANSI_RE, ''));
      });
  }, [activeRepo?.accountId, projectId, selectedJob]);

  if (!activeRepo?.accountId || !projectId) {
    return (
      <div className="empty-state">
        <h2>Connect a GitLab account</h2>
        <p>Sign in to GitLab to monitor CI/CD pipelines and inspect job logs.</p>
        <button type="button" className="btn btn-primary" onClick={() => setActiveDialog('accounts')}>
          Manage GitLab Accounts
        </button>
      </div>
    );
  }

  return (
    <div className="split-pane">
      <div className="changes-left">
        <div className="changes-list-header">
          <strong style={{ fontSize: 12 }}>Pipelines ({currentBranch ?? 'all'})</strong>
          <button type="button" className="icon-btn" onClick={() => void loadPipelines()} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="changes-file-scroll">
          {loading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading pipelines...</div>
          ) : pipelines.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>No pipelines for this branch.</div>
          ) : (
            pipelines.map((p) => (
              <div
                key={p.id}
                className={`commit-row${selectedPipeline?.id === p.id ? ' active' : ''}`}
                onClick={() => setSelectedPipeline(p)}
              >
                <div className="commit-summary">
                  #{p.id} · <span className={`pipeline-status ${p.status}`}>{p.status}</span>
                </div>
                <div className="commit-meta">
                  <span>{p.sha.slice(0, 7)}</span>
                  <span>{new Date(p.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="changes-right">
        {selectedPipeline ? (
          <>
            <div className="commit-detail-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Pipeline #{selectedPipeline.id}</strong> ·{' '}
                  <span className={`pipeline-status ${selectedPipeline.status}`}>
                    {selectedPipeline.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={async () => {
                      await window.gitlabDesktop.invoke('gitlab:retryPipeline', {
                        accountId: activeRepo.accountId!,
                        projectId,
                        pipelineId: selectedPipeline.id
                      });
                      await loadPipelines();
                    }}
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={async () => {
                      await window.gitlabDesktop.invoke('gitlab:cancelPipeline', {
                        accountId: activeRepo.accountId!,
                        projectId,
                        pipelineId: selectedPipeline.id
                      });
                      await loadPipelines();
                    }}
                  >
                    <Square size={12} /> Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() =>
                      void window.gitlabDesktop.invoke('app:openExternal', {
                        url: selectedPipeline.web_url
                      })
                    }
                  >
                    <ExternalLink size={12} /> Open
                  </button>
                </div>
              </div>
              <div className="commit-file-chips">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`btn-xs${selectedJob?.id === job.id ? ' active' : ''}`}
                    onClick={() => setSelectedJob(job)}
                  >
                    {job.stage}/{job.name} ({job.status})
                  </button>
                ))}
              </div>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 12,
                overflow: 'auto',
                background: '#0d1117',
                color: '#e6edf3',
                fontFamily: 'var(--font-mono)',
                fontSize: 12
              }}
            >
              {trace || 'Select a job to view its log output.'}
            </pre>
          </>
        ) : (
          <div className="empty-state">Select a pipeline to inspect jobs and logs.</div>
        )}
      </div>
    </div>
  );
}
