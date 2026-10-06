/**
 * Multi-source integration tests.
 *
 * Verifies that the data source registry correctly builds connectors and pollers
 * from config entries with different types, and that profiles are routed
 * to the correct data source by key.
 */
import { describe, it, expect } from "vitest";
import {
  registerDataSourceFactory,
  buildDataSourceMaps,
  type DataSourceFactory,
} from "../../src/datasource/registry.js";
import { makeConfig, makeProfile, makeDataSourceConfig, makeWorkItem } from "../helpers/factories.js";
import type { IDataSourceConnector } from "../../src/datasource/connector.js";
import type { IWorkItemPoller } from "../../src/datasource/poller.js";
import type { WorkItem, WorkItemComment } from "../../src/datasource/types.js";
import type { IDataSourceConfig, IAgentProfile } from "../../src/config/types.js";

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Multi-source integration", () => {
  describe("buildDataSourceMaps", () => {
    it("creates separate connector and poller per data source entry", () => {
      const typeA = uniqueType("source-a");
      const typeB = uniqueType("source-b");

      const factoryA: DataSourceFactory = (key, _ds, _profiles) => ({
        connector: new StubConnector(key, "Source A"),
        poller: new StubPoller(key),
      });
      const factoryB: DataSourceFactory = (key, _ds, _profiles) => ({
        connector: new StubConnector(key, "Source B"),
        poller: new StubPoller(key),
      });

      registerDataSourceFactory(typeA, factoryA);
      registerDataSourceFactory(typeB, factoryB);

      const config = makeConfig([makeProfile({ dataSource: "first" }), makeProfile({ dataSource: "second" })]);
      (config as any).dataSources = {
        first: { ...makeDataSourceConfig(), type: typeA },
        second: { ...makeDataSourceConfig(), type: typeB },
      };

      const { connectors, pollers } = buildDataSourceMaps(config);

      expect(connectors.size).toBe(2);
      expect(pollers.size).toBe(2);

      expect(connectors.get("first")!.name).toBe("Source A");
      expect(connectors.get("first")!.sourceKey).toBe("first");
      expect(connectors.get("second")!.name).toBe("Source B");
      expect(connectors.get("second")!.sourceKey).toBe("second");

      expect(pollers.get("first")!.sourceKey).toBe("first");
      expect(pollers.get("second")!.sourceKey).toBe("second");
    });

    it("passes config and profiles to each factory", () => {
      const type = uniqueType("config-test");
      const receivedArgs: { key: string; ds: IDataSourceConfig; profiles: readonly IAgentProfile[] }[] = [];

      const factory: DataSourceFactory = (key, ds, profiles) => {
        receivedArgs.push({ key, ds, profiles });
        return {
          connector: new StubConnector(key, "Test"),
          poller: new StubPoller(key),
        };
      };

      registerDataSourceFactory(type, factory);

      const profile = makeProfile({ dataSource: "my-source" });
      const dsConfig = { ...makeDataSourceConfig(), type };
      const config = makeConfig([profile]);
      (config as any).dataSources = { "my-source": dsConfig };

      buildDataSourceMaps(config);

      expect(receivedArgs).toHaveLength(1);
      expect(receivedArgs[0]!.key).toBe("my-source");
      expect(receivedArgs[0]!.ds.type).toBe(type);
      expect(receivedArgs[0]!.profiles).toHaveLength(1);
    });

    it("throws when no factory registered for data source type", () => {
      const config = makeConfig();
      (config as any).dataSources = {
        unknown: { ...makeDataSourceConfig(), type: "nonexistent-type" },
      };

      expect(() => buildDataSourceMaps(config)).toThrow(
        /No factory registered for data source type "nonexistent-type"/,
      );
    });

    it("throws on duplicate factory registration", () => {
      const type = uniqueType("dupe-test");
      const factory: DataSourceFactory = (key) => ({
        connector: new StubConnector(key, "Test"),
        poller: new StubPoller(key),
      });

      registerDataSourceFactory(type, factory);

      expect(() => registerDataSourceFactory(type, factory)).toThrow(/already registered/);
    });
  });

  describe("profile routing by data source key", () => {
    it("each profile references the correct data source", () => {
      const typeA = uniqueType("route-a");
      const typeB = uniqueType("route-b");

      registerDataSourceFactory(typeA, (key) => ({
        connector: new StubConnector(key, "JIRA"),
        poller: new StubPoller(key),
      }));
      registerDataSourceFactory(typeB, (key) => ({
        connector: new StubConnector(key, "GitHub"),
        poller: new StubPoller(key),
      }));

      const profileA = makeProfile({ id: "docs", dataSource: "jira-prod" });
      const profileB = makeProfile({ id: "vscode", dataSource: "github-prod" });
      const config = makeConfig([profileA, profileB]);
      (config as any).dataSources = {
        "jira-prod": { ...makeDataSourceConfig(), type: typeA },
        "github-prod": { ...makeDataSourceConfig(), type: typeB },
      };

      const { connectors } = buildDataSourceMaps(config);

      // Profile A should resolve to the JIRA-type connector
      const connectorForA = connectors.get(profileA.dataSource);
      expect(connectorForA).toBeDefined();
      expect(connectorForA!.name).toBe("JIRA");

      // Profile B should resolve to the GitHub-type connector
      const connectorForB = connectors.get(profileB.dataSource);
      expect(connectorForB).toBeDefined();
      expect(connectorForB!.name).toBe("GitHub");
    });

    it("multiple profiles can share one data source", () => {
      const type = uniqueType("shared-ds");

      registerDataSourceFactory(type, (key) => ({
        connector: new StubConnector(key, "Shared"),
        poller: new StubPoller(key),
      }));

      const config = makeConfig([
        makeProfile({ id: "docs", dataSource: "shared" }),
        makeProfile({ id: "vscode", dataSource: "shared" }),
      ]);
      (config as any).dataSources = {
        shared: { ...makeDataSourceConfig(), type },
      };

      const { connectors, pollers } = buildDataSourceMaps(config);

      // Only one connector and poller — both profiles share it
      expect(connectors.size).toBe(1);
      expect(pollers.size).toBe(1);
      expect(connectors.get("shared")!.sourceKey).toBe("shared");
    });
  });

  describe("poller isolation", () => {
    it("each poller drains items independently", () => {
      const type = uniqueType("drain-test");

      const itemsA = [makeWorkItem("A-1")];
      const itemsB = [makeWorkItem("B-1"), makeWorkItem("B-2")];

      registerDataSourceFactory(type, (key) => ({
        connector: new StubConnector(key, "Test"),
        poller: new StubPoller(key, key === "source-a" ? itemsA : itemsB),
      }));

      const config = makeConfig();
      (config as any).dataSources = {
        "source-a": { ...makeDataSourceConfig(), type },
        "source-b": { ...makeDataSourceConfig(), type },
      };

      const { pollers } = buildDataSourceMaps(config);

      const drainA = pollers.get("source-a")!.drain();
      const drainB = pollers.get("source-b")!.drain();

      expect(drainA).toHaveLength(1);
      expect(drainA[0]!.id).toBe("A-1");
      expect(drainB).toHaveLength(2);
      expect(drainB[0]!.id).toBe("B-1");

      // Second drain returns empty (items already consumed)
      expect(pollers.get("source-a")!.drain()).toHaveLength(0);
      expect(pollers.get("source-b")!.drain()).toHaveLength(0);
    });
  });
});
