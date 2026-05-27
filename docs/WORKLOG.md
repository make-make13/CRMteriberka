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
