import React from "react";
import { render } from "ink";
import { App } from "./cli-dashboard/App";
import { createRootContainer } from "./awilix-cradle";
import { AppStartup } from "./app-startup";

async function main(): Promise<void> {
  const startup = new AppStartup();
  const config = await startup.run();
  const { orchestrator, dashboardServer } = createRootContainer(config, { rootDir: process.cwd() }).cradle;

  dashboardServer.start();

  orchestrator.setTaskCallbacks({
    onToolOutput: (line) => dashboardServer.pushToolOutput(line),
    onPreToolUse: (line) => dashboardServer.pushPreToolUse(line),
  });

  const { unmount } = render(React.createElement(App, { observer: orchestrator.observer }));

  // Handle graceful shutdown (Ctrl+C or SIGTERM)
  const SHUTDOWN_TIMEOUT_MS = 30_000;
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      // Second signal — force exit
      unmount();
      process.exit(1);
    }
    shuttingDown = true;
    dashboardServer.stop();
    await Promise.race([
      orchestrator.shutdown(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Shutdown timed out after 30s")), SHUTDOWN_TIMEOUT_MS),
      ),
    ]);
    unmount();
    process.exit(0);
  };

  const handleSignal = () =>
    void shutdown().catch((err) => {
      console.error("Shutdown error:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

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
