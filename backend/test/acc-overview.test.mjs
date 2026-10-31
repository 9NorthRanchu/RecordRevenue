// ทดสอบภาพรวมตามบัญชี /api/accounts/overview (2026-10-30) — รัน: node backend/test/acc-overview.test.mjs
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
db.exec(`INSERT INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Other','Fam_Other','Other',0);`);
db.exec(`UPDATE Accounts SET account_type='CREDIT', credit_limit=50000 WHERE account_id='C01';
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('B0','A02','2026-09-30',1000,'CONFIRMED','WEB_GRID','9North','ยกมา'),
 ('B1','A02','2026-10-03',500,'CONFIRMED','PDF_IMPORT','9North','เงินเข้า'),
 ('B2','A02','2026-10-05',200,'PENDING_REVIEW','PDF_IMPORT','9North','จ่ายเก่า'),
 ('B3','A02','2026-10-06',-150,'PENDING_REVIEW','PDF_IMPORT','9North','จ่ายใหม่'),
 ('K1','C01','2026-10-10',-300,'PENDING_REVIEW','PDF_IMPORT','9North','SHOPEE');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('d0','B0',1000,'T01','INCOME'),('d1','B1',500,'T01','INCOME'),('d2','B2',200,'T01','EXPENSE'),('d3','B3',-150,'T05','EXPENSE'),('k1','K1',-300,'T01','EXPENSE');`);
r = await call('/api/statements/header', { user: '9North', method: 'POST', body: { account_id: 'C01', period_from: '2026-09-21', period_to: '2026-10-20', opening: 0, closing: 300, line_count: 2 } });
await call('/api/statements/header', { user: '9North', method: 'POST', body: { account_id: 'A02', period_from: '2026-10-01', period_to: '2026-10-31', opening: 1000, closing: 1150, line_count: 3 } });
r = await call('/api/accounts/overview?month=2026-10', { user: '9North' });
const a2 = r.j.accounts.find(a => a.account_id === 'A02'), c1 = r.j.accounts.find(a => a.account_id === 'C01');
check('ช่วงเดือน', r.s === 200 && r.j.from === '2026-10-01' && r.j.to === '2026-10-31', r.j);
check('ยกมา/ยกไป (รอตรวจแบบเก่ายอดบวก+EXPENSE = จ่าย)', a2.open_sys === 1000 && a2.close_sys === 1150 && a2.sum_in === 500 && a2.sum_out === -350, a2);
check('นับรายการ/รอตรวจ', a2.n === 3 && a2.n_pending === 2 && a2.n_in === 1 && a2.n_out === 2, a2);
check('ยอดธนาคารจากหัว statement + ต่าง', a2.bank?.balance === 1150 && a2.diff === 0 && a2.missing_lines === 3, a2);
check('บัตร: ยอดธนาคาร (บวก) แปลงเป็นแบบระบบ (ลบ) · ตรงกัน', c1.bank?.balance === -300 && c1.sys_at_bank === -300 && c1.diff === 0 && c1.credit_limit === 50000 && c1.missing_lines === 2, c1);
check('3 รายการล่าสุด + หมวด', a2.recent.length === 3 && a2.recent[0].transaction_id === 'B3' && a2.recent[0].category && a2.recent[0].amount === -150, a2.recent);
check('รายวัน', a2.daily.length === 3 && a2.daily.find(x => x.d === '2026-10-05').net === -200, a2.daily);
check('ไม่เห็นบัญชีครอบครัวอื่น', !r.j.accounts.some(a => a.account_id === 'X99'), r.j.accounts.map(a => a.account_id));
r = await call('/api/accounts/overview', { user: '9North' }); check('ไม่ระบุเดือน → เดือนล่าสุดที่มีรายการ', r.j.month === '2026-10', r.j.month);
r = await call('/api/accounts/overview?month=2026-10'); check('ไม่ล็อกอิน → 401', r.s === 401, r);
/* 📌 จำรูปแบบนำเข้า */
r = await call('/api/accounts/import-format', { user: '9North', method: 'POST', body: { account_id: 'C01', format: { kind: 'CARD', issuer: 'CardX', parser: 'card', read: '3565 18XX XXXX 9607' } } });
check('จำรูปแบบนำเข้า', r.s === 200 && r.j.format.kind === 'CARD' && r.j.format.issuer === 'CardX', r.j);
r = await call('/api/accounts', { user: '9North' }); const c01 = r.j.find(a => a.account_id === 'C01');
check('/api/accounts ส่ง import_format + account_type', c01 && JSON.parse(c01.import_format).issuer === 'CardX' && c01.account_type === 'CREDIT', c01);
r = await call('/api/accounts/import-format', { user: 'Other', method: 'POST', body: { account_id: 'C01', format: { kind: 'BANK' } } }); check('ครอบครัวอื่นแก้ไม่ได้', r.s === 403, r);
console.log(`acc-overview: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exit(1);
