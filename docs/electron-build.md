# Electron Build — CRM «Большая Медведица»

Документ описывает текущие команды сборки Electron-оболочки,
структуру директорий и что ещё предстоит реализовать.

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
- Node.js 20+ в PATH
- Установленные зависимости (`npm install`)

---

### Unpacked desktop build

```cmd
set ELECTRON_CACHE=D:\Temp\electron-cache
npx electron-builder --dir
```

или через npm-скрипт (включает все стадии сборки):

```cmd
set ELECTRON_CACHE=D:\Temp\electron-cache
npm run electron:pack
```

**Примечание:** Переменная `ELECTRON_CACHE` нужна из-за сломанной NTFS-точки
репарса в `C:\Users\Make\AppData\Local\electron\Cache`. Без неё electron-builder
падает с ошибкой. Подробнее см. `docs/electron-plan.md`.

---

## Где лежит unpacked build

После успешной сборки:

```
release/
  win-unpacked/
    Большая Медведица CRM.exe   ← исполняемый файл (~202 MB с Electron)
    locales/
    resources/
      app/
        dist/                   ← фронтенд (Vite build)
        dist-server/
          server.cjs            ← backend (tsup bundle, ~1.5 MB)
        dist-electron/
          main.cjs              ← Electron main process
          preload.cjs           ← Electron preload (пустой)
        assets/
          app-icon/             ← иконки
        node_modules/
          better-sqlite3/       ← native addon (нельзя бандлить)
          bindings/             ← runtime dep для better-sqlite3
          file-uri-to-path/     ← runtime dep для bindings
          ...                   ← остальные deps (electron-builder включил все)
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

## Как работает backend в packaged режиме

`electron/main.ts` запускает backend через:

```typescript
spawn('node', ['resources/app/dist-server/server.cjs'], {
  env: {
    NODE_ENV: 'production',
    PORT: '<свободный порт, начиная с 3002>',
    CRM_DATA_DIR: 'C:\\Users\\...\\AppData\\Roaming\\Большая Медведица CRM',
    CRM_DIST_DIR: 'resources/app/dist',
    ...
  }
})
```

**Требование:** На машине должен быть установлен Node.js.

---

## ABI лучше-sqlite3 (важно для разработчиков)

| Runtime       | Node version | ABI |
|---------------|-------------|-----|
| System Node   | v22.22.2    | 127 |
| Electron 36   | v22.19.0    | 135 |

better-sqlite3 сейчас скомпилирован для **ABI 127** (system Node).
В `electron-builder.yml` установлено `npmRebuild: false` чтобы не пересобирать.

Это означает: packaged build работает пока на машине с установленным Node.js.
Для дистрибуции без Node.js (настоящий продакшн) нужно:

1. Переключить в `electron/main.ts`:
   ```typescript
   const nodeBin = app.isPackaged ? process.execPath : 'node';
   if (app.isPackaged) env.ELECTRON_RUN_AS_NODE = '1';
   ```
2. Установить `npmRebuild: true` в `electron-builder.yml`
3. Запустить `electron-rebuild` или убедиться что electron-builder пересобирает better-sqlite3

---

## Что ещё не реализовано

| Функция                  | Статус        | Описание                                    |
|--------------------------|---------------|---------------------------------------------|
| NSIS-установщик          | Не сейчас     | Setup.exe с выбором директории              |
| Auto-update              | Не сейчас     | electron-updater                            |
| Перенос существующей базы| Не сейчас     | Миграция `data/crm.sqlite` → AppData        |
| LibreOffice bundled      | Не сейчас     | Отдельный installer или bundled setup       |
| Подпись кода (codesign)  | Не сейчас     | Code signing certificate                    |
| Prod runtime (no Node)   | Не сейчас     | ELECTRON_RUN_AS_NODE + electron-rebuild     |
| Оптимизация node_modules | Не сейчас     | Включить только better-sqlite3 в package    |

---

## Git-статус

Файлы директории `release/` исключены из git через `.gitignore`.
