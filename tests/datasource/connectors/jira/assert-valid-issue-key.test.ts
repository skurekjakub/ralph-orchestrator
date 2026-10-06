import { describe, it, expect } from "vitest";
import { assertValidIssueKey } from "../../../../src/datasource/connectors/jira/jira-connector";

describe("assertValidIssueKey", () => {
  it.each(["DF-1", "DF-123", "DOC-4567", "ABC-99", "A1B2-100"])("accepts valid key %s", (key) => {
    expect(() => assertValidIssueKey(key)).not.toThrow();
  });

  it.each([
    ["empty string", ""],
    ["lowercase project", "df-1"],
    ["mixed case project", "Df-1"],
    ["no number", "DF-"],
    ["no hyphen", "DF1"],
    ["path traversal", "../../etc/passwd"],
    ["path traversal variant", "DF-1/../../../etc"],
    ["spaces", "DF 1"],
    ["non-digits after hyphen", "DF-BAD"],
  ])("rejects %s", (_label, key) => {
    expect(() => assertValidIssueKey(key)).toThrow(`Invalid JIRA issue key: "${key}"`);
  });
});
