-- SQL Migration: Trip Wallets, Currencies, and Permissions

-- Create TripWallets Table
CREATE TABLE IF NOT EXISTS TripWallets (
    wallet_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    initial_balance_foreign REAL DEFAULT 0,
    initial_balance_thb REAL DEFAULT 0,
    exclude_on_close INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);

-- Alter Tables (Ignoring errors if columns already exist)
-- active_currencies: JSON array or comma-separated string of currencies, e.g. '["THB","JPY","USD"]'
ALTER TABLE Projects ADD COLUMN active_currencies TEXT;

-- wallet_id: which wallet this expense was paid from
ALTER TABLE TripExpenses ADD COLUMN wallet_id TEXT;

-- approved: 1 if approved/recorded by admin, 0 if recorded by guest and pending admin approval
ALTER TABLE TripExpenses ADD COLUMN approved INTEGER DEFAULT 1;
