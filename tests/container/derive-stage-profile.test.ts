import { describe, it, expect } from "vitest";
import { deriveStageProfile } from "../../src/container/types";
import { CliType } from "../../src/config/types";
import { makeProfile, makeStage } from "../helpers/factories";

describe("deriveStageProfile", () => {
  const base = makeProfile({
    id: "ralph-docs",
    agentName: "ralph.writer",
    model: "base-model",
    timeoutMs: 600000,
    skills: ["skill-a", "skill-b"],
    mcpServers: ["ado", "playwright"],
    repoUrl: "https://dev.azure.com/org/project/_git/docs",
  });

  it("overrides agentName and displayName from stage", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.agentName).toBe("ralph.reviewer");
    expect(derived.displayName).toBe("reviewer");
  });

  it("strips ralph. prefix for displayName", () => {
    const stage = makeStage({ agent: "ralph.editor", role: "editor" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.displayName).toBe("editor");
  });

  it("preserves displayName when agent has no ralph. prefix", () => {
    const stage = makeStage({ agent: "custom-agent", role: "custom" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.displayName).toBe("custom-agent");
  });

  it("overrides model from stage when provided", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer", model: "stage-model" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.model).toBe("stage-model");
  });

  it("falls back to profile model when stage model is undefined", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.model).toBe("base-model");
  });

  it("overrides timeoutMs from stage when provided", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer", timeoutMs: 120000 });
    const derived = deriveStageProfile(base, stage);
    expect(derived.timeoutMs).toBe(120000);
  });

  it("falls back to profile timeoutMs when stage timeout is undefined", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.timeoutMs).toBe(600000);
  });

  it("replaces skills with stage-specific skills", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer", skills: ["review-skill"] });
    const derived = deriveStageProfile(base, stage);
    expect(derived.skills).toEqual(["review-skill"]);
  });

  it("uses empty skills when stage has no skills", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.skills).toEqual([]);
  });

  it("runs the stage's cli", () => {
    // Arrange
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer", cli: CliType.Claude });

    // Act
    const derived = deriveStageProfile(base, stage);

    // Assert
    expect(derived.cli).toBe(CliType.Claude);
    expect(base.cli).toBe(CliType.Copilot);
  });

  it("preserves non-stage profile fields", () => {
    const stage = makeStage({ agent: "ralph.reviewer", role: "reviewer" });
    const derived = deriveStageProfile(base, stage);
    expect(derived.id).toBe("ralph-docs");
    expect(derived.repoUrl).toBe("https://dev.azure.com/org/project/_git/docs");
    expect(derived.mcpServers).toEqual(["ado", "playwright"]);
    expect(derived.composeFile).toBe(base.composeFile);
    expect(derived.variantKey).toBe(base.variantKey);
  });
});
