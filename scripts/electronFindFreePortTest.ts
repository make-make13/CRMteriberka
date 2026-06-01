import net from 'node:net';
import assert from 'node:assert/strict';
import { findFreePort } from '../electron/findFreePort';

async function listen(host: string, port = 0): Promise<net.Server> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  return server;
}

async function close(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function main() {
  const occupied = await listen('0.0.0.0');
  const address = occupied.address();
  assert.equal(typeof address, 'object');
  assert(address && 'port' in address);

  const occupiedPort = address.port;
  try {
    const freePort = await findFreePort(occupiedPort, occupiedPort + 10);
    assert.notEqual(
      freePort,
      occupiedPort,
      'findFreePort must not return a port already occupied on 0.0.0.0',
    );
  } finally {
    await close(occupied);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
