import { useState } from 'react';
import { Globe, KeyRound, LogOut, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '@renderer/components/common/Avatar';
import { useAppStore } from '@renderer/store/useAppStore';

export function AccountsDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const accounts = useAppStore((s) => s.accounts);
  const signInPat = useAppStore((s) => s.signInPat);
  const signInOAuth = useAppStore((s) => s.signInOAuth);
  const signOut = useAppStore((s) => s.signOut);

  const [mode, setMode] = useState<'oauth' | 'pat'>('oauth');
  const [instanceUrl, setInstanceUrl] = useState('https://gitlab.com');
  const [clientId, setClientId] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (activeDialog !== 'accounts') return null;

  const close = (): void => {
    setError(null);
    setToken('');
    setActiveDialog(null);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!instanceUrl.trim()) {
      setError('Please enter a GitLab instance URL (for example, https://gitlab.com).');
      return;
    }
    if (mode === 'oauth' && !clientId.trim()) {
      setError('Please enter your GitLab OAuth Application ID, or switch to Personal Access Token.');
      return;
    }
    if (mode === 'pat' && !token.trim()) {
      setError('Please enter your Personal Access Token.');
      return;
    }

    setSubmitting(true);

    const res =
      mode === 'oauth'
        ? await signInOAuth(instanceUrl.trim(), clientId.trim())
        : await signInPat(instanceUrl.trim(), token.trim());

    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? 'Sign-in failed');
    } else {
      setToken('');
    }
  };

  const openGitLabSettings = (subpath: string): void => {
    const cleanBase = instanceUrl.trim().replace(/\/+$/, '') || 'https://gitlab.com';
    const url = /^https?:\/\//i.test(cleanBase)
      ? `${cleanBase}${subpath}`
      : `https://${cleanBase}${subpath}`;
    void window.gitlabDesktop.invoke('app:openExternal', { url });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="accounts-title">
      <div className="modal" style={{ width: 540 }}>
        <div className="modal-header">
          <span id="accounts-title">GitLab Accounts</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {accounts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Connected Accounts
              </div>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="account-card"
                >
                  <div className="account-card-left">
                    <Avatar
                      src={acc.avatarUrl}
                      accountId={acc.id}
                      name={acc.name || acc.username}
                      size={36}
                      shape="circle"
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {acc.name}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                          @{acc.username}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {acc.instanceUrl} · {acc.authMethod === 'oauth' ? 'OAuth 2.0' : 'PAT'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void signOut(acc.id)}
                    aria-label={`Sign out ${acc.username}`}
                  >
                    <LogOut size={13} />
                    Sign out
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 6,
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: 8
            }}
          >
            <button
              type="button"
              className={`btn${mode === 'oauth' ? ' btn-primary' : ''}`}
              onClick={() => {
                setMode('oauth');
                setError(null);
              }}
            >
              <ShieldCheck size={14} />
              OAuth 2.0 (Browser)
            </button>
            <button
              type="button"
              className={`btn${mode === 'pat' ? ' btn-primary' : ''}`}
              onClick={() => {
                setMode('pat');
                setError(null);
              }}
            >
              <KeyRound size={14} />
              Personal Access Token
            </button>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div className="field">
              <label htmlFor="gitlab-instance-url">GitLab Instance URL</label>
              <div className="field-row">
                <input
                  id="gitlab-instance-url"
                  type="text"
                  className="text-input"
                  value={instanceUrl}
                  onChange={(e) => setInstanceUrl(e.target.value)}
                  placeholder="https://gitlab.com or https://gitlab.company.com"
                />
              </div>
            </div>

            {mode === 'oauth' ? (
              <div className="field">
                <label htmlFor="gitlab-oauth-client-id">OAuth Application ID (PKCE)</label>
                <input
                  id="gitlab-oauth-client-id"
                  type="text"
                  className="text-input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Application ID from GitLab User Settings -> Applications"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Redirect URI: <code>http://127.0.0.1:42891/oauth/callback</code> (uncheck
                  Confidential).{' '}
                  <button
                    type="button"
                    onClick={() => openGitLabSettings('/-/user_settings/applications')}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: 11
                    }}
                  >
                    Create OAuth app on GitLab
                  </button>
                </div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="gitlab-pat">Personal Access Token</label>
                <input
                  id="gitlab-pat"
                  type="password"
                  className="text-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="glpat-..."
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Requires scopes: <code>api</code>, <code>read_user</code>,{' '}
                  <code>read_repository</code>, <code>write_repository</code>.{' '}
                  <button
                    type="button"
                    onClick={() => openGitLabSettings('/-/user_settings/personal_access_tokens')}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: 11
                    }}
                  >
                    Generate token on GitLab
                  </button>
                </div>
              </div>
            )}

            {error && <div className="error-inline">{error}</div>}

            <div className="modal-footer" style={{ padding: '12px 0 0 0' }}>
              <button type="button" className="btn" onClick={close}>
                Close
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Globe size={14} />
                {submitting
                  ? mode === 'oauth'
                    ? 'Waiting for browser...'
                    : 'Signing in...'
                  : mode === 'oauth'
                    ? 'Sign in with Browser'
                    : 'Sign in with Token'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
