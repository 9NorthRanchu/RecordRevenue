-- ═══════════════════════════════════════════════════════════════════════════
-- ย้าย Projects.members (JSON array ของชื่อ) → ตาราง TripMembers  (✅ รัน remote แล้ว 2026-07-27 · 8 แถว)
--
--   รัน migrate_trip_members_preview.sql ดูก่อนเสมอ
--   npx wrangler d1 execute record-revenue-db --remote --file=migrate_trip_members.sql
--
--   ปลอดภัย:
--     · INSERT อย่างเดียว ไม่แตะ Projects.members เดิม (ยังอ่านได้เหมือนเดิม)
--     · member_id ผูกกับ project_id + ลำดับใน array → คงที่ รันซ้ำได้
--     · INSERT OR IGNORE → รันซ้ำไม่สร้างซ้ำ ไม่ error
--     · ถอนได้ด้วย DELETE FROM TripMembers WHERE member_id LIKE 'TM-%'
--       (ตราบใดที่ยังไม่มีบิลอ้างถึง)
--
--   ⚠️ สิ่งที่ไฟล์นี้ "ไม่" ทำ และต้องมาตั้งเองทีหลัง:
--     · user_id — เว้น NULL ทั้งหมด ฐานนี้มี Users แค่ '9North' ซึ่งไม่ตรงกับ
--       ชื่อใน members เลย ถ้าเดาจับคู่แล้วผิด = ให้สิทธิ์คนหนึ่งเห็นบิล
--       ส่วนตัวของอีกคน จึงปล่อยให้คนตัดสินใจ (ดูคำสั่งท้ายไฟล์)
--     · ledger_mode — ตั้ง MAIN ให้ทุกคน เพราะข้อมูลเดิมไม่มีอะไรบอกได้ว่า
--       ใครเป็น TRIP_ONLY ต้องมาปรับเองตามจริง
--     · is_admin — ให้คนแรกใน array เป็นค่าเริ่มต้น เป็นการเดาที่แก้ง่าย
-- ═══════════════════════════════════════════════════════════════════════════

-- admin ต้องไปที่ "คนแรกที่ใช้ได้จริง" ไม่ใช่ index 0 ของ array
-- ถ้ายึด index 0 แล้วช่องนั้นเป็นชื่อว่าง (เช่น ["  ","Mew"]) ทริปนั้นจะไม่มี
-- admin เลย = ไม่มีใครเปิดทริปกลับได้ · ROW_NUMBER นับเฉพาะแถวที่ผ่าน WHERE แล้ว
WITH picked AS (
    SELECT
        p.project_id,
        j.key                        AS idx,
        TRIM(j.value)                AS display_name,
        ROW_NUMBER() OVER (PARTITION BY p.project_id ORDER BY j.key) AS seat
    FROM Projects p, json_each(p.members) j
    WHERE json_valid(COALESCE(p.members,''))
      AND TRIM(COALESCE(j.value,'')) <> ''
)
INSERT OR IGNORE INTO TripMembers
    (member_id, project_id, user_id, display_name, role, ledger_mode, is_admin)
SELECT
    'TM-' || project_id || '-' || idx,
    project_id,
    NULL,
    display_name,
    CASE WHEN seat = 1 THEN 'ผู้ดูแล' ELSE 'สมาชิก' END,
    'MAIN',
    CASE WHEN seat = 1 THEN 1 ELSE 0 END
FROM picked;


-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
SELECT 'สมาชิกที่ย้ายมาแล้ว' AS item, COUNT(*) AS rows_ FROM TripMembers;

SELECT p.name AS trip_name, COUNT(m.member_id) AS members,
       SUM(m.is_admin) AS admins, SUM(m.user_id IS NULL) AS ยังไม่ผูก_user
FROM Projects p LEFT JOIN TripMembers m ON m.project_id = p.project_id
GROUP BY p.project_id ORDER BY p.created_at;

-- ทุกทริปควรมี admin คนเดียว ถ้าเป็น 0 แปลว่า members ว่างหรือ JSON พัง
SELECT 'ทริปที่ไม่มี admin' AS warn, COUNT(*) AS n FROM (
  SELECT project_id FROM TripMembers GROUP BY project_id HAVING SUM(is_admin) = 0
);


-- ═══════════════════════════════════════════════════════════════════════════
-- ทำเองทีหลัง (คัดลอกไปแก้ค่าแล้วรันแยก · ไม่ได้อยู่ในไฟล์นี้)
--
-- ผูก user เข้ากับสมาชิก — ดู member_id จากผลตรวจด้านบน
--   UPDATE TripMembers SET user_id = '9North'
--    WHERE member_id = 'TM-TRP-xxxxxxxxxxxxx-0';
--
-- ตั้งใครเป็น TRIP_ONLY (ค่าใช้จ่ายไม่ลงบัญชีหลักตอนปิดทริป)
--   UPDATE TripMembers SET ledger_mode = 'TRIP_ONLY'
--    WHERE member_id = 'TM-TRP-xxxxxxxxxxxxx-2';
--
-- ย้ายสิทธิ์ admin ไปคนอื่นในทริปเดียวกัน
--   UPDATE TripMembers SET is_admin = 0 WHERE project_id = 'TRP-xxxxxxxxxxxxx';
--   UPDATE TripMembers SET is_admin = 1 WHERE member_id  = 'TM-TRP-xxxxxxxxxxxxx-1';
-- ═══════════════════════════════════════════════════════════════════════════
