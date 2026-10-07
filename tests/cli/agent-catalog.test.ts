import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentCatalog, findAgentCatalogIssues, scanAgentSources } from "../../src/cli/agent-catalog";
import { AgentDefinitionError } from "../../src/cli/agent-definition";
import { makeAgentSource, makeAgentTemplate } from "../helpers/factories";

/** ralph → [writer → validator, scribe]; scientist stands alone. */
const PROFILE_AGENTS = [
  makeAgentSource("ralph.ralph", { name: "ralph", subagents: ["writer", "scribe"] }),
  makeAgentSource("ralph.writer", { name: "writer", subagents: ["validator"] }),
  makeAgentSource("ralph.validator", { name: "validator" }),
  makeAgentSource("ralph.scribe", { name: "scribe" }),
  makeAgentSource("ralph.scientist-run-analyzer", { name: "run-analyzer" }),
];

describe("findAgentCatalogIssues", () => {
  it("finds nothing wrong with a valid graph", () => {
    // Act & Assert
    expect(findAgentCatalogIssues(PROFILE_AGENTS)).toEqual([]);
  });

  it("reports a subagent that is not an agent of the profile", () => {
    // Arrange
    const sources = [makeAgentSource("ralph.ralph", { name: "ralph", subagents: ["ralph-reviewer-style-gpt"] })];

    // Act & Assert
    expect(findAgentCatalogIssues(sources)).toEqual([
      'agent ralph.ralph: subagent "ralph-reviewer-style-gpt" is not an agent of this profile',
    ]);
  });

  it("reports two templates sharing a name", () => {
    // Arrange
    const sources = [
      makeAgentSource("ralph.agent-improver", { name: "agent-improver" }),
      makeAgentSource("ralph.scientist-agent-improver", { name: "agent-improver" }),
    ];

    // Act & Assert
    expect(findAgentCatalogIssues(sources)).toEqual([
      'agents ralph.agent-improver and ralph.scientist-agent-improver share the name "agent-improver"',
    ]);
  });

  it("reports a subagent cycle once", () => {
    // Arrange
    const sources = [
      makeAgentSource("ralph.a", { name: "a", subagents: ["b"] }),
      makeAgentSource("ralph.b", { name: "b", subagents: ["c"] }),
      makeAgentSource("ralph.c", { name: "c", subagents: ["a"] }),
    ];

    // Act & Assert
    expect(findAgentCatalogIssues(sources)).toEqual(["subagent cycle: a → b → c → a"]);
  });

  it("reports an agent that spawns itself", () => {
    // Arrange
    const sources = [makeAgentSource("ralph.a", { name: "a", subagents: ["a"] })];

    // Act & Assert
    expect(findAgentCatalogIssues(sources)).toEqual(["subagent cycle: a → a"]);
  });
});

describe("AgentCatalog", () => {
  describe("constructor", () => {
    it("throws listing every graph problem", () => {
      // Arrange
      const sources = [
        makeAgentSource("ralph.a", { name: "a", subagents: ["missing"] }),
        makeAgentSource("ralph.b", { name: "a" }),
      ];

      // Act & Assert
      expect(() => new AgentCatalog(sources)).toThrow(/share the name "a"[\s\S]*subagent "missing"/);
    });
  });

  describe("reachableFrom", () => {
    it("lists the root, then its subagents breadth-first, each once", () => {
      // Arrange
      const catalog = new AgentCatalog([
        ...PROFILE_AGENTS,
        makeAgentSource("ralph.malph", { name: "malph", subagents: ["scribe", "writer"] }),
      ]);

      // Act & Assert
      expect(catalog.reachableFrom("ralph.ralph")).toEqual([
        "ralph.ralph",
        "ralph.writer",
        "ralph.scribe",
        "ralph.validator",
      ]);
      expect(catalog.reachableFrom("ralph.malph")).toEqual([
        "ralph.malph",
        "ralph.scribe",
        "ralph.writer",
        "ralph.validator",
      ]);
    });

    it("lists only the root for an agent without subagents", () => {
      // Act & Assert
      expect(new AgentCatalog(PROFILE_AGENTS).reachableFrom("ralph.scientist-run-analyzer")).toEqual([
        "ralph.scientist-run-analyzer",
      ]);
    });

    it("throws for an unknown root, listing the agents", () => {
      // Act & Assert
      expect(() => new AgentCatalog(PROFILE_AGENTS).reachableFrom("ralph.nope")).toThrow(
        /No agent template ralph\.nope \(agents: ralph\.ralph, /,
      );
    });
  });

  describe("depthFrom", () => {
    it("measures the longest subagent chain below the root", () => {
      // Arrange
      const catalog = new AgentCatalog(PROFILE_AGENTS);

      // Act & Assert
      expect([
        catalog.depthFrom("ralph.ralph"),
        catalog.depthFrom("ralph.writer"),
        catalog.depthFrom("ralph.scribe"),
      ]).toEqual([2, 1, 0]);
    });
  });

  describe("lookups", () => {
    it("finds agents by file id", () => {
      // Arrange
      const catalog = new AgentCatalog(PROFILE_AGENTS);

      // Act & Assert
      expect(catalog.get("ralph.scientist-run-analyzer").frontmatter.name).toBe("run-analyzer");
      expect(catalog.fileIds).toEqual([
        "ralph.ralph",
        "ralph.scientist-run-analyzer",
        "ralph.scribe",
        "ralph.validator",
        "ralph.writer",
      ]);
    });
  });

  describe("load", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "agent-catalog-test-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("parses every *.agent.md template and ignores other files", async () => {
      // Arrange
      await writeFile(join(dir, "ralph.ralph.agent.md"), makeAgentTemplate("ralph", { subagents: ["writer"] }));
      await writeFile(join(dir, "ralph.writer.agent.md"), makeAgentTemplate("writer", { body: "Write.\n" }));
      await writeFile(join(dir, "README.md"), "not an agent");

      // Act
      const catalog = await AgentCatalog.load(dir);

      // Assert
      expect(catalog.fileIds).toEqual(["ralph.ralph", "ralph.writer"]);
      expect(catalog.get("ralph.writer").bodyTemplate).toBe("Write.\n");
    });

    it("throws an AgentDefinitionError for an invalid template", async () => {
      // Arrange
      await writeFile(join(dir, "ralph.bad.agent.md"), "---\nname: bad\n---\n");

      // Act & Assert
      await expect(AgentCatalog.load(dir)).rejects.toBeInstanceOf(AgentDefinitionError);
    });

    it("throws for templates that do not form a valid graph", async () => {
      // Arrange
      await writeFile(join(dir, "ralph.ralph.agent.md"), makeAgentTemplate("ralph", { subagents: ["gone"] }));

      // Act & Assert
      await expect(AgentCatalog.load(dir)).rejects.toThrow(/subagent "gone" is not an agent of this profile/);
    });

    it("throws when the directory does not exist", async () => {
      // Act & Assert
      await expect(AgentCatalog.load(join(dir, "missing"))).rejects.toThrow(/ENOENT/);
    });
  });
});

describe("scanAgentSources", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-scan-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses the valid templates and collects the error of every invalid one", async () => {
    // Arrange
    await writeFile(join(dir, "ralph.a-bad.agent.md"), "---\nname: a-bad\n---\n");
    await writeFile(join(dir, "ralph.good.agent.md"), makeAgentTemplate("good"));
    await writeFile(join(dir, "ralph.z-bad.agent.md"), "---\nname: z-bad\n---\n");
    await writeFile(join(dir, "notes.md"), "not an agent");

    // Act
    const scan = await scanAgentSources(dir);

    // Assert
    expect(scan.fileIds).toEqual(["ralph.a-bad", "ralph.good", "ralph.z-bad"]);
    expect(scan.sources.map((s) => s.fileId)).toEqual(["ralph.good"]);
    expect(scan.errors.map((e) => e.fileId)).toEqual(["ralph.a-bad", "ralph.z-bad"]);
    expect(scan.errors.every((e) => e instanceof AgentDefinitionError)).toBe(true);
  });

  it("throws when the directory does not exist", async () => {
    // Act & Assert
    await expect(scanAgentSources(join(dir, "missing"))).rejects.toThrow(/ENOENT/);
  });
});
