// ═══════════════════════════════════════════════════════════════════════════
// Session token — แทนการเชื่อ header `x-user-id` ตรง ๆ
//
// ⚠️ ปัญหาเดิม: ทุก endpoint อ่าน `x-user-id` แล้วเชื่อทันทีโดยไม่ตรวจอะไรเลย
//    ใครรู้ user_id ของคนในบ้านก็ curl อ่านข้อมูลการเงินทั้งครอบครัวได้
//    โดยไม่ต้องมีรหัสผ่าน — และแอปเปิดสาธารณะอยู่บน pages.dev
//
//    token ออกให้ตอนล็อกอินสำเร็จเท่านั้น ผูกกับ user_id และมีวันหมดอายุ
//    ในฐานเก็บเป็น SHA-256 ของ token ไม่ใช่ตัว token — ฐานหลุดก็สวมสิทธิ์ไม่ได้
//    (token สุ่ม 256 บิตอยู่แล้ว จึงไม่ต้อง PBKDF2 เหมือนรหัสผ่านที่คนตั้งเอง)
// ═══════════════════════════════════════════════════════════════════════════

/* 🔁 สวิตช์ช่วงเปลี่ยนผ่าน
   true  = ยังยอมรับ x-user-id แบบเดิมถ้าไม่มี token (หน้าเว็บเก่ายังใช้ได้)
   false = บังคับใช้ token เท่านั้น ← เปลี่ยนเป็น false หลังจากยืนยันว่า
           ทุกหน้าจอส่ง token แล้ว (ดูวิธีตรวจใน HANDOFF)
   ตราบใดที่ยังเป็น true ช่องโหว่เดิมยังเปิดอยู่ — นี่เป็นแค่ขั้นระหว่างทาง */
export const ALLOW_HEADER_FALLBACK = true;

const DAYS = 30;

const toB64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toB64Url(digest);
}

/* ออก token ใหม่ — เรียกหลังยืนยันรหัสผ่านผ่านแล้วเท่านั้น
   คืน token ตัวจริงกลับไปครั้งเดียว ฝั่งเซิร์ฟเวอร์เก็บแค่ hash */
export async function createSession(env, userId) {
  const token = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + DAYS * 86400_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO Sessions (token_hash, user_id, expires_at) VALUES (?,?,?)`
  ).bind(await sha256(token), userId, expires).run();
  return { token, expiresAt: expires };
}

export async function revokeSession(env, token) {
  if (!token) return false;
  await env.DB.prepare(`DELETE FROM Sessions WHERE token_hash = ?`)
    .bind(await sha256(token)).run();
  return true;
}

export const bearerFrom = request => {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

/**
 * หา user_id ของคำขอนี้
 *   1. Bearer token ที่ยังไม่หมดอายุ → เชื่อถือได้จริง
 *   2. ถ้าไม่มี token และยังเปิด fallback → ใช้ x-user-id แบบเดิม (ชั่วคราว)
 * คืน '' เมื่อระบุตัวตนไม่ได้ ให้ผู้เรียกตอบ 401 เอง
 */
export async function resolveUserId(request, env) {
  const token = bearerFrom(request);
  if (token) {
    const row = await env.DB.prepare(
      `SELECT user_id FROM Sessions
        WHERE token_hash = ? AND datetime(expires_at) > datetime('now')`
    ).bind(await sha256(token)).first();
    // token ที่ส่งมาแล้วใช้ไม่ได้ ต้องไม่ตกไปใช้ x-user-id ต่อ
    // ไม่งั้นคนที่ถือ token หมดอายุจะยังเข้าได้ด้วยการเดา user_id
    return row?.user_id || '';
  }
  if (!ALLOW_HEADER_FALLBACK) return '';
  return decodeURIComponent(request.headers.get('x-user-id') || '');
}

/* ลบ session ที่หมดอายุแล้ว — เรียกแบบไม่รอผลตอนล็อกอิน
   ปล่อยให้ล้มเหลวเงียบ ๆ ได้ เพราะไม่ใช่เงื่อนไขของการเข้าระบบ */
export async function purgeExpiredSessions(env) {
  try {
    await env.DB.prepare(
      `DELETE FROM Sessions WHERE datetime(expires_at) <= datetime('now')`
    ).run();
  } catch { /* ไม่เป็นไร ครั้งหน้าค่อยลบ */ }
}
