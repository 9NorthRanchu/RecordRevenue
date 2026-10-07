-- ร่าง — ยังไม่ต้องรัน จนกว่าจะตกลงแบบตามเอกสาร ออกแบบ-ทริป-จาก-Trip.xlsx.md
-- ข้อมูลการจอง (ที่พัก / ไฟลท์ / รถ / ตั๋ว) ผูกกับจุดแวะ 1 ต่อ 1
-- ยอดเงินไม่เก็บที่นี่ — ใช้ TripStops.planned_cost / planned_currency ที่เดียว
CREATE TABLE IF NOT EXISTS TripBookings (
  booking_id            TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  stop_id               TEXT NOT NULL UNIQUE,
  kind                  TEXT NOT NULL DEFAULT 'HOTEL',       -- HOTEL | FLIGHT | TRANSPORT | TICKET | OTHER
  status                TEXT NOT NULL DEFAULT 'CONFIRMED',   -- CONFIRMED | BACKUP | CANCELLED
  vendor                TEXT,                                -- Agoda / Trip.com / ANA ...
  ref_no                TEXT,                                -- เลขจอง / เลขเที่ยวบิน (ข้อความเสมอ)
  check_in              TEXT,                                -- YYYY-MM-DD (ที่พัก · ปกติ = stop_date)
  check_out             TEXT,                                -- YYYY-MM-DD
  depart_from           TEXT,                                -- ไฟลท์/รถ
  arrive_to             TEXT,
  arrive_time           TEXT,                                -- HH:MM
  room_desc             TEXT,                                -- ชื่อห้อง / ประเภทตั๋ว
  view_desc             TEXT,
  size_sqm              REAL,
  travelers             TEXT,                                -- ข้อความดิบ เช่น 2A1C(7)
  adults                INTEGER,
  children              INTEGER,
  child_ages            TEXT,                                -- "7" หรือ "7,10"
  inc_breakfast         INTEGER,                             -- 1 มี · 0 ไม่มี · NULL ไม่ทราบ
  inc_lunch             INTEGER,
  inc_dinner            INTEGER,
  has_parking           INTEGER,
  has_laundry           INTEGER,
  pay_status            TEXT NOT NULL DEFAULT 'UNPAID',      -- UNPAID | PAID | PAY_AT_VENUE
  pay_date              TEXT,                                -- YYYY-MM-DD
  pay_account_id        TEXT,                                -- Accounts.account_id ในสมุดจด (เช่น C01)
  pay_method            TEXT,                                -- ข้อความดิบ "3696" / "KTC"
  cancel_deadline       TEXT,                                -- ยกเลิกฟรีถึง YYYY-MM-DD
  cancel_policy         TEXT,
  linked_transaction_id TEXT,                                -- Transactions.transaction_id เมื่อบันทึกลงสมุดแล้ว
  notes                 TEXT,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME
);
CREATE INDEX IF NOT EXISTS idx_tripbookings_project ON TripBookings(project_id);
CREATE INDEX IF NOT EXISTS idx_tripbookings_cancel  ON TripBookings(project_id, cancel_deadline);
