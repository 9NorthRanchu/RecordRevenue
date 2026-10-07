#!/usr/bin/env python3
"""ตรวจสมบูรณ์ 10 ข้อ จากไฟล์ export หลังนำเข้า
ใช้: python3 verify_import.py backup-after-import.sql
(สร้างไฟล์ด้วย: npx wrangler d1 export record-revenue-db --remote --output import-expense2/backup-after-import.sql)"""
import sys, io, json, os, sqlite3
HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'backup-after-import.sql')
exp = json.load(io.open(os.path.join(HERE, 'import-expected.json'), encoding='utf-8'))
db = sqlite3.connect(':memory:'); db.executescript(io.open(src, encoding='utf-8').read())
Q = lambda s: db.execute(s).fetchall()
ok_all = True
def check(no, title, got, want, cmp=lambda g, w: g == w):
    global ok_all
    good = cmp(got, want); ok_all &= good
    print(f"{'✅' if good else '❌'} {no:>2}. {title}\n      ได้ {got}  · ต้องได้ {want}")
check(1, 'จำนวนรายการจากไฟล์', Q("SELECT COUNT(*) FROM Transactions WHERE source='PDF_IMPORT' AND length(ref_code)=13")[0][0], exp['transactions'])
check(2, 'จำนวนรายการย่อยของรายการเหล่านั้น', Q("SELECT COUNT(*) FROM TransactionDetails d JOIN Transactions t ON t.transaction_id=d.transaction_id WHERE t.source='PDF_IMPORT' AND length(t.ref_code)=13")[0][0], exp['details'])
bad = []
for acc, v in exp['per_account'].items():
    n, s = Q(f"SELECT COUNT(*), ROUND(COALESCE(SUM(total_amount),0),2) FROM Transactions WHERE account_id='{acc}' AND source='PDF_IMPORT'")[0]
    if n != v['n'] or abs(s - v['sum']) > 0.02: bad.append(f'{acc}: ได้ {n}/{s} ต้อง {v["n"]}/{v["sum"]}')
check(3, 'ยอดสุทธิต่อบัญชี ตรงทั้ง %d บัญชี' % len(exp['per_account']), bad or 'ตรงทุกบัญชี', 'ตรงทุกบัญชี')
check(4, 'ยอดหัว = Σรายการย่อย − fee − Σwht (จำนวนที่ไม่ตรง)', Q("SELECT COUNT(*) FROM (SELECT t.transaction_id FROM Transactions t JOIN TransactionDetails d ON d.transaction_id=t.transaction_id GROUP BY t.transaction_id HAVING ABS(t.total_amount-(SUM(d.amount)-SUM(d.fee)-SUM(d.wht)))>0.02)")[0][0], 0)
check(5, "รายการบัญชี 'unknown'", Q("SELECT COUNT(*) FROM Transactions WHERE account_id='unknown' OR account_id NOT IN (SELECT account_id FROM Accounts)")[0][0], 0)
orph = Q("SELECT (SELECT COUNT(*) FROM TransactionDetails d LEFT JOIN Categories c ON c.category_id=d.category_id WHERE c.category_id IS NULL),(SELECT COUNT(*) FROM TransactionDetails d LEFT JOIN Entities e ON e.entity_id=d.entity_id WHERE d.entity_id IS NOT NULL AND e.entity_id IS NULL),(SELECT COUNT(*) FROM TransactionDetails d LEFT JOIN Contacts c ON c.contact_id=d.contact_id WHERE d.contact_id IS NOT NULL AND c.contact_id IS NULL)")[0]
check(6, 'หมวด/เจ้าของ/ลูกค้า กำพร้า (หมวด, เจ้าของ, ลูกค้า)', list(orph), [0, 0, 0])
check(7, "รายการย่อยที่ไม่มี type", Q("SELECT COUNT(*) FROM TransactionDetails WHERE type IS NULL OR type='OTHER'")[0][0], 0)
got = {str(y): s for y, s in Q("SELECT substr(t.date,1,4), ROUND(-SUM(d.amount),2) FROM TransactionDetails d JOIN Transactions t ON t.transaction_id=d.transaction_id WHERE d.head_owner LIKE 'T%' OR d.head_owner LIKE 'G%' GROUP BY 1")}
want = {str(k): v for k, v in exp['expense_T_by_year'].items()}
check(8, 'ค่าใช้จ่าย T+G ต่อปี', got, want, lambda g, w: all(abs(g.get(k, 0) - v) < 0.02 for k, v in w.items()))
check(9, 'บัญชีพัก Z01 สุทธิ', Q("SELECT ROUND(COALESCE(SUM(amount),0),2) FROM TransactionDetails WHERE category_id='Z01'")[0][0], 0.0, lambda g, w: abs(g - w) < 0.02)
vis, tot = Q("SELECT (SELECT COUNT(*) FROM Accounts a JOIN UserPermissions up ON a.entity_id=up.entity_id WHERE up.user_id='9North'),(SELECT COUNT(*) FROM Accounts)")[0]
check(10, 'บัญชีที่ 9North มองเห็นได้ / ทั้งหมด', f'{vis}/{tot}', f'{tot}/{tot}')
print('\n' + ('🎉 ผ่านครบ 10 ข้อ — นำเข้าสมบูรณ์' if ok_all else '⚠️ มีข้อไม่ผ่าน — อย่าเพิ่งใช้งาน ส่งผลนี้ให้ระบบดู'))
