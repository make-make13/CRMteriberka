# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local CRM system for hospitality business (guest house rental). Single-PC deployment with Express backend, React frontend, and SQLite database. The project is nearly complete and in stabilization phase.

**Tech Stack:**
- Backend: Node.js + Express + TypeScript
- Frontend: React 19 + Vite + TypeScript
- Database: SQLite (better-sqlite3)
- UI: Tailwind CSS + Framer Motion
- Documents: @pdfme for PDF generation

## Deployment Context

**This is a local single-user desktop application, NOT a public web service.**

**Environment:**
- Single-PC deployment (Windows/Mac/Linux)
- Single trusted user (organization manager)
- No public internet exposure
- Server accessible only via `localhost` or `127.0.0.1`
- No external API consumers
- No multi-tenant requirements

**Primary Risks:**
- Data loss (database corruption, accidental deletion, no backups)
- Booking conflicts (double-booking same object/time)
- Business logic errors (incorrect contract calculations, wrong document generation)
- Authentication lockout (can't login, lost admin access)
- File corruption (SQLite database, backup archives)
- Workflow disruption (crashes, broken features, poor UX)

**Secondary Risks (lower priority for local deployment):**
- CORS, CSRF, clickjacking (not applicable when server is localhost-only)
- Rate limiting on login (single trusted user)
- API versioning, Swagger docs (no external API consumers)
- Enterprise monitoring (Sentry, log aggregation)
- Advanced security headers (CSP, HSTS for localhost)

**Security Approach:**
- Practical security for local trusted environment
- Protect against accidental data loss and user errors
- Secure credentials storage (SMTP passwords, admin password)
- Prevent SQL injection and data corruption
- Do NOT over-engineer for public SaaS threat model
- Focus on stability, data integrity, and safe operations

## Development Commands

```bash
# Start dev server (backend + frontend with HMR)
npm run dev

# Build for production
npm run build

# Type checking
npm run lint

# Run local API smoke test (creates temp client/contract, tests booking conflicts)
npm run test:local-api

# Check file encoding
npm run check:encoding

# Test SMTP connection without sending email
npm run smtp:check
```

**Port:** Server runs on `http://localhost:3000` (configurable via PORT env var, defaults to 3001 in code but typically 3000).

## Project Status & Core Rules

**This project is nearly complete.** Built with AI assistance. Focus on safe review, stabilization, and small fixes.

**Core Principles:**
- This is a local single-user application, not a public web service
- Prioritize data integrity, backups, and business logic correctness
- Security should be practical for local trusted environment
- Avoid over-engineering for enterprise/SaaS threat models

**Development Rules:**
- Do NOT rewrite architecture without approval
- Do NOT change UI unless task requires it
- Do NOT remove existing business logic
- Do NOT install new dependencies without explanation
- Do NOT read/modify .env files, secrets, tokens, or credentials
- Do NOT add enterprise features (rate limiting, CORS, CSRF, Sentry) unless specifically requested
- Before large changes, propose a plan first
- Make changes in small steps, one issue at a time
- After changes, run: `npm run lint` and `npm run build`
- Before final response, show changed files and explain what changed
- If change may break behavior, warn first
- If task unclear, ask questions before editing

**When Auditing:**
- Focus on data loss, booking conflicts, auth lockout, business logic errors
- Treat SQL injection, missing validation, unsafe migrations as P0/P1
- Treat CORS, CSRF, rate limiting, API versioning as P2 (not critical for localhost)
- Consider the single-user local deployment context when prioritizing issues

## Architecture

**Monolithic full-stack application:**

### Backend (`server/`)
- `server.ts` - Main Express server, API routes, auth middleware, SMTP integration
- `server/localDatabase.ts` - SQLite wrapper, schema initialization, booking conflict detection, transactions
- `server/authService.ts` - User authentication, role management (admin/manager), session tokens
- `server/backupService.ts` - Backup creation and management

### Frontend (`src/`)
- `src/App.tsx` - Main app shell, navigation, view switching
- `src/services/localApi.ts` - Typed API client layer (contractApi, clientApi, etc.)
- `src/components/chessboard/` - Interactive booking grid ("chessboard" view)
- `src/components/contracts/` - Contract forms and modals
- `src/components/clients/` - Client management
- `src/components/settings/` - Settings tabs (email, templates, backups, managers)
- `src/context/` - React contexts (AuthContext, ToastContext)

### Data Flow
1. User action in React component
2. Call to `src/services/localApi.ts`
3. HTTP request to Express server
4. Auth middleware (`requireAuth` or `requireAdmin`)
5. `localDb` method in `server/localDatabase.ts`
6. SQLite query to `data/crm.sqlite`
7. Response back through chain, React updates UI

### Database (`data/crm.sqlite`)
Tables: `clients`, `contracts`, `bookings`, `tasks`, `managers`, `settings`

**Booking conflict detection:** Server validates that bookings don't overlap for the same object/time before saving.

### Document Generation
Uses `@pdfme` library. Templates stored in database, editable in Settings → "Шаблоны документов". Variables use `{contract_number}` format. PDF generated client-side or server-side.

## Important Details

**SMTP Configuration:**
- Settings in `.env.local` (not committed)
- Default: Yandex SMTP (smtp.yandex.ru, port 465 SSL or 587 STARTTLS)
- Use `npm run smtp:check` to diagnose connection issues
- Old app passwords in source code are compromised; create new ones

**Backups:**
- Database: `data/crm.sqlite`
- Backup directory: `data/backups`
- Template backups: `data/backups/templates`
- Backup button in Settings → "Общие"
- Logout flow offers backup creation

**Service Object IDs:**
- Legacy IDs `bath` and `furako` are normalized to `gb-bath` and `gb-furako` in `localDatabase.ts`

**Firebase Migration:**
- Import from Firebase already completed
- Firebase dependencies and configs removed
- Old JSON snapshots may remain in `data/backups` as archive

## Testing & Verification

After changes:
1. Run `npm run lint` (TypeScript type check)
2. Run `npm run build` (production build)
3. For API changes: `npm run test:local-api`
4. For SMTP changes: `npm run smtp:check`
5. For UI changes: start `npm run dev` and test in browser

## Workflow for Fixes

1. Explain the problem
2. Propose minimal safe fix
3. Apply only approved change
4. Run checks (lint, build, relevant tests)
5. Explain the diff

## Workflow for Audits

1. Analyze without editing files
2. Detect tech stack
3. Find project scripts and commands
4. Build project map
5. Identify risks
6. Report issues by priority (adjusted for local single-user deployment):

   **P0 — Critical (fix immediately):**
   - Data loss risks (database corruption, missing backups, unsafe migrations)
   - Authentication lockout (can't login, lost admin access, broken auth flow)
   - Booking conflicts (double-booking, race conditions in conflict detection)
   - Business logic errors (wrong calculations, incorrect document generation)
   - Database integrity issues (missing foreign keys, broken transactions)
   - Credential leaks (SMTP passwords in logs, secrets in git)
   - Application crashes (unhandled exceptions, server won't start)

   **P1 — Important (fix soon):**
   - Data validation missing (can save invalid clients/contracts)
   - Accidental deletion risks (no confirmation, no soft delete, no audit log)
   - UX issues (confusing workflow, broken features, poor error messages)
   - Input sanitization (SQL injection in dynamic table names)
   - Password security (weak default password, no complexity requirements)
   - Backup reliability (backup fails silently, no verification)
   - Error handling gaps (unhandled edge cases, unclear error messages)
   - Performance issues (slow queries, missing indexes, large lists without pagination)

   **P2 — Optional (nice to have, but not critical for local deployment):**
   - CORS configuration (not needed for localhost-only)
   - CSRF protection (single trusted user on localhost)
   - Rate limiting on login (single user, not a brute-force target)
   - API versioning (no external consumers)
   - Swagger/OpenAPI docs (no external integrations)
   - Advanced security headers (CSP, HSTS, X-Frame-Options for localhost)
   - Enterprise monitoring (Sentry, log aggregation)
   - Clickjacking protection (not applicable for local app)
   - HTTPOnly cookies vs localStorage (both acceptable for localhost)
   - Code refactoring (large components, dead code, style improvements)
