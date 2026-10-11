-- ให้ผู้ร่วมทริปเข้าใช้งานด้วยรหัสของตัวเอง (2026-08-11)
--
-- ปัญหาเดิม: Puii กับ XinXin เข้าแอปไม่ได้เลย นอกจากจะใช้รหัสของระบบบัญชี
-- ครอบครัว ซึ่งเปิดให้เห็นการเงินทั้งบ้าน — ไม่ควรให้ผู้ร่วมทริปเข้าถึง
--
-- ⚠️ ของเดิมมี Projects.trip_password อยู่แล้ว แต่ **ไม่ใช้ต่อ** เพราะ:
--    1. เก็บรหัสเป็นข้อความธรรมดาในฐาน
--    2. รหัสเดียวใช้ร่วมกันทั้งทริป — แยกไม่ออกว่าใครเข้ามา และเพิกถอน
--       ทีละคนไม่ได้
--    3. ไม่ได้ออก token ให้ แค่คืน project_id กลับไป ซึ่งเท่ากับไม่มีการยืนยัน
--       ตัวตนในคำขอถัดไปเลย
--    คอลัมน์เดิมยังอยู่ ไม่ได้ลบ (แอปหลักอาจยังอ้างถึง) แต่ระบบใหม่ไม่แตะ

-- รหัสผ่านของสมาชิกแต่ละคน เก็บเป็น hash แบบเดียวกับรหัสผู้ใช้ (PBKDF2 ใน auth.js)
-- ว่าง = สมาชิกคนนั้นยังเข้าใช้งานด้วยตัวเองไม่ได้ (ค่าเริ่มต้นของทุกคน)
ALTER TABLE TripMembers ADD COLUMN passcode_hash TEXT;

-- session ของผู้ร่วมทริป — แยกจากตาราง Sessions ของระบบบัญชีครอบครัวโดยตั้งใจ
-- เพราะคนละระดับสิทธิ์กันคนละเรื่อง ถ้าปนกันจะมีวันที่เผลอให้ token ของผู้ร่วมทริป
-- ผ่านด่านที่ออกแบบไว้สำหรับสมาชิกครอบครัว
--
-- เก็บ SHA-256 ของ token ไม่ใช่ตัว token — ฐานหลุดก็สวมสิทธิ์ไม่ได้
-- token ผูกกับ "ทริปเดียว + สมาชิกคนเดียว" เสมอ ใช้ข้ามทริปไม่ได้
CREATE TABLE IF NOT EXISTS TripMemberSessions (
    token_hash TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    member_id  TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id),
    FOREIGN KEY (member_id)  REFERENCES TripMembers(member_id)
);
CREATE INDEX IF NOT EXISTS idx_tms_member ON TripMemberSessions(member_id);

-- ตรวจผล
SELECT name FROM pragma_table_info('TripMembers') WHERE name='passcode_hash';
SELECT 'TripMemberSessions' AS t, COUNT(*) AS n FROM TripMemberSessions;
