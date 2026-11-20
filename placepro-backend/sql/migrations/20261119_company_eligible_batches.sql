BEGIN;
-- Existing companies intentionally receive no assignments. Configure them in Admin > Company Requirements.
CREATE TABLE IF NOT EXISTS company_eligible_batches (
    company_id BIGINT NOT NULL REFERENCES company_roles(role_id) ON DELETE CASCADE,
    batch_id BIGINT NOT NULL REFERENCES academic_batches(academic_batch_id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, batch_id)
);
CREATE INDEX IF NOT EXISTS company_eligible_batches_batch_idx ON company_eligible_batches(batch_id);
COMMIT;
