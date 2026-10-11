-- ═══════════════════════════════════════════════════════════════════════════
-- ดูก่อนย้าย: Projects.members (JSON) → TripMembers  · อ่านอย่างเดียว
--
--   ไฟล์นี้ไม่เขียนอะไรลงฐานเลย แค่แสดงว่าจะสร้างแถวอะไรบ้าง
--   ตรวจแล้วค่อยรัน migrate_trip_members.sql
--
--   npx wrangler d1 execute record-revenue-db --remote --file=migrate_trip_members_preview.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) ภาพรวม: ทริปไหนมีสมาชิกกี่คน · members ที่พังจะโผล่เป็น json_ok = 0
SELECT
    p.project_id,
    p.name                                   AS trip_name,
    p.status,
    json_valid(COALESCE(p.members,''))       AS json_ok,
    COALESCE(p.members,'(ว่าง)')             AS members_raw
FROM Projects p
ORDER BY p.created_at;

-- 2) แถวที่จะถูกสร้างจริง — ตรวจตรงนี้เป็นหลัก
--    member_id ผูกกับ project_id + ลำดับใน array จึงคงที่ทุกครั้งที่รัน
--    user_id เว้น NULL ทั้งหมดโดยตั้งใจ: ฐานนี้มี Users แค่ '9North'
--    ซึ่งไม่ตรงกับชื่อใน members เลย การเดาจับคู่เสี่ยงให้สิทธิ์ผิดคน
WITH picked AS (
    SELECT p.project_id, p.created_at, j.key AS idx, TRIM(j.value) AS display_name,
           ROW_NUMBER() OVER (PARTITION BY p.project_id ORDER BY j.key) AS seat
    FROM Projects p, json_each(p.members) j
    WHERE json_valid(COALESCE(p.members,''))
      AND TRIM(COALESCE(j.value,'')) <> ''
)
SELECT
    'TM-' || project_id || '-' || idx        AS member_id,
    project_id,
    display_name,
    NULL                                     AS user_id,
    'MAIN'                                   AS ledger_mode,
    CASE WHEN seat = 1 THEN 1 ELSE 0 END     AS is_admin,
    CASE WHEN seat = 1 THEN 'ผู้ดูแล' ELSE 'สมาชิก' END AS role
FROM picked
ORDER BY created_at, idx;

-- 3) นับรวม เทียบกับของที่มีอยู่แล้ว (ควรเป็น 0 ถ้ายังไม่เคยย้าย)
SELECT
    (SELECT COUNT(*) FROM Projects p, json_each(p.members) j
      WHERE json_valid(COALESCE(p.members,'')) AND TRIM(COALESCE(j.value,'')) <> '')  AS จะสร้าง,
    (SELECT COUNT(*) FROM TripMembers)                                                AS มีอยู่แล้ว;

-- 4) ทริปที่จะไม่ได้สมาชิกเลย — ต้องเพิ่มเองภายหลัง ไม่งั้นบิลผูกกับใครไม่ได้
SELECT p.project_id, p.name AS trip_name, COALESCE(p.members,'(NULL)') AS members_raw
FROM Projects p
WHERE NOT json_valid(COALESCE(p.members,''))
   OR (SELECT COUNT(*) FROM json_each(p.members) j WHERE TRIM(COALESCE(j.value,'')) <> '') = 0;

-- 5) ผู้ใช้ที่มีในระบบ — ไว้เทียบว่าจะผูก user_id ให้ใครทีหลัง
SELECT user_id, name, role FROM Users ORDER BY role DESC, name;
