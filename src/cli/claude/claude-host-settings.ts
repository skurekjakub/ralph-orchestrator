import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HostStageWorkspace } from "../../container/types";
import { RALPH_CONTAINER_DIR } from "../../container/workspace-paths";
import { buildSessionSettings, readClaudeHooks, type ClaudeSessionSettings } from "./claude-settings";
import { CLAUDE_SUBAGENT_TOOL, ClaudeBuiltinTool } from "./claude-tools";

/** The prefix of every command in `shared/hooks/claude/hooks.json`: where the container mounts `shared/hooks`. */
const CONTAINER_HOOKS_PREFIX = `${RALPH_CONTAINER_DIR}/hooks/`;

/**
 * Commands a host session may run with Bash: they read logs and telemetry or print the time the artifact contract
 * stamps its manifest entries with, and none of them writes a file or starts another program. `sed` is left out,
 * because its `e` and `w` commands do both.
 */
export const HOST_READ_ONLY_COMMANDS = ["jq", "grep", "ls", "wc", "cat", "head", "tail", "date"] as const;

/** Permission rules of a host session (`permissions` in its settings file); a deny rule wins over an allow rule. */
export interface ClaudePermissionRules {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
}

/** Ralph's settings for one host session: hooks pointed at the host's `shared/hooks`, and the stage's permission rules. */
export interface ClaudeHostSessionSettings extends ClaudeSessionSettings {
  readonly permissions: ClaudePermissionRules;
}

/** `value` quoted for a POSIX shell, so a path with spaces or quotes stays one word. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** A rule specifier matching `dir` and everything below it; `//` marks an absolute path. */
function underDir(dir: string): string {
  return `/${dir}/**`;
}

/**
 * `hooks` with each command's container path to `shared/hooks` replaced by `hooksDir`, quoted for the shell, so
 * the same audit hooks run on the host.
 *
 * @param hooks The content of `shared/hooks/claude/hooks.json`.
 * @param hooksDir The host path of `shared/hooks`.
 * @throws Error when a command does not start with the container's `shared/hooks` path.
 */
export function hostHooks(
  hooks: Readonly<Record<string, unknown>>,
  hooksDir: string,
): Readonly<Record<string, unknown>> {
  const rewrite = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => rewrite(item));
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, rewrite(inner, name)]));
    }
    if (key !== "command" || typeof value !== "string") return value;
    if (!value.startsWith(CONTAINER_HOOKS_PREFIX)) {
      throw new Error(
        `Claude Code hook command ${JSON.stringify(value)} does not start with ${CONTAINER_HOOKS_PREFIX}`,
      );
    }
    const rest = value.slice(CONTAINER_HOOKS_PREFIX.length);
    const separator = rest.search(/\s/);
    const script = separator === -1 ? rest : rest.slice(0, separator);
    const args = separator === -1 ? "" : rest.slice(separator);
    return `${shellQuote(join(hooksDir, script))}${args}`;
  };
  return rewrite(hooks) as Readonly<Record<string, unknown>>;
}

/**
 * The permission rules of a host session, which runs in `dontAsk` mode: a tool call no allow rule covers is denied.
 *
 * - Read the working directory and every additional directory (task logs, the orchestrator's `profiles/` and
 *   `shared/`); never the orchestrator's `.env`.
 * - Write and edit only in the working directory and the artifact directory. Edit rules cover the Write tool.
 * - Run only {@link HOST_READ_ONLY_COMMANDS} with Bash.
 * - Load skills, track tasks, and spawn the stage's subagents.
 *
 * @param subagents Frontmatter names of every agent the stage root can reach, root excluded.
 */
export function hostPermissionRules(
  workspace: HostStageWorkspace,
  subagents: readonly string[],
): ClaudePermissionRules {
  return {
    allow: [
      ClaudeBuiltinTool.Skill,
      ClaudeBuiltinTool.TaskCreate,
      ClaudeBuiltinTool.TaskGet,
      ClaudeBuiltinTool.TaskList,
      ClaudeBuiltinTool.TaskUpdate,
      ...subagents.map((name) => `${CLAUDE_SUBAGENT_TOOL}(${name})`),
      ...[workspace.cwd, ...workspace.additionalDirs].map((dir) => `${ClaudeBuiltinTool.Read}(${underDir(dir)})`),
      ...[workspace.cwd, workspace.artifactDir].map((dir) => `${ClaudeBuiltinTool.Edit}(${underDir(dir)})`),
      ...HOST_READ_ONLY_COMMANDS.map((command) => `${ClaudeBuiltinTool.Bash}(${command} *)`),
    ],
    deny: [`${ClaudeBuiltinTool.Read}(/${join(workspace.orchestratorDir, ".env")})`],
  };
}

/** The settings file of a host session, in the stage's own directory. */
export function hostSettingsPath(workspace: HostStageWorkspace): string {
  return join(workspace.stageDir, "claude-settings.json");
}

/**
 * Writes the settings of a host session to {@link hostSettingsPath}: Ralph's session settings, with the audit hooks
 * of `<hooksDir>/claude/hooks.json` run from `hooksDir`, and the stage's permission rules.
 *
 * @param subagents Frontmatter names of every agent the stage root can reach, root excluded.
 * @returns The settings file's path.
 * @throws Error when the hooks cannot be read or a hook command is not under the container's `shared/hooks`.
 */
export function writeHostSessionSettings(
  workspace: HostStageWorkspace,
  hooksDir: string,
  subagents: readonly string[],
): string {
  const settings: ClaudeHostSessionSettings = {
    ...buildSessionSettings(hostHooks(readClaudeHooks(hooksDir), hooksDir)),
    permissions: hostPermissionRules(workspace, subagents),
  };
  const path = hostSettingsPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return path;
}
