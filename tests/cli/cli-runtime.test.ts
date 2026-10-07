import { describe, it, expect } from "vitest";
import { CliRuntimeRegistry, mergeComposeContributions } from "../../src/cli/cli-runtime";
import { CliType } from "../../src/config/types";
import { createMockCliRuntime } from "../helpers/mocks";

describe("mergeComposeContributions", () => {
  it("lists each volume once, in order, and merges the environments", () => {
    // Arrange
    const claude = { volumes: ["/a:/x:ro", "/b:/y:ro"], env: { A: "1" } };
    const copilot = { volumes: ["/b:/y:ro", "/c:/z:ro"], env: { B: "2" } };

    // Act
    const merged = mergeComposeContributions([claude, copilot]);

    // Assert
    expect(merged).toEqual({ volumes: ["/a:/x:ro", "/b:/y:ro", "/c:/z:ro"], env: { A: "1", B: "2" } });
  });

  it("throws when two contributions set the same environment variable", () => {
    // Arrange
    const claude = { volumes: [], env: { SHARED: "1" } };
    const copilot = { volumes: [], env: { SHARED: "1" } };

    // Act & Assert
    expect(() => mergeComposeContributions([claude, copilot])).toThrow(
      "Two agent CLIs set the container environment variable SHARED",
    );
  });

  it("is empty for no contributions", () => {
    // Act & Assert
    expect(mergeComposeContributions([])).toEqual({ volumes: [], env: {} });
  });
});

describe("CliRuntimeRegistry", () => {
  describe("get", () => {
    it("returns the runtime registered for the CLI", () => {
      // Arrange
      const claude = createMockCliRuntime(CliType.Claude);
      const copilot = createMockCliRuntime(CliType.Copilot);
      const registry = new CliRuntimeRegistry({ runtimes: [claude, copilot] });

      // Act & Assert
      expect(registry.get(CliType.Copilot)).toBe(copilot);
    });

    it("throws for a CLI without a registered runtime", () => {
      // Arrange
      const registry = new CliRuntimeRegistry({ runtimes: [createMockCliRuntime(CliType.Copilot)] });

      // Act & Assert
      expect(() => registry.get(CliType.Claude)).toThrow('No CLI runtime registered for cli "claude"');
    });
  });

  describe("forClis", () => {
    it("returns each requested runtime once, in registration order", () => {
      // Arrange
      const claude = createMockCliRuntime(CliType.Claude);
      const copilot = createMockCliRuntime(CliType.Copilot);
      const registry = new CliRuntimeRegistry({ runtimes: [claude, copilot] });

      // Act
      const runtimes = registry.forClis([CliType.Copilot, CliType.Claude, CliType.Copilot]);

      // Assert
      expect(runtimes).toEqual([claude, copilot]);
    });

    it("returns no runtimes for no CLIs", () => {
      // Arrange
      const registry = new CliRuntimeRegistry({ runtimes: [createMockCliRuntime(CliType.Copilot)] });

      // Act & Assert
      expect(registry.forClis([])).toEqual([]);
    });

    it("throws when a requested CLI has no registered runtime", () => {
      // Arrange
      const registry = new CliRuntimeRegistry({ runtimes: [createMockCliRuntime(CliType.Copilot)] });

      // Act & Assert
      expect(() => registry.forClis([CliType.Copilot, CliType.Claude])).toThrow(
        'No CLI runtime registered for cli "claude"',
      );
    });
  });

  it("rejects two runtimes for the same CLI", () => {
    // Act & Assert
    expect(
      () =>
        new CliRuntimeRegistry({
          runtimes: [createMockCliRuntime(CliType.Copilot), createMockCliRuntime(CliType.Copilot)],
        }),
    ).toThrow('Two CLI runtimes registered for cli "copilot"');
  });
});
