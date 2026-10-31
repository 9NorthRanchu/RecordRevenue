// ═══════════════════════════════════════════════════════════════════════════
// ทะเบียนทรัพย์สิน (2026-10-12 · ออกแบบตามที่ North กำหนด รอบ 2)
//
//  · ไม่มีการคำนวณค่าเสื่อม — เป็นทะเบียนบันทึกอย่างเดียว
//  · North สร้างหมวดบัญชี เช่น "ทรัพย์สิน" ไว้ใต้กลุ่มสินทรัพย์ แล้วติ๊กว่าหมวดนี้นับเป็นทรัพย์สิน
//    (เก็บใน LedgerRules kind='ASSET_REG', rkey=category_id — เฉพาะผู้ดูแล)
//  · ส่งสลิป/บันทึกรายการจ่ายเข้าหมวดนี้ → ยืนยันแล้ว → ขึ้นในทะเบียนอัตโนมัติ (AssetItems source='TX')
//      วันที่ซื้อ/จำนวนเงิน อ่านสดจากรายการจริงเสมอ (แก้ที่หน้าประวัติ) · ชื่อ/กลุ่มย่อย/หมายเหตุ แก้ในทะเบียนได้
//  · ยอดยกมา (source='OPENING') = ทรัพย์สินที่มีก่อนเริ่มใช้ระบบ — กรอกเอง แก้ได้ทุกช่อง ไม่กระทบยอดเงินในบัญชี
//  · กลุ่มย่อย (AssetGroups) เช่น อุปกรณ์ช่าง · เครื่องใช้ในบ้าน · เครื่องใช้ออฟฟิศ — สร้าง/เปลี่ยนชื่อ/ลบ/ย้ายรายการได้
//      ลบกลุ่ม → รายการในกลุ่มไปอยู่ "ไม่ระบุกลุ่ม" (ไม่หาย)
//  · ลบ: ยอดยกมา = ลบทิ้งจริง · รายการจากธุรกรรม = ซ่อนจากทะเบียน (เงินยังอยู่ในประวัติ) กู้คืนได้
//  · ตัดจำหน่าย ณ วันที่เลือก: รายการปรับปรุง 1 รายการ ยอดรวม 0 (ไม่มีเงินเข้าออกบัญชีจริง)
//      บรรทัด 1: +มูลค่า หมวดทรัพย์สิน (TRANSFER = ลดทรัพย์สิน) · บรรทัด 2: −มูลค่า หมวดค่าใช้จ่ายที่เลือก (EXPENSE)
//      บัญชี = บัญชีที่ใช้ซื้อ (ยอดยกมาต้องเลือกบัญชี) · รหัสคงที่ TX-WO-{asset_id} · ติดล็อกปิดเดือนตามปกติ
//  · ยกเลิกการตัดจำหน่ายได้ (ลบรายการปรับปรุง) ถ้าเดือนนั้นยังไม่ปิด
//  · หมวดทรัพย์สินถูกตัดออกจาก "รายจ่าย" ในรายงาน/ภาพรวม และจาก "ลูกหนี้" (ซื้อทรัพย์สินไม่ใช่ค่าใช้จ่าย)
// ═══════════════════════════════════════════════════════════════════════════
import { isPeriodClosedError, PERIOD_CLOSED_MSG } from './period-close.js';
import { debtOutstanding, ensureDebtCols } from './loans.js';
/* v258 (2026-11-01 · North เลือกแบบ ก จาก mockup asset.png): 📍 ที่ตั้ง (Chaiyapruk · Villaggio · Pattaya · Element · Condo + เพิ่มเองได้)
   · รายละเอียดที่ตั้ง (เช่น ห้องนอนใหญ่) · รับประกันถึง · 🔗 หนี้ที่ผูก (Debts.asset_ref = รหัสหรือชื่อทรัพย์สิน) · 📎 ไฟล์แนบ (DriveLinks ref_type 'asset')
   · สรุป: มูลค่ารวม · หนี้ที่ผูกอยู่ · ส่วนของเรา (ทรัพย์สิน − หนี้) · ซื้อเพิ่มปีนี้ / ตัดออกปีนี้ */
export const DEFAULT_LOCATIONS = ['Chaiyapruk', 'Villaggio', 'Pattaya', 'Element', 'Condo'];

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d));
const plain = n => String(n || '').replace(/^\s*\[[^\]]+\]\s*/, '').trim() || String(n || '');
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const newId = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
export const ASSET_RULE = 'ASSET_REG';
/* ใช้ใน SQL: บรรทัดนี้อยู่ในหมวดทรัพย์สินไหม */
export const IS_ASSET_SQL = d => `EXISTS (SELECT 1 FROM LedgerRules ar WHERE ar.kind = '${ASSET_RULE}' AND ar.rkey = ${d}.category_id)`;

export const ASSET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS AssetGroups (group_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, sort INTEGER DEFAULT 0, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS AssetItems (asset_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, source TEXT NOT NULL, detail_id TEXT UNIQUE,
    name TEXT NOT NULL, purchase_date TEXT, amount REAL, category_id TEXT, group_id TEXT, entity_id TEXT, account_id TEXT, note TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE', writeoff_date TEXT, expense_category_id TEXT, writeoff_tx TEXT, writeoff_amount REAL, writeoff_note TEXT,
    created_by TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_asset_items_family ON AssetItems (family_id, status)`,
];
let ready = false;
async function ensure(env) {
  if (ready) return;
  for (const s of ASSET_SCHEMA) await env.DB.prepare(s).run();
  const have = new Set((((await env.DB.prepare(`PRAGMA table_info(AssetItems)`).all()).results) || []).map(c => c.name));
  for (const c of ['location', 'location_note', 'warranty_until']) if (!have.has(c)) { try { await env.DB.prepare(`ALTER TABLE AssetItems ADD COLUMN ${c} TEXT`).run(); } catch { /* มีแล้ว */ } }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AppSettings (family_id TEXT NOT NULL, skey TEXT NOT NULL, svalue TEXT, updated_at TEXT, PRIMARY KEY (family_id, skey))`).run();
  ready = true;
}
async function locationList(env, familyId) {
  const r = await env.DB.prepare(`SELECT svalue FROM AppSettings WHERE family_id = ? AND skey = 'asset_locations'`).bind(familyId).first();
  try { const a = JSON.parse(r?.svalue || 'null'); if (Array.isArray(a)) return a.map(String).filter(Boolean); } catch { /* ใช้ค่าเริ่มต้น */ }
  return DEFAULT_LOCATIONS.slice();
}
const locFields = (body, i = {}) => ({
  location: body.location !== undefined ? (clip(body.location, 60) || null) : (i.location ?? null),
  location_note: body.location_note !== undefined ? (clip(body.location_note, 120) || null) : (i.location_note ?? null),
  warranty_until: body.warranty_until !== undefined ? (validDate(body.warranty_until) ? body.warranty_until : null) : (i.warranty_until ?? null),
});

export async function assetCategorySet(env, familyId) {
  try { return new Set(((await env.DB.prepare(`SELECT rkey FROM LedgerRules WHERE family_id = ? AND kind = ?`).bind(familyId, ASSET_RULE).all()).results || []).map(r => r.rkey)); }
  catch { return new Set(); }
}
const qs = a => a.map(() => '?').join(',');

/* รายการจ่ายใหม่ในหมวดทรัพย์สิน → เพิ่มเข้าทะเบียน (ครั้งเดียวต่อบรรทัด) */
async function syncFromTransactions(env, familyId, cats) {
  if (!cats.length) return;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO AssetItems (asset_id, family_id, source, detail_id, name, category_id, entity_id, status, created_at, updated_at)
      SELECT 'AS-' || d.detail_id, ?, 'TX', d.detail_id, COALESCE(NULLIF(TRIM(d.note), ''), NULLIF(TRIM(t.statement_desc), ''), 'ทรัพย์สิน'), d.category_id, d.entity_id, 'ACTIVE', ?, ?
        FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id
        JOIN Accounts a ON a.account_id = t.account_id JOIN Entities en ON en.entity_id = a.entity_id AND en.family_id = ?
       WHERE d.category_id IN (${qs(cats)}) AND d.amount < 0 AND t.status = 'CONFIRMED'
         AND d.detail_id NOT LIKE 'DT-WO-%' AND d.detail_id NOT LIKE 'DT-OB-%'
         AND NOT EXISTS (SELECT 1 FROM AssetItems x WHERE x.detail_id = d.detail_id)`).bind(familyId, now, now, familyId, ...cats).run();
}

export async function listAssets(env, user) {
  await ensure(env);
  const cats = [...await assetCategorySet(env, user.family_id)];
  await syncFromTransactions(env, user.family_id, cats);
  const catRows = cats.length ? ((await env.DB.prepare(`SELECT category_id, name FROM Categories WHERE category_id IN (${qs(cats)})`).bind(...cats).all()).results || []) : [];
  const groups = (await env.DB.prepare(`SELECT group_id, name, sort FROM AssetGroups WHERE family_id = ? ORDER BY sort, name`).bind(user.family_id).all()).results || [];
  // รายการจากธุรกรรม: เห็นเฉพาะบัญชีที่ตัวเองมีสิทธิ์ · วันที่/จำนวนเงินอ่านสดจากรายการจริง
  const tx = (await env.DB.prepare(`SELECT i.*, t.transaction_id, t.date AS live_date, -d.amount AS live_amount, d.category_id AS live_cat, t.account_id AS live_acc,
        a.name AS account_name, e.name AS entity_name, xc.name AS expense_category, c.name AS category_name
      FROM AssetItems i JOIN TransactionDetails d ON d.detail_id = i.detail_id JOIN Transactions t ON t.transaction_id = d.transaction_id
      JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
      LEFT JOIN Entities e ON e.entity_id = d.entity_id LEFT JOIN Categories xc ON xc.category_id = i.expense_category_id
      LEFT JOIN Categories c ON c.category_id = d.category_id
     WHERE i.family_id = ? AND i.source = 'TX' AND t.status = 'CONFIRMED' AND d.amount < 0`).bind(user.user_id, user.family_id).all()).results || [];
  const op = (await env.DB.prepare(`SELECT i.*, a.name AS account_name, e.name AS entity_name, xc.name AS expense_category, c.name AS category_name
      FROM AssetItems i LEFT JOIN Accounts a ON a.account_id = i.account_id LEFT JOIN Entities e ON e.entity_id = i.entity_id
      LEFT JOIN Categories xc ON xc.category_id = i.expense_category_id LEFT JOIN Categories c ON c.category_id = i.category_id
     WHERE i.family_id = ? AND i.source = 'OPENING'`).bind(user.family_id).all()).results || [];
  const gName = new Map(groups.map(g => [g.group_id, g.name]));
  const items = [...tx, ...op].map(i => {
    const isTx = i.source === 'TX';
    return {
      asset_id: i.asset_id, source: i.source, detail_id: i.detail_id || null, transaction_id: isTx ? i.transaction_id : null,
      name: i.name, date: String(isTx ? i.live_date : i.purchase_date || '').slice(0, 10), value: r2(isTx ? i.live_amount : i.amount),
      category_id: isTx ? i.live_cat : i.category_id, category_name: plain(i.category_name || ''),
      group_id: gName.has(i.group_id) ? i.group_id : null, group_name: gName.get(i.group_id) || null,
      account_id: isTx ? i.live_acc : i.account_id, account_name: plain(i.account_name || ''), entity_id: i.entity_id || null, entity_name: plain(i.entity_name || ''),
      note: i.note || '', status: i.status, writeoff_date: i.writeoff_date || null, expense_category_id: i.expense_category_id || null,
      expense_category: i.expense_category ? plain(i.expense_category) : null, writeoff_note: i.writeoff_note || null, writeoff_tx: i.writeoff_tx || null,
      location: i.location || null, location_note: i.location_note || null, warranty_until: i.warranty_until || null,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'th'));
  const act = items.filter(i => i.status === 'ACTIVE');
  /* 🔗 หนี้ที่ผูก: Debts.asset_ref = รหัสทรัพย์สิน หรือชื่อ (ไม่สนตัวพิมพ์ · ชื่อหนึ่งอยู่ในอีกชื่อ) */
  let debts = [];
  try { await ensureDebtCols(env); debts = ((await env.DB.prepare(`SELECT * FROM Debts WHERE family_id = ? AND IFNULL(status,'active') = 'active' AND IFNULL(type,'PAYABLE') = 'PAYABLE' AND IFNULL(TRIM(asset_ref),'') != ''`).bind(user.family_id).all()).results) || []; } catch { debts = []; }
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const debtLinks = new Map(); let debtTotal = 0;
  for (const d of debts) {
    const ref = norm(d.asset_ref), hit = items.filter(i => i.status === 'ACTIVE' && (i.asset_id.toLowerCase() === ref || (norm(i.name) && (norm(i.name) === ref || (ref.length >= 4 && (norm(i.name).includes(ref) || ref.includes(norm(i.name))))))));
    if (!hit.length) continue;
    const out = r2(await debtOutstanding(env, d)); debtTotal += Math.max(0, out);
    for (const i of hit) { const l = debtLinks.get(i.asset_id) || []; l.push({ debt_id: d.debt_id, name: d.name, kind: d.kind || 'OTHER', outstanding: out }); debtLinks.set(i.asset_id, l); }
  }
  /* 📎 ไฟล์แนบ */
  const files = new Map();
  try { for (const r of ((await env.DB.prepare(`SELECT l.ref_id, COUNT(*) AS n FROM DriveLinks l JOIN DriveFiles f ON f.file_id = l.file_id WHERE l.ref_type = 'asset' AND f.family_id = ? GROUP BY l.ref_id`).bind(user.family_id).all()).results) || []) files.set(r.ref_id, r.n); } catch { /* ยังไม่ได้ตั้ง Drive */ }
  for (const i of items) { i.debts = debtLinks.get(i.asset_id) || []; i.files = files.get(i.asset_id) || 0; }
  const year = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 4);
  const locations = await locationList(env, user.family_id);
  for (const i of items) if (i.location && !locations.includes(i.location)) locations.push(i.location);
  const byGroup = {};
  for (const i of act) { const k = i.group_id || ''; byGroup[k] = byGroup[k] || { count: 0, value: 0 }; byGroup[k].count++; byGroup[k].value = r2(byGroup[k].value + i.value); }
  return {
    categories: catRows.map(c => ({ category_id: c.category_id, name: plain(c.name) })),
    groups: groups.map(g => ({ ...g, count: byGroup[g.group_id]?.count || 0, value: byGroup[g.group_id]?.value || 0 })),
    items,
    totals: { value: r2(act.reduce((s, i) => s + i.value, 0)), count: act.length,
      opening: r2(act.filter(i => i.source === 'OPENING').reduce((s, i) => s + i.value, 0)),
      written_off: items.filter(i => i.status === 'WRITTEN_OFF').length, removed: items.filter(i => i.status === 'REMOVED').length,
      ungrouped: byGroup[''] || { count: 0, value: 0 },
      debt_linked: r2(debtTotal), net: r2(act.reduce((s, i) => s + i.value, 0) - debtTotal),
      year_value: r2(act.filter(i => i.date.startsWith(year)).reduce((s, i) => s + i.value, 0)), year_count: act.filter(i => i.date.startsWith(year)).length,
      year_writeoff: items.filter(i => i.status === 'WRITTEN_OFF' && String(i.writeoff_date || '').startsWith(year)).length },
    locations,
  };
}

async function setCategories(env, user, body) {
  if (user.role !== 'admin') return { error: 'เฉพาะผู้ดูแลเท่านั้นที่ตั้งหมวดทรัพย์สินได้', status: 403 };
  const ids = [...new Set((Array.isArray(body.category_ids) ? body.category_ids : []).map(String))].slice(0, 50);
  if (ids.length) {
    const ok = ((await env.DB.prepare(`SELECT category_id FROM Categories WHERE category_id IN (${qs(ids)}) AND (family_id = ? OR family_id IS NULL)`)
      .bind(...ids, user.family_id).all()).results || []).map(r => r.category_id);
    if (ok.length !== ids.length) return { error: 'มีหมวดที่ไม่พบ', status: 400 };
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM LedgerRules WHERE family_id = ? AND kind = ?`).bind(user.family_id, ASSET_RULE),
    ...ids.map(id => env.DB.prepare(`INSERT INTO LedgerRules (rule_id, family_id, kind, rkey, value, hits, updated_at) VALUES (?,?,?,?, '1', 1, ?)`)
      .bind(`AR-${user.family_id}-${id}`.slice(0, 120), user.family_id, ASSET_RULE, id, now)),
  ]);
  return { ok: true, count: ids.length };
}

/* ── กลุ่มย่อย ── */
async function groupOf(env, user, gid) {
  if (!gid) return null;
  return env.DB.prepare(`SELECT * FROM AssetGroups WHERE group_id = ? AND family_id = ?`).bind(gid, user.family_id).first();
}
async function createGroup(env, user, body) {
  const name = clip(body.name, 60);
  if (!name) return { error: 'ตั้งชื่อกลุ่มก่อน', status: 400 };
  if (await env.DB.prepare(`SELECT 1 FROM AssetGroups WHERE family_id = ? AND name = ?`).bind(user.family_id, name).first()) return { error: 'มีกลุ่มชื่อนี้แล้ว', status: 409 };
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(sort) AS m FROM AssetGroups WHERE family_id = ?`).bind(user.family_id).first();
  if ((n?.n || 0) >= 100) return { error: 'กลุ่มเยอะเกินไป (สูงสุด 100)', status: 400 };
  const id = newId('AG');
  await env.DB.prepare(`INSERT INTO AssetGroups (group_id, family_id, name, sort, created_at) VALUES (?,?,?,?,?)`).bind(id, user.family_id, name, (n?.m || 0) + 1, new Date().toISOString()).run();
  return { ok: true, group_id: id };
}
async function updateGroup(env, user, gid, body) {
  const g = await groupOf(env, user, gid);
  if (!g) return { error: 'ไม่พบกลุ่มนี้', status: 404 };
  const name = body.name !== undefined ? clip(body.name, 60) : g.name;
  if (!name) return { error: 'ตั้งชื่อกลุ่มก่อน', status: 400 };
  if (name !== g.name && await env.DB.prepare(`SELECT 1 FROM AssetGroups WHERE family_id = ? AND name = ? AND group_id <> ?`).bind(user.family_id, name, gid).first()) return { error: 'มีกลุ่มชื่อนี้แล้ว', status: 409 };
  const sort = Number.isFinite(Number(body.sort)) && body.sort !== undefined ? Math.trunc(Number(body.sort)) : g.sort;
  await env.DB.prepare(`UPDATE AssetGroups SET name = ?, sort = ? WHERE group_id = ?`).bind(name, sort, gid).run();
  return { ok: true };
}
async function deleteGroup(env, user, gid) {
  const g = await groupOf(env, user, gid);
  if (!g) return { error: 'ไม่พบกลุ่มนี้', status: 404 };
  await env.DB.batch([
    env.DB.prepare(`UPDATE AssetItems SET group_id = NULL, updated_at = ? WHERE family_id = ? AND group_id = ?`).bind(new Date().toISOString(), user.family_id, gid),
    env.DB.prepare(`DELETE FROM AssetGroups WHERE group_id = ?`).bind(gid),
  ]);
  return { ok: true };
}
async function moveItems(env, user, body) {
  const ids = [...new Set((Array.isArray(body.asset_ids) ? body.asset_ids : []).map(String))].slice(0, 80);
  if (!ids.length) return { error: 'เลือกรายการที่จะย้าย', status: 400 };
  const gid = body.group_id || null;
  if (gid && !await groupOf(env, user, gid)) return { error: 'ไม่พบกลุ่มปลายทาง', status: 404 };
  const items = await Promise.all(ids.map(id => loadItem(env, user, id)));
  if (items.some(i => !i)) return { error: 'มีรายการที่ไม่พบ', status: 404 };
  await env.DB.prepare(`UPDATE AssetItems SET group_id = ?, updated_at = ? WHERE family_id = ? AND asset_id IN (${qs(ids)})`).bind(gid, new Date().toISOString(), user.family_id, ...ids).run();
  return { ok: true, moved: ids.length };
}

/* ── รายการ ── โหลดพร้อมตรวจสิทธิ์ (ธุรกรรม: ต้องมีสิทธิ์บัญชีที่ซื้อ) */
async function loadItem(env, user, assetId) {
  const i = await env.DB.prepare(`SELECT * FROM AssetItems WHERE asset_id = ? AND family_id = ?`).bind(assetId, user.family_id).first();
  if (!i) return null;
  if (i.source !== 'TX') return i;
  const d = await env.DB.prepare(`SELECT d.amount, d.category_id, d.entity_id, d.contact_id, d.project_id, t.date, t.account_id, t.status, t.transaction_id
      FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id
      JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
     WHERE d.detail_id = ?`).bind(user.user_id, i.detail_id).first();
  if (!d || d.status !== 'CONFIRMED' || d.amount >= 0) return null;
  return { ...i, live: d };
}
const itemValue = i => r2(i.source === 'TX' ? -i.live.amount : i.amount);
const itemDate = i => String(i.source === 'TX' ? i.live.date : i.purchase_date).slice(0, 10);

async function createOpening(env, user, body) {
  const cats = await assetCategorySet(env, user.family_id);
  const name = clip(body.name, 120), amount = r2(body.amount), date = body.date;
  if (!name) return { error: 'ใส่ชื่อทรัพย์สิน', status: 400 };
  if (!(amount > 0) || amount > 1e11) return { error: 'จำนวนเงินต้องมากกว่า 0', status: 400 };
  if (!validDate(date)) return { error: 'วันที่ได้มาไม่ถูกต้อง', status: 400 };
  const category_id = body.category_id || [...cats][0];
  if (!category_id || !cats.has(category_id)) return { error: 'เลือกหมวดทรัพย์สินก่อน (ผู้ดูแลตั้งได้ที่ "เลือกหมวด")', status: 400 };
  const gid = body.group_id || null;
  if (gid && !await groupOf(env, user, gid)) return { error: 'ไม่พบกลุ่ม', status: 404 };
  const ent = body.entity_id ? await env.DB.prepare(`SELECT e.entity_id FROM Entities e JOIN UserPermissions up ON up.entity_id = e.entity_id AND up.user_id = ? WHERE e.entity_id = ?`).bind(user.user_id, body.entity_id).first() : null;
  if (body.entity_id && !ent) return { error: 'ไม่มีสิทธิ์ในเจ้าของที่เลือก', status: 403 };
  const id = newId('AS-OP'), now = new Date().toISOString();
  const lf = locFields(body);
  await env.DB.prepare(`INSERT INTO AssetItems (asset_id, family_id, source, detail_id, name, purchase_date, amount, category_id, group_id, entity_id, note, status, created_by, created_at, updated_at, location, location_note, warranty_until)
      VALUES (?,?, 'OPENING', NULL, ?,?,?,?,?,?,?, 'ACTIVE', ?,?,?,?,?,?)`).bind(id, user.family_id, name, date, amount, category_id, gid, ent?.entity_id || null, clip(body.note, 300) || null, user.user_id, now, now, lf.location, lf.location_note, lf.warranty_until).run();
  return { ok: true, asset_id: id };
}

async function editItem(env, user, id, body) {
  const i = await loadItem(env, user, id);
  if (!i) return { error: 'ไม่พบทรัพย์สินนี้', status: 404 };
  const name = body.name !== undefined ? clip(body.name, 120) : i.name;
  if (!name) return { error: 'ใส่ชื่อทรัพย์สิน', status: 400 };
  let gid = i.group_id;
  if (body.group_id !== undefined) { gid = body.group_id || null; if (gid && !await groupOf(env, user, gid)) return { error: 'ไม่พบกลุ่ม', status: 404 }; }
  const note = body.note !== undefined ? (clip(body.note, 300) || null) : i.note;
  let { purchase_date, amount, category_id } = i;
  const touchesMoney = body.date !== undefined || body.amount !== undefined || body.category_id !== undefined;
  if (touchesMoney && i.source === 'TX') {
    const same = (body.date === undefined || body.date === itemDate(i)) && (body.amount === undefined || r2(body.amount) === itemValue(i)) && (body.category_id === undefined || body.category_id === i.live.category_id);
    if (!same) return { error: 'รายการนี้มาจากธุรกรรมจริง — แก้วันที่/จำนวนเงิน/หมวด ที่หน้าประวัติรายการ', status: 400 };
  } else if (touchesMoney) {
    if (i.status === 'WRITTEN_OFF') return { error: 'ตัดจำหน่ายแล้ว — ยกเลิกการตัดจำหน่ายก่อนแก้วันที่/จำนวนเงิน', status: 409 };
    if (body.date !== undefined) { if (!validDate(body.date)) return { error: 'วันที่ได้มาไม่ถูกต้อง', status: 400 }; purchase_date = body.date; }
    if (body.amount !== undefined) { amount = r2(body.amount); if (!(amount > 0) || amount > 1e11) return { error: 'จำนวนเงินต้องมากกว่า 0', status: 400 }; }
    if (body.category_id !== undefined) { if (!(await assetCategorySet(env, user.family_id)).has(body.category_id)) return { error: 'หมวดต้องเป็นหมวดทรัพย์สิน', status: 400 }; category_id = body.category_id; }
  }
  const lf = locFields(body, i);
  await env.DB.prepare(`UPDATE AssetItems SET name = ?, group_id = ?, note = ?, purchase_date = ?, amount = ?, category_id = ?, location = ?, location_note = ?, warranty_until = ?, updated_at = ? WHERE asset_id = ?`)
    .bind(name, gid, note, purchase_date, amount, category_id, lf.location, lf.location_note, lf.warranty_until, new Date().toISOString(), id).run();
  return { ok: true };
}

async function deleteItem(env, user, id) {
  const i = await loadItem(env, user, id);
  if (!i) return { error: 'ไม่พบทรัพย์สินนี้', status: 404 };
  if (i.status === 'WRITTEN_OFF') return { error: 'ตัดจำหน่ายแล้ว — ยกเลิกการตัดจำหน่ายก่อนลบ', status: 409 };
  if (i.source === 'OPENING') { await env.DB.prepare(`DELETE FROM AssetItems WHERE asset_id = ?`).bind(id).run(); return { ok: true, deleted: true }; }
  await env.DB.prepare(`UPDATE AssetItems SET status = 'REMOVED', updated_at = ? WHERE asset_id = ?`).bind(new Date().toISOString(), id).run();
  return { ok: true, hidden: true };
}
async function restoreItem(env, user, id) {
  const i = await loadItem(env, user, id);
  if (!i || i.status !== 'REMOVED') return { error: 'ไม่พบรายการที่ซ่อนไว้', status: 404 };
  await env.DB.prepare(`UPDATE AssetItems SET status = 'ACTIVE', updated_at = ? WHERE asset_id = ?`).bind(new Date().toISOString(), id).run();
  return { ok: true };
}

async function writeOff(env, user, id, body) {
  const i = await loadItem(env, user, id);
  if (!i) return { error: 'ไม่พบทรัพย์สินนี้', status: 404 };
  if (i.status === 'WRITTEN_OFF') return { error: 'ตัดจำหน่ายไปแล้ว', status: 409 };
  if (i.status !== 'ACTIVE') return { error: 'รายการนี้ถูกซ่อนอยู่ — กู้คืนก่อน', status: 409 };
  const date = body.date;
  if (!validDate(date)) return { error: 'วันที่ตัดจำหน่ายไม่ถูกต้อง', status: 400 };
  if (date < itemDate(i)) return { error: 'วันที่ตัดจำหน่ายต้องไม่ก่อนวันที่ได้มา', status: 400 };
  const cats = await assetCategorySet(env, user.family_id);
  const exp = await env.DB.prepare(`SELECT c.category_id FROM Categories c WHERE c.category_id = ? AND (c.family_id = ? OR c.family_id IS NULL)`).bind(body.expense_category_id || '', user.family_id).first();
  if (!exp) return { error: 'เลือกหมวดค่าใช้จ่ายที่จะบันทึกมูลค่า', status: 400 };
  if (cats.has(exp.category_id)) return { error: 'หมวดปลายทางต้องเป็นหมวดค่าใช้จ่าย ไม่ใช่หมวดทรัพย์สิน', status: 400 };
  let accountId, entityId, contactId = null, projectId = null, assetCat;
  if (i.source === 'TX') {
    accountId = i.live.account_id; entityId = i.live.entity_id; contactId = i.live.contact_id; projectId = i.live.project_id; assetCat = i.live.category_id;
  } else {
    const acc = await env.DB.prepare(`SELECT a.account_id, a.entity_id FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ? WHERE a.account_id = ?`).bind(user.user_id, body.account_id || '').first();
    if (!acc) return { error: 'ยอดยกมา: เลือกบัญชีที่จะบันทึกรายการปรับปรุง (ยอดเงินไม่เปลี่ยน)', status: 400 };
    accountId = acc.account_id; entityId = i.entity_id || acc.entity_id; assetCat = i.category_id;
  }
  const value = itemValue(i), txId = `TX-WO-${id}`, note = clip(body.note, 200);
  const label = i.name || 'ทรัพย์สิน';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
      VALUES (?,?, NULL, ?, NULL, 0, ?, 'CONFIRMED', 'WEB_GRID', NULL, ?)`).bind(txId, accountId, date, `ตัดจำหน่ายทรัพย์สิน: ${label}`.slice(0, 200), user.user_id),
    env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type)
      VALUES (?,?,?,0,0,?,?,?,?,?, 'TRANSFER')`).bind(`DT-WO-${id}-A`, txId, value, assetCat, entityId || null, contactId || null, projectId || null, `ตัดจำหน่าย: ${label}`.slice(0, 200)),
    env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type)
      VALUES (?,?,?,0,0,?,?,?,?,?, 'EXPENSE')`).bind(`DT-WO-${id}-E`, txId, -value, exp.category_id, entityId || null, contactId || null, projectId || null, (note || `ตัดจำหน่าย: ${label}`).slice(0, 200)),
    env.DB.prepare(`UPDATE AssetItems SET status = 'WRITTEN_OFF', writeoff_date = ?, expense_category_id = ?, writeoff_tx = ?, writeoff_amount = ?, writeoff_note = ?, account_id = COALESCE(account_id, ?), updated_at = ? WHERE asset_id = ?`)
      .bind(date, exp.category_id, txId, value, note || null, i.source === 'OPENING' ? accountId : null, new Date().toISOString(), id),
  ]);
  return { ok: true, transaction_id: txId, value };
}

async function undoWriteOff(env, user, id) {
  const i = await loadItem(env, user, id);
  if (!i || i.status !== 'WRITTEN_OFF' || !i.writeoff_tx) return { error: 'ไม่พบการตัดจำหน่ายของรายการนี้', status: 404 };
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(i.writeoff_tx),
    env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id = ?`).bind(i.writeoff_tx),
    env.DB.prepare(`UPDATE AssetItems SET status = 'ACTIVE', writeoff_date = NULL, expense_category_id = NULL, writeoff_tx = NULL, writeoff_amount = NULL, writeoff_note = NULL,
      account_id = CASE WHEN source = 'OPENING' THEN NULL ELSE account_id END, updated_at = ? WHERE asset_id = ?`).bind(new Date().toISOString(), id),
  ]);
  return { ok: true };
}

/*  GET  /api/inbox/assets
    POST /api/inbox/assets/categories {category_ids}           (ผู้ดูแล)
    POST /api/inbox/assets/opening {name,date,amount,category_id?,group_id?,entity_id?,note?}
    POST /api/inbox/assets/move {asset_ids, group_id|null}
    POST /api/inbox/assets/groups {name} · /groups/{id} {name?,sort?} · /groups/{id}/delete
    POST /api/inbox/assets/{id} {name?,group_id?,note?,date?,amount?,category_id?}   (วันที่/จำนวนเงิน/หมวด เฉพาะยอดยกมา)
    POST /api/inbox/assets/{id}/delete · /restore · /writeoff {date,expense_category_id,note?,account_id?} · /undo */
export async function handleAssets(request, env, url, cors, user) {
  const p = url.pathname;
  if (p !== '/api/inbox/assets' && !p.startsWith('/api/inbox/assets/')) return null;
  try {
    if (p === '/api/inbox/assets' && request.method === 'GET') return json(await listAssets(env, user), cors);
    if (request.method !== 'POST') return null;
    await ensure(env);
    const body = await request.json().catch(() => ({}));
    const seg = p.slice('/api/inbox/assets/'.length).split('/').map(s => { try { return decodeURIComponent(s); } catch { return s; } });
    let out;
    if (seg[0] === 'categories' && seg.length === 1) out = await setCategories(env, user, body);
    else if (seg[0] === 'locations' && seg.length === 1) {   // 📍 รายชื่อที่ตั้ง (v258)
      const list = [...new Set((Array.isArray(body.locations) ? body.locations : []).map(x => clip(x, 60)).filter(Boolean))].slice(0, 50);
      await env.DB.prepare(`INSERT OR REPLACE INTO AppSettings (family_id, skey, svalue, updated_at) VALUES (?, 'asset_locations', ?, ?)`).bind(user.family_id, JSON.stringify(list), new Date().toISOString()).run();
      out = { ok: true, locations: list };
    }
    else if (seg[0] === 'opening' && seg.length === 1) out = await createOpening(env, user, body);
    else if (seg[0] === 'move' && seg.length === 1) out = await moveItems(env, user, body);
    else if (seg[0] === 'groups') {
      if (seg.length === 1) out = await createGroup(env, user, body);
      else if (seg.length === 2) out = await updateGroup(env, user, seg[1], body);
      else if (seg.length === 3 && seg[2] === 'delete') out = await deleteGroup(env, user, seg[1]);
      else return null;
    } else if (seg.length === 1 && seg[0]) out = await editItem(env, user, seg[0], body);
    else if (seg.length === 2) {
      const fn = { delete: deleteItem, restore: restoreItem, writeoff: writeOff, undo: undoWriteOff }[seg[1]];
      if (!fn) return null;
      out = await fn(env, user, seg[0], body);
    } else return null;
    return json(out, cors, out.error ? (out.status || 400) : 200);
  } catch (e) {
    if (isPeriodClosedError(String(e?.message || e))) return json({ error: PERIOD_CLOSED_MSG, code: 'PERIOD_CLOSED' }, cors, 409);
    throw e;
  }
}
