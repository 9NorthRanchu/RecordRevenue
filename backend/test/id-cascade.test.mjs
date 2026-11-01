// ทดสอบ เปลี่ยนรหัส ID ในตั้งค่า แล้วตามไปทุกตาราง (v275) — รัน: node backend/test/id-cascade.test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'idc-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
const worker = (await import(pathToFileURL(path.join(TMP, 'index.js')).href)).default;
const db = new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE Families (family_id TEXT PRIMARY KEY);
INSERT INTO Families VALUES ('F1');
CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, line_user_id TEXT UNIQUE, role TEXT, password TEXT, created_at DATETIME);
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, is_company INTEGER, FOREIGN KEY (family_id) REFERENCES Families(family_id));
CREATE TABLE UserPermissions (user_id TEXT, entity_id TEXT, PRIMARY KEY (user_id, entity_id), FOREIGN KEY (user_id) REFERENCES Users(user_id), FOREIGN KEY (entity_id) REFERENCES Entities(entity_id));
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, name TEXT NOT NULL, bank_name TEXT, account_number TEXT, balance REAL DEFAULT 0, created_at DATETIME, pdf_password TEXT, account_type TEXT DEFAULT 'BANK', credit_limit REAL DEFAULT 0, statement_day INTEGER, due_day INTEGER, tx_entity_id TEXT, FOREIGN KEY (entity_id) REFERENCES Entities(entity_id));
CREATE TABLE Transactions (transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, ref_code TEXT, date TEXT NOT NULL, time TEXT, total_amount REAL NOT NULL, statement_desc TEXT, status TEXT, source TEXT, slip_image_url TEXT, created_by_user_id TEXT, created_at DATETIME, FOREIGN KEY (account_id) REFERENCES Accounts(account_id));
CREATE TABLE Captions (type_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, behavior TEXT, sub_behavior TEXT, default_entity_id TEXT, default_contact_id TEXT, default_type TEXT);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, caption_id TEXT, name TEXT, default_entity_id TEXT, default_contact_id TEXT, default_type TEXT);
CREATE TABLE Contacts (contact_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, contact_type TEXT, members TEXT);
CREATE TABLE TransactionDetails (detail_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, amount REAL NOT NULL, fee REAL DEFAULT 0, wht REAL DEFAULT 0, category_id TEXT, entity_id TEXT, contact_id TEXT, project_id TEXT, note TEXT, type TEXT, FOREIGN KEY (transaction_id) REFERENCES Transactions(transaction_id) ON DELETE CASCADE, FOREIGN KEY (entity_id) REFERENCES Entities(entity_id));
CREATE TABLE AccountCheckpoints (account_id TEXT NOT NULL, as_of TEXT NOT NULL, balance REAL NOT NULL);
CREATE TABLE StatementImports (stmt_id TEXT PRIMARY KEY, account_id TEXT, period_from TEXT);
CREATE TABLE AutoRules (rule_id TEXT PRIMARY KEY, family_id TEXT, account_id TEXT, category_id TEXT, contact_id TEXT, entity_id TEXT);
CREATE TABLE OpeningSets (set_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, entity_id TEXT, date TEXT NOT NULL, anchor_account_id TEXT, lines TEXT NOT NULL DEFAULT '[]');
CREATE TABLE AssetItems (asset_id TEXT PRIMARY KEY, family_id TEXT, account_id TEXT, category_id TEXT, entity_id TEXT, expense_category_id TEXT);
CREATE TABLE Debts (debt_id TEXT PRIMARY KEY, family_id TEXT, contact_id TEXT, category_id TEXT, interest_category_id TEXT, principal_category_id TEXT);
CREATE TABLE InsurancePolicies (policy_id TEXT PRIMARY KEY, family_id TEXT, category_id TEXT, contact_id TEXT, entity_id TEXT);
CREATE TABLE DriveFiles (file_id TEXT PRIMARY KEY, family_id TEXT, account_id TEXT);
CREATE TABLE TripStops (stop_id TEXT, account_id TEXT);
CREATE TABLE Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);
INSERT INTO Users VALUES ('North','F1','North',NULL,NULL,'admin',NULL,NULL);
INSERT INTO Entities VALUES ('E_OLD','F1','North',0),('E_B','F1','Biz',1);
INSERT INTO UserPermissions VALUES ('North','E_OLD'),('North','E_B');
INSERT INTO Accounts (account_id,entity_id,name,tx_entity_id) VALUES ('A_OLD','E_OLD','[A1] KBank','E_OLD'),('A2','E_B','[A2] SCB','E_B');
INSERT INTO Captions VALUES ('CAP_OLD','F1','Expense','EXPENSE',NULL,'E_OLD','C_OLD',NULL);
INSERT INTO Categories VALUES ('CAT_OLD','F1','CAP_OLD','อาหาร','E_OLD','C_OLD',NULL),('CAT2','F1','CAP_OLD','อื่น',NULL,NULL,NULL);
INSERT INTO Contacts VALUES ('C_OLD','F1','ร้าน ก','SUPPLIER',NULL);
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status) VALUES ('T1','A_OLD','2026-10-01',-100,'CONFIRMED');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,entity_id,contact_id) VALUES ('D1','T1',-100,'CAT_OLD','E_OLD','C_OLD');
INSERT INTO AccountCheckpoints VALUES ('A_OLD','2026-10-31',5000);
INSERT INTO StatementImports VALUES ('S1','A_OLD','2026-10-01');
INSERT INTO AutoRules VALUES ('R1','F1','A_OLD','CAT_OLD','C_OLD','E_OLD');
INSERT INTO OpeningSets VALUES ('OB1','F1','ยอดยกมา','E_OLD','2026-01-01','A_OLD','[{"kind":"ACC","account_id":"A_OLD","amount":10},{"kind":"CAT","category_id":"CAT_OLD","contact_id":"C_OLD","amount":5},{"kind":"ACC","account_id":"A2","amount":1}]');
INSERT INTO AssetItems VALUES ('AS1','F1','A_OLD','CAT_OLD','E_OLD','CAT_OLD');
INSERT INTO Debts VALUES ('DB1','F1','C_OLD','CAT_OLD','CAT_OLD','CAT2');
INSERT INTO InsurancePolicies VALUES ('IP1','F1','CAT_OLD','C_OLD','E_OLD');
INSERT INTO DriveFiles VALUES ('DF1','F1','A_OLD');
INSERT INTO TripStops VALUES ('ts','A_OLD');`);
const toD1 = sql => { const st = { _args: [], bind(...a) { st._args = a; return st; }, async first() { return db.prepare(sql).get(...st._args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st._args) }; }, async run() { const r = db.prepare(sql).run(...st._args); return { meta: { changes: Number(r.changes) } }; } }; return st; };
/* batch = transaction เดียว เหมือน D1 */
const env = { DB: { prepare: toD1, batch: async ops => { db.exec('BEGIN'); try { for (const o of ops) await o.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
const hashTok = async t => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('base64url');
db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok('tok-North'), 'North', '2099-01-01T00:00:00Z');
const save = async b => { const res = await worker.fetch(new Request('https://w.test/api/settings/save', { method: 'POST', headers: { Authorization: 'Bearer tok-North', 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, {}); let j = null; try { j = await res.json(); } catch {} return { s: res.status, j }; };
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0, 400)); } };
const one = sql => db.prepare(sql).get();
const cnt = (sql) => db.prepare(sql).get().n;

// ── บัญชี
let r = await save({ type: 'account', old_id: 'A_OLD', new_id: 'A15', name: '[A15] KBank', entity_id: 'E_OLD' });
check('account 200', r.s === 200 && r.j.success, r);
check('account ตามไปครบ', cnt(`SELECT (SELECT COUNT(*) FROM Transactions WHERE account_id='A15')+(SELECT COUNT(*) FROM AccountCheckpoints WHERE account_id='A15')+(SELECT COUNT(*) FROM StatementImports WHERE account_id='A15')+(SELECT COUNT(*) FROM AutoRules WHERE account_id='A15')+(SELECT COUNT(*) FROM AssetItems WHERE account_id='A15')+(SELECT COUNT(*) FROM DriveFiles WHERE account_id='A15')+(SELECT COUNT(*) FROM OpeningSets WHERE anchor_account_id='A15') AS n`) === 7);
check('ไม่มีรหัสเก่าเหลือ', cnt(`SELECT COUNT(*) n FROM Accounts WHERE account_id='A_OLD'`) === 0 && !one(`SELECT lines FROM OpeningSets`).lines.includes('A_OLD'), one(`SELECT lines FROM OpeningSets`));
check('ยอดยกมา JSON บัญชีอื่นไม่แตะ', JSON.parse(one(`SELECT lines FROM OpeningSets`).lines)[2].account_id === 'A2');
check('ตารางทริปไม่แตะ', one(`SELECT account_id a FROM TripStops`).a === 'A_OLD');
check('ส่งรายชื่อที่แตะกลับมา', (r.j.cascade || []).includes('AccountCheckpoints.account_id'), r.j);

// ── Company (มี FK จริง: Accounts / UserPermissions / TransactionDetails)
r = await save({ type: 'entity', old_id: 'E_OLD', new_id: 'Ent_North', name: 'North', is_company: 0 });
check('entity 200', r.s === 200, r);
check('entity ตามไปครบ', cnt(`SELECT (SELECT COUNT(*) FROM Accounts WHERE entity_id='Ent_North')+(SELECT COUNT(*) FROM Accounts WHERE tx_entity_id='Ent_North')+(SELECT COUNT(*) FROM UserPermissions WHERE entity_id='Ent_North')+(SELECT COUNT(*) FROM TransactionDetails WHERE entity_id='Ent_North')+(SELECT COUNT(*) FROM Captions WHERE default_entity_id='Ent_North')+(SELECT COUNT(*) FROM Categories WHERE default_entity_id='Ent_North')+(SELECT COUNT(*) FROM AutoRules WHERE entity_id='Ent_North')+(SELECT COUNT(*) FROM OpeningSets WHERE entity_id='Ent_North')+(SELECT COUNT(*) FROM AssetItems WHERE entity_id='Ent_North')+(SELECT COUNT(*) FROM InsurancePolicies WHERE entity_id='Ent_North') AS n`) === 10);
check('FK ยังถูกต้อง', db.prepare('PRAGMA foreign_key_check').all().length === 0, db.prepare('PRAGMA foreign_key_check').all());

// ── หมวด
r = await save({ type: 'category', old_id: 'CAT_OLD', new_id: 'EX_FOOD', name: 'อาหาร', category_type: 'CAP_OLD', default_entity_id: 'Ent_North', default_contact_id: 'C_OLD' });
check('category 200', r.s === 200, r);
check('category ตามไปครบ', cnt(`SELECT (SELECT COUNT(*) FROM TransactionDetails WHERE category_id='EX_FOOD')+(SELECT COUNT(*) FROM AutoRules WHERE category_id='EX_FOOD')+(SELECT COUNT(*) FROM AssetItems WHERE category_id='EX_FOOD')+(SELECT COUNT(*) FROM AssetItems WHERE expense_category_id='EX_FOOD')+(SELECT COUNT(*) FROM Debts WHERE category_id='EX_FOOD')+(SELECT COUNT(*) FROM Debts WHERE interest_category_id='EX_FOOD')+(SELECT COUNT(*) FROM InsurancePolicies WHERE category_id='EX_FOOD') AS n`) === 7);
check('category JSON', JSON.parse(one(`SELECT lines FROM OpeningSets`).lines)[1].category_id === 'EX_FOOD');
check('Debts หมวดอื่นไม่แตะ', one(`SELECT principal_category_id p FROM Debts`).p === 'CAT2');

// ── คู่ค้า
r = await save({ type: 'contact', old_id: 'C_OLD', new_id: 'SUP01', name: 'ร้าน ก', contact_type: 'SUPPLIER' });
check('contact 200', r.s === 200, r);
check('contact ตามไปครบ', cnt(`SELECT (SELECT COUNT(*) FROM TransactionDetails WHERE contact_id='SUP01')+(SELECT COUNT(*) FROM Captions WHERE default_contact_id='SUP01')+(SELECT COUNT(*) FROM Categories WHERE default_contact_id='SUP01')+(SELECT COUNT(*) FROM AutoRules WHERE contact_id='SUP01')+(SELECT COUNT(*) FROM Debts WHERE contact_id='SUP01')+(SELECT COUNT(*) FROM InsurancePolicies WHERE contact_id='SUP01') AS n`) === 6);
check('contact JSON', JSON.parse(one(`SELECT lines FROM OpeningSets`).lines)[1].contact_id === 'SUP01');

// ── Caption
r = await save({ type: 'caption', old_id: 'CAP_OLD', new_id: 'CAP_EXP', name: 'Expense', category_type: 'EXPENSE', default_entity_id: 'Ent_North', default_contact_id: 'SUP01' });
check('caption 200', r.s === 200, r);
check('ค่าอื่นของบัญชีไม่หาย (tx_entity_id)', one(`SELECT tx_entity_id t FROM Accounts WHERE account_id='A15'`).t === 'Ent_North');
check('caption ตาม', cnt(`SELECT COUNT(*) n FROM Categories WHERE caption_id='CAP_EXP'`) === 2 && cnt(`SELECT COUNT(*) n FROM Captions WHERE type_id='CAP_OLD'`) === 0);

// ── รหัสซ้ำ → ไม่เปลี่ยนอะไรเลย
r = await save({ type: 'account', old_id: 'A15', new_id: 'A2', name: 'x', entity_id: 'Ent_North' });
check('รหัสซ้ำ 400', r.s === 400 && /มีอยู่แล้ว/.test(r.j.error), r);
check('รหัสซ้ำ ข้อมูลเดิมอยู่', cnt(`SELECT COUNT(*) n FROM Transactions WHERE account_id='A15'`) === 1);

// ── แก้แค่ชื่อ ไม่แตะตารางอื่น
r = await save({ type: 'account', old_id: 'A15', new_id: 'A15', name: '[A15] KBank ใหม่', entity_id: 'Ent_North' });
check('แก้ชื่อ', r.s === 200 && one(`SELECT name FROM Accounts WHERE account_id='A15'`).name === '[A15] KBank ใหม่' && (r.j.cascade || []).length === 0, r);
console.log(`id-cascade: ${ok} ผ่าน, ${bad} ไม่ผ่าน`); if (bad) process.exit(1);
