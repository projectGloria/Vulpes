export interface GitInstallStatus {
  installed: boolean;
  version: string | null;
  binaryPath: string | null;
  error?: string;
}

export interface RepositoryRecord {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  lastOpenedAt: string;
  gitlabInstanceUrl?: string;
  gitlabProjectId?: number;
  gitlabProjectPath?: string;
  accountId?: string;
  avatarUrl?: string | null;
}

export type GitOperationKind = 'fetch' | 'pull' | 'push' | 'commit' | 'clone';

export interface GitProgressEvent {
  operation: GitOperationKind;
  repoPath: string;
  stage: string;
  percent: number | null;
  status: 'running' | 'done' | 'error';
  message?: string;
}

export type FileChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unmerged';

export interface FileChange {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  kind: FileChangeKind;
  staged: boolean;
  unstaged: boolean;
  conflicted: boolean;
}

export interface BranchSummary {
  name: string;
  oid: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  unborn: boolean;
}

export interface RepoStatus {
  repoPath: string;
  branch: BranchSummary;
  files: FileChange[];
  isMerging: boolean;
  isRebasing: boolean;
  isCherryPicking: boolean;
  hasConflicts: boolean;
  remotes: RemoteInfo[];
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface CreateRepoOptions {
  parentDir: string;
  name: string;
  defaultBranch?: string;
  initReadme?: boolean;
  gitignoreTemplate?: 'none' | 'node' | 'python' | 'rust' | 'go';
}

export interface CloneProgressEvent {
  operationId: string;
  stage: string;
  percent: number | null;
  raw: string;
}

export interface RepoSettings {
  repoPath: string;
  remotes: RemoteInfo[];
  defaultBranch: string;
  authorName: string;
  authorEmail: string;
  gitignore: string;
}

export interface SaveRepoSettingsInput {
  repoPath: string;
  authorName?: string;
  authorEmail?: string;
  gitignore?: string;
  addRemote?: { name: string; url: string };
  updateRemote?: { name: string; url: string };
  removeRemote?: string;
}

export type DiffLineType = 'context' | 'addition' | 'deletion' | 'meta';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  isBinary: boolean;
  isImage: boolean;
  isTooLarge: boolean;
  byteSize: number;
  hunks: DiffHunk[];
  rawPatch: string;
  oldImageDataUrl?: string | null;
  newImageDataUrl?: string | null;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  summary: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  parents: string[];
  refs: string[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
  lastCommitDate: string;
  lastCommitSha: string;
}

export interface StashEntry {
  index: number;
  ref: string;
  message: string;
  date: string;
}

export interface DiscardBackupRecord {
  id: string;
  repoPath: string;
  filePath: string;
  backupPath: string;
  createdAt: string;
}
