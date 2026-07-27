-- Trip Finance P5 — บัญชีพักอัตโนมัติและร่องรอยการโอนของกระเป๋าทริป
-- ต้องรันหลัง add_trip_wallet_fundings.sql

CREATE TABLE IF NOT EXISTS TripHoldingAccounts (
    wallet_id     TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    account_id    TEXT NOT NULL UNIQUE,
    entity_id     TEXT NOT NULL,
    currency      TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES TripWallets(wallet_id),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id),
    FOREIGN KEY (account_id) REFERENCES Accounts(account_id),
    FOREIGN KEY (entity_id) REFERENCES Entities(entity_id)
);
CREATE INDEX IF NOT EXISTS idx_tha_project ON TripHoldingAccounts(project_id);

-- จับคู่ transfer สองฝั่งไว้สำหรับ audit และรองรับ reversal/reopen ใน P6
CREATE TABLE IF NOT EXISTS TripTransfers (
    transfer_id             TEXT PRIMARY KEY,
    project_id              TEXT NOT NULL,
    from_account_id         TEXT NOT NULL,
    to_account_id           TEXT NOT NULL,
    from_transaction_id     TEXT NOT NULL,
    to_transaction_id       TEXT NOT NULL,
    amount_thb              REAL NOT NULL,
    transfer_kind           TEXT NOT NULL, -- FUND | REFUND | CARRY_FORWARD
    source_wallet_id        TEXT,
    target_wallet_id        TEXT,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id)
);
CREATE INDEX IF NOT EXISTS idx_tt_project ON TripTransfers(project_id);
CREATE INDEX IF NOT EXISTS idx_tt_source_wallet ON TripTransfers(source_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tt_target_wallet ON TripTransfers(target_wallet_id);

SELECT name FROM sqlite_master WHERE type='table' AND name IN ('TripHoldingAccounts', 'TripTransfers') ORDER BY name;
