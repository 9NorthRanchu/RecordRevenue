// ทดสอบระบบปิดเดือน (2026-10-11 · 1ก ล็อกแน่น + 2ก ต้องผ่านครบ) — รัน: node backend/test/period.test.mjs
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

db.exec(fs.readFileSync(path.join(SRC, '..', 'db', 'migrations', '2026-10-11-period-close.sql'), 'utf8'));
db.exec(`INSERT OR IGNORE INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Other','Fam_Other','Other',0);
INSERT OR IGNORE INTO UserPermissions VALUES ('Puii','Ent_North');
INSERT OR IGNORE INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('TX-OLD','A02','2025-01-05',500,'CONFIRMED','WEB_GRID','9North','ยกมา'),
 ('TX-W','A02','2026-08-15',970,'CONFIRMED','WEB_GRID','9North','ค่าบริการ'),
 ('TX-CASH','A01','2026-08-20',-50,'CONFIRMED','WEB_GRID','9North','เงินสด'),
 ('TX-OCT','A02','2026-10-02',-30,'CONFIRMED','WEB_GRID','9North','ต.ค.');
INSERT OR IGNORE INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES
 ('D-OLD','TX-OLD',500,'T05','INCOME'),('D-W','TX-W',1000,'T05','INCOME'),('D-CASH','TX-CASH',-50,'T01','EXPENSE'),('D-OCT','TX-OCT',-30,'T01','EXPENSE');
UPDATE TransactionDetails SET wht = 30 WHERE detail_id='D-W';
UPDATE Accounts SET account_type='CASH' WHERE account_id='A01';`);
let ok = 0, bad = 0;
const M = '2026-08';
r = await call(`/api/inbox/periods/${M}/check`, { user: '9North' });
check('ยังไม่มี statement → ปิดไม่ได้', r.s === 200 && r.j.ok === false && r.j.items.find(i => i.key === 'statements')?.ok === false, r.j);
check('บัญชีเงินสดไม่ต้องมี statement', !r.j.accounts.some(a => a.account_id === 'A01'), r.j.accounts);
r = await call(`/api/inbox/periods/${M}/close`, { user: '9North', method: 'POST' });
check('กดปิดตอนยังไม่ผ่าน → 400 พร้อมรายการที่ต้องแก้ (5 ข้อ · ไม่มีชุดยอดยกมา = ผ่าน)', r.s === 400 && r.j.check?.items?.length === 5 && r.j.check.items.find(i => i.key === 'opening')?.ok === true, r);
db.prepare(`INSERT INTO LedgerStatements (stmt_id,family_id,account_id,period_from,period_to,closing_balance,lines) VALUES (?,?,?,?,?,?,?)`)
  .run('ST-1', 'Fam_Default', 'A02', '2026-08-01', '2026-08-31', 1400, JSON.stringify([{ line_id: 'L1', date: '2026-08-15', amount: 970, status: 'NEW' }]));
r = await call(`/api/inbox/periods/${M}/check`, { user: '9North' });
const a02 = r.j.accounts.find(a => a.account_id === 'A02');
check('บรรทัด statement ยังไม่จับคู่ → ไม่ผ่าน', a02 && /ไม่ได้จับคู่/.test(a02.problem), a02);
db.prepare(`UPDATE LedgerStatements SET lines=? WHERE stmt_id='ST-1'`).run(JSON.stringify([{ line_id: 'L1', date: '2026-08-15', amount: 970, status: 'MATCHED' }]));
r = await call(`/api/inbox/periods/${M}/check`, { user: '9North' });
check('ยอดไม่ตรง → ไม่ผ่าน และบอกตัวเลข', /ยอดไม่ตรง/.test(r.j.accounts.find(a => a.account_id === 'A02')?.problem || ''), r.j.accounts);
db.prepare(`UPDATE LedgerStatements SET closing_balance=1470 WHERE stmt_id='ST-1'`).run();
r = await call(`/api/inbox/periods/${M}/check`, { user: '9North' });
check('ครบทุกข้อ → ผ่าน', r.j.ok === true, r.j);
r = await call(`/api/inbox/periods/${M}/close`, { user: 'Puii', method: 'POST' }); check('สมาชิกทั่วไปปิดไม่ได้ (403)', r.s === 403, r);
r = await call(`/api/inbox/periods/2026-10/close`, { user: '9North', method: 'POST' }); check('ปิดเดือนปัจจุบันไม่ได้', r.s === 400, r);
r = await call(`/api/inbox/periods/${M}/close`, { user: '9North', method: 'POST' }); check('ผู้ดูแลปิดเดือนได้', r.s === 200 && r.j.ok, r);
const snap = JSON.parse(db.prepare(`SELECT snapshot FROM LedgerPeriods WHERE family_id='Fam_Default' AND period=?`).get(M).snapshot);
check('เก็บยอดสิ้นเดือนไว้ (A02 = 1,470)', snap.accounts.find(a => a.account_id === 'A02')?.balance === 1470, snap);
// ── ล็อกทุกทาง ──
const txW = () => db.prepare(`SELECT total_amount, date FROM Transactions WHERE transaction_id='TX-W'`).get();
r = await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'TX-W', account_id: 'A02', date: '2026-08-15', total_amount: 999, source: 'WEB_GRID', status: 'CONFIRMED', details: [{ detail_id: 'D-W', amount: 999, category_id: 'T05' }] } });
check('แอปเดิม: แก้รายการในเดือนที่ปิด → 409', r.s === 409 && /ปิดบัญชีแล้ว/.test(r.j.error) && txW().total_amount === 970, r);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'TX-W', account_id: 'A02', date: '2026-10-05', total_amount: 970, source: 'WEB_GRID', status: 'CONFIRMED', details: [{ detail_id: 'D-W', amount: 1000, wht: 30, category_id: 'T05' }] } });
check('แอปเดิม: ย้ายรายการออกจากเดือนที่ปิด → 409', r.s === 409 && txW().date === '2026-08-15', r);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'TX-OCT', account_id: 'A02', date: '2026-08-10', total_amount: -30, source: 'WEB_GRID', status: 'CONFIRMED', details: [{ detail_id: 'D-OCT', amount: -30, category_id: 'T01' }] } });
check('แอปเดิม: ย้ายรายการเข้าเดือนที่ปิด → 409', r.s === 409, r);
r = await call('/api/inbox/tx/TX-W/edit', { user: '9North', method: 'POST', body: { details: [{ amount: 1000, wht: 30, category_id: 'T01' }] } });
check('หน้าประวัติใหม่: แก้หมวดในเดือนที่ปิด → 409 ข้อความอ่านรู้เรื่อง', r.s === 409 && r.j.code === 'PERIOD_CLOSED', r);
r = await call('/api/inbox/tx/TX-W/delete', { user: '9North', method: 'POST' });
check('ลบรายการในเดือนที่ปิด → 409 และยังอยู่', r.s === 409 && !!txW(), r);
r = await call('/api/inbox/manual', { user: '9North', method: 'POST', body: { account_id: 'A02', date: '2026-08-20', amount: -10, note: 'ลืมจด', category_id: 'T01', confirm: true } });
check('เพิ่มรายการใหม่ลงเดือนที่ปิด → 409', r.s === 409, r);
r = await call('/api/inbox/manual', { user: '9North', method: 'POST', body: { account_id: 'A02', date: '2026-10-06', amount: -10, note: 'ต.ค.', category_id: 'T01', confirm: true } });
check('เดือนที่ยังเปิด ยังบันทึกได้ปกติ', r.s === 200 || r.s === 201, r);
r = await call('/api/settlements', { user: '9North', method: 'POST', body: { parent_detail_id: 'D-W', child_detail_id: 'D-OCT', settled_amount: 5 } });
check('ตัดชำระหนี้เก่า (เดือนที่ปิด) ด้วยรายการเดือนนี้ → ได้', r.s === 200, r);
r = await call('/api/settlements', { user: '9North', method: 'POST', body: { parent_detail_id: 'D-OCT', child_detail_id: 'D-W', settled_amount: 5 } });
check('ใช้รายการในเดือนที่ปิดเป็นรายการชำระ → 409', r.s === 409, r);
r = await call('/api/restore/full', { user: '9North', method: 'POST', body: { mode: 'replace' } });
check('มีเดือนที่ปิด → กู้ข้อมูลไม่ได้', r.s === 409 && /เปิดเดือนก่อน/.test(r.j.error), r);
// ── เปิดเดือน ──
r = await call(`/api/inbox/periods/${M}/reopen`, { user: '9North', method: 'POST', body: {} }); check('เปิดเดือนต้องใส่เหตุผล', r.s === 400, r);
r = await call(`/api/inbox/periods/${M}/reopen`, { user: 'Puii', method: 'POST', body: { reason: 'แก้ค่า' } }); check('สมาชิกทั่วไปเปิดเดือนไม่ได้', r.s === 403, r);
r = await call(`/api/inbox/periods/${M}/reopen`, { user: '9North', method: 'POST', body: { reason: 'ลูกค้าแจ้งยอดผิด' } }); check('ผู้ดูแลเปิดเดือนได้', r.s === 200, r);
r = await call('/api/inbox/tx/TX-W/edit', { user: '9North', method: 'POST', body: { details: [{ amount: 1000, wht: 30, category_id: 'T05', contact_id: 'CT1', note: 'แก้หลังเปิดเดือน' }] } });
check('เปิดแล้วแก้ได้', r.s === 200, r);
r = await call('/api/inbox/periods', { user: '9North' });
const aug = r.j.months.find(m => m.month === M);
check('รายการเดือนแสดงสถานะ + ประวัติปิด/เปิดพร้อมเหตุผล', aug?.status === 'OPEN' && r.j.log.length === 2 && r.j.log.some(l => l.action === 'REOPEN' && l.note === 'ลูกค้าแจ้งยอดผิด') && r.j.is_admin === true, r.j);
// ── ล้างข้อมูล (2026-10-12) ──
db.exec(`INSERT OR REPLACE INTO LedgerPeriods (family_id, period, status) VALUES ('Fam_Default','2026-08','CLOSED')`);
const famTx = () => db.prepare(`SELECT COUNT(*) n FROM Transactions t JOIN Accounts a ON a.account_id=t.account_id JOIN Entities e ON e.entity_id=a.entity_id WHERE e.family_id='Fam_Default'`).get().n;
const otherTx = () => db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE account_id='X99'`).get().n;
const before = famTx();
r = await call('/api/reset', { user: 'Puii', method: 'POST', body: { scope: 'transactions', confirm: 'RESET' } }); check('ล้างข้อมูล: สมาชิกทั่วไป → 403', r.s === 403, r);
r = await call('/api/reset', { user: '9North', method: 'POST', body: { scope: 'transactions', preview: true } });
check('ล้างข้อมูล: preview บอกจำนวน + เดือนที่ปิด ไม่ลบอะไร', r.s === 200 && r.j.transactions === before && r.j.closed_periods.includes('2026-08') && famTx() === before, r.j);
r = await call('/api/reset', { user: '9North', method: 'POST', body: { scope: 'transactions' } }); check('ล้างข้อมูล: ไม่พิมพ์ RESET → 400', r.s === 400, r);
r = await call('/api/reset', { user: '9North', method: 'POST', body: { scope: 'transactions', confirm: 'RESET' } });
check('ล้างข้อมูล: มีเดือนปิด ไม่ยืนยันเปิด → 409 ไม่ลบอะไร', r.s === 409 && r.j.code === 'HAS_CLOSED' && famTx() === before, r);
r = await call('/api/reset', { user: '9North', method: 'POST', body: { scope: 'transactions', confirm: 'RESET', reopen_closed: true } });
check('ล้างธุรกรรม: ลบครบ (รวมเดือนที่ปิด) · ครอบครัวอื่นไม่โดน · หมวดยังอยู่', r.s === 200 && famTx() === 0 && otherTx() === 1
  && db.prepare(`SELECT COUNT(*) n FROM Categories WHERE family_id='Fam_Default'`).get().n > 0 && !db.prepare(`SELECT 1 FROM LedgerPeriods WHERE family_id='Fam_Default'`).get(), r);
check('ล้างธุรกรรม: บันทึกประวัติการเปิดเดือนอัตโนมัติ', !!db.prepare(`SELECT 1 FROM LedgerPeriodLog WHERE family_id='Fam_Default' AND period='2026-08' AND note LIKE 'เปิดอัตโนมัติก่อนล้างข้อมูล%'`).get(), 0);
r = await call('/api/reset', { user: '9North', method: 'POST', body: { scope: 'all', confirm: 'RESET' } });
check('ล้างทั้งหมด: ข้อมูลหลักหาย · ผู้ใช้ยังอยู่ · ครอบครัวอื่นไม่โดน', r.s === 200 && db.prepare(`SELECT COUNT(*) n FROM Categories WHERE family_id='Fam_Default'`).get().n === 0
  && db.prepare(`SELECT COUNT(*) n FROM Users WHERE family_id='Fam_Default'`).get().n === 2 && otherTx() === 1 && db.prepare(`SELECT COUNT(*) n FROM Categories WHERE family_id='Fam_Other'`).get().n === 1, r);
console.log(`${bad ? '❌' : '✅'} ผ่าน ${ok} · ไม่ผ่าน ${bad}`);
if (bad) process.exit(1);
