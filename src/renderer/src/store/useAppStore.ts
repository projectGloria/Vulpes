import { create } from 'zustand';
import type {
  CreateRepoOptions,
  GitInstallStatus,
  RepoStatus,
  RepositoryRecord
} from '@shared/types/git';
import type { GitLabAccount } from '@shared/types/gitlab';
import { DEFAULT_PREFERENCES, type AppPreferences } from '@shared/types/settings';

export type ActiveTab = 'changes' | 'history' | 'merge-requests' | 'pipelines' | 'issues';
export type ActiveDialog =
  | null
  | 'add-repo'
  | 'create-repo'
  | 'clone-repo'
  | 'repo-settings'
  | 'branches'
  | 'create-mr'
  | 'preferences'
  | 'command-palette'
  | 'accounts';

interface AppState {
  gitInstall: GitInstallStatus | null;
  repositories: RepositoryRecord[];
  activeRepoId: string | null;
  repoStatus: RepoStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  accounts: GitLabAccount[];
  activeTab: ActiveTab;
  activeDialog: ActiveDialog;
  preferences: AppPreferences;
  recentlyPublishedBranch: string | null;

  initialize: () => Promise<void>;
  checkGitInstall: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  reloadRepositories: () => Promise<void>;
  selectRepo: (id: string | null) => Promise<void>;
  addRepository: (path: string) => Promise<{ ok: boolean; error?: string }>;
  createRepository: (options: CreateRepoOptions) => Promise<{ ok: boolean; error?: string }>;
  removeRepository: (id: string) => Promise<void>;
  signInPat: (instanceUrl: string, token: string) => Promise<{ ok: boolean; error?: string }>;
  signInOAuth: (instanceUrl: string, clientId: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: (accountId: string) => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
  setActiveDialog: (dialog: ActiveDialog) => void;
  setRecentlyPublishedBranch: (branch: string | null) => void;
  updatePreferences: (partial: Partial<AppPreferences>) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  gitInstall: null,
  repositories: [],
  activeRepoId: null,
  repoStatus: null,
  statusLoading: false,
  statusError: null,
  accounts: [],
  activeTab: 'changes',
  activeDialog: null,
  preferences: { ...DEFAULT_PREFERENCES },
  recentlyPublishedBranch: null,

  initialize: async () => {
    const [gitRes, reposRes, prefsRes, accountsRes] = await Promise.all([
      window.gitlabDesktop.invoke('git:checkInstall'),
      window.gitlabDesktop.invoke('repo:list'),
      window.gitlabDesktop.invoke('app:getPreferences'),
      window.gitlabDesktop.invoke('auth:listAccounts')
    ]);

    if (gitRes.ok) {
      set({ gitInstall: gitRes.data });
    }
    if (prefsRes.ok) {
      set({ preferences: prefsRes.data });
      document.documentElement.dataset.theme = prefsRes.data.theme;
    }
    if (accountsRes.ok) {
      set({ accounts: accountsRes.data });
    }
    if (reposRes.ok) {
      set({
        repositories: reposRes.data.repositories,
        activeRepoId: reposRes.data.activeRepoId
      });
    }

    if (get().activeRepoId && get().gitInstall?.installed) {
      await get().refreshStatus();
    }
  },

  checkGitInstall: async () => {
    const res = await window.gitlabDesktop.invoke('git:checkInstall');
    if (res.ok) {
      set({ gitInstall: res.data });
      if (res.data.installed && get().activeRepoId) {
        await get().refreshStatus();
      }
    }
  },

  refreshStatus: async () => {
    const { repositories, activeRepoId, gitInstall } = get();
    if (!gitInstall?.installed) return;
    const activeRepo = repositories.find((r) => r.id === activeRepoId);
    if (!activeRepo) {
      set({ repoStatus: null, statusError: null });
      return;
    }

    set({ statusLoading: true, statusError: null });
    const res = await window.gitlabDesktop.invoke('git:getStatus', {
      repoPath: activeRepo.path
    });
    if (res.ok) {
      set({ repoStatus: res.data, statusLoading: false, statusError: null });
    } else {
      set({ statusLoading: false, statusError: res.error.message, repoStatus: null });
    }
  },

  reloadRepositories: async () => {
    const listRes = await window.gitlabDesktop.invoke('repo:list');
    if (listRes.ok) {
      set({
        repositories: listRes.data.repositories,
        activeRepoId: listRes.data.activeRepoId
      });
    }
    await get().refreshStatus();
  },

  selectRepo: async (id) => {
    await window.gitlabDesktop.invoke('repo:select', { id });
    set({ activeRepoId: id, repoStatus: null, statusError: null });
    await get().refreshStatus();
    if (id) {
      const resolved = await window.gitlabDesktop.invoke('repo:resolveGitLab', { repoId: id });
      if (resolved.ok && resolved.data) {
        set((state) => ({
          repositories: state.repositories.map((r) => (r.id === id ? resolved.data! : r))
        }));
      }
    }
  },

  addRepository: async (repoPath) => {
    const res = await window.gitlabDesktop.invoke('repo:add', { path: repoPath });
    if (!res.ok) {
      return { ok: false, error: res.error.message };
    }
    const listRes = await window.gitlabDesktop.invoke('repo:list');
    if (listRes.ok) {
      set({
        repositories: listRes.data.repositories,
        activeRepoId: listRes.data.activeRepoId,
        activeDialog: null
      });
    }
    await get().refreshStatus();
    return { ok: true };
  },

  createRepository: async (options) => {
    const res = await window.gitlabDesktop.invoke('repo:create', options);
    if (!res.ok) {
      return { ok: false, error: res.error.message };
    }
    const listRes = await window.gitlabDesktop.invoke('repo:list');
    if (listRes.ok) {
      set({
        repositories: listRes.data.repositories,
        activeRepoId: listRes.data.activeRepoId,
        activeDialog: null
      });
    }
    await get().refreshStatus();
    return { ok: true };
  },

  removeRepository: async (id) => {
    await window.gitlabDesktop.invoke('repo:remove', { id });
    const listRes = await window.gitlabDesktop.invoke('repo:list');
    if (listRes.ok) {
      set({
        repositories: listRes.data.repositories,
        activeRepoId: listRes.data.activeRepoId,
        repoStatus: null
      });
    }
    await get().refreshStatus();
  },

  signInPat: async (instanceUrl, token) => {
    const res = await window.gitlabDesktop.invoke('auth:signInPat', { instanceUrl, token });
    if (!res.ok) return { ok: false, error: res.error.message };
    const listRes = await window.gitlabDesktop.invoke('auth:listAccounts');
    if (listRes.ok) set({ accounts: listRes.data });
    return { ok: true };
  },

  signInOAuth: async (instanceUrl, clientId) => {
    const res = await window.gitlabDesktop.invoke('auth:signInOAuth', { instanceUrl, clientId });
    if (!res.ok) return { ok: false, error: res.error.message };
    const listRes = await window.gitlabDesktop.invoke('auth:listAccounts');
    if (listRes.ok) set({ accounts: listRes.data });
    return { ok: true };
  },

  signOut: async (accountId) => {
    await window.gitlabDesktop.invoke('auth:signOut', { accountId });
    const listRes = await window.gitlabDesktop.invoke('auth:listAccounts');
    if (listRes.ok) set({ accounts: listRes.data });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveDialog: (dialog) => set({ activeDialog: dialog }),
  setRecentlyPublishedBranch: (branch) => set({ recentlyPublishedBranch: branch }),
  updatePreferences: async (partial) => {
    const res = await window.gitlabDesktop.invoke('app:updatePreferences', partial);
    if (res.ok) {
      set({ preferences: res.data });
      document.documentElement.dataset.theme = res.data.theme;
    }
  }
}));
