import { describe, it, expect } from "vitest";
import { agentFileWriterFor } from "../../src/cli/agent-writers";
import { ClaudeAgentWriter } from "../../src/cli/claude/claude-agent-writer";
import { CopilotAgentWriter } from "../../src/cli/copilot/copilot-agent-writer";
import { CliType } from "../../src/config/types";

describe("agentFileWriterFor", () => {
  it("returns each CLI's writer", () => {
    // Act & Assert
    expect(agentFileWriterFor(CliType.Claude)).toBeInstanceOf(ClaudeAgentWriter);
    expect(agentFileWriterFor(CliType.Copilot)).toBeInstanceOf(CopilotAgentWriter);
  });
});
