import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentCatalog } from "../../../src/cli/agent-catalog";
import { ClaudeCodeRuntime } from "../../../src/cli/claude/claude-runtime";
import { ClaudeAgentWriter } from "../../../src/cli/claude/claude-agent-writer";
import { ClaudeStreamJsonDecoder } from "../../../src/cli/claude/stream-json-decoder";
import { ClaudeAuthMode, CliType } from "../../../src/config/types";
import { CaptureMode } from "../../../src/container/log-collector";
import { profileBuildPaths } from "../../../src/container/setup/build-paths";
import { makeProfile, makeStage } from "../../helpers/factories";
import { createTempDir } from "../../helpers/mcp-fs";
import { createSilentLogger } from "../../helpers/mocks";

const PATHS = profileBuildPaths("/repo", "docs");
const AGENTS = new AgentCatalog([]);

/** The contribution for a variant with one Claude Code container stage. */
function contribution(auth: ClaudeAuthMode, loadRepoInstructions = false) {
  const profile = makeProfile({
    id: "docs",
    stages: [makeStage({ cli: CliType.Claude })],
    claude: { loadRepoInstructions },
  });
  return new ClaudeCodeRuntime({ claudeAuth: auth }).composeContribution({ profile, paths: PATHS, agents: AGENTS });
}

describe("ClaudeCodeRuntime", () => {
  describe("sessionStartAudited", () => {
    const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });
    const record = (event: string, session: string) => JSON.stringify({ schemaVersion: 2, event, session });

    it("finds the session_start record of the session", () => {
      // Arrange
      const audit = [record("session_start", "other"), "not json", record("session_start", "s-1"), ""].join("\n");

      // Act & Assert
      expect(runtime.sessionStartAudited(audit, "s-1")).toBe(true);
    });

    it("reports false when only other sessions or other events were recorded", () => {
      // Arrange
      const audit = [record("session_start", "other"), record("prompt", "s-1")].join("\n");

      // Act & Assert
      expect(runtime.sessionStartAudited(audit, "s-1")).toBe(false);
      expect(runtime.sessionStartAudited("", "s-1")).toBe(false);
    });
  });

  it("writes agents in the Claude Code format and names Claude Code's tools", () => {
    // Arrange
    const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });

    // Act & Assert
    expect(runtime.agentWriter).toBeInstanceOf(ClaudeAgentWriter);
    expect(runtime.mountsEachRenderedItem).toBe(false);
    expect(runtime.toolNames).toEqual({
      subagent: "Agent",
      skill: "Skill",
      shell: "Bash",
      read: "Read",
      askUser: "AskUserQuestion",
    });
  });

  describe("composeContribution", () => {
    it("references the OAuth token by name only, and only it, under oauth-token auth", () => {
      // Act
      const { env } = contribution(ClaudeAuthMode.OAuthToken);

      // Assert
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("${CLAUDE_CODE_OAUTH_TOKEN}");
      expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
      expect(env).not.toHaveProperty("GH_TOKEN");
    });

    it("references the API key, and only it, under api-key auth", () => {
      // Act
      const { env } = contribution(ClaudeAuthMode.ApiKey);

      // Assert
      expect(env.ANTHROPIC_API_KEY).toBe("${ANTHROPIC_API_KEY}");
      expect(env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("sets the Claude Code environment for headless container sessions", () => {
      // Act
      const { env } = contribution(ClaudeAuthMode.OAuthToken);

      // Assert
      expect(env).toEqual({
        CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}",
        CLAUDE_CONFIG_DIR: "/workspace/.ralph/claude",
        CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
        DISABLE_AUTOUPDATER: "1",
        DISABLE_COST_WARNINGS: "1",
        ENABLE_TOOL_SEARCH: "false",
      });
    });

    it("keeps the target repo's CLAUDE.md files loadable when the profile opts in", () => {
      // Act
      const { env } = contribution(ClaudeAuthMode.OAuthToken, true);

      // Assert
      expect(env).not.toHaveProperty("CLAUDE_CODE_DISABLE_CLAUDE_MDS");
    });

    it("mounts the settings files read-only and, whole, the agents and skills directories", () => {
      // Act
      const { volumes } = contribution(ClaudeAuthMode.OAuthToken);

      // Assert
      expect(volumes).toEqual([
        `${PATHS.buildDir}/claude/session-settings.json:/etc/ralph/claude-settings.json:ro`,
        `${PATHS.buildDir}/claude/user-settings.json:/workspace/.ralph/claude/settings.json:ro`,
        `${PATHS.buildDir}/claude/agents:/workspace/.ralph/claude/agents:ro`,
        `${PATHS.buildDir}/skills:/workspace/.ralph/claude/skills:ro`,
      ]);
    });
  });

  it("needs only the Anthropic API host through the egress proxy", () => {
    // Act & Assert
    expect(new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken }).egressDomains).toEqual([
      "api.anthropic.com",
    ]);
  });

  it("mounts only inside .ralph/ of the target repo", () => {
    // Act
    const targets = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken }).workspaceMountTargets;

    // Assert
    expect(targets).toEqual([".ralph/claude/settings.json", ".ralph/claude/agents/", ".ralph/claude/skills/"]);
  });

  it("keeps its home, debug log and agents under .ralph/", () => {
    // Act
    const { layout } = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });

    // Assert
    expect(layout).toMatchObject({
      configDir: "/workspace/.ralph/claude",
      agentsDir: "/workspace/.ralph/claude/agents",
      skillsDir: "/workspace/.ralph/claude/skills",
      debugLog: { path: "/workspace/.ralph/logs/cli-debug/claude.log" },
      transcriptPath: null,
    });
    expect(layout.writableDirs).toContain("/workspace/.ralph/logs/cli-debug");
  });

  describe("writeTaskArtifacts", () => {
    let root: string;

    beforeEach(() => {
      root = createTempDir();
      mkdirSync(join(root, "shared", "hooks", "claude"), { recursive: true });
      writeFileSync(join(root, "shared", "hooks", "claude", "hooks.json"), "{}");
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it("writes the settings and creates the agents and skills directories before compose mounts them", () => {
      // Arrange
      const paths = profileBuildPaths(root, "docs");
      const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });

      // Act
      runtime.writeTaskArtifacts({ profile: makeProfile({ id: "docs" }), paths, agents: AGENTS }, createSilentLogger());

      // Assert
      expect(existsSync(join(paths.buildDir, "claude", "session-settings.json"))).toBe(true);
      expect(existsSync(join(paths.buildDir, "claude", "agents"))).toBe(true);
      expect(existsSync(paths.skillsBuildDir)).toBe(true);
    });
  });

  describe("logSources", () => {
    it("streams the debug log file when a callback is given and exports the session transcripts", () => {
      // Arrange
      const onLine = (): void => {};

      // Act
      const { sources, exports } = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken }).logSources(onLine);

      // Assert
      expect(sources).toEqual([
        {
          id: "claude-cli-debug",
          service: "app",
          containerPath: "/workspace/.ralph/logs/cli-debug/claude.log",
          extension: "log",
          mode: CaptureMode.Stream,
          onLine,
        },
      ]);
      expect(exports).toEqual([
        { id: "claude-sessions", service: "app", containerPath: "/workspace/.ralph/claude/projects" },
      ]);
    });

    it("only collects the debug log without a callback", () => {
      // Act
      const { sources } = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken }).logSources();

      // Assert
      expect(sources[0].mode).toBe(CaptureMode.Collect);
    });
  });

  it("decodes output as stream-json, with a fresh decoder per process", () => {
    // Arrange
    const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });

    // Act
    const first = runtime.createOutputDecoder();

    // Assert
    expect(first).toBeInstanceOf(ClaudeStreamJsonDecoder);
    expect(runtime.createOutputDecoder()).not.toBe(first);
  });

  describe("deriveRunArtifacts", () => {
    const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });
    const SESSIONS = join(import.meta.dirname, "fixtures", "claude-sessions");

    it("renders the transcript and extracts the telemetry of the collected sessions", async () => {
      // Act
      const { transcript, telemetry } = await runtime.deriveRunArtifacts({ "claude-sessions": SESSIONS });

      // Assert
      expect(transcript).toContain("## Session `11111111-2222-4333-8444-555555555555`");
      expect(telemetry?.sessionIds).toEqual([
        "11111111-2222-4333-8444-555555555555",
        "00000000-0000-4000-8000-000000000000",
      ]);
    });

    it("derives nothing when no sessions folder was collected", async () => {
      // Act & Assert
      await expect(runtime.deriveRunArtifacts({ audit: "/tmp/audit.jsonl" })).resolves.toEqual({
        transcript: null,
        telemetry: null,
      });
    });

    it("derives nothing from a collected folder that holds no session", async () => {
      // Arrange
      const dir = createTempDir();

      // Act
      const artifacts = await runtime.deriveRunArtifacts({ "claude-sessions": dir });

      // Assert
      expect(artifacts).toEqual({ transcript: null, telemetry: null });
      rmSync(dir, { recursive: true, force: true });
    });

    it("throws when the collected folder cannot be read", async () => {
      // Act & Assert
      await expect(runtime.deriveRunArtifacts({ "claude-sessions": "/nonexistent/claude-sessions" })).rejects.toThrow(
        /ENOENT/,
      );
    });
  });
});
