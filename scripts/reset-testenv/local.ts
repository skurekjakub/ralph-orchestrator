import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ResetContext } from "./types.js";

export function clearLedger(ctx: ResetContext) {
  const ledgerPath = resolve(ctx.rootDir, `output/logs/history/${ctx.issueKey}.json`);
  if (existsSync(ledgerPath)) {
    unlinkSync(ledgerPath);
    console.log(`  ✓ Deleted ledger: ${ledgerPath}`);
  } else {
    console.log("  ✓ No ledger entry to clear");
  }
}

export function clearTriggerCache(ctx: ResetContext) {
  const cachePath = resolve(ctx.rootDir, "output/cache/trigger-cache.json");
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

  const entries = readdirSync(logDir).filter(
    (f) => f.startsWith(`${ctx.issueKey}-`),
  );
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
