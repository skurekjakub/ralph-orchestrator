import { vi } from "vitest";

/**
 * In-memory WebSocket fake for tests that need to control the WebSocket boundary.
 * Maintains readyState, emits lifecycle events, and records close() calls.
 */
export class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  static reset() {
    MockWebSocket.instances = [];
  }

  readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  emitOpen() {
    this.readyState = this.OPEN;
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitClose() {
    this.readyState = 3;
    this.onclose?.();
  }

  emitError() {
    this.onerror?.();
  }

  close = vi.fn(() => {
    this.emitClose();
  });
}
