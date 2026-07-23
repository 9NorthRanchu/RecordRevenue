-- Add new columns to Projects table
ALTER TABLE Projects ADD COLUMN start_date TEXT;
ALTER TABLE Projects ADD COLUMN end_date TEXT;
ALTER TABLE Projects ADD COLUMN destination TEXT;
ALTER TABLE Projects ADD COLUMN members TEXT;
ALTER TABLE Projects ADD COLUMN total_budget REAL;

-- Create TripExpenses table
CREATE TABLE IF NOT EXISTS TripExpenses (
    trip_expense_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    member_id TEXT, -- ระบุคนจ่าย/ผู้ร่วมทริป
    category_id TEXT,
    amount_foreign REAL,
    amount_thb REAL NOT NULL,
    paid_from_account_id TEXT,
    latitude REAL,
    longitude REAL,
    receipt_image_url TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (paid_from_account_id) REFERENCES Accounts(account_id)
);
