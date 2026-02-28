import type { IAgentProfile, IRalphchivesConfig } from "../config/types.js";
import type { WorkItem } from "../datasource/types.js";
import { buildTriggerParams } from "../container/setup/agent-includes.js";

/** Computed per-task data that flows through the entire pipeline. */
export interface TaskContext {
  readonly workItem: WorkItem;
  readonly profile: IAgentProfile;
  readonly taskId: string;
  readonly triggerParams: Record<string, string>;
  readonly isRevision: boolean;
  readonly ralphchivesEnabled: boolean;
  /** PR URL extracted from work item comments during preflight, or null. */
  readonly prUrl: string | null;
}

/** Optional callbacks for real-time streaming during task execution. */
export interface TaskCallbacks {
  readonly onToolOutput?: (line: string) => void;
  readonly onPreToolUse?: (line: string) => void;
}

/**
 * Build a {@link TaskContext} from raw orchestrator inputs.
 *
 * Converts raw trigger params (`string[]`) to a key-value `Record` and
 * determines whether the issue is in a revision status.
 */
export function buildTaskContext(
  workItem: WorkItem,
  profile: IAgentProfile,
  taskId: string,
  ralphchivesConfig: IRalphchivesConfig,
  triggerParams?: string[],
  prUrl?: string | null,
): TaskContext {
  const issueStatus = workItem.status.toLowerCase();
  const revisionStatuses = profile.match.revisionStatuses ?? [];
  const isRevision = revisionStatuses.some(
    (s) => s.toLowerCase() === issueStatus,
  );

  return {
    workItem,
    profile,
    taskId,
    triggerParams: buildTriggerParams(triggerParams ?? []),
    isRevision,
    ralphchivesEnabled: ralphchivesConfig.enabled,
    prUrl: prUrl ?? null,
  };
}
