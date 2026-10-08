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
const source = readSrc('ledger-inbox.js').replace(/from\s+'\.\/([\w.-]+)'/g, (_, f) => `from '${asDataUrl(readSrc(f))}'`);
const inbox = await import(asDataUrl(source));
const match = await import(asDataUrl(readSrc('ledger-match.js')));

let pass = 0, fail = 0;
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

INSERT INTO Users VALUES ('9North','Fam_Default','9North',NULL,'Uline-north','admin',NULL,NULL), ('Puii','Fam_Default','Puii',NULL,'Uline-puii','member',NULL,NULL),
  ('Other','Fam_Other','Other',NULL,NULL,'admin',NULL,NULL);
INSERT INTO UserPermissions VALUES ('9North','Ent_North'),('9North','Ent_Co_S01'),('9North','Ent_Co_S05'),('Other','Ent_Other');
INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number) VALUES
  ('A01','Ent_North','[A01] Pocket','Cash',NULL), ('A02','Ent_North','[A02] BK KBANK','Kbank',NULL), ('A06','Ent_North','[A06] Kbank','Kbank',NULL),
  ('A09','Ent_North','[A09] SCB','SCB',NULL), ('A10','Ent_North','[A10] SCB Salary','SCB','987-6-54321-0'), ('C01','Ent_North','[C01] KBank Credit Card','Kbank',NULL), ('X99','Ent_Other','other fam','Kbank',NULL);
INSERT INTO Categories (category_id, name, default_type) VALUES ('Cat_Uncategorized','รอการระบุ','EXPENSE'),('T01','[T01] Food & Beverage','EXPENSE'),
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
    check('จดเงินสดแล้วตอบพร้อมปุ่มยืนยัน', sent.at(-1)?.messages?.[0]?.text.includes('ส้มตำ') && sent.at(-1).messages[0].quickReply.items.length === 2);

    extractQueue.push(slip({ amount: 120, date: '2026-10-12' }), slip({ amount: 130, date: '2026-10-12' }));
    sent.length = 0;
    await call([
      { type: 'message', replyToken: 't2', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'm1' } },
      { type: 'message', replyToken: 't3', source: { userId: 'Uline-north' }, message: { type: 'image', id: 'm2' } },
    ]);
    check('ส่ง 2 รูปพร้อมกัน → ตอบครบทั้ง 2 (ของเดิมอ่านแค่รูปแรก)', sent.length === 2 && sent.every(m => m.messages[0].text.includes('จ่าย')));
    const postback = sent[0].messages[0].quickReply.items[0].action.data;
    sent.length = 0;
    await call([{ type: 'postback', replyToken: 't4', source: { userId: 'Uline-north' }, postback: { data: postback } }]);
    check('กด "✓ ถูกต้อง" ใน LINE → บันทึกเรียบร้อย', sent[0]?.messages?.[0]?.text.includes('บันทึกเรียบร้อย'));

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
    check('LINE ตอบผลการอ่าน', sent[0]?.messages?.[0]?.text.includes('58,300.00'));
    db.prepare(`UPDATE LedgerDocs SET status='DISMISSED' WHERE status IN ('READING','ERROR')`).run();   // เคลียร์ของค้างจากเทสก่อนหน้า
    sent.length = 0;
    await inbox.handleLedgerInbox(new Request('https://x/api/line-webhook', { method: 'POST', body: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r2', source: { userId: 'Uline-north' }, message: { type: 'text', text: 'อ่านใหม่' } }] }) }),
      env, new URL('https://x/api/line-webhook'), {}, '');
    check('ไม่มีค้างแล้ว → บอกว่าไม่มี', sent[0]?.messages?.[0]?.text.includes('ไม่มีเอกสารค้าง'));
  } finally { globalThis.fetch = realFetch; }
}

console.log('\n── ตรวจยอดทุกรายการที่ระบบสร้าง ──');
{
  const all = db.prepare(`SELECT transaction_id, total_amount FROM Transactions WHERE source != 'PDF_IMPORT'`).all();
  const bad = all.filter(t => Math.abs(match.balanceGap(t.total_amount, lines(t.transaction_id))) >= 0.005);
  check(`ทุกรายการลงตัว (${all.length} รายการ)`, bad.length === 0, bad.map(b => b.transaction_id).join(', '));
}

console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
