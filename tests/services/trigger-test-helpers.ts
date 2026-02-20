import { vi } from "vitest";
import { createMockIssueManager } from "../helpers/mocks.js";
import type { JiraComment } from "../../src/jira/types.js";

export function makeMockIssueManager(comments: JiraComment[] = []) {
  return createMockIssueManager({
    getComments: vi.fn().mockResolvedValue(comments),
  });
}
