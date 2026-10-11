-- ═══════════════════════════════════════════════════════════════
-- Dashboard v2 — เฉพาะตารางใหม่ (CategoryBudgets, PlannedExpenses)
--
-- ทำไมต้องแยกไฟล์นี้ออกมา:
--   add_dashboard_tables.sql รันไม่ผ่านเพราะคอลัมน์ account_type บน
--   Accounts มีอยู่แล้ว (รันสำเร็จไปรอบก่อนหน้า) — D1 ห่อทั้งไฟล์เป็น
--   transaction เดียว พอ ALTER TABLE ตัวแรกพัง ทั้งไฟล์เลย rollback
--   ทำให้ 2 ตารางใหม่ด้านล่างไม่เคยถูกสร้างจริง
--
--   ไฟล์นี้ไม่แตะ Accounts เลย มีแต่ CREATE TABLE IF NOT EXISTS ซึ่ง
--   ปลอดภัย รันซ้ำกี่ครั้งก็ได้ไม่มี error
-- ═══════════════════════════════════════════════════════════════

-- 1) CategoryBudgets — งบประมาณรายหมวด
CREATE TABLE IF NOT EXISTS CategoryBudgets (
    budget_id    TEXT PRIMARY KEY,
    family_id    TEXT NOT NULL,
    category_id  TEXT NOT NULL,
    entity_id    TEXT,
    period_type  TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(period_type IN ('MONTHLY','YEARLY')),
    period       TEXT NOT NULL,
    amount       REAL NOT NULL DEFAULT 0,
    note         TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id)   REFERENCES Families(family_id),
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (entity_id)   REFERENCES Entities(entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_unique
    ON CategoryBudgets (family_id, category_id, IFNULL(entity_id,'-'), period_type, period);
CREATE INDEX IF NOT EXISTS idx_budget_period
    ON CategoryBudgets (family_id, period_type, period);

-- 2) PlannedExpenses — แผนรายจ่ายล่วงหน้า
CREATE TABLE IF NOT EXISTS PlannedExpenses (
    plan_id         TEXT PRIMARY KEY,
    family_id       TEXT NOT NULL,
    entity_id       TEXT,
    category_id     TEXT,
    contact_id      TEXT,
    title           TEXT NOT NULL,
    icon            TEXT,
    amount          REAL NOT NULL DEFAULT 0,
    due_date        TEXT NOT NULL,
    recurrence      TEXT NOT NULL DEFAULT 'NONE'
                    CHECK(recurrence IN ('NONE','MONTHLY','QUARTERLY','YEARLY')),
    recurrence_end  TEXT,
    status          TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK(status IN ('OPEN','DONE','CANCELLED')),
    done_date       TEXT,
    linked_transaction_id TEXT,
    note            TEXT,
    created_by_user_id TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id)   REFERENCES Families(family_id),
    FOREIGN KEY (entity_id)   REFERENCES Entities(entity_id),
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (contact_id)  REFERENCES Contacts(contact_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_family_status
    ON PlannedExpenses (family_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_plan_entity
    ON PlannedExpenses (family_id, entity_id);

-- ตรวจผล
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CategoryBudgets','PlannedExpenses');
