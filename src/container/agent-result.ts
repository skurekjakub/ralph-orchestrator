import { z } from "zod";
import { TaskStatus } from "./types";

/**
 * The result an agent ends a stage with when the stage requires one (`requireResultBlock`). Claude Code returns it
 * as structured output that {@link AGENT_RESULT_JSON_SCHEMA} validates; Copilot CLI prints it as a
 * `===RALPH_RESULT_START===` … `===RALPH_RESULT_END===` block of `KEY: value` lines with the same keys.
 */
export const agentResultSchema = z.strictObject({
  STATUS: z
    .enum([TaskStatus.Completed, TaskStatus.Partial, TaskStatus.Blocked])
    .describe("completed when the task is done, partial when only part of it is, blocked when the run cannot proceed"),
  PR_URL: z.string().describe("URL of the pull request the run opened or updated").optional(),
  SUMMARY: z.string().describe("One line on the outcome").optional(),
  JIRA_KEY: z.string().describe("Key of the work item the run worked on").optional(),
  BRANCH: z.string().describe("Branch the run pushed its changes to").optional(),
  HANDOFF: z.string().describe("Path of the handoff file the run attached to the work item").optional(),
});

/**
 * {@link agentResultSchema} as the JSON Schema Claude Code's `--json-schema` takes. Draft-07, because the CLI refuses
 * a schema that declares draft 2020-12, the default of `z.toJSONSchema` (Claude Code 2.1.292).
 */
export const AGENT_RESULT_JSON_SCHEMA: string = JSON.stringify(
  z.toJSONSchema(agentResultSchema, { target: "draft-07" }),
);
