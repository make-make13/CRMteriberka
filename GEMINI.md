# GEMINI.md

## Project

CRM «Большая Медведица» — локальная CRM для бутик-отеля.

Main stack:
* React
* Vite
* TypeScript
* Express
* SQLite
* PDFMe
* Supabase as external landing lead buffer

Main sections:
* Шахматка
* Заявки
* Гости
* Договоры
* Дополнительно
* Настройки

## Before every task

1. Read:
   * `AGENTS.md`
   * `docs/WORKLOG.md`
   * `README.md`

2. Run:
   * `git status --short`

3. If there are uncommitted changes:
   * report them;
   * stop;
   * do not continue without user confirmation.

## Critical safety rules

Never expose secrets:
* do not print `.env.local`;
* do not print `SUPABASE_SERVICE_ROLE_KEY`;
* do not add service role keys to frontend;
* do not create `VITE_SUPABASE_SERVICE_ROLE_KEY`.

Do not commit:
* `.env.local`
* SQLite database files
* backups
* `node_modules`
* `dist`
* logs

Never use:
* `git push --force`

Do not change without explicit instruction:
* PDFMe generator
* contract templates
* `saveContract()`
* booking conflict logic
* SQLite schema
* Git remote
* Supabase SQL
* `.env.local`

## Checks policy

Do not run `npm run lint` or `npm run build` for small documentation, styling, UI text, color, or layout changes unless explicitly requested.

Run targeted tests plus `npm run lint` and `npm run build` only for risky changes:
* backend/API changes;
* SQLite schema changes;
* Supabase sync changes;
* contract flow changes;
* PDFMe changes;
* `saveContract()` changes;
* booking conflict logic changes.

## Worklog rule

After each meaningful completed stage:

1. Update `docs/WORKLOG.md`.
2. Keep it short.
3. Include:
   * what changed;
   * files changed;
   * checks run;
   * next recommended step;
   * risks/TODOs.

## Context management

If the task becomes long or context grows:

1. Stop starting new large changes.
2. Update `docs/WORKLOG.md`.
3. Write a short checkpoint summary.
4. Ask the user to start a new session or compact context.

If the agent crashes or context recovery fails:

1. Stop.
2. Run only:
   * `pwd`
   * `git status --short`
   * `git diff --stat`
   * `git log --oneline -5`
3. Report current state.
4. Do not continue coding until user confirms.

## Current product state

Implemented:
* CRM cleaned for «Большая Медведица»;
* legacy project files archived outside the repo;
* 20 real hotel rooms in catalog;
* local leads module;
* Supabase manual lead sync;
* lead to guest conversion;
* lead to prebooking flow;
* prebooking to contract flow;
* contract numbers use `БМ`;
* company settings updated;
* backup defaults isolated from the old CRM.

Current focus:
* refine chessboard visual theme;
* keep dark graphite UI, but make status colors brighter and clearer.
