import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveAgentIncludes,
  AgentTemplateRenderer,
  buildTemplateContext,
  buildTriggerParams,
} from "../../src/container/setup/agent-includes.js";
import { registerCustomTags } from "../../src/container/setup/liquid-tags.js";
import { Liquid } from "liquidjs";
import { createMockLogger } from "../helpers/mocks.js";
import { makeProfile, makeWorkItem, makeTemplateContext, makeTaskContext } from "../helpers/factories.js";
import { StageMode } from "../../src/config/types.js";

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

describe("resolveAgentIncludes", () => {
  it("renders a liquid template with includes from includesDir", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(includesDir, "greeting.md"), "Hello from the include");
    await writeFile(join(agentDir, "test.agent.md"), "# Agent\n\n{% render 'greeting' %}\n\nEnd.");

    await resolveAgentIncludes(agentDir, includesDir, {});

    const output = await readFile(join(tmpDir, ".build", "test.agent.md"), "utf-8");
    expect(output).toContain("Hello from the include");
    expect(output).toContain("# Agent");
    expect(output).toContain("End.");
    expect(output).not.toContain("{% render");
  });

  it("creates .build directory if it does not exist", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(agentDir, "simple.agent.md"), "No includes here.");

    await resolveAgentIncludes(agentDir, includesDir, {});

    const output = await readFile(join(tmpDir, ".build", "simple.agent.md"), "utf-8");
    expect(output).toBe("No includes here.");
  });

  it("processes multiple agent files", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(agentDir, "one.agent.md"), "Agent One");
    await writeFile(join(agentDir, "two.agent.md"), "Agent Two");

    await resolveAgentIncludes(agentDir, includesDir, {});

    const files = await readdir(join(tmpDir, ".build"));
    expect(files).toContain("one.agent.md");
    expect(files).toContain("two.agent.md");
  });

  it("ignores non-agent files in agent directory", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(agentDir, "readme.txt"), "Not a template");
    await writeFile(join(agentDir, "test.agent.md"), "Template");

    await resolveAgentIncludes(agentDir, includesDir, {});

    const files = await readdir(join(tmpDir, ".build"));
    expect(files).toEqual(["test.agent.md"]);
  });

  it("throws on missing include", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(agentDir, "broken.agent.md"), "{% render 'nonexistent' %}");

    await expect(resolveAgentIncludes(agentDir, includesDir, {})).rejects.toThrow();
  });

  it("logs rendered files when logger provided", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(agentDir, "test.agent.md"), "Content");
    const logger = createMockLogger();

    await resolveAgentIncludes(agentDir, includesDir, {}, logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("test.agent.md"));
  });

  it("passes profile config as Liquid context", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(agentDir, "test.agent.md"), "Repo: {{ repo }}\nCLI: {{ cli }}");

    await resolveAgentIncludes(agentDir, includesDir, { repo: "/my/repo", cli: "copilot" });

    const output = await readFile(join(tmpDir, ".build", "test.agent.md"), "utf-8");
    expect(output).toBe("Repo: /my/repo\nCLI: copilot");
  });

  it("resolves multiple includes in one template", async () => {
    const agentDir = join(tmpDir, "agents");
    const includesDir = join(tmpDir, "includes");
    await mkdir(agentDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(includesDir, "header.md"), "# Header");
    await writeFile(join(includesDir, "footer.md"), "---\nEnd of file");
    await writeFile(join(agentDir, "full.agent.md"), "{% render 'header' %}\n\nBody\n\n{% render 'footer' %}");

    await resolveAgentIncludes(agentDir, includesDir, {});

    const output = await readFile(join(tmpDir, ".build", "full.agent.md"), "utf-8");
    expect(output).toContain("# Header");
    expect(output).toContain("Body");
    expect(output).toContain("End of file");
  });
});

describe("AgentTemplateRenderer", () => {
  it("renders templates with context variables", async () => {
    const includesDir = join(tmpDir, "shared", "agent-includes");
    const profileDir = join(tmpDir, "profiles", "my-profile");
    const agentDir = join(profileDir, "agents");

    await mkdir(includesDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    await writeFile(join(agentDir, "test.agent.md"), "Repo: {{ repo }}, Revision: {{ isRevision }}, Key: {{ taskId }}");

    const renderer = new AgentTemplateRenderer();
    await renderer.render(
      "my-profile",
      makeTemplateContext({
        profileId: "my-profile",
        repo: "/my/repo",
        isRevision: true,
        taskId: "DF-123",
      }),
    );

    const output = await readFile(join(profileDir, ".build", "test.agent.md"), "utf-8");
    expect(output).toBe("Repo: /my/repo, Revision: true, Key: DF-123");
  });

  it("makes issue data available in templates", async () => {
    const includesDir = join(tmpDir, "shared", "agent-includes");
    const profileDir = join(tmpDir, "profiles", "test-profile");
    const agentDir = join(profileDir, "agents");

    await mkdir(includesDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    await writeFile(
      join(agentDir, "test.agent.md"),
      "Project: {{ taskProject }}, Status: {{ taskStatus }}, Summary: {{ taskTitle }}",
    );

    const renderer = new AgentTemplateRenderer();
    await renderer.render(
      "test-profile",
      makeTemplateContext({
        profileId: "test-profile",
        taskProject: "DOC",
        taskStatus: "To Do",
        taskTitle: "Add widget docs",
      }),
    );

    const output = await readFile(join(profileDir, ".build", "test.agent.md"), "utf-8");
    expect(output).toBe("Project: DOC, Status: To Do, Summary: Add widget docs");
  });

  it("warns and skips when includes directory is missing", async () => {
    const renderer = new AgentTemplateRenderer();
    const logger = createMockLogger();

    await renderer.render("nonexistent", makeTemplateContext(), logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("warns when agents directory is missing", async () => {
    const includesDir = join(tmpDir, "shared", "agent-includes");
    await mkdir(includesDir, { recursive: true });
    await mkdir(join(tmpDir, "profiles", "empty-profile"), { recursive: true });

    const renderer = new AgentTemplateRenderer();
    const logger = createMockLogger();

    await renderer.render("empty-profile", makeTemplateContext(), logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No agents directory"));
  });

  it("resolves shared includes alongside context", async () => {
    const includesDir = join(tmpDir, "shared", "agent-includes");
    const profileDir = join(tmpDir, "profiles", "inc-profile");
    const agentDir = join(profileDir, "agents");

    await mkdir(includesDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    await writeFile(join(includesDir, "greeting.md"), "Hello from include");
    await writeFile(join(agentDir, "test.agent.md"), "{% render 'greeting' %}\nRevision: {{ isRevision }}");

    const renderer = new AgentTemplateRenderer();
    await renderer.render("inc-profile", makeTemplateContext({ isRevision: false }));

    const output = await readFile(join(profileDir, ".build", "test.agent.md"), "utf-8");
    expect(output).toContain("Hello from include");
    expect(output).toContain("Revision: false");
  });

  it("logs progress", async () => {
    const includesDir = join(tmpDir, "shared", "agent-includes");
    const profileDir = join(tmpDir, "profiles", "test-profile");
    const agentDir = join(profileDir, "agents");

    await mkdir(includesDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    await writeFile(join(agentDir, "x.agent.md"), "Content");

    const logger = createMockLogger();
    const renderer = new AgentTemplateRenderer();
    await renderer.render("test-profile", makeTemplateContext(), logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("test-profile"));
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
        { agent: "ralph.writer", role: "writer", mode: StageMode.Container, skills: [] },
        { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] },
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
    const profile = makeProfile({
      stages: [
        { agent: "ralph.writer", role: "writer", mode: StageMode.Container, skills: [] },
        { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] },
        { agent: "ralph.editor", role: "editor", mode: StageMode.Container, skills: [] },
      ],
    });
    const ctx = buildTemplateContext(makeTaskContext({ profile }), {
      stageIndex: 1,
      stageCount: 3,
      stageRole: "reviewer",
      stageMode: "container",
      previousStageRoles: ["writer"],
    });
    expect(ctx.stageRole).toBe("reviewer");
    expect(ctx.stageIndex).toBe(1);
    expect(ctx.stageCount).toBe(3);
    expect(ctx.isFirstStage).toBe(false);
    expect(ctx.isLastStage).toBe(false);
    expect(ctx.previousStageRoles).toEqual(["writer"]);
  });

  it("computes isLastStage correctly from stageOverrides", () => {
    const ctx = buildTemplateContext(makeTaskContext(), {
      stageIndex: 2,
      stageCount: 3,
      stageRole: "editor",
      stageMode: "container",
      previousStageRoles: ["writer", "reviewer"],
    });
    expect(ctx.isLastStage).toBe(true);
    expect(ctx.isFirstStage).toBe(false);
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

  it("works in full agent template rendering pipeline", async () => {
    const includesDir = join(tmpDir, "shared", "agent-includes");
    const profileDir = join(tmpDir, "profiles", "sec-profile");
    const agentDir = join(profileDir, "agents");

    await mkdir(includesDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    await writeFile(join(includesDir, "rules.md"), "Rule: {{ taskId }}");
    await writeFile(join(agentDir, "test.agent.md"), '{% section "security" %}{% render "rules" %}{% endsection %}');

    const renderer = new AgentTemplateRenderer();
    await renderer.render("sec-profile", makeTemplateContext({ taskId: "DOC-99" }));

    const output = await readFile(join(profileDir, ".build", "test.agent.md"), "utf-8");
    expect(output).toBe("<security>\nRule: DOC-99\n</security>");
  });
});
