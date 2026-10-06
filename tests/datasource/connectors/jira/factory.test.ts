import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createJiraDataSource } from "../../../../src/datasource/connectors/jira/factory.js";
import { makeDataSourceConfig, makeProfile } from "../../../helpers/factories.js";

const JIRA_ENV_KEYS = ["JIRA_PAT_TEST_SOURCE", "JIRA_EMAIL_TEST_SOURCE"];
const savedEnv: Record<string, string | undefined> = {};

describe("createJiraDataSource", () => {
  beforeEach(() => {
    for (const k of JIRA_ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.JIRA_PAT_TEST_SOURCE = "test-jira-pat";
    process.env.JIRA_EMAIL_TEST_SOURCE = "test@test.com";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("throws when JIRA credentials are missing from environment", () => {
    delete process.env.JIRA_PAT_TEST_SOURCE;
    delete process.env.JIRA_EMAIL_TEST_SOURCE;
    const ds = makeDataSourceConfig();

    expect(() => createJiraDataSource("test-source", ds, [makeProfile()])).toThrow("JIRA_PAT_TEST_SOURCE");
  });

  it("rejects invalid baseUrl in connection config", () => {
    const ds = makeDataSourceConfig({
      connection: { baseUrl: "not-a-url", cloudId: "abc" },
    });

    expect(() => createJiraDataSource("test-source", ds, [makeProfile()])).toThrow("baseUrl");
  });

  it("creates connector and poller with valid config and credentials", () => {
    const ds = makeDataSourceConfig();

    const { connector, poller } = createJiraDataSource("test-source", ds, [makeProfile()]);

    expect(connector).toBeDefined();
    expect(poller).toBeDefined();
  });
});
