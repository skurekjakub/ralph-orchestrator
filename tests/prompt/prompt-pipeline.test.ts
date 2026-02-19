/**
 * Integration test: full prompt pipeline with realistic JIRA data.
 *
 * Runs a real JIRA issue fixture through JiraIssueParser → buildPrompt →
 * prompt auditor and asserts the final prompt matches a snapshot file.
 *
 * No network calls — uses a static JSON fixture.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PromptBuilder } from "../../src/prompt/prompt-builder.js";
import { AuditMode } from "../../src/prompt/prompt-auditor.js";
import type { JiraIssue } from "../../src/jira/types.js";
import type { IssueContext } from "../../src/prompt/prompt.js";
import { createSilentLogger } from "../helpers/mocks.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");

function loadFixture(name: string): { issue: JiraIssue; comments: string[] } {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf-8"));
  const { comments, ...issue } = raw;
  return { issue: issue as JiraIssue, comments: comments ?? [] };
}

function snapshotPath(name: string): string {
  return resolve(FIXTURES_DIR, name.replace(".json", ".prompt.snap"));
}

describe("Prompt pipeline integration", () => {
  const EXCLUDE_FIELDS = ["customfield_19181", "customfield_19222", "customfield_11500"];

  it("DOC-3122: standard task with ADF description, custom fields, and comments", () => {
    const { issue, comments } = loadFixture("DOC-3122-issue.json");
    const builder = new PromptBuilder(AuditMode.Off, createSilentLogger(), EXCLUDE_FIELDS);

    const context: IssueContext = {
      comments,
      isRevision: false,
    };

    const { text } = builder.build(issue, context);

    const snapFile = snapshotPath("DOC-3122-issue.json");

    if (!existsSync(snapFile)) {
      writeFileSync(snapFile, text, "utf-8");
      throw new Error(
        `Snapshot file created at ${snapFile}. Review the content and re-run the test.`,
      );
    }

    const expected = readFileSync(snapFile, "utf-8");
    expect(text).toBe(expected);
  });

  it("DOC-3122: revision task includes handoff and revision header", () => {
    const { issue, comments } = loadFixture("DOC-3122-issue.json");
    const builder = new PromptBuilder(AuditMode.Off, createSilentLogger(), EXCLUDE_FIELDS);

    const context: IssueContext = {
      comments,
      isRevision: true,
      handoffContent: [
        "# Handoff — DOC-3122",
        "",
        "## Summary",
        "Updated reusable-field-schemas.md with a new section.",
        "",
        "## Open Items",
        "- Screenshot of the Used in tab is needed",
      ].join("\n"),
    };

    const { text } = builder.build(issue, context);

    expect(text).toContain("Mode: REVISION");
    expect(text).toContain("Previous Handoff File:");
    expect(text).toContain("# Handoff — DOC-3122");
    expect(text).toContain("Screenshot of the Used in tab is needed");
    // Standard content still present
    expect(text).toContain("JIRA Issue: DOC-3122");
    expect(text).toContain("Title: RFS usage in content types");
  });

  it("excluded fields are stripped from the prompt", () => {
    const { issue, comments } = loadFixture("DOC-3122-issue.json");
    const builder = new PromptBuilder(AuditMode.Off, createSilentLogger(), EXCLUDE_FIELDS);

    const context: IssueContext = { comments, isRevision: false };
    const { text } = builder.build(issue, context);

    // Boilerplate templates should not appear
    expect(text).not.toContain("Please copy and use this template");
    expect(text).not.toContain("{color:grey}");
    // Explicit exclusion (customfield_11500 — sort order)
    expect(text).not.toContain("0|i0xn4i:");
  });

  it("ADF description is converted to readable Markdown", () => {
    const { issue, comments } = loadFixture("DOC-3122-issue.json");
    const builder = new PromptBuilder(AuditMode.Off, createSilentLogger(), EXCLUDE_FIELDS);

    const context: IssueContext = { comments, isRevision: false };
    const { text } = builder.build(issue, context);

    // ADF JSON structure should NOT appear
    expect(text).not.toContain('"type": "doc"');
    expect(text).not.toContain('"type": "paragraph"');

    // Converted Markdown should appear
    expect(text).toContain("Implementation: [https://kentico.atlassian.net/browse/KX-12470]");
    expect(text).toContain("`fe3797f5f804eb21fe141b7c1d2c2e5ecff383b4`");
    expect(text).toContain("reusable field schemas and content types");
  });

  it("unknown custom fields with long values are included", () => {
    const { issue, comments } = loadFixture("DOC-3122-issue.json");
    const builder = new PromptBuilder(AuditMode.Off, createSilentLogger(), EXCLUDE_FIELDS);

    const context: IssueContext = { comments, isRevision: false };
    const { text } = builder.build(issue, context);

    expect(text).toContain("This is an unknown custom field with a long enough value to be included");
  });

  it("comments are included in the prompt", () => {
    const { issue, comments } = loadFixture("DOC-3122-issue.json");
    const builder = new PromptBuilder(AuditMode.Off, createSilentLogger(), EXCLUDE_FIELDS);

    const context: IssueContext = { comments, isRevision: false };
    const { text } = builder.build(issue, context);

    expect(text).toContain("JIRA Comments (oldest first):");
    expect(text).toContain("Ralph here! Starting work on DOC-3122");
    expect(text).toContain("@MalphDocs");
  });
});
