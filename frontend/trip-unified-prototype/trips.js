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

function tripBanner(trip) {
  return TripApi.bannerPath(trip.theme_banner) || '';
}

function tripDays(start, end) {
  if (!start || !end) return null;
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  const days = Math.round((last - first) / 86400000) + 1;
  return days > 0 ? days : null;
}

function countdownLabel(trip) {
  if (!trip.start_date) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${trip.start_date}T00:00:00`);
  const end = trip.end_date ? new Date(`${trip.end_date}T23:59:59`) : start;
  const days = Math.ceil((start - today) / 86400000);
  if (days > 0) return `อีก ${days.toLocaleString('th-TH')} วัน`;
  if (today <= end) return 'กำลังเดินทาง';
  return 'จบแล้ว';
}

function stopPicture(stop, index) {
  const src = TripApi.bannerPath(stop.icon_asset);
  if (src) return `<img src="${escapeHtml(src)}" alt="">`;
  return ['📍', '🏔️', '🚂', '⛩️', '🍜'][index % 5];
}

function renderStops(trip) {
  const stops = trip.stops || [];
  if (!stops.length) return '<div class="trip-stop-empty">ยังไม่ได้เพิ่มสถานที่ในทริปนี้</div>';
  return `
    <div class="trip-stop-head"><strong>Travel Stops</strong><span>เลื่อนดูตามลำดับแผน</span></div>
    <div class="trip-stop-rail">
      <button class="trip-stop-slide" type="button" data-scroll="-1" aria-label="เลื่อนจุดแวะไปทางซ้าย" hidden>‹</button>
      <div class="trip-stop-strip">
        ${stops.map((stop, index) => `
          <div class="trip-stop">
            <span class="trip-stop-picture">${stopPicture(stop, index)}</span>
            <small>${escapeHtml(stop.name || 'จุดแวะ')}</small>
          </div>`).join('')}
      </div>
      <button class="trip-stop-slide" type="button" data-scroll="1" aria-label="เลื่อนจุดแวะไปทางขวา" hidden>›</button>
    </div>`;
}

function syncStopRails() {
  $$('.trip-stop-rail').forEach(rail => {
    const strip = $('.trip-stop-strip', rail);
    const buttons = $$('.trip-stop-slide', rail);
    if (!strip) return;
    const canScroll = strip.scrollWidth > strip.clientWidth + 2;
    rail.classList.toggle('can-scroll', canScroll);
    buttons.forEach(button => { button.hidden = !canScroll; });
  });
}

function fmtRange(start, end) {
  if (!start && !end) return 'ยังไม่กำหนดวันเดินทาง';
  const formatDate = value => {
    const [year, month, day] = String(value).split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!year || !month || !day || !months[month - 1]) return value;
    return `${day} ${months[month - 1]} ${year}`;
  };
  if (start && !end) return `เริ่ม ${formatDate(start)}`;
  if (!start && end) return `ถึง ${formatDate(end)}`;
  return `${formatDate(start)} - ${formatDate(end)}`;
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
  grid.innerHTML = rows.map(trip => {
    const stops = trip.stops || [];
    const days = tripDays(trip.start_date, trip.end_date);
    const countdown = countdownLabel(trip);
    const route = [...new Set(stops.map(stop => stop.name).filter(Boolean))].slice(0, 3).join(' · ');
    return `
    <article class="trip-pick-card" data-project="${escapeHtml(trip.project_id)}">
      <div class="trip-pick-media">
        <div class="trip-pick-banner ${tripBanner(trip) ? '' : 'no-image'}" data-banner="${escapeHtml(tripBanner(trip))}"></div>
        <span class="trip-pick-date">${escapeHtml(fmtRange(trip.start_date, trip.end_date))}</span>
      </div>
      <div class="trip-pick-body">
        <div class="trip-pick-title"><h3>${escapeHtml(trip.name || 'ทริปไม่มีชื่อ')}</h3>${countdown ? `<span class="trip-countdown">· ${escapeHtml(countdown)}</span>` : ''}</div>
        ${route ? `<p class="trip-route">${escapeHtml(route)}</p>` : ''}
        <div class="trip-facts">${days ? `<span>🗓️ ${days} วัน</span>` : ''}<span>📍 ${stops.length} stops</span><span>👨‍👩‍👧 ${Number(trip.member_count || 0)} คน</span></div>
        <div class="trip-pick-tags">
          ${trip.status === 'closed' ? '<span class="closed">ปิดทริปแล้ว</span>' : ''}
          ${trip.posted_to_ledger ? '<span class="posted">โพสต์บัญชีแล้ว</span>' : ''}
        </div>
        ${renderStops(trip)}
        <div class="trip-card-actions"><button type="button" class="trip-open">เปิดทริป →</button><button type="button" class="trip-more" data-delete-trip="${escapeHtml(trip.project_id)}" aria-label="ลบทริป ${escapeHtml(trip.name || '')}" title="ลบทริป"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button></div>
      </div>
    </article>`;
  }).join('');

  $$('[data-banner]', grid).forEach(banner => {
    if (banner.dataset.banner) banner.style.backgroundImage = `url("${banner.dataset.banner.replaceAll('"', '%22')}")`;
  });
  requestAnimationFrame(syncStopRails);

  $$('.trip-pick-card', grid).forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('.trip-stop-slide,[data-delete-trip]')) return;
      location.href = `index.html?live=1&projectId=${encodeURIComponent(card.dataset.project)}`;
    });
  });
  $$('.trip-stop-slide', grid).forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const strip = button.parentElement.querySelector('.trip-stop-strip');
    strip.scrollBy({ left: Number(button.dataset.scroll) * 234, behavior: 'smooth' });
  }));
  $$('[data-delete-trip]', grid).forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    const trip = allTrips.find(row => row.project_id === button.dataset.deleteTrip);
    if (!trip || !confirm(`ลบทริป “${trip.name || 'ทริปไม่มีชื่อ'}” ?\nข้อมูลทริปที่ลบแล้วกู้กลับไม่ได้`)) return;
    button.disabled = true;
    try {
      await TripApi.deleteTrip(trip.project_id);
      allTrips = allTrips.filter(row => row.project_id !== trip.project_id);
      renderShortcut();
      renderGrid();
    } catch (error) {
      button.disabled = false;
      alert(`ลบทริปไม่สำเร็จ: ${error.message}`);
    }
  }));
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
window.addEventListener('resize', syncStopRails);

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
$('#newTripTop')?.addEventListener('click', openNewTripDialog);
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
