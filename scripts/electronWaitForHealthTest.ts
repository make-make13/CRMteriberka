import assert from 'node:assert/strict';
import http from 'node:http';
import { waitForHealth } from '../electron/waitForHealth';

async function listen(handler: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return server;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

function getPort(server: http.Server): number {
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert(address && 'port' in address);
  return address.port;
}

async function testResolvesWhenHealthReturns200(): Promise<void> {
  const server = await listen((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    res.writeHead(404);
    res.end();
  });

  try {
    await waitForHealth(getPort(server), 1_000, 20);
  } finally {
    await close(server);
  }
}

async function testRejectsWhenHealthNeverStarts(): Promise<void> {
  const server = await listen((_req, res) => {
    res.writeHead(503);
    res.end();
  });

  try {
    await assert.rejects(
      waitForHealth(getPort(server), 150, 20),
      /Backend did not respond/,
    );
  } finally {
    await close(server);
  }
}

async function main(): Promise<void> {
  await testResolvesWhenHealthReturns200();
  await testRejectsWhenHealthNeverStarts();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
