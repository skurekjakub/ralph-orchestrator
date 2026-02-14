import { describe, it, expect } from "vitest";
import type { JiraIssue } from "../src/jira/types.js";
import { buildPrompt, extractAdfText } from "../src/container/prompt.js";
import type { IssueContext } from "../src/container/prompt.js";

// ── Prompt building tests ────────────────────────────────
// Tests the prompt construction logic that transforms JIRA issue fields
// into a text prompt for the Copilot CLI agent.

describe("Prompt building", () => {
  it("builds basic prompt with key and summary", () => {
    const issue: JiraIssue = {
      key: "DF-2704",
      fields: { summary: "Add custom module docs", status: { name: "New" }, created: "2026-01-01T00:00:00.000+0000" },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("JIRA Issue: DF-2704");
    expect(prompt).toContain("Title: Add custom module docs");
  });

  it("includes string description", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        description: "Some plain text description",
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Description:\nSome plain text description");
  });

  it("serializes ADF description as JSON", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      ],
    };
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        description: adf,
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Description:");
    expect(prompt).toContain('"type": "doc"');
    expect(prompt).toContain('"text": "Hello"');
  });

  it("includes labels, components, and priority", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        labels: ["ralph-auto", "docs"],
        components: [{ name: "SaaS" }, { name: "On-Premises" }],
        priority: { name: "High" },
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Labels: ralph-auto, docs");
    expect(prompt).toContain("Components: SaaS, On-Premises");
    expect(prompt).toContain("Priority: High");
  });

  it("includes long custom fields", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        customfield_10001: "This is a long acceptance criteria string",
        customfield_10002: "short",
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("customfield_10001: This is a long acceptance criteria string");
    expect(prompt).not.toContain("customfield_10002");
  });

  it("omits missing optional fields", () => {
    const issue: JiraIssue = {
      key: "DF-1",
      fields: { summary: "Test", status: { name: "New" }, created: "2026-01-01T00:00:00.000+0000" },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).not.toContain("Labels:");
    expect(prompt).not.toContain("Components:");
    expect(prompt).not.toContain("Priority:");
    expect(prompt).not.toContain("Description:");
  });

  it("extracts known custom fields with friendly names", () => {
    const issue: JiraIssue = {
      key: "DF-100",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        customfield_14800: "SaaS",
        customfield_14801: "documentation",
        customfield_14702: { value: "Not helpful" },
        customfield_14704: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Navigation is confusing" }],
            },
          ],
        },
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Page name: SaaS");
    expect(prompt).toContain("Documentation space key: documentation");
    expect(prompt).toContain("Was this page helpful?: Not helpful");
    expect(prompt).toContain("How can we make this page more helpful?: Navigation is confusing");
  });

  it("extracts ADF feedback text from nested content", () => {
    const issue: JiraIssue = {
      key: "DF-200",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        customfield_14704: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "First paragraph. " },
                { type: "text", text: "More text." },
              ],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Second paragraph." }],
            },
          ],
        },
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("How can we make this page more helpful?: First paragraph. More text.Second paragraph.");
  });

  it("handles string feedback value", () => {
    const issue: JiraIssue = {
      key: "DF-300",
      fields: {
        summary: "Test",
        status: { name: "New" },
        created: "2026-01-01T00:00:00.000+0000",
        customfield_14704: "Simple text feedback",
      },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("How can we make this page more helpful?: Simple text feedback");
  });

  it("omits custom fields when not present", () => {
    const issue: JiraIssue = {
      key: "DF-400",
      fields: { summary: "Test", status: { name: "New" }, created: "2026-01-01T00:00:00.000+0000" },
    };

    const prompt = buildPrompt(issue);
    expect(prompt).not.toContain("Page name:");
    expect(prompt).not.toContain("Documentation space key:");
    expect(prompt).not.toContain("Page helpfulness rating:");
    expect(prompt).not.toContain("User feedback:");
  });
});

describe("Revision prompt", () => {
  const issue: JiraIssue = {
    key: "DF-500",
    fields: { summary: "Ralph: Fix docs", status: { name: "Defect Found" }, created: "2026-01-01T00:00:00.000+0000" },
  };

  it("includes revision header when context is revision", () => {
    const ctx: IssueContext = { comments: [], isRevision: true, handoffContent: null };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("Mode: REVISION");
    expect(prompt).toContain("Revision Workflow");
    expect(prompt).toContain("JIRA Issue: DF-500");
  });

  it("omits revision header when no context", () => {
    const prompt = buildPrompt(issue);
    expect(prompt).not.toContain("Mode: REVISION");
  });

  it("omits revision header for standard tasks with comments", () => {
    const ctx: IssueContext = { comments: ["[2026-01-10] Alice:\nNote"], isRevision: false };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).not.toContain("Mode: REVISION");
    expect(prompt).toContain("JIRA Comments");
  });

  it("embeds handoff content in prompt", () => {
    const ctx: IssueContext = {
      comments: [],
      isRevision: true,
      handoffContent: "# Handoff: DF-500\n## Task Status\ncompleted",
    };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("Previous Handoff File:");
    expect(prompt).toContain("# Handoff: DF-500");
    expect(prompt).toContain("## Task Status");
  });

  it("embeds JIRA comments in prompt", () => {
    const ctx: IssueContext = {
      comments: [
        "[2026-01-10T10:00:00.000+0000] Bob:\nPlease fix the API example",
        "[2026-01-11T10:00:00.000+0000] Alice:\nAlso fix the heading",
      ],
      isRevision: false,
    };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("JIRA Comments (oldest first):");
    expect(prompt).toContain("Please fix the API example");
    expect(prompt).toContain("Also fix the heading");
    expect(prompt).toContain("---");
  });

  it("omits handoff section when null", () => {
    const ctx: IssueContext = { comments: [], isRevision: true, handoffContent: null };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).not.toContain("Previous Handoff File:");
  });

  it("omits comments section when empty", () => {
    const ctx: IssueContext = { comments: [], isRevision: false };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).not.toContain("JIRA Comments");
  });
});

describe("extractAdfText", () => {
  it("extracts text from simple paragraph", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    };
    expect(extractAdfText(adf).trim()).toBe("Hello world");
  });

  it("extracts text from nested content", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First. " }, { type: "text", text: "Second." }] },
        { type: "paragraph", content: [{ type: "text", text: "Third." }] },
      ],
    };
    const text = extractAdfText(adf);
    expect(text).toContain("First. Second.");
    expect(text).toContain("Third.");
  });

  it("returns empty string for non-object input", () => {
    expect(extractAdfText(null)).toBe("");
    expect(extractAdfText(undefined)).toBe("");
    expect(extractAdfText("plain string")).toBe("");
  });
});
