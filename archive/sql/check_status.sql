-- ตรวจสถานะข้อมูล + รายชื่อผู้ใช้ (เพื่อวินิจฉัยปัญหา User not found)

-- 1) มี master data เหลืออยู่ไหม (ถ้ายังมีเลข = ข้อมูลไม่ได้หาย)
SELECT 'จำนวนข้อมูล' AS x,
  (SELECT COUNT(*) FROM Entities)   AS companies,
  (SELECT COUNT(*) FROM Accounts)   AS statements,
  (SELECT COUNT(*) FROM Categories) AS categories,
  (SELECT COUNT(*) FROM Contacts)   AS customers,
  (SELECT COUNT(*) FROM Captions)   AS captions,
  (SELECT COUNT(*) FROM Users)      AS users;

-- 2) รายชื่อผู้ใช้ทั้งหมด (ดู user_id/role/family_id ของ admin)
SELECT user_id, name, email, role, family_id FROM Users ORDER BY role, name;

-- 3) ครอบครัว
SELECT family_id, name FROM Families;
