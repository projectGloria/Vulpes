import type {
  BranchInfo,
  CloneProgressEvent,
  CommitInfo,
  CreateRepoOptions,
  DiscardBackupRecord,
  FileDiff,
  GitInstallStatus,
  GitProgressEvent,
  RepoSettings,
  RepoStatus,
  RepositoryRecord,
  SaveRepoSettingsInput,
  StashEntry
} from '../types/git';
import type {
  GitLabAccount,
  GitLabIssue,
  GitLabJob,
  GitLabMergeRequest,
  GitLabPipeline,
  GitLabProject,
  GitLabUser
} from '../types/gitlab';
import type { AppPreferences, PullStrategy } from '../types/settings';

export interface IpcResult<T> {
  ok: true;
  data: T;
}

export interface IpcError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type IpcResponse<T> = IpcResult<T> | IpcError;

export interface IpcChannelMap {
  'app:getVersion': {
    req: void;
    res: { version: string; platform: NodeJS.Platform; logPath: string };
  };
  'app:openExternal': {
    req: { url: string };
    res: void;
  };
  'app:openLogs': {
    req: void;
    res: void;
  };
  'app:pickDirectory': {
    req: { title?: string; defaultPath?: string };
    res: { path: string | null };
  };
  'app:getPreferences': {
    req: void;
    res: AppPreferences;
  };
  'app:updatePreferences': {
    req: Partial<AppPreferences>;
    res: AppPreferences;
  };
  'window:minimize': {
    req: void;
    res: void;
  };
  'window:maximizeToggle': {
    req: void;
    res: { maximized: boolean };
  };
  'window:close': {
    req: void;
    res: void;
  };
  'window:isMaximized': {
    req: void;
    res: { maximized: boolean };
  };
  'git:checkInstall': {
    req: void;
    res: GitInstallStatus;
  };
  'git:getStatus': {
    req: { repoPath: string };
    res: RepoStatus;
  };
  'repo:list': {
    req: void;
    res: { repositories: RepositoryRecord[]; activeRepoId: string | null };
  };
  'repo:add': {
    req: { path: string };
    res: RepositoryRecord;
  };
  'repo:create': {
    req: CreateRepoOptions;
    res: RepositoryRecord;
  };
  'repo:remove': {
    req: { id: string };
    res: void;
  };
  'repo:select': {
    req: { id: string | null };
    res: void;
  };
  'auth:listAccounts': {
    req: void;
    res: GitLabAccount[];
  };
  'auth:signInPat': {
    req: { instanceUrl: string; token: string };
    res: GitLabAccount;
  };
  'auth:signInOAuth': {
    req: { instanceUrl: string; clientId: string };
    res: GitLabAccount;
  };
  'auth:signOut': {
    req: { accountId: string };
    res: void;
  };
  'auth:verifyAccount': {
    req: { accountId: string };
    res: { valid: boolean; username?: string; error?: string };
  };
  'auth:refreshProfile': {
    req: { accountId: string };
    res: GitLabAccount;
  };
  'gitlab:fetchAvatar': {
    req: { url: string; accountId?: string };
    res: { dataUrl: string | null };
  };
  'gitlab:listProjects': {
    req: { accountId: string; search?: string; page?: number };
    res: GitLabProject[];
  };
  'repo:clone': {
    req: {
      operationId: string;
      url: string;
      targetDir: string;
      accountId?: string;
      gitlabProjectId?: number;
      gitlabProjectPath?: string;
      gitlabInstanceUrl?: string;
      avatarUrl?: string | null;
    };
    res: RepositoryRecord;
  };
  'repo:cancelOperation': {
    req: { operationId: string };
    res: void;
  };
  'repo:getSettings': {
    req: { repoPath: string };
    res: RepoSettings;
  };
  'repo:saveSettings': {
    req: SaveRepoSettingsInput;
    res: RepoSettings;
  };
  'repo:resolveGitLab': {
    req: { repoId: string };
    res: RepositoryRecord | null;
  };
  'git:getFileDiff': {
    req: {
      repoPath: string;
      filePath: string;
      staged: boolean;
      untracked?: boolean;
      showFull?: boolean;
    };
    res: FileDiff;
  };
  'git:stageFile': { req: { repoPath: string; filePath: string }; res: void };
  'git:unstageFile': { req: { repoPath: string; filePath: string }; res: void };
  'git:stageAll': { req: { repoPath: string }; res: void };
  'git:unstageAll': { req: { repoPath: string }; res: void };
  'git:applyPartialPatch': {
    req: { repoPath: string; patch: string; reverse: boolean };
    res: void;
  };
  'git:discardFile': {
    req: { repoPath: string; filePath: string; untracked: boolean };
    res: DiscardBackupRecord | null;
  };
  'git:commit': {
    req: {
      repoPath: string;
      summary: string;
      description?: string;
      coAuthors?: string[];
      amend?: boolean;
    };
    res: void;
  };
  'git:undoLastCommit': {
    req: { repoPath: string };
    res: { summary: string; body: string };
  };
  'git:listBranches': { req: { repoPath: string }; res: BranchInfo[] };
  'git:createBranch': {
    req: { repoPath: string; name: string; startPoint?: string };
    res: void;
  };
  'git:switchBranch': { req: { repoPath: string; name: string }; res: void };
  'git:renameBranch': {
    req: { repoPath: string; oldName: string; newName: string };
    res: void;
  };
  'git:deleteBranch': {
    req: { repoPath: string; name: string; force?: boolean };
    res: void;
  };
  'git:stashPush': { req: { repoPath: string; message?: string }; res: void };
  'git:stashList': { req: { repoPath: string }; res: StashEntry[] };
  'git:stashPop': { req: { repoPath: string; ref?: string }; res: void };
  'git:stashDrop': { req: { repoPath: string; ref?: string }; res: void };
  'git:fetch': { req: { repoPath: string }; res: void };
  'git:pull': { req: { repoPath: string; strategy?: PullStrategy }; res: void };
  'git:push': {
    req: { repoPath: string; publish?: boolean; branch?: string };
    res: { publishedNewBranch: boolean; branchName: string | null };
  };
  'git:getLog': {
    req: { repoPath: string; search?: string; limit?: number };
    res: CommitInfo[];
  };
  'git:getCommitFiles': { req: { repoPath: string; sha: string }; res: string[] };
  'git:getCommitFileDiff': {
    req: { repoPath: string; sha: string; filePath: string };
    res: FileDiff;
  };
  'git:cherryPick': { req: { repoPath: string; sha: string }; res: void };
  'git:revertCommit': { req: { repoPath: string; sha: string }; res: void };
  'git:resolveConflict': {
    req: { repoPath: string; filePath: string; strategy: 'ours' | 'theirs' | 'mark-resolved' };
    res: void;
  };
  'git:continueOperation': { req: { repoPath: string; mode: 'merge' | 'rebase' }; res: void };
  'git:abortOperation': { req: { repoPath: string; mode: 'merge' | 'rebase' }; res: void };
  'app:openInEditor': { req: { repoPath: string; filePath: string }; res: void };
  'app:notify': { req: { title: string; body: string; url?: string }; res: void };
  'gitlab:listMrs': {
    req: {
      accountId: string;
      projectId: number | string;
      filter?: 'opened_by_me' | 'assigned_to_me' | 'review_requested' | 'all';
    };
    res: GitLabMergeRequest[];
  };
  'gitlab:getMrDetails': {
    req: { accountId: string; projectId: number | string; mrIid: number };
    res: {
      approvals: { approved: boolean; approvals_left: number; approved_by: Array<{ user: GitLabUser }> };
      notes: Array<{ id: number; body: string; author: GitLabUser; created_at: string; system: boolean }>;
    };
  };
  'gitlab:createMr': {
    req: {
      accountId: string;
      projectId: number | string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description?: string;
      assigneeIds?: number[];
      reviewerIds?: number[];
      labels?: string;
      milestoneId?: number;
      squash?: boolean;
      removeSourceBranch?: boolean;
    };
    res: GitLabMergeRequest;
  };
  'gitlab:listProjectMeta': {
    req: { accountId: string; projectId: number | string };
    res: { members: GitLabUser[]; milestones: Array<{ id: number; iid: number; title: string }> };
  };
  'gitlab:listPipelines': {
    req: { accountId: string; projectId: number | string; ref?: string };
    res: GitLabPipeline[];
  };
  'gitlab:listPipelineJobs': {
    req: { accountId: string; projectId: number | string; pipelineId: number };
    res: GitLabJob[];
  };
  'gitlab:getJobTrace': {
    req: { accountId: string; projectId: number | string; jobId: number };
    res: string;
  };
  'gitlab:retryPipeline': {
    req: { accountId: string; projectId: number | string; pipelineId: number };
    res: GitLabPipeline;
  };
  'gitlab:cancelPipeline': {
    req: { accountId: string; projectId: number | string; pipelineId: number };
    res: GitLabPipeline;
  };
  'gitlab:listIssues': {
    req: { accountId: string; projectId: number | string; search?: string };
    res: GitLabIssue[];
  };
}

export type IpcChannel = keyof IpcChannelMap;

export interface IpcEventMap {
  'repo:changed': { repoPath: string };
  'repo:cloneProgress': CloneProgressEvent;
  'git:progress': GitProgressEvent;
  'window:maximizedChanged': { maximized: boolean };
}

export type IpcEventChannel = keyof IpcEventMap;
