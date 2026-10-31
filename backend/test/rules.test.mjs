// ทดสอบ กฎอัตโนมัติ (⚡) — รัน: node backend/test/rules.test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
const worker = (await import(pathToFileURL(path.join(TMP, 'index.js')).href)).default;
const R = await import(pathToFileURL(path.join(TMP, 'rules.js')).href);
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
INSERT INTO Accounts (account_id,entity_id,name) VALUES ('A02','E_N','[A02] BK KBANK'),('KB','E_N','[A06] Kbank'),('PA','E_P','[P1] Puii Bank');
INSERT INTO Entities VALUES ('Ent_Co_S01','F1','Bookkeeper',1);
INSERT INTO Categories VALUES ('C_SHOP','F1','CapExp','ช้อปปิ้ง'),('C_FOOD','F1','CapExp','อาหาร'),('C_SAL','F1','CapInc','เงินเดือน');
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,statement_desc,source) VALUES
 ('h1','KB','2026-01-01',-100,'CONFIRMED','SHOPEE BANGKOK 001','PDF_IMPORT'),('h2','KB','2026-02-01',-200,'CONFIRMED','SHOPEE BANGKOK 002','PDF_IMPORT'),('h3','A02','2026-03-01',-300,'CONFIRMED','SHOPEE  BANGKOK','PDF_IMPORT'),
 ('g1','KB','2026-01-01',-50,'CONFIRMED','GRAB FOOD','PDF_IMPORT'),('g2','KB','2026-01-02',-50,'CONFIRMED','GRAB FOOD','PDF_IMPORT'),('g3','KB','2026-01-03',-50,'CONFIRMED','GRAB FOOD','PDF_IMPORT'),('g4','KB','2026-01-04',-50,'CONFIRMED','GRAB FOOD','PDF_IMPORT'),
 ('p1','KB','2026-10-01',-150,'PENDING_REVIEW','SHOPEE BANGKOK 999','PDF_IMPORT'),('p2','A02','2026-10-02',150,'PENDING_REVIEW','SHOPEE BANGKOK 998','PDF_IMPORT'),('p3','A02','2026-10-03',-90,'PENDING_REVIEW','SHOPEE BANGKOK','PDF_IMPORT'),
 ('p4','KB','2026-10-03',-90,'PENDING_REVIEW','SHOPEE BANGKOK','WEB_GRID'),('p5','KB','2026-10-04',80,'PENDING_REVIEW','GRAB FOOD','PDF_IMPORT'),('p6','PA','2026-10-04',-80,'PENDING_REVIEW','SHOPEE BANGKOK','PDF_IMPORT');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type,note) VALUES ('dh1','h1',-100,'C_SHOP','EXPENSE',NULL),('dh2','h2',-200,'C_SHOP','EXPENSE',NULL),('dh3','h3',-300,'C_SHOP','EXPENSE',NULL),
 ('dg1','g1',-50,'C_FOOD','EXPENSE',NULL),('dg2','g2',-50,'C_FOOD','EXPENSE',NULL),('dg3','g3',-50,'C_FOOD','EXPENSE',NULL),('dg4','g4',-50,'C_SHOP','EXPENSE',NULL),
 ('dp1','p1',-150,NULL,'EXPENSE','SHOPEE note'),('dp2','p2',150,NULL,'INCOME',NULL),('dp3','p3',-90,NULL,'EXPENSE',NULL),('dp4','p4',-90,NULL,'EXPENSE',NULL),('dp5','p5',80,NULL,'INCOME',NULL),('dp6','p6',-80,NULL,'EXPENSE',NULL);`);
const toD1 = sql => { const st = { _args: [], bind(...a) { st._args = a; return st; }, async first() { return db.prepare(sql).get(...st._args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st._args) }; }, async run() { const r = db.prepare(sql).run(...st._args); return { meta: { changes: Number(r.changes) } }; } }; return st; };
const env = { DB: { prepare: toD1, batch: async ops => { for (const o of ops) await o.run(); } } };
const hashTok = async t => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('base64url');
for (const u of ['North', 'Puii']) db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok(`tok-${u}`), u, '2099-01-01T00:00:00Z');
const call = async (p, user, body) => { const res = await worker.fetch(new Request('https://w.test' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer tok-${user}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, {}); let j = null; try { j = await res.json(); } catch {} return { s: res.status, j }; };
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0, 300)); } };
const tx = id => db.prepare(`SELECT * FROM Transactions WHERE transaction_id = ?`).get(id);
const det = id => db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id = ?`).all(id);
check('คีย์: ตัดตัวเลข/ธนาคาร', R.ruleKeyOf('SHOPEE BANGKOK 001') === 'shopee' && R.ruleKeyOf('โอนไป KBANK X1234 นาย ก ข') === 'โอนไป นาย ก ข', [R.ruleKeyOf('SHOPEE BANGKOK 001'), R.ruleKeyOf('โอนไป KBANK X1234 นาย ก ข')]);
let r = await call('/api/rules', 'North');
const sh = (r.j.suggestions || []).find(s => s.payee === 'shopee' && s.dir === 'OUT');
check('แนะนำ SHOPEE (3 ครั้ง หมวดเดียว) · รอตรวจที่ตรง 3 (PDF_IMPORT เท่านั้น · North เห็นบัญชี Puii)', sh && sh.category_id === 'C_SHOP' && sh.history === 3 && sh.pending === 3, r.j.suggestions);
check('ไม่แนะนำ GRAB (หมวดไม่ถึง 90%)', !(r.j.suggestions || []).some(s => s.payee === 'grab food'), r.j.suggestions);
r = await call('/api/rules/save', 'North', { dir: 'OUT', payee: 'shopee', category_id: 'C_SHOP', sample: 'SHOPEE BANGKOK' }); check('บันทึกกฎ', r.j.success, r.j);
r = await call('/api/rules/save', 'North', { dir: 'OUT', payee: 'shopee', category_id: 'C_SHOP' }); r = await call('/api/rules', 'North'); check('บันทึกซ้ำ = แก้กฎเดิม ไม่เพิ่ม', r.j.rules.length === 1 && r.j.rules[0].pending === 3, r.j.rules);
db.exec(`UPDATE Accounts SET tx_entity_id = 'Ent_Co_S01' WHERE account_id = 'A02'`);
r = await call('/api/rules/apply', 'North', {});
check('ใช้กฎ: ยืนยัน p1 p3 p6 · ไม่แตะเงินเข้า p2 / WEB_GRID p4', r.j.applied === 3 && tx('p1').status === 'CONFIRMED' && tx('p3').status === 'CONFIRMED' && tx('p6').status === 'CONFIRMED' && tx('p2').status === 'PENDING_REVIEW' && tx('p4').status === 'PENDING_REVIEW', r.j);
check('ใส่หมวด + เก็บ Detail เดิม + Company ตามบัญชี (A02 = Bookkeeper)', det('p1')[0].category_id === 'C_SHOP' && det('p1')[0].note === 'SHOPEE note' && det('p3')[0].entity_id === 'Ent_Co_S01' && det('p1')[0].entity_id == null, [det('p1'), det('p3')]);
r = await call('/api/rules', 'North'); check('นับครั้งที่ใช้กฎ', r.j.rules[0].hits === 3, r.j.rules);
r = await call('/api/rules/toggle', 'North', { rule_id: r.j.rules[0].rule_id, active: 0 }); db.exec(`UPDATE Transactions SET status='PENDING_REVIEW' WHERE transaction_id='p3'`);
r = await call('/api/rules/apply', 'Puii', {}); check('Puii: ไม่เห็นกฎของบัญชี North ทำงานกับบัญชีตัวเอง ไม่มีรอตรวจตรง', r.j.applied === 0, r.j);
r = await call('/api/rules/apply', 'North', {}); check('ปิดกฎแล้วไม่ใช้', r.j.applied === 0, r.j);
r = await call('/api/rules/save', 'Puii', { dir: 'OUT', payee: 'shopee', category_id: 'C_SHOP', account_id: 'KB' }); check('Puii ตั้งกฎกับบัญชีที่ไม่มีสิทธิ์ไม่ได้', r.s === 403, r.j);
r = await call('/api/rules/save', 'North', { dir: 'OUT', payee: 'ab', category_id: 'C_SHOP' }); check('ชื่อสั้นเกิน → ไม่รับ', r.s === 400, r.j);
console.log(`rules: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exitCode = 1;
