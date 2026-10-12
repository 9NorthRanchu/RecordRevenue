// ทดสอบยอดยกมา (ชุดตามเจ้าของ · บัญชีพัก Dr/Cr) (2026-10-12) — รัน: node backend/test/opening.test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
/* src ไม่มี "type":"module" → คัดลอกไปโฟลเดอร์ชั่วคราวที่ประกาศเป็น module แล้วค่อย import */
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-sec-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
const worker = (await import(pathToFileURL(path.join(TMP, 'index.js')).href)).default;
console.error = () => {};   // ซ่อน log จาก dbErrorResponse ระหว่างทดสอบ
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, line_user_id TEXT UNIQUE, role TEXT, password TEXT, created_at DATETIME);
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, is_company INTEGER);
CREATE TABLE UserPermissions (user_id TEXT, entity_id TEXT, PRIMARY KEY (user_id, entity_id));
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, name TEXT NOT NULL, bank_name TEXT, account_number TEXT,
  balance REAL DEFAULT 0, created_at DATETIME, pdf_password TEXT, account_type TEXT DEFAULT 'BANK', credit_limit REAL DEFAULT 0, statement_day INTEGER, due_day INTEGER);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, caption_id TEXT, default_type TEXT);
CREATE TABLE Transactions (transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, ref_code TEXT, date TEXT NOT NULL, total_amount REAL NOT NULL,
  status TEXT CHECK(status IN ('PENDING_REVIEW', 'CONFIRMED')) DEFAULT 'PENDING_REVIEW',
  source TEXT CHECK(source IN ('LINE_SLIP', 'LINE_TEXT', 'PDF_IMPORT', 'WEB_GRID')) NOT NULL,
  slip_image_url TEXT, created_by_user_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, time TEXT, statement_desc TEXT);
CREATE TABLE TransactionDetails (detail_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, amount REAL NOT NULL, fee REAL DEFAULT 0, wht REAL DEFAULT 0,
  category_id TEXT NOT NULL, entity_id TEXT, contact_id TEXT, project_id TEXT, note TEXT, type TEXT, head_owner TEXT, group_detail TEXT);
CREATE TABLE LedgerDocs (doc_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, uploaded_by TEXT, source TEXT NOT NULL, file_key TEXT, file_hash TEXT, mime TEXT, file_name TEXT, doc_type TEXT, status TEXT NOT NULL DEFAULT 'NEW', extracted TEXT, suggestion TEXT, transaction_id TEXT, error TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME);
CREATE TABLE LedgerDocLinks (doc_id TEXT NOT NULL, transaction_id TEXT NOT NULL, role TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (doc_id, transaction_id));
CREATE TABLE LedgerRules (rule_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kind TEXT NOT NULL, rkey TEXT NOT NULL, value TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 1, updated_at DATETIME, UNIQUE (family_id, kind, rkey));
CREATE TABLE LedgerStatements (stmt_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, account_id TEXT NOT NULL, period_from TEXT, period_to TEXT, opening_balance REAL, closing_balance REAL, line_count INTEGER DEFAULT 0, lines TEXT, file_name TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME);
CREATE TABLE Contacts (contact_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, contact_type TEXT, created_at DATETIME, entity_id TEXT, members TEXT);
CREATE TABLE Captions (type_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, behavior TEXT, sub_behavior TEXT);
CREATE TABLE Settlements (settlement_id TEXT PRIMARY KEY, parent_detail_id TEXT, child_detail_id TEXT, settled_amount REAL);

INSERT INTO Users VALUES ('9North','Fam_Default','9North',NULL,'Uline-north','admin',NULL,NULL), ('Puii','Fam_Default','Puii',NULL,'Uline-puii','member',NULL,NULL),
  ('Other','Fam_Other','Other',NULL,NULL,'admin',NULL,NULL);
INSERT INTO UserPermissions VALUES ('9North','Ent_North'),('9North','Ent_Co_S01'),('9North','Ent_Co_S05'),('Other','Ent_Other');
INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number) VALUES
  ('A01','Ent_North','[A01] Pocket','Cash',NULL), ('A02','Ent_North','[A02] BK KBANK','Kbank',NULL), ('A06','Ent_North','[A06] Kbank','Kbank',NULL),
  ('A09','Ent_North','[A09] SCB','SCB',NULL), ('A10','Ent_North','[A10] SCB Salary','SCB','987-6-54321-0'), ('C01','Ent_North','[C01] KBank Credit Card','Kbank',NULL), ('X99','Ent_Other','other fam','Kbank',NULL);
INSERT INTO Categories (category_id, name, default_type) VALUES ('Cat_Uncategorized','รอการระบุ','EXPENSE'),('T01','[T01] Food & Beverage','EXPENSE'),('T05','[T05] Other Expense','EXPENSE'),
  ('Bank_Transfer','Bank Transfer','TRANSFER'),('Account','Account','INCOME'),('Audit','Audit','INCOME'),('Service','Service','INCOME'),('AP__AR__Customer','AP (AR) Customer',NULL);
`);

const toD1 = sql => {
  const stmt = { sql, args: [] };
  const run = () => db.prepare(sql).run(...stmt.args.map(v => v === undefined ? null : v));
  return {
    bind(...args) { stmt.args = args; return this; },
    first: async () => db.prepare(sql).get(...stmt.args.map(v => v === undefined ? null : v)) || null,
    all: async () => ({ results: db.prepare(sql).all(...stmt.args.map(v => v === undefined ? null : v)) }),
    run: async () => run(),
    _run: run,
  };
};

db.exec(`CREATE TABLE Projects (project_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, members TEXT, status TEXT); CREATE TABLE Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);`);
db.exec(`INSERT INTO Captions VALUES ('C_A','Fam_Default','รายจ่าย','EXPENSE',NULL),('C_X','Fam_Other','ลับครอบครัวอื่น','EXPENSE',NULL);
UPDATE Categories SET family_id='Fam_Default', caption_id='C_A';
INSERT INTO Categories (category_id,family_id,name,caption_id) VALUES ('X_SECRET','Fam_Other','secret','C_X');
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES ('TX-OTHER','X99','2026-10-01',-100,'CONFIRMED','WEB_GRID','Other'),('TX-MINE','A01','2026-10-01',-50,'CONFIRMED','WEB_GRID','9North');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id) VALUES ('D-OTHER','TX-OTHER',-100,'X_SECRET'),('D-MINE','TX-MINE',-50,'T01');`);
const env = { DB: { prepare: toD1, batch: async ops => { db.exec('BEGIN'); try { ops.forEach(o => o._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
const call = async (path, { user, method = 'GET', body } = {}) => {
  const h = { 'Content-Type': 'application/json' }; if (user) h['Authorization'] = `Bearer tok-${user}`;
  const res = await worker.fetch(new Request('https://w.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, {});
  let j; try { j = await res.json(); } catch { j = null; } return { s: res.status, j };
};
/* session token จริงในฐานทดสอบ (เก็บ hash แบบเดียวกับ session.js) */
const hashTok = async t => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('base64url');
for (const u of ['9North', 'Other', 'Puii']) db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok(`tok-${u}`), u, '2099-01-01T00:00:00Z');
 const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0,200)); } };
let r;
db.exec(`CREATE TABLE IF NOT EXISTS CategoryBudgets (category_id TEXT, family_id TEXT, period_type TEXT, period TEXT, amount REAL);
CREATE TABLE IF NOT EXISTS PlannedExpenses (plan_id TEXT, family_id TEXT, title TEXT, amount REAL, due_date TEXT, status TEXT, category_id TEXT, entity_id TEXT, account_id TEXT, created_by TEXT, created_at TEXT, note TEXT, done_tx_id TEXT, recur TEXT);
INSERT INTO Captions VALUES ('C_AR','Fam_Default','ลูกหนี้','ASSET',NULL);
INSERT INTO Categories (category_id,family_id,name,caption_id) VALUES ('AR1','Fam_Default','ลูกหนี้ยืม','C_AR');
INSERT INTO Contacts (contact_id,family_id,name) VALUES ('CT1','Fam_Default','นายเอ');
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc,ref_code) VALUES
 ('TX-AR','A01','2026-09-10',-1000,'CONFIRMED','WEB_GRID','9North','ให้ยืม',NULL),
 ('TX-OLD','A02','2025-01-05',500,'CONFIRMED','WEB_GRID','9North','ร้านเดิม','R-1'),
 ('TX-P1','A02','2026-10-06',-70,'PENDING_REVIEW','WEB_GRID','9North','ร้านเดิม',NULL),
 ('TX-P2','A02','2026-10-07',-80,'PENDING_REVIEW','WEB_GRID','9North',NULL,'R-1'),
 ('TX-W','A02','2026-08-15',970,'CONFIRMED','WEB_GRID','9North','ค่าบริการ',NULL);
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,contact_id,type,wht,entity_id) VALUES
 ('D-AR','TX-AR',-1000,'AR1','CT1','DEBIT_AR',0,'Ent_North'),('D-OLD','TX-OLD',500,'T05',NULL,'INCOME',0,'Ent_North'),
 ('D-P1','TX-P1',-70,'Cat_Uncategorized',NULL,'EXPENSE',0,NULL),('D-P2','TX-P2',-80,'Cat_Uncategorized',NULL,'EXPENSE',0,NULL),
 ('D-W','TX-W',1000,'T05','CT1','INCOME',30,'Ent_North');
INSERT INTO Settlements VALUES ('S1','D-AR','D-OLD',-400);
INSERT INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Co_S01','Fam_Default','BKP',1),('Ent_Co_S05','Fam_Default','S05',1),('Ent_Other','Fam_Other','Other',0);`);



db.exec(`INSERT OR IGNORE INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Other','Fam_Other','Other',0);
INSERT INTO Captions VALUES ('C_FIX','Fam_Default','สินทรัพย์ถาวร','ASSET',NULL);
INSERT INTO Categories (category_id,family_id,name,caption_id,default_type) VALUES ('EQUIP','Fam_Default','[E01] อุปกรณ์สำนักงาน','C_FIX','EXPENSE'),('WRITEOFF','Fam_Default','ค่าเสียหายทรัพย์สิน','C_A','EXPENSE');
UPDATE Categories SET family_id='Fam_Default', caption_id=IFNULL(caption_id,'C_A') WHERE category_id IN ('T01','T05');
INSERT OR IGNORE INTO Captions VALUES ('C_A','Fam_Default','รายจ่าย','EXPENSE',NULL);
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('TX-BUY','A02','2026-05-01',-50000,'CONFIRMED','WEB_GRID','9North','ซื้อโน้ตบุ๊ก'),('TX-PEND','A02','2026-05-02',-999,'PENDING_REVIEW','WEB_GRID','9North','รอ');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type,note,entity_id) VALUES
 ('D-BUY','TX-BUY',-50000,'EQUIP','EXPENSE','MacBook Pro','Ent_North'),('D-PEND','TX-PEND',-999,'EQUIP','EXPENSE','ยังไม่ยืนยัน',NULL);`);
let ok = 0, bad = 0;
db.exec(fs.readFileSync(path.join(SRC, '..', 'db', 'migrations', '2026-10-11-period-close.sql'), 'utf8'));
db.exec(`CREATE TABLE IF NOT EXISTS Debts (debt_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, type TEXT, contact_id TEXT, principal_category_id TEXT, interest_category_id TEXT,
  start_balance REAL, installment_amount REAL, start_date TEXT, icon_type TEXT, status TEXT, members TEXT, created_at TEXT);
INSERT INTO Captions VALUES ('C_LI','Fam_Default','หนี้สิน','LIABILITY',NULL),('C_TR','Fam_Default','ทุน','TRANSFER',NULL),('C_RV','Fam_Default','รายได้','REVENUE',NULL);
INSERT INTO Categories (category_id,family_id,name,caption_id) VALUES ('LOANCAT','Fam_Default','เงินกู้ธนาคาร','C_LI'),('CAPITAL','Fam_Default','ทุน','C_TR'),('SALES','Fam_Default','รายได้ค่าบริการ','C_RV');
INSERT INTO Contacts (contact_id,family_id,name) VALUES ('CT2','Fam_Default','ธนาคารออมสิน');
INSERT INTO Debts (debt_id,family_id,name,type,contact_id,principal_category_id,start_balance,installment_amount,start_date,status) VALUES ('DB1','Fam_Default','กู้บ้าน','PAYABLE','CT2','LOANCAT',99,1000,NULL,'active');
INSERT INTO Entities VALUES ('Ent_Puii','Fam_Default','Puii',0);
INSERT INTO UserPermissions VALUES ('Puii','Ent_Puii');
INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_type) VALUES ('P01','Ent_Puii','[P01] Puii KTB','KTB','BANK');
UPDATE Accounts SET account_type='CREDIT' WHERE account_id='C01';
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES ('TX-OLD-A06','A06','2025-12-20',-70,'CONFIRMED','WEB_GRID','9North');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('D-OLD-A06','TX-OLD-A06',-70,'T01','EXPENSE');`);
const bal = a => db.prepare(`SELECT ROUND(SUM(total_amount),2) s FROM Transactions WHERE account_id=? AND status='CONFIRMED'`).get(a).s || 0;
const post = (p, body, user = '9North') => call('/api/inbox/opening' + p, { user, method: 'POST', body });
const get = (u = '9North') => call('/api/inbox/opening', { user: u });
const D = '2026-01-01';
const b06 = bal('A06'), b09 = bal('A09'), bC = bal('C01');
// ── ชุดแรก (ยังไม่ใส่ทุน → ไม่สมดุล) ──
let lines = [
  { kind: 'ACC', account_id: 'A06', side: 'DR', amount: 10000 },
  { kind: 'ACC', account_id: 'A09', side: 'DR', amount: '2,500' },
  { kind: 'ACC', account_id: 'C01', side: 'CR', amount: 2000 },
  { kind: 'CAT', category_id: 'AR1', contact_id: 'CT1', side: 'DR', amount: 500, note: 'นายเอค้าง' },
  { kind: 'CAT', category_id: 'T05', side: 'DR', amount: 300, note: 'ค่าใช้จ่ายสะสม' },
  { kind: 'CAT', category_id: 'SALES', side: 'CR', amount: 1300 },
  { kind: 'LOAN', debt_id: 'DB1', amount: 50000 },
  { kind: 'ACC', account_id: 'A10', side: 'DR', amount: 0 },
];
r = await post('', { name: 'ยอดยกมา North', date: D, lines: [{ kind: 'ACC', account_id: 'A06', side: 'DR', amount: -5 }] }); check('จำนวนเงินติดลบ → 400', r.s === 400, r);
r = await post('', { name: 'x', date: D, lines: [{ kind: 'CAT', category_id: 'CAT-OB-Fam_Default', side: 'DR', amount: 5 }] }); check('ใช้บัญชีพักเป็นบรรทัดไม่ได้ → 400', r.s === 400, r);
lines[1].amount = 2500;
r = await post('', { name: 'ยอดยกมา North', date: D, entity_id: 'Ent_North', anchor_account_id: 'A06', lines });
check('บันทึกได้แม้ยังไม่สมดุล · เดบิต 13,300 เครดิต 53,300 · บัญชีพัก −40,000', r.s === 200 && r.j.debit === 13300 && r.j.credit === 53300 && r.j.suspense === -40000 && r.j.balanced === false, r);
const SET = r.j.set_id;
check('ยอดบัญชี: ธนาคาร +10,000 / +2,500 · บัตร −2,000 · บรรทัด 0 ไม่สร้าง', bal('A06') === r2x(b06 + 10000) && bal('A09') === r2x(b09 + 2500) && bal('C01') === r2x(bC - 2000) && !db.prepare(`SELECT 1 FROM Transactions WHERE account_id='A10' AND transaction_id LIKE 'TX-OB-%'`).get(), [bal('A06'), bal('A09'), bal('C01')]);
function r2x(n) { return Math.round(n * 100) / 100; }
const J = db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(`TX-OB-${SET}-J`);
check('รายการปรับปรุงลูกหนี้/หมวด/เงินกู้ ยอดรวม 0', J && J.t === 0, J);
const susp = () => db.prepare(`SELECT ROUND(SUM(d.amount),2) s FROM TransactionDetails d WHERE d.category_id='CAT-OB-Fam_Default'`).get().s;
check('ยอดบัญชีพักในฐานข้อมูล = เดบิต − เครดิต (−40,000)', susp() === -40000, susp());
r = await get();
check('รายการชุด: ไม่สมดุล + เตือนรายการก่อนวันเริ่ม (A06 ธ.ค. 68)', r.j.sets.length === 1 && r.j.sets[0].balanced === false && r.j.sets[0].pre_start.some(p => p.account_id === 'A06' && p.n === 1) && r.j.suspense.balance === -40000, r.j);
r = await call('/api/inbox/periods/2026-01/check', { user: '9North' });
const obItem = r.j?.items?.find(i => i.key === 'opening');
check('ปิดเดือน ม.ค.: ข้อยอดยกมาไม่ผ่าน (ไม่สมดุล + มีรายการก่อนวันเริ่ม)', obItem && !obItem.ok && /ไม่สมดุล/.test(obItem.detail) && /ก่อนวันเริ่ม/.test(obItem.detail), r.j);
// ── ผลกระทบ ──
r = await call('/api/inbox/loans', { user: '9North' });
const loan = r.j.loans.find(l => l.debt_id === 'DB1');
check('เงินกู้: ยอดเริ่มต้น = ยอดยกมา 50,000 · วันเริ่ม = วันยกมา · ไม่นับซ้ำเป็นการจ่าย', loan && loan.start_balance === 50000 && loan.start_date === D && loan.outstanding === 50000 && loan.paid_principal === 0, loan);
let p = (await call(`/api/inbox/report?kind=pnl&from=${D}&to=2026-01-31`, { user: '9North' })).j;
check('1ก: ค่าใช้จ่าย/รายได้สะสมขึ้นในรายงานรับ-จ่าย · บัญชีพักไม่ขึ้น', p.lines.some(l => l.category_id === 'T05' && l.amount === -300 && l.side === 'OUT') && p.lines.some(l => l.category_id === 'SALES' && l.amount === 1300 && l.side === 'IN') && !p.lines.some(l => l.category_id === 'CAT-OB-Fam_Default'), p.lines);
r = await call('/api/inbox/parties', { user: '9North' });
check('ลูกหนี้นายเอ: มียอดยกมาเพิ่ม · บัญชีพักไม่โผล่ในลูกหนี้', JSON.stringify(r.j).includes('นายเอ') && !JSON.stringify(r.j).includes('บัญชีพักยอดยกมา'), r.j);
// ── แก้ให้สมดุล ──
lines.push({ kind: 'CAT', category_id: 'CAPITAL', side: 'DR', amount: 40000, note: 'ทุน (ขาดทุนสะสม)' });
r = await post('', { set_id: SET, name: 'ยอดยกมา North', date: D, entity_id: 'Ent_North', anchor_account_id: 'A06', lines });
check('แก้ชุด: สมดุลแล้ว · บัญชีพัก 0', r.s === 200 && r.j.balanced && susp() === 0, r);
check('แก้ชุดไม่สร้างรายการซ้ำ', db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE transaction_id LIKE 'TX-OB-%'`).get().n === 4 && bal('A06') === r2x(b06 + 10000), db.prepare(`SELECT transaction_id FROM Transactions WHERE transaction_id LIKE 'TX-OB-%'`).all());
// ── สิทธิ์ / กันซ้ำ ──
r = await post('', { name: 'Puii', date: '2026-06-01', lines: [{ kind: 'ACC', account_id: 'A06', side: 'DR', amount: 1 }] }, 'Puii'); check('3ข: Puii ใส่บัญชีที่ไม่มีสิทธิ์ไม่ได้ → 403', r.s === 403, r);
r = await post('', { name: 'Puii', date: '2026-06-01', lines: [{ kind: 'ACC', account_id: 'P01', side: 'DR', amount: 800 }, { kind: 'CAT', category_id: 'CAPITAL', side: 'CR', amount: 800 }] }, 'Puii');
check('3ข: Puii สร้างชุดของตัวเอง เริ่มคนละวันได้ (1 มิ.ย.)', r.s === 200 && r.j.balanced && bal('P01') === 800, r);
const PSET = r.j.set_id;
r = await post('', { set_id: SET, name: 'แก้ของ North', date: D, lines }, 'Puii'); check('Puii แก้ชุดของ North ไม่ได้ → 403', r.s === 403, r);
r = await post(`/${SET}/delete`, {}, 'Puii'); check('Puii ลบชุดของ North ไม่ได้ → 403', r.s === 403, r);
r = await get('Puii'); check('Puii เห็นชุดของ North แต่แก้ไม่ได้', r.j.sets.find(s => s.set_id === SET)?.can_edit === false && r.j.sets.find(s => s.set_id === PSET)?.can_edit === true, r.j.sets);
r = await post('', { name: 'ซ้ำ', date: '2026-03-01', lines: [{ kind: 'ACC', account_id: 'A06', side: 'DR', amount: 5 }] }); check('บัญชีที่อยู่ในชุดอื่นแล้ว → 409', r.s === 409, r);
r = await post('', { name: 'ซ้ำ', date: '2026-03-01', lines: [{ kind: 'LOAN', debt_id: 'DB1', amount: 5 }], anchor_account_id: 'A01' }); check('สัญญาเงินกู้ที่อยู่ในชุดอื่นแล้ว → 409', r.s === 409, r);
// ── ทะเบียนทรัพย์สินไม่ดึงบรรทัดยอดยกมา ──
await call('/api/inbox/assets/categories', { user: '9North', method: 'POST', body: { category_ids: ['EQUIP'] } });
r = await post('', { name: 'ทรัพย์สิน', date: '2026-02-01', anchor_account_id: 'A01', lines: [{ kind: 'CAT', category_id: 'EQUIP', side: 'DR', amount: 7000 }, { kind: 'CAT', category_id: 'CAPITAL', side: 'CR', amount: 7000 }] });
const A3 = r.j.set_id;
r = await call('/api/inbox/assets', { user: '9North' });
check('บรรทัดยอดยกมาในหมวดทรัพย์สิน ไม่ถูกดึงเข้าทะเบียนซ้ำ', !r.j.items.some(i => String(i.detail_id || '').startsWith('DT-OB-')), r.j.items);
// ── 2ก: ย้ายรายการเก่าออก → ปิดเดือนข้อยอดยกมาผ่าน ──
db.exec(`DELETE FROM TransactionDetails WHERE transaction_id='TX-OLD-A06'; DELETE FROM Transactions WHERE transaction_id='TX-OLD-A06';`);
r = await call('/api/inbox/periods/2026-01/check', { user: '9North' });
check('ไม่มีรายการก่อนวันเริ่ม + สมดุล → ข้อยอดยกมาผ่าน', r.j.items.find(i => i.key === 'opening')?.ok === true, r.j.items);
// ── ล็อกเดือน ──
db.exec(`INSERT INTO LedgerPeriods (family_id, period, status) VALUES ('Fam_Default','2026-02','CLOSED')`);
r = await post(`/${A3}/delete`, {}); check('เดือนที่ปิดแล้ว ลบ/แก้ชุดไม่ได้ → 409', r.s === 409, r);
db.exec(`DELETE FROM LedgerPeriods`);
r = await post(`/${A3}/delete`, {}); check('ลบชุดได้ · รายการของชุดหายหมด', r.s === 200 && !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id LIKE ?`).get(`TX-OB-${A3}-%`), r);
r = await get('Other'); check('ครอบครัวอื่นไม่เห็นชุด', r.j.sets.length === 0, r.j);
// ── ล้างรายการ → ชุดยอดยกมาหายด้วย ──
r = await call('/api/reset', { user: '9North', method: 'POST', body: { scope: 'transactions', confirm: 'RESET' } });
check('ล้างรายการ: ชุดยอดยกมาถูกลบด้วย', r.s === 200 && db.prepare(`SELECT COUNT(*) n FROM OpeningSets`).get().n === 0, r);
console.log(`${bad ? '❌' : '✅'} ผ่าน ${ok} · ไม่ผ่าน ${bad}`);
if (bad) process.exit(1);
