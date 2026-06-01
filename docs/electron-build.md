# Electron Build — CRM «Большая Медведица»

Документ описывает команды сборки Electron-оболочки,
структуру директорий и что ещё предстоит реализовать.

Связанные документы:
- [Первый запуск после установки](first-run.md)
- [Release checklist 0.1.0](release-checklist.md)
- [Release notes 0.1.0](release-notes-0.1.0.md)

---

## Команды

### Разработка (dev)

```cmd
npm run electron:dev
```

1. `npm run build` — Vite собирает фронтенд → `dist/`
2. `npm run build:server` — tsup компилирует `server.ts` → `dist-server/server.cjs`
3. `npm run build:electron` — tsup компилирует `electron/main.ts` → `dist-electron/main.cjs`
4. `electron .` — запускает Electron; main.cjs стартует backend через `spawn('node', ...)`

**Требования для dev:**
- Node.js 20+ в PATH (для dev-режима)
- Установленные зависимости (`npm install`)

---

### Unpacked desktop build

```cmd
set ELECTRON_CACHE=D:\Temp\electron-cache
npm run electron:pack
```

**Что делает `electron:pack`:**
1. `npm run build` — Vite
2. `npm run build:server` — tsup  
3. `npm run build:electron` — tsup
4. `electron-builder --dir` — упаковка в `release/win-unpacked/`
5. `afterPack` хук — перекомпилирует `better-sqlite3` под Electron ABI в output

**Примечание:** `ELECTRON_CACHE` нужен из-за сломанной NTFS reparse point в
`C:\Users\Make\AppData\Local\electron\Cache`.

---

### Восстановление better-sqlite3 для dev после pack

После `electron:pack` source лучше-sqlite3 НЕ меняется
(rebuild происходит только в output-директории через afterPack).
Если по какой-то причине нужно восстановить:

```cmd
npm run rebuild:dev
```

---

## Где лежит unpacked build

После успешной сборки:

```
release/
  win-unpacked/
    Большая Медведица CRM.exe   ← ~202 MB (Electron runtime)
    locales/
    resources/
      app/
        dist/                   ← фронтенд (Vite build)
        dist-server/
          server.cjs            ← backend (tsup bundle, ~1.5 MB)
        dist-electron/
          main.cjs              ← Electron main process
          preload.cjs           ← Electron preload
        assets/
          app-icon/             ← иконки
        node_modules/
          better-sqlite3/       ← native addon, ABI 135 (Electron)
          bindings/             ← runtime dep
          file-uri-to-path/     ← runtime dep
          ...                   ← остальные deps (electron-builder)
        package.json
```

---

## Где хранятся данные пользователя

В packaged-режиме (`app.isPackaged = true`) данные хранятся в:

```
C:\Users\<user>\AppData\Roaming\Большая Медведица CRM\
  crm.sqlite          ← база данных CRM
  storage/
    docx-templates/   ← загруженные DOCX-шаблоны
  backups/            ← локальные резервные копии
```

Рабочая база проекта `data/crm.sqlite` при этом **не используется и не изменяется**.

---

## Backend runtime in packaged app

### В dev-режиме

Backend запускается через **системный Node.js**:

```typescript
// electron/main.ts (app.isPackaged = false)
spawn('node', [serverEntry], { env, ... })
```

- Требует Node.js в PATH
- better-sqlite3 скомпилирован для system Node ABI 127

### В packaged/unpacked режиме

Backend запускается через **Electron runtime** — без системного Node.js:

```typescript
// electron/main.ts (app.isPackaged = true)
spawn(process.execPath, [serverEntry], {
  env: {
    ELECTRON_RUN_AS_NODE: '1',  // Electron работает как Node.js
    NODE_ENV: 'production',
    PORT: '3002',
    CRM_DATA_DIR: 'C:\\Users\\...\\AppData\\Roaming\\Большая Медведица CRM',
    ...
  }
})
```

**Системный Node.js НЕ нужен пользователю.**

Electron binary (`Большая Медведица CRM.exe`) запускается дважды:
1. Как GUI process (главное окно)
2. Как backend process (HTTP сервер, `ELECTRON_RUN_AS_NODE=1`)

### Как better-sqlite3 работает с Electron

| Runtime       | Node version | ABI |
|---------------|-------------|-----|
| System Node   | v22.22.2    | 127 |
| Electron 36   | v22.19.0    | 135 |

**Решение:** `scripts/afterPack.cjs` — хук, вызываемый electron-builder'ом
после копирования файлов в output-директорию. Хук запускает:

```
prebuild-install --runtime=electron --target=36.9.5 --arch=x64 --platform=win32
```

Это скачивает prebuilt binary better-sqlite3 специально для Electron ABI 135
с GitHub releases better-sqlite3. Результат:

- `source node_modules/better-sqlite3` → ABI 127 (dev не ломается) ✓
- `release/.../node_modules/better-sqlite3` → ABI 135 (Electron работает) ✓

### Как проверить runtime по логам

При запуске packaged app (в логе stdout):

```
[electron] ════ Backend startup ════
[electron]   packaged:            true
[electron]   backendExecutable:   D:\...\Большая Медведица CRM.exe
[electron]   ELECTRON_RUN_AS_NODE: 1
[electron]   port:                3002
[electron]   dataDir:             C:\Users\...\AppData\Roaming\Большая Медведица CRM
[electron] ══════════════════════════
[electron] Backend process started (pid XXXX)
[backend] Server running on http://localhost:3002
[electron] Backend ready
```

Ключевые признаки правильного packaged-запуска:
- `packaged: true`
- `backendExecutable` содержит `Большая Медведица CRM.exe` (не `node.exe`)
- `ELECTRON_RUN_AS_NODE: 1`

---

## NSIS installer draft

Текущий installer — draft/RC для проверки установки у менеджера. Он собирает
рабочий Setup.exe, но пока намеренно не включает code signing, auto-update,
установку LibreOffice галочкой и перенос существующей рабочей базы.

### Сборка installer

```cmd
set ELECTRON_CACHE=D:\Temp\electron-cache
npm run electron:installer
```

или Windows-скрипт с кэшем:

```cmd
npm run electron:installer:win
```

**Что делает `electron:installer`:**
1. `npm run build` — Vite
2. `npm run build:server` — tsup
3. `npm run build:electron` — tsup
4. `electron-builder --win nsis` — сборка NSIS установщика
5. `afterPack` хук — better-sqlite3 ABI 135 в output

### Где лежит установщик

```
release/
  Большая-Медведица-CRM-Setup-0.1.0.exe   ← ~155 MB
  Большая-Медведица-CRM-Setup-0.1.0.exe.blockmap
  latest.yml                               ← auto-update metadata (будущее)
```

### Что устанавливается

- **Install dir:** `%LOCALAPPDATA%\Programs\bolshaya-medveditsa-crm\`
- **Ярлык рабочего стола:** `Большая Медведица CRM.lnk`
- **Ярлык меню Пуск:** `Большая Медведица CRM.lnk`
- **Данные CRM:** `%APPDATA%\Большая Медведица CRM\` (не в install dir!)
- **Деинсталлятор:** через «Установка и удаление программ»

### Проверенные сценарии

| Проверка | Результат |
|---|---|
| Installer запускается | ✓ |
| Silent install `/S` | ✓ (exit 0) |
| Ярлык рабочего стола | ✓ |
| Ярлык меню Пуск | ✓ |
| `/api/health → {"ok":true}` | ✓ |
| `/api/app-info version/mode/dataDir` | ✓ |
| Login Make/3552 | ✓ |
| Backend умирает при закрытии | ✓ |
| data/crm.sqlite не тронута | ✓ |

### Draft installer — что не реализовано

| Функция | Статус | Описание |
|---|---|---|
| Auto-update | Не сейчас | electron-updater, RELEASES.yml |
| Code signing | Не сейчас | Сертификат подписи кода |
| LibreOffice bundled | Не сейчас | Bundled LibreOffice + install check |
| Перенос базы | Не сейчас | Миграция data/crm.sqlite → AppData |
| Rollback | Не сейчас | NSIS rollback on install fail |
| Брендированный UI | Не сейчас | Кастомные изображения для установщика |

---

## Что ещё не реализовано

| Функция                  | Статус        | Описание                                    |
|--------------------------|---------------|---------------------------------------------|
| NSIS-установщик          | Не сейчас     | Setup.exe с выбором директории              |
| Auto-update              | Не сейчас     | electron-updater                            |
| Перенос существующей базы| Не сейчас     | Миграция `data/crm.sqlite` → AppData        |
| LibreOffice bundled      | Не сейчас     | Отдельный installer или bundled setup       |
| Подпись кода (codesign)  | Не сейчас     | Code signing certificate                    |
| asar + asarUnpack        | Не сейчас     | Включить asar с asarUnpack для better-sqlite3|
| Оптимизация node_modules | Не сейчас     | Включить только better-sqlite3 в package    |

---

## Git-статус

Файлы директории `release/` исключены из git через `.gitignore`.

---

## RC 0.1.0 installer hardening notes

Перед silent install или reinstall закройте установленную CRM и убедитесь, что не
запущены процессы `Большая Медведица CRM.exe`, Setup.exe или uninstaller. NSIS-шаблон
electron-builder при обновлении пытается закрыть процессы из install dir, затем запускает
старый uninstaller с `/S /KEEP_APP_DATA --updated`; пользовательские данные в
`%APPDATA%\Большая Медведица CRM` при этом должны сохраняться.

Рекомендуемый порядок проверки:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -like "$env:LOCALAPPDATA\Programs\bolshaya-medveditsa-crm\*" }

.\release\Большая-Медведица-CRM-Setup-0.1.0.exe /S
```

Если reinstall ждёт закрытия приложения, сначала закройте CRM вручную и повторите
установку. Во время таких проверок не удаляйте `%APPDATA%\Большая Медведица CRM`.

Electron wrapper ждёт packaged backend на `/api/health` до 60 секунд. Это убирает
ложный startup timeout на холодном запуске, когда инициализация SQLite/native modules
занимает больше прежнего лимита 20 секунд, но backend затем отвечает корректно.

Known RC limitation: silent Setup.exe reinstall still hangs after copying files when the
CRM is already closed. The hung process must be stopped by PID; do not delete AppData.
After a hung silent run, verify install dir, registry uninstall key, and userData before
using the installed copy for smoke tests. Use `win-unpacked` as the source of truth for
code smoke checks until the installer hang is fixed.
