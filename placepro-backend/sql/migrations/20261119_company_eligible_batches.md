# Company eligible batches

From the repository root, run:

```powershell
node placepro-backend/scripts/migrate-company-batches.js
```

The runner uses the backend `.env` and existing PostgreSQL connection configuration. It only applies the additive, idempotent `20261119_company_eligible_batches.sql` migration; it does not seed or change existing company profiles, skills, scores, or students.

Restart the companies service after deploying backend changes. In Admin > Company Requirements, edit each existing company and select at least one eligible batch. Unassigned companies intentionally evaluate zero students. Matching uses `students.academic_batch_id`, never legacy batch-name strings.

Company create/update requests accept `eligibleBatchIds`; reads return those IDs and `eligibleBatches` containing actual names. Company writes are admin-only. Trainer criteria overrides cannot replace saved batch assignments. Company and assignment updates commit atomically.

Run integration tests from `placepro-backend`:

```powershell
node --test tests/company-eligible-batches.test.js
```

Tests use a temporary PostgreSQL schema and remove it afterward. They cover population restrictions, requirements, pagination/search, edits, invalid input, permissions, persistence, and association cleanup. The existing full schema script has malformed single-dollar DO delimiters in its legacy domain upgrade section; the test uses its fresh-table definitions and applies this migration separately. This feature's migration does not depend on that legacy upgrade section.
