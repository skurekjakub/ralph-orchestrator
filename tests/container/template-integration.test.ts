import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderAgents, type TemplateContext } from "../../src/container/setup/agent-includes";
import { renderSkills } from "../../src/container/setup/skill-includes";
import { readProfileFile, resolveProfileVariants } from "../../src/config/profile-variants";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { claudeAgentFileName } from "../../src/cli/claude/claude-agent-writer";
import { copilotAgentFileName } from "../../src/cli/copilot/copilot-agent-writer";
import { AgentCatalog } from "../../src/cli/agent-catalog";
import { ClaudeAuthMode, CliType } from "../../src/config/types";
import { makeTemplateContext } from "../helpers/factories";

/**
 * Integration tests that render real agent templates, shared includes,
 * and skills against fake task data. These catch Liquid syntax errors,
 * missing partials, and broken conditionals in the actual files shipped
 * in the repository — not synthetic test fixtures.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const INCLUDES_DIR = join(ROOT, "shared/agent-includes");
const SKILLS_DIR = join(ROOT, "shared/skills");
const RUNTIMES = createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken);

let outRoot: string;

beforeAll(async () => {
  outRoot = await mkdtemp(join(tmpdir(), "template-integration-"));
});

afterAll(async () => {
  await rm(outRoot, { recursive: true, force: true });
});

/**
 * Strip markdown fenced code blocks and inline code from rendered output.
 * This avoids false positives when checking for unresolved Liquid tags —
 * files with {% raw %} blocks legitimately contain literal `{% render %}` text
 * as documentation examples inside code fences.
 */
function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
}

/** Check that rendered output has no unresolved Liquid tags (outside code blocks). */
function expectNoUnresolvedTags(rendered: string, label: string): void {
  const stripped = stripCodeBlocks(rendered);
  expect(stripped, `${label} should not contain unresolved render tags`).not.toMatch(/\{%\s*render\b/);
  expect(stripped, `${label} should not contain unresolved section tags`).not.toMatch(/\{%\s*section\b/);
}

/** Profiles with agent templates to test. */
const PROFILES = ["ralph-docs", "ralph-vscode"] as const;

/** Every distinct stage root agent of a profile's variants and post-task hooks. */
function stageRoots(profileId: string): string[] {
  const variants = resolveProfileVariants(
    readProfileFile(join(ROOT, "profiles", profileId, "profile.json")),
    profileId,
  );
  const stages = variants.flatMap((v) => [...v.stages, ...v.postTaskHooks.flatMap((h) => h.stages)]);
  return [...new Set(stages.map((s) => s.agent))];
}

/** File name the writer of `cli` gives an agent. */
function renderedFileName(cli: CliType, fileId: string, name: string): string {
  return cli === CliType.Claude ? claudeAgentFileName(name) : copilotAgentFileName(fileId);
}

/**
 * Renders the agents reachable from `rootFileId` for `cli` into a fresh directory.
 *
 * @returns Rendered file content keyed by agent file id.
 */
async function renderStage(
  profileId: string,
  rootFileId: string,
  cli: CliType,
  context: TemplateContext,
): Promise<Map<string, string>> {
  const agentsDir = join(ROOT, "profiles", profileId, "agents");
  const outDir = await mkdtemp(join(outRoot, `${profileId}-${cli}-`));
  const runtime = RUNTIMES.get(cli);
  const scope = { ...context, cli, cliTools: runtime.toolNames };
  const catalog = await AgentCatalog.load(agentsDir);
  await renderAgents({
    catalog,
    includesDir: INCLUDES_DIR,
    context: scope,
    target: { cli, rootAgentFileId: rootFileId, outDir, prune: true },
    writer: runtime.agentWriter,
    mcpTools: {},
  });
  const rendered = new Map<string, string>();
  for (const fileId of catalog.reachableFrom(rootFileId)) {
    const file = renderedFileName(cli, fileId, catalog.get(fileId).frontmatter.name);
    rendered.set(fileId, await readFile(join(outDir, file), "utf-8"));
  }
  return rendered;
}

// ── Contexts ────────────────────────────────────────────────────────────────

/** Standard first-run context — non-revision, single stage. */
function standardContext(profileId: string): TemplateContext {
  return makeTemplateContext({
    profileId,
    repo: "/workspace",
    targetRepoPath: "/workspace",
    taskId: "DOC-100",
    taskTitle: "Add migration guide for v31",
    taskStatus: "To Do",
    taskType: "Task",
    taskPriority: "High",
    taskLabels: ["documentation"],
    taskComponents: ["Content"],
    taskProject: "DOC",
    taskDescription: "Write a migration guide covering the upgrade path from v30 to v31.",
    taskCreated: "2026-02-15T10:30:00.000+0000",
    taskUpdated: "2026-02-16T08:00:00.000+0000",
    commentTrigger: "@Ralph",
    triggerParams: {},
    isRevision: false,
    prUrl: "",
    ralphchivesEnabled: true,
    mcpServers: ["jira-kentico", "ado", "web-fetch"],
    skills: ["ralph-ado-pr-workflow", "ralph-ralphchives", "ralph-workflow"],
    stageRole: "primary",
    stageMode: "container",
    stageIndex: 0,
    stageCount: 1,
    isFirstStage: true,
    isLastStage: true,
    previousStageRoles: [],
  });
}

/** Revision context — triggers {% if isRevision %} branches. */
function revisionContext(profileId: string): TemplateContext {
  return makeTemplateContext({
    ...standardContext(profileId),
    taskStatus: "Defect Found",
    isRevision: true,
    prUrl: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
    skills: ["ralph-ado-pr-workflow", "ralph-workflow"],
  });
}

/** Context with trigger params — tests param conditionals. */
function triggerParamContext(profileId: string): TemplateContext {
  return makeTemplateContext({
    ...standardContext(profileId),
    triggerParams: {
      codesamples: "true",
      branch_name: "feature/v31-api-changes",
      verbose: "true",
    },
  });
}

/** Post-task hook context. */
function hookContext(profileId: string): TemplateContext {
  return makeTemplateContext({
    ...standardContext(profileId),
    stageRole: "analyzer",
    stageMode: "local",
    hook: {
      taskOutputDir: "/output/logs/DOC-100-1234567890000",
      collectedLogs: { audit: "audit.jsonl", transcript: "transcript.md" },
      name: "run-analysis",
      outputDir: "/output/logs/DOC-100-1234567890000/hooks/run-analysis",
    },
  });
}

const CONTEXTS = {
  standard: standardContext,
  revision: revisionContext,
  triggerParams: triggerParamContext,
  hook: hookContext,
};

// ── Agent template tests ────────────────────────────────────────────────────

describe("agent template rendering (real files)", () => {
  for (const profileId of PROFILES) {
    describe(`profile: ${profileId}`, () => {
      for (const cli of [CliType.Copilot, CliType.Claude]) {
        for (const [label, makeContext] of Object.entries(CONTEXTS)) {
          it(`renders every stage's agents for ${cli} without Liquid errors (${label} context)`, async () => {
            // Arrange
            const context = makeContext(profileId);
            const rendered = new Map<string, string>();

            // Act
            for (const root of stageRoots(profileId)) {
              for (const [fileId, content] of await renderStage(profileId, root, cli, context)) {
                rendered.set(fileId, content);
              }
            }

            // Assert
            for (const [fileId, content] of rendered) expectNoUnresolvedTags(content, `${fileId} (${cli})`);
          });
        }
      }

      it("reaches every agent template from some stage root", async () => {
        // Arrange
        const catalog = await AgentCatalog.load(join(ROOT, "profiles", profileId, "agents"));

        // Act
        const reached = new Set(stageRoots(profileId).flatMap((root) => catalog.reachableFrom(root)));

        // Assert
        expect(catalog.fileIds.filter((fileId) => !reached.has(fileId))).toEqual([]);
      });

      it("interpolates task variables into the main agent", async () => {
        // Act
        const rendered = await renderStage(profileId, "ralph.ralph", CliType.Copilot, standardContext(profileId));

        // Assert
        const main = rendered.get("ralph.ralph")!;
        expect(main).toContain("DOC-100");
        expect(main).toContain("Add migration guide for v31");
      });

      it("renders isRevision conditional content only in revision context", async () => {
        // Act
        const standard = (await renderStage(profileId, "ralph.ralph", CliType.Copilot, standardContext(profileId))).get(
          "ralph.ralph",
        )!;
        const revision = (await renderStage(profileId, "ralph.ralph", CliType.Copilot, revisionContext(profileId))).get(
          "ralph.ralph",
        )!;

        // Assert
        expect(revision).toContain("revision");
        expect(standard).not.toContain("previous attempt");
        expect(revision).toContain("previous attempt");
      });

      it("renders section tags as XML boundaries", async () => {
        // Act
        const main = (await renderStage(profileId, "ralph.ralph", CliType.Claude, standardContext(profileId))).get(
          "ralph.ralph",
        )!;

        // Assert
        expect(main).toContain("<security>");
        expect(main).toContain("</security>");
        expect(main).toContain("<agent-identity>");
        expect(main).toContain("</agent-identity>");
      });

      it("names each CLI's own tools in the rendered prompts", async () => {
        // Act
        const claude = [
          ...(await renderStage(profileId, "ralph.ralph", CliType.Claude, standardContext(profileId))).values(),
        ];
        const copilot = [
          ...(await renderStage(profileId, "ralph.ralph", CliType.Copilot, standardContext(profileId))).values(),
        ];

        // Assert
        for (const content of claude) {
          expect(content).not.toContain("ask_questions");
          expect(content).not.toContain("`task` tool");
        }
        expect(claude.join("\n")).toContain("AskUserQuestion");
        expect(copilot.join("\n")).toContain("ask_questions");
      });

      it("renders hook agents with hook context variables", async () => {
        // Act
        const rendered = await renderStage(profileId, "ralph.scientist", CliType.Copilot, hookContext(profileId));

        // Assert
        const hookAgents = [...rendered].filter(([fileId]) => /run-analyzer|agent-improver/.test(fileId));
        expect(hookAgents.length).toBeGreaterThan(0);
        for (const [fileId, content] of hookAgents) {
          expect(content, `${fileId} should interpolate artifactDir`).toContain(".ralph/tasks/DOC-100/artifacts");
          expect(content, `${fileId} should interpolate taskId`).toContain("DOC-100");
        }
      });
    });
  }
});

// ── Skill template tests ────────────────────────────────────────────────────

/** Collect all skill names used across profile.json files. */
function collectAllSkillNames(): string[] {
  return [
    ...new Set(
      PROFILES.flatMap((profileId) =>
        resolveProfileVariants(readProfileFile(join(ROOT, "profiles", profileId, "profile.json")), profileId).flatMap(
          (v) => [...v.stages, ...v.postTaskHooks.flatMap((h) => h.stages)].flatMap((s) => [...s.skills]),
        ),
      ),
    ),
  ];
}

/** Renders `skills` with `context` into a fresh directory and returns it. */
async function renderSkillsTo(skills: string[], context: TemplateContext): Promise<string> {
  const outDir = await mkdtemp(join(outRoot, "skills-"));
  await renderSkills({
    skillsDir: SKILLS_DIR,
    skillNames: skills,
    includesDir: INCLUDES_DIR,
    context,
    outDir,
    prune: true,
  });
  return outDir;
}

describe("skill template rendering (real files)", () => {
  for (const cli of [CliType.Copilot, CliType.Claude]) {
    it(`renders all declared skills for ${cli} without Liquid errors`, async () => {
      // Arrange
      const allSkills = collectAllSkillNames();
      const context = { ...standardContext("ralph-docs"), cli, cliTools: RUNTIMES.get(cli).toolNames };

      // Act
      const outDir = await renderSkillsTo(allSkills, context);

      // Assert
      for (const skill of allSkills) {
        const buildPath = join(outDir, skill, "SKILL.md");
        expect(existsSync(buildPath), `${skill}/SKILL.md should be rendered`).toBe(true);
        expectNoUnresolvedTags(await readFile(buildPath, "utf-8"), skill);
      }
    });
  }

  it("interpolates task variables into skills", async () => {
    // Act
    const outDir = await renderSkillsTo(["ralph-workflow"], standardContext("ralph-docs"));

    // Assert
    expect(await readFile(join(outDir, "ralph-workflow", "SKILL.md"), "utf-8")).toContain("DOC-100");
  });

  it("preserves {% raw %} escaped content in skills as literal text", async () => {
    // Arrange
    const rawSkills = ["ralph-documentation-syntax", "ralph-callout-selection", "ralph-build-errors"].filter((s) =>
      collectAllSkillNames().includes(s),
    );

    // Act
    const outDir = await renderSkillsTo(rawSkills, standardContext("ralph-docs"));

    // Assert
    for (const skill of rawSkills) {
      const rendered = await readFile(join(outDir, skill, "SKILL.md"), "utf-8");
      expect(rendered, `${skill} should not contain raw tags in output`).not.toContain("{% raw %}");
      expect(rendered, `${skill} should not contain endraw tags in output`).not.toContain("{% endraw %}");
      expect(rendered.length).toBeGreaterThan(50);
    }
  });

  it("renders skills with revision context", async () => {
    // Act
    const outDir = await renderSkillsTo(["ralph-workflow"], revisionContext("ralph-docs"));

    // Assert
    const skillDir = join(outDir, "ralph-workflow");
    expect((await readFile(join(skillDir, "SKILL.md"), "utf-8")).length).toBeGreaterThan(0);
    const revSetup = await readFile(join(skillDir, "references", "r1-setup.md"), "utf-8");
    expect(revSetup.length, "r1-setup.md should have content in revision context").toBeGreaterThan(10);
    const stdSetup = await readFile(join(skillDir, "references", "1-setup.md"), "utf-8");
    expect(stdSetup, "1-setup.md should have no workflow content in revision context").not.toContain("# Phase 1");
  });
});

// ── Shared include tests ────────────────────────────────────────────────────

describe("shared agent includes (real files)", () => {
  /** Render a single include as if it were an agent template. */
  async function renderInclude(includeName: string, ctx: TemplateContext): Promise<string> {
    const { Liquid } = await import("liquidjs");
    const { registerCustomTags } = await import("../../src/container/setup/liquid-tags");
    const engine = new Liquid({
      root: [INCLUDES_DIR],
      extname: ".md",
      globals: ctx,
    });
    registerCustomTags(engine);
    return engine.parseAndRender(`{% render '${includeName}' %}`, ctx);
  }

  it("renders personality/ralph without errors", async () => {
    const rendered = await renderInclude("personality/ralph", standardContext("ralph-docs"));
    expect(rendered.length).toBeGreaterThan(10);
    expectNoUnresolvedTags(rendered, "personality/ralph");
  });

  it("renders personality/malph without errors", async () => {
    const rendered = await renderInclude("personality/malph", standardContext("ralph-docs"));
    expect(rendered.length).toBeGreaterThan(10);
    expectNoUnresolvedTags(rendered, "personality/malph");
  });

  it("renders prompt-security without errors", async () => {
    const rendered = await renderInclude("prompt-security", standardContext("ralph-docs"));
    expect(rendered.length).toBeGreaterThan(10);
  });

  it("renders post-hooks/run-analyzer with hook context", async () => {
    const rendered = await renderInclude("post-hooks/run-analyzer", hookContext("ralph-docs"));
    expect(rendered).toContain("DOC-100");
    expect(rendered).toContain(".ralph/tasks/DOC-100/artifacts");
    expect(rendered).toContain("/output/logs/DOC-100-1234567890000");
  });

  it("renders post-hooks/subagent-mapper with hook context", async () => {
    const rendered = await renderInclude("post-hooks/subagent-mapper", hookContext("ralph-docs"));
    expect(rendered).toContain("DOC-100");
    expect(rendered).toContain(".ralph/tasks/DOC-100/artifacts");
    expect(rendered).toContain("/output/logs/DOC-100-1234567890000");
  });

  it("renders post-hooks/agent-improver with hook context", async () => {
    const rendered = await renderInclude("post-hooks/agent-improver", hookContext("ralph-docs"));
    expect(rendered).toContain("DOC-100");
    expect(rendered).toContain(".ralph/tasks/DOC-100/artifacts");
    // {% raw %} blocks should be consumed — literal Liquid tags preserved in output
    expect(rendered).not.toContain("{% raw %}");
    expect(rendered).not.toContain("{% endraw %}");
  });

  it("renders post-hooks/run-synthesizer with hook context", async () => {
    const rendered = await renderInclude("post-hooks/run-synthesizer", hookContext("ralph-docs"));
    expect(rendered).toContain("DOC-100");
    expect(rendered).toContain(".ralph/tasks/DOC-100/artifacts");
    expect(rendered).toContain("/output/logs/DOC-100-1234567890000");
  });

  it("renders ralph-docs workflow includes", async () => {
    const includes = [
      "ralph-docs/ralph-standard-workflow",
      "ralph-docs/ralph-revision-workflow",
      "ralph-docs/malph-review-workflow",
    ];
    for (const name of includes) {
      const rendered = await renderInclude(name, standardContext("ralph-docs"));
      expect(rendered.length, `${name} should produce output`).toBeGreaterThan(10);
    }
  });

  it("renders ralph-vscode workflow includes", async () => {
    const includes = [
      "ralph-vscode/ralph-standard-workflow",
      "ralph-vscode/ralph-revision-workflow",
      "ralph-vscode/malph-review-workflow",
    ];
    for (const name of includes) {
      const rendered = await renderInclude(name, standardContext("ralph-vscode"));
      expect(rendered.length, `${name} should produce output`).toBeGreaterThan(10);
    }
  });

  it("renders ralphchives include", async () => {
    const rendered = await renderInclude("ralphchives", standardContext("ralph-docs"));
    expect(rendered.length).toBeGreaterThan(10);
  });

  it("renders ado-api include", async () => {
    const rendered = await renderInclude("ado-api", standardContext("ralph-docs"));
    expect(rendered.length).toBeGreaterThan(10);
  });

  it("renders source-references include", async () => {
    const rendered = await renderInclude("source-references", standardContext("ralph-docs"));
    expect(rendered.length).toBeGreaterThan(10);
  });
});
