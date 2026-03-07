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

  return response as unknown as ServerResponse<IncomingMessage> & { body: string; headers: Record<string, string>; statusCode: number };
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
    writeFileSync(join(taskDir, "DOC-3141-1772871646745-1772872987628-summary.json"), JSON.stringify({ status: "completed", durationMs: 125000 }));
    writeFileSync(join(taskDir, "DOC-3141-1772871646745-1772872987628-pre-tool.log"), "pretool");
    writeFileSync(join(taskDir, "DOC-3141-1772871646745-1772872987628-cli-debug.log"), "debug");

    const middleware = createLogApiMiddleware(logDir);
    const res = makeResponse();

    middleware({ url: "/api/logs" } as IncomingMessage & { url?: string }, res, () => {});

    const body = JSON.parse(res.body) as Array<{ files: { preTool?: string; cliDebug?: string }; summary?: { status?: string } }>;
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

  it("returns history entries from the history directory", () => {
    const logDir = makeTempLogDir();
    const historyDir = join(logDir, "history");
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(join(historyDir, "DOC-3141.json"), JSON.stringify({ status: "completed" }));

    const middleware = createLogApiMiddleware(logDir);
    const res = makeResponse();

    middleware({ url: "/api/history" } as IncomingMessage & { url?: string }, res, () => {});

    const body = JSON.parse(res.body) as Array<{ taskId: string; data: { status: string } }>;
    expect(body).toHaveLength(1);
    expect(body[0].taskId).toBe("DOC-3141");
    expect(body[0].data.status).toBe("completed");
  });
});