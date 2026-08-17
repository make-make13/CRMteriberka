# Windows installer release guide

Документ описывает рабочий порядок сборки, установки, обновления и smoke-проверки
Windows Electron-приложения CRM «Большая Медведица».

Цель инструкции - быстро и одинаково выпускать локальные RC/patch-сборки без
потери пользовательских данных.

---

## Где находится проект

Основная рабочая папка:

```text
D:\CRM Teriberka\CRM-main\CRM-main
```

Все команды ниже выполняются из этой папки.

---

## Требования к машине разработчика

На машине должны быть:

- Windows;
- Node.js;
- npm;
- Git;
- доступ к рабочей папке проекта;
- доступ к локальному npm cache/Electron cache, если они уже настроены.

Для текущей Windows-сборки используется команда:

```powershell
npm run electron:installer:win
```

Она задаёт `ELECTRON_CACHE=D:\Temp\electron-cache` и затем запускает обычную
installer-сборку.

---

## Проверка состояния перед сборкой

Перед сборкой проверьте, что рабочее дерево понятно и не содержит случайных
изменений:

```powershell
git status --short
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\ai\review-snapshot.ps1
```

Если в `git status --short` есть изменения, сначала нужно понять, что именно
изменено и должно ли это входить в релиз.

Для быстрой технической проверки без Electron packaging:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ai\quick-check.ps1
```

`quick-check.ps1` запускает server build и TypeScript check. Он не заменяет
полную Electron-сборку.

---

## Очистка старых build-артефактов

Перед чистой сборкой можно удалить только generated build-артефакты:

```powershell
Remove-Item -Recurse -Force .\release, .\dist, .\dist-server, .\dist-electron -ErrorAction SilentlyContinue
```

Нельзя удалять:

- `.env.local`;
- SQLite базы;
- AppData/userData;
- `storage/docx-templates`;
- `templates/docx`;
- `node_modules`, если нет отдельной причины переустановить зависимости.

---

## Техническая сборка

Минимальная последовательная проверка build-частей:

```powershell
npm run build
npm run build:server
npm run build:electron
```

Что делает каждая команда:

- `npm run build` - собирает frontend через Vite в `dist/`;
- `npm run build:server` - собирает backend в `dist-server/server.cjs`;
- `npm run build:electron` - собирает Electron main/preload в `dist-electron/`.

Если одна из этих команд падает, installer-сборку запускать рано.

---

## Electron dev

Для проверки приложения в Electron-оболочке:

```powershell
npm run electron:dev
```

Команда сначала выполняет frontend/backend/electron build, затем запускает
Electron.

Проверить вручную:

- окно открывается;
- backend стартует;
- логин проходит;
- основные разделы открываются;
- нет белого экрана.

---

## Unpacked-сборка

Для сборки unpacked-версии:

```powershell
npm run electron:pack
```

Исполняемый файл:

```text
release\win-unpacked\Bolshaya Medveditsa CRM.exe
```

Что проверить вручную:

- exe запускается;
- backend поднимается внутри Electron;
- `/api/health` отвечает;
- логин проходит;
- разделы «Шахматка», «Заявки», «Гости», «Договоры», «Дополнительно»,
  «Настройки» открываются;
- данные читаются из userData, а не из папки установки.

---

## Сборка установщика

Для сборки Windows installer:

```powershell
npm run electron:installer:win
```

Ожидаемый файл:

```text
release\Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe
```

После сборки проверьте:

```powershell
Get-ChildItem .\release -File | Select-Object Name, Length, LastWriteTime
```

Успех засчитывается только если `Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe`
существует и имеет ненулевой размер.

Готовый `Setup.exe` не нужно запускать на машине разработчика без отдельного
решения: сначала зафиксируйте, что сборка завершилась и файл создан.

---

## Если сборка зависает на signtool

Строки вида:

```text
signing with signtool.exe
```

относятся к Windows code signing. Это не ошибка компиляции frontend/backend.

Для локальной RC-сборки signing отключён в `electron-builder.yml` в секции
`win:`:

```yaml
signAndEditExecutable: false
signExts:
  - "!.exe"
```

Если в свежем логе снова появились строки `signing with signtool.exe`, нужно
проверить:

1. что `signAndEditExecutable: false` находится именно внутри секции `win:`;
2. что `signExts` содержит `!.exe`;
3. что используется свежий `electron-builder.yml`;
4. что сборка была запущена после очистки старых артефактов.

Если сборка зависла, не убивайте все `node`-процессы подряд. Разрешено
останавливать только процессы текущей сборки, где `CommandLine` явно содержит:

- `electron-builder`;
- `electron:installer`;
- `makensis`;
- `signtool`.

Для поиска:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "electron-builder|electron:installer|makensis|signtool" } |
  Select-Object ProcessId, Name, CommandLine |
  Format-List
```

---

## Установка приложения

Установщик:

```text
release\Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe
```

Порядок:

1. Запустить `Setup.exe`.
2. Если установщик предлагает папку установки, выбрать нужную папку.
3. Дождаться завершения установки.
4. Запустить CRM из меню Пуск или ярлыка.

Для локальной RC-сборки installer неподписанный. Windows SmartScreen может
показать предупреждение.

---

## Проверка установленной версии

После установки проверьте:

- приложение открывается;
- логин проходит;
- разделы открываются без белого экрана;
- существующие данные на месте;
- можно создать тестового гостя;
- можно создать тестовый договор или предбронь;
- можно создать или подтянуть тестовую заявку;
- после закрытия и повторного запуска данные сохраняются.

Также желательно проверить:

- `/api/health`;
- `/api/app-info`;
- генерацию документов;
- настройки интеграций;
- ручную Supabase sync, если настроена.

---

## Где хранятся данные

Установленная CRM хранит пользовательские данные в Electron `userData`:

```text
C:\Users\<User>\AppData\Roaming\Большая Медведица CRM
```

В этой папке находятся:

- `crm.sqlite`;
- `backups\`;
- `storage\docx-templates\`;
- настройки CRM и integration settings внутри SQLite.

Код приложения устанавливается отдельно, обычно в:

```text
%LOCALAPPDATA%\Programs\bolshaya-medveditsa-crm
```

Обновление кода не должно удалять или перезаписывать `userData`.

---

## Обновление / patch поверх старой версии

Резервная модель обновления - установка нового `Setup.exe` поверх старой версии.
Она остаётся обязательной для первичной установки и полезна как recovery-путь,
если автообновление недоступно.

Порядок patch-обновления:

1. Собрать новый `Setup.exe`.
2. Сделать backup.
3. Закрыть CRM.
4. Запустить новый installer поверх установленной версии.
5. Запустить CRM.
6. Проверить, что AppData/userData не удалён.
7. Проверить, что данные, backups, DOCX-шаблоны и настройки сохранились.

Минимальный backup:

- backup через настройки CRM, если доступен;
- копия `crm.sqlite` из `userData`;
- при необходимости копия `storage\docx-templates\`.

---

## Публикация автообновления

В CRM подключён `electron-updater` для Windows NSIS-сборки. Установленная
packaged-версия проверяет GitHub Releases после запуска, скачивает новую версию
и предлагает перезапустить программу.

Порядок выпуска:

1. Поднять версию в `package.json` и `package-lock.json`. Версия должна быть
   semver, например `0.1.5`.
2. Выполнить обычные проверки.
3. Задать `GH_TOKEN` в локальном окружении разработчика. Не коммитить токен и не
   добавлять его во frontend env.
4. Запустить:

```powershell
npm run electron:release:github
```

Команда собирает installer и публикует release artifacts в GitHub Releases
репозитория `make-make13/CRMteriberka`. После публикации старая установленная
CRM увидит новую версию при следующей проверке обновлений.

Перед использованием для реальных пользователей нужно отдельно проверить сценарий:

```text
старая установленная версия -> GitHub Release с новой версией -> автообновление -> проверка данных
```

Если GitHub Releases не должны быть публичным каналом обновлений, нужно заменить
`publish` в `electron-builder.yml` на `generic` HTTPS-хостинг и публиковать туда
`Setup.exe`, `latest.yml` и сопутствующие update artifacts.

---

## Что нельзя делать

Нельзя:

- удалять AppData/userData без backup;
- хранить пользовательские данные в папке установки;
- переносить `crm.sqlite` в папку установки;
- менять SQLite-схему без миграции и backup;
- убивать все `node`-процессы подряд;
- запускать готовый `Setup.exe` без решения, что сейчас проверяется установка;
- коммитить build-артефакты (`release`, `dist`, `dist-server`, `dist-electron`);
- коммитить SQLite базы, backups, `.env.local`, logs, `node_modules`.

---

## Минимальный smoke-check перед передачей пользователю

Перед передачей установщика пользователю:

1. Проверить, что `Setup.exe` существует и имеет ненулевой размер.
2. Установить приложение на тестовой машине или тестовом профиле Windows.
3. Запустить CRM.
4. Войти в систему.
5. Открыть все основные разделы.
6. Создать тестового гостя.
7. Создать тестовый договор или предбронь.
8. Проверить сохранение после перезапуска.
9. Проверить генерацию хотя бы одного документа.
10. Проверить, что `crm.sqlite` лежит в AppData/Roaming userData.
11. Установить новый `Setup.exe` поверх старого и убедиться, что данные не пропали.

---

## Известные предупреждения, которые не блокируют сборку

Если сборка завершается успешно, эти предупреждения сами по себе не являются
блокерами:

- большие Vite chunks из-за PDFMe;
- unsigned installer и возможный Windows SmartScreen;
- missing `author` / `description` в `package.json`;
- duplicate/invalid dependency warnings от electron-builder collector;
- предупреждение electron-builder, что `asar` отключён.

Эти предупреждения нужно учитывать перед production-релизом, но для локальной
RC-сборки они допустимы.

---

## Что отложено

На будущие проходы отложено:

- code signing;
- differential updates;
- полноценный auto-update UI;
- стратегия rollback после неудачного обновления;
- оптимизация размера пакета и `asar` / `asarUnpack`.
