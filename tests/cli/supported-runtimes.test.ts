import { describe, it, expect } from "vitest";
import { ClaudeCodeRuntime } from "../../src/cli/claude/claude-runtime";
import { CopilotRuntime } from "../../src/cli/copilot/copilot-runtime";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType } from "../../src/config/types";

describe("createCliRuntimeRegistry", () => {
  it("registers Claude Code and Copilot CLI", () => {
    // Act
    const registry = createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken);

    // Assert
    expect(registry.get(CliType.Claude)).toBeInstanceOf(ClaudeCodeRuntime);
    expect(registry.get(CliType.Copilot)).toBeInstanceOf(CopilotRuntime);
  });

  it.each([
    [ClaudeAuthMode.OAuthToken, "CLAUDE_CODE_OAUTH_TOKEN"],
    [ClaudeAuthMode.ApiKey, "ANTHROPIC_API_KEY"],
  ])("gives Claude Code the credential claudeAuth %s selects", (auth, envVar) => {
    // Act
    const registry = createCliRuntimeRegistry(auth);

    // Assert
    expect(registry.get(CliType.Claude).credentials.required.map((c) => c.envVar)).toEqual([envVar]);
  });
});
