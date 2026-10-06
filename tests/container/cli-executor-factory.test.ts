import { describe, it, expect } from "vitest";
import { CliExecutorFactory } from "../../src/container/cli-executor-factory";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor";
import { LocalCopilotExecutor } from "../../src/container/cli-executors/local-copilot-executor";
import { makeConfig, makeProfile } from "../helpers/factories";
import { createMockCompose, createMockLogger } from "../helpers/mocks";

const { compose: mockCompose } = createMockCompose();
const mockLogger = createMockLogger();

describe("CliExecutorFactory", () => {
  it("creates a CopilotExecutor when GH_TOKEN is present", () => {
    const config = makeConfig();
    const factory = new CliExecutorFactory({ secrets: config.secrets });

    const executor = factory.create(mockCompose, makeProfile(), mockLogger);

    expect(executor).toBeInstanceOf(CopilotExecutor);
  });

  it("throws when GH_TOKEN is missing", () => {
    const factory = new CliExecutorFactory({ secrets: { ...makeConfig().secrets, ghToken: "" } });

    expect(() => factory.create(mockCompose, makeProfile(), mockLogger)).toThrowError(/GH_TOKEN is required/);
  });

  it("creates a LocalCopilotExecutor via createLocal when GH_TOKEN is present", () => {
    const config = makeConfig();
    const factory = new CliExecutorFactory({ secrets: config.secrets });

    const executor = factory.createLocal(makeProfile(), "/tmp/repo", mockLogger);

    expect(executor).toBeInstanceOf(LocalCopilotExecutor);
  });

  it("throws from createLocal when GH_TOKEN is missing", () => {
    const factory = new CliExecutorFactory({ secrets: { ...makeConfig().secrets, ghToken: "" } });

    expect(() => factory.createLocal(makeProfile(), "/tmp/repo", mockLogger)).toThrowError(/GH_TOKEN is required/);
  });
});
