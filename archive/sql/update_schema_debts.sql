-- 12. Debts: ทะเบียนหนี้สิน (เจ้าหนี้/ลูกหนี้)
CREATE TABLE IF NOT EXISTS Debts (
    debt_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('PAYABLE', 'RECEIVABLE')) NOT NULL,
    contact_id TEXT NOT NULL,
    principal_category_id TEXT NOT NULL,
    interest_category_id TEXT,
    start_balance REAL NOT NULL,
    installment_amount REAL,
    start_date TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id),
    FOREIGN KEY (contact_id) REFERENCES Contacts(contact_id),
    FOREIGN KEY (principal_category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (interest_category_id) REFERENCES Categories(category_id)
);
