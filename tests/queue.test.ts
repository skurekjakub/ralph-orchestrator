import { describe, it, expect } from "vitest";
import { TaskQueue } from "../src/queue.js";
import { makeIssue } from "./helpers.js";

describe("TaskQueue", () => {
  it("enqueues and dequeues in FIFO order", () => {
    const q = new TaskQueue();
    q.enqueue(makeIssue("DF-1", "First"));
    q.enqueue(makeIssue("DF-2", "Second"));

    expect(q.size).toBe(2);

    const first = q.dequeue();
    expect(first?.key).toBe("DF-1");
    expect(first?.fields.summary).toBe("First");

    const second = q.dequeue();
    expect(second?.key).toBe("DF-2");

    expect(q.size).toBe(0);
  });

  it("deduplicates by issue key", () => {
    const q = new TaskQueue();
    const issue = makeIssue("DF-1");

    expect(q.enqueue(issue)).toBe(true);
    expect(q.enqueue(issue)).toBe(false);
    expect(q.size).toBe(1);
  });

  it("returns undefined when empty", () => {
    const q = new TaskQueue();
    expect(q.dequeue()).toBeUndefined();
    expect(q.peek()).toBeUndefined();
  });

  it("peek returns next without removing", () => {
    const q = new TaskQueue();
    q.enqueue(makeIssue("DF-1"));

    expect(q.peek()?.key).toBe("DF-1");
    expect(q.size).toBe(1);
  });

  it("items returns read-only snapshot", () => {
    const q = new TaskQueue();
    q.enqueue(makeIssue("DF-1", "First"));
    q.enqueue(makeIssue("DF-2", "Second"));

    const items = q.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ key: "DF-1", summary: "First" });
    expect(items[1]).toEqual({ key: "DF-2", summary: "Second" });
  });

  it("markProcessed prevents re-enqueue", () => {
    const q = new TaskQueue();
    q.markProcessed("DF-1");

    expect(q.enqueue(makeIssue("DF-1"))).toBe(false);
    expect(q.size).toBe(0);
  });

  it("resetSeen clears the seen set", () => {
    const q = new TaskQueue();
    q.enqueue(makeIssue("DF-1"));
    q.dequeue();
    q.markProcessed("DF-1");

    q.resetSeen();
    expect(q.enqueue(makeIssue("DF-1"))).toBe(true);
    expect(q.size).toBe(1);
  });

  it("revision flag bypasses seen set for re-enqueue", () => {
    const q = new TaskQueue();
    q.enqueue(makeIssue("DF-1"));
    q.dequeue();
    q.markProcessed("DF-1");

    // Without revision flag — blocked by seen set
    expect(q.enqueue(makeIssue("DF-1"))).toBe(false);
    // With revision flag — bypasses seen set
    expect(q.enqueue(makeIssue("DF-1"), true)).toBe(true);
    expect(q.size).toBe(1);
  });

  it("revision re-enqueue does not duplicate if already in queue", () => {
    const q = new TaskQueue();
    expect(q.enqueue(makeIssue("DF-1"), true)).toBe(true);
    // Second revision enqueue clears seen then re-adds — but key is immediately re-seen
    expect(q.enqueue(makeIssue("DF-1"), true)).toBe(false);
    expect(q.size).toBe(1);
  });
});
