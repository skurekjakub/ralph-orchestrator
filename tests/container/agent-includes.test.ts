import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentTemplateRenderer,
  agentBuildDir,
  buildTemplateContext,
  buildTriggerParams,
  renderAgents,
  resolveMcpToolNames,
  stageRenderTarget,
  type RenderAgentsInput,
} from "../../src/container/setup/agent-includes";
import { registerCustomTags } from "../../src/container/setup/liquid-tags";
import { Liquid } from "liquidjs";
import { createMockLogger } from "../helpers/mocks";
import {
  makeAgentTemplate,
  makeProfile,
  makeStage,
  makeWorkItem,
  makeTemplateContext,
  makeTaskContext,
} from "../helpers/factories";
import { AgentDefinitionError } from "../../src/cli/agent-definition";
import { CLAUDE_TOOL_NAMES, COPILOT_TOOL_NAMES } from "../../src/cli/cli-tools";
import { CliType, StageMode } from "../../src/config/types";

let tmpDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(join(tmpdir(), "agent-includes-test-"));
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tmpDir, { recursive: true, force: true });
});

/** Writes agent templates and partials under `tmpDir` and returns renderAgents input for `rootAgentFileId`. */
async function setupAgents(
  templates: Record<string, string>,
  options: { partials?: Record<string, string>; cli?: CliType; root?: string } = {},
): Promise<RenderAgentsInput> {
  const agentsDir = join(tmpDir, "agents");
  const includesDir = join(tmpDir, "includes");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(includesDir, { recursive: true });
  for (const [fileId, text] of Object.entries(templates)) await writeFile(join(agentsDir, `${fileId}.agent.md`), text);
  for (const [name, text] of Object.entries(options.partials ?? {}))
    await writeFile(join(includesDir, `${name}.md`), text);
  const cli = options.cli ?? CliType.Copilot;
  return {
    agentsDir,
    includesDir,
    context: makeTemplateContext({ cli, taskId: "DOC-7" }),
    target: { cli, rootAgentFileId: options.root ?? "ralph.root", outDir: join(tmpDir, "out") },
    mcpTools: {},
  };
}

describe("renderAgents", () => {
  it("renders the root agent's body with partials and context in the Copilot format", async () => {
    // Arrange
    const input = await setupAgents(
      {
        "ralph.root": makeAgentTemplate("root", { model: "opus", body: "{% render 'greeting' %} for {{ taskId }}\n" }),
      },
      { partials: { greeting: "Hello" } },
    );

    // Act
    const written = await renderAgents(input);

    // Assert
    expect(written).toEqual(["ralph.root.agent.md"]);
    const output = await readFile(join(input.target.outDir, "ralph.root.agent.md"), "utf-8");
    expect(output).toBe(
      "---\ndescription: 'The root agent'\nmodel: claude-opus-4.6\nname: 'root'\nuser-invocable: false\n---\nHello for DOC-7\n",
    );
  });

  it("renders only the agents reachable from the root, root first", async () => {
    // Arrange
    const input = await setupAgents({
      "ralph.root": makeAgentTemplate("root", { subagents: ["mid"] }),
      "ralph.mid": makeAgentTemplate("mid", { subagents: ["leaf"] }),
      "ralph.leaf": makeAgentTemplate("leaf"),
      "ralph.other": makeAgentTemplate("other"),
    });

    // Act
    const written = await renderAgents(input);

    // Assert
    expect(written).toEqual(["ralph.root.agent.md", "ralph.mid.agent.md", "ralph.leaf.agent.md"]);
    expect((await readdir(input.target.outDir)).sort()).toEqual([
      "ralph.leaf.agent.md",
      "ralph.mid.agent.md",
      "ralph.root.agent.md",
    ]);
  });

  it("gives each agent and the partials it renders its own self", async () => {
    // Arrange
    const body = "{% render 'contract' %}\n";
    const input = await setupAgents(
      {
        "ralph.root": makeAgentTemplate("root", { subagents: ["reviewer-a", "reviewer-b"], body }),
        "ralph.reviewer-a": makeAgentTemplate("reviewer-a", { body }),
        "ralph.reviewer-b": makeAgentTemplate("reviewer-b", { body }),
      },
      { partials: { contract: "dir={{ self.name }} file={{ self.fileId }} root={{ self.isStageRoot }}" } },
    );

    // Act
    await renderAgents(input);

    // Assert
    const read = (file: string) => readFile(join(input.target.outDir, file), "utf-8");
    expect(await read("ralph.root.agent.md")).toContain("dir=root file=ralph.root root=true");
    expect(await read("ralph.reviewer-a.agent.md")).toContain("dir=reviewer-a file=ralph.reviewer-a root=false");
    expect(await read("ralph.reviewer-b.agent.md")).toContain("dir=reviewer-b file=ralph.reviewer-b root=false");
  });

  it("names a Claude Code agent file after its frontmatter name and grants the root every reachable agent", async () => {
    // Arrange
    const input = await setupAgents(
      {
        "ralph.root": makeAgentTemplate("root", { subagents: ["mid"], body: "Use {{ cliTools.subagent }}.\n" }),
        "ralph.mid": makeAgentTemplate("mid", { subagents: ["leaf"] }),
        "ralph.leaf": makeAgentTemplate("leaf"),
      },
      { cli: CliType.Claude },
    );

    // Act
    const written = await renderAgents({ ...input, mcpTools: { ado: ["ado_push_progress"] } });

    // Assert
    expect(written).toEqual(["root.md", "mid.md", "leaf.md"]);
    const root = await readFile(join(input.target.outDir, "root.md"), "utf-8");
    expect(root).toContain("tools: Agent(mid, leaf), Read,");
    expect(root).toContain("mcp__ado__ado_push_progress");
    expect(root).toContain("Use Agent.");
  });

  it("removes agents an earlier render wrote that the new root cannot reach, keeping the directory", async () => {
    // Arrange
    const input = await setupAgents({
      "ralph.root": makeAgentTemplate("root", { subagents: ["helper"] }),
      "ralph.helper": makeAgentTemplate("helper"),
      "ralph.scientist": makeAgentTemplate("scientist"),
    });
    await renderAgents(input);
    const inodeBefore = (await stat(input.target.outDir)).ino;

    // Act
    await renderAgents({ ...input, target: { ...input.target, rootAgentFileId: "ralph.scientist" } });

    // Assert
    expect(await readdir(input.target.outDir)).toEqual(["ralph.scientist.agent.md"]);
    expect((await stat(input.target.outDir)).ino).toBe(inodeBefore);
  });

  it("throws when a reachable agent does not run on the target CLI", async () => {
    // Arrange
    const input = await setupAgents(
      {
        "ralph.root": makeAgentTemplate("root", { subagents: ["copilot-only"] }),
        "ralph.copilot-only": makeAgentTemplate("copilot-only", { runtimes: ["copilot"] }),
      },
      { cli: CliType.Claude },
    );

    // Act & Assert
    await expect(renderAgents(input)).rejects.toThrow(/ralph\.copilot-only is reachable from ralph\.root/);
  });

  it("throws when the root agent does not exist", async () => {
    // Arrange
    const input = await setupAgents({ "ralph.other": makeAgentTemplate("other") });

    // Act & Assert
    await expect(renderAgents(input)).rejects.toThrow(/No agent template ralph\.root/);
  });

  it("throws an AgentDefinitionError for a template with legacy Copilot frontmatter", async () => {
    // Arrange
    const input = await setupAgents({
      "ralph.root": "---\nname: 'root'\ndescription: 'Root'\nagents: ['x']\nuser-invocable: false\n---\nBody\n",
    });

    // Act & Assert
    await expect(renderAgents(input)).rejects.toBeInstanceOf(AgentDefinitionError);
  });

  it("throws on a missing partial", async () => {
    // Arrange
    const input = await setupAgents({
      "ralph.root": makeAgentTemplate("root", { body: "{% render 'nonexistent' %}" }),
    });

    // Act & Assert
    await expect(renderAgents(input)).rejects.toThrow();
  });

  it("logs each rendered file", async () => {
    // Arrange
    const input = await setupAgents({ "ralph.root": makeAgentTemplate("root") });
    const logger = createMockLogger();

    // Act
    await renderAgents({ ...input, logger });

    // Assert
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("ralph.root.agent.md"));
  });
});

describe("resolveMcpToolNames", () => {
  it("returns each server's allowlist, and an empty list for a server that allows every tool", async () => {
    // Arrange
    const serversDir = join(tmpDir, "servers");
    for (const [name, tools] of [
      ["ado", ["ado_push_progress"]],
      ["open", undefined],
    ] as const) {
      await mkdir(join(serversDir, name), { recursive: true });
      await writeFile(
        join(serversDir, name, "mcp-server.json"),
        JSON.stringify({
          name,
          type: "custom",
          command: "node",
          args: [],
          sidecarPort: name === "ado" ? 9001 : 9002,
          tools,
        }),
      );
    }

    // Act
    const tools = resolveMcpToolNames(serversDir, ["ado", "open"]);

    // Assert
    expect(tools).toEqual({ ado: ["ado_push_progress"], open: [] });
  });

  it("throws when a server has no manifest", () => {
    // Act & Assert
    expect(() => resolveMcpToolNames(join(tmpDir, "servers"), ["missing"])).toThrow(/manifest not found/);
  });
});

describe("stageRenderTarget", () => {
  it("targets the stage's CLI and root agent in the profile's build directory for that CLI", () => {
    // Arrange
    const stage = makeStage({ agent: "ralph.scientist", cli: CliType.Claude, mode: StageMode.Local });

    // Act
    const target = stageRenderTarget("ralph-docs", stage);

    // Assert
    expect(target).toEqual({
      cli: CliType.Claude,
      rootAgentFileId: "ralph.scientist",
      outDir: join(process.cwd(), "profiles", "ralph-docs", ".build", "claude", "agents"),
    });
    expect(agentBuildDir("ralph-docs", CliType.Copilot)).toBe(
      join(process.cwd(), "profiles", "ralph-docs", ".build", "copilot", "agents"),
    );
  });
});

describe("AgentTemplateRenderer", () => {
  /** Lays out profiles/<id>/agents and shared/ under the temp cwd. */
  async function setupProfile(profileId: string, templates: Record<string, string>): Promise<void> {
    const agentDir = join(tmpDir, "profiles", profileId, "agents");
    await mkdir(join(tmpDir, "shared", "agent-includes"), { recursive: true });
    await mkdir(agentDir, { recursive: true });
    for (const [fileId, text] of Object.entries(templates)) await writeFile(join(agentDir, `${fileId}.agent.md`), text);
  }

  it("renders the profile's agents with context variables into the target directory", async () => {
    // Arrange
    await setupProfile("my-profile", {
      "ralph.root": makeAgentTemplate("root", {
        body: "Repo: {{ repo }}, Revision: {{ isRevision }}, Key: {{ taskId }}",
      }),
    });
    const target = stageRenderTarget("my-profile", makeStage({ agent: "ralph.root" }));
    const context = makeTemplateContext({
      profileId: "my-profile",
      repo: "/my/repo",
      isRevision: true,
      taskId: "DF-123",
    });

    // Act
    await new AgentTemplateRenderer().render("my-profile", context, target);

    // Assert
    const output = await readFile(join(target.outDir, "ralph.root.agent.md"), "utf-8");
    expect(output).toContain("---\nRepo: /my/repo, Revision: true, Key: DF-123");
  });

  it("grants Claude Code agents the allowlisted tools of the variant's MCP servers", async () => {
    // Arrange
    await setupProfile("mcp-profile", { "ralph.root": makeAgentTemplate("root") });
    await mkdir(join(tmpDir, "shared", "mcp-servers", "jira"), { recursive: true });
    await writeFile(
      join(tmpDir, "shared", "mcp-servers", "jira", "mcp-server.json"),
      JSON.stringify({ name: "jira", command: "node", args: [], sidecarPort: 9100, tools: ["jira_add_comment"] }),
    );
    const target = stageRenderTarget("mcp-profile", makeStage({ agent: "ralph.root", cli: CliType.Claude }));

    // Act
    await new AgentTemplateRenderer().render(
      "mcp-profile",
      makeTemplateContext({ cli: CliType.Claude, mcpServers: ["jira"] }),
      target,
    );

    // Assert
    expect(await readFile(join(target.outDir, "root.md"), "utf-8")).toContain("mcp__jira__jira_add_comment");
  });

  it("warns and skips when the includes directory is missing", async () => {
    // Arrange
    const logger = createMockLogger();

    // Act
    await new AgentTemplateRenderer().render(
      "nonexistent",
      makeTemplateContext(),
      stageRenderTarget("nonexistent", makeStage()),
      logger,
    );

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("warns when the agents directory is missing", async () => {
    // Arrange
    await mkdir(join(tmpDir, "shared", "agent-includes"), { recursive: true });
    await mkdir(join(tmpDir, "profiles", "empty-profile"), { recursive: true });
    const logger = createMockLogger();

    // Act
    await new AgentTemplateRenderer().render(
      "empty-profile",
      makeTemplateContext(),
      stageRenderTarget("empty-profile", makeStage()),
      logger,
    );

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No agents directory"));
  });

  it("logs which profile, root and CLI it renders", async () => {
    // Arrange
    await setupProfile("test-profile", { "ralph.root": makeAgentTemplate("root") });
    const logger = createMockLogger();

    // Act
    await new AgentTemplateRenderer().render(
      "test-profile",
      makeTemplateContext(),
      stageRenderTarget("test-profile", makeStage({ agent: "ralph.root" })),
      logger,
    );

    // Assert
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("test-profile"));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("ralph.root"));
  });
});

describe("buildTemplateContext", () => {
  it("builds context from profile and issue", () => {
    const profile = makeProfile({
      id: "ralph-docs",
      repoPath: "/home/user/repos/docs",
      agentName: "ralph.ralph",
      displayName: "ralph",
      model: "claude-opus-4.6",
      mcpServers: ["playwright", "jira-kentico"],
    });
    const issue = makeWorkItem("DOC-500", {
      title: "Add widget documentation",
      status: "To Do",
      type: "Task",
      priority: "High",
      labels: ["docs", "widget"],
      components: ["Frontend", "API"],
    });

    const ctx = buildTemplateContext(makeTaskContext({ profile, workItem: issue, isRevision: false }));

    expect(ctx.profileId).toBe("ralph-docs");
    expect(ctx.repo).toBe("/home/user/repos/docs");
    expect(ctx.cli).toBe("copilot");
    expect(ctx.model).toBe("claude-opus-4.6");
    expect(ctx.agentName).toBe("ralph.ralph");
    expect(ctx.displayName).toBe("ralph");
    expect(ctx.mcpServers).toEqual(["playwright", "jira-kentico"]);
    expect(ctx.taskId).toBe("DOC-500");
    expect(ctx.taskTitle).toBe("Add widget documentation");
    expect(ctx.taskStatus).toBe("To Do");
    expect(ctx.taskType).toBe("Task");
    expect(ctx.taskPriority).toBe("High");
    expect(ctx.taskLabels).toEqual(["docs", "widget"]);
    expect(ctx.taskComponents).toEqual(["Frontend", "API"]);
    expect(ctx.taskProject).toBe("DOC");
    expect(ctx.taskDescription).toBe("");
    expect(ctx.taskCreated).toBe("2026-01-01T00:00:00.000+0000");
    expect(ctx.taskUpdated).toBe("");
    expect(ctx.commentTrigger).toBe("@ralph");
    expect(ctx.isRevision).toBe(false);
  });

  it("defaults optional fields to empty strings/arrays", () => {
    const ctx = buildTemplateContext(makeTaskContext({ isRevision: true }));

    expect(ctx.model).toBe("");
    expect(ctx.taskType).toBe("");
    expect(ctx.taskPriority).toBe("");
    expect(ctx.taskLabels).toEqual([]);
    expect(ctx.taskComponents).toEqual([]);
    expect(ctx.taskUpdated).toBe("");
    expect(ctx.isRevision).toBe(true);
  });

  it("uses description from work item", () => {
    const issue = makeWorkItem("DOC-200", {
      description: "Hello world",
    });
    const ctx = buildTemplateContext(makeTaskContext({ workItem: issue }));
    expect(ctx.taskDescription).toBe("Hello world");
  });

  it("uses plain string description", () => {
    const issue = makeWorkItem("DOC-201", {
      description: "Plain text desc",
    });
    const ctx = buildTemplateContext(makeTaskContext({ workItem: issue }));
    expect(ctx.taskDescription).toBe("Plain text desc");
  });

  it("populates taskCreated and taskUpdated", () => {
    const issue = makeWorkItem("DOC-202", {
      updated: "2026-02-15T12:00:00.000+0000",
    });
    const ctx = buildTemplateContext(makeTaskContext({ workItem: issue }));
    expect(ctx.taskCreated).toBe("2026-01-01T00:00:00.000+0000");
    expect(ctx.taskUpdated).toBe("2026-02-15T12:00:00.000+0000");
  });

  it("populates commentTrigger from profile match", () => {
    const profile = makeProfile({ match: { commentTrigger: "@ralph write" } });
    const ctx = buildTemplateContext(makeTaskContext({ profile, workItem: makeWorkItem("DF-50") }));
    expect(ctx.commentTrigger).toBe("@ralph write");
  });

  it("derives taskProject from key prefix", () => {
    const ctx = buildTemplateContext(makeTaskContext({ workItem: makeWorkItem("DOC-3143") }));
    expect(ctx.taskProject).toBe("DOC");
  });

  it("builds triggerParams from bare params when provided", () => {
    const ctx = buildTemplateContext(makeTaskContext({ triggerParams: { codesamples: "true", verbose: "true" } }));
    expect(ctx.triggerParams).toEqual({ codesamples: "true", verbose: "true" });
  });

  it("defaults triggerParams to empty object", () => {
    const ctx = buildTemplateContext(makeTaskContext());
    expect(ctx.triggerParams).toEqual({});
  });

  it("builds triggerParams from key=value params", () => {
    const ctx = buildTemplateContext(
      makeTaskContext({ triggerParams: { codesamples: "true", branch_name: "feature-xyz" } }),
    );
    expect(ctx.triggerParams).toEqual({ codesamples: "true", branch_name: "feature-xyz" });
  });

  it("passes through a pre-built Record<string,string> without re-parsing", () => {
    const preBuilt = { flag: "true", ref: "refs/heads/main" };
    const ctx = buildTemplateContext(makeTaskContext({ triggerParams: preBuilt }));
    expect(ctx.triggerParams).toEqual({ flag: "true", ref: "refs/heads/main" });
  });

  it("defaults stage fields from first stage when no overrides", () => {
    const profile = makeProfile({
      stages: [
        makeStage({ agent: "ralph.writer", role: "writer" }),
        makeStage({ agent: "ralph.reviewer", role: "reviewer" }),
      ],
    });
    const ctx = buildTemplateContext(makeTaskContext({ profile }));
    expect(ctx.stageRole).toBe("writer");
    expect(ctx.stageIndex).toBe(0);
    expect(ctx.stageCount).toBe(2);
    expect(ctx.isFirstStage).toBe(true);
    expect(ctx.isLastStage).toBe(false);
    expect(ctx.previousStageRoles).toEqual([]);
  });

  it("applies stageOverrides when provided", () => {
    // Arrange
    const reviewer = makeStage({ agent: "ralph.reviewer", role: "reviewer", skills: ["review-skill"] });
    const profile = makeProfile({
      stages: [makeStage({ agent: "ralph.writer", role: "writer", skills: ["write-skill"] }), reviewer],
    });

    // Act
    const ctx = buildTemplateContext(makeTaskContext({ profile }), {
      stage: reviewer,
      stageIndex: 1,
      stageCount: 3,
      previousStageRoles: ["writer"],
    });

    // Assert
    expect(ctx.stageRole).toBe("reviewer");
    expect(ctx.stageMode).toBe(StageMode.Container);
    expect(ctx.skills).toEqual(["review-skill"]);
    expect(ctx.agentName).toBe("ralph.reviewer");
    expect(ctx.displayName).toBe("reviewer");
    expect(ctx.stageIndex).toBe(1);
    expect(ctx.stageCount).toBe(3);
    expect(ctx.isFirstStage).toBe(false);
    expect(ctx.isLastStage).toBe(false);
    expect(ctx.previousStageRoles).toEqual(["writer"]);
  });

  it("computes isLastStage correctly from stageOverrides", () => {
    // Act
    const ctx = buildTemplateContext(makeTaskContext(), {
      stage: makeStage({ role: "editor" }),
      stageIndex: 2,
      stageCount: 3,
      previousStageRoles: ["writer", "reviewer"],
    });

    // Assert
    expect(ctx.isLastStage).toBe(true);
    expect(ctx.isFirstStage).toBe(false);
  });

  it("describes a post-task hook stage: its root agent, CLI, tool names, skills and model", () => {
    // Arrange
    const hookStage = makeStage({
      agent: "ralph.scientist",
      role: "scientist",
      mode: StageMode.Local,
      cli: CliType.Claude,
      model: "opus",
      skills: [],
    });
    const profile = makeProfile({ agentName: "ralph.ralph", model: "sonnet", stages: [makeStage({ skills: ["a"] })] });

    // Act
    const ctx = buildTemplateContext(makeTaskContext({ profile }), {
      stage: hookStage,
      stageIndex: 0,
      stageCount: 1,
      previousStageRoles: [],
      hook: { collectedLogs: {}, name: "run-analysis", outputDir: "/out/hooks/run-analysis" },
    });

    // Assert
    expect(ctx.agentName).toBe("ralph.scientist");
    expect(ctx.cli).toBe(CliType.Claude);
    expect(ctx.cliTools).toEqual(CLAUDE_TOOL_NAMES);
    expect(ctx.model).toBe("opus");
    expect(ctx.skills).toEqual([]);
    expect(ctx.stageMode).toBe(StageMode.Local);
  });

  it("takes the CLI and tool names from the first stage, not the profile default", () => {
    // Arrange
    const profile = makeProfile({ cli: CliType.Copilot, stages: [makeStage({ cli: CliType.Claude })] });

    // Act
    const ctx = buildTemplateContext(makeTaskContext({ profile }));

    // Assert
    expect(ctx.cli).toBe(CliType.Claude);
    expect(ctx.cliTools).toEqual(CLAUDE_TOOL_NAMES);
  });

  it("names Copilot tools for a Copilot stage", () => {
    // Act
    const ctx = buildTemplateContext(makeTaskContext());

    // Assert
    expect(ctx.cliTools).toEqual(COPILOT_TOOL_NAMES);
  });
});

describe("buildTriggerParams", () => {
  it("maps bare params to 'true'", () => {
    expect(buildTriggerParams(["codesamples", "verbose"])).toEqual({
      codesamples: "true",
      verbose: "true",
    });
  });

  it("maps key=value params to the value", () => {
    expect(buildTriggerParams(["branch_name=feature-xyz"])).toEqual({
      branch_name: "feature-xyz",
    });
  });

  it("handles mixed bare and key=value params", () => {
    expect(buildTriggerParams(["codesamples", "branch_name=my-branch"])).toEqual({
      codesamples: "true",
      branch_name: "my-branch",
    });
  });

  it("handles values containing equals signs", () => {
    expect(buildTriggerParams(["config=key=value"])).toEqual({
      config: "key=value",
    });
  });

  it("returns empty object for empty array", () => {
    expect(buildTriggerParams([])).toEqual({});
  });

  it("last value wins for duplicate keys", () => {
    expect(buildTriggerParams(["key=a", "key=b"])).toEqual({ key: "b" });
  });

  it("maps key= (empty value) to empty string", () => {
    expect(buildTriggerParams(["key="])).toEqual({ key: "" });
  });
});

describe("triggerParams in Liquid templates", () => {
  it("renders conditional block when bare param is present", async () => {
    const engine = new Liquid({ root: [tmpDir], extname: ".md" });
    const tpl = "{%- if triggerParams.codesamples %}CODE SAMPLES ACTIVE{%- endif %}";
    const result = await engine.parseAndRender(tpl, {
      triggerParams: { codesamples: "true" },
    });
    expect(result).toBe("CODE SAMPLES ACTIVE");
  });

  it("skips conditional block when bare param is absent", async () => {
    const engine = new Liquid({ root: [tmpDir], extname: ".md" });
    const tpl = "before{%- if triggerParams.codesamples %} CODE{%- endif %} after";
    const result = await engine.parseAndRender(tpl, {
      triggerParams: {},
    });
    expect(result).toBe("before after");
  });

  it("interpolates key=value param in output", async () => {
    const engine = new Liquid({ root: [tmpDir], extname: ".md" });
    const tpl = "Branch: {{ triggerParams.branch_name }}";
    const result = await engine.parseAndRender(tpl, {
      triggerParams: { branch_name: "feature/new-api" },
    });
    expect(result).toBe("Branch: feature/new-api");
  });

  it("treats empty string value as truthy in conditionals (Liquid behavior)", async () => {
    const engine = new Liquid({ root: [tmpDir], extname: ".md" });
    const tpl = "{%- if triggerParams.key %}YES{%- else %}NO{%- endif %}";
    const result = await engine.parseAndRender(tpl, {
      triggerParams: { key: "" },
    });
    expect(result).toBe("YES");
  });
});

describe("SectionTag", () => {
  function engine(): Liquid {
    const e = new Liquid();
    registerCustomTags(e);
    return e;
  }

  it("wraps content in XML boundary tags", async () => {
    const result = await engine().parseAndRender('{% section "security" %}## Rules\nBe safe.{% endsection %}');

    expect(result).toBe("<security>\n## Rules\nBe safe.\n</security>");
  });

  it("interpolates Liquid variables inside section", async () => {
    const result = await engine().parseAndRender('{% section "identity" %}Agent: {{ name }}{% endsection %}', {
      name: "Ralph",
    });

    expect(result).toBe("<identity>\nAgent: Ralph\n</identity>");
  });

  it("supports nested render tags inside section", async () => {
    const e = new Liquid({ root: [tmpDir], extname: ".md" });
    registerCustomTags(e);

    await writeFile(join(tmpDir, "partial.md"), "Included content");

    const result = await e.parseAndRender('{% section "api-reference" %}{% render "partial" %}{% endsection %}');

    expect(result).toBe("<api-reference>\nIncluded content\n</api-reference>");
  });

  it("allows multiple sections in one template", async () => {
    const result = await engine().parseAndRender(
      '{% section "a" %}First{% endsection %}\n{% section "b" %}Second{% endsection %}',
    );

    expect(result).toBe("<a>\nFirst\n</a>\n<b>\nSecond\n</b>");
  });

  it("throws on unclosed section", async () => {
    await expect(engine().parseAndRender('{% section "oops" %}No end tag here')).rejects.toThrow(
      '{% section "oops" %} not closed',
    );
  });

  it("works in the agent rendering pipeline", async () => {
    // Arrange
    const input = await setupAgents(
      {
        "ralph.root": makeAgentTemplate("root", {
          body: '{% section "security" %}{% render "rules" %}{% endsection %}',
        }),
      },
      { partials: { rules: "Rule: {{ taskId }}" } },
    );

    // Act
    await renderAgents(input);

    // Assert
    const output = await readFile(join(input.target.outDir, "ralph.root.agent.md"), "utf-8");
    expect(output).toMatch(/---\n<security>\nRule: DOC-7\n<\/security>$/);
  });
});
