-- ═══════════════════════════════════════════════════════════════
-- แยก "เงินลงทุน" ออกจาก ASSET  —  วิธีที่ทำได้จริงบน D1
--
-- ทำไมไม่แก้ CHECK constraint:
--   Captions.behavior มี CHECK(... IN ('REVENUE','EXPENSE','ASSET','LIABILITY','TRANSFER'))
--   SQLite แก้ CHECK ตรงๆ ไม่ได้ ต้อง DROP + สร้างใหม่
--   แต่ DROP TABLE จะบันทึก FK violation ค้างไว้ (Categories.caption_id อ้างอยู่)
--   และ D1 ปิด PRAGMA foreign_keys=OFF ไม่ได้ เพราะห่อทุกอย่างใน transaction
--   → transaction จะ rollback เสมอ
--
-- วิธีนี้: เพิ่มคอลัมน์ sub_behavior แทน
--   behavior     = ASSET       (คงเดิม ผ่าน CHECK เดิม ไม่กระทบโค้ดเก่า)
--   sub_behavior = INVESTMENT  (ตัวแยกจริง ใช้ในโค้ดใหม่)
--   ADD COLUMN ปลอดภัยบน D1 ไม่ต้อง DROP ไม่มีปัญหา FK
--
-- ข้อดีเทียบกับการเดาจากชื่อ id: เป็นฟิลด์จริง ตั้งค่าได้จากหน้า Settings
-- ขยายค่าอื่นในอนาคตได้ เช่น SAVINGS, PREPAID โดยไม่ต้องแตะ schema อีก
-- ═══════════════════════════════════════════════════════════════

-- 1) เพิ่มคอลัมน์  (ถ้าเคยรันแล้วจะ error "duplicate column" — ข้ามได้)
ALTER TABLE Captions ADD COLUMN sub_behavior TEXT;

-- 2) ตั้งค่าให้ Caption ที่เป็นเงินลงทุน
UPDATE Captions
SET sub_behavior = 'INVESTMENT'
WHERE behavior = 'ASSET'
  AND (
        LOWER(name) LIKE '%investment%'
     OR LOWER(name) LIKE '%ลงทุน%'
     OR LOWER(type_id) LIKE '%investment%'
  );

-- 3) ตรวจผล — Investment ต้องมี sub_behavior = INVESTMENT
--    ที่เหลือ sub_behavior ต้องเป็น NULL
SELECT type_id, name, behavior, IFNULL(sub_behavior,'-') AS sub_behavior
FROM Captions
WHERE behavior IN ('ASSET','LIABILITY')
ORDER BY sub_behavior DESC, name;
