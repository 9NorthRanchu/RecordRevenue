-- ═══════════════════════════════════════════════════════════════════════════
-- ผูก TripMembers ที่ user_id ยังว่าง เข้ากับบัญชีผู้ใช้จริง โดยจับคู่จากชื่อ
--
-- ที่มา: migrate_trip_members.sql (27 ก.ค.) ตั้งใจเว้น user_id เป็น NULL ไว้
-- แล้วผูกให้เฉพาะทริป Hokkaido ทีหลัง — ทริปอื่น (รวมทริปทดสอบ) เลยเข้าแล้ว
-- ระบบไม่รู้ว่าเราเป็นสมาชิกคนไหน → หน้าจอขึ้น "ยังไม่รู้ว่าคุณเป็นสมาชิก
-- คนไหน" และแก้/ลบทริปไม่ได้เพราะสิทธิ์ admin ผูกกับแถวที่หาเจ้าของไม่เจอ
--
-- รัน:
--   npx wrangler d1 execute record-revenue-db --remote --file=link_trip_members.sql
--
--   ปลอดภัย:
--     · UPDATE เฉพาะแถวที่ user_id ยังเป็น NULL — แถวที่ผูกแล้วไม่ถูกแตะ
--     · จับคู่เฉพาะชื่อที่ตรงกับ Users.name ในครอบครัวเดียวกับทริปเท่านั้น
--       (สมาชิกที่เป็นแค่ชื่อ เช่นแขกร่วมทริปที่ไม่มีบัญชี จะคง NULL ไว้ ซึ่งถูกแล้ว)
--     · รันซ้ำได้ ไม่มีผลข้างเคียง (รอบสองไม่เหลือแถวให้อัปเดต)
-- ═══════════════════════════════════════════════════════════════════════════

-- ก่อนแก้ — ดูว่ามีกี่แถวที่ยังไม่ผูก และจะจับคู่กับใครได้บ้าง
SELECT tm.project_id, tm.display_name, tm.is_admin,
       (SELECT u.user_id FROM Users u
         WHERE u.name = tm.display_name
           AND u.family_id = (SELECT p.family_id FROM Projects p WHERE p.project_id = tm.project_id)
       ) AS จะผูกกับ
  FROM TripMembers tm
 WHERE tm.user_id IS NULL
 ORDER BY tm.project_id, tm.display_name;

UPDATE TripMembers
   SET user_id = (
     SELECT u.user_id FROM Users u
      WHERE u.name = TripMembers.display_name
        AND u.family_id = (SELECT p.family_id FROM Projects p WHERE p.project_id = TripMembers.project_id)
   )
 WHERE user_id IS NULL
   AND EXISTS (
     SELECT 1 FROM Users u
      WHERE u.name = TripMembers.display_name
        AND u.family_id = (SELECT p.family_id FROM Projects p WHERE p.project_id = TripMembers.project_id)
   );

-- ทริปที่ไม่มีผู้ดูแลเลย (ข้อมูลเก่าไม่ได้ตั้ง is_admin ไว้) — ยกสมาชิกที่ผูกกับ
-- บัญชีระดับ admin ของระบบขึ้นเป็นผู้ดูแลทริป ไม่งั้นผูกบัญชีแล้วก็ยังแก้/ลบไม่ได้
UPDATE TripMembers
   SET is_admin = 1
 WHERE user_id IN (SELECT user_id FROM Users WHERE role = 'admin')
   AND NOT EXISTS (
     SELECT 1 FROM TripMembers x
      WHERE x.project_id = TripMembers.project_id AND x.is_admin = 1
   );

-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
-- แถวที่เหลือ NULL ควรเป็นเฉพาะชื่อที่ไม่มีบัญชีผู้ใช้จริง (เช่น Ann, Mew
-- ถ้าไม่ได้สร้างเป็น Users) — ส่วนแถวชื่อ North ทุกทริปต้องผูกแล้ว
SELECT tm.project_id, p.name AS trip, tm.display_name, tm.user_id, tm.is_admin
  FROM TripMembers tm JOIN Projects p ON p.project_id = tm.project_id
 ORDER BY tm.project_id, tm.is_admin DESC, tm.display_name;
