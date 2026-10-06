import { z } from "zod";
import { type ToolDefinition, errorResult, gitStageCommitPush, ADO_PAT, TASK_BRANCH } from "../shared.js";

const inputSchema: Record<string, z.ZodTypeAny> = {
  message: z.string().describe("Commit message for the progress push"),
};

export const tool: ToolDefinition = {
  name: "ado_push_progress",
  config: {
    description:
      "Stage all changes, commit, and push to the task branch. " +
      "Use this to save work-in-progress to the remote repository.",
    inputSchema: z.object(inputSchema),
  },
  handler: async (args) => {
    const branch = TASK_BRANCH;

    if (!branch) {
      return errorResult(new Error("ado_push_progress requires TASK_BRANCH env var to be set"));
    }

    const { message } = args;

    try {
      const { stdout, stderr } = await gitStageCommitPush(String(message), branch);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              branch,
              message: String(message),
              output: (stdout + stderr).trim().replaceAll(ADO_PAT ?? "", "***"),
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  },
};
