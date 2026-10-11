-- ═══════════════════════════════════════════════════════════════════════════
-- Unified Trip — ส่วนที่ 2 (ต่อจากจุดที่ add_unified_trip_schema.sql หยุด)
--
--   ใช้เมื่อรันไฟล์แรกแล้วเจอ `no such table: TripWallets`
--   ไฟล์แรกรันสำเร็จถึงหัวข้อ 3 แล้ว (TripMembers · TripCurrencies ·
--   TripExpenseCategories · TripExpenseParticipants + 8 คอลัมน์บน TripExpenses)
--   ไฟล์นี้คือหัวข้อ 4–7 ที่เหลือ
--
--   ⚠️ ต้องมี TripWallets และ TripWalletFundings อยู่ก่อน
--      ถ้ายังไม่มี (เช่นฐาน local ที่ไม่เคยรัน create_wallets_and_permissions.sql)
--      ให้รันไฟล์นั้นก่อน แล้วค่อยรันไฟล์นี้
--
--   เพิ่มอย่างเดียวเหมือนเดิม · ไม่มี DROP/DELETE/UPDATE
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 4. กระเป๋า: เจ้าของและไอคอน ──────────────────────────────────────────
ALTER TABLE TripWallets ADD COLUMN owner_member_id TEXT;
ALTER TABLE TripWallets ADD COLUMN icon_url TEXT;
ALTER TABLE TripWallets ADD COLUMN locked_rate REAL;


-- ─── 5. การปิดทริป · reversal · กำไรขาดทุนอัตราแลกเปลี่ยน ─────────────────
-- ยอดที่เข้าบัญชีจริง = SUM(ledger_total) ของทุกแถว ไม่ใช่แถวล่าสุด
CREATE TABLE IF NOT EXISTS TripClosures (
    closure_id       TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    entry_type       TEXT NOT NULL,            -- CLOSE | REOPEN
    posting_date     TEXT NOT NULL,            -- วันลงบัญชี ≠ วันจบทริป
    ledger_total     REAL NOT NULL DEFAULT 0,  -- REOPEN = ค่าลบของ CLOSE ที่กลับ
    trip_only_total  REAL NOT NULL DEFAULT 0,
    fx_result        REAL NOT NULL DEFAULT 0,  -- + กำไร / − ขาดทุน อัตราแลกเปลี่ยน
    carried_thb      REAL NOT NULL DEFAULT 0,
    reverses_id      TEXT,
    reason           TEXT,
    performed_by     TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)  REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (reverses_id) REFERENCES TripClosures(closure_id)
);
CREATE INDEX IF NOT EXISTS idx_tc_project ON TripClosures(project_id, created_at);

CREATE TABLE IF NOT EXISTS TripClosureLines (
    line_id           TEXT PRIMARY KEY,
    closure_id        TEXT NOT NULL,
    wallet_id         TEXT NOT NULL,
    disposition       TEXT NOT NULL,           -- RETURN | CARRY
    leftover_foreign  REAL NOT NULL DEFAULT 0,
    thb_cost          REAL NOT NULL DEFAULT 0,
    received_thb      REAL,
    fx_amount         REAL NOT NULL DEFAULT 0,
    carry_currency    TEXT,
    carry_amount      REAL,
    carry_funding_id  TEXT,
    FOREIGN KEY (closure_id)    REFERENCES TripClosures(closure_id) ON DELETE CASCADE,
    FOREIGN KEY (wallet_id)     REFERENCES TripWallets(wallet_id)
);
CREATE INDEX IF NOT EXISTS idx_tcl_closure ON TripClosureLines(closure_id);

ALTER TABLE TripWalletFundings ADD COLUMN carried_from_wallet_id TEXT;
ALTER TABLE TripWalletFundings ADD COLUMN carried_from_closure_id TEXT;


-- ─── 6. ตำแหน่งสมาชิก ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS TripPresence (
    project_id     TEXT NOT NULL,
    member_id      TEXT NOT NULL,
    is_sharing     INTEGER NOT NULL DEFAULT 0,
    stop_id        TEXT,
    place_label    TEXT,
    status         TEXT,
    latitude       REAL,
    longitude      REAL,
    checked_in_at  DATETIME,
    expires_at     DATETIME,
    PRIMARY KEY (project_id, member_id),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id)  REFERENCES TripMembers(member_id)
);


-- ─── 7. ทริป: วันลงบัญชีและสถานะปิด ───────────────────────────────────────
ALTER TABLE Projects ADD COLUMN posting_date TEXT;
ALTER TABLE Projects ADD COLUMN closed_at DATETIME;
ALTER TABLE Projects ADD COLUMN banner_url TEXT;


-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
SELECT 'ตารางใหม่ทั้งหมด' AS section, COUNT(*) AS found FROM sqlite_master
 WHERE type='table' AND name IN (
   'TripMembers','TripCurrencies','TripExpenseCategories','TripExpenseParticipants',
   'TripClosures','TripClosureLines','TripPresence');            -- คาดหวัง 7

SELECT 'TripExpenses' AS t, COUNT(*) AS added FROM pragma_table_info('TripExpenses')
 WHERE name IN ('owner_member_id','visibility','is_shared','split_mode','currency_code',
                'icon_url','settled_amount_thb','settled_rate');       -- คาดหวัง 8

SELECT 'TripWallets' AS t, COUNT(*) AS added FROM pragma_table_info('TripWallets')
 WHERE name IN ('owner_member_id','icon_url','locked_rate');           -- คาดหวัง 3

SELECT 'TripWalletFundings' AS t, COUNT(*) AS added FROM pragma_table_info('TripWalletFundings')
 WHERE name IN ('carried_from_wallet_id','carried_from_closure_id');-- คาดหวัง 2

SELECT 'Projects' AS t, COUNT(*) AS added FROM pragma_table_info('Projects')
 WHERE name IN ('posting_date','closed_at','banner_url');              -- คาดหวัง 3
