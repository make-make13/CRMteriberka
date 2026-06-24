# WORKLOG

### 2026-06-24 12:41:00 +03:00 - Prepare final installer update and auto-seeding for Bolshaya Medveditsa CRM

Files changed:
- `package.json`
- `package-lock.json`
- `tsup.config.ts`
- `server/localDatabase.ts`
- `docs/WORKLOG.md`

Completed:
- Bumped application version from `0.1.2` to `0.1.3` in both `package.json` and `package-lock.json` to ensure Windows installer performs an update rather than installing a duplicate.
- Maintained identical App ID (`ru.teriberka.big-medveditsa-crm`), product name (`Большая Медведица CRM`), executable name (`Bolshaya Medveditsa CRM`), and installation path (`%LOCALAPPDATA%\Programs\bolshaya-medveditsa-crm\`) for seamless upgrade logic.
- Configured tsup to load environment variables from `.env.local` at build time and bundle them into `dist-server/server.cjs` via esbuild define options, keeping secrets safe from Git and isolated from the frontend.
- Added a `ensureDefaultSettings()` seeding routine to the `LocalDatabase` class. Upon first launch of version `0.1.3` on an empty SQLite database, the app automatically initializes general settings, integration settings (Supabase URL/Service Role Key), and SMTP email settings (port 465, host `smtp.mail.ru`, sender `medvedica.hotel@vk.com`) using the build-time injected credentials.
- Ensured existing user data safety: if any clients, contracts, or bookings exist in the database, the seeding is skipped entirely.

Checks run:
- `npm run lint` - passed.
- `npm run build` - compiled.
- `npm run electron:installer` - built the setup executable under `release/Bolshaya-Medveditsa-CRM-Setup-0.1.3.exe` successfully.

### 2026-06-24 12:28:00 +03:00 - Bolshaya Medveditsa room inventory configuration for Dashboard

Files changed:
- `src/constants/bmRooms.ts`
- `src/components/dashboard/Dashboard.tsx`
- `docs/WORKLOG.md`

Completed:
- Created the explicit room inventory for the rebranded "Большая Медведица" hotel in [bmRooms.ts](file:///E:/AI_Workspace/Teriberka/02_crm-teriberka/CRM-main/CRM-main/src/constants/bmRooms.ts) containing the 20 active rooms (retaining standard room IDs cc-1 through cc-20 matching active database records).
- The inventory is complete (IS_BM_ROOMS_COMPLETE = true) because it represents all active rooms mapped to the rebranded hotel (baseType: 'chunga-changa') in SQLite and the chessboard configuration.
- Updated [Dashboard.tsx](file:///E:/AI_Workspace/Teriberka/02_crm-teriberka/CRM-main/CRM-main/src/components/dashboard/Dashboard.tsx) to import the new `BM_ROOMS` inventory. Removed all imports/references of legacy `CC_OBJECTS` and `GB_OBJECTS` from the dashboard calculation.
- Occupancy is now calculated by filtering bookings matching the new `BM_ROOMS` inventory. Since the inventory is complete, the dashboard displays: `X номера сдано из Y возможных` (with proper Russian grammatical pluralization: "номер сдан", "номера сдано", "номеров сдано") and shows the average occupancy percentage alongside the visual loading progress bar in the period report summary.

Checks run:
- `npm run lint` - passed successfully (tsc compiler safe).

Next recommended step:
- Maintain `BM_ROOMS` in `src/constants/bmRooms.ts` whenever the physical rooms of the hotel are modified or expanded.

### 2026-06-24 12:25:00 +03:00 - Dashboard legacy room occupancy fix

Files changed:
- `src/components/dashboard/Dashboard.tsx`
- `docs/WORKLOG.md`

Completed:
- Removed legacy room stock totals (CC_OBJECTS and GB_OBJECTS, which summed to 31) from the Dashboard occupancy calculations, as they are not accurate for the "Большая Медведица" CRM.
- Display absolute values for occupied room-nights: `X номер-ночей занято` (e.g. `0 номер-ночей занято`) instead of `из 31 доступных`.
- Removed the occupancy percentage logic and the progress bar since there is no explicit room inventory configuration for "Большая Медведица" in constants.
- Noted that a future explicit room inventory configuration is required to support accurate occupancy percentage calculations.

Checks run:
- `npm run lint` - passed.

Next recommended step:
- If a room inventory configuration for "Большая Медведица" becomes available, it can be defined in `src/constants.ts` to restore occupancy percentage metrics.

Risks / TODO:
- No database changes, migrations, Supabase configurations, or contracts/templates were modified.

### 2026-06-24 10:18:42 +03:00 - Email SMTP test endpoint 404 fix

Files changed:
- `server.ts`
- `src/services/localApi.ts`
- `docs/WORKLOG.md`

Completed:
- Changed the Email settings SMTP check client URL to `/api/email-settings/test-connection`.
- Added the matching backend route and kept `/api/email-settings/test-smtp` as a compatibility alias.
- Reused the existing SMTP verify handler; it uses `nodemailer.verify()` and does not send a test email.
- Confirmed the transporter still uses host/port/secure plus `auth.user` and `auth.pass`.

Checks run:
- `npm run lint` - passed.

Next recommended step:
- Restart the running CRM server/app so the new backend route is active, then run "Проверить соединение" after entering the external app password.

Risks / TODO:
- No DB, Supabase, contracts, templates, Graphify, migrations, deploy, or secret output changes were made.

### 2026-06-24 10:11:39 +03:00 - Email SMTP VK/Mail.ru authorization fix

Files changed:
- `server.ts`
- `src/components/settings/EmailSettingsTab.tsx`
- `src/services/localApi.ts`
- `docs/WORKLOG.md`

Completed:
- Fixed the Email settings "Проверить соединение" flow: it no longer calls `/api/send-email` with a raw unauthenticated `fetch`.
- Added an authenticated SMTP verify endpoint that uses `nodemailer.verify()` and does not send a test email.
- Ensured SMTP verify uses a newly entered password only when provided, otherwise falls back to the saved server-side password.
- Kept password preservation on save: an empty password field does not erase the stored app password.
- Set VK/Mail.ru defaults and preset: `medvedica.hotel@vk.com`, `smtp.mail.ru`, port `465`, SSL/TLS, sender name `Большая Медведица`.
- Clarified UI copy: use a Mail/VK external app password, not the normal mailbox password.

Checks run:
- `rg` for Yandex-specific SMTP wording in the touched email zone - no matches.
- `npm run lint` - passed.
- Browser check: Settings -> Email shows VK/Mail.ru preset, full mailbox login, `smtp.mail.ru`, port `465`, SSL/TLS, empty password placeholder, no Yandex wording; console errors 0.

Next recommended step:
- Enter the Mail/VK external app password in Settings -> Email, save, then run the SMTP connection check from the UI.

Risks / TODO:
- No DB, Supabase, `.env`, contracts, templates, migrations, deploy, Graphify, or audit fix changes were made.
- SMTP verify was not executed during browser-check because no password was entered in this session.

### 2026-06-24 09:36:23 +03:00 - CRM usability sprint 1: booking workflow and integrations

Files changed:
- `server.ts`
- `server/backupService.ts`
- `server/localDatabase.ts`
- `src/components/contracts/PreBookingModal.tsx`
- `src/components/leads/LeadModal.tsx`
- `src/components/settings/BackupSettingsTab.tsx`
- `src/components/settings/EmailSettingsTab.tsx`
- `src/components/settings/IntegrationsSettingsTab.tsx`
- `src/services/localApi.ts`
- `docs/WORKLOG.md`

Completed:
- Prebooking modal now shows a visible check-in/check-out date range for prebookings without a DB migration.
- Lead modal now separates status confirmation from guest creation: `Подтвердить`, `Отклонить`, `Создать гостя`, and `Создать предбронь` are clearer.
- Supabase integration UI shows safe source status for CRM settings / `.env.local` / defaults without exposing Service Role Key.
- Email SMTP settings no longer use Yandex-specific wording; Mail.ru / VK WorkMail defaults were added with manual host/port/SSL fields.
- rclone check/install actions were added to integrations/backups; install runs only on explicit user click via `winget install Rclone.Rclone`.
- Backup rclone command output is truncated before returning to the UI.

Checks run:
- `git status --short`
- `npm run lint` - passed.
- `npm run dev` - started after replacing a stale listener on port 3002.
- Browser check: login, Settings tabs, Integrations/Supabase source status, Integrations rclone card, Email SMTP settings, Backups rclone buttons, Leads new/existing modal actions.
- Browser console errors: 0.

Next recommended step:
- Do a separate focused pass only if real manager testing finds a concrete usability issue in prebooking or integrations.

Risks / TODO:
- No DB, Supabase, `.env` values, migrations, deploy, Graphify, legal PDFMe/DOCX templates, SQLite schema, enum/zod, baseType/objectId, or document template logic were changed.
- rclone installation was not executed during browser verification.
- Existing local lead data was viewed only for UI verification and not saved or modified.

### 2026-06-24 08:55:21 +03:00 - Contracts visible legacy labels pass

Files changed:
- `src/utils/templateVariables.ts`
- `docs/WORKLOG.md`

Completed:
- Ran targeted grep for visible/internal/legal legacy markers: `Чунга-Чанга`, `Голубая Бухта`, `ЧЧ`, `ГБ`, `chunga-changa`, `golubaya-bukhta`.
- Updated the non-legal template variable hint for `contract_number`: example `ГБ-5` -> `БМ-5`.
- Left legal PDFMe templates/test fixtures and internal baseType/objectId/contract-number logic unchanged.

Checks run:
- `git status --short`
- targeted `rg`
- `npm run lint` - passed.

Next recommended step:
- Continue contracts cleanup only with a separate scoped task.

Risks / TODO:
- No DB, Supabase, env, migrations, deploy, Graphify, enum/zod/baseType/objectId, legal templates, PDFMe, or DOCX template changes were made.

### 2026-06-24 08:52:53 +03:00 - Contracts cleanup pass

Files changed:
- `src/lib/utils.ts`
- `docs/WORKLOG.md`

Completed:
- Confirmed `generateContractHTML` had no repo call sites.
- Removed the unused HTML contract generator and helper/type dependencies used only by it.
- Left live PDFMe/DOCX contract templates unchanged.

Checks run:
- `git status --short`
- `rg -n "generateContractHTML"`
- `npm run lint` - passed.

Next recommended step:
- Continue contracts cleanup only with a separate scoped task.

Risks / TODO:
- No DB, Supabase, env, migrations, deploy, Graphify, legal templates, PDFMe, or DOCX template changes were made.

### 2026-06-24 05:18:38 +03:00 - Leads runtime safety pass

Files changed:
- `src/components/leads/LeadModal.tsx`
- `scripts/leadsRuntimeSafetyTest.ts`
- `docs/WORKLOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CRM_TERIBERKA_TODO.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CURRENT_STATE.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\NEXT_ACTIONS.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CHANGELOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\AGENT_HANDOFF.md`

Completed:
- Reproduced the pre-existing `scripts/leadsRuntimeSafetyTest.ts` failure: `LeadModal.tsx` still called `JSON.parse` directly.
- Reused the guarded `parseJsonSafe()` helper from `leadDisplay.ts` for `LeadModal.tsx` transcript parsing.
- Kept fallback behavior display-only/runtime-only: invalid, empty, null, or undefined transcript JSON returns `null` and does not save fallback text to lead data.
- Left editable LeadModal form values raw.
- Kept SQLite data, Supabase, backend, contracts/templates, chessboard, baseType, enum/zod, and DB schema unchanged.
- Expanded `scripts/leadsRuntimeSafetyTest.ts` with behavioral safe-parse cases.

Checks run:
- `npx tsx scripts/leadsRuntimeSafetyTest.ts` - passed.
- `npx tsx scripts/leadObjectTypeDisplayTest.ts` - passed.
- `npm run lint` - passed.
- `npm run dev` - started for browser verification, then stopped.
- Browser check: opened Leads, opened an existing lead modal, opened the New Lead modal and cancelled; no new data was saved; console errors 0.

Next recommended step:
- Decide the next leads-only polish task, or move to another module review/fix.

Risks / TODO:
- No migrations, deploy, Graphify, Supabase changes, data cleanup, contracts, templates, or schema changes were made.
- The first dev-server start attempt used `Start-Process npm` and opened Notepad due to Windows file association; it was closed and the server was started with `npm.cmd`.

### 2026-06-24 05:07:12 +03:00 - Leads display polish for damaged visible fields

Files changed:
- `src/components/leads/leadDisplay.ts`
- `src/components/leads/Leads.tsx`
- `scripts/leadObjectTypeDisplayTest.ts`
- `docs/WORKLOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CRM_TERIBERKA_TODO.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CURRENT_STATE.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\NEXT_ACTIONS.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CHANGELOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\AGENT_HANDOFF.md`

Completed:
- Added display-only helpers for damaged visible lead fields: guest name, contact values, optional values, and object type.
- Applied helpers only in the Leads list display for `guestName`, `phone`, `email`, `desiredTime`, and `objectType`.
- Kept editable LeadModal fields raw to avoid saving fallback text into real lead data.
- Kept SQLite data, Supabase, backend, contracts/templates, chessboard, baseType, enum/zod, and DB schema unchanged.
- Expanded `scripts/leadObjectTypeDisplayTest.ts` to cover damaged guest/contact/optional display fallbacks.

Checks run:
- `npx tsx scripts/leadObjectTypeDisplayTest.ts` - passed.
- `npm run lint` - passed.
- `npm run dev` - started for browser verification, then stopped.
- Browser check on active and archive Leads rows: U+FFFD count 0, `????` count 0, console errors 0.

Next recommended step:
- Decide whether to fix the pre-existing `scripts/leadsRuntimeSafetyTest.ts` failure around direct `JSON.parse` in `LeadModal.tsx`.

Risks / TODO:
- No new data was created or saved during browser verification.
- No migrations, deploy, Graphify, Supabase changes, data cleanup, contracts, templates, or schema changes were made.

### 2026-06-24 04:37:59 +03:00 - Leads UI object_type fallback

Files changed:
- `src/components/leads/leadDisplay.ts`
- `src/components/leads/Leads.tsx`
- `scripts/leadObjectTypeDisplayTest.ts`
- `docs/WORKLOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CRM_TERIBERKA_TODO.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CURRENT_STATE.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\NEXT_ACTIONS.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CHANGELOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\AGENT_HANDOFF.md`

Completed:
- Added `formatLeadObjectType()` display helper for Leads UI only.
- Replaced the Leads list object type line with the new display helper.
- Kept SQLite data, Supabase, backend mojibake helper, contracts/templates, baseType, enum/zod, and DB schema unchanged.
- Added a targeted script test for clean values, empty values, U+FFFD, and repeated-question-mark damaged values.
- Verified the Leads list object-type row no longer renders U+FFFD or `????` for visible rows.

Checks run:
- `npx tsx scripts/leadObjectTypeDisplayTest.ts` - passed.
- `npm run lint` - passed.
- `npm run dev` - started for browser verification, then stopped.
- Browser check on Leads list object-type row: replacement count 0, question-run count 0, console errors 0.

Next recommended step:
- Decide separately whether to add a safe display fallback for damaged PII fields such as guest name; one visible U+FFFD remains in the guest-name row and was not changed by this object_type-only task.

Risks / TODO:
- Existing `scripts/leadsRuntimeSafetyTest.ts` still has a pre-existing failure on `LeadModal.tsx` direct `JSON.parse`; not fixed in this task.
- No migrations, deploy, Graphify, Supabase changes, data cleanup, contracts, or templates were touched.

### 2026-06-24 04:26:41 +03:00 - Controlled smoke-check after leads.object_type fix

Files changed:
- `server/localDatabase.ts` (existing pending code fix, not changed during smoke-check)
- `docs/WORKLOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CURRENT_STATE.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\NEXT_ACTIONS.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CHANGELOG.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\AGENT_HANDOFF.md`
- `E:\AI_Workspace\Teriberka\00_AGENT_CONTEXT\CRM_TERIBERKA_TODO.md`

Completed:
- Installed dependencies with `npm ci` because `package-lock.json` exists.
- Ran TypeScript lint gate after the `repairTextMojibake()` guard fix.
- Started web-dev mode with `npm run dev` on port 3002 and verified `/api/health`.
- Logged into the CRM and smoke-checked the main UI sections: Leads, Chessboard, Contracts, Guests, Settings.
- Opened an existing lead modal and opened the New Lead modal, then cancelled without saving new data.
- Opened a chessboard cell modal, then cancelled without saving new data.
- Checked visible lead encoding markers without printing PII.
- Stopped the dev server after the smoke-check.

Checks run:
- `git status --short`
- `npm ci`
- `npm run lint` - passed.
- `npm run dev` - started successfully.
- Browser smoke-check: login, Leads, New Lead modal, existing Lead modal, Chessboard, chessboard cell modal, Contracts, Guests, Settings.
- Browser console errors: 0.
- SQLite aggregate check for remaining destroyed `object_type` values: one row with `?`, one row with U+FFFD.

Next recommended step:
- First fix candidate: add a safe Leads UI fallback/label for destroyed `object_type` values (`?`/U+FFFD`) so managers do not see replacement characters; keep actual data repair/edit as a separate user-approved data-cleanup task.

Risks / TODO:
- `npm ci` reported dependency audit issues and peer dependency override warnings; no audit/fix was run.
- Remaining `?`/U+FFFD values are known destroyed data and intentionally not repaired by the helper.
- Conversion lead -> prebooking was not executed to avoid creating extra data; the sampled existing lead did not expose conversion actions.
- No build/test/migrations/deploy/Graphify were run.

### 2026-06-02 17:00:58 +03:00 - Archive RC installer, clean workspace, fix window title

Files changed:
- `index.html`
- `docs/WORKLOG.md`

Completed:
- Changed browser/Electron document title from `My Google AI Studio App` to `Большая Медведица CRM`.
- Copied the generated installer to `D:\CRM Teriberka\Готовые сборки\0.1.0-RC\Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe`.
- Removed safe generated/local junk from the project folder: `dist/`, `dist-server/`, `dist-electron/`, `release/`, `.claude/`, `bolshaya_medveditsa_crm_icon_pack/`, and `bolshaya_medveditsa_crm_icon_pack.zip`.
- Kept `.env.local`, SQLite DB files, `node_modules/`, `storage/docx-templates/`, `templates/docx/`, and `tools/` intact.

Checks run:
- Verified archived installer exists and is `614226583` bytes.
- Verified `index.html` now contains `<title>Большая Медведица CRM</title>`.
- No Electron rebuild was run, per request.

Next recommended step:
- Commit and push the current release checkpoint, then install the archived RC installer on another PC for smoke testing.

Risks / TODO:
- The archived installer was built before the title change, so its window title may still show the old AI Studio text until the next installer build.
- Build outputs were removed from the working tree and can be regenerated with the existing npm scripts.

### 2026-06-02 11:36:08 +03:00 - Clean generated artifacts and restore compile/build

Files changed:
- `electron-builder.yml`
- `scripts/checkEncoding.mjs`
- `scripts/create_bm_contract_template_poc.ts`
- `scripts/create_bm_contract_template_signed_poc.ts`
- `scripts/electronFindFreePortTest.ts`
- `scripts/electronWaitForHealthTest.ts`
- `scripts/leadModalSimplificationTest.ts`
- `src/components/chessboard/Chessboard.tsx`
- `src/utils/docx/bmDocxBuilder.ts`
- `docs/WORKLOG.md`

Completed:
- Removed generated/ignored junk directories: `dist/`, `dist-server/`, `dist-electron/`, `release/`, and `scratch/`.
- Kept local data and sensitive/runtime files intact: `.env.local`, SQLite DB files, `node_modules/`, `storage/docx-templates/`, and `templates/docx/`.
- Fixed TypeScript compile errors from `docx@9` enum value typing and `HeightRule.ATLEAST`.
- Removed an impossible Chessboard status comparison to `closed`; existing `ContractStatus` does not include it.
- Fixed Electron helper test address narrowing so TypeScript compiles.
- Updated the Lead modal source test to match the current status-select UI.
- Restored NSIS installer config promised by the prior worklog: custom include, zip packaging, differential package disabled.
- Added `compression: store` so the large local RC installer can finish instead of stalling in 7zip compression.
- Excluded the intentional mojibake-normalization test fixture from `checkEncoding`.

Checks run:
- `npm run lint` - passed.
- `npm run check:encoding` - passed.
- `npx tsx scripts/electronFindFreePortTest.ts` - passed.
- `npx tsx scripts/electronWaitForHealthTest.ts` - passed.
- `npx tsx scripts/leadModalSimplificationTest.ts` - passed.
- `npx tsx scripts/supabaseLeadSyncUiTest.ts` - passed.
- `npm run build` - passed.
- `npm run build:server` - passed.
- `npm run build:electron` - passed.
- `npm run electron:installer` - passed and produced `release/Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe` (~614 MB).

Next recommended step:
- Smoke-test the generated installer manually: install, launch, login, check `/api/health`, then uninstall while confirming AppData/userData is preserved.

Risks / TODO:
- `compression: store` makes the installer much larger but avoids the observed 7zip stall on this local RC build.
- electron-builder still warns that `description` and `author` are missing in `package.json`, `asar` is disabled, and npm collector reports invalid/duplicate React dependency references. These warnings did not block the build.
- Vite still warns about large PDFMe chunks; this is not a compile blocker.

### 2026-06-02 10:57:00 +03:00 - Project audit and compile/package checks

Files changed:
- `docs/WORKLOG.md`

Completed:
- Reviewed current project state, package scripts, Electron/server build configs, and recent RC installer notes.
- Reproduced the current TypeScript gate failure with `npm run lint`.
- Verified separate Vite, server tsup, Electron tsup, and unpacked Electron packaging commands.
- Reproduced NSIS installer packaging hang/timeout in `npm run electron:installer`; stopped the spawned npm/electron-builder/7za processes.
- Checked encoding guard and a few targeted script tests.

Checks run:
- `git status --short`
- `git diff --stat`
- `npm run lint` - failed with TypeScript errors in DOCX helpers, Electron helper tests, and Chessboard status comparison.
- `npm run build` - passed; large chunk warnings for PDFMe bundles.
- `npm run build:server` - passed.
- `npm run build:electron` - passed.
- `npm run electron:pack` - passed, but reported package metadata/dependency/asar warnings.
- `npm run electron:installer` - timed out after about 424s while `7za` was creating `.nsis.7z`.
- `npm run check:encoding` - failed on mojibake in `src/utils/pdfmeTemplatesTest.ts`.
- `npx tsx scripts/electronFindFreePortTest.ts` - passed.
- `npx tsx scripts/electronWaitForHealthTest.ts` - passed.
- `npx tsx scripts/supabaseLeadSyncUiTest.ts` - passed.
- `npx tsx scripts/leadModalSimplificationTest.ts` - failed because the expected modal footer marker was not found.

Next recommended step:
- Fix the compile gate first (`npm run lint`), then restore/finish the NSIS config promised by the previous worklog entry (`useZip`, `differentialPackage`, custom NSIS hook wiring) and rerun installer smoke from a clean `release/`.

Risks / TODO:
- Working tree already had uncommitted Electron/release documentation and installer config changes before this audit.
- Current docs say installer hardening added `useZip: true`, `differentialPackage: false`, and a custom hook, but the actual `electron-builder.yml` does not contain those settings.
- `release/` contains stale ignored artifacts plus a fresh zero-byte `.nsis.7z` from the timed-out installer run.
- `win-unpacked` includes a large production `node_modules`; NSIS compression is slow and currently blocks final installer generation.

### 2026-06-01 21:17:30 +03:00 — Fix NSIS silent install/reinstall hang

Files changed:
- `electron-builder.yml`
- `scripts/nsis-installer.nsh`
- `docs/electron-build.md`
- `docs/release-checklist.md`
- `docs/WORKLOG.md`

Completed:
- Investigated the silent install/reinstall hang with process checks, clean install-dir backups, and repeated `/S` watchdog runs.
- Confirmed the old failure was not caused by a running CRM/backend process or AppData/userData deletion.
- Identified the packaging issue: `useZip: true` did not take effect while NSIS was still differential-aware and using the `.nsis.7z` path.
- Updated NSIS config for RC testing: ASCII executable/artifact name, `runAfterFinish: false`, `deleteAppDataOnUninstall: false`, `useZip: true`, `differentialPackage: false`, and a tracked silent `customInstall` hook.
- Verified silent install `/S`, silent reinstall `/S`, installed-app smoke, backend shutdown, and silent uninstall while preserving userData.

Checks run:
- Context7 lookup for current electron-builder NSIS option behavior.
- `npx electron-builder --win nsis`
- Silent install: `Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe /S` exited 0 in ~331s.
- Silent reinstall: `Bolshaya-Medveditsa-CRM-Setup-0.1.0.exe /S` exited 0 in ~391s.
- Installed app selected port 3003 while 3002 was occupied.
- `/api/health`, `/api/app-info`, login `Make / 3552`, and `/api/leads/auto-sync/status` returned 200.
- Closing installed app stopped the packaged backend; port 3003 stopped responding.
- Silent uninstall: `Uninstall Bolshaya Medveditsa CRM.exe /currentuser /S` completed after temporary `Un_A.exe` finished and removed the install dir.
- Project DB `data/crm.sqlite` stayed unchanged; AppData DB stayed present and unchanged.

Next recommended step:
- Run a final `npm run electron:installer` from a clean `release/` directory before tagging RC artifacts, then repeat the same install/reinstall/uninstall smoke.

Risks / TODO:
- `release/` contains ignored stale artifacts from earlier builds; clean it before final artifact handoff.
- `asar` remains disabled; installer is large and build/install are slow, but packaged backend runtime is confirmed with the current layout.
- Auto-update remains disabled; `latest.yml` may be generated but is not used for RC 0.1.0.

### 2026-06-01 14:41:38 +03:00 — Installer hardening for RC 0.1.0

Files changed:
- `electron/main.ts`
- `electron/waitForHealth.ts`
- `scripts/electronWaitForHealthTest.ts`
- `docs/electron-build.md`
- `docs/release-checklist.md`
- `docs/WORKLOG.md`

Completed:
- Reviewed NSIS/electron-builder installer behavior for current user install, reinstall, app-closing, `/KEEP_APP_DATA`, and AppData preservation.
- Confirmed there were no running installed CRM, Setup.exe, or uninstaller processes before code changes.
- Hardened `waitForHealth` against late retry callbacks after resolve/reject.
- Increased Electron packaged backend health wait from 20 seconds to 60 seconds to avoid the observed false cold-start timeout while preserving port fallback behavior.
- Added a targeted `waitForHealth` script test for HTTP 200 success and timeout rejection.

Checks run:
- `npx tsx scripts/electronWaitForHealthTest.ts`
- `npx tsx scripts/electronFindFreePortTest.ts`
- `npm run build`
- `npm run build:server`
- `npm run build:electron`
- `npm run electron:pack`
- `npm run electron:installer`
- `release/win-unpacked/Большая Медведица CRM.exe` smoke with port 3002 occupied; packaged backend selected 3003, health/app-info/login/auto-sync worked, startup timeout log was absent.
- Silent Setup.exe reinstall `/S` with CRM closed and 5 minute watchdog; reproduced hang after files were copied.

Next recommended step:
- Fix the remaining silent Setup.exe hang; until then, use `win-unpacked` for code smoke checks and treat silent reinstall as an RC blocker.

Risks / TODO:
- Do not delete `%APPDATA%\Большая Медведица CRM` while investigating installer hangs.
- If reinstall waits or hangs, stop only the Setup.exe PID after confirming it is stuck.
- Full build, pack, and win-unpacked smoke passed after the startup wait fix.
- `npm run electron:installer` eventually built a new Setup.exe and blockmap, but silent reinstall still hung after copying files with CRM closed.
- A one-click NSIS experiment did not fix the silent hang and was reverted; keep the installer hang as an RC blocker/follow-up.

### 2026-06-01 13:31:04 +03:00 — RC 0.1.0 readiness docs and installer build

Files changed:
- `electron/findFreePort.ts`
- `scripts/electronFindFreePortTest.ts`
- `docs/release-checklist.md`
- `docs/release-notes-0.1.0.md`
- `docs/electron-build.md`
- `docs/WORKLOG.md`

Completed:
- Committed and pushed first-run readiness as `eb7d340 Add first-run readiness guide`.
- Ran installer build with Electron cache workaround.
- Confirmed fresh `release/Большая-Медведица-CRM-Setup-0.1.0.exe`, `.blockmap`, `latest.yml`, and `release/win-unpacked/`.
- Added Russian release checklist for build, installer, CRM smoke checks, blockers, and non-blockers.
- Added Russian release notes for version `0.1.0`.
- Linked release docs from `docs/electron-build.md` and clarified installer draft/RC limitations.
- Found and fixed an Electron wrapper RC blocker: `findFreePort()` checked only `127.0.0.1`, so packaged app could choose port 3002 while another backend was listening on `0.0.0.0`; health check then falsely passed against the existing server while the packaged backend crashed with `EADDRINUSE`.
- Added a targeted regression script for the port selection behavior.

Checks run:
- `npm run electron:installer`
- Artifact inspection in `release/`
- `release/latest.yml` inspection
- `npx tsx scripts/electronFindFreePortTest.ts` (red before fix, green after fix)
- `release/win-unpacked/Большая Медведица CRM.exe` smoke with port 3002 occupied by existing backend.
- Packaged backend selected port 3003, `/api/health` returned `{"ok":true}`, `/api/app-info` returned `version: 0.1.0`, `mode: production`, AppData `dataDir`, login `Make/3552` returned 200, and `/api/leads/auto-sync/status` returned disabled auto-sync.
- Project `data/crm.sqlite` size and timestamp were unchanged during win-unpacked smoke.

Next recommended step:
- Run final build/pack smoke checks and, when port 3002 is free, test installed app launch from shortcut.

Risks / TODO:
- The first installer attempt exceeded the shell timeout while electron-builder kept running; reran cleanly after deleting only generated release artifacts.
- Silent reinstall via Setup.exe hung for more than 5 minutes after files were updated; installer process was stopped manually. Track this as installer/silent reinstall polish issue.
- First installed-app smoke after the hung reinstall showed incomplete installed dependencies (`merge-descriptors` missing), likely because the hung install was interrupted. Code verification used fresh `win-unpacked` instead.
- During win-unpacked smoke Electron main still logged a 20s startup timeout, although the packaged backend API became reachable and passed health/app-info/login/auto-sync checks on port 3003. Consider increasing or hardening startup wait in a separate follow-up.
- Current release docs are uncommitted; do not commit without explicit confirmation.

### 2026-06-01 12:40:43 +03:00 — First-run readiness polish

Files changed:
- `docs/first-run.md`
- `docs/local-install.md`
- `src/components/settings/SystemStatusTab.tsx`
- `docs/WORKLOG.md`

Completed:
- Read `docs/codex-handoff.md` and confirmed installer/Electron constraints.
- Reviewed current first-run checks in `SystemStatusTab`, `IntegrationsSettingsTab`, `localApi`, and backend endpoints for app info, integration settings, Supabase test, LibreOffice test, and auto-sync status.
- Added Russian first-run documentation for Setup.exe install, AppData data location, Supabase, LibreOffice, auto-sync, system status, backups, troubleshooting, and explicitly not-yet-implemented items.
- Linked `docs/first-run.md` from `docs/local-install.md`.
- Added a compact non-modal "Первый запуск" checklist to `Настройки → Система`.
- Did not change CRM business logic, contracts, DOCX/PDF generation, templates, Supabase schema, installer behavior, auto-update, code signing, or working database.

Checks run:
- `npm run build`
- Browser check on `http://127.0.0.1:3002`: login, open `Настройки → Система`, confirm first-run checklist is visible, console errors empty.

Next recommended step:
- Review the first-run wording and decide whether to keep the checklist in `Система` only or also add a short hint in `Интеграции`.

Risks / TODO:
- `npm run build` still reports pre-existing large PDFMe chunk warnings.
- Local dev server start attempt found port 3002 already in use, so UI verification used the existing running server.

### 2026-05-28 — Chessboard UI refinements

#### Session 1: Layout and spacing improvements
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Completed:
- Widened left column (260px → 320px) for better room information layout
- Reorganized room data: room number + category + sea icon on first line, capacity + price on second
- Replaced day abbreviations with full Russian names (пятница, суббота, воскресенье, etc.)
- Reduced cell background saturation for cleaner grid appearance
- Verified category filter contains exactly 4 categories (Одноместный стандарт, Двухместный стандарт, Джуниор сьют, Апартаменты)
- Confirmed sea view icon (🌊) appears only for rooms with seaView property
- Price text remains yellow and readable
- No business logic changes, no data modifications

Checks run:
- Playwright verification: chessboard loads, left column wider, text readable, icons display correctly
- Category filtering tested and working
- Browser console: no errors

#### Session 2: Room category typography polish
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Completed:
- Room category text styling:
  - Font size: 14px (text-sm)
  - Font weight: 700 (font-bold)
  - Color: #F4F1EA (light, same as room number)
  - Text transform: UPPERCASE
  - Visual prominence: equal to room number
- Examples: ДВУХМЕСТНЫЙ СТАНДАРТ, ОДНОМЕСТНЫЙ СТАНДАРТ, ДЖУНИОР СЬЮТ, АПАРТАМЕНТЫ
- Maintained sea view icon visibility only for seaView properties
- Capacity and price row unchanged

Checks run:
- Visual inspection: category text now matches room number prominence
- No business logic changes

#### Session 3: Date header day names color
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Completed:
- Day names color in date header: #F4F1EA (light, matching date number)
- Format remains: day number on top, full Russian day name below
- Example: 1 / пятница, 2 / суббота, 3 / воскресенье, etc.
- Consistent visual weight across chessboard headers

Checks run:
- No business logic changes

#### Session 4: Chessboard re-skin to previous app design (branch)
Branch: `feature/chessboard-restyle` (created off main for safe rollback — `git checkout main` reverts)
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Goal: keep current chessboard LAYOUT, adopt the COLOR/FONT style from the user's previous app (Figma reference). Layout untouched, only visual tokens.

Completed:
- Accent color: muted gold #D98E2B → bright orange #F97316 (period buttons, select focus, active states)
- Background: #111111 → near-black #0A0A0A
- Borders: warm graphite #3D423E → neutral #262626
- Secondary text: teal #B4CDD2 → neutral gray #8B8B8B
- Primary text: warm white #F4F1EA → cool white #F5F5F5
- Button/select surface: #222421 → #161616; nav hover #292B28 → #1A1A1A
- Statuses simplified per user: removed "Свободен" entirely; only two states remain:
  - "Забронирован" → orange #F97316 (collapses signed_not_paid/partial_paid/paid/closed)
  - "Предбронь" → blue #2D9CDB
- Legend reduced to 2 items (Забронирован, Предбронь)
- getBookingStatus computation NOT changed (booking conflict logic untouched) — only display label/colors collapsed
- Price kept yellow #FFD700 per earlier user preference (candidate for follow-up if it should match orange accent)
- Sea icon kept teal #8CAFBE

Checks run:
- Playwright: chessboard loads, orange accent applied, near-black bg, neutral grays, 2-item legend, full day names, console has no errors
- Note: current visible period had no bookings, so badge colors confirmed via legend + getStatusClasses (not live booking plашки)
- No npm run lint / build (UI-only, per project policy)

Next:
- User review of restyle on branch; if approved, merge to main; then continue interface unification.

Risks/TODOs:
- Status display collapsed 5→2 in chessboard view only; other modules (Договоры/Заявки) still use their own status labels — unaffected.

#### Session 5: Room card cleanup (branch)
Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Completed:
- Removed capacity ("N чел") from the left room column
- Price color: yellow #FFD700 → white #F5F5F5, placed on its own line under the name (mt-1.5) for a cleaner card
- Sea view icon made more noticeable: size 12 → 18, strokeWidth 2.5, color #8CAFBE → vivid blue #2D9CDB; still only for rooms with seaView

Checks run:
- Playwright: card shows name + UPPERCASE category + bolder blue sea icon, white price below, no capacity; console no errors
- No npm run lint / build (UI-only)

Risks/TODOs:
- None.

#### Session 7: Booking badge cleanup — name only, bigger font (branch)
Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Completed:
- Removed "Забронирован" / "Предбронь" status text from booking badge (плашка)
- Badge now shows only the guest name (Имя Фамилия)
- Font size: text-xs → text-sm (14px), font-weight: font-black → font-bold
- Inner layout: stacked two-line → single-line flex items-center for proper vertical centering in h-9
- `title` attribute still shows status + name on hover (unchanged)
- `getStatusLabel` function retained (used in Excel/email export)
- No business logic changes

Checks run:
- No npm run lint / build (UI-only)

#### Session 6: Week view + bigger numbers + uniform background (branch)
Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/chessboard/Chessboard.tsx`

Completed:
- Switched grid from decade periods (1-10 / 11-20 / 21-конец) to a 7-day WEEK view, Monday → Sunday
  - State: `selectedMonth`+`selectedPeriod` → `selectedWeekStart` (startOfWeek weekStartsOn:1)
  - `visibleDays` = 7 days from the week's Monday
  - Removed the decade period buttons; prev/next arrows now navigate by ±1 week
  - Header now shows the week range, e.g. "25 мая — 31 мая 2026"
  - Excel/email report labels and filenames now use the week start date
  - Removed now-unused imports (addMonths, subMonths, getHotelCalendarPeriodDays, HotelCalendarPeriod, PERIODS)
  - Booking span logic (getVisibleBookingSpan) untouched — works with any day array
- Room number font size bumped: text-xs → text-sm (a bit bigger)
- Background unified to near-black #0A0A0A across header/left column/booking grid (was #1A1C1B in the grid) — fully filled, matching the reference design

Checks run:
- Playwright: header shows week range, 7 columns Пн→Вс (25 пн … 31 вс), decade buttons gone, uniform dark bg, bigger numbers
- Live bookings now visible (28 четверг) rendered with orange "Забронирован" badge — confirms status colors
- Browser console: no errors (no compile errors after import/state changes)
- No npm run lint / build (verified via running dev server instead)

Risks/TODOs:
- getRoomMeta helper is now unused (pre-existing); harmless. Can remove in a later cleanup.

Next:
- Continue with visual interface unification.

Risks/TODOs:
- None.

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
### 2026-05-29 — Compact dark CRM palette: Шахматка + Гости (branch)

Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/chessboard/Chessboard.tsx`
- `src/components/clients/Clients.tsx`

**Шахматка — color hierarchy + controls zone:**
- Page bg: `#0A0A0A` → `#050505` (near-black, matches App.tsx)
- Table surface: `#0A0A0A` → `#111111`; table header: `#111111` → `#161616`
- All borders: `#262626` → `#232323`
- Primary text: `#F5F5F5` → `#F4F1EA`; secondary text: `#8B8B8B` → `#8F9894`
- Price color: white `#F4F1EA` → orange `#F97316` (to match room category accent)
- Sea view icon: vivid blue `#2D9CDB` → muted blue-gray `#8CAFBE`
- Cell hover: `#262626/50` → `#232323`
- Removed outer card wrapper (`rounded-2xl border p-4 bg-[#0A0A0A]`) from controls zone — controls now float directly on page bg
- Legend: removed bordered panel, simplified to compact `flex gap-4 text-xs`; dot size `w-2.5 h-2.5`; only Забронирован (orange) + Предбронь (blue)
- Export/Email buttons: `bg-[#161616]` → `bg-[#111111]`; nav arrows hover: → `bg-[#161616]`

**Гости — filter palette:**
- Active filter: orange `bg-[#F59E0B] text-[#050505]` → neutral `bg-[#161616] text-[#F4F1EA]`
- Inactive filter: transparent bg, `text-[#8F9894]`, hover `bg-[#111111]`
- Filter container: `bg-[#111111]` → transparent (no bg in dark mode)
- CTA «Добавить гостя»: stays orange `bg-[#F59E0B] hover:bg-[#F97316]` — orange reserved for primary actions only
- Design principle applied: orange = CTA only; segmented filter highlights use neutral `#161616`

Checks run:
- Claude_in_Chrome screenshot: Шахматка — no card wrapper, #050505 bg, #111111 table, price orange, legend compact, no console errors
- Claude_in_Chrome screenshot: Гости — search + filters inline, active «Все» neutral (not orange), CTA button stays orange
- No npm run lint / build (UI-only, per project policy)

### 2026-05-29 — Align badges/buttons to reference app (branch)

Branch: `feature/chessboard-restyle`
Reference read-only from copy: `D:\CRM Teriberka\CRM-main\Новая папка\CRM-main`
Files changed:
- `src/components/clients/Clients.tsx`
- `src/components/contracts/Contracts.tsx`

**Гости (Clients):**
- Status badge «Активен»/«Чёрный список»: removed heavy border + emerald, now matches
  reference — `rounded-md bg-green-500/10 text-green-500 text-[10px] font-bold uppercase`
  (red equivalent for blacklist)
- Delete (trash) button: fixed "disappearing" — was `h-7 w-7 opacity-40 group-hover:opacity-100`
  with border (visible only on row hover). Now reference style: `h-9 w-9 rounded-xl
  text-red-500 bg-red-500/10 hover:bg-red-500/20`, always visible, Trash2 size 16

**Договоры (Contracts):**
- Status pill: removed border, switched from teal/FFE08A/F3B2BF to reference palette —
  paid `green-500/10`, cancelled `red-500/10`, signed_not_paid `orange-500/10`,
  else `blue-500/10`; `px-2.5 py-1 font-semibold` (icon inherits via text-current)
- «На печать» button: removed border, brighter text — `bg-[#161616] text-[#F4F1EA]
  hover:bg-[#232323]`
- «На отправку» button: removed border — `bg-orange-500/10 text-orange-400
  hover:bg-orange-500/20`

Checks run:
- Claude_in_Chrome zoom: Гости — green «АКТИВЕН» badge, red trash always visible
- Claude_in_Chrome zoom: Договоры — clean status pills (orange/blue), borderless
  action buttons matching reference photo
- No npm run lint / build (UI-only, per project policy)
- Reference sources only READ, never modified

### 2026-05-29 — Match reference amber (#F59E0B) on filled buttons (branch)

Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/contracts/Contracts.tsx`
- `src/components/clients/Clients.tsx`

Issue: our filled CTA/active-filter used the redder orange `#F97316` + white text,
not the reference amber `#f59e0b` + black text.

**Договоры:**
- CTA «Новый договор» (header + EmptyState): `bg-[#F97316] text-white hover:bg-[#FB923C]`
  → `bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]`
- Active status filter: `bg-[#F97316] text-white` → `bg-[#F59E0B] text-[#050505]
  shadow-[0_0_15px_rgba(245,158,11,0.3)]` (reference glow)
- Input focus borders kept `#F97316` — matches reference `focus-within:border-orange-500/50`
  (orange-500 = #f97316)

**Гости:**
- CTA «Добавить гостя» hover no longer jumps to orange+white: `hover:bg-[#F97316]
  hover:text-white` → `hover:bg-[#D97706]` (stays amber, black text)

Checks run:
- Claude_in_Chrome screenshot: Договоры — «Все» filter + «Новый договор» now amber
- No console errors; no npm run lint / build (UI-only)

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

### 2026-05-29 — Create definitive UI_STYLE.md design system documentation (branch)

Branch: `feature/chessboard-restyle`
Files changed/created:
- `docs/UI_STYLE.md` (new, 768 lines)

**Task**: Create immutable reference document of current dark enterprise CRM design system
by collecting REAL values from live interface and source code (NOT guessing, NOT inventing).

**Approach**:
- Read all component source files (Leads.tsx, Clients.tsx, Contracts.tsx, Chessboard.tsx, App.tsx)
- Used grep to extract all `bg-[#...]`, `text-[#...]`, `border-[#...]` Tailwind classes
- Navigated live app on localhost:3002 to verify colors visually
- Evaluated JavaScript in browser to confirm computed styles
- Organized real hex values into semantic sections

**Document sections** (16 total):
1. Design philosophy (compact dark CRM, no unnecessary panels)
2. Color tokens (page #050505, surface #111111, elevated #161616, border #232323)
3. Text colors (primary #F4F1EA, secondary #8F9894)
4. Interface layers (hierarchical depth: page → surface → elevated → interactive)
5. Buttons (primary CTA amber #F59E0B + black #050505, secondary neutral, danger red)
6. Tables (compact rows py-3, header bg-[#161616] text-[#8F9894], borders #232323)
7. Filters/tabs (active amber + glow, inactive neutral #161616 — NEVER share colors)
8. Chessboard special rules (booking #F97316 + #2D9CDB, "Свободен" no highlight, legend compact)
9. Typography (sizes 11-20px, weights 400-700 by element, standard font stack)
10. Inputs/forms (bg-[#161616], focus border-[#F97316]/60, placeholder text-[#8F9894]/60)
11. Modals/panels (bg-[#111111], header/footer borders, specific padding)
12. Navigation (header bg-[#050505]/95, active tab #232323, inactive hover #161616)
13. Forbidden patterns (❌ no big panels, no amber mixing, no orange on buttons, no bright accents)
14. Screen examples (Leads, Clients, Contracts, Chessboard with actual class sequences)
15. Legacy migration (deprecated colors: #D98E2B → #F59E0B, #B4CDD2 → #8F9894, etc.)
16. Compliance checklist (verify before adding elements: layer, text color, CTA, filters, borders, badge pattern, hover, panels, palette, border-radius)

**Real values collected from**:
- Live interface: Chessboard (orange bookings #F97316, sea icon #8CAFBE, legend)
- Live interface: Leads (amber CTA #F59E0B, filter glow shadow, table structure)
- Live interface: Clients (green status badges, red delete button)
- Live interface: Contracts (status colors, action buttons)
- Source code grep: 250+ matches of hex color patterns across all components
- Browser DevTools computed styles: header, buttons, inputs, table cells

**Key decisions documented**:
- Orange (#F97316) is input focus ONLY, never CTA (CTA = amber #F59E0B)
- Filters: active uses amber with glow, inactive uses neutral #161616 (NEVER compete for amber)
- Badges: pattern is `bg-{color}/10 text-{color}` (no borders, 10% opacity bg)
- "Свободен" booking status has NO color highlight (already removed from legend)
- Row hover is #161616 (lift to next surface layer)
- Text is ONLY #F4F1EA (primary) or #8F9894 (secondary), no other grays

**Commits**:
- 4d0cb59: docs: Create definitive UI_STYLE.md with actual design system values

Checks run:
- Document created with 768 lines, all sections filled with real hex values
- No npm lint / build (documentation-only, per project policy)
- No code changes, no file modifications
- Manual verification: visual inspection of app matched hex values in doc

**Next**:
- Document serves as immutable reference for all future UI work
- All future changes must be documented here
- If old palette colors appear again, refer to migration section and replace

**Risks/TODOs**:
- None. Document is complete and reflects current state of feature/chessboard-restyle branch.

### 2026-06-24 — Redesign Dashboard/Summary and fix email/logout issues

Files changed:
- `src/components/dashboard/Dashboard.tsx`
- `src/services/localApi.ts`
- `src/services/emailService.ts`
- `src/components/chessboard/Chessboard.tsx`
- `src/App.tsx`

**Task**: Fix SMTP client auth header & logout delays, and overhaul hotel CRM Dashboard / Summary.

**Approach**:
1. Fixed SMTP authorization error "Требуется авторизация" by exporting `apiRequest` from `localApi.ts` and using it in `emailService.ts` and `Chessboard.tsx` to automatically send the Authorization token header.
2. Resolved slow logout block by launching the database shutdown cloud backup asynchronously in the background. The user is logged out immediately and notified via a background backup toast. Completed tasks archiving is run in parallel with logout session clearing using `Promise.all`.
3. Rebuilt the Dashboard section:
   - Added period picker state: "Сегодня", "7 дней", "Месяц", "Произвольный период" (with two date input fields).
   - Formulated dynamic metrics: loading/occupancy rate (based on occupied room-nights vs available room-nights), arrivals, departures, active contracts, total revenue, payments paid/remainder, leads count, and conversion.
Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/chessboard/Chessboard.tsx`
- `src/components/clients/Clients.tsx`

**Шахматка — color hierarchy + controls zone:**
- Page bg: `#0A0A0A` → `#050505` (near-black, matches App.tsx)
- Table surface: `#0A0A0A` → `#111111`; table header: `#111111` → `#161616`
- All borders: `#262626` → `#232323`
- Primary text: `#F5F5F5` → `#F4F1EA`; secondary text: `#8B8B8B` → `#8F9894`
- Price color: white `#F4F1EA` → orange `#F97316` (to match room category accent)
- Sea view icon: vivid blue `#2D9CDB` → muted blue-gray `#8CAFBE`
- Cell hover: `#262626/50` → `#232323`
- Removed outer card wrapper (`rounded-2xl border p-4 bg-[#0A0A0A]`) from controls zone — controls now float directly on page bg
- Legend: removed bordered panel, simplified to compact `flex gap-4 text-xs`; dot size `w-2.5 h-2.5`; only Забронирован (orange) + Предбронь (blue)
- Export/Email buttons: `bg-[#161616]` → `bg-[#111111]`; nav arrows hover: → `bg-[#161616]`

**Гости — filter palette:**
- Active filter: orange `bg-[#F59E0B] text-[#050505]` → neutral `bg-[#161616] text-[#F4F1EA]`
- Inactive filter: transparent bg, `text-[#8F9894]`, hover `bg-[#111111]`
- Filter container: `bg-[#111111]` → transparent (no bg in dark mode)
- CTA «Добавить гостя»: stays orange `bg-[#F59E0B] hover:bg-[#F97316]` — orange reserved for primary actions only
- Design principle applied: orange = CTA only; segmented filter highlights use neutral `#161616`

Checks run:
- Claude_in_Chrome screenshot: Шахматка — no card wrapper, #050505 bg, #111111 table, price orange, legend compact, no console errors
- Claude_in_Chrome screenshot: Гости — search + filters inline, active «Все» neutral (not orange), CTA button stays orange
- No npm run lint / build (UI-only, per project policy)

### 2026-05-29 — Align badges/buttons to reference app (branch)

Branch: `feature/chessboard-restyle`
Reference read-only from copy: `D:\CRM Teriberka\CRM-main\Новая папка\CRM-main`
Files changed:
- `src/components/clients/Clients.tsx`
- `src/components/contracts/Contracts.tsx`

**Гости (Clients):**
- Status badge «Активен»/«Чёрный список»: removed heavy border + emerald, now matches
  reference — `rounded-md bg-green-500/10 text-green-500 text-[10px] font-bold uppercase`
  (red equivalent for blacklist)
- Delete (trash) button: fixed "disappearing" — was `h-7 w-7 opacity-40 group-hover:opacity-100`
  with border (visible only on row hover). Now reference style: `h-9 w-9 rounded-xl
  text-red-500 bg-red-500/10 hover:bg-red-500/20`, always visible, Trash2 size 16

**Договоры (Contracts):**
- Status pill: removed border, switched from teal/FFE08A/F3B2BF to reference palette —
  paid `green-500/10`, cancelled `red-500/10`, signed_not_paid `orange-500/10`,
  else `blue-500/10`; `px-2.5 py-1 font-semibold` (icon inherits via text-current)
- «На печать» button: removed border, brighter text — `bg-[#161616] text-[#F4F1EA]
  hover:bg-[#232323]`
- «На отправку» button: removed border — `bg-orange-500/10 text-orange-400
  hover:bg-orange-500/20`

Checks run:
- Claude_in_Chrome zoom: Гости — green «АКТИВЕН» badge, red trash always visible
- Claude_in_Chrome zoom: Договоры — clean status pills (orange/blue), borderless
  action buttons matching reference photo
- No npm run lint / build (UI-only, per project policy)
- Reference sources only READ, never modified

### 2026-05-29 — Match reference amber (#F59E0B) on filled buttons (branch)

Branch: `feature/chessboard-restyle`
Files changed:
- `src/components/contracts/Contracts.tsx`
- `src/components/clients/Clients.tsx`

Issue: our filled CTA/active-filter used the redder orange `#F97316` + white text,
not the reference amber `#f59e0b` + black text.

**Договоры:**
- CTA «Новый договор» (header + EmptyState): `bg-[#F97316] text-white hover:bg-[#FB923C]`
  → `bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]`
- Active status filter: `bg-[#F97316] text-white` → `bg-[#F59E0B] text-[#050505]
  shadow-[0_0_15px_rgba(245,158,11,0.3)]` (reference glow)
- Input focus borders kept `#F97316` — matches reference `focus-within:border-orange-500/50`
  (orange-500 = #f97316)

**Гости:**
- CTA «Добавить гостя» hover no longer jumps to orange+white: `hover:bg-[#F97316]
  hover:text-white` → `hover:bg-[#D97706]` (stays amber, black text)

Checks run:
- Claude_in_Chrome screenshot: Договоры — «Все» filter + «Новый договор» now amber
- No console errors; no npm run lint / build (UI-only)

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

### 2026-05-29 — Create definitive UI_STYLE.md design system documentation (branch)

Branch: `feature/chessboard-restyle`
Files changed/created:
- `docs/UI_STYLE.md` (new, 768 lines)

**Task**: Create immutable reference document of current dark enterprise CRM design system
by collecting REAL values from live interface and source code (NOT guessing, NOT inventing).

**Approach**:
- Read all component source files (Leads.tsx, Clients.tsx, Contracts.tsx, Chessboard.tsx, App.tsx)
- Used grep to extract all `bg-[#...]`, `text-[#...]`, `border-[#...]` Tailwind classes
- Navigated live app on localhost:3002 to verify colors visually
- Evaluated JavaScript in browser to confirm computed styles
- Organized real hex values into semantic sections

**Document sections** (16 total):
1. Design philosophy (compact dark CRM, no unnecessary panels)
2. Color tokens (page #050505, surface #111111, elevated #161616, border #232323)
3. Text colors (primary #F4F1EA, secondary #8F9894)
4. Interface layers (hierarchical depth: page → surface → elevated → interactive)
5. Buttons (primary CTA amber #F59E0B + black #050505, secondary neutral, danger red)
6. Tables (compact rows py-3, header bg-[#161616] text-[#8F9894], borders #232323)
7. Filters/tabs (active amber + glow, inactive neutral #161616 — NEVER share colors)
8. Chessboard special rules (booking #F97316 + #2D9CDB, "Свободен" no highlight, legend compact)
9. Typography (sizes 11-20px, weights 400-700 by element, standard font stack)
10. Inputs/forms (bg-[#161616], focus border-[#F97316]/60, placeholder text-[#8F9894]/60)
11. Modals/panels (bg-[#111111], header/footer borders, specific padding)
12. Navigation (header bg-[#050505]/95, active tab #232323, inactive hover #161616)
13. Forbidden patterns (❌ no big panels, no amber mixing, no orange on buttons, no bright accents)
14. Screen examples (Leads, Clients, Contracts, Chessboard with actual class sequences)
15. Legacy migration (deprecated colors: #D98E2B → #F59E0B, #B4CDD2 → #8F9894, etc.)
16. Compliance checklist (verify before adding elements: layer, text color, CTA, filters, borders, badge pattern, hover, panels, palette, border-radius)

**Real values collected from**:
- Live interface: Chessboard (orange bookings #F97316, sea icon #8CAFBE, legend)
- Live interface: Leads (amber CTA #F59E0B, filter glow shadow, table structure)
- Live interface: Clients (green status badges, red delete button)
- Live interface: Contracts (status colors, action buttons)
- Source code grep: 250+ matches of hex color patterns across all components
- Browser DevTools computed styles: header, buttons, inputs, table cells

**Key decisions documented**:
- Orange (#F97316) is input focus ONLY, never CTA (CTA = amber #F59E0B)
- Filters: active uses amber with glow, inactive uses neutral #161616 (NEVER compete for amber)
- Badges: pattern is `bg-{color}/10 text-{color}` (no borders, 10% opacity bg)
- "Свободен" booking status has NO color highlight (already removed from legend)
- Row hover is #161616 (lift to next surface layer)
- Text is ONLY #F4F1EA (primary) or #8F9894 (secondary), no other grays

**Commits**:
- 4d0cb59: docs: Create definitive UI_STYLE.md with actual design system values

Checks run:
- Document created with 768 lines, all sections filled with real hex values
- No npm lint / build (documentation-only, per project policy)
- No code changes, no file modifications
- Manual verification: visual inspection of app matched hex values in doc

**Next**:
- Document serves as immutable reference for all future UI work
- All future changes must be documented here
- If old palette colors appear again, refer to migration section and replace

**Risks/TODOs**:
- None. Document is complete and reflects current state of feature/chessboard-restyle branch.

### 2026-06-24 — Redesign Dashboard/Summary and fix email/logout issues

Files changed:
- `src/components/dashboard/Dashboard.tsx`
- `src/services/localApi.ts`
- `src/services/emailService.ts`
- `src/components/chessboard/Chessboard.tsx`
- `src/App.tsx`

**Task**: Fix SMTP client auth header & logout delays, and overhaul hotel CRM Dashboard / Summary.

**Approach**:
1. Fixed SMTP authorization error "Требуется авторизация" by exporting `apiRequest` from `localApi.ts` and using it in `emailService.ts` and `Chessboard.tsx` to automatically send the Authorization token header.
2. Resolved slow logout block by launching the database shutdown cloud backup asynchronously in the background. The user is logged out immediately and notified via a background backup toast. Completed tasks archiving is run in parallel with logout session clearing using `Promise.all`.
3. Rebuilt the Dashboard section:
   - Added period picker state: "Сегодня", "7 дней", "Месяц", "Произвольный период" (with two date input fields).
   - Formulated dynamic metrics: loading/occupancy rate (based on occupied room-nights vs available room-nights), arrivals, departures, active contracts, total revenue, payments paid/remainder, leads count, and conversion.
   - Designed a "Requires Attention" widget showing urgent tasks (new leads, confirmed leads without prebooking, prebookings without contracts, contracts with debt, today's arrivals/departures) using grammatically correct pluralization helpers.
   - Designed an "Upcoming Events" grid for arrivals and departures (safely showing guest names, dates, and payment status badges).
   - Formulated a clean management report containing textual conclusion summaries.
   - Styled the dashboard with dark/light mode compatibility, modern layout grid, and aligned typography.

**Next**:
- Monitor operational metrics on the dashboard to verify stats accuracy.

### 2026-06-24 — Polish Dashboard layout, tab order, and metrics representation

Files changed:
- `src/App.tsx`
- `src/components/dashboard/Dashboard.tsx`

**Task**: Polish Dashboard UI/UX, reorder navigation tabs, clarify metrics terminology.

**Approach**:
1. Reordered tabs in `App.tsx` navigation menu to position "Сводка" (Dashboard) immediately after "Дополнительно".
2. Passed the `onViewChange` handler from `App.tsx` to `<Dashboard />` to enable interactive CTA links inside the "Requires Attention" widget.
3. Updated "Requires Attention" row styles to be visually larger and added explicit CTA buttons:
   - "Открыть заявки", "Проверить предброни", "Проверить долги", "Посмотреть заезды/выезды".
4. Clarified card terminology:
   - Renamed "Новые заявки" to "Новые за период" to differentiate it from all active new leads.
   - Renamed row headers in attention widget to "Новые к обработке".
   - Changed occupancy card subtext to calculate "номер-ночи" instead of "койко-ночи" (e.g. "X номер-ночей занято из Y доступных").
5. Overhauled "Отчёт за период" by adding a dedicated "Главное" metrics section summary for management.
6. Improved upcoming arrivals/departures listings empty states with clean calendar icons.
