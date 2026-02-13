import React from "react";
import { render } from "ink";
import { App } from "./dashboard/App.js";
import { loadConfig } from "./config.js";
import { Orchestrator } from "./orchestrator.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const orchestrator = new Orchestrator(config);

  // Render the Ink dashboard
  const { unmount } = render(
    React.createElement(App, { orchestrator })
  );

  // Handle graceful shutdown (Ctrl+C or SIGTERM)
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      // Second signal — force exit
      unmount();
      process.exit(1);
    }
    shuttingDown = true;
    await orchestrator.shutdown();
    unmount();
    process.exit(0);
  };

  process.on("SIGINT", () => { shutdown(); });
  process.on("SIGTERM", () => { shutdown(); });

  // Start the orchestrator loop (blocks until stopped)
  try {
    await orchestrator.start();
  } finally {
    unmount();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
