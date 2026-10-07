import type { InstanceObserver, ServerStatus } from "../../src/managed-server";

/** An {@link InstanceObserver} whose reports can be awaited. */
export interface RecordingObserver {
  observer: InstanceObserver;
  /** Resolves when the instance reports it is running. */
  running: Promise<void>;
  /** Resolves with the description of the instance's exit. */
  exited: Promise<string>;
  stderr: string[];
}

export function createRecordingObserver(): RecordingObserver {
  let markRunning!: () => void;
  let markExited!: (description: string) => void;
  const stderr: string[] = [];
  return {
    running: new Promise<void>((resolve) => (markRunning = resolve)),
    exited: new Promise<string>((resolve) => (markExited = resolve)),
    stderr,
    observer: {
      running: () => markRunning(),
      exited: (description) => markExited(description),
      stderr: (text) => stderr.push(text),
    },
  };
}

/** Records a server's status changes and lets a test await a status. */
export interface StatusRecorder {
  history: ServerStatus[];
  onStatusChange: (status: ServerStatus) => void;
  /** Resolves once `status` has been reached `times` times in all. */
  reached(status: ServerStatus, times?: number): Promise<void>;
}

export function createStatusRecorder(): StatusRecorder {
  const history: ServerStatus[] = [];
  const waiters: { status: ServerStatus; times: number; resolve: () => void }[] = [];
  const count = (status: ServerStatus): number => history.filter((entry) => entry === status).length;
  const settle = (): void => {
    for (const waiter of [...waiters]) {
      if (count(waiter.status) < waiter.times) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  };
  return {
    history,
    onStatusChange: (status) => {
      history.push(status);
      settle();
    },
    reached: (status, times = 1) =>
      new Promise<void>((resolve) => {
        waiters.push({ status, times, resolve });
        settle();
      }),
  };
}
