import { describe, it, expect } from "vitest";
import {
  mapIssueToWorkItem,
  mapCommentToWorkItemComment,
  mapAttachmentToWorkItemAttachment,
  mapTransitionToWorkItemTransition,
} from "../../../../src/datasource/connectors/jira/jira-mapper";
import type {
  JiraIssue,
  JiraComment,
  JiraAttachment,
  JiraTransition,
} from "../../../../src/datasource/connectors/jira/jira-types";
import { makeIssue, makeComment } from "../../../helpers/factories";

describe("mapIssueToWorkItem", () => {
  it("maps all standard fields", () => {
    const issue: JiraIssue = {
      key: "DF-100",
      fields: {
        summary: "Fix the docs",
        status: { name: "In Progress" },
        issuetype: { name: "Bug" },
        priority: { name: "High" },
        labels: ["docs", "urgent"],
        components: [{ name: "API" }, { name: "SDK" }],
        created: "2026-01-15T10:30:00.000+0000",
        updated: "2026-02-01T14:00:00.000+0000",
      },
    };

    const item = mapIssueToWorkItem(issue, "jira");

    expect(item.id).toBe("DF-100");
    expect(item.source).toBe("jira");
    expect(item.project).toBe("DF");
    expect(item.title).toBe("Fix the docs");
    expect(item.status).toBe("In Progress");
    expect(item.type).toBe("Bug");
    expect(item.priority).toBe("High");
    expect(item.labels).toEqual(["docs", "urgent"]);
    expect(item.components).toEqual(["API", "SDK"]);
    expect(item.created).toBe("2026-01-15T10:30:00.000+0000");
    expect(item.updated).toBe("2026-02-01T14:00:00.000+0000");
  });

  it("preserves original JiraIssue as sourceData", () => {
    const issue = makeIssue("DF-200");
    const item = mapIssueToWorkItem(issue, "jira");
    expect(item.sourceData).toBe(issue);
  });

  it("extracts project from multi-character key", () => {
    const issue = makeIssue("DOC-42");
    const item = mapIssueToWorkItem(issue, "jira");
    expect(item.project).toBe("DOC");
  });

  it("handles missing optional fields gracefully", () => {
    const issue: JiraIssue = {
      key: "DF-300",
      fields: {
        summary: "Minimal issue",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
      },
    };

    const item = mapIssueToWorkItem(issue, "jira");

    expect(item.type).toBe("");
    expect(item.priority).toBe("");
    expect(item.labels).toEqual([]);
    expect(item.components).toEqual([]);
    expect(item.updated).toBe("");
    expect(item.description).toBe("");
  });

  it("converts ADF description to text", () => {
    const issue: JiraIssue = {
      key: "DF-400",
      fields: {
        summary: "ADF test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        description: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
        },
      },
    };

    const item = mapIssueToWorkItem(issue, "jira");
    expect(item.description).toBe("Hello world");
  });

  it("extracts known custom fields into customFields map", () => {
    const issue: JiraIssue = {
      key: "DF-500",
      fields: {
        summary: "Custom fields test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        customfield_14800: "Getting Started Guide",
        customfield_14702: { value: "Yes" },
      },
    };

    const item = mapIssueToWorkItem(issue, "jira");
    expect(item.customFields.get("Page name")).toBe("Getting Started Guide");
    expect(item.customFields.get("Was this page helpful?")).toBe("Yes");
  });

  it("ignores empty custom fields", () => {
    const issue: JiraIssue = {
      key: "DF-600",
      fields: {
        summary: "Empty custom fields",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        customfield_14800: "",
        customfield_14801: null,
      },
    };

    const item = mapIssueToWorkItem(issue, "jira");
    expect(item.customFields.size).toBe(0);
  });

  it("uses source key parameter for source field", () => {
    const issue = makeIssue("DF-700");
    const item = mapIssueToWorkItem(issue, "kentico-jira");
    expect(item.source).toBe("kentico-jira");
  });
});

describe("mapCommentToWorkItemComment", () => {
  it("maps all comment fields", () => {
    const comment: JiraComment = {
      id: "c-1",
      author: { accountId: "user-abc", displayName: "Jane Doe" },
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Looks good" }] }] },
      created: "2026-02-15T09:00:00.000+0000",
    };

    const mapped = mapCommentToWorkItemComment(comment);

    expect(mapped.id).toBe("c-1");
    expect(mapped.authorId).toBe("user-abc");
    expect(mapped.authorName).toBe("Jane Doe");
    expect(mapped.body).toBe("Looks good");
    expect(mapped.created).toBe("2026-02-15T09:00:00.000+0000");
  });

  it("returns empty body for non-ADF content", () => {
    const comment = makeComment("c-2", "plain text");
    const mapped = mapCommentToWorkItemComment(comment);
    // extractAdfText returns "" for non-doc nodes
    expect(mapped.body).toBe("");
  });
});

describe("mapAttachmentToWorkItemAttachment", () => {
  it("maps attachment fields", () => {
    const att: JiraAttachment = {
      id: "att-1",
      filename: "handoff.md",
      content: "https://jira.example.com/content/att-1",
      created: "2026-01-10T12:00:00.000+0000",
    };

    const mapped = mapAttachmentToWorkItemAttachment(att);

    expect(mapped.id).toBe("att-1");
    expect(mapped.filename).toBe("handoff.md");
    expect(mapped.created).toBe("2026-01-10T12:00:00.000+0000");
    // content URL is NOT on WorkItemAttachment — connector resolves it internally
    expect(mapped).not.toHaveProperty("content");
  });
});

describe("mapTransitionToWorkItemTransition", () => {
  it("maps transition fields", () => {
    const t: JiraTransition = {
      id: "31",
      name: "Start Progress",
      to: { name: "In Progress" },
    };

    const mapped = mapTransitionToWorkItemTransition(t);

    expect(mapped.id).toBe("31");
    expect(mapped.name).toBe("Start Progress");
    expect(mapped.targetStatus).toBe("In Progress");
  });
});
