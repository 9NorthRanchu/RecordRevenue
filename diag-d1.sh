#!/bin/bash
# ตรวจว่าคำสั่งไหนอ่านฐานข้อมูล D1 มากที่สุด (ต้นเหตุ rows_read เกินโควตา)
# อ่านจากสถิติของ Cloudflare — ไม่แตะข้อมูล ใช้ได้แม้ D1 จะเกินโควตาวันนี้แล้ว
#
# ใช้: bash diag-d1.sh        (24 ชม.ล่าสุด)
#      bash diag-d1.sh 7d     (7 วันล่าสุด)
set -u
cd "$(dirname "$0")/backend" 2>/dev/null || cd "$(dirname "$0")" || exit 1
P="${1:-1d}"
case "$P" in 1d|7d|31d) ;; *) echo "ใช้ได้: 1d 7d 31d"; exit 1;; esac
echo "⏳ กำลังดึงสถิติ $P ..."
npx wrangler d1 insights record-revenue-db --timePeriod="$P" --sort-by=reads --sort-type=sum --limit=20 --json > /tmp/d1-insights.json 2>/tmp/d1-insights.err
if [ ! -s /tmp/d1-insights.json ]; then echo "❌ ดึงไม่ได้:"; tail -5 /tmp/d1-insights.err; exit 1; fi
python3 - <<'PY'
import json,re
raw=open('/tmp/d1-insights.json').read()
try: rows=json.loads(raw[raw.index('['):])
except Exception as e: print("อ่านผลไม่ได้:", raw[:300]); raise SystemExit
tot=sum(r.get('totalRowsRead',0) or 0 for r in rows) or 1
print(f"\nอ่านรวม (20 อันดับแรก): {tot:,} แถว\n")
print(f"{'#':>2} {'แถวที่อ่าน':>12} {'%':>5} {'ครั้ง':>7} {'แถว/ครั้ง':>10}  คำสั่ง")
for i,r in enumerate(rows,1):
    rd=r.get('totalRowsRead',0) or 0; n=r.get('numberOfTimesRun',0) or 0
    q=re.sub(r'\s+',' ',r.get('query',''))[:150]
    print(f"{i:>2} {rd:>12,} {rd*100/tot:>5.1f} {n:>7,} {(rd/n if n else 0):>10,.0f}  {q}")
PY
echo
echo "👉 ถ่ายภาพหน้าจอนี้ส่งกลับมาได้เลย"
