import type { IAgentProfile } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import { buildTriggerParams } from "../container/setup/agent-includes.js";

/** Computed per-task data that flows through the entire pipeline. */
export interface TaskContext {
  readonly issue: JiraIssue;
  readonly profile: IAgentProfile;
  readonly taskId: string;
  readonly triggerParams: Record<string, string>;
  readonly isRevision: boolean;
}

/**
 * Build a {@link TaskContext} from raw orchestrator inputs.
 *
 * Converts raw trigger params (`string[]`) to a key-value `Record` and
 * determines whether the issue is in a revision status.
 */
export function buildTaskContext(
  issue: JiraIssue,
  profile: IAgentProfile,
  taskId: string,
  triggerParams?: string[],
): TaskContext {
  const issueStatus = issue.fields.status?.name?.toLowerCase() ?? "";
  const revisionStatuses = profile.match.revisionStatuses ?? [];
  const isRevision = revisionStatuses.some(
    (s) => s.toLowerCase() === issueStatus,
  );

  return {
    issue,
    profile,
    taskId,
    triggerParams: buildTriggerParams(triggerParams ?? []),
    isRevision,
  };
}
