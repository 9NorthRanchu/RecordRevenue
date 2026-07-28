// ═══════════════════════════════════════════════════════════════════════════
// รหัสผ่าน — hash ด้วย PBKDF2-SHA256 ผ่าน Web Crypto (มีอยู่แล้วใน Workers)
//
//   รูปแบบที่เก็บ:  pbkdf2$sha256$<iterations>$<salt-base64>$<hash-base64>
//   salt สุ่มใหม่ทุกครั้ง 16 ไบต์ · ไม่มี dependency ภายนอก
//
// ⚠️ ทำไมไม่ migrate ทั้งตารางทีเดียว
//    รหัสที่เก็บเป็นข้อความธรรมดา "แปลงย้อนกลับเป็น hash ได้" ก็จริง แต่ถ้าทำ
//    พร้อมกันทั้งหมดแล้วมีอะไรผิด จะไม่มีใครล็อกอินได้เลยและกู้ไม่ได้ด้วย
//    (hash ย้อนกลับเป็นข้อความเดิมไม่ได้) จึงใช้วิธี "ยอมรับของเก่าต่อไป แล้ว
//    อัปเกรดทีละคนตอนล็อกอินสำเร็จ" ซึ่งไม่มีช่วงที่ใครเข้าไม่ได้เลย
//
// ⚠️ ทั้งไฟล์นี้ต้องไม่ log ค่ารหัสผ่านหรือ hash ออกไปไหนทั้งสิ้น
// ═══════════════════════════════════════════════════════════════════════════

const PREFIX = 'pbkdf2$sha256$';
/* 100,000 รอบ — ถ่วงระหว่างความปลอดภัยกับเวลา CPU ของ Worker
   ล็อกอินเกิดไม่บ่อย จึงยอมให้ช้าได้ระดับสิบ ๆ มิลลิวินาที
   เก็บจำนวนรอบไว้ในตัวสตริงด้วย จะได้เพิ่มรอบทีหลังโดยของเก่ายังใช้ได้ */
const ITERATIONS = 100_000;
const KEY_BITS = 256;

const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_BITS);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITERATIONS);
  return `${PREFIX}${ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
}

export const isHashed = stored => typeof stored === 'string' && stored.startsWith(PREFIX);

/* เทียบแบบเวลาคงที่ — ออกจากลูปทันทีที่เจอไบต์ต่างกันจะทำให้เดาทีละไบต์ได้
   จากการจับเวลาตอบกลับ ต้องวนให้ครบทุกไบต์เสมอ */
function equalConstantTime(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * ตรวจรหัสผ่าน รองรับทั้งของที่ hash แล้วและของเก่าที่ยังเป็นข้อความธรรมดา
 * @returns {{ok:boolean, needsUpgrade:boolean}}
 *   needsUpgrade = true เมื่อรหัสถูกต้องแต่ยังเก็บแบบเก่าอยู่ → ผู้เรียกควร
 *   เขียนทับด้วย hash ทันที (ดู upgradeStoredPassword)
 */
export async function verifyPassword(password, stored) {
  if (!password || typeof stored !== 'string' || !stored) {
    return { ok: false, needsUpgrade: false };
  }

  if (!isHashed(stored)) {
    // ของเก่า: เทียบข้อความตรง ๆ แต่ยังใช้การเทียบเวลาคงที่
    const encoder = new TextEncoder();
    const ok = equalConstantTime(encoder.encode(password), encoder.encode(stored));
    return { ok, needsUpgrade: ok };
  }

  const [, , iterationText, saltText, hashText] = stored.split('$');
  const iterations = Number(iterationText);
  if (!(iterations > 0) || !saltText || !hashText) return { ok: false, needsUpgrade: false };

  let bits;
  try {
    bits = await derive(password, fromB64(saltText), iterations);
  } catch {
    return { ok: false, needsUpgrade: false };
  }
  const ok = equalConstantTime(new Uint8Array(bits), fromB64(hashText));
  // ถ้าจำนวนรอบที่เก็บไว้น้อยกว่าค่าปัจจุบัน ถือว่าควรอัปเกรดด้วย
  return { ok, needsUpgrade: ok && iterations < ITERATIONS };
}

/* เขียนทับรหัสที่เก็บไว้ด้วย hash ใหม่ — เรียกหลังล็อกอินสำเร็จเท่านั้น
   ล้มเหลวไม่ทำให้ล็อกอินพัง เพราะการอัปเกรดเป็นงานเบื้องหลัง ไม่ใช่เงื่อนไข
   ของการเข้าระบบ · ครั้งหน้าที่ล็อกอินก็จะลองใหม่เอง */
export async function upgradeStoredPassword(env, userId, password) {
  try {
    const hashed = await hashPassword(password);
    await env.DB.prepare(`UPDATE Users SET password = ? WHERE user_id = ?`)
      .bind(hashed, userId).run();
    return true;
  } catch {
    return false;
  }
}
