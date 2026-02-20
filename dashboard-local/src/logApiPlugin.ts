import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Vite plugin that serves the log browsing API from the dev server.
 *
 * This lets the dashboard browse historical logs without the orchestrator
 * running. The API reads directly from the `output/logs/` directory.
 */
export function logApiPlugin(): Plugin {
  const logDir = resolve(import.meta.dirname, "../../output/logs");

  return {
    name: "ralph-log-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/logs") {
          handleLogList(logDir, res);
        } else if (url.pathname.startsWith("/api/logs/")) {
          const filename = decodeURIComponent(url.pathname.slice("/api/logs/".length));
          handleLogFile(logDir, filename, res);
        } else if (url.pathname === "/api/history") {
          handleHistoryList(logDir, res);
        } else if (url.pathname.startsWith("/api/history/")) {
          const filename = decodeURIComponent(url.pathname.slice("/api/history/".length));
          handleLogFile(logDir, `history/${filename}`, res);
        } else {
          next();
        }
      });
    },
  };
}

interface TaskLogGroup {
  id: string;
  issueKey: string;
  timestamp?: number;
  files: {
    log?: string;
    summary?: string;
    audit?: string;
    transcript?: string;
    toolOutput?: string;
  };
  summary?: Record<string, unknown>;
}

function handleLogList(logDir: string, res: import("node:http").ServerResponse) {
  try {
    const taskMap = new Map<string, TaskLogGroup>();

    const entries = readdirSync(logDir);

    // Activity and container logs live at the root level
    for (const entry of entries) {
      if (!statSync(join(logDir, entry)).isFile()) continue;
      if (entry.startsWith("activity-") || entry.startsWith("container-")) {
        const key = entry.replace(/\.log$/, "");
        if (!taskMap.has(key)) {
          taskMap.set(key, { id: key, issueKey: key, files: {} });
        }
        taskMap.get(key)!.files.log = entry;
      }
    }

    // Task logs live in timestamped subdirectories (e.g. DOC-3143-<ts>/, local-run-<ts>/)
    for (const entry of entries) {
      const entryPath = join(logDir, entry);
      if (!statSync(entryPath).isDirectory() || entry === "history") continue;

      // Extract issue key and timestamp from folder name
      const dirMatch = entry.match(/^(.+?)-(\d{13,})$/);
      const dirIssueKey = dirMatch ? dirMatch[1] : entry;
      const dirTimestamp = dirMatch ? Number(dirMatch[2]) : undefined;

      const files = readdirSync(entryPath).filter(
        (f) => statSync(join(entryPath, f)).isFile(),
      );

      for (const file of files) {
        const relPath = `${entry}/${file}`;
        const match = file.match(/^.+-(\d+)(?:-(.+))?\.(.+)$/);
        if (!match) continue;

        const [, , suffix, ext] = match;

        if (!taskMap.has(entry)) {
          taskMap.set(entry, {
            id: entry,
            issueKey: dirIssueKey,
            timestamp: dirTimestamp,
            files: {},
          });
        }

        const group = taskMap.get(entry)!;
        if (ext === "log" && !suffix) group.files.log = relPath;
        else if (ext === "json" && suffix === "summary") group.files.summary = relPath;
        else if (ext === "jsonl") group.files.audit = relPath;
        else if (suffix === "transcript" && ext === "md") group.files.transcript = relPath;
        else if (suffix === "tool-output" && ext === "log") group.files.toolOutput = relPath;
      }
    }

    const groups = [...taskMap.values()].sort(
      (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
    );

    for (const group of groups) {
      if (group.files.summary) {
        try {
          group.summary = JSON.parse(
            readFileSync(join(logDir, group.files.summary), "utf-8")
          );
        } catch { /* skip */ }
      }
    }

    json(res, groups);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
}

function handleLogFile(
  logDir: string,
  filename: string,
  res: import("node:http").ServerResponse,
) {
  if (filename.includes("..") || filename.startsWith("/")) {
    res.writeHead(400);
    res.end("Invalid filename");
    return;
  }

  try {
    const content = readFileSync(join(logDir, filename), "utf-8");
    const ext = filename.split(".").pop();
    const contentType =
      ext === "json" ? "application/json" :
      ext === "jsonl" ? "application/x-ndjson" :
      ext === "md" ? "text/markdown" :
      "text/plain";

    res.writeHead(200, { "Content-Type": `${contentType}; charset=utf-8` });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("File not found");
  }
}

function handleHistoryList(logDir: string, res: import("node:http").ServerResponse) {
  try {
    const historyDir = join(logDir, "history");
    const files = readdirSync(historyDir).filter((f) => f.endsWith(".json"));
    const entries = files.map((f) => ({
      filename: f,
      issueKey: f.replace(".json", ""),
      data: JSON.parse(readFileSync(join(historyDir, f), "utf-8")),
    }));
    json(res, entries);
  } catch {
    json(res, []);
  }
}

function json(res: import("node:http").ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
