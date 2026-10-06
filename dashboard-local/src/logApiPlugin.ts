import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
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
  const middleware = createLogApiMiddleware(logDir);

  return {
    name: "ralph-log-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export function createLogApiMiddleware(logDir: string) {
  return (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    next: () => void,
  ) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/api/logs") {
      handleLogList(logDir, res);
    } else if (url.pathname.startsWith("/api/logs/")) {
      const filename = decodeURIComponent(url.pathname.slice("/api/logs/".length));
      handleLogFile(logDir, filename, res);
    } else if (url.pathname === "/api/history") {
      handleHistoryList(logDir, res);
    } else if (url.pathname.startsWith("/api/history/")) {
      const ledgerRef = decodeURIComponent(url.pathname.slice("/api/history/".length));
      handleHistoryFile(logDir, ledgerRef, res);
    } else {
      next();
    }
  };
}

interface TaskLogGroup {
  id: string;
  taskId: string;
  timestamp?: number;
  files: {
    log?: string;
    summary?: string;
    audit?: string;
    transcript?: string;
    toolOutput?: string;
    preTool?: string;
    cliDebug?: string;
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
          taskMap.set(key, { id: key, taskId: key, files: {} });
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
      const dirTaskId = dirMatch ? dirMatch[1] : entry;
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
            taskId: dirTaskId,
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
        else if (suffix === "pre-tool" && ext === "log") group.files.preTool = relPath;
        else if (suffix === "cli-debug" && ext === "log") group.files.cliDebug = relPath;
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

/** One operation ledger file, as written by the orchestrator's `OperationLedger`. */
interface HistoryEntry {
  /** Data-source key from config.json; also the ledger's subdirectory under `history/`. */
  dataSource: string;
  /** Work item key; fetch the same ledger again at `/api/history/<dataSource>/<taskId>`. */
  taskId: string;
  data: unknown;
}

/**
 * A data-source key or work item key used as a single path segment.
 * Leading alphanumeric excludes `.` and `..`; no separators can appear.
 */
const SAFE_SEGMENT_RE = /^[A-Za-z0-9][\w.-]*$/;
const LEDGER_EXT = ".json";

/** Ledgers live at `history/<dataSource>/<issueKey>.json` (see `OperationLedger`). */
function handleHistoryList(logDir: string, res: import("node:http").ServerResponse) {
  const historyDir = join(logDir, "history");
  let sources: Dirent[];
  try {
    sources = readdirSync(historyDir, { withFileTypes: true });
  } catch {
    json(res, []);
    return;
  }

  const entries: HistoryEntry[] = [];
  // Files directly under history/ predate per-data-source ledgers; the orchestrator no longer reads them.
  for (const source of sources.filter((d) => d.isDirectory())) {
    const sourceDir = join(historyDir, source.name);
    for (const file of readdirSync(sourceDir).filter((f) => f.endsWith(LEDGER_EXT))) {
      try {
        entries.push({
          dataSource: source.name,
          taskId: file.slice(0, -LEDGER_EXT.length),
          data: JSON.parse(readFileSync(join(sourceDir, file), "utf-8")),
        });
      } catch {
        // One unreadable ledger must not hide every other issue's history.
      }
    }
  }
  json(res, entries);
}

/** Serve one ledger addressed as `<dataSource>/<issueKey>`. */
function handleHistoryFile(
  logDir: string,
  ledgerRef: string,
  res: import("node:http").ServerResponse,
) {
  const segments = ledgerRef.split("/");
  if (segments.length !== 2 || !segments.every((s) => SAFE_SEGMENT_RE.test(s))) {
    res.writeHead(400);
    res.end("Invalid ledger reference — expected <dataSource>/<issueKey>");
    return;
  }
  const [dataSource, issueKey] = segments;
  handleLogFile(logDir, `history/${dataSource}/${issueKey}${LEDGER_EXT}`, res);
}

function json(res: import("node:http").ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
