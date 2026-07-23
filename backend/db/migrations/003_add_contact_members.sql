-- Migration 003: Add members column to Contacts and Debts for direct user-based sharing
-- members TEXT (JSON array of user_ids) — NULL = visible to all family members
-- Note: Debts already has entity_id from migration 002 (kept, unused for filtering)

ALTER TABLE Contacts ADD COLUMN members TEXT;
ALTER TABLE Debts ADD COLUMN members TEXT;
