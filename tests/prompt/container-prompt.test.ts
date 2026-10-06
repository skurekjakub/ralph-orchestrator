import { describe, it, expect } from "vitest";
import { buildPrompt, type IssueContext } from "../../src/prompt/prompt";
import { makeWorkItem } from "../helpers/factories";

// ── Prompt building tests ────────────────────────────────
// Tests the prompt construction logic that transforms JIRA issue fields
// into a text prompt for the agent CLI.

describe("Prompt building", () => {
  it("builds basic prompt with key and summary", () => {
    const issue = makeWorkItem("DF-2704", "Add custom module docs");

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("JIRA Issue: DF-2704");
    expect(prompt).toContain("Title: Add custom module docs");
  });

  it("includes string description", () => {
    const issue = makeWorkItem("DF-1", {
      description: "Some plain text description",
    });

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Description:\nSome plain text description");
  });

  it("includes labels, components, and priority", () => {
    const issue = makeWorkItem("DF-1", {
      labels: ["ralph-auto", "docs"],
      components: ["SaaS", "On-Premises"],
      priority: "High",
    });

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Labels: ralph-auto, docs");
    expect(prompt).toContain("Components: SaaS, On-Premises");
    expect(prompt).toContain("Priority: High");
  });

  it("includes custom fields from map", () => {
    const issue = makeWorkItem("DF-1", {
      customFields: new Map<string, string>([["Acceptance Criteria", "This is a long acceptance criteria string"]]),
    });

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Acceptance Criteria: This is a long acceptance criteria string");
  });

  it("omits missing optional fields", () => {
    const issue = makeWorkItem("DF-1");

    const prompt = buildPrompt(issue);
    expect(prompt).not.toContain("Labels:");
    expect(prompt).not.toContain("Components:");
    expect(prompt).not.toContain("Priority:");
    expect(prompt).not.toContain("Description:");
  });

  it("includes custom fields with friendly names", () => {
    const issue = makeWorkItem("DF-100", {
      customFields: new Map<string, string>([
        ["Page name", "SaaS"],
        ["Documentation space key", "documentation"],
        ["Was this page helpful?", "Not helpful"],
        ["How can we make this page more helpful?", "Navigation is confusing"],
      ]),
    });

    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Page name: SaaS");
    expect(prompt).toContain("Documentation space key: documentation");
    expect(prompt).toContain("Was this page helpful?: Not helpful");
    expect(prompt).toContain("How can we make this page more helpful?: Navigation is confusing");
  });

  it("omits custom fields when not present", () => {
    const issue = makeWorkItem("DF-400");

    const prompt = buildPrompt(issue);
    expect(prompt).not.toContain("Page name:");
    expect(prompt).not.toContain("Documentation space key:");
  });
});

describe("Revision prompt", () => {
  const issue = makeWorkItem("DF-500", "Ralph: Fix docs", "Defect Found");

  it("includes revision header when context is revision", () => {
    const ctx: IssueContext = { comments: [], isRevision: true, handoffContent: null };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("Mode: REVISION");
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

describe("Trigger parameter nudges", () => {
  it("appends release_notes nudge when param is set", () => {
    const issue = makeWorkItem("DF-100", "Write docs");
    const ctx: IssueContext = {
      comments: [],
      isRevision: false,
      triggerParams: { release_notes: "true" },
    };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("⚠️ REMINDER: Write release notes");
    expect(prompt).toContain("/tmp/mcp-attachments/release-notes.md");
  });

  it("appends codesamples nudge when param is set", () => {
    const issue = makeWorkItem("DF-200", "Update samples");
    const ctx: IssueContext = {
      comments: [],
      isRevision: false,
      triggerParams: { codesamples: "true" },
    };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("⚠️ REMINDER: This task involves the code samples project");
    expect(prompt).toContain("codesamples:build");
  });

  it("appends both nudges when both params are set", () => {
    const issue = makeWorkItem("DF-300", "Full task");
    const ctx: IssueContext = {
      comments: [],
      isRevision: false,
      triggerParams: { release_notes: "true", codesamples: "true" },
    };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).toContain("Write release notes");
    expect(prompt).toContain("code samples project");
  });

  it("omits nudges when triggerParams has no matching keys", () => {
    const issue = makeWorkItem("DF-400", "Quiet task");
    const ctx: IssueContext = {
      comments: [],
      isRevision: false,
      triggerParams: { branch_name: "feature-xyz" },
    };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).not.toContain("⚠️ REMINDER");
  });

  it("omits nudges when triggerParams is undefined", () => {
    const issue = makeWorkItem("DF-500", "No params");
    const ctx: IssueContext = { comments: [], isRevision: false };
    const prompt = buildPrompt(issue, ctx);
    expect(prompt).not.toContain("⚠️ REMINDER");
  });
});
