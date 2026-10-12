// ═══════════════════════════════════════════════════════════════════════════
// บัตรเครดิต + เงินกู้/ผ่อนชำระ (2026-10-11)
//
// 💳 บัตรเครดิต — จากบัญชีประเภท CREDIT (ตั้ง วันตัดรอบ / วันครบกำหนด / วงเงิน ในหน้าตั้งค่า)
//    ยอดในระบบ: ใช้จ่ายด้วยบัตร = ลบ · จ่ายบัตร/คืนเงิน = บวก → ยอดติดลบ = เป็นหนี้บัตร
//    · ยอดตามรอบบิล  = หนี้ ณ วันตัดรอบล่าสุด (รวมวันนั้น)
//    · ต้องจ่ายอีก   = ยอดตามรอบบิล − ยอดที่จ่ายเข้าบัตรหลังวันตัดรอบ
//    · ใช้ไปรอบนี้    = ยอดใช้จ่ายหลังวันตัดรอบ (จะไปอยู่ในบิลถัดไป)
//    นับเฉพาะรายการที่ยืนยันแล้ว
//
// 🏦 เงินกู้/ผ่อน — ใช้ทะเบียน Debts เดิม (ชื่อ · เราเป็นหนี้/เขาเป็นหนี้เรา · คู่ค้า · หมวดเงินต้น/ดอกเบี้ย · ยอดตั้งต้น · วันเริ่ม · ค่างวด)
//    แก้สูตรเดิมที่กลับด้าน (หน้าเก่า: ยอดตั้งต้น − ผลรวมแบบมีเครื่องหมาย → จ่ายหนี้แล้วยอดหนี้ "เพิ่ม")
//    ใหม่:  เราเป็นหนี้ (PAYABLE)    ชำระแล้ว = −Σ เงินต้น (จ่ายออกเป็นลบ)
//           เขาเป็นหนี้เรา (RECEIVABLE) ชำระแล้ว = +Σ เงินต้น (รับเข้าเป็นบวก)
//           คงเหลือ = ยอดตั้งต้น − ชำระแล้ว
//    นับรายการที่ยืนยันแล้ว ของคู่ค้านั้น ในหมวดเงินต้น/ดอกเบี้ย ตั้งแต่วันเริ่ม (ไม่ระบุวันเริ่ม = ทั้งหมด)
//    เดิมหน้าเก่าดึงแค่ 500 รายการล่าสุดมาคิดในเบราว์เซอร์ → ยอดผิดเมื่อข้อมูลเยอะ · ตอนนี้คิดที่เซิร์ฟเวอร์ทั้งหมด
// ═══════════════════════════════════════════════════════════════════════════
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const iso = d => d.toISOString().slice(0, 10);
const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();               // m = 0..11
const dayIn = (y, m, day) => new Date(Date.UTC(y, m, Math.min(day, dim(y, m))));
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));
const bangkokToday = () => iso(new Date(Date.now() + 7 * 3600e3));

/* วันตัดรอบล่าสุดที่ ≤ วันนี้ และวันครบกำหนดของบิลนั้น */
export function cycleDates(today, statementDay, dueDay) {
  const t = new Date(today + 'T00:00:00Z');
  let y = t.getUTCFullYear(), m = t.getUTCMonth();
  let cut = dayIn(y, m, statementDay);
  if (iso(cut) > today) { m -= 1; if (m < 0) { m = 11; y -= 1; } cut = dayIn(y, m, statementDay); }
  let py = y, pm = m - 1; if (pm < 0) { pm = 11; py -= 1; }
  const prevCut = dayIn(py, pm, statementDay);
  let due = null;
  if (dueDay) {
    let dy = y, dm = m;
    due = dayIn(dy, dm, dueDay);
    if (iso(due) <= iso(cut)) { dm += 1; if (dm > 11) { dm = 0; dy += 1; } due = dayIn(dy, dm, dueDay); }
  }
  let ny = y, nm = m + 1; if (nm > 11) { nm = 0; ny += 1; }
  return { last_cut: iso(cut), prev_cut: iso(prevCut), next_cut: iso(dayIn(ny, nm, statementDay)), due: due ? iso(due) : null };
}

export async function listCards(env, user) {
  const today = env.__today || bangkokToday();   // __today ใช้ในเทสเท่านั้น
  const cards = (await env.DB.prepare(`SELECT a.account_id, a.name, a.bank_name, IFNULL(a.credit_limit,0) AS credit_limit, a.statement_day, a.due_day, a.entity_id
      FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id
     WHERE up.user_id = ? AND a.account_type = 'CREDIT' ORDER BY a.name`).bind(user.user_id).all()).results || [];
  const out = [];
  for (const c of cards) {
    const sum = async (extra, binds) => r2((await env.DB.prepare(`SELECT SUM(total_amount) AS s FROM Transactions WHERE account_id = ? AND status = 'CONFIRMED'${extra}`)
      .bind(c.account_id, ...binds).first())?.s);
    const balance = await sum('', []);
    const row = { account_id: c.account_id, name: c.name, bank_name: c.bank_name, credit_limit: r2(c.credit_limit), statement_day: c.statement_day, due_day: c.due_day,
      balance, owed: r2(Math.max(0, -balance)), available: c.credit_limit > 0 ? r2(c.credit_limit + Math.min(0, balance)) : null };
    const sd = Number(c.statement_day), dd = Number(c.due_day);
    if (!(sd >= 1 && sd <= 31)) { row.status = 'NO_CYCLE'; out.push(row); continue; }
    const cy = cycleDates(today, sd, dd >= 1 && dd <= 31 ? dd : null);
    const afterCut = addDays(cy.last_cut, 1);
    const atCut = await sum(' AND date < ?', [afterCut]);
    const paidSince = r2((await env.DB.prepare(`SELECT SUM(total_amount) AS s FROM Transactions WHERE account_id = ? AND status = 'CONFIRMED' AND date >= ? AND total_amount > 0`)
      .bind(c.account_id, afterCut).first())?.s);
    const spentSince = r2(-((await env.DB.prepare(`SELECT SUM(total_amount) AS s FROM Transactions WHERE account_id = ? AND status = 'CONFIRMED' AND date >= ? AND total_amount < 0`)
      .bind(c.account_id, afterCut).first())?.s || 0));
    const billed = r2(Math.max(0, -atCut));
    const dueLeft = r2(Math.max(0, billed - paidSince));
    const days = cy.due ? Math.round((Date.parse(cy.due) - Date.parse(today)) / 864e5) : null;
    Object.assign(row, cy, { billed, paid_since_cut: paidSince, due_left: dueLeft, spent_this_cycle: spentSince, days_to_due: days,
      status: !billed ? 'NO_BILL' : dueLeft < 0.005 ? 'PAID' : days == null ? 'UNPAID' : days < 0 ? 'OVERDUE' : days <= 7 ? 'DUE_SOON' : 'UPCOMING' });
    out.push(row);
  }
  const due = out.filter(c => ['OVERDUE', 'DUE_SOON'].includes(c.status));
  return { today, cards: out, totals: { owed: r2(out.reduce((s, c) => s + c.owed, 0)), due_left: r2(out.reduce((s, c) => s + (c.due_left || 0), 0)), alert_count: due.length } };
}

/* ── เงินกู้/ผ่อน ── */
async function visibleDebts(env, user) {
  let rows = [];
  try { rows = (await env.DB.prepare(`SELECT * FROM Debts WHERE family_id = ? AND IFNULL(status,'active') != 'deleted' ORDER BY name`).bind(user.family_id).all()).results || []; }
  catch { return []; }
  return rows.filter(d => { if (!d.members) return true; try { const m = JSON.parse(d.members); return !Array.isArray(m) || !m.length || m.includes(user.user_id); } catch { return true; } });
}
async function debtLines(env, d) {
  const cats = [d.principal_category_id, d.interest_category_id].filter(Boolean);
  if (!cats.length || !d.contact_id) return [];
  return (await env.DB.prepare(`SELECT t.transaction_id, t.date, t.account_id, a.name AS account_name, d.detail_id, d.amount, d.category_id, d.note, t.statement_desc
      FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id JOIN Accounts a ON a.account_id = t.account_id
     WHERE d.contact_id = ? AND d.category_id IN (${cats.map(() => '?').join(',')}) AND t.status = 'CONFIRMED' AND d.detail_id NOT LIKE 'DT-OB-%'${d.start_date ? ' AND t.date >= ?' : ''}
     ORDER BY t.date, t.transaction_id`).bind(d.contact_id, ...cats, ...(d.start_date ? [d.start_date] : [])).all()).results || [];
}
function summarize(d, lines) {
  const sameCat = d.interest_category_id && d.interest_category_id === d.principal_category_id;
  let principal = 0, interest = 0;
  for (const l of lines) {
    if (l.category_id === d.principal_category_id) principal += l.amount; else if (!sameCat && l.category_id === d.interest_category_id) interest += l.amount;
  }
  const sign = d.type === 'RECEIVABLE' ? 1 : -1;            // จ่ายหนี้ = เงินออก (ลบ) · รับคืน = เงินเข้า (บวก)
  const paid = r2(sign * principal);
  const outstanding = r2(Number(d.start_balance || 0) - paid);
  const inst = Number(d.installment_amount) || 0;
  return { paid_principal: paid, interest: r2(Math.abs(interest)), outstanding, progress: d.start_balance > 0 ? Math.min(100, Math.max(0, Math.round(paid / d.start_balance * 100))) : 0,
    installments_left: inst > 0 && outstanding > 0 ? Math.ceil(outstanding / inst - 1e-9) : 0, payments: lines.length,
    last_date: lines.length ? lines[lines.length - 1].date : null, same_category: !!sameCat };
}
export async function listLoans(env, user) {
  const debts = await visibleDebts(env, user);
  const names = new Map(((await env.DB.prepare(`SELECT contact_id, name FROM Contacts WHERE family_id = ?`).bind(user.family_id).all()).results || []).map(c => [c.contact_id, c.name]));
  const cats = new Map(((await env.DB.prepare(`SELECT category_id, name FROM Categories WHERE family_id = ? OR family_id IS NULL`).bind(user.family_id).all()).results || []).map(c => [c.category_id, c.name]));
  const loans = [];
  for (const d of debts) {
    const lines = await debtLines(env, d);
    loans.push({ debt_id: d.debt_id, name: d.name, type: d.type, status: d.status || 'active', contact_id: d.contact_id, contact_name: names.get(d.contact_id) || d.contact_id,
      principal_category_id: d.principal_category_id, principal_category: cats.get(d.principal_category_id) || d.principal_category_id,
      interest_category_id: d.interest_category_id, interest_category: d.interest_category_id ? (cats.get(d.interest_category_id) || d.interest_category_id) : null,
      start_balance: r2(d.start_balance), start_date: d.start_date, installment_amount: d.installment_amount != null ? r2(d.installment_amount) : null,
      icon_type: d.icon_type, ...summarize(d, lines) });
  }
  const sum = t => r2(loans.filter(l => l.type === t && l.status === 'active').reduce((s, l) => s + Math.max(0, l.outstanding), 0));
  return { loans, totals: { payable: sum('PAYABLE'), receivable: sum('RECEIVABLE') } };
}
export async function loanDetail(env, user, id) {
  const d = (await visibleDebts(env, user)).find(x => x.debt_id === id);
  if (!d) return { error: 'ไม่พบสัญญานี้', status: 404 };
  const lines = await debtLines(env, d);
  const sign = d.type === 'RECEIVABLE' ? 1 : -1;
  let left = Number(d.start_balance || 0);
  const rows = lines.map(l => {
    const isP = l.category_id === d.principal_category_id;
    if (isP) left = r2(left - sign * l.amount);
    return { ...l, kind: isP ? 'PRINCIPAL' : 'INTEREST', balance_after: isP ? left : null };
  });
  return { debt_id: d.debt_id, name: d.name, type: d.type, start_balance: r2(d.start_balance), start_date: d.start_date, lines: rows.reverse(), ...summarize(d, lines) };
}

export async function handleCardsLoans(request, env, url, cors, user) {
  const p = url.pathname;
  if (request.method !== 'GET') return null;
  if (p === '/api/inbox/cards') return json(await listCards(env, user), cors);
  if (p === '/api/inbox/loans') return json(await listLoans(env, user), cors);
  const m = p.match(/^\/api\/inbox\/loans\/([\w-]+)$/);
  if (m) { const out = await loanDetail(env, user, m[1]); return json(out, cors, out.error ? out.status : 200); }
  return null;
}
