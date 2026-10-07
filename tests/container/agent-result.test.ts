import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AGENT_RESULT_JSON_SCHEMA, agentResultSchema } from "../../src/container/agent-result";
import { TaskStatus } from "../../src/container/types";

/** A validator built from the JSON Schema Claude Code receives, the way the CLI reads it. */
const cliSchema = z.fromJSONSchema(JSON.parse(AGENT_RESULT_JSON_SCHEMA));

describe("agentResultSchema", () => {
  describe("the --json-schema Claude Code receives", () => {
    it.each<[string, unknown]>([
      [
        "every field",
        {
          STATUS: TaskStatus.Completed,
          PR_URL: "https://dev.azure.com/org/p/_git/r/pullrequest/7",
          SUMMARY: "Documented the migration",
          JIRA_KEY: "DOC-1",
          BRANCH: "ralph/DOC-1-migration",
          HANDOFF: "/tmp/mcp-attachments/handoff-DOC-1.md",
        },
      ],
      ["the status alone", { STATUS: TaskStatus.Blocked }],
    ])("accepts a result with %s, as the parser does", (_case, result) => {
      // Act & Assert
      expect([cliSchema.safeParse(result).success, agentResultSchema.safeParse(result).success]).toEqual([true, true]);
    });

    it.each<[string, unknown]>([
      ["a status the orchestrator does not accept", { STATUS: "success" }],
      ["no status", { SUMMARY: "Done" }],
      ["a field outside the contract", { STATUS: TaskStatus.Completed, NOTES: "extra" }],
      ["a PR URL that is not text", { STATUS: TaskStatus.Completed, PR_URL: 7 }],
      ["a result that is not an object", [TaskStatus.Completed]],
    ])("rejects %s, as the parser does", (_case, result) => {
      // Act & Assert
      expect([cliSchema.safeParse(result).success, agentResultSchema.safeParse(result).success]).toEqual([
        false,
        false,
      ]);
    });

    it("is rooted in an object, the only input schema Claude Code's StructuredOutput tool takes", () => {
      // Act & Assert
      expect(JSON.parse(AGENT_RESULT_JSON_SCHEMA)).toMatchObject({ type: "object" });
    });
  });
});
