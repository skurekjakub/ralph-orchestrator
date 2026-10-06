import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createLogApiMiddleware } from "./logApiPlugin";

function makeResponse() {
  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead: (code: number, headers?: Record<string, string>) => {
      response.statusCode = code;
      response.headers = headers ?? {};
      return response;
    },
    end: (content = "") => {
      response.body = String(content);
      return response;
    },
  };

  return response as unknown as ServerResponse<IncomingMessage> & {
    body: string;
    headers: Record<string, string>;
    statusCode: number;
  };
}

const tempDirs: string[] = [];

function makeTempLogDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ralph-dashboard-local-"));
  tempDirs.push(dir);
  return dir;
}

describe("logApiPlugin", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves grouped task logs including summary and cli-debug files", () => {
    const logDir = makeTempLogDir();
    const taskDir = join(logDir, "DOC-3141-1772871646745");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(
      join(taskDir, "DOC-3141-1772871646745-1772872987628-summary.json"),
      JSON.stringify({ status: "completed", durationMs: 125000 }),
    );
    writeFileSync(join(taskDir, "DOC-3141-1772871646745-1772872987628-pre-tool.log"), "pretool");
    writeFileSync(join(taskDir, "DOC-3141-1772871646745-1772872987628-cli-debug.log"), "debug");

    const middleware = createLogApiMiddleware(logDir);
    const res = makeResponse();

    middleware({ url: "/api/logs" } as IncomingMessage & { url?: string }, res, () => {});

    const body = JSON.parse(res.body) as Array<{
      files: { preTool?: string; cliDebug?: string };
      summary?: { status?: string };
    }>;
    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].files.preTool).toContain("pre-tool.log");
    expect(body[0].files.cliDebug).toContain("cli-debug.log");
    expect(body[0].summary?.status).toBe("completed");
  });

  it("serves individual log files and rejects invalid filenames", () => {
    const logDir = makeTempLogDir();
    const taskDir = join(logDir, "DOC-3141");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "run.log"), "hello world");

    const middleware = createLogApiMiddleware(logDir);

    const successRes = makeResponse();
    middleware({ url: "/api/logs/DOC-3141%2Frun.log" } as IncomingMessage & { url?: string }, successRes, () => {});
    expect(successRes.statusCode).toBe(200);
    expect(successRes.body).toBe("hello world");

    const invalidRes = makeResponse();
    middleware({ url: "/api/logs/..%2Fsecret" } as IncomingMessage & { url?: string }, invalidRes, () => {});
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body).toBe("Invalid filename");
  });

  describe("operation ledger history", () => {
    function makeLedger(status: string) {
      return { operations: [{ id: `op-${status}`, status }] };
    }

    /** Lay out ledger files the way OperationLedger writes them: `history/<dataSource>/<issueKey>.json`. */
    function writeLedger(logDir: string, dataSource: string, issueKey: string, content: string) {
      const sourceDir = join(logDir, "history", dataSource);
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, `${issueKey}.json`), content);
    }

    function get(logDir: string, url: string) {
      const res = makeResponse();
      createLogApiMiddleware(logDir)({ url } as IncomingMessage & { url?: string }, res, () => {});
      return res;
    }

    it("lists ledger files from every data-source directory", () => {
      const logDir = makeTempLogDir();
      writeLedger(logDir, "kentico-jira", "DOC-3141", JSON.stringify(makeLedger("completed")));
      writeLedger(logDir, "other-jira", "DF-7", JSON.stringify(makeLedger("error")));

      const res = get(logDir, "/api/history");

      const body = JSON.parse(res.body) as Array<{ dataSource: string; taskId: string; data: unknown }>;
      expect(res.statusCode).toBe(200);
      expect([...body].sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual([
        { dataSource: "other-jira", taskId: "DF-7", data: makeLedger("error") },
        { dataSource: "kentico-jira", taskId: "DOC-3141", data: makeLedger("completed") },
      ]);
    });

    it("ignores files at the history root and in-flight temp files", () => {
      const logDir = makeTempLogDir();
      writeLedger(logDir, "kentico-jira", "DOC-3141", JSON.stringify(makeLedger("completed")));
      writeFileSync(join(logDir, "history", "DOC-1.json"), JSON.stringify(makeLedger("pending")));
      writeFileSync(join(logDir, "history", "kentico-jira", "DOC-3141.json.tmp"), "{");

      const body = JSON.parse(get(logDir, "/api/history").body) as Array<{ taskId: string }>;

      expect(body.map((e) => e.taskId)).toEqual(["DOC-3141"]);
    });

    it("skips a corrupt ledger file without hiding the others", () => {
      const logDir = makeTempLogDir();
      writeLedger(logDir, "kentico-jira", "DOC-1", "not json");
      writeLedger(logDir, "kentico-jira", "DOC-2", JSON.stringify(makeLedger("completed")));

      const body = JSON.parse(get(logDir, "/api/history").body) as Array<{ taskId: string }>;

      expect(body.map((e) => e.taskId)).toEqual(["DOC-2"]);
    });

    it("serves a single ledger addressed as <dataSource>/<issueKey>", () => {
      const logDir = makeTempLogDir();
      writeLedger(logDir, "kentico-jira", "DOC-3141", JSON.stringify(makeLedger("completed")));

      const res = get(logDir, "/api/history/kentico-jira/DOC-3141");

      expect(res.statusCode).toBe(200);
      expect(res.headers["Content-Type"]).toContain("application/json");
      expect(JSON.parse(res.body)).toEqual(makeLedger("completed"));
    });

    it("returns 404 for a ledger that does not exist", () => {
      const logDir = makeTempLogDir();

      expect(get(logDir, "/api/history/kentico-jira/DOC-404").statusCode).toBe(404);
    });

    it.each([
      ["a flat issue key", "/api/history/DOC-3141"],
      ["a flat file name", "/api/history/DOC-3141.json"],
      ["an encoded parent segment", "/api/history/..%2Fsecret"],
      ["a dot segment in place of the data source", "/api/history/.%2FDOC-3141"],
      ["an extra nested segment", "/api/history/kentico-jira%2F..%2F..%2Fsecret"],
      ["an empty data source", "/api/history//DOC-3141"],
    ])("rejects %s", (_label, url) => {
      const logDir = makeTempLogDir();
      writeFileSync(join(logDir, "secret.json"), JSON.stringify({ leaked: true }));
      writeLedger(logDir, "kentico-jira", "DOC-3141", JSON.stringify(makeLedger("completed")));

      const res = get(logDir, url);

      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain("leaked");
    });
  });
});
