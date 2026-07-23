-- Migration 005: Add type column to TransactionDetails
-- type was missing from the live DB (schema.sql had it but table was created without it)
-- Existing rows will have type = NULL; new rows use the CHECK constraint

ALTER TABLE TransactionDetails ADD COLUMN type TEXT;
