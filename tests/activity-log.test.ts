import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActivityLog } from "../src/services/activity-log.js";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `ralph-test-activity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return dir;
}

describe("ActivityLog", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = makeTmpDir();
  });

  afterEach(() => {
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  it("creates log directory on construction", () => {
    new ActivityLog(logDir);
    expect(existsSync(logDir)).toBe(true);
  });

  it("pushes entries to ring buffer", () => {
    const log = new ActivityLog(logDir);
    log.push("info", "hello");
    log.push("warn", "world");
    expect(log.entries).toHaveLength(2);
    expect(log.entries[0].message).toBe("hello");
    expect(log.entries[1].message).toBe("world");
  });

  it("enforces ring buffer max size", () => {
    const log = new ActivityLog(logDir, 3);
    log.push("info", "a");
    log.push("info", "b");
    log.push("info", "c");
    log.push("info", "d");
    expect(log.entries).toHaveLength(3);
    expect(log.entries[0].message).toBe("b");
    expect(log.entries[2].message).toBe("d");
  });

  it("persists orchestrator entries to activity log file", () => {
    const log = new ActivityLog(logDir);
    log.push("info", "test-message");
    const content = readFileSync(log.activityFilePath, "utf-8").trim();
    expect(content).toMatch(/\[INFO\] test-message$/);
  });

  it("persists container entries to separate container log file", () => {
    const log = new ActivityLog(logDir);
    log.push("info", "container-msg", "container");

    const date = new Date().toISOString().slice(0, 10);
    const containerFile = join(logDir, `container-${date}.log`);
    expect(existsSync(containerFile)).toBe(true);
    const content = readFileSync(containerFile, "utf-8").trim();
    expect(content).toMatch(/\[INFO\] container-msg$/);
  });

  it("calls onChange callback on every push", () => {
    const log = new ActivityLog(logDir);
    let callCount = 0;
    log.onLogChange(() => { callCount++; });
    log.push("info", "a");
    log.push("warn", "b");
    expect(callCount).toBe(2);
  });

  it("creates logger facade that routes to orchestrator source", () => {
    const log = new ActivityLog(logDir);
    const logger = log.createLogger();
    logger.info("info-msg");
    logger.warn("warn-msg");
    logger.error("error-msg");
    expect(log.entries).toHaveLength(3);
    expect(log.entries.every(e => e.source === "orchestrator")).toBe(true);
    expect(log.entries.map(e => e.level)).toEqual(["info", "warn", "error"]);
  });

  it("creates container logger facade that routes to container source", () => {
    const log = new ActivityLog(logDir);
    const logger = log.createContainerLogger();
    logger.info("container-info");
    expect(log.entries[0].source).toBe("container");
  });

  it("returns a snapshot from entries (not a live reference)", () => {
    const log = new ActivityLog(logDir);
    log.push("info", "before");
    const snapshot = log.entries;
    log.push("info", "after");
    expect(snapshot).toHaveLength(1);
    expect(log.entries).toHaveLength(2);
  });

  it("includes timestamp on every entry", () => {
    const before = Date.now();
    const log = new ActivityLog(logDir);
    log.push("info", "timestamped");
    const after = Date.now();
    expect(log.entries[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(log.entries[0].timestamp).toBeLessThanOrEqual(after);
  });

  it("streams only container entries to per-task log file", () => {
    const log = new ActivityLog(logDir);
    const taskFile = log.startTaskLog("DF-1234");
    log.push("info", "orchestrator msg");
    log.push("warn", "container msg", "container");
    log.push("info", "polling noise");
    log.push("error", "container error", "container");
    log.endTaskLog();
    log.push("info", "after task -- not in task file");

    expect(existsSync(taskFile)).toBe(true);
    const lines = readFileSync(taskFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[WARN\] container msg$/);
    expect(lines[1]).toMatch(/\[ERR \] container error$/);
  });
});
