import fs from 'fs';
import path from 'path';
import type { RepositoryRecord } from '@shared/types/git';
import type { GitLabAccount } from '@shared/types/gitlab';
import { DEFAULT_PREFERENCES, type AppPreferences } from '@shared/types/settings';

export interface PersistedState {
  version: number;
  repositories: RepositoryRecord[];
  activeRepoId: string | null;
  accounts: GitLabAccount[];
  preferences: AppPreferences;
}

const INITIAL_STATE: PersistedState = {
  version: 1,
  repositories: [],
  activeRepoId: null,
  accounts: [],
  preferences: { ...DEFAULT_PREFERENCES }
};

export class AppStore {
  private readonly filePath: string;
  private state: PersistedState;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, 'state.json');
    this.state = this.load();
  }

  private load(): PersistedState {
    try {
      if (!fs.existsSync(this.filePath)) {
        return structuredClone(INITIAL_STATE);
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        version: 1,
        repositories: Array.isArray(parsed.repositories) ? parsed.repositories : [],
        activeRepoId: typeof parsed.activeRepoId === 'string' ? parsed.activeRepoId : null,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        preferences: {
          ...DEFAULT_PREFERENCES,
          ...(parsed.preferences ?? {})
        }
      };
    } catch {
      return structuredClone(INITIAL_STATE);
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  public getRepositories(): RepositoryRecord[] {
    return [...this.state.repositories];
  }

  public getActiveRepoId(): string | null {
    return this.state.activeRepoId;
  }

  public setActiveRepoId(id: string | null): void {
    if (id !== null && !this.state.repositories.some((r) => r.id === id)) {
      return;
    }
    this.state.activeRepoId = id;
    if (id !== null) {
      const repo = this.state.repositories.find((r) => r.id === id);
      if (repo) {
        repo.lastOpenedAt = new Date().toISOString();
      }
    }
    this.save();
  }

  public upsertRepository(repo: RepositoryRecord): RepositoryRecord {
    const normalizedPath = path.resolve(repo.path).toLowerCase();
    const existingIdx = this.state.repositories.findIndex(
      (r) => path.resolve(r.path).toLowerCase() === normalizedPath
    );
    if (existingIdx >= 0) {
      const existing = this.state.repositories[existingIdx];
      const merged: RepositoryRecord = {
        ...existing,
        ...repo,
        id: existing.id,
        lastOpenedAt: new Date().toISOString()
      };
      this.state.repositories[existingIdx] = merged;
      this.state.activeRepoId = merged.id;
      this.save();
      return merged;
    }

    this.state.repositories.unshift(repo);
    this.state.activeRepoId = repo.id;
    this.save();
    return repo;
  }

  public removeRepository(id: string): void {
    this.state.repositories = this.state.repositories.filter((r) => r.id !== id);
    if (this.state.activeRepoId === id) {
      this.state.activeRepoId = this.state.repositories[0]?.id ?? null;
    }
    this.save();
  }

  public getPreferences(): AppPreferences {
    return { ...this.state.preferences };
  }

  public updatePreferences(partial: Partial<AppPreferences>): AppPreferences {
    this.state.preferences = {
      ...this.state.preferences,
      ...partial
    };
    this.save();
    return this.getPreferences();
  }

  public getAccounts(): GitLabAccount[] {
    return [...this.state.accounts];
  }

  public getAccountById(id: string): GitLabAccount | undefined {
    return this.state.accounts.find((a) => a.id === id);
  }

  public findAccountByInstance(instanceUrl: string): GitLabAccount | undefined {
    const normalized = instanceUrl.replace(/\/+$/, '').toLowerCase();
    return this.state.accounts.find(
      (a) => a.instanceUrl.replace(/\/+$/, '').toLowerCase() === normalized
    );
  }

  public upsertAccount(account: GitLabAccount): GitLabAccount {
    const idx = this.state.accounts.findIndex(
      (a) =>
        a.instanceUrl.toLowerCase() === account.instanceUrl.toLowerCase() &&
        a.userId === account.userId
    );
    if (idx >= 0) {
      const merged: GitLabAccount = {
        ...this.state.accounts[idx],
        ...account,
        id: this.state.accounts[idx].id
      };
      this.state.accounts[idx] = merged;
      this.save();
      return merged;
    }
    this.state.accounts.push(account);
    this.save();
    return account;
  }

  public updateAccountExpiry(accountId: string, expiresAt: number | null): void {
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return;
    account.tokenExpiresAt = expiresAt;
    this.save();
  }

  public updateAccountProfile(
    accountId: string,
    patch: Partial<Pick<GitLabAccount, 'name' | 'username' | 'email' | 'avatarUrl'>>
  ): GitLabAccount | null {
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return null;
    Object.assign(account, patch);
    this.save();
    return { ...account };
  }

  public removeAccount(id: string): void {
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
    this.save();
  }

  public updateRepositoryMetadata(
    id: string,
    patch: Partial<
      Pick<
        RepositoryRecord,
        'gitlabInstanceUrl' | 'gitlabProjectId' | 'gitlabProjectPath' | 'accountId' | 'avatarUrl'
      >
    >
  ): RepositoryRecord | null {
    const repo = this.state.repositories.find((r) => r.id === id);
    if (!repo) return null;
    Object.assign(repo, patch);
    this.save();
    return { ...repo };
  }
}
