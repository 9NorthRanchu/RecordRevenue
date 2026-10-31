// ═══════════════════════════════════════════════════════════════════════
// 🔎 รายการใกล้เคียง (2026-10-31 · North: "ตอนบันทึกค่าใช้จ่าย/จับคู่สลิป แสดงรายการที่ผู้จ่าย ผู้รับ รายเดียวกัน
//    และประวัติว่าเคยบันทึกอะไรไป · ยืนยันใช้รายละเอียดของรายการเก่าในรายการใหม่ได้")
//  GET /api/transactions/similar?desc=&name=&amount=&account_id=&exclude=
//   → รายการที่ยืนยันแล้ว ข้อความธนาคาร/ชื่อผู้รับ/หมายเหตุคล้ายกัน (+ยอดเท่ากัน +บัญชีเดียวกัน) เรียงตามความใกล้ · สูงสุด 8
//   → summary: หมวด + Company + คู่ค้า ที่ใช้บ่อยที่สุดกับคู่รายการนี้
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const simKey = s => String(s || '').toLowerCase().replace(/[x*]{2,}/g, ' ').replace(/[0-9]+/g, ' ').replace(/[^a-z฀-๿]+/g, ' ').replace(/\s+/g, ' ').trim();
/* คำที่ใช้ค้น: ตัดคำทั่วไปของธนาคารออก เหลือชื่อร้าน/ผู้รับ */
const STOP = new Set(['transfer', 'withdrawal', 'deposit', 'from', 'to', 'payment', 'bill', 'k', 'biz', 'plus', 'internet', 'mobile', 'bangkok', 'tha', 'th', 'co', 'ltd', 'the',
  'โอนเงิน', 'รับโอนเงิน', 'โอนไป', 'จาก', 'จ่ายบิล', 'ชำระเงิน', 'บจก', 'บริษัท', 'จำกัด', 'นาย', 'นาง', 'นางสาว', 'ร้าน']);
export const simTokens = s => [...new Set(simKey(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)))].sort((a, b) => b.length - a.length).slice(0, 3);

export async function handleSimilar({ url, request, env, cors, authUserId }) {
  if (url.pathname !== '/api/transactions/similar' || request.method !== 'GET') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  const desc = url.searchParams.get('desc') || '', name = url.searchParams.get('name') || '';
  /* sign: -1 = จ่าย · 1 = รับ (2026-10-31: ค่าใช้จ่ายและรายรับ ทุก statement · ทิศเดียวกันได้คะแนนก่อน) */
  const sign = Math.sign(Number(url.searchParams.get('sign')) || 0);
  const acc = url.searchParams.get('account_id') || '', exclude = url.searchParams.get('exclude') || '';
  const toks = [...new Set([...simTokens(desc), ...simTokens(name)])].slice(0, 4);
  /* 2026-10-31 North: เลือกประวัติจากผู้รับ/ผู้จ่ายเท่านั้น — ไม่ใช้จำนวนเงิน (ยอดส่วนใหญ่ไม่เท่ากันอยู่แล้ว) */
  if (!toks.length) return json({ items: [], summary: null }, cors);
  const conds = [], params = [authUserId, exclude];
  for (const t of toks) { conds.push(`LOWER(COALESCE(t.statement_desc,'')) LIKE ? OR LOWER(COALESCE(d.note,'')) LIKE ? OR LOWER(COALESCE(co.name,'')) LIKE ?`); params.push(`%${t}%`, `%${t}%`, `%${t}%`); }
  const rows = ((await env.DB.prepare(`SELECT t.transaction_id, t.account_id, substr(t.date,1,10) AS date, t.total_amount, t.statement_desc, a.name AS account_name,
        d.category_id, c.name AS category_name, c.caption_id, d.entity_id, e.name AS entity_name, d.contact_id, co.name AS contact_name, d.note, d.type
      FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
      JOIN TransactionDetails d ON d.transaction_id = t.transaction_id
      LEFT JOIN Categories c ON c.category_id = d.category_id LEFT JOIN Entities e ON e.entity_id = d.entity_id LEFT JOIN Contacts co ON co.contact_id = d.contact_id
      WHERE up.user_id = ? AND t.status = 'CONFIRMED' AND t.transaction_id != ? AND d.category_id IS NOT NULL AND d.category_id NOT LIKE '%Uncategorized%'
        AND (${conds.join(' OR ')})
      ORDER BY t.date DESC LIMIT 300`).bind(...params).all()).results) || [];
  const key = simKey(desc), nameKey = simKey(name);
  const score = r => {
    const k = simKey(r.statement_desc), hay = `${k} ${simKey(r.note)} ${simKey(r.contact_name)}`;
    let s = 0;
    if (key && k === key) s += 6;
    s += toks.filter(t => hay.includes(t)).length * 2;
    if (nameKey && nameKey.length >= 3 && hay.includes(nameKey)) s += 3;
    if (acc && r.account_id === acc) s += 1;
    if (sign && Math.sign(r.total_amount) === sign) s += 1; else if (sign && Math.sign(r.total_amount) === -sign) s -= 2;
    return s;
  };
  const seen = new Set(), items = [], scored = rows.map(r => ({ ...r, score: score(r) }));
  for (const r of scored.filter(r => r.score >= 2).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))) {
    if (seen.has(r.transaction_id)) continue; seen.add(r.transaction_id); items.push(r); if (items.length >= 8) break;
  }
  /* ใช้บ่อยที่สุด: หมวด + Company + คู่ค้า */
  const cnt = new Map();
  for (const r of scored.filter(r => r.score >= 4)) { const k = [r.category_id, r.entity_id || '', r.contact_id || ''].join('|'); const g = cnt.get(k) || { ...r, n: 0 }; g.n++; cnt.set(k, g); }
  const top = [...cnt.values()].sort((a, b) => b.n - a.n)[0] || null;
  /* หมายเหตุ: ใช้เฉพาะเมื่อซ้ำกันอย่างน้อยครึ่งหนึ่งของกลุ่ม (ร้านเดียวกันซื้อหลายอย่าง เช่น Shopee → ไม่เอาชื่อสินค้าชิ้นเดียวมาใส่) */
  if (top) { const grp = scored.filter(r => r.score >= 4 && [r.category_id, r.entity_id || '', r.contact_id || ''].join('|') === [top.category_id, top.entity_id || '', top.contact_id || ''].join('|'));
    const nc = {}; grp.forEach(r => { if (r.note) nc[r.note] = (nc[r.note] || 0) + 1; });
    const best = Object.entries(nc).sort((a, b) => b[1] - a[1])[0]; top.note = best && best[1] >= 2 && best[1] >= grp.length / 2 ? best[0] : null; }
  /* ⏳ รายการรอตรวจอื่นที่น่าจะเป็นผู้รับ/ร้านเดียวกัน (2026-10-31 · North: "click รายการรอตรวจ → แสดงรายการรอตรวจอื่นที่คาดว่าเป็นรายการเดียวกัน") */
  let pending = [];
  if (url.searchParams.get('include_pending') === '1' && toks.length) {
    const pc = [], pp = [authUserId, exclude];
    for (const t of toks) { pc.push(`LOWER(COALESCE(t.statement_desc,'')) LIKE ?`); pp.push(`%${t}%`); }
    const prow = ((await env.DB.prepare(`SELECT t.transaction_id, t.account_id, substr(t.date,1,10) AS date, t.time, t.total_amount, t.statement_desc, a.name AS account_name,
          (SELECT d.note FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id LIMIT 1) AS note
        FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
        WHERE up.user_id = ? AND t.status = 'PENDING_REVIEW' AND t.transaction_id != ? AND (${pc.join(' OR ')})
        ORDER BY t.date DESC LIMIT 400`).bind(...pp).all()).results) || [];
    const ps = r => { const k = simKey(r.statement_desc); let x = 0; if (key && k === key) x += 6; x += toks.filter(t => k.includes(t)).length * 2;
      if (sign && Math.sign(r.total_amount) === sign) x += 1; else if (sign && Math.sign(r.total_amount) === -sign) x -= 3; return x; };
    const need = Math.min(4, toks.length * 2);   // ต้องตรงทุกคำค้น (หรือข้อความเหมือนกันทั้งบรรทัด)
    pending = prow.map(r => ({ ...r, score: ps(r) })).filter(r => r.score >= need).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 50)
      .map(({ score, ...r }) => ({ ...r, amount: r.total_amount }));
  }
  /* ⚠️ อาจจ่ายซ้ำ (2026-10-31 ข้อ ค): รายการที่ยืนยันแล้ว ยอดเท่ากัน ทิศเดียวกัน วันห่างกันไม่เกิน 3 วัน
     และ (ผู้รับเดียวกัน · หรือบัญชีเดียวกันวันใกล้กันและยอด ≥ 100 เช่น บันทึกจากสลิปแล้วมาซ้ำใน statement) — ยอดใช้เฉพาะตรงนี้ ไม่ใช้กับประวัติ */
  let dup = [];
  const dAmt = Math.abs(Number(url.searchParams.get('amount')) || 0), dDate = /^\d{4}-\d{2}-\d{2}/.exec(url.searchParams.get('date') || '')?.[0];
  if (dAmt && dDate) {
    const drow = ((await env.DB.prepare(`SELECT t.transaction_id, t.account_id, substr(t.date,1,10) AS date, t.total_amount, t.statement_desc, a.name AS account_name,
          (SELECT d.note FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id LIMIT 1) AS note
        FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
        WHERE up.user_id = ? AND t.status = 'CONFIRMED' AND t.transaction_id != ? AND ABS(ABS(t.total_amount) - ?) < 0.01
          AND substr(t.date,1,10) BETWEEN date(?, '-3 day') AND date(?, '+3 day') LIMIT 50`).bind(authUserId, exclude, dAmt, dDate, dDate).all()).results) || [];
    const days = d => Math.abs((Date.parse(d) - Date.parse(dDate)) / 864e5);
    dup = drow.filter(r => !(sign && Math.sign(r.total_amount) === -sign)).filter(r => {
      const hay = `${simKey(r.statement_desc)} ${simKey(r.note)}`, payee = (key && simKey(r.statement_desc) === key) || toks.some(t => hay.includes(t));
      return payee || (acc && r.account_id === acc && dAmt >= 100 && days(r.date) <= 1);
    }).slice(0, 5).map(r => ({ transaction_id: r.transaction_id, date: r.date, amount: r.total_amount, statement_desc: r.statement_desc, account_name: r.account_name, note: r.note }));
  }
  const pick = r => r && ({ category_id: r.category_id, category_name: r.category_name, caption_id: r.caption_id, entity_id: r.entity_id, entity_name: r.entity_name, contact_id: r.contact_id, contact_name: r.contact_name, note: r.note, type: r.type });
  return json({ items: items.map(r => ({ transaction_id: r.transaction_id, date: r.date, amount: r.total_amount, statement_desc: r.statement_desc, account_name: r.account_name, ...pick(r) })),
    summary: top && top.n >= 2 ? { ...pick(top), n: top.n } : null, pending, dup }, cors);
}
