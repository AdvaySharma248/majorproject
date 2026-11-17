-- Remove the unused sign-in timestamp only; account status and audit logs remain.
ALTER TABLE users DROP COLUMN IF EXISTS last_active;
