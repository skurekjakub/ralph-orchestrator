import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonSize, ButtonVariant } from "./Button";

describe("Button", () => {
  it("invokes the click handler when enabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Button onClick={handleClick} variant={ButtonVariant.Subtle} size={ButtonSize.XS}>
        Refresh
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not invoke the click handler when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Button onClick={handleClick} disabled title="Disabled button">
        Disabled
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Disabled" }));

    expect(handleClick).not.toHaveBeenCalled();
  });
});
