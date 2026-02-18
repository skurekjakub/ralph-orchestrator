import { describe, it, expect } from "vitest";
import { JiraIssueParser } from "../../src/jira/issue-parser.js";
import { makeIssue } from "../helpers.js";

function makeIssueWithFields(customFields: Record<string, unknown> = {}) {
  return makeIssue("DOC-100", "Test issue", "To Do", undefined, {
    description: "Real description",
    ...customFields,
  });
}

describe("JiraIssueParser", () => {
  it("passes through non-custom fields untouched", () => {
    const parser = new JiraIssueParser();
    const issue = makeIssueWithFields();
    const result = parser.parse(issue);

    expect(result.fields.summary).toBe("Test issue");
    expect(result.fields.description).toBe("Real description");
    expect(result.fields.status.name).toBe("To Do");
  });

  it("keeps custom fields with real content", () => {
    const parser = new JiraIssueParser();
    const issue = makeIssueWithFields({ customfield_14800: "Admin UI overview" });
    const result = parser.parse(issue);

    expect(result.fields.customfield_14800).toBe("Admin UI overview");
  });

  it("removes explicitly excluded field IDs", () => {
    const parser = new JiraIssueParser(["customfield_19181"]);
    const issue = makeIssueWithFields({
      customfield_19181: "Some value",
      customfield_14800: "Keep this",
    });
    const result = parser.parse(issue);

    expect(result.fields.customfield_19181).toBeUndefined();
    expect(result.fields.customfield_14800).toBe("Keep this");
  });

  it("removes fields matching all boilerplate patterns", () => {
    const boilerplate =
      "*Please copy and use this template in the description:*\n" +
      "\n----\n\n" +
      "h3. Activity\n\n" +
      "{color:grey}What's the main activity?{color}";

    const parser = new JiraIssueParser();
    const issue = makeIssueWithFields({ customfield_19181: boilerplate });
    const result = parser.parse(issue);

    expect(result.fields.customfield_19181).toBeUndefined();
  });

  it("keeps fields that match only some boilerplate patterns", () => {
    const partial = "Please copy and use this template in the description";
    const parser = new JiraIssueParser();
    const issue = makeIssueWithFields({ customfield_99999: partial });
    const result = parser.parse(issue);

    expect(result.fields.customfield_99999).toBe(partial);
  });

  it("does not modify the original issue object", () => {
    const parser = new JiraIssueParser(["customfield_19181"]);
    const issue = makeIssueWithFields({ customfield_19181: "Remove me" });
    parser.parse(issue);

    expect(issue.fields.customfield_19181).toBe("Remove me");
  });

  it("handles non-string custom field values (never filtered as boilerplate)", () => {
    const parser = new JiraIssueParser();
    const issue = makeIssueWithFields({ customfield_50000: { type: "doc", content: [] } });
    const result = parser.parse(issue);

    expect(result.fields.customfield_50000).toEqual({ type: "doc", content: [] });
  });

  it("removes multiple excluded fields", () => {
    const parser = new JiraIssueParser(["customfield_19181", "customfield_19222", "customfield_11500"]);
    const issue = makeIssueWithFields({
      customfield_19181: "template 1",
      customfield_19222: "template 2",
      customfield_11500: "0|i0xn4i:rank",
      customfield_14800: "Page name",
    });
    const result = parser.parse(issue);

    expect(result.fields.customfield_19181).toBeUndefined();
    expect(result.fields.customfield_19222).toBeUndefined();
    expect(result.fields.customfield_11500).toBeUndefined();
    expect(result.fields.customfield_14800).toBe("Page name");
  });
});
