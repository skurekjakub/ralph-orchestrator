/**
 * Multi-source integration tests.
 *
 * Verifies that the data source registry correctly builds connectors and pollers
 * from config entries with different types, and that profiles are routed
 * to the correct data source by key.
 */
import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { describe, it, expect } from "vitest";
import { registerDataSourceFactory, buildDataSourceMaps, type DataSourceFactory } from "../../src/datasource/registry";
import { makeConfig, makeProfile, makeDataSourceConfig, makeWorkItem } from "../helpers/factories";
import type { IDataSourceConnector } from "../../src/datasource/connector";
import type { IWorkItemPoller } from "../../src/datasource/poller";
import type { WorkItem, WorkItemComment } from "../../src/datasource/types";
import type { IAppConfig, IDataSourceConfig, IAgentProfile } from "../../src/config/types";
import type { OrchestratorCradle } from "../../src/awilix-cradle-types";

// ── Minimal stub connector + poller for test factories ────────────────────────

class StubConnector implements IDataSourceConnector {
  readonly name: string;
  readonly sourceKey: string;
  readonly items: WorkItem[];

  constructor(sourceKey: string, name: string, items: WorkItem[] = []) {
    this.sourceKey = sourceKey;
    this.name = name;
    this.items = items;
  }

  getAllowedUsers() {
    return [];
  }
  buildQueries() {
    return ["stub-query"];
  }
  async searchWorkItems() {
    return this.items;
  }
  async refreshWorkItem(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error(`Not found: ${id}`);
    return item;
  }
  isValidItemId() {
    return true;
  }
  async getComments(): Promise<WorkItemComment[]> {
    return [];
  }
  async addComment() {}
}

class StubPoller implements IWorkItemPoller {
  readonly sourceKey: string;
  private items: WorkItem[];
  private callback?: () => void;

  constructor(sourceKey: string, items: WorkItem[] = []) {
    this.sourceKey = sourceKey;
    this.items = items;
  }

  start() {
    this.callback?.();
  }
  stop() {}
  onItems(cb: () => void) {
    this.callback = cb;
  }
  drain() {
    const out = [...this.items];
    this.items = [];
    return out;
  }
}

// ── Registry cleanup helper ──────────────────────────────────────────────────

/**
 * The registry is module-level state. To avoid pollution between tests,
 * we register test-specific types with unique names per test.
 */
let testCounter = 0;
function uniqueType(base: string): string {
  return `${base}-${++testCounter}`;
}

/** A root container holding the config's profiles, the only root token the stub factories read. */
function rootFor(config: IAppConfig): AwilixContainer<OrchestratorCradle> {
  const root = createContainer<OrchestratorCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  root.register({ profiles: asValue(config.profiles) });
  return root;
}

/** A factory building stub connectors named `name` for the scope's source key. */
function stubFactory(name: string, items: (sourceKey: string) => WorkItem[] = () => []): DataSourceFactory {
  return (scope) => {
    const { sourceKey } = scope.cradle;
    return { connector: new StubConnector(sourceKey, name), poller: new StubPoller(sourceKey, items(sourceKey)) };
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Multi-source integration", () => {
  describe("buildDataSourceMaps", () => {
    it("creates separate connector and poller per data source entry", () => {
      // Arrange
      const typeA = uniqueType("source-a");
      const typeB = uniqueType("source-b");
      registerDataSourceFactory(typeA, stubFactory("Source A"));
      registerDataSourceFactory(typeB, stubFactory("Source B"));
      const config = {
        ...makeConfig([makeProfile({ dataSource: "first" }), makeProfile({ dataSource: "second" })]),
        dataSources: {
          first: { ...makeDataSourceConfig(), type: typeA },
          second: { ...makeDataSourceConfig(), type: typeB },
        },
      };

      // Act
      const { connectors, pollers } = buildDataSourceMaps(rootFor(config), config);

      // Assert
      expect(connectors.size).toBe(2);
      expect(pollers.size).toBe(2);
      expect(connectors.get("first")!.name).toBe("Source A");
      expect(connectors.get("first")!.sourceKey).toBe("first");
      expect(connectors.get("second")!.name).toBe("Source B");
      expect(connectors.get("second")!.sourceKey).toBe("second");
      expect(pollers.get("first")!.sourceKey).toBe("first");
      expect(pollers.get("second")!.sourceKey).toBe("second");
    });

    it("gives each factory a scope holding its entry's key and config over the root cradle", () => {
      // Arrange
      const type = uniqueType("config-test");
      const received: { key: string; ds: IDataSourceConfig; profiles: readonly IAgentProfile[] }[] = [];
      registerDataSourceFactory(type, (scope) => {
        const { sourceKey, dataSourceConfig, profiles } = scope.cradle;
        received.push({ key: sourceKey, ds: dataSourceConfig, profiles });
        return { connector: new StubConnector(sourceKey, "Test"), poller: new StubPoller(sourceKey) };
      });
      const dsConfig = { ...makeDataSourceConfig(), type };
      const config = {
        ...makeConfig([makeProfile({ dataSource: "my-source" })]),
        dataSources: { "my-source": dsConfig },
      };

      // Act
      buildDataSourceMaps(rootFor(config), config);

      // Assert
      expect(received).toHaveLength(1);
      expect(received[0]!.key).toBe("my-source");
      expect(received[0]!.ds).toBe(dsConfig);
      expect(received[0]!.profiles).toBe(config.profiles);
    });

    it("builds each entry's scoped services in a scope of its own", () => {
      // Arrange
      const type = uniqueType("scoped");
      registerDataSourceFactory(type, (scope) => {
        const sourceScope = scope.register({
          connector: asFunction(
            ({ sourceKey }: { sourceKey: string }) => new StubConnector(sourceKey, "Scoped"),
          ).scoped(),
        });
        const { connector, sourceKey } = sourceScope.cradle;
        return { connector, poller: new StubPoller(sourceKey) };
      });
      const config = {
        ...makeConfig(),
        dataSources: { a: { ...makeDataSourceConfig(), type }, b: { ...makeDataSourceConfig(), type } },
      };

      // Act
      const { connectors } = buildDataSourceMaps(rootFor(config), config);

      // Assert
      expect(connectors.get("a")!.sourceKey).toBe("a");
      expect(connectors.get("b")!.sourceKey).toBe("b");
    });

    it("throws when no factory registered for data source type", () => {
      // Arrange
      const config = {
        ...makeConfig(),
        dataSources: { unknown: { ...makeDataSourceConfig(), type: "nonexistent-type" } },
      };

      // Act & Assert
      expect(() => buildDataSourceMaps(rootFor(config), config)).toThrow(
        /No factory registered for data source type "nonexistent-type"/,
      );
    });

    it("throws on duplicate factory registration", () => {
      // Arrange
      const type = uniqueType("dupe-test");
      const factory = stubFactory("Test");
      registerDataSourceFactory(type, factory);

      // Act & Assert
      expect(() => registerDataSourceFactory(type, factory)).toThrow(/already registered/);
    });
  });

  describe("profile routing by data source key", () => {
    it("each profile references the correct data source", () => {
      // Arrange
      const typeA = uniqueType("route-a");
      const typeB = uniqueType("route-b");
      registerDataSourceFactory(typeA, stubFactory("JIRA"));
      registerDataSourceFactory(typeB, stubFactory("GitHub"));
      const profileA = makeProfile({ id: "docs", dataSource: "jira-prod" });
      const profileB = makeProfile({ id: "vscode", dataSource: "github-prod" });
      const config = {
        ...makeConfig([profileA, profileB]),
        dataSources: {
          "jira-prod": { ...makeDataSourceConfig(), type: typeA },
          "github-prod": { ...makeDataSourceConfig(), type: typeB },
        },
      };

      // Act
      const { connectors } = buildDataSourceMaps(rootFor(config), config);

      // Assert
      expect(connectors.get(profileA.dataSource)!.name).toBe("JIRA");
      expect(connectors.get(profileB.dataSource)!.name).toBe("GitHub");
    });

    it("multiple profiles can share one data source", () => {
      // Arrange
      const type = uniqueType("shared-ds");
      registerDataSourceFactory(type, stubFactory("Shared"));
      const config = {
        ...makeConfig([
          makeProfile({ id: "docs", dataSource: "shared" }),
          makeProfile({ id: "vscode", dataSource: "shared" }),
        ]),
        dataSources: { shared: { ...makeDataSourceConfig(), type } },
      };

      // Act
      const { connectors, pollers } = buildDataSourceMaps(rootFor(config), config);

      // Assert
      expect(connectors.size).toBe(1);
      expect(pollers.size).toBe(1);
      expect(connectors.get("shared")!.sourceKey).toBe("shared");
    });
  });

  describe("poller isolation", () => {
    it("each poller drains items independently", () => {
      // Arrange
      const type = uniqueType("drain-test");
      const itemsA = [makeWorkItem("A-1")];
      const itemsB = [makeWorkItem("B-1"), makeWorkItem("B-2")];
      registerDataSourceFactory(
        type,
        stubFactory("Test", (sourceKey) => (sourceKey === "source-a" ? itemsA : itemsB)),
      );
      const config = {
        ...makeConfig(),
        dataSources: {
          "source-a": { ...makeDataSourceConfig(), type },
          "source-b": { ...makeDataSourceConfig(), type },
        },
      };
      const { pollers } = buildDataSourceMaps(rootFor(config), config);

      // Act
      const drainA = pollers.get("source-a")!.drain();
      const drainB = pollers.get("source-b")!.drain();

      // Assert
      expect(drainA).toHaveLength(1);
      expect(drainA[0]!.id).toBe("A-1");
      expect(drainB).toHaveLength(2);
      expect(drainB[0]!.id).toBe("B-1");
      expect(pollers.get("source-a")!.drain()).toHaveLength(0);
      expect(pollers.get("source-b")!.drain()).toHaveLength(0);
    });
  });
});
