// ทดสอบผังเก็บรายได้ → จับเงินเข้า (2026-10-30) — รัน: node backend/test/revenue-chart.test.mjs
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
for (const u of ['9North', 'Other']) db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok(`tok-${u}`), u, '2099-01-01T00:00:00Z');
 const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0,200)); } };
let ok = 0, bad = 0, r;
db.exec(`INSERT INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Co_S01','Fam_Default','BKP',1),('Ent_Other','Fam_Other','Other',0);
CREATE TABLE IF NOT EXISTS LedgerRules (rule_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kind TEXT NOT NULL, rkey TEXT NOT NULL, value TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 1, updated_at DATETIME, UNIQUE (family_id, kind, rkey));`);
const rc = await import(pathToFileURL(path.join(TMP, 'revenue-chart.js')).href);
const R = (o) => ({ owner: 'BKKP', type: 'Account', account_label: 'BK Kbank', ...o });
const rows = [
  R({ row_id: 'r1', code: 'BLMC', name: 'บริษัท บางละมุง คอนสตรัคชั่น เซอร์วิส จำกัด', tax_month: '2026-08-31', receipt_date: '2026-09-26', service: 'ค่าบริการงานบัญชีเดือน August 2569', fee: 3000, wht: -90, total: 2910 }),
  R({ row_id: 'r2', code: 'HNPR', name: 'Honeys Property Rentel Co., Ltd.', tax_month: '2026-08-31', invoice_date: '2026-09-20', fee: 4000, wht: -120, total: 3880 }),
  R({ row_id: 'r3', code: 'HNPR', name: 'Honeys Property Rentel Co., Ltd.', tax_month: '2026-09-30', invoice_date: '2026-10-05', fee: 4000, wht: -120, total: 3880 }),
  R({ row_id: 'r4', code: 'LSDW', name: 'บริษัท เขียนแบบแลนด์สเคป จำกัด', tax_month: '2026-09-30', receipt_date: '2026-10-10', fee: 1500, wht: -45, total: 5595 }),
  R({ row_id: 'r5', code: 'ADUD', owner: 'SORC', type: 'Audit', name: 'บริษัท อะ ดู๊ด โปรดักชั่น จำกัด', tax_month: '2026-09-30', receipt_date: '2026-10-12', fee: 10000, wht: -300, total: 9700, account_label: 'Sorc KTB' })];
r = await call('/api/revenue-chart/import', { user: '9North', method: 'POST', body: { reset: true, rows } }); check('import', r.s === 200 && r.j.saved === 5, r);
r = await call('/api/revenue-chart/summary', { user: '9North' }); check('summary', r.j.count === 5 && r.j.owners.length === 2, r.j);
r = await call('/api/revenue-chart/summary', { user: 'Other' }); check('other family sees nothing', r.j.count === 0, r.j);
for (const [kind, key, value] of [['OWNER', 'BKKP', 'Ent_Co_S01'], ['ACCOUNT', 'BK Kbank', 'A02'], ['SETTING', 'advance_category', 'T05']])
  { r = await call('/api/revenue-chart/map', { user: '9North', method: 'POST', body: { kind, key, value } }); check('map ' + kind, r.s === 200, r); }
r = await call('/api/revenue-chart/map', { user: '9North', method: 'POST', body: { kind: 'ACCOUNT', key: 'x', value: 'X99' } }); check('map other family account denied', r.s === 403, r);
const ins = (id, acc, date, amt, desc) => { db.prepare(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES (?,?,?,?, 'PENDING_REVIEW','PDF_IMPORT','9North',?)`).run(id, acc, date, amt, desc);
  db.prepare(`INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES (?,?,?,?,?)`).run('D' + id, id, amt, 'Cat_Uncategorized', 'INCOME'); };
ins('T1', 'A02', '2026-09-26', 2910, 'รับโอน BANGLAMUNG CONSTRUCTION');
ins('T2', 'A02', '2026-10-08', 7760, 'รับโอน HONEYS PROPERTY');
ins('T3', 'A02', '2026-10-10', 5595, 'รับโอน');
ins('T4', 'A02', '2026-10-12', 9690, 'รับโอน ADUD');   // ค่าธรรมเนียมธนาคาร 10 บาท · แต่บัญชีที่เงินเข้า (Sorc KTB) ไม่ได้ผูก
r = await call('/api/revenue-chart/suggest', { user: '9North', method: 'POST', body: { transaction_ids: ['T1', 'T2', 'T3', 'T4'] } });
const S = r.j.suggestions || {};
check('T1 → BLMC แถวเดียว', S.T1?.[0]?.rows.length === 1 && S.T1[0].rows[0].row_id === 'r1', S.T1);
check('T2 → HNPR 2 เดือนรวมกัน', S.T2?.[0]?.rows.map(x => x.row_id).sort().join() === 'r2,r3', S.T2);
check('T3 → LSDW (มีเงินรับแทน)', S.T3?.[0]?.rows[0].row_id === 'r4', S.T3);
check('T4 → ADUD ยอมค่าธรรมเนียม 10', S.T4?.[0]?.rows[0].row_id === 'r5' && S.T4[0].gap === -10, S.T4);
r = await call('/api/revenue-chart/apply', { user: '9North', method: 'POST', body: { transaction_id: 'T1', row_ids: ['r1'] } }); check('apply T1', r.s === 200, r);
let L = db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id='T1'`).all();
check('T1 บรรทัด: Account 3,000 หัก 90 บริษัท BKP คู่ค้าใหม่', L.length === 1 && L[0].amount === 3000 && L[0].wht === 90 && L[0].category_id === 'Account' && L[0].entity_id === 'Ent_Co_S01' && L[0].contact_id, L);
check('สร้างคู่ค้า บางละมุง', db.prepare(`SELECT COUNT(*) n FROM Contacts WHERE name LIKE '%บางละมุง%'`).get().n === 1);
check('T1 ยังรอตรวจ', db.prepare(`SELECT status FROM Transactions WHERE transaction_id='T1'`).get().status === 'PENDING_REVIEW');
r = await call('/api/revenue-chart/apply', { user: '9North', method: 'POST', body: { transaction_id: 'T3', row_ids: ['r4'] } });
L = db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id='T3' ORDER BY amount DESC`).all();
check('T3 แตก 2 บรรทัด: เงินรับแทน 4,140 (T05) + ค่าบริการ 1,500 หัก 45', r.s === 200 && L.length === 2 && L[0].amount === 4140 && L[0].category_id === 'T05' && L[1].amount === 1500 && L[1].wht === 45, L);
r = await call('/api/revenue-chart/apply', { user: '9North', method: 'POST', body: { transaction_id: 'T4', row_ids: ['r5'] } });
L = db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id='T4'`).all();
check('T4 ค่าธรรมเนียม 10 ลงบรรทัด · ยอดลงตัว', r.s === 200 && L[0].fee === 10 && Math.abs(L[0].amount - L[0].fee - L[0].wht - 9690) < 0.01 && L[0].category_id === 'Audit', L);
r = await call('/api/revenue-chart/apply', { user: '9North', method: 'POST', body: { transaction_id: 'T2', row_ids: ['r1'] } }); check('ใช้แถวที่ถูกใช้แล้ว → ไม่ให้', r.s === 409, r);
r = await call('/api/revenue-chart/suggest', { user: '9North', method: 'POST', body: { transaction_ids: ['T2'] } });
check('แถวที่ใช้แล้วไม่ถูกเสนออีก', !JSON.stringify(r.j).includes('"r1"'), r.j);
r = await call('/api/revenue-chart/apply', { user: 'Other', method: 'POST', body: { transaction_id: 'T2', row_ids: ['r2', 'r3'] } }); check('ครอบครัวอื่นใช้ไม่ได้', r.s === 404, r);
r = await call('/api/revenue-chart/import', { user: '9North', method: 'POST', body: { reset: true, rows: rows.slice(0, 1) } });
check('นำเข้าใหม่ (reset) ไม่ลบแถวที่ใช้แล้ว', db.prepare(`SELECT COUNT(*) n FROM RevenueChart WHERE matched_tx IS NOT NULL`).get().n === 3, db.prepare(`SELECT row_id, matched_tx FROM RevenueChart`).all());

/* เปลี่ยนชื่อคู่ค้าในตั้งค่าแล้ว → ใช้คู่ค้าเดิม ไม่สร้างใหม่ */
const ctId = db.prepare(`SELECT contact_id FROM TransactionDetails WHERE transaction_id='T1'`).get().contact_id;
db.prepare(`UPDATE Contacts SET name='บางละมุง (ชื่อใหม่)' WHERE contact_id=?`).run(ctId);
db.prepare(`INSERT INTO RevenueChart (row_id,family_id,owner,code,name,tax_month,receipt_date,type,fee,wht,other,total) VALUES ('r9','Fam_Default','BKKP','BLMC','บริษัท บางละมุง คอนสตรัคชั่น เซอร์วิส จำกัด','2026-09-30','2026-10-26','Account',3000,-90,0,2910)`).run();
ins('T9', 'A02', '2026-10-26', 2910, 'รับโอน');
r = await call('/api/revenue-chart/apply', { user: '9North', method: 'POST', body: { transaction_id: 'T9', row_ids: ['r9'] } });
check('เปลี่ยนชื่อคู่ค้าแล้ว ยังผูกคู่ค้าเดิม ไม่สร้างซ้ำ', r.s === 200 && db.prepare(`SELECT contact_id FROM TransactionDetails WHERE transaction_id='T9'`).get().contact_id === ctId
  && db.prepare(`SELECT COUNT(*) n FROM Contacts WHERE name LIKE '%บางละมุง%'`).get().n === 1, r);
console.log(`revenue-chart: ✅ ผ่าน ${ok} · ไม่ผ่าน ${bad}`); if (bad) process.exit(1);
