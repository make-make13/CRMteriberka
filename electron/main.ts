/**
 * Electron main process — CRM «Большая Медведица»
 *
 * Архитектура (Вариант A из docs/electron-plan.md):
 *   1. Находим свободный порт (начиная с 3002).
 *   2. Запускаем backend через spawn('node', ['dist-server/server.cjs']).
 *      Используем системный Node.js — для dev-режима это правильно,
 *      поскольку better-sqlite3 скомпилирован под системный ABI.
 *   3. Ждём GET /api/health → 200.
 *   4. Открываем BrowserWindow на http://localhost:<port>.
 *   5. При закрытии окна — убиваем backend process.
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

    const userData = app.getPath('userData');

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV:                     'production',
      PORT:                         String(port),
      CRM_DATA_DIR:                 userData,
      BM_DOCX_TEMPLATE_STORAGE_ROOT: path.join(userData, 'storage', 'docx-templates'),
      CRM_DIST_DIR:                 getDistPath(),
    };

    // Выбор рантайма для backend-процесса:
    //   dev  (app.isPackaged=false): spawn('node', ...) — системный Node.js,
    //        ABI совпадает с тем, под который скомпилирован better-sqlite3.
    //   pack (app.isPackaged=true):  spawn(process.execPath, ...) c флагом
    //        ELECTRON_RUN_AS_NODE=1 — Electron работает как Node.js-рантайм.
    //        В этом режиме нужно, чтобы better-sqlite3 был пересобран под
    //        Electron ABI (electron-rebuild). Пока используем --dir сборку
    //        только для разработки, поэтому packaged-путь тоже проходит
    //        через системный node (он должен быть установлен).
    // TODO: когда перейдём к релизному дистрибутиву, включить:
    //   const nodeBin = app.isPackaged ? process.execPath : 'node';
    //   if (app.isPackaged) env.ELECTRON_RUN_AS_NODE = '1';
    // + запустить electron-rebuild перед сборкой.
    const nodeBin = 'node';
    console.log(`[electron] Backend runtime: ${nodeBin}, packaged: ${app.isPackaged}`);

    backendProcess = spawn(nodeBin, [serverEntry], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: PROJECT_ROOT,
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
      reject(new Error(`Не удалось запустить node: ${err.message}\n\nУбедитесь, что Node.js установлен и доступен в PATH.`));
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
// Импортируем динамически, чтобы не тянуть в блок до app.whenReady()

import { findFreePort }   from './findFreePort';
import { waitForHealth }  from './waitForHealth';

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    // 1. Свободный порт
    appPort = await findFreePort(3002);
    console.log(`[electron] Using port ${appPort}`);

    // 2. Запуск backend
    await startBackend(appPort);

    // 3. Ждём health check
    console.log(`[electron] Waiting for backend on http://localhost:${appPort}/api/health`);
    await waitForHealth(appPort, 20_000);
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
