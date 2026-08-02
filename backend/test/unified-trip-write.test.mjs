// ═══════════════════════════════════════════════════════════════════════════
// ทดสอบ endpoint ฝั่งเขียนของ Unified Trip
//
//   node backend/test/unified-trip-write.test.mjs
//
//   ใช้ sqlite ในหน่วยความจำ (node:sqlite) + shim ที่เลียน API ของ D1
//   ไม่แตะฐานจริงทั้ง local และ remote · รันซ้ำได้ตลอด
//
//   โหลด src/unified-trip.js ผ่าน data: URL เพื่อให้ทดสอบ "ไฟล์จริง" เสมอ
//   (backend ไม่ได้ตั้ง type:module ใน package.json จึง import ตรง ๆ ไม่ได้)
// ═══════════════════════════════════════════════════════════════════════════
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/unified-trip.js', import.meta.url), 'utf8');
const { handleUnifiedTrip } = await import(
  'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, role TEXT);
CREATE TABLE Projects (project_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, status TEXT,
  start_date TEXT, end_date TEXT, total_budget REAL, members TEXT, banner_url TEXT,
  theme_banner TEXT, posting_date TEXT, closed_at DATETIME);
CREATE TABLE TripMembers (member_id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT,
  display_name TEXT, role TEXT, ledger_mode TEXT DEFAULT 'MAIN', is_admin INTEGER DEFAULT 0,
  avatar_color TEXT, created_at DATETIME);
CREATE TABLE TripCurrencies (project_id TEXT, code TEXT, symbol TEXT, label TEXT,
  plan_rate REAL DEFAULT 0, is_base INTEGER DEFAULT 0, icon_url TEXT, created_at DATETIME,
  PRIMARY KEY (project_id, code));
CREATE TABLE TripWallets (wallet_id TEXT PRIMARY KEY, project_id TEXT, name TEXT, currency TEXT,
  initial_balance_foreign REAL DEFAULT 0, initial_balance_thb REAL DEFAULT 0,
  exclude_on_close INTEGER DEFAULT 0, created_at DATETIME,
  owner_member_id TEXT, icon_url TEXT, locked_rate REAL);
CREATE TABLE TripWalletFundings (funding_id TEXT PRIMARY KEY, project_id TEXT, wallet_id TEXT,
  thb_amount REAL, foreign_amount REAL, rate REAL, funding_date TEXT,
  carried_from_wallet_id TEXT, carried_from_closure_id TEXT,
  note TEXT, source_account_id TEXT, linked_transaction_id TEXT, created_at DATETIME);
-- amount_thb เป็น NOT NULL ตามของจริง (คอลัมน์เดิมที่หน้าอื่นยังอ่านอยู่)
-- ตั้งไว้แบบนี้เพื่อให้เทสจับได้ถ้าโค้ดลืมใส่ค่า
CREATE TABLE TripExpenses (trip_expense_id TEXT PRIMARY KEY, project_id TEXT, member_id TEXT,
  wallet_id TEXT, category_id TEXT, amount_foreign REAL, amount_thb REAL NOT NULL,
  expense_date TEXT NOT NULL, note TEXT, created_at DATETIME,
  owner_member_id TEXT, visibility TEXT, is_shared INTEGER, split_mode TEXT,
  currency_code TEXT, icon_url TEXT, settled_amount_thb REAL, settled_rate REAL);
CREATE TABLE TripExpenseCategories (line_id TEXT PRIMARY KEY, trip_expense_id TEXT, category_id TEXT, label TEXT, amount_foreign REAL);
CREATE TABLE TripExpenseParticipants (participant_id TEXT PRIMARY KEY, trip_expense_id TEXT, member_id TEXT, amount_foreign REAL, percent REAL);
CREATE TABLE TripClosures (closure_id TEXT PRIMARY KEY, project_id TEXT, entry_type TEXT,
  posting_date TEXT, ledger_total REAL, trip_only_total REAL, fx_result REAL, carried_thb REAL,
  reverses_id TEXT, reason TEXT, performed_by TEXT, created_at DATETIME, linked_transaction_id TEXT);
CREATE TABLE TripClosureLines (line_id TEXT PRIMARY KEY, closure_id TEXT, wallet_id TEXT,
  disposition TEXT, leftover_foreign REAL, thb_cost REAL, received_thb REAL, fx_amount REAL,
  carry_currency TEXT, carry_amount REAL, carry_funding_id TEXT);
CREATE TABLE TripPresence (project_id TEXT, member_id TEXT, is_sharing INTEGER, stop_id TEXT,
  place_label TEXT, status TEXT, latitude REAL, longitude REAL, checked_in_at DATETIME, expires_at DATETIME,
  PRIMARY KEY (project_id, member_id));
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT);
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT, name TEXT);
-- ⚠️ คีย์ของ Captions คือ type_id ไม่ใช่ caption_id — ลอกจากฐาน production จริง
-- (backend/db/schema.sql เป็นแบบร่าง ไม่ตรงกับของจริง เคยหลงเชื่อจนพังมาแล้ว)
CREATE TABLE Captions (type_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, behavior TEXT,
  created_at DATETIME, default_entity_id TEXT, default_contact_id TEXT, default_type TEXT, sub_behavior TEXT);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, name TEXT,
  created_at DATETIME, default_entity_id TEXT, default_contact_id TEXT, default_type TEXT,
  caption_id TEXT REFERENCES Captions(type_id));
CREATE TABLE Transactions (transaction_id TEXT PRIMARY KEY, account_id TEXT, ref_code TEXT,
  date TEXT NOT NULL, time TEXT, total_amount REAL NOT NULL, statement_desc TEXT,
  status TEXT, source TEXT, slip_image_url TEXT, created_by_user_id TEXT NOT NULL, created_at DATETIME);
CREATE TABLE TransactionDetails (detail_id TEXT PRIMARY KEY, transaction_id TEXT, amount REAL NOT NULL,
  fee REAL DEFAULT 0, wht REAL DEFAULT 0, category_id TEXT NOT NULL, entity_id TEXT, contact_id TEXT,
  project_id TEXT, note TEXT, type TEXT NOT NULL);
-- ⚠️ ลอกจากฐาน production จริง (pragma_table_info) ไม่ใช่จาก backend/db/schema.sql
--    คอลัมน์เรียงตามลำดับจริง: ของเดิม → hunsa (end_time/icon_asset) → naming (name_*/sort_order)
CREATE TABLE TripStops (stop_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, stop_date TEXT, time TEXT,
  city TEXT, accommodation TEXT, restaurants TEXT, notes TEXT, is_starred INTEGER DEFAULT 0,
  latitude REAL, longitude REAL, created_at DATETIME,
  location_type TEXT, parent_stop_id TEXT, icon TEXT, is_main_day INTEGER DEFAULT 0,
  header_color TEXT, marker_color TEXT, font_size TEXT, text_color TEXT, time_color TEXT,
  border_color TEXT, label_position TEXT,
  end_time TEXT, icon_asset TEXT,
  name_en TEXT, name_th TEXT, sort_order INTEGER DEFAULT 0);

INSERT INTO Users VALUES ('9North','FAM-1','North','admin'),('uPuii','FAM-1','Puii','member'),('uOther','FAM-2','Other','member');
INSERT INTO Projects (project_id,family_id,name,status,start_date,end_date)
  VALUES ('TRP-1','FAM-1','Hokkaido 2026','active','2026-12-17','2026-12-27'),
         ('TRP-CLOSED','FAM-1','ทริปที่ปิดแล้ว','closed','2026-01-01','2026-01-05');
INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin) VALUES
  ('TM-1','TRP-1','9North','North','ผู้ดูแล','MAIN',1),
  ('TM-2','TRP-1','uPuii','Puii','สมาชิก','MAIN',0),
  ('TM-3','TRP-1',NULL,'XinXin','สมาชิก','MAIN',0),
  ('TM-C1','TRP-CLOSED','9North','North','ผู้ดูแล','MAIN',1);
INSERT INTO TripCurrencies (project_id,code,symbol,label,plan_rate,is_base) VALUES ('TRP-1','THB','฿','บาท',1,1);

-- ทริปแยกสำหรับเทสปิด/เปิด เพื่อไม่ให้ข้อมูลของเทสอื่นมาปนจนอ่านตัวเลขไม่ออก
-- TM-X2 เป็น TRIP_ONLY = ยอดของคนนี้ไม่เข้าบัญชีหลัก
INSERT INTO Projects (project_id,family_id,name,status,start_date,end_date)
  VALUES ('TRP-2','FAM-1','ทริปทดสอบปิด','active','2026-12-17','2026-12-27');
INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin) VALUES
  ('TM-X1','TRP-2','9North','North','ผู้ดูแล','MAIN',1),
  ('TM-X2','TRP-2','uPuii','Puii','สมาชิก','TRIP_ONLY',0);
INSERT INTO TripCurrencies (project_id,code,symbol,label,plan_rate,is_base) VALUES
  ('TRP-2','THB','฿','บาท',1,1), ('TRP-2','JPY','¥','เยน',0.23,0);
INSERT INTO TripWallets (wallet_id,project_id,name,currency,owner_member_id,exclude_on_close)
  VALUES ('W-X','TRP-2','เงินสดเยน','JPY','TM-X1',0);
-- ฿2,340 แลกได้ ¥10,000 → เรทจริง 0.234 (ไม่ใช่ 0.23 ที่ตั้งไว้ตอนวางแผน)
INSERT INTO TripWalletFundings (funding_id,project_id,wallet_id,thb_amount,foreign_amount,rate,funding_date)
  VALUES ('F-X','TRP-2','W-X',2340,10000,0.234,'2026-12-17');

-- บัญชีจริงสำหรับทดสอบการโพสต์ตอนปิดทริป
INSERT INTO Entities VALUES ('ENT-1','FAM-1','บ้าน'), ('ENT-X','FAM-9','ครอบครัวอื่น');
INSERT INTO Accounts VALUES ('ACC-1','ENT-1','บัญชีหลัก'), ('ACC-X','ENT-X','บัญชีคนอื่น');
INSERT INTO Captions (type_id,family_id,name,behavior) VALUES
  ('CAP-EXP','FAM-1','Expense','EXPENSE'), ('CAP-REV','FAM-1','Revenue','REVENUE');
INSERT INTO Categories (category_id,family_id,name,caption_id) VALUES
  ('CAT-FOOD','FAM-1','ค่าอาหาร','CAP-EXP'), ('CAT-STAY','FAM-1','ค่าที่พัก','CAP-EXP'),
  ('CAT-SALE','FAM-1','รายได้','CAP-REV'), ('CAT-OTHER','FAM-9','ของครอบครัวอื่น','CAP-EXP');
`);

// ── D1 shim ────────────────────────────────────────────────────────────────
const DB = {
  prepare(sql) {
    let args = [];
    const api = {
      bind(...a) { args = a.map(v => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v))); return api; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { success: true, meta: db.prepare(sql).run(...args) }; },
      _exec() { return db.prepare(sql).run(...args); }
    };
    return api;
  },
  // D1 batch = ทุกคำสั่งอยู่ใน transaction เดียว พังตัวใดตัวหนึ่ง = ย้อนทั้งชุด
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = stmts.map(s => s._exec()); db.exec('COMMIT'); return out; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  }
};
const env = { DB };
const cors = { 'Access-Control-Allow-Origin': '*' };

// ── helper ─────────────────────────────────────────────────────────────────
async function call(method, path, { user = '9North', project = 'TRP-1', body, query = '' } = {}) {
  const url = new URL(`https://x${path}?projectId=${project}${query}`);
  const req = new Request(url, {
    method,
    headers: { 'x-user-id': user, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  /* index.js ระบุตัวตนที่เดียวแล้วส่งเข้ามาเป็นพารามิเตอร์ (token ก่อน x-user-id)
     เทสจึงจำลองขั้นนั้นด้วย ไม่ใช่ให้โมดูลไปอ่าน header เอง */
  const res = await handleUnifiedTrip(req, env, url, cors, user);
  return { status: res.status, data: await res.json() };
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
}

console.log('\n── สกุลเงิน ─────────────────────────────────────');
let r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'jpy', symbol: '¥', label: 'เยน', plan_rate: 0.234 } });
check('admin เพิ่มสกุลได้ + รหัสถูกทำเป็นตัวใหญ่', r.status === 200 && r.data.code === 'JPY', JSON.stringify(r));
check('บันทึกลงฐานจริง', db.prepare(`SELECT plan_rate FROM TripCurrencies WHERE project_id='TRP-1' AND code='JPY'`).get()?.plan_rate === 0.234);

r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'JPY', symbol: '¥', label: 'เยน', plan_rate: 0.25 } });
check('รันซ้ำ = อัปเดต ไม่ใช่ error', r.status === 200 && db.prepare(`SELECT COUNT(*) n FROM TripCurrencies WHERE project_id='TRP-1' AND code='JPY'`).get().n === 1);
check('เรทใหม่ทับของเดิม', db.prepare(`SELECT plan_rate FROM TripCurrencies WHERE project_id='TRP-1' AND code='JPY'`).get().plan_rate === 0.25);

r = await call('POST', '/api/unified-trip/currencies', { user: 'uPuii', body: { code: 'USD', symbol: '$', plan_rate: 36 } });
check('สมาชิกธรรมดาเพิ่มสกุลไม่ได้ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'JPY', symbol: '¥', plan_rate: 0 } });
check('เรท 0 ถูกปฏิเสธ', r.status === 400);
r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'JPY', symbol: '¥', plan_rate: -5 } });
check('เรทติดลบถูกปฏิเสธ', r.status === 400);
r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'JPY', symbol: '¥' } });
check('ไม่ส่งเรทถูกปฏิเสธ (ไม่แอบใส่ 0 ให้)', r.status === 400);
r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'JAPANYEN', symbol: '¥', plan_rate: 1 } });
check('รหัสสกุลผิดรูปถูกปฏิเสธ', r.status === 400);
r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'EUR', plan_rate: 39 } });
check('ไม่มีสัญลักษณ์ถูกปฏิเสธ', r.status === 400);

r = await call('DELETE', '/api/unified-trip/currencies', { query: '&code=THB' });
check('ลบสกุลหลักไม่ได้ → 409', r.status === 409, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/currencies', { query: '&code=KRW' });
check('ลบสกุลที่ไม่มี → 404', r.status === 404);

console.log('\n── กระเป๋า ──────────────────────────────────────');
r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'เงินสดเยน', currency: 'JPY', icon_url: 'wallet_a.svg' } });
const walletId = r.data.wallet_id;
check('สร้างกระเป๋าได้', r.status === 200 && walletId, JSON.stringify(r));
check('เจ้าของถูกตั้งเป็นตัวผู้เรียกเอง', db.prepare(`SELECT owner_member_id o FROM TripWallets WHERE wallet_id=?`).get(walletId).o === 'TM-1');

r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'กระเป๋าผี', currency: 'KRW' } });
check('สกุลที่ยังไม่ตั้งในทริป → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { body: { currency: 'JPY' } });
check('ไม่มีชื่อ → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/wallets', { user: 'uPuii', body: { name: 'ของ Puii', currency: 'JPY' } });
const puiiWallet = r.data.wallet_id;
check('สมาชิกธรรมดาสร้างกระเป๋าของตัวเองได้', r.status === 200, JSON.stringify(r));
check('เจ้าของ = TM-2', db.prepare(`SELECT owner_member_id o FROM TripWallets WHERE wallet_id=?`).get(puiiWallet).o === 'TM-2');

r = await call('POST', '/api/unified-trip/wallets', { user: 'uPuii', body: { name: 'แอบสร้างให้ North', currency: 'JPY', owner_member_id: 'TM-1' } });
check('สมาชิกสร้างกระเป๋าให้คนอื่นไม่ได้ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'ให้ XinXin', currency: 'JPY', owner_member_id: 'TM-3' } });
check('admin สร้างให้คนอื่นได้', r.status === 200, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'ให้คนนอกทริป', currency: 'JPY', owner_member_id: 'TM-C1' } });
check('เจ้าของที่ไม่ได้อยู่ทริปนี้ → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { user: 'uPuii', body: { wallet_id: walletId, name: 'แอบเปลี่ยนชื่อ', currency: 'JPY' } });
check('สมาชิกแก้กระเป๋าคนอื่นไม่ได้ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: walletId, name: 'เงินสดเยน (แก้ชื่อ)', currency: 'JPY' } });
check('เจ้าของแก้ชื่อกระเป๋าตัวเองได้', r.status === 200 && db.prepare(`SELECT name n FROM TripWallets WHERE wallet_id=?`).get(walletId).n === 'เงินสดเยน (แก้ชื่อ)');
check('แก้แล้วไม่เกิดกระเป๋าใหม่', db.prepare(`SELECT COUNT(*) n FROM TripWallets WHERE project_id='TRP-1'`).get().n === 3);

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: 'TW-ไม่มีจริง', name: 'x', currency: 'JPY' } });
check('แก้กระเป๋าที่ไม่มี → 404', r.status === 404);

// เติมเงินแล้วห้ามเปลี่ยนสกุล
// เติม ¥10,000 ด้วยเงิน ฿2,340 → เรทเฉลี่ย 0.234
db.prepare(`INSERT INTO TripWalletFundings
  (funding_id, project_id, wallet_id, thb_amount, foreign_amount, rate, funding_date)
  VALUES ('F-1','TRP-1',?,2340,10000,0.234,'2026-12-17')`).run(walletId);
await call('POST', '/api/unified-trip/currencies', { body: { code: 'USD', symbol: '$', plan_rate: 36 } });
r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: walletId, name: 'เงินสดเยน', currency: 'USD' } });
check('เปลี่ยนสกุลกระเป๋าที่เติมเงินแล้ว → 409', r.status === 409, JSON.stringify(r));
check('สกุลเดิมไม่ถูกแตะ', db.prepare(`SELECT currency c FROM TripWallets WHERE wallet_id=?`).get(walletId).c === 'JPY');

r = await call('DELETE', '/api/unified-trip/currencies', { query: '&code=JPY' });
check('ลบสกุลที่ยังมีกระเป๋าใช้อยู่ → 409', r.status === 409, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/currencies', { query: '&code=USD' });
check('ลบสกุลที่ไม่มีใครใช้ได้', r.status === 200, JSON.stringify(r));

// บั๊กที่เคยเจอ: สร้างหลายใบในมิลลิวินาทีเดียวกันแล้ว id ชน → ทับกันเงียบ ๆ
{
  const before = db.prepare(`SELECT COUNT(*) n FROM TripWallets WHERE project_id='TRP-1'`).get().n;
  const ids = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    call('POST', '/api/unified-trip/wallets', { body: { name: `รัว ${i}`, currency: 'JPY' } })
      .then(x => x.data.wallet_id)));
  const after = db.prepare(`SELECT COUNT(*) n FROM TripWallets WHERE project_id='TRP-1'`).get().n;
  check('สร้าง 20 ใบรวดเดียวได้ครบ ไม่ทับกัน', after - before === 20 && new Set(ids).size === 20,
    `เพิ่มจริง ${after - before} · id ไม่ซ้ำ ${new Set(ids).size}`);
  db.prepare(`DELETE FROM TripWallets WHERE name LIKE 'รัว %'`).run();
}

console.log('\n── บิล ──────────────────────────────────────────');
const bill = (over = {}) => ({
  expense_date: '2026-12-18', amount_foreign: 1000, currency_code: 'JPY',
  wallet_id: walletId, split_mode: 'EQUAL', visibility: 'TRIP', ...over
});

r = await call('POST', '/api/unified-trip/expenses', { body: bill() });
const billId = r.data.trip_expense_id;
check('บันทึกบิลได้', r.status === 200 && billId, JSON.stringify(r));
check('amount_thb คิดจากเรทจริงของกระเป๋า', Math.abs(r.data.amount_thb - 234) < 1e-9, String(r.data.amount_thb));
check('บอกที่มาของเรทกลับมาด้วย', r.data.rate_source === 'actual', r.data.rate_source);
check('ไม่ระบุผู้ร่วมจ่าย → เจ้าของรับเต็ม', (() => {
  const p = db.prepare(`SELECT * FROM TripExpenseParticipants WHERE trip_expense_id=?`).all(billId);
  return p.length === 1 && p[0].member_id === 'TM-1' && p[0].amount_foreign === 1000;
})());

// หารไม่ลงตัว — ปัด 2 ตำแหน่ง เศษไปที่ admin ต้องไม่มีเงินหายหรือเกิน
r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ participants: [{ member_id: 'TM-2' }, { member_id: 'TM-3' }, { member_id: 'TM-1' }] })
});
const splitId = r.data.trip_expense_id;
check('หาร 3 คนได้', r.status === 200, JSON.stringify(r));
{
  const rows = db.prepare(`SELECT member_id m, amount_foreign a FROM TripExpenseParticipants WHERE trip_expense_id=?`).all(splitId);
  const by = Object.fromEntries(rows.map(x => [x.m, x.a]));
  const sum = rows.reduce((s, x) => s + x.a, 0);
  check('¥1,000 ÷ 3 ปัดเป็น 2 ตำแหน่ง', by['TM-2'] === 333.33 && by['TM-3'] === 333.33, JSON.stringify(by));
  check('เศษ 0.01 ไปที่ admin แม้จะอยู่ท้ายรายการ', by['TM-1'] === 333.34, JSON.stringify(by));
  check('ผลรวมยังเท่ากับยอดบิลพอดี', Math.abs(sum - 1000) < 1e-9, String(sum));
  check('บอกกลับมาว่าเศษไปตกที่ใคร', r.data.residual_member_id === 'TM-1' && Math.abs(r.data.residual - 0.01) < 1e-9,
    JSON.stringify({ to: r.data.residual_member_id, amount: r.data.residual }));
}

// admin ไม่ได้ร่วมบิลนี้ → เศษต้องตกที่เจ้าของบิล ไม่ใช่หายไปเฉย ๆ
// ¥10.01 ÷ 2 = 5.005 ปัดขึ้นเป็น 5.01 ทั้งคู่ = 10.02 เกินมา 0.01 ต้องหักคืนที่เจ้าของ
r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ amount_foreign: 10.01, owner_member_id: 'TM-2', participants: [{ member_id: 'TM-3' }, { member_id: 'TM-2' }] })
});
{
  const by = Object.fromEntries(db.prepare(
    `SELECT member_id m, amount_foreign a FROM TripExpenseParticipants WHERE trip_expense_id=?`
  ).all(r.data.trip_expense_id).map(x => [x.m, x.a]));
  check('admin ไม่อยู่ในบิล → เศษตกที่เจ้าของบิล', by['TM-2'] === 5 && by['TM-3'] === 5.01, JSON.stringify(by));
  check('เศษติดลบก็รายงานกลับถูก', r.data.residual_member_id === 'TM-2' && Math.abs(r.data.residual + 0.01) < 1e-9,
    JSON.stringify({ to: r.data.residual_member_id, amount: r.data.residual }));
}

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ amount_foreign: 100, participants: [{ member_id: 'TM-1' }, { member_id: 'TM-2' }] })
});
check('หารลงตัว → ไม่มีเศษ ไม่ต้องมีคนรับ', r.data.residual === 0 && r.data.residual_member_id === null,
  JSON.stringify({ r: r.data.residual, to: r.data.residual_member_id }));

r = await call('POST', '/api/unified-trip/expenses', { body: bill({ amount_foreign: 1234.567 }) });
check('ยอดบิลเองก็ถูกปัดเป็น 2 ตำแหน่ง',
  db.prepare(`SELECT amount_foreign a FROM TripExpenses WHERE trip_expense_id=?`).get(r.data.trip_expense_id).a === 1234.57,
  JSON.stringify(r.data));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ split_mode: 'MANUAL', participants: [{ member_id: 'TM-1', amount_foreign: 600 }, { member_id: 'TM-2', amount_foreign: 300 }] })
});
check('MANUAL ที่ยอดไม่ครบ → 400', r.status === 400 && /ไม่เท่ากับยอดบิล/.test(r.data.error), JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ split_mode: 'MANUAL', participants: [{ member_id: 'TM-1', amount_foreign: 600 }, { member_id: 'TM-2', amount_foreign: 400 }] })
});
check('MANUAL ที่ยอดครบผ่าน', r.status === 200, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ split_mode: 'PERCENT', participants: [{ member_id: 'TM-1', percent: 70 }, { member_id: 'TM-2', percent: 20 }] })
});
check('PERCENT รวมไม่ถึง 100 → 400', r.status === 400 && /100/.test(r.data.error), JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ split_mode: 'PERCENT', participants: [{ member_id: 'TM-1', percent: 70 }, { member_id: 'TM-2', percent: 30 }] })
});
check('PERCENT รวม 100 ผ่าน + แปลงเป็นยอดถูก', r.status === 200 &&
  db.prepare(`SELECT amount_foreign a FROM TripExpenseParticipants WHERE trip_expense_id=? AND member_id='TM-1'`)
    .get(r.data.trip_expense_id).a === 700, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ participants: [{ member_id: 'TM-1' }, { member_id: 'TM-1' }] })
});
check('ชื่อผู้ร่วมจ่ายซ้ำ → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ participants: [{ member_id: 'TM-C1' }] })
});
check('ผู้ร่วมจ่ายนอกทริป → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ categories: [{ label: 'อาหาร', amount_foreign: 600 }, { label: 'ของฝาก', amount_foreign: 300 }] })
});
check('ยอดหมวดไม่ครบ → 400', r.status === 400 && /หมวด/.test(r.data.error), JSON.stringify(r));
r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ categories: [{ label: 'อาหาร', amount_foreign: 600 }, { label: 'ของฝาก', amount_foreign: 400 }] })
});
check('ยอดหมวดครบผ่าน + เก็บ 2 แถว', r.status === 200 &&
  db.prepare(`SELECT COUNT(*) n FROM TripExpenseCategories WHERE trip_expense_id=?`).get(r.data.trip_expense_id).n === 2);

r = await call('POST', '/api/unified-trip/expenses', { body: bill({ amount_foreign: 0 }) });
check('ยอดบิล 0 → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ amount_foreign: -500 }) });
check('ยอดบิลติดลบ → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ expense_date: '18/12/2026' }) });
check('รูปแบบวันที่ผิด → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ visibility: 'PUBLIC' }) });
check('visibility นอกรายการ → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ visibility: 'SELECTED' }) });
check('SELECTED ที่มีคนเดียว → 400 (ควรใช้ PRIVATE)', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ currency_code: 'KRW' }) });
check('สกุลที่ไม่ได้ตั้งในทริป → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ wallet_id: puiiWallet }) });
check('ตัดเงินจากกระเป๋าคนอื่น → 400', r.status === 400 && /กระเป๋าต้องเป็นของคนจ่าย/.test(r.data.error), JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', { user: 'uPuii', body: bill({ wallet_id: null, owner_member_id: 'TM-1' }) });
check('สมาชิกบันทึกบิลให้คนอื่นเป็นเจ้าของ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', { user: 'uPuii', body: bill({ trip_expense_id: billId }) });
check('สมาชิกแก้บิลที่ตัวเองไม่ใช่เจ้าของ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', { body: bill({ trip_expense_id: billId, amount_foreign: 1500 }) });
check('เจ้าของแก้ยอดบิลตัวเองได้', r.status === 200 && r.data.created === false, JSON.stringify(r));
check('ยอดใหม่ถูกบันทึก', db.prepare(`SELECT amount_foreign a FROM TripExpenses WHERE trip_expense_id=?`).get(billId).a === 1500);
check('amount_thb ถูกคิดใหม่ตามยอดใหม่', Math.abs(db.prepare(`SELECT amount_thb t FROM TripExpenses WHERE trip_expense_id=?`).get(billId).t - 351) < 1e-9);
check('ผู้ร่วมจ่ายถูกเขียนใหม่ ไม่ค้างของเก่า',
  db.prepare(`SELECT COUNT(*) n FROM TripExpenseParticipants WHERE trip_expense_id=?`).get(billId).n === 1);

// batch ต้อง atomic — ผู้ร่วมจ่ายพังกลางทางห้ามทิ้งบิลกำพร้าไว้
{
  const before = db.prepare(`SELECT COUNT(*) n FROM TripExpenses`).get().n;
  const orig = DB.batch;
  DB.batch = async (stmts) => orig.call(DB, [...stmts, { _exec() { throw new Error('พังกลางทาง'); } }]);
  let threw = false;
  try { await call('POST', '/api/unified-trip/expenses', { body: bill() }); } catch { threw = true; }
  DB.batch = orig;
  check('batch พังกลางทาง → ย้อนทั้งชุด ไม่มีบิลกำพร้า',
    threw && db.prepare(`SELECT COUNT(*) n FROM TripExpenses`).get().n === before);
}

r = await call('DELETE', '/api/unified-trip/expenses', { user: 'uPuii', query: `&id=${billId}` });
check('สมาชิกลบบิลคนอื่น → 403', r.status === 403, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/expenses', { query: '&id=TE-ไม่มีจริง' });
check('ลบบิลที่ไม่มี → 404', r.status === 404);
r = await call('DELETE', '/api/unified-trip/expenses', { query: `&id=${splitId}` });
check('เจ้าของลบบิลตัวเองได้', r.status === 200, JSON.stringify(r));
check('ลบแล้วผู้ร่วมจ่ายหายตาม ไม่เหลือแถวกำพร้า',
  db.prepare(`SELECT COUNT(*) n FROM TripExpenseParticipants WHERE trip_expense_id=?`).get(splitId).n === 0);

// สกุลที่ไม่มีกระเป๋าใช้เลย แต่มีบิล — เพื่อให้ชนด่าน "มีบิลอยู่" ตรง ๆ
// ไม่ใช่ชนด่าน "มีกระเป๋าอยู่" ที่มาก่อน
await call('POST', '/api/unified-trip/currencies', { body: { code: 'EUR', symbol: '€', plan_rate: 39 } });
r = await call('POST', '/api/unified-trip/expenses', { body: bill({ currency_code: 'EUR', wallet_id: null }) });
check('บิลที่ไม่ผูกกระเป๋าใช้เรท planned ของสกุลนั้น', r.status === 200 && r.data.rate_source === 'planned', JSON.stringify(r));
check('amount_thb ใช้ plan_rate', Math.abs(r.data.amount_thb - 39000) < 1e-9, String(r.data.amount_thb));
r = await call('DELETE', '/api/unified-trip/currencies', { query: '&code=EUR' });
check('ลบสกุลที่ยังมีบิลใช้อยู่ → 409', r.status === 409 && /บิล/.test(r.data.error), JSON.stringify(r));

console.log('\n── ด่านความปลอดภัย ──────────────────────────────');
r = await call('POST', '/api/unified-trip/expenses', { project: 'TRP-CLOSED', body: bill() });
check('ทริปปิดแล้วบันทึกบิลไม่ได้ → 409', r.status === 409, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/currencies', { project: 'TRP-CLOSED', body: { code: 'JPY', symbol: '¥', plan_rate: 0.24 } });
check('ทริปปิดแล้วเขียนไม่ได้ → 409', r.status === 409, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { user: 'uOther', body: { name: 'x', currency: 'JPY' } });
check('คนต่างครอบครัว → 404 (ไม่บอกว่ามีทริปอยู่)', r.status === 404, JSON.stringify(r));

{
  const url = new URL('https://x/api/unified-trip/wallets?projectId=TRP-1');
  const res = await handleUnifiedTrip(new Request(url, { method: 'POST', body: '{}' }), env, url, cors, '');
  check('ระบุตัวตนไม่ได้ → 401', res.status === 401);
}
r = await call('PUT', '/api/unified-trip/wallets', { body: {} });
check('method ที่ยังไม่รองรับ → 405', r.status === 405, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/closures', { body: {} });
check('ปิดทริปโดยไม่ระบุวันลงบัญชี → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/currencies', { body: 'ไม่ใช่ json' });
check('body พังไม่ทำให้ 500', r.status === 400, JSON.stringify(r));

console.log('\n── GET ยังทำงานเหมือนเดิม ───────────────────────');
r = await call('GET', '/api/unified-trip');
check('GET คืน 200', r.status === 200, JSON.stringify(r).slice(0, 200));
check('เห็นสกุล JPY ที่เพิ่งเพิ่ม', r.data.currencies?.some(c => c.code === 'JPY'));
check('viewer คือ TM-1', r.data.viewer?.member_id === 'TM-1');
check('North เห็นเฉพาะกระเป๋าตัวเอง', r.data.wallets?.length === 1 && r.data.wallets[0].wallet_id === walletId,
  JSON.stringify(r.data.wallets?.map(w => w.wallet_id)));
const w = r.data.wallets?.[0];
check('เรทมาจากล็อตจริง = actual', w?.rate_source === 'actual', w?.rate_source);
check('เรทเฉลี่ยถ่วงน้ำหนักถูกต้อง', Math.abs(w.rate - 2340 / 10000) < 1e-9, String(w?.rate));

r = await call('GET', '/api/unified-trip', { user: 'uPuii' });
check('Puii เห็นเฉพาะกระเป๋าของ Puii', r.data.wallets?.length === 1 && r.data.wallets[0].wallet_id === puiiWallet,
  JSON.stringify(r.data.wallets?.map(w2 => w2.wallet_id)));
check('กระเป๋า Puii ยังไม่เติมเงิน → เรท planned', r.data.wallets[0].rate_source === 'planned', r.data.wallets?.[0]?.rate_source);

console.log('\n── เติมเงินเข้ากระเป๋า ──────────────────────────');
// ใช้กระเป๋าใบใหม่ เพื่อไม่ให้เรทเฉลี่ยของกระเป๋าที่เทสอื่นใช้อยู่ขยับ
r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'กระเป๋าทดสอบเติมเงิน', currency: 'JPY' } });
const fundWallet = r.data.wallet_id;

r = await call('POST', '/api/unified-trip/fundings', {
  body: { wallet_id: fundWallet, thb_amount: 2340, foreign_amount: 10000, funding_date: '2026-12-17' }
});
const lot1 = r.data.funding_id;
check('เติมเงินได้', r.status === 200 && lot1, JSON.stringify(r));
check('เรทของล็อตคิดจาก thb ÷ foreign', Math.abs(r.data.lot_rate - 0.234) < 1e-9, String(r.data.lot_rate));
// ส่ง rate ปลอมมาด้วย ต้องถูกเมิน ไม่ใช่เชื่อตาม
r = await call('POST', '/api/unified-trip/fundings', {
  body: { wallet_id: fundWallet, thb_amount: 100, foreign_amount: 1000, funding_date: '2026-12-18', rate: 99 }
});
check('ไม่รับ rate จาก client — คำนวณ thb ÷ foreign เองเสมอ',
  Math.abs(db.prepare(`SELECT rate FROM TripWalletFundings WHERE funding_id=?`).get(r.data.funding_id).rate - 0.1) < 1e-9,
  JSON.stringify(r.data));
db.prepare(`DELETE FROM TripWalletFundings WHERE funding_id=?`).run(r.data.funding_id);

// ล็อตที่สองเรทแย่กว่า → ค่าเฉลี่ยต้องขยับ ไม่ใช่ใช้ล็อตล่าสุด
r = await call('POST', '/api/unified-trip/fundings', {
  body: { wallet_id: fundWallet, thb_amount: 2500, foreign_amount: 10000, funding_date: '2026-12-20' }
});
check('เติมล็อตที่สองได้', r.status === 200, JSON.stringify(r));
check('เรทกระเป๋า = ค่าเฉลี่ยถ่วงน้ำหนัก ไม่ใช่ล็อตล่าสุด',
  Math.abs(r.data.wallet_rate - 4840 / 20000) < 1e-9, String(r.data.wallet_rate));

// บันทึกย้อนหลัง: ล็อตที่ลงวันก่อนหน้าต้องให้ผลเหมือนกัน ลำดับไม่มีผล
r = await call('POST', '/api/unified-trip/fundings', {
  body: { wallet_id: fundWallet, thb_amount: 1160, foreign_amount: 5000, funding_date: '2026-12-01' }
});
check('บันทึกย้อนหลังแล้วเฉลี่ยยังถูก (ลำดับ/วันที่ไม่มีผล)',
  Math.abs(r.data.wallet_rate - 6000 / 25000) < 1e-9, String(r.data.wallet_rate));

r = await call('POST', '/api/unified-trip/fundings', { body: { wallet_id: fundWallet, thb_amount: 0, foreign_amount: 100, funding_date: '2026-12-17' } });
check('ยอดบาท 0 → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/fundings', { body: { wallet_id: fundWallet, thb_amount: 100, foreign_amount: 0, funding_date: '2026-12-17' } });
check('ยอดเงินที่ได้ 0 → 400 (กันหารด้วยศูนย์)', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/fundings', { body: { wallet_id: fundWallet, thb_amount: 100, foreign_amount: 100, funding_date: '17/12/2026' } });
check('วันที่ผิดรูป → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/fundings', { body: { wallet_id: 'TW-ไม่มีจริง', thb_amount: 100, foreign_amount: 100, funding_date: '2026-12-17' } });
check('กระเป๋าที่ไม่มี → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/fundings', { user: 'uPuii', body: { wallet_id: fundWallet, thb_amount: 100, foreign_amount: 100, funding_date: '2026-12-17' } });
check('เติมเงินเข้ากระเป๋าคนอื่น → 403', r.status === 403, JSON.stringify(r));

r = await call('DELETE', '/api/unified-trip/fundings', { user: 'uPuii', query: `&id=${lot1}` });
check('ลบล็อตของคนอื่น → 403', r.status === 403);
r = await call('DELETE', '/api/unified-trip/fundings', { query: '&id=TWF-ไม่มีจริง' });
check('ลบล็อตที่ไม่มี → 404', r.status === 404);

// ล็อตที่ยกยอดมาจากทริปก่อนห้ามลบ ไม่งั้นต้นทุนหายจากทั้งสองทริป
db.prepare(`UPDATE TripWalletFundings SET carried_from_closure_id='TC-เก่า' WHERE funding_id=?`).run(lot1);
r = await call('DELETE', '/api/unified-trip/fundings', { query: `&id=${lot1}` });
check('ลบล็อตที่ยกยอดมาจากทริปก่อน → 409', r.status === 409, JSON.stringify(r));
db.prepare(`UPDATE TripWalletFundings SET carried_from_closure_id=NULL WHERE funding_id=?`).run(lot1);
r = await call('DELETE', '/api/unified-trip/fundings', { query: `&id=${lot1}` });
check('เจ้าของลบล็อตปกติได้', r.status === 200, JSON.stringify(r));

console.log('\n── ปิดทริป · เปิดกลับ · ปิดซ้ำ ──────────────────');
const T2 = { project: 'TRP-2' };
const netOf = () => db.prepare(`SELECT ROUND(SUM(ledger_total),2) n FROM TripClosures WHERE project_id='TRP-2'`).get().n;

// บิลใบแรก ¥5,000 หารสองคน → คนละ ¥2,500 × 0.234 = ฿585
r = await call('POST', '/api/unified-trip/expenses', {
  ...T2, body: {
    expense_date: '2026-12-18', amount_foreign: 5000, currency_code: 'JPY', wallet_id: 'W-X',
    split_mode: 'EQUAL', participants: [{ member_id: 'TM-X1' }, { member_id: 'TM-X2' }]
  }
});
check('บันทึกบิลในทริปทดสอบได้', r.status === 200, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/closures', { ...T2, body: { posting_date: '2027-01-10' } });
check('ปิดทั้งที่ยังมีเงินเหลือค้าง → 400 ต้องบอกก่อนว่าจะเอาไปไหน',
  r.status === 400 && /เงินเหลือ/.test(r.data.error), JSON.stringify(r));

r = await call('POST', '/api/unified-trip/closures', {
  ...T2, user: 'uPuii',
  body: { posting_date: '2027-01-10', lines: [{ wallet_id: 'W-X', disposition: 'RETURN', received_thb: 1200 }] }
});
check('สมาชิกธรรมดาปิดทริปไม่ได้ → 403', r.status === 403, JSON.stringify(r));

// เหลือ ¥5,000 ต้นทุน ฿1,170 แลกกลับได้ ฿1,200 → กำไรอัตราแลกเปลี่ยน ฿30
r = await call('POST', '/api/unified-trip/closures', {
  ...T2, body: { posting_date: '2027-01-10', lines: [{ wallet_id: 'W-X', disposition: 'RETURN', received_thb: 1200 }] }
});
const close1 = r.data.closure_id;
check('ปิดทริปสำเร็จ', r.status === 200, JSON.stringify(r));
check('ยอดเข้าบัญชีหลัก = ฿585 (ของ TRIP_ONLY ไม่นับ)', r.data.ledger_total === 585, String(r.data.ledger_total));
check('ยอด TRIP_ONLY แยกไว้ต่างหาก ฿585', r.data.trip_only_total === 585, String(r.data.trip_only_total));
check('กำไรอัตราแลกเปลี่ยน = 1200 − 1170 = ฿30', r.data.fx_result === 30, String(r.data.fx_result));
check('เรทถูกล็อกไว้ที่กระเป๋า', db.prepare(`SELECT locked_rate r FROM TripWallets WHERE wallet_id='W-X'`).get().r === 0.234);
check('ยอดบาทของบิลถูกแช่ไว้',
  db.prepare(`SELECT settled_amount_thb t FROM TripExpenses WHERE project_id='TRP-2'`).get().t === 1170);
check('ทริปถูกทำเครื่องหมายว่าปิดแล้ว',
  db.prepare(`SELECT status s FROM Projects WHERE project_id='TRP-2'`).get().s === 'closed');

r = await call('POST', '/api/unified-trip/expenses', { ...T2, body: { expense_date: '2026-12-19', amount_foreign: 100, currency_code: 'JPY' } });
check('ปิดแล้วเพิ่มบิลไม่ได้ → 409', r.status === 409, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/closures/reopen', { ...T2, body: {} });
check('เปิดกลับโดยไม่บอกเหตุผล → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/closures/reopen', { ...T2, user: 'uPuii', body: { reason: 'ขอแก้' } });
check('สมาชิกธรรมดาเปิดกลับไม่ได้ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/closures/reopen', { ...T2, body: { reason: 'บันทึกค่าใช้จ่ายไม่ครบ' } });
check('admin เปิดทริปกลับได้', r.status === 200, JSON.stringify(r));
check('แถวกลับชี้กลับไปที่ครั้งที่ปิด', r.data.reverses === close1, JSON.stringify(r.data));
check('แถวกลับใช้วันลงบัญชีเดิม ไม่ใช่วันนี้', r.data.posting_date === '2027-01-10', r.data.posting_date);
check('แถวกลับเป็นค่าลบของครั้งที่ปิด', r.data.ledger_total === -585, String(r.data.ledger_total));
check('🔑 สุทธิหลังเปิดกลับ = 0 ไม่ใช่ค้างอยู่ 585', netOf() === 0, String(netOf()));
check('เรทถูกปลดล็อก กลับไปคำนวณสด',
  db.prepare(`SELECT locked_rate r FROM TripWallets WHERE wallet_id='W-X'`).get().r === null);
check('ยอดบาทที่แช่ไว้ถูกล้าง',
  db.prepare(`SELECT settled_amount_thb t FROM TripExpenses WHERE project_id='TRP-2'`).get().t === null);

r = await call('POST', '/api/unified-trip/closures/reopen', { ...T2, body: { reason: 'ซ้ำ' } });
check('เปิดกลับซ้ำทั้งที่เปิดอยู่แล้ว → 409', r.status === 409, JSON.stringify(r));

// บิลที่ลืมบันทึก ¥1,000 เจ้าของคนเดียว → ฿234 เข้าบัญชีหลัก
r = await call('POST', '/api/unified-trip/expenses', {
  ...T2, body: { expense_date: '2026-12-20', amount_foreign: 1000, currency_code: 'JPY', wallet_id: 'W-X', split_mode: 'EQUAL' }
});
check('เปิดกลับแล้วเพิ่มบิลได้', r.status === 200, JSON.stringify(r));

// เหลือ ¥4,000 ต้นทุน ฿936 · คราวนี้ยกไปทริปหน้าแทนการแลกกลับ
r = await call('POST', '/api/unified-trip/closures', {
  ...T2, body: { posting_date: '2027-01-15', lines: [{ wallet_id: 'W-X', disposition: 'CARRY', carry_currency: 'JPY', carry_amount: 4000 }] }
});
check('ปิดรอบสองสำเร็จ', r.status === 200, JSON.stringify(r));
check('ยอดรอบสอง = 585 + 234 = ฿819', r.data.ledger_total === 819, String(r.data.ledger_total));
check('ยกไปทริปหน้า → ยังไม่รับรู้กำไรขาดทุน fx = 0', r.data.fx_result === 0, String(r.data.fx_result));
check('ต้นทุนที่ยกไป = ฿936 ไม่ใช่คิดใหม่จากเรทปัจจุบัน', r.data.carried_thb === 936, String(r.data.carried_thb));
check('🔑 สุทธิ = 819 ไม่ใช่ 1,404 (ไม่โพสต์ซ้ำ)', netOf() === 819, String(netOf()));
check('มี 3 แถวในสมุด: ปิด · กลับ · ปิด',
  db.prepare(`SELECT COUNT(*) n FROM TripClosures WHERE project_id='TRP-2'`).get().n === 3);

// วนอีกรอบ ต้องยังไม่เพี้ยน
await call('POST', '/api/unified-trip/closures/reopen', { ...T2, body: { reason: 'รอบสาม' } });
check('เปิดกลับรอบสอง → สุทธิกลับเป็น 0 อีกครั้ง', netOf() === 0, String(netOf()));
r = await call('POST', '/api/unified-trip/closures', {
  ...T2, body: { posting_date: '2027-01-20', lines: [{ wallet_id: 'W-X', disposition: 'CARRY', carry_amount: 4000 }] }
});
check('ปิดรอบสาม → สุทธิยังเป็น 819 เท่าเดิม', netOf() === 819, String(netOf()));
check('แถวกลับล่าสุดชี้ถูกตัว (ไม่ไปกลับแถวที่กลับไปแล้ว)',
  db.prepare(`SELECT COUNT(*) n FROM TripClosures WHERE project_id='TRP-2' AND entry_type='REOPEN'`).get().n === 2);

console.log('\n── ผูกหมวดบิลกับสมุดบัญชีตั้งแต่ตอนบันทึก ──────');
r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ categories: [{ label:'อาหาร', category_id:'CAT-FOOD', amount_foreign: 1000 }] })
});
check('ผูกหมวดที่ถูกต้องได้', r.status === 200, JSON.stringify(r));
check('category_id ถูกเก็บลงฐาน',
  db.prepare(`SELECT category_id c FROM TripExpenseCategories WHERE trip_expense_id=?`).get(r.data.trip_expense_id).c === 'CAT-FOOD');

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ categories: [{ label:'อาหาร', category_id:'CAT-SALE', amount_foreign: 1000 }] })
});
check('ผูกกับหมวดฝั่งรายได้ → 400 (นี่คือฟอร์มค่าใช้จ่าย)', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ categories: [{ label:'อาหาร', category_id:'CAT-OTHER', amount_foreign: 1000 }] })
});
check('ผูกกับหมวดของครอบครัวอื่น → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/expenses', {
  body: bill({ categories: [{ label:'อาหาร', category_id:'CAT-ไม่มีจริง', amount_foreign: 1000 }] })
});
check('ผูกกับหมวดที่ไม่มีอยู่ → 400', r.status === 400);

r = await call('GET', '/api/unified-trip');
check('GET ส่งผังบัญชีมาให้ฟอร์มเลือก',
  Array.isArray(r.data.ledger_categories) && r.data.ledger_categories.length === 2,
  JSON.stringify(r.data.ledger_categories));
check('ส่งเฉพาะหมวดฝั่งค่าใช้จ่าย ไม่ปนรายได้',
  r.data.ledger_categories.every(c => c.behavior === 'EXPENSE'));
check('ส่งชื่อ Caption มาด้วยเพื่อจัดกลุ่มในฟอร์ม',
  r.data.ledger_categories.every(c => c.caption_name === 'Expense'));

console.log('\n── โพสต์เข้าบัญชีจริงตอนปิดทริป ────────────────');
// เปิดทริปกลับก่อน แล้วปิดใหม่พร้อมระบุบัญชีปลายทาง
await call('POST', '/api/unified-trip/closures/reopen', { ...T2, body: { reason: 'ทดสอบโพสต์บัญชี' } });
db.prepare(`UPDATE TripExpenseCategories SET category_id='CAT-FOOD'
            WHERE trip_expense_id IN (SELECT trip_expense_id FROM TripExpenses WHERE project_id='TRP-2')`).run();

r = await call('POST', '/api/unified-trip/closures', {
  ...T2, body: { posting_date:'2027-02-01', account_id:'ACC-X',
    lines: [{ wallet_id:'W-X', disposition:'CARRY', carry_amount: 4000 }] }
});
check('บัญชีของครอบครัวอื่น → 400', r.status === 400 && /ครอบครัวนี้/.test(r.data.error), JSON.stringify(r));

// บิลที่ยังไม่ได้จับคู่หมวด ต้องปฏิเสธพร้อมบอกว่าหมวดไหน
db.prepare(`INSERT INTO TripExpenses (trip_expense_id,project_id,member_id,owner_member_id,wallet_id,
  amount_foreign,amount_thb,expense_date,currency_code,visibility,split_mode)
  VALUES ('TE-NOCAT','TRP-2','TM-X1','TM-X1','W-X',1000,234,'2026-12-21','JPY','TRIP','EQUAL')`).run();
db.prepare(`INSERT INTO TripExpenseParticipants VALUES ('P-NOCAT','TE-NOCAT','TM-X1',1000,NULL)`).run();
db.prepare(`INSERT INTO TripExpenseCategories VALUES ('L-NOCAT','TE-NOCAT',NULL,'ของฝาก',1000)`).run();

r = await call('POST', '/api/unified-trip/closures', {
  ...T2, body: { posting_date:'2027-02-01', account_id:'ACC-1',
    lines: [{ wallet_id:'W-X', disposition:'CARRY', carry_amount: 3000 }] }
});
check('หมวดที่ยังไม่ได้จับคู่ → 400 พร้อมบอกชื่อหมวด',
  r.status === 400 && r.data.unmapped?.includes('ของฝาก'), JSON.stringify(r.data));
check('ไม่โพสต์อะไรลงบัญชีเลยเมื่อจับคู่ไม่ครบ',
  db.prepare(`SELECT COUNT(*) n FROM Transactions`).get().n === 0);

r = await call('POST', '/api/unified-trip/closures', {
  ...T2, body: { posting_date:'2027-02-01', account_id:'ACC-1',
    category_map: { 'ของฝาก': 'CAT-STAY' },
    default_category_id: 'CAT-FOOD',
    lines: [{ wallet_id:'W-X', disposition:'CARRY', carry_amount: 3000 }] }
});
check('จับคู่ครบแล้วปิดได้', r.status === 200 && r.data.posted_to_ledger === true, JSON.stringify(r.data));
const txId = r.data.transaction_id;
check('สร้าง Transaction เดียวต่อการปิดหนึ่งครั้ง',
  db.prepare(`SELECT COUNT(*) n FROM Transactions`).get().n === 1);
check('แยกรายการย่อยตามหมวด',
  db.prepare(`SELECT COUNT(*) n FROM TransactionDetails WHERE transaction_id=?`).get(txId).n === 2,
  JSON.stringify(db.prepare(`SELECT category_id, amount FROM TransactionDetails WHERE transaction_id=?`).all(txId)));
check('ยอดรวมเท่ากับผลบวกของรายการย่อย', (() => {
  const head = db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(txId).t;
  const sum = db.prepare(`SELECT SUM(amount) s FROM TransactionDetails WHERE transaction_id=?`).get(txId).s;
  return Math.abs(head - sum) < 0.011;
})());
check('ผูกกลับไปที่ทริปได้',
  db.prepare(`SELECT project_id p FROM TransactionDetails WHERE transaction_id=? LIMIT 1`).get(txId).p === 'TRP-2');
check('TripClosures เก็บเลขที่รายการบัญชีไว้',
  db.prepare(`SELECT linked_transaction_id t FROM TripClosures WHERE linked_transaction_id IS NOT NULL`).get().t === txId);
/* บิล ¥5,000 หารกับ TM-X2 ที่เป็น TRIP_ONLY ครึ่งหนึ่ง → เข้าบัญชีแค่ ฿585
   บวกอีกสองบิลของ TM-X1 เต็มจำนวน (฿234 + ฿234) = ฿1,053
   ถ้าไม่คิดสัดส่วนจะได้ ฿1,638 ซึ่งเกินจริงไป ฿585 */
check('ยอดคิดตามสัดส่วนคนที่ ledger_mode = MAIN เท่านั้น',
  Math.abs(db.prepare(`SELECT SUM(amount) s FROM TransactionDetails WHERE transaction_id=?`).get(txId).s - 1053) < 0.011,
  String(db.prepare(`SELECT SUM(amount) s FROM TransactionDetails WHERE transaction_id=?`).get(txId).s));

/* ตัวตรวจที่แข็งแรงที่สุด: ยอดในบัญชีจริงกับยอดใน TripClosures คำนวณคนละทาง
   (ทางหนึ่งไล่ตามผู้ร่วมจ่าย อีกทางไล่ตามหมวด) ต้องได้เลขเดียวกัน */
check('🔑 ยอดที่โพสต์เข้าบัญชี = ledger_total ที่คิดจากผู้ร่วมจ่าย', (() => {
  const tx = db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(txId).t;
  const closure = db.prepare(`SELECT ledger_total l FROM TripClosures WHERE linked_transaction_id=?`).get(txId).l;
  return Math.abs(tx - closure) < 0.011;
})(), JSON.stringify({
  tx: db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(txId).t,
  closure: db.prepare(`SELECT ledger_total l FROM TripClosures WHERE linked_transaction_id=?`).get(txId).l
}));

console.log('\n── เปิดกลับต้องกลับรายการในบัญชีด้วย ───────────');
r = await call('POST', '/api/unified-trip/closures/reopen', { ...T2, body: { reason: 'ขอแก้ยอด' } });
const revId = r.data.reversed_transaction_id;
check('สร้างรายการกลับในบัญชี', Boolean(revId), JSON.stringify(r.data));
check('⚠️ ไม่ลบรายการเดิม — สมุดบัญชีมีแต่เพิ่ม',
  db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE transaction_id=?`).get(txId).n === 1);
check('รายการกลับเป็นยอดติดลบของเดิม', (() => {
  const a = db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(txId).t;
  const b = db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(revId).t;
  return Math.abs(a + b) < 1e-9;
})());
check('ลงวันเดียวกับรายการเดิม ไม่ใช่วันนี้',
  db.prepare(`SELECT date d FROM Transactions WHERE transaction_id=?`).get(revId).d === '2027-02-01');
check('🔑 ยอดสุทธิในบัญชีจริงกลับเป็น 0',
  Math.abs(db.prepare(`SELECT SUM(total_amount) s FROM Transactions`).get().s) < 1e-9);

console.log('\n── แก้ชื่อทริปและช่วงวันที่ ─────────────────────');
r = await call('POST', '/api/unified-trip/trip', { user: 'uPuii', body: { name: 'แอบเปลี่ยนชื่อ' } });
check('สมาชิกธรรมดาแก้ไม่ได้ → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/trip', { body: { name: '   ' } });
check('ชื่อว่าง → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/trip', { body: { name: 'x', start_date: '17/12/2026' } });
check('วันที่ผิดรูป → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/trip', { body: { name: 'x', start_date: '2026-12-27', end_date: '2026-12-17' } });
check('วันจบก่อนวันเริ่ม → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/trip', {
  body: { name: 'Hokkaido ฤดูหนาว 2026', start_date: '2026-12-17', end_date: '2026-12-27' }
});
check('admin แก้ได้', r.status === 200, JSON.stringify(r));
check('บันทึกลงฐานจริง', (() => {
  const row = db.prepare(`SELECT name, start_date, end_date FROM Projects WHERE project_id='TRP-1'`).get();
  return row.name === 'Hokkaido ฤดูหนาว 2026' && row.start_date === '2026-12-17' && row.end_date === '2026-12-27';
})());

// ย่นช่วงวันจนบิลหลุดออกนอก — ต้องเตือน แต่ไม่ห้าม (ตั๋วเครื่องบินจ่ายก่อนเดินทางได้)
r = await call('POST', '/api/unified-trip/trip', {
  body: { name: 'Hokkaido ฤดูหนาว 2026', start_date: '2026-12-25', end_date: '2026-12-27' }
});
check('ย่นช่วงวันแล้วยังบันทึกได้', r.status === 200);
check('แต่บอกว่ามีบิลกี่ใบหลุดออกนอกช่วง', r.data.bills_outside_range > 0, String(r.data.bills_outside_range));

// แก้แค่ชื่อ ไม่ส่งวันที่มา → วันเดิมต้องไม่หาย
r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ชื่อใหม่เฉย ๆ' } });
check('ไม่ส่งวันที่มา = ไม่แตะวันเดิม',
  db.prepare(`SELECT start_date d FROM Projects WHERE project_id='TRP-1'`).get().d === '2026-12-25',
  JSON.stringify(r.data));

r = await call('POST', '/api/unified-trip/trip', { project: 'TRP-CLOSED', body: { name: 'แก้ทริปที่ปิดแล้ว' } });
check('ทริปที่ปิดแล้วยังแก้ชื่อได้ (ไม่ใช่ตัวเลขบัญชี)', r.status === 200, JSON.stringify(r));

console.log('\n── แผนเที่ยว: จุดแวะ ────────────────────────────');
const stop = (over = {}) => ({ stop_date:'2026-12-18', time:'09:00', name_th:'ทะเลสาบอาคัง',
  city:'Lake Akan', notes:'ดูมาริโมะ', sort_order:1, ...over });

r = await call('POST', '/api/unified-trip/stops', { body: stop() });
const stopA = r.data.stop_id;
check('เพิ่มจุดแวะได้', r.status === 200 && r.data.created === true, JSON.stringify(r));
check('บันทึกลงฐานถูกต้อง', (() => {
  const row = db.prepare(`SELECT * FROM TripStops WHERE stop_id=?`).get(stopA);
  return row.name_th === 'ทะเลสาบอาคัง' && row.stop_date === '2026-12-18' && row.sort_order === 1;
})());

// แผนเที่ยวไม่ใช่เรื่องเงิน สมาชิกธรรมดาจึงต้องแก้ได้
r = await call('POST', '/api/unified-trip/stops', { user: 'uPuii', body: stop({ name_th:'ของ Puii' }) });
const stopB = r.data.stop_id;
check('สมาชิกธรรมดาเพิ่มจุดแวะได้ ไม่ต้องเป็น admin', r.status === 200, JSON.stringify(r));
check('สมาชิกธรรมดาแก้ของคนอื่นได้ด้วย (เป็นแผนร่วมกัน)',
  (await call('POST', '/api/unified-trip/stops', { user: 'uPuii', body: stop({ stop_id: stopA, name_th:'แก้โดย Puii' }) })).status === 200);

r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_date:'18/12/2026' }) });
check('วันที่ผิดรูป → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/stops', { body: stop({ time:'25:00' }) });
check('เวลาผิดรูป → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/stops', { body: stop({ time:'14:00', end_time:'09:00' }) });
check('เวลาจบก่อนเวลาเริ่ม → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/stops', { body: stop({ name_th:'', name_en:'', city:'' }) });
check('ไม่มีชื่อเลย → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:'TS-ไม่มีจริง' }) });
check('แก้จุดแวะที่ไม่มี → 404', r.status === 404);
r = await call('POST', '/api/unified-trip/stops', { project: 'TRP-CLOSED', body: stop() });
check('ทริปปิดแล้วยังแก้แผนเที่ยวได้ (ล็อกเฉพาะตัวเลขการเงิน)', r.status === 200, JSON.stringify(r));

console.log('\n── จัดลำดับ / ย้ายวัน ──────────────────────────');
r = await call('POST', '/api/unified-trip/stops/order', {
  body: { stops: [{ stop_id: stopB, sort_order: 1 }, { stop_id: stopA, sort_order: 2 }] }
});
check('สลับลำดับได้', r.status === 200 && r.data.updated === 2, JSON.stringify(r));
check('ลำดับใหม่ถูกบันทึก',
  db.prepare(`SELECT sort_order s FROM TripStops WHERE stop_id=?`).get(stopB).s === 1 &&
  db.prepare(`SELECT sort_order s FROM TripStops WHERE stop_id=?`).get(stopA).s === 2);

r = await call('POST', '/api/unified-trip/stops/order', {
  body: { stops: [{ stop_id: stopA, stop_date: '2026-12-20', sort_order: 1 }] }
});
check('ย้ายไปวันอื่นได้ในคำสั่งเดียวกัน',
  db.prepare(`SELECT stop_date d FROM TripStops WHERE stop_id=?`).get(stopA).d === '2026-12-20', JSON.stringify(r));
check('จุดแวะที่ไม่ได้ระบุวันใหม่ไม่ถูกย้ายตาม',
  db.prepare(`SELECT stop_date d FROM TripStops WHERE stop_id=?`).get(stopB).d === '2026-12-18');

r = await call('POST', '/api/unified-trip/stops/order', { body: { stops: [{ stop_id:'TS-ของทริปอื่น' }] } });
check('จัดลำดับจุดแวะที่ไม่ได้อยู่ในทริปนี้ → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/stops/order', { body: { stops: [] } });
check('ส่งรายการว่าง → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/stops/order', {
  body: { stops: [{ stop_id: stopA, stop_date: 'พรุ่งนี้' }] }
});
check('วันที่ผิดรูปตอนย้าย → 400', r.status === 400);

r = await call('DELETE', '/api/unified-trip/stops', { query: '&id=TS-ไม่มีจริง' });
check('ลบจุดแวะที่ไม่มี → 404', r.status === 404);
r = await call('DELETE', '/api/unified-trip/stops', { query: `&id=${stopB}` });
check('ลบจุดแวะได้', r.status === 200 && db.prepare(`SELECT COUNT(*) n FROM TripStops WHERE stop_id=?`).get(stopB).n === 0);

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
