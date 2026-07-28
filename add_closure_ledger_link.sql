-- ═══════════════════════════════════════════════════════════════════════════
-- เชื่อมการปิดทริปเข้ากับรายการในบัญชีจริง
--
--   npx wrangler d1 execute record-revenue-db --remote --file=add_closure_ledger_link.sql
--
--   เพิ่มคอลัมน์เดียว ไม่แตะข้อมูลเดิม
--
-- ⚠️ ALTER TABLE ... ADD COLUMN ไม่มี IF NOT EXISTS ใน SQLite
--    รันซ้ำจะได้ error "duplicate column name" ซึ่งแปลว่าเคยรันไปแล้ว ไม่ใช่ปัญหา
-- ═══════════════════════════════════════════════════════════════════════════

-- Transaction ที่เกิดจากการปิด/เปิดทริปครั้งนี้
-- NULL = ครั้งนั้นยังไม่ได้โพสต์เข้าบัญชีจริง (เก็บไว้แค่ใน TripClosures)
ALTER TABLE TripClosures ADD COLUMN linked_transaction_id TEXT;


-- ═══ ตรวจผล ══════════════════════════════════════════════════════════════
SELECT 'TripClosures' AS t, COUNT(*) AS added FROM pragma_table_info('TripClosures')
 WHERE name = 'linked_transaction_id';   -- คาดหวัง 1

-- การปิดทริปที่ยังไม่ได้โพสต์เข้าบัญชี
SELECT closure_id, entry_type, posting_date, ledger_total
  FROM TripClosures WHERE linked_transaction_id IS NULL;
