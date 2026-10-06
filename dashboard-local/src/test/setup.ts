import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

window.HTMLElement.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
