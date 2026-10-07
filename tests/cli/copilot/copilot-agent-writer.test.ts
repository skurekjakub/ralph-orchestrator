import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CopilotAgentWriter } from "../../../src/cli/copilot/copilot-agent-writer";
import { renderAgents } from "../../../src/container/setup/agent-includes";
import { ClaudeBuiltinTool } from "../../../src/cli/claude/claude-tools";
import { CliType, ReasoningEffort } from "../../../src/config/types";
import { makeAgentDefinition, makeTemplateContext } from "../../helpers/factories";

describe("CopilotAgentWriter", () => {
  const writer = new CopilotAgentWriter();

  describe("rendered agent files (golden)", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "copilot-golden-"));
      await mkdir(join(dir, "agents"));
      await mkdir(join(dir, "includes"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("renders canonical templates to the Copilot agent files Copilot CLI has always read", async () => {
      // Arrange
      const templates: Record<string, string> = {
        "ralph.ralph": [
          "---",
          "name: ralph",
          "description: 'Orchestrator — routes the writer; it''s a router'",
          "model: opus",
          "subagents: [ralph-writer]",
          "skills: [ralph-workflow]",
          "effort: high",
          "maxTurns: 300",
          "---",
          "",
          '{% section "agent-identity" %}',
          "# Ralph for {{ taskId }}",
          "{% render 'headless' %}",
          "Dispatch with the `{{ cliTools.subagent }}` tool.",
          "{% endsection %}",
          "",
        ].join("\n"),
        "ralph.ralph-writer": [
          "---",
          "name: ralph-writer",
          "description: 'Writer sub-agent'",
          "model: sonnet",
          "subagents: [ralph-validator]",
          "tools: [Read, Edit]",
          "---",
          "Artifacts: `{{ artifactDir }}/{{ self.name }}/`",
          "",
        ].join("\n"),
        "ralph.ralph-validator": [
          "---",
          "name: ralph-validator",
          "description: 'Validator'",
          "model: sonnet",
          "copilot:",
          "  model: claude-sonnet-4",
          "---",
          "Validate.",
          "",
        ].join("\n"),
      };
      for (const [fileId, text] of Object.entries(templates)) {
        await writeFile(join(dir, "agents", `${fileId}.agent.md`), text);
      }
      await writeFile(join(dir, "includes", "headless.md"), "Never call `{{ cliTools.askUser }}`.");
      const outDir = join(dir, "out");

      // Act
      await renderAgents({
        agentsDir: join(dir, "agents"),
        includesDir: join(dir, "includes"),
        context: makeTemplateContext({ cli: CliType.Copilot, taskId: "DOC-1" }),
        target: { cli: CliType.Copilot, rootAgentFileId: "ralph.ralph", outDir },
        mcpTools: { ado: ["ado_push_progress"] },
      });

      // Assert
      expect((await readdir(outDir)).sort()).toEqual([
        "ralph.ralph-validator.agent.md",
        "ralph.ralph-writer.agent.md",
        "ralph.ralph.agent.md",
      ]);
      expect(await readFile(join(outDir, "ralph.ralph.agent.md"), "utf-8")).toBe(
        [
          "---",
          "description: 'Orchestrator — routes the writer; it''s a router'",
          "model: claude-opus-4.6",
          "name: 'ralph'",
          "user-invocable: false",
          "agents: ['ralph-writer']",
          "---",
          "",
          "<agent-identity>",
          "",
          "# Ralph for DOC-1",
          "Never call `ask_questions`.",
          "Dispatch with the `task` tool.",
          "",
          "</agent-identity>",
          "",
        ].join("\n"),
      );
      expect(await readFile(join(outDir, "ralph.ralph-writer.agent.md"), "utf-8")).toBe(
        [
          "---",
          "description: 'Writer sub-agent'",
          "model: claude-sonnet-4.6",
          "name: 'ralph-writer'",
          "user-invocable: false",
          "agents: ['ralph-validator']",
          "---",
          "Artifacts: `.ralph/tasks/DOC-1/artifacts/ralph-writer/`",
          "",
        ].join("\n"),
      );
      expect(await readFile(join(outDir, "ralph.ralph-validator.agent.md"), "utf-8")).toBe(
        [
          "---",
          "description: 'Validator'",
          "model: claude-sonnet-4",
          "name: 'ralph-validator'",
          "user-invocable: false",
          "---",
          "Validate.",
          "",
        ].join("\n"),
      );
    });
  });

  describe("model", () => {
    it.each([
      ["opus", undefined, "claude-opus-4.6"],
      ["sonnet", undefined, "claude-sonnet-4.6"],
      ["haiku", undefined, "claude-haiku-4.5"],
      ["fable", undefined, "claude-opus-4.6"],
      ["claude-haiku-4-5-20251001", undefined, "claude-haiku-4.5"],
      ["opus", "gpt-5.4", "gpt-5.4"],
      [undefined, "gpt-5.4", "gpt-5.4"],
      ["inherit", "gpt-5.4", "gpt-5.4"],
    ])("maps canonical %s with copilot.model %s to %s", (model, copilotModel, expected) => {
      // Arrange
      const agent = makeAgentDefinition({ name: "x", model, copilot: { model: copilotModel } });

      // Act
      const file = writer.write(agent);

      // Assert
      expect(file!.content).toContain(`\nmodel: ${expected}\n`);
    });

    it.each([["inherit"], [undefined]])("leaves the model to Copilot CLI for %s without copilot.model", (model) => {
      // Act
      const file = writer.write(makeAgentDefinition({ name: "x", model }));

      // Assert
      expect(file!.content).not.toContain("model:");
    });

    it("throws for a full Claude Code id with no Copilot equivalent", () => {
      // Act & Assert
      expect(() => writer.write(makeAgentDefinition({ name: "x", model: "claude-opus-5-5-1" }))).toThrow(
        /no Copilot CLI equivalent/,
      );
    });
  });

  it("drops the Claude Code-only keys", () => {
    // Arrange
    const agent = makeAgentDefinition({
      name: "x",
      model: "opus",
      tools: [ClaudeBuiltinTool.Read],
      skills: ["a"],
      effort: ReasoningEffort.Max,
      maxTurns: 10,
    });

    // Act
    const file = writer.write(agent);

    // Assert
    expect(file!.content).toBe(
      "---\ndescription: 'The x agent'\nmodel: claude-opus-4.6\nname: 'x'\nuser-invocable: false\n---\n\nBody.\n",
    );
  });

  it("writes nothing for an agent whose runtimes exclude Copilot", () => {
    // Act & Assert
    expect(writer.write(makeAgentDefinition({ name: "x", runtimes: [CliType.Claude] }))).toBeNull();
  });
});
