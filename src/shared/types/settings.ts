export type ThemeMode = 'system' | 'light' | 'dark';
export type PullStrategy = 'merge' | 'rebase' | 'ff-only';

export interface AppPreferences {
  theme: ThemeMode;
  pullStrategy: PullStrategy;
  defaultEditor: string;
  defaultTerminal: string;
  locale: string;
  telemetryEnabled: boolean;
  crashReportingEnabled: boolean;
  notificationsEnabled: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  pullStrategy: 'merge',
  defaultEditor: 'code',
  defaultTerminal: 'system',
  locale: 'en',
  telemetryEnabled: false,
  crashReportingEnabled: false,
  notificationsEnabled: true
};
