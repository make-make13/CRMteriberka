# Electron — план Desktop-сборки CRM «Большая Медведица»

> Документ фиксирует архитектурные решения для будущей Electron-оболочки.
> Реализация Electron не начата. Изменений в CRM-коде нет.

---

## App identity

Product name: `Большая Медведица CRM`
App ID: `ru.teriberka.big-medveditsa-crm`
Windows icon: `assets/app-icon/icon.ico`
PNG icon: `assets/app-icon/icon.png`
Large PNG icon: `assets/app-icon/icon-1024.png`

Финальный установщик и Electron-сборка должны использовать этот icon pack.

Сниппет для `electron-builder.yml` — см. `assets/app-icon/electron-builder-icon-snippet.yml`.

---

## Рекомендованная архитектура: Вариант A — child_process.fork

```
Electron main.ts
   ↓ fork('dist-server/server.cjs')   ← скомпилированный backend (tsup → CJS)
   ↓ ждёт GET /api/health → 200
   ↓ открывает BrowserWindow → http://localhost:3002
```

**Почему этот вариант:**
- Не нужен системный Node.js — Electron несёт свой Node, fork() использует его
- Изоляция: крэш backend не роняет окно — можно показать диалог «Перезапустить?»
- Минимальные изменения в коде сервера
- Весь обмен через HTTP, как сейчас — preload/ipc не нужен
- Стандартный паттерн для Electron + Express

---

## Хранение данных

```
Windows AppData:
  C:\Users\{user}\AppData\Roaming\big-medveditsa-crm\
    crm.sqlite          ← база (CRM_DATA_DIR)
    backups/            ← резервные копии
    storage/            ← DOCX-шаблоны (BM_DOCX_TEMPLATE_STORAGE_ROOT)
```

Electron main передаёт пути через env до fork():
```
CRM_DATA_DIR             = app.getPath('userData')
BM_DOCX_TEMPLATE_STORAGE_ROOT = app.getPath('userData')/storage/docx-templates
NODE_ENV                 = production
PORT                     = 3002 (или ближайший свободный)
```

---

## Что нужно сделать до добавления Electron

1. **`server.ts`**: заменить `path.join(process.cwd(), 'dist')` на env-configurable
   (`DIST_PATH` env или `path.resolve(__dirname, '..', 'dist')`)
2. **`backupService.ts`**: добавить `RCLONE_PATH` env для пути к `rclone.exe`
3. **Компиляция backend**: добавить `tsup.config.ts` → `dist-server/server.cjs`
4. **Native rebuild**: `better-sqlite3` требует пересборки под Electron ABI
   (`electron-rebuild` или `postinstall` hook)

---

## Планируемые новые файлы

```
electron/
  main.ts                   ← Electron main process
  preload.ts                ← минимальный (только IPC для backend-error)
  utils/findFreePort.ts
  utils/waitForHealth.ts
electron-builder.yml        ← конфиг сборки
tsconfig.electron.json      ← отдельный tsconfig (CJS target)
assets/app-icon/            ← icon pack (уже добавлен)
```

---

## Планируемые devDependencies

```
electron@^32
electron-builder@^25
electron-rebuild@^3
tsup@^8
concurrently@^9
wait-on@^8
```

---

## Scripts (будущие)

```json
"electron:dev":   "concurrently \"npm run dev\" \"wait-on http://localhost:3002 && electron .\"",
"electron:build": "npm run build && tsup && electron-builder",
"electron:pack":  "electron-builder --dir"
```

---

## Риски

| Риск | Серьёзность | Митигация |
|---|---|---|
| better-sqlite3 native rebuild | 🔴 Высокая | electron-rebuild в postinstall |
| process.cwd() в нескольких местах | 🟡 Средняя | env-override уже заложен (CRM_DATA_DIR и др.) |
| Размер installer | 🟠 Низкая | ~160–180 MB (Electron + Chromium + Node) |
| Antivirus false positives | 🟠 Низкая | Code signing сертификат |

---

## Пошаговый план внедрения (5 коммитов)

1. **Подготовка путей** — заменить `process.cwd()` на env-configurable в server.ts и backupService.ts
2. **tsup backend** — добавить `tsup.config.ts`, script `build:server`, проверить `node dist-server/server.cjs`
3. **Electron скелет** — `electron/main.ts` (fork + wait health + BrowserWindow), `preload.ts`, `tsconfig.electron.json`
4. **electron-builder + native rebuild** — `electron-builder.yml`, postinstall hook, тест `electron:pack`
5. **Production installer** — финальный `electron:build`, тест полного флоу, документация

---

*Документ создан: 2026-06-01. Реализация: этапы запланированы, не начаты.*
