import type { GitLabDesktopApi } from './index';

declare global {
  interface Window {
    gitlabDesktop: GitLabDesktopApi;
  }
}

export {};
