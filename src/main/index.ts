import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, Menu, safeStorage, session, shell } from 'electron';
import { isSafeExternalUrl, parseGitRemoteUrl } from '@shared/utils/url';
import { GitService } from './services/git/GitService';
import { DiscardBackupStore } from './services/git/discardBackup';
import { Logger } from './services/logging/logger';
import { AppStore } from './services/storage/AppStore';
import { RepoWatcher } from './services/watcher/RepoWatcher';
import { SecretStore } from './services/secrets/SecretStore';
import { GitLabClient } from './services/gitlab/GitLabClient';
import { registerIpcHandlers } from './ipc/registerHandlers';
import { buildApplicationMenu } from './menu';
import { setupAutoUpdater } from './services/updater/AutoUpdater';

let mainWindow: BrowserWindow | null = null;
let repoWatcher: RepoWatcher | null = null;

function resolveAppIconPath(): string | undefined {
  const iconFile = process.platform === 'win32' ? 'Vulpes.ico' : 'Vulpes.png';
  const candidates = [
    path.join(app.getAppPath(), iconFile),
    path.join(process.cwd(), iconFile),
    path.join(process.resourcesPath, iconFile),
    path.join(__dirname, '../../', iconFile)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function createMainWindow(logger: Logger): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const iconPath = resolveAppIconPath();

  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Vulpes',
    icon: iconPath,
    frame: false,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    autoHideMenuBar: true,
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  const revealWindow = (): void => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  };

  win.once('ready-to-show', revealWindow);
  win.webContents.once('did-finish-load', revealWindow);
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('window', 'Failed to load renderer', { errorCode, errorDescription, validatedURL });
    revealWindow();
  });

  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window:maximizedChanged', { maximized: true });
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window:maximizedChanged', { maximized: false });
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    } else {
      logger.warn('security', 'Blocked unsafe external URL', { url });
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
    logger.warn('security', 'Blocked unexpected navigation', { url });
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function applyContentSecurityPolicy(): void {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: http://localhost:*;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });
}

app.setName('Vulpes');
if (process.platform === 'win32') {
  app.setAppUserModelId('dev.vulpes.app');
}

app.whenReady().then(() => {
  if (!app.isDefaultProtocolClient('vulpes')) {
    app.setAsDefaultProtocolClient('vulpes');
  }

  const userDataDir = app.getPath('userData');
  const logger = new Logger(path.join(userDataDir, 'logs'));
  const appStore = new AppStore(userDataDir);
  const secretStore = new SecretStore(userDataDir, safeStorage);
  const gitlabClient = new GitLabClient({
    getToken: (accountId) => secretStore.getToken(accountId),
    saveToken: (accountId, token) => secretStore.setToken(accountId, token),
    updateAccountExpiry: (accountId, expiresAt) =>
      appStore.updateAccountExpiry(accountId, expiresAt)
  });

  const discardBackupStore = new DiscardBackupStore(userDataDir);
  const gitService = new GitService(async (remoteUrl) => {
    const parsed = parseGitRemoteUrl(remoteUrl);
    if (!parsed) return null;
    const account = appStore.findAccountByInstance(parsed.baseUrl);
    if (!account) return null;
    try {
      const token = await gitlabClient.getValidToken(account);
      return {
        username: account.authMethod === 'oauth' ? 'oauth2' : account.username,
        token: token.accessToken
      };
    } catch {
      return null;
    }
  }, discardBackupStore);
  repoWatcher = new RepoWatcher();

  logger.info('app', 'Starting Vulpes', {
    version: app.getVersion(),
    platform: process.platform
  });

  applyContentSecurityPolicy();
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(buildApplicationMenu(logger));
  } else {
    Menu.setApplicationMenu(null);
  }

  registerIpcHandlers({
    gitService,
    appStore,
    secretStore,
    gitlabClient,
    logger,
    repoWatcher,
    getMainWindow: () => mainWindow
  });

  mainWindow = createMainWindow(logger);
  setupAutoUpdater(logger);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(logger);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void repoWatcher?.stop();
});
