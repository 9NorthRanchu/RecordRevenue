-- ═══════════════════════════════════════════════════════════════════════════
-- Sessions — token ที่ออกให้ตอนล็อกอิน แทนการเชื่อ header x-user-id
--
--   npx wrangler d1 execute record-revenue-db --remote --file=add_sessions_table.sql
--
--   เพิ่มอย่างเดียว · ไม่แตะตารางหรือข้อมูลเดิมเลย · รันซ้ำได้
--
-- ⚠️ เก็บเป็น SHA-256 ของ token ไม่ใช่ตัว token
--    ถ้าฐานหลุด คนที่ได้ไปจะสวมสิทธิ์ไม่ได้ เพราะ hash ย้อนกลับไม่ได้
--    (token สุ่ม 256 บิต จึงไม่ต้องใส่ salt หรือใช้ PBKDF2 แบบรหัสผ่านที่คนตั้งเอง)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS Sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ใช้ตอนออกจากระบบทุกอุปกรณ์ และตอนลบ session ที่หมดอายุ
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON Sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON Sessions(expires_at);


-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
SELECT name FROM sqlite_master WHERE type='table' AND name='Sessions';
SELECT COUNT(*) AS session_ที่ยังใช้ได้ FROM Sessions
 WHERE datetime(expires_at) > datetime('now');
