-- ระบบนำเข้าไอคอน (2026-08-07)
-- ให้ครอบครัวอัปโหลดไอคอนของตัวเองแทนชุดไอคอน puppup ที่ผูกมากับโค้ด
-- เก็บไฟล์จริงไว้ที่ R2 (binding "ICONS" ใน wrangler.json) แล้วเก็บแค่ URL ไว้ในตาราง

-- Categories.icon_asset อาจมีอยู่แล้วจาก add_puppup_trip_fields.sql ในบางฐาน
-- ถ้ารันแล้วเจอ "duplicate column name" แปลว่ามีคอลัมน์นี้อยู่แล้ว ข้ามได้เลย
ALTER TABLE Categories ADD COLUMN icon_asset TEXT;

-- ตรวจผล
SELECT category_id, family_id, name, icon_asset FROM Categories LIMIT 5;
