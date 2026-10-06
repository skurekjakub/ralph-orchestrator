import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearLedger } from "../../../scripts/reset-testenv/local";

const KEY = "DOC-3143";

let rootDir: string;
let historyDir: string;

/** Write a ledger file where OperationLedger keeps it: `<logDir>/history/<dataSource>/<issueKey>.json`. */
function writeLedger(dataSource: string, issueKey: string): string {
  const dir = join(historyDir, dataSource);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${issueKey}.json`);
  writeFileSync(path, JSON.stringify({ operations: [] }));
  return path;
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "reset-testenv-"));
  historyDir = join(rootDir, "output", "logs", "history");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(rootDir, { recursive: true, force: true });
});

describe("clearLedger", () => {
  it("deletes the issue's ledger under every data-source directory", () => {
    const kentico = writeLedger("kentico-jira", KEY);
    const other = writeLedger("other-jira", KEY);

    clearLedger({ issueKey: KEY, rootDir });

    expect(existsSync(kentico)).toBe(false);
    expect(existsSync(other)).toBe(false);
  });

  it("keeps ledgers of other issues", () => {
    writeLedger("kentico-jira", KEY);
    const unrelated = writeLedger("kentico-jira", "DOC-1");

    clearLedger({ issueKey: KEY, rootDir });

    expect(existsSync(unrelated)).toBe(true);
  });

  it("does nothing when no ledger history exists", () => {
    expect(() => clearLedger({ issueKey: KEY, rootDir })).not.toThrow();
  });
});
