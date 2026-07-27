/* Hunsa Trip is a standalone UI. It consumes only the Trip API contract. */
const HUNSA_API_BASE = localStorage.getItem('hunsa_api_base') || 'https://record-revenue.9nimz.workers.dev';
const HunsaState = { trips: [], activeTrip: null, tab: 'itinerary', detail: null, loading: true };
const hunsaApp = document.getElementById('hunsa-app');
const hunsaUserFromUrl = new URLSearchParams(window.location.search).get('user') || '';
const hunsaUserId = () => {
  try {
    const familySession = JSON.parse(sessionStorage.getItem('logged_in_user') || 'null');
    return hunsaUserFromUrl || localStorage.getItem('hunsa_user_id') || familySession?.user_id || localStorage.getItem('current_user_id') || '';
  } catch { return hunsaUserFromUrl || localStorage.getItem('hunsa_user_id') || localStorage.getItem('current_user_id') || ''; }
};
const HUNSA_ICON_LIBRARY = [
  ['temple','⛩️','../assets/icons/japan_1.png'], ['street','🏮','../assets/icons/japan_2.png'],
  ['river','🌉','../assets/icons/japan_3.png'], ['hotel','🏨','../assets/icons/hokkaido_1.png'],
  ['food','🍜','../assets/icons/hokkaido_2.png'], ['train','🚆','../assets/icons/hokkaido_3.png'],
  ['camera','📸','../assets/icons/mascot_1.png'], ['nature','🌳','../assets/icons/japan_4.png']
];
const stopName = stop => stop.accommodation || stop.city || 'สถานที่';
const stopTime = stop => stop.time && stop.end_time ? `${stop.time}–${stop.end_time}` : stop.time || 'ยังไม่กำหนดเวลา';
const stopImage = (stop, index = 0) => stop.icon_asset || HUNSA_ICON_LIBRARY[index % HUNSA_ICON_LIBRARY.length][2];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const money = (amount, currency = 'THB') => new Intl.NumberFormat('th-TH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
const dateText = value => value ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'ยังไม่ระบุวัน';
const memberCount = value => { try { return Array.isArray(JSON.parse(value)) ? JSON.parse(value).length : Number(value) || 1; } catch { return Number(value) || 1; } };

async function hunsaFetch(path, options = {}) {
  const response = await fetch(`${HUNSA_API_BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(hunsaUserId()), ...(options.headers || {}) } });
  if (!response.ok) throw new Error(response.status === 401 ? 'กรุณาเข้าสู่ระบบก่อนเปิด Hunsa Trip' : 'ไม่สามารถเชื่อมต่อข้อมูลทริปได้');
  return response.json();
}

async function loadTrips() {
  HunsaState.loading = true; render();
  try {
    const data = await hunsaFetch('/api/trips');
    HunsaState.trips = Array.isArray(data) ? data : data.trips || [];
    HunsaState.activeTrip = HunsaState.trips.find(t => t.status === 'active') || HunsaState.trips[0] || null;
    if (HunsaState.activeTrip) await loadTrip(HunsaState.activeTrip.project_id);
  } catch (error) { HunsaState.error = error.message; }
  HunsaState.loading = false; render();
}

async function loadTrip(projectId) {
  HunsaState.detail = null; render();
  try { HunsaState.detail = await hunsaFetch(`/api/travel?projectId=${encodeURIComponent(projectId)}`); }
  catch (error) { HunsaState.error = error.message; }
  render();
}

function mapStops(stops) {
  const source = stops.length ? stops : [{ city: HunsaState.activeTrip?.destination || 'เริ่มวางแผน', stop_date: HunsaState.activeTrip?.start_date }];
  const positions = [[22,68],[49,54],[76,70],[63,28],[31,34]];
  return source.slice(0, 5).map((stop, index) => ({ ...stop, p: positions[index], color: ['#f65b86','#8864d8','#39b99f','#f5ab46','#4c8ff5'][index] }));
}

function tripHeader(trip, rawStops = []) {
  const stops = mapStops(rawStops); const points = stops.map(stop => `${stop.p[0]},${stop.p[1]}`).join(' ');
  return `<section class="trip-hero"><div class="hero-map" aria-hidden="true"></div><div class="hero-copy"><h1>แผนเที่ยว</h1><p>${esc(trip.name)} <span>♥</span></p><div class="trip-meta"><span>▣ ${dateText(trip.start_date)} – ${dateText(trip.end_date)}</span><span>♟ ${memberCount(trip.members)}</span></div></div><div class="hero-stickers" aria-hidden="true"><span>🗻</span><span>⛩️</span><span>🌸</span></div><svg class="hero-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points}"/></svg>${stops.map(stop => `<div class="hero-pin" style="--x:${stop.p[0]}%;--y:${stop.p[1]}%;--pin:${stop.color}"><i></i><b>${esc(stopName(stop))}</b><small>${dateText(stop.stop_date)}</small></div>`).join('')}</section>`;
}

function bottomNav() {
  const items = [['itinerary','⌖','แผนเที่ยว'], ['wallet','▣','วอลเล็ต'], ['expenses','▤','รายจ่าย'], ['settings','⚙','จัดการ']];
  return `<nav class="bottom-nav">${items.map(([id, icon, label]) => `<button class="${HunsaState.tab === id ? 'active':''}" data-tab="${id}"><b>${icon}</b><span>${label}</span></button>`).join('')}</nav>`;
}

function itineraryView(detail, trip) {
  const rawStops = detail.stops || []; const stops = mapStops(rawStops); const city = stopName(stops[0] || {}) || trip.destination || 'เมืองปลายทาง';
  const poly = stops.map(stop => `${stop.p[0]},${stop.p[1]}`).join(' ');
  const places = rawStops.filter(stop => !stop.parent_stop_id).sort((a,b) => String(a.time || '').localeCompare(String(b.time || '')));
  const placesMarkup = places.length ? places.map((place, placeIndex) => {
    const children = rawStops.filter(stop => stop.parent_stop_id === place.stop_id).sort((a,b) => String(a.time || '').localeCompare(String(b.time || '')));
    return `<section class="place-card"><header><span class="place-pin">📍</span><div><h3>${esc(stopName(place))}</h3><p>${esc(place.notes || 'วางแผนกิจกรรมและจุดแวะของสถานที่นี้')}</p></div><button aria-label="ย่อรายการ">⌃</button></header><div class="timeline">${children.length ? children.map((child,index) => `<article><span class="timeline-dot"></span><img class="spot-icon-image" src="${esc(stopImage(child,index))}" alt=""><div><h4>${esc(stopName(child))}</h4><p>${esc(child.notes || 'เพิ่มรายละเอียดกิจกรรม')}</p></div><div class="it-times"><b>◷ ${esc(stopTime(child))}</b></div><button class="it-more" data-edit-stop="${esc(child.stop_id)}" aria-label="แก้ไข ${esc(stopName(child))}">⋮</button></article>`).join('') : `<div class="empty-activity"><b>＋</b><span>ยังไม่มีกิจกรรม<br><small>เพิ่มจุดย่อยในเมืองนี้ได้</small></span></div>`}</div><button class="add-activity" data-add-stop="${esc(place.stop_id)}">＋ เพิ่มกิจกรรมใน ${esc(stopName(place))}</button></section>`;
  }).join('') : '<section class="place-card empty-place"><p>เริ่มเพิ่มสถานที่หลัก แล้วใส่จุดย่อยพร้อมเวลาที่จะไปได้เลย</p></section>';
  return `<main class="screen itinerary-screen">
    <section class="route-map"><img src="../assets/images/hokkaido_ghibli_map.jpg" alt="แผนที่ทริป"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${poly}"/></svg>${stops.map((s,i) => `<button class="map-pin" data-stop="${esc(s.stop_id || '')}" style="--x:${s.p[0]}%;--y:${s.p[1]}%;--pin:${s.color}" title="${esc(s.city)}"><i></i><strong>${esc(s.city)}</strong><small>${dateText(s.stop_date)}</small></button>`).join('')}</section>
    <section class="day-card"><div class="day-title"><span>วัน<br><b>1</b></span><div><h2>${esc(city)}</h2><p>${dateText(stops[0]?.stop_date || trip.start_date)}</p></div><em>🗼</em></div>
      <div class="weather-card"><div><i>🌤️</i><b>เช้า</b><strong>20°</strong><small>💧 10%</small></div><div><i>☀️</i><b>บ่าย</b><strong>24°</strong><small>💧 20%</small></div><div><i>🌙</i><b>ค่ำ</b><strong>18°</strong><small>💧 10%</small></div></div>
      <section class="itinerary-places">${placesMarkup}</section>
    </section><button class="floating-add" data-add-stop=""><b>＋</b><span>เพิ่มสถานที่</span></button>
  </main>`;
}

function walletView(detail) {
  const wallets = detail.wallets || []; const total = wallets.reduce((sum, wallet) => sum + Number(wallet.balance_thb || 0), 0);
  return `<main class="screen wallet-screen"><section class="balance-card"><p>ยอดเงินในทริปทั้งหมด <span>◉</span></p><h2>${money(total)}</h2><small>รวมทุกสกุลเงินในกระเป๋าทริป</small><div class="currency-pills">${wallets.length ? wallets.map(w => `<span>${esc(w.currency || 'THB')} <b>${money(w.balance || 0, w.currency || 'THB')}</b></span>`).join('') : '<span>ยังไม่มีกระเป๋าเงิน</span>'}</div></section><button class="create-card" data-wallet="create">👛 <span><b>สร้างกระเป๋าใหม่</b><small>จัดการเงินให้แต่ละสกุลเงิน</small></span>›</button><button class="fund-button" data-wallet="fund">▣ เติมเงินเข้าทริป <b>›</b></button><section class="wallet-list"><h2>กระเป๋าเงิน</h2>${wallets.length ? wallets.map(w => `<article><span class="flag">${w.currency === 'JPY' ? '🇯🇵' : '🇹🇭'}</span><div><h3>${esc(w.name || `กระเป๋า ${w.currency}`)}</h3><p>ยอดคงเหลือในทริป</p></div><strong>${money(w.balance || 0, w.currency || 'THB')}</strong></article>`).join('') : '<p class="empty-state">กด “สร้างกระเป๋าใหม่” เพื่อเริ่มจัดการเงินทริป</p>'}</section></main>`;
}

function expenseView(detail) {
  const expenses = detail.expenses || []; const total = expenses.reduce((sum, x) => sum + Number(x.amount_thb || 0), 0);
  return `<main class="screen expense-screen"><section class="expense-summary"><div><p>ค่าใช้จ่ายรวม</p><h2>${money(total)}</h2><small>${expenses.length} รายการ</small></div><div class="donut"><b>${expenses.length}</b><span>บิล</span></div></section><div class="filter-row"><button class="active">☷ ทั้งหมด</button><button>🍜 อาหาร</button><button>🚆 เดินทาง</button><button>🏨 ที่พัก</button></div><section class="expense-list"><header><h2>รายการบิลล่าสุด</h2><button>ดูทั้งหมด ›</button></header>${expenses.length ? expenses.slice(0,8).map(x => `<article><span class="expense-icon">${x.type === 'INCOME' ? '↙' : '🍜'}</span><div><h3>${esc(x.note || x.category_name || 'รายการค่าใช้จ่าย')}</h3><p>${dateText(x.expense_date)} · ${esc(x.category_name || 'ทั่วไป')}</p></div><strong>${money(x.amount_thb)}</strong><b>›</b></article>`).join('') : '<p class="empty-state">ยังไม่มีบิลในทริปนี้</p>'}</section><button class="floating-add" data-expense="add"><b>＋</b><span>เพิ่มบิล</span></button></main>`;
}

function settingsView(detail, trip) {
  const rows = [['👨‍👩‍👧','สมาชิกทริป',`${memberCount(trip.members)} คน`],['👛','งบประมาณ',money(trip.total_budget)],['📄','เอกสาร',`${(detail.documents || []).length} รายการ`],['💱','สกุลเงิน','ตั้งค่าเงินหลัก'],['🌤️','การแจ้งเตือนอากาศ','เปิดการแจ้งเตือน']];
  return `<main class="screen settings-screen"><section class="setting-hero"><span>‹</span><h1>จัดการทริป</h1><p>${esc(trip.name)} ♥</p><div>⛩️ 🗻 🌸</div></section><section class="settings-list">${rows.map(([icon,label,value]) => `<button><i>${icon}</i><span><b>${label}</b><small>${value}</small></span><em>${label === 'การแจ้งเตือนอากาศ' ? '●' : '›'}</em></button>`).join('')}</section><section class="banner-choice"><h2>รูปภาพ banner</h2><p>เลือกภาพสำหรับหน้าทริปของคุณ</p><div><img class="selected" src="../assets/images/banner_japan.jpg" alt="แบนเนอร์ญี่ปุ่น"><img src="../assets/images/banner_hokkaido.jpg" alt="แบนเนอร์ฮอกไกโด"><img src="../assets/images/banner_nagoya.jpg" alt="แบนเนอร์ญี่ปุ่น"></div></section><button class="close-trip">🧳 <span><b>ปิดทริปนี้</b><small>สรุปค่าใช้จ่ายและปิดทริปนี้อย่างถาวร</small></span>›</button></main>`;
}

function render() {
  if (HunsaState.loading) { hunsaApp.innerHTML = '<div class="loading"><span>✦</span>กำลังจัดกระเป๋าให้คุณ…</div>'; return; }
  if (HunsaState.error && !HunsaState.activeTrip) { hunsaApp.innerHTML = `<main class="welcome"><div>✈️</div><h1>Hunsa Trip</h1><p>${esc(HunsaState.error)}</p><button class="primary-button" data-create="1">สร้างทริปแรก</button><small>ตั้งค่า <code>hunsa_user_id</code> ในเบราว์เซอร์เพื่อเชื่อมบัญชีเดิม</small></main>`; return; }
  if (!HunsaState.activeTrip) { hunsaApp.innerHTML = '<main class="welcome"><div>🧳</div><h1>พร้อมไปเที่ยวหรือยัง?</h1><p>สร้างทริปแรก แล้วชวนคนที่คุณรักมาเก็บความทรงจำด้วยกัน</p><button class="primary-button" data-create="1">＋ สร้างทริปใหม่</button></main>'; return; }
  const detail = HunsaState.detail || { trip: HunsaState.activeTrip, stops:[], wallets:[], expenses:[], documents:[] }; const trip = detail.trip || HunsaState.activeTrip;
  const views = { itinerary: itineraryView, wallet: walletView, expenses: expenseView, settings: settingsView };
  const iconLibraryNote = HunsaState.tab === 'settings' ? '<section class="icon-library-note"><h2>คลังไอคอนสถานที่</h2><p>ภาพการ์ตูนในระบบใช้กับสถานที่และกิจกรรมได้</p><code>cute hand-drawn travel icon, soft pastel, white outline, centered object, no text, square 512×512</code><small>ภาพที่นำเข้าใหม่จะบันทึกเข้าคลัง Hunsa ผ่าน R2 storage</small></section>' : '';
  hunsaApp.innerHTML = `<div class="app-frame">${tripHeader(trip, detail.stops || [])}${views[HunsaState.tab](detail, trip)}${iconLibraryNote}${bottomNav()}</div>`;
}

function openStopDialog(stopId = '', parentStopId = '') {
  const dialog = document.getElementById('stop-dialog'); const form = document.getElementById('stop-form'); const stop = (HunsaState.detail?.stops || []).find(item => item.stop_id === stopId);
  form.reset(); form.elements.stop_id.value = stop?.stop_id || ''; form.elements.stop_date.value = (stop?.stop_date || HunsaState.activeTrip?.start_date || '').slice(0,10); form.elements.time.value = stop?.time || '09:00'; form.elements.end_time.value = stop?.end_time || '10:00'; form.elements.accommodation.value = stopName(stop || {}); form.elements.notes.value = stop?.notes || ''; form.elements.icon.value = stop?.icon || '📍';
  document.getElementById('stop-form-title').textContent = stop ? 'แก้ไขสถานที่' : parentStopId ? 'เพิ่มกิจกรรมย่อย' : 'เพิ่มสถานที่';
  const parent = document.getElementById('stop-parent'); parent.innerHTML = '<option value="">สถานที่หลักใหม่</option>' + (HunsaState.detail?.stops || []).filter(item => !item.parent_stop_id && item.stop_id !== stopId).map(item => `<option value="${esc(item.stop_id)}">${esc(stopName(item))}</option>`).join(''); parent.value = stop?.parent_stop_id || parentStopId || '';
  const assetBox = document.getElementById('stop-icon-assets'); assetBox.innerHTML = HUNSA_ICON_LIBRARY.map(([name, icon, src]) => `<button type="button" class="${(stop?.icon_asset || HUNSA_ICON_LIBRARY[0][2]) === src ? 'selected':''}" data-icon-asset="${src}" data-icon="${icon}" title="${name}"><img src="${src}" alt="${name}"></button>`).join(''); form.elements.icon_asset.value = stop?.icon_asset || HUNSA_ICON_LIBRARY[0][2]; dialog.showModal();
}

async function deleteStop(stopId) {
  const stop = (HunsaState.detail?.stops || []).find(item => item.stop_id === stopId); if (!stop || !confirm(`ลบ “${stopName(stop)}” และจุดย่อยทั้งหมดใช่ไหม?`)) return;
  await hunsaFetch('/api/trip-stops', { method:'DELETE', body:JSON.stringify({ stop_id: stopId }) }); await loadTrip(HunsaState.activeTrip.project_id);
}

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]'); if (tab) { HunsaState.tab = tab.dataset.tab; render(); window.scrollTo({top:0, behavior:'smooth'}); }
  if (event.target.closest('[data-create]')) document.getElementById('trip-dialog').showModal();
  const addStop = event.target.closest('[data-add-stop]'); if (addStop) openStopDialog('', addStop.dataset.addStop);
  const editStop = event.target.closest('[data-edit-stop]'); if (editStop) openStopDialog(editStop.dataset.editStop);
  const asset = event.target.closest('[data-icon-asset]'); if (asset) { document.querySelectorAll('[data-icon-asset]').forEach(button => button.classList.remove('selected')); asset.classList.add('selected'); const form = document.getElementById('stop-form'); form.elements.icon_asset.value = asset.dataset.iconAsset; form.elements.icon.value = asset.dataset.icon; }
  if (event.target.closest('[data-expense]')) alert('หน้าสร้างบิลจะเชื่อมกับ TripExpenses API ในรอบถัดไป');
  if (event.target.closest('[data-wallet]')) alert('หน้ากระเป๋าและเติมเงินจะเชื่อมกับ Trip Wallet API ในรอบถัดไป');
});
document.getElementById('stop-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries()); const message = document.getElementById('stop-message');
  if (data.end_time <= data.time) { message.textContent = 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม'; return; }
  data.project_id = HunsaState.activeTrip.project_id; data.location_type = data.parent_stop_id ? 'กิจกรรม' : 'สถานที่หลัก'; data.city = ''; data.is_main_day = data.parent_stop_id ? 0 : 1;
  try { await hunsaFetch('/api/trip-stops', { method:'POST', body:JSON.stringify(data) }); document.getElementById('stop-dialog').close(); await loadTrip(HunsaState.activeTrip.project_id); }
  catch (error) { message.textContent = error.message; }
});
document.getElementById('new-trip-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries()); payload.status = 'active'; payload.total_budget = 0;
  try { const result = await hunsaFetch('/api/trips', { method:'POST', body:JSON.stringify(payload) }); document.getElementById('trip-dialog').close(); await loadTrips(); if (result.project_id) await loadTrip(result.project_id); }
  catch (error) { alert(error.message); }
});
loadTrips();
