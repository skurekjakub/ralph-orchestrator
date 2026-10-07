import { describe, expect, it } from "vitest";
import { describeFailure } from "../../src/container/failure-message";
import { FailureReason, TaskStatus } from "../../src/container/types";
import { makeResult } from "../helpers/factories";

describe("describeFailure", () => {
  const failed = { status: TaskStatus.Error, exitCode: 1 };

  it.each([
    [
      FailureReason.AuthFailed,
      { subtype: "authentication_failed", message: "Not logged in · Please run /login" },
      "The agent CLI could not authenticate: Not logged in · Please run /login",
    ],
    [FailureReason.MaxTurns, { subtype: "error_max_turns" }, "The agent CLI stopped at its turn limit"],
    [
      FailureReason.ExecutionError,
      { subtype: "error_during_execution", message: "tool crashed" },
      "The agent CLI failed while it ran: tool crashed",
    ],
    [
      FailureReason.CliError,
      { subtype: "rate_limit", message: "slow down" },
      "The agent CLI reported an error (rate_limit): slow down",
    ],
  ])("describes %s with the CLI's own message", (failureReason, cliError, expected) => {
    // Act & Assert
    expect(describeFailure(makeResult("DF-1", { ...failed, failureReason, cliError, stderr: "noise" }))).toBe(expected);
  });

  it("explains a missing result block in plain words", () => {
    // Act
    const description = describeFailure(
      makeResult("DF-1", { ...failed, exitCode: 0, failureReason: FailureReason.MissingResultBlock }),
    );

    // Assert
    expect(description).toContain("finished without the ===RALPH_RESULT_START===");
  });

  it("cuts a long CLI message", () => {
    // Arrange
    const cliError = { subtype: "rate_limit", message: "x".repeat(800) };

    // Act
    const description = describeFailure(
      makeResult("DF-1", { ...failed, failureReason: FailureReason.CliError, cliError }),
    );

    // Assert
    expect(description).toBe(`The agent CLI reported an error (rate_limit): ${"x".repeat(500)}…`);
  });

  it.each([
    ["stderr", "No such agent: ralph", "No such agent: ralph"],
    ["the exit code when stderr is empty", "", "The agent CLI exited with code 1"],
  ])("describes a non-zero exit by %s", (_label, stderr, expected) => {
    // Act & Assert
    expect(describeFailure(makeResult("DF-1", { ...failed, failureReason: FailureReason.ExitCode, stderr }))).toBe(
      expected,
    );
  });

  it.each([
    ["stderr", "Missing required context", "Missing required context"],
    ["the status when stderr is empty", "", "Agent finished with status: blocked"],
  ])("describes a result without a failure reason by %s", (_label, stderr, expected) => {
    // Act & Assert
    expect(describeFailure(makeResult("DF-1", { status: TaskStatus.Blocked, stderr }))).toBe(expected);
  });
});
