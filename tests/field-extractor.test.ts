import { describe, it, expect } from "vitest";
import { JiraFieldExtractor, extractAdfText } from "../src/jira/field-extractor.js";
import { makeIssue } from "./helpers.js";

const extractor = new JiraFieldExtractor();

describe("JiraFieldExtractor", () => {
  it("extracts known custom fields with friendly labels", () => {
    const issue = makeIssue("DF-100");
    issue.fields.customfield_14800 = "SaaS";
    issue.fields.customfield_14801 = "documentation";

    const fields = extractor.extractCustomFields(issue);
    expect(fields).toEqual([
      { fieldId: "customfield_14800", label: "Page name", value: "SaaS" },
      { fieldId: "customfield_14801", label: "Documentation space key", value: "documentation" },
    ]);
  });

  it("unwraps {value: ...} wrapper objects", () => {
    const issue = makeIssue("DF-200");
    issue.fields.customfield_14702 = { value: "Not helpful" };

    const fields = extractor.extractCustomFields(issue);
    expect(fields).toContainEqual({
      fieldId: "customfield_14702",
      label: "Was this page helpful?",
      value: "Not helpful",
    });
  });

  it("extracts ADF text from doc nodes", () => {
    const issue = makeIssue("DF-300");
    issue.fields.customfield_14704 = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Navigation is confusing" }],
        },
      ],
    };

    const fields = extractor.extractCustomFields(issue);
    expect(fields).toContainEqual({
      fieldId: "customfield_14704",
      label: "How can we make this page more helpful?",
      value: "Navigation is confusing",
    });
  });

  it("picks up unknown custom fields with long string values", () => {
    const issue = makeIssue("DF-400");
    issue.fields.customfield_99999 = "This is a long enough string value";

    const fields = extractor.extractCustomFields(issue);
    expect(fields).toContainEqual({
      fieldId: "customfield_99999",
      label: "customfield_99999",
      value: "This is a long enough string value",
    });
  });

  it("skips null/undefined custom fields", () => {
    const issue = makeIssue("DF-500");
    // No custom fields set
    const fields = extractor.extractCustomFields(issue);
    expect(fields).toHaveLength(0);
  });

  it("skips unknown custom fields with short strings", () => {
    const issue = makeIssue("DF-600");
    issue.fields.customfield_99999 = "short";

    const fields = extractor.extractCustomFields(issue);
    expect(fields).toHaveLength(0);
  });
});

describe("extractAdfText", () => {
  it("extracts text from nested ADF paragraphs", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      ],
    };
    expect(extractAdfText(adf)).toBe("Hello world\n");
  });

  it("returns empty string for null/undefined", () => {
    expect(extractAdfText(null)).toBe("");
    expect(extractAdfText(undefined)).toBe("");
  });

  it("returns empty string for non-object", () => {
    expect(extractAdfText(42)).toBe("");
    expect(extractAdfText("string")).toBe("");
  });
});
