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
  carried_from_wallet_id TEXT, carried_from_closure_id TEXT);
CREATE TABLE TripExpenses (trip_expense_id TEXT PRIMARY KEY, project_id TEXT, member_id TEXT,
  wallet_id TEXT, amount_foreign REAL, expense_date TEXT, created_at DATETIME,
  owner_member_id TEXT, visibility TEXT, is_shared INTEGER, split_mode TEXT,
  currency_code TEXT, icon_url TEXT, settled_amount_thb REAL, settled_rate REAL);
CREATE TABLE TripExpenseCategories (line_id TEXT PRIMARY KEY, trip_expense_id TEXT, category_id TEXT, label TEXT, amount_foreign REAL);
CREATE TABLE TripExpenseParticipants (participant_id TEXT PRIMARY KEY, trip_expense_id TEXT, member_id TEXT, amount_foreign REAL, percent REAL);
CREATE TABLE TripClosures (closure_id TEXT PRIMARY KEY, project_id TEXT, entry_type TEXT,
  posting_date TEXT, ledger_total REAL, trip_only_total REAL, fx_result REAL, carried_thb REAL,
  reverses_id TEXT, reason TEXT, performed_by TEXT, created_at DATETIME);
CREATE TABLE TripClosureLines (line_id TEXT PRIMARY KEY, closure_id TEXT, wallet_id TEXT,
  disposition TEXT, leftover_foreign REAL, thb_cost REAL, received_thb REAL, fx_amount REAL,
  carry_currency TEXT, carry_amount REAL, carry_funding_id TEXT);
CREATE TABLE TripPresence (project_id TEXT, member_id TEXT, is_sharing INTEGER, stop_id TEXT,
  place_label TEXT, status TEXT, latitude REAL, longitude REAL, checked_in_at DATETIME, expires_at DATETIME,
  PRIMARY KEY (project_id, member_id));
CREATE TABLE TripStops (stop_id TEXT PRIMARY KEY, project_id TEXT, stop_date TEXT, time TEXT, name TEXT);

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
`);

// ── D1 shim ────────────────────────────────────────────────────────────────
const DB = {
  prepare(sql) {
    let args = [];
    const api = {
      bind(...a) { args = a.map(v => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v))); return api; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { success: true, meta: db.prepare(sql).run(...args) }; }
    };
    return api;
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
  const res = await handleUnifiedTrip(req, env, url, cors);
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
check('บันทึกลงฐานจริง', db.prepare(`SELECT plan_rate FROM TripCurrencies WHERE code='JPY'`).get()?.plan_rate === 0.234);

r = await call('POST', '/api/unified-trip/currencies', { body: { code: 'JPY', symbol: '¥', label: 'เยน', plan_rate: 0.25 } });
check('รันซ้ำ = อัปเดต ไม่ใช่ error', r.status === 200 && db.prepare(`SELECT COUNT(*) n FROM TripCurrencies WHERE code='JPY'`).get().n === 1);
check('เรทใหม่ทับของเดิม', db.prepare(`SELECT plan_rate FROM TripCurrencies WHERE code='JPY'`).get().plan_rate === 0.25);

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
check('แก้แล้วไม่เกิดกระเป๋าใหม่', db.prepare(`SELECT COUNT(*) n FROM TripWallets`).get().n === 3);

r = await call('POST', '/api/unified-trip/wallets', { body: { wallet_id: 'TW-ไม่มีจริง', name: 'x', currency: 'JPY' } });
check('แก้กระเป๋าที่ไม่มี → 404', r.status === 404);

// เติมเงินแล้วห้ามเปลี่ยนสกุล
// เติม ¥10,000 ด้วยเงิน ฿2,340 → เรทเฉลี่ย 0.234
db.prepare(`INSERT INTO TripWalletFundings VALUES ('F-1','TRP-1',?,2340,10000,0.234,'2026-12-17',NULL,NULL)`).run(walletId);
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
  const before = db.prepare(`SELECT COUNT(*) n FROM TripWallets`).get().n;
  const ids = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    call('POST', '/api/unified-trip/wallets', { body: { name: `รัว ${i}`, currency: 'JPY' } })
      .then(x => x.data.wallet_id)));
  const after = db.prepare(`SELECT COUNT(*) n FROM TripWallets`).get().n;
  check('สร้าง 20 ใบรวดเดียวได้ครบ ไม่ทับกัน', after - before === 20 && new Set(ids).size === 20,
    `เพิ่มจริง ${after - before} · id ไม่ซ้ำ ${new Set(ids).size}`);
  db.prepare(`DELETE FROM TripWallets WHERE name LIKE 'รัว %'`).run();
}

console.log('\n── ด่านความปลอดภัย ──────────────────────────────');
r = await call('POST', '/api/unified-trip/currencies', { project: 'TRP-CLOSED', body: { code: 'JPY', symbol: '¥', plan_rate: 0.24 } });
check('ทริปปิดแล้วเขียนไม่ได้ → 409', r.status === 409, JSON.stringify(r));

r = await call('POST', '/api/unified-trip/wallets', { user: 'uOther', body: { name: 'x', currency: 'JPY' } });
check('คนต่างครอบครัว → 404 (ไม่บอกว่ามีทริปอยู่)', r.status === 404, JSON.stringify(r));

{
  const url = new URL('https://x/api/unified-trip/wallets?projectId=TRP-1');
  const res = await handleUnifiedTrip(new Request(url, { method: 'POST', body: '{}' }), env, url, cors);
  check('ไม่มี x-user-id → 401', res.status === 401);
}
r = await call('PUT', '/api/unified-trip/wallets', { body: {} });
check('method ที่ยังไม่รองรับ → 405', r.status === 405, JSON.stringify(r));
r = await call('POST', '/api/unified-trip/closures', { body: {} });
check('endpoint ปิดทริปยังไม่เปิด → 405', r.status === 405);

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

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
