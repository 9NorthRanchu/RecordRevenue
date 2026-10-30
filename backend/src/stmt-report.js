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

export async function handleStmtReport({ url, request, env, cors, authUserId, canUseAccount, deny }) {
  const p = url.pathname;
  if (p !== '/api/statements/header' && p !== '/api/reports/statement-running') return null;
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
  return null;
}
