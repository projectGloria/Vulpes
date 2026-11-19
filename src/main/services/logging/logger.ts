import fs from 'fs';
import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SECRET_KEY_RE = /(token|secret|password|authorization|cookie|credential|private_key)/i;
const BEARER_RE = /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi;
const GITLAB_TOKEN_RE = /\b(glpat|gloas|glrt|glcbt)-[A-Za-z0-9\-_]{10,}\b/g;
const URL_CREDS_RE = /(https?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

export function redactString(input: string): string {
  return input
    .replace(BEARER_RE, '$1[REDACTED]')
    .replace(GITLAB_TOKEN_RE, '$1-[REDACTED]')
    .replace(URL_CREDS_RE, '$1[REDACTED]:[REDACTED]@');
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MaxDepth]';
  if (typeof value === 'string') return redactString(value);
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redactValue(v, depth + 1);
  }
  return out;
}

export class Logger {
  private logFilePath: string;
  private initialized = false;

  constructor(logDir: string) {
    this.logFilePath = path.join(logDir, 'gitlab-desktop.log');
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }

  private ensureDir(): void {
    if (this.initialized) return;
    try {
      fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true });
      this.initialized = true;
    } catch {
      // Ignore directory creation failures so logging never crashes the app
    }
  }

  public log(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      scope,
      msg: redactString(message),
      ...(meta ? { meta: redactValue(meta) } : {})
    };
    const line = JSON.stringify(entry);
    if (process.env.NODE_ENV !== 'test') {
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else if (process.env.ELECTRON_RENDERER_URL) {
        console.log(line);
      }
    }
    try {
      this.ensureDir();
      fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
    } catch {
      // Never crash on log I/O
    }
  }

  public debug(scope: string, message: string, meta?: Record<string, unknown>): void {
    this.log('debug', scope, message, meta);
  }

  public info(scope: string, message: string, meta?: Record<string, unknown>): void {
    this.log('info', scope, message, meta);
  }

  public warn(scope: string, message: string, meta?: Record<string, unknown>): void {
    this.log('warn', scope, message, meta);
  }

  public error(scope: string, message: string, meta?: Record<string, unknown>): void {
    this.log('error', scope, message, meta);
  }
}
