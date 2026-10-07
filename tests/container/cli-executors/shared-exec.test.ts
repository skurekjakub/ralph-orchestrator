import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { ExecaError, type ResultPromise } from "execa";
import {
  executeCliCommand,
  killActiveProcess,
  type CliCommand,
} from "../../../src/container/cli-executors/shared-exec";
import { PlainTextDecoder } from "../../../src/cli/plain-text-decoder";
import { ClaudeStreamJsonDecoder } from "../../../src/cli/claude/stream-json-decoder";
import { createMockLogger, fakeCliProcess } from "../../helpers/mocks";

function makeExecaError(overrides: { exitCode?: number; stderr?: string; timedOut?: boolean } = {}): ExecaError {
  return Object.assign(Object.create(ExecaError.prototype) as ExecaError, {
    message: "Command failed",
    shortMessage: "Command failed",
    exitCode: overrides.exitCode ?? 1,
    stdout: "",
    stderr: overrides.stderr ?? "",
    timedOut: overrides.timedOut ?? false,
  });
}

/** A command that spawns `process`. */
function command(process: ResultPromise, overrides: Partial<CliCommand> = {}): CliCommand {
  return {
    spawn: () => process,
    logger: createMockLogger(),
    tag: "test",
    tracker: { activeProcess: null },
    decoder: new PlainTextDecoder(),
    ...overrides,
  };
}

describe("executeCliCommand", () => {
  it("returns the exit code, the captured output and the decoded agent text", async () => {
    // Arrange
    const cmd = command(fakeCliProcess("hello\nworld\n", { stderr: "note\n" }));

    // Act
    const result = await executeCliCommand(cmd);

    // Assert
    expect(result).toEqual({
      exitCode: 0,
      stdout: "hello\nworld\n",
      stderr: "note\n",
      timedOut: false,
      agentText: "hello\nworld",
    });
  });

  it("returns a non-zero exit with what the CLI printed, and warns with its stderr", async () => {
    // Arrange
    const error = makeExecaError({ exitCode: 42, stderr: "boom" });
    const cmd = command(fakeCliProcess("partial\n", { stderr: "boom", error }));

    // Act
    const result = await executeCliCommand(cmd);

    // Assert
    expect(result).toMatchObject({ exitCode: 42, stdout: "partial\n", stderr: "boom", agentText: "partial" });
    expect(cmd.logger.warn).toHaveBeenCalledWith(expect.stringContaining("CLI exited with code 42 — stderr: boom"));
  });

  it("reports a timeout", async () => {
    // Arrange
    const cmd = command(fakeCliProcess("", { error: makeExecaError({ timedOut: true }) }));

    // Act
    const result = await executeCliCommand(cmd);

    // Assert
    expect(result.timedOut).toBe(true);
  });

  it("returns an empty agent text when the process failed before any output was captured", async () => {
    // Arrange
    const cmd = command(fakeCliProcess(""), {
      spawn: () => {
        throw makeExecaError({ exitCode: 127 });
      },
    });

    // Act
    const result = await executeCliCommand(cmd);

    // Assert
    expect(result).toMatchObject({ exitCode: 127, agentText: "" });
  });

  it("rethrows errors that are not process failures", async () => {
    // Arrange
    const cmd = command(fakeCliProcess("", { error: new Error("network failure") }));

    // Act & Assert
    await expect(executeCliCommand(cmd)).rejects.toThrow("network failure");
  });

  it("clears the tracked process after success and after failure", async () => {
    // Arrange
    const ok = command(fakeCliProcess(""));
    const failed = command(fakeCliProcess("", { error: makeExecaError() }));

    // Act
    await executeCliCommand(ok);
    await executeCliCommand(failed);

    // Assert
    expect(ok.tracker.activeProcess).toBeNull();
    expect(failed.tracker.activeProcess).toBeNull();
  });

  describe("after the result block", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** A CLI process that never exits on its own; `kill` or `exit` ends it with `exitCode`. */
    function runningProcess(exitCode: number) {
      const out = new PassThrough();
      const err = new PassThrough();
      let resolveExit!: () => void;
      const settled = new Promise((resolve) => {
        resolveExit = () => resolve({ exitCode, stdout: "", stderr: "" });
      });
      const exit = (): boolean => {
        out.end();
        err.end();
        resolveExit();
        return true;
      };
      const kill = vi.fn(exit);
      const process = Object.assign(settled, { stdout: out, stderr: err, kill }) as unknown as ResultPromise;
      return { process, out, kill, exit };
    }

    it("terminates a CLI that is still running 10 s after printing the block", async () => {
      // Arrange
      const { process, out, kill } = runningProcess(143);
      out.write("===RALPH_RESULT_START===\nSTATUS: completed\n===RALPH_RESULT_END===\n");
      const pending = executeCliCommand(command(process));

      // Act
      await vi.advanceTimersByTimeAsync(10_000);

      // Assert
      expect(kill).toHaveBeenCalledWith("SIGTERM");
      await expect(pending).resolves.toMatchObject({ exitCode: 143 });
    });

    it("leaves Claude Code running after a result block in its text, until its own result event ends it", async () => {
      // Arrange
      const { process, out, kill, exit } = runningProcess(0);
      const text = "===RALPH_RESULT_START===\nSTATUS: completed\n===RALPH_RESULT_END===";
      out.write(
        JSON.stringify({
          type: "assistant",
          parent_tool_use_id: null,
          message: { content: [{ type: "text", text }] },
        }) + "\n",
      );
      const pending = executeCliCommand(command(process, { decoder: new ClaudeStreamJsonDecoder() }));

      // Act
      await vi.advanceTimersByTimeAsync(60_000);

      // Assert
      expect(kill).not.toHaveBeenCalled();
      exit();
      await expect(pending).resolves.toMatchObject({ exitCode: 0 });
    });

    it("leaves a CLI running whose text only quotes the end marker", async () => {
      // Arrange
      const { process, out, kill, exit } = runningProcess(0);
      out.write("I will finish with ===RALPH_RESULT_END=== once the docs are written.\n");
      const pending = executeCliCommand(command(process));

      // Act
      await vi.advanceTimersByTimeAsync(60_000);

      // Assert
      expect(kill).not.toHaveBeenCalled();
      exit();
      await expect(pending).resolves.toMatchObject({ exitCode: 0 });
    });
  });
});

describe("killActiveProcess", () => {
  it("sends SIGTERM when process exists", () => {
    // Arrange
    const mockProcess = { kill: vi.fn() } as unknown as ResultPromise;
    const tracker = { activeProcess: mockProcess };

    // Act
    killActiveProcess(tracker);

    // Assert
    expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(tracker.activeProcess).toBeNull();
  });

  it("is a no-op when activeProcess is null", () => {
    // Arrange
    const tracker = { activeProcess: null as ResultPromise | null };

    // Act
    killActiveProcess(tracker);

    // Assert
    expect(tracker.activeProcess).toBeNull();
  });

  it("handles already-terminated process gracefully", () => {
    // Arrange
    const mockProcess = {
      kill: vi.fn().mockImplementation(() => {
        throw new Error("Process already terminated");
      }),
    } as unknown as ResultPromise;
    const tracker = { activeProcess: mockProcess };

    // Act & Assert
    expect(() => killActiveProcess(tracker)).not.toThrow();
    expect(tracker.activeProcess).toBeNull();
  });
});
