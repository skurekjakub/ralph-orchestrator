/** Shared context passed to all reset sub-modules. */
export interface ResetContext {
  issueKey: string;
  rootDir: string;
}

/** JIRA connection config loaded from environment. */
export interface JiraEnv {
  email: string;
  apiToken: string;
  cloudId: string;
}
