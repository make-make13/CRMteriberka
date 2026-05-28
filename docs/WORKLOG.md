# WORKLOG

## Current state

CRM «Большая Медведица» is a local hotel CRM based on the cleaned previous CRM.

Implemented:
- hotel-style chessboard;
- guests UI wording;
- cleaned contracts UI;
- cleaned additional section;
- local leads module;
- Supabase leads table;
- manual Supabase sync button;
- GitHub repo connected and pushed.

Do not expose:
- `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY`
- SQLite database files

Next recommended step:
- fix Leads UI source labels and sync labels;
- harden Leads UI against null/unknown fields;
- then add conversion: Lead → Guest.

## Entries

### 2026-05-28 — Investigate guest deletion guard failure (post-mortem)

Backup created before investigation:
`data/backups/manual-before-guest-delete-guard-fix-2026-05-28-08-38-23.crm.sqlite`

**Root cause of guard failure:**
The server runs via `npm run dev` → `tsx server.ts` (no auto-reload/watch).
After commit `e385aff` added the `listContractsByClient` guard, the running server
process was NOT restarted. The old code (without the guard) continued running and
directly called `deleteClient` with no contract check.

The guard code itself is correct:
- SQL `WHERE client_id = ?` finds contracts correctly (verified directly in SQLite)
- `apiRequest` correctly propagates HTTP 409 as a thrown Error
- UI catch block shows toast and closes dialog (fixed in `ca74217`)

No code changes needed. The guard is correct and will work after server restart.

**Data state after incident:**
- clients table: 0 rows (all deleted during testing)
- contracts table: 3 rows with orphaned client_ids:
  - `client-1779903443154-zfyotz` → contract БМ1 (recoverable from daily backup)
  - `client-1779915472838-2sukfz` → contract ЧЧ2 (already missing before this session)
  - `client-1779917238631-4j9es7` → contract БМ3 (already missing before this session)

**Recoverable client (from daily backup `crm-daily-2026-05-28-08-24-12.zip`):**
"Тест после очистки" — test client (empty passport, test phone/email).
Recovery SQL available on request; awaiting user confirmation before restoring.

**Action required by user:**
Restart the server (`npm run dev`) to activate the guard code from commit `e385aff`.

### 2026-05-28 — Fix guest deletion warning visibility

Files changed:
- `src/components/clients/Clients.tsx`

Problem: after admin tried to delete a guest with linked contracts, the 409 error
toast was obscured by the ConfirmDialog remaining open (setClientPendingDelete(null)
was only called on success, not on error).

Fix: added `setClientPendingDelete(null)` in the catch block so the dialog closes
before the toast renders, making the error message visible.

Server-side guard (server.ts) and API error propagation (localApi.ts) were
already correct — this was purely a UI state sequencing issue.

### 2026-05-28 — Harden guest deletion and email settings (audit fix)

Files changed:
- `server.ts`
- `server/localDatabase.ts`
- `src/components/settings/EmailSettingsTab.tsx`
- `src/components/clients/ClientModal.tsx`

Completed:

**1. Guest deletion guard**
- `DELETE /api/clients/:id` now calls `listContractsByClient(id)` before deleting.
- If any contracts/pre-bookings exist → returns HTTP 409 with a Russian error message.
- Existing error handler in `Clients.tsx` shows the message via toast — no UI changes needed.
- Guest with zero contracts deletes as before.

**2. SMTP app password persistence**
- Confirmed bug: `saveEmailSettings` was explicitly stripping `appPassword` before writing to DB.
- `getSmtpConfig` read password only from `process.env.SMTP_PASSWORD`, never from DB.
- The UI password field was `disabled` with `value=""` — completely non-functional.
- Fix: `saveEmailSettings` now saves `appPassword` if non-empty; if empty string received, preserves existing stored password.
- `getSmtpConfig` now checks `storedSettings.appPassword` as fallback when env var is absent.
- UI field made interactive with correct placeholder "Оставьте пустым, чтобы не менять".
- GET `/api/email-settings` still strips password from response (correct — never expose to frontend).

**3. "Создать договор" stub removed from ClientModal**
- The button in view mode was a TODO stub: clicked → modal closed, nothing happened.
- Replaced with no primary action in footer when in view mode (header already has "Редактировать").
- No business logic changed; contract creation flow untouched.

**4. contractId / prebookingId on Lead — analysis only, no changes**
- Confirmed: when prebooking is created from lead, both `contractId` and `prebookingId` are set to prebooking's ID.
- When prebooking is converted to real contract, `contractId` is updated to real contract ID.
- The overloading of `contractId` is architecturally ambiguous but the current flow works correctly.
- Not changed pending separate review.

Checks run:
- `git status --short`
- `git diff --stat`

Risks/TODOs:
- `npm run lint` and `npm run build` not run per task rules.
- SQLite schema has no FK constraint — the server-level guard is the only protection against orphan contracts.

### 2026-05-28 — Polish graphite UI accents and guest modal

Files changed:
- `index.html`
- `src/components/clients/ClientModal.tsx`
- `src/components/settings/BackupSettingsTab.tsx`
- `src/components/settings/ManagersSettingsTab.tsx`
- `src/components/settings/SettingsView.tsx`
- `src/components/additional/Additional.tsx`
- `docs/WORKLOG.md`

Completed:
- Fixed Chrome Auto-Translate white screen: added `lang="ru" translate="no"` to `index.html`, preventing React 19 `removeChild` crash.
- Strengthened CTA accents: replaced cold `#8CAFBE` and orange-500 primary buttons with warm `#D98E2B` / hover `#F2B35B` across the CRM.
- ClientModal: CTA footer buttons (Создать/Сохранить, Создать договор) now use warm CTA `#D98E2B`.
- SettingsView: main "Сохранить изменения" button now uses warm CTA.
- BackupSettingsTab: "Сохранить настройки" and "Создать бэкап" buttons now use warm CTA.
- ManagersSettingsTab: Save button, section icon, admin avatar badge all converted to `#D98E2B` palette; manager avatar uses `#8CAFBE` for non-admin.
- Additional: "Добавить" task button, "Печать" button, active time-toggle, form focus borders all converted from orange to warm CTA palette.
- Business logic was not changed; no API, PDFMe, saveContract(), or backup commands were touched.

Checks run:
- `git status --short`
- `git diff --stat`

Next:
- Continue UI polish or begin next feature task.

### 2026-05-28 05:05 +03:00 — Fix BackupSettingsTab runtime crash

Files changed:
- `src/components/settings/BackupSettingsTab.tsx`
- `docs/WORKLOG.md`

Completed:
- Found the cause of the white screen / runtime crash when navigating to the "Settings" > "Backup" tab: missing `status.rclone` object from the backend response was causing a `TypeError: Cannot read properties of undefined (reading 'available')`.
- Fixed the crash by using optional chaining (`status.rclone?.available` and `status.rclone?.error`) to safely handle cases where the `rclone` status object is undefined.
- Also added optional chaining to `lastResult.remotes` and `lastResult.errors` arrays to prevent potential crashes if the backend omits them.
- Business logic was not changed.

Checks run:
- `git status --short`

Next:
- Continue graphite UI redesign tasks.

Risks/TODOs:
- `npm run lint` and `npm run build` were not run per task instruction.

### 2026-05-28 04:50 +03:00 — Unify prebooking modal graphite UI

Files changed:
- `src/components/contracts/PreBookingModal.tsx`
- `docs/WORKLOG.md`

Completed:
- Applied dark graphite visual style to `PreBookingModal`.
- Replaced old near-black backgrounds (#0f0f0f, #1a1a1a), white/10 borders, and bright yellow (#eab308, #ffc107) accents with the coordinated graphite palette (#1A1C1B inputs, #222421 modal bg, #3D423E borders, #8CAFBE focus, #FFE08A save button, #F3B2BF errors, #B4CDD2 secondary text).
- Updated labels, select, date/time inputs, textarea, comment toggle, action buttons, delete/cancel links.
- Business logic, handlers, validation, `contractApi.save()`, and prebooking-to-contract flow were NOT changed.

Checks run:
- `git status --short`

Next:
- Apply graphite theme to `ContractModal.tsx` in a separate step.

Risks/TODOs:
- `npm run lint` and `npm run build` were not run per task instruction.
- `ContractModal.tsx` still uses the old color scheme.

### 2026-05-28 04:10 +03:00 — Unify contracts list graphite UI

Files changed:
- `src/components/contracts/Contracts.tsx`
- `docs/WORKLOG.md`

Completed:
- Applied dark graphite visual style to the "Contracts" (Договоры) list view.
- Coordinated list styles, borders, input search, period calendars, pagination, and status badges with the new graphite palette (#1A1C1B, #222421, #292B28, #3D423E, #8CAFBE, #B4CDD2).
- Restyled the "На печать" and "На отправку" buttons using unified non-neon colors and softer active borders in dark mode.
- Ensured contract numbers with the "БМ" prefix remain visually accented.
- Business logic was not changed.

Checks run:
- Manual visual check of the contracts page in the browser (filters, table rows, statuses, action buttons, pagination).
- `git status --short`

### 2026-05-28 04:00 +03:00 — Unify leads and guests graphite UI

Files changed:
- `src/components/leads/Leads.tsx`
- `src/components/leads/LeadModal.tsx`
- `src/components/leads/LeadStatusBadge.tsx`
- `src/components/clients/Clients.tsx`
- `src/components/clients/ClientModal.tsx`
- `docs/WORKLOG.md`

Completed:
- Applied dark graphite visual style to the "Leads" (Заявки) and "Guests" (Гости) sections, including lists, cards, form inputs, status badges, and action buttons.
- Replaced orange accents and plain black colors with the boutique hotel graphite-gray scheme (#1A1C1B, #222421, #292B28, #3D423E, #8CAFBE, #B4CDD2).
- `Contracts.tsx` has been intentionally rolled back and will be updated in a separate step to maintain stability.
- Business logic was not changed.

Checks run:
- Manual visual check in the browser (leads table, lead modal, guest table, guest modal).
- `git status --short`

### 2026-05-28 03:16 +03:00 — Graphite theme full workflow validation

Files changed:
- `docs/WORKLOG.md`

Completed:
- Verified the complete CRM business workflow under the new graphite visual theme.
- Validated "Leads" section readability and Supabase lead syncing.
- Successfully verified lead-to-guest conversion and guest list updates.
- Verified lead-to-prebooking creation, room selection, and "Предбронь" calendar status rendering (yellow badge).
- Verified prebooking-to-contract conversion with the "БМ" contract number prefix and visual status update on the chessboard.
- Confirmed there are no console errors, active room counts are intact (20 rooms), and no redundant layout blocks are present.

Checks run:
- `npx tsx scripts/leadCreateClientTest.ts`
- `npx tsx scripts/leadCreatePrebookingTest.ts`
- `npx tsx scripts/prebookingToContractTest.ts`

### 2026-05-28 03:01 +03:00 — Chessboard graphite visual theme and statuses refinement

Files changed:
- `src/App.tsx`
- `src/components/chessboard/Chessboard.tsx`
- `docs/WORKLOG.md`

Completed:
- Converted chessboard UI to a refined dark graphite palette (#1A1C1B for app background, #222421 for panels, #292B28 for tables, #2F3330 for calendar grid, #3D423E for borders, #F4F1EA for text).
- Replaced status color codes with brighter, high-contrast colors (Prebooking #FFE08A, Occupied #F3B2BF, Currently staying #8CAFBE, Blocked #6E6964).
- Implemented `getBookingStatus` logic that dynamically determines the "Currently staying" status only if the current date falls within the booking span, resolving to "Occupied" otherwise.
- Updated the legend wording to display "Предбронь" instead of "Ожидает" and properly aligned the layout.
- Refined buttons and filter controls styling for cohesive look-and-feel.

Checks run:
- `git status --short`

### 2026-05-28 02:53 +03:00 — Added GEMINI.md agent rules

Files changed:
- `GEMINI.md` (new)
- `docs/WORKLOG.md`

Completed:
- Added `GEMINI.md` with guidelines and rules for Antigravity/Gemini agents.
- AGENTS.md remains.
- WORKLOG remains the primary short log.

Checks run:
- `git status --short`

### 2026-05-28 02:51 +03:00 — Cleanup of legacy documents and old backups

Files changed:
- `docs/WORKLOG.md`
- `Plan.md` (deleted/archived)
- `CLAUDE.md` (deleted/archived)
- `ARCHITECTURE_ANALYSIS.md` (deleted/archived)
- `test-smtp.js` (deleted/archived)
- `docs/superpowers/` (deleted/archived)
- `Документ/` (deleted/archived)

Completed:
- Created archive directory `D:\CRM Teriberka\CRM-main\CRM-main_legacy_archive_before_big_medveditsa_cleanup` adjacent to the project directory.
- Moved legacy planning files (`Plan.md`, `CLAUDE.md`, `ARCHITECTURE_ANALYSIS.md`, `test-smtp.js`, `Документ/`, `docs/superpowers/`) to the archive.
- Moved unneeded dev logs (`.codex-dev-server*.log`, `.dev-server.log`, `server-dev.err`), temp files (`tmp/`, `template_out.json`, `user_requested_schema*.json`), cache (`.agents/`), and old database backups (`manual-backups/`, `data/backups/*`) to the archive.
- Retained the current active database `data/crm.sqlite` and the recent control backup `data/backups/manual-clean-before-2026-05-27-19-43-20.crm.sqlite` intact inside the project.
- Absolutely no files were deleted permanently.

Checks run:
- Verified directories and files relocation in the filesystem.
- `git status --short`

### 2026-05-28 00:48 +03:00 — Big Medveditsa branding and safety settings

Files changed:
- `src/types.ts`
- `src/constants.ts`
- `src/utils/contractNumbers.ts`
- `server/backupService.ts`
- `src/App.tsx`
- `src/components/auth/LoginModal.tsx`
- `src/components/chessboard/Chessboard.tsx`
- `src/components/clients/Clients.tsx`
- `src/components/contracts/Contracts.tsx`
- `src/components/leads/Leads.tsx`
- `src/components/leads/LeadModal.tsx`
- `src/components/settings/SettingsView.tsx`
- `src/components/settings/BackupSettingsTab.tsx`
- `docs/WORKLOG.md`

Completed:
- corrected company requisites for ООО `Золото Арктики` and added hotel registry/contact fields in settings;
- removed the inactive object address from the settings UI and replaced the old object address label with `Фактический адрес бутик-отеля`;
- changed new visible Chunga/Big Medveditsa contract numbers from `ЧЧ` to `БМ`;
- isolated backup defaults to `big_medveditsa_cloud_1`, `big_medveditsa_cloud_2`, and `BigMedveditsaCRM/backups`;
- disabled cloud backup actions when rclone is unavailable so old remotes are not used;
- kept the UI dark and moved key accents toward the Big Medveditsa taupe/blue palette;
- kept the 20-room hotel catalog and compact chessboard layout.

Checks run:
- browser check for settings requisites, backup settings, dark UI, chessboard rooms, and contract number prefix.
- `git status --short`
- `git diff --stat`
- `git diff --check`

Next:
- continue business-flow polish after confirming the updated requisites and backup settings in production use.

Risks/TODOs:
- `npm run lint`, `npm run build`, and tests were not run per task instruction.
- PDFMe generator and document templates were not changed.

### 2026-05-28 00:10 +03:00 — Hotel rooms catalog

Files changed:
- `src/constants.ts`
- `src/types.ts`
- `src/components/chessboard/Chessboard.tsx`
- `src/components/contracts/PreBookingModal.tsx`
- `src/components/contracts/ContractModal.tsx`
- `docs/WORKLOG.md`

Completed:
- replaced the old object list with 20 real rooms for boutique hotel `Большая Медведица`;
- added room category, capacity, sea-view flag, and nightly price to the shared room catalog;
- kept room ids like `cc-1` so existing bookings remain linked;
- made the chessboard rows and left room column more compact;
- reused the same catalog in the chessboard, prebooking room select, contract room dropdown, and Excel export.

Checks run:
- browser check only: chessboard shows `№1` through `№20`; prebooking select has 20 room options; sea-view text appears only for sea-view rooms; rooms without sea view do not show view text.

Next:
- review pricing autofill only if managers want room prices to populate booking price automatically.

Risks/TODOs:
- `npm run lint`, `npm run build`, and tests were not run per task instruction.

### 2026-05-27 23:59 +03:00 — Prebooking to contract flow

Files changed:
- `src/App.tsx`
- `src/components/contracts/ContractModal.tsx`
- `src/components/leads/LeadModal.tsx`
- `scripts/prebookingToContractTest.ts`
- `docs/WORKLOG.md`

Completed:
- added the explicit `pre_booking` to contract conversion mode;
- converted the same `Contract.id` instead of creating a duplicate contract;
- replaced `ПБ-...` numbers with the next normal contract number when opening the contract modal;
- updated the linked lead to `contract_created` after successful save;
- kept PDFMe, document templates, Supabase, and `saveContract()` unchanged.

Checks run:
- `npx tsx scripts/prebookingToContractTest.ts`
- `npx tsx scripts/leadCreatePrebookingTest.ts`
- `npx tsx scripts/leadCreateClientTest.ts`
- `npm run lint`
- `npm run build`
- browser check: prebooking opened through `PreBookingModal` -> `ContractModal`, contract number changed from `ПБ-...` to `ЧЧ...`, dates stayed prefilled, save changed the chessboard status from `Ожидает` to contract occupancy, lead status became `Договор`, and console errors were empty.

Next:
- decide whether to add a direct `Заявка → Договор` shortcut or polish the prebooking/contract manager workflow.

Risks/TODOs:
- PDF generation remains manual from `ContractModal`.
- build still reports existing large PDFMe-related chunk warnings.

### 2026-05-27 20:59 +03:00 — Lead to prebooking flow

Files changed:
- `src/types.ts`
- `src/App.tsx`
- `src/components/leads/Leads.tsx`
- `src/components/leads/LeadModal.tsx`
- `src/components/contracts/PreBookingModal.tsx`
- `scripts/leadCreatePrebookingTest.ts`
- `docs/WORKLOG.md`

Completed:
- added the `Заявка → Создать предбронь` UI flow;
- opened the existing `PreBookingModal` from a lead with guest/contact/date/comment prefill;
- required manual room selection when the lead has no object id;
- saved prebookings only through `contractApi.save()` and the existing `saveContract()` path;
- linked the lead to the saved prebooking with `prebookingId`, `contractId`, and `prebooking_created`;
- kept duplicate protection by hiding the action after `prebookingId`/`contractId` exists.

Checks run:
- `npx tsx scripts/leadCreatePrebookingTest.ts`
- `npx tsx scripts/leadCreateClientTest.ts`
- `npx tsx scripts/leadsRuntimeSafetyTest.ts`
- `npm run lint`
- `npm run build`
- browser check: lead prefill opens `PreBookingModal`, room is selected manually, saved prebooking appears in the chessboard as `Ожидает`, lead status becomes `Предбронь`, and the duplicate create action is hidden.

Next:
- Предбронь → Договор or Заявка → Договор.

Risks/TODOs:
- PDFMe, document templates, Supabase SQL, and `saveContract()` were not changed.
- build still reports existing large PDFMe-related chunk warnings.

### 2026-05-27 20:38 +03:00 — Lead to guest conversion

Files changed:
- `server.ts`
- `server/localDatabase.ts`
- `src/services/localApi.ts`
- `src/components/leads/Leads.tsx`
- `src/components/leads/LeadModal.tsx`
- `src/App.tsx`
- `scripts/leadCreateClientTest.ts`
- `docs/WORKLOG.md`

Completed:
- added `POST /api/leads/:id/create-client` for safe lead-to-guest conversion;
- added frontend API and a `Создать гостя` action in the lead modal;
- linked converted leads to `clientId` and moved them to `client_created`;
- protected repeated conversion by returning the already linked guest;
- did not add contract creation, prebooking creation, or Supabase changes.

Checks run:
- `npx tsx scripts/leadCreateClientTest.ts`
- `npx tsx scripts/leadsRuntimeSafetyTest.ts`
- `npx tsx scripts/supabaseLeadSyncUiTest.ts`
- `npm run lint`
- `npm run build`
- browser check: Supabase lead converted to guest, Guests section shows the created guest, reopening the lead hides `Создать гостя`, and console errors are empty.

Next:
- Заявка → Создать предбронь or Заявка → Создать договор.

Risks/TODOs:
- build still reports existing large PDFMe-related chunk warnings.

### 2026-05-27 20:19 +03:00 — Compact lead modal layout

Files changed:
- `src/components/leads/LeadModal.tsx`
- `scripts/leadModalSimplificationTest.ts`
- `docs/WORKLOG.md`

Completed:
- made the lead modal more compact by reducing section spacing, field padding, and textarea height;
- moved `В работу` and `Отклонить` into the `Работа с заявкой` section;
- left only `Отмена` and `Сохранить` in the modal footer;
- kept `Технические данные` collapsed by default as a compact single row.

Checks run:
- `npx tsx scripts/leadModalSimplificationTest.ts`
- browser check for Supabase and local lead modals, collapsed technical data, compact layout, and no console errors.

Next:
- Заявка → Создать гостя.

Risks/TODOs:
- `npm run lint` and `npm run build` were not run per task instruction.

### 2026-05-27 20:09 +03:00 — Simplified lead modal

Files changed:
- `src/components/leads/LeadModal.tsx`
- `scripts/leadModalSimplificationTest.ts`
- `docs/WORKLOG.md`

Completed:
- simplified the lead modal into manager-facing sections: guest, stay, guest comment, and lead work;
- moved raw/source fields into a collapsed `Технические данные` section;
- replaced the main source data block with a compact source/received-at line;
- hid the internal object id from the main form and renamed room input to `Пожелание по номеру`.

Checks run:
- `npx tsx scripts/leadModalSimplificationTest.ts`
- `npx tsx scripts/leadsRuntimeSafetyTest.ts`
- browser check for opening a Supabase lead modal, closed technical data, formatted `Сайт` source, and no console errors.

Next:
- Заявка → Создать гостя.

Risks/TODOs:
- `npm run lint` and `npm run build` were not run per task instruction; browser/Vite loaded the updated modal without console errors.

### 2026-05-27 19:56 +03:00 — Local SQLite working data cleanup

Files changed:
- `docs/WORKLOG.md`

Completed:
- verified backup exists at `data/backups/manual-clean-before-2026-05-27-19-43-20.crm.sqlite`;
- cleared local working data from `bookings`, `contracts`, `clients`, `leads`, and `email_history`;
- preserved `settings`, `email_settings`, `managers`, `organizations`, `pdf_templates`, `html_templates`, and `templates_meta`;
- verified the CRM UI opens after cleanup.

Checks run:
- SQLite counts before and after cleanup;
- browser check for login, empty Guests, empty Contracts, empty Leads, empty chessboard state, Settings, and Additional;
- `git status --short`.

Next:
- Заявка → Создать гостя.

Risks/TODOs:
- Supabase was not changed; the previously pulled Supabase test lead will not re-sync unless a new lead is created or `pulled_to_crm` is reset in Supabase.

### 2026-05-27 19:33 +03:00 — Leads UI runtime safety cleanup

Files changed:
- `src/components/leads/Leads.tsx`
- `src/components/leads/LeadModal.tsx`
- `src/components/leads/LeadStatusBadge.tsx`
- `src/components/leads/leadDisplay.ts`
- `scripts/leadsRuntimeSafetyTest.ts`
- `docs/WORKLOG.md`

Completed:
- normalized lead source labels for site/local/API values;
- fixed Supabase/local origin labels in the lead modal;
- added safe fallbacks for empty lead fields and unknown statuses;
- added safe JSON parsing helpers for `utmJson`/`rawJson`;
- verified the Leads UI manually in the browser.

Checks run:
- `npx tsx scripts/leadsRuntimeSafetyTest.ts`
- `npx tsx scripts/supabaseLeadSyncUiTest.ts`
- `npx tsx scripts/leadsModuleUiTest.ts`
- `npm run lint`
- `npm run build`

Next:
- Заявка → Создать гостя.

Risks/TODOs:
- Vite still reports existing large chunk warnings during build.

### Initial checkpoint

Status:
- Git repo is on `main`.
- Remote: `origin https://github.com/make-make13/CRMteriberka.git`
- Supabase sync exists.
- Manual test pulled a Supabase row into CRM.
- Known UI issue: source label may show raw `bolshaya-medveditsa-landing`; Supabase lead may be described unclearly in modal.

Next:
- UI safety cleanup for Leads.
### 2026-05-28 05:51 +03:00 — Backup Settings Runtime Crash Fixes

Files changed:
- `src/components/settings/BackupSettingsTab.tsx`
- `docs/WORKLOG.md`

Completed:
- Added extremely defensive runtime checks in `BackupSettingsTab.tsx`.
- Ensured UI does not crash if `/api/backups/status` returns an incomplete object (like `{}`).
- Displays "Резервные копии не настроены или нет данных о статусе" if status or settings is empty.
- Used `Array.isArray()` before calling `.map` or `.join` on `lastResult.remotes` and `lastResult.errors` to prevent runtime crashes if strings are provided instead of arrays.
- Safely wrapped `.toLocaleString` and `.toFixed` inside protective try/catch and type checking blocks.

Checks run:
- Verified safe component rendering locally with extreme edge cases (null properties).
- Did NOT run npm run lint or build as requested.

Next:
- Return to modal redesign task once the crash is confirmed solved.

Risks/TODOs:
- None.
