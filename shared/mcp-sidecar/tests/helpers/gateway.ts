import type { HealthReport } from "../../src/health";
import { GatewayEvent, type SidecarGateway } from "../../src/sidecar-gateway";

/** Resolve with the first health report that satisfies `predicate`, re-checking on every gateway change. */
export function waitForHealth(
  gateway: SidecarGateway,
  predicate: (report: HealthReport) => boolean,
): Promise<HealthReport> {
  return new Promise((resolve) => {
    const check = (): void => {
      const report = gateway.healthReport();
      if (!predicate(report)) return;
      gateway.off(GatewayEvent.Changed, check);
      resolve(report);
    };
    gateway.on(GatewayEvent.Changed, check);
    check();
  });
}
