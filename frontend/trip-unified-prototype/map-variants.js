/* Mobile map treatments A/B/C — comparison layer only.
   Wraps the existing <img> + <svg> in one .map-canvas so the two can never
   drift apart, then scales / pans that single canvas per variant.
   Nothing here touches app.js state or the production prototype. */
(function () {
  const VB_W = 1931;
  const hero = document.querySelector('.map-hero');
  if (!hero) return;

  const img = hero.querySelector('img');
  const svg = hero.querySelector('svg');
  const canvas = document.createElement('div');
  canvas.className = 'map-canvas';
  hero.append(canvas);
  canvas.append(img, svg);

  const hint = document.createElement('p');
  hint.className = 'map-hint';
  hero.after(hint);

  const pins = [...svg.querySelectorAll('.journey-pin')];
  const currentPin = () => svg.querySelector('.journey-pin.current') || pins[0];
  const variant = () => document.body.dataset.variant;

  function recentre() {
    const pin = currentPin();
    if (!pin) return;
    const x = Number(pin.dataset.x);
    const y = Number(pin.dataset.y);
    const scale = canvas.offsetWidth / VB_W;

    if (variant() === 'a') {
      hero.scrollLeft = Math.max(0, x * scale - hero.clientWidth / 2);
    }
    if (variant() === 'b') {
      const tx = Math.min(0, Math.max(hero.clientWidth - canvas.offsetWidth, hero.clientWidth / 2 - x * scale));
      const ty = Math.min(0, Math.max(hero.clientHeight - canvas.offsetHeight, hero.clientHeight / 2 - y * scale));
      canvas.style.transform = `translate(${tx}px, ${ty}px)`;
    }
  }

  const HINTS = {
    a: 'เลื่อนแผนที่ซ้าย–ขวาเพื่อดูเส้นทางทั้งหมด · ระบบเลื่อนไปที่ <b>จุดปัจจุบัน</b> ให้อัตโนมัติ',
    b: 'แผนที่ซูมอยู่ที่ <b>จุดปัจจุบัน</b> · แตะหมุดอื่นเพื่อเลื่อนตาม',
    c: 'แตะแผนที่เพื่อ<b>ขยายเต็มจอ</b>'
  };

  function setVariant(v) {
    if (!HINTS[v]) v = 'a';
    document.body.dataset.variant = v;
    history.replaceState(null, '', `#${v}`);
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.variant === v));
    canvas.style.transform = '';
    hint.innerHTML = HINTS[v];
    requestAnimationFrame(recentre);
  }

  const bar = document.createElement('div');
  bar.className = 'variant-bar';
  bar.innerHTML = '<span>แผนที่มือถือ</span>' +
    '<button data-variant="a">A · ซูม+เลื่อน</button>' +
    '<button data-variant="b">B · ครอปโซน</button>' +
    '<button data-variant="c">C · ย่อ+กดขยาย</button>';
  document.body.append(bar);
  bar.addEventListener('click', e => {
    const button = e.target.closest('[data-variant]');
    if (button) setVariant(button.dataset.variant);
  });

  // app.js swaps .current onto a different pin when one is tapped.
  pins.forEach(pin => pin.addEventListener('click', () => setTimeout(recentre, 80)));
  window.addEventListener('resize', recentre);

  // ── C: expanded view ──
  const overlay = document.createElement('div');
  overlay.className = 'map-expand';
  overlay.hidden = true;
  overlay.innerHTML = '<button class="map-expand-close" aria-label="ปิด">×</button>' +
    '<div class="map-expand-scroll"></div>' +
    '<p class="map-expand-tip">เลื่อนซ้าย–ขวาเพื่อดูทั้งเส้นทาง</p>';
  document.body.append(overlay);

  hero.addEventListener('click', e => {
    if (variant() !== 'c' || e.target.closest('.journey-pin')) return;
    const box = overlay.querySelector('.map-expand-scroll');
    const clone = canvas.cloneNode(true);
    clone.style.transform = '';
    box.innerHTML = '';
    box.append(clone);
    overlay.hidden = false;
    requestAnimationFrame(() => {
      const pin = currentPin();
      if (!pin) return;
      box.scrollLeft = Math.max(0, Number(pin.dataset.x) * (clone.offsetWidth / VB_W) - box.clientWidth / 2);
    });
  });
  overlay.addEventListener('click', e => {
    if (e.target.closest('.map-expand-close') || e.target === overlay) overlay.hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.hidden = true;
  });

  setVariant((location.hash || '#a').slice(1));
})();
