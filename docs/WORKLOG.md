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

### Initial checkpoint

Status:
- Git repo is on `main`.
- Remote: `origin https://github.com/make-make13/CRMteriberka.git`
- Supabase sync exists.
- Manual test pulled a Supabase row into CRM.
- Known UI issue: source label may show raw `bolshaya-medveditsa-landing`; Supabase lead may be described unclearly in modal.

Next:
- UI safety cleanup for Leads.
