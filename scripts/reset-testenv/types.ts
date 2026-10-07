/** Task difficulty for reset script — controls the JIRA description. */
export type TaskDifficulty = "easy" | "medium" | "hard" | "hard-admin" | "hard-cicd" | "very-hard" | "very-hard-admin";

/** Shared context passed to all reset sub-modules. */
export interface ResetContext {
  issueKey: string;
  rootDir: string;
}

/** The profile whose data source, repository and workspaces the reset cleans. */
export const RESET_PROFILE_ID = "ralph-docs";

/** JIRA connection of the reset profile's data source, with its credentials from the environment. */
export interface JiraEnv {
  email: string;
  apiToken: string;
  baseUrl: string;
  cloudId: string;
}
