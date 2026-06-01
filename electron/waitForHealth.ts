import http from 'http';

/**
 * Ждёт, пока backend ответит 200 на GET /api/health.
 * Отклоняет Promise, если сервер не поднялся за timeoutMs.
 */
export function waitForHealth(
  port: number,
  timeoutMs = 20_000,
  intervalMs = 300,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function check(): void {
      if (Date.now() > deadline) {
        reject(new Error(`Backend не ответил на /api/health за ${timeoutMs / 1000} сек.`));
        return;
      }

      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/api/health', timeout: 1000 },
        (res) => {
          if (res.statusCode === 200) {
            res.resume(); // drain
            resolve();
          } else {
            res.resume();
            setTimeout(check, intervalMs);
          }
        },
      );

      req.on('error', () => setTimeout(check, intervalMs));
      req.on('timeout', () => { req.destroy(); setTimeout(check, intervalMs); });
    }

    check();
  });
}
