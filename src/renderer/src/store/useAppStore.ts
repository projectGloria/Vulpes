import { create } from 'zustand';
import type {
  CreateRepoOptions,
  GitInstallStatus,
  GitProgressEvent,
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
  gitProgress: GitProgressEvent | null;

  initialize: () => Promise<void>;
  checkGitInstall: () => Promise<void>;
  refreshStatus: (silent?: boolean) => Promise<void>;
  reloadRepositories: () => Promise<void>;
  resolveAllRepoMetadata: () => Promise<void>;
  refreshAccountProfiles: () => Promise<void>;
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
  setGitProgress: (evt: GitProgressEvent | null) => void;
  updatePreferences: (partial: Partial<AppPreferences>) => Promise<void>;
}

let statusRefreshInFlight = false;
let pendingSilentRefresh = false;
let progressClearTimer: ReturnType<typeof setTimeout> | null = null;

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
  gitProgress: null,

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
      await get().refreshStatus(false);
    }

    // Fetch fresh profile pictures & repository avatars in the background
    void get().refreshAccountProfiles();
    void get().resolveAllRepoMetadata();
  },

  checkGitInstall: async () => {
    const res = await window.gitlabDesktop.invoke('git:checkInstall');
    if (res.ok) {
      set({ gitInstall: res.data });
      if (res.data.installed && get().activeRepoId) {
        await get().refreshStatus(false);
      }
    }
  },

  refreshStatus: async (silent = false) => {
    const { repositories, activeRepoId, gitInstall } = get();
    if (!gitInstall?.installed) return;
    const activeRepo = repositories.find((r) => r.id === activeRepoId);
    if (!activeRepo) {
      set({ repoStatus: null, statusError: null, statusLoading: false });
      return;
    }

    if (statusRefreshInFlight) {
      pendingSilentRefresh = true;
      return;
    }

    statusRefreshInFlight = true;
    if (!silent && !get().repoStatus) {
      set({ statusLoading: true, statusError: null });
    }

    try {
      const res = await window.gitlabDesktop.invoke('git:getStatus', {
        repoPath: activeRepo.path
      });
      // Ignore stale responses if the user switched repositories mid-flight
      if (get().activeRepoId !== activeRepo.id) return;
      if (res.ok) {
        set({ repoStatus: res.data, statusLoading: false, statusError: null });
      } else {
        set({ statusLoading: false, statusError: res.error.message, repoStatus: null });
      }
    } finally {
      statusRefreshInFlight = false;
      if (pendingSilentRefresh) {
        pendingSilentRefresh = false;
        void get().refreshStatus(true);
      }
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
    await get().refreshStatus(false);
    void get().resolveAllRepoMetadata();
  },

  refreshAccountProfiles: async () => {
    const { accounts } = get();
    if (accounts.length === 0) return;
    const updates = await Promise.all(
      accounts.map(async (acc) => {
        const res = await window.gitlabDesktop.invoke('auth:refreshProfile', { accountId: acc.id });
        return res.ok ? res.data : acc;
      })
    );
    set({ accounts: updates });
  },

  resolveAllRepoMetadata: async () => {
    const { repositories, accounts } = get();
    if (repositories.length === 0 || accounts.length === 0) return;
    const targets = repositories.filter((r) => !r.avatarUrl || !r.gitlabProjectId);
    for (const repo of targets) {
      const resolved = await window.gitlabDesktop.invoke('repo:resolveGitLab', { repoId: repo.id });
      if (resolved.ok && resolved.data) {
        const updated = resolved.data;
        set((state) => ({
          repositories: state.repositories.map((r) => (r.id === repo.id ? updated : r))
        }));
      }
    }
  },

  selectRepo: async (id) => {
    await window.gitlabDesktop.invoke('repo:select', { id });
    set({ activeRepoId: id, repoStatus: null, statusError: null });
    await get().refreshStatus(false);
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
    await get().refreshStatus(false);
    void get().resolveAllRepoMetadata();
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
    await get().refreshStatus(false);
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
    await get().refreshStatus(false);
  },

  signInPat: async (instanceUrl, token) => {
    const res = await window.gitlabDesktop.invoke('auth:signInPat', { instanceUrl, token });
    if (!res.ok) return { ok: false, error: res.error.message };
    const listRes = await window.gitlabDesktop.invoke('auth:listAccounts');
    if (listRes.ok) set({ accounts: listRes.data });
    void get().resolveAllRepoMetadata();
    return { ok: true };
  },

  signInOAuth: async (instanceUrl, clientId) => {
    const res = await window.gitlabDesktop.invoke('auth:signInOAuth', { instanceUrl, clientId });
    if (!res.ok) return { ok: false, error: res.error.message };
    const listRes = await window.gitlabDesktop.invoke('auth:listAccounts');
    if (listRes.ok) set({ accounts: listRes.data });
    void get().resolveAllRepoMetadata();
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

  setGitProgress: (evt) => {
    if (progressClearTimer) {
      clearTimeout(progressClearTimer);
      progressClearTimer = null;
    }
    set({ gitProgress: evt });
    if (evt && evt.status === 'done') {
      progressClearTimer = setTimeout(() => {
        set((state) => (state.gitProgress === evt ? { gitProgress: null } : state));
      }, 2000);
    } else if (evt && evt.status === 'error') {
      progressClearTimer = setTimeout(() => {
        set((state) => (state.gitProgress === evt ? { gitProgress: null } : state));
      }, 5000);
    }
  },

  updatePreferences: async (partial) => {
    const res = await window.gitlabDesktop.invoke('app:updatePreferences', partial);
    if (res.ok) {
      set({ preferences: res.data });
      document.documentElement.dataset.theme = res.data.theme;
    }
  }
}));
