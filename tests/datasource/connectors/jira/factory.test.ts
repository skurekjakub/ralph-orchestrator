import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createJiraDataSource } from "../../../../src/datasource/connectors/jira/factory";
import type { DataSourceCradle } from "../../../../src/awilix-cradle-types";
import type { IAgentProfile, IDataSourceConfig } from "../../../../src/config/types";
import { makeDataSourceConfig, makeIssue, makeProfile } from "../../../helpers/factories";

const JIRA_ENV_KEYS = ["JIRA_PAT_TEST_SOURCE", "JIRA_EMAIL_TEST_SOURCE"];
const savedEnv: Record<string, string | undefined> = {};

/** The data-source scope of the `test-source` entry, opened on a root cradle holding `profiles`. */
function sourceScope(
  dataSourceConfig: IDataSourceConfig,
  profiles: readonly IAgentProfile[] = [makeProfile()],
): AwilixContainer<DataSourceCradle> {
  const root = createContainer<DataSourceCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  root.register({ profiles: asValue(profiles) });
  const scope = root.createScope();
  scope.register({ sourceKey: asValue("test-source"), dataSourceConfig: asValue(dataSourceConfig) });
  return scope;
}

/** Stub `fetch` with a JIRA search page holding one issue. */
function stubJiraSearch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ issues: [makeIssue("DF-1")], isLast: true }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createJiraDataSource", () => {
  beforeEach(() => {
    for (const k of JIRA_ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.JIRA_PAT_TEST_SOURCE = "env-jira-pat";
    process.env.JIRA_EMAIL_TEST_SOURCE = "jira-user@example.com";
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("throws the credential error when the source's JIRA credentials are unset", () => {
    // Arrange
    delete process.env.JIRA_PAT_TEST_SOURCE;
    delete process.env.JIRA_EMAIL_TEST_SOURCE;

    // Act & Assert
    expect(() => createJiraDataSource(sourceScope(makeDataSourceConfig()))).toThrow(
      new Error('JIRA_PAT_TEST_SOURCE and JIRA_EMAIL_TEST_SOURCE must be set in .env for data source "test-source"'),
    );
  });

  it("rejects a connection whose baseUrl is not a URL", () => {
    // Arrange
    const dataSourceConfig = makeDataSourceConfig({ connection: { baseUrl: "not-a-url", cloudId: "abc" } });

    // Act & Assert
    expect(() => createJiraDataSource(sourceScope(dataSourceConfig))).toThrow("baseUrl");
  });

  it("binds the connector and poller to the source key and the connection's allowed users", () => {
    // Arrange
    const dataSourceConfig = makeDataSourceConfig({
      connection: { baseUrl: "https://api.atlassian.com/ex/jira", cloudId: "c-1", allowedUsers: ["acc-1"] },
    });

    // Act
    const { connector, poller } = createJiraDataSource(sourceScope(dataSourceConfig));

    // Assert
    expect(connector.sourceKey).toBe("test-source");
    expect(poller.sourceKey).toBe("test-source");
    expect(connector.getAllowedUsers()).toEqual(["acc-1"]);
  });

  it("authenticates with the source's credentials from the environment", async () => {
    // Arrange
    const fetchMock = stubJiraSearch();
    const { connector } = createJiraDataSource(sourceScope(makeDataSourceConfig()));

    // Act
    await connector.searchWorkItems('project = "DF"');

    // Assert
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("jira-user@example.com:env-jira-pat").toString("base64")}`);
  });

  it("polls only the projects of the profiles bound to its source", async () => {
    // Arrange
    const fetchMock = stubJiraSearch();
    const profiles = [
      makeProfile({ match: { projects: ["DF"] } }),
      makeProfile({ id: "elsewhere", dataSource: "other-source", match: { projects: ["XX"] } }),
    ];
    const { poller } = createJiraDataSource(sourceScope(makeDataSourceConfig(), profiles));
    const polled = new Promise<void>((resolve) => poller.onItems(resolve));

    // Act
    poller.start();
    await polled;
    poller.stop();

    // Assert
    const jqls = fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams.get("jql"));
    expect(jqls).toEqual(['project = "DF" ORDER BY created ASC']);
  });

  it("polls again after the source's poll interval", async () => {
    // Arrange
    vi.useFakeTimers();
    const fetchMock = stubJiraSearch();
    const { poller } = createJiraDataSource(sourceScope(makeDataSourceConfig({ pollIntervalMs: 5_000 })));
    poller.start();
    await vi.advanceTimersByTimeAsync(4_999);
    const callsBeforeInterval = fetchMock.mock.calls.length;

    // Act
    await vi.advanceTimersByTimeAsync(1);
    poller.stop();

    // Assert
    expect(callsBeforeInterval).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
