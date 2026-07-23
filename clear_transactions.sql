-- ═══════════════════════════════════════════════════════════════
-- ล้าง "เฉพาะรายการธุรกรรม" — เก็บ master data ไว้ทั้งหมด
--
--   ลบ:  Settlements · TransactionDetails · Transactions
--   เก็บ: Entities(Company) · Accounts(Statement) · Captions · Categories
--         · Contacts(Customer) · Projects(Trip) · Debts · Users(สมาชิก)
--         · UserPermissions(สิทธิ์) · CategoryBudgets · PlannedExpenses
--
--   ลบตามลำดับ child-first เพื่อไม่ให้ FK พัง
--   ⚠️ ลบถาวร กู้คืนไม่ได้ — Export Full Backup เก็บไว้ก่อนทุกครั้ง
-- ═══════════════════════════════════════════════════════════════

-- 1) นับก่อนลบ
SELECT 'ก่อนลบ' AS stage,
  (SELECT COUNT(*) FROM Transactions)        AS transactions,
  (SELECT COUNT(*) FROM TransactionDetails)  AS details,
  (SELECT COUNT(*) FROM Settlements)         AS settlements;

-- 2) ลบ child ก่อน แล้วค่อยลบ parent
DELETE FROM Settlements;
DELETE FROM TransactionDetails;
DELETE FROM Transactions;

-- 3) นับหลังลบ (ควรเป็น 0 ทั้งสามค่า)
SELECT 'หลังลบ' AS stage,
  (SELECT COUNT(*) FROM Transactions)        AS transactions,
  (SELECT COUNT(*) FROM TransactionDetails)  AS details,
  (SELECT COUNT(*) FROM Settlements)         AS settlements;

-- 4) ยืนยันว่า master data ยังอยู่ครบ
SELECT 'master ที่คงไว้' AS stage,
  (SELECT COUNT(*) FROM Entities)   AS companies,
  (SELECT COUNT(*) FROM Accounts)   AS statements,
  (SELECT COUNT(*) FROM Categories) AS categories,
  (SELECT COUNT(*) FROM Contacts)   AS customers;
