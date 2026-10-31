// ═══════════════════════════════════════════════════════════════════════
// 🛡️ ประกัน (v259 · 2026-11-01 · North เลือกแบบ ก จาก mockup ins.png)
//  "บันทึกประกันของบุคคล และประกันทรัพย์สิน เพื่อ monitor เบี้ยที่ต้องชำระ วันครบกำหนด หมดอายุเมื่อไร ต้องจ่ายถึงเมื่อไร"
//  กรมธรรม์: kind PERSON/ASSET · บริษัท · เลขกรมธรรม์ · ผู้เอาประกัน / ทรัพย์สินที่ผูก · ทุน · เบี้ย/งวด · ความถี่ (ปี/ครึ่งปี/ไตรมาส/เดือน/ครั้งเดียว)
//    · งวดแรก/วันครบกำหนดอ้างอิง · จ่ายถึง · คุ้มครองตั้งแต่-ถึง · ประเภทลดหย่อน (ชีวิต/สุขภาพ/สุขภาพพ่อแม่/บำนาญ/ไม่ลดหย่อน)
//    · หมวดค่าเบี้ย (+ คู่ค้า) → จับคู่รายการจ่ายที่ยืนยันแล้วอัตโนมัติ (ยอดต่างไม่เกิน 3%) → งวดที่จ่ายแล้ว / เลยกำหนด / ใกล้ครบ
//  GET /api/insurance/overview · POST /api/insurance/save · /close {policy_id, reopen?} · /delete {policy_id}
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const today0 = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const DAY = 864e5, days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const PER_YEAR = { YEAR: 1, HALF: 2, QUARTER: 4, MONTH: 12, SINGLE: 0 };
export const addMonths = (d, m) => { const [y, mo, da] = d.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + m, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(da, last)).padStart(2, '0')}`; };
const COLS = ['policy_id TEXT PRIMARY KEY', 'family_id TEXT NOT NULL', 'kind TEXT', 'name TEXT NOT NULL', 'insurer TEXT', 'policy_no TEXT', 'insured TEXT', 'asset_id TEXT',
  'sum_insured REAL', 'premium REAL', 'pay_freq TEXT', 'first_due TEXT', 'pay_until TEXT', 'cover_start TEXT', 'cover_end TEXT', 'cover_note TEXT', 'tax_type TEXT',
  'category_id TEXT', 'contact_id TEXT', 'entity_id TEXT', 'note TEXT', 'status TEXT', 'created_by TEXT', 'created_at TEXT', 'updated_at TEXT'];
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS InsurancePolicies (${COLS.join(', ')})`).run();
  ready = true;
}

/* จับคู่รายการจ่ายกับกรมธรรม์: หมวดเดียวกัน (+ คู่ค้าถ้าระบุ) · ยอด ≈ เบี้ยต่องวด (±3% หรือ 1 บาท) · 1 รายการ = 1 กรมธรรม์ (ยอดใกล้สุดก่อน) */
export function matchPayments(policies, pays) {
  const by = new Map(policies.map(p => [p.policy_id, []]));
  const cand = [];
  for (const p of policies) {
    const inst = Number(p.premium) || 0; if (!p.category_id || !(inst > 0)) continue;
    for (const x of pays) if (x.category_id === p.category_id && (!p.contact_id || x.contact_id === p.contact_id)) {
      const diff = Math.abs(Math.abs(x.amount) - inst); if (diff <= Math.max(1, inst * 0.03)) cand.push({ p, x, diff });
    }
  }
  cand.sort((a, b) => a.diff - b.diff);
  const used = new Set();
  for (const c of cand) { if (used.has(c.x.detail_id)) continue; used.add(c.x.detail_id); by.get(c.p.policy_id).push(c.x); }
  for (const l of by.values()) l.sort((a, b) => a.date.localeCompare(b.date));
  return by;
}
/* งวดเบี้ย: หางวดปัจจุบัน (ครบกำหนดไม่เก่ากว่า "ครึ่งงวด" จากวันนี้) · จ่ายแล้ว = มีรายการในช่วง ±ครึ่งงวด (ไม่เกิน 45 วัน) ของวันครบกำหนด */
export function premiumStatus(p, pays, today = today0()) {
  const per = PER_YEAR[p.pay_freq] ?? 1, out = { due: null, due_status: null, paid_date: null, days_left: null, schedule: [] };
  if (!per || !isDate(p.first_due) || !(Number(p.premium) > 0)) return out;
  const step = 12 / per, win = Math.min(45, Math.round(step * 15)), until = isDate(p.pay_until) ? p.pay_until : null;
  const paidFor = due => pays.find(x => Math.abs(days(due, x.date)) <= win);
  let k = 0, due = p.first_due;
  while (days(due, today) > win && k < 1200) { k++; due = addMonths(p.first_due, k * step); }
  if (until && due > until) { out.due_status = 'PAID_UP'; return out; }
  const hit = paidFor(due);
  if (hit) { out.paid_date = hit.date; out.due_status = 'PAID'; out.paid_due = due; k++; due = addMonths(p.first_due, k * step); }
  if (until && due > until) { out.due = null; if (!hit) out.due_status = 'PAID_UP'; return out; }
  out.due = due; out.days_left = days(today, due);
  if (!hit) out.due_status = out.days_left < 0 ? 'OVERDUE' : out.days_left <= 30 ? 'DUE_SOON' : 'UPCOMING';
  else if (out.days_left <= 30) out.due_status = 'DUE_SOON';
  /* ปฏิทิน 12 เดือนข้างหน้า (งวดที่ยังไม่จ่าย) */
  const end = addMonths(today, 12);
  for (let j = 0, d = out.due; d && d <= end && j < 60; j++, d = addMonths(p.first_due, (k + j) * step)) { if (until && d > until) break; if (j === 0 && hit && d === out.paid_due) continue; out.schedule.push(d); }
  return out;
}
/* ลดหย่อนภาษี (ประมวลรัษฎากร): สุขภาพ ≤ 25,000 · ชีวิต + สุขภาพ ≤ 100,000 · สุขภาพพ่อแม่ ≤ 15,000 · บำนาญ ≤ 200,000 */
export function taxDeduction(sums) {
  const health = Math.min(sums.HEALTH || 0, 25000), life = Math.min(sums.LIFE || 0, 100000 - health);
  const parent = Math.min(sums.HEALTH_PARENT || 0, 15000), pension = Math.min(sums.PENSION || 0, 200000);
  return { life: r2(life), health: r2(health), parent: r2(parent), pension: r2(pension), total: r2(life + health + parent + pension) };
}

async function scopeOf(env, userId) {
  const u = await env.DB.prepare(`SELECT user_id, family_id, role FROM Users WHERE user_id = ?`).bind(userId).first();
  if (!u) return null;
  const ents = new Set((((await env.DB.prepare(`SELECT entity_id FROM UserPermissions WHERE user_id = ?`).bind(userId).all()).results) || []).map(r => r.entity_id));
  return { ...u, ents, admin: u.role === 'admin' };
}
const canSee = (p, s) => s.admin || !p.entity_id || s.ents.has(p.entity_id);

export async function handleInsurance({ url, request, env, cors, authUserId }) {
  const path = url.pathname;
  if (!path.startsWith('/api/insurance/')) return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  await ensure(env);
  const s = await scopeOf(env, authUserId); if (!s) return json({ error: 'Unauthorized' }, cors, 401);

  if (path === '/api/insurance/overview' && request.method === 'GET') {
    const today = today0(), year = today.slice(0, 4);
    const all = ((((await env.DB.prepare(`SELECT * FROM InsurancePolicies WHERE family_id = ? AND IFNULL(status,'active') != 'deleted' ORDER BY name`).bind(s.family_id).all()).results) || [])).filter(p => canSee(p, s));
    const cats = [...new Set(all.map(p => p.category_id).filter(Boolean))];
    let pays = [];
    if (cats.length) pays = ((await env.DB.prepare(`SELECT d.detail_id, t.transaction_id, substr(t.date,1,10) AS date, ABS(d.amount) AS amount, d.category_id, d.contact_id
        FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id JOIN Accounts a ON a.account_id = t.account_id
        ${s.admin ? '' : 'JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?'}
        WHERE t.status = 'CONFIRMED' AND d.amount < 0 AND d.category_id IN (${cats.map(() => '?').join(',')}) AND substr(t.date,1,10) >= ?`)
      .bind(...(s.admin ? [] : [authUserId]), ...cats, `${+year - 2}-01-01`).all()).results) || [];
    const byPol = matchPayments(all.filter(p => p.status !== 'closed'), pays);
    const assetNames = new Map();
    try { for (const r of ((await env.DB.prepare(`SELECT asset_id, name FROM AssetItems WHERE family_id = ?`).bind(s.family_id).all()).results) || []) assetNames.set(r.asset_id, r.name); } catch { /* ยังไม่มีทะเบียน */ }
    const policies = [], calendar = [], taxSum = {}, taxEst = {};
    let annual = 0, due60 = 0, due60n = 0, exp90 = 0;
    for (const p of all) {
      const ps = byPol.get(p.policy_id) || [], st = p.status === 'closed' ? { due: null, due_status: null, schedule: [] } : premiumStatus(p, ps, today);
      const per = PER_YEAR[p.pay_freq] ?? 1, yearly = r2((Number(p.premium) || 0) * per);
      const coverLeft = isDate(p.cover_end) ? days(today, p.cover_end) : null;
      const cover_status = p.status === 'closed' ? 'CLOSED' : coverLeft == null ? 'ACTIVE' : coverLeft < 0 ? 'EXPIRED' : coverLeft <= 90 ? 'EXPIRING' : 'ACTIVE';
      const paidYear = r2(ps.filter(x => x.date.startsWith(year)).reduce((t, x) => t + Math.abs(x.amount), 0));
      if (p.status !== 'closed' && cover_status !== 'EXPIRED') {
        annual += yearly;
        if (cover_status === 'EXPIRING') exp90++;
        if (st.due && st.days_left <= 60 && st.due_status !== 'PAID') { due60 += Number(p.premium) || 0; due60n++; }
        for (const d of st.schedule) calendar.push({ date: d, policy_id: p.policy_id, name: p.name, insurer: p.insurer, amount: r2(p.premium) });
        if (p.tax_type && p.tax_type !== 'NONE') { taxSum[p.tax_type] = (taxSum[p.tax_type] || 0) + paidYear; taxEst[p.tax_type] = (taxEst[p.tax_type] || 0) + yearly; }
      }
      policies.push({ ...p, premium: r2(p.premium), sum_insured: p.sum_insured != null ? r2(p.sum_insured) : null, yearly, asset_name: assetNames.get(p.asset_id) || null,
        ...st, cover_status, cover_days_left: coverLeft, paid_year: paidYear, payments: ps.slice(-6).map(x => ({ date: x.date, amount: r2(x.amount), transaction_id: x.transaction_id })) });
    }
    calendar.sort((a, b) => a.date.localeCompare(b.date));
    return json({ today, policies, calendar, totals: { annual: r2(annual), count: policies.filter(p => p.status !== 'closed' && p.cover_status !== 'EXPIRED').length,
      due60: r2(due60), due60_n: due60n, expiring90: exp90, tax: taxDeduction(taxSum), tax_estimate: taxDeduction(taxEst) } }, cors);
  }

  if (path === '/api/insurance/save' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) return json({ error: 'ใส่ชื่อกรมธรรม์' }, cors, 400);
    if (b.entity_id && !s.admin && !s.ents.has(b.entity_id)) return json({ error: 'ไม่มีสิทธิ์ใน Company นี้' }, cors, 403);
    const old = b.policy_id ? await env.DB.prepare(`SELECT * FROM InsurancePolicies WHERE policy_id = ? AND family_id = ?`).bind(b.policy_id, s.family_id).first() : null;
    if (b.policy_id && (!old || !canSee(old, s))) return json({ error: 'ไม่พบกรมธรรม์' }, cors, 404);
    const num = v => v === '' || v == null || !isFinite(+v) ? null : r2(v), dt = v => isDate(v) ? v : null, tx = (v, n) => String(v ?? '').trim().slice(0, n) || null;
    const row = { kind: b.kind === 'ASSET' ? 'ASSET' : 'PERSON', name, insurer: tx(b.insurer, 80), policy_no: tx(b.policy_no, 60), insured: tx(b.insured, 80), asset_id: tx(b.asset_id, 80),
      sum_insured: num(b.sum_insured), premium: num(b.premium), pay_freq: PER_YEAR[b.pay_freq] !== undefined ? b.pay_freq : 'YEAR', first_due: dt(b.first_due), pay_until: dt(b.pay_until),
      cover_start: dt(b.cover_start), cover_end: dt(b.cover_end), cover_note: tx(b.cover_note, 80), tax_type: ['LIFE', 'HEALTH', 'HEALTH_PARENT', 'PENSION'].includes(b.tax_type) ? b.tax_type : 'NONE',
      category_id: tx(b.category_id, 80), contact_id: tx(b.contact_id, 80), entity_id: tx(b.entity_id, 80), note: tx(b.note, 300) };
    const now = new Date().toISOString(), keys = Object.keys(row);
    if (old) await env.DB.prepare(`UPDATE InsurancePolicies SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE policy_id = ?`).bind(...keys.map(k => row[k]), now, old.policy_id).run();
    else { const id = `INS-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await env.DB.prepare(`INSERT INTO InsurancePolicies (policy_id, family_id, ${keys.join(', ')}, status, created_by, created_at, updated_at) VALUES (?, ?, ${keys.map(() => '?').join(', ')}, 'active', ?, ?, ?)`)
        .bind(id, s.family_id, ...keys.map(k => row[k]), authUserId, now, now).run(); return json({ success: true, policy_id: id }, cors); }
    return json({ success: true, policy_id: old.policy_id }, cors);
  }
  if ((path === '/api/insurance/close' || path === '/api/insurance/delete') && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const p = await env.DB.prepare(`SELECT * FROM InsurancePolicies WHERE policy_id = ? AND family_id = ?`).bind(String(b.policy_id || ''), s.family_id).first();
    if (!p || !canSee(p, s)) return json({ error: 'ไม่พบกรมธรรม์' }, cors, 404);
    const st = path.endsWith('/delete') ? 'deleted' : b.reopen ? 'active' : 'closed';
    await env.DB.prepare(`UPDATE InsurancePolicies SET status = ?, updated_at = ? WHERE policy_id = ?`).bind(st, new Date().toISOString(), p.policy_id).run();
    return json({ success: true, status: st }, cors);
  }
  return null;
}
