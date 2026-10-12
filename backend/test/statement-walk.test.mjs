// ทดสอบ statement: เดินยอดคงเหลือ · เทียบเลขบัญชี · แก้ตัวเลข · นำเข้า Excel (2026-10-12) — รัน: node backend/test/statement-walk.test.mjs
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



db.exec(`INSERT OR IGNORE INTO Entities VALUES ('Ent_North','Fam_Default','North',0),('Ent_Other','Fam_Other','Other',0);
INSERT INTO Captions VALUES ('C_FIX','Fam_Default','สินทรัพย์ถาวร','ASSET',NULL);
INSERT INTO Categories (category_id,family_id,name,caption_id,default_type) VALUES ('EQUIP','Fam_Default','[E01] อุปกรณ์สำนักงาน','C_FIX','EXPENSE'),('WRITEOFF','Fam_Default','ค่าเสียหายทรัพย์สิน','C_A','EXPENSE');
UPDATE Categories SET family_id='Fam_Default', caption_id=IFNULL(caption_id,'C_A') WHERE category_id IN ('T01','T05');
INSERT OR IGNORE INTO Captions VALUES ('C_A','Fam_Default','รายจ่าย','EXPENSE',NULL);
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('TX-BUY','A02','2026-05-01',-50000,'CONFIRMED','WEB_GRID','9North','ซื้อโน้ตบุ๊ก'),('TX-PEND','A02','2026-05-02',-999,'PENDING_REVIEW','WEB_GRID','9North','รอ');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type,note,entity_id) VALUES
 ('D-BUY','TX-BUY',-50000,'EQUIP','EXPENSE','MacBook Pro','Ent_North'),('D-PEND','TX-PEND',-999,'EQUIP','EXPENSE','ยังไม่ยืนยัน',NULL);`);
let ok = 0, bad = 0;
const lm = await import(pathToFileURL(path.join(TMP, 'ledger-match.js')).href);
// ── ฟังก์ชันล้วน ──
let w = lm.walkStatement([{ line_id: 'L1', amount: -100, balance: 900 }, { line_id: 'L2', amount: 50, balance: 950 }], 1000);
check('เดินยอดลงทุกแถว', w.bad.length === 0 && w.checked === 2, w);
w = lm.walkStatement([{ line_id: 'L1', amount: -100, balance: 900 }, { line_id: 'L2', amount: 50, balance: 905 }, { line_id: 'L3', amount: 5, balance: 910 }], 1000);
check('แถวที่อ่านผิดถูกชี้ (ควรเป็น 950)', w.bad.length === 1 && w.bad[0].line_id === 'L2' && w.bad[0].expected === 950, w);
w = lm.walkStatement([{ line_id: 'L1', amount: -100, balance: 900 }], null);
check('ไม่รู้ยอดยกมา → แถวแรกตรวจไม่ได้ ไม่นับผิด', w.bad.length === 0 && w.checked === 0, w);
w = lm.walkStatement([{ line_id: 'L1', amount: -100, balance: null }], 0);
check('ไม่มียอดคงเหลือ (บัตร) → has_balance false', !w.has_balance && !w.bad.length, w);
check('เลขบัญชีปิดบางหลักตรงกัน', lm.accountNumberCheck('XXX-6-54321-X', '987-6-54321-0') === 'MATCH');
check('เลขบัญชีไม่ตรง', lm.accountNumberCheck('123-4-56789-0', '987-6-54321-0') === 'MISMATCH');
check('ไม่มีเลข → เทียบไม่ได้', lm.accountNumberCheck(null, '987-6-54321-0') === null && lm.accountNumberCheck('XXX-X-X1234-X', '') === null);
// ── นำเข้า PDF (จำลอง AI) ──
env.__statementOverride = () => ({ account_number: '111-1-11111-1', opening_balance: 1000, closing_balance: 960,
  lines: [{ date: '2026-09-02', description: 'ซื้อของ', withdrawal: 100, deposit: 0, balance: 900 },
          { date: '2026-09-03', description: 'รับโอน', withdrawal: 0, deposit: 50, balance: 905 },
          { date: '2026-09-04', description: 'ดอกเบี้ย', withdrawal: 0, deposit: 10, balance: 960 }] });
const up = async (acc) => {
  const fd = new FormData(); fd.append('account_id', acc); fd.append('file_name', 'stm.pdf'); fd.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'stm.pdf');
  const res = await worker.fetch(new Request('https://w.test/api/inbox/statement', { method: 'POST', headers: { Authorization: 'Bearer tok-9North' }, body: fd }), env, {});
  return { s: res.status, j: await res.json() };
};
r = await up('A10');
check('นำเข้าได้ · ชี้แถวเดินไม่ลง 1 แถว · เลขบัญชีไม่ตรง', r.s === 201 && r.j.summary.walk_bad === 1 && r.j.lines.find(l => l.line_id === 'L2').walk_err?.expected === 950
  && r.j.statement.account_check === 'MISMATCH' && r.j.statement.source === 'PDF', r.j.summary);
const SID = r.j.statement.stmt_id;
r = await call(`/api/inbox/statements/${SID}/create`, { user: '9North', method: 'POST', body: {} });
check('เดินไม่ลง → สร้างรายการไม่ได้ (409)', r.s === 409 && r.j.code === 'WALK', r);
r = await call(`/api/inbox/statements/${SID}/line/L2`, { user: '9North', method: 'POST', body: { action: 'fix', balance: 950 } });
check('แก้ยอดคงเหลือแถวที่ผิด', r.s === 200, r);
r = await call(`/api/inbox/statements/${SID}`, { user: '9North' });
check('แก้แล้วเดินลงทุกแถว', r.j.summary.walk_bad === 0 && r.j.summary.walk_checked === 3, r.j.summary);
r = await call(`/api/inbox/statements/${SID}/line/OPENING`, { user: '9North', method: 'POST', body: { action: 'fix', balance: 999 } });
r = await call(`/api/inbox/statements/${SID}`, { user: '9North' });
check('แก้ยอดยกมาได้ (ผิดแล้วแถวแรกเดินไม่ลง)', r.j.statement.opening_balance === 999 && r.j.summary.walk_bad === 1, r.j.summary);
await call(`/api/inbox/statements/${SID}/line/OPENING`, { user: '9North', method: 'POST', body: { action: 'fix', balance: 1000 } });
r = await call(`/api/inbox/statements/${SID}/line/L1`, { user: '9North', method: 'POST', body: { action: 'fix', amount: 0 } });
check('ยอด 0 แก้ไม่ได้', r.s === 400, r);
r = await call(`/api/inbox/statements/${SID}/create`, { user: '9North', method: 'POST', body: {} });
check('เดินลงแล้ว → สร้างรายการได้', r.s === 200 && r.j.created === 3, r);
// ── นำเข้าจาก Excel ──
const xl = (lines, extra = {}) => call('/api/inbox/statement/lines', { user: '9North', method: 'POST', body: { account_id: 'A09', file_name: 'kbank.xlsx', lines, ...extra } });
r = await xl([{ date: '2026-08-01', description: 'ฝาก', credit: 100, debit: 50, balance: 100 }]); check('Excel: เข้าและออกในแถวเดียว → 400', r.s === 400 && /แถว 2/.test(r.j.error), r);
r = await xl([{ date: '01/08/2026', description: 'x', credit: 1 }]); check('Excel: วันที่ไม่ใช่ ISO (หน้าเว็บต้องแปลงก่อน) → 400', r.s === 400, r);
r = await xl([{ date: '2026-08-01', description: 'x', debit: -5 }]); check('Excel: เลขติดลบ → 400', r.s === 400, r);
r = await xl([{ date: '2026-08-01', time: '09:00', description: 'รับโอน', credit: 500, balance: 1500, detail: 'จาก นาย ก', channel: 'K PLUS' },
              { date: '2026-08-02', description: 'จ่ายค่าไฟ', debit: 200, balance: 1300 }], { opening_balance: 1000 });
check('Excel: นำเข้าได้ · ที่มา EXCEL · เดินยอดลง · รายละเอียด+ช่องทางต่อท้ายคำอธิบาย', r.s === 201 && r.j.statement.source === 'EXCEL' && r.j.summary.walk_bad === 0 && r.j.summary.walk_checked === 2
  && r.j.lines[0].description === 'รับโอน · จาก นาย ก · K PLUS' && r.j.lines[1].amount === -200, r.j);
r = await call('/api/inbox/statement/lines', { user: 'Other', method: 'POST', body: { account_id: 'A09', lines: [{ date: '2026-08-01', credit: 1 }] } });
check('Excel: บัญชีที่ไม่มีสิทธิ์ → 403', r.s === 403, r);
console.log(`${bad ? '❌' : '✅'} ผ่าน ${ok} · ไม่ผ่าน ${bad}`);
if (bad) process.exit(1);
