const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const $ = (selector, root = document) => root.querySelector(selector);

/* scrollIntoView is a no-op on a display:none element, so the active day tab
   has to be centred after the plan screen is actually visible — not inside
   renderPlanWorkspace(), which usually runs while the screen is still hidden. */
function scrollActiveDayTab() {
  $('#planDayTabs .active')?.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
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

function closeLayers() {
  mask.classList.remove('open');
  [sheet, dialog, planEditor, $('#assetPicker'), $('#newTripDialog'), $('#currencyDialog'),
   $('#fundDialog'), $('#walletDialog'), $('#reopenDialog')].forEach(layer => {
    layer.classList.remove('open');
    layer.setAttribute('aria-hidden', 'true');
  });
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

const members = [
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
const yen = value => fmtAmount(value, '¥');
const thb = value => fmtAmount(value, '฿');
const symbolFor = currency => (currency === 'THB' ? '฿' : '¥');

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
  return fmtAmount(bill.amount, symbolFor(bill.currency));
}

const participantIdsOf = bill => (bill.participants || []).map(row => row.memberId);

function billVisibilityLabel(bill) {
  const people = participantIdsOf(bill).length;
  if (bill.visibility === 'private') return 'ส่วนตัว';
  if (bill.visibility === 'selected') return bill.shared ? `ผู้เกี่ยวข้อง · แบ่ง ${people} คน` : 'เฉพาะผู้เกี่ยวข้อง';
  return bill.shared ? `ทุกคนเห็น · แบ่ง ${people} คน` : 'ทุกคนเห็น';
}

function billCategoryLabel(bill) {
  return bill.categories.map(row => `${row.name} ${fmtAmount(row.amount, symbolFor(bill.currency))}`).join(' · ');
}

/* An explicitly chosen icon wins; otherwise fall back to the category's own
   icon (ครอบครัวตั้งเองผ่านหน้า "เพิ่มเติม" ถ้ามี) แล้วค่อยตกไปที่ชุดไอคอนเดิม */
function billIcon(bill) {
  const name = bill.categories[0]?.name;
  return bill.image || categoryIconOverride(name) || `${ART}${categoryIcons[name] || 'st_camera2.png'}`;
}

/* Visibility gate — the prototype only ever renders what the signed-in member
   is allowed to see, so PRIVATE bills of other members never reach the DOM. */
function canSee(bill, viewer = viewerId) {
  if (bill.visibility === 'trip') return true;
  if (bill.ownerId === viewer || bill.payerId === viewer) return true;
  if (bill.visibility === 'selected') return participantIdsOf(bill).includes(viewer);
  return false;
}

function renderBills() {
  const readable = bills.filter(bill => canSee(bill));
  const visibleBills = readable.filter(bill => {
    if (activeBillFilter === 'shared') return bill.shared;
    if (activeBillFilter === 'mine') return bill.payerId === viewerId;
    if (activeBillFilter === 'trip-only') return isTripOnly(bill.ownerId);
    return true;
  });

  $('#billTable').innerHTML = visibleBills.length ? visibleBills.map(bill => {
    const wallet = walletById(bill.walletId);
    const payerLine = bill.payerId === bill.ownerId
      ? `${memberName(bill.payerId)} จ่าย`
      : `${memberName(bill.payerId)} จ่าย · เงินของ ${memberName(bill.ownerId)}`;
    return `
    <div class="bill-row" data-bill-id="${bill.id}">
      <img src="${billIcon(bill)}" alt="">
      <div><b>${bill.title}</b><small>${billCategoryLabel(bill)}</small><span class="tag ${bill.visibility === 'private' ? 'private' : 'shared'}">${billVisibilityLabel(bill)}</span></div>
      <div class="payer"><small>${payerLine}</small><b>${billAmountLabel(bill)}</b><small class="wallet-line">ตัดจาก ${wallet ? wallet.label : '—'}</small><em>${isTripOnly(bill.ownerId) ? 'เฉพาะทริป' : 'ลงบัญชีหลัก'}</em></div>
    </div>`;
  }).join('') : `<div class="bill-empty">ไม่มีรายการในมุมมองนี้</div>`;

  const sum = list => list.reduce((total, bill) => total + billBaht(bill), 0);
  $('#billTotal').textContent = fmtAmount(sum(readable), '฿ ');
  $('#billMine').textContent = fmtAmount(sum(readable.filter(bill => bill.payerId === viewerId && !isTripOnly(bill.ownerId))), '฿ ');
  $('#billTripOnly').textContent = fmtAmount(sum(readable.filter(bill => isTripOnly(bill.ownerId))), '฿ ');

  const planned = billsBySource(readable, 'planned');
  const unknown = billsBySource(readable, 'none');
  const notes = [];
  if (unknown.length) notes.push(`⛔ ${unknown.length} บิลยังตีมูลค่าเป็นบาทไม่ได้ — สกุลเงินนี้ยังไม่มีทั้งเรทประมาณการและการเติมเงินจริง จึงไม่ถูกนับในยอดรวม`);
  if (planned.length) notes.push(`📌 ${planned.length} บิลใช้<b>เรทประมาณการ</b>อยู่ เพราะกระเป๋านั้นยังไม่มีการเติมเงินจริง — ตัวเลขจะเปลี่ยนเมื่อบันทึกเติมเงิน`);
  if (!unknown.length && !planned.length && readable.length) {
    notes.push(tripClosed
      ? '🔒 ทริปปิดแล้ว · <b>เรทถูกล็อกไว้ที่ค่าตอนปิดทริป</b> ตัวเลขทั้งหมดจะไม่ขยับอีก'
      : '💱 ทุกบิลใช้เรทเฉลี่ยจริงของกระเป๋า · <b>เรทยังไม่นิ่ง จะล็อกตอนปิดทริป</b>');
  }
  $('#billNotice').innerHTML = notes.join('<br>');
  $('#billNotice').className = `field-note bill-notice${unknown.length ? ' danger' : (planned.length ? '' : ' calm')}`;
  const counter = $('#storageCount');
  if (counter) counter.textContent = `${bills.length} รายการ`;
  renderWallets();
  renderMoneyStrip();
  renderMembers();
  renderCurrencies();
  renderCategoryIconManager();
  renderCloseLines();
  renderPresence();
  applyTripLock();
  saveState();
}

/* ── Wallets ───────────────────────────────────────────────────────────
   Balance and funding history are private to the wallet's owner, so the
   screen only ever builds cards for wallets the current viewer owns. */
function walletSummary(wallet) {
  const lots = fundings.filter(row => row.walletId === wallet.id);
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

function renderWallets() {
  /* viewer หาไม่เจอได้จริง — ทริปเก่าที่สมาชิกยังไม่ถูกผูกกับบัญชีล็อกอิน
     (TripMembers.user_id เป็น NULL) เซิร์ฟเวอร์จะตอบ viewer = null
     ห้ามพังทั้งหน้า ให้บอกตรง ๆ ว่ายังไม่รู้ว่าเราเป็นสมาชิกคนไหน */
  const viewer = memberById(viewerId);
  if (!viewer) {
    $('#walletHeading').textContent = 'กระเป๋า';
    $('#walletPrivacy').innerHTML = '⚠️ ระบบยังไม่รู้ว่าคุณเป็นสมาชิกคนไหนของทริปนี้ จึงแสดงกระเป๋าไม่ได้ · ให้ผู้ดูแลทริปผูกบัญชีของคุณก่อน';
    $('#walletGrid').innerHTML = '';
    $('#walletActivity').innerHTML = '';
    return;
  }
  const owned = wallets.filter(wallet => wallet.ownerId === viewerId);
  $('#walletHeading').textContent = `กระเป๋าของ ${viewer.name}`;
  $('#walletPrivacy').innerHTML = owned.length
    ? `🔒 ยอดคงเหลือและประวัติการเติมเงินนี้เห็นเฉพาะ ${viewer.name} และผู้ดูแลที่ได้รับสิทธิ์ · สมาชิกอื่นเห็นได้แค่บิลที่แชร์`
    : `🔒 ${viewer.name} ยังไม่มีกระเป๋าของตัวเอง · ยอดของสมาชิกคนอื่นถูกซ่อนไว้ตามสิทธิ์`;

  $('#walletGrid').innerHTML = owned.map(wallet => {
    const s = walletSummary(wallet);
    const symbol = symbolFor(wallet.currency);

    /* Show which rate is in play, never a bare number: an estimate and a real
       weighted average look identical otherwise. */
    const info = rateInfo(wallet.currency, wallet.id);
    const secondary = info.source === 'base'
      ? 'ใช้สำหรับรายการที่ตัดเป็นเงินบาท'
      : (info.rate === null
        ? `<span class="unknown-rate">ยังไม่มีทั้งเรทประมาณการและการเติมเงิน</span>`
        : `≈ ${thb(s.leftover * info.rate)} · ${info.source === 'planned' ? 'เรทประมาณการ' : 'เรทเฉลี่ย'} ฿${info.rate.toFixed(4)}/${symbol}`);
    const badge = info.source === 'base' ? '' : rateBadge(info.source);

    /* Spending more than the recorded funding almost always means a top-up
       hasn't been logged yet, not that the card is overdrawn. Say which. */
    const warning = s.leftover < 0
      ? `<p class="wallet-warn">⚠️ ใช้เกินยอดที่บันทึกเติมไว้ ${fmtAmount(Math.abs(s.leftover), symbol)} — น่าจะยังบันทึกการเติมเงินไม่ครบ<br>
         <small>บันทึกย้อนหลังได้ ระบบคิดเรทเฉลี่ยใหม่ทั้งทริปให้เอง ไม่ขึ้นกับลำดับที่บันทึก</small></p>`
      : '';

    return `
    <article class="wallet-card ${wallet.currency.toLowerCase()}${s.leftover < 0 ? ' short' : ''}">
      <div class="wallet-top">
        <span class="wallet-id">
          <img class="wallet-icon" src="${wallet.icon || DEFAULT_ICONS.wallet}" alt="">
          <b>${wallet.label}</b>
        </span>
        <button type="button" class="icon-swap" data-wallet-icon="${wallet.id}" title="เปลี่ยนไอคอนกระเป๋า">🎨</button>
      </div>
      <strong>${fmtAmount(s.leftover, `${symbol} `)}</strong>
      <small>${secondary}</small>
      ${badge}
      ${warning}
      <div class="wallet-stats"><span>เติมแล้ว<b>${fmtAmount(s.fundedForeign, symbol)}</b></span><span>ใช้ไป<b>${fmtAmount(s.spent, symbol)}</b></span></div>
      ${info.source === 'base' ? '' : `<label class="carry-toggle${wallet.excludeOnClose ? ' on' : ''}">
        <input type="checkbox" data-carry-wallet="${wallet.id}" ${wallet.excludeOnClose ? 'checked' : ''} ${tripClosed ? 'disabled' : ''}>
        <span><b>ยกยอดไปทริปหน้า</b><small>${wallet.excludeOnClose
          ? 'เงินเหลือจะไม่คืนเข้าบัญชี · เก็บไว้เป็นล็อตตั้งต้นของทริปถัดไป'
          : 'เงินเหลือจะถูกคืนเข้าบัญชีต้นทางตอนปิดทริป'}</small></span></label>`}
      <button class="soft-btn" data-fund-wallet="${wallet.id}"${tripClosed ? " disabled" : ""}>＋ เติมเงิน</button>
    </article>`;
  }).join('') || `<div class="bill-empty">ไม่มีกระเป๋าให้แสดงในมุมมองนี้</div>`;

  const ownedIds = owned.map(wallet => wallet.id);
  const rows = [
    ...bills.filter(bill => ownedIds.includes(bill.walletId)).map(bill => ({
      sort: bill.id, title: bill.title,
      note: bill.shared ? 'ค่าใช้จ่ายร่วม' : 'ส่วนตัว',
      value: -bill.amount, currency: walletById(bill.walletId).currency
    })),
    ...fundings.filter(row => ownedIds.includes(row.walletId)).map(row => ({
      sort: row.date, title: row.note,
      note: `${row.date} · เห็นเฉพาะคุณ`,
      value: row.foreign, currency: walletById(row.walletId).currency
    }))
  ];
  $('#walletActivity').innerHTML = rows.length ? rows.map(row => `
    <div><span>${row.title}<small>${row.note}</small></span>
    <b class="${row.value < 0 ? 'minus' : 'plus'}">${fmtAmount(row.value, symbolFor(row.currency))}</b></div>`).join('')
    : `<div class="bill-empty">ยังไม่มีความเคลื่อนไหว</div>`;
}

/* "ใช้วันนี้" now sums the bills actually linked to today's activities
   instead of quoting a fixed number that never moved. */
function renderMoneyStrip() {
  const todayId = journeyStops[actualJourneyIndex].dayId;
  const todayActivityIds = (planDays.find(day => day.id === todayId)?.activities || []).map(a => a.id);
  const readable = bills.filter(bill => canSee(bill));
  const todayThb = readable
    .filter(bill => todayActivityIds.includes(bill.activityId))
    .reduce((sum, bill) => sum + billBaht(bill), 0);
  const tripThb = readable.reduce((sum, bill) => sum + billBaht(bill), 0);
  const left = TRIP_BUDGET_THB - tripThb;

  $('#spentLabel').textContent = `ใช้วันนี้ (Day ${journeyStops[actualJourneyIndex].day})`;
  $('#spentToday').textContent = fmtAmount(todayThb, '฿ ');
  $('#spentTodayNote').textContent = todayActivityIds.length
    ? `จาก ${readable.filter(bill => todayActivityIds.includes(bill.activityId)).length} บิลที่ผูกกับกิจกรรมวันนี้`
    : 'ยังไม่มีกิจกรรมในวันนี้';
  $('#budgetLeft').textContent = fmtAmount(left, '฿ ');
  $('#budgetNote').textContent = `${Math.round(Math.max(0, left) / TRIP_BUDGET_THB * 100)}% ของงบ ${fmtAmount(TRIP_BUDGET_THB, '฿')}`;
  $('#budgetLeft').classList.toggle('over', left < 0);
}

function renderMembers() {
  const faces = { north:'pink', nimz:'blue', ann:'cream', mew:'sage' };
  $('#memberRows').innerHTML = members.map(member => `
    <button type="button" class="member-row ${member.id === viewerId ? 'viewing' : ''}" data-view-as="${member.id}">
      <i class="face ${faces[member.id] || 'pink'}">${member.name[0]}</i>
      <span><b>${member.name}</b><small>${member.role} · ${member.ledgerMode === 'TRIP_ONLY' ? 'TRIP ONLY' : 'ลงบัญชีหลัก'}</small></span>
      <em>${member.id === viewerId ? 'กำลังดูอยู่' : 'ดูมุมมองนี้'}</em>
    </button>`).join('');
}

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
        ${currency.base ? '' : `<button type="button" data-edit-currency="${currency.code}" ${tripClosed ? `disabled title="${TRIP_LOCK_REASON}"` : ''}>แก้ไข</button>
        <button type="button" data-remove-currency="${currency.code}" ${tripClosed ? `disabled title="${TRIP_LOCK_REASON}"` : (used.length ? 'disabled title="ยังมีกระเป๋าใช้สกุลนี้อยู่"' : '')}>ลบ</button>`}
      </span>
    </div>`;
  }).join('');
}

/* ── ไอคอนประจำหมวดค่าใช้จ่าย (2026-08-07) ────────────────────────────
   ผูกกับผังบัญชีของ "ครอบครัว" (Categories.icon_asset) ไม่ใช่ของทริปนี้
   ทริปเดียว — ตั้งครั้งเดียวแล้วทุกทริปในครอบครัวเห็นไอคอนเดียวกัน
   โหลดครั้งเดียวตอนเข้าโหมดข้อมูลจริง ไม่มีในโหมดตัวอย่าง (prototype) */
let categoryIconRows = [];

function categoryIconOverride(name) {
  return categoryIconRows.find(row => row.name === name)?.icon_asset || null;
}

function renderCategoryIconManager() {
  const host = $('#categoryIconRows');
  if (!host) return;
  if (!liveMode) {
    host.innerHTML = '<p class="field-note">เข้าทริปโหมดข้อมูลจริงก่อนถึงจะตั้งไอคอนหมวดได้ — ในโหมดตัวอย่างใช้ชุดไอคอนเริ่มต้นเสมอ</p>';
    return;
  }
  if (!categoryIconRows.length) {
    host.innerHTML = '<p class="field-note">ครอบครัวนี้ยังไม่มีหมวดค่าใช้จ่ายในผังบัญชี</p>';
    return;
  }
  host.innerHTML = categoryIconRows.map(row => `
    <div class="currency-row" data-category-row="${row.category_id}">
      <span class="currency-mark"><img src="${row.icon_asset || `${ART}${categoryIcons[row.name] || 'st_camera2.png'}`}" alt=""></span>
      <span class="currency-main"><b>${row.name}</b><small>${row.caption_name || ''}</small></span>
      <span class="currency-actions"><button type="button" data-swap-category="${row.category_id}">เปลี่ยนไอคอน</button></span>
    </div>`).join('');
}

async function loadCategoryIconsLive() {
  try {
    const payload = await TripApi.loadCategoryIcons();
    categoryIconRows = payload.categories || [];
  } catch (error) {
    console.error(error);
    categoryIconRows = [];
  }
  renderCategoryIconManager();
}

$('#categoryIconRows')?.addEventListener('click', event => {
  const button = event.target.closest('[data-swap-category]');
  if (!button) return;
  const row = categoryIconRows.find(item => item.category_id === button.dataset.swapCategory);
  if (!row) return;
  openAssetPicker('expense', row.icon_asset || `${ART}${categoryIcons[row.name] || 'st_camera2.png'}`, src => {
    TripApi.saveCategoryIcon(row.category_id, src)
      .then(() => {
        row.icon_asset = src;
        renderCategoryIconManager();
        renderBills();
        showScreen('more');
        showPrototypeToast(`เปลี่ยนไอคอนหมวด ${row.name} แล้ว`);
      })
      .catch(error => showPrototypeToast(`บันทึกไม่สำเร็จ: ${error.message}`));
  });
});

function openCurrencyDialog(code = null) {
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

  // ลิงก์ตรงเข้าทริปนี้ — ใช้ path/query เดียวกับที่เมนูหลักลิงก์มา ใครกด
  // ลิงก์นี้ก็เข้าทริปเดียวกันได้ทันทีโดยไม่ผ่านหน้ารวมทริป
  const linkBox = $('#directTripLink');
  if (linkBox) {
    const projectId = state?.projectId || TripApi.config.projectId || '';
    linkBox.value = projectId
      ? `${location.origin}${location.pathname}?live=1&projectId=${encodeURIComponent(projectId)}`
      : '';
  }

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

$('#copyDirectLink')?.addEventListener('click', async () => {
  const linkBox = $('#directTripLink');
  if (!linkBox?.value) return;
  try {
    await navigator.clipboard.writeText(linkBox.value);
    showPrototypeToast('คัดลอกลิงก์แล้ว');
  } catch {
    // เบราว์เซอร์บางตัว/หน้าที่ไม่ใช่ HTTPS ไม่ให้ใช้ clipboard API — เลือกข้อความให้แทน
    linkBox.select();
    showPrototypeToast('คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความไว้ให้แล้ว กด Ctrl/Cmd+C');
  }
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
async function submitLive(errorSelector, action, successMessage) {
  const errorBox = $(errorSelector);
  if (errorBox) errorBox.textContent = 'กำลังบันทึก…';
  try {
    await action();
    await refreshFromServer();
    closeLayers();
    showPrototypeToast(successMessage);
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

$('#walletGrid').addEventListener('click', event => {
  const swap = event.target.closest('[data-wallet-icon]');
  const fund = event.target.closest('[data-fund-wallet]');
  if (swap) {
    const wallet = walletById(swap.dataset.walletIcon);
    openAssetPicker('wallet', wallet.icon || DEFAULT_ICONS.wallet, src => {
      if (liveMode) {
        submitLive(null, () => TripApi.saveWallet({ ...wallet, icon: src }),
          `เปลี่ยนไอคอน ${wallet.label} แล้ว`).then(() => showScreen('wallets'));
        return;
      }
      wallet.icon = src;
      renderBills();
      showScreen('wallets');
      showPrototypeToast(`เปลี่ยนไอคอน ${wallet.label} แล้ว`);
    });
    return;
  }
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

function openFundDialog(walletId) {
  if (blockedByClose('fundings')) return;
  closeLayers();
  fundingWalletId = walletId;
  const wallet = walletById(walletId);
  const info = rateInfo(wallet.currency, wallet.id);
  $('#fundWalletInfo').innerHTML = `
    <img src="${wallet.icon || DEFAULT_ICONS.wallet}" alt="">
    <span><b>${wallet.label}</b><small>${wallet.currency} · ${info.rate === null ? 'ยังไม่มีเรท' : `เรทตอนนี้ ฿${info.rate.toFixed(4)}`} ${info.source === 'planned' ? '(ประมาณการ)' : ''}</small></span>`;
  $('#fundThb').value = '';
  $('#fundForeign').value = '';
  $('#fundNote').value = '';
  $('#fundDate').value = new Date().toISOString().slice(0, 10);
  $('#fundError').textContent = '';
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
  const lots = fundings.filter(row => row.walletId === fundingWalletId);
  const totalThb = lots.reduce((sum, row) => sum + row.thb, 0) + thbIn;
  const totalForeign = lots.reduce((sum, row) => sum + row.foreign, 0) + foreignIn;
  const after = totalThb / totalForeign;
  $('#fundPreview').innerHTML = `
    <span>เรทของล็อตนี้<b>฿${lotRate.toFixed(4)}/${symbolFor(wallet.currency)}</b></span>
    <span>เรทเฉลี่ยหลังเติม<b>฿${after.toFixed(4)}</b>${before === null ? '<small>เดิมยังไม่มีเรทจริง</small>' : `<small>เดิม ฿${before.toFixed(4)}</small>`}</span>`;
}
['#fundThb', '#fundForeign'].forEach(id => $(id).addEventListener('input', updateFundPreview));

$('#fundForm').addEventListener('submit', event => {
  event.preventDefault();
  const thbIn = Number($('#fundThb').value.replace(/[^\d.]/g, ''));
  const foreignIn = Number($('#fundForeign').value.replace(/[^\d.]/g, ''));
  if (!(thbIn > 0) || !(foreignIn > 0)) {
    $('#fundError').textContent = 'กรอกทั้งยอดเงินบาทและยอดเงินสกุลนั้นให้มากกว่า 0';
    return;
  }
  const lot = {
    id: `f-${Date.now()}`, walletId: fundingWalletId,
    date: $('#fundDate').value, thb: thbIn, foreign: foreignIn,
    note: $('#fundNote').value.trim() || 'เติมเงิน'
  };
  const label = fmtAmount(foreignIn, symbolFor(walletById(fundingWalletId).currency));

  if (liveMode) {
    submitLive('#fundError', () => TripApi.saveFunding(lot),
      `เติม ${label} แล้ว · เรทเฉลี่ยคำนวณใหม่`)
      .then(() => showScreen('wallets'));
    return;
  }

  fundings.push(lot);
  closeLayers();
  renderBills();
  showScreen('wallets');
  showPrototypeToast(`เติม ${label} แล้ว · เรทเฉลี่ยคำนวณใหม่`);
});

/* ── Add a wallet ── */
let newWalletIcon = DEFAULT_ICONS.wallet;

$('#pickWalletIcon').addEventListener('click', () => openAssetPicker('wallet', newWalletIcon, src => {
  newWalletIcon = src;
  $('#walletIconPreview').src = src;
  mask.classList.add('open');
  $('#walletDialog').classList.add('open');
  $('#walletDialog').setAttribute('aria-hidden', 'false');
}));

$('#addWallet').addEventListener('click', () => {
  if (blockedByClose('wallets')) return;
  closeLayers();
  newWalletIcon = DEFAULT_ICONS.wallet;
  $('#walletIconPreview').src = newWalletIcon;
  $('#walletLabel').value = '';
  $('#walletError').textContent = '';
  /* Foreign currencies first: a trip wallet is far more often for spending
     abroad than for baht, and THB sitting at the top made it the silent
     default every time. */
  const ordered = [...tripCurrencies].sort((a, b) => Number(Boolean(a.base)) - Number(Boolean(b.base)));
  $('#walletCurrency').innerHTML = ordered
    .map(currency => `<option value="${currency.code}">${currency.code} · ${currency.label}${currency.base ? ' (สกุลหลัก)' : ''}</option>`).join('');
  mask.classList.add('open');
  $('#walletDialog').classList.add('open');
  $('#walletDialog').setAttribute('aria-hidden', 'false');
});

$('#walletForm').addEventListener('submit', event => {
  event.preventDefault();
  const label = $('#walletLabel').value.trim();
  if (!label) { $('#walletError').textContent = 'ตั้งชื่อกระเป๋าก่อน'; return; }
  const wallet = {
    id: `w-${Date.now()}`, ownerId: viewerId, label,
    currency: $('#walletCurrency').value, icon: newWalletIcon
  };

  if (liveMode) {
    submitLive('#walletError', () => TripApi.saveWallet(wallet), `สร้างกระเป๋า ${label} แล้ว`)
      .then(() => showScreen('wallets'));
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
  renderBills();
}));

/* ── Quick Add ─────────────────────────────────────────────────────────
   Payer, money-owner and wallet are three separate fields. Picking a wallet
   guesses the other two, but the guess stops as soon as the user edits a
   field by hand — otherwise correcting "who paid" silently reverted. */
let payerTouched = false;
let ownerTouched = false;

let expenseIcon = '';
let splitMode = 'equal';

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
      problem: `เปอร์เซ็นต์รวมได้ ${fmtAmount(entered)}% ต้องเป็น 100%`,
      entered,
      participants: rows.map(row => ({ memberId: row.dataset.member, amount: amount * read(row) / 100 }))
    };
  }
  return {
    valid: Math.abs(entered - amount) < 0.5,
    problem: `ยอดที่กำหนดเองรวมได้ ${fmtAmount(entered)} ต้องเท่ากับยอดบิล ${fmtAmount(amount)}`,
    entered,
    participants: rows.map(row => ({ memberId: row.dataset.member, amount: read(row) }))
  };
}

function splitSummary(split, symbol) {
  if (splitMode === 'equal') {
    return `แบ่งเท่ากันคนละ <b>${fmtAmount(split.each, symbol)}</b> · ${split.participants.length} คน`;
  }
  if (splitMode === 'percent') {
    return split.valid
      ? `รวม <b>100%</b> ✓ · ${split.participants.map(p => `${memberName(p.memberId)} ${fmtAmount(p.amount, symbol)}`).join(' · ')}`
      : `<b>รวม ${fmtAmount(split.entered)}%</b> — ต้องได้ 100%`;
  }
  return split.valid
    ? `รวม <b>${fmtAmount(split.entered, symbol)}</b> ✓ ตรงกับยอดบิล`
    : `<b>รวม ${fmtAmount(split.entered, symbol)}</b> — ต้องเท่ากับยอดบิล`;
}

$('#splitMode').addEventListener('click', event => {
  const button = event.target.closest('[data-split]');
  if (!button) return;
  splitMode = button.dataset.split;
  $$('#splitMode button').forEach(item => item.classList.toggle('active', item === button));
  // Seed manual/percent with the equal split so the user edits from a valid state.
  const rows = $$('#peopleChecks .people-row').filter(row => $('input[type="checkbox"]', row).checked);
  if (rows.length && splitMode !== 'equal') {
    const value = splitMode === 'percent'
      ? Math.round(100 / rows.length)
      : Math.round(readAmount() / rows.length);
    rows.forEach(row => { $('.share-input', row).value = value; });
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

function splitRowMarkup(name = 'อาหาร', amount = '', categoryId = '') {
  return `<div class="split-row${ledgerCategories.length ? ' with-ledger' : ''}">
    <select class="category-name">${categoryNames.map(item => `<option${item === name ? ' selected' : ''}>${item}</option>`).join('')}</select>
    ${ledgerOptions(categoryId)}
    <input class="category-amount" inputmode="numeric" value="${amount}" placeholder="0">
    <button type="button" class="remove-split" aria-label="ลบหมวดนี้">×</button>
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
  input.value = total ? String(total) : '';
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
      : `≈ ${fmtAmount(amount * info.rate, '฿ ')} · ${info.source === 'planned' ? 'เรทประมาณการ' : 'เรทเฉลี่ยของกระเป๋านี้'} ฿${info.rate.toFixed(4)}/${symbol} ${rateBadge(info.source)}`);

  const { total, allocated, balanced } = allocationState();
  const remaining = total - allocated;
  $('#allocatedLine').innerHTML = `<span>จัดสรรแล้ว</span><b>${fmtAmount(allocated, symbol)} / ${fmtAmount(total, symbol)} ${
    balanced ? '✓' : (remaining > 0 ? `· เหลือ ${fmtAmount(remaining, symbol)}` : `· เกิน ${fmtAmount(Math.abs(remaining), symbol)}`)
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
  $('#peopleChecks').classList.toggle('disabled', !shared);
  $('#splitMode').classList.toggle('disabled', !shared);

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
    ? 'ไม่แบ่งกับใคร — เป็นรายการเดี่ยว'
    : (!picked.length ? '<b>เลือกผู้เกี่ยวข้องอย่างน้อย 1 คน</b>' : splitSummary(split, symbol));

  const problems = [];
  if (amount <= 0) problems.push('ยังไม่ได้กรอกจำนวนเงิน');
  if (!balanced) problems.push('ยอดรวมของหมวดยังไม่เท่ากับยอดบิล');
  if (shared && !picked.length) problems.push('ยังไม่ได้เลือกผู้เกี่ยวข้อง');
  if (shared && picked.length && !split.valid) problems.push(split.problem);
  /* บังคับผูกสมุดบัญชีเฉพาะโหมดข้อมูลจริง — เตือนตั้งแต่ตอนกรอก ไม่ใช่ไปโผล่
     ตอนปิดทริป ซึ่งคนแก้จะเป็นคนปิด ไม่ใช่คนที่รู้ว่าบิลนี้คือค่าอะไร */
  if (ledgerCategories.length && $$('#splitRows .split-row').some(row => !$('.category-ledger', row)?.value)) {
    problems.push('ยังไม่ได้ผูกหมวดกับสมุดบัญชีครบทุกแถว');
  }
  $('#saveWarning').textContent = problems.length ? `บันทึกไม่ได้: ${problems.join(' · ')}` : '';
  $('#saveExpense').disabled = problems.length > 0;
  // บอกยอดบนปุ่มเลย จะได้ไม่ต้องเลื่อนขึ้นไปดูก่อนกด
  $('#saveExpense').textContent = amount > 0
    ? `บันทึก ${fmtAmount(amount, symbol)}` : 'บันทึกบิล';
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
  $('#sharedToggle').classList.add('on');
  $('#splitRows').innerHTML = splitRowMarkup();
  splitMode = 'equal';
  $$('#splitMode button').forEach(button => button.classList.toggle('active', button.dataset.split === 'equal'));
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
  refreshQuickAdd();
}

$('#walletSelect').addEventListener('change', () => {
  const wallet = walletById($('#walletSelect').value);
  if (wallet && !payerTouched) $('#expensePayer').value = wallet.ownerId;
  if (wallet && !ownerTouched) $('#expenseOwner').value = wallet.ownerId;
  refreshQuickAdd();
});
$('#expensePayer').addEventListener('change', () => { payerTouched = true; refreshQuickAdd(); });
$('#expenseOwner').addEventListener('change', () => { ownerTouched = true; refreshQuickAdd(); });
$('#expenseAmount').addEventListener('input', refreshQuickAdd);
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
  const categories = $$('#splitRows .split-row').map(row => ({
    name: $('.category-name', row).value,
    // ช่องผูกสมุดบัญชีมีเฉพาะโหมดข้อมูลจริง — โหมดตัวอย่างไม่มีผังบัญชีให้เลือก
    categoryId: $('.category-ledger', row)?.value || '',
    amount: Number($('.category-amount', row).value.replace(/[^\d.]/g, '')) || 0
  }));

  const bill = {
    id: `bill-${Date.now()}`,
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
    image: expenseIcon || ''
  };

  const routing = isTripOnly(ownerId) ? 'เฉพาะทริป' : 'ลงบัญชีหลัก';
  const label = fmtAmount(amount, symbolFor(bill.currency));

  if (!liveMode) {
    bills.unshift(bill);
    closeLayers();
    renderBills();
    showScreen('bills');
    showPrototypeToast(`บันทึก ${label} แล้ว · ${routing}`);
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
    if (!row?.sharing || row.stopIndex === null || row.at === null) return '';
    const pin = pins[row.stopIndex];
    if (!pin) return '';
    const seat = (byStop[row.stopIndex] = (byStop[row.stopIndex] || 0) + 1) - 1;
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
  if (!row || !row.sharing) return { text:'ยังไม่แชร์ตำแหน่ง', cls:'off' };
  if (!row.at) return { text:'เปิดแชร์แล้ว · ยังไม่เช็กอิน', cls:'idle' };
  const mins = Math.round((Date.now() - row.at) / 60000);
  if (mins > PRESENCE_FRESH_MINUTES) {
    return { text:`ข้อมูลเก่า ${mins} นาที · แอปอาจปิดอยู่`, cls:'stale' };
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
    return `<span class="presence-chip ${label.cls}${isMe ? ' me' : ''}" title="${label.text}">
      <i class="face ${faces[member.id] || 'pink'}">${member.name[0]}</i>
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
  const fresh = mine?.sharing && mine.at && (Date.now() - mine.at) / 60000 <= PRESENCE_FRESH_MINUTES;
  checkIn.textContent = fresh ? '✓ เช็กอินแล้ว · เช็กอินอีกครั้ง' : '✓ เช็กอิน';
  checkIn.disabled = !mine?.sharing;
  checkIn.title = mine?.sharing ? '' : 'เปิดแชร์ตำแหน่งก่อนจึงจะเช็กอินได้';
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

$('#checkIn').addEventListener('click', () => {
  const me = presence[viewerId];
  if (!me?.sharing) return;
  const nextActivity = activePlanDay()?.activities?.[0];
  me.at = Date.now();
  me.status = 'arrived';
  me.place = nextActivity ? nextActivity.name : 'จุดหมายวันนี้';
  // Anchor to the map pin for the day being viewed, so the marker moves too.
  const stop = journeyStops.findIndex(item => item.dayId === activePlanDayId);
  me.stopIndex = stop >= 0 ? stop : actualJourneyIndex;
  renderPresence();
  saveState();
  showPrototypeToast(`เช็กอินที่ ${me.place} แล้ว · สมาชิกที่คุณแชร์ด้วยจะเห็น`);
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

const lockReason = () => (liveMode ? LIVE_LOCK_REASON : TRIP_LOCK_REASON);
/* area = ส่วนที่กำลังจะแก้ · ไม่ระบุ = ถือว่ายังไม่เปิดในโหมดข้อมูลจริง */
/* แผนเที่ยวเป็นข้อยกเว้นเดียวที่ไม่ถูกล็อกตอนปิดทริป — การปิดทริปล็อกตัวเลข
   ที่รายงานเข้าบัญชีไปแล้ว ไม่ควรห้ามแก้บันทึกการเดินทางย้อนหลัง
   (ฝั่งเซิร์ฟเวอร์ก็ปล่อยผ่าน /stops เหมือนกัน สองฝั่งจึงตรงกัน) */
const financeLocked = (area) =>
  (area === 'plan' ? false : tripClosed) || (liveMode && !LIVE_WRITABLE[area]);

function blockedByClose(area) {
  if (!financeLocked(area)) return false;
  showPrototypeToast(lockReason());
  return true;
}

function applyTripLock() {
  // ปุ่มแต่ละตัวผูกกับส่วนของตัวเอง ไม่ใช่สถานะรวมของทั้งหน้า
  // ไม่งั้นพอเปิดการเขียนทีละส่วน ปุ่มจะยังถูกล็อกทั้งแถบทั้งที่ API พร้อมแล้ว
  const byArea = [
    [$$('.add-expense'), 'expenses'],
    [[$('#addWallet')], 'wallets'],
    [[$('#addCurrency')], 'currencies'],
    [[$('#addPlace')], 'plan']
  ];
  byArea.forEach(([buttons, area]) => {
    const off = financeLocked(area);
    [...buttons].filter(Boolean).forEach(button => {
      button.disabled = off;
      button.title = off ? lockReason() : '';
    });
  });
  const locked = financeLocked();
  $$('.trip-locked-note').forEach(note => {
    note.hidden = !locked;
    // ข้อความในป้ายต้องตรงกับเหตุผลที่ล็อกจริง ไม่ใช่บอกว่าทริปปิดทั้งที่ยังเปิดอยู่
    // สามสถานะ ไม่ใช่สอง: ปิดแล้ว(จริง) · ปิดแล้ว(ตัวอย่าง) · เปิดอยู่แต่เป็นข้อมูลจริง
    // ถ้ารวบเหลือสอง จะมีกรณีที่ป้ายบอกว่า "ทริปปิดแล้ว" ทั้งที่ทริปยังเปิดอยู่
    note.innerHTML = tripClosed
      ? (liveMode
          ? '🔒🔴 <b>ทริปนี้ปิดแล้ว (ข้อมูลจริง)</b> — ยอดถูกรายงานเข้าบัญชีไปแล้ว ต้องเปิดทริปกลับก่อนจึงจะแก้ได้'
          : '🔒 <b>ทริปนี้ปิดแล้ว</b> — ตัวเลขการเงินถูกล็อกให้ตรงกับยอดที่สรุปเข้าบัญชี ดูได้อย่างเดียว แต่แผนเที่ยวและรูปภาพยังแก้ได้')
      : '🔴 <b>โหมดข้อมูลจริง</b> — ทุกอย่างที่บันทึกจากหน้านี้ลงฐานจริงทั้งหมด รวมถึงการปิดทริป';
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
const thaiDate = iso => iso
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' })
  : '—';

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
    note.innerHTML = `⚠️ ทริปจบ ${thaiDate(tripEndISO())} แต่ลงบัญชี ${thaiDate(chosen)} — <b>คนละ${end.getFullYear() !== post.getFullYear() ? 'ปี' : 'เดือน'}บัญชี</b> ค่าใช้จ่ายก้อนนี้จะไปอยู่ในงวด ${post.toLocaleDateString('th-TH', { month:'long', year:'numeric' })}`;
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
   and nothing is realised. */
let settlementPlan = {};

function resetSettlementPlan() {
  settlementPlan = {};
  computeCloseSummary().leftovers.forEach(row => {
    settlementPlan[row.wallet.id] = {
      mode: row.wallet.excludeOnClose ? 'carry' : 'return',
      receivedThb: row.thb === null ? '' : String(Math.round(row.thb)),
      carryCurrency: row.wallet.currency,
      carryAmount: String(Math.round(row.foreign))
    };
  });
}

function settlementResults() {
  const s = computeCloseSummary();
  return s.leftovers.map(row => {
    const plan = settlementPlan[row.wallet.id] || { mode:'return' };
    const cost = row.thb ?? 0;
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
        <label><input type="radio" name="mode-${row.wallet.id}" value="return" ${row.plan.mode === 'return' ? 'checked' : ''}> แลกคืนเข้าบัญชี</label>
        <label><input type="radio" name="mode-${row.wallet.id}" value="carry" ${row.plan.mode === 'carry' ? 'checked' : ''}> ยกไปทริปหน้า</label>
      </div>
      ${row.plan.mode === 'return' ? `
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
  $('#fxSummary').innerHTML = `
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
    submitLive('#closeError', () => TripApi.closeTrip({ postingDate: posting, lines }),
      'ปิดทริปแล้ว · ยอดถูกบันทึกเข้าบัญชีจริง')
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
const journeyStops = [
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
const actualJourneyIndex = 1;
let previewJourneyIndex = actualJourneyIndex;

function renderJourneyPreview(selectedIndex) {
  previewJourneyIndex = selectedIndex;
  const pins = $$('.journey-pin');
  const selected = journeyStops[selectedIndex];
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
  $('#journeyTitle').textContent = `${selected.name} → ${selected.next}`;
  $('#journeyDescription').textContent = selected.description;
  $('#returnToday').hidden = selectedIndex === actualJourneyIndex;
  $('.day-summary').classList.toggle('previewing', selectedIndex !== actualJourneyIndex);
  $('#openSelectedPlan').textContent = selectedIndex === actualJourneyIndex
    ? 'ดูแผนวันนี้ ›'
    : `ดูแผน Day ${selected.day} ›`;
  renderTodayWeather(selected.dayId);
}

/* The weather card used to be hardcoded to Lake Akan, so previewing Sapporo
   still showed Akan's forecast. It now follows the selected pin's day. */
function renderTodayWeather(dayId) {
  const day = planDays.find(item => item.id === dayId);
  if (!day) return;
  const { weather } = day;
  $('#weatherPlace').textContent = day.city;

  /* วันที่มาจากฐานจริงยังไม่มีข้อมูลพยากรณ์ — ต้องบอกว่าไม่มี ไม่ใช่โชว์ตัวเลข
     ของข้อมูลตัวอย่างค้างไว้ เพราะคนจะอ่านว่าเป็นพยากรณ์ของวันนั้นจริง ๆ */
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
  $('#weatherStamp').textContent = dayId === journeyStops[actualJourneyIndex].dayId
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

function renderPlanWorkspace() {
  const activeDay = activePlanDay();
  $('#planDayTabs').innerHTML = planDays.map(day => `
    <button class="${day.id === activePlanDayId ? 'active' : ''}" data-plan-day="${day.id}">
      วันที่ ${day.day}<small>${day.city} · ${day.activities.length} จุด</small>
    </button>`).join('');

  $('#planDayOverview').innerHTML = `
    <div><small>${activeDay.date}</small><h3>${activeDay.city}</h3><span>${activeDay.activities.length} กิจกรรม · ลากเรียงหรือเลือกเพื่อย้ายวัน</span></div>
    ${activeDay.weather
      ? `<div class="plan-weather"><span>${activeDay.weather.icon}</span><div><b>${activeDay.weather.temp}</b><small>${activeDay.weather.note}</small></div></div>`
      // วันที่มาจากฐานจริงไม่มีพยากรณ์ — ซ่อนกล่องไปเลย ดีกว่าโชว์ช่องว่างที่ดูเหมือนข้อมูลหาย
      : ''}`;

  $('#planList').innerHTML = activeDay.activities.length ? activeDay.activities.map(activity => `
    <article class="plan-item ${activity.id === selectedActivityId ? 'selected' : ''}" draggable="true" data-activity="${activity.id}">
      <span class="drag">⠿</span><time>${activity.time}</time><img src="${activity.image}" alt="">
      <div><b>${activity.name}</b><small>${activity.detail}</small><em>${activity.tag}</em></div>
      <div class="plan-cost">${activity.cost}<small>${activity.bills}</small></div>
      <div class="plan-item-controls"><button class="edit-plan-item" data-edit="${activity.id}">แก้ไข</button><button data-move="up" aria-label="เลื่อนขึ้น">↑</button><button data-move="down" aria-label="เลื่อนลง">↓</button></div>
    </article>`).join('') : `<div class="plan-empty">ยังไม่มีกิจกรรมในวันนี้</div>`;

  $('#moveDayTargets').innerHTML = planDays.filter(day => day.id !== activePlanDayId).map(day => `
    <button data-move-day="${day.id}" ${selectedActivityId ? '' : 'disabled'}>Day ${day.day} · ${day.city}</button>`).join('');
  bindPlanInteractions();
  scrollActiveDayTab();
  saveState();
}

function bindPlanInteractions() {
  $$('[data-plan-day]').forEach(button => button.addEventListener('click', () => {
    activePlanDayId = button.dataset.planDay;
    selectedActivityId = null;
    renderPlanWorkspace();
  }));

  $$('.plan-item').forEach(item => {
    item.addEventListener('click', event => {
      const control = event.target.closest('[data-move]');
      const edit = event.target.closest('[data-edit]');
      const day = activePlanDay();
      const index = day.activities.findIndex(activity => activity.id === item.dataset.activity);
      if (edit) {
        openPlanEditor(day.activities[index]);
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

function openPlanEditor(activity = null) {
  editingActivityId = activity?.id || null;
  $('#planEditorTitle').textContent = activity ? 'แก้ไขกิจกรรม' : 'เพิ่มสถานที่ในแผน';
  $('#activityDay').innerHTML = planDays.map(day => `<option value="${day.id}">Day ${day.day} · ${day.city}</option>`).join('');
  $('#activityDay').value = activity
    ? planDays.find(day => day.activities.some(item => item.id === activity.id)).id
    : activePlanDayId;
  $('#activityName').value = activity?.name || '';
  $('#activityTime').value = activity?.time === '—' ? '' : (activity?.time || '09:00');
  $('#activityTag').value = activity?.tag === 'รอจัดแผน' ? 'กิจกรรมย่อย' : (activity?.tag || 'กิจกรรมย่อย');
  $('#activityCost').value = activity?.cost?.replace(/[^\d]/g, '') || '';
  $('#activityDetail').value = activity?.detail || '';
  activityIcon = activity?.image || `${ART}st_camera2.png`;
  $('#activityIconPreview').src = activityIcon;
  mask.classList.add('open');
  planEditor.classList.add('open');
  planEditor.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#activityName').focus(), 80);
}

$('#addPlace').addEventListener('click', () => openPlanEditor());
$('#cancelPlanEditor').addEventListener('click', closeLayers);

/* ── แผนเที่ยวในโหมดข้อมูลจริง ─────────────────────────────────────────
   ส่งขึ้นเซิร์ฟเวอร์แล้วดึงใหม่ทั้งชุดเหมือนฝั่งการเงิน — ลำดับและการจัดกลุ่ม
   ตามวันคำนวณที่เซิร์ฟเวอร์ ถ้าหน้าจอเดาเองจะเริ่มไม่ตรงกันทีละนิด */
function savePlanItemLive() {
  const targetDay = planDays.find(day => day.id === $('#activityDay').value);
  const name = $('#activityName').value.trim();
  if (!name) { $('#planEditorError') && ($('#planEditorError').textContent = 'ตั้งชื่อสถานที่ก่อน'); return; }

  submitLive('#planEditorError', () => TripApi.saveStop({
    id: editingActivityId || '',
    dayDate: targetDay?.date || '',
    time: $('#activityTime').value,
    name,
    detail: $('#activityDetail').value.trim(),
    tag: $('#activityTag').value,
    icon: activityIcon
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
    time: $('#activityTime').value,
    name: $('#activityName').value.trim(),
    detail: $('#activityDetail').value.trim() || 'ยังไม่มีรายละเอียด',
    tag: $('#activityTag').value,
    cost: numericCost ? fmtAmount(Number(numericCost), '¥ ') : '—',
    bills: existing?.bills || 'ยังไม่มีบิล',
    image: activityIcon
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
    hint:'แนวนอน อัตราส่วน 2.37 : 1 · ระบบจะครอบให้พอดีอัตโนมัติ',
    note:'ใช้เป็นภาพหลักบนหน้า "วันนี้" หมุดและเส้นทางจะวางทับด้วยโค้ด จึงไม่ควรมีชื่อสถานที่ฝังในภาพ'
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
  }
};

const assetLibrary = {
  banner: [
    { id:'hokkaido-clean', label:'Hokkaido · ภาพวาด', src:'art/hokkaido-illustrated-clean.png' },
    { id:'hokkaido-landmarks', label:'Hokkaido · มีชื่อสถานที่', src:'art/hokkaido-illustrated-landmarks.png' },
    { id:'hokkaido-texture', label:'Hokkaido · เท็กซ์เจอร์', src:'art/hokkaido-texture-map.png' },
    { id:'plan-hokkaido5', label:'Hokkaido · แผนที่เดิม', src:`${ART}hero_plan_hokkaido5.png` }
  ],
  place: [
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
    { id:'w-classic',  label:'บิลโฟลด์',       src:'art/icons/wallet_classic.svg' },
    { id:'w-coin',     label:'กระเป๋าเหรียญ',   src:'art/icons/wallet_coin.svg' },
    { id:'w-card',     label:'ที่ใส่บัตร',      src:'art/icons/wallet_card.svg' },
    { id:'w-travel',   label:'กระเป๋าเดินทาง',  src:'art/icons/wallet_travel.svg' },
    { id:'w-envelope', label:'ซองเงิน',        src:'art/icons/wallet_envelope.svg' },
    { id:'w-pouch',    label:'ถุงผ้า',          src:'art/icons/wallet_pouch.svg' },
    { id:'w-mint',     label:'มินต์',           src:'art/icons/wallet_mint.svg' },
    { id:'w-night',    label:'กลางคืน',        src:'art/icons/wallet_night.svg' }
  ],
  currency: [
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

function renderAssetGrid() {
  const spec = assetSpecs[assetKind];
  $('#assetGrid').innerHTML = assetLibrary[assetKind].map(asset => `
    <button type="button" class="asset-option ${asset.src === assetChoice ? 'selected' : ''}" data-asset-src="${asset.src}">
      <span class="asset-thumb ${spec.shape}"><img src="${asset.src}" alt=""></span>
      <small>${asset.label}</small>
    </button>`).join('');
}

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
  renderAssetGrid();
  mask.classList.add('open');
  assetDialog.classList.add('open');
  assetDialog.setAttribute('aria-hidden', 'false');
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
        canvas.toBlob(blob => {
          resolve({ dataUrl: canvas.toDataURL('image/webp', 0.86), blob });
        }, 'image/webp', 0.86);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* โหมดข้อมูลจริง: อัปโหลดรูปที่ย่อแล้วขึ้น R2 บนเซิร์ฟเวอร์จริง ทุกคนใน
   ครอบครัวจึงเห็นรูปเดียวกัน — ถ้าอัปโหลดไม่สำเร็จ (เช่นเน็ตหลุด) ยังเก็บ
   เป็น data: URL ไว้ใช้ในเบราว์เซอร์นี้ต่อได้ ไม่เสียงานที่ทำไปแล้ว */
$('#assetUpload').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const spec = assetSpecs[assetKind];
  $('#assetError').textContent = '';
  if (file.size > 8 * 1024 * 1024) {
    $('#assetError').textContent = 'ไฟล์ใหญ่เกิน 8 MB กรุณาย่อก่อนอัปโหลด';
    return;
  }
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
        $('#assetError').textContent = `อัปโหลดขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ${uploadError.message} · ใช้รูปนี้ได้เฉพาะเบราว์เซอร์นี้`;
      }
    }
    assetLibrary[assetKind].unshift({ id:`up-${Date.now()}`, label, src: finalSrc, uploaded:true });
    assetChoice = finalSrc;
    renderAssetGrid();
    saveState();
  } catch (error) {
    $('#assetError').textContent = error.message;
  }
});

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
  if (isUploadedImage(src)) {
    showPrototypeToast('รูปที่อัปโหลดเองยังบันทึกถาวรไม่ได้ · เห็นเฉพาะเบราว์เซอร์นี้');
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

function markLiveBanner(text, tone = 'live') {
  let bar = document.querySelector('#liveBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'liveBar';
    document.body.prepend(bar);
  }
  bar.className = `live-bar live-bar--${tone}`;
  bar.textContent = text;
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
  /* มีจุดแวะจริงถึงจะทับแผนตัวอย่าง — ทริปที่ยังไม่ได้วางแผนจะได้ไม่เห็นหน้าว่างเปล่า
     planDays เป็น const จึงต้องเปลี่ยนของในอาร์เรย์เดิม */
  if (state.planDays.length) {
    planDays.length = 0;
    planDays.push(...state.planDays);
    activePlanDayId = planDays[0].id;
  }
  if (state.tripCurrencies.length) tripCurrencies = state.tripCurrencies;
  ledgerCategories = state.ledgerCategories || [];
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

  // แถบบนสุดของหน้าเขียนไว้ว่า "ข้อมูลจำลอง ไม่เชื่อมบัญชีจริง" ซึ่งกลายเป็น
  // ข้อความที่ผิดทันทีในโหมดนี้ — ต้องแก้ ไม่ใช่ปล่อยให้ขัดกับความจริง
  const note = document.querySelector('.prototype-note');
  if (note) note.textContent = 'UNIFIED TRIP · เชื่อมฐานข้อมูลจริง · บิลที่บันทึกจะถูกเก็บถาวร';

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

  /* แผนเที่ยวกับสภาพอากาศยังไม่มี API — ยังเป็นข้อมูลตัวอย่างอยู่
     ต้องติดป้ายบอกให้ชัด ไม่งั้นพอตัวเลขการเงินข้าง ๆ เป็นของจริง คนจะเหมาเอาว่า
     ทั้งหน้าเป็นของจริงหมด แล้วเชื่อพยากรณ์อากาศที่ระบบไม่ได้ไปดึงมาจริง */
  const flag = (selector, text) => {
    const host = document.querySelector(selector);
    if (!host || host.querySelector('.demo-flag')) return;
    const tag = document.createElement('p');
    tag.className = 'demo-flag';
    tag.textContent = text;
    host.prepend(tag);
  };
  flag('.weather-card', '⚠️ ระบบยังไม่ได้เชื่อมกับบริการพยากรณ์อากาศ');
  flag('#screen-plan .plan-layout', state.planDays.length
    ? '🔴 จุดแวะมาจากฐานข้อมูลจริง — แต่ยังแก้จากหน้านี้ไม่ได้ (ยังไม่มี API ฝั่งเขียน)'
    : '⚠️ ทริปนี้ยังไม่มีจุดแวะในฐานข้อมูล — ที่เห็นเป็นแผนตัวอย่าง');

  applyTripLock();
  [renderBills, renderWallets, renderMoneyStrip, renderMembers, renderCurrencies,
   renderPresence, refreshQuickAdd, renderPlanWorkspace].forEach(render => render());
  /* การ์ดอากาศผูกกับ dayId ของแผนตัวอย่าง พอเปลี่ยนเป็นวันจริงแล้ว id ไม่ตรงกัน
     renderTodayWeather จะ return ทันทีและปล่อยตัวเลขเดิมค้างบนจอ ต้องสั่งใหม่เอง */
  if (state.planDays.length) renderTodayWeather(planDays[0].id);

  const bits = [
    state.tripName || 'ข้อมูลจริง',
    `${bills.length} บิล`,
    `สุทธิ ${thb(state.netLedgerThb)}`
  ];
  if (state.hiddenExpenseCount) bits.push(`ซ่อนจากคุณ ${state.hiddenExpenseCount} ใบ`);
  // บอกด้วยว่ารู้ได้อย่างไรว่าเป็นใคร — ถ้ามาจาก URL แปลว่าไม่ได้ผ่านการล็อกอินจริง
  if (TripApi.config.userSource === 'url') bits.push('⚠️ ระบุตัวตนจาก URL ไม่ใช่การล็อกอิน');
  markLiveBanner(`🔴 ${bits.join(' · ')} — ข้อมูลจริง`);
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
  // ไอคอนหมวดเป็นของครอบครัว ไม่ใช่ของทริปนี้ — โหลดแยกต่างหาก ไม่บล็อกจอหลัก
  loadCategoryIconsLive();
}

loadState();
if (TripApi.config.enabled) {
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
