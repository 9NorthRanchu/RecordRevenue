/* ── หน้ารวมทริป (trips.html) ──────────────────────────────────────────
   เมนู "Unified Trip" ในแอปหลักชี้มาที่นี่ และ **แสดงหน้ารวมเสมอ**

   ⚠️ เดิมหน้านี้เด้งเข้าทริปล่าสุดอัตโนมัติ ซึ่งถูกยกเลิกแล้ว (2026-08-11)
      เหตุผล: พอมีหลายทริป การเด้งเข้าทริปเดิมทำให้เข้าทริปอื่นไม่ได้เลย
      ต้องรู้ว่ามี ?all=1 ซ่อนอยู่ถึงจะออกมาได้ ซึ่งไม่มีทางเดาได้
      ตอนนี้เปลี่ยนเป็น "ปุ่มลัด" บนหน้ารวมแทน — ได้ความเร็วเหมือนเดิม
      แต่ผู้ใช้เป็นคนตัดสินใจ ไม่ใช่ระบบตัดสินใจแทน

   การเข้าทริปโดยตรงยังทำได้เหมือนเดิมผ่าน index.html?live=1&projectId=… */

const LAST_TRIP_KEY = 'unified-trip-last';

function lastTripId() {
  try { return localStorage.getItem(LAST_TRIP_KEY) || ''; } catch { return ''; }
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

$('#tripsBack')?.addEventListener('click', () => {
  location.href = '../index.html';
});

const STAGE_LABEL = { ONGOING: '🧭 Ongoing', DREAM: '💭 Dream', MEMORY: '📸 Memory' };
const STAGE_EMPTY = {
  ONGOING: 'ยังไม่มีทริปที่กำลังจะเกิดแน่ ๆ — กด "+ เพิ่มทริป" เพื่อเริ่มวางแผน',
  DREAM: 'ยังไม่มีทริปในฝัน — ลองเพิ่มไอเดียทริปที่อยากไปดูสิ',
  MEMORY: 'ยังไม่มีทริปที่จบแล้ว — ทริปที่ผ่านไปแล้วจะย้ายมาอยู่ที่นี่เมื่อเปลี่ยนประเภทเป็น Memory'
};

let allTrips = [];
let activeStage = 'ONGOING';

function bannerStyle(trip) {
  const src = TripApi.bannerPath(trip.theme_banner);
  return src ? `background-image:url('${src}')` : '';
}

function fmtRange(start, end) {
  if (!start && !end) return 'ยังไม่กำหนดวันเดินทาง';
  if (start && !end) return `เริ่ม ${start}`;
  if (!start && end) return `ถึง ${end}`;
  return `${start} – ${end}`;
}

function renderGrid() {
  const grid = $('#tripsGrid');
  const empty = $('#tripsEmpty');
  const rows = allTrips.filter(t => (t.trip_stage || 'ONGOING') === activeStage);

  if (!rows.length) {
    /* ล้างเนื้อหาด้วย ไม่ใช่แค่ซ่อน — ถ้ามีกฎ CSS ตัวไหนทำให้ hidden ไม่ทำงาน
       (เคยเกิดกับ .trip-pick-grid ที่ตั้ง display:grid ทับ) การ์ดของแท็บก่อน
       จะค้างอยู่บนจอพร้อมข้อความ "ยังไม่มีทริป" ซึ่งขัดกันเอง
       ล้างทิ้งเลยทำให้ไม่มีทางแสดงของเก่าผิดแท็บได้ ไม่ว่า CSS จะเป็นอย่างไร */
    grid.innerHTML = '';
    grid.hidden = true;
    empty.hidden = false;
    empty.textContent = STAGE_EMPTY[activeStage] || 'ยังไม่มีทริปในหมวดนี้';
    return;
  }

  empty.hidden = true;
  grid.hidden = false;
  grid.innerHTML = rows.map(trip => `
    <article class="trip-pick-card" data-project="${trip.project_id}">
      <div class="trip-pick-banner" style="${bannerStyle(trip)}"></div>
      <div class="trip-pick-body">
        <h3>${escapeHtml(trip.name || 'ทริปไม่มีชื่อ')}</h3>
        <small>${escapeHtml(fmtRange(trip.start_date, trip.end_date))}</small>
        <div class="trip-pick-tags">
          ${trip.status === 'closed' ? '<span class="closed">ปิดทริปแล้ว</span>' : ''}
          ${trip.posted_to_ledger ? '<span class="posted">โพสต์บัญชีแล้ว</span>' : ''}
        </div>
      </div>
    </article>
  `).join('');

  $$('.trip-pick-card', grid).forEach(card => {
    card.addEventListener('click', () => {
      location.href = `index.html?live=1&projectId=${encodeURIComponent(card.dataset.project)}`;
    });
  });
}

/* ปุ่มลัดเข้าทริปล่าสุด — แทนที่การเด้งอัตโนมัติแบบเดิม
   โชว์เฉพาะเมื่อทริปนั้นยังอยู่จริงในรายการ ไม่งั้นจะมีปุ่มที่กดแล้วเจอ error
   (ทริปอาจถูกลบจากเครื่องอื่นไปแล้ว) */
function renderShortcut() {
  const host = $('#tripsShortcut');
  if (!host) return;
  const trip = allTrips.find(row => row.project_id === lastTripId());
  if (!trip) { host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = `
    <button type="button" class="soft-btn" data-open="${trip.project_id}">
      ↩︎ กลับเข้า ${escapeHtml(trip.name || 'ทริปล่าสุด')}
    </button>`;
}

$('#tripsShortcut')?.addEventListener('click', event => {
  const button = event.target.closest('[data-open]');
  if (!button) return;
  location.href = `index.html?live=1&projectId=${encodeURIComponent(button.dataset.open)}`;
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

$$('#tripStageTabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    activeStage = btn.dataset.stage;
    $$('#tripStageTabs button').forEach(b => b.classList.toggle('active', b === btn));
    renderGrid();
  });
});

async function loadTrips() {
  const hasIdentity = Boolean(TripApi.config.userId || TripApi.sessionToken());
  if (!hasIdentity) {
    $('#tripsLoading').hidden = true;
    $('#tripsLoginNotice').hidden = false;
    return;
  }

  try {
    const payload = await TripApi.listTrips();
    allTrips = payload.trips || [];
    $('#tripsLoading').hidden = true;
    renderShortcut();
    renderGrid();
  } catch (error) {
    $('#tripsLoading').hidden = true;
    const box = $('#tripsError');
    box.hidden = false;
    box.textContent = `โหลดรายการทริปไม่สำเร็จ: ${error.message}`;
  }
}

loadTrips();

/* ── สร้างทริปใหม่ ────────────────────────────────────────────────── */
const newTripMask = $('#newTripMask');
const newTripDialog = $('#newTripDialog');

function openNewTripDialog() {
  $('#newTripError').hidden = true;
  newTripMask.classList.add('open');
  newTripDialog.classList.add('open');
}
function closeNewTripDialog() {
  newTripMask.classList.remove('open');
  newTripDialog.classList.remove('open');
}

$('#newTripFab')?.addEventListener('click', openNewTripDialog);
$('#newTripClose')?.addEventListener('click', closeNewTripDialog);
$('#newTripCancel')?.addEventListener('click', closeNewTripDialog);
newTripMask?.addEventListener('click', closeNewTripDialog);

$('#newTripForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const submitBtn = $('#newTripSubmit');
  const errorBox = $('#newTripError');
  errorBox.hidden = true;

  const name = $('#newTripName').value.trim();
  const startDate = $('#newTripStart').value;
  const endDate = $('#newTripEnd').value;
  const tripStage = $('#newTripStage').value;

  if (!name) {
    errorBox.textContent = 'ต้องตั้งชื่อทริป';
    errorBox.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังสร้าง…';
  try {
    const result = await TripApi.createTrip({ name, startDate, endDate, tripStage });
    location.href = `index.html?live=1&projectId=${encodeURIComponent(result.project_id)}`;
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'สร้างทริป';
  }
});
