import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcChannel,
  IpcChannelMap,
  IpcEventChannel,
  IpcEventMap,
  IpcResponse
} from '@shared/ipc/channels';

const ALLOWED_INVOKE_CHANNELS = new Set<IpcChannel>([
  'app:getVersion',
  'app:openExternal',
  'app:openLogs',
  'app:pickDirectory',
  'app:getPreferences',
  'app:updatePreferences',
  'window:minimize',
  'window:maximizeToggle',
  'window:close',
  'window:isMaximized',
  'git:checkInstall',
  'git:getStatus',
  'repo:list',
  'repo:add',
  'repo:create',
  'repo:remove',
  'repo:select',
  'auth:listAccounts',
  'auth:signInPat',
  'auth:signInOAuth',
  'auth:signOut',
  'auth:verifyAccount',
  'auth:refreshProfile',
  'gitlab:fetchAvatar',
  'gitlab:listProjects',
  'repo:clone',
  'repo:cancelOperation',
  'repo:getSettings',
  'repo:saveSettings',
  'repo:resolveGitLab',
  'git:getFileDiff',
  'git:stageFile',
  'git:unstageFile',
  'git:stageAll',
  'git:unstageAll',
  'git:applyPartialPatch',
  'git:discardFile',
  'git:commit',
  'git:undoLastCommit',
  'git:listBranches',
  'git:createBranch',
  'git:switchBranch',
  'git:renameBranch',
  'git:deleteBranch',
  'git:stashPush',
  'git:stashList',
  'git:stashPop',
  'git:stashDrop',
  'git:fetch',
  'git:pull',
  'git:push',
  'git:getLog',
  'git:getCommitFiles',
  'git:getCommitFileDiff',
  'git:cherryPick',
  'git:revertCommit',
  'git:resolveConflict',
  'git:continueOperation',
  'git:abortOperation',
  'app:openInEditor',
  'app:notify',
  'gitlab:listMrs',
  'gitlab:getMrDetails',
  'gitlab:createMr',
  'gitlab:listProjectMeta',
  'gitlab:listPipelines',
  'gitlab:listPipelineJobs',
  'gitlab:getJobTrace',
  'gitlab:retryPipeline',
  'gitlab:cancelPipeline',
  'gitlab:listIssues'
]);

const ALLOWED_EVENT_CHANNELS = new Set<IpcEventChannel>([
  'repo:changed',
  'repo:cloneProgress',
  'git:progress',
  'window:maximizedChanged'
]);

const api = {
  invoke<C extends IpcChannel>(
    channel: C,
    payload?: IpcChannelMap[C]['req']
  ): Promise<IpcResponse<IpcChannelMap[C]['res']>> {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.resolve({
        ok: false,
        error: { code: 'FORBIDDEN_CHANNEL', message: `Channel not allowed: ${channel}` }
      });
    }
    return ipcRenderer.invoke(channel, payload);
  },

  on<E extends IpcEventChannel>(
    channel: E,
    listener: (payload: IpcEventMap[E]) => void
  ): () => void {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      return () => {};
    }
    const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcEventMap[E]): void => {
      listener(payload);
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  }
};

export type GitLabDesktopApi = typeof api;

contextBridge.exposeInMainWorld('gitlabDesktop', api);
