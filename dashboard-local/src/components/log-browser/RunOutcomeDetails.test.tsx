import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ExecutionSummary } from "../../types";
import { RunOutcomeDetails } from "./RunOutcomeDetails";

/** The summary of a Claude Code run that failed authentication in a session its hooks did not run in. */
function makeFailedSummary(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    status: "error",
    durationMs: 4000,
    failureCategory: "infra",
    failureReason: "auth-failed",
    cliError: { subtype: "authentication_failed", message: "Not logged in" },
    sessionIds: ["s1", "s2"],
    hooklessSessions: ["s2"],
    agentText: "I could not reach the model.",
    ...overrides,
  };
}

describe("RunOutcomeDetails", () => {
  it("warns that Ralph's hooks did not run for the listed sessions", () => {
    // Act
    render(<RunOutcomeDetails summary={makeFailedSummary({ hooklessSessions: ["s1", "s2"] })} />);

    // Assert
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("hooks did not run for sessions s1, s2");
    expect(warning.textContent).toContain("Run telemetry and the session logs still cover them");
  });

  it("shows the failure reason, category and the CLI's error", () => {
    // Act
    render(<RunOutcomeDetails summary={makeFailedSummary()} />);

    // Assert
    expect(screen.queryByText("auth-failed")).not.toBeNull();
    expect(screen.queryByText("infra")).not.toBeNull();
    expect(screen.queryByText(/CLI error/)?.textContent).toBe("CLI error authentication_failed: Not logged in");
  });

  it("shows the contract category of a run that ended without its result block", () => {
    // Act
    render(
      <RunOutcomeDetails
        summary={{ status: "error", failureCategory: "contract", failureReason: "missing-result-block" }}
      />,
    );

    // Assert
    expect(screen.queryByText("missing-result-block")).not.toBeNull();
    expect(screen.queryByText("contract")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the agent text behind a toggle", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<RunOutcomeDetails summary={makeFailedSummary()} />);
    const shownBeforeToggle = screen.queryByText("I could not reach the model.") !== null;

    // Act
    await user.click(screen.getByRole("button", { name: /Agent text/ }));

    // Assert
    expect(shownBeforeToggle).toBe(false);
    expect(screen.queryByText("I could not reach the model.")).not.toBeNull();
  });

  it("renders nothing for a run that completed with its hooks", () => {
    // Act
    const { container } = render(
      <RunOutcomeDetails summary={{ status: "completed", durationMs: 125000, sessionIds: ["s1"] }} />,
    );

    // Assert
    expect(container.innerHTML).toBe("");
  });
});
