// ═══════════════════════════════════════════════════════════════════════════
// ยอดยกมา (2026-10-12 · ตามที่ North กำหนด: 1ก 2ก 3ข + บัญชีพักแบบ Dr/Cr)
//
//  · "ชุดยอดยกมา" = ชื่อ + เจ้าของ (บริษัท/บุคคล) + วันที่เริ่ม — แต่ละคนเริ่มคนละวันได้ · มีหลายชุดได้
//    บัญชี 1 บัญชี / สัญญาเงินกู้ 1 สัญญา อยู่ได้ชุดเดียว (กันยอดซ้ำ)
//  · บรรทัดในชุด (ทุกบรรทัดระบุฝั่ง เดบิต/เครดิต):
//      ACC  บัญชีธนาคาร/เงินสด/บัตร — เดบิต = มีเงิน · เครดิต = ค้างจ่าย (บัตร)
//      CAT  หมวดใดก็ได้ + คู่ค้า (ไม่บังคับ) — ลูกหนี้/เจ้าหนี้ ทรัพย์สิน ทุน รายได้/ค่าใช้จ่ายสะสมต้นปี ฯลฯ
//      LOAN สัญญาเงินกู้/ผ่อน (ตาราง Debts) — ฝั่งตามประเภทสัญญา · บันทึกแล้วตั้งยอดเริ่มต้น+วันเริ่มของสัญญาให้ตรงกัน
//  · ทุกบรรทัดจับคู่กับ "บัญชีพักยอดยกมา" (หมวดระบบ ประเภท TRANSFER ไม่นับรับ-จ่าย)
//      → ยอดบัญชีพักของชุด = เดบิตรวม − เครดิตรวม · ต้องเป็น 0 = นำเข้าถูกฝั่งครบ (เหมือน Dr = Cr)
//  · สร้างเป็นรายการจริง (status CONFIRMED · ref_code 'OPENING' · รหัสคงที่ TX-OB-{set}-…) — ยอดบัญชี/ลูกหนี้/รายงาน เห็นทันที
//      ACC  → TX-OB-{set}-A{n} ในบัญชีนั้น ยอดรวม ±ยอด · บรรทัดเดียว (บัญชีพัก)
//      CAT/LOAN → TX-OB-{set}-J ใน "บัญชีที่ใช้บันทึก" ยอดรวม 0 · บรรทัดละหมวด + บรรทัดบัญชีพักปิดยอด
//      ฝั่งของบรรทัดย่อย: เดบิต = ยอดลบ (เหมือนเงินออกไปเป็นสินทรัพย์/ค่าใช้จ่าย) · เครดิต = ยอดบวก
//  · แก้ชุด = ลบรายการเดิมของชุดแล้วสร้างใหม่ในครั้งเดียว (batch) · ติดล็อกปิดเดือน (409)
//  · 1ก: ค่าใช้จ่าย/รายได้สะสมต้นปีนับในรายงานรับ-จ่าย ณ วันเริ่ม (type EXPENSE/INCOME)
//  · 2ก: เตือนรายการก่อนวันเริ่มของบัญชี + ปิดเดือนไม่ผ่าน (ดู openingIssues ใน period-close.js)
//  · 3ข: ทุกคนสร้าง/แก้ได้ เฉพาะบัญชี/สัญญาที่ตัวเองมีสิทธิ์
// ═══════════════════════════════════════════════════════════════════════════
/* ไม่ import period-close.js (กัน import วน) — error PERIOD_CLOSED ที่โยนออกไป ledger-inbox แปลงเป็น 409 ให้เอง */

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d));
const plain = n => String(n || '').replace(/^\s*\[[^\]]+\]\s*/, '').trim() || String(n || '');
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const qs = a => a.map(() => '?').join(',');
export const OB_PREFIX = 'TX-OB-';
/* ใช้ใน SQL: บรรทัดนี้เป็นของยอดยกมาไหม (กันไม่ให้นับเป็นการจ่ายเงินกู้ / ไม่ดึงเข้าทะเบียนทรัพย์สิน) */
export const NOT_OB_DETAIL = d => `${d}.detail_id NOT LIKE 'DT-OB-%'`;

export const OPENING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS OpeningSets (set_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, entity_id TEXT, date TEXT NOT NULL,
    anchor_account_id TEXT, lines TEXT NOT NULL DEFAULT '[]', created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_opening_family ON OpeningSets (family_id, date)`,
];
let ready = false;
async function ensure(env) { if (ready) return; for (const s of OPENING_SCHEMA) await env.DB.prepare(s).run(); ready = true; }

/* หมวดระบบ "บัญชีพักยอดยกมา" (หัวข้อ "ยอดยกมา" ประเภท TRANSFER) — สร้างให้ครั้งแรกที่ใช้ */
export const suspenseIds = fid => ({ caption: `CAP-OB-${fid}`, category: `CAT-OB-${fid}` });
async function ensureSuspense(env, fid) {
  const ids = suspenseIds(fid);
  const have = await env.DB.prepare(`SELECT category_id, name FROM Categories WHERE category_id = ?`).bind(ids.category).first();
  if (have) return have;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO Captions (type_id, family_id, name, behavior) VALUES (?, ?, 'ยอดยกมา', 'TRANSFER')`).bind(ids.caption, fid),
    env.DB.prepare(`INSERT OR IGNORE INTO Categories (category_id, family_id, name, caption_id, default_type) VALUES (?, ?, 'บัญชีพักยอดยกมา', ?, 'TRANSFER')`).bind(ids.category, fid, ids.caption),
  ]);
  return { category_id: ids.category, name: 'บัญชีพักยอดยกมา' };
}

const parseLines = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const signedDr = l => (l.side === 'CR' ? -1 : 1) * r2(l.amount);           // + = เดบิต
function totals(lines) {
  const dr = r2(lines.filter(l => l.side !== 'CR').reduce((t, l) => t + r2(l.amount), 0));
  const cr = r2(lines.filter(l => l.side === 'CR').reduce((t, l) => t + r2(l.amount), 0));
  return { debit: dr, credit: cr, suspense: r2(dr - cr), balanced: Math.abs(dr - cr) < 0.005 };
}

async function permittedAccounts(env, user) {
  return new Map((((await env.DB.prepare(`SELECT a.account_id, a.name, a.entity_id, IFNULL(a.account_type,'BANK') AS account_type FROM Accounts a
      JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ? JOIN Entities e ON e.entity_id = a.entity_id AND e.family_id = ?`)
    .bind(user.user_id, user.family_id).all()).results) || []).map(a => [a.account_id, a]));
}
async function visibleDebts(env, user) {
  let rows = [];
  try { rows = (await env.DB.prepare(`SELECT * FROM Debts WHERE family_id = ? AND IFNULL(status,'active') != 'deleted'`).bind(user.family_id).all()).results || []; } catch { return new Map(); }
  return new Map(rows.filter(d => { if (!d.members) return true; try { const m = JSON.parse(d.members); return !Array.isArray(m) || !m.length || m.includes(user.user_id); } catch { return true; } }).map(d => [d.debt_id, d]));
}
/* ชุดนี้ผู้ใช้แก้ได้ไหม: ต้องมีสิทธิ์ทุกบัญชีในชุด + บัญชีที่ใช้บันทึก */
const canEditSet = (set, accs) => [set.anchor_account_id, ...parseLines(set.lines).filter(l => l.kind === 'ACC').map(l => l.account_id)].filter(Boolean).every(id => accs.has(id));

/* 2ก: รายการก่อนวันเริ่มของบัญชีในชุด (ไม่นับรายการยอดยกมาเอง) */
async function preStart(env, set) {
  const accIds = [...new Set(parseLines(set.lines).filter(l => l.kind === 'ACC').map(l => l.account_id))];
  if (!accIds.length) return [];
  return (await env.DB.prepare(`SELECT t.account_id, COUNT(*) AS n, MIN(t.date) AS first_date FROM Transactions t
     WHERE t.account_id IN (${qs(accIds)}) AND t.status = 'CONFIRMED' AND t.date < ? AND t.transaction_id NOT LIKE 'TX-OB-%' GROUP BY t.account_id`)
    .bind(...accIds, set.date).all()).results || [];
}

export async function listOpening(env, user) {
  await ensure(env);
  const fid = user.family_id;
  const sets = (await env.DB.prepare(`SELECT * FROM OpeningSets WHERE family_id = ? ORDER BY date, name`).bind(fid).all()).results || [];
  const accs = await permittedAccounts(env, user);
  const susp = await env.DB.prepare(`SELECT category_id, name FROM Categories WHERE category_id = ?`).bind(suspenseIds(fid).category).first();
  // ยอดบัญชีพักจริงในฐานข้อมูล (ทุกชุด) — ควรเป็น 0
  const suspBal = susp ? r2((await env.DB.prepare(`SELECT SUM(d.amount) AS s FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id
      WHERE d.category_id = ? AND t.status = 'CONFIRMED'`).bind(susp.category_id).first())?.s) : 0;
  const out = [];
  for (const s of sets) {
    const lines = parseLines(s.lines);
    const pre = await preStart(env, s);
    out.push({ set_id: s.set_id, name: s.name, entity_id: s.entity_id, date: s.date, anchor_account_id: s.anchor_account_id, lines, ...totals(lines),
      can_edit: canEditSet(s, accs), pre_start: pre.map(p => ({ account_id: p.account_id, account_name: plain(accs.get(p.account_id)?.name || p.account_id), n: p.n, first_date: p.first_date })),
      updated_at: s.updated_at, updated_by: s.updated_by });
  }
  let assetsOpening = 0;
  try { assetsOpening = r2((await env.DB.prepare(`SELECT SUM(amount) AS s FROM AssetItems WHERE family_id = ? AND source = 'OPENING' AND status != 'REMOVED'`).bind(fid).first())?.s); } catch { /* ยังไม่มีทะเบียน */ }
  return {
    sets: out,
    used: { accounts: out.flatMap(s => s.lines.filter(l => l.kind === 'ACC').map(l => ({ account_id: l.account_id, set_id: s.set_id }))),
      debts: out.flatMap(s => s.lines.filter(l => l.kind === 'LOAN').map(l => ({ debt_id: l.debt_id, set_id: s.set_id }))) },
    suspense: susp ? { category_id: susp.category_id, name: plain(susp.name), balance: suspBal } : null,
    assets_opening_total: assetsOpening,
  };
}

/* ตรวจ + สร้างคำสั่ง SQL ของชุด (ใช้ทั้งบันทึกใหม่และแก้) */
async function saveSet(env, user, body) {
  await ensure(env);
  const fid = user.family_id;
  const name = clip(body.name, 80), date = body.date;
  if (!name) return { error: 'ตั้งชื่อชุด เช่น "ยอดยกมา North"', status: 400 };
  if (!validDate(date)) return { error: 'วันที่เริ่มไม่ถูกต้อง', status: 400 };
  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (raw.length > 300) return { error: 'บรรทัดเยอะเกินไป (สูงสุด 300)', status: 400 };
  const accs = await permittedAccounts(env, user), debts = await visibleDebts(env, user);
  let old = null;
  if (body.set_id) {
    old = await env.DB.prepare(`SELECT * FROM OpeningSets WHERE set_id = ? AND family_id = ?`).bind(body.set_id, fid).first();
    if (!old) return { error: 'ไม่พบชุดนี้', status: 404 };
    if (!canEditSet(old, accs)) return { error: 'ชุดนี้มีบัญชีที่คุณไม่มีสิทธิ์ — ให้เจ้าของบัญชีแก้', status: 403 };
  }
  const others = ((await env.DB.prepare(`SELECT set_id, name, lines FROM OpeningSets WHERE family_id = ? AND set_id != ?`).bind(fid, body.set_id || '').all()).results || []);
  const usedAcc = new Map(), usedDebt = new Map();
  for (const o of others) for (const l of parseLines(o.lines)) { if (l.kind === 'ACC') usedAcc.set(l.account_id, o.name); if (l.kind === 'LOAN') usedDebt.set(l.debt_id, o.name); }
  const susp = await ensureSuspense(env, fid);
  // หมวด + หัวข้อ ของครอบครัว
  const catIds = [...new Set(raw.filter(l => l.kind === 'CAT').map(l => String(l.category_id || '')))];
  const cats = new Map();
  for (let i = 0; i < catIds.length; i += 90) {
    const part = catIds.slice(i, i + 90);
    for (const c of ((await env.DB.prepare(`SELECT c.category_id, c.name, cp.behavior FROM Categories c LEFT JOIN Captions cp ON cp.type_id = c.caption_id
        WHERE c.category_id IN (${qs(part)}) AND (c.family_id = ? OR c.family_id IS NULL)`).bind(...part, fid).all()).results || [])) cats.set(c.category_id, c);
  }
  const conIds = [...new Set(raw.map(l => l.contact_id).filter(Boolean).map(String))];
  const cons = new Set();
  for (let i = 0; i < conIds.length; i += 90) {
    const part = conIds.slice(i, i + 90);
    for (const c of ((await env.DB.prepare(`SELECT contact_id FROM Contacts WHERE contact_id IN (${qs(part)}) AND family_id = ?`).bind(...part, fid).all()).results || [])) cons.add(c.contact_id);
  }
  const lines = [], seenAcc = new Set(), seenDebt = new Set();
  for (const [i, l] of raw.entries()) {
    const n = i + 1, amount = r2(l.amount);
    if (!amount) continue;                                        // ช่องว่าง/0 = ไม่ใส่
    if (amount < 0 || amount > 1e12) return { error: `บรรทัด ${n}: ใส่จำนวนเงินเป็นบวก แล้วเลือกฝั่ง เดบิต/เครดิต`, status: 400 };
    const side = l.side === 'CR' ? 'CR' : 'DR', note = clip(l.note, 200) || null;
    if (l.kind === 'ACC') {
      const a = accs.get(l.account_id);
      if (!a) return { error: `บรรทัด ${n}: ไม่พบบัญชี หรือคุณไม่มีสิทธิ์`, status: 403 };
      if (seenAcc.has(a.account_id)) return { error: `บัญชี ${plain(a.name)} ใส่ซ้ำในชุดนี้`, status: 400 };
      if (usedAcc.has(a.account_id)) return { error: `บัญชี ${plain(a.name)} มียอดยกมาในชุด "${usedAcc.get(a.account_id)}" แล้ว`, status: 409 };
      seenAcc.add(a.account_id);
      lines.push({ kind: 'ACC', account_id: a.account_id, side, amount, note });
    } else if (l.kind === 'LOAN') {
      const d = debts.get(l.debt_id);
      if (!d) return { error: `บรรทัด ${n}: ไม่พบสัญญาเงินกู้`, status: 404 };
      if (seenDebt.has(d.debt_id) || usedDebt.has(d.debt_id)) return { error: `สัญญา ${d.name} มียอดยกมาแล้ว${usedDebt.has(d.debt_id) ? ` ในชุด "${usedDebt.get(d.debt_id)}"` : ''}`, status: 409 };
      seenDebt.add(d.debt_id);
      lines.push({ kind: 'LOAN', debt_id: d.debt_id, side: d.type === 'RECEIVABLE' ? 'DR' : 'CR', amount, note });
    } else if (l.kind === 'CAT') {
      const c = cats.get(String(l.category_id || ''));
      if (!c) return { error: `บรรทัด ${n}: เลือกหมวด`, status: 400 };
      if (c.category_id === susp.category_id) return { error: `บรรทัด ${n}: ใช้บัญชีพักยอดยกมาเป็นบรรทัดไม่ได้ (ระบบปิดยอดให้เอง)`, status: 400 };
      if (l.contact_id && !cons.has(String(l.contact_id))) return { error: `บรรทัด ${n}: ไม่พบคู่ค้า`, status: 400 };
      lines.push({ kind: 'CAT', category_id: c.category_id, contact_id: l.contact_id || null, side, amount, note });
    } else return { error: `บรรทัด ${n}: ประเภทบรรทัดไม่ถูกต้อง`, status: 400 };
  }
  if (!lines.length) return { error: 'ยังไม่มีบรรทัดที่มีจำนวนเงิน', status: 400 };
  const needJ = lines.some(l => l.kind !== 'ACC');
  let anchor = null;
  if (needJ) {
    anchor = accs.get(body.anchor_account_id) || accs.get(lines.find(l => l.kind === 'ACC')?.account_id);
    if (!anchor) return { error: 'เลือก "บัญชีที่ใช้บันทึก" สำหรับลูกหนี้/หนี้สิน/หมวดอื่น (ยอดเงินในบัญชีไม่เปลี่ยน)', status: 400 };
  }
  let entityId = body.entity_id || null;
  if (entityId && !(await env.DB.prepare(`SELECT 1 FROM UserPermissions WHERE user_id = ? AND entity_id = ?`).bind(user.user_id, entityId).first())) return { error: 'ไม่มีสิทธิ์ในเจ้าของที่เลือก', status: 403 };

  const setId = old?.set_id || `OB${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString(), desc = `ยอดยกมา: ${name}`.slice(0, 200);
  const st = [];
  // ลบรายการเดิมของชุด (ถ้าแก้)
  st.push(env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id LIKE ?`).bind(`${OB_PREFIX}${setId}-%`));
  st.push(env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id LIKE ?`).bind(`${OB_PREFIX}${setId}-%`));
  const insTx = (id, acc, total) => env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
      VALUES (?, ?, 'OPENING', ?, NULL, ?, ?, 'CONFIRMED', 'WEB_GRID', NULL, ?)`).bind(id, acc, date, total, desc, user.user_id);
  const insD = (id, tx, amount, cat, ent, con, note, type) => env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type)
      VALUES (?, ?, ?, 0, 0, ?, ?, ?, NULL, ?, ?)`).bind(id, tx, amount, cat, ent || null, con || null, (note || 'ยอดยกมา').slice(0, 200), type);
  lines.forEach((l, i) => {
    if (l.kind !== 'ACC') return;
    const a = accs.get(l.account_id), v = signedDr(l), tx = `${OB_PREFIX}${setId}-A${i + 1}`;
    st.push(insTx(tx, a.account_id, v));
    st.push(insD(`DT-OB-${setId}-A${i + 1}`, tx, v, susp.category_id, entityId || a.entity_id, null, l.note || `ยอดยกมา ${plain(a.name)}`, 'TRANSFER'));
  });
  if (needJ) {
    const tx = `${OB_PREFIX}${setId}-J`, ent = entityId || anchor.entity_id;
    st.push(insTx(tx, anchor.account_id, 0));
    let sum = 0;
    lines.forEach((l, i) => {
      if (l.kind === 'ACC') return;
      const amt = -signedDr(l);                                   // เดบิต = ยอดลบ · เครดิต = ยอดบวก
      sum = r2(sum + amt);
      let cat, con, type;
      if (l.kind === 'LOAN') {
        const d = debts.get(l.debt_id); cat = d.principal_category_id; con = d.contact_id; type = l.side === 'DR' ? 'DEBIT_AR' : 'CREDIT_AR';
      } else {
        const c = cats.get(l.category_id); cat = c.category_id; con = l.contact_id;
        type = c.behavior === 'EXPENSE' ? 'EXPENSE' : c.behavior === 'REVENUE' ? 'INCOME' : c.behavior === 'TRANSFER' ? 'TRANSFER' : (l.side === 'DR' ? 'DEBIT_AR' : 'CREDIT_AR');
      }
      st.push(insD(`DT-OB-${setId}-J${i + 1}`, tx, amt, cat, ent, con, l.note, type));
    });
    st.push(insD(`DT-OB-${setId}-JS`, tx, r2(-sum), susp.category_id, ent, null, 'บัญชีพักยอดยกมา (ปิดยอด)', 'TRANSFER'));
  }
  // สัญญาเงินกู้: ยอดเริ่มต้น + วันเริ่ม = ยอดยกมา (หน้าบัตร & เงินกู้คำนวณยอดคงเหลือจากตรงนี้)
  for (const l of lines.filter(x => x.kind === 'LOAN')) st.push(env.DB.prepare(`UPDATE Debts SET start_balance = ?, start_date = ? WHERE debt_id = ? AND family_id = ?`).bind(l.amount, date, l.debt_id, fid));
  const linesJson = JSON.stringify(lines);
  st.push(old
    ? env.DB.prepare(`UPDATE OpeningSets SET name = ?, entity_id = ?, date = ?, anchor_account_id = ?, lines = ?, updated_by = ?, updated_at = ? WHERE set_id = ?`)
      .bind(name, entityId, date, anchor?.account_id || null, linesJson, user.user_id, now, setId)
    : env.DB.prepare(`INSERT INTO OpeningSets (set_id, family_id, name, entity_id, date, anchor_account_id, lines, created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(setId, fid, name, entityId, date, anchor?.account_id || null, linesJson, user.user_id, now, user.user_id, now));
  await env.DB.batch(st);
  return { ok: true, set_id: setId, ...totals(lines) };
}

async function deleteSet(env, user, id) {
  await ensure(env);
  const s = await env.DB.prepare(`SELECT * FROM OpeningSets WHERE set_id = ? AND family_id = ?`).bind(id, user.family_id).first();
  if (!s) return { error: 'ไม่พบชุดนี้', status: 404 };
  if (!canEditSet(s, await permittedAccounts(env, user))) return { error: 'ชุดนี้มีบัญชีที่คุณไม่มีสิทธิ์', status: 403 };
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id LIKE ?`).bind(`${OB_PREFIX}${id}-%`),
    env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id LIKE ?`).bind(`${OB_PREFIX}${id}-%`),
    env.DB.prepare(`DELETE FROM OpeningSets WHERE set_id = ?`).bind(id),
  ]);
  return { ok: true };
}

/* ใช้ในหน้าปิดเดือน (2ก): ชุดที่เริ่มไม่เกินสิ้นเดือนนี้ ต้องสมดุล และไม่มีรายการก่อนวันเริ่ม */
export async function openingIssues(env, fid, endDate) {
  let sets = [];
  try { sets = (await env.DB.prepare(`SELECT * FROM OpeningSets WHERE family_id = ? AND date <= ?`).bind(fid, endDate).all()).results || []; } catch { return []; }
  const out = [];
  for (const s of sets) {
    const t = totals(parseLines(s.lines));
    if (!t.balanced) out.push(`ชุด "${s.name}" ไม่สมดุล (บัญชีพัก ${t.suspense.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    const pre = await preStart(env, s);
    if (pre.length) out.push(`ชุด "${s.name}" มีรายการก่อนวันเริ่ม ${pre.reduce((n, p) => n + p.n, 0)} รายการ`);
  }
  return out;
}

/*  GET  /api/inbox/opening
    POST /api/inbox/opening {set_id?, name, date, entity_id?, anchor_account_id?, lines:[{kind:'ACC'|'CAT'|'LOAN', side:'DR'|'CR', amount, account_id|category_id+contact_id|debt_id, note}]}
    POST /api/inbox/opening/{set_id}/delete */
export async function handleOpening(request, env, url, cors, user) {
  const p = url.pathname;
  if (p !== '/api/inbox/opening' && !p.startsWith('/api/inbox/opening/')) return null;
  if (p === '/api/inbox/opening' && request.method === 'GET') return json(await listOpening(env, user), cors);
  if (request.method !== 'POST') return null;
  const body = await request.json().catch(() => ({}));
  let out;
  if (p === '/api/inbox/opening') out = await saveSet(env, user, body);
  else { const m = p.match(/^\/api\/inbox\/opening\/([\w-]+)\/delete$/); if (!m) return null; out = await deleteSet(env, user, m[1]); }
  return json(out, cors, out.error ? (out.status || 400) : 200);
}
