// ═══════════════════════════════════════════════════════════════════════════
// กันการตัดชำระลูกหนี้/เจ้าหนี้หาย เวลาแก้รายการ (2026-10-11)
//
// ปัญหาเดิม: แก้รายการ = ลบบรรทัดย่อยทั้งหมดแล้วใส่ใหม่ → ตาราง Settlements ผูกกับบรรทัดย่อย
// แบบ ON DELETE CASCADE จึงถูกลบตามเงียบ ๆ ยอดลูกหนี้ที่ "ชำระแล้ว" กลับมาค้างใหม่
//
// วิธีแก้: ก่อนลบ จำการตัดชำระที่ผูกกับรายการนี้ไว้
//   · บรรทัดใหม่ที่ หมวด + คู่ค้า + ยอด เหมือนบรรทัดเดิม → ใช้รหัสบรรทัดเดิม (การตัดชำระยังชี้ถูก)
//   · หลังใส่บรรทัดใหม่ ใส่การตัดชำระกลับใน batch เดียวกัน (สำเร็จหรือไม่สำเร็จพร้อมกัน)
//   · ถ้าบรรทัดที่มีการตัดชำระถูกแก้ยอด/หมวด/คู่ค้า → ปฏิเสธ ให้ยกเลิกการตัดชำระก่อน (ไม่เดาแทนคน)
// ═══════════════════════════════════════════════════════════════════════════
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export async function planSettlementKeep(env, txId, newDetails) {
  let rows;
  try {
    rows = (await env.DB.prepare(
      `SELECT s.settlement_id, s.parent_detail_id, s.child_detail_id, s.settled_amount,
              d.detail_id AS did, d.category_id, d.contact_id, d.amount
         FROM Settlements s JOIN TransactionDetails d ON d.detail_id = s.parent_detail_id WHERE d.transaction_id = ?
       UNION ALL
       SELECT s.settlement_id, s.parent_detail_id, s.child_detail_id, s.settled_amount,
              d.detail_id, d.category_id, d.contact_id, d.amount
         FROM Settlements s JOIN TransactionDetails d ON d.detail_id = s.child_detail_id WHERE d.transaction_id = ?`
    ).bind(txId, txId).all()).results || [];
  } catch { return { ops: [] }; }                       // ไม่มีตาราง Settlements → ไม่มีอะไรต้องกัน
  if (!rows.length) return { ops: [] };

  const settled = new Map();
  for (const r of rows) settled.set(r.did, { category_id: r.category_id, contact_id: r.contact_id || null, amount: r2(r.amount) });
  const used = new Set();
  for (const nd of newDetails) {
    if (nd.detail_id && settled.has(nd.detail_id) && !used.has(nd.detail_id)) { used.add(nd.detail_id); continue; }
    for (const [id, o] of settled) {
      if (used.has(id)) continue;
      if (o.category_id === (nd.category_id || o.category_id) && o.contact_id === (nd.contact_id || null) && Math.abs(o.amount - r2(nd.amount)) < 0.005) {
        nd.detail_id = id; used.add(id); break;
      }
    }
  }
  const lost = [...settled.keys()].filter(id => !used.has(id));
  if (lost.length) {
    return { error: 'บรรทัดที่มีการตัดชำระลูกหนี้/เจ้าหนี้ผูกอยู่ถูกแก้ยอด หมวด หรือคู่ค้า — ยกเลิกการตัดชำระก่อน แล้วค่อยแก้', status: 409 };
  }
  const seen = new Set();
  const ops = [];
  for (const s of rows) {
    if (seen.has(s.settlement_id)) continue;
    seen.add(s.settlement_id);
    ops.push(env.DB.prepare(
      `INSERT OR IGNORE INTO Settlements (settlement_id, parent_detail_id, child_detail_id, settled_amount)
       SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM TransactionDetails WHERE detail_id = ?)
                           AND EXISTS (SELECT 1 FROM TransactionDetails WHERE detail_id = ?)`
    ).bind(s.settlement_id, s.parent_detail_id, s.child_detail_id, s.settled_amount, s.parent_detail_id, s.child_detail_id));
  }
  return { ops };
}
