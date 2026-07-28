/* ═══════════════════════════════════════════════════════════════════════
   ทดสอบการ hash รหัสผ่านและเส้นทางอัปเกรดจากของเก่า

     node backend/test/auth.test.mjs

   ใช้ Web Crypto ของ Node ซึ่งเป็น API เดียวกับที่ Workers ใช้
   ไม่แตะฐานจริง ไม่ต้องต่อเน็ต
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// btoa/atob มีใน Workers แต่ต้องประกาศเองใน Node รุ่นเก่าบางตัว
globalThis.btoa ??= b => Buffer.from(b, 'binary').toString('base64');
globalThis.atob ??= b => Buffer.from(b, 'base64').toString('binary');

const source = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
const { hashPassword, verifyPassword, isHashed, upgradeStoredPassword } = await import(
  'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
};

console.log('\n── hash ────────────────────────────────────────');
const PLAIN = 'ร!hัสผ่าน$ยากๆ 123';
const hashed = await hashPassword(PLAIN);
check('ได้รูปแบบที่ระบุไว้', /^pbkdf2\$sha256\$\d+\$[^$]+\$[^$]+$/.test(hashed), hashed.slice(0, 30));
check('isHashed จับได้', isHashed(hashed));
check('ข้อความธรรมดาไม่ถูกมองว่า hash แล้ว', !isHashed(PLAIN));
check('ไม่มีรหัสจริงโผล่อยู่ในค่าที่เก็บ', !hashed.includes(PLAIN));

const again = await hashPassword(PLAIN);
check('รหัสเดียวกัน hash สองครั้งได้คนละค่า (salt สุ่มจริง)', hashed !== again);
check('แต่ทั้งคู่ตรวจผ่าน', (await verifyPassword(PLAIN, hashed)).ok && (await verifyPassword(PLAIN, again)).ok);

console.log('\n── ตรวจรหัส ────────────────────────────────────');
check('รหัสถูก → ผ่าน', (await verifyPassword(PLAIN, hashed)).ok);
check('รหัสผิด → ไม่ผ่าน', !(await verifyPassword('รหัสผิด', hashed)).ok);
check('รหัสว่าง → ไม่ผ่าน', !(await verifyPassword('', hashed)).ok);
check('ต่างแค่ตัวเดียว → ไม่ผ่าน', !(await verifyPassword(PLAIN + 'x', hashed)).ok);
check('ตัวพิมพ์เล็กใหญ่ต่างกัน → ไม่ผ่าน', !(await verifyPassword(PLAIN.toUpperCase(), hashed)).ok);
check('hash ที่ hash แล้วไม่ใช่รหัสที่ใช้เข้าได้', !(await verifyPassword(hashed, hashed)).ok);
check('ค่าที่เก็บพัง → ไม่ผ่าน แต่ไม่ throw', !(await verifyPassword(PLAIN, 'pbkdf2$sha256$xx$yy')).ok);
check('ค่าที่เก็บว่าง → ไม่ผ่าน', !(await verifyPassword(PLAIN, '')).ok);
check('ค่าที่เก็บเป็น null → ไม่ผ่าน', !(await verifyPassword(PLAIN, null)).ok);
check('รหัสที่ hash แล้วไม่ต้องอัปเกรดอีก', !(await verifyPassword(PLAIN, hashed)).needsUpgrade);

console.log('\n── รหัสเก่าแบบข้อความธรรมดา ────────────────────');
const LEGACY = 'oldPlainPassword!';
const legacyOk = await verifyPassword(LEGACY, LEGACY);
check('รหัสเก่ายังล็อกอินได้ ไม่มีใครถูกล็อกออก', legacyOk.ok);
check('และถูกทำเครื่องหมายว่าต้องอัปเกรด', legacyOk.needsUpgrade);
check('รหัสเก่าผิด → ไม่ผ่าน และไม่อัปเกรด', (await verifyPassword('ผิด', LEGACY)).ok === false
  && (await verifyPassword('ผิด', LEGACY)).needsUpgrade === false);

console.log('\n── อัปเกรดอัตโนมัติตอนล็อกอิน ──────────────────');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE Users (user_id TEXT PRIMARY KEY, password TEXT);
         INSERT INTO Users VALUES ('9North', '${LEGACY}');`);
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
const before = db.prepare(`SELECT password p FROM Users WHERE user_id='9North'`).get().p;
check('ก่อนอัปเกรด ฐานเก็บรหัสเป็นข้อความธรรมดาจริง ๆ', before === LEGACY);

await upgradeStoredPassword(env, '9North', LEGACY);
const after = db.prepare(`SELECT password p FROM Users WHERE user_id='9North'`).get().p;
check('หลังอัปเกรด กลายเป็น hash', isHashed(after));
check('อ่านรหัสเดิมจากฐานไม่ได้อีกแล้ว', !after.includes(LEGACY));
check('รหัสเดิมยังใช้ล็อกอินได้เหมือนเดิม', (await verifyPassword(LEGACY, after)).ok);
check('อัปเกรดแล้วไม่ต้องอัปเกรดซ้ำ', !(await verifyPassword(LEGACY, after)).needsUpgrade);
check('รหัสผิดยังเข้าไม่ได้', !(await verifyPassword('เดาเอา', after)).ok);

// ล้มเหลวต้องไม่ทำให้ล็อกอินพัง — คืน false เฉย ๆ
const brokenEnv = { DB: { prepare() { throw new Error('ฐานล่ม'); } } };
check('อัปเกรดล้มเหลวไม่ throw ออกมา', (await upgradeStoredPassword(brokenEnv, 'x', 'y')) === false);

console.log('\n── เวลาที่ใช้ (Worker มีเพดาน CPU) ─────────────');
const t0 = performance.now();
await verifyPassword(PLAIN, hashed);
const ms = performance.now() - t0;
console.log(`  ⏱️  ตรวจรหัสหนึ่งครั้งใช้ ${ms.toFixed(1)} ms`);
check('เร็วพอสำหรับหนึ่งคำขอ (< 500 ms)', ms < 500, `${ms.toFixed(1)} ms`);

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
