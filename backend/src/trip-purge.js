// ═══════════════════════════════════════════════════════════════════════
// 🧳 ปิดระบบทริป (v271 · 2026-11-01 · North: "ทริปไม่ได้ใช้แล้ว ล้างข้อมูลออกโดยไม่กระทบระบบอื่น")
//  • TRIP_PATH: ทุก API ของทริปตอบ 410 (index.js ไม่เรียก unified-trip.js / legacy-trip.js แล้ว)
//  • GET  /api/admin/trip-purge → นับข้อมูลทริปที่จะลบ (admin เท่านั้น)
//  • POST /api/admin/trip-purge { confirm: 'ลบทริป' } → สำรองทุกแถวกลับไปในคำตอบ (หน้าเว็บบันทึกเป็นไฟล์) แล้วลบ
//  ลบ: ทุกตารางที่ขึ้นต้นด้วย Trip · Projects ที่เป็นทริป · บัญชี TRIP_HOLDING ที่ไม่มีรายการ · ผู้ใช้ TRIP_ONLY ที่ไม่เคยบันทึกรายการ
//  ไม่ลบ: Transactions / TransactionDetails (แค่ตัด project_id ของทริปออก) · Settlements · Accounts อื่น · ผู้ใช้ปกติ
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const TRIP_PATH = /^\/api\/(trips|travel|trip-[a-z-]+|unified-trip|wallets)(\/|$)/;
const KNOWN = ['TripStops', 'TripExpenses', 'TripMembers', 'TripWallets', 'TripWalletFundings', 'TripClosures', 'TripClosureLines',
  'TripExpensePresets', 'TripCurrencies', 'TripExpenseParticipants', 'TripExpenseCategories', 'TripBookings', 'TripMemberSessions',
  'TripDocuments', 'TripDayPlans', 'TripAssets', 'TripPresence', 'TripLegs', 'TripTransfers', 'TripHoldingAccounts', 'TripBudgets'];
export const PROJ_WHERE = `(project_id LIKE 'TRP-%' OR project_id IN (SELECT project_id FROM TripStops UNION SELECT project_id FROM TripExpenses))`;

async function tripTables(env) {
  try {
    const r = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Trip%'`).all();
    const names = (r.results || []).map(x => x.name).filter(n => /^Trip[A-Za-z]+$/.test(n));
    if (names.length) return names;
  } catch { /* ใช้รายชื่อที่รู้จักแทน */ }
  return KNOWN;
}
const all = async (env, sql, ...b) => { try { return (await env.DB.prepare(sql).bind(...b).all()).results || []; } catch { return null; } };

export async function collectTrip(env) {
  const tables = {};
  for (const t of await tripTables(env)) { const rows = await all(env, `SELECT * FROM ${t}`); if (rows) tables[t] = rows; }
  const projects = (await all(env, `SELECT * FROM Projects WHERE ${PROJ_WHERE}`)) || (await all(env, `SELECT * FROM Projects WHERE project_id LIKE 'TRP-%'`)) || [];
  const holding = (await all(env, `SELECT a.* FROM Accounts a WHERE a.account_type='TRIP_HOLDING' AND NOT EXISTS (SELECT 1 FROM Transactions t WHERE t.account_id=a.account_id)`)) || [];
  const users = (await all(env, `SELECT u.user_id, u.family_id, u.name, u.role, u.ledger_mode, u.created_at FROM Users u WHERE u.ledger_mode='TRIP_ONLY'
      AND NOT EXISTS (SELECT 1 FROM Transactions t WHERE t.created_by_user_id=u.user_id)`)) || [];
  const linked = projects.length ? ((await all(env, `SELECT COUNT(*) AS n FROM TransactionDetails WHERE project_id IN (${projects.map(() => '?').join(',')})`, ...projects.slice(0, 90).map(p => p.project_id)))?.[0]?.n || 0) : 0;
  return { tables, projects, holding, users, linked };
}

export async function handleTripPurge({ url, request, env, cors, authUserId }) {
  const p = url.pathname;
  if (TRIP_PATH.test(p)) return json({ error: 'ระบบทริปปิดใช้งานแล้ว' }, cors, 410);
  if (p !== '/api/admin/trip-purge') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  const me = await env.DB.prepare(`SELECT role FROM Users WHERE user_id=?`).bind(authUserId).first();
  if (me?.role !== 'admin') return json({ error: 'เฉพาะผู้ดูแลระบบ' }, cors, 403);

  const data = await collectTrip(env);
  const counts = { ...Object.fromEntries(Object.entries(data.tables).map(([t, r]) => [t, r.length])), Projects: data.projects.length,
    'Accounts (TRIP_HOLDING)': data.holding.length, 'Users (TRIP_ONLY)': data.users.length };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (request.method === 'GET') return json({ counts, total, linked_details: data.linked, projects: data.projects.map(x => ({ project_id: x.project_id, name: x.name })) }, cors);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405);
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== 'ลบทริป') return json({ error: 'ต้องยืนยันด้วยคำว่า ลบทริป' }, cors, 400);

  const ops = [];
  for (const id of data.projects.map(x => x.project_id)) ops.push(env.DB.prepare(`UPDATE TransactionDetails SET project_id=NULL WHERE project_id=?`).bind(id));
  for (const t of Object.keys(data.tables)) ops.push(env.DB.prepare(`DELETE FROM ${t}`));
  for (const id of data.projects.map(x => x.project_id)) ops.push(env.DB.prepare(`DELETE FROM Projects WHERE project_id=?`).bind(id));
  for (const a of data.holding) ops.push(env.DB.prepare(`DELETE FROM Accounts WHERE account_id=? AND account_type='TRIP_HOLDING'`).bind(a.account_id));
  for (const u of data.users) ops.push(env.DB.prepare(`DELETE FROM Users WHERE user_id=? AND ledger_mode='TRIP_ONLY'`).bind(u.user_id));
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  return json({ success: true, counts, total, backup: { exported_at: new Date().toISOString(), ...data } }, cors);
}
