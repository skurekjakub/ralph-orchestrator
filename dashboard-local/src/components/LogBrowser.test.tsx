import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskLogGroup } from "../types";
import { makeTaskLogGroup } from "../test/factories";
import { LogBrowser } from "./LogBrowser";

function makeFetchForGroups(groups: TaskLogGroup[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/logs") return new Response(JSON.stringify(groups));
    if (url.includes("pre-tool.log")) {
      return new Response(
        JSON.stringify({
          event: "pre_tool",
          ts: 1000,
          session: "s1",
          tool: "task",
          args: JSON.stringify({ agent_type: "ralph.malph-scout" }),
        }),
      );
    }
    if (url.includes("tool-output.log")) {
      return new Response("── 09:23:51 task (success) ──\nargs: {}\ndone");
    }
    if (url.includes("cli-debug.log")) {
      return new Response(
        [
          "2026-03-07T08:23:52.073Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_started)",
          '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout" getOrCreateAgent: final model="claude-opus-4.6" (from resolveDefinitionModel)',
          "2026-03-07T08:26:35.033Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_completed)",
        ].join("\n"),
      );
    }
    return new Response("not found", { status: 404 });
  });
}

describe("LogBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders log groups and opens the timeline view from an execution row", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", makeFetchForGroups([makeTaskLogGroup()]));

    render(<LogBrowser />);

    await waitFor(() => {
      expect(screen.queryByText("Loading logs...")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: /DOC-3141/ }));
    await user.click(screen.getByRole("button", { name: /Timeline/ }));

    await waitFor(() => {
      expect(screen.queryByText(/Tool Timeline/i)).not.toBeNull();
    });
  });

  it("shows loading state while fetching log groups", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(<LogBrowser />);

    expect(screen.queryByText("Loading logs...")).not.toBeNull();

    resolveFetch(new Response(JSON.stringify([])));

    await waitFor(() => {
      expect(screen.queryByText("Loading logs...")).toBeNull();
    });
  });

  it("displays file content when a file is selected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/logs") return new Response(JSON.stringify([makeTaskLogGroup()]));
        if (url.includes("summary.json")) return new Response("summary content here");
        return new Response("not found", { status: 404 });
      }),
    );

    render(<LogBrowser />);

    await waitFor(() => {
      expect(screen.queryByText("Loading logs...")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: /DOC-3141/ }));
    await user.click(screen.getByRole("button", { name: /Summary/ }));

    await waitFor(() => {
      expect(screen.queryByText("summary content here")).not.toBeNull();
    });
  });
});
