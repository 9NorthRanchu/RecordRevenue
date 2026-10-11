-- ═══════════════════════════════════════════════════════════════
-- Trip Finance P1 — ตารางล็อตการเติมเงินเข้ากระเป๋าทริป
--
--   เติมได้หลายรอบต่อกระเป๋า · แต่ละรอบเก็บ บาท/เงินตปท./เรท
--   เรทเฉลี่ยถ่วงน้ำหนัก = SUM(thb_amount) / SUM(foreign_amount) ของกระเป๋านั้น
--   linked_transaction_id = เชื่อมกับ Transaction จริงที่ลดบัญชีต้นทาง
--   ปลอดภัย: เป็น CREATE TABLE IF NOT EXISTS (เพิ่มอย่างเดียว)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS TripWalletFundings (
    funding_id            TEXT PRIMARY KEY,
    wallet_id             TEXT NOT NULL,
    project_id            TEXT NOT NULL,
    funding_date          TEXT,
    thb_amount            REAL NOT NULL DEFAULT 0,   -- บาทที่จ่ายออกจากบัญชีต้นทาง
    foreign_amount        REAL NOT NULL DEFAULT 0,   -- เงินตปท.ที่ได้ (ถ้า THB ล้วน = เท่ากับ thb_amount)
    rate                  REAL,                      -- บาทต่อ 1 หน่วยเงินตปท. (อ้างอิง = thb/foreign)
    source_account_id     TEXT,                      -- บัญชีต้นทางที่หักเงิน
    linked_transaction_id TEXT,                      -- Transaction จริงที่สร้างคู่กัน
    note                  TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id)  REFERENCES TripWallets(wallet_id),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id)
);
CREATE INDEX IF NOT EXISTS idx_twf_wallet  ON TripWalletFundings (wallet_id);
CREATE INDEX IF NOT EXISTS idx_twf_project ON TripWalletFundings (project_id);

-- ตรวจผล
SELECT name FROM sqlite_master WHERE type='table' AND name='TripWalletFundings';
