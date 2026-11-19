# GitLab Desktop

A cross-platform (Windows, macOS, Linux) desktop Git client for GitLab—modeled on GitHub Desktop: simple, opinionated, and focused on the everyday Git + GitLab workflow.

## Features

- **Foundation & Repository Management**: Multi-repo sidebar, Add/Create/Clone repositories with live cancellable progress, automatic GitLab project association, and Repository Settings (remotes, default branch, `.gitignore`, local Git identity).
- **Authentication & Multi-Instance**: OAuth 2.0 Authorization Code + PKCE (system browser + loopback redirect) and Personal Access Token fallback for both `gitlab.com` and self-hosted GitLab instances. Tokens are encrypted via OS keychain (`safeStorage`) and injected transiently into HTTPS Git commands via an ephemeral `GIT_ASKPASS` bridge; SSH keys work natively.
- **Daily Git Workflow**: Partial file/hunk/line staging, unified & split diff viewer with syntax highlighting and image diffs, commit/amend/undo-last-commit with co-author support, branch management & stashes, Fetch/Pull (`merge` | `rebase` | `ff-only`)/Push/Publish, searchable commit history (cherry-pick, revert, branch from commit), merge/rebase conflict resolution, and discard-with-recoverable-backup.
- **GitLab Workflow**: Merge Requests (list, filter, sanitized Markdown details, approvals, discussions, create MR + post-publish prompt), CI/CD Pipelines (toolbar status pill, job list, logs, retry/cancel), Issues (browse, search, create issue-linked branch `123-slug` with auto-referencing commits), Open-on-GitLab shortcuts, and native OS notifications.
- **Polish**: Light/dark/system themes, keyboard shortcuts, Command Palette (`Ctrl/Cmd+K`), Preferences, structured redacted file logging ("Show Logs"), i18n-ready strings, and `electron-updater` auto-update support.

## Prerequisites

- **Node.js** 20+ and **npm** 10+
- **Git** installed and available on `PATH`

## Setup & Development

```bash
npm install
# If npm blocks postinstall scripts (e.g. npm 11+ allowScripts), download the Electron binary:
node node_modules/electron/install.js
```

Run in development mode with hot reload:

```bash
npm run dev
```

Type-check, run unit tests, and build production bundles:

```bash
npm run typecheck
npm run test
npm run build
```

Run Playwright E2E tests (requires `npm run build` and Electron binary installed):

```bash
npm run test:e2e
```

## Registering a GitLab OAuth Application for Development

To sign in with **OAuth 2.0 + PKCE** on `gitlab.com` or a self-hosted GitLab instance:

1. Open GitLab and go to **User Settings → Applications** (or Group/Admin Applications for self-hosted instances).
2. Click **Add new application**.
3. Fill in:
   - **Name**: `GitLab Desktop (Dev)`
   - **Redirect URI**: `http://127.0.0.1:42891/oauth/callback`
   - **Confidential**: **Unchecked** (public native client using PKCE)
   - **Scopes**: `api`, `read_user`, `read_repository`, `write_repository`
4. Save the application and copy the **Application ID** (`client_id`).
5. In GitLab Desktop, click **Sign in → OAuth 2.0 (Browser)**, enter your instance URL and Application ID, and click **Sign in with Browser**.

## Packaging & Release

Package unpacked directory (for local testing):

```bash
npm run package:dir
```

Build platform installers (`nsis` on Windows, `dmg`/`zip` on macOS, `AppImage`/`deb` on Linux):

```bash
npm run package
```

Releases use `electron-builder` (`electron-builder.yml`) and `electron-updater`. Configure signing certificates (`CSC_LINK`, `CSC_KEY_PASSWORD`, Apple notarization env vars) in CI before publishing production builds.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for process boundaries, IPC validation, Git execution model, and security guarantees.

## Known Limitations

- **Bundled Git**: Currently uses the system `git` binary rather than bundling `dugite`. Users without Git installed are shown an actionable install banner.
- **Line-level staging in Split mode**: Line checkboxes and hunk staging are available in Unified diff mode; Split mode is read-only for side-by-side inspection.
- **OAuth loopback redirect on older self-hosted GitLab**: Older self-hosted GitLab versions that do not allow ephemeral loopback ports under RFC 8252 should use the Personal Access Token sign-in flow.
- **Inline MR diff comments**: Merge Request discussions and approvals are viewable in-app, while posting new inline diff review threads opens the MR on GitLab.
- **Background notification polling**: Desktop notifications are wired via Electron's `Notification` API; background polling intervals for cross-repo MR/pipeline notifications can be expanded in future releases.
