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

  // Handle graceful shutdown
  const shutdown = () => {
    orchestrator.stop();
    setTimeout(() => {
      unmount();
      process.exit(0);
    }, 2000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

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
