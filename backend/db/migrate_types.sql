-- migrate_types.sql
PRAGMA foreign_keys = OFF;

-- 1. Create AccountTypes table
CREATE TABLE IF NOT EXISTS AccountTypes (
    type_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    behavior TEXT CHECK(behavior IN ('REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'TRANSFER')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);

-- 2. Insert default types for all existing families
INSERT INTO AccountTypes (type_id, family_id, name, behavior)
SELECT family_id || '_Type_Asset', family_id, 'Asset', 'ASSET' FROM Families;

INSERT INTO AccountTypes (type_id, family_id, name, behavior)
SELECT family_id || '_Type_Liability', family_id, 'Liability', 'LIABILITY' FROM Families;

INSERT INTO AccountTypes (type_id, family_id, name, behavior)
SELECT family_id || '_Type_Investment', family_id, 'Investment', 'ASSET' FROM Families;

INSERT INTO AccountTypes (type_id, family_id, name, behavior)
SELECT family_id || '_Type_Revenue', family_id, 'Revenue', 'REVENUE' FROM Families;

INSERT INTO AccountTypes (type_id, family_id, name, behavior)
SELECT family_id || '_Type_Expense', family_id, 'Expense', 'EXPENSE' FROM Families;

-- 3. Add temporary column to Categories to map to new types
ALTER TABLE Categories ADD COLUMN temp_account_type_id TEXT;

UPDATE Categories SET temp_account_type_id = family_id || '_Type_Revenue' WHERE type = 'INCOME';
UPDATE Categories SET temp_account_type_id = family_id || '_Type_Expense' WHERE type = 'EXPENSE';
UPDATE Categories SET temp_account_type_id = family_id || '_Type_Asset' WHERE type = 'ASSET';
UPDATE Categories SET temp_account_type_id = family_id || '_Type_Liability' WHERE type = 'LIABILITY';
UPDATE Categories SET temp_account_type_id = family_id || '_Type_Investment' WHERE type = 'EQUITY';

-- Fallback for any unknown types
UPDATE Categories SET temp_account_type_id = family_id || '_Type_Expense' WHERE temp_account_type_id IS NULL;

-- 4. Create new Categories table with the correct schema (NOT NULL, foreign key, dropping old 'type')
CREATE TABLE Categories_New (
    category_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    account_type_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id),
    FOREIGN KEY (account_type_id) REFERENCES AccountTypes(type_id)
);

-- 5. Copy data to new Categories table
INSERT INTO Categories_New (category_id, family_id, name, account_type_id, created_at)
SELECT category_id, family_id, name, temp_account_type_id, created_at FROM Categories;

-- 6. Replace old table
DROP TABLE Categories;
ALTER TABLE Categories_New RENAME TO Categories;

PRAGMA foreign_keys = ON;
