-- ═══════════════════════════════════════════════════════════════
-- ทดลอง: ลบ CHECK constraint ของ Captions.behavior ทิ้งทั้งหมด
--
-- ต่างจากครั้งที่แล้วตรงไหน:
--   ครั้งที่แล้ว  DROP Captions ก่อน แล้วค่อย RENAME ตัวใหม่มาแทน
--                → DROP นับ FK violation ของทุกแถวใน Categories ที่อ้างอยู่
--                → RENAME ไม่ได้ล้างตัวนับ → commit ล้มเหลว
--
--   ครั้งนี้      RENAME ตัวเก่าออกไปก่อน แล้วสร้างตัวใหม่ชื่อเดิมทันที
--                DROP ตัวที่ถูก rename ออกไป (ไม่มีใครอ้างถึงแล้ว)
--                → ไม่มีการ DROP ตารางที่ถูกอ้างอิง → ไม่มี violation
--
-- กุญแจสำคัญคือ legacy_alter_table = ON
--   ปกติ RENAME จะไปแก้ข้อความ FK ในตารางลูกให้ชี้ตามชื่อใหม่
--   เปิด legacy ไว้ RENAME จะไม่แตะตารางลูก
--   → Categories ยังชี้ที่ "Captions" ซึ่งเราสร้างใหม่ทันที
--
-- ⚠️ ถ้า D1 ไม่รองรับ PRAGMA legacy_alter_table สคริปต์นี้จะล้มเหลว
--    และ rollback ทั้งหมด — ฐานข้อมูลไม่เสียหาย ลองได้ปลอดภัย
-- ═══════════════════════════════════════════════════════════════

PRAGMA legacy_alter_table = ON;

-- 1) ย้ายตารางเดิมออกไป (ตารางลูกยังชี้ที่ชื่อ Captions เหมือนเดิม)
ALTER TABLE Captions RENAME TO Captions_old;

-- 2) สร้างใหม่ชื่อเดิม — เอา CHECK ออกทั้งหมด ไม่ต้องจำกัดค่าอีกต่อไป
CREATE TABLE Captions (
    type_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    behavior TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    default_entity_id TEXT,
    default_contact_id TEXT,
    default_type TEXT,
    sub_behavior TEXT,
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);

-- 3) ย้ายข้อมูลกลับ
INSERT INTO Captions
    (type_id, family_id, name, behavior, created_at, default_entity_id, default_contact_id, default_type, sub_behavior)
SELECT
     type_id, family_id, name, behavior, created_at, default_entity_id, default_contact_id, default_type, sub_behavior
FROM Captions_old;

-- 4) ทิ้งตารางเก่า — ตอนนี้ไม่มี FK ใดชี้มาที่ Captions_old แล้ว
DROP TABLE Captions_old;

-- 5) ย้ายค่าจาก sub_behavior มาไว้ที่ behavior ให้เป็นคอลัมน์เดียว
UPDATE Captions
SET behavior = 'INVESTMENT', sub_behavior = NULL
WHERE sub_behavior = 'INVESTMENT';

-- 6) ตรวจผล
SELECT type_id, name, behavior, IFNULL(sub_behavior,'-') AS sub_behavior
FROM Captions ORDER BY behavior, name;
