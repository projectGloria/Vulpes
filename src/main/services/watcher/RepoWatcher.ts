import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';

export class RepoWatcher {
  private watcher: FSWatcher | null = null;
  private currentPath: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  public watch(repoPath: string | null, onChange: (repoPath: string) => void): void {
    const normalized = repoPath ? path.resolve(repoPath) : null;
    if (normalized === this.currentPath) return;

    void this.stop();
    this.currentPath = normalized;

    if (!normalized) return;

    const trigger = (): void => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (this.currentPath === normalized) {
          onChange(normalized);
        }
      }, 250);
    };

    this.watcher = chokidar.watch(normalized, {
      ignoreInitial: true,
      persistent: true,
      depth: 6,
      ignored: (filePath: string) => {
        const rel = path.relative(normalized, filePath).replace(/\\/g, '/');
        if (!rel) return false;
        if (rel === 'node_modules' || rel.startsWith('node_modules/')) return true;
        if (rel.startsWith('.git/objects') || rel.startsWith('.git/logs')) return true;
        return false;
      }
    });

    this.watcher.on('all', trigger);
    this.watcher.on('error', () => {
      // Watcher errors are non-fatal; user can still refresh manually
    });
  }

  public async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      const existing = this.watcher;
      this.watcher = null;
      this.currentPath = null;
      await existing.close().catch(() => {});
    }
  }
}
