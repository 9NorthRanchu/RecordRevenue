/* ── รันแอปหลักในเครื่อง แล้วดูว่าพังไหม ─────────────────────────────
   รัน: node check-frontend-runtime.mjs   (deploy.sh เรียกให้เองก่อน deploy)

   v271 (2026-11-01): เดิมรันหน้าทริป (ปิดแล้ว · สคริปต์เดิมอยู่ archive/trip-frontend-v271/checks)
   ตอนนี้รัน frontend/index.html + travel.js + app.js จริงใน jsdom
   ไลบรารีจาก CDN (Swal, Chart, XLSX, pdf.js) ใส่ตัวหลอกแทน · ไม่ยิงเน็ตจริง
   ตรวจ: โหลดไม่ error · เข้าสู่ระบบจำลองแล้วเปิดทุกหน้าได้ไม่ error
   ⚠️ jsdom ไม่มี layout — "ผ่านที่นี่" ยังไม่เท่ากับ "หน้าตาถูกต้องบนมือถือ" */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontend');
const read = n => fs.readFileSync(path.join(dir, n), 'utf8');
let fail = 0;
const check = (t, c, d) => { if (c) { console.log(`  ✅ ${t}`); return; } fail++; console.log(`  ❌ ${t}`); if (d) console.log(`     ${d}`); };

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Could not parse CSS|Not implemented/.test(e.message)) errors.push(e.stack || e.message); });
const html = read('index.html').replace(/<script[^>]*\ssrc="[^"]*"[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://app.test/', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => false; w.prompt = () => null;
w.Element.prototype.scrollIntoView = function () {};
w.HTMLCanvasElement.prototype.getContext = function () { return null; };
w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const sw = () => Promise.resolve({ isConfirmed: false, isDismissed: true, value: undefined });
w.Swal = Object.assign(sw, { fire: sw, isVisible: () => false, close() {}, clickConfirm() {}, showLoading() {}, hideLoading() {}, mixin: () => ({ fire: sw }), update() {}, getPopup: () => null });
w.Chart = class { constructor() {} destroy() {} update() {} }; w.Chart.register = () => {};
w.XLSX = { utils: {}, read() {}, writeFile() {} }; w.pdfjsLib = { GlobalWorkerOptions: {} }; w.PDFLib = {};
const empty = { success: true, results: [], data: [], items: [], rows: [], accounts: [], entities: [], categories: [], contacts: [], captions: [], projects: [], users: [], transactions: [], pending: [] };
w.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(empty)), text: async () => JSON.stringify(empty), blob: async () => new w.Blob([]) });
w.addEventListener('error', e => errors.push(e.error?.stack || e.message));
w.addEventListener('unhandledrejection', e => errors.push('unhandled: ' + (e.reason?.stack || e.reason)));

console.log('\n── โหลดสคริปต์ ───────────────────────────────');
for (const f of [...read('index.html').matchAll(/<script[^>]*\ssrc="([^":?]+\.js)(?:\?[^"]*)?"/g)].map(m => m[1])) {
  const el = w.document.createElement('script'); el.textContent = read(f);
  try { w.document.body.appendChild(el); } catch (e) { errors.push(`${f}: ${e.message}`); }
}
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 400));
check('โหลดครบไม่มี error', errors.length === 0, errors.slice(0, 3).join('\n     '));

console.log('\n── เปิดทุกหน้า ───────────────────────────────');
const views = [...w.document.querySelectorAll('section.content-view[id^="view-"]')].map(s => s.id.slice(5));
if (typeof w.switchView === 'function') {
  for (const v of views) {
    const before = errors.length;
    try { w.switchView(v); } catch (e) { errors.push(`${v}: ${e.stack || e.message}`); }
    await new Promise(r => setTimeout(r, 150));
    check(`หน้า ${v}`, errors.length === before, errors.slice(before, before + 2).join('\n     '));
  }
} else check('มี switchView', false);

if (fail) { console.log(`\n❌ พบปัญหา ${fail} ข้อ — แก้ก่อน deploy\n`); process.exit(1); }
console.log('\n✅ หน้าเว็บรันผ่านทั้งหมด\n');
process.exit(0);
