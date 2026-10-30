// ═══════════════════════════════════════════════════════════════════════
// 🏦 ภาพรวม "ตามบัญชี" (แนวคิด ข · 2026-10-30 · North เลือกจาก mockup 008/009/010)
//  GET /api/accounts/overview?month=YYYY-MM → ทุกบัญชีที่ผู้ใช้เห็น:
//   ยอดยกมา/ยกไป (ในระบบ · ยืนยัน + รอตรวจ) · รับ/จ่ายในเดือน · รอตรวจกี่รายการ (→ % ตรวจครบ)
//   ยอดธนาคารปลายเดือน (หัว statement / จุดยอดธนาคาร) · บรรทัด statement ที่ขาด · ยอดรายวัน (กราฟแท่งเล็ก) · 3 รายการล่าสุด
//  บัตรเครดิต: ระบบเก็บยอดค้างเป็นลบ → ส่งกลับตามระบบ หน้าเว็บกลับเครื่องหมายเอง (เหมือนรายงานยอดสะสม)
// ═══════════════════════════════════════════════════════════════════════
import { SIGNED_AMOUNT_SQL, ensureStmtCols } from './stmt-report.js';

const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export async function handleAccOverview({ url, request, env, cors, authUserId }) {
  if (url.pathname !== '/api/accounts/overview' || request.method !== 'GET') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  await ensureStmtCols(env);
  let month = url.searchParams.get('month') || '';
  const ACC = `SELECT a.account_id FROM Accounts a JOIN UserPermissions up ON a.entity_id = up.entity_id
      WHERE up.user_id = ? AND IFNULL(a.account_type,'BANK') NOT IN ('TRIP_HOLDING','TRIP')`;
  if (!/^\d{4}-\d{2}$/.test(month)) {   // ค่าเริ่มต้น = เดือนล่าสุดที่มีรายการ
    const last = await env.DB.prepare(`SELECT MAX(substr(date,1,7)) AS m FROM Transactions WHERE account_id IN (${ACC})`).bind(authUserId).first();
    month = last?.m || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  }
  const from = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const accounts = ((await env.DB.prepare(`SELECT a.account_id, a.name, a.bank_name, a.account_number, IFNULL(a.account_type,'BANK') AS account_type,
        IFNULL(a.credit_limit,0) AS credit_limit, a.entity_id, e.name AS entity_name
      FROM Accounts a JOIN Entities e ON e.entity_id = a.entity_id JOIN UserPermissions up ON a.entity_id = up.entity_id
      WHERE up.user_id = ? AND IFNULL(a.account_type,'BANK') NOT IN ('TRIP_HOLDING','TRIP') ORDER BY e.name, a.name`).bind(authUserId).all()).results) || [];

  const agg = ((await env.DB.prepare(`SELECT t.account_id,
        ROUND(SUM(CASE WHEN substr(t.date,1,10) < ? THEN ${SIGNED_AMOUNT_SQL} ELSE 0 END), 2) AS open_sys,
        ROUND(SUM(CASE WHEN substr(t.date,1,10) <= ? THEN ${SIGNED_AMOUNT_SQL} ELSE 0 END), 2) AS close_sys,
        ROUND(SUM(CASE WHEN substr(t.date,1,10) BETWEEN ? AND ? AND (${SIGNED_AMOUNT_SQL}) > 0 THEN ${SIGNED_AMOUNT_SQL} ELSE 0 END), 2) AS sum_in,
        ROUND(SUM(CASE WHEN substr(t.date,1,10) BETWEEN ? AND ? AND (${SIGNED_AMOUNT_SQL}) < 0 THEN ${SIGNED_AMOUNT_SQL} ELSE 0 END), 2) AS sum_out,
        SUM(CASE WHEN substr(t.date,1,10) BETWEEN ? AND ? AND (${SIGNED_AMOUNT_SQL}) > 0 THEN 1 ELSE 0 END) AS n_in,
        SUM(CASE WHEN substr(t.date,1,10) BETWEEN ? AND ? AND (${SIGNED_AMOUNT_SQL}) < 0 THEN 1 ELSE 0 END) AS n_out,
        SUM(CASE WHEN substr(t.date,1,10) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS n,
        SUM(CASE WHEN substr(t.date,1,10) BETWEEN ? AND ? AND t.status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS n_pending,
        SUM(CASE WHEN t.status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS n_pending_all,
        MAX(substr(t.date,1,10)) AS last_date
      FROM Transactions t WHERE t.account_id IN (${ACC}) GROUP BY t.account_id`)
    .bind(from, to, from, to, from, to, from, to, from, to, from, to, from, to, authUserId).all()).results) || [];

  const daily = ((await env.DB.prepare(`SELECT t.account_id, substr(t.date,1,10) AS d, ROUND(SUM(${SIGNED_AMOUNT_SQL}), 2) AS net, ROUND(SUM(ABS(t.total_amount)), 2) AS vol
      FROM Transactions t WHERE t.account_id IN (${ACC}) AND substr(t.date,1,10) BETWEEN ? AND ? GROUP BY t.account_id, substr(t.date,1,10)`)
    .bind(authUserId, from, to).all()).results) || [];

  const recent = ((await env.DB.prepare(`SELECT * FROM (
        SELECT t.account_id, t.transaction_id, substr(t.date,1,10) AS date, t.statement_desc, t.status, ROUND(${SIGNED_AMOUNT_SQL}, 2) AS amount,
          (SELECT c.name FROM TransactionDetails d LEFT JOIN Categories c ON c.category_id = d.category_id WHERE d.transaction_id = t.transaction_id LIMIT 1) AS category,
          (SELECT d.note FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id AND d.note IS NOT NULL AND d.note != '' LIMIT 1) AS note,
          ROW_NUMBER() OVER (PARTITION BY t.account_id ORDER BY t.date DESC, t.time DESC, t.created_at DESC) AS rn
        FROM Transactions t WHERE t.account_id IN (${ACC}) AND substr(t.date,1,10) BETWEEN ? AND ?) WHERE rn <= 3`)
    .bind(authUserId, from, to).all()).results) || [];

  /* ยอดธนาคาร: หัว statement ที่จบในเดือนนี้ (ล่าสุด) · ไม่มี → จุดยอดธนาคาร (checkpoint) ล่าสุดในเดือน */
  const heads = ((await env.DB.prepare(`SELECT h.stmt_id, h.account_id, h.period_from, h.period_to, h.opening, h.closing, h.line_count, h.source_kind,
        (SELECT COUNT(*) FROM Transactions t WHERE t.stmt_id = h.stmt_id) AS n_in_sys
      FROM StatementImports h WHERE h.account_id IN (${ACC}) AND h.period_to >= ? AND h.period_from <= ? ORDER BY h.period_to`)
    .bind(authUserId, from, to).all()).results) || [];
  let cps = [];
  try {
    cps = ((await env.DB.prepare(`SELECT account_id, as_of, balance FROM AccountCheckpoints WHERE account_id IN (${ACC}) AND as_of BETWEEN ? AND ? ORDER BY as_of`)
      .bind(authUserId, from, to).all()).results) || [];
  } catch { /* ยังไม่มีตาราง */ }

  const by = (arr, k = 'account_id') => arr.reduce((o, x) => ((o[x[k]] ||= []).push(x), o), {});
  const A = Object.fromEntries(agg.map(x => [x.account_id, x])), D = by(daily), R = by(recent), H = by(heads), C = by(cps);
  const out = accounts.map(a => {
    const g = A[a.account_id] || {}, hs = H[a.account_id] || [], isCard = a.account_type === 'CREDIT';
    const endH = hs.filter(h => h.period_to <= to && h.closing != null).pop();
    const cp = (C[a.account_id] || []).pop();
    /* หัว statement เก็บยอดตามธนาคาร (บัตร = ยอดค้างเป็นบวก) · checkpoint เก็บตามระบบ (บัตร = ลบ) → แปลงเป็นแบบระบบ */
    const bank = endH ? { as_of: endH.period_to, balance: r2(isCard ? -Math.abs(endH.closing) : endH.closing), from: 'statement' }
      : cp ? { as_of: cp.as_of, balance: r2(cp.balance), from: 'checkpoint' } : null;
    let sysAtBank = null;
    if (bank) sysAtBank = bank.as_of === to ? r2(g.close_sys) : null;   // ยอดในระบบ ณ วันเดียวกับธนาคาร (ถ้าไม่ใช่สิ้นเดือน หน้าเว็บคิดจาก daily)
    if (bank && sysAtBank == null) sysAtBank = r2((g.open_sys || 0) + (D[a.account_id] || []).filter(x => x.d <= bank.as_of).reduce((s, x) => s + Number(x.net || 0), 0));
    const missing = hs.reduce((s, h) => s + Math.max(0, (Number(h.line_count) || 0) - (Number(h.n_in_sys) || 0)), 0);
    return { ...a, open_sys: r2(g.open_sys), close_sys: r2(g.close_sys), sum_in: r2(g.sum_in), sum_out: r2(g.sum_out), n_in: g.n_in || 0, n_out: g.n_out || 0,
      n: g.n || 0, n_pending: g.n_pending || 0, n_pending_all: g.n_pending_all || 0, last_date: g.last_date || null,
      bank, sys_at_bank: bank ? sysAtBank : null, diff: bank ? r2(sysAtBank - bank.balance) : null, missing_lines: missing, statements: hs.length,
      daily: (D[a.account_id] || []).map(x => ({ d: x.d, net: r2(x.net), vol: r2(x.vol) })),
      recent: (R[a.account_id] || []).map(({ rn, account_id, ...x }) => x) };
  });
  return json({ month, from, to, accounts: out }, cors);
}
