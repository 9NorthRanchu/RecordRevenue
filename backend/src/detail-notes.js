// ═══════════════════════════════════════════════════════════════════════
// 📝 Detail จากข้อความ statement (v255 · 2026-11-01 · North: "นำ detail/หมายเหตุใน statement มาใส่ช่อง Detail โดยไม่ต้องโหลดไฟล์ใหม่")
//  POST /api/transactions/fill-detail-notes → รายการรอตรวจ (บัญชีที่มีสิทธิ์) ที่มีบรรทัดย่อยเดียวและ Detail ว่าง → Detail = ข้อความ statement
//  ไม่ทับ Detail ที่มีอยู่แล้ว · ตัด "-" "DESC :" และ "++" ท้ายชื่อที่ถูกตัด (ต้องตรงกับ stmtDetailNote ใน app.js)
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const stmtDetailNote = desc => String(desc || '').split(' · ').map(x => x.trim().replace(/\+\+$/, '')).filter(x => x && x !== '-' && !/^DESC\s*:?$/i.test(x)).join(' · ').slice(0, 200);

export async function handleDetailNotes({ url, request, env, cors, authUserId }) {
  if (url.pathname !== '/api/transactions/fill-detail-notes' || request.method !== 'POST') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  const rows = ((await env.DB.prepare(`SELECT d.detail_id, t.statement_desc FROM TransactionDetails d
      JOIN Transactions t ON t.transaction_id = d.transaction_id
      JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
      WHERE t.status = 'PENDING_REVIEW' AND (d.note IS NULL OR TRIM(d.note) = '') AND IFNULL(TRIM(t.statement_desc), '') != ''
        AND (SELECT COUNT(*) FROM TransactionDetails d2 WHERE d2.transaction_id = t.transaction_id) = 1`).bind(authUserId).all()).results) || [];
  const ops = [];
  for (const r of rows) { const n = stmtDetailNote(r.statement_desc); if (n) ops.push(env.DB.prepare(`UPDATE TransactionDetails SET note = ? WHERE detail_id = ? AND (note IS NULL OR TRIM(note) = '')`).bind(n, r.detail_id)); }
  for (let i = 0; i < ops.length; i += 100) await env.DB.batch(ops.slice(i, i + 100));
  return json({ success: true, filled: ops.length }, cors);
}
