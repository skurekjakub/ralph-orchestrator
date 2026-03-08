import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubagentContextChart } from "./SubagentContextChart";
import type { AgentWindowSlice } from "./context-window-parser";

function makeSlice(overrides: Partial<AgentWindowSlice> = {}): AgentWindowSlice {
  return {
    name: "malph-scout",
    fullName: "ralph.malph-scout",
    model: "claude-opus-4.6",
    entries: [
      { tsMs: 2000, usedTokens: 12000, maxTokens: 128000, utilization: 9.4 },
      { tsMs: 3000, usedTokens: 25000, maxTokens: 128000, utilization: 19.5 },
      { tsMs: 3500, usedTokens: 35000, maxTokens: 128000, utilization: 27.3 },
    ],
    usageEntries: [
      { tsMs: 2000, promptTokens: 12000, completionTokens: 300, cachedTokens: 0, totalTokens: 12300 },
      { tsMs: 3000, promptTokens: 25000, completionTokens: 500, cachedTokens: 8000, totalTokens: 25500 },
    ],
    ...overrides,
  };
}

describe("SubagentContextChart", () => {
  it("renders nothing when slice has no data", () => {
    const { container } = render(
      <SubagentContextChart slice={makeSlice({ entries: [], usageEntries: [] })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders subagent name and model", () => {
    render(<SubagentContextChart slice={makeSlice()} />);

    expect(screen.getByText("malph-scout")).toBeDefined();
    expect(screen.getByText("claude-opus-4.6")).toBeDefined();
  });

  it("renders peak utilization stat", () => {
    render(<SubagentContextChart slice={makeSlice()} />);

    expect(screen.getByText(/peak: 27\.3%/)).toBeDefined();
  });

  it("renders token count and turn count", () => {
    render(<SubagentContextChart slice={makeSlice()} />);

    expect(screen.getByText(/2 turns/)).toBeDefined();
  });

  it("renders SVG charts", () => {
    const { container } = render(<SubagentContextChart slice={makeSlice()} />);

    const svgs = container.querySelectorAll("svg");
    // 1 utilization mini-chart + 1 token cost mini-chart
    expect(svgs.length).toBe(2);
  });

  it("renders without utilization when only usage entries exist", () => {
    const { container } = render(
      <SubagentContextChart slice={makeSlice({ entries: [] })} />,
    );

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(1); // token cost only
  });
});
