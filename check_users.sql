-- ตรวจว่ามีสมาชิก (Users) และครอบครัว (Families) อะไรบ้างในระบบ
SELECT user_id, name, email, role, family_id FROM Users ORDER BY role, name;
SELECT family_id, name FROM Families;
SELECT COUNT(*) AS จำนวน_users FROM Users;
