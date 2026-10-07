import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ZodError } from "zod";
import { readProfileFile, resolveProfileVariants } from "../../src/config/profile-variants";
import { profileFileSchema } from "../../src/config/schemas";
import { CliType, ReasoningEffort, StageMode } from "../../src/config/types";

/** A schema-valid profile.json with one single-stage variant, merged with `overrides`. */
function profileFile(overrides: Record<string, unknown> = {}) {
  return profileFileSchema.parse({
    repo: "/tmp/repo",
    dataSource: "jira",
    variants: [{ stages: [{ agent: "ralph.ralph", role: "primary" }], match: { commentTrigger: "@Ralph" } }],
    ...overrides,
  });
}

/** One variant with the given stages and post-task hook stages. */
function variantWith(stages: Record<string, unknown>[], hookStages: Record<string, unknown>[] = []) {
  return {
    stages,
    match: { commentTrigger: "@Ralph" },
    postTaskHooks: hookStages.length > 0 ? [{ name: "analysis", stages: hookStages }] : [],
  };
}

describe("resolveProfileVariants", () => {
  it("expands each variant into a profile keyed by profile id, first agent and trigger", () => {
    // Arrange
    const parsed = profileFile({
      variants: [
        { stages: [{ agent: "ralph.ralph", role: "primary" }], match: { commentTrigger: "@Ralph" } },
        { stages: [{ agent: "ralph.malph", role: "primary" }], match: { commentTrigger: "@Malph" } },
      ],
    });

    // Act
    const variants = resolveProfileVariants(parsed, "ralph-docs");

    // Assert
    expect(variants.map((v) => v.variantKey)).toEqual([
      "ralph-docs:ralph.ralph:@Ralph",
      "ralph-docs:ralph.malph:@Malph",
    ]);
  });

  describe("stage cli", () => {
    it("runs every stage on Copilot when neither the profile nor the stage sets a cli", () => {
      // Arrange
      const parsed = profileFile();

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.cli).toBe(CliType.Copilot);
      expect(variant.stages[0].cli).toBe(CliType.Copilot);
    });

    it("inherits the profile cli", () => {
      // Arrange
      const parsed = profileFile({ cli: "claude" });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.stages[0].cli).toBe(CliType.Claude);
    });

    it("lets a stage override the profile cli", () => {
      // Arrange
      const parsed = profileFile({
        cli: "claude",
        variants: [
          variantWith([
            { agent: "ralph.ralph", role: "primary" },
            { agent: "ralph.malph", role: "reviewer", cli: "copilot" },
          ]),
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.stages.map((s) => s.cli)).toEqual([CliType.Claude, CliType.Copilot]);
      expect(variant.cli).toBe(CliType.Claude);
    });

    it("resolves post-task hook stage clis the same way", () => {
      // Arrange
      const parsed = profileFile({
        cli: "copilot",
        variants: [
          variantWith(
            [{ agent: "ralph.ralph", role: "primary" }],
            [
              { agent: "ralph.analyzer", role: "analyzer", mode: "local" },
              { agent: "ralph.improver", role: "improver", mode: "local", cli: "claude" },
            ],
          ),
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.postTaskHooks[0].stages.map((s) => s.cli)).toEqual([CliType.Copilot, CliType.Claude]);
    });
  });

  describe("containerClis", () => {
    it("lists each container stage cli once, in stage order", () => {
      // Arrange
      const parsed = profileFile({
        cli: "claude",
        variants: [
          variantWith([
            { agent: "a", role: "one" },
            { agent: "b", role: "two", cli: "copilot" },
            { agent: "c", role: "three" },
          ]),
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.containerClis).toEqual([CliType.Claude, CliType.Copilot]);
    });

    it("ignores local stages and post-task hook stages", () => {
      // Arrange
      const parsed = profileFile({
        cli: "claude",
        variants: [
          variantWith(
            [
              { agent: "a", role: "one" },
              { agent: "b", role: "two", mode: "local", cli: "copilot" },
            ],
            [{ agent: "h", role: "hook", mode: "local", cli: "copilot" }],
          ),
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.containerClis).toEqual([CliType.Claude]);
      expect(variant.stages[1].mode).toBe(StageMode.Local);
    });
  });

  describe("requireResultBlock", () => {
    it("requires the result block from variant stages by default", () => {
      // Arrange
      const parsed = profileFile();

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.stages[0].requireResultBlock).toBe(true);
    });

    it("does not require the result block from post-task hook stages by default", () => {
      // Arrange
      const parsed = profileFile({
        variants: [variantWith([{ agent: "a", role: "one" }], [{ agent: "h", role: "hook", mode: "local" }])],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.postTaskHooks[0].stages[0].requireResultBlock).toBe(false);
    });

    it("honours an explicit setting on either kind of stage", () => {
      // Arrange
      const parsed = profileFile({
        variants: [
          variantWith(
            [{ agent: "a", role: "one", requireResultBlock: false }],
            [{ agent: "h", role: "hook", mode: "local", requireResultBlock: true }],
          ),
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.stages[0].requireResultBlock).toBe(false);
      expect(variant.postTaskHooks[0].stages[0].requireResultBlock).toBe(true);
    });
  });

  it("carries the Claude Code stage options", () => {
    // Arrange
    const parsed = profileFile({
      cli: "claude",
      variants: [variantWith([{ agent: "a", role: "one", effort: "high" }])],
    });

    // Act
    const [variant] = resolveProfileVariants(parsed, "p");

    // Assert
    expect(variant.stages[0].effort).toBe(ReasoningEffort.High);
  });

  describe("MCP servers", () => {
    it("appends variant-level servers to the profile-level ones", () => {
      // Arrange
      const parsed = profileFile({
        mcpServers: ["ado", "web-fetch"],
        variants: [{ ...variantWith([{ agent: "a", role: "one" }]), mcpServers: ["playwright", "ado"] }],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.mcpServers).toEqual(["ado", "web-fetch", "playwright"]);
    });

    it("replaces a profile-level server env with the variant-level env for the same server", () => {
      // Arrange
      const parsed = profileFile({
        mcpServers: [{ name: "ado", env: { ADO_PROJECT: "Docs", ADO_REPO: "docs" } }],
        variants: [
          { ...variantWith([{ agent: "a", role: "one" }]), mcpServers: [{ name: "ado", env: { ADO_REPO: "kb" } }] },
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.mcpServerConfigs).toEqual({ ado: { ADO_REPO: "kb" } });
    });

    it("merges profile- and variant-level sidecar env, variant values winning", () => {
      // Arrange
      const parsed = profileFile({
        mcpServers: [{ name: "codegraphcontext", sidecarEnv: { CGC_INDEX_PATH: "/a", CGC_MODE: "fast" } }],
        variants: [
          {
            ...variantWith([{ agent: "a", role: "one" }]),
            mcpServers: [{ name: "playwright", sidecarEnv: { CGC_INDEX_PATH: "/b" } }],
          },
        ],
      });

      // Act
      const [variant] = resolveProfileVariants(parsed, "p");

      // Assert
      expect(variant.mcpSidecarEnv).toEqual({ CGC_INDEX_PATH: "/b", CGC_MODE: "fast" });
    });

    it("throws when the profile lists a server twice", () => {
      // Arrange
      const parsed = profileFile({ mcpServers: ["ado", { name: "ado", env: { ADO_PROJECT: "Docs" } }] });

      // Act & Assert
      expect(() => resolveProfileVariants(parsed, "p")).toThrow('Profile "p": duplicate MCP server(s): ado');
    });
  });
});

describe("readProfileFile", () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Write `content` as profile.json in a fresh temp directory and return its path. */
  function writeProfileJson(content: string): string {
    dir = mkdtempSync(join(tmpdir(), "profile-variants-"));
    const path = join(dir, "profile.json");
    writeFileSync(path, content);
    return path;
  }

  it("returns the schema-parsed profile with defaults applied", () => {
    // Arrange
    const path = writeProfileJson(JSON.stringify(profileFile()));

    // Act
    const parsed = readProfileFile(path);

    // Assert
    expect(parsed.cli).toBe(CliType.Copilot);
    expect(parsed.variants[0].stages[0].mode).toBe(StageMode.Container);
  });

  it("throws with the path when the file is not JSON", () => {
    // Arrange
    const path = writeProfileJson("not json {");

    // Act & Assert
    expect(() => readProfileFile(path)).toThrow(`Failed to read ${path}`);
  });

  it("throws a ZodError when the profile breaks the schema", () => {
    // Arrange
    const path = writeProfileJson(JSON.stringify({ repo: "/tmp/repo" }));

    // Act & Assert
    expect(() => readProfileFile(path)).toThrow(ZodError);
  });
});
