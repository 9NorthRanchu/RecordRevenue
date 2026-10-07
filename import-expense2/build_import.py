#!/usr/bin/env python3
"""สร้างไฟล์ SQL นำเข้า Expense2.xlsx เข้าสมุดจดค่าใช้จ่าย (RecordRevenue · D1)

กติกาการจับคู่ (North ยืนยัน 2026-09-07):
  A/C  = บัญชี (Statement / บัตรเครดิต) · เมื่อเป็น Head Owner = บัญชีคู่โอน → หมวด Bank_Transfer
  W    = ลูกค้า (Contacts)
  S    = บริษัทเจ้าของรายการ (Entity) · หมวด = Group Detail
  X    = งานอดิเรก/กิจการเล็ก (Entity เหมือน S) · หมวด = Group Detail · ทิศทางเงินบอกรับ/จ่าย
  T G  = ค่าใช้จ่าย → หมวดใหม่ใต้ Expense (category_id = รหัส)
  R    = รายได้ → หมวดใหม่ใต้ Revenue
  B    = สินทรัพย์ → หมวดใหม่ใต้ Investment
  L    = หนี้สิน → หมวดใหม่ใต้ Liability
  Z01/Z03 = บัญชีพัก (ต้องเป็น 0) → หมวดใต้ Asset · Z02 = Lost → Expense
  Group Detail = BF → หมวด "ยอดยกมา" ใต้ Asset (เหนือกว่า Head Owner)

เครื่องหมาย: total_amount = Statement Amount · amount = −Amount (เงินเข้า = บวก)
"""
import re, io, os, json, math, collections, datetime
import pandas as pd, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = '/root/.claude/uploads/8e88480b-42a3-5440-a8db-6d8174a5d9a5/a7451c80-Expense2.xlsx'
LIVE = os.path.join(HERE, 'backup-before-import.sql')
OUT  = os.path.join(HERE, 'sql'); os.makedirs(OUT, exist_ok=True)
NOW  = '2026-09-07 17:00:00'
USER = '9North'
FAM  = 'Fam_Default'
CAP  = {'Asset':'Fam_Default_Type_Asset','Liability':'Fam_Default_Type_Liability','Investment':'Fam_Default_Type_Investment',
        'Revenue':'Fam_Default_Type_Revenue','Expense':'Fam_Default_Type_Expense'}
CHUNK = 2500   # statements ต่อไฟล์

def q(v):
    """SQL literal"""
    if v is None: return 'NULL'
    if isinstance(v, float):
        if math.isnan(v): return 'NULL'
        return repr(round(v, 2))
    if isinstance(v, (int, np.integer)): return str(int(v))
    return "'" + str(v).replace("'", "''") + "'"

# ── ของจริงตอนนี้ (export ก่อนนำเข้า) ─────────────────────────────────
live = io.open(LIVE, encoding='utf-8').read()
def live_rows(table):
    out = []
    for m in re.finditer(rf'^INSERT INTO "{table}" \(([^)]*)\) VALUES\((.*)\);$', live, re.M):
        cols = [c.strip('"') for c in m.group(1).split(',')]
        toks = re.findall(r"'((?:[^']|'')*)'|(NULL)|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)", m.group(2))
        vals = [a.replace("''","'") if a != '' else (None if b else float(c)) for a,b,c in toks]
        out.append(dict(zip(cols, vals)))
    return out
live_cat = {r['category_id']: r for r in live_rows('Categories')}
live_ent = {r['entity_id']: r for r in live_rows('Entities')}
live_con = {r['contact_id']: r for r in live_rows('Contacts')}
live_acc = {r['account_id']: r for r in live_rows('Accounts')}
assert len(live_rows('Transactions')) == 0, 'ฐานยังมี Transactions อยู่ — สคริปต์นี้เขียนสำหรับฐานที่ล้างแล้ว'

# ── อ่านไฟล์ ──────────────────────────────────────────────────────────
df = pd.read_excel(SRC, sheet_name='Data')
df['prefix'] = df['RefCode'].str[:13]
df['idx'] = df['RefCode'].str[13:]
hdr = df[df['idx'] == '01'].set_index('prefix')
for col in ['Statement', 'Statement Amount', 'Fee', 'Date', 'Customer']:
    df[col + '_h'] = df['prefix'].map(hdr[col])
# Customer อยู่บนแถวไหนก็ได้ — ใช้ของแถวนั้นก่อน ไม่มีค่อยใช้ของหัว
df['Customer_x'] = df['Customer'].where(df['Customer'].notna(), df['Customer_h'])

clean = lambda s: re.sub(r'\s+', ' ', str(s)).strip()
code_of = lambda s: (re.match(r'^\[(\w+)\]', clean(s)) or [None, None])[1]

# บัญชี: A24 Puii Bank → A25 · XXX → Z00
def account_id(stmt):
    if not isinstance(stmt, str) or not stmt.strip(): return 'Z00'
    name = clean(stmt); code = code_of(name)
    if code == 'A24' and 'Puii' in name: return 'A25'
    return code
df['account_id'] = df['Statement_h'].map(account_id)

def head_code(ho):
    name = clean(ho); code = code_of(name)
    if code == 'A22' and 'Planet' in name: return 'A23'   # รหัสเคยถูกเลื่อน
    if code == 'A24' and 'Puii' in name: return 'A25'
    return code
df['ho_code'] = df['Head Owner'].map(head_code)
df['ho_name'] = df['Head Owner'].map(lambda s: re.sub(r'^\[\w+\]\s*', '', clean(s)))
df['ho_letter'] = df['ho_code'].str[0]
df['cust_code'] = df['Customer_x'].map(lambda s: code_of(s) if isinstance(s, str) else None)

# ── master ที่ต้องมี ─────────────────────────────────────────────────
GD_ID = {'Expense':'Expense','Bank Transfer':'Bank_Transfer','AP (AR) Customer':'AP__AR__Customer','Account':'Account',
         'Audit':'Audit','Lotto':'Lotto','AP (AR)':'AP__AR','Service':'Service','Interest Income':'Interest_Income',
         'Other Revenue':'Other_Revenue',"Lotto P'Na":'Lotto_P_Na','Forex':'Forex','Salary':'Salary',"NA'Tew Com":'NA_Tew_Com',
         'BF':'BF','Allianz Agent':'Allianz_Agent','Net Transection':'Net_Transection','Newspaper':'Newspaper','Sim Tel':'Sim_Tel'}
# หมวดจาก Group Detail: (ชื่อ, Caption, default_type)
GD_CAT = {'Expense':('Expense','Expense','EXPENSE'), 'Bank_Transfer':('Bank Transfer','Asset','TRANSFER'),
          'AP__AR__Customer':('AP (AR) Customer','Asset',None), 'AP__AR':('AP (AR)','Asset',None),
          'Account':('Account','Revenue','INCOME'), 'Audit':('Audit','Revenue','INCOME'), 'Service':('Service','Revenue','INCOME'),
          'Interest_Income':('Interest Income','Revenue','INCOME'), 'Other_Revenue':('Other Revenue','Revenue','INCOME'),
          'Allianz_Agent':('Allianz Agent','Revenue','INCOME'), 'Salary':('Salary (เงินเดือนรับ)','Revenue','INCOME'),
          'Forex':('Forex','Investment','TRANSFER'), 'Lotto':('Lotto','Expense',None), 'Lotto_P_Na':("Lotto P'Na",'Expense',None),
          'NA_Tew_Com':("NA'Tew Com",'Expense','EXPENSE'), 'Net_Transection':('Net Transection','Expense','EXPENSE'),
          'Newspaper':('Newspaper','Expense','EXPENSE'), 'Sim_Tel':('Sim Tel','Expense','EXPENSE'),
          'BF':('ยอดยกมา (BF)','Asset','TRANSFER')}
LETTER_CAP = {'T':('Expense','EXPENSE'), 'G':('Expense','EXPENSE'), 'R':('Revenue','INCOME'),
              'B':('Investment','TRANSFER'), 'L':('Liability','TRANSFER')}
Z_CAT = {'Z01':('บัญชีพัก (Z01) ต้องเป็น 0','Asset','TRANSFER'), 'Z02':('Lost — เงินขาดหายไม่ทราบสาเหตุ','Expense','EXPENSE'),
         'Z03':('บัญชีพัก (Z03) ต้องเป็น 0','Asset','TRANSFER')}

# หมวดใหม่จาก Head Owner (T G R B L Z)
ho_names = df.groupby('ho_code')['ho_name'].agg(lambda s: s.value_counts().index[0])
new_cats = {}   # id → (name, caption, default_type)
for code, name in ho_names.items():
    L = code[0]
    if L in LETTER_CAP: new_cats[code] = (f'[{code}] {name}', *LETTER_CAP[L])
for code, (name, cap, typ) in Z_CAT.items(): new_cats[code] = (name, cap, typ)

# Entities ใหม่: North ส่วนตัว + X
ENT_NORTH = 'Ent_North'
new_ents = {ENT_NORTH: ('North (ส่วนตัว)', 0)}
for code, name in ho_names.items():
    if code[0] == 'X': new_ents[f'Ent_{code}'] = (f'[{code}] {name}', 0)

# Accounts ทั้งหมดจากไฟล์ (+ A25, Z00)
acc_names = df[df['idx']=='01'].groupby('account_id')['Statement_h'].agg(lambda s: clean(s.dropna().iloc[0]) if s.notna().any() else '')
BANK = {'A01':'Cash','A02':'Kbank','A03':'BBL','A04':'Kbank','A05':'Kbank','A06':'Kbank','A07':'Kbank','A08':'BAY','A09':'SCB','A10':'SCB',
        'A11':'GHB','A12':'KKP','A13':'KKP','A14':'BBL','A15':'KTB','A16':'TrueMoney','A17':'WePay','A18':'AirPay','A19':'Lazada',
        'A20':'GWallet','A21':'UTrip','A22':'LinePay','A23':'SCB','A24':'KKP','A25':'Bank','C01':'Kbank','C02':'Kbank','C03':'KTB',
        'C04':'BAY','C05':'BAY','C06':'SCB','C07':'Kbank','Z00':'None'}
CASH_LIKE = {'A01','A16','A17','A18','A19','A20','A21','A22','A24'}
def acc_type(code):
    if code.startswith('C'): return 'CREDIT'
    if code in CASH_LIKE or code == 'Z00': return 'CASH'
    return 'BANK'
def acc_entity(code):
    return 'Ent_Co_S06' if code == 'A25' else ENT_NORTH
accounts = {}
for code, name in acc_names.items():
    if code == 'Z00': name = '[Z00] รายการปรับปรุง (ไม่ผ่านธนาคาร)'
    if code == 'A25': name = '[A25] Puii Bank'
    accounts[code] = name
accounts.setdefault('Z00', '[Z00] รายการปรับปรุง (ไม่ผ่านธนาคาร)')
# บัญชีที่ปรากฏเป็น Head Owner แต่ไม่เคยเป็น Statement (เช่น A22 Line Pay) ต้องมีด้วย
for code in df.loc[df['ho_letter'].isin(['A','C']), 'ho_code'].unique():
    if code not in accounts:
        nm = df.loc[df['ho_code']==code, 'ho_name'].iloc[0]
        accounts[code] = f'[{code}] {nm}'

# ── ตรวจ master ที่อ้างถึง ───────────────────────────────────────────
missing_contacts = sorted(set(df['cust_code'].dropna()) - set(live_con))
assert not missing_contacts, f'ลูกค้าไม่มีในระบบ: {missing_contacts}'
missing_ents = sorted(f'Ent_Co_{c}' for c in df.loc[df['ho_letter']=='S','ho_code'].unique() if f'Ent_Co_{c}' not in live_ent)
assert not missing_ents, f'Entity ไม่มีในระบบ: {missing_ents}'

# ── จับคู่รายการย่อย ────────────────────────────────────────────────
def classify(r):
    L, code, gd = r['ho_letter'], r['ho_code'], r['Group Detail']
    amt = -float(r['Amount'])                  # เงินเข้า = บวก
    if gd == 'BF':
        return 'BF', ENT_NORTH, 'TRANSFER'
    if L in ('A', 'C'):
        return 'Bank_Transfer', ENT_NORTH, 'TRANSFER'
    if L == 'S':
        cid = GD_ID[gd]; typ = GD_CAT[cid][2]
        if typ is None: typ = 'CREDIT_AR' if amt >= 0 else 'DEBIT_AR'
        return cid, f'Ent_Co_{code}', typ
    if L == 'X':
        cid = GD_ID[gd]
        return cid, f'Ent_{code}', ('INCOME' if amt >= 0 else 'EXPENSE')
    if L == 'Z':
        return code, ENT_NORTH, Z_CAT[code][2]
    if L in LETTER_CAP:
        cid = code; typ = LETTER_CAP[L][1]
        if L in ('B', 'L'): typ = 'TRANSFER'
        return cid, ENT_NORTH, typ
    raise ValueError(f'ไม่รู้จัก Head Owner {r["Head Owner"]}')

cls = df.apply(classify, axis=1, result_type='expand'); cls.columns = ['category_id','entity_id','type']
df = pd.concat([df, cls], axis=1)

def note_text(v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return None
    if isinstance(v, (datetime.datetime, pd.Timestamp)): return f'{v.day}/{v.month}/{v.year}'
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return clean(v) or None

# ── เขียน SQL ─────────────────────────────────────────────────────────
alter = ["ALTER TABLE TransactionDetails ADD COLUMN head_owner TEXT;",
         "ALTER TABLE TransactionDetails ADD COLUMN group_detail TEXT;"]
io.open(os.path.join(OUT, '00-alter.sql'), 'w', encoding='utf-8').write(
    "-- เพิ่มคอลัมน์เก็บรหัสดิบจากไฟล์ Expense2 (รันครั้งเดียว · ถ้าขึ้น duplicate column แปลว่ารันไปแล้ว ข้ามได้)\n" + '\n'.join(alter) + '\n')

m = ["-- master สำหรับนำเข้า Expense2 · สร้าง " + NOW, "-- ปลอดภัยที่จะรันซ้ำ (INSERT OR IGNORE / UPDATE)", ""]
m.append("-- Entities ใหม่")
for eid, (name, is_co) in new_ents.items():
    m.append(f"INSERT OR IGNORE INTO Entities (entity_id, family_id, name, is_company, created_at) VALUES ({q(eid)},{q(FAM)},{q(name)},{is_co},{q(NOW)});")
    m.append(f"INSERT OR IGNORE INTO UserPermissions (user_id, entity_id) VALUES ({q(USER)},{q(eid)});")
m.append("")
m.append("-- Accounts ทั้งหมดจากไฟล์ (บัญชีที่มีอยู่แล้วจะไม่ถูกทับ)")
for code in sorted(accounts):
    m.append(f"INSERT OR IGNORE INTO Accounts (account_id, entity_id, name, bank_name, balance, created_at, account_type) VALUES ({q(code)},{q(acc_entity(code))},{q(accounts[code])},{q(BANK.get(code,'Bank'))},0,{q(NOW)},{q(acc_type(code))});")
m.append("")
m.append("-- Categories จาก Group Detail: ปรับ Caption + default_type ของที่มีอยู่ · เพิ่มที่ยังไม่มี")
for cid, (name, cap, typ) in GD_CAT.items():
    if cid in live_cat:
        m.append(f"UPDATE Categories SET caption_id={q(CAP[cap])}, default_type={q(typ)} WHERE category_id={q(cid)};")
    else:
        m.append(f"INSERT OR IGNORE INTO Categories (category_id, family_id, name, created_at, default_type, caption_id) VALUES ({q(cid)},{q(FAM)},{q(name)},{q(NOW)},{q(typ)},{q(CAP[cap])});")
m.append("")
m.append("-- Categories ใหม่จาก Head Owner (T G R B L Z)")
for cid, (name, cap, typ) in sorted(new_cats.items()):
    m.append(f"INSERT OR IGNORE INTO Categories (category_id, family_id, name, created_at, default_type, caption_id) VALUES ({q(cid)},{q(FAM)},{q(name)},{q(NOW)},{q(typ)},{q(CAP[cap])});")
m.append("")
m.append("-- ตั้ง default_type ให้หมวดเดิมที่ไม่ได้อยู่ในไฟล์ ให้แดชบอร์ดนับได้")
m.append("UPDATE Categories SET default_type='EXPENSE' WHERE default_type IS NULL AND caption_id='Fam_Default_Type_Expense';")
m.append("UPDATE Categories SET default_type='INCOME'  WHERE default_type IS NULL AND caption_id='Fam_Default_Type_Revenue';")
io.open(os.path.join(OUT, '01-master.sql'), 'w', encoding='utf-8').write('\n'.join(m) + '\n')

# ── ข้อมูล ─────────────────────────────────────────────────────────────
stmts = []
tx_count = 0
for prefix, g in df.groupby('prefix', sort=True):
    h = g[g['idx'] == '01'].iloc[0]
    date = h['Date'].strftime('%Y-%m-%d')
    total = float(h['Statement Amount']) if not math.isnan(float(h['Statement Amount'])) else 0.0
    acc = h['account_id']
    first_note = note_text(h['Detail'])
    stmts.append("INSERT OR IGNORE INTO Transactions (transaction_id, account_id, ref_code, date, total_amount, status, source, created_by_user_id, created_at, statement_desc) "
                 f"VALUES ({q('TX-'+prefix)},{q(acc)},{q(prefix)},{q(date)},{q(total)},'CONFIRMED','PDF_IMPORT',{q(USER)},{q(NOW)},{q(first_note)});")
    tx_count += 1
    for i, (_, r) in enumerate(g.sort_values('idx').iterrows()):
        fee = float(h['Fee']) if (i == 0 and not math.isnan(float(h['Fee']))) else 0.0
        wht = float(r['WHT']) if not math.isnan(float(r['WHT'])) else 0.0
        stmts.append("INSERT OR IGNORE INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type, head_owner, group_detail) "
                     f"VALUES ({q('DT-'+r['RefCode'])},{q('TX-'+prefix)},{q(-float(r['Amount']))},{q(fee)},{q(wht)},{q(r['category_id'])},{q(r['entity_id'])},{q(r['cust_code'])},NULL,{q(note_text(r['Detail']))},{q(r['type'])},{q(r['ho_code'])},{q(r['Group Detail'])});")

files = []
for n, i in enumerate(range(0, len(stmts), CHUNK), start=1):
    name = f'10-data-{n:02d}.sql'
    io.open(os.path.join(OUT, name), 'w', encoding='utf-8').write(f"-- Expense2 data chunk {n}\n" + '\n'.join(stmts[i:i+CHUNK]) + '\n')
    files.append(name)

# ── สรุปสำหรับตรวจ ──────────────────────────────────────────────────
summary = {
    'transactions': tx_count, 'details': len(df), 'chunks': files,
    'new_entities': new_ents, 'new_categories': {k: v for k, v in sorted(new_cats.items())},
    'accounts': dict(sorted(accounts.items())),
    'per_account': {k: {'n': int(v['n']), 'sum': round(float(v['s']), 2)} for k, v in
                    df[df['idx']=='01'].groupby('account_id').agg(n=('prefix','size'), s=('Statement Amount','sum')).iterrows()},
    'per_category_type': {f'{k[0]}|{k[1]}': int(v) for k, v in df.groupby(['category_id','type']).size().items()},
    'expense_T_by_year': {},
}
df['year'] = df['Date_h'].dt.year
t = df[df['ho_letter'].isin(['T','G'])]
summary['expense_T_by_year'] = {int(y): round(float(-s), 2) for y, s in (-t.groupby('year')['Amount'].sum()).items()}
json.dump(summary, io.open(os.path.join(HERE, 'import-expected.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('transactions', tx_count, 'details', len(df), 'statements', len(stmts), 'chunks', len(files))
print('new categories', len(new_cats), '| new entities', list(new_ents), '| accounts', len(accounts))
print('type counts', df['type'].value_counts().to_dict())
