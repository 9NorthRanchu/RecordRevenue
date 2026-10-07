const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const $ = (selector, root = document) => root.querySelector(selector);

/* scrollIntoView is a no-op on a display:none element, so the active day tab
   has to be centred after the plan screen is actually visible — not inside
   renderPlanWorkspace(), which usually runs while the screen is still hidden. */
function scrollActiveDayTab() {
  $('#planDayTabs .active')?.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
  updateDayStrip();
}

/* ── แถบวันเลื่อนซ้ายขวาได้ (North 2026-09-07) ─────────────────────────
   ทริป 11 วันทำให้แถบวันยาวเกินจอ · สกรอลบาร์ถูกซ่อนไว้ตั้งแต่ต้น (ขี้เหร่)
   ผลคือบนจอมีการ์ดวันแรกโดนตัดครึ่งค้างอยู่ ไม่มีอะไรบอกว่าเลื่อนได้
   จึงเปิดทางไว้ให้ครบทุกแบบที่คนจะลอง: ปุ่มลูกศร · ลากด้วยเมาส์ · หมุนล้อ
   (บนมือถือปัดนิ้วได้อยู่แล้ว — ปุ่มลูกศรจึงถูกซ่อนด้วย CSS) */
function updateDayStrip() {
  const strip = $('#planDayStrip');
  const rail = $('#planDayTabs');
  if (!strip || !rail) return;
  const room = rail.scrollWidth - rail.clientWidth;
  strip.classList.toggle('can-prev', rail.scrollLeft > 4);
  strip.classList.toggle('can-next', room > 4 && rail.scrollLeft < room - 4);
}

{
  const rail = $('#planDayTabs');
  if (rail) {
    /* เลื่อนทีละ 80% ของหน้าจอ — เหลือการ์ดเดิมค้างไว้ให้เห็นว่าเลื่อนมาจากไหน
       ถ้าเลื่อนเต็มจอพอดี คนจะหลงว่ากระโดดไปคนละที่ */
    const step = () => Math.max(180, Math.round(rail.clientWidth * 0.8));
    const slide = direction => rail.scrollBy({ left: direction * step(), behavior: 'smooth' });
    $('#dayScrollPrev')?.addEventListener('click', () => slide(-1));
    $('#dayScrollNext')?.addEventListener('click', () => slide(1));
    rail.addEventListener('scroll', updateDayStrip, { passive: true });
    window.addEventListener('resize', updateDayStrip);

    /* หมุนล้อเมาส์บนแถบ = เลื่อนแนวนอน · แต่ถ้าสุดทางแล้วต้องปล่อยให้หน้าเลื่อนลง
       ตามปกติ ไม่งั้นเมาส์จะไปค้างอยู่ตรงนี้แล้วเลื่อนหน้าไม่ลงเลย */
    rail.addEventListener('wheel', event => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const room = rail.scrollWidth - rail.clientWidth;
      if (room <= 0) return;
      const next = rail.scrollLeft + event.deltaY;
      if (next < 0 || next > room) return;
      event.preventDefault();
      rail.scrollLeft = next;
    }, { passive: false });

    /* ลากด้วยเมาส์ (เฉพาะเมาส์ — นิ้วปัดได้เองอยู่แล้ว ถ้าดักด้วยจะไปสู้กับระบบ)
       🔴 ลากเสร็จต้องกลืน click ทิ้งหนึ่งครั้ง ไม่งั้นปล่อยมือตรงการ์ดไหน
          ก็กลายเป็นกดเปลี่ยนวัน (หรือเปิดฟอร์มแก้ไขวัน) โดยไม่ได้ตั้งใจ */
    let drag = null;
    let swallowClick = false;
    rail.addEventListener('pointerdown', event => {
      swallowClick = false;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { x: event.clientX, from: rail.scrollLeft, moved: false, id: event.pointerId };
    });
    rail.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 6) return;   // กันสั่นมือตอนกดปุ่มธรรมดา
        drag.moved = true;
        rail.classList.add('dragging');
        try { rail.setPointerCapture(drag.id); } catch { /* jsdom ไม่มีตัวนี้ */ }
      }
      rail.scrollLeft = drag.from - dx;
    });
    const endDrag = () => {
      if (!drag) return;
      swallowClick = drag.moved;
      drag = null;
      rail.classList.remove('dragging');
      updateDayStrip();
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(name => rail.addEventListener(name, endDrag));
    rail.addEventListener('click', event => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
}

function showScreen(name) {
  $$('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `screen-${name}`));
  $$('[data-screen]').forEach(button => button.classList.toggle('active', button.dataset.screen === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'plan') requestAnimationFrame(scrollActiveDayTab);
}

$$('[data-screen]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));

/* ปุ่มย้อนกลับบนหัวจอ — เดิมเป็นปุ่มเปล่าที่กดแล้วไม่เกิดอะไร
   ใช้ history.back() ก่อน เพื่อให้ session ของแท็บอยู่ครบเหมือนตอนเข้ามา
   ถ้าเปิดหน้านี้เป็นหน้าแรกของแท็บ (ไม่มีประวัติ) ค่อยพากลับแอปหลัก */
$('.back')?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '../index.html';
});

// หน้ารวมทริป — ?all=1 บอก trips.html ว่าตั้งใจมาดูรายการ ไม่ต้องเด้งกลับทริปล่าสุด
$('#allTripsBtn')?.addEventListener('click', () => { location.href = 'trips.html?all=1'; });

const mask = $('#sheetMask');
const sheet = $('#expenseSheet');
const dialog = $('#closeDialog');
const planEditor = $('#planEditor');

function openSheet() {
  if (blockedByClose('expenses')) return;
  mask.classList.add('open');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  resetQuickAdd();
  // ไม่มีขั้นตอนแล้ว — เลื่อนกลับบนสุดแทน เผื่อครั้งก่อนเลื่อนค้างไว้
  $('.quick-scroll')?.scrollTo({ top: 0 });
}

/* แก้บิลเดิม — ใช้ฟอร์มเดียวกับตอนจด ไม่สร้างฟอร์มที่สอง
   ⚠️ ต้องตั้ง editingBillId **หลัง** resetQuickAdd() เพราะ reset ล้างค่านี้ด้วย
      ถ้าตั้งก่อนจะกลายเป็นสร้างบิลใหม่แทนการแก้ โดยไม่มีอะไรฟ้อง */
function openExpenseForEdit(bill) {
  if (blockedByClose('expenses')) return;
  openSheet();
  editingBillId = bill.id;

  paintMoneyInput('#expenseAmount', bill.amount || '');
  $('#expenseDate').value = bill.date || '';
  $('#expenseDescription').value = bill.title === 'ค่าใช้จ่ายใหม่' ? '' : bill.title;
  if ($('#expenseActivity')) $('#expenseActivity').value = bill.activityId || '';
  if ($('#expensePayer')) $('#expensePayer').value = bill.payerId || '';
  if ($('#expenseOwner')) $('#expenseOwner').value = bill.ownerId || '';
  if ($('#walletSelect')) $('#walletSelect').value = bill.walletId || '';
  if ($('#visibility')) $('#visibility').value = bill.visibility || 'trip';
  expenseIcon = bill.image || '';
  expenseReceiptUrl = bill.receiptUrl || '';
  if ($('#expenseIconPreview') && expenseIcon) $('#expenseIconPreview').src = expenseIcon;

  $('#saveExpense').textContent = 'บันทึกการแก้ไข';
  refreshQuickAdd();
}

function closeLayers() {
  mask.classList.remove('open');
  [sheet, dialog, planEditor, $('#assetPicker'), $('#newTripDialog'), $('#currencyDialog'),
   $('#fundDialog'), $('#walletDialog'), $('#reopenDialog'), $('#presetDialog'),
   $('#copyPresetDialog'), $('#docDialog'), $('#iconSlicer'),
   $('#walletTotalsDialog'), $('#walletInfoDialog'), $('#memberDialog'),
   $('#dayDialog'), $('#imageViewer')].forEach(layer => {
    layer.classList.remove('open');
    layer.setAttribute('aria-hidden', 'true');
  });
}

/* เปิดหน้าต่างซ้อน — ปิดของเดิมก่อนเสมอ ไม่งั้นซ้อนกันสองชั้นแล้วปิดไม่ลง
   🔴 หน้าต่างใหม่ทุกอันต้องถูกเพิ่มในลิสต์ของ closeLayers() ข้างบนด้วย
      ไม่งั้นจะเปิดได้แต่ปิดไม่ได้ ซึ่งดูเหมือนแอปค้าง */
function openDialog(selector) {
  closeLayers();
  mask.classList.add('open');
  const layer = $(selector);
  if (!layer) return;
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeLayers();
});


$$('.add-expense').forEach(button => button.addEventListener('click', openSheet));
$('.sheet-close').addEventListener('click', closeLayers);
// `.dialog-close` is the absolutely-positioned × ; `.close-layer` is an inline
// cancel button. Keeping them separate stops cancel inheriting × 's position.
$$('.dialog-close, .close-layer').forEach(button => button.addEventListener('click', closeLayers));
mask.addEventListener('click', closeLayers);

$('#sharedToggle').addEventListener('click', event => {
  event.currentTarget.classList.toggle('on');
  splitMode = event.currentTarget.classList.contains('on') ? 'equal' : 'none';
  $$('#splitMode button').forEach(button => button.classList.toggle('active', button.dataset.split === splitMode));
  refreshQuickAdd();
});

/* Fallback art per kind, so a wallet or currency created before icons existed
   still renders something instead of a broken image box. */
const DEFAULT_ICONS = { wallet:'art/icons/wallet_classic.svg', currency:'art/icons/coin_usd.svg' };
const CURRENCY_ICON_BY_CODE = {
  JPY:'art/icons/coin_jpy.svg', THB:'art/icons/coin_thb.svg', USD:'art/icons/coin_usd.svg',
  EUR:'art/icons/coin_eur.svg', KRW:'art/icons/coin_krw.svg', GBP:'art/icons/coin_gbp.svg',
  CNY:'art/icons/coin_cny.svg', SGD:'art/icons/coin_sgd.svg', AUD:'art/icons/coin_aud.svg',
  TWD:'art/icons/coin_twd.svg', VND:'art/icons/coin_vnd.svg', MYR:'art/icons/coin_myr.svg'
};

const exchangeRate = 0.232;
const TRIP_BUDGET_THB = 120000;
/* Who the app is being viewed as. Switchable from the "เพิ่มเติม" screen so the
   visibility rules can actually be checked, instead of taken on trust. */
let viewerId = 'north';

/* Trip members. `ledgerMode` is the single source of truth for whether a bill
   posts to the family's main ledger — it is never inferred from a display
   string, so renaming a member can't silently reclassify their money. */
const TRIP_END_DATE = '2027-02-19';

let members = [
  { id:'north', name:'North',  ledgerMode:'MAIN',      role:'ผู้ดูแล', admin:true },
  { id:'nimz',  name:'Nimz',   ledgerMode:'MAIN',      role:'สมาชิก' },
  { id:'ann',   name:'Ann',    ledgerMode:'TRIP_ONLY', role:'ผู้ร่วมทริป' },
  { id:'mew',   name:'Mew',    ledgerMode:'TRIP_ONLY', role:'ผู้ร่วมทริป' }
];

/* Wallets belong to a member. The wallet a bill is drawn from is recorded
   separately from who paid and whose money it was — the three can differ
   (North taps his own card to cover a bill that is really Ann's expense). */
let wallets = [
  { id:'w-north-jpy', ownerId:'north', label:'YouTrip JPY', currency:'JPY', icon:'art/icons/wallet_classic.svg' },
  { id:'w-north-thb', ownerId:'north', label:'YouTrip THB', currency:'THB', icon:'art/icons/wallet_mint.svg' },
  { id:'w-ann-jpy',   ownerId:'ann',   label:'กระเป๋า Ann', currency:'JPY', icon:'art/icons/wallet_pouch.svg' }
];

const categoryIcons = {
  'อาหาร':'ic_ramen.png', 'ที่พัก':'ic_hotel.png', 'ช้อปปิ้ง':'ic_gift.png',
  'เดินทาง':'ic_train.png', 'กิจกรรม':'act_marimo.png', 'เครื่องดื่ม':'st_camera2.png', 'อื่น ๆ':'st_camera2.png'
};
const categoryNames = Object.keys(categoryIcons);

const memberById = id => members.find(member => member.id === id);
const walletById = id => wallets.find(wallet => wallet.id === id);
const memberName = id => memberById(id)?.name || '—';
const isTripOnly = ownerId => memberById(ownerId)?.ledgerMode === 'TRIP_ONLY';

function seedBills() {
  return [
    { id:'hotel-sounkyo', title:'Hotel Sounkyo', amount:80000, currency:'JPY',
      payerId:'ann', ownerId:'ann', walletId:'w-ann-jpy',
      categories:[{ name:'ที่พัก', amount:72000 }, { name:'อาหาร', amount:8000 }],
      visibility:'trip', shared:true, splitMode:'equal',
      participants:[{ memberId:'north', amount:20000 },{ memberId:'nimz', amount:20000 },{ memberId:'ann', amount:20000 },{ memberId:'mew', amount:20000 }],
      activityId:'sounkyo' },
    { id:'crab-dinner', title:'มื้อเย็นร้านปู', amount:24000, currency:'JPY',
      payerId:'north', ownerId:'north', walletId:'w-north-jpy',
      categories:[{ name:'อาหาร', amount:24000 }],
      visibility:'trip', shared:true, splitMode:'equal',
      participants:[{ memberId:'north', amount:6000 },{ memberId:'nimz', amount:6000 },{ memberId:'ann', amount:6000 },{ memberId:'mew', amount:6000 }],
      activityId:'ainu-kotan' },
    { id:'personal-gift', title:'ของฝากส่วนตัว', amount:8500, currency:'JPY',
      payerId:'north', ownerId:'north', walletId:'w-north-jpy',
      categories:[{ name:'ช้อปปิ้ง', amount:8500 }],
      visibility:'private', shared:false, splitMode:'equal',
      participants:[{ memberId:'north', amount:8500 }], activityId:'akan-lake' }
  ];
}

/* Funding lots per wallet. Average rate is Σ THB ÷ Σ foreign across every lot,
   matching how the production trip-finance code weights a trip's rate. */
function seedFundings() {
  return [
    { id:'f1', walletId:'w-north-jpy', date:'2027-02-05', thb:34800, foreign:150000, note:'เติมจากบัญชีหลัก' },
    { id:'f2', walletId:'w-north-jpy', date:'2027-02-11', thb:23400, foreign:100000, note:'เติมระหว่างทริป' },
    { id:'f3', walletId:'w-north-thb', date:'2027-02-05', thb:12000, foreign:12000, note:'เติมเงินบาท' },
    { id:'f4', walletId:'w-ann-jpy',   date:'2027-02-06', thb:20880, foreign:90000, note:'Ann เติมเอง' }
  ];
}
let fundings = seedFundings();

let bills = seedBills();
let activeBillFilter = 'all';
// '' = ทุกคน · มิฉะนั้นคือ member_id ของ "คนจ่าย" ที่เลือกอยู่
let activeBillPayer = '';
// วันที่ที่เลือกดูอยู่ · '' = ทุกวัน
let activeBillDate = '';
const MEMBER_TINT = { north:'#f6bfd0', nimz:'#c8e5ed', ann:'#f0dfbf', mew:'#c4e3cd' };

/* ── Number formatting ────────────────────────────────────────────────
   House rule: thousands separated, negatives wrapped in parentheses
   (accounting style) rather than carrying a minus sign.
   Applies to money and counts. Temperatures keep their minus sign —
   "(6)°" would read as a bookkeeping figure, not weather. */
function fmtAmount(value, symbol = '') {
  const rounded = Math.round(Math.abs(value));
  const body = `${symbol}${rounded.toLocaleString('en-US')}`;
  return value < 0 ? `(${body})` : body;
}
/* ตัวเลขเงินในฟอร์มบิลต้องเห็นสตางค์เสมอ และคั่นหลักพัน เช่น ¥1,234.00
   แยกจาก fmtAmount เพราะตัวเดิมใช้กับจำนวนบิล/จำนวนวันด้วย ซึ่งไม่ควรเป็น 3.00 */
function fmtMoney(value, symbol = '') {
  const numeric = Number(value) || 0;
  const body = `${symbol}${Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })}`;
  return numeric < 0 ? `(${body})` : body;
}
/* เหมือน fmtMoney แต่วางสัญลักษณ์สกุลเงินไว้ "หลัง" ตัวเลข
   (North 2026-08-22: ทั้งหน้าบิลและหน้ากระเป๋าให้หน่วยอยู่หลังตัวเลขทุกที่)
   ยังคงวงเล็บแบบบัญชีสำหรับค่าติดลบเหมือนเดิม */
function fmtMoneyUnit(value, symbol = '') {
  const numeric = Number(value) || 0;
  const body = `${Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })}${symbol ? ` ${symbol}` : ''}`;
  return numeric < 0 ? `(${body})` : body;
}

const fmtTwoDecimals = value => (Number(value) || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
/* ยอดบาทแบบ "มีเครื่องหมาย + หน่วยต่อท้าย + ทศนิยม 2 ตำแหน่ง" (North 2026-08-22)
   ต่างจาก fmtAmount ที่ใช้วงเล็บแบบบัญชีและวางสัญลักษณ์ไว้หน้า

   เจตนาคนละอย่างกัน: fmtAmount ใช้กับยอดในรายการที่คนไล่อ่านทีละบรรทัด
   ส่วนตัวนี้ใช้กับ "ยอดสรุป" ที่คนมองแวบเดียวแล้วต้องรู้ทันทีว่าบวกหรือลบ
   สีจึงต้องมาคู่กับเครื่องหมายเสมอ ไม่ใช่สีอย่างเดียว — คนตาบอดสีจะอ่านไม่ออก
   และโปรแกรมอ่านหน้าจอก็อ่านสีไม่ได้ */
function signedBaht(value) {
  const numeric = Number(value) || 0;
  const body = `${Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })} ฿`;
  /* 🔴 ติดลบใช้วงเล็บแบบบัญชี ไม่ใช่เครื่องหมายลบ — เป็นกติกาของทั้งแอป
     เครื่องหมาย − ตัวเดียวหายไปได้ง่ายเวลาพิมพ์ ถ่ายรูป หรืออ่านเร็ว ๆ
     วงเล็บสองตัวคร่อมไว้ทำให้พลาดยากกว่ามาก */
  return {
    text: numeric < 0 ? `(${body})` : `${numeric > 0 ? '+' : ''}${body}`,
    cls: numeric > 0 ? 'up' : (numeric < 0 ? 'down' : 'flat')
  };
}
/* plus = แสดงเครื่องหมาย + หน้าจำนวนบวกด้วยหรือไม่
   ใช้ true เฉพาะ "ยอดสรุป" ที่ตัวเลขลอยเดี่ยว ๆ · ในบรรทัดสมการ
   (25,000.00 ¥ @ 0.2384 ฿ = 5,960.00 ฿) เครื่องหมาย + จะอ่านเหมือนบวกเลข */
const signedBahtHtml = (value, plus = true) => {
  const row = signedBaht(value);
  return `<span class="signed ${row.cls}">${plus ? row.text : row.text.replace(/^\+/, '')}</span>`;
};

/* จำนวนเงิน · คั่นหลักพัน · **ทศนิยม 2 ตำแหน่งเสมอ** · หน่วยต่อท้าย · ติดลบใส่วงเล็บ
   วางหน่วยไว้หลังตัวเลขให้เหมือนฝั่งบาท ตาจะได้กวาดคอลัมน์เดียวกันได้

   🔴 เดิมตัวนี้ปัดเศษทิ้งทั้งหมด (¥5,000 ไม่ใช่ ¥5,000.00) ด้วยเหตุผลว่าอ่านเร็วกว่า
      North สั่งเปลี่ยน 2026-08-23: ยอดเงินทุกที่ต้องมีจุลภาคและทศนิยม 2 หลัก
      เหตุผลคือมันคือ "เงิน" — ตัวเลขที่ปัดแล้วกับตัวเลขจริงต่างกันได้ถึงหนึ่งบาท
      ต่อรายการ และเวลาเอาไปเทียบกับสมุดบัญชีหลักจะหาไม่เจอว่าต่างตรงไหน

   ⚠️ ใช้กับ "เงิน" เท่านั้น · จำนวนบิล/จำนวนวันใช้ fmtAmount ซึ่งไม่มีทศนิยม
      และ "เรท" ใช้ toFixed(4) เพราะเป็นอัตรา ไม่ใช่ยอดเงิน */
function unitAmount(value, symbol) {
  const numeric = Number(value) || 0;
  const body = `${Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })}${symbol ? ` ${symbol}` : ''}`;
  return numeric < 0 ? `(${body})` : body;
}
const unitBaht = value => unitAmount(value, '฿');
// เดิมเป็นคนละตัวเพราะทศนิยมต่างกัน · ตอนนี้กติกาเดียวกันแล้ว จึงเป็นชื่อพ้อง
const nativeAmount = (value, symbol) => unitAmount(value, symbol);

/* ── ช่องกรอกเงิน: คั่นหลักพันให้เอง ──────────────────────────────────
   พิมพ์ 56000 แล้วออกจากช่อง → เห็น 56,000.00 · กลับเข้าไปแก้ → กลับเป็น 56000
   ทำตอน blur ไม่ใช่ตอนพิมพ์ เพราะแทรกจุลภาคระหว่างพิมพ์จะทำให้ตำแหน่ง
   เคอร์เซอร์กระโดด ซึ่งพิมพ์ผิดง่ายกว่าเดิมมาก

   ทุกจุดที่อ่านค่ากลับใช้ `.replace(/[^\d.]/g, '')` อยู่แล้ว จุลภาคจึงไม่กระทบ */
const parseMoneyInput = text => Number(String(text ?? '').replace(/[^\d.]/g, '')) || 0;

function attachMoneyInput(selector) {
  const node = typeof selector === 'string' ? $(selector) : selector;
  if (!node || node.dataset.moneyInput) return;
  node.dataset.moneyInput = '1';
  node.addEventListener('focus', () => {
    const raw = parseMoneyInput(node.value);
    node.value = raw ? String(raw) : '';
  });
  node.addEventListener('blur', () => {
    const raw = parseMoneyInput(node.value);
    node.value = raw ? raw.toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }) : '';
  });
}
// เรียกหลังใส่ค่าลงช่องด้วยโปรแกรม (เปิดฟอร์มแก้ไข) เพราะ blur ไม่เกิดเอง
function paintMoneyInput(selector, value) {
  const node = typeof selector === 'string' ? $(selector) : selector;
  if (!node) return;
  const numeric = Number(value);
  node.value = Number.isFinite(numeric) && numeric
    ? numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
}

const yen = value => fmtAmount(value, '¥');
const thb = value => fmtAmount(value, '฿');
/* สัญลักษณ์สกุลเงิน — เดิมคืนได้แค่ ฿ กับ ¥ ทุกสกุลที่ไม่ใช่บาทจึงกลายเป็นเยน
   ทั้งที่ทริปประกาศสกุลอื่นไว้ได้ (วอน ดอลลาร์ ยูโร) เงินวอน 84,000 ที่ขึ้นว่า
   ¥84,000 คือตัวเลขที่อ่านแล้วเชื่อได้เลยว่าผิด — อ่านจากที่ทริปประกาศไว้ก่อน
   แล้วค่อยถอยไปตารางกลาง สุดท้ายใช้รหัสสกุลตรง ๆ ดีกว่าเดาสัญลักษณ์ผิด */
const FALLBACK_SYMBOLS = { THB:'฿', JPY:'¥', CNY:'¥', KRW:'₩', USD:'$', EUR:'€', GBP:'£', TWD:'NT$', VND:'₫', SGD:'S$', HKD:'HK$', AUD:'A$', MYR:'RM', PHP:'₱', INR:'₹' };
function symbolFor(currency) {
  const code = String(currency || '').toUpperCase();
  return currencyByCode(code)?.symbol || FALLBACK_SYMBOLS[code] || `${code} `;
}

/* สีประจำสกุลเงิน (2026-08-22) — North: "แต่ละค่าเงินมีสีต่างกัน"
   คนถือหลายกระเป๋าหลายสกุลพร้อมกัน ยอดที่หน้าตาเหมือนกันหมดทำให้หยิบผิดใบง่าย
   ⚠️ สกุลที่ไม่ได้อยู่ในตารางต้องได้สี "คงที่" จาก hash ของรหัส ไม่ใช่สุ่ม
      ถ้าสีเปลี่ยนทุกครั้งที่วาดใหม่ จะสับสนหนักกว่าไม่มีสีเลย */
const CURRENCY_HUES = { JPY:340, KRW:222, THB:172, USD:145, EUR:264, TWD:28, CNY:8, GBP:292, SGD:198, HKD:48, VND:96, MYR:188, AUD:120, PHP:16, INR:36 };
function currencyHue(code) {
  const key = String(code || '').toUpperCase();
  if (CURRENCY_HUES[key] !== undefined) return CURRENCY_HUES[key];
  let hash = 7;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
  return hash;
}

function baht(value) {
  return fmtAmount(value * exchangeRate, '฿ ');
}

/* Weighted average cost of a wallet's money: Σ THB ÷ Σ foreign over every
   funding lot, exactly as production's computeTripWallets() does. Funding
   dates deliberately play no part — the rate is recomputed from scratch each
   time, so a lot entered late (or backdated) lands on the same answer as one
   entered on the day. The trade-off is that already-recorded expenses are
   restated when a new lot appears, which is fine because the baht value is
   only locked when the trip closes.
   Returns null when nothing has been funded yet — callers must not invent a
   rate, or the user sees a plausible number the system actually guessed. */
/* ล็อตเติมเงินของกระเป๋าใบหนึ่ง · ใหม่ → เก่าเสมอ
   🔴 เรียงตามวันที่ที่เกิดจริง ไม่ใช่ลำดับที่บันทึกลงระบบ
      คนมักลืมจดแล้วมาใส่ย้อนหลัง ถ้าเรียงตามลำดับบันทึก ล็อตเก่าจะไปอยู่ล่างสุด
      ทั้งที่เกิดก่อน — อ่านประวัติแล้วสับสนว่าเติมอะไรก่อนหลัง
   ⚠️ ลำดับไม่มีผลกับ "เรทเฉลี่ยถ่วงน้ำหนัก" เพราะเป็นผลรวมหารผลรวม
      (มีเทสคุมไว้ใน money.test.mjs) — ตรงนี้เปลี่ยนแค่การแสดงผล */
function lotsOf(walletId) {
  return fundings
    .filter(row => row.walletId === walletId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.id || '').localeCompare(String(a.id || '')));
}

function walletRate(walletId) {
  const lots = fundings.filter(row => row.walletId === walletId);
  if (!lots.length) return null;
  const foreign = lots.reduce((sum, row) => sum + row.foreign, 0);
  return foreign ? lots.reduce((sum, row) => sum + row.thb, 0) / foreign : null;
}

/* Currencies declared for this trip. `planRate` is the rate the family expects
   before any money is actually exchanged — having it means a brand-new trip can
   still show baht figures, honestly labelled as an estimate, instead of either
   refusing to convert or silently inventing a rate. */
let tripCurrencies = [
  { code:'THB', symbol:'฿', label:'บาทไทย', planRate:1, base:true, icon:'art/icons/coin_thb.svg' },
  { code:'JPY', symbol:'¥', label:'เยนญี่ปุ่น', planRate:0.2320, icon:'art/icons/coin_jpy.svg' }
];
let tripClosed = false;
let postingDate = '';
let tripLog = [];
/* โหมดข้อมูลจริง (?live=1) — ประกาศไว้บนสุดโดยตั้งใจ เพราะ applyTripLock()
   ถูกเรียกตั้งแต่ตอน render รอบแรก ถ้าประกาศไว้ท้ายไฟล์จะชน TDZ */
let liveMode = false;
/* วันจบทริปจริงจาก Projects.end_date — TRIP_END_DATE เป็นค่าสมมติของข้อมูล
   ตัวอย่าง (ก.พ. 2027) ถ้าเผลอใช้ตัวนั้นตอนปิดทริปจริงจะลงบัญชีผิดงวดทั้งทริป */
let liveTripEndDate = '';
// สิทธิ์จัดการทริปจากเซิร์ฟเวอร์ — รวมผู้ดูแลระบบครอบครัวที่ไม่ได้เป็นสมาชิกทริป
let liveCanManage = false;
let liveCanManageMembers = false;
let liveCanManageSharedSettings = false;

const currencyByCode = code => tripCurrencies.find(row => row.code === code);

/* Where a rate came from matters as much as its value, so this returns the
   provenance too and the UI labels it:
     base    — the trip's own currency, no conversion
     actual  — weighted average of real funding lots, still moves until close
     planned — the declared estimate, no money exchanged yet
     locked  — frozen at trip close
     none    — nothing to go on; never guess */
function rateInfo(currencyCode, walletId) {
  const currency = currencyByCode(currencyCode);
  if (currency?.base) return { rate:1, source:'base' };
  if (tripClosed) {
    const locked = walletId ? walletById(walletId)?.lockedRate : null;
    return { rate: locked ?? walletRate(walletId) ?? currency?.planRate ?? null, source:'locked' };
  }
  const actual = walletId ? walletRate(walletId) : null;
  if (actual !== null) return { rate: actual, source:'actual' };
  if (currency?.planRate) return { rate: currency.planRate, source:'planned' };
  return { rate: null, source:'none' };
}

const RATE_BADGES = {
  actual:  { text:'เรทยังไม่นิ่ง · จะล็อกตอนปิดทริป', cls:'live' },
  planned: { text:'เรทประมาณการ · ยังไม่มีการเติมเงินจริง', cls:'planned' },
  locked:  { text:'ล็อกแล้วเมื่อปิดทริป', cls:'locked' },
  none:    { text:'ยังคำนวณมูลค่าเป็นบาทไม่ได้', cls:'none' }
};

function rateBadge(source) {
  const badge = RATE_BADGES[source];
  return badge ? `<span class="rate-badge ${badge.cls}">${badge.text}</span>` : '';
}

/* Bills in a THB wallet are already baht. Foreign bills are valued at their
   own wallet's cost basis, not one trip-wide constant — two wallets funded at
   different times genuinely hold money of different cost. */
function billBaht(bill) {
  const info = rateInfo(bill.currency, bill.walletId);
  return info.rate === null ? 0 : bill.amount * info.rate;
}

// Bills still valued at an estimate, and bills that can't be valued at all.
const billsBySource = (list, source) =>
  list.filter(bill => rateInfo(bill.currency, bill.walletId).source === source);

function billAmountLabel(bill) {
  return unitAmount(bill.amount, symbolFor(bill.currency));
}

const participantIdsOf = bill => (bill.participants || []).map(row => row.memberId);

function billVisibilityLabel(bill) {
  const people = participantIdsOf(bill).length;
  if (bill.visibility === 'private') return 'ส่วนตัว';
  if (bill.visibility === 'selected') return bill.shared ? `ผู้เกี่ยวข้อง · แบ่ง ${people} คน` : 'เฉพาะผู้เกี่ยวข้อง';
  return bill.shared ? `ทุกคนเห็น · แบ่ง ${people} คน` : 'ทุกคนเห็น';
}

/* วันที่แบบ DD MMM YYYY (11 Dec 2026)
   🔴 en-GB เท่านั้น ห้าม th-TH — Intl จะแปลง 2026 เป็น พ.ศ. 2569
      แล้วผู้ใช้จะเห็นเลขปีคนละชุดกับที่กรอกในฟอร์ม (ซึ่งเป็น ค.ศ. เสมอ) */
function billDateLabel(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? (iso || 'ไม่ระบุวันที่')
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function billCategoryLabel(bill) {
  return bill.categories.map(row => `${row.name} ${unitAmount(row.amount, symbolFor(bill.currency))}`).join(' · ');
}

/* An explicitly chosen icon wins; otherwise fall back to the category's own
   icon (ครอบครัวตั้งเองผ่านหน้า "เพิ่มเติม" ถ้ามี) แล้วค่อยตกไปที่ชุดไอคอนเดิม */
function billIcon(bill) {
  const line = bill.categories[0];
  return bill.image || line?.icon || categoryIconOverride(line?.presetId)
    || `${ART}${categoryIcons[line?.name] || 'st_camera2.png'}`;
}

/* Visibility gate — the prototype only ever renders what the signed-in member
   is allowed to see, so PRIVATE bills of other members never reach the DOM. */
function canSee(bill, viewer = viewerId) {
  if (bill.visibility === 'trip') return true;
  if (bill.ownerId === viewer || bill.payerId === viewer) return true;
  if (bill.visibility === 'selected') return participantIdsOf(bill).includes(viewer);
  return false;
}

/* ── หน้าบิลแบบแดชบอร์ด (2026-08-22) ──────────────────────────────────
   🔴 กติกาการคิดเงินหลายสกุล — ห้ามแก้โดยไม่อ่านตรงนี้

   1. บวก ¥ กับ ₩ ตรง ๆ ไม่ได้ → ยอดรวมเป็น "บาท" เสมอ
   2. เรทผูกกับ **กระเป๋า** ไม่ใช่สกุลเงิน — กระเป๋าเยนสองใบที่เติมคนละวัน
      มีต้นทุนจริงต่างกัน · ห้ามเอายอดรวมเยนไปคูณเรทเดียวเด็ดขาด
      ต้องบวก billBaht() ของแต่ละบิลที่คิดด้วยเรทของกระเป๋าตัวเองแล้ว
   3. บิลที่ไม่มีเรทเลย billBaht() คืน 0 → **หายจากยอดรวมเงียบ ๆ**
      ทุกที่ที่โชว์ยอดรวมต้องบอกด้วยว่ามีกี่บิลที่ตีเป็นบาทไม่ได้
      ไม่งั้นตัวเลขบนจอต่ำกว่าจริงโดยไม่มีใครรู้ */

/* totalsByCurrency / settlementRows / planTransfers / categoryTotals
   อยู่ใน money.js (โหลดก่อนไฟล์นี้) — แยกไว้เพราะเป็นเรื่องเงินจริง
   ต้องเทสได้โดยไม่ต้องมีเบราว์เซอร์ · ดู backend/test/money.test.mjs */

/* แยกบิลตามความน่าเชื่อถือของเรท เพื่อบอกผู้ใช้ว่ายอดนี้แน่แค่ไหน */
function rateBreakdown(list) {
  const solid = [], estimated = [], unknown = [];
  list.forEach(bill => {
    const source = rateInfo(bill.currency, bill.walletId).source;
    if (source === 'none') unknown.push(bill);
    else if (source === 'planned') estimated.push(bill);
    else solid.push(bill);
  });
  const sum = rows => rows.reduce((total, bill) => total + billBaht(bill), 0);
  return { solid, estimated, unknown, solidThb: sum(solid), estimatedThb: sum(estimated) };
}

/* วันที่เหลือของทริป — ใช้บอกว่าใช้ได้อีกวันละเท่าไร
   นับจากวันนี้ถึงวันจบ · ทริปที่จบไปแล้วคืน 0 ไม่ใช่เลขติดลบ */
function daysLeftInTrip() {
  const end = liveTripEndDate || planDays[planDays.length - 1]?.date;
  if (!end) return 0;
  /* 🔴 คืน 0 ถ้าแปลงวันไม่ได้ ห้ามคืน NaN — ค่าที่ออกไปถูกเอาไปหาร
     (`left / days` ในแถบงบ) ถ้าเป็น NaN ยอด "ใช้ได้อีกวันละ" จะเพี้ยนทั้งแถบ
     และ NaN เป็น falsy จึงไปเข้าเงื่อนไข "ทริปจบแล้ว" ทั้งที่ยังไม่จบ */
  const diff = Math.ceil((new Date(`${end}T23:59:59`) - Date.now()) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}

function renderBudgetHero(readable) {
  const { estimated, unknown, solidThb, estimatedThb } = rateBreakdown(readable);
  const spent = solidThb + estimatedThb;
  const budget = TRIP_BUDGET_THB;
  const left = budget - spent;
  const days = daysLeftInTrip();
  const pctSolid = budget > 0 ? Math.min(100, solidThb / budget * 100) : 0;
  const pctEst = budget > 0 ? Math.min(100 - pctSolid, estimatedThb / budget * 100) : 0;

  const chips = totalsByCurrency(readable)
    .map(([code, amount]) => `<span>${unitAmount(amount, symbolFor(code))}</span>`).join('');

  $('#budgetHero').innerHTML = `
    <div class="budget-label">ใช้ไปแล้วทั้งทริป · ตีเป็นเงินบาท</div>
    <div class="budget-amount"><strong>${unitBaht(spent)}</strong>${
      budget > 0 ? `<span>/ ${unitBaht(budget)}</span>` : ''}</div>
    ${chips ? `<div class="budget-currencies">${chips}</div>` : ''}
    ${budget > 0 ? `
      <div class="budget-bar"><i style="width:${pctSolid}%"></i><u style="width:${pctEst}%"></u></div>
      <div class="budget-foot">
        <span>${left >= 0 ? `เหลือ ${unitBaht(left)}` : `เกินงบ ${unitBaht(-left)}`}</span>
        <span>${days ? `เหลือ ${days} วัน · ใช้ได้อีกวันละ ${unitBaht(left / days)}` : 'ทริปจบแล้ว'}</span>
      </div>` : ''}`;
  $('#budgetHero').classList.toggle('over', budget > 0 && left < 0);

  /* ป้ายเตือน — เรียงตามความร้ายแรง อันที่ทำให้ตัวเลขผิดต้องอยู่บนสุด */
  const alerts = [];
  if (unknown.length) {
    const codes = [...new Set(unknown.map(bill => unitAmount(unknown
      .filter(row => row.currency === bill.currency)
      .reduce((sum, row) => sum + row.amount, 0), symbolFor(bill.currency))))].join(' · ');
    alerts.push(`<div class="rate-alert danger">
      <b>${unknown.length} บิลยังตีเป็นบาทไม่ได้ — ยอดข้างบนจึงต่ำกว่าจริง</b>
      <small>${codes} ยังไม่มีทั้งเรทประมาณการและการเติมเงินจริง</small></div>`);
  }
  if (estimated.length) {
    alerts.push(`<div class="rate-alert warn">
      <b>${unitBaht(estimatedThb)} ของยอดนี้ใช้เรทประมาณการ</b>
      <small>กระเป๋าที่จ่ายยังไม่มีการเติมเงินจริง · ตัวเลขจะขยับเมื่อเติมเงินแล้ว</small></div>`);
  }
  if (!alerts.length && readable.length) {
    alerts.push(`<div class="rate-alert calm"><b>${tripClosed
      ? 'เรทถูกล็อกไว้ที่ค่าตอนปิดทริป · ตัวเลขจะไม่ขยับอีก'
      : 'ทุกบิลใช้เรทจริงของกระเป๋า · เรทยังไม่นิ่ง จะล็อกตอนปิดทริป'}</b></div>`);
  }
  $('#rateAlerts').innerHTML = alerts.join('');
}

/* ── ใช้ไปกับอะไรบ้าง ─────────────────────────────────────────────────
   ⚠️ หมวดที่แปลงเป็นบาทไม่ได้ต้องขึ้น "—" ไม่ใช่ "฿ 0"
      ฿0 แปลว่าไม่ได้ใช้เงิน ซึ่งคนละเรื่องกับ "ใช้ไปแต่ยังตีมูลค่าไม่ได้" */
function renderCategoryBars(readable) {
  const convertible = bill => rateInfo(bill.currency, bill.walletId).source !== 'none';
  const rows = categoryTotals(readable, billBaht, convertible).slice(0, 6);
  const top = Math.max(...rows.map(row => row.thb), 1);
  const total = rows.reduce((sum, row) => sum + row.thb, 0);

  $('#categoryBlock').hidden = !rows.length;
  $('#categoryBars').innerHTML = rows.map(row => {
    const native = [...row.native.entries()].map(([code, amount]) => unitAmount(amount, symbolFor(code))).join(' · ');
    const pct = total > 0 ? Math.round(row.thb / total * 100) : 0;
    return `
    <div class="cat-row${row.convertible ? '' : ' unknown'}">
      <span class="cat-icon">${row.icon ? `<img src="${row.icon}" alt="">` : '💰'}</span>
      <span class="cat-main">
        <span class="cat-line"><b>${row.name}</b><small>${row.convertible ? `${pct}% · ${native}` : `${native} · ยังไม่มีเรท`}</small></span>
        <span class="cat-bar"><i style="width:${Math.max(4, row.thb / top * 100)}%"></i></span>
      </span>
      <span class="cat-thb">${row.convertible ? unitBaht(row.thb) : '—'}</span>
    </div>`;
  }).join('');
}

/* ── ใครจ่ายไปเท่าไร และใครติดใคร ─────────────────────────────────────
   ยอดค้าง = (ส่วนที่ตัวเองต้องรับผิดชอบ) − (เงินที่ตัวเองควักออกไปจริง)
   บวก = ยังต้องจ่ายคืนคนอื่น · ลบ = ควักเกินไป รอรับคืน */
function renderPeopleAndSettlement(readable) {
  const rows = settlementRows(members.map(m => m.id), readable, billBaht)
    .map(row => ({ ...row, member: members.find(m => m.id === row.memberId) }));
  const faces = { north:'#f6bfd0', nimz:'#c8e5ed', ann:'#f0dfbf', mew:'#c4e3cd' };

  $('#peopleGrid').innerHTML = rows.map(row => `
    <div class="person-card">
      ${row.member.avatar
        ? `<img class="person-face photo" src="${row.member.avatar}" alt="">`
        : `<span class="person-face" style="background:${faces[row.member.id] || '#e6f0fa'}">${row.member.name[0]}</span>`}
      <small>${row.member.name} จ่ายไป</small>
      <b>${unitBaht(row.paid)}</b>
      <em class="${row.balance > 1 ? 'owe' : (row.balance < -1 ? 'get' : 'even')}">${
        row.balance > 1 ? `ต้องจ่าย ${unitBaht(row.balance)}`
        : row.balance < -1 ? `ได้คืน ${unitBaht(-row.balance)}`
        : 'เท่ากันพอดี'}</em>
    </div>`).join('');

  const transfers = planTransfers(rows);

  $('#settleBlock').hidden = !transfers.length;
  $('#settleList').innerHTML = transfers.map(row => `
    <div class="settle-row">
      ${memberById(row.from)?.avatar
        ? `<img class="person-face photo" src="${memberById(row.from).avatar}" alt="">`
        : `<span class="person-face" style="background:${faces[row.from] || '#e6f0fa'}">${memberName(row.from)[0]}</span>`}
      <span>${memberName(row.from)} ติด ${memberName(row.to)}</span>
      <b>${unitBaht(row.amount)}</b>
    </div>`).join('');
}

/* ── ปุ่มบนการ์ดบิล (2026-08-22) ───────────────────────────────────────
   เดิมเป็นกล่องรายละเอียดที่ต้องกดเข้าไปดู · เอาออกแล้วย้ายทุกอย่างมาไว้
   บนการ์ดโดยตรง ตามที่ North สั่ง — ข้อมูลอยู่ตรงหน้า ไม่ต้องกดสองชั้น
   เหลือไว้แค่ตัวดูสลิปเต็มจอ เพราะรูปเล็ก 44px อ่านตัวเลขบนสลิปไม่ออกจริง ๆ */

/* ผูก handler ที่ตัวรายการทีเดียว ไม่ผูกทีละการ์ด
   เพราะรายการถูกวาดใหม่ทุกครั้งที่กรอง handler รายใบจะหลุดตามไปด้วย */
$('#billTable').addEventListener('click', async event => {
  const slip = event.target.closest('[data-receipt]');
  if (slip) {
    closeLayers();
    $('#imageViewerBody').innerHTML = `<img src="${slip.dataset.receipt}" alt="เอกสารแนบขนาดเต็ม">`;
    mask.classList.add('open');
    $('#imageViewer').classList.add('open');
    $('#imageViewer').setAttribute('aria-hidden', 'false');
    return;
  }

  const edit = event.target.closest('[data-edit-bill]');
  if (edit) {
    const bill = bills.find(row => row.id === edit.dataset.editBill);
    if (bill) openExpenseForEdit(bill);
    return;
  }

  const remove = event.target.closest('[data-del-bill]');
  if (!remove) return;
  const bill = bills.find(row => row.id === remove.dataset.delBill);
  /* 🔴 ชื่อพื้นที่ต้องเป็น 'expenses' ไม่ใช่ 'bills'
     LIVE_WRITABLE ไม่มีคีย์ 'bills' อยู่เลย → financeLocked() ตอบ true เสมอ
     ในโหมดข้อมูลจริง ปุ่มลบจึงขึ้นข้อความ "ทริปถูกล็อก" ทั้งที่ทริปยังไม่ปิด
     ชื่อพื้นที่ที่พิมพ์ผิดไม่มี error ให้เห็น — มันแค่ "ล็อกทุกอย่าง" เงียบ ๆ */
  if (!bill || blockedByClose('expenses')) return;
  if (!confirm(`ลบบิล "${bill.title}" ถาวร?\nยอดรวมและการหารเงินจะถูกคิดใหม่ทั้งหมด`)) return;
  if (liveMode) {
    await submitLive(null, () => TripApi.removeExpense(bill.id), `ลบ ${bill.title} แล้ว`);
  } else {
    bills = bills.filter(row => row.id !== bill.id);
    renderBills();
    showPrototypeToast(`ลบ ${bill.title} แล้ว`);
  }
});

/* ── ลากสลับลำดับบิล (2026-08-22) ──────────────────────────────────────
   🔴 ลากได้เฉพาะ "ภายในวันเดียวกัน" เท่านั้น
      ลากข้ามวันแล้วให้เปลี่ยนวันที่ของบิลตามที่ปล่อยคือพฤติกรรมที่คนไม่ได้ตั้งใจ
      — วันที่ของบิลคือข้อมูลทางบัญชี ไม่ใช่แค่ตำแหน่งในรายการ
      ปล่อยข้ามวันจึงไม่ทำอะไรเลย และขึ้นข้อความบอกเหตุผล

   ⚠️ จัดเรียงตอน drop ครั้งเดียว ไม่ใช่ตอน dragover
      ถ้า re-render ระหว่างลาก โหนดที่กำลังลากจะถูกทำลายกลางคัน แล้วการลากตาย
      (เคยเจอมาแล้วในหน้าแผนเที่ยว — ดู renderPlanWorkspace) */
let draggedBillId = null;

function bindBillDragHandlers() {
  $$('#billTable .bill-row').forEach(row => {
    row.addEventListener('dragstart', event => {
      // ⚠️ 'expenses' ไม่ใช่ 'bills' — ดูเหตุผลที่ปุ่มลบบิลด้านบน
      if (financeLocked('expenses')) { event.preventDefault(); return; }
      draggedBillId = row.dataset.billId;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.billId);
    });
    row.addEventListener('dragend', () => {
      draggedBillId = null;
      $$('#billTable .bill-row').forEach(item => item.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    row.addEventListener('dragover', event => {
      if (!draggedBillId || draggedBillId === row.dataset.billId) return;
      const moving = bills.find(bill => bill.id === draggedBillId);
      if (!moving || moving.date !== row.dataset.billDate) return;   // คนละวัน = ปล่อยไม่ได้
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.toggle('drop-before', before);
      row.classList.toggle('drop-after', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
    row.addEventListener('drop', event => {
      event.preventDefault();
      const movingId = draggedBillId || event.dataTransfer.getData('text/plain');
      draggedBillId = null;
      if (!movingId || movingId === row.dataset.billId) return;
      const moving = bills.find(bill => bill.id === movingId);
      if (!moving) return;
      if (moving.date !== row.dataset.billDate) {
        showPrototypeToast('สลับลำดับได้เฉพาะภายในวันเดียวกัน · ถ้าจะย้ายวัน ให้แก้วันที่ในบิล');
        return;
      }
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      applyBillOrder(moving, row.dataset.billId, before);
    });
  });
}

/* เขียนลำดับใหม่ให้ "ทั้งวันนั้น" ไม่ใช่แค่สองใบที่สลับกัน
   เพราะบิลที่ยังไม่เคยถูกจัดลำดับมี sortOrder = null การแตะแค่สองใบ
   จะได้ลำดับที่ผสมกันระหว่าง null กับตัวเลข ซึ่งอ่านผลไม่ได้ */
function applyBillOrder(moving, targetId, before) {
  const sameDay = bills
    .filter(bill => bill.date === moving.date)
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || String(b.id).localeCompare(String(a.id)));

  const from = sameDay.findIndex(bill => bill.id === moving.id);
  if (from < 0) return;
  sameDay.splice(from, 1);
  const to = sameDay.findIndex(bill => bill.id === targetId);
  if (to < 0) return;
  sameDay.splice(before ? to : to + 1, 0, moving);

  sameDay.forEach((bill, index) => { bill.sortOrder = (index + 1) * 10; });

  if (liveMode) {
    TripApi.reorderExpenses(sameDay.map(bill => bill.id))
      .then(() => refreshFromServer())
      .then(() => showPrototypeToast(`ย้าย ${moving.title} แล้ว`))
      .catch(error => { showPrototypeToast(`บันทึกลำดับไม่สำเร็จ · ${error.message}`); refreshFromServer(); });
    renderBills();
    return;
  }
  renderBills();
  showPrototypeToast(`ย้าย ${moving.title} แล้ว`);
}

function renderBills() {
  const readable = bills.filter(bill => canSee(bill));
  renderBudgetHero(readable);
  renderCategoryBars(readable);
  renderPeopleAndSettlement(readable);
  /* กรองสองชั้น: ประเภทบิล แล้วกรองด้วย "คนจ่าย"
     ⚠️ ตัวกรองรายคนดูที่ payerId (คนที่ควักเงินจริง) ไม่ใช่ ownerId หรือผู้ร่วมหาร
        ตามที่ตกลงไว้ — ถ้าเปลี่ยนไปดู participants ผลจะต่างกันมากเวลาเคลียร์เงิน */
  /* ── ตัวกรองสามชั้น: ประเภท · คนจ่าย · วันที่ (ทำงานร่วมกันแบบ "และ") ──
     ตรรกะอยู่ใน money.js เพื่อให้เทสได้โดยไม่ต้องมีเบราว์เซอร์
     (ดู "ตัวกรองรายการบิล" ใน backend/test/money.test.mjs) */
  const picked = filterBills(readable, {
    type: activeBillFilter, payerId: activeBillPayer, date: activeBillDate,
    viewerId, isTripOnly
  });
  const visibleBills = [...picked.visible]
    /* วันใหม่ → เก่า · ภายในวันเดียวกันใช้ "ลำดับที่ผู้ใช้ลากจัดเอง"
       ⚠️ บิลที่ยังไม่เคยถูกจัดลำดับมี sortOrder = null ต้องไปอยู่ท้ายของวันนั้น
          ไม่ใช่หัวรายการ (null < ตัวเลขทุกตัวถ้าไม่ดักไว้) */
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || String(b.id).localeCompare(String(a.id)));

  /* ── ช่องเลือกวันที่ ─────────────────────────────────────────────────
     ใช้ dropdown ไม่ใช่แถวชิป เพราะทริปยาว ๆ มีสิบกว่าวัน แถวชิปจะยาวเกินจอ
     วันที่ถูกลบบิลออกหมดจากทริปแล้ว → คืนเป็น "ทุกวัน" ไม่ใช่ค้างที่หน้าว่าง */
  const datesEverywhere = new Set(readable.map(bill => bill.date).filter(Boolean));
  if (activeBillDate && !datesEverywhere.has(activeBillDate)) {
    activeBillDate = '';
    return renderBills();
  }

  const dateSelect = $('#billDateFilter');
  if (dateSelect) {
    dateSelect.innerHTML = `<option value="">ทุกวัน · ${picked.exceptDate.length} รายการ</option>`
      + picked.dates.map(date => `<option value="${date}"${activeBillDate === date ? ' selected' : ''}>${
        billDateLabel(date)} · ${picked.dateCounts.get(date)} รายการ</option>`).join('');
    dateSelect.value = activeBillDate;
  }

  /* ปุ่มล้างตัวกรอง — โผล่เมื่อมีตัวกรองทำงานอยู่อย่างน้อยหนึ่งตัว
     เพราะเมื่อกรองซ้อนกันสามชั้นแล้วได้หน้าว่าง คนมักหาไม่เจอว่าติดตรงไหน */
  const filtering = picked.filtering;
  const resetBtn = $('#billFilterReset');
  if (resetBtn) resetBtn.hidden = !filtering;

  /* แถวกรองรายคน สร้างสดจากสมาชิกที่มีบิลจริง — คนที่ยังไม่เคยจ่ายอะไร
     ไม่ต้องมีปุ่ม เพราะกดแล้วได้หน้าว่างเปล่าซึ่งไม่ช่วยอะไร */
  const payers = members.filter(member => readable.some(bill => bill.payerId === member.id));
  $('#billPayerFilter').innerHTML = payers.length > 1
    ? `<span class="who-label">ของใคร</span>
       <button data-bill-payer="" class="${activeBillPayer ? '' : 'active'}">ทุกคน</button>`
      + payers.map(member => `
        <button data-bill-payer="${member.id}" class="${activeBillPayer === member.id ? 'active' : ''}">
          ${member.avatar ? `<img class="face-dot photo" src="${member.avatar}" alt="">`
            : `<i class="face-dot" style="background:${MEMBER_TINT[member.id] || '#e6f0fa'}">${member.name[0]}</i>`}${member.name}
        </button>`).join('')
    : '';

  /* ── การ์ดบิล ────────────────────────────────────────────────────────
     ทุกอย่างที่จดไว้อยู่บนการ์ดเลย ไม่ต้องกดเข้าไปดู
     หลักการ: หนึ่งเรื่องหนึ่งชิป · แต่ละเรื่องมีสีประจำตัวคงที่ทั้งหน้า
     ตาจะจับได้เองว่าอันไหนคือวันที่ อันไหนคือกระเป๋า โดยไม่ต้องอ่านคำ

     ⚠️ ชิปที่ติด class 'lite' จะถูกซ่อนบนจอเล็ก (ดู CSS v30)
        เหลือเฉพาะ วันที่ · จุดแวะ · หมวด ซึ่งเป็นสามอย่างที่ถามบ่อยสุด
        ถ้าโชว์ครบ 6 ชิปบนมือถือ การ์ดจะสูง 150px และเลื่อนยาวจนหาบิลไม่เจอ */
  $('#billCount').textContent = filtering
    ? `กรองอยู่ · ${visibleBills.length} จาก ${readable.length} รายการ`
    : `ใหม่ → เก่า · ${visibleBills.length} รายการ`;
  /* ── จัดกลุ่มตามวันที่ · หัววันคั่นก่อนรายการของวันนั้น (North 2026-08-22) ──
     รูปแบบ "11 Dec 2026" (DD MMM YYYY) — เดือนเป็นตัวย่ออังกฤษเพื่อไม่ให้
     ความกว้างของหัววันกระโดดไปมาตามความยาวชื่อเดือน

     🔴 ใช้ en-GB เท่านั้น ห้ามใช้ th-TH — Intl จะแปลง 2026 เป็น พ.ศ. 2569
        แล้วผู้ใช้จะเห็นเลขปีคนละชุดกับที่กรอกในฟอร์ม (ซึ่งเป็น ค.ศ. เสมอ)

     ชิปวันที่บนการ์ดถูกถอดออกแล้ว เพราะหัววันบอกไปแล้ว
     เขียนซ้ำสองที่ในจอเดียวคือที่ว่างที่เสียไปโดยไม่ได้ข้อมูลเพิ่ม */
  let lastBillDate = null;

  $('#billTable').innerHTML = visibleBills.length ? visibleBills.map(bill => {
    const wallet = walletById(bill.walletId);
    const stop = planDays.flatMap(day => day.activities || []).find(act => act.id === bill.activityId);
    const source = rateInfo(bill.currency, bill.walletId).source;
    const baht = source === 'none' ? '— ฿ · ยังไม่มีเรท'
      : source === 'base' ? 'ไม่ต้องแปลง'
      : `${unitBaht(billBaht(bill))}${source === 'planned' ? ' (ประมาณ)' : ''}`;

    const chip = (cls, icon, text, lite) =>
      `<em class="${cls}${lite ? ' lite' : ''}">${icon} ${text}</em>`;
    const chips = [
      stop ? chip('c-stop', '📍', stop.name, false) : chip('c-none', '📍', 'ไม่ได้ผูกจุดแวะ', false),
      chip('c-cat', '🏷️', billCategoryLabel(bill) || 'ไม่ระบุหมวด', false),
      wallet ? chip('c-wallet', '👛', wallet.label, true) : '',
      chip('c-payer', '💳', `${memberName(bill.payerId)} จ่าย`, true),
      bill.shared
        ? chip('c-split', '🧑‍🤝‍🧑', `แชร์ ${(bill.participants || []).length} คน`, true)
        : chip('c-none', '🧑‍🤝‍🧑', 'ไม่ได้แชร์', true),
      isTripOnly(bill.ownerId) ? chip('c-only', '📒', 'เฉพาะทริป', true) : '',
      bill.visibility === 'private' ? chip('c-none', '🔒', 'ส่วนตัว', true) : ''
    ].filter(Boolean).join('');

    /* รูปสลิปเล็ก ๆ — เห็นได้ทันทีว่าใบไหนมีหลักฐานแนบ ใบไหนยังไม่มี
       PDF ย่อเป็นรูปไม่ได้ จึงใช้ปุ่มไอคอนเอกสารเปิดแท็บใหม่แทน */
    const isPdf = /\.pdf($|\?)/i.test(bill.receiptUrl || '');
    const receipt = !bill.receiptUrl ? ''
      : isPdf
        ? `<a class="bill-slip pdf" href="${bill.receiptUrl}" target="_blank" rel="noopener" title="เปิดเอกสารแนบ">📄</a>`
        : `<button type="button" class="bill-slip" data-receipt="${bill.receiptUrl}" title="ดูสลิปเต็มจอ"><img src="${bill.receiptUrl}" alt="สลิปของ ${bill.title}"></button>`;

    /* หัววันขึ้นเฉพาะตอนวันเปลี่ยน · รายการเรียงใหม่→เก่ามาแล้ว
       ถ้ารายการยังไม่ได้เรียง หัววันซ้ำจะโผล่หลายรอบ ซึ่งเป็นสัญญาณว่าลำดับพัง */
    const heading = bill.date !== lastBillDate
      ? `<div class="bill-date"><span>${billDateLabel(bill.date)}</span></div>` : '';
    lastBillDate = bill.date;

    return `${heading}
    <article class="bill-row${source === 'none' ? ' no-rate' : ''}" data-bill-id="${bill.id}"
      data-bill-date="${bill.date || ''}" draggable="true">
      <span class="bill-drag" title="ลากเพื่อสลับลำดับ" aria-hidden="true">⠿</span>
      <img class="bill-icon" src="${billIcon(bill)}" alt="" draggable="false">
      <div class="bill-main"><b>${bill.title}</b><div class="bill-chips">${chips}</div></div>
      <div class="bill-side">
        <div class="bill-money"><b>${billAmountLabel(bill)}</b><small>${baht}</small></div>
        <div class="bill-tools">
          ${receipt}
          <button type="button" class="bill-edit" data-edit-bill="${bill.id}" title="แก้ไขบิลนี้" aria-label="แก้ไข ${bill.title}">✏️</button>
          <button type="button" class="bill-del" data-del-bill="${bill.id}" title="ลบบิลนี้" aria-label="ลบ ${bill.title}">🗑️</button>
        </div>
      </div>
    </article>`;
  }).join('') : `<div class="bill-empty">${filtering
    ? 'ไม่มีบิลที่ตรงกับตัวกรองทั้งหมดที่เลือกไว้ · กด “ล้างตัวกรอง” เพื่อดูทั้งหมด'
    : 'ยังไม่มีบิลในทริปนี้'}</div>`;
  bindBillDragHandlers();

  /* การ์ดสรุปสามใบเดิมถูกแทนด้วยแถบงบด้านบนแล้ว — element ถูกซ่อนไว้เฉย ๆ
     ยังเขียนค่าลงไปเพราะโค้ดส่วนอื่น/เทสอาจอ่านอยู่ ถ้าลบทิ้งเลยจะพังเงียบ */
  const sum = list => list.reduce((total, bill) => total + billBaht(bill), 0);
  const put = (id, value) => { const node = $(`#${id}`); if (node) node.textContent = unitBaht(value); };
  put('billTotal', sum(readable));
  put('billMine', sum(readable.filter(bill => bill.payerId === viewerId && !isTripOnly(bill.ownerId))));
  put('billTripOnly', sum(readable.filter(bill => isTripOnly(bill.ownerId))));

  /* ป้ายเตือนเรื่องเรทย้ายไปอยู่ใน renderBudgetHero() แล้ว (แสดงเป็นแถบสีใต้ยอด)
     ตรงนี้เหลือไว้เฉพาะการนับ เพื่อให้ส่วนอื่นที่อ่าน #billNotice ไม่พัง */
  const notice = $('#billNotice');
  if (notice) notice.textContent = '';

  const counter = $('#storageCount');
  if (counter) counter.textContent = `${bills.length} รายการ`;
  renderWallets();
  renderMoneyStrip();
  renderMembers();
  renderCurrencies();
  renderTripPresets();
  renderDocumentLibrary();
  renderJoinLink();
  renderCloseLines();
  renderManageSummary();
  renderPresence();
  applyTripLock();
  saveState();
}

/* ── Wallets ───────────────────────────────────────────────────────────
   Balance and funding history are private to the wallet's owner, so the
   screen only ever builds cards for wallets the current viewer owns. */
function walletSummary(wallet) {
  const lots = lotsOf(wallet.id);
  const fundedForeign = lots.reduce((sum, row) => sum + row.foreign, 0);
  const fundedThb = lots.reduce((sum, row) => sum + row.thb, 0);
  const spent = bills.filter(bill => bill.walletId === wallet.id)
    .reduce((sum, bill) => sum + bill.amount, 0);
  return {
    lots, fundedForeign, fundedThb, spent,
    rate: walletRate(wallet.id),          // null until something is funded
    leftover: fundedForeign - spent
  };
}

/* จำนวนบิลที่ผูกกับกระเป๋าใบนี้ — ใช้ตัดสินว่าลบได้ไหม
   🔴 กระเป๋าที่มีบิลผูกอยู่ ลบไม่ได้ (North 2026-08-22)
      บิลอ้างกระเป๋าเพื่อหาเรทต้นทุน ถ้ากระเป๋าหาย บิลเก่าจะตีเป็นบาทไม่ได้
      ยอดรวมทริปจะลดลงเงียบ ๆ และการหารเงินจะเพี้ยนโดยไม่มีอะไรฟ้อง
      ฝั่งเซิร์ฟเวอร์กันไว้อีกชั้น (409) — ตรงนี้แค่บอกล่วงหน้าให้ไม่ต้องลองผิด */
const billsUsing = walletId => bills.filter(bill => bill.walletId === walletId).length;

/* กระเป๋าที่กางประวัติเติมเงินอยู่ · เก็บไว้นอกฟังก์ชันเพราะ renderWallets
   ถูกเรียกใหม่ทุกครั้งที่บันทึกอะไรก็ตาม ถ้าเก็บไว้ในตัว DOM รายการที่กางอยู่
   จะหุบเองทุกครั้งที่เติมเงินเสร็จ ซึ่งเป็นจังหวะที่คนอยากดูประวัติที่สุด */
const openWalletHistory = new Set();

/* กระเป๋าที่เลือกดูรายการอยู่ · '' = ดูทุกใบรวมกัน */
let activeWalletId = '';

function walletHistoryHtml(wallet) {
  const lots = lotsOf(wallet.id);                 // ใหม่ → เก่า ตามวันที่จริงเสมอ
  const symbol = symbolFor(wallet.currency);
  if (!lots.length) {
    return `<p class="wlot-empty">ยังไม่ได้บันทึกการเติมเงินของกระเป๋าใบนี้ · กด ＋ เพื่อเริ่ม</p>`;
  }
  return `<ol class="wlot-list">${lots.map(lot => `
    <li>
      <span class="wlot-when">${thaiDateShort(lot.date)}</span>
      <span class="wlot-what"><b>${fmtAmount(lot.foreign, symbol)}</b><small>${lot.note || 'เติมเงิน'}</small></span>
      <span class="wlot-cost">${unitBaht(lot.thb)}<small>${(lot.thb / (lot.foreign || 1)).toFixed(4)} ฿/${symbol}</small></span>
      <span class="wlot-do">
        <button type="button" class="wico blue" data-edit-lot="${lot.id}" title="แก้ไขการเติมเงินครั้งนี้" aria-label="แก้ไขการเติมเงิน ${thaiDateShort(lot.date)}">✏️</button>
        <button type="button" class="wico pink" data-del-lot="${lot.id}" title="ลบการเติมเงินครั้งนี้" aria-label="ลบการเติมเงิน ${thaiDateShort(lot.date)}">🗑️</button>
      </span>
    </li>`).join('')}</ol>
    <p class="wlot-foot">รวม ${lots.length} ครั้ง · ${fmtAmount(lots.reduce((sum, row) => sum + row.foreign, 0), symbol)} จาก ${thb(lots.reduce((sum, row) => sum + row.thb, 0))}
    <small>เรทเฉลี่ยคิดจากผลรวมทั้งหมดหารกัน ไม่ใช่เฉลี่ยเรทรายครั้ง — เติมย้อนหลังจึงไม่ทำให้ตัวเลขเก่าเพี้ยน</small></p>`;
}

/* ── ใครเห็นกระเป๋าใบไหน ────────────────────────────────────────────────
   ต้องตรงกับกติกาฝั่งเซิร์ฟเวอร์ (walletVisible ใน unified-trip.js) เป๊ะ ๆ
   ไม่งั้นจะได้อาการ "เห็นแต่กดไม่ได้" หรือ "กดได้แต่ของไม่โผล่"

   North 2026-08-23: ผู้ดูแลทริป "แก้ไข เปลี่ยนแปลง ลบ เพิ่ม ได้ทั้งหมด"
   ส่วนคนที่เจ้าของตั้งให้เป็นผู้ดูแลของตัวเอง (managedBy) ก็เห็นเฉพาะของคนนั้น */
const canSeeWallet = wallet =>
  !wallet.ownerId
  || wallet.ownerId === viewerId
  || isAdmin(viewerId)
  || memberById(wallet.ownerId)?.managedBy === viewerId;

function renderWallets() {
  /* viewer หาไม่เจอได้จริง — ทริปเก่าที่สมาชิกยังไม่ถูกผูกกับบัญชีล็อกอิน
     (TripMembers.user_id เป็น NULL) เซิร์ฟเวอร์จะตอบ viewer = null
     ห้ามพังทั้งหน้า ให้บอกตรง ๆ ว่ายังไม่รู้ว่าเราเป็นสมาชิกคนไหน */
  const viewer = memberById(viewerId);
  if (!viewer) {
    $('#walletHeading').textContent = 'กระเป๋า';
    $('#walletPrivacy').innerHTML = '⚠️ ยังไม่ได้ผูกบัญชีคุณกับทริปนี้ — ให้ผู้ดูแลทริปผูกให้ก่อน';
    $('#walletGrid').innerHTML = '';
    $('#walletActivity').innerHTML = '';
    return;
  }
  const owned = wallets.filter(canSeeWallet);
  const seeingOthers = owned.some(wallet => wallet.ownerId && wallet.ownerId !== viewerId);
  $('#walletHeading').textContent = seeingOthers ? 'กระเป๋าทั้งทริป' : `กระเป๋าของ ${viewer.name}`;
  $('#walletPrivacy').innerHTML = !owned.length
    ? `🔒 ยังไม่มีกระเป๋า · ยอดของคนอื่นถูกซ่อนไว้`
    : (seeingOthers
      ? `👑 คุณเป็นผู้ดูแลทริป จึงเห็นและแก้กระเป๋าของทุกคนได้ · สมาชิกคนอื่นเห็นแค่ของตัวเอง`
      : `🔒 ยอดนี้เห็นเฉพาะคุณกับผู้ดูแลทริป · สมาชิกคนอื่นเห็นแค่บิลที่แชร์`);

  /* แถบสรุปบนสุด — รวมทุกใบของเราแยกตามสกุล ไม่บวกข้ามสกุล
     ⚠️ บาทรวมนับเฉพาะใบที่ตีเป็นบาทได้ ใบที่ยังไม่มีเรทต้องไม่ถูกนับเป็น 0
        (0 แปลว่าไม่มีเงิน ซึ่งคนละเรื่องกับ "มีเงินแต่ยังตีมูลค่าไม่ได้") */
  const perCurrency = new Map();
  let bahtTotal = 0;
  let unpriced = 0;
  owned.forEach(wallet => {
    const s = walletSummary(wallet);
    const row = perCurrency.get(wallet.currency) || { left: 0, wallets: 0 };
    row.left += s.leftover;
    row.wallets += 1;
    perCurrency.set(wallet.currency, row);
    const info = rateInfo(wallet.currency, wallet.id);
    if (info.rate === null) unpriced += 1; else bahtTotal += s.leftover * info.rate;
  });
  const summary = $('#walletSummary');
  if (summary) {
    const total = signedBaht(bahtTotal);
    summary.innerHTML = owned.length ? `
      <div class="wsum-left">
        <span>เงินคงเหลือรวมทุกกระเป๋า</span>
        <button type="button" class="wsum-open" id="openWalletTotals">
          <i class="wsum-open-ico">👛</i>
          <span>ดูรายกระเป๋า<small>${perCurrency.size} สกุล · ${owned.length} ใบ</small></span>
          <em>›</em>
        </button>
      </div>
      <div class="wsum-main">
        <strong class="signed ${total.cls}">${total.text}</strong>
        <small>${unpriced ? `⚠️ ยังไม่รวมอีก ${unpriced} ใบที่ยังไม่มีเรท` : `จาก ${owned.length} กระเป๋า`}</small>
      </div>` : '';
  }

  $('#walletGrid').innerHTML = owned.map(wallet => {
    const s = walletSummary(wallet);
    const symbol = symbolFor(wallet.currency);
    /* สีที่ผู้ใช้เลือกเองมาก่อน · ยังไม่เลือกจึงถอยไปใช้สีตามสกุลเงิน
       ⚠️ ?? ไม่ใช่ || — องศา 0 คือสีแดง ไม่ใช่ "ไม่ได้เลือก" */
    const hue = wallet.colorHue ?? currencyHue(wallet.currency);
    const info = rateInfo(wallet.currency, wallet.id);
    const open = openWalletHistory.has(wallet.id);
    const used = billsUsing(wallet.id);

    /* ── ทำไมคำอธิบายยาว ๆ ย้ายไปอยู่หลังปุ่ม ⓘ (North 2026-08-22) ──
       เดิมการ์ดหนึ่งใบมีย่อหน้าอธิบายสามก้อน (ที่มาของเรท · คำเตือนใช้เกิน ·
       ความหมายของเงินเข้าทั้งหมด) รวมกันสูงกว่าตัวเลขที่คนเปิดมาดูจริง ๆ
       มีกระเป๋าสามใบก็ต้องเลื่อนจอทั้งหน้าเพื่อดูยอดสามตัว

       🔴 แต่คำเตือน "ใช้เกินยอด" ห้ามหายไปเฉย ๆ — ปุ่มของมันจึงเป็น ⚠️ สีแดง
          และการ์ดยังติดคลาส .short (ขอบแดง) อยู่เหมือนเดิม
          สัญญาณยังอยู่ครบ ย้ายแค่ "คำอธิบาย" ไม่ใช่ย้าย "การเตือน" */
    const rateShort = info.source === 'base'
      ? 'สกุลหลัก'
      : (info.rate === null ? 'ยังไม่มีเรท' : `${info.rate.toFixed(4)} ฿/${symbol}`);
    const infoBtn = (key, icon, label, cls = '') =>
      `<button type="button" class="wcard-info ${cls}" data-wallet-info="${key}" data-wallet-ref="${wallet.id}"
        title="${label}" aria-label="${label}">${icon}</button>`;

    /* สัดส่วนที่ใช้ไปแล้ว — ตัดที่ 100% เพื่อไม่ให้แถบทะลุการ์ด
       แต่ตัวเลขข้างล่างยังบอกยอดจริง จะได้เห็นว่าใช้เกินไปเท่าไร */
    const pct = s.fundedForeign > 0 ? Math.min(100, (s.spent / s.fundedForeign) * 100) : 0;

    return `
    <article class="wcard${s.leftover < 0 ? ' short' : ''}${activeWalletId === wallet.id ? ' picked' : ''}"
      style="--wc:${hue}" data-wallet-card="${wallet.id}"
      title="กดเพื่อดูเฉพาะรายการของกระเป๋าใบนี้">
      <header class="wcard-head">
        <img class="wcard-icon" src="${wallet.icon || DEFAULT_ICONS.wallet}" alt="">
        <span class="wcard-name">
          <b>${wallet.label}</b>
          <small>${wallet.currency} · ${rateShort}
            ${info.source === 'base' ? '' : infoBtn('rate', 'ⓘ', 'เรทนี้มาจากไหน')}</small>
        </span>
        ${wallet.ownerId && wallet.ownerId !== viewerId
          /* ผู้ดูแลเห็นกระเป๋าของทุกคน จึงต้องบอกให้ชัดว่าใบนี้ของใคร
             ไม่งั้นเติมเงินหรือลบผิดใบโดยไม่รู้ตัว — ทุกใบหน้าตาเหมือนกันหมด */
          ? `<em class="wcard-owner" title="กระเป๋าของ ${memberName(wallet.ownerId)}">👤 ${memberName(wallet.ownerId)}</em>`
          : ''}
      </header>

      <div class="wcard-balance">
        <span>คงเหลือ${s.leftover < 0 ? infoBtn('over', '⚠️', 'ทำไมยอดติดลบ', 'warn') : ''}</span>
        <strong>${unitAmount(s.leftover, symbol)}</strong>
        <small>${info.rate === null ? 'ยังตีเป็นบาทไม่ได้' : `≈ ${unitBaht(s.leftover * info.rate)}`}</small>
      </div>

      <div class="wcard-total">
        <span>เงินเข้าทั้งหมด${infoBtn('total', 'ⓘ', 'เงินเข้าทั้งหมดนับจากอะไร')}</span>
        <b>${unitAmount(s.fundedForeign, symbol)}</b>
        <em>ต้นทุน ${unitBaht(s.fundedThb)}</em>
      </div>
      <div class="wcard-bar" role="img" aria-label="ใช้ไปแล้ว ${Math.round(pct)} เปอร์เซ็นต์ของเงินที่เติมไว้">
        <i style="width:${pct}%"></i>
      </div>
      <div class="wcard-legend">
        <span class="spent">ใช้ไป ${unitAmount(s.spent, symbol)}${used ? ` · ${used} บิล` : ''}</span>
        <span class="left">เหลือ ${unitAmount(s.leftover, symbol)}</span>
      </div>

      <div class="wcard-actions">
        <button type="button" class="wico green" data-fund-wallet="${wallet.id}"${tripClosed ? ' disabled' : ''} title="เติมเงินเข้ากระเป๋านี้" aria-label="เติมเงินเข้า ${wallet.label}">＋</button>
        <button type="button" class="wico blue" data-edit-wallet="${wallet.id}"${tripClosed ? ' disabled' : ''} title="แก้ไขกระเป๋า" aria-label="แก้ไข ${wallet.label}">✏️</button>
        <button type="button" class="wico purple${open ? ' on' : ''}" data-history-wallet="${wallet.id}" title="ประวัติการเติมเงินของกระเป๋านี้" aria-expanded="${open}" aria-label="ประวัติการเติมเงินของ ${wallet.label}">🕘</button>
        <button type="button" class="wico pink" data-del-wallet="${wallet.id}"${tripClosed ? ' disabled' : ''} title="${used ? `ลบไม่ได้ · มีบิลผูกอยู่ ${used} รายการ` : 'ลบกระเป๋านี้'}" aria-label="ลบ ${wallet.label}">🗑️</button>
      </div>

      ${info.source === 'base' ? '' : `<div class="carry-line">
        <label class="carry-toggle${wallet.excludeOnClose ? ' on' : ''}">
          <input type="checkbox" data-carry-wallet="${wallet.id}" ${wallet.excludeOnClose ? 'checked' : ''} ${tripClosed ? 'disabled' : ''}>
          <span><b>ยกยอดไปทริปหน้า</b><small>${wallet.excludeOnClose
            ? 'เงินเหลือไม่คืนเข้าบัญชี · เก็บเป็นล็อตตั้งต้นของทริปถัดไป'
            : 'เงินเหลือคืนเข้าบัญชีต้นทางตอนปิดทริป'}</small></span>
        </label>
        ${infoBtn('carry', 'ⓘ', 'ยกยอดไปทริปหน้าทำงานอย่างไร')}
      </div>`}

      ${open ? `<div class="wcard-history">${walletHistoryHtml(wallet)}</div>` : ''}
    </article>`;
  }).join('') || `<div class="bill-empty">ยังไม่มีกระเป๋า · กด “＋ เพิ่มกระเป๋า” เพื่อเริ่มบันทึกเงินของทริปนี้</div>`;

  /* ── รายการล่าสุด ────────────────────────────────────────────────────
     แสดงเป็นการ์ดแบบเดียวกับหน้าบิล (North 2026-08-22) — มีหัววันคั่น ไอคอน
     และชิปบอกรายละเอียด · เดิมเป็นแถวข้อความล้วนซึ่งอ่านยากกว่าหน้าบิทั้งที่
     เป็นข้อมูลชุดเดียวกัน คนจึงต้องสลับหน้าไปมาเพื่อดูเรื่องเดียวกัน

     🔴 เดิมไม่ได้เรียงเลย — เอาบิลมาต่อท้ายด้วยการเติมเงิน และตัวเรียงเทียบกันไม่ได้
        (บิลใช้ id ส่วนการเติมเงินใช้ date) ผลคือ "รายการล่าสุด" ไม่ได้ล่าสุดจริง
     เรียงตามวันที่ที่เกิดขึ้นจริง ใหม่ → เก่า ไม่ใช่ลำดับที่บันทึก */
  const ownedIds = owned.map(wallet => wallet.id);
  /* เลือกกระเป๋าไว้แล้วกระเป๋านั้นถูกลบ → ต้องคืนเป็น "ทุกใบ" ไม่ใช่ค้างที่หน้าว่าง */
  if (activeWalletId && !ownedIds.includes(activeWalletId)) activeWalletId = '';
  const scope = activeWalletId ? [activeWalletId] : ownedIds;

  const rows = [
    ...bills.filter(bill => scope.includes(bill.walletId)).map(bill => ({
      kind: 'bill', date: bill.date || '', id: bill.id, bill,
      title: bill.title, walletId: bill.walletId, order: bill.sortOrder ?? null,
      icon: billIcon(bill), value: -bill.amount
    })),
    ...fundings.filter(row => scope.includes(row.walletId)).map(row => ({
      kind: 'fund', date: row.date || '', id: row.id, lot: row,
      title: row.note || 'เติมเงิน', walletId: row.walletId, order: row.sortOrder ?? null,
      icon: walletById(row.walletId)?.icon || DEFAULT_ICONS.wallet, value: row.foreign
    }))
    /* วันใหม่ → เก่า · ภายในวันเดียวกันใช้ลำดับที่ผู้ใช้ลากจัดเอง
       ⚠️ ยังไม่เคยจัด = sortOrder null ต้องไปท้ายของวันนั้น ไม่ใช่หัวรายการ
       บิลกับล็อตเติมเงินใช้คิวเลขชุดเดียวกัน จึงเทียบกันได้ตรง ๆ */
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))
    || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    || String(b.id).localeCompare(String(a.id)));

  const heading = $('#walletActivityTitle');
  if (heading) {
    heading.textContent = activeWalletId
      ? `รายการของ ${walletById(activeWalletId)?.label || 'กระเป๋านี้'}`
      : 'รายการล่าสุด · ทุกกระเป๋า';
  }
  const clearBtn = $('#walletActivityClear');
  if (clearBtn) clearBtn.hidden = !activeWalletId;

  let lastActivityDate = null;
  $('#walletActivity').innerHTML = rows.length ? rows.map(row => {
    const wallet = walletById(row.walletId);
    const symbol = symbolFor(wallet?.currency);
    const info = rateInfo(wallet?.currency, row.walletId);
    const dateHead = row.date !== lastActivityDate
      ? `<div class="bill-date"><span>${billDateLabel(row.date)}</span></div>` : '';
    lastActivityDate = row.date;

    const chip = (cls, text) => `<em class="${cls}">${text}</em>`;
    const chips = row.kind === 'bill'
      ? [
        chip('c-wallet', `👛 ${wallet?.label || 'ไม่ระบุกระเป๋า'}`),
        chip('c-cat', `🏷️ ${billCategoryLabel(row.bill) || 'ไม่ระบุหมวด'}`),
        chip('c-payer', `💳 ${memberName(row.bill.payerId)} จ่าย`),
        row.bill.shared ? chip('c-split', `🧑‍🤝‍🧑 แชร์ ${(row.bill.participants || []).length} คน`)
          : chip('c-none', '🧑‍🤝‍🧑 ไม่ได้แชร์')
      ].join('')
      : [
        chip('c-wallet', `👛 ${wallet?.label || 'ไม่ระบุกระเป๋า'}`),
        chip('c-fund', `➕ เติมเงิน · ${unitBaht(row.lot.thb)}`),
        chip('c-rate', `⚖️ ${(row.lot.thb / (row.lot.foreign || 1)).toFixed(4)} ฿/${symbol}`),
        chip('c-none', '🔒 เห็นเฉพาะคุณ')
      ].join('');

    /* บิล = เงินออก (ติดลบ) · เติมเงิน = เงินเข้า
       ใช้วงเล็บแบบบัญชีเหมือนทั้งแอป และมีสีกำกับอีกชั้น */
    const sub = row.kind === 'bill'
      ? (info.rate === null ? 'ยังตีเป็นบาทไม่ได้' : `≈ ${unitBaht(row.bill.amount * info.rate)}`)
      : `จ่ายไป ${unitBaht(row.lot.thb)}`;

    /* ปุ่มแก้ไข/ลบของล็อตเติมเงิน — มีเฉพาะแถวเติมเงิน (North 2026-08-23)
       เดิมลบได้เฉพาะในประวัติที่ซ่อนอยู่ในการ์ดกระเป๋า ซึ่งต้องกดเข้าไปอีกชั้น
       ทั้งที่รายการนี้คือที่ที่คนเห็นมันบ่อยที่สุด · บิลมีหน้าแก้ของตัวเองอยู่แล้ว */
    const lotActions = row.kind === 'fund' && !financeLocked('fundings')
      ? `<div class="wact-actions">
          <button type="button" class="wico blue" data-edit-lot="${row.lot.id}"
            title="แก้ไขการเติมเงินครั้งนี้" aria-label="แก้ไขการเติมเงิน ${thaiDateShort(row.date)}">✏️</button>
          <button type="button" class="wico pink" data-del-lot="${row.lot.id}"
            title="ลบการเติมเงินครั้งนี้" aria-label="ลบการเติมเงิน ${thaiDateShort(row.date)}">🗑️</button>
        </div>`
      : '';

    return `${dateHead}
    <article class="bill-row wact-row ${row.kind}" draggable="true"
      data-act-id="${row.id}" data-act-kind="${row.kind}" data-act-date="${row.date}">
      <span class="bill-drag" title="ลากเพื่อสลับลำดับ" aria-hidden="true">⠿</span>
      <img class="bill-icon" src="${row.icon}" alt="" draggable="false">
      <div class="bill-main"><b>${row.title}</b><div class="bill-chips">${chips}</div></div>
      <div class="bill-side">
        <div class="bill-money"><b class="${row.value < 0 ? 'minus' : 'plus'}">${unitAmount(row.value, symbol)}</b><small>${sub}</small></div>
        ${lotActions}
      </div>
    </article>`;
  }).join('') : `<div class="bill-empty">${activeWalletId
    ? 'กระเป๋าใบนี้ยังไม่มีความเคลื่อนไหว'
    : 'ยังไม่มีความเคลื่อนไหว'}</div>`;
  bindActivityDragHandlers(rows);
}

/* ── ลากสลับลำดับรายการในหน้ากระเป๋า (2026-08-22) ─────────────────────
   รายการนี้มีสองชนิดปนกัน (บิล + การเติมเงิน) ลำดับจึงต้องข้ามสองตาราง
   ใช้คิวเลขชุดเดียวไล่ 10, 20, 30 … ไม่ใช่ต่างคนต่างนับ ไม่งั้นเลขชนกันเอง

   🔴 ลากได้เฉพาะภายในวันเดียวกัน เหมือนหน้าบิล — วันที่เป็นข้อมูลทางบัญชี
      ไม่ใช่แค่ตำแหน่งในรายการ */
let draggedActivity = null;

function bindActivityDragHandlers(rows) {
  $$('#walletActivity .wact-row').forEach(node => {
    node.addEventListener('dragstart', event => {
      if (financeLocked('expenses')) { event.preventDefault(); return; }
      draggedActivity = { id: node.dataset.actId, kind: node.dataset.actKind, date: node.dataset.actDate };
      node.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.dataset.actId);
    });
    node.addEventListener('dragend', () => {
      draggedActivity = null;
      $$('#walletActivity .wact-row').forEach(item => item.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    node.addEventListener('dragover', event => {
      if (!draggedActivity || draggedActivity.id === node.dataset.actId) return;
      if (draggedActivity.date !== node.dataset.actDate) return;   // คนละวัน = ปล่อยไม่ได้
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = node.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      node.classList.toggle('drop-before', before);
      node.classList.toggle('drop-after', !before);
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-before', 'drop-after'));
    node.addEventListener('drop', event => {
      event.preventDefault();
      const moving = draggedActivity;
      draggedActivity = null;
      if (!moving || moving.id === node.dataset.actId) return;
      if (moving.date !== node.dataset.actDate) {
        showPrototypeToast('สลับลำดับได้เฉพาะภายในวันเดียวกัน');
        return;
      }
      const rect = node.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      applyActivityOrder(rows, moving, node.dataset.actId, before);
    });
  });
}

/* เขียนลำดับใหม่ให้ "ทั้งวันนั้น" ไม่ใช่แค่สองรายการที่สลับกัน
   เพราะของที่ยังไม่เคยถูกจัดลำดับมี sortOrder = null การแตะแค่สองตัว
   จะได้ลำดับที่ผสมกันระหว่าง null กับตัวเลข ซึ่งอ่านผลไม่ได้ */
function applyActivityOrder(rows, moving, targetId, before) {
  const sameDay = rows.filter(row => row.date === moving.date);
  const from = sameDay.findIndex(row => row.id === moving.id);
  const target = sameDay.findIndex(row => row.id === targetId);
  if (from < 0 || target < 0) return;
  const [picked] = sameDay.splice(from, 1);
  const at = sameDay.findIndex(row => row.id === targetId);
  sameDay.splice(before ? at : at + 1, 0, picked);

  /* เขียนกลับลงข้อมูลจริง — ต้องหาอ็อบเจ็กต์ต้นทางใน bills/fundings
     ไม่ใช่แก้ที่ rows ซึ่งเป็นสำเนาสำหรับวาดจอเท่านั้น */
  sameDay.forEach((row, index) => {
    const value = (index + 1) * 10;
    const source = row.kind === 'bill'
      ? bills.find(bill => bill.id === row.id)
      : fundings.find(lot => lot.id === row.id);
    if (source) source.sortOrder = value;
  });

  const payload = sameDay.map(row => ({ kind: row.kind, id: row.id }));
  if (liveMode) {
    TripApi.reorderActivity(payload)
      .then(() => refreshFromServer())
      .then(() => showPrototypeToast(`ย้าย ${picked.title} แล้ว`))
      .catch(error => { showPrototypeToast(`บันทึกลำดับไม่สำเร็จ · ${error.message}`); refreshFromServer(); });
    renderWallets();
    return;
  }
  renderWallets();
  saveState();
  showPrototypeToast(`ย้าย ${picked.title} แล้ว`);
}

/* กดที่การ์ดกระเป๋า = ดูเฉพาะรายการของใบนั้น · กดซ้ำ = กลับไปดูทุกใบ
   ⚠️ ต้องไม่ชนกับปุ่มต่าง ๆ บนการ์ด (เติมเงิน แก้ไข ลบ ประวัติ ⓘ ช่องติ๊ก)
      ไม่งั้นกดปุ่มทีเดียวจะได้ทั้งการกดปุ่มและการเลือกกระเป๋าพร้อมกัน */
$('#walletGrid').addEventListener('click', event => {
  if (event.target.closest('button, input, label, a, .wcard-history')) return;
  const card = event.target.closest('[data-wallet-card]');
  if (!card) return;
  activeWalletId = activeWalletId === card.dataset.walletCard ? '' : card.dataset.walletCard;
  renderWallets();
  const list = $('#walletActivityBlock');
  if (activeWalletId && list) list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('#walletActivityClear').addEventListener('click', () => {
  activeWalletId = '';
  renderWallets();
});

/* ── คำอธิบายหลังปุ่ม ⓘ (2026-08-22) ──────────────────────────────────
   เก็บข้อความไว้ที่เดียว ไม่กระจายอยู่ใน template ของการ์ด
   ข้อความอธิบายเป็นสิ่งที่ถูกแก้บ่อยที่สุดในหน้านี้ ถ้าฝังไว้ในการ์ดจะต้อง
   ไล่แก้หลายจุดและมักหลงเหลือฉบับเก่าค้างอยู่ */
function walletInfoText(key, wallet) {
  const symbol = symbolFor(wallet.currency);
  const info = rateInfo(wallet.currency, wallet.id);
  const s = walletSummary(wallet);
  const lots = lotsOf(wallet.id);

  if (key === 'rate') {
    const source = {
      actual: `<b>เรทเฉลี่ยจากเงินที่เติมจริง</b>
        <p>คิดจาก “บาทที่จ่ายไปทั้งหมด ÷ เงิน${wallet.currency}ที่ได้มาทั้งหมด” ของการเติมทั้ง ${lots.length} ครั้ง
        ไม่ใช่ค่าเฉลี่ยของเรทแต่ละครั้ง — ก้อนใหญ่จึงมีน้ำหนักมากกว่าก้อนเล็กตามจริง</p>
        <p>ผลลัพธ์ไม่ขึ้นกับลำดับที่บันทึก บันทึกย้อนหลังได้โดยตัวเลขเก่าไม่เพี้ยน</p>
        <p class="dim">เรทนี้ยังขยับได้จนกว่าจะปิดทริป แล้วจะถูกล็อกไว้</p>`,
      planned: `<b>เรทประมาณการ · ยังไม่มีการเติมเงินจริง</b>
        <p>เป็นตัวเลขที่ตั้งไว้ล่วงหน้าในหน้า “สกุลเงิน” เพื่อให้พอเห็นภาพเป็นบาทได้ก่อน
        ไม่ใช่ต้นทุนจริงที่จ่ายไป</p>
        <p>พอบันทึกการเติมเงินครั้งแรก ระบบจะเปลี่ยนไปใช้เรทเฉลี่ยจากเงินจริงให้เองทันที</p>`,
      locked: `<b>ล็อกแล้วเมื่อปิดทริป</b>
        <p>ตอนปิดทริประบบบันทึกเรทไว้กับกระเป๋าใบนี้ เพื่อให้ยอดที่ลงบัญชีไม่เปลี่ยนย้อนหลัง</p>`,
      none: `<b>ยังคำนวณเป็นบาทไม่ได้</b>
        <p>สกุล ${wallet.currency} ยังไม่มีทั้งเรทประมาณการและการเติมเงินจริง</p>
        <p>ระบบจะไม่เดาเรทให้ เพราะตัวเลขที่เดามาหน้าตาเหมือนตัวเลขจริงทุกประการ
        และจะไหลไปอยู่ในยอดรวมทั้งทริปโดยไม่มีใครรู้</p>
        <p class="dim">แก้ได้สองทาง: ตั้งเรทประมาณการในหน้าสกุลเงิน หรือบันทึกการเติมเงิน</p>`
    }[info.source] || '';
    return { title: 'เรทนี้มาจากไหน', body: source };
  }

  if (key === 'over') {
    return {
      title: 'ทำไมยอดคงเหลือติดลบ',
      body: `<b>ใช้เกินยอดที่บันทึกเติมไว้ ${unitAmount(Math.abs(s.leftover), symbol)}</b>
        <p>กระเป๋าใบนี้บันทึกเงินเข้าไว้ ${unitAmount(s.fundedForeign, symbol)}
        แต่มีบิลที่ใช้กระเป๋านี้รวม ${unitAmount(s.spent, symbol)}</p>
        <p>เกือบทุกครั้งแปลว่า <b>ยังบันทึกการเติมเงินไม่ครบ</b> ไม่ใช่เงินหมดจริง</p>
        <p>บันทึกย้อนหลังได้เลย ใส่วันที่จริงของวันที่แลก ระบบคิดเรทเฉลี่ยใหม่ให้เองทั้งทริป
        และลำดับที่บันทึกไม่มีผลกับตัวเลข</p>`
    };
  }

  if (key === 'total') {
    return {
      title: 'เงินเข้าทั้งหมดนับจากอะไร',
      body: `<b>${unitAmount(s.fundedForeign, symbol)} · ต้นทุน ${unitBaht(s.fundedThb)}</b>
        <p>คือผลรวมของ <b>เงินตั้งต้น</b> ที่ใส่ไว้ตอนสร้างกระเป๋า บวกกับ <b>การเติมเงินทุกครั้ง</b>
        รวม ${lots.length} รายการ</p>
        <p>แถบด้านล่างคือสัดส่วนที่ใช้ไปแล้วเทียบกับยอดนี้</p>
        <p class="dim">กดปุ่ม 🕘 เพื่อดูว่าแต่ละครั้งเติมเมื่อไร เท่าไร ได้เรทเท่าไร</p>`
    };
  }

  if (key === 'carry') {
    return {
      title: 'ยกยอดไปทริปหน้า ทำงานอย่างไร',
      body: `<p>ตอนกด “ปิดทริป” เงินที่เหลือในกระเป๋าต้องถูกบอกว่าจะไปไหน
        ระบบไม่ยอมให้ปิดโดยไม่ระบุ เพราะเงินก้อนนั้นจะหายจากบัญชีเงียบ ๆ</p>
        <p><b>ไม่ติ๊ก (ค่าเริ่มต้น) = คืนเข้าบัญชี</b><br>
        ระบบตีเงินที่เหลือกลับเป็นบาทด้วยเรทของกระเป๋าใบนั้น แล้วลงบัญชีเป็นเงินรับคืน
        เหมาะกับกรณีเอาเงินสดที่เหลือไปแลกกลับ หรือเงินในบัตรถูกโอนคืน</p>
        <p><b>ติ๊ก = ยกยอดไปทริปหน้า</b><br>
        เงินที่เหลือไม่ถูกคืนเข้าบัญชี แต่ถูกบันทึกเป็น “ล็อตตั้งต้น” ของทริปถัดไป
        พร้อม<b>ต้นทุนเดิม</b> — เยนที่แลกไว้ที่ 0.2384 ฿ จะยังคิดที่ 0.2384 ฿ ในทริปหน้า
        ไม่ใช่เรทวันที่เริ่มทริปใหม่</p>
        <p>เหมาะกับเงินสดสกุลนั้นที่เก็บไว้ใช้ทริปหน้าจริง ๆ ไม่ได้แลกกลับ</p>
        <p class="dim">เลือกตรงนี้ล่วงหน้าได้ ยังไม่มีผลจนกว่าจะกดปิดทริป
        และตอนปิดยังทบทวนทีละกระเป๋าได้อีกครั้ง</p>`
    };
  }
  return { title: '', body: '' };
}

$('#walletGrid').addEventListener('click', event => {
  const button = event.target.closest('[data-wallet-info]');
  if (!button) return;
  const wallet = walletById(button.dataset.walletRef);
  if (!wallet) return;
  const row = walletInfoText(button.dataset.walletInfo, wallet);
  $('#walletInfoTitle').textContent = row.title;
  $('#walletInfoBody').innerHTML = row.body;
  closeLayers();
  mask.classList.add('open');
  $('#walletInfoDialog').classList.add('open');
  $('#walletInfoDialog').setAttribute('aria-hidden', 'false');
});

/* ── popup "เงินคงเหลือรายกระเป๋า" (2026-08-22) ────────────────────────
   สั่งโดย North: แถบสรุปด้านบนเหลือแค่ยอดรวม ส่วนรายละเอียดให้กดแล้วเด้งขึ้นมา
   เพราะเมื่อมีกระเป๋าหลายใบหลายสกุล ชิปที่เรียงต่อกันจะกินความสูงจนดันการ์ดหาย

   ⚠️ กระเป๋าที่ยังไม่มีเรทต้องขึ้นว่า "ยังตีเป็นบาทไม่ได้" ไม่ใช่ ฿0.00
      ฿0 แปลว่าไม่มีเงิน ซึ่งคนละเรื่องกับ "มีเงินแต่ยังไม่รู้ว่าเท่าไร"
      และห้ามถูกนับรวมในยอดล่างสุดด้วย */
function openWalletTotals() {
  const owned = wallets.filter(canSeeWallet);
  const groups = new Map();
  let bahtTotal = 0;
  let unpriced = 0;

  owned.forEach(wallet => {
    const s = walletSummary(wallet);
    const info = rateInfo(wallet.currency, wallet.id);
    const priced = info.rate !== null;
    if (priced) bahtTotal += s.leftover * info.rate; else unpriced += 1;
    const rows = groups.get(wallet.currency) || [];
    rows.push({ wallet, left: s.leftover, rate: info.rate, source: info.source, priced });
    groups.set(wallet.currency, rows);
  });

  const body = $('#walletTotalsBody');
  if (!owned.length) {
    body.innerHTML = `<p class="wtot-empty">ยังไม่มีกระเป๋าในทริปนี้</p>`;
  } else {
    body.innerHTML = `${[...groups.entries()].map(([code, rows]) => {
      const symbol = symbolFor(code);
      const native = rows.reduce((sum, row) => sum + row.left, 0);
      const baht = rows.filter(row => row.priced).reduce((sum, row) => sum + row.left * row.rate, 0);
      const label = currencyByCode(code)?.label || code;
      /* คอลัมน์ต้องตรงกันทุกกระเป๋า: สกุลต่างประเทศชิดขวา · @เรทชิดซ้าย · บาทชิดขวา
         ทุกแถวใช้ grid ชุดเดียวกัน (34px | 1fr | 96px | 1fr) แถวสรุปก็ใช้ชุดเดียวกัน
         โดยเว้นช่องแรกไว้ ตัวเลขจึงเรียงเป็นคอลัมน์เดียวจริง ไม่ใช่แค่ดูใกล้เคียง */
      return `
      <section class="wtot-group" style="--wc:${currencyHue(code)}">
        <header><b>${code}</b><span>${symbol} · ${label} · ${rows.length} กระเป๋า</span></header>
        ${rows.map(row => `
          <div class="wtot-row">
            <img src="${row.wallet.icon || DEFAULT_ICONS.wallet}" alt="">
            <b class="wtot-title">${row.wallet.label} <span>(${symbol})</span></b>
            <span class="wtot-native">${nativeAmount(row.left, symbol)}</span>
            ${row.priced
              ? `<span class="wtot-rate">@ ${row.rate.toFixed(4)} ฿</span>
                 <span class="wtot-baht">${signedBahtHtml(row.left * row.rate, false)}</span>`
              : `<span class="wtot-rate"></span>
                 <span class="wtot-none">ยังตีเป็นบาทไม่ได้</span>`}
          </div>`).join('')}
        ${rows.some(row => row.priced) ? `<p class="wtot-sub">
          <span class="wtot-sublabel">รวม</span>
          <b class="wtot-native">${nativeAmount(native, symbol)}</b>
          <span class="wtot-rate"></span>
          <span class="wtot-baht">${signedBahtHtml(baht, false)}</span></p>` : ''}
      </section>`;
    }).join('')}
    <p class="wtot-total"><span>รวมทุกกระเป๋า</span>${signedBahtHtml(bahtTotal, false)}</p>
    ${unpriced ? `<p class="wtot-warn">⚠️ ยอดรวมยังไม่นับอีก ${unpriced} กระเป๋าที่ยังไม่มีเรท · ตั้งเรทประมาณการหรือบันทึกการเติมเงินก่อน</p>` : ''}`;
  }

  closeLayers();
  mask.classList.add('open');
  $('#walletTotalsDialog').classList.add('open');
  $('#walletTotalsDialog').setAttribute('aria-hidden', 'false');
}

$('#walletSummary').addEventListener('click', event => {
  if (event.target.closest('#openWalletTotals')) openWalletTotals();
});

/* กาง/หุบประวัติเติมเงินของกระเป๋าใบนั้น ๆ */
$('#walletGrid').addEventListener('click', event => {
  const toggle = event.target.closest('[data-history-wallet]');
  if (!toggle) return;
  const id = toggle.dataset.historyWallet;
  if (openWalletHistory.has(id)) openWalletHistory.delete(id); else openWalletHistory.add(id);
  renderWallets();
});

/* ── ลบกระเป๋า (2026-08-22) ────────────────────────────────────────────
   🔴 กระเป๋าที่เคยใช้แล้วลบไม่ได้ ต้องลบบิลที่ผูกอยู่ให้หมดก่อน
      หน้าจอเช็กก่อนเพื่อบอกจำนวนบิลให้ชัด แต่ของจริงกันที่เซิร์ฟเวอร์ (409)
      เพราะบิลของคนอื่นในทริปเดียวกันอาจผูกกระเป๋านี้อยู่โดยที่เราไม่เห็น */
$('#walletGrid').addEventListener('click', event => {
  const button = event.target.closest('[data-del-wallet]');
  if (!button) return;
  const wallet = walletById(button.dataset.delWallet);
  if (!wallet || blockedByClose('wallets')) return;

  const used = billsUsing(wallet.id);
  if (used) {
    window.alert(`ลบ "${wallet.label}" ไม่ได้\n\nมีบิลผูกกับกระเป๋าใบนี้อยู่ ${used} รายการ`
      + `\nถ้าลบกระเป๋าไป บิลเหล่านั้นจะตีเป็นเงินบาทไม่ได้ ยอดรวมทริปจะลดลงโดยไม่มีอะไรเตือน`
      + `\n\nต้องลบรายการค่าใช้จ่ายทั้ง ${used} รายการนั้นออกก่อน จึงจะลบกระเป๋าได้`);
    return;
  }
  const lots = lotsOf(wallet.id).length;
  if (!window.confirm(`ลบกระเป๋า "${wallet.label}" ?`
    + (lots ? `\n\nประวัติการเติมเงิน ${lots} ครั้งของกระเป๋าใบนี้จะถูกลบไปด้วย` : '')
    + `\nกู้คืนไม่ได้`)) return;

  if (liveMode) {
    TripApi.removeWallet(wallet.id)
      .then(() => refreshFromServer())
      .then(() => showPrototypeToast(`ลบกระเป๋า ${wallet.label} แล้ว`))
      .catch(error => window.alert(error.message));
    return;
  }
  wallets = wallets.filter(row => row.id !== wallet.id);
  fundings = fundings.filter(row => row.walletId !== wallet.id);
  openWalletHistory.delete(wallet.id);
  renderBills();
  showPrototypeToast(`ลบกระเป๋า ${wallet.label} แล้ว`);
});

/* แก้ชื่อกระเป๋า — ใช้ฟอร์มเดียวกับตอนสร้าง */
$('#walletGrid').addEventListener('click', event => {
  const button = event.target.closest('[data-edit-wallet]');
  if (!button) return;
  openWalletDialog(walletById(button.dataset.editWallet));
});

/* แก้ไข/ลบล็อตเติมเงินรายครั้ง
   🔴 อยู่ในฟังก์ชันแยก เพราะมีสองที่ที่ลบได้: ประวัติในการ์ดกระเป๋า
      และรายการล่าสุด · ถ้าเขียนสองชุด วันหนึ่งจะมีที่หนึ่งลืมถามยืนยัน
      หรือลืมเช็คว่าทริปปิดอยู่ ซึ่งเป็นการลบเงินโดยไม่มีใครตั้งใจ */
function deleteFundingLot(lotId) {
  const lot = fundings.find(row => row.id === lotId);
  if (!lot || blockedByClose('fundings')) return;
  const symbol = symbolFor(walletById(lot.walletId)?.currency);
  if (!window.confirm(`ลบการเติมเงิน ${unitAmount(lot.foreign, symbol)} เมื่อ ${thaiDateShort(lot.date)} ?`
    + `\n\nเรทเฉลี่ยของกระเป๋าใบนี้จะถูกคิดใหม่ · ยอดบาทของบิลที่ใช้กระเป๋านี้จะขยับตาม`)) return;

  if (liveMode) {
    TripApi.removeFunding(lot.id)
      .then(() => refreshFromServer())
      .then(() => showPrototypeToast('ลบรายการเติมเงินแล้ว · เรทเฉลี่ยคำนวณใหม่'))
      .catch(error => window.alert(error.message));
    return;
  }
  fundings = fundings.filter(row => row.id !== lot.id);
  renderBills();
  showPrototypeToast('ลบรายการเติมเงินแล้ว · เรทเฉลี่ยคำนวณใหม่');
}

function bindLotActions(container) {
  const node = typeof container === 'string' ? $(container) : container;
  if (!node) return;
  node.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-lot]');
    if (edit) { openFundDialog(null, fundings.find(row => row.id === edit.dataset.editLot)); return; }
    const del = event.target.closest('[data-del-lot]');
    if (del) deleteFundingLot(del.dataset.delLot);
  });
}
bindLotActions('#walletGrid');
bindLotActions('#walletActivity');

/* ── การ์ด "กิจกรรมถัดไป" (2026-08-18) ────────────────────────────────
   เดิมเป็นข้อความตายตัวใน index.html ทุกทริปจึงเห็น "14:30 · Akanko Ainu Kotan
   · ออกในอีก 35 นาที" เหมือนกันหมด ทั้งที่เป็นการ์ดที่เด่นที่สุดบนหน้าแรก
   คนอ่านแล้วเชื่อว่าเป็นของจริง — ผิดแบบที่อันตรายกว่าช่องว่าง

   ⚠️ "ถัดไป" ตัดสินจากนาฬิกาจริงเทียบกับเวลาในแผน ไม่ใช่กิจกรรมแรกของวัน
   ถ้าเลยเวลาไปหมดแล้วต้องบอกตรง ๆ ว่าหมดวันแล้ว ไม่ใช่วนกลับไปโชว์อันแรก
   ซึ่งจะกลายเป็นบอกให้ไปที่ที่ไปมาแล้วเมื่อเช้า */
const selectedStopByDay = new Map();

function renderNextActivity() {
  const day = planDays.find(item => item.id === journeyStops[previewJourneyIndex]?.dayId)
    || planDays.find(item => item.id === activePlanDayId)
    || planDays[0];
  const allActs = day?.activities || [];
  const acts = allActs.filter(act => act.visitStatus !== 'SKIPPED');

  if (!acts.length) {
    $('#nextKicker').textContent = 'เลือกสถานที่ที่กำลังจะไป';
    $('#dayStopChoices').innerHTML = '';
    $('#nextTime').textContent = '—';
    $('#nextName').textContent = 'ยังไม่มีกิจกรรมในวันนี้';
    $('#nextDetail').textContent = day ? 'เพิ่มสถานที่ได้ในหน้าแผนเที่ยว' : '';
    $('#selectedStopWeather').textContent = '—';
    $('#selectedStopHighlight').textContent = 'ยังไม่ได้ระบุ';
    $('#selectedStopDocs').textContent = 'ไม่มีเอกสาร';
    $('#openRoute').disabled = true;
    $('#openRoute').dataset.stop = '';
    $('#checkIn').dataset.stop = '';
    $('#skipCurrentStop').dataset.stop = '';
    $('#skipCurrentStop').disabled = true;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = toMinutes;   // ใช้ตัวกลาง อย่าลอกซ้ำ — เคยพังเพราะมีสามชุดที่ไม่ตรงกัน

  const isRealToday = day.date === today;
  const upcoming = isRealToday
    ? acts.find(act => { const t = toMin(act.time); return t === null || t >= nowMin; })
    : acts[0];
  const fallback = upcoming || acts[acts.length - 1];
  const selectedId = selectedStopByDay.get(day.id);
  const selected = allActs.find(act => act.id === selectedId) || fallback;
  selectedStopByDay.set(day.id, selected.id);

  $('#nextKicker').textContent = `เลือกสถานที่ใน Day ${String(day.day).padStart(2, '0')}`;
  $('#dayStopChoices').innerHTML = allActs.map(act => `
    <button type="button" class="day-stop-choice ${act.id === selected.id ? 'active' : ''} ${act.visitStatus === 'SKIPPED' ? 'skipped' : ''}" data-select-stop="${act.id}">
      <img src="${act.image || `${ART}st_camera2.png`}" alt=""><b>${act.name}</b><small>${act.time || 'ไม่ระบุเวลา'}</small>
      <em>${act.visitStatus === 'SKIPPED' ? 'ข้ามแล้ว' : presence[viewerId]?.stopId === act.id ? 'เช็กอินแล้ว' : act.id === fallback.id ? 'ถัดไป' : 'ตามแผน'}</em>
    </button>`).join('');
  $$('[data-select-stop]').forEach(button => button.addEventListener('click', () => {
    selectedStopByDay.set(day.id, button.dataset.selectStop);
    renderNextActivity();
    renderPresence();
  }));

  $('#nextTime').textContent = selected.time
    ? `${selected.time}${selected.endTime ? `–${selected.endTime}` : ''}`
    : 'ไม่ระบุเวลา';
  $('#nextName').textContent = selected.name;
  $('#nextDetail').textContent = selected.detail || selected.tag || 'ยังไม่มีรายละเอียด';
  $('#nextIcon').src = selected.image || `${ART}st_camera2.png`;
  $('#selectedStopHighlight').textContent = selected.highlight ? `⭐ ${selected.highlight}` : 'ยังไม่ได้ระบุ';
  const docs = docsForStop(selected.id);
  $('#selectedStopDocs').textContent = docs.length ? `📎 ${docs.length} เอกสาร` : 'ไม่มีเอกสาร';
  $('#openRoute').disabled = !hasCoords(selected) || selected.visitStatus === 'SKIPPED';
  $('#openRoute').dataset.stop = selected.id;
  $('#checkIn').dataset.stop = selected.id;
  $('#skipCurrentStop').disabled = false;
  $('#skipCurrentStop').dataset.stop = selected.id;
  $('#skipCurrentStop').textContent = selected.visitStatus === 'SKIPPED' ? 'นำกลับเข้าแผน' : 'ข้ามสถานที่นี้';
  renderSelectedStopWeather(day, selected);
}

/* เปิดเส้นทางในแอปแผนที่ของเครื่อง — ใช้พิกัดจริง ไม่ใช่ค้นจากชื่อ
   ชื่อไทยอย่าง "ร้านราเมงลุงโตะ" ค้นในกูเกิลแมปที่ญี่ปุ่นมักไม่เจอ */
$('#openRoute').addEventListener('click', () => {
  const id = $('#openRoute').dataset.stop;
  const act = planDays.flatMap(day => day.activities || []).find(item => item.id === id);
  if (!hasCoords(act)) return showPrototypeToast('ยังไม่มีพิกัดของสถานที่นี้');
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const url = appleDevice
    ? `https://maps.apple.com/?daddr=${act.lat},${act.lon}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${act.lat},${act.lon}`;
  window.open(url, '_blank', 'noopener');
});

$('#skipCurrentStop').addEventListener('click', () => {
  const stopId = $('#skipCurrentStop').dataset.stop || $('#checkIn').dataset.stop;
  const day = planDays.find(item => item.activities?.some(act => act.id === stopId));
  const activity = day?.activities.find(act => act.id === stopId);
  if (day && activity) togglePlanStopSkipped(day, activity);
});

/* "ใช้วันนี้" now sums the bills actually linked to today's activities
   instead of quoting a fixed number that never moved. */
function renderMoneyStrip() {
  /* ⚠️ อ่านแบบกันพัง — journeyStops ถูกสร้างใหม่จากวันจริงตอนเข้าโหมดข้อมูลจริง
     จำนวนวันจึงไม่คงที่ ต่างจากตอนเป็นข้อมูลตัวอย่างที่มี 11 เสมอ */
  const today = journeyStops[actualJourneyIndex] || journeyStops[0];
  const todayId = today?.dayId;
  const todayDay = planDays.find(day => day.id === todayId);
  const todayActivityIds = (todayDay?.activities || []).map(a => a.id);
  const readable = bills.filter(bill => canSee(bill));

  /* 🔴 เดิมกรองจาก bill.activityId อย่างเดียว ซึ่งในโหมดข้อมูลจริงเป็น null เสมอ
     (ฐานยังไม่มีคอลัมน์ stop_id) ยอด "ใช้วันนี้" จึงเป็น ฿0 ตลอดโดยไม่มี error
     ตอนนี้นับสองทาง: บิลที่ผูกจุดแวะของวันนี้ **หรือ** บิลที่ลงวันที่ตรงกับวันนี้
     — วันที่เชื่อถือได้เสมอ ส่วนการผูกจุดเป็นของเสริมที่คนอาจไม่ได้กรอก */
  const ofToday = bill => todayActivityIds.includes(bill.activityId)
    || (todayDay?.date && bill.date === todayDay.date);
  const todayBills = readable.filter(ofToday);
  const todayThb = todayBills.reduce((sum, bill) => sum + billBaht(bill), 0);
  const tripThb = readable.reduce((sum, bill) => sum + billBaht(bill), 0);
  const left = TRIP_BUDGET_THB - tripThb;

  $('#spentLabel').textContent = `ใช้วันนี้ (Day ${today?.day ?? '—'})`;
  $('#spentToday').textContent = unitBaht(todayThb);
  $('#spentTodayNote').textContent = todayBills.length
    ? `จาก ${todayBills.length} บิลของวันนี้`
    : 'ยังไม่มีบิลของวันนี้';
  $('#budgetLeft').textContent = unitBaht(left);
  $('#budgetNote').textContent = `${Math.round(Math.max(0, left) / TRIP_BUDGET_THB * 100)}% ของงบ ${fmtAmount(TRIP_BUDGET_THB, '฿')}`;
  $('#budgetLeft').classList.toggle('over', left < 0);
}

/* รูปประจำตัวสมาชิก (2026-08-23) — North: "ให้เพิ่ม icon คนแทนตัวอักษร"
   ⚠️ ยังไม่มีรูปก็ต้องแสดงอะไรสักอย่างที่แยกคนออกจากกันได้
      จึงถอยไปใช้ตัวอักษรตัวแรก + สีประจำตัวเหมือนเดิม ไม่ใช่ขึ้นวงกลมว่าง
      (คนที่ยังไม่ตั้งรูปมักเป็นคนที่เพิ่งถูกเพิ่มเข้ามา ซึ่งเป็นตอนที่
       ต้องแยกให้ออกมากที่สุดพอดี) */
function memberAvatar(member, size = '') {
  const tint = MEMBER_TINT?.[member.id] || '#e6f0fa';
  return member.avatar
    ? `<img class="face photo ${size}" src="${member.avatar}" alt="">`
    : `<i class="face ${size}" style="background:${tint}">${member.name[0]}</i>`;
}

function renderMembers() {
  /* แถวสมาชิกทำสองหน้าที่: กดที่ตัวแถว = สลับมุมมอง · กดปุ่ม ✏️ = แก้ข้อมูลคนนั้น
     🔴 ปุ่มซ้อนในปุ่มเป็น HTML ที่ไม่ถูกต้อง เบราว์เซอร์จะย้ายมันออกมาเอง
        แล้ว layout เพี้ยนแบบหาสาเหตุยาก — แถวจึงเป็น <div> แล้วให้ปุ่มอยู่ข้างใน */
  const canManage = !liveMode || liveCanManageMembers;

  /* ── สถานะการเข้าใช้งาน — "แสดงข้อมูลไว้" ตามที่ North สั่ง (2026-08-23) ──
     ป้ายบอกสองเรื่องแยกกัน เพราะเป็นคนละเรื่องจริง ๆ:
       · ผูกบัญชีครอบครัวไว้ไหม (👤) — เข้าได้อยู่แล้วผ่านบัญชีตัวเอง
       · มีรหัสของทริปนี้ไหม (🔑) — ทางเข้าเพิ่มสำหรับเครื่องที่ไม่ได้ล็อกอิน

     🔴 เดิมผมซ่อนปุ่มรหัสของคนที่มีบัญชีครอบครัวไว้ เพราะเข้าใจว่ารหัส "ไม่มีผล"
        กับคนกลุ่มนั้น — ไม่จริง memberLogin() ฝั่งเซิร์ฟเวอร์ไม่เคยอ่าน user_id เลย
        ใครมี passcode_hash ก็เข้าได้ · ตอนนี้จึงตั้งรหัสได้ทุกคน */
  const access = member => {
    const tags = [];
    if (member.userId) tags.push('<em class="access-tag own">👤 บัญชีครอบครัว</em>');
    tags.push(member.hasPasscode
      ? '<em class="access-tag ok">🔑 มีรหัส</em>'
      : `<em class="access-tag off">${member.userId ? '— ไม่มีรหัส' : '— ยังเข้าไม่ได้'}</em>`);
    /* 🔴 ไม่มีปุ่มรหัสบนแถวแล้ว (North 2026-08-23: "ตั้งรหัสเอาออก มีอยู่ในแก้ไขแล้วไง")
       การตั้งรหัสอยู่ในฟอร์มแก้ไขที่ปุ่ม ✏️ เปิด — ปุ่มที่สองที่เปิดหน้าต่างเดียวกัน
       เป็นแค่ของรก แถวยิ่งแคบยิ่งกดพลาด · แถวนี้เหลือหน้าที่เดียวคือ "บอกสถานะ" */
    return { tags: tags.join('') };
  };

  const row = member => {
    const keeper = member.managedBy ? memberById(member.managedBy) : null;
    const a = access(member);
    return `
    <div class="member-row ${member.id === viewerId ? 'viewing' : ''}">
      <button type="button" class="member-face" data-view-as="${member.id}"
        title="ดูแอปในมุมมองของ ${member.name}">
        ${memberAvatar(member)}
        <span><b>${member.name}${member.admin ? ' <em class="admin-tag">ผู้ดูแล</em>' : ''}</b>
          <small>${member.role}${keeper ? ` · ${keeper.name} จดแทนได้` : ''}</small></span>
      </button>
      <span class="member-tools">
        ${a.tags}
        ${member.id === viewerId ? '<em class="viewing-tag">กำลังดูอยู่</em>' : ''}
        ${canManage ? `<button type="button" class="member-edit" data-edit-member="${member.id}"
          title="แก้ไข ${member.name}" aria-label="แก้ไข ${member.name}">✏️</button>` : ''}
      </span>
    </div>`;
  };

  /* ── แบ่งสองกลุ่มตามที่ North เลือก (2026-08-23) ───────────────────
     บัญชีหลัก = ยอดไหลเข้าสมุดบัญชีครอบครัวจริงตอนปิดทริป
     เฉพาะทริป = เก็บเป็นประวัติของทริปเท่านั้น

     🔴 ต้องแยกให้เห็นชัด เพราะเป็นความต่างที่ "มีผลกับเงินจริง" แต่มองไม่เห็น
        จากหน้าตาแถว — ตั้งผิดกลุ่มแล้วรู้ตัวอีกทีตอนปิดทริป ซึ่งสายไปแล้ว */
  const main = members.filter(m => m.ledgerMode !== 'TRIP_ONLY');
  const tripOnly = members.filter(m => m.ledgerMode === 'TRIP_ONLY');
  const group = (title, note, list) => list.length ? `
    <div class="member-group">
      <p class="member-group-head"><b>${title}</b><small>${note}</small><em>${list.length} คน</em></p>
      ${list.map(row).join('')}
    </div>` : '';

  $('#memberRows').innerHTML =
    group('ลงบัญชีหลัก', 'ยอดไหลเข้าบัญชีครอบครัวจริงตอนปิดทริป', main)
    + group('เฉพาะทริป', 'เก็บเป็นประวัติของทริป ไม่แตะบัญชีจริง', tripOnly)
    || `<p class="field-note">ยังไม่มีสมาชิกในทริปนี้</p>`;

  const add = $('#addMember');
  if (add) {
    add.hidden = !canManage;
    add.title = canManage ? '' : 'เพิ่มสมาชิกได้เฉพาะผู้ดูแลทริป';
  }
}

/* ── เพิ่ม/แก้/ลบสมาชิก (2026-08-23) ───────────────────────────────────
   North: "ให้เพิ่ม คนและสิทธิ์ได้ด้วย"
   ฝั่งเซิร์ฟเวอร์กันไว้อีกชั้น (403 ถ้าไม่ใช่ผู้ดูแล) — ตรงนี้แค่ซ่อนปุ่ม
   เพื่อไม่ให้คนกดแล้วเจอ error โดยไม่รู้ว่าทำอะไรผิด */
let editingMemberId = '';
/* รูปที่เลือกไว้ในฟอร์ม · ว่าง = ใช้ตัวอักษรตัวแรกของชื่อ */
let newMemberAvatar = '';

function paintMemberAvatarPreview() {
  const box = $('#memberAvatarPreview');
  if (!box) return;
  const name = ($('#memberName')?.value || '?').trim() || '?';
  box.innerHTML = newMemberAvatar
    ? `<img src="${newMemberAvatar}" alt="">`
    : `<i>${name[0]}</i>`;
  const clear = $('#clearMemberAvatar');
  if (clear) clear.hidden = !newMemberAvatar;
}

$('#pickMemberAvatar').addEventListener('click', () => openAssetPicker('member', newMemberAvatar, src => {
  newMemberAvatar = src;
  paintMemberAvatarPreview();
  mask.classList.add('open');
  $('#memberDialog').classList.add('open');
  $('#memberDialog').setAttribute('aria-hidden', 'false');
}));

$('#clearMemberAvatar').addEventListener('click', () => {
  newMemberAvatar = '';
  paintMemberAvatarPreview();
});

// พิมพ์ชื่อแล้วตัวอักษรสำรองต้องเปลี่ยนตามทันที ไม่ใช่ค้างเป็นตัวเดิม
$('#memberName').addEventListener('input', () => { if (!newMemberAvatar) paintMemberAvatarPreview(); });
$('#memberLedger').addEventListener('change', syncMemberLedgerFields);

/* บัญชีในครอบครัว — โหลดครั้งเดียวแล้วใช้ซ้ำ (รายชื่อไม่ค่อยเปลี่ยน) */
let familyUsers = [];

async function loadFamilyUsers() {
  if (!liveMode || familyUsers.length) return;
  try {
    familyUsers = (await TripApi.listFamilyUsers()).users || [];
  } catch (error) {
    console.error('load family users failed', error);
    familyUsers = [];
  }
}

/* ช่อง "ผูกกับบัญชี" โผล่เฉพาะเมื่อเลือกลงบัญชีหลัก
   🔴 เฉพาะทริปต้องไม่มีการผูกบัญชีค้างไว้ ไม่งั้นคนที่เคยเป็น MAIN แล้วเปลี่ยน
      เป็น TRIP_ONLY จะยังล็อกอินด้วยบัญชีครอบครัวเข้ามาเห็นทริปได้เหมือนเดิม */
function syncMemberLedgerFields() {
  const isMain = $('#memberLedger').value === 'MAIN';
  const field = $('#memberUserField');
  if (field) field.hidden = !isMain;
  $('#memberUser').required = isMain;
}

function paintMemberPickers(member) {
  const used = new Set(members
    .filter(row => row.id !== member?.id && row.userId)
    .map(row => row.userId));
  const linked = member?.userId || '';
  $('#memberUser').innerHTML = `<option value="">— เลือกบัญชี —</option>`
    + familyUsers.map(user => {
      // บัญชีที่ถูกผูกกับคนอื่นแล้วต้องเลือกไม่ได้ ไม่ใช่ปล่อยให้เลือกแล้วโดน 409
      const taken = used.has(user.user_id);
      return `<option value="${user.user_id}"${linked === user.user_id ? ' selected' : ''}${
        taken ? ' disabled' : ''}>${user.name}${taken ? ' (ผูกกับคนอื่นแล้ว)' : ''}</option>`;
    }).join('');

  $('#memberKeeper').innerHTML = `<option value="">— ไม่มี —</option>`
    + members.filter(row => row.id !== member?.id)
      .map(row => `<option value="${row.id}"${member?.managedBy === row.id ? ' selected' : ''}>${row.name}</option>`).join('');
}

/* ── ส่วน "การเข้าใช้งาน" ในฟอร์มแก้ไขสมาชิก (North 2026-08-23) ────────
   "ในส่วนผู้ใช้ที่มีบัญชีหลัก ให้ตั้งรหัสเข้าใช้ได้ด้วย เอาไว้หน้าเดียวกับแก้ไข
    ได้ไหม แล้วแสดงข้อมูลไว้"

   🔴 ตั้งรหัสได้ทุกคน ไม่เว้นคนที่ผูกบัญชีครอบครัว — ก่อนหน้านี้ผมซ่อนปุ่มไว้
      เพราะเข้าใจว่ารหัส "ไม่มีผล" กับคนกลุ่มนั้น ซึ่งไม่ตรงกับความจริง:
      memberLogin() ฝั่งเซิร์ฟเวอร์ไม่เคยอ่าน user_id เลย ใครมี passcode_hash ก็เข้าได้
      สำหรับคนที่มีบัญชีอยู่แล้ว รหัสจึงเป็น "ประตูที่สอง" (เข้าจากเครื่องที่ไม่ได้
      ล็อกอินบัญชีครอบครัว) ไม่ใช่ประตูเดียว — และนั่นคือสิ่งที่ต้องบอกบนจอ */
function paintMemberAccess(member) {
  const block = $('#memberAccessBlock');
  if (!block) return;

  /* โหมดข้อมูลตัวอย่างไม่มีเซิร์ฟเวอร์ให้บันทึกรหัส — ซ่อนทั้งก้อน
     ช่องที่กรอกแล้วไม่มีผลแย่กว่าไม่มีช่องเลย */
  block.hidden = !liveMode;
  if (!liveMode) return;

  const linked = member?.userId ? familyUsers.find(user => user.user_id === member.userId) : null;
  const lines = [];
  if (!member) {
    lines.push(`<p class="access-line new">ตั้งรหัสไปพร้อมกับการเพิ่มคนได้เลย · เว้นว่างไว้ก็ได้ ค่อยมาตั้งทีหลัง</p>`);
  } else if (member.userId) {
    lines.push(`<p class="access-line own">👤 <b>เข้าผ่านบัญชีครอบครัว${
      linked ? ` “${linked.name}”` : ''}</b> ได้อยู่แล้ว — ถอนรหัสไปก็ยังเข้าได้ตามปกติ</p>`);
  } else {
    lines.push(`<p class="access-line trip">🧳 <b>ผู้ร่วมทริป</b> ไม่มีบัญชีครอบครัว —
      รหัสนี้คือทางเข้าทางเดียวของเขา ถอนรหัส = เข้าไม่ได้อีก</p>`);
  }
  if (member) {
    lines.push(member.hasPasscode
      ? `<p class="access-line ok">🔑 <b>ตั้งรหัสไว้แล้ว</b> · ตั้งใหม่จะทับของเดิมทันที และถ้าเขาล็อกอินค้างอยู่จะถูกตัดออก</p>`
      : `<p class="access-line off">— <b>ยังไม่มีรหัส</b>${
        member.userId ? ' · ตั้งได้ถ้าอยากให้เข้าจากเครื่องที่ไม่ได้ล็อกอินบัญชีครอบครัว' : ' · เขายังเข้าทริปไม่ได้'}</p>`);
  }
  $('#memberAccessInfo').innerHTML = lines.join('');

  $('#passcodeInput').value = '';
  $('#passcodeConfirm').value = '';
  setPasscodeVisible(false);
  /* ถอนรหัสของที่ยังไม่มีไม่มีความหมาย — และตอนเพิ่มคนใหม่ยังไม่มีอะไรให้ถอน */
  $('#passcodeClear').hidden = !member?.hasPasscode;
}

function setPasscodeVisible(shown) {
  $('#passcodeShow').checked = shown;
  ['#passcodeInput', '#passcodeConfirm'].forEach(selector => {
    $(selector).type = shown ? 'text' : 'password';
  });
}
$('#passcodeShow')?.addEventListener('change', event => setPasscodeVisible(event.target.checked));

/* ตรวจรหัสก่อนยิง · คืน null = ไม่ได้ตั้งรหัสรอบนี้ (เว้นว่างไว้) · คืน false = ไม่ผ่าน
   🔴 "สองช่องไม่ตรงกัน" เซิร์ฟเวอร์ไม่มีทางรู้ได้เลย ต้องจับที่นี่ที่เดียว
      ถ้าหลุดไป คนตั้งจะรู้ตัวอีกทีตอนเจ้าตัวเข้าไม่ได้ ซึ่งสายไปแล้ว */
function readNewPasscode() {
  const passcode = $('#passcodeInput').value.trim();
  const confirmCode = $('#passcodeConfirm').value.trim();
  if (!passcode && !confirmCode) return null;
  if (passcode.length < 6) { $('#memberError').textContent = 'รหัสต้องยาวอย่างน้อย 6 ตัวอักษร'; return false; }
  if (passcode !== confirmCode) { $('#memberError').textContent = 'รหัสสองช่องไม่ตรงกัน — พิมพ์ใหม่อีกครั้ง'; return false; }
  return passcode;
}

/* คัดลอกลิงก์กับรหัสพร้อมกัน — เป็นสิ่งที่ต้องส่งต่อจริงหลังตั้งรหัสเสร็จ
   อ่านรหัสจากช่องที่พิมพ์อยู่ ไม่ใช่จากเซิร์ฟเวอร์ เพราะเซิร์ฟเวอร์เก็บแต่ค่าที่เข้ารหัสแล้ว */
$('#passcodeCopyBoth')?.addEventListener('click', async () => {
  const passcode = $('#passcodeInput').value.trim();
  if (!passcode) { $('#memberError').textContent = 'พิมพ์รหัสก่อนถึงจะคัดลอกไปส่งได้'; return; }
  const name = $('#memberName').value.trim();
  try {
    await navigator.clipboard.writeText(
      `ลิงก์เข้าทริป: ${joinLinkUrl()}\nชื่อที่เลือก: ${name}\nรหัส: ${passcode}`);
    showPrototypeToast('คัดลอกลิงก์พร้อมรหัสแล้ว · อย่าลืมกดบันทึกด้วย');
  } catch {
    $('#memberError').textContent = 'คัดลอกอัตโนมัติไม่ได้ในเบราว์เซอร์นี้ — ลอกด้วยมือแทน';
  }
});

$('#passcodeClear')?.addEventListener('click', () => {
  const member = memberById(editingMemberId);
  if (!member) return;
  const extraDoor = Boolean(member.userId);
  if (!confirm(`ถอนรหัสเข้าใช้งานของ ${member.name} ?\n\n`
    + (extraDoor
      ? `เขายังเข้าผ่านบัญชีครอบครัวได้ตามปกติ — ถอนแค่ทางเข้าด้วยรหัส\n`
      : `รหัสจะถูกลบ และถ้าเขาล็อกอินค้างอยู่จะถูกตัดออกทันที\nชื่อยังอยู่ในทริป บิลเก่ายังอยู่ครบ\n`)
    + `ตั้งรหัสใหม่ให้เข้าได้อีกเมื่อไรก็ได้`)) return;
  $('#memberError').textContent = 'กำลังถอนรหัส…';
  TripApi.setMemberPasscode(member.id, '')
    .then(() => refreshFromServer())
    .then(() => { closeLayers(); showPrototypeToast(`ถอนรหัสของ ${member.name} แล้ว`); })
    .catch(error => { $('#memberError').textContent = error.message; });
});

function openMemberDialog(member = null) {
  closeLayers();
  editingMemberId = member ? member.id : '';
  $('#memberDialogTitle').textContent = member ? `แก้ไข ${member.name}` : 'เพิ่มสมาชิก';
  $('#memberName').value = member?.name || '';
  $('#memberRole').value = member?.role && member.role !== 'สมาชิก' ? member.role : '';
  $('#memberLedger').value = member?.ledgerMode || 'MAIN';
  $('#memberAdmin').checked = Boolean(member?.admin);
  newMemberAvatar = member?.avatar || '';
  paintMemberAvatarPreview();
  paintMemberPickers(member);
  syncMemberLedgerFields();
  // รายชื่อบัญชีอาจยังไม่ถูกโหลด — โหลดตามหลังแล้ววาดใหม่ ไม่บล็อกการเปิดฟอร์ม
  loadFamilyUsers().then(() => {
    if (!$('#memberDialog').classList.contains('open')) return;
    paintMemberPickers(member);
    /* วาดส่วนการเข้าใช้งานซ้ำด้วย — ชื่อบัญชีครอบครัวที่โชว์อยู่ในนั้นอ่านจาก
       familyUsers ซึ่งเพิ่งมาถึงตอนนี้ ถ้าไม่วาดซ้ำจะค้างเป็น "บัญชีครอบครัว" เฉย ๆ */
    paintMemberAccess(member);
  });
  paintMemberAccess(member);
  $('#memberError').textContent = '';
  $('#memberSubmit').textContent = member ? 'บันทึกการแก้ไข' : 'เพิ่มสมาชิก';
  /* ลบตัวเองไม่ได้ — ปุ่มจึงไม่ควรโผล่มาให้กดตั้งแต่แรก
     (เซิร์ฟเวอร์ก็ปฏิเสธ แต่ปุ่มที่กดแล้วโดนด่าคือดีไซน์ที่ไม่ดี) */
  $('#deleteMemberBtn').hidden = !member || member.id === viewerId;
  openDialog('#memberDialog');
}

$('#addMember').addEventListener('click', () => openMemberDialog(null));

/* ✏️ คือปุ่มเดียวที่เข้าไปแก้อะไรก็ตามของคนนั้น รวมถึงรหัสเข้าใช้งาน
   🔴 ห้ามเพิ่มปุ่มที่สองบนแถวที่เปิดหน้าต่างเดียวกันอีก — เคยมีปุ่ม 🔑 แล้ว
      North ให้เอาออก ("ตั้งรหัสเอาออก มีอยู่ในแก้ไขแล้วไง") แถวมีหน้าที่บอกสถานะพอ */
$('#memberRows').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-member]');
  if (!edit) return;
  openMemberDialog(memberById(edit.dataset.editMember));
});

$('#memberForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#memberName').value.trim();
  if (!name) { $('#memberError').textContent = 'ตั้งชื่อสมาชิกก่อน'; return; }
  const editing = editingMemberId ? memberById(editingMemberId) : null;
  const member = {
    id: editing ? editing.id : `m-${Date.now()}`,
    name,
    role: $('#memberRole').value.trim() || 'สมาชิก',
    ledgerMode: $('#memberLedger').value === 'TRIP_ONLY' ? 'TRIP_ONLY' : 'MAIN',
    admin: $('#memberAdmin').checked,
    avatar: newMemberAvatar,
    userId: $('#memberLedger').value === 'MAIN' ? $('#memberUser').value : '',
    managedBy: $('#memberKeeper').value
  };
  if (liveMode && member.ledgerMode === 'MAIN' && !member.userId) {
    $('#memberError').textContent = 'คนที่ลงบัญชีหลักต้องผูกกับบัญชีในครอบครัว · เลือกชื่อจากรายการ';
    return;
  }

  /* รหัสอยู่ในฟอร์มเดียวกันแล้ว จึงบันทึกด้วยปุ่มเดียวกัน (North 2026-08-23)
     คืน false = กรอกมาแต่ไม่ผ่าน → หยุดทั้งการบันทึก ไม่ใช่บันทึกชื่อแล้วทิ้งรหัส
     ซึ่งจะทำให้คนตั้งเข้าใจว่าตั้งรหัสสำเร็จแล้วทั้งที่ไม่ */
  const passcode = liveMode ? readNewPasscode() : null;
  if (passcode === false) return;

  const message = editing ? `แก้ไข ${name} แล้ว` : `เพิ่ม ${name} เข้าทริปแล้ว`;

  if (liveMode) {
    submitLive('#memberError', async () => {
      /* คนใหม่ได้ member_id จากเซิร์ฟเวอร์ (ฝั่งนี้ตั้ง `m-...` ไว้ชั่วคราวเท่านั้น)
         ต้องใช้ id ที่เซิร์ฟเวอร์คืนมาตั้งรหัส ไม่ใช่ id ชั่วคราว ไม่งั้นได้ 404 */
      const saved = await TripApi.saveMember(member);
      if (passcode) await TripApi.setMemberPasscode(saved?.member_id || member.id, passcode);
    }, passcode ? `${message} · ตั้งรหัสให้แล้ว` : message)
      .then(() => showScreen('more'));
    return;
  }
  if (editing) {
    members[members.findIndex(row => row.id === editing.id)] = member;
  } else {
    members.push(member);
  }
  editingMemberId = '';
  closeLayers();
  renderBills();
  showScreen('more');
  showPrototypeToast(message);
});

$('#deleteMemberBtn').addEventListener('click', () => {
  const member = memberById(editingMemberId);
  if (!member) return;

  /* เช็คฝั่งหน้าจอก่อนเพื่อบอกเหตุผลให้ชัด แต่ของจริงกันที่เซิร์ฟเวอร์ (409)
     เพราะบิลของคนอื่นที่เรามองไม่เห็นก็อาจอ้างถึงคนนี้อยู่ */
  const owns = bills.filter(bill => bill.payerId === member.id || bill.ownerId === member.id).length;
  const walletCount = wallets.filter(row => row.ownerId === member.id).length;
  const shares = bills.filter(bill => (bill.participants || [])
    .some(row => row.memberId === member.id)).length;
  if (owns || walletCount || shares) {
    window.alert(`ลบ ${member.name} ไม่ได้\n\n`
      + `${owns ? `· บิลที่จ่ายหรือเป็นเจ้าของยอด ${owns} รายการ\n` : ''}`
      + `${walletCount ? `· กระเป๋าเงิน ${walletCount} ใบ\n` : ''}`
      + `${shares ? `· ถูกใส่ไว้ในรายชื่อผู้ร่วมหาร ${shares} บิล\n` : ''}`
      + `\nถ้าลบไป บิลจะอ้างถึงคนที่ไม่มีตัวตน ยอดหารเงินจะเพี้ยนโดยไม่มีอะไรฟ้อง`
      + `\nต้องเอาข้อมูลเหล่านั้นออกก่อน`);
    return;
  }
  if (!window.confirm(`ลบ ${member.name} ออกจากทริปนี้?`)) return;

  if (liveMode) {
    TripApi.removeMember(member.id)
      .then(() => refreshFromServer())
      .then(() => { closeLayers(); showPrototypeToast(`ลบ ${member.name} แล้ว`); })
      .catch(error => { $('#memberError').textContent = error.message; });
    return;
  }
  members = members.filter(row => row.id !== member.id);
  if (viewerId === member.id) viewerId = members[0]?.id || '';
  editingMemberId = '';
  closeLayers();
  renderBills();
  showPrototypeToast(`ลบ ${member.name} แล้ว`);
});

/* ── Trip currencies ──────────────────────────────────────────────── */
const currencyDialog = $('#currencyDialog');
let editingCurrency = null;
let currencyIcon = DEFAULT_ICONS.currency;

/* Reopens the currency form after picking, same pattern as the other forms. */
$('#pickCurrencyIcon').addEventListener('click', () => openAssetPicker('currency', currencyIcon, src => {
  currencyIcon = src;
  $('#currencyIconPreview').src = src;
  mask.classList.add('open');
  currencyDialog.classList.add('open');
  currencyDialog.setAttribute('aria-hidden', 'false');
}));

function walletsUsing(code) {
  return wallets.filter(wallet => wallet.currency === code);
}

function renderCurrencies() {
  const canManageCurrencies = !liveMode || liveCanManageSharedSettings;
  $('#currencyRows').innerHTML = tripCurrencies.map(currency => {
    const used = walletsUsing(currency.code);
    const funded = used.some(wallet => walletRate(wallet.id) !== null);
    const state = currency.base ? 'สกุลหลักของทริป'
      : (funded ? 'มีการเติมเงินจริงแล้ว · ใช้เรทเฉลี่ยจริง' : 'ยังไม่มีการเติมเงิน · ใช้เรทประมาณการ');
    return `
    <div class="currency-row">
      <span class="currency-mark"><img src="${currency.icon || CURRENCY_ICON_BY_CODE[currency.code] || DEFAULT_ICONS.currency}" alt=""></span>
      <span class="currency-main"><b>${currency.code} · ${currency.label}</b><small>${state}</small></span>
      <span class="currency-rate">${currency.base ? '—' : `฿${Number(currency.planRate).toFixed(4)}`}<small>${used.length} กระเป๋า</small></span>
      <span class="currency-actions">
        ${currency.base || !canManageCurrencies ? '' : `<button type="button" data-edit-currency="${currency.code}" ${tripClosed ? `disabled title="${TRIP_LOCK_REASON}"` : ''}>แก้ไข</button>
        <button type="button" data-remove-currency="${currency.code}" ${tripClosed ? `disabled title="${TRIP_LOCK_REASON}"` : (used.length ? 'disabled title="ยังมีกระเป๋าใช้สกุลนี้อยู่"' : '')}>ลบ</button>`}
      </span>
    </div>`;
  }).join('');
  $('#addCurrency').hidden = !canManageCurrencies;
}

/* ── ให้ผู้ร่วมทริปเข้าใช้งานด้วยรหัสของตัวเอง (2026-08-11) ────────────
   ผู้ดูแลตั้งรหัสรายคน แล้วส่งลิงก์ join.html?projectId=… ให้
   รหัสแยกตามคน เพื่อให้ถอนสิทธิ์ทีละคนได้ และรู้ว่าใครเป็นคนจดบิล

   ⚠️ หน้าจอไม่เคยรู้ว่ารหัสคืออะไร — เซิร์ฟเวอร์เก็บเป็น hash เท่านั้น
      ตั้งใหม่ได้อย่างเดียว ดูของเดิมไม่ได้ (ตั้งใจให้เป็นแบบนั้น) */
let liveIsGuest = false;

/* 🔴 ลิงก์เดียวทั้งทริป — ใช้ได้ทั้งบัญชีครอบครัวและผู้ร่วมทริป
   คนที่ยังไม่มีตัวตนจะถูกเด้งไปหน้าใส่รหัสเองแล้วกลับมาที่นี่
   ห้ามแยกเป็นสองลิงก์อีก · ส่งผิดลิงก์ให้ผิดคนคือปัญหาที่เกิดบ่อยที่สุด */
function joinLinkUrl() {
  return `${location.origin}${location.pathname}?live=1&projectId=${encodeURIComponent(TripApi.config.projectId)}`;
}

/* ── หน้าจัดการทริป (2026-08-23) ───────────────────────────────────────
   ออกแบบใหม่ตามที่ North เลือก: การ์ดพับได้ + คำอธิบายอยู่หลังปุ่ม ⓘ

   เดิมเป็นการ์ด 9 ใบเรียงยาว แต่ละใบมีย่อหน้าอธิบาย 2–4 บรรทัดอยู่บนสุด
   รวมกันแล้วต้องเลื่อนจอ 3–4 หน้าจึงจะเห็นครบ ทั้งที่ของที่คนเข้ามาแก้จริง
   มักเป็นแค่เรื่องเดียว · ตอนนี้เห็นหัวข้อทั้งหมดพร้อมกัน กางเฉพาะที่จะแก้

   🔴 ตัวเลขบนแถบสรุปคำนวณสดทุกครั้งที่ render ห้าม hardcode เด็ดขาด
      ข้อมูลตัวอย่างที่ฝังไว้แล้วไม่มีใครเขียนทับ คือบั๊กที่อันตรายที่สุดในแอปนี้
      — ไม่มี error ไม่มีช่องว่าง คนอ่านแล้วเชื่อว่าเป็นของจริง */
const MANAGE_PANEL_KEY = 'rr-trip-manage-panel';

/* หัวข้อที่เปิดค้างไว้ · เก็บใน localStorage เพราะเป็นความชอบของเครื่องนี้
   ไม่ใช่ข้อมูลทริป ถ้าเก็บบนเซิร์ฟเวอร์จะไปทับของคนอื่นในทริปเดียวกัน */
function activeManagePanel() {
  try { return localStorage.getItem(MANAGE_PANEL_KEY) || 'trip'; } catch { return 'trip'; }
}

/* ── มือถือใช้รูปแบบ "รายการ → กดเข้าไป" (2026-08-23) ─────────────────
   รอบแรกทำเมนูเป็นแถบเลื่อนแนวนอนบนมือถือ ซึ่งมีปัญหาจริงสามอย่าง:
     1. หัวข้อที่ 5–7 อยู่นอกจอ และไม่มีอะไรบอกว่ามีต่อทางขวา
        คนจำนวนมากไม่รู้ว่าเลื่อนได้ → ไม่เคยเจอ "ปิดทริป" กับ "ลบทริป" เลย
     2. ต้องซ่อนตัวนับ (3 คน · 1 ไฟล์) เพราะไม่มีที่ ทั้งที่นั่นคือประโยชน์หลัก
     3. เลื่อนอ่านเนื้อหายาว ๆ ลงไปแล้วต้องเลื่อนกลับขึ้นสุดเพื่อสลับหัวข้อ

   แบบใหม่: มือถือเห็น "รายการหัวข้อ" เต็มจอเหมือนหน้าตั้งค่าของมือถือ
   กดแล้วเข้าไปในหัวข้อนั้น มีปุ่ม ‹ หัวข้อทั้งหมด กลับ
   จอกว้างไม่เปลี่ยน — คลาส .drilled ไม่มีผลอะไรเลยเมื่อจอ > 900px */
const isNarrowScreen = () => window.matchMedia('(max-width: 900px)').matches;

function showManagePanel(key, drill = false) {
  const target = $(`#screen-more .mpanel[data-panel="${key}"]`) ? key : 'trip';
  $$('#manageRail .mrail-item').forEach(item =>
    item.classList.toggle('active', item.dataset.panel === target));
  $$('#screen-more .mpanel').forEach(panel =>
    panel.classList.toggle('active', panel.dataset.panel === target));
  $('.manage-layout')?.classList.toggle('drilled', drill);
  try { localStorage.setItem(MANAGE_PANEL_KEY, target); } catch { /* โหมดส่วนตัวเขียนไม่ได้ ไม่ใช่เรื่องคอขาดบาดตาย */ }
}

$('#manageRail').addEventListener('click', event => {
  const item = event.target.closest('[data-panel]');
  if (!item) return;
  showManagePanel(item.dataset.panel, true);
  /* เข้าหัวข้อใหม่แล้วต้องเริ่มอ่านจากบนสุดเสมอ
     ไม่งั้นจะค้างอยู่กลางหน้าเดิมแล้วดูเหมือนกดไม่ติด */
  $('#screen-more .mpanel.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('.manage-panels').addEventListener('click', event => {
  if (!event.target.closest('.mpanel-back')) return;
  $('.manage-layout')?.classList.remove('drilled');
  $('#manageRail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

/* หมุนจอจากแนวตั้งเป็นแนวนอน (หรือย่อ/ขยายหน้าต่าง) แล้วต้องไม่ค้างในสถานะ
   ที่เมนูหายไปทั้งที่จอกว้างพอจะโชว์ทั้งสองฝั่ง */
window.matchMedia('(max-width: 900px)').addEventListener('change', event => {
  if (!event.matches) $('.manage-layout')?.classList.remove('drilled');
});

/* ── แถบเตือน "ที่ควรดูตอนนี้" (2026-08-23) ───────────────────────────
   North เลือกโครงตาราง (B) + แถบเตือนของ (C) มาไว้บนสุด

   🔴 ทุกข้อคำนวณสดจากข้อมูลจริง ห้าม hardcode
      ข้อมูลตัวอย่างที่ฝังไว้แล้วไม่มีใครเขียนทับ คือบั๊กที่อันตรายที่สุดในแอปนี้
      — ไม่มี error ไม่มีช่องว่าง คนอ่านแล้วเชื่อว่าเป็นของจริง

   ⚠️ เตือนเฉพาะเรื่องที่ "ทำให้ตัวเลขผิด" หรือ "ทำให้ใช้งานไม่ได้" เท่านั้น
      ถ้าเตือนทุกเรื่องที่ยังไม่ครบ แถบนี้จะเต็มตลอดเวลาแล้วคนจะเลิกอ่าน */
function renderManageAlerts() {
  const host = $('#manageAlerts');
  if (!host) return;
  const alerts = [];
  const readable = bills.filter(bill => canSee(bill));

  const unpriced = wallets.filter(wallet => wallet.ownerId === viewerId
    && rateInfo(wallet.currency, wallet.id).rate === null);
  if (unpriced.length) {
    alerts.push({
      tone: 'warn', panel: 'money',
      title: `กระเป๋า ${unpriced.length} ใบยังไม่มีเรท`,
      note: 'ยอดรวมทั้งทริปจะต่ำกว่าความจริง · ตั้งเรทประมาณการหรือบันทึกการเติมเงิน'
    });
  }

  const unconvertible = readable.filter(bill => rateInfo(bill.currency, bill.walletId).source === 'none');
  if (unconvertible.length) {
    alerts.push({
      tone: 'warn', panel: 'money',
      title: `บิล ${unconvertible.length} ใบตีเป็นบาทไม่ได้`,
      note: 'จะไม่ถูกนับในยอดรวมและการหารเงิน จนกว่าสกุลนั้นจะมีเรท'
    });
  }

  if (!$('#tripStartInput')?.value || !$('#tripEndInput')?.value) {
    alerts.push({
      tone: 'info', panel: 'trip',
      title: 'ยังไม่ได้ตั้งช่วงวันเดินทาง',
      note: 'ใช้เตือนเรื่องงวดบัญชี และคำนวณ “ใช้ได้อีกวันละเท่าไร” ในหน้าบิล'
    });
  }

  const myWallets = wallets.filter(wallet => wallet.ownerId === viewerId).length;
  if (!myWallets && readable.length) {
    alerts.push({
      tone: 'warn', panel: 'money',
      title: 'จดบิลไว้แล้วแต่ยังไม่มีกระเป๋า',
      note: 'บิลจะหาต้นทุนไม่ได้ · สร้างกระเป๋าในหน้ากระเป๋าก่อน'
    });
  }

  const stops = planDays.reduce((sum, day) => sum + (day.activities?.length || 0), 0);
  if (!stops) {
    alerts.push({
      tone: 'info', panel: 'trip',
      title: 'ยังไม่มีจุดแวะในแผนเที่ยว',
      note: 'เพิ่มได้จากหน้าแผน · แผนที่กับพยากรณ์อากาศจะเริ่มทำงานเมื่อมีจุดแวะ'
    });
  }

  if (tripClosed) {
    alerts.push({
      tone: 'locked', panel: 'close',
      title: 'ทริปนี้ปิดแล้ว',
      note: 'ตัวเลขการเงินถูกล็อก · แผนเที่ยวและรูปภาพยังแก้ได้'
    });
  }

  host.innerHTML = alerts.length
    ? `<p class="malert-label">ที่ควรดูตอนนี้</p>` + alerts.map(row => `
        <button type="button" class="malert ${row.tone}" data-alert-panel="${row.panel}">
          <i aria-hidden="true">${row.tone === 'warn' ? '⚠️' : (row.tone === 'locked' ? '🔒' : 'ℹ️')}</i>
          <span><b>${row.title}</b><small>${row.note}</small></span>
          <em aria-hidden="true">›</em>
        </button>`).join('')
    : `<p class="malert-ok">✅ ทริปนี้ตั้งค่าครบแล้ว · ไม่มีอะไรค้าง</p>`;
}

$('#manageAlerts').addEventListener('click', event => {
  const button = event.target.closest('[data-alert-panel]');
  if (!button) return;
  showManagePanel(button.dataset.alertPanel, true);
  $('#screen-more .mpanel.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

/* ── คู่มือสร้างภาพด้วย AI (2026-08-23) ───────────────────────────────
   North: "เพิ่มข้อมูล icon prompt นี้ไว้ใน เพิ่มเติม ในหัวข้อ การสร้างภาพ"

   🔴 ตารางขนาดสร้างสดจาก assetSpecs ห้ามพิมพ์ตัวเลขซ้ำลงในหน้านี้
      ถ้าวันหลังเปลี่ยนสเปกในโค้ด แล้วหน้านี้ยังโชว์เลขเก่า คนจะ generate
      ตามเลขที่ผิดแล้วภาพถูกครอบเสียองค์ประกอบ — โดยไม่มีอะไรฟ้องเลย
      (เอกสาร ICON_PROMPTS.md ในโปรเจกต์ก็มีเนื้อหาเดียวกัน ใช้ตอนอ่านนอกแอป) */
const ART_PROMPTS = [
  {
    kind: 'expense',
    title: 'ไอคอนค่าใช้จ่าย',
    note: 'ของกินของใช้ที่จดบ่อย — ราเมง กาแฟ ตั๋วรถไฟ ของฝาก',
    body: `A 3x3 grid of 9 kawaii food-and-travel icons, flat 2D vector illustration.

SUBJECTS: ramen bowl, coffee cup, train ticket, souvenir bag, onigiri,
shopping bag, hotel bed, bus, ice cream cone.

STYLE
- Flat solid colours only. No gradients, no 3D shading, no photo realism.
- Thick white outline around each object, soft drop shadow underneath.
- Each icon fills about 70% of its cell, centred, with clear margin.

PALETTE (exact hex)
#F6BFD0  #C8E5ED  #F0DFBF  #C4E3CD  #D6D2F5  #FAD4C0

HARD RULES
- Pure white background between the cells. No pattern, no frame, no border.
- NO text, NO numbers, NO logos, NO watermark anywhere.
- Each cell 512x512, final grid 1536x1536.`
  },
  {
    kind: 'place',
    title: 'ไอคอนสถานที่',
    note: 'ใช้ในแผนเที่ยว — วัด ภูเขา ทะเลสาบ ออนเซ็น',
    body: `A 3x3 grid of 9 kawaii travel landmark icons, flat 2D vector illustration.

SUBJECTS: snowy mountain, hot spring with steam, lake with boat, torii gate,
lighthouse, ski lift, observation tower, forest path, seaside cliff.

STYLE
- Flat solid colours, no gradients. Thick white outline, soft drop shadow.
- Rounded-square composition: leave a small margin on all four sides,
  because the app crops the corners.
- Each icon fills about 70% of its cell.

PALETTE (exact hex)
#BFE3E8  #C4E3CD  #F0DFBF  #D6D2F5  #FAD4C0  #F6BFD0

HARD RULES
- Pure white background between the cells. No pattern, no frame.
- NO text, NO numbers, NO logos, NO place names anywhere.
- Each cell 512x512, final grid 1536x1536.`
  },
  {
    kind: 'wallet',
    title: 'ไอคอนกระเป๋าเงิน',
    note: 'แสดงบนการ์ดกระเป๋า — ควรเป็นภาพแบน 2 มิติสีพาสเทล',
    body: `A 2x3 grid of 6 kawaii wallet icons, flat 2D vector illustration.

SUBJECTS: bifold wallet, coin purse, card holder, travel pouch,
money envelope, cloth drawstring bag.

STYLE
- Flat solid colours only, no gradients, no 3D.
- Thick white outline, soft drop shadow underneath.
- Slight 3/4 angle so the shape reads as a wallet, not a rectangle.
- Each icon fills about 70% of its cell.

PALETTE (exact hex)
#F6BFD0  #C8E5ED  #F0DFBF  #C4E3CD  #D6D2F5  #FAD4C0

HARD RULES
- Pure white background between the cells. No pattern, no frame.
- NO text, NO numbers, NO currency symbols, NO logos.
- Each cell 512x512, final grid 1024x1536.`
  },
  {
    kind: 'currency',
    title: 'ไอคอนสกุลเงิน',
    note: 'เหรียญกลมเต็มวง ไม่ต้องเว้นขอบ · ควรมีสีเด่นประจำสกุล',
    body: `A 2x3 grid of 6 kawaii coin icons, flat 2D vector illustration.

Each coin is a FULL CIRCLE that fills its cell edge to edge, with a
slightly darker rim ring and a simple flat face.

VARIATION: give each coin a clearly different body colour so they can be
told apart at 24 pixels. Use these exact hex values, one per coin:
#F2C14E  #7FB4E8  #8FD3A5  #E89AB4  #B9A6E8  #F0A07A

STYLE
- Flat solid colours only, no gradients, no metallic shine, no 3D bevel.
- Thin darker outline on the rim only.

HARD RULES
- Pure white background between the cells. No pattern, no frame.
- NO text, NO numbers, NO currency symbols, NO logos.
  (The app shows the currency code beside the icon already.)
- Each cell 512x512, final grid 1024x1536.`
  },
  {
    kind: 'member',
    title: 'รูปประจำตัวสมาชิก',
    note: '🔴 ถูกย่อเหลือ 22–44 px — ต้องเป็นหัวไหล่ ห้ามคนเต็มตัว',
    body: `A 3x3 grid of 9 kawaii avatar portraits, flat 2D vector illustration.

STYLE
- Flat solid colours only. No gradients, no 3D shading.
- Head-and-shoulders only, cropped at the chest. NOT full body.
- The face fills about 70% of each cell. Large simple eyes, small smile,
  soft pink blush circles on both cheeks.
- Each portrait sits on its own SOLID PASTEL CIRCLE that fills the cell.

VARIATION (this is what makes them distinguishable when tiny)
Give each of the 9 a clearly different HAIRSTYLE and a different
BACKGROUND CIRCLE COLOUR:
short hair / bob / top bun / curly afro / cap / long straight hair /
beard / round glasses / headscarf

BACKGROUND CIRCLE PALETTE (use each once, exact hex)
#F6BFD0  #C8E5ED  #F0DFBF  #C4E3CD  #D6D2F5
#FAD4C0  #BFE3E8  #F3D9F0  #DCE7F7

SKIN TONES: vary naturally across #FFE7D3 #F7D9BE #E0B48C #C08A5E

HARD RULES
- Pure white background BETWEEN the cells, no pattern, no border, no frame.
- NO text, NO numbers, NO logos, NO watermark anywhere.
- NO tiny details: no earrings, no buttons, no shirt patterns, no freckles.
  Anything smaller than 6px will disappear when the image is scaled down.
- Each cell 512x512, final grid 1536x1536.`
  },
  {
    kind: 'banner',
    title: 'แบนเนอร์ทริป',
    note: '🔴 ห้ามมีชื่อสถานที่ในภาพ — หมุดกับเส้นทางถูกวางทับด้วยระบบ',
    body: `A single wide illustrated travel map banner, flat 2D vector illustration.

CONTENT: a stylised aerial view of a region with mountains, forests,
a lake, a coastline and a few small towns. Winter atmosphere.

STYLE
- Flat solid colours only, no gradients, no photo texture.
- Soft pastel palette, gentle contrast — the app draws route lines and
  pins ON TOP of this image, so nothing in the artwork should compete.
- Keep the centre band relatively calm; busy detail belongs near the edges.

PALETTE (exact hex)
#BFE3E8  #C4E3CD  #F0DFBF  #FFFFFF  #D6D2F5  #FAD4C0

HARD RULES
- NO text, NO place names, NO numbers, NO logos, NO map pins, NO routes.
- Aspect ratio exactly 2.37 : 1. Final size 1920x810.`
  }
];

function renderArtGuide() {
  const host = $('#artGuide');
  if (!host) return;

  /* ตารางขนาด — อ่านจาก assetSpecs ตัวเดียวกับที่กล่องอัปโหลดใช้จริง */
  const shapeLabel = { circle: 'วงกลม', rounded: 'สี่เหลี่ยมมุมโค้ง', wide: 'แนวนอน' };
  const rows = Object.entries(assetSpecs).map(([kind, spec]) => `
    <tr>
      <td>${spec.title}</td>
      <td><b>${spec.width} × ${spec.height}</b></td>
      <td>${shapeLabel[spec.shape] || spec.shape}</td>
    </tr>`).join('');

  host.innerHTML = `
    <p class="art-lead">สร้างภาพด้วย Gemini หรือ ChatGPT แล้วอัปโหลดกลับเข้าแอปได้เลย
      · ระบบตัดแผ่นรวม ลบพื้นขาว และย่อขนาดให้อัตโนมัติ</p>

    <div class="art-rules">
      <b>กฎ 5 ข้อ อ่านก่อนเริ่ม</b>
      <ol>
        <li><b>generate ทีละแผ่นรวมหลายไอคอน</b> (3×3 หรือ 2×3) ไม่ใช่ทีละอัน
          — สไตล์จะสม่ำเสมอกว่ามาก แล้วค่อยตัดแยกทีหลัง</li>
        <li><b>พื้นหลังระหว่างช่องต้องขาวสนิท</b> ห้ามโปร่งใส ห้ามมีลาย
          — ถ้าไม่ขาวสนิท ตัวตัดภาพจะมองเป็นชิ้นเดียวทั้งแผ่น</li>
        <li><b>ห้ามมีตัวอักษร ตัวเลข หรือโลโก้</b> ต้องย้ำในทุก prompt
          เพราะโมเดลชอบใส่มาเอง แล้วต้องมาลบทีหลัง</li>
        <li><b>ล็อกจานสีด้วยรหัส hex เสมอ</b> นี่คือสิ่งที่ทำให้ชุดใหม่เข้ากับของเดิมที่สุด</li>
        <li><b>ให้ตัวไอคอนกินราว 70% ของช่อง</b> เว้นขอบไว้
          ไม่งั้นเวลาแอปครอบมุมโค้งจะโดนตัดขอบภาพ</li>
      </ol>
    </div>

    <div class="art-sizes">
      <b>ขนาดที่แอปใช้จริง</b>
      <table>
        <thead><tr><th>ใช้ที่ไหน</th><th>ขนาด (px)</th><th>ทรง</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <small>แอปย่อและครอบให้เองตอนอัปโหลด ถ้าขนาดไม่ตรงเป๊ะไม่เป็นไร
        แต่ <b>อัตราส่วน</b> ต้องถูก ไม่งั้นภาพจะถูกครอบจนเสียองค์ประกอบ
        · เพดานไฟล์ รูป 3 MB · PDF 15 MB</small>
    </div>

    <div class="art-prompts">
      <b>Prompt พร้อมใช้ — กดคัดลอกแล้ววางในแชท AI ได้เลย</b>
      ${ART_PROMPTS.map(row => `
        <details class="art-prompt">
          <summary>
            <span><b>${row.title}</b><small>${row.note}</small></span>
            <button type="button" class="art-copy" data-copy-prompt="${row.kind}">คัดลอก</button>
          </summary>
          <pre>${row.body.replace(/[&<>]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[ch]))}</pre>
        </details>`).join('')}
    </div>

    <p class="art-foot">อัปโหลดยังไง: เปิดหัวข้อที่เกี่ยวข้อง (เช่น กระเป๋า หรือ คนและสิทธิ์)
      → กดปุ่มเลือกรูป → <b>อัปโหลด</b> → เลือกแผ่นรวมที่ได้มา → ระบบจะหั่นให้เอง</p>`;
}

/* ปุ่มคัดลอก — ใช้ clipboard API ถ้ามี ไม่มีก็ถอยไปเลือกข้อความให้แทน
   ⚠️ Safari เก่าและหน้าที่ไม่ได้เสิร์ฟผ่าน https จะไม่มี navigator.clipboard
      ถ้าไม่ดักไว้ ปุ่มจะกดแล้วเงียบสนิทโดยไม่มีอะไรบอกว่าล้มเหลว */
$('#artGuide').addEventListener('click', async event => {
  const button = event.target.closest('[data-copy-prompt]');
  if (!button) return;
  event.preventDefault();
  const row = ART_PROMPTS.find(item => item.kind === button.dataset.copyPrompt);
  if (!row) return;
  try {
    await navigator.clipboard.writeText(row.body);
    showPrototypeToast(`คัดลอก prompt "${row.title}" แล้ว`);
  } catch {
    const box = button.closest('.art-prompt');
    box.open = true;
    const pre = box.querySelector('pre');
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    showPrototypeToast('คัดลอกอัตโนมัติไม่ได้ในเบราว์เซอร์นี้ · เลือกข้อความไว้ให้แล้ว กด Ctrl/⌘ + C');
  }
});

function renderManageSummary() {
  const hero = $('#manageHero');
  if (!hero) return;

  const readable = bills.filter(bill => canSee(bill));
  const stops = planDays.reduce((sum, day) => sum + (day.activities?.length || 0), 0);
  const docs = tripDocuments?.length || 0;
  const myWallets = wallets.filter(wallet => wallet.ownerId === viewerId).length;

  /* ⚠️ นับ "กระเป๋าที่ยังไม่มีเรท" เพราะเป็นสาเหตุอันดับหนึ่งที่ยอดรวมทั้งทริป
     ต่ำกว่าความจริง — ต้องเห็นตั้งแต่หน้าจัดการ ไม่ใช่ไปเจอตอนปิดทริป */
  const unpriced = wallets.filter(wallet => wallet.ownerId === viewerId
    && rateInfo(wallet.currency, wallet.id).rate === null).length;

  const start = $('#tripStartInput')?.value || '';
  const end = $('#tripEndInput')?.value || '';
  const days = (start && end)
    ? Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    : 0;

  const chip = (value, label, tone = '') =>
    `<span class="mhero-chip${tone ? ` ${tone}` : ''}"><b>${value}</b><small>${label}</small></span>`;

  hero.innerHTML = `
    <div class="mhero-main">
      <span>ทริปที่กำลังจัดการ</span>
      <strong>${$('#tripNameInput')?.value || 'ทริปนี้'}</strong>
      <small>${start && end ? `${billDateLabel(start)} – ${billDateLabel(end)} · ${days} วัน` : 'ยังไม่ได้ตั้งช่วงวันเดินทาง'}</small>
    </div>
    <div class="mhero-chips">
      ${chip(members.length, 'สมาชิก')}
      ${chip(tripCurrencies.length, 'สกุลเงิน')}
      ${chip(myWallets, 'กระเป๋าของคุณ')}
      ${chip(readable.length, 'บิล')}
      ${chip(stops, 'จุดแวะ')}
      ${chip(docs, 'เอกสาร')}
      ${tripClosed
        ? chip('ปิดแล้ว', 'สถานะ', 'locked')
        : chip('เปิดอยู่', 'สถานะ', 'live')}
    </div>
    ${unpriced ? `<p class="mhero-warn">⚠️ มีกระเป๋า ${unpriced} ใบที่ยังไม่มีเรท — ยอดรวมทั้งทริปจะต่ำกว่าความจริงจนกว่าจะตั้งเรทหรือบันทึกการเติมเงิน</p>` : ''}`;

  // ตัวนับบนหัวการ์ดแต่ละใบ — บอกว่ามีอะไรอยู่ข้างในโดยไม่ต้องกางดู
  const counts = {
    trip: tripClosed ? 'ปิดแล้ว' : 'เปิดอยู่',
    /* บอกด้วยว่ากี่คนเข้าระบบได้จริง — ตัวเลขที่ North ต้องดูก่อนส่งลิงก์ออกไป
       "5 คน" เฉย ๆ ไม่ได้บอกว่ามีใครยังเข้าไม่ได้บ้าง */
    people: `${members.length} คน · ${members.filter(m => m.userId || m.hasPasscode).length} เข้าได้`,
    money: `${tripCurrencies.length} สกุล · ${tripPresets?.length || 0} รายการ`,
    docs: docs ? `${docs} ไฟล์` : 'ยังไม่มี',
    theme: activeThemeLabel(),
    art: `${ART_PROMPTS.length} prompt`,
    close: tripClosed ? 'ปิดแล้ว' : `${readable.length} บิลรอสรุป`
  };
  $$('[data-manage-count]').forEach(node => {
    node.textContent = counts[node.dataset.manageCount] ?? '';
  });

  /* ปุ่ม prototype ใช้ไม่ได้ในโหมดข้อมูลจริง — ซ่อนทั้งก้อน
     ปุ่มที่กดแล้วไม่เกิดอะไรทำให้คนไม่เชื่อปุ่มอื่นในหน้าเดียวกันไปด้วย */
  const proto = $('#protoZone');
  if (proto) proto.hidden = liveMode;

  renderManageAlerts();
  renderArtGuide();
}

/* ชื่อธีมที่ใช้อยู่ — อ่านจากค่าจริง (tripTheme) ไม่ใช่จาก DOM
   ตอนโหลดรอบแรก renderThemePicker() อาจยังไม่ทำงาน ถ้าอ่านจาก DOM จะได้ค่าว่าง
   แล้วหัวการ์ดจะขึ้น "ตามค่าเริ่มต้น" ทั้งที่เลือกธีมไว้แล้ว */
function activeThemeLabel() {
  return TRIP_THEMES?.find(theme => theme.id === tripTheme)?.name || 'ตามค่าเริ่มต้น';
}

/* คำอธิบายของแต่ละหัวข้อ เก็บไว้ที่เดียว ไม่กระจายอยู่ใน HTML
   ข้อความอธิบายเป็นสิ่งที่ถูกแก้บ่อยที่สุด ถ้าฝังใน markup จะต้องไล่แก้หลายจุด */
const MANAGE_INFO = {
  trip: {
    title: 'ชื่อทริปและวันเดินทาง',
    body: `<p><b>ชื่อทริป</b> ไปโผล่ในรายการที่ลงบัญชีจริงตอนปิดทริป ตั้งให้อ่านแล้วรู้เรื่องในสมุดบัญชีด้วย ไม่ใช่แค่ในแอป</p>
      <p><b>ช่วงวันเดินทาง</b> ใช้เตือนเรื่องงวดบัญชี และใช้คำนวณ “ใช้ได้อีกวันละเท่าไร” ในหน้าบิล</p>
      <p><b>ประเภททริป</b><br>
      🧭 Ongoing — จะเกิดแน่ ๆ · นับรวมในงบและการวางแผน<br>
      💭 Dream — ยังไม่แน่นอน · เก็บไอเดียไว้ก่อน<br>
      📸 Memory — จบไปแล้ว · เก็บเป็นบันทึกความทรงจำ</p>
      <p><b>ลบทริป</b> (ท้ายหัวข้อนี้) ลบบิล กระเป๋า แผนเที่ยว และเอกสารทั้งหมดถาวร
      <b>กู้คืนไม่ได้</b> — ถ้าแค่อยากเก็บเข้ากรุ เปลี่ยนประเภทเป็น 📸 Memory แทน</p>
      <p class="dim">ทริปที่โพสต์เข้าบัญชีจริงแล้วลบไม่ได้เลย เพราะจะทำให้ยอดในสมุดบัญชีครอบครัวไม่ตรง</p>`
  },
  people: {
    title: 'คนและสิทธิ์',
    body: `<p><b>กดชื่อสมาชิก</b> เพื่อดูแอปในมุมมองของคนนั้น — ใช้ตรวจว่ากติกาการมองเห็นทำงานถูกต้องจริง
      ก่อนจะเชิญเขาเข้ามา</p>
      <p><b>ลิงก์เข้าทริป</b> เป็นลิงก์เดียวใช้ได้ทุกคน ส่งให้เปิดบนมือถือได้เลย
      ลิงก์นี้<b>ไม่ใช่กุญแจ</b> — คนที่เปิดยังต้องล็อกอินหรือใส่รหัสของตัวเองอยู่ดี</p>
      <p><b>🔑 ตั้งรหัสให้เข้าใช้</b> ในแถวของแต่ละคน ตั้งรหัสแล้วส่งลิงก์พร้อมรหัสให้เขา
      เขาเข้าได้โดยไม่ต้องมีบัญชีของระบบบัญชีครอบครัว · ปุ่มถอนสิทธิ์อยู่ในหน้าต่างเดียวกัน</p>
      <p>คนที่ผูก <b>บัญชีครอบครัว</b> ไว้แล้วเข้าผ่านบัญชีตัวเองอยู่แล้ว จึงไม่มีปุ่มรหัสให้ —
      ตั้งหรือถอนไปก็ไม่มีผลอะไรกับเขา</p>
      <p>ผู้ร่วมทริปเห็นแผนเที่ยวและเอกสาร จดค่าใช้จ่ายของตัวเองได้
      แต่<b>แก้ของคนอื่นหรือปิดทริปไม่ได้</b></p>
      <p class="dim">ยอดในกระเป๋าและประวัติเติมเงินเป็นของเจ้าของกระเป๋าคนเดียว คนอื่นไม่เห็นแม้แต่ผู้ดูแล</p>`
  },
  money: {
    title: 'สกุลเงินและรายการค่าใช้จ่าย',
    body: `<p><b>เรทประมาณการ</b> ตั้งไว้ล่วงหน้าได้ ระบบจะใช้จนกว่ากระเป๋านั้นมีการเติมเงินจริง
      แล้วสลับไปใช้เรทเฉลี่ยจากเงินจริงเองทันที</p>
      <p>สกุลที่ไม่มีทั้งเรทประมาณการและการเติมเงิน จะ<b>ตีเป็นบาทไม่ได้</b>
      ระบบจะไม่เดาเรทให้ เพราะตัวเลขที่เดามาหน้าตาเหมือนตัวเลขจริงทุกประการ</p>
      <p><b>รายการค่าใช้จ่าย</b> คือชื่อกับไอคอนที่เลือกตอนจดบิล ผูกไปหมวดบัญชีสำหรับตอนปิดทริป
      หลายรายการผูกหมวดเดียวกันได้ (ราเมง/ขนม/เครื่องดื่ม → หมวดอาหาร)</p>
      <p class="dim">แก้ชื่อหรือไอคอนทีหลัง บิลเก่าในทริปนี้จะเปลี่ยนตามทันที</p>`
  },
  docs: {
    title: 'คลังเอกสาร',
    body: `<p>ใบจอง ตั๋ว ประกัน — จัดกลุ่มตามสถานที่ที่ผูกไว้ จะได้หาเจอตอนอยู่หน้าเคาน์เตอร์จริง</p>
      <p>เพิ่มเอกสารของสถานที่ได้จาก<b>หน้าแผนเที่ยว</b> โดยกดที่จุดแวะนั้น ๆ</p>`
  },
  theme: {
    title: 'ธีมสีของทริป',
    body: `<p>แต่ละทริปเลือกธีมของตัวเองได้ เปลี่ยนแล้วเห็นผลทันที</p>
      <p><b>ทุกคนในทริปเห็นเหมือนกัน</b> — ไม่ใช่ความชอบส่วนตัวของเครื่องนี้</p>`
  },
  art: {
    title: 'การสร้างภาพด้วย AI',
    body: `<p>ไอคอนทุกหมวดในแอปสร้างเองได้ด้วย Gemini หรือ ChatGPT
      แล้วอัปโหลดกลับเข้ามา ระบบจะ<b>ตัดแผ่นรวมเป็นชิ้น ลบพื้นขาวให้โปร่งใส
      และย่อขนาดให้ตรงสเปก</b>ให้เองทั้งหมด</p>
      <p>หัวข้อนี้รวม <b>ขนาดที่แอปใช้จริง</b> (อ่านจากโค้ดโดยตรง ไม่ใช่ตัวเลขที่พิมพ์ทิ้งไว้)
      กฎที่ต้องย้ำในทุก prompt และ prompt พร้อมคัดลอกของแต่ละหมวด</p>
      <p class="dim">เอกสารฉบับเต็มอยู่ในไฟล์ <b>ICON_PROMPTS.md</b> ของโปรเจกต์
      สำหรับตอนอ่านนอกแอป</p>`
  },
  close: {
    title: 'ปิดทริปทำงานอย่างไร',
    body: `<p>ตอนปิดทริป ระบบสรุปยอดออกเป็นสองก้อน:</p>
      <p><b>ลงบัญชีหลัก</b> — ยอดที่ไหลเข้าบัญชีครอบครัวจริง<br>
      <b>เฉพาะทริป</b> — ยอดที่เก็บไว้เป็นประวัติของทริป ไม่แตะบัญชีจริง</p>
      <p>เงินที่เหลือในกระเป๋า<b>ต้องบอกก่อนว่าจะเอาไปไหน</b> (คืนเข้าบัญชี หรือยกไปทริปหน้า)
      ไม่งั้นระบบไม่ยอมให้ปิด เพราะเงินก้อนนั้นจะหายจากบัญชีเงียบ ๆ</p>
      <p>ปิดแล้ว<b>เรทถูกล็อก</b> ตัวเลขการเงินจะไม่ขยับอีก แต่แผนเที่ยวและรูปภาพยังแก้ได้</p>
      <p class="dim">เปิดกลับได้ ต้องระบุเหตุผล และระบบจะลงรายการกลับรายการเดิมไว้ในประวัติ</p>`
  },
  /* 🔴 ไม่มีหัวข้อ danger แล้ว — คำอธิบายลิงก์ย้ายไป people, ลบทริปย้ายไป trip
     ถ้าจะเพิ่มหัวข้อใหม่ อย่ารวมของสองเรื่องไว้ด้วยกันเพราะ "อันตรายเหมือนกัน" */
};

$('#screen-more').addEventListener('click', event => {
  const button = event.target.closest('[data-manage-info]');
  if (!button) return;
  const row = MANAGE_INFO[button.dataset.manageInfo];
  if (!row) return;
  $('#walletInfoTitle').textContent = row.title;
  $('#walletInfoBody').innerHTML = row.body;
  closeLayers();
  mask.classList.add('open');
  $('#walletInfoDialog').classList.add('open');
  $('#walletInfoDialog').setAttribute('aria-hidden', 'false');
});

/* คืนหัวข้อที่เปิดค้างไว้ตอนโหลดหน้า
   ⚠️ จอแคบเริ่มที่ "รายการหัวข้อ" เสมอ ไม่กระโดดเข้าหัวข้อเดิมทันที
      เพราะคนเปิดหน้าจัดการมักไม่ได้มาทำเรื่องเดิมกับครั้งก่อน
      และถ้าเปิดมาเจอหน้าลึกโดยไม่รู้ตัว จะงงว่าเมนูหายไปไหน */
showManagePanel(activeManagePanel(), false);

/* ── ลิงก์เข้าทริป (2026-08-23) ────────────────────────────────────────
   🔴 การตั้ง/ถอนรหัสถูกย้ายไปรวมกับแถวสมาชิกแล้ว ไม่มีรายชื่อซ้ำอีกชุด
      รายชื่อสองชุดที่แก้คนละที่คือที่มาของความสับสน — และของเดิมยังโชว์ปุ่ม
      "ถอนสิทธิ์" ให้คนที่เข้าผ่านบัญชีครอบครัวด้วย ซึ่งกดไปก็ไม่มีผลอะไรเลย */
function renderJoinLink() {
  const link = $('#joinLink');
  if (link) link.value = liveMode ? joinLinkUrl() : '(เข้าโหมดข้อมูลจริงก่อน)';
}

$('#copyJoinLink')?.addEventListener('click', () => {
  if (!liveMode) return;
  navigator.clipboard?.writeText(joinLinkUrl())
    .then(() => showPrototypeToast('คัดลอกลิงก์แล้ว · ส่งให้ผู้ร่วมทริปได้เลย'))
    .catch(() => showPrototypeToast('คัดลอกไม่สำเร็จ · ลองเลือกข้อความแล้วคัดลอกเอง'));
});

/* 🔴 การตั้ง/ถอนรหัสย้ายไปอยู่ในฟอร์มแก้ไขสมาชิกแล้ว (North 2026-08-23)
   "เอาไว้หน้าเดียวกับแก้ไข ได้ไหม แล้วแสดงข้อมูลไว้"
   ดู paintMemberAccess() · readNewPasscode() · #passcodeClear ที่อยู่ข้าง openMemberDialog()
   ห้ามสร้างหน้าต่างตั้งรหัสแยกกลับมาอีก — ที่แก้สองที่คือที่มาของความสับสน */

/* ── เอกสารประจำทริป (2026-08-11) ──────────────────────────────────────
   ใบจองโรงแรม ตั๋วเครื่องบิน ประกัน — ผูกกับจุดแวะ หรือเป็นเอกสารของทั้งทริป
   เก็บเป็นได้สองแบบ: อัปโหลดเข้าระบบ (R2) หรือวางลิงก์ภายนอก เช่น Google Drive
   ทั้งสองแบบหน้าตาเหมือนกันหมด ต่างแค่ที่อยู่ของไฟล์ */
let tripDocuments = [];

const docsForStop = stopId => tripDocuments.filter(doc => doc.stopId === stopId);

/* ไอคอนตามชนิดไฟล์ — ช่วยให้กวาดตาหาเอกสารที่ต้องการได้เร็วกว่าอ่านชื่อทุกอัน */
function docIcon(doc) {
  if (doc.contentType?.includes('pdf')) return '📄';
  if (doc.contentType?.startsWith('image/')) return '🖼️';
  return doc.kind === 'file' ? '📎' : '🔗';
}

function fmtFileSize(bytes) {
  if (!bytes) return '';
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/* ── คลังเอกสาร: รวมทั้งทริป จัดกลุ่มตามชื่อสถานที่ ───────────────────
   เอกสารที่ไม่ได้ผูกสถานที่ไปรวมกันใต้หัวข้อ "เอกสารของทริป"
   เรียงให้สถานที่มาก่อน เพราะเป็นสิ่งที่คนมองหาบ่อยกว่า */
function renderDocumentLibrary() {
  const host = $('#documentLibrary');
  if (!host) return;
  if (!liveMode) {
    host.innerHTML = '<p class="field-note">เข้าทริปโหมดข้อมูลจริงก่อนถึงจะเก็บเอกสารได้</p>';
    return;
  }
  if (!tripDocuments.length) {
    host.innerHTML = `<p class="field-note">ยังไม่มีเอกสาร — เพิ่มได้จากหน้าแผนเที่ยว กด "แก้ไข" ที่สถานที่ใดก็ได้</p>
      <button type="button" class="soft-btn" id="addTripDocBtn">＋ เพิ่มเอกสารของทริป</button>`;
    return;
  }

  const groups = new Map();
  tripDocuments.forEach(doc => {
    const key = doc.stopId || '';
    if (!groups.has(key)) groups.set(key, { name: doc.stopName || 'เอกสารของทริป', docs: [] });
    groups.get(key).docs.push(doc);
  });
  // สถานที่ก่อน แล้วค่อยเอกสารระดับทริป
  const ordered = [...groups.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1));

  host.innerHTML = ordered.map(([, group]) => `
    <div class="doc-group">
      <h4>${group.name}<small>${group.docs.length} ไฟล์</small></h4>
      ${group.docs.map(doc => docRowMarkup(doc)).join('')}
    </div>`).join('')
    + '<button type="button" class="soft-btn" id="addTripDocBtn">＋ เพิ่มเอกสารของทริป</button>';
}

/* แถวเอกสารหนึ่งรายการ — ใช้ทั้งในคลังเอกสารและในฟอร์มแก้สถานที่
   target=_blank + rel=noopener: เอกสารอาจเป็นลิงก์ภายนอกที่เราไม่ได้คุม
   ห้ามให้หน้าปลายทางเข้าถึง window.opener ของเราได้ */
function docRowMarkup(doc) {
  return `
    <div class="doc-row">
      <a class="doc-open" href="${doc.url}" target="_blank" rel="noopener noreferrer">
        <span class="doc-icon">${docIcon(doc)}</span>
        <span class="doc-main"><b>${doc.name}</b><small>${doc.kind === 'file'
          ? `ไฟล์ในระบบ${doc.sizeBytes ? ` · ${fmtFileSize(doc.sizeBytes)}` : ''}`
          : 'ลิงก์ภายนอก'}</small></span>
      </a>
      <button type="button" class="doc-remove" data-remove-doc="${doc.id}" aria-label="ลบเอกสาร">✕</button>
    </div>`;
}

/* ── ฟอร์มเพิ่มเอกสาร ────────────────────────────────────────────────
   เปิดจากสองที่: ฟอร์มแก้สถานที่ (ผูกกับสถานที่นั้น) และคลังเอกสาร (ระดับทริป)
   docTargetStopId จำไว้ว่ากำลังเพิ่มให้ใคร */
let docTargetStopId = '';
let pendingDocUpload = null;   // { url, contentType, sizeBytes } เมื่ออัปโหลดไฟล์เสร็จ

function openDocDialog(stopId = '') {
  if (!liveMode) { showPrototypeToast('เก็บเอกสารได้เฉพาะโหมดข้อมูลจริง'); return; }
  closeLayers();
  docTargetStopId = stopId;
  pendingDocUpload = null;
  /* เติมชื่อเอกสารด้วยชื่อสถานที่ให้อัตโนมัติ — เอกสารเกือบทั้งหมดเป็นของสถานที่นั้น
     อยู่แล้ว (ใบจองโรงแรม Kushiro อยู่ใต้จุดแวะโรงแรม Kushiro) การพิมพ์ชื่อซ้ำ
     กับหัวข้อที่มันอยู่ข้างใต้จึงเป็นงานเปล่า ๆ · แก้ทีหลังได้ตามปกติ
     ถ้าสถานที่นั้นมีเอกสารชื่อนี้อยู่แล้ว เติมเลขต่อท้ายกันสับสนเวลามีหลายใบ */
  $('#docName').value = stopId ? nextDocName(stopId) : '';
  $('#docUrl').value = '';
  $('#docFile').value = '';
  $('#docError').textContent = '';
  $('#docUploadNote').textContent = '';
  $('#docDialogWhere').textContent = stopId
    ? (planStopName(stopId) || 'สถานที่ที่เลือก')
    : 'ทั้งทริป (ไม่ผูกกับสถานที่ใด)';
  mask.classList.add('open');
  $('#docDialog').classList.add('open');
  $('#docDialog').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#docName').focus(), 80);
}

/* เอกสารของสถานที่หนึ่ง ๆ ในฟอร์มแก้สถานที่
   สถานที่ที่ยังไม่ได้บันทึก (ยังไม่มี stop_id จริง) แนบเอกสารไม่ได้ เพราะ
   เอกสารต้องผูกกับจุดแวะที่มีอยู่จริงในฐาน — บอกให้ชัดแทนที่จะซ่อนปุ่มเฉย ๆ */
function renderStopDocuments(stopId) {
  const host = $('#stopDocuments');
  if (!host) return;
  if (!liveMode) {
    host.innerHTML = '<p class="field-note">แนบเอกสารได้เฉพาะโหมดข้อมูลจริง</p>';
    return;
  }
  if (!stopId) {
    host.innerHTML = '<p class="field-note">บันทึกสถานที่นี้ก่อน แล้วเปิดขึ้นมาแก้ไขอีกครั้งจึงจะแนบเอกสารได้</p>';
    return;
  }
  const docs = docsForStop(stopId);
  host.innerHTML = (docs.length ? docs.map(docRowMarkup).join('') : '')
    + `<button type="button" class="soft-btn" data-add-doc="${stopId}">＋ แนบเอกสาร</button>`;
}

$('#stopDocuments')?.addEventListener('click', event => {
  const add = event.target.closest('[data-add-doc]');
  if (add) openDocDialog(add.dataset.addDoc);
});

/* ชื่อเอกสารถัดไปของสถานที่หนึ่ง ๆ — "โรงแรม Kushiro", "โรงแรม Kushiro (2)", …
   ใบแรกไม่มีเลข เพราะส่วนใหญ่มีใบเดียวและเลข (1) ดูรกโดยไม่ได้ช่วยอะไร */
function nextDocName(stopId) {
  const base = planStopName(stopId) || 'เอกสาร';
  const taken = new Set(docsForStop(stopId).map(doc => doc.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function planStopName(stopId) {
  for (const day of planDays) {
    const found = day.activities.find(activity => activity.id === stopId);
    if (found) return found.name;
  }
  return '';
}

/* อัปโหลดไฟล์ทันทีที่เลือก ไม่รอกดบันทึก — ผู้ใช้จะได้รู้ผลเร็ว
   และถ้าไฟล์ใหญ่เกินจะได้แก้ก่อนเสียเวลากรอกชื่อ */
$('#docFile')?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('#docError').textContent = '';
  $('#docUploadNote').textContent = 'กำลังอัปโหลด…';
  try {
    const url = await TripApi.uploadDocument(file);
    pendingDocUpload = { url, contentType: file.type, sizeBytes: file.size };
    $('#docUrl').value = url;
    $('#docUploadNote').textContent = `✓ อัปโหลดแล้ว · ${fmtFileSize(file.size)}`;
    // เติมชื่อให้อัตโนมัติถ้ายังว่าง — ลดขั้นตอนโดยยังแก้ได้
    if (!$('#docName').value.trim()) $('#docName').value = file.name.replace(/\.[^.]+$/, '');
  } catch (error) {
    pendingDocUpload = null;
    $('#docUploadNote').textContent = '';
    $('#docError').textContent = `อัปโหลดไม่สำเร็จ: ${error.message}`;
  }
});

$('#docForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#docName').value.trim();
  const url = $('#docUrl').value.trim();
  if (!name) { $('#docError').textContent = 'ตั้งชื่อเอกสารก่อน'; return; }
  if (!url) { $('#docError').textContent = 'แนบไฟล์ หรือวางลิงก์อย่างใดอย่างหนึ่ง'; return; }

  TripApi.saveDocument({
    stopId: docTargetStopId,
    name, url,
    kind: pendingDocUpload ? 'file' : 'link',
    contentType: pendingDocUpload?.contentType,
    sizeBytes: pendingDocUpload?.sizeBytes
  })
    .then(() => refreshFromServer())
    .then(() => { closeLayers(); showPrototypeToast(`เพิ่มเอกสาร ${name} แล้ว`); })
    .catch(error => { $('#docError').textContent = error.message; });
});

/* ลบเอกสาร — จับที่ระดับเอกสารเพื่อให้ครอบคลุมทั้งคลังเอกสารและฟอร์มสถานที่
   โดยไม่ต้องผูก handler ซ้ำสองที่ */
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-doc]');
  if (!remove) return;
  const doc = tripDocuments.find(item => item.id === remove.dataset.removeDoc);
  if (!doc || !confirm(`ลบเอกสาร "${doc.name}" ?`)) return;
  remove.disabled = true;
  TripApi.removeDocument(doc.id)
    .then(() => {
      /* เอกสารไม่มีตัวเลขยอด/เรทที่เซิร์ฟเวอร์ต้องคำนวณกลับมา จึงตัดออกจาก state
         ทันทีหลัง API ยืนยันสำเร็จ ไม่รอ refresh ทั้งทริป — ก่อนหน้านี้รายการค้าง
         บนจอจนผู้ใช้ reload แม้ฐานลบสำเร็จแล้ว */
      tripDocuments = tripDocuments.filter(item => item.id !== doc.id);
      renderDocumentLibrary();
      renderStopDocuments(doc.stopId);
      renderManageSummary();
      showPrototypeToast('ลบเอกสารแล้ว');
    })
    .catch(error => {
      remove.disabled = false;
      showPrototypeToast(`ลบไม่สำเร็จ: ${error.message}`);
    });
});

$('#documentLibrary')?.addEventListener('click', event => {
  if (event.target.closest('#addTripDocBtn')) openDocDialog('');
});

/* ── ธีมสีของทริป (2026-08-10) ─────────────────────────────────────────
   ค่าสีจริงอยู่ใน themes.css ทั้งหมด ที่นี่เก็บแค่ "รหัสธีม + ชื่อที่คนอ่าน"
   เพิ่มธีมใหม่ต้องแก้สามที่: TRIP_THEMES (backend) · บล็อกใน themes.css ·
   และรายการนี้ — ไม่ต้องแตะฐานข้อมูลเลยเพราะเก็บเป็นข้อความรหัสธีมอยู่แล้ว */
const TRIP_THEMES = [
  { id:'hokkaido', name:'Hokkaido ฤดูหนาว', note:'ฟ้าน้ำแข็ง ขาวหิมะ ทองอุ่น',
    swatch:['#1f6fa8', '#3aa5d9', '#dff2fb', '#f0b429'] },
  { id:'sakura', name:'Fuji ซากุระ', note:'ชมพูซากุระ ม่วงพลบค่ำ เขียวใบอ่อน',
    swatch:['#c72c6e', '#e8629c', '#e4d6ff', '#2f9e6b'] }
];
const DEFAULT_THEME = 'hokkaido';
let tripTheme = DEFAULT_THEME;

/* ตั้งที่ <html> ไม่ใช่ <body> — พื้นหลังไล่สีของธีมกินเต็มจอได้จริง
   แม้เนื้อหาสั้นกว่าความสูงหน้าจอ */
function applyTheme(id) {
  tripTheme = TRIP_THEMES.some(t => t.id === id) ? id : DEFAULT_THEME;
  document.documentElement.dataset.theme = tripTheme;
  renderThemePicker();
}

function renderThemePicker() {
  const host = $('#themePicker');
  if (!host) return;
  host.innerHTML = TRIP_THEMES.map(theme => `
    <button type="button" class="theme-option" data-theme-id="${theme.id}"
            aria-pressed="${theme.id === tripTheme}">
      <span class="swatch">${theme.swatch.map(color => `<i style="background:${color}"></i>`).join('')}</span>
      <b>${theme.name}</b>
      <small>${theme.note}</small>
    </button>`).join('');
}

$('#themePicker')?.addEventListener('click', event => {
  const button = event.target.closest('[data-theme-id]');
  if (!button) return;
  const chosen = button.dataset.themeId;
  if (chosen === tripTheme) return;

  /* เปลี่ยนสีบนจอทันทีก่อนรอเซิร์ฟเวอร์ — การเลือกธีมต้องรู้สึกทันใจ
     ถ้าบันทึกไม่สำเร็จค่อยย้อนกลับ ไม่ปล่อยให้จอโชว์ธีมที่ไม่ได้ถูกบันทึกจริง */
  const previous = tripTheme;
  applyTheme(chosen);
  if (!liveMode) { showPrototypeToast('โหมดตัวอย่าง — ธีมยังไม่ถูกบันทึก'); return; }

  TripApi.saveTripMeta({
    name: $('#tripNameInput').value.trim(),
    startDate: $('#tripStartInput').value,
    endDate: $('#tripEndInput').value,
    themeId: chosen
  })
    .then(() => showPrototypeToast(`เปลี่ยนเป็นธีม ${TRIP_THEMES.find(t => t.id === chosen).name} แล้ว`))
    .catch(error => {
      applyTheme(previous);
      showPrototypeToast(`เปลี่ยนธีมไม่สำเร็จ: ${error.message}`);
    });
});

/* ── รายการค่าใช้จ่ายย่อยประจำทริป (2026-08-10) ────────────────────────
   หนึ่งรายการ = ปุ่มหนึ่งปุ่มในฟอร์มจดบิล มีชื่อและไอคอนของตัวเอง แล้วชี้ไป
   หมวดบัญชี (Categories) หนึ่งหมวดสำหรับตอนปิดทริป

   ทำไมไม่ตั้งไอคอนที่ Categories ตรง ๆ: Categories เป็นผังบัญชีระดับครอบครัว
   1 หมวด = 1 ไอคอน ซึ่งหยาบเกินไป — ทริปญี่ปุ่นอยากได้ ราเมง/ขนม/เครื่องดื่ม
   แยกไอคอนกัน ทั้งที่ทั้งสามลงบัญชีหมวด "อาหาร" เหมือนกันหมด

   ⚠️ บิลอ้าง preset_id ไม่ใช่ก๊อปชื่อ/ไอคอนไปเก็บ แก้ที่นี่ทีเดียวบิลเก่าเปลี่ยนตาม */
let tripPresets = [];

function presetById(id) {
  return tripPresets.find(row => row.id === id) || null;
}

/* ไอคอนของบรรทัดหมวดในบิล — เซิร์ฟเวอร์เติมมาให้แล้วจาก preset ปัจจุบัน
   ตัวนี้จึงเป็นแค่ทางสำรองสำหรับโหมดตัวอย่างที่ไม่มีข้อมูลจากเซิร์ฟเวอร์ */
function categoryIconOverride(presetId) {
  return presetById(presetId)?.icon || null;
}

function renderTripPresets() {
  const host = $('#categoryIconRows');
  if (!host) return;
  if (!liveMode) {
    host.innerHTML = '<p class="field-note">เข้าทริปโหมดข้อมูลจริงก่อนถึงจะตั้งรายการค่าใช้จ่ายได้ — ในโหมดตัวอย่างใช้ชุดหมวดเริ่มต้นเสมอ</p>';
    return;
  }
  const rows = tripPresets.length
    ? tripPresets.map(row => `
      <div class="currency-row">
        <span class="currency-mark"><img src="${row.icon || `${ART}st_camera2.png`}" alt=""></span>
        <span class="currency-main"><b>${row.label}</b><small>${row.categoryName || '⚠️ ยังไม่ได้ผูกบัญชี'}</small></span>
        <span class="currency-actions">
          <button type="button" data-edit-preset="${row.id}">แก้ไข</button>
          <button type="button" data-remove-preset="${row.id}">ลบ</button>
        </span>
      </div>`).join('')
    : '<p class="field-note">ทริปนี้ยังไม่มีรายการค่าใช้จ่าย — กดเพิ่มรายการแรกได้เลย</p>';
  /* ปุ่มคัดลอกอยู่คู่กับปุ่มเพิ่มเสมอ ไม่ใช่โผล่เฉพาะตอนว่าง — เพราะเติมรายการ
     จากทริปเก่าเข้ามาทีหลังก็มีประโยชน์ (เช่นนึกออกกลางทริปว่าลืมหมวดค่ารถ) */
  host.innerHTML = `${rows}
    <div class="preset-actions">
      <button type="button" class="soft-btn" id="addPresetBtn">＋ เพิ่มรายการ</button>
      <button type="button" class="soft-btn" id="copyPresetBtn">📋 คัดลอกจากทริปอื่น</button>
    </div>`;
}

/* ── คัดลอกรายการจากทริปอื่น ──────────────────────────────────────────
   ทริปใหม่เริ่มจากศูนย์ = จดบิลไม่ได้จนกว่าจะตั้งรายการเอง ซึ่งน่าเบื่อมาก
   ถ้าครอบครัวเที่ยวแบบเดิม ๆ · ดึงรายชื่อทริปมาให้เลือกตอนกด ไม่โหลดล่วงหน้า
   เพราะเป็นปุ่มที่กดไม่บ่อย ไม่ควรถ่วงการโหลดหน้าหลัก */
async function openCopyPresetPicker() {
  if (!liveMode) { showPrototypeToast('ใช้ได้เฉพาะโหมดข้อมูลจริง'); return; }
  showPrototypeToast('กำลังดึงรายชื่อทริป…');
  let trips = [];
  try {
    trips = (await TripApi.listTrips()).trips || [];
  } catch (error) {
    showPrototypeToast(`ดึงรายชื่อทริปไม่สำเร็จ: ${error.message}`);
    return;
  }

  const others = trips.filter(trip => trip.project_id !== TripApi.config.projectId);
  if (!others.length) { showPrototypeToast('ยังไม่มีทริปอื่นให้คัดลอก'); return; }

  closeLayers();
  $('#copyPresetList').innerHTML = others.map(trip => `
    <button type="button" class="currency-row" data-copy-from="${trip.project_id}" style="width:100%;text-align:left;border:0;background:none;cursor:pointer">
      <span class="currency-mark">🧳</span>
      <span class="currency-main"><b>${trip.name}</b><small>${trip.start_date ? thaiDate(trip.start_date) : 'ยังไม่ระบุวัน'}</small></span>
    </button>`).join('');
  mask.classList.add('open');
  $('#copyPresetDialog').classList.add('open');
  $('#copyPresetDialog').setAttribute('aria-hidden', 'false');
}

$('#copyPresetList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-copy-from]');
  if (!button) return;
  TripApi.copyPresets(button.dataset.copyFrom)
    .then(result => refreshFromServer().then(() => {
      closeLayers();
      showScreen('more');
      showPrototypeToast(result.copied
        ? `คัดลอกมา ${result.copied} รายการ${result.skipped ? ` · ข้ามที่ชื่อซ้ำ ${result.skipped}` : ''}`
        : 'ไม่มีรายการใหม่ให้คัดลอก (ชื่อซ้ำทั้งหมด)');
    }))
    .catch(error => showPrototypeToast(`คัดลอกไม่สำเร็จ: ${error.message}`));
});

/* ฟอร์มเพิ่ม/แก้รายการ — ใช้ dialog เดียวกันทั้งสองกรณี
   editingPresetId ว่าง = สร้างใหม่ */
let editingPresetId = null;
let presetIcon = '';

function openPresetDialog(preset = null) {
  if (!liveMode) { showPrototypeToast('ตั้งรายการค่าใช้จ่ายได้เฉพาะโหมดข้อมูลจริง'); return; }
  closeLayers();
  editingPresetId = preset?.id || null;
  presetIcon = preset?.icon || `${ART}st_camera2.png`;
  $('#presetDialogTitle').textContent = preset ? 'แก้ไขรายการค่าใช้จ่าย' : 'เพิ่มรายการค่าใช้จ่าย';
  $('#presetLabel').value = preset?.label || '';
  $('#presetIconPreview').src = presetIcon;
  /* หมวดบัญชีมาจากผังบัญชีของครอบครัว (behavior = EXPENSE) — ตัวเลือกเดียวกับ
     ที่ฟอร์มจดบิลเคยใช้ ปล่อยว่างได้ แต่จะเตือนว่ายังไม่ผูกบัญชี */
  $('#presetCategory').innerHTML = '<option value="">— ยังไม่ผูกบัญชี —</option>'
    + ledgerCategories.map(row =>
        `<option value="${row.category_id}">${row.caption_name} · ${row.category_name}</option>`).join('');
  $('#presetCategory').value = preset?.categoryId || '';
  $('#presetError').textContent = '';
  mask.classList.add('open');
  $('#presetDialog').classList.add('open');
  $('#presetDialog').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#presetLabel').focus(), 80);
}

$('#categoryIconRows')?.addEventListener('click', event => {
  if (event.target.closest('#addPresetBtn')) return openPresetDialog();
  if (event.target.closest('#copyPresetBtn')) return openCopyPresetPicker();

  const edit = event.target.closest('[data-edit-preset]');
  if (edit) return openPresetDialog(presetById(edit.dataset.editPreset));

  const remove = event.target.closest('[data-remove-preset]');
  if (remove) {
    const preset = presetById(remove.dataset.removePreset);
    if (!preset) return;
    if (!confirm(`ลบรายการ "${preset.label}" ?\nบิลเก่าที่ใช้รายการนี้จะยังอยู่ครบ แต่จะไม่เปลี่ยนตามอีก`)) return;
    TripApi.removePreset(preset.id)
      .then(() => refreshFromServer())
      .then(() => { showScreen('more'); showPrototypeToast(`ลบ ${preset.label} แล้ว`); })
      .catch(error => showPrototypeToast(`ลบไม่สำเร็จ: ${error.message}`));
  }
});

/* เลือกไอคอนจากคลังเดียวกับที่อื่น แล้วเปิด dialog กลับมา ไม่ให้เสียของที่พิมพ์ไว้ */
$('#pickPresetIcon')?.addEventListener('click', () => openAssetPicker('expense', presetIcon, src => {
  presetIcon = src;
  $('#presetIconPreview').src = src;
  mask.classList.add('open');
  $('#presetDialog').classList.add('open');
  $('#presetDialog').setAttribute('aria-hidden', 'false');
}));

$('#presetForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const label = $('#presetLabel').value.trim();
  if (!label) { $('#presetError').textContent = 'ต้องตั้งชื่อรายการ'; return; }
  TripApi.savePreset({
    id: editingPresetId || '',
    label,
    icon: presetIcon,
    categoryId: $('#presetCategory').value,
    sortOrder: editingPresetId ? (presetById(editingPresetId)?.sortOrder ?? 0) : tripPresets.length
  })
    .then(() => refreshFromServer())
    .then(() => {
      closeLayers();
      showScreen('more');
      showPrototypeToast(`${editingPresetId ? 'อัปเดต' : 'เพิ่ม'} ${label} แล้ว`);
    })
    .catch(error => { $('#presetError').textContent = error.message; });
});

function openCurrencyDialog(code = null) {
  if (liveMode && !liveCanManageSharedSettings) {
    showPrototypeToast('แก้สกุลเงินได้เฉพาะผู้ดูแลทริป');
    return;
  }
  if (blockedByClose('currencies')) return;
  closeLayers();
  editingCurrency = code;
  const currency = code ? currencyByCode(code) : null;
  $('#currencyTitle').textContent = currency ? `แก้ไข ${currency.code}` : 'เพิ่มสกุลเงิน';
  $('#currencyCode').value = currency?.code || '';
  $('#currencyCode').disabled = Boolean(currency);
  $('#currencySymbol').value = currency?.symbol || '';
  $('#currencyLabel').value = currency?.label || '';
  $('#currencyRate').value = currency ? Number(currency.planRate).toFixed(4) : '';
  currencyIcon = currency?.icon || CURRENCY_ICON_BY_CODE[currency?.code] || DEFAULT_ICONS.currency;
  $('#currencyIconPreview').src = currencyIcon;
  $('#currencyError').textContent = '';
  updateCurrencyPreview();
  mask.classList.add('open');
  currencyDialog.classList.add('open');
  currencyDialog.setAttribute('aria-hidden', 'false');
}

function updateCurrencyPreview() {
  const rate = Number($('#currencyRate').value.replace(/[^\d.]/g, '')) || 0;
  const symbol = $('#currencySymbol').value || '?';
  $('#currencyPreview').innerHTML = rate > 0
    ? `ตัวอย่าง: <b>${symbol}10,000</b> ≈ <b>${fmtAmount(10000 * rate, '฿')}</b>`
    : '';
}
$('#currencyRate').addEventListener('input', updateCurrencyPreview);
$('#currencyCode').addEventListener('input', event => {
  if (editingCurrency) return;
  const suggested = CURRENCY_ICON_BY_CODE[event.target.value.trim().toUpperCase()];
  if (suggested) {
    currencyIcon = suggested;
    $('#currencyIconPreview').src = suggested;
  }
});
$('#currencySymbol').addEventListener('input', updateCurrencyPreview);

$('#addCurrency').addEventListener('click', () => openCurrencyDialog());
$('#currencyRows').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-currency]');
  const remove = event.target.closest('[data-remove-currency]');
  if (edit) return openCurrencyDialog(edit.dataset.editCurrency);
  if (!remove || remove.disabled) return;
  const code = remove.dataset.removeCurrency;
  if (blockedByClose('currencies') || walletsUsing(code).length) return;
  if (liveMode) {
    // เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นว่ามีกระเป๋าหรือบิลใช้สกุลนี้อยู่ไหม
    // ฝั่งหน้าจอเห็นเฉพาะกระเป๋าของตัวเอง จึงตัดสินใจแทนทั้งทริปไม่ได้
    submitLive(null, () => TripApi.removeCurrency(code), `ลบสกุลเงิน ${code} แล้ว`)
      .then(ok => { if (!ok) showPrototypeToast('ลบไม่สำเร็จ — ยังมีกระเป๋าหรือบิลใช้สกุลนี้อยู่'); });
    return;
  }
  tripCurrencies = tripCurrencies.filter(currency => currency.code !== code);
  renderCurrencies();
  renderBills();
  showPrototypeToast(`ลบสกุลเงิน ${code} แล้ว`);
});

/* ── ชื่อทริปและช่วงวันที่ ──────────────────────────────────────────────
   เติมค่าปัจจุบันลงฟอร์มทุกครั้งที่ดึงข้อมูลใหม่ ไม่งั้นคนแก้จะเห็นช่องว่าง
   แล้วเผลอบันทึกทับของเดิมด้วยค่าว่าง */
function fillTripMetaForm(state) {
  const name = $('#tripNameInput');
  if (!name) return;
  name.value = state?.tripName || '';
  $('#tripStartInput').value = state?.tripStartDate || '';
  $('#tripEndInput').value = state?.tripEndDate || '';
  $('#tripStageInput').value = state?.tripStage || 'ONGOING';
  /* สิทธิ์มาจากเซิร์ฟเวอร์ (canManageTrip รวมผู้ดูแลระบบครอบครัวที่ไม่ได้
     เป็นสมาชิกทริปด้วย) — ถ้าไม่มีสิทธิ์และ viewer หาไม่เจอ ให้บอกสาเหตุจริง
     ไม่ใช่โทษคนใช้ว่าไม่ใช่ผู้ดูแล ทั้งที่จริง ๆ ระบบแค่จับคู่คนไม่ได้ */
  const unknownViewer = liveMode && !memberById(viewerId);
  const canEdit = !liveMode || Boolean(state?.canManageTrip) || Boolean(memberById(viewerId)?.admin);
  $('#saveTripMeta').disabled = !canEdit;
  $('#tripMetaError').textContent = canEdit ? ''
    : (unknownViewer
        ? 'ระบบยังไม่รู้ว่าคุณเป็นสมาชิกคนไหนของทริปนี้ (ทริปเก่าที่สมาชิกยังไม่ผูกบัญชี) — รัน link_trip_members.sql เพื่อผูก'
        : 'แก้ข้อมูลทริปได้เฉพาะผู้ดูแลทริป');

  /* 🔴 ลิงก์เข้าทริปย้ายไปอยู่หัวข้อ "คนและสิทธิ์" ที่เดียวแล้ว (North 2026-08-23)
     ดู renderJoinLink() — ห้ามเพิ่มช่องลิงก์ที่สองกลับมาอีก
     สองช่องที่คำนวณคนละที่คือที่มาของการส่งผิดลิงก์ให้ผิดคน */

  // ลบทริปได้เฉพาะ admin และห้ามเด็ดขาดถ้าเคยโพสต์เข้าบัญชีจริงแล้ว
  // (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นตอนกดจริง ปุ่มนี้แค่กันไม่ให้กดแล้วเจอ error เปล่า ๆ)
  const deleteBtn = $('#deleteTripBtn');
  const deleteNote = $('#deleteTripNote');
  if (deleteBtn) {
    if (!liveMode) {
      deleteBtn.disabled = true;
      deleteNote.textContent = 'โหมดข้อมูลตัวอย่างยังลบทริปไม่ได้';
    } else if (!canEdit) {
      deleteBtn.disabled = true;
      deleteNote.textContent = 'ลบทริปได้เฉพาะผู้ดูแลทริป';
    } else if (state?.postedToLedger) {
      deleteBtn.disabled = true;
      deleteNote.textContent = 'ทริปนี้โพสต์เข้าบัญชีจริงแล้ว ลบไม่ได้ — เปลี่ยนประเภทเป็น 📸 Memory ด้านบนแทนได้';
    } else {
      deleteBtn.disabled = false;
      deleteNote.textContent = 'ลบแล้วกู้คืนไม่ได้ ข้อมูลบิล กระเป๋า และแผนเที่ยวทั้งหมดของทริปนี้จะหายไป';
    }
  }
  /* แถบสรุปด้านบนอ่านค่าจากฟอร์มนี้ ต้องวาดใหม่หลังเติมค่าเสร็จ
     ไม่งั้นตอนโหลดรอบแรกจะขึ้นชื่อ "ทริปนี้" และ "ยังไม่ได้ตั้งช่วงวันเดินทาง"
     ทั้งที่ข้อมูลมาถึงแล้ว — ดูเหมือนข้อมูลหาย ทั้งที่แค่วาดผิดจังหวะ */
  renderManageSummary();
}

$('#tripMetaForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#tripNameInput').value.trim();
  if (!name) { $('#tripMetaError').textContent = 'ตั้งชื่อทริปก่อน'; return; }
  if (!liveMode) {
    $('#tripMetaError').textContent = 'โหมดข้อมูลตัวอย่างยังแก้ชื่อทริปไม่ได้ — เปิดด้วย ?live=1';
    return;
  }
  submitLive('#tripMetaError', async () => {
    const result = await TripApi.saveTripMeta({
      name, startDate: $('#tripStartInput').value, endDate: $('#tripEndInput').value,
      tripStage: $('#tripStageInput').value
    });
    /* เตือนถ้าย่นช่วงวันจนบิลหลุดออกนอก — ไม่ห้าม เพราะตั๋วเครื่องบินหรือ
       มัดจำโรงแรมจ่ายก่อนเดินทางจริง ๆ แต่ต้องรู้ว่าเกิดขึ้น */
    if (result.bills_outside_range) {
      setTimeout(() => showPrototypeToast(
        `⚠️ มีบิล ${result.bills_outside_range} ใบอยู่นอกช่วงวันที่ตั้งใหม่`), 1200);
    }
    return result;
  }, `บันทึกข้อมูลทริปแล้ว`);
});

/* ── ลบทริป ────────────────────────────────────────────────────────────
   ยืนยันสองชั้น (confirm ธรรมดา) เพราะกู้คืนไม่ได้ · เซิร์ฟเวอร์ตรวจเงื่อนไข
   "เคยโพสต์บัญชีจริงหรือยัง" ซ้ำอีกทีอยู่ดี ปุ่มฝั่งนี้แค่กันกดพลาดเบื้องต้น */
$('#deleteTripBtn')?.addEventListener('click', async () => {
  if (!liveMode) return;
  const name = $('#tripNameInput').value.trim() || 'ทริปนี้';
  if (!confirm(`ลบ "${name}" ถาวร? ข้อมูลบิล กระเป๋า และแผนเที่ยวทั้งหมดจะหายไป กู้คืนไม่ได้`)) return;

  const btn = $('#deleteTripBtn');
  const note = $('#deleteTripNote');
  btn.disabled = true;
  note.textContent = 'กำลังลบ…';
  try {
    await TripApi.deleteTrip();
    // เลิกจำทริปนี้ก่อนออก ไม่งั้นหน้ารวมจะเด้งกลับเข้าทริปที่เพิ่งลบ
    try { localStorage.removeItem('unified-trip-last'); } catch {}
    location.href = 'trips.html?all=1';
  } catch (error) {
    btn.disabled = false;
    note.textContent = error.message;
  }
});

/* ── ส่งขึ้นเซิร์ฟเวอร์แล้วดึงข้อมูลใหม่ทั้งชุด ─────────────────────────
   ใช้ร่วมกันทุกฟอร์มในโหมดข้อมูลจริง

   ล้มเหลว = ไม่ปิดฟอร์ม และแสดงเหตุผลจากเซิร์ฟเวอร์ตามจริง ไม่แปลงเป็น
   ข้อความกลาง ๆ เพราะฝั่งเซิร์ฟเวอร์บอกสาเหตุละเอียดกว่าที่หน้าจอเดาเองได้
   เช่น "ยังมีกระเป๋า 2 ใบใช้สกุล JPY อยู่" ซึ่งบอกทางแก้ไปในตัว */
/* successMessage รับได้ทั้งข้อความตรง ๆ และฟังก์ชันที่รับผลลัพธ์จากเซิร์ฟเวอร์
   🔴 ข้อความยืนยันต้องพูดสิ่งที่เกิดขึ้นจริง ไม่ใช่สิ่งที่ตั้งใจให้เกิด
      ตัวอย่างที่เคยหลอกมาแล้ว: ปิดทริปขึ้นว่า "ยอดถูกบันทึกเข้าบัญชีจริง"
      ทั้งที่ไม่มีอะไรถูกเขียนลงสมุดบัญชีเลยสักบรรทัด */
async function submitLive(errorSelector, action, successMessage) {
  const errorBox = $(errorSelector);
  if (errorBox) errorBox.textContent = 'กำลังบันทึก…';
  try {
    const result = await action();
    await refreshFromServer();
    closeLayers();
    showPrototypeToast(typeof successMessage === 'function' ? successMessage(result) : successMessage);
    return true;
  } catch (error) {
    if (errorBox) errorBox.textContent = error.message;
    return false;
  }
}

$('#currencyForm').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('#currencyCode').value.trim().toUpperCase();
  const rate = Number($('#currencyRate').value.replace(/[^\d.]/g, ''));
  const error = $('#currencyError');
  error.textContent = '';
  if (!/^[A-Z]{3}$/.test(code)) { error.textContent = 'รหัสสกุลต้องเป็นตัวอักษร 3 ตัว เช่น JPY'; return; }
  if (!(rate > 0)) { error.textContent = 'เรทประมาณการต้องมากกว่า 0'; return; }
  if (!editingCurrency && currencyByCode(code)) { error.textContent = `มีสกุล ${code} อยู่แล้ว`; return; }

  const payload = { code, symbol:$('#currencySymbol').value.trim(), label:$('#currencyLabel').value.trim(), planRate:rate, icon:currencyIcon };
  const verb = editingCurrency ? 'อัปเดต' : 'เพิ่ม';

  if (liveMode) {
    // สกุลเดิมมี is_base อยู่แล้ว ต้องส่งกลับไปด้วย ไม่งั้นสกุลหลักจะกลายเป็นสกุลธรรมดา
    const existing = currencyByCode(editingCurrency || code);
    submitLive('#currencyError',
      () => TripApi.saveCurrency({ ...payload, base: Boolean(existing?.base) }),
      `${verb}สกุลเงิน ${code} แล้ว`);
    return;
  }

  if (editingCurrency) {
    Object.assign(currencyByCode(editingCurrency), payload);
  } else {
    tripCurrencies.push(payload);
  }
  closeLayers();
  renderCurrencies();
  renderBills();
  showPrototypeToast(`${verb}สกุลเงิน ${code} แล้ว`);
});

/* ปุ่ม 🎨 มุมขวาบนถูกถอดออกแล้ว (North 2026-08-22) — เปลี่ยนไอคอนกับสี
   ทำในฟอร์มแก้ไข (ปุ่ม ✏️ ใต้แถบ) ที่เดียว ไม่ต้องมีสองทางเข้าให้สับสน */
$('#walletGrid').addEventListener('click', event => {
  const fund = event.target.closest('[data-fund-wallet]');
  if (fund) openFundDialog(fund.dataset.fundWallet);
});

$('#walletGrid').addEventListener('change', event => {
  const carry = event.target.closest('[data-carry-wallet]');
  if (!carry) return;
  if (blockedByClose('wallets')) { carry.checked = !carry.checked; return; }
  const wallet = walletById(carry.dataset.carryWallet);
  if (liveMode) {
    // ล้มเหลว = คืนช่องติ๊กกลับ ไม่ปล่อยให้จอโชว์สถานะที่ไม่ตรงกับฐาน
    submitLive(null, () => TripApi.saveWallet({ ...wallet, excludeOnClose: carry.checked }),
      `${carry.checked ? 'ยกเว้น' : 'รวม'} ${wallet.label} ตอนปิดทริป`)
      .then(ok => { if (!ok) { carry.checked = !carry.checked; showPrototypeToast('บันทึกไม่สำเร็จ'); } });
    return;
  }
  wallet.excludeOnClose = carry.checked;
  renderBills();
  showScreen('wallets');
  showPrototypeToast(wallet.excludeOnClose
    ? `${wallet.label}: เงินเหลือจะยกไปทริปหน้า ไม่คืนเข้าบัญชี`
    : `${wallet.label}: เงินเหลือจะคืนเข้าบัญชีต้นทางตามปกติ`);
});

/* ── Fund a wallet ────────────────────────────────────────────────────
   A funding lot is what turns a planned rate into a real one, so the form
   shows the resulting rate before and after this lot lands. */
let fundingWalletId = null;
/* ล็อตที่กำลังแก้อยู่ · ว่าง = กำลังเพิ่มล็อตใหม่ (North 2026-08-22)
   🔴 ต้องล้างทุกครั้งที่เปิดฟอร์มแบบเพิ่มใหม่ ไม่งั้นการเติมเงินครั้งถัดไป
      จะไปทับล็อตเก่าเงียบ ๆ — เงินที่เติมจริงจะหายไปหนึ่งก้อนโดยไม่มีอะไรฟ้อง */
let editingFundingId = '';

function openFundDialog(walletId, lot = null) {
  if (blockedByClose('fundings')) return;
  closeLayers();
  editingFundingId = lot ? lot.id : '';
  fundingWalletId = lot ? lot.walletId : walletId;
  const wallet = walletById(fundingWalletId);
  if (!wallet) return;
  const info = rateInfo(wallet.currency, wallet.id);
  $('#fundTitle').textContent = lot ? 'แก้ไขการเติมเงิน' : 'เติมเงินเข้ากระเป๋า';
  $('#fundWalletInfo').innerHTML = `
    <img src="${wallet.icon || DEFAULT_ICONS.wallet}" alt="">
    <span><b>${wallet.label}</b><small>${wallet.currency} · ${info.rate === null ? 'ยังไม่มีเรท' : `เรทตอนนี้ ${info.rate.toFixed(4)} ฿`} ${info.source === 'planned' ? '(ประมาณการ)' : ''}</small></span>`;
  paintMoneyInput('#fundThb', lot ? lot.thb : '');
  paintMoneyInput('#fundForeign', lot ? lot.foreign : '');
  $('#fundNote').value = lot ? (lot.note || '') : '';
  $('#fundDate').value = lot ? lot.date : new Date().toISOString().slice(0, 10);
  $('#fundError').textContent = '';
  const submit = $('#fundForm button[type="submit"]');
  if (submit) submit.textContent = lot ? 'บันทึกการแก้ไข' : 'บันทึกการเติมเงิน';
  updateFundPreview();
  mask.classList.add('open');
  $('#fundDialog').classList.add('open');
  $('#fundDialog').setAttribute('aria-hidden', 'false');
}

function updateFundPreview() {
  if (!fundingWalletId) return;
  const wallet = walletById(fundingWalletId);
  const thbIn = Number($('#fundThb').value.replace(/[^\d.]/g, '')) || 0;
  const foreignIn = Number($('#fundForeign').value.replace(/[^\d.]/g, '')) || 0;
  const before = walletRate(fundingWalletId);
  if (!thbIn || !foreignIn) { $('#fundPreview').innerHTML = ''; return; }

  const lotRate = thbIn / foreignIn;
  /* ⚠️ ตอนแก้ไข ต้องหักล็อตเดิมออกก่อน ไม่งั้นตัวอย่างจะนับซ้ำสองรอบ
     แล้วโชว์เรทเฉลี่ยที่ไม่มีทางเกิดขึ้นจริงหลังกดบันทึก */
  const lots = lotsOf(fundingWalletId).filter(row => row.id !== editingFundingId);
  const totalThb = lots.reduce((sum, row) => sum + row.thb, 0) + thbIn;
  const totalForeign = lots.reduce((sum, row) => sum + row.foreign, 0) + foreignIn;
  const after = totalThb / totalForeign;
  $('#fundPreview').innerHTML = `
    <span>เรทของล็อตนี้<b>${lotRate.toFixed(4)} ฿/${symbolFor(wallet.currency)}</b></span>
    <span>เรทเฉลี่ยหลังเติม<b>${after.toFixed(4)} ฿</b>${before === null ? '<small>เดิมยังไม่มีเรทจริง</small>' : `<small>เดิม ${before.toFixed(4)} ฿</small>`}</span>`;
}
['#fundThb', '#fundForeign'].forEach(id => {
  $(id).addEventListener('input', updateFundPreview);
  attachMoneyInput(id);          // คั่นหลักพันให้เองตอนออกจากช่อง
});
attachMoneyInput('#expenseAmount');

$('#fundForm').addEventListener('submit', event => {
  event.preventDefault();
  const thbIn = Number($('#fundThb').value.replace(/[^\d.]/g, ''));
  const foreignIn = Number($('#fundForeign').value.replace(/[^\d.]/g, ''));
  if (!(thbIn > 0) || !(foreignIn > 0)) {
    $('#fundError').textContent = 'กรอกทั้งยอดเงินบาทและยอดเงินสกุลนั้นให้มากกว่า 0';
    return;
  }
  const editing = Boolean(editingFundingId);
  const lot = {
    id: editing ? editingFundingId : `f-${Date.now()}`, walletId: fundingWalletId,
    date: $('#fundDate').value, thb: thbIn, foreign: foreignIn,
    note: $('#fundNote').value.trim() || 'เติมเงิน'
  };
  const label = fmtAmount(foreignIn, symbolFor(walletById(fundingWalletId).currency));
  const message = editing
    ? `แก้เป็น ${label} แล้ว · เรทเฉลี่ยคำนวณใหม่`
    : `เติม ${label} แล้ว · เรทเฉลี่ยคำนวณใหม่`;

  if (liveMode) {
    submitLive('#fundError', () => TripApi.saveFunding(lot), message)
      .then(() => showScreen('wallets'));
    return;
  }

  /* แก้ = เขียนทับล็อตเดิมในตำแหน่งเดิม ไม่ใช่ลบแล้ว push ต่อท้าย
     ลำดับที่แสดงเรียงตามวันที่จริงอยู่แล้ว แต่การคงตำแหน่งไว้ทำให้
     เทียบ state ก่อน-หลังได้ตรงไปตรงมาเวลาไล่หาปัญหา */
  const at = fundings.findIndex(row => row.id === lot.id);
  if (at >= 0) fundings[at] = lot; else fundings.push(lot);
  editingFundingId = '';
  closeLayers();
  renderBills();
  showScreen('wallets');
  showPrototypeToast(message);
});

/* ── Add a wallet ── */
let newWalletIcon = DEFAULT_ICONS.wallet;

$('#pickWalletIcon').addEventListener('click', () => openAssetPicker('wallet', newWalletIcon, src => {
  newWalletIcon = src;
  $('#walletIconPreview').src = src;
  renderWalletSwatches();   // กลับจากตัวเลือกไอคอนแล้ว จานสีต้องยังจำสีที่เลือกไว้
  mask.classList.add('open');
  $('#walletDialog').classList.add('open');
  $('#walletDialog').setAttribute('aria-hidden', 'false');
}));

/* กระเป๋าที่กำลังแก้อยู่ · ว่าง = กำลังสร้างใบใหม่ */
let editingWalletId = '';

/* ── จานสีกระเป๋า (North 2026-08-22: "ให้เป็นสีพาสเทลทุกสีมีให้เลือก") ──
   เก็บเป็น "องศาสี" (hue) ไม่ใช่รหัสสี #rrggbb — ความสว่างและความอิ่มสี
   ถูกกำหนดไว้ในไฟล์ CSS ที่เดียว ทุกสีจึงพาสเทลเท่ากันและตัวหนังสือบนพื้นนั้น
   อ่านออกเสมอ ต่อให้ผู้ใช้เลือกสีไหน — ถ้าให้เลือกรหัสสีเต็ม เลือกสีเข้มทีเดียว
   ตัวเลขบนการ์ดจะหายไปกับพื้นหลังทันทีโดยไม่มีอะไรกันไว้

   วนทีละ 24 องศาได้ 15 สีครบวงล้อ (ชมพู · ส้ม · เหลือง · เขียว · ฟ้า · ม่วง)
   null = ใช้สีตามสกุลเงินอัตโนมัติ ซึ่งเป็นค่าเริ่มต้น */
const WALLET_HUES = Array.from({ length: 15 }, (unused, index) => index * 24);
let newWalletHue = null;

function renderWalletSwatches() {
  const box = $('#walletSwatches');
  if (!box) return;
  box.innerHTML = `
    <button type="button" class="swatch auto${newWalletHue === null ? ' on' : ''}" data-hue=""
      title="ใช้สีตามสกุลเงินอัตโนมัติ" aria-label="ใช้สีตามสกุลเงิน">อัตโนมัติ</button>
    ${WALLET_HUES.map(hue => `
      <button type="button" class="swatch${newWalletHue === hue ? ' on' : ''}" data-hue="${hue}"
        style="--wc:${hue}" aria-label="สีที่ ${hue} องศา"></button>`).join('')}`;
}

$('#walletSwatches').addEventListener('click', event => {
  const swatch = event.target.closest('[data-hue]');
  if (!swatch) return;
  // '' = อัตโนมัติ · ต้องเป็น null ไม่ใช่ 0 (0 คือสีแดงจริง ๆ)
  newWalletHue = swatch.dataset.hue === '' ? null : Number(swatch.dataset.hue);
  renderWalletSwatches();
});

/* บัญชีเงินฝากในครอบครัว — โหลดครั้งเดียวแล้วใช้ซ้ำ */
let familyAccounts = [];

async function loadFamilyAccounts() {
  if (!liveMode || familyAccounts.length) return;
  try {
    familyAccounts = (await TripApi.listFamilyAccounts()).accounts || [];
  } catch (error) {
    console.error('load family accounts failed', error);
    familyAccounts = [];
  }
}

function paintWalletAccountPicker(wallet) {
  const box = $('#walletAccount');
  if (!box) return;
  const picked = wallet?.accountId || '';
  box.innerHTML = `<option value="">— ไม่ระบุ —</option>`
    + familyAccounts.map(row =>
      `<option value="${row.account_id}"${picked === row.account_id ? ' selected' : ''}>${row.entity_name} · ${row.name}</option>`).join('');
}

/* 🔴 บัตรเครดิตก็ต้องผูกบัญชี (แก้ 2026-08-23 รอบสอง)
   เดิมซ่อนช่องบัญชีเมื่อเลือกบัตรเครดิต ด้วยเหตุผลว่า "ไม่ผูกบัญชีเงินฝาก"
   แต่ผลจริงคือบิลที่จ่ายด้วยบัตร **ไม่มีบัญชีปลายทางตอนปิดทริป จึงลงสมุด
   บัญชีไม่ได้เลย** — ยอดทั้งก้อนหายไปโดยไม่มีอะไรฟ้อง

   บัญชีบัตรเครดิตในสมุดบัญชีหลักมีอยู่จริง และเป็นที่ที่ยอดถูกเรียกเก็บจริง
   จึงเป็นปลายทางที่ถูกต้อง · ช่องนี้จึงแสดงเสมอ เปลี่ยนแค่คำอธิบายให้ตรงชนิด */
function syncWalletKindFields() {
  const isCredit = $('#walletKind').value === 'CREDIT';
  const field = $('#walletAccountField');
  if (field) field.hidden = false;
  const hint = $('#walletAccountHint');
  if (hint) {
    hint.textContent = isCredit
      ? 'บัญชีบัตรเครดิตที่ยอดนี้จะถูกเรียกเก็บ — ตอนปิดทริปค่าใช้จ่ายจะลงบัญชีนี้'
      : 'บัญชีที่เงินก้อนนี้ออกไป (เช่น "เงินรอเที่ยว") — ตอนปิดทริปค่าใช้จ่ายจะถูกตัดออกจากบัญชีนี้';
  }
  const note = $('#walletKindNote');
  if (note) note.hidden = !isCredit;
}

$('#walletKind').addEventListener('change', syncWalletKindFields);

function openWalletDialog(wallet = null) {
  if (blockedByClose('wallets')) return;
  closeLayers();
  editingWalletId = wallet ? wallet.id : '';
  newWalletIcon = wallet?.icon || DEFAULT_ICONS.wallet;
  newWalletHue = wallet?.colorHue ?? null;
  renderWalletSwatches();
  $('#walletKind').value = wallet?.kind === 'CREDIT' ? 'CREDIT' : 'CASH';
  paintWalletAccountPicker(wallet);
  syncWalletKindFields();
  loadFamilyAccounts().then(() => {
    if ($('#walletDialog').classList.contains('open')) paintWalletAccountPicker(wallet);
  });
  $('#walletIconPreview').src = newWalletIcon;
  $('#walletLabel').value = wallet?.label || '';
  $('#walletError').textContent = '';
  const title = $('#walletDialogTitle');
  if (title) title.textContent = wallet ? 'แก้ไขกระเป๋าเงิน' : 'เพิ่มกระเป๋าเงิน';
  const submit = $('#walletSubmit');
  if (submit) submit.textContent = wallet ? 'บันทึกการแก้ไข' : 'สร้างกระเป๋า';
  /* Foreign currencies first: a trip wallet is far more often for spending
     abroad than for baht, and THB sitting at the top made it the silent
     default every time. */
  const ordered = [...tripCurrencies].sort((a, b) => Number(Boolean(a.base)) - Number(Boolean(b.base)));
  $('#walletCurrency').innerHTML = ordered
    .map(currency => `<option value="${currency.code}"${wallet?.currency === currency.code ? ' selected' : ''}>${currency.code} · ${currency.label}${currency.base ? ' (สกุลหลัก)' : ''}</option>`).join('');
  /* 🔴 กระเป๋าที่เติมเงินไปแล้ว เปลี่ยนสกุลไม่ได้ — ล็อตเก่าถูกบันทึกไว้เป็น
     "บาทต่อหน่วยของสกุลนั้น" ถ้าสลับสกุลทีหลัง เรทเดิมจะกลายเป็นเรทของอีกสกุล
     ซึ่งผิดทั้งก้อน ฝั่งเซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว ตรงนี้กันไม่ให้ลองเสียเวลา */
  const locked = Boolean(wallet && lotsOf(wallet.id).length);
  $('#walletCurrency').disabled = locked;
  const hint = $('#walletCurrencyHint');
  if (hint) hint.textContent = locked ? 'เติมเงินไปแล้ว จึงเปลี่ยนสกุลไม่ได้ · ถ้าต้องการสกุลอื่นให้สร้างกระเป๋าใบใหม่' : '';
  mask.classList.add('open');
  $('#walletDialog').classList.add('open');
  $('#walletDialog').setAttribute('aria-hidden', 'false');
}

$('#addWallet').addEventListener('click', () => openWalletDialog(null));

$('#walletForm').addEventListener('submit', event => {
  event.preventDefault();
  const label = $('#walletLabel').value.trim();
  if (!label) { $('#walletError').textContent = 'ตั้งชื่อกระเป๋าก่อน'; return; }
  const editing = editingWalletId ? walletById(editingWalletId) : null;
  const wallet = {
    ...(editing || {}),
    id: editing ? editing.id : `w-${Date.now()}`,
    ownerId: editing ? editing.ownerId : viewerId,
    label,
    currency: editing && $('#walletCurrency').disabled ? editing.currency : $('#walletCurrency').value,
    icon: newWalletIcon,
    colorHue: newWalletHue,
    kind: $('#walletKind').value === 'CREDIT' ? 'CREDIT' : 'CASH',
    // ทั้งเงินสดและบัตรเครดิตผูกบัญชีได้ — ไม่มีบัญชี = ปิดทริปแล้วยอดลงสมุดบัญชีไม่ได้
    accountId: $('#walletAccount').value
  };
  const message = editing ? `แก้ไขกระเป๋า ${label} แล้ว` : `สร้างกระเป๋า ${label} แล้ว`;

  if (liveMode) {
    submitLive('#walletError', () => TripApi.saveWallet(wallet), message)
      .then(() => showScreen('wallets'));
    return;
  }

  if (editing) {
    const at = wallets.findIndex(row => row.id === editing.id);
    wallets[at] = wallet;
    editingWalletId = '';
    closeLayers();
    renderBills();
    showScreen('wallets');
    showPrototypeToast(message);
    return;
  }
  wallets.push(wallet);
  closeLayers();
  renderBills();
  showScreen('wallets');
  showPrototypeToast(`สร้างกระเป๋า ${label} แล้ว`);
});

$('#memberRows').addEventListener('click', event => {
  const row = event.target.closest('[data-view-as]');
  if (!row || row.dataset.viewAs === viewerId) return;
  /* โหมดข้อมูลจริงห้ามเปลี่ยน viewerId จากการคลิกชื่อคนอื่น เพราะ viewerId คือ
     ตัวตนที่เซิร์ฟเวอร์ยืนยันแล้ว ไม่ใช่ตัวกรองสำหรับทดลองดูหน้าจอ */
  if (liveMode) {
    showPrototypeToast(`คุณเข้าสู่ระบบในชื่อ ${memberName(viewerId)} · ไม่สามารถสลับเป็น ${memberName(row.dataset.viewAs)} ได้`);
    return;
  }
  viewerId = row.dataset.viewAs;
  renderBills();
  renderMembers();   // ป้าย "กำลังดูอยู่" ต้องย้ายตามคนที่เลือก
  // สิทธิ์ปุ่มบันทึก/ลบทริปผูกกับคนที่กำลังดู — สลับมุมมองแล้วต้องประเมินใหม่
  // (liveCanManage มาจากเซิร์ฟเวอร์ ครอบคลุมผู้ดูแลระบบครอบครัวด้วย)
  const isAdmin = Boolean(memberById(viewerId)?.admin);
  const canEdit = !liveMode || isAdmin || liveCanManage;
  $('#saveTripMeta').disabled = !canEdit;
  $('#tripMetaError').textContent = canEdit ? '' : 'แก้ข้อมูลทริปได้เฉพาะผู้ดูแลทริป';
  showPrototypeToast(`กำลังดูในมุมมองของ ${memberName(viewerId)}`);
});

$$('[data-bill-filter]').forEach(button => button.addEventListener('click', () => {
  activeBillFilter = button.dataset.billFilter;
  $$('[data-bill-filter]').forEach(row => row.classList.toggle('active', row === button));
  renderBills();
}));

$('#billFilterReset').addEventListener('click', () => {
  activeBillFilter = 'all';
  activeBillPayer = '';
  activeBillDate = '';
  $$('[data-bill-filter]').forEach(row => row.classList.toggle('active', row.dataset.billFilter === 'all'));
  renderBills();
});

$('#billDateFilter').addEventListener('change', event => {
  activeBillDate = event.target.value;
  renderBills();
});

$('#billPayerFilter').addEventListener('click', event => {
  const button = event.target.closest('[data-bill-payer]');
  if (!button) return;
  activeBillPayer = button.dataset.billPayer;
  renderBills();
});

/* ── Quick Add ─────────────────────────────────────────────────────────
   Payer, money-owner and wallet are three separate fields. Picking a wallet
   guesses the other two, but the guess stops as soon as the user edits a
   field by hand — otherwise correcting "who paid" silently reverted. */
let payerTouched = false;
let ownerTouched = false;

let expenseIcon = '';
/* บิลที่กำลังแก้อยู่ · ว่าง = กำลังจดใบใหม่
   ต้องถูกล้างทุกครั้งที่ resetQuickAdd ไม่งั้นเปิดฟอร์มครั้งถัดไปจะไปทับบิลเก่า */
let editingBillId = '';
let expenseReceiptUrl = '';
let expenseReceiptUploading = false;
let splitMode = 'none';

/* Split modes (requirement 7). Equal is derived; manual is entered in the
   bill's currency and must total the bill; percent is entered in % and must
   total 100. Every mode ends up as the same participants[{memberId,amount}]
   shape so the rest of the app never has to know which was used. */
function splitState(amount) {
  const rows = $$('#peopleChecks .people-row')
    .filter(row => $('input[type="checkbox"]', row).checked);
  const read = row => Number($('.share-input', row).value.replace(/[^\d.]/g, '')) || 0;

  if (!rows.length) return { valid:false, problem:'ยังไม่ได้เลือกผู้เกี่ยวข้อง', participants:[], entered:0 };

  if (splitMode === 'equal') {
    const each = amount / rows.length;
    return {
      valid: true, entered: amount, each,
      participants: rows.map(row => ({ memberId: row.dataset.member, amount: each }))
    };
  }

  const entered = rows.reduce((sum, row) => sum + read(row), 0);
  if (splitMode === 'percent') {
    return {
      valid: Math.abs(entered - 100) < 0.5,
      problem: `เปอร์เซ็นต์รวมได้ ${fmtTwoDecimals(entered)}% ต้องเป็น 100.00%`,
      entered,
      participants: rows.map(row => ({ memberId: row.dataset.member, amount: amount * read(row) / 100 }))
    };
  }
  return {
    valid: Math.abs(entered - amount) < 0.5,
    problem: `ยอดที่กำหนดเองรวมได้ ${fmtMoney(entered)} ต้องเท่ากับยอดบิล ${fmtMoney(amount)}`,
    entered,
    participants: rows.map(row => ({ memberId: row.dataset.member, amount: read(row) }))
  };
}

function splitSummary(split, symbol) {
  if (splitMode === 'equal') {
    return `แบ่งเท่ากันคนละ <b>${fmtMoneyUnit(split.each, symbol)}</b> · ${split.participants.length} คน`;
  }
  if (splitMode === 'percent') {
    return split.valid
      ? `รวม <b>100.00%</b> ✓ · ${split.participants.map(p => `${memberName(p.memberId)} ${fmtMoneyUnit(p.amount, symbol)}`).join(' · ')}`
      : `<b>รวม ${fmtTwoDecimals(split.entered)}%</b> — ต้องได้ 100.00%`;
  }
  return split.valid
    ? `รวม <b>${fmtMoneyUnit(split.entered, symbol)}</b> ✓ ตรงกับยอดบิล`
    : `<b>รวม ${fmtMoneyUnit(split.entered, symbol)}</b> — ต้องเท่ากับยอดบิล`;
}

$('#splitMode').addEventListener('click', event => {
  const button = event.target.closest('[data-split]');
  if (!button) return;
  splitMode = button.dataset.split;
  $('#sharedToggle').classList.toggle('on', splitMode !== 'none');
  $$('#splitMode button').forEach(item => item.classList.toggle('active', item === button));
  // Seed manual/percent with the equal split so the user edits from a valid state.
  const rows = $$('#peopleChecks .people-row').filter(row => $('input[type="checkbox"]', row).checked);
  if (rows.length && splitMode !== 'equal') {
    const total = splitMode === 'percent' ? 100 : readAmount();
    const base = Math.round((total / rows.length) * 100) / 100;
    const residual = Math.round((total - base * rows.length) * 100) / 100;
    rows.forEach((row, index) => {
      $('.share-input', row).value = fmtTwoDecimals(base + (index === 0 ? residual : 0));
    });
  }
  refreshQuickAdd();
});

$('#pickExpenseIcon').addEventListener('click', () => openAssetPicker('expense', expenseIcon, src => {
  expenseIcon = src;
  $('#expenseIconPreview').src = src;
  mask.classList.add('open');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
}));

const readAmount = () => Number($('#expenseAmount').value.replace(/[^\d.]/g, '')) || 0;
const currentCurrency = () => walletById($('#walletSelect').value)?.currency || 'JPY';

/* ผังบัญชีจริงจากฐาน — ว่างในโหมดข้อมูลตัวอย่าง
   จัดกลุ่มด้วย <optgroup> ตาม Caption เพราะผังบัญชีอ่านเป็นสองชั้นอยู่แล้ว
   (Caption = กลุ่มหลัก · Category = ประเภทย่อย) */
let ledgerCategories = [];

function ledgerOptions(selected = '') {
  if (!ledgerCategories.length) return '';
  const byCaption = {};
  ledgerCategories.forEach(row => { (byCaption[row.caption_name] ||= []).push(row); });
  const groups = Object.entries(byCaption).map(([caption, rows]) => `
    <optgroup label="${caption}">${rows.map(row =>
      `<option value="${row.category_id}"${row.category_id === selected ? ' selected' : ''}>${row.category_name}</option>`
    ).join('')}</optgroup>`).join('');
  return `<select class="category-ledger"><option value="">— ผูกกับสมุดบัญชี —</option>${groups}</select>`;
}

/* โหมดข้อมูลจริง: เลือกจาก "รายการค่าใช้จ่ายของทริป" ที่ตั้งไว้เอง (มีไอคอน
   และผูกหมวดบัญชีไว้แล้วในตัว) จึงไม่ต้องเลือกหมวดบัญชีซ้ำอีกช่อง
   โหมดตัวอย่าง: ยังใช้รายชื่อหมวดตายตัวเหมือนเดิม เพราะไม่มีข้อมูลจากเซิร์ฟเวอร์ */
function splitRowMarkup(name = 'อาหาร', amount = '', categoryId = '', presetId = '') {
  if (liveMode) {
    const options = tripPresets.map(preset =>
      `<option value="${preset.id}"${preset.id === presetId ? ' selected' : ''}>${preset.label}${preset.categoryName ? ` · ${preset.categoryName}` : ' · ⚠️ ยังไม่ผูกบัญชี'}</option>`).join('');
    return `<div class="split-row">
      <select class="category-preset">${tripPresets.length
        ? options
        : '<option value="">— ยังไม่มีรายการ ไปตั้งที่ "เพิ่มเติม" ก่อน —</option>'}</select>
      <input class="category-amount" inputmode="decimal" value="${amount}" placeholder="0.00">
      <button type="button" class="remove-split" aria-label="ลบหมวดนี้"><svg class="ico-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>`;
  }
  return `<div class="split-row${ledgerCategories.length ? ' with-ledger' : ''}">
    <select class="category-name">${categoryNames.map(item => `<option${item === name ? ' selected' : ''}>${item}</option>`).join('')}</select>
    ${ledgerOptions(categoryId)}
    <input class="category-amount" inputmode="decimal" value="${amount}" placeholder="0.00">
    <button type="button" class="remove-split" aria-label="ลบหมวดนี้"><svg class="ico-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>`;
}

/* แถวหมวดเดียว = ยอดต้องเท่ากับยอดบิลอยู่แล้ว เติมให้เลยไม่ต้องพิมพ์ซ้ำ
   นี่คือขั้นตอนที่เสียเวลาที่สุดของฟอร์มเดิม — พิมพ์เลขเดียวกันสองครั้ง
   แบ่งหลายหมวดเมื่อไหร่ค่อยปล่อยให้กรอกเอง */
function autofillSingleCategory() {
  const rows = $$('#splitRows .split-row');
  if (rows.length !== 1) return;
  const input = $('.category-amount', rows[0]);
  const total = readAmount();
  if (document.activeElement === input) return;   // กำลังพิมพ์อยู่ อย่าไปแทรก
  input.value = total ? fmtTwoDecimals(total) : '';
}

function allocationState() {
  const total = readAmount();
  const allocated = $$('#splitRows .split-row').reduce((sum, row) =>
    sum + (Number($('.category-amount', row).value.replace(/[^\d.]/g, '')) || 0), 0);
  return { total, allocated, balanced: Math.abs(total - allocated) < 0.5 };
}

function refreshQuickAdd() {
  autofillSingleCategory();
  const currency = currentCurrency();
  const symbol = symbolFor(currency);
  const amount = readAmount();
  $('#amountSymbol').textContent = symbol;

  /* Preview at the selected wallet's own average rate — quoting the trip
     constant here would disagree with the figure the bill list then shows. */
  const info = rateInfo(currency, $('#walletSelect').value);
  $('#conversionLine').innerHTML = info.source === 'base'
    ? 'บันทึกเป็นเงินบาทโดยตรง'
    : (info.rate === null
      ? '<span class="unknown-rate">สกุลนี้ยังไม่มีทั้งเรทประมาณการและการเติมเงิน · ตีมูลค่าไม่ได้</span>'
      : `≈ ${fmtMoneyUnit(amount * info.rate, '฿')} · ${info.source === 'planned' ? 'เรทประมาณการ' : 'เรทเฉลี่ยของกระเป๋านี้'} ${info.rate.toFixed(4)} ฿/${symbol} ${rateBadge(info.source)}`);

  const { total, allocated, balanced } = allocationState();
  const remaining = total - allocated;
  $('#allocatedLine').innerHTML = `<span>จัดสรรแล้ว</span><b>${fmtMoneyUnit(allocated, symbol)} / ${fmtMoneyUnit(total, symbol)} ${
    balanced ? '✓' : (remaining > 0 ? `· เหลือ ${fmtMoneyUnit(remaining, symbol)}` : `· เกิน ${fmtMoneyUnit(Math.abs(remaining), symbol)}`)
  }</b>`;
  $('#allocatedLine').classList.toggle('off-balance', !balanced);
  $$('#splitRows .remove-split').forEach(button => {
    button.disabled = $$('#splitRows .split-row').length <= 1;
  });

  const payerId = $('#expensePayer').value;
  const ownerId = $('#expenseOwner').value;
  const wallet = walletById($('#walletSelect').value);
  const notes = [];
  if (payerId !== ownerId) notes.push(`${memberName(payerId)} จ่ายแทน โดยเป็นเงินของ ${memberName(ownerId)}`);
  if (wallet && wallet.ownerId !== payerId) notes.push(`⚠️ กระเป๋านี้เป็นของ ${memberName(wallet.ownerId)} แต่ระบุคนจ่ายเป็น ${memberName(payerId)}`);
  notes.push(isTripOnly(ownerId)
    ? `${memberName(ownerId)} เป็น TRIP ONLY — บิลนี้จะเก็บในประวัติทริป ไม่ลงบัญชีหลัก`
    : `บิลนี้จะลงบัญชีหลักของ ${memberName(ownerId)} ตอนปิดทริป`);
  $('#ownerNote').innerHTML = notes.join('<br>');

  const shared = $('#sharedToggle').classList.contains('on');
  const picked = $$('#peopleChecks input[type="checkbox"]:checked');
  $('#peopleChecks').hidden = !shared;
  $('#peopleChecks').classList.toggle('disabled', !shared);

  // Equal split is computed, so its inputs stay read-only and mirror the maths.
  $$('#peopleChecks .people-row').forEach(row => {
    const checked = $('input[type="checkbox"]', row).checked;
    const input = $('.share-input', row);
    row.classList.toggle('off', !checked);
    input.hidden = splitMode === 'equal';
    input.disabled = !checked;
    const unit = $('.share-unit', row);
    unit.textContent = splitMode === 'percent' ? '%' : symbol;
    unit.hidden = splitMode === 'equal';
  });

  const split = splitState(amount);
  $('#shareResult').innerHTML = !shared
    ? '<b>ไม่หาร</b><span>เจ้าของบิลรับผิดชอบเต็มจำนวน</span>'
    : (!picked.length ? '<b>เลือกผู้เกี่ยวข้องอย่างน้อย 1 คน</b>' : splitSummary(split, symbol));

  const problems = [];
  if (amount <= 0) problems.push('ยังไม่ได้กรอกจำนวนเงิน');
  if (expenseReceiptUploading) problems.push('กำลังอัปโหลดสลิป');
  if (!balanced) problems.push('ยอดรวมของหมวดยังไม่เท่ากับยอดบิล');
  if (shared && !picked.length) problems.push('ยังไม่ได้เลือกผู้เกี่ยวข้อง');
  if (shared && picked.length && !split.valid) problems.push(split.problem);
  /* โหมดข้อมูลจริง: ต้องเลือกรายการค่าใช้จ่ายของทริปให้ครบทุกแถว และรายการนั้น
     ต้องผูกหมวดบัญชีไว้แล้ว ไม่งั้นตอนปิดทริปจะไม่รู้ว่ายอดนี้ลงบัญชีหมวดไหน
     เตือนตั้งแต่ตอนกรอก ไม่ใช่ไปโผล่ตอนปิดทริป ซึ่งคนแก้จะเป็นคนปิด ไม่ใช่คนจด */
  if (liveMode) {
    const rows = $$('#splitRows .split-row');
    if (!tripPresets.length) {
      problems.push('ทริปนี้ยังไม่มีรายการค่าใช้จ่าย — ไปเพิ่มที่หน้า "เพิ่มเติม" ก่อน');
    } else if (rows.some(row => !$('.category-preset', row)?.value)) {
      problems.push('ยังเลือกรายการค่าใช้จ่ายไม่ครบทุกแถว');
    } else if (rows.some(row => !presetById($('.category-preset', row).value)?.categoryId)) {
      problems.push('มีรายการที่ยังไม่ได้ผูกหมวดบัญชี — แก้ที่หน้า "เพิ่มเติม"');
    }
  } else if (ledgerCategories.length && $$('#splitRows .split-row').some(row => !$('.category-ledger', row)?.value)) {
    problems.push('ยังไม่ได้ผูกหมวดกับสมุดบัญชีครบทุกแถว');
  }
  $('#saveWarning').textContent = problems.length ? `บันทึกไม่ได้: ${problems.join(' · ')}` : '';
  $('#saveExpense').disabled = problems.length > 0;
  // บอกยอดบนปุ่มเลย จะได้ไม่ต้องเลื่อนขึ้นไปดูก่อนกด
  $('#saveExpense').textContent = amount > 0
    ? `บันทึก ${fmtMoneyUnit(amount, symbol)}` : 'บันทึกบิล';
}

function resetQuickAdd() {
  payerTouched = false;
  ownerTouched = false;
  $('#walletSelect').innerHTML = wallets.map(wallet =>
    `<option value="${wallet.id}">${wallet.label} · ${memberName(wallet.ownerId)}${isTripOnly(wallet.ownerId) ? ' · TRIP ONLY' : ''}</option>`).join('');
  const defaultWallet = wallets.find(wallet => wallet.ownerId === viewerId) || wallets[0];
  $('#walletSelect').value = defaultWallet.id;

  const memberOptions = members.map(member =>
    `<option value="${member.id}">${member.name}${member.ledgerMode === 'TRIP_ONLY' ? ' · TRIP ONLY' : ''}</option>`).join('');
  $('#expensePayer').innerHTML = memberOptions;
  $('#expenseOwner').innerHTML = memberOptions;
  $('#expensePayer').value = defaultWallet.ownerId;
  $('#expenseOwner').value = defaultWallet.ownerId;

  $('#expenseAmount').value = '';
  $('#expenseDescription').value = '';
  $('#expenseDate').value = new Date().toISOString().slice(0, 10);
  $('#visibility').value = 'trip';
  $('#sharedToggle').classList.remove('on');
  $('#splitRows').innerHTML = splitRowMarkup();
  splitMode = 'none';
  $$('#splitMode button').forEach(button => button.classList.toggle('active', button.dataset.split === 'none'));
  $('#peopleChecks').innerHTML = members.map(member => `
    <div class="people-row" data-member="${member.id}">
      <label><input type="checkbox" value="${member.id}" checked> ${member.name}</label>
      <input class="share-input" inputmode="decimal" placeholder="0" hidden>
      <span class="share-unit" hidden>¥</span>
    </div>`).join('');

  const activities = planDays.flatMap(day => day.activities.map(activity =>
    `<option value="${activity.id}">Day ${day.day} · ${activity.name} ${activity.time}</option>`));
  $('#expenseActivity').innerHTML = `<option value="">ไม่ระบุ</option>${activities.join('')}`;
  expenseIcon = '';
  $('#expenseIconPreview').src = `${ART}cat_food.png`;
  editingBillId = '';
  expenseReceiptUrl = '';
  expenseReceiptUploading = false;
  $('#expenseReceipt').value = '';
  $('#receiptPreview').hidden = true;
  $('#receiptPreviewImage').removeAttribute('src');
  $('#receiptFileName').textContent = '';
  $('#receiptUploadState').textContent = 'พร้อมบันทึก';
  $('#receiptPickLabel').textContent = 'แนบรูป';
  refreshQuickAdd();
}

/* รูปสลิปเป็นหลักฐานของบิล ไม่ใช่ไอคอนตกแต่ง: โหมดข้อมูลจริงอัปโหลดขึ้น
   ที่เก็บไฟล์ก่อน แล้วเก็บ URL ไว้กับ TripExpenses; โหมดตัวอย่างใช้ data URL
   เพื่อให้ผู้ใช้ทดลองหน้าจอได้โดยไม่เขียนข้อมูลขึ้นเซิร์ฟเวอร์ */
$('#expenseReceipt').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    showPrototypeToast('รองรับเฉพาะรูป PNG, JPG และ WEBP');
    event.target.value = '';
    return;
  }
  $('#receiptPreview').hidden = false;
  $('#receiptPreviewImage').src = URL.createObjectURL(file);
  $('#receiptFileName').textContent = file.name || 'รูปสลิป';
  $('#receiptPickLabel').textContent = 'เปลี่ยนรูป';
  expenseReceiptUploading = true;
  $('#receiptUploadState').textContent = liveMode ? 'กำลังอัปโหลด…' : 'พร้อมบันทึก';
  refreshQuickAdd();
  try {
    if (liveMode) {
      expenseReceiptUrl = await TripApi.uploadDocument(file);
    } else {
      expenseReceiptUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    $('#receiptUploadState').textContent = 'แนบแล้ว ✓';
  } catch (error) {
    expenseReceiptUrl = '';
    $('#receiptUploadState').textContent = 'อัปโหลดไม่สำเร็จ';
    showPrototypeToast(error.message || 'อัปโหลดสลิปไม่สำเร็จ');
  } finally {
    expenseReceiptUploading = false;
    refreshQuickAdd();
  }
});

$('#removeReceipt').addEventListener('click', () => {
  expenseReceiptUrl = '';
  expenseReceiptUploading = false;
  $('#expenseReceipt').value = '';
  $('#receiptPreview').hidden = true;
  $('#receiptPreviewImage').removeAttribute('src');
  $('#receiptPickLabel').textContent = 'แนบรูป';
  refreshQuickAdd();
});

$('#walletSelect').addEventListener('change', () => {
  const wallet = walletById($('#walletSelect').value);
  if (wallet && !payerTouched) $('#expensePayer').value = wallet.ownerId;
  if (wallet && !ownerTouched) $('#expenseOwner').value = wallet.ownerId;
  refreshQuickAdd();
});
$('#expensePayer').addEventListener('change', () => { payerTouched = true; refreshQuickAdd(); });
$('#expenseOwner').addEventListener('change', () => { ownerTouched = true; refreshQuickAdd(); });
$('#expenseAmount').addEventListener('input', refreshQuickAdd);
/* ระหว่างพิมพ์ปล่อยเป็นเลขธรรมดาเพื่อให้แก้ง่าย พอออกจากช่องจึงจัดเป็น
   1,234.00 และเมื่อกลับมาแก้อีกครั้งเอา comma ออกให้ cursor ไม่สะดุด */
function bindMoneyInputFormatting(root) {
  root.addEventListener('focusin', event => {
    if (!event.target.matches('#expenseAmount,.category-amount,.share-input')) return;
    event.target.value = event.target.value.replace(/,/g, '');
  });
  root.addEventListener('focusout', event => {
    if (!event.target.matches('#expenseAmount,.category-amount,.share-input')) return;
    const raw = Number(event.target.value.replace(/,/g, ''));
    if (Number.isFinite(raw)) event.target.value = fmtTwoDecimals(raw);
    refreshQuickAdd();
  });
}
bindMoneyInputFormatting(sheet);
$('#visibility').addEventListener('change', refreshQuickAdd);
$('#peopleChecks').addEventListener('change', refreshQuickAdd);
$('#peopleChecks').addEventListener('input', refreshQuickAdd);
$('#addSplitRow').addEventListener('click', () => {
  const { total, allocated } = allocationState();
  $('#splitRows').insertAdjacentHTML('beforeend', splitRowMarkup('อาหาร', Math.max(0, total - allocated) || ''));
  refreshQuickAdd();
});
$('#splitRows').addEventListener('input', refreshQuickAdd);
$('#splitRows').addEventListener('change', refreshQuickAdd);
$('#splitRows').addEventListener('click', event => {
  const remove = event.target.closest('.remove-split');
  if (!remove || $$('#splitRows .split-row').length <= 1) return;
  remove.closest('.split-row').remove();
  refreshQuickAdd();
});

$('#saveExpense').addEventListener('click', async () => {
  if (blockedByClose('expenses')) { closeLayers(); return; }
  const { balanced } = allocationState();
  const amount = readAmount();
  const shared = $('#sharedToggle').classList.contains('on');
  const split = splitState(amount);
  if (!balanced || amount <= 0 || (shared && (!split.participants.length || !split.valid))) return;

  const ownerId = $('#expenseOwner').value;
  /* โหมดข้อมูลจริงเลือกจากรายการของทริป — ชื่อและหมวดบัญชีมาจากรายการนั้น
     ไม่ใช่พิมพ์เอง จึงไม่มีทางที่ชื่อบนบิลกับที่ตั้งไว้จะไม่ตรงกัน */
  const categories = $$('#splitRows .split-row').map(row => {
    const amount = Number($('.category-amount', row).value.replace(/[^\d.]/g, '')) || 0;
    if (liveMode) {
      const preset = presetById($('.category-preset', row)?.value);
      return {
        name: preset?.label || 'อื่น ๆ',
        categoryId: preset?.categoryId || '',
        presetId: preset?.id || '',
        icon: preset?.icon || '',
        amount
      };
    }
    return {
      name: $('.category-name', row).value,
      // ช่องผูกสมุดบัญชีมีเฉพาะโหมดข้อมูลจริง — โหมดตัวอย่างไม่มีผังบัญชีให้เลือก
      categoryId: $('.category-ledger', row)?.value || '',
      amount
    };
  });

  const bill = {
    // กำลังแก้ = ใช้ id เดิม เพื่อให้เซิร์ฟเวอร์อัปเดตแถวเดิมแทนการสร้างใบใหม่
    id: editingBillId || `bill-${Date.now()}`,
    title: $('#expenseDescription').value.trim() || 'ค่าใช้จ่ายใหม่',
    amount,
    currency: currentCurrency(),
    payerId: $('#expensePayer').value,
    ownerId,
    walletId: $('#walletSelect').value,
    date: $('#expenseDate').value || new Date().toISOString().slice(0, 10),
    categories,
    visibility: $('#visibility').value,
    shared,
    splitMode: shared ? splitMode : 'equal',
    participants: shared ? split.participants : [{ memberId: ownerId, amount }],
    activityId: $('#expenseActivity').value,
    image: expenseIcon || '',
    receiptUrl: expenseReceiptUrl || ''
  };

  const routing = isTripOnly(ownerId) ? 'เฉพาะทริป' : 'ลงบัญชีหลัก';
  const label = fmtMoneyUnit(amount, symbolFor(bill.currency));

  if (!liveMode) {
    if (editingBillId) bills = bills.map(row => (row.id === editingBillId ? bill : row));
    else bills.unshift(bill);
    const wasEditing = Boolean(editingBillId);
    closeLayers();
    renderBills();
    showScreen('bills');
    showPrototypeToast(`${wasEditing ? 'แก้ไข' : 'บันทึก'} ${label} แล้ว · ${routing}`);
    return;
  }

  /* โหมดข้อมูลจริง: ส่งขึ้นเซิร์ฟเวอร์ก่อน แล้วค่อยดึงมาแสดงใหม่ทั้งชุด
     ไม่ใส่ลงในอาร์เรย์ฝั่งหน้าจอเองเลย เพราะเซิร์ฟเวอร์เป็นคนปัดเศษและ
     เกลี่ยเศษให้ admin ถ้าหน้าจอเดาเองจะได้ตัวเลขคนละชุดกับที่บันทึกจริง */
  const button = $('#saveExpense');
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'กำลังบันทึก…';
  let serverError = '';
  try {
    const result = await TripApi.saveExpense(bill);
    await refreshFromServer();
    closeLayers();
    showScreen('bills');
    const residual = result.residual
      ? ` · เศษ ${fmtAmount(Math.abs(result.residual), symbolFor(bill.currency))} ไปที่ ${memberName(result.residual_member_id)}`
      : '';
    showPrototypeToast(`บันทึกลงฐานจริงแล้ว ${label} · ${routing}${residual}`);
  } catch (error) {
    // ค้างฟอร์มไว้พร้อมข้อความจากเซิร์ฟเวอร์ ไม่ปิดทิ้ง คนกรอกจะได้แก้ต่อได้เลย
    serverError = error.message;
  } finally {
    button.textContent = previous;
    // ⚠️ ต้องเขียนข้อความ *หลัง* refreshQuickAdd() เพราะฟังก์ชันนั้นเขียนทับ
    //    #saveWarning ด้วยผลตรวจของฝั่งหน้าจอ ถ้าสลับลำดับ เหตุผลจากเซิร์ฟเวอร์
    //    จะถูกลบทิ้งทันทีจนคนใช้ไม่เห็นว่าทำไมบันทึกไม่ผ่าน
    refreshQuickAdd();
    if (serverError) $('#saveWarning').textContent = `บันทึกไม่สำเร็จ: ${serverError}`;
  }
});

/* ── Presence ──────────────────────────────────────────────────────────
   Deliberately NOT background tracking: a member's position is only shared
   while their app is open, and each check-in goes stale on its own. That's
   why every record carries a timestamp rather than a live coordinate — if
   nothing refreshes it, the UI degrades to "ข้อมูลเก่า" and then to nothing,
   instead of implying someone is still being followed. */
const PRESENCE_FRESH_MINUTES = 15;
const minutesAgo = minutes => Date.now() - minutes * 60000;

let presence = {
  north: { sharing:true,  at:minutesAgo(2),  place:'Akanko Ainu Kotan', status:'arrived', stopIndex:1 },
  nimz:  { sharing:true,  at:minutesAgo(11), place:'ระหว่างทางไป Ainu Kotan', status:'moving', stopIndex:0 },
  ann:   { sharing:false, at:null, place:'', status:'off', stopIndex:null },
  mew:   { sharing:true,  at:minutesAgo(48), place:'ที่พัก Lake Akan', status:'arrived', stopIndex:1 }
};

/* Only members who are actively sharing get a marker, and a stale one fades
   rather than disappearing — vanishing would read as "they left", which the
   data cannot actually say. Several people at one stop fan out around the pin
   instead of stacking into an unreadable blob. */
function renderPresenceMap() {
  const layer = $('#presenceLayer');
  if (!layer) return;
  const pins = $$('.journey-pin');
  const faces = { north:'#f6bfd0', nimz:'#c8e5ed', ann:'#f0dfbf', mew:'#c4e3cd' };
  const byStop = {};

  const markers = members.map(member => {
    const row = presence[member.id];
    if (!row?.at) return '';
    const activityDay = row.stopId && planDays.find(day => day.activities?.some(act => act.id === row.stopId));
    const resolvedStopIndex = row.stopIndex ?? journeyStops.findIndex(item => item.dayId === activityDay?.id);
    if (resolvedStopIndex < 0) return '';
    const pin = pins[resolvedStopIndex];
    if (!pin) return '';
    const seat = (byStop[resolvedStopIndex] = (byStop[resolvedStopIndex] || 0) + 1) - 1;
    const angle = (-125 + seat * 46) * Math.PI / 180;
    const x = Number(pin.dataset.x) + Math.cos(angle) * 54;
    const y = Number(pin.dataset.y) + Math.sin(angle) * 54;
    const stale = (Date.now() - row.at) / 60000 > PRESENCE_FRESH_MINUTES;
    return `
      <g class="presence-mark ${stale ? 'stale' : 'live'}${member.id === viewerId ? ' me' : ''}" transform="translate(${x} ${y})">
        <circle r="21" fill="${faces[member.id] || '#f6bfd0'}"/>
        <text y="8">${member.name[0]}</text>
        ${stale ? '' : '<circle class="ping" r="21" fill="none"/>'}
        <title>${member.name} · ${presenceLabel(member.id).text}</title>
      </g>`;
  }).join('');
  layer.innerHTML = markers;
}

function presenceLabel(memberId) {
  const row = presence[memberId];
  if (!row) return { text:'ยังไม่เช็กอิน', cls:'off' };
  if (!row.at) return { text:row.sharing ? 'เปิดแชร์แล้ว · ยังไม่เช็กอิน' : 'ยังไม่เช็กอิน', cls:row.sharing ? 'idle' : 'off' };
  const mins = Math.round((Date.now() - row.at) / 60000);
  if (mins > PRESENCE_FRESH_MINUTES) {
    return { text:`เช็กอินที่ ${row.place} · ${mins} นาทีที่แล้ว`, cls:'stale' };
  }
  const when = mins < 1 ? 'เมื่อสักครู่' : `${mins} นาทีที่แล้ว`;
  return { text:`${row.status === 'arrived' ? 'ถึง' : 'กำลังไป'} ${row.place} · ${when}`, cls:'live' };
}

function renderPresence() {
  const faces = { north:'pink', nimz:'blue', ann:'cream', mew:'sage' };
  const me = presence[viewerId] || {};
  $('#memberPresence').innerHTML = members.map(member => {
    const label = presenceLabel(member.id);
    const isMe = member.id === viewerId;
    return `<span class="presence-chip ${label.cls}${isMe ? ' me' : ''}" aria-label="${member.name} ${label.text}">
      ${memberAvatar(member)}
      <b>${member.name}${isMe ? ' (คุณ)' : ''}</b><small>${label.text}</small></span>`;
  }).join('');

  $('#shareLocation').classList.toggle('sharing', Boolean(me.sharing));
  $('#shareLocation').title = me.sharing ? 'กำลังแชร์ตำแหน่ง · กดเพื่อหยุด' : 'ไม่ได้แชร์ตำแหน่ง · กดเพื่อเริ่ม';
  $('#presenceConsent').innerHTML = me.sharing
    ? `📍 <b>${memberName(viewerId)} กำลังแชร์ตำแหน่ง</b> — เฉพาะขณะเปิดแอปเท่านั้น ไม่มีการติดตามเบื้องหลัง · ข้อมูลจะถือว่าเก่าหลัง ${PRESENCE_FRESH_MINUTES} นาที`
    : `📍 คุณยังไม่ได้แชร์ตำแหน่ง — สมาชิกคนอื่นจะไม่เห็นว่าคุณอยู่ที่ไหน`;

  renderPresenceMap();

  const checkIn = $('#checkIn');
  const mine = presence[viewerId];
  const fresh = mine?.at && (Date.now() - mine.at) / 60000 <= PRESENCE_FRESH_MINUTES;
  checkIn.textContent = fresh ? '✓ เช็กอินแล้ว · เช็กอินอีกครั้ง' : '✓ เช็กอิน';
  checkIn.disabled = !viewerId || !checkIn.dataset.stop;
  checkIn.title = checkIn.disabled ? 'ยังไม่มีกิจกรรมสำหรับเช็กอิน' : 'เช็กอินได้โดยไม่ต้องเปิดแชร์ตำแหน่ง';
}

$('#shareLocation').addEventListener('click', () => {
  const me = presence[viewerId] || (presence[viewerId] = { sharing:false, at:null, place:'', status:'off' });
  me.sharing = !me.sharing;
  if (!me.sharing) { me.at = null; me.status = 'off'; me.place = ''; me.stopIndex = null; }
  renderPresence();
  saveState();
  showPrototypeToast(me.sharing
    ? 'เริ่มแชร์ตำแหน่ง — เฉพาะขณะเปิดแอป'
    : 'หยุดแชร์ตำแหน่งแล้ว · ตำแหน่งเดิมถูกลบออกจากมุมมองของคนอื่น');
});

const optionalPosition = () => new Promise(resolve => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    pos => resolve({ latitude:pos.coords.latitude, longitude:pos.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy:true, timeout:7000, maximumAge:60000 }
  );
});

$('#checkIn').addEventListener('click', async () => {
  const stopId = $('#checkIn').dataset.stop;
  const activity = planDays.flatMap(day => day.activities || []).find(item => item.id === stopId);
  if (!stopId || !activity) return showPrototypeToast('ยังไม่มีกิจกรรมสำหรับเช็กอิน');

  const button = $('#checkIn');
  button.disabled = true;
  button.textContent = 'กำลังเช็กอิน…';
  let coords = null;
  try {
    coords = await optionalPosition();
    if (liveMode) {
      await TripApi.checkIn({ stopId, ...(coords || {}) });
      await refreshFromServer();
    } else {
      const me = presence[viewerId] || (presence[viewerId] = {});
      Object.assign(me, { at:Date.now(), status:'arrived', place:activity.name, stopId,
        lat:coords?.latitude ?? null, lon:coords?.longitude ?? null });
      renderPresence();
      saveState();
    }
    showPrototypeToast(`เช็กอินที่ ${activity.name} แล้ว · สมาชิกในทริปจะเห็น`);
  } catch (error) {
    if (coords && /อยู่ห่างจากจุดแวะ/.test(error.message)
        && window.confirm(`${error.message}\n\nต้องการเช็กอินโดยไม่ส่งตำแหน่งหรือไม่?`)) {
      try {
        await TripApi.checkIn({ stopId });
        await refreshFromServer();
        showPrototypeToast(`เช็กอินที่ ${activity.name} แล้วโดยไม่ส่งตำแหน่ง`);
        return;
      } catch (retryError) {
        showPrototypeToast(`เช็กอินไม่สำเร็จ: ${retryError.message}`);
      }
    } else {
      showPrototypeToast(`เช็กอินไม่สำเร็จ: ${error.message}`);
    }
    renderPresence();
  }
});


/* ── Trip lock ─────────────────────────────────────────────────────────
   A closed trip's money is history: its totals have already been reported as
   the amounts posted to the family ledger. Adding a bill afterwards would
   silently make the two disagree, so every money-changing entry point is shut
   — but the itinerary, banner and icons stay editable, since they don't move
   a single number. Buttons are greyed *and* the handlers re-check, so the
   rule holds even if a disabled attribute is bypassed. */
const TRIP_LOCK_REASON = 'ทริปนี้ปิดแล้ว · แก้ตัวเลขการเงินไม่ได้ เพื่อให้ตรงกับยอดที่สรุปเข้าบัญชี';
/* โหมดข้อมูลจริงล็อกด้วยเหตุผลคนละอย่างกับทริปที่ปิดแล้ว จึงต้องแยกข้อความ
   ไม่งั้นคนใช้จะเห็น "ทริปนี้ปิดแล้ว" ทั้งที่ทริปยังเปิดอยู่ */
const LIVE_LOCK_REASON = 'โหมดข้อมูลจริง · อ่านอย่างเดียว ยังแก้จากหน้านี้ไม่ได้';

/* เปิดการเขียนกลับทีละส่วน ไม่ใช่เปิดทีเดียวทั้งหน้า
   ส่วนที่ยังไม่เปิดจะถูกล็อกเหมือนเดิม จะได้ไม่มีปุ่มที่กดแล้วดูเหมือนสำเร็จ
   แต่ไม่ได้บันทึกลงฐานจริง */
// plan ยังไม่มี API ฝั่งเขียน จึงยังล็อกไว้ — ที่เหลือเขียนลงฐานจริงได้หมดแล้ว
// ทุกส่วนเขียนลงฐานจริงได้แล้ว · plan ไม่ผูกกับการปิดทริป (ดู financeLocked)
const LIVE_WRITABLE = { expenses: true, wallets: true, currencies: true, fundings: true, closing: true, plan: true };

/* ผู้ร่วมทริป (เข้าด้วยรหัสจากลิงก์ ไม่ใช่ล็อกอินบัญชีครอบครัว) ทำได้แค่
   "จดค่าใช้จ่ายของตัวเอง" กับ "เช็กอิน" — ตรงกับ GUEST_WRITABLE ฝั่งเซิร์ฟเวอร์
   🔴 สองฝั่งต้องตรงกันเสมอ ถ้าหน้าจอเปิดกว้างกว่า คนจะกรอกฟอร์มจนเสร็จ
      แล้วไปเจอ 403 ตอนกดบันทึก ซึ่งเสียเวลาและอ่านเหมือนแอปพัง
      (เกิดจริง 3 ก.ย.: North เป็นผู้ดูแลทริป แต่เปิดจากลิงก์+รหัส จึงถูกนับเป็น
       ผู้ร่วมทริป · กดเพิ่มจุดท่องเที่ยว ฟอร์มเปิดปกติ กรอกเสร็จแล้วขึ้นว่า
       "ผู้ร่วมทริปทำรายการนี้ไม่ได้") */
const GUEST_WRITABLE = { expenses: true };
const GUEST_LOCK_REASON = 'คุณเข้าใช้ในฐานะผู้ร่วมทริป · จดค่าใช้จ่ายของตัวเองได้เท่านั้น'
  + ' — ถ้าคุณเป็นผู้ดูแล ให้กดออกจากระบบผู้ร่วมทริปแล้วล็อกอินด้วยบัญชีครอบครัว';

const lockReason = (area) => {
  if (liveMode && liveIsGuest && !GUEST_WRITABLE[area]) return GUEST_LOCK_REASON;
  if (tripClosed) return TRIP_LOCK_REASON;
  return liveMode ? LIVE_LOCK_REASON : TRIP_LOCK_REASON;
};

/* area = ส่วนที่กำลังจะแก้ · **ต้องเป็นชื่อที่มีอยู่ใน LIVE_WRITABLE เท่านั้น**

   🔴 เคยพังมาแล้วสองรอบด้วยสาเหตุเดียวกัน — ชื่อพื้นที่ที่ระบบไม่รู้จัก
      (พิมพ์ผิด เช่น 'bills' ที่จริงคือ 'expenses' · หรือ **ลืมใส่ไปเลย**)
      ทำให้ `LIVE_WRITABLE[area]` เป็น undefined → `!undefined` = true
      → ล็อกทุกอย่างเสมอในโหมดข้อมูลจริง **โดยไม่มี error ให้เห็นสักตัว**

      รอบล่าสุด (3 ก.ย.): `applyTripLock()` เรียก `financeLocked()` เปล่า ๆ
      เพื่อถามว่า "ทริปปิดหรือยัง" แต่ได้ true ตลอดในโหมดข้อมูลจริง
      → body ติดคลาส trip-closed ค้าง → CSS ดับปุ่ม ＋ ลอยบนมือถือทั้งแอป

   ตอนนี้แยกให้ชัด: ไม่ส่ง area = ถามว่า "ทริปปิดหรือยัง" เท่านั้น
   และชื่อที่ไม่รู้จักจะ **ร้องออกทาง console** แทนที่จะเงียบแล้วล็อกทิ้ง */
const financeLocked = (area) => {
  if (area === undefined) return tripClosed;
  if (!Object.prototype.hasOwnProperty.call(LIVE_WRITABLE, area)) {
    console.error(`financeLocked: ไม่รู้จักพื้นที่ "${area}" — ต้องเป็นชื่อใน LIVE_WRITABLE`);
    return tripClosed;
  }
  /* แผนเที่ยวเป็นข้อยกเว้นเดียวที่ไม่ถูกล็อกตอนปิดทริป — การปิดทริปล็อกตัวเลข
     ที่รายงานเข้าบัญชีไปแล้ว ไม่ควรห้ามแก้บันทึกการเดินทางย้อนหลัง
     (ฝั่งเซิร์ฟเวอร์ก็ปล่อยผ่าน /stops เหมือนกัน สองฝั่งจึงตรงกัน) */
  if (area !== 'plan' && tripClosed) return true;
  if (!liveMode) return false;
  if (liveIsGuest && !GUEST_WRITABLE[area]) return true;
  return !LIVE_WRITABLE[area];
};

function blockedByClose(area) {
  if (!financeLocked(area)) return false;
  showPrototypeToast(lockReason(area));
  return true;
}

/* ── บอกให้ชัดว่ากำลังเข้าใช้ในฐานะ "ผู้ร่วมทริป" (2026-09-03) ──────────
   🔴 เซิร์ฟเวอร์ส่ง is_guest มาตั้งแต่แรกและแอปก็เก็บใส่ liveIsGuest แล้ว
      **แต่ไม่มีใครอ่านมันเลยสักบรรทัด** — ค่าที่ส่งมาแล้วไม่มีใครใช้
      ผลคือผู้ดูแลที่เผลอเข้าทางลิงก์+รหัส จะเห็นแต่ปุ่มที่กดแล้วไม่เกิดอะไร
      โดยไม่มีที่ไหนบนจอบอกว่าทำไม (เกิดกับ North จริง 3 ก.ย.)

   ⚠️ ต้องมีทางออกด้วย ไม่ใช่แค่บอกว่าเข้าไม่ได้ — signOutMember() เขียนไว้
      ใน api.js นานแล้วแต่ไม่มีปุ่มไหนเรียกเลย เข้าไปแล้วออกไม่ได้ */
function renderGuestNote() {
  const note = $('#guestNote');
  if (!note) return;
  const on = liveMode && liveIsGuest;
  note.hidden = !on;
  if (!on) return;
  const who = memberName(viewerId) || 'ผู้ร่วมทริป';
  $('#guestNoteText').textContent =
    `👤 คุณเข้าใช้ในฐานะผู้ร่วมทริป (${who}) · จดค่าใช้จ่ายของตัวเองและเช็กอินได้เท่านั้น`
    + ' — เพิ่มสถานที่ แก้แผน หรือจัดการสมาชิกไม่ได้ แม้จะเป็นผู้ดูแลทริปก็ตาม';
}

$('#guestSignOut')?.addEventListener('click', () => {
  if (!window.confirm('ออกจากระบบผู้ร่วมทริป?\n\nหลังจากนี้ให้ล็อกอินด้วยบัญชีครอบครัว'
    + ' เพื่อใช้สิทธิ์ผู้ดูแลตามปกติ')) return;
  TripApi.signOutMember();
  /* โหลดหน้าเดิมซ้ำ ไม่ใช่เด้งไปหน้าอื่น — พอไม่มี token ผู้ร่วมทริปแล้ว
     แอปจะเลือกตัวตนใหม่เอง (บัญชีครอบครัวถ้ามี · ไม่มีก็เด้งไปหน้าใส่รหัส) */
  location.reload();
});

function applyTripLock() {
  // ปุ่มแต่ละตัวผูกกับส่วนของตัวเอง ไม่ใช่สถานะรวมของทั้งหน้า
  // ไม่งั้นพอเปิดการเขียนทีละส่วน ปุ่มจะยังถูกล็อกทั้งแถบทั้งที่ API พร้อมแล้ว
  const byArea = [
    [$$('.add-expense'), 'expenses'],
    [[$('#addWallet')], 'wallets'],
    [[$('#addCurrency')], 'currencies'],
    /* ปุ่มเพิ่มสถานที่มีสองที่ (หัวรายการ + ท้ายรายการ) ต้องล็อกพร้อมกัน
       ไม่งั้นตัวที่หลุดจะพาไปกรอกฟอร์มที่บันทึกไม่ได้ */
    [[$('#addPlace'), $('#addPlaceFoot')], 'plan']
  ];
  byArea.forEach(([buttons, area]) => {
    const off = financeLocked(area);
    [...buttons].filter(Boolean).forEach(button => {
      button.disabled = off;
      button.title = off ? lockReason(area) : '';
    });
  });
  renderGuestNote();
  const locked = financeLocked();
  $$('.trip-locked-note').forEach(note => {
    /* โชว์เฉพาะตอนทริปปิดจริง ๆ เท่านั้น (2026-08-10)
       เดิมโชว์ป้าย "โหมดข้อมูลจริง" ค้างไว้ทุกหน้าแม้ทริปยังเปิดปกติ ซึ่งเป็น
       ข่าวดีที่ไม่ต้องบอกซ้ำ และกินพื้นที่จอมือถือทุกหน้า — ป้ายควรบอกเฉพาะ
       เรื่องที่ทำให้ผู้ใช้ "ทำอะไรไม่ได้" ไม่ใช่รายงานสถานะปกติ */
    note.hidden = !tripClosed;
    note.innerHTML = liveMode
      ? '🔒 <b>ทริปนี้ปิดแล้ว</b> — ยอดเข้าบัญชีไปแล้ว ต้องเปิดทริปกลับก่อนถึงจะแก้ได้'
      : '🔒 <b>ทริปนี้ปิดแล้ว</b> — ตัวเลขการเงินถูกล็อก แต่แผนเที่ยวและรูปยังแก้ได้';
  });
  document.body.classList.toggle('trip-closed', locked);
}

/* ── Close trip ────────────────────────────────────────────────────────
   Who owes what comes from participants[], not from who paid — the payer
   only fronted the money. Each member's share is then routed by their
   ledgerMode: MAIN posts to the family ledger, TRIP_ONLY stays in the trip's
   own history and never touches the main books. */
function computeCloseSummary() {
  const perMember = new Map();
  const problems = [];
  let totalThb = 0;

  bills.forEach(bill => {
    const info = rateInfo(bill.currency, bill.walletId);
    if (info.rate === null) {
      problems.push(`"${bill.title}" ยังตีมูลค่าเป็นบาทไม่ได้ — ตั้งเรทประมาณการหรือบันทึกเติมเงินก่อน`);
      return;
    }
    const shares = bill.participants || [];
    const shareSum = shares.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(shareSum - bill.amount) > 0.5) {
      problems.push(`"${bill.title}" ยอดที่แบ่งรวม ${fmtAmount(shareSum, symbolFor(bill.currency))} ไม่ตรงกับยอดบิล ${fmtAmount(bill.amount, symbolFor(bill.currency))}`);
    }
    totalThb += bill.amount * info.rate;
    shares.forEach(share => {
      const row = perMember.get(share.memberId) || { thb:0, bills:0 };
      row.thb += share.amount * info.rate;
      row.bills += 1;
      perMember.set(share.memberId, row);
    });
  });

  const rows = [...perMember.entries()].map(([memberId, row]) => ({
    memberId, name: memberName(memberId), ...row,
    tripOnly: isTripOnly(memberId)
  })).sort((a, b) => b.thb - a.thb);

  const toLedger = rows.filter(row => !row.tripOnly);
  const tripOnly = rows.filter(row => row.tripOnly);
  const sum = list => list.reduce((total, row) => total + row.thb, 0);

  /* Leftover cash splits two ways. Returned money goes back to the source
     account. Carried money stays as foreign currency for the next trip — and
     must keep the baht cost it was bought at, otherwise the next trip would
     revalue it at a new rate and invent a gain or loss that never happened. */
  const leftovers = wallets.map(wallet => {
    const s = walletSummary(wallet);
    const info = rateInfo(wallet.currency, wallet.id);
    return {
      wallet, foreign: s.leftover,
      thb: info.rate === null ? null : s.leftover * info.rate,
      rate: info.rate,
      carry: Boolean(wallet.excludeOnClose)
    };
  }).filter(row => Math.abs(row.foreign) > 0.5);

  const returned = leftovers.filter(row => !row.carry);
  const carried = leftovers.filter(row => row.carry);

  leftovers.filter(row => row.foreign < 0).forEach(row => {
    problems.push(`กระเป๋า "${row.wallet.label}" ใช้เกินยอดที่บันทึกเติมไว้ ${fmtAmount(Math.abs(row.foreign), symbolFor(row.wallet.currency))}`);
  });

  const allocated = sum(rows);
  const balanced = Math.abs(allocated - totalThb) < 1 && !problems.length;
  const carriedThb = carried.reduce((total, row) => total + (row.thb || 0), 0);
  return { rows, toLedger, tripOnly, totalThb, allocated, leftovers, returned, carried, carriedThb,
           problems, balanced, ledgerTotal: sum(toLedger), tripOnlyTotal: sum(tripOnly) };
}

const isAdmin = memberId => Boolean(memberById(memberId)?.admin);
/* ฐานข้อมูลและ input[type=date] ใช้ปี ค.ศ. แบบ ISO (YYYY-MM-DD) เสมอ
   ใช้ en-GB ตอนแสดงผลเพื่อไม่ให้ Intl แปลง 2026 เป็น พ.ศ. 2569 แล้วดูเหมือนข้อมูลคนละปี */
/* วันที่แบบสั้นสำหรับชิปบนการ์ด — '18 ธ.ค.' ไม่ต้องมีปี
   ทริปเดียวไม่ข้ามปี การใส่ปีจึงเปลืองที่โดยไม่เพิ่มข้อมูล */
const thaiDateShort = iso => {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? (iso || '—')
    : `${date.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][date.getMonth()]}`;
};

/* 🔴 ต้องกัน Invalid Date เหมือน billDateLabel กับ thaiDateShort ที่กันไว้แล้ว
   toLocaleDateString ของ Invalid Date ไม่ throw แต่คืนคำว่า "Invalid Date"
   ซึ่งไปโผล่บนจอตรง ๆ · เกิดได้เมื่อค่าที่ส่งมาไม่ใช่ ISO เช่นวันที่ภาษาไทย
   ของข้อมูลตัวอย่าง ('8 ก.พ. 2027') */
const thaiDate = iso => {
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(iso)
    : date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
};

/* วันจบทริปที่ใช้ได้จริง — โหมดข้อมูลจริงต้องอ่านจาก Projects.end_date
   TRIP_END_DATE เป็นค่าสมมติของข้อมูลตัวอย่างเท่านั้น ถ้าปนกันจะเตือนผิดวัน */
const tripEndISO = () => (liveMode ? liveTripEndDate : TRIP_END_DATE);

function renderCloseLines() {
  const s = computeCloseSummary();
  $('#closeLines').innerHTML = `
    <span>ค่าใช้จ่ายรวม<b>${fmtAmount(s.totalThb, '฿')}</b></span>
    <span>ลงบัญชีหลัก<b>${fmtAmount(s.ledgerTotal, '฿')}</b></span>
    <span>เฉพาะทริป<b>${fmtAmount(s.tripOnlyTotal, '฿')}</b></span>`;
  $('#closePreview').textContent = tripClosed ? 'ทริปนี้ปิดแล้ว' : 'ดูพรีวิวปิดทริป';
  $('#closePreview').disabled = tripClosed;

  /* Reopening rewrites settled figures, so it stays with the trip admin. */
  const reopen = $('#reopenTrip');
  reopen.hidden = !tripClosed;
  reopen.disabled = !isAdmin(viewerId);
  reopen.title = isAdmin(viewerId) ? '' : `เฉพาะผู้ดูแลทริปเท่านั้น · ${memberName(viewerId)} ไม่มีสิทธิ์`;

  /* The log doubles as the ledger's posting history: every entry carries a
     signed effect and the running net is what the family books should show. */
  const net = tripLog.reduce((sum, entry) => sum + (entry.ledgerTotal || 0), 0);
  const netTripOnly = tripLog.reduce((sum, entry) => sum + (entry.tripOnlyTotal || 0), 0);
  $('#tripLog').innerHTML = tripLog.length ? `
    <h4 class="log-title">ประวัติการลงบัญชี</h4>
    <ol class="trip-log">${[...tripLog].reverse().map(entry => `
      <li class="${entry.type}">
        <b>${entry.type === 'close' ? 'ปิดทริป · ลงบัญชี' : 'เปิดกลับ · กลับรายการเดิม'}</b>
        <small>${entry.at} · โดย ${entry.by} · ลงวันที่ ${thaiDate(entry.postingDate)}</small>
        <small class="log-amounts ${(entry.ledgerTotal || 0) < 0 ? 'negative' : ''}">บัญชีหลัก ${fmtAmount(entry.ledgerTotal || 0, '฿')} · เฉพาะทริป ${fmtAmount(entry.tripOnlyTotal || 0, '฿')}</small>
        ${entry.fxResult ? `<small class="log-fx ${entry.fxResult < 0 ? 'loss' : 'gain'}">${entry.fxResult > 0 ? 'กำไร' : 'ขาดทุน'}อัตราแลกเปลี่ยน ${fmtAmount(Math.abs(entry.fxResult), '฿')}</small>` : ''}
        ${entry.carriedThb ? `<small class="log-carry">ยกยอดไปทริปหน้า ${entry.carried.map(row => `${row.label} ${fmtAmount(row.foreign, symbolFor(row.currency))}${row.swapped ? ` (แลกจาก ${row.fromCurrency})` : ''}`).join(' · ')} (ต้นทุน ${fmtAmount(entry.carriedThb, '฿')})</small>` : ''}
        ${entry.reason ? `<small>เหตุผล: ${entry.reason}</small>` : ''}
      </li>`).join('')}</ol>
    <div class="log-net"><span>ยอดสุทธิที่อยู่ในบัญชีจริง</span>
      <b>บัญชีหลัก ${fmtAmount(net, '฿')} · เฉพาะทริป ${fmtAmount(netTripOnly, '฿')}</b>
      <small>ผลรวมของทุกรายการข้างบน — ไม่ใช่ยอดของครั้งล่าสุดเพียงอย่างเดียว</small></div>` : '';
}

/* The date money hits the ledger is not the date the trip ended — a trip that
   finishes 19 Feb may only be settled in March, and posting it to the wrong
   month puts the cost in the wrong period. Default to the trip's end date and
   flag it loudly when the chosen date lands in another month or year. */
function updatePostingNote() {
  const chosen = $('#postingDate').value;
  const note = $('#postingNote');
  if (!chosen) { note.textContent = ''; note.className = 'field-note'; return; }
  const end = new Date(`${tripEndISO()}T00:00:00`);
  const post = new Date(`${chosen}T00:00:00`);
  const sameMonth = end.getFullYear() === post.getFullYear() && end.getMonth() === post.getMonth();
  const days = Math.round((post - end) / 86400000);

  if (post < end) {
    note.className = 'field-note posting-warn';
    note.textContent = `⚠️ วันลงบัญชีอยู่ก่อนวันจบทริป (${thaiDate(tripEndISO())}) — ตรวจอีกครั้งว่าตั้งใจ`;
  } else if (!sameMonth) {
    note.className = 'field-note posting-warn';
    note.innerHTML = `⚠️ ทริปจบ ${thaiDate(tripEndISO())} แต่ลงบัญชี ${thaiDate(chosen)} — <b>คนละ${end.getFullYear() !== post.getFullYear() ? 'ปี' : 'เดือน'}บัญชี</b> ค่าใช้จ่ายก้อนนี้จะไปอยู่ในงวด ${post.toLocaleDateString('en-GB', { month:'long', year:'numeric' })}`;
  } else {
    note.className = 'field-note';
    note.textContent = `ทริปจบ ${thaiDate(tripEndISO())} · ลงบัญชีห่างไป ${days} วัน อยู่ในงวดเดียวกัน`;
  }
}
$('#postingDate').addEventListener('change', updatePostingNote);
$('#postingDate').addEventListener('input', updatePostingNote);

/* ── Settling leftover cash ────────────────────────────────────────────
   Book cost and what you actually get back are never the same. Cashing
   ¥10,000 that cost ฿2,320 might return ฿2,250 — that ฿70 is a realised FX
   loss belonging to this trip, not a rounding error to bury. Carrying the
   money instead touches no baht at all, so its cost simply travels with it
   and nothing is realised.

   🔴 ค่าเริ่มต้นคือ "ปล่อยไว้" (North 2026-08-23 รอบสอง)
      North: "เงินที่เหลือในทริป ก็ไม่ต้องทำอะไร ปล่อยเป็นยอดไว้"
      ญี่ปุ่นไปบ่อย เยนที่เหลือค้างไว้ใช้ทริปหน้าได้เลย · การแลกคืนเป็นการ
      ตัดสินใจ **หลังจบทริป** ไม่ใช่เงื่อนไขที่ต้องตอบก่อนจึงจะปิดทริปได้

      และมันถูกต้องด้วยตัวมันเอง: ตอนปิดทริปเราตัดออกจากบัญชีเฉพาะยอดที่ใช้จริง
      เงินที่เหลือจึงยังค้างเป็นยอดคงเหลือของบัญชี "เงินรอเที่ยว" อยู่แล้ว */
let settlementPlan = {};

function resetSettlementPlan() {
  settlementPlan = {};
  computeCloseSummary().leftovers.forEach(row => {
    settlementPlan[row.wallet.id] = {
      mode: row.wallet.excludeOnClose ? 'carry' : 'keep',
      receivedThb: row.thb === null ? '' : String(Math.round(row.thb)),
      carryCurrency: row.wallet.currency,
      carryAmount: String(Math.round(row.foreign))
    };
  });
}

/* ── บัตรเครดิต: ยอดบาทจริง "ทีละบิล" (North 2026-08-23) ─────────────
   🔴 ธนาคารแปลงค่าเงินทีละรายการตามวันที่รูดจริง ไม่ใช่เรทเดียวทั้งบิล
      ถ้ากรอกยอดรวมต่อบัตรแล้วเฉลี่ยเรทให้ทุกบิล ยอดรวมจะถูกก็จริง
      แต่ยอดราย "หมวด" กับราย "คน" จะเพี้ยน — ค่าอาหารที่รูดวันเรทแย่
      กับค่าโรงแรมที่รูดวันเรทดีจะถูกปรับให้เท่ากัน ซึ่งไม่ตรงกับความจริงทั้งคู่

   ⚠️ ไม่คิดเป็นกำไร/ขาดทุนอัตราแลกเปลี่ยน เพราะไม่เคยถือเงินสกุลนั้น */
const creditSettlement = {};

const creditBills = () => bills
  .filter(bill => walletById(bill.walletId)?.kind === 'CREDIT')
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

function renderCreditSettlement() {
  const box = $('#creditSettlement');
  if (!box) return;
  const list = creditBills();
  box.hidden = !list.length;
  if (!list.length) { box.innerHTML = ''; return; }

  /* เติมค่าที่เคยกรอกไว้จากฐานข้อมูลก่อนวาด — ไม่ทับของที่กำลังพิมพ์อยู่ตอนนี้
     🔴 ถ้าไม่ทำ เปิดทริปกลับมาแก้ทีไรช่องจะว่างทุกครั้ง ทั้งที่ตัวเลขอยู่ในฐานแล้ว
        และคนกรอกจะนึกว่าที่กรอกไปตอนปิดทริปหายไปหมด */
  list.forEach(bill => {
    if (creditSettlement[bill.id] === undefined && bill.settledThb != null) {
      creditSettlement[bill.id] = String(bill.settledThb);
    }
  });

  const filled = list.filter(bill =>
    Number(String(creditSettlement[bill.id] ?? '').replace(/[^\d.]/g, '')) > 0).length;

  box.innerHTML = `<p class="credit-lead">💳 <b>บัตรเครดิต — กรอกยอดที่ถูกเรียกเก็บจริงทีละรายการ</b>
    <small>ธนาคารแปลงค่าเงินทีละรายการตามวันที่รูดจริง กรอกแยกจึงตรงกว่ากรอกยอดรวม
      · กรอกแล้ว ${filled} จาก ${list.length} รายการ</small></p>`
    + list.map(bill => {
      const wallet = walletById(bill.walletId);
      const info = rateInfo(bill.currency, bill.walletId);
      const estimate = info.rate === null ? null : bill.amount * info.rate;
      const value = creditSettlement[bill.id] ?? '';
      const done = Number(String(value).replace(/[^\d.]/g, '')) > 0;
      return `
      <div class="credit-row${done ? ' done' : ''}">
        <span>
          <b>${bill.title}</b>
          <small>${billDateLabel(bill.date)} · ${wallet?.label || ''} · ${unitAmount(bill.amount, symbolFor(bill.currency))}${
            estimate === null ? '' : ` · ประมาณการ ${unitBaht(estimate)}`}</small>
        </span>
        <label>ยอดจริง (฿)
          <input inputmode="decimal" data-credit-settle="${bill.id}" value="${value}" placeholder="เช่น 2450">
        </label>
      </div>`;
    }).join('');
}

$('#creditSettlement')?.addEventListener('input', event => {
  const box = event.target.closest('[data-credit-settle]');
  if (!box) return;
  creditSettlement[box.dataset.creditSettle] = box.value;
  /* วาดใหม่เฉพาะตัวนับ ไม่ใช่ทั้งกล่อง — วาดทั้งกล่องจะทำให้ช่องที่กำลังพิมพ์
     ถูกสร้างใหม่แล้วเคอร์เซอร์กระโดดไปท้ายทุกครั้งที่กดปุ่ม */
  const lead = $('#creditSettlement .credit-lead small');
  const list = creditBills();
  const filled = list.filter(bill =>
    Number(String(creditSettlement[bill.id] ?? '').replace(/[^\d.]/g, '')) > 0).length;
  if (lead) lead.textContent = `ธนาคารแปลงค่าเงินทีละรายการตามวันที่รูดจริง กรอกแยกจึงตรงกว่ากรอกยอดรวม · กรอกแล้ว ${filled} จาก ${list.length} รายการ`;
  box.closest('.credit-row')?.classList.toggle('done',
    Number(String(box.value).replace(/[^\d.]/g, '')) > 0);
});

/* ── บัญชีและหมวดสำหรับกำไร/ขาดทุนอัตราแลกเปลี่ยน (North 2026-08-23) ──
   "ต้องกำหนดไว้ด้วยให้ลงบัญชีหลักบัญชีไหน เหมือนค่าใช้จ่าย"
   🔴 ลงเป็น Transaction คนละใบกับค่าใช้จ่าย เพราะหนึ่งใบผูกได้บัญชีเดียว
      และเป็นเหตุการณ์คนละอันจริง ๆ — ค่าใช้จ่ายคือเงินออกจากบัญชีที่เติมกระเป๋า
      ส่วนกำไร/ขาดทุนเกิดตอนแลกเงินที่เหลือกลับ ซึ่งเข้าบัญชีที่รับเงินคืน */
/* หมวดบัญชีของครอบครัว — โหลดครั้งเดียวแล้วใช้ซ้ำ (ใช้กับ FX และหมวดตั้งต้น) */
let familyCategories = [];

async function loadFamilyCategories() {
  if (!liveMode || familyCategories.length) return;
  try {
    familyCategories = (await TripApi.loadCategoryIcons()).categories || [];
  } catch (error) {
    console.error('load family categories failed', error);
    familyCategories = [];
  }
}

/* จำบัญชี/หมวดที่เลือกต่อกระเป๋า — ต้องเก็บนอกฟังก์ชันวาด
   ไม่งั้นวาดใหม่ทีไรค่าที่เลือกไว้หายทุกครั้ง */
const fxPlan = {};

function renderFxPosting() {
  const box = $('#fxPosting');
  if (!box) return;
  /* 🔴 หนึ่งกระเป๋าที่มีผลต่าง = หนึ่งรายการในสมุดบัญชี · ห้ามรวมข้ามกระเป๋า
     กระเป๋า A แลกคืนเข้าบัญชีหนึ่ง · B เข้าอีกบัญชี ถ้ารวมเป็นก้อนเดียว
     ยอดคงเหลือของทั้งสองบัญชีจะไม่ตรงกับความจริง และไม่มีอะไรฟ้อง
     เพราะยอดรวมทั้งครอบครัวยังถูก (North 2026-08-23) */
  const rows = settlementResults().filter(row => Math.abs(row.fx || 0) > 0.005);
  box.hidden = !rows.length;
  if (!rows.length) { box.innerHTML = ''; return; }

  const accountOptions = picked => familyAccounts.map(row =>
    `<option value="${row.account_id}"${picked === row.account_id ? ' selected' : ''}>${row.entity_name} · ${row.name}</option>`).join('');
  const categoryOptions = picked => (familyCategories.length
    ? familyCategories.map(row =>
      `<option value="${row.category_id}"${picked === row.category_id ? ' selected' : ''}>${
        row.caption_name ? `${row.caption_name} · ` : ''}${row.name}</option>`).join('')
    : '<option value="">— ยังไม่มีหมวดบัญชี —</option>');

  box.innerHTML = `<p class="fx-lead">💱 <b>กำไร/ขาดทุนอัตราแลกเปลี่ยน — ลงบัญชีทีละกระเป๋า</b>
    <small>แต่ละกระเป๋าแลกเงินคืนเข้าคนละบัญชีได้ · ผลต่างจึงรวมกันไม่ได้
      ไม่งั้นยอดคงเหลือของแต่ละบัญชีจะไม่ตรงกับความจริง</small></p>`
    + rows.map(row => {
      const plan = fxPlan[row.wallet.id] || {};
      const account = plan.accountId ?? row.wallet.accountId ?? '';
      return `
      <div class="fx-row ${row.fx < 0 ? 'loss' : 'gain'}">
        <span class="fx-who">
          <b>${row.wallet.label}</b>
          <small>ต้นทุน ${unitBaht(row.cost)} · แลกคืนได้ ${unitBaht(row.received)}</small>
          <em>${row.fx < 0 ? 'ขาดทุน' : 'กำไร'} ${unitBaht(Math.abs(row.fx))}</em>
        </span>
        <label>ลงบัญชีไหน
          <select data-fx-account="${row.wallet.id}">
            <option value="">— เลือกบัญชี —</option>${accountOptions(account)}
          </select>
        </label>
        <label>หมวดบัญชี
          <select data-fx-category="${row.wallet.id}">${categoryOptions(plan.categoryId || '')}</select>
        </label>
      </div>`;
    }).join('');
}

$('#fxPosting')?.addEventListener('change', event => {
  const account = event.target.closest('[data-fx-account]');
  if (account) {
    fxPlan[account.dataset.fxAccount] = { ...(fxPlan[account.dataset.fxAccount] || {}), accountId: account.value };
    return;
  }
  const category = event.target.closest('[data-fx-category]');
  if (category) {
    fxPlan[category.dataset.fxCategory] = { ...(fxPlan[category.dataset.fxCategory] || {}), categoryId: category.value };
  }
});

function settlementResults() {
  const s = computeCloseSummary();
  return s.leftovers.map(row => {
    const plan = settlementPlan[row.wallet.id] || { mode:'keep' };
    const cost = row.thb ?? 0;
    /* ปล่อยไว้ = ไม่แตะเงินเลย จึงไม่มีกำไร/ขาดทุนให้รับรู้
       ต้นทุนบาทของมันยังค้างอยู่ในบัญชีที่ผูกกับกระเป๋าตามเดิม */
    if (plan.mode === 'keep') {
      return { ...row, plan, cost, received: 0, fx: 0, realised: false };
    }
    if (plan.mode === 'return') {
      const received = Number(String(plan.receivedThb).replace(/[^\d.]/g, '')) || 0;
      return { ...row, plan, cost, received, fx: received - cost, realised: true };
    }
    const sameCurrency = plan.carryCurrency === row.wallet.currency;
    const amount = sameCurrency ? row.foreign : (Number(String(plan.carryAmount).replace(/[^\d.]/g, '')) || 0);
    // No baht was exchanged, so the cost basis transfers untouched.
    return { ...row, plan, cost, carryCurrency:plan.carryCurrency, carryAmount:amount, fx:0, realised:false, sameCurrency };
  });
}

function renderSettlement() {
  const results = settlementResults();
  $('#settlementBlock').hidden = !results.length;
  if (!results.length) { $('#fxSummary').innerHTML = ''; return; }

  $('#settlementRows').innerHTML = results.map(row => {
    const symbol = symbolFor(row.wallet.currency);
    const options = tripCurrencies.map(currency =>
      `<option value="${currency.code}"${currency.code === row.plan.carryCurrency ? ' selected' : ''}>${currency.code}${currency.code === row.wallet.currency ? ' (คงเดิม)' : ''}</option>`).join('');
    return `
    <div class="settle-row" data-wallet="${row.wallet.id}">
      <div class="settle-head">
        <b>${row.wallet.label}</b>
        <span>${fmtAmount(row.foreign, symbol)} · ต้นทุน ${fmtAmount(row.cost, '฿')}</span>
      </div>
      <div class="settle-modes">
        <label><input type="radio" name="mode-${row.wallet.id}" value="keep" ${row.plan.mode === 'keep' ? 'checked' : ''}> ปล่อยไว้</label>
        <label><input type="radio" name="mode-${row.wallet.id}" value="return" ${row.plan.mode === 'return' ? 'checked' : ''}> แลกคืนเข้าบัญชี</label>
        <label><input type="radio" name="mode-${row.wallet.id}" value="carry" ${row.plan.mode === 'carry' ? 'checked' : ''}> ยกไปทริปหน้า</label>
      </div>
      ${row.plan.mode === 'keep' ? `
        <div class="settle-input">
          <p class="fx-line neutral">ยังไม่แลกคืน · เงิน ${fmtAmount(row.foreign, symbol)} ค้างไว้เป็นยอดต้นทุน ${fmtAmount(row.cost, '฿')}
            ในบัญชีที่ผูกกับกระเป๋าใบนี้ ไว้ใช้ทริปหน้า · กำไร/ขาดทุนอัตราแลกเปลี่ยนจะเกิดตอนแลกคืนจริงเท่านั้น</p>
        </div>` : row.plan.mode === 'return' ? `
        <div class="settle-input">
          <label>ได้รับกลับมาจริง<div class="settle-amount"><span>฿</span><input class="settle-received" inputmode="decimal" value="${row.plan.receivedThb}"></div></label>
          <p class="fx-line ${row.fx < 0 ? 'loss' : (row.fx > 0 ? 'gain' : '')}">${
            Math.abs(row.fx) < 0.5
              ? 'เท่ากับต้นทุนพอดี ไม่มีกำไร/ขาดทุน'
              : `${row.fx > 0 ? 'กำไร' : 'ขาดทุน'}จากอัตราแลกเปลี่ยน <b>${fmtAmount(Math.abs(row.fx), '฿')}</b> · เทียบต้นทุน ${fmtAmount(row.cost, '฿')}`
          }</p>
        </div>` : `
        <div class="settle-input">
          <label>เก็บไว้เป็นสกุล<select class="settle-currency">${options}</select></label>
          ${row.sameCurrency ? `
            <p class="fx-line neutral">ไม่ได้แลกเงิน จึงไม่มีกำไร/ขาดทุน · ยกไป ${fmtAmount(row.foreign, symbol)} พร้อมต้นทุนเดิม ${fmtAmount(row.cost, '฿')}</p>`
            : `<label>ได้รับเป็นจำนวน<div class="settle-amount"><span>${symbolFor(row.plan.carryCurrency)}</span><input class="settle-carry" inputmode="decimal" value="${row.plan.carryAmount}"></div></label>
            <p class="fx-line neutral">แลกข้ามสกุลโดยไม่ผ่านเงินบาท · ต้นทุน ${fmtAmount(row.cost, '฿')} ถูกยกไปกับเงินก้อนใหม่ทั้งจำนวน ไม่เกิดกำไร/ขาดทุนที่ต้องลงบัญชี</p>`}
        </div>`}
    </div>`;
  }).join('');

  const fx = results.reduce((total, row) => total + row.fx, 0);
  const returned = results.filter(row => row.plan.mode === 'return');
  const carried = results.filter(row => row.plan.mode === 'carry');
  const kept = results.filter(row => row.plan.mode === 'keep');
  $('#fxSummary').innerHTML = `
    <span>ปล่อยไว้ <b>${kept.length} กระเป๋า</b> · ต้นทุนรวม ${fmtAmount(kept.reduce((t, row) => t + row.cost, 0), '฿')}</span>
    <span>แลกคืนเข้าบัญชี <b>${fmtAmount(returned.reduce((t, row) => t + row.received, 0), '฿')}</b> จาก ${returned.length} กระเป๋า</span>
    <span>ยกไปทริปหน้า <b>${carried.length} กระเป๋า</b> · ต้นทุนรวม ${fmtAmount(carried.reduce((t, row) => t + row.cost, 0), '฿')}</span>
    <span class="fx-total ${fx < 0 ? 'loss' : (fx > 0 ? 'gain' : '')}">${
      Math.abs(fx) < 0.5 ? 'ไม่มีกำไร/ขาดทุนอัตราแลกเปลี่ยน'
      : `${fx > 0 ? 'กำไร' : 'ขาดทุน'}อัตราแลกเปลี่ยนของทริปนี้ <b>${fmtAmount(Math.abs(fx), '฿')}</b>`
    }</span>`;
}

$('#settlementRows').addEventListener('change', event => {
  const row = event.target.closest('.settle-row');
  if (!row) return;
  const plan = settlementPlan[row.dataset.wallet];
  if (event.target.type === 'radio') plan.mode = event.target.value;
  if (event.target.classList.contains('settle-currency')) plan.carryCurrency = event.target.value;
  renderSettlement();
});
$('#settlementRows').addEventListener('input', event => {
  const row = event.target.closest('.settle-row');
  if (!row) return;
  const plan = settlementPlan[row.dataset.wallet];
  if (event.target.classList.contains('settle-received')) plan.receivedThb = event.target.value;
  if (event.target.classList.contains('settle-carry')) plan.carryAmount = event.target.value;
  const fx = settlementResults();
  renderSettlementTotalsOnly(fx);
});

// Retotal without re-rendering, so typing in a field doesn't lose focus.
function renderSettlementTotalsOnly(results) {
  const row = results.find(item => item.plan.mode === 'return');
  const fx = results.reduce((total, item) => total + item.fx, 0);
  results.forEach(item => {
    const node = $(`.settle-row[data-wallet="${item.wallet.id}"] .fx-line`);
    if (!node || item.plan.mode !== 'return') return;
    node.className = `fx-line ${item.fx < 0 ? 'loss' : (item.fx > 0 ? 'gain' : '')}`;
    node.innerHTML = Math.abs(item.fx) < 0.5
      ? 'เท่ากับต้นทุนพอดี ไม่มีกำไร/ขาดทุน'
      : `${item.fx > 0 ? 'กำไร' : 'ขาดทุน'}จากอัตราแลกเปลี่ยน <b>${fmtAmount(Math.abs(item.fx), '฿')}</b> · เทียบต้นทุน ${fmtAmount(item.cost, '฿')}`;
  });
  const total = $('.fx-total');
  if (!total) return;
  total.className = `fx-total ${fx < 0 ? 'loss' : (fx > 0 ? 'gain' : '')}`;
  total.innerHTML = Math.abs(fx) < 0.5 ? 'ไม่มีกำไร/ขาดทุนอัตราแลกเปลี่ยน'
    : `${fx > 0 ? 'กำไร' : 'ขาดทุน'}อัตราแลกเปลี่ยนของทริปนี้ <b>${fmtAmount(Math.abs(fx), '฿')}</b>`;
}

function renderClosePreview() {
  const s = computeCloseSummary();
  renderCreditSettlement();
  renderFxPosting();
  /* บัญชีกับหมวดโหลดตามหลัง แล้วค่อยวาดเติม — ไม่ await ก่อนเปิดกล่อง
     ไม่งั้นเน็ตช้าจะกดปุ่มแล้วเงียบไปหลายวินาทีจนคนกดซ้ำ */
  Promise.all([loadFamilyAccounts(), loadFamilyCategories()]).then(renderFxPosting);
  const block = (title, list, extraClass = '') => `
    <div class="close-block ${extraClass}"><h3>${title}</h3>
      ${list.length ? list.map(row => `<span>${row.name} · ${row.bills} บิล<b>${fmtAmount(row.thb, '฿')}</b></span>`).join('')
        : '<span class="muted-line">ไม่มีรายการ</span>'}
      <strong>รวม ${fmtAmount(list.reduce((t, row) => t + row.thb, 0), '฿')}</strong>
    </div>`;

  $('#closeBody').innerHTML = `
    ${block('ลงบัญชีหลัก', s.toLedger)}
    ${block('เก็บเฉพาะประวัติทริป', s.tripOnly, 'trip-only')}

    ${s.problems.length
      ? `<div class="close-problems"><b>ยังปิดทริปไม่ได้</b><ul>${s.problems.map(problem => `<li>${problem}</li>`).join('')}</ul></div>`
      : `<p class="close-ok">✓ ยอดสมดุลแล้ว · ค่าใช้จ่ายรวม ${fmtAmount(s.totalThb, '฿')} ตรงกับยอดที่แบ่งให้สมาชิกครบทุกบาท<br>
         <small>เมื่อยืนยัน เรทของทุกกระเป๋าจะถูกล็อกที่ค่าปัจจุบัน และตัวเลขจะไม่ขยับอีก</small></p>`}`;

  resetSettlementPlan();
  renderSettlement();
  $('#postingDate').value = postingDate || tripEndISO();
  updatePostingNote();
  /* Closing reports money to the family ledger, so it takes a deliberate
     acknowledgement rather than a single stray click. The text restates the
     figures so ticking it means something. */
  $('#closeAck').checked = false;
  $('#closeAckText').innerHTML = `ตรวจแล้วว่าถูกต้อง — จะลงบัญชีหลัก <b>${fmtAmount(s.ledgerTotal, '฿')}</b> และเก็บเฉพาะประวัติทริป <b>${fmtAmount(s.tripOnlyTotal, '฿')}</b>`;
  $('#closeAckRow').hidden = !s.balanced;
  $('#confirmClose').disabled = true;
  mask.classList.add('open');
  dialog.classList.add('open');
  dialog.setAttribute('aria-hidden', 'false');
}

$('#closePreview').addEventListener('click', renderClosePreview);

$('#closeAck').addEventListener('change', event => {
  $('#confirmClose').disabled = !event.target.checked || !computeCloseSummary().balanced;
});

$('#confirmClose').addEventListener('click', () => {
  const s = computeCloseSummary();
  if (!s.balanced || !$('#closeAck').checked) return;

  if (liveMode) {
    /* วันจบทริปในโหมดข้อมูลจริงต้องมาจาก Projects.end_date ไม่ใช่ TRIP_END_DATE
       ซึ่งเป็นค่าสมมติของข้อมูลตัวอย่าง (ก.พ. 2027) — ถ้าเผลอใช้ตัวนั้นจะลง
       บัญชีผิดงวดไปทั้งทริป */
    const posting = $('#postingDate').value || tripEndISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(posting)) {
      $('#closeError').textContent = 'เลือกวันลงบัญชีก่อน';
      return;
    }
    const lines = settlementResults().map(row => ({
      walletId: row.wallet.id, mode: row.plan.mode,
      receivedThb: row.received, carryCurrency: row.carryCurrency, carryAmount: row.carryAmount
    }));
    /* บัตรเครดิต — ต้องกรอกยอดบาทจริงครบทุกบิล ไม่งั้นเซิร์ฟเวอร์ปฏิเสธ
       🔴 กันไว้ตรงนี้ด้วย เพื่อบอกว่าขาดกี่รายการ แทนที่จะให้เจอ error รวม ๆ */
    const settlements = [];
    let missing = 0;
    creditBills().forEach(bill => {
      const value = Number(String(creditSettlement[bill.id] ?? '').replace(/[^\d.]/g, ''));
      if (!(value > 0)) { missing += 1; return; }
      settlements.push({ expenseId: bill.id, settledThb: value });
    });
    if (missing) {
      $('#closeError').textContent = `ยังกรอกยอดจริงของบิลบัตรเครดิตไม่ครบ · ขาดอีก ${missing} รายการ`;
      return;
    }

    /* กำไร/ขาดทุนค่าเงิน — แต่ละกระเป๋าต้องมีบัญชีและหมวดของตัวเอง
       🔴 ห้ามรวมข้ามกระเป๋า · ผลต่างของแต่ละใบเข้าคนละบัญชีได้ */
    const fxRows = settlementResults().filter(row => Math.abs(row.fx || 0) > 0.005);
    const fxIncomplete = fxRows.filter(row => {
      const plan = fxPlan[row.wallet.id] || {};
      return !(plan.accountId ?? row.wallet.accountId) || !plan.categoryId;
    }).map(row => row.wallet.label);
    if (fxIncomplete.length) {
      $('#closeError').textContent = `เลือกบัญชีและหมวดสำหรับกำไร/ขาดทุนของ: ${fxIncomplete.join(' · ')}`;
      return;
    }
    fxRows.forEach(row => {
      const target = lines.find(line => line.walletId === row.wallet.id);
      if (!target) return;
      const plan = fxPlan[row.wallet.id] || {};
      target.fxAccountId = plan.accountId ?? row.wallet.accountId ?? '';
      target.fxCategoryId = plan.categoryId || '';
    });
    submitLive('#closeError', () => TripApi.closeTrip({
      postingDate: posting, lines,
      settlements: settlements.map(row => ({ expense_id: row.expenseId, settled_thb: row.settledThb }))
    }),
      /* บอกจำนวนรายการที่เขียนลงสมุดบัญชีจริง — ตัวเลขที่ตรวจสอบได้
         ดีกว่าคำรับรองลอย ๆ ที่ครั้งหนึ่งเคยไม่เป็นความจริงเลย */
      result => {
        const spent = (result?.transaction_ids || []).length;
        const fx = (result?.fx_transaction_ids || []).length;
        const amount = fmtAmount(Math.abs(result?.transaction_total || 0), '฿');
        return `ปิดทริปแล้ว · ตัดค่าใช้จ่าย ${amount} เข้าสมุดบัญชี ${spent} รายการ`
          + (fx ? ` · กำไร/ขาดทุนค่าเงินอีก ${fx} รายการ` : '');
      })
      .then(ok => { if (!ok) showPrototypeToast('ปิดทริปไม่สำเร็จ — ดูเหตุผลในกล่อง'); });
    return;
  }

  /* Freeze each wallet's rate so the baht figures stop moving — this is the
     moment the trip's numbers become history rather than an estimate. */
  wallets.forEach(wallet => { wallet.lockedRate = walletRate(wallet.id) ?? currencyByCode(wallet.currency)?.planRate ?? null; });
  const settled = settlementResults();
  const fxResult = settled.reduce((total, row) => total + row.fx, 0);
  tripClosed = true;
  postingDate = $('#postingDate').value || tripEndISO();
  tripLog.push({
    type:'close', at:new Date().toLocaleString('th-TH'), by:memberName(viewerId),
    postingDate, ledgerTotal:s.ledgerTotal, tripOnlyTotal:s.tripOnlyTotal,
    carriedThb: settled.filter(row => row.plan.mode === 'carry').reduce((t, row) => t + row.cost, 0),
    fxResult,
    // Cost basis travels with the money, so next trip starts from what it cost.
    carried: settled.filter(row => row.plan.mode === 'carry').map(row => ({
      walletId: row.wallet.id, label: row.wallet.label,
      currency: row.carryCurrency, fromCurrency: row.wallet.currency,
      foreign: row.carryAmount, thbCost: row.cost, rate: row.rate, swapped: !row.sameCurrency
    })),
    returned: settled.filter(row => row.plan.mode === 'return').map(row => ({
      walletId: row.wallet.id, label: row.wallet.label,
      foreign: row.foreign, thbCost: row.cost, receivedThb: row.received, fx: row.fx
    })),
    rates: wallets.map(wallet => ({ id:wallet.id, rate:wallet.lockedRate }))
  });
  closeLayers();
  renderBills();
  showPrototypeToast(`ปิดทริปแล้ว · ลงบัญชีหลัก ${fmtAmount(s.ledgerTotal, '฿')}${
    Math.abs(fxResult) >= 0.5 ? ` · ${fxResult > 0 ? 'กำไร' : 'ขาดทุน'}อัตราแลกเปลี่ยน ${fmtAmount(Math.abs(fxResult), '฿')}` : ''}`);
});

/* ── Reopen (admin only) ── */
$('#reopenTrip').addEventListener('click', () => {
  if (!isAdmin(viewerId)) {
    showPrototypeToast(`เฉพาะผู้ดูแลทริปเท่านั้นที่เปิดทริปกลับได้`);
    return;
  }
  closeLayers();
  // Show exactly which posting is about to be reversed, with its own date.
  const lastClose = [...tripLog].reverse().find(entry => entry.type === 'close');
  $('#reopenImpact').innerHTML = lastClose
    ? `จะบันทึก<b>รายการกลับ</b>ของการปิดเมื่อ ${lastClose.at}<br>
       บัญชีหลัก <b>${fmtAmount(-lastClose.ledgerTotal, '฿')}</b> · เฉพาะทริป <b>${fmtAmount(-lastClose.tripOnlyTotal, '฿')}</b>
       ลงวันที่ <b>${thaiDate(lastClose.postingDate)}</b> (วันเดียวกับที่ปิดครั้งนั้น)<br>
       <small>ยอดเดิมไม่ถูกลบ · เมื่อปิดใหม่จะลงยอดเต็มอีกครั้ง ผลสุทธิจึงเท่ากับยอดล่าสุดเสมอ</small>`
    : 'ยังไม่มีการปิดทริปก่อนหน้า จึงไม่มีรายการให้กลับ';
  $('#reopenReason').value = '';
  $('#reopenError').textContent = '';
  mask.classList.add('open');
  $('#reopenDialog').classList.add('open');
  $('#reopenDialog').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#reopenReason').focus(), 80);
});

$('#reopenForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!isAdmin(viewerId)) { $('#reopenError').textContent = 'เฉพาะผู้ดูแลทริปเท่านั้น'; return; }
  const reason = $('#reopenReason').value.trim();
  if (reason.length < 5) { $('#reopenError').textContent = 'ระบุเหตุผลอย่างน้อย 5 ตัวอักษร เพื่อเก็บไว้ในประวัติ'; return; }

  if (liveMode) {
    // เซิร์ฟเวอร์เป็นคนหาว่าจะกลับรายการปิดครั้งไหน และลงวันไหน
    // หน้าจอไม่ต้องคำนวณเอง ไม่งั้นสองที่อาจเลือกคนละแถว
    submitLive('#reopenError', () => TripApi.reopenTrip(reason),
      'เปิดทริปกลับแล้ว · บันทึกรายการกลับเข้าบัญชีจริง');
    return;
  }

  /* Reopening must reverse the settlement that was already reported, not just
     unlock the UI. Without this, closing again would post a second full total
     and the ledger would double-count the first close. The reversal carries the
     original close's posting date so the period that was reported gets undone
     where it was reported — the ledger is only ever appended to. */
  const lastClose = [...tripLog].reverse().find(entry => entry.type === 'close');
  tripLog.push({
    type:'reopen', at:new Date().toLocaleString('th-TH'), by:memberName(viewerId), reason,
    postingDate: lastClose?.postingDate || '',
    ledgerTotal: lastClose ? -lastClose.ledgerTotal : 0,
    tripOnlyTotal: lastClose ? -lastClose.tripOnlyTotal : 0,
    reversalOf: lastClose?.at || ''
  });
  // Rates go live again; the values they were locked at stay in the log.
  wallets.forEach(wallet => { delete wallet.lockedRate; });
  tripClosed = false;
  postingDate = '';
  closeLayers();
  renderBills();
  showPrototypeToast('เปิดทริปกลับมาแก้ไขแล้ว · บันทึกเหตุผลไว้ในประวัติ');
});

/* NOTE: the old duplicate drag handlers that lived here bound to .plan-item
   nodes that renderPlanWorkspace() replaces on first render, so they never
   fired. Drag/drop now lives entirely in bindPlanInteractions(). */

$$('.segmented').forEach(group => group.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  $$('button', group).forEach(item => item.classList.toggle('active', item === button));
}));

/* Journey stops are the 11 pins on the map. `dayId` links each pin to the
   plan day that starts at that stop — Kushiro spans two days, so day2 simply
   points back at the same stop index. Pin → day and day → pin now resolve
   through this one table instead of being matched by day number, which never
   worked (the route has 11 stops across 12 days and skips Day 02). */
let journeyStops = [
  { day:'01', dayId:'day1',  name:'Kushiro', next:'Lake Akan', region:'EAST HOKKAIDO', description:'ตลาดปลา สะพาน Nusamai และเมืองริมแม่น้ำ' },
  { day:'03', dayId:'day3',  name:'Lake Akan', next:'Lake Kussharo', region:'EAST HOKKAIDO', description:'หิมะนุ่ม ออนเซ็นอุ่น และท้องฟ้าสีฟ้าหมอก' },
  { day:'04', dayId:'day4',  name:'Lake Kussharo', next:'Sounkyo', region:'LAKE & MOUNTAIN', description:'ทะเลสาบหงส์ ก่อนเดินทางเข้าสู่หุบเขาตอนกลาง' },
  { day:'05', dayId:'day5',  name:'Sounkyo', next:'Obihiro', region:'CENTRAL HOKKAIDO', description:'น้ำตก ภูเขาหิมะ และกระเช้า Asahidake' },
  { day:'06', dayId:'day6',  name:'Obihiro', next:'Furano', region:'TOKACHI', description:'Moor Onsen และอาหารพื้นเมืองโทคาจิ' },
  { day:'07', dayId:'day7',  name:'Furano', next:'Jozankei', region:'CENTRAL HOKKAIDO', description:'ทุ่งกว้าง เมืองชนบท และถนนผ่านภูเขา' },
  { day:'08', dayId:'day8',  name:'Jozankei', next:'Niseko', region:'WEST HOKKAIDO', description:'แช่ออนเซ็นท่ามกลางหุบเขาก่อนเดินทางต่อ' },
  { day:'09', dayId:'day9',  name:'Niseko', next:'Otaru', region:'WEST HOKKAIDO', description:'ภูเขาหิมะและเส้นทางสู่เมืองท่าริมทะเล' },
  { day:'10', dayId:'day10', name:'Otaru', next:'Sapporo', region:'SAPPORO AREA', description:'คลองโอตารุ ถนนเก่า และแสงไฟยามเย็น' },
  { day:'11', dayId:'day11', name:'Sapporo', next:'Chitose Airport', region:'SAPPORO AREA', description:'วันสุดท้ายในเมือง ก่อนเตรียมเดินทางกลับ' },
  { day:'12', dayId:'day12', name:'Chitose Airport', next:'เดินทางกลับ', region:'NEW CHITOSE', description:'เก็บความทรงจำและเดินทางกลับโดยสวัสดิภาพ' }
];
let actualJourneyIndex = 1;
let previewJourneyIndex = actualJourneyIndex;

/* ── แถบสรุปวันในโหมดข้อมูลจริง (2026-08-18) ──────────────────────────
   journeyStops ข้างบนเป็นของข้อมูลตัวอย่าง (11 หมุดบนภาพวาดฮอกไกโด)
   โหมดข้อมูลจริงเคยใช้ตารางนี้ต่อไปทั้งดุ้น ผลคือ:
   · แถบใต้แบนเนอร์เขียน "DAY 03 · Lake Akan → Lake Kussharo" ทุกทริป
   · 🔴 "ใช้วันนี้" เป็น ฿0 เสมอ เพราะ dayId 'day3' ไม่มีอยู่ใน planDays จริง
     → มันหา activity ของวันไม่เจอ เลยกรองบิลออกหมด ตัวเลขบนจอจึงผิดเงียบ ๆ
   ตรงนี้จึงสร้างตารางใหม่จากวันจริงของทริป */
function buildLiveJourney() {
  if (!planDays.length) return;
  /* แถบสรุปใต้แบนเนอร์ก็เด้งกลับ "วันนี้" ทุกครั้งที่บันทึกเหมือนกัน —
     จำวันที่กำลังเปิดดูไว้ก่อน แล้วค่อยกลับไปหาให้ถ้ามันยังอยู่ */
  const wasViewing = journeyStops[previewJourneyIndex]?.dayId || '';
  journeyStops = planDays.map((day, index) => {
    const spots = (day.activities || []).filter(act => act.visitStatus !== 'SKIPPED').map(act => act.name).filter(Boolean);
    return {
      day: String(day.day).padStart(2, '0'),
      dayId: day.id,
      name: day.city,
      next: '',
      region: thaiDate(day.date) || day.date || '',
      title: day.title || (day.city && day.city !== '—' ? `เที่ยว ${day.city}` : `แผน Day ${String(day.day).padStart(2, '0')}`),
      description: spots.length ? spots.join(' › ') : 'ยังไม่มีกิจกรรมในวันนี้'
    };
  });

  /* "วันนี้" คือวันที่ตรงกับวันจริง ถ้าทริปยังไม่เริ่ม/จบไปแล้วให้ยึดวันแรก
     ไม่ใช่ค้างที่ index 1 ซึ่งเป็นเลขของข้อมูลตัวอย่าง */
  const today = new Date().toISOString().slice(0, 10);
  const match = planDays.findIndex(day => day.date === today);
  actualJourneyIndex = match >= 0 ? match : 0;
  const stillThere = wasViewing ? journeyStops.findIndex(stop => stop.dayId === wasViewing) : -1;
  previewJourneyIndex = stillThere >= 0 ? stillThere : actualJourneyIndex;

  /* หมุด SVG 11 จุดวางตามพิกัดของภาพวาดฮอกไกโดโดยเฉพาะ — ถ้าแบนเนอร์เป็น
     ภาพอื่นแล้ว หมุดจะลอยมั่ว ๆ ทับภาพ ต้องซ่อน · อยากเห็นเส้นทางจริงให้กด 🗺️ */
  const builtInMap = String(tripBanner || '').includes('hokkaido-illustrated');
  $('.current-day-route').hidden = !builtInMap;
}

function renderJourneyPreview(selectedIndex) {
  previewJourneyIndex = selectedIndex;
  /* หมุดกับ journeyStops มีจำนวนตรงกันเฉพาะข้อมูลตัวอย่าง — ทริปจริงมีกี่วันก็ได้
     ถ้าไม่เช็ค จะไปไล่ทาสีหมุดผิดตัวหรืออ่าน journeyStops เกินขอบอาร์เรย์ */
  const pins = $$('.journey-pin').length === journeyStops.length ? $$('.journey-pin') : [];
  const selected = journeyStops[selectedIndex];
  if (!selected) return;
  pins.forEach((pin, index) => {
    pin.classList.remove('completed', 'current', 'next', 'future');
    if (index < selectedIndex) pin.classList.add('completed');
    else if (index === selectedIndex) pin.classList.add('current');
    else if (index === selectedIndex + 1) pin.classList.add('next');
    else pin.classList.add('future');
  });

  const points = pins.map(pin => [Number(pin.dataset.x), Number(pin.dataset.y)]);
  const completed = points.slice(0, selectedIndex + 1);
  $('#completedRoute').setAttribute('d', completed.length > 1
    ? completed.map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`).join(' ')
    : '');
  const active = points.slice(selectedIndex, selectedIndex + 2);
  $('#activeRoute').setAttribute('d', active.length > 1
    ? `M${active[0][0]} ${active[0][1]} L${active[1][0]} ${active[1][1]}`
    : '');

  $('#journeyDay').textContent = selected.day;
  $('#journeyRegion').textContent = selected.region;
  $('#journeyTitle').textContent = selected.title || `${selected.name} → ${selected.next}`;
  $('#journeyDescription').textContent = selected.description;
  $('#returnToday').hidden = selectedIndex === actualJourneyIndex;
  $('.day-summary').classList.toggle('previewing', selectedIndex !== actualJourneyIndex);
  $('#openSelectedPlan').textContent = `ดูแผน Day ${selected.day} ›`;
  renderTodayWeather(selected.dayId);
  renderNextActivity();   // การ์ดกิจกรรมถัดไปต้องตามวันที่กำลังดูอยู่ด้วย
}

/* The weather card used to be hardcoded to Lake Akan, so previewing Sapporo
   still showed Akan's forecast. It now follows the selected pin's day. */
/* ── แผนที่จริง (2026-08-17) ───────────────────────────────────────────
   หมุด 11 จุดบนภาพวาดฮอกไกโดฝังพิกัด SVG ไว้ในไฟล์ HTML ตายตัว ทริปปักกิ่ง
   จึงเห็นหมุด Sapporo/Otaru ทับภาพของตัวเอง และสถานที่ที่เพิ่มใหม่ไม่มีหมุดเลย
   ตรงนี้วาดจาก lat/lon จริงของจุดแวะแทน (ได้พิกัดมาแล้วตอนระบบอากาศ geocode)
   Leaflet โหลดจาก CDN แบบ lazy — คนที่ไม่กดดูแผนที่จะไม่ต้องโหลดทิ้งเปล่า ๆ */
const LEAFLET_VER = '1.9.4';
let leafletReady = null;
let tripMap = null;
let tripMapDrawn = [];      // ชั้นที่เราวาดเอง — ต้องลบก่อนวาดใหม่ ไม่ใช่ทับซ้อนไปเรื่อย
let mapViewOn = false;
/* ⚠️ กันเรียกซ้อน: drawTripMap → fillMissingCoords → refreshFromServer →
   applyLiveState → refreshTripMap → drawTripMap … วนไม่จบและยิง API รัว ๆ
   ธงนี้ตัดวงตรงจุดที่ refreshTripMap จะเรียกกลับเข้ามา */
let mapDrawing = false;

function loadLeaflet() {
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;
    js.onload = () => resolve(window.L);
    js.onerror = () => {
      leafletReady = null;   // ให้กดลองใหม่ได้ ไม่ใช่พังค้างตลอดทั้ง session
      reject(new Error('โหลดแผนที่ไม่สำเร็จ · ตรวจการเชื่อมต่ออินเทอร์เน็ต'));
    };
    document.head.append(js);
  });
  return leafletReady;
}

/* ระยะทางเส้นตรงระหว่างสองพิกัด (haversine) หน่วยกิโลเมตร
   ⚠️ นี่คือระยะ "บินตรง" ไม่ใช่ระยะขับรถ — เส้นทางในฮอกไกโดต้องอ้อมภูเขา
   ระยะขับจริงมักมากกว่านี้ 20–40% ป้ายบนจอจึงต้องเขียนว่า "ตรง" ให้ชัด
   ไม่ใช่ปล่อยให้คนอ่านเป็นระยะขับแล้วคำนวณเวลาออกเดินทางผิด */
function straightKm(a, b) {
  const R = 6371;
  const rad = deg => deg * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const showKm = km => km < 1 ? `${Math.round(km * 1000)} ม.` : `${km < 10 ? km.toFixed(1) : Math.round(km)} กม.`;
const hasCoords = item => typeof item?.lat === 'number' && typeof item?.lon === 'number';

/* จุดแวะทั้งทริปที่มีพิกัด เรียงตามวันแล้วตามลำดับในวัน
   จุดที่หาพิกัดไม่เจอถูกตัดออก ไม่ใช่วางไว้ที่ 0,0 ซึ่งจะกลายเป็นหมุด
   กลางอ่าวกินีแล้วดึงกรอบแผนที่เพี้ยนทั้งทริป */
function mappableStops() {
  return planDays.flatMap(day => (day.activities || [])
    .filter(act => act.visitStatus !== 'SKIPPED' && hasCoords(act))
    .map(act => ({ lat: act.lat, lon: act.lon, name: act.name, time: act.time,
                   dayId: day.id, dayNo: day.day, date: day.date })));
}

/* วันนี้ผ่านมาแล้ว / กำลังอยู่ / ยังไม่ถึง — ตัดสินจากวันที่จริง ไม่ใช่ index
   ที่ฝังไว้ (actualJourneyIndex = 1) ซึ่งค้างอยู่ที่ Lake Akan ตลอดกาล */
function dayPhase(date) {
  if (!date) return 'future';
  const today = new Date().toISOString().slice(0, 10);
  return date < today ? 'past' : date === today ? 'today' : 'future';
}

/* ขอให้เซิร์ฟเวอร์เติมพิกัดที่ขาด แล้วโหลดข้อมูลใหม่
   เดิมพิกัดถูกเติมเฉพาะจุดแรกของวันตอนดูอากาศ — แผนที่จึงมีหมุดแค่ไม่กี่จุด
   วนซ้ำได้ไม่เกิน 4 รอบ (48 จุด) กันไม่ให้ทริปยาวมากยิงวนไม่จบ
   ⚠️ offset สะสมจากจำนวนที่ค้นไม่เจอ ไม่ใช่จำนวนที่สแกน — จุดที่ค้นเจอจะหลุด
   จากคิวไปเอง ถ้านับรวมด้วยจะข้ามจุดที่ยังไม่ได้ค้น */
async function fillMissingCoords() {
  if (!liveMode) return;
  let offset = 0;
  for (let round = 0; round < 4; round += 1) {
    const result = await TripApi.geocodeStops(offset).catch(() => null);
    if (!result || !result.scanned) return;
    offset += result.failed || 0;
    if (result.filled) await refreshFromServer();
    if (!result.remaining) return;
  }
}

/* ล้างกล่องแผนที่แล้วเขียนข้อความแทน — ต้องทิ้ง instance ของ Leaflet ด้วย
   ไม่ใช่แค่ล้าง innerHTML เพราะ Leaflet จะยังถือ DOM ที่หายไปแล้ว แล้วรอบ
   ถัดไปมันจะวาดลงกล่องผี ผู้ใช้เห็นพื้นเทาว่างเปล่าโดยไม่มี error ให้ไล่ */
function mapMessage(text) {
  if (tripMap) {
    tripMap.remove();
    tripMap = null;
    tripMapDrawn = [];
  }
  $('#tripMap').innerHTML = '';
  $$('.map-hero .map-note').forEach(node => node.remove());
  const note = document.createElement('p');
  note.className = 'map-note';
  note.textContent = text;
  $('.map-hero').append(note);
}

async function drawTripMap() {
  if (mapDrawing) return;
  mapDrawing = true;
  try {
    await paintTripMap();
  } finally {
    mapDrawing = false;
  }
}

async function paintTripMap() {
  const host = $('#tripMap');
  if (!mappableStops().length) {
    mapMessage('กำลังค้นพิกัดของสถานที่ในทริป…');
    await fillMissingCoords();
  }
  const stops = mappableStops();
  if (!stops.length) {
    mapMessage('ยังไม่มีพิกัดของสถานที่ในทริปนี้ — ระบบค้นจากชื่อสถานที่ไม่เจอ ลองใส่ชื่อภาษาอังกฤษหรือชื่อเมืองกำกับไว้ในชื่อจุดแวะ');
    return;
  }
  $$('.map-hero .map-note').forEach(node => node.remove());

  const L = await loadLeaflet();
  if (!tripMap) {
    tripMap = L.map(host, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(tripMap);
  }
  tripMapDrawn.forEach(layer => tripMap.removeLayer(layer));
  tripMapDrawn = [];

  /* เส้นทางแยกสองเส้น: ช่วงที่ผ่านมาแล้วเป็นเส้นทึบสีเข้ม ช่วงที่ยังไม่ถึงเป็นเส้นประ
     ใส่ขอบขาวหนารองข้างใต้ เพราะเส้นสีเดียวบนแผนที่ที่มีทั้งป่าเขียวและทะเลฟ้า
     จะจมหายไปในบางช่วง (ปัญหาเดิมที่เคยแก้บนภาพวาดมาแล้วรอบหนึ่ง) */
  const line = stops.map(stop => [stop.lat, stop.lon]);
  const doneCount = stops.filter(stop => dayPhase(stop.date) === 'past').length;
  const seams = [
    { pts: line.slice(0, Math.max(doneCount, 1)), dash: null, color: '#5c6b78' },
    { pts: line.slice(Math.max(doneCount - 1, 0)), dash: '9 9', color: '#2f7f9e' }
  ];
  seams.forEach(seam => {
    if (seam.pts.length < 2) return;
    tripMapDrawn.push(L.polyline(seam.pts, { color: '#fff', weight: 8, opacity: .85 }).addTo(tripMap));
    tripMapDrawn.push(L.polyline(seam.pts, {
      color: seam.color, weight: 4, opacity: .95, dashArray: seam.dash
    }).addTo(tripMap));
  });

  stops.forEach((stop, index) => {
    const phase = dayPhase(stop.date);
    const marker = L.marker([stop.lat, stop.lon], {
      icon: L.divIcon({
        className: `trip-pin ${phase}`,
        html: `<i>${index + 1}</i><b>${stop.name}</b>`,
        iconSize: null
      }),
      title: `Day ${stop.dayNo} · ${stop.name}`
    }).addTo(tripMap);
    const gap = index ? `<br>ห่างจากจุดก่อนหน้า ${showKm(straightKm(stops[index - 1], stop))} (วัดเส้นตรง)` : '';
    marker.bindPopup(`<b>${stop.name}</b><br>Day ${stop.dayNo} · ${thaiDate(stop.date) || stop.date}${stop.time ? ` · ${stop.time}` : ''}${gap}`);
    /* กดหมุดแล้วกระโดดไปหน้าแผนของวันนั้น — เป็นเหตุผลหลักที่คนเปิดแผนที่ */
    marker.on('dblclick', () => {
      activePlanDayId = stop.dayId;
      selectedActivityId = null;
      renderPlanWorkspace();
      showScreen('plan');
    });
    tripMapDrawn.push(marker);
  });

  tripMap.fitBounds(L.latLngBounds(line).pad(0.18));
  /* เปิดครั้งแรกตอน host ยัง hidden อยู่ Leaflet จะวัดขนาดได้ 0×0 แล้วโชว์
     แผนที่แค่มุมซ้ายบน — ต้องสั่งวัดใหม่หลังโชว์แล้ว */
  setTimeout(() => tripMap.invalidateSize(), 60);

  /* บอกให้รู้ว่ามีจุดที่หายไปจากแผนที่ — คนที่นับหมุดแล้วเจอไม่ครบจะได้ไม่คิดว่า
     ข้อมูลหาย · แปะบน .map-hero ไม่ใช่ในกล่องแผนที่ เพราะ pane ของ Leaflet
     ใช้ z-index สูงกว่ามาก ป้ายที่วางข้างในจะถูกแผนที่ทับจนมองไม่เห็น */
  const skipped = planDays.reduce((sum, day) =>
    sum + (day.activities || []).filter(act => !hasCoords(act)).length, 0);
  if (skipped) {
    const note = document.createElement('p');
    note.className = 'map-note';
    note.textContent = `มี ${skipped} สถานที่ที่ยังไม่มีพิกัด จึงไม่มีหมุดบนแผนที่ — ลองใส่ชื่อสถานที่เป็นภาษาอังกฤษหรือชื่อเมืองกำกับ`;
    $('.map-hero').append(note);
  }
}

function setMapView(on) {
  mapViewOn = on;
  $('#tripMap').hidden = !on;
  $('.map-hero > img').style.visibility = on ? 'hidden' : '';
  $('.current-day-route').hidden = on;
  $('#changeBanner').hidden = on;
  $('#toggleMapView').textContent = on ? '🖼️ ภาพแบนเนอร์' : '🗺️ แผนที่จริง';
  $('.map-legend')?.remove();
  // ป้ายเตือนเป็นของแผนที่ ต้องหายไปพร้อมกัน ไม่ใช่ค้างทับภาพแบนเนอร์
  if (!on) $$('.map-hero .map-note').forEach(node => node.remove());
  if (on) {
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = '<span class="past"><i></i>ผ่านมาแล้ว</span>'
      + '<span class="today"><i></i>วันนี้</span>'
      + '<span class="future"><i></i>ยังไม่ถึง</span>';
    $('.map-hero').append(legend);
  }
  try { localStorage.setItem('unified-trip-mapview', on ? '1' : '0'); } catch {}
}

$('#toggleMapView').addEventListener('click', async () => {
  if (mapViewOn) return setMapView(false);
  setMapView(true);
  try {
    await drawTripMap();
  } catch (error) {
    /* โหลด CDN ไม่ได้ (เน็ตหลุด/ถูกบล็อก) ต้องกลับไปภาพแบนเนอร์ ไม่ใช่ปล่อย
       ให้เห็นกล่องเทาเปล่า ๆ แล้วเข้าใจว่าทริปไม่มีสถานที่ */
    setMapView(false);
    toast(error.message);
  }
});

/* เรียกหลังข้อมูลจริงมาถึง — สองหน้าที่ในตัวเดียว
   1. ถ้าแผนที่เปิดอยู่ ต้องวาดใหม่ ไม่งั้นหมุดค้างเป็นของแผนตัวอย่าง
   2. ครั้งแรกของ session ให้คืนค่าที่ผู้ใช้เลือกไว้คราวก่อน
   ⚠️ คืนค่าเฉพาะเมื่อมีพิกัดจริงอยู่บ้าง — ถ้าคืนแล้วเจอกล่องเปล่าพร้อมคำเตือน
   ทุกครั้งที่เปิดแอป มันน่ารำคาญกว่าการต้องกดปุ่มเองหนึ่งครั้ง */
let mapViewRestored = false;
function refreshTripMap() {
  if (mapViewOn) return void drawTripMap().catch(error => console.error(error));
  if (mapViewRestored) return;
  mapViewRestored = true;
  let saved = '0';
  try { saved = localStorage.getItem('unified-trip-mapview') || '0'; } catch {}
  if (saved !== '1' || !mappableStops().length) return;
  setMapView(true);
  drawTripMap().catch(error => {
    setMapView(false);
    console.error(error);
  });
}

/* ── พยากรณ์อากาศจากบริการจริง (2026-08-11) ───────────────────────────
   แคชตามวันในหน่วยความจำ เพื่อไม่ให้ยิงซ้ำทุกครั้งที่สลับแท็บไปมา
   (โควตา Open-Meteo คือ 10,000 ครั้ง/วัน ซึ่งเหลือเฟือ แต่ยิงซ้ำก็ทำให้จอกระพริบ) */
const weatherCache = new Map();

async function renderSelectedStopWeather(day, stop) {
  const target = $('#selectedStopWeather');
  if (!target) return;
  if (!liveMode) {
    const weather = day.weather;
    target.textContent = weather ? `${weather.icon} ${weather.temp} · ${weather.note || ''}` : 'ยังไม่มีข้อมูลอากาศ';
    return;
  }
  const key = `${day.date}:${stop.id}`;
  target.textContent = 'กำลังดูอากาศ…';
  try {
    if (!weatherCache.has(key)) weatherCache.set(key, await TripApi.weatherFor(day.date, stop.id));
    if (selectedStopByDay.get(day.id) !== stop.id) return;
    const weather = weatherCache.get(key);
    if (!weather?.available) {
      target.textContent = weather?.reason === 'no_coords' ? 'ยังไม่มีพิกัดสถานที่' : 'ยังไม่มีข้อมูลอากาศ';
      return;
    }
    const rain = weather.rain_chance == null ? '' : ` · ฝน/หิมะ ${weather.rain_chance}%`;
    const source = weather.kind === 'historical' ? ' · ค่าเฉลี่ยปีก่อน' : '';
    target.textContent = `${weather.icon} ${weather.temp_max}°/${weather.temp_min}°${rain}${source}`;
  } catch {
    target.textContent = 'ดูอากาศไม่ได้ตอนนี้';
  }
}

async function renderLiveWeather(day) {
  if (!$('#weatherPlace')) return;
  if (!day.date) return;
  const firstStopName = day.activities?.[0]?.name || '';
  $('#weatherPlace').textContent = day.city || firstStopName || 'ยังไม่มีจุดแวะ';
  $('#weatherPeriods').innerHTML = '';

  if (!weatherCache.has(day.date)) {
    $('#weatherNow').innerHTML = '<div class="weather-empty">กำลังดูอากาศ…</div>';
    $('#weatherTip').textContent = '';
    $('#weatherStamp').textContent = thaiDate(day.date);
    try {
      weatherCache.set(day.date, await TripApi.weatherFor(day.date));
    } catch {
      weatherCache.set(day.date, { available: false, reason: 'service_error' });
    }
    // ผู้ใช้อาจสลับวันไปแล้วระหว่างรอ — อย่าเขียนทับข้อมูลของวันที่กำลังดูอยู่
    if (activePlanDayId !== day.id) return;
  }

  const weather = weatherCache.get(day.date);
  if (!weather?.available) {
    const reason = {
      no_stop: 'วันนี้ยังไม่มีสถานที่ในแผน — เพิ่มสถานที่แล้วจะดูอากาศให้',
      no_coords: 'ยังหาพิกัดไม่เจอ — เพิ่มชื่อเมืองภาษาอังกฤษหรือปักหมุดให้จุดแวะแรก',
      service_error: 'ดูอากาศไม่ได้ตอนนี้ · ลองใหม่อีกครั้งภายหลัง'
    }[weather?.reason] || 'ยังไม่มีข้อมูลอากาศของวันนี้';
    $('#weatherNow').innerHTML = `<div class="weather-empty">${reason}</div>`;
    $('#weatherTip').textContent = '';
    $('#weatherStamp').textContent = thaiDate(day.date);
    return;
  }

  $('#weatherPlace').textContent = weather.place || day.city || firstStopName || 'จุดแวะแรก';

  $('#weatherNow').innerHTML = `
    <span>${weather.icon}</span>
    <strong>${weather.temp_max}°</strong>
    <div>ต่ำสุด ${weather.temp_min}°<br>${weather.text}</div>`;

  /* ⚠️ ต้องแยกให้ชัดว่าเป็น "พยากรณ์" หรือ "ค่าเฉลี่ยปีก่อน"
     ถ้าคนเข้าใจผิดว่าค่าเฉลี่ยคือพยากรณ์แล้วจัดกระเป๋าตามนั้น จะเสียหายจริง
     จึงเขียนตรง ๆ ว่าไม่ใช่พยากรณ์ ไม่ใช่แค่ใส่ดอกจันตัวเล็ก ๆ */
  if (weather.kind === 'historical') {
    $('#weatherStamp').textContent = `อ้างอิงปี ${weather.reference_year}`;
    $('#weatherTip').textContent =
      `⚠️ ไม่ใช่พยากรณ์ — วันนี้ยังไกลเกินกว่าจะพยากรณ์ได้ (ล่วงหน้าได้ราว 16 วัน) ` +
      `ตัวเลขนี้คือค่าเฉลี่ยของช่วงเวลาเดียวกันเมื่อปี ${weather.reference_year} ใช้ดูแนวโน้มว่าควรเตรียมเสื้อผ้าแบบไหน`;
  } else {
    $('#weatherStamp').textContent = `พยากรณ์ · ${thaiDate(weather.date)}`;
    $('#weatherTip').textContent = weather.rain_chance != null
      ? `โอกาสมีฝน/หิมะ ${weather.rain_chance}%`
      : 'พยากรณ์จาก Open-Meteo';
  }
}

function renderTodayWeather(dayId) {
  if (!$('#weatherPlace')) return;
  const day = planDays.find(item => item.id === dayId);
  if (!day) return;
  const { weather } = day;
  $('#weatherPlace').textContent = day.city;

  /* วันที่มาจากฐานจริงยังไม่มีข้อมูลพยากรณ์ — ต้องบอกว่าไม่มี ไม่ใช่โชว์ตัวเลข
     ของข้อมูลตัวอย่างค้างไว้ เพราะคนจะอ่านว่าเป็นพยากรณ์ของวันนั้นจริง ๆ */
  /* โหมดข้อมูลจริงดึงพยากรณ์จากบริการภายนอก (ผ่าน backend) แทนข้อมูลตัวอย่าง */
  if (liveMode) return renderLiveWeather(day);

  if (!weather) {
    $('#weatherNow').innerHTML = '<div class="weather-empty">ยังไม่มีข้อมูลพยากรณ์อากาศของวันนี้</div>';
    $('#weatherPeriods').innerHTML = '';
    $('#weatherTip').textContent = 'ระบบยังไม่ได้เชื่อมกับบริการพยากรณ์อากาศ';
    $('#weatherStamp').textContent = day.date || '';
    return;
  }

  $('#weatherNow').innerHTML = `<span>${weather.icon}</span><strong>${weather.temp}</strong><div>${weather.feels}<br>${weather.note}</div>`;
  $('#weatherPeriods').innerHTML = weather.periods.map(period => `
    <div class="${period.active ? 'selected' : ''}"><span>${period.label}</span><b>${period.temp}</b><small>${period.detail}</small></div>`).join('');
  $('#weatherTip').textContent = weather.tip;
  $('#weatherStamp').textContent = dayId === journeyStops[actualJourneyIndex]?.dayId
    ? 'อัปเดต 5 นาทีที่แล้ว'
    : `พยากรณ์ล่วงหน้า · ${day.date}`;
}

$$('.journey-pin').forEach(pin => {
  pin.setAttribute('role', 'button');
  pin.setAttribute('tabindex', '0');
  pin.setAttribute('aria-label', `ดูแผน ${journeyStops[Number(pin.dataset.index)].name}`);
  pin.addEventListener('click', () => renderJourneyPreview(Number(pin.dataset.index)));
  pin.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      renderJourneyPreview(Number(pin.dataset.index));
    }
  });
});
$('#returnToday').addEventListener('click', () => renderJourneyPreview(actualJourneyIndex));

/* Previously this only switched screens, so the button could read
   "ดูแผน Day 05" and still drop you on whatever day was last open. */
$('#openSelectedPlan').addEventListener('click', () => {
  const target = journeyStops[previewJourneyIndex]?.dayId;
  if (target && planDays.some(day => day.id === target)) {
    activePlanDayId = target;
    selectedActivityId = null;
    renderPlanWorkspace();
  }
  showScreen('plan');
});

const ART = '../puppup-prototype/art/';
const wx = (icon, temp, feels, note, tip, periods) => ({ icon, temp, feels, note, tip, periods });
const periods = (morning, afternoon, evening, activeIndex = 1) =>
  [['เช้า', ...morning], ['บ่าย', ...afternoon], ['ค่ำ', ...evening]]
    .map(([label, temp, detail], index) => ({ label, temp, detail, active: index === activeIndex }));

const planDays = [
  {
    id:'day1', day:1, city:'Kushiro', date:'8 ก.พ. 2027',
    weather:wx('🌥️','−5°','รู้สึกเหมือน −9°','เมฆมาก · ลม 12 km/h','🧳 วันเดินทาง เก็บเสื้อกันหนาวไว้ในกระเป๋าถือ',
      periods(['−7°','☁️ 20%'],['−5°','🌥️ 30%'],['−8°','❄️ 40%'], 2)),
    activities:[
      { id:'flight-ckt', time:'10:20', name:'ถึงสนามบิน Kushiro', detail:'รับรถเช่าและตรวจยางสำหรับถนนหิมะ', tag:'การเดินทาง', cost:'¥ 32,000', bills:'1 บิล', image:`${ART}ic_train.png` },
      { id:'kushiro-checkin', time:'15:00', name:'เช็กอินที่พัก Kushiro', detail:'พักใกล้ท่าเรือ เดินไปตลาดได้', tag:'ที่พัก', cost:'¥ 18,500', bills:'1 บิล', image:`${ART}ic_hotel.png` },
      { id:'nusamai', time:'17:10', name:'Nusamai Bridge Sunset', detail:'สะพานรูปปั้นสี่ฤดู · พระอาทิตย์ตกที่สวยที่สุดแห่งหนึ่งของโลก', tag:'กิจกรรมย่อย', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}act_nusamai.png` }
    ]
  },
  {
    id:'day2', day:2, city:'Kushiro', date:'9 ก.พ. 2027',
    weather:wx('🌨️','−7°','รู้สึกเหมือน −12°','หิมะ 60% · ลม 20 km/h','🧤 ตลาดเช้าเปิด 08:00 ควรไปก่อนคนเยอะ',
      periods(['−10°','🌨️ 60%'],['−7°','🌨️ 50%'],['−12°','💨 ลมแรง'], 0)),
    activities:[
      { id:'washo-market', time:'08:00', name:'ตลาดปลา Washo', detail:'ข้าวหน้าปลาดิบเลือกเองแบบคัตเตะโดง', tag:'สถานที่หลัก', cost:'¥ 6,800', bills:'2 บิล', image:`${ART}ic_ramen.png` },
      { id:'kushiro-crane', time:'11:00', name:'ศูนย์อนุรักษ์นกกระเรียน', detail:'นกกระเรียนมงกุฎแดงในทุ่งหิมะ', tag:'กิจกรรมย่อย', cost:'¥ 2,400', bills:'1 บิล', image:`${ART}act_crane.png` },
      { id:'drive-akan', time:'15:00', name:'เดินทางไป Lake Akan', detail:'ประมาณ 1 ชม. 40 นาที · ถนนภูเขาช่วงท้าย', tag:'การเดินทาง', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}ic_train.png` }
    ]
  },
  {
    id:'day3', day:3, city:'Lake Akan', date:'10 ก.พ. 2027',
    weather:wx('🌨️','−6°','รู้สึกเหมือน −11°','หิมะ 70% · ลม 18 km/h','🧣 ถนนอาจลื่นและลมแรงช่วงเย็น ควรออกก่อนพระอาทิตย์ตก',
      periods(['−9°','☁️ 30%'],['−6°','🌨️ 70%'],['−11°','💨 ลมแรง'])),
    activities:[
      { id:'akan-lake', time:'09:00', name:'Lake Akan', detail:'ทะเลสาบน้ำแข็ง · −8°C · หิมะ 40%', tag:'สถานที่หลัก', cost:'¥ 2,800', bills:'2 บิล', image:`${ART}act_marimo.png` },
      { id:'ainu-kotan', time:'11:30', name:'Akanko Ainu Kotan', detail:'วัฒนธรรมไอนุ · เดินจากทะเลสาบ 8 นาที', tag:'กิจกรรมย่อย', cost:'¥ 4,200', bills:'3 บิล', image:`${ART}act_ainukotan.png` },
      { id:'akan-onsen', time:'18:00', name:'Akan Onsen', detail:'แช่ออนเซ็นและพักผ่อนก่อนเดินทางวันถัดไป', tag:'กิจกรรมย่อย', cost:'¥ 1,600', bills:'1 บิล', image:`${ART}wx_night.png` }
    ]
  },
  {
    id:'day4', day:4, city:'Lake Kussharo', date:'11 ก.พ. 2027',
    weather:wx('🌤️','−4°','รู้สึกเหมือน −8°','เมฆบาง · ถนนอาจมีน้ำแข็ง','🚗 ถนนช่วงเช้าเป็นน้ำแข็งดำ ขับช้าและเว้นระยะ',
      periods(['−8°','🌤️ 10%'],['−4°','☀️ 10%'],['−9°','🌙 ใส'])),
    activities:[
      { id:'kussharo-lake', time:'09:30', name:'Lake Kussharo', detail:'ชมฝูงหงส์และทะเลสาบภูเขาไฟ', tag:'สถานที่หลัก', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}act_crane.png` },
      { id:'kitakitsune', time:'13:00', name:'Kitakitsune Farm', detail:'ฟาร์มสุนัขจิ้งจอก · ขับรถ 45 นาที', tag:'กิจกรรมย่อย', cost:'¥ 1,500', bills:'1 บิล', image:`${ART}ic_gift.png` },
      { id:'drive-sounkyo', time:'16:00', name:'เดินทางไป Sounkyo', detail:'ประมาณ 2 ชม. 35 นาที · ถึงก่อนค่ำ', tag:'การเดินทาง', cost:'¥ 3,200', bills:'1 บิล', image:`${ART}ic_train.png` }
    ]
  },
  {
    id:'day5', day:5, city:'Sounkyo', date:'12 ก.พ. 2027',
    weather:wx('❄️','−9°','รู้สึกเหมือน −15°','หิมะต่อเนื่อง · ทัศนวิสัยต่ำช่วงบ่าย','⚠️ ถ้าลมเกิน 15 m/s กระเช้า Asahidake จะปิด เตรียมแผนสำรอง',
      periods(['−12°','❄️ 80%'],['−9°','❄️ 80%'],['−15°','💨 ลมแรงมาก'])),
    activities:[
      { id:'sounkyo', time:'08:30', name:'Sounkyo Gorge', detail:'หุบเขาหิมะและจุดชมวิว', tag:'สถานที่หลัก', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}act_ginga.png` },
      { id:'asahidake', time:'10:30', name:'Asahidake Ropeway', detail:'ตรวจลมก่อนขึ้นกระเช้า · สำรองแผน B', tag:'กิจกรรมย่อย', cost:'¥ 6,400', bills:'2 บิล', image:`${ART}act_kurodake.png` },
      { id:'shirahige', time:'14:30', name:'Shirahige Waterfall', detail:'น้ำตกสีฟ้า · ขับรถ 1 ชม. 20 นาที', tag:'กิจกรรมย่อย', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}act_ginga.png` }
    ]
  },
  {
    id:'day6', day:6, city:'Obihiro', date:'13 ก.พ. 2027',
    weather:wx('☀️','−3°','รู้สึกเหมือน −6°','ท้องฟ้าเปิด · ลม 8 km/h','🚙 ท้องฟ้าเปิดทั้งวัน เหมาะกับการขับทางไกล',
      periods(['−7°','☀️ 0%'],['−3°','☀️ 0%'],['−8°','🌙 ใส'])),
    activities:[
      { id:'obihiro', time:'10:00', name:'Obihiro', detail:'ตลาดท้องถิ่นและอาหารโทคาจิ', tag:'สถานที่หลัก', cost:'¥ 5,800', bills:'3 บิล', image:`${ART}ic_ramen.png` },
      { id:'moor-onsen', time:'15:30', name:'Moor Onsen', detail:'ออนเซ็นพืชธรรมชาติเอกลักษณ์โทคาจิ', tag:'กิจกรรมย่อย', cost:'¥ 2,400', bills:'2 บิล', image:`${ART}wx_afternoon.png` }
    ]
  },
  {
    id:'day7', day:7, city:'Furano', date:'14 ก.พ. 2027',
    weather:wx('🌨️','−6°','รู้สึกเหมือน −11°','หิมะโปรย · ลม 14 km/h','📷 หิมะโปรยเบา ๆ เหมาะกับถ่ายภาพทุ่งกว้าง',
      periods(['−9°','🌨️ 50%'],['−6°','🌨️ 40%'],['−11°','☁️ 20%'])),
    activities:[
      { id:'furano', time:'10:30', name:'Furano', detail:'ทุ่งหิมะกว้างและเมืองชนบทกลางเกาะ', tag:'สถานที่หลัก', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}st_camera.png` },
      { id:'ningle', time:'13:30', name:'Ningle Terrace', detail:'กระท่อมงานคราฟต์ในป่าสน', tag:'กิจกรรมย่อย', cost:'¥ 3,600', bills:'1 บิล', image:`${ART}ic_gift.png` },
      { id:'furano-curry', time:'18:30', name:'แกงกะหรี่ Furano', detail:'เมนูประจำเมือง เสิร์ฟในหม้อร้อน', tag:'อาหาร', cost:'¥ 4,800', bills:'1 บิล', image:`${ART}ic_ramen.png` }
    ]
  },
  {
    id:'day8', day:8, city:'Jozankei', date:'15 ก.พ. 2027',
    weather:wx('🌥️','−4°','รู้สึกเหมือน −8°','เมฆมาก · ลม 10 km/h','♨️ ออนเซ็นกลางแจ้งอุ่นที่สุดช่วงหัวค่ำ',
      periods(['−7°','🌥️ 20%'],['−4°','🌥️ 30%'],['−9°','🌨️ 40%'], 2)),
    activities:[
      { id:'jozankei', time:'11:00', name:'Jozankei Onsen', detail:'หมู่บ้านออนเซ็นในหุบเขา', tag:'สถานที่หลัก', cost:'¥ 22,000', bills:'1 บิล', image:`${ART}wx_afternoon.png` },
      { id:'futami', time:'14:00', name:'Futami Suspension Bridge', detail:'สะพานแขวนเหนือลำธารน้ำแข็ง', tag:'กิจกรรมย่อย', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}act_ginga.png` }
    ]
  },
  {
    id:'day9', day:9, city:'Niseko', date:'16 ก.พ. 2027',
    weather:wx('❄️','−8°','รู้สึกเหมือน −14°','หิมะหนัก 90% · ลม 22 km/h','🎿 พาวเดอร์สโนว์วันนี้ดีที่สุดของทริป จองคอร์สล่วงหน้า',
      periods(['−11°','❄️ 90%'],['−8°','❄️ 90%'],['−14°','💨 ลมแรง'])),
    activities:[
      { id:'niseko', time:'09:00', name:'Niseko Grand Hirafu', detail:'ลานสกีพาวเดอร์สโนว์ระดับโลก', tag:'สถานที่หลัก', cost:'¥ 28,000', bills:'2 บิล', image:`${ART}act_kurodake.png` },
      { id:'niseko-lesson', time:'13:00', name:'คอร์สสกีสำหรับเด็ก', detail:'ครูสอนภาษาอังกฤษ 2 ชั่วโมง', tag:'กิจกรรมย่อย', cost:'¥ 12,000', bills:'1 บิล', image:`${ART}st_suitcase.png` }
    ]
  },
  {
    id:'day10', day:10, city:'Otaru', date:'17 ก.พ. 2027',
    weather:wx('🌤️','−3°','รู้สึกเหมือน −7°','เมฆบาง · ลม 9 km/h','🕯️ คลองโอตารุสวยที่สุดหลังไฟเปิด ราว 17:00',
      periods(['−6°','🌤️ 10%'],['−3°','🌤️ 20%'],['−7°','🌙 ใส'], 2)),
    activities:[
      { id:'otaru-canal', time:'10:00', name:'คลองโอตารุ', detail:'โกดังอิฐเก่าและตะเกียงแก๊สริมคลอง', tag:'สถานที่หลัก', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}st_tokyo_city.png` },
      { id:'otaru-sushi', time:'12:30', name:'ถนนซูชิโอตารุ', detail:'ซูชิหอยเชลล์และเม่นทะเลสด', tag:'อาหาร', cost:'¥ 16,000', bills:'2 บิล', image:`${ART}ic_ramen.png` },
      { id:'otaru-glass', time:'15:00', name:'เวิร์กชอปเป่าแก้ว', detail:'ทำของที่ระลึกเอง · ใช้เวลา 40 นาที', tag:'กิจกรรมย่อย', cost:'¥ 7,200', bills:'1 บิล', image:`${ART}ic_gift.png` }
    ]
  },
  {
    id:'day11', day:11, city:'Sapporo', date:'18 ก.พ. 2027',
    weather:wx('🌥️','−2°','รู้สึกเหมือน −5°','เมฆมาก · ลม 11 km/h','🛍️ วันช้อปปิ้งสุดท้าย เผื่อน้ำหนักกระเป๋าไว้ด้วย',
      periods(['−5°','🌥️ 20%'],['−2°','🌥️ 30%'],['−6°','🌨️ 40%'])),
    activities:[
      { id:'sapporo-clock', time:'10:00', name:'หอนาฬิกาซัปโปโร', detail:'แลนด์มาร์กไม้สไตล์อเมริกัน', tag:'สถานที่หลัก', cost:'¥ 800', bills:'1 บิล', image:`${ART}st_tokyo_city.png` },
      { id:'sapporo-market', time:'13:00', name:'ตลาดนิโจ', detail:'ปูขนและของฝากทะเล', tag:'กิจกรรมย่อย', cost:'¥ 14,500', bills:'2 บิล', image:`${ART}ic_gift.png` },
      { id:'sapporo-ramen', time:'19:00', name:'ตรอกราเมนซัปโปโร', detail:'มิโสะราเมนต้นตำรับ', tag:'อาหาร', cost:'¥ 5,400', bills:'1 บิล', image:`${ART}ic_ramen.png` }
    ]
  },
  {
    id:'day12', day:12, city:'Chitose Airport', date:'19 ก.พ. 2027',
    weather:wx('☁️','−4°','รู้สึกเหมือน −8°','เมฆเต็มฟ้า · ลม 13 km/h','✈️ เช็กสถานะเที่ยวบินก่อนออกจากที่พัก หิมะอาจทำให้ดีเลย์',
      periods(['−6°','☁️ 30%'],['−4°','☁️ 30%'],['−8°','🌨️ 50%'], 0)),
    activities:[
      { id:'return-car', time:'09:30', name:'คืนรถเช่า', detail:'เติมน้ำมันก่อนคืน · เผื่อเวลา 40 นาที', tag:'การเดินทาง', cost:'¥ 4,200', bills:'1 บิล', image:`${ART}ic_train.png` },
      { id:'chitose-shop', time:'11:00', name:'ช้อปปิ้งในสนามบิน', detail:'Royce, LeTAO และของฝากนาทีสุดท้าย', tag:'ช้อปปิ้ง', cost:'¥ 9,800', bills:'1 บิล', image:`${ART}ic_gift.png` },
      { id:'flight-home', time:'14:40', name:'เที่ยวบินกลับ', detail:'เช็กอินล่วงหน้า 2 ชั่วโมง', tag:'การเดินทาง', cost:'—', bills:'ยังไม่มีบิล', image:`${ART}st_suitcase.png` }
    ]
  }
];
let activePlanDayId = 'day3';
let selectedActivityId = null;
let draggedActivityId = null;

/* ── อยู่วันเดิมหลังบันทึก (North 2026-09-07) ───────────────────────────
   ทุกการบันทึกจบด้วย refreshFromServer() ซึ่งสร้าง planDays ใหม่ทั้งชุด
   ถ้าไม่จำอะไรไว้เลย จอจะเด้งกลับวันแรกทุกครั้ง

   สองกรณีที่ "วันเดิม" ไม่ใช่วันเดิมตรง ๆ จึงต้องมีตัวใบ้:
   · ย้ายวัน 19 → 25 ธ.ค. — id เดิม (stop-day-2026-12-19) หายไปจากชุดใหม่
     ต้องตามไปวันที่ปลายทาง ไม่ใช่ตกกลับวันแรก
   · เพิ่มสถานที่ลงวันอื่นจากฟอร์ม — ควรไปยืนที่วันที่เพิ่งเพิ่มของเข้าไป
   ตัวใบ้ใช้ครั้งเดียวแล้วล้างทิ้ง เพื่อไม่ให้ค้างไปมีผลกับ refresh รอบถัดไป */
let planFocusDate = '';
const focusPlanDate = date => { planFocusDate = String(date || ''); };
const takePlanFocusDate = () => { const date = planFocusDate; planFocusDate = ''; return date; };

/* วันที่ขอไว้หายไปเลย (เช่นเพิ่งลบวันนั้นทิ้ง) ให้ไปวันที่ใกล้เคียงที่สุด
   ดีกว่าโยนกลับวันแรกซึ่งอาจห่างจากที่กำลังดูอยู่เป็นสัปดาห์ */
function pickPlanDayId(wantedDate) {
  if (!planDays.length) return activePlanDayId;
  if (!wantedDate) return planDays[0].id;
  const exact = planDays.find(day => day.date === wantedDate);
  if (exact) return exact.id;
  const want = Date.parse(wantedDate);
  if (Number.isNaN(want)) return planDays[0].id;
  let best = planDays[0];
  let bestGap = Infinity;
  planDays.forEach(day => {
    const gap = Math.abs(Date.parse(day.date) - want);
    if (!Number.isNaN(gap) && gap < bestGap) { bestGap = gap; best = day; }
  });
  return best.id;
}

function activePlanDay() {
  return planDays.find(day => day.id === activePlanDayId);
}

function showPrototypeToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showPrototypeToast.timer);
  showPrototypeToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ── ระยะ/เวลาขับจริงระหว่างจุด (OSRM ผ่าน backend · 2026-08-20) ────────
   ระยะเส้นตรงใช้แทนไม่ได้ ถนนในฮอกไกโดอ้อมภูเขา ขับจริงไกลกว่า 20–40%
   เซิร์ฟเวอร์แคชผลให้แล้ว ฝั่งนี้จึงโหลดครั้งเดียวต่อการเปิดหน้า */
let tripLegs = new Map();
let legsLoaded = false;

async function loadTripLegs() {
  if (!liveMode || legsLoaded) return;
  legsLoaded = true;               // ตั้งก่อนยิง กัน renderPlanWorkspace เรียกซ้ำระหว่างรอ
  try {
    const result = await TripApi.routeLegs();
    tripLegs = new Map((result.legs || []).map(leg => [`${leg.from_stop_id}>${leg.to_stop_id}`, leg]));
    renderPlanWorkspace();
  } catch (error) {
    console.error('route legs failed', error);   // ไม่มีเส้นทางก็ยังดูแผนได้ ไม่ต้องขึ้น error ให้ตกใจ
  }
}

const showDriveMinutes = seconds => {
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins} นาที` : `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
};

/* ระยะเวลาที่อยู่จุดนั้น จาก time → end_time · ว่างถ้าไม่ได้ระบุเวลาจบ */
function stayLength(activity) {
  const toMin = toMinutes;   // ใช้ตัวกลาง อย่าลอกซ้ำ
  const start = toMin(activity.time);
  const end = toMin(activity.endTime);
  if (start === null || end === null || end <= start) return '';
  const mins = end - start;
  return mins < 60 ? `${mins} นาที` : mins % 60 ? `${Math.floor(mins / 60)} ชม. ${mins % 60} น.` : `${mins / 60} ชม.`;
}

/* งบที่ตั้งไว้ กับ ยอดที่จ่ายจริงที่จุดนี้ (จากบิลที่ผูก stop_id ไว้)
   ⚠️ ถ้าบิลของจุดนี้มีหลายสกุล จะรวมเป็นบาทแทน เพราะบวกข้ามสกุลตรง ๆ ไม่ได้
      และต้องเขียนสัญลักษณ์ให้ตรงกับสกุลที่รวมจริง ไม่ใช่ยืมสัญลักษณ์ของงบมาใช้ */
function stopMoneyTags(activity) {
  const tags = [];
  const planned = activity.plannedCost;
  const plannedCur = activity.plannedCurrency || '';
  if (planned != null) {
    tags.push(`<em class="money">งบ ${symbolFor(plannedCur)}${fmtAmount(planned)}</em>`);
  }

  const mine = bills.filter(bill => canSee(bill) && bill.activityId === activity.id);
  if (!mine.length) return tags;

  const currencies = [...new Set(mine.map(bill => bill.currency))];
  const sameCurrency = currencies.length === 1 && (!plannedCur || currencies[0] === plannedCur);
  const spent = sameCurrency
    ? mine.reduce((sum, bill) => sum + (bill.amount || 0), 0)
    : mine.reduce((sum, bill) => sum + billBaht(bill), 0);
  const symbol = sameCurrency ? symbolFor(currencies[0]) : '฿';
  const over = planned != null && sameCurrency && spent > planned;
  tags.push(`<em class="${over ? 'over' : 'money'}">ใช้ ${symbol}${fmtAmount(spent)}${over ? ' · เกินงบ' : ''}</em>`);
  return tags;
}

/* ── ป้ายเตือนต่อจุด (2026-08-22) ─────────────────────────────────────
   ข้อมูลพวกนี้มีค่าตอน "วางแผน" ไม่ใช่ตอนอ่านย้อนหลัง จึงต้องเตือนตั้งแต่บนจอ
   ไม่ใช่รอให้ไปเจอเองหน้าประตูที่ปิดอยู่ */
const WEEKDAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

/* วันถัดจากวันสุดท้ายของแผน — ใช้ทั้งบนปุ่ม "เพิ่มวัน" และตอนกดจริง
   ต้องเป็นตัวเดียวกัน ไม่งั้นปุ่มเขียนวันหนึ่งแต่ฟอร์มเปิดอีกวันหนึ่ง */
/* 🔴 day.date มีได้สองรูปแบบ และนี่เคยทำให้ทั้งหน้าตายมาแล้ว:
      · โหมดข้อมูลจริง = ISO ('2027-02-08') — บวกวันได้
      · ข้อมูลตัวอย่าง = ข้อความไทย ('8 ก.พ. 2027') — บวกวันไม่ได้
   ของเดิมยัด `${last}T12:00:00` เข้า new Date() ตรง ๆ พอเจอข้อความไทยจะได้
   Invalid Date แล้ว .toISOString() โยน RangeError ทันที · เพราะฟังก์ชันนี้ถูกเรียก
   ตอนวาดปุ่ม "＋ เพิ่มวัน" ซึ่งอยู่ในการวาดรอบแรกสุด ทุกอย่างที่เขียนไว้หลังจากนั้น
   จึงไม่ทำงานเลย (renderBills กับ renderJourneyPreview ตายเงียบ ๆ ทั้งคู่)
   ตรวจว่าเป็น ISO จริงก่อนเสมอ ห้ามเชื่อว่า "มีค่า = ใช้ได้" */
function nextPlanDate() {
  const today = () => new Date().toISOString().slice(0, 10);
  const last = planDays[planDays.length - 1]?.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last || '')) return today();
  const next = new Date(new Date(`${last}T12:00:00`).getTime() + 86400000);
  return Number.isNaN(next.getTime()) ? today() : next.toISOString().slice(0, 10);
}
const nextDayLabel = () => thaiDate(nextPlanDate()) || 'วันถัดไป';
/* ป้ายของ "วัน" ที่ใช้ร่วมกันทุกที่ที่ให้เลือกวัน (2026-09-07)
   🔴 วันที่จริงมาก่อน เลข Day เป็นตัวรอง — North: "ให้ระบุด้วยว่าเป็นวันที่เท่าไร
      แทน Day 1 Day 2" · "Day 03" ลอย ๆ ไม่ได้บอกว่าคือวันไหน ต้องไปเทียบเอง */
const dayOptionLabel = day => {
  const date = thaiDate(day?.date);
  const num = `Day ${String(day?.day ?? 1).padStart(2, '0')}`;
  const where = day?.city && day.city !== '—' ? ` · ${day.city}` : '';
  return date ? `${date} · ${num}${where}` : `${num}${where}`;
};
/* แปลง 'HH:MM' เป็นจำนวนนาทีจากเที่ยงคืน · คืน null ถ้าไม่ได้ระบุเวลา

   🔴 ต้องเช็ค /^\d{1,2}:\d{2}$/ ก่อน ห้ามพึ่ง Number.isFinite อย่างเดียว
   เพราะ `Number('')` คืน 0 ซึ่งผ่าน isFinite → ช่องเวลาที่เว้นว่างจะกลายเป็น
   00:00 แล้วระบบอ่านว่า "ปิดตอนเที่ยงคืน" → ทุกจุดขึ้นป้าย "ปิดแล้ว"
   (หลุดขึ้น production มาแล้ว 2026-08-22 · เป็นกับดักเดียวกับ closed_days) */
const toMinutes = value => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return null;
  const [h, m] = text.split(':').map(Number);
  return h > 23 || m > 59 ? null : h * 60 + m;
};

function stopWarnings(activity, dayDate, weather) {
  const warnings = [];
  const at = toMinutes(activity.time);

  /* ปิดวันนั้นทั้งวัน — เรื่องใหญ่สุด ขับไปถึงแล้วเข้าไม่ได้เลย
     ⚠️ getDay() ของ Date ที่สร้างจาก 'YYYY-MM-DD' อ่านเป็น UTC
        ต้องต่อเวลาเข้าไปให้เป็นเวลาท้องถิ่น ไม่งั้นวันเพี้ยนไปหนึ่งวันในโซนไทย */
  if (dayDate && activity.closedDays?.length) {
    const weekday = new Date(`${dayDate}T12:00:00`).getDay();
    if (activity.closedDays.includes(weekday)) {
      warnings.push({ text: `ปิดวัน${WEEKDAY_TH[weekday]}`, level: 'stop' });
    }
  }

  // ไปถึงก่อนเปิด หรือ ไปถึงหลังปิด
  const open = toMinutes(activity.openTime);
  const close = toMinutes(activity.closeTime);
  if (at !== null && open !== null && at < open) {
    warnings.push({ text: `ยังไม่เปิด · เปิด ${activity.openTime}`, level: 'warn' });
  }
  if (at !== null && close !== null && at >= close) {
    warnings.push({ text: `ปิดแล้ว · ปิด ${activity.closeTime}`, level: 'stop' });
  }

  /* มืดแล้ว — ฮอกไกโดกลางธันวาคมพระอาทิตย์ตกราว 16:00
     เตือนเฉพาะจุดที่เป็นวิว/กลางแจ้ง ไม่ใช่ร้านอาหารหรือที่พัก
     (ที่พักตอนมืดเป็นเรื่องปกติ เตือนไปก็เป็นเสียงรบกวน) */
  const sunset = toMinutes(weather?.sunset);
  const outdoor = /วิว|ชม|ถ่ายรูป|ทะเลสาบ|ภูเขา|น้ำตก|สะพาน|สวน|ทุ่ง/.test(`${activity.name} ${activity.detail} ${activity.highlight}`);
  if (at !== null && sunset !== null && at >= sunset && outdoor && activity.tag !== 'ที่พัก') {
    warnings.push({ text: `มืดแล้ว · ตะวันตก ${weather.sunset}`, level: 'warn' });
  }
  return warnings;
}

/* ── ป้ายการจองบนการ์ด (North 2026-09-15) ──────────────────────────────
   เลขจอง · จ่ายแล้ว/ยังไม่จ่าย · ยกเลิกฟรีถึง (เตือนสีเมื่อเหลือ ≤ 3 วัน) · บริการที่รวม
   สำรอง = การ์ดเส้นประจาง + ริบบิ้น (ให้เห็นว่ายังไม่ตัดสินใจ) · ยกเลิก = ขีดฆ่า */
const daysBetween = (a, b) => {
  const d1 = new Date(`${a}T00:00:00`), d2 = new Date(`${b}T00:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  return Math.round((d2 - d1) / 86400000);
};
// วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC) — เที่ยงคืนไทยต้องนับเป็นวันใหม่แล้ว
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const AMEN_ICON = { inc_breakfast: '🍳', inc_lunch: '🍱', inc_dinner: '🍽️', has_parking: '🅿️', has_laundry: '🧺' };
const amenityChip = booking => {
  const icons = Object.keys(AMEN_ICON).filter(key => booking?.[key] === 1).map(key => AMEN_ICON[key]).join('');
  return icons ? `<em class="amen" title="บริการที่รวม">${icons}</em>` : '';
};
const PAY_LABEL = { PAID: 'จ่ายแล้ว', UNPAID: 'ยังไม่จ่าย', PAY_AT_VENUE: 'จ่ายหน้างาน' };
const bookingNights = booking => {
  if (!booking?.check_in || !booking?.check_out) return 0;
  const n = Math.round((new Date(`${booking.check_out}T00:00:00`) - new Date(`${booking.check_in}T00:00:00`)) / 86400000);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const daysUntil = iso => (iso ? daysBetween(todayISO(), iso) : null);

function bookingTags(activity) {
  const b = activity.booking;
  if (!b) return [];
  const tags = [];
  if (b.vendor || b.ref_no) tags.push(`<em class="ref">${b.vendor || ''}${b.ref_no ? ` #${b.ref_no}` : ''}</em>`);
  if (b.kind === 'HOTEL') {
    const nights = bookingNights(b);
    if (nights > 1) tags.push(`<em class="stay">${nights} คืน → ${thaiDateShort(b.check_out)}</em>`);
    const room = [b.room_desc, b.view_desc && `${b.view_desc} view`, b.size_sqm && `${b.size_sqm} ตรม.`].filter(Boolean).join(' · ');
    if (room) tags.push(`<em class="room">🛏 ${room}</em>`);
  } else if (b.depart_from || b.arrive_to) {
    tags.push(`<em class="room">${b.depart_from || '?'} → ${b.arrive_to || '?'}${b.arrive_time ? ` · ถึง ${b.arrive_time}` : ''}</em>`);
  }
  if (b.travelers) tags.push(`<em>👥 ${b.travelers}</em>`);
  if (b.status === 'CANCELLED') tags.push('<em class="over">ยกเลิกแล้ว</em>');
  else {
    tags.push(`<em class="${b.pay_status === 'PAID' ? 'paid' : b.pay_status === 'PAY_AT_VENUE' ? 'venue' : 'due'}">${
      b.pay_status === 'PAID' ? '✓ ' : ''}${PAY_LABEL[b.pay_status] || b.pay_status}${b.pay_date ? ` ${thaiDateShort(b.pay_date)}` : ''}${b.pay_method ? ` · ${b.pay_method}` : ''}</em>`);
    if (b.cancel_deadline) {
      const left = daysUntil(b.cancel_deadline);
      tags.push(`<em class="${left != null && left <= 3 ? 'over' : 'cancel'}">ยกเลิกฟรีถึง ${thaiDateShort(b.cancel_deadline)}${
        left != null && left >= 0 && left <= 7 ? ` · อีก ${left} วัน` : left != null && left < 0 ? ' · หมดเขตแล้ว' : ''}</em>`);
    }
  }
  const amen = amenityChip(b);
  if (amen) tags.push(amen);
  return tags;
}
const bookingCardClass = activity => activity.booking?.status === 'BACKUP' ? 'booking-backup'
  : activity.booking?.status === 'CANCELLED' ? 'booking-cancelled' : '';

/* ที่พักของวันอื่นที่ยังพักอยู่ในวันนี้ (check_in < วันนี้ < check_out) */
function carriedStays(date) {
  if (!date) return [];
  const rows = [];
  planDays.forEach(day => day.activities.forEach(activity => {
    const b = activity.booking;
    if (!b || b.kind !== 'HOTEL' || b.status === 'CANCELLED' || activity.visitStatus === 'SKIPPED') return;
    const checkIn = b.check_in || day.date;
    if (!b.check_out || !(checkIn < date && date < b.check_out)) return;
    const nights = bookingNights({ check_in: checkIn, check_out: b.check_out });
    const night = Math.round((new Date(`${date}T00:00:00`) - new Date(`${checkIn}T00:00:00`)) / 86400000) + 1;
    rows.push({ activity, day, night, nights });
  }));
  return rows;
}

/* ทุกการจองในทริป พร้อมวันที่/จุดแวะ — ใช้ทั้งแถบเตือน สรุป และหน้าพิมพ์ */
const allBookings = () => planDays.flatMap(day => day.activities
  .filter(act => act.booking)
  .map(act => ({ activity: act, day, booking: act.booking })));

/* แถบเตือนบนสุด: เส้นตายยกเลิกฟรีที่ใกล้ที่สุด (รวมของสำรอง — ต้องตัดสินใจก่อนหมดเขต)
   โชว์เมื่อเหลือ ≤ 14 วัน หรือเลยมาไม่เกิน 3 วัน · แตะแล้วกระโดดไปการ์ดนั้น */
function renderBookingAlert() {
  const el = $('#bookingAlert');
  if (!el) return;
  const candidates = allBookings()
    .filter(({ booking }) => booking.cancel_deadline && booking.status !== 'CANCELLED')
    .map(row => ({ ...row, left: daysUntil(row.booking.cancel_deadline) }))
    .filter(row => row.left != null && row.left >= -3 && row.left <= 14)
    .sort((a, b) => a.left - b.left);
  const hit = candidates[0];
  el.hidden = !hit;
  if (!hit) return;
  el.dataset.day = hit.day.id;
  el.dataset.stop = hit.activity.id;
  el.className = `booking-alert ${hit.left <= 3 ? 'urgent' : ''}`;
  el.innerHTML = `⚠️ ยกเลิกฟรี <b>${hit.activity.name}</b>${hit.booking.status === 'BACKUP' ? ' (สำรอง)' : ''} หมดเขต ${thaiDateShort(hit.booking.cancel_deadline)}
    <small>${hit.left < 0 ? `เลยมา ${-hit.left} วัน` : hit.left === 0 ? 'วันนี้!' : `อีก ${hit.left} วัน`}${candidates.length > 1 ? ` · +${candidates.length - 1}` : ''}</small>`;
}

/* กล่องสรุปการจองทั้งทริป — นับเฉพาะ "ยืนยัน" (สำรองไม่รวม ยกเลิกไม่รวม)
   ยอดจองแยกตามสกุล เพราะบวกข้ามสกุลตรง ๆ ไม่ได้ */
function renderBookingSummary() {
  const el = $('#bookingSummary');
  if (!el) return;
  const rows = allBookings();
  el.hidden = !rows.length;
  if (!rows.length) return;
  const confirmed = rows.filter(r => r.booking.status === 'CONFIRMED');
  const nights = confirmed.filter(r => r.booking.kind === 'HOTEL').reduce((sum, r) => sum + (bookingNights(r.booking) || 1), 0);
  const flights = confirmed.filter(r => r.booking.kind === 'FLIGHT').length;
  const paid = confirmed.filter(r => r.booking.pay_status === 'PAID').length;
  const unpaid = confirmed.filter(r => r.booking.pay_status === 'UNPAID').length;
  const backup = rows.filter(r => r.booking.status === 'BACKUP').length;
  const totals = {};
  confirmed.forEach(r => {
    if (r.activity.plannedCost == null) return;
    const cur = r.activity.plannedCurrency || 'THB';
    totals[cur] = (totals[cur] || 0) + Number(r.activity.plannedCost);
  });
  const totalText = Object.entries(totals).map(([cur, sum]) => `${symbolFor(cur)}${fmtAmount(sum)}`).join(' + ') || '—';
  el.innerHTML = `
    <div class="bs-head"><b>🧾 การจองทั้งทริป</b><a class="soft-btn" href="print.html${location.search}" target="_blank" rel="noopener">🖨 พิมพ์แผน</a></div>
    <div class="bs-grid">
      <div><strong>${nights}</strong><small>คืน</small></div>
      <div><strong>${flights}</strong><small>ไฟลท์</small></div>
      <div><strong>${paid}/${confirmed.length}</strong><small>จ่ายแล้ว</small></div>
      <div class="wide"><strong>${totalText}</strong><small>ยอดจองที่ยืนยัน</small></div>
    </div>
    <div class="bs-chips">${unpaid ? `<em class="due">ค้างจ่าย ${unpaid}</em>` : ''}${backup ? `<em class="backup">สำรอง ${backup} · รอเลือก</em>` : ''}</div>`;
}

function renderPlanWorkspace() {
  const activeDay = activePlanDay();
  const activeCount = day => day.activities.filter(act => act.visitStatus !== 'SKIPPED').length;
  const skippedCount = day => day.activities.length - activeCount(day);
  const plannedActivities = activeDay.activities.filter(act => act.visitStatus !== 'SKIPPED');
  /* แถบวัน — "Day 01 / 4 จุด · 24 Jul" ตาม mockup
     วันที่แบบสั้น (24 Jul) อ่านเร็วกว่าชื่อเมือง เวลาสลับวันไปมาระหว่างทริป */
  const shortDate = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()]}`;
  };
  const canEditDays = !financeLocked('plan');
  $('#planDayTabs').innerHTML = planDays.map(day => `
    <button class="${day.id === activePlanDayId ? 'active' : ''}" data-plan-day="${day.id}">
      <b>Day ${String(day.day).padStart(2, '0')}</b>
      <small>${activeCount(day)} จุด${skippedCount(day) ? ` · ข้าม ${skippedCount(day)}` : ''} · ${shortDate(day.date)}</small>
      ${day.title ? `<em class="day-tab-title">${day.title}</em>` : ''}
      ${canEditDays ? `<span class="day-tab-edit" data-edit-day="${day.id}" role="button" tabindex="0"
        title="แก้ไขหรือลบวันนี้" aria-label="แก้ไข Day ${String(day.day).padStart(2, '0')}">✏️</span>` : ''}
    </button>`).join('')
    + `<button class="add-day" id="addPlanDay"><b>＋ เพิ่มวัน</b><small>${nextDayLabel()}</small></button>`;

  /* ระยะทางรวมของวัน — บอกได้ทันทีว่าวันนี้แน่นเกินไปไหม ก่อนจะไปเจอเองตอนอยู่บนรถ
     รวมเฉพาะช่วงที่รู้พิกัดสองฝั่ง จึงเป็น "อย่างน้อยเท่านี้" ไม่ใช่ยอดครบ
     ถ้าเขียนเป็นยอดครบทั้งที่ข้ามบางจุดไป คนจะวางแผนเวลาโดยอิงเลขที่ต่ำกว่าจริง */
  const dayTotalKm = plannedActivities.reduce((sum, act, index) => {
    const prev = plannedActivities[index - 1];
    return sum + (index && hasCoords(prev) && hasCoords(act) ? straightKm(prev, act) : 0);
  }, 0);
  const anyGap = plannedActivities.some((act, index) => index && !(hasCoords(plannedActivities[index - 1]) && hasCoords(act)));
  const dayRoute = plannedActivities.map(activity => activity.name).join(' › ');
  const firstTime = plannedActivities.find(activity => activity.time)?.time || '—';
  const lastTime = [...plannedActivities].reverse().find(activity => activity.time)?.time || '—';

  /* ชิปสรุปวัน — จุด / ช่วงเวลา / ระยะขับ / อากาศ / เอกสาร
     ระยะขับใช้ค่าจาก OSRM ถ้ามีครบทุกช่วง ถ้าไม่ครบใช้เส้นตรงแล้ว **เขียนกำกับ**
     🔴 ห้ามเอาสองแบบมาปนกันโดยไม่บอก คนใช้ตัวเลขนี้กะเวลาออกเดินทาง */
  const legFor = (a, b) => tripLegs.get(`${a.id}>${b.id}`);
  const dayLegs = plannedActivities.slice(1).map((act, i) => legFor(plannedActivities[i], act));
  const haveAllLegs = dayLegs.length > 0 && dayLegs.every(Boolean);
  const driveMeters = haveAllLegs ? dayLegs.reduce((sum, leg) => sum + leg.meters, 0) : 0;
  const driveSeconds = haveAllLegs ? dayLegs.reduce((sum, leg) => sum + leg.seconds, 0) : 0;
  const estimated = haveAllLegs && dayLegs.some(leg => leg.source !== 'osrm');

  const docCount = plannedActivities.reduce((sum, act) => sum + docsForStop(act.id).length, 0);
  const wx = weatherCache.get(activeDay.date);

  const chips = [
    `<span>📍 ${activeCount(activeDay)} stops</span>`,
    firstTime !== '—' ? `<span>🕘 ${firstTime}–${lastTime}</span>` : '',
    haveAllLegs
      ? `<span${estimated ? ' class="warn"' : ''}>🚗 ${showKm(driveMeters / 1000)} · ${showDriveMinutes(driveSeconds)}${estimated ? ' (ประมาณ)' : ''}</span>`
      : dayTotalKm > 0 ? `<span class="warn">🚗 ${showKm(dayTotalKm)} (วัดเส้นตรง)</span>` : '',
    wx?.available ? `<span>${wx.icon} ${wx.temp_max}°/${wx.temp_min}° · ${wx.text}${wx.kind === 'historical' ? ' (ปีก่อน)' : ''}</span>` : '',
    wx?.sunset ? `<span>🌇 ตะวันตก ${wx.sunset}</span>` : '',
    docCount ? `<span>📎 ${docCount} เอกสาร</span>` : '',
    skippedCount(activeDay) ? `<span class="warn">⊘ ข้ามแล้ว ${skippedCount(activeDay)}</span>` : ''
  ].filter(Boolean).join('');

  $('#planDayOverview').innerHTML = `
    <div class="plan-day-badge"><span>DAY</span><strong>${String(activeDay.day).padStart(2, '0')}</strong></div>
    <div class="plan-day-main">
      <h3>${activeDay.title || `แผน Day ${String(activeDay.day).padStart(2, '0')}`}</h3>
      <p class="plan-day-route">${dayRoute || 'ยังไม่มีเส้นทางในวันนี้'}</p>
      <div class="plan-day-chips">${chips}</div>
    </div>
    <button type="button" class="edit-day-btn" id="editDayTitle">✎ แก้ไขแผนวันนี้</button>`;

  if (!legsLoaded) loadTripLegs();   // โหลดครั้งเดียวต่อการเปิดหน้า แล้ววาดใหม่เอง

  /* ที่พักหลายคืนโผล่ทุกวันที่พัก (เงา · ไม่ใช่จุดแวะซ้ำ · แก้ที่วันเช็กอิน) */
  const ghostStays = carriedStays(activeDay.date).map(({ activity, night, nights, day }) => `
    <div class="plan-ghost" data-ghost-for="${activity.id}" data-ghost-day="${day.id}" title="แตะเพื่อไปวันเช็กอิน">
      <div class="plan-time"><b>🛏</b><small>คืนที่ ${night}/${nights}</small></div>
      <img src="${activity.image || `${ART}st_camera2.png`}" alt="">
      <div class="plan-place-copy"><b class="stop-name">${activity.name}</b>
        <small>พักต่อ · เช็กอิน ${thaiDateShort(activity.booking.check_in || day.date)} · เช็กเอาต์ ${thaiDateShort(activity.booking.check_out)}</small>
        <div class="plan-tags"><em class="stay">ที่พัก</em>${amenityChip(activity.booking)}</div>
      </div>
    </div>`).join('');
  renderBookingAlert();
  renderBookingSummary();

  $('#planList').innerHTML = ghostStays + (activeDay.activities.length ? activeDay.activities.map((activity, index) => {
    const prev = activeDay.activities[index - 1];
    /* ป้ายระหว่างจุด — เวลาขับจริงจาก OSRM ถ้ามี ไม่มีก็ถอยไประยะเส้นตรง
       และเขียนต่างกันให้ชัด ("ขับรถ 25 นาที" vs "ห่าง 18 กม. วัดเส้นตรง") */
    const cached = prev ? legFor(prev, activity) : null;
    let leg = '';
    if (cached) {
      leg = `<div class="leg-distance"><i>🚗</i><b>ขับรถ ${showDriveMinutes(cached.seconds)} · ${showKm(cached.meters / 1000)}</b>${
        cached.source === 'osrm' ? '' : '<u>(ประมาณ)</u>'}</div>`;
    } else if (prev && hasCoords(prev) && hasCoords(activity)) {
      leg = `<div class="leg-distance"><i>📏</i><b>ห่าง ${showKm(straightKm(prev, activity))}</b><u>(วัดเส้นตรง)</u></div>`;
    }

    const docs = docsForStop(activity.id);
    const warns = stopWarnings(activity, activeDay.date, wx).map(warn =>
      `<em class="${warn.level === 'stop' ? 'over' : 'weather'}">⚠️ ${warn.text}</em>`);
    const hours = activity.openTime && activity.closeTime
      ? `<em>🕘 ${activity.openTime}–${activity.closeTime}</em>` : '';
    /* mapcode เป็นตัวเลขที่ต้องพิมพ์ใส่ GPS ตอนอยู่ในรถ — ต้องกดคัดลอกได้ในคลิกเดียว
       ไม่ใช่ให้เพ่งจอแล้วพิมพ์ตามทีละหลักตอนรถกำลังจะออก */
    const mapcode = activity.mapcode
      ? `<em class="mapcode" data-mapcode="${activity.mapcode}" title="แตะเพื่อคัดลอก">🚗 ${activity.mapcode}</em>` : '';

    const tags = [
      ...warns,
      hours,
      mapcode,
      index === 0 && activity.visitStatus !== 'SKIPPED' ? '<em class="start">จุดเริ่มต้น</em>' : '',
      activity.tag === 'ที่พัก' ? '<em class="stay">ที่พัก</em>' : '',
      activity.highlight ? `<em class="star">✨ ${activity.highlight}</em>` : '',
      ...stopMoneyTags(activity),
      ...bookingTags(activity),
      ...docs.slice(0, 2).map(doc => `<em class="doc">📎 ${doc.name}</em>`),
      docs.length > 2 ? `<em class="doc">+${docs.length - 2}</em>` : '',
      activity.visitStatus === 'SKIPPED'
        ? `<em>ไม่ได้ไป${activity.skippedReason ? ` · ${activity.skippedReason}` : ''}</em>` : ''
    ].filter(Boolean).join('');

    const stay = stayLength(activity);
    return `${leg}
    <article class="plan-item ${activity.id === selectedActivityId ? 'selected' : ''} ${activity.visitStatus === 'SKIPPED' ? 'skipped' : ''} ${bookingCardClass(activity)}" draggable="${activity.visitStatus === 'SKIPPED' ? 'false' : 'true'}" data-activity="${activity.id}">
      <span class="drag" title="ลากเพื่อจัดลำดับ">⠿</span>
      <div class="plan-time"><b>${activity.time || '—'}</b><small>${stay || (activity.endTime ? `ถึง ${activity.endTime}` : '')}</small></div>
      <img src="${activity.image || `${ART}st_camera2.png`}" alt="">
      <div class="plan-place-copy"><b class="stop-name">${activity.name}</b><small>${activity.detail || 'ยังไม่มีรายละเอียด'}</small>${tags ? `<div class="plan-tags">${tags}</div>` : ''}</div>
      <div class="plan-actions" role="group" aria-label="จัดการ ${activity.name}">
        <button type="button" class="edit-plan-item" data-edit="${activity.id}" title="แก้ไขข้อมูล" aria-label="แก้ไข ${activity.name}">✏️</button>
        <button type="button" class="skip-plan-item" data-skip="${activity.id}" title="${activity.visitStatus === 'SKIPPED' ? 'นำกลับเข้าแผน' : 'ข้ามสถานที่นี้'}" aria-label="${activity.visitStatus === 'SKIPPED' ? 'นำ ' + activity.name + ' กลับเข้าแผน' : 'ข้าม ' + activity.name}">${activity.visitStatus === 'SKIPPED' ? '↩️' : '🚫'}</button>
        <button type="button" data-move="up" title="เลื่อนขึ้น" aria-label="เลื่อน ${activity.name} ขึ้น" ${activity.visitStatus === 'SKIPPED' ? 'disabled' : ''}>▲</button>
        <button type="button" data-move="down" title="เลื่อนลง" aria-label="เลื่อน ${activity.name} ลง" ${activity.visitStatus === 'SKIPPED' ? 'disabled' : ''}>▼</button>
        ${/* 🔴 ย้ายไปวันอื่นต้องอยู่ "บนการ์ด" (North 2026-09-07)
              ความสามารถนี้มีมาก่อนแล้ว แต่ซ่อนอยู่ท้ายหน้าและต้องแตะการ์ดเพื่อ
              เลือกก่อนถึงจะกดได้ — สองจังหวะที่ไม่มีอะไรบนการ์ดบอกใบ้เลย
              คนจึงหาไม่เจอและคิดว่าย้ายวันไม่ได้ · ปุ่มที่มีอยู่แต่หาไม่เจอ
              เท่ากับไม่มี */''}
        <button type="button" class="moveday-plan-item" data-move-day-for="${activity.id}"
          title="ย้ายไปวันอื่น" aria-label="ย้าย ${activity.name} ไปวันอื่น"
          ${planDays.length < 2 ? 'disabled title="ทริปนี้มีวันเดียว"' : ''}>📅</button>
        <button type="button" class="delete-plan-item danger" data-delete="${activity.id}" title="ลบถาวร" aria-label="ลบ ${activity.name} ถาวร">🗑️</button>
      </div>
    </article>`;
  }).join('') : (ghostStays ? '' : `<div class="plan-empty">ยังไม่มีกิจกรรมในวันนี้</div>`));

  /* แผนสำรอง = จุดที่ถูกข้ามไว้ ยังเก็บไว้ในแผนเผื่อเปลี่ยนใจ */
  const backup = activeDay.activities.filter(act => act.visitStatus === 'SKIPPED');
  /* ปุ่มล่างกับปุ่มบนทำงานเหมือนกันทุกประการ (เพิ่มลงวันที่เปิดอยู่)
     มีสองที่เพราะแผนยาวเกินหนึ่งจอ — แต่ต้องเขียนวันกำกับ ไม่งั้นคนเข้าใจว่า
     "เพิ่ม Stop วันนี้" หมายถึงวันตามปฏิทินจริง ซึ่งไม่ใช่ */
  $('#addPlaceFoot').textContent = `＋ เพิ่มสถานที่ใน ${thaiDate(activeDay.date) || `Day ${String(activeDay.day).padStart(2, '0')}`}`;
  $('#planBackup').hidden = !backup.length;
  $('#planBackup').textContent = backup.length
    ? `💡 แผนสำรอง ${backup.length} จุด: ${backup.map(act => act.name).join(', ')}`
    : '';

  /* ── ย้ายจุดแวะข้ามวัน ────────────────────────────────────────────────
     เดิมบล็อกนี้โผล่เสมอ ทริปที่มีวันเดียวจึงเห็นกล่องเปล่าพร้อมป้ายลอย ๆ
     ว่า "ย้ายกิจกรรมที่เลือกไป" โดยไม่มีปุ่มอะไรเลย และไม่บอกว่าต้องทำยังไงก่อน
     ตอนนี้: ไม่มีวันปลายทาง = ซ่อนทั้งบล็อก · ยังไม่ได้เลือก = บอกวิธีเลือก */
  const otherDays = planDays.filter(day => day.id !== activePlanDayId);
  const picked = activeDay.activities.find(act => act.id === selectedActivityId);
  $('#crossDayMove').hidden = !otherDays.length;
  $('#crossDayLabel').textContent = picked
    ? `ย้าย "${picked.name}" ไปวัน`
    : 'แตะการ์ดสถานที่เพื่อเลือกก่อน แล้วเลือกวันปลายทาง';
  $('#moveDayTargets').innerHTML = otherDays.map(day => `
    <button data-move-day="${day.id}" ${picked ? '' : 'disabled'}>${dayOptionLabel(day)}</button>`).join('');
  bindPlanInteractions();
  $('#editDayTitle')?.addEventListener('click', editActiveDayTitle);
  scrollActiveDayTab();
  saveState();
}

async function editActiveDayTitle() {
  const day = activePlanDay();
  const value = window.prompt('ชื่อแผนประจำวันนี้ เช่น “เดินทางถึง Kushiro”', day.title || '');
  if (value === null) return;
  const title = value.trim();
  if (title.length > 100) return showPrototypeToast('ชื่อแผนยาวเกิน 100 ตัวอักษร');
  if (liveMode) {
    const ok = await submitLive(null, () => TripApi.saveDayTitle(day.date, title), title ? 'บันทึกชื่อแผนวันนี้แล้ว' : 'ล้างชื่อแผนวันนี้แล้ว');
    if (ok) showScreen('plan');
    return;
  }
  day.title = title;
  buildLiveJourney();
  renderJourneyPreview(planDays.indexOf(day));
  renderPlanWorkspace();
  showPrototypeToast(title ? 'บันทึกชื่อแผนวันนี้แล้ว' : 'ล้างชื่อแผนวันนี้แล้ว');
}

async function togglePlanStopSkipped(day, activity) {
  const restoringStop = activity.visitStatus === 'SKIPPED';
  const reason = restoringStop ? '' : (window.prompt('เหตุผลที่ข้าม Stop นี้ (เว้นว่างได้)', activity.skippedReason || '') ?? null);
  if (!restoringStop && reason === null) return;
  const nextStatus = restoringStop ? 'PLANNED' : 'SKIPPED';

  if (liveMode) {
    const ok = await submitLive(null, () => TripApi.saveStop({
      id:activity.id, dayDate:day.date, time:activity.time, endTime:activity.endTime, name:activity.name,
      detail:activity.detail, tag:activity.tag, icon:activity.image,
      visitStatus:nextStatus, skippedReason:reason || ''
    }), restoringStop ? `นำ ${activity.name} กลับเข้าแผนแล้ว` : `ข้าม ${activity.name} แล้ว`);
    if (ok) showScreen('plan');
    return;
  }

  activity.visitStatus = nextStatus;
  activity.skippedReason = nextStatus === 'SKIPPED' ? reason.trim() : '';
  renderPlanWorkspace();
  renderNextActivity();
  showPrototypeToast(restoringStop ? `นำ ${activity.name} กลับเข้าแผนแล้ว` : `ข้าม ${activity.name} แล้ว`);
}

async function deletePlanStop(day, activity) {
  const documentCount = docsForStop(activity.id).length;
  const linkedBills = bills.filter(bill => bill.activityId === activity.id).length;
  const links = [documentCount && `${documentCount} เอกสาร`, linkedBills && `${linkedBills} บิล`].filter(Boolean).join(' และ ');
  const warning = links
    ? `${activity.name} มี ${links} ผูกอยู่ ข้อมูลเหล่านั้นจะไม่ถูกลบ แต่จะไม่ผูกกับ Stop นี้อีก\n\nลบ Stop ถาวรหรือไม่?`
    : `ลบ ${activity.name} ออกจากทริปถาวรหรือไม่?`;
  if (!window.confirm(warning)) return;

  if (liveMode) {
    const ok = await submitLive(null, () => TripApi.removeStop(activity.id), `ลบ ${activity.name} แล้ว`);
    if (ok) showScreen('plan');
    return;
  }
  day.activities.splice(day.activities.indexOf(activity), 1);
  if (selectedActivityId === activity.id) selectedActivityId = null;
  renderPlanWorkspace();
  renderNextActivity();
  showPrototypeToast(`ลบ ${activity.name} แล้ว`);
}

function bindPlanInteractions() {
  /* แตะ mapcode = คัดลอก · ทำที่ระดับรายการทีเดียว ไม่ผูกทีละป้าย
     เพราะรายการถูกวาดใหม่ทุกครั้งที่แก้แผน handler รายตัวจะหลุดตามไปด้วย */
  $$('[data-mapcode]').forEach(tag => tag.addEventListener('click', event => {
    event.stopPropagation();          // ไม่ให้ไปโดนการเลือกจุดของการ์ด
    const code = tag.dataset.mapcode;
    navigator.clipboard?.writeText(code)
      .then(() => showPrototypeToast(`คัดลอก mapcode ${code} แล้ว`))
      .catch(() => showPrototypeToast(`mapcode: ${code}`));
  }));

  $$('[data-plan-day]').forEach(button => button.addEventListener('click', () => {
    activePlanDayId = button.dataset.planDay;
    selectedActivityId = null;
    renderPlanWorkspace();
  }));
  $$('.plan-ghost').forEach(ghost => ghost.addEventListener('click', () => {
    activePlanDayId = ghost.dataset.ghostDay;
    selectedActivityId = ghost.dataset.ghostFor;
    renderPlanWorkspace();
  }));
  $('#bookingAlert')?.addEventListener('click', () => {
    const target = $('#bookingAlert').dataset.day;
    if (target) { activePlanDayId = target; selectedActivityId = $('#bookingAlert').dataset.stop || null; renderPlanWorkspace(); }
  });

  /* 🔴 เพิ่มวัน = ฟอร์มของ "วัน" จริง ๆ แล้ว ไม่ใช่ฟอร์มเพิ่มสถานที่อีกต่อไป
     (North 2026-09-07: "เพิ่มวัน เพิ่มสถานที่ ต่างกันอย่างไร · ถ้าเพิ่มวันเฉย ๆ
      ให้ลบการตั้งค่าในส่วนอื่นออก")
     เดิมสองปุ่มนี้เปิดฟอร์มเดียวกัน ต่างแค่ตั้งวันให้ล่วงหน้า — คนจึงแยกไม่ออก
     ว่าต่างกันตรงไหน และถูกบังคับกรอกชื่อสถานที่ทั้งที่แค่อยากเพิ่มวัน */
  $('#addPlanDay')?.addEventListener('click', () => openDayDialog());

  // แก้ไข/ลบวัน — ปุ่มดินสอเล็กบนแท็บวัน
  $$('[data-edit-day]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();          // ไม่ให้ไปโดนปุ่มสลับวันที่ครอบอยู่
    openDayDialog(planDays.find(day => day.id === button.dataset.editDay));
  }));

  $$('.plan-item').forEach(item => {
    item.addEventListener('click', event => {
      const control = event.target.closest('[data-move]');
      const edit = event.target.closest('[data-edit]');
      const skip = event.target.closest('[data-skip]');
      const remove = event.target.closest('[data-delete]');
      const day = activePlanDay();
      const index = day.activities.findIndex(activity => activity.id === item.dataset.activity);
      if (edit) {
        openPlanEditor(day.activities[index]);
        return;
      }
      if (skip) {
        togglePlanStopSkipped(day, day.activities[index]);
        return;
      }
      if (remove) {
        deletePlanStop(day, day.activities[index]);
        return;
      }
      if (control) {
        const nextIndex = control.dataset.move === 'up' ? index - 1 : index + 1;
        if (nextIndex >= 0 && nextIndex < day.activities.length) {
          [day.activities[index], day.activities[nextIndex]] = [day.activities[nextIndex], day.activities[index]];
          showPrototypeToast(`สลับลำดับ ${day.activities[nextIndex].name} แล้ว`);
          renderPlanWorkspace();
          if (liveMode) pushPlanOrderLive();
        }
        return;
      }
      /* แตะแถบปุ่มจัดการไม่ใช่การ "เลือก Stop เพื่อย้ายวัน"
         (ปุ่มที่ปิดใช้งานอยู่ก็ยังนับเป็นการแตะแถบนี้ ต้องกันไว้ด้วย) */
      if (event.target.closest('.plan-actions')) return;
      selectedActivityId = selectedActivityId === item.dataset.activity ? null : item.dataset.activity;
      renderPlanWorkspace();
    });
    item.addEventListener('dragstart', event => {
      draggedActivityId = item.dataset.activity;
      item.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.dataset.activity);
    });
    item.addEventListener('dragend', () => {
      draggedActivityId = null;
      item.classList.remove('dragging');
      $$('.plan-item').forEach(row => row.classList.remove('drop-before', 'drop-after'));
    });
    /* Reordering used to happen in dragover, which called renderPlanWorkspace()
       and destroyed the node mid-gesture — the drag died on the first move.
       dragover now only paints the drop indicator; the array is reordered once,
       on drop. */
    item.addEventListener('dragover', event => {
      if (!draggedActivityId || draggedActivityId === item.dataset.activity) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = item.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      item.classList.toggle('drop-before', before);
      item.classList.toggle('drop-after', !before);
    });
    item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
    item.addEventListener('drop', event => {
      event.preventDefault();
      const movingId = draggedActivityId || event.dataTransfer.getData('text/plain');
      if (!movingId || movingId === item.dataset.activity) return;
      const day = activePlanDay();
      const rect = item.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      const fromIndex = day.activities.findIndex(activity => activity.id === movingId);
      if (fromIndex < 0) return;
      const [moved] = day.activities.splice(fromIndex, 1);
      const targetIndex = day.activities.findIndex(activity => activity.id === item.dataset.activity);
      day.activities.splice(before ? targetIndex : targetIndex + 1, 0, moved);
      draggedActivityId = null;
      showPrototypeToast(`ย้าย ${moved.name} แล้ว`);
      renderPlanWorkspace();
      if (liveMode) pushPlanOrderLive();
    });
  });

  /* ปุ่ม 📅 บนการ์ด = เลือกสถานที่นี้แล้วพาไปที่แถบเลือกวันปลายทางให้เลย
     ใช้กลไกเดิมทั้งหมด ไม่เพิ่มสถานะใหม่ — แค่ทำให้ "หาเจอ" ซึ่งเป็นปัญหาจริง */
  $$('[data-move-day-for]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    if (blockedByClose('plan')) return;
    selectedActivityId = button.dataset.moveDayFor;
    renderPlanWorkspace();
    const box = $('#crossDayMove');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box?.classList.add('flash');
    setTimeout(() => box?.classList.remove('flash'), 1200);
  }));

  $$('[data-move-day]').forEach(button => button.addEventListener('click', () => {
    if (!selectedActivityId) return;
    const sourceDay = activePlanDay();
    const targetDay = planDays.find(day => day.id === button.dataset.moveDay);
    const sourceIndex = sourceDay.activities.findIndex(activity => activity.id === selectedActivityId);
    const [moved] = sourceDay.activities.splice(sourceIndex, 1);
    targetDay.activities.push(moved);
    selectedActivityId = null;
    showPrototypeToast(`ย้าย ${moved.name} ไป Day ${targetDay.day} แล้ว`);
    renderPlanWorkspace();
    if (liveMode) pushPlanOrderLive();
  }));
}

let editingActivityId = null;
let activityIcon = `${ART}st_camera2.png`;

/* Reopens the plan editor after the picker closes, so choosing an icon never
   loses what's already typed in the form. */
$('#pickActivityIcon').addEventListener('click', () => openAssetPicker('place', activityIcon, src => {
  activityIcon = src;
  $('#activityIconPreview').src = src;
  mask.classList.add('open');
  planEditor.classList.add('open');
  planEditor.setAttribute('aria-hidden', 'false');
}));

/* ── ช่องเลือกเวลาแบบเลื่อน (2026-08-22) ───────────────────────────────
   <input type="time"> บนคอมคือช่องพิมพ์ที่มีลูกศรจิ๋ว ๆ กดยาก และหน้าตา
   ต่างกันทุกเบราว์เซอร์ · เปลี่ยนเป็นสองแถบเลื่อน ชั่วโมง : นาที แทน
   นาทีทีละ 5 — แผนเที่ยวไม่มีใครนัดกัน 09:37 และตัวเลือกน้อยลงเลื่อนหาเร็วขึ้น

   ⚠️ ค่าที่คืนต้องเป็น 'HH:MM' เหมือน input เดิมเป๊ะ ๆ เพราะฝั่งเซิร์ฟเวอร์
      ตรวจด้วย HHMM regex และ toMinutes() ก็คาดรูปแบบนี้ */
const TIME_STEP = 5;

function buildTimePicker(wrap) {
  if (wrap.dataset.ready) return;
  const pad = n => String(n).padStart(2, '0');
  const blank = wrap.dataset.required ? '' : '<option value="">--</option>';
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${pad(h)}">${pad(h)}</option>`).join('');
  const mins = Array.from({ length: 60 / TIME_STEP }, (_, i) => pad(i * TIME_STEP))
    .map(m => `<option value="${m}">${m}</option>`).join('');
  wrap.innerHTML = `${blank ? `<select class="tp-h">${blank}${hours}</select>` : `<select class="tp-h">${hours}</select>`}`
    + `<b>:</b><select class="tp-m">${blank}${mins}</select>`;
  wrap.dataset.ready = '1';
}

/* อ่านค่า — คืน '' ถ้ายังไม่ได้เลือกครบทั้งสองแถบ (ถือว่ายังไม่ระบุเวลา) */
function timeValue(id) {
  const wrap = $(`#${id}`);
  if (!wrap) return '';
  const h = $('.tp-h', wrap)?.value || '';
  const m = $('.tp-m', wrap)?.value || '';
  return h && m ? `${h}:${m}` : '';
}

/* เขียนค่า — ปัดนาทีลงให้ตรงช่วง TIME_STEP ไม่งั้นค่าเดิมอย่าง 09:37
   จะไม่ตรงกับ option ไหนเลย แล้ว select จะเด้งกลับเป็นค่าแรกเงียบ ๆ */
function setTimeValue(id, value) {
  const wrap = $(`#${id}`);
  if (!wrap) return;
  buildTimePicker(wrap);
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) {
    $('.tp-h', wrap).value = wrap.dataset.required ? '09' : '';
    $('.tp-m', wrap).value = wrap.dataset.required ? '00' : '';
    return;
  }
  const h = String(Math.min(23, Number(match[1]))).padStart(2, '0');
  const m = String(Math.floor(Math.min(59, Number(match[2])) / TIME_STEP) * TIME_STEP).padStart(2, '0');
  $('.tp-h', wrap).value = h;
  $('.tp-m', wrap).value = m;
}

/* ── ฟอร์มของ "วัน" (2026-09-07) ───────────────────────────────────────
   มีแค่สองช่อง: วันที่ กับ ชื่อวัน — ตั้งใจไม่ให้มีช่องของสถานที่มาปน
   เพราะสองเรื่องนี้คนละระดับกัน (วัน = ภาชนะ · สถานที่ = ของข้างใน)

   🔴 "วัน" เพิ่งมีตัวตนของตัวเองในฐาน (TripDayPlans) — ก่อนหน้านี้เกิดจาก
      วันที่ของจุดแวะล้วน ๆ จึงเพิ่มวันเปล่าไม่ได้ แก้ไม่ได้ ลบไม่ได้ */
let editingDayDate = '';

function openDayDialog(day = null) {
  if (blockedByClose('plan')) return;
  closeLayers();
  editingDayDate = day?.date || '';
  const editing = Boolean(editingDayDate);
  const stops = day ? day.activities.length : 0;

  $('#dayDialogTitle').textContent = editing
    ? `แก้ไข Day ${String(day.day).padStart(2, '0')}`
    : 'เพิ่มวันในแผน';
  $('#dayDate').value = editing ? day.date : nextPlanDate();
  $('#dayTitle').value = editing ? (day.title || '') : '';
  $('#dayError').textContent = '';
  $('#daySubmit').textContent = editing ? 'บันทึกการแก้ไข' : 'เพิ่มวัน';

  /* ปุ่มลบโผล่เฉพาะตอนแก้ไข · และบอกไปเลยตั้งแต่ตอนนี้ว่าลบไม่ได้เพราะอะไร
     ดีกว่าให้กดแล้วค่อยเจอ error — North เลือกกติกา "ลบไม่ได้ถ้ายังมีสถานที่" */
  const del = $('#deleteDayBtn');
  del.hidden = !editing;
  del.disabled = stops > 0;
  del.title = stops > 0 ? `ลบไม่ได้ · ยังมีสถานที่อยู่ ${stops} จุด` : '';
  del.textContent = stops > 0 ? `ลบไม่ได้ · มี ${stops} สถานที่` : 'ลบวันนี้';

  mask.classList.add('open');
  $('#dayDialog').classList.add('open');
  $('#dayDialog').setAttribute('aria-hidden', 'false');
}

$$('[data-close-day]').forEach(button => button.addEventListener('click', closeLayers));

$('#dayForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const date = $('#dayDate').value;
  const title = $('#dayTitle').value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('#dayError').textContent = 'เลือกวันที่ก่อน'; return; }

  if (!liveMode) {
    $('#dayError').textContent = 'โหมดข้อมูลตัวอย่างยังเพิ่มวันไม่ได้ — เปิดด้วย ?live=1';
    return;
  }
  const editing = Boolean(editingDayDate);
  const moving = editing && date !== editingDayDate;
  /* เพิ่มวันใหม่ก็ดี ย้ายวันก็ดี ปลายทางคือวันที่ในช่องนี้เสมอ — ไปยืนที่นั่น */
  focusPlanDate(date);
  submitLive('#dayError',
    () => TripApi.saveDay({ date: editing ? editingDayDate : date, title, newDate: moving ? date : '' }),
    result => {
      if (!editing) return `เพิ่ม ${thaiDate(date)} ในแผนแล้ว`;
      if (moving) {
        const moved = result?.moved_stops || 0;
        return `ย้ายไป ${thaiDate(date)} แล้ว${moved ? ` · พาสถานที่ ${moved} จุดไปด้วย` : ''}`;
      }
      return `บันทึก ${thaiDate(date)} แล้ว`;
    })
    .then(() => showScreen('plan'));
});

$('#deleteDayBtn')?.addEventListener('click', () => {
  if (!editingDayDate) return;
  const day = planDays.find(row => row.date === editingDayDate);
  if (day?.activities.length) {
    // เผื่อสถานะบนจอไม่ทันของจริง — เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นอยู่แล้ว
    $('#dayError').textContent = `ลบไม่ได้ · ยังมีสถานที่อยู่ ${day.activities.length} จุด`;
    return;
  }
  if (!window.confirm(`ลบ ${thaiDate(editingDayDate)} ออกจากแผน?`)) return;
  submitLive('#dayError', () => TripApi.removeDay(editingDayDate),
    `ลบ ${thaiDate(editingDayDate)} ออกจากแผนแล้ว`)
    .then(() => showScreen('plan'));
});

/* ── สกุลเงินต่อจุด (North 2026-09-15) ─────────────────────────────────
   รายการ = สกุลที่เพิ่มไว้ในทริป + THB เสมอ (โรงแรมจองล่วงหน้าเป็นบาท)
   ค่าตั้งต้น = สกุลต่างประเทศตัวแรก เหมือนพฤติกรรมเดิมก่อนมีตัวเลือก */
function fillCurrencySelect(current) {
  const select = $('#activityCurrency');
  if (!select) return;
  const codes = [];
  tripCurrencies.forEach(c => { if (!codes.includes(c.code)) codes.push(c.code); });
  if (!codes.includes('THB')) codes.push('THB');
  if (current && !codes.includes(current)) codes.push(current);
  select.innerHTML = codes.map(code => `<option value="${code}">${code}</option>`).join('');
  select.value = current || tripCurrencies.find(c => !c.base)?.code || codes[0] || '';
}

/* ── ฟอร์มการจอง (North 2026-09-15 · จาก Trip.xlsx) ──────────────────────
   ค่าในฟอร์ม ↔ object แบบเดียวกับตาราง TripBookings (snake_case)
   ชนิด (kind) ตามประเภทของจุดแวะ: ที่พัก→HOTEL · การเดินทาง→FLIGHT · อื่น→TICKET
   ช่องที่โชว์เปลี่ยนตามชนิด: HOTEL = ห้อง/วิว/ตรม./ผู้เข้าพัก/บริการ · เดินทาง = จาก/ถึง/เวลาถึง */
const BOOKING_AMEN = ['inc_breakfast', 'inc_lunch', 'inc_dinner', 'has_parking', 'has_laundry'];
const kindForTag = tag => tag === 'ที่พัก' ? 'HOTEL' : tag === 'การเดินทาง' ? 'FLIGHT' : 'TICKET';
const isTravelKind = kind => kind === 'FLIGHT' || kind === 'TRANSPORT';

function syncBookingKindFields() {
  const kind = $('#bookingKind').value;
  const hotel = kind === 'HOTEL';
  const travel = isTravelKind(kind);
  $$('#bookingBox .bk-hotel').forEach(el => { el.hidden = !hotel; });
  $$('#bookingBox .bk-travel').forEach(el => { el.hidden = !travel; });
  $('#bookingVendorLabel').firstChild.textContent = travel ? 'สายการบิน / ผู้ให้บริการ' : 'ผู้ขาย';
  $('#bookingRefLabel').firstChild.textContent = kind === 'FLIGHT' ? 'เที่ยวบิน / เลขจอง' : 'เลขจอง';
  updateBookingHints();
}

function updateBookingHints() {
  const nights = daysBetween($('#bookingCheckIn').value, $('#bookingCheckOut').value);
  $('#bookingNights').textContent = nights == null ? '' : nights > 0 ? `${nights} คืน` : nights === 0 ? 'วันเดียวกัน' : 'ก่อนเช็กอิน!';
  const left = $('#bookingCancel').value ? daysBetween(todayISO(), $('#bookingCancel').value) : null;
  $('#bookingCancelHint').textContent = left == null ? '' : left < 0 ? `หมดเขตแล้ว ${-left} วัน` : left === 0 ? 'วันนี้วันสุดท้าย!' : `อีก ${left} วัน`;
  $('#bookingCancelHint').classList.toggle('warn', left != null && left <= 3);
  // บรรทัดสรุปตอนพับ — พอเห็นว่ามีอะไรอยู่ข้างในโดยไม่ต้องกาง
  const b = readBookingForm();
  const hint = $('#bookingHint');
  if (!b) { hint.textContent = 'ผู้ขาย · เลขจอง · เช็กเอาต์ · การจ่าย'; hint.classList.remove('has'); return; }
  const parts = [];
  if (b.vendor || b.ref_no) parts.push(`${b.vendor || ''}${b.ref_no ? ` #${b.ref_no}` : ''}`.trim());
  if (b.status === 'BACKUP') parts.push('สำรอง');
  if (b.status === 'CANCELLED') parts.push('ยกเลิกแล้ว');
  if (nights > 0) parts.push(`${nights} คืน`);
  parts.push(b.pay_status === 'PAID' ? 'จ่ายแล้ว' : b.pay_status === 'PAY_AT_VENUE' ? 'จ่ายหน้างาน' : 'ยังไม่จ่าย');
  hint.textContent = parts.join(' · ');
  hint.classList.add('has');
}

function setAmenState(button, state) {
  button.dataset.state = state;
  button.classList.toggle('yes', state === '1');
  button.classList.toggle('no', state === '0');
  button.setAttribute('aria-label', `${button.textContent.trim()}: ${state === '1' ? 'มี' : state === '0' ? 'ไม่มี' : 'ไม่ทราบ'}`);
}

function fillBookingForm(booking, tag) {
  const box = $('#bookingBox');
  if (!box) return;
  const b = booking || {};
  box.open = Boolean(booking);
  box.dataset.existing = booking ? '1' : '';
  $('#bookingKind').value = b.kind || kindForTag(tag);
  $$('#bookingStatus input').forEach(r => { r.checked = r.value === (b.status || 'CONFIRMED'); });
  $('#bookingVendor').value = b.vendor || '';
  $('#bookingRef').value = b.ref_no || '';
  $('#bookingCheckIn').value = b.check_in || '';
  $('#bookingCheckOut').value = b.check_out || '';
  $('#bookingRoom').value = b.room_desc || '';
  $('#bookingView').value = b.view_desc || '';
  $('#bookingSize').value = b.size_sqm == null ? '' : String(b.size_sqm);
  $('#bookingTravelers').value = b.travelers || '';
  $('#bookingTravelers2').value = b.travelers || '';
  $('#bookingFrom').value = b.depart_from || '';
  $('#bookingTo').value = b.arrive_to || '';
  setTimeValue('bookingArrive', b.arrive_time || '');
  $$('#bookingAmenities button').forEach(button => {
    const v = b[button.dataset.amen];
    setAmenState(button, v === 1 ? '1' : v === 0 ? '0' : '');
  });
  $$('#bookingPayStatus input').forEach(r => { r.checked = r.value === (b.pay_status || 'UNPAID'); });
  $('#bookingPayDate').value = b.pay_date || '';
  $('#bookingPayMethod').value = b.pay_method || '';
  $('#bookingCancel').value = b.cancel_deadline || '';
  /* รายการแนะนำ: ค่าที่เคยพิมพ์ในทริปนี้ — พิมพ์ครั้งเดียว เลือกได้ตลอด */
  const all = planDays.flatMap(day => day.activities.map(act => act.booking).filter(Boolean));
  const uniq = key => [...new Set(all.map(x => x[key]).filter(Boolean))];
  $('#bookingVendors').innerHTML = [...new Set([...uniq('vendor'), 'Agoda', 'Booking.com', 'Trip.com', 'Klook', 'ANA', 'JAL', 'Thai Airways'])]
    .map(v => `<option value="${v}">`).join('');
  $('#bookingPayMethods').innerHTML = uniq('pay_method').map(v => `<option value="${v}">`).join('');
  // ที่พักใหม่: เช็กอิน = วันของจุดแวะ (เซิร์ฟเวอร์ก็ทำให้ แต่โชว์ในฟอร์มให้เห็นก่อน)
  if (!booking && $('#bookingKind').value === 'HOTEL') $('#bookingCheckIn').value = editorSelectedDate();
  syncBookingKindFields();
}

const editorSelectedDate = () => {
  const chosen = $('#activityDay')?.value || '';
  return chosen.startsWith('new:') ? chosen.slice(4) : (planDays.find(day => day.id === chosen)?.date || '');
};

/* แปลงหลังผู้ใช้กรอก "2A 1C(7)" → ผู้ใหญ่ 2 · เด็ก 1 · อายุ 7 (ไม่บังคับรูปแบบ พังก็แค่ไม่แยก) */
function parseTravelers(text) {
  const m = /(\d+)\s*A(?:\s*(\d+)\s*C(?:\s*\(([\d,\s]+)\))?)?/i.exec(text || '');
  if (!m) return { adults: null, children: null, child_ages: null };
  return { adults: Number(m[1]), children: m[2] ? Number(m[2]) : 0, child_ages: m[3] ? m[3].replace(/\s/g, '') : null };
}

/* คืน: object = บันทึก · null = ลบการจองเดิม (ล้างหมดแล้ว) · undefined = ไม่แตะ (ไม่เคยมีและไม่ได้กรอก) */
function readBookingForm() {
  const box = $('#bookingBox');
  if (!box) return undefined;
  const kind = $('#bookingKind').value;
  const travel = isTravelKind(kind);
  const travelers = (travel ? $('#bookingTravelers2') : $('#bookingTravelers')).value.trim();
  const b = {
    kind,
    status: $('#bookingStatus input:checked')?.value || 'CONFIRMED',
    vendor: $('#bookingVendor').value.trim(),
    ref_no: $('#bookingRef').value.trim(),
    check_in: kind === 'HOTEL' ? $('#bookingCheckIn').value : '',
    check_out: kind === 'HOTEL' ? $('#bookingCheckOut').value : '',
    room_desc: kind === 'HOTEL' ? $('#bookingRoom').value.trim() : '',
    view_desc: kind === 'HOTEL' ? $('#bookingView').value.trim() : '',
    size_sqm: kind === 'HOTEL' ? $('#bookingSize').value.trim() : '',
    travelers,
    ...parseTravelers(travelers),
    depart_from: travel ? $('#bookingFrom').value.trim() : '',
    arrive_to: travel ? $('#bookingTo').value.trim() : '',
    arrive_time: travel ? timeValue('bookingArrive') : '',
    pay_status: $('#bookingPayStatus input:checked')?.value || 'UNPAID',
    pay_date: $('#bookingPayDate').value,
    pay_method: $('#bookingPayMethod').value.trim(),
    cancel_deadline: $('#bookingCancel').value
  };
  $$('#bookingAmenities button').forEach(button => {
    b[button.dataset.amen] = kind !== 'HOTEL' ? null : button.dataset.state === '1' ? 1 : button.dataset.state === '0' ? 0 : null;
  });
  const empty = !b.vendor && !b.ref_no && !b.check_out && !b.room_desc && !b.view_desc && !b.size_sqm
    && !b.travelers && !b.depart_from && !b.arrive_to && !b.arrive_time && !b.pay_date && !b.pay_method
    && !b.cancel_deadline && b.pay_status === 'UNPAID' && b.status === 'CONFIRMED'
    && BOOKING_AMEN.every(key => b[key] == null);
  if (empty) return box.dataset.existing ? null : undefined;
  return b;
}

$('#bookingKind')?.addEventListener('change', syncBookingKindFields);
$('#activityTag')?.addEventListener('change', () => {
  const tag = $('#activityTag').value;
  /* ของใหม่: เปลี่ยนประเภทแล้วชนิดการจองกับเวลาตั้งต้นตามไปด้วย · ของเดิมไม่แตะเวลา */
  if (!$('#bookingBox').dataset.existing) {
    $('#bookingKind').value = kindForTag(tag);
    if (tag === 'ที่พัก' && !$('#bookingCheckIn').value) $('#bookingCheckIn').value = editorSelectedDate();
    syncBookingKindFields();
  }
  if (!editingActivityId) {
    const now = timeValue('activityTime');
    if (tag === 'ที่พัก' && now === '09:00') setTimeValue('activityTime', '15:00');
    if (tag !== 'ที่พัก' && now === '15:00') setTimeValue('activityTime', '09:00');
  }
});
$('#bookingAmenities')?.addEventListener('click', event => {
  const button = event.target.closest('button[data-amen]');
  if (!button) return;
  const next = { '': '1', '1': '0', '0': '' }[button.dataset.state] ?? '';
  setAmenState(button, next);
  updateBookingHints();
});
['#bookingCheckIn', '#bookingCheckOut', '#bookingCancel', '#bookingVendor', '#bookingRef', '#bookingPayDate']
  .forEach(sel => $(sel)?.addEventListener('input', updateBookingHints));
$$('#bookingStatus input, #bookingPayStatus input').forEach(r => r.addEventListener('change', updateBookingHints));
$('#bookingCheckIn')?.addEventListener('change', () => {
  // เช็กเอาต์ยังว่าง = เดาให้ 1 คืน · แก้ต่อได้
  if ($('#bookingCheckIn').value && !$('#bookingCheckOut').value) {
    const d = new Date(`${$('#bookingCheckIn').value}T12:00:00`); d.setDate(d.getDate() + 1);
    $('#bookingCheckOut').value = d.toISOString().slice(0, 10);
  }
  updateBookingHints();
});
$('#bookingClear')?.addEventListener('click', () => {
  const existing = $('#bookingBox').dataset.existing;
  fillBookingForm(null, $('#activityTag').value);
  $('#bookingBox').dataset.existing = existing;   // ยังจำว่าเคยมี → บันทึก = ลบ
  $('#bookingBox').open = true;
  updateBookingHints();
});
/* วันที่ของจุดแวะเปลี่ยน = เช็กอินของที่พักตามไปด้วย (ถ้ายังไม่ได้ตั้งเอง) */
$('#activityDay')?.addEventListener('change', () => {
  const date = editorSelectedDate();
  if (date && $('#bookingKind').value === 'HOTEL' && !$('#bookingBox').dataset.existing) {
    $('#bookingCheckIn').value = date; updateBookingHints();
  }
});

function openPlanEditor(activity = null, newDate = '') {
  /* 🔴 ตรวจซ้ำในตัวจัดการ ไม่ใช่พึ่งแค่ปุ่มที่ถูก disable — เข้าฟอร์มได้หลายทาง
     (ปุ่มหัวรายการ · ท้ายรายการ · เพิ่มวัน · กดที่รายการเพื่อแก้)
     ถ้าไม่ตรวจ ผู้ร่วมทริปจะกรอกจนเสร็จแล้วไปเจอ 403 ตอนกดบันทึก */
  if (blockedByClose('plan')) return;
  editingActivityId = activity?.id || null;
  /* หัวเรื่องต้องบอกปลายทางเสมอ — ทั้งสามปุ่มเปิดฟอร์มเดียวกัน ต่างกันแค่วันที่
     ตั้งไว้ให้ ถ้าหัวเรื่องเหมือนกันหมด คนกด "เพิ่มวัน" จะไม่รู้ว่ากำลังสร้างวันใหม่ */
  /* 🔴 บอก "วันที่" เสมอ ไม่ใช่แค่ Day 01 (North 2026-09-07)
     "Day 03" ไม่ได้บอกอะไรเลยว่าคือวันไหนของจริง คนต้องเลื่อนไปดูแท็บวันเทียบเอง
     ทุกที่ที่ให้เลือก/บอกวัน ต้องมีวันที่จริงกำกับ */
  const activeDayRow = planDays.find(day => day.id === activePlanDayId);
  const dayLabel = newDate
    ? `วันใหม่ · ${thaiDate(newDate)}`
    : `${thaiDate(activeDayRow?.date) || `Day ${String(activeDayRow?.day ?? 1).padStart(2, '0')}`}`;
  $('#planEditorTitle').textContent = activity
    ? `แก้ไข ${activity.name}`
    : `เพิ่มสถานที่ใน ${dayLabel}`;
  /* วันในแผนเกิดจากวันที่ของจุดแวะ ไม่มีตาราง "วัน" แยกต่างหาก
     "เพิ่มวัน" จึงคือการเพิ่มตัวเลือกวันใหม่เข้ามาชั่วคราว แล้วรอให้บันทึกจุดแรก
     ของวันนั้น วันถึงจะมีจริง — ถ้าสร้างวันเปล่าไว้ก่อนจะได้วันร้างที่ลบไม่ได้ */
  $('#activityDay').innerHTML = planDays.map(day =>
    `<option value="${day.id}">${dayOptionLabel(day)}</option>`).join('')
    + (newDate ? `<option value="new:${newDate}">วันใหม่ · ${thaiDate(newDate)}</option>` : '');
  $('#activityDay').value = newDate ? `new:${newDate}`
    : (activity
      ? planDays.find(day => day.activities.some(item => item.id === activity.id)).id
      : activePlanDayId);
  $('#activityName').value = activity?.name || '';
  setTimeValue('activityTime', activity?.time === '—' ? '' : (activity?.time || '09:00'));
  setTimeValue('activityEndTime', activity?.endTime || '');
  /* 🔴 ค่าที่ไม่ตรงกับตัวเลือกสักอัน ทำให้ select กลายเป็นช่องว่างเปล่าเงียบ ๆ
     (เกิดจริง: ฐานส่ง 'สถานที่' แต่ลิสต์เขียนว่า 'สถานที่หลัก' — North เจอ 2026-09-07)
     ข้อมูลเก่าจากรุ่นไหนก็ได้ จึงต้องกันไว้ตรงนี้ด้วย ไม่ใช่แค่แก้ที่ api.js */
  const tagOptions = [...$('#activityTag').options].map(option => option.value);
  const wantTag = activity?.tag === 'รอจัดแผน' ? 'กิจกรรมย่อย' : (activity?.tag || 'กิจกรรมย่อย');
  $('#activityTag').value = tagOptions.includes(wantTag) ? wantTag : 'สถานที่หลัก';
  $('#activityCost').value = activity?.plannedCost == null ? '' : String(activity.plannedCost);
  fillCurrencySelect(activity?.plannedCurrency || '');
  $('#activityMapcode').value = activity?.mapcode || '';
  /* ที่พัก: เวลาตั้งต้น 15:00 = เวลาไปถึงโดยประมาณ (North 2026-09-15) เฉพาะของใหม่ */
  if (!activity && $('#activityTag').value === 'ที่พัก') setTimeValue('activityTime', '15:00');
  fillBookingForm(activity?.booking || null, activity?.tag || $('#activityTag').value);
  /* 🔴 ค่าตั้งต้นของ "เวลาเปิด–ปิด" ใส่ให้เฉพาะตอนเพิ่มสถานที่ใหม่ (North 2026-09-07)
     ของเดิมที่บันทึกไว้แล้วต้องเคารพค่าเดิมเสมอ — ถ้าใครตั้งใจล้างเวลาเปิดปิดทิ้ง
     แล้วเรากรอก 09:00–18:00 กลับให้ทุกครั้งที่เปิดฟอร์ม ก็เท่ากับลบเจตนาเขา */
  const brandNew = !activity;
  setTimeValue('activityOpen', activity?.openTime || (brandNew ? '09:00' : ''));
  setTimeValue('activityClose', activity?.closeTime || (brandNew ? '18:00' : ''));
  const closed = new Set(activity?.closedDays || []);
  $$('#activityClosedDays input').forEach(box => { box.checked = closed.has(Number(box.value)); });
  $('#activityDetail').value = activity?.detail || '';
  $('#activityHighlight').value = activity?.highlight || '';
  activityIcon = activity?.image || `${ART}st_camera2.png`;
  $('#activityIconPreview').src = activityIcon;
  renderStopDocuments(activity?.id || '');
  mask.classList.add('open');
  planEditor.classList.add('open');
  planEditor.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#activityName').focus(), 80);
}

/* ── สามปุ่มเพิ่มของหน้าแผนเที่ยว (2026-08-22) ─────────────────────────
   #addPlace     (หัวหน้า)   → เพิ่มลง "วันที่เปิดอยู่"
   #addPlaceFoot (ท้ายรายการ) → เหมือนกันทุกประการ · มีสองที่เพราะแผนยาวเกินหนึ่งจอ
   #addPlanDay   (แถบวัน)     → ต่างกันตรงตั้งวันเป็นวันใหม่ให้ ที่เหลือฟอร์มเดียวกัน

   ทั้งสามเปิดฟอร์มเดียวกันโดยตั้งใจ — คนไม่ต้องเรียนรู้ฟอร์มสามแบบ
   สิ่งที่ต้องต่างคือ "หัวเรื่องบอกปลายทาง" ซึ่ง openPlanEditor เขียนให้แล้ว */
$('#addPlace').addEventListener('click', () => openPlanEditor());
$('#addPlaceFoot')?.addEventListener('click', () => openPlanEditor());
$('#cancelPlanEditor').addEventListener('click', closeLayers);

/* ── แผนเที่ยวในโหมดข้อมูลจริง ─────────────────────────────────────────
   ส่งขึ้นเซิร์ฟเวอร์แล้วดึงใหม่ทั้งชุดเหมือนฝั่งการเงิน — ลำดับและการจัดกลุ่ม
   ตามวันคำนวณที่เซิร์ฟเวอร์ ถ้าหน้าจอเดาเองจะเริ่มไม่ตรงกันทีละนิด */
function savePlanItemLive() {
  const chosen = $('#activityDay').value;
  // 'new:YYYY-MM-DD' = วันที่ยังไม่มีจุดแวะเลย ใช้วันที่ตรง ๆ ไม่ต้องหาใน planDays
  const targetDay = chosen.startsWith('new:')
    ? { date: chosen.slice(4) }
    : planDays.find(day => day.id === chosen);
  const name = $('#activityName').value.trim();
  if (!name) { $('#planEditorError') && ($('#planEditorError').textContent = 'ตั้งชื่อสถานที่ก่อน'); return; }

  /* บันทึกเสร็จให้ยืนอยู่วันที่ของสถานที่นั้น ไม่ใช่วันที่เปิดฟอร์มมา
     (ในฟอร์มเปลี่ยนวันได้ · และ 'new:' คือวันที่ยังไม่มีจุดแวะเลย) */
  focusPlanDate(targetDay?.date || '');
  submitLive('#planEditorError', () => TripApi.saveStop({
    id: editingActivityId || '',
    dayDate: targetDay?.date || '',
    time: timeValue('activityTime'),
    endTime: timeValue('activityEndTime'),
    name,
    detail: $('#activityDetail').value.trim(),
    tag: $('#activityTag').value,
    icon: activityIcon,
    highlight: $('#activityHighlight').value.trim(),
    // ช่อง "งบ" เคยกรอกได้แต่ไม่เคยถูกบันทึกที่ไหนเลย — ตอนนี้ลงฐานจริงแล้ว
    // รับทศนิยมได้ (ราคาโรงแรม 8,141.80) · ตัดจุลภาคกับช่องว่างทิ้ง
    plannedCost: $('#activityCost').value.replace(/[^\d.]/g, ''),
    plannedCurrency: $('#activityCurrency').value || tripCurrencies.find(c => !c.base)?.code || tripCurrencies[0]?.code || '',
    mapcode: $('#activityMapcode').value.trim(),
    booking: readBookingForm(),
    openTime: timeValue('activityOpen'),
    closeTime: timeValue('activityClose'),
    closedDays: $$('#activityClosedDays input:checked').map(box => Number(box.value))
  }), `${editingActivityId ? 'อัปเดต' : 'เพิ่ม'} ${name} แล้ว`)
    .then(() => showScreen('plan'));
}

/* ส่งลำดับของ "ทุกวัน" ไม่ใช่แค่วันที่แก้ — การย้ายข้ามวันเปลี่ยนทั้งสองฝั่ง
   เลข sort_order นับใหม่จาก 1 ทุกครั้ง จะได้ไม่มีช่องว่างสะสมจนอ่านยาก */
function pushPlanOrderLive() {
  const stops = planDays.flatMap(day =>
    day.activities.map((activity, index) => ({
      stop_id: activity.id, stop_date: day.date, sort_order: index + 1
    })));
  if (!stops.length) return Promise.resolve(true);
  return submitLive(null, () => TripApi.reorderStops(stops), 'บันทึกลำดับใหม่แล้ว')
    .then(ok => { if (!ok) showPrototypeToast('บันทึกลำดับไม่สำเร็จ · กำลังโหลดของจริงกลับมา'); return ok; });
}

$('#planEditorForm').addEventListener('submit', event => {
  event.preventDefault();
  if (liveMode) return savePlanItemLive();
  const targetDay = planDays.find(day => day.id === $('#activityDay').value);
  const sourceDay = editingActivityId
    ? planDays.find(day => day.activities.some(activity => activity.id === editingActivityId))
    : null;
  const existing = sourceDay?.activities.find(activity => activity.id === editingActivityId);
  const numericCost = $('#activityCost').value.replace(/\D/g, '');
  const activity = {
    id: existing?.id || `activity-${Date.now()}`,
    time: timeValue('activityTime'),
    endTime: timeValue('activityEndTime'),
    name: $('#activityName').value.trim(),
    detail: $('#activityDetail').value.trim() || 'ยังไม่มีรายละเอียด',
    tag: $('#activityTag').value,
    cost: numericCost ? fmtAmount(Number(numericCost), '¥ ') : '—',
    bills: existing?.bills || 'ยังไม่มีบิล',
    image: activityIcon,
    highlight: $('#activityHighlight').value.trim()
  };

  if (existing) {
    sourceDay.activities.splice(sourceDay.activities.findIndex(item => item.id === existing.id), 1);
  }
  targetDay.activities.push(activity);
  targetDay.activities.sort((a, b) => a.time.localeCompare(b.time));
  activePlanDayId = targetDay.id;
  selectedActivityId = activity.id;
  closeLayers();
  renderPlanWorkspace();
  showPrototypeToast(`${existing ? 'อัปเดต' : 'เพิ่ม'} ${activity.name} ใน Day ${targetDay.day} แล้ว`);
});

/* ── Image library & picker ───────────────────────────────────────────
   One dialog serves all three asset kinds. Each kind declares the exact
   pixel size it wants, shown to the user in the dialog, and uploads are
   redrawn to that size on a canvas before being stored — this both enforces
   the stated dimensions and keeps the data URL small enough that saving to
   localStorage doesn't blow the quota. */
const assetSpecs = {
  banner: {
    title:'ภาพแบนเนอร์ทริป', width:1920, height:810, shape:'wide',
    hint:'ขนาดแนะนำ 1920 × 810 px · แนวนอน อัตราส่วน 2.37 : 1',
    note:'ขั้นต่ำ 1280 × 540 px · ระบบครอบจากกึ่งกลางและย่อไฟล์อัตโนมัติ ควรเว้นขอบภาพและไม่ฝังชื่อสถานที่ เพราะหมุดกับเส้นทางจะแสดงทับด้วยระบบ'
  },
  place: {
    title:'ไอคอนสถานที่', width:256, height:256, shape:'rounded',
    hint:'จัตุรัส 1 : 1 · PNG พื้นโปร่งใส',
    note:'แสดงเป็นสี่เหลี่ยมมุมโค้งในแผนเที่ยว ควรเว้นขอบรอบภาพเล็กน้อย'
  },
  expense: {
    title:'ไอคอนค่าใช้จ่าย', width:192, height:192, shape:'circle',
    hint:'จัตุรัส 1 : 1 · PNG พื้นโปร่งใส',
    note:'แสดงเป็นวงกลมในรายการบิล เนื้อหาสำคัญควรอยู่กลางภาพ'
  },
  wallet: {
    title:'ไอคอนกระเป๋าเงิน', width:256, height:256, shape:'rounded',
    hint:'จัตุรัส 1 : 1 · PNG พื้นโปร่งใส หรือ SVG',
    note:'แสดงเป็นสี่เหลี่ยมมุมโค้งบนการ์ดกระเป๋า · ภาพแบน 2 มิติสีพาสเทลจะเข้ากับหน้าอื่นที่สุด'
  },
  currency: {
    title:'ไอคอนสกุลเงิน', width:192, height:192, shape:'circle',
    hint:'จัตุรัส 1 : 1 · เต็มวงกลม ไม่ต้องเว้นขอบ',
    note:'แสดงเป็นเหรียญกลมในรายการสกุลเงิน · ควรมีสีเด่นประจำสกุลเพื่อให้แยกออกจากกันเร็ว'
  },
  member: {
    title:'รูปประจำตัวสมาชิก', width:192, height:192, shape:'circle',
    hint:'จัตุรัส 1 : 1 · PNG พื้นโปร่งใส',
    note:'แสดงเป็นวงกลมขนาดเล็ก (34–40 px) ทั่วทั้งแอป · ใบหน้าควรกินพื้นที่เกือบเต็มวง ไม่ใช่คนเต็มตัว ไม่งั้นจำหน้าไม่ได้เมื่อย่อ'
  }
};

/* ── ไอคอนชุดที่ North สร้างเอง (2026-08-17) ──────────────────────────
   ตัดจากแผ่นรวม 10 แผ่นด้วย slice-engine ตัวเดียวกับที่ผู้ใช้ใช้ในแอป
   ลบพื้นขาวเป็นโปร่งใส · ย่อพอดีสเปกของแต่ละหมวด · เก็บเป็น WebP (1.7 MB รวม 87 ไฟล์)
   วางไว้ในคลังมาตรฐานเลย ผู้ใช้จึงไม่ต้องอัปโหลดเองอีกรอบ */
const GEN_WALLET2 = [
  {
    "id": "gen2-billfold",
    "label": "บิลโฟลด์",
    "src": "art/gen/wallet2_billfold.webp"
  },
  {
    "id": "gen2-coin-purse",
    "label": "กระเป๋าเหรียญ",
    "src": "art/gen/wallet2_coin-purse.webp"
  },
  {
    "id": "gen2-card-holder",
    "label": "ที่ใส่บัตร",
    "src": "art/gen/wallet2_card-holder.webp"
  },
  {
    "id": "gen2-zip-wallet",
    "label": "กระเป๋าซิป",
    "src": "art/gen/wallet2_zip-wallet.webp"
  },
  {
    "id": "gen2-ang-pao",
    "label": "ซองอั่งเปา",
    "src": "art/gen/wallet2_ang-pao.webp"
  },
  {
    "id": "gen2-money-bag",
    "label": "ถุงเงิน",
    "src": "art/gen/wallet2_money-bag.webp"
  }
];

const GEN = {
  "expense": [
    {
      "id": "gen-ramen",
      "label": "ราเมง",
      "src": "art/gen/expense_ramen.webp"
    },
    {
      "id": "gen-sushi",
      "label": "ซูชิ",
      "src": "art/gen/expense_sushi.webp"
    },
    {
      "id": "gen-parfait",
      "label": "ของหวาน",
      "src": "art/gen/expense_parfait.webp"
    },
    {
      "id": "gen-coffee",
      "label": "กาแฟ/คาเฟ่",
      "src": "art/gen/expense_coffee.webp"
    },
    {
      "id": "gen-beer",
      "label": "เบียร์/เครื่องดื่ม",
      "src": "art/gen/expense_beer.webp"
    },
    {
      "id": "gen-shinkansen",
      "label": "รถไฟชินคันเซ็น",
      "src": "art/gen/expense_shinkansen.webp"
    },
    {
      "id": "gen-taxi",
      "label": "แท็กซี่",
      "src": "art/gen/expense_taxi.webp"
    },
    {
      "id": "gen-flight",
      "label": "ตั๋วเครื่องบิน",
      "src": "art/gen/expense_flight.webp"
    },
    {
      "id": "gen-rentcar",
      "label": "เช่ารถ",
      "src": "art/gen/expense_rentcar.webp"
    },
    {
      "id": "gen-hotel",
      "label": "โรงแรม",
      "src": "art/gen/expense_hotel.webp"
    },
    {
      "id": "gen-onsen-room",
      "label": "ออนเซ็นในที่พัก",
      "src": "art/gen/expense_onsen-room.webp"
    },
    {
      "id": "gen-museum",
      "label": "ตั๋วพิพิธภัณฑ์",
      "src": "art/gen/expense_museum.webp"
    },
    {
      "id": "gen-omiyage",
      "label": "ของฝาก",
      "src": "art/gen/expense_omiyage.webp"
    },
    {
      "id": "gen-supermarket",
      "label": "ซูเปอร์มาร์เก็ต",
      "src": "art/gen/expense_supermarket.webp"
    },
    {
      "id": "gen-gachapon",
      "label": "กาชาปอง",
      "src": "art/gen/expense_gachapon.webp"
    },
    {
      "id": "gen-atm",
      "label": "กดเงิน/ATM",
      "src": "art/gen/expense_atm.webp"
    },
    {
      "id": "gen-medicine",
      "label": "ยา/เวชภัณฑ์",
      "src": "art/gen/expense_medicine.webp"
    },
    {
      "id": "gen-wifi",
      "label": "WiFi/ซิม",
      "src": "art/gen/expense_wifi.webp"
    },
    {
      "id": "gen-mall",
      "label": "ห้าง/ช้อปปิ้ง",
      "src": "art/gen/expense_mall.webp"
    },
    {
      "id": "gen-gas-toll",
      "label": "น้ำมัน/ทางด่วน",
      "src": "art/gen/expense_gas-toll.webp"
    },
    {
      "id": "gen-toys",
      "label": "ของเล่น",
      "src": "art/gen/expense_toys.webp"
    },
    {
      "id": "gen-ski-gear",
      "label": "เช่าอุปกรณ์สกี",
      "src": "art/gen/expense_ski-gear.webp"
    },
    {
      "id": "gen-lift-pass",
      "label": "ลิฟต์พาส",
      "src": "art/gen/expense_lift-pass.webp"
    },
    {
      "id": "gen-souvenir-shop",
      "label": "ร้านของที่ระลึก",
      "src": "art/gen/expense_souvenir-shop.webp"
    },
    {
      "id": "gen-theme-park",
      "label": "สวนสนุก",
      "src": "art/gen/expense_theme-park.webp"
    },
    {
      "id": "gen-aquarium",
      "label": "อควาเรียม",
      "src": "art/gen/expense_aquarium.webp"
    },
    {
      "id": "gen-onsen-outdoor",
      "label": "ออนเซ็นกลางแจ้ง",
      "src": "art/gen/expense_onsen-outdoor.webp"
    },
    {
      "id": "gen-clothes",
      "label": "เสื้อผ้า/รองเท้า",
      "src": "art/gen/expense_clothes.webp"
    },
    {
      "id": "gen-wallet-cash",
      "label": "เงินสด/ค่าใช้จ่ายย่อย",
      "src": "art/gen/expense_wallet-cash.webp"
    },
    {
      "id": "gen-figure",
      "label": "ฟิกเกอร์/ของสะสม",
      "src": "art/gen/expense_figure.webp"
    },
    {
      "id": "gen-katsudon",
      "label": "ข้าวหน้าหมูทอด",
      "src": "art/gen/expense_katsudon.webp"
    },
    {
      "id": "gen-shrine",
      "label": "ทำบุญไหว้พระ",
      "src": "art/gen/expense_shrine.webp"
    },
    {
      "id": "gen-capsule",
      "label": "ตู้กาชา",
      "src": "art/gen/expense_capsule.webp"
    },
    {
      "id": "gen-claw-machine",
      "label": "ตู้คีบตุ๊กตา",
      "src": "art/gen/expense_claw-machine.webp"
    },
    {
      "id": "gen-ski-lift",
      "label": "ลิฟต์สกี",
      "src": "art/gen/expense_ski-lift.webp"
    },
    {
      "id": "gen-gondola",
      "label": "กระเช้า",
      "src": "art/gen/expense_gondola.webp"
    }
  ],
  "currency": [
    {
      "id": "gen-jpy",
      "label": "เยน ¥",
      "src": "art/gen/currency_jpy.webp"
    },
    {
      "id": "gen-thb",
      "label": "บาท ฿",
      "src": "art/gen/currency_thb.webp"
    },
    {
      "id": "gen-usd",
      "label": "ดอลลาร์ $",
      "src": "art/gen/currency_usd.webp"
    },
    {
      "id": "gen-eur",
      "label": "ยูโร €",
      "src": "art/gen/currency_eur.webp"
    },
    {
      "id": "gen-krw",
      "label": "วอน ₩",
      "src": "art/gen/currency_krw.webp"
    },
    {
      "id": "gen-gbp",
      "label": "ปอนด์ £",
      "src": "art/gen/currency_gbp.webp"
    },
    {
      "id": "gen-cny",
      "label": "หยวน ¥",
      "src": "art/gen/currency_cny.webp"
    },
    {
      "id": "gen-sgd",
      "label": "สิงคโปร์ S$",
      "src": "art/gen/currency_sgd.webp"
    },
    {
      "id": "gen-aud",
      "label": "ออสเตรเลีย A$",
      "src": "art/gen/currency_aud.webp"
    }
  ],
  "wallet": [
    {
      "id": "gen-billfold",
      "label": "บิลโฟลด์",
      "src": "art/gen/wallet_billfold.webp"
    },
    {
      "id": "gen-coin-purse",
      "label": "กระเป๋าเหรียญ",
      "src": "art/gen/wallet_coin-purse.webp"
    },
    {
      "id": "gen-card-holder",
      "label": "ที่ใส่บัตร",
      "src": "art/gen/wallet_card-holder.webp"
    },
    {
      "id": "gen-zip-pouch",
      "label": "กระเป๋าซิป",
      "src": "art/gen/wallet_zip-pouch.webp"
    },
    {
      "id": "gen-envelope",
      "label": "ซองเงิน",
      "src": "art/gen/wallet_envelope.webp"
    },
    {
      "id": "gen-money-bag",
      "label": "ถุงเงิน",
      "src": "art/gen/wallet_money-bag.webp"
    }
  ],
  "place": [
    {
      "id": "gen-marimo-lake",
      "label": "ทะเลสาบมาริโมะ",
      "src": "art/gen/place_marimo-lake.webp"
    },
    {
      "id": "gen-ainu-village",
      "label": "หมู่บ้านไอนุ",
      "src": "art/gen/place_ainu-village.webp"
    },
    {
      "id": "gen-airport-bird",
      "label": "สนามบิน",
      "src": "art/gen/place_airport-bird.webp"
    },
    {
      "id": "gen-airport-shop",
      "label": "ร้านในสนามบิน",
      "src": "art/gen/place_airport-shop.webp"
    },
    {
      "id": "gen-lake-cruise",
      "label": "ล่องเรือทะเลสาบ",
      "src": "art/gen/place_lake-cruise.webp"
    },
    {
      "id": "gen-seafood-bowl",
      "label": "ข้าวหน้าซีฟู้ด",
      "src": "art/gen/place_seafood-bowl.webp"
    },
    {
      "id": "gen-sapporo-park",
      "label": "สวนซัปโปโร",
      "src": "art/gen/place_sapporo-park.webp"
    },
    {
      "id": "gen-beer-museum",
      "label": "โรงเบียร์",
      "src": "art/gen/place_beer-museum.webp"
    },
    {
      "id": "gen-otaru-canal",
      "label": "คลองโอตารุ",
      "src": "art/gen/place_otaru-canal.webp"
    },
    {
      "id": "gen-monkey-onsen",
      "label": "ออนเซ็นลิง",
      "src": "art/gen/place_monkey-onsen.webp"
    },
    {
      "id": "gen-mud-onsen",
      "label": "บ่อโคลน",
      "src": "art/gen/place_mud-onsen.webp"
    },
    {
      "id": "gen-ropeway",
      "label": "กระเช้าลอยฟ้า",
      "src": "art/gen/place_ropeway.webp"
    },
    {
      "id": "gen-lavender",
      "label": "ทุ่งลาเวนเดอร์",
      "src": "art/gen/place_lavender.webp"
    },
    {
      "id": "gen-gorge",
      "label": "หุบเขา",
      "src": "art/gen/place_gorge.webp"
    },
    {
      "id": "gen-waterfall",
      "label": "น้ำตก",
      "src": "art/gen/place_waterfall.webp"
    },
    {
      "id": "gen-crane-marsh",
      "label": "ทุ่งนกกระเรียน",
      "src": "art/gen/place_crane-marsh.webp"
    },
    {
      "id": "gen-fox-farm",
      "label": "ฟาร์ม/ทุ่งผัก",
      "src": "art/gen/place_fox-farm.webp"
    },
    {
      "id": "gen-river-bridge",
      "label": "แม่น้ำในเมือง",
      "src": "art/gen/place_river-bridge.webp"
    },
    {
      "id": "gen-horse-farm",
      "label": "ฟาร์มม้า/ทุ่งสีรุ้ง",
      "src": "art/gen/place_horse-farm.webp"
    },
    {
      "id": "gen-snowboard",
      "label": "ลานสกี",
      "src": "art/gen/place_snowboard.webp"
    },
    {
      "id": "gen-autumn-onsen",
      "label": "ออนเซ็นใบไม้เปลี่ยนสี",
      "src": "art/gen/place_autumn-onsen.webp"
    },
    {
      "id": "gen-clock-tower",
      "label": "หอนาฬิกาซัปโปโร",
      "src": "art/gen/place_clock-tower.webp"
    },
    {
      "id": "gen-big-store",
      "label": "ห้างใหญ่/ที่จอดรถ",
      "src": "art/gen/place_big-store.webp"
    },
    {
      "id": "gen-bookstore",
      "label": "ร้านหนังสือ",
      "src": "art/gen/place_bookstore.webp"
    },
    {
      "id": "gen-izakaya-inside",
      "label": "ร้านอาหารญี่ปุ่น",
      "src": "art/gen/place_izakaya-inside.webp"
    },
    {
      "id": "gen-shopping-mall",
      "label": "ห้างสรรพสินค้า",
      "src": "art/gen/place_shopping-mall.webp"
    },
    {
      "id": "gen-grand-hotel",
      "label": "โรงแรมหรู",
      "src": "art/gen/place_grand-hotel.webp"
    },
    {
      "id": "gen-izakaya",
      "label": "อิซากายะ",
      "src": "art/gen/place_izakaya.webp"
    },
    {
      "id": "gen-michi-no-eki",
      "label": "จุดแวะพักริมทาง",
      "src": "art/gen/place_michi-no-eki.webp"
    },
    {
      "id": "gen-winter-park",
      "label": "สวนสนุกฤดูหนาว",
      "src": "art/gen/place_winter-park.webp"
    },
    {
      "id": "gen-car-rental-mountain",
      "label": "เช่ารถขึ้นเขา",
      "src": "art/gen/place_car-rental-mountain.webp"
    },
    {
      "id": "gen-lake-viewpoint",
      "label": "จุดชมวิวทะเลสาบ",
      "src": "art/gen/place_lake-viewpoint.webp"
    },
    {
      "id": "gen-train-station",
      "label": "สถานีรถไฟ",
      "src": "art/gen/place_train-station.webp"
    },
    {
      "id": "gen-arcade",
      "label": "เกมเซ็นเตอร์",
      "src": "art/gen/place_arcade.webp"
    },
    {
      "id": "gen-street-food",
      "label": "ร้านริมทาง",
      "src": "art/gen/place_street-food.webp"
    },
    {
      "id": "gen-ramen-shop",
      "label": "ร้านราเมง",
      "src": "art/gen/place_ramen-shop.webp"
    }
  ]
};

const assetLibrary = {
  banner: [
    { id:'hokkaido-clean', label:'Hokkaido · ภาพวาด', src:'art/hokkaido-illustrated-clean.png' },
    { id:'hokkaido-landmarks', label:'Hokkaido · มีชื่อสถานที่', src:'art/hokkaido-illustrated-landmarks.png' },
    { id:'hokkaido-texture', label:'Hokkaido · เท็กซ์เจอร์', src:'art/hokkaido-texture-map.png' },
    { id:'plan-hokkaido5', label:'Hokkaido · แผนที่เดิม', src:`${ART}hero_plan_hokkaido5.png` }
  ],
  place: [
    ...GEN.place,
    { id:'marimo', label:'ทะเลสาบ', src:`${ART}act_marimo.png` },
    { id:'ainukotan', label:'หมู่บ้านวัฒนธรรม', src:`${ART}act_ainukotan.png` },
    { id:'crane', label:'นกกระเรียน', src:`${ART}act_crane.png` },
    { id:'ginga', label:'น้ำตก', src:`${ART}act_ginga.png` },
    { id:'kurodake', label:'ภูเขา / กระเช้า', src:`${ART}act_kurodake.png` },
    { id:'nusamai', label:'สะพาน', src:`${ART}act_nusamai.png` },
    { id:'hotel', label:'ที่พัก', src:`${ART}ic_hotel.png` },
    { id:'train', label:'การเดินทาง', src:`${ART}ic_train.png` },
    { id:'ramen', label:'อาหาร', src:`${ART}ic_ramen.png` },
    { id:'gift', label:'ช้อปปิ้ง', src:`${ART}ic_gift.png` },
    { id:'city', label:'เมือง', src:`${ART}st_tokyo_city.png` },
    { id:'suitcase', label:'กระเป๋าเดินทาง', src:`${ART}st_suitcase.png` }
  ],
  expense: [
    ...GEN.expense,
    { id:'food', label:'อาหาร', src:`${ART}cat_food.png` },
    { id:'hotel', label:'ที่พัก', src:`${ART}cat_hotel.png` },
    { id:'shop', label:'ช้อปปิ้ง', src:`${ART}cat_shop.png` },
    { id:'transport', label:'เดินทาง', src:`${ART}cat_transport.png` },
    { id:'activity', label:'กิจกรรม', src:`${ART}cat_activity.png` },
    { id:'ramen-ex', label:'ร้านอาหาร', src:`${ART}ic_ramen.png` },
    { id:'hotel-ex', label:'โรงแรม', src:`${ART}ic_hotel.png` },
    { id:'gift-ex', label:'ของฝาก', src:`${ART}ic_gift.png` }
  ],
  wallet: [
    ...GEN_WALLET2,
    ...GEN.wallet,
    { id:'w-classic',  label:'บิลโฟลด์',       src:'art/icons/wallet_classic.svg' },
    { id:'w-coin',     label:'กระเป๋าเหรียญ',   src:'art/icons/wallet_coin.svg' },
    { id:'w-card',     label:'ที่ใส่บัตร',      src:'art/icons/wallet_card.svg' },
    { id:'w-travel',   label:'กระเป๋าเดินทาง',  src:'art/icons/wallet_travel.svg' },
    { id:'w-envelope', label:'ซองเงิน',        src:'art/icons/wallet_envelope.svg' },
    { id:'w-pouch',    label:'ถุงผ้า',          src:'art/icons/wallet_pouch.svg' },
    { id:'w-mint',     label:'มินต์',           src:'art/icons/wallet_mint.svg' },
    { id:'w-night',    label:'กลางคืน',        src:'art/icons/wallet_night.svg' }
  ],
  /* รูปประจำตัวสมาชิก (2026-08-23) — ใช้ไอคอนที่มีอยู่แล้วไปก่อน
     ⚠️ ชุดนี้ยังไม่ใช่ "หน้าคน" จริง ๆ เป็นของสำรองให้เลือกได้ทันที
        รูปหน้าคนชุดจริงต้อง generate เพิ่ม — ดู ICON_PROMPTS.md หัวข้อ
        "รูปประจำตัวสมาชิก" แล้วอัปโหลดผ่านปุ่มในฟอร์มสมาชิกได้เลย */
  member: [
    ...(GEN.member || []),
    { id:'m-short',   label:'ผมสั้น',      src:'art/icons/member_short.svg' },
    { id:'m-bob',     label:'ผมบ๊อบ',      src:'art/icons/member_bob.svg' },
    { id:'m-bun',     label:'มัดจุก',      src:'art/icons/member_bun.svg' },
    { id:'m-curly',   label:'ผมหยิก',      src:'art/icons/member_curly.svg' },
    { id:'m-cap',     label:'ใส่หมวก',     src:'art/icons/member_cap.svg' },
    { id:'m-long',    label:'ผมยาว',       src:'art/icons/member_long.svg' },
    { id:'m-beard',   label:'มีหนวดเครา',  src:'art/icons/member_beard.svg' },
    { id:'m-glasses', label:'ใส่แว่น',      src:'art/icons/member_glasses.svg' }
  ],
  currency: [
    ...GEN.currency,
    { id:'c-jpy', label:'เยน ¥',    src:'art/icons/coin_jpy.svg' },
    { id:'c-thb', label:'บาท ฿',    src:'art/icons/coin_thb.svg' },
    { id:'c-usd', label:'ดอลลาร์ $', src:'art/icons/coin_usd.svg' },
    { id:'c-eur', label:'ยูโร €',    src:'art/icons/coin_eur.svg' },
    { id:'c-krw', label:'วอน ₩',    src:'art/icons/coin_krw.svg' },
    { id:'c-gbp', label:'ปอนด์ £',   src:'art/icons/coin_gbp.svg' },
    { id:'c-cny', label:'หยวน',      src:'art/icons/coin_cny.svg' },
    { id:'c-sgd', label:'สิงคโปร์',   src:'art/icons/coin_sgd.svg' },
    { id:'c-aud', label:'ออสเตรเลีย', src:'art/icons/coin_aud.svg' },
    { id:'c-twd', label:'ไต้หวัน',    src:'art/icons/coin_twd.svg' },
    { id:'c-vnd', label:'ดอง ₫',     src:'art/icons/coin_vnd.svg' },
    { id:'c-myr', label:'ริงกิต',     src:'art/icons/coin_myr.svg' }
  ]
};

const assetDialog = $('#assetPicker');
let assetKind = 'place';
let assetChoice = '';
let assetOnPick = null;

/* คลังรูปที่อัปโหลดเอง — โหลดจากเซิร์ฟเวอร์ตอนเปิดกล่องเลือกรูป
   ⚠️ เดิมรูปที่อัปโหลดถูก unshift เข้า assetLibrary ในหน่วยความจำเท่านั้น
      รีเฟรชแล้วหายจากคลัง (ตัวรูปยังอยู่บนเซิร์ฟเวอร์ แต่หาไม่เจอเพื่อใช้ซ้ำ)
   canDeleteIcons มาจากเซิร์ฟเวอร์ ไม่ใช่เดาจากสิทธิ์ในทริป — รูปเป็นของ
   ทั้งครอบครัว คนที่ลบได้คือผู้ดูแลระบบครอบครัว ไม่ใช่ผู้ดูแลทริป */
let uploadedIcons = [];
let canDeleteIcons = false;

async function loadUploadedIcons() {
  if (!liveMode) { uploadedIcons = []; canDeleteIcons = false; return; }
  try {
    const payload = await TripApi.listUploadedIcons();
    uploadedIcons = payload.icons || [];
    canDeleteIcons = Boolean(payload.can_delete);
  } catch (error) {
    console.error('load uploaded icons failed', error);
    uploadedIcons = [];      // โหลดคลังไม่ได้ ไม่ควรทำให้เลือกรูปมาตรฐานไม่ได้ไปด้วย
    canDeleteIcons = false;
  }
}

function renderAssetGrid() {
  const spec = assetSpecs[assetKind];
  const builtin = assetLibrary[assetKind].map(asset => `
    <button type="button" class="asset-option ${asset.src === assetChoice ? 'selected' : ''}" data-asset-src="${asset.src}">
      <span class="asset-thumb ${spec.shape}"><img src="${asset.src}" alt=""></span>
      <small>${asset.label}</small>
    </button>`).join('');

  /* รูปที่อัปโหลดเองแสดงรวมกันทุกหมวด เพราะเซิร์ฟเวอร์ไม่ได้แยกว่าอัปโหลดมา
     เพื่อหมวดไหน — คนมักอัปโหลดรูปเดียวแล้วอยากใช้ได้หลายที่ */
  const mine = uploadedIcons.map(row => `
    <div class="asset-option uploaded${row.url === assetChoice ? ' selected' : ''}">
      <button type="button" class="asset-pick" data-asset-src="${row.url}">
        <span class="asset-thumb ${spec.shape}"><img src="${row.url}" alt="" loading="lazy"></span>
        <small>รูปที่อัปโหลด</small>
      </button>
      ${canDeleteIcons ? `<button type="button" class="asset-del" data-del-icon="${row.key}"
        title="ลบรูปนี้ออกจากคลังถาวร" aria-label="ลบรูปนี้ออกจากคลัง">🗑️</button>` : ''}
    </div>`).join('');

  $('#assetGrid').innerHTML = builtin + (mine ? `
    <p class="asset-divider">รูปที่อัปโหลดเอง · ${uploadedIcons.length} รูป${
      canDeleteIcons ? '' : ' · ลบได้เฉพาะผู้ดูแลระบบครอบครัว'}</p>${mine}` : '');
}

/* ลบรูปออกจากคลังถาวร — ผู้ดูแลระบบครอบครัวเท่านั้น (เซิร์ฟเวอร์เช็คอีกชั้น)
   🔴 เตือนให้ชัดว่าเป็นการลบ "ออกจากระบบ" ไม่ใช่แค่เอาออกจากรายการ
      ของที่เคยเลือกรูปนี้ไว้จะกลายเป็นรูปแตก และกู้คืนไม่ได้ */
$('#assetGrid').addEventListener('click', async event => {
  const button = event.target.closest('[data-del-icon]');
  if (!button) return;
  event.stopPropagation();
  if (!window.confirm('ลบรูปนี้ออกจากคลังถาวร?\n\n'
    + 'กระเป๋า สมาชิก หรือรายการที่เคยเลือกรูปนี้ไว้จะกลายเป็นรูปแตก\n'
    + 'กู้คืนไม่ได้')) return;
  try {
    await TripApi.removeUploadedIcon(button.dataset.delIcon);
    await loadUploadedIcons();
    renderAssetGrid();
    showPrototypeToast('ลบรูปออกจากคลังแล้ว');
  } catch (error) {
    $('#assetError').textContent = error.message;
  }
});

function openAssetPicker(kind, currentSrc, onPick) {
  // Always open on a clean stack — the picker is launched from three other
  // layers, and leaving one of them open would cover it.
  closeLayers();
  assetKind = kind;
  assetChoice = currentSrc || '';
  assetOnPick = onPick;
  const spec = assetSpecs[kind];
  $('#assetPickerTitle').textContent = spec.title;
  $('#assetSpec').innerHTML = `<b>ขนาดที่แนะนำ ${spec.width} × ${spec.height} px</b><span>${spec.hint}</span><small>${spec.note}</small>`;
  $('#assetUploadHint').textContent = `ระบบจะย่อ/ครอบให้เป็น ${spec.width} × ${spec.height} px ให้อัตโนมัติ`;
  $('#assetError').textContent = '';
  $('#assetUpload').value = '';
  renderAssetGrid();          // วาดคลังมาตรฐานก่อน ไม่ต้องรอเซิร์ฟเวอร์
  mask.classList.add('open');
  assetDialog.classList.add('open');
  assetDialog.setAttribute('aria-hidden', 'false');
  /* คลังรูปที่อัปโหลดเองโหลดตามหลัง แล้วค่อยวาดเติม
     ⚠️ ไม่ await ก่อนเปิดกล่อง ไม่งั้นเน็ตช้าจะกดปุ่มแล้วเงียบไปหลายวินาที
        จนคนกดซ้ำเพราะนึกว่าไม่ติด */
  loadUploadedIcons().then(() => {
    if (assetDialog.classList.contains('open')) renderAssetGrid();
  });
}

$('#assetGrid').addEventListener('click', event => {
  const option = event.target.closest('[data-asset-src]');
  if (!option) return;
  assetChoice = option.dataset.assetSrc;
  renderAssetGrid();
});

/* Redraw an upload to the kind's exact dimensions with a centre cover-crop.
   คืนทั้ง data: URL (พรีวิวทันที/ทางสำรองถ้าอัปโหลดขึ้นเซิร์ฟเวอร์ไม่สำเร็จ)
   และ blob (ไฟล์จริงสำหรับส่งขึ้น R2 ตอน liveMode) จากภาพเดียวกัน */
function normaliseUpload(file, spec) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = spec.width;
        canvas.height = spec.height;
        const context = canvas.getContext('2d');
        const scale = Math.max(spec.width / image.width, spec.height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(image, (spec.width - drawWidth) / 2, (spec.height - drawHeight) / 2, drawWidth, drawHeight);
        /* ⚠️ Safari เข้ารหัส WebP ผ่าน canvas ไม่ได้ (เปิดดูไฟล์ WebP ได้ แต่สร้างไม่ได้)
           ตามสเปก เบราว์เซอร์จะถอยไปใช้ PNG "เงียบ ๆ" โดยไม่แจ้ง error เลย
           ผลคือแบนเนอร์ 1920×810 กลายเป็น PNG ขนาดหลาย MB เกินเพดาน 700 KB
           ที่เซิร์ฟเวอร์รับ → อัปโหลดถูกปฏิเสธ → รูปหายทุกครั้งที่รีเฟรช
           (ใช้เวลาไล่หาสาเหตุนี้นาน 2026-08-11 เพราะไม่มี error ให้เห็น)

           จึงต้องตรวจ blob.type ที่ได้จริง ไม่ใช่เชื่อว่าได้ตามที่ขอไป
           ถ้าไม่ได้ WebP และไฟล์ใหญ่เกิน ให้เข้ารหัสใหม่เป็น JPEG ซึ่งทุก
           เบราว์เซอร์ทำได้ · ไอคอนเล็กที่ต้องการพื้นโปร่งใสยังคงเป็น PNG ตามเดิม
           เพราะเล็กพออยู่แล้วและ JPEG ทำพื้นโปร่งใสไม่ได้ */
        const quality = spec.width >= 1000 ? 0.72 : 0.86;
        const LIMIT = 700 * 1024;

        const done = blob => resolve({ dataUrl: canvas.toDataURL(blob?.type || 'image/png', quality), blob });

        canvas.toBlob(first => {
          const encodedAsWebp = first?.type === 'image/webp';
          if (first && (encodedAsWebp || first.size <= LIMIT)) return done(first);
          // ถอยไป JPEG: ไม่มีพื้นโปร่งใส แต่แบนเนอร์เป็นภาพเต็มกรอบอยู่แล้ว
          canvas.toBlob(second => done(second || first), 'image/jpeg', 0.82);
        }, 'image/webp', quality);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── ตัดภาพรวมหลายไอคอนเป็นไฟล์แยก (2026-08-17) ────────────────────────
   Gemini/ChatGPT สร้างไอคอนออกมาเป็น "แผ่นเดียว" มีหลายชิ้นเรียงกัน
   ถ้าให้ผู้ใช้ไปครอปเองทีละชิ้นในโปรแกรมอื่น ชุด 12 ไอคอนก็คือ 12 รอบ
   ตรงนี้จึงหาช่องว่างระหว่างชิ้นแล้วตัดให้เอง

   วิธี: ฉายจำนวนพิกเซลที่ "ไม่ใช่พื้นหลัง" ลงบนแกน x และ y (projection profile)
   แถบที่มีเนื้อหาคือช่วงที่ค่าฉายสูงกว่าเกณฑ์ · ชิ้น = แถบแนวตั้ง × แถบแนวนอน
   ⚠️ วิธีนี้ใช้ได้กับภาพที่เรียงเป็นตารางและมีช่องว่างคั่น ถ้าไอคอนติดกันจนไม่มี
   ช่องว่าง มันจะรวมเป็นชิ้นเดียว — จึงต้องมีโหมดตัดเป็นตารางด้วยมือควบคู่เสมอ */

const SLICE_MAX_SIDE = 1400;   // ย่อก่อนวิเคราะห์ ภาพ 4K วิเคราะห์เต็มความละเอียดช้าโดยไม่จำเป็น

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ'));
      image.onload = () => resolve(image);
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* วาดภาพลง canvas (ย่อถ้าใหญ่เกิน) แล้วคืน context พร้อมข้อมูลพิกเซล */
function sheetCanvas(image) {
  const scale = Math.min(1, SLICE_MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height) };
}

/* guessBackground / bgDistance / detectTiles / gridTiles / BG_THRESHOLD
   อยู่ใน slice-engine.js (โหลดก่อนไฟล์นี้ใน index.html) — แยกไว้เพราะเป็น
   ตรรกะล้วนที่เทสได้จริงโดยไม่ต้องมีเบราว์เซอร์ ดูเทสที่ backend/test/slice-engine.test.mjs */

/* วาดชิ้นหนึ่งลง canvas ขนาดตามสเปก — ใช้ "contain" ไม่ใช่ cover
   ไอคอนที่โดนครอปขอบหายไปครึ่งหนึ่งใช้ไม่ได้ ต่างจากแบนเนอร์ที่ครอปได้
   cutBg = ทำพื้นหลังให้โปร่งใส (ไล่ระดับตามระยะห่างจากสีพื้น จะได้ไม่เป็นขอบหยัก) */
function tileToCanvas(sheet, box, bg, spec, cutBg) {
  const boxW = box.x1 - box.x0 + 1;
  const boxH = box.y1 - box.y0 + 1;
  const cut = document.createElement('canvas');
  cut.width = boxW;
  cut.height = boxH;
  const cutCtx = cut.getContext('2d', { willReadFrequently: true });
  cutCtx.drawImage(sheet.canvas, box.x0, box.y0, boxW, boxH, 0, 0, boxW, boxH);

  if (cutBg && !bg.transparent) {
    const piece = cutCtx.getImageData(0, 0, boxW, boxH);
    const px = piece.data;
    for (let i = 0; i < px.length; i += 4) {
      const dist = bgDistance(px, i, bg);
      /* ไล่ระดับความโปร่งใสในช่วง BG_THRESHOLD…×2 แทนการตัดขาดที่ค่าเดียว
         ตัดขาดจะได้ขอบหยักเป็นฟันเลื่อยเพราะขอบไอคอนถูก anti-alias มา */
      if (dist <= BG_THRESHOLD) px[i + 3] = 0;
      else if (dist < BG_THRESHOLD * 2) {
        px[i + 3] = Math.round(px[i + 3] * (dist - BG_THRESHOLD) / BG_THRESHOLD);
      }
    }
    cutCtx.putImageData(piece, 0, 0);
  }

  const out = document.createElement('canvas');
  out.width = spec.width;
  out.height = spec.height;
  const ctx = out.getContext('2d');
  const pad = 0.94;                                        // เว้นขอบนิดหน่อย ไอคอนจะได้ไม่ชนกรอบ
  const scale = Math.min(spec.width / boxW, spec.height / boxH) * pad;
  const w = boxW * scale;
  const h = boxH * scale;
  ctx.drawImage(cut, (spec.width - w) / 2, (spec.height - h) / 2, w, h);
  return out;
}

const canvasToBlob = canvas => new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

/* ── หน้าจอเลือกชิ้น ─────────────────────────────────────────────────── */
const slicerDialog = $('#iconSlicer');
let slicerSheet = null;      // { canvas, context, data }
let slicerTiles = [];        // [{ box, bg, chosen, url }]
let slicerSpec = null;
let slicerKind = 'place';
let slicerFile = null;       // ไฟล์ต้นฉบับ เผื่อผู้ใช้บอกว่า "ไม่ต้องตัด ใช้ทั้งภาพ"

function renderSlicerGrid() {
  $('#slicerGrid').innerHTML = slicerTiles.map((tile, index) => `
    <button type="button" class="slice-option ${tile.chosen ? 'chosen' : ''}" data-slice="${index}">
      <img src="${tile.url}" alt="ชิ้นที่ ${index + 1}">
      <small>${index + 1}</small>
    </button>`).join('');
  const chosen = slicerTiles.filter(tile => tile.chosen).length;
  $('#slicerConfirm').textContent = chosen ? `เพิ่ม ${chosen} ไอคอน` : 'เลือกอย่างน้อย 1 ชิ้น';
  $('#slicerConfirm').disabled = !chosen;
}

/* สร้างพรีวิวของทุกชิ้น — เป็น data: URL ขนาดเล็กไว้โชว์ในกล่องเลือกเท่านั้น
   ไฟล์จริงจะเรนเดอร์ใหม่ตอนกดยืนยัน เพราะตัวเลือก "ลบพื้นหลัง" เปลี่ยนได้ */
function buildSlices(result) {
  const cutBg = $('#slicerCutBg').checked;
  slicerTiles = result.tiles.map(box => ({
    box,
    bg: result.bg,
    chosen: true,
    url: tileToCanvas(slicerSheet, box, result.bg, { width: 128, height: 128 }, cutBg).toDataURL('image/png')
  }));
  /* บอกเรื่องชื่อกำกับไว้ด้วย — แผ่นที่มีตัวหนังสือใต้ไอคอนจะได้ชิ้นเป็นสองเท่า
     ครึ่งหนึ่งเป็นตัวหนังสือ ถ้าไม่เตือน ผู้ใช้จะกด "เลือกทั้งหมด" แล้วได้ขยะเข้าคลัง */
  $('#slicerLead').textContent = slicerTiles.length
    ? `ตัดได้ ${slicerTiles.length} ชิ้น · กดเพื่อเลือก/ไม่เลือก · ถ้าแผ่นมีชื่อกำกับใต้ไอคอน ตัวหนังสือจะกลายเป็นชิ้นแยก ให้กดออก`
    : 'ยังแยกชิ้นไม่ได้ — ลองระบุจำนวนแถว × คอลัมน์ด้านบนแล้วกด "ตัดใหม่"';
  renderSlicerGrid();
}

function openSlicer(image, kind, file) {
  closeLayers();
  slicerKind = kind;
  slicerFile = file;
  slicerSpec = assetSpecs[kind];
  slicerSheet = sheetCanvas(image);
  $('#slicerError').textContent = '';
  $('#slicerRows').value = '';
  $('#slicerCols').value = '';
  const bg = guessBackground(slicerSheet.data);
  // พื้นโปร่งใสอยู่แล้วก็ไม่ต้องลบอะไร ติ๊กไว้ให้เฉพาะภาพพื้นทึบ
  $('#slicerCutBg').checked = !bg.transparent;
  buildSlices(detectTiles(slicerSheet.data));
  mask.classList.add('open');
  slicerDialog.classList.add('open');
  slicerDialog.setAttribute('aria-hidden', 'false');
}

$('#slicerGrid').addEventListener('click', event => {
  const option = event.target.closest('[data-slice]');
  if (!option) return;
  const tile = slicerTiles[Number(option.dataset.slice)];
  tile.chosen = !tile.chosen;
  renderSlicerGrid();
});

$('#slicerToggleAll').addEventListener('click', () => {
  const turnOn = slicerTiles.some(tile => !tile.chosen);
  slicerTiles.forEach(tile => { tile.chosen = turnOn; });
  renderSlicerGrid();
});

$('#slicerAuto').addEventListener('click', () => buildSlices(detectTiles(slicerSheet.data)));

/* ทางออกเมื่อระบบเดาผิด — ภาพเดียวที่มีรายละเอียดเยอะอาจถูกมองว่าเป็นหลายชิ้น
   ต้องกลับไปใช้ทั้งภาพได้ ไม่ใช่บังคับให้ตัดแล้วเสียรูปที่เพิ่งเลือกมา */
$('#slicerWhole').addEventListener('click', () => {
  const file = slicerFile;
  closeLayers();
  openAssetPicker(slicerKind, assetChoice, assetOnPick);
  if (file) uploadSingleAsset(file);
});
$('#slicerCutBg').addEventListener('change', () => {
  // เรนเดอร์พรีวิวใหม่ด้วยกรอบเดิม ไม่ต้องตรวจหาชิ้นใหม่
  buildSlices({ tiles: slicerTiles.map(tile => tile.box), bg: slicerTiles[0]?.bg || guessBackground(slicerSheet.data) });
});

$('#slicerApplyGrid').addEventListener('click', () => {
  const rows = Number($('#slicerRows').value);
  const cols = Number($('#slicerCols').value);
  if (!(rows >= 1 && cols >= 1)) {
    $('#slicerError').textContent = 'ใส่จำนวนแถวและคอลัมน์ก่อน (เช่น 3 × 4)';
    return;
  }
  $('#slicerError').textContent = '';
  buildSlices(gridTiles(slicerSheet.data, rows, cols));
});

/* เรนเดอร์ชิ้นที่เลือกเป็นไฟล์จริง อัปโหลดทีละชิ้น แล้วใส่เข้าคลังไอคอน
   ⚠️ อัปโหลดเรียงตัวไม่ยิงพร้อมกัน — 12 คำขอพร้อมกันไปที่ Worker เดียวกัน
   มีโอกาสโดนจำกัดอัตราแล้วบางชิ้นหายไปเงียบ ๆ โดยผู้ใช้ไม่รู้ว่าหายชิ้นไหน */
$('#slicerConfirm').addEventListener('click', async () => {
  const chosen = slicerTiles.filter(tile => tile.chosen);
  if (!chosen.length) return;
  const cutBg = $('#slicerCutBg').checked;
  const button = $('#slicerConfirm');
  button.disabled = true;

  let added = 0;
  const failed = [];
  for (const [index, tile] of chosen.entries()) {
    $('#slicerError').textContent = `กำลังเพิ่ม ${index + 1}/${chosen.length}…`;
    const canvas = tileToCanvas(slicerSheet, tile.box, tile.bg, slicerSpec, cutBg);
    const dataUrl = canvas.toDataURL('image/png');
    let src = dataUrl;
    if (liveMode) {
      try {
        src = await TripApi.uploadIcon(await canvasToBlob(canvas), `icon-${Date.now()}-${index}.png`);
      } catch (error) {
        failed.push(index + 1);
        console.error('slice upload failed', error);
        continue;   // ชิ้นที่อัปโหลดไม่ขึ้นต้องไม่เข้าคลัง ไม่งั้นรีเฟรชแล้วหาย
      }
    }
    assetLibrary[slicerKind].unshift({ id:`sl-${Date.now()}-${index}`, label:`ไอคอน ${index + 1}`, src, uploaded:true });
    added += 1;
  }

  button.disabled = false;
  saveState();
  closeLayers();
  openAssetPicker(slicerKind, assetLibrary[slicerKind][0]?.src || '', assetOnPick);
  showPrototypeToast(failed.length
    ? `⚠️ เพิ่มได้ ${added} ชิ้น · ชิ้นที่ ${failed.join(', ')} อัปโหลดไม่สำเร็จ ยังไม่ถูกบันทึก`
    : `เพิ่ม ${added} ไอคอนเข้าคลังแล้ว`);
});

/* โหมดข้อมูลจริง: อัปโหลดรูปที่ย่อแล้วขึ้น R2 บนเซิร์ฟเวอร์จริง ทุกคนใน
   ครอบครัวจึงเห็นรูปเดียวกัน — ถ้าอัปโหลดไม่สำเร็จ (เช่นเน็ตหลุด) ยังเก็บ
   เป็น data: URL ไว้ใช้ในเบราว์เซอร์นี้ต่อได้ ไม่เสียงานที่ทำไปแล้ว */
$('#assetUpload').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('#assetError').textContent = '';
  if (file.size > 8 * 1024 * 1024) {
    $('#assetError').textContent = 'ไฟล์ใหญ่เกิน 8 MB กรุณาย่อก่อนอัปโหลด';
    return;
  }
  /* ภาพที่ AI สร้างมักเป็นแผ่นรวมหลายไอคอน — ตรวจก่อนว่าแยกชิ้นได้ไหม
     ถ้าได้ตั้งแต่ 2 ชิ้นขึ้นไป พาไปหน้าตัดแทนที่จะย่อทั้งแผ่นเป็นไอคอนเดียว
     (แบนเนอร์ข้ามไป — มันเป็นภาพเต็มกรอบใบเดียวอยู่แล้ว ไม่ใช่แผ่นไอคอน) */
  if (assetKind !== 'banner') {
    try {
      const image = await fileToImage(file);
      const sheet = sheetCanvas(image);
      if (detectTiles(sheet.data).tiles.length >= 2) {
        openSlicer(image, assetKind, file);
        return;
      }
    } catch (error) {
      console.error('slice detection failed', error);   // ตรวจไม่ได้ก็ไปทางปกติ ไม่ใช่บล็อกการอัปโหลด
    }
  }

  await uploadSingleAsset(file);
  event.target.value = '';
});

/* ทางเดิม: หนึ่งไฟล์ = หนึ่งรูป (ย่อ/ครอบให้พอดีสเปกแล้วอัปโหลด)
   แยกออกมาเป็นฟังก์ชันเพราะปุ่ม "ใช้ทั้งภาพเป็นไอคอนเดียว" ในหน้าตัดเรียกซ้ำ */
async function uploadSingleAsset(file) {
  const spec = assetSpecs[assetKind];
  try {
    const { dataUrl, blob } = await normaliseUpload(file, spec);
    const label = file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'รูปที่อัปโหลด';
    let finalSrc = dataUrl;
    if (liveMode) {
      $('#assetError').textContent = 'กำลังอัปโหลด…';
      try {
        finalSrc = await TripApi.uploadIcon(blob, `${label}.webp`);
        $('#assetError').textContent = '';
      } catch (uploadError) {
        /* ต้องบอกให้ชัดว่า "ยังไม่ถูกบันทึก" ไม่ใช่แค่แจ้งว่ามีอะไรผิดพลาด
           ข้อความเดิมเขียนว่าจะฝังรูปไปกับข้อมูลแทน ซึ่งไม่จริง — ฐานปฏิเสธ
           รูปแบบ data: ผลคือผู้ใช้เห็นรูปบนจอ คิดว่าเรียบร้อยแล้ว แต่พอรีเฟรช
           รูปหาย และไม่มีใครรู้ว่าทำไม (เจอจริง 2026-08-11)

           แจ้งสองที่: ข้อความในกล่อง (อ่านรายละเอียดได้) และ toast (เห็นแน่นอน)
           เพราะข้อความเล็ก ๆ ในกล่องอย่างเดียวคนมองข้ามจริง ๆ */
        $('#assetError').textContent = `⚠️ อัปโหลดไม่สำเร็จ (${uploadError.message}) · รูปนี้จะยังไม่ถูกบันทึก`;
        showPrototypeToast(`⚠️ อัปโหลดไม่สำเร็จ: ${uploadError.message}`);
        console.error('icon upload failed', uploadError);
      }
    }
    assetLibrary[assetKind].unshift({ id:`up-${Date.now()}`, label, src: finalSrc, uploaded:true });
    // ดึงคลังใหม่เพื่อให้รูปที่เพิ่งอัปโหลดมี key จริงสำหรับปุ่มลบ
    loadUploadedIcons().then(renderAssetGrid);
    assetChoice = finalSrc;
    renderAssetGrid();
    saveState();
  } catch (error) {
    $('#assetError').textContent = error.message;
  }
}

$('#assetConfirm').addEventListener('click', () => {
  if (!assetChoice) {
    $('#assetError').textContent = 'ยังไม่ได้เลือกรูป';
    return;
  }
  /* Close first, then hand back: the callbacks re-open the form they were
     called from, and closeLayers() would otherwise shut it again immediately. */
  const onPick = assetOnPick;
  assetOnPick = null;
  closeLayers();
  onPick?.(assetChoice);
});

/* ── Trip banner ── */
let tripBanner = 'art/hokkaido-illustrated-clean.png';
let newTripBanner = 'art/hokkaido-illustrated-clean.png';

function applyTripBanner(src) {
  tripBanner = src;
  $('.map-hero img').src = src;
  saveState();   // โหมดข้อมูลจริงจะไม่ทำอะไร — บันทึกผ่าน API แทน
}

/* รูปที่ผู้ใช้อัปโหลดเองเป็น data: URL ยาวเป็นแสนตัวอักษร เก็บลงคอลัมน์
   theme_banner ไม่ไหวและจะทำให้แถวใน Projects บวมจนดึงทริปช้าทั้งระบบ
   จึงรับเฉพาะรูปที่มีอยู่ในโปรเจกต์ · เก็บ data: ไว้ในเบราว์เซอร์เหมือนเดิม */
const isUploadedImage = src => String(src || '').startsWith('data:');

const openBannerPicker = () => openAssetPicker('banner', tripBanner, src => {
  applyTripBanner(src);
  if (!liveMode) { showPrototypeToast('เปลี่ยนภาพแบนเนอร์แล้ว'); return; }
  /* รูปที่อัปโหลดเองจะถูกส่งขึ้นเซิร์ฟเวอร์ตั้งแต่ตอนเลือกไฟล์แล้ว (ดู #assetUpload)
     ค่าที่ได้มาตรงนี้จึงเป็น URL สั้น ๆ ไม่ใช่ data: — เก็บลงฐานได้ตามปกติ
     ถ้ายังเป็น data: แปลว่าอัปโหลดล้มเหลว ต้องบอกตรง ๆ ว่ารีเฟรชแล้วจะหาย
     ไม่ใช่ปล่อยให้คิดว่าบันทึกแล้ว (เคยเป็นแบบนั้นจนรูปหายจริง 2026-08-11) */
  if (isUploadedImage(src)) {
    showPrototypeToast('อัปโหลดรูปไม่สำเร็จ · รูปนี้จะหายเมื่อรีเฟรช');
    return;
  }
  /* ไม่ดึงข้อมูลใหม่ทั้งชุดหลังบันทึก เพราะรูปบนจอถูกเปลี่ยนไปแล้วและการ
     re-render ทั้งหน้าเพื่อรูปเดียวทำให้จอกระพริบโดยไม่จำเป็น */
  TripApi.saveBanner(src)
    .then(() => showPrototypeToast('เปลี่ยนภาพแบนเนอร์แล้ว · บันทึกถาวร'))
    .catch(error => showPrototypeToast(`บันทึกแบนเนอร์ไม่สำเร็จ: ${error.message}`));
});
$('#changeBanner').addEventListener('click', openBannerPicker);
$('#editTripBanner').addEventListener('click', openBannerPicker);

$('#pickNewTripBanner').addEventListener('click', () => openAssetPicker('banner', newTripBanner, src => {
  newTripBanner = src;
  $('#newTripBannerPreview').src = src;
  mask.classList.add('open');
  $('#newTripDialog').classList.add('open');
  $('#newTripDialog').setAttribute('aria-hidden', 'false');
}));

$('#openNewTrip').addEventListener('click', () => {
  /* โหมดข้อมูลจริง: ปุ่มนี้เดิมเป็นของ demo ล้วน ๆ — เปลี่ยนแค่ข้อความบนจอ
     ไม่ได้สร้างทริปจริงหรือบันทึกอะไรเลย ถ้าปล่อยไว้ในโหมดจริงจะหลอกผู้ใช้
     ว่าสร้างทริปสำเร็จทั้งที่ไม่มีอะไรถูกบันทึก จึงพาไปหน้าสร้างทริปจริงแทน */
  if (liveMode) { location.href = 'trips.html?all=1'; return; }
  newTripBanner = 'art/hokkaido-illustrated-clean.png';
  $('#newTripBannerPreview').src = newTripBanner;
  $('#newTripName').value = '';
  mask.classList.add('open');
  $('#newTripDialog').classList.add('open');
  $('#newTripDialog').setAttribute('aria-hidden', 'false');
});

$('#newTripForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#newTripName').value.trim();
  const range = `${$('#newTripStart').value} – ${$('#newTripEnd').value}`;
  $('.topbar b').textContent = name;
  $('.topbar small').textContent = `${range} · วางแผนอยู่`;
  applyTripBanner(newTripBanner);
  closeLayers();
  showScreen('today');
  showPrototypeToast(`สร้างทริป ${name} แล้ว`);
});

/* ── Persistence ───────────────────────────────────────────────────────
   Prototype-local only: everything lives in this browser under one key so a
   review can span several sittings. Nothing is sent anywhere and no real
   account is touched. STORAGE_VERSION invalidates saves whose shape predates
   the payer/owner/wallet split, which would otherwise render as blank rows. */
const STORAGE_KEY = 'unified-trip-prototype';
/* Bump on any bill or planDay shape change. v3 = 12-day itinerary with the
   richer weather object (feels/periods/tip). v4 = participants[] replaced the
   flat participantIds[] and fundings were added; an older save would render
   an empty weather card or a bill with no split. */
const STORAGE_VERSION = 9;
let restoring = false;

function saveState() {
  // โหมดข้อมูลจริงไม่เขียนลง localStorage เลย ไม่งั้นข้อมูลจริงจะไปทับ
  // ข้อมูลตัวอย่างที่ค้างไว้ และพอกลับมาโหมดปกติจะเห็นตัวเลขจริงปนอยู่
  if (restoring || liveMode) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION, bills, planDays, activePlanDayId, tripBanner, fundings, viewerId, tripCurrencies, wallets, tripClosed, postingDate, tripLog, presence,
      // Only user uploads need persisting; bundled art is already in the code.
      uploads: Object.fromEntries(Object.entries(assetLibrary)
        .map(([kind, list]) => [kind, list.filter(asset => asset.uploaded)]))
    }));
  } catch (error) {
    // Most likely the 5 MB quota after several uploads — say so plainly.
    console.warn('เก็บข้อมูล prototype ไม่สำเร็จ', error);
    showPrototypeToast('พื้นที่เก็บในเบราว์เซอร์เต็ม · รูปที่อัปโหลดล่าสุดอาจไม่ถูกบันทึกข้าม reload');
  }
}

function loadState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    saved = null;
  }
  if (!saved || saved.version !== STORAGE_VERSION) return;
  restoring = true;
  if (Array.isArray(saved.bills)) {
    // Drop anything missing the current shape rather than half-rendering it.
    bills = saved.bills.filter(bill => bill && bill.ownerId && bill.payerId
      && Array.isArray(bill.categories) && Array.isArray(bill.participants));
  }
  if (Array.isArray(saved.planDays) && saved.planDays.length) {
    planDays.length = 0;
    planDays.push(...saved.planDays);
  }
  if (saved.activePlanDayId && planDays.some(day => day.id === saved.activePlanDayId)) {
    activePlanDayId = saved.activePlanDayId;
  }
  if (saved.uploads) {
    Object.entries(saved.uploads).forEach(([kind, list]) => {
      if (assetLibrary[kind] && Array.isArray(list)) assetLibrary[kind].unshift(...list);
    });
  }
  if (saved.tripBanner) tripBanner = saved.tripBanner;
  if (Array.isArray(saved.fundings)) fundings = saved.fundings;
  if (Array.isArray(saved.tripCurrencies) && saved.tripCurrencies.length) tripCurrencies = saved.tripCurrencies;
  if (Array.isArray(saved.wallets) && saved.wallets.length) wallets = saved.wallets;
  tripClosed = Boolean(saved.tripClosed);
  postingDate = saved.postingDate || '';
  if (Array.isArray(saved.tripLog)) tripLog = saved.tripLog;
  if (saved.presence && typeof saved.presence === 'object') presence = { ...presence, ...saved.presence };
  if (saved.viewerId && memberById(saved.viewerId)) viewerId = saved.viewerId;
  restoring = false;
  $('.map-hero img').src = tripBanner;
}

$('#resetDemo').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

/* ── โหมดข้อมูลจริง ────────────────────────────────────────────────────
   เปิดด้วย ?live=1&projectId=…&userId=… เท่านั้น ไม่ใส่ = ข้อมูลตัวอย่างเหมือนเดิม

   อ่านอย่างเดียว: ปิด saveState ทันทีที่เข้าโหมดนี้ เพื่อไม่ให้ข้อมูลจริง
   ไปทับ localStorage ของโหมดตัวอย่าง และไม่ให้เผลอคิดว่าที่แก้บนจอถูกบันทึกแล้ว
   ทุกปุ่มที่แก้เงินถูกล็อกด้วย applyTripLock() ตัวเดียวกับตอนปิดทริป
   (ตัวแปร liveMode ประกาศไว้บนสุดของไฟล์ เพราะ applyTripLock ใช้ตั้งแต่ render แรก) */

/* แถบแจ้งสถานะบนสุด — โชว์ "เฉพาะตอนมีปัญหา" เท่านั้น (2026-08-10)
   เดิมมีแถบบอกว่า "นี่คือข้อมูลจริง" ค้างอยู่ตลอดเวลา รวมกับแถบ prototype-note
   และกล่องในหน้าอีก เท่ากับพูดเรื่องเดียวกันสามที่ กินพื้นที่จอมือถือไป ~4 แถว
   ทั้งที่เป็นข่าวดีที่ไม่ต้องบอกซ้ำ — ถ้าทุกอย่างปกติก็ไม่ต้องมีแถบ

   แต่ตอน "โหลดข้อมูลจริงไม่สำเร็จ" ยังต้องมีแถบเสมอ เพราะจอจะโชว์ข้อมูล
   ตัวอย่างแทน ถ้าเงียบไว้ผู้ใช้จะเข้าใจผิดว่าตัวเลขบนจอเป็นของจริง */
function markLiveBanner(text, tone = 'live') {
  const bar = document.querySelector('#liveBar');
  if (tone === 'live') { bar?.remove(); return; }
  const el = bar || Object.assign(document.createElement('div'), { id: 'liveBar' });
  if (!bar) document.body.prepend(el);
  el.className = `live-bar live-bar--${tone}`;
  el.textContent = text;
}

function applyLiveState(state) {
  restoring = true;
  liveMode = true;
  // members เป็น const จึงต้องเปลี่ยนของในอาร์เรย์เดิม ไม่ใช่ผูกตัวใหม่
  members.length = 0;
  members.push(...state.members);
  wallets = state.wallets;
  fundings = state.fundings;
  bills = state.bills;
  tripLog = state.tripLog;
  tripClosed = state.tripClosed;
  postingDate = state.postingDate;
  liveTripEndDate = state.tripEndDate || '';
  liveCanManage = Boolean(state.canManageTrip);
  liveCanManageMembers = Boolean(state.canManageMembers);
  liveCanManageSharedSettings = Boolean(state.canManageSharedSettings);
  /* มีจุดแวะจริงถึงจะทับแผนตัวอย่าง — ทริปที่ยังไม่ได้วางแผนจะได้ไม่เห็นหน้าว่างเปล่า
     planDays เป็น const จึงต้องเปลี่ยนของในอาร์เรย์เดิม */
  if (state.planDays.length) {
    /* 🔴 อย่าเด้งกลับวันแรก (North 2026-09-07)
       ทุกครั้งที่บันทึกอะไรสักอย่าง submitLive จะโหลดของจริงกลับมาแล้ววิ่งผ่าน
       ตรงนี้ — เดิมบรรทัดล่างสุดโยน activePlanDayId กลับไปเป็นวันแรกตายตัว
       ผลคือแก้สถานที่ของวันที่ 5 เสร็จปุ๊บจอเด้งไปวันที่ 1 ทุกที ต้องเลื่อน
       แท็บกลับมาเองใหม่ทุกรอบ · ตอนนี้ยึดวันเดิมไว้ก่อนเสมอ */
    const stayDate = takePlanFocusDate() || planDays.find(day => day.id === activePlanDayId)?.date || '';
    planDays.length = 0;
    planDays.push(...state.planDays);
    activePlanDayId = pickPlanDayId(stayDate);
  }
  if (state.tripCurrencies.length) tripCurrencies = state.tripCurrencies;
  ledgerCategories = state.ledgerCategories || [];
  tripPresets = state.presets || [];
  tripDocuments = state.documents || [];
  presence = state.presence || {};
  liveIsGuest = Boolean(state.isGuest);
  applyTheme(state.themeId || DEFAULT_THEME);
  /* ⚠️ ต้องตั้ง viewerId ก่อนเรียก fillTripMetaForm — ฟอร์มเช็คสิทธิ์ admin
     จาก viewerId ถ้าเรียกสลับกัน มันจะเช็คด้วยตัวตนของข้อมูลตัวอย่างเก่า
     แล้วปิดปุ่มบันทึกใส่ทุกคน แม้แต่ผู้ดูแลจริง (เคยพังมาแล้ว 2026-08-02)
     เซิร์ฟเวอร์ตอบ viewer = null ได้จริง (สมาชิกทริปเก่ายังไม่ผูก user_id)
     — ตั้งเป็น null ตรง ๆ อย่าปล่อยให้ค้างเป็น id ของข้อมูลตัวอย่าง */
  viewerId = state.viewerId || null;
  fillTripMetaForm(state);
  if (state.banner) {
    tripBanner = state.banner;
    $('.map-hero img').src = tripBanner;
  }
  restoring = false;

  /* ชื่อทริปและช่วงวันที่ใน header เป็นข้อความคงที่ในไฟล์ HTML — ในโหมดข้อมูลจริง
     มันจะโชว์ "8–19 ก.พ. 2027" ทั้งที่ทริปจริงคือ 17–27 ธ.ค. 2026 ซึ่งขัดกับ
     ตัวเลขที่อยู่ข้างล่างทั้งหน้า จึงต้องเขียนทับด้วยของจริง */
  const range = state.tripStartDate && state.tripEndDate
    ? `${thaiDate(state.tripStartDate)} – ${thaiDate(state.tripEndDate)}`
    : (state.tripEndDate ? `จบ ${thaiDate(state.tripEndDate)}` : '');
  const status = state.tripClosed ? 'ปิดทริปแล้ว' : 'กำลังดำเนินอยู่';
  if (state.tripName) {
    $('#tripTitle').textContent = state.tripName;
    $('#brandTitle').textContent = state.tripName;
  }
  $('#tripDates').textContent = [range, status].filter(Boolean).join(' · ');
  $('#brandSub').textContent = range || status;

  /* ป้าย demo-flag ถูกถอดออกแล้ว (2026-08-10)
     - การ์ดอากาศ: #weatherTip เขียนข้อความเดียวกันอยู่แล้ว ป้ายนี้จึงซ้ำเปล่า ๆ
     - หน้าแผนเที่ยว: ข้อความเดิมบอกว่า "แก้จากหน้านี้ไม่ได้" ซึ่งไม่จริงแล้ว
       ตั้งแต่มี API ฝั่งเขียนจุดแวะ (savePlanItemLive) — ป้ายที่ผิดแย่กว่าไม่มีป้าย */

  applyTripLock();
  [renderBills, renderWallets, renderMoneyStrip, renderMembers, renderCurrencies,
   renderTripPresets, renderDocumentLibrary, renderJoinLink, renderPresence,
   refreshQuickAdd, renderPlanWorkspace].forEach(render => render());
  /* การ์ดอากาศผูกกับ dayId ของแผนตัวอย่าง พอเปลี่ยนเป็นวันจริงแล้ว id ไม่ตรงกัน
     renderTodayWeather จะ return ทันทีและปล่อยตัวเลขเดิมค้างบนจอ ต้องสั่งใหม่เอง */
  /* แถบสรุปวันใต้แบนเนอร์ต้องเป็นวันของทริปจริง ไม่ใช่ "Lake Akan → Lake Kussharo"
     ของข้อมูลตัวอย่าง · ต้องเรียกก่อน renderMoneyStrip เพราะ "ใช้วันนี้" อ่าน
     dayId จาก journeyStops[actualJourneyIndex] ถ้ายังเป็นของเก่าจะได้ ฿0 เสมอ */
  buildLiveJourney();
  /* buildLiveJourney เลือกไว้แล้วว่าควรยืนที่ช่องไหน (วันที่เพิ่งดูอยู่ ถ้ายังอยู่
     ไม่งั้นค่อยเป็น "วันนี้") — ส่งค่านั้นต่อ อย่าบังคับกลับเป็น actual ทุกรอบ */
  renderJourneyPreview(previewJourneyIndex);   // เรียก renderTodayWeather ของวันนั้นให้ในตัว
  renderPresence(); // renderJourneyPreview เพิ่งระบุ Stop ที่ปุ่มเช็กอินต้องใช้
  renderMoneyStrip();
  refreshTripMap();   // หมุดต้องเป็นของทริปจริง ไม่ใช่ของแผนตัวอย่างที่ค้างอยู่

  /* ปกติไม่มีแถบสถานะ — ชื่อทริป จำนวนบิล และยอดสุทธิ อยู่บนจอให้เห็นอยู่แล้ว
     ยกเว้นกรณีเดียวที่ต้องเตือน: ตัวตนมาจาก ?userId= ใน URL ไม่ใช่การล็อกอินจริง
     ซึ่งแปลว่ากำลังดูในนามคนอื่นได้ — อันนี้เงียบไม่ได้ */
  if (TripApi.config.userSource === 'url') {
    markLiveBanner('⚠️ ระบุตัวตนจาก URL ไม่ใช่การล็อกอิน — ข้อมูลที่เห็นอาจไม่ใช่ของคุณ', 'error');
  } else {
    markLiveBanner('', 'live');
  }
}

/* ดึงใหม่ทั้งชุดหลังเขียนสำเร็จ แทนที่จะแก้อาร์เรย์ฝั่งหน้าจอเอง
   เพราะเซิร์ฟเวอร์เป็นคนปัดเศษ เกลี่ยเศษ และคิดเรทเฉลี่ยใหม่ — ถ้าหน้าจอ
   เดาผลลัพธ์เอง ตัวเลขบนจอกับในฐานจะค่อย ๆ ห่างกันโดยไม่มีใครรู้ */
async function refreshFromServer() {
  applyLiveState(await TripApi.fetchTrip());
}

async function enterLiveMode() {
  markLiveBanner('กำลังโหลดข้อมูลจริง…', 'loading');
  applyLiveState(await TripApi.fetchTrip());
  /* จำทริปที่เปิดล่าสุดไว้ในเครื่อง — เมนู Unified Trip จะพากลับเข้าทริปนี้
     ทันทีในครั้งถัดไป (trips.html เด้งมาเอง) · จำเฉพาะตอนโหลดสำเร็จเท่านั้น
     ทริปที่เข้าไม่ได้/ถูกลบไปแล้วจะได้ไม่ถูกจำจนเด้งวนเข้า error ซ้ำ ๆ */
  try { localStorage.setItem('unified-trip-last', TripApi.config.projectId); } catch {}
}

/* แถบ .prototype-note ถูกถอดออกจาก HTML แล้ว (2026-08-10) — ลบซ้ำตรงนี้เผื่อ
   เบราว์เซอร์ผู้ใช้ยังแคช HTML เวอร์ชันเก่าไว้ ไม่งั้นเขาจะเห็นข้อความ
   "ข้อมูลจำลอง ไม่เชื่อมบัญชีจริง" ค้างอยู่ ทั้งที่กำลังดูข้อมูลจริง */
document.querySelector('.prototype-note')?.remove();

applyTheme(DEFAULT_THEME);   // ตั้งธีมเริ่มต้นก่อน เดี๋ยวโหมดข้อมูลจริงจะทับด้วยของทริป
loadState();
/* ── ลิงก์เดียวทั้งทริป (2026-08-23) ───────────────────────────────────
   North: "ลิงก์ที่เข้าใช้งานคือลิงก์ที่ทุกคนเข้าได้ ไม่ว่าจะเป็นบัญชีหลัก
           หรือบัญชีผู้ร่วมทริป"

   เดิมมีสองลิงก์คนละแบบ (ลิงก์ตรงสำหรับบัญชีครอบครัว · join.html สำหรับ
   ผู้ร่วมทริป) ซึ่งส่งผิดลิงก์ให้ผิดคนได้ง่ายมาก และคนรับก็ไม่รู้ว่าตัวเอง
   ควรได้ลิงก์แบบไหน

   ตอนนี้เหลือลิงก์เดียว: เปิดแล้วถ้ายังไม่มีตัวตน (ไม่ได้ล็อกอินบัญชีครอบครัว
   และไม่มี token ผู้ร่วมทริป) จะเด้งไปหน้าใส่รหัส แล้วกลับมาที่ทริปเดิมให้เอง

   ⚠️ เช็คจาก hasIdentity ไม่ใช่ userSource — ผู้ร่วมทริปที่ล็อกอินด้วยรหัส
      มี token ของตัวเองแต่ไม่มี userId ของระบบบัญชีครอบครัว ถ้าดูแค่ userSource
      จะนับว่า "ไม่มีตัวตน" แล้วเด้งเขากลับหน้าใส่รหัสวนไม่รู้จบ */
if (TripApi.config.enabled && !TripApi.config.hasIdentity) {
  const back = encodeURIComponent(location.href);
  location.replace(`join.html?projectId=${encodeURIComponent(TripApi.config.projectId)}&next=${back}`);
} else if (TripApi.config.enabled) {
  enterLiveMode().catch(error => {
    // ล้มแล้วต้องบอกให้ชัดว่ากำลังดูข้อมูลตัวอย่างอยู่ ไม่ใช่เงียบแล้วปล่อย
    // ให้เข้าใจผิดว่าตัวเลขบนจอมาจากฐานจริง
    console.error(error);
    markLiveBanner(`โหลดข้อมูลจริงไม่สำเร็จ: ${error.message} · ตัวเลขที่เห็นเป็นข้อมูลตัวอย่าง`, 'error');
    /* ถ้าทริปที่จำไว้คือทริปนี้เอง ให้เลิกจำ — ไม่งั้นเมนูจะเด้งกลับเข้า
       ทริปที่เปิดไม่ได้ (เช่นถูกลบจากเครื่องอื่น) วนไปเรื่อย ๆ */
    try {
      if (localStorage.getItem('unified-trip-last') === TripApi.config.projectId) {
        localStorage.removeItem('unified-trip-last');
      }
    } catch {}
  });
}
renderPlanWorkspace();
renderBills();
// Paints the weather card and route state from data rather than the markup.
renderJourneyPreview(actualJourneyIndex);
