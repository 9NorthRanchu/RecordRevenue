/* ── หน้ารวมทริป (trips.html) ──────────────────────────────────────────
   เมนู "Unified Trip" ในแอปหลักชี้มาที่นี่ แต่ถ้าเครื่องนี้เคยเปิดทริปไหน
   ล่าสุดจะเด้งเข้าทริปนั้นทันที (ตามที่ North เลือก — พฤติกรรมเหมือนตอนที่
   เมนูพาเข้าทริปตรง ๆ) · อยากดูหน้ารวมจริง ๆ ให้เข้าด้วย ?all=1 ซึ่งเป็น
   ลิงก์ที่ปุ่ม "ทริปทั้งหมด" ในหน้าทริปใช้ */

const LAST_TRIP_KEY = 'unified-trip-last';

(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('all') === '1') return;             // ตั้งใจมาดูหน้ารวม
  let last = '';
  try { last = localStorage.getItem(LAST_TRIP_KEY) || ''; } catch {}
  if (!last) return;                                  // ครั้งแรกของเครื่องนี้ — แสดงหน้ารวม
  location.replace(`index.html?live=1&projectId=${encodeURIComponent(last)}`);
})();

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
