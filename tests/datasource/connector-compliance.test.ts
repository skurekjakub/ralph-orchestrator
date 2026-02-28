/**
 * Connector compliance test suite.
 *
 * A shared parameterized test that any {@link IDataSourceConnector} must pass.
 * Verifies the contract: return types, field constraints, and capability guards.
 *
 * Each connector implementation calls {@link runConnectorComplianceTests} with
 * a factory that produces a real connector instance backed by mock infrastructure.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { JiraConnector } from "../../src/datasource/connectors/jira/jira-connector.js";
import { supportsTransitions, supportsAttachments, type IDataSourceConnector } from "../../src/datasource/connector.js";
import type { WorkItem, WorkItemComment, WorkItemTransition, WorkItemAttachment } from "../../src/datasource/types.js";
import { createMockJiraClient } from "../helpers/mocks.js";
import { makeIssue, makeComment } from "../helpers/factories.js";
import type { IJiraClient } from "../../src/jira/client.js";
import type { JiraAttachment, JiraTransition } from "../../src/jira/types.js";

// ── Compliance test runner ────────────────────────────────────────────────────

function runConnectorComplianceTests(
  name: string,
  createConnector: () => IDataSourceConnector,
  setup: {
    seedSearchResults: (items: WorkItem[]) => void;
    seedComments: (comments: WorkItemComment[]) => void;
    seedTransitions?: (transitions: WorkItemTransition[]) => void;
    seedAttachments?: (attachments: WorkItemAttachment[]) => void;
  },
) {
  describe(`${name} connector compliance`, () => {
    // ── Identity ────────────────────────────────────────────────

    it("has a non-empty name", () => {
      const connector = createConnector();
      expect(connector.name).toBeTruthy();
      expect(typeof connector.name).toBe("string");
    });

    it("has a non-empty sourceKey", () => {
      const connector = createConnector();
      expect(connector.sourceKey).toBeTruthy();
      expect(typeof connector.sourceKey).toBe("string");
    });

    it("getAllowedUsers returns an array", () => {
      const connector = createConnector();
      const users = connector.getAllowedUsers();
      expect(Array.isArray(users)).toBe(true);
    });

    // ── Discovery ───────────────────────────────────────────────

    it("buildQueries returns an array of queries", () => {
      const connector = createConnector();
      const queries = connector.buildQueries([
        { match: { projects: ["TEST"], statuses: ["Open"] } },
      ]);
      expect(Array.isArray(queries)).toBe(true);
    });

    it("searchWorkItems returns WorkItem[] with required fields", async () => {
      const item: WorkItem = {
        id: "TEST-1",
        source: "test",
        project: "TEST",
        title: "Test item",
        description: "A description",
        status: "Open",
        type: "Task",
        priority: "Medium",
        labels: [],
        components: [],
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
        customFields: new Map(),
        sourceData: null,
      };
      setup.seedSearchResults([item]);

      const connector = createConnector();
      const queries = connector.buildQueries([
        { match: { projects: ["TEST"], statuses: ["Open"] } },
      ]);
      const results = await connector.searchWorkItems(queries[0]!);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0]!;

      // Required string fields
      expect(typeof result.id).toBe("string");
      expect(typeof result.source).toBe("string");
      expect(typeof result.project).toBe("string");
      expect(typeof result.title).toBe("string");
      expect(typeof result.description).toBe("string");
      expect(typeof result.status).toBe("string");

      // Description must be plain text (no ADF/HTML)
      expect(result.description).not.toContain("<p>");
      expect(result.description).not.toContain("</p>");
      expect(result.description).not.toMatch(/"type"\s*:\s*"doc"/);

      // Arrays
      expect(Array.isArray(result.labels)).toBe(true);
      expect(Array.isArray(result.components)).toBe(true);
    });

    it("isValidItemId returns a boolean", () => {
      const connector = createConnector();
      expect(typeof connector.isValidItemId("TEST-1")).toBe("boolean");
    });

    // ── Comments ────────────────────────────────────────────────

    it("getComments returns WorkItemComment[] with required fields", async () => {
      setup.seedComments([
        { id: "c1", authorName: "User", authorId: "u1", body: "hello", created: "2026-01-01T00:00:00Z" },
      ]);

      const connector = createConnector();
      const comments = await connector.getComments("TEST-1");

      expect(comments.length).toBeGreaterThan(0);
      const comment = comments[0]!;
      expect(typeof comment.id).toBe("string");
      expect(typeof comment.authorName).toBe("string");
      expect(typeof comment.authorId).toBe("string");
      expect(typeof comment.body).toBe("string");
      expect(typeof comment.created).toBe("string");
    });

    it("addComment does not throw", async () => {
      const connector = createConnector();
      await expect(connector.addComment("TEST-1", "test comment")).resolves.toBeUndefined();
    });

    // ── Capability guards ───────────────────────────────────────

    it("supportsTransitions type guard matches implementation", () => {
      const connector = createConnector();
      const result = supportsTransitions(connector);
      expect(typeof result).toBe("boolean");
      if (result && setup.seedTransitions) {
        expect("getTransitions" in connector).toBe(true);
        expect("transitionWorkItem" in connector).toBe(true);
      }
    });

    it("supportsAttachments type guard matches implementation", () => {
      const connector = createConnector();
      const result = supportsAttachments(connector);
      expect(typeof result).toBe("boolean");
      if (result && setup.seedAttachments) {
        expect("getAttachments" in connector).toBe(true);
        expect("downloadAttachment" in connector).toBe(true);
        expect("addAttachment" in connector).toBe(true);
      }
    });
  });
}

// ── JIRA connector compliance ─────────────────────────────────────────────────

describe("Connector compliance", () => {
  let client: ReturnType<typeof createMockJiraClient>;

  // Client is created once before all JIRA compliance tests
  beforeEach(() => {
    client = createMockJiraClient();
  });

  function createJiraConnector(): IDataSourceConnector {
    return new JiraConnector("jira-test", client as unknown as IJiraClient, []);
  }

  runConnectorComplianceTests("JIRA", createJiraConnector, {
    seedSearchResults: (items) => {
      const jiraIssues = items.map((item) =>
        makeIssue(item.id, item.title, item.status),
      );
      client.searchIssues.mockResolvedValue(jiraIssues);
    },
    seedComments: (comments) => {
      const jiraComments = comments.map((c) => makeComment(c.id, c.body, c.created));
      client.getComments.mockResolvedValue(jiraComments);
    },
    seedTransitions: (transitions) => {
      const jiraTransitions: JiraTransition[] = transitions.map((t) => ({
        id: t.id,
        name: t.name,
        to: { name: t.targetStatus },
      }));
      client.getTransitions.mockResolvedValue(jiraTransitions);
    },
    seedAttachments: (attachments) => {
      const jiraAttachments: JiraAttachment[] = attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        created: a.created,
        content: `https://jira.example.com/attachment/${a.id}`,
      }));
      client.getAttachments.mockResolvedValue(jiraAttachments);
    },
  });
});
