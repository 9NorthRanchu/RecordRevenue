/* ── รันหน้าเว็บจริงในเครื่อง แล้วดูว่าพังไหม (2026-08-23) ────────────
   รัน: node check-frontend-runtime.mjs   (deploy.sh เรียกให้เองก่อน deploy)

   🔴 ทำไมต้องมีไฟล์นี้
      เทส 674 เคสอยู่ฝั่ง backend ทั้งหมด ไม่มีอะไรรัน app.js เลย
      check-frontend.mjs อ่านโค้ดอย่างเดียว จับได้แค่ที่เห็นจากตัวอักษร
      ตัวนี้เอา app.js ไปรันจริงใน jsdom (เอนจิน JS ตัวเต็ม) แล้วดักทุก error

      สองบั๊กที่จับได้ครั้งแรกที่เขียนไฟล์นี้ ทั้งคู่หลุด syntax check และเทสทั้งหมด:
      1. renderMemberAccess — ลบฟังก์ชันแล้วลืมลบที่เรียก → ทั้งแอปขึ้นแถบแดง
      2. nextPlanDate — ยัดวันที่ภาษาไทย ('8 ก.พ. 2027') เข้า new Date()
         ได้ Invalid Date แล้ว .toISOString() โยน RangeError ตั้งแต่การวาดรอบแรก
         ทำให้ renderBills กับ renderJourneyPreview ที่เขียนไว้ถัดไปไม่ทำงานเลย
         — ตายเงียบสนิท ไม่มีอะไรบนจอบอกว่าผิด

   ⚠️ jsdom ไม่ใช่เบราว์เซอร์เต็มตัว: ไม่มี layout ไม่มี canvas ไม่มี scrollIntoView
      ของพวกนี้ต้องใส่ตัวหลอกให้ (ดู stubs ข้างล่าง) และ "ผ่านที่นี่"
      ยังไม่เท่ากับ "หน้าตาถูกต้องบนมือถือ" — ตัวนี้ตอบได้แค่ว่าโค้ดไม่พังตอนรัน */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontend/trip-unified-prototype');
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');

let fail = 0;
const check = (title, condition, detail) => {
  if (condition) { console.log(`  ✅ ${title}`); return; }
  fail += 1;
  console.log(`  ❌ ${title}`);
  if (detail) console.log(`     ${detail}`);
};

const errors = [];
const dom = new JSDOM(read('index.html'), {
  runScripts: 'dangerously',
  url: 'https://x.test/trip-unified-prototype/?live=0',
  pretendToBeVisual: true
});
const w = dom.window;

/* ── ตัวหลอกแทนของที่ jsdom ไม่มี ────────────────────────────────────
   ใส่เท่าที่จำเป็นให้โค้ดเดินผ่านได้ ไม่ใช่เพื่อกลบ error จริง
   ถ้าต้องเพิ่มตัวหลอกใหม่ ให้ดูก่อนว่าเป็นข้อจำกัดของ jsdom จริง ๆ
   ไม่ใช่บั๊กในโค้ดเรา */
w.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.scrollTo = () => {};
w.alert = () => {}; w.confirm = () => false; w.prompt = () => null;
w.Element.prototype.scrollIntoView = function () {};
w.HTMLCanvasElement.prototype.getContext = function () { return null; };
Object.defineProperty(w.navigator, 'clipboard', {
  value: { writeText: async () => {} }, configurable: true
});
/* ไม่ยิงเน็ตจริง — ตัวนี้ตรวจโค้ด ไม่ได้ตรวจเซิร์ฟเวอร์ */
w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
w.addEventListener('error', event => errors.push(event.error?.stack || event.message));

console.log('\n── โหลดสคริปต์ทั้งหมด ───────────────────────');
for (const file of ['money.js', 'slice-engine.js', 'api.js', 'app.js']) {
  const el = w.document.createElement('script');
  el.textContent = read(file);
  try { w.document.body.appendChild(el); } catch (error) { errors.push(`${file}: ${error.message}`); }
}
await new Promise(resolve => setTimeout(resolve, 300));
check('โหลดครบไม่มี error ตอนรัน', errors.length === 0, errors.slice(0, 2).join('\n     '));
if (errors.length) { console.log(`\n❌ พบปัญหา — แก้ก่อน deploy\n`); process.exit(1); }

const $ = selector => w.document.querySelector(selector);
const $$ = selector => [...w.document.querySelectorAll(selector)];

/* ── โครงหน้าจัดการ (North 2026-08-23) ──────────────────────────────
   "ทำไม ลิงค์กับลบทริปถึงอยู่หน้าเดียวกัน ลบทริป ควรอยู่ในข้อมูลทริป
    และลิงค์ควรอยู่ใน คนและสิทธิ์"
   ล็อกไว้ด้วยเทส เพราะเป็นเรื่องที่เผลอย้ายกลับได้ง่ายตอนแก้ layout รอบหน้า */
console.log('\n── ของอยู่ถูกหัวข้อ ─────────────────────────');
const panelOf = selector => $(selector)?.closest('.mpanel')?.dataset.panel || '(ไม่อยู่ในแผงไหนเลย)';
check('ลบทริปอยู่ในหัวข้อ "ข้อมูลทริป"', panelOf('#deleteTripBtn') === 'trip',
  `ตอนนี้อยู่ที่ ${panelOf('#deleteTripBtn')}`);
check('ลิงก์เข้าทริปอยู่ในหัวข้อ "คนและสิทธิ์"', panelOf('#joinLink') === 'people',
  `ตอนนี้อยู่ที่ ${panelOf('#joinLink')}`);
check('ไม่มีหัวข้อ "ลิงก์และลบทริป" แล้ว',
  !$('[data-panel="danger"]'), 'หัวข้อที่รวมลิงก์กับปุ่มลบไว้ด้วยกันถูกยกเลิกไปแล้ว');
check('มีช่องลิงก์ช่องเดียวทั้งแอป', $$('input[readonly]').filter(node => /link/i.test(node.id)).length === 1,
  'สองช่องที่คำนวณคนละที่ = ส่งผิดลิงก์ให้ผิดคน');

/* ── ตั้งรหัสรายคน ───────────────────────────────────────────────────
   North: "คนและสิทธิ์ ควรมีให้เพิ่มรหัสพาสของแต่ละคนได้ ที่จะเข้าลิงค์นั้นได้" */
console.log('\n── ตั้งรหัสเข้าใช้งานรายคน ──────────────────');
/* North 2026-08-23: "เอาไว้หน้าเดียวกับแก้ไข ได้ไหม แล้วแสดงข้อมูลไว้"
   ล็อกไว้ว่าช่องรหัสต้องอยู่ใน #memberForm — ไม่ใช่หน้าต่างแยกอีกอัน */
check('ช่องรหัสอยู่ในฟอร์มแก้ไขสมาชิก', $('#memberForm')?.contains($('#passcodeInput')),
  'ที่แก้สองที่คือที่มาของความสับสน — ห้ามแยกหน้าต่างตั้งรหัสกลับมา');
check('ไม่มีหน้าต่างตั้งรหัสแยกแล้ว', !$('#passcodeDialog'));

/* ⚠️ ในโหมดข้อมูลตัวอย่างปุ่มรหัสไม่ถูกวาดออกมาโดยตั้งใจ (ดู access() ใน app.js)
      เพราะไม่มีเซิร์ฟเวอร์ให้บันทึกจริง — จึงยัดปุ่มเข้าไปเองเพื่อทดสอบตัวจัดการ
      ซึ่งเป็นส่วนที่ใช้ร่วมกันทั้งสองโหมด */
/* North: "ตั้งรหัสเอาออก มีอยู่ในแก้ไขแล้วไง" — แถวมีหน้าที่บอกสถานะอย่างเดียว
   ปุ่มที่สองบนแถวที่เปิดหน้าต่างเดียวกับ ✏️ เป็นแค่ของรก แถวยิ่งแคบยิ่งกดพลาด */
check('บนแถวสมาชิกไม่มีปุ่มรหัสแล้ว', !$('#memberRows [data-set-passcode]'));
check('แถวสมาชิกยังบอกสถานะรหัสอยู่', $$('#memberRows .access-tag').length > 0,
  'ป้าย 👤 บัญชีครอบครัว / 🔑 มีรหัส คือ "ข้อมูล" ที่ North สั่งให้แสดงไว้');

{
  const editButton = $('#memberRows [data-edit-member]');
  check('มีปุ่มแก้ไขในแถวสมาชิก', Boolean(editButton));
  editButton?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('กดแล้วเปิดฟอร์มแก้ไข', $('#memberDialog')?.classList.contains('open'),
    'ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่ทำให้คนไม่เชื่อปุ่มอื่นในหน้าเดียวกัน');

  /* พิมพ์สองช่องไม่ตรงกันต้องถูกจับ — เซิร์ฟเวอร์ไม่มีทางรู้เรื่องนี้ได้เลย
     ถ้าหลุดไป คนตั้งจะรู้ตัวอีกทีตอนเจ้าตัวเข้าไม่ได้ ซึ่งสายไปแล้ว
     (ตรวจผ่าน readNewPasscode โดยตรง เพราะโหมดตัวอย่างข้ามการตรวจรหัสไป) */
  const readNewPasscode = w.eval('readNewPasscode');
  $('#passcodeInput').value = 'abcdef'; $('#passcodeConfirm').value = 'abcdeX';
  check('รหัสสองช่องไม่ตรงกัน → ไม่ผ่าน', readNewPasscode() === false
    && /ไม่ตรงกัน/.test($('#memberError').textContent), `ขึ้นว่า "${$('#memberError').textContent}"`);

  $('#passcodeInput').value = 'abc'; $('#passcodeConfirm').value = 'abc';
  check('รหัสสั้นกว่า 6 ตัว → ไม่ผ่าน', readNewPasscode() === false
    && /6 ตัวอักษร/.test($('#memberError').textContent), `ขึ้นว่า "${$('#memberError').textContent}"`);

  /* เว้นว่างต้องแปลว่า "ไม่แตะรหัสเดิม" ไม่ใช่ "ล้างรหัส" — พลาดตรงนี้
     = แก้ชื่อคนแล้วรหัสเขาหายไปเงียบ ๆ โดยไม่มีใครตั้งใจ */
  $('#passcodeInput').value = ''; $('#passcodeConfirm').value = '';
  check('เว้นว่าง = ไม่แตะรหัสเดิม', readNewPasscode() === null);

  $('#passcodeInput').value = 'abcdef'; $('#passcodeConfirm').value = 'abcdef';
  check('รหัสถูกต้อง → ผ่าน', readNewPasscode() === 'abcdef');

  $('#memberDialog .dialog-close').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('ปิดฟอร์มได้', !$('#memberDialog').classList.contains('open'),
    'ลืมเพิ่มในลิสต์ของ closeLayers() หรือเปล่า');
}

/* ── กับดักวันที่กับตัวเลข (ตรวจระบบทริป 2026-08-23) ────────────────────
   `day.date` มีสองรูปแบบเสมอ: ISO ในโหมดข้อมูลจริง · ข้อความไทยในข้อมูลตัวอย่าง
   ฟังก์ชันที่รับวันที่จึงต้องทนค่าที่แปลงไม่ได้ทุกตัว ไม่ใช่แค่บางตัว
   (เคยหลุด: nextPlanDate โยน RangeError จนหน้าตายครึ่งหน้า) */
console.log('\n── กับดักวันที่กับตัวเลข ─────────────────────');
{
  const call = (code, arg) => w.eval(`(${code})`)(arg);
  const thai = '8 ก.พ. 2027';   // รูปแบบของข้อมูลตัวอย่าง — แปลงเป็น Date ไม่ได้
  check('thaiDate ไม่คืนคำว่า "Invalid Date"',
    !/Invalid Date/.test(String(call('thaiDate', thai))),
    `ได้ "${call('thaiDate', thai)}" — คำนี้ไปโผล่บนจอตรง ๆ`);
  check('thaiDateShort ทนวันที่แปลงไม่ได้', !/Invalid|NaN/.test(String(call('thaiDateShort', thai))));
  check('billDateLabel ทนวันที่ว่าง', !/Invalid|NaN/.test(String(call('billDateLabel', ''))));
  check('nextPlanDate คืน ISO เสมอ', /^\d{4}-\d{2}-\d{2}$/.test(String(w.eval('nextPlanDate()'))));

  /* NaN ที่หลุดออกจากฟังก์ชันคำนวณคือกับดักที่แย่ที่สุด — มันไม่ throw
     แต่ไปโผล่เป็นตัวเลขผิดหรือข้อความผิดที่อื่นแทน */
  const days = w.eval('daysLeftInTrip()');
  check('daysLeftInTrip ไม่คืน NaN', Number.isFinite(days), `ได้ ${days}`);
  check('toMinutes ไม่แปลงเวลาว่างเป็น 0', w.eval("toMinutes('')") === null,
    "Number('') = 0 → ช่องเวลาว่างจะกลายเป็น 00:00 แล้วทุกจุดขึ้นป้าย “ปิดแล้ว”");
}

/* ── ยอดบาทจริงของบิลบัตรเครดิตต้องอ่านกลับได้ ───────────────────────
   บันทึกติดแล้วอ่านไม่กลับ = คนกรอกนึกว่าที่กรอกไปหายหมด แล้วกรอกใหม่ทั้งชุด */
console.log('\n── ค่าที่บันทึกแล้วต้องอ่านกลับได้ ──────────');
{
  const apiSrc = read('api.js');
  check('อ่าน settled_thb ของบิลกลับมา', /settled_thb/.test(apiSrc),
    'ยอดบาทจริงของบัตรเครดิตอยู่ในฐานแล้ว แต่หน้าจอไม่เคยอ่านกลับ');
  check('อ่าน exclude_on_close ของกระเป๋ากลับมา', /exclude_on_close/.test(apiSrc));
  check('เติมค่าเดิมลงช่องบัตรเครดิตก่อนวาด', /bill\.settledThb/.test(read('app.js')));
}

console.log(`\n${fail === 0 ? '✅ หน้าเว็บรันผ่านทั้งหมด' : `❌ พบปัญหา ${fail} จุด — แก้ก่อน deploy`}\n`);
process.exit(fail ? 1 : 0);
