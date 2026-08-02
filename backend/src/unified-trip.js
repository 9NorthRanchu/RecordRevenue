// ═══════════════════════════════════════════════════════════════════════════
// Unified Trip API
//
//   GET    /api/unified-trip/trips           — รายการทริปทั้งหมดของครอบครัว (ไม่ต้อง projectId)
//   POST   /api/unified-trip/trips           — สร้างทริปใหม่ (ไม่ต้อง projectId, ไม่ต้อง admin)
//   DELETE /api/unified-trip/trip            — ลบทริป (admin, ห้ามถ้าเคยโพสต์บัญชีจริงแล้ว)
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
//   POST   /api/unified-trip/trip            — แก้ชื่อทริป/ช่วงวันที่ (admin)
//   POST   /api/unified-trip/stops           — เพิ่ม/แก้จุดแวะ (สมาชิกทุกคน)
//   DELETE /api/unified-trip/stops?id=
//   POST   /api/unified-trip/stops/order     — จัดลำดับ/ย้ายวัน ทั้งชุดในครั้งเดียว
//
//   ทั้งหมดต้องมี ?projectId= และต้องล็อกอินแล้ว (Bearer token)
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

/* ประเภททริป — ตรวจที่โค้ดนี้ ไม่ใช้ CHECK constraint ระดับฐานข้อมูล
   เพราะ D1 แก้ CHECK ทีหลังไม่ได้เลย (เจอปัญหานี้มาแล้วกับ Captions.behavior)
   ONGOING จะเกิดแน่ ๆ · DREAM ยังไม่แน่นอน · MEMORY จบไปแล้ว */
const TRIP_STAGES = ['ONGOING', 'DREAM', 'MEMORY'];

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
             p.total_budget, p.banner_url, p.theme_banner, p.posting_date, p.closed_at, p.trip_stage
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

    /* หมวดที่ผูกกับสมุดบัญชีต้องมีอยู่จริง อยู่ในครอบครัวเดียวกัน และต้องเป็น
       หมวดฝั่งค่าใช้จ่าย — ตรวจตอนนี้เลย เพราะถ้าปล่อยไปเจอตอนปิดทริป
       คนที่ต้องมาแก้คือคนปิด ซึ่งไม่ใช่คนที่รู้ว่าบิลนี้คือค่าอะไร */
    const wanted = [...new Set(categories.map(c => c.category_id).filter(Boolean))];
    if (wanted.length) {
      const rows = await env.DB.prepare(`
        SELECT c.category_id FROM Categories c
        JOIN Captions cap ON cap.type_id = c.caption_id
        WHERE c.family_id = ? AND cap.behavior = 'EXPENSE'
          AND c.category_id IN (${wanted.map(() => '?').join(',')})
      `).bind(ctx.trip.family_id, ...wanted).all();
      const usable = new Set((rows.results || []).map(row => row.category_id));
      const bad = wanted.filter(id => !usable.has(id));
      if (bad.length) {
        return json({
          error: `หมวดในสมุดบัญชีใช้ไม่ได้: ${bad.join(' · ')} — ต้องเป็นหมวดของครอบครัวนี้และอยู่ใต้ Caption ที่เป็นค่าใช้จ่าย`
        }, corsHeaders, 400);
      }
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

/* ── ข้อมูลทริป: ชื่อ · ช่วงวันที่ ─────────────────────────────────────
   admin เท่านั้น เพราะวันเดินทางมีผลกับการเตือนเรื่องงวดบัญชีตอนปิดทริป
   และชื่อทริปไปโผล่ใน statement ของรายการที่โพสต์เข้าบัญชีจริง */
async function writeTripMeta(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin) return json({ error: 'แก้ข้อมูลทริปได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  const body = await request.json().catch(() => ({}));

  const name = String(body.name ?? ctx.trip.name ?? '').trim();
  const start = String(body.start_date ?? ctx.trip.start_date ?? '').trim();
  const end = String(body.end_date ?? ctx.trip.end_date ?? '').trim();

  if (!name) return json({ error: 'ต้องตั้งชื่อทริป' }, corsHeaders, 400);
  const dateOk = value => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOk(start) || !dateOk(end)) return json({ error: 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD' }, corsHeaders, 400);
  // วันจบก่อนวันเริ่มมักเป็นการพิมพ์สลับ ไม่ใช่ทริปข้ามปีย้อนหลัง
  if (start && end && end < start) return json({ error: 'วันสิ้นสุดอยู่ก่อนวันเริ่มทริป' }, corsHeaders, 400);

  /* เตือนถ้าย่นช่วงวันจนมีบิลหลุดออกนอกทริป — ไม่ห้าม เพราะบางบิล
     (ตั๋วเครื่องบิน มัดจำโรงแรม) จ่ายก่อนเดินทางจริง ๆ แต่ต้องบอกให้รู้ */
  let outside = 0;
  if (start && end) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM TripExpenses WHERE project_id=? AND (expense_date < ? OR expense_date > ?)`
    ).bind(projectId, start, end).first();
    outside = row?.n || 0;
  }

  /* แบนเนอร์เก็บที่ theme_banner ตัวเดียวกับที่แอปหลักใช้ ไม่สร้างช่องใหม่
     จะได้ไม่มีสองที่เก็บรูปคนละอันแล้วขัดกันเวลาเปิดคนละหน้า

     ⚠️ ตัด ../ นำหน้าออกก่อนเก็บ — หน้าทริปอยู่ลึกกว่าแอปหลักหนึ่งชั้น
        ค่าที่เก็บต้องอิงจากโฟลเดอร์ frontend/ เสมอ ไม่งั้นแอปหลักจะหารูปไม่เจอ
     รูปที่อัปโหลดเองเป็น data: ยาวมาก ไม่รับเพราะจะทำให้แถวใน Projects บวม */
  let banner = ctx.trip.theme_banner ?? null;
  if (body.theme_banner !== undefined) {
    const raw = String(body.theme_banner || '').trim().replace(/^\.\.\//, '');
    if (raw.startsWith('data:')) {
      return json({ error: 'ยังไม่รองรับรูปที่อัปโหลดเอง — เลือกจากรูปที่มีอยู่' }, corsHeaders, 400);
    }
    if (raw.length > 300) return json({ error: 'ที่อยู่รูปยาวเกินไป' }, corsHeaders, 400);
    banner = raw || null;
  }

  /* Ongoing/Dream/Memory — จัดกลุ่มหน้ารวมทริป ไม่เกี่ยวกับ status (active/closed)
     ซึ่งเป็นสถานะทางบัญชี ทริปหนึ่งเปลี่ยนกลุ่มไปมาได้อิสระ ไม่ผูกกับการปิดทริป */
  let stage = ctx.trip.trip_stage || 'ONGOING';
  if (body.trip_stage !== undefined) {
    const s = String(body.trip_stage || '').trim().toUpperCase();
    if (!TRIP_STAGES.includes(s)) {
      return json({ error: `ประเภททริปต้องเป็นหนึ่งใน ${TRIP_STAGES.join(', ')}` }, corsHeaders, 400);
    }
    stage = s;
  }

  await env.DB.prepare(`UPDATE Projects SET name=?, start_date=?, end_date=?, theme_banner=?, trip_stage=? WHERE project_id=?`)
    .bind(name, start || null, end || null, banner, stage, projectId).run();

  return json({ ok: true, name, start_date: start, end_date: end,
                theme_banner: banner, trip_stage: stage, bills_outside_range: outside }, corsHeaders);
}

/* ── รายการทริปทั้งหมดของครอบครัว ──────────────────────────────────────
   สำหรับหน้ารวม (trip picker) แยกตามประเภท Ongoing/Dream/Memory
   เห็นได้ทุกทริปของครอบครัว ไม่ต้องเป็นสมาชิกของทริปนั้นก่อน (เหมือน
   พฤติกรรมเดิมของหน้า TRIPS ที่พักไว้) — เข้าไปดูรายละเอียดจึงค่อยกรอง
   ด้วย TripMembers/visibility อีกชั้นตามปกติ */
async function listTrips(env, userId, corsHeaders) {
  const user = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id=?`).bind(userId).first();
  if (!user) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);

  const trips = await env.DB.prepare(`
    SELECT p.project_id, p.name, p.status, p.start_date, p.end_date, p.theme_banner, p.trip_stage,
           (SELECT COUNT(*) FROM TripClosures c
             WHERE c.project_id = p.project_id AND c.linked_transaction_id IS NOT NULL) AS posted_count
      FROM Projects p
     WHERE p.family_id = ?
     ORDER BY p.start_date DESC, p.created_at DESC
  `).bind(user.family_id).all();

  return json({
    trips: (trips.results || []).map(row => ({
      ...row,
      trip_stage: row.trip_stage || 'ONGOING',
      posted_to_ledger: (row.posted_count || 0) > 0
    }))
  }, corsHeaders);
}

/* ── สร้างทริปใหม่ ──────────────────────────────────────────────────────
   ใครในครอบครัวก็สร้างได้ ไม่ต้อง admin เพราะทริป Dream มักเป็นไอเดียที่
   ใครก็เสนอได้ ผู้สร้างจะกลายเป็น admin ของทริปนี้เองโดยอัตโนมัติ เพื่อให้
   แก้ไข/ปิด/ลบทริปที่ตัวเองเริ่มไว้ได้ทันทีโดยไม่ต้องให้คนอื่นตั้งสิทธิ์ให้ */
async function createTrip(request, env, userId, corsHeaders) {
  const user = await env.DB.prepare(`SELECT family_id, name FROM Users WHERE user_id=?`).bind(userId).first();
  if (!user) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const start = String(body.start_date || '').trim();
  const end = String(body.end_date || '').trim();
  const stage = String(body.trip_stage || 'DREAM').trim().toUpperCase();

  if (!name) return json({ error: 'ต้องตั้งชื่อทริป' }, corsHeaders, 400);
  const dateOk = value => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOk(start) || !dateOk(end)) return json({ error: 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD' }, corsHeaders, 400);
  if (start && end && end < start) return json({ error: 'วันสิ้นสุดอยู่ก่อนวันเริ่มทริป' }, corsHeaders, 400);
  if (!TRIP_STAGES.includes(stage)) {
    return json({ error: `ประเภททริปต้องเป็นหนึ่งใน ${TRIP_STAGES.join(', ')}` }, corsHeaders, 400);
  }

  const projectId = `TRP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const memberId = `TM-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO Projects (project_id, family_id, name, status, start_date, end_date, trip_stage)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).bind(projectId, user.family_id, name, start || null, end || null, stage),
    env.DB.prepare(`
      INSERT INTO TripMembers (member_id, project_id, user_id, display_name, role, ledger_mode, is_admin)
      VALUES (?, ?, ?, ?, 'ผู้ดูแล', 'MAIN', 1)
    `).bind(memberId, projectId, userId, user.name || 'ผู้ดูแล')
  ]);

  return json({ ok: true, project_id: projectId, name, trip_stage: stage }, corsHeaders, 201);
}

/* ── ลบทริป ────────────────────────────────────────────────────────────
   admin ของทริปเท่านั้น · ห้ามลบเด็ดขาดถ้าทริปนี้เคยโพสต์เข้าบัญชีจริงแล้ว
   สักครั้ง (มีแถวใน TripClosures ที่ linked_transaction_id ไม่ว่าง) เพราะ
   การลบ Projects จะทำให้ Transaction/TransactionDetails ในสมุดบัญชีหลัก
   กลายเป็นรายการลอย ไม่เหลือทริปอ้างอิงกลับมา — ให้เปลี่ยนเป็น
   trip_stage = MEMORY แทนการลบจริง (แก้ผ่าน POST /trip ตามปกติ) */
async function deleteTrip(env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin) return json({ error: 'ลบทริปได้เฉพาะผู้ดูแลทริปเท่านั้น' }, corsHeaders, 403);

  const posted = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM TripClosures WHERE project_id=? AND linked_transaction_id IS NOT NULL`
  ).bind(projectId).first();
  if ((posted?.n || 0) > 0) {
    return json({
      error: 'ทริปนี้เคยโพสต์เข้าบัญชีจริงแล้ว ลบไม่ได้เพื่อรักษาความถูกต้องของสมุดบัญชี · เปลี่ยนเป็น Memory แทนได้'
    }, corsHeaders, 409);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TripExpenseParticipants WHERE trip_expense_id IN
      (SELECT trip_expense_id FROM TripExpenses WHERE project_id=?)`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripExpenseCategories WHERE trip_expense_id IN
      (SELECT trip_expense_id FROM TripExpenses WHERE project_id=?)`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripExpenses WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripClosureLines WHERE closure_id IN
      (SELECT closure_id FROM TripClosures WHERE project_id=?)`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripClosures WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripWalletFundings WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripWallets WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripCurrencies WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripStops WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripPresence WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM TripMembers WHERE project_id=?`).bind(projectId),
    env.DB.prepare(`DELETE FROM Projects WHERE project_id=?`).bind(projectId)
  ]);

  return json({ ok: true, deleted: projectId }, corsHeaders);
}

/* ── แผนเที่ยว: จุดแวะ ─────────────────────────────────────────────────
   ต่างจากทุก endpoint ข้างบนตรงที่ **ไม่ใช่เรื่องเงิน**
     · สมาชิกทุกคนแก้ได้ ไม่ต้องเป็น admin หรือเจ้าของ
     · ทริปที่ปิดแล้วก็ยังแก้แผนได้ เพราะการปิดทริปล็อกเฉพาะตัวเลขที่รายงาน
       เข้าบัญชีไปแล้ว ไม่เกี่ยวกับการแก้บันทึกความทรงจำของทริป */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function writeStop(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);
  const body = await request.json().catch(() => ({}));

  const stopDate = String(body.stop_date || '').trim();
  const time = String(body.time || '').trim();
  const endTime = String(body.end_time || '').trim();
  const nameTh = String(body.name_th || '').trim();
  const nameEn = String(body.name_en || '').trim();
  const city = String(body.city || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stopDate)) return json({ error: 'ต้องระบุวันที่แบบ YYYY-MM-DD' }, corsHeaders, 400);
  if (time && !HHMM.test(time)) return json({ error: 'เวลาต้องเป็นรูปแบบ HH:MM' }, corsHeaders, 400);
  if (endTime && !HHMM.test(endTime)) return json({ error: 'เวลาสิ้นสุดต้องเป็นรูปแบบ HH:MM' }, corsHeaders, 400);
  // เวลาจบก่อนเวลาเริ่มมักเป็นการพิมพ์ผิด ไม่ใช่กิจกรรมข้ามคืน จึงเตือนไว้
  if (time && endTime && endTime < time) {
    return json({ error: 'เวลาสิ้นสุดอยู่ก่อนเวลาเริ่ม' }, corsHeaders, 400);
  }
  if (!nameTh && !nameEn && !city) return json({ error: 'ต้องมีชื่อจุดแวะอย่างน้อยหนึ่งภาษา' }, corsHeaders, 400);

  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

  if (body.stop_id) {
    const existing = await env.DB.prepare(`SELECT stop_id FROM TripStops WHERE stop_id=? AND project_id=?`)
      .bind(body.stop_id, projectId).first();
    if (!existing) return json({ error: 'ไม่พบจุดแวะที่จะแก้ไข' }, corsHeaders, 404);
    await env.DB.prepare(`
      UPDATE TripStops SET stop_date=?, time=?, end_time=?, city=?, name_th=?, name_en=?,
        accommodation=?, notes=?, icon_asset=?, sort_order=?, latitude=?, longitude=?
      WHERE stop_id=? AND project_id=?
    `).bind(stopDate, time || null, endTime || null, city || null, nameTh || null, nameEn || null,
            body.accommodation || null, body.notes || null, body.icon_asset || null, sortOrder,
            body.latitude ?? null, body.longitude ?? null, body.stop_id, projectId).run();
    return json({ ok: true, stop_id: body.stop_id, created: false }, corsHeaders);
  }

  // แยก INSERT ออกจาก UPDATE ด้วยเหตุผลเดียวกับกระเป๋า — upsert ที่ id ชนกัน
  // จะกลายเป็นการทับของเดิมเงียบ ๆ แทนที่จะสร้างใหม่
  const stopId = `TS-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(`
    INSERT INTO TripStops (stop_id, project_id, stop_date, time, end_time, city, name_th, name_en,
      accommodation, notes, icon_asset, sort_order, latitude, longitude)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(stopId, projectId, stopDate, time || null, endTime || null, city || null,
          nameTh || null, nameEn || null, body.accommodation || null, body.notes || null,
          body.icon_asset || null, sortOrder, body.latitude ?? null, body.longitude ?? null).run();
  return json({ ok: true, stop_id: stopId, created: true }, corsHeaders);
}

async function deleteStop(env, ctx, projectId, stopId, corsHeaders) {
  if (!ctx.viewer) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);
  if (!stopId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);
  const existing = await env.DB.prepare(`SELECT stop_id FROM TripStops WHERE stop_id=? AND project_id=?`)
    .bind(stopId, projectId).first();
  if (!existing) return json({ error: 'ไม่พบจุดแวะนี้' }, corsHeaders, 404);
  await env.DB.prepare(`DELETE FROM TripStops WHERE stop_id=? AND project_id=?`)
    .bind(stopId, projectId).run();
  return json({ ok: true, deleted: stopId }, corsHeaders);
}

/* จัดลำดับใหม่ทั้งชุดในคำสั่งเดียว
   ลากย้ายทีเดียวกระทบหลายแถว ถ้ายิงทีละแถวแล้วขาดกลางคัน ลำดับจะค้างครึ่ง ๆ
   จึงส่งทั้งชุดมาแล้วเขียนใน batch เดียว */
async function reorderStops(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.stops) ? body.stops : [];
  if (!items.length) return json({ error: 'ไม่มีรายการให้จัดลำดับ' }, corsHeaders, 400);

  const rows = await env.DB.prepare(`SELECT stop_id FROM TripStops WHERE project_id=?`).bind(projectId).all();
  const known = new Set((rows.results || []).map(row => row.stop_id));
  const stranger = items.find(item => !known.has(item.stop_id));
  if (stranger) return json({ error: `จุดแวะ ${stranger.stop_id} ไม่อยู่ในทริปนี้` }, corsHeaders, 400);

  const badDate = items.find(item => item.stop_date && !/^\d{4}-\d{2}-\d{2}$/.test(item.stop_date));
  if (badDate) return json({ error: 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD' }, corsHeaders, 400);

  await env.DB.batch(items.map((item, index) => env.DB.prepare(
    item.stop_date
      ? `UPDATE TripStops SET sort_order=?, stop_date=? WHERE stop_id=? AND project_id=?`
      : `UPDATE TripStops SET sort_order=? WHERE stop_id=? AND project_id=?`
  ).bind(...(item.stop_date
      ? [Number(item.sort_order ?? index), item.stop_date, item.stop_id, projectId]
      : [Number(item.sort_order ?? index), item.stop_id, projectId]))));

  return json({ ok: true, updated: items.length }, corsHeaders);
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

/* ── โพสต์การปิดทริปเข้าบัญชีจริง ──────────────────────────────────────
   1 Transaction ต่อการปิดหนึ่งครั้ง · รายการย่อยแยกตามหมวดค่าใช้จ่าย

   ⚠️ ไม่เดาหมวดให้เด็ดขาด — บิลในทริปเก็บหมวดเป็น "ข้อความ" (อาหาร/ที่พัก)
      ส่วนบัญชีจริงใช้ category_id ถ้าจับคู่ไม่ได้จะปฏิเสธพร้อมบอกว่าหมวดไหน
      ยังไม่ได้จับคู่ ดีกว่ายัดลงหมวด "อื่น ๆ" แล้วงบรวมเพี้ยนโดยไม่มีใครรู้

   ⚠️ ยอดที่ลงบัญชีคิดตามสัดส่วนของคนที่ ledger_mode = MAIN เท่านั้น
      บิล ¥1,000 ที่หารกับคน TRIP_ONLY ครึ่งหนึ่ง ลงบัญชีแค่ครึ่งเดียว */
async function buildLedgerPosting(env, ctx, projectId, data, options) {
  const { accountId, categoryMap = {}, defaultCategoryId = null, postingDate, note } = options;

  const account = await env.DB.prepare(`
    SELECT a.account_id FROM Accounts a
    JOIN Entities e ON e.entity_id = a.entity_id
    WHERE a.account_id = ? AND e.family_id = ?
  `).bind(accountId, ctx.trip.family_id).first();
  if (!account) return { error: 'ไม่พบบัญชีที่ระบุ หรือไม่ใช่บัญชีของครอบครัวนี้', status: 400 };

  const categoryLines = await env.DB.prepare(`
    SELECT c.* FROM TripExpenseCategories c
    JOIN TripExpenses e ON e.trip_expense_id = c.trip_expense_id WHERE e.project_id = ?
  `).bind(projectId).all();

  const modeOf = memberId => data.members.find(m => m.member_id === memberId)?.ledger_mode || 'MAIN';
  const rateOf = (currencyCode, wallet) => rateInfoFor({
    currencyCode, wallet, fundings: data.fundings, currencies: data.currencies, tripClosed: false
  });

  const byCategory = new Map();
  const unmapped = new Set();

  for (const expense of data.expenses) {
    const wallet = data.wallets.find(w => w.wallet_id === expense.wallet_id) || null;
    const rate = rateOf(expense.currency_code, wallet).rate;
    if (rate === null) continue;

    // สัดส่วนที่เข้าบัญชีหลักของบิลใบนี้
    const parts = data.participants.filter(p => p.trip_expense_id === expense.trip_expense_id);
    const total = parts.reduce((sum, p) => sum + (p.amount_foreign || 0), 0) || (expense.amount_foreign || 0);
    const mainShare = parts.filter(p => modeOf(p.member_id) === 'MAIN')
      .reduce((sum, p) => sum + (p.amount_foreign || 0), 0);
    const ratio = total ? mainShare / total : 0;
    if (!ratio) continue;

    const lines = (categoryLines.results || []).filter(c => c.trip_expense_id === expense.trip_expense_id);
    // บิลที่ไม่ได้แบ่งหมวดถือเป็นก้อนเดียว ใช้หมวดตั้งต้นที่ผู้ปิดทริประบุมา
    const effective = lines.length ? lines : [{ category_id: null, label: '', amount_foreign: expense.amount_foreign }];

    for (const line of effective) {
      const categoryId = line.category_id || categoryMap[line.label || ''] || defaultCategoryId || null;
      if (!categoryId) { unmapped.add(line.label || '(บิลที่ไม่ได้แบ่งหมวด)'); continue; }
      const thb = round2((line.amount_foreign || 0) * rate * ratio);
      byCategory.set(categoryId, round2((byCategory.get(categoryId) || 0) + thb));
    }
  }

  if (unmapped.size) {
    return {
      error: `ยังจับคู่หมวดกับบัญชีจริงไม่ครบ: ${[...unmapped].join(' · ')}`,
      status: 400, unmapped: [...unmapped]
    };
  }
  if (!byCategory.size) return { error: 'ไม่มียอดที่ต้องลงบัญชีหลัก', status: 400 };

  const txId = `TX-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const totalAmount = round2([...byCategory.values()].reduce((sum, v) => sum + v, 0));

  /* source มี CHECK จำกัดไว้ 4 ค่าและ D1 แก้ CHECK ไม่ได้ จึงใช้ WEB_GRID
     ซึ่งหมายถึง "สร้างจากหน้าเว็บ" — ใกล้เคียงที่สุดและไม่ผิดความจริง */
  const statements = [
    env.DB.prepare(`
      INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc,
        status, source, created_by_user_id)
      VALUES (?,?,?,?,?, 'CONFIRMED', 'WEB_GRID', ?)
    `).bind(txId, accountId, postingDate, totalAmount, note, ctx.viewer.user_id || ctx.viewer.member_id)
  ];
  [...byCategory.entries()].forEach(([categoryId, amount], index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type)
      VALUES (?,?,?,?,?,?, 'EXPENSE')
    `).bind(`${txId}-D${index}`, txId, amount, categoryId, projectId, note));
  });

  return { txId, totalAmount, statements };
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

  /* โพสต์เข้าบัญชีจริงเฉพาะเมื่อระบุบัญชีปลายทางมา — ไม่ระบุ = เก็บไว้ใน
     TripClosures อย่างเดียวเหมือนเดิม จะได้ไม่เผลอเขียนลงสมุดบัญชีโดยไม่ตั้งใจ */
  let posting = null;
  if (body.account_id) {
    posting = await buildLedgerPosting(env, ctx, projectId, data, {
      accountId: body.account_id,
      categoryMap: body.category_map || {},
      defaultCategoryId: body.default_category_id || null,
      postingDate,
      note: `ปิดทริป ${ctx.trip.name}`
    });
    if (posting.error) return json({ error: posting.error, unmapped: posting.unmapped }, corsHeaders, posting.status);
  }

  const statements = [
    env.DB.prepare(`
      INSERT INTO TripClosures (closure_id, project_id, entry_type, posting_date, ledger_total,
        trip_only_total, fx_result, carried_thb, reverses_id, reason, performed_by, linked_transaction_id)
      VALUES (?,?,'CLOSE',?,?,?,?,?,NULL,?,?,?)
    `).bind(closureId, projectId, postingDate, ledgerTotal, tripOnlyTotal, fxResult, carriedThb,
            body.reason || null, ctx.viewer.member_id, posting?.txId || null),
    ...(posting?.statements || []),
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
    net_ledger_thb: round2(net?.net || 0),
    posted_to_ledger: Boolean(posting),
    transaction_id: posting?.txId || null,
    transaction_total: posting?.totalAmount ?? null
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

  /* ถ้าครั้งที่ปิดโพสต์เข้าบัญชีจริงไว้ ต้องกลับรายการในบัญชีด้วย
     **ไม่ลบ Transaction เดิม** — สมุดบัญชีมีแต่เพิ่ม ไม่มีลบ ไม่งั้นงบที่เคย
     พิมพ์ออกไปแล้วจะอธิบายไม่ได้ว่ารายการหายไปไหน · ลงเป็นยอดติดลบแทน */
  let reversalTxId = null;
  const reversalStatements = [];
  if (lastClose.linked_transaction_id) {
    const original = await env.DB.prepare(`SELECT * FROM Transactions WHERE transaction_id=?`)
      .bind(lastClose.linked_transaction_id).first();
    const details = await env.DB.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id=?`)
      .bind(lastClose.linked_transaction_id).all();
    if (original) {
      reversalTxId = `TX-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      reversalStatements.push(env.DB.prepare(`
        INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc,
          status, source, created_by_user_id)
        VALUES (?,?,?,?,?, 'CONFIRMED', 'WEB_GRID', ?)
      `).bind(reversalTxId, original.account_id, original.date, -original.total_amount,
              `กลับรายการปิดทริป ${ctx.trip.name}`,
              ctx.viewer.user_id || ctx.viewer.member_id));
      (details.results || []).forEach((row, index) => {
        reversalStatements.push(env.DB.prepare(`
          INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type)
          VALUES (?,?,?,?,?,?, 'EXPENSE')
        `).bind(`${reversalTxId}-D${index}`, reversalTxId, -row.amount, row.category_id,
                row.project_id, `กลับรายการ · ${reason}`));
      });
    }
  }

  const reopenId = `TC-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.batch([
    ...reversalStatements,
    // ค่าลบของครั้งที่กลับ และใช้ posting_date **เดิมของครั้งนั้น**
    // ไม่ใช่วันนี้ เพราะรายการกลับต้องหักล้างในงวดเดียวกับที่โพสต์ไป
    env.DB.prepare(`
      INSERT INTO TripClosures (closure_id, project_id, entry_type, posting_date, ledger_total,
        trip_only_total, fx_result, carried_thb, reverses_id, reason, performed_by, linked_transaction_id)
      VALUES (?,?,'REOPEN',?,?,?,?,?,?,?,?,?)
    `).bind(reopenId, projectId, lastClose.posting_date, -lastClose.ledger_total,
            -lastClose.trip_only_total, -lastClose.fx_result, -lastClose.carried_thb,
            lastClose.closure_id, reason, ctx.viewer.member_id, reversalTxId),
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
    net_ledger_thb: round2(net?.net || 0),
    reversed_transaction_id: reversalTxId
  }, corsHeaders);
}

/* userId มาจากจุดระบุตัวตนกลางใน index.js (token ก่อน แล้วค่อย x-user-id)
   โมดูลนี้ไม่อ่าน header เอง จะได้ไม่มีสองที่ตัดสินว่าใครเป็นใครคนละแบบ */
export async function handleUnifiedTrip(request, env, url, corsHeaders, userId = '') {
  if (!url.pathname.startsWith('/api/unified-trip')) return null;
  if (!userId) return json({ error: 'ยังไม่ได้ล็อกอิน หรือ token หมดอายุ' }, corsHeaders, 401);

  const sub = url.pathname.replace('/api/unified-trip', '').replace(/\/$/, '');

  // สองเส้นทางนี้ไม่ผูกกับทริปใดทริปหนึ่ง — ไม่ต้องมี projectId ต้องเช็คก่อนด่านข้างล่าง
  if (sub === '/trips' && request.method === 'GET') return listTrips(env, userId, corsHeaders);
  if (sub === '/trips' && request.method === 'POST') return createTrip(request, env, userId, corsHeaders);

  const projectId = url.searchParams.get('projectId');
  if (!projectId) return json({ error: 'ต้องระบุ projectId' }, corsHeaders, 400);

  const ctx = await loadContext(env, userId, projectId);
  if (!ctx) return json({ error: 'ไม่พบทริปนี้ หรือไม่มีสิทธิ์เข้าถึง' }, corsHeaders, 404);
  const { trip } = ctx;

  if (request.method !== 'GET') {
    // เปิดทริปกลับต้องอยู่ *ก่อน* ด่านทริปปิด ไม่งั้นจะไม่มีทางเปิดกลับได้เลย
    if (sub === '/closures/reopen' && request.method === 'POST') {
      return reopenTrip(request, env, ctx, projectId, corsHeaders);
    }
    /* แผนเที่ยวก็อยู่ก่อนด่านเช่นกัน — ปิดทริปล็อกเฉพาะตัวเลขที่รายงานเข้าบัญชี
       ไม่ควรห้ามแก้บันทึกการเดินทางย้อนหลัง */
    // แก้ข้อมูลทริปได้แม้ปิดทริปแล้ว เหมือนแผนเที่ยว — ชื่อกับวันที่ไม่ใช่ตัวเลขบัญชี
    if (sub === '/trip' && request.method === 'POST') return writeTripMeta(request, env, ctx, projectId, corsHeaders);
    // ลบทริป — ตรวจเงื่อนไข "เคยโพสต์บัญชีจริงหรือยัง" ในตัวเอง ไม่ผ่านด่านทริปปิดข้างล่าง
    if (sub === '/trip' && request.method === 'DELETE') return deleteTrip(env, ctx, projectId, corsHeaders);
    if (sub === '/stops' && request.method === 'POST') return writeStop(request, env, ctx, projectId, corsHeaders);
    if (sub === '/stops' && request.method === 'DELETE') {
      return deleteStop(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/stops/order' && request.method === 'POST') return reorderStops(request, env, ctx, projectId, corsHeaders);
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

  const [members, currencies, wallets, fundings, expenses, categories, participants, closures, closureLines, presence, stops, ledgerCategories] =
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
      env.DB.prepare(`SELECT * FROM TripStops WHERE project_id=? ORDER BY stop_date, time`).bind(projectId).all(),
      /* ผังบัญชีของครอบครัว — ส่งไปให้ฟอร์มบิลเลือกได้ตั้งแต่ตอนบันทึก
         จะได้ไม่ต้องมานั่งจับคู่ทีหลังตอนปิดทริป ซึ่งคนปิดต้องเดาว่าบิล
         "ของฝาก" ควรลงหมวดอะไร ทั้งที่คนจดรู้อยู่แล้ว
         เอาเฉพาะ behavior = EXPENSE เพราะนี่คือฟอร์มค่าใช้จ่าย */
      env.DB.prepare(`
        SELECT c.category_id, c.name AS category_name, c.caption_id,
               cap.name AS caption_name, cap.behavior
          FROM Categories c JOIN Captions cap ON cap.type_id = c.caption_id
         WHERE c.family_id = ? AND cap.behavior = 'EXPENSE'
         ORDER BY cap.name, c.name
      `).bind(trip.family_id).all()
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
    ledger_categories: ledgerCategories.results || [],
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
