// ทดสอบหน้าตรวจสลิป (fields/unmatch/pick/review) + กรณีสลิปจริงของ North (2026-10-30) — รัน: node backend/test/slip-review.test.mjs
// ═══════════════════════════════════════════════════════════
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const asDataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
const readSrc = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
/* แทน import './x.js' ด้วย data URL แบบเรียกซ้ำ (โมดูลย่อยที่ import ต่ออีกชั้น เช่น assets.js → period-close.js) */
const inline = f => readSrc(f).replace(/from\s+'\.\/([\w.-]+)'/g, (_, g) => `from '${asDataUrl(inline(g))}'`);
const source = inline('ledger-inbox.js');
const inbox = await import(asDataUrl(source));
const match = await import(asDataUrl(readSrc('ledger-match.js')));

let pass = 0, fail = 0;
const J = m => JSON.stringify(m || {});                       // ข้อความ LINE (text หรือ flex) เป็นสตริงเดียว
const dataOf = (m, prefix) => (J(m).match(new RegExp(`"data":"(${prefix}[^"]*)"`)) || [])[1];
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${extra !== '' ? ` → ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); }
};

// ───────────── ฐานจำลอง ─────────────
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
const r2 = new Map();
const extractQueue = [];
const env = {
  DB: { prepare: toD1, batch: async ops => { db.exec('BEGIN'); try { ops.forEach(o => o._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } },
  ICONS: { put: async (k, v) => r2.set(k, v), get: async k => r2.has(k) ? { body: r2.get(k), arrayBuffer: async () => r2.get(k).slice().buffer } : null },
  __extractOverride: async () => { const next = extractQueue.shift(); if (next instanceof Error) throw next; return inbox.normalizeExtract(structuredClone(next)); },
  LINE_CHANNEL_ACCESS_TOKEN: 'tok',
};
const user = db.prepare(`SELECT * FROM Users WHERE user_id='9North'`).get();
const other = db.prepare(`SELECT * FROM Users WHERE user_id='Other'`).get();
let fileSeq = 0;
const fakeFile = () => new TextEncoder().encode(`image-${++fileSeq}-${Math.random()}`);
const slip = (o = {}) => ({ doc_type: 'SLIP', date: '2026-10-05', time: '12:30:00', amount: 500, fee: 0,
  sender: { name: 'นาย นอร์ธ', bank: 'กสิกรไทย', account: 'xxx-x-x1111-x' }, receiver: { name: 'ร้านข้าวมันไก่ป้าแดง', bank: 'SCB', account: 'xxx-x-x9999-x' },
  ref_code: `REF${fileSeq}${Math.random().toString(36).slice(2, 6)}`, ...o });
const ingest = async (ex, opts = {}) => { extractQueue.push(ex); return inbox.ingestFile(env, user, { bytes: opts.bytes || fakeFile(), mime: 'image/jpeg', source: 'WEB', forced: opts.forced }); };
const tx = id => db.prepare(`SELECT * FROM Transactions WHERE transaction_id=?`).get(id);
const lines = id => db.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id=? ORDER BY rowid`).all(id);
const insertStatementTx = (id, account, date, total, extra = {}) => {
  db.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, time, total_amount, status, source, created_by_user_id, ref_code, statement_desc)
    VALUES (?,?,?,?,?, 'CONFIRMED','PDF_IMPORT','9North',?,?)`).run(id, account, date, extra.time || null, total, extra.ref || null, extra.desc || 'stmt');
  db.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, type) VALUES (?,?,?,?,?)`).run('DT-' + id, id, total, 'T01', total < 0 ? 'EXPENSE' : 'INCOME');
};

db.exec(`INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, account_type) VALUES
  ('K2210','Ent_North','KBank 2210','Kbank','123-4-52210-9','BANK'), ('Y1696','Ent_North','กรุงศรี 1696','Krungsri','123-1-71696-0','BANK'),
  ('CX','Ent_North','บัตร CardX','SCB','3565-1800-0000-9607','CREDIT'), ('PT','Ent_North','เป๋าตัง','Krungthai','0000-0000-1203','EWALLET');`);
const act = (doc, a, body) => inbox.runAction(env, user, doc, a, body);
const docRow = id => db.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=?`).get(id);
const linksOf = id => db.prepare(`SELECT * FROM LedgerDocLinks WHERE doc_id=?`).all(id);

console.log('\n── ชื่อธนาคาร/บัตร/กระเป๋า ──');
check('CardX/SCB WEALTH → CARDX (ไม่ใช่ SCB)', match.bankKey('บัตร CardX/SCB WEALTH/FLEX') === 'CARDX');
check('KRUNGTHAI CARD → KTC', match.bankKey('KRUNGTHAI CARD PUBLIC COMPANY LIMITED') === 'KTC');
check('G-Wallet → PAOTANG', match.bankKey('G-Wallet') === 'PAOTANG' && match.bankKey('เป๋าตัง') === 'PAOTANG');
check('ธ.กรุงไทย ยังเป็น KTB', match.bankKey('ธ.กรุงไทย') === 'KTB');
check('เลขปิดหลักท้าย xxx-x-x2210-x ตรง 123-4-52210-9', match.maskedAccountMatch('xxx-x-x2210-x', '123-4-52210-9') && !match.maskedAccountMatch('xxx-x-x2210-x', '123-4-52211-9'));
check('กรุงศรี XXX-1-71696-X · SCB xxx-xxx942-2 · บัตร 356518XXXXXX9607', match.maskedAccountMatch('XXX-1-71696-X', '555-1-71696-3') && match.maskedAccountMatch('xxx-xxx942-2', '123-456942-2') && match.maskedAccountMatch('356518XXXXXX9607', '3565-1800-0000-9607'));

console.log('\n── สลิปจริง ──');
let r = await ingest(slip({ sender: { name: 'นาย ปรัชญา น', bank: 'ธ.กสิกรไทย', account: 'xxx-x-x2210-x' }, receiver: { name: 'นาย ปรัชญา นิ่มนวล', bank: 'ธ.กรุงศรีอยุธยา', account: 'xxx-x-x1696-x' },
  amount: 21500, date: '2026-10-28', time: '11:54:00', memo: '' }));
let d1 = r.doc.doc_id;
check('โอน 2210 → 1696 = โอนระหว่างบัญชี 2 ขา', r.doc.suggestion?.direction === 'TRANSFER' && r.legs.length === 2 && r.legs.every(l => l.kind === 'CREATED'), r.legs);
r = await act(d1, 'review', {});
check('ยืนยันโอนระหว่างบัญชี ไม่ต้องเลือกหมวด', r.ok && r.confirmed === 2, r);
check('ทั้งสองขาเป็น Bank_Transfer + ยืนยัน', linksOf(d1).every(l => tx(l.transaction_id).status === 'CONFIRMED' && lines(l.transaction_id)[0].category_id === 'Bank_Transfer'));

insertStatementTx('ST-TAX', 'K2210', '2026-10-28', -584.09, { time: '14:11:00', desc: 'จ่ายบิล สำนักงานเขต' });
db.prepare(`UPDATE Transactions SET status='PENDING_REVIEW' WHERE transaction_id='ST-TAX'`).run();
db.prepare(`UPDATE TransactionDetails SET category_id='Cat_Uncategorized', note=NULL WHERE transaction_id='ST-TAX'`).run();
r = await ingest(slip({ sender: { name: 'นาย ปรัชญา น', bank: 'ธ.กสิกรไทย', account: 'xxx-x-x2210-x' }, receiver: { name: 'สำนักงานเขตประเวศ', bank: '', account: '503410186970317701' },
  amount: 584.09, date: '2026-10-28', time: '14:11:00', memo: 'Tax land' }));
const d2 = r.doc.doc_id;
check('จ่ายบิลภาษีที่ดิน → จับคู่รายการ statement เดิม', r.outcome === 'MATCHED' && linksOf(d2)[0]?.transaction_id === 'ST-TAX', r);
check('แนบรูปสลิป + บันทึกช่วยจำให้รายการ statement', tx('ST-TAX').slip_image_url === `/api/inbox/file/${d2}` && lines('ST-TAX')[0].note === 'Tax land', { t: tx('ST-TAX'), l: lines('ST-TAX') });
r = await act(d2, 'review', { legs: [] });
check('ยืนยันโดยไม่เลือกหมวด → ไม่ให้', r.error && r.status === 400, r);
r = await act(d2, 'review', { legs: [{ transaction_id: 'ST-TAX', category_id: 'T05', note: 'ภาษีที่ดิน 2569' }] });
check('ยืนยันพร้อมหมวด → statement ยืนยัน หมวด+โน้ตถูก', r.ok && tx('ST-TAX').status === 'CONFIRMED' && lines('ST-TAX')[0].category_id === 'T05' && lines('ST-TAX')[0].note === 'ภาษีที่ดิน 2569', lines('ST-TAX'));
check('ยอดรายการ statement ไม่เปลี่ยน', tx('ST-TAX').total_amount === -584.09 && lines('ST-TAX')[0].amount === -584.09);

r = await ingest(slip({ sender: { name: 'นาย ปรัชญา น.', bank: 'SCB', account: 'xxx-xxx942-2' }, receiver: { name: 'CardX', bank: 'บัตร CardX/SCB WEALTH/FLEX/SPEEDY CASH', account: '356518XXXXXX9607' },
  amount: 14372.5, date: '2026-09-29', time: '12:01:00' }));
check('จ่ายบัตร CardX → รู้ว่าเป็นบัตร CX (ชื่อธนาคารในระบบเป็น SCB)', r.legs?.some(l => l.side === 'IN' && l.account_id === 'CX'), r.legs || r);

r = await ingest(slip({ sender: { name: 'ปรัชญา น***', bank: 'เป๋าตัง', account: '**** ******* 1203' }, receiver: { name: 'ร้านผลไม้นายต้น', bank: 'ถุงเงิน', account: '' },
  amount: 80, date: '2026-10-29', time: '20:17:00', subsidy_note: 'ค่าสินค้า 200 · สิทธิไทยช่วยไทยพลัส -120', memo: '' }));
const pt = r.legs?.[0];
check('เป๋าตัง: ออกจากกระเป๋า 80 (จ่ายจริง)', pt?.account_id === 'PT' && tx(pt.transaction_id).total_amount === -80, r.legs || r);
check('เป๋าตัง: บันทึกส่วนลดรัฐไว้ในโน้ต', /ไทยช่วยไทย/.test(lines(pt.transaction_id)[0].note || ''), lines(pt.transaction_id));

console.log('\n── แก้ข้อมูล / ไม่ใช่รายการนี้ / เลือกเอง ──');
insertStatementTx('ST-A', 'K2210', '2026-10-26', -76, { time: '21:01:00' }); db.prepare(`UPDATE Transactions SET status='PENDING_REVIEW' WHERE transaction_id='ST-A'`).run();
r = await ingest(slip({ sender: { name: 'นาย ปรัชญา', bank: 'Kasikornbank', account: 'xxx-x-x2210-x' }, receiver: { name: 'DARAWAN', bank: 'Kasikornbank', account: 'xxx-x-x9122-x' },
  amount: 67, date: '2026-10-26', time: '21:01:00', memo: 'Ftps doc 28 sosu doc 48' }));
const d4 = r.doc.doc_id;
check('ยอดอ่านผิด (67) → สร้างรายการใหม่', r.legs[0].kind === 'CREATED', r.legs);
r = await act(d4, 'fields', { fields: { amount: 76 } });
check('แก้ยอดเป็น 76 → จับคู่ statement ได้ + ลบรายการที่สร้างผิด', r.outcome === 'MATCHED' && linksOf(d4).length === 1 && linksOf(d4)[0].transaction_id === 'ST-A' && db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE source='LINE_SLIP' AND total_amount=-67`).get().n === 0, { r, l: linksOf(d4) });
r = await act(d4, 'unmatch', { transaction_id: 'ST-A' });
check('ไม่ใช่รายการนี้ → สร้างรายการใหม่ ไม่จับ ST-A อีก', linksOf(d4).length === 1 && linksOf(d4)[0].transaction_id !== 'ST-A' && linksOf(d4)[0].role === 'CREATED', linksOf(d4));
check('ตัดคู่แล้วรูปสลิปออกจาก ST-A', !tx('ST-A').slip_image_url, tx('ST-A'));
r = await act(d4, 'pick', { transaction_id: 'ST-A' });
const created = db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE source='LINE_SLIP' AND total_amount=-76`).get().n;
check('เลือก ST-A เอง → ผูก + ลบรายการที่สร้าง', r.ok && linksOf(d4).some(l => l.transaction_id === 'ST-A' && l.role === 'MATCHED') && created === 0, { r, l: linksOf(d4), created });
r = await act(d4, 'fields', { fields: { amount: 76 }, out_account_id: 'X99' });
check('เลือกบัญชีครอบครัวอื่น → ไม่ให้', r.status === 403, r);

const tA = linksOf(d1)[0].transaction_id;
r = await act(d1, 'fields', { fields: { amount: 1 } });
check('สลิปที่ยืนยันแล้ว แก้ข้อมูลไม่ได้', r.status === 409 && tx(tA).total_amount !== -1, r);

console.log('\n── statement เป็นตัวตั้ง: จับคู่แล้วใส่หมวดจากที่เคยยืนยัน ──');
await inbox.runAction(env, user, d4, 'review', { legs: [{ transaction_id: 'ST-A', category_id: 'T05', note: 'ค่าส่งเอกสาร' }] });
insertStatementTx('ST-B', 'K2210', '2026-10-27', -76, { time: '09:00:00' });
db.prepare(`UPDATE Transactions SET status='PENDING_REVIEW' WHERE transaction_id='ST-B'`).run();
db.prepare(`UPDATE TransactionDetails SET category_id='Cat_Uncategorized' WHERE transaction_id='ST-B'`).run();
r = await ingest(slip({ sender: { name: 'นาย ปรัชญา', bank: 'Kasikornbank', account: 'xxx-x-x2210-x' }, receiver: { name: 'DARAWAN', bank: 'Kasikornbank', account: 'xxx-x-x9122-x' },
  amount: 76, date: '2026-10-27', time: '09:00:00', memo: '' }));
check('คู่ค้าเดิม (DARAWAN) → statement ได้หมวด T05 อัตโนมัติ แต่ยังรอตรวจ', lines('ST-B')[0].category_id === 'T05' && tx('ST-B').status === 'PENDING_REVIEW', { r: r.outcome, l: lines('ST-B') });

console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exit(1);
