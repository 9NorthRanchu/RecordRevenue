-- เอกสารประจำทริป — ต่อยอดตาราง TripDocuments ที่ "มีอยู่แล้ว" (2026-08-11)
--
-- ⚠️ ตาราง TripDocuments มีอยู่ในฐาน production ตั้งแต่ก่อนหน้านี้ และแอปหลัก
--    (backend/src/index.js) ใช้งานอยู่จริงผ่าน /api/trips/documents
--    ครั้งแรกผมเขียน CREATE TABLE ใหม่ทับ ซึ่งผิด — IF NOT EXISTS ทำให้คำสั่ง
--    ผ่านไปเงียบ ๆ แล้วไปพังตอน CREATE INDEX (no such column: stop_id)
--
-- โครงเดิมที่มีอยู่:
--   document_id · project_id · related_entity_id · file_url · description · type · created_at
--   related_entity_id เก็บได้ทั้ง stop_id และ trip_expense_id (ตามคอมเมนต์ในสคีมา)
--
-- จึงใช้ตารางเดิมและเติมเฉพาะคอลัมน์ที่ยังขาด แทนที่จะสร้างตารางที่สอง
-- ข้อดี: เอกสารที่เพิ่มจากแอปหลักกับจากหน้าทริปเป็นชุดเดียวกัน ไม่มีสองที่ขัดกัน

-- kind แยก "ไฟล์ที่อัปโหลดเข้าระบบ" ออกจาก "ลิงก์ภายนอก" เพื่อให้หน้าจอบอกได้
-- ว่าไฟล์อยู่ที่ไหน · ค่าเดิมทั้งหมดถือเป็น link เพราะแอปเก่าเก็บแต่ URL
ALTER TABLE TripDocuments ADD COLUMN kind TEXT DEFAULT 'link';

-- สองอันนี้ใช้แสดงขนาดไฟล์และเลือกไอคอนตามชนิด (PDF/รูป)
ALTER TABLE TripDocuments ADD COLUMN content_type TEXT;
ALTER TABLE TripDocuments ADD COLUMN size_bytes INTEGER;

-- คิวรีหลักคือ "เอกสารของทริปนี้" จึงต้องมี index ที่ project_id
CREATE INDEX IF NOT EXISTS idx_trip_docs_project ON TripDocuments(project_id);
CREATE INDEX IF NOT EXISTS idx_trip_docs_entity  ON TripDocuments(related_entity_id);

-- ตรวจผล — ควรเห็นคอลัมน์ใหม่ครบสามตัว
SELECT name FROM pragma_table_info('TripDocuments');
