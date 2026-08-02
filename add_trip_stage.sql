-- ═══════════════════════════════════════════════════════════════════════════
-- เพิ่มคอลัมน์ trip_stage ให้ Projects — จัดกลุ่มทริปเป็น Ongoing/Dream/Memory
-- สำหรับหน้ารวมทริปใน Unified Trip (ไม่ใช่สถานะทางบัญชี ไม่เกี่ยวกับ status)
--
-- รัน:
--   npx wrangler d1 execute record-revenue-db --remote --file=add_trip_stage.sql
--
--   ปลอดภัย:
--     · ALTER TABLE ADD COLUMN อย่างเดียว ไม่แตะข้อมูลเดิม
--     · รันซ้ำจะเจอ "duplicate column name" ซึ่งแปลว่าเคยรันไปแล้ว ไม่ใช่ error จริง
--     · ไม่ใช้ CHECK constraint ระดับฐานข้อมูล เพราะ D1 แก้ CHECK ทีหลังไม่ได้เลย
--       (เจอปัญหานี้มาแล้วกับ Captions.behavior) ตรวจค่าที่โค้ด backend แทน
--       ค่าที่ใช้จริง: ONGOING · DREAM · MEMORY (ดู TRIP_STAGES ใน unified-trip.js)
--
--   ⚠️ ทริป Hokkaido ที่มีอยู่ตอนนี้ (TRP-1783943254256) ตั้งเป็น ONGOING ตามที่ North ยืนยัน
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE Projects ADD COLUMN trip_stage TEXT DEFAULT 'ONGOING';

UPDATE Projects SET trip_stage = 'ONGOING'
 WHERE project_id = 'TRP-1783943254256' AND (trip_stage IS NULL OR trip_stage = '');

-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
-- คาดหวังเห็นทริป Hokkaido มี trip_stage = ONGOING และทริปอื่น (ถ้ามี) = ONGOING
-- ตามค่า default เพราะยังไม่เคยตั้งมาก่อน
SELECT project_id, name, status, trip_stage FROM Projects ORDER BY project_id;
