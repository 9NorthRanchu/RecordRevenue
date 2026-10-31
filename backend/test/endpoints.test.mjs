// ทดสอบ endpoint ที่ปรับให้อ่านน้อยลง (ระยะ 1 · 2026-10-11): ผลลัพธ์ยังถูก + ใช้ดัชนีจริง — รัน: node backend/test/endpoints.test.mjs
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
let ok = 0, bad = 0;
r = await call('/api/transactions?status=PENDING_REVIEW&count=1', { user: '9North' }); check('count pending', r.s === 200 && r.j.count === 2, r);
r = await call('/api/transactions?status=PENDING_REVIEW', { user: '9North' });
const p1 = r.j.find(t => t.transaction_id === 'TX-P1'), p2 = r.j.find(t => t.transaction_id === 'TX-P2');
check('auto-match by desc', p1?.auto_match?.category_id === 'T05', p1);
check('auto-match by ref', p2?.auto_match?.category_id === 'T05', p2);
r = await call('/api/stats/date-range', { user: '9North' }); check('date-range', r.s === 200 && r.j.min_date === '2025-01-05' && r.j.max_date === '2026-10-07' && r.j.total_count === 6, r);
r = await call('/api/reports/wht?month=2026-08', { user: '9North' }); check('wht month range', r.s === 200 && r.j.length === 1 && r.j[0].wht_amount === 30, r);
r = await call('/api/reports/wht?month=2026-09', { user: '9North' }); check('wht other month empty', r.s === 200 && r.j.length === 0, r);
r = await call('/api/dashboard/summary?month=latest', { user: '9North' });
check('dashboard ok', r.s === 200, r);
if (r.s === 200) {
  const d = r.j;
  check('range first/last', d.range?.first_date === '2025-01-05' && d.range?.last_date === '2026-10-01', d.range);
  const a01 = (d.accounts || d.bank_accounts || []).concat(d.credit_cards || []).find(a => a.account_id === 'A01');
  check('A01 balance', a01 && Math.abs(a01.balance - (-1050)) < 0.01, a01);
  check('arap AR remaining -600', JSON.stringify(d.ar || d.arap || '').includes('600'), { ar: d.ar, ap: d.ap });
}
r = await call('/api/inbox/parties', { user: '9North' });
check('parties AR balance 600', r.s === 200 && r.j.totals?.ar === 600, r.j?.totals || r);
r = await call('/api/inbox/parties/c:CT1', { user: '9North' }); check('party ledger', r.s === 200, r);
// query plans
const plan = (q) => db.prepare('EXPLAIN QUERY PLAN ' + q).all().map(x => x.detail).join(' | ');
db.exec(`CREATE INDEX idx_tx_acc_status_amt ON Transactions(account_id, status, total_amount); CREATE INDEX idx_tx_status_date ON Transactions(status, date);
CREATE INDEX idx_td_tx ON TransactionDetails(transaction_id); CREATE INDEX idx_td_category ON TransactionDetails(category_id); CREATE INDEX idx_settle_parent ON Settlements(parent_detail_id, settled_amount);
CREATE INDEX idx_transactions_ref ON Transactions(ref_code); CREATE INDEX idx_transactions_account_date ON Transactions(account_id, date);`);
const PF = `FROM Captions cp CROSS JOIN Categories c ON c.caption_id = cp.type_id
  CROSS JOIN TransactionDetails d ON d.category_id = c.category_id
  JOIN Transactions t ON t.transaction_id = d.transaction_id
  JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
  LEFT JOIN Contacts co ON co.contact_id = d.contact_id`;
check('ลูกหนี้: เริ่มจากหมวด (idx_td_category) ไม่ไล่ทุกรายการ', /SEARCH d USING INDEX idx_td_category/.test(plan(`SELECT SUM(d.amount - IFNULL((SELECT SUM(s.settled_amount) FROM Settlements s WHERE s.parent_detail_id = d.detail_id),0)) ${PF} WHERE up.user_id='9North' AND t.status='CONFIRMED' AND cp.behavior IN ('ASSET','LIABILITY')`)));
check('ยอดบัญชีใช้ดัชนี covering', /COVERING INDEX idx_tx_acc_status_amt/.test(plan(`SELECT a.account_id, (SELECT SUM(t.total_amount) FROM Transactions t WHERE t.account_id = a.account_id AND t.status = 'CONFIRMED') FROM Accounts a`)));
check('เดาหมวดค้นด้วย ref_code', /idx_transactions_ref/.test(plan(`SELECT 1 FROM Transactions t2 JOIN Accounts a2 ON a2.account_id=t2.account_id JOIN UserPermissions up2 ON up2.entity_id=a2.entity_id AND up2.user_id='x' WHERE t2.ref_code='R' AND +t2.status='CONFIRMED' ORDER BY t2.date DESC LIMIT 1`)));

/* ── ระยะ 2: แก้รายการแล้วการตัดชำระลูกหนี้ต้องไม่หาย (FK ON DELETE CASCADE แบบเดียวกับ D1) ── */
db.exec(`PRAGMA foreign_keys = OFF; DROP TABLE Settlements;
CREATE TABLE Settlements (settlement_id TEXT PRIMARY KEY, parent_detail_id TEXT NOT NULL, child_detail_id TEXT NOT NULL, settled_amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_detail_id) REFERENCES TransactionDetails(detail_id) ON DELETE CASCADE,
  FOREIGN KEY (child_detail_id) REFERENCES TransactionDetails(detail_id) ON DELETE CASCADE);
INSERT INTO Settlements (settlement_id, parent_detail_id, child_detail_id, settled_amount) VALUES ('S1','D-AR','D-OLD',-400);
PRAGMA foreign_keys = ON;`);
const nS = () => db.prepare(`SELECT COUNT(*) c FROM Settlements WHERE settlement_id='S1'`).get().c;
r = await call('/api/transactions', { user: '9North', method: 'POST', body: { transaction_id: 'TX-AR', account_id: 'A01', date: '2026-09-10', total_amount: -1000, source: 'WEB_GRID', status: 'CONFIRMED',
  details: [{ detail_id: 'D-AR', amount: -1000, category_id: 'AR1', contact_id: 'CT1', type: 'DEBIT_AR', note: 'แก้หมายเหตุ' }] } });
check('แอปเดิม: แก้หมายเหตุ → การตัดชำระยังอยู่', r.s === 200 && nS() === 1, { r, n: nS() });
r = await call('/api/inbox/tx/TX-AR/edit', { user: '9North', method: 'POST', body: { details: [{ amount: -1000, category_id: 'AR1', contact_id: 'CT1', note: 'แก้จากหน้าประวัติ' }] } });
check('หน้าประวัติใหม่: แก้โดยไม่ส่งรหัสบรรทัด → จับคู่บรรทัดเดิม การตัดชำระยังอยู่', r.s === 200 && nS() === 1, { r, n: nS() });
check('ยอดลูกหนี้ยังเท่าเดิม', (await call('/api/inbox/parties', { user: '9North' })).j.totals.ar === 600);
r = await call('/api/inbox/tx/TX-AR/edit', { user: '9North', method: 'POST', body: { total_amount: -1000, details: [{ amount: -600, category_id: 'AR1', contact_id: 'CT1' }, { amount: -400, category_id: 'T01' }] } });
check('แก้ยอดบรรทัดที่มีการตัดชำระ → ปฏิเสธ 409 และไม่เสียหาย', r.s === 409 && nS() === 1, { r, n: nS() });

/* ── กู้ข้อมูลแบบแทนที่: ไฟล์ไม่ครบต้องไม่ล้างของเดิม ── */
const nTx = () => db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c;
const before = nTx();
r = await call('/api/restore/full', { user: '9North', method: 'POST', body: { mode: 'replace' } });
check('กู้ด้วยไฟล์ว่าง → 400 ไม่ล้าง', r.s === 400 && nTx() === before, { r, n: nTx() });
r = await call('/api/restore/full', { user: '9North', method: 'POST', body: { mode: 'replace', entities: [{ entity_id: 'Ent_North', name: 'N' }], accounts: [{ account_id: 'A01', entity_id: 'Ent_North', name: 'x' }], transactions: [{ transaction_id: 'T1' }] } });
check('ไฟล์มีรายการน้อยกว่าครึ่ง → ต้องยืนยันก่อน (409) ไม่ล้าง', r.s === 409 && r.j.needs_confirm && nTx() === before, { r, n: nTx() });

/* ── นำเข้า statement 2026-10-15: จับคู่สลิปเดิม · ไม่นับตัวเองเป็นรายการซ้ำ · ลบทั้งชุด ── */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,time,total_amount,status,source,created_by_user_id,statement_desc,slip_image_url) VALUES
 ('TX-SLIP','A06','2026-10-08','10:00:00',-350,'PENDING_REVIEW','LINE_SLIP','9North','โอนให้ ร้าน ก','/api/inbox/file/D1');
 INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('D-SLIP','TX-SLIP',-350,'T01','EXPENSE');`);
const stmtRow = (id, date, amt, desc, extra = {}) => ({ transaction_id: id, account_id: 'A06', date, time: '10:01:00', statement_desc: desc, total_amount: amt, status: 'PENDING_REVIEW', source: 'PDF_IMPORT', match_existing: true,
  details: [{ amount: amt, category_id: 'Cat_Uncategorized', type: amt < 0 ? 'EXPENSE' : 'INCOME' }], ...extra });
r = await call('/api/transactions', { user: '9North', method: 'POST', body: stmtRow('TX-ST1', '2026-10-09', -350, 'TR TO SHOP K') });
const slip = db.prepare(`SELECT * FROM Transactions WHERE transaction_id='TX-SLIP'`).get();
check('statement ยอดตรงสลิป (±3 วัน) → จับคู่ ไม่สร้างใหม่', r.j?.merged && r.j.existingId === 'TX-SLIP' && !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='TX-ST1'`).get(), r);
check('รายการเดิมใช้วันที่/ข้อความธนาคาร + เก็บรูปสลิป', slip.date === '2026-10-09' && slip.statement_desc === 'TR TO SHOP K' && slip.source === 'PDF_IMPORT' && slip.slip_image_url === '/api/inbox/file/D1', slip);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: stmtRow('TX-ST1b', '2026-10-09', -350, 'TR TO SHOP K') });
check('นำเข้าไฟล์เดิมซ้ำ → ข้าม (ไม่จับคู่ซ้ำ ไม่สร้างซ้ำ)', r.j?.skipped && !r.j.merged && !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='TX-ST1b'`).get(), r);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: stmtRow('TX-ST2', '2026-10-09', 350, 'DEPOSIT') });
check('ยอดเท่ากันแต่คนละทิศ (เงินเข้า) → ไม่จับคู่ สร้างใหม่', !r.j?.merged && db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id='TX-ST2'`).get(), r);
r = await call('/api/transactions', { user: '9North', method: 'POST', body: stmtRow('TX-ST2', '2026-10-09', 350, 'DEPOSIT', { status: 'CONFIRMED', match_existing: false }) });
check('กดบันทึกการ์ดเดิม (ข้อความเหมือนเดิม) → ไม่ถูกมองว่าซ้ำตัวเอง', !r.j?.skipped && db.prepare(`SELECT status FROM Transactions WHERE transaction_id='TX-ST2'`).get().status === 'CONFIRMED', r);
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES ('TX-B1','A06','2026-10-01',100,'PENDING_REVIEW','PDF_IMPORT','9North'),('TX-B2','A06','2026-10-02',200,'PENDING_REVIEW','PDF_IMPORT','9North'),('TX-BOTHER','X99','2026-10-02',200,'PENDING_REVIEW','PDF_IMPORT','Other');
 INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id) VALUES ('DB1','TX-B1',100,'T01'),('DB2','TX-B2',200,'T01');`);
r = await call('/api/transactions/bulk-delete', { user: '9North', method: 'POST', body: { transaction_ids: ['TX-B1', 'TX-B2', 'TX-ST2', 'TX-BOTHER'] } });
const left = id => !!db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id=?`).get(id);
check('ลบทั้งชุด: ลบเฉพาะรอตรวจของเรา (ไม่แตะที่ยืนยันแล้ว/ครอบครัวอื่น)', r.j?.deleted === 2 && !left('TX-B1') && !left('TX-B2') && left('TX-ST2') && left('TX-BOTHER')
  && !db.prepare(`SELECT 1 FROM TransactionDetails WHERE detail_id='DB1'`).get(), { r });

/* ── จำหมวดจากรายการเดิม (category-hints) ── */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('TX-H1','A06','2026-09-01',-120,'CONFIRMED','PDF_IMPORT','9North','7-ELEVEN 12345 BKK'),('TX-H2','A06','2026-09-05',-45,'CONFIRMED','PDF_IMPORT','9North','7-ELEVEN 99887 BKK'),
 ('TX-H3','X99','2026-09-05',-45,'CONFIRMED','PDF_IMPORT','Other','SECRET SHOP');
 INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,contact_id,type) VALUES ('DH1','TX-H1',-120,'T01','CT1','EXPENSE'),('DH2','TX-H2',-45,'T01',NULL,'EXPENSE'),('DH3','TX-H3',-45,'X_SECRET',NULL,'EXPENSE');`);
r = await call('/api/transactions/category-hints', { user: '9North' });
const hk = r.j?.hints || {};
check('category-hints: 7-ELEVEN (ตัดเลขแล้วเป็นคีย์เดียว) → T01 · ไม่เห็นของครอบครัวอื่น', hk['OUT|eleven bkk']?.category_id === 'T01' && hk['OUT|eleven bkk'].n === 2 && !Object.keys(hk).some(k => k.includes('secret')), hk);
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id,statement_desc) VALUES
 ('TX-PAYEE1','A06','2026-09-01',-500,'CONFIRMED','PDF_IMPORT','9North','โอนเงิน K PLUS โอนไป BAY X1234 นาย สมชาย ใจดี'),('TX-PAYEE2','A06','2026-09-05',-300,'CONFIRMED','PDF_IMPORT','9North','โอนเงิน K PLUS โอนไป SCB X5678 นาย สมชาย ใจดี');
 INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('D-PAYEE1','TX-PAYEE1',-500,'T03','EXPENSE'),('D-PAYEE2','TX-PAYEE2',-300,'T03','EXPENSE');`);
const hkPayee = (await call('/api/transactions/category-hints', { user: '9North' })).j?.hints || {};
check('category-hints: ผู้รับเดียวกันต่างธนาคาร (BAY/SCB) รวมเป็นคีย์ N: เดียว', hkPayee['N:OUT|โอนเงิน k plus โอนไป นาย สมชาย ใจดี']?.category_id === 'T03' && hkPayee['N:OUT|โอนเงิน k plus โอนไป นาย สมชาย ใจดี'].n === 2, Object.keys(hkPayee).filter(k => k.includes('สมชาย')));
db.exec(`DELETE FROM Transactions WHERE transaction_id IN ('TX-PAYEE1','TX-PAYEE2'); DELETE FROM TransactionDetails WHERE detail_id IN ('D-PAYEE1','D-PAYEE2');`);

/* ── ↩️ กลับไปรอตรวจ ── */
r = await call('/api/transactions/unconfirm', { user: '9North', method: 'POST', body: { transaction_id: 'TX-H1' } });
check('unconfirm: กลับไปรอตรวจได้', r.s === 200 && db.prepare(`SELECT status FROM Transactions WHERE transaction_id='TX-H1'`).get().status === 'PENDING_REVIEW', r);
r = await call('/api/transactions/unconfirm', { user: '9North', method: 'POST', body: { transaction_id: 'TX-H3' } });
check('unconfirm: รายการของครอบครัวอื่น → ไม่ได้', r.s === 404, r);
db.exec(`UPDATE Transactions SET status='CONFIRMED' WHERE transaction_id='TX-H1'`);
/* ── ยอด ณ วันที่ (ตรวจยอดยกมา statement) ── */
db.exec(`INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,source,created_by_user_id) VALUES ('TX-BA1','A09','2026-08-01',1000,'CONFIRMED','WEB_GRID','9North'),('TX-BA2','A09','2026-08-10',300,'PENDING_REVIEW','PDF_IMPORT','9North'),('TX-BA3','A09','2026-09-01',50,'CONFIRMED','WEB_GRID','9North');
 INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('DBA2','TX-BA2',300,'T01','EXPENSE');`);
r = await call('/api/accounts/balance-at?account_id=A09&date=2026-09-01', { user: '9North' });
check('balance-at: ยืนยัน 1000 + รอตรวจนำเข้าเก่า (จ่าย 300 เก็บเป็นบวก) = 700 · ไม่รวมวันที่ 1 ก.ย.', r.j?.balance === 700 && r.j.count === 2, r.j);
r = await call('/api/accounts/balance-at?account_id=X99&date=2026-09-01', { user: '9North' });
check('balance-at: บัญชีคนอื่น → 403', r.s === 403, r);
/* ── ยอดตามธนาคาร (checkpoint) ── */
r = await call('/api/accounts/checkpoint', { user: '9North', method: 'POST', body: { account_id: 'A09', as_of: '2026-08-31', balance: 700, source: 'STATEMENT' } });
check('checkpoint: บันทึกได้', r.s === 200 && r.j?.success, r);
r = await call('/api/accounts/checkpoint', { user: '9North', method: 'POST', body: { account_id: 'X99', as_of: '2026-08-31', balance: 1 } });
check('checkpoint: บัญชีคนอื่น → 403', r.s === 403, r);
await call('/api/accounts/checkpoint', { user: '9North', method: 'POST', body: { account_id: 'A09', as_of: '2026-09-01', balance: 800 } });
r = await call('/api/accounts/checkpoints', { user: '9North' });
const cpA = (r.j?.checkpoints || []).find(c => c.account_id === 'A09');
check('checkpoints: เอาล่าสุด (1 ก.ย.) · ระบบ ณ สิ้นวัน = 750 · ต่าง 50', cpA && cpA.as_of === '2026-09-01' && cpA.system === 750 && cpA.diff === 50 && (r.j.checkpoints || []).length === 1, r.j);
console.log(`${bad ? '❌' : '✅'} ผ่าน ${ok} · ไม่ผ่าน ${bad}`);
if (bad) process.exit(1);
