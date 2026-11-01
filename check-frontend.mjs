/* ── ด่านตรวจหน้าเว็บก่อน deploy ─────────────────────────────────────
   รัน: node check-frontend.mjs   (deploy.sh เรียกให้เองก่อน deploy)

   v271 (2026-11-01): เดิมไฟล์นี้ตรวจแค่หน้าทริป (frontend/trip-unified-prototype)
   ซึ่งปิดใช้งานแล้ว (ย้ายไป archive/trip-frontend-v271 พร้อมสคริปต์ตรวจเดิม)
   ตอนนี้ตรวจแอปหลัก frontend/index.html + app.js แทน:
     1. syntax ของสคริปต์ทุกไฟล์ในเครื่อง
     2. ฟังก์ชันที่ถูกเรียกแต่ไม่มีการประกาศ (render/load/open/apply/build/sync/paint…)
     3. onclick/oninput/onchange ใน HTML เรียกชื่อที่ไม่มีอยู่
     4. ไฟล์ที่ index.html อ้างถึงต้องมีอยู่จริง
     5. ปีกกาใน CSS ครบ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontend');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let fail = 0;
const problem = (t, d) => { fail++; console.log(`  ❌ ${t}`); if (d) console.log(`     ${d}`); };
const ok = t => console.log(`  ✅ ${t}`);

const html = read('index.html');
const local = [...html.matchAll(/<script[^>]*\ssrc="([^":?]+\.js)(?:\?[^"]*)?"/g)].map(m => m[1]);
const scripts = Object.fromEntries(local.filter(f => fs.existsSync(path.join(root, f))).map(f => [f, read(f)]));
const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const allJs = Object.values(scripts).join('\n') + '\n' + inline;

console.log('\n── 1. syntax ─────────────────────────────────');
for (const [f, src] of Object.entries(scripts)) {
  try { new vm.Script(src, { filename: f }); ok(f); } catch (e) { problem(`${f}: ${e.message}`); }
}

const declared = new Set([
  ...allJs.matchAll(/function\s*\*?\s*([A-Za-z_$][\w$]*)/g),
  ...allJs.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g),
  ...allJs.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g),
  ...allJs.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=/g)
].flatMap(m => m[1].split(',').map(s => s.split(':').pop().trim())).filter(Boolean));
const BUILTIN = new Set(['alert', 'confirm', 'prompt', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'event', 'this', 'document', 'window', 'Swal', 'Chart', 'XLSX', 'XLSXStyle', 'pdfjsLib', 'PDFLib', 'Number', 'String', 'Math', 'JSON', 'Date',
  'localStorage', 'sessionStorage', 'console', 'location', 'history', 'encodeURIComponent', 'decodeURIComponent', 'parseFloat', 'parseInt', 'if', 'return', 'function', 'typeof', 'new', 'await']);

console.log('\n── 2. ฟังก์ชันที่เรียกแต่ไม่มีการประกาศ ─────');
{
  const called = new Set([...allJs.matchAll(/(?<![.\w$'"`])((?:render|paint|open|sync|load|apply|build|refresh|update|show|close)[A-Z][\w$]*)\s*\(/g)].map(m => m[1]));
  const guarded = new Set([...allJs.matchAll(/typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*['"]function/g)].map(m => m[1]));
  const missing = [...called].filter(n => !declared.has(n) && !guarded.has(n));
  if (missing.length) problem(missing.join(' · '), 'ลบฟังก์ชันแล้วลืมลบที่เรียก — หน้าจะพังตอนรัน');
  else ok(`ครบ (${called.size} ชื่อ)`);
}

console.log('\n── 3. ปุ่มใน HTML เรียกชื่อที่ไม่มี ─────────');
{
  const handlers = [...html.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/\son[a-z]+="([^"]*)"/g)].map(m => m[1].replace(/'[^']*'|`[^`]*`/g, "''"));
  const names = new Set();
  for (const h of handlers) for (const m of h.matchAll(/(?<![.\w$'])([A-Za-z_$][\w$]*)\s*(?:\(|\.)/g)) names.add(m[1]);
  const missing = [...names].filter(n => !declared.has(n) && !BUILTIN.has(n) && !(n in globalThis));
  if (missing.length) problem(missing.join(' · '), 'ปุ่มนี้กดแล้วจะ error');
  else ok(`ครบ (${names.size} ชื่อ จาก ${handlers.length} ปุ่ม)`);
}

console.log('\n── 4. ไฟล์ที่อ้างถึงมีอยู่จริง ──────────────');
{
  const refs = [...html.matchAll(/(?:src|href)="([^":#?]+\.(?:js|css|png|svg|jpg|webp|ico|json))(?:\?[^"]*)?"/g)].map(m => m[1]);
  const missing = refs.filter(f => !fs.existsSync(path.join(root, f)));
  if (missing.length) problem(missing.join(' · '), 'หน้าเว็บจะโหลดไฟล์นี้ไม่ได้');
  else ok(`ครบ ${refs.length} ไฟล์`);
}

console.log('\n── 5. โครงสร้าง CSS ─────────────────────────');
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.css'))) {
  const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"\n]*"|'[^'\n]*'/g, '');
  const o = (css.match(/\{/g) || []).length, c = (css.match(/\}/g) || []).length;
  if (o !== c) problem(`${f}: เปิด ${o} ปิด ${c}`, 'ปีกกาไม่ครบ กฎท้ายไฟล์จะหายไปทั้งบล็อก'); else ok(`${f} ปีกกาครบ (${o})`);
}

if (fail) { console.log(`\n❌ พบปัญหา ${fail} ข้อ — แก้ก่อน deploy\n`); process.exit(1); }
console.log('\n✅ หน้าเว็บผ่านการตรวจทั้งหมด\n');
