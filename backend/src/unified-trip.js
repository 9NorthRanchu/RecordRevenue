// ═══════════════════════════════════════════════════════════════════════════
// Unified Trip API
//
//   GET    /api/unified-trip                — อ่านทั้งทริป (เฟส 1)
//   POST   /api/unified-trip/currencies     — เพิ่ม/แก้สกุลเงิน  (admin เท่านั้น)
//   DELETE /api/unified-trip/currencies?code=
//   POST   /api/unified-trip/wallets        — สร้าง/แก้กระเป๋า
//
//   ทั้งหมดต้องมี ?projectId= และ header x-user-id
//   ทดสอบด้วย: node backend/test/unified-trip-write.test.mjs  (44 เคส)
//
//   แยกเป็นไฟล์ต่างหากจาก index.js โดยตั้งใจ: index.js ยาว 3,568 บรรทัดและ
//   เสิร์ฟหน้าอื่นทั้งระบบอยู่ การเพิ่ม endpoint ใหม่ตรงนั้นเสี่ยงเกินจำเป็น
//   ไฟล์นี้ถูกเรียกด้วยบรรทัดเดียวจาก index.js และคืน null ถ้าไม่ใช่ path ของตัวเอง
//
//   เฟส 2 เปิดเฉพาะสกุลเงินกับกระเป๋า ซึ่ง "ไม่แตะ ledger" เลย
//   บิลและการปิดทริปยังไม่เปิด — สองตัวนั้นเขียนตัวเลขเข้าบัญชีจริง
//   จึงต้องมี reversal ให้ถูกก่อน (ดู TripClosures ใน add_unified_trip_schema.sql)
//
//   ⚠️ สิ่งที่ตัวนี้ทำต่างจาก prototype: **กรอง visibility ที่เซิร์ฟเวอร์**
//      prototype กรองฝั่ง client ซึ่งพอสำหรับข้อมูลจำลอง แต่กับข้อมูลจริง
//      ถ้าส่งบิลทุกใบไปแล้วค่อยซ่อน ใครเปิด network tab ก็อ่านได้หมด
// ═══════════════════════════════════════════════════════════════════════════

const json = (data, corsHeaders, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

/* เรทเฉลี่ยถ่วงน้ำหนักของกระเป๋า = Σ thb ÷ Σ foreign ของทุกล็อต
   ไม่สนใจวันที่และลำดับการบันทึกโดยเจตนา — บันทึกย้อนหลังให้ผลเดียวกัน
   คืน null เมื่อยังไม่มีล็อต ห้ามแทนด้วยค่าคงที่ */
function walletRateFrom(fundings, walletId) {
  const lots = fundings.filter(row => row.wallet_id === walletId);
  if (!lots.length) return null;
  const foreign = lots.reduce((sum, row) => sum + (row.foreign_amount || 0), 0);
  if (!foreign) return null;
  return lots.reduce((sum, row) => sum + (row.thb_amount || 0), 0) / foreign;
}

/* คืนทั้งค่าและที่มา เพราะเลขเปล่า ๆ แยกไม่ออกว่าเป็นเรทจริงหรือเรทเดา
   base | actual | planned | locked | none */
function rateInfoFor({ currencyCode, wallet, fundings, currencies, tripClosed }) {
  const currency = currencies.find(row => row.code === currencyCode);
  if (currency?.is_base) return { rate: 1, source: 'base' };
  if (tripClosed) {
    const locked = wallet?.locked_rate ?? null;
    return { rate: locked ?? walletRateFrom(fundings, wallet?.wallet_id) ?? currency?.plan_rate ?? null, source: 'locked' };
  }
  const actual = wallet ? walletRateFrom(fundings, wallet.wallet_id) : null;
  if (actual !== null) return { rate: actual, source: 'actual' };
  if (currency?.plan_rate) return { rate: currency.plan_rate, source: 'planned' };
  return { rate: null, source: 'none' };
}

/* กติกาการมองเห็น — บังคับที่นี่ ไม่ใช่ที่ client
   TRIP     ทุกคนในทริปเห็น
   SELECTED เฉพาะผู้เกี่ยวข้อง (อยู่ใน participants)
   PRIVATE  เฉพาะเจ้าของเงินและคนจ่าย */
function canSee(expense, participantIds, viewerMemberId) {
  if (!viewerMemberId) return false;
  if (expense.visibility === 'TRIP' || !expense.visibility) return true;
  if (expense.owner_member_id === viewerMemberId || expense.member_id === viewerMemberId) return true;
  if (expense.visibility === 'SELECTED') return participantIds.includes(viewerMemberId);
  return false;
}

/* ทุก endpoint ต้องผ่านด่านนี้ก่อน: ผู้ใช้ต้องอยู่ครอบครัวเดียวกับทริป
   และต้องเป็นสมาชิกของทริปจึงจะเห็น/แก้อะไรได้ */
async function loadContext(env, userId, projectId) {
  const trip = await env.DB.prepare(`
      SELECT p.project_id, p.family_id, p.name, p.status, p.start_date, p.end_date,
             p.total_budget, p.banner_url, p.theme_banner, p.posting_date, p.closed_at
      FROM Projects p JOIN Users u ON u.user_id = ?
      WHERE p.project_id = ? AND p.family_id = u.family_id
    `).bind(userId, projectId).first();
  if (!trip) return null;
  const viewer = await env.DB.prepare(
    `SELECT * FROM TripMembers WHERE project_id=? AND user_id=?`
  ).bind(projectId, userId).first();
  return { trip, viewer, closed: trip.status === 'closed' || Boolean(trip.closed_at) };
}

/* ── เขียนข้อมูล: สกุลเงิน ─────────────────────────────────────────────
   จำกัดเฉพาะ admin เพราะ plan_rate เปลี่ยนวิธีตีมูลค่าเงินของ *ทุกคน*
   ในทริป ไม่ใช่แค่ของคนที่กดแก้ */
async function writeCurrency(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin) {
    return json({ error: 'เฉพาะผู้ดูแลทริปเท่านั้นที่แก้สกุลเงินได้ เพราะมีผลกับการตีมูลค่าของทุกคน' }, corsHeaders, 403);
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const planRate = Number(body.plan_rate);

  if (!/^[A-Z]{3}$/.test(code)) return json({ error: 'รหัสสกุลต้องเป็นตัวอักษร 3 ตัว เช่น JPY' }, corsHeaders, 400);
  if (!(planRate > 0)) return json({ error: 'เรทประมาณการต้องมากกว่า 0' }, corsHeaders, 400);
  if (!String(body.symbol || '').trim()) return json({ error: 'ต้องระบุสัญลักษณ์สกุลเงิน' }, corsHeaders, 400);

  await env.DB.prepare(`
    INSERT INTO TripCurrencies (project_id, code, symbol, label, plan_rate, is_base, icon_url)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(project_id, code) DO UPDATE SET
      symbol=excluded.symbol, label=excluded.label,
      plan_rate=excluded.plan_rate, icon_url=excluded.icon_url
  `).bind(projectId, code, String(body.symbol).trim(), body.label || null,
          planRate, body.is_base ? 1 : 0, body.icon_url || null).run();

  return json({ ok: true, code }, corsHeaders);
}

async function deleteCurrency(env, ctx, projectId, code, corsHeaders) {
  if (!ctx.viewer?.is_admin) return json({ error: 'เฉพาะผู้ดูแลทริปเท่านั้น' }, corsHeaders, 403);
  if (!code) return json({ error: 'ต้องระบุ code' }, corsHeaders, 400);

  const currency = await env.DB.prepare(
    `SELECT * FROM TripCurrencies WHERE project_id=? AND code=?`
  ).bind(projectId, code).first();
  if (!currency) return json({ error: `ไม่พบสกุล ${code} ในทริปนี้` }, corsHeaders, 404);
  if (currency.is_base) return json({ error: 'ลบสกุลหลักของทริปไม่ได้' }, corsHeaders, 409);

  // กระเป๋าที่ใช้สกุลนี้อยู่จะตีมูลค่าไม่ได้ทันทีถ้าลบทิ้ง
  const inUse = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM TripWallets WHERE project_id=? AND currency=?`
  ).bind(projectId, code).first();
  if (inUse?.n) return json({ error: `ยังมีกระเป๋า ${inUse.n} ใบใช้สกุล ${code} อยู่` }, corsHeaders, 409);

  await env.DB.prepare(`DELETE FROM TripCurrencies WHERE project_id=? AND code=?`)
    .bind(projectId, code).run();
  return json({ ok: true, deleted: code }, corsHeaders);
}

/* ── เขียนข้อมูล: กระเป๋า ──────────────────────────────────────────────
   สมาชิกสร้างกระเป๋าของตัวเองได้ แต่จะสร้างให้คนอื่นต้องเป็น admin
   เพราะเจ้าของกระเป๋าคือคนที่เห็นยอดคงเหลือและประวัติเติมเงิน */
async function writeWallet(request, env, ctx, projectId, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const label = String(body.name || body.label || '').trim();
  const currency = String(body.currency || '').trim().toUpperCase();
  const ownerId = body.owner_member_id || ctx.viewer?.member_id;

  if (!label) return json({ error: 'ต้องตั้งชื่อกระเป๋า' }, corsHeaders, 400);
  if (!ownerId) return json({ error: 'ระบุเจ้าของกระเป๋าไม่ได้ — ผู้ใช้นี้ยังไม่ได้ผูกกับสมาชิกในทริป' }, corsHeaders, 400);
  if (ownerId !== ctx.viewer?.member_id && !ctx.viewer?.is_admin) {
    return json({ error: 'สร้างกระเป๋าให้สมาชิกคนอื่นได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }

  const owner = await env.DB.prepare(
    `SELECT member_id FROM TripMembers WHERE member_id=? AND project_id=?`
  ).bind(ownerId, projectId).first();
  if (!owner) return json({ error: 'ไม่พบสมาชิกที่จะเป็นเจ้าของกระเป๋าในทริปนี้' }, corsHeaders, 400);

  const known = await env.DB.prepare(
    `SELECT code FROM TripCurrencies WHERE project_id=? AND code=?`
  ).bind(projectId, currency).first();
  if (!known) return json({ error: `สกุล ${currency || '(ว่าง)'} ยังไม่ได้ตั้งไว้ในทริปนี้ — เพิ่มสกุลเงินก่อน` }, corsHeaders, 400);

  // ⚠️ สร้างกับแก้ต้องแยกกันเด็ดขาด ห้ามใช้ upsert ตัวเดียวจบ
  //    ถ้าใช้ INSERT ... ON CONFLICT DO UPDATE แล้ว id ชนกัน (Date.now() ชนกันได้จริง
  //    เมื่อสองคนกดพร้อมกัน) การสร้างกระเป๋าใหม่จะกลายเป็นการ "ทับ" กระเป๋าของคนอื่น
  //    พร้อมเปลี่ยนเจ้าของ โดยไม่มี error ให้เห็นเลย — เจอจากการทดสอบจริง
  if (!body.wallet_id) {
    const walletId = `TW-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(`
      INSERT INTO TripWallets (wallet_id, project_id, name, currency, owner_member_id, icon_url, exclude_on_close)
      VALUES (?,?,?,?,?,?,?)
    `).bind(walletId, projectId, label, currency, ownerId,
            body.icon_url || null, body.exclude_on_close ? 1 : 0).run();
    return json({ ok: true, wallet_id: walletId, created: true }, corsHeaders);
  }

  const existing = await env.DB.prepare(`SELECT * FROM TripWallets WHERE wallet_id=? AND project_id=?`)
    .bind(body.wallet_id, projectId).first();
  if (!existing) return json({ error: 'ไม่พบกระเป๋าที่จะแก้ไข' }, corsHeaders, 404);
  if (existing.owner_member_id && existing.owner_member_id !== ctx.viewer?.member_id && !ctx.viewer?.is_admin) {
    return json({ error: 'แก้กระเป๋าของสมาชิกคนอื่นได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }
  // เปลี่ยนสกุลหลังจากมีการเติมเงินแล้วจะทำให้เรทเฉลี่ยไร้ความหมาย
  if (existing.currency !== currency) {
    const lots = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM TripWalletFundings WHERE wallet_id=?`
    ).bind(body.wallet_id).first();
    if (lots?.n) return json({ error: 'เปลี่ยนสกุลเงินของกระเป๋าที่เติมเงินไปแล้วไม่ได้' }, corsHeaders, 409);
  }

  await env.DB.prepare(`
    UPDATE TripWallets SET name=?, currency=?, owner_member_id=?, icon_url=?, exclude_on_close=?
    WHERE wallet_id=? AND project_id=?
  `).bind(label, currency, ownerId, body.icon_url || null,
          body.exclude_on_close ? 1 : 0, body.wallet_id, projectId).run();

  return json({ ok: true, wallet_id: body.wallet_id, created: false }, corsHeaders);
}

export async function handleUnifiedTrip(request, env, url, corsHeaders) {
  if (!url.pathname.startsWith('/api/unified-trip')) return null;

  const projectId = url.searchParams.get('projectId');
  const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
  if (!projectId) return json({ error: 'ต้องระบุ projectId' }, corsHeaders, 400);
  if (!userId) return json({ error: 'ต้องส่ง header x-user-id' }, corsHeaders, 401);

  const ctx = await loadContext(env, userId, projectId);
  if (!ctx) return json({ error: 'ไม่พบทริปนี้ หรือไม่มีสิทธิ์เข้าถึง' }, corsHeaders, 404);
  const { trip } = ctx;

  const sub = url.pathname.replace('/api/unified-trip', '').replace(/\/$/, '');

  if (request.method !== 'GET') {
    // ปิดทริปแล้ว = ตัวเลขถูกรายงานเข้าบัญชีไปแล้ว ห้ามขยับ
    if (ctx.closed) {
      return json({ error: 'ทริปนี้ปิดแล้ว · แก้ข้อมูลการเงินไม่ได้ ต้องเปิดทริปกลับก่อน' }, corsHeaders, 409);
    }
    if (sub === '/currencies' && request.method === 'POST') return writeCurrency(request, env, ctx, projectId, corsHeaders);
    if (sub === '/currencies' && request.method === 'DELETE') {
      return deleteCurrency(env, ctx, projectId, String(url.searchParams.get('code') || '').toUpperCase(), corsHeaders);
    }
    if (sub === '/wallets' && request.method === 'POST') return writeWallet(request, env, ctx, projectId, corsHeaders);
    return json({ error: `ยังไม่รองรับ ${request.method} ${sub || '/'} ในเฟสนี้` }, corsHeaders, 405);
  }

  const [members, currencies, wallets, fundings, expenses, categories, participants, closures, closureLines, presence, stops] =
    await Promise.all([
      env.DB.prepare(`SELECT * FROM TripMembers WHERE project_id=? ORDER BY is_admin DESC, display_name`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripCurrencies WHERE project_id=? ORDER BY is_base DESC, code`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripWallets WHERE project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=? ORDER BY funding_date`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripExpenses WHERE project_id=? ORDER BY expense_date DESC, created_at DESC`).bind(projectId).all(),
      env.DB.prepare(`SELECT c.* FROM TripExpenseCategories c
                      JOIN TripExpenses e ON e.trip_expense_id=c.trip_expense_id WHERE e.project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT pa.* FROM TripExpenseParticipants pa
                      JOIN TripExpenses e ON e.trip_expense_id=pa.trip_expense_id WHERE e.project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripClosures WHERE project_id=? ORDER BY created_at`).bind(projectId).all(),
      env.DB.prepare(`SELECT l.* FROM TripClosureLines l
                      JOIN TripClosures c ON c.closure_id=l.closure_id WHERE c.project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripPresence WHERE project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripStops WHERE project_id=? ORDER BY stop_date, time`).bind(projectId).all()
    ]);

  const memberRows = members.results || [];
  const currencyRows = currencies.results || [];
  const walletRows = wallets.results || [];
  const fundingRows = fundings.results || [];
  const closureRows = closures.results || [];

  // ผู้ใช้คนนี้เป็นสมาชิกคนไหนของทริป — ทุกอย่างที่ตามมากรองด้วยตัวนี้
  // ใช้ค่าจาก loadContext ตัวเดียวกับที่ฝั่งเขียนใช้ตรวจสิทธิ์ จะได้ไม่มีทาง
  // เกิดกรณี "อ่านเห็นแต่เขียนไม่ได้" เพราะสองที่ตัดสินคนละแบบ
  const viewer = ctx.viewer;
  const tripClosed = ctx.closed;

  const walletById = id => walletRows.find(row => row.wallet_id === id);
  const rateFor = (currencyCode, walletId) =>
    rateInfoFor({ currencyCode, wallet: walletById(walletId), fundings: fundingRows, currencies: currencyRows, tripClosed });

  const partsByExpense = {};
  (participants.results || []).forEach(row => {
    (partsByExpense[row.trip_expense_id] ||= []).push(row);
  });
  const catsByExpense = {};
  (categories.results || []).forEach(row => {
    (catsByExpense[row.trip_expense_id] ||= []).push(row);
  });

  const visibleExpenses = (expenses.results || [])
    .filter(row => canSee(row, (partsByExpense[row.trip_expense_id] || []).map(p => p.member_id), viewer?.member_id))
    .map(row => {
      const info = rateFor(row.currency_code, row.wallet_id);
      // ปิดทริปแล้วใช้ค่าที่ล็อกไว้ ยังไม่ปิดก็คำนวณสด
      const amountThb = tripClosed && row.settled_amount_thb != null
        ? row.settled_amount_thb
        : (info.rate === null ? null : (row.amount_foreign || 0) * info.rate);
      return {
        ...row,
        categories: catsByExpense[row.trip_expense_id] || [],
        participants: partsByExpense[row.trip_expense_id] || [],
        rate: info.rate,
        rate_source: info.source,
        amount_thb_computed: amountThb
      };
    });

  const walletSummaries = walletRows
    // ยอดคงเหลือและประวัติเติมเงินเป็นของเจ้าของกระเป๋าเท่านั้น
    .filter(row => !row.owner_member_id || row.owner_member_id === viewer?.member_id)
    .map(row => {
      const lots = fundingRows.filter(f => f.wallet_id === row.wallet_id);
      const fundedForeign = lots.reduce((sum, f) => sum + (f.foreign_amount || 0), 0);
      const spent = (expenses.results || [])
        .filter(e => e.wallet_id === row.wallet_id)
        .reduce((sum, e) => sum + (e.amount_foreign || 0), 0);
      const info = rateFor(row.currency, row.wallet_id);
      return {
        ...row,
        fundings: lots,
        funded_foreign: fundedForeign,
        funded_thb: lots.reduce((sum, f) => sum + (f.thb_amount || 0), 0),
        spent_foreign: spent,
        leftover_foreign: fundedForeign - spent,
        rate: info.rate,
        rate_source: info.source
      };
    });

  // ยอดที่อยู่ในบัญชีจริง = ผลรวมทุกแถว ไม่ใช่แถวล่าสุด
  // (ปิดลงเป็นบวก · เปิดกลับลงเป็นลบของครั้งที่ยกเลิก)
  const netLedger = closureRows.reduce((sum, row) => sum + (row.ledger_total || 0), 0);
  const netTripOnly = closureRows.reduce((sum, row) => sum + (row.trip_only_total || 0), 0);

  return json({
    trip: { ...trip, closed: tripClosed },
    viewer,
    members: memberRows,
    currencies: currencyRows,
    wallets: walletSummaries,
    expenses: visibleExpenses,
    stops: stops.results || [],
    presence: presence.results || [],
    closures: closureRows.map(row => ({
      ...row,
      lines: (closureLines.results || []).filter(line => line.closure_id === row.closure_id)
    })),
    ledger: { net_thb: netLedger, net_trip_only_thb: netTripOnly },
    meta: {
      phase: 'read-only',
      viewer_is_admin: Boolean(viewer?.is_admin),
      hidden_expense_count: (expenses.results || []).length - visibleExpenses.length
    }
  }, corsHeaders);
}
