import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ResetContext } from "./types";

/**
 * Delete the issue's operation ledger (`history/<dataSource>/<issueKey>.json`) under every data source.
 *
 * Every other piece of local state this reset clears is keyed by the bare issue key, and the
 * remote reset has just deleted the trigger comments the ledgers point at, so a ledger for
 * this key under any data source is stale.
 */
export function clearLedger(ctx: ResetContext) {
  const historyDir = resolve(ctx.rootDir, "output/logs/history");
  const dataSources = existsSync(historyDir)
    ? readdirSync(historyDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  let deleted = 0;
  for (const dataSource of dataSources) {
    const ledgerPath = resolve(historyDir, dataSource, `${ctx.issueKey}.json`);
    if (!existsSync(ledgerPath)) continue;
    unlinkSync(ledgerPath);
    deleted++;
    console.log(`  ✓ Deleted ledger: ${ledgerPath}`);
  }
  if (deleted === 0) console.log("  ✓ No ledger entry to clear");
}

export function clearTriggerCache(ctx: ResetContext) {
  const cachePath = resolve(ctx.rootDir, "cache/trigger-cache.json");
  if (!existsSync(cachePath)) {
    console.log("  ✓ No trigger cache to clear");
    return;
  }
  try {
    const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (cache[ctx.issueKey]) {
      delete cache[ctx.issueKey];
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      console.log(`  ✓ Removed ${ctx.issueKey} from trigger cache`);
    } else {
      console.log("  ✓ Issue not in trigger cache");
    }
  } catch {
    console.log("  ✓ Trigger cache not readable (skipped)");
  }
}

export function clearLogFiles(ctx: ResetContext) {
  const logDir = resolve(ctx.rootDir, "output/logs");
  if (!existsSync(logDir)) return;

  const entries = readdirSync(logDir).filter((f) => f.startsWith(`${ctx.issueKey}-`));
  if (entries.length > 0) {
    for (const f of entries) {
      const fullPath = resolve(logDir, f);
      if (statSync(fullPath).isDirectory()) {
        rmSync(fullPath, { recursive: true, force: true });
      } else {
        unlinkSync(fullPath);
      }
    }
    console.log(`  ✓ Deleted ${entries.length} log entries`);
  } else {
    console.log("  ✓ No log files to clear");
  }
}
