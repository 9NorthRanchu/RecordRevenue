// ทดสอบบัตรเครดิต + เงินกู้/ผ่อน + ลบสมาชิก (ดูก่อน) (2026-10-11) — รัน: node backend/test/cards-loans.test.mjs
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


env.__today = '2026-10-11';
db.exec(`INSERT OR IGNORE INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Other','Fam_Other','Other',0);
UPDATE Accounts SET account_type='CREDIT', credit_limit=100000, statement_day=20, due_day=5 WHERE account_id='C01';
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES
 ('CC1','C01','2026-09-10',-3000,'CONFIRMED','WEB_GRID','9North'),('CC2','C01','2026-09-25',-500,'CONFIRMED','WEB_GRID','9North'),
 ('CC3','C01','2026-09-28',1000,'CONFIRMED','WEB_GRID','9North'),('CC4','C01','2026-10-01',-99,'PENDING_REVIEW','WEB_GRID','9North');
CREATE TABLE IF NOT EXISTS Debts (debt_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT, contact_id TEXT, principal_category_id TEXT, interest_category_id TEXT,
  start_balance REAL, installment_amount REAL, start_date TEXT, icon_type TEXT, status TEXT DEFAULT 'active', created_at TEXT, entity_id TEXT, members TEXT);
INSERT INTO Contacts (contact_id,family_id,name) VALUES ('BANK1','Fam_Default','ธนาคารกรุงศรี'),('FRIEND','Fam_Default','มานะ');
INSERT INTO Categories (category_id,family_id,name) VALUES ('LOAN','Fam_Default','เงินกู้'),('INT','Fam_Default','ดอกเบี้ยจ่าย'),('LEND','Fam_Default','ให้ยืม');
INSERT INTO Debts (debt_id,family_id,name,type,contact_id,principal_category_id,interest_category_id,start_balance,installment_amount,start_date) VALUES
 ('DB1','Fam_Default','กู้บ้าน','PAYABLE','BANK1','LOAN','INT',10000,1000,'2026-01-01'),
 ('DB2','Fam_Default','มานะยืม','RECEIVABLE','FRIEND','LEND',NULL,5000,NULL,NULL),
 ('DB3','Fam_Default','ของคนอื่น','PAYABLE','BANK1','LOAN',NULL,1,NULL,NULL);
UPDATE Debts SET members='["Puii"]' WHERE debt_id='DB3';
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES
 ('L0','A02','2025-12-01',-777,'CONFIRMED','WEB_GRID','9North'),('L1','A02','2026-02-01',-1100,'CONFIRMED','WEB_GRID','9North'),
 ('L2','A02','2026-03-01',2000,'CONFIRMED','WEB_GRID','9North'),('L3','A02','2026-04-01',-1000,'PENDING_REVIEW','WEB_GRID','9North');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,contact_id) VALUES
 ('L0a','L0',-777,'LOAN','BANK1'),('L1a','L1',-1000,'LOAN','BANK1'),('L1b','L1',-100,'INT','BANK1'),('L2a','L2',2000,'LEND','FRIEND'),('L3a','L3',-1000,'LOAN','BANK1');`);
let ok = 0, bad = 0;
r = await call('/api/inbox/cards', { user: '9North' });
const c = r.j?.cards?.find(x => x.account_id === 'C01');
check('บัตร: วันตัดรอบ 20 ก.ย. ครบกำหนด 5 ต.ค.', c?.last_cut === '2026-09-20' && c?.due === '2026-10-05', c);
check('บัตร: ยอดตามบิล 3,000 · จ่ายแล้ว 1,000 · ต้องจ่ายอีก 2,000', c?.billed === 3000 && c?.paid_since_cut === 1000 && c?.due_left === 2000, c);
check('บัตร: ใช้ไปรอบนี้ 500 (ไม่นับรายการรอยืนยัน)', c?.spent_this_cycle === 500, c);
check('บัตร: หนี้รวม 2,500 · วงเงินเหลือ 97,500', c?.owed === 2500 && c?.available === 97500, c);
check('บัตร: เลยกำหนดแล้ว → OVERDUE + นับเตือน', c?.status === 'OVERDUE' && c?.days_to_due === -6 && r.j.totals.alert_count >= 1, c);
env.__today = '2026-10-01';
r = await call('/api/inbox/cards', { user: '9North' });
check('บัตร: เหลือ 4 วัน → DUE_SOON', r.j.cards.find(x => x.account_id === 'C01')?.status === 'DUE_SOON', r.j.cards);
r = await call('/api/inbox/loans', { user: '9North' });
const l1 = r.j.loans.find(x => x.debt_id === 'DB1'), l2 = r.j.loans.find(x => x.debt_id === 'DB2');
check('เงินกู้: จ่ายเงินต้น 1,000 → คงเหลือ 9,000 (ไม่กลับด้านแบบหน้าเก่า)', l1?.paid_principal === 1000 && l1?.outstanding === 9000, l1);
check('เงินกู้: ไม่นับรายการก่อนวันเริ่มสัญญา และรายการรอยืนยัน', l1?.payments === 2, l1);
check('เงินกู้: ดอกเบี้ย 100 · เหลือ 9 งวด', l1?.interest === 100 && l1?.installments_left === 9, l1);
check('ให้ยืม: รับคืน 2,000 → ค้าง 3,000', l2?.paid_principal === 2000 && l2?.outstanding === 3000, l2);
check('ยอดรวม: เราเป็นหนี้ 9,000 · เขาเป็นหนี้เรา 3,000', r.j.totals.payable === 9000 && r.j.totals.receivable === 3000, r.j.totals);
check('สัญญาที่กำหนดผู้เห็นไว้ ไม่โผล่ให้คนอื่น', !r.j.loans.some(x => x.debt_id === 'DB3'), r.j.loans.map(x => x.debt_id));
r = await call('/api/inbox/loans/DB1', { user: '9North' });
check('รายละเอียดสัญญา: ยอดคงเหลือหลังแต่ละงวด', r.s === 200 && r.j.lines[0].kind === 'INTEREST' && r.j.lines.find(x => x.kind === 'PRINCIPAL')?.balance_after === 9000, r.j);
r = await call('/api/inbox/loans/DB3', { user: '9North' }); check('สัญญาที่ไม่มีสิทธิ์เห็น → 404', r.s === 404, r);
r = await call('/api/users/delete', { user: '9North', method: 'POST', body: { user_id: 'Puii', preview: true } });
check('ลบสมาชิก: ดูก่อนได้ ไม่ลบจริง', r.s === 200 && r.j.preview && !!db.prepare(`SELECT 1 FROM Users WHERE user_id='Puii'`).get(), r);
console.log(`${bad ? '❌' : '✅'} ผ่าน ${ok} · ไม่ผ่าน ${bad}`);
if (bad) process.exit(1);
