/* เทสตัวตัดภาพรวมหลายไอคอน — frontend/trip-unified-prototype/slice-engine.js
   สร้างภาพจำลองเป็นอาร์เรย์พิกเซลตรง ๆ ไม่ต้องมีเบราว์เซอร์หรือ canvas
   รัน: node backend/test/slice-engine.test.mjs */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* ไฟล์เป้าหมายเป็นสคริปต์ของเบราว์เซอร์ (ไม่ใช่ ES module) แต่มี module.exports
   ต่อท้ายไว้ให้ Node · โหลดผ่าน require ธรรมดาได้เลย */
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const enginePath = path.join(here, '../../frontend/trip-unified-prototype/slice-engine.js');
const { guessBackground, bands, trimBox, detectTiles, gridTiles } = require(enginePath);

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${extra ? ` → ${extra}` : ''}`); }
};

/* ── ตัวช่วยสร้างภาพจำลอง ───────────────────────────────────────────── */

/* สร้างผืนภาพพื้นสีเดียว · fill = [r,g,b,a] */
function blank(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
  }
  return { data, width, height };
}

/* ระบายสี่เหลี่ยมทึบลงบนภาพ */
function paint(img, x0, y0, x1, y1, colour) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * img.width + x) * 4;
      img.data[i] = colour[0]; img.data[i + 1] = colour[1];
      img.data[i + 2] = colour[2]; img.data[i + 3] = colour[3];
    }
  }
}

/* แผ่นไอคอนแบบที่ Gemini/ChatGPT สร้างมา: ตาราง rows × cols บนพื้นขาว
   แต่ละช่องมีสี่เหลี่ยมสีอยู่ตรงกลาง เว้นขอบรอบ ๆ เป็นช่องว่าง */
function iconSheet(rows, cols, cell = 100, gap = 20, bg = [255, 255, 255, 255]) {
  const width = cols * cell;
  const height = rows * cell;
  const img = blank(width, height, bg);
  const boxes = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * cell + gap, y0 = r * cell + gap;
      const x1 = (c + 1) * cell - gap - 1, y1 = (r + 1) * cell - gap - 1;
      paint(img, x0, y0, x1, y1, [200, 40, 80, 255]);
      boxes.push({ x0, y0, x1, y1 });
    }
  }
  return { img, boxes };
}

const sameBox = (a, b) => a && b && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

console.log('\n── เดาพื้นหลัง ──────');
{
  check('พื้นขาวทึบ → ไม่ใช่โปร่งใส และได้สีขาว',
    (bg => !bg.transparent && bg.r === 255 && bg.g === 255 && bg.b === 255)(
      guessBackground(blank(20, 20, [255, 255, 255, 255]))));

  check('พื้นโปร่งใส → transparent:true',
    guessBackground(blank(20, 20, [0, 0, 0, 0])).transparent === true);

  check('พื้นสีครีม (ไม่ใช่ขาวเป๊ะ) ก็ยังจับได้',
    (bg => !bg.transparent && bg.r === 250 && bg.b === 240)(
      guessBackground(blank(20, 20, [250, 245, 240, 255]))));

  /* ⚠️ ไอคอนกินพื้นที่กลางภาพเต็ม ๆ ก็ยังต้องอ่านพื้นหลังจากมุมได้ถูก
     ถ้าไปเฉลี่ยทั้งภาพจะได้สีชมพูอ่อน แล้วไอคอนจะกลายเป็น "พื้นหลัง" */
  const centred = blank(40, 40, [255, 255, 255, 255]);
  paint(centred, 5, 5, 34, 34, [200, 40, 80, 255]);
  check('🔑 ไอคอนใหญ่กลางภาพไม่ทำให้เดาพื้นหลังเพี้ยน',
    (bg => bg.r === 255 && bg.g === 255)(guessBackground(centred)));
}

console.log('\n── หาแถบต่อเนื่อง (bands) ──────');
{
  check('ช่วงเดียว', JSON.stringify(bands([0, 0, 5, 5, 5, 0, 0], 1)) === '[[2,4]]');
  check('สองช่วงคั่นด้วยศูนย์', JSON.stringify(bands([3, 3, 0, 0, 7, 7], 1)) === '[[0,1],[4,5]]');
  check('ช่วงที่ชิดขอบท้ายถูกปิดให้', JSON.stringify(bands([0, 4, 4], 1)) === '[[1,2]]');
  check('ไม่มีเนื้อหาเลย → ว่าง', bands([0, 0, 0], 1).length === 0);
  check('⚠️ ช่วงสั้นกว่า minRun ถูกทิ้ง (จุดรบกวน ไม่ใช่ไอคอน)',
    bands([0, 9, 0, 9, 9, 9, 9, 0], 3).length === 1);
}

console.log('\n── ตัดขอบว่าง (trimBox) ──────');
{
  const img = blank(50, 50, [255, 255, 255, 255]);
  paint(img, 10, 12, 29, 31, [0, 0, 0, 255]);
  const bg = guessBackground(img);
  const box = trimBox(img, bg, { x0: 0, y0: 0, x1: 49, y1: 49 });
  check('ได้กรอบพอดีเนื้อหา ไม่เอาขอบว่างมาด้วย', sameBox(box, { x0: 10, y0: 12, x1: 29, y1: 31 }), JSON.stringify(box));
  check('🔑 กล่องที่ไม่มีเนื้อหาคืน null (ช่องว่างของตาราง)',
    trimBox(img, bg, { x0: 35, y0: 35, x1: 49, y1: 49 }) === null);

  /* สีที่ต่างจากพื้นหลังนิดเดียว (เงาอ่อน/JPEG artifact) ต้องไม่ถูกนับเป็นเนื้อหา
     ไม่งั้นทุกภาพ JPEG จะได้กรอบเต็มผืนเสมอ */
  const noisy = blank(30, 30, [255, 255, 255, 255]);
  paint(noisy, 0, 0, 29, 29, [245, 245, 245, 255]);
  check('⚠️ สีต่างจากพื้นเล็กน้อยไม่ถูกนับเป็นเนื้อหา',
    trimBox(noisy, guessBackground(noisy), { x0: 0, y0: 0, x1: 29, y1: 29 }) === null);
}

console.log('\n── ตรวจหาไอคอนอัตโนมัติ ──────');
{
  const { img, boxes } = iconSheet(3, 4);
  const found = detectTiles(img);
  check('แผ่น 3 × 4 บนพื้นขาว → เจอ 12 ชิ้น', found.tiles.length === 12, String(found.tiles.length));
  check('🔑 กรอบแต่ละชิ้นตรงกับที่วาดไว้เป๊ะ',
    found.tiles.every((tile, i) => sameBox(tile, boxes[i])),
    JSON.stringify(found.tiles.slice(0, 2)));

  const { img: trans } = iconSheet(2, 3, 100, 20, [0, 0, 0, 0]);
  const foundTrans = detectTiles(trans);
  check('พื้นโปร่งใสก็แยกได้ (2 × 3 → 6 ชิ้น)', foundTrans.tiles.length === 6, String(foundTrans.tiles.length));
  check('บอกด้วยว่าพื้นเดิมโปร่งใส (หน้าจอจะได้ไม่เสนอให้ลบพื้นซ้ำ)',
    foundTrans.bg.transparent === true);

  const single = blank(200, 200, [255, 255, 255, 255]);
  paint(single, 30, 30, 169, 169, [40, 90, 200, 255]);
  check('ภาพที่มีไอคอนเดียว → เจอ 1 ชิ้น (ไม่พาไปหน้าตัด)', detectTiles(single).tiles.length === 1);

  check('ภาพว่างเปล่า → ไม่เจออะไรเลย ไม่ใช่พัง',
    detectTiles(blank(120, 120, [255, 255, 255, 255])).tiles.length === 0);

  /* ⚠️ ภาพจาก AI มักมีกรอบบาง ๆ รอบผืน ถ้าไม่กรองสัญญาณรบกวนทิ้ง จะไม่มีแถวไหน
     เป็นศูนย์เลย แล้วทั้งแผ่นจะกลายเป็นชิ้นเดียว — ผู้ใช้ได้ไอคอนเป็นภาพรวมทั้งแผ่น */
  const framed = iconSheet(2, 2).img;
  paint(framed, 0, 0, framed.width - 1, 0, [180, 180, 180, 255]);
  paint(framed, 0, framed.height - 1, framed.width - 1, framed.height - 1, [180, 180, 180, 255]);
  paint(framed, 0, 0, 0, framed.height - 1, [180, 180, 180, 255]);
  paint(framed, framed.width - 1, 0, framed.width - 1, framed.height - 1, [180, 180, 180, 255]);
  check('🔑 กรอบเส้นบางรอบภาพไม่ทำให้ทั้งแผ่นรวมเป็นชิ้นเดียว',
    detectTiles(framed).tiles.length === 4, String(detectTiles(framed).tiles.length));

  /* ไอคอนติดกันไม่มีช่องว่าง = แยกไม่ออก · ต้องยอมรับตรง ๆ แล้วให้ผู้ใช้
     ใช้โหมดตัดเป็นตารางแทน ดีกว่าเดาแล้วตัดผิดกลางไอคอน */
  const touching = blank(200, 100, [255, 255, 255, 255]);
  paint(touching, 10, 10, 189, 89, [200, 40, 80, 255]);
  check('ไอคอนติดกันสนิท → รวมเป็นชิ้นเดียว (ตามข้อจำกัดที่รู้อยู่)',
    detectTiles(touching).tiles.length === 1);
}

console.log('\n── กรณีจากภาพจริงที่ AI สร้าง ──────');
{
  // พื้นหลังสีพาสเทล ไม่ใช่ขาว — ธีมซากุระของแอปเป็นแบบนี้
  const { img } = iconSheet(2, 3, 100, 18, [252, 231, 240, 255]);
  check('พื้นหลังสีพาสเทลก็แยกได้', detectTiles(img).tiles.length === 6, String(detectTiles(img).tiles.length));

  // ไอคอนขนาดไม่เท่ากันในแถวเดียวกัน
  const uneven = blank(300, 120, [255, 255, 255, 255]);
  paint(uneven, 15, 20, 84, 99, [200, 40, 80, 255]);
  paint(uneven, 115, 40, 174, 79, [40, 160, 90, 255]);
  paint(uneven, 205, 10, 284, 109, [40, 90, 200, 255]);
  const found = detectTiles(uneven);
  check('ไอคอนขนาดไม่เท่ากัน → ยังได้ 3 ชิ้น', found.tiles.length === 3, String(found.tiles.length));
  check('กรอบแต่ละชิ้นพอดีขนาดจริงของมันเอง',
    sameBox(found.tiles[1], { x0: 115, y0: 40, x1: 174, y1: 79 }), JSON.stringify(found.tiles[1]));

  /* 🔴 เคสจริงจากแผ่นกระเป๋าตังค์ที่ North สร้าง (2026-08-17)
     แผ่นมีเส้นตารางบาง ๆ คั่นระหว่างช่อง เส้นเดียวพาดตลอดความกว้าง
     → ทุกคอลัมน์มีพิกเซลเนื้อหาติดมา → ไม่มีคอลัมน์ไหนเป็นศูนย์
     → ทั้งแผ่นรวมเป็นชิ้นเดียว (ได้ 1 ชิ้นแทนที่จะเป็น 6)
     wipeSeparators() ลบเส้นพวกนี้ทิ้งก่อนฉาย */
  const lined = iconSheet(3, 2, 120, 22).img;
  for (let y of [120, 240]) paint(lined, 0, y, lined.width - 1, y + 1, [225, 225, 225, 255]);
  paint(lined, 120, 0, 121, lined.height - 1, [225, 225, 225, 255]);
  check('🔑 เส้นตารางบางคั่นช่อง → ยังแยกได้ 6 ชิ้น ไม่ใช่ 1',
    detectTiles(lined).tiles.length === 6, String(detectTiles(lined).tiles.length));

  /* ⚠️ ห้ามแก้ปัญหาข้างบนด้วยการ "ยกเกณฑ์กรองให้สูงขึ้น" — เกณฑ์ที่สูงพอจะฆ่า
     เส้นคั่นได้ ก็สูงพอจะตัดส่วนผอมของตัวไอคอนเอง (ก้านช้อน ขาแก้วเบียร์)
     แล้วไอคอนหนึ่งชิ้นจะถูกหั่นเป็นสองชิ้นตรงเอว · เทสนี้เฝ้าจุดนั้นไว้ */
  const waisted = blank(200, 300, [255, 255, 255, 255]);
  paint(waisted, 40, 20, 159, 99, [200, 40, 80, 255]);      // หัวแก้ว
  paint(waisted, 96, 100, 103, 219, [200, 40, 80, 255]);    // ขาแก้ว กว้างแค่ 8 px
  paint(waisted, 40, 220, 159, 279, [200, 40, 80, 255]);    // ฐาน
  check('🔑 ไอคอนคอผอม (ขาแก้ว 8 px) ไม่ถูกหั่นกลางตัว',
    detectTiles(waisted).tiles.length === 1, String(detectTiles(waisted).tiles.length));

  /* ⚠️ ข้อจำกัดที่ต้องรู้: แผ่นที่มี "ชื่อกำกับใต้ไอคอน" จะถูกนับเป็นชิ้นแยก
     เพราะตัวหนังสือก็คือเนื้อหาที่มีช่องว่างคั่นเหมือนกัน · ผู้ใช้ต้องไม่เลือก
     ชิ้นที่เป็นตัวหนังสือ (จึงต้องมีหน้าให้เลือกทีละชิ้น ไม่ใช่เพิ่มทั้งหมดอัตโนมัติ) */
  const labelled = blank(200, 160, [255, 255, 255, 255]);
  paint(labelled, 20, 15, 79, 74, [200, 40, 80, 255]);      // ไอคอนซ้าย
  paint(labelled, 120, 15, 179, 74, [40, 160, 90, 255]);    // ไอคอนขวา
  paint(labelled, 25, 100, 74, 112, [90, 90, 90, 255]);     // ชื่อกำกับซ้าย
  paint(labelled, 125, 100, 174, 112, [90, 90, 90, 255]);   // ชื่อกำกับขวา
  check('⚠️ ชื่อกำกับใต้ไอคอนกลายเป็นชิ้นแยก (4 ชิ้น) — ผู้ใช้ต้องเลือกเอง',
    detectTiles(labelled).tiles.length === 4, String(detectTiles(labelled).tiles.length));
}

console.log('\n── ตัดเป็นตารางด้วยมือ ──────');
{
  const touching = blank(200, 100, [255, 255, 255, 255]);
  paint(touching, 10, 10, 189, 89, [200, 40, 80, 255]);
  const manual = gridTiles(touching, 1, 2);
  check('🔑 ตัด 1 × 2 แยกภาพที่ระบบแยกเองไม่ได้', manual.tiles.length === 2, String(manual.tiles.length));
  check('ครึ่งซ้ายไม่ล้ำเข้าครึ่งขวา', manual.tiles[0].x1 < 100, JSON.stringify(manual.tiles[0]));
  check('ครึ่งขวาเริ่มที่ 100 พอดี', manual.tiles[1].x0 === 100, JSON.stringify(manual.tiles[1]));
  check('ยังตัดขอบว่างบน/ล่างของแต่ละช่องให้ด้วย',
    manual.tiles.every(tile => tile.y0 === 10 && tile.y1 === 89));

  const { img } = iconSheet(3, 4);
  check('ตัดตารางตรงกับของจริง → ได้ 12 ชิ้น', gridTiles(img, 3, 4).tiles.length === 12);
  check('⚠️ ช่องที่ไม่มีเนื้อหาถูกข้าม ไม่ใช่คืนกล่องเปล่า',
    gridTiles(blank(120, 120, [255, 255, 255, 255]), 3, 3).tiles.length === 0);
  check('ตัด 1 × 1 = ทั้งภาพ (ตัดขอบว่างแล้ว)',
    sameBox(gridTiles(img, 1, 1).tiles[0], { x0: 20, y0: 20, x1: 379, y1: 279 }),
    JSON.stringify(gridTiles(img, 1, 1).tiles[0]));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
