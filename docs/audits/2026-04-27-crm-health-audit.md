# CRM Health Audit — 2026-04-27

## Короткий итог

Приложение в рабочем состоянии: TypeScript-проверка, audit-тесты и production build проходят. Главные найденные риски сейчас не в бизнес-логике договоров, а в инфраструктуре и сопровождении:

- исправлено после аудита: `npm run test:local-api` обновлён под авторизацию;
- исправлено после аудита: добавлен `npm run check:encoding` и он подключён к `test:audit-fixes`;
- build собирает очень крупные чанки PDFMe editor/assets;
- локальная папка проекта раздута бэкапами и временными PDF;
- в `package.json` есть кандидаты на неиспользуемые зависимости;
- часть подтверждений всё ещё на `window.confirm`;
- несколько ключевых файлов стали слишком большими и дорогими для безопасной поддержки.

## Проверки

| Проверка | Результат | Комментарий |
|---|---:|---|
| `npm run lint` | PASS | `tsc --noEmit` проходит |
| `npm run test:audit-fixes` | PASS | `auditFixesTest: ok` |
| `npm run build` | PASS | есть предупреждение о больших чанках |
| `npm run test:local-api` | FIXED | smoke test логинится и передаёт auth token |
| `npm run check:encoding` | ADDED | проверяет пользовательский код на признаки битой кодировки |

## P0 / P1: исправить в первую очередь

### P1. `test:local-api` сломан после авторизации — исправлено

Файл: `scripts/localApiSmokeTest.mjs`

Симптом: тест сразу падает на первом защищённом API-запросе с `401 Требуется авторизация`.

Причина: smoke test был написан до авторизации менеджеров и не делает login / не передаёт `Authorization: Bearer <token>`.

Сделано:

- добавлен логин в начале теста через `POST /api/auth/login`;
- `Make / 3552` используется как локальный smoke-аккаунт по умолчанию;
- `Authorization` передаётся во все защищённые запросы;
- cleanup-запросы тоже выполняются с token.

### P1. Защита от кракозябр — исправлено

Файлы: `scripts/checkEncoding.mjs`, `package.json`

Риск: строки битой кодировки могут всплывать пользователю при ошибках API. Это тот же класс проблемы, который уже появлялся в интерфейсе.

Сделано:

- добавлен быстрый скрипт проверки кодировки;
- добавлена команда `npm run check:encoding`;
- проверка подключена к `npm run test:audit-fixes`;
- специальные legacy/test fixtures исключены из проверки, чтобы не ловить намеренно сохранённые входные данные для нормализации.

### P1. Очень крупные чанки сборки

Build warning:

- `PdfmeTemplateEditorModal-*.js` около `10 MB`;
- `index-*.js` около `3 MB`;
- `pdfmeStaticAssets-*.js` около `2.85 MB`.

Риск: медленный старт приложения, тяжёлые обновления, долгий первый рендер на слабой машине.

Что сделать:

- проверить, что PDFMe editor грузится только лениво при открытии редактора;
- вынести тяжёлые static assets из JS bundle в `public`/URL, если они сейчас инлайнятся;
- разделить editor и generator chunks через dynamic import/manual chunks;
- не трогать координаты и структуру PDFMe-шаблонов.

## P2: улучшить после первичных фиксов

### P2. Локальный проект раздут временными и backup-файлами

Размеры папок:

- `data` — около `632.88 MB`;
- `tools` — около `81.62 MB`;
- `tmp` — около `56.95 MB`;
- `dist` — около `19.57 MB`.

Крупные файлы:

- `data/backups/scheduled/crm-weekly-2026-04-25-12-44-14.zip` — `170.87 MB`;
- `data/backups/scheduled/crm-weekly-2026-04-25-11-33-52.zip` — `170.87 MB`;
- `tools/rclone/rclone.exe` — `72.44 MB`;
- `data/crm.sqlite` — `51.52 MB`;
- `data/crm.sqlite-wal` — `11 MB`;
- много `tmp/pdfs/*.pdf` и `tmp/pdfs/*.png`.

Что сделать:

- ничего не удалять автоматически;
- добавить UI-кнопку/админ-команду “Очистить временные файлы” для `tmp/pdfs`;
- добавить отдельный cleanup для старых scheduled backup по retention;
- проверить, нужен ли локальный bundled `tools/rclone`, или лучше использовать системный `rclone`;
- проверить, можно ли выполнить SQLite checkpoint/VACUUM через безопасную админ-команду.

### P2. В git лежат два больших backup JSON шаблона

Tracked files:

- `data/backups/templates/cc_contract_pdfme-2026-04-25-05-02.pdfme.json` — `10.89 MB`;
- `data/backups/templates/gb_contract_pdfme-2026-04-25-04-35.pdfme.json` — `10.87 MB`.

Комментарий: это похоже на осознанные эталонные PDFMe backup-файлы. Удалять нельзя без отдельного решения, но репозиторий они утяжеляют.

Варианты:

- оставить как эталонные стандартные шаблоны;
- перенести в release/artifacts;
- заменить компактными fixtures, если удастся восстановить шаблоны из кода.

### P2. Неиспользуемые зависимости-кандидаты

По простому поиску импортов не найдены в `src/server/scripts`:

- `@google/genai`;
- `@hookform/resolvers`;
- `@types/nodemailer` в `dependencies`, хотя это типы;
- `docxtemplater`;
- `file-saver`;
- `idb`;
- `jspdf`;
- `jspdf-autotable`;
- `pizzip`;
- `zod`.

Что сделать:

- проверить каждую зависимость через точный импортный анализ;
- не удалять пакеты, если они нужны для планируемого legacy HTML/DOCX пути;
- типы перенести из `dependencies` в `devDependencies`, если реально нужны только для сборки.

### P2. Остались системные confirm в настройках

Файлы:

- `src/components/settings/PdfmeTemplateEditorModal.tsx`;
- `src/components/settings/SettingsView.tsx`.

Сценарии:

- закрыть PDFMe editor без сохранения;
- сбросить шаблон;
- удалить настроенный шаблон.

Что сделать:

- заменить на общий `ConfirmDialog`;
- не менять логику сохранения шаблонов;
- сохранить особую осторожность для PDFMe: подтверждение должно явно говорить, что несохранённые изменения будут потеряны.

## P3: архитектурные долги

### Крупные файлы

Самые большие файлы по строкам:

- `src/utils/pdfmeTemplates.ts` — около `2093` строк;
- `src/components/settings/HtmlTemplateEditorModal.tsx` — около `1398`;
- `src/components/contracts/ContractModal.tsx` — около `1377`;
- `src/components/settings/PdfmeTemplateEditorModal.tsx` — около `1252`;
- `scripts/auditFixesTest.ts` — около `1225`;
- `src/components/settings/SettingsView.tsx` — около `773`;
- `src/components/chessboard/Chessboard.tsx` — около `722`;
- `server/localDatabase.ts` — около `618`;
- `src/components/contracts/Contracts.tsx` — около `604`.

Риск: любые изменения дорогие, высок риск случайно сломать соседний сценарий.

Что делать постепенно:

- вынести расчёты договоров и PDF data mapping в отдельные utils;
- разделить `ContractModal` на блоки: клиент, бронирование, оплаты, история, документы;
- разделить `SettingsView` по вкладкам;
- разделить `auditFixesTest.ts` на тематические тесты;
- `pdfmeTemplates.ts` оставить очень осторожно: сначала только выделить helper-части, не трогая координаты.

### Много `any`

Основные зоны:

- PDFMe editor;
- HTML editor/Jodit;
- audit tests;
- `localApi`;
- `Chessboard`.

Что делать:

- не пытаться “починить всё сразу”;
- начать с `localApi` и фильтров договоров, где типизация даст быстрый выигрыш;
- редакторы типизировать постепенно, так как внешние библиотеки слабее типизированы.

## Что не считается проблемой прямо сейчас

- `dist/` игнорируется git и является результатом сборки.
- `data/crm.sqlite` не трекается git и является рабочей локальной базой.
- `server-dev*.log`, `tmp/`, `template_out.json`, `user_requested_schema*.json` уже покрыты `.gitignore`.
- `console.error` не является критичной проблемой сам по себе, если пользователь получает toast/понятную ошибку. Но шум в консоли стоит чистить после UX-фиксов.

## Рекомендуемый порядок исправлений

1. Добавить безопасную очистку `tmp/pdfs` и отчёт по размеру backup-папки.
2. Проверить и почистить package dependencies.
3. Заменить оставшиеся `window.confirm` на фирменные модалки.
4. Оптимизировать lazy loading/chunks PDFMe editor.
5. Начать постепенное разделение больших файлов маленькими PR/коммитами.
