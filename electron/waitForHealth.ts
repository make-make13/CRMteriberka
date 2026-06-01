import http from 'http';

/**
 * Wait until backend returns HTTP 200 for GET /api/health.
 * Rejects when the server is not ready before timeoutMs.
 */
export function waitForHealth(
  port: number,
  timeoutMs = 20_000,
  intervalMs = 300,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;

    function finish(error?: Error): void {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    function check(): void {
      if (settled) {
        return;
      }

      if (Date.now() > deadline) {
        finish(new Error(`Backend did not respond to /api/health within ${timeoutMs / 1000} sec.`));
        return;
      }

      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/api/health', timeout: 1000 },
        (res) => {
          if (res.statusCode === 200) {
            res.resume(); // drain
            finish();
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
