// ═══════════════════════════════════════════════════════════════════════════
// 👥 ผังเก็บรายได้ (2026-10-30 · North: "ผังการเก็บรายได้ matching กับยอดเงินเข้า เพื่อการบันทึกเท่านั้น")
//
//  ไฟล์ customertest.xlsx = ทะเบียนใบแจ้งหนี้/ใบเสร็จของ BKP (1 แถว = ลูกค้า × เดือนภาษี × ประเภทงาน) · North: ไฟล์นี้อัปเดตสุดแล้ว
//  ยอดที่ลูกค้าโอน = "รวม" = ค่าบริการ − หัก ณ ที่จ่าย + เงินภาษี/ค่าธรรมเนียมที่รับไว้จ่ายแทนลูกค้า (ภ.ง.ด. ภ.พ.30 ประกันสังคม ฯลฯ) ± ยอดยกจากงวดก่อน
//  · นำเข้าครั้งเดียว (ส่งใหม่ = แทนที่แถวที่ยังไม่ถูกใช้) → ตาราง RevenueChart
//  · เงินเข้าที่รอตรวจ → หาแถวที่ยอด "รวม" (หรือ "ยอดชำระ") ตรง: แถวเดียว หรือหลายแถวของลูกค้าเดียวกัน (โอนทีเดียวหลายเดือน) ช่วงวันใกล้กัน
//  · ใช้ → แตกบรรทัดของรายการ: ค่าบริการ (หมวดตามประเภท Account/Audit/Service · หัก ณ ที่จ่าย · บริษัทตาม OWNER · คู่ค้า = ลูกค้า)
//          + เงินรับแทน (หมวดที่ตั้งไว้) · บันทึกเท่านั้น ไม่ใช่ระบบลูกหนี้ · ยังรอตรวจ ต้องกดยืนยันเอง
//  · ผูก OWNER → บริษัทในแอป · "บัญชีที่เงินเข้า" → บัญชีในแอป · หมวดเงินรับแทน เก็บใน LedgerRules (REV_OWNER / REV_ACCOUNT / REV_SETTING)
// ═══════════════════════════════════════════════════════════════════════════
import { planSettlementKeep } from './settle-keep.js';

const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const day = d => Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') / 864e5;
const UNCAT = 'Cat_Uncategorized';
const norm = s => String(s || '').toLowerCase().replace(/^(บริษัท|ห้างหุ้นส่วนจำกัด|หจก\.?|บจก\.?|mr\.?|นาย|นาง(สาว)?)\s*/u, '').replace(/(จำกัด|\(มหาชน\)|co\.?,?\s*ltd\.?|limited)/gu, '').replace(/[\s.,'"()\-_/&]+/g, '');

let ready = false;
export async function ensureRevenueTable(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS RevenueChart (row_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, owner TEXT, code TEXT, name TEXT,
    tax_month TEXT, invoice_no TEXT, invoice_date TEXT, receipt_no TEXT, receipt_date TEXT, type TEXT, service TEXT,
    fee REAL, wht REAL, other REAL, total REAL, paid REAL, bank_fee REAL, account_label TEXT, note TEXT, matched_tx TEXT, imported_at TEXT)`).run();
  try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_revchart_fam ON RevenueChart(family_id, code)`).run(); } catch { /* */ }
  ready = true;
}
export function _resetRevenueReady() { ready = false; }

/* วันที่อ้างอิงของแถว: วันรับเงิน (ใบเสร็จ) > วันใบแจ้งหนี้ > สิ้นเดือนภาษี */
export function rowRefDate(r) { return r.receipt_date || r.invoice_date || r.tax_month || null; }
export const rowAmount = r => r2(r.paid || r.total);

/* คะแนนแถว (หรือชุดแถว) กับเงินเข้า 1 รายการ · ยอดต้องเท่า (ยอมค่าธรรมเนียมธนาคาร ≤ 50 บาท) */
function scoreSet(tx, set, acctOf) {
  const sum = r2(set.reduce((s, r) => s + rowAmount(r), 0));
  const gap = r2(Number(tx.amount) - sum);
  if (gap > 0.005 || gap < -50) return null;
  let score = Math.abs(gap) < 0.005 ? 60 : 35;
  const dists = set.map(r => rowRefDate(r) ? Math.abs(day(tx.date) - day(rowRefDate(r))) : 60);
  const near = Math.min(...dists);
  if (set.some(r => r.receipt_date) && near <= 3) score += 25; else if (near <= 15) score += 12; else if (near <= 45) score += 4; else if (near > 120) return null;
  const acc = set.map(r => acctOf(r.account_label)).filter(Boolean);
  if (acc.length && acc.every(a => a === tx.account_id)) score += 10;
  else if (acc.length && acc.some(a => a !== tx.account_id)) score -= 25;
  const d = norm(tx.statement_desc);
  if (d && set.some(r => { const n = norm(r.name); return n.length >= 4 && (d.includes(n.slice(0, 8)) || n.includes(d.slice(0, 8))); })) score += 15;
  if (set.length > 1) score -= 5 * (set.length - 1);
  return { score, gap, rows: set };
}

/* หาแถวผังรายได้ที่ตรงกับเงินเข้า: แถวเดียว หรือ 2–4 แถวของลูกค้าเดียวกันที่ยังไม่ถูกใช้ (ช่วง ±120 วัน) */
export function matchRevenue(tx, rows, acctOf = () => null) {
  if (!(Number(tx.amount) > 0)) return [];
  const free = rows.filter(r => !r.matched_tx && rowAmount(r) > 0 && (!rowRefDate(r) || Math.abs(day(tx.date) - day(rowRefDate(r))) <= 120));
  const out = [];
  for (const r of free) { const s = scoreSet(tx, [r], acctOf); if (s) out.push(s); }
  const byCode = {};
  for (const r of free) if (rowAmount(r) < Number(tx.amount)) (byCode[r.code] = byCode[r.code] || []).push(r);
  for (const list of Object.values(byCode)) {
    const L = list.sort((a, b) => String(rowRefDate(a)).localeCompare(String(rowRefDate(b)))).slice(-12);
    const n = L.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const bits = mask.toString(2).replace(/0/g, '').length; if (bits < 2 || bits > 4) continue;
      const set = L.filter((_, i) => mask & (1 << i));
      const s = scoreSet(tx, set, acctOf); if (s) out.push(s);
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/* บรรทัดย่อยจากชุดแถว (เครื่องหมายแบบระบบ: เงินเข้า บวก · หัก ณ ที่จ่าย บวก · ค่าธรรมเนียม บวก) */
export function linesFromRows(rows, { categories, ownerEntity, contactOf, advanceCategory, bankFee = 0 }) {
  const lines = [];
  for (const r of rows) {
    const cat = categories.has(r.type) ? r.type : UNCAT;
    const base = { entity_id: ownerEntity(r.owner) || null, contact_id: contactOf(r.code) || null, type: 'INCOME' };
    const fee = r2(r.fee), wht = r2(Math.abs(r.wht || 0));
    const other = r2(r2(r.total) - (fee - wht));
    if (fee) lines.push({ ...base, amount: fee, wht, fee: 0, category_id: cat, note: [r.code, r.service || r.type, r.receipt_no].filter(Boolean).join(' · ').slice(0, 200) });
    if (Math.abs(other) >= 0.005) lines.push({ ...base, amount: other, wht: 0, fee: 0, category_id: advanceCategory || UNCAT, note: `${r.code} · เงินรับแทน (ภาษี/ค่าธรรมเนียม/ยอดยกงวดก่อน)`.slice(0, 200) });
  }
  if (lines.length && bankFee > 0.004) lines[0].fee = r2(bankFee);
  return lines;
}

async function rules(env, fam, kind) {
  const rows = (await env.DB.prepare(`SELECT rkey, value FROM LedgerRules WHERE family_id=? AND kind=?`).bind(fam, kind).all()).results || [];
  return new Map(rows.map(r => [r.rkey, r.value]));
}
async function setRule(env, fam, kind, key, value) {
  if (!key) return;
  if (value == null || value === '') { await env.DB.prepare(`DELETE FROM LedgerRules WHERE family_id=? AND kind=? AND rkey=?`).bind(fam, kind, key).run(); return; }
  await env.DB.prepare(`INSERT INTO LedgerRules (rule_id, family_id, kind, rkey, value, hits, updated_at) VALUES (?,?,?,?,?,1,?)
    ON CONFLICT(family_id, kind, rkey) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .bind(`RULE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, fam, kind, key, String(value), new Date().toISOString()).run();
}

const cleanRow = (x, fam, now) => {
  const t = s => (s == null ? null : String(s).trim().slice(0, 300) || null), n = v => (v === '' || v == null || !isFinite(Number(v))) ? null : r2(v), d = v => isDate(v) ? v : null;
  const fee = n(x.fee) || 0, wht = n(x.wht) || 0, total = n(x.total);
  return { row_id: t(x.row_id) || `REV-${Math.random().toString(36).slice(2, 12)}`, family_id: fam, owner: t(x.owner), code: t(x.code), name: t(x.name), tax_month: d(x.tax_month),
    invoice_no: t(x.invoice_no), invoice_date: d(x.invoice_date), receipt_no: t(x.receipt_no), receipt_date: d(x.receipt_date), type: t(x.type), service: t(x.service),
    fee, wht, other: total == null ? 0 : r2(total - fee - wht), total: total == null ? r2(fee + wht) : total, paid: n(x.paid), bank_fee: n(x.bank_fee), account_label: t(x.account_label), note: t(x.note), imported_at: now };
};
const COLS = ['row_id', 'family_id', 'owner', 'code', 'name', 'tax_month', 'invoice_no', 'invoice_date', 'receipt_no', 'receipt_date', 'type', 'service', 'fee', 'wht', 'other', 'total', 'paid', 'bank_fee', 'account_label', 'note', 'imported_at'];

export async function handleRevenueChart({ url, request, env, cors, authUserId, canUseAccount, deny }) {
  const p = url.pathname;
  if (!p.startsWith('/api/revenue-chart')) return null;
  await ensureRevenueTable(env);
  const user = await env.DB.prepare(`SELECT user_id, family_id FROM Users WHERE user_id=?`).bind(authUserId).first();
  if (!user) return deny('ไม่พบผู้ใช้');
  const fam = user.family_id;

  /* นำเข้า: ส่งเป็นชุด ≤ 300 แถว · reset=true ในชุดแรก = ลบแถวเดิมที่ยังไม่ถูกใช้ก่อน */
  if (p === '/api/revenue-chart/import' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const list = Array.isArray(b.rows) ? b.rows.slice(0, 300) : [];
    if (b.reset) await env.DB.prepare(`DELETE FROM RevenueChart WHERE family_id=? AND matched_tx IS NULL`).bind(fam).run();
    const now = new Date().toISOString(), ops = [];
    for (const x of list) {
      const c = cleanRow(x, fam, now); if (!c.code) continue;
      ops.push(env.DB.prepare(`INSERT INTO RevenueChart (${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})
        ON CONFLICT(row_id) DO UPDATE SET ${COLS.filter(k => !['row_id', 'family_id'].includes(k)).map(k => `${k}=excluded.${k}`).join(', ')} WHERE RevenueChart.family_id = excluded.family_id`)
        .bind(...COLS.map(k => c[k])));
    }
    for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
    return json({ success: true, saved: ops.length }, cors);
  }

  if (p === '/api/revenue-chart/summary' && request.method === 'GET') {
    const s = await env.DB.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN matched_tx IS NOT NULL THEN 1 ELSE 0 END) used, MIN(tax_month) first, MAX(tax_month) last FROM RevenueChart WHERE family_id=?`).bind(fam).first();
    const owners = ((await env.DB.prepare(`SELECT owner, COUNT(*) n FROM RevenueChart WHERE family_id=? GROUP BY owner ORDER BY n DESC`).bind(fam).all()).results) || [];
    const labels = ((await env.DB.prepare(`SELECT account_label, COUNT(*) n FROM RevenueChart WHERE family_id=? AND account_label IS NOT NULL GROUP BY account_label ORDER BY n DESC`).bind(fam).all()).results) || [];
    const om = await rules(env, fam, 'REV_OWNER'), am = await rules(env, fam, 'REV_ACCOUNT'), st = await rules(env, fam, 'REV_SETTING');
    return json({ count: s?.n || 0, used: s?.used || 0, first: s?.first, last: s?.last,
      owners: owners.map(o => ({ ...o, entity_id: om.get(o.owner || '') || null })), accounts: labels.map(l => ({ ...l, account_id: am.get(l.account_label) || null })),
      advance_category_id: st.get('advance_category') || null }, cors);
  }

  if (p === '/api/revenue-chart/map' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const kind = { OWNER: 'REV_OWNER', ACCOUNT: 'REV_ACCOUNT', SETTING: 'REV_SETTING' }[b.kind];
    if (!kind || !b.key) return json({ error: 'ต้องระบุ kind และ key' }, cors, 400);
    if (kind === 'REV_ACCOUNT' && b.value && !(await canUseAccount(b.value))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    if (kind === 'REV_OWNER' && b.value && !(await env.DB.prepare(`SELECT 1 FROM UserPermissions WHERE user_id=? AND entity_id=?`).bind(authUserId, b.value).first())) return deny('ไม่มีสิทธิ์ใช้บริษัทนี้');
    await setRule(env, fam, kind, String(b.key).slice(0, 100), b.value || null);
    return json({ success: true }, cors);
  }

  /* เสนอแถวผังรายได้ให้เงินเข้าที่รอตรวจ (ส่งรหัสรายการมาได้ ≤ 80 รายการ) */
  if (p === '/api/revenue-chart/suggest' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const ids = [...new Set((b.transaction_ids || []).map(String))].slice(0, 80);
    if (!ids.length) return json({ suggestions: {} }, cors);
    const txs = ((await env.DB.prepare(`SELECT t.transaction_id, t.account_id, substr(t.date,1,10) date, t.total_amount amount, t.statement_desc FROM Transactions t
        JOIN Accounts a ON a.account_id=t.account_id JOIN UserPermissions up ON up.entity_id=a.entity_id AND up.user_id=?
        WHERE t.status='PENDING_REVIEW' AND t.total_amount > 0 AND t.transaction_id IN (${ids.map(() => '?').join(',')})`).bind(authUserId, ...ids).all()).results) || [];
    if (!txs.length) return json({ suggestions: {} }, cors);
    const minD = txs.reduce((m, t) => t.date < m ? t.date : m, '9999'), maxD = txs.reduce((m, t) => t.date > m ? t.date : m, '0000');
    const shift = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
    const rowsAll = ((await env.DB.prepare(`SELECT * FROM RevenueChart WHERE family_id=? AND matched_tx IS NULL
        AND (COALESCE(receipt_date, invoice_date, tax_month) IS NULL OR COALESCE(receipt_date, invoice_date, tax_month) BETWEEN ? AND ?)`).bind(fam, shift(minD, -120), shift(maxD, 120)).all()).results) || [];
    const am = await rules(env, fam, 'REV_ACCOUNT');
    const out = {};
    for (const t of txs) {
      const m = matchRevenue(t, rowsAll, l => am.get(l || '') || null).filter(x => x.score >= 50);
      if (m.length) out[t.transaction_id] = m.map(x => ({ score: x.score, gap: x.gap, rows: x.rows.map(r => ({ row_id: r.row_id, code: r.code, name: r.name, owner: r.owner, type: r.type,
        service: r.service, tax_month: r.tax_month, receipt_date: r.receipt_date, fee: r.fee, wht: r.wht, other: r.other, total: r.total, paid: r.paid })) }));
    }
    return json({ suggestions: out }, cors);
  }

  /* ใช้แถวที่เลือกกับรายการรอตรวจ → แตกบรรทัดใหม่ (ยังรอตรวจ) + จองแถว (matched_tx) · คู่ค้าที่ยังไม่มี → สร้างตามชื่อลูกค้า */
  if (p === '/api/revenue-chart/apply' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const tx = await env.DB.prepare(`SELECT transaction_id, account_id, total_amount, status FROM Transactions WHERE transaction_id=?`).bind(String(b.transaction_id || '')).first();
    if (!tx || !(await canUseAccount(tx.account_id))) return json({ error: 'ไม่พบรายการ' }, cors, 404);
    if (tx.status !== 'PENDING_REVIEW') return json({ error: 'รายการยืนยันแล้ว — แก้ในหน้าประวัติ' }, cors, 409);
    const ids = [...new Set((b.row_ids || []).map(String))].slice(0, 8);
    if (!ids.length) return json({ error: 'เลือกแถวผังรายได้ก่อน' }, cors, 400);
    const rows = ((await env.DB.prepare(`SELECT * FROM RevenueChart WHERE family_id=? AND row_id IN (${ids.map(() => '?').join(',')})`).bind(fam, ...ids).all()).results) || [];
    if (rows.length !== ids.length) return json({ error: 'ไม่พบแถวผังรายได้บางแถว' }, cors, 404);
    if (rows.some(r => r.matched_tx && r.matched_tx !== tx.transaction_id)) return json({ error: 'มีแถวที่ถูกใช้กับรายการอื่นแล้ว' }, cors, 409);
    const sum = r2(rows.reduce((s, r) => s + r2(r.total), 0)), gap = r2(Number(tx.total_amount) - sum);
    if (gap > 0.005 || gap < -50) return json({ error: `ยอดรวมแถวที่เลือก ${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })} ไม่ตรงกับเงินเข้า`, status: 400 }, cors, 400);
    const cats = new Set(((await env.DB.prepare(`SELECT category_id FROM Categories WHERE family_id=? OR family_id IS NULL`).bind(fam).all()).results || []).map(c => c.category_id));
    const om = await rules(env, fam, 'REV_OWNER'), st = await rules(env, fam, 'REV_SETTING');
    const adv = st.get('advance_category'); const advanceCategory = adv && cats.has(adv) ? adv : null;
    /* คู่ค้า: ชื่อตรง (ตัดคำนำหน้า) → ใช้เดิม · ไม่มี → สร้างใหม่ */
    /* North 2026-10-30: เปลี่ยนชื่อคู่ค้าในตั้งค่า → เปลี่ยนตามทุกรายการ (รายการเก็บรหัสคู่ค้า ไม่ได้เก็บชื่อ)
       จึงจำ "รหัสลูกค้า (Code) → คู่ค้า" ไว้ (REV_CONTACT) — เปลี่ยนชื่อแล้วยังผูกคู่ค้าเดิม ไม่สร้างซ้ำ */
    const contacts = ((await env.DB.prepare(`SELECT contact_id, name FROM Contacts WHERE family_id=?`).bind(fam).all()).results) || [];
    const cm = await rules(env, fam, 'REV_CONTACT');
    const contactByCode = {};
    for (const r of rows) {
      if (contactByCode[r.code]) continue;
      const known = cm.get(r.code);
      if (known && contacts.some(c => c.contact_id === known)) { contactByCode[r.code] = known; continue; }
      const hit = contacts.find(c => norm(c.name) && norm(c.name) === norm(r.name));
      if (hit) contactByCode[r.code] = hit.contact_id;
      else if (r.name) {
        const id = `CT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
        await env.DB.prepare(`INSERT INTO Contacts (contact_id, family_id, name, contact_type) VALUES (?,?,?,?)`).bind(id, fam, String(r.name).slice(0, 200), 'CUSTOMER').run();
        contacts.push({ contact_id: id, name: r.name }); contactByCode[r.code] = id;
      }
      if (contactByCode[r.code]) await setRule(env, fam, 'REV_CONTACT', r.code, contactByCode[r.code]);
    }
    const lines = linesFromRows(rows, { categories: cats, ownerEntity: o => om.get(o || '') || null, contactOf: c => contactByCode[c], advanceCategory, bankFee: -gap });
    const keep = await planSettlementKeep(env, tx.transaction_id, lines);
    if (keep.error) return json({ error: keep.error }, cors, keep.status || 400);
    const ops = [env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id=?`).bind(tx.transaction_id)];
    for (const d of lines) ops.push(env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, contact_id, project_id, note, entity_id, type)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind('DT-' + Math.random().toString(36).slice(2, 11), tx.transaction_id, d.amount, d.fee || 0, d.wht || 0, d.category_id, d.contact_id, null, d.note, d.entity_id, d.type));
    ops.push(...keep.ops);
    ops.push(env.DB.prepare(`UPDATE RevenueChart SET matched_tx=NULL WHERE family_id=? AND matched_tx=?`).bind(fam, tx.transaction_id));
    for (const r of rows) ops.push(env.DB.prepare(`UPDATE RevenueChart SET matched_tx=? WHERE row_id=? AND family_id=?`).bind(tx.transaction_id, r.row_id, fam));
    await env.DB.batch(ops);
    return json({ success: true, lines: lines.length, advance_category_set: !!advanceCategory }, cors);
  }
  return json({ error: 'Not Found' }, cors, 404);
}
