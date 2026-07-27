// ═══════════════════════════════════════════════════════════════════════════
// Unified Trip API — อ่านอย่างเดียว (เฟส 1)
//
//   แยกเป็นไฟล์ต่างหากจาก index.js โดยตั้งใจ: index.js ยาว 3,568 บรรทัดและ
//   เสิร์ฟหน้าอื่นทั้งระบบอยู่ การเพิ่ม endpoint ใหม่ตรงนั้นเสี่ยงเกินจำเป็น
//   ไฟล์นี้ถูกเรียกด้วยบรรทัดเดียวจาก index.js และคืน null ถ้าไม่ใช่ path ของตัวเอง
//
//   เฟส 1 ไม่มี endpoint เขียนข้อมูลเลย — prototype ย้าย "การอ่าน" มาก่อน
//   ส่วนการเขียนยังอยู่ที่ localStorage จนกว่าจะ review รอบนี้ผ่าน
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

export async function handleUnifiedTrip(request, env, url, corsHeaders) {
  if (!url.pathname.startsWith('/api/unified-trip')) return null;

  // เฟส 1 อ่านอย่างเดียว — ปฏิเสธ method อื่นชัด ๆ ดีกว่าเงียบ ๆ ไม่ทำอะไร
  if (request.method !== 'GET') {
    return json({ error: 'เฟสนี้ยังรองรับเฉพาะการอ่าน (GET)' }, corsHeaders, 405);
  }

  const projectId = url.searchParams.get('projectId');
  const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
  if (!projectId) return json({ error: 'ต้องระบุ projectId' }, corsHeaders, 400);
  if (!userId) return json({ error: 'ต้องส่ง header x-user-id' }, corsHeaders, 401);

  // ตรวจว่าผู้ใช้อยู่ครอบครัวเดียวกับทริปก่อนคืนข้อมูลการเงินใด ๆ
  const trip = await env.DB.prepare(`
      SELECT p.project_id, p.family_id, p.name, p.status, p.start_date, p.end_date,
             p.total_budget, p.banner_url, p.theme_banner, p.posting_date, p.closed_at
      FROM Projects p JOIN Users u ON u.user_id = ?
      WHERE p.project_id = ? AND p.family_id = u.family_id
    `).bind(userId, projectId).first();
  if (!trip) return json({ error: 'ไม่พบทริปนี้ หรือไม่มีสิทธิ์เข้าถึง' }, corsHeaders, 404);

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
  const viewer = memberRows.find(row => row.user_id === userId) || null;
  const tripClosed = trip.status === 'closed' || Boolean(trip.closed_at);

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
