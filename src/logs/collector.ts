import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../config.js";
import type { RalphResult } from "../container/types.js";

export class LogCollector {
  constructor(private config: AppConfig["output"]) {
    mkdirSync(this.config.logDir, { recursive: true });
    mkdirSync(this.config.handoffDir, { recursive: true });
  }

  /** Save the orchestrator-level execution summary */
  saveExecutionSummary(result: RalphResult): string {
    const filename = `${result.issueKey}-${Date.now()}-summary.json`;
    const path = join(this.config.logDir, filename);
    writeFileSync(
      path,
      JSON.stringify(
        {
          issueKey: result.issueKey,
          status: result.status,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          prUrl: result.prUrl,
          handoffPath: result.handoffPath,
          auditLogPath: result.auditLogPath,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return path;
  }
}
