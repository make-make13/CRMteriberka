# Codex Handoff — CRM «Большая Медведица»

> Файл передачи контекста между AI-ассистентами.
> Последнее обновление: 2026-06-01. Проект: `D:\CRM Teriberka\CRM-main\CRM-main`

---

## 1. Что это за проект

**CRM «Большая Медведица»** — система управления гостями, бронированиями и договорами
для базы отдыха «Терибёрка» (Мурманская область).

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS (SPA)
- **Backend**: Express.js + TypeScript + better-sqlite3 (локальный SQLite)
- **Desktop**: Electron 36 оболочка
- **External**: Supabase (только чтение заявок с сайта; схему Supabase НЕ менять)
- **Package name**: `bolshaya-medveditsa-crm`, version `0.1.0`

---

## 2. Постоянные ограничения (ВСЕГДА соблюдать)

```
НЕ ТРОГАТЬ:
  - PDFMe, saved_pdfme_templates, счёт, акт, основная PDFMe-генерация
  - GB/legacy договоры
  - Текст договора, DOCX-шаблон, карточку гостя, код подразделения
  - Создание договора из заявки (старый путь)
  - Документы, DOCX/PDFMe, шахматку (Chessboard), цены номеров, договоры
  - Supabase schema (только читать, не менять таблицы)
  - Telegram bot, VK adapter, OpenAI/Gemini/Ollama, RAG, webhooks в CRM
  - Бизнес-логику создания гостя

НЕ ДЕЛАТЬ без явной команды пользователя:
  - auto-update программы
  - перенос существующей базы данных
  - большие рефакторинги
  - КОММИТЫ (всегда ждать подтверждения: "коммитим", "добавь в коммит" и т.д.)
```

---

## 3. Актуальное состояние Git

```
Branch: bm-contract-current-working-20260530-060021
Remote: https://github.com/make-make13/CRMteriberka.git

Последние коммиты:
4057953  Add automatic Supabase lead sync       ← HEAD
5b4a559  Add NSIS installer draft
d366ac2  Run packaged backend with Electron runtime
a999780  Add Electron unpacked build configuration
d520df0  Add Electron desktop foundation
5f54e76  Add app identity assets for Electron build
81e8a69  Add system status settings tab
f39dfb4  Prepare CRM for local install and updates
221958d  Add integration settings for local CRM install
```

Рабочее дерево чистое. Нет незакоммиченных изменений кода.

---

## 4. Что реализовано (полный список)

### Electron Desktop

| Компонент | Статус | Коммит |
|---|---|---|
| Electron dev prototype | ✅ | `d520df0` |
| App identity (icon.ico, icon.png, App ID) | ✅ | `5f54e76` |
| Electron unpacked build (`npm run electron:pack`) | ✅ | `a999780` |
| Backend без системного Node.js (ELECTRON_RUN_AS_NODE=1) | ✅ | `d366ac2` |
| better-sqlite3 ABI rebuild через afterPack | ✅ | `d366ac2` |
| NSIS Setup.exe draft (`npm run electron:installer`) | ✅ | `5b4a559` |
| AppData/Roaming как userData | ✅ | `d520df0` |

### Supabase

| Компонент | Статус | Коммит |
|---|---|---|
| Ручная синхронизация (кнопка "Проверить заявки") | ✅ | ранее |
| Automatic Supabase lead sync (фоновый scheduler) | ✅ | `4057953` |
| Автосинхронизация по умолчанию **выключена** | ✅ | `4057953` |
| Endpoint `GET /api/leads/auto-sync/status` | ✅ | `4057953` |

### Что НЕ реализовано

| Функция | Статус |
|---|---|
| Auto-update программы | ❌ Явно запрещено без команды |
| Перенос `data/crm.sqlite` → AppData | ❌ Не сейчас |
| Установка LibreOffice галочкой в installer | ❌ Не сейчас |
| Code signing | ❌ Не сейчас |
| Rollback после неудачной установки | ❌ Не сейчас |
| Оптимизация размера node_modules в пакете | ❌ Не сейчас |
| Полноценный installer UX (кастомные экраны) | ❌ Не сейчас |

---

## 5. Структура проекта

```
D:\CRM Teriberka\CRM-main\CRM-main\
├── server.ts                  ← главный Express backend (~760 строк)
├── server/
│   ├── localDatabase.ts       ← весь SQLite-слой (LocalDatabase class)
│   ├── authService.ts         ← pbkdf2 auth, JWT-like tokens (login: Make/3552)
│   ├── backupService.ts       ← rclone cloud backup
│   ├── supabaseLeadSync.ts    ← Supabase REST API → SQLite
│   ├── autoSyncScheduler.ts   ← фоновый scheduler автосинхронизации
│   ├── bmDocxRouter.ts        ← DOCX договоры (НЕ ТРОГАТЬ)
│   └── validation.ts
├── src/
│   ├── components/
│   │   ├── leads/Leads.tsx        ← список заявок + silent 60s polling
│   │   ├── settings/
│   │   │   ├── IntegrationsSettingsTab.tsx  ← Supabase/LibreOffice/AI + auto-sync UI
│   │   │   ├── SystemStatusTab.tsx
│   │   │   └── ...
│   │   ├── chessboard/            ← НЕ ТРОГАТЬ
│   │   ├── contracts/             ← НЕ ТРОГАТЬ
│   │   └── clients/
│   ├── services/localApi.ts       ← все HTTP-вызовы к backend
│   └── types.ts                   ← общие TypeScript типы
├── electron/
│   ├── main.ts                ← Electron main process
│   ├── findFreePort.ts
│   ├── waitForHealth.ts
│   └── preload.ts             ← пустой (CRM использует только HTTP)
├── electron-builder.yml       ← конфиг (dir + nsis targets, afterPack)
├── scripts/
│   └── afterPack.cjs          ← ABI rebuild better-sqlite3 для Electron
├── assets/app-icon/           ← icon.ico, icon.png, icon-1024.png
├── tsup.config.ts             ← server.ts → dist-server/server.cjs
├── tsup.electron.config.ts    ← electron/ → dist-electron/
└── docs/
    ├── electron-build.md      ← инструкция по Electron сборке
    ├── electron-plan.md       ← архитектурный план
    └── codex-handoff.md       ← этот файл
```

---

## 6. Ключевые файлы — важные детали

### server.ts
- `startServer()` — async, весь Express setup внутри
- При `app.listen` → вызывает `restartAutoSync()` (запускает scheduler если включён)
- `PUT /api/integration-settings` → после сохранения вызывает `restartAutoSync()`
- `GET /api/leads/auto-sync/status` → возвращает `getAutoSyncStatus()`
- `POST /api/leads/sync` → ручная синхронизация `syncSupabaseLeads()`

### server/autoSyncScheduler.ts
- `restartAutoSync()` — читает настройки из DB, `clearInterval` старый, `setInterval` новый
- `getAutoSyncStatus()` — возвращает состояние: `{enabled, intervalMinutes, running, lastRunAt, lastSuccessAt, lastErrorAt, lastError, lastPulledCount}`
- Guard флаг `state.running` предотвращает параллельные запуски
- Все ошибки ловятся, сервер не падает
- Supabase "не настроен" → только `console.warn`, не ошибка

### server/supabaseLeadSync.ts
- `syncSupabaseLeads()` — используется и scheduler, и ручным POST `/api/leads/sync`
- Читает config из DB → env fallback
- Fetches `pulled_to_crm=false` из Supabase REST API
- `localDb.getLeadBySupabaseId()` — проверка дублей
- PATCH Supabase: `pulled_to_crm=true, pulled_to_crm_at, crm_lead_id`

### server/localDatabase.ts — Integration Settings fields
```typescript
// В IntegrationSettingsStored / Input / Masked:
supabaseAutoSyncEnabled?: boolean;        // default: false
supabaseAutoSyncIntervalMinutes?: number; // default: 5
// Допустимые интервалы: 1, 3, 5, 10, 15, 30 мин
```

### electron/main.ts — backend spawn
```typescript
// packaged (app.isPackaged=true):
spawn(process.execPath, [serverEntry], { env: { ELECTRON_RUN_AS_NODE: '1', ... } })
// dev (app.isPackaged=false):
spawn('node', [serverEntry], { env })
```

### scripts/afterPack.cjs
- Вызывается electron-builder после копирования файлов в output
- `prebuild-install --runtime=electron --target=36.9.5`
- Source ABI 127 (system Node) не трогается
- Packaged ABI 135 (Electron 36) в `release/.../node_modules/better-sqlite3`

---

## 7. ABI better-sqlite3

| Runtime | Node version | ABI |
|---------|-------------|-----|
| System Node | v22.22.2 | 127 — dev, `npm run dev`, `electron:dev` |
| Electron 36 | v22.19.0 | 135 — `electron:pack`, `electron:installer` |

Prebuilt для ABI 135 есть на GitHub releases better-sqlite3 v12.9.0.

```bash
# Восстановить ABI 127 после сборки (если нужно):
npm run rebuild:dev
```

---

## 8. Electron build — команды

```powershell
# ВСЕГДА нужна из-за broken NTFS reparse point:
$env:ELECTRON_CACHE = "D:\Temp\electron-cache"

npm run electron:dev          # dev с Electron (открывает окно)
npm run electron:pack         # unpacked → release/win-unpacked/
npm run electron:installer    # NSIS Setup.exe → release/Большая-Медведица-CRM-Setup-0.1.0.exe
npm run electron:installer:win  # то же + ELECTRON_CACHE (cmd синтаксис)
```

**Пути:**
- Installed app: `C:\Users\Make\AppData\Local\Programs\bolshaya-medveditsa-crm\`
- User data: `C:\Users\Make\AppData\Roaming\Большая Медведица CRM\crm.sqlite`
- Project DB (НЕ ТРОГАТЬ): `D:\CRM Teriberka\CRM-main\CRM-main\data\crm.sqlite`

---

## 9. API endpoints — полный список

```
Auth:
  POST /api/auth/login             { login, password } → { token, manager }
  GET  /api/auth/me
  POST /api/auth/logout

Clients:   GET/POST /api/clients, DELETE /api/clients/:id
Contracts: GET/POST /api/contracts, DELETE /api/contracts/:id
Bookings:  GET /api/bookings

Leads:
  GET  /api/leads[?status=&search=]
  POST /api/leads
  GET  /api/leads/:id
  PUT  /api/leads/:id
  DELETE /api/leads/:id
  POST /api/leads/sync               ← ручная Supabase sync
  GET  /api/leads/auto-sync/status   ← статус планировщика
  POST /api/leads/:id/create-client

Integration Settings:
  GET  /api/integration-settings
  PUT  /api/integration-settings
  POST /api/integration-settings/test-supabase
  POST /api/integration-settings/detect-libreoffice
  POST /api/integration-settings/test-libreoffice
  POST /api/integration-settings/test-ai-backend

System:
  GET  /api/health
  GET  /api/app-info       { version, mode, dataDir, dbPath }
  GET  /api/system/status
  POST /api/backups
  GET  /api/backups
  POST /api/backups/cloud
```

---

## 10. Детали сборки

### server.ts → dist-server/server.cjs (через tsup)
- `"type":"module"` → output extension `.cjs`
- `vite` external → `await import('vite')` ВНУТРИ `if (!production)` блока (НЕ top-level)
- `better-sqlite3` external (native addon)
- Banner: `const __cjsImportMetaUrl = require("url").pathToFileURL(__filename).href;`

### Запуск для тестирования API:
```bash
npm run build:server
NODE_ENV=production node dist-server/server.cjs
# → http://localhost:3002
```

---

## 11. Автосинхронизация — как работает

```
По умолчанию: выключена (supabaseAutoSyncEnabled = false)

Включение:
  Настройки → Интеграции → Supabase → чекбокс "Автоматически проверять" → выбрать интервал → Сохранить

Допустимые интервалы: 1, 3, 5, 10, 15, 30 минут

Статус: GET /api/leads/auto-sync/status
  {
    "enabled": false,
    "intervalMinutes": 5,
    "running": false,
    "lastRunAt": "...",
    "lastSuccessAt": "...",
    "lastErrorAt": null,
    "lastError": null,
    "lastPulledCount": 6
  }

UI статус: обновляется каждые 10 секунд, пока открыта секция Supabase

Дубли: не создаются — Supabase PATCH pulled_to_crm=true после успешного sync,
        localDb.getLeadBySupabaseId() проверяет перед созданием

Параллельность: isRunning guard — тик пропускается если предыдущий идёт
Ошибки: ловятся, сервер не падает, статус записывается в lastError
```

---

## 12. Настройки окружения

`.env.local` (не в git):
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_LEADS_TABLE=leads
PORT=3002
```

Логин: `Make / 3552` (admin)

---

## 13. Следующие рекомендуемые задачи

**Высокий приоритет (предложены пользователем):**
1. **Installer polish / first-run checks** — проверка при первом запуске:
   - Уведомление что данные хранятся в AppData
   - Проверка LibreOffice (нужен для договоров)
   - Подсказка о настройке Supabase

2. **Подготовка к автообновлениям** — только архитектурный план,
   НЕ реализовывать без отдельной команды пользователя

**Низкий приоритет:**
- Оптимизация node_modules в пакете (сейчас ~300 MB, можно сократить)
- asar + asarUnpack для better-sqlite3
- Installer UX (кастомный экран, логотип)

---

## 14. Стандартный workflow

```bash
# 1. Проверить состояние
git status --short
git log --oneline -5

# 2. Dev для тестирования
npm run dev                    # tsx + vite dev server

# 3. Production bundle
npm run build:server && NODE_ENV=production node dist-server/server.cjs

# 4. Electron dev
npm run electron:dev           # требует Node.js в PATH

# 5. НИКОГДА не коммитить без явного "коммитим" от пользователя!

# 6. Формат коммита
git commit -m "$(cat <<'EOF'
Краткое описание

- детали
- детали

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

---

## 15. Кодовые паттерны

### Новый API endpoint:
```typescript
// server.ts, внутри startServer()
app.get('/api/something', requireAuth, (req, res) => {
  try {
    res.json(localDb.getSomething());
  } catch (error) {
    res.status(400).json({ error: asErrorMessage(error) });
  }
});
```

### Новое поле в integration settings (5 мест):
1. `server/localDatabase.ts` → `IntegrationSettingsStored`
2. `server/localDatabase.ts` → `IntegrationSettingsInput`
3. `server/localDatabase.ts` → `IntegrationSettingsMasked`
4. `server/localDatabase.ts` → `maskIntegrationSettings()` return
5. `server/localDatabase.ts` → `saveIntegrationSettings()` next object
6. `src/services/localApi.ts` → оба interface
7. `src/components/settings/IntegrationsSettingsTab.tsx` → state + load + save + UI

---

## 16. Известные баги / особенности

1. **NTFS reparse point** в `C:\Users\Make\AppData\Local\electron\Cache` — сломан.
   Workaround: `$env:ELECTRON_CACHE = "D:\Temp\electron-cache"` при electron-builder.

2. **Pre-existing TypeScript errors** (не мешают сборке, НЕ трогать):
   - `scripts/create_bm_contract_template_poc.ts` — AlignmentType type error
   - `src/components/chessboard/Chessboard.tsx` — unused comparison
   - `src/utils/docx/bmDocxBuilder.ts` — AlignmentType, AT_LEAST

3. **react-dom@19.2.4 "invalid"** в npm — pre-existing, не мешает работе.

4. **Encoding corruption** в части старых записей БД — известно, не блокирует.

5. **rclone cloud backup** — может падать без настроек remote, это ожидаемо.

6. **Windows SmartScreen** предупреждает при запуске Setup.exe — нет codesign.
