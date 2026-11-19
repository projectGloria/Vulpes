# Vulpes Architecture

Vulpes is a cross-platform Electron desktop client for GitLab built with TypeScript (strict mode), React, Vite (`electron-vite`), and Zustand.

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Renderer Process (React + Vite + Zustand)                               │
│ - sandbox: true, contextIsolation: true, nodeIntegration: false         │
│ - Strict CSP; no remote scripts; sanitized GitLab Markdown (DOMPurify)  │
│ - Communicates exclusively through window.gitlabDesktop preload bridge  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Typed IPC (Zod-validated in main)
┌───────────────────────────────┴─────────────────────────────────────────┐
│ Preload Script (src/preload/index.ts)                                   │
│ - Minimal contextBridge exposing invoke() and on() for declared channels│
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────┐
│ Main Process (Node.js + Electron)                                       │
│ ├── GitService       (system git via spawn, -z/porcelain v2, askpass)   │
│ ├── GitLabClient     (REST v4 / GraphQL, TTL cache, pagination, limits) │
│ ├── SecretStore      (Electron safeStorage -> OS keychain)              │
│ ├── AppStore         (atomic JSON persistence in userData)              │
│ ├── RepoWatcher      (debounced chokidar file watcher)                  │
│ ├── Logger           (structured JSONL file logger with redaction)      │
│ └── AutoUpdater      (electron-updater)                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Design Principles

1. **Strict Process Isolation**: The renderer never touches Node APIs, the filesystem, Git, or OS credentials directly. All IPC payloads are validated with Zod schemas (`src/shared/ipc/schemas.ts`) in the main process before execution.
2. **System Git via `spawn`**: Git commands run off the UI thread with argument arrays (no shell interpolation), `AbortSignal` cancellation, and machine-readable `-z` / `--porcelain=v2` output parsed by pure, unit-tested parsers (`src/main/services/git/parsers.ts`).
3. **Zero Plaintext Secrets**: OAuth tokens and Personal Access Tokens are encrypted via Electron's `safeStorage` (Windows DPAPI, macOS Keychain, Linux Secret Service). HTTPS Git operations receive credentials transiently via an ephemeral `GIT_ASKPASS` bridge—tokens are never written to `.git/config`, command arguments, or logs.
4. **Never Lose User Work**: Destructive actions require confirmation; discarded working-tree changes are snapshotted into a local recovery directory; committing supports amending and soft-reset undo.
5. **Modular Abstractions**: `GitService` and `GitLabClient` are decoupled from Electron IPC so both can be unit-tested and mocked independently.
6. **Security Defaults**:
   - Strict Content Security Policy in `index.html` and main-process response headers.
   - External URLs are validated (`http:` / `https:` only) before `shell.openExternal`.
   - All GitLab-sourced Markdown/HTML is sanitized with DOMPurify before rendering.
   - Structured logger automatically redacts bearer tokens, private tokens, and credentials.
