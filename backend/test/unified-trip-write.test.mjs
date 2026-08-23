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

/* ⚠️ การโหลดโมดูลผ่าน data: URL มีข้อจำกัดสองชั้นที่ทำให้เทสพังแบบไล่หายาก
   (พ่น base64 ของซอร์สออกมาแทน error ที่อ่านออก) เมื่อ unified-trip.js
   เริ่ม `import ... from './auth.js'`:

   1. data: URL ไม่มี "ที่อยู่" ให้ resolve path แบบ relative
   2. เปลี่ยนเป็น file:// ก็ยังไม่ผ่าน เพราะ backend/package.json เป็น
      commonjs — Node จึงมอง auth.js เป็น CJS แล้วหา named export ไม่เจอ
      (บน Cloudflare ไม่มีปัญหานี้เพราะ esbuild bundle ให้ก่อน)

   วิธีที่ใช้: ฝังไฟล์ที่ถูก import เป็น data: URL ซ้อนเข้าไปอีกชั้น
   ทำให้ทุกอย่างเป็น ESM ล้วนและยังทดสอบ "ไฟล์จริง" ทั้งสองไฟล์ตามเดิม
   (ใช้ได้เพราะ auth.js ไม่มี import ของตัวเอง — ถ้าวันหลังมี ต้องทำ recursive) */
const asDataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
const readSrc = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

const source = readSrc('unified-trip.js')
  .replace(/from\s+'\.\/([\w.-]+)'/g, (_, file) => `from '${asDataUrl(readSrc(file))}'`);
const { handleUnifiedTrip } = await import(asDataUrl(source));

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, role TEXT);
CREATE TABLE Projects (project_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, status TEXT,
  start_date TEXT, end_date TEXT, total_budget REAL, members TEXT, banner_url TEXT,
  theme_banner TEXT, posting_date TEXT, closed_at DATETIME, trip_stage TEXT DEFAULT 'ONGOING',
  theme_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE TripMembers (member_id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT,
  display_name TEXT, role TEXT, ledger_mode TEXT DEFAULT 'MAIN', is_admin INTEGER DEFAULT 0,
  avatar_color TEXT, created_at DATETIME, passcode_hash TEXT, avatar_url TEXT, managed_by TEXT);
CREATE TABLE TripMemberSessions (token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL,
  member_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL);
CREATE TABLE TripCurrencies (project_id TEXT, code TEXT, symbol TEXT, label TEXT,
  plan_rate REAL DEFAULT 0, is_base INTEGER DEFAULT 0, icon_url TEXT, created_at DATETIME,
  PRIMARY KEY (project_id, code));
CREATE TABLE TripWallets (wallet_id TEXT PRIMARY KEY, project_id TEXT, name TEXT, currency TEXT,
  initial_balance_foreign REAL DEFAULT 0, initial_balance_thb REAL DEFAULT 0,
  exclude_on_close INTEGER DEFAULT 0, created_at DATETIME,
  owner_member_id TEXT, icon_url TEXT, locked_rate REAL, color_hue INTEGER,
  account_id TEXT, kind TEXT NOT NULL DEFAULT 'CASH');
CREATE TABLE TripWalletFundings (funding_id TEXT PRIMARY KEY, project_id TEXT, wallet_id TEXT,
  thb_amount REAL, foreign_amount REAL, rate REAL, funding_date TEXT,
  carried_from_wallet_id TEXT, carried_from_closure_id TEXT, sort_order INTEGER,
  note TEXT, source_account_id TEXT, linked_transaction_id TEXT, created_at DATETIME);
-- amount_thb เป็น NOT NULL ตามของจริง (คอลัมน์เดิมที่หน้าอื่นยังอ่านอยู่)
-- ตั้งไว้แบบนี้เพื่อให้เทสจับได้ถ้าโค้ดลืมใส่ค่า
CREATE TABLE TripExpenses (trip_expense_id TEXT PRIMARY KEY, project_id TEXT, member_id TEXT,
  wallet_id TEXT, category_id TEXT, amount_foreign REAL, amount_thb REAL NOT NULL,
  expense_date TEXT NOT NULL, note TEXT, created_at DATETIME,
  owner_member_id TEXT, visibility TEXT, is_shared INTEGER, split_mode TEXT,
  currency_code TEXT, icon_url TEXT, receipt_image_url TEXT, settled_amount_thb REAL, settled_rate REAL,
  stop_id TEXT, sort_order INTEGER, settled_thb REAL);
CREATE TABLE TripExpenseCategories (line_id TEXT PRIMARY KEY, trip_expense_id TEXT, category_id TEXT, label TEXT, amount_foreign REAL, preset_id TEXT);
CREATE TABLE TripExpensePresets (preset_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, label TEXT NOT NULL,
  icon_url TEXT, category_id TEXT, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE TripAssets (asset_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, content_type TEXT NOT NULL,
  bytes BLOB NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
-- ⚠️ ลอกจากฐาน production จริง (backup-before-trip-finance.sql) ไม่ใช่จากที่อยากให้เป็น
-- ตารางนี้มีมาก่อนแล้วและแอปหลักใช้อยู่ · add_trip_documents.sql เติมแค่ 3 คอลัมน์ท้าย
CREATE TABLE TripDocuments (document_id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
  related_entity_id TEXT, file_url TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'general',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  kind TEXT DEFAULT 'link', content_type TEXT, size_bytes INTEGER);
CREATE TABLE TripExpenseParticipants (participant_id TEXT PRIMARY KEY, trip_expense_id TEXT, member_id TEXT, amount_foreign REAL, percent REAL);
CREATE TABLE TripClosures (closure_id TEXT PRIMARY KEY, project_id TEXT, entry_type TEXT,
  posting_date TEXT, ledger_total REAL, trip_only_total REAL, fx_result REAL, carried_thb REAL,
  reverses_id TEXT, reason TEXT, performed_by TEXT, created_at DATETIME, linked_transaction_id TEXT);
CREATE TABLE TripClosureLines (line_id TEXT PRIMARY KEY, closure_id TEXT, wallet_id TEXT,
  disposition TEXT, leftover_foreign REAL, thb_cost REAL, received_thb REAL, fx_amount REAL,
  carry_currency TEXT, carry_amount REAL, carry_funding_id TEXT, settled_thb REAL);
CREATE TABLE TripPresence (project_id TEXT, member_id TEXT, is_sharing INTEGER, stop_id TEXT,
  place_label TEXT, status TEXT, latitude REAL, longitude REAL, checked_in_at DATETIME, expires_at DATETIME,
  PRIMARY KEY (project_id, member_id));
CREATE TABLE TripLegs (project_id TEXT NOT NULL, from_stop_id TEXT NOT NULL, to_stop_id TEXT NOT NULL,
  meters REAL NOT NULL, seconds REAL NOT NULL, source TEXT NOT NULL DEFAULT 'osrm',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (project_id, from_stop_id, to_stop_id));
CREATE TABLE TripDayPlans (project_id TEXT NOT NULL, plan_date TEXT NOT NULL, title TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (project_id,plan_date));
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT);
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT, name TEXT);
-- ⚠️ คีย์ของ Captions คือ type_id ไม่ใช่ caption_id — ลอกจากฐาน production จริง
-- (backend/db/schema.sql เป็นแบบร่าง ไม่ตรงกับของจริง เคยหลงเชื่อจนพังมาแล้ว)
CREATE TABLE Captions (type_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, behavior TEXT,
  created_at DATETIME, default_entity_id TEXT, default_contact_id TEXT, default_type TEXT, sub_behavior TEXT);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, name TEXT,
  created_at DATETIME, default_entity_id TEXT, default_contact_id TEXT, default_type TEXT,
  caption_id TEXT REFERENCES Captions(type_id), icon_asset TEXT);
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
  name_en TEXT, name_th TEXT, sort_order INTEGER DEFAULT 0,
  visit_status TEXT NOT NULL DEFAULT 'PLANNED', skipped_reason TEXT, highlight_text TEXT,
  planned_cost REAL, planned_currency TEXT,
  mapcode TEXT, open_time TEXT, close_time TEXT, closed_days TEXT);

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
// ── R2 shim (จำลอง binding "ICONS") — เก็บในหน่วยความจำ ไม่แตะไฟล์จริง ──────
const iconStore = new Map();
const ICONS = {
  async put(key, data, opts) {
    iconStore.set(key, { buf: data, contentType: opts?.httpMetadata?.contentType || 'application/octet-stream' });
  },
  async get(key) {
    const row = iconStore.get(key);
    if (!row) return null;
    return { httpMetadata: { contentType: row.contentType }, body: row.buf };
  },
  /* 🔴 shim ต้องมีเมธอดครบเท่าที่โค้ดจริงเรียกใช้
     เคยมีแค่ put/get แล้วพอโค้ดเริ่มใช้ list/head/delete เทสพังด้วยข้อความ
     "TypeError: e is not a function" ที่ชี้ไปยัง bundle base64 — หาสาเหตุยากมาก
     เพราะ error ไม่ได้บอกเลยว่าปัญหาอยู่ที่ตัวจำลอง ไม่ใช่ที่โค้ด */
  async head(key) {
    const row = iconStore.get(key);
    return row ? { key, size: row.buf?.byteLength ?? 0 } : null;
  },
  async delete(key) { iconStore.delete(key); },
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const keys = [...iconStore.keys()].filter(key => key.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const slice = keys.slice(start, start + limit);
    const next = start + limit;
    return {
      objects: slice.map(key => ({
        key, size: iconStore.get(key).buf?.byteLength ?? 0, uploaded: new Date().toISOString()
      })),
      truncated: next < keys.length,
      cursor: next < keys.length ? String(next) : undefined
    };
  }
};
const env = { DB, ICONS };
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
  wallet_id: walletId, split_mode: 'EQUAL', visibility: 'TRIP',
  receipt_image_url: '/api/unified-trip/icon/icons/FAM-1/receipt.webp', ...over
});

r = await call('POST', '/api/unified-trip/expenses', { body: bill() });
const billId = r.data.trip_expense_id;
check('บันทึกบิลได้', r.status === 200 && billId, JSON.stringify(r));
check('แนบรูปสลิปไว้กับบิลได้', db.prepare(`SELECT receipt_image_url u FROM TripExpenses WHERE trip_expense_id=?`).get(billId).u
  === '/api/unified-trip/icon/icons/FAM-1/receipt.webp');
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

console.log('\n── เช็กอินที่จุดแวะ ─────────────────────────────');
db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_th,latitude,longitude,sort_order)
         VALUES ('TS-CHECKIN','TRP-1','2026-12-18','ตลาด Kushiro',42.98,144.38,1)`);
r = await call('POST', '/api/unified-trip/presence', { body: { stop_id:'TS-CHECKIN' } });
check('เช็กอินได้โดยไม่บังคับส่ง GPS', r.status === 200 && r.data.place_label === 'ตลาด Kushiro', JSON.stringify(r));
check('บันทึกลง TripPresence ของสมาชิกคนปัจจุบัน', (() => {
  const row = db.prepare(`SELECT * FROM TripPresence WHERE project_id='TRP-1' AND member_id='TM-1'`).get();
  return row?.stop_id === 'TS-CHECKIN' && row?.status === 'arrived' && row?.latitude == null;
})());
r = await call('POST', '/api/unified-trip/presence', { user:'uPuii', body: {
  stop_id:'TS-CHECKIN', latitude:42.9802, longitude:144.3802
} });
check('สมาชิกเช็กอินด้วย GPS ใกล้สถานที่ได้', r.status === 200 && r.data.distance_m < 100, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/presence', { body: {
  stop_id:'TS-CHECKIN', latitude:35.68, longitude:139.76
} });
check('GPS อยู่ไกลเกิน 1 กม. → ไม่ยืนยันเช็กอิน', r.status === 409, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/presence', { body: { stop_id:'TS-ไม่มีจริง' } });
check('เช็กอิน Stop ที่ไม่อยู่ในทริปไม่ได้', r.status === 404, JSON.stringify(r));
db.exec(`DELETE FROM TripPresence WHERE stop_id='TS-CHECKIN'; DELETE FROM TripStops WHERE stop_id='TS-CHECKIN'`);

console.log('\n── เพิ่ม/แก้/ลบสมาชิกในทริป ──────────────────────');
/* 🔴 ผู้ดูแลเท่านั้น — ถ้าใครก็เพิ่มสมาชิกได้ ก็เท่ากับเพิ่มคนที่เห็นบิลที่แชร์
      ทั้งทริปได้เอง ซึ่งเป็นการรั่วข้อมูลการเงินของคนอื่น */
/* 🔴 คนที่ลงบัญชีหลักต้องผูกกับบัญชีในครอบครัวจริง — ยอดของคนกลุ่มนี้
      ไหลเข้าสมุดบัญชีจริงตอนปิดทริป ถ้าไม่รู้ว่าเป็นใครก็ตรวจย้อนไม่ได้ */
r = await call('POST', '/api/unified-trip/members', { body: { display_name: 'ป้าแดง', role: 'ญาติ' } });
check('🔑 ตั้งเป็นลงบัญชีหลักแต่ไม่ผูกบัญชี → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/members', {
  body: { display_name: 'ป้าแดง', role: 'ญาติ', user_id: 'uOther' }
});
check('⚠️ ผูกกับบัญชีของครอบครัวอื่น → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/members', {
  body: { display_name: 'ป้าแดง', role: 'ญาติ', ledger_mode: 'TRIP_ONLY' }
});
const newMember = r.data.member_id;
check('เพิ่มสมาชิกแบบเฉพาะทริปได้โดยไม่ต้องมีบัญชี', r.status === 200 && newMember, JSON.stringify(r));
check('เฉพาะทริปต้องไม่มี user_id ค้าง',
  db.prepare(`SELECT user_id u FROM TripMembers WHERE member_id=?`).get(newMember).u === null);

r = await call('GET', '/api/unified-trip/family-users', {});
check('ลิสต์บัญชีในครอบครัวไว้ให้เลือกผูกได้', r.status === 200 && r.data.users.length >= 2, JSON.stringify(r).slice(0, 100));
check('🔑 เห็นเฉพาะบัญชีในครอบครัวตัวเอง',
  r.data.users.every(u => u.user_id !== 'uOther'), JSON.stringify(r.data.users));
check('ไม่ได้เป็นผู้ดูแลโดยอัตโนมัติ',
  db.prepare(`SELECT is_admin a FROM TripMembers WHERE member_id=?`).get(newMember).a === 0);

r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: newMember, display_name: 'ป้าแดง', ledger_mode: 'TRIP_ONLY', avatar_url: 'art/gen/member_auntie.webp' }
});
check('ตั้งรูปประจำตัวได้',
  db.prepare(`SELECT avatar_url a FROM TripMembers WHERE member_id=?`).get(newMember).a === 'art/gen/member_auntie.webp');
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: newMember, display_name: 'ป้าแดง', ledger_mode: 'TRIP_ONLY', avatar_url: '   ' }
});
check('⚠️ ส่งช่องว่างล้วน → เก็บ null ไม่ใช่สตริงว่าง (หน้าจอจะได้ถอยไปใช้ตัวอักษร)',
  db.prepare(`SELECT avatar_url a FROM TripMembers WHERE member_id=?`).get(newMember).a === null);

r = await call('POST', '/api/unified-trip/members', { user: 'uPuii', body: { display_name: 'แอบเพิ่ม' } });
check('คนที่ไม่ใช่ผู้ดูแลเพิ่มสมาชิก → 403', r.status === 403, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/members', { body: { display_name: '   ' } });
check('ชื่อว่าง → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/members', { body: { display_name: 'ก'.repeat(61) } });
check('ชื่อยาวเกิน 60 ตัว → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: newMember, display_name: 'ป้าแดง', role: 'ญาติ', ledger_mode: 'เดาเอาเอง' }
});
check('🔑 ledger_mode ที่ไม่รู้จัก → ตกเป็น MAIN ไม่ใช่เขียนตามที่ส่งมา (จึงต้องผูกบัญชี → 400)',
  r.status === 400, JSON.stringify(r));

// ผูกกับบัญชีในครอบครัวแล้วตั้งเป็นลงบัญชีหลักได้
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: newMember, display_name: 'ป้าแดง', ledger_mode: 'MAIN', user_id: 'uPuii' }
});
check('⚠️ บัญชีที่ถูกผูกกับสมาชิกคนอื่นแล้ว → 409', r.status === 409, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: newMember, display_name: 'ป้าแดง', ledger_mode: 'TRIP_ONLY' }
});
check('ตั้งเป็นเก็บเฉพาะประวัติทริปได้',
  db.prepare(`SELECT ledger_mode m FROM TripMembers WHERE member_id=?`).get(newMember).m === 'TRIP_ONLY');
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: 'TM-ไม่มีจริง', display_name: 'x', ledger_mode: 'TRIP_ONLY' }
});
check('แก้สมาชิกที่ไม่มี → 404 ไม่ใช่แอบสร้างใหม่', r.status === 404, JSON.stringify(r));

// ⚠️ ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน ไม่งั้นทริปจะแก้อะไรไม่ได้อีกเลย
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: 'TM-1', display_name: 'North', is_admin: false, user_id: '9North' }
});
check('🔑 ถอดสิทธิ์ผู้ดูแลคนสุดท้าย → 409', r.status === 409, JSON.stringify(r));
check('⚠️ ปฏิเสธแล้วสิทธิ์ต้องไม่ถูกแตะ',
  db.prepare(`SELECT is_admin a FROM TripMembers WHERE member_id='TM-1'`).get().a === 1);

r = await call('DELETE', '/api/unified-trip/members', { user: 'uPuii', query: `&id=${newMember}` });
check('คนที่ไม่ใช่ผู้ดูแลลบสมาชิก → 403', r.status === 403);
r = await call('DELETE', '/api/unified-trip/members', { query: '&id=TM-ไม่มีจริง' });
check('ลบสมาชิกที่ไม่มี → 404', r.status === 404);
r = await call('DELETE', '/api/unified-trip/members', { query: '&id=TM-1' });
check('ลบตัวเอง → 409', r.status === 409, JSON.stringify(r));

r = await call('DELETE', '/api/unified-trip/members', { query: '&id=TM-2' });
check('🔑 คนที่มีบิล/กระเป๋า/ส่วนแบ่งผูกอยู่ ลบไม่ได้ → 409', r.status === 409, JSON.stringify(r));
check('บอกด้วยว่าติดตรงไหนบ้าง',
  r.data.bills + r.data.wallets + r.data.shares >= 1, JSON.stringify(r.data));
check('⚠️ ปฏิเสธแล้วต้องไม่ลบอะไรเลย',
  !!db.prepare(`SELECT 1 x FROM TripMembers WHERE member_id='TM-2'`).get());

r = await call('DELETE', '/api/unified-trip/members', { query: `&id=${newMember}` });
check('สมาชิกที่ยังไม่มีข้อมูลผูก ลบได้', r.status === 200, JSON.stringify(r));
check('หายจากฐานจริง', !db.prepare(`SELECT 1 x FROM TripMembers WHERE member_id=?`).get(newMember));

console.log('\n── ผู้ดูแลรายคน (จดแทนกันได้) ────────────────────');
/* North: "จะให้ใครจดบันทึกกระเป๋าเงินและค่าใช้จ่ายของตัวเองก็ได้"
   🔴 ให้สิทธิ์เฉพาะกับคนที่ระบุเท่านั้น ไม่ใช่ทั้งทริป
      ยายตั้ง North เป็นผู้ดูแล ไม่ได้แปลว่า North แตะกระเป๋าของ Puii ได้ด้วย */
r = await call('POST', '/api/unified-trip/members', {
  body: { display_name: 'ยาย', ledger_mode: 'TRIP_ONLY', managed_by: 'TM-2' }
});
const granny = r.data.member_id;
check('ตั้งผู้ดูแลรายคนตอนสร้างได้', r.status === 200 &&
  db.prepare(`SELECT managed_by m FROM TripMembers WHERE member_id=?`).get(granny).m === 'TM-2', JSON.stringify(r));

r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: granny, display_name: 'ยาย', ledger_mode: 'TRIP_ONLY', managed_by: granny }
});
check('ตั้งตัวเองเป็นผู้ดูแลของตัวเอง → 400', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: granny, display_name: 'ยาย', ledger_mode: 'TRIP_ONLY', managed_by: 'TM-ไม่มีจริง' }
});
check('ผู้ดูแลที่ไม่ได้อยู่ในทริป → 400', r.status === 400);

// กระเป๋าของยาย — Puii เป็นผู้ดูแลที่ระบุไว้ · XinXin ไม่ใช่
r = await call('POST', '/api/unified-trip/wallets', {
  body: { name: 'กระเป๋ายาย', currency: 'JPY', owner_member_id: granny }
});
const grannyWallet = r.data.wallet_id;
check('ผู้ดูแลทริปสร้างกระเป๋าให้ยายได้', r.status === 200 && grannyWallet, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/fundings', {
  user: 'uPuii', body: { wallet_id: grannyWallet, thb_amount: 500, foreign_amount: 2000, funding_date: '2026-12-10' }
});
check('🔑 ผู้ดูแลที่ยายระบุไว้ เติมเงินแทนได้', r.status === 200, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: granny, display_name: 'ยาย', ledger_mode: 'TRIP_ONLY', managed_by: '' }
});
check('ถอดผู้ดูแลออกได้',
  db.prepare(`SELECT managed_by m FROM TripMembers WHERE member_id=?`).get(granny).m === null);
r = await call('POST', '/api/unified-trip/fundings', {
  user: 'uPuii', body: { wallet_id: grannyWallet, thb_amount: 500, foreign_amount: 2000, funding_date: '2026-12-11' }
});
check('🔑 ถอดผู้ดูแลแล้ว เติมเงินแทนไม่ได้อีก → 403', r.status === 403, JSON.stringify(r));

// ⚠️ ผู้ดูแลของยาย ต้องไม่ได้สิทธิ์กับกระเป๋าของคนอื่นไปด้วย
r = await call('POST', '/api/unified-trip/members', {
  body: { member_id: granny, display_name: 'ยาย', ledger_mode: 'TRIP_ONLY', managed_by: 'TM-2' }
});
r = await call('POST', '/api/unified-trip/wallets', { user: 'uPuii', body: { name: 'ของ XinXin', currency: 'JPY', owner_member_id: 'TM-3' } });
check('⚠️ เป็นผู้ดูแลของยาย ไม่ได้แปลว่าแตะของ XinXin ได้ → 403', r.status === 403, JSON.stringify(r));

console.log('\n── คลังรูปที่อัปโหลด · ลบได้เฉพาะผู้ดูแล ─────────');
/* 🔴 รูปเป็นของใช้ร่วมกันทั้งครอบครัว ไม่ใช่ของคนอัปโหลด
      ถ้าใครก็ลบได้ คนหนึ่งลบทิ้ง ไอคอนของอีกคนที่ใช้อยู่จะกลายเป็นรูปแตกทันที */
db.prepare(`INSERT INTO TripAssets (asset_id, family_id, content_type, bytes) VALUES (?,?,?,?)`)
  .run('ASSET-1', 'FAM-1', 'image/webp', Buffer.from('x'));
db.prepare(`INSERT INTO TripAssets (asset_id, family_id, content_type, bytes) VALUES (?,?,?,?)`)
  .run('ASSET-OTHER', 'FAM-2', 'image/webp', Buffer.from('y'));

r = await call('GET', '/api/unified-trip/icon-upload', {});
check('ผู้ดูแลลิสต์รูปในคลังได้', r.status === 200 && Array.isArray(r.data.icons), JSON.stringify(r).slice(0, 120));
check('🔑 เห็นเฉพาะรูปของครอบครัวตัวเอง',
  r.data.icons.every(row => !row.key.includes('ASSET-OTHER')), JSON.stringify(r.data.icons));
check('ผู้ดูแลได้ธง can_delete', r.data.can_delete === true);

r = await call('GET', '/api/unified-trip/icon-upload', { user: 'uPuii' });
check('คนที่ไม่ใช่ผู้ดูแลยังลิสต์ได้ (ต้องเลือกรูปได้)', r.status === 200);
check('🔑 แต่ไม่ได้ธง can_delete → หน้าจอจะไม่โชว์ปุ่มลบ', r.data.can_delete === false);

r = await call('DELETE', '/api/unified-trip/icon-upload', { user: 'uPuii', query: '&key=db/ASSET-1' });
check('คนที่ไม่ใช่ผู้ดูแลลบ → 403', r.status === 403, JSON.stringify(r));
check('⚠️ ปฏิเสธแล้วรูปต้องยังอยู่',
  !!db.prepare(`SELECT 1 x FROM TripAssets WHERE asset_id='ASSET-1'`).get());

r = await call('DELETE', '/api/unified-trip/icon-upload', { query: '&key=db/ASSET-OTHER' });
check('🔑 ลบรูปของครอบครัวอื่น → 404 (เดาคีย์แล้วลบข้ามครอบครัวไม่ได้)', r.status === 404, JSON.stringify(r));
check('⚠️ รูปของครอบครัวอื่นต้องยังอยู่',
  !!db.prepare(`SELECT 1 x FROM TripAssets WHERE asset_id='ASSET-OTHER'`).get());

r = await call('DELETE', '/api/unified-trip/icon-upload', { query: '&key=icons/FAM-2/abc.webp' });
check('คีย์ R2 ของครอบครัวอื่น → 404', r.status === 404, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/icon-upload', { query: '&key=icons/FAM-1/../../secret' });
check('⚠️ คีย์ที่มี .. → 400 (กันไต่ path)', r.status === 400, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/icon-upload', { query: '&key=' });
check('ไม่ส่ง key → 400', r.status === 400);

r = await call('DELETE', '/api/unified-trip/icon-upload', { query: '&key=db/ASSET-1' });
check('ผู้ดูแลลบรูปของครอบครัวตัวเองได้', r.status === 200, JSON.stringify(r));
check('หายจากฐานจริง', !db.prepare(`SELECT 1 x FROM TripAssets WHERE asset_id='ASSET-1'`).get());
r = await call('DELETE', '/api/unified-trip/icon-upload', { query: '&key=db/ASSET-1' });
check('ลบซ้ำ → 404', r.status === 404);

console.log('\n── ลากสลับลำดับบิล ──────────────────────────────');
/* หน้าจอส่ง "รายชื่อ id ตามลำดับที่ต้องการ" มาทั้งชุด แล้วเซิร์ฟเวอร์เขียนทับ
   🔴 ต้องกรองเฉพาะ id ที่อยู่ในทริปนี้จริง ไม่ใช่เชื่อรายการที่ส่งมา */
const orderIds = db.prepare(`SELECT trip_expense_id id FROM TripExpenses WHERE project_id='TRP-1' LIMIT 3`).all().map(r => r.id);
r = await call('POST', '/api/unified-trip/expenses/reorder', { body: { order: [...orderIds].reverse() } });
check('จัดลำดับได้', r.status === 200 && r.data.ordered === orderIds.length, JSON.stringify(r));
const stored = id => db.prepare(`SELECT sort_order s FROM TripExpenses WHERE trip_expense_id=?`).get(id).s;
check('เลขลำดับเว้นช่องเป็น 10, 20, 30 (เผื่อแทรกทีหลัง)',
  stored(orderIds[orderIds.length - 1]) === 10 && stored(orderIds[0]) === orderIds.length * 10,
  orderIds.map(stored).join(','));
check('🔑 ลำดับตรงกับที่ส่งมา ไม่ใช่ลำดับเดิมในฐาน',
  [...orderIds].reverse().every((id, index) => stored(id) === (index + 1) * 10));

r = await call('POST', '/api/unified-trip/expenses/reorder', { body: { order: [orderIds[0], 'TE-ของทริปอื่น'] } });
check('⚠️ id ที่ไม่อยู่ในทริปนี้ถูกข้าม ไม่ใช่เขียนทับข้ามทริป',
  r.status === 200 && r.data.ordered === 1 && r.data.skipped === 1, JSON.stringify(r.data));
r = await call('POST', '/api/unified-trip/expenses/reorder', { body: { order: ['TE-ไม่มีจริงเลย'] } });
check('ไม่มี id ที่ใช้ได้เลย → 404', r.status === 404, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/expenses/reorder', { body: { order: [] } });
check('ส่งรายการว่าง → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses/reorder', { body: {} });
check('ไม่ส่ง order เลย → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/expenses/reorder', { body: { order: Array.from({ length: 501 }, (x, i) => `TE-${i}`) } });
check('ส่งเกิน 500 รายการ → 400 (กัน batch ใหญ่เกินไปจนคำสั่งล้ม)', r.status === 400, JSON.stringify(r));

console.log('\n── ลำดับรวมของบิล + การเติมเงิน (หน้ากระเป๋า) ────');
/* 🔴 ต้องใช้ "คิวเลขชุดเดียว" ข้ามทั้งสองตาราง ไม่ใช่ต่างคนต่างนับ
      ถ้าแยกคิว เลขจะชนกันเอง แล้วลำดับที่จัดไว้จะสลับเองตอนโหลดใหม่ */
const mixBill = db.prepare(`SELECT trip_expense_id id FROM TripExpenses WHERE project_id='TRP-1' LIMIT 1`).get().id;
const mixLot = db.prepare(`SELECT funding_id id FROM TripWalletFundings WHERE project_id='TRP-1' LIMIT 1`).get().id;
r = await call('POST', '/api/unified-trip/activity/reorder', {
  body: { order: [{ kind: 'fund', id: mixLot }, { kind: 'bill', id: mixBill }] }
});
check('จัดลำดับข้ามสองตารางได้', r.status === 200 && r.data.ordered === 2, JSON.stringify(r));
check('🔑 ล็อตที่อยู่อันดับ 1 ได้เลข 10',
  db.prepare(`SELECT sort_order s FROM TripWalletFundings WHERE funding_id=?`).get(mixLot).s === 10);
check('🔑 บิลที่อยู่อันดับ 2 ได้เลข 20 (ไม่ใช่ 10 ของคิวตัวเอง)',
  db.prepare(`SELECT sort_order s FROM TripExpenses WHERE trip_expense_id=?`).get(mixBill).s === 20,
  String(db.prepare(`SELECT sort_order s FROM TripExpenses WHERE trip_expense_id=?`).get(mixBill).s));

r = await call('POST', '/api/unified-trip/activity/reorder', {
  body: { order: [{ kind: 'bill', id: mixBill }, { kind: 'fund', id: 'TWF-ทริปอื่น' }] }
});
check('⚠️ id ที่ไม่อยู่ในทริปนี้ถูกข้าม', r.status === 200 && r.data.ordered === 1 && r.data.skipped === 1, JSON.stringify(r.data));
r = await call('POST', '/api/unified-trip/activity/reorder', { body: { order: [{ kind: 'fund', id: mixBill }] } });
check('⚠️ ส่ง id ของบิลแต่บอกว่าเป็นล็อต → ถูกข้าม ไม่ใช่เขียนผิดตาราง', r.status === 404, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/activity/reorder', { body: { order: [] } });
check('รายการว่าง → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/activity/reorder', { body: { order: Array.from({ length: 501 }, () => ({ kind: 'bill', id: mixBill })) } });
check('เกิน 500 รายการ → 400', r.status === 400);

console.log('\n── สีประจำกระเป๋า ────────────────────────────────');
/* เก็บเป็นองศาสี 0–359 · ค่านอกช่วงต้องกลายเป็น null ไม่ใช่บันทึกตามที่ส่งมา
   ถ้าปล่อยผ่าน หน้าจอจะสร้าง hsl(999 …) ซึ่งเบราว์เซอร์ทิ้งกฎนั้นทั้งบรรทัด
   → การ์ดใบนั้นจะไม่มีสีเลย แบบที่ไม่มี error ให้เห็น */
r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'กระเป๋าสีฟ้า', currency: 'JPY', color_hue: 200 } });
const huedWallet = r.data.wallet_id;
check('สร้างพร้อมเลือกสีได้', r.status === 200 &&
  db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h === 200);

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: huedWallet, name: 'กระเป๋าสีฟ้า', currency: 'JPY', color_hue: 340 } });
check('เปลี่ยนสีทีหลังได้', db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h === 340);

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: huedWallet, name: 'กระเป๋าสีฟ้า', currency: 'JPY', color_hue: 999 } });
check('🔑 องศาสีนอกช่วง 0–359 → เก็บ null ไม่ใช่ค่าที่ส่งมา',
  db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h === null,
  String(db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h));

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: huedWallet, name: 'กระเป๋าสีฟ้า', currency: 'JPY', color_hue: 'ชมพู' } });
check('ส่งข้อความมาแทนตัวเลข → null ไม่ใช่ NaN', db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h === null);

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: huedWallet, name: 'กระเป๋าสีฟ้า', currency: 'JPY', color_hue: 0 } });
check('⚠️ องศา 0 (สีแดง) ต้องเก็บเป็น 0 ไม่ใช่ถูกมองว่าค่าว่าง',
  db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h === 0);

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: huedWallet, name: 'กระเป๋าสีฟ้า', currency: 'JPY' } });
check('ไม่ส่งสีมาเลย → ล้างเป็น null (กลับไปใช้สีตามสกุลเงิน)',
  db.prepare(`SELECT color_hue h FROM TripWallets WHERE wallet_id=?`).get(huedWallet).h === null);

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

console.log('\n── แก้ไขล็อตเติมเงิน ────────────────────────────');
/* คนลืมจดแล้วมาใส่ทีหลัง มักใส่ผิดด้วย ต้องแก้ได้โดยไม่ต้องลบทิ้งแล้วพิมพ์ใหม่
   แต่การแก้ล็อตคือการแก้ "ต้นทุน" ของบิลทุกใบในกระเป๋านั้นพร้อมกัน จึงต้องคุมให้แน่น */
r = await call('POST', '/api/unified-trip/fundings', {
  body: { wallet_id: fundWallet, thb_amount: 3000, foreign_amount: 10000, funding_date: '2026-12-05' }
});
const editLot = r.data.funding_id;
const rateAfterAdd = r.data.wallet_rate;

r = await call('POST', '/api/unified-trip/fundings', {
  body: { funding_id: editLot, wallet_id: fundWallet, thb_amount: 2300, foreign_amount: 10000, funding_date: '2026-12-05' }
});
check('แก้ล็อตเดิมได้', r.status === 200 && r.data.funding_id === editLot, JSON.stringify(r));
check('🔑 แก้แล้วไม่เกิดล็อตใหม่ — ไม่งั้นเงินจะเด้งเป็นสองเท่า',
  db.prepare(`SELECT COUNT(*) n FROM TripWalletFundings WHERE wallet_id=?`).get(fundWallet).n === 3,
  String(db.prepare(`SELECT COUNT(*) n FROM TripWalletFundings WHERE wallet_id=?`).get(fundWallet).n));
check('ยอดในฐานข้อมูลเปลี่ยนตามที่แก้',
  db.prepare(`SELECT thb_amount t FROM TripWalletFundings WHERE funding_id=?`).get(editLot).t === 2300);
check('เรทของล็อตคำนวณใหม่หลังแก้ ไม่ใช่ค้างค่าเดิม',
  Math.abs(db.prepare(`SELECT rate FROM TripWalletFundings WHERE funding_id=?`).get(editLot).rate - 0.23) < 1e-9);
check('เรทเฉลี่ยกระเป๋าขยับตามการแก้', Math.abs(r.data.wallet_rate - rateAfterAdd) > 1e-6);
/* ล็อตในกระเป๋านี้ตอนนี้: 2500/10000 · 1160/5000 · 2300/10000 (ล็อตแรกถูกลบไปแล้วด้านบน) */
check('เรทเฉลี่ยใหม่ถูกต้อง (2500+1160+2300) ÷ 25000',
  Math.abs(r.data.wallet_rate - 5960 / 25000) < 1e-9, String(r.data.wallet_rate));

r = await call('POST', '/api/unified-trip/fundings', {
  body: { funding_id: editLot, wallet_id: fundWallet, thb_amount: 2300, foreign_amount: 10000, funding_date: '2026-12-05', rate: 99 }
});
check('⚠️ แก้แล้วยังไม่รับ rate จาก client เหมือนตอนสร้าง',
  Math.abs(db.prepare(`SELECT rate FROM TripWalletFundings WHERE funding_id=?`).get(editLot).rate - 0.23) < 1e-9);

r = await call('POST', '/api/unified-trip/fundings', {
  body: { funding_id: 'TWF-ไม่มีจริง', wallet_id: fundWallet, thb_amount: 100, foreign_amount: 100, funding_date: '2026-12-05' }
});
check('แก้ล็อตที่ไม่มี → 404 ไม่ใช่แอบสร้างใหม่ให้', r.status === 404, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/fundings', {
  user: 'uPuii', body: { funding_id: editLot, wallet_id: fundWallet, thb_amount: 100, foreign_amount: 100, funding_date: '2026-12-05' }
});
check('แก้ล็อตในกระเป๋าคนอื่น → 403', r.status === 403, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/fundings', {
  body: { funding_id: editLot, wallet_id: puiiWallet, thb_amount: 100, foreign_amount: 100, funding_date: '2026-12-05' }
});
check('🔑 ย้ายล็อตข้ามกระเป๋าไม่ได้ (เรทสองใบจะเพี้ยนพร้อมกัน)', r.status === 403 || r.status === 409, JSON.stringify(r));
check('ล็อตยังอยู่กระเป๋าเดิมจริง',
  db.prepare(`SELECT wallet_id w FROM TripWalletFundings WHERE funding_id=?`).get(editLot).w === fundWallet);

r = await call('POST', '/api/unified-trip/fundings', {
  body: { funding_id: editLot, wallet_id: fundWallet, thb_amount: 100, foreign_amount: 0, funding_date: '2026-12-05' }
});
check('แก้เป็นยอดต่างประเทศ 0 → 400 (กันหารด้วยศูนย์เหมือนตอนสร้าง)', r.status === 400);

console.log('\n── ลบกระเป๋า ──────────────────────────────────');
/* 🔴 กระเป๋าที่มีบิลผูกอยู่ ลบไม่ได้ — บิลจะตีเป็นบาทไม่ได้ ยอดรวมทริปจะหายเงียบ ๆ */
r = await call('POST', '/api/unified-trip/wallets', { body: { name: 'กระเป๋าเปล่ารอลบ', currency: 'JPY' } });
const emptyWallet = r.data.wallet_id;
r = await call('POST', '/api/unified-trip/fundings', {
  body: { wallet_id: emptyWallet, thb_amount: 500, foreign_amount: 2000, funding_date: '2026-12-10' }
});
check('เตรียมกระเป๋าเปล่าที่มีแต่ล็อตเติมเงิน', r.status === 200, JSON.stringify(r));

r = await call('DELETE', '/api/unified-trip/wallets', { query: '&id=TW-ไม่มีจริง' });
check('ลบกระเป๋าที่ไม่มี → 404', r.status === 404, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/wallets', { query: `&id=${emptyWallet}`, user: 'uPuii' });
check('ลบกระเป๋าของคนอื่น → 403', r.status === 403, JSON.stringify(r));
r = await call('DELETE', '/api/unified-trip/wallets', { query: '&id=' });
check('ไม่ส่ง id → 400', r.status === 400);

/* walletId คือใบที่บิลในเทสด้านบนผูกอยู่ — ต้องลบไม่ได้ */
const lotsBefore = db.prepare(`SELECT COUNT(*) n FROM TripWalletFundings WHERE wallet_id=?`).get(walletId).n;
r = await call('DELETE', '/api/unified-trip/wallets', { query: `&id=${walletId}` });
check('🔑 กระเป๋าที่เคยมีบิล ลบไม่ได้ → 409', r.status === 409, JSON.stringify(r));
check('บอกจำนวนบิลที่ต้องลบก่อน ไม่ใช่ปฏิเสธเฉย ๆ', r.data.bills >= 1, JSON.stringify(r.data));
check('⚠️ ปฏิเสธแล้วต้องไม่ลบอะไรเลย — กระเป๋ายังอยู่',
  !!db.prepare(`SELECT 1 x FROM TripWallets WHERE wallet_id=?`).get(walletId));
check('⚠️ ล็อตเติมเงินของกระเป๋านั้นก็ต้องไม่ถูกแตะ',
  db.prepare(`SELECT COUNT(*) n FROM TripWalletFundings WHERE wallet_id=?`).get(walletId).n === lotsBefore);

r = await call('DELETE', '/api/unified-trip/wallets', { query: `&id=${emptyWallet}` });
check('กระเป๋าที่ยังไม่มีบิล ลบได้', r.status === 200, JSON.stringify(r));
check('ล็อตเติมเงินของกระเป๋านั้นถูกลบตามไปด้วย ไม่เหลือเป็นขยะกำพร้า',
  db.prepare(`SELECT COUNT(*) n FROM TripWalletFundings WHERE wallet_id=?`).get(emptyWallet).n === 0);
check('บอกจำนวนล็อตที่ลบไปด้วย เพื่อให้ผู้ใช้รู้ว่าเสียอะไรไป', r.data.removed_lots === 1, JSON.stringify(r.data));
check('กระเป๋าหายจากฐานข้อมูลจริง', !db.prepare(`SELECT 1 x FROM TripWallets WHERE wallet_id=?`).get(emptyWallet));

console.log('\n── กระเป๋า: บัญชีต้นทาง + บัตรเครดิต ─────────────');
r = await call('POST', '/api/unified-trip/family-accounts', {});
r = await call('GET', '/api/unified-trip/family-accounts', {});
check('ลิสต์บัญชีในครอบครัวได้', r.status === 200 && r.data.accounts.length >= 1, JSON.stringify(r).slice(0, 120));
check('🔑 เห็นเฉพาะบัญชีของครอบครัวตัวเอง',
  r.data.accounts.every(a => a.account_id !== 'ACC-X'), JSON.stringify(r.data.accounts));

r = await call('POST', '/api/unified-trip/wallets', {
  body: { name: 'เงินสดจากบัญชีหลัก', currency: 'JPY', account_id: 'ACC-1' }
});
const acctWallet = r.data.wallet_id;
check('ผูกบัญชีเงินฝากกับกระเป๋าได้', r.status === 200 &&
  db.prepare(`SELECT account_id a FROM TripWallets WHERE wallet_id=?`).get(acctWallet).a === 'ACC-1');
r = await call('POST', '/api/unified-trip/wallets', {
  body: { name: 'ผูกบัญชีคนอื่น', currency: 'JPY', account_id: 'ACC-X' }
});
check('⚠️ ผูกบัญชีของครอบครัวอื่น → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', {
  body: { name: 'บัตรเครดิต', currency: 'JPY', kind: 'CREDIT', account_id: 'ACC-1' }
});
const creditWallet = r.data.wallet_id;
check('สร้างกระเป๋าบัตรเครดิตได้',
  db.prepare(`SELECT kind k FROM TripWallets WHERE wallet_id=?`).get(creditWallet).k === 'CREDIT');
check('🔑 บัตรเครดิตไม่ผูกบัญชีเงินฝาก (ยอดมาตอนบิลเรียกเก็บ)',
  db.prepare(`SELECT account_id a FROM TripWallets WHERE wallet_id=?`).get(creditWallet).a === null);

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
db.prepare(`INSERT INTO TripExpenseCategories (line_id, trip_expense_id, category_id, label, amount_foreign)
  VALUES ('L-NOCAT','TE-NOCAT',NULL,'ของฝาก',1000)`).run();

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
check('แยกรายการย่อยตามหมวด × คน',
  db.prepare(`SELECT COUNT(*) n FROM TransactionDetails WHERE transaction_id=?`).get(txId).n >= 2,
  JSON.stringify(db.prepare(`SELECT category_id, entity_id, amount FROM TransactionDetails WHERE transaction_id=?`).all(txId)));
check('🔑 บรรทัดติด entity_id ของคนนั้น — ดูย้อนได้ว่ายอดก้อนไหนของใคร',
  db.prepare(`SELECT COUNT(*) n FROM TransactionDetails WHERE transaction_id=? AND entity_id IS NOT NULL`).get(txId).n >= 0);
check('⚠️ ยอดหัวรายการเท่ากับผลรวมรายการย่อยเสมอ (รวมบรรทัด FX ด้วย)', (() => {
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

console.log('\n── ประเภททริป (Ongoing/Dream/Memory) ───────────');
r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ทริป', trip_stage: 'dream' } });
check('รับค่าตัวพิมพ์เล็กแล้วเก็บเป็นตัวใหญ่', r.status === 200 && r.data.trip_stage === 'DREAM', JSON.stringify(r));
check('บันทึกลงฐานจริง', db.prepare(`SELECT trip_stage s FROM Projects WHERE project_id='TRP-1'`).get().s === 'DREAM');

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ทริป', trip_stage: 'ONGOING' } });
check('เปลี่ยนกลับได้', r.status === 200 && r.data.trip_stage === 'ONGOING');

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ทริป', trip_stage: 'สนุกมาก' } });
check('ค่าที่ไม่รู้จัก → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ไม่แตะประเภท' } });
check('ไม่ส่ง trip_stage มา = ไม่เปลี่ยนของเดิม',
  db.prepare(`SELECT trip_stage s FROM Projects WHERE project_id='TRP-1'`).get().s === 'ONGOING');

console.log('\n── แบนเนอร์ทริป ────────────────────────────────');
r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ทริป', theme_banner: '../assets/images/banner_japan.jpg' } });
check('ตัด ../ ออกก่อนเก็บ (แอปหลักอ่านจากอีกระดับ)',
  db.prepare(`SELECT theme_banner b FROM Projects WHERE project_id='TRP-1'`).get().b === 'assets/images/banner_japan.jpg',
  db.prepare(`SELECT theme_banner b FROM Projects WHERE project_id='TRP-1'`).get().b);

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ทริป', theme_banner: 'data:image/png;base64,AAAA' } });
check('รูปอัปโหลดเอง (data:) → 400 ไม่ยอมให้แถวบวม', r.status === 400, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/trip', { body: { name: 'ทริป', theme_banner: 'x'.repeat(400) } });
check('ที่อยู่รูปยาวเกิน → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'เปลี่ยนแค่ชื่อ' } });
check('ไม่ส่ง theme_banner มา = ไม่แตะรูปเดิม',
  db.prepare(`SELECT theme_banner b FROM Projects WHERE project_id='TRP-1'`).get().b === 'assets/images/banner_japan.jpg');

console.log('\n── แผนเที่ยว: จุดแวะ ────────────────────────────');
const stop = (over = {}) => ({ stop_date:'2026-12-18', time:'09:00', name_th:'ทะเลสาบอาคัง',
  city:'Lake Akan', notes:'ดูมาริโมะ', sort_order:1, ...over });

r = await call('POST', '/api/unified-trip/days', { body: { plan_date:'2026-12-18', title:'เดินทางถึง Kushiro' } });
check('ตั้งชื่อแผนประจำวันได้', r.status === 200 && r.data.title === 'เดินทางถึง Kushiro', JSON.stringify(r));
check('ชื่อแผนประจำวันเก็บแยกจาก Stop',
  db.prepare(`SELECT title FROM TripDayPlans WHERE project_id='TRP-1' AND plan_date='2026-12-18'`).get()?.title === 'เดินทางถึง Kushiro');
r = await call('POST', '/api/unified-trip/days', { body: { plan_date:'2026-12-18', title:'' } });
check('ล้างชื่อเพื่อกลับไปใช้ชื่ออัตโนมัติได้', r.status === 200 &&
  !db.prepare(`SELECT title FROM TripDayPlans WHERE project_id='TRP-1' AND plan_date='2026-12-18'`).get());

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

r = await call('POST', '/api/unified-trip/stops', { body: stop({
  stop_id:stopA, name_th:'แก้โดย Puii', visit_status:'SKIPPED', skipped_reason:'ฝนตก', highlight_text:'มาริโมะของดี'
}) });
check('ข้าม Stop โดยไม่ลบได้', r.status === 200 && (() => {
  const row = db.prepare(`SELECT visit_status,skipped_reason FROM TripStops WHERE stop_id=?`).get(stopA);
  return row.visit_status === 'SKIPPED' && row.skipped_reason === 'ฝนตก' &&
    db.prepare(`SELECT highlight_text h FROM TripStops WHERE stop_id=?`).get(stopA).h === 'มาริโมะของดี';
})(), JSON.stringify(r));
r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:stopA, name_th:'แก้ชื่อหลังข้าม' }) });
check('แก้รายละเอียดแล้วสถานะข้ามไม่หาย',
  (() => { const row = db.prepare(`SELECT visit_status,highlight_text FROM TripStops WHERE stop_id=?`).get(stopA);
    return row.visit_status === 'SKIPPED' && row.highlight_text === 'มาริโมะของดี'; })());
r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:stopA, name_th:'นำกลับ', visit_status:'PLANNED' }) });
check('นำ Stop กลับเข้าแผนได้', (() => {
  const row = db.prepare(`SELECT visit_status,skipped_reason FROM TripStops WHERE stop_id=?`).get(stopA);
  return row.visit_status === 'PLANNED' && row.skipped_reason == null;
})());

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

console.log('\n── รายการทริปทั้งหมดของครอบครัว (หน้ารวม) ─────');
r = await call('GET', '/api/unified-trip/trips', {});
check('ได้รายการทริปกลับมา', r.status === 200 && Array.isArray(r.data.trips), JSON.stringify(r));
check('เห็นทริปของครอบครัวตัวเอง', r.data.trips.some(t => t.project_id === 'TRP-1'));
check('ไม่เห็นทริปครอบครัวอื่น', !r.data.trips.some(t => t.project_id === 'TRP-OTHERFAM'));
check('บอกด้วยว่าโพสต์บัญชีจริงไปหรือยัง (field posted_to_ledger)',
  r.data.trips.every(t => typeof t.posted_to_ledger === 'boolean'));
check('หน้ารวมได้รายการ Stop จริงสำหรับแถบไอคอน',
  r.data.trips.every(t => Array.isArray(t.stops))
  && r.data.trips.find(t => t.project_id === 'TRP-1').stops.length > 0);
check('Stop ในหน้ารวมมีชื่อและไอคอนจาก TripStops', (() => {
  const stop = r.data.trips.find(t => t.project_id === 'TRP-1').stops[0];
  return Boolean(stop.stop_id && stop.name) && Object.hasOwn(stop, 'icon_asset');
})());
check('หน้ารวมได้จำนวนสมาชิกของแต่ละทริป',
  r.data.trips.every(t => Number.isInteger(t.member_count)));

r = await call('GET', '/api/unified-trip/trips', { user: 'uOther' });
check('ครอบครัวอื่นเห็นแต่ทริปของตัวเอง', r.status === 200 && r.data.trips.length === 0, JSON.stringify(r));

console.log('\n── สร้างทริปใหม่ ────────────────────────────────');
r = await call('POST', '/api/unified-trip/trips', { body: { name: 'ทริปเกาะหลีเป๊ะ', trip_stage: 'dream' } });
check('สมาชิกธรรมดาก็สร้างได้ ไม่ต้อง admin', r.status === 201, JSON.stringify(r));
const newTripId = r.data.project_id;
check('ได้ project_id ใหม่กลับมา', Boolean(newTripId));
check('ไม่ส่ง trip_stage → เป็น DREAM โดย default (ทดสอบด้วยอีกทริป)', true); // ดูเคสถัดไป

check('บันทึกลงฐานจริง ผูก family ของผู้สร้าง', (() => {
  const row = db.prepare(`SELECT family_id, trip_stage, status FROM Projects WHERE project_id=?`).get(newTripId);
  return row?.family_id === 'FAM-1' && row?.trip_stage === 'DREAM' && row?.status === 'active';
})());
check('ผู้สร้างกลายเป็น admin ของทริปใหม่ทันที', (() => {
  const row = db.prepare(`SELECT is_admin FROM TripMembers WHERE project_id=? AND user_id='9North'`).get(newTripId);
  return row?.is_admin === 1;
})());

r = await call('POST', '/api/unified-trip/trips', { body: { name: 'ไม่ระบุประเภท' } });
check('ไม่ส่ง trip_stage มา = DREAM โดย default', r.status === 201 && r.data.trip_stage === 'DREAM', JSON.stringify(r));

r = await call('POST', '/api/unified-trip/trips', { body: { name: '   ' } });
check('ชื่อว่าง → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/trips', { body: { name: 'x', start_date: 'พรุ่งนี้' } });
check('วันที่ผิดรูป → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/trips', { body: { name: 'x', start_date: '2026-12-27', end_date: '2026-12-17' } });
check('วันจบก่อนวันเริ่ม → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/trips', { body: { name: 'x', trip_stage: 'สนุกมาก' } });
check('ประเภทที่ไม่รู้จัก → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/trips', { user: 'uOther', body: { name: 'ทริปของครอบครัวอื่น' } });
check('ครอบครัวอื่นสร้างได้ ผูกกับ family ของตัวเอง ไม่ใช่ FAM-1', (() => {
  const row = db.prepare(`SELECT family_id FROM Projects WHERE project_id=?`).get(r.data.project_id);
  return row?.family_id === 'FAM-2';
})());

console.log('\n── ลบทริป ────────────────────────────────────────');
// ทริปที่ยังไม่เคยโพสต์บัญชีเลย — ลบได้จริง พร้อมข้อมูลลูกทั้งหมด
db.exec(`
  INSERT INTO Projects (project_id,family_id,name,status,start_date,end_date) VALUES ('TRP-DEL1','FAM-1','ทริปจะลบ','active','2026-01-01','2026-01-05');
  INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin) VALUES
    ('TM-D1','TRP-DEL1','9North','North','ผู้ดูแล','MAIN',1),
    ('TM-D2','TRP-DEL1','uPuii','Puii','สมาชิก','MAIN',0);
  INSERT INTO TripCurrencies (project_id,code,symbol,label,plan_rate,is_base) VALUES ('TRP-DEL1','THB','฿','บาท',1,1);
  INSERT INTO TripWallets (wallet_id,project_id,name,currency,owner_member_id) VALUES ('W-DEL1','TRP-DEL1','เงินสด','THB','TM-D1');
  INSERT INTO TripExpenses (trip_expense_id,project_id,member_id,owner_member_id,wallet_id,amount_foreign,amount_thb,expense_date,currency_code,visibility)
    VALUES ('TE-DEL1','TRP-DEL1','TM-D1','TM-D1','W-DEL1',100,100,'2026-01-02','THB','TRIP');
  INSERT INTO TripStops (stop_id,project_id,stop_date,name_th) VALUES ('TS-DEL1','TRP-DEL1','2026-01-02','จุดแวะ');
`);

r = await call('DELETE', '/api/unified-trip/trip', { user: 'uPuii', project: 'TRP-DEL1' });
check('สมาชิกธรรมดาลบไม่ได้ → 403', r.status === 403, JSON.stringify(r));
check('ทริปยังอยู่ครบ ไม่มีอะไรหาย', db.prepare(`SELECT COUNT(*) n FROM Projects WHERE project_id='TRP-DEL1'`).get().n === 1);

r = await call('DELETE', '/api/unified-trip/trip', { project: 'TRP-DEL1' });
check('admin ลบทริปที่ไม่เคยโพสต์บัญชีได้', r.status === 200 && r.data.deleted === 'TRP-DEL1', JSON.stringify(r));
check('Projects หายไปจริง', db.prepare(`SELECT COUNT(*) n FROM Projects WHERE project_id='TRP-DEL1'`).get().n === 0);
check('ลูกทุกตารางถูกลบตาม (ไม่เหลือข้อมูลลอย)', (() => {
  const counts = [
    db.prepare(`SELECT COUNT(*) n FROM TripMembers WHERE project_id='TRP-DEL1'`).get().n,
    db.prepare(`SELECT COUNT(*) n FROM TripWallets WHERE project_id='TRP-DEL1'`).get().n,
    db.prepare(`SELECT COUNT(*) n FROM TripExpenses WHERE project_id='TRP-DEL1'`).get().n,
    db.prepare(`SELECT COUNT(*) n FROM TripStops WHERE project_id='TRP-DEL1'`).get().n,
    db.prepare(`SELECT COUNT(*) n FROM TripCurrencies WHERE project_id='TRP-DEL1'`).get().n
  ];
  return counts.every(n => n === 0);
})());

// ทริปที่เคยโพสต์เข้าบัญชีจริงแล้ว — ห้ามลบเด็ดขาด แม้จะเป็น admin
db.exec(`
  INSERT INTO Projects (project_id,family_id,name,status,start_date,end_date) VALUES ('TRP-DEL2','FAM-1','ทริปโพสต์บัญชีแล้ว','closed','2026-01-01','2026-01-05');
  INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin) VALUES
    ('TM-D3','TRP-DEL2','9North','North','ผู้ดูแล','MAIN',1);
  INSERT INTO TripClosures (closure_id,project_id,entry_type,posting_date,ledger_total,linked_transaction_id)
    VALUES ('TC-DEL2','TRP-DEL2','CLOSE','2026-01-05',500,'TX-REAL-1');
`);

r = await call('DELETE', '/api/unified-trip/trip', { project: 'TRP-DEL2' });
check('🔑 โพสต์บัญชีจริงแล้ว → ลบไม่ได้เด็ดขาด แม้เป็น admin', r.status === 409, JSON.stringify(r));
check('ทริปยังอยู่ครบ ไม่มีอะไรถูกลบไปแม้แต่แถวเดียว', (() => {
  const counts = [
    db.prepare(`SELECT COUNT(*) n FROM Projects WHERE project_id='TRP-DEL2'`).get().n,
    db.prepare(`SELECT COUNT(*) n FROM TripMembers WHERE project_id='TRP-DEL2'`).get().n,
    db.prepare(`SELECT COUNT(*) n FROM TripClosures WHERE project_id='TRP-DEL2'`).get().n
  ];
  return counts.every(n => n === 1);
})());
check('ยังเปลี่ยนเป็น Memory แทนได้ตามปกติ (ไม่ได้ถูกล็อกทั้งทริป)',
  (await call('POST', '/api/unified-trip/trip', { project: 'TRP-DEL2', body: { name: 'ทริปโพสต์บัญชีแล้ว', trip_stage: 'memory' } })).status === 200);

console.log('\n── ผู้ดูแลระบบครอบครัวจัดการทริปกำพร้าได้ ──────');
/* ทริปเก่า/ทริปทดสอบที่สมาชิกเป็นแค่ชื่อ ไม่ผูกกับบัญชีใครเลย —
   ถ้าไม่มีกติกา familyAdmin จะไม่มีใครแก้/ลบทริปแบบนี้ได้อีกเลย */
db.exec(`
  INSERT INTO Projects (project_id,family_id,name,status) VALUES ('TRP-ORPHAN','FAM-1','ทริปกำพร้า','active');
  INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin) VALUES
    ('TM-OR1','TRP-ORPHAN',NULL,'ดำดำดำด','ผู้ดูแล','MAIN',1);
`);

r = await call('GET', '/api/unified-trip', { project: 'TRP-ORPHAN' });
check('เข้าดูได้แม้ไม่เป็นสมาชิก (ครอบครัวเดียวกัน)', r.status === 200, JSON.stringify(r.status));
check('viewer เป็น null ไม่ใช่ error', r.data.viewer === null);
check('🔑 meta.can_manage_trip = true สำหรับผู้ดูแลระบบครอบครัว', r.data.meta.can_manage_trip === true);

r = await call('GET', '/api/unified-trip', { user: 'uPuii', project: 'TRP-ORPHAN' });
check('สมาชิกธรรมดาของครอบครัว: can_manage_trip = false', r.data.meta.can_manage_trip === false, JSON.stringify(r.data.meta));

r = await call('POST', '/api/unified-trip/trip', { user: 'uPuii', project: 'TRP-ORPHAN', body: { name: 'แอบแก้' } });
check('สมาชิกธรรมดา (ไม่ใช่ผู้ดูแลระบบ) แก้ไม่ได้ → 403', r.status === 403);

r = await call('POST', '/api/unified-trip/trip', { project: 'TRP-ORPHAN', body: { name: 'ทริปกำพร้า (แก้โดยผู้ดูแลระบบ)', trip_stage: 'memory' } });
check('ผู้ดูแลระบบครอบครัวแก้ได้แม้ไม่เป็นสมาชิกทริป', r.status === 200, JSON.stringify(r));

r = await call('DELETE', '/api/unified-trip/trip', { user: 'uPuii', project: 'TRP-ORPHAN' });
check('สมาชิกธรรมดาลบไม่ได้ → 403', r.status === 403);
r = await call('DELETE', '/api/unified-trip/trip', { project: 'TRP-ORPHAN' });
check('🔑 ผู้ดูแลระบบครอบครัวลบทริปกำพร้าได้', r.status === 200, JSON.stringify(r));
check('ลบจริง รวมสมาชิกที่ไม่ผูกบัญชี', (() => {
  return db.prepare(`SELECT COUNT(*) n FROM Projects WHERE project_id='TRP-ORPHAN'`).get().n === 0
      && db.prepare(`SELECT COUNT(*) n FROM TripMembers WHERE project_id='TRP-ORPHAN'`).get().n === 0;
})());

// ครอบครัวอื่นยังมองไม่เห็น/ทำอะไรไม่ได้เหมือนเดิม แม้เป็น role admin ของครอบครัวตัวเอง
db.exec(`UPDATE Users SET role='admin' WHERE user_id='uOther'`);
db.exec(`INSERT INTO Projects (project_id,family_id,name,status) VALUES ('TRP-ORPHAN2','FAM-1','ทริปกำพร้า 2','active')`);
r = await call('DELETE', '/api/unified-trip/trip', { user: 'uOther', project: 'TRP-ORPHAN2' });
check('⚠️ admin ของครอบครัวอื่นลบทริปเราไม่ได้ → 404', r.status === 404, JSON.stringify(r.status));
db.exec(`DELETE FROM Projects WHERE project_id='TRP-ORPHAN2'; UPDATE Users SET role='member' WHERE user_id='uOther'`);

console.log('\n── ไอคอนที่ครอบครัวอัปโหลดเอง (2026-08-07) ──────');
/* /category-icons และ /icon-upload ไม่ผูกกับทริปใดทริปหนึ่ง เรียกตรงด้วย
   handleUnifiedTrip แทน call() เพราะ call() ผูก ?projectId= เสมอ */

r = { status: 0, data: null };
{
  const url = new URL('https://x/api/unified-trip/category-icons');
  const req = new Request(url, { method: 'GET', headers: { 'x-user-id': '9North' } });
  const res = await handleUnifiedTrip(req, env, url, cors, '9North');
  const data = await res.json();
  check('GET /category-icons คืนเฉพาะหมวด EXPENSE ของครอบครัวตัวเอง', res.status === 200 &&
    data.categories.some(c => c.category_id === 'CAT-FOOD') &&
    !data.categories.some(c => c.category_id === 'CAT-SALE') &&
    !data.categories.some(c => c.category_id === 'CAT-OTHER'), JSON.stringify(data));
}

{
  const url = new URL('https://x/api/unified-trip/category-icons');
  const req = new Request(url, {
    method: 'POST', headers: { 'x-user-id': '9North', 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: 'CAT-FOOD', icon_url: 'https://x/api/unified-trip/icon/icons/FAM-1/abc.png' })
  });
  const res = await handleUnifiedTrip(req, env, url, cors, '9North');
  check('POST /category-icons บันทึกสำเร็จ', res.status === 200, JSON.stringify(await res.clone().json()));
  check('ไอคอนถูกเขียนลง Categories.icon_asset จริง',
    db.prepare(`SELECT icon_asset FROM Categories WHERE category_id='CAT-FOOD'`).get().icon_asset
      === 'https://x/api/unified-trip/icon/icons/FAM-1/abc.png');
}

{
  const url = new URL('https://x/api/unified-trip/category-icons');
  const req = new Request(url, {
    method: 'POST', headers: { 'x-user-id': '9North', 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: 'CAT-OTHER', icon_url: 'https://x/evil.png' })
  });
  const res = await handleUnifiedTrip(req, env, url, cors, '9North');
  check('⚠️ ตั้งไอคอนหมวดของครอบครัวอื่นไม่ได้ → 404', res.status === 404);
}

let uploadedUrl = '';
{
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
  const form = new FormData();
  form.append('file', blob, 'test.png');
  const url = new URL('https://x/api/unified-trip/icon-upload');
  const req = new Request(url, { method: 'POST', headers: { 'x-user-id': '9North' }, body: form });
  const res = await handleUnifiedTrip(req, env, url, cors, '9North');
  const data = await res.json();
  uploadedUrl = data.url || '';
  check('POST /icon-upload คืน url ที่ชี้ไปโฟลเดอร์ของครอบครัวตัวเอง', res.status === 201 &&
    uploadedUrl.includes('/api/unified-trip/icon/icons/FAM-1/'), JSON.stringify(data));
}

{
  const key = uploadedUrl.split('/api/unified-trip/icon/')[1] || '';
  const url = new URL(`https://x/api/unified-trip/icon/${key}`);
  const req = new Request(url, { method: 'GET' });
  // userId ว่าง = จำลอง <img src> ที่ไม่มี Authorization header แนบมาด้วย
  const res = await handleUnifiedTrip(req, env, url, cors, '');
  check('🔑 GET /icon/{key} ดึงได้แม้ไม่ได้ล็อกอิน (สำหรับ <img src>)', res.status === 200);
  check('content-type ตรงกับตอนอัปโหลด', res.headers.get('content-type') === 'image/png');
}

{
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/gif' });
  const form = new FormData();
  form.append('file', blob, 'bad.gif');
  const url = new URL('https://x/api/unified-trip/icon-upload');
  const req = new Request(url, { method: 'POST', headers: { 'x-user-id': '9North' }, body: form });
  const res = await handleUnifiedTrip(req, env, url, cors, '9North');
  check('⚠️ ไฟล์ชนิดที่ไม่รองรับ (gif) → 400', res.status === 400);
}

{
  const url = new URL('https://x/api/unified-trip/icon-upload');
  const req = new Request(url, { method: 'POST', body: new FormData() });
  const res = await handleUnifiedTrip(req, env, url, cors, '');
  check('⚠️ อัปโหลดไอคอนโดยไม่ล็อกอิน → 401', res.status === 401);
}

console.log('\n── รายการค่าใช้จ่ายย่อยประจำทริป (2026-08-10) ──────');
/* หัวใจของฟีเจอร์นี้: แก้ชื่อ/ไอคอนของรายการทีเดียว บิลเก่าทุกใบต้องเปลี่ยนตาม
   ถ้าเทสนี้ผ่าน แปลว่าบิลอ้าง preset_id จริง ไม่ได้ก๊อปค่าไปเก็บตอนสร้าง */

r = await call('POST', '/api/unified-trip/presets', { body: { label: 'ราเมง', icon_url: 'ramen.png', category_id: 'CAT-FOOD' } });
check('เพิ่มรายการย่อยได้', r.status === 201, JSON.stringify(r));
const presetRamen = r.data.preset_id;

r = await call('POST', '/api/unified-trip/presets', { body: { label: 'ขนม', icon_url: 'snack.png', category_id: 'CAT-FOOD' } });
check('🔑 หลายรายการผูกหมวดบัญชีเดียวกันได้ (ราเมง + ขนม → CAT-FOOD)', r.status === 201);
const presetSnack = r.data.preset_id;

r = await call('POST', '/api/unified-trip/presets', { body: { label: 'ไม่มีชื่อ', category_id: 'CAT-FOOD' } });
check('ไอคอนเว้นว่างได้ ไม่บังคับ', r.status === 201);

r = await call('POST', '/api/unified-trip/presets', { body: { label: '', category_id: 'CAT-FOOD' } });
check('ชื่อว่าง → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/presets', { body: { label: 'แอบผูกข้ามครอบครัว', category_id: 'CAT-OTHER' } });
check('⚠️ ผูกหมวดบัญชีของครอบครัวอื่นไม่ได้ → 400', r.status === 400, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/presets', { user: 'uOther', body: { label: 'คนนอก' } });
check('⚠️ คนนอกครอบครัวเพิ่มรายการในทริปเราไม่ได้ → 404', r.status === 404);

// บิลที่ใช้ preset — ต้องอ่านชื่อ/ไอคอนกลับมาจาก preset ปัจจุบัน ไม่ใช่ label ที่ส่งไป
r = await call('POST', '/api/unified-trip/expenses', {
  body: {
    expense_date: '2026-12-18', amount_foreign: 1000, currency_code: 'THB',
    member_id: 'TM-1', owner_member_id: 'TM-1', note: 'มื้อเที่ยง',
    categories: [{ label: 'ชื่อเก่าตอนจด', preset_id: presetRamen, amount_foreign: 1000 }],
    participants: [{ member_id: 'TM-1' }]
  }
});
check('บันทึกบิลที่ผูกรายการย่อยได้', r.status === 200, JSON.stringify(r));
const presetBillId = r.data.trip_expense_id;

r = await call('GET', '/api/unified-trip');
let line = r.data.expenses.find(e => e.trip_expense_id === presetBillId)?.categories[0];
check('🔑 อ่านกลับได้ชื่อจาก preset ไม่ใช่ label ที่ส่งตอนจด', line?.label === 'ราเมง', JSON.stringify(line));
check('🔑 ได้ไอคอนของ preset มาด้วย', line?.icon_url === 'ramen.png');
check('🔑 หมวดบัญชีมาจาก preset (CAT-FOOD)', line?.category_id === 'CAT-FOOD');

// ── หัวใจของฟีเจอร์: แก้ preset แล้วบิลเก่าเปลี่ยนตาม ──
r = await call('POST', '/api/unified-trip/presets', {
  body: { preset_id: presetRamen, label: 'ราเมงต้นตำรับ', icon_url: 'ramen2.png', category_id: 'CAT-STAY' }
});
check('แก้ไขรายการย่อยได้', r.status === 200, JSON.stringify(r));

r = await call('GET', '/api/unified-trip');
line = r.data.expenses.find(e => e.trip_expense_id === presetBillId)?.categories[0];
check('🔑 แก้ชื่อ preset → บิลเก่าเปลี่ยนตามทันที', line?.label === 'ราเมงต้นตำรับ', JSON.stringify(line));
check('🔑 แก้ไอคอน preset → บิลเก่าเปลี่ยนตาม', line?.icon_url === 'ramen2.png');
check('🔑 เปลี่ยนหมวดบัญชีที่ผูก → บิลเก่าเปลี่ยนตาม', line?.category_id === 'CAT-STAY');

r = await call('POST', '/api/unified-trip/presets', { body: { preset_id: 'TXP-ไม่มีจริง', label: 'x' } });
check('แก้รายการที่ไม่มี → 404', r.status === 404);

// ── ลบ preset: บิลเก่าต้องไม่ไร้ชื่อ ──
r = await call('DELETE', '/api/unified-trip/presets', { query: `&id=${encodeURIComponent(presetRamen)}` });
check('ลบรายการย่อยได้', r.status === 200, JSON.stringify(r));

r = await call('GET', '/api/unified-trip');
line = r.data.expenses.find(e => e.trip_expense_id === presetBillId)?.categories[0];
check('🔑 ลบ preset แล้วบิลเก่ายังอยู่ ไม่ไร้ชื่อ', Boolean(line?.label), JSON.stringify(line));
check('บิลไม่ถูกลบตาม preset', r.data.expenses.some(e => e.trip_expense_id === presetBillId));

r = await call('DELETE', '/api/unified-trip/presets', { query: '&id=TXP-ไม่มีจริง' });
check('ลบรายการที่ไม่มี → 404', r.status === 404);

// รายการของทริปหนึ่งต้องไม่ไปโผล่ในอีกทริป แม้อยู่ครอบครัวเดียวกัน
r = await call('GET', '/api/unified-trip', { project: 'TRP-2' });
check('⚠️ รายการย่อยเป็นของทริปใครทริปมัน ไม่ปนกัน',
  !(r.data.presets || []).some(p => p.preset_id === presetSnack), JSON.stringify(r.data.presets));

r = await call('GET', '/api/unified-trip');
check('ทริปเดิมยังเห็นรายการของตัวเองครบ',
  (r.data.presets || []).some(p => p.preset_id === presetSnack));
check('payload คืนชื่อหมวดบัญชีมาด้วย (ไม่ต้องจับคู่เอง)',
  r.data.presets.find(p => p.preset_id === presetSnack)?.category_name === 'ค่าอาหาร');

console.log('\n── ธีมสีของทริป (2026-08-10) ──────');
/* ธีมเก็บเป็น "รหัส" ไม่ใช่ค่าสี — สีจริงอยู่ใน themes.css
   เทสจึงตรวจแค่ว่ารับเฉพาะรหัสที่รู้จัก และไม่แตะฟิลด์อื่นตอนเปลี่ยนธีม */

r = await call('GET', '/api/unified-trip');
check('ทริปใหม่ยังไม่มีธีม = null (ให้หน้าจอเลือกค่าเริ่มต้นเอง)', r.data.trip.theme_id === null, JSON.stringify(r.data.trip.theme_id));

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026', theme_id: 'sakura' } });
check('ตั้งธีมได้', r.status === 200 && r.data.theme_id === 'sakura', JSON.stringify(r));
check('ธีมถูกเขียนลงฐานจริง',
  db.prepare(`SELECT theme_id t FROM Projects WHERE project_id='TRP-1'`).get().t === 'sakura');

r = await call('GET', '/api/unified-trip');
check('อ่านธีมกลับมาได้', r.data.trip.theme_id === 'sakura');

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026' } });
check('🔑 ไม่ส่ง theme_id มา = ไม่แตะธีมเดิม', r.data.theme_id === 'sakura', JSON.stringify(r.data.theme_id));

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026', theme_id: 'HOKKAIDO' } });
check('รับตัวพิมพ์ใหญ่ได้ (แปลงเป็นตัวเล็ก)', r.data.theme_id === 'hokkaido', JSON.stringify(r));

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026', theme_id: 'neon-cyberpunk' } });
check('⚠️ ธีมที่ไม่รู้จัก → 400', r.status === 400, JSON.stringify(r));
check('ธีมเดิมไม่ถูกทับเมื่อค่าใหม่ไม่ผ่าน',
  db.prepare(`SELECT theme_id t FROM Projects WHERE project_id='TRP-1'`).get().t === 'hokkaido');

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026', theme_id: '' } });
check('ส่งค่าว่าง = ล้างธีม กลับไปใช้ค่าเริ่มต้น', r.status === 200 && r.data.theme_id === null, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/trip', { user: 'uPuii', body: { name: 'แอบเปลี่ยน', theme_id: 'sakura' } });
check('⚠️ สมาชิกธรรมดาเปลี่ยนธีมไม่ได้ → 403', r.status === 403);

console.log('\n── อัปโหลดรูปตอนที่ยังไม่มี R2 (เก็บลง D1) 2026-08-11 ──────');
/* บั๊กจริงที่เจอ: บัญชียังไม่ได้เปิด R2 → upload ตอบ 500 → หน้าจอถอยไปเก็บรูป
   เป็น data: URL ในเบราว์เซอร์ → รีเฟรชแล้วแบนเนอร์หาย และคนอื่นไม่เห็น
   เทสชุดนี้ยืนยันว่า "ไม่มี R2 ก็ต้องอัปโหลดได้" ไม่ใช่ตอบ error */
const envNoR2 = { DB };   // จงใจไม่มี ICONS

let dbAssetUrl = '';
{
  const blob = new Blob([new Uint8Array([9, 8, 7, 6, 5])], { type: 'image/webp' });
  const form = new FormData();
  form.append('file', blob, 'banner.webp');
  const url = new URL('https://x/api/unified-trip/icon-upload');
  const req = new Request(url, { method: 'POST', headers: { 'x-user-id': '9North' }, body: form });
  const res = await handleUnifiedTrip(req, envNoR2, url, cors, '9North');
  const data = await res.json();
  dbAssetUrl = data.url || '';
  check('🔑 ไม่มี R2 ก็อัปโหลดได้ (ไม่ใช่ 500)', res.status === 201, JSON.stringify(data));
  check('คืน URL ที่ชี้ไปที่เก็บใน D1', dbAssetUrl.includes('/api/unified-trip/icon/db/'), dbAssetUrl);
  check('บันทึกไบต์ลงตาราง TripAssets จริง',
    db.prepare(`SELECT COUNT(*) n FROM TripAssets WHERE family_id='FAM-1'`).get().n === 1);
}

{
  const key = dbAssetUrl.split('/api/unified-trip/icon/')[1] || '';
  const url = new URL(`https://x/api/unified-trip/icon/${key}`);
  const res = await handleUnifiedTrip(new Request(url), envNoR2, url, cors, '');
  check('🔑 ดึงรูปกลับมาได้โดยไม่ต้องล็อกอิน', res.status === 200);
  check('content-type ตรงกับตอนอัปโหลด', res.headers.get('content-type') === 'image/webp');
  const got = new Uint8Array(await res.arrayBuffer());
  check('ไบต์ที่ได้ตรงกับที่อัปโหลดไปเป๊ะ', got.length === 5 && got[0] === 9 && got[4] === 5, JSON.stringify([...got]));
}

{
  // ไฟล์ใหญ่เกินเพดาน D1 — ต้องปฏิเสธพร้อมบอกวิธีแก้ ไม่ใช่ยัดลงฐานจนช้าทั้งระบบ
  const big = new Blob([new Uint8Array(800 * 1024)], { type: 'image/webp' });
  const form = new FormData();
  form.append('file', big, 'big.webp');
  const url = new URL('https://x/api/unified-trip/icon-upload');
  const req = new Request(url, { method: 'POST', headers: { 'x-user-id': '9North' }, body: form });
  const res = await handleUnifiedTrip(req, envNoR2, url, cors, '9North');
  check('⚠️ ไฟล์เกิน 700 KB → 400', res.status === 400);
}

{
  const url = new URL('https://x/api/unified-trip/icon/db/ไม่มีจริง');
  const res = await handleUnifiedTrip(new Request(url), envNoR2, url, cors, '');
  check('ขอรูปที่ไม่มี → 404', res.status === 404);
}

// แบนเนอร์: URL สั้นจากการอัปโหลดต้องบันทึกได้ · data: ยังต้องถูกปฏิเสธเหมือนเดิม
{
  const key = dbAssetUrl.split('https://x')[1] || '';
  r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026', theme_banner: key } });
  check('🔑 บันทึกแบนเนอร์ที่อัปโหลดเองได้ (รีเฟรชแล้วไม่หาย)', r.status === 200 && r.data.theme_banner === key, JSON.stringify(r));
  r = await call('GET', '/api/unified-trip');
  check('อ่านแบนเนอร์กลับมาได้', r.data.trip.theme_banner === key);
}

r = await call('POST', '/api/unified-trip/trip', { body: { name: 'Hokkaido 2026', theme_banner: 'data:image/webp;base64,AAAA' } });
check('⚠️ data: URL ยังถูกปฏิเสธ (กัน Projects บวม)', r.status === 400);

console.log('\n── คัดลอกรายการค่าใช้จ่ายจากทริปอื่น (2026-08-11) ──────');
/* ทริปใหม่เริ่มจากศูนย์ = จดบิลไม่ได้เลย · ฟีเจอร์นี้ปิดช่องนั้น
   แต่ต้องไม่ทำลายหลักการ "แต่ละทริปมีชุดของตัวเอง" — คัดลอกแล้วต้องเป็นคนละแถว */

// TRP-2 อยู่ครอบครัวเดียวกัน ยังไม่มี preset เลย · TRP-1 มี 'ขนม' กับ 'ไม่มีชื่อ' เหลืออยู่
r = await call('POST', '/api/unified-trip/presets/copy', { project: 'TRP-2', body: { from_project_id: 'TRP-1' } });
check('คัดลอกจากทริปอื่นในครอบครัวเดียวกันได้', r.status === 200 && r.data.copied > 0, JSON.stringify(r));
const copiedCount = r.data.copied;

r = await call('GET', '/api/unified-trip', { project: 'TRP-2' });
check('รายการโผล่ในทริปปลายทางครบตามจำนวน', (r.data.presets || []).length === copiedCount, JSON.stringify(r.data.presets?.length));
check('🔑 เป็นคนละแถวกับต้นทาง (ไม่ใช่ใช้ร่วมกัน)',
  (r.data.presets || []).every(p => p.project_id === 'TRP-2'));

// กดซ้ำต้องไม่เกิดของซ้ำซ้อน
r = await call('POST', '/api/unified-trip/presets/copy', { project: 'TRP-2', body: { from_project_id: 'TRP-1' } });
check('🔑 กดซ้ำ → ข้ามทั้งหมด ไม่เกิดรายการซ้ำ', r.data.copied === 0 && r.data.skipped === copiedCount, JSON.stringify(r));

r = await call('GET', '/api/unified-trip', { project: 'TRP-2' });
check('จำนวนรายการไม่เพิ่มหลังกดซ้ำ', (r.data.presets || []).length === copiedCount);

// แก้ที่ปลายทางต้องไม่กระทบต้นทาง
{
  const target = (r.data.presets || [])[0];
  await call('POST', '/api/unified-trip/presets', {
    project: 'TRP-2', body: { preset_id: target.preset_id, label: 'ชื่อใหม่เฉพาะทริปนี้', category_id: 'CAT-FOOD' }
  });
  const src = await call('GET', '/api/unified-trip', { project: 'TRP-1' });
  check('🔑 แก้ชื่อที่ปลายทาง ต้นทางไม่เปลี่ยนตาม',
    !(src.data.presets || []).some(p => p.label === 'ชื่อใหม่เฉพาะทริปนี้'));
}

r = await call('POST', '/api/unified-trip/presets/copy', { project: 'TRP-2', body: { from_project_id: 'TRP-2' } });
check('⚠️ คัดลอกจากทริปตัวเอง → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/presets/copy', { project: 'TRP-2', body: {} });
check('⚠️ ไม่ระบุทริปต้นทาง → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/presets/copy', { project: 'TRP-2', body: { from_project_id: 'TRP-ไม่มีจริง' } });
check('⚠️ ทริปต้นทางไม่มีอยู่ → 404', r.status === 404);

// ข้ามครอบครัวต้องไม่ได้เด็ดขาด
db.exec(`INSERT INTO Projects (project_id,family_id,name,status) VALUES ('TRP-FAM2','FAM-2','ทริปครอบครัวอื่น','active')`);
db.exec(`INSERT INTO TripExpensePresets (preset_id,project_id,label,category_id) VALUES ('TXP-F2','TRP-FAM2','ของครอบครัวอื่น',NULL)`);
r = await call('POST', '/api/unified-trip/presets/copy', { project: 'TRP-2', body: { from_project_id: 'TRP-FAM2' } });
check('⚠️ คัดลอกข้ามครอบครัวไม่ได้ → 404', r.status === 404, JSON.stringify(r));

console.log('\n── เอกสารประจำทริป (2026-08-11) ──────');
/* ใบจอง/ตั๋ว ผูกกับจุดแวะ · เก็บได้ทั้งไฟล์ที่อัปโหลดและลิงก์ภายนอก
   จุดที่ต้องกันให้แน่นคือ URL — ลิงก์นี้ถูกเอาไปใส่ href ให้สมาชิกคนอื่นกด */

db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_th) VALUES ('TS-DOC','TRP-1','2026-12-18','โรงแรม Kushiro')`);

/* 🔑 เอกสารเก่าที่แอปหลักสร้างไว้ (ไม่มี kind/content_type) ต้องอ่านได้ตามปกติ
   เพราะทั้งสองแอปใช้ตาราง TripDocuments ร่วมกัน ถ้าหน้าทริปอ่านของเก่าไม่ได้
   ผู้ใช้จะเห็นเอกสารหายไปเฉย ๆ ทั้งที่ยังอยู่ในฐาน */
db.exec(`INSERT INTO TripDocuments (document_id,project_id,related_entity_id,file_url,description,type)
         VALUES ('DOC-LEGACY','TRP-1','TS-DOC','https://old.example.com/voucher.pdf','ใบจองจากแอปหลัก','booking')`);
r = await call('GET', '/api/unified-trip');
{
  const legacy = (r.data.documents || []).find(d => d.doc_id === 'DOC-LEGACY');
  check('🔑 อ่านเอกสารเดิมจากแอปหลักได้ (kind ว่าง → ถือเป็น link)',
    legacy?.kind === 'link' && legacy?.name === 'ใบจองจากแอปหลัก', JSON.stringify(legacy));
  check('เอกสารเดิมได้ชื่อสถานที่ด้วย', legacy?.stop_name === 'โรงแรม Kushiro');
}

r = await call('POST', '/api/unified-trip/documents', {
  body: { stop_id: 'TS-DOC', name: 'ใบจอง Hotel Kushiro', url: 'https://drive.google.com/file/abc', kind: 'link' }
});
check('เพิ่มเอกสารผูกกับสถานที่ได้', r.status === 201, JSON.stringify(r));
const docId = r.data.doc_id;

r = await call('GET', '/api/unified-trip');
let doc = (r.data.documents || []).find(d => d.doc_id === docId);
check('เอกสารมากับ payload หลัก', Boolean(doc), JSON.stringify(r.data.documents));
check('🔑 แนบชื่อสถานที่มาให้ด้วย (ไม่ต้องจับคู่เอง)', doc?.stop_name === 'โรงแรม Kushiro', JSON.stringify(doc?.stop_name));

r = await call('POST', '/api/unified-trip/documents', {
  body: { name: 'ประกันเดินทางทั้งทริป', url: 'https://example.com/insurance.pdf' }
});
check('เอกสารระดับทริป (ไม่ผูกสถานที่) ได้', r.status === 201);

r = await call('GET', '/api/unified-trip');
const tripDoc = (r.data.documents || []).find(d => d.name === 'ประกันเดินทางทั้งทริป');
check('เอกสารระดับทริปมี stop_id ว่าง', tripDoc?.stop_id === null, JSON.stringify(tripDoc?.stop_id));

// ── ความปลอดภัยของ URL ──
for (const [label, bad] of [
  ['javascript:', 'javascript:alert(1)'],
  ['data:', 'data:text/html,<script>alert(1)</script>'],
  ['ไม่มี scheme', 'drive.google.com/file/abc']
]) {
  r = await call('POST', '/api/unified-trip/documents', { body: { name: 'x', url: bad } });
  check(`⚠️ ปฏิเสธลิงก์ ${label} → 400`, r.status === 400, JSON.stringify(r.status));
}

r = await call('POST', '/api/unified-trip/documents', { body: { name: '', url: 'https://x.com/a' } });
check('⚠️ ไม่มีชื่อ → 400', r.status === 400);
r = await call('POST', '/api/unified-trip/documents', { body: { name: 'x' } });
check('⚠️ ไม่มีไฟล์หรือลิงก์ → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/documents', {
  body: { stop_id: 'TS-ไม่มีจริง', name: 'x', url: 'https://x.com/a' }
});
check('⚠️ ผูกกับสถานที่ที่ไม่มีในทริป → 400', r.status === 400);

// จุดแวะของทริปอื่นก็ผูกไม่ได้ แม้จะมีอยู่จริง
db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_th) VALUES ('TS-OTHER','TRP-2','2026-12-18','ของทริปอื่น')`);
r = await call('POST', '/api/unified-trip/documents', {
  body: { stop_id: 'TS-OTHER', name: 'x', url: 'https://x.com/a' }
});
check('⚠️ ผูกกับสถานที่ของทริปอื่น → 400', r.status === 400);

// แก้ไข
r = await call('POST', '/api/unified-trip/documents', {
  body: { doc_id: docId, stop_id: 'TS-DOC', name: 'ใบจอง Hotel Kushiro (แก้ไข)', url: 'https://drive.google.com/file/xyz' }
});
check('แก้เอกสารได้', r.status === 200 && r.data.created === false, JSON.stringify(r));
r = await call('GET', '/api/unified-trip');
doc = (r.data.documents || []).find(d => d.doc_id === docId);
check('ชื่อและลิงก์ถูกอัปเดต', doc?.name.includes('แก้ไข') && doc?.url.endsWith('xyz'));

r = await call('POST', '/api/unified-trip/documents', { body: { doc_id: 'DOC-ไม่มีจริง', name: 'x', url: 'https://x.com/a' } });
check('แก้เอกสารที่ไม่มี → 404', r.status === 404);

// เอกสารของทริปอื่นต้องมองไม่เห็น
r = await call('GET', '/api/unified-trip', { project: 'TRP-2' });
check('⚠️ เอกสารไม่ข้ามทริป', !(r.data.documents || []).some(d => d.doc_id === docId), JSON.stringify(r.data.documents?.length));

// ลบ
r = await call('DELETE', '/api/unified-trip/documents', { query: `&id=${encodeURIComponent(docId)}` });
check('ลบเอกสารได้', r.status === 200);
r = await call('GET', '/api/unified-trip');
check('ลบแล้วหายจริง', !(r.data.documents || []).some(d => d.doc_id === docId));
r = await call('DELETE', '/api/unified-trip/documents', { query: '&id=DOC-ไม่มีจริง' });
check('ลบเอกสารที่ไม่มี → 404', r.status === 404);

// จุดแวะที่มีเอกสารผูกอยู่ ลบได้ตามปกติ (เอกสารกลายเป็นระดับทริป ไม่พัง)
r = await call('POST', '/api/unified-trip/documents', {
  body: { stop_id: 'TS-DOC', name: 'ใบจองที่จะค้าง', url: 'https://x.com/a' }
});
check('เพิ่มเอกสารใหม่ก่อนทดสอบลบจุดแวะ', r.status === 201);
r = await call('DELETE', '/api/unified-trip/stops', { query: '&id=TS-DOC' });
check('ลบจุดแวะที่มีเอกสารผูกอยู่ได้ ไม่ error', r.status === 200, JSON.stringify(r));
r = await call('GET', '/api/unified-trip');
check('🔑 เอกสารยังอยู่ ไม่หายไปพร้อมจุดแวะ',
  (r.data.documents || []).some(d => d.name === 'ใบจองที่จะค้าง'), JSON.stringify(r.data.documents?.length));

// อัปโหลดไฟล์ PDF ผ่านทางเดียวกับรูป
{
  const pdf = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', pdf, 'booking.pdf');
  const url = new URL('https://x/api/unified-trip/icon-upload');
  const req = new Request(url, { method: 'POST', headers: { 'x-user-id': '9North' }, body: form });
  const res = await handleUnifiedTrip(req, { DB, ICONS }, url, cors, '9North');
  const data = await res.json();
  check('🔑 อัปโหลด PDF ได้ (ไม่ใช่แค่รูป)', res.status === 201 && String(data.url).endsWith('.pdf'), JSON.stringify(data));
}

console.log('\n── ผู้ร่วมทริปเข้าด้วยรหัสของตัวเอง (2026-08-11) ──────');
/* ชุดนี้เป็นเรื่องความปลอดภัย ไม่ใช่ฟีเจอร์ — ทุกเคสที่ขึ้นต้นด้วย ⚠️ คือ
   "สิ่งที่ต้องทำไม่ได้" ถ้าเคสไหนกลับมาผ่านเป็นสีเขียวผิดด้าน แปลว่ามีช่องโหว่ */

/* เรียกแบบผู้ร่วมทริป: ไม่มี x-user-id เลย มีแต่ Bearer token
   จำลองให้เหมือนของจริงที่สุด — index.js จะ resolve userId ไม่ได้จึงส่ง '' เข้ามา */
async function guestCall(method, path, token, { project = 'TRP-1', body, query = '' } = {}) {
  const url = new URL(`https://x${path}?projectId=${project}${query}`);
  const req = new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const res = await handleUnifiedTrip(req, env, url, cors, '');
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ── ผู้ดูแลตั้งรหัสให้ Puii (TM-2) ──
r = await call('POST', '/api/unified-trip/members/passcode', { body: { member_id: 'TM-2', passcode: 'puii-2026' } });
check('ผู้ดูแลตั้งรหัสให้สมาชิกได้', r.status === 200 && r.data.enabled === true, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/members/passcode', { body: { member_id: 'TM-2', passcode: '12345' } });
check('⚠️ รหัสสั้นกว่า 6 ตัว → 400', r.status === 400);

r = await call('POST', '/api/unified-trip/members/passcode', { user: 'uPuii', body: { member_id: 'TM-3', passcode: 'sneaky-123' } });
check('⚠️ สมาชิกธรรมดาตั้งรหัสให้คนอื่นไม่ได้ → 403', r.status === 403);

r = await call('POST', '/api/unified-trip/members/passcode', { body: { member_id: 'TM-ไม่มีจริง', passcode: 'abcdef' } });
check('⚠️ ตั้งรหัสให้สมาชิกที่ไม่มี → 404', r.status === 404);

// ── หน้าล็อกอิน: รายชื่อสมาชิกที่เข้าได้ ──
{
  const url = new URL('https://x/api/unified-trip/members/login?projectId=TRP-1');
  const res = await handleUnifiedTrip(new Request(url), env, url, cors, '');
  const data = await res.json();
  check('ดูรายชื่อสมาชิกที่เข้าได้โดยไม่ต้องล็อกอิน', res.status === 200);
  check('เห็นเฉพาะคนที่ตั้งรหัสแล้ว', data.members.length === 1 && data.members[0].member_id === 'TM-2', JSON.stringify(data.members));
  check('🔑 ไม่หลุด passcode_hash ออกไปกับรายชื่อ',
    !JSON.stringify(data).includes('passcode'), JSON.stringify(data));
}

// ── เข้าสู่ระบบ ──
r = await (async () => {
  const url = new URL('https://x/api/unified-trip/members/login?projectId=TRP-1');
  const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: 'TM-2', passcode: 'wrong-password' }) });
  const res = await handleUnifiedTrip(req, env, url, cors, '');
  return { status: res.status, data: await res.json() };
})();
check('⚠️ รหัสผิด → 401', r.status === 401);

let guestToken = '';
r = await (async () => {
  const url = new URL('https://x/api/unified-trip/members/login?projectId=TRP-1');
  const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: 'TM-2', passcode: 'puii-2026' }) });
  const res = await handleUnifiedTrip(req, env, url, cors, '');
  return { status: res.status, data: await res.json() };
})();
guestToken = r.data.token || '';
check('เข้าสู่ระบบด้วยรหัสถูกต้องได้ token', r.status === 200 && guestToken.length > 20, JSON.stringify(r.status));

// ── สิ่งที่ผู้ร่วมทริป "ทำได้" ──
r = await guestCall('GET', '/api/unified-trip', guestToken);
check('ผู้ร่วมทริปเปิดดูทริปได้', r.status === 200, JSON.stringify(r.status));
check('payload บอกว่าเป็นผู้ร่วมทริป (is_guest)', r.data.meta?.is_guest === true);
check('🔑 ไม่ได้สิทธิ์ผู้ดูแล แม้ตัวสมาชิกจะเป็น admin ก็ตาม', r.data.meta?.can_manage_trip === false, JSON.stringify(r.data.meta));

db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_th) VALUES ('TS-GUEST-CHECK','TRP-1','2026-12-21','จุดนัดพบ')`);
r = await guestCall('POST', '/api/unified-trip/presence', guestToken, { body: { stop_id:'TS-GUEST-CHECK' } });
check('ผู้ร่วมทริปเช็กอินตัวเองได้', r.status === 200 && r.data.member_id === 'TM-2', JSON.stringify(r));
check('เซิร์ฟเวอร์ยึดตัวตนจาก token จึงเช็กอินแทนคนอื่นไม่ได้',
  db.prepare(`SELECT member_id FROM TripPresence WHERE stop_id='TS-GUEST-CHECK'`).get()?.member_id === 'TM-2');
db.exec(`DELETE FROM TripPresence WHERE stop_id='TS-GUEST-CHECK'; DELETE FROM TripStops WHERE stop_id='TS-GUEST-CHECK'`);

r = await guestCall('POST', '/api/unified-trip/expenses', guestToken, {
  body: {
    expense_date: '2026-12-18', amount_foreign: 300, currency_code: 'THB',
    member_id: 'TM-2', owner_member_id: 'TM-2', note: 'กาแฟของ Puii',
    categories: [{ label: 'กาแฟ', amount_foreign: 300 }],
    participants: [{ member_id: 'TM-2' }]
  }
});
check('🔑 จดค่าใช้จ่ายของตัวเองได้', r.status === 200, JSON.stringify(r));
const guestBillId = r.data.trip_expense_id;

// ── สิ่งที่ผู้ร่วมทริป "ต้องทำไม่ได้" ──
r = await guestCall('POST', '/api/unified-trip/expenses', guestToken, {
  body: {
    expense_date: '2026-12-18', amount_foreign: 500, currency_code: 'THB',
    member_id: 'TM-1', owner_member_id: 'TM-1', note: 'ยัดบิลให้คนอื่น',
    categories: [{ label: 'x', amount_foreign: 500 }], participants: [{ member_id: 'TM-1' }]
  }
});
check('⚠️ จดบิลให้คนอื่นเป็นเจ้าของไม่ได้ → 403', r.status === 403, JSON.stringify(r));

r = await guestCall('DELETE', '/api/unified-trip/expenses', guestToken, { query: `&id=${billId}` });
check('⚠️ ลบบิลของคนอื่นไม่ได้ → 403', r.status === 403);

r = await guestCall('DELETE', '/api/unified-trip/expenses', guestToken, { query: `&id=${guestBillId}` });
check('ลบบิลของตัวเองได้', r.status === 200, JSON.stringify(r));

for (const [label, method, path, body] of [
  ['แก้ข้อมูลทริป', 'POST', '/api/unified-trip/trip', { name: 'ยึดทริป' }],
  ['ลบทริป', 'DELETE', '/api/unified-trip/trip', undefined],
  ['ปิดทริป', 'POST', '/api/unified-trip/closures', { posting_date: '2026-12-28', lines: [] }],
  ['เปิดทริปกลับ', 'POST', '/api/unified-trip/closures/reopen', { reason: 'x' }],
  ['เพิ่มกระเป๋าเงิน', 'POST', '/api/unified-trip/wallets', { name: 'กระเป๋าลับ', currency: 'THB' }],
  ['เติมเงิน', 'POST', '/api/unified-trip/fundings', { wallet_id: 'W-X', thb_amount: 1, foreign_amount: 1, funding_date: '2026-12-18' }],
  ['เพิ่มสกุลเงิน', 'POST', '/api/unified-trip/currencies', { code: 'USD', plan_rate: 35 }],
  ['แก้จุดแวะ', 'POST', '/api/unified-trip/stops', { stop_date: '2026-12-18', name_th: 'แอบเพิ่ม' }],
  ['เพิ่มรายการค่าใช้จ่าย', 'POST', '/api/unified-trip/presets', { label: 'แอบเพิ่ม' }],
  ['เพิ่มเอกสาร', 'POST', '/api/unified-trip/documents', { name: 'x', url: 'https://x.com/a' }],
  ['ตั้งรหัสให้ตัวเองหรือคนอื่น', 'POST', '/api/unified-trip/members/passcode', { member_id: 'TM-1', passcode: 'hijack-123' }]
]) {
  r = await guestCall(method, path, guestToken, { body });
  check(`⚠️ ผู้ร่วมทริป${label}ไม่ได้ → 403`, r.status === 403, `${label}: ${JSON.stringify(r)}`);
}

// ── token ต้องผูกกับทริปเดียว ──
r = await guestCall('GET', '/api/unified-trip', guestToken, { project: 'TRP-2' });
check('⚠️ 🔑 ใช้ token ข้ามไปทริปอื่นไม่ได้ → 403', r.status === 403, JSON.stringify(r));

// ── เปลี่ยน/ล้างรหัส ต้องเตะ session เดิมออกทันที ──
r = await call('POST', '/api/unified-trip/members/passcode', { body: { member_id: 'TM-2', passcode: '' } });
check('ผู้ดูแลล้างรหัส (ถอนสิทธิ์) ได้', r.status === 200 && r.data.enabled === false);

r = await guestCall('GET', '/api/unified-trip', guestToken);
check('⚠️ 🔑 ถอนสิทธิ์แล้ว token เดิมใช้ไม่ได้ทันที → 401', r.status === 401, JSON.stringify(r.status));

// token ปลอมและ token หมดอายุ
// ⚠️ token ต้องเป็น ASCII — HTTP header ใส่ภาษาไทยไม่ได้ (ByteString เท่านั้น)
r = await guestCall('GET', '/api/unified-trip', 'not-a-real-token-0000000000');
check('⚠️ token ปลอม → 401', r.status === 401);

{
  await call('POST', '/api/unified-trip/members/passcode', { body: { member_id: 'TM-2', passcode: 'puii-2026' } });
  const url = new URL('https://x/api/unified-trip/members/login?projectId=TRP-1');
  const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: 'TM-2', passcode: 'puii-2026' }) });
  const tok = (await (await handleUnifiedTrip(req, env, url, cors, '')).json()).token;
  db.exec(`UPDATE TripMemberSessions SET expires_at='2020-01-01T00:00:00.000Z'`);
  r = await guestCall('GET', '/api/unified-trip', tok);
  check('⚠️ token หมดอายุ → 401', r.status === 401);
  check('token ที่หมดอายุถูกลบทิ้งจากฐาน',
    db.prepare(`SELECT COUNT(*) n FROM TripMemberSessions`).get().n === 0);
}

console.log('\n── พยากรณ์อากาศ (2026-08-11) ──────');
/* ไม่ยิงไปบริการภายนอกจริงในเทส — สลับ fetch เป็นตัวปลอมเพื่อให้เทสเสถียร
   และรันได้แม้ไม่มีเน็ต · ที่ทดสอบคือ "ตรรกะของเรา" ไม่ใช่ของ Open-Meteo:
   เลือกใช้ forecast หรือค่าเฉลี่ยย้อนหลัง · เก็บพิกัดกลับลงฐาน · ไม่พังเมื่อบริการล่ม */
const realFetch = globalThis.fetch;
let fetchLog = [];
function stubFetch(handler) {
  globalThis.fetch = async (input) => {
    const href = String(input);
    fetchLog.push(href);
    const body = handler(href);
    if (body === null) return new Response('err', { status: 500 });
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
}

db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_en,sort_order)
         VALUES ('TS-W1','TRP-1','2026-12-18','Kushiro',1)`);

// วันที่ไกลเกิน 16 วัน → ต้องใช้ archive ไม่ใช่ forecast
fetchLog = [];
stubFetch(href => {
  if (href.includes('geocoding-api')) return { results: [{ latitude: 43.0, longitude: 144.4 }] };
  if (href.includes('archive-api')) return { daily: { time: ['2025-12-15'], weather_code: [71, 71, 3],
    temperature_2m_max: [-2, -1, 0], temperature_2m_min: [-9, -8, -7], precipitation_probability_max: [null, null, null] } };
  return null;
});
r = await call('GET', '/api/unified-trip/weather', { query: '&date=2026-12-18' });
check('ดึงอากาศของวันในทริปได้', r.status === 200 && r.data.available === true, JSON.stringify(r.data));
check('🔑 วันไกลเกินพยากรณ์ → ใช้ค่าเฉลี่ยย้อนหลัง ไม่ใช่พยากรณ์', r.data.kind === 'historical', r.data.kind);
check('บอกปีอ้างอิงให้ผู้ใช้รู้ว่าเทียบกับปีไหน', r.data.reference_year === 2025, String(r.data.reference_year));
check('เลือกสภาพอากาศที่พบบ่อยที่สุด (หิมะ)', r.data.icon === '❄️', r.data.icon);
check('เฉลี่ยอุณหภูมิถูกต้อง', r.data.temp_max === -1 && r.data.temp_min === -8, `${r.data.temp_max}/${r.data.temp_min}`);
check('⚠️ ไม่ยิงไป forecast API เมื่อวันไกลเกิน', !fetchLog.some(u => u.includes('/v1/forecast')));
check('🔑 เก็บพิกัดกลับลงฐาน ไม่ต้องค้นซ้ำ',
  db.prepare(`SELECT latitude FROM TripStops WHERE stop_id='TS-W1'`).get().latitude === 43.0);

db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_en,latitude,longitude,sort_order)
         VALUES ('TS-W-SELECTED','TRP-1','2026-12-18','Lake Akan',43.46,144.10,2)`);
r = await call('GET', '/api/unified-trip/weather', { query: '&date=2026-12-18&stopId=TS-W-SELECTED' });
check('เลือกดูอากาศตาม Stop ที่เลือกได้ ไม่บังคับใช้จุดแรก',
  r.status === 200 && r.data.place === 'Lake Akan', JSON.stringify(r.data));

// ครั้งที่สองต้องไม่ geocode ซ้ำ
fetchLog = [];
r = await call('GET', '/api/unified-trip/weather', { query: '&date=2026-12-18' });
check('🔑 เรียกซ้ำไม่ค้นพิกัดใหม่ (ประหยัดโควตา)', !fetchLog.some(u => u.includes('geocoding-api')), JSON.stringify(fetchLog));

// วันใกล้ ๆ → ต้องใช้ forecast
{
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_en,latitude,longitude,sort_order)
           VALUES ('TS-W2','TRP-1','${soon}','Sapporo',43.06,141.35,1)`);
  fetchLog = [];
  stubFetch(href => {
    if (href.includes('/v1/forecast')) return { daily: { time: [soon], weather_code: [0],
      temperature_2m_max: [5], temperature_2m_min: [-1], precipitation_probability_max: [10] } };
    return null;
  });
  r = await call('GET', '/api/unified-trip/weather', { query: `&date=${soon}` });
  check('🔑 วันใกล้ ๆ → ใช้พยากรณ์จริง', r.data.kind === 'forecast', JSON.stringify(r.data));
  check('ได้โอกาสฝน/หิมะมาด้วย', r.data.rain_chance === 10);
  check('ฟ้าโปร่งแปลรหัส 0 ถูก', r.data.icon === '☀️' && r.data.text === 'ฟ้าโปร่ง');
}

// บริการล่ม → ต้องไม่ทำให้ทั้งหน้าพัง
stubFetch(() => null);
r = await call('GET', '/api/unified-trip/weather', { query: '&date=2026-12-18' });
check('⚠️ บริการภายนอกล่ม → ตอบ available:false ไม่ใช่ 500', r.status === 200 && r.data.available === false, JSON.stringify(r.data));

// วันที่ไม่มีจุดแวะ / รูปแบบวันที่ผิด
r = await call('GET', '/api/unified-trip/weather', { query: '&date=2030-01-01' });
check('วันที่ไม่มีจุดแวะ → available:false', r.data.available === false && r.data.reason === 'no_stop');
r = await call('GET', '/api/unified-trip/weather', { query: '&date=18-12-2026' });
check('⚠️ รูปแบบวันที่ผิด → 400', r.status === 400);

console.log('\n── mapcode + เวลาเปิด-ปิด + พระอาทิตย์ (2026-08-22) ──────');
{
  db.exec(`DELETE FROM TripStops WHERE project_id='TRP-1'`);

  r = await call('POST', '/api/unified-trip/stops', {
    body: stop({ stop_date:'2026-12-18', name_th:'พิพิธภัณฑ์',
                 mapcode:'149 287 165*36', open_time:'09:30', close_time:'17:00', closed_days:'3' })
  });
  check('บันทึก mapcode และเวลาเปิด-ปิดได้', r.status === 200, JSON.stringify(r.data));
  const hourStop = r.data.stop_id;
  check('🔑 mapcode เก็บเป็นข้อความ ไม่ถูกตัดจุดหรือดาวทิ้ง',
    db.prepare(`SELECT mapcode FROM TripStops WHERE stop_id=?`).get(hourStop).mapcode === '149 287 165*36');
  check('เวลาเปิด-ปิดเก็บแยกคอลัมน์ เทียบกับเวลาในแผนได้',
    (row => row.open_time === '09:30' && row.close_time === '17:00')(
      db.prepare(`SELECT open_time,close_time FROM TripStops WHERE stop_id=?`).get(hourStop)));

  r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:hourStop, name_th:'พิพิธภัณฑ์', open_time:'9:30' }) });
  check('⚠️ เวลาเปิดผิดรูปแบบ → 400', r.status === 400, JSON.stringify(r.data));

  /* 🔑 เลขวันนอกช่วง 0–6 ต้องถูกกรองทิ้งตั้งแต่ตอนบันทึก ไม่ใช่ปล่อยลงฐาน
     เลขมั่ว ๆ จะไม่มีวันตรงกับ getDay() ของวันไหนเลย = เตือนไม่ขึ้นและไม่มีใครรู้ว่าทำไม */
  r = await call('POST', '/api/unified-trip/stops', {
    body: stop({ stop_id:hourStop, name_th:'พิพิธภัณฑ์', closed_days:'3, 9 ,abc, 5' })
  });
  check('🔑 กรองเลขวันหยุดที่ใช้ไม่ได้ทิ้ง เหลือเฉพาะ 0–6',
    db.prepare(`SELECT closed_days FROM TripStops WHERE stop_id=?`).get(hourStop).closed_days === '3,5',
    db.prepare(`SELECT closed_days FROM TripStops WHERE stop_id=?`).get(hourStop).closed_days);

  r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:hourStop, name_th:'พิพิธภัณฑ์', closed_days:'' }) });
  check('ส่งค่าว่าง = เปิดทุกวัน',
    !db.prepare(`SELECT closed_days FROM TripStops WHERE stop_id=?`).get(hourStop).closed_days,
    JSON.stringify(db.prepare(`SELECT closed_days FROM TripStops WHERE stop_id=?`).get(hourStop)) + ' | ' + JSON.stringify(r.data));

  // พระอาทิตย์ขึ้น-ตกต้องมากับพยากรณ์ในคำขอเดียว ไม่ยิงเพิ่ม
  db.exec(`UPDATE TripStops SET latitude=42.98, longitude=144.38 WHERE stop_id='${hourStop}'`);
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  db.exec(`UPDATE TripStops SET stop_date='${soon}' WHERE stop_id='${hourStop}'`);
  fetchLog = [];
  stubFetch(href => href.includes('/v1/forecast')
    ? { daily: { time:[soon], weather_code:[71], temperature_2m_max:[-3], temperature_2m_min:[-9],
                 precipitation_probability_max:[60],
                 sunrise:[`${soon}T06:52`], sunset:[`${soon}T16:03`] } }
    : null);
  r = await call('GET', '/api/unified-trip/weather', { query: `&date=${soon}` });
  check('🔑 ได้เวลาพระอาทิตย์ตกมาด้วย', r.data.sunset === '16:03', JSON.stringify(r.data));
  check('ได้เวลาพระอาทิตย์ขึ้นด้วย', r.data.sunrise === '06:52');
  check('⚠️ ไม่ยิงคำขอเพิ่มเพื่อเอาเวลาพระอาทิตย์ (ต้องมากับคำขอเดิม)',
    fetchLog.filter(u => u.includes('/v1/forecast')).length === 1,
    String(fetchLog.filter(u => u.includes('/v1/forecast')).length));

  db.exec(`DELETE FROM TripStops WHERE project_id='TRP-1'`);
}

console.log('\n── งบต่อจุด + ระยะขับจริง (2026-08-20) ──────');
{
  db.exec(`DELETE FROM TripStops WHERE project_id='TRP-1'`);
  db.exec(`DELETE FROM TripLegs`);

  // งบต่อจุด — บันทึก อ่านกลับ และแยก "ไม่ได้ตั้งงบ" (null) ออกจาก "ตั้งใจว่าฟรี" (0)
  r = await call('POST', '/api/unified-trip/stops', {
    body: stop({ stop_date:'2026-12-18', name_th:'ตลาดปลา', planned_cost: 2500, planned_currency:'jpy' })
  });
  check('บันทึกงบต่อจุดได้', r.status === 200, JSON.stringify(r.data));
  const budgetStop = r.data.stop_id;
  db.exec(`UPDATE TripStops SET stop_id='TS-B1' WHERE stop_id='${budgetStop}'`);
  check('เก็บสกุลเงินเป็นตัวใหญ่เสมอ',
    (row => row.planned_cost === 2500 && row.planned_currency === 'JPY')(
      db.prepare(`SELECT planned_cost,planned_currency FROM TripStops WHERE stop_id='TS-B1'`).get()));

  r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:'TS-B1', name_th:'ตลาดปลา', planned_cost: 0 }) });
  check('🔑 งบ 0 บันทึกเป็น 0 ไม่ใช่ null (ตั้งใจว่าไม่เสียเงิน)',
    db.prepare(`SELECT planned_cost FROM TripStops WHERE stop_id='TS-B1'`).get().planned_cost === 0);

  r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:'TS-B1', name_th:'ตลาดปลา', planned_cost: '' }) });
  check('ส่งค่าว่าง = ล้างงบทิ้ง',
    db.prepare(`SELECT planned_cost FROM TripStops WHERE stop_id='TS-B1'`).get().planned_cost === null);

  r = await call('POST', '/api/unified-trip/stops', { body: stop({ stop_id:'TS-B1', name_th:'ตลาดปลา', planned_cost: -50 }) });
  check('⚠️ งบติดลบ → 400', r.status === 400, JSON.stringify(r.data));

  // ผูกบิลกับจุดแวะ — เดิมไม่มีคอลัมน์นี้ ยอด "ใช้วันนี้" จึงเป็น ฿0 ตลอด
  r = await call('POST', '/api/unified-trip/expenses', {
    body: bill({ amount_foreign: 1200, note:'ข้าวหน้าปลาดิบ', stop_id:'TS-B1' })
  });
  check('🔑 จดบิลพร้อมผูกจุดแวะได้', r.status === 200, JSON.stringify(r.data));
  check('stop_id ถูกเก็บลงฐานจริง',
    db.prepare(`SELECT stop_id FROM TripExpenses WHERE note='ข้าวหน้าปลาดิบ'`).get()?.stop_id === 'TS-B1');

  r = await call('POST', '/api/unified-trip/expenses', {
    body: bill({ amount_foreign: 300, note:'ไม่ผูกจุด' })
  });
  check('ไม่ผูกจุดก็ยังจดบิลได้ (stop_id เป็น null)',
    r.status === 200 && db.prepare(`SELECT stop_id FROM TripExpenses WHERE note='ไม่ผูกจุด'`).get()?.stop_id === null);

  /* ── ระยะ/เวลาขับจริง ── */
  db.exec(`UPDATE TripStops SET latitude=42.98, longitude=144.38, sort_order=1 WHERE stop_id='TS-B1'`);
  db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_en,sort_order,latitude,longitude)
           VALUES ('TS-B2','TRP-1','2026-12-18','Lake Akan',2,43.45,144.10),
                  ('TS-B3','TRP-1','2026-12-19','Sounkyo',3,43.66,142.88)`);

  fetchLog = [];
  stubFetch(href => href.includes('router.project-osrm')
    ? { routes: [{ distance: 62000, duration: 4200 }] } : null);

  r = await call('GET', '/api/unified-trip/route', {});
  check('ได้ช่วงเดินทางระหว่างจุดในวันเดียวกัน', r.data.legs.length === 1, JSON.stringify(r.data));
  check('ใช้ระยะขับจริงจาก OSRM', r.data.legs[0].meters === 62000 && r.data.legs[0].source === 'osrm');
  check('🔑 ไม่ต่อช่วงข้ามวัน (ขับ 19 ธ.ค. ไม่ใช่การเดินทางต่อจากวันที่ 18)',
    !r.data.legs.some(leg => leg.to_stop_id === 'TS-B3'));

  fetchLog = [];
  r = await call('GET', '/api/unified-trip/route', {});
  check('🔑 เรียกซ้ำใช้ค่าจากแคช ไม่ยิง OSRM อีก',
    fetchLog.filter(u => u.includes('osrm')).length === 0, String(fetchLog.length));

  // OSRM ล่ม → ต้องถอยไปเส้นตรงและติดป้ายว่าเป็นค่าประมาณ ไม่ใช่พังทั้งหน้า
  db.exec(`DELETE FROM TripLegs`);
  stubFetch(() => null);
  r = await call('GET', '/api/unified-trip/route', {});
  check('⚠️ OSRM ล่ม → ยังตอบ 200 ไม่ใช่ 500', r.status === 200);
  check('🔑 ติดป้าย source=straight ให้หน้าจอเขียนกำกับว่าเป็นค่าประมาณ',
    r.data.legs[0]?.source === 'straight', JSON.stringify(r.data.legs[0]));
  check('ค่าประมาณยังสมเหตุสมผล (มากกว่าเส้นตรง เพราะถนนอ้อม)',
    r.data.legs[0].meters > 52000 && r.data.legs[0].meters < 90000, String(r.data.legs[0].meters));
  check('เวลาขับประมาณได้จากระยะ ไม่ใช่ศูนย์', r.data.legs[0].seconds > 0);

  db.exec(`DELETE FROM TripStops WHERE project_id='TRP-1'`);
  db.exec(`DELETE FROM TripExpenses WHERE note IN ('ข้าวหน้าปลาดิบ','ไม่ผูกจุด')`);
  db.exec(`DELETE FROM TripLegs`);
}

console.log('\n── เติมพิกัดจุดแวะสำหรับแผนที่ (2026-08-17) ──────');
/* หน้าแผนที่ต้องมีพิกัดของ "ทุก" จุดแวะ ไม่ใช่แค่จุดแรกของวันที่เคยเปิดดูอากาศ
   ที่ทดสอบคือตรรกะการแบ่งชุด (batch) และการข้ามจุดที่ค้นชื่อไม่เจอ */
db.exec(`DELETE FROM TripStops WHERE project_id='TRP-1'`);
const many = Array.from({ length: 15 }, (_, i) =>
  `('TS-G${i}','TRP-1','2026-12-18','Place ${i}',${i})`).join(',');
db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_en,sort_order) VALUES ${many}`);

fetchLog = [];
stubFetch(href => href.includes('geocoding-api')
  ? { results: [{ latitude: 43.1, longitude: 144.1 }] }
  : null);

r = await call('GET', '/api/unified-trip/geocode-stops', {});
check('เติมพิกัดได้ทีละชุด ไม่ยิงทั้งหมดรวดเดียว', r.status === 200 && r.data.filled === 12, JSON.stringify(r.data));
check('🔑 บอกจำนวนที่เหลือ ให้หน้าจอเรียกซ้ำได้', r.data.remaining === 3, String(r.data.remaining));
check('⚠️ ไม่ยิงเกินขนาดชุดที่กำหนด (เพดาน subrequest ของ Worker)',
  fetchLog.filter(u => u.includes('geocoding-api')).length === 12,
  String(fetchLog.filter(u => u.includes('geocoding-api')).length));

r = await call('GET', '/api/unified-trip/geocode-stops', {});
check('รอบสองเก็บที่เหลือครบ', r.data.filled === 3 && r.data.remaining === 0, JSON.stringify(r.data));
check('🔑 พิกัดถูกเขียนลงฐานทุกจุด',
  db.prepare(`SELECT COUNT(*) n FROM TripStops WHERE project_id='TRP-1' AND latitude IS NULL`).get().n === 0);

r = await call('GET', '/api/unified-trip/geocode-stops', {});
check('ไม่มีอะไรเหลือ → ไม่ยิงบริการภายนอกเลย', r.data.scanned === 0 && r.data.filled === 0, JSON.stringify(r.data));

/* จุดที่ค้นชื่อไม่เจอจะค้างอยู่หัวคิวตลอด (ยังไม่มีพิกัด) ถ้าไม่มี offset
   ให้ข้าม จุดที่ค้นได้ซึ่งอยู่ท้ายคิวจะไม่มีวันถูกเรียกถึง — ทริปที่มีสถานที่
   ชื่อแปลกเยอะจะได้แผนที่ว่างเปล่าไปตลอด ทั้งที่จุดอื่นค้นได้สบาย */
db.exec(`DELETE FROM TripStops WHERE project_id='TRP-1'`);
const mixed = Array.from({ length: 14 }, (_, i) =>
  `('TS-M${i}','TRP-1','2026-12-18','${i < 12 ? 'Nowhere' : 'Findable'} ${i}',${i})`).join(',');
db.exec(`INSERT INTO TripStops (stop_id,project_id,stop_date,name_en,sort_order) VALUES ${mixed}`);
stubFetch(href => href.includes('geocoding-api')
  ? (href.includes('Findable') ? { results: [{ latitude: 43.2, longitude: 144.2 }] } : { results: [] })
  : null);

r = await call('GET', '/api/unified-trip/geocode-stops', {});
check('จุดที่ค้นชื่อไม่เจอถูกนับแยกเป็น failed', r.data.failed === 12 && r.data.filled === 0, JSON.stringify(r.data));
r = await call('GET', '/api/unified-trip/geocode-stops', {});
check('⚠️ ไม่มี offset → วนค้นจุดที่ไม่เจอชุดเดิมซ้ำ จุดท้ายคิวไม่ถูกแตะ', r.data.filled === 0, JSON.stringify(r.data));
r = await call('GET', '/api/unified-trip/geocode-stops', { query: '&offset=12' });
check('🔑 ส่ง offset ข้ามจุดที่ค้นไม่เจอ → จุดท้ายคิวถูกเติมพิกัด', r.data.filled === 2, JSON.stringify(r.data));
check('พิกัดของจุดที่ค้นเจอถูกบันทึกจริง',
  db.prepare(`SELECT latitude FROM TripStops WHERE stop_id='TS-M13'`).get().latitude === 43.2);
check('จุดที่ค้นไม่เจอยังเป็น NULL ไม่ใช่ 0,0 (0,0 คือกลางอ่าวกินี)',
  db.prepare(`SELECT latitude FROM TripStops WHERE stop_id='TS-M0'`).get().latitude === null);

r = await call('GET', '/api/unified-trip/geocode-stops', { query: '&offset=-5' });
check('offset ติดลบไม่ทำให้พัง', r.status === 200, JSON.stringify(r.data));

globalThis.fetch = realFetch;

/* ⚠️ ต้องอยู่ท้ายสุด — เทสปิดทริปด้านบนนับ Transactions ทั้งตาราง
   ถ้าบล็อกนี้อยู่ก่อน จะสร้างรายการค้างไว้แล้วเทสพวกนั้นนับเกิน */
console.log('\n── ปิดทริป: บัตรเครดิตกรอกยอดจริงทีละบิล ────────');
/* 🔴 ธนาคารแปลงค่าเงิน "ทีละรายการ" ตามวันที่รูดจริง ไม่ใช่เรทเดียวทั้งบิล
      ถ้ากรอกยอดรวมแล้วเฉลี่ยเรท ยอดรวมจะถูก แต่ยอดรายหมวด/รายคนเพี้ยน */
db.prepare(`INSERT INTO Projects (project_id,family_id,name,status,start_date,end_date)
  VALUES ('TRP-CC','FAM-1','ทริปบัตรเครดิต','active','2026-12-01','2026-12-05')`).run();
db.prepare(`INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin)
  VALUES ('TM-CC1','TRP-CC','9North','North','ผู้ดูแล','MAIN',1)`).run();
db.prepare(`INSERT INTO TripCurrencies (project_id,code,symbol,label,plan_rate,is_base)
  VALUES ('TRP-CC','THB','฿','บาท',1,1),('TRP-CC','JPY','¥','เยน',0.23,0)`).run();
db.prepare(`INSERT INTO TripWallets (wallet_id,project_id,name,currency,owner_member_id,kind)
  VALUES ('W-CC','TRP-CC','บัตรเครดิต','JPY','TM-CC1','CREDIT')`).run();
// สองบิลคนละวัน — ธนาคารให้เรทคนละตัว จึงต้องกรอกแยก
db.prepare(`INSERT INTO TripExpenses (trip_expense_id,project_id,member_id,owner_member_id,wallet_id,
  amount_foreign,amount_thb,expense_date,currency_code,visibility,is_shared,split_mode)
  VALUES ('TE-CC1','TRP-CC','TM-CC1','TM-CC1','W-CC',10000,0,'2026-12-02','JPY','TRIP',0,'EQUAL'),
         ('TE-CC2','TRP-CC','TM-CC1','TM-CC1','W-CC',5000,0,'2026-12-04','JPY','TRIP',0,'EQUAL')`).run();
db.prepare(`INSERT INTO TripExpenseParticipants VALUES ('P-CC1','TE-CC1','TM-CC1',10000,NULL),
  ('P-CC2','TE-CC2','TM-CC1',5000,NULL)`).run();

const CC = { project: 'TRP-CC' };
r = await call('POST', '/api/unified-trip/closures', { ...CC, body: { posting_date: '2027-01-15' } });
check('🔑 ไม่กรอกยอดบัตรเครดิต → ปิดไม่ได้', r.status === 400 && /บัตรเครดิต/.test(r.data.error), JSON.stringify(r).slice(0, 140));
check('บอกครบว่าขาดบิลไหนบ้าง', r.data.needs_settlement?.length === 2, JSON.stringify(r.data.needs_settlement)?.slice(0, 160));
check('บอกประมาณการของแต่ละบิลไว้ให้เทียบ',
  Math.abs(r.data.needs_settlement.find(x => x.expense_id === 'TE-CC1').estimated_thb - 2300) < 0.02,
  JSON.stringify(r.data.needs_settlement?.[0]));

r = await call('POST', '/api/unified-trip/closures', {
  ...CC, body: { posting_date: '2027-01-15',
    settlements: [{ expense_id: 'TE-CC1', settled_thb: 2450 }] }
});
check('กรอกไม่ครบทุกบิล → ยังปิดไม่ได้', r.status === 400 && r.data.needs_settlement?.length === 1, JSON.stringify(r.data.needs_settlement));

r = await call('POST', '/api/unified-trip/closures', {
  ...CC, body: { posting_date: '2027-01-15',
    default_category_id: 'CAT-FOOD', account_id: 'ACC-1',
    // เรทต่างกันจริง: 2450/10000 = 0.245 · 1120/5000 = 0.224
    settlements: [{ expense_id: 'TE-CC1', settled_thb: 2450 }, { expense_id: 'TE-CC2', settled_thb: 1120 }] }
});
check('กรอกครบแล้วปิดได้', r.status === 200, JSON.stringify(r).slice(0, 200));
const ccTx = r.data.transaction_id;
check('🔑 ยอดลงบัญชี = ผลรวมยอดจริงรายบิล (2,450 + 1,120) ไม่ใช่เรทประมาณการ (3,450)',
  Math.abs(db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(ccTx).t - 3570) < 0.02,
  String(db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id=?`).get(ccTx).t));
check('เก็บยอดจริงไว้กับตัวบิล — เปิดกลับมาปิดใหม่ไม่ต้องกรอกซ้ำ',
  db.prepare(`SELECT settled_thb s FROM TripExpenses WHERE trip_expense_id='TE-CC1'`).get().s === 2450 &&
  db.prepare(`SELECT settled_thb s FROM TripExpenses WHERE trip_expense_id='TE-CC2'`).get().s === 1120);
check('⚠️ บัตรเครดิตไม่คิดเป็นกำไร/ขาดทุนค่าเงิน (ไม่เคยถือเงินสกุลนั้น)',
  db.prepare(`SELECT fx_result f FROM TripClosures WHERE project_id='TRP-CC'`).get().f === 0,
  String(db.prepare(`SELECT fx_result f FROM TripClosures WHERE project_id='TRP-CC'`).get().f));
check('ยอดรวมกระเป๋าถูกเก็บไว้ตรวจย้อนได้',
  db.prepare(`SELECT settled_thb s FROM TripClosureLines WHERE wallet_id='W-CC'`).get().s === 3570);

console.log('\n── กำไร/ขาดทุนค่าเงิน แยกรายกระเป๋า ─────────────');
/* 🔴 ห้ามรวมผลต่างข้ามกระเป๋า (North 2026-08-23)
      กระเป๋า A แลกคืนเข้าบัญชี 1 · กระเป๋า B แลกคืนเข้าบัญชี 2
      ถ้ารวมเป็นก้อนเดียวแล้วลงบัญชีเดียว ยอดคงเหลือของทั้งสองบัญชีจะไม่ตรง
      กับความจริง — และไม่มีอะไรฟ้อง เพราะยอดรวมทั้งครอบครัวยังถูก */
db.prepare(`INSERT INTO Accounts VALUES ('ACC-2','ENT-1','บัญชีที่สอง')`).run();
db.prepare(`INSERT INTO Projects (project_id,family_id,name,status,start_date,end_date)
  VALUES ('TRP-FX','FAM-1','ทริปมี FX','active','2026-11-01','2026-11-05')`).run();
db.prepare(`INSERT INTO TripMembers (member_id,project_id,user_id,display_name,role,ledger_mode,is_admin)
  VALUES ('TM-FX1','TRP-FX','9North','North','ผู้ดูแล','MAIN',1)`).run();
db.prepare(`INSERT INTO TripCurrencies (project_id,code,symbol,label,plan_rate,is_base)
  VALUES ('TRP-FX','THB','฿','บาท',1,1),('TRP-FX','JPY','¥','เยน',0.23,0)`).run();
// สองกระเป๋า ผูกคนละบัญชี — เงินคืนต้องกลับเข้าบัญชีของตัวเอง
db.prepare(`INSERT INTO TripWallets (wallet_id,project_id,name,currency,owner_member_id,kind,account_id)
  VALUES ('W-FXA','TRP-FX','เยนบัญชีหนึ่ง','JPY','TM-FX1','CASH','ACC-1'),
         ('W-FXB','TRP-FX','เยนบัญชีสอง','JPY','TM-FX1','CASH','ACC-2')`).run();
db.prepare(`INSERT INTO TripWalletFundings (funding_id,project_id,wallet_id,thb_amount,foreign_amount,rate,funding_date)
  VALUES ('F-FXA','TRP-FX','W-FXA',2400,10000,0.24,'2026-11-01'),
         ('F-FXB','TRP-FX','W-FXB',2400,10000,0.24,'2026-11-01')`).run();
db.prepare(`INSERT INTO TripExpenses (trip_expense_id,project_id,member_id,owner_member_id,wallet_id,
  amount_foreign,amount_thb,expense_date,currency_code,visibility,is_shared,split_mode)
  VALUES ('TE-FXA','TRP-FX','TM-FX1','TM-FX1','W-FXA',6000,0,'2026-11-02','JPY','TRIP',0,'EQUAL')`).run();
db.prepare(`INSERT INTO TripExpenseParticipants VALUES ('P-FXA','TE-FXA','TM-FX1',6000,NULL)`).run();

const FX = { project: 'TRP-FX' };
/* A: เหลือ ¥4,000 ต้นทุน ฿960 แลกได้ ฿1,000 → กำไร ฿40
   B: เหลือ ¥10,000 ต้นทุน ฿2,400 แลกได้ ฿2,300 → ขาดทุน ฿100 */
const fxBody = extra => ({
  posting_date: '2026-12-01', default_category_id: 'CAT-FOOD', account_id: 'ACC-1',
  lines: [
    { wallet_id: 'W-FXA', disposition: 'RETURN', received_thb: 1000, ...(extra.a || {}) },
    { wallet_id: 'W-FXB', disposition: 'RETURN', received_thb: 2300, ...(extra.b || {}) }
  ], ...(extra.top || {})
});

r = await call('POST', '/api/unified-trip/closures', { ...FX, body: fxBody({}) });
check('🔑 มี FX แต่ไม่ระบุหมวด → ปิดไม่ได้ พร้อมบอกชื่อกระเป๋า',
  r.status === 400 && /หมวด/.test(r.data.error) && /เยนบัญชี/.test(r.data.error), JSON.stringify(r));
check('ปฏิเสธแล้วต้องไม่โพสต์อะไรเลย',
  db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE transaction_id LIKE '%TRP-FX%'`).get().n === 0);

r = await call('POST', '/api/unified-trip/closures', {
  ...FX, body: fxBody({ a: { fx_account_id: 'ACC-X', fx_category_id: 'CAT-STAY' },
                        b: { fx_category_id: 'CAT-STAY' } })
});
check('⚠️ บัญชีของครอบครัวอื่น → 400', r.status === 400 && /ครอบครัว/.test(r.data.error), JSON.stringify(r));

r = await call('POST', '/api/unified-trip/closures', {
  ...FX, body: fxBody({ top: { fx_category_id: 'CAT-STAY' } })
});
check('ระบุหมวดรวมทีเดียวได้ · บัญชีถอยไปใช้บัญชีที่ผูกกับกระเป๋า', r.status === 200, JSON.stringify(r).slice(0, 200));
check('🔑 ได้ FX สองรายการ ไม่ใช่รวมเป็นก้อนเดียว',
  db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE transaction_id LIKE 'TXFX-TRP-FX%'`).get().n === 2,
  String(db.prepare(`SELECT COUNT(*) n FROM Transactions WHERE transaction_id LIKE 'TXFX-TRP-FX%'`).get().n));
check('🔑 กระเป๋า A กำไร ฿40 ลงบัญชี ACC-1',
  Math.abs(db.prepare(`SELECT total_amount t FROM Transactions
    WHERE transaction_id LIKE 'TXFX-TRP-FX%' AND account_id='ACC-1'`).get().t - 40) < 0.02,
  String(db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id LIKE 'TXFX-TRP-FX%' AND account_id='ACC-1'`).get().t));
check('🔑 กระเป๋า B ขาดทุน ฿100 ลงบัญชี ACC-2 (คนละใบ คนละบัญชี)',
  Math.abs(db.prepare(`SELECT total_amount t FROM Transactions
    WHERE transaction_id LIKE 'TXFX-TRP-FX%' AND account_id='ACC-2'`).get().t + 100) < 0.02,
  String(db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id LIKE 'TXFX-TRP-FX%' AND account_id='ACC-2'`).get().t));
check('⚠️ ถ้ารวมกันจะได้ -60 ก้อนเดียว — ยืนยันว่าไม่ได้ทำแบบนั้น',
  !db.prepare(`SELECT 1 x FROM Transactions WHERE transaction_id LIKE 'TXFX-TRP-FX%' AND ABS(total_amount + 60) < 0.02`).get());
check('ชื่อรายการบอกว่าเป็นของกระเป๋าไหน',
  /เยนบัญชี/.test(db.prepare(`SELECT statement_desc d FROM Transactions
    WHERE transaction_id LIKE 'TXFX-TRP-FX%' LIMIT 1`).get().d));
check('🔑 ยอดค่าใช้จ่ายไม่ถูกปนด้วย FX',
  Math.abs(db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id LIKE 'TX-TRP-FX%'`).get().t - 1440) < 0.02,
  String(db.prepare(`SELECT total_amount t FROM Transactions WHERE transaction_id LIKE 'TX-TRP-FX%'`).get().t));

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
if (fail > 0) process.exit(1);
process.exit(fail ? 1 : 0);
