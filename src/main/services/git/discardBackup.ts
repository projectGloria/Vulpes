import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DiscardBackupRecord } from '@shared/types/git';

/**
 * Keeps a recoverable copy of discarded working-tree files so users never lose work.
 */
export class DiscardBackupStore {
  private readonly baseDir: string;

  constructor(userDataDir: string) {
    this.baseDir = path.join(userDataDir, 'discard-backups');
  }

  public backupFile(repoPath: string, relFilePath: string): DiscardBackupRecord | null {
    const absPath = path.resolve(repoPath, relFilePath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return null;
    }

    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const safeName = relFilePath.replace(/[\\/]/g, '__');
    const backupDir = path.join(this.baseDir, id);
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, safeName);
    fs.copyFileSync(absPath, backupPath);

    return {
      id,
      repoPath,
      filePath: relFilePath,
      backupPath,
      createdAt: new Date().toISOString()
    };
  }
}
