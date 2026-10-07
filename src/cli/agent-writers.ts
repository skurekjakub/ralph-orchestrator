import { CliType } from "../config/types";
import type { IAgentFileWriter } from "./agent-file-writer";
import { ClaudeAgentWriter } from "./claude/claude-agent-writer";
import { CopilotAgentWriter } from "./copilot/copilot-agent-writer";

const CLAUDE_AGENT_WRITER = new ClaudeAgentWriter();
const COPILOT_AGENT_WRITER = new CopilotAgentWriter();

/** The agent file writer of `cli`. */
export function agentFileWriterFor(cli: CliType): IAgentFileWriter {
  switch (cli) {
    case CliType.Claude:
      return CLAUDE_AGENT_WRITER;
    case CliType.Copilot:
      return COPILOT_AGENT_WRITER;
  }
}
