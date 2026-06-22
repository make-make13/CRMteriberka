import { defineConfig } from 'vitest/config';

// Smoke-тесты на чистые функции (без БД/Electron/сети).
// Запуск: npm test
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
