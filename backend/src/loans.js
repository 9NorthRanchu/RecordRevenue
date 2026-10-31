// ═══════════════════════════════════════════════════════════════════════
// 💸 หนี้สินที่ติดตาม (2026-10-31 · North: "หนี้บ้าน หนี้รถ มีบันทึกดอกเบี้ยจ่าย · หนี้อื่นที่ต้องการ monitor · ผูกกับ category ได้")
//  ใช้ทะเบียน Debts เดิม + เพิ่มคอลัมน์: kind (HOME/CAR/OTHER) · lender · original_amount · interest_rate · rate_type (REDUCING/FLAT)
//   · term_months · due_day · asset_ref · note  (entity_id มีอยู่แล้ว = Company เจ้าของหนี้ → ใช้กำหนดว่าใครเห็น)
//  จับการจ่าย: บรรทัดย่อยที่ยืนยันแล้ว ในหมวดเงินต้น/ดอกเบี้ย (+ คู่ค้า ถ้าระบุ · ถ้าไม่ระบุคู่ค้า ใช้หมวดอย่างเดียว ควรเป็นหมวดเฉพาะหนี้นั้น)
//  GET  /api/loans/overview → สัญญา + งวดถัดไป + ดอกเบี้ย/เงินต้นปีนี้ + กำหนดจ่าย 60 วัน + ลดหย่อนดอกเบี้ยบ้าน
//  POST /api/loans/save · POST /api/loans/close (ปิดหนี้ / เปิดใหม่)
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const iso = d => d.toISOString().slice(0, 10);
const today0 = () => iso(new Date(Date.now() + 7 * 3600e3));
const dueIn = (y, m, day) => { const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return iso(new Date(Date.UTC(y, m, Math.min(day, last)))); };
const COLS = [['kind', 'TEXT'], ['lender', 'TEXT'], ['original_amount', 'REAL'], ['interest_rate', 'REAL'], ['rate_type', 'TEXT'], ['term_months', 'INTEGER'], ['due_day', 'INTEGER'], ['asset_ref', 'TEXT'], ['note', 'TEXT'], ['closed_date', 'TEXT'], ['entity_id', 'TEXT'], ['members', 'TEXT'], ['status', "TEXT DEFAULT 'active'"], ['created_at', 'TEXT']];
let ready = false;
export async function ensureDebtCols(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS Debts (debt_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT, contact_id TEXT, principal_category_id TEXT, interest_category_id TEXT,
    start_balance REAL, installment_amount REAL, start_date TEXT, icon_type TEXT)`).run();
  const have = new Set((((await env.DB.prepare(`PRAGMA table_info(Debts)`).all()).results) || []).map(c => c.name));
  for (const [c, t] of COLS) if (!have.has(c)) await env.DB.prepare(`ALTER TABLE Debts ADD COLUMN ${c} ${t}`).run();
  ready = true;
}
async function scopeOf(env, userId) {
  const u = await env.DB.prepare(`SELECT user_id, family_id, role FROM Users WHERE user_id = ?`).bind(userId).first();
  if (!u) return null;
  const ents = new Set((((await env.DB.prepare(`SELECT entity_id FROM UserPermissions WHERE user_id = ?`).bind(userId).all()).results) || []).map(r => r.entity_id));
  return { ...u, ents, admin: u.role === 'admin' };
}
/* ใครเห็น: ผู้ดูแลเห็นทั้งหมด · คนอื่น: Company ของหนี้อยู่ในสิทธิ์ (หรือไม่ระบุ Company) และรายชื่อสมาชิก (ถ้ากำหนด) มีตัวเอง */
function canSee(d, s) {
  if (s.admin) return true;
  if (d.entity_id && !s.ents.has(d.entity_id)) return false;
  if (!d.members) return true;
  try { const m = JSON.parse(d.members); return !Array.isArray(m) || !m.length || m.includes(s.user_id); } catch { return true; }
}
async function lines(env, d, allowedEnts) {
  const cats = [d.principal_category_id, d.interest_category_id].filter(Boolean);
  if (!cats.length) return [];
  const ph = cats.map(() => '?').join(','), args = [...cats];
  let where = `d.category_id IN (${ph}) AND t.status = 'CONFIRMED' AND d.detail_id NOT LIKE 'DT-OB-%'`;
  if (d.contact_id) { where += ' AND d.contact_id = ?'; args.push(d.contact_id); }
  if (d.start_date) { where += ' AND t.date >= ?'; args.push(d.start_date); }
  if (allowedEnts) { where += ` AND a.entity_id IN (${allowedEnts.map(() => '?').join(',') || "''"})`; args.push(...allowedEnts); }
  return ((await env.DB.prepare(`SELECT t.transaction_id, substr(t.date,1,10) AS date, a.name AS account_name, d.amount, d.category_id, d.note, t.statement_desc
      FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id JOIN Accounts a ON a.account_id = t.account_id
      WHERE ${where} ORDER BY t.date, t.transaction_id`).bind(...args).all()).results) || [];
}
export function loanSummary(d, ls, today = today0()) {
  const sameCat = d.interest_category_id && d.interest_category_id === d.principal_category_id;
  const sign = d.type === 'RECEIVABLE' ? 1 : -1, year = today.slice(0, 4);
  let paid = 0, interest = 0, yP = 0, yI = 0;
  for (const l of ls) {
    const isP = l.category_id === d.principal_category_id, isI = !sameCat && l.category_id === d.interest_category_id, v = sign * l.amount;
    if (isP) { paid += v; if (l.date.startsWith(year)) yP += v; } else if (isI) { interest += Math.abs(l.amount); if (l.date.startsWith(year)) yI += Math.abs(l.amount); }
  }
  const start = Number(d.start_balance) || 0, outstanding = r2(start - paid), orig = Number(d.original_amount) || start;
  const inst = Number(d.installment_amount) || 0, term = Number(d.term_months) || 0;
  /* งวด: จำนวนงวดที่จ่ายแล้ว ≈ จำนวนเดือนที่มีการจ่ายเงินต้น · งวดถัดไปจาก due_day */
  const paidMonths = new Set(ls.filter(l => l.category_id === d.principal_category_id).map(l => l.date.slice(0, 7))).size;
  const lastPay = ls.length ? ls[ls.length - 1].date : null;
  let next = null, status = null, days = null;
  if (d.due_day && outstanding > 0.005 && d.status !== 'closed') {
    /* งวดถือว่าจ่ายแล้ว เมื่อมีการจ่ายในช่วง 20 วันก่อน ถึง 10 วันหลังวันครบกำหนด */
    const [y, m] = today.split('-').map(Number);
    const thisDue = dueIn(y, m - 1, d.due_day), prevDue = dueIn(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, d.due_day), nextDue = dueIn(m === 12 ? y + 1 : y, m === 12 ? 0 : m, d.due_day);
    const add = (s, k) => iso(new Date(Date.parse(s) + k * 864e5));
    const paid = due => ls.some(l => l.date > add(due, -20) && l.date <= add(due, 10));
    const started = due => !d.start_date || due >= d.start_date;
    if (paid(thisDue)) { next = nextDue; status = 'PAID'; }
    else if (today > thisDue) { next = thisDue; status = 'OVERDUE'; }
    else if (started(prevDue) && !paid(prevDue) && ls.length) { next = prevDue; status = 'OVERDUE'; }
    else { next = thisDue; status = 'UPCOMING'; }
    days = Math.round((Date.parse(next) - Date.parse(today)) / 864e5);
    if (status === 'UPCOMING' && days <= 7) status = 'DUE_SOON';
  }
  return { paid_principal: r2(paid), interest_total: r2(interest), year_principal: r2(yP), year_interest: r2(yI), outstanding, original: r2(orig),
    progress: orig > 0 ? Math.min(100, Math.max(0, Math.round((orig - outstanding) / orig * 100))) : 0, paid_installments: paidMonths, term_months: term || null,
    installments_left: inst > 0 && outstanding > 0 ? Math.ceil(outstanding / inst - 1e-9) : null, last_payment: lastPay, payments: ls.length,
    next_due: next, days_to_due: days, due_status: status, same_category: !!sameCat };
}
/* ประมาณเงินต้น/ดอกเบี้ยของงวด: ลดต้นลดดอก = คงเหลือ × อัตรา/12 · flat = ยอดกู้ × อัตรา/12 */
export function splitInstallment(d, outstanding) {
  const inst = Number(d.installment_amount) || 0, rate = Number(d.interest_rate) || 0;
  if (!inst) return null;
  const base = d.rate_type === 'FLAT' ? (Number(d.original_amount) || Number(d.start_balance) || 0) : Math.max(0, outstanding);
  const interest = r2(Math.min(inst, base * rate / 100 / 12));
  return { installment: r2(inst), interest, principal: r2(inst - interest) };
}

export async function handleLoans({ url, request, env, cors, authUserId }) {
  const p = url.pathname;
  if (!p.startsWith('/api/loans/')) return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  await ensureDebtCols(env);
  const s = await scopeOf(env, authUserId); if (!s) return json({ error: 'Unauthorized' }, cors, 401);
  const ents = [...s.ents];

  if (p === '/api/loans/overview' && request.method === 'GET') {
    const today = today0();
    const debts = ((((await env.DB.prepare(`SELECT * FROM Debts WHERE family_id = ? AND IFNULL(status,'active') != 'deleted' ORDER BY name`).bind(s.family_id).all()).results) || [])).filter(d => canSee(d, s));
    const cons = new Map((((await env.DB.prepare(`SELECT contact_id, name FROM Contacts WHERE family_id = ?`).bind(s.family_id).all()).results) || []).map(c => [c.contact_id, c.name]));
    const cats = new Map((((await env.DB.prepare(`SELECT category_id, name FROM Categories WHERE family_id = ? OR family_id IS NULL`).bind(s.family_id).all()).results) || []).map(c => [c.category_id, c.name]));
    const entN = new Map((((await env.DB.prepare(`SELECT entity_id, name FROM Entities WHERE family_id = ?`).bind(s.family_id).all()).results) || []).map(e => [e.entity_id, e.name]));
    const loans = [];
    for (const d of debts) {
      const sm = loanSummary(d, await lines(env, d, s.admin ? null : ents), today);
      loans.push({ debt_id: d.debt_id, name: d.name, type: d.type || 'PAYABLE', kind: d.kind || (d.type === 'RECEIVABLE' ? 'LEND' : 'OTHER'), status: d.status || 'active', lender: d.lender || null,
        contact_id: d.contact_id, contact_name: cons.get(d.contact_id) || null, principal_category_id: d.principal_category_id, principal_category: cats.get(d.principal_category_id) || null,
        interest_category_id: d.interest_category_id, interest_category: cats.get(d.interest_category_id) || null, entity_id: d.entity_id, entity_name: entN.get(d.entity_id) || null,
        start_balance: r2(d.start_balance), start_date: d.start_date, installment_amount: d.installment_amount != null ? r2(d.installment_amount) : null,
        interest_rate: d.interest_rate, rate_type: d.rate_type || (d.kind === 'CAR' ? 'FLAT' : 'REDUCING'), term_months: d.term_months, due_day: d.due_day, asset_ref: d.asset_ref, note: d.note, closed_date: d.closed_date,
        ...sm, next_split: splitInstallment(d, sm.outstanding) });
    }
    const act = loans.filter(l => l.status !== 'closed' && l.type === 'PAYABLE');
    /* กำหนดจ่าย 60 วัน */
    const until = iso(new Date(Date.parse(today) + 60 * 864e5)), schedule = [];
    for (const l of act) {
      if (!l.due_day || !l.installment_amount || l.outstanding <= 0) continue;
      let [y, m] = (l.next_due || today).split('-').map(Number); let bal = l.outstanding;
      for (let k = 0; k < 3; k++) {
        const due = dueIn(y, m - 1, l.due_day); if (due > until) break;
        const sp = splitInstallment({ ...l, start_balance: l.start_balance, original_amount: l.original }, bal) || { installment: l.installment_amount, interest: 0, principal: l.installment_amount };
        schedule.push({ date: due, debt_id: l.debt_id, name: l.name, kind: l.kind, ...sp }); bal = r2(bal - sp.principal);
        m += 1; if (m > 12) { m = 1; y += 1; }
      }
    }
    schedule.sort((a, b) => a.date.localeCompare(b.date));
    const homeInterest = r2(act.filter(l => l.kind === 'HOME').reduce((t, l) => t + l.year_interest, 0));
    const totals = { outstanding: r2(act.reduce((t, l) => t + Math.max(0, l.outstanding), 0)), monthly: r2(act.reduce((t, l) => t + (l.installment_amount || 0), 0)),
      year_interest: r2(act.reduce((t, l) => t + l.year_interest, 0)), home_interest: homeInterest, home_interest_deductible: Math.min(100000, homeInterest),
      receivable: r2(loans.filter(l => l.type === 'RECEIVABLE' && l.status !== 'closed').reduce((t, l) => t + Math.max(0, l.outstanding), 0)),
      next_due: act.map(l => l.next_due).filter(Boolean).sort()[0] || null, count: act.length };
    return json({ today, loans, schedule, totals }, cors);
  }

  if (p === '/api/loans/save' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) return json({ error: 'ต้องมีชื่อหนี้' }, cors, 400);
    if (!b.principal_category_id) return json({ error: 'เลือกหมวดเงินต้น (ใช้นับว่าจ่ายไปแล้วเท่าไร)' }, cors, 400);
    const startBal = Number(b.start_balance); if (!(startBal > 0)) return json({ error: 'ยอดหนี้ตั้งต้นต้องมากกว่า 0' }, cors, 400);
    if (b.entity_id && !s.admin && !s.ents.has(b.entity_id)) return json({ error: 'ไม่มีสิทธิ์ใน Company นี้' }, cors, 403);
    const n = v => v === '' || v == null || !isFinite(+v) ? null : +v;
    const vals = { name, type: b.type === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE', kind: ['HOME', 'CAR', 'OTHER', 'LEND'].includes(b.kind) ? b.kind : 'OTHER', lender: String(b.lender || '').slice(0, 80) || null,
      contact_id: b.contact_id || null, principal_category_id: b.principal_category_id, interest_category_id: b.interest_category_id || null, start_balance: startBal, start_date: /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : null,
      original_amount: n(b.original_amount), interest_rate: n(b.interest_rate), rate_type: b.rate_type === 'FLAT' ? 'FLAT' : 'REDUCING', term_months: n(b.term_months), installment_amount: n(b.installment_amount),
      due_day: n(b.due_day) && +b.due_day >= 1 && +b.due_day <= 31 ? Math.round(+b.due_day) : null, entity_id: b.entity_id || null, asset_ref: String(b.asset_ref || '').slice(0, 80) || null, note: String(b.note || '').slice(0, 300) || null };
    if (b.debt_id) {
      const old = await env.DB.prepare(`SELECT * FROM Debts WHERE debt_id = ? AND family_id = ?`).bind(b.debt_id, s.family_id).first();
      if (!old || !canSee(old, s)) return json({ error: 'ไม่พบหนี้นี้' }, cors, 404);
      const keys = Object.keys(vals);
      await env.DB.prepare(`UPDATE Debts SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE debt_id = ? AND family_id = ?`).bind(...keys.map(k => vals[k]), b.debt_id, s.family_id).run();
      return json({ success: true, debt_id: b.debt_id }, cors);
    }
    const id = 'DBT' + Date.now(), keys = Object.keys(vals);
    await env.DB.prepare(`INSERT INTO Debts (debt_id, family_id, ${keys.join(', ')}, icon_type, status, created_at) VALUES (?, ?, ${keys.map(() => '?').join(', ')}, ?, 'active', ?)`)
      .bind(id, s.family_id, ...keys.map(k => vals[k]), 'zodiac_1.png', new Date().toISOString()).run();
    return json({ success: true, debt_id: id }, cors);
  }

  if (p === '/api/loans/detail' && request.method === 'GET') {
    const d = await env.DB.prepare(`SELECT * FROM Debts WHERE debt_id = ? AND family_id = ?`).bind(url.searchParams.get('id') || '', s.family_id).first();
    if (!d || !canSee(d, s)) return json({ error: 'ไม่พบหนี้นี้' }, cors, 404);
    const ls = await lines(env, d, s.admin ? null : ents), sign = d.type === 'RECEIVABLE' ? 1 : -1;
    let left = Number(d.start_balance) || 0;
    const rows = ls.map(l => { const isP = l.category_id === d.principal_category_id; if (isP) left = r2(left - sign * l.amount); return { ...l, kind: isP ? 'PRINCIPAL' : 'INTEREST', balance_after: isP ? left : null }; });
    return json({ debt_id: d.debt_id, name: d.name, lines: rows.reverse(), ...loanSummary(d, ls) }, cors);
  }
  if (p === '/api/loans/close' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const old = await env.DB.prepare(`SELECT * FROM Debts WHERE debt_id = ? AND family_id = ?`).bind(String(b.debt_id || ''), s.family_id).first();
    if (!old || !canSee(old, s)) return json({ error: 'ไม่พบหนี้นี้' }, cors, 404);
    const reopen = !!b.reopen;
    await env.DB.prepare(`UPDATE Debts SET status = ?, closed_date = ? WHERE debt_id = ?`).bind(reopen ? 'active' : 'closed', reopen ? null : (b.date || today0()), old.debt_id).run();
    return json({ success: true }, cors);
  }
  return null;
}
