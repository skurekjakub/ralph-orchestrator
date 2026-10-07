import { describe, it, expect } from "vitest";
import { classifyFailure, FailureCategory } from "../../src/logs/collector";
import { makeResult } from "../helpers/factories";
import { FailureReason, TaskStatus } from "../../src/container/types";

describe("classifyFailure", () => {
  it("classifies short run with no output as infra", () => {
    const result = makeResult("DOC-1", {
      status: TaskStatus.Error,
      exitCode: 1,
      durationMs: 11_000,
      stdout: "",
      stderr: "",
    });
    expect(classifyFailure(result)).toBe("infra");
  });

  it("classifies short run with minimal output as infra", () => {
    const result = makeResult("DOC-2", {
      status: TaskStatus.Error,
      exitCode: 1,
      durationMs: 30_000,
      stdout: "x".repeat(50),
      stderr: "",
    });
    expect(classifyFailure(result)).toBe("infra");
  });

  it("classifies long run with output as task failure", () => {
    const result = makeResult("DOC-3", {
      status: TaskStatus.Error,
      exitCode: 1,
      durationMs: 300_000,
      stdout: "Agent started processing...".repeat(20),
      stderr: "Error: could not find file xyz",
    });
    expect(classifyFailure(result)).toBe("task");
  });

  it("classifies timeout as timeout", () => {
    const result = makeResult("DOC-4", {
      status: TaskStatus.Error,
      exitCode: 1,
      durationMs: 7_200_000,
      stdout: "Agent timed out",
      stderr: "",
    });
    expect(classifyFailure(result)).toBe("timeout");
  });

  it("classifies long run with no output as unknown", () => {
    const result = makeResult("DOC-5", {
      status: TaskStatus.Error,
      exitCode: 1,
      durationMs: 300_000,
      stdout: "",
      stderr: "",
    });
    expect(classifyFailure(result)).toBe("unknown");
  });

  it.each([
    [FailureReason.MissingResultBlock, FailureCategory.Contract],
    [FailureReason.AuthFailed, FailureCategory.Infra],
    [FailureReason.CliError, FailureCategory.Infra],
    [FailureReason.MaxTurns, FailureCategory.Task],
  ])("classifies failure reason %s as %s, whatever the run's output and length", (failureReason, category) => {
    // Arrange
    const result = makeResult("DOC-7", {
      status: TaskStatus.Error,
      exitCode: 1,
      durationMs: 300_000,
      stdout: "Agent timed out ".repeat(20),
      failureReason,
    });

    // Act & Assert
    expect(classifyFailure(result)).toBe(category);
  });

  it.each([FailureReason.ExecutionError, FailureReason.ExitCode])(
    "classifies failure reason %s by the run's output and length",
    (failureReason) => {
      // Arrange
      const result = makeResult("DOC-8", {
        status: TaskStatus.Error,
        exitCode: 1,
        durationMs: 11_000,
        stdout: "",
        failureReason,
      });

      // Act & Assert
      expect(classifyFailure(result)).toBe(FailureCategory.Infra);
    },
  );

  it("returns unknown for completed runs", () => {
    const result = makeResult("DOC-6", {
      status: TaskStatus.Completed,
      exitCode: 0,
      durationMs: 300_000,
      stdout: "All done",
      stderr: "",
    });
    expect(classifyFailure(result)).toBe("unknown");
  });
});
