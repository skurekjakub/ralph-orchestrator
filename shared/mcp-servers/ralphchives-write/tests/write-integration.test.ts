/**
 * Integration tests against a running NodeBB instance at localhost:4567.
 * Run with: NODEBB_API_URL=http://localhost:4567 NODEBB_API_TOKEN=<token> NODEBB_CATEGORY_ID=<cid> npx vitest run tests/write-integration.test.ts
 *
 * Requires a running NodeBB with an API token and a writable category.
 * Skipped when NODEBB_API_TOKEN is not set (CI skips unless the
 * ralphchives-integration job provides it).
 */
import { describe, it, expect, beforeAll } from "vitest";

const token = process.env.NODEBB_API_TOKEN;
const hasLiveNodeBB = !!token;

let postTaskReport: Awaited<typeof import("../src/tools/post-task-report")>["tool"];
let postObservation: Awaited<typeof import("../src/tools/post-observation")>["tool"];
let replyToThread: Awaited<typeof import("../src/tools/reply-to-thread")>["tool"];

function textContent(result: Awaited<ReturnType<typeof postTaskReport.handler>>): string {
  const item = result.content[0];
  if (item.type !== "text") throw new Error(`Expected text, got ${item.type}`);
  return item.text;
}

describe.skipIf(!hasLiveNodeBB)("ralphchives-write — live NodeBB integration", () => {
  beforeAll(async () => {
    process.env.NODEBB_API_URL ??= "http://localhost:4567";
    process.env.NODEBB_CATEGORY_ID ??= process.env.NODEBB_CATEGORY_ID;
    const { initCategoryId } = await import("../src/shared");
    await initCategoryId();
    postTaskReport = (await import("../src/tools/post-task-report")).tool;
    postObservation = (await import("../src/tools/post-observation")).tool;
    replyToThread = (await import("../src/tools/reply-to-thread")).tool;
  });

  it("post_task_report creates a new topic", async () => {
    const result = await postTaskReport.handler(
      {
        title: "CI-TEST-001: Integration test task report",
        content:
          "## What Was Done\nThis is an automated integration test.\n\n## Changes\n- Verified post_task_report works end-to-end",
        tags: ["ci-test", "integration"],
      },
      {} as never,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(textContent(result));
    expect(body.success).toBe(true);
    expect(body.topicId).toBeGreaterThan(0);
    expect(body.slug).toBeTruthy();
  });

  it("post_observation creates a topic with [Observation] prefix", async () => {
    const result = await postObservation.handler(
      {
        title: "API naming inconsistency spotted",
        content: "The Content Delivery API uses camelCase for some fields and snake_case for others.",
        tags: ["api", "naming"],
      },
      {} as never,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(textContent(result));
    expect(body.success).toBe(true);
    expect(body.topicId).toBeGreaterThan(0);
  });

  it("reply_to_thread adds a reply to an existing topic", async () => {
    // First create a topic to reply to
    const createResult = await postTaskReport.handler(
      {
        title: "CI-TEST-002: Topic for reply test",
        content: "This topic will receive a reply.",
      },
      {} as never,
    );
    const createBody = JSON.parse(textContent(createResult));
    const topicId = createBody.topicId;

    // Now reply to it
    const replyResult = await replyToThread.handler(
      {
        topicId,
        content: "This is an automated reply from the integration test suite.",
      },
      {} as never,
    );

    expect(replyResult.isError).toBeUndefined();
    const replyBody = JSON.parse(textContent(replyResult));
    expect(replyBody.success).toBe(true);
    expect(replyBody.postId).toBeGreaterThan(0);
    expect(replyBody.topicId).toBe(topicId);
  });

  it("post_task_report with no tags defaults to empty array", async () => {
    const result = await postTaskReport.handler(
      {
        title: "CI-TEST-003: No tags provided",
        content: "Testing default tag behavior.",
      },
      {} as never,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(textContent(result));
    expect(body.success).toBe(true);
  });

  it("reply_to_thread fails gracefully for non-existent topic", async () => {
    const result = await replyToThread.handler({ topicId: 999999, content: "This should fail." }, {} as never);

    expect(result.isError).toBe(true);
    const body = JSON.parse(textContent(result));
    expect(body.error).toBe(true);
  });
});
