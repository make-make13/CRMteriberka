import net from 'net';

/**
 * Находит свободный TCP-порт, начиная с startPort.
 * Используется Electron main для выбора порта backend-сервера.
 */
export function findFreePort(startPort = 3002, maxPort = 3020): Promise<number> {
  return new Promise((resolve, reject) => {
    function tryPort(port: number): void {
      if (port > maxPort) {
        reject(new Error(`Не удалось найти свободный порт в диапазоне ${startPort}–${maxPort}`));
        return;
      }
      const server = net.createServer();
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.once('error', () => tryPort(port + 1));
      server.listen(port, '127.0.0.1');
    }
    tryPort(startPort);
  });
}
