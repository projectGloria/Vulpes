import fs from 'fs';
import path from 'path';
import type {
  BranchInfo,
  CommitInfo,
  CreateRepoOptions,
  DiscardBackupRecord,
  FileDiff,
  GitInstallStatus,
  RemoteInfo,
  RepoSettings,
  RepoStatus,
  SaveRepoSettingsInput,
  StashEntry
} from '@shared/types/git';
import type { PullStrategy } from '@shared/types/settings';
import { runGit, type GitRunOptions, type GitRunResult } from './gitRunner';
import { createAskpassContext } from './askpass';
import { parseGitVersion, parsePorcelainV2Status, parseRemotes } from './parsers';
import {
  parseBranches,
  parseGitLogZ,
  parseStashes,
  parseUnifiedDiff
} from './diffParser';
import type { DiscardBackupStore } from './discardBackup';

export interface GitHttpsCredentials {
  username: string;
  token: string;
}

export type GitCredentialResolver = (remoteUrl: string) => Promise<GitHttpsCredentials | null>;

const GITIGNORE_TEMPLATES: Record<string, string> = {
  node: 'node_modules/\ndist/\n.env\n.env.local\n*.log\n.DS_Store\n',
  python: '__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\n.DS_Store\n',
  rust: 'target/\nCargo.lock\n.DS_Store\n',
  go: 'bin/\n*.exe\n*.test\n.env\n.DS_Store\n'
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);
const LARGE_DIFF_THRESHOLD_BYTES = 200_000;

export class GitService {
  private readonly resolveCredentials?: GitCredentialResolver;
  private readonly discardBackupStore?: DiscardBackupStore;

  constructor(
    resolveCredentials?: GitCredentialResolver,
    discardBackupStore?: DiscardBackupStore
  ) {
    this.resolveCredentials = resolveCredentials;
    this.discardBackupStore = discardBackupStore;
  }

  protected async runAuthenticatedGit(
    args: string[],
    remoteUrl: string | null,
    options: GitRunOptions = {}
  ): Promise<GitRunResult> {
    const isHttps = remoteUrl !== null && /^https?:\/\//i.test(remoteUrl);
    const creds = isHttps && this.resolveCredentials ? await this.resolveCredentials(remoteUrl) : null;
    if (!creds) {
      return runGit(args, options);
    }

    const askpass = createAskpassContext(creds.username, creds.token);
    try {
      return await runGit(args, {
        ...options,
        env: {
          ...options.env,
          ...askpass.env
        }
      });
    } finally {
      askpass.cleanup();
    }
  }

  public async checkInstallation(): Promise<GitInstallStatus> {
    try {
      const { stdout } = await runGit(['--version']);
      const version = parseGitVersion(stdout);
      const binaryPath = await this.locateGitBinary();
      return {
        installed: true,
        version,
        binaryPath
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Git executable not found in PATH';
      return {
        installed: false,
        version: null,
        binaryPath: null,
        error: message
      };
    }
  }

  private async locateGitBinary(): Promise<string | null> {
    try {
      const { stdout } = await runGit(['--exec-path']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  public async getRepoTopLevel(dirPath: string): Promise<string> {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }
    const { stdout } = await runGit(['rev-parse', '--show-toplevel'], { cwd: resolved });
    const topLevel = stdout.trim();
    if (!topLevel) {
      throw new Error('The selected folder is not inside a Git repository.');
    }
    return path.resolve(topLevel);
  }

  public async createRepository(options: CreateRepoOptions): Promise<string> {
    const parentDir = path.resolve(options.parentDir);
    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      throw new Error(`Parent folder does not exist: ${parentDir}`);
    }

    const repoPath = path.join(parentDir, options.name);
    if (fs.existsSync(repoPath)) {
      throw new Error(`A folder named "${options.name}" already exists in ${parentDir}`);
    }

    fs.mkdirSync(repoPath, { recursive: true });

    const defaultBranch = options.defaultBranch?.trim() || 'main';
    await runGit(['init', '-b', defaultBranch], { cwd: repoPath });

    let createdInitialFiles = false;
    if (options.initReadme) {
      fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${options.name}\n`, 'utf8');
      createdInitialFiles = true;
    }

    const templateKey = options.gitignoreTemplate ?? 'none';
    if (templateKey !== 'none' && GITIGNORE_TEMPLATES[templateKey]) {
      fs.writeFileSync(path.join(repoPath, '.gitignore'), GITIGNORE_TEMPLATES[templateKey], 'utf8');
      createdInitialFiles = true;
    }

    if (createdInitialFiles) {
      await runGit(['add', '--all'], { cwd: repoPath });
    }

    return repoPath;
  }

  public async getRemotes(repoPath: string): Promise<RemoteInfo[]> {
    const { stdout } = await runGit(['remote', '-v'], { cwd: repoPath });
    return parseRemotes(stdout);
  }

  public async getStatus(repoPath: string, signal?: AbortSignal): Promise<RepoStatus> {
    const [{ stdout: statusOut }, remotes, gitDir] = await Promise.all([
      runGit(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'], {
        cwd: repoPath,
        signal
      }),
      this.getRemotes(repoPath),
      this.getGitDir(repoPath)
    ]);

    const parsed = parsePorcelainV2Status(statusOut);

    const isMerging = gitDir ? fs.existsSync(path.join(gitDir, 'MERGE_HEAD')) : false;
    const isRebasing = gitDir
      ? fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
        fs.existsSync(path.join(gitDir, 'rebase-apply'))
      : false;
    const isCherryPicking = gitDir ? fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD')) : false;

    return {
      repoPath,
      branch: parsed.branch,
      files: parsed.files,
      isMerging,
      isRebasing,
      isCherryPicking,
      hasConflicts: parsed.hasConflicts,
      remotes
    };
  }

  private async getGitDir(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await runGit(['rev-parse', '--absolute-git-dir'], { cwd: repoPath });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  public async cloneRepository(
    url: string,
    targetDir: string,
    onProgress?: (progress: { stage: string; percent: number | null; raw: string }) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const resolvedTarget = path.resolve(targetDir);
    if (fs.existsSync(resolvedTarget) && fs.readdirSync(resolvedTarget).length > 0) {
      throw new Error(`Destination folder is not empty: ${resolvedTarget}`);
    }
    fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });

    await this.runAuthenticatedGit(['clone', '--progress', url, resolvedTarget], url, {
      signal,
      onStderrLine: (line) => {
        if (!onProgress) return;
        const pctMatch = /(\d+)%/.exec(line);
        const stageMatch = /^([^:]+):/.exec(line.trim());
        onProgress({
          stage: stageMatch ? stageMatch[1].trim() : 'Cloning',
          percent: pctMatch ? Number.parseInt(pctMatch[1], 10) : null,
          raw: line.trim()
        });
      }
    });

    return resolvedTarget;
  }

  public async getRepoSettings(repoPath: string): Promise<RepoSettings> {
    const [remotes, authorName, authorEmail, defaultBranch] = await Promise.all([
      this.getRemotes(repoPath),
      this.getConfigValue(repoPath, 'user.name'),
      this.getConfigValue(repoPath, 'user.email'),
      this.getDefaultBranch(repoPath)
    ]);

    const gitignorePath = path.join(repoPath, '.gitignore');
    const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

    return {
      repoPath,
      remotes,
      defaultBranch,
      authorName,
      authorEmail,
      gitignore
    };
  }

  public async saveRepoSettings(input: SaveRepoSettingsInput): Promise<RepoSettings> {
    const { repoPath } = input;

    if (input.authorName !== undefined) {
      if (input.authorName.trim()) {
        await runGit(['config', '--local', 'user.name', input.authorName.trim()], { cwd: repoPath });
      } else {
        await runGit(['config', '--local', '--unset', 'user.name'], {
          cwd: repoPath,
          allowNonZeroExit: true
        });
      }
    }

    if (input.authorEmail !== undefined) {
      if (input.authorEmail.trim()) {
        await runGit(['config', '--local', 'user.email', input.authorEmail.trim()], {
          cwd: repoPath
        });
      } else {
        await runGit(['config', '--local', '--unset', 'user.email'], {
          cwd: repoPath,
          allowNonZeroExit: true
        });
      }
    }

    if (input.gitignore !== undefined) {
      fs.writeFileSync(path.join(repoPath, '.gitignore'), input.gitignore, 'utf8');
    }

    if (input.addRemote) {
      await runGit(['remote', 'add', input.addRemote.name, input.addRemote.url], {
        cwd: repoPath
      });
    }

    if (input.updateRemote) {
      await runGit(['remote', 'set-url', input.updateRemote.name, input.updateRemote.url], {
        cwd: repoPath
      });
    }

    if (input.removeRemote) {
      await runGit(['remote', 'remove', input.removeRemote], { cwd: repoPath });
    }

    return this.getRepoSettings(repoPath);
  }

  private async getConfigValue(repoPath: string, key: string): Promise<string> {
    const { stdout, exitCode } = await runGit(['config', '--get', key], {
      cwd: repoPath,
      allowNonZeroExit: true
    });
    return exitCode === 0 ? stdout.trim() : '';
  }

  private async getDefaultBranch(repoPath: string): Promise<string> {
    const symbolic = await runGit(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], {
      cwd: repoPath,
      allowNonZeroExit: true
    });
    if (symbolic.exitCode === 0 && symbolic.stdout.trim()) {
      return symbolic.stdout.trim().replace(/^origin\//, '');
    }
    const head = await runGit(['symbolic-ref', '--short', 'HEAD'], {
      cwd: repoPath,
      allowNonZeroExit: true
    });
    return head.exitCode === 0 && head.stdout.trim() ? head.stdout.trim() : 'main';
  }

  // --- Phase 4: Daily Git Workflow ---

  public async getFileDiff(
    repoPath: string,
    filePath: string,
    staged: boolean,
    untracked = false,
    showFull = false
  ): Promise<FileDiff> {
    const ext = path.extname(filePath).toLowerCase();
    const isImage = IMAGE_EXTS.has(ext);
    const absPath = path.resolve(repoPath, filePath);

    if (isImage) {
      const mime = imageMime(ext);
      const newImageDataUrl = fs.existsSync(absPath)
        ? `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`
        : null;
      const oldImageDataUrl = await this.readGitObjectAsDataUrl(repoPath, `HEAD:${filePath}`, mime);
      return {
        path: filePath,
        isBinary: true,
        isImage: true,
        isTooLarge: false,
        byteSize: fs.existsSync(absPath) ? fs.statSync(absPath).size : 0,
        hunks: [],
        rawPatch: '',
        oldImageDataUrl,
        newImageDataUrl
      };
    }

    let rawPatch = '';
    if (untracked && !staged) {
      const { stdout } = await runGit(['diff', '--no-index', '--', '/dev/null', filePath], {
        cwd: repoPath,
        allowNonZeroExit: true
      });
      rawPatch = stdout;
    } else {
      const args = staged
        ? ['diff', '--cached', '--no-color', '--', filePath]
        : ['diff', '--no-color', '--', filePath];
      const { stdout } = await runGit(args, { cwd: repoPath });
      rawPatch = stdout;
    }

    const byteSize = Buffer.byteLength(rawPatch, 'utf8');
    const isBinary = rawPatch.includes('Binary files ') || rawPatch.includes('GIT binary patch');
    const isTooLarge = !showFull && byteSize > LARGE_DIFF_THRESHOLD_BYTES;

    return {
      path: filePath,
      isBinary,
      isImage: false,
      isTooLarge,
      byteSize,
      hunks: isBinary || isTooLarge ? [] : parseUnifiedDiff(rawPatch),
      rawPatch: isTooLarge ? '' : rawPatch
    };
  }

  private async readGitObjectAsDataUrl(
    repoPath: string,
    spec: string,
    mime: string
  ): Promise<string | null> {
    try {
      const { spawn } = await import('child_process');
      return await new Promise<string | null>((resolve) => {
        const child = spawn('git', ['show', spec], { cwd: repoPath, windowsHide: true });
        const chunks: Buffer[] = [];
        child.stdout.on('data', (c: Buffer) => chunks.push(c));
        child.on('close', (code) => {
          if (code !== 0 || chunks.length === 0) resolve(null);
          else resolve(`data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`);
        });
        child.on('error', () => resolve(null));
      });
    } catch {
      return null;
    }
  }

  public async stageFile(repoPath: string, filePath: string): Promise<void> {
    await runGit(['add', '--', filePath], { cwd: repoPath });
  }

  public async unstageFile(repoPath: string, filePath: string): Promise<void> {
    const res = await runGit(['reset', 'HEAD', '--', filePath], {
      cwd: repoPath,
      allowNonZeroExit: true
    });
    if (res.exitCode !== 0) {
      // Unborn HEAD fallback
      await runGit(['rm', '--cached', '--', filePath], { cwd: repoPath });
    }
  }

  public async stageAll(repoPath: string): Promise<void> {
    await runGit(['add', '--all'], { cwd: repoPath });
  }

  public async unstageAll(repoPath: string): Promise<void> {
    const res = await runGit(['reset', 'HEAD'], { cwd: repoPath, allowNonZeroExit: true });
    if (res.exitCode !== 0) {
      await runGit(['rm', '--cached', '-r', '.'], { cwd: repoPath, allowNonZeroExit: true });
    }
  }

  public async applyPartialPatch(
    repoPath: string,
    patch: string,
    reverse: boolean
  ): Promise<void> {
    const args = ['apply', '--cached', '--unidiff-zero'];
    if (reverse) args.push('--reverse');
    await runGit(args, { cwd: repoPath, stdin: patch });
  }

  public async discardFile(
    repoPath: string,
    filePath: string,
    untracked: boolean
  ): Promise<DiscardBackupRecord | null> {
    const backup = this.discardBackupStore?.backupFile(repoPath, filePath) ?? null;
    if (untracked) {
      const absPath = path.resolve(repoPath, filePath);
      if (fs.existsSync(absPath)) {
        fs.rmSync(absPath, { recursive: true, force: true });
      }
    } else {
      await runGit(['checkout', '--', filePath], { cwd: repoPath });
    }
    return backup;
  }

  public async commit(
    repoPath: string,
    options: {
      summary: string;
      description?: string;
      coAuthors?: string[];
      amend?: boolean;
    }
  ): Promise<void> {
    const parts = [options.summary.trim()];
    if (options.description?.trim()) {
      parts.push(options.description.trim());
    }
    const coAuthors = (options.coAuthors ?? []).map((c) => c.trim()).filter(Boolean);
    if (coAuthors.length > 0) {
      parts.push(coAuthors.map((c) => (c.startsWith('Co-authored-by:') ? c : `Co-authored-by: ${c}`)).join('\n'));
    }

    const fullMessage = parts.join('\n\n');
    const args = ['commit', '-m', fullMessage];
    if (options.amend) args.push('--amend');
    await runGit(args, { cwd: repoPath });
  }

  public async undoLastCommit(repoPath: string): Promise<{ summary: string; body: string }> {
    const logOut = await runGit(['log', '-1', '--format=%s%x1f%b'], { cwd: repoPath });
    const [summary = '', body = ''] = logOut.stdout.split('\x1f');

    const parentCheck = await runGit(['rev-parse', '--verify', 'HEAD~1'], {
      cwd: repoPath,
      allowNonZeroExit: true
    });
    if (parentCheck.exitCode === 0) {
      await runGit(['reset', '--soft', 'HEAD~1'], { cwd: repoPath });
    } else {
      await runGit(['update-ref', '-d', 'HEAD'], { cwd: repoPath });
    }

    return { summary: summary.trim(), body: body.trim() };
  }

  public async listBranches(repoPath: string): Promise<BranchInfo[]> {
    const { stdout } = await runGit(
      [
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(HEAD)%x1f%(refname)%x1f%(refname:short)%x1f%(upstream:short)%x1f%(committerdate:iso-strict)%x1f%(objectname:short)',
        'refs/heads',
        'refs/remotes'
      ],
      { cwd: repoPath }
    );
    return parseBranches(stdout);
  }

  public async createBranch(
    repoPath: string,
    name: string,
    startPoint?: string
  ): Promise<void> {
    const args = ['checkout', '-b', name];
    if (startPoint) args.push(startPoint);
    await runGit(args, { cwd: repoPath });
  }

  public async switchBranch(repoPath: string, branchName: string): Promise<void> {
    await runGit(['checkout', branchName], { cwd: repoPath });
  }

  public async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    await runGit(['branch', '-m', oldName, newName], { cwd: repoPath });
  }

  public async deleteBranch(repoPath: string, name: string, force = false): Promise<void> {
    await runGit(['branch', force ? '-D' : '-d', name], { cwd: repoPath });
  }

  public async stashPush(repoPath: string, message?: string): Promise<void> {
    const args = ['stash', 'push', '--include-untracked'];
    if (message?.trim()) args.push('-m', message.trim());
    await runGit(args, { cwd: repoPath });
  }

  public async stashList(repoPath: string): Promise<StashEntry[]> {
    const { stdout } = await runGit(['stash', 'list', '--format=%gd%x1f%gs%x1f%aI'], {
      cwd: repoPath
    });
    return parseStashes(stdout);
  }

  public async stashPop(repoPath: string, ref?: string): Promise<void> {
    const args = ['stash', 'pop'];
    if (ref) args.push(ref);
    await runGit(args, { cwd: repoPath });
  }

  public async stashDrop(repoPath: string, ref?: string): Promise<void> {
    const args = ['stash', 'drop'];
    if (ref) args.push(ref);
    await runGit(args, { cwd: repoPath });
  }

  private async getOriginUrl(repoPath: string): Promise<string | null> {
    const remotes = await this.getRemotes(repoPath);
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
    return origin ? origin.fetchUrl || origin.pushUrl : null;
  }

  public async fetch(repoPath: string, signal?: AbortSignal): Promise<void> {
    const remoteUrl = await this.getOriginUrl(repoPath);
    await this.runAuthenticatedGit(['fetch', '--prune', '--all'], remoteUrl, {
      cwd: repoPath,
      signal
    });
  }

  public async pull(
    repoPath: string,
    strategy: PullStrategy = 'merge',
    signal?: AbortSignal
  ): Promise<void> {
    const remoteUrl = await this.getOriginUrl(repoPath);
    const args = ['pull'];
    if (strategy === 'rebase') args.push('--rebase');
    else if (strategy === 'ff-only') args.push('--ff-only');
    await this.runAuthenticatedGit(args, remoteUrl, { cwd: repoPath, signal });
  }

  public async push(
    repoPath: string,
    options: { publish?: boolean; branch?: string } = {},
    signal?: AbortSignal
  ): Promise<{ publishedNewBranch: boolean; branchName: string | null }> {
    const remoteUrl = await this.getOriginUrl(repoPath);
    const args = ['push'];
    let branchName = options.branch ?? null;
    if (options.publish) {
      if (!branchName) {
        const { stdout } = await runGit(['symbolic-ref', '--short', 'HEAD'], { cwd: repoPath });
        branchName = stdout.trim();
      }
      args.push('-u', 'origin', branchName);
    }
    await this.runAuthenticatedGit(args, remoteUrl, { cwd: repoPath, signal });
    return { publishedNewBranch: Boolean(options.publish), branchName };
  }

  public async getLog(
    repoPath: string,
    options: { search?: string; limit?: number } = {}
  ): Promise<CommitInfo[]> {
    const args = [
      'log',
      `--max-count=${options.limit ?? 100}`,
      '--format=%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x00'
    ];
    if (options.search?.trim()) {
      args.push('--regexp-ignore-case', `--grep=${options.search.trim()}`);
    }
    const res = await runGit(args, { cwd: repoPath, allowNonZeroExit: true });
    if (res.exitCode !== 0) return [];
    return parseGitLogZ(res.stdout);
  }

  public async getCommitFiles(repoPath: string, sha: string): Promise<string[]> {
    const { stdout } = await runGit(
      ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', sha],
      { cwd: repoPath }
    );
    return stdout.split('\0').filter(Boolean);
  }

  public async getCommitFileDiff(
    repoPath: string,
    sha: string,
    filePath: string
  ): Promise<FileDiff> {
    const { stdout } = await runGit(['show', '--format=', '--no-color', sha, '--', filePath], {
      cwd: repoPath
    });
    const byteSize = Buffer.byteLength(stdout, 'utf8');
    const isBinary = stdout.includes('Binary files ') || stdout.includes('GIT binary patch');
    return {
      path: filePath,
      isBinary,
      isImage: IMAGE_EXTS.has(path.extname(filePath).toLowerCase()),
      isTooLarge: false,
      byteSize,
      hunks: isBinary ? [] : parseUnifiedDiff(stdout),
      rawPatch: stdout
    };
  }

  public async cherryPick(repoPath: string, sha: string): Promise<void> {
    await runGit(['cherry-pick', sha], { cwd: repoPath });
  }

  public async revertCommit(repoPath: string, sha: string): Promise<void> {
    await runGit(['revert', '--no-edit', sha], { cwd: repoPath });
  }

  public async resolveConflict(
    repoPath: string,
    filePath: string,
    strategy: 'ours' | 'theirs' | 'mark-resolved'
  ): Promise<void> {
    if (strategy === 'ours') {
      await runGit(['checkout', '--ours', '--', filePath], { cwd: repoPath });
      await runGit(['add', '--', filePath], { cwd: repoPath });
    } else if (strategy === 'theirs') {
      await runGit(['checkout', '--theirs', '--', filePath], { cwd: repoPath });
      await runGit(['add', '--', filePath], { cwd: repoPath });
    } else {
      await runGit(['add', '--', filePath], { cwd: repoPath });
    }
  }

  public async continueOperation(repoPath: string, mode: 'merge' | 'rebase'): Promise<void> {
    if (mode === 'rebase') {
      await runGit(['rebase', '--continue'], {
        cwd: repoPath,
        env: { GIT_EDITOR: 'true' }
      });
    } else {
      await runGit(['commit', '--no-edit'], { cwd: repoPath });
    }
  }

  public async abortOperation(repoPath: string, mode: 'merge' | 'rebase'): Promise<void> {
    if (mode === 'rebase') {
      await runGit(['rebase', '--abort'], { cwd: repoPath });
    } else {
      await runGit(['merge', '--abort'], { cwd: repoPath });
    }
  }
}

function imageMime(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}
