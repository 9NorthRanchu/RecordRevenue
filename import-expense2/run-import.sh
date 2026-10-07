#!/bin/bash
# นำเข้า Expense2 เข้า D1 (record-revenue-db) — รันจากโฟลเดอร์ RecordRevenue
# ใช้: bash import-expense2/run-import.sh
# รันซ้ำได้: ทุกไฟล์เป็น INSERT OR IGNORE / UPDATE · ไฟล์ที่เคยเข้าแล้วจะไม่เขียนซ้ำ
set -u
cd "$(dirname "$0")/.." || exit 1
DB=record-revenue-db
# --local = เขียนลงฐานจำลองในเครื่อง (.wrangler/state) ใช้กับ `npx wrangler dev` · ไม่แตะ Cloudflare
TARGET=--remote; [ "${1:-}" = "--local" ] && TARGET=--local
echo "ปลายทาง: $TARGET"
LOG="import-expense2/import-$(date +%Y%m%d-%H%M%S).log"
echo "บันทึกผลที่ $LOG"

run() {   # run <file> [allow-dup]
  local f="$1"; local n; n=$(grep -c '^INSERT\|^UPDATE\|^ALTER' "$f")
  echo "── $(basename "$f")  ($n คำสั่ง)"
  if npx wrangler d1 execute "$DB" $TARGET --yes --file="$f" >>"$LOG" 2>&1; then
    echo "   ✅ สำเร็จ"
  else
    if [ "${2:-}" = "allow-dup" ] && grep -q "duplicate column" "$LOG"; then
      echo "   ↷ คอลัมน์มีอยู่แล้ว (เคยรันไปแล้ว) — ข้าม"
    else
      echo "   ❌ ล้มเหลว — ดูรายละเอียดใน $LOG"; tail -20 "$LOG"; exit 1
    fi
  fi
}

run import-expense2/sql/00-alter.sql allow-dup
run import-expense2/sql/01-master.sql
for f in import-expense2/sql/10-data-*.sql; do run "$f"; done

echo
echo "✅ นำเข้าครบทุกไฟล์ · ขั้นต่อไป: bash import-expense2/verify-quick.sh"
