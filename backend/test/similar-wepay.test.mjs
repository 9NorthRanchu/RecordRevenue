// ทดสอบ รายการใกล้เคียง + wePAY — รัน: node backend/test/similar-wepay.test.mjs
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
{ const { normDt } = await import(pathToFileURL(path.join(TMP, 'wepay.js')).href);
  check('wePAY วันเวลา: ช่องว่างแทน T / ไม่มีวินาที / ปี พ.ศ.', normDt('2026-03-03 21:06') === '2026-03-03T21:06:00' && normDt('2569-03-03T21:06:06') === '2026-03-03T21:06:06' && normDt('x') === null, null); }
/* 🩹 AI ตอบ JSON เพี้ยน → ซ่อม (2026-10-31) */
{ const { parseAiJson } = await import(pathToFileURL(path.join(TMP, 'ai-json.js')).href);
  check('JSON ปกติ / มี ``` / comma ท้าย', parseAiJson('{"a":1}').a === 1 && parseAiJson('```json\n{"a":2}\n```').a === 2 && parseAiJson('{"transactions":[{"x":1},],"closing_balance":5}').closing_balance === 5, null);
  const r1 = parseAiJson('{"account_number":"123","transactions":[{"date":"2026-01-01","amount":10},{"date":"2026-01-02" "amount":20},{"date":"2026-01-03","amount":30}],"closing_balance":99}');
  check('แถวที่เสียตัดทิ้ง เก็บแถวอื่น + ยอดยกไป', r1.transactions.length === 2 && r1.closing_balance === 99 && r1._repaired === 1, r1);
  const r2 = parseAiJson('{"screen":"history","items":[{"amount":10},{"amount":20},{"amo');
  check('AI ตอบไม่จบ → เก็บแถวที่ครบ', r2.items.length === 2, r2);
  let threw = false; try { parseAiJson('ไม่ใช่ JSON'); } catch (e) { threw = e instanceof SyntaxError; } check('อ่านไม่ได้เลย → SyntaxError (ให้ AI อ่านใหม่)', threw, null); }
db.exec(`INSERT INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Other','Fam_Other','Other',0);
INSERT INTO Contacts (contact_id,family_id,name) VALUES ('CT1','Fam_Default','สำนักงานเขตประเวศ');
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('O1','A02','2026-05-10',-584.09,'CONFIRMED','PDF_IMPORT','9North','จ่ายบิล สำนักงานเขตประเวศ 5034101869'),
 ('O2','A02','2026-06-10',-600,'CONFIRMED','PDF_IMPORT','9North','จ่ายบิล สำนักงานเขตประเวศ 5034101869'),
 ('O3','A02','2026-06-11',-120,'CONFIRMED','PDF_IMPORT','9North','SHOPEEFOOD BANGKOK'),
 ('O4','X99','2026-06-11',-600,'CONFIRMED','PDF_IMPORT','Other','จ่ายบิล สำนักงานเขตประเวศ'),
 ('P1','A02','2026-10-28',-584.09,'PENDING_REVIEW','PDF_IMPORT','9North','จ่ายบิล สำนักงานเขตประเวศ 5034109999');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,entity_id,contact_id,note,type) VALUES
 ('d1','O1',-584.09,'T05','Ent_North','CT1','ภาษีที่ดิน','EXPENSE'),('d2','O2',-600,'T05','Ent_North','CT1','ภาษีที่ดิน','EXPENSE'),
 ('d3','O3',-120,'T01','Ent_North',NULL,'ข้าว','EXPENSE'),('d4','O4',-600,'T05',NULL,NULL,'ลับ','EXPENSE'),('d5','P1',-584.09,'Cat_Uncategorized',NULL,NULL,NULL,'EXPENSE');`);
r = await call('/api/transactions/similar?desc=' + encodeURIComponent('จ่ายบิล สำนักงานเขตประเวศ 5034109999') + '&amount=584.09&account_id=A02&exclude=P1', { user: '9North' });
check('เจอรายการเดิมของผู้รับเดียวกัน (ไม่ดูยอดเงิน)', r.s === 200 && r.j.items.some(x => x.transaction_id === 'O1') && r.j.items.some(x => x.transaction_id === 'O2') && !r.j.items.some(x => x.transaction_id === 'O3'), r.j);
check('ไม่เห็นของครอบครัวอื่น · ไม่รวมตัวเอง', !r.j.items.some(x => ['O4', 'P1'].includes(x.transaction_id)), r.j.items.map(x => x.transaction_id));
check('สรุปที่ใช้บ่อย: หมวด T05 + คู่ค้า CT1 (2 ครั้ง)', r.j.summary?.category_id === 'T05' && r.j.summary?.contact_id === 'CT1' && r.j.summary.n === 2 && r.j.summary.note === 'ภาษีที่ดิน', r.j.summary);
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES ('O5','A02','2026-07-01',-584.09,'CONFIRMED','PDF_IMPORT','9North','GRAB TAXI');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('d6','O5',-584.09,'T01','EXPENSE');`);
r = await call('/api/transactions/similar?desc=' + encodeURIComponent('จ่ายบิล สำนักงานเขตประเวศ 5034109999') + '&amount=584.09&account_id=A02&exclude=P1', { user: '9North' });
check('ยอดเท่ากันแต่คนละผู้รับ → ไม่ขึ้นในประวัติ', !r.j.items.some(x => x.transaction_id === 'O5'), r.j.items.map(x => x.transaction_id));
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES ('O6','A02','2026-10-27',-584.09,'CONFIRMED','PDF_IMPORT','9North','จ่ายบิล สำนักงานเขตประเวศ 5034109999'),('O7','A02','2026-10-28',-584.09,'CONFIRMED','WEB_GRID','9North','โอนเงิน'),('O8','A02','2026-10-28',-584.09,'CONFIRMED','WEB_GRID','9North','KFC'),('O9','A02','2026-10-28',584.09,'CONFIRMED','WEB_GRID','9North','จ่ายบิล สำนักงานเขตประเวศ');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('d7','O6',-584.09,'T05','EXPENSE'),('d8','O7',-584.09,'T01','EXPENSE'),('d9','O8',-584.09,'T01','EXPENSE'),('d10','O9',584.09,'T01','INCOME');`);
r = await call('/api/transactions/similar?sign=-1&date=2026-10-28&desc=' + encodeURIComponent('จ่ายบิล สำนักงานเขตประเวศ 5034109999') + '&amount=584.09&account_id=A02&exclude=P1', { user: '9North' });
const dids = (r.j.dup || []).map(x => x.transaction_id);
check('อาจซ้ำ: ผู้รับเดียวกันยอดเท่ากัน + บัญชีเดียวกันวันเดียวกัน · ไม่เอารายการรับ/วันไกล', dids.includes('O6') && dids.includes('O7') && !dids.includes('O9') && !dids.includes('O1') && !dids.includes('O5'), dids);
r = await call('/api/transactions/similar?sign=-1&desc=' + encodeURIComponent('จ่ายบิล สำนักงานเขตประเวศ') + '&amount=584.09&account_id=A02&exclude=P1', { user: '9North' });
check('ไม่ส่งวันที่ → ไม่เช็คซ้ำ', !(r.j.dup || []).length, r.j.dup);
db.exec(`DELETE FROM Transactions WHERE transaction_id IN ('O6','O7','O8','O9'); DELETE FROM TransactionDetails WHERE detail_id IN ('d7','d8','d9','d10');`);
r = await call('/api/transactions/similar?name=' + encodeURIComponent('สำนักงานเขตประเวศ'), { user: '9North' }); check('ค้นจากชื่อผู้รับในสลิป', r.j.items.length >= 2, r.j);
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('Q1','A02','2026-07-01',-80,'CONFIRMED','PDF_IMPORT','9North','ชำระเงิน K PLUS เพื่อชำระ Ref X1234 SCB มณี SHOP ลูกชิ้น'),('Q2','A02','2026-07-02',-60,'CONFIRMED','PDF_IMPORT','9North','ชำระเงิน K PLUS เพื่อชำระ Ref X9999 SCB มณี SHOP ลูกชิ้น');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('dq1','Q1',-80,'T02','EXPENSE'),('dq2','Q2',-60,'T02','EXPENSE');`);
r = await call('/api/transactions/similar?sign=-1&desc=' + encodeURIComponent('ชำระเงิน K PLUS เพื่อชำระ Ref X5555 NOODLE'), { user: '9North' });
check('คำทั่วไปของธนาคาร (ชำระเงิน/เพื่อชำระ/Ref) ไม่ทำให้ร้านอื่นมาเป็นประวัติ', !r.j.items.some(x => ['Q1', 'Q2'].includes(x.transaction_id)) && !r.j.summary, r.j);
r = await call('/api/transactions/similar?sign=-1&desc=' + encodeURIComponent('ชำระเงิน K PLUS เพื่อชำระ Ref X7777 SCB มณี SHOP ลูกชิ้น'), { user: '9North' });
check('ร้านเดียวกันยังเจอ', r.j.items.some(x => x.transaction_id === 'Q1') && r.j.summary?.category_id === 'T02', r.j.summary);
db.exec(`DELETE FROM Transactions WHERE transaction_id IN ('Q1','Q2'); DELETE FROM TransactionDetails WHERE detail_id IN ('dq1','dq2');`);
r = await call('/api/transactions/similar?desc=xx', { user: '9North' }); check('ไม่มีคำค้น → ว่าง', r.j.items.length === 0, r.j);
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('P2','A02','2026-10-29',-300,'PENDING_REVIEW','PDF_IMPORT','9North','จ่ายบิล สำนักงานเขตประเวศ 5034101111'),('P3','A02','2026-10-29',-50,'PENDING_REVIEW','PDF_IMPORT','9North','SHOPEEFOOD BANGKOK'),
 ('P4','X99','2026-10-29',-300,'PENDING_REVIEW','PDF_IMPORT','Other','จ่ายบิล สำนักงานเขตประเวศ');`);
r = await call('/api/transactions/similar?include_pending=1&sign=-1&desc=' + encodeURIComponent('จ่ายบิล สำนักงานเขตประเวศ 5034109999') + '&exclude=P1', { user: '9North' });
check('รอตรวจอื่นที่เป็นผู้รับเดียวกัน', r.j.pending.map(x => x.transaction_id).join() === 'P2', r.j.pending);
/* wePAY */
env.__wepayOverride = async () => ({ screen: 'history', items: [{ kind: 'topup', phone: '064-936-4168', operator: 'AIS', amount: 10, refund: 0.1, datetime: '2025-11-03T10:56:24' }, { kind: 'topup', amount: 10, datetime: null }] });
let res = await worker.fetch(new Request('https://w.test/api/wepay/read', { method: 'POST', headers: { Authorization: 'Bearer tok-9North', 'Content-Type': 'image/jpeg' }, body: new Uint8Array([1, 2]) }), env, {});
let j = await res.json(); check('wePAY อ่านรูป → แถวที่ครบ', res.status === 200 && j.items.length === 1 && j.items[0].phone === '0649364168' && j.items[0].refund === 0.1, j);
res = await worker.fetch(new Request('https://w.test/api/wepay/read', { method: 'POST', headers: { Authorization: 'Bearer tok-9North', 'Content-Type': 'application/pdf' }, body: new Uint8Array([1]) }), env, {});
check('wePAY รับเฉพาะรูป', res.status === 400, res.status);
/* 📝 เติมเบอร์ใน detail รายการ wePAY ที่รอตรวจ */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
  ('WN1','A02','2026-03-03',-9.9,'PENDING_REVIEW','PDF_IMPORT','9North','wePAY เติมเงิน AIS 0629899354'),('WN2','A02','2026-03-03',-4.85,'PENDING_REVIEW','PDF_IMPORT','9North','wePAY แพ็กเกจ 0996399153'),
  ('WN3','A02','2026-03-03',100,'PENDING_REVIEW','PDF_IMPORT','9North','wePAY เติมเงินเข้ากระเป๋า (คงเหลือ 105.97)'),('WN4','X99','2026-03-03',-9.9,'PENDING_REVIEW','PDF_IMPORT','Other','wePAY เติมเงิน 0811111111');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type,note) VALUES ('dn1','WN1',-9.9,'T01','EXPENSE','เติม 10.00 ได้คืน 0.10'),('dn2','WN2',-4.85,'T01','EXPENSE','เติม 5.00 ได้คืน 0.15'),
  ('dn3','WN3',100,'T01','TRANSFER',NULL),('dn4','WN4',-9.9,'T01','EXPENSE','เติม 10.00 ได้คืน 0.10');`);
r = await call('/api/wepay/fix-notes', { user: '9North', method: 'POST' });
const nt = id => db.prepare(`SELECT note FROM TransactionDetails WHERE detail_id = ?`).get(id).note;
check('เติมเบอร์ใน detail: เติมเงิน/แพ็กเกจ · ไม่แตะเงินเข้ากระเป๋า · ไม่แตะครอบครัวอื่น', r.j?.fixed === 2 && nt('dn1') === 'เติม 0629899354 10.00 ได้คืน 0.10' && nt('dn2') === 'แพ็กเกจ 0996399153 5.00 ได้คืน 0.15' && nt('dn3') === null && nt('dn4') === 'เติม 10.00 ได้คืน 0.10', [r.j, nt('dn1'), nt('dn2')]);
r = await call('/api/wepay/fix-notes', { user: '9North', method: 'POST' }); check('ทำซ้ำไม่แก้ซ้ำ', r.j?.fixed === 0, r.j);
console.log(`similar-wepay: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exit(1);
