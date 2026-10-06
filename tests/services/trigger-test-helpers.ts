import { vi } from "vitest";
import { createMockIssueManager } from "../helpers/mocks";
import type { WorkItemComment } from "../../src/datasource/types";

export function makeMockIssueManager(comments: WorkItemComment[] = []) {
  return createMockIssueManager({
    getComments: vi.fn().mockResolvedValue(comments),
  });
}
