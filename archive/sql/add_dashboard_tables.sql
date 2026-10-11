-- ═══════════════════════════════════════════════════════════════
-- Dashboard v2 — ตารางและคอลัมน์ที่ต้องเพิ่ม
--   1) Accounts: แยกประเภทบัญชี (เงินฝาก / เงินสด / บัตรเครดิต)
--   2) CategoryBudgets: งบประมาณรายหมวด ต่อ Company ต่อรอบ
--   3) PlannedExpenses: แผนรายจ่ายล่วงหน้า รองรับรายการซ้ำ
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Accounts — เพิ่มประเภทบัญชีและข้อมูลบัตรเครดิต
--    D1 ไม่รองรับ ADD COLUMN IF NOT EXISTS — ถ้าเคยรันแล้วจะ error
--    ให้ข้ามบรรทัดที่ error แล้วรันบรรทัดถัดไปต่อได้
-- ─────────────────────────────────────────────────────────────
ALTER TABLE Accounts ADD COLUMN account_type  TEXT DEFAULT 'BANK';  -- BANK | CASH | CREDIT
ALTER TABLE Accounts ADD COLUMN credit_limit  REAL DEFAULT 0;       -- วงเงิน (เฉพาะ CREDIT)
ALTER TABLE Accounts ADD COLUMN statement_day INTEGER;              -- วันตัดรอบบิล 1-31
ALTER TABLE Accounts ADD COLUMN due_day       INTEGER;              -- วันครบกำหนดชำระ 1-31

-- เดาประเภทจากชื่อบัญชีให้ก่อน แล้วค่อยแก้รายตัวในหน้า Settings
UPDATE Accounts SET account_type = 'CREDIT'
WHERE account_type = 'BANK' AND (
      LOWER(name) LIKE '%credit%'  OR LOWER(name) LIKE '%card%'
   OR LOWER(name) LIKE '%บัตร%'    OR LOWER(name) LIKE '%เครดิต%'
   OR LOWER(IFNULL(bank_name,'')) LIKE '%credit%'
);
UPDATE Accounts SET account_type = 'CASH'
WHERE account_type = 'BANK' AND (
      LOWER(name) LIKE '%cash%'   OR LOWER(name) LIKE '%pocket%'
   OR LOWER(name) LIKE '%เงินสด%'  OR LOWER(name) LIKE '%กระเป๋า%'
);

-- ─────────────────────────────────────────────────────────────
-- 2) CategoryBudgets — งบประมาณรายหมวด
--    period_type MONTHLY → period = 'YYYY-MM'
--    period_type YEARLY  → period = 'YYYY'
--    entity_id NULL = งบรวมของครอบครัว (ไม่ผูก Company ใด)
-- ─────────────────────────────────────────────────────────────
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
-- กันตั้งงบซ้ำ หมวดเดียว Company เดียว รอบเดียว
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_unique
    ON CategoryBudgets (family_id, category_id, IFNULL(entity_id,'-'), period_type, period);
CREATE INDEX IF NOT EXISTS idx_budget_period
    ON CategoryBudgets (family_id, period_type, period);

-- ─────────────────────────────────────────────────────────────
-- 3) PlannedExpenses — แผนรายจ่ายล่วงหน้า
--    recurrence NONE = ครั้งเดียว ใช้ due_date
--    recurrence อื่น  = เกิดซ้ำ ใช้ due_date เป็นงวดแรก
--                      คำนวณงวดถัดไปตอนแสดงผล ไม่สร้างแถวล่วงหน้า
--    recurrence_end NULL = ไม่มีกำหนดสิ้นสุด
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- ตรวจผลลัพธ์
-- ─────────────────────────────────────────────────────────────
SELECT account_type, COUNT(*) AS n FROM Accounts GROUP BY account_type;
