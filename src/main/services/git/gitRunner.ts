import { spawn } from 'child_process';

export interface GitRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: string;
  signal?: AbortSignal;
  onStderrLine?: (line: string) => void;
  allowNonZeroExit?: boolean;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitExecutionError extends Error {
  public readonly exitCode: number;
  public readonly stderr: string;
  public readonly args: string[];

  constructor(message: string, exitCode: number, stderr: string, args: string[]) {
    super(message);
    this.name = 'GitExecutionError';
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.args = args;
  }
}

export function runGit(args: string[], options: GitRunOptions = {}): Promise<GitRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: options.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
        ...options.env
      }
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stderrBuffer = '';

    const onAbort = (): void => {
      child.kill('SIGTERM');
    };

    if (options.signal) {
      if (options.signal.aborted) {
        child.kill('SIGTERM');
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      if (options.onStderrLine) {
        stderrBuffer += chunk.toString('utf8');
        const lines = stderrBuffer.split(/\r?\n|\r/);
        stderrBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) options.onStderrLine(line);
        }
      }
    });

    child.on('error', (err) => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort);
      const exitCode = code ?? -1;
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (options.signal?.aborted) {
        reject(new Error('Git operation was cancelled'));
        return;
      }

      if (exitCode !== 0 && !options.allowNonZeroExit) {
        reject(
          new GitExecutionError(
            stderr.trim() || `git ${args[0] ?? ''} failed with exit code ${exitCode}`,
            exitCode,
            stderr,
            args
          )
        );
        return;
      }

      resolve({ stdout, stderr, exitCode });
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}
