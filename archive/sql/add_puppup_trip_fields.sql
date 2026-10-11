-- =====================================================================
--  PupPup Trip — คอลัมน์/ตารางที่ mockup ต้องใช้แต่ระบบเดิมยังไม่มี
--  รันครั้งเดียวกับ D1 production:
--    npx wrangler d1 execute record-revenue-db --remote --file=add_puppup_trip_fields.sql
--  หมายเหตุ: D1 ไม่รองรับ ALTER TABLE ... DROP/ALTER CHECK จึงใช้ ADD COLUMN อย่างเดียว
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) หมวดหมู่: สี + ไอคอน  (ใช้กับโดนัท / ชิปกรอง / legend หน้าบิล)
--    icon_asset = ชื่อไฟล์ในคลัง เช่น 'cat_food.png' หรือ URL เต็มจาก R2
-- ---------------------------------------------------------------------
ALTER TABLE Categories ADD COLUMN color TEXT;
ALTER TABLE Categories ADD COLUMN icon_asset TEXT;

-- ---------------------------------------------------------------------
-- 2) บิลทริป: ไอคอนกลมประจำรายการ (หน้าบิล + รายการล่าสุดหน้ากระเป๋าเงิน)
--    ถ้าเว้นว่าง ให้ fallback ไปใช้ Categories.icon_asset
-- ---------------------------------------------------------------------
ALTER TABLE TripExpenses ADD COLUMN icon_asset TEXT;

-- ---------------------------------------------------------------------
-- 3) จุดแวะ: ชื่อไทยแยกจากชื่ออังกฤษ  → "Senso-ji Temple (วัดเซ็นโซจิ)"
--    ระบบเดิมมี city/accommodation ช่องเดียว จึงเพิ่ม name_en + name_th
-- ---------------------------------------------------------------------
ALTER TABLE TripStops ADD COLUMN name_en TEXT;
ALTER TABLE TripStops ADD COLUMN name_th TEXT;


-- ---------------------------------------------------------------------
-- 3b) ลำดับการเรียงในแผน — จำเป็นสำหรับการลากย้าย/สลับตำแหน่ง
--     เดิมเรียงด้วย stop_date + time เท่านั้น ถ้าเวลาชนกันลำดับจะไม่แน่นอน
--     ย้ายภายในวัน  = UPDATE sort_order
--     ย้ายไปวันอื่น = UPDATE stop_date (+ sort_order)
--     ย้ายไปย่านอื่น = UPDATE parent_stop_id
-- ---------------------------------------------------------------------
ALTER TABLE TripStops ADD COLUMN sort_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_stops_order ON TripStops(project_id, stop_date, sort_order);

-- ---------------------------------------------------------------------
-- 4) กระเป๋าเงิน: badge "ใช้งานอยู่"
-- ---------------------------------------------------------------------
ALTER TABLE TripWallets ADD COLUMN is_active INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------
-- 5) ทริป: สกุลเงินหลัก + สวิตช์แจ้งเตือนอากาศ + พิกัดสำหรับดึงพยากรณ์
--    (theme_banner / active_currencies / route_data มีอยู่แล้ว ไม่ต้องเพิ่ม)
-- ---------------------------------------------------------------------
ALTER TABLE Projects ADD COLUMN base_currency TEXT DEFAULT 'THB';
ALTER TABLE Projects ADD COLUMN display_currency TEXT;      -- สกุลที่โชว์บนหน้าบิล (ชิปสลับได้)
ALTER TABLE Projects ADD COLUMN weather_alert INTEGER DEFAULT 1;
ALTER TABLE Projects ADD COLUMN latitude REAL;              -- ใช้เป็นค่า default ตอนเรียก Open-Meteo
ALTER TABLE Projects ADD COLUMN longitude REAL;

-- ---------------------------------------------------------------------
-- 6) แคชพยากรณ์อากาศ (Open-Meteo) — เก็บ 3 ช่วง เช้า/บ่าย/ค่ำ ต่อวันต่อจุดแวะ
--    Worker จะ refresh เมื่อ fetched_at เก่ากว่า 3 ชม.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS TripDayWeather (
    weather_id   TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    stop_date    TEXT NOT NULL,          -- YYYY-MM-DD
    city         TEXT,                   -- ชื่อเมือง (จับคู่กับ TripStops.city)
    latitude     REAL,
    longitude    REAL,
    morning_code INTEGER, morning_temp REAL, morning_rain INTEGER,
    noon_code    INTEGER, noon_temp    REAL, noon_rain    INTEGER,
    night_code   INTEGER, night_temp   REAL, night_rain   INTEGER,
    fetched_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tdw_key ON TripDayWeather(project_id, stop_date, city);

-- ---------------------------------------------------------------------
-- 7) ค่าเริ่มต้นสี/ไอคอนหมวดหมู่ให้ตรง mockup
--    (ปรับ WHERE ให้ตรงชื่อหมวดจริงของครอบครัวก่อนรัน)
-- ---------------------------------------------------------------------
UPDATE Categories SET color='#F382A1', icon_asset='cat_food.png'      WHERE name LIKE '%อาหาร%';
UPDATE Categories SET color='#79ACF5', icon_asset='cat_transport.png' WHERE name LIKE '%เดินทาง%' OR name LIKE '%ขนส่ง%';
UPDATE Categories SET color='#9D82EE', icon_asset='cat_hotel.png'     WHERE name LIKE '%ที่พัก%' OR name LIKE '%โรงแรม%';
UPDATE Categories SET color='#A3D2AB', icon_asset='cat_shop.png'      WHERE name LIKE '%ช้อป%' OR name LIKE '%ของฝาก%';
UPDATE Categories SET color='#F8BC71', icon_asset='cat_activity.png'  WHERE name LIKE '%กิจกรรม%' OR name LIKE '%เที่ยว%';

-- ตรวจผล
SELECT 'Categories'  AS t, COUNT(*) AS n FROM Categories WHERE icon_asset IS NOT NULL
UNION ALL SELECT 'TripDayWeather', COUNT(*) FROM TripDayWeather;
