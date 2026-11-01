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

/* ── ตัวล็อกต้องไม่ล็อกเกินที่สั่ง (2026-09-03) ──────────────────────
   🔴 บั๊กนี้เกิดมาแล้ว **สองรอบ** ด้วยสาเหตุเดียวกัน: ส่งชื่อพื้นที่ที่ระบบ
      ไม่รู้จักเข้า financeLocked() (พิมพ์ผิด หรือลืมใส่) → LIVE_WRITABLE[area]
      เป็น undefined → ล็อกทุกอย่างในโหมดข้อมูลจริงโดยไม่มี error ให้เห็น
      รอบล่าสุดทำให้ปุ่ม ＋ ลอยบนมือถือตายสนิททั้งแอป · ล็อกไว้ด้วยเทสตรงนี้ */
console.log('\n── ตัวล็อกสิทธิ์ ────────────────────────────');
{
  const set = (code) => w.eval(code);
  const before = { live: w.eval('liveMode'), closed: w.eval('tripClosed'), guest: w.eval('liveIsGuest') };

  set('liveMode = true; tripClosed = false; liveIsGuest = false;');
  check('ทริปเปิดอยู่ → financeLocked() ต้องเป็น false', w.eval('financeLocked()') === false,
    'ไม่ส่งชื่อพื้นที่ = ถามว่า "ทริปปิดหรือยัง" เท่านั้น ไม่ใช่ล็อกทุกอย่าง');
  check('ทริปเปิดอยู่ → body ต้องไม่ติดคลาส trip-closed', (() => {
    w.eval('applyTripLock()');
    return !w.document.body.classList.contains('trip-closed');
  })(), 'CSS ใช้คลาสนี้ดับปุ่ม ＋ ลอยบนมือถือ ติดค้างเมื่อไรคือกดอะไรไม่ได้เลย');
  check('ชื่อพื้นที่ที่ไม่รู้จักต้องไม่ล็อกเงียบ ๆ', w.eval("financeLocked('พื้นที่ที่ไม่มีจริง')") === false,
    'ต้อง console.error ออกมา ไม่ใช่ล็อกทิ้งแล้วเงียบ');
  check('แผนเที่ยวยังแก้ได้แม้ทริปปิดแล้ว', (() => {
    set('tripClosed = true;');
    const planOpen = w.eval("financeLocked('plan')") === false;
    const moneyLocked = w.eval("financeLocked('expenses')") === true;
    set('tripClosed = false;');
    return planOpen && moneyLocked;
  })());

  /* ผู้ร่วมทริปทำได้แค่จดค่าใช้จ่ายกับเช็กอิน — ต้องตรงกับ GUEST_WRITABLE
     ฝั่งเซิร์ฟเวอร์ ถ้าหน้าจอเปิดกว้างกว่า คนจะกรอกฟอร์มเสร็จแล้วเจอ 403 */
  set('liveIsGuest = true;');
  check('ผู้ร่วมทริป: จดค่าใช้จ่ายได้', w.eval("financeLocked('expenses')") === false);
  check('ผู้ร่วมทริป: เพิ่มสถานที่ไม่ได้', w.eval("financeLocked('plan')") === true,
    'เกิดกับ North จริง 3 ก.ย. — ฟอร์มเปิดให้กรอกจนเสร็จแล้วค่อยขึ้นว่าทำไม่ได้');
  check('ผู้ร่วมทริป: แก้กระเป๋า/สกุลเงินไม่ได้',
    w.eval("financeLocked('wallets')") === true && w.eval("financeLocked('currencies')") === true);
  check('บอกเหตุผลว่าเป็นเรื่องสิทธิ์ผู้ร่วมทริป ไม่ใช่ "ทริปปิดแล้ว"',
    /ผู้ร่วมทริป/.test(w.eval("lockReason('plan')")), w.eval("lockReason('plan')"));

  check('มีแถบบอกสถานะผู้ร่วมทริปบนหน้าจอ', (() => {
    w.eval('renderGuestNote()');
    return $('#guestNote')?.hidden === false && /ผู้ร่วมทริป/.test($('#guestNoteText')?.textContent || '');
  })(), 'ค่า is_guest เคยถูกส่งมาแล้วไม่มีใครอ่าน — ผู้ใช้จึงไม่รู้ว่าทำไมกดไม่ได้');
  check('มีทางออกกลับไปใช้สิทธิ์บัญชีครอบครัว', Boolean($('#guestSignOut')),
    'signOutMember() มีใน api.js มานานแล้วแต่ไม่มีปุ่มไหนเรียก — เข้าแล้วออกไม่ได้');

  set(`liveMode = ${before.live}; tripClosed = ${before.closed}; liveIsGuest = ${before.guest};`);
  w.eval('applyTripLock()');
}

/* ── "เพิ่มวัน" ต้องไม่ใช่ฟอร์มเพิ่มสถานที่ (2026-09-07) ─────────────
   North: "เพิ่มวัน เพิ่มสถานที่ ต่างกันอย่างไร · ถ้าเพิ่มวันเฉย ๆ ให้ลบการ
   ตั้งค่าในส่วนอื่นออก" — เดิมสองปุ่มเปิดฟอร์มเดียวกันเป๊ะ ต่างแค่ตั้งวันให้
   ล็อกไว้ด้วยเทส เพราะเป็นเรื่องที่เผลอรวมกลับเป็นฟอร์มเดียวได้ง่ายมาก */
console.log('\n── ฟอร์มของ "วัน" แยกจากฟอร์มสถานที่ ────────');
{
  check('มีฟอร์มของวันแยกต่างหาก', Boolean($('#dayDialog')) && Boolean($('#dayForm')));
  check('ฟอร์มวันมีแค่ช่องวันที่กับชื่อวัน', (() => {
    const fields = [...$('#dayForm').querySelectorAll('input,select,textarea')].map(node => node.id);
    return fields.length === 2 && fields.includes('dayDate') && fields.includes('dayTitle');
  })(), 'ช่องของ "สถานที่" ไม่ควรมาอยู่ในฟอร์มของวัน');
  check('ไม่มีช่องชื่อสถานที่ปนมาในฟอร์มวัน', !$('#dayForm').querySelector('#activityName'));

  /* 🔴 หน้าต่างใหม่ทุกอันต้องถูกเพิ่มใน closeLayers() ไม่งั้นเปิดได้แต่ปิดไม่ลง
     ซึ่งบนจอดูเหมือนแอปค้าง — เคยพลาดมาแล้ว */
  w.eval('openDayDialog()');
  check('กดเพิ่มวันแล้วฟอร์มวันเปิดขึ้นมา', $('#dayDialog').classList.contains('open'));
  check('ฟอร์มเพิ่มสถานที่ไม่ถูกเปิดขึ้นมาด้วย', !$('#planEditor').classList.contains('open'),
    'สองปุ่มนี้ต้องพาไปคนละที่ ไม่ใช่ฟอร์มเดียวกัน');
  w.eval('closeLayers()');
  check('ปิดฟอร์มวันได้ (อยู่ใน closeLayers แล้ว)', !$('#dayDialog').classList.contains('open'),
    'หน้าต่างที่เปิดได้แต่ปิดไม่ลง บนจอดูเหมือนแอปค้าง');

  check('ปุ่มลบวันซ่อนอยู่ตอนเพิ่มวันใหม่', (() => {
    w.eval('openDayDialog()');
    const hidden = $('#deleteDayBtn').hidden === true;
    w.eval('closeLayers()');
    return hidden;
  })(), 'ยังไม่มีวันให้ลบ ปุ่มลบจึงไม่ควรโผล่');
}

/* ── ย้ายสถานที่ข้ามวัน + ป้ายวันต้องบอกวันที่ (2026-09-07) ─────────
   North: "ให้เลื่อนสถานที่ไปยัง day อื่นได้" — ความสามารถนี้มีมาก่อนแล้ว
   แต่ซ่อนอยู่ท้ายหน้าและต้องแตะการ์ดเลือกก่อน คนจึงหาไม่เจอ = เท่ากับไม่มี
   และ "ให้ระบุด้วยว่าเป็นวันที่เท่าไร แทน Day 1 Day 2" */
console.log('\n── ย้ายข้ามวัน · ป้ายวันบอกวันที่ ───────────');
{
  w.eval("showScreen('plan')");
  check('มีปุ่มย้ายไปวันอื่นบนการ์ดสถานที่', Boolean($('.plan-item [data-move-day-for]')),
    'ปุ่มที่มีอยู่แต่หาไม่เจอ เท่ากับไม่มี');
  check('ยังมีแถบเลือกวันปลายทางอยู่', Boolean($('#crossDayMove')) && Boolean($('#moveDayTargets')));

  /* 🔴 ทุกที่ที่ให้เลือกหรือบอก "วัน" ต้องมีวันที่จริง ไม่ใช่เลข Day ลอย ๆ */
  w.eval('openPlanEditor()');
  const options = [...$('#activityDay').options].map(node => node.textContent);
  check('ช่องเลือกวันในฟอร์มสถานที่บอกวันที่จริง',
    options.length > 0 && options.every(text => /\d/.test(text) && !/^\s*Day \d+\s*·/.test(text)),
    JSON.stringify(options).slice(0, 160));
  check('หัวเรื่องฟอร์มเพิ่มสถานที่บอกวันที่',
    /\d/.test($('#planEditorTitle').textContent) && !/^เพิ่มสถานที่ใน Day \d+$/.test($('#planEditorTitle').textContent),
    $('#planEditorTitle').textContent);
  w.eval('closeLayers()');
  check('ปุ่มเพิ่มสถานที่ท้ายรายการบอกวันที่', /\d/.test($('#addPlaceFoot').textContent),
    $('#addPlaceFoot').textContent);
}

/* ── ช่องเวลาต้องกระชับ + มีค่าตั้งต้น (North 2026-09-07) ────────────
   North: "เวลา ทั้ง 4 จุดให้กระชับกว่านี้ ชม. นาที รวมอยู่ด้วยกัน" และ
          "เวลาเปิด ปิด default เปิด 9.00 ปิด 18.00" */
console.log('\n── ช่องเวลา: กระชับ + มีค่าตั้งต้น ──────────');
{
  w.eval('openPlanEditor()');
  check('เพิ่มสถานที่ใหม่ → เวลาเปิดตั้งต้น 09:00', w.eval("timeValue('activityOpen')") === '09:00',
    `ได้ "${w.eval("timeValue('activityOpen')")}"`);
  check('เพิ่มสถานที่ใหม่ → เวลาปิดตั้งต้น 18:00', w.eval("timeValue('activityClose')") === '18:00',
    `ได้ "${w.eval("timeValue('activityClose')")}"`);

  // 2026-09-15: ช่องที่ 5 = เวลาถึงของการจองเดินทาง (อยู่ในกล่องการจอง) — ไม่นับรวมที่นี่
  const boxes = $$('#planEditorForm .time-picker:not(#bookingArrive)');
  check('มีช่องเวลา 4 ช่อง (เวลา · สิ้นสุด · เปิด · ปิด)', boxes.length === 4, `เจอ ${boxes.length}`);
  check('แต่ละช่องคือกรอบเดียว มี ชม. กับ นาที อยู่ด้วยกัน',
    boxes.length > 0 && boxes.every(box =>
      box.querySelectorAll('select').length === 2 && box.querySelector('.tp-h') && box.querySelector('.tp-m')),
    'ต้องเป็นสองตัวเลือกในกรอบเดียว ไม่ใช่สองกล่องแยกกัน');

  /* 🔴 ของเดิมที่เจ้าของตั้งใจเว้นเวลาเปิดปิดไว้ ห้ามถูกยัดค่าตั้งต้นทับ
     ไม่งั้นแค่เปิดฟอร์มมาดูแล้วกดบันทึก ก็เขียนเวลาที่เขาไม่ได้ตั้งลงไปให้ */
  check('แก้ของเดิมที่ไม่ได้ตั้งเวลาเปิดปิด → ต้องยังว่างอยู่',
    w.eval(`(() => {
      openPlanEditor(planDays[0].activities[0]);
      return timeValue('activityOpen') + '|' + timeValue('activityClose');
    })()`) === '|');
  w.eval('closeLayers()');

  /* 🔴 กันบั๊กเดิมกลับมา: `#planEditor select` เป็น id จึงชนะ class ทุกจำนวน
     ถ้าลืมเจาะจงตรงนี้ ช่องเวลาจะกลับไปบานเป็นสองกล่อง มีลูกศรอย่างละอัน
     บวกลูกศรของกรอบนอกอีกอัน รวมสามลูกศรในช่องเดียว (ภาพที่ North ส่งมา) */
  check('CSS ของช่องเวลาเจาะจงพอจะชนะ #planEditor select',
    /#planEditor \.time-picker select/.test(read('style.css')),
    'ลูกศรของ select จะโผล่กลับมาอีกสองอันถ้ากฎนี้หาย');
}

/* ── ฟอร์มสถานที่: โครงใหม่ + ประเภทต้องไม่ว่าง (North 2026-09-07) ──
   North: "หน้าแก้ไข จัดหน้าจอใหม่ให้สวยงาม กระชับ ใช้กับมือถือสะดวกด้วย"
   และในภาพที่ส่งมา ช่อง "ประเภท" ว่างเปล่า ทั้งที่เป็นสถานที่ที่บันทึกไว้แล้ว */
console.log('\n── ฟอร์มสถานที่: โครงใหม่ ───────────────────');
{
  check('หัวเรื่องกับปุ่มบันทึกแยกออกจากส่วนที่เลื่อน',
    Boolean($('#planEditor .pe-head')) && Boolean($('#planEditor .pe-body')) && Boolean($('#planEditor .pe-foot')),
    'ปุ่มบันทึกต้องอยู่กับที่ ไม่ใช่ต้องเลื่อนลงไปสุดฟอร์มถึงจะเจอ');
  check('ปุ่มบันทึกกับยกเลิกอยู่ในส่วนที่ติดอยู่กับที่',
    Boolean($('#planEditor .pe-foot .primary-btn')) && Boolean($('#planEditor .pe-foot #cancelPlanEditor')));
  check('ช่องกรอกทั้งหมดอยู่ในส่วนที่เลื่อนได้',
    $$('#planEditorForm input,#planEditorForm select,#planEditorForm textarea')
      .every(node => $('#planEditor .pe-body').contains(node)),
    'ช่องที่หลุดออกนอกส่วนเลื่อนจะโดนปุ่มบันทึกทับบนมือถือ');
  check('เวลาเริ่มกับเวลาสิ้นสุดอยู่บรรทัดเดียวกัน',
    $$('#planEditorForm .pe-range').length === 2
    && $('#planEditorForm .pe-range').contains($('#activityTime'))
    && $('#planEditorForm .pe-range').contains($('#activityEndTime')),
    'สองแถวที่อ่านคู่กันเสมอ ควรอยู่บรรทัดเดียว');
  check('เวลาเปิด–ปิด ก็อยู่บรรทัดเดียวกัน',
    $$('#planEditorForm .pe-range')[1]?.contains($('#activityOpen'))
    && $$('#planEditorForm .pe-range')[1]?.contains($('#activityClose')));
  check('มีหัวข้อคั่นบอกว่าส่วนล่างไม่ต้องกรอกก็ได้',
    $$('#planEditorForm .pe-divider').length >= 2);

  /* 🔴 บั๊กที่ North เจอ: ประเภทเป็นช่องว่างเปล่าทุกครั้งที่เปิดของเดิม
     เพราะฐานส่งคำว่า 'สถานที่' ซึ่งไม่ตรงกับตัวเลือกไหนเลย ('สถานที่หลัก') */
  const tagValues = [...$('#activityTag').options].map(option => option.value);
  const apiSrc = read('api.js');
  check('ค่าประเภทที่ api.js ส่งมา ต้องตรงกับตัวเลือกในฟอร์ม',
    !/tag: stop\.accommodation \? 'ที่พัก' : 'สถานที่',/.test(apiSrc)
    && tagValues.includes('สถานที่หลัก'), "api.js เคยส่ง 'สถานที่' ที่ไม่มีในลิสต์");

  /* North เลือกทางเลือก ก. — ประเภทต้องถูกเก็บจริงในคอลัมน์ TripStops.stop_tag
     ถ้าฝั่งใดฝั่งหนึ่งหาย ประเภทจะกลับไป "เลือกแล้วหาย" เหมือนเดิมโดยไม่มี error */
  check('บันทึกประเภทขึ้นเซิร์ฟเวอร์จริง (ส่ง stop_tag)', /stop_tag: tag \|\| undefined/.test(apiSrc),
    'ไม่ส่งขึ้นไป = เลือกแล้วหายเหมือนเดิม');
  check('อ่านประเภทที่บันทึกไว้กลับมา (stop.stop_tag)', /stop\.stop_tag \|\|/.test(apiSrc),
    'อ่านไม่กลับ = บันทึกติดแต่บนจอยังโชว์ค่าที่เดาเอา');
  check('เจอค่าประเภทที่ไม่รู้จัก → ต้องเลือกอันที่ใกล้ที่สุด ไม่ใช่ปล่อยว่าง',
    w.eval(`(() => {
      const stop = planDays[0].activities[0];
      const keep = stop.tag;
      stop.tag = 'ค่าประหลาดจากข้อมูลเก่า';
      openPlanEditor(stop);
      const got = document.querySelector('#activityTag').value;
      stop.tag = keep;
      closeLayers();
      return got;
    })()`) === 'สถานที่หลัก', 'ช่องว่างเปล่าคือสิ่งที่ North เห็นในภาพที่ส่งมา');
}

/* ── แถบวันต้องเลื่อนซ้ายขวาได้ (North 2026-09-07) ───────────────────
   ทริป 11 วัน แถบวันยาวเกินจอ · สกรอลบาร์ถูกซ่อนไว้ ทำให้บนจอเห็นการ์ดวันแรก
   โดนตัดครึ่งค้างอยู่โดยไม่มีอะไรบอกว่าเลื่อนได้
   ⚠️ jsdom ไม่มี layout — scrollWidth/clientWidth เป็น 0 เสมอ จึงต้องป้อนขนาด
      ปลอมให้เอง แล้วเรียก updateDayStrip() ตรง ๆ */
console.log('\n── แถบวันเลื่อนซ้ายขวาได้ ───────────────────');
{
  const rail = $('#planDayTabs');
  const strip = $('#planDayStrip');
  check('มีปุ่มเลื่อนซ้ายและขวา', Boolean($('#dayScrollPrev')) && Boolean($('#dayScrollNext')));
  check('ปุ่มเลื่อนอยู่นอกแถบที่เลื่อน', Boolean(strip) && !rail.contains($('#dayScrollNext')),
    'ถ้าปุ่มอยู่ในแถบ มันจะเลื่อนหนีไปกับแถบเอง');

  const fake = (scrollWidth, clientWidth, scrollLeft) => {
    Object.defineProperty(rail, 'scrollWidth', { value: scrollWidth, configurable: true });
    Object.defineProperty(rail, 'clientWidth', { value: clientWidth, configurable: true });
    Object.defineProperty(rail, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true });
    w.eval('updateDayStrip()');
  };

  fake(1400, 700, 0);
  check('ยาวเกินจอ + อยู่ซ้ายสุด → โผล่ปุ่มขวาอย่างเดียว',
    strip.classList.contains('can-next') && !strip.classList.contains('can-prev'));

  fake(1400, 700, 350);
  check('อยู่กลาง ๆ → โผล่ทั้งสองปุ่ม',
    strip.classList.contains('can-next') && strip.classList.contains('can-prev'));

  fake(1400, 700, 700);
  check('สุดขวาแล้ว → เหลือปุ่มซ้ายอย่างเดียว',
    !strip.classList.contains('can-next') && strip.classList.contains('can-prev'),
    'ปุ่มที่กดแล้วไม่ไปไหนคือปุ่มที่ทำให้คนเลิกเชื่อปุ่ม');

  fake(600, 700, 0);
  check('วันน้อย แถบไม่ล้นจอ → ไม่มีปุ่มโผล่เลย',
    !strip.classList.contains('can-next') && !strip.classList.contains('can-prev'),
    'ทริป 2 วันไม่ควรมีลูกศรลอยมาบังการ์ด');

  /* 🔴 เคสที่พังง่ายที่สุด: ลากแถบแล้วปล่อยมือตรงการ์ดวันไหน ต้องไม่กลายเป็น
     "กดเลือกวันนั้น" — ลากดูเฉย ๆ แล้วโดนเปลี่ยนวันให้ คือของที่หงุดหงิดมาก */
  fake(1400, 700, 300);
  const before = w.eval('activePlanDayId');
  const tab = $('#planDayTabs [data-plan-day]');
  check('มีการ์ดวันให้ทดสอบ', Boolean(tab));
  /* jsdom ไม่มี PointerEvent — ใช้ MouseEvent แล้วแปะ pointerType เอง
     (โค้ดจริงเช็ค pointerType เพื่อไม่ไปสู้กับการปัดนิ้วบนมือถือ) */
  const mouse = (type, x, target = rail) => {
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  };
  mouse('pointerdown', 400);
  mouse('pointermove', 330);
  mouse('pointerup', 330);
  tab?.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('ลากแถบแล้วปล่อยมือ ต้องไม่เปลี่ยนวันให้', w.eval('activePlanDayId') === before,
    `เปลี่ยนจาก ${before} เป็น ${w.eval('activePlanDayId')}`);

  /* แต่การกดจริง ๆ (ไม่ได้ลาก) ต้องยังเปลี่ยนวันได้เหมือนเดิม */
  mouse('pointerdown', 400);
  mouse('pointerup', 400);
  tab?.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('กดเฉย ๆ (ไม่ได้ลาก) ยังเปลี่ยนวันได้', w.eval('activePlanDayId') === tab?.dataset.planDay,
    'กลืน click ค้างไว้ = แถบวันกดไม่ได้ทั้งแถบ');
}

/* ── บันทึกแล้วต้องอยู่วันเดิม (2026-09-07) ──────────────────────────
   North: "ตอนนี้หากมีการแก้ไข ระบบชอบกลับไปตรงวันที่แรก ให้ยังอยู่ส่วนเดิมสิ"
   ต้นเหตุ: applyLiveState เขียน activePlanDayId = planDays[0].id ตายตัว และ
   ทุกการบันทึกจบด้วย refreshFromServer() → วิ่งผ่านบรรทัดนั้นทุกครั้ง
   แก้สถานที่ของวันที่ 5 เสร็จปุ๊บจอเด้งไปวันที่ 1 ทันที */
console.log('\n── บันทึกแล้วต้องอยู่วันเดิม ────────────────');
{
  /* จำลอง planDays ของทริปจริง (id = stop-day-<วันที่> เหมือนที่ api.js สร้าง) */
  w.eval(`
    planDays.length = 0;
    ['2026-12-17','2026-12-18','2026-12-19','2026-12-20'].forEach((date, i) => {
      planDays.push({ id: 'stop-day-' + date, day: i + 1, date, city: '—', activities: [],
        weather: null, title: '' });
    });
  `);

  check('วันเดิมยังอยู่ → อยู่วันเดิม', (() => {
    w.eval("activePlanDayId = 'stop-day-2026-12-19';");
    return w.eval("pickPlanDayId('2026-12-19')") === 'stop-day-2026-12-19';
  })(), 'นี่คืออาการที่ North เจอ: แก้อะไรก็ตามแล้วเด้งกลับวันแรก');

  check('ย้ายวันแล้วตามไปวันใหม่', (() => {
    w.eval("focusPlanDate('2026-12-20')");
    return w.eval('takePlanFocusDate()') === '2026-12-20';
  })(), 'ย้าย 19 → 20 ธ.ค. แล้ว id เดิมหายไป ต้องมีตัวใบ้บอกปลายทาง');

  check('ตัวใบ้ใช้ครั้งเดียวแล้วล้างทิ้ง', w.eval('takePlanFocusDate()') === '',
    'ถ้าค้างไว้ จะไปลากจอกลับวันเดิมตอน refresh รอบถัดไปที่ไม่เกี่ยวกัน');

  check('วันที่ขอหายไปแล้ว → ไปวันใกล้เคียงที่สุด ไม่ใช่วันแรก',
    w.eval("pickPlanDayId('2026-12-19')") === 'stop-day-2026-12-19'
    && w.eval("pickPlanDayId('2026-12-21')") === 'stop-day-2026-12-20',
    'เพิ่งลบวันที่ 21 ทิ้ง ควรอยู่แถว ๆ เดิม ไม่ใช่กระโดดกลับวันที่ 17');

  check('ไม่มีตัวใบ้และไม่มีวันเดิม → วันแรก', w.eval("pickPlanDayId('')") === 'stop-day-2026-12-17',
    'เปิดทริปครั้งแรกยังต้องเริ่มที่วันแรกเหมือนเดิม');

  /* 🔴 ล็อกไว้ตรง ๆ ว่าบรรทัดที่เป็นต้นเหตุต้องไม่กลับมา */
  const appSrc = read('app.js');
  check('applyLiveState ไม่บังคับกลับวันแรกอีกแล้ว',
    !/activePlanDayId\s*=\s*planDays\[0\]\.id/.test(appSrc),
    'บรรทัดนี้คือต้นเหตุเดิม ห้ามเขียนกลับมาแบบตายตัว');
  check('แถบสรุปใต้แบนเนอร์ก็ไม่เด้งกลับ "วันนี้" ทุกครั้ง',
    /renderJourneyPreview\(previewJourneyIndex\)/.test(appSrc),
    'buildLiveJourney เลือกช่องที่ควรยืนไว้แล้ว อย่าบังคับทับด้วย actualJourneyIndex');
  check('ฟอร์มสถานที่บอกปลายทางก่อนบันทึก', /focusPlanDate\(targetDay\?\.date/.test(appSrc),
    'เพิ่มสถานที่ลงวันอื่น แล้วต้องไปยืนที่วันนั้น ไม่ใช่วันที่เปิดฟอร์มมา');
}

/* ── การจองของจุดแวะ (North 2026-09-15 · จาก Trip.xlsx) ─────────────────
   ฟอร์ม 3 ชั้น: พับไว้ · กางแล้วช่องเปลี่ยนตามชนิด · จ่ายเงินล่างสุด
   การ์ด: ป้ายเลขจอง/จ่าย/ยกเลิกฟรี · สำรอง · ที่พักหลายคืนโผล่วันถัดไป */
console.log('\n── การจองของจุดแวะ ─────────────────────────');
{
  const appSrc = read('app.js');
  const apiSrc = read('api.js');
  check('api.js ประกบ bookings เข้า activity.booking', /booking: bookingByStop\[stop\.stop_id\] \|\| null/.test(apiSrc));
  check('api.js ส่ง booking ขึ้นเซิร์ฟเวอร์ (ไม่ส่ง=ไม่แตะ · null=ลบ)', /\n\s+booking\n\s+\}\n\s+\}\);/.test(apiSrc));

  w.eval("openPlanEditor(null, '')");
  const box = $('#bookingBox');
  check('กล่องการจองเป็น <details> พับอยู่ตอนเพิ่มของใหม่', box?.tagName === 'DETAILS' && box.open === false);
  check('ช่องงบมีตัวเลือกสกุลเงิน และมี THB เสมอ',
    [...$('#activityCurrency').options].map(o => o.value).includes('THB'));
  check('ของใหม่ที่ยังไม่กรอกอะไร → ไม่ส่งการจอง (undefined)', w.eval('readBookingForm()') === undefined);

  /* เปลี่ยนประเภทเป็นที่พัก → เวลา 15:00 · ชนิดการจอง HOTEL · โชว์ช่องห้อง ซ่อนช่องเที่ยวบิน */
  $('#activityTag').value = 'ที่พัก';
  $('#activityTag').dispatchEvent(new w.Event('change'));
  check('ประเภทที่พัก → เวลาตั้งต้น 15:00 (เวลาไปถึง)', w.eval("timeValue('activityTime')") === '15:00');
  check('ประเภทที่พัก → ชนิดการจอง HOTEL', $('#bookingKind').value === 'HOTEL');
  check('ที่พัก: โชว์ช่องห้อง ซ่อนช่องจาก/ถึง',
    $('#bookingRoom').closest('label').hidden === false && $('#bookingFrom').closest('label').hidden === true);
  /* ข้อมูลตัวอย่างใช้วันที่ภาษาไทย (ไม่ใช่ ISO) → input[type=date] รับไม่ได้และว่างไว้ ซึ่งถูกต้อง
     ของจริงเป็น ISO เสมอ · เทสจึงตรวจว่า "ค่าที่พยายามใส่คือวันของจุดแวะ" ไม่ใช่รูปแบบ */
  const wantDate = w.eval('editorSelectedDate()');
  check('ที่พักใหม่: เช็กอินถูกเติมเป็นวันของจุดแวะ',
    Boolean(wantDate) && ($('#bookingCheckIn').value === wantDate || !/^\d{4}-\d{2}-\d{2}$/.test(wantDate)),
    `อยากได้ ${wantDate} ได้ "${$('#bookingCheckIn').value}"`);

  $('#activityTag').value = 'การเดินทาง';
  $('#activityTag').dispatchEvent(new w.Event('change'));
  check('ประเภทการเดินทาง → ชนิด FLIGHT · โชว์จาก/ถึง ซ่อนห้อง',
    $('#bookingKind').value === 'FLIGHT' && $('#bookingFrom').closest('label').hidden === false
    && $('#bookingRoom').closest('label').hidden === true);
  check('เปลี่ยนกลับจากที่พัก → เวลากลับเป็น 09:00', w.eval("timeValue('activityTime')") === '09:00');

  /* กรอกการจองที่พักแล้วอ่านกลับ */
  $('#activityTag').value = 'ที่พัก'; $('#activityTag').dispatchEvent(new w.Event('change'));
  $('#bookingVendor').value = 'Agoda'; $('#bookingRef').value = '2031426205';
  $('#bookingCheckIn').value = '2026-12-19'; $('#bookingCheckOut').value = '2026-12-20';
  $('#bookingCheckOut').dispatchEvent(new w.Event('input'));
  $('#bookingTravelers').value = '2A 1C(7)';
  const bf = $('#bookingAmenities button[data-amen="inc_breakfast"]');
  bf.click(); const lu = $('#bookingAmenities button[data-amen="inc_lunch"]'); lu.click(); lu.click();
  $('#bookingPayStatus input[value="PAID"]').checked = true;
  $('#bookingPayDate').value = '2026-12-03'; $('#bookingPayMethod').value = 'บัตร 3696'; $('#bookingCancel').value = '2026-12-04';
  const b = w.eval('readBookingForm()');
  check('อ่านฟอร์มได้ครบ: ผู้ขาย เลขจอง เช็กเอาต์ ผู้เข้าพัก',
    b && b.kind === 'HOTEL' && b.vendor === 'Agoda' && b.ref_no === '2031426205' && b.check_out === '2026-12-20' && b.travelers === '2A 1C(7)', JSON.stringify(b));
  check('แยกผู้เข้าพักเป็นตัวเลข 2 / 1 / อายุ 7', b?.adults === 2 && b?.children === 1 && b?.child_ages === '7');
  check('สวิตช์บริการ: แตะ 1 ครั้ง=มี · 2 ครั้ง=ไม่มี · ไม่แตะ=ไม่ทราบ',
    b?.inc_breakfast === 1 && b?.inc_lunch === 0 && b?.inc_dinner === null);
  check('การจ่าย: จ่ายแล้ว · วันจ่าย · จ่ายด้วย · ยกเลิกฟรีถึง',
    b?.pay_status === 'PAID' && b?.pay_date === '2026-12-03' && b?.pay_method === 'บัตร 3696' && b?.cancel_deadline === '2026-12-04');
  check('นับคืนให้อัตโนมัติ', $('#bookingNights').textContent === '1 คืน', `ได้ "${$('#bookingNights').textContent}"`);
  check('บรรทัดสรุปตอนพับบอกว่ามีอะไรอยู่ข้างใน', /Agoda #2031426205/.test($('#bookingHint').textContent));

  /* เปิดของเดิมที่มีการจอง → ฟอร์มกางเอง · ล้างหมดแล้ว = ส่ง null (ลบ) */
  /* เทสก่อนหน้าอาจลบสถานที่ตัวอย่างไปหมดแล้ว — สร้างตัวอย่างของตัวเองให้แน่ใจ */
  w.eval(`(() => {
    if (!planDays.some(d => d.activities.length)) {
      planDays[0].activities.push({ id:'activity-bk1', time:'15:00', endTime:'', name:'โรงแรมทดสอบ', detail:'', tag:'ที่พัก',
        cost:'—', bills:'', image:'', highlight:'', visitStatus:'PLANNED', plannedCost: 23339, plannedCurrency:'THB' });
    }
    const stop = planDays.find(d => d.activities.length).activities[0];
    stop.booking = { kind:'HOTEL', status:'BACKUP', vendor:'Trip.com', ref_no:'1622928888021958', check_in: planDays[0].date,
      check_out:'2099-01-02', room_desc:'ห้องสไตล์ญี่ปุ่น', pay_status:'UNPAID', cancel_deadline:'2099-01-01', inc_breakfast:1 };
    openPlanEditor(stop);
  })()`);
  check('เปิดของเดิมที่จองแล้ว → กล่องกางให้เอง', $('#bookingBox').open === true);
  check('สถานะสำรองถูกอ่านกลับ', $('#bookingStatus input:checked')?.value === 'BACKUP');
  check('เลขจอง 16 หลักไม่เพี้ยน', $('#bookingRef').value === '1622928888021958');
  $('#bookingClear').click();
  check('ล้างข้อมูลการจองแล้วบันทึก = ส่ง null (ลบการจองเดิม)', w.eval('readBookingForm()') === null);
  w.eval('closeLayers()');

  /* การ์ดในแผน */
  w.eval(`(() => {
    const day = planDays.find(d => d.activities.length);
    const stop = day.activities[0];
    if (!day.activities[1]) day.activities.push({ id:'activity-bk2', time:'16:00', endTime:'', name:'โรงแรมสำรอง', detail:'', tag:'ที่พัก',
      cost:'—', bills:'', image:'', highlight:'', visitStatus:'PLANNED', plannedCost: 8141.8, plannedCurrency:'THB' });
    stop.tag = 'ที่พัก';
    stop.booking = { kind:'HOTEL', status:'CONFIRMED', vendor:'Agoda', ref_no:'2031426205', check_in: day.date,
      check_out: planDays[1] ? planDays[1].date : day.date, room_desc:'Twin', pay_status:'PAID', pay_date:'2026-12-03',
      cancel_deadline:'2099-12-31', inc_breakfast:1, has_parking:1 };
    if (day.activities[1]) day.activities[1].booking = { kind:'HOTEL', status:'BACKUP', vendor:'Trip.com', ref_no:'99', pay_status:'UNPAID' };
    activePlanDayId = day.id;
    renderPlanWorkspace();
  })()`);
  const firstCard = $('#planList .plan-item');
  check('การ์ดโชว์ป้ายเลขจอง', /Agoda #2031426205/.test(firstCard?.textContent || ''));
  check('การ์ดโชว์ป้ายจ่ายแล้ว + ยกเลิกฟรีถึง',
    /จ่ายแล้ว/.test(firstCard?.textContent || '') && /ยกเลิกฟรีถึง/.test(firstCard?.textContent || ''));
  check('การ์ดโชว์ไอคอนบริการที่รวม', Boolean(firstCard?.querySelector('.plan-tags em.amen')));
  check('การจองสำรอง → การ์ดติดคลาส booking-backup', Boolean($('#planList .plan-item.booking-backup')));
  check('กล่องสรุปการจองโผล่ พร้อมปุ่มพิมพ์',
    $('#bookingSummary').hidden === false && Boolean($('#bookingSummary a[href^="print.html"]')));
  check('สรุปนับสำรองแยก ไม่รวมในจ่ายแล้ว', /สำรอง 1/.test($('#bookingSummary').textContent));

  /* ที่พักหลายคืน → วันถัดไปมีการ์ดเงา */
  const twoDays = w.eval('planDays.length > planDays.findIndex(d => d.activities.length) + 1');
  if (twoDays) {
    w.eval(`(() => {
      const i = planDays.findIndex(d => d.activities.length);
      const day = planDays[i];
      day.activities[0].booking.check_out = planDays[i + 2] ? planDays[i + 2].date : planDays[i + 1].date;
      activePlanDayId = planDays[i + 1].id;
      renderPlanWorkspace();
    })()`);
    const ghost = $('#planList .plan-ghost');
    check('ที่พัก 2 คืน → วันถัดไปมีการ์ดเงา "คืนที่ 2"', Boolean(ghost) && /คืนที่ 2/.test(ghost.textContent), ghost?.textContent);
    check('การ์ดเงาไม่ใช่ .plan-item (ไม่โดนลาก/แก้/ลบ)', !ghost?.classList.contains('plan-item'));
    ghost?.click();
    check('แตะการ์ดเงา → กระโดดไปวันเช็กอิน', w.eval('activePlanDayId === planDays.find(d => d.activities.length).id'));
  }

  /* เส้นตายยกเลิกใกล้ → แถบเตือน */
  w.eval(`(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    planDays.find(x => x.activities.length).activities[0].booking.cancel_deadline = d.toISOString().slice(0, 10);
    renderPlanWorkspace();
  })()`);
  check('เส้นตายยกเลิกฟรีอีก 2 วัน → แถบเตือนโผล่และเป็นสีด่วน',
    $('#bookingAlert').hidden === false && $('#bookingAlert').classList.contains('urgent'), $('#bookingAlert').textContent);
  check('หน้าพิมพ์มีจริงและใช้ api.js เวอร์ชันเดียวกับหน้าแผน',
    fs.existsSync(path.join(dir, 'print.html')) && (read('print.html').match(/api\.js\?v=(\d+)/) || [])[1] === (read('index.html').match(/api\.js\?v=(\d+)/) || [])[1]);
  check('หน้าพิมพ์มี @media print และขนาด A4', /@media print/.test(read('print.html')) && /size:A4/.test(read('print.html')));
  check('ไม่มี error ตอนรันการจอง', errors.length === 0, errors.slice(0, 2).join('\n     '));
}

console.log(`\n${fail === 0 ? '✅ หน้าเว็บรันผ่านทั้งหมด' : `❌ พบปัญหา ${fail} จุด — แก้ก่อน deploy`}\n`);
process.exit(fail ? 1 : 0);
