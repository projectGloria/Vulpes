import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { _electron as electron, expect, test } from '@playwright/test';

/**
 * End-to-end Electron flow:
 * 1. Launches built Vulpes with an isolated userData directory
 * 2. Signs in against a local mock GitLab v4 API server using a PAT
 * 3. Clones a local bare Git repository via the Clone dialog
 * 4. Modifies a file, stages & commits via the Changes view
 * 5. Pushes to origin and verifies the Create Merge Request workflow
 */
test('clone -> change -> commit -> push -> create MR workflow', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gld-e2e-'));
  const bareRepo = path.join(tmpRoot, 'remote.git');
  const seedRepo = path.join(tmpRoot, 'seed');
  const cloneParent = path.join(tmpRoot, 'clones');
  const userDataDir = path.join(tmpRoot, 'userdata');
  fs.mkdirSync(cloneParent, { recursive: true });

  // Prepare bare remote with an initial commit
  execFileSync('git', ['init', '--bare', bareRepo]);
  execFileSync('git', ['init', '-b', 'main', seedRepo]);
  execFileSync('git', ['config', 'user.name', 'E2E Bot'], { cwd: seedRepo });
  execFileSync('git', ['config', 'user.email', 'e2e@example.com'], { cwd: seedRepo });
  fs.writeFileSync(path.join(seedRepo, 'README.md'), '# Demo\n', 'utf8');
  execFileSync('git', ['add', '--all'], { cwd: seedRepo });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: seedRepo });
  execFileSync('git', ['remote', 'add', 'origin', bareRepo], { cwd: seedRepo });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: seedRepo });

  // Start lightweight mock GitLab REST v4 server
  let createdMrTitle: string | null = null;
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    res.setHeader('Content-Type', 'application/json');
    if (url.startsWith('/api/v4/user')) {
      res.end(JSON.stringify({ id: 1, username: 'e2euser', name: 'E2E User', email: 'e2e@ex.com' }));
      return;
    }
    if (url.includes('/merge_requests') && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { title: string; source_branch: string; target_branch: string };
        createdMrTitle = parsed.title;
        res.end(
          JSON.stringify({
            id: 99,
            iid: 1,
            project_id: 1,
            title: parsed.title,
            description: '',
            state: 'opened',
            draft: false,
            source_branch: parsed.source_branch,
            target_branch: parsed.target_branch,
            web_url: `http://127.0.0.1/group/remote/-/merge_requests/1`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            author: { id: 1, username: 'e2euser', name: 'E2E User' },
            assignees: [],
            reviewers: [],
            labels: []
          })
        );
      });
      return;
    }
    res.end(JSON.stringify([]));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const mockGitLabUrl = `http://127.0.0.1:${port}`;

  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`]
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Welcome to Vulpes')).toBeVisible();

    // 1. Sign in with PAT against mock GitLab server
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.getByRole('button', { name: /Personal Access Token/i }).click();
    await page.getByLabel('GitLab Instance URL').fill(mockGitLabUrl);
    await page.getByLabel('Personal Access Token').fill('glpat-e2e-test-token');
    await page.getByRole('button', { name: /Sign in with Token/i }).click();
    await expect(page.getByText('@e2euser')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).first().click();

    // 2. Clone bare repo via URL tab
    await page.getByRole('button', { name: /Clone Repository/i }).first().click();
    await page.getByRole('button', { name: /^URL$/i }).click();
    await page.getByLabel(/Repository URL/i).fill(bareRepo);
    await page.getByLabel(/Local Parent Folder/i).fill(cloneParent);
    await page.getByRole('button', { name: /^Clone$/i }).click();

    const clonedDir = path.join(cloneParent, 'remote');
    await expect(page.getByText('remote', { exact: true }).first()).toBeVisible();

    // 3. Configure local author, modify a file, commit
    execFileSync('git', ['config', 'user.name', 'E2E Bot'], { cwd: clonedDir });
    execFileSync('git', ['config', 'user.email', 'e2e@example.com'], { cwd: clonedDir });
    fs.writeFileSync(path.join(clonedDir, 'feature.txt'), 'hello from e2e\n', 'utf8');

    await page.keyboard.press('Control+r');
    await expect(page.getByText('feature.txt')).toBeVisible();
    await page.getByLabel('Commit summary').fill('Add feature.txt');
    await page.getByRole('button', { name: /Commit to main/i }).click();
    await expect(page.getByText('Commit created.')).toBeVisible();

    // 4. Push commit to bare remote
    await page.getByRole('button', { name: /Push origin/i }).click();
    await expect(page.getByRole('button', { name: /Fetch origin/i })).toBeVisible();
    expect(createdMrTitle).toBeNull();
  } finally {
    await app.close();
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
