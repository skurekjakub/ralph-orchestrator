import { describe, it, expect } from "vitest";
import { CliRuntimeRegistry, CliDebugLogKind, type ICliRuntime } from "../../src/cli/cli-runtime.js";
import { CLAUDE_MODEL_POLICY, COPILOT_MODEL_POLICY } from "../../src/cli/model-catalog.js";
import { CliType } from "../../src/config/types.js";

/** A runtime whose layout paths are tagged with the CLI name, so tests can tell runtimes apart. */
function fakeRuntime(cli: CliType): ICliRuntime {
  return {
    cli,
    layout: {
      configDir: `/cfg/${cli}`,
      writableDirs: [],
      agentsDir: `/agents/${cli}`,
      skillsDir: `/skills/${cli}`,
      debugLog: { kind: CliDebugLogKind.File, path: `/log/${cli}` },
      transcriptPath: null,
    },
    models: cli === CliType.Claude ? CLAUDE_MODEL_POLICY : COPILOT_MODEL_POLICY,
    credentials: { required: [] },
  };
}

describe("CliRuntimeRegistry", () => {
  describe("get", () => {
    it("returns the runtime registered for the CLI", () => {
      // Arrange
      const claude = fakeRuntime(CliType.Claude);
      const copilot = fakeRuntime(CliType.Copilot);
      const registry = new CliRuntimeRegistry({ runtimes: [claude, copilot] });

      // Act & Assert
      expect(registry.get(CliType.Copilot)).toBe(copilot);
    });

    it("throws for a CLI without a registered runtime", () => {
      // Arrange
      const registry = new CliRuntimeRegistry({ runtimes: [fakeRuntime(CliType.Copilot)] });

      // Act & Assert
      expect(() => registry.get(CliType.Claude)).toThrow('No CLI runtime registered for cli "claude"');
    });
  });

  describe("forClis", () => {
    it("returns each requested runtime once, in registration order", () => {
      // Arrange
      const claude = fakeRuntime(CliType.Claude);
      const copilot = fakeRuntime(CliType.Copilot);
      const registry = new CliRuntimeRegistry({ runtimes: [claude, copilot] });

      // Act
      const runtimes = registry.forClis([CliType.Copilot, CliType.Claude, CliType.Copilot]);

      // Assert
      expect(runtimes).toEqual([claude, copilot]);
    });

    it("returns no runtimes for no CLIs", () => {
      // Arrange
      const registry = new CliRuntimeRegistry({ runtimes: [fakeRuntime(CliType.Copilot)] });

      // Act & Assert
      expect(registry.forClis([])).toEqual([]);
    });

    it("throws when a requested CLI has no registered runtime", () => {
      // Arrange
      const registry = new CliRuntimeRegistry({ runtimes: [fakeRuntime(CliType.Copilot)] });

      // Act & Assert
      expect(() => registry.forClis([CliType.Copilot, CliType.Claude])).toThrow(
        'No CLI runtime registered for cli "claude"',
      );
    });
  });

  it("rejects two runtimes for the same CLI", () => {
    // Act & Assert
    expect(
      () => new CliRuntimeRegistry({ runtimes: [fakeRuntime(CliType.Copilot), fakeRuntime(CliType.Copilot)] }),
    ).toThrow('Two CLI runtimes registered for cli "copilot"');
  });
});
