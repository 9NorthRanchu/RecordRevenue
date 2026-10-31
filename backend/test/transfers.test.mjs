// ทดสอบ โอนระหว่างบัญชี (⇄) — รัน: node backend/test/transfers.test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trf-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
const worker = (await import(pathToFileURL(path.join(TMP, 'index.js')).href)).default;
const T = await import(pathToFileURL(path.join(TMP, 'transfers.js')).href);
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, line_user_id TEXT UNIQUE, role TEXT, password TEXT, created_at DATETIME);
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, is_company INTEGER);
CREATE TABLE UserPermissions (user_id TEXT, entity_id TEXT, PRIMARY KEY (user_id, entity_id));
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, name TEXT NOT NULL, bank_name TEXT, account_number TEXT, balance REAL DEFAULT 0, created_at DATETIME, pdf_password TEXT, account_type TEXT DEFAULT 'BANK', credit_limit REAL DEFAULT 0, statement_day INTEGER, due_day INTEGER);
CREATE TABLE Transactions (transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, ref_code TEXT, date TEXT NOT NULL, time TEXT, total_amount REAL NOT NULL, statement_desc TEXT, status TEXT, source TEXT, slip_image_url TEXT, created_by_user_id TEXT, created_at DATETIME);
CREATE TABLE TransactionDetails (detail_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, amount REAL NOT NULL, fee REAL DEFAULT 0, wht REAL DEFAULT 0, category_id TEXT, entity_id TEXT, contact_id TEXT, project_id TEXT, note TEXT, type TEXT);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, caption_id TEXT, name TEXT);
CREATE TABLE Contacts (contact_id TEXT PRIMARY KEY, family_id TEXT, name TEXT);
CREATE TABLE Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);
INSERT INTO Users VALUES ('North','F1','North',NULL,NULL,'admin',NULL,NULL),('Puii','F1','Puii',NULL,NULL,'member',NULL,NULL);
INSERT INTO Entities VALUES ('E_N','F1','North',0),('E_P','F1','Puii',0);
INSERT INTO UserPermissions VALUES ('North','E_N'),('North','E_P'),('Puii','E_P');
INSERT INTO Accounts (account_id,entity_id,name,account_type) VALUES ('KB','E_N','[A02] KBank','BANK'),('SCB','E_N','[A03] SCB','BANK'),('CASH','E_N','[A01] เงินสด','CASH'),('PA','E_P','[P1] Puii Bank','BANK');
INSERT INTO Categories VALUES ('Bank_Transfer','F1','CapAsset','Bank Transfer'),('Food','F1','CapExp','อาหาร');
INSERT INTO Transactions (transaction_id,account_id,date,time,total_amount,status) VALUES
 ('o1','KB','2026-10-01','10:00:00',-5000,'PENDING_REVIEW'),('i1','SCB','2026-10-01','10:01:00',5000,'PENDING_REVIEW'),
 ('i1b','SCB','2026-10-03','09:00:00',5000,'PENDING_REVIEW'),
 ('o2','KB','2026-10-05','12:00:00',-300,'PENDING_REVIEW'),('i2','KB','2026-10-05','12:00:00',300,'PENDING_REVIEW'),
 ('o3','KB','2026-10-10','08:00:00',-2000,'PENDING_REVIEW'),('i3','SCB','2026-10-20','08:00:00',2000,'PENDING_REVIEW'),
 ('o4','KB','2026-10-12','08:00:00',-1000,'PENDING_REVIEW'),('o5','KB','2026-10-15','08:00:00',-700,'PENDING_REVIEW'),('i5','SCB','2026-10-16',NULL,700,'PENDING_REVIEW'),
 ('o6','KB','2026-10-18','08:00:00',-450,'PENDING_REVIEW'),('pp','PA','2026-10-01','10:00:00',5001,'PENDING_REVIEW');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('d_o1','o1',-5000,'Food','EXPENSE');`);
const toD1 = sql => { const st = { _args: [], bind(...a) { st._args = a; return st; }, async first() { return db.prepare(sql).get(...st._args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st._args) }; }, async run() { const r = db.prepare(sql).run(...st._args); return { meta: { changes: Number(r.changes) } }; } }; return st; };
const env = { DB: { prepare: toD1, batch: async ops => { for (const o of ops) await o.run(); } } };
const hashTok = async t => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('base64url');
for (const u of ['North', 'Puii']) db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok(`tok-${u}`), u, '2099-01-01T00:00:00Z');
const call = async (p, user, body) => { const res = await worker.fetch(new Request('https://w.test' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer tok-${user}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, {}); let j = null; try { j = await res.json(); } catch {} return { s: res.status, j }; };
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0, 300)); } };
const tx = id => db.prepare(`SELECT * FROM Transactions WHERE transaction_id = ?`).get(id);
const det = id => db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id = ?`).all(id);
let r = await call('/api/transfers/suggest', 'North');
const P = r.j.pairs || [], has = (o, i) => P.some(p => p.out_id === o && p.in_id === i);
check('KBank −5,000 คู่กับ SCB +5,000 วันเดียวกัน (ไม่ใช่วันที่ 3)', has('o1', 'i1') && !P.some(p => p.in_id === 'i1b'), P);
check('บัญชีเดียวกันไม่จับคู่', !P.some(p => p.out_id === 'o2'), P);
check('ห่างเกิน 2 วันไม่จับคู่', !P.some(p => p.out_id === 'o3'), P);
check('ห่าง 1 วันจับคู่ได้', has('o5', 'i5'), P);
check('o1 ใช้ได้คู่เดียว', P.filter(p => p.out_id === 'o1').length === 1, P);
r = await call('/api/transfers/suggest', 'Puii'); check('Puii ไม่เห็นบัญชี North', (r.j.pairs || []).length === 0, r.j);
r = await call('/api/transfers/apply', 'North', { pairs: [{ out_id: 'o1', in_id: 'i1' }, { out_id: 'o2', in_id: 'i2' }] });
check('ยืนยันคู่ได้ 1 · คู่บัญชีเดียวกันถูกปฏิเสธ', r.j.paired === 1 && r.j.errors.length === 1, r.j);
check('ขาออก: หมวด Bank_Transfer TRANSFER ยอดติดลบ ยืนยันแล้ว (ล้างหมวดเดิม)', tx('o1').status === 'CONFIRMED' && det('o1').length === 1 && det('o1')[0].category_id === 'Bank_Transfer' && det('o1')[0].type === 'TRANSFER' && det('o1')[0].amount === -5000 && /SCB/.test(det('o1')[0].note), det('o1'));
check('ขาเข้า: ยอดบวก note รับโอนจาก KBank', tx('i1').status === 'CONFIRMED' && det('i1')[0].amount === 5000 && /รับโอนจาก KBank/.test(det('i1')[0].note), det('i1'));
r = await call('/api/transfers/apply', 'North', { transaction_id: 'o4', counter_account_id: 'CASH', create_counter: true });
const cid = r.j.counter_id;
check('โอนเข้าเงินสด: สร้างขาเข้า +1,000 ในบัญชีเงินสด ยืนยันแล้ว', r.j.mode === 'created' && tx(cid)?.account_id === 'CASH' && tx(cid).total_amount === 1000 && tx(cid).status === 'CONFIRMED' && det(cid)[0].category_id === 'Bank_Transfer', [r.j, tx(cid)]);
check('ขาออกเงินสดยืนยันแล้ว', tx('o4').status === 'CONFIRMED' && det('o4')[0].type === 'TRANSFER', det('o4'));
r = await call('/api/transfers/apply', 'North', { transaction_id: 'o5', counter_account_id: 'SCB', create_counter: true });
check('บัญชีปลายทางมีขารอตรวจอยู่แล้ว → จับคู่ ไม่สร้างใหม่', r.j.mode === 'paired' && r.j.counter_id === 'i5' && tx('i5').status === 'CONFIRMED', r.j);
r = await call('/api/transfers/apply', 'North', { transaction_id: 'o6' });
check('ไม่ระบุบัญชี → ตั้งเป็นการโอนขาเดียว', r.j.mode === 'single' && det('o6')[0].category_id === 'Bank_Transfer', r.j);
r = await call('/api/transfers/apply', 'Puii', { transaction_id: 'o3' }); check('Puii ทำรายการบัญชี North ไม่ได้', r.s === 404, r.j);
r = await call('/api/transfers/apply', 'Puii', { transaction_id: 'pp', counter_account_id: 'CASH', create_counter: true }); check('Puii สร้างขาในบัญชีที่ไม่มีสิทธิ์ไม่ได้', r.s === 403, r.j);
r = await call('/api/transfers/apply', 'North', { transaction_id: 'o3', counter_account_id: 'KB' }); check('บัญชีปลายทางซ้ำกับต้นทาง → ไม่รับ', r.s === 400, r.j);
console.log(`transfers: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exitCode = 1;
