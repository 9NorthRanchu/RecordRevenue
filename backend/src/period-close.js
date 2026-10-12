// ═══════════════════════════════════════════════════════════════════════════
// ปิดเดือน (2026-10-11 · North เลือก 1ก + 2ก)
//
//  1ก  เดือนที่ปิดแล้ว "ไม่มีใครแก้ได้" — ผู้ดูแลต้องกด "เปิดเดือน" (ใส่เหตุผล) ก่อน
//      ล็อกที่ฐานข้อมูลด้วย TRIGGER (ดู setup-period-close.sql) จึงกันได้ทุกทาง
//      ทั้งแอปเดิม หน้าใหม่ LINE และระบบทริป — ไม่ต้องไล่ใส่เช็กทุก endpoint
//  2ก  ปิดได้เมื่อ "ผ่านครบทุกข้อ" เท่านั้น:
//      · ไม่มีรายการรอยืนยันในเดือนนั้น
//      · ไม่มีเอกสารค้างในกล่องรอเคลียร์ที่ลงวันที่เดือนนั้น (หรือยังอ่านไม่ออก)
//      · ไม่มีบรรทัดที่ยังไม่ระบุหมวด
//      · ทุกบัญชีธนาคาร/บัตรที่มีรายการในเดือนนั้น: มี statement · ทุกบรรทัดในเดือนจับคู่/สร้าง/ข้ามแล้ว
//        · ยอดในระบบ ณ วันสิ้นสุด statement = ยอดคงเหลือใน statement
//      (เงินสดไม่มี statement → ไม่ตรวจข้อนี้)
//      · ยอดยกมา (2026-10-12): ชุดที่เริ่มไม่เกินสิ้นเดือน ต้องสมดุล (บัญชีพัก = 0) และไม่มีรายการก่อนวันเริ่ม
//
// ตอนปิด เก็บยอดคงเหลือทุกบัญชี ณ สิ้นเดือนไว้ (snapshot) เป็นหลักฐาน
// ═══════════════════════════════════════════════════════════════════════════
import { openingIssues } from './opening.js';
const UNCAT = 'Cat_Uncategorized';
const OPEN_DOC = ['READING', 'NEEDS_ACCOUNT', 'NEEDS_CHOICE', 'SUGGESTED', 'STORED', 'ERROR'];
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const PERIOD_CLOSED_MSG = 'เดือนนี้ปิดบัญชีแล้ว — ผู้ดูแลต้องเปิดเดือนก่อนจึงจะแก้ได้';

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const monthLabel = m => { const [y, mm] = m.split('-').map(Number); return `${TH_MONTH[mm - 1]} ${y + 543}`; };
const nextMonth = m => { const [y, mm] = m.split('-').map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; };
const lastDay = m => { const [y, mm] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0')}`; };
const dayAfter = d => new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
const validMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');

/* error จาก trigger → ข้อความคน (ใช้ใน index.js และ ledger-inbox.js) */
export const isPeriodClosedError = err => /PERIOD_CLOSED/.test(String(err?.message || err || ''));

/* เดือนของวันที่นี้ ในบัญชีนี้ ปิดแล้วหรือยัง — ใช้กับทางที่ trigger จับไม่ได้ (INSERT OR REPLACE ย้ายวันที่) */
export async function isMonthClosed(env, accountId, date) {
  if (!accountId || !date) return false;
  try {
    return !!(await env.DB.prepare(`SELECT 1 FROM LedgerPeriods p JOIN Entities e ON e.family_id = p.family_id
        JOIN Accounts a ON a.entity_id = e.entity_id
       WHERE a.account_id = ? AND p.period = ? AND p.status = 'CLOSED'`).bind(accountId, String(date).slice(0, 7)).first());
  } catch { return false; }                      // ยังไม่มีตาราง = ยังไม่เคยปิดเดือน
}

async function familyAccounts(env, fid) {
  return (await env.DB.prepare(`SELECT a.account_id, a.name, IFNULL(a.account_type,'BANK') AS account_type
      FROM Accounts a JOIN Entities e ON e.entity_id = a.entity_id
     WHERE e.family_id = ? AND IFNULL(a.account_type,'BANK') != 'TRIP_HOLDING' ORDER BY a.name`).bind(fid).all()).results || [];
}
const balanceAt = async (env, accountId, date) => r2((await env.DB.prepare(
  `SELECT SUM(total_amount) AS s FROM Transactions WHERE account_id = ? AND status = 'CONFIRMED' AND date < ?`
).bind(accountId, dayAfter(date)).first())?.s);

export async function checkPeriod(env, user, month) {
  const fid = user.family_id, from = `${month}-01`, to = `${nextMonth(month)}-01`, end = lastDay(month);
  const items = [];
  const add = (ok, key, title, detail = '', link = '') => items.push({ ok, key, title, detail, link });

  // 1) รายการรอยืนยัน
  const pend = await env.DB.prepare(`SELECT COUNT(*) AS n FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id
      JOIN Entities e ON e.entity_id = a.entity_id
     WHERE e.family_id = ? AND t.status = 'PENDING_REVIEW' AND t.date >= ? AND t.date < ?`).bind(fid, from, to).first();
  add(!pend?.n, 'pending', 'ไม่มีรายการรอยืนยัน', pend?.n ? `ค้าง ${pend.n} รายการ` : '', 'index.html');

  // 2) เอกสารค้างในกล่อง (ลงวันที่เดือนนี้ หรืออ่านวันที่ไม่ออก)
  const docs = (await env.DB.prepare(`SELECT doc_id, status, extracted FROM LedgerDocs WHERE family_id = ? AND status IN (${OPEN_DOC.map(() => '?').join(',')})`)
    .bind(fid, ...OPEN_DOC).all()).results || [];
  let inMonth = 0, undated = 0;
  for (const d of docs) {
    let date = null; try { date = JSON.parse(d.extracted || 'null')?.date || null; } catch { /* */ }
    if (!date) undated++; else if (date >= from && date < to) inMonth++;
  }
  add(!inMonth && !undated, 'inbox', 'กล่องรอเคลียร์ไม่มีเอกสารค้างของเดือนนี้',
    [inMonth && `ค้าง ${inMonth} ใบ`, undated && `อ่านวันที่ไม่ออก ${undated} ใบ (ตรวจแล้วกดข้ามหรือแก้วันที่)`].filter(Boolean).join(' · '), 'index.html');

  // 3) ยังไม่ระบุหมวด
  const unc = await env.DB.prepare(`SELECT COUNT(DISTINCT t.transaction_id) AS n FROM Transactions t
      JOIN TransactionDetails d ON d.transaction_id = t.transaction_id
      JOIN Accounts a ON a.account_id = t.account_id JOIN Entities e ON e.entity_id = a.entity_id
     WHERE e.family_id = ? AND t.status = 'CONFIRMED' AND t.date >= ? AND t.date < ? AND d.category_id = ?`).bind(fid, from, to, UNCAT).first();
  add(!unc?.n, 'uncat', 'ทุกรายการระบุหมวดแล้ว', unc?.n ? `ยังไม่ระบุ ${unc.n} รายการ` : '', `index.html#hist`);

  // 4) กระทบยอดกับ statement — เฉพาะบัญชีธนาคาร/บัตรที่มีรายการในเดือนนี้
  const accounts = await familyAccounts(env, fid);
  const active = (await env.DB.prepare(`SELECT t.account_id, COUNT(*) AS n FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id
      JOIN Entities e ON e.entity_id = a.entity_id
     WHERE e.family_id = ? AND t.status = 'CONFIRMED' AND t.date >= ? AND t.date < ? GROUP BY t.account_id`).bind(fid, from, to).all()).results || [];
  const activeIds = new Map(active.map(r => [r.account_id, r.n]));
  const accRows = [];
  for (const a of accounts) {
    if (!activeIds.has(a.account_id) || a.account_type === 'CASH') continue;
    const sts = (await env.DB.prepare(`SELECT stmt_id, period_from, period_to, closing_balance, lines FROM LedgerStatements
       WHERE family_id = ? AND account_id = ? AND period_from <= ? AND period_to >= ? ORDER BY period_to DESC`).bind(fid, a.account_id, end, from).all()).results || [];
    const row = { account_id: a.account_id, name: a.name, type: a.account_type, tx: activeIds.get(a.account_id), ok: false, problem: '' };
    if (!sts.length) { row.problem = 'ยังไม่นำเข้า statement ของเดือนนี้'; accRows.push(row); continue; }
    let open = 0;
    for (const s of sts) {
      let lines = []; try { lines = JSON.parse(s.lines || '[]'); } catch { /* */ }
      open += lines.filter(l => l.status === 'NEW' && l.date >= from && l.date < to).length;
    }
    const last = sts[0];
    let closing = last.closing_balance;
    if (closing == null) { try { const ls = JSON.parse(last.lines || '[]').filter(l => l.balance != null); closing = ls.length ? ls[ls.length - 1].balance : null; } catch { /* */ } }
    const sys = await balanceAt(env, a.account_id, last.period_to);
    row.statement_to = last.period_to; row.statement_balance = closing == null ? null : r2(closing); row.system_balance = sys;
    const match = closing != null && (Math.abs(sys - r2(closing)) < 0.005 || (a.account_type === 'CREDIT' && Math.abs(sys + r2(closing)) < 0.005));
    if (open) row.problem = `statement ยังมี ${open} บรรทัดที่ไม่ได้จับคู่/สร้าง/ข้าม`;
    else if (closing == null) row.problem = 'statement ไม่มียอดคงเหลือ — เทียบยอดไม่ได้';
    else if (!match) row.problem = `ยอดไม่ตรง: ระบบ ${sys.toLocaleString('en-US', { minimumFractionDigits: 2 })} · statement ${r2(closing).toLocaleString('en-US', { minimumFractionDigits: 2 })} (ณ ${last.period_to})`;
    row.ok = !row.problem;
    accRows.push(row);
  }
  const badAcc = accRows.filter(r => !r.ok);
  add(!badAcc.length, 'statements', 'ทุกบัญชีธนาคาร/บัตรยอดตรงกับ statement',
    badAcc.length ? `ไม่ผ่าน ${badAcc.length} บัญชี` : (accRows.length ? `ตรง ${accRows.length} บัญชี` : 'เดือนนี้ไม่มีบัญชีธนาคาร/บัตรที่มีรายการ'), 'index.html#stmt');

  // 5) ยอดยกมา (2026-10-12 · 2ก): ชุดที่เริ่มไม่เกินสิ้นเดือนนี้ต้องสมดุล (บัญชีพัก = 0) และไม่มีรายการก่อนวันเริ่ม
  const ob = await openingIssues(env, fid, end);
  add(!ob.length, 'opening', 'ยอดยกมาสมดุล และไม่มีรายการก่อนวันเริ่ม', ob.join(' · '), 'opening.html');

  return { month, label: monthLabel(month), ok: items.every(i => i.ok), items, accounts: accRows };
}

export async function listPeriods(env, user, url) {
  const n = Math.min(36, Math.max(1, Number(url.searchParams.get('months')) || 13));
  const now = new Date(); const months = [];
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  let rows = [];
  try { rows = (await env.DB.prepare(`SELECT period, status, closed_by, closed_at, reopened_by, reopened_at FROM LedgerPeriods WHERE family_id = ?`).bind(user.family_id).all()).results || []; }
  catch { return { ready: false, months: months.map(m => ({ month: m, label: monthLabel(m), status: 'OPEN' })), error_note: 'ยังไม่ได้ตั้งค่าฐานข้อมูลสำหรับปิดเดือน (รัน setup-db.sh)' }; }
  const names = new Map(((await env.DB.prepare(`SELECT user_id, name FROM Users WHERE family_id = ?`).bind(user.family_id).all()).results || []).map(u => [u.user_id, u.name]));
  const byM = new Map(rows.map(r => [r.period, r]));
  const log = (await env.DB.prepare(`SELECT period, action, user_id, note, created_at FROM LedgerPeriodLog WHERE family_id = ? ORDER BY created_at DESC LIMIT 30`).bind(user.family_id).all()).results || [];
  return { ready: true, is_admin: user.role === 'admin', months: months.map(m => {
    const r = byM.get(m) || {};
    return { month: m, label: monthLabel(m), status: r.status === 'CLOSED' ? 'CLOSED' : 'OPEN', closed_by: names.get(r.closed_by) || r.closed_by || null, closed_at: r.closed_at || null,
      reopened_by: names.get(r.reopened_by) || r.reopened_by || null, reopened_at: r.reopened_at || null };
  }), log: log.map(l => ({ ...l, label: monthLabel(l.period), user_name: names.get(l.user_id) || l.user_id })) };
}

async function closePeriod(env, user, month) {
  if (user.role !== 'admin') return { error: 'เฉพาะผู้ดูแลเท่านั้นที่ปิดเดือนได้', status: 403 };
  const cur = await env.DB.prepare(`SELECT status FROM LedgerPeriods WHERE family_id = ? AND period = ?`).bind(user.family_id, month).first();
  if (cur?.status === 'CLOSED') return { error: 'เดือนนี้ปิดไปแล้ว', status: 409 };
  if (month >= new Date().toISOString().slice(0, 7)) return { error: 'ปิดได้เฉพาะเดือนที่จบไปแล้ว', status: 400 };
  const chk = await checkPeriod(env, user, month);
  if (!chk.ok) return { error: 'ยังปิดเดือนไม่ได้ — มีรายการที่ต้องเคลียร์ก่อน', check: chk, status: 400 };
  const end = lastDay(month), at = new Date().toISOString();
  const snapshot = [];
  for (const a of await familyAccounts(env, user.family_id)) snapshot.push({ account_id: a.account_id, name: a.name, balance: await balanceAt(env, a.account_id, end) });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO LedgerPeriods (family_id, period, status, closed_by, closed_at, reopened_by, reopened_at, snapshot)
      VALUES (?,?, 'CLOSED', ?, ?, NULL, NULL, ?)
      ON CONFLICT(family_id, period) DO UPDATE SET status='CLOSED', closed_by=excluded.closed_by, closed_at=excluded.closed_at, snapshot=excluded.snapshot`)
      .bind(user.family_id, month, user.user_id, at, JSON.stringify({ as_of: end, accounts: snapshot })),
    env.DB.prepare(`INSERT INTO LedgerPeriodLog (log_id, family_id, period, action, user_id, note, created_at) VALUES (?,?,?, 'CLOSE', ?, NULL, ?)`)
      .bind(`PL-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, user.family_id, month, user.user_id, at),
  ]);
  return { ok: true, month, label: monthLabel(month) };
}

async function reopenPeriod(env, user, month, body) {
  if (user.role !== 'admin') return { error: 'เฉพาะผู้ดูแลเท่านั้นที่เปิดเดือนได้', status: 403 };
  const reason = String(body?.reason || '').trim().slice(0, 300);
  if (reason.length < 3) return { error: 'กรุณาใส่เหตุผลที่เปิดเดือน', status: 400 };
  const cur = await env.DB.prepare(`SELECT status FROM LedgerPeriods WHERE family_id = ? AND period = ?`).bind(user.family_id, month).first();
  if (cur?.status !== 'CLOSED') return { error: 'เดือนนี้ยังไม่ได้ปิด', status: 409 };
  const at = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE LedgerPeriods SET status='OPEN', reopened_by=?, reopened_at=? WHERE family_id = ? AND period = ?`).bind(user.user_id, at, user.family_id, month),
    env.DB.prepare(`INSERT INTO LedgerPeriodLog (log_id, family_id, period, action, user_id, note, created_at) VALUES (?,?,?, 'REOPEN', ?, ?, ?)`)
      .bind(`PL-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, user.family_id, month, user.user_id, reason, at),
  ]);
  return { ok: true, month, label: monthLabel(month) };
}

/* เส้นทาง /api/inbox/periods… — เรียกจาก handleLedgerInbox (ผู้ใช้ล็อกอินแล้ว) */
export async function handlePeriods(request, env, url, cors, user) {
  const path = url.pathname;
  if (path === '/api/inbox/periods' && request.method === 'GET') return json(await listPeriods(env, user, url), cors);
  const m = path.match(/^\/api\/inbox\/periods\/(\d{4}-\d{2})\/(check|close|reopen)$/);
  if (!m) return null;
  if (!validMonth(m[1])) return json({ error: 'เดือนไม่ถูกต้อง' }, cors, 400);
  if (m[2] === 'check' && request.method === 'GET') return json(await checkPeriod(env, user, m[1]), cors);
  if (request.method !== 'POST') return null;
  const body = await request.json().catch(() => ({}));
  const out = m[2] === 'close' ? await closePeriod(env, user, m[1]) : await reopenPeriod(env, user, m[1], body);
  return json(out, cors, out.error ? (out.status || 400) : 200);
}
