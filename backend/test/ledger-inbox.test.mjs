// ═══════════════════════════════════════════════════════════
// ทดสอบกล่องรับเอกสาร + เครื่องจับคู่ของสมุดจด (ระยะ 1)
//
//   node backend/test/ledger-inbox.test.mjs
//
//   sqlite ในหน่วยความจำ (node:sqlite) · schema ลอกจากฐานจริง (export 7 ก.ย. 2026)
//   รวม CHECK ของ Transactions.status/source — ถ้าโค้ดใช้ค่าใหม่ เทสจะพังเหมือนของจริง
//   AI อ่านเอกสาร / LINE / R2 เป็นของปลอมทั้งหมด ไม่มีการเรียกออกเน็ต
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

// ───────────── ฟังก์ชันล้วน ─────────────
console.log('\n── อ่านข้อความเงินสด ──');
{
  const p = match.parseCashText;
  check('"กาแฟ 65"', JSON.stringify(p('กาแฟ 65')) === JSON.stringify({ amount: 65, note: 'กาแฟ', accountHint: '' }));
  check('"65 กาแฟ"', p('65 กาแฟ')?.note === 'กาแฟ');
  check('"ข้าว 50 kbank" → บัญชี kbank', p('ข้าว 50 kbank')?.accountHint === 'kbank');
  check('รูปแบบเดิม "เงินสด + กินข้าว + 50"', p('เงินสด + กินข้าว + 50')?.amount === 50 && p('เงินสด + กินข้าว + 50')?.accountHint === 'เงินสด');
  check('"1,250.50 ค่าไฟ"', p('1,250.50 ค่าไฟ')?.amount === 1250.5);
  check('"วันนี้" ไม่ใช่การจด', p('วันนี้') === null);
  check('ตัวเลขเปล่า "500" ไม่จด', p('500') === null);
}

console.log('\n── ธนาคาร / เลขบัญชี / คู่ค้า ──');
check('ธ.กสิกรไทย → KBANK', match.bankKey('ธ.กสิกรไทย') === 'KBANK');
check('Krungsri → BAY', match.bankKey('Krungsri') === 'BAY');
check('เลขที่ถูกปิด xxx-x-x1234-x → 1234', match.last4('xxx-x-x1234-x') === '1234');
check('ชื่อคู่ค้าตัดคำนำหน้า/บจก.', match.partyKey('บจก. เซเว่น อีเลฟเว่น') === match.partyKey('เซเว่นอีเลฟเว่น'));

console.log('\n── สูตรยอด (ตรงกับข้อมูลจริง) ──');
check('รายรับ W16 31,181.64 ลงตัว', match.balanceGap(31181.64, [
  { amount: 12000, wht: 360 }, { amount: 9000, wht: 270 }, { amount: 7500, wht: 225 }, { amount: 1300, wht: 39 }, { amount: 2275.64, wht: 0 }]) === 0);
check('รายจ่ายมีหัก ณ ที่จ่าย -9,709.91 ลงตัว', match.balanceGap(-9709.91, [{ amount: -9990, wht: -280.09 }]) === 0);
check('รายรับมีค่าธรรมเนียม 4,500 − 10 − 135', match.balanceGap(4355, [{ amount: 4500, fee: 10, wht: 135 }]) === 0);
{
  const t = match.templateFromDetails([{ amount: 12000, wht: 360, category_id: 'Account', entity_id: 'Ent_Co_S01', type: 'INCOME' },
    { amount: 9000, wht: 270, category_id: 'Audit', entity_id: 'Ent_Co_S05', type: 'INCOME' }]);
  const same = match.proposeLines({ total: 20370, template: t });
  check('แบบเดิมของลูกค้า ยอดเท่าเดิม → ใช้ตามเดิมทุกบรรทัด', same.how === 'template-exact' && same.lines.length === 2 && same.lines[1].category_id === 'Audit');
  const half = match.proposeLines({ total: 10185, template: t });
  check('ยอดครึ่งหนึ่ง → แบ่งตามสัดส่วนและถอดภาษีกลับ', half.how === 'template-scaled' && half.lines[0].amount === 6000 && half.lines[1].wht === 135);
  const odd = match.proposeLines({ total: 12345.67, template: t });
  check('ยอดเศษสตางค์ → ยังลงตัวเป๊ะ', match.balanceGap(12345.67, odd.lines) === 0);
}

console.log('\n── คะแนนจับคู่ ──');
{
  const ev = { signedAmount: -500, date: '2026-10-05', time: '12:30:00', ref: 'R1' };
  check('เลขอ้างอิงตรง = 100', match.scoreCandidate(ev, { total_amount: -500, ref_code: 'R1', date: '2026-10-09' }) === 100);
  check('วันเดียวกัน เวลาห่าง ≤10 นาที = 90', match.scoreCandidate(ev, { total_amount: -500, date: '2026-10-05', time: '12:36:00' }) === 90);
  check('ยอดไม่เท่า = 0', match.scoreCandidate(ev, { total_amount: -501, date: '2026-10-05' }) === 0);
  check('ห่าง 3 วัน = 0', match.scoreCandidate(ev, { total_amount: -500, date: '2026-10-08' }) === 0);
  const d = match.decideMatch([{ score: 70 }, { score: 70 }]);
  check('สองตัวคะแนนเท่ากัน → ให้คนเลือก', d.kind === 'choose');
}

// ───────────── ทั้งระบบ ─────────────
console.log('\n── สลิปแรก: ยังไม่รู้ว่าบัญชีไหน → ถาม ──');
let firstDoc;
{
  const out = await ingest(slip({ amount: 500 }));
  firstDoc = out.doc.doc_id;
  check('ผล = NEEDS_ACCOUNT', out.outcome === 'NEEDS_ACCOUNT', out.outcome);
  check('ตัวเลือกจ่ายจากบัญชี KBank (A02 A06 C01) ไม่มีบัญชีครอบครัวอื่น', out.options.some(o => o.account_id === 'A02' && o.side === 'OUT') && !out.options.some(o => o.account_id === 'X99'));
  check('ยังไม่สร้างรายการเงิน', db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c === 0);
  check('ไฟล์อยู่ใน R2 ใต้ ledger-docs/', [...r2.keys()].some(k => k.startsWith('ledger-docs/Fam_Default/')));

  const after = await inbox.runAction(env, user, firstDoc, 'account', { account_id: 'A02', side: 'OUT' });
  const t = tx(after.legs?.[0]?.transaction_id);
  check('เลือก A02 แล้ว → สร้างรายการรอยืนยัน', after.outcome === 'SUGGESTED' && t?.status === 'PENDING_REVIEW', after);
  check('ยอดหัว -500 · ที่มา LINE_SLIP · วันที่/เวลาแยกช่อง', t?.total_amount === -500 && t?.source === 'LINE_SLIP' && t?.date === '2026-10-05' && t?.time === '12:30:00');
  check('สลิปผูกกับรายการ (role CREATED)', db.prepare(`SELECT role FROM LedgerDocLinks WHERE doc_id=?`).get(firstDoc)?.role === 'CREATED');
  check('จำกฎบัญชี KBANK|1111 → A02', db.prepare(`SELECT value FROM LedgerRules WHERE kind='ACCOUNT' AND rkey='KBANK|1111'`).get()?.value === 'A02');
  check('หมวดยังไม่ระบุ', lines(t.transaction_id)[0]?.category_id === 'Cat_Uncategorized');
}

console.log('\n── ยืนยันพร้อมเลือกหมวด → ระบบจำ ──');
{
  const doc = db.prepare(`SELECT transaction_id FROM LedgerDocs WHERE doc_id=?`).get(firstDoc);
  const bad = await inbox.runAction(env, user, firstDoc, 'accept', { details: [{ amount: -400, category_id: 'T01', type: 'EXPENSE' }] });
  check('ยอดไม่ลงตัว → ปฏิเสธพร้อมบอกส่วนต่าง', bad.error && bad.gap === -100, bad);
  const ok = await inbox.runAction(env, user, firstDoc, 'accept', { details: [{ amount: -500, category_id: 'T01', entity_id: 'Ent_North', type: 'EXPENSE', note: 'ข้าวกลางวัน' }] });
  check('ยืนยันสำเร็จ', ok.ok && tx(doc.transaction_id).status === 'CONFIRMED', ok);
  check('จำร้านนี้ → T01', JSON.parse(db.prepare(`SELECT value FROM LedgerRules WHERE kind='PARTY'`).get()?.value || '{}').lines?.[0]?.category_id === 'T01');
}

console.log('\n── สลิปที่สองจากบัญชีเดิม ร้านเดิม → รู้บัญชีและหมวดเอง ──');
{
  const out = await ingest(slip({ amount: 65, date: '2026-10-06' }));
  const t = tx(out.legs?.[0]?.transaction_id);
  check('ไม่ต้องถามบัญชี (จำได้)', out.outcome === 'SUGGESTED' && t?.account_id === 'A02', out.outcome);
  check('หมวด T01 จากที่จำ', lines(t.transaction_id)[0]?.category_id === 'T01' && out.legs[0].how === 'template-scaled');
}

console.log('\n── statement รุ่นเก่า (รอตรวจ ยอดบวก) แล้วส่งสลิปจ่าย → ยังจับคู่ได้ (2026-10-15) ──');
{
  db.prepare(`INSERT INTO Transactions (transaction_id,account_id,date,time,total_amount,status,source,created_by_user_id) VALUES ('TX-OLDPOS','A02','2026-10-12','08:00:00',777,'PENDING_REVIEW','PDF_IMPORT','9North')`).run();
  db.prepare(`INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type) VALUES ('D-OLDPOS','TX-OLDPOS',777,'Cat_Uncategorized','EXPENSE')`).run();
  const out = await ingest(slip({ amount: 777, date: '2026-10-12', time: '08:02:00' }));
  check('ผล = MATCHED กับรายการนำเข้าเก่า', out.outcome === 'MATCHED' && db.prepare(`SELECT transaction_id FROM LedgerDocLinks WHERE doc_id=?`).get(out.doc.doc_id)?.transaction_id === 'TX-OLDPOS', out.outcome);
}

console.log('\n── ยืนยันสลิปในแอปหลัก แล้วสั่ง learn → จำหมวดร้านนี้ (2026-10-15) ──');
{
  const out = await ingest(slip({ amount: 88, date: '2026-10-13', receiver: { name: 'ร้านกาแฟใหม่', bank: 'KBANK', account: 'xxx-x-x9999-x' } }));
  const txId = out.legs?.[0]?.transaction_id;
  db.prepare(`UPDATE TransactionDetails SET category_id='T05' WHERE transaction_id=?`).run(txId);
  db.prepare(`UPDATE Transactions SET status='CONFIRMED' WHERE transaction_id=?`).run(txId);
  const r = await inbox.runAction(env, user, out.doc.doc_id, 'learn', {});
  const rule = db.prepare(`SELECT value FROM LedgerRules WHERE kind='PARTY' AND value LIKE '%T05%'`).get();
  check('learn: จำหมวด T05 ของร้านนี้ + ปิดเอกสาร', r.learned === 1 && !!rule && db.prepare(`SELECT status FROM LedgerDocs WHERE doc_id=?`).get(out.doc.doc_id).status === 'DONE', { r, rule });
}

console.log('\n── statement มาก่อน แล้วค่อยส่งสลิป → จับคู่ ไม่สร้างซ้ำ ──');
{
  insertStatementTx('TX-STMT-1', 'A02', '2026-10-07', -1250, { time: '09:01:00' });
  const before = db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c;
  const out = await ingest(slip({ amount: 1250, date: '2026-10-07', time: '09:05:00' }));
  check('ผล = MATCHED', out.outcome === 'MATCHED', out.outcome);
  check('จำนวนรายการเท่าเดิม', db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c === before);
  check('สลิปผูกกับรายการ statement', db.prepare(`SELECT transaction_id FROM LedgerDocLinks WHERE doc_id=?`).get(out.doc.doc_id)?.transaction_id === 'TX-STMT-1');
  check('รายการ statement ยังยืนยันอยู่ ไม่ถูกแตะ', tx('TX-STMT-1').status === 'CONFIRMED');

  const again = await ingest(slip({ amount: 1250, date: '2026-10-07', time: '09:05:00' }));
  check('สลิปใบที่สอง ยอดเดียวกัน → รายการเดิมถูกใช้แล้ว ไม่จับซ้ำ', again.outcome === 'SUGGESTED', again.outcome);
  await inbox.runAction(env, user, again.doc.doc_id, 'dismiss');
}

console.log('\n── ยอดตรงหลายรายการ → ให้เลือก ──');
{
  insertStatementTx('TX-STMT-2', 'A02', '2026-10-08', -300);
  insertStatementTx('TX-STMT-3', 'A02', '2026-10-08', -300);
  const out = await ingest(slip({ amount: 300, date: '2026-10-08', time: null }));
  check('ผล = NEEDS_CHOICE มี 2 ตัวเลือก', out.outcome === 'NEEDS_CHOICE' && out.legs[0].choices.length === 2, out);
  const res = await inbox.runAction(env, user, out.doc.doc_id, 'link', { transaction_id: 'TX-STMT-3' });
  check('เลือกแล้วผูกได้', res.ok && db.prepare(`SELECT 1 FROM LedgerDocLinks WHERE doc_id=? AND transaction_id='TX-STMT-3'`).get(out.doc.doc_id));
  const forbidden = await inbox.runAction(env, user, out.doc.doc_id, 'link', { transaction_id: 'TX-NOPE' });
  check('ผูกกับรายการที่ไม่มี/ไม่มีสิทธิ์ → ปฏิเสธ', forbidden.status === 404);
}

console.log('\n── ส่งไฟล์เดิมซ้ำ ──');
{
  const bytes = fakeFile();
  await ingest(slip({ amount: 77 }), { bytes });
  const out = await ingest(slip({ amount: 77 }), { bytes });
  check('ไฟล์เดิมเป๊ะ → duplicate ไม่สร้างอะไรเพิ่ม', out.duplicate === true);
  check('ไม่เรียก AI ซ้ำสำหรับไฟล์ซ้ำ', extractQueue.length === 1);
  extractQueue.length = 0;
}

console.log('\n── โอนระหว่างบัญชีของเราเอง ──');
{
  db.prepare(`INSERT INTO LedgerRules (rule_id, family_id, kind, rkey, value) VALUES ('R-x','Fam_Default','ACCOUNT','SCB|7890','A09')`).run();
  const out = await ingest(slip({ amount: 10000, fee: 0, date: '2026-10-09', receiver: { name: 'นาย นอร์ธ', bank: 'SCB', account: 'xxx-x-x7890-x' } }));
  const legs = out.legs || [];
  check('รู้ว่าเป็นโอนระหว่างบัญชี (2 ขา)', out.doc.suggestion.direction === 'TRANSFER' && legs.length === 2, out);
  const outTx = tx(legs[0]?.transaction_id), inTx = tx(legs[1]?.transaction_id);
  check('ขาออก A02 -10,000 · ขาเข้า A09 +10,000', outTx?.account_id === 'A02' && outTx?.total_amount === -10000 && inTx?.account_id === 'A09' && inTx?.total_amount === 10000);
  const l1 = lines(outTx.transaction_id)[0];
  check('หมวด Bank_Transfer · type TRANSFER · คู่บัญชี A09', l1.category_id === 'Bank_Transfer' && l1.type === 'TRANSFER' && l1.head_owner === 'A09');
  const acc = await inbox.runAction(env, user, out.doc.doc_id, 'accept');
  check('ยืนยันทั้งสองขาในครั้งเดียว', acc.ok && tx(outTx.transaction_id).status === 'CONFIRMED' && tx(inTx.transaction_id).status === 'CONFIRMED');
  check('การโอนไม่ถูกจำเป็นกฎคู่ค้า', !db.prepare(`SELECT 1 FROM LedgerRules WHERE kind='PARTY' AND rkey=?`).get(match.partyKey('นาย นอร์ธ')));
}

console.log('\n── เลขบัญชีในหน้าตั้งค่า (ไม่ต้องสอน) ──');
{
  const out = await ingest(slip({ amount: 42, sender: { name: 'นาย นอร์ธ', bank: 'ไทยพาณิชย์', account: 'xxx-x-x3210-x' } }));
  check('SCB เลขท้าย 3210 ตรงกับ A10 ที่กรอกเลขบัญชีไว้', out.legs?.[0]?.account_id === 'A10', out);
}

console.log('\n── รับเงินลูกค้า: แตกหลายบริษัท + หัก ณ ที่จ่าย แล้วครั้งหน้าเติมให้เอง ──');
{
  const payer = { name: 'บจก. ลูกค้าดับเบิลยูสิบหก', bank: 'BBL', account: 'xxx-x-x5555-x' };
  const recv = { name: 'นาย นอร์ธ', bank: 'KBank', account: 'xxx-x-x2222-x' };
  const first = await ingest(slip({ amount: 31181.64, date: '2026-09-23', sender: payer, receiver: recv }), { forced: { account_id: 'A02', side: 'IN' } });
  check('รับเงิน → รายการรอยืนยัน +31,181.64', first.outcome === 'SUGGESTED' && tx(first.legs[0].transaction_id).total_amount === 31181.64, first);
  const split = [
    { amount: 12000, wht: 360, category_id: 'Account', entity_id: 'Ent_Co_S01', contact_id: 'W16', type: 'INCOME', note: 'Acc 4-9/25' },
    { amount: 9000, wht: 270, category_id: 'Audit', entity_id: 'Ent_Co_S05', contact_id: 'W16', type: 'INCOME', note: 'FS 2024' },
    { amount: 7500, wht: 225, category_id: 'Service', entity_id: 'Ent_Co_S01', contact_id: 'W16', type: 'INCOME' },
    { amount: 1300, wht: 39, category_id: 'Service', entity_id: 'Ent_Co_S01', contact_id: 'W16', type: 'INCOME' },
    { amount: 2275.64, wht: 0, category_id: 'AP__AR__Customer', entity_id: 'Ent_Co_S01', contact_id: 'W16', type: 'CREDIT_AR', note: 'Tax & Fee' },
  ];
  const ok = await inbox.runAction(env, user, first.doc.doc_id, 'accept', { details: split });
  check('ยืนยันแบบแตก 5 บรรทัด 2 บริษัท', ok.ok && lines(first.legs[0].transaction_id).length === 5, ok);

  const next = await ingest(slip({ amount: 31181.64, date: '2026-10-23', sender: payer, receiver: recv }));
  const nl = lines(next.legs?.[0]?.transaction_id || '');
  check('ครั้งหน้ารู้บัญชีรับเอง (จำ KBANK|2222)', next.legs?.[0]?.account_id === 'A02', next);
  check('ยอดเท่าเดิม → เติม 5 บรรทัดตามเดิม', next.legs?.[0]?.how === 'template-exact' && nl.length === 5 && nl[1].entity_id === 'Ent_Co_S05');
  check('หัก ณ ที่จ่ายรวม 894', Math.round(nl.reduce((s, l) => s + l.wht, 0) * 100) / 100 === 894);
  const smaller = await ingest(slip({ amount: 20370, date: '2026-11-23', sender: payer, receiver: recv }));
  const sl = lines(smaller.legs?.[0]?.transaction_id || '');
  check('ยอดต่างจากเดิม → แบ่งสัดส่วน ยอดยังลงตัว', smaller.legs?.[0]?.how === 'template-scaled' && match.balanceGap(20370, sl) === 0);
}

console.log('\n── ใบเสร็จ: แนบเป็นหลักฐานประกอบ ──');
{
  insertStatementTx('TX-CARD-1', 'C01', '2026-10-10', -899);
  const out = await ingest({ doc_type: 'RECEIPT', date: '2026-10-10', amount: 899, merchant: 'Central' });
  check('ผล = ATTACHED กับรายการบัตร', out.outcome === 'ATTACHED' && out.transaction_id === 'TX-CARD-1', out.outcome);
  check('role SUPPORT', db.prepare(`SELECT role FROM LedgerDocLinks WHERE doc_id=?`).get(out.doc.doc_id)?.role === 'SUPPORT');
  const stored = await ingest({ doc_type: 'RECEIPT', date: '2026-10-10', amount: 12.34 });
  check('ไม่เจอยอดตรง → เก็บไว้ (STORED)', stored.outcome === 'STORED');
  const stmt = await ingest({ doc_type: 'BANK_STATEMENT' });
  check('statement ทั้งฉบับ → เก็บไว้รอระยะ 2', stmt.outcome === 'STORED');
}

console.log('\n── AI อ่านไม่สำเร็จ ──');
{
  extractQueue.push(new Error('503'));
  const out = await inbox.ingestFile(env, user, { bytes: fakeFile(), mime: 'image/png', source: 'WEB' });
  check('สถานะ ERROR แต่ไฟล์ยังเก็บไว้', out.outcome === 'ERROR' && out.doc.has_file);
  const bad = await inbox.ingestFile(env, user, { bytes: fakeFile(), mime: 'text/html', source: 'WEB' });
  check('ไฟล์ชนิดแปลก → ปฏิเสธ', !!bad.error);
}

console.log('\n── เงินสด ──');
{
  const a = await inbox.recordCash(env, user, { text: 'กาแฟ 65' }, 'LINE');
  check('ลงบัญชีเงินสด A01 -65 รอยืนยัน', a.account.account_id === 'A01' && tx(a.transaction_id).total_amount === -65 && tx(a.transaction_id).status === 'PENDING_REVIEW' && tx(a.transaction_id).source === 'LINE_TEXT');
  await inbox.runAction(env, user, a.doc_id, 'accept', { details: [{ amount: -65, category_id: 'T01', type: 'EXPENSE', note: 'กาแฟ' }] });
  const b = await inbox.recordCash(env, user, { text: 'กาแฟ 70' }, 'LINE');
  check('ครั้งที่ 2 → หมวด T01 แต่ยังรอยืนยัน', b.category_id === 'T01' && !b.auto_confirmed);
  await inbox.runAction(env, user, b.doc_id, 'accept');
  const c = await inbox.recordCash(env, user, { text: 'กาแฟ 55' }, 'LINE');
  check('ยืนยันมาแล้ว 2 ครั้ง → ครั้งที่ 3 บันทึกเลย', c.auto_confirmed && tx(c.transaction_id).status === 'CONFIRMED');
  const k = await inbox.recordCash(env, user, { text: 'ข้าว 50 kbank' }, 'LINE');
  check('ระบุ kbank → ลงบัญชี KBank', ['A02', 'A06', 'C01'].includes(k.account.account_id));
  const d = await inbox.recordCash(env, user, { text: 'ค่าน้ำ 40' }, 'WEB');
  await inbox.runAction(env, user, d.doc_id, 'dismiss');
  check('ไม่ต้องบันทึก → ลบรายการรอยืนยันทิ้ง', !tx(d.transaction_id));
}

console.log('\n── ลบได้เฉพาะรายการที่ตัวเองสร้าง ──');
{
  const before = tx('TX-STMT-1');
  const docId = db.prepare(`SELECT doc_id FROM LedgerDocLinks WHERE transaction_id='TX-STMT-1'`).get().doc_id;
  await inbox.runAction(env, user, docId, 'dismiss');
  check('dismiss สลิปที่จับคู่กับ statement → รายการ statement ยังอยู่', !!tx('TX-STMT-1') && before.status === 'CONFIRMED');
}

console.log('\n── สิทธิ์ข้ามครอบครัว ──');
{
  const res = await inbox.runAction(env, other, firstDoc, 'accept');
  check('ครอบครัวอื่นแตะเอกสารไม่ได้', res.status === 404);
  const r = await inbox.handleLedgerInbox(new Request(`https://x/api/inbox/file/${firstDoc}`), env, new URL(`https://x/api/inbox/file/${firstDoc}`), {}, 'Other');
  check('ครอบครัวอื่นเปิดไฟล์ไม่ได้', r.status === 404);
  const mine = await inbox.handleLedgerInbox(new Request(`https://x/api/inbox/file/${firstDoc}`), env, new URL(`https://x/api/inbox/file/${firstDoc}`), {}, '9North');
  check('เจ้าของเปิดไฟล์ได้', mine.status === 200);
  const anon = await inbox.handleLedgerInbox(new Request('https://x/api/inbox'), env, new URL('https://x/api/inbox'), {}, '');
  check('ไม่ล็อกอิน → 401', anon.status === 401);
  const list = await (await inbox.handleLedgerInbox(new Request('https://x/api/inbox'), env, new URL('https://x/api/inbox'), {}, '9North')).json();
  check('รายการในกล่องคืนเฉพาะที่ยังเปิดอยู่ พร้อมรายการเงินที่ผูก', list.docs.length > 0 && list.docs.every(d => d.status !== 'DONE') && list.docs.some(d => d.transactions.length));
  const notMine = await inbox.handleLedgerInbox(new Request('https://x/api/trips'), env, new URL('https://x/api/trips'), {}, '9North');
  check('path อื่นไม่ยุ่ง (คืน null)', notMine === null);
}

console.log('\n── LINE webhook ──');
{
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).includes('api-data.line.me')) return new Response(fakeFile(), { headers: { 'content-type': 'image/jpeg' } });
    if (String(u).includes('api.line.me')) { sent.push(JSON.parse(init.body)); return new Response('{}'); }
    throw new Error('ห้ามออกเน็ตในเทส: ' + u);
  };
  const call = async (events, secret) => {
    const body = JSON.stringify({ events });
    const e = { ...env, LINE_CHANNEL_SECRET: secret };
    const sig = secret ? createHmac('sha256', secret).update(body).digest('base64') : null;
    const req = new Request('https://x/api/line-webhook', { method: 'POST', body, headers: sig ? { 'x-line-signature': sig } : {} });
    return inbox.handleLedgerInbox(req, e, new URL('https://x/api/line-webhook'), {}, '');
  };
  try {
    const forged = await inbox.handleLedgerInbox(new Request('https://x/api/line-webhook', { method: 'POST', body: '{"events":[]}', headers: { 'x-line-signature': 'nope' } }),
      { ...env, LINE_CHANNEL_SECRET: 's3cret' }, new URL('https://x/api/line-webhook'), {}, '');
    check('ลายเซ็นปลอม → 401', forged.status === 401);

    const res = await call([{ type: 'message', replyToken: 't1', source: { userId: 'Uline-north' }, message: { type: 'text', text: 'ส้มตำ 80' } }], 's3cret');
    check('ลายเซ็นถูก → 200', res.status === 200);
    check('จดเงินสดแล้วตอบเป็นการ์ดพร้อมปุ่มยืนยัน', sent.at(-1)?.messages?.[0]?.type === 'flex' && J(sent.at(-1)).includes('ส้มตำ') && !!dataOf(sent.at(-1), 'inbox\\|accept'));

    extractQueue.push(slip({ amount: 120, date: '2026-10-12' }), slip({ amount: 130, date: '2026-10-12' }));
    sent.length = 0;
    await call([
      { type: 'message', replyToken: 't2', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'm1' } },
      { type: 'message', replyToken: 't3', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'm2' } },
    ]);
    check('ส่ง 2 รูปพร้อมกัน → ตอบครบทั้ง 2 (ของเดิมอ่านแค่รูปแรก)', sent.length === 2 && sent.every(m => J(m).includes('จ่ายเงิน')));
    const postback = dataOf(sent[0], 'inbox\\|accept');
    sent.length = 0;
    await call([{ type: 'postback', replyToken: 't4', source: { userId: 'Uline-north' }, postback: { data: postback } }]);
    check('กด "ยืนยันบันทึก" ใน LINE → การ์ดบันทึกแล้ว', J(sent[0]).includes('บันทึกแล้ว'));

    sent.length = 0;
    await call([{ type: 'message', replyToken: 't5', source: { userId: 'U-unknown' }, message: { type: 'text', text: 'กาแฟ 50' } }]);
    check('LINE ที่ยังไม่ผูก → บอก LINE ID ให้ไปลงทะเบียน', sent[0]?.messages?.[0]?.text.includes('U-unknown'));

    let summaryCalled = false;
    await inbox.handleLedgerInbox(new Request('https://x/api/line-webhook', { method: 'POST', body: JSON.stringify({ events: [
      { type: 'message', replyToken: 't6', source: { userId: 'Uline-north' }, message: { type: 'text', text: 'วันนี้' } }] }) }),
      env, new URL('https://x/api/line-webhook'), {}, '', { summary: async () => { summaryCalled = true; } });
    check('"วันนี้" → ส่งต่อให้คำสั่งสรุปเดิม', summaryCalled);
  } finally { globalThis.fetch = realFetch; }
}

console.log('\n── อ่านเอกสารผ่าน Gemini Files API (กันเกินเพดาน CPU) ──');
{
  const calls = [];
  const realFetch = globalThis.fetch;
  const geminiReply = slip({ amount: 58300, date: '2026-09-29', sender: { name: 'นาย ปรัชญา', bank: 'กสิกรไทย', account: 'xxx-x-x1111-x' },
    receiver: { name: 'น.ส. นารีรัตน์', bank: 'กรุงศรี', account: 'xxx-x-x8624-x' }, memo: 'Chaiyapruk Villaggio' });
  globalThis.fetch = async (u, init) => {
    calls.push({ u: String(u), init });
    if (String(u).includes('/upload/v1beta/files')) return new Response(JSON.stringify({ file: { uri: 'https://files/abc' } }));
    if (String(u).includes(':generateContent')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply) }] } }] }));
    throw new Error('unexpected ' + u);
  };
  try {
    const realEnv = { ...env, GEMINI_API_KEY: 'k', __extractOverride: undefined };
    const out = await inbox.ingestFile(realEnv, user, { bytes: fakeFile(), mime: 'image/jpeg', source: 'LINE' });
    const gen = calls.find(c => c.u.includes(':generateContent'));
    const up = calls.find(c => c.u.includes('/upload/'));
    check('ส่งไบต์ดิบขึ้น Files API (ไม่แปลง base64)', up && up.init.body instanceof Uint8Array && up.init.headers['X-Goog-Upload-Protocol'] === 'raw');
    check('คำขออ่านอ้างไฟล์ด้วย fileUri ไม่มี inlineData', gen && gen.init.body.includes('"fileUri":"https://files/abc"') && !gen.init.body.includes('inlineData'));
    check('อ่านแล้วประมวลผลต่อได้ (จ่ายจาก A02 ที่จำไว้)', out.outcome === 'SUGGESTED' && out.legs?.[0]?.account_id === 'A02', out.outcome);

    calls.length = 0;
    globalThis.fetch = async (u, init) => {
      calls.push({ u: String(u), init });
      if (String(u).includes('/upload/')) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(slip({ amount: 11 })) }] } }] }));
    };
    await inbox.ingestFile(realEnv, user, { bytes: fakeFile(), mime: 'image/jpeg', source: 'WEB' });
    check('อัปโหลดไม่ได้ → ถอยไปใช้ base64 แบบเดิม', calls.find(c => c.u.includes(':generateContent'))?.init.body.includes('inlineData'));
  } finally { globalThis.fetch = realFetch; }
}

console.log('\n── อ่านเอกสารที่ค้างใหม่ ("อ่านใหม่") ──');
{
  // จำลองเอกสารที่ถูกตัดกลางทาง: มีไฟล์ใน R2 แต่สถานะค้าง READING
  const key = 'ledger-docs/Fam_Default/DOC-STUCK.jpg';
  r2.set(key, new Uint8Array([1, 2, 3]));
  db.prepare(`INSERT INTO LedgerDocs (doc_id, family_id, uploaded_by, source, file_key, file_hash, mime, status, created_at)
    VALUES ('DOC-STUCK','Fam_Default','9North','LINE',?, 'h-stuck','image/jpeg','READING','2999-01-01T00:00:00Z')`).run(key);
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).includes('api.line.me')) { sent.push(JSON.parse(init.body)); return new Response('{}'); } throw new Error('net ' + u); };
  try {
    extractQueue.push(slip({ amount: 58300, date: '2026-09-29' }));
    await inbox.handleLedgerInbox(new Request('https://x/api/line-webhook', { method: 'POST', body: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r1', source: { userId: 'Uline-north' }, message: { type: 'text', text: 'อ่านใหม่' } }] }) }),
      env, new URL('https://x/api/line-webhook'), {}, '');
    const doc = db.prepare(`SELECT status FROM LedgerDocs WHERE doc_id='DOC-STUCK'`).get();
    check('เอกสารค้างถูกอ่านใหม่และสร้างรายการรอยืนยัน', doc.status === 'SUGGESTED', doc.status);
    check('LINE ตอบผลการอ่าน', J(sent[0]).includes('58,300.00'));
    db.prepare(`UPDATE LedgerDocs SET status='DISMISSED' WHERE status IN ('READING','ERROR')`).run();   // เคลียร์ของค้างจากเทสก่อนหน้า
    sent.length = 0;
    await inbox.handleLedgerInbox(new Request('https://x/api/line-webhook', { method: 'POST', body: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r2', source: { userId: 'Uline-north' }, message: { type: 'text', text: 'อ่านใหม่' } }] }) }),
      env, new URL('https://x/api/line-webhook'), {}, '');
    check('ไม่มีค้างแล้ว → บอกว่าไม่มี', sent[0]?.messages?.[0]?.text.includes('ไม่มีเอกสารค้าง'));
  } finally { globalThis.fetch = realFetch; }
}

console.log('\n── ส่งรูปเดิมซ้ำหลังค้าง → อ่านใหม่ให้เอง ──');
{
  const bytes = fakeFile();
  extractQueue.push(new Error('ถูกตัดกลางทาง'));
  const first = await inbox.ingestFile(env, user, { bytes, mime: 'image/jpeg', source: 'LINE' });
  check('ครั้งแรกอ่านไม่สำเร็จ (ERROR)', first.outcome === 'ERROR');
  extractQueue.push(slip({ amount: 4321, date: '2026-10-09' }));
  const again = await inbox.ingestFile(env, user, { bytes, mime: 'image/jpeg', source: 'LINE' });
  check('ส่งรูปเดิมอีกครั้ง → อ่านใหม่ ไม่ตอบว่าซ้ำ', !again.duplicate && again.outcome === 'SUGGESTED', again.outcome);
  const third = await inbox.ingestFile(env, user, { bytes, mime: 'image/jpeg', source: 'LINE' });
  check('อ่านสำเร็จแล้ว ส่งอีก → ตอบว่าซ้ำตามปกติ', third.duplicate === true);
}

console.log('\n── LINE: ตอบ OK ทันที แล้วทำงานเบื้องหลัง ──');
{
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).includes('api-data.line.me')) return new Response(fakeFile(), { headers: { 'content-type': 'image/jpeg' } });
    if (String(u).includes('api.line.me')) { sent.push(JSON.parse(init.body)); return new Response('{}'); }
    throw new Error('net ' + u);
  };
  try {
    let pending = null;
    extractQueue.push(slip({ amount: 777, date: '2026-10-10' }));
    const res = await inbox.handleLedgerInbox(new Request('https://x/api/line-webhook', { method: 'POST', body: JSON.stringify({ events: [
      { type: 'message', replyToken: 'w1', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'mw' } }] }) }),
      env, new URL('https://x/api/line-webhook'), {}, '', { waitUntil: p => { pending = p; } });
    check('ตอบ LINE 200 ทันที ก่อนงานเสร็จ', res.status === 200 && pending instanceof Promise && sent.length === 0);
    await pending;
    check('งานเบื้องหลังเสร็จแล้วส่งผลกลับ LINE', sent.length === 1 && J(sent[0]).includes('777.00'));
  } finally { globalThis.fetch = realFetch; }
}

console.log('\n── บันทึกช่วยจำ → รายละเอียด · การ์ด LINE · หน้าแก้ไขด่วน ──');
{
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).includes('api-data.line.me')) return new Response(fakeFile(), { headers: { 'content-type': 'image/jpeg' } });
    if (String(u).includes('api.line.me')) { sent.push(JSON.parse(init.body)); return new Response('{}'); }
    throw new Error('net ' + u);
  };
  const hook = (events) => inbox.handleLedgerInbox(new Request('https://api.example/api/line-webhook', { method: 'POST', body: JSON.stringify({ events }) }),
    env, new URL('https://api.example/api/line-webhook'), {}, '');
  try {
    // 1) บันทึกช่วยจำ
    const memoSlip = slip({ amount: 16215, date: '2026-09-29', memo: 'Chaiyapruk Villaggio',
      receiver: { name: 'น.ส. นารีรัตน์', bank: 'กรุงศรี', account: 'xxx-x-x8624-x' } });
    const out = await ingest(memoSlip);
    const t1 = out.legs?.[0]?.transaction_id;
    check('บันทึกช่วยจำบนสลิปไปอยู่ในรายละเอียดรายการ', lines(t1)[0]?.note === 'Chaiyapruk Villaggio');

    // 2) การ์ดรอยืนยัน
    sent.length = 0;
    extractQueue.push(slip({ amount: 250, date: '2026-10-10', memo: 'ค่าน้ำแข็ง', receiver: { name: 'ร้านใหม่เอี่ยม', bank: 'SCB', account: 'xxx-x-x4444-x' } }));
    await hook([{ type: 'message', replyToken: 'c1', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'mc1' } }]);
    const card = sent[0]?.messages?.[0];
    const cj = J(card);
    check('ตอบเป็นการ์ด (flex) แยกหัวข้อ วันที่/บัญชี/รายการ/หมวด', card?.type === 'flex' && ['วันที่', 'จากบัญชี', 'รายการ', 'หมวด'].every(w => cj.includes(w)));
    check('การ์ดแสดงชื่อบัญชีแบบไม่มีรหัส', cj.includes('BK KBANK') && !cj.includes('[A02]'));
    check('การ์ดแสดงบันทึกช่วยจำ + วันที่แบบไทย', cj.includes('ค่าน้ำแข็ง') && cj.includes('10 ต.ค. 2569'));
    check('มีปุ่ม ยืนยัน · เปลี่ยนหมวด · แก้ไข(ลิงก์) · ไม่ต้องบันทึก', !!dataOf(card, 'inbox\\|accept') && !!dataOf(card, 'inbox\\|cats') && cj.includes('/ledger/quick.html?doc=') && !!dataOf(card, 'inbox\\|dismiss'));
    const docId = dataOf(card, 'inbox\\|accept').split('|')[2];

    // 3) เปลี่ยนหมวดในแชท
    sent.length = 0;
    await hook([{ type: 'postback', replyToken: 'c2', source: { userId: 'Uline-north' }, postback: { data: `inbox|cats|${docId}` } }]);
    const items = sent[0]?.messages?.[0]?.quickReply?.items || [];
    check('กด "เปลี่ยนหมวด" → ตัวเลือกหมวดเป็นชื่อ (ไม่มีรหัส) + ปุ่มหมวดอื่น', items.length >= 2 && items.some(i => i.action.label === 'Food & Beverage') && items.at(-1).action.type === 'uri');
    sent.length = 0;
    await hook([{ type: 'postback', replyToken: 'c3', source: { userId: 'Uline-north' }, postback: { data: `inbox|setcat|${docId}|T01` } }]);
    const doc3 = db.prepare(`SELECT transaction_id FROM LedgerDocs WHERE doc_id=?`).get(docId);
    check('เลือกหมวดแล้ว → บรรทัดเปลี่ยนเป็น T01 ยังรอยืนยัน', lines(doc3.transaction_id)[0].category_id === 'T01' && tx(doc3.transaction_id).status === 'PENDING_REVIEW');
    check('ตอบการ์ดใหม่ที่หมวดเปลี่ยนแล้ว', J(sent[0]).includes('Food & Beverage') && J(sent[0]).includes('เปลี่ยนหมวดแล้ว'));

    // 4) หน้าแก้ไขด่วน
    const token = await inbox.signDocLink(env, docId);
    const q = (method, body, t = token, extra = '') => inbox.handleLedgerInbox(
      new Request(`https://api.example/api/inbox/quick/${docId}${extra}?t=${t}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
      env, new URL(`https://api.example/api/inbox/quick/${docId}${extra}?t=${t}`), {}, '');
    check('ลิงก์ปลอม → 403', (await q('GET', null, '123.abc')).status === 403);
    const view = await (await q('GET')).json();
    check('เปิดหน้าแก้ไข: ได้รายการ บัญชีเป็นชื่อ หมวดเรียงตามที่ใช้บ่อย', view.tx?.total_amount === -250 && view.accounts.some(a => a.name === 'BK KBANK')
      && view.categories[0]?.category_id === 'T01' && view.pending === true);
    check('เปิดรูปสลิปจากหน้าแก้ไขได้', (await q('GET', null, token, '/file')).status === 200);
    const saved = await (await q('POST', { date: '2026-10-09', amount: 260, note: 'ค่าน้ำแข็ง + ถุง', account_id: 'A06', category_id: 'T05' })).json();
    const t4 = doc3.transaction_id;
    check('บันทึกจากหน้าแก้ไข → ยืนยันแล้ว', saved.ok && tx(t4).status === 'CONFIRMED', saved);
    check('ค่าที่แก้ถูกบันทึก (วันที่ ยอด บัญชี หมวด รายละเอียด)', tx(t4).date === '2026-10-09' && tx(t4).total_amount === -260 && tx(t4).account_id === 'A06'
      && lines(t4)[0].category_id === 'T05' && lines(t4)[0].amount === -260 && lines(t4)[0].note === 'ค่าน้ำแข็ง + ถุง');
    check('จำร้านนี้ → T05 และจำบัญชีที่แก้ (KBANK|1111 → A06)', JSON.parse(db.prepare(`SELECT value FROM LedgerRules WHERE kind='PARTY' AND rkey=?`).get(match.partyKey('ร้านใหม่เอี่ยม'))?.value || '{}').lines?.[0]?.category_id === 'T05'
      && db.prepare(`SELECT value FROM LedgerRules WHERE kind='ACCOUNT' AND rkey='KBANK|1111'`).get()?.value === 'A06');
    const pushed = sent.find(m => m.to === 'Uline-north');
    check('บันทึกจากหน้าเว็บ → ส่งการ์ด "บันทึกแล้ว" ค่าใหม่เข้าแชทเอง (push)', !!pushed && J(pushed).includes('บันทึกแล้ว') && J(pushed).includes('Other Expense') && J(pushed).includes('ค่าน้ำแข็ง + ถุง'));
    check('บันทึกซ้ำ → แจ้งว่าบันทึกไปแล้ว', (await q('POST', { category_id: 'T01' })).status === 409);
    sent.length = 0;
    await hook([{ type: 'message', replyToken: 'l1', source: { userId: 'Uline-north' }, message: { type: 'text', text: '✅ บันทึกแล้ว ฿260.00 · ค่าน้ำแข็ง + ถุง' } }]);
    check('ข้อความ "✅ บันทึกแล้ว" จากหน้า LIFF → บอทตอบการ์ดที่เพิ่งแก้ (ไม่จดเป็นเงินสด)', sent.length === 1 && sent[0].replyToken === 'l1' && J(sent[0]).includes('ค่าน้ำแข็ง + ถุง') && J(sent[0]).includes('บันทึกแล้ว'));
    sent.length = 0;
    extractQueue.push(slip({ amount: 99, date: '2026-10-10' }));
    await inbox.handleLedgerInbox(new Request('https://api.example/api/line-webhook', { method: 'POST', body: JSON.stringify({ events: [
      { type: 'message', replyToken: 'l2', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'ml2' } }] }) }),
      { ...env, LIFF_ID: '2000000000-abcd' }, new URL('https://api.example/api/line-webhook'), {}, '');
    check('ตั้ง LIFF_ID แล้ว → ปุ่มแก้ไขเปิดผ่าน liff.line.me', J(sent[0]).includes('https://liff.line.me/2000000000-abcd?doc=') && J(sent[0]).includes('lid=2000000000-abcd'));
    db.prepare(`UPDATE LedgerRules SET value='A02' WHERE kind='ACCOUNT' AND rkey='KBANK|1111'`).run();   // คืนค่าให้เทสอื่น

    // 5) สลิปที่ยังไม่รู้บัญชี: การ์ดเลือกบัญชีเป็นชื่อ + เลือกบัญชีจากหน้าแก้ไขได้
    sent.length = 0;
    extractQueue.push(slip({ amount: 133, date: '2026-09-23', sender: { name: 'BOOKKEEPER CO.,LTD.', bank: 'Kasikornbank', account: 'xxx-x-x7318-x' } }));
    await hook([{ type: 'message', replyToken: 'c4', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'mc4' } }]);
    const ask = J(sent[0]);
    check('การ์ดเลือกบัญชี: ปุ่มเป็นชื่อบัญชี ไม่มีรหัส', ask.includes('จ่ายจาก BK KBANK') && !ask.includes('จ่ายจาก A02') && ask.includes('บัญชีอื่น'));
    const askDoc = dataOf(sent[0], 'inbox\\|dismiss').split('|')[2];
    const t5 = await inbox.signDocLink(env, askDoc);
    const res5 = await inbox.handleLedgerInbox(new Request(`https://api.example/api/inbox/quick/${askDoc}?t=${t5}`, { method: 'POST',
      body: JSON.stringify({ account_id: 'A02', side: 'OUT', category_id: 'T05', note: 'ค่าธรรมเนียม' }) }), env,
      new URL(`https://api.example/api/inbox/quick/${askDoc}?t=${t5}`), {}, '');
    const d5 = db.prepare(`SELECT status, transaction_id FROM LedgerDocs WHERE doc_id=?`).get(askDoc);
    check('เลือกบัญชี+หมวดในหน้าแก้ไข → สร้างและยืนยันในครั้งเดียว', res5.status === 200 && d5.status === 'DONE' && tx(d5.transaction_id).status === 'CONFIRMED' && lines(d5.transaction_id)[0].category_id === 'T05');
  } finally { globalThis.fetch = realFetch; }
}

console.log('\n── statement: แก้เครื่องหมาย / คีย์คู่ค้า / จับคู่ (ฟังก์ชันล้วน) ──');
{
  const f = match.fixStatementSigns([{ amount: 100, balance: 900 }, { amount: 50, balance: 950 }, { amount: -20, balance: 930 }], 1000);
  check('AI ใส่ "เข้า" แต่ยอดคงเหลือลด → กลับเป็นออก', f.lines[0].amount === -100 && f.flipped === 1 && f.gap === 0);
  const miss = match.fixStatementSigns([{ amount: -100, balance: 900 }, { amount: -20, balance: 830 }], 1000, 830);
  check('อ่านตกบรรทัด → ผลรวมไม่เท่ายอดปิด (gap ≠ 0)', miss.gap === -50, miss);
  const nob = match.fixStatementSigns([{ amount: -100, balance: null }, { amount: 30, balance: null }], null, null);
  check('บัตรเครดิตไม่มียอดคงเหลือ → ไม่แตะเครื่องหมาย', nob.lines[0].amount === -100 && nob.lines[1].amount === 30 && nob.gap === null);
  check('คีย์คู่ค้าไม่สนเลขบัญชี', match.statementPartyKey('TR fr 123-4-56789-0 นาย สมชาย ใจดี') === match.statementPartyKey('TR fr 999-9 สมชาย ใจดี'));
  check('คีย์คู่ค้าตัด x1234 / บจก.', match.statementPartyKey('โอนเงินพร้อมเพย์ x1234 บจก. ABC') === 'abc');
  const m = match.matchStatementLines([{ key: 'a', date: '2026-10-01', amount: -100 }, { key: 'b', date: '2026-10-03', amount: -100 }, { key: 'c', date: '2026-10-03', amount: -5 }],
    [{ transaction_id: 't1', date: '2026-10-03', total_amount: -100 }, { transaction_id: 't2', date: '2026-10-01', total_amount: -100 }]);
  check('ยอดซ้ำสองรายการ → จับคู่ตามวันที่ใกล้สุด', m.get('a')?.transaction_id === 't2' && m.get('b')?.transaction_id === 't1' && !m.has('c'));
  const r = match.matchStatementLines([{ key: 'a', date: '2026-10-20', amount: -70, ref_code: 'XR9' }], [{ transaction_id: 't9', date: '2026-10-01', total_amount: -70, ref_code: 'XR9' }]);
  check('เลขอ้างอิงตรง → จับคู่แม้วันห่าง', r.get('a')?.score === 100);
}

console.log('\n── statement: นำเข้า → จับคู่ → สร้างที่ขาด → กระทบยอด ──');
{
  // บัญชี A09 (SCB): ยอดยกมา 10,000 · มีในระบบแล้ว 2 รายการ (จากสลิป 1 · ยืนยันแล้ว 1)
  db.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, time, total_amount, status, source, created_by_user_id) VALUES
    ('S-OPEN','A09','2026-08-31',NULL,10000,'CONFIRMED','WEB_GRID','9North'),
    ('S-SLIP','A09','2026-09-02','10:05:00',-1250,'PENDING_REVIEW','LINE_SLIP','9North'),
    ('S-SAL','A09','2026-09-25',NULL,30000,'CONFIRMED','WEB_GRID','9North'),
    ('S-EXTRA','A09','2026-09-15',NULL,-99,'CONFIRMED','WEB_GRID','9North')`).run();
  for (const [id, amt] of [['S-OPEN', 10000], ['S-SLIP', -1250], ['S-SAL', 30000], ['S-EXTRA', -99]])
    db.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, type) VALUES (?,?,?,?,?)`).run('DT-' + id, id, amt, 'T01', amt < 0 ? 'EXPENSE' : 'INCOME');
  // ร้านเดิมเคยยืนยันมาแล้ว 3 ครั้ง (แบบหมวด T01) → บรรทัดใหม่ของร้านนี้ยืนยันให้เอง
  db.prepare(`INSERT INTO LedgerRules (rule_id, family_id, kind, rkey, value, hits) VALUES ('R-ST','Fam_Default','PARTY',?,?,3)`)
    .run(match.statementPartyKey('ร้านกาแฟดอยช้าง'), JSON.stringify({ lines: [{ category_id: 'T01', entity_id: 'Ent_North', type: 'EXPENSE', amount: 85, wht: 0, share: 1, wht_rate: 0 }] }));
  const stmtJson = {
    period_from: '2026-09-01', period_to: '2026-09-30', opening_balance: 10000, closing_balance: 38365,
    lines: [
      { date: '2026-09-02', time: '10:03:00', description: 'TR to xxx1234 ร้านข้าวมันไก่', withdrawal: 0, deposit: 1250, balance: 8750 },  // AI ใส่ช่องผิด
      { date: '2026-09-10', description: 'ร้านกาแฟดอยช้าง', withdrawal: 85, deposit: 0, balance: 8665 },
      { date: '2026-09-12', description: 'TR fr 111-2 นาย ลูกค้า ใหม่', withdrawal: 0, deposit: 2000, balance: 10665 },
      { date: '2026-09-20', description: 'ค่าธรรมเนียม', withdrawal: 300, deposit: 0, balance: 10365 },
      { date: '2026-09-26', description: 'SALARY', withdrawal: 0, deposit: 30000, balance: 40365 },
      { date: '2026-09-28', description: 'ATM', withdrawal: 2000, deposit: 0, balance: 38365 },
    ],
  };
  env.__statementOverride = async () => structuredClone(stmtJson);
  const imp = await inbox.importStatement(env, user, { account_id: 'A09', files: [{ bytes: fakeFile(), mime: 'image/jpeg' }], file_name: 'scb-sep.pdf' });
  const byDesc = d => imp.lines.find(l => l.description.includes(d));
  check('นำเข้าได้ 6 บรรทัด', imp.lines?.length === 6, imp.error);
  check('แก้เครื่องหมายจากยอดคงเหลือ (1,250 เป็นเงินออก)', byDesc('ข้าวมันไก่').amount === -1250 && imp.import.flipped === 1);
  check('จับคู่กับสลิปที่จดไว้แล้ว (เวลาใกล้กัน)', byDesc('ข้าวมันไก่').status === 'MATCHED' && byDesc('ข้าวมันไก่').transaction_id === 'S-SLIP');
  check('เงินเดือนห่าง 1 วัน → จับคู่', byDesc('SALARY').status === 'MATCHED' && byDesc('SALARY').transaction_id === 'S-SAL');
  check('ที่เหลือยังไม่มีในระบบ 4 บรรทัด', imp.summary.new === 4 && imp.summary.matched === 2);
  check('มีในระบบแต่ไม่มีใน statement (99 บาท)', imp.system_only.length === 1 && imp.system_only[0].transaction_id === 'S-EXTRA');
  check('ผลรวมบรรทัดตรงกับยอดปิด (AI อ่านครบ)', imp.summary.read_gap === 0);
  check('ยอดในระบบยังต่างจากธนาคาร', imp.summary.balance_gap !== 0);

  const stmtId = imp.statement.stmt_id;
  const c1 = await inbox.createFromStatement(env, user, stmtId, {});
  check('สร้างรายการที่ขาด 4 รายการ', c1.created === 4 && c1.remaining === 0, c1);
  check('ร้านที่ยืนยันแบบเดิม 3 ครั้ง → ยืนยันให้เอง', c1.auto_confirmed === 1);
  const v = await inbox.statementView(env, user, stmtId);
  const cafe = v.lines.find(l => l.description.includes('ดอยช้าง'));
  check('ร้านกาแฟ: หมวด T01 ยืนยันแล้ว', cafe.status === 'CREATED' && cafe.tx.status === 'CONFIRMED' && lines(cafe.transaction_id)[0].category_id === 'T01');
  const cust = v.lines.find(l => l.description.includes('ลูกค้า'));
  const custDoc = db.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=?`).get(cust.doc_id);
  check('ลูกค้าใหม่ → รอยืนยันในกล่อง (STATEMENT_LINE)', custDoc.status === 'SUGGESTED' && custDoc.doc_type === 'STATEMENT_LINE' && tx(cust.transaction_id).source === 'PDF_IMPORT');
  const box = await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox'), env, new URL('https://api.example/api/inbox'), {}, '9North');
  check('อยู่ในกล่องรอเคลียร์', (await box.json()).docs.some(d => d.doc_id === cust.doc_id));

  // แตกบรรทัด: ลูกค้าโอน 2,000 = ค่าทำบัญชี 1,500 (บริษัท S01) + ค่าบริการ 500 (S05)
  const bad = await inbox.editDoc(env, user, cust.doc_id, { details: [{ amount: 1500, category_id: 'Account', entity_id: 'Ent_Co_S01' }, { amount: 400, category_id: 'Service', entity_id: 'Ent_Co_S05' }] });
  check('ยอดไม่ลงตัว → ไม่ยอมบันทึก บอกส่วนต่าง', bad.status === 400 && bad.gap === 100, bad);
  const noPerm = await inbox.editDoc(env, user, cust.doc_id, { details: [{ amount: 2000, category_id: 'Account', entity_id: 'Ent_Other' }] });
  check('บริษัทที่ไม่มีสิทธิ์ → ปฏิเสธ', noPerm.status === 403);
  const ok = await inbox.editDoc(env, user, cust.doc_id, { date: '2026-09-13', confirm: true, details: [
    { amount: 1500, category_id: 'Account', entity_id: 'Ent_Co_S01', note: 'ค่าทำบัญชี' }, { amount: 500, category_id: 'Service', entity_id: 'Ent_Co_S05' }] });
  const custLines = lines(cust.transaction_id);
  check('แตก 2 บรรทัด + ยืนยัน', ok.status === 'DONE' && custLines.length === 2 && custLines[1].category_id === 'Service' && tx(cust.transaction_id).status === 'CONFIRMED' && tx(cust.transaction_id).date === '2026-09-13', ok);
  check('ประเภทบรรทัดตามหมวด (INCOME)', custLines.every(l => l.type === 'INCOME'));
  const learned = db.prepare(`SELECT value FROM LedgerRules WHERE kind='PARTY' AND rkey=?`).get(match.statementPartyKey('TR fr 222 นาย ลูกค้า ใหม่'));
  check('จำแบบแตกบรรทัดของลูกค้าคนนี้ (คีย์ไม่สนเลขบัญชี)', !!learned && JSON.parse(learned.value).lines.length === 2);

  // ATM → ไม่ต้องบันทึก → บรรทัดใน statement เป็น "ข้าม"
  const atm = v.lines.find(l => l.description === 'ATM');
  await inbox.runAction(env, user, atm.doc_id, 'dismiss');
  const v2 = await inbox.statementView(env, user, stmtId);
  check('ไม่บันทึกจากกล่อง → บรรทัดเป็น IGNORED', v2.lines.find(l => l.description === 'ATM').status === 'IGNORED' && !tx(atm.transaction_id));
  // จับคู่เอง: ค่าธรรมเนียม 300 → ยกเลิกรายการที่สร้าง แล้วจับคู่กับรายการที่มีอยู่
  const fee = v2.lines.find(l => l.description === 'ค่าธรรมเนียม');
  await inbox.runAction(env, user, fee.doc_id, 'dismiss');
  db.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, status, source, created_by_user_id) VALUES ('S-FEE','A09','2026-09-24',-300,'CONFIRMED','WEB_GRID','9North')`).run();
  db.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, type) VALUES ('DT-S-FEE','S-FEE',-300,'T05','EXPENSE')`).run();
  await inbox.statementLineAction(env, user, stmtId, fee.line_id, { action: 'reset' });
  const v3 = await inbox.statementView(env, user, stmtId);
  const fee3 = v3.lines.find(l => l.line_id === fee.line_id);
  check('บรรทัดที่ยังไม่มีคู่ → เสนอรายการยอดเท่ากันในช่วง 7 วัน', fee3.status === 'NEW' && fee3.candidates[0]?.transaction_id === 'S-FEE');
  const mm = await inbox.statementLineAction(env, user, stmtId, fee.line_id, { action: 'match', transaction_id: 'S-FEE' });
  const wrong = await inbox.statementLineAction(env, user, stmtId, fee.line_id, { action: 'match', transaction_id: 'S-EXTRA' });
  check('จับคู่เองได้ · ยอดไม่เท่าจับไม่ได้', mm.ok && wrong.status === 400);

  // อัปโหลดฉบับเดิมซ้ำ → ทุกบรรทัดเป็น DUPLICATE ไม่สร้างซ้ำ
  const again = await inbox.importStatement(env, user, { account_id: 'A09', files: [{ bytes: fakeFile(), mime: 'image/jpeg' }] });
  check('อัปโหลดซ้ำ → ซ้ำทั้งหมด ไม่มีบรรทัดใหม่', again.summary.duplicate === 6 && again.summary.new === 0, again.summary);
  const c2 = await inbox.createFromStatement(env, user, again.statement.stmt_id, {});
  check('ฉบับซ้ำไม่สร้างรายการเพิ่ม', c2.created === 0);
  const list = await inbox.listStatements(env, user);
  check('รายการ statement 2 ฉบับ', list.statements.length === 2 && list.statements.some(x => x.account_name === 'SCB'));
  await inbox.deleteStatement(env, user, again.statement.stmt_id);
  const otherView = await inbox.statementView(env, other, stmtId);
  check('ครอบครัวอื่นเปิด statement ไม่ได้', otherView.status === 404);
  const bigOk = await inbox.importStatement(env, user, { account_id: 'X99', files: [{ bytes: fakeFile(), mime: 'image/jpeg' }] });
  check('บัญชีที่ไม่มีสิทธิ์ → ปฏิเสธ', bigOk.status === 403);

  // ทีละชุด: 20 บรรทัดใหม่ → สร้างได้ทีละ 8
  env.__statementOverride = async () => ({ period_from: '2026-11-01', period_to: '2026-11-30', lines: Array.from({ length: 20 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, description: `ร้าน ${i}`, withdrawal: 10 + i, deposit: 0, balance: null })) });
  const big = await inbox.importStatement(env, user, { account_id: 'A09', files: [{ bytes: fakeFile(), mime: 'image/jpeg' }] });
  const b1 = await inbox.createFromStatement(env, user, big.statement.stmt_id, {});
  check('สร้างทีละ 8 บรรทัด เหลือ 12', b1.created === 8 && b1.remaining === 12);
  const sel = await inbox.createFromStatement(env, user, big.statement.stmt_id, { line_ids: ['L20'] });
  check('เลือกสร้างเฉพาะบรรทัด', sel.created === 1 && sel.remaining === 0);
  /* จำลองหยุดกลางทาง: สร้างรายการแล้ว แต่บันทึกสถานะบรรทัดไม่ทัน → กดซ้ำต้องไม่เกิดรายการซ้อน */
  const sid = big.statement.stmt_id;
  const txBefore = db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c;
  const raw = JSON.parse(db.prepare(`SELECT lines FROM LedgerStatements WHERE stmt_id=?`).get(sid).lines);
  for (const l of raw) if (l.status === 'CREATED') Object.assign(l, { status: 'NEW', transaction_id: null, doc_id: null });
  db.prepare(`UPDATE LedgerStatements SET lines=? WHERE stmt_id=?`).run(JSON.stringify(raw), sid);
  for (let g = 0; g < 5; g++) { const r = await inbox.createFromStatement(env, user, sid, {}); if (!r.remaining) break; }
  const after = JSON.parse(db.prepare(`SELECT lines FROM LedgerStatements WHERE stmt_id=?`).get(sid).lines);
  check('กดซ้ำหลังหยุดกลางทาง: ไม่มีรายการซ้อน + ครบ 20 บรรทัด',
    after.filter(l => l.status === 'CREATED').length === 20 && db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c === txBefore + 11,
    { created: after.filter(l => l.status === 'CREATED').length, added: db.prepare(`SELECT COUNT(*) c FROM Transactions`).get().c - txBefore });
  delete env.__statementOverride;
}

console.log('\n── ยืนยัน/ลบจากเมนูเก่า "รอตรวจสอบ" → กล่องปิดตาม ──');
{
  const a = await ingest(slip({ amount: 321, date: '2026-10-06' }));
  const b = await ingest(slip({ amount: 654, date: '2026-10-06' }));
  const ta = db.prepare(`SELECT transaction_id FROM LedgerDocLinks WHERE doc_id=?`).get(a.doc.doc_id).transaction_id;
  const tb = db.prepare(`SELECT transaction_id FROM LedgerDocLinks WHERE doc_id=?`).get(b.doc.doc_id).transaction_id;
  db.prepare(`UPDATE Transactions SET status='CONFIRMED' WHERE transaction_id=?`).run(ta);   // /api/transactions/confirm
  db.prepare(`DELETE FROM Transactions WHERE transaction_id=?`).run(tb);                       // /api/transactions/delete
  const res = await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox'), env, new URL('https://api.example/api/inbox'), {}, '9North');
  const ids = (await res.json()).docs.map(d => d.doc_id);
  const st = id => db.prepare(`SELECT status FROM LedgerDocs WHERE doc_id=?`).get(id).status;
  check('ยืนยันจากเมนูเก่า → หายจากกล่อง (DONE)', !ids.includes(a.doc.doc_id) && st(a.doc.doc_id) === 'DONE');
  check('ลบจากเมนูเก่า → หายจากกล่อง (DISMISSED)', !ids.includes(b.doc.doc_id) && st(b.doc.doc_id) === 'DISMISSED');
}

console.log('\n── รวม "รอตรวจสอบ" เดิมเข้ากล่อง + เพิ่มรายการเอง ──');
{
  // รายการรอตรวจสอบจากทางเดิม (Excel/Bulk · PDF แบบเก่า) ที่ไม่มีเอกสาร
  db.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, time, total_amount, status, source, created_by_user_id, statement_desc) VALUES
    ('OLD-1','A02','2026-10-01',NULL,-250,'PENDING_REVIEW','WEB_GRID','9North','ค่าน้ำ'),
    ('OLD-2','A09','2026-10-02','09:00:00',1200,'PENDING_REVIEW','PDF_IMPORT','9North','TR fr 555 นาย เก่า'),
    ('OLD-X','X99','2026-10-02',NULL,-5,'PENDING_REVIEW','WEB_GRID','Other','ของครอบครัวอื่น')`).run();
  for (const [id, a] of [['OLD-1', -250], ['OLD-2', 1200], ['OLD-X', -5]])
    db.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, type) VALUES (?,?,?,?,?)`).run('DT-' + id, id, a, 'Cat_Uncategorized', a < 0 ? 'EXPENSE' : 'INCOME');
  const res = await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox?limit=300'), env, new URL('https://api.example/api/inbox?limit=300'), {}, '9North');
  const docs = (await res.json()).docs;
  const d1 = docs.find(d => d.transactions.some(t => t.transaction_id === 'OLD-1'));
  const d2 = docs.find(d => d.transactions.some(t => t.transaction_id === 'OLD-2'));
  check('รายการรอตรวจสอบเดิมขึ้นในกล่อง', !!d1 && !!d2 && d1.doc_type === 'MANUAL' && d2.doc_type === 'STATEMENT_LINE');
  check('ไม่ดึงรายการของครอบครัวอื่น', !docs.some(d => d.transactions.some(t => t.transaction_id === 'OLD-X')));
  const again = await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox?limit=300'), env, new URL('https://api.example/api/inbox?limit=300'), {}, '9North');
  check('เปิดซ้ำไม่สร้างเอกสารซ้ำ', (await again.json()).docs.filter(d => d.transactions.some(t => t.transaction_id === 'OLD-1')).length === 1);
  const ok = await inbox.editDoc(env, user, d1.doc_id, { confirm: true, details: [{ amount: -250, category_id: 'T05', entity_id: 'Ent_North', note: 'ค่าน้ำ' }] });
  check('ยืนยันรายการเดิมจากกล่องได้', ok.status === 'DONE' && tx('OLD-1').status === 'CONFIRMED');

  const m = await inbox.createManual(env, user, { account_id: 'A02', amount: -300, note: 'ค่าน้ำ', date: '2026-10-09' });
  const mt = tx(m.transaction_id);
  check('เพิ่มรายการเอง → รอยืนยัน + ใช้หมวดที่เพิ่งจำ (ค่าน้ำ → T05)', m.ok && mt.status === 'PENDING_REVIEW' && mt.source === 'WEB_GRID' && lines(m.transaction_id)[0].category_id === 'T05' && m.how === 'template-scaled');
  const tot = await inbox.editDoc(env, user, m.doc_id, { total_amount: -320, details: [{ amount: -320, category_id: 'T05', entity_id: 'Ent_North' }] });
  check('รายการที่จดเองแก้ยอดได้', tot.status === 'EDITED' && tx(m.transaction_id).total_amount === -320);
  const slipTot = await inbox.editDoc(env, user, d2.doc_id, { total_amount: 999, details: [{ amount: 999, category_id: 'Service' }] });
  check('รายการจาก statement แก้ยอดไม่ได้ (ยอดต้องตรงธนาคาร)', slipTot.status === 400);
  const bad = await inbox.createManual(env, user, { account_id: 'X99', amount: -1 });
  check('เพิ่มเองในบัญชีที่ไม่มีสิทธิ์ → ปฏิเสธ', bad.status === 403);
}

console.log('\n── นำเข้า Excel (ย้ายจากหน้าเดิม) ──');
{
  const out = await inbox.importRows(env, user, { groups: [
    { row: 2, date: '2026-10-03', account_id: 'A02', total_amount: -10010, note: 'ค่าเช่า ต.ค.', details: [{ amount: -10000, fee: 10, category_id: 'T05' }] },
    { row: 3, date: '2026-10-04', account_id: 'A09', total_amount: 9700, note: 'ค่าบริการ W16', details: [{ amount: 10000, wht: 300, category_id: 'Service', entity_id: 'Ent_Co_S01' }] },
    { row: 4, date: '2026-10-04', account_id: 'A09', total_amount: 5000, note: 'แตก 2 บริษัท', details: [{ amount: 3000, category_id: 'Account', entity_id: 'Ent_Co_S01' }, { amount: 2000, category_id: 'Audit', entity_id: 'Ent_Co_S05' }] },
    { row: 5, date: '2026-10-05', account_id: 'A02', total_amount: -500, note: 'ยอดไม่ลง', details: [{ amount: -400, category_id: 'T05' }] },
    { row: 6, date: '2026-10-05', account_id: 'X99', total_amount: -1, note: 'บัญชีคนอื่น' },
    { row: 7, date: '2026-10-05', account_id: 'A02', total_amount: -99, note: 'ไม่มีหมวด', details: [{ amount: 99 }] },
  ] });
  const r = n => out.results.find(x => x.row === n);
  check('จ่ายพร้อมค่าธรรมเนียม 10,000 + 10 = 10,010 ลงตัว', r(2).ok && lines(r(2).transaction_id)[0].fee === 10);
  check('รับหัก ณ ที่จ่าย 10,000 − 300 = 9,700 ลงตัว', r(3).ok && lines(r(3).transaction_id)[0].wht === 300);
  check('แตก 2 บริษัท', r(4).ok && lines(r(4).transaction_id).length === 2);
  check('ยอดไม่ลงตัว → บอกแถวและส่วนต่าง', /ต่าง/.test(r(5).error || ''));
  check('บัญชีที่ไม่มีสิทธิ์ → ปฏิเสธ', /ไม่พบบัญชี/.test(r(6).error || ''));
  check('ยอดย่อยใส่เป็นบวก → ใช้เครื่องหมายยอดรวม + ไม่มีหมวด = รอระบุ', r(7).ok && lines(r(7).transaction_id)[0].amount === -99 && lines(r(7).transaction_id)[0].category_id === 'Cat_Uncategorized');
  check('นำเข้าแล้วอยู่ในกล่อง (EXCEL รอยืนยัน)', db.prepare(`SELECT doc_type, status FROM LedgerDocs WHERE doc_id=?`).get(r(2).doc_id)?.doc_type === 'EXCEL' && tx(r(2).transaction_id).status === 'PENDING_REVIEW');
  const again = await inbox.importRows(env, user, { groups: [{ row: 2, date: '2026-10-03', account_id: 'A02', total_amount: -10010, note: 'ค่าเช่า ต.ค.', details: [{ amount: -10000, fee: 10, category_id: 'T05' }] }] });
  check('นำเข้าไฟล์เดิมซ้ำ → ข้าม ไม่สร้างซ้ำ', again.results[0].duplicate === true);
  const conf = await inbox.importRows(env, user, { confirmed: true, groups: [{ row: 9, date: '2026-10-06', account_id: 'A02', total_amount: -42, note: 'bulk ยืนยันเลย', details: [{ amount: -42, category_id: 'T01' }] }] });
  check('Bulk แบบยืนยันแล้ว → CONFIRMED ไม่เข้ากล่อง', tx(conf.results[0].transaction_id).status === 'CONFIRMED' && !conf.results[0].doc_id);
  const many = await inbox.importRows(env, user, { groups: Array.from({ length: 12 }, (_, i) => ({ row: 100 + i, date: '2026-10-07', account_id: 'A02', total_amount: -(i + 1), note: `ชุด ${i}` })) });
  check('รับทีละ 8 ชุดต่อคำขอ', many.processed === 8 && many.results.length === 8);
}

console.log('\n── ประวัติ + แก้/ลบรายการที่ยืนยันแล้ว ──');
{
  const H = async q => (await (await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox/history?' + q), env, new URL('https://api.example/api/inbox/history?' + q), {}, '9North')).json());
  const sep = await H('month=2026-09');
  check('ประวัติ ก.ย. มีรายการ + บรรทัดย่อย', sep.transactions.length > 3 && sep.transactions.every(t => t.date.startsWith('2026-09')) && sep.transactions.some(t => t.details.length));
  check('ประวัติไม่มีรายการของครอบครัวอื่น', !sep.transactions.some(t => t.account_id === 'X99'));
  const sal = (await H('month=2026-09&q=30000')).transactions;
  check('ค้นด้วยยอดเงินในเดือน', sal.some(t => t.transaction_id === 'S-SAL'));
  const allQ = (await H('q=ค่าเช่า')).transactions;
  check('ค้นทุกเดือนด้วยคำ', allQ.length >= 1);
  const ed = await inbox.editTransaction(env, user, 'S-SAL', { details: [{ amount: 20000, category_id: 'Account', entity_id: 'Ent_Co_S01' }, { amount: 10000, category_id: 'Service', entity_id: 'Ent_Co_S05' }] });
  check('แตกบรรทัดรายการที่ยืนยันแล้ว', ed.ok && lines('S-SAL').length === 2 && tx('S-SAL').status === 'CONFIRMED');
  const badTot = await inbox.editTransaction(env, user, 'S-SLIP', { total_amount: -1 });
  check('รายการจากสลิปแก้ยอดไม่ได้', badTot.status === 400);
  const gap = await inbox.editTransaction(env, user, 'S-SAL', { details: [{ amount: 1, category_id: 'Service' }] });
  check('ยอดไม่ลงตัว → ไม่บันทึก', gap.status === 400 && lines('S-SAL').length === 2);
  const otherEdit = await inbox.editTransaction(env, other, 'S-SAL', { date: '2026-09-01' });
  check('ครอบครัวอื่นแก้ไม่ได้', otherEdit.status === 404);
  const del = await inbox.deleteTransaction(env, user, 'S-EXTRA');
  check('ลบรายการ + รายการย่อย', del.ok && !tx('S-EXTRA') && lines('S-EXTRA').length === 0);
}

console.log('\n── ลูกหนี้ / เจ้าหนี้ ──');
{
  db.exec(`INSERT INTO Captions VALUES ('CAP_AR','Fam_Default','[AR] ลูกหนี้/เงินให้ยืม','ASSET',NULL),('CAP_AP','Fam_Default','[AP] เจ้าหนี้/เงินกู้','LIABILITY',NULL),('CAP_INV','Fam_Default','ลงทุน','ASSET','INVESTMENT');
    INSERT INTO Categories (category_id, family_id, name, caption_id, default_type) VALUES ('LOAN','Fam_Default','[L01] เงินให้ยืม','CAP_AR',NULL),('BORROW','Fam_Default','[B01] เงินกู้','CAP_AP',NULL),('STOCK','Fam_Default','หุ้น','CAP_INV',NULL),('DEPOSIT','Fam_Default','เงินมัดจำ','CAP_AR',NULL);`);
  const c1 = await inbox.createContact(env, user, { name: 'พี่เอ' });
  const c1b = await inbox.createContact(env, user, { name: 'พี่เอ' });
  check('เพิ่มคู่ค้า · ชื่อซ้ำใช้ของเดิม', c1.ok && c1b.existed && c1b.contact_id === c1.contact_id);
  const c2 = await inbox.createContact(env, user, { name: 'ธนาคารบ้าน' });
  const lend = await inbox.createManual(env, user, { account_id: 'A02', amount: -5000, category_id: 'LOAN', contact_id: c1.contact_id, confirm: true, note: 'ให้พี่เอยืม', date: '2026-08-01' });
  check('ให้ยืม → ยืนยันเลย (ไม่เข้ากล่อง)', lend.ok && lend.confirmed && tx(lend.transaction_id).status === 'CONFIRMED' && lines(lend.transaction_id)[0].contact_id === c1.contact_id);
  await inbox.createManual(env, user, { account_id: 'A02', amount: 2000, category_id: 'LOAN', contact_id: c1.contact_id, confirm: true, note: 'พี่เอคืน', date: '2026-09-01' });
  await inbox.createManual(env, user, { account_id: 'A09', amount: 10000, category_id: 'BORROW', contact_id: c2.contact_id, confirm: true, note: 'กู้', date: '2026-07-01' });
  await inbox.createManual(env, user, { account_id: 'A09', amount: -4000, category_id: 'BORROW', contact_id: c2.contact_id, confirm: true, note: 'ผ่อน', date: '2026-08-01' });
  await inbox.createManual(env, user, { account_id: 'A02', amount: -3000, category_id: 'DEPOSIT', confirm: true, note: 'มัดจำบ้านเช่า', date: '2026-08-05' });
  await inbox.createManual(env, user, { account_id: 'A02', amount: -7000, category_id: 'STOCK', confirm: true, note: 'ซื้อหุ้น' });
  const pend = await inbox.createManual(env, user, { account_id: 'A02', amount: -999, category_id: 'LOAN', contact_id: c1.contact_id, note: 'ยังไม่ยืนยัน' });
  check('ไม่ส่ง confirm → รอยืนยัน', tx(pend.transaction_id).status === 'PENDING_REVIEW');
  const L = await inbox.listParties(env, user);
  const pa = L.parties.find(p => p.contact_id === c1.contact_id && p.side === 'AR');
  const pb = L.parties.find(p => p.contact_id === c2.contact_id && p.side === 'AP');
  const dep = L.parties.find(p => p.key === 'k:DEPOSIT');
  check('ลูกหนี้พี่เอ ค้าง 3,000 (ให้ 5,000 คืน 2,000) ไม่นับที่รอยืนยัน', pa?.balance === 3000 && pa.lent === 5000 && pa.repaid === 2000, pa);
  check('เจ้าหนี้ธนาคารบ้าน ค้าง 6,000', pb?.balance === 6000 && pb.lent === 10000 && pb.repaid === 4000, pb);
  check('ไม่มีคู่ค้า → ใช้หมวดเป็นราย (มัดจำ 3,000)', dep?.balance === 3000 && dep.name === 'เงินมัดจำ');
  check('ไม่นับเงินลงทุน', !L.parties.some(p => p.key === 'k:STOCK'));
  check('ยอดรวม ลูกหนี้ 6,000 · เจ้าหนี้ 6,000', L.totals.ar === 6000 && L.totals.ap === 6000 && L.totals.ar_n === 2, L.totals);
  const led = await inbox.partyLedger(env, user, 'c:' + c1.contact_id);
  check('ความเคลื่อนไหว + ยอดสะสม (ใหม่สุดก่อน)', led.AR.balance === 3000 && led.AR.lines[0].delta === -2000 && led.AR.lines[0].balance === 3000 && led.AR.lines[1].balance === 5000);
  const oth = await inbox.listParties(env, other);
  check('ครอบครัวอื่นไม่เห็น', oth.parties.length === 0);
  const badCat = await inbox.createManual(env, user, { account_id: 'A02', amount: -1, category_id: 'NOPE', confirm: true });
  check('หมวดไม่มีจริง → ปฏิเสธ', badCat.status === 400);
}

console.log('\n── รายงาน ──');
{
  const R = async qs => inbox.reportData(env, user, new URL('https://api.example/api/inbox/report?' + qs));
  await inbox.importRows(env, user, { confirmed: true, groups: [
    { row: 1, date: '2026-10-15', account_id: 'A09', total_amount: 9700, note: 'รายงาน: ค่าบริการ', details: [{ amount: 10000, wht: 300, category_id: 'Service', entity_id: 'Ent_Co_S01' }] },
    { row: 2, date: '2026-10-16', account_id: 'A02', total_amount: -9709.91, note: 'รายงาน: จ้างทำบัญชี', details: [{ amount: -9990, wht: 280.09, category_id: 'T05', entity_id: 'Ent_Co_S01' }] }] });
  const pnl = await R('kind=pnl&from=2026-10-01&to=2026-10-31');
  const inc = pnl.lines.filter(l => l.side === 'IN').reduce((t, l) => t + l.amount, 0);
  const exp = pnl.lines.filter(l => l.side === 'OUT').reduce((t, l) => t + l.amount, 0);
  check('กำไรขาดทุน ต.ค.: มีทั้งรับและจ่าย · ไม่นับโอน/ลูกหนี้', inc > 0 && exp < 0 && !pnl.lines.some(l => l.category_id === 'LOAN' || l.category_id === 'Bank_Transfer'));
  const s01 = await R('kind=pnl&from=2026-10-01&to=2026-10-31&entity=Ent_Co_S01');
  check('กรองบริษัท S01', s01.lines.length > 0 && s01.lines.every(l => l.entity_id === 'Ent_Co_S01'));
  const wht = await R('kind=wht&from=2026-01-01&to=2026-12-31');
  check('WHT ถูกหัก (รายรับ)', wht.rows.some(r => r.side === 'RECEIVED' && r.wht === 300 && r.base === 10000 && r.rate === 3));
  check('WHT เราหัก (รายจ่าย wht ติดลบ) แสดงด้วย', wht.rows.some(r => r.side === 'WITHHELD' && r.wht === 280.09));
  const tb = await R('kind=tb&from=2026-01-01&to=2026-12-31');
  check('งบทดลอง: เดบิต/เครดิตต่อหมวด', tb.rows.length > 3 && tb.rows.every(r => r.debit >= 0 && r.credit >= 0));
  const ex = await R('kind=export&from=2026-10-01&to=2026-10-31');
  check('ส่งออก 1 แถว = 1 บรรทัดย่อย', ex.rows.length > 5 && ex.rows.every(r => r.date.startsWith('2026-10')));
  const tooLong = await R('kind=export&from=2026-01-01&to=2026-12-31');
  check('ส่งออกเกิน 2 เดือน → ปฏิเสธ', tooLong.status === 400);
  const oth = await inbox.reportData(env, other, new URL('https://api.example/api/inbox/report?kind=pnl&from=2026-01-01&to=2026-12-31'));
  check('ครอบครัวอื่นไม่เห็นตัวเลขเรา', !oth.lines.some(l => l.entity_id && l.entity_id.startsWith('Ent_Co')));
}

console.log('\n── meta สำหรับหน้าเว็บ ──');
{
  db.prepare(`INSERT INTO Contacts (contact_id, family_id, name, contact_type, members) VALUES ('W16','Fam_Default','W16 Co','CUSTOMER',NULL),('PRIV','Fam_Default','ส่วนตัว Puii','OTHER','["Puii"]')`).run();
  const meta = await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox/meta'), env, new URL('https://api.example/api/inbox/meta'), {}, '9North');
  const m = await meta.json();
  check('บัญชีชื่อไม่มีรหัส + บริษัทที่มีสิทธิ์', m.accounts.some(a => a.name === 'BK KBANK') && m.entities.length === 3 && !m.accounts.some(a => a.account_id === 'X99'));
  check('หมวดเรียงตามที่ใช้บ่อย (มี uses)', m.categories.length > 3 && 'uses_out' in m.categories[0]);
  check('คู่ค้า: admin เห็นทุกคน (รวมของส่วนตัว)', m.contacts.some(c => c.contact_id === 'PRIV') && m.contacts.length === 4);
  const puiiMeta = await inbox.handleLedgerInbox(new Request('https://api.example/api/inbox/meta'), env, new URL('https://api.example/api/inbox/meta'), {}, 'Puii');
  const pm = await puiiMeta.json();
  check('Puii ยังไม่มีสิทธิ์บริษัท → ไม่เห็นบัญชี', pm.accounts.length === 0);
}

console.log('\n── ตรวจยอดทุกรายการที่ระบบสร้าง ──');
{
  const all = db.prepare(`SELECT transaction_id, total_amount FROM Transactions WHERE source != 'PDF_IMPORT' OR transaction_id LIKE 'TX-%'`).all();
  const bad = all.filter(t => Math.abs(match.balanceGap(t.total_amount, lines(t.transaction_id))) >= 0.005);
  check(`ทุกรายการลงตัว (${all.length} รายการ)`, bad.length === 0, bad.map(b => b.transaction_id).join(', '));
}

console.log('\n── 📥 อัปไว้ก่อน อ่านทีหลัง (v260) ──');
{
  insertStatementTx('TX-Q1', 'A01', '2026-10-20', -777.5, { desc: 'SHOPEE BANGKOK' });
  const q1 = await inbox.ingestFile(env, user, { bytes: fakeFile(), mime: 'image/jpeg', source: 'WEB', defer: true });
  const q2 = await inbox.ingestFile(env, user, { bytes: fakeFile(), mime: 'image/jpeg', source: 'WEB', defer: true });
  check('อัปแบบคิว: ตอบทันที ยังไม่อ่าน (QUEUED)', q1.outcome === 'QUEUED' && q1.doc.status === 'QUEUED' && extractQueue.length === 0);
  let st = await inbox.queueStatus(env, user.family_id); check('นับคิว 2', st.queued >= 2, st);
  extractQueue.push({ doc_type: 'ORDER', date: '2026-10-19', amount: 777.5, merchant: 'Shopee' }, new Error('อ่านไม่ออก'));
  const r = await inbox.processQueue(env, user.family_id, 4);
  const d1 = db.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=?`).get(q1.doc.doc_id), d2 = db.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=?`).get(q2.doc.doc_id);
  check('อ่านคิว: ใบสั่งซื้อ Shopee แนบกับรายการบัตรที่ยอดตรง', d1.status === 'DONE' && db.prepare(`SELECT 1 FROM LedgerDocLinks WHERE doc_id=? AND transaction_id='TX-Q1'`).get(q1.doc.doc_id), d1);
  check('รูปที่อ่านไม่ได้ → ERROR (ไม่ค้างในคิว)', d2.status === 'ERROR' && r.processed === 2 && r.remaining === 0, [d2.status, r]);
  db.prepare(`UPDATE LedgerDocs SET status='READING', updated_at='2000-01-01T00:00:00Z' WHERE doc_id=?`).run(q2.doc.doc_id);
  extractQueue.push(slip({ amount: 41 }));
  const r2b = await inbox.processQueue(env, user.family_id, 4);
  check('ค้าง READING นาน → กลับเข้าคิวแล้วอ่านใหม่', r2b.processed === 1 && db.prepare(`SELECT status FROM LedgerDocs WHERE doc_id=?`).get(q2.doc.doc_id).status !== 'READING', r2b);
  const dup = await inbox.ingestFile(env, user, { bytes: r2.get(db.prepare(`SELECT file_key FROM LedgerDocs WHERE doc_id=?`).get(q1.doc.doc_id).file_key), mime: 'image/jpeg', source: 'WEB', defer: true });
  check('อัปรูปเดิมซ้ำ → ไม่เพิ่มคิว', dup.duplicate === true, dup);
}

console.log('\n── 📦 รูปเดียวหลายคำสั่งซื้อ (v261) ──');
{
  insertStatementTx('TX-O1', 'A01', '2026-10-21', -159.25, { desc: 'SHOPEE BANGKOK' });
  insertStatementTx('TX-O2', 'A01', '2026-09-02', -88.5, { desc: 'SHOPEE BANGKOK' });
  db.prepare(`UPDATE TransactionDetails SET note = 'SHOPEE BANGKOK' WHERE transaction_id = 'TX-O2'`).run();
  insertStatementTx('TX-O3a', 'A01', '2026-10-05', -99, { desc: 'SHOPEE BANGKOK' }); insertStatementTx('TX-O3b', 'A01', '2026-10-06', -99, { desc: 'SHOPEE BANGKOK' });
  const r = await ingest({ doc_type: 'ORDER_LIST', amount: null, merchant: 'Shopee', orders: [
    { date: '2026-10-20', amount: 159.25, shop: 'ร้าน A', items: 'สายชาร์จ USB-C' },
    { date: null, amount: 88.5, shop: 'ร้าน B', items: 'ปากกา' },
    { date: null, amount: 99, shop: 'ร้าน C', items: 'แก้วน้ำ' },
    { date: null, amount: 12345.67, shop: 'ร้าน D', items: 'ไม่มีในบัตร' } ] });
  const d = db.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=?`).get(r.doc.doc_id), sug = JSON.parse(d.suggestion);
  const linked = db.prepare(`SELECT transaction_id FROM LedgerDocLinks WHERE doc_id=?`).all(r.doc.doc_id).map(x => x.transaction_id).sort();
  check('แนบ 2 order (มีวันที่ + ไม่มีวันที่แต่ยอดไม่ซ้ำ) กับคนละรายการ', JSON.stringify(linked) === JSON.stringify(['TX-O1', 'TX-O2']), linked);
  check('ยอดซ้ำหลายรายการ → ให้เลือก · ไม่เจอ → รอ · สถานะ STORED', sug.orders[2].status === 'CHOOSE' && sug.orders[3].status === 'WAIT' && d.status === 'STORED', sug.orders.map(o => o.status));
  check('Detail = Shopee · ร้าน · สินค้า (แทนข้อความ statement ที่เติมอัตโนมัติ)', lines('TX-O2')[0].note === 'Shopee · ร้าน B · ปากกา' && lines('TX-O1')[0].note === 'Shopee · ร้าน A · สายชาร์จ USB-C', [lines('TX-O1')[0].note, lines('TX-O2')[0].note]);
  db.prepare(`UPDATE TransactionDetails SET note = 'ของขวัญแม่' WHERE transaction_id = 'TX-O1'`).run();
  await inbox.handleLedgerInbox(new Request(`https://x/api/inbox/${r.doc.doc_id}/rematch`, { method: 'POST', body: '{}' }), env, new URL(`https://x/api/inbox/${r.doc.doc_id}/rematch`), {}, '9North').catch(() => {});
  check('Detail ที่พิมพ์เองไม่ถูกทับ', lines('TX-O1')[0].note === 'ของขวัญแม่', lines('TX-O1')[0].note);
}

console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
