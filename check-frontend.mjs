/* ── ด่านตรวจหน้าเว็บก่อน deploy (2026-08-23) ─────────────────────────
   รัน: node check-frontend.mjs   (deploy.sh เรียกให้เองก่อน deploy)

   🔴 ทำไมต้องมีไฟล์นี้
      `node --check` จับได้แค่ syntax ผิด แต่บั๊กที่ทำให้ทั้งหน้าตายจริง ๆ
      มักเป็นชนิด "เรียกของที่ไม่มีอยู่แล้ว" ซึ่ง syntax ถูกต้องทุกประการ

      เจอจริง 2026-08-23: ลบฟังก์ชัน renderMemberAccess() ทิ้ง แต่ลืมชื่อมัน
      ค้างอยู่ในลิสต์ที่วนเรียกตอนโหลดข้อมูลจริง → ทั้งแอปขึ้นแถบแดง
      "Can't find variable: renderMemberAccess" และเข้าใช้งานไม่ได้เลย
      ทั้งที่เทสฝั่งเซิร์ฟเวอร์ 674 เคสผ่านหมด และ node --check ก็ผ่าน

   ตรวจ 5 อย่าง — ทุกข้อคือบั๊กที่เคยเกิดจริงในโปรเจกต์นี้ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontend/trip-unified-prototype');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

let fail = 0;
const problem = (title, detail) => {
  fail += 1;
  console.log(`  ❌ ${title}`);
  if (detail) console.log(`     ${detail}`);
};
const ok = title => console.log(`  ✅ ${title}`);

const html = read('index.html');
const scripts = ['app.js', 'api.js', 'join.js', 'money.js', 'slice-engine.js'];

/* ── 1. ฟังก์ชันที่ถูกเรียกแต่ไม่มีการประกาศ ────────────────────────────
   ดูเฉพาะชื่อที่ขึ้นต้นด้วยคำนำหน้าที่โปรเจกต์นี้ใช้กับฟังก์ชันภายในไฟล์
   (render/paint/open/sync/load/apply/build) — พวกนี้ไม่เคยมาจากไลบรารีนอก
   จึงไม่มี false positive และเป็นกลุ่มที่ถูกลบทิ้งบ่อยที่สุด */
console.log('\n── ฟังก์ชันที่เรียกแต่ไม่มีการประกาศ ──────────');
for (const file of scripts) {
  const src = read(file);
  const declared = new Set([
    ...src.matchAll(/function\s+([A-Za-z_$][\w$]*)/g),
    ...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)
  ].map(m => m[1]));
  const called = new Set([...src.matchAll(/(?<![.\w$])((?:render|paint|open|sync|load|apply|build)[A-Z][\w$]*)\s*\(/g)]
    .map(m => m[1]));
  const missing = [...called].filter(name => !declared.has(name));
  if (missing.length) problem(`${file}: ${missing.join(' · ')}`, 'ลบฟังก์ชันแล้วลืมลบที่เรียก — หน้าจะตายทั้งหน้าตอนรัน');
  else ok(`${file} ครบ`);
}

/* ── 2. id ที่ JS เรียกแต่ไม่มีใน HTML ─────────────────────────────────
   $('#x') ที่หาไม่เจอจะคืน null แล้วบรรทัดถัดไปมักพังทันที */
console.log('\n── id ที่เรียกแต่ไม่มีใน index.html ──────────');
{
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  /* id ที่ JS สร้างเองระหว่างรัน จึงไม่มีใน HTML ตั้งต้น — ตั้งใจให้เป็นแบบนั้น */
  const dynamic = new Set(['addPlanDay', 'editDayTitle', 'weatherNow', 'weatherPeriods',
    'weatherPlace', 'weatherStamp', 'weatherTip', 'openWalletTotals', 'fxAccount', 'fxCategory']);
  const app = read('app.js');
  const used = new Set([...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
  const missing = [...used].filter(id => !ids.has(id) && !dynamic.has(id));
  if (missing.length) problem(missing.join(' · '), 'ถ้าเป็น id ที่สร้างระหว่างรัน ให้เติมใน dynamic ของไฟล์นี้');
  else ok('ครบทุก id');
}

/* ── 3. data-* ที่สร้างแต่ไม่มีใครอ่าน (และกลับกัน) ─────────────────────
   ปุ่มที่มี data-x แต่ไม่มี handler = ปุ่มที่กดแล้วไม่เกิดอะไร */
console.log('\n── data-* ที่สร้างแต่ไม่มีใครอ่าน ────────────');
{
  const all = html + read('app.js');
  const attrs = new Set([...all.matchAll(/data-([a-z][a-z0-9-]*)=/g)].map(m => m[1]));
  const camel = name => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const orphans = [...attrs].filter(name =>
    !all.includes(`dataset.${camel(name)}`) && !all.includes(`[data-${name}]`));
  if (orphans.length) problem(orphans.join(' · '), 'สร้าง data-* ไว้แต่ไม่มีโค้ดอ่าน = ปุ่มที่กดแล้วเงียบ');
  else ok('อ่านครบทุกตัว');
}

/* ── 3.5 คำอธิบายที่ชี้ไปยังปุ่มที่ไม่มีอยู่แล้ว ──────────────────────────
   🔴 ลบปุ่มทิ้งแล้วลืมแก้ข้อความที่ชี้ไปหามัน — คนอ่านจะนั่งหาปุ่มที่ไม่มี
      เจอจริง 2026-08-23: เอาปุ่ม 🔑 ออกจากแถวสมาชิก แต่คำอธิบายยังเขียนว่า
      "ตั้งรหัสรายคนได้ที่ปุ่ม 🔑 ในแถวของแต่ละคน" ค้างอยู่บนหน้าเว็บจริง
      เทสทุกตัวผ่านหมด เพราะไม่มีอะไรอ่านข้อความบรรยาย */
console.log('\n── คำอธิบายที่ชี้ไปยังปุ่มที่ไม่มีแล้ว ──────');
{
  const app = read('app.js');
  const all = html + app;
  /* อิโมจิที่ใช้เป็น "ชื่อปุ่ม" ในระบบนี้ — ถ้าข้อความพูดถึง แต่ไม่มีปุ่มไหนใช้เลย
     แปลว่าปุ่มถูกลบไปแล้วแต่ข้อความค้าง */
  const buttonEmoji = ['🔑', '✏️', '🗑️', '📋', '＋'];
  const notes = [...html.matchAll(/<(?:p|small)[^>]*class="[^"]*(?:field-note|field-hint)[^"]*"[^>]*>([\s\S]*?)<\//g)]
    .map(m => m[1]);
  const orphans = [];
  for (const emoji of buttonEmoji) {
    const mentioned = notes.some(note => note.includes(emoji));
    if (!mentioned) continue;
    /* ปุ่มจริงคือที่อยู่ใน <button> ของ HTML หรือในสตริงที่ app.js สร้าง <button> */
    const onButton = new RegExp(`<button[^>]*>[^<]*${emoji}`).test(all)
      || new RegExp(`${emoji}[^"'\`<]{0,20}</button>`).test(all);
    if (!onButton) orphans.push(emoji);
  }
  if (orphans.length) problem(`คำอธิบายพูดถึง ${orphans.join(' ')} แต่ไม่มีปุ่มนั้นแล้ว`,
    'ลบปุ่มแล้วต้องแก้ข้อความที่ชี้ไปหามันด้วย ไม่งั้นคนจะนั่งหาปุ่มที่ไม่มี');
  else ok('ข้อความชี้ไปยังปุ่มที่มีอยู่จริงทุกอัน');
}

/* ── 3.6 ข้อความที่จะไปทับปุ่ม ──────────────────────────────────────────
   🔴 `.field-note` มี margin-top ติดลบทั้งแอป (ตั้งไว้ให้ชิดใต้ช่องกรอก)
      พอไปอยู่ใต้ปุ่ม ค่าติดลบจะดันข้อความขึ้นไปทับขอบล่างของปุ่ม
      เจอจริงจากภาพหน้าจอ 2026-08-23 — ด่านอื่นจับไม่ได้เพราะ jsdom ไม่มี layout
      กันไว้ด้วยกฎ `button + .field-note` ซึ่งต้องมีอยู่เสมอ */
console.log('\n── ข้อความที่จะไปทับปุ่ม ────────────────────');
{
  const css = read('style.css');
  const negative = /\.field-note\{[^}]*margin:\s*-/.test(css);
  const guarded = /button\s*\+\s*\.field-note\s*\{[^}]*margin-top:\s*[1-9]/.test(css);
  if (negative && !guarded) {
    problem('.field-note มี margin ติดลบ แต่ไม่มีกฎกัน `button + .field-note`',
      'ข้อความใต้ปุ่มจะถูกดันขึ้นไปทับตัวปุ่ม');
  } else ok(negative ? 'มีกฎกันข้อความทับปุ่มแล้ว' : '.field-note ไม่มี margin ติดลบ');
}

/* ── 4. วงเล็บปีกกาใน CSS ───────────────────────────────────────────────
   แก้ CSS ด้วยสคริปต์แล้วปีกกาไม่ครบ = กฎท้ายไฟล์หายไปเงียบ ๆ ทั้งบล็อก */
console.log('\n── โครงสร้าง CSS ────────────────────────────');
for (const file of ['style.css', 'themes.css', 'trips.css']) {
  const css = read(file);
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  if (open !== close) problem(`${file}: เปิด ${open} ปิด ${close}`, 'ปีกกาไม่ครบ กฎท้ายไฟล์จะหายไปทั้งบล็อก');
  else ok(`${file} ปีกกาครบ (${open})`);
}

/* ── 5. เลข cache-bust ของไฟล์ที่ใช้ร่วมกันต้องตรงกันทั้ง 3 หน้า ────────
   🔴 Cloudflare Pages ไม่สนใจ query string แต่เบราว์เซอร์แคชแยกตาม URL
      ถ้าเลขไม่ตรง หน้าที่เลขเก่ากว่าจะยังได้ไฟล์เก่าค้างในแคช
      (เคยหลุดจริง: join.html ค้างที่ api.js?v=24 ขณะที่ index อยู่ v31) */
console.log('\n── เลข cache-bust ของไฟล์ที่ใช้ร่วมกัน ──────');
{
  const pages = { 'index.html': html, 'trips.html': read('trips.html'), 'join.html': read('join.html') };
  for (const shared of ['style.css', 'themes.css', 'api.js']) {
    const seen = new Map();
    for (const [page, src] of Object.entries(pages)) {
      const found = src.match(new RegExp(`${shared.replace('.', '\\.')}\\?v=(\\d+)`));
      if (found) seen.set(page, found[1]);
    }
    const versions = new Set(seen.values());
    if (versions.size > 1) {
      problem(`${shared} เลขไม่ตรงกัน`,
        [...seen].map(([page, v]) => `${page}=v${v}`).join(' · ') + ' — หน้าที่เลขเก่าจะได้ไฟล์เก่าค้างในแคช');
    } else ok(`${shared} v${[...versions][0] || '—'} ตรงกันทุกหน้า`);
  }
}

console.log(`\n${fail === 0 ? '✅ หน้าเว็บผ่านการตรวจทั้งหมด' : `❌ พบปัญหา ${fail} จุด — แก้ก่อน deploy`}\n`);
process.exit(fail ? 1 : 0);
