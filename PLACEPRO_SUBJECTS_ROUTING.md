# Subjects, routing and pagination

## Implementation

- Extended the existing Skills & Parameters page at `/admin/skills`; no duplicate subject model or API. Admins can create subjects with a generated or explicit unique code, edit names/descriptions/domains/types, set default visibility, and activate/deactivate records. Codes stay stable after creation.
- Trainer Students uses active database subjects as individual columns, with a scrollable checkbox menu, selection count, Select All, Reset to Defaults, optimistic saves and rollback on errors. Subject metadata refreshes on page entry and window focus.
- Preferences belong to the authenticated user and persist in PostgreSQL. A first customization snapshots all known subject defaults. Later default changes do not replace those choices; new subjects inherit their default when first encountered. Reset removes the customization. Inactive subjects retain their preferences and historical scores.
- Average and readiness calculations are unchanged; hiding a column never recalculates a score.
- Next.js App Router supplies role-prefixed URLs, Link sidebar navigation, history-pushing button navigation, session restoration, role guards and unknown-route handling. Existing page identifiers are retained, including `/trainer/import`, `/trainer/matching` and `/admin/skills`.
- Students search, batch, section, readiness, weak domain, project filter, sort and page are represented in URL query parameters. The table requests ten records per page from the existing API. Filtering resets the page; out-of-range pages are clamped. A student-id tie breaker makes ordering deterministic.
- Legacy dashboard/report screens still use the existing shared roster loading. Direct entry to Trainer Students skips that bulk roster request.

## Database and startup

Migration: `placepro-backend/sql/migrations/20261117_subject_columns.sql`.

Adds `skill_taxonomy.default_visible`, nullable `users.subject_column_preferences`, and normalized unique subject-name/code indexes. Existing Programming/DSA and Core Computer Science subjects are initially enabled when the visibility column is first added. Other subjects start disabled. No score or relationship tables are rewritten. Case-insensitive legacy duplicates cause a safe transaction rollback and must be resolved before retrying; no automatic merge or deletion is performed.

The migration has been applied to the configured local database. Student, assessment and rating counts and summed scores were checked before/after and were unchanged. Test fixtures used isolated schemas that were removed afterward.

For other databases, run this migration before deploying the new backend. The canonical `sql/schema.updated.sql` also contains the additive migration for fresh setup. Use the migration alone for existing deployments, without rerunning seed scripts.

Restart the existing backend services to load the changed controllers. No new environment variables or dependencies are needed. Continue using the existing `DATABASE_URL` and `NEXT_PUBLIC_API_URL`. The current Next.js server and Caddy reverse proxy already support nested routes; a static-file SPA fallback is not needed.

## API changes (under `/api/v1`)

- `GET /skills`: includes `numericId` and `defaultVisible`; supports `active=true/false`.
- `POST /skills`: admin only; accepts optional `code` and `defaultVisible`, validates input, returns 409 for duplicate names/codes.
- `PATCH /skills/:skillId`: admin only; edits default visibility, name, description, active status, domain and parameter type. Codes are immutable.
- `GET /me/subject-columns`: admin/trainer only; returns `{ columns: null | { [subjectCode]: boolean } }` for the authenticated account.
- `PATCH /me/subject-columns`: accepts `{ columns: { [subjectCode]: boolean } }` for an atomic partial update or `{ reset: true }`. Never accepts a target user id.
- `GET /students`: existing server pagination now handles invalid/out-of-range pages, deterministic ordering and approved-project filters (`has-project`, `no-project`, `score-below-60`, `score-at-least-60`).

## Important files

Backend: `src/services/admin/controllers/admin.controller.js`, `src/services/students/controllers/students.controller.js`, `sql/schema.updated.sql`, `sql/migrations/20261117_subject_columns.sql`, `tests/subject-columns.test.js`.

Frontend: `src/app/page.tsx`, `src/app/[...path]/page.tsx`, `src/components/placepro/portal.tsx`, `src/components/placepro/route-view.tsx`, `src/components/placepro/shell/nav-list.tsx`, `src/components/placepro/admin/skill-config-page.tsx`, `src/components/placepro/trainer/students-page.tsx`, `src/components/placepro/trainer/use-subject-columns.tsx`, `src/lib/placepro/routing.ts`, `src/lib/placepro/store.ts`, `src/lib/placepro/api.ts`, `src/types/index.ts`, `tests/routing.test.mjs`.

## Verification commands

From `placepro-backend`: `node --test tests/subject-columns.test.js` (requires the configured PostgreSQL connection and permission to create a disposable schema).

From `placepro-frontend`:

- `node --test tests/routing.test.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/eslint/bin/eslint.js .`
- `node node_modules/next/dist/bin/next build`

The Next.js build was run directly; the existing package script's Unix `cp` packaging steps were not exercised on Windows. Type checking is run separately because the existing Next configuration skips build-time type errors.

Browser automation was unavailable. Manually verify Dashboard -> Students -> Assessments -> Back -> Back -> Forward, page 2 refresh/back/forward, filtered URL sharing, a new tab, mobile layout, and login/logout preference restoration after restarting the backend.

Kluster could not review changes because its connector reported a connection error; no review result is available. The installed Next.js version emitted a security vulnerability warning during the build. Pre-existing user edits in the authentication controller disable password verification and log credentials; these were preserved and remain a security issue. Other unrelated user edits were also left intact.
