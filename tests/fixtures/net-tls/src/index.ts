import net from 'node:net';

export function makeSocket() {
  return new net.Socket();
}
