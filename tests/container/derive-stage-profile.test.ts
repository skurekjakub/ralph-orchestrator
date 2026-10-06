import { describe, it, expect } from "vitest";
import { deriveStageProfile } from "../../src/container/types.js";
import { StageMode } from "../../src/config/types.js";
import { makeProfile } from "../helpers/factories.js";

describe("deriveStageProfile", () => {
  const base = makeProfile({
    id: "ralph-docs",
    agentName: "ralph.writer",
    model: "base-model",
    timeoutMs: 600000,
    skills: ["skill-a", "skill-b"],
    mcpServers: ["ado", "playwright"],
    repoPath: "/home/user/repos/docs",
  });

  it("overrides agentName and displayName from stage", () => {
    const stage = { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.agentName).toBe("ralph.reviewer");
    expect(derived.displayName).toBe("reviewer");
  });

  it("strips ralph. prefix for displayName", () => {
    const stage = { agent: "ralph.editor", role: "editor", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.displayName).toBe("editor");
  });

  it("preserves displayName when agent has no ralph. prefix", () => {
    const stage = { agent: "custom-agent", role: "custom", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.displayName).toBe("custom-agent");
  });

  it("overrides model from stage when provided", () => {
    const stage = {
      agent: "ralph.reviewer",
      role: "reviewer",
      mode: StageMode.Container,
      skills: [],
      model: "stage-model",
    };
    const derived = deriveStageProfile(base, stage);
    expect(derived.model).toBe("stage-model");
  });

  it("falls back to profile model when stage model is undefined", () => {
    const stage = { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.model).toBe("base-model");
  });

  it("overrides timeoutMs from stage when provided", () => {
    const stage = {
      agent: "ralph.reviewer",
      role: "reviewer",
      mode: StageMode.Container,
      skills: [],
      timeoutMs: 120000,
    };
    const derived = deriveStageProfile(base, stage);
    expect(derived.timeoutMs).toBe(120000);
  });

  it("falls back to profile timeoutMs when stage timeout is undefined", () => {
    const stage = { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.timeoutMs).toBe(600000);
  });

  it("replaces skills with stage-specific skills", () => {
    const stage = { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: ["review-skill"] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.skills).toEqual(["review-skill"]);
  });

  it("uses empty skills when stage has no skills", () => {
    const stage = { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.skills).toEqual([]);
  });

  it("preserves non-stage profile fields", () => {
    const stage = { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] };
    const derived = deriveStageProfile(base, stage);
    expect(derived.id).toBe("ralph-docs");
    expect(derived.repoPath).toBe("/home/user/repos/docs");
    expect(derived.mcpServers).toEqual(["ado", "playwright"]);
    expect(derived.composeFile).toBe(base.composeFile);
    expect(derived.cli).toBe(base.cli);
    expect(derived.variantKey).toBe(base.variantKey);
  });
});
