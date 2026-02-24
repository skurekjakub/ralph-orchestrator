import { describe, it, expect } from "vitest";
import { OrchestratorComments } from "../../src/services/orchestrator-comments.js";
import { TransitionPhase } from "../../src/orchestrator-types.js";

describe("OrchestratorComments", () => {
  it("ack includes the agent display name", () => {
    const msg = OrchestratorComments.ack("ralph");
    expect(msg).toContain("[Ralph-Orchestrator]");
    expect(msg).toContain("ralph");
    expect(msg).toContain("Queueing");
  });

  it("ack appends trigger params when provided", () => {
    const msg = OrchestratorComments.ack("ralph", ["codesamples", "branch=xyz"]);
    expect(msg).toContain("Queueing ralph");
    expect(msg).toContain("\nParams: codesamples, branch=xyz");
  });

  it("ack omits params line when array is empty", () => {
    const msg = OrchestratorComments.ack("ralph", []);
    expect(msg).not.toContain("Params:");
  });

  it("ack omits params line when undefined", () => {
    const msg = OrchestratorComments.ack("ralph");
    expect(msg).not.toContain("Params:");
  });

  it("start includes display name and profile ID", () => {
    const msg = OrchestratorComments.start("ralph", "ralph-docs");
    expect(msg).toContain("ralph");
    expect(msg).toContain("ralph-docs");
    expect(msg).toContain("starting work");
  });

  it("crashRecovery includes display name and retry guidance", () => {
    const msg = OrchestratorComments.crashRecovery("ralph");
    expect(msg).toContain("ralph");
    expect(msg).toContain("crashed");
    expect(msg).toContain("Re-trigger");
  });

  it("staleStatus includes current status", () => {
    const msg = OrchestratorComments.staleStatus("ralph", "Done");
    expect(msg).toContain("Done");
    expect(msg).toContain("status changed");
  });

  it("transitionFailed includes phase, target status, and error", () => {
    const msg = OrchestratorComments.transitionFailed(
      TransitionPhase.BeforeAgent, "In Progress", "No matching transition",
    );
    expect(msg).toContain("beforeAgent");
    expect(msg).toContain("In Progress");
    expect(msg).toContain("No matching transition");
  });

  it("error includes the error message and retry guidance", () => {
    const msg = OrchestratorComments.error("Agent timed out after 30m");
    expect(msg).toContain("Agent timed out after 30m");
    expect(msg).toContain("Re-trigger");
    expect(msg).toContain("[Ralph-Orchestrator]");
  });

  it("all comments are prefixed with [Ralph-Orchestrator]", () => {
    const comments = [
      OrchestratorComments.ack("r"),
      OrchestratorComments.start("r", "p"),
      OrchestratorComments.crashRecovery("r"),
      OrchestratorComments.staleStatus("r", "s"),
      OrchestratorComments.transitionFailed(TransitionPhase.AfterAgent, "s", "e"),
      OrchestratorComments.error("e"),
    ];
    for (const msg of comments) {
      expect(msg).toContain("[Ralph-Orchestrator]");
    }
  });
});
