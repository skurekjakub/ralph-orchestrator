import { vi } from "vitest";
import { createMockIssueManager } from "../helpers/mocks.js";
import type { WorkItemComment } from "../../src/datasource/types.js";

export function makeMockIssueManager(comments: WorkItemComment[] = []) {
  return createMockIssueManager({
    getComments: vi.fn().mockResolvedValue(comments),
  });
}
