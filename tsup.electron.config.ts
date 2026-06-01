/**
 * tsup — сборка Electron main + preload (electron/ → dist-electron/).
 *
 * Запуск: npm run build:electron
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main:    'electron/main.ts',
    preload: 'electron/preload.ts',
  },
  outDir:   'dist-electron',
  format:   ['cjs'],
  target:   'node20',
  platform: 'node',
  bundle:   true,
  sourcemap: true,
  clean:    true,
  external: [
    'electron', // поставляется самим Electron, не бандлить
  ],
  // Принудительно .cjs: root package.json имеет "type":"module",
  // иначе Node/Electron воспримет .js как ESM.
  outExtension: () => ({ js: '.cjs' }),
});
