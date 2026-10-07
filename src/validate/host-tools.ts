import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { execa } from "execa";
import { AGENT_CLI_VERSIONS, CLI_PACKAGES, hostCliBinary } from "../cli/cli-versions";
import { copilotHostEnv } from "../cli/copilot/copilot-host-env";
import { hostCliEnv } from "../cli/host-env";
import { CliType, StageMode, type IAgentProfile } from "../config/types";
import { toErrorMessage } from "../util/error";
import { locateStages } from "./stages";
import type { ValidationCollector } from "./types";

/** How long a host tool may take to exit. */
const TOOL_TIMEOUT_MS = 10_000;

/** How long a CLI may take to report its version. */
const VERSION_TIMEOUT_MS = 30_000;

/** The first `x.y.z` in a CLI's `--version` output. */
const VERSION_IN_OUTPUT = /\d+\.\d+\.\d+/;

/** Each CLI some `mode: "local"` stage runs, variant and post-task hook stages alike, with the profiles running it. */
function hostStageClis(profiles: readonly IAgentProfile[]): Map<CliType, Set<string>> {
  const usedBy = new Map<CliType, Set<string>>();
  for (const { stage, variant } of locateStages(profiles)) {
    if (stage.mode !== StageMode.Local) continue;
    usedBy.set(stage.cli, (usedBy.get(stage.cli) ?? new Set<string>()).add(`profiles/${variant.id}`));
  }
  return usedBy;
}

/** Why `command args` failed on the host: it could not start, timed out or exited non-zero; undefined when it ran. */
async function failureOf(command: string, args: readonly string[]): Promise<string | undefined> {
  try {
    await execa(command, [...args], { timeout: TOOL_TIMEOUT_MS });
    return undefined;
  } catch (err) {
    return toErrorMessage(err);
  }
}

/** The fix for a missing or broken host CLI install. */
function reinstallHint(cli: CliType): string {
  // Claude Code's install script swaps its placeholder for the native binary; npm skips it unless allowScripts lists it.
  return cli === CliType.Claude
    ? `  Run npm ci; package.json allowScripts must allow the install script of ${CLI_PACKAGES[cli].name}`
    : "  Run npm ci";
}

/**
 * The `--version` output of `binary`, run the way a host stage runs it: without the orchestrator's secrets, and
 * Copilot with a fresh home and auto-update off, so it reports the version it runs rather than a newer one it
 * downloaded.
 *
 * @throws Error when the CLI cannot start, times out or exits non-zero.
 */
async function reportedVersion(cli: CliType, binary: string): Promise<string> {
  const run = async (env: Readonly<Record<string, string>>): Promise<string> => {
    const { stdout } = await execa(binary, ["--version"], {
      timeout: VERSION_TIMEOUT_MS,
      extendEnv: false,
      env: hostCliEnv(process.env, [], env),
    });
    return String(stdout);
  };
  if (cli !== CliType.Copilot) return run({});
  const home = await mkdtemp(join(tmpdir(), "ralph-copilot-home-"));
  try {
    return await run(copilotHostEnv(home));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

/** Checks that `cli` is installed under `<rootDir>/node_modules/.bin` and reports the version package.json pins. */
async function validateHostCli(cli: CliType, usedBy: Set<string>, rootDir: string, errors: string[]): Promise<void> {
  const binary = hostCliBinary(rootDir, cli);
  const shown = relative(rootDir, binary);
  const pinned = AGENT_CLI_VERSIONS[cli];
  const context = `host stages of ${[...usedBy].join(", ")} run cli "${cli}"`;

  if (!existsSync(binary)) {
    errors.push(`${shown} not found, but ${context}\n${reinstallHint(cli)}`);
    return;
  }

  let output: string;
  try {
    output = await reportedVersion(cli, binary);
  } catch (err) {
    errors.push(`${shown} --version failed, but ${context}: ${toErrorMessage(err)}\n${reinstallHint(cli)}`);
    return;
  }

  const version = VERSION_IN_OUTPUT.exec(output)?.[0];
  if (version !== pinned) {
    errors.push(
      `${shown} reports version ${version ?? JSON.stringify(output.trim())}, but package.json pins ` +
        `${CLI_PACKAGES[cli].name} ${pinned}\n${reinstallHint(cli)}`,
    );
  }
}

/**
 * Checks the tools the orchestrator runs on the host:
 *
 * - `perl -e 1` runs;
 * - when a `mode: "local"` stage runs Claude Code, `jq --version` runs;
 * - each CLI a `mode: "local"` stage runs is installed at `<rootDir>/node_modules/.bin/<cli>` and its `--version`
 *   reports the version package.json pins.
 *
 * Each failure is reported with the error the command ended with.
 *
 * @param profiles Resolved variants of all profiles.
 * @param rootDir The orchestrator checkout root.
 */
export async function validateHostTools(
  profiles: readonly IAgentProfile[],
  { errors }: ValidationCollector,
  rootDir: string = process.cwd(),
): Promise<void> {
  const perlFailure = await failureOf("perl", ["-e", "1"]);
  if (perlFailure !== undefined) {
    errors.push(
      `perl -e 1 failed on the host: ${perlFailure}\n` +
        "  The transcript redactor shared/hooks/lib/redact.pl needs perl 5",
    );
  }

  const hostClis = hostStageClis(profiles);
  const claudeUsers = hostClis.get(CliType.Claude);
  if (claudeUsers) {
    const jqFailure = await failureOf("jq", ["--version"]);
    if (jqFailure !== undefined) {
      errors.push(
        `jq --version failed on the host: ${jqFailure}\n` +
          `  Host stages of ${[...claudeUsers].join(", ")} run cli "claude", whose audit hooks in shared/hooks/ ` +
          "need jq 1.6 or later",
      );
    }
  }

  for (const [cli, usedBy] of hostClis) {
    await validateHostCli(cli, usedBy, rootDir, errors);
  }
}
