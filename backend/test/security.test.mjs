// ทดสอบประตูล็อกอิน + กันข้ามครอบครัว (ระยะ 0 · 2026-10-11) — รัน: node backend/test/security.test.mjs
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
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0,200)); } };
let r;
r = await call('/api/export?table=Accounts'); check('export no login 401', r.s === 401, r);
{ const rx = await worker.fetch(new Request('https://w.test/api/categories', { headers: { 'x-user-id': '9North' } }), env, {});
  check('x-user-id ปลอม (ไม่มี token) → 401', rx.status === 401, { s: rx.status }); }
r = await call('/api/export?table=Accounts', { user: '9North' }); check('export logged in 410', r.s === 410, r);
r = await call('/api/categories'); check('categories no login 401', r.s === 401, r);
r = await call('/api/categories', { user: '9North' }); check('categories own family only', r.s === 200 && !r.j.some(c => c.category_id === 'X_SECRET') && r.j.length > 0, r);
r = await call('/api/account-types', { user: '9North' }); check('captions own family', r.s === 200 && r.j.every(c => c.type_id !== 'C_X'), r);
r = await call('/api/slip-ocr', { method: 'POST', body: { imageBase64: 'x' } }); check('slip-ocr no login 401', r.s === 401, r);
r = await call('/api/statement-ocr', { method: 'POST', body: { pdfBase64: 'x' } }); check('stmt-ocr no login 401', r.s === 401, r);
r = await call('/api/outstanding_ar'); check('outstanding no login 401', r.s === 401, r);
r = await call('/api/settlements', { user: '9North', method: 'POST', body: { parent_detail_id: 'D-OTHER', child_detail_id: 'D-MINE', settled_amount: 10 } }); check('settlement foreign 404', r.s === 404, r);
r = await call('/api/settlements', { user: '9North', method: 'POST', body: { parent_detail_id: 'D-MINE', child_detail_id: 'D-MINE', settled_amount: 10 } }); check('settlement own ok', r.s === 200 && r.j.success, r);
const tx = (o) => ({ account_id: 'A01', date: '2026-10-02', total_amount: -20, source: 'WEB_GRID', status: 'PENDING_REVIEW', details: [{ amount: -20, category_id: 'T01' }], ...o });
r = await call('/api/transactions', { user: '9North', method: 'POST', body: tx({ account_id: 'X99' }) }); check('tx other account 403', r.s === 403, r);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: tx({ transaction_id: 'TX-OTHER' }) }); check('tx overwrite other 403', r.s === 403, r);
check('other tx untouched', db.prepare("SELECT account_id FROM Transactions WHERE transaction_id='TX-OTHER'").get().account_id === 'X99');
r = await call('/api/transactions', { user: '9North', method: 'POST', body: tx({}) }); check('tx own ok', r.s === 200 && r.j.success, r);
r = await call('/api/bulk-import', { user: '9North', method: 'POST', body: { transactions: [tx({ transaction_id: 'TX-OTHER', date: '2026-10-03' }), tx({ account_id: 'X99', date: '2026-10-04' }), tx({ transaction_id: 'BLK-NEW', date: '2026-10-05' })] } });
check('bulk saves only own', r.s === 200 && r.j.saved === 1 && r.j.errors.length === 2, r);
check('bulk did not touch other', db.prepare("SELECT total_amount FROM Transactions WHERE transaction_id='TX-OTHER'").get().total_amount === -100);
r = await call('/api/transactions?status=CONFIRMED', { user: '9North' }); check('tx list works', r.s === 200 && Array.isArray(r.j), r);
r = await call('/api/settings', { user: '9North' }); check('settings works', r.s === 200 && r.j.accounts, r);
r = await call('/api/login', { method: 'POST', body: { username: 'x', password: 'y' } }); check('login still public (401 wrong pw, not gate)', r.s === 401 && /รหัสผ่าน/.test(r.j.error), r);
// quota error path
const envBad = { DB: { prepare: () => { throw new Error('D1_ERROR: Exceeded daily rows read limit'); } } };
const rb = await worker.fetch(new Request('https://w.test/api/categories', { headers: { Authorization: 'Bearer tok-9North' } }), envBad, {});
const jb = await rb.json(); check('quota → 503 json no stack', rb.status === 503 && jb.code === 'DB_UNAVAILABLE' && !jb.stack && rb.headers.get('Access-Control-Allow-Origin'), { s: rb.status, jb });
console.log(`${bad ? "❌" : "✅"} ผ่าน ${ok} · ไม่ผ่าน ${bad}`); if (bad) process.exit(1);
