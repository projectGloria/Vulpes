import crypto from 'crypto';
import path from 'path';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { ZodError, type ZodType } from 'zod';
import type { IpcChannel, IpcChannelMap, IpcResponse } from '@shared/ipc/channels';
import {
  accountIdSchema,
  addRepoSchema,
  applyPartialPatchSchema,
  cancelOperationSchema,
  cloneRepoSchema,
  commitFileDiffSchema,
  commitSchema,
  commitShaSchema,
  conflictOpSchema,
  createBranchSchema,
  createMrSchema,
  createRepoSchema,
  deleteBranchSchema,
  discardFileSchema,
  fetchAvatarSchema,
  fileDiffSchema,
  jobIdSchema,
  listIssuesSchema,
  listMrsSchema,
  listPipelinesSchema,
  listProjectsSchema,
  logSchema,
  mrDetailSchema,
  notifySchema,
  openExternalSchema,
  openInEditorSchema,
  pickDirectorySchema,
  pipelineIdSchema,
  projectRefSchema,
  pullSchema,
  pushSchema,
  removeRepoSchema,
  renameBranchSchema,
  repoFileSchema,
  repoStatusSchema,
  resolveConflictSchema,
  resolveRepoGitLabSchema,
  saveRepoSettingsSchema,
  selectRepoSchema,
  signInOAuthSchema,
  signInPatSchema,
  stashPushSchema,
  stashRefSchema,
  switchBranchSchema,
  updatePreferencesSchema
} from '@shared/ipc/schemas';
import { parseGitRemoteUrl } from '@shared/utils/url';
import type { GitProgressEvent, RepositoryRecord } from '@shared/types/git';
import type { GitLabAccount, GitLabUser } from '@shared/types/gitlab';
import type { GitService } from '../services/git/GitService';
import type { AppStore } from '../services/storage/AppStore';
import type { Logger } from '../services/logging/logger';
import type { RepoWatcher } from '../services/watcher/RepoWatcher';
import type { SecretStore } from '../services/secrets/SecretStore';
import type { GitLabClient } from '../services/gitlab/GitLabClient';
import { normalizeInstanceUrl, runLoopbackOAuthFlow } from '../services/gitlab/oauth';

export interface MainContext {
  gitService: GitService;
  appStore: AppStore;
  secretStore: SecretStore;
  gitlabClient: GitLabClient;
  logger: Logger;
  repoWatcher: RepoWatcher;
  getMainWindow: () => BrowserWindow | null;
}

function handle<C extends IpcChannel>(
  channel: C,
  schema: ZodType<IpcChannelMap[C]['req']> | null,
  logger: Logger,
  fn: (payload: IpcChannelMap[C]['req']) => Promise<IpcChannelMap[C]['res']> | IpcChannelMap[C]['res']
): void {
  ipcMain.handle(channel, async (_event, rawPayload: unknown): Promise<IpcResponse<IpcChannelMap[C]['res']>> => {
    try {
      const payload = schema ? schema.parse(rawPayload) : (undefined as IpcChannelMap[C]['req']);
      const data = await fn(payload);
      return { ok: true, data };
    } catch (err) {
      const message =
        err instanceof ZodError
          ? err.issues.map((issue) => issue.message).join('. ')
          : err instanceof Error
            ? err.message
            : 'Unexpected IPC error';
      logger.warn('ipc', `Handler ${channel} failed`, { error: message });
      return {
        ok: false,
        error: {
          code: err instanceof ZodError ? 'VALIDATION_ERROR' : err instanceof Error ? err.name : 'IPC_ERROR',
          message
        }
      };
    }
  });
}

export function registerIpcHandlers(ctx: MainContext): void {
  const { gitService, appStore, secretStore, gitlabClient, logger, repoWatcher, getMainWindow } =
    ctx;
  const activeOps = new Map<string, AbortController>();

  const watchActiveRepo = (): void => {
    const activeId = appStore.getActiveRepoId();
    const repo = appStore.getRepositories().find((r) => r.id === activeId);
    repoWatcher.watch(repo?.path ?? null, (changedPath) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('repo:changed', { repoPath: changedPath });
      }
    });
  };

  const emitGitProgress = (evt: GitProgressEvent): void => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('git:progress', evt);
    }
  };

  handle('app:getVersion', null, logger, () => ({
    version: app.getVersion(),
    platform: process.platform,
    logPath: logger.getLogFilePath()
  }));

  handle('window:minimize', null, logger, () => {
    getMainWindow()?.minimize();
  });

  handle('window:maximizeToggle', null, logger, () => {
    const win = getMainWindow();
    if (!win) return { maximized: false };
    if (win.isMaximized()) {
      win.unmaximize();
      return { maximized: false };
    }
    win.maximize();
    return { maximized: true };
  });

  handle('window:close', null, logger, () => {
    getMainWindow()?.close();
  });

  handle('window:isMaximized', null, logger, () => ({
    maximized: getMainWindow()?.isMaximized() ?? false
  }));

  handle('app:openExternal', openExternalSchema, logger, async ({ url }) => {
    await shell.openExternal(url);
  });

  handle('app:openLogs', null, logger, async () => {
    const logPath = logger.getLogFilePath();
    shell.showItemInFolder(logPath);
  });

  handle('app:pickDirectory', pickDirectorySchema, logger, async ({ title, defaultPath }) => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: title ?? 'Select Folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null };
    }
    return { path: result.filePaths[0] };
  });

  handle('app:getPreferences', null, logger, () => appStore.getPreferences());

  handle('app:updatePreferences', updatePreferencesSchema, logger, (partial) =>
    appStore.updatePreferences(partial)
  );

  handle('git:checkInstall', null, logger, () => gitService.checkInstallation());

  handle('git:getStatus', repoStatusSchema, logger, ({ repoPath }) =>
    gitService.getStatus(repoPath)
  );

  handle('repo:list', null, logger, () => {
    watchActiveRepo();
    return {
      repositories: appStore.getRepositories(),
      activeRepoId: appStore.getActiveRepoId()
    };
  });

  handle('repo:add', addRepoSchema, logger, async ({ path: inputPath }) => {
    const topLevel = await gitService.getRepoTopLevel(inputPath);
    const remotes = await gitService.getRemotes(topLevel).catch(() => []);
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
    const parsedRemote = origin ? parseGitRemoteUrl(origin.fetchUrl || origin.pushUrl) : null;

    const now = new Date().toISOString();
    const record: RepositoryRecord = {
      id: crypto.randomUUID(),
      name: path.basename(topLevel),
      path: topLevel,
      addedAt: now,
      lastOpenedAt: now,
      gitlabInstanceUrl: parsedRemote?.baseUrl,
      gitlabProjectPath: parsedRemote?.projectPath
    };

    const saved = appStore.upsertRepository(record);
    watchActiveRepo();
    logger.info('repo', 'Added local repository', { path: saved.path });
    return saved;
  });

  handle('repo:create', createRepoSchema, logger, async (options) => {
    const repoPath = await gitService.createRepository(options);
    const now = new Date().toISOString();
    const record: RepositoryRecord = {
      id: crypto.randomUUID(),
      name: path.basename(repoPath),
      path: repoPath,
      addedAt: now,
      lastOpenedAt: now
    };
    const saved = appStore.upsertRepository(record);
    watchActiveRepo();
    logger.info('repo', 'Created new local repository', { path: saved.path });
    return saved;
  });

  handle('repo:remove', removeRepoSchema, logger, ({ id }) => {
    appStore.removeRepository(id);
    watchActiveRepo();
  });

  handle('repo:select', selectRepoSchema, logger, ({ id }) => {
    appStore.setActiveRepoId(id);
    watchActiveRepo();
  });

  // --- Phase 2: Authentication & GitLab accounts ---
  handle('auth:listAccounts', null, logger, () => appStore.getAccounts());

  handle('auth:signInPat', signInPatSchema, logger, async ({ instanceUrl, token }) => {
    const normalizedUrl = normalizeInstanceUrl(instanceUrl);
    const user = await gitlabClient.verifyCredentials(normalizedUrl, token, 'pat');
    const accountId = crypto.randomUUID();
    const saved = appStore.upsertAccount({
      id: accountId,
      instanceUrl: normalizedUrl,
      authMethod: 'pat',
      userId: user.id,
      username: user.username,
      name: user.name,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null,
      createdAt: new Date().toISOString()
    });
    secretStore.setToken(saved.id, { accessToken: token });
    logger.info('auth', 'Signed in with Personal Access Token', {
      instanceUrl: normalizedUrl,
      username: user.username
    });
    return saved;
  });

  handle('auth:signInOAuth', signInOAuthSchema, logger, async ({ instanceUrl, clientId }) => {
    const normalizedUrl = normalizeInstanceUrl(instanceUrl);
    const tokenPayload = await runLoopbackOAuthFlow({
      instanceUrl: normalizedUrl,
      clientId,
      openBrowser: async (authUrl) => {
        await shell.openExternal(authUrl);
      }
    });
    const user = await gitlabClient.verifyCredentials(
      normalizedUrl,
      tokenPayload.accessToken,
      'oauth'
    );
    const saved: GitLabAccount = appStore.upsertAccount({
      id: crypto.randomUUID(),
      instanceUrl: normalizedUrl,
      authMethod: 'oauth',
      userId: user.id,
      username: user.username,
      name: user.name,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null,
      createdAt: new Date().toISOString(),
      tokenExpiresAt: tokenPayload.expiresAt ?? null,
      oauthClientId: clientId
    });
    secretStore.setToken(saved.id, tokenPayload);
    logger.info('auth', 'Signed in with OAuth 2.0 + PKCE', {
      instanceUrl: normalizedUrl,
      username: user.username
    });
    return saved;
  });

  handle('auth:signOut', accountIdSchema, logger, ({ accountId }) => {
    secretStore.deleteToken(accountId);
    appStore.removeAccount(accountId);
    gitlabClient.clearCache();
    logger.info('auth', 'Signed out GitLab account', { accountId });
  });

  handle('auth:verifyAccount', accountIdSchema, logger, async ({ accountId }) => {
    const account = appStore.getAccountById(accountId);
    if (!account) return { valid: false, error: 'Account not found' };
    try {
      const user = await gitlabClient.request<GitLabUser>(account, '/user');
      appStore.updateAccountProfile(accountId, {
        name: user.name,
        username: user.username,
        email: user.email ?? null,
        avatarUrl: user.avatar_url ?? null
      });
      return { valid: true, username: user.username };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Verification failed' };
    }
  });

  handle('auth:refreshProfile', accountIdSchema, logger, async ({ accountId }) => {
    const account = appStore.getAccountById(accountId);
    if (!account) throw new Error('Account not found');
    const user = await gitlabClient.request<GitLabUser>(account, '/user');
    const updated = appStore.updateAccountProfile(accountId, {
      name: user.name,
      username: user.username,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null
    });
    return updated ?? account;
  });

  handle('gitlab:fetchAvatar', fetchAvatarSchema, logger, async ({ url, accountId }) => {
    const account = accountId ? appStore.getAccountById(accountId) : undefined;
    const dataUrl = await gitlabClient.fetchImageAsDataUrl(url, account);
    return { dataUrl };
  });

  // --- Phase 3: Clone & repository management ---
  handle('gitlab:listProjects', listProjectsSchema, logger, async ({ accountId, search, page }) => {
    const account = appStore.getAccountById(accountId);
    if (!account) throw new Error('GitLab account not found');
    return gitlabClient.listProjects(account, { search, page });
  });

  handle('repo:clone', cloneRepoSchema, logger, async (payload) => {
    const controller = new AbortController();
    activeOps.set(payload.operationId, controller);
    try {
      const clonedPath = await gitService.cloneRepository(
        payload.url,
        payload.targetDir,
        (progress) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('repo:cloneProgress', {
              operationId: payload.operationId,
              ...progress
            });
          }
        },
        controller.signal
      );

      const parsed = parseGitRemoteUrl(payload.url);
      const now = new Date().toISOString();
      const saved = appStore.upsertRepository({
        id: crypto.randomUUID(),
        name: path.basename(clonedPath),
        path: clonedPath,
        addedAt: now,
        lastOpenedAt: now,
        accountId: payload.accountId,
        gitlabInstanceUrl: payload.gitlabInstanceUrl ?? parsed?.baseUrl,
        gitlabProjectId: payload.gitlabProjectId,
        gitlabProjectPath: payload.gitlabProjectPath ?? parsed?.projectPath,
        avatarUrl: payload.avatarUrl ?? null
      });
      watchActiveRepo();
      logger.info('repo', 'Cloned repository', { path: clonedPath });
      return saved;
    } finally {
      activeOps.delete(payload.operationId);
    }
  });

  handle('repo:cancelOperation', cancelOperationSchema, logger, ({ operationId }) => {
    const controller = activeOps.get(operationId);
    if (controller) {
      controller.abort();
      activeOps.delete(operationId);
    }
  });

  handle('repo:getSettings', repoStatusSchema, logger, ({ repoPath }) =>
    gitService.getRepoSettings(repoPath)
  );

  handle('repo:saveSettings', saveRepoSettingsSchema, logger, (input) =>
    gitService.saveRepoSettings(input)
  );

  handle('repo:resolveGitLab', resolveRepoGitLabSchema, logger, async ({ repoId }) => {
    const repo = appStore.getRepositories().find((r) => r.id === repoId);
    if (!repo) return null;
    const remotes = await gitService.getRemotes(repo.path).catch(() => []);
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
    if (!origin) return repo;

    const parsed = parseGitRemoteUrl(origin.fetchUrl || origin.pushUrl);
    if (!parsed) return repo;

    const account = appStore.findAccountByInstance(parsed.baseUrl);
    if (!account) {
      return appStore.updateRepositoryMetadata(repo.id, {
        gitlabInstanceUrl: parsed.baseUrl,
        gitlabProjectPath: parsed.projectPath
      });
    }

    try {
      const project = await gitlabClient.getProjectByPath(account, parsed.projectPath);
      const avatarUrl = project.avatar_url ?? project.namespace?.avatar_url ?? null;
      return appStore.updateRepositoryMetadata(repo.id, {
        accountId: account.id,
        gitlabInstanceUrl: account.instanceUrl,
        gitlabProjectId: project.id,
        gitlabProjectPath: project.path_with_namespace,
        avatarUrl
      });
    } catch {
      return appStore.updateRepositoryMetadata(repo.id, {
        accountId: account.id,
        gitlabInstanceUrl: account.instanceUrl,
        gitlabProjectPath: parsed.projectPath
      });
    }
  });

  // --- Phase 4: Daily Git workflow ---
  handle('git:getFileDiff', fileDiffSchema, logger, ({ repoPath, filePath, staged, untracked, showFull }) =>
    gitService.getFileDiff(repoPath, filePath, staged, untracked, showFull)
  );

  handle('git:stageFile', repoFileSchema, logger, ({ repoPath, filePath }) =>
    gitService.stageFile(repoPath, filePath)
  );

  handle('git:unstageFile', repoFileSchema, logger, ({ repoPath, filePath }) =>
    gitService.unstageFile(repoPath, filePath)
  );

  handle('git:stageAll', repoStatusSchema, logger, ({ repoPath }) => gitService.stageAll(repoPath));

  handle('git:unstageAll', repoStatusSchema, logger, ({ repoPath }) =>
    gitService.unstageAll(repoPath)
  );

  handle('git:applyPartialPatch', applyPartialPatchSchema, logger, ({ repoPath, patch, reverse }) =>
    gitService.applyPartialPatch(repoPath, patch, reverse)
  );

  handle('git:discardFile', discardFileSchema, logger, ({ repoPath, filePath, untracked }) =>
    gitService.discardFile(repoPath, filePath, untracked)
  );

  handle('git:commit', commitSchema, logger, async ({ repoPath, summary, description, coAuthors, amend }) => {
    emitGitProgress({
      operation: 'commit',
      repoPath,
      stage: amend ? 'Amending commit...' : 'Creating commit...',
      percent: null,
      status: 'running'
    });
    try {
      await gitService.commit(repoPath, { summary, description, coAuthors, amend });
      emitGitProgress({
        operation: 'commit',
        repoPath,
        stage: amend ? 'Commit amended' : 'Commit created',
        percent: 100,
        status: 'done'
      });
    } catch (err) {
      emitGitProgress({
        operation: 'commit',
        repoPath,
        stage: 'Commit failed',
        percent: null,
        status: 'error',
        message: err instanceof Error ? err.message : 'Commit failed'
      });
      throw err;
    }
  });

  handle('git:undoLastCommit', repoStatusSchema, logger, ({ repoPath }) =>
    gitService.undoLastCommit(repoPath)
  );

  handle('git:listBranches', repoStatusSchema, logger, ({ repoPath }) =>
    gitService.listBranches(repoPath)
  );

  handle('git:createBranch', createBranchSchema, logger, ({ repoPath, name, startPoint }) =>
    gitService.createBranch(repoPath, name, startPoint)
  );

  handle('git:switchBranch', switchBranchSchema, logger, ({ repoPath, name }) =>
    gitService.switchBranch(repoPath, name)
  );

  handle('git:renameBranch', renameBranchSchema, logger, ({ repoPath, oldName, newName }) =>
    gitService.renameBranch(repoPath, oldName, newName)
  );

  handle('git:deleteBranch', deleteBranchSchema, logger, ({ repoPath, name, force }) =>
    gitService.deleteBranch(repoPath, name, force)
  );

  handle('git:stashPush', stashPushSchema, logger, ({ repoPath, message }) =>
    gitService.stashPush(repoPath, message)
  );

  handle('git:stashList', repoStatusSchema, logger, ({ repoPath }) =>
    gitService.stashList(repoPath)
  );

  handle('git:stashPop', stashRefSchema, logger, ({ repoPath, ref }) =>
    gitService.stashPop(repoPath, ref)
  );

  handle('git:stashDrop', stashRefSchema, logger, ({ repoPath, ref }) =>
    gitService.stashDrop(repoPath, ref)
  );

  handle('git:fetch', repoStatusSchema, logger, async ({ repoPath }) => {
    emitGitProgress({
      operation: 'fetch',
      repoPath,
      stage: 'Fetching from remote...',
      percent: null,
      status: 'running'
    });
    try {
      await gitService.fetch(repoPath, undefined, (progress) => {
        emitGitProgress({
          operation: 'fetch',
          repoPath,
          stage: progress.stage || 'Fetching...',
          percent: progress.percent,
          status: 'running',
          message: progress.raw
        });
      });
      emitGitProgress({
        operation: 'fetch',
        repoPath,
        stage: 'Fetch complete',
        percent: 100,
        status: 'done'
      });
    } catch (err) {
      emitGitProgress({
        operation: 'fetch',
        repoPath,
        stage: 'Fetch failed',
        percent: null,
        status: 'error',
        message: err instanceof Error ? err.message : 'Fetch failed'
      });
      throw err;
    }
  });

  handle('git:pull', pullSchema, logger, async ({ repoPath, strategy }) => {
    emitGitProgress({
      operation: 'pull',
      repoPath,
      stage: 'Pulling from remote...',
      percent: null,
      status: 'running'
    });
    try {
      await gitService.pull(
        repoPath,
        strategy ?? appStore.getPreferences().pullStrategy,
        undefined,
        (progress) => {
          emitGitProgress({
            operation: 'pull',
            repoPath,
            stage: progress.stage || 'Pulling...',
            percent: progress.percent,
            status: 'running',
            message: progress.raw
          });
        }
      );
      emitGitProgress({
        operation: 'pull',
        repoPath,
        stage: 'Pull complete',
        percent: 100,
        status: 'done'
      });
    } catch (err) {
      emitGitProgress({
        operation: 'pull',
        repoPath,
        stage: 'Pull failed',
        percent: null,
        status: 'error',
        message: err instanceof Error ? err.message : 'Pull failed'
      });
      throw err;
    }
  });

  handle('git:push', pushSchema, logger, async ({ repoPath, publish, branch }) => {
    emitGitProgress({
      operation: 'push',
      repoPath,
      stage: publish ? `Publishing ${branch ?? 'branch'}...` : 'Pushing to remote...',
      percent: null,
      status: 'running'
    });
    try {
      const result = await gitService.push(
        repoPath,
        { publish, branch },
        undefined,
        (progress) => {
          emitGitProgress({
            operation: 'push',
            repoPath,
            stage: progress.stage || 'Pushing...',
            percent: progress.percent,
            status: 'running',
            message: progress.raw
          });
        }
      );
      emitGitProgress({
        operation: 'push',
        repoPath,
        stage: publish ? 'Branch published' : 'Push complete',
        percent: 100,
        status: 'done'
      });
      return result;
    } catch (err) {
      emitGitProgress({
        operation: 'push',
        repoPath,
        stage: 'Push failed',
        percent: null,
        status: 'error',
        message: err instanceof Error ? err.message : 'Push failed'
      });
      throw err;
    }
  });

  handle('git:getLog', logSchema, logger, ({ repoPath, search, limit }) =>
    gitService.getLog(repoPath, { search, limit })
  );

  handle('git:getCommitFiles', commitShaSchema, logger, ({ repoPath, sha }) =>
    gitService.getCommitFiles(repoPath, sha)
  );

  handle('git:getCommitFileDiff', commitFileDiffSchema, logger, ({ repoPath, sha, filePath }) =>
    gitService.getCommitFileDiff(repoPath, sha, filePath)
  );

  handle('git:cherryPick', commitShaSchema, logger, ({ repoPath, sha }) =>
    gitService.cherryPick(repoPath, sha)
  );

  handle('git:revertCommit', commitShaSchema, logger, ({ repoPath, sha }) =>
    gitService.revertCommit(repoPath, sha)
  );

  handle('git:resolveConflict', resolveConflictSchema, logger, ({ repoPath, filePath, strategy }) =>
    gitService.resolveConflict(repoPath, filePath, strategy)
  );

  handle('git:continueOperation', conflictOpSchema, logger, ({ repoPath, mode }) =>
    gitService.continueOperation(repoPath, mode)
  );

  handle('git:abortOperation', conflictOpSchema, logger, ({ repoPath, mode }) =>
    gitService.abortOperation(repoPath, mode)
  );

  handle('app:openInEditor', openInEditorSchema, logger, async ({ repoPath, filePath }) => {
    const absPath = path.resolve(repoPath, filePath);
    if (!absPath.startsWith(path.resolve(repoPath))) {
      throw new Error('File path escapes repository root');
    }
    await shell.openPath(absPath);
  });

  // --- Phase 5: GitLab MRs, Pipelines, Issues, Notifications ---
  handle('app:notify', notifySchema, logger, ({ title, body, url }) => {
    if (!appStore.getPreferences().notificationsEnabled) return;
    if (!Notification.isSupported()) return;
    const notif = new Notification({ title, body });
    if (url) {
      notif.on('click', () => {
        void shell.openExternal(url);
      });
    }
    notif.show();
  });

  const requireAccount = (accountId: string) => {
    const account = appStore.getAccountById(accountId);
    if (!account) throw new Error('GitLab account not found');
    return account;
  };

  handle('gitlab:listMrs', listMrsSchema, logger, ({ accountId, projectId, filter }) => {
    const account = requireAccount(accountId);
    if (filter === 'opened_by_me') {
      return gitlabClient.listMergeRequests(account, projectId, { scope: 'created_by_me' });
    }
    if (filter === 'assigned_to_me') {
      return gitlabClient.listMergeRequests(account, projectId, { scope: 'assigned_to_me' });
    }
    if (filter === 'review_requested') {
      return gitlabClient.listMergeRequests(account, projectId, {
        reviewerUsername: account.username
      });
    }
    return gitlabClient.listMergeRequests(account, projectId, { scope: 'all' });
  });

  handle('gitlab:getMrDetails', mrDetailSchema, logger, async ({ accountId, projectId, mrIid }) => {
    const account = requireAccount(accountId);
    const [approvals, notes] = await Promise.all([
      gitlabClient.getMergeRequestApprovals(account, projectId, mrIid),
      gitlabClient.getMergeRequestNotes(account, projectId, mrIid)
    ]);
    return { approvals, notes };
  });

  handle('gitlab:createMr', createMrSchema, logger, (payload) => {
    const account = requireAccount(payload.accountId);
    return gitlabClient.createMergeRequest(account, payload.projectId, {
      source_branch: payload.sourceBranch,
      target_branch: payload.targetBranch,
      title: payload.title,
      description: payload.description,
      assignee_ids: payload.assigneeIds,
      reviewer_ids: payload.reviewerIds,
      labels: payload.labels,
      milestone_id: payload.milestoneId,
      squash: payload.squash,
      remove_source_branch: payload.removeSourceBranch
    });
  });

  handle('gitlab:listProjectMeta', projectRefSchema, logger, async ({ accountId, projectId }) => {
    const account = requireAccount(accountId);
    const [members, milestones] = await Promise.all([
      gitlabClient.listProjectMembers(account, projectId).catch(() => []),
      gitlabClient.listProjectMilestones(account, projectId).catch(() => [])
    ]);
    return { members, milestones };
  });

  handle('gitlab:listPipelines', listPipelinesSchema, logger, ({ accountId, projectId, ref }) => {
    const account = requireAccount(accountId);
    return gitlabClient.listPipelines(account, projectId, ref);
  });

  handle('gitlab:listPipelineJobs', pipelineIdSchema, logger, ({ accountId, projectId, pipelineId }) => {
    const account = requireAccount(accountId);
    return gitlabClient.listPipelineJobs(account, projectId, pipelineId);
  });

  handle('gitlab:getJobTrace', jobIdSchema, logger, ({ accountId, projectId, jobId }) => {
    const account = requireAccount(accountId);
    return gitlabClient.getJobTrace(account, projectId, jobId);
  });

  handle('gitlab:retryPipeline', pipelineIdSchema, logger, ({ accountId, projectId, pipelineId }) => {
    const account = requireAccount(accountId);
    return gitlabClient.retryPipeline(account, projectId, pipelineId);
  });

  handle('gitlab:cancelPipeline', pipelineIdSchema, logger, ({ accountId, projectId, pipelineId }) => {
    const account = requireAccount(accountId);
    return gitlabClient.cancelPipeline(account, projectId, pipelineId);
  });

  handle('gitlab:listIssues', listIssuesSchema, logger, ({ accountId, projectId, search }) => {
    const account = requireAccount(accountId);
    return gitlabClient.listIssues(account, projectId, search);
  });
}
