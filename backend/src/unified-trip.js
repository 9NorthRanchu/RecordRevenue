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
//   POST   /api/unified-trip/trip            — แก้ชื่อทริป/ช่วงวันที่/ธีมสี (admin)
//   POST   /api/unified-trip/stops           — เพิ่ม/แก้จุดแวะ (สมาชิกทุกคน)
//   DELETE /api/unified-trip/stops?id=
//   POST   /api/unified-trip/stops/order     — จัดลำดับ/ย้ายวัน ทั้งชุดในครั้งเดียว
//   POST   /api/unified-trip/presets          — เพิ่ม/แก้รายการค่าใช้จ่ายย่อยของทริป (ชื่อ+ไอคอน+หมวดบัญชี)
//   DELETE /api/unified-trip/presets?id=
//   POST   /api/unified-trip/presets/copy    — คัดลอกรายการทั้งชุดจากทริปอื่นในครอบครัวเดียวกัน
//   GET    /api/unified-trip/weather?date=   — พยากรณ์อากาศของวันนั้น (Open-Meteo)
//   POST   /api/unified-trip/documents       — เพิ่ม/แก้เอกสาร (ไฟล์ที่อัปโหลด หรือลิงก์ภายนอก)
//   DELETE /api/unified-trip/documents?id=
//   GET    /api/unified-trip/category-icons  — ไอคอนประจำหมวดค่าใช้จ่ายของครอบครัว (ไม่ต้อง projectId)
//   POST   /api/unified-trip/category-icons  — ตั้งไอคอนของหมวด {category_id, icon_url}
//   POST   /api/unified-trip/icon-upload     — อัปโหลดไฟล์รูป (multipart, field "file") ขึ้น R2 คืน URL
//   GET    /api/unified-trip/icon/{key}      — เสิร์ฟไฟล์ไอคอนกลับจาก R2 (ไม่ต้องล็อกอิน)
//   GET    /api/unified-trip/members/login    — รายชื่อสมาชิกที่เข้าด้วยรหัสได้ (ไม่ต้องล็อกอิน)
//   POST   /api/unified-trip/members/login    — ผู้ร่วมทริปเข้าระบบด้วยรหัสของตัวเอง → คืน token
//   POST   /api/unified-trip/members/passcode — ผู้ดูแลตั้ง/ล้างรหัสของสมาชิก
//   POST   /api/unified-trip/presence        — เช็กอินสมาชิกที่จุดแวะ (ทำได้เฉพาะตัวเอง)
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

import { hashPassword, verifyPassword } from './auth.js';

const json = (data, corsHeaders, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

/* ═══════════════════════════════════════════════════════════════════════
   สิทธิ์ของ "ผู้ร่วมทริป" (2026-08-11)

   คนที่เข้ามาด้วย passcode ของทริป ไม่ใช่สมาชิกครอบครัว — เห็นทริปได้
   และจดค่าใช้จ่ายของตัวเองได้ แต่แตะอย่างอื่นไม่ได้เลย

   ⚠️ กติกาสำคัญ: ทุก endpoint ที่ "ไม่ได้อยู่ในรายการอนุญาต" ต้องถูกปฏิเสธ
      โดยอัตโนมัติ ไม่ใช่ไล่ห้ามทีละอัน — เพราะถ้าเพิ่ม endpoint ใหม่วันหลัง
      แล้วลืมใส่ด่าน ผู้ร่วมทริปจะได้สิทธิ์นั้นไปฟรี ๆ โดยไม่มีใครรู้
      (ดู guestAllowed ในตัว handler หลัก)
   ═══════════════════════════════════════════════════════════════════════ */
const GUEST_SESSION_DAYS = 30;

const toB64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toB64Url(digest);
}

/* หา session ของผู้ร่วมทริปจาก token — คืน { project_id, member_id } หรือ null
   ตรวจวันหมดอายุที่นี่ ไม่ใช่ปล่อยให้ caller ตรวจเอง (ลืมง่ายและพลาดแล้วอันตราย) */
async function resolveMemberSession(env, token) {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT project_id, member_id, expires_at FROM TripMemberSessions WHERE token_hash=?`
  ).bind(await sha256(token)).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare(`DELETE FROM TripMemberSessions WHERE token_hash=?`)
      .bind(await sha256(token)).run();
    return null;
  }
  return row;
}

/* เข้าสู่ระบบด้วยรหัสของสมาชิก — ไม่ต้องล็อกอินระบบครอบครัว
   ⚠️ ตอบข้อความเดียวกันทุกกรณีที่ล้มเหลว ไม่บอกว่า "ไม่มีสมาชิกคนนี้" หรือ
      "รหัสผิด" แยกกัน เพราะจะกลายเป็นเครื่องมือไล่เดาว่าใครอยู่ในทริปบ้าง */
async function memberLogin(request, env, url, corsHeaders) {
  const projectId = url.searchParams.get('projectId');
  const body = await request.json().catch(() => ({}));
  const memberId = String(body.member_id || '').trim();
  const passcode = String(body.passcode || '');
  const fail = () => json({ error: 'รหัสไม่ถูกต้อง' }, corsHeaders, 401);

  if (!projectId || !memberId || !passcode) return fail();

  const member = await env.DB.prepare(
    `SELECT member_id, display_name, passcode_hash FROM TripMembers WHERE member_id=? AND project_id=?`
  ).bind(memberId, projectId).first();
  if (!member?.passcode_hash) return fail();
  /* ⚠️ verifyPassword คืน { ok, needsUpgrade } ไม่ใช่ boolean
     ถ้าเช็คแบบ truthy (`if (!await verifyPassword(...))`) object จะเป็นจริงเสมอ
     → รหัสผิดก็ผ่านเข้ามาได้ทุกครั้ง · เคยเขียนพลาดแบบนั้นจริงและเทสจับได้
     ต้องอ่าน .ok เท่านั้น */
  const verdict = await verifyPassword(passcode, member.passcode_hash);
  if (!verdict.ok) return fail();

  const token = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + GUEST_SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO TripMemberSessions (token_hash, project_id, member_id, expires_at) VALUES (?,?,?,?)`
  ).bind(await sha256(token), projectId, memberId, expires).run();

  return json({ token, expires_at: expires, member_id: memberId, name: member.display_name }, corsHeaders);
}

/* รายชื่อสมาชิกที่เปิดให้เข้าด้วยรหัส — หน้าล็อกอินต้องมีให้เลือกว่าเป็นใคร
   คืนแค่ชื่อกับ id ห้ามคืนอย่างอื่นเด็ดขาด เพราะ endpoint นี้เปิดสาธารณะ
   (ยังไม่ได้ล็อกอินก็เรียกได้) และคนที่ได้ลิงก์ทริปไปจะเห็นรายชื่อนี้ */
async function listLoginMembers(env, projectId, corsHeaders) {
  if (!projectId) return json({ error: 'ต้องระบุ projectId' }, corsHeaders, 400);
  const rows = await env.DB.prepare(
    `SELECT member_id, display_name FROM TripMembers
      WHERE project_id=? AND passcode_hash IS NOT NULL AND passcode_hash != ''
      ORDER BY display_name`
  ).bind(projectId).all();
  const trip = await env.DB.prepare(`SELECT name FROM Projects WHERE project_id=?`).bind(projectId).first();
  return json({ trip_name: trip?.name || '', members: rows.results || [] }, corsHeaders);
}

/* ผู้ดูแลทริปตั้ง/ล้างรหัสของสมาชิก
   ล้างรหัส = เพิกถอนสิทธิ์ทันที และต้องลบ session ที่ค้างอยู่ด้วย
   ไม่งั้นคนที่ล็อกอินไปแล้วยังใช้ต่อได้อีก 30 วันทั้งที่ถูกถอนสิทธิ์แล้ว */
/* ── เพิ่ม/แก้สมาชิกในทริป (2026-08-23) ────────────────────────────────
   North: "ให้เพิ่ม คนและสิทธิ์ได้ด้วย"

   🔴 ผู้ดูแลทริปเท่านั้น — ถ้าใครก็เพิ่มสมาชิกได้ ก็เท่ากับเพิ่มคนที่เห็น
      บิลที่แชร์ทั้งทริปได้เอง ซึ่งเป็นการรั่วข้อมูลการเงินของคนอื่น

   member_id ตั้งเองฝั่งเซิร์ฟเวอร์เสมอ ไม่รับจาก client ตอนสร้าง
   (ถ้ารับ จะยิง id ที่ชนกับของทริปอื่นเข้ามาแล้วเขียนทับได้) */
/* ── ใครทำแทนใครได้ (2026-08-23) ──────────────────────────────────────
   North: "จะให้ใครจดบันทึกกระเป๋าเงินและค่าใช้จ่ายของตัวเองก็ได้"

   ทำแทนได้เมื่อเป็นอย่างใดอย่างหนึ่ง:
     · เป็นเจ้าของเอง
     · เป็น "ผู้ดูแล" ที่เจ้าของระบุไว้ (TripMembers.managed_by)
     · เป็นผู้ดูแลทริป

   🔴 ผู้ดูแลรายคนให้สิทธิ์เฉพาะกับคนที่ระบุเท่านั้น ไม่ใช่ทั้งทริป
      ยายตั้ง North เป็นผู้ดูแล ไม่ได้แปลว่า North แตะกระเป๋าของ Puii ได้ด้วย */
async function canActFor(env, ctx, projectId, ownerMemberId) {
  if (!ownerMemberId) return true;                       // ไม่มีเจ้าของ = ของกลาง
  if (ownerMemberId === ctx.viewer?.member_id) return true;
  if (ctx.viewer?.is_admin) return true;
  const row = await env.DB.prepare(
    `SELECT managed_by FROM TripMembers WHERE member_id=? AND project_id=?`
  ).bind(ownerMemberId, projectId).first();
  return Boolean(row?.managed_by) && row.managed_by === ctx.viewer?.member_id;
}

async function writeMember(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin) {
    return json({ error: 'เพิ่มหรือแก้สมาชิกได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.display_name || body.name || '').trim();
  if (!name) return json({ error: 'ต้องตั้งชื่อสมาชิก' }, corsHeaders, 400);
  if (name.length > 60) return json({ error: 'ชื่อยาวเกิน 60 ตัวอักษร' }, corsHeaders, 400);

  /* ledger_mode ตัดสินว่ายอดของคนนี้ไหลเข้าบัญชีครอบครัวจริงหรือเก็บเฉพาะประวัติทริป
     ค่าที่ไม่รู้จักต้องตกเป็น MAIN ไม่ใช่เขียนตามที่ส่งมา — ค่าพิมพ์ผิดจะทำให้
     ยอดหายจากบัญชีจริงตอนปิดทริปโดยไม่มีอะไรฟ้อง */
  const ledger = body.ledger_mode === 'TRIP_ONLY' ? 'TRIP_ONLY' : 'MAIN';
  const role = String(body.role || '').trim().slice(0, 40) || 'สมาชิก';
  const isAdmin = body.is_admin ? 1 : 0;

  /* ── ผูกบัญชีครอบครัว (2026-08-23) ─────────────────────────────────
     🔴 คนที่ตั้งเป็น "ลงบัญชีหลัก" ต้องผูกกับบัญชีในครอบครัวจริงเสมอ
        ยอดของคนกลุ่มนี้จะไหลเข้าสมุดบัญชีจริงตอนปิดทริป ถ้าไม่รู้ว่าเป็นใคร
        ก็ไม่มีทางตรวจย้อนได้ว่ายอดก้อนนั้นเป็นของใคร — และที่แย่กว่าคือ
        ตั้งผิดแล้วไม่มีอะไรฟ้อง จนกระทั่งปิดทริปแล้วยอดเข้าบัญชีมากกว่าที่ควร

     ⚠️ "เฉพาะทริป" ต้องล้าง user_id ทิ้งเสมอ ไม่ใช่ปล่อยค่าเก่าค้าง
        ไม่งั้นคนที่เคยเป็น MAIN แล้วเปลี่ยนเป็น TRIP_ONLY จะยังล็อกอิน
        ด้วยบัญชีครอบครัวเข้ามาเห็นทริปได้เหมือนเดิม */
  let linkedUser = null;
  if (ledger === 'MAIN') {
    linkedUser = String(body.user_id || '').trim();
    if (!linkedUser) {
      return json({ error: 'สมาชิกที่ลงบัญชีหลักต้องผูกกับบัญชีในครอบครัว · เลือกชื่อจากรายการ' }, corsHeaders, 400);
    }
    const owner = await env.DB.prepare(
      `SELECT u.user_id FROM Users u JOIN Projects p ON p.family_id = u.family_id
        WHERE u.user_id=? AND p.project_id=?`
    ).bind(linkedUser, projectId).first();
    if (!owner) return json({ error: 'บัญชีที่เลือกไม่ได้อยู่ในครอบครัวเดียวกับทริปนี้' }, corsHeaders, 400);

    /* หนึ่งบัญชีผูกได้คนเดียวต่อทริป — ถ้าผูกซ้ำ ระบบจะไม่รู้ว่าตอนล็อกอิน
       ควรเป็นสมาชิกคนไหน แล้วสิทธิ์การมองเห็นจะเพี้ยนแบบสุ่ม */
    const taken = await env.DB.prepare(
      `SELECT member_id FROM TripMembers WHERE project_id=? AND user_id=? AND member_id<>?`
    ).bind(projectId, linkedUser, String(body.member_id || '')).first();
    if (taken) return json({ error: 'บัญชีนี้ถูกผูกกับสมาชิกคนอื่นในทริปนี้แล้ว' }, corsHeaders, 409);
  }

  /* ผู้ดูแลรายคน — คนที่จดกระเป๋า/บิลแทนคนนี้ได้ (เช่น ยายที่ไม่ได้ใช้แอปเอง)
     ⚠️ ต้องเป็นสมาชิกในทริปนี้จริง และไม่ใช่ตัวเอง
        ผู้ดูแลที่เป็นตัวเองไม่ได้ให้สิทธิ์อะไรเพิ่ม แต่ทำให้ตรรกะสิทธิ์อ่านยากขึ้น */
  let managedBy = String(body.managed_by || '').trim() || null;
  if (managedBy) {
    if (managedBy === String(body.member_id || '')) {
      return json({ error: 'ตั้งตัวเองเป็นผู้ดูแลของตัวเองไม่ได้' }, corsHeaders, 400);
    }
    const keeper = await env.DB.prepare(
      `SELECT member_id FROM TripMembers WHERE member_id=? AND project_id=?`
    ).bind(managedBy, projectId).first();
    if (!keeper) return json({ error: 'ผู้ดูแลที่เลือกไม่ได้อยู่ในทริปนี้' }, corsHeaders, 400);
  }

  /* รูปประจำตัว — เก็บเป็น path/URL เหมือนไอคอนอื่นในระบบ ว่างได้
     หน้าจอจะถอยไปใช้ตัวอักษรตัวแรกของชื่อเมื่อไม่มีรูป ไม่ใช่ขึ้นช่องว่าง */
  const avatar = String(body.avatar_url || '').trim() || null;

  const memberId = String(body.member_id || '').trim();
  if (!memberId) {
    const newId = `TM-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await env.DB.prepare(`
      INSERT INTO TripMembers (member_id, project_id, user_id, display_name, role, ledger_mode,
        is_admin, avatar_url, managed_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(newId, projectId, linkedUser, name, role, ledger, isAdmin, avatar, managedBy).run();
    return json({ ok: true, member_id: newId, created: true }, corsHeaders);
  }

  const existing = await env.DB.prepare(
    `SELECT member_id, is_admin FROM TripMembers WHERE member_id=? AND project_id=?`
  ).bind(memberId, projectId).first();
  if (!existing) return json({ error: 'ไม่พบสมาชิกที่จะแก้ไขในทริปนี้' }, corsHeaders, 404);

  /* ⚠️ ห้ามถอดสิทธิ์ผู้ดูแลคนสุดท้าย — ทริปที่ไม่มีผู้ดูแลเลยจะแก้อะไรไม่ได้อีก
     รวมถึงแต่งตั้งผู้ดูแลคนใหม่ ซึ่งกลายเป็นทริปที่ตายสนิท */
  if (existing.is_admin && !isAdmin) {
    const admins = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM TripMembers WHERE project_id=? AND is_admin=1`
    ).bind(projectId).first();
    if ((admins?.n || 0) <= 1) {
      return json({ error: 'ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน · ตั้งคนอื่นเป็นผู้ดูแลก่อน' }, corsHeaders, 409);
    }
  }

  await env.DB.prepare(`
    UPDATE TripMembers SET display_name=?, role=?, ledger_mode=?, is_admin=?, avatar_url=?,
      user_id=?, managed_by=?
    WHERE member_id=? AND project_id=?
  `).bind(name, role, ledger, isAdmin, avatar, linkedUser, managedBy, memberId, projectId).run();
  return json({ ok: true, member_id: memberId, created: false }, corsHeaders);
}

/* ลบสมาชิก — มีด่านกันเหมือนการลบกระเป๋า

   🔴 คนที่มีบิล กระเป๋า หรือถูกใส่ไว้ในรายชื่อผู้ร่วมหาร ลบไม่ได้
      ถ้าลบไป บิลจะอ้างถึงคนที่ไม่มีตัวตน ยอดหารเงินจะเพี้ยนโดยไม่มีอะไรฟ้อง
      และรายงาน "ใครติดใคร" จะขึ้นชื่อว่างเปล่า */
async function deleteMember(env, ctx, projectId, memberId, corsHeaders) {
  if (!ctx.viewer?.is_admin) {
    return json({ error: 'ลบสมาชิกได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }
  if (!memberId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);
  const member = await env.DB.prepare(
    `SELECT * FROM TripMembers WHERE member_id=? AND project_id=?`
  ).bind(memberId, projectId).first();
  if (!member) return json({ error: 'ไม่พบสมาชิกนี้ในทริป' }, corsHeaders, 404);

  if (member.member_id === ctx.viewer?.member_id) {
    return json({ error: 'ลบตัวเองออกจากทริปไม่ได้' }, corsHeaders, 409);
  }

  const [bills, walletRows, parts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM TripExpenses
                     WHERE project_id=? AND (member_id=? OR owner_member_id=?)`)
      .bind(projectId, memberId, memberId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM TripWallets WHERE project_id=? AND owner_member_id=?`)
      .bind(projectId, memberId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM TripExpenseParticipants p
                     JOIN TripExpenses e ON e.trip_expense_id = p.trip_expense_id
                    WHERE e.project_id=? AND p.member_id=?`)
      .bind(projectId, memberId).first()
  ]);
  const used = (bills?.n || 0) + (walletRows?.n || 0) + (parts?.n || 0);
  if (used) {
    return json({
      error: `${member.display_name} มีข้อมูลผูกอยู่ในทริปนี้ · ลบไม่ได้`,
      bills: bills?.n || 0, wallets: walletRows?.n || 0, shares: parts?.n || 0
    }, corsHeaders, 409);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TripMemberSessions WHERE member_id=?`).bind(memberId),
    env.DB.prepare(`DELETE FROM TripMembers WHERE member_id=? AND project_id=?`).bind(memberId, projectId)
  ]);
  return json({ ok: true, deleted: memberId }, corsHeaders);
}

async function setMemberPasscode(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer?.is_admin && !ctx.familyAdmin) {
    return json({ error: 'ตั้งรหัสได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }
  const body = await request.json().catch(() => ({}));
  const memberId = String(body.member_id || '').trim();
  const passcode = String(body.passcode || '');

  const member = await env.DB.prepare(`SELECT member_id FROM TripMembers WHERE member_id=? AND project_id=?`)
    .bind(memberId, projectId).first();
  if (!member) return json({ error: 'ไม่พบสมาชิกคนนี้ในทริป' }, corsHeaders, 404);

  if (!passcode) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE TripMembers SET passcode_hash=NULL WHERE member_id=?`).bind(memberId),
      env.DB.prepare(`DELETE FROM TripMemberSessions WHERE member_id=?`).bind(memberId)
    ]);
    return json({ ok: true, enabled: false }, corsHeaders);
  }

  if (passcode.length < 6) return json({ error: 'รหัสต้องยาวอย่างน้อย 6 ตัวอักษร' }, corsHeaders, 400);

  /* เปลี่ยนรหัสก็ต้องเตะ session เดิมออกเหมือนกัน — เหตุผลที่คนเปลี่ยนรหัส
     มักเป็นเพราะรหัสเดิมรั่ว ถ้าปล่อย session เดิมไว้ก็เท่ากับไม่ได้เปลี่ยน */
  await env.DB.batch([
    env.DB.prepare(`UPDATE TripMembers SET passcode_hash=? WHERE member_id=?`)
      .bind(await hashPassword(passcode), memberId),
    env.DB.prepare(`DELETE FROM TripMemberSessions WHERE member_id=?`).bind(memberId)
  ]);
  return json({ ok: true, enabled: true }, corsHeaders);
}

/* ประเภททริป — ตรวจที่โค้ดนี้ ไม่ใช้ CHECK constraint ระดับฐานข้อมูล
   เพราะ D1 แก้ CHECK ทีหลังไม่ได้เลย (เจอปัญหานี้มาแล้วกับ Captions.behavior)
   ONGOING จะเกิดแน่ ๆ · DREAM ยังไม่แน่นอน · MEMORY จบไปแล้ว */
const TRIP_STAGES = ['ONGOING', 'DREAM', 'MEMORY'];

/* ธีมสีที่เลือกได้ — จุดเดียวที่ตัดสินว่าค่าไหนถูกต้อง
   เพิ่มธีมใหม่: เติมชื่อที่นี่ + เพิ่มบล็อก [data-theme="ชื่อ"] ใน themes.css
   ไม่ต้อง migrate ฐานข้อมูลเลย เพราะเก็บเป็นข้อความรหัสธีมอยู่แล้ว */
const TRIP_THEMES = ['hokkaido', 'sakura'];

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
   และต้องเป็นสมาชิกของทริปจึงจะเห็น/แก้อะไรได้

   familyAdmin = ผู้ดูแลระบบของครอบครัว (Users.role = 'admin') มีสิทธิ์
   จัดการข้อมูลทริป (แก้ชื่อ/วันที่/ประเภท และลบ) ของทุกทริปในครอบครัว
   แม้ไม่ได้เป็นสมาชิกทริปนั้น — จำเป็นเพราะทริปเก่า/ทริปทดสอบบางอันมี
   สมาชิกเป็นแค่ชื่อที่ไม่ผูกกับบัญชีใครเลย ถ้าไม่มีกติกานี้จะไม่มีมนุษย์
   คนไหนลบทริปพวกนั้นได้อีกเลย (ต้องไปไล่ลบใน SQL แทน ซึ่งอันตรายกว่ามาก) */
async function loadContext(env, userId, projectId) {
  const trip = await env.DB.prepare(`
      SELECT p.project_id, p.family_id, p.name, p.status, p.start_date, p.end_date,
             p.total_budget, p.banner_url, p.theme_banner, p.posting_date, p.closed_at, p.trip_stage,
             p.theme_id, u.role AS viewer_user_role
      FROM Projects p JOIN Users u ON u.user_id = ?
      WHERE p.project_id = ? AND p.family_id = u.family_id
    `).bind(userId, projectId).first();
  if (!trip) return null;
  const viewer = await env.DB.prepare(
    `SELECT * FROM TripMembers WHERE project_id=? AND user_id=?`
  ).bind(projectId, userId).first();
  return {
    trip, viewer,
    familyAdmin: trip.viewer_user_role === 'admin',
    closed: trip.status === 'closed' || Boolean(trip.closed_at)
  };
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

  /* ── ชนิดกระเป๋า + บัญชีต้นทาง (2026-08-23) ────────────────────────
     CASH   = เงินสด/บัตรเติมเงิน · เติมเงินเข้าไปก่อนแล้วค่อยใช้
              → ผูกบัญชีเงินฝากได้ว่า "เงินก้อนนี้ออกจากบัญชีไหน"
     CREDIT = บัตรเครดิต · ไม่มีการเติมเงิน ใช้ก่อนแล้วค่อยถูกเรียกเก็บ
              → 🔴 ไม่ผูกบัญชีเงินฝาก และตอนปิดทริป "ต้องกรอกยอดบาทจริง"
                 ที่ถูกเรียกเก็บ ไม่งั้นปิดทริปไม่ได้ (North 2026-08-23)
                 เพราะยอดบาทของบัตรเครดิตไม่มีทางรู้จนกว่าบิลจะมา
                 ถ้าปล่อยให้ปิดด้วยเรทประมาณการ ยอดในบัญชีจะไม่ตรงกับที่จ่ายจริง */
  const kind = body.kind === 'CREDIT' ? 'CREDIT' : 'CASH';
  let accountId = kind === 'CREDIT' ? null : (String(body.account_id || '').trim() || null);
  if (accountId) {
    const account = await env.DB.prepare(`
      SELECT a.account_id FROM Accounts a
      JOIN Entities e ON e.entity_id = a.entity_id
      JOIN Projects p ON p.family_id = e.family_id
      WHERE a.account_id=? AND p.project_id=?
    `).bind(accountId, projectId).first();
    if (!account) return json({ error: 'บัญชีที่เลือกไม่ได้อยู่ในครอบครัวเดียวกับทริปนี้' }, corsHeaders, 400);
  }

  // ⚠️ สร้างกับแก้ต้องแยกกันเด็ดขาด ห้ามใช้ upsert ตัวเดียวจบ
  //    ถ้าใช้ INSERT ... ON CONFLICT DO UPDATE แล้ว id ชนกัน (Date.now() ชนกันได้จริง
  //    เมื่อสองคนกดพร้อมกัน) การสร้างกระเป๋าใหม่จะกลายเป็นการ "ทับ" กระเป๋าของคนอื่น
  //    พร้อมเปลี่ยนเจ้าของ โดยไม่มี error ให้เห็นเลย — เจอจากการทดสอบจริง
  /* สีประจำกระเป๋า เก็บเป็น "องศาสี" (hue) 0–359 ไม่ใช่รหัสสี #rrggbb
     เพราะหน้าจอสร้างทั้งพื้นหลัง ขอบ และตัวอักษรจาก hue เดียวกัน
     ค่าคอนทราสต์จึงคุมได้ในที่เดียว ถ้าเก็บเป็นรหัสสีเต็ม ผู้ใช้เลือกสีเข้ม
     แล้วตัวหนังสือบนพื้นนั้นจะอ่านไม่ออกทันทีโดยไม่มีอะไรกันไว้
     ค่านอกช่วงหรือค่าว่าง = null → หน้าจอถอยไปใช้สีตามสกุลเงินเหมือนเดิม */
  const hueRaw = body.color_hue;
  const hue = (hueRaw === null || hueRaw === undefined || hueRaw === '')
    ? null
    : (Number.isFinite(Number(hueRaw)) && Number(hueRaw) >= 0 && Number(hueRaw) <= 359
      ? Math.round(Number(hueRaw)) : null);

  if (!body.wallet_id) {
    const walletId = `TW-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(`
      INSERT INTO TripWallets (wallet_id, project_id, name, currency, owner_member_id, icon_url,
        exclude_on_close, color_hue, account_id, kind)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(walletId, projectId, label, currency, ownerId,
            body.icon_url || null, body.exclude_on_close ? 1 : 0, hue, accountId, kind).run();
    return json({ ok: true, wallet_id: walletId, created: true }, corsHeaders);
  }

  const existing = await env.DB.prepare(`SELECT * FROM TripWallets WHERE wallet_id=? AND project_id=?`)
    .bind(body.wallet_id, projectId).first();
  if (!existing) return json({ error: 'ไม่พบกระเป๋าที่จะแก้ไข' }, corsHeaders, 404);
  if (!await canActFor(env, ctx, projectId, existing.owner_member_id)) {
    return json({ error: 'แก้กระเป๋าของคนอื่นได้เฉพาะผู้ดูแลทริป หรือผู้ดูแลที่เจ้าของระบุไว้' }, corsHeaders, 403);
  }
  // เปลี่ยนสกุลหลังจากมีการเติมเงินแล้วจะทำให้เรทเฉลี่ยไร้ความหมาย
  if (existing.currency !== currency) {
    const lots = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM TripWalletFundings WHERE wallet_id=?`
    ).bind(body.wallet_id).first();
    if (lots?.n) return json({ error: 'เปลี่ยนสกุลเงินของกระเป๋าที่เติมเงินไปแล้วไม่ได้' }, corsHeaders, 409);
  }

  await env.DB.prepare(`
    UPDATE TripWallets SET name=?, currency=?, owner_member_id=?, icon_url=?, exclude_on_close=?,
      color_hue=?, account_id=?, kind=?
    WHERE wallet_id=? AND project_id=?
  `).bind(label, currency, ownerId, body.icon_url || null,
          body.exclude_on_close ? 1 : 0, hue, accountId, kind, body.wallet_id, projectId).run();

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
  if (!await canActFor(env, ctx, projectId, wallet.owner_member_id)) {
    return json({ error: 'เติมเงินเข้ากระเป๋าของคนอื่นได้เฉพาะผู้ดูแลทริป หรือผู้ดูแลที่เจ้าของระบุไว้' }, corsHeaders, 403);
  }

  /* แก้ล็อตเดิม vs เพิ่มล็อตใหม่ — แยกด้วยการมี funding_id มาหรือไม่
     ⚠️ ต้องเช็คว่าล็อตนั้นอยู่ในทริปนี้จริง ไม่ใช่เชื่อ id ที่ส่งมา
        ไม่งั้นจะแก้ล็อตของทริปอื่นได้ด้วยการเดา id */
  let fundingId = String(body.funding_id || '').trim();
  if (fundingId) {
    const existing = await env.DB.prepare(
      `SELECT wallet_id FROM TripWalletFundings WHERE funding_id=? AND project_id=?`
    ).bind(fundingId, projectId).first();
    if (!existing) return json({ error: 'ไม่พบรายการเติมเงินที่จะแก้ไข' }, corsHeaders, 404);
    /* ย้ายล็อตข้ามกระเป๋าไม่ได้ — เรทเฉลี่ยของทั้งสองใบจะเปลี่ยนพร้อมกัน
       และยอดบาทของบิลเก่าที่ผูกอยู่จะขยับตามโดยไม่มีใครตั้งใจ
       อยากย้ายจริง ๆ ให้ลบแล้วสร้างใหม่ จะได้เห็นผลทั้งสองฝั่ง */
    if (existing.wallet_id !== wallet.wallet_id) {
      return json({ error: 'ย้ายรายการเติมเงินข้ามกระเป๋าไม่ได้ · ให้ลบแล้วบันทึกใหม่' }, corsHeaders, 409);
    }
    await env.DB.prepare(`
      UPDATE TripWalletFundings SET funding_date=?, thb_amount=?, foreign_amount=?, rate=?, note=?
       WHERE funding_id=? AND project_id=?
    `).bind(fundingDate, thb, foreign, thb / foreign, body.note || null, fundingId, projectId).run();
  } else {
    fundingId = `TWF-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(`
      INSERT INTO TripWalletFundings (funding_id, wallet_id, project_id, funding_date, thb_amount, foreign_amount, rate, note)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(fundingId, wallet.wallet_id, projectId, fundingDate, thb, foreign, thb / foreign, body.note || null).run();
  }

  // คืนเรทเฉลี่ยใหม่ของทั้งกระเป๋า ไม่ใช่แค่เรทของล็อตนี้
  // เพราะยอดบาทของบิลทุกใบในกระเป๋านี้จะขยับตามค่าเฉลี่ย ไม่ใช่ตามล็อตล่าสุด
  const lots = await env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=?`).bind(projectId).all();
  return json({
    ok: true, funding_id: fundingId, lot_rate: thb / foreign,
    wallet_rate: walletRateFrom(lots.results || [], wallet.wallet_id)
  }, corsHeaders);
}

/* ลบกระเป๋า — มีด่านกันตามกติกาที่ตกลงกับ North (2026-08-22)

   🔴 กระเป๋าที่ "เคยใช้แล้ว" ลบไม่ได้ ต้องลบบิลที่ผูกอยู่ให้หมดก่อน
      เหตุผล: บิลอ้างกระเป๋าเพื่อหาเรทต้นทุน ถ้ากระเป๋าหายไป บิลเก่าจะตี
      เป็นบาทไม่ได้ทันที ยอดรวมทั้งทริปจะลดลงเงียบ ๆ และการหารเงินจะเพี้ยน
      โดยไม่มีอะไรฟ้อง — เป็นความเสียหายที่มองไม่เห็นจนกว่าจะปิดทริป

   ล็อตเติมเงินที่ยังไม่มีบิลผูก ลบไปพร้อมกันได้ แต่ต้องบอกจำนวนให้ผู้ใช้รู้ก่อน
   (ฝั่งหน้าจอถามยืนยันโดยระบุจำนวนล็อต) */
async function deleteWallet(env, ctx, projectId, walletId, corsHeaders) {
  if (!walletId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);
  const wallet = await env.DB.prepare(`SELECT * FROM TripWallets WHERE wallet_id=? AND project_id=?`)
    .bind(walletId, projectId).first();
  if (!wallet) return json({ error: 'ไม่พบกระเป๋านี้ในทริป' }, corsHeaders, 404);
  if (!await canActFor(env, ctx, projectId, wallet.owner_member_id)) {
    return json({ error: 'ลบกระเป๋าของคนอื่นได้เฉพาะผู้ดูแลทริป หรือผู้ดูแลที่เจ้าของระบุไว้' }, corsHeaders, 403);
  }

  const used = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM TripExpenses WHERE wallet_id=? AND project_id=?`
  ).bind(walletId, projectId).first();
  if (used?.n) {
    return json({
      error: `กระเป๋านี้มีบิลผูกอยู่ ${used.n} รายการ · ลบบิลเหล่านั้นให้หมดก่อนจึงจะลบกระเป๋าได้`,
      bills: used.n
    }, corsHeaders, 409);
  }

  const lots = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM TripWalletFundings WHERE wallet_id=? AND project_id=?`
  ).bind(walletId, projectId).first();

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TripWalletFundings WHERE wallet_id=? AND project_id=?`).bind(walletId, projectId),
    env.DB.prepare(`DELETE FROM TripWallets WHERE wallet_id=? AND project_id=?`).bind(walletId, projectId)
  ]);
  return json({ ok: true, deleted: walletId, removed_lots: lots?.n || 0 }, corsHeaders);
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

/* ── ลำดับบิลที่ผู้ใช้จัดเอง (2026-08-22) ──────────────────────────────
   หน้าจอส่ง "รายชื่อ id ตามลำดับที่ต้องการ" มาทั้งชุด ไม่ใช่ส่งทีละคู่ที่สลับ
   เพราะการส่งทีละคู่ต้องให้ทั้งสองฝั่งเห็นลำดับตรงกันตลอด ถ้ามีคนอื่นแก้พร้อมกัน
   ลำดับจะเพี้ยนแบบซ่อมยาก · ส่งทั้งชุดแล้วเขียนทับคือ "ครั้งสุดท้ายชนะ"
   ซึ่งเข้าใจง่ายและไม่มีสถานะกลางที่ผิด

   🔴 ต้องกรองเฉพาะ id ที่อยู่ในทริปนี้จริง ไม่ใช่เชื่อรายการที่ส่งมา
      ไม่งั้นเดา id แล้วเขียน sort_order ทับบิลของทริปอื่นได้ */
async function reorderExpenses(request, env, ctx, projectId, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const order = Array.isArray(body.order) ? body.order.map(id => String(id || '')).filter(Boolean) : null;
  if (!order || !order.length) return json({ error: 'ต้องส่ง order เป็นรายการ id' }, corsHeaders, 400);
  if (order.length > 500) return json({ error: 'ส่งได้ครั้งละไม่เกิน 500 รายการ' }, corsHeaders, 400);

  const rows = await env.DB.prepare(
    `SELECT trip_expense_id FROM TripExpenses WHERE project_id=?`
  ).bind(projectId).all();
  const mine = new Set((rows.results || []).map(row => row.trip_expense_id));
  const valid = order.filter(id => mine.has(id));
  if (!valid.length) return json({ error: 'ไม่พบบิลที่ระบุในทริปนี้' }, corsHeaders, 404);

  /* ไล่เลข 10, 20, 30 … เว้นช่องไว้ เผื่อวันหลังต้องแทรกโดยไม่ต้องเขียนใหม่ทั้งชุด */
  await env.DB.batch(valid.map((id, index) => env.DB.prepare(
    `UPDATE TripExpenses SET sort_order=? WHERE trip_expense_id=? AND project_id=?`
  ).bind((index + 1) * 10, id, projectId)));

  return json({ ok: true, ordered: valid.length, skipped: order.length - valid.length }, corsHeaders);
}

/* ── ลำดับรวมของ "บิล + การเติมเงิน" ในหน้ากระเป๋า (2026-08-22) ────────
   หน้ากระเป๋าแสดงสองอย่างปนกันในรายการเดียว จึงต้องมีลำดับที่ข้ามตารางได้

   🔴 ใช้ "คิวเลขชุดเดียว" ไล่ 10, 20, 30 … ข้ามทั้งสองตาราง
      ถ้าแยกคิวใครคิวมัน (บิลนับ 10,20 · ล็อตนับ 10,20) เลขจะชนกันเอง
      แล้วลำดับที่ผู้ใช้จัดไว้จะสลับกันเองตอนโหลดใหม่ โดยไม่มีอะไรฟ้อง

   รับ [{ kind:'bill'|'fund', id }] และกรองเฉพาะ id ที่อยู่ในทริปนี้จริง */
async function reorderActivity(request, env, ctx, projectId, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const order = Array.isArray(body.order) ? body.order : null;
  if (!order || !order.length) return json({ error: 'ต้องส่ง order เป็นรายการ' }, corsHeaders, 400);
  if (order.length > 500) return json({ error: 'ส่งได้ครั้งละไม่เกิน 500 รายการ' }, corsHeaders, 400);

  const [bills, lots] = await Promise.all([
    env.DB.prepare(`SELECT trip_expense_id AS id FROM TripExpenses WHERE project_id=?`).bind(projectId).all(),
    env.DB.prepare(`SELECT funding_id AS id FROM TripWalletFundings WHERE project_id=?`).bind(projectId).all()
  ]);
  const billIds = new Set((bills.results || []).map(row => row.id));
  const lotIds = new Set((lots.results || []).map(row => row.id));

  const statements = [];
  let placed = 0;
  order.forEach(row => {
    const id = String(row?.id || '');
    const kind = row?.kind === 'fund' ? 'fund' : 'bill';
    const known = kind === 'fund' ? lotIds.has(id) : billIds.has(id);
    if (!id || !known) return;
    placed += 1;
    statements.push(kind === 'fund'
      ? env.DB.prepare(`UPDATE TripWalletFundings SET sort_order=? WHERE funding_id=? AND project_id=?`)
        .bind(placed * 10, id, projectId)
      : env.DB.prepare(`UPDATE TripExpenses SET sort_order=? WHERE trip_expense_id=? AND project_id=?`)
        .bind(placed * 10, id, projectId));
  });
  if (!statements.length) return json({ error: 'ไม่พบรายการที่ระบุในทริปนี้' }, corsHeaders, 404);

  await env.DB.batch(statements);
  return json({ ok: true, ordered: placed, skipped: order.length - placed }, corsHeaders);
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
    if (!await canActFor(env, ctx, projectId, existing.owner_member_id)) {
      return json({ error: 'แก้บิลของคนอื่นได้เฉพาะเจ้าของเงิน ผู้ดูแลทริป หรือผู้ดูแลที่เจ้าของระบุไว้' }, corsHeaders, 403);
    }
  } else if (!await canActFor(env, ctx, projectId, ownerId)) {
    return json({ error: 'บันทึกบิลให้คนอื่นเป็นเจ้าของได้เฉพาะผู้ดูแลทริป หรือผู้ดูแลที่เจ้าของระบุไว้' }, corsHeaders, 403);
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
        split_mode=?, icon_url=?, receipt_image_url=?, note=?
      WHERE trip_expense_id=? AND project_id=?
    `).bind(expenseDate, payerId, ownerId, body.wallet_id || null, amount, amountThb, currency,
            visibility, body.is_shared ? 1 : 0, splitMode, body.icon_url || null,
            body.receipt_image_url || null, body.note || null, expenseId, projectId));
    statements.push(env.DB.prepare(`DELETE FROM TripExpenseParticipants WHERE trip_expense_id=?`).bind(expenseId));
    statements.push(env.DB.prepare(`DELETE FROM TripExpenseCategories WHERE trip_expense_id=?`).bind(expenseId));
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO TripExpenses (trip_expense_id, project_id, expense_date, member_id, owner_member_id,
        wallet_id, amount_foreign, amount_thb, currency_code, visibility, is_shared, split_mode, icon_url,
        receipt_image_url, note, stop_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(expenseId, projectId, expenseDate, payerId, ownerId, body.wallet_id || null,
            amount, amountThb, currency, visibility, body.is_shared ? 1 : 0,
            splitMode, body.icon_url || null, body.receipt_image_url || null, body.note || null,
            /* ผูกบิลกับจุดแวะ — ว่างได้ (บิลที่ไม่ได้เกิดที่จุดไหนโดยเฉพาะ)
               ก่อนหน้านี้ไม่มีคอลัมน์นี้เลย ยอด "ใช้วันนี้" จึงเป็น ฿0 ตลอด */
            String(body.stop_id || '').trim() || null));
  }

  participants.forEach((p, i) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TripExpenseParticipants (participant_id, trip_expense_id, member_id, amount_foreign, percent)
      VALUES (?,?,?,?,?)
    `).bind(`${expenseId}-P${i}`, expenseId, p.member_id, p.amount_foreign, p.percent ?? null));
  });
  /* เก็บ preset_id ไว้ด้วยเมื่อบรรทัดนี้มาจากรายการย่อยของทริป — ตอนอ่านกลับ
     ชื่อกับไอคอนจะถูกดึงสดจาก preset ปัจจุบัน ไม่ใช่จาก label ที่เก็บไว้ตรงนี้
     (label ยังเก็บไว้เป็นภาพนิ่ง เผื่อวันหนึ่ง preset ถูกลบ บิลเก่าจะได้ไม่ไร้ชื่อ) */
  categories.forEach((c, i) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TripExpenseCategories (line_id, trip_expense_id, category_id, label, amount_foreign, preset_id)
      VALUES (?,?,?,?,?,?)
    `).bind(`${expenseId}-C${i}`, expenseId, c.category_id || null, c.label || null,
            Number(c.amount_foreign), c.preset_id || null));
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
  // ผู้ดูแลทริป หรือผู้ดูแลระบบของครอบครัว (จัดการทริปที่สมาชิกไม่ผูกบัญชีได้)
  if (!ctx.viewer?.is_admin && !ctx.familyAdmin) {
    return json({ error: 'แก้ข้อมูลทริปได้เฉพาะผู้ดูแลทริป' }, corsHeaders, 403);
  }
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
    /* ยังไม่รับ data: URL เหมือนเดิม — ยาวเป็นแสนตัวอักษร ทำให้แถวใน Projects
       บวมจนดึงทริปช้าทั้งระบบ · รูปที่อัปโหลดเองต้องผ่าน /icon-upload ก่อน
       แล้วส่ง URL สั้น ๆ ที่ได้กลับมาเก็บตรงนี้แทน */
    if (raw.startsWith('data:')) {
      return json({ error: 'ต้องอัปโหลดรูปผ่านระบบก่อน แล้วค่อยบันทึกที่อยู่รูป' }, corsHeaders, 400);
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

  /* ธีมสี — เก็บเป็นรหัส ไม่ใช่ค่าสีจริง (สีจริงอยู่ใน themes.css)
     รายชื่อธีมที่ใช้ได้อยู่ที่ TRIP_THEMES ตัวเดียว เพิ่มธีมใหม่ = เติมชื่อตรงนั้น
     กับเพิ่มบล็อกตัวแปรใน themes.css ไม่ต้องแตะฐานข้อมูล */
  let theme = ctx.trip.theme_id || null;
  if (body.theme_id !== undefined) {
    const t = String(body.theme_id || '').trim().toLowerCase();
    if (t && !TRIP_THEMES.includes(t)) {
      return json({ error: `ธีมต้องเป็นหนึ่งใน ${TRIP_THEMES.join(', ')}` }, corsHeaders, 400);
    }
    theme = t || null;
  }

  await env.DB.prepare(`UPDATE Projects SET name=?, start_date=?, end_date=?, theme_banner=?, trip_stage=?, theme_id=? WHERE project_id=?`)
    .bind(name, start || null, end || null, banner, stage, theme, projectId).run();

  return json({ ok: true, name, start_date: start, end_date: end,
                theme_banner: banner, trip_stage: stage, theme_id: theme,
                bills_outside_range: outside }, corsHeaders);
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
           (SELECT COUNT(*) FROM TripMembers m WHERE m.project_id = p.project_id) AS member_count,
           (SELECT COUNT(*) FROM TripClosures c
             WHERE c.project_id = p.project_id AND c.linked_transaction_id IS NOT NULL) AS posted_count
      FROM Projects p
     WHERE p.family_id = ?
     ORDER BY p.start_date DESC, p.created_at DESC
  `).bind(user.family_id).all();

  /* หน้ารวมใช้ไอคอนของ Stop เป็นภาพสรุปเส้นทาง โดยอ่านจากข้อมูลจริงชุดเดียวกับ
     หน้าแผนเที่ยว ไม่สร้างรายการตัวอย่างซ้ำใน frontend · ดึงทุก Stop เพื่อให้
     แถบแนวนอนเลื่อนได้ครบ และกรอง family ใน SQL ไม่ให้ข้อมูลข้ามครอบครัว */
  const stops = await env.DB.prepare(`
    SELECT s.project_id, s.stop_id, s.stop_date, s.time, s.sort_order,
           s.name_th, s.name_en, s.city, s.icon_asset
      FROM TripStops s
      JOIN Projects p ON p.project_id = s.project_id
     WHERE p.family_id = ?
     ORDER BY s.project_id, s.stop_date, s.sort_order, s.time
  `).bind(user.family_id).all();
  const stopsByProject = new Map();
  for (const stop of stops.results || []) {
    const list = stopsByProject.get(stop.project_id) || [];
    list.push({
      stop_id: stop.stop_id,
      name: stop.name_th || stop.name_en || stop.city || 'จุดแวะ',
      icon_asset: stop.icon_asset || '',
      stop_date: stop.stop_date || '',
      time: stop.time || ''
    });
    stopsByProject.set(stop.project_id, list);
  }

  return json({
    trips: (trips.results || []).map(row => ({
      ...row,
      trip_stage: row.trip_stage || 'ONGOING',
      posted_to_ledger: (row.posted_count || 0) > 0,
      member_count: Number(row.member_count || 0),
      stops: stopsByProject.get(row.project_id) || []
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

/* ── ไอคอนที่ครอบครัวอัปโหลดเอง (2026-08-07) ─────────────────────────────
   ผูกกับ "ครอบครัว" ไม่ใช่ทริปใดทริปหนึ่ง — เหมือน /trips เพราะหมวดค่าใช้จ่าย
   (Categories) เป็นผังบัญชีระดับครอบครัว ใช้ร่วมกันทุกทริป

   ไฟล์จริงเก็บที่ R2 (binding "ICONS") คีย์เป็น icons/{family_id}/{uuid}.ext
   ตาราง Categories เก็บแค่ URL ที่ /api/unified-trip/icon/{key} ชี้กลับมา */

/* ชนิดไฟล์ที่รับ — รูปสำหรับไอคอน/แบนเนอร์ · PDF สำหรับเอกสารทริป (ใบจอง ตั๋ว)
   PDF อยู่ในตารางเดียวกันเพราะใช้ทางอัปโหลดเดียวกัน แต่เพดานขนาดต่างกัน */
const ICON_MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'application/pdf': 'pdf'
};
const MAX_ICON_BYTES = 3 * 1024 * 1024;
/* ใบจองโรงแรม/ตั๋วเครื่องบินมักหนากว่ารูปมาก (หลายหน้า มีแผนที่ฝัง) 3 MB ไม่พอ
   เก็บที่ R2 จึงให้ถึง 15 MB ได้สบาย ๆ ไม่กระทบอะไร */
const MAX_DOC_BYTES = 15 * 1024 * 1024;
/* เพดานสำหรับไฟล์ที่เก็บลง D1 (กรณีไม่มี R2) — ต่ำกว่า R2 มากโดยตั้งใจ
   เพราะ D1 เป็นฐานข้อมูล ไม่ใช่ที่เก็บไฟล์ แถวใหญ่ ๆ ทำให้ทั้งฐานช้าลง */
const MAX_D1_ASSET_BYTES = 700 * 1024;

async function familyIdFor(env, userId) {
  const row = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id=?`).bind(userId).first();
  return row?.family_id || null;
}

/* เสิร์ฟไฟล์กลับจาก R2 — เรียกจาก handleUnifiedTrip ก่อนด่านล็อกอิน เพราะ
   <img src> แนบ Authorization header ไม่ได้ คีย์เป็น UUID เดายากและเนื้อหา
   เป็นแค่ไอคอนตกแต่ง ไม่ใช่ข้อมูลอ่อนไหว จึงเปิดให้ดึงตรงได้โดยไม่ต้องล็อกอิน */
async function serveIcon(env, key, corsHeaders) {
  if (!key || key.includes('..')) return new Response('not found', { status: 404 });

  const headers = new Headers(corsHeaders);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  /* คีย์ที่ขึ้นต้นด้วย db/ = รูปที่เก็บไว้ใน D1 (ตอนที่ยังไม่มี R2)
     ต้องเช็คก่อน R2 เสมอ เพื่อให้รูปเก่ายังเปิดได้แม้ภายหลังจะเปิด R2 แล้ว */
  if (key.startsWith('db/')) {
    const row = await env.DB.prepare(`SELECT content_type, bytes FROM TripAssets WHERE asset_id=?`)
      .bind(key.slice(3)).first();
    if (!row) return new Response('not found', { status: 404 });
    headers.set('Content-Type', row.content_type || 'application/octet-stream');
    // D1 คืน BLOB มาเป็น array ของตัวเลขในบาง runtime — แปลงให้เป็นไบต์เสมอ
    const bytes = row.bytes instanceof ArrayBuffer ? new Uint8Array(row.bytes) : Uint8Array.from(row.bytes);
    return new Response(bytes, { headers });
  }

  if (!env.ICONS) return new Response('not found', { status: 404 });
  const object = await env.ICONS.get(key);
  if (!object) return new Response('not found', { status: 404 });
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  return new Response(object.body, { headers });
}

/* อัปโหลดไฟล์รูป (multipart, field name "file") ขึ้น R2 คืน URL ถาวร
   ใครในครอบครัวก็อัปโหลดได้ — นี่แค่รูปตกแต่ง ไม่ใช่ข้อมูลการเงิน */
async function uploadIconRoute(request, env, userId, corsHeaders) {
  const familyId = await familyIdFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);

  let form;
  try { form = await request.formData(); } catch { return json({ error: 'อ่านไฟล์ที่อัปโหลดไม่สำเร็จ' }, corsHeaders, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'ไม่พบไฟล์รูปที่อัปโหลด (field "file")' }, corsHeaders, 400);

  const ext = ICON_MIME_EXT[file.type];
  if (!ext) return json({ error: 'รองรับเฉพาะไฟล์ PNG · JPEG · WEBP' }, corsHeaders, 400);

  const origin = new URL(request.url).origin;

  /* มี R2 ก็ใช้ R2 (เหมาะกับไฟล์มากกว่า) — ไม่มีก็เก็บลง D1 แทน
     สำคัญที่ต้อง "ทำงานได้ทั้งสองแบบ" ไม่ใช่ตอบ error เมื่อไม่มี R2 เพราะ
     ฝั่งหน้าจอจะถอยไปเก็บรูปเป็น data: URL ในเบราว์เซอร์ ซึ่งรีเฟรชแล้วหาย
     และคนอื่นในทริปไม่เห็น (เจอปัญหานี้จริงกับภาพแบนเนอร์ 2026-08-11) */
  if (env.ICONS) {
    // เอกสาร PDF ได้โควตาใหญ่กว่ารูป เพราะใบจองหลายหน้ามักหนากว่าไอคอนมาก
    const limit = file.type === 'application/pdf' ? MAX_DOC_BYTES : MAX_ICON_BYTES;
    if (file.size > limit) {
      return json({ error: `ไฟล์ใหญ่เกิน ${Math.round(limit / 1024 / 1024)} MB` }, corsHeaders, 400);
    }
    const key = `icons/${familyId}/${crypto.randomUUID()}.${ext}`;
    await env.ICONS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    return json({ url: `${origin}/api/unified-trip/icon/${key}` }, corsHeaders, 201);
  }

  if (file.size > MAX_D1_ASSET_BYTES) {
    return json({ error: 'ไฟล์ใหญ่เกิน 700 KB · ลองย่อรูปให้เล็กลงก่อน' }, corsHeaders, 400);
  }
  const assetId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO TripAssets (asset_id, family_id, content_type, bytes) VALUES (?,?,?,?)`)
    .bind(assetId, familyId, file.type, new Uint8Array(await file.arrayBuffer())).run();
  return json({ url: `${origin}/api/unified-trip/icon/db/${assetId}` }, corsHeaders, 201);
}

/* รายชื่อบัญชีในครอบครัว — ใช้ผูกกับสมาชิกทริปที่ตั้งเป็น "ลงบัญชีหลัก"
   คืนแค่ id กับชื่อ ไม่คืนอีเมล/รหัส เพราะหน้าจอต้องการแค่พอให้เลือกถูกคน */
async function listFamilyUsers(env, userId, corsHeaders) {
  const { familyId } = await familyRoleFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);
  const rows = await env.DB.prepare(
    `SELECT user_id, name, role FROM Users WHERE family_id=? ORDER BY name`
  ).bind(familyId).all();
  return json({ users: rows.results || [] }, corsHeaders);
}

/* บัญชีเงินฝากในครอบครัว — ใช้ผูกกับกระเป๋าว่า "เงินก้อนนี้ออกจากบัญชีไหน"
   คืนชื่อเจ้าของบัญชี (entity) มาด้วย เพราะครอบครัวหนึ่งมีหลาย entity
   และชื่อบัญชีซ้ำกันได้ เช่น "ออมทรัพย์" ของทั้งพ่อและแม่ */
async function listFamilyAccounts(env, userId, corsHeaders) {
  const { familyId } = await familyRoleFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);
  const rows = await env.DB.prepare(`
    SELECT a.account_id, a.name, e.entity_id, e.name AS entity_name
      FROM Accounts a JOIN Entities e ON e.entity_id = a.entity_id
     WHERE e.family_id = ? ORDER BY e.name, a.name
  `).bind(familyId).all();
  return json({ accounts: rows.results || [] }, corsHeaders);
}

/* ── คลังรูปที่อัปโหลดเอง (2026-08-23) ────────────────────────────────
   North: "ลบภาพที่ไม่เอา จากการเลือกรูป ออกจากระบบ เฉพาะผู้ดูแลเท่านั้น"

   รูปเก็บแยกตามครอบครัว (`icons/{familyId}/…` ใน R2 หรือ TripAssets ใน D1)
   จึงลิสต์และลบได้ในขอบเขตของครอบครัวตัวเองเท่านั้น

   🔴 ลบได้เฉพาะ Users.role = 'admin' ของครอบครัวนั้น
      รูปเป็นของใช้ร่วมกันทั้งครอบครัว ไม่ใช่ของคนอัปโหลด — ถ้าใครก็ลบได้
      คนหนึ่งลบทิ้ง ไอคอนของอีกคนที่ใช้อยู่จะกลายเป็นรูปแตกทันที */
async function familyRoleFor(env, userId) {
  const row = await env.DB.prepare(`SELECT family_id, role FROM Users WHERE user_id=?`).bind(userId).first();
  return { familyId: row?.family_id || null, isAdmin: row?.role === 'admin' };
}

async function listUploadedIcons(env, userId, corsHeaders) {
  const { familyId, isAdmin } = await familyRoleFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);

  const items = [];
  if (env.ICONS) {
    /* R2 list คืนทีละหน้า ต้องวนจนหมด ไม่ใช่เอาแค่หน้าแรก
       ครอบครัวที่อัปโหลดเกิน 1000 รูปจะเห็นไม่ครบถ้าไม่วน */
    let cursor;
    do {
      const page = await env.ICONS.list({ prefix: `icons/${familyId}/`, cursor, limit: 500 });
      page.objects.forEach(obj => items.push({
        key: obj.key,
        url: `/api/unified-trip/icon/${obj.key}`,
        bytes: obj.size,
        uploaded_at: obj.uploaded
      }));
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
  }

  /* ⚠️ ห้ามใช้ .all().catch(...) — D1 บางรุ่นและตัวจำลองในเทสคืนอ็อบเจ็กต์ธรรมดา
     ไม่ใช่ Promise ทำให้ .catch ไม่ใช่ฟังก์ชัน แล้วพังทั้งคำขอ ใช้ try/catch แทน */
  let rows = { results: [] };
  try {
    rows = await env.DB.prepare(
      `SELECT asset_id, content_type, LENGTH(bytes) AS bytes FROM TripAssets WHERE family_id=?`
    ).bind(familyId).all();
  } catch (error) {
    console.error('list TripAssets failed', error);   // ตารางยังไม่มีก็ไม่ควรทำให้ทั้งคลังพัง
  }
  (rows.results || []).forEach(row => items.push({
    key: `db/${row.asset_id}`,
    url: `/api/unified-trip/icon/db/${row.asset_id}`,
    bytes: row.bytes,
    uploaded_at: null
  }));

  // ใหม่ก่อนเสมอ — รูปที่เพิ่งอัปโหลดคือรูปที่คนกำลังมองหา
  items.sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
  return json({ icons: items, can_delete: isAdmin }, corsHeaders);
}

async function deleteUploadedIcon(env, userId, key, corsHeaders) {
  const { familyId, isAdmin } = await familyRoleFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);
  if (!isAdmin) return json({ error: 'ลบรูปออกจากคลังได้เฉพาะผู้ดูแลระบบครอบครัว' }, corsHeaders, 403);
  if (!key) return json({ error: 'ต้องระบุ key' }, corsHeaders, 400);

  /* 🔴 ต้องเช็คว่าคีย์อยู่ในขอบเขตครอบครัวตัวเองจริง ไม่ใช่เชื่อค่าที่ส่งมา
     ไม่งั้นเดาคีย์ของครอบครัวอื่นแล้วลบรูปเขาได้ · และกัน ".." กันไต่ path */
  if (key.includes('..')) return json({ error: 'คีย์ไม่ถูกต้อง' }, corsHeaders, 400);

  if (key.startsWith('db/')) {
    const assetId = key.slice(3);
    const owned = await env.DB.prepare(
      `SELECT asset_id FROM TripAssets WHERE asset_id=? AND family_id=?`
    ).bind(assetId, familyId).first();
    if (!owned) return json({ error: 'ไม่พบรูปนี้ในคลังของครอบครัวคุณ' }, corsHeaders, 404);
    await env.DB.prepare(`DELETE FROM TripAssets WHERE asset_id=? AND family_id=?`)
      .bind(assetId, familyId).run();
    return json({ ok: true, deleted: key }, corsHeaders);
  }

  if (!key.startsWith(`icons/${familyId}/`)) {
    return json({ error: 'ไม่พบรูปนี้ในคลังของครอบครัวคุณ' }, corsHeaders, 404);
  }
  if (!env.ICONS) return json({ error: 'ระบบเก็บไฟล์ยังไม่พร้อม' }, corsHeaders, 404);
  const existing = await env.ICONS.head(key);
  if (!existing) return json({ error: 'ไม่พบรูปนี้ในคลัง' }, corsHeaders, 404);
  await env.ICONS.delete(key);
  return json({ ok: true, deleted: key }, corsHeaders);
}

/* ไอคอนประจำหมวดค่าใช้จ่าย — อ่าน/แก้ Categories.icon_asset ของครอบครัวผู้ใช้
   เอาเฉพาะหมวด behavior='EXPENSE' เพราะเป็นหมวดเดียวที่ฟอร์มบิลทริปใช้เลือก */
async function listCategoryIcons(env, userId, corsHeaders) {
  const familyId = await familyIdFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);

  const rows = await env.DB.prepare(`
    SELECT c.category_id, c.name, c.icon_asset, cap.name AS caption_name
      FROM Categories c JOIN Captions cap ON cap.type_id = c.caption_id
     WHERE c.family_id = ? AND cap.behavior = 'EXPENSE'
     ORDER BY cap.name, c.name
  `).bind(familyId).all();

  return json({ categories: rows.results || [] }, corsHeaders);
}

async function saveCategoryIcon(request, env, userId, corsHeaders) {
  const familyId = await familyIdFor(env, userId);
  if (!familyId) return json({ error: 'ไม่พบผู้ใช้นี้' }, corsHeaders, 401);

  const body = await request.json().catch(() => ({}));
  const categoryId = String(body.category_id || '').trim();
  const iconUrl = String(body.icon_url || '').trim();
  if (!categoryId || !iconUrl) return json({ error: 'ต้องระบุ category_id และ icon_url' }, corsHeaders, 400);

  // ต้องเป็นหมวดของครอบครัวตัวเองเท่านั้น — กัน category_id ของครอบครัวอื่น
  const owned = await env.DB.prepare(`SELECT category_id FROM Categories WHERE category_id=? AND family_id=?`)
    .bind(categoryId, familyId).first();
  if (!owned) return json({ error: 'ไม่พบหมวดนี้ในครอบครัวของคุณ' }, corsHeaders, 404);

  await env.DB.prepare(`UPDATE Categories SET icon_asset=? WHERE category_id=?`).bind(iconUrl, categoryId).run();
  return json({ ok: true }, corsHeaders);
}

/* ── ลบทริป ────────────────────────────────────────────────────────────
   admin ของทริปเท่านั้น · ห้ามลบเด็ดขาดถ้าทริปนี้เคยโพสต์เข้าบัญชีจริงแล้ว
   สักครั้ง (มีแถวใน TripClosures ที่ linked_transaction_id ไม่ว่าง) เพราะ
   การลบ Projects จะทำให้ Transaction/TransactionDetails ในสมุดบัญชีหลัก
   กลายเป็นรายการลอย ไม่เหลือทริปอ้างอิงกลับมา — ให้เปลี่ยนเป็น
   trip_stage = MEMORY แทนการลบจริง (แก้ผ่าน POST /trip ตามปกติ) */
async function deleteTrip(env, ctx, projectId, corsHeaders) {
  // ผู้ดูแลทริป หรือผู้ดูแลระบบของครอบครัว (ทริปเก่าที่ไม่มีสมาชิกผูกบัญชีจะไม่มีใครลบได้เลยถ้าไม่มีข้อนี้)
  if (!ctx.viewer?.is_admin && !ctx.familyAdmin) {
    return json({ error: 'ลบทริปได้เฉพาะผู้ดูแลทริปเท่านั้น' }, corsHeaders, 403);
  }

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
  const requestedVisitStatus = body.visit_status == null ? '' : String(body.visit_status).toUpperCase();
  const skippedReason = String(body.skipped_reason || '').trim();
  const highlightText = String(body.highlight_text || '').trim();
  /* งบที่ตั้งใจจะจ่ายที่จุดนี้ — null ได้ (ไม่ได้ตั้งงบ) ต่างจาก 0 (ตั้งใจว่าไม่เสียเงิน)
     สองอย่างนี้หน้าจอต้องแสดงต่างกัน จึงห้ามยุบ 0 กับ null เป็นค่าเดียว */
  const plannedCost = body.planned_cost === '' || body.planned_cost == null
    ? null : Number(body.planned_cost);
  const plannedCurrency = String(body.planned_currency || '').trim().toUpperCase();
  const mapcode = String(body.mapcode || '').trim();
  const openTime = String(body.open_time || '').trim();
  const closeTime = String(body.close_time || '').trim();
  /* วันหยุดประจำสัปดาห์เป็นเลข 0–6 คั่นจุลภาค · กรองค่านอกช่วงทิ้งตั้งแต่ตรงนี้
     ไม่งั้นเลขมั่ว ๆ จะไปนอนในฐานแล้วเทียบวันไม่เจอโดยไม่มีใครรู้ */
  /* ⚠️ ต้องกรองข้อความว่างทิ้ง **ก่อน** แปลงเป็นตัวเลข — `Number('')` คืน 0
     ซึ่งเป็นเลขวันที่ใช้ได้ (อาทิตย์) ผลคือส่งค่าว่างมาแล้วกลายเป็น
     "หยุดทุกวันอาทิตย์" ให้ทุกสถานที่โดยไม่มีใครสั่ง (เทสจับได้ 2026-08-22) */
  const closedDays = String(body.closed_days || '').split(',')
    .map(day => String(day).trim())
    .filter(Boolean)
    .map(Number)
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    .join(',');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stopDate)) return json({ error: 'ต้องระบุวันที่แบบ YYYY-MM-DD' }, corsHeaders, 400);
  if (time && !HHMM.test(time)) return json({ error: 'เวลาต้องเป็นรูปแบบ HH:MM' }, corsHeaders, 400);
  if (endTime && !HHMM.test(endTime)) return json({ error: 'เวลาสิ้นสุดต้องเป็นรูปแบบ HH:MM' }, corsHeaders, 400);
  // เวลาจบก่อนเวลาเริ่มมักเป็นการพิมพ์ผิด ไม่ใช่กิจกรรมข้ามคืน จึงเตือนไว้
  if (time && endTime && endTime < time) {
    return json({ error: 'เวลาสิ้นสุดอยู่ก่อนเวลาเริ่ม' }, corsHeaders, 400);
  }
  if (!nameTh && !nameEn && !city) return json({ error: 'ต้องมีชื่อจุดแวะอย่างน้อยหนึ่งภาษา' }, corsHeaders, 400);
  if (requestedVisitStatus && !['PLANNED', 'SKIPPED', 'VISITED'].includes(requestedVisitStatus)) {
    return json({ error: 'สถานะจุดแวะไม่ถูกต้อง' }, corsHeaders, 400);
  }
  if (plannedCost !== null && (!Number.isFinite(plannedCost) || plannedCost < 0)) {
    return json({ error: 'งบต่อจุดต้องเป็นตัวเลขไม่ติดลบ' }, corsHeaders, 400);
  }
  if (openTime && !HHMM.test(openTime)) return json({ error: 'เวลาเปิดต้องเป็นรูปแบบ HH:MM' }, corsHeaders, 400);
  if (closeTime && !HHMM.test(closeTime)) return json({ error: 'เวลาปิดต้องเป็นรูปแบบ HH:MM' }, corsHeaders, 400);

  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

  if (body.stop_id) {
    const existing = await env.DB.prepare(`SELECT * FROM TripStops WHERE stop_id=? AND project_id=?`)
      .bind(body.stop_id, projectId).first();
    if (!existing) return json({ error: 'ไม่พบจุดแวะที่จะแก้ไข' }, corsHeaders, 404);
    const visitStatus = requestedVisitStatus || existing.visit_status || 'PLANNED';
    const finalSkippedReason = requestedVisitStatus
      ? (visitStatus === 'SKIPPED' ? skippedReason || null : null)
      : existing.skipped_reason;
    await env.DB.prepare(`
      UPDATE TripStops SET stop_date=?, time=?, end_time=?, city=?, name_th=?, name_en=?,
        accommodation=?, notes=?, icon_asset=?, sort_order=?, latitude=?, longitude=?,
        visit_status=?, skipped_reason=?, highlight_text=?, planned_cost=?, planned_currency=?,
        mapcode=?, open_time=?, close_time=?, closed_days=?
      WHERE stop_id=? AND project_id=?
    `).bind(stopDate, time || null, endTime || null, city || null, nameTh || null, nameEn || null,
            body.accommodation || null, body.notes || null, body.icon_asset || null, sortOrder,
            body.latitude === undefined ? existing.latitude : body.latitude,
            body.longitude === undefined ? existing.longitude : body.longitude, visitStatus,
            finalSkippedReason,
            body.highlight_text === undefined ? existing.highlight_text : highlightText || null,
            body.planned_cost === undefined ? existing.planned_cost : plannedCost,
            body.planned_currency === undefined ? existing.planned_currency : plannedCurrency || null,
            body.mapcode === undefined ? existing.mapcode : mapcode || null,
            body.open_time === undefined ? existing.open_time : openTime || null,
            body.close_time === undefined ? existing.close_time : closeTime || null,
            body.closed_days === undefined ? existing.closed_days : closedDays || null,
            body.stop_id, projectId).run();
    return json({ ok: true, stop_id: body.stop_id, created: false }, corsHeaders);
  }

  // แยก INSERT ออกจาก UPDATE ด้วยเหตุผลเดียวกับกระเป๋า — upsert ที่ id ชนกัน
  // จะกลายเป็นการทับของเดิมเงียบ ๆ แทนที่จะสร้างใหม่
  const stopId = `TS-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const visitStatus = requestedVisitStatus || 'PLANNED';
  await env.DB.prepare(`
    INSERT INTO TripStops (stop_id, project_id, stop_date, time, end_time, city, name_th, name_en,
      accommodation, notes, icon_asset, sort_order, latitude, longitude, visit_status, skipped_reason, highlight_text,
      planned_cost, planned_currency, mapcode, open_time, close_time, closed_days)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(stopId, projectId, stopDate, time || null, endTime || null, city || null,
          nameTh || null, nameEn || null, body.accommodation || null, body.notes || null,
          body.icon_asset || null, sortOrder, body.latitude ?? null, body.longitude ?? null,
          visitStatus, visitStatus === 'SKIPPED' ? skippedReason || null : null, highlightText || null,
          plannedCost, plannedCurrency || null,
          mapcode || null, openTime || null, closeTime || null, closedDays || null).run();
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

async function writeDayPlan(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);
  const body = await request.json().catch(() => ({}));
  const date = String(body.plan_date || '').trim();
  const title = String(body.title || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'ต้องระบุวันที่แบบ YYYY-MM-DD' }, corsHeaders, 400);
  if (title.length > 100) return json({ error: 'ชื่อแผนประจำวันยาวเกิน 100 ตัวอักษร' }, corsHeaders, 400);
  if (!title) {
    await env.DB.prepare(`DELETE FROM TripDayPlans WHERE project_id=? AND plan_date=?`).bind(projectId, date).run();
    return json({ ok:true, plan_date:date, title:'' }, corsHeaders);
  }
  await env.DB.prepare(`
    INSERT INTO TripDayPlans (project_id,plan_date,title,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(project_id,plan_date) DO UPDATE SET title=excluded.title,updated_at=CURRENT_TIMESTAMP
  `).bind(projectId, date, title).run();
  return json({ ok:true, plan_date:date, title }, corsHeaders);
}

/* เช็กอินเป็นการยืนยันโดยผู้ใช้ ไม่ใช่การติดตามตำแหน่งเบื้องหลัง
   พิกัดเป็นตัวเลือก: ถ้าเครื่องอนุญาตและจุดแวะมีพิกัด ระบบตรวจระยะให้
   แต่ผู้ใช้ยังเช็กอินแบบไม่ส่ง GPS ได้ เพื่อเคารพความเป็นส่วนตัว */
async function writePresence(request, env, ctx, projectId, corsHeaders) {
  const memberId = ctx.viewer?.member_id;
  if (!memberId) return json({ error: 'บัญชีนี้ไม่ได้เป็นสมาชิกของทริป จึงเช็กอินไม่ได้' }, corsHeaders, 403);

  const data = await request.json().catch(() => ({}));
  const stopId = String(data.stop_id || '').trim();
  if (!stopId) return json({ error: 'ต้องระบุจุดแวะที่จะเช็กอิน' }, corsHeaders, 400);

  const stop = await env.DB.prepare(`SELECT * FROM TripStops WHERE stop_id=? AND project_id=?`)
    .bind(stopId, projectId).first();
  if (!stop) return json({ error: 'ไม่พบจุดแวะนี้ในทริป' }, corsHeaders, 404);

  const hasLat = data.latitude !== undefined && data.latitude !== null && data.latitude !== '';
  const hasLon = data.longitude !== undefined && data.longitude !== null && data.longitude !== '';
  if (hasLat !== hasLon) return json({ error: 'พิกัดต้องมีทั้ง latitude และ longitude' }, corsHeaders, 400);
  const latitude = hasLat ? Number(data.latitude) : null;
  const longitude = hasLon ? Number(data.longitude) : null;
  if ((hasLat && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (hasLon && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    return json({ error: 'พิกัดไม่ถูกต้อง' }, corsHeaders, 400);
  }

  /* ตรวจระยะเมื่อมีพิกัดทั้งสองฝั่งเท่านั้น · เผื่อ GPS ในอาคาร/พื้นที่ภูเขา 1 กม.
     ถ้าไม่มี GPS จะไม่เดาหรือบังคับผู้ใช้แชร์ตำแหน่ง */
  let distanceM = null;
  if (hasLat && stop.latitude != null && stop.longitude != null) {
    const rad = value => value * Math.PI / 180;
    const dLat = rad(latitude - Number(stop.latitude));
    const dLon = rad(longitude - Number(stop.longitude));
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latitude)) * Math.cos(rad(Number(stop.latitude))) * Math.sin(dLon / 2) ** 2;
    distanceM = Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    if (distanceM > 1000) {
      return json({ error: `คุณอยู่ห่างจากจุดแวะประมาณ ${(distanceM / 1000).toFixed(1)} กม. · หากต้องการเช็กอินโดยไม่ส่งตำแหน่ง ให้ปิดสิทธิ์ตำแหน่งแล้วลองใหม่` }, corsHeaders, 409);
    }
  }

  const checkedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
  const place = stop.name_th || stop.name_en || stop.city || 'จุดแวะ';
  await env.DB.prepare(`
    INSERT INTO TripPresence
      (project_id,member_id,is_sharing,stop_id,place_label,status,latitude,longitude,checked_in_at,expires_at)
    VALUES (?,?,?,?,?,'arrived',?,?,?,?)
    ON CONFLICT(project_id,member_id) DO UPDATE SET
      stop_id=excluded.stop_id, place_label=excluded.place_label, status='arrived',
      latitude=excluded.latitude, longitude=excluded.longitude,
      checked_in_at=excluded.checked_in_at, expires_at=excluded.expires_at
  `).bind(projectId, memberId, 0, stopId, place, latitude, longitude, checkedAt, expiresAt).run();

  return json({ member_id: memberId, stop_id: stopId, place_label: place, status: 'arrived',
    checked_in_at: checkedAt, expires_at: expiresAt, distance_m: distanceM }, corsHeaders);
}

/* ── รายการค่าใช้จ่ายย่อยประจำทริป (2026-08-10) ──────────────────────────
   หนึ่งแถว = ปุ่มหนึ่งปุ่มในฟอร์มจดบิล มีชื่อและไอคอนของตัวเอง แล้วชี้กลับไป
   หมวดบัญชี (Categories) หนึ่งหมวดสำหรับตอนปิดทริป — หลายแถวชี้หมวดเดียวกันได้
   เช่น ราเมง/ขนม/เครื่องดื่ม ทั้งสามผูกหมวด "อาหาร" เหมือนกัน

   ⚠️ บิลอ้าง preset_id ไม่ใช่ก๊อปชื่อ/ไอคอนไปเก็บ แก้ที่นี่ทีเดียวบิลเก่าเปลี่ยนตาม */
async function writePreset(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer && !ctx.familyAdmin) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);

  const body = await request.json().catch(() => ({}));
  const label = String(body.label || '').trim();
  const categoryId = String(body.category_id || '').trim();
  if (!label) return json({ error: 'ต้องตั้งชื่อรายการ' }, corsHeaders, 400);

  /* หมวดบัญชีต้องเป็นของครอบครัวเดียวกับทริป ไม่งั้นตอนปิดทริปจะโพสต์เข้า
     ผังบัญชีของครอบครัวอื่น ซึ่งเป็นข้อมูลรั่วและตัวเลขผิดพร้อมกัน */
  if (categoryId) {
    const owned = await env.DB.prepare(`SELECT category_id FROM Categories WHERE category_id=? AND family_id=?`)
      .bind(categoryId, ctx.trip.family_id).first();
    if (!owned) return json({ error: 'ไม่พบหมวดบัญชีนี้ในครอบครัวของทริป' }, corsHeaders, 400);
  }

  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const iconUrl = body.icon_url ? String(body.icon_url) : null;

  if (body.preset_id) {
    const existing = await env.DB.prepare(`SELECT preset_id FROM TripExpensePresets WHERE preset_id=? AND project_id=?`)
      .bind(body.preset_id, projectId).first();
    if (!existing) return json({ error: 'ไม่พบรายการที่จะแก้ไข' }, corsHeaders, 404);
    await env.DB.prepare(`
      UPDATE TripExpensePresets SET label=?, icon_url=?, category_id=?, sort_order=?
      WHERE preset_id=? AND project_id=?
    `).bind(label, iconUrl, categoryId || null, sortOrder, body.preset_id, projectId).run();
    return json({ ok: true, preset_id: body.preset_id, created: false }, corsHeaders);
  }

  const presetId = `TXP-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(`
    INSERT INTO TripExpensePresets (preset_id, project_id, label, icon_url, category_id, sort_order)
    VALUES (?,?,?,?,?,?)
  `).bind(presetId, projectId, label, iconUrl, categoryId || null, sortOrder).run();
  return json({ ok: true, preset_id: presetId, created: true }, corsHeaders, 201);
}

/* ── พยากรณ์อากาศ (2026-08-11) ────────────────────────────────────────
   ใช้ Open-Meteo: ฟรี ไม่ต้องมี API key ไม่ต้องสมัคร (10,000 ครั้ง/วัน)

   ⚠️ ข้อจำกัดที่ต้องออกแบบรอบ ๆ มัน: พยากรณ์ล่วงหน้าได้แค่ ~16 วัน
      แต่คนวางแผนทริปล่วงหน้าเป็นเดือน ถ้าตอบว่า "ไม่มีข้อมูล" เฉย ๆ
      ก็ไม่ช่วยอะไร จึงถอยไปใช้ "ค่าเฉลี่ยย้อนหลังของช่วงวันเดียวกันปีก่อน"
      แล้ว **ติดป้ายให้ชัดว่าไม่ใช่พยากรณ์** — สำคัญมาก เพราะถ้าคนเข้าใจผิด
      ว่าเป็นพยากรณ์แล้วไปเตรียมเสื้อผ้าตามนั้น จะเสียหายจริง */

/* รหัสสภาพอากาศมาตรฐาน WMO → ไอคอนกับคำอธิบายภาษาไทย
   เก็บเป็นช่วงเพราะรหัสจริงมีหลายสิบตัว แต่คนอ่านไม่ต้องละเอียดขนาดนั้น */
function describeWeather(code) {
  if (code === 0) return { icon: '☀️', text: 'ฟ้าโปร่ง' };
  if (code <= 2) return { icon: '🌤️', text: 'มีเมฆบางส่วน' };
  if (code === 3) return { icon: '☁️', text: 'เมฆมาก' };
  if (code <= 48) return { icon: '🌫️', text: 'หมอก' };
  if (code <= 57) return { icon: '🌦️', text: 'ฝนละออง' };
  if (code <= 67) return { icon: '🌧️', text: 'ฝนตก' };
  if (code <= 77) return { icon: '❄️', text: 'หิมะตก' };
  if (code <= 82) return { icon: '🌧️', text: 'ฝนซู่' };
  if (code <= 86) return { icon: '🌨️', text: 'หิมะซู่' };
  return { icon: '⛈️', text: 'พายุฝนฟ้าคะนอง' };
}

/* หาพิกัดของจุดแวะ — ถ้ายังไม่มีให้ค้นจากชื่อแล้ว **เก็บกลับลงฐาน**
   เพื่อไม่ต้องค้นซ้ำทุกครั้ง (ประหยัดโควตาและเร็วขึ้นมาก)
   คืน null ถ้าหาไม่เจอ ให้ผู้เรียกตัดสินใจ ไม่ใช่เดาพิกัดมั่ว ๆ ให้ */
async function coordsForStop(env, stop) {
  if (stop.latitude != null && stop.longitude != null) {
    return { lat: stop.latitude, lon: stop.longitude };
  }
  const query = stop.name_en || stop.city || stop.name_th;
  if (!query) return null;

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&format=json`);
    if (!response.ok) return null;
    const found = (await response.json())?.results?.[0];
    if (!found) return null;
    await env.DB.prepare(`UPDATE TripStops SET latitude=?, longitude=? WHERE stop_id=?`)
      .bind(found.latitude, found.longitude, stop.stop_id).run();
    return { lat: found.latitude, lon: found.longitude };
  } catch {
    return null;   // บริการภายนอกล่มไม่ควรทำให้ทั้งหน้าพัง
  }
}

/* เติมพิกัดให้จุดแวะทั้งทริปที่ยังไม่มี — ใช้ตอนเปิดหน้าแผนที่
   ⚠️ จำกัดจำนวนต่อครั้ง (GEOCODE_BATCH) และยิงเรียงตัวไม่ยิงพร้อมกัน
   เพราะ Worker มีเพดาน subrequest ต่อคำขอ และการยิงรวดเดียวหลายสิบครั้ง
   ไปที่บริการฟรีเสี่ยงถูกจำกัดอัตรา · จุดที่เหลือค่อยเติมรอบถัดไป
   ตัวเลขที่คืนกลับบอกว่าเหลืออีกกี่จุด หน้าจอจะได้เรียกซ้ำเองได้ */
const GEOCODE_BATCH = 12;

async function geocodeTripStops(env, projectId, offset, corsHeaders) {
  const pending = await env.DB.prepare(`
    SELECT stop_id, name_th, name_en, city, latitude, longitude
      FROM TripStops
     WHERE project_id=? AND (latitude IS NULL OR longitude IS NULL)
     ORDER BY stop_date, sort_order, time, stop_id
  `).bind(projectId).all();

  const queue = pending.results || [];
  /* offset = จำนวนจุดที่รอบก่อน ๆ ค้นแล้วไม่เจอ
     จุดที่ค้นเจอจะหลุดจากรายการนี้ไปเอง (เพราะมีพิกัดแล้ว) แต่จุดที่ค้นไม่เจอ
     จะค้างอยู่หัวรายการตลอด ถ้าไม่ข้ามมัน จุดที่ค้นได้ซึ่งอยู่ท้ายรายการจะ
     ไม่มีวันถูกเรียกถึงเลย — ทริปที่มีสถานที่ชื่อแปลก 12 จุดจะทำให้แผนที่
     ว่างเปล่าไปตลอด ทั้งที่จุดอื่นค้นได้สบาย */
  const slice = queue.slice(offset, offset + GEOCODE_BATCH);
  let filled = 0;
  let failed = 0;
  for (const stop of slice) {
    const coords = await coordsForStop(env, stop);
    if (coords) filled += 1; else failed += 1;
  }

  return json({
    filled,
    failed,                                     // ค้นชื่อไม่เจอ — เรียกซ้ำก็ไม่ช่วย ต้องแก้ชื่อสถานที่เอง
    scanned: slice.length,
    remaining: Math.max(queue.length - offset - slice.length, 0)
  }, corsHeaders);
}

/* ── ระยะทาง/เวลาขับจริงระหว่างจุด (OSRM · 2026-08-20) ─────────────────
   หน้าแผนเที่ยวโชว์ "ขับรถ 25 นาที · 18 กม." ระหว่างจุด · ระยะเส้นตรงใช้แทนไม่ได้
   เพราะถนนในฮอกไกโดอ้อมภูเขา ระยะขับจริงมากกว่าเส้นตรง 20–40%

   ใช้ OSRM สาธารณะ (ฟรี ไม่ต้องใช้ key) แต่ไม่มี SLA — จึงต้อง
   1. แคชผลลงตาราง TripLegs ไม่ยิงซ้ำทุกครั้งที่เปิดหน้า
   2. ล่มแล้วถอยไปใช้เส้นตรง + ติด source='straight' ให้หน้าจอเขียนกำกับว่า "ประมาณ"
      🔴 ห้ามโชว์ค่าประมาณโดยไม่บอก — คนใช้ตัวเลขนี้ตัดสินใจว่าจะออกเดินทางกี่โมง */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const LEG_BATCH = 10;   // เพดาน subrequest ต่อคำขอของ Worker

function straightMeters(a, b) {
  const R = 6371000;
  const rad = deg => deg * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchLeg(a, b) {
  try {
    const url = `${OSRM_BASE}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const route = (await response.json())?.routes?.[0];
    if (!Number.isFinite(route?.distance) || !Number.isFinite(route?.duration)) return null;
    return { meters: route.distance, seconds: route.duration, source: 'osrm' };
  } catch {
    return null;
  }
}

async function tripRoute(env, projectId, corsHeaders) {
  /* เอาเฉพาะจุดที่มีพิกัด เรียงตามวันแล้วตามลำดับในวัน — ช่วงที่ต้องรู้คือ
     คู่จุดที่ติดกัน "ภายในวันเดียวกัน" เท่านั้น ข้ามวันไม่ใช่การขับรถต่อเนื่อง */
  const rows = await env.DB.prepare(`
    SELECT stop_id, stop_date, latitude, longitude
      FROM TripStops
     WHERE project_id=? AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY stop_date, sort_order, time, stop_id
  `).bind(projectId).all();

  const stops = rows.results || [];
  const pairs = [];
  for (let i = 1; i < stops.length; i += 1) {
    if (stops[i].stop_date === stops[i - 1].stop_date) pairs.push([stops[i - 1], stops[i]]);
  }

  const cachedRows = await env.DB.prepare(`SELECT * FROM TripLegs WHERE project_id=?`).bind(projectId).all();
  const cached = new Map((cachedRows.results || []).map(row => [`${row.from_stop_id}>${row.to_stop_id}`, row]));

  let fetched = 0;
  const legs = [];
  for (const [a, b] of pairs) {
    const key = `${a.stop_id}>${b.stop_id}`;
    let row = cached.get(key);
    if (!row && fetched < LEG_BATCH) {
      fetched += 1;
      const found = await fetchLeg(a, b)
        // OSRM ตอบไม่ได้ → ประมาณจากเส้นตรง คูณ 1.3 ตามอัตราส่วนถนนจริงโดยทั่วไป
        // และเฉลี่ย 45 กม./ชม. (ถนนต่างจังหวัดปนเมือง) · ติดป้าย straight ไว้เสมอ
        || (() => {
          const meters = straightMeters(a, b) * 1.3;
          return { meters, seconds: meters / (45_000 / 3600), source: 'straight' };
        })();
      await env.DB.prepare(`
        INSERT INTO TripLegs (project_id, from_stop_id, to_stop_id, meters, seconds, source, updated_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(project_id, from_stop_id, to_stop_id)
        DO UPDATE SET meters=excluded.meters, seconds=excluded.seconds,
                      source=excluded.source, updated_at=CURRENT_TIMESTAMP
      `).bind(projectId, a.stop_id, b.stop_id, found.meters, found.seconds, found.source).run();
      row = { from_stop_id: a.stop_id, to_stop_id: b.stop_id, ...found };
    }
    if (row) {
      legs.push({
        from_stop_id: row.from_stop_id, to_stop_id: row.to_stop_id,
        meters: row.meters, seconds: row.seconds, source: row.source
      });
    }
  }

  return json({ legs, remaining: Math.max(pairs.length - cached.size - fetched, 0) }, corsHeaders);
}

const DAY_MS = 86400_000;
const isoDate = value => new Date(value).toISOString().slice(0, 10);

async function tripWeather(env, projectId, date, corsHeaders, stopId = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD' }, corsHeaders, 400);
  }

  /* หน้าเลือก Stop ขออากาศของจุดที่ผู้ใช้เลือก ส่วนผู้เรียกเก่าที่ยังไม่ส่ง stopId
     ใช้จุดแรกของวันเหมือนเดิมเพื่อรักษาความเข้ากันได้ */
  const stop = stopId
    ? await env.DB.prepare(`
        SELECT stop_id, name_th, name_en, city, latitude, longitude
          FROM TripStops WHERE project_id=? AND stop_date=? AND stop_id=?
      `).bind(projectId, date, stopId).first()
    : await env.DB.prepare(`
    SELECT stop_id, name_th, name_en, city, latitude, longitude
      FROM TripStops WHERE project_id=? AND stop_date=?
     ORDER BY sort_order, time LIMIT 1
  `).bind(projectId, date).first();

  if (!stop) return json({ available: false, reason: 'no_stop' }, corsHeaders);
  const place = stop.name_th || stop.name_en || stop.city || '';
  const coords = await coordsForStop(env, stop);
  if (!coords) return json({ available: false, reason: 'no_coords', place }, corsHeaders);

  const daysAhead = Math.round((new Date(date) - new Date(isoDate(Date.now()))) / DAY_MS);
  /* ขอพระอาทิตย์ขึ้น-ตกมาด้วยในคำขอเดียวกัน — ไม่มีค่าใช้จ่ายเพิ่ม
     ฮอกไกโดกลางธันวาคมมืดตั้งแต่ราว 16:00 · จุดชมวิวที่วางไว้ 16:40 คือมืดไปแล้ว
     ข้อมูลนี้เปลี่ยนการวางแผนจริง จึงควรอยู่บนจอ ไม่ใช่ให้ไปเปิดหาเอง */
  const base = `latitude=${coords.lat}&longitude=${coords.lon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto';

  // Open-Meteo คืนเวลาเป็น '2026-12-18T06:52' — เอาเฉพาะ HH:MM
  const clock = value => (String(value || '').split('T')[1] || '').slice(0, 5) || null;

  try {
    // อยู่ในช่วงที่พยากรณ์ได้จริง (Open-Meteo ให้ล่วงหน้า 16 วัน และย้อนหลังไม่กี่วัน)
    if (daysAhead >= -5 && daysAhead <= 15) {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${base}&start_date=${date}&end_date=${date}`);
      if (!response.ok) throw new Error('forecast failed');
      const daily = (await response.json())?.daily;
      if (!daily?.time?.length) throw new Error('empty');
      const code = daily.weather_code[0];
      return json({
        available: true, kind: 'forecast', place, date,
        ...describeWeather(code),
        temp_max: Math.round(daily.temperature_2m_max[0]),
        temp_min: Math.round(daily.temperature_2m_min[0]),
        rain_chance: daily.precipitation_probability_max?.[0] ?? null,
        sunrise: clock(daily.sunrise?.[0]),
        sunset: clock(daily.sunset?.[0])
      }, corsHeaders);
    }

    /* ไกลเกินพยากรณ์ → ใช้ของจริงจากปีที่แล้วช่วงวันเดียวกัน ±3 วัน แล้วเฉลี่ย
       ±3 วันเพื่อลดผลของวันที่อากาศแปลกไปวันเดียว */
    const lastYear = new Date(date);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const from = isoDate(lastYear.getTime() - 3 * DAY_MS);
    const to = isoDate(lastYear.getTime() + 3 * DAY_MS);
    const response = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?${base}&start_date=${from}&end_date=${to}`);
    if (!response.ok) throw new Error('archive failed');
    const daily = (await response.json())?.daily;
    if (!daily?.time?.length) throw new Error('empty');

    const avg = list => {
      const values = (list || []).filter(value => typeof value === 'number');
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    // รหัสสภาพอากาศเฉลี่ยไม่ได้ (เป็นหมวดหมู่) จึงใช้ตัวที่พบบ่อยที่สุดแทน
    const counts = {};
    (daily.weather_code || []).forEach(code => { counts[code] = (counts[code] || 0) + 1; });
    const common = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3);

    return json({
      available: true, kind: 'historical', place, date,
      ...describeWeather(common),
      temp_max: Math.round(avg(daily.temperature_2m_max)),
      temp_min: Math.round(avg(daily.temperature_2m_min)),
      rain_chance: null,
      /* พระอาทิตย์ขึ้น-ตกของวันเดียวกันปีก่อนต่างจากปีนี้ไม่ถึงนาที (เป็นดาราศาสตร์
         ไม่ใช่สภาพอากาศ) จึงใช้ได้เลย · เอาตัวกลางของช่วง ±3 วันที่ดึงมา */
      sunrise: clock(daily.sunrise?.[3] ?? daily.sunrise?.[0]),
      sunset: clock(daily.sunset?.[3] ?? daily.sunset?.[0]),
      reference_year: lastYear.getFullYear()
    }, corsHeaders);
  } catch {
    /* บริการภายนอกล่ม/ตอบผิดรูป — ตอบว่าไม่มีข้อมูล ไม่ใช่ 500
       เพราะพยากรณ์อากาศเป็นของประกอบ ไม่ควรทำให้ทั้งหน้าดูเหมือนพัง */
    return json({ available: false, reason: 'service_error', place }, corsHeaders);
  }
}

/* ── เอกสารประจำทริป (2026-08-11) ─────────────────────────────────────
   ใบจองโรงแรม ตั๋วเครื่องบิน ประกัน — ผูกกับจุดแวะเป็นหลัก (stop_id)
   เว้น stop_id ว่างได้ = เอกสารที่ครอบคลุมทั้งทริป

   สมาชิกทุกคนในทริปเพิ่ม/ลบได้ ไม่ต้องเป็น admin — เอกสารเป็นข้อมูลร่วม
   คนละเรื่องกับตัวเลขการเงินที่ต้องคุมสิทธิ์ */
async function writeDocument(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer && !ctx.familyAdmin) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  const stopId = String(body.stop_id || '').trim();
  const kind = body.kind === 'file' ? 'file' : 'link';

  if (!name) return json({ error: 'ต้องตั้งชื่อเอกสาร' }, corsHeaders, 400);
  if (!url) return json({ error: 'ต้องมีไฟล์หรือลิงก์' }, corsHeaders, 400);
  /* รับเฉพาะ http(s) — กัน javascript: และ data: ที่กลายเป็นช่องโจมตีได้
     เพราะลิงก์นี้ถูกเอาไปใส่ href แล้วสมาชิกคนอื่นในทริปจะกดตาม */
  if (!/^https?:\/\//i.test(url)) return json({ error: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' }, corsHeaders, 400);
  if (url.length > 1000) return json({ error: 'ลิงก์ยาวเกินไป' }, corsHeaders, 400);

  // จุดแวะต้องอยู่ในทริปนี้จริง ไม่งั้นเอกสารจะไปโผล่ในทริปที่ไม่เกี่ยวข้อง
  if (stopId) {
    const stop = await env.DB.prepare(`SELECT stop_id FROM TripStops WHERE stop_id=? AND project_id=?`)
      .bind(stopId, projectId).first();
    if (!stop) return json({ error: 'ไม่พบสถานที่นี้ในทริป' }, corsHeaders, 400);
  }

  if (body.doc_id) {
    const existing = await env.DB.prepare(`SELECT document_id FROM TripDocuments WHERE document_id=? AND project_id=?`)
      .bind(body.doc_id, projectId).first();
    if (!existing) return json({ error: 'ไม่พบเอกสารที่จะแก้ไข' }, corsHeaders, 404);
    await env.DB.prepare(`
      UPDATE TripDocuments SET related_entity_id=?, description=?, file_url=?, kind=?
       WHERE document_id=? AND project_id=?
    `).bind(stopId || null, name, url, kind, body.doc_id, projectId).run();
    return json({ ok: true, doc_id: body.doc_id, created: false }, corsHeaders);
  }

  const docId = `DOC-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(`
    INSERT INTO TripDocuments (document_id, project_id, related_entity_id, file_url, description, type, kind, content_type, size_bytes)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(docId, projectId, stopId || null, url, name, 'booking', kind,
          body.content_type || null, Number(body.size_bytes) || null).run();
  return json({ ok: true, doc_id: docId, created: true }, corsHeaders, 201);
}

/* ลบเอกสาร — ลบเฉพาะรายการในฐาน ไม่ลบไฟล์จริงบน R2
   เหตุผล: ไฟล์เดียวกันอาจถูกอ้างจากหลายที่ (คนก๊อป URL ไปแปะเอกสารอื่น)
   ลบไฟล์ทิ้งเลยจะทำให้อีกที่พังโดยไม่มีใครรู้ · พื้นที่ R2 ฟรี 10 GB
   ซึ่งเหลือเฟือสำหรับเอกสารครอบครัว จึงไม่คุ้มเสี่ยงเพื่อประหยัดพื้นที่ */
async function deleteDocument(env, ctx, projectId, docId, corsHeaders) {
  if (!ctx.viewer && !ctx.familyAdmin) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);
  if (!docId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);
  const existing = await env.DB.prepare(`SELECT document_id FROM TripDocuments WHERE document_id=? AND project_id=?`)
    .bind(docId, projectId).first();
  if (!existing) return json({ error: 'ไม่พบเอกสารนี้' }, corsHeaders, 404);
  await env.DB.prepare(`DELETE FROM TripDocuments WHERE document_id=? AND project_id=?`).bind(docId, projectId).run();
  return json({ ok: true, deleted: docId }, corsHeaders);
}

/* คัดลอกรายการย่อยทั้งชุดจากทริปอื่น (2026-08-11)
   ทริปใหม่เริ่มจากศูนย์เสมอ ซึ่งแปลว่าจดบิลไม่ได้เลยจนกว่าจะตั้งรายการเองทีละอัน
   ครอบครัวหนึ่งมักไปเที่ยวแบบเดิม ๆ (ค่าอาหาร ค่ารถ ค่าที่พัก) การก๊อปจากทริปก่อน
   จึงประหยัดเวลาได้มาก โดยยังคงหลักการ "แต่ละทริปมีชุดของตัวเอง" ไว้ —
   คัดลอกแล้วเป็นคนละแถว แก้/ลบในทริปใหม่ไม่กระทบทริปต้นทาง

   ⚠️ ข้ามรายการที่ชื่อซ้ำกับที่มีอยู่แล้ว เพื่อให้กดซ้ำได้โดยไม่เกิดของซ้ำซ้อน */
async function copyPresets(request, env, ctx, projectId, corsHeaders) {
  if (!ctx.viewer && !ctx.familyAdmin) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);

  const body = await request.json().catch(() => ({}));
  const fromId = String(body.from_project_id || '').trim();
  if (!fromId) return json({ error: 'ต้องระบุทริปต้นทาง' }, corsHeaders, 400);
  if (fromId === projectId) return json({ error: 'คัดลอกจากทริปเดียวกันไม่ได้' }, corsHeaders, 400);

  // ต้องเป็นทริปในครอบครัวเดียวกัน ไม่งั้นจะดึงข้อมูลข้ามครอบครัวได้
  const source = await env.DB.prepare(`SELECT project_id FROM Projects WHERE project_id=? AND family_id=?`)
    .bind(fromId, ctx.trip.family_id).first();
  if (!source) return json({ error: 'ไม่พบทริปต้นทาง หรือไม่ได้อยู่ในครอบครัวเดียวกัน' }, corsHeaders, 404);

  const [from, existing] = await Promise.all([
    env.DB.prepare(`SELECT label, icon_url, category_id, sort_order FROM TripExpensePresets
                     WHERE project_id=? ORDER BY sort_order, created_at`).bind(fromId).all(),
    env.DB.prepare(`SELECT label FROM TripExpensePresets WHERE project_id=?`).bind(projectId).all()
  ]);

  const taken = new Set((existing.results || []).map(row => row.label));
  const rows = (from.results || []).filter(row => !taken.has(row.label));
  if (!rows.length) return json({ ok: true, copied: 0, skipped: (from.results || []).length }, corsHeaders);

  await env.DB.batch(rows.map((row, index) => env.DB.prepare(`
    INSERT INTO TripExpensePresets (preset_id, project_id, label, icon_url, category_id, sort_order)
    VALUES (?,?,?,?,?,?)
  `).bind(`TXP-${projectId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
          projectId, row.label, row.icon_url, row.category_id, taken.size + index)));

  return json({ ok: true, copied: rows.length, skipped: (from.results || []).length - rows.length }, corsHeaders);
}

/* ลบรายการย่อย — บิลเก่าที่เคยใช้ยังอยู่ครบ แค่ preset_id ชี้ไปที่ที่ไม่มีแล้ว
   จึงต้องคลาย preset_id ของบิลออกก่อน แล้วเก็บ label ตอนนั้นไว้เป็นข้อความ
   ไม่งั้นบิลเก่าจะกลายเป็นรายการไม่มีชื่อ ซึ่งอ่านย้อนหลังไม่ออก */
async function deletePreset(env, ctx, projectId, presetId, corsHeaders) {
  if (!ctx.viewer && !ctx.familyAdmin) return json({ error: 'ต้องเป็นสมาชิกของทริปนี้' }, corsHeaders, 403);
  if (!presetId) return json({ error: 'ต้องระบุ id' }, corsHeaders, 400);

  const existing = await env.DB.prepare(`SELECT * FROM TripExpensePresets WHERE preset_id=? AND project_id=?`)
    .bind(presetId, projectId).first();
  if (!existing) return json({ error: 'ไม่พบรายการนี้' }, corsHeaders, 404);

  await env.DB.batch([
    env.DB.prepare(`UPDATE TripExpenseCategories SET preset_id=NULL, label=COALESCE(label, ?) WHERE preset_id=?`)
      .bind(existing.label, presetId),
    env.DB.prepare(`DELETE FROM TripExpensePresets WHERE preset_id=? AND project_id=?`).bind(presetId, projectId)
  ]);
  return json({ ok: true, deleted: presetId }, corsHeaders);
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
    /* ดึง entity_id ของสมาชิกมาด้วย — ใช้ติดกับบรรทัดในสมุดบัญชี
       เพื่อให้ดูย้อนได้ว่ายอดก้อนไหนเป็นของใคร (North 2026-08-23)
       ⚠️ LEFT JOIN เพราะคนที่เป็น TRIP_ONLY ไม่มีบัญชีผูกไว้ ซึ่งถูกต้องแล้ว
          ถ้าใช้ JOIN ธรรมดา คนกลุ่มนั้นจะหายไปจากการคิดยอดทั้งหมด */
    env.DB.prepare(`
      SELECT m.*, e.entity_id
        FROM TripMembers m
        LEFT JOIN Users u ON u.user_id = m.user_id
        LEFT JOIN Entities e ON e.family_id = u.family_id AND e.name = u.name
       WHERE m.project_id=?
    `).bind(projectId).all(),
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
  const { accountId, categoryMap = {}, defaultCategoryId = null, postingDate, note,
          billSettled = new Map() } = options;

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

  /* ── แตกบรรทัดเป็น "หมวด × คน" (North 2026-08-23) ──────────────────
     เดิมรวมเป็นก้อนเดียวแยกตามหมวดเท่านั้น ดูย้อนไม่ได้ว่ายอดก้อนไหนของใคร
     ตอนนี้แต่ละบรรทัดติด entity_id ของคนนั้น (มาจากบัญชีที่ผูกไว้กับสมาชิก)

     🔴 คิดจาก TripExpenseParticipants รายคน ไม่ใช่คูณสัดส่วนรวมทีเดียว
        บิลที่หารไม่เท่ากันจะได้ยอดต่อคนที่ผิด ถ้าใช้สัดส่วนเฉลี่ย
     ⚠️ คนที่ ledger_mode = TRIP_ONLY ข้ามไปเลย ไม่ใช่ลงเป็นยอด 0
        ยอดของเขาไม่ควรปรากฏในสมุดบัญชีจริงในรูปแบบใดทั้งสิ้น */
  const entityOf = memberId => {
    const member = data.members.find(m => m.member_id === memberId);
    return member?.entity_id || null;
  };

  const byLine = new Map();   // `${categoryId}|${entityId}` → { categoryId, entityId, amount, who }
  const unmapped = new Set();

  for (const expense of data.expenses) {
    const wallet = data.wallets.find(w => w.wallet_id === expense.wallet_id) || null;
    /* 🔴 บิลบัตรเครดิตใช้ "ยอดบาทจริงของบิลใบนั้น" ไม่ใช่คูณเรทเฉลี่ย
       ธนาคารแปลงค่าเงินทีละรายการตามวันที่รูดจริง เรทเฉลี่ยจะทำให้ยอดราย
       หมวดและรายคนเพี้ยน ทั้งที่ยอดรวมถูก */
    const settled = billSettled.get(expense.trip_expense_id);
    const rate = settled != null && (expense.amount_foreign || 0)
      ? settled / expense.amount_foreign
      : rateOf(expense.currency_code, wallet).rate;
    if (rate === null) continue;

    const parts = data.participants.filter(p => p.trip_expense_id === expense.trip_expense_id);
    const total = parts.reduce((sum, p) => sum + (p.amount_foreign || 0), 0) || (expense.amount_foreign || 0);
    if (!total) continue;

    const lines = (categoryLines.results || []).filter(c => c.trip_expense_id === expense.trip_expense_id);
    // บิลที่ไม่ได้แบ่งหมวดถือเป็นก้อนเดียว ใช้หมวดตั้งต้นที่ผู้ปิดทริประบุมา
    const effective = lines.length ? lines : [{ category_id: null, label: '', amount_foreign: expense.amount_foreign }];

    /* บิลที่ไม่มีผู้ร่วมหารเลย ถือว่าเป็นของเจ้าของเงินคนเดียวเต็มจำนวน
       ไม่ใช่ข้ามทิ้ง — ไม่งั้นบิลส่วนตัวจะหายจากสมุดบัญชีทั้งใบ */
    const shares = parts.length
      ? parts.map(p => ({ memberId: p.member_id, amount: p.amount_foreign || 0 }))
      : [{ memberId: expense.owner_member_id || expense.member_id, amount: total }];

    for (const share of shares) {
      if (modeOf(share.memberId) !== 'MAIN') continue;
      const ratio = share.amount / total;
      if (!ratio) continue;
      const entityId = entityOf(share.memberId);
      const who = data.members.find(m => m.member_id === share.memberId)?.display_name || '';

      for (const line of effective) {
        const categoryId = line.category_id || categoryMap[line.label || ''] || defaultCategoryId || null;
        if (!categoryId) { unmapped.add(line.label || '(บิลที่ไม่ได้แบ่งหมวด)'); continue; }
        const thb = round2((line.amount_foreign || 0) * rate * ratio);
        if (!thb) continue;
        const key = `${categoryId}|${entityId || ''}`;
        const row = byLine.get(key) || { categoryId, entityId, amount: 0, who };
        row.amount = round2(row.amount + thb);
        byLine.set(key, row);
      }
    }
  }

  if (unmapped.size) {
    return {
      error: `ยังจับคู่หมวดกับบัญชีจริงไม่ครบ: ${[...unmapped].join(' · ')}`,
      status: 400, unmapped: [...unmapped]
    };
  }
  if (!byLine.size) return { error: 'ไม่มียอดที่ต้องลงบัญชีหลัก', status: 400 };

  const txId = `TX-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  /* กำไร/ขาดทุนอัตราแลกเปลี่ยนลงเป็น "บรรทัดแยกต่างหาก" (North 2026-08-23)
     🔴 ห้ามเกลี่ยเข้าไปในค่าใช้จ่ายแต่ละหมวด — ถ้าเกลี่ย จะดูไม่ออกเลยว่า
        ปีนี้ขาดทุนค่าเงินไปเท่าไร และยอดหมวดอาหารจะเพี้ยนไปด้วยเหตุที่ไม่ใช่อาหาร
     ยอดติดลบ = ขาดทุน (จ่ายบาทมากกว่าต้นทุน) · เป็นบวก = ได้คืนมากกว่าต้นทุน */
  const totalAmount = round2([...byLine.values()].reduce((sum, row) => sum + row.amount, 0));

  /* source มี CHECK จำกัดไว้ 4 ค่าและ D1 แก้ CHECK ไม่ได้ จึงใช้ WEB_GRID
     ซึ่งหมายถึง "สร้างจากหน้าเว็บ" — ใกล้เคียงที่สุดและไม่ผิดความจริง */
  const statements = [
    env.DB.prepare(`
      INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc,
        status, source, created_by_user_id)
      VALUES (?,?,?,?,?, 'CONFIRMED', 'WEB_GRID', ?)
    `).bind(txId, accountId, postingDate, totalAmount, note, ctx.viewer.user_id || ctx.viewer.member_id)
  ];
  [...byLine.values()].forEach((row, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, entity_id, project_id, note, type)
      VALUES (?,?,?,?,?,?,?, 'EXPENSE')
    `).bind(`${txId}-D${index}`, txId, row.amount, row.categoryId, row.entityId, projectId,
            row.who ? `${note} · ${row.who}` : note));
  });



  return { txId, totalAmount, statements };
}

/* ── รายการกำไร/ขาดทุนอัตราแลกเปลี่ยน (2026-08-23) ────────────────────
   North: "กำไร/ขาดทุนอัตราแลกเปลี่ยน ตอนปิดทริป ต้องกำหนดไว้ด้วยให้ลงบัญชี
           หลักบัญชีไหน เหมือนค่าใช้จ่าย"

   🔴 ต้องเป็น Transaction "คนละใบ" กับค่าใช้จ่าย ไม่ใช่บรรทัดในใบเดียวกัน
      เพราะหนึ่ง Transaction ผูกได้บัญชีเดียว — ถ้าอยากให้เลือกบัญชีของ FX
      ได้ต่างหาก ก็ต้องแยกใบ

   และมันเป็นเหตุการณ์คนละเหตุการณ์จริง ๆ:
      ค่าใช้จ่าย = เงินออกจากบัญชีที่เติมเข้ากระเป๋า
      กำไร/ขาดทุน = ตอนเอาเงินที่เหลือไปแลกกลับ ได้บาทมากหรือน้อยกว่าต้นทุน
                    ซึ่งเข้าบัญชีที่รับเงินคืน อาจคนละใบกับที่จ่ายออกไป

   ⚠️ ถ้ามี FX แต่ไม่ระบุบัญชีหรือหมวด → ปฏิเสธ ไม่ใช่ยัดเข้าที่อื่น
      ยอดนี้ไม่ใช่ค่าใช้จ่ายของอะไรสักอย่าง ยัดเข้าหมวดไหนก็ผิดหมด */
async function buildFxPostings(env, ctx, projectId, options) {
  const { entries, postingDate, note } = options;
  if (!entries.length) return { statements: [], txIds: [] };

  /* 🔴 ห้ามรวมผลต่างข้ามกระเป๋า (North 2026-08-23)
     กระเป๋า A แลกคืนเข้าบัญชี 1 · กระเป๋า B แลกคืนเข้าบัญชี 2
     ถ้ารวมเป็นก้อนเดียวแล้วลงบัญชีเดียว ยอดคงเหลือของทั้งสองบัญชีจะไม่ตรง
     กับความจริง — และไม่มีอะไรฟ้อง เพราะยอดรวมทั้งครอบครัวยังถูก */
  const accounts = await env.DB.prepare(`
    SELECT a.account_id FROM Accounts a
    JOIN Entities e ON e.entity_id = a.entity_id
    WHERE e.family_id = ?
  `).bind(ctx.trip.family_id).all();
  const known = new Set((accounts.results || []).map(row => row.account_id));

  const statements = [];
  const txIds = [];
  entries.forEach((entry, index) => {
    if (!entry.accountId) {
      throw new HttpError(`กระเป๋า "${entry.walletName}" มีกำไร/ขาดทุนอัตราแลกเปลี่ยน · ต้องระบุบัญชีที่จะลงยอดนี้`, 400);
    }
    if (!entry.categoryId) {
      throw new HttpError(`กระเป๋า "${entry.walletName}" มีกำไร/ขาดทุนอัตราแลกเปลี่ยน · ต้องระบุหมวดบัญชี`, 400);
    }
    if (!known.has(entry.accountId)) {
      throw new HttpError(`บัญชีสำหรับกำไร/ขาดทุนของกระเป๋า "${entry.walletName}" ไม่ใช่บัญชีของครอบครัวนี้`, 400);
    }
    const txId = `TXFX-${projectId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`;
    const label = `${note} · ${entry.amount < 0 ? 'ขาดทุน' : 'กำไร'}อัตราแลกเปลี่ยน · ${entry.walletName}`;
    txIds.push(txId);
    statements.push(
      env.DB.prepare(`
        INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc,
          status, source, created_by_user_id)
        VALUES (?,?,?,?,?, 'CONFIRMED', 'WEB_GRID', ?)
      `).bind(txId, entry.accountId, postingDate, entry.amount, label,
              ctx.viewer.user_id || ctx.viewer.member_id),
      env.DB.prepare(`
        INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type)
        VALUES (?,?,?,?,?,?, 'EXPENSE')
      `).bind(`${txId}-D0`, txId, entry.amount, entry.categoryId, projectId, label)
    );
  });
  return { statements, txIds };
}

/* ใช้ throw แทน return {error} ในลูปข้างบน เพราะต้องหยุดทันทีที่เจอปัญหา
   ไม่ใช่สร้าง statement ครึ่ง ๆ กลาง ๆ ไว้แล้วค่อยตัดสินใจทีหลัง */
class HttpError extends Error {
  constructor(message, status) { super(message); this.status = status; }
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
      return { wallet: w, spent: round2(spent), leftover: round2(funded - spent), rate: rate.rate };
    });

  const lines = Array.isArray(body.lines) ? body.lines : [];

  /* ── บัตรเครดิต: กรอกยอดบาทจริง "ทีละบิล" (North 2026-08-23) ───────
     🔴 ยอดบาทของบัตรเครดิตไม่มีทางรู้จนกว่าบิลจะเรียกเก็บ
        ถ้าปล่อยให้ปิดด้วยเรทประมาณการ ยอดในสมุดบัญชีจะไม่ตรงกับที่จ่ายจริง
        และไม่มีใครรู้ตัว เพราะตัวเลขที่ได้ก็ดูสมเหตุสมผลทุกประการ

     🔴 ทำไมต้องทีละบิล ไม่ใช่ยอดรวมต่อบัตร:
        ธนาคารแปลงค่าเงิน "ทีละรายการ" ตามวันที่รูดจริง ไม่ใช่เรทเดียวทั้งบิล
        ถ้ากรอกยอดรวมแล้วเฉลี่ยเรทให้ทุกบิล ยอดรวมจะถูกก็จริง แต่ยอดราย
        "หมวด" กับราย "คน" จะเพี้ยน — ค่าอาหารที่รูดวันเรทแย่กับค่าโรงแรม
        ที่รูดวันเรทดีจะถูกปรับให้เท่ากัน ซึ่งไม่ตรงกับความจริงทั้งคู่

     ⚠️ ไม่คิดเป็นกำไร/ขาดทุนอัตราแลกเปลี่ยน เพราะเราไม่เคยถือเงินสกุลนั้น
        ส่วนต่างจากเรทประมาณการเป็นแค่ "การประมาณที่คลาดเคลื่อน" ไม่ใช่ผลกำไร */
  const creditWalletIds = new Set(data.wallets.filter(w => w.kind === 'CREDIT').map(w => w.wallet_id));
  const creditBills = data.expenses.filter(e => creditWalletIds.has(e.wallet_id));

  /* ยอดที่ส่งมาครั้งนี้มาก่อน แล้วค่อยถอยไปใช้ค่าที่เคยบันทึกไว้ในบิล
     (เปิดทริปกลับมาปิดใหม่จะได้ไม่ต้องกรอกซ้ำทั้งหมด) */
  const sentSettlements = new Map(
    (Array.isArray(body.settlements) ? body.settlements : [])
      .map(row => [String(row.expense_id || row.trip_expense_id || ''), Number(row.settled_thb)]));
  const settledOf = expense => {
    const sent = sentSettlements.get(expense.trip_expense_id);
    return Number.isFinite(sent) && sent > 0 ? round2(sent)
      : (Number(expense.settled_thb) > 0 ? round2(expense.settled_thb) : null);
  };

  const billsMissing = creditBills.filter(e => settledOf(e) === null);
  if (billsMissing.length) {
    const rateFor = expense => {
      const wallet = data.wallets.find(w => w.wallet_id === expense.wallet_id);
      return rateOf(expense.currency_code, wallet).rate;
    };
    return json({
      error: `บิลที่จ่ายด้วยบัตรเครดิตต้องกรอกยอดเงินบาทที่ถูกเรียกเก็บจริงก่อนปิดทริป (ยังขาด ${billsMissing.length} รายการ)`,
      needs_settlement: billsMissing.map(e => ({
        expense_id: e.trip_expense_id,
        wallet_id: e.wallet_id,
        wallet_name: data.wallets.find(w => w.wallet_id === e.wallet_id)?.name || '',
        date: e.expense_date, note: e.note || '',
        currency: e.currency_code, amount_foreign: e.amount_foreign || 0,
        estimated_thb: round2((e.amount_foreign || 0) * (rateFor(e) || 0))
      }))
    }, corsHeaders, 400);
  }

  // ยอดจริงรายบิล — ใช้แทนการคูณเรทตอนลงบัญชี
  const billSettled = new Map(creditBills.map(e => [e.trip_expense_id, settledOf(e)]));

  const creditStates = walletState.filter(s => s.wallet.kind === 'CREDIT' && s.spent > EPSILON);
  creditStates.forEach(state => {
    const own = creditBills.filter(e => e.wallet_id === state.wallet.wallet_id);
    state.settledThb = round2(own.reduce((sum, e) => sum + billSettled.get(e.trip_expense_id), 0));
    // เรทเฉลี่ยของกระเป๋าใบนี้ — ใช้เฉพาะแสดงผล ไม่ได้ใช้คิดยอดลงบัญชี
    state.rate = state.spent ? state.settledThb / state.spent : state.rate;
  });

  /* ⚠️ บัตรเครดิตไม่มี "เงินเหลือ" ให้จัดการ — ไม่เคยเติมเงินเข้าไปตั้งแต่แรก
     ตัวเลข leftover ของมันจึงติดลบเท่ากับที่ใช้ไป ซึ่งไม่ใช่หนี้สินที่ต้องจัดการ
     ตอนปิด (บิลบัตรจะถูกเรียกเก็บจากบัญชีอยู่แล้ว) ต้องกันออกจากด่านนี้ */
  const needsLine = walletState.filter(s =>
    s.wallet.kind !== 'CREDIT' && Math.abs(s.leftover) > EPSILON);
  const missing = needsLine
    .filter(s => !lines.some(l => l.wallet_id === s.wallet.wallet_id))
    .map(s => s.wallet.name);
  // ไม่ยอมให้ปิดทั้งที่ยังมีเงินเหลือค้างไม่ได้บอกว่าจะเอาไปไหน
  // ถ้าปล่อยผ่าน เงินก้อนนั้นจะหายจากบัญชีเงียบ ๆ
  if (missing.length) {
    return json({ error: `ยังไม่ได้ระบุว่าจะจัดการเงินเหลือในกระเป๋าอย่างไร: ${missing.join(' · ')}` }, corsHeaders, 400);
  }
  // บัตรเครดิตได้เรทจริงจากยอดที่กรอกไปแล้วข้างบน จึงไม่ติดด่านนี้
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
    /* บัตรเครดิตไม่มี "เงินเหลือ" ให้จัดการ — บรรทัดของมันมีไว้ส่ง settled_thb
       อย่างเดียว จึงข้ามด่าน disposition ไป (จัดการไว้ข้างบนแล้ว) */
    if (state.wallet.kind === 'CREDIT') continue;
    const disposition = String(line.disposition || '').toUpperCase();
    const thbCost = round2(state.leftover * state.rate);

    if (disposition === 'RETURN') {
      // แลกกลับเป็นบาทจริง = รับรู้กำไรขาดทุนตรงนี้
      const receivedThb = round2(line.received_thb);
      if (!(receivedThb >= 0)) return json({ error: 'ต้องระบุยอดบาทที่ได้รับกลับมาจริง' }, corsHeaders, 400);
      const fx = round2(receivedThb - thbCost);
      fxResult = round2(fxResult + fx);
      /* ...line พา fx_account_id / fx_category_id ที่หน้าจอส่งมาต่อไปด้วย
         แต่ละกระเป๋าเลือกบัญชีของตัวเองได้ (ห้ามรวมข้ามกระเป๋า) */
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
      // บัตรเครดิตใช้ "ยอดบาทจริงรายบิล" ไม่ใช่คูณเรท (ดูเหตุผลที่ closeTrip)
      billSettled,
      postingDate,
      note: `ปิดทริป ${ctx.trip.name}`
    });
    if (posting.error) return json({ error: posting.error, unmapped: posting.unmapped }, corsHeaders, posting.status);
  }

  /* กำไร/ขาดทุนค่าเงินลงเป็น Transaction คนละใบ พร้อมบัญชีของตัวเอง
     ⚠️ ทำเฉพาะเมื่อกำลังลงบัญชีจริงเท่านั้น — ถ้าไม่ได้ระบุ account_id
        แปลว่าปิดแบบไม่แตะสมุดบัญชี ก็ไม่ควรไปสร้างรายการ FX ค้างไว้ */
  let fxPosting = null;
  if (body.account_id) {
    /* หนึ่งกระเป๋าที่มีผลต่าง = หนึ่งรายการในสมุดบัญชี
       บัญชีตั้งต้นคือบัญชีที่ผูกไว้กับกระเป๋าใบนั้น (เงินคืนกลับไปที่เดิม)
       แต่แก้ได้ตอนปิด เผื่อแลกคืนเข้าบัญชีอื่น */
    const entries = closureLines
      .filter(line => Math.abs(line.fx || 0) > 0.005)
      .map(line => {
        const wallet = data.wallets.find(w => w.wallet_id === line.wallet_id);
        return {
          walletId: line.wallet_id,
          walletName: wallet?.name || line.wallet_id,
          amount: round2(line.fx),
          accountId: line.fx_account_id || wallet?.account_id || null,
          categoryId: line.fx_category_id || body.fx_category_id || null
        };
      });
    try {
      fxPosting = await buildFxPostings(env, ctx, projectId, {
        entries, postingDate, note: `ปิดทริป ${ctx.trip.name}`
      });
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, corsHeaders, error.status);
      throw error;
    }
  }

  const statements = [
    env.DB.prepare(`
      INSERT INTO TripClosures (closure_id, project_id, entry_type, posting_date, ledger_total,
        trip_only_total, fx_result, carried_thb, reverses_id, reason, performed_by, linked_transaction_id)
      VALUES (?,?,'CLOSE',?,?,?,?,?,NULL,?,?,?)
    `).bind(closureId, projectId, postingDate, ledgerTotal, tripOnlyTotal, fxResult, carriedThb,
            body.reason || null, ctx.viewer.member_id, posting?.txId || null),
    ...(posting?.statements || []),
    ...(fxPosting?.statements || []),
    env.DB.prepare(`UPDATE Projects SET status='closed', closed_at=CURRENT_TIMESTAMP, posting_date=? WHERE project_id=?`)
      .bind(postingDate, projectId)
  ];

  /* บัตรเครดิตมักไม่มี "เงินเหลือ" จึงไม่เข้ารายการ lines ปกติ
     แต่ยอดที่ถูกเรียกเก็บจริงต้องถูกบันทึกไว้ ไม่งั้นตรวจย้อนไม่ได้ว่า
     เรทที่ใช้ตอนปิดมาจากไหน — เติมบรรทัดให้เองถ้ายังไม่มี */
  creditStates.forEach(state => {
    if (closureLines.some(line => line.wallet_id === state.wallet.wallet_id)) return;
    closureLines.push({
      wallet_id: state.wallet.wallet_id, disposition: 'SETTLED',
      thbCost: state.settledThb, receivedThb: null, fx: 0
    });
  });

  /* เก็บยอดจริงรายบิลไว้กับตัวบิลเอง — เปิดทริปกลับมาปิดใหม่จะได้ไม่ต้องกรอกซ้ำ
     และเป็นหลักฐานว่าเรทของบิลใบนั้นมาจากยอดที่ธนาคารเรียกเก็บจริง */
  billSettled.forEach((value, expenseId) => {
    statements.push(env.DB.prepare(
      `UPDATE TripExpenses SET settled_thb=? WHERE trip_expense_id=? AND project_id=?`
    ).bind(value, expenseId, projectId));
  });

  closureLines.forEach((line, i) => {
    statements.push(env.DB.prepare(`
      INSERT INTO TripClosureLines (line_id, closure_id, wallet_id, disposition, leftover_foreign,
        thb_cost, received_thb, fx_amount, carry_currency, carry_amount, settled_thb)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(`${closureId}-L${i}`, closureId, line.wallet_id, line.disposition,
            walletState.find(s => s.wallet.wallet_id === line.wallet_id).leftover,
            line.thbCost, line.receivedThb, line.fx,
            line.carry_currency || null, line.carry_amount ?? null,
            // ยอดบาทจริงของบัตรเครดิต — เก็บไว้ตรวจย้อนได้ว่าเรทจริงมาจากไหน
            walletState.find(s => s.wallet.wallet_id === line.wallet_id).settledThb ?? null));
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

  const sub = url.pathname.replace('/api/unified-trip', '').replace(/\/$/, '');

  // เสิร์ฟไฟล์ไอคอนต้องอยู่ *ก่อน* ด่านล็อกอิน — <img src> แนบ Authorization
  // header ไม่ได้ คีย์เป็น UUID เดายากและเป็นแค่ไอคอนตกแต่ง ไม่ใช่ข้อมูลอ่อนไหว
  if (sub.startsWith('/icon/') && request.method === 'GET') {
    return serveIcon(env, sub.slice('/icon/'.length), corsHeaders);
  }

  /* ── ทางเข้าของผู้ร่วมทริป (ไม่ใช่สมาชิกครอบครัว) ──────────────────
     สองเส้นทางนี้ต้องอยู่ก่อนด่านล็อกอิน เพราะคนที่ยังไม่มี token ต้องเรียกได้
     listLoginMembers คืนแค่ชื่อกับ id — ห้ามเพิ่มข้อมูลอื่นเข้าไปเด็ดขาด */
  if (sub === '/members/login' && request.method === 'GET') {
    return listLoginMembers(env, url.searchParams.get('projectId'), corsHeaders);
  }
  if (sub === '/members/login' && request.method === 'POST') {
    return memberLogin(request, env, url, corsHeaders);
  }

  /* ผู้ร่วมทริปที่ล็อกอินแล้วถือ token คนละชนิดกับสมาชิกครอบครัว
     ตรวจตรงนี้เมื่อไม่มี userId เท่านั้น — สมาชิกครอบครัวมาก่อนเสมอ */
  let guest = null;
  if (!userId) {
    const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    guest = await resolveMemberSession(env, bearer);
  }

  if (!userId && !guest) return json({ error: 'ยังไม่ได้ล็อกอิน หรือ token หมดอายุ' }, corsHeaders, 401);

  // เส้นทางเหล่านี้ผูกกับ "ครอบครัว" ไม่ใช่ทริปใดทริปหนึ่ง — ไม่ต้องมี projectId ต้องเช็คก่อนด่านข้างล่าง
  if (sub === '/trips' && request.method === 'GET') return listTrips(env, userId, corsHeaders);
  if (sub === '/trips' && request.method === 'POST') return createTrip(request, env, userId, corsHeaders);
  if (sub === '/category-icons' && request.method === 'GET') return listCategoryIcons(env, userId, corsHeaders);
  if (sub === '/category-icons' && request.method === 'POST') return saveCategoryIcon(request, env, userId, corsHeaders);
  if (sub === '/icon-upload' && request.method === 'POST') return uploadIconRoute(request, env, userId, corsHeaders);
  if (sub === '/icon-upload' && request.method === 'GET') return listUploadedIcons(env, userId, corsHeaders);
  if (sub === '/family-users' && request.method === 'GET') return listFamilyUsers(env, userId, corsHeaders);
  if (sub === '/family-accounts' && request.method === 'GET') return listFamilyAccounts(env, userId, corsHeaders);
  if (sub === '/icon-upload' && request.method === 'DELETE') {
    return deleteUploadedIcon(env, userId, url.searchParams.get('key') || '', corsHeaders);
  }

  const projectId = url.searchParams.get('projectId');
  if (!projectId) return json({ error: 'ต้องระบุ projectId' }, corsHeaders, 400);

  /* ── บริบทของผู้ร่วมทริป ────────────────────────────────────────────
     ผู้ร่วมทริปไม่มีแถวใน Users จึงสร้าง ctx เองแทนการเรียก loadContext
     token ผูกกับทริปเดียวเสมอ — เข้าทริปอื่นด้วย token นี้ไม่ได้ */
  let ctx;
  if (guest) {
    if (guest.project_id !== projectId) {
      return json({ error: 'รหัสนี้ใช้กับทริปนี้ไม่ได้' }, corsHeaders, 403);
    }
    const trip = await env.DB.prepare(`SELECT * FROM Projects WHERE project_id=?`).bind(projectId).first();
    const viewer = await env.DB.prepare(`SELECT * FROM TripMembers WHERE member_id=? AND project_id=?`)
      .bind(guest.member_id, projectId).first();
    if (!trip || !viewer) return json({ error: 'ไม่พบทริปนี้ หรือไม่มีสิทธิ์เข้าถึง' }, corsHeaders, 404);
    /* is_admin ถูกบังคับเป็น false เสมอ แม้สมาชิกคนนั้นจะเป็น admin ของทริป
       เพราะเข้ามาทางรหัสผู้ร่วมทริป ไม่ใช่การล็อกอินบัญชีจริง — สิทธิ์ผู้ดูแล
       ต้องมาพร้อมการยืนยันตัวตนที่แข็งแรงกว่านี้ */
    ctx = { trip, viewer: { ...viewer, is_admin: 0 }, familyAdmin: false, guest: true,
            closed: trip.status === 'closed' || Boolean(trip.closed_at) };
  } else {
    ctx = await loadContext(env, userId, projectId);
  }
  if (!ctx) return json({ error: 'ไม่พบทริปนี้ หรือไม่มีสิทธิ์เข้าถึง' }, corsHeaders, 404);
  const { trip } = ctx;

  /* ⚠️ ด่านของผู้ร่วมทริป — ปฏิเสธทุกอย่างที่ไม่ได้อยู่ในรายการนี้
     เขียนเป็น allow-list โดยตั้งใจ: endpoint ใหม่ที่เพิ่มวันหลังจะถูกห้าม
     โดยอัตโนมัติ ต้องมาแก้ตรงนี้ถึงจะเปิดให้ ซึ่งบังคับให้คิดเรื่องสิทธิ์ทุกครั้ง
     ถ้าเขียนเป็น deny-list จะมีวันที่ลืมแล้วเปิดช่องโดยไม่รู้ตัว

     ตอนนี้อนุญาตแค่บิล เพราะข้อตกลงคือ "จดค่าใช้จ่ายของตัวเองได้"
     (ตัว writeExpense/deleteExpense ตรวจอีกชั้นว่าเป็นบิลของตัวเองจริง) */
  if (ctx.guest && request.method !== 'GET') {
    const GUEST_WRITABLE = ['/expenses', '/presence'];
    if (!GUEST_WRITABLE.includes(sub)) {
      return json({ error: 'ผู้ร่วมทริปทำรายการนี้ไม่ได้ · ต้องให้ผู้ดูแลทริปเป็นคนทำ' }, corsHeaders, 403);
    }
  }

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
    if (sub === '/days' && request.method === 'POST') return writeDayPlan(request, env, ctx, projectId, corsHeaders);
    /* รายการค่าใช้จ่ายย่อย — อยู่ก่อนด่านทริปปิดเช่นกัน เพราะเป็นแค่ชื่อกับไอคอน
       ไม่ใช่ตัวเลขบัญชี · แก้ชื่อ/ไอคอนย้อนหลังหลังปิดทริปได้เหมือนแผนเที่ยว */
    if (sub === '/presets' && request.method === 'POST') return writePreset(request, env, ctx, projectId, corsHeaders);
    if (sub === '/presets' && request.method === 'DELETE') {
      return deletePreset(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/presets/copy' && request.method === 'POST') return copyPresets(request, env, ctx, projectId, corsHeaders);
    // ตั้ง/ล้างรหัสผู้ร่วมทริป — ผู้ดูแลเท่านั้น (ตรวจในตัว handler อีกชั้น)
    if (sub === '/members/passcode' && request.method === 'POST') {
      return setMemberPasscode(request, env, ctx, projectId, corsHeaders);
    }
    // เพิ่ม/แก้/ลบสมาชิกในทริป — ผู้ดูแลเท่านั้น (ตรวจในตัว handler อีกชั้น)
    if (sub === '/members' && request.method === 'POST') return writeMember(request, env, ctx, projectId, corsHeaders);
    if (sub === '/members' && request.method === 'DELETE') {
      return deleteMember(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    /* เอกสารก็อยู่ก่อนด่านทริปปิดเหมือนแผนเที่ยว — ใบจองย้อนหลังยังต้องเปิดดู
       และเพิ่มได้แม้ปิดทริปแล้ว (เช่นเพิ่งได้ใบเสร็จจากโรงแรมทีหลัง) */
    if (sub === '/documents' && request.method === 'POST') return writeDocument(request, env, ctx, projectId, corsHeaders);
    if (sub === '/documents' && request.method === 'DELETE') {
      return deleteDocument(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    // เช็กอินได้แม้ทริปปิดแล้ว เพราะเป็นความทรงจำ ไม่กระทบตัวเลขบัญชี
    if (sub === '/presence' && request.method === 'POST') return writePresence(request, env, ctx, projectId, corsHeaders);
    // ปิดทริปแล้ว = ตัวเลขถูกรายงานเข้าบัญชีไปแล้ว ห้ามขยับ
    if (ctx.closed) {
      return json({ error: 'ทริปนี้ปิดแล้ว · แก้ข้อมูลการเงินไม่ได้ ต้องเปิดทริปกลับก่อน' }, corsHeaders, 409);
    }
    if (sub === '/currencies' && request.method === 'POST') return writeCurrency(request, env, ctx, projectId, corsHeaders);
    if (sub === '/currencies' && request.method === 'DELETE') {
      return deleteCurrency(env, ctx, projectId, String(url.searchParams.get('code') || '').toUpperCase(), corsHeaders);
    }
    if (sub === '/wallets' && request.method === 'POST') return writeWallet(request, env, ctx, projectId, corsHeaders);
    if (sub === '/wallets' && request.method === 'DELETE') {
      return deleteWallet(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/fundings' && request.method === 'POST') return writeFunding(request, env, ctx, projectId, corsHeaders);
    if (sub === '/fundings' && request.method === 'DELETE') {
      return deleteFunding(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/expenses' && request.method === 'POST') return writeExpense(request, env, ctx, projectId, corsHeaders);
    if (sub === '/expenses/reorder' && request.method === 'POST') return reorderExpenses(request, env, ctx, projectId, corsHeaders);
    if (sub === '/activity/reorder' && request.method === 'POST') return reorderActivity(request, env, ctx, projectId, corsHeaders);
    if (sub === '/expenses' && request.method === 'DELETE') {
      return deleteExpense(env, ctx, projectId, url.searchParams.get('id') || '', corsHeaders);
    }
    if (sub === '/closures' && request.method === 'POST') return closeTrip(request, env, ctx, projectId, corsHeaders);
    return json({ error: `ยังไม่รองรับ ${request.method} ${sub || '/'} ในเฟสนี้` }, corsHeaders, 405);
  }

  /* พยากรณ์อากาศเป็น GET แยก ไม่รวมมากับ payload หลัก เพราะต้องยิงไปบริการ
     ภายนอก ถ้ารวมไว้ทุกครั้งที่โหลดทริป หน้าจะช้าลงทุกครั้งเพื่อข้อมูลที่คนดู
     แค่บางที และถ้าบริการนั้นช้า ทั้งหน้าจะค้างตาม */
  if (sub === '/weather') {
    return tripWeather(env, projectId, url.searchParams.get('date') || '', corsHeaders,
      url.searchParams.get('stopId') || '');
  }

  /* เติมพิกัดให้จุดแวะที่ยังไม่มี — หน้าแผนที่เรียกอันนี้ก่อนวาดหมุด
     เดิมพิกัดถูกเติมเฉพาะจุดแรกของวันตอนดูอากาศ แผนที่จึงมีหมุดแค่ไม่กี่จุด
     เป็น GET เพราะไม่เปลี่ยนความหมายของข้อมูล แค่เติมพิกัดที่ค้นเจอ —
     ผู้ร่วมทริป (guest) จึงเรียกได้ ไม่ต้องรอผู้ดูแล */
  /* ระยะ/เวลาขับระหว่างจุด — GET เพราะไม่เปลี่ยนความหมายของแผน แค่เติมค่าที่คำนวณได้
     ผู้ร่วมทริปจึงเรียกได้เอง ไม่ต้องรอผู้ดูแล (เหมือน /geocode-stops) */
  if (sub === '/route') {
    return tripRoute(env, projectId, corsHeaders);
  }

  if (sub === '/geocode-stops') {
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    return geocodeTripStops(env, projectId, offset, corsHeaders);
  }

  const [members, currencies, wallets, fundings, expenses, categories, participants, closures, closureLines, presence, stops, dayPlans, ledgerCategories, presets, documents] =
    await Promise.all([
      /* has_passcode แทนการส่ง passcode_hash ออกไป — หน้าจอต้องรู้แค่ว่า
       "ตั้งรหัสแล้วหรือยัง" ไม่ควรได้เห็นค่า hash เลยแม้จะแฮชแล้วก็ตาม */
    env.DB.prepare(`
      SELECT member_id, project_id, user_id, display_name, role, ledger_mode, is_admin,
             avatar_color, created_at, avatar_url, managed_by,
             CASE WHEN passcode_hash IS NOT NULL AND passcode_hash != '' THEN 1 ELSE 0 END AS has_passcode
        FROM TripMembers WHERE project_id=? ORDER BY is_admin DESC, display_name
    `).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripCurrencies WHERE project_id=? ORDER BY is_base DESC, code`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripWallets WHERE project_id=?`).bind(projectId).all(),
      /* ใหม่ → เก่า เสมอ · เรียงตามวันที่ "ที่เกิดขึ้นจริง" ไม่ใช่ลำดับที่บันทึก
         คนมักลืมจดแล้วมาบันทึกย้อนหลังทีหลัง ถ้าเรียงตามลำดับบันทึก
         ล็อตของวันที่ 2 ธ.ค. จะไปโผล่ล่างสุดทั้งที่เกิดก่อน — อ่านแล้วสับสน
         funding_id มี timestamp อยู่ในตัว ใช้ตัดสินเมื่อวันที่ชนกัน */
      env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=?
                       ORDER BY funding_date DESC, COALESCE(sort_order, 999999) ASC, funding_id DESC`)
        .bind(projectId).all(),
      /* ⚠️ บิลที่ยังไม่เคยถูกจัดลำดับมี sort_order = NULL ซึ่งใน SQLite เรียงมาก่อนทุกค่า
         ใช้ COALESCE ดันไปท้ายสุด ไม่งั้นบิลใหม่จะแทรกขึ้นหัวรายการของวันนั้นเสมอ */
      env.DB.prepare(`SELECT * FROM TripExpenses WHERE project_id=?
        ORDER BY expense_date DESC, COALESCE(sort_order, 999999) ASC, created_at DESC`).bind(projectId).all(),
      env.DB.prepare(`SELECT c.* FROM TripExpenseCategories c
                      JOIN TripExpenses e ON e.trip_expense_id=c.trip_expense_id WHERE e.project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT pa.* FROM TripExpenseParticipants pa
                      JOIN TripExpenses e ON e.trip_expense_id=pa.trip_expense_id WHERE e.project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripClosures WHERE project_id=? ORDER BY created_at`).bind(projectId).all(),
      env.DB.prepare(`SELECT l.* FROM TripClosureLines l
                      JOIN TripClosures c ON c.closure_id=l.closure_id WHERE c.project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripPresence WHERE project_id=?`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripStops WHERE project_id=? ORDER BY stop_date, time`).bind(projectId).all(),
      env.DB.prepare(`SELECT * FROM TripDayPlans WHERE project_id=? ORDER BY plan_date`).bind(projectId).all(),
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
      `).bind(trip.family_id).all(),
      /* รายการค่าใช้จ่ายย่อยของทริปนี้ พร้อมชื่อหมวดบัญชีที่ผูกไว้ — หน้าจอจะได้
         โชว์ได้เลยว่าปุ่มนี้ลงบัญชีหมวดไหน โดยไม่ต้องไปจับคู่เองอีกรอบ */
      env.DB.prepare(`
        SELECT p.*, c.name AS category_name
          FROM TripExpensePresets p
          LEFT JOIN Categories c ON c.category_id = p.category_id
         WHERE p.project_id = ?
         ORDER BY p.sort_order, p.created_at
      `).bind(projectId).all(),
      /* เอกสารพร้อมชื่อสถานที่ที่ผูกไว้ — หน้าจอจะได้จัดกลุ่มตามชื่อสถานที่
         ได้เลยโดยไม่ต้องไปจับคู่กับรายการจุดแวะเองอีกรอบ */
      /* ⚠️ ตารางนี้เป็นของเดิมที่แอปหลักใช้ร่วม — ชื่อคอลัมน์จึงไม่ตรงกับที่
         หน้าทริปอยากได้ แปลงชื่อตรงนี้ทีเดียว (document_id→doc_id ฯลฯ)
         เพื่อให้ฝั่งหน้าจอไม่ต้องรู้เรื่องประวัติของตาราง
         related_entity_id เก็บได้ทั้ง stop_id และ trip_expense_id — join กับ
         TripStops จึงคืน stop_name เฉพาะอันที่เป็นจุดแวะจริงเท่านั้น */
      env.DB.prepare(`
        SELECT d.document_id AS doc_id, d.project_id, d.related_entity_id AS stop_id,
               d.description AS name, d.file_url AS url,
               COALESCE(d.kind, 'link') AS kind, d.content_type, d.size_bytes, d.created_at,
               COALESCE(s.name_th, s.name_en, s.city) AS stop_name
          FROM TripDocuments d
          LEFT JOIN TripStops s ON s.stop_id = d.related_entity_id
         WHERE d.project_id = ?
         ORDER BY d.created_at
      `).bind(projectId).all()
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
  /* ⚠️ ชื่อและไอคอนของบรรทัดหมวดอ่านสดจาก preset ปัจจุบันเสมอ ไม่ใช่ค่าที่
     ก๊อปไว้ตอนสร้างบิล — นี่คือเหตุผลทั้งหมดที่บิลเก็บ preset_id ไว้:
     แก้ชื่อ/ไอคอนของรายการย่อยทีเดียว บิลเก่าทุกใบในทริปเปลี่ยนตามทันที
     บิลที่ไม่ได้ผูก preset (ของเก่า/ลบ preset ไปแล้ว) ใช้ label ที่เก็บไว้ตามเดิม */
  const presetRows = presets.results || [];
  const presetById = id => presetRows.find(row => row.preset_id === id);
  const catsByExpense = {};
  (categories.results || []).forEach(row => {
    const preset = row.preset_id ? presetById(row.preset_id) : null;
    (catsByExpense[row.trip_expense_id] ||= []).push(preset
      ? { ...row, label: preset.label, icon_url: preset.icon_url, category_id: preset.category_id }
      : row);
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
    day_plans: dayPlans.results || [],
    presets: presetRows,
    documents: documents.results || [],
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
      // สิทธิ์จัดการข้อมูลทริป (แก้ชื่อ/วันที่/ประเภท/ลบ) — รวมผู้ดูแลระบบครอบครัว
      // ที่ไม่ได้เป็นสมาชิกทริปด้วย หน้าจอใช้ตัวนี้ตัดสินปุ่ม ไม่ต้องเดาเอง
      can_manage_trip: Boolean(viewer?.is_admin) || ctx.familyAdmin,
      /* เข้ามาด้วยรหัสผู้ร่วมทริปหรือไม่ — หน้าจอใช้ซ่อนปุ่มที่กดไปก็โดนปฏิเสธ
         (เซิร์ฟเวอร์กันไว้อยู่แล้ว ตัวนี้แค่ทำให้จอไม่หลอกตา) */
      is_guest: Boolean(ctx.guest),
      hidden_expense_count: (expenses.results || []).length - visibleExpenses.length
    }
  }, corsHeaders);
}
