/* ── ตัวตัดภาพรวมหลายไอคอน — เฉพาะตรรกะล้วน ไม่แตะ DOM ──────────────────
   Gemini/ChatGPT สร้างไอคอนออกมาเป็น "แผ่นเดียว" มีหลายชิ้นเรียงกัน
   ถ้าให้ผู้ใช้ไปครอปเองทีละชิ้นในโปรแกรมอื่น ชุด 12 ไอคอนก็คือ 12 รอบ

   วิธี: ฉายจำนวนพิกเซลที่ "ไม่ใช่พื้นหลัง" ลงบนแกน x และ y (projection profile)
   แถบที่มีเนื้อหาคือช่วงที่ค่าฉายไม่เป็นศูนย์ · ชิ้น = แถบแนวตั้ง × แถบแนวนอน

   ⚠️ ใช้ได้กับภาพที่เรียงเป็นตารางและมีช่องว่างคั่น ถ้าไอคอนติดกันจนไม่มีช่องว่าง
   มันจะรวมเป็นชิ้นเดียว — จึงต้องมีโหมดตัดเป็นตารางด้วยมือ (gridTiles) ควบคู่เสมอ

   แยกไฟล์ออกมาจาก app.js เพราะเป็นตรรกะล้วนที่เทสได้จริงโดยไม่ต้องมีเบราว์เซอร์
   รับ ImageData ({ data, width, height }) เข้า คืนกรอบสี่เหลี่ยมออก */

/* ต่ำกว่านี้ถือว่าเป็นพื้นหลัง — เผื่อ JPEG artifact และเงาอ่อน ๆ รอบไอคอน */
const BG_THRESHOLD = 34;

/* เดาสีพื้นหลังจากขอบภาพ — ไอคอนแทบไม่มีทางกินพื้นที่รอบขอบทั้งผืน

   ⚠️ ห้ามอ่านแค่ 4 มุมแล้วเฉลี่ย เพราะภาพจาก AI มักมี **กรอบเส้นบางรอบผืน**
   มุมทั้งสี่จะเป็นสีกรอบ → ระบบเข้าใจว่าพื้นหลังคือสีกรอบ → พื้นขาวข้างในกลาย
   เป็น "เนื้อหา" ทั้งหมด → ทั้งแผ่นถูกตัดเป็นชิ้นเดียว (เจอตอนเขียนเทส 2026-08-17)

   จึงเก็บตัวอย่างเป็นวงรอบ ๆ โดยเว้นเข้ามาจากขอบเล็กน้อย แล้วใช้ **สีที่พบบ่อย
   ที่สุด** ไม่ใช่ค่าเฉลี่ย — ค่าเฉลี่ยของขาวกับเทาได้เทาอ่อน ซึ่งไม่ตรงกับอะไรเลย */
function guessBackground(imageData) {
  const { width, height, data } = imageData;
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.03));
  const xs = [inset, Math.round(width / 4), Math.round(width / 2), Math.round(width * 3 / 4), width - 1 - inset];
  const ys = [inset, Math.round(height / 4), Math.round(height / 2), Math.round(height * 3 / 4), height - 1 - inset];

  const points = [];
  xs.forEach(x => points.push([x, inset], [x, height - 1 - inset]));      // ขอบบน-ล่าง
  ys.forEach(y => points.push([inset, y], [width - 1 - inset, y]));       // ขอบซ้าย-ขวา
  points.push([0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]);   // มุมจริง ๆ ด้วย

  const samples = points
    .filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height)
    .map(([x, y]) => {
      const i = (y * width + x) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
    });

  const clear = samples.filter(s => s.a < 24).length;
  if (clear > samples.length / 2) return { transparent: true };

  // จัดกลุ่มสีหยาบ ๆ (ทีละ 16 ระดับ) แล้วเลือกกลุ่มที่พบบ่อยสุด กันสีเพี้ยนจาก JPEG
  const buckets = new Map();
  samples.filter(s => s.a >= 24).forEach(s => {
    const key = `${s.r >> 4}-${s.g >> 4}-${s.b >> 4}`;
    const found = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    found.n += 1; found.r += s.r; found.g += s.g; found.b += s.b;
    buckets.set(key, found);
  });
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) return { transparent: true };
  return {
    transparent: false,
    r: Math.round(best.r / best.n),
    g: Math.round(best.g / best.n),
    b: Math.round(best.b / best.n)
  };
}

/* ระยะห่างของพิกเซลจากพื้นหลัง (0 = เหมือนพื้นหลังเป๊ะ)
   ใช้ค่าต่างสูงสุดของช่อง R/G/B ไม่ใช่ผลรวม — ไอคอนสีแดงบนพื้นขาวกับ
   ไอคอนเทาอ่อนบนพื้นขาวจะได้ถูกจับได้เท่ากัน */
function bgDistance(data, i, bg) {
  if (bg.transparent) return data[i + 3];
  if (data[i + 3] < 24) return 0;    // โปร่งใสบนพื้นทึบ = ยังถือว่าว่าง
  return Math.max(
    Math.abs(data[i] - bg.r),
    Math.abs(data[i + 1] - bg.g),
    Math.abs(data[i + 2] - bg.b));
}

/* หาช่วงที่ต่อเนื่องกันในโปรไฟล์ — คืนเป็นคู่ [เริ่ม, จบ]
   minRun กันไม่ให้เส้นขอบบาง ๆ หรือจุดรบกวนกลายเป็น "ชิ้น" ของตัวเอง */
function bands(profile, minRun) {
  const found = [];
  let start = -1;
  profile.forEach((value, index) => {
    if (value > 0 && start < 0) start = index;
    if (value === 0 && start >= 0) {
      if (index - start >= minRun) found.push([start, index - 1]);
      start = -1;
    }
  });
  if (start >= 0 && profile.length - start >= minRun) found.push([start, profile.length - 1]);
  return found;
}

/* กรอบเนื้อหาจริงภายในกล่องที่กำหนด — ตัดขอบว่างรอบ ๆ ออก
   คืน null ถ้าในกล่องไม่มีเนื้อหาเลย (ช่องว่างของตาราง) */
function trimBox(imageData, bg, box) {
  const { width, data } = imageData;
  let minX = box.x1, minY = box.y1, maxX = box.x0, maxY = box.y0;
  for (let y = box.y0; y <= box.y1; y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      if (bgDistance(data, (y * width + x) * 4, bg) <= BG_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < minX || maxY < minY ? null : { x0: minX, y0: minY, x1: maxX, y1: maxY };
}

/* ลบ "เส้นคั่น" ออกจากแผนที่พิกเซลก่อนฉาย — แก้ตรงจุด ไม่ใช่ยกเกณฑ์กรองทั้งระบบ

   ⚠️ เจอจากภาพจริงที่ North สร้าง (2026-08-17): แผ่นกระเป๋าตังค์มีเส้นตารางบาง ๆ
   คั่นระหว่างช่อง เส้นเดียวพาดตลอดความกว้าง → ทุกคอลัมน์มีพิกเซลเนื้อหาติดมาด้วย
   → ไม่มีคอลัมน์ไหนเป็นศูนย์ → ทั้งแผ่นรวมเป็นชิ้นเดียว (ได้ 1 ชิ้นแทนที่จะเป็น 6)

   ทำไมไม่แค่ยกเกณฑ์กรองให้สูงขึ้น: เกณฑ์ที่สูงพอจะฆ่าเส้นคั่นได้ ก็สูงพอจะไปตัด
   ส่วนที่ผอมของตัวไอคอนเอง (ก้านช้อน ขาแก้วเบียร์ เสาอากาศแท็กซี่) แล้วไอคอนหนึ่ง
   ชิ้นจะถูกหั่นเป็นสองชิ้นตรงเอว — เสียหายกว่าปัญหาเดิม

   นิยามของเส้นคั่นจึงเจาะจง: กินความกว้าง/สูงเกือบทั้งแกน **และ** บางมาก
   ตัวไอคอนไม่มีทางเข้าเงื่อนไขทั้งสองข้อพร้อมกัน */
function wipeSeparators(mask, width, height) {
  const spanRatio = 0.9;                                    // ต้องพาดเกือบตลอดแกน
  const maxThick = axis => Math.max(3, Math.round(axis * 0.01));   // และต้องบางกว่านี้

  const scan = (length, span, countAt, clearAt) => {
    const full = new Array(length).fill(0);
    for (let i = 0; i < length; i += 1) full[i] = countAt(i) >= span * spanRatio ? 1 : 0;
    let start = -1;
    for (let i = 0; i <= length; i += 1) {
      if (i < length && full[i] && start < 0) start = i;
      if ((i === length || !full[i]) && start >= 0) {
        if (i - start <= maxThick(length)) {
          for (let j = start; j < i; j += 1) clearAt(j);
        }
        start = -1;
      }
    }
  };

  scan(height, width,
    y => { let n = 0; for (let x = 0; x < width; x += 1) n += mask[y * width + x]; return n; },
    y => { for (let x = 0; x < width; x += 1) mask[y * width + x] = 0; });

  scan(width, height,
    x => { let n = 0; for (let y = 0; y < height; y += 1) n += mask[y * width + x]; return n; },
    x => { for (let y = 0; y < height; y += 1) mask[y * width + x] = 0; });
}

/* ตรวจหาชิ้นอัตโนมัติ — คืน { tiles, bg } โดย tiles เป็นกรอบในพิกัดของภาพที่ให้มา

   ⚠️ จุดที่เคยพลาด: ภาพจาก AI มักมี **กรอบเส้นบาง ๆ รอบผืน** เส้นแนวตั้งสองข้าง
   ทำให้ "ทุกแถว" มีพิกเซลเนื้อหาอย่างน้อย 2 จุด → ไม่มีแถวไหนเป็นศูนย์เลย
   → ทั้งแผ่นกลายเป็นชิ้นเดียว ผู้ใช้ได้ไอคอนเป็นภาพรวมทั้งแผ่น

   แก้ด้วยการฉายสองรอบ: หาแถบคอลัมน์ก่อน (เส้นกรอบแนวตั้งกว้าง 1 px จะตกไปเอง
   เพราะสั้นกว่า minSide) แล้วค่อยนับแถวโดยดู **เฉพาะคอลัมน์ที่รอด** จากนั้น
   ทำกลับทางอีกรอบ · ดีกว่าการยกเกณฑ์กรองให้สูงขึ้น ซึ่งจะไปตัดรายละเอียดเส้นบาง
   ของตัวไอคอนเอง (เช่นเสาอากาศ/หนวดแมว) ที่ขอบบน-ล่างทิ้งไปด้วย */
function detectTiles(imageData) {
  const { data, width, height } = imageData;
  const bg = guessBackground(imageData);

  // แผนที่พิกเซลเนื้อหา คำนวณครั้งเดียวแล้วใช้ซ้ำทุกรอบการฉาย
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p += 1) {
    if (bgDistance(data, p * 4, bg) > BG_THRESHOLD) mask[p] = 1;
  }
  wipeSeparators(mask, width, height);

  const minSide = Math.max(1, Math.round(Math.min(width, height) * 0.05));

  /* ฉายลงแกนเดียว โดยนับเฉพาะช่วงที่กำหนดบนอีกแกนหนึ่ง
     spans = null คือนับทั้งแกน (รอบแรก)

     เกณฑ์กรอง 0.5% ของความยาวที่นับ · ต้องไม่ต่ำกว่า 3 เด็ดขาด เพราะเส้นกรอบ
     บน+ล่างของภาพให้ค่าพอดี 2 ทุกคอลัมน์ ถ้าเกณฑ์เป็น 2 ทั้งภาพจะไม่มีคอลัมน์
     ไหนเป็นศูนย์เลย แล้วรวมเป็นชิ้นเดียว (เคยพลาดตรงนี้มาแล้ว) */
  const project = (axis, spans) => {
    const length = axis === 'row' ? height : width;
    const ranges = spans || [[0, (axis === 'row' ? width : height) - 1]];
    const span = ranges.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
    const floor = Math.max(3, Math.round(span * 0.005));
    const profile = new Array(length).fill(0);
    for (let i = 0; i < length; i += 1) {
      let count = 0;
      for (const [a, b] of ranges) {
        for (let j = a; j <= b; j += 1) {
          count += axis === 'row' ? mask[i * width + j] : mask[j * width + i];
        }
      }
      profile[i] = count >= floor ? count : 0;
    }
    return profile;
  };

  let colBands = bands(project('col', null), minSide);
  const rowBands = bands(project('row', colBands.length ? colBands : null), minSide);
  // รอบสอง: ตอนนี้รู้แถวที่มีเนื้อหาแล้ว เอามากรองคอลัมน์ให้แม่นขึ้นอีกที
  if (rowBands.length) colBands = bands(project('col', rowBands), minSide);

  const tiles = [];
  rowBands.forEach(([y0, y1]) => colBands.forEach(([x0, x1]) => {
    const box = trimBox(imageData, bg, { x0, y0, x1, y1 });
    if (box) tiles.push(box);
  }));
  return { tiles, bg };
}

/* ตัดเป็นตารางเท่า ๆ กันตามที่ผู้ใช้ระบุ แล้วยังตัดขอบว่างของแต่ละช่องให้
   ใช้เมื่อไอคอนติดกันจนระบบแยกเองไม่ได้ */
function gridTiles(imageData, rows, cols) {
  const { width, height } = imageData;
  const bg = guessBackground(imageData);
  const tiles = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const box = trimBox(imageData, bg, {
        x0: Math.round(c * width / cols),
        y0: Math.round(r * height / rows),
        x1: Math.round((c + 1) * width / cols) - 1,
        y1: Math.round((r + 1) * height / rows) - 1
      });
      if (box) tiles.push(box);
    }
  }
  return { tiles, bg };
}

/* เทสฝั่ง Node ใช้ทางนี้ · เบราว์เซอร์ไม่มี module.exports จึงข้ามไปเอง */
if (typeof module !== 'undefined') {
  module.exports = { BG_THRESHOLD, guessBackground, bgDistance, bands, trimBox, detectTiles, gridTiles };
}
