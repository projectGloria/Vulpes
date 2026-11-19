import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface AskpassContext {
  env: Record<string, string>;
  cleanup: () => void;
}

/**
 * Creates a short-lived GIT_ASKPASS helper script so Git HTTPS operations can
 * authenticate with an OAuth2 or PAT token without ever writing credentials
 * into .git/config, command-line arguments, or logs.
 */
export function createAskpassContext(username: string, token: string): AskpassContext {
  const isWin = process.platform === 'win32';
  const id = crypto.randomBytes(12).toString('hex');
  const scriptPath = path.join(os.tmpdir(), `gld-askpass-${id}.${isWin ? 'cmd' : 'sh'}`);

  if (isWin) {
    // Git invokes: <askpass> "Username for 'https://...':" or "Password for 'https://...':"
    const content = [
      '@echo off',
      'setlocal',
      'set "PROMPT=%~1"',
      'echo %PROMPT% | findstr /I "Username" >nul',
      'if %ERRORLEVEL%==0 (',
      '  echo %GLD_ASKPASS_USER%',
      ') else (',
      '  echo %GLD_ASKPASS_TOKEN%',
      ')'
    ].join('\r\n');
    fs.writeFileSync(scriptPath, content, { encoding: 'utf8', mode: 0o700 });
  } else {
    const content = [
      '#!/bin/sh',
      'case "$1" in',
      '  *Username*|*username*) printf "%s\\n" "$GLD_ASKPASS_USER" ;;',
      '  *) printf "%s\\n" "$GLD_ASKPASS_TOKEN" ;;',
      'esac'
    ].join('\n');
    fs.writeFileSync(scriptPath, content, { encoding: 'utf8', mode: 0o700 });
    fs.chmodSync(scriptPath, 0o700);
  }

  return {
    env: {
      GIT_ASKPASS: scriptPath,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      GLD_ASKPASS_USER: username,
      GLD_ASKPASS_TOKEN: token
    },
    cleanup: () => {
      try {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      } catch {
        // best-effort cleanup
      }
    }
  };
}
