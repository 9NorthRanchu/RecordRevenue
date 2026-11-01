/* PupPup Trip — visual prototype only. ไม่มีการเรียก API โดยเจตนา */

const NAV = [
  { id: 's-plan',     icon: 'n-pin',    label: 'ทริป' },
  { id: 's-wallet',   icon: 'n-wallet', label: 'วอลเล็ต' },
  { id: 's-bills',    icon: 'n-bill',   label: 'บิล' },
  { id: 's-settings', icon: 'n-plan',   label: 'แผน' }
];

function buildNav() {
  document.querySelectorAll('[data-nav]').forEach(nav => {
    const own = nav.closest('.screen').id;
    nav.innerHTML = NAV.map(n =>
      `<button data-go="${n.id}" class="${n.id === own ? 'active' : ''}">
         <svg width="46" height="46"><use href="#${n.icon}"/></svg><span>${n.label}</span>
       </button>`).join('');
  });
  document.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', () => go(b.dataset.go)));
}

function go(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* โดนัทสรุปหมวดหมู่ — สัดส่วนตาม mockup */
function buildDonut() {
  /* สีโดนัทเป็น pastel ตาม mockup (จุด legend ยังใช้สีเข้ม) */
  const seg = [['#F9BFCA', 35], ['#9AC2F8', 30], ['#CAC2F7', 20], ['#B0DEC1', 10], ['#FBD9AE', 5]];
  let a = -90, parts = [];
  seg.forEach(([c, p]) => { const e = a + p * 3.6; parts.push(`${c} ${a + 90}deg ${e + 90}deg`); a = e; });
  const d = document.getElementById('donut');
  if (d) d.style.background = `conic-gradient(${parts.join(',')})`;
}

/* ===========================================================
   รูปแบบตัวเลขมาตรฐานของ PupPup Trip
   - คั่นหลักพันด้วย ,
   - ทศนิยม 2 ตำแหน่งเสมอ
   - ค่าติดลบใส่วงเล็บ ไม่ใช้เครื่องหมายลบ   เช่น (¥ 1,650.00)
   ใช้ตัวนี้ตอนต่อ API เพื่อให้ทุกหน้าฟอร์แมตเหมือนกัน
   =========================================================== */
const SYMBOL = { THB: '฿', JPY: '¥', USD: '$', EUR: '€', KRW: '₩' };

function fmtMoney(value, currency = 'THB', opts = {}) {
  const n = Number(value) || 0;
  const dp = opts.decimals ?? 2;
  const sym = SYMBOL[currency] || currency;
  const body = `${sym} ${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dp, maximumFractionDigits: dp
  })}`;
  return n < 0 ? `(${body})` : body;
}

/* อัตราแลกเปลี่ยนใช้ 4 ตำแหน่ง เพราะ 2 ตำแหน่งจะปัดจนคำนวณเพี้ยน */
const fmtRate = (v, cur = 'THB') => fmtMoney(v, cur, { decimals: 4 });


/* ---------- สลับวันในหน้าแผนเที่ยว ---------- */
function buildDaySwitcher() {
  const pills = document.querySelectorAll('.day-pill');
  if (!pills.length) return;
  const head = document.querySelector('#s-plan .dayhead');
  const wx = document.querySelectorAll('#s-plan .weather .tx');

  function show(pill) {
    pills.forEach(p => p.classList.toggle('on', p === pill));
    const d = pill.dataset;
    head.querySelector('.daynum b').textContent = d.day;
    head.querySelector('h2').textContent = d.city;
    head.querySelector('p').textContent = d.date;
    head.querySelector('img.city').src = 'art/' + d.art;
    const t = d.temp.split(','), r = d.rain.split(',');
    wx.forEach((el, i) => {
      el.querySelector('strong').textContent = t[i] + '°';
      el.querySelector('small').lastChild.textContent = r[i] + '%';
    });
    const panel = document.querySelector(`.day-panel[data-panel="${d.day}"]`)
               || document.querySelector('.day-panel[data-panel="empty"]');
    document.querySelectorAll('.day-panel').forEach(p => p.hidden = p !== panel);
    pill.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  pills.forEach(p => p.addEventListener('click', () => show(p)));
}

/* ซูมพรีวิว: mockup ถูกออกแบบที่ 869px จึงย่อให้พอดีจอ */
function setZoom(z) {
  const p = document.getElementById('phone');
  p.style.transform = `scale(${z})`;
  p.style.marginBottom = `${-(1 - z) * p.offsetHeight}px`;
  document.querySelectorAll('.toolbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.z === String(z)));
}

buildNav();
buildDonut();
buildDaySwitcher();
document.querySelectorAll('.toolbar button').forEach(b =>
  b.addEventListener('click', () => setZoom(parseFloat(b.dataset.z))));
window.addEventListener('load', () => setZoom(0.62));
setZoom(0.62);

/* ===========================================================
   ย้ายสถานที่ / กิจกรรม
   - ลากจากปุ่ม ⋮  → เรียงใหม่ในวันเดียวกัน หรือข้ามย่าน
   - ลากไปวางบน "เม็ดวัน" ด้านบน → ย้ายไปวันอื่น
   - แตะ ⋮ เฉยๆ → เปิดเมนู (ย้ายไปวัน / ย้ายไปย่าน / แก้ไข / ลบ)
   ตอนต่อ API: ทุกการย้าย = PATCH TripStops {stop_date, parent_stop_id, sort_order}
   =========================================================== */
const Sheet = {
  el: null, mask: null,
  open(title, sub, body) {
    this.el = this.el || document.getElementById('sheet');
    this.mask = this.mask || document.getElementById('sheetMask');
    document.getElementById('sheetTitle').textContent = title;
    document.getElementById('sheetSub').textContent = sub;
    document.getElementById('sheetBody').innerHTML = body;
    this.el.hidden = this.mask.hidden = false;
  },
  close() { if (this.el) this.el.hidden = this.mask.hidden = true; }
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

const dayPills = () => [...document.querySelectorAll('.day-pill')];
const curPill = () => document.querySelector('.day-pill.on');

/* หา (หรือสร้าง) แผงของวันนั้น พร้อมกลุ่มสถานที่เริ่มต้น */
function panelForDay(n) {
  let panel = document.querySelector(`.day-panel[data-panel="${n}"]`);
  if (panel) return panel;
  const pill = dayPills().find(p => p.dataset.day === String(n));
  const color = pill.style.getPropertyValue('--c').trim() || '#EC5F86';
  panel = document.createElement('div');
  panel.className = 'day-panel';
  panel.dataset.panel = n;
  panel.hidden = true;
  panel.innerHTML = `
      <section class="place-sec" style="--pin:${color}">
        <div class="place-head">
          <span class="pinico"><svg width="36" height="36"><use href="#i-pin-solid"/></svg></span>
          <div><h2>${pill.dataset.city}</h2><p>ย่านที่ย้ายมาใหม่ — แตะเพื่อตั้งชื่อ</p></div>
          <svg class="gdots" width="30" height="30"><use href="#i-dots"/></svg>
          <svg class="caret" width="34" height="34"><use href="#i-up"/></svg>
        </div>
        <div class="timeline"></div>
        <button class="addact"><svg width="30" height="30" class="ic-pin"><use href="#i-plusc"/></svg>เพิ่มสถานที่ใน ${pill.dataset.city}</button>
      </section>`;
  document.querySelector('.day-panel[data-panel="empty"]').before(panel);
  bindHandles(panel);
  return panel;
}

function moveToDay(node, dayNo, label) {
  const panel = panelForDay(dayNo);
  if (node.classList.contains('act')) panel.querySelector('.timeline').append(node);
  else panel.append(node);
  const pill = dayPills().find(p => p.dataset.day === String(dayNo));
  toast(`ย้าย “${label}” ไป วัน ${dayNo} · ${pill.dataset.city} แล้ว`);
}

function labelOf(node) {
  return node.classList.contains('act')
    ? node.querySelector('.m b').childNodes[0].textContent.trim()
    : node.querySelector('.place-head h2').textContent.trim();
}

/* ---------- เมนู (แตะ ⋮) ---------- */
function openMenu(node) {
  const isAct = node.classList.contains('act');
  const group = node.closest('.place-sec');
  const day = curPill();
  const label = labelOf(node);
  const sub = isAct
    ? `${group.querySelector('.place-head h2').textContent} · วัน ${day.dataset.day}`
    : `วัน ${day.dataset.day} · ${day.dataset.city}`;
  const groups = [...document.querySelector('.day-panel:not([hidden])').querySelectorAll('.place-sec')];

  Sheet.open(label, sub, `
    <button class="sheet-item" data-act="up"><svg width="30" height="30" style="transform:rotate(-90deg)"><use href="#i-chev"/></svg>เลื่อนขึ้น</button>
    <button class="sheet-item" data-act="down"><svg width="30" height="30" style="transform:rotate(90deg)"><use href="#i-chev"/></svg>เลื่อนลง</button>
    <button class="sheet-item" data-act="day"><svg width="30" height="30"><use href="#i-cal"/></svg>ย้ายไปวันอื่น<small>วัน ${day.dataset.day} ตอนนี้</small></button>
    ${isAct && groups.length > 1 ? `<button class="sheet-item" data-act="group"><svg width="30" height="30"><use href="#i-move"/></svg>ย้ายไปย่านอื่นในวันนี้</button>` : ''}
    <button class="sheet-item" data-act="edit"><svg width="30" height="30"><use href="#i-edit"/></svg>แก้ไขรายละเอียด</button>
    <button class="sheet-item danger" data-act="del"><svg width="30" height="30"><use href="#i-trash"/></svg>ลบออกจากแผน</button>`);

  document.getElementById('sheetBody').onclick = e => {
    const b = e.target.closest('.sheet-item'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'up' && node.previousElementSibling) { node.previousElementSibling.before(node); Sheet.close(); toast(`เลื่อน “${label}” ขึ้นแล้ว`); }
    else if (a === 'down' && node.nextElementSibling) { node.nextElementSibling.after(node); Sheet.close(); toast(`เลื่อน “${label}” ลงแล้ว`); }
    else if (a === 'del') { node.remove(); Sheet.close(); toast(`ลบ “${label}” ออกจากแผนแล้ว`); }
    else if (a === 'edit') { Sheet.close(); toast('หน้าแก้ไขรายละเอียด — ยังไม่ทำใน prototype'); }
    else if (a === 'group') {
      Sheet.open(label, 'เลือกย่านปลายทาง', groups.map((g, i) =>
        `<button class="sheet-item" data-g="${i}">
           <svg width="30" height="30" style="color:${g.style.getPropertyValue('--pin')}"><use href="#i-pin-solid"/></svg>
           ${g.querySelector('.place-head h2').textContent}${g === group ? '<small>อยู่ที่นี่</small>' : ''}</button>`).join(''));
      document.getElementById('sheetBody').onclick = ev => {
        const gb = ev.target.closest('[data-g]'); if (!gb) return;
        groups[+gb.dataset.g].querySelector('.timeline').append(node);
        Sheet.close(); toast(`ย้าย “${label}” ไปย่าน ${groups[+gb.dataset.g].querySelector('.place-head h2').textContent} แล้ว`);
      };
    }
    else if (a === 'day') {
      Sheet.open(label, 'เลือกวันปลายทาง', `<div class="sheet-days">${dayPills().map(p =>
        `<button class="sheet-day${p === day ? ' cur' : ''}" style="--c:${p.style.getPropertyValue('--c')}" data-d="${p.dataset.day}">
           <span>วัน ${p.dataset.day}</span><b>${p.querySelector('b').textContent}</b><i>${p.dataset.city}</i></button>`).join('')}</div>`);
      document.getElementById('sheetBody').onclick = ev => {
        const db = ev.target.closest('[data-d]'); if (!db) return;
        moveToDay(node, +db.dataset.d, label); Sheet.close();
      };
    }
  };
}

/* ---------- ลากวาง ---------- */
function startDrag(node, e) {
  const rect = node.getBoundingClientRect();
  const ghost = node.cloneNode(true);
  ghost.className = 'drag-ghost ' + (node.classList.contains('act') ? 'act' : 'place-sec');
  Object.assign(ghost.style, { width: rect.width + 'px', left: rect.left + 'px', top: rect.top + 'px' });
  document.body.append(ghost);
  node.classList.add('dragging');
  const line = document.createElement('div');
  line.className = 'drop-line';
  const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
  const isAct = node.classList.contains('act');
  const strip = document.querySelector('.days');
  let dropPill = null;

  function move(ev) {
    ghost.style.left = (ev.clientX - ox) + 'px';
    ghost.style.top = (ev.clientY - oy) + 'px';

    // วางบนเม็ดวัน = ย้ายไปวันนั้น
    const sr = strip.getBoundingClientRect();
    dropPill = null;
    dayPills().forEach(p => {
      const r = p.getBoundingClientRect();
      const hit = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      p.classList.toggle('drop-target', hit && !p.classList.contains('on'));
      if (hit && !p.classList.contains('on')) dropPill = p;
    });
    strip.classList.toggle('dragging-over', ev.clientY < sr.bottom);
    if (dropPill) { line.remove(); return; }

    // วางในลิสต์ = เรียงใหม่
    const panel = document.querySelector('.day-panel:not([hidden])');
    if (!panel) return;
    const sel = isAct ? '.act:not(.dragging)' : '.place-sec:not(.dragging)';
    const containers = isAct ? [...panel.querySelectorAll('.timeline')] : [panel];
    let host = containers[0], best = Infinity, ref = null;
    containers.forEach(c => {
      const cr = c.getBoundingClientRect();
      const d = ev.clientY < cr.top ? cr.top - ev.clientY : ev.clientY > cr.bottom ? ev.clientY - cr.bottom : 0;
      if (d < best) { best = d; host = c; }
    });
    if (isAct) line.classList.add('pin-col'), line.style.setProperty('--pin', host.closest('.place-sec').style.getPropertyValue('--pin'));
    [...host.querySelectorAll(sel)].forEach(el => {
      const r = el.getBoundingClientRect();
      if (ev.clientY > r.top + r.height / 2) ref = el;
    });
    ref ? ref.after(line) : host.prepend(line);
  }

  function up(ev) {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove(); node.classList.remove('dragging');
    strip.classList.remove('dragging-over');
    dayPills().forEach(p => p.classList.remove('drop-target'));
    if (dropPill) { line.remove(); moveToDay(node, +dropPill.dataset.day, labelOf(node)); return; }
    if (line.parentNode) { line.replaceWith(node); toast(`ย้าย “${labelOf(node)}” เรียบร้อย`); }
    line.remove();
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  move(e);
}

function bindHandles(root = document) {
  root.querySelectorAll('.act-row .dots, .place-head .gdots').forEach(h => {
    if (h.dataset.bound) return; h.dataset.bound = '1';
    h.addEventListener('pointerdown', e => {
      e.preventDefault();
      const node = h.closest('.act') || h.closest('.place-sec');
      const x0 = e.clientX, y0 = e.clientY; let started = false;
      const probe = ev => {
        if (started) return;
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) {
          started = true;
          document.removeEventListener('pointermove', probe);
          document.removeEventListener('pointerup', tap);
          startDrag(node, ev);
        }
      };
      const tap = () => {
        document.removeEventListener('pointermove', probe);
        document.removeEventListener('pointerup', tap);
        if (!started) openMenu(node);
      };
      document.addEventListener('pointermove', probe);
      document.addEventListener('pointerup', tap);
    });
  });
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-close]') || e.target.id === 'sheetMask') Sheet.close();
});
bindHandles();


/* ===========================================================
   เพิ่มสถานที่ — ใช้ฟอร์มเดียวกันทั้งปุ่ม FAB และปุ่มในแต่ละย่าน
   "ย่าน" เป็นแค่ช่องจัดกลุ่มในฟอร์ม ไม่ใช่สิ่งที่ต้องสร้างแยกก่อน
   ตอนต่อ API: POST /api/trip-stops {stop_date, parent_stop_id, name_en, name_th, time, end_time, icon_asset}
   =========================================================== */
const ART = ['act_sensoji.png', 'act_nakamise.png', 'act_sumida.png', 'st_tokyo_city.png'];

function openAddSheet(presetGroup) {
  const day = curPill();
  const panel = document.querySelector('.day-panel:not([hidden])');
  const groups = panel ? [...panel.querySelectorAll('.place-sec')] : [];
  const sel = presetGroup ? groups.indexOf(presetGroup) : (groups.length ? 0 : -1);

  Sheet.open('เพิ่มสถานที่', `วัน ${day.dataset.day} · ${day.querySelector('b').textContent} · ${day.dataset.city}`, `
    <div class="form">
      <label>ชื่อสถานที่<input id="fName" placeholder="เช่น Tokyo Skytree" autocomplete="off"></label>
      <label>ชื่อภาษาไทย <small>(ไม่ใส่ก็ได้)</small><input id="fTh" placeholder="เช่น โตเกียวสกายทรี" autocomplete="off"></label>
      <label>รายละเอียดสั้นๆ<input id="fDesc" placeholder="เช่น ขึ้นชมวิวเมืองจากจุดสูงสุด" autocomplete="off"></label>
      <div class="frow">
        <label>เวลาเริ่ม<input id="fTime" value="10:00" inputmode="numeric"></label>
        <label>ใช้เวลา<input id="fDur" value="1 ชม." autocomplete="off"></label>
      </div>
      <div class="fgroup">
        <span class="flabel">จัดกลุ่มไว้ที่ย่าน</span>
        <div class="gchips" id="fGroups">
          ${groups.map((g, i) => `<button class="gchip${i === sel ? ' on' : ''}" data-i="${i}"
            style="--c:${g.style.getPropertyValue('--pin')}">${g.querySelector('.place-head h2').textContent}</button>`).join('')}
          <button class="gchip new${sel < 0 ? ' on' : ''}" data-i="new">+ ย่านใหม่</button>
        </div>
        <label id="fNewWrap" ${sel < 0 ? '' : 'hidden'}>ชื่อย่านใหม่<input id="fNew" placeholder="เช่น Ginza"></label>
      </div>
      <button class="fsave" id="fSave">บันทึกลงแผน</button>
    </div>`);

  const body = document.getElementById('sheetBody');
  let pick = sel < 0 ? 'new' : String(sel);
  body.querySelector('#fGroups').onclick = e => {
    const c = e.target.closest('.gchip'); if (!c) return;
    body.querySelectorAll('.gchip').forEach(x => x.classList.toggle('on', x === c));
    pick = c.dataset.i;
    document.getElementById('fNewWrap').hidden = pick !== 'new';
  };
  body.querySelector('#fSave').onclick = () => {
    const name = (document.getElementById('fName').value || 'สถานที่ใหม่').trim();
    const th = document.getElementById('fTh').value.trim();
    const desc = document.getElementById('fDesc').value.trim() || 'แตะเพื่อเพิ่มรายละเอียด';
    const time = document.getElementById('fTime').value.trim() || '—';
    const dur = document.getElementById('fDur').value.trim() || '—';

    let group;
    if (pick === 'new') {
      const gname = (document.getElementById('fNew').value || day.dataset.city).trim();
      const color = day.style.getPropertyValue('--c').trim() || '#EC5F86';
      const p = panelForDay(day.dataset.day);
      const sec = document.createElement('section');
      sec.className = 'place-sec'; sec.style.setProperty('--pin', color);
      sec.innerHTML = `
        <div class="place-head">
          <span class="pinico"><svg width="36" height="36"><use href="#i-pin-solid"/></svg></span>
          <div><h2>${gname}</h2><p>แตะเพื่อเพิ่มคำอธิบายย่าน</p></div>
          <svg class="gdots" width="30" height="30"><use href="#i-dots"/></svg>
          <svg class="caret" width="34" height="34"><use href="#i-up"/></svg>
        </div>
        <div class="timeline"></div>
        <button class="addact" data-add><svg width="30" height="30" class="ic-pin"><use href="#i-plusc"/></svg>เพิ่มสถานที่ใน ${gname}</button>`;
      p.append(sec); bindHandles(sec); group = sec;
    } else group = groups[+pick];

    const art = ART[Math.floor(Math.random() * ART.length)];
    const el = document.createElement('article');
    el.className = 'act';
    el.innerHTML = `
      <div class="act-row"><img src="art/${art}">
        <div class="m"><b>${name}${th ? ` <span class="th">(${th})</span>` : ''}</b><small>${desc}</small></div>
        <div class="tm"><div><svg width="24" height="24" class="ic-pin"><use href="#i-clock"/></svg>${time}</div>
          <div><svg width="22" height="22" style="color:#A6AEBD"><use href="#i-clock"/></svg>${dur}</div></div>
        <svg class="dots" width="30" height="30"><use href="#i-dots"/></svg></div>`;
    group.querySelector('.timeline').append(el);
    bindHandles(el);
    Sheet.close();
    toast(`เพิ่ม “${name}” ลง ${group.querySelector('.place-head h2').textContent} แล้ว`);
  };
}

document.addEventListener('click', e => {
  if (e.target.closest('#s-plan .fab')) openAddSheet(null);
  const g = e.target.closest('.addact');
  if (g) openAddSheet(g.closest('.place-sec'));
});

/* ===========================================================
   หมุดบนแบนเนอร์ — วาดจากข้อมูล ไม่ได้ฝังไว้ตายตัว
   เมืองมาจากวันในทริป (day pill) · ตำแหน่ง x/y เก็บใน Projects.route_data
   เมืองที่ยังไม่มีตำแหน่ง = "ยังไม่ได้ปักหมุด" ให้ลากจากถาดล่างไปวางบนแผนที่
   =========================================================== */
const CITIES = [
  { name: 'Sounkyo',   from: '22 ม.ค.', to: '23 ม.ค.', color: '#7C63E0', dark: '#6A51CE', x: 397, y: 24 },
  { name: 'Lake Akan', from: '24 ม.ค.', to: '25 ม.ค.', color: '#EF5A85', dark: '#D94A73', x: 575, y: 223 },
  { name: 'Kushiro',   from: '26 ม.ค.', to: '27 ม.ค.', color: '#4CB682', dark: '#3AA271', x: 748, y: 294 }
];

const pinSvg = (c, d) => `<svg width="66" height="96" viewBox="0 0 66 96">
  <g fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
    <path d="M33 4C17.9 4 5.6 16.3 5.6 31.4 5.6 47.2 33 74 33 74s27.4-26.8 27.4-42.6C60.4 16.3 48.1 4 33 4z"/>
    <path d="M33 72v13"/><ellipse cx="33" cy="87.5" rx="13" ry="5.4"/></g>
  <ellipse cx="33" cy="87.5" rx="13" ry="5.4" fill="${d}"/>
  <path d="M33 70v16" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
  <path d="M33 4C17.9 4 5.6 16.3 5.6 31.4 5.6 47.2 33 74 33 74s27.4-26.8 27.4-42.6C60.4 16.3 48.1 4 33 4z" fill="${c}"/>
  <circle cx="33" cy="30.4" r="11" fill="#fff"/></svg>`;

/* เส้นทาง = โค้งลื่นผ่านฐานหมุดทุกเมือง (เรียงตามวันเดินทาง) */
function routePath(pts) {
  if (pts.length < 2) return '';
  const p = [...pts].sort((a, b) => a.order - b.order);
  let d = `M${p[0].x + 26} ${p[0].y + 88}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    const x1 = a.x + 26, y1 = a.y + 88, x2 = b.x - 26, y2 = b.y + 88;
    const dx = (x2 - x1) * .45, sag = 26;
    d += ` C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
  }
  return d;
}

function renderPins() {
  const host = document.getElementById('pins'); if (!host) return;
  const placed = [];
  host.innerHTML = CITIES.map((c, i) => {
    if (c.x == null) return '';
    placed.push({ x: c.x, y: c.y, order: i });
    return `<div class="pin" data-city="${i}" style="left:${c.x}px;top:${c.y}px">
      ${pinSvg(c.color, c.dark)}<b>${c.name}</b><small>${c.from}–${c.to}</small></div>`;
  }).join('');
  const d = routePath(placed);
  document.getElementById('route').innerHTML = d ? `
    <path d="${d}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-dasharray="11 7"/>
    <path d="${d}" fill="none" stroke="#2F6BFF" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="11 7"/>` : '';
  const tray = document.getElementById('trayItems');
  const missing = CITIES.map((c, i) => ({ c, i })).filter(o => o.c.x == null);
  tray.innerHTML = missing.map(o =>
    `<button class="tray-chip" data-city="${o.i}" style="--c:${o.c.color}">${o.c.name}</button>`).join('')
    + `<button class="tray-chip add" data-add-city>+ เพิ่มเมือง</button>`;
  bindPinDrag();
}

/* ลากหมุด / ลากชิปจากถาดมาวางบนแผนที่ */
function bindPinDrag() {
  const hero = document.querySelector('#s-plan .maphero');
  const nodes = [...hero.querySelectorAll('.pin'), ...document.querySelectorAll('.tray-chip[data-city]')];
  nodes.forEach(n => n.addEventListener('pointerdown', e => {
    if (!hero.classList.contains('editing')) return;
    e.preventDefault();
    const idx = +n.dataset.city, city = CITIES[idx];
    const hr = hero.getBoundingClientRect();
    const scale = hr.width / 869;
    n.classList.add('grabbing');
    const move = ev => {
      city.x = Math.max(40, Math.min(829, (ev.clientX - hr.left) / scale - 33));
      city.y = Math.max(150, Math.min(360, (ev.clientY - hr.top) / scale - 60));
      renderPins();
      hero.classList.add('editing');
      const again = hero.querySelector(`.pin[data-city="${idx}"]`);
      if (again) again.classList.add('grabbing');
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      hero.querySelectorAll('.grabbing').forEach(x => x.classList.remove('grabbing'));
      toast(`ปักหมุด ${city.name} เรียบร้อย`);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }));
}

document.addEventListener('click', e => {
  if (e.target.closest('#pinEdit')) {
    const hero = document.querySelector('#s-plan .maphero');
    const on = hero.classList.toggle('editing');
    document.getElementById('pinEdit').classList.toggle('on', on);
    document.getElementById('pinTray').hidden = !on;
    if (!on) toast('บันทึกตำแหน่งหมุดแล้ว');
  }
  if (e.target.closest('[data-add-city]')) {
    const palette = [['#2F8FD8', '#2278BC'], ['#E2574C', '#C7423A'], ['#38A89D', '#2A8E85']];
    const [c, d] = palette[CITIES.length % palette.length];
    CITIES.push({ name: 'เมืองใหม่ ' + (CITIES.length + 1), from: '—', to: '—', color: c, dark: d, x: null, y: null });
    renderPins();
    toast('เพิ่มเมืองแล้ว — ลากจากถาดไปวางบนแผนที่');
  }
});

renderPins();

/* แตะบนแผนที่เพื่อซูมเข้า-ออก ณ จุดที่แตะ (แทนการ pinch บนเดสก์ท็อป) */
(() => {
  const hero = document.getElementById('planHero');
  if (!hero) return;
  hero.addEventListener('click', e => {
    if (hero.classList.contains('editing')) return;
    if (e.target.closest('.pin') || e.target.closest('#pinEdit')) return;
    const r = hero.getBoundingClientRect();
    const ox = ((e.clientX - r.left) / r.width) * 100;
    const oy = ((e.clientY - r.top) / r.height) * 100;
    hero.style.setProperty('--ox', ox + '%');
    hero.style.setProperty('--oy', oy + '%');
    hero.classList.toggle('zoomed');
    const hint = document.getElementById('zoomHint');
    if (hint) hint.style.opacity = hero.classList.contains('zoomed') ? 0 : 1;
  });
})();
