/**
 * tsup — сборка backend (server.ts → dist-server/server.cjs).
 *
 * Используется для Electron-оболочки: скомпилированный CJS-файл запускается
 * через child_process.spawn('node', ['dist-server/server.cjs']).
 *
 * Запуск: npm run build:server
 */
import { defineConfig } from 'tsup';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Load environmental variables from .env.local at build time
dotenv.config({ path: '.env.local' });
dotenv.config();

export default defineConfig({
  entry:    { server: 'server.ts' },
  outDir:   'dist-server',
  format:   ['cjs'],
  target:   'node20',
  platform: 'node',
  bundle:   true,
  sourcemap: true,
  clean:    true,
  // Нативные .node-аддоны и dev-зависимости — оставить как require() в бандле.
  external: [
    'better-sqlite3',   // нативный аддон, нельзя бандлить
    'vite',             // dev-зависимость, используется только в !production ветке
  ],
  // Принудительно .cjs: root package.json имеет "type":"module",
  // иначе Node/Electron воспримет .js как ESM.
  outExtension: () => ({ js: '.cjs' }),
  // Вставляем CJS-совместимый аналог import.meta.url в начало бандла.
  // Файлы сервера используют: fileURLToPath(import.meta.url) → __dirname-style.
  banner: {
    js: `const __cjsImportMetaUrl = require("url").pathToFileURL(__filename).href;`,
  },
  esbuildOptions(options) {
    // Алиас @/ → корень проекта (используется в src/utils/*)
    options.alias = { '@': resolve('.') };
    // В CJS-бандле заменяем import.meta.url на CJS-глобал из banner.
    options.define = {
      ...options.define,
      'import.meta.url': '__cjsImportMetaUrl',
      'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || ''),
      'process.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
      'process.env.SMTP_PASSWORD': JSON.stringify(process.env.SMTP_PASSWORD || ''),
      'process.env.SUPABASE_LEADS_TABLE': JSON.stringify(process.env.SUPABASE_LEADS_TABLE || 'leads'),
      'process.env.SUPABASE_LEAD_SYNC_LIMIT': JSON.stringify(process.env.SUPABASE_LEAD_SYNC_LIMIT || '50'),
    };
  },
});
