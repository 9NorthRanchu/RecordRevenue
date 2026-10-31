// ทดสอบ Google Drive (Apps Script จำลอง) — รัน: node backend/test/drive.test.mjs
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
/* Apps Script จำลอง */
const gasCalls = []; const store = {};
env.__fetch = async (u, o) => { const b = JSON.parse(o.body); gasCalls.push(b.action);
  if (b.secret !== 'secret-12345') return new Response(JSON.stringify({ error: 'รหัสลับไม่ตรง' }));
  if (b.action === 'ping') return new Response(JSON.stringify({ ok: true, root: 'https://drive/root', user: 'n@x' }));
  if (b.action === 'upload') { const id = 'G' + Object.keys(store).length; store[id] = b; return new Response(JSON.stringify({ ok: true, id, url: 'https://drive/' + id, size: 3 })); }
  if (b.action === 'get') return new Response(JSON.stringify({ ok: true, name: store[b.id].name, mime: store[b.id].mime, data: store[b.id].data }));
  return new Response(JSON.stringify({ error: 'x' })); };
const URLX = 'https://script.google.com/macros/s/AKfycbx1234567890abcdef/exec';
r = await call('/api/drive/config', { user: '9North' }); check('ยังไม่ตั้งค่า', r.s === 200 && r.j.configured === false, r);
r = await call('/api/drive/config', { user: '9North', method: 'POST', body: { url: 'https://evil.com/x', secret: 'secret-12345' } }); check('URL ต้องเป็น Apps Script', r.s === 400, r.j);
r = await call('/api/drive/config', { user: '9North', method: 'POST', body: { url: URLX, secret: 'wrong-secret' } }); check('รหัสลับผิด → ไม่บันทึก', r.s === 400 && /รหัสลับไม่ตรง/.test(r.j.error), r.j);
r = await call('/api/drive/config', { user: '9North', method: 'POST', body: { url: URLX, secret: 'secret-12345' } }); check('ตั้งค่า + ping ผ่าน', r.s === 200 && r.j.root === 'https://drive/root', r.j);
r = await call('/api/drive/config', { user: '9North' }); check('ไม่ส่งรหัสลับกลับ', r.j.configured === true && !JSON.stringify(r.j).includes('secret-12345'), r.j);
r = await call('/api/drive/config', { user: 'Other' }); check('ครอบครัวอื่นยังไม่ได้ตั้งค่า', r.j.configured === false, r.j);
const hd = await call('/api/statements/header', { user: '9North', method: 'POST', body: { account_id: 'A02', period_from: '2026-10-01', period_to: '2026-10-31', opening: 0, closing: 1, line_count: 1 } });
const sid = hd.j.stmt_id;
const data = Buffer.from('PDF').toString('base64');
r = await call('/api/drive/upload', { user: '9North', method: 'POST', body: { name: 'a.pdf', mime: 'application/pdf', data, hash: 'h1', kind: 'statement', account_id: 'A02', date: '2026-10-31', links: [{ type: 'stmt', id: sid }] } });
check('อัปโหลด + ผูก statement', r.s === 200 && !r.j.reused && r.j.file.file_id && store.G0.path.join('/') === 'Statement/[A02] BK KBANK/2026', [r.j, store.G0?.path]);
const fid = r.j.file.file_id;
r = await call('/api/drive/upload', { user: '9North', method: 'POST', body: { name: 'a.pdf', mime: 'application/pdf', data, hash: 'h1', account_id: 'A02', links: [{ type: 'stmt', id: 'S2' }] } });
check('ไฟล์เดิม (hash) ไม่อัปซ้ำ แค่ผูกเพิ่ม', r.j.reused && r.j.file.file_id === fid && Object.keys(store).length === 1, r.j);
r = await call('/api/drive/upload', { user: '9North', method: 'POST', body: { name: 'x.pdf', data, account_id: 'X99' } }); check('บัญชีครอบครัวอื่น → ไม่ได้', r.s === 403, r);
r = await call(`/api/drive/files?ref_type=stmt&ref_ids=${sid},S2`, { user: '9North' }); check('รายการไฟล์ของ statement', r.j.files.length === 2, r.j);
r = await call(`/api/reports/statement-running?account_id=A02&from=2026-10-01&to=2026-10-31`, { user: '9North' });
check('รายงานยอดสะสม: หัว statement มีไฟล์', r.j.headers.find(h => h.stmt_id === sid)?.files?.[0]?.file_id === fid, r.j.headers);
const res = await worker.fetch(new Request('https://w.test/api/drive/file?id=' + fid, { headers: { Authorization: 'Bearer tok-9North' } }), env, {});
check('เปิดไฟล์ → ได้ไฟล์จริง', res.status === 200 && (await res.text()) === 'PDF' && res.headers.get('Content-Type') === 'application/pdf', res.status);
const res2 = await worker.fetch(new Request('https://w.test/api/drive/file?id=' + fid, { headers: { Authorization: 'Bearer tok-Other' } }), env, {});
check('ครอบครัวอื่นเปิดไม่ได้', res2.status === 404, res2.status);
/* สลิปจาก LINE (R2) → Drive */
const r2 = { 'ledger-docs/s1.jpg': new Uint8Array([1, 2, 3]) };
env.ICONS = { get: async k => r2[k] ? { arrayBuffer: async () => r2[k].buffer } : null };
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES ('TS1','A02','2026-10-05',-50,'CONFIRMED','LINE_SLIP','9North');
INSERT INTO LedgerDocs (doc_id,family_id,source,file_key,mime,status,doc_type,created_at) VALUES ('DOC1','Fam_Default','LINE','ledger-docs/s1.jpg','image/jpeg','DONE','SLIP','2026-10-05'),('DOC2','Fam_Default','LINE','ledger-docs/gone.jpg','image/jpeg','DONE','SLIP','2026-08-01');
INSERT INTO LedgerDocLinks (doc_id,transaction_id,role) VALUES ('DOC1','TS1','MATCHED'),('DOC2','TS1','MATCHED');`);
r = await call('/api/drive/sync-slips', { user: '9North', method: 'POST' });
check('ซิงก์สลิป: 1 ไฟล์ขึ้น Drive · 1 ไฟล์หมดอายุ', r.j.done === 1 && r.j.missing === 1 && r.j.remaining === 0, r.j);
r = await call('/api/drive/sync-slips', { user: '9North', method: 'POST' }); check('ซิงก์ซ้ำ → ไม่มีงาน', r.j.done === 0 && r.j.remaining === 0, r.j);
r = await call('/api/drive/files?ref_type=tx&ref_ids=TS1', { user: '9North' }); check('รายการมีไฟล์แนบ 1 (ไม่นับที่หมดอายุ)', r.j.files.length === 1 && store[r.j.files[0] ? 'G1' : 'x'].path[0] === 'Slip', [r.j, Object.keys(store)]);
r = await call('/api/reports/statement-running?account_id=A02&from=2026-10-01&to=2026-10-31', { user: '9North' });
check('รายงานยอดสะสม: n_files ต่อรายการ', r.j.rows.find(x => x.transaction_id === 'TS1')?.n_files === 1, r.j.rows);
const tf = (await call('/api/drive/files?ref_type=tx&ref_ids=TS1', { user: '9North' })).j.files[0];
r = await call('/api/drive/unlink', { user: '9North', method: 'POST', body: { file_id: tf.file_id, ref_type: 'tx', ref_id: 'TS1' } });
r = await call('/api/drive/files?ref_type=tx&ref_ids=TS1', { user: '9North' }); check('เลิกผูก', r.j.files.length === 0, r.j);
console.log(`drive: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exit(1);
