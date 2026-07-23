-- Migration 004: Add members column to Debts for direct user-based sharing
-- members TEXT (JSON array of user_ids) — NULL = visible to all family members

ALTER TABLE Debts ADD COLUMN members TEXT;
