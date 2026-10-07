import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { AGENT_CLI_VERSIONS, hostCliBinary } from "../../src/cli/cli-versions";
import { CliType, StageMode, type IAgentProfile } from "../../src/config/types";
import { validateHostTools } from "../../src/validate/host-tools";
import { makeProfile, makeStage } from "../helpers/factories";
import { fakeExecResult } from "../helpers/mocks";

vi.mock("execa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("execa")>()),
  execa: vi.fn(),
}));

/** A profile whose post-task hook runs one host stage on `cli`. */
function hookProfile(id: string, cli: CliType): IAgentProfile {
  return makeProfile({
    id,
    postTaskHooks: [{ name: "run-analysis", stages: [makeStage({ role: "scientist", mode: StageMode.Local, cli })] }],
  });
}

describe("validateHostTools", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "host-tools-"));
    vi.mocked(execa).mockReset();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Places a file at the CLI's host binary path under `root`. */
  function installCli(cli: CliType): string {
    const binary = hostCliBinary(root, cli);
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(binary, "");
    return binary;
  }

  /** Every host command succeeds; a CLI's `--version` prints `versions[binary]`. */
  function hostCommands(versions: Readonly<Record<string, string>> = {}): void {
    vi.mocked(execa).mockImplementation(((command: string) =>
      Promise.resolve(fakeExecResult({ stdout: versions[command] ?? "" }))) as unknown as typeof execa);
  }

  async function validate(profiles: readonly IAgentProfile[]): Promise<string[]> {
    const errors: string[] = [];
    await validateHostTools(profiles, { errors, warnings: [] }, root);
    return errors;
  }

  describe("perl", () => {
    it("passes when perl runs", async () => {
      // Arrange
      hostCommands();

      // Act
      const errors = await validate([]);

      // Assert
      expect(errors).toEqual([]);
    });

    it("fails when perl cannot start, with the error and the redactor that needs it", async () => {
      // Arrange
      vi.mocked(execa).mockRejectedValue(new Error("spawn perl ENOENT"));

      // Act
      const errors = await validate([]);

      // Assert
      expect(errors).toEqual([expect.stringContaining("perl -e 1 failed on the host: spawn perl ENOENT")]);
      expect(errors[0]).toContain("shared/hooks/lib/redact.pl");
    });

    it("reports a perl that timed out as a timeout, not as a missing perl", async () => {
      // Arrange
      vi.mocked(execa).mockRejectedValue(new Error("Command timed out after 10000 milliseconds: perl -e 1"));

      // Act
      const errors = await validate([]);

      // Assert
      expect(errors).toEqual([expect.stringContaining("Command timed out after 10000 milliseconds")]);
    });
  });

  describe("host stage CLIs", () => {
    it("passes without any CLI installed when every stage runs in the container", async () => {
      // Arrange
      hostCommands();

      // Act
      const errors = await validate([makeProfile({ stages: [makeStage({ cli: CliType.Claude })] })]);

      // Assert
      expect(errors).toEqual([]);
    });

    it("passes when each host CLI reports its pinned version", async () => {
      // Arrange
      const claude = installCli(CliType.Claude);
      const copilot = installCli(CliType.Copilot);
      hostCommands({
        [claude]: `${AGENT_CLI_VERSIONS[CliType.Claude]} (Claude Code)\n`,
        [copilot]: `GitHub Copilot CLI ${AGENT_CLI_VERSIONS[CliType.Copilot]}.\n`,
      });

      // Act
      const errors = await validate([hookProfile("docs", CliType.Claude), hookProfile("vscode", CliType.Copilot)]);

      // Assert
      expect(errors).toEqual([]);
    });

    it("does not hand the orchestrator's secrets to the CLI it checks", async () => {
      // Arrange
      vi.stubEnv("ADO_PAT", "ado-secret");
      const claude = installCli(CliType.Claude);
      hostCommands({ [claude]: AGENT_CLI_VERSIONS[CliType.Claude] });

      // Act
      await validate([hookProfile("docs", CliType.Claude)]);

      // Assert
      const versionCall = (vi.mocked(execa).mock.calls as unknown[][]).find(([command]) => command === claude);
      expect(versionCall?.[2]).toMatchObject({ extendEnv: false });
      expect(JSON.stringify(versionCall?.[2])).not.toContain("ado-secret");
      vi.unstubAllEnvs();
    });

    it("checks Copilot's version with a fresh home and auto-update off, then removes the home", async () => {
      // Arrange
      const copilot = installCli(CliType.Copilot);
      hostCommands({ [copilot]: `GitHub Copilot CLI ${AGENT_CLI_VERSIONS[CliType.Copilot]}.\n` });

      // Act
      await validate([hookProfile("vscode", CliType.Copilot)]);

      // Assert
      const versionCall = (vi.mocked(execa).mock.calls as unknown[][]).find(([command]) => command === copilot);
      const env = (versionCall?.[2] as { env: Record<string, string> }).env;
      expect(env.COPILOT_AUTO_UPDATE).toBe("false");
      expect(env.COPILOT_HOME.startsWith(tmpdir())).toBe(true);
      expect(existsSync(env.COPILOT_HOME)).toBe(false);
    });

    it("checks a CLI that a variant's local stage runs", async () => {
      // Arrange
      hostCommands();
      const profile = makeProfile({
        stages: [makeStage(), makeStage({ role: "reviewer", mode: StageMode.Local, cli: CliType.Copilot })],
      });

      // Act
      const errors = await validate([profile]);

      // Assert
      expect(errors).toEqual([expect.stringContaining("node_modules/.bin/copilot not found")]);
    });

    it("fails when the CLI is not installed, naming the profiles whose host stages need it", async () => {
      // Arrange
      hostCommands();

      // Act
      const errors = await validate([hookProfile("docs", CliType.Claude), hookProfile("vscode", CliType.Claude)]);

      // Assert
      expect(errors).toEqual([
        expect.stringContaining(
          "node_modules/.bin/claude not found, but host stages of profiles/docs, profiles/vscode",
        ),
      ]);
      expect(errors[0]).toContain("allowScripts");
    });

    it("fails when the installed CLI reports another version than the pin", async () => {
      // Arrange
      const copilot = installCli(CliType.Copilot);
      hostCommands({ [copilot]: "1.0.3\n" });

      // Act
      const errors = await validate([hookProfile("docs", CliType.Copilot)]);

      // Assert
      expect(errors).toEqual([
        expect.stringContaining(
          `reports version 1.0.3, but package.json pins @github/copilot ${AGENT_CLI_VERSIONS[CliType.Copilot]}`,
        ),
      ]);
    });

    it("fails when the CLI cannot run, such as Claude Code's placeholder left by a skipped install script", async () => {
      // Arrange
      const claude = installCli(CliType.Claude);
      vi.mocked(execa).mockImplementation(((command: string) =>
        command === claude
          ? Promise.reject(new Error("Command failed with exit code 1: Error: claude native binary not installed."))
          : Promise.resolve(fakeExecResult())) as unknown as typeof execa);

      // Act
      const errors = await validate([hookProfile("docs", CliType.Claude)]);

      // Assert
      expect(errors).toEqual([expect.stringContaining("node_modules/.bin/claude --version failed")]);
      expect(errors[0]).toContain("claude native binary not installed");
    });

    it("requires jq when a host stage runs Claude Code, for Ralph's audit hooks", async () => {
      // Arrange
      const claude = installCli(CliType.Claude);
      vi.mocked(execa).mockImplementation(((command: string) =>
        command === "jq"
          ? Promise.reject(new Error("spawn jq ENOENT"))
          : Promise.resolve(
              fakeExecResult({ stdout: command === claude ? AGENT_CLI_VERSIONS[CliType.Claude] : "" }),
            )) as unknown as typeof execa);

      // Act
      const errors = await validate([hookProfile("docs", CliType.Claude)]);

      // Assert
      expect(errors).toEqual([expect.stringContaining("jq --version failed on the host: spawn jq ENOENT")]);
      expect(errors[0]).toContain("profiles/docs");
    });
  });
});
