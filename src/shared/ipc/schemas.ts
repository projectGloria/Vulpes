import { z } from 'zod';
import { isSafeExternalUrl } from '../utils/url';

export const nonEmptyPathSchema = z.string().trim().min(1, 'Path is required').max(4096);

export const addRepoSchema = z.object({
  path: nonEmptyPathSchema
});

export const removeRepoSchema = z.object({
  id: z.string().min(1)
});

export const selectRepoSchema = z.object({
  id: z.string().min(1).nullable()
});

export const createRepoSchema = z.object({
  parentDir: nonEmptyPathSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Repository name is required')
    .max(120)
    .refine((val) => !/[<>:"/\\|?*\x00-\x1f]/.test(val), 'Repository name contains invalid characters')
    .refine((val) => val !== '.' && val !== '..', 'Invalid repository name'),
  defaultBranch: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._/-]+$/, 'Invalid branch name')
    .optional(),
  initReadme: z.boolean().optional(),
  gitignoreTemplate: z.enum(['none', 'node', 'python', 'rust', 'go']).optional()
});

export const repoStatusSchema = z.object({
  repoPath: nonEmptyPathSchema
});

export const openExternalSchema = z.object({
  url: z
    .string()
    .trim()
    .refine((val) => isSafeExternalUrl(val), 'Only http and https URLs are allowed')
});

export const openPathSchema = z.object({
  path: nonEmptyPathSchema
});

export const pickDirectorySchema = z.object({
  title: z.string().max(200).optional(),
  defaultPath: z.string().max(4096).optional()
});

export const updatePreferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  pullStrategy: z.enum(['merge', 'rebase', 'ff-only']).optional(),
  defaultEditor: z.string().max(200).optional(),
  defaultTerminal: z.string().max(200).optional(),
  locale: z.string().max(20).optional(),
  telemetryEnabled: z.boolean().optional(),
  crashReportingEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional()
});

export const signInPatSchema = z.object({
  instanceUrl: z.string().trim().min(1, 'GitLab instance URL is required').max(500),
  token: z.string().trim().min(1, 'Personal Access Token is required').max(500)
});

export const signInOAuthSchema = z.object({
  instanceUrl: z.string().trim().min(1, 'GitLab instance URL is required').max(500),
  clientId: z.string().trim().min(1, 'OAuth Application ID is required').max(500)
});

export const accountIdSchema = z.object({
  accountId: z.string().min(1)
});

export const listProjectsSchema = z.object({
  accountId: z.string().min(1),
  search: z.string().max(200).optional(),
  page: z.number().int().min(1).max(100).optional()
});

export const cloneRepoSchema = z.object({
  operationId: z.string().min(1).max(100),
  url: z.string().trim().min(1, 'Repository URL is required').max(2048),
  targetDir: nonEmptyPathSchema,
  accountId: z.string().optional(),
  gitlabProjectId: z.number().int().positive().optional(),
  gitlabProjectPath: z.string().optional(),
  gitlabInstanceUrl: z.string().optional()
});

export const cancelOperationSchema = z.object({
  operationId: z.string().min(1).max(100)
});

export const saveRepoSettingsSchema = z.object({
  repoPath: nonEmptyPathSchema,
  authorName: z.string().max(200).optional(),
  authorEmail: z.string().max(200).optional(),
  gitignore: z.string().max(200_000).optional(),
  addRemote: z.object({ name: z.string().min(1).max(100), url: z.string().min(1).max(2048) }).optional(),
  updateRemote: z.object({ name: z.string().min(1).max(100), url: z.string().min(1).max(2048) }).optional(),
  removeRemote: z.string().min(1).max(100).optional()
});

export const resolveRepoGitLabSchema = z.object({
  repoId: z.string().min(1)
});

// --- Phase 4: Daily Git workflow ---
export const fileDiffSchema = z.object({
  repoPath: nonEmptyPathSchema,
  filePath: nonEmptyPathSchema,
  staged: z.boolean(),
  untracked: z.boolean().optional(),
  showFull: z.boolean().optional()
});

export const repoFileSchema = z.object({
  repoPath: nonEmptyPathSchema,
  filePath: nonEmptyPathSchema
});

export const applyPartialPatchSchema = z.object({
  repoPath: nonEmptyPathSchema,
  patch: z.string().min(1),
  reverse: z.boolean()
});

export const discardFileSchema = z.object({
  repoPath: nonEmptyPathSchema,
  filePath: nonEmptyPathSchema,
  untracked: z.boolean()
});

export const commitSchema = z.object({
  repoPath: nonEmptyPathSchema,
  summary: z.string().trim().min(1, 'Commit summary is required').max(500),
  description: z.string().max(20_000).optional(),
  coAuthors: z.array(z.string().max(300)).max(20).optional(),
  amend: z.boolean().optional()
});

export const createBranchSchema = z.object({
  repoPath: nonEmptyPathSchema,
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._/-]+$/, 'Invalid branch name'),
  startPoint: z.string().max(200).optional()
});

export const switchBranchSchema = z.object({
  repoPath: nonEmptyPathSchema,
  name: z.string().trim().min(1).max(200)
});

export const renameBranchSchema = z.object({
  repoPath: nonEmptyPathSchema,
  oldName: z.string().trim().min(1).max(200),
  newName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._/-]+$/, 'Invalid branch name')
});

export const deleteBranchSchema = z.object({
  repoPath: nonEmptyPathSchema,
  name: z.string().trim().min(1).max(200),
  force: z.boolean().optional()
});

export const stashPushSchema = z.object({
  repoPath: nonEmptyPathSchema,
  message: z.string().max(300).optional()
});

export const stashRefSchema = z.object({
  repoPath: nonEmptyPathSchema,
  ref: z.string().max(100).optional()
});

export const pullSchema = z.object({
  repoPath: nonEmptyPathSchema,
  strategy: z.enum(['merge', 'rebase', 'ff-only']).optional()
});

export const pushSchema = z.object({
  repoPath: nonEmptyPathSchema,
  publish: z.boolean().optional(),
  branch: z.string().max(200).optional()
});

export const logSchema = z.object({
  repoPath: nonEmptyPathSchema,
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).optional()
});

export const commitShaSchema = z.object({
  repoPath: nonEmptyPathSchema,
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i, 'Invalid commit SHA')
});

export const commitFileDiffSchema = z.object({
  repoPath: nonEmptyPathSchema,
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i, 'Invalid commit SHA'),
  filePath: nonEmptyPathSchema
});

export const resolveConflictSchema = z.object({
  repoPath: nonEmptyPathSchema,
  filePath: nonEmptyPathSchema,
  strategy: z.enum(['ours', 'theirs', 'mark-resolved'])
});

export const conflictOpSchema = z.object({
  repoPath: nonEmptyPathSchema,
  mode: z.enum(['merge', 'rebase'])
});

export const openInEditorSchema = z.object({
  repoPath: nonEmptyPathSchema,
  filePath: nonEmptyPathSchema
});

// --- Phase 5: GitLab MRs, Pipelines, Issues, Notifications ---
export const projectRefSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.union([z.number().int().positive(), z.string().min(1)])
});

export const listMrsSchema = projectRefSchema.extend({
  filter: z.enum(['opened_by_me', 'assigned_to_me', 'review_requested', 'all']).optional()
});

export const mrDetailSchema = projectRefSchema.extend({
  mrIid: z.number().int().positive()
});

export const createMrSchema = projectRefSchema.extend({
  sourceBranch: z.string().min(1).max(200),
  targetBranch: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(50_000).optional(),
  assigneeIds: z.array(z.number().int().positive()).optional(),
  reviewerIds: z.array(z.number().int().positive()).optional(),
  labels: z.string().max(500).optional(),
  milestoneId: z.number().int().positive().optional(),
  squash: z.boolean().optional(),
  removeSourceBranch: z.boolean().optional()
});

export const listPipelinesSchema = projectRefSchema.extend({
  ref: z.string().max(200).optional()
});

export const pipelineIdSchema = projectRefSchema.extend({
  pipelineId: z.number().int().positive()
});

export const jobIdSchema = projectRefSchema.extend({
  jobId: z.number().int().positive()
});

export const listIssuesSchema = projectRefSchema.extend({
  search: z.string().max(200).optional()
});

export const notifySchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  url: z
    .string()
    .refine((v) => isSafeExternalUrl(v), 'Invalid notification URL')
    .optional()
});
