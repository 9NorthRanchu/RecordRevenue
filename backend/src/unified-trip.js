// ═══════════════════════════════════════════════════════════════════════════
// Unified Trip API
//
//   GET    /api/unified-trip                — อ่านทั้งทริป (เฟส 1)
//   POST   /api/unified-trip/currencies     — เพิ่ม/แก้สกุลเงิน  (admin เท่านั้น)
//   DELETE /api/unified-trip/currencies?code=
//   POST   /api/unified-trip/wallets        — สร้าง/แก้กระเป๋า
//   POST   /api/unified-trip/fundings       — เติมเงินเข้ากระเป๋า (ที่มาของเรทจริง)
//   DELETE /api/unified-trip/fundings?id=
//   POST   /api/unified-trip/expenses       — สร้าง/แก้บิล พร้อมหมวดและผู้ร่วมจ่าย
//   DELETE /api/unified-trip/expenses?id=
//   POST   /api/unified-trip/closures        — ปิดทริป (admin)
//   POST   /api/unified-trip/closures/reopen — เปิดกลับพร้อมรายการกลับ (admin)
//
//   ทั้งหมดต้องมี ?projectId= และ header x-user-id
//   ทดสอบด้วย: node backend/test/unified-trip-write.test.mjs  (133 เคส)
//
//   แยกเป็นไฟล์ต่างหากจาก index.js โดยตั้งใจ: index.js ยาว 3,568 บรรทัดและ
//   เสิร์ฟหน้าอื่นทั้งระบบอยู่ การเพิ่ม endpoint ใหม่ตรงนั้นเสี่ยงเกินจำเป็น
//   ไฟล์นี้ถูกเรียกด้วยบรรทัดเดียวจาก index.js และคืน null ถ้าไม่ใช่ path ของตัวเอง
//
//   ⚠️ ยอดที่เข้าบัญชีจริง = SUM(ledger_total) ของทุกแถวใน TripClosures
//      **ไม่ใช่แถวล่าสุด** ปิด→เปิดกลับ→ปิดใหม่ จึงไม่โพสต์ซ้ำ
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

  // บิลที่บันทึกด้วยสกุลนี้จะกลายเป็นบิลที่ตีมูลค่าไม่ได้ทันทีเช่นกัน
  const billed = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM TripExpenses WHERE project_id=? AND currency_code=?`
  ).bind(projectId, code).first();
  if (billed?.n) return json({ error: `ยังมีบิล ${billed.n} ใบใช้สกุล ${code} อยู่` }, corsHeaders, 409);

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

/* ── เขียนข้อมูล: เติมเงินเข้ากระเป๋า ──────────────────────────────────
   ล็อตเติมเงินคือที่มาของเรท "จริง" ทั้งหมด ถ้าไม่มีตัวนี้ ทุกอย่างจะค้าง
   อยู่ที่ plan_rate ตลอดทริป

   ⚠️ rate ไม่รับจาก client เด็ดขาด คำนวณเป็น thb ÷ foreign เสมอ
      ถ้าปล่อยให้ส่งมา ตัวเลขที่เก็บอาจไม่ตรงกับเงินที่จ่ายจริง แล้วยอด
      ต้นทุนตอนปิดทริปจะเพี้ยนโดยไม่มีใครจับได้ */
async function writeFunding(request, env, ctx, projectId, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const thb = round2(body.thb_amount);
  const foreign = round2(body.foreign_amount);
  const fundingDate = String(body.funding_date || '').trim();

  if (!(thb > 0)) return json({ error: 'ยอดบาทที่จ่ายออกต้องมากกว่า 0' }, corsHeaders, 400);
  if (!(foreign > 0)) return json({ error: 'ยอดเงินที่ได้รับต้องมากกว่า 0' }, corsHeaders, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fundingDate)) return json({ error: 'ต้องระบุวันที่แบบ YYYY-MM-DD' }, corsHeaders, 400);

  const wallet = await env.DB.prepare(`SELECT * FROM TripWallets WHERE wallet_id=? AND project_id=?`)
    .bind(body.wallet_id || '', projectId).first();
  if (!wallet) return json({ error: 'ไม่พบกระเป๋าที่ระบุในทริปนี้' }, corsHeaders, 400);
  if (wallet.owner_member_id && wallet.owner_member_id !== ctx.viewer?.member_id && !ctx.viewer?.is_admin) {
    return json({ error: 'เติมเงินเข้ากระเป๋าของคนอื่นได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }

  const fundingId = `TWF-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(`
    INSERT INTO TripWalletFundings (funding_id, wallet_id, project_id, funding_date, thb_amount, foreign_amount, rate, note)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(fundingId, wallet.wallet_id, projectId, fundingDate, thb, foreign, thb / foreign, body.note || null).run();

  // คืนเรทเฉลี่ยใหม่ของทั้งกระเป๋า ไม่ใช่แค่เรทของล็อตนี้
  // เพราะยอดบาทของบิลทุกใบในกระเป๋านี้จะขยับตามค่าเฉลี่ย ไม่ใช่ตามล็อตล่าสุด
  const lots = await env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=?`).bind(projectId).all();
  return json({
    ok: true, funding_id: fundingId, lot_rate: thb / foreign,
    wallet_rate: walletRateFrom(lots.results || [], wallet.wallet_id)
  }, corsHeaders);
}

async function deleteFunding(env, ctx, projectId, fundingId, corsHeaders) {
  if (!fundingId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);
  const lot = await env.DB.prepare(`
    SELECT f.*, w.owner_member_id FROM TripWalletFundings f
    JOIN TripWallets w ON w.wallet_id = f.wallet_id
    WHERE f.funding_id=? AND f.project_id=?
  `).bind(fundingId, projectId).first();
  if (!lot) return json({ error: 'ไม่พบรายการเติมเงินนี้' }, corsHeaders, 404);
  if (lot.owner_member_id && lot.owner_member_id !== ctx.viewer?.member_id && !ctx.viewer?.is_admin) {
    return json({ error: 'ลบรายการเติมเงินของคนอื่นได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }
  // ล็อตที่ยกยอดมาจากทริปก่อนลบไม่ได้ ต้องไปเปิดทริปนั้นกลับแล้วแก้ที่ต้นทาง
  // ไม่งั้นต้นทุนที่ยกมาจะหายไปจากทั้งสองทริปพร้อมกัน
  if (lot.carried_from_closure_id) {
    return json({ error: 'ล็อตนี้ยกยอดมาจากการปิดทริปก่อนหน้า ต้องแก้ที่ทริปต้นทาง' }, corsHeaders, 409);
  }
  await env.DB.prepare(`DELETE FROM TripWalletFundings WHERE funding_id=? AND project_id=?`)
    .bind(fundingId, projectId).run();
  return json({ ok: true, deleted: fundingId }, corsHeaders);
}

/* ── เขียนข้อมูล: บิล ──────────────────────────────────────────────────
   ตัวแรกที่แตะ ledger จริง กติกาทั้งหมดจึงบังคับที่เซิร์ฟเวอร์ ไม่ใช่ที่ฟอร์ม

   สามมิติของเงินในบิลหนึ่งใบ แยกกันจริง:
     member_id       = คนจ่าย (มือที่ควักเงิน)
     owner_member_id = เจ้าของค่าใช้จ่าย → ตัวนี้ตัดสินว่าลงบัญชีหลักไหม
     wallet_id       = กระเป๋าที่ตัดเงินจริง

   ยอดที่แต่ละคนรับผิดชอบมาจาก TripExpenseParticipants เท่านั้น
   ไม่ใช่จาก member_id — North รูดบัตรจ่ายแทน ไม่ได้แปลว่า North เป็นคนจ่ายจริง */

const VISIBILITIES = ['PRIVATE', 'TRIP', 'SELECTED'];
const SPLIT_MODES = ['EQUAL', 'MANUAL', 'PERCENT'];
const EPSILON = 0.005;   // ครึ่งสตางค์ — ผ่อนให้ความคลาดเคลื่อนของ float เท่านั้น

/* เก็บทุกยอดเป็นทศนิยม 2 ตำแหน่ง
   คูณ 100 แล้วปัดก่อนหาร เพื่อเลี่ยงกรณีคลาสสิกอย่าง 1.005 ที่ปัดผิดเพราะ float */
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/* หารแล้วปัด 2 ตำแหน่ง — เศษที่เหลือไปรวมที่คนเดียว ไม่กระจาย
   เพราะถ้ากระจายทีละสตางค์ ยอดของแต่ละคนจะไม่ตรงกับที่เห็นในใบเสร็จ
   ผู้รับเศษ: admin ของทริปก่อน (เป็นคนสรุปยอดอยู่แล้ว) ถ้า admin ไม่ได้ร่วมบิลนี้
   ก็ตกที่เจ้าของบิล และถ้ายังไม่ใช่ก็คนแรกในรายการ — ต้องมีคนรับเสมอ ไม่ปล่อยหาย */
function pickResidualTaker(memberIds, preferredIds) {
    const found = preferredIds.map(id => memberIds.indexOf(id)).find(i => i >= 0);
    return found === undefined ? 0 : found;
}

function shareEvenly(total, memberIds, preferredIds) {
    const base = round2(total / memberIds.length);
    const shares = memberIds.map(() => base);
    const residual = round2(total - base * memberIds.length);
    if (residual === 0) return { shares, residual: 0, takerIndex: null };
    const takerIndex = pickResidualTaker(memberIds, preferredIds);
    shares[takerIndex] = round2(shares[takerIndex] + residual);
    return { shares, residual, takerIndex };
}

async function writeExpense(request, env, ctx, projectId, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const viewerId = ctx.viewer?.member_id;
  if (!viewerId) return json({ error: 'ผู้ใช้นี้ยังไม่ได้ผูกกับสมาชิกในทริป' }, corsHeaders, 400);

  const amount = round2(body.amount_foreign);
  const currency = String(body.currency_code || '').trim().toUpperCase();
  const expenseDate = String(body.expense_date || '').trim();
  const visibility = String(body.visibility || 'TRIP').toUpperCase();
  const splitMode = String(body.split_mode || 'EQUAL').toUpperCase();
  const payerId = body.member_id || viewerId;
  const ownerId = body.owner_member_id || payerId;

  if (!(amount > 0)) return json({ error: 'ยอดบิลต้องมากกว่า 0' }, corsHeaders, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return json({ error: 'ต้องระบุวันที่แบบ YYYY-MM-DD' }, corsHeaders, 400);
  if (!VISIBILITIES.includes(visibility)) return json({ error: `visibility ต้องเป็น ${VISIBILITIES.join(' | ')}` }, corsHeaders, 400);
  if (!SPLIT_MODES.includes(splitMode)) return json({ error: `split_mode ต้องเป็น ${SPLIT_MODES.join(' | ')}` }, corsHeaders, 400);

  // แก้บิลเดิม: เจ้าของเงินหรือ admin เท่านั้น — คนจ่ายแทนแก้ไม่ได้
  // เพราะยอดที่เข้าบัญชีเป็นของเจ้าของเงิน ไม่ใช่ของคนที่ควักก่อน
  let existing = null;
  if (body.trip_expense_id) {
    existing = await env.DB.prepare(`SELECT * FROM TripExpenses WHERE trip_expense_id=? AND project_id=?`)
      .bind(body.trip_expense_id, projectId).first();
    if (!existing) return json({ error: 'ไม่พบบิลที่จะแก้ไข' }, corsHeaders, 404);
    if (existing.owner_member_id !== viewerId && !ctx.viewer?.is_admin) {
      return json({ error: 'แก้บิลของคนอื่นได้เฉพาะเจ้าของเงินหรือผู้ดูแลทริป' }, corsHeaders, 403);
    }
  } else if (ownerId !== viewerId && !ctx.viewer?.is_admin) {
    return json({ error: 'บันทึกบิลให้คนอื่นเป็นเจ้าของได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }

  const [members, currencyRow, wallet] = await Promise.all([
    env.DB.prepare(`SELECT member_id, is_admin FROM TripMembers WHERE project_id=? ORDER BY is_admin DESC`).bind(projectId).all(),
    env.DB.prepare(`SELECT * FROM TripCurrencies WHERE project_id=? AND code=?`).bind(projectId, currency).first(),
    body.wallet_id
      ? env.DB.prepare(`SELECT * FROM TripWallets WHERE wallet_id=? AND project_id=?`).bind(body.wallet_id, projectId).first()
      : Promise.resolve(null)
  ]);
  const memberRows = members.results || [];
  const memberIds = memberRows.map(row => row.member_id);
  const adminIds = memberRows.filter(row => row.is_admin).map(row => row.member_id);
  if (!memberIds.includes(payerId)) return json({ error: 'คนจ่ายไม่ได้อยู่ในทริปนี้' }, corsHeaders, 400);
  if (!memberIds.includes(ownerId)) return json({ error: 'เจ้าของค่าใช้จ่ายไม่ได้อยู่ในทริปนี้' }, corsHeaders, 400);
  if (!currencyRow) return json({ error: `สกุล ${currency || '(ว่าง)'} ยังไม่ได้ตั้งไว้ในทริปนี้` }, corsHeaders, 400);

  if (body.wallet_id) {
    if (!wallet) return json({ error: 'ไม่พบกระเป๋าที่ระบุในทริปนี้' }, corsHeaders, 400);
    if (wallet.currency !== currency) {
      return json({ error: `กระเป๋าเป็นสกุล ${wallet.currency} แต่บิลเป็น ${currency}` }, corsHeaders, 400);
    }
    // เงินที่ออกจากกระเป๋าใคร ต้องเป็นคนนั้นที่จ่าย ไม่งั้นยอดคงเหลือจะเพี้ยน
    if (wallet.owner_member_id && wallet.owner_member_id !== payerId) {
      return json({ error: 'ตัดเงินจากกระเป๋าของคนอื่นไม่ได้ — กระเป๋าต้องเป็นของคนจ่าย' }, corsHeaders, 400);
    }
  }

  // ── ผู้ร่วมรับผิดชอบ ────────────────────────────────────────────────
  // EQUAL/PERCENT คำนวณที่เซิร์ฟเวอร์เอง ไม่รับตัวเลขจาก client
  // ทุกยอดเป็นทศนิยม 2 ตำแหน่ง เศษที่หารไม่ลงตัวไปรวมที่ admin
  // MANUAL ไม่มีการเกลี่ยเศษให้ — ตัวเลขที่คนพิมพ์เองต้องบวกได้ตรงยอดบิล
  // ถ้าระบบไปแก้ให้เงียบ ๆ คนกรอกจะไม่รู้ว่ายอดที่ตัวเองตั้งใจเพี้ยนไปแล้ว
  let participants = Array.isArray(body.participants) ? body.participants : [];
  let residualTo = null;
  let residualAmount = 0;
  const preferred = [...adminIds, ownerId];

  if (splitMode === 'EQUAL') {
    const ids = participants.length ? participants.map(p => p.member_id) : [ownerId];
    const { shares, residual, takerIndex } = shareEvenly(amount, ids, preferred);
    participants = ids.map((id, i) => ({ member_id: id, amount_foreign: shares[i], percent: null }));
    residualTo = takerIndex === null ? null : ids[takerIndex];
    residualAmount = residual;
  } else if (splitMode === 'PERCENT') {
    const totalPct = participants.reduce((sum, p) => sum + Number(p.percent || 0), 0);
    if (Math.abs(totalPct - 100) > EPSILON) {
      return json({ error: `เปอร์เซ็นต์รวมได้ ${totalPct} ต้องเป็น 100` }, corsHeaders, 400);
    }
    const rounded = participants.map(p => round2(amount * Number(p.percent) / 100));
    const residual = round2(amount - rounded.reduce((sum, v) => sum + v, 0));
    if (residual !== 0) {
      const ids = participants.map(p => p.member_id);
      const taker = pickResidualTaker(ids, preferred);
      rounded[taker] = round2(rounded[taker] + residual);
      residualTo = ids[taker];
      residualAmount = residual;
    }
    participants = participants.map((p, i) => ({
      member_id: p.member_id, percent: Number(p.percent), amount_foreign: rounded[i]
    }));
  } else {
    participants = participants.map(p => ({
      member_id: p.member_id, percent: null, amount_foreign: round2(p.amount_foreign)
    }));
  }
  if (!participants.length) return json({ error: 'ต้องมีผู้รับผิดชอบอย่างน้อย 1 คน' }, corsHeaders, 400);

  const badMember = participants.find(p => !memberIds.includes(p.member_id));
  if (badMember) return json({ error: `ผู้ร่วมจ่าย ${badMember.member_id} ไม่ได้อยู่ในทริปนี้` }, corsHeaders, 400);
  if (new Set(participants.map(p => p.member_id)).size !== participants.length) {
    return json({ error: 'มีชื่อผู้ร่วมจ่ายซ้ำกัน' }, corsHeaders, 400);
  }
  if (participants.some(p => !(p.amount_foreign >= 0))) {
    return json({ error: 'ยอดของผู้ร่วมจ่ายต้องเป็นตัวเลขไม่ติดลบ' }, corsHeaders, 400);
  }
  const partSum = participants.reduce((sum, p) => sum + p.amount_foreign, 0);
  if (Math.abs(partSum - amount) > EPSILON) {
    return json({ error: `ยอดผู้ร่วมจ่ายรวม ${partSum} ไม่เท่ากับยอดบิล ${amount}` }, corsHeaders, 400);
  }
  if (visibility === 'SELECTED' && participants.length < 2) {
    return json({ error: 'visibility SELECTED ต้องเลือกคนที่เห็นได้มากกว่า 1 คน มิฉะนั้นให้ใช้ PRIVATE' }, corsHeaders, 400);
  }

  // ── หมวดในบิลเดียว ────────────────────────────────────────────────
  const categories = Array.isArray(body.categories) ? body.categories : [];
  if (categories.length) {
    if (categories.some(c => !(Number(c.amount_foreign) >= 0))) {
      return json({ error: 'ยอดของหมวดต้องเป็นตัวเลขไม่ติดลบ' }, corsHeaders, 400);
    }
    const catSum = categories.reduce((sum, c) => sum + Number(c.amount_foreign), 0);
    if (Math.abs(catSum - amount) > EPSILON) {
      return json({ error: `ยอดหมวดรวม ${catSum} ไม่เท่ากับยอดบิล ${amount}` }, corsHeaders, 400);
    }
  }

  // ── ยอดบาท ────────────────────────────────────────────────────────
  // TripExpenses.amount_thb เป็น NOT NULL มาแต่เดิม (หน้าอื่นในระบบยังอ่านอยู่)
  // จึงต้องใส่ค่า — แต่ **ห้ามใส่ 0 เมื่อไม่รู้เรท** เพราะนั่นคือการโกหกว่าฟรี
  // ไม่มีเรทเลย = ปฏิเสธไปเลย · ค่าที่เก็บนี้เป็นภาพนิ่ง ณ ตอนบันทึก
  // ตัวเลขที่ใช้จริงคือค่าที่ GET คำนวณสด และค่าที่ล็อกตอนปิดทริป
  const fundings = await env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=?`).bind(projectId).all();
  const currencies = await env.DB.prepare(`SELECT * FROM TripCurrencies WHERE project_id=?`).bind(projectId).all();
  const info = rateInfoFor({
    currencyCode: currency, wallet, fundings: fundings.results || [],
    currencies: currencies.results || [], tripClosed: false
  });
  if (info.rate === null) {
    return json({ error: `ยังไม่มีอัตราแลกเปลี่ยนสำหรับ ${currency} — ตั้ง plan_rate ของสกุลนี้ก่อน` }, corsHeaders, 400);
  }
  const amountThb = round2(amount * info.rate);

  // ── เขียน ─────────────────────────────────────────────────────────
  // ลบลูกทั้งหมดแล้วเขียนใหม่ ง่ายกว่าและถูกกว่าการ diff ทีละแถว
  // ใช้ batch เพื่อให้บิลกับลูกของมันเข้า-ออกพร้อมกัน ไม่มีสภาพครึ่ง ๆ กลาง ๆ
  const expenseId = body.trip_expense_id || `TE-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const statements = [];

  if (existing) {
    statements.push(env.DB.prepare(`
      UPDATE TripExpenses SET expense_date=?, member_id=?, owner_member_id=?, wallet_id=?,
        amount_foreign=?, amount_thb=?, currency_code=?, visibility=?, is_shared=?,
        split_mode=?, icon_url=?, note=?
      WHERE trip_expense_id=? AND project_id=?
    `).bind(expenseDate, payerId, ownerId, body.wallet_id || null, amount, amountThb, currency,
            visibility, body.is_shared ? 1 : 0, splitMode, body.icon_url || null,
            body.note || null, expenseId, projectId));
    statements.push(env.DB.prepare(`DELETE FROM TripExpenseParticipants WHERE trip_expense_id=?`).bind(expenseId));
    statements.push(env.DB.prepare(`DELETE FROM TripExpenseCategories WHERE trip_expense_id=?`).bind(expenseId));
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO TripExpenses (trip_expense_id, project_id, expense_date, member_id, owner_member_id,
        wallet_id, amount_foreign, amount_thb, currency_code, visibility, is_shared, split_mode, icon_url, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(expenseId, projectId, expenseDate, payerId, ownerId, body.wallet_id || null,
            amount, amountThb, currency, visibility, body.is_shared ? 1 : 0,
            splitMode, body.icon_url || null, body.note || null));
  }

  participants.forEach((p, i) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TripExpenseParticipants (participant_id, trip_expense_id, member_id, amount_foreign, percent)
      VALUES (?,?,?,?,?)
    `).bind(`${expenseId}-P${i}`, expenseId, p.member_id, p.amount_foreign, p.percent ?? null));
  });
  categories.forEach((c, i) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TripExpenseCategories (line_id, trip_expense_id, category_id, label, amount_foreign)
      VALUES (?,?,?,?,?)
    `).bind(`${expenseId}-C${i}`, expenseId, c.category_id || null, c.label || null, Number(c.amount_foreign)));
  });

  await env.DB.batch(statements);
  // คืน residual กลับไปด้วย เพื่อให้หน้าจอบอกได้ว่าเศษไปตกที่ใคร
  // ถ้าเงียบไว้ คนที่รับเศษจะเห็นยอดตัวเองไม่ตรงกับคนอื่นโดยไม่รู้สาเหตุ
  return json({
    ok: true, trip_expense_id: expenseId, created: !existing,
    amount_thb: amountThb, rate: info.rate, rate_source: info.source,
    residual: residualAmount, residual_member_id: residualTo
  }, corsHeaders);
}

async function deleteExpense(env, ctx, projectId, expenseId, corsHeaders) {
  if (!expenseId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);
  const existing = await env.DB.prepare(`SELECT * FROM TripExpenses WHERE trip_expense_id=? AND project_id=?`)
    .bind(expenseId, projectId).first();
  if (!existing) return json({ error: 'ไม่พบบิลนี้' }, corsHeaders, 404);
  if (existing.owner_member_id !== ctx.viewer?.member_id && !ctx.viewer?.is_admin) {
    return json({ error: 'ลบบิลของคนอื่นได้เฉพาะเจ้าของเงินหรือผู้ดูแลทริป' }, corsHeaders, 403);
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TripExpenseParticipants WHERE trip_expense_id=?`).bind(expenseId),
    env.DB.prepare(`DELETE FROM TripExpenseCategories WHERE trip_expense_id=?`).bind(expenseId),
    env.DB.prepare(`DELETE FROM TripExpenses WHERE trip_expense_id=? AND project_id=?`).bind(expenseId, projectId)
  ]);
  return json({ ok: true, deleted: expenseId }, corsHeaders);
}

/* ── ปิดทริป · เปิดกลับ ────────────────────────────────────────────────
   จุดที่พังง่ายที่สุดทั้งระบบ เพราะเป็นที่เดียวที่โพสต์ตัวเลขเข้าบัญชีจริง

   กติกาแกนกลาง: **ยอดที่เข้าบัญชี = SUM(ledger_total) ของทุกแถว ไม่ใช่แถวล่าสุด**
     ปิดครั้งแรก      → +14,052
     เปิดกลับ         → −14,052 (ลงวันเดียวกับครั้งที่กลับ)
     ปิดอีกครั้ง      → +15,000
     สุทธิ = 15,000 ถูกต้อง · ถ้าไม่มีแถวกลับ จะกลายเป็น 29,052 คือโพสต์ซ้ำ

   เรทถูกล็อกตอนปิด: เก็บลง TripWallets.locked_rate และ
   TripExpenses.settled_rate/settled_amount_thb เพื่อให้ยอดที่รายงานไปแล้วนิ่ง
   ต่อให้มีคนไปแก้ล็อตเติมเงินทีหลังก็ตาม */

async function loadClosureInputs(env, projectId) {
  const [members, currencies, wallets, fundings, expenses, participants] = await Promise.all([
    env.DB.prepare(`SELECT * FROM TripMembers WHERE project_id=?`).bind(projectId).all(),
    env.DB.prepare(`SELECT * FROM TripCurrencies WHERE project_id=?`).bind(projectId).all(),
    env.DB.prepare(`SELECT * FROM TripWallets WHERE project_id=?`).bind(projectId).all(),
    env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=?`).bind(projectId).all(),
    env.DB.prepare(`SELECT * FROM TripExpenses WHERE project_id=?`).bind(projectId).all(),
    env.DB.prepare(`SELECT pa.* FROM TripExpenseParticipants pa
                    JOIN TripExpenses e ON e.trip_expense_id=pa.trip_expense_id WHERE e.project_id=?`).bind(projectId).all()
  ]);
  return {
    members: members.results || [], currencies: currencies.results || [],
    wallets: wallets.results || [], fundings: fundings.results || [],
    expenses: expenses.results || [], participants: participants.results || []
  };
}

async function closeTrip(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin) return json({ error: 'ปิดทริปได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  const body = await request.json().catch(() => ({}));
  const postingDate = String(body.posting_date || '').trim();
  // วันลงบัญชีแยกจากวันจบทริปโดยตั้งใจ — จบ 27 ธ.ค. แต่สรุปยอดจริงอาจเป็น 10 ม.ค.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) {
    return json({ error: 'ต้องระบุวันลงบัญชีแบบ YYYY-MM-DD' }, corsHeaders, 400);
  }

  const data = await loadClosureInputs(env, projectId);
  const rateOf = (currencyCode, wallet) => rateInfoFor({
    currencyCode, wallet, fundings: data.fundings, currencies: data.currencies, tripClosed: false
  });

  // ── ยอดคงเหลือรายกระเป๋า ────────────────────────────────────────────
  const walletState = data.wallets
    .filter(w => !w.exclude_on_close)
    .map(w => {
      const funded = data.fundings.filter(f => f.wallet_id === w.wallet_id)
        .reduce((sum, f) => sum + (f.foreign_amount || 0), 0);
      const spent = data.expenses.filter(e => e.wallet_id === w.wallet_id)
        .reduce((sum, e) => sum + (e.amount_foreign || 0), 0);
      const rate = rateOf(w.currency, w);
      return { wallet: w, leftover: round2(funded - spent), rate: rate.rate };
    });

  const needsLine = walletState.filter(s => Math.abs(s.leftover) > EPSILON);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const missing = needsLine
    .filter(s => !lines.some(l => l.wallet_id === s.wallet.wallet_id))
    .map(s => s.wallet.name);
  // ไม่ยอมให้ปิดทั้งที่ยังมีเงินเหลือค้างไม่ได้บอกว่าจะเอาไปไหน
  // ถ้าปล่อยผ่าน เงินก้อนนั้นจะหายจากบัญชีเงียบ ๆ
  if (missing.length) {
    return json({ error: `ยังไม่ได้ระบุว่าจะจัดการเงินเหลือในกระเป๋าอย่างไร: ${missing.join(' · ')}` }, corsHeaders, 400);
  }
  const noRate = walletState.filter(s => s.rate === null).map(s => s.wallet.name);
  if (noRate.length) {
    return json({ error: `ยังไม่มีอัตราแลกเปลี่ยนของกระเป๋า: ${noRate.join(' · ')}` }, corsHeaders, 400);
  }

  const closureId = `TC-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const closureLines = [];
  let fxResult = 0;
  let carriedThb = 0;

  for (const line of lines) {
    const state = walletState.find(s => s.wallet.wallet_id === line.wallet_id);
    if (!state) return json({ error: `กระเป๋า ${line.wallet_id} ไม่อยู่ในทริปนี้หรือถูกยกเว้นตอนปิด` }, corsHeaders, 400);
    const disposition = String(line.disposition || '').toUpperCase();
    const thbCost = round2(state.leftover * state.rate);

    if (disposition === 'RETURN') {
      // แลกกลับเป็นบาทจริง = รับรู้กำไรขาดทุนตรงนี้
      const receivedThb = round2(line.received_thb);
      if (!(receivedThb >= 0)) return json({ error: 'ต้องระบุยอดบาทที่ได้รับกลับมาจริง' }, corsHeaders, 400);
      const fx = round2(receivedThb - thbCost);
      fxResult = round2(fxResult + fx);
      closureLines.push({ ...line, disposition, thbCost, receivedThb, fx });
    } else if (disposition === 'CARRY') {
      // ยกไปทริปหน้าโดยไม่แตะบาท = **ยังไม่รับรู้กำไรขาดทุน** ต้นทุนย้ายไปทั้งก้อน
      // ถ้ารับรู้ตรงนี้จะเป็นการรับรู้กำไรที่ยังไม่เกิดขึ้นจริง
      carriedThb = round2(carriedThb + thbCost);
      closureLines.push({ ...line, disposition, thbCost, receivedThb: null, fx: 0 });
    } else {
      return json({ error: `disposition ต้องเป็น RETURN หรือ CARRY (ได้ ${line.disposition})` }, corsHeaders, 400);
    }
  }

  // ── ยอดที่ลงบัญชี ──────────────────────────────────────────────────
  // มาจาก TripExpenseParticipants เท่านั้น ไม่ใช่จากคนจ่าย
  // และแยกตาม ledger_mode ของ "เจ้าของยอด" ไม่ใช่ของเจ้าของบิล
  const modeOf = memberId => data.members.find(m => m.member_id === memberId)?.ledger_mode || 'MAIN';
  const settle = [];
  let ledgerTotal = 0;
  let tripOnlyTotal = 0;

  for (const expense of data.expenses) {
    const wallet = data.wallets.find(w => w.wallet_id === expense.wallet_id) || null;
    const info = rateOf(expense.currency_code, wallet);
    if (info.rate === null) {
      return json({ error: `บิลวันที่ ${expense.expense_date} ยังไม่มีอัตราแลกเปลี่ยน` }, corsHeaders, 400);
    }
    settle.push({ id: expense.trip_expense_id, rate: info.rate, thb: round2((expense.amount_foreign || 0) * info.rate) });
    for (const part of data.participants.filter(p => p.trip_expense_id === expense.trip_expense_id)) {
      const thb = round2((part.amount_foreign || 0) * info.rate);
      if (modeOf(part.member_id) === 'TRIP_ONLY') tripOnlyTotal = round2(tripOnlyTotal + thb);
      else ledgerTotal = round2(ledgerTotal + thb);
    }
  }

  const statements = [
    env.DB.prepare(`
      INSERT INTO TripClosures (closure_id, project_id, entry_type, posting_date, ledger_total,
        trip_only_total, fx_result, carried_thb, reverses_id, reason, performed_by)
      VALUES (?,?,'CLOSE',?,?,?,?,?,NULL,?,?)
    `).bind(closureId, projectId, postingDate, ledgerTotal, tripOnlyTotal, fxResult, carriedThb,
            body.reason || null, ctx.viewer.member_id),
    env.DB.prepare(`UPDATE Projects SET status='closed', closed_at=CURRENT_TIMESTAMP, posting_date=? WHERE project_id=?`)
      .bind(postingDate, projectId)
  ];

  closureLines.forEach((line, i) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TripClosureLines (line_id, closure_id, wallet_id, disposition, leftover_foreign,
        thb_cost, received_thb, fx_amount, carry_currency, carry_amount)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(`${closureId}-L${i}`, closureId, line.wallet_id, line.disposition,
            walletState.find(s => s.wallet.wallet_id === line.wallet_id).leftover,
            line.thbCost, line.receivedThb, line.fx,
            line.carry_currency || null, line.carry_amount ?? null));
  });

  // ล็อกเรทไว้กับตัวข้อมูลเอง ไม่ใช่คำนวณใหม่ตอนอ่าน
  // เพื่อให้ยอดที่รายงานเข้าบัญชีไปแล้วนิ่ง แม้จะมีคนแก้ล็อตเติมเงินทีหลัง
  walletState.forEach(state => {
    statements.push(env.DB.prepare(`UPDATE TripWallets SET locked_rate=? WHERE wallet_id=?`)
      .bind(state.rate, state.wallet.wallet_id));
  });
  settle.forEach(row => {
    statements.push(env.DB.prepare(`UPDATE TripExpenses SET settled_rate=?, settled_amount_thb=? WHERE trip_expense_id=?`)
      .bind(row.rate, row.thb, row.id));
  });

  await env.DB.batch(statements);

  const net = await env.DB.prepare(`SELECT SUM(ledger_total) AS net FROM TripClosures WHERE project_id=?`)
    .bind(projectId).first();
  return json({
    ok: true, closure_id: closureId, posting_date: postingDate,
    ledger_total: ledgerTotal, trip_only_total: tripOnlyTotal,
    fx_result: fxResult, carried_thb: carriedThb,
    net_ledger_thb: round2(net?.net || 0)
  }, corsHeaders);
}

async function reopenTrip(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin) return json({ error: 'เปิดทริปกลับได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  if (!ctx.closed) return json({ error: 'ทริปนี้ยังไม่ได้ปิด' }, corsHeaders, 409);
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  // บังคับกรอกเหตุผล เพราะรายการกลับทางบัญชีต้องอธิบายได้ว่าทำไมถึงกลับ
  if (!reason) return json({ error: 'ต้องระบุเหตุผลที่เปิดทริปกลับ' }, corsHeaders, 400);

  // หา CLOSE ล่าสุดที่ยังไม่ถูกกลับ — ไม่ใช่แถวล่าสุดเฉย ๆ
  const lastClose = await env.DB.prepare(`
    SELECT c.* FROM TripClosures c
    WHERE c.project_id=? AND c.entry_type='CLOSE'
      AND NOT EXISTS (SELECT 1 FROM TripClosures r WHERE r.reverses_id = c.closure_id)
    ORDER BY c.created_at DESC LIMIT 1
  `).bind(projectId).first();
  if (!lastClose) return json({ error: 'ไม่พบรายการปิดทริปที่ยังไม่ถูกกลับ' }, corsHeaders, 409);

  const reopenId = `TC-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.batch([
    // ค่าลบของครั้งที่กลับ และใช้ posting_date **เดิมของครั้งนั้น**
    // ไม่ใช่วันนี้ เพราะรายการกลับต้องหักล้างในงวดเดียวกับที่โพสต์ไป
    env.DB.prepare(`
      INSERT INTO TripClosures (closure_id, project_id, entry_type, posting_date, ledger_total,
        trip_only_total, fx_result, carried_thb, reverses_id, reason, performed_by)
      VALUES (?,?,'REOPEN',?,?,?,?,?,?,?,?)
    `).bind(reopenId, projectId, lastClose.posting_date, -lastClose.ledger_total,
            -lastClose.trip_only_total, -lastClose.fx_result, -lastClose.carried_thb,
            lastClose.closure_id, reason, ctx.viewer.member_id),
    env.DB.prepare(`UPDATE Projects SET status='active', closed_at=NULL WHERE project_id=?`).bind(projectId),
    // ปลดล็อกเรท ให้กลับไปคำนวณสดเหมือนก่อนปิด
    env.DB.prepare(`UPDATE TripWallets SET locked_rate=NULL WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`UPDATE TripExpenses SET settled_rate=NULL, settled_amount_thb=NULL WHERE project_id=?`).bind(projectId)
  ]);

  const net = await env.DB.prepare(`SELECT SUM(ledger_total) AS net FROM TripClosures WHERE project_id=?`)
    .bind(projectId).first();
  return json({
    ok: true, closure_id: reopenId, reverses: lastClose.closure_id,
    posting_date: lastClose.posting_date, ledger_total: -lastClose.ledger_total,
    net_ledger_thb: round2(net?.net || 0)
  }, corsHeaders);
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
    // เปิดทริปกลับต้องอยู่ *ก่อน* ด่านทริปปิด ไม่งั้นจะไม่มีทางเปิดกลับได้เลย
    if (sub === '/closures/reopen' && request.method === 'POST') {
      return reopenTrip(request, env, ctx, projectId, corsHeaders);
    }
    // ปิดทริปแล้ว = ตัวเลขถูกรายงานเข้าบัญชีไปแล้ว ห้ามขยับ
    if (ctx.closed) {
      return json({ error: 'ทริปนี้ปิดแล้ว · แก้ข้อมูลการเงินไม่ได้ ต้องเปิดทริปกลับก่อน' }, corsHeaders, 409);
    }
    if (sub === '/currencies' && request.method === 'POST') return writeCurrency(request, env, ctx, projectId, corsHeaders);
    if (sub === '/currencies' && request.method === 'DELETE') {
      return deleteCurrency(env, ctx, projectId, String(url.searchParams.get('code') || '').toUpperCase(), corsHeaders);
    }
    if (sub === '/wallets' && request.method === 'POST') return writeWallet(request, env, ctx, projectId, corsHeaders);
    if (sub === '/fundings' && request.method === 'POST') return writeFunding(request, env, ctx, projectId, corsHeaders);
    if (sub === '/fundings' && request.method === 'DELETE') {
      return deleteFunding(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/expenses' && request.method === 'POST') return writeExpense(request, env, ctx, projectId, corsHeaders);
    if (sub === '/expenses' && request.method === 'DELETE') {
      return deleteExpense(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/closures' && request.method === 'POST') return closeTrip(request, env, ctx, projectId, corsHeaders);
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
