-- แผนเที่ยวหน้าใหม่ (2026-08-20) — งบต่อจุด · ผูกบิลกับจุด · แคชเส้นทางขับจริง

-- งบที่ตั้งใจจะจ่ายที่จุดนี้ (กรอกเอง ตอนวางแผน)
-- แยกสกุลเงินไว้ เพราะทริปเดียวใช้หลายสกุลได้ และคนวางแผนคิดเป็นเงินท้องถิ่น
ALTER TABLE TripStops ADD COLUMN planned_cost REAL;
ALTER TABLE TripStops ADD COLUMN planned_currency TEXT;

-- 🔴 บิลไม่เคยผูกกับจุดแวะมาก่อน (TripExpenses ไม่มีคอลัมน์นี้)
-- หน้าจอฝั่ง prototype ส่ง activityId มาเป็น null เสมอ ตัวเลข "ใช้วันนี้"
-- จึงเป็น ฿0 ตลอดในโหมดข้อมูลจริง โดยไม่มี error ให้เห็น
-- NULL = บิลที่ไม่ได้ผูกกับจุดไหน (ยังจดได้ตามปกติ ไม่บังคับ)
ALTER TABLE TripExpenses ADD COLUMN stop_id TEXT;

-- แคชระยะทาง/เวลาขับจริงระหว่างจุดสองจุด (มาจาก OSRM)
-- ⚠️ ต้องแคช เพราะ OSRM ที่ใช้เป็นเซิร์ฟเวอร์สาธารณะ ไม่มี SLA และไม่ควรยิงซ้ำ
--    ทุกครั้งที่เปิดหน้า · คีย์เป็นคู่จุด ไม่ใช่รายวัน เพราะสลับลำดับแล้วคู่เดิมยังใช้ได้
-- source: 'osrm' = ระยะขับจริง · 'straight' = ถอยไปใช้เส้นตรงเพราะ OSRM ตอบไม่ได้
--    ต้องเก็บไว้ เพราะหน้าจอต้องเขียนกำกับให้ต่างกัน ห้ามโชว์ค่าประมาณเป็นค่าจริง
CREATE TABLE IF NOT EXISTS TripLegs (
  project_id   TEXT NOT NULL,
  from_stop_id TEXT NOT NULL,
  to_stop_id   TEXT NOT NULL,
  meters       REAL NOT NULL,
  seconds      REAL NOT NULL,
  source       TEXT NOT NULL DEFAULT 'osrm',
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, from_stop_id, to_stop_id),
  FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);
