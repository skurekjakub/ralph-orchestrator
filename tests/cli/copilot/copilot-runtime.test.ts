import { describe, it, expect } from "vitest";
import { CopilotRuntime } from "../../../src/cli/copilot/copilot-runtime.js";
import { CliType } from "../../../src/config/types.js";

describe("CopilotRuntime", () => {
  it("describes the Copilot CLI", () => {
    // Act & Assert
    expect(new CopilotRuntime().cli).toBe(CliType.Copilot);
  });

  it("validates models as Copilot model ids", () => {
    // Arrange
    const runtime = new CopilotRuntime();

    // Act & Assert
    expect(runtime.models.validate("claude-opus-4.6")).toBeNull();
    expect(runtime.models.validate("opus")).not.toBeNull();
  });

  it("authenticates with GH_TOKEN", () => {
    // Act
    const envVars = new CopilotRuntime().credentials.required.map((c) => c.envVar);

    // Assert
    expect(envVars).toEqual(["GH_TOKEN"]);
  });

  it("keeps its writable directories and debug log under its config directory", () => {
    // Arrange
    const { layout } = new CopilotRuntime();

    // Act
    const paths = [...layout.writableDirs, layout.debugLog.path, layout.transcriptPath ?? ""];

    // Assert
    expect(paths.every((p) => p.startsWith(`${layout.configDir}/`))).toBe(true);
  });
});
