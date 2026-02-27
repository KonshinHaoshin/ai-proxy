/**
 * Port Manager - Track local server port
 */

let localServerPort: number | null = null;

export function getLocalServerPort(): number | null {
  return localServerPort;
}

export function setLocalServerPort(port: number): void {
  localServerPort = port;
}
