import { describe, it, expect } from "vitest";
import { ClaudeAgentWriter } from "../../../src/cli/claude/claude-agent-writer";
import { ClaudeBuiltinTool } from "../../../src/cli/claude/claude-tools";
import type { AgentWriteContext } from "../../../src/cli/agent-file-writer";
import { splitFrontmatter } from "../../../src/util/frontmatter";
import { CliType, ReasoningEffort } from "../../../src/config/types";
import { makeAgentDefinition } from "../../helpers/factories";

const LEAF: AgentWriteContext = { isStageRoot: false, stageSubagents: [], returnsResult: false, mcpTools: {} };
const BUILTINS = "Read, Write, Edit, Bash, Skill, TaskCreate, TaskGet, TaskList, TaskUpdate, WebFetch, WebSearch";

/** The frontmatter lines of a written agent file. */
function frontmatterOf(content: string): string[] {
  return splitFrontmatter(content).frontmatter.trimEnd().split("\n");
}

describe("ClaudeAgentWriter", () => {
  const writer = new ClaudeAgentWriter();

  it("writes <name>.md with the canonical keys and the body unchanged", () => {
    // Arrange
    const agent = makeAgentDefinition(
      { name: "ralph-writer", description: "Writer — it's careful", model: "opus" },
      "\n# Writer\n",
    );

    // Act
    const file = writer.write(agent, LEAF);

    // Assert
    expect(file).toEqual({
      fileName: "ralph-writer.md",
      content: `---\nname: ralph-writer\ndescription: 'Writer — it''s careful'\nmodel: opus\ntools: ${BUILTINS}\n---\n\n# Writer\n`,
    });
  });

  it("grants the stage root every agent reachable in the stage", () => {
    // Arrange
    const agent = makeAgentDefinition({ name: "ralph", subagents: ["ralph-writer"] });

    // Act
    const file = writer.write(agent, {
      ...LEAF,
      isStageRoot: true,
      stageSubagents: ["ralph-writer", "ralph-validator"],
    });

    // Assert
    expect(frontmatterOf(file!.content)).toContain(`tools: Agent(ralph-writer, ralph-validator), ${BUILTINS}`);
  });

  it("grants a nested subagent its own subagents only", () => {
    // Arrange
    const agent = makeAgentDefinition({ name: "ralph-writer", subagents: ["ralph-validator"] });

    // Act
    const file = writer.write(agent, { ...LEAF, stageSubagents: ["ralph-writer", "ralph-validator", "ralph-scribe"] });

    // Assert
    expect(frontmatterOf(file!.content)).toContain(`tools: Agent(ralph-validator), ${BUILTINS}`);
  });

  it("gives a leaf no Agent tool, so it cannot respawn itself", () => {
    // Act
    const file = writer.write(makeAgentDefinition({ name: "leaf" }), LEAF);

    // Assert
    expect(file!.content).not.toContain("Agent(");
  });

  it("grants a stage root without subagents no Agent tool", () => {
    // Act
    const file = writer.write(makeAgentDefinition({ name: "solo" }), { ...LEAF, isStageRoot: true });

    // Assert
    expect(file!.content).not.toContain("Agent(");
  });

  it("uses the agent's own built-in tools instead of the default set", () => {
    // Arrange
    const agent = makeAgentDefinition({ name: "reader", tools: [ClaudeBuiltinTool.Read, ClaudeBuiltinTool.Bash] });

    // Act
    const file = writer.write(agent, LEAF);

    // Assert
    expect(frontmatterOf(file!.content)).toContain("tools: Read, Bash");
  });

  it("grants the root that returns the stage's result the structured output tool, after its own tools", () => {
    // Arrange
    const agent = makeAgentDefinition({ name: "ralph", tools: [ClaudeBuiltinTool.Read] });
    const context = { ...LEAF, isStageRoot: true, returnsResult: true, mcpTools: { ado: ["ado_push_progress"] } };

    // Act
    const file = writer.write(agent, context);

    // Assert
    expect(frontmatterOf(file!.content)).toContain("tools: Read, StructuredOutput, mcp__ado__ado_push_progress");
  });

  it("grants an agent that returns no result no structured output tool", () => {
    // Act
    const file = writer.write(makeAgentDefinition({ name: "ralph" }), { ...LEAF, isStageRoot: true });

    // Assert
    expect(file!.content).not.toContain("StructuredOutput");
  });

  it("appends the allowlisted MCP tools, and a whole server when it allows every tool", () => {
    // Arrange
    const context = { ...LEAF, mcpTools: { ado: ["ado_push_progress", "ado_create_pull_request"], "web-fetch": [] } };

    // Act
    const file = writer.write(makeAgentDefinition({ name: "x" }), context);

    // Assert
    expect(frontmatterOf(file!.content)).toContain(
      `tools: ${BUILTINS}, mcp__ado__ado_push_progress, mcp__ado__ado_create_pull_request, mcp__web-fetch`,
    );
  });

  it("writes skills, effort and maxTurns, and drops the Copilot overrides", () => {
    // Arrange
    const agent = makeAgentDefinition({
      name: "x",
      model: "inherit",
      skills: ["ralph-workflow", "ralph-style-guide-review"],
      effort: ReasoningEffort.XHigh,
      maxTurns: 300,
      copilot: { model: "gpt-5.4" },
    });

    // Act
    const file = writer.write(agent, LEAF);

    // Assert
    expect(frontmatterOf(file!.content)).toEqual([
      "name: x",
      "description: 'The x agent'",
      "model: inherit",
      `tools: ${BUILTINS}`,
      "skills:",
      "  - ralph-workflow",
      "  - ralph-style-guide-review",
      "effort: xhigh",
      "maxTurns: 300",
    ]);
  });

  describe("skills", () => {
    const ROOT: AgentWriteContext = { ...LEAF, isStageRoot: true };

    it("has a stage root load its skills with the Skill tool before anything else", () => {
      // Arrange
      const agent = makeAgentDefinition({ name: "ralph", skills: ["ralph-workflow", "style"] }, "\n# Ralph\n");

      // Act
      const file = writer.write(agent, ROOT);

      // Assert
      const { frontmatter, body } = splitFrontmatter(file!.content);
      expect(frontmatter).not.toContain("skills:");
      expect(body).toBe(
        "<startup-skills>\n" +
          "Before you do anything else, load each of these skills with the Skill tool, one call per skill: " +
          "`ralph-workflow`, `style`. Their instructions are part of yours.\n" +
          "</startup-skills>\n" +
          "\n# Ralph\n",
      );
    });

    it("lists a subagent's skills in its frontmatter for Claude Code to preload, leaving its body unchanged", () => {
      // Arrange
      const agent = makeAgentDefinition({ name: "ralph-writer", skills: ["ralph-workflow"] }, "\n# Writer\n");

      // Act
      const file = writer.write(agent, LEAF);

      // Assert
      const { frontmatter, body } = splitFrontmatter(file!.content);
      expect(frontmatter).toContain("skills:\n  - ralph-workflow\n");
      expect(body).toBe("\n# Writer\n");
    });

    it("leaves the body of a stage root without skills unchanged", () => {
      // Act
      const file = writer.write(makeAgentDefinition({ name: "ralph" }, "\n# Ralph\n"), ROOT);

      // Assert
      expect(splitFrontmatter(file!.content).body).toBe("\n# Ralph\n");
    });
  });

  it("leaves the model to Claude Code when the agent sets none", () => {
    // Act
    const file = writer.write(makeAgentDefinition({ name: "x" }), LEAF);

    // Assert
    expect(file!.content).not.toContain("model:");
  });

  it.each([
    ["fable", "fable"],
    ["claude-haiku-4-5-20251001", "claude-haiku-4-5-20251001"],
    ["inherit", undefined],
    [undefined, undefined],
  ])("runs canonical model %s as %s, leaving inherit and no model to Claude Code", (model, expected) => {
    // Act & Assert
    expect(writer.modelOf(makeAgentDefinition({ name: "x", model, copilot: { model: "gpt-5.4" } }))).toBe(expected);
  });

  it("writes nothing for an agent whose runtimes exclude Claude Code", () => {
    // Act & Assert
    expect(writer.write(makeAgentDefinition({ name: "x", runtimes: [CliType.Copilot] }), LEAF)).toBeNull();
  });
});
