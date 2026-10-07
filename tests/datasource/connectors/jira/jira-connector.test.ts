import { describe, it, expect, beforeEach } from "vitest";
import { JiraConnector } from "../../../../src/datasource/connectors/jira/jira-connector";
import { createMockJiraClient, type Mocked } from "../../../helpers/mocks";
import { makeIssue, makeComment } from "../../../helpers/factories";
import type { IJiraClient } from "../../../../src/datasource/connectors/jira/jira-client";
const PROJECT = "DF";
const KEY = "DF-100";

describe("JiraConnector", () => {
  let client: Mocked<IJiraClient>;
  let connector: JiraConnector;

  beforeEach(() => {
    client = createMockJiraClient();
    connector = new JiraConnector({ sourceKey: "jira", jiraClient: client, excludeFields: [], allowedUsers: [] });
  });

  it("exposes name and sourceKey", () => {
    expect(connector.name).toBe("JIRA");
    expect(connector.sourceKey).toBe("jira");
  });

  // ── IWorkItemSource ─────────────────────────────────────────

  describe("buildQueries", () => {
    it("generates JQL from profile match rules", () => {
      const profiles = [{ match: { projects: [PROJECT], statuses: ["New", "To Do"] } }];
      const queries = connector.buildQueries(profiles);

      expect(queries).toHaveLength(1);
      expect(queries[0]).toBe('project = "DF" AND status IN ("New", "To Do") ORDER BY created ASC');
    });

    it("generates catch-all JQL when statuses are empty", () => {
      const profiles = [{ match: { projects: ["DOC"], statuses: [] } }];
      const queries = connector.buildQueries(profiles);

      expect(queries[0]).toBe('project = "DOC" ORDER BY created ASC');
    });

    it("deduplicates identical queries", () => {
      const profiles = [
        { match: { projects: [PROJECT], statuses: ["New"] } },
        { match: { projects: [PROJECT], statuses: ["New"] } },
      ];
      const queries = connector.buildQueries(profiles);

      expect(queries).toHaveLength(1);
    });

    it("generates one query per project", () => {
      const profiles = [{ match: { projects: [PROJECT, "DOC"] } }];
      const queries = connector.buildQueries(profiles);

      expect(queries).toHaveLength(2);
    });
  });

  describe("searchWorkItems", () => {
    it("delegates to jiraClient and maps results", async () => {
      const issue = makeIssue(KEY, "Test", "New");
      client.searchIssues.mockResolvedValue([issue]);

      const items = await connector.searchWorkItems('project = "DF"');

      expect(client.searchIssues).toHaveBeenCalledWith('project = "DF"', undefined);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(KEY);
      expect(items[0].source).toBe("jira");
    });

    it("passes pageSize to client", async () => {
      client.searchIssues.mockResolvedValue([]);

      await connector.searchWorkItems("jql", 10);

      expect(client.searchIssues).toHaveBeenCalledWith("jql", 10);
    });
  });

  describe("refreshWorkItem", () => {
    it("fetches by key and returns mapped WorkItem", async () => {
      const issue = makeIssue("DF-200", "Refresh test", "In Progress");
      client.searchIssues.mockResolvedValue([issue]);

      const item = await connector.refreshWorkItem("DF-200");

      expect(client.searchIssues).toHaveBeenCalledWith('key = "DF-200"', 1);
      expect(item.id).toBe("DF-200");
      expect(item.status).toBe("In Progress");
    });

    it("throws when issue not found", async () => {
      client.searchIssues.mockResolvedValue([]);

      await expect(connector.refreshWorkItem("DF-999")).rejects.toThrow("Work item DF-999 not found in JIRA");
    });
  });

  describe("isValidItemId", () => {
    it("accepts valid JIRA keys", () => {
      expect(connector.isValidItemId("DF-1")).toBe(true);
      expect(connector.isValidItemId("DOC-12345")).toBe(true);
      expect(connector.isValidItemId("AB2-99")).toBe(true);
    });

    it("rejects invalid keys", () => {
      expect(connector.isValidItemId("df-1")).toBe(false);
      expect(connector.isValidItemId("123")).toBe(false);
      expect(connector.isValidItemId("")).toBe(false);
      expect(connector.isValidItemId(PROJECT)).toBe(false);
      expect(connector.isValidItemId("-1")).toBe(false);
    });
  });

  // ── IWorkItemComments ───────────────────────────────────────

  describe("getComments", () => {
    it("maps JIRA comments to WorkItemComments", async () => {
      const adfBody = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      const comment = makeComment("c-1", adfBody);
      client.getComments.mockResolvedValue([comment]);

      const items = await connector.getComments(KEY);

      expect(items).toHaveLength(1);
      expect(items[0].body).toBe("hello");
      expect(items[0].authorId).toBe("test-account-id");
    });
  });

  describe("addComment", () => {
    it("delegates to jiraClient", async () => {
      await connector.addComment(KEY, "Test comment");

      expect(client.addComment).toHaveBeenCalledWith(KEY, "Test comment");
    });
  });

  // ── IWorkItemTransitions ────────────────────────────────────

  describe("getTransitions", () => {
    it("maps JIRA transitions to WorkItemTransitions", async () => {
      client.getTransitions.mockResolvedValue([{ id: "31", name: "Start", to: { name: "In Progress" } }]);

      const transitions = await connector.getTransitions(KEY);

      expect(transitions).toHaveLength(1);
      expect(transitions[0].targetStatus).toBe("In Progress");
    });
  });

  describe("transitionWorkItem", () => {
    it("resolves transition ID and applies it", async () => {
      client.findTransitionId.mockResolvedValue("31");

      await connector.transitionWorkItem(KEY, "In Progress");

      expect(client.findTransitionId).toHaveBeenCalledWith(KEY, "In Progress");
      expect(client.transitionIssue).toHaveBeenCalledWith(KEY, "31");
    });

    it("throws when no matching transition exists", async () => {
      client.findTransitionId.mockResolvedValue(undefined);

      await expect(connector.transitionWorkItem(KEY, "Nonexistent")).rejects.toThrow(
        'No transition to "Nonexistent" available for DF-100',
      );
    });
  });

  // ── IWorkItemAttachments ────────────────────────────────────

  describe("getAttachments", () => {
    it("maps JIRA attachments to WorkItemAttachments", async () => {
      client.getAttachments.mockResolvedValue([
        {
          id: "att-1",
          filename: "handoff.md",
          content: "https://jira.example.com/att-1",
          created: "2026-01-01T00:00:00Z",
        },
      ]);

      const attachments = await connector.getAttachments(KEY);

      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe("handoff.md");
      expect(attachments[0]).not.toHaveProperty("content");
    });
  });

  describe("downloadAttachment", () => {
    it("looks up content URL from attachment list and downloads", async () => {
      client.getAttachments.mockResolvedValue([
        {
          id: "att-1",
          filename: "handoff.md",
          content: "https://jira.example.com/att-1",
          created: "2026-01-01T00:00:00Z",
        },
      ]);
      client.downloadAttachment.mockResolvedValue("# Handoff content");

      const content = await connector.downloadAttachment(KEY, "att-1");

      expect(client.downloadAttachment).toHaveBeenCalledWith("https://jira.example.com/att-1");
      expect(content).toBe("# Handoff content");
    });

    it("throws when attachment ID not found", async () => {
      client.getAttachments.mockResolvedValue([]);

      await expect(connector.downloadAttachment(KEY, "missing")).rejects.toThrow(
        "Attachment missing not found on DF-100",
      );
    });
  });

  describe("addAttachment", () => {
    it("delegates string content to jiraClient", async () => {
      await connector.addAttachment(KEY, "transcript.md", "content");

      expect(client.addAttachment).toHaveBeenCalledWith(KEY, "transcript.md", "content");
    });

    it("converts Buffer content to string", async () => {
      const buf = Buffer.from("buffer content", "utf-8");

      await connector.addAttachment(KEY, "file.txt", buf);

      expect(client.addAttachment).toHaveBeenCalledWith(KEY, "file.txt", "buffer content");
    });
  });
});
