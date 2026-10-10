#!/bin/bash
# ตรวจหาสาเหตุที่ยอดบัญชีผิด (เช่น บัญชีเงินฝากติดลบ) — อ่านอย่างเดียว ไม่แก้ข้อมูล
#
# ใช้: bash diag-account.sh A04
#
# ดู 4 อย่าง:
#   1) รายการแยกตามที่มา (สลิป / statement / จดเอง) และสถานะ
#   2) ยอดสะสมรายเดือน — เดือนไหนที่ยอดเริ่มติดลบ
#   3) รายการที่เครื่องหมายขัดกัน (หัวเป็นเงินออก แต่บรรทัดย่อยเป็นรายรับ ฯลฯ) — ต้นเหตุยอดกลับด้านที่พบบ่อย
#   4) รายการก้อนใหญ่ที่สุด 15 รายการ — เผื่อมีรายการซ้ำหรือใส่ผิดบัญชี
set -u
cd "$(dirname "$0")" || exit 1
ACC="${1:-A04}"
case "$ACC" in *[!A-Za-z0-9_-]*) echo "รหัสบัญชีไม่ถูกต้อง"; exit 1;; esac
DB=record-revenue-db

q() {
  echo
  echo "▶ $1"
  npx wrangler d1 execute "$DB" --remote --json --command "$2" 2>/dev/null | python3 -c '
import json,sys
try:
    data=json.load(sys.stdin); rows=data[0]["results"] if isinstance(data,list) else data["results"]
except Exception as e:
    print("   (อ่านผลไม่ได้ — ลองรันใหม่ หรือเช็ก npx wrangler login)"); sys.exit()
if not rows: print("   (ไม่มี)"); sys.exit()
cols=list(rows[0].keys())
def f(v,c):
    if isinstance(v,(int,float)) and not isinstance(v,bool) and c!="n":
        return ("(%s)" % format(-v,",.2f")) if v<0 else format(v,",.2f")
    return str(v if v is not None else "-")[:40]
w=[max(len(c),*(len(f(r[c],c)) for r in rows)) for c in cols]
print("   "+"  ".join(c.ljust(x) for c,x in zip(cols,w)))
for r in rows: print("   "+"  ".join(f(r[c],c).ljust(x) for c,x in zip(cols,w)))
'
}

echo "ตรวจบัญชี $ACC"
q "ชื่อบัญชี และยอดตอนนี้ (นับเฉพาะยืนยันแล้ว)" \
  "SELECT a.account_id, a.name, a.bank_name, IFNULL(a.account_type,'BANK') AS type, ROUND(SUM(CASE WHEN t.status='CONFIRMED' THEN t.total_amount END),2) AS balance, COUNT(t.transaction_id) AS n FROM Accounts a LEFT JOIN Transactions t ON t.account_id=a.account_id WHERE a.account_id='$ACC' GROUP BY a.account_id"
q "1) แยกตามที่มา / สถานะ" \
  "SELECT source, status, COUNT(*) AS n, ROUND(SUM(total_amount),2) AS total, MIN(date) AS first, MAX(date) AS last FROM Transactions WHERE account_id='$ACC' GROUP BY source, status ORDER BY source"
q "2) ยอดรายเดือน และยอดสะสม (ยืนยันแล้ว)" \
  "SELECT m, n, total, ROUND(SUM(total) OVER (ORDER BY m),2) AS running FROM (SELECT substr(date,1,7) AS m, COUNT(*) AS n, ROUND(SUM(total_amount),2) AS total FROM Transactions WHERE account_id='$ACC' AND status='CONFIRMED' GROUP BY m) ORDER BY m"
q "3) เครื่องหมายขัดกัน (หัว vs บรรทัดย่อย) — 40 รายการแรก" \
  "SELECT t.date, t.source, t.total_amount AS head, d.amount AS line, d.type, substr(IFNULL(d.note,t.statement_desc),1,30) AS note, t.transaction_id FROM Transactions t JOIN TransactionDetails d ON d.transaction_id=t.transaction_id WHERE t.account_id='$ACC' AND ((t.total_amount<0 AND d.amount>0) OR (t.total_amount>0 AND d.amount<0) OR (t.total_amount<0 AND d.type='INCOME') OR (t.total_amount>0 AND d.type='EXPENSE')) ORDER BY t.date LIMIT 40"
q "3b) จำนวนรายการเครื่องหมายขัดกันทั้งหมด" \
  "SELECT COUNT(DISTINCT t.transaction_id) AS n, ROUND(SUM(t.total_amount),2) AS sum_head FROM Transactions t JOIN TransactionDetails d ON d.transaction_id=t.transaction_id WHERE t.account_id='$ACC' AND ((t.total_amount<0 AND d.amount>0) OR (t.total_amount>0 AND d.amount<0) OR (t.total_amount<0 AND d.type='INCOME') OR (t.total_amount>0 AND d.type='EXPENSE'))"
q "4) รายการก้อนใหญ่สุด 15 รายการ" \
  "SELECT date, source, status, total_amount, substr(statement_desc,1,35) AS desc, transaction_id FROM Transactions WHERE account_id='$ACC' ORDER BY ABS(total_amount) DESC LIMIT 15"
echo
echo "เสร็จ — แคปหน้าจอผลทั้งหมดส่งให้ Claude ได้เลย"
