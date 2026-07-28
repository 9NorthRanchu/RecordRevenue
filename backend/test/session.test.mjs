/* ═══════════════════════════════════════════════════════════════════════
   ทดสอบ session token — ตัวที่มาแทนการเชื่อ header x-user-id ตรง ๆ

     node backend/test/session.test.mjs

   sqlite ในหน่วยความจำ + Web Crypto ของ Node (API เดียวกับ Workers)
   ไม่แตะฐานจริง
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

globalThis.btoa ??= b => Buffer.from(b, 'binary').toString('base64');
globalThis.atob ??= b => Buffer.from(b, 'base64').toString('binary');

const source = readFileSync(new URL('../src/session.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
const { createSession, revokeSession, resolveUserId, bearerFrom, purgeExpiredSessions } = mod;

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE Users (user_id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL);
INSERT INTO Users VALUES ('9North','North'), ('uPuii','Puii');
`);
const env = {
  DB: {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async run() { return { meta: db.prepare(sql).run(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; }
      };
    }
  }
};

const req = headers => new Request('https://x/api/anything', { headers });

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
};

console.log('\n── ออก token ───────────────────────────────────');
const { token, expiresAt } = await createSession(env, '9North');
check('ได้ token กลับมา', typeof token === 'string' && token.length >= 40, String(token).slice(0, 12));
check('มีวันหมดอายุ', Boolean(Date.parse(expiresAt)));
check('หมดอายุในอนาคต', Date.parse(expiresAt) > Date.now());

const storedRows = db.prepare(`SELECT * FROM Sessions`).all();
check('เก็บลงฐานหนึ่งแถว', storedRows.length === 1);
check('⚠️ ฐานไม่ได้เก็บตัว token — เก็บแค่ hash',
  storedRows[0].token_hash !== token && !JSON.stringify(storedRows[0]).includes(token));

const second = await createSession(env, '9North');
check('ออกซ้ำได้คนละ token (คนละอุปกรณ์)', second.token !== token);
check('ทั้งสองอันอยู่ในฐาน', db.prepare(`SELECT COUNT(*) n FROM Sessions`).get().n === 2);

console.log('\n── ตรวจตัวตนจาก token ──────────────────────────');
check('token ถูก → ได้ user_id',
  await resolveUserId(req({ Authorization: `Bearer ${token}` }), env) === '9North');
check('รองรับ bearer ตัวเล็ก',
  await resolveUserId(req({ Authorization: `bearer ${token}` }), env) === '9North');
check('token มั่ว → ไม่ได้ตัวตน',
  await resolveUserId(req({ Authorization: 'Bearer not-a-real-token' }), env) === '');
check('ไม่มี Bearer นำหน้า → ไม่นับเป็น token',
  bearerFrom(req({ Authorization: token })) === '');

console.log('\n── จุดที่พลาดง่ายที่สุด ─────────────────────────');
/* ถ้า token ใช้ไม่ได้แล้วยังตกไปอ่าน x-user-id ต่อ คนที่ถือ token หมดอายุ
   จะยังเข้าได้ด้วยการเดา user_id ซึ่งเท่ากับไม่ได้แก้อะไรเลย */
check('token ผิด + มี x-user-id มาด้วย → ต้องไม่ผ่าน',
  await resolveUserId(req({ Authorization: 'Bearer forged-token', 'x-user-id': '9North' }), env) === '',
  'token ที่ใช้ไม่ได้ต้องไม่ตกไปใช้ header ต่อ');

// token ของคนหนึ่ง ใส่ x-user-id เป็นอีกคน → ต้องได้เจ้าของ token
check('x-user-id ปลอมทับ token ไม่ได้',
  await resolveUserId(req({ Authorization: `Bearer ${token}`, 'x-user-id': 'uPuii' }), env) === '9North');

console.log('\n── หมดอายุ ─────────────────────────────────────');
const expired = await createSession(env, 'uPuii');
db.prepare(`UPDATE Sessions SET expires_at = datetime('now','-1 day') WHERE user_id='uPuii'`).run();
check('token หมดอายุใช้ไม่ได้',
  await resolveUserId(req({ Authorization: `Bearer ${expired.token}` }), env) === '');
await purgeExpiredSessions(env);
check('ลบ token ที่หมดอายุออกจากฐานได้',
  db.prepare(`SELECT COUNT(*) n FROM Sessions WHERE user_id='uPuii'`).get().n === 0);
check('แต่ไม่ไปลบของคนที่ยังใช้ได้',
  db.prepare(`SELECT COUNT(*) n FROM Sessions WHERE user_id='9North'`).get().n === 2);

console.log('\n── ออกจากระบบ ──────────────────────────────────');
await revokeSession(env, token);
check('token ที่ถูกยกเลิกใช้ไม่ได้อีก',
  await resolveUserId(req({ Authorization: `Bearer ${token}` }), env) === '');
check('แต่อุปกรณ์อื่นยังใช้ได้ ไม่ได้เตะออกทั้งหมด',
  await resolveUserId(req({ Authorization: `Bearer ${second.token}` }), env) === 'uPuii'
  || await resolveUserId(req({ Authorization: `Bearer ${second.token}` }), env) === '9North');
check('ยกเลิก token ว่างไม่พัง', (await revokeSession(env, '')) === false);

console.log('\n── ช่วงเปลี่ยนผ่าน ─────────────────────────────');
check('ALLOW_HEADER_FALLBACK ยังเปิดอยู่ (ตั้งใจ)', mod.ALLOW_HEADER_FALLBACK === true);
check('ไม่มี token → ยังใช้ x-user-id ได้ หน้าเว็บเก่าจึงไม่พัง',
  await resolveUserId(req({ 'x-user-id': '9North' }), env) === '9North');
check('ไม่มีอะไรเลย → ไม่ได้ตัวตน', await resolveUserId(req({}), env) === '');

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
