# Contributing to GitLab Desktop

Thank you for your interest in contributing to GitLab Desktop!

## Development Workflow

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run checks before opening a merge/pull request:
   ```bash
   npm run typecheck
   npm run test
   npm run build
   ```

## Coding Guidelines

- **TypeScript Strict Mode**: Keep `tsconfig.node.json` and `tsconfig.web.json` error-free with zero `any` escapes.
- **Process Boundaries**: Never expose Node.js or filesystem APIs to the renderer. Add new IPC channels to `src/shared/ipc/channels.ts`, validate inputs with Zod in `src/shared/ipc/schemas.ts`, allowlist them in `src/preload/index.ts`, and implement handlers in `src/main/ipc/registerHandlers.ts`.
- **Git Commands**: Always invoke `git` via `runGit` / `spawn` argument arrays—never construct shell strings. Prefer `--porcelain=v2` and `-z` output and add unit tests for new parsers in `tests/unit/`.
- **Security**:
  - Never log tokens, cookies, or credentials.
  - Validate external URLs with `isSafeExternalUrl` before calling `shell.openExternal`.
  - Render GitLab-provided Markdown only through `SafeMarkdown` (`marked` + `DOMPurify`).
- **Keep Modules Small**: Prefer small, focused components and services over monolithic files.
