import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateAgentGraph } from "../../src/validate/agents";
import { CliType, StageMode, type IAgentProfile, type IStageConfig } from "../../src/config/types";
import { makeAgentTemplate, makeProfile, makeStage, type AgentTemplateFields } from "../helpers/factories";

const PREFIX = "profiles/docs";

let tempDir: string;
let agentsDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "validate-agents-"));
  agentsDir = join(tempDir, "agents");
  mkdirSync(agentsDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Writes `ralph.<name>.agent.md` for each entry. */
function writeAgents(agents: Record<string, AgentTemplateFields>): void {
  for (const [name, fields] of Object.entries(agents)) {
    writeFileSync(join(agentsDir, `ralph.${name}.agent.md`), makeAgentTemplate(name, fields));
  }
}

/** One variant whose stages are `stages`, with optional post-task hook stages. */
function variant(stages: IStageConfig[], hookStages: IStageConfig[] = []): IAgentProfile {
  return makeProfile({ stages, postTaskHooks: hookStages.length ? [{ name: "analysis", stages: hookStages }] : [] });
}

/** Errors `validateAgentGraph` reports for `variants`. */
async function validate(...variants: IAgentProfile[]): Promise<string[]> {
  const errors: string[] = [];
  await validateAgentGraph(variants, agentsDir, PREFIX, errors);
  return errors;
}

describe("validateAgentGraph", () => {
  it("passes a valid graph on both CLIs", async () => {
    // Arrange
    writeAgents({
      ralph: { model: "opus", subagents: ["writer"] },
      writer: { model: "sonnet", subagents: ["validator"] },
      validator: { model: "inherit" },
    });

    // Act
    const errors = [
      ...(await validate(variant([makeStage({ agent: "ralph.ralph", cli: CliType.Claude })]))),
      ...(await validate(variant([makeStage({ agent: "ralph.ralph", cli: CliType.Copilot })]))),
    ];

    // Assert
    expect(errors).toEqual([]);
  });

  it("reports a subagent that no template defines (dangling reviewer)", async () => {
    // Arrange
    writeAgents({ ralph: { subagents: ["ralph-reviewer-technical-gpt"] } });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.ralph" })]));

    // Assert
    expect(errors).toEqual([
      `${PREFIX}/agents: agent ralph.ralph: subagent "ralph-reviewer-technical-gpt" is not an agent of this profile`,
    ]);
  });

  it("reports two templates sharing a name", async () => {
    // Arrange
    writeAgents({ a: {} });
    writeFileSync(join(agentsDir, "ralph.a-copy.agent.md"), makeAgentTemplate("a"));

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.a" })]));

    // Assert
    expect(errors).toEqual([`${PREFIX}/agents: agents ralph.a-copy and ralph.a share the name "a"`]);
  });

  it("reports a subagent cycle", async () => {
    // Arrange
    writeAgents({ a: { subagents: ["b"] }, b: { subagents: ["a"] } });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.a" })]));

    // Assert
    expect(errors).toEqual([`${PREFIX}/agents: subagent cycle: a → b → a`]);
  });

  it("reports every frontmatter problem with its file and skips graph checks", async () => {
    // Arrange
    writeFileSync(
      join(agentsDir, "ralph.old.agent.md"),
      "---\nname: 'old'\ndescription: 'Old'\nuser-invocable: false\n---\n",
    );
    writeFileSync(join(agentsDir, "ralph.none.agent.md"), "# no frontmatter\n");
    writeAgents({ ralph: { subagents: ["old"] } });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.ralph" })]));

    // Assert
    expect(errors).toEqual([
      expect.stringMatching(/^profiles\/docs\/agents\/ralph\.none\.agent\.md: expected a frontmatter block/),
      expect.stringMatching(/^profiles\/docs\/agents\/ralph\.old\.agent\.md: unknown key "user-invocable"/),
    ]);
  });

  it("reports a variant or hook stage whose agent has no template, listing the available ones", async () => {
    // Arrange
    writeAgents({ ralph: {} });

    // Act
    const errors = await validate(
      variant(
        [makeStage({ agent: "ralph.missing" })],
        [makeStage({ agent: "ralph.scientist", role: "scientist", mode: StageMode.Local })],
      ),
    );

    // Assert
    expect(errors).toEqual([
      expect.stringMatching(
        /^profiles\/docs\/variants\[0\]\/stages\[0\]: agent "ralph\.missing" not found[\s\S]*Available agents: ralph\.ralph/,
      ),
      expect.stringMatching(
        /^profiles\/docs\/variants\[0\]\/postTaskHooks\[0\]\/stages\[0\]: agent "ralph\.scientist" not found/,
      ),
    ]);
  });

  it("reports a reachable agent that does not run on the stage's CLI", async () => {
    // Arrange
    writeAgents({ ralph: { subagents: ["copilot-only"] }, "copilot-only": { runtimes: ["copilot"] } });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.ralph", cli: CliType.Claude })]));

    // Assert
    expect(errors).toEqual([
      expect.stringMatching(
        /^profiles\/docs: agent ralph\.copilot-only \(reachable from ralph\.ralph\) does not run on cli "claude" \(runtimes: copilot\)/,
      ),
    ]);
  });

  it("reports a stage root that inherits its model", async () => {
    // Arrange
    writeAgents({ ralph: { model: "inherit" } });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.ralph" })]));

    // Assert
    expect(errors).toEqual([`${PREFIX}: agent ralph.ralph runs as the stage root, so its model cannot be "inherit"`]);
  });

  it("reports skills an agent preloads that its stage does not mount", async () => {
    // Arrange
    writeAgents({ ralph: { subagents: ["writer"] }, writer: { skills: ["ralph-workflow", "style"] } });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.ralph", skills: ["style"] })]));

    // Assert
    expect(errors).toEqual([
      `${PREFIX}: agent ralph.writer (reachable from ralph.ralph) preloads skill(s) the stage does not mount: ralph-workflow`,
    ]);
  });

  it("reports a Claude Code stage root with skills whose tools leave out Skill", async () => {
    // Arrange
    writeAgents({
      ralph: { skills: ["style"], extraLines: ["tools: [Read, Bash]"] },
      reader: { skills: ["style"], extraLines: ["tools: [Read, Skill]"] },
    });
    const stage = (agent: string, cli: CliType) => makeStage({ agent, cli, skills: ["style"] });

    // Act
    const claude = await validate(variant([stage("ralph.ralph", CliType.Claude)]));
    const copilot = await validate(variant([stage("ralph.ralph", CliType.Copilot)]));
    const withSkill = await validate(variant([stage("ralph.reader", CliType.Claude)]));

    // Assert
    expect(claude).toEqual([
      `${PREFIX}: agent ralph.ralph runs as the stage root on cli "claude", which loads its skills with the Skill tool, so its tools must include Skill`,
    ]);
    expect(copilot).toEqual([]);
    expect(withSkill).toEqual([]);
  });

  it("reports a model with no Copilot equivalent only for Copilot stages", async () => {
    // Arrange
    writeAgents({ ralph: { model: "claude-opus-5-5-1" } });

    // Act
    const copilot = await validate(variant([makeStage({ agent: "ralph.ralph", cli: CliType.Copilot })]));
    const claude = await validate(variant([makeStage({ agent: "ralph.ralph", cli: CliType.Claude })]));

    // Assert
    expect(copilot).toEqual([expect.stringMatching(/agent ralph\.ralph: .*no Copilot CLI equivalent/)]);
    expect(claude).toEqual([]);
  });

  it("reports a finding shared by several variants once", async () => {
    // Arrange
    writeAgents({ ralph: { model: "inherit" } });
    const stage = makeStage({ agent: "ralph.ralph" });

    // Act
    const errors = await validate(variant([stage]), variant([stage]));

    // Assert
    expect(errors).toHaveLength(1);
  });

  it("reports a missing agents directory", async () => {
    // Arrange
    rmSync(agentsDir, { recursive: true });

    // Act
    const errors = await validate(variant([makeStage({ agent: "ralph.ralph" })]));

    // Assert
    expect(errors).toEqual([expect.stringMatching(/^profiles\/docs: agents\/ directory not found/)]);
  });
});
