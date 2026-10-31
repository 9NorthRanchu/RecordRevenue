// ทดสอบทะเบียนทรัพย์สิน (ไม่มีค่าเสื่อม · ตัดออกไปหมวดค่าใช้จ่าย) (2026-10-12) — รัน: node backend/test/assets.test.mjs
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
const bal = () => db.prepare(`SELECT SUM(total_amount) s FROM Transactions WHERE account_id='A02' AND status='CONFIRMED'`).get().s;
const pnl = async (from, to) => (await call(`/api/inbox/report?kind=pnl&from=${from}&to=${to}`, { user: '9North' })).j;
const list = async (u = '9North') => (await call('/api/inbox/assets', { user: u })).j;
const post = (path, body, user = '9North') => call('/api/inbox/assets' + path, { user, method: 'POST', body: body || {} });
let p = await pnl('2026-05-01', '2026-05-31');
check('ก่อนตั้งหมวด: ซื้ออุปกรณ์นับเป็นรายจ่าย (พฤติกรรมเดิม)', p.lines.some(l => l.category_id === 'EQUIP'), p);
r = await post('/categories', { category_ids: ['EQUIP'] }, 'Puii'); check('สมาชิกทั่วไปตั้งหมวดไม่ได้', r.s === 403, r);
r = await post('/categories', { category_ids: ['EQUIP'] }); check('ผู้ดูแลตั้งหมวดทรัพย์สินได้', r.s === 200, r);
let L = await list();
check('ทะเบียน: 1 รายการ (เฉพาะที่ยืนยันแล้ว) มูลค่า 50,000 ชื่อจากหมายเหตุ', L.items.length === 1 && L.items[0].value === 50000 && L.items[0].name === 'MacBook Pro' && L.items[0].source === 'TX' && L.totals.value === 50000, L);
const TXID = L.items[0].asset_id;
p = await pnl('2026-05-01', '2026-05-31');
check('ตั้งหมวดแล้ว: ซื้อทรัพย์สินไม่นับเป็นรายจ่าย', !p.lines.some(l => l.category_id === 'EQUIP'), p.lines);
// ยืนยันรายการที่รออยู่ → เข้าทะเบียนเอง ครั้งเดียว
db.exec(`UPDATE Transactions SET status='CONFIRMED' WHERE transaction_id='TX-PEND'`);
await list(); L = await list();
check('ยืนยันรายการใหม่ → เข้าทะเบียนอัตโนมัติ ไม่ซ้ำ', L.items.length === 2 && db.prepare(`SELECT COUNT(*) n FROM AssetItems`).get().n === 2, L.items);
// ยอดยกมา
r = await post('/opening', { name: 'ตู้เย็น', date: '2024-01-10', amount: 0 }); check('ยอดยกมา: จำนวนเงิน 0 → 400', r.s === 400, r);
r = await post('/opening', { name: 'ตู้เย็น', date: '2024-01-10', amount: 15000, note: 'ซื้อก่อนใช้ระบบ' }); check('เพิ่มยอดยกมาได้', r.s === 200 && r.j.asset_id, r);
const OP = r.j.asset_id;
L = await list();
check('ยอดยกมา: เรียงตามวันที่ (อันเก่าสุดก่อน) · รวมมูลค่า 65,999 · ยอดยกมา 15,000', L.items[0].asset_id === OP && L.totals.value === 65999 && L.totals.opening === 15000, L.totals);
check('ยอดยกมาไม่สร้างรายการเงิน', !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id LIKE 'TX-WO-%' OR transaction_id LIKE '%OP%'`).get(), 0);
r = await call('/api/inbox/assets', { user: 'Other' }); check('ครอบครัวอื่นไม่เห็น', r.j.items.length === 0, r.j);
// กลุ่มย่อย
r = await post('/groups', { name: 'เครื่องใช้ในบ้าน' }); const G1 = r.j.group_id; check('สร้างกลุ่มได้', r.s === 200 && G1, r);
r = await post('/groups', { name: 'เครื่องใช้ในบ้าน' }); check('ชื่อกลุ่มซ้ำ → 409', r.s === 409, r);
r = await post('/groups', { name: 'เครื่องใช้ออฟฟิศ' }); const G2 = r.j.group_id;
r = await post('/move', { asset_ids: [OP], group_id: G1 }); check('ย้ายเข้ากลุ่มได้', r.s === 200, r);
r = await post('/move', { asset_ids: [TXID], group_id: G2 });
L = await list();
check('สรุปตามกลุ่ม', L.groups.find(g => g.group_id === G1).value === 15000 && L.groups.find(g => g.group_id === G2).value === 50000 && L.totals.ungrouped.count === 1, L.groups);
r = await post('/groups/' + G1, { name: 'เครื่องใช้คอนโด' }); check('เปลี่ยนชื่อกลุ่ม', r.s === 200 && (await list()).groups.some(g => g.name === 'เครื่องใช้คอนโด'), r);
r = await post('/move', { asset_ids: [OP], group_id: G1 }, 'Other'); check('ครอบครัวอื่นย้ายไม่ได้', r.s === 404, r);
// แก้ไข
r = await post('/' + TXID, { amount: 1 }); check('รายการจากธุรกรรม: แก้จำนวนเงินไม่ได้ → 400', r.s === 400, r);
r = await post('/' + TXID, { name: 'MacBook Pro 14"', note: 'ใช้ที่ออฟฟิศ' }); check('รายการจากธุรกรรม: แก้ชื่อ/หมายเหตุได้', r.s === 200, r);
r = await post('/' + OP, { amount: 16000, date: '2024-02-01', name: 'ตู้เย็น 2 ประตู' }); check('ยอดยกมา: แก้จำนวนเงิน/วันที่ได้', r.s === 200, r);
L = await list();
check('ค่าที่แก้แสดงผล', L.items.find(i => i.asset_id === TXID).name === 'MacBook Pro 14"' && L.items.find(i => i.asset_id === OP).value === 16000, L.items);
// ลบกลุ่ม → รายการไม่หาย
r = await post(`/groups/${G1}/delete`); L = await list();
check('ลบกลุ่ม: รายการไปอยู่ไม่ระบุกลุ่ม', r.s === 200 && L.items.find(i => i.asset_id === OP).group_id === null && L.items.length === 3, L.items);
// ตัดจำหน่าย (จากธุรกรรม)
const before = bal();
r = await post(`/${TXID}/writeoff`, { date: '2026-04-01', expense_category_id: 'WRITEOFF' }); check('ตัดก่อนวันซื้อ → 400', r.s === 400, r);
r = await post(`/${TXID}/writeoff`, { date: '2026-09-30', expense_category_id: 'EQUIP' }); check('ปลายทางเป็นหมวดทรัพย์สิน → 400', r.s === 400, r);
r = await post(`/${TXID}/writeoff`, { date: '2026-09-30', expense_category_id: 'WRITEOFF', note: 'เครื่องเสีย' }); check('ตัดจำหน่ายได้', r.s === 200 && r.j.value === 50000, r);
const wo = db.prepare(`SELECT total_amount, date, account_id FROM Transactions WHERE transaction_id=?`).get(r.j.transaction_id);
check('รายการปรับปรุงยอดรวม 0 · วันที่ 30 ก.ย. · บัญชีเดียวกับตอนซื้อ', wo && wo.total_amount === 0 && wo.date === '2026-09-30' && wo.account_id === 'A02', wo);
check('ยอดเงินในบัญชีไม่เปลี่ยน', bal() === before, { before, after: bal() });
p = await pnl('2026-09-01', '2026-09-30');
const e = p.lines.find(l => l.category_id === 'WRITEOFF');
check('รายงานเดือน ก.ย.: มูลค่าย้ายไปเป็นรายจ่ายหมวดที่เลือก 50,000', e && e.side === 'OUT' && e.amount === -50000 && !p.lines.some(l => l.category_id === 'EQUIP'), p.lines);
L = await list();
check('ทะเบียน: สถานะตัดจำหน่ายแล้ว · ไม่นับในมูลค่ารวม · ไม่สร้างรายการทรัพย์สินซ้ำจากรายการปรับปรุง', L.items.find(i => i.asset_id === TXID).status === 'WRITTEN_OFF' && L.totals.value === 16999 && L.totals.written_off === 1 && L.items.length === 3, L);
r = await post(`/${TXID}/writeoff`, { date: '2026-09-30', expense_category_id: 'WRITEOFF' }); check('ตัดซ้ำ → 409', r.s === 409, r);
r = await post(`/${TXID}/delete`); check('ตัดจำหน่ายแล้วลบไม่ได้ → 409', r.s === 409, r);
r = await call('/api/inbox/parties', { user: '9North' }); check('หมวดทรัพย์สินไม่โผล่ในลูกหนี้', !JSON.stringify(r.j).includes('อุปกรณ์สำนักงาน'), r.j);
r = await post(`/${TXID}/writeoff`, { date: '2026-09-30', expense_category_id: 'WRITEOFF' }, 'Other'); check('ครอบครัวอื่นทำไม่ได้', r.s === 404, r);
// ปิดเดือนแล้วยกเลิกไม่ได้
db.exec(`CREATE TRIGGER t_lock BEFORE DELETE ON Transactions WHEN OLD.date LIKE '2026-09%' BEGIN SELECT RAISE(ABORT, 'PERIOD_CLOSED: 2026-09'); END;`);
r = await post(`/${TXID}/undo`); check('เดือนปิดแล้ว ยกเลิกไม่ได้ → 409', r.s === 409 && r.j.code === 'PERIOD_CLOSED', r);
db.exec(`DROP TRIGGER t_lock`);
r = await post(`/${TXID}/undo`);
check('ยกเลิกการตัดจำหน่าย: ลบรายการปรับปรุง กลับเป็นมีอยู่', r.s === 200 && !db.prepare(`SELECT 1 FROM Transactions WHERE transaction_id LIKE 'TX-WO-%'`).get() && (await list()).totals.value === 66999, r);
// ตัดจำหน่ายยอดยกมา: ต้องเลือกบัญชี
r = await post(`/${OP}/writeoff`, { date: '2026-10-01', expense_category_id: 'WRITEOFF' }); check('ยอดยกมา: ไม่เลือกบัญชี → 400', r.s === 400, r);
r = await post(`/${OP}/writeoff`, { date: '2026-10-01', expense_category_id: 'WRITEOFF', account_id: 'X99' }); check('ยอดยกมา: บัญชีที่ไม่มีสิทธิ์ → 400', r.s === 400, r);
r = await post(`/${OP}/writeoff`, { date: '2026-10-01', expense_category_id: 'WRITEOFF', account_id: 'A01' });
check('ยอดยกมา: ตัดจำหน่ายได้ 16,000', r.s === 200 && r.j.value === 16000 && db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(r.j.transaction_id).t === 0, r);
p = await pnl('2026-10-01', '2026-10-31');
check('รายงาน ต.ค.: ค่าใช้จ่าย 16,000', p.lines.find(l => l.category_id === 'WRITEOFF')?.amount === -16000, p.lines);
r = await post(`/${OP}/amount`); check('เส้นทางแปลก → ไม่พบ', r.s === 404 || r.s === 400, r);
r = await post(`/${OP}/undo`); check('ยกเลิกยอดยกมา', r.s === 200, r);
// ลบ
const PEND = 'AS-D-PEND';
r = await post(`/${PEND}/delete`); L = await list();
check('ลบรายการจากธุรกรรม = ซ่อน (กู้คืนได้) · ไม่นับมูลค่า', r.s === 200 && r.j.hidden && L.items.find(i => i.asset_id === PEND).status === 'REMOVED' && L.totals.value === 66000, L.totals);
await list();
check('ซ่อนแล้วไม่ถูกเพิ่มกลับเข้ามาเอง', db.prepare(`SELECT COUNT(*) n FROM AssetItems WHERE detail_id='D-PEND'`).get().n === 1, 0);
r = await post(`/${PEND}/restore`); check('กู้คืนได้', r.s === 200 && (await list()).totals.value === 66999, r);
r = await post(`/${OP}/delete`); L = await list();
check('ลบยอดยกมา = ลบจริง', r.s === 200 && r.j.deleted && !L.items.some(i => i.asset_id === OP), L.items);
// 📍 v258 ที่ตั้ง · รับประกัน · หนี้ที่ผูก · สรุป
L = await list(); check('ที่ตั้งเริ่มต้น 5 ที่', ['Chaiyapruk', 'Villaggio', 'Pattaya', 'Element', 'Condo'].every(x => L.locations.includes(x)), L.locations);
r = await post('/opening', { name: 'แอร์ Daikin 18000', date: '2026-10-02', amount: 28900, location: 'Pattaya', location_note: 'ห้องนอนใหญ่', warranty_until: '2028-10-02' });
const AIR = r.j.asset_id; L = await list(); let air = L.items.find(i => i.asset_id === AIR);
check('บันทึกที่ตั้ง + รายละเอียด + รับประกัน', air.location === 'Pattaya' && air.location_note === 'ห้องนอนใหญ่' && air.warranty_until === '2028-10-02', air);
r = await post('/' + AIR, { location: 'Villaggio' }); L = await list(); air = L.items.find(i => i.asset_id === AIR);
check('แก้ที่ตั้ง (ช่องอื่นคงเดิม)', air.location === 'Villaggio' && air.warranty_until === '2028-10-02', air);
r = await post('/locations', { locations: ['Chaiyapruk', 'Villaggio', 'บ้านแม่'] }); L = await list();
check('แก้รายชื่อที่ตั้ง (ที่ใช้อยู่ยังแสดง)', L.locations.includes('บ้านแม่') && !L.locations.includes('Element'), L.locations);
check('สรุปปีนี้นับรายการที่ได้มาปีนี้', L.totals.year_count >= 1 && L.totals.year_value >= 28900, L.totals);
check('ยังไม่มีหนี้ผูก → ส่วนของเรา = มูลค่ารวม', L.totals.debt_linked === 0 && L.totals.net === L.totals.value, L.totals);
await list();   // สร้างตาราง Debts ผ่าน ensureDebtCols
db.exec(`INSERT INTO Debts (debt_id, family_id, name, type, principal_category_id, start_balance, start_date, asset_ref, status) VALUES ('DB1','Fam_Default','ผ่อนแอร์','PAYABLE','NOPE',10000,'2026-10-01','แอร์ Daikin','active')`);
L = await list(); air = L.items.find(i => i.asset_id === AIR);
check('หนี้ที่ผูก (asset_ref ตรงชื่อบางส่วน) → หนี้รวม + ส่วนของเรา', air.debts.length === 1 && air.debts[0].outstanding === 10000 && L.totals.debt_linked === 10000 && L.totals.net === Math.round((L.totals.value - 10000) * 100) / 100, [air.debts, L.totals]);
console.log(`${bad ? '❌' : '✅'} ผ่าน ${ok} · ไม่ผ่าน ${bad}`);
if (bad) process.exit(1);
