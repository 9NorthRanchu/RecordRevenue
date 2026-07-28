-- ═══════════════════════════════════════════════════════════════════════════
-- เพิ่มหมวดค่าใช้จ่ายท่องเที่ยวใต้ Caption "Expense"
--
--   รัน add_travel_categories_preview.sql ดูก่อนเสมอ
--   npx wrangler d1 execute record-revenue-db --remote --file=add_travel_categories.sql
--
--   ปลอดภัย:
--     · INSERT อย่างเดียว ไม่แตะหมวดหรือรายการเดิม
--     · INSERT OR IGNORE → รันซ้ำไม่สร้างซ้ำ ไม่ error
--     · caption_id / family_id ดึงจากฐานเอง ไม่ได้ hardcode
--     · ถอนได้ด้วย DELETE FROM Categories WHERE category_id LIKE 'Travel_%'
--       (ตราบใดที่ยังไม่มีรายการอ้างถึง)
--
-- ⚠️ Captions ใช้ `type_id` เป็นคีย์ ไม่ใช่ `caption_id` (ต่างจาก backend/db/schema.sql
--    ซึ่งเป็นแบบร่าง ไม่ตรงกับฐาน production) · Categories.caption_id ชี้ไปที่ Captions.type_id
--
-- ⚠️ ถ้า Caption ที่ใช้จริงไม่ได้ชื่อ "Expense" จะไม่มีอะไรถูกสร้างเลย
--    (ไม่ error เงียบ ๆ) — ดูผลตรวจท้ายไฟล์ว่าได้ 4 แถวไหม
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO Categories (category_id, family_id, name, caption_id)
SELECT n.category_id, t.family_id, n.name, t.caption_id
  FROM
       (SELECT 'Travel_Food'      AS category_id, 'ค่าอาหารและเครื่องดื่ม' AS name
         UNION ALL SELECT 'Travel_Transport', 'ค่าเดินทาง'
         UNION ALL SELECT 'Travel_Airfare',   'ค่าตั๋วเครื่องบิน'
         UNION ALL SELECT 'Travel_Admission', 'ค่าเข้าชมสถานที่') AS n,
       (SELECT type_id AS caption_id, family_id FROM Captions
         WHERE behavior = 'EXPENSE' AND name = 'Expense' LIMIT 1) AS t;


-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
-- คาดหวัง 4 แถว · ถ้าได้ 0 แปลว่าหา Caption "Expense" ไม่เจอ (ดูหมายเหตุด้านบน)
SELECT c.category_id, c.name, cap.name AS caption, cap.behavior
  FROM Categories c JOIN Captions cap ON cap.type_id = c.caption_id
 WHERE c.category_id LIKE 'Travel_%'
 ORDER BY c.category_id;

SELECT COUNT(*) AS หมวดท่องเที่ยวที่สร้างแล้ว
  FROM Categories WHERE category_id LIKE 'Travel_%';

-- หมวดใหม่ต้องอยู่ใต้ Caption ที่เป็นค่าใช้จ่าย ไม่งั้นฟอร์มบิลจะไม่แสดงให้เลือก
-- (API กรองด้วย behavior = 'EXPENSE') · ควรได้ 0
SELECT COUNT(*) AS ผิดฝั่ง_ต้องเป็น_0
  FROM Categories c JOIN Captions cap ON cap.type_id = c.caption_id
 WHERE c.category_id LIKE 'Travel_%' AND cap.behavior <> 'EXPENSE';
