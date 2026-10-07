import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnavailableNotice } from "./UnavailableNotice";

describe("UnavailableNotice", () => {
  it("names the missing data and says why", () => {
    // Act
    render(<UnavailableNotice title="Token flow" message="Not recorded for this run." />);

    // Assert
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Token flow");
    expect(note.textContent).toContain("Not recorded for this run.");
  });
});
