import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Interface and port to listen on. */
export interface ListenAddress {
  host: string;
  port: number;
}

/**
 * Start `server` listening on `address`.
 *
 * @returns The bound port (the chosen one when `address.port` is 0).
 * @throws If the address is unavailable.
 */
export async function listenOn(server: Server, address: ListenAddress): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(address.port, address.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}
