import { describe, it, expect } from "vitest";
import {
  AgentDefinitionError,
  agentFileIdOf,
  agentFrontmatterSchema,
  parseAgentSource,
} from "../../src/cli/agent-definition";
import { ClaudeBuiltinTool } from "../../src/cli/claude/claude-tools";
import { CliType, ReasoningEffort } from "../../src/config/types";
import { makeAgentTemplate } from "../helpers/factories";

/** The problems `parseAgentSource` reports for `source`. */
function problemsOf(source: string): readonly string[] {
  try {
    parseAgentSource("ralph.x", source);
  } catch (err) {
    if (err instanceof AgentDefinitionError) return err.problems;
    throw err;
  }
  throw new Error("expected an AgentDefinitionError");
}

describe("parseAgentSource", () => {
  it("parses canonical frontmatter and keeps the body as the template", () => {
    // Arrange
    const source = [
      "---",
      "name: ralph",
      "description: 'Orchestrator'",
      "model: opus",
      "subagents: [ralph-writer, ralph-scribe]",
      "tools: [Read, Bash]",
      "skills: [ralph-workflow]",
      "effort: high",
      "maxTurns: 300",
      "runtimes: [claude]",
      "copilot:",
      "  model: gpt-5.4",
      "---",
      "\n{{ taskId }}\n",
    ].join("\n");

    // Act
    const parsed = parseAgentSource("ralph.ralph", source);

    // Assert
    expect(parsed).toEqual({
      fileId: "ralph.ralph",
      frontmatter: {
        name: "ralph",
        description: "Orchestrator",
        model: "opus",
        subagents: ["ralph-writer", "ralph-scribe"],
        tools: [ClaudeBuiltinTool.Read, ClaudeBuiltinTool.Bash],
        skills: ["ralph-workflow"],
        effort: ReasoningEffort.High,
        maxTurns: 300,
        runtimes: [CliType.Claude],
        copilot: { model: "gpt-5.4" },
      },
      bodyTemplate: "\n{{ taskId }}\n",
    });
  });

  it("defaults subagents, skills, runtimes and copilot", () => {
    // Act
    const { frontmatter } = parseAgentSource("ralph.leaf", makeAgentTemplate("leaf"));

    // Assert
    expect(frontmatter).toEqual({
      name: "leaf",
      description: "The leaf agent",
      subagents: [],
      skills: [],
      runtimes: [CliType.Claude, CliType.Copilot],
      copilot: {},
    });
  });

  it("accepts inherit, full Claude Code ids and the 1M-context suffix as models", () => {
    // Act & Assert
    for (const model of ["inherit", "claude-haiku-4-5-20251001", "opus[1m]"]) {
      expect(parseAgentSource("ralph.x", makeAgentTemplate("x", { model })).frontmatter.model).toBe(model);
    }
  });

  it("rejects the legacy Copilot keys with what replaces each", () => {
    // Act
    const problems = problemsOf("---\nname: x\ndescription: 'X'\nagents: ['a']\nuser-invocable: false\n---\n");

    // Assert
    expect(problems).toEqual([
      'unknown key "agents": rename it to `subagents`',
      'unknown key "user-invocable": remove it; the Copilot writer always emits `user-invocable: false`',
    ]);
  });

  it("rejects a Copilot model id as the canonical model, naming the alias to use", () => {
    // Act
    const problems = problemsOf(makeAgentTemplate("x", { model: "claude-opus-4.6" }));

    // Assert
    expect(problems).toEqual([expect.stringMatching(/^model: .*"opus" or "claude-opus-4-6"/)]);
  });

  it("rejects a Claude Code alias as the Copilot model", () => {
    // Act
    const problems = problemsOf(makeAgentTemplate("x", { extraLines: ["copilot:", "  model: opus"] }));

    // Assert
    expect(problems).toEqual([expect.stringMatching(/^copilot\.model: .*Claude Code alias/)]);
  });

  it.each([
    ["an uppercase name", makeAgentTemplate("Ralph"), /^name: /],
    ["a missing description", "---\nname: x\n---\n", /^description: /],
    ["a repeated subagent", makeAgentTemplate("x", { subagents: ["a", "a"] }), /^subagents: must not repeat/],
    ["a tool Ralph never grants", makeAgentTemplate("x", { extraLines: ["tools: [WebSearch]"] }), /^tools\.0: /],
    ["an unknown runtime", makeAgentTemplate("x", { runtimes: ["codex"] }), /^runtimes\.0: /],
    ["no runtime", makeAgentTemplate("x", { runtimes: [] }), /^runtimes: must name at least one CLI/],
    ["a zero turn cap", makeAgentTemplate("x", { extraLines: ["maxTurns: 0"] }), /^maxTurns: /],
    [
      "an unknown copilot key",
      makeAgentTemplate("x", { extraLines: ["copilot:", "  tools: [a]"] }),
      /unknown key "tools"/,
    ],
  ])("rejects %s", (_label, source, problem) => {
    // Act & Assert
    expect(problemsOf(source)).toEqual([expect.stringMatching(problem)]);
  });

  it("reports a file without frontmatter", () => {
    // Act & Assert
    expect(problemsOf("# Agent\n")).toEqual([expect.stringMatching(/frontmatter block/)]);
  });

  it("reports YAML outside the supported subset", () => {
    // Act & Assert
    expect(problemsOf("---\nname: x\nsubagents:\n- a\n---\n")).toEqual([expect.stringMatching(/frontmatter line 3/)]);
  });

  it("names the template file in the error message", () => {
    // Act & Assert
    expect(() => parseAgentSource("ralph.writer", "# no frontmatter")).toThrow(/^agent ralph\.writer\.agent\.md: /);
  });
});

describe("agentFrontmatterSchema", () => {
  it("is strict at the top level", () => {
    // Act
    const result = agentFrontmatterSchema.safeParse({ name: "x", description: "X", color: "red" });

    // Assert
    expect(result.success).toBe(false);
  });
});

describe("agentFileIdOf", () => {
  it("strips the .agent.md suffix and ignores other files", () => {
    // Act & Assert
    expect([agentFileIdOf("ralph.ralph.agent.md"), agentFileIdOf("README.md")]).toEqual(["ralph.ralph", null]);
  });
});
