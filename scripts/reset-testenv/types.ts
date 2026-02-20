/** Task difficulty for reset script — controls the JIRA description. */
export type TaskDifficulty = "easy" | "medium" | "hard" | "hard-admin" | "hard-cicd" | "very-hard" | "very-hard-admin";

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
