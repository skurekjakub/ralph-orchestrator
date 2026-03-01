import React from "react";
import { render } from "ink";
import { App } from "./cli-dashboard/App.js";
import { Orchestrator } from "./orchestrator.js";
import { createCradle } from "./awilix-cradle.js";
import { AppStartup } from "./app-startup.js";
import { DashboardServer } from "./services/dashboard-server.js";

async function main(): Promise<void> {
  const startup = new AppStartup();
  const config = await startup.run();
  const cradle = createCradle(config);

  const orchestrator = new Orchestrator(cradle);

  // Start the local WebSocket dashboard server
  const dashboardServer = new DashboardServer(
    orchestrator.observer,
    cradle.logger,
  );
  dashboardServer.start();

  // Wire real-time tool output streaming to the dashboard
  orchestrator.setTaskCallbacks({
    onToolOutput: (line) => dashboardServer.pushToolOutput(line),
    onPreToolUse: (line) => dashboardServer.pushPreToolUse(line),
  });

  const { unmount } = render(
    React.createElement(App, { observer: orchestrator.observer })
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
    dashboardServer.stop();
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
