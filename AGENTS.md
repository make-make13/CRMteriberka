# AGENTS.md

## Project

CRM «Большая Медведица» — локальная CRM для гостиницы.

Основные разделы:
- Шахматка
- Заявки
- Гости
- Договоры
- Дополнительно
- Настройки

Стек:
- React
- Vite
- TypeScript
- Express
- SQLite
- PDFMe
- Supabase для буфера заявок

## Critical rules

Never expose secrets:
- do not print `.env.local`;
- do not print `SUPABASE_SERVICE_ROLE_KEY`;
- do not add service role keys to frontend;
- do not create `VITE_SUPABASE_SERVICE_ROLE_KEY`.

Do not commit:
- `.env.local`
- SQLite databases
- backups
- `node_modules`
- `dist`
- logs

Do not use:
- `git push --force`

Do not change without explicit instruction:
- PDFMe generator
- contract templates
- `saveContract()`
- booking conflict logic
- SQLite schema for existing entities
- Git remote

## Worklog rule

At the start of every task:
1. Read `docs/WORKLOG.md`.
2. Run `git status --short`.
3. If there are uncommitted changes, report them first and do not continue without confirmation.

During work:
1. Keep tasks small and checkpointed.
2. Update `docs/WORKLOG.md` after each meaningful completed stage.
3. Write concise notes, not long transcripts.
4. Include:
   - date/time if available;
   - task name;
   - files changed;
   - what was completed;
   - checks run;
   - next recommended step;
   - any risks or TODOs.

At the end of every task:
1. Update `docs/WORKLOG.md`.
2. Report changed files.
3. Report whether commit/push was done.
4. If only documentation or text changed, do not run `npm run lint` or `npm run build` unless explicitly requested.
5. If backend, API, database, sync, contracts, PDFMe, or critical TypeScript changed, run targeted tests plus `npm run lint` and `npm run build`.

## Context management rule

Use `/status` or available session status tools to monitor context usage when possible.

When context usage approaches about 60%:
1. Stop starting new large changes.
2. Update `docs/WORKLOG.md`.
3. Write a short checkpoint summary.
4. Ask the user to start a new session or run `/compact` if available.
5. Do not continue into a large new step until the checkpoint is saved.

If context compaction or session recovery fails:
1. Stop.
2. Run:
   - `pwd`
   - `git status --short`
   - `git diff --stat`
   - `git log --oneline -3`
3. Report current state.
4. Do not continue coding until the user confirms.

## Current project state

- CRM interface has been cleaned for «Большая Медведица».
- New GitHub repo is connected.
- Local module «Заявки» works.
- Supabase project and `public.leads` table are created.
- Manual Supabase lead sync is implemented.
- Current known issue/next cleanup:
  - improve source labels in «Заявки»;
  - make Supabase lead labels clearer;
  - harden Leads UI against null/unknown fields.
