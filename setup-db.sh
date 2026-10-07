#!/bin/bash
# เตรียมฐานข้อมูลให้ตรงกับโค้ดปัจจุบัน แล้วตรวจผลให้อ่านง่าย
#
# ใช้: bash setup-db.sh
#
# 🔴 ทำไมต้องยิงทีละคำสั่ง ไม่ใช่ --file ทั้งไฟล์:
#    wrangler d1 execute --file จะ **หยุดทันทีที่เจอ error แรก**
#    ไฟล์ที่เขียน ALTER หลายบรรทัดแล้วค่อย CREATE TABLE ท้ายไฟล์ จึงพังเงียบ ๆ
#    เมื่อ ALTER ตัวใดตัวหนึ่งชนว่า "duplicate column" — บรรทัดหลังจากนั้น
#    ไม่เคยถูกรันเลย และไม่มีใครรู้ เพราะ error ที่เห็นบอกแค่คอลัมน์ซ้ำ
#    (เจอจริง 2026-08-22: TripLegs ไม่เคยถูกสร้าง ทั้งที่ไฟล์รันไปแล้ว)
#
#    ยิงทีละคำสั่งแล้วมองข้าม "ซ้ำ" เป็นเรื่องปกติ = รันซ้ำกี่รอบก็ปลอดภัย

set -u
cd "$(dirname "$0")" || exit 1
DB=record-revenue-db

quiet() { grep -Ev 'wrangler [0-9]|update available|Resource location|Executing on|remove the|execution fails|^\s*$|^-+$|🌀|⛅️'; }

# รันหนึ่งคำสั่ง · "ซ้ำ/มีอยู่แล้ว" ถือว่าสำเร็จ
step() {
  printf '  · %-46s' "$2"
  out=$(npx wrangler d1 execute "$DB" --remote --command "$1" 2>&1)
  if echo "$out" | grep -qi 'duplicate column\|already exists'; then echo "มีอยู่แล้ว"
  elif echo "$out" | grep -q 'ERROR'; then
    echo "ล้มเหลว ↓"; echo "$out" | grep -i -A1 'error' | head -4 | sed 's/^/      /'
  else echo "เพิ่มแล้ว"; fi
}

echo "▶ งบต่อจุด + ผูกบิลกับจุดแวะ + แคชเส้นทาง"
step "ALTER TABLE TripStops ADD COLUMN planned_cost REAL;"        "TripStops.planned_cost"
step "ALTER TABLE TripStops ADD COLUMN planned_currency TEXT;"    "TripStops.planned_currency"
step "ALTER TABLE TripExpenses ADD COLUMN stop_id TEXT;"          "TripExpenses.stop_id"
step "CREATE TABLE IF NOT EXISTS TripLegs (project_id TEXT NOT NULL, from_stop_id TEXT NOT NULL, to_stop_id TEXT NOT NULL, meters REAL NOT NULL, seconds REAL NOT NULL, source TEXT NOT NULL DEFAULT 'osrm', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (project_id, from_stop_id, to_stop_id));" "ตาราง TripLegs"

echo
echo "▶ Mapcode + เวลาเปิด-ปิด"
step "ALTER TABLE TripStops ADD COLUMN mapcode TEXT;"     "TripStops.mapcode"
step "ALTER TABLE TripStops ADD COLUMN open_time TEXT;"   "TripStops.open_time"
step "ALTER TABLE TripStops ADD COLUMN close_time TEXT;"  "TripStops.close_time"
step "ALTER TABLE TripStops ADD COLUMN closed_days TEXT;" "TripStops.closed_days"

echo
echo "▶ ผู้ร่วมทริปเข้าใช้งานด้วยรหัสของตัวเอง"
step "ALTER TABLE TripMembers ADD COLUMN passcode_hash TEXT;" "TripMembers.passcode_hash"
step "CREATE TABLE IF NOT EXISTS TripMemberSessions (token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL, member_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL);" "ตาราง TripMemberSessions"
step "CREATE INDEX IF NOT EXISTS idx_tms_member ON TripMemberSessions(member_id);" "ดัชนี idx_tms_member"

echo
echo "▶ เปลี่ยนแผนโดยไม่ลบประวัติ + ชื่อแผนประจำวัน"
step "ALTER TABLE TripStops ADD COLUMN visit_status TEXT NOT NULL DEFAULT 'PLANNED';" "TripStops.visit_status"
step "ALTER TABLE TripStops ADD COLUMN skipped_reason TEXT;"  "TripStops.skipped_reason"
step "ALTER TABLE TripStops ADD COLUMN highlight_text TEXT;"  "TripStops.highlight_text"
step "CREATE TABLE IF NOT EXISTS TripDayPlans (project_id TEXT NOT NULL, plan_date TEXT NOT NULL, title TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (project_id, plan_date));" "ตาราง TripDayPlans"

echo
echo "▶ สีประจำกระเป๋าเงิน (ผู้ใช้เลือกเองได้)"
step "ALTER TABLE TripWallets ADD COLUMN color_hue INTEGER;" "TripWallets.color_hue"

echo
echo "▶ ลากสลับลำดับบิลได้"
step "ALTER TABLE TripExpenses ADD COLUMN sort_order INTEGER;" "TripExpenses.sort_order"
step "ALTER TABLE TripWalletFundings ADD COLUMN sort_order INTEGER;" "TripWalletFundings.sort_order"

echo
echo "▶ รูปประจำตัวสมาชิก"
step "ALTER TABLE TripMembers ADD COLUMN avatar_url TEXT;" "TripMembers.avatar_url"

echo
echo "▶ ผู้ดูแลรายคน (จดกระเป๋า/บิลแทนกันได้)"
step "ALTER TABLE TripMembers ADD COLUMN managed_by TEXT;" "TripMembers.managed_by"

echo
echo "▶ กระเป๋า: บัญชีเงินฝากต้นทาง + ชนิดกระเป๋า"
step "ALTER TABLE TripWallets ADD COLUMN account_id TEXT;" "TripWallets.account_id"
step "ALTER TABLE TripWallets ADD COLUMN kind TEXT NOT NULL DEFAULT 'CASH';" "TripWallets.kind"
step "ALTER TABLE TripClosureLines ADD COLUMN settled_thb REAL;" "TripClosureLines.settled_thb"
step "ALTER TABLE TripExpenses ADD COLUMN settled_thb REAL;" "TripExpenses.settled_thb"

echo
echo "▶ ประเภทของจุดแวะ + การจอง (North 2026-09-07 / 2026-09-15)"
step "ALTER TABLE TripStops ADD COLUMN stop_tag TEXT;" "TripStops.stop_tag"
step "CREATE TABLE IF NOT EXISTS TripBookings (booking_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, stop_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'HOTEL', status TEXT NOT NULL DEFAULT 'CONFIRMED', vendor TEXT, ref_no TEXT, check_in TEXT, check_out TEXT, depart_from TEXT, arrive_to TEXT, arrive_time TEXT, room_desc TEXT, view_desc TEXT, size_sqm REAL, travelers TEXT, adults INTEGER, children INTEGER, child_ages TEXT, inc_breakfast INTEGER, inc_lunch INTEGER, inc_dinner INTEGER, has_parking INTEGER, has_laundry INTEGER, pay_status TEXT NOT NULL DEFAULT 'UNPAID', pay_date TEXT, pay_account_id TEXT, pay_method TEXT, cancel_deadline TEXT, cancel_policy TEXT, linked_transaction_id TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME);" "ตาราง TripBookings"
step "CREATE INDEX IF NOT EXISTS idx_tripbookings_project ON TripBookings(project_id);" "ดัชนี idx_tripbookings_project"

echo
echo "▶ ตรวจผลรวม"
echo "  ตารางที่ต้องมี (ควรได้ 4 ชื่อ):"
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('TripLegs','TripMemberSessions','TripDayPlans','TripBookings');" 2>&1 \
  | grep -o '"name": "[A-Za-z]*"' | sed 's/"name": /    ✓ /;s/"//g'

echo "  คอลัมน์ใน TripStops (ควรได้ 9 ชื่อ):"
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM pragma_table_info('TripStops') WHERE name IN ('planned_cost','planned_currency','mapcode','open_time','close_time','closed_days','visit_status','skipped_reason','highlight_text');" 2>&1 \
  | grep -o '"name": "[a-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'

echo "  คอลัมน์อื่น (ควรได้ 5 ชื่อ: stop_id, passcode_hash, color_hue, sort_order ×2):"
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM pragma_table_info('TripExpenses') WHERE name='stop_id';" 2>&1 \
  | grep -o '"name": "[a-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM pragma_table_info('TripMembers') WHERE name IN ('passcode_hash','avatar_url','managed_by');" 2>&1 \
  | grep -o '"name": "[a-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM pragma_table_info('TripWallets') WHERE name IN ('color_hue','account_id','kind');" 2>&1 \
  | grep -o '"name": "[a-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM pragma_table_info('TripExpenses') WHERE name='sort_order';" 2>&1 \
  | grep -o '"name": "[a-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'
npx wrangler d1 execute "$DB" --remote --command \
  "SELECT name FROM pragma_table_info('TripWalletFundings') WHERE name='sort_order';" 2>&1 \
  | grep -o '"name": "[a-z_]*"' | sed 's/"name": /    ✓ /;s/"//g'

echo
echo "▶ ครบแล้ว deploy ต่อได้เลย:"
echo "    npx wrangler deploy"
echo "    npx wrangler pages deploy frontend --project-name record-revenue-web"
