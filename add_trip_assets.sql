-- ที่เก็บรูปที่ผู้ใช้อัปโหลดเอง เมื่อไม่มี R2 (2026-08-11)
--
-- ทำไมต้องมี: ระบบอัปโหลดเดิมออกแบบให้เก็บไฟล์ที่ Cloudflare R2 แต่บัญชีนี้
-- ยังไม่ได้เปิดใช้ R2 พอ upload ล้มเหลว โค้ดฝั่งหน้าจอจะถอยไปเก็บรูปเป็น
-- data: URL ในเบราว์เซอร์แทน ซึ่งแปลว่า:
--   · รีเฟรชแล้วรูปหาย (เพราะ Projects.theme_banner ไม่รับ data: URL — ยาวเกิน)
--   · คนอื่นในทริปไม่เห็นรูปที่เราตั้ง
--
-- ตารางนี้ทำให้อัปโหลดใช้งานได้จริงโดยไม่ต้องพึ่ง R2 — เก็บไบต์ของรูปไว้ใน D1
-- แล้วคืน URL สั้น ๆ กลับไป (/api/unified-trip/icon/db/{asset_id}) ซึ่ง
-- Projects.theme_banner เก็บได้สบาย และทุกคนในครอบครัวเปิดดูได้เหมือนกัน
--
-- ⚠️ D1 ไม่ได้ออกแบบมาเก็บไฟล์ใหญ่ — โค้ดฝั่งเซิร์ฟเวอร์จำกัดไว้ที่ 700 KB ต่อรูป
--    ถ้าวันหนึ่งเปิด R2 ได้ ระบบจะสลับไปใช้ R2 เองอัตโนมัติ (ดู uploadIconRoute)
--    ของเก่าในตารางนี้ยังเปิดดูได้ต่อไปตามปกติ ไม่ต้องย้าย

CREATE TABLE IF NOT EXISTS TripAssets (
    asset_id     TEXT PRIMARY KEY,
    family_id    TEXT NOT NULL,
    content_type TEXT NOT NULL,
    bytes        BLOB NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trip_assets_family ON TripAssets(family_id);

-- ที่อยู่รูปแบนเนอร์ต้องยาวพอสำหรับ URL เต็ม — เดิมโค้ดจำกัดไว้ 300 ตัวอักษร
-- ซึ่งพอแล้วสำหรับรูปแบบ /api/unified-trip/icon/db/{uuid} (ราว 80 ตัวอักษร)

SELECT 'TripAssets' AS t, COUNT(*) AS n FROM TripAssets;
