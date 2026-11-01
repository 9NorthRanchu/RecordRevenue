// ═══════════════════════════════════════════════════════════════════════
// 🔁 เปลี่ยนรหัส ID ในหน้าตั้งค่า → ตามไปทุกตาราง (v275 · North: "กรณีต้องการเปลี่ยนรหัส id ด้วยจะต้องทำยังไง")
//  เดิม index.js ย้ายแค่ตารางหลัก (รายการ/รายการย่อย/บัญชี/สิทธิ์/หมวด) → ตารางที่เพิ่มทีหลัง (Balance Check, หัว statement,
//  กฎอัตโนมัติ, ยอดยกมา, ทรัพย์สิน, หนี้, ประกัน, Drive, ค่าเริ่มต้น Company ฯลฯ) ยังชี้รหัสเก่า
//  ตอนนี้: อ่านโครงสร้างฐานข้อมูลจริง (sqlite_master + PRAGMA table_info) แล้วอัปเดตทุกคอลัมน์ที่เก็บรหัสชนิดนั้น
//  + แก้ใน JSON (OpeningSets.lines) · รวมเป็น batch เดียวกับการเปลี่ยนรหัส (สำเร็จทั้งหมดหรือไม่เปลี่ยนเลย)
// ═══════════════════════════════════════════════════════════════════════
export const ID_COLS = {
  account: ['account_id', 'anchor_account_id', 'counter_account_id', 'pay_account_id', 'linked_account_id'],
  entity: ['entity_id', 'tx_entity_id', 'default_entity_id'],
  category: ['category_id', 'expense_category_id', 'interest_category_id', 'principal_category_id', 'default_category_id'],
  contact: ['contact_id', 'default_contact_id'],
  caption: ['caption_id'],
};
/* ตารางต้นทางของแต่ละชนิด (INSERT/DELETE ทำใน index.js อยู่แล้ว) */
const MASTER = { account: 'Accounts', entity: 'Entities', category: 'Categories', contact: 'Contacts', caption: 'Captions' };
const JSON_KEYS = { account: ['account_id'], entity: ['entity_id'], category: ['category_id'], contact: ['contact_id'], caption: [] };

async function schema(env) {
  const t = ((await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).all()).results || []).map(r => r.name);
  const out = {};
  for (const name of t) {
    if (/^Trip/.test(name) || !/^\w+$/.test(name)) continue;
    try { out[name] = ((await env.DB.prepare(`PRAGMA table_info(${name})`).all()).results || []).map(c => c.name); } catch { /* ข้าม */ }
  }
  return out;
}

/* คืนรายการ statement ที่ต้องรันเพิ่ม (ใส่ก่อนลบแถวเก่า) + สรุปว่าแตะตารางไหน */
export async function idCascade(env, type, oldId, newId) {
  const cols = ID_COLS[type]; if (!cols || !oldId || !newId || oldId === newId) return { statements: [], touched: [] };
  const tables = await schema(env), statements = [], touched = [];
  for (const [table, tcols] of Object.entries(tables)) {
    for (const c of tcols) {
      if (!cols.includes(c)) continue;
      if (table === MASTER[type] && (c === `${type}_id` || (type === 'caption' && c === 'type_id'))) continue;
      statements.push(env.DB.prepare(`UPDATE ${table} SET ${c} = ? WHERE ${c} = ?`).bind(newId, oldId));
      touched.push(`${table}.${c}`);
    }
  }
  /* JSON: ยอดยกมา (บรรทัดในชุดเก็บรหัสบัญชี/หมวด/Company) */
  const keys = JSON_KEYS[type] || [];
  if (keys.length && tables.OpeningSets?.includes('lines')) {
    const rows = ((await env.DB.prepare(`SELECT set_id, lines FROM OpeningSets WHERE lines LIKE ?`).bind(`%${oldId}%`).all()).results) || [];
    for (const r of rows) {
      let lines; try { lines = JSON.parse(r.lines || '[]'); } catch { continue; }
      let hit = false;
      for (const l of Array.isArray(lines) ? lines : []) for (const k of keys) if (l && l[k] === oldId) { l[k] = newId; hit = true; }
      if (hit) { statements.push(env.DB.prepare(`UPDATE OpeningSets SET lines = ? WHERE set_id = ?`).bind(JSON.stringify(lines), r.set_id)); touched.push('OpeningSets.lines'); }
    }
  }
  return { statements, touched };
}
