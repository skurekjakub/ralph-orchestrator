import { execa } from "execa";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentCatalog } from "../../../src/cli/agent-catalog";
import { writeHostSessionSettings } from "../../../src/cli/claude/claude-host-settings";
import { ClaudeCodeRuntime } from "../../../src/cli/claude/claude-runtime";
import {
  CLAUDE_HEADLESS_ENV,
  ClaudePermissionMode,
  ClaudeSessionIds,
  ClaudeSettingSources,
  claudeSessionArgs,
  claudeSessionEnv,
  claudeSessionTools,
  type ClaudeSessionOptions,
} from "../../../src/cli/claude/claude-session";
import { sessionSettingsPath, userSettingsPath, writeClaudeSettings } from "../../../src/cli/claude/claude-settings";
import {
  CLAUDE_BUILTIN_TOOLS,
  CLAUDE_HOST_TOOLS,
  ClaudeBuiltinTool,
  isClaudeSubagentTool,
} from "../../../src/cli/claude/claude-tools";
import { SessionEventKind, readClaudeSessions } from "../../../src/cli/claude/session-log";
import { AGENT_CLI_VERSIONS, CLI_PACKAGES, hostCliBinary } from "../../../src/cli/cli-versions";
import { hostCliEnv } from "../../../src/cli/host-env";
import { CLAUDE_MODEL_ID, ClaudeModelAlias } from "../../../src/cli/model-catalog";
import { ClaudeAuthMode, CliType, ReasoningEffort } from "../../../src/config/types";
import { executeCliCommand } from "../../../src/container/cli-executors/shared-exec";
import { parseResultBlock, resolveStatus } from "../../../src/container/result-parser";
import { renderAgents } from "../../../src/container/setup/agent-includes";
import type { ProfileBuildPaths } from "../../../src/container/setup/build-paths";
import { renderSkills } from "../../../src/container/setup/skill-includes";
import {
  FailureReason,
  TaskStatus,
  type ContainerExecResult,
  type HostStageWorkspace,
} from "../../../src/container/types";
import { RALPH_CONTAINER_DIR } from "../../../src/container/workspace-paths";
import { asArray, asRecord, asString, type JsonRecord } from "../../../src/util/json";
import { makeAgentSource, makeHostWorkspace, makeTemplateContext } from "../../helpers/factories";
import { createMockLogger, createSilentLogger } from "../../helpers/mocks";

/**
 * Longest one CLI process may run. An unauthenticated session exits in well under a second, before any network
 * request; the cap keeps a hung CLI below the test timeout so it fails with its own output.
 */
const CLI_TIMEOUT_MS = 4_000;

/** Leading bytes of the native executables Claude Code ships: ELF, 64-bit Mach-O and Windows PE. */
const NATIVE_EXECUTABLE_MAGIC: readonly (readonly number[])[] = [
  [0x7f, 0x45, 0x4c, 0x46],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0x4d, 0x5a],
];

/** Whether the file at `path` starts like a native executable rather than npm's shell-script placeholder. */
function isNativeExecutable(path: string): boolean {
  const head = Buffer.alloc(4);
  const fd = openSync(path, "r");
  try {
    readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  return NATIVE_EXECUTABLE_MAGIC.some((magic) => magic.every((byte, i) => head[i] === byte));
}

/**
 * The `node_modules/.bin/claude` that host stages run, in the checkout whose `node_modules` Node resolves the
 * pinned package from: this checkout, or the checkout a git worktree without its own `node_modules` sits in.
 *
 * @returns The binary, or why the suite cannot run it.
 */
function locateClaudeBinary(): { readonly binary: string } | { readonly unavailable: string } {
  const { name } = CLI_PACKAGES[CliType.Claude];
  let manifest: string;
  try {
    manifest = createRequire(import.meta.url).resolve(`${name}/package.json`);
  } catch {
    return { unavailable: `${name} is not installed; run npm ci` };
  }
  const checkout = join(dirname(manifest), "..", "..", "..");
  const binary = hostCliBinary(checkout, CliType.Claude);
  if (!existsSync(binary)) return { unavailable: `${binary} is missing; run npm ci` };
  if (!isNativeExecutable(binary)) {
    return {
      unavailable:
        `${binary} is npm's placeholder, not the native binary: the package's postinstall did not run ` +
        `(package.json allowScripts must allow ${name})`,
    };
  }
  return { binary };
}

const CLAUDE = locateClaudeBinary();
const SKIP_REASON = "unavailable" in CLAUDE ? CLAUDE.unavailable : undefined;

/** Claude Code refuses `bypassPermissions` to root; Ralph's agent container runs it as the non-root `vscode` user. */
const RUNS_AS_ROOT = process.getuid?.() === 0;

/** Hook events an unauthenticated session reaches: it starts, takes the prompt, fails its first model request and ends. */
const UNAUTHENTICATED_HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "StopFailure", "SessionEnd"] as const;

const PROMPT = "Reply with the word ready.";
const ROOT_AGENT = "ralph.contract-root";
const NARROW_ROOT_AGENT = "ralph.contract-narrow";

/**
 * Test-owned agents: a stage root with a two-level subagent chain and a startup skill, and a second root that
 * narrows its own tools and model.
 */
const FIXTURE_AGENTS = new AgentCatalog([
  makeAgentSource(
    ROOT_AGENT,
    { name: "contract-root", subagents: ["contract-reviewer"], skills: ["contract-guide"] },
    "Work on {{ taskId }} as {{ self.name }}.\n",
  ),
  makeAgentSource("ralph.contract-reviewer", {
    name: "contract-reviewer",
    model: "inherit",
    subagents: ["contract-checker"],
    skills: ["contract-guide"],
    effort: ReasoningEffort.High,
    maxTurns: 5,
  }),
  makeAgentSource("ralph.contract-checker", {
    name: "contract-checker",
    model: ClaudeModelAlias.Haiku,
    tools: [ClaudeBuiltinTool.Read],
  }),
  makeAgentSource(NARROW_ROOT_AGENT, {
    name: "contract-narrow",
    model: ClaudeModelAlias.Haiku,
    tools: [ClaudeBuiltinTool.Read, ClaudeBuiltinTool.Skill],
    skills: ["contract-notes"],
  }),
]);

/** Allowlisted tools of the variant's MCP servers, as the agent writer receives them; an empty list allows all. */
const FIXTURE_MCP_TOOLS: Readonly<Record<string, readonly string[]>> = {
  "contract-mcp": ["lookup"],
  "contract-open": [],
};

/** Test-owned skill sources, keyed by their path under the skills source directory. */
const FIXTURE_SKILLS: Readonly<Record<string, string>> = {
  "guides/contract-guide":
    "---\nname: contract-guide\ndescription: How to work the contract fixture\n---\nGuide for {{ taskId }}.\n",
  "notes/contract-notes": "---\nname: contract-notes\ndescription: Notes for the contract fixture\n---\nNotes.\n",
};
const SKILL_NAMES = Object.keys(FIXTURE_SKILLS).map((path) => path.split("/")[1]);

/** Frontmatter names of every fixture agent. */
const FIXTURE_AGENT_NAMES = FIXTURE_AGENTS.fileIds.map((fileId) => FIXTURE_AGENTS.get(fileId).frontmatter.name);

/** How one stage's session is started, as the stage's executor builds it. */
interface SessionOptions {
  /** File id of the stage root. */
  readonly root?: string;
  /** Overrides the `--agent` name the root's frontmatter gives. */
  readonly agentName?: string;
  readonly model?: string;
  readonly effort?: ReasoningEffort;
  /** `--session-id` or `--resume` arguments; a fresh session when omitted. */
  readonly sessionArgs?: readonly string[];
  /** Rewrites the settings file Ralph wrote before the session reads it. */
  readonly editSettings?: (settings: JsonRecord) => JsonRecord;
  /** Arguments after the ones the executor passes. */
  readonly extraArgs?: readonly string[];
}

/** A result schema of the shape a stage that requires a result block would pass with `--json-schema`. */
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: [TaskStatus.Completed, TaskStatus.Partial, TaskStatus.Blocked] },
    prUrl: { type: "string" },
  },
  required: ["status"],
  additionalProperties: false,
};

/** One CLI run: the executor's result plus the stream-json events it printed. */
interface SessionRun {
  readonly result: ContainerExecResult;
  readonly events: readonly JsonRecord[];
}

/** The `system/init` event of `run`. @throws Error with the CLI's stderr when the session never started. */
function initOf(run: SessionRun): JsonRecord {
  const init = run.events.find((event) => event.type === "system" && event.subtype === "init");
  if (init === undefined) {
    throw new Error(`no system/init event (exit ${run.result.exitCode}): ${run.result.stderr}`);
  }
  return init;
}

/** The strings of a JSON array. */
function stringsOf(value: unknown): string[] {
  return asArray(value)
    .map(asString)
    .filter((item): item is string => item !== undefined);
}

/**
 * A private Claude Code home, working directory and hook recorder per test, laid out like a host stage's
 * workspace. Agents and skills are rendered into the home with Ralph's own renderers and Claude Code writer.
 */
class ContractSandbox {
  readonly root = mkdtempSync(join(tmpdir(), "ralph-claude-contract-"));
  readonly workspace: HostStageWorkspace;
  /** Stands in for `shared/hooks`: the fixture hook config and the recorder script. */
  readonly hooksDir = join(this.root, "hooks");
  /** Where the recorder writes one file per hook payload. */
  readonly payloadDir = join(this.root, "hook-payloads");
  readonly logger = createMockLogger();
  private readonly runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });
  /** `HOME` of every CLI process, so nothing of the developer's own home is read. */
  private readonly home = join(this.root, "user-home");

  constructor() {
    const orchestratorDir = join(this.root, "orchestrator");
    const home = join(this.root, "claude-home");
    this.workspace = makeHostWorkspace({
      stageDir: this.root,
      cwd: join(this.root, "work"),
      artifactDir: join(this.root, "artifacts"),
      agentsOutDir: join(home, "agents"),
      skillsOutDir: join(home, "skills"),
      cliHomeDir: home,
      logDir: join(this.root, "logs"),
      orchestratorDir,
      additionalDirs: [orchestratorDir],
    });
    const { cwd, artifactDir, logDir } = this.workspace;
    for (const dir of [cwd, artifactDir, logDir, orchestratorDir, this.home, this.hooksDir, this.payloadDir]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(this.hooksDir, "record.sh"), `#!/bin/sh\ncat > '${this.payloadDir}'/"$$".json\n`, {
      mode: 0o755,
    });
  }

  /** Renders the fixture agents of both stage roots and the fixture skills into the Claude Code home. */
  async renderFixtures(): Promise<void> {
    const includesDir = join(this.root, "includes");
    const skillSources = join(this.root, "skill-sources");
    mkdirSync(includesDir, { recursive: true });
    for (const [path, content] of Object.entries(FIXTURE_SKILLS)) {
      mkdirSync(join(skillSources, path), { recursive: true });
      writeFileSync(join(skillSources, path, "SKILL.md"), content);
    }
    const context = makeTemplateContext({ cli: CliType.Claude, taskId: "CONTRACT-1", skills: SKILL_NAMES });
    for (const rootAgentFileId of [ROOT_AGENT, NARROW_ROOT_AGENT]) {
      await renderAgents({
        catalog: FIXTURE_AGENTS,
        includesDir,
        context,
        target: { cli: CliType.Claude, rootAgentFileId, outDir: this.workspace.agentsOutDir, prune: false },
        writer: this.runtime.agentWriter,
        mcpTools: FIXTURE_MCP_TOOLS,
      });
    }
    await renderSkills({
      skillsDir: skillSources,
      skillNames: SKILL_NAMES,
      includesDir,
      context,
      outDir: this.workspace.skillsOutDir,
      prune: false,
    });
  }

  /**
   * Runs a session the way `LocalClaudeCodeExecutor` does: `dontAsk`, the host tool cap, the stage's directories
   * and Ralph's host settings, whose hooks are the recorder.
   */
  runHostSession(options: SessionOptions = {}): Promise<SessionRun> {
    this.writeHooks(`${RALPH_CONTAINER_DIR}/hooks/record.sh --cli claude`);
    const root = options.root ?? ROOT_AGENT;
    const settingsPath = writeHostSessionSettings(this.workspace, this.hooksDir, this.subagentsOf(root));
    if (options.editSettings) {
      const settings = asRecord(JSON.parse(readFileSync(settingsPath, "utf-8"))) ?? {};
      writeFileSync(settingsPath, JSON.stringify(options.editSettings(settings)));
    }
    return this.runSession(options, {
      settingSources: ClaudeSettingSources.User,
      settingsPath,
      permissionMode: ClaudePermissionMode.DontAsk,
      tools: claudeSessionTools(CLAUDE_HOST_TOOLS, FIXTURE_AGENTS.depthFrom(root)),
      additionalDirs: this.workspace.additionalDirs,
      debugFile: join(this.workspace.logDir, "claude.log"),
    });
  }

  /**
   * Runs a session the way `ClaudeCodeExecutor` does inside the agent container: `bypassPermissions`, every
   * built-in tool Ralph grants, an MCP config and Ralph's session and user settings, whose hooks are the recorder.
   */
  runContainerSession(options: SessionOptions = {}): Promise<SessionRun> {
    this.writeHooks(`'${join(this.hooksDir, "record.sh")}' --cli claude`);
    const paths: ProfileBuildPaths = {
      profileDir: join(this.root, "profile"),
      agentsDir: join(this.root, "profile", "agents"),
      buildDir: join(this.root, "build"),
      skillsBuildDir: join(this.root, "build", "skills"),
      hooksDir: this.hooksDir,
    };
    writeClaudeSettings(paths, createSilentLogger());
    copyFileSync(userSettingsPath(paths), join(this.workspace.cliHomeDir, "settings.json"));
    const mcpConfigPath = join(this.root, "mcp-config.json");
    writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }));
    return this.runSession(options, {
      settingSources: ClaudeSettingSources.User,
      settingsPath: sessionSettingsPath(paths),
      mcpConfigPath,
      permissionMode: ClaudePermissionMode.BypassPermissions,
      tools: claudeSessionTools(CLAUDE_BUILTIN_TOOLS, FIXTURE_AGENTS.depthFrom(options.root ?? ROOT_AGENT)),
      debugFile: join(this.workspace.logDir, "claude.log"),
    });
  }

  /** Each recorded hook payload, keyed by its `hook_event_name`. */
  hookPayloads(): Map<string, JsonRecord> {
    const payloads = readdirSync(this.payloadDir).map(
      (file) => asRecord(JSON.parse(readFileSync(join(this.payloadDir, file), "utf-8"))) ?? {},
    );
    return new Map(payloads.map((payload) => [asString(payload.hook_event_name) ?? "", payload]));
  }

  /**
   * Environment of every CLI process: `PATH`, the private `HOME`, `LANG`, the Claude Code home and the variables
   * Ralph gives each headless session. It holds no credential.
   */
  cliEnv(subagentDepth: number): Record<string, string> {
    return hostCliEnv({ PATH: process.env.PATH, HOME: this.home, LANG: "C.UTF-8" }, [], {
      CLAUDE_CONFIG_DIR: this.workspace.cliHomeDir,
      ...CLAUDE_HEADLESS_ENV,
      CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
      ...claudeSessionEnv(true, subagentDepth),
    });
  }

  cleanup(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  /** Writes `<hooksDir>/claude/hooks.json`: one `command` hook per event the run reaches. */
  private writeHooks(command: string): void {
    const hooks = Object.fromEntries(
      UNAUTHENTICATED_HOOK_EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command, timeout: 5 }] }]]),
    );
    mkdirSync(join(this.hooksDir, "claude"), { recursive: true });
    writeFileSync(join(this.hooksDir, "claude", "hooks.json"), JSON.stringify(hooks));
  }

  /** Frontmatter names of every agent `root` can reach, root excluded. */
  private subagentsOf(root: string): string[] {
    return FIXTURE_AGENTS.reachableFrom(root)
      .slice(1)
      .map((fileId) => FIXTURE_AGENTS.get(fileId).frontmatter.name);
  }

  /** Runs the CLI with {@link cliEnv} through the executors' shared plumbing and the runtime's decoder. */
  private async runSession(
    options: SessionOptions,
    session: Omit<ClaudeSessionOptions, "agentName" | "model" | "effort">,
  ): Promise<SessionRun> {
    const root = options.root ?? ROOT_AGENT;
    const agentName = options.agentName ?? FIXTURE_AGENTS.get(root).frontmatter.name;
    const args = [
      ...claudeSessionArgs(
        { ...session, agentName, model: options.model, effort: options.effort },
        options.sessionArgs ?? new ClaudeSessionIds().start(),
      ),
      ...(options.extraArgs ?? []),
    ];
    const result = await executeCliCommand({
      spawn: () =>
        execa(binaryPath(), args, {
          cwd: this.workspace.cwd,
          env: this.cliEnv(FIXTURE_AGENTS.depthFrom(root)),
          extendEnv: false,
          input: PROMPT,
          timeout: CLI_TIMEOUT_MS,
        }),
      logger: this.logger,
      tag: "claude",
      tracker: { activeProcess: null },
      decoder: this.runtime.createOutputDecoder(),
    });
    if (result.timedOut) throw new Error(`claude ran past ${CLI_TIMEOUT_MS} ms: ${result.stderr}`);
    const events = result.stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => asRecord(JSON.parse(line)) ?? {});
    return { result, events };
  }
}

/** The binary the suite runs. @throws Error when the suite runs without one, which its skip condition prevents. */
function binaryPath(): string {
  if (!("binary" in CLAUDE)) throw new Error(CLAUDE.unavailable);
  return CLAUDE.binary;
}

describe.skipIf(SKIP_REASON !== undefined)(
  `Claude Code CLI contract${SKIP_REASON === undefined ? "" : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    let sandbox: ContractSandbox;

    beforeEach(async () => {
      sandbox = new ContractSandbox();
      await sandbox.renderFixtures();
    });

    afterEach(() => {
      sandbox.cleanup();
    });

    it("reports the version pinned in package.json", async () => {
      // Act
      const { stdout } = await execa(binaryPath(), ["--version"], {
        env: sandbox.cliEnv(0),
        extendEnv: false,
        timeout: CLI_TIMEOUT_MS,
      });

      // Assert
      expect(stdout.split(" ")[0]).toBe(AGENT_CLI_VERSIONS[CliType.Claude]);
    });

    describe("host session", () => {
      it("lists every rendered agent and skill in its init event", async () => {
        // Act
        const init = initOf(await sandbox.runHostSession());

        // Assert
        expect(stringsOf(init.agents)).toEqual(expect.arrayContaining(FIXTURE_AGENT_NAMES));
        expect(stringsOf(init.skills)).toEqual(expect.arrayContaining(SKILL_NAMES));
        expect(init.claude_code_version).toBe(AGENT_CLI_VERSIONS[CliType.Claude]);
      });

      it("offers the root every host tool and the subagent tool, and no web tool", async () => {
        // Act
        const init = initOf(await sandbox.runHostSession());

        // Assert
        const tools = stringsOf(init.tools);
        expect(tools).toEqual(expect.arrayContaining([...CLAUDE_HOST_TOOLS]));
        expect(tools.some(isClaudeSubagentTool)).toBe(true);
        expect(tools).not.toContain(ClaudeBuiltinTool.WebFetch);
        expect(tools).not.toContain(ClaudeBuiltinTool.WebSearch);
        expect(init.permissionMode).toBe(ClaudePermissionMode.DontAsk);
      });

      it("runs as the --agent root, whose frontmatter tools and model apply", async () => {
        // Act
        const init = initOf(await sandbox.runHostSession({ root: NARROW_ROOT_AGENT }));

        // Assert
        expect(stringsOf(init.tools).sort()).toEqual([ClaudeBuiltinTool.Read, ClaudeBuiltinTool.Skill]);
        expect(asString(init.model)).toMatch(/^claude-haiku-/);
      });

      it("refuses an --agent name no agent file declares, before the session starts", async () => {
        // Act
        const { result, events } = await sandbox.runHostSession({ agentName: "contract-missing" });

        // Assert
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("'contract-missing' not found");
        expect(events).toEqual([]);
      });

      it.each([...Object.values(ClaudeModelAlias), `${ClaudeModelAlias.Opus}[1m]`])(
        "resolves the model alias %s to a full Claude Code model id",
        async (alias) => {
          // Act
          const init = initOf(await sandbox.runHostSession({ model: alias }));

          // Assert
          const model = asString(init.model) ?? "";
          expect(model).toMatch(CLAUDE_MODEL_ID);
          expect(model).toMatch(new RegExp(`^claude-${alias.replace("[1m]", "")}-`));
          expect(model.endsWith("[1m]")).toBe(alias.endsWith("[1m]"));
        },
      );

      it.each(Object.values(ReasoningEffort))("runs the session at --effort %s", async (effort) => {
        // Act
        await sandbox.runHostSession({ model: ClaudeModelAlias.Opus, effort });

        // Assert
        expect(sandbox.hookPayloads().get("StopFailure")?.effort).toEqual({ level: effort });
      });

      it("loads Ralph's host settings, whose hooks get the payload fields the audit adapter reads", async () => {
        // Arrange
        const sessionArgs = new ClaudeSessionIds().start();
        const sessionId = sessionArgs[1];

        // Act
        await sandbox.runHostSession({ sessionArgs });

        // Assert
        const payloads = sandbox.hookPayloads();
        expect([...payloads.keys()].sort()).toEqual([...UNAUTHENTICATED_HOOK_EVENTS].sort());
        for (const payload of payloads.values()) {
          expect(payload).toMatchObject({ session_id: sessionId, agent_type: "contract-root" });
        }
        expect(payloads.get("SessionStart")).toMatchObject({ source: expect.any(String), cwd: sandbox.workspace.cwd });
        expect(payloads.get("UserPromptSubmit")).toMatchObject({ prompt: PROMPT });
        expect(payloads.get("StopFailure")).toMatchObject({
          error: "authentication_failed",
          last_assistant_message: expect.any(String),
        });
        expect(payloads.get("SessionEnd")).toMatchObject({ reason: expect.any(String) });
      });

      it("still starts a session whose settings file has an invalid key, but runs none of its hooks", async () => {
        // Act
        const run = await sandbox.runHostSession({
          editSettings: (settings) => ({ ...settings, disableAllHooks: "no" }),
        });

        // Assert
        expect(initOf(run).session_id).toEqual(expect.any(String));
        expect(sandbox.hookPayloads().size).toBe(0);
      });

      it("reports the missing login as a CLI error the orchestrator maps to auth-failed", async () => {
        // Arrange
        const sessionArgs = new ClaudeSessionIds().start();

        // Act
        const { result } = await sandbox.runHostSession({ sessionArgs });

        // Assert
        const { status, failureReason } = resolveStatus({
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          agentStatus: parseResultBlock(result.agentText).agentStatus,
          requireResultBlock: true,
          cliError: result.cliError,
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.sessionId).toBe(sessionArgs[1]);
        expect(result.cliError?.subtype).toBe("authentication_failed");
        expect({ status, failureReason }).toEqual({
          status: TaskStatus.Error,
          failureReason: FailureReason.AuthFailed,
        });
        expect(sandbox.logger.warn).not.toHaveBeenCalledWith(
          expect.stringMatching(/unparsable output|unexpected output/),
        );
      });

      it("accepts an inline --json-schema result schema and starts the session", async () => {
        // Act
        const run = await sandbox.runHostSession({ extraArgs: ["--json-schema", JSON.stringify(RESULT_SCHEMA)] });

        // Assert
        expect(initOf(run).session_id).toEqual(expect.any(String));
        expect(run.result.cliError?.subtype).toBe("authentication_failed");
        expect(run.result.stderr).toBe("");
      });

      it("refuses a --json-schema that is not a valid JSON Schema, before the session starts", async () => {
        // Arrange
        const invalidSchema = { type: "object", properties: { status: { type: "no-such-type" } } };

        // Act
        const { result, events } = await sandbox.runHostSession({
          extraArgs: ["--json-schema", JSON.stringify(invalidSchema)],
        });

        // Assert
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("--json-schema");
        expect(events).toEqual([]);
      });

      it("resumes the session it started under the same id", async () => {
        // Arrange
        const sessions = new ClaudeSessionIds();
        const first = initOf(await sandbox.runHostSession({ sessionArgs: sessions.start() }));

        // Act
        const resumed = initOf(await sandbox.runHostSession({ sessionArgs: sessions.resume() }));

        // Assert
        expect(resumed.session_id).toBe(first.session_id);
      });

      it("leaves a transcript Ralph reads back as the session, its agent, the prompt and the failed login", async () => {
        // Arrange
        const sessionArgs = new ClaudeSessionIds().start();

        // Act
        await sandbox.runHostSession({ sessionArgs });

        // Assert
        const sessions = await readClaudeSessions(join(sandbox.workspace.cliHomeDir, "projects"));
        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({ sessionId: sessionArgs[1], agent: "contract-root" });
        expect(sessions[0].events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: SessionEventKind.Prompt, text: PROMPT }),
            expect.objectContaining({ kind: SessionEventKind.ApiError, error: "authentication_failed" }),
          ]),
        );
      });
    });

    describe.skipIf(RUNS_AS_ROOT)(
      `container session${RUNS_AS_ROOT ? " (skipped: Claude Code refuses bypassPermissions to root)" : ""}`,
      () => {
        it("offers the root every built-in tool Ralph grants and the subagent tool", async () => {
          // Act
          const init = initOf(await sandbox.runContainerSession());

          // Assert
          const tools = stringsOf(init.tools);
          expect(tools).toEqual(expect.arrayContaining([...CLAUDE_BUILTIN_TOOLS]));
          expect(tools.some(isClaudeSubagentTool)).toBe(true);
          expect(init.permissionMode).toBe(ClaudePermissionMode.BypassPermissions);
          expect(init.mcp_servers).toEqual([]);
        });

        it("loads Ralph's session settings, whose hooks run", async () => {
          // Arrange
          const sessionArgs = new ClaudeSessionIds().start();

          // Act
          await sandbox.runContainerSession({ sessionArgs });

          // Assert
          const payloads = sandbox.hookPayloads();
          expect([...payloads.keys()].sort()).toEqual([...UNAUTHENTICATED_HOOK_EVENTS].sort());
          expect(payloads.get("SessionStart")).toMatchObject({
            session_id: sessionArgs[1],
            agent_type: "contract-root",
          });
        });
      },
    );
  },
);
