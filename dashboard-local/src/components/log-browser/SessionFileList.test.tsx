import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionFileList } from "./SessionFileList";

const FOLDER = {
  dir: "DF-1-1791352800000/DF-1-1791352800000-1791353200000-claude-sessions",
  files: ["-workspace/s1.jsonl", "-workspace/s1/subagents/agent-a1.jsonl"],
};

describe("SessionFileList", () => {
  it("lists the session files once expanded and opens one by its path under the log directory", async () => {
    // Arrange
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(<SessionFileList folder={FOLDER} onSelectFile={onSelectFile} />);

    // Act
    await user.click(screen.getByRole("button", { name: /Claude Code sessions \(2 files\)/ }));
    await user.click(screen.getByRole("button", { name: "-workspace/s1/subagents/agent-a1.jsonl" }));

    // Assert
    expect(onSelectFile).toHaveBeenCalledWith(`${FOLDER.dir}/-workspace/s1/subagents/agent-a1.jsonl`);
  });

  it("keeps the files hidden until expanded", () => {
    // Act
    render(<SessionFileList folder={FOLDER} onSelectFile={() => {}} />);

    // Assert
    expect(screen.queryByRole("button", { name: "-workspace/s1.jsonl" })).toBeNull();
  });

  it("renders nothing for an empty export", () => {
    // Act
    const { container } = render(<SessionFileList folder={{ dir: FOLDER.dir, files: [] }} onSelectFile={() => {}} />);

    // Assert
    expect(container.innerHTML).toBe("");
  });
});
