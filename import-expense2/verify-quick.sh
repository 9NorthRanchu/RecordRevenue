#!/bin/bash
# ตรวจเร็วหลังนำเข้า — พิมพ์ตัวเลขให้ดูบนจอ (ตรวจเต็ม 10 ข้อใช้ verify_import.py กับไฟล์ export)
cd "$(dirname "$0")/.." || exit 1
DB=record-revenue-db
TARGET=--remote; [ "${1:-}" = "--local" ] && TARGET=--local
q() { echo; echo "▶ $1"; npx wrangler d1 execute "$DB" $TARGET --command "$2" 2>/dev/null | grep -v "^\s*$" | grep -v "wrangler\|Resource location\|Executing on\|To execute"; }

q "1) จำนวนรายการ (ต้อง 14143) และรายการย่อย (ต้อง 15162)" \
  "SELECT (SELECT COUNT(*) FROM Transactions WHERE source='PDF_IMPORT') AS transactions, (SELECT COUNT(*) FROM TransactionDetails) AS details;"
q "2) ยอดหัว ≠ ผลรวมรายการย่อย (ต้อง 0)" \
  "SELECT COUNT(*) AS bad FROM (SELECT t.transaction_id FROM Transactions t JOIN TransactionDetails d ON d.transaction_id=t.transaction_id GROUP BY t.transaction_id HAVING ABS(t.total_amount-(SUM(d.amount)-SUM(d.fee)-SUM(d.wht)))>0.02);"
q "3) หมวด/เจ้าของ/ลูกค้า/บัญชี กำพร้า (ต้อง 0 ทุกช่อง)" \
  "SELECT (SELECT COUNT(*) FROM TransactionDetails d LEFT JOIN Categories c ON c.category_id=d.category_id WHERE c.category_id IS NULL) AS cat, (SELECT COUNT(*) FROM TransactionDetails d LEFT JOIN Entities e ON e.entity_id=d.entity_id WHERE d.entity_id IS NOT NULL AND e.entity_id IS NULL) AS ent, (SELECT COUNT(*) FROM TransactionDetails d LEFT JOIN Contacts c ON c.contact_id=d.contact_id WHERE d.contact_id IS NOT NULL AND c.contact_id IS NULL) AS con, (SELECT COUNT(*) FROM Transactions t LEFT JOIN Accounts a ON a.account_id=t.account_id WHERE a.account_id IS NULL) AS acc, (SELECT COUNT(*) FROM TransactionDetails WHERE type IS NULL OR type='OTHER') AS no_type;"
q "4) บัญชีพัก Z01 สุทธิ (ต้อง 0)" \
  "SELECT ROUND(COALESCE(SUM(amount),0),2) AS z01_net FROM TransactionDetails WHERE category_id='Z01';"
q "5) ยอดสุทธิต่อบัญชี (เทียบแผ่น 'ตัวเลขควบคุม' คอลัมน์ B และ D)" \
  "SELECT account_id, COUNT(*) AS n, ROUND(SUM(total_amount),2) AS net FROM Transactions GROUP BY account_id ORDER BY account_id;"
q "6) ค่าใช้จ่าย T+G ต่อปี (ต้อง 2022=2,227,816.14 · 2023=2,431,436.24 · 2024=2,311,213.28 · 2025=1,792,128.93)" \
  "SELECT substr(t.date,1,4) AS y, ROUND(-SUM(d.amount),2) AS expense FROM TransactionDetails d JOIN Transactions t ON t.transaction_id=d.transaction_id WHERE d.head_owner LIKE 'T%' OR d.head_owner LIKE 'G%' GROUP BY y;"
