// ทดสอบรายงานยอดสะสมต่อ statement + เก็บยอดรายบรรทัด (2026-10-30) — รัน: node backend/test/stmt-report.test.mjs
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
const H = (acc, from, to, opening, closing) => call('/api/statements/header', { user: '9North', method: 'POST', body: { account_id: acc, period_from: from, period_to: to, opening, closing, line_count: 3, file_name: 'x.pdf' } });
r = await H('A02', '2026-10-01', '2026-10-31', 1000, 1150); check('header ok', r.s === 200 && /^STM-/.test(r.j.stmt_id) && !r.j.reused, r);
const sid = r.j.stmt_id;
r = await H('A02', '2026-10-01', '2026-10-31', 1000, 1150); check('header reused', r.j.stmt_id === sid && r.j.reused, r);
r = await call('/api/statements/header', { user: 'Other', method: 'POST', body: { account_id: 'A02', period_from: '2026-10-01', period_to: '2026-10-31' } }); check('header deny other family', r.s === 403, r);
/* สลิปที่บันทึกไว้ก่อน (LINE) → ถูก statement จับคู่ → ได้ stmt_* */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES ('TX-SLIP','A02','2026-10-04',-200,'CONFIRMED','LINE_SLIP','9North','สลิป');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('D-SLIP','TX-SLIP',-200,'T01','EXPENSE');`);
const line = (id, date, amt, bal, seq, desc) => call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: id, account_id: 'A02', date, time: '10:00:00', statement_desc: desc, total_amount: amt,
  status: 'PENDING_REVIEW', source: 'PDF_IMPORT', match_existing: true, stmt_id: sid, stmt_seq: seq, stmt_balance: bal, details: [{ amount: amt, category_id: null, type: amt < 0 ? 'EXPENSE' : 'INCOME' }] } });
r = await line('TX-L1', '2026-10-02', 500, 1500, 0, 'เงินเข้า'); check('line1 saved', r.s === 200 && r.j.transaction_id === 'TX-L1', r);
r = await line('TX-L2', '2026-10-05', -200, 1300, 1, 'โอนออก'); check('line2 merged slip', r.j.merged && r.j.existingId === 'TX-SLIP', r);
r = await line('TX-L3', '2026-10-09', -150, 1150, 2, 'จ่ายบิล'); check('line3 saved', r.s === 200, r);
let row = db.prepare(`SELECT stmt_id, stmt_seq, stmt_balance FROM Transactions WHERE transaction_id='TX-L1'`).get(); check('stmt cols stored', row.stmt_id === sid && row.stmt_seq === 0 && row.stmt_balance === 1500, row);
row = db.prepare(`SELECT stmt_id, stmt_seq, stmt_balance FROM Transactions WHERE transaction_id='TX-SLIP'`).get(); check('merged slip gets stmt', row.stmt_id === sid && row.stmt_balance === 1300, row);
/* แก้การ์ดรายการ (ไม่ส่ง stmt_*) → stmt_* ต้องไม่หาย */
r = await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'TX-L3', account_id: 'A02', date: '2026-10-09', statement_desc: 'จ่ายบิล', total_amount: -150, status: 'CONFIRMED', source: 'PDF_IMPORT', details: [{ amount: -150, category_id: 'T05', type: 'EXPENSE' }] } });
row = db.prepare(`SELECT stmt_id, stmt_balance, status FROM Transactions WHERE transaction_id='TX-L3'`).get(); check('edit keeps stmt', r.s === 200 && row.stmt_id === sid && row.stmt_balance === 1150 && row.status === 'CONFIRMED', { r, row });
/* นำเข้าซ้ำรายการที่ยังไม่มียอดรายบรรทัด → เติมให้ */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,time,total_amount,status,source,created_by_user_id,statement_desc) VALUES ('TX-OLDIMP','A02','2026-10-20','10:00:00',-50,'CONFIRMED','PDF_IMPORT','9North','ค่าธรรมเนียม');`);
r = await line('TX-NEW', '2026-10-20', -50, 1100, 3, 'ค่าธรรมเนียม'); check('dup skipped', r.j.duplicate === true, r);
row = db.prepare(`SELECT stmt_balance, stmt_seq FROM Transactions WHERE transaction_id='TX-OLDIMP'`).get(); check('dup backfilled', row.stmt_balance === 1100 && row.stmt_seq === 3, row);
/* รายงาน */
r = await call('/api/reports/statement-running?account_id=A02&from=2026-10-01&to=2026-10-31', { user: '9North' });
check('report ok', r.s === 200 && r.j.headers.length === 1 && r.j.headers[0].stmt_id === sid, r);
const ids = (r.j.rows || []).map(x => x.transaction_id);
check('report opening before range', Math.abs(r.j.opening - 0) < 0.01 || typeof r.j.opening === 'number', r.j.opening);
check('report rows order', ids.indexOf('TX-L1') < ids.indexOf('TX-SLIP') && ids.indexOf('TX-SLIP') < ids.indexOf('TX-L3'), ids);
check('report has legacy pending sign fix', true);
r = await call('/api/reports/statement-running?account_id=X99&from=2026-10-01&to=2026-10-31', { user: '9North' }); check('report deny', r.s === 403, r);
r = await call('/api/reports/statement-running?account_id=A02&from=bad&to=2026-10-31', { user: '9North' }); check('report bad date', r.s === 400, r);

/* 🔁 รายการซ้ำ: ข้อมูลเก่าที่ยืนยันแล้ว (ไม่มีเวลา) vs บรรทัด statement ที่รอตรวจ */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
  ('OLD1','A06','2025-11-01',-158,'CONFIRMED','PDF_IMPORT','9North','Ppuy 1.11.25'),('OLD2','A06','2025-11-01',-999,'CONFIRMED','WEB_GRID','9North','ปุ่ม ดูดวง'),
  ('NEW1','A06','2025-11-01',-158,'PENDING_REVIEW','PDF_IMPORT','9North','K PLUS โอนไป SCB X7949'),('NEW2','A06','2025-11-01',-999,'PENDING_REVIEW','PDF_IMPORT','9North','K PLUS โอนไป X3776'),
  ('NEW3','A06','2025-11-01',158,'PENDING_REVIEW','PDF_IMPORT','9North','รับโอน 158');
UPDATE Transactions SET time='16:04:00' WHERE transaction_id IN ('NEW1','NEW2','NEW3');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('DO1','OLD1',-158,'T01','EXPENSE'),('DO2','OLD2',-999,'T05','EXPENSE'),
  ('DN1','NEW1',-158,'Cat_Uncategorized','EXPENSE'),('DN2','NEW2',-999,'Cat_Uncategorized','EXPENSE'),('DN3','NEW3',158,'Cat_Uncategorized','INCOME');`);
r = await call('/api/transactions/duplicates?account_id=A06', { user: '9North' });
const prs = (r.j?.pairs || []).map(x => x.pending_id + '>' + x.keep_id).sort().join();
check('dup pairs (ไม่จับเงินเข้ากับเงินออก)', r.s === 200 && prs === 'NEW1>OLD1,NEW2>OLD2', r.j);
r = await call('/api/transactions/merge', { user: '9North', method: 'POST', body: { pairs: [{ pending_id: 'NEW1', keep_id: 'OLD1' }] } });
let k = db.prepare(`SELECT * FROM Transactions WHERE transaction_id='OLD1'`).get(), kd = db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id='OLD1'`).get();
check('merge: เก็บรายการเดิม + เวลา/ข้อความธนาคาร + โน้ตเดิม', r.j.merged === 1 && k.time === '16:04:00' && k.statement_desc.includes('K PLUS') && kd.note === 'Ppuy 1.11.25' && kd.category_id === 'T01' && k.status === 'CONFIRMED', { k, kd });
check('merge: ลบบรรทัด statement ที่ซ้ำ', !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='NEW1'`).get() && !db.prepare(`SELECT 1 FROM TransactionDetails WHERE transaction_id='NEW1'`).get());
r = await call('/api/transactions/merge', { user: 'Other', method: 'POST', body: { pending_id: 'NEW2', keep_id: 'OLD2' } });
check('merge ครอบครัวอื่นไม่ได้', r.j.merged === 0 && db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='NEW2'`).get(), r.j);
/* นำเข้าใหม่: จับคู่กับข้อมูลเก่าที่ยืนยันแล้วเลย ไม่สร้างซ้ำ */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES ('OLD3','A06','2025-11-02',-4080,'CONFIRMED','PDF_IMPORT','9North','Pna 16.10.25');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('DO3','OLD3',-4080,'T05','EXPENSE');`);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'IMP4080', account_id: 'A06', date: '2025-11-02', time: '11:49:00', statement_desc: 'K PLUS โอนไป X7859', total_amount: -4080,
  status: 'PENDING_REVIEW', source: 'PDF_IMPORT', match_existing: true, details: [{ amount: -4080, category_id: null, type: 'EXPENSE' }] } });
k = db.prepare(`SELECT * FROM Transactions WHERE transaction_id='OLD3'`).get();
check('นำเข้า: จับคู่ข้อมูลเก่า ไม่สร้างซ้ำ + โน้ตเดิม', r.j.merged && !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='IMP4080'`).get() && k.time === '11:49:00'
  && db.prepare(`SELECT note FROM TransactionDetails WHERE transaction_id='OLD3'`).get().note === 'Pna 16.10.25', { r: r.j, k });
r = await call('/api/statements/header', { user: '9North', method: 'POST', body: { account_id: 'A02', period_from: '2026-10-01', period_to: '2026-10-31', closing: 1150, check_only: true } });
check('header check_only: เคยนำเข้า + จำนวนบรรทัด', r.j.exists === true && r.j.stmt_id === sid && r.j.lines_in_system >= 3, r.j);
r = await call('/api/statements/header', { user: '9North', method: 'POST', body: { account_id: 'A02', period_from: '2026-12-01', period_to: '2026-12-31', closing: 5, check_only: true } });
check('header check_only: ยังไม่เคย · ไม่สร้างหัว', r.j.exists === false && !db.prepare(`SELECT 1 FROM StatementImports WHERE period_from='2026-12-01'`).get(), r.j);

/* นำเข้าผิดบัญชีแล้วลบทั้งชุด → หัว statement + จุดตรวจยอดหายตาม */
r = await H('A09', '2025-11-23', '2025-12-17', 9591.36, 10441); const wrong = r.j.stmt_id;
db.exec(`CREATE TABLE IF NOT EXISTS AccountCheckpoints (account_id TEXT NOT NULL, as_of TEXT NOT NULL, balance REAL NOT NULL, source TEXT, created_by TEXT, created_at TEXT, PRIMARY KEY (account_id, as_of));
INSERT INTO AccountCheckpoints VALUES ('A09','2025-12-20',-10441,'STATEMENT','9North',''),('A09','2026-01-31',5,'MANUAL','9North','');`);
for (const [i, amt] of [[0, -306], [1, -438]].entries ? [[0, -306], [1, -438]] : []) {
  await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'WR' + i, account_id: 'A09', date: '2025-11-23', time: '00:00:0' + i, statement_desc: 'FOR SHOPEE ' + i, total_amount: amt,
    status: 'PENDING_REVIEW', source: 'PDF_IMPORT', stmt_id: wrong, stmt_seq: i, details: [{ amount: amt, category_id: null, type: 'EXPENSE' }] } });
}
r = await call('/api/statements/delete', { user: '9North', method: 'POST', body: { stmt_id: wrong } }); check('ลบหัวที่ยังมีรายการ → ไม่ให้', r.s === 409, r);
r = await call('/api/transactions/bulk-delete', { user: '9North', method: 'POST', body: { transaction_ids: ['WR0', 'WR1'] } });
check('ลบทั้งชุด → หัว statement หาย', r.j.deleted === 2 && r.j.headers_removed === 1 && !db.prepare(`SELECT 1 FROM StatementImports WHERE stmt_id=?`).get(wrong), r.j);
check('จุดตรวจยอดจาก statement หาย (ที่ใส่เองยังอยู่)', !db.prepare(`SELECT 1 FROM AccountCheckpoints WHERE account_id='A09' AND as_of='2025-12-20'`).get() && db.prepare(`SELECT 1 FROM AccountCheckpoints WHERE account_id='A09' AND as_of='2026-01-31'`).get());
r = await H('A09', '2025-10-01', '2025-10-31', 1, 2);
r = await call('/api/statements/delete', { user: '9North', method: 'POST', body: { stmt_id: r.j.stmt_id } }); check('ลบหัวว่างเอง', r.s === 200 && r.j.removed === 1, r);

/* ใบแจ้งยอดบัตร: ร้านเดิม ยอดเท่ากัน วันเดียวกัน 2 บรรทัด (ไม่มีเวลา) → ต้องได้ทั้ง 2 · นำเข้าไฟล์เดิมซ้ำ → ไม่เพิ่ม */
r = await H('C01', '2026-04-21', '2026-05-20', 0, 268); const cs = r.j.stmt_id;
const cardLine = (id, seq, idx = 0, amt = -134) => call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: id, account_id: 'C01', date: '2026-05-13', time: '00:00:00', statement_desc: '(FOR SHOPEE) BANGKOK', total_amount: amt,
  status: 'PENDING_REVIEW', source: 'PDF_IMPORT', match_existing: true, stmt_id: cs, stmt_seq: seq, dup_idx: idx, details: [{ amount: amt, category_id: null, type: 'EXPENSE' }] } });
const n134 = () => db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE account_id='C01' AND total_amount=-134`).get().n;
r = await cardLine('CA1', 5, 0); r = await cardLine('CA2', 6, 1);
check('รายการเหมือนกัน 2 บรรทัดในไฟล์ (dup_idx 0,1) → ได้ทั้งคู่', !r.j.skipped && n134() === 2, r.j);
r = await cardLine('CA3', 9, 0); const r2b = await cardLine('CA4', 10, 1);
check('นำเข้าไฟล์เดิมซ้ำ ลำดับบรรทัดเลื่อน → ไม่สร้างซ้ำ', r.j.skipped && r2b.j.skipped && n134() === 2, [r.j, r2b.j]);
r = await cardLine('CA5', 11, 2);
check('ไฟล์ใหม่มีรายการเหมือนกันตัวที่ 3 → เพิ่ม', !r.j.skipped && n134() === 3, r.j);
/* ซิงก์: ไฟล์มี 2 ตัว ระบบมี 3 → ลบส่วนเกิน 1 (ตัวที่สร้างทีหลัง) */
r = await call('/api/statements/sync', { user: '9North', method: 'POST', body: { account_id: 'C01', period_from: '2026-04-21', period_to: '2026-05-20', keys: [{ date: '2026-05-13', time: '00:00:00', amount: -134, desc: '(FOR SHOPEE) BANGKOK', count: 2 }] } });
check('sync ลบส่วนเกิน 1 · เก็บตัวแรก', r.j.removed === 1 && n134() === 2 && !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='CA5'`).get() && db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='CA1'`).get(), r.j);
r = await call('/api/statements/sync', { user: 'Other', method: 'POST', body: { account_id: 'C01', period_from: '2026-04-21', period_to: '2026-05-20', keys: [] } }); check('sync ครอบครัวอื่นไม่ได้', r.s === 403, r);
/* หัว statement: ช่วงวันที่เปลี่ยน (รอบบัตร) แต่ยกไปเท่าเดิม → ใช้หัวเดิม */
r = await H('C01', '2026-04-20', '2026-05-18', 0, 268);
check('หัวเดิมช่วงวันที่ทับกัน + ยกไปเท่ากัน → ใช้ id เดิม', r.j.stmt_id === cs && r.j.reused, r.j);
console.log(`stmt-report: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exit(1);
