export type AuthMethod = 'oauth' | 'pat';

export interface GitLabAccount {
  id: string;
  instanceUrl: string; // normalized, e.g. "https://gitlab.com"
  authMethod: AuthMethod;
  userId: number;
  username: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  tokenExpiresAt?: number | null; // epoch ms for OAuth tokens
  oauthClientId?: string;
}

export interface StoredTokenPayload {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number | null;
  tokenType?: string;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email?: string | null;
  avatar_url?: string | null;
  web_url?: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string | null;
  default_branch: string | null;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  web_url: string;
  visibility: 'private' | 'internal' | 'public';
  last_activity_at: string;
  namespace: {
    id: number;
    name: string;
    full_path: string;
    kind: string;
  };
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'locked' | 'merged';
  draft: boolean;
  source_branch: string;
  target_branch: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  author: GitLabUser;
  assignees: GitLabUser[];
  reviewers: GitLabUser[];
  labels: string[];
  milestone?: { id: number; iid: number; title: string } | null;
  merge_status?: string;
  detailed_merge_status?: string;
  has_conflicts?: boolean;
  squash?: boolean;
  should_remove_source_branch?: boolean;
}

export interface GitLabPipeline {
  id: number;
  iid?: number;
  sha: string;
  ref: string;
  status:
    | 'created'
    | 'waiting_for_resource'
    | 'preparing'
    | 'pending'
    | 'running'
    | 'success'
    | 'failed'
    | 'canceled'
    | 'skipped'
    | 'manual'
    | 'scheduled';
  web_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  duration: number | null;
  web_url: string;
  allow_failure: boolean;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed';
  labels: string[];
  web_url: string;
  author: GitLabUser;
  assignees: GitLabUser[];
  created_at: string;
  updated_at: string;
}
