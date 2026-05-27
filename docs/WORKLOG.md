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
