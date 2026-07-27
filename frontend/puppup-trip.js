/* ===========================================================
   PupPup Trip — "Prototype Trip" หน้าใหม่ เชื่อมข้อมูลจริง
   เฟส 1: แผนที่ + itinerary เท่านั้น (Bills/Wallet/Settings ยังไม่ทำ)
   ใช้ endpoint จริง: GET /api/trips, GET /api/travel?projectId=
   ปักหมุดด้วย calibration ของภาพ art/hero_plan_hokkaido5.png (869x470)
   ตำแหน่งหมุดที่ผู้ใช้ลากแก้ จะถูกบันทึกจริงลง Projects.route_data
   ผ่าน POST /api/trips/routes (คอลัมน์/endpoint นี้มีอยู่แล้วในระบบ)
   =========================================================== */

const PP = {
  trips: [],
  tripId: null,
  trip: null,
  stops: [],
  expenses: [],
  wallets: [],
  documents: [],
  routeData: {},   // { [stop_id]: {x,y} } — override ตำแหน่งหมุดที่ผู้ใช้ลากเอง
  editing: false,
  loaded: false,
  activeTab: 'plan',  // plan | wallet | bills | settings
  activeDayIndex: 0
};

/* หมุดที่ calibrate ไว้แล้วสำหรับภาพฮอกไกโด (art/hero_plan_hokkaido5.png, 869x470)
   คัดลอกพิกัดมาจาก puppup-prototype/prototype.js (ค่าจริงที่ผ่านการปรับแล้ว) */
const PP_HOKKAIDO_PINS = [
  { keys: ['sounkyo', 'souunkyo', 'sōunkyō', 'โซอุนเคียว', 'โซอุงเคียว', 'ซาวน์เคียว'], name: 'Sounkyo', color: '#7C63E0', dark: '#6A51CE', x: 397, y: 24 },
  { keys: ['akan', 'lake akan', 'อาคัง', 'ทะเลสาบอาคัง'], name: 'Lake Akan', color: '#EF5A85', dark: '#D94A73', x: 575, y: 223 },
  { keys: ['kushiro', 'คุชิโระ', 'คุชิโร'], name: 'Kushiro', color: '#4CB682', dark: '#3AA271', x: 748, y: 294 }
];
const PP_HOKKAIDO_IMG = 'puppup-prototype/art/hero_plan_hokkaido5.png';

function ppIsHokkaidoTrip(trip) {
  const t = `${trip?.name || ''} ${trip?.destination || ''}`.toLowerCase();
  return /hokkaido|ฮอกไกโด|kushiro|คุชิโระ|akan|sounkyo/.test(t);
}

function ppEscape(v) {
  return String(v ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function ppFmtMoney(n) {
  const v = Number(n) || 0;
  return '฿' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function ppFmtDate(d) {
  if (typeof formatTripDate === 'function') return formatTripDate(d);
  if (!d) return '-';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return String(d); }
}

function ppMembers(trip) {
  try { return Array.isArray(trip.members) ? trip.members : JSON.parse(trip.members || '[]'); }
  catch (_) { return String(trip.members || '').split(',').map(s => s.trim()).filter(Boolean); }
}

function ppMatchPin(place) {
  const text = `${place.city || ''} ${place.accommodation || ''} ${place.notes || ''}`.toLowerCase();
  if (!text.trim()) return null;
  return PP_HOKKAIDO_PINS.find(p => p.keys.some(k => text.includes(k))) || null;
}

/* ---------- ยอดใช้จ่ายจริงต่อจุดแวะ (TripExpenses.stop_id) ---------- */
function ppSpentForStop(stopId) {
  if (!stopId) return 0;
  return PP.expenses
    .filter(e => e.stop_id === stopId)
    .reduce((sum, e) => {
      const amt = Number(e.amount_thb || 0);
      if (e.type === 'REFUND') return sum - amt;
      if (e.type === 'TOPUP') return sum; // เงินเติมเข้ากระเป๋า ไม่ใช่รายจ่ายกิจกรรม
      return sum + amt;
    }, 0);
}
function ppSpentForPlace(place) {
  const children = PP.stops.filter(s => s.parent_stop_id === place.stop_id);
  return ppSpentForStop(place.stop_id) + children.reduce((s, c) => s + ppSpentForStop(c.stop_id), 0);
}

/* ---------- โหลดรายการทริป แล้วเลือกทริปที่จะแสดง ---------- */
async function loadPuppupTrip() {
  const root = document.getElementById('ppRoot');
  if (!root) return;
  if (!PP.trips.length) {
    root.innerHTML = `<div class="pp-trip"><p style="padding:40px;color:#8B95A8">กำลังโหลดทริป…</p></div>`;
    try {
      const res = await fetch(`${getTravelApiBase()}/api/trips`, { headers: { 'x-user-id': getUserIdHeader() } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      PP.trips = await res.json();
    } catch (e) {
      root.innerHTML = `<div class="pp-trip"><p style="padding:40px;color:#E33C6B">โหลดรายการทริปไม่สำเร็จ: ${ppEscape(e.message)}</p></div>`;
      return;
    }
  }
  if (!PP.trips.length) {
    root.innerHTML = `<div class="pp-trip"><div class="empty-box" style="margin-top:40px"><b>ยังไม่มีทริป</b><small>สร้างทริปจากเมนู TRIPS ก่อน แล้วกลับมาดูที่นี่ได้</small></div></div>`;
    return;
  }
  if (!PP.tripId) {
    const hk = PP.trips.find(ppIsHokkaidoTrip);
    PP.tripId = (hk || PP.trips[0]).project_id;
  }
  await ppLoadSelectedTrip(root);
}

async function ppLoadSelectedTrip(root) {
  root = root || document.getElementById('ppRoot');
  try {
    const res = await fetch(`${getTravelApiBase()}/api/travel?projectId=${encodeURIComponent(PP.tripId)}`, {
      headers: { 'x-user-id': getUserIdHeader() }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'ไม่พบทริป');
    PP.trip = data.trip;
    PP.stops = data.stops || [];
    PP.expenses = data.expenses || [];
    PP.wallets = data.wallets || [];
    PP.documents = data.documents || [];
    try { PP.routeData = JSON.parse(PP.trip.route_data || '{}') || {}; } catch (_) { PP.routeData = {}; }
    PP.loaded = true;
    PP.activeTab = PP.activeTab || 'plan';
  } catch (e) {
    root.innerHTML = `<div class="pp-trip"><p style="padding:40px;color:#E33C6B">โหลดข้อมูลทริปไม่สำเร็จ: ${ppEscape(e.message)}</p></div>`;
    return;
  }
  try {
    ppRender(root);
  } catch (e) {
    console.error('ppRender error', e);
    root.innerHTML = `<div class="pp-trip"><p style="padding:40px;color:#E33C6B">แสดงผลไม่สำเร็จ: ${ppEscape(e.message)}</p></div>`;
  }
}

/* ---------- Render ---------- */
function ppRender(root) {
  const trip = PP.trip;
  const rootStops = PP.stops.filter(s => !s.parent_stop_id)
    .sort((a, b) => String(a.stop_date || '').localeCompare(String(b.stop_date || '')) || String(a.time || '').localeCompare(String(b.time || '')));
  const dates = [...new Set(rootStops.map(s => s.stop_date).filter(Boolean))].sort();
  const isHokkaido = ppIsHokkaidoTrip(trip);
  const members = ppMembers(trip);

  const tripPicker = PP.trips.length > 1 ? `
    <div class="pp-topbar">
      <select id="ppTripSelect">${PP.trips.map(t => `<option value="${ppEscape(t.project_id)}" ${t.project_id === PP.tripId ? 'selected' : ''}>${ppEscape(t.name || t.project_id)}</option>`).join('')}</select>
      <span class="pp-hint">เลือกทริปที่จะแสดง</span>
    </div>` : '';

  const heroImg = isHokkaido ? PP_HOKKAIDO_IMG : (trip.theme_banner ? trip.theme_banner.replace(/^\/+/, '') : PP_HOKKAIDO_IMG);

  const html = `
    <div class="pp-trip">
      ${tripPicker}
      <div class="pp-tabs" id="ppTabs">
        <button class="pp-tab${PP.activeTab === 'plan' ? ' on' : ''}" data-tab="plan">🗺️ ทริป</button>
        <button class="pp-tab${PP.activeTab === 'wallet' ? ' on' : ''}" data-tab="wallet">👛 วอลเล็ต</button>
        <button class="pp-tab${PP.activeTab === 'bills' ? ' on' : ''}" data-tab="bills">🧾 บิล</button>
        <button class="pp-tab${PP.activeTab === 'settings' ? ' on' : ''}" data-tab="settings">⚙️ ตั้งค่า</button>
      </div>

      <div class="pp-screen" data-screen="plan" ${PP.activeTab !== 'plan' ? 'hidden' : ''}>
        <div class="pp-scaleOuter"><div class="pp-canvas" id="ppCanvas">
          <div class="maphero" id="ppHero">
            <img class="bg" id="ppBg" src="${ppEscape(heroImg)}" alt="">
            <svg class="route" id="ppRoute" viewBox="0 0 869 470"></svg>
            <div id="ppPins"></div>
            ${isHokkaido ? `<button class="pin-edit" id="ppPinEdit">📍 แก้หมุด</button>` : ''}
            <div class="zoomhint" id="ppZoomHint">👆 แตะเพื่อซูม</div>
          </div>
          <div class="triprow">
            <div class="l"><b>${ppEscape(trip.name || 'ทริปใหม่')} ❤</b>
              <small>${ppEscape(ppFmtDate(trip.start_date))} – ${ppEscape(ppFmtDate(trip.end_date))}</small></div>
            <div class="r"><span>👤 ${members.length || 1} คน</span> <span><b>${ppFmtMoney(PP.expenses.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + Number(e.amount_thb || 0), 0))}</b>&nbsp;ใช้ไปแล้ว</span></div>
          </div>
          ${!isHokkaido ? `<p class="pp-note">หมายเหตุ: ตอนนี้ระบบปักหมุดแผนที่แบบ calibrate ไว้เฉพาะทริปฮอกไกโดเท่านั้น ทริปอื่นจะยังไม่มีหมุดบนแผนที่</p>` : ''}
          ${dates.length ? `<div class="days" id="ppDays">${dates.map((d, i) => {
            const dayPlaces = rootStops.filter(s => s.stop_date === d);
            const cost = dayPlaces.reduce((s, p) => s + ppSpentForPlace(p), 0);
            const label = dayPlaces[0] ? ppEscape(dayPlaces[0].city || dayPlaces[0].accommodation || `วัน ${i + 1}`) : `วัน ${i + 1}`;
            return `<button class="day-pill${i === ppActiveDayIndex(dates) ? ' on' : ''}" data-day="${i}">
              <span>วัน ${i + 1}</span><b>${ppEscape(ppFmtDate(d))}</b><i>${label}</i>
              ${cost ? `<span class="cost">${ppFmtMoney(cost)}</span>` : ''}
            </button>`;
          }).join('')}<button class="day-pill day-add" data-add-day="1"><span>＋</span><b>เพิ่ม</b></button></div>` : ''}
        </div></div>
        <div class="pp-scaleOuter"><div class="pp-canvas" id="ppPanels" style="margin-top:-1px">
          ${dates.length ? dates.map((d, i) => ppRenderDayPanel(d, i, rootStops, ppActiveDayIndex(dates))).join('') : `
            <div class="empty-box" style="margin:30px"><b>ยังไม่มีแผนเที่ยวในทริปนี้</b><small>เริ่มเพิ่มสถานที่แรกได้เลย</small>
              <button class="addplace-btn" style="margin-top:16px" data-add-day="1">＋ เพิ่มสถานที่แรก</button></div>`}
        </div></div>
      </div>

      <div class="pp-screen" data-screen="wallet" ${PP.activeTab !== 'wallet' ? 'hidden' : ''}>
        <div class="pp-scaleOuter">${ppRenderWalletScreen()}</div>
      </div>

      <div class="pp-screen" data-screen="bills" ${PP.activeTab !== 'bills' ? 'hidden' : ''}>
        <div class="pp-scaleOuter">${ppRenderBillsScreen()}</div>
      </div>

      <div class="pp-screen" data-screen="settings" ${PP.activeTab !== 'settings' ? 'hidden' : ''}>
        <div class="pp-scaleOuter">${ppRenderSettingsScreen()}</div>
      </div>
    </div>`;
  root.innerHTML = html;

  ppRenderPins(rootStops, isHokkaido);
  ppBindDayPills();
  ppBindZoom();
  ppBindPinEdit();
  ppBindTripSelect();
  ppBindTabs();
  ppBindDelegatedEvents(root);
  requestAnimationFrame(ppFitScale);
}

/* ---------- ฟอร์มเพิ่ม/แก้ไข/ลบจุดแวะ — เขียนจริงผ่าน /api/trip-stops ---------- */
function ppCurrentDates() {
  return [...new Set(PP.stops.filter(s => !s.parent_stop_id).map(s => s.stop_date).filter(Boolean))].sort();
}
function ppAddDays(dateStr, n) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  } catch (_) { return dateStr; }
}

function ppBindDelegatedEvents(root) {
  if (root.dataset.ppBound) return;
  root.dataset.ppBound = '1';
  root.addEventListener('click', e => {
    const addDay = e.target.closest('[data-add-day]');
    const addPlace = e.target.closest('[data-add-place]');
    const addActivity = e.target.closest('[data-add-activity]');
    const placeHead = e.target.closest('.place-head');
    const actRow = e.target.closest('.act-row');
    if (addDay) {
      const dates = ppCurrentDates();
      const last = dates[dates.length - 1];
      const next = last ? ppAddDays(last, 1) : (PP.trip?.start_date || '');
      ppOpenStopForm({ mode: 'addPlace', date: next });
    } else if (addPlace) {
      ppOpenStopForm({ mode: 'addPlace', date: addPlace.dataset.addPlace });
    } else if (addActivity) {
      ppOpenStopForm({ mode: 'addActivity', parentStopId: addActivity.dataset.addActivity });
    } else if (placeHead) {
      const sec = placeHead.closest('.place-sec');
      if (sec?.dataset.stopId) ppOpenStopForm({ mode: 'editPlace', stopId: sec.dataset.stopId });
    } else if (actRow) {
      const art = actRow.closest('.act');
      if (art?.dataset.stopId) ppOpenStopForm({ mode: 'editActivity', stopId: art.dataset.stopId, parentStopId: art.dataset.parentId });
    } else {
      const openBtn = e.target.closest('[data-open]');
      if (openBtn?.dataset.open === 'addBill') ppOpenBillForm();
      else if (openBtn?.dataset.open === 'fundWallet') ppOpenFundForm(openBtn.dataset.wallet || null);
    }
  });
}

function ppOpenStopForm(opts) {
  const stop = opts.stopId ? PP.stops.find(s => s.stop_id === opts.stopId) : null;
  const isPlace = opts.mode === 'addPlace' || opts.mode === 'editPlace';
  const isEdit = opts.mode.startsWith('edit');
  const title = isPlace ? (isEdit ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่ใหม่') : (isEdit ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม');
  const colorOpts = ['#EC5F86', '#7C63E0', '#4CB682', '#2662E8', '#F0A93B'];
  const curColor = stop?.marker_color || colorOpts[0];

  ppCloseStopForm();
  const mask = document.createElement('div'); mask.className = 'pp-mask'; mask.id = 'ppMask';
  const sheet = document.createElement('div'); sheet.className = 'pp-sheet'; sheet.id = 'ppSheet';
  sheet.innerHTML = `
    <h3>${title}</h3>
    <form id="ppStopForm">
      ${isPlace ? `<label class="pp-field"><span>วันที่</span><input type="date" id="ppfDate" value="${ppEscape(stop?.stop_date || opts.date || '')}" required></label>` : ''}
      <label class="pp-field"><span>ชื่อ${isPlace ? 'สถานที่' : 'กิจกรรม'}</span>
        <input type="text" id="ppfName" value="${ppEscape(isPlace ? (stop?.city || '') : (stop?.accommodation || ''))}" placeholder="${isPlace ? 'เช่น Sounkyo' : 'เช่น แช่ออนเซ็นตอนเย็น'}" required></label>
      ${!isPlace ? `<label class="pp-field"><span>เวลา</span><input type="time" id="ppfTime" value="${ppEscape(stop?.time || '')}"></label>` : ''}
      <label class="pp-field"><span>รายละเอียด/โน้ต</span><textarea id="ppfNotes">${ppEscape(stop?.notes || '')}</textarea></label>
      ${isPlace ? `<div class="pp-field"><span>สีหมุด</span><div class="pp-swatches" id="ppfColors">${colorOpts.map(c => `<div class="pp-swatch${c === curColor ? ' sel' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}</div></div>` : ''}
      <div class="pp-sheet-actions">
        ${isEdit ? `<button type="button" class="pp-btn danger" id="ppfDelete">🗑</button>` : ''}
        <button type="button" class="pp-btn secondary" id="ppfCancel">ยกเลิก</button>
        <button type="submit" class="pp-btn" id="ppfSave">บันทึก</button>
      </div>
    </form>`;
  document.body.append(mask, sheet);

  let pickedColor = curColor;
  sheet.querySelectorAll('.pp-swatch').forEach(sw => sw.addEventListener('click', () => {
    sheet.querySelectorAll('.pp-swatch').forEach(s => s.classList.remove('sel'));
    sw.classList.add('sel'); pickedColor = sw.dataset.c;
  }));

  mask.addEventListener('click', ppCloseStopForm);
  sheet.querySelector('#ppfCancel').addEventListener('click', ppCloseStopForm);
  const delBtn = sheet.querySelector('#ppfDelete');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('ลบรายการนี้ใช่ไหม (ถ้าเป็นสถานที่หลัก จะลบกิจกรรมย่อยทั้งหมดในนั้นด้วย)')) return;
    await ppDeleteStop(opts.stopId);
    ppCloseStopForm();
  });

  sheet.querySelector('#ppStopForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = sheet.querySelector('#ppfName').value.trim();
    if (!name) return;
    const notes = sheet.querySelector('#ppfNotes').value.trim();
    /* UPDATE ที่ /api/trip-stops เขียนทับทุกคอลัมน์เสมอ (ไม่ใช่ partial update)
       จึงต้องเอาค่าฟิลด์เดิมของ stop มาใส่ก่อน แล้วค่อยแก้เฉพาะฟิลด์ที่ฟอร์มนี้แก้ไข
       ป้องกันข้อมูลเดิม (icon_asset, header_color ฯลฯ) หายเวลาแก้ไขผ่านฟอร์มนี้ */
    const payload = {
      project_id: PP.tripId,
      stop_date: stop?.stop_date || null,
      time: stop?.time || null,
      end_time: stop?.end_time || null,
      city: stop?.city || null,
      accommodation: stop?.accommodation || null,
      restaurants: stop?.restaurants || null,
      notes: notes || null,
      location_type: stop?.location_type || null,
      parent_stop_id: stop?.parent_stop_id || null,
      icon: stop?.icon || null,
      icon_asset: stop?.icon_asset || null,
      is_main_day: stop?.is_main_day || 0,
      marker_color: stop?.marker_color || null,
      header_color: stop?.header_color || null,
      font_size: stop?.font_size || null,
      text_color: stop?.text_color || null,
      time_color: stop?.time_color || null,
      border_color: stop?.border_color || null,
      label_position: stop?.label_position || null
    };
    if (isPlace) {
      payload.stop_date = sheet.querySelector('#ppfDate').value;
      payload.city = name;
      payload.marker_color = pickedColor;
      payload.parent_stop_id = null;
    } else {
      payload.accommodation = name;
      payload.time = sheet.querySelector('#ppfTime').value;
      payload.parent_stop_id = opts.parentStopId;
      const parent = PP.stops.find(s => s.stop_id === opts.parentStopId);
      payload.stop_date = parent?.stop_date || null;
    }
    if (isEdit) payload.stop_id = opts.stopId;
    const saveBtn = sheet.querySelector('#ppfSave');
    saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก…';
    try {
      const res = await fetch(`${getTravelApiBase()}/api/trip-stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      ppCloseStopForm();
      await ppLoadSelectedTrip();
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message);
      saveBtn.disabled = false; saveBtn.textContent = 'บันทึก';
    }
  });
}

function ppCloseStopForm() {
  document.getElementById('ppMask')?.remove();
  document.getElementById('ppSheet')?.remove();
}

async function ppDeleteStop(stopId) {
  try {
    const res = await fetch(`${getTravelApiBase()}/api/trip-stops`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stop_id: stopId })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await ppLoadSelectedTrip();
  } catch (e) {
    alert('ลบไม่สำเร็จ: ' + e.message);
  }
}

function ppBindTabs() {
  document.querySelectorAll('#ppTabs .pp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      PP.activeTab = btn.dataset.tab;
      document.querySelectorAll('#ppTabs .pp-tab').forEach(b => b.classList.toggle('on', b === btn));
      document.querySelectorAll('#ppRoot .pp-screen').forEach(s => { s.hidden = s.dataset.screen !== PP.activeTab; });
      requestAnimationFrame(ppFitScale);
    });
  });
}

/* ---------- ข้อมูลหมวดหมู่ (ใช้ตัวช่วยเดิมของแอปถ้ามี) ---------- */
function ppCategoryInfo(catId) {
  if (typeof getCategoryInfo === 'function') return getCategoryInfo(catId);
  return { id: catId, label: catId || 'อื่นๆ', icon: '📦', color: '#B0C4DE' };
}

/* ---------- Bills ---------- */
function ppRenderBillsScreen() {
  const expenses = (PP.expenses || []).filter(e => e.type === 'EXPENSE')
    .sort((a, b) => String(b.expense_date || '').localeCompare(String(a.expense_date || '')));
  const totalThb = expenses.reduce((s, e) => s + Number(e.amount_thb || 0), 0);
  const byCat = {};
  expenses.forEach(e => {
    const c = ppCategoryInfo(e.category_id);
    byCat[c.label] = (byCat[c.label] || 0) + Number(e.amount_thb || 0);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const donutColors = ['#F9BFCA', '#9AC2F8', '#CAC2F7', '#B0DEC1', '#FBD9AE', '#D8D8D8'];
  let angle = -90; const stops = [];
  catEntries.forEach(([, amt], i) => {
    const pct = totalThb ? amt / totalThb * 100 : 0;
    const end = angle + pct * 3.6;
    stops.push(`${donutColors[i % donutColors.length]} ${angle + 90}deg ${end + 90}deg`);
    angle = end;
  });
  const donutBg = stops.length ? `conic-gradient(${stops.join(',')})` : '#eee';

  const billsHtml = expenses.length ? expenses.map(e => {
    const cat = ppCategoryInfo(e.category_id);
    const stop = PP.stops.find(s => s.stop_id === e.stop_id);
    return `<div class="bill">
      <div class="bicon" style="background:${cat.color}33;color:${cat.color}">${cat.icon || '🧾'}</div>
      <div class="m"><b>${ppEscape(e.note || cat.label)}</b>
        <span class="place" style="background:${cat.color}22;color:${cat.color}">${ppEscape(cat.label)}</span>
        <div class="who">${ppEscape(stop ? (stop.city || stop.accommodation || '') : 'ทั่วไป')} · ${ppEscape(e.member_id || 'ไม่ระบุผู้จ่าย')} · ${ppEscape(ppFmtDate(e.expense_date))}</div>
      </div>
      <div class="amt"><b>${ppFmtMoney(e.amount_thb)}</b>${e.amount_foreign ? `<small>${ppEscape(e.amount_foreign)} ${ppEscape(e.currency || '')}</small>` : ''}</div>
    </div>`;
  }).join('') : '';

  return `<div class="pp-canvas">
    <div class="pp-section-head"><h2>บิลทั้งหมด</h2><div style="text-align:right"><div class="total-thb-big">${ppFmtMoney(totalThb)}</div>
      <button class="pp-btn" style="height:38px;padding:0 16px;margin-top:6px" data-open="addBill">＋ เพิ่มบิล</button></div></div>
    ${catEntries.length ? `
      <div class="donut-wrap"><div class="c" style="background:${donutBg}"></div><div class="hole">ใช้ไปทั้งหมด<br>${ppFmtMoney(totalThb)}</div></div>
      <ul class="legend">${catEntries.map(([name, amt], i) => `<li><span class="dot" style="background:${donutColors[i % donutColors.length]}"></span><span class="n">${ppEscape(name)}</span><span class="p">${totalThb ? Math.round(amt / totalThb * 100) : 0}%</span></li>`).join('')}</ul>` : ''}
    <div class="listcard"><h2>รายการล่าสุด</h2>${billsHtml || `<div class="empty-box"><b>ยังไม่มีบิล</b><small>บันทึกค่าใช้จ่ายได้จากหน้า TRIPS เดิม</small></div>`}</div>
  </div>`;
}

/* ---------- Wallet ---------- */
function ppWalletStats(wallet) {
  const funded = Number(wallet.funded_foreign ?? wallet.initial_balance_foreign ?? 0);
  const spentCalc = (PP.expenses || []).filter(e => e.wallet_id === wallet.wallet_id && e.type === 'EXPENSE')
    .reduce((s, e) => s + Number(e.amount_foreign ?? e.amount_thb ?? 0), 0);
  const spent = Number(wallet.spent_foreign ?? spentCalc);
  const remaining = Number(wallet.leftover_foreign ?? (funded - spent));
  const rate = Number(wallet.avg_rate || (Number(wallet.initial_balance_thb || 0) / (Number(wallet.initial_balance_foreign) || 1)) || 0);
  const thb = Number(wallet.leftover_thb ?? (remaining * rate));
  return { funded, spent, remaining, rate, thb };
}

function ppRenderWalletScreen() {
  const wallets = PP.wallets || [];
  const totalThb = wallets.reduce((s, w) => s + ppWalletStats(w).thb, 0);
  return `<div class="pp-canvas">
    <div class="pp-section-head"><h2>กระเป๋าเงินทริป</h2><div class="total-thb-big">${ppFmtMoney(totalThb)}</div></div>
    <div class="wallet-grid">${wallets.length ? wallets.map(w => {
      const st = ppWalletStats(w);
      return `<div class="walletcard">
        <div class="wch"><b>${ppEscape(w.name || 'Wallet')}</b><span class="tag">${ppEscape(w.currency || 'THB')}</span></div>
        <div class="wamt">${ppEscape(w.currency || 'THB')} ${ppFmtMoney(st.remaining)}</div>
        <small>≈ ${ppFmtMoney(st.thb)} · เรทเฉลี่ย ${st.rate ? st.rate.toFixed(4) : '—'}</small>
        <div class="stats"><div><span>เติม</span><b>${ppFmtMoney(st.funded)}</b></div><div><span>ใช้</span><b>${ppFmtMoney(st.spent)}</b></div><div><span>เหลือ</span><b>${ppFmtMoney(st.remaining)}</b></div></div>
        <button class="pp-btn" style="height:38px;margin-top:12px" data-open="fundWallet" data-wallet="${ppEscape(w.wallet_id)}">＋ เติมเงินเข้ากระเป๋านี้</button>
      </div>`;
    }).join('') : `<div class="empty-box"><b>ยังไม่มีกระเป๋าเงิน</b><small>สร้างได้จากหน้า TRIPS เดิม</small></div>`}</div>
  </div>`;
}

/* ---------- Settings (แสดงผลอย่างเดียว — แก้ไข/ปิดทริปยังใช้หน้า TRIPS เดิม) ---------- */
function ppRenderSettingsScreen() {
  const trip = PP.trip;
  const members = ppMembers(trip);
  const budget = Number(trip.total_budget || 0);
  const spent = (PP.expenses || []).filter(e => e.type === 'EXPENSE').reduce((s, e) => s + Number(e.amount_thb || 0), 0);
  return `<div class="pp-canvas">
    <div class="pp-section-head"><h2>ข้อมูลทริป</h2></div>
    <div class="setrow"><span class="ic">👥</span><div class="m"><b>สมาชิกทริป</b><small>${members.length ? ppEscape(members.join(', ')) : 'ยังไม่มีสมาชิก'}</small></div></div>
    <div class="setrow"><span class="ic">💰</span><div class="m"><b>งบประมาณ</b><small>${ppFmtMoney(budget)} · ใช้แล้ว ${ppFmtMoney(spent)}</small></div></div>
    <div class="setrow"><span class="ic">📄</span><div class="m"><b>เอกสาร</b><small>${(PP.documents || []).length} รายการ</small></div></div>
    <div class="setrow"><span class="ic">📌</span><div class="m"><b>สถานะทริป</b><small>${ppEscape(trip.status || '-')}</small></div></div>
    <p class="pp-note" style="margin:16px 26px 30px">การแก้ไขสมาชิก/งบประมาณ/ปิดทริป ยังทำผ่านหน้า TRIPS เดิมไปก่อน (ยังไม่ทำในหน้านี้)</p>
  </div>`;
}

function ppRenderDayPanel(date, index, rootStops, activeIdx) {
  const dayPlaces = rootStops.filter(s => s.stop_date === date);
  const dayCost = dayPlaces.reduce((s, p) => s + ppSpentForPlace(p), 0);
  const first = dayPlaces[0] || {};
  const placesHtml = dayPlaces.map(place => {
    const children = PP.stops.filter(s => s.parent_stop_id === place.stop_id)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const placeCost = ppSpentForPlace(place);
    const placeName = ppEscape(place.city || place.accommodation || 'สถานที่');
    const actsHtml = children.length ? children.map(child => {
      const cost = ppSpentForStop(child.stop_id);
      return `<article class="act" data-stop-id="${ppEscape(child.stop_id)}" data-parent-id="${ppEscape(place.stop_id)}">
        <div class="act-row">
          <div class="m"><b>${ppEscape(child.accommodation || child.city || 'กิจกรรม')}</b>
            <small>${ppEscape(child.notes || '')}</small></div>
          <div class="tm">
            <div>⏰ ${ppEscape(child.time || '—')}</div>
            ${cost ? `<span class="cost">${ppFmtMoney(cost)}</span>` : ''}
          </div>
          <span class="edit-x">✎</span>
        </div>
      </article>`;
    }).join('') : `<div class="pp-note" style="margin:10px 0 4px">ยังไม่มีกิจกรรมย่อยใน ${placeName}</div>`;
    return `<section class="place-sec" style="--pin:${place.marker_color || '#EC5F86'}" data-stop-id="${ppEscape(place.stop_id)}">
      <div class="place-head">
        <span class="pinico">📍</span>
        <div><h2>${placeName}</h2><p>${ppEscape(place.notes || (place.accommodation && place.city ? place.accommodation : ''))}</p></div>
        ${placeCost ? `<span class="ptime">${ppFmtMoney(placeCost)}</span>` : ''}
        <span class="edit-x">✎</span>
      </div>
      <div class="timeline">${actsHtml}</div>
      <button class="addact" data-add-activity="${ppEscape(place.stop_id)}">＋ เพิ่มกิจกรรมใน ${placeName}</button>
    </section>`;
  }).join('');

  return `<div class="day-panel" data-panel="${index}" ${index !== activeIdx ? 'hidden' : ''}>
    <div class="dayhead">
      <div class="daynum"><span>วัน</span><b>${index + 1}</b></div>
      <div><h2>${ppEscape(first.city || first.accommodation || `วันที่ ${index + 1}`)}</h2>
        <p>📅 ${ppEscape(ppFmtDate(date))}</p>
        ${dayCost ? `<span class="daytotal">💸 ใช้ไปวันนี้ ${ppFmtMoney(dayCost)}</span>` : ''}
      </div>
    </div>
    ${placesHtml}
    <button class="addplace-btn" data-add-place="${ppEscape(date)}">＋ เพิ่มสถานที่ในวันนี้</button>
  </div>`;
}

function ppActiveDayIndex(dates) {
  if (!dates.length) return 0;
  return Math.min(PP.activeDayIndex || 0, dates.length - 1);
}

function ppBindDayPills() {
  document.querySelectorAll('#ppDays .day-pill[data-day]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#ppDays .day-pill[data-day]').forEach(p => p.classList.toggle('on', p === pill));
      const n = pill.dataset.day;
      PP.activeDayIndex = Number(n);
      document.querySelectorAll('#ppPanels .day-panel').forEach(p => { p.hidden = p.dataset.panel !== n; });
      requestAnimationFrame(ppFitScale);
    });
  });
}

/* ---------- หมุดบนแผนที่ (เฉพาะทริปฮอกไกโดที่ calibrate ไว้) ---------- */
const ppPinSvg = (c, d) => `<svg width="50" height="72" viewBox="0 0 66 96">
  <g fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
    <path d="M33 4C17.9 4 5.6 16.3 5.6 31.4 5.6 47.2 33 74 33 74s27.4-26.8 27.4-42.6C60.4 16.3 48.1 4 33 4z"/>
    <path d="M33 72v13"/><ellipse cx="33" cy="87.5" rx="13" ry="5.4"/></g>
  <ellipse cx="33" cy="87.5" rx="13" ry="5.4" fill="${d}"/>
  <path d="M33 70v16" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
  <path d="M33 4C17.9 4 5.6 16.3 5.6 31.4 5.6 47.2 33 74 33 74s27.4-26.8 27.4-42.6C60.4 16.3 48.1 4 33 4z" fill="${c}"/>
  <circle cx="33" cy="30.4" r="11" fill="#fff"/></svg>`;

let PP_PLACED = []; // [{stop_id, pin, x, y, dateFrom, dateTo}]

function ppRenderPins(rootStops, isHokkaido) {
  const host = document.getElementById('ppPins');
  const routeHost = document.getElementById('ppRoute');
  if (!host) return;
  if (!isHokkaido) { host.innerHTML = ''; if (routeHost) routeHost.innerHTML = ''; PP_PLACED = []; return; }

  const byPin = new Map(); // pin.name -> aggregated entry
  rootStops.forEach(place => {
    const pin = ppMatchPin(place);
    if (!pin) return;
    const saved = PP.routeData[place.stop_id];
    const x = saved?.x ?? pin.x, y = saved?.y ?? pin.y;
    if (!byPin.has(pin.name)) {
      byPin.set(pin.name, { stop_id: place.stop_id, pin, x, y, dates: [] });
    }
    byPin.get(pin.name).dates.push(place.stop_date);
  });

  PP_PLACED = [...byPin.values()].sort((a, b) => (a.dates[0] || '').localeCompare(b.dates[0] || ''));

  host.innerHTML = PP_PLACED.map(p => {
    const dates = p.dates.filter(Boolean).sort();
    const label = dates.length ? `${ppFmtDate(dates[0])}${dates.length > 1 ? '–' + ppFmtDate(dates[dates.length - 1]) : ''}` : '';
    return `<div class="pin" data-stop="${ppEscape(p.stop_id)}" style="left:${p.x}px;top:${p.y}px">
      ${ppPinSvg(p.pin.color, p.pin.dark)}<b>${ppEscape(p.pin.name)}</b><small>${ppEscape(label)}</small></div>`;
  }).join('');

  if (routeHost) {
    if (PP_PLACED.length >= 2) {
      let d = `M${PP_PLACED[0].x + 26} ${PP_PLACED[0].y + 88}`;
      for (let i = 0; i < PP_PLACED.length - 1; i++) {
        const a = PP_PLACED[i], b = PP_PLACED[i + 1];
        const x1 = a.x + 26, y1 = a.y + 88, x2 = b.x - 26, y2 = b.y + 88;
        const dx = (x2 - x1) * .45, sag = 26;
        d += ` C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
      }
      routeHost.innerHTML = `<path d="${d}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-dasharray="11 7"/>
        <path d="${d}" fill="none" stroke="#2F6BFF" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="11 7"/>`;
    } else {
      routeHost.innerHTML = '';
    }
  }
  ppBindPinDrag();
}

function ppBindPinEdit() {
  const btn = document.getElementById('ppPinEdit');
  const hero = document.getElementById('ppHero');
  if (!btn || !hero) return;
  btn.addEventListener('click', () => {
    PP.editing = !PP.editing;
    hero.classList.toggle('editing', PP.editing);
    btn.classList.toggle('on', PP.editing);
    if (!PP.editing) ppSaveRouteData();
  });
}

function ppBindPinDrag() {
  const hero = document.getElementById('ppHero');
  if (!hero) return;
  hero.querySelectorAll('.pin').forEach(node => {
    node.addEventListener('pointerdown', e => {
      if (!PP.editing) return;
      e.preventDefault();
      const stopId = node.dataset.stop;
      const hr = hero.getBoundingClientRect();
      const scale = hr.width / 869;
      node.classList.add('grabbing');
      const move = ev => {
        const x = Math.max(20, Math.min(849, (ev.clientX - hr.left) / scale - 25));
        const y = Math.max(10, Math.min(430, (ev.clientY - hr.top) / scale - 30));
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        node.dataset.x = x; node.dataset.y = y;
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        node.classList.remove('grabbing');
        if (node.dataset.x) {
          PP.routeData[stopId] = { x: Number(node.dataset.x), y: Number(node.dataset.y) };
        }
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  });
}

async function ppSaveRouteData() {
  try {
    await fetch(`${getTravelApiBase()}/api/trips/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
      body: JSON.stringify({ project_id: PP.tripId, route_data: PP.routeData })
    });
    if (typeof showToast === 'function') showToast('บันทึกตำแหน่งหมุดแล้ว', 'success');
  } catch (e) {
    if (typeof showToast === 'function') showToast('บันทึกตำแหน่งหมุดไม่สำเร็จ: ' + e.message, 'error');
  }
}

/* ---------- แตะเพื่อซูมแผนที่ ---------- */
function ppBindZoom() {
  const hero = document.getElementById('ppHero');
  if (!hero) return;
  hero.addEventListener('click', e => {
    if (PP.editing) return;
    if (e.target.closest('.pin') || e.target.closest('#ppPinEdit')) return;
    const r = hero.getBoundingClientRect();
    const ox = ((e.clientX - r.left) / r.width) * 100;
    const oy = ((e.clientY - r.top) / r.height) * 100;
    hero.style.setProperty('--ox', ox + '%');
    hero.style.setProperty('--oy', oy + '%');
    hero.classList.toggle('zoomed');
    const hint = document.getElementById('ppZoomHint');
    if (hint) hint.style.opacity = hero.classList.contains('zoomed') ? 0 : 1;
  });
}

function ppBindTripSelect() {
  const sel = document.getElementById('ppTripSelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    PP.tripId = sel.value;
    ppLoadSelectedTrip();
  });
}

/* ---------- ปรับขนาดผืนผ้าใบ 869px ให้พอดีจอ (คงสัดส่วน mockup ทุกจุด) ---------- */
function ppFitScale() {
  document.querySelectorAll('#ppRoot .pp-scaleOuter').forEach(outer => {
    const screen = outer.closest('.pp-screen');
    if (screen && screen.hidden) return;
    const canvas = outer.querySelector('.pp-canvas');
    if (!canvas) return;
    const avail = outer.clientWidth;
    if (!avail) return;
    const scale = Math.min(1, (avail - 4) / 869);
    canvas.style.transform = `scale(${scale})`;
    canvas.style.marginBottom = (-(1 - scale) * canvas.offsetHeight) + 'px';
  });
}
window.addEventListener('resize', () => { clearTimeout(window._ppFitT); window._ppFitT = setTimeout(ppFitScale, 120); });

/* ===========================================================
   เฟส 4 — เพิ่มบิล / เติมเงินกระเป๋า (เขียนจริงเข้าระบบบัญชีของทริป)
   =========================================================== */

/* ---------- เพิ่มบิล — POST /api/trip-expenses (เขียนแค่ตาราง TripExpenses อย่างเดียว ไม่กระทบบัญชีอื่น) ---------- */
function ppOpenBillForm() {
  const cats = (typeof AppState !== 'undefined' && AppState.categories && AppState.categories.length)
    ? AppState.categories : [];
  const stopsFlat = PP.stops.map(s => ({ id: s.stop_id, label: s.city || s.accommodation || 'จุดแวะ' }));
  const wallets = PP.wallets || [];
  const today = new Date().toISOString().slice(0, 10);

  ppCloseStopForm();
  const mask = document.createElement('div'); mask.className = 'pp-mask'; mask.id = 'ppMask';
  const sheet = document.createElement('div'); sheet.className = 'pp-sheet'; sheet.id = 'ppSheet';
  sheet.innerHTML = `
    <h3>เพิ่มบิล</h3>
    <form id="ppBillForm">
      <label class="pp-field"><span>วันที่</span><input type="date" id="ppbDate" value="${today}" required></label>
      <label class="pp-field"><span>จำนวนเงิน (บาท)</span><input type="number" step="0.01" min="0" id="ppbAmountThb" placeholder="0.00" required></label>
      <label class="pp-field"><span>จำนวนเงินสกุลต่างประเทศ <small>(ถ้ามี)</small></span><input type="number" step="0.01" id="ppbAmountForeign" placeholder="ไม่บังคับ"></label>
      ${cats.length ? `<label class="pp-field"><span>หมวดหมู่</span><select id="ppbCategory">${cats.map(c => `<option value="${ppEscape(c.category_id)}">${ppEscape(c.name)}</option>`).join('')}</select></label>` : ''}
      ${wallets.length ? `<label class="pp-field"><span>จ่ายจากกระเป๋า</span><select id="ppbWallet"><option value="">ไม่ระบุ</option>${wallets.map(w => `<option value="${ppEscape(w.wallet_id)}">${ppEscape(w.name)} (${ppEscape(w.currency)})</option>`).join('')}</select></label>` : ''}
      ${stopsFlat.length ? `<label class="pp-field"><span>ผูกกับจุดแวะ/กิจกรรม</span><select id="ppbStop"><option value="">ไม่ระบุ</option>${stopsFlat.map(s => `<option value="${ppEscape(s.id)}">${ppEscape(s.label)}</option>`).join('')}</select></label>` : ''}
      <label class="pp-field"><span>ใครจ่าย</span><input type="text" id="ppbMember" placeholder="เช่น พ่อ"></label>
      <label class="pp-field"><span>โน้ต</span><input type="text" id="ppbNote" placeholder="เช่น มื้อเย็นราเมง"></label>
      <div class="pp-sheet-actions">
        <button type="button" class="pp-btn secondary" id="ppfCancel">ยกเลิก</button>
        <button type="submit" class="pp-btn" id="ppfSave">บันทึกบิล</button>
      </div>
    </form>`;
  document.body.append(mask, sheet);
  mask.addEventListener('click', ppCloseStopForm);
  sheet.querySelector('#ppfCancel').addEventListener('click', ppCloseStopForm);

  sheet.querySelector('#ppBillForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amountThb = Number(sheet.querySelector('#ppbAmountThb').value);
    if (!amountThb || amountThb <= 0) { alert('กรุณาระบุจำนวนเงินให้ถูกต้อง'); return; }
    const foreignVal = sheet.querySelector('#ppbAmountForeign')?.value;
    const payload = {
      project_id: PP.tripId,
      expense_date: sheet.querySelector('#ppbDate').value || today,
      amount_thb: amountThb,
      amount_foreign: foreignVal ? Number(foreignVal) : null,
      category_id: sheet.querySelector('#ppbCategory')?.value || null,
      wallet_id: sheet.querySelector('#ppbWallet')?.value || null,
      stop_id: sheet.querySelector('#ppbStop')?.value || null,
      member_id: sheet.querySelector('#ppbMember').value.trim() || null,
      note: sheet.querySelector('#ppbNote').value.trim() || null,
      type: 'EXPENSE'
    };
    const saveBtn = sheet.querySelector('#ppfSave');
    saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก…';
    try {
      const res = await fetch(`${getTravelApiBase()}/api/trip-expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      ppCloseStopForm();
      PP.activeTab = 'bills';
      await ppLoadSelectedTrip();
    } catch (err) {
      alert('บันทึกบิลไม่สำเร็จ: ' + err.message);
      saveBtn.disabled = false; saveBtn.textContent = 'บันทึกบิล';
    }
  });
}

/* ---------- เติมเงินกระเป๋า — POST /api/trips/fund
   ระวัง: endpoint นี้เขียนบัญชีจริงของครอบครัว (Transactions/TransactionDetails คู่กัน + TripWalletFundings)
   ไม่ใช่แค่ตัวเลขในทริป จึงต้องเลือก "บัญชีต้นทาง" จากบัญชีจริงของครอบครัวเสมอ ---------- */
function ppOpenFundForm(presetWalletId) {
  const wallets = PP.wallets || [];
  if (!wallets.length) { alert('ทริปนี้ยังไม่มีกระเป๋าเงิน ต้องสร้างกระเป๋าจากหน้า TRIPS เดิมก่อน'); return; }
  const accounts = (typeof AppState !== 'undefined' && AppState.accounts ? AppState.accounts : [])
    .filter(a => (a.account_type || 'BANK') !== 'TRIP_HOLDING');
  if (!accounts.length) { alert('ไม่พบบัญชีต้นทางที่ใช้เติมเงินได้'); return; }
  const today = new Date().toISOString().slice(0, 10);

  ppCloseStopForm();
  const mask = document.createElement('div'); mask.className = 'pp-mask'; mask.id = 'ppMask';
  const sheet = document.createElement('div'); sheet.className = 'pp-sheet'; sheet.id = 'ppSheet';
  sheet.innerHTML = `
    <h3>เติมเงินเข้ากระเป๋าทริป</h3>
    <form id="ppFundForm">
      <label class="pp-field"><span>กระเป๋าปลายทาง</span><select id="ppfWallet">${wallets.map(w => `<option value="${ppEscape(w.wallet_id)}" data-currency="${ppEscape(w.currency)}" ${w.wallet_id === presetWalletId ? 'selected' : ''}>${ppEscape(w.name)} (${ppEscape(w.currency)})</option>`).join('')}</select></label>
      <label class="pp-field"><span>บัญชีต้นทาง (บัญชีจริงของครอบครัว)</span><select id="ppfSourceAcc">${accounts.map(a => `<option value="${ppEscape(a.account_id)}">${ppEscape(a.name)}</option>`).join('')}</select></label>
      <label class="pp-field"><span>วันที่</span><input type="date" id="ppfFundDate" value="${today}"></label>
      <label class="pp-field"><span>จำนวนเงิน (บาท) ที่โอนออกจากบัญชี</span><input type="number" step="0.01" min="0.01" id="ppfThb" placeholder="0.00" required></label>
      <label class="pp-field" id="ppfForeignWrap"><span>จำนวนเงินสกุลกระเป๋าที่ได้รับจริง</span><input type="number" step="0.01" min="0.01" id="ppfForeign" placeholder="0.00"></label>
      <label class="pp-field"><span>โน้ต</span><input type="text" id="ppfFundNote" placeholder="ไม่บังคับ"></label>
      <div class="pp-sheet-actions">
        <button type="button" class="pp-btn secondary" id="ppfCancel">ยกเลิก</button>
        <button type="submit" class="pp-btn" id="ppfSave">บันทึกการเติมเงิน</button>
      </div>
    </form>`;
  document.body.append(mask, sheet);
  mask.addEventListener('click', ppCloseStopForm);
  sheet.querySelector('#ppfCancel').addEventListener('click', ppCloseStopForm);

  const walletSel = sheet.querySelector('#ppfWallet');
  const foreignWrap = sheet.querySelector('#ppfForeignWrap');
  const syncForeignVisibility = () => {
    const cur = walletSel.selectedOptions[0]?.dataset.currency || 'THB';
    foreignWrap.style.display = cur.toUpperCase() === 'THB' ? 'none' : '';
  };
  walletSel.addEventListener('change', syncForeignVisibility);
  syncForeignVisibility();

  sheet.querySelector('#ppFundForm').addEventListener('submit', async e => {
    e.preventDefault();
    const walletId = walletSel.value;
    const currency = walletSel.selectedOptions[0]?.dataset.currency || 'THB';
    const thb = Number(sheet.querySelector('#ppfThb').value);
    if (!thb || thb <= 0) { alert('กรุณาระบุจำนวนเงินให้ถูกต้อง'); return; }
    const foreignInput = sheet.querySelector('#ppfForeign').value;
    if (currency.toUpperCase() !== 'THB' && (!foreignInput || Number(foreignInput) <= 0)) {
      alert('กระเป๋าเงินต่างประเทศ ต้องระบุจำนวนเงินสกุลนั้นที่ได้รับจริงด้วย');
      return;
    }
    const payload = {
      project_id: PP.tripId,
      wallet_id: walletId,
      source_account_id: sheet.querySelector('#ppfSourceAcc').value,
      thb_amount: thb,
      foreign_amount: currency.toUpperCase() === 'THB' ? thb : Number(foreignInput),
      currency,
      funding_date: sheet.querySelector('#ppfFundDate').value || today,
      note: sheet.querySelector('#ppfFundNote').value.trim() || null
    };
    const saveBtn = sheet.querySelector('#ppfSave');
    saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก…';
    try {
      const res = await fetch(`${getTravelApiBase()}/api/trips/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
      ppCloseStopForm();
      PP.activeTab = 'wallet';
      await ppLoadSelectedTrip();
      if (typeof showToast === 'function') showToast('เติมเงินเข้ากระเป๋าเรียบร้อย', 'success');
    } catch (err) {
      alert('เติมเงินไม่สำเร็จ: ' + err.message);
      saveBtn.disabled = false; saveBtn.textContent = 'บันทึกการเติมเงิน';
    }
  });
}
