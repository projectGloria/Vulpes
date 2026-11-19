import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { Logger } from '../logging/logger';

export function setupAutoUpdater(logger: Logger): void {
  if (!app.isPackaged) {
    logger.debug('updater', 'Skipping auto-updater in unpackaged development mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('updater', 'Checking for updates');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('updater', 'Update available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('updater', 'Update downloaded and ready to install on quit', {
      version: info.version
    });
  });

  autoUpdater.on('error', (err) => {
    logger.warn('updater', 'Auto-updater error', { error: err.message });
  });

  void autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    logger.warn('updater', 'checkForUpdatesAndNotify failed', {
      error: err instanceof Error ? err.message : String(err)
    });
  });
}
