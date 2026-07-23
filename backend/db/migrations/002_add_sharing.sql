-- Migration 002: Add sharing columns to Contacts and Debts
-- Contacts: members TEXT (JSON array of user_ids) — NULL = shared with all family members
-- Debts: entity_id TEXT — NULL = shared with all family members

ALTER TABLE Contacts ADD COLUMN members TEXT;
ALTER TABLE Debts ADD COLUMN entity_id TEXT REFERENCES Entities(entity_id);
