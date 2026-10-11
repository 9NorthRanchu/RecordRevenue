-- ═══════════════════════════════════════════════════════════════════════════
-- Unified Trip — สคีมาที่ prototype ต้องใช้  (✅ รันบน remote แล้ว 2026-07-27)
--
--   สร้างจาก frontend/trip-unified-prototype/ (style.css?v=31 · app.js?v=33)
--   ทุกคำสั่งเป็น ADD COLUMN / CREATE TABLE IF NOT EXISTS เท่านั้น
--   ไม่มี DROP · ไม่มี ALTER CHECK · ไม่แตะข้อมูลเดิม  (ข้อจำกัด D1)
--
--   รันไปแล้วด้วย:
--     npx wrangler d1 execute record-revenue-db --remote --file=add_unified_trip_schema.sql
--   ผลตรวจ: 7 ตาราง · TripExpenses 8 · TripWallets 3 · TripWalletFundings 2 · Projects 3 ✅
--
-- ⚠️ ชื่อตาราง: ฐานนี้มี `Settlements` อยู่แล้ว = การหักล้างหนี้ AR
--    (parent_detail_id ↔ child_detail_id) ซึ่งคนละเรื่องกับการปิดทริปโดยสิ้นเชิง
--    จึงใช้ชื่อ TripClosures / TripClosureLines แทน TripSettlements เพื่อไม่ให้
--    คนอ่านโค้ดภายหลังสับสนสองเรื่องนี้เข้าด้วยกัน
--
-- ─────────────────────────────────────────────────────────────────────────
-- ที่มีอยู่แล้ว ไม่ต้องสร้างใหม่:
--   TripWallets(exclude_on_close, initial_balance_foreign/thb)  ← ใช้รับ carry-forward ได้เลย
--   TripWalletFundings(thb_amount, foreign_amount, rate, ...)   ← ล็อตเติมเงิน ครบแล้ว
--   TripTransfers(transfer_kind: FUND|REFUND|CARRY_FORWARD)     ← มี CARRY_FORWARD รออยู่แล้ว
--   TripHoldingAccounts · Projects.route_data · Projects.theme_banner
--
-- ช่องว่างจริงที่ prototype ต้องการ (เรียงตามความสำคัญ):
--   1. TripExpenses ไม่มี "เจ้าของเงิน" แยกจาก "คนจ่าย" · ไม่มี visibility · ไม่มีการหาร
--   2. สมาชิกทริปเก็บเป็น JSON ใน Projects.members → ไม่มีที่ใส่ ledger_mode/admin
--   3. ไม่มีที่เก็บผลการปิดทริป จึงตามรอย reversal ตอนเปิด-ปิดซ้ำไม่ได้
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. สมาชิกทริป ────────────────────────────────────────────────────────
-- แทน Projects.members (JSON array ของชื่อ) ซึ่งใส่สิทธิ์อะไรไม่ได้เลย
-- ledger_mode คือหัวใจ: TRIP_ONLY = ค่าใช้จ่ายไม่ post ลงบัญชีหลักตอนปิดทริป
CREATE TABLE IF NOT EXISTS TripMembers (
    member_id      TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL,
    user_id        TEXT,                                  -- NULL = คนนอกที่ไม่มี user ในระบบ
    display_name   TEXT NOT NULL,
    role           TEXT DEFAULT 'สมาชิก',
    ledger_mode    TEXT NOT NULL DEFAULT 'MAIN',          -- MAIN | TRIP_ONLY
    is_admin       INTEGER NOT NULL DEFAULT 0,            -- เปิดทริปกลับได้เฉพาะคนนี้
    avatar_color   TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tm_project ON TripMembers(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_project_user ON TripMembers(project_id, user_id);


-- ─── 2. สกุลเงินของทริป + เรทประมาณการ ────────────────────────────────────
-- Projects.exchange_rate เป็นเรทเดียวต่อทริป ใช้กับหลายสกุลไม่ได้
-- plan_rate = เรทที่ตั้งไว้ตอนวางแผน ใช้จนกว่ากระเป๋านั้นจะมี funding lot จริง
CREATE TABLE IF NOT EXISTS TripCurrencies (
    project_id   TEXT NOT NULL,
    code         TEXT NOT NULL,                           -- 'JPY'
    symbol       TEXT NOT NULL,                           -- '¥'
    label        TEXT,
    plan_rate    REAL NOT NULL DEFAULT 0,                 -- บาทต่อ 1 หน่วย
    is_base      INTEGER NOT NULL DEFAULT 0,              -- THB = 1
    icon_url     TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, code),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);


-- ─── 3. ค่าใช้จ่าย: สามมิติของเงิน ────────────────────────────────────────
-- TripExpenses.member_id เดิม = "คนจ่าย" เท่านั้น
-- เพิ่มเจ้าของเงินและกระเป๋าที่ตัดจริง เพราะทั้งสามอาจเป็นคนละอย่าง
-- (North รูดบัตรตัวเอง จ่ายแทนบิลที่จริง ๆ เป็นค่าใช้จ่ายของ Ann)
ALTER TABLE TripExpenses ADD COLUMN owner_member_id TEXT;      -- เจ้าของเงิน → ตัดสินว่าลงบัญชีหลักไหม
ALTER TABLE TripExpenses ADD COLUMN visibility TEXT DEFAULT 'TRIP';  -- PRIVATE | TRIP | SELECTED
ALTER TABLE TripExpenses ADD COLUMN is_shared INTEGER DEFAULT 0;     -- แชร์ให้เห็น ≠ ต้องหาร
ALTER TABLE TripExpenses ADD COLUMN split_mode TEXT DEFAULT 'EQUAL'; -- EQUAL | MANUAL | PERCENT
ALTER TABLE TripExpenses ADD COLUMN currency_code TEXT;              -- สกุลของ amount_foreign
ALTER TABLE TripExpenses ADD COLUMN icon_url TEXT;
-- ล็อกค่าบาทตอนปิดทริป: ก่อนปิดคำนวณสดจากเรทเฉลี่ย หลังปิดต้องนิ่ง
ALTER TABLE TripExpenses ADD COLUMN settled_amount_thb REAL;
ALTER TABLE TripExpenses ADD COLUMN settled_rate REAL;

-- แบ่งหมวดในบิลเดียว — ผลรวมต้องเท่ากับยอดบิล (บังคับที่ application layer)
CREATE TABLE IF NOT EXISTS TripExpenseCategories (
    line_id         TEXT PRIMARY KEY,
    trip_expense_id TEXT NOT NULL,
    category_id     TEXT,
    label           TEXT,
    amount_foreign  REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (trip_expense_id) REFERENCES TripExpenses(trip_expense_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tec_expense ON TripExpenseCategories(trip_expense_id);

-- ใครรับผิดชอบเท่าไร — ตัวนี้คือฐานของยอดที่ลงบัญชีตอนปิดทริป
-- ⚠️ ยอดต่อคนมาจากตารางนี้ ไม่ใช่จาก member_id (คนจ่าย) ของ TripExpenses
CREATE TABLE IF NOT EXISTS TripExpenseParticipants (
    participant_id  TEXT PRIMARY KEY,
    trip_expense_id TEXT NOT NULL,
    member_id       TEXT NOT NULL,
    amount_foreign  REAL NOT NULL DEFAULT 0,   -- ยอดที่คนนี้รับผิดชอบ ในสกุลของบิล
    percent         REAL,                      -- เก็บไว้เมื่อ split_mode = PERCENT
    FOREIGN KEY (trip_expense_id) REFERENCES TripExpenses(trip_expense_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id)       REFERENCES TripMembers(member_id)
);
CREATE INDEX IF NOT EXISTS idx_tep_expense ON TripExpenseParticipants(trip_expense_id);
CREATE INDEX IF NOT EXISTS idx_tep_member  ON TripExpenseParticipants(member_id);


-- ─── 4. กระเป๋า: เจ้าของและไอคอน ──────────────────────────────────────────
-- TripWallets เดิมไม่มีเจ้าของ → ยอดคงเหลือ/ประวัติเติมเงินจึงกันไม่ได้
ALTER TABLE TripWallets ADD COLUMN owner_member_id TEXT;
ALTER TABLE TripWallets ADD COLUMN icon_url TEXT;
ALTER TABLE TripWallets ADD COLUMN locked_rate REAL;   -- เรทที่แช่ไว้ตอนปิดทริป


-- ─── 5. การปิดทริป · reversal · กำไรขาดทุนอัตราแลกเปลี่ยน ─────────────────
-- ⚠️ จุดที่พังง่ายที่สุด: ปิด → เปิดกลับ → ปิดใหม่ ต้องได้ยอดสุทธิ = ครั้งล่าสุด
--    ทุกครั้งที่ปิดจะบันทึกยอดเต็ม (เป็นบวก) และทุกครั้งที่เปิดกลับจะบันทึก
--    รายการกลับของครั้งก่อน (เป็นลบ) โดยใช้ posting_date เดิมของครั้งนั้น
--    ยอดที่เข้าบัญชีจริง = SUM(ledger_total) ของทุกแถว ไม่ใช่แถวล่าสุด
CREATE TABLE IF NOT EXISTS TripClosures (
    closure_id       TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    entry_type       TEXT NOT NULL,            -- CLOSE | REOPEN
    posting_date     TEXT NOT NULL,            -- วันลงบัญชี ≠ วันจบทริป
    ledger_total     REAL NOT NULL DEFAULT 0,  -- REOPEN = ค่าลบของ CLOSE ที่กลับ
    trip_only_total  REAL NOT NULL DEFAULT 0,
    fx_result        REAL NOT NULL DEFAULT 0,  -- + กำไร / − ขาดทุน อัตราแลกเปลี่ยน
    carried_thb      REAL NOT NULL DEFAULT 0,  -- ต้นทุนที่ยกไปทริปหน้า
    reverses_id      TEXT,                     -- REOPEN ชี้กลับไปที่ CLOSE ที่ยกเลิก
    reason           TEXT,                     -- บังคับกรอกเมื่อ REOPEN
    performed_by     TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)  REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (reverses_id) REFERENCES TripClosures(closure_id)
);
CREATE INDEX IF NOT EXISTS idx_tc_project ON TripClosures(project_id, created_at);

-- ผลการจัดการเงินเหลือรายกระเป๋าของการปิดครั้งนั้น
-- RETURN : received_thb คือยอดที่ "ได้รับกลับมาจริง" · fx = received_thb − thb_cost
-- CARRY  : ไม่ผ่านเงินบาท จึงยังไม่ realise · thb_cost ถูกยกไปเป็นต้นทุนของล็อตใหม่
CREATE TABLE IF NOT EXISTS TripClosureLines (
    line_id           TEXT PRIMARY KEY,
    closure_id        TEXT NOT NULL,
    wallet_id         TEXT NOT NULL,
    disposition       TEXT NOT NULL,           -- RETURN | CARRY
    leftover_foreign  REAL NOT NULL DEFAULT 0,
    thb_cost          REAL NOT NULL DEFAULT 0, -- ต้นทุนตามเรทเฉลี่ย
    received_thb      REAL,                    -- เฉพาะ RETURN
    fx_amount         REAL NOT NULL DEFAULT 0, -- เฉพาะ RETURN
    carry_currency    TEXT,                    -- เฉพาะ CARRY (เท่าเดิม = ไม่ได้แลก)
    carry_amount      REAL,
    carry_funding_id  TEXT,                    -- ล็อตที่สร้างให้ทริปถัดไป
    FOREIGN KEY (closure_id)    REFERENCES TripClosures(closure_id) ON DELETE CASCADE,
    FOREIGN KEY (wallet_id)     REFERENCES TripWallets(wallet_id)
);
CREATE INDEX IF NOT EXISTS idx_tcl_closure ON TripClosureLines(closure_id);

-- ยกยอดข้ามทริป: ล็อตปลายทางต้องคงต้นทุนเดิม ห้ามคำนวณใหม่จากเรทวันปิด
ALTER TABLE TripWalletFundings ADD COLUMN carried_from_wallet_id TEXT;
ALTER TABLE TripWalletFundings ADD COLUMN carried_from_closure_id TEXT;


-- ─── 6. ตำแหน่งสมาชิก ─────────────────────────────────────────────────────
-- เก็บ "เช็กอินครั้งล่าสุด" ไม่ใช่พิกัดสด — ระบบไม่ได้ตามตัวเบื้องหลัง
-- expires_at ทำให้ข้อมูลเก่าเสื่อมเองแทนที่จะค้างอยู่ราวกับยังตามอยู่
CREATE TABLE IF NOT EXISTS TripPresence (
    project_id     TEXT NOT NULL,
    member_id      TEXT NOT NULL,
    is_sharing     INTEGER NOT NULL DEFAULT 0,
    stop_id        TEXT,
    place_label    TEXT,
    status         TEXT,                       -- arrived | moving
    latitude       REAL,
    longitude      REAL,
    checked_in_at  DATETIME,
    expires_at     DATETIME,
    PRIMARY KEY (project_id, member_id),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id)  REFERENCES TripMembers(member_id)
);


-- ─── 7. ทริป: วันลงบัญชีและสถานะปิด ───────────────────────────────────────
-- Projects.status มี active|planned|closed อยู่แล้ว เพิ่มเฉพาะที่ขาด
ALTER TABLE Projects ADD COLUMN posting_date TEXT;        -- วันลงบัญชีของการปิดล่าสุด
ALTER TABLE Projects ADD COLUMN closed_at DATETIME;
ALTER TABLE Projects ADD COLUMN banner_url TEXT;          -- theme_banner เดิมชี้ไป assets/ ที่ hardcode


-- ═══ ตรวจผลหลังรัน ═══════════════════════════════════════════════════════
SELECT 'ตารางใหม่' AS section, name FROM sqlite_master
 WHERE type='table' AND name IN (
   'TripMembers','TripCurrencies','TripExpenseCategories','TripExpenseParticipants',
   'TripClosures','TripClosureLines','TripPresence')
 ORDER BY name;

SELECT 'คอลัมน์ TripExpenses' AS section, COUNT(*) AS added FROM pragma_table_info('TripExpenses')
 WHERE name IN ('owner_member_id','visibility','is_shared','split_mode','currency_code',
                'icon_url','settled_amount_thb','settled_rate');   -- คาดหวัง 8

SELECT 'คอลัมน์ TripWallets' AS section, COUNT(*) AS added FROM pragma_table_info('TripWallets')
 WHERE name IN ('owner_member_id','icon_url','locked_rate');       -- คาดหวัง 3

SELECT 'คอลัมน์ Projects' AS section, COUNT(*) AS added FROM pragma_table_info('Projects')
 WHERE name IN ('posting_date','closed_at','banner_url');          -- คาดหวัง 3
