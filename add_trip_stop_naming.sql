-- ═══════════════════════════════════════════════════════════════════════════
-- TripStops: ชื่อสองภาษา + ลำดับการเรียง  (จำเป็นสำหรับหน้าแผนเที่ยว)
--
--   npx wrangler d1 execute record-revenue-db --remote --file=add_trip_stop_naming.sql
--
-- ⚠️ ทำไมไม่รัน add_puppup_trip_fields.sql ทั้งไฟล์
--    ไฟล์นั้นเพิ่มของอีกหลายอย่าง (Categories.color/icon_asset · TripExpenses.icon_asset ·
--    TripWallets.is_active · Projects.base_currency/weather_alert/lat/lng · TripDayWeather)
--    ซึ่งบางตัวซ้ำซ้อนกับที่เพิ่มไปแล้วรอบ Unified Trip (เช่น TripExpenses.icon_url)
--    จึงหยิบมาเฉพาะ 3 คอลัมน์ที่ endpoint จุดแวะต้องใช้จริง
--
--   ตรวจแล้วว่าฐาน production ยังไม่มีสามตัวนี้ (2026-07-28) แต่มี end_time
--   กับ icon_asset อยู่แล้วจาก add_hunsa_trip_stop_fields.sql
--
-- ⚠️ ALTER TABLE ADD COLUMN ไม่มี IF NOT EXISTS ใน SQLite
--    รันซ้ำจะได้ "duplicate column name" = เคยรันแล้ว ไม่ใช่ปัญหา
-- ═══════════════════════════════════════════════════════════════════════════

-- ชื่อไทยแยกจากชื่ออังกฤษ — ระบบเดิมมีแต่ city/accommodation ซึ่งใส่ชื่อสถานที่ไม่ได้
ALTER TABLE TripStops ADD COLUMN name_en TEXT;
ALTER TABLE TripStops ADD COLUMN name_th TEXT;

-- ลำดับในแผน — จำเป็นสำหรับการลากย้าย
-- เดิมเรียงด้วย stop_date + time เท่านั้น ถ้าเวลาชนกันลำดับจะไม่แน่นอน
--   ย้ายภายในวัน  = UPDATE sort_order
--   ย้ายไปวันอื่น = UPDATE stop_date (+ sort_order)
ALTER TABLE TripStops ADD COLUMN sort_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_stops_order ON TripStops(project_id, stop_date, sort_order);


-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
-- คาดหวัง 5 (name_en · name_th · sort_order · end_time · icon_asset)
SELECT COUNT(*) AS คอลัมน์ที่หน้าแผนเที่ยวต้องใช้
  FROM pragma_table_info('TripStops')
 WHERE name IN ('name_en','name_th','sort_order','end_time','icon_asset');

-- จุดแวะเดิมจะได้ sort_order = 0 ทั้งหมด · เรียงตามเวลาเป็นตัวรอง จึงยังอ่านได้ปกติ
-- จะเรียงใหม่ให้เองอัตโนมัติเมื่อมีคนลากย้ายครั้งแรก
SELECT stop_id, stop_date, time, sort_order, city
  FROM TripStops ORDER BY stop_date, sort_order, time;
