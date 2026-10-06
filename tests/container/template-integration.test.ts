import { describe, it, expect, afterEach } from "vitest";
import { readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveAgentIncludes, type TemplateContext } from "../../src/container/setup/agent-includes.js";
import { resolveSkillIncludes } from "../../src/container/setup/skill-includes.js";
import { makeTemplateContext } from "../helpers/factories.js";

/**
 * Integration tests that render real agent templates, shared includes,
 * and skills against fake task data. These catch Liquid syntax errors,
 * missing partials, and broken conditionals in the actual files shipped
 * in the repository — not synthetic test fixtures.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const INCLUDES_DIR = join(ROOT, "shared/agent-includes");
const SKILLS_DIR = join(ROOT, "shared/skills");

/**
 * Strip markdown fenced code blocks and inline code from rendered output.
 * This avoids false positives when checking for unresolved Liquid tags —
 * files with {% raw %} blocks legitimately contain literal `{% render %}` text
 * as documentation examples inside code fences.
 */
function stripCodeBlocks(content: string): string {
  // Remove fenced code blocks (``` ... ```)
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

/** Discover all *.agent.md files in a profile's agents/ dir. */
async function listAgentTemplates(profileId: string): Promise<string[]> {
  const agentDir = join(ROOT, "profiles", profileId, "agents");
  if (!existsSync(agentDir)) return [];
  const files = await readdir(agentDir);
  return files.filter((f) => f.endsWith(".agent.md"));
}

/** Read a rendered file from the profile's .build/ directory. */
async function readRendered(profileId: string, filename: string): Promise<string> {
  return readFile(join(ROOT, "profiles", profileId, ".build", filename), "utf-8");
}

/** Clean up .build dirs after tests. */
async function cleanBuild(profileId: string): Promise<void> {
  const buildDir = join(ROOT, "profiles", profileId, ".build");
  if (existsSync(buildDir)) await rm(buildDir, { recursive: true });
}

async function cleanSkillsBuild(): Promise<void> {
  const buildDir = join(SKILLS_DIR, ".build");
  if (existsSync(buildDir)) await rm(buildDir, { recursive: true });
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

/** Multi-stage context — second stage in a 2-stage pipeline. */
function _multiStageContext(profileId: string): TemplateContext {
  return makeTemplateContext({
    ...standardContext(profileId),
    stageRole: "reviewer",
    stageMode: "container",
    stageIndex: 1,
    stageCount: 2,
    isFirstStage: false,
    isLastStage: true,
    previousStageRoles: ["primary"],
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

// ── Agent template tests ────────────────────────────────────────────────────

describe("agent template rendering (real files)", () => {
  for (const profileId of PROFILES) {
    describe(`profile: ${profileId}`, () => {
      afterEach(async () => {
        await cleanBuild(profileId);
      });

      it("renders all agent templates without Liquid errors (standard context)", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const ctx = standardContext(profileId);

        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        const templates = await listAgentTemplates(profileId);
        for (const file of templates) {
          const rendered = await readRendered(profileId, file);
          expectNoUnresolvedTags(rendered, file);
        }
      });

      it("renders all agent templates without Liquid errors (revision context)", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const ctx = revisionContext(profileId);

        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        const templates = await listAgentTemplates(profileId);
        for (const file of templates) {
          const rendered = await readRendered(profileId, file);
          expectNoUnresolvedTags(rendered, file);
        }
      });

      it("renders all agent templates without Liquid errors (trigger params)", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const ctx = triggerParamContext(profileId);

        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        const templates = await listAgentTemplates(profileId);
        for (const file of templates) {
          const rendered = await readRendered(profileId, file);
          expectNoUnresolvedTags(rendered, file);
        }
      });

      it("renders all agent templates without Liquid errors (hook context)", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const ctx = hookContext(profileId);

        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        const templates = await listAgentTemplates(profileId);
        for (const file of templates) {
          const rendered = await readRendered(profileId, file);
          expectNoUnresolvedTags(rendered, file);
        }
      });

      it("interpolates task variables into rendered output", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const ctx = standardContext(profileId);

        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        // The main agent template should contain the interpolated taskId
        const mainAgent = (await listAgentTemplates(profileId)).find((f) => f.includes("ralph.ralph.agent.md"));
        if (mainAgent) {
          const rendered = await readRendered(profileId, mainAgent);
          expect(rendered).toContain("DOC-100");
          expect(rendered).toContain("Add migration guide for v31");
        }
      });

      it("renders isRevision conditional content only in revision context", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const mainAgent = (await listAgentTemplates(profileId)).find((f) => f.includes("ralph.ralph.agent.md"));
        if (!mainAgent) return;

        // Standard — no revision content
        await resolveAgentIncludes(agentDir, INCLUDES_DIR, standardContext(profileId));
        const standard = await readRendered(profileId, mainAgent);
        await cleanBuild(profileId);

        // Revision — should include revision content
        await resolveAgentIncludes(agentDir, INCLUDES_DIR, revisionContext(profileId));
        const revision = await readRendered(profileId, mainAgent);

        expect(revision).toContain("revision");
        // Standard should NOT have the revision-specific "previous attempt" text
        expect(standard).not.toContain("previous attempt");
        expect(revision).toContain("previous attempt");
      });

      it("renders section tags as XML boundaries", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const ctx = standardContext(profileId);
        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        const mainAgent = (await listAgentTemplates(profileId)).find((f) => f.includes("ralph.ralph.agent.md"));
        if (!mainAgent) return;

        const rendered = await readRendered(profileId, mainAgent);
        // section tags should render as XML boundaries
        expect(rendered).toContain("<security>");
        expect(rendered).toContain("</security>");
        expect(rendered).toContain("<agent-identity>");
        expect(rendered).toContain("</agent-identity>");
      });

      it("renders trigger param conditionals correctly", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const mainAgent = (await listAgentTemplates(profileId)).find((f) => f.includes("ralph.ralph.agent.md"));
        if (!mainAgent) return;

        // Without codesamples param
        await resolveAgentIncludes(agentDir, INCLUDES_DIR, standardContext(profileId));
        const withoutParams = await readRendered(profileId, mainAgent);
        await cleanBuild(profileId);

        // With codesamples param
        await resolveAgentIncludes(agentDir, INCLUDES_DIR, triggerParamContext(profileId));
        const withParams = await readRendered(profileId, mainAgent);

        // Both should render without errors — no unresolved tags
        expectNoUnresolvedTags(withoutParams, "without-params");
        expectNoUnresolvedTags(withParams, "with-params");
      });

      it("renders hook agent templates with hook context variables", async () => {
        const agentDir = join(ROOT, "profiles", profileId, "agents");
        const hookTemplates = (await listAgentTemplates(profileId)).filter(
          (f) => f.includes("run-analyzer") || f.includes("agent-improver"),
        );
        if (hookTemplates.length === 0) return;

        const ctx = hookContext(profileId);
        await resolveAgentIncludes(agentDir, INCLUDES_DIR, ctx);

        for (const file of hookTemplates) {
          const rendered = await readRendered(profileId, file);
          expect(rendered, `${file} should interpolate artifactDir`).toContain(".ralph/tasks/DOC-100/artifacts");
          expect(rendered, `${file} should interpolate taskId`).toContain("DOC-100");
        }
      });
    });
  }
});

// ── Skill template tests ────────────────────────────────────────────────────

/** Collect all skill names used across profile.json files. */
async function collectAllSkillNames(): Promise<string[]> {
  const skills = new Set<string>();
  for (const profileId of PROFILES) {
    const profileJson = JSON.parse(await readFile(join(ROOT, "profiles", profileId, "profile.json"), "utf-8"));
    for (const variant of profileJson.variants ?? []) {
      for (const stage of variant.stages ?? []) {
        for (const skill of stage.skills ?? []) {
          skills.add(skill);
        }
      }
      for (const hook of variant.postTaskHooks ?? []) {
        for (const stage of hook.stages ?? []) {
          for (const skill of stage.skills ?? []) {
            skills.add(skill);
          }
        }
      }
    }
  }
  return [...skills];
}

describe("skill template rendering (real files)", () => {
  afterEach(async () => {
    await cleanSkillsBuild();
  });

  it("renders all declared skills without Liquid errors", async () => {
    const allSkills = await collectAllSkillNames();
    if (allSkills.length === 0) return;

    const ctx = standardContext("ralph-docs");
    await resolveSkillIncludes(SKILLS_DIR, allSkills, INCLUDES_DIR, ctx);

    // Verify all skills produced output
    for (const skill of allSkills) {
      const buildPath = join(SKILLS_DIR, ".build", skill, "SKILL.md");
      expect(existsSync(buildPath), `${skill}/SKILL.md should be rendered`).toBe(true);

      const rendered = await readFile(buildPath, "utf-8");
      expectNoUnresolvedTags(rendered, skill);
    }
  });

  it("interpolates task variables into skills", async () => {
    const ctx = standardContext("ralph-docs");
    // Pick a skill known to use {{ taskId }}
    const testSkills = ["ralph-workflow"];
    const availableSkills = (await collectAllSkillNames()).filter((s) => testSkills.includes(s));
    if (availableSkills.length === 0) return;

    await resolveSkillIncludes(SKILLS_DIR, availableSkills, INCLUDES_DIR, ctx);

    for (const skill of availableSkills) {
      const rendered = await readFile(join(SKILLS_DIR, ".build", skill, "SKILL.md"), "utf-8");
      expect(rendered, `${skill} should interpolate taskId`).toContain("DOC-100");
    }
  });

  it("preserves {% raw %} escaped content in skills as literal text", async () => {
    const ctx = standardContext("ralph-docs");
    // Skills known to use {% raw %} for literal Liquid syntax
    const rawSkills = ["ralph-documentation-syntax", "ralph-callout-selection", "ralph-build-errors"];
    const availableSkills = (await collectAllSkillNames()).filter((s) => rawSkills.includes(s));
    if (availableSkills.length === 0) return;

    await resolveSkillIncludes(SKILLS_DIR, availableSkills, INCLUDES_DIR, ctx);

    for (const skill of availableSkills) {
      const rendered = await readFile(join(SKILLS_DIR, ".build", skill, "SKILL.md"), "utf-8");
      // {% raw %} tags should be consumed by Liquid, their content output as-is
      expect(rendered, `${skill} should not contain raw tags in output`).not.toContain("{% raw %}");
      expect(rendered, `${skill} should not contain endraw tags in output`).not.toContain("{% endraw %}");
      // The content inside {% raw %} should appear as literal text (e.g. Jekyll tags)
      expect(rendered.length).toBeGreaterThan(50);
    }
  });

  it("renders skills with revision context", async () => {
    const revSkills = ["ralph-workflow"];
    const availableSkills = (await collectAllSkillNames()).filter((s) => revSkills.includes(s));
    if (availableSkills.length === 0) return;

    const ctx = revisionContext("ralph-docs");
    await resolveSkillIncludes(SKILLS_DIR, availableSkills, INCLUDES_DIR, ctx);

    for (const skill of availableSkills) {
      const rendered = await readFile(join(SKILLS_DIR, ".build", skill, "SKILL.md"), "utf-8");
      expect(rendered.length, `${skill} should produce non-empty output`).toBeGreaterThan(0);
      // Revision context should render revision references and blank standard ones
      const revSetup = await readFile(join(SKILLS_DIR, ".build", skill, "references", "r1-setup.md"), "utf-8");
      expect(revSetup.length, "r1-setup.md should have content in revision context").toBeGreaterThan(10);
      const stdSetup = await readFile(join(SKILLS_DIR, ".build", skill, "references", "1-setup.md"), "utf-8");
      expect(stdSetup, "1-setup.md should have no workflow content in revision context").not.toContain("# Phase 1");
    }
  });
});

// ── Shared include tests ────────────────────────────────────────────────────

describe("shared agent includes (real files)", () => {
  /** Render a single include as if it were an agent template. */
  async function renderInclude(includeName: string, ctx: TemplateContext): Promise<string> {
    const { Liquid } = await import("liquidjs");
    const { registerCustomTags } = await import("../../src/container/setup/liquid-tags.js");
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
