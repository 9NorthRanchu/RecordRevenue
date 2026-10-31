// ═══════════════════════════════════════════════════════════════════════
// ⇄ โอนระหว่างบัญชีของเรา (2026-10-31 · North: "ทำเลย" ข้อ ก + ข + ค)
//  การโอน 1 ครั้ง = 2 ขา (ออกจากบัญชีหนึ่ง · เข้าอีกบัญชี) · ทั้งสองขาใช้หมวด Bank_Transfer ประเภท TRANSFER (ไม่นับเป็นรับ/จ่าย)
//  GET  /api/transfers/suggest → คู่ที่น่าจะเป็นการโอน: รายการรอตรวจ ยอดเท่ากันคนละเครื่องหมาย คนละบัญชี ห่างกันไม่เกิน 2 วัน
//  POST /api/transfers/apply   { pairs: [{ out_id, in_id }] }                       → ยืนยันเป็นการโอนทั้งสองขา
//                              { transaction_id, counter_account_id?, create_counter? } → ขาเดียว: หาคู่รอตรวจในบัญชีปลายทางก่อน
//                                  ไม่เจอ + create_counter → สร้างขาอีกฝั่งให้ (บัญชีที่ไม่มี statement เช่น เงินสด) · ไม่เจอ = ตั้งขานี้อย่างเดียว
// ═══════════════════════════════════════════════════════════════════════
import { SIGNED_AMOUNT_SQL } from './stmt-report.js';

const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const TRANSFER_CAT = 'Bank_Transfer';
const MAX_DAYS = 2;
const dayDiff = (a, b) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 864e5);
const sec = t => { const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t || ''); return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0) : null; };

/* จับคู่: ออก (ติดลบ) กับ เข้า (บวก) ยอดเท่ากัน คนละบัญชี ห่าง ≤ 2 วัน · ใกล้สุดก่อน (วัน แล้วเวลา) · แต่ละรายการใช้ได้คู่เดียว */
export function pairTransfers(rows, maxDays = MAX_DAYS) {
  const ins = new Map();
  for (const r of rows) if (r.amt > 0) { const k = r2(r.amt).toFixed(2); if (!ins.has(k)) ins.set(k, []); ins.get(k).push(r); }
  const cand = [], nCand = {};
  for (const o of rows) {
    if (!(o.amt < 0)) continue;
    for (const i of ins.get(r2(-o.amt).toFixed(2)) || []) {
      if (i.account_id === o.account_id) continue;
      const dd = dayDiff(o.date, i.date); if (dd > maxDays) continue;
      const so = sec(o.time), si = sec(i.time);
      cand.push({ o, i, dd, td: dd === 0 && so != null && si != null ? Math.abs(so - si) : 86400 });
      nCand[o.transaction_id] = (nCand[o.transaction_id] || 0) + 1; nCand[i.transaction_id] = (nCand[i.transaction_id] || 0) + 1;
    }
  }
  cand.sort((a, b) => a.dd - b.dd || a.td - b.td || String(a.o.transaction_id).localeCompare(String(b.o.transaction_id)));
  const used = new Set(), out = [];
  for (const c of cand) {
    if (used.has(c.o.transaction_id) || used.has(c.i.transaction_id)) continue;
    used.add(c.o.transaction_id); used.add(c.i.transaction_id);
    out.push({ out: c.o, in: c.i, days: c.dd, ambiguous: nCand[c.o.transaction_id] > 1 || nCand[c.i.transaction_id] > 1 });
  }
  return out;
}

const pick = r => ({ transaction_id: r.transaction_id, account_id: r.account_id, account_name: r.account_name, account_type: r.account_type, date: r.date, time: r.time, desc: r.statement_desc || '' });

export async function handleTransfers({ url, request, env, cors, authUserId }) {
  const p = url.pathname;
  if (!p.startsWith('/api/transfers/')) return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  const accQ = `SELECT a.account_id, a.name AS account_name, a.account_type, a.entity_id FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?`;
  const accRows = ((await env.DB.prepare(accQ).bind(authUserId).all()).results) || [];
  const accs = new Map(accRows.map(a => [a.account_id, a]));
  const txSel = `SELECT t.transaction_id, t.account_id, substr(t.date,1,10) AS date, t.time, t.status, t.statement_desc, ROUND(${SIGNED_AMOUNT_SQL}, 2) AS amt FROM Transactions t`;

  if (p === '/api/transfers/suggest' && request.method === 'GET') {
    if (!accs.size) return json({ pairs: [] }, cors);
    const ids = [...accs.keys()], rows = [];
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      rows.push(...((((await env.DB.prepare(`${txSel} WHERE t.status = 'PENDING_REVIEW' AND t.account_id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || [])));
    }
    for (const r of rows) Object.assign(r, { account_name: accs.get(r.account_id)?.account_name, account_type: accs.get(r.account_id)?.account_type });
    const pairs = pairTransfers(rows).map(x => ({ out_id: x.out.transaction_id, in_id: x.in.transaction_id, amount: r2(-x.out.amt), days: x.days, ambiguous: x.ambiguous, out: pick(x.out), in: pick(x.in) }));
    return json({ pairs }, cors);
  }

  if (p === '/api/transfers/apply' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const cat = await env.DB.prepare(`SELECT category_id FROM Categories WHERE category_id = ?`).bind(TRANSFER_CAT).first();
    if (!cat) return json({ error: 'ยังไม่มีหมวด Bank Transfer (Bank_Transfer) — เพิ่มในตั้งค่า → หมวด ก่อน' }, cors, 400);
    const load = async id => { const t = id ? await env.DB.prepare(`${txSel} WHERE t.transaction_id = ?`).bind(String(id)).first() : null; return t && accs.has(t.account_id) ? t : null; };
    const now = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let seq = 0;
    const setOps = (t, other) => {
      const a = accs.get(t.account_id), amt = r2(t.amt), name = String(other?.account_name || '').replace(/^\s*\[[^\]]+\]\s*/, '');
      const note = (amt < 0 ? 'โอนไป' : 'รับโอนจาก') + (name ? ' ' + name : 'บัญชีของเรา');
      return [
        env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(t.transaction_id),
        env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type) VALUES (?,?,?,0,0,?,?,NULL,NULL,?,'TRANSFER')`)
          .bind(`DT-TRF-${now}-${++seq}`, t.transaction_id, amt, TRANSFER_CAT, a?.entity_id || null, note.slice(0, 200)),
        env.DB.prepare(`UPDATE Transactions SET total_amount = ?, status = 'CONFIRMED' WHERE transaction_id = ?`).bind(amt, t.transaction_id),
      ];
    };
    const pairOk = (o, i) => o && i && o.account_id !== i.account_id && o.amt < 0 && Math.abs(r2(o.amt + i.amt)) < 0.005;

    if (Array.isArray(b.pairs)) {
      let done = 0; const errors = [];
      for (const x of b.pairs.slice(0, 300)) {
        const o = await load(x.out_id), i = await load(x.in_id);
        if (!pairOk(o, i)) { errors.push(`${x.out_id}/${x.in_id}: ไม่ใช่คู่โอนที่ยอดตรงกัน หรือไม่มีสิทธิ์`); continue; }
        await env.DB.batch([...setOps(o, accs.get(i.account_id)), ...setOps(i, accs.get(o.account_id))]); done++;
      }
      return json({ success: true, paired: done, errors }, cors);
    }

    const t = await load(b.transaction_id);
    if (!t) return json({ error: 'ไม่พบรายการ หรือไม่มีสิทธิ์' }, cors, 404);
    if (!(Math.abs(t.amt) > 0)) return json({ error: 'รายการยอด 0 ตั้งเป็นการโอนไม่ได้' }, cors, 400);
    const cAcc = b.counter_account_id ? accs.get(String(b.counter_account_id)) : null;
    if (b.counter_account_id && !cAcc) return json({ error: 'ไม่มีสิทธิ์ใช้บัญชีปลายทาง' }, cors, 403);
    if (cAcc && cAcc.account_id === t.account_id) return json({ error: 'บัญชีปลายทางต้องเป็นคนละบัญชี' }, cors, 400);
    if (cAcc) {
      /* มีขาอีกฝั่งรอตรวจอยู่แล้ว (นำเข้า statement บัญชีนั้นมาแล้ว) → จับคู่ ไม่สร้างซ้ำ */
      const cs = (((await env.DB.prepare(`${txSel} WHERE t.status = 'PENDING_REVIEW' AND t.account_id = ? AND substr(t.date,1,10) BETWEEN date(?, '-${MAX_DAYS} day') AND date(?, '+${MAX_DAYS} day')`)
        .bind(cAcc.account_id, t.date, t.date).all()).results) || []).filter(c => Math.abs(r2(c.amt + t.amt)) < 0.005)
        .sort((a, b2) => dayDiff(a.date, t.date) - dayDiff(b2.date, t.date));
      if (cs.length) {
        await env.DB.batch([...setOps(t, cAcc), ...setOps(cs[0], accs.get(t.account_id))]);
        return json({ success: true, mode: 'paired', counter_id: cs[0].transaction_id, counter_date: cs[0].date }, cors);
      }
      if (b.create_counter) {
        const id = `TX-TRF-${now}${Math.random().toString(36).slice(2, 6)}`, src = accs.get(t.account_id);
        const c = { transaction_id: id, account_id: cAcc.account_id, amt: r2(-t.amt) };
        const srcName = String(src?.account_name || '').replace(/^\s*\[[^\]]+\]\s*/, '');
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
            VALUES (?,?,NULL,?,?,?,?,'PENDING_REVIEW','WEB_GRID',NULL,?)`).bind(id, cAcc.account_id, t.date, t.time || null, c.amt, `⇄ ${c.amt > 0 ? 'รับโอนจาก' : 'โอนไป'} ${srcName}`.slice(0, 200), authUserId),
          ...setOps(t, cAcc), ...setOps(c, src)]);
        return json({ success: true, mode: 'created', counter_id: id }, cors);
      }
    }
    await env.DB.batch(setOps(t, cAcc));
    return json({ success: true, mode: 'single' }, cors);
  }
  return null;
}
