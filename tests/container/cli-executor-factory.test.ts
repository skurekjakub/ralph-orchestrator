import { describe, it, expect } from "vitest";
import { CliExecutorFactory } from "../../src/container/cli-executor-factory.js";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor.js";
import { makeConfig, makeProfile } from "../helpers/factories.js";
import { createMockCompose, createMockLogger } from "../helpers/mocks.js";

const { compose: mockCompose } = createMockCompose();
const mockLogger = createMockLogger();

describe("CliExecutorFactory", () => {
  it("creates a CopilotExecutor when GH_TOKEN is present", () => {
    const config = makeConfig();
    const factory = new CliExecutorFactory(config);

    const executor = factory.create(mockCompose, makeProfile(), mockLogger);

    expect(executor).toBeInstanceOf(CopilotExecutor);
  });

  it("throws when GH_TOKEN is missing", () => {
    const config = makeConfig();
    config.secrets.ghToken = "";
    const factory = new CliExecutorFactory(config);

    expect(() => factory.create(mockCompose, makeProfile(), mockLogger)).toThrowError(
      /GH_TOKEN is required/,
    );
  });
});
