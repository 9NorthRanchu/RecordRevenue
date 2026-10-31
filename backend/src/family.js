// ═══════════════════════════════════════════════════════════════════════
// 👨‍👩‍👧 ภาพรวมครอบครัว (2026-10-31 · North: "ใช้ภายในครอบครัว · ดูรวมหรือเฉพาะของตัวเอง · ธุรกิจทำด้วยกันใช้ statement ร่วมกัน")
//  North ตอบ 1ก + 2 ระดับ: เจ้าของ/ผู้ดูแล (role admin) เห็นและแก้ได้ทั้งหมด · user เห็นเฉพาะของตัวเอง + ธุรกิจที่ร่วม
//  · สิทธิ์ = UserPermissions (คน ↔ Company) เดิม · admin: ระบบเติมสิทธิ์ทุก Company ในครอบครัวให้เอง (ensureAdminScope)
//  · ส่วนตัว = Company ที่ is_company = 0 · ธุรกิจ = is_company = 1
//  · รับ/จ่าย นับจากบรรทัดย่อยที่ยืนยันแล้ว ตาม Company ของบรรทัด (d.entity_id) · ไม่นับโอน/ยอดยกมา/ทรัพย์สิน (กติกาเดียวกับหน้าภาพรวม)
//  GET /api/family/overview?month=YYYY-MM|latest&period=month|year|all
// ═══════════════════════════════════════════════════════════════════════
import { assetCategorySet } from './assets.js';
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* ผู้ดูแลเห็นทุก Company ในครอบครัว — เติมสิทธิ์ที่ขาดให้ (Company ที่สร้างทีหลัง / ผู้ดูแลคนใหม่) */
export async function ensureAdminScope(env, userId) {
  const u = await env.DB.prepare(`SELECT family_id, role FROM Users WHERE user_id = ?`).bind(userId).first();
  if (!u || u.role !== 'admin') return 0;
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO UserPermissions (user_id, entity_id) SELECT ?, e.entity_id FROM Entities e WHERE e.family_id = ?
      AND NOT EXISTS (SELECT 1 FROM UserPermissions up WHERE up.user_id = ? AND up.entity_id = e.entity_id)`).bind(userId, u.family_id, userId).run();
  return r?.meta?.changes || 0;
}

export async function handleFamily({ url, request, env, cors, authUserId }) {
  if (url.pathname !== '/api/family/overview' || request.method !== 'GET') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  const me = await env.DB.prepare(`SELECT user_id, name, family_id, role FROM Users WHERE user_id = ?`).bind(authUserId).first();
  if (!me) return json({ error: 'Unauthorized' }, cors, 401);
  await ensureAdminScope(env, authUserId);
  const isAdmin = me.role === 'admin';
  const ents = ((await env.DB.prepare(`SELECT e.entity_id, e.name, IFNULL(e.is_company, 0) AS is_company FROM Entities e
      JOIN UserPermissions up ON up.entity_id = e.entity_id WHERE up.user_id = ? ORDER BY e.name`).bind(authUserId).all()).results) || [];
  if (!ents.length) return json({ is_admin: isAdmin, me: { user_id: me.user_id, name: me.name }, members: [], businesses: [], activity: [], totals: null, empty: true }, cors);
  const allowed = ents.map(e => e.entity_id), ph = allowed.map(() => '?').join(',');
  /* ใครเข้าถึง Company ไหน (เฉพาะ Company ที่ผู้ดูเห็น) */
  const perms = ((await env.DB.prepare(`SELECT up.user_id, up.entity_id, u.name, u.role FROM UserPermissions up JOIN Users u ON u.user_id = up.user_id
      WHERE u.family_id = ? AND up.entity_id IN (${ph})`).bind(me.family_id, ...allowed).all()).results) || [];
  const users = ((await env.DB.prepare(`SELECT user_id, name, role FROM Users WHERE family_id = ? ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, name`).bind(me.family_id).all()).results) || [];

  /* ช่วงเวลา */
  const period = ['month', 'year', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'month';
  let month = url.searchParams.get('month') || 'latest';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const last = await env.DB.prepare(`SELECT MAX(substr(t.date,1,7)) AS m FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id WHERE t.status = 'CONFIRMED' AND a.entity_id IN (${ph})`).bind(...allowed).first();
    month = last?.m || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  }
  const [y, m] = month.split('-').map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  const dw = period === 'all' ? '' : ' AND t.date >= ? AND t.date < ?';
  const da = period === 'all' ? [] : period === 'year' ? [`${y}-01-01`, `${y + 1}-01-01`] : [`${month}-01`, `${next}-01`];

  /* รับ/จ่าย ต่อ Company ของบรรทัด (บัญชีต้องอยู่ในขอบเขตผู้ดู) */
  const assetCats = await assetCategorySet(env, me.family_id);
  const rows = ((await env.DB.prepare(`SELECT d.entity_id, d.category_id, UPPER(IFNULL(d.type,'')) AS typ, cp.behavior, cp.sub_behavior, SUM(d.amount) AS amt
      FROM TransactionDetails d JOIN Transactions t ON t.transaction_id = d.transaction_id JOIN Accounts a ON a.account_id = t.account_id
      LEFT JOIN Categories c ON c.category_id = d.category_id LEFT JOIN Captions cp ON cp.type_id = c.caption_id
      WHERE t.status = 'CONFIRMED' AND a.entity_id IN (${ph})${dw}
      GROUP BY d.entity_id, d.category_id, typ, cp.behavior, cp.sub_behavior`).bind(...allowed, ...da).all()).results) || [];
  const byEnt = {};
  for (const r of rows) {
    if (assetCats.has(r.category_id) || r.sub_behavior === 'INVESTMENT' || r.typ === 'TRANSFER') continue;
    const side = ['INCOME', 'CREDIT_AR'].includes(r.typ) ? 'in' : ['EXPENSE', 'DEBIT_AR'].includes(r.typ) ? 'out'
      : ['REVENUE', 'ASSET'].includes(r.behavior) ? 'in' : ['EXPENSE', 'LIABILITY'].includes(r.behavior) ? 'out' : null;
    if (!side) continue;
    const k = r.entity_id || '__none__', g = byEnt[k] || (byEnt[k] = { in: 0, out: 0 });
    g[side] += Math.abs(Number(r.amt) || 0);
  }
  /* บัญชี + รอตรวจ ต่อ Company ของบัญชี */
  const accs = ((await env.DB.prepare(`SELECT a.entity_id, COUNT(*) AS n, (SELECT COUNT(*) FROM Transactions t WHERE t.status = 'PENDING_REVIEW' AND t.account_id IN (SELECT account_id FROM Accounts a2 WHERE a2.entity_id = a.entity_id)) AS pend
      FROM Accounts a WHERE a.entity_id IN (${ph}) AND IFNULL(a.account_type,'BANK') NOT IN ('TRIP_HOLDING','TRIP') GROUP BY a.entity_id`).bind(...allowed).all()).results) || [];
  const accOf = Object.fromEntries(accs.map(a => [a.entity_id, a]));
  const sum = (ids, side) => r2(ids.reduce((s, id) => s + (byEnt[id]?.[side] || 0), 0));

  const personal = ents.filter(e => !e.is_company), biz = ents.filter(e => e.is_company);
  const whoHas = id => perms.filter(p => p.entity_id === id);
  /* สมาชิก: Company ส่วนตัวที่ผู้ใช้นั้นมีสิทธิ์ และไม่มีผู้ใช้อื่น (ที่ไม่ใช่ผู้ดูแล) ใช้ร่วม → ถือเป็นของคนนั้น
     ผู้ดูแลมีสิทธิ์ทุก Company จึงนับ Company ส่วนตัวที่ไม่มีเจ้าของคนอื่นเป็นของผู้ดูแล */
  const ownerOf = id => { const ps = whoHas(id); const nonAdmin = ps.filter(p => p.role !== 'admin'); return (nonAdmin.length === 1 ? nonAdmin[0] : ps.find(p => p.role === 'admin') || ps[0])?.user_id || null; };
  const visibleUsers = isAdmin ? users : users.filter(u => u.user_id === me.user_id || perms.some(p => p.user_id === u.user_id));
  const members = visibleUsers.map(u => {
    const own = personal.filter(e => ownerOf(e.entity_id) === u.user_id).map(e => e.entity_id);
    const shared = biz.filter(e => whoHas(e.entity_id).some(p => p.user_id === u.user_id)).map(e => e.entity_id);
    return { user_id: u.user_id, name: u.name, role: u.role, is_me: u.user_id === me.user_id, personal: own.map(id => ents.find(e => e.entity_id === id)?.name),
      in: sum(own, 'in'), out: sum(own, 'out'), accounts: own.reduce((s, id) => s + (accOf[id]?.n || 0), 0), pending: own.reduce((s, id) => s + (accOf[id]?.pend || 0), 0),
      businesses: shared.length, no_access: !perms.some(p => p.user_id === u.user_id) };
  });
  const businesses = biz.map(e => ({ entity_id: e.entity_id, name: e.name, users: whoHas(e.entity_id).map(p => ({ user_id: p.user_id, name: p.name })),
    accounts: accOf[e.entity_id]?.n || 0, pending: accOf[e.entity_id]?.pend || 0, in: r2(byEnt[e.entity_id]?.in || 0), out: r2(byEnt[e.entity_id]?.out || 0) }))
    .filter(b => b.accounts || b.in || b.out).sort((a, b) => (b.in + b.out) - (a.in + a.out));
  const myPersonal = personal.filter(e => ownerOf(e.entity_id) === me.user_id).map(e => e.entity_id);
  const mine = { in: sum(myPersonal, 'in'), out: sum(myPersonal, 'out') };
  const allP = personal.map(e => e.entity_id), allB = biz.map(e => e.entity_id);
  const totals = { personal_in: sum(allP, 'in'), personal_out: sum(allP, 'out'), business_in: sum(allB, 'in'), business_out: sum(allB, 'out') };
  totals.in = r2(totals.personal_in + totals.business_in); totals.out = r2(totals.personal_out + totals.business_out);

  /* ใครบันทึกอะไรล่าสุด (ในขอบเขตผู้ดู) */
  const activity = ((await env.DB.prepare(`SELECT t.created_by_user_id AS user_id, u.name AS user_name, t.account_id, a.name AS account_name, t.source, t.status,
        COUNT(*) AS n, MAX(t.created_at) AS at, ROUND(SUM(t.total_amount), 2) AS total, substr(MAX(t.created_at), 1, 13) AS hour_key
      FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id LEFT JOIN Users u ON u.user_id = t.created_by_user_id
      WHERE a.entity_id IN (${ph}) AND t.created_at IS NOT NULL
      GROUP BY t.created_by_user_id, t.account_id, t.source, t.status, substr(t.created_at, 1, 13) ORDER BY at DESC LIMIT 12`).bind(...allowed).all()).results) || [];

  return json({ is_admin: isAdmin, me: { user_id: me.user_id, name: me.name, role: me.role }, month, period, totals, mine, members, businesses, activity }, cors);
}
