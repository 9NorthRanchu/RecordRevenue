// ═══════════════════════════════════════════════════════════════════════════
// 📒 รายงานยอดสะสมต่อ statement (2026-10-30 · North: "หาความไม่สมบูรณ์หรือรายการที่ขาดหายไปของแต่ละ statement
//    ให้แสดงรายการเคลื่อนไหว และยอดคงเหลือรายบรรทัด")
//
//  · ตอนนำเข้า statement: เก็บ "หัว statement" (StatementImports: ช่วงวันที่ ยอดยกมา ยอดยกไป ไฟล์)
//    และต่อรายการ: stmt_id (มาจาก statement ไหน) · stmt_seq (ลำดับบรรทัด) · stmt_balance (ยอดคงเหลือที่ธนาคารพิมพ์ — ตามมุมธนาคาร
//    บัตรเครดิต = ยอดค้างเป็นบวก · ไม่มีพิมพ์ = null)
//  · นำเข้า statement เดิมซ้ำ → รายการซ้ำถูกข้ามเหมือนเดิม แต่ "เติม" stmt_* ให้ถ้ายังว่าง (ใช้เติมยอดรายบรรทัดย้อนหลังได้)
//  · GET /api/reports/statement-running → ยอดก่อนช่วง + ทุกรายการในช่วง (ยืนยัน + รอตรวจ) + หัว statement + จุดตรวจยอด
//    การคิดยอดสะสม/หาจุดผิด ทำฝั่งหน้าเว็บ (buildStatementRunning ใน app.js) เพื่อออก Excel/PDF
// ═══════════════════════════════════════════════════════════════════════════

const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const numOrNull = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : r2(v);

/* รายการนำเข้ารุ่นเก่าที่รอตรวจเก็บยอดจ่ายเป็นบวก → กลับเครื่องหมายจากประเภทบรรทัดย่อย (เหมือน balance-at) */
export const SIGNED_AMOUNT_SQL = `CASE WHEN t.status = 'PENDING_REVIEW' AND t.total_amount > 0
  AND EXISTS (SELECT 1 FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id AND d.type = 'EXPENSE') THEN -t.total_amount ELSE t.total_amount END`;

let ready = false;
/* เพิ่มคอลัมน์/ตารางครั้งแรกที่ใช้ (D1 ไม่มี ADD COLUMN IF NOT EXISTS → ดู PRAGMA ก่อน) */
export async function ensureStmtCols(env) {
  if (ready) return;
  const cols = new Set(((await env.DB.prepare(`PRAGMA table_info(Transactions)`).all()).results || []).map(c => c.name));
  for (const [c, t] of [['stmt_id', 'TEXT'], ['stmt_seq', 'INTEGER'], ['stmt_balance', 'REAL']])
    if (!cols.has(c)) { try { await env.DB.prepare(`ALTER TABLE Transactions ADD COLUMN ${c} ${t}`).run(); } catch { /* มีแล้ว (แข่งกัน) */ } }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS StatementImports (stmt_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_from TEXT, period_to TEXT,
    opening REAL, closing REAL, line_count INTEGER, file_name TEXT, source_kind TEXT, created_by TEXT, created_at TEXT)`).run();
  try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_stmtimports_acc ON StatementImports(account_id, period_to)`).run(); } catch { /* */ }
  ready = true;
}
export function _resetStmtReady() { ready = false; }   // ใช้ในเทส

/* ค่า stmt_* จาก body ของ POST /api/transactions (ถ้าไม่ส่ง → null ทั้งหมด) */
export function stmtFields(body) {
  const id = body && typeof body.stmt_id === 'string' && /^[\w-]{4,60}$/.test(body.stmt_id) ? body.stmt_id : null;
  const seq = body && Number.isInteger(Number(body.stmt_seq)) && body.stmt_seq !== null && body.stmt_seq !== '' ? Number(body.stmt_seq) : null;
  return { stmt_id: id, stmt_seq: id ? seq : null, stmt_balance: id ? numOrNull(body.stmt_balance) : null };
}

/* ลบหัว statement ที่ไม่เหลือรายการแล้ว + จุดตรวจยอดที่มาจาก statement นั้น (2026-10-30 · North: "นำเข้าผิดบัญชี/บริษัท" ลบรายการแล้วหัวยังค้าง)
   จุดตรวจ: บัญชีเดียวกัน · source STATEMENT · วันที่อยู่ในช่วง statement ถึง +10 วัน (ใบแจ้งยอดบัตรใช้วันสรุปยอด) */
export async function cleanupStatementHeaders(env, stmtIds) {
  const ids = [...new Set((stmtIds || []).filter(Boolean))];
  let removed = 0;
  for (const id of ids) {
    const h = await env.DB.prepare(`SELECT stmt_id, account_id, period_from, period_to FROM StatementImports WHERE stmt_id = ?`).bind(id).first().catch(() => null);
    if (!h) continue;
    const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM Transactions WHERE stmt_id = ?`).bind(id).first())?.n || 0;
    if (n) continue;
    await env.DB.prepare(`DELETE FROM StatementImports WHERE stmt_id = ?`).bind(id).run();
    try { await env.DB.prepare(`DELETE FROM AccountCheckpoints WHERE account_id = ? AND source = 'STATEMENT' AND as_of >= ? AND as_of <= date(?, '+10 day')`)
      .bind(h.account_id, h.period_from, h.period_to).run(); } catch { /* ไม่มีตาราง */ }
    removed++;
  }
  return removed;
}

export async function handleStmtReport({ url, request, env, cors, authUserId, canUseAccount, deny }) {
  const p = url.pathname;
  if (!['/api/statements/header', '/api/reports/statement-running', '/api/transactions/duplicates', '/api/transactions/merge', '/api/statements/delete'].includes(p)) return null;
  await ensureStmtCols(env);

  /* หัว statement: ส่งก่อนนำเข้ารายการ → ได้ stmt_id กลับไปใส่ทุกบรรทัด
     statement เดิม (บัญชี + ช่วงวันที่ + ยอดยกไป ตรงกัน) → ใช้ stmt_id เดิม (นำเข้าซ้ำไม่เกิดหัวซ้ำ) */
  if (p === '/api/statements/header' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const acc = String(b.account_id || '');
    if (!acc || !isDate(b.period_from) || !isDate(b.period_to)) return json({ error: 'ต้องระบุ account_id, period_from, period_to' }, cors, 400);
    if (!(await canUseAccount(acc))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    const opening = numOrNull(b.opening), closing = numOrNull(b.closing);
    const same = await env.DB.prepare(`SELECT stmt_id FROM StatementImports WHERE account_id = ? AND period_from = ? AND period_to = ?
        AND ((closing IS NULL AND ? IS NULL) OR ABS(closing - ?) < 0.005)`).bind(acc, b.period_from, b.period_to, closing, closing ?? 0).first();
    /* check_only (2026-10-30 · นำเข้าหลายไฟล์): ถามอย่างเดียวว่าเคยนำเข้า statement นี้แล้วไหม ไม่บันทึก */
    if (b.check_only) {
      const n = same ? (await env.DB.prepare(`SELECT COUNT(*) AS n FROM Transactions WHERE stmt_id = ?`).bind(same.stmt_id).first())?.n || 0 : 0;
      return json({ exists: !!same, stmt_id: same?.stmt_id || null, lines_in_system: n }, cors);
    }
    const stmtId = same?.stmt_id || `STM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    await env.DB.prepare(`INSERT OR REPLACE INTO StatementImports (stmt_id, account_id, period_from, period_to, opening, closing, line_count, file_name, source_kind, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(stmtId, acc, b.period_from, b.period_to, opening, closing, Number(b.line_count) || 0, String(b.file_name || '').slice(0, 200) || null,
        String(b.source_kind || '').slice(0, 20) || null, authUserId, new Date().toISOString()).run();
    return json({ success: true, stmt_id: stmtId, reused: !!same }, cors);
  }

  if (p === '/api/reports/statement-running' && request.method === 'GET') {
    const acc = url.searchParams.get('account_id') || '', from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
    if (!acc || !isDate(from) || !isDate(to)) return json({ error: 'ต้องระบุ account_id, from, to (YYYY-MM-DD)' }, cors, 400);
    if (!(await canUseAccount(acc))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    const account = await env.DB.prepare(`SELECT account_id, name, bank_name, account_number, account_type FROM Accounts WHERE account_id = ?`).bind(acc).first();
    const before = await env.DB.prepare(`SELECT ROUND(COALESCE(SUM(${SIGNED_AMOUNT_SQL}), 0), 2) AS bal, COUNT(*) AS n FROM Transactions t
        WHERE t.account_id = ? AND substr(t.date, 1, 10) < ?`).bind(acc, from).first();
    const rows = ((await env.DB.prepare(`SELECT t.transaction_id, substr(t.date, 1, 10) AS date, t.time, t.statement_desc, t.ref_code, t.status, t.source,
          ROUND(${SIGNED_AMOUNT_SQL}, 2) AS amount, t.stmt_id, t.stmt_seq, t.stmt_balance, t.created_at,
          CASE WHEN t.slip_image_url IS NOT NULL AND t.slip_image_url != '' THEN 1 ELSE 0 END AS has_slip,
          (SELECT GROUP_CONCAT(DISTINCT c.name) FROM TransactionDetails d LEFT JOIN Categories c ON c.category_id = d.category_id WHERE d.transaction_id = t.transaction_id) AS categories,
          (SELECT GROUP_CONCAT(DISTINCT d.note) FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id AND d.note IS NOT NULL AND d.note != '') AS notes
        FROM Transactions t WHERE t.account_id = ? AND substr(t.date, 1, 10) >= ? AND substr(t.date, 1, 10) <= ?
        ORDER BY substr(t.date, 1, 10), CASE WHEN t.stmt_seq IS NULL THEN 1 ELSE 0 END, t.stmt_id, t.stmt_seq, t.time, t.created_at LIMIT 6000`)
      .bind(acc, from, to).all()).results) || [];
    const headers = ((await env.DB.prepare(`SELECT stmt_id, period_from, period_to, opening, closing, line_count, file_name, source_kind, created_at
        FROM StatementImports WHERE account_id = ? AND period_to >= ? AND period_from <= ? ORDER BY period_from, created_at`).bind(acc, from, to).all()).results) || [];
    let checkpoints = [];
    try {
      checkpoints = ((await env.DB.prepare(`SELECT as_of, balance, source FROM AccountCheckpoints WHERE account_id = ? AND as_of >= ? AND as_of <= ? ORDER BY as_of`)
        .bind(acc, from, to).all()).results) || [];
    } catch { /* ยังไม่มีตาราง */ }
    return json({ account, from, to, opening: before?.bal || 0, opening_count: before?.n || 0, rows, headers, checkpoints, truncated: rows.length >= 6000 }, cors);
  }

  /* ลบหัว statement เอง (ปุ่มในรายงาน · หัวที่ไม่มีรายการเหลือ เช่น นำเข้าผิดบัญชีแล้วลบรายการไปแล้ว) */
  if (p === '/api/statements/delete' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const h = await env.DB.prepare(`SELECT account_id FROM StatementImports WHERE stmt_id = ?`).bind(String(b.stmt_id || '')).first();
    if (!h || !(await canUseAccount(h.account_id))) return json({ error: 'ไม่พบ statement นี้' }, cors, 404);
    const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM Transactions WHERE stmt_id = ?`).bind(String(b.stmt_id)).first())?.n || 0;
    if (n) return json({ error: `ยังมีรายการจาก statement นี้ ${n} รายการ — ลบรายการก่อน (หน้ารอตรวจสอบ → ลบทั้งชุดที่นำเข้า)` }, cors, 409);
    return json({ success: true, removed: await cleanupStatementHeaders(env, [String(b.stmt_id)]) }, cors);
  }

  /* 🔁 รายการซ้ำ (2026-10-30 · North: "ทำไมมีข้อมูลซ้ำ") — บรรทัด statement ที่รอตรวจ ซ้ำกับรายการเดิมที่ยืนยันแล้ว
     (ข้อมูลเก่าที่จด/นำเข้าจาก Excel ไว้ก่อน ไม่มีเวลา ไม่ได้มาจาก statement) ยอดเท่ากัน เครื่องหมายเดียวกัน ห่าง ≤ 3 วัน
     จับคู่ 1:1 (ใกล้วันที่สุดก่อน) · คืนเฉพาะคู่ ไม่แก้ข้อมูล */
  if (p === '/api/transactions/duplicates' && request.method === 'GET') {
    const acc = url.searchParams.get('account_id');
    if (acc && !(await canUseAccount(acc))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    const sg = SIGNED_AMOUNT_SQL;
    const rows = ((await env.DB.prepare(`SELECT p.transaction_id AS pending_id, k.transaction_id AS keep_id, p.account_id,
          substr(p.date,1,10) AS p_date, p.time AS p_time, p.statement_desc AS p_desc, ROUND(${sg.replace(/\bt\./g, 'p.')}, 2) AS amount,
          substr(k.date,1,10) AS k_date, k.statement_desc AS k_desc, k.status AS k_status, k.source AS k_source,
          (SELECT GROUP_CONCAT(DISTINCT c.name) FROM TransactionDetails d LEFT JOIN Categories c ON c.category_id = d.category_id WHERE d.transaction_id = k.transaction_id) AS k_categories,
          (SELECT GROUP_CONCAT(DISTINCT d.note) FROM TransactionDetails d WHERE d.transaction_id = k.transaction_id AND d.note IS NOT NULL AND d.note != '') AS k_notes,
          ABS(julianday(substr(p.date,1,10)) - julianday(substr(k.date,1,10))) AS gap
        FROM Transactions p
        JOIN Accounts a ON a.account_id = p.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
        JOIN Transactions k ON k.account_id = p.account_id AND k.transaction_id != p.transaction_id AND k.status = 'CONFIRMED'
          AND k.date >= date(substr(p.date,1,10), '-3 day') AND k.date < date(substr(p.date,1,10), '+4 day')
          AND ABS(ABS(k.total_amount) - ABS(p.total_amount)) < 0.005 AND (k.stmt_id IS NULL OR k.stmt_id = '') AND (k.time IS NULL OR k.time = '')
        WHERE p.status = 'PENDING_REVIEW' AND p.source = 'PDF_IMPORT' ${acc ? 'AND p.account_id = ?' : ''}
          AND ((${sg.replace(/\bt\./g, 'p.')}) < 0) = ((${sg.replace(/\bt\./g, 'k.')}) < 0)
        ORDER BY gap, p.date LIMIT 3000`).bind(...(acc ? [authUserId, acc] : [authUserId])).all()).results) || [];
    const usedP = new Set(), usedK = new Set(), pairs = [];
    for (const r of rows) { if (usedP.has(r.pending_id) || usedK.has(r.keep_id)) continue; usedP.add(r.pending_id); usedK.add(r.keep_id); pairs.push(r); }
    return json({ pairs }, cors);
  }

  /* รวมคู่ซ้ำ: เก็บรายการเดิม (หมวด/บริษัท/คู่ค้าที่ยืนยันไว้) + เติมข้อมูลธนาคารจากบรรทัด statement (เวลา ข้อความ เลขอ้างอิง ยอดคงเหลือรายบรรทัด สลิป)
     ข้อความเดิมของรายการเก่าย้ายไปเป็นหมายเหตุ (ถ้ายังว่าง) · ลบบรรทัด statement ที่รอตรวจ · สลิป/ผังรายได้ที่ผูกอยู่ย้ายตาม · ทำได้ทีละ ≤ 100 คู่ */
  if (p === '/api/transactions/merge' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const list = (Array.isArray(b.pairs) ? b.pairs : [{ pending_id: b.pending_id, keep_id: b.keep_id }]).slice(0, 100);
    let merged = 0; const errors = [];
    for (const { pending_id, keep_id } of list) {
      const pt = await env.DB.prepare(`SELECT * FROM Transactions WHERE transaction_id = ?`).bind(String(pending_id || '')).first();
      const kt = await env.DB.prepare(`SELECT * FROM Transactions WHERE transaction_id = ?`).bind(String(keep_id || '')).first();
      if (!pt || !kt || pt.account_id !== kt.account_id || !(await canUseAccount(pt.account_id))) { errors.push(`${pending_id}: ไม่พบ/ไม่มีสิทธิ์`); continue; }
      if (pt.status !== 'PENDING_REVIEW') { errors.push(`${pending_id}: ยืนยันไปแล้ว`); continue; }
      if (Math.abs(Math.abs(pt.total_amount) - Math.abs(kt.total_amount)) >= 0.005) { errors.push(`${pending_id}: ยอดไม่เท่ากัน`); continue; }
      const ops = [
        env.DB.prepare(`UPDATE TransactionDetails SET note = ? WHERE transaction_id = ? AND (note IS NULL OR note = '') AND ? IS NOT NULL
            AND (SELECT COUNT(*) FROM TransactionDetails x WHERE x.transaction_id = ?) = 1`).bind(kt.statement_desc, kt.transaction_id, kt.statement_desc, kt.transaction_id),
        env.DB.prepare(`UPDATE Transactions SET date = ?, time = COALESCE(?, time), statement_desc = COALESCE(?, statement_desc), ref_code = COALESCE(ref_code, ?),
            slip_image_url = COALESCE(NULLIF(slip_image_url, ''), ?), stmt_id = COALESCE(?, stmt_id), stmt_seq = COALESCE(?, stmt_seq), stmt_balance = COALESCE(?, stmt_balance)
            WHERE transaction_id = ?`).bind(pt.date, pt.time || null, pt.statement_desc || null, pt.ref_code || null, pt.slip_image_url || null,
            pt.stmt_id || null, pt.stmt_seq ?? null, pt.stmt_balance ?? null, kt.transaction_id),
        env.DB.prepare(`UPDATE OR IGNORE LedgerDocLinks SET transaction_id = ? WHERE transaction_id = ?`).bind(kt.transaction_id, pt.transaction_id),
        env.DB.prepare(`DELETE FROM LedgerDocLinks WHERE transaction_id = ?`).bind(pt.transaction_id),
        env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(pt.transaction_id),
        env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id = ? AND status = 'PENDING_REVIEW'`).bind(pt.transaction_id),
      ];
      try { await env.DB.prepare(`SELECT 1 FROM RevenueChart LIMIT 1`).first(); ops.push(env.DB.prepare(`UPDATE RevenueChart SET matched_tx = NULL WHERE matched_tx = ?`).bind(pt.transaction_id)); } catch { /* ไม่มีตาราง */ }
      try { await env.DB.batch(ops); merged++; } catch (e) { errors.push(`${pending_id}: ${e.message}`); }
    }
    return json({ success: true, merged, errors }, cors);
  }
  return null;
}
