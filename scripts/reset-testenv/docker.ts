import { execSync } from "node:child_process";

export function cleanContainers() {
  try {
    const containers = execSync('docker ps -aq --filter "label=com.docker.compose.project=ralph-sandbox"', {
      encoding: "utf-8",
    }).trim();

    if (containers) {
      const ids = containers.split("\n").filter(Boolean);
      execSync(`docker rm -f ${ids.join(" ")} 2>/dev/null`, { encoding: "utf-8" });
      console.log(`  ✓ Removed ${ids.length} orphaned container(s)`);
    } else {
      console.log("  ✓ No orphaned containers");
    }
  } catch {
    console.log("  ✓ No containers to clean (Docker may not be running)");
  }
}
