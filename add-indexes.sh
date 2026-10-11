#!/bin/bash
# เพิ่มดัชนีลดการอ่าน D1 (แก้ rows_read เกินโควตาวันละ 5 ล้าน) — ไม่แก้ข้อมูล รันซ้ำได้
# ใช้: bash add-indexes.sh   (ต้องรอหลัง 7 โมงเช้า ถ้าวันนี้โควตาเต็มแล้ว หรืออัปเกรดแผนแล้ว)
set -u
cd "$(dirname "$0")" || exit 1
DB=record-revenue-db
step() {
  printf '  · %-40s' "$2"
  out=$(npx wrangler d1 execute "$DB" --remote --command "$1" 2>&1)
  if echo "$out" | grep -qi 'already exists'; then echo "มีอยู่แล้ว"
  elif echo "$out" | grep -qi 'error'; then echo "ล้มเหลว ↓"; echo "$out" | grep -i -A1 'error' | head -4 | sed 's/^/      /'
  else echo "✅"; fi
}
echo "▶ เพิ่มดัชนี"
step "CREATE INDEX IF NOT EXISTS idx_tx_acc_status_amt ON Transactions(account_id, status, total_amount);" "ยอดคงเหลือรายบัญชี"
step "CREATE INDEX IF NOT EXISTS idx_tx_status_date ON Transactions(status, date);" "รายการตามช่วงวันที่"
step "CREATE INDEX IF NOT EXISTS idx_td_tx ON TransactionDetails(transaction_id);" "บรรทัดย่อยของรายการ"
step "CREATE INDEX IF NOT EXISTS idx_td_category ON TransactionDetails(category_id);" "บรรทัดย่อยตามหมวด"
step "CREATE INDEX IF NOT EXISTS idx_settle_parent ON Settlements(parent_detail_id, settled_amount);" "ยอดตัดชำระลูกหนี้/เจ้าหนี้"
step "CREATE INDEX IF NOT EXISTS idx_userperm_entity ON UserPermissions(entity_id, user_id);" "สิทธิ์เห็นบริษัท"
step "PRAGMA optimize;" "ปรับสถิติฐานข้อมูล"
echo
echo "▶ ดัชนีทั้งหมดในตารางหลัก"
npx wrangler d1 execute "$DB" --remote --command "SELECT tbl_name, name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND tbl_name IN ('Transactions','TransactionDetails','Settlements','UserPermissions') ORDER BY tbl_name, name;" 2>&1 | grep -o '"name": "[A-Za-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'
echo
echo "👉 เสร็จแล้ว — พรุ่งนี้ลอง bash diag-d1.sh อีกรอบ เทียบตัวเลข"
