import { describe, it, expect } from "vitest";
import { configFileSchema, stageSchema } from "../../src/config/schemas";
import { ClaudeAuthMode, CliType, ReasoningEffort } from "../../src/config/types";

const BASE_STAGE = { agent: "ralph.ralph", role: "primary" };

describe("stageSchema", () => {
  it("accepts the Claude Code stage options", () => {
    // Act
    const stage = stageSchema.parse({
      ...BASE_STAGE,
      cli: "claude",
      effort: "xhigh",
      maxBudgetUsd: 5,
      requireResultBlock: false,
    });

    // Assert
    expect(stage.cli).toBe(CliType.Claude);
    expect(stage.effort).toBe(ReasoningEffort.XHigh);
    expect(stage.maxBudgetUsd).toBe(5);
    expect(stage.requireResultBlock).toBe(false);
  });

  it("leaves cli unset so the profile cli applies", () => {
    // Act & Assert
    expect(stageSchema.parse(BASE_STAGE).cli).toBeUndefined();
  });

  it("rejects an unknown cli", () => {
    // Act
    const result = stageSchema.safeParse({ ...BASE_STAGE, cli: "gemini" });

    // Assert
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["cli"]);
  });

  it("rejects an unknown effort", () => {
    // Act
    const result = stageSchema.safeParse({ ...BASE_STAGE, effort: "extreme" });

    // Assert
    expect(result.error?.issues[0].path).toEqual(["effort"]);
  });

  it.each([0, -1])("rejects maxBudgetUsd %d", (maxBudgetUsd) => {
    // Act
    const result = stageSchema.safeParse({ ...BASE_STAGE, maxBudgetUsd });

    // Assert
    expect(result.error?.issues[0].path).toEqual(["maxBudgetUsd"]);
  });

  it("explains a missing agent name", () => {
    // Act
    const result = stageSchema.safeParse({ role: "primary" });

    // Assert
    expect(result.error?.issues[0].message).toBe("agent name is required");
  });
});

describe("configFileSchema", () => {
  const BASE_CONFIG = { dataSources: { jira: { type: "jira", connection: {} } } };

  it("defaults claudeAuth to the OAuth token", () => {
    // Act & Assert
    expect(configFileSchema.parse(BASE_CONFIG).claudeAuth).toBe(ClaudeAuthMode.OAuthToken);
  });

  it("accepts the API key auth mode", () => {
    // Act & Assert
    expect(configFileSchema.parse({ ...BASE_CONFIG, claudeAuth: "api-key" }).claudeAuth).toBe(ClaudeAuthMode.ApiKey);
  });

  it("rejects an unknown claudeAuth", () => {
    // Act
    const result = configFileSchema.safeParse({ ...BASE_CONFIG, claudeAuth: "password" });

    // Assert
    expect(result.error?.issues[0].path).toEqual(["claudeAuth"]);
  });
});
