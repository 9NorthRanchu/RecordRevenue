// ═══════════════════════════════════════════════════════════════════════
// 🏢 Company เริ่มต้นของรายการ ต่อบัญชี (v256 · 2026-11-01 · North: "Company default ว่าง ยกเว้น statement ของ
//    BK KBank / BK BBL / BK KKP = Bookkeeper · PRACH KBank = Me Prach · Sorsim KTB = Me Sor Sim Com.")
//  Accounts.tx_entity_id = Company ที่ใส่ให้รายการจากบัญชีนี้ (ว่าง = ไม่ใส่ ให้เลือกเอง) — คนละอย่างกับ entity_id (เจ้าของบัญชี/สิทธิ์)
//  GET  /api/accounts/tx-defaults → { defaults: { account_id: entity_id } }
//  POST /api/accounts/tx-default  { account_id, entity_id|null }
//  POST /api/transactions/apply-company-defaults → รายการรอตรวจจาก statement (PDF_IMPORT): Company = ค่าเริ่มต้นของบัญชี (ไม่มี = ว่าง)
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
/* ค่าตั้งต้นตามที่ North ขอ — ใส่ครั้งเดียวตอนสร้างคอลัมน์ (ชื่อบัญชีต้องตรง และมี Company นั้นจริง) · แก้ภายหลังในตั้งค่า → บัญชี */
const SEED = [['A02', /BK\s*KBANK/i, 'Ent_Co_S01'], ['A03', /BK\s*BBL/i, 'Ent_Co_S01'], ['A12', /BK\s*KKP/i, 'Ent_Co_S01'],
  ['A04', /PRACH\s*KBANK/i, 'Ent_Co_S02'], ['A15', /SORSIM\s*KTB/i, 'Ent_Co_S05']];
let ready = false;
export async function ensureTxEntityCol(env) {
  if (ready) return;
  const cols = new Set((((await env.DB.prepare(`PRAGMA table_info(Accounts)`).all()).results) || []).map(c => c.name));
  if (!cols.has('tx_entity_id')) {
    try { await env.DB.prepare(`ALTER TABLE Accounts ADD COLUMN tx_entity_id TEXT`).run(); } catch { /* แข่งกันสร้าง */ }
    for (const [id, re, ent] of SEED) {
      const a = await env.DB.prepare(`SELECT a.name FROM Accounts a JOIN Entities e ON e.entity_id = ? WHERE a.account_id = ?`).bind(ent, id).first();
      if (a && re.test(a.name || '')) await env.DB.prepare(`UPDATE Accounts SET tx_entity_id = ? WHERE account_id = ? AND tx_entity_id IS NULL`).bind(ent, id).run();
    }
  }
  ready = true;
}
export async function handleAccountDefaults({ url, request, env, cors, authUserId }) {
  const p = url.pathname;
  if (!['/api/accounts/tx-defaults', '/api/accounts/tx-default', '/api/transactions/apply-company-defaults'].includes(p)) return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  await ensureTxEntityCol(env);
  if (p === '/api/accounts/tx-defaults' && request.method === 'GET') {
    const rows = ((await env.DB.prepare(`SELECT a.account_id, a.tx_entity_id FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?`).bind(authUserId).all()).results) || [];
    return json({ defaults: Object.fromEntries(rows.filter(r => r.tx_entity_id).map(r => [r.account_id, r.tx_entity_id])) }, cors);
  }
  if (p === '/api/accounts/tx-default' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const acc = await env.DB.prepare(`SELECT a.account_id FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ? WHERE a.account_id = ?`).bind(authUserId, String(b.account_id || '')).first();
    if (!acc) return json({ error: 'ไม่มีสิทธิ์ใช้บัญชีนี้' }, cors, 403);
    const ent = b.entity_id ? String(b.entity_id) : null;
    if (ent && !(await env.DB.prepare(`SELECT 1 FROM Entities e JOIN Users u ON u.family_id = e.family_id WHERE e.entity_id = ? AND u.user_id = ?`).bind(ent, authUserId).first())) return json({ error: 'ไม่พบ Company นี้' }, cors, 400);
    await env.DB.prepare(`UPDATE Accounts SET tx_entity_id = ? WHERE account_id = ?`).bind(ent, acc.account_id).run();
    return json({ success: true }, cors);
  }
  if (p === '/api/transactions/apply-company-defaults' && request.method === 'POST') {
    const r = await env.DB.prepare(`UPDATE TransactionDetails SET entity_id = (SELECT a.tx_entity_id FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id WHERE t.transaction_id = TransactionDetails.transaction_id)
      WHERE transaction_id IN (SELECT t.transaction_id FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
        WHERE t.status = 'PENDING_REVIEW' AND t.source = 'PDF_IMPORT')
      AND IFNULL(entity_id, '') != IFNULL((SELECT a.tx_entity_id FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id WHERE t.transaction_id = TransactionDetails.transaction_id), '')`).bind(authUserId).run();
    return json({ success: true, changed: r?.meta?.changes ?? 0 }, cors);
  }
  return null;
}
