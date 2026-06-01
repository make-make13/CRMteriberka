'use strict';

/**
 * electron-builder afterPack хук — пересборка better-sqlite3 для Electron ABI.
 *
 * Вызывается electron-builder'ом ПОСЛЕ того как файлы скопированы
 * в output-директорию (release/win-unpacked/), но ДО финального упаковки.
 *
 * Что делает:
 *   1. Находит better-sqlite3 в output-директории (не в source node_modules!).
 *   2. Запускает prebuild-install --runtime=electron --target=<version>
 *      который загружает prebuilt .node из GitHub releases better-sqlite3.
 *   3. Заменяет .node файл в output — source остаётся нетронутым.
 *
 * Результат:
 *   - source node_modules/better-sqlite3  → ABI 127 (system Node, для dev)
 *   - packaged node_modules/better-sqlite3 → ABI 135 (Electron 36, для packaged)
 */

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

exports.default = async function afterPack(context) {
  const { appOutDir } = context;

  // Путь к better-sqlite3 в output-директории (не в source!)
  // asar:false → resources/app/node_modules/better-sqlite3
  const sqlite3InOutput = path.join(
    appOutDir, 'resources', 'app', 'node_modules', 'better-sqlite3',
  );

  if (!fs.existsSync(sqlite3InOutput)) {
    console.log('[afterPack] better-sqlite3 not found in output — skipping ABI rebuild');
    return;
  }

  // Версия Electron из установленного пакета (точная, e.g. "36.9.5")
  const electronPkg     = path.join(__dirname, '..', 'node_modules', 'electron', 'package.json');
  const electronVersion = JSON.parse(fs.readFileSync(electronPkg, 'utf-8')).version;

  // prebuild-install hoisted в root node_modules (dep better-sqlite3)
  const prebuildBin = path.join(__dirname, '..', 'node_modules', 'prebuild-install', 'bin.js');

  if (!fs.existsSync(prebuildBin)) {
    console.warn('[afterPack] prebuild-install not found — skipping ABI rebuild');
    return;
  }

  console.log(`[afterPack] Downloading better-sqlite3 prebuilt for Electron ${electronVersion} (ABI 135)...`);

  execSync(
    `node "${prebuildBin}" --runtime=electron --target=${electronVersion} --arch=x64 --platform=win32`,
    { cwd: sqlite3InOutput, stdio: 'inherit' },
  );

  console.log('[afterPack] better-sqlite3 ready for Electron runtime ✓');
};
