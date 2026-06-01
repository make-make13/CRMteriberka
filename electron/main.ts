/**
 * Electron main process — CRM «Большая Медведица»
 *
 * Архитектура (Вариант A из docs/electron-plan.md):
 *   1. Находим свободный порт (начиная с 3002).
 *   2. Запускаем backend (dist-server/server.cjs):
 *        dev  (app.isPackaged=false): spawn('node', ...) — системный Node.js
 *        pack (app.isPackaged=true):  spawn(process.execPath, ...) + ELECTRON_RUN_AS_NODE=1
 *   3. Ждём GET /api/health → 200.
 *   4. Открываем BrowserWindow на http://localhost:<port>.
 *   5. При закрытии окна — убиваем backend process.
 *
 * ABI-ситуация:
 *   - system Node v22 → ABI 127 (используется в dev)
 *   - Electron 36    → ABI 135 (используется в packaged)
 *   - better-sqlite3 собирается под нужный ABI через afterPack-хук
 *     (см. scripts/afterPack.cjs и electron-builder.yml).
 */

import { app, BrowserWindow, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// В CJS-бандле (tsup format: cjs) __dirname доступен нативно.
// PROJECT_ROOT — корень проекта (dist-electron/ находится внутри него).
const PROJECT_ROOT = path.resolve(__dirname, '..');

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let appPort = 3002;
const BACKEND_HEALTH_TIMEOUT_MS = 60_000;

// ── Пути ─────────────────────────────────────────────────────────────────────

function getIconPath(): string | undefined {
  const ico = path.join(PROJECT_ROOT, 'assets', 'app-icon', 'icon.ico');
  return fs.existsSync(ico) ? ico : undefined;
}

function getServerEntry(): string {
  return path.join(PROJECT_ROOT, 'dist-server', 'server.cjs');
}

function getDistPath(): string {
  return path.join(PROJECT_ROOT, 'dist');
}

function getPreloadPath(): string {
  // tsup компилирует preload.ts → dist-electron/preload.cjs (не .js),
  // поскольку root package.json имеет "type":"module".
  return path.join(__dirname, 'preload.cjs');
}

// ── Backend ──────────────────────────────────────────────────────────────────

function startBackend(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverEntry = getServerEntry();

    if (!fs.existsSync(serverEntry)) {
      reject(new Error(
        `Файл сервера не найден:\n${serverEntry}\n\nЗапустите: npm run build:server`,
      ));
      return;
    }

    const isPackaged = app.isPackaged;
    const userData   = app.getPath('userData');
    const distPath   = getDistPath();

    // ── Выбор рантайма ──────────────────────────────────────────────────────
    //   dev  (isPackaged=false): системный Node.js — ABI совпадает с тем,
    //        под который скомпилирован better-sqlite3 при npm install.
    //   pack (isPackaged=true):  Electron runtime через process.execPath
    //        + ELECTRON_RUN_AS_NODE=1. better-sqlite3 при этом собран
    //        под Electron ABI в afterPack-хуке (scripts/afterPack.cjs).
    const backendExecutable = isPackaged ? process.execPath : 'node';

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV:                     'production',
      PORT:                         String(port),
      CRM_DATA_DIR:                 userData,
      BM_DOCX_TEMPLATE_STORAGE_ROOT: path.join(userData, 'storage', 'docx-templates'),
      CRM_DIST_DIR:                 distPath,
      // В packaged-режиме Electron binary запускается как Node.js
      ...(isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    };

    // ── Диагностический лог ─────────────────────────────────────────────────
    console.log('[electron] ════ Backend startup ════');
    console.log(`[electron]   packaged:            ${isPackaged}`);
    console.log(`[electron]   backendExecutable:   ${backendExecutable}`);
    console.log(`[electron]   serverEntry:         ${serverEntry}`);
    console.log(`[electron]   ELECTRON_RUN_AS_NODE: ${env.ELECTRON_RUN_AS_NODE ?? '(not set — dev mode)'}`);
    console.log(`[electron]   port:                ${port}`);
    console.log(`[electron]   dataDir:             ${userData}`);
    console.log('[electron] ══════════════════════════');

    backendProcess = spawn(backendExecutable, [serverEntry], {
      env,
      stdio:       ['ignore', 'pipe', 'pipe'],
      windowsHide: true,   // не показывать консольное окно на Windows
      cwd:         PROJECT_ROOT,
    });

    backendProcess.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[backend] ${chunk.toString()}`);
    });
    backendProcess.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[backend:err] ${chunk.toString()}`);
    });

    backendProcess.on('spawn', () => {
      console.log(`[electron] Backend process started (pid ${backendProcess?.pid})`);
      resolve();
    });

    backendProcess.on('error', (err) => {
      const hint = isPackaged
        ? `Ошибка запуска Electron runtime:\n${err.message}`
        : `Не удалось запустить node: ${err.message}\n\nУбедитесь, что Node.js установлен и доступен в PATH.`;
      reject(new Error(hint));
    });
  });
}

function killBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    console.log('[electron] Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

// ── Window ───────────────────────────────────────────────────────────────────

async function createWindow(port: number): Promise<void> {
  const preload = getPreloadPath();
  const icon    = getIconPath();

  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    title: 'Большая Медведица CRM',
    icon,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,
      preload:          fs.existsSync(preload) ? preload : undefined,
    },
  });

  // Скрываем стандартное меню (CRM — SPA, не нужен меню-бар)
  mainWindow.setMenuBarVisibility(false);

  await mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Импорт findFreePort / waitForHealth ──────────────────────────────────────

import { findFreePort }  from './findFreePort';
import { waitForHealth } from './waitForHealth';

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    // 1. Свободный порт
    appPort = await findFreePort(3002);
    console.log(`[electron] Using port ${appPort}`);

    // 2. Запуск backend
    await startBackend(appPort);

    // 3. Ждём health check
    console.log(`[electron] Waiting for backend on http://localhost:${appPort}/api/health (timeout ${BACKEND_HEALTH_TIMEOUT_MS / 1000}s)`);
    await waitForHealth(appPort, BACKEND_HEALTH_TIMEOUT_MS);
    console.log('[electron] Backend ready');

    // 4. Открываем окно
    await createWindow(appPort);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[electron] Startup error:', msg);
    dialog.showErrorBox('Ошибка запуска CRM «Большая Медведица»', msg);
    killBackend();
    app.quit();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.setName('Большая Медведица CRM');

app.whenReady().then(main);

app.on('window-all-closed', () => {
  killBackend();
  app.quit();
});

app.on('before-quit', () => {
  killBackend();
});

app.on('activate', () => {
  // macOS: пересоздать окно при клике на dock-иконку
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(appPort);
  }
});
