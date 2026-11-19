import { useEffect, useState } from 'react';
import { FileText, Save, X } from 'lucide-react';
import type { AppPreferences, PullStrategy, ThemeMode } from '@shared/types/settings';
import { useAppStore } from '@renderer/store/useAppStore';

export function PreferencesDialog(): React.JSX.Element | null {
  const activeDialog = useAppStore((s) => s.activeDialog);
  const setActiveDialog = useAppStore((s) => s.setActiveDialog);
  const preferences = useAppStore((s) => s.preferences);
  const updatePreferences = useAppStore((s) => s.updatePreferences);

  const [draft, setDraft] = useState<AppPreferences>(preferences);

  useEffect(() => {
    if (activeDialog === 'preferences') {
      setDraft(preferences);
    }
  }, [activeDialog, preferences]);

  if (activeDialog !== 'preferences') return null;

  const close = (): void => setActiveDialog(null);

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await updatePreferences(draft);
    close();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="prefs-title">
      <form className="modal" style={{ width: 540 }} onSubmit={(e) => void handleSave(e)}>
        <div className="modal-header">
          <span id="prefs-title">Preferences</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label htmlFor="pref-theme">Appearance</label>
            <select
              id="pref-theme"
              className="select-input"
              value={draft.theme}
              onChange={(e) => setDraft({ ...draft, theme: e.target.value as ThemeMode })}
            >
              <option value="system">System default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="pref-pull">Default Pull Strategy</label>
            <select
              id="pref-pull"
              className="select-input"
              value={draft.pullStrategy}
              onChange={(e) =>
                setDraft({ ...draft, pullStrategy: e.target.value as PullStrategy })
              }
            >
              <option value="merge">Merge (default)</option>
              <option value="rebase">Rebase</option>
              <option value="ff-only">Fast-forward only</option>
            </select>
          </div>

          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="pref-editor">External Editor Command</label>
              <input
                id="pref-editor"
                type="text"
                className="text-input"
                value={draft.defaultEditor}
                onChange={(e) => setDraft({ ...draft, defaultEditor: e.target.value })}
                placeholder="code"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="pref-terminal">External Terminal</label>
              <input
                id="pref-terminal"
                type="text"
                className="text-input"
                value={draft.defaultTerminal}
                onChange={(e) => setDraft({ ...draft, defaultTerminal: e.target.value })}
                placeholder="system"
              />
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.notificationsEnabled}
              onChange={(e) => setDraft({ ...draft, notificationsEnabled: e.target.checked })}
            />
            <span>Enable desktop notifications (MR reviews, pipeline updates)</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.crashReportingEnabled}
              onChange={(e) => setDraft({ ...draft, crashReportingEnabled: e.target.checked })}
            />
            <span>Send anonymous crash reports (opt-in, off by default)</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.telemetryEnabled}
              onChange={(e) => setDraft({ ...draft, telemetryEnabled: e.target.checked })}
            />
            <span>Share anonymous usage telemetry (off by default)</span>
          </label>

          <div>
            <button
              type="button"
              className="btn"
              onClick={() => void window.gitlabDesktop.invoke('app:openLogs')}
            >
              <FileText size={14} /> Show Log File
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            <Save size={14} /> Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
}
