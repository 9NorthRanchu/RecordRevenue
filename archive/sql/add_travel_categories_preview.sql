-- ═══════════════════════════════════════════════════════════════════════════
-- ดูก่อนเพิ่ม: หมวดค่าใช้จ่ายท่องเที่ยวใต้ Caption "Expense" · อ่านอย่างเดียว
--
--   npx wrangler d1 execute record-revenue-db --remote --file=add_travel_categories_preview.sql
--
--   ไฟล์นี้ไม่เขียนอะไรลงฐานเลย ตรวจแล้วค่อยรัน add_travel_categories.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Caption ที่จะเอาหมวดใหม่ไปแขวน — ต้องเจอ "Expense" เพียงอันเดียว
--    ถ้าเจอหลายอัน (เช่นมีหลายครอบครัว) ต้องแก้ไฟล์ให้ระบุ family_id ก่อน
SELECT type_id AS caption_id, family_id, name, behavior
  FROM Captions WHERE behavior = 'EXPENSE';

-- 2) หมวดที่มีอยู่แล้วใต้ Caption นั้น — ดูว่าชนกับที่จะเพิ่มไหม
SELECT c.category_id, c.name, cap.name AS caption
  FROM Categories c JOIN Captions cap ON cap.type_id = c.caption_id
 WHERE cap.behavior = 'EXPENSE'
 ORDER BY c.name;

-- 3) แถวที่จะถูกสร้าง — ตรวจตรงนี้เป็นหลัก
--    category_id ตั้งตามแบบเดิมในฐาน (Bank_Transfer, Other_Revenue) คือ
--    ภาษาอังกฤษคั่นด้วย _ ส่วนชื่อที่คนเห็นเป็นภาษาไทย
WITH target AS (
  SELECT type_id AS caption_id, family_id FROM Captions
   WHERE behavior = 'EXPENSE' AND name = 'Expense' LIMIT 1
), newrows AS (
            SELECT 'Travel_Food'      AS category_id, 'ค่าอาหารและเครื่องดื่ม' AS name
  UNION ALL SELECT 'Travel_Transport', 'ค่าเดินทาง'
  UNION ALL SELECT 'Travel_Airfare',   'ค่าตั๋วเครื่องบิน'
  UNION ALL SELECT 'Travel_Admission', 'ค่าเข้าชมสถานที่'
)
SELECT n.category_id, n.name, t.caption_id, t.family_id,
       CASE WHEN EXISTS (SELECT 1 FROM Categories c WHERE c.category_id = n.category_id)
            THEN 'มีอยู่แล้ว — จะข้าม' ELSE 'จะสร้างใหม่' END AS สถานะ
  FROM newrows n, target t;

-- 4) ถ้าข้อ 3 ไม่มีแถวเลย แปลว่าหา Caption ชื่อ "Expense" ไม่เจอ
--    ดูข้อ 1 ว่าชื่อจริงคืออะไร แล้วแก้ชื่อในไฟล์ add_travel_categories.sql
SELECT COUNT(*) AS เจอ_caption_expense
  FROM Captions WHERE behavior = 'EXPENSE' AND name = 'Expense';
