/* เทสการหารเงินและสรุปยอด — frontend/trip-unified-prototype/money.js
   นี่คือเงินจริงของคน ถ้าคำนวณผิดคนจะโอนผิดจริง
   รัน: node backend/test/money.test.mjs */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { totalsByCurrency, settlementRows, planTransfers, categoryTotals, sortLotsNewestFirst, weightedRate, filterBills } =
  require(path.join(here, '../../frontend/trip-unified-prototype/money.js'));

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${extra ? ` → ${extra}` : ''}`); }
};

const M = ['north', 'puii', 'xin'];
const YEN = 0.23;
const yen = bill => (bill.currency === 'KRW' ? 0 : (bill.amount || 0) * YEN);
const round = value => Math.round(value);
const by = (rows, id) => rows.find(row => row.memberId === id);

console.log('\n── ยอดรวมแยกตามสกุล ──────');
{
  const totals = totalsByCurrency([
    { currency: 'JPY', amount: 3000 }, { currency: 'JPY', amount: 1500 },
    { currency: 'KRW', amount: 84000 }, { currency: 'THB', amount: 400 }
  ]);
  check('รวมสกุลเดียวกันเข้าด้วยกัน', totals.find(([c]) => c === 'JPY')?.[1] === 4500);
  check('เรียงจากมากไปน้อย', totals[0][0] === 'KRW', JSON.stringify(totals));
  check('🔑 ไม่บวกข้ามสกุล — แต่ละสกุลแยกกันคนละแถว', totals.length === 3);
}

console.log('\n── หารเท่ากัน ──────');
{
  const rows = settlementRows(M, [{
    payerId: 'north', ownerId: 'north', amount: 3000, currency: 'JPY', shared: true,
    participants: [{ memberId: 'north', amount: 1000 }, { memberId: 'puii', amount: 1000 }, { memberId: 'xin', amount: 1000 }]
  }], yen);
  check('North ควักจริง ฿690', round(by(rows, 'north').paid) === 690);
  check('North ควัก 690 รับผิดชอบ 230 → ได้คืน ฿460', round(by(rows, 'north').balance) === -460);
  check('Puii ติด ฿230', round(by(rows, 'puii').balance) === 230);

  const moves = planTransfers(rows);
  check('🔑 ได้ 2 รายการโอน ไม่ใช่ทุกคนโอนหาทุกคน', moves.length === 2, JSON.stringify(moves));
  check('ทั้งคู่โอนให้ North', moves.every(row => row.to === 'north'));
  check('ยอดโอนรวมเท่ากับที่ North ควักเกินพอดี',
    Math.abs(moves.reduce((sum, row) => sum + row.amount, 0) - 460) < 0.5);
}

console.log('\n── หารไม่เท่ากัน (คนกินเยอะจ่ายเยอะ) ──────');
{
  const rows = settlementRows(M, [{
    payerId: 'puii', ownerId: 'puii', amount: 10000, currency: 'JPY', shared: true,
    participants: [{ memberId: 'north', amount: 5000 }, { memberId: 'puii', amount: 3000 }, { memberId: 'xin', amount: 2000 }]
  }], yen);
  check('🔑 แบ่งตามสัดส่วนที่บันทึกไว้ ไม่ใช่หารสาม', round(by(rows, 'north').balance) === 1150);
  check('XinXin กินน้อยสุด ติดน้อยสุด', round(by(rows, 'xin').balance) === 460);
  check('ผลรวมยอดค้างทั้งกลุ่มเป็นศูนย์ — เงินไม่หายไปไหน',
    Math.abs(rows.reduce((sum, row) => sum + row.balance, 0)) < 0.01);
}

console.log('\n── ไม่ระบุสัดส่วน → หารเท่ากัน ──────');
{
  const rows = settlementRows(M, [{
    payerId: 'north', ownerId: 'north', amount: 3000, currency: 'JPY', shared: true,
    participants: [{ memberId: 'north', amount: 0 }, { memberId: 'puii', amount: 0 }, { memberId: 'xin', amount: 0 }]
  }], yen);
  check('🔑 ทุกคนเป็น 0 → หารเท่ากัน ไม่ใช่หารด้วยศูนย์',
    round(by(rows, 'puii').balance) === 230, String(by(rows, 'puii').balance));
  check('ไม่มี NaN หลุดออกมา', rows.every(row => Number.isFinite(row.balance)));
}

console.log('\n── บิลส่วนตัวและการจ่ายแทน ──────');
{
  const own = settlementRows(M, [{ payerId: 'north', ownerId: 'north', amount: 5000, currency: 'JPY', shared: false, participants: [] }], yen);
  check('🔑 บิลส่วนตัวไม่ทำให้ใครติดใคร', own.every(row => Math.abs(row.balance) < 0.01));
  check('แต่ยังนับเป็นเงินที่ควักจริง', round(by(own, 'north').paid) === 1150);

  const proxy = settlementRows(M, [{ payerId: 'north', ownerId: 'puii', amount: 4000, currency: 'JPY', shared: false, participants: [] }], yen);
  check('🔑 North ควักแทน แต่เงินเป็นของ Puii → Puii ติด North', round(by(proxy, 'puii').balance) === 920);
  check('North ได้คืนเต็มจำนวน', round(by(proxy, 'north').balance) === -920);
  check('⚠️ ถ้าคิดที่คนจ่ายแทนเจ้าของเงิน Puii จะไม่เคยติดใครเลย — ต้องไม่เป็นแบบนั้น',
    by(proxy, 'puii').balance > 0);
}

console.log('\n── บิลที่ตีเป็นบาทไม่ได้ ──────');
{
  const rows = settlementRows(M, [
    { payerId: 'north', ownerId: 'north', amount: 3000, currency: 'JPY', shared: true,
      participants: [{ memberId: 'north', amount: 1500 }, { memberId: 'puii', amount: 1500 }] },
    { payerId: 'puii', ownerId: 'puii', amount: 84000, currency: 'KRW', shared: true,
      participants: [{ memberId: 'north', amount: 42000 }, { memberId: 'puii', amount: 42000 }] }
  ], yen);
  check('⚠️ บิลไม่มีเรทคิดเป็น 0 จึงไม่กระทบยอดค้าง', round(by(rows, 'puii').balance) === 345);
  check('🔑 ยอดค้างยังบาลานซ์ ไม่มีเงินโผล่มาจากไหน',
    Math.abs(rows.reduce((sum, row) => sum + row.balance, 0)) < 0.01);
}

console.log('\n── เศษเล็กน้อยไม่ต้องโอน ──────');
{
  const moves = planTransfers([
    { memberId: 'north', paid: 0, balance: -0.4 },
    { memberId: 'puii', paid: 0, balance: 0.4 }
  ]);
  check('🔑 ติดกันไม่ถึง 1 บาท → ไม่สร้างรายการโอน', moves.length === 0, JSON.stringify(moves));
}

console.log('\n── ยอดตามหมวด ──────');
{
  const canConvert = bill => bill.currency !== 'KRW';
  const rows = categoryTotals([
    { currency: 'JPY', amount: 3000, categories: [{ name: 'อาหาร', amount: 2000 }, { name: 'เครื่องดื่ม', amount: 1000 }] },
    { currency: 'JPY', amount: 1000, categories: [{ name: 'อาหาร', amount: 1000 }] },
    { currency: 'KRW', amount: 84000, categories: [{ name: 'ช้อปปิ้ง', amount: 84000 }] }
  ], yen, canConvert);

  const food = rows.find(row => row.name === 'อาหาร');
  check('เกลี่ยยอดบาทลงแต่ละบรรทัดหมวดถูกต้อง', round(food.thb) === 690, String(food.thb));
  check('เก็บยอดสกุลจริงไว้ด้วย', food.native.get('JPY') === 3000);
  check('เรียงหมวดที่ใช้เยอะสุดขึ้นก่อน', rows[0].name === 'อาหาร');

  const shop = rows.find(row => row.name === 'ช้อปปิ้ง');
  check('🔑 หมวดที่แปลงไม่ได้ ติดธง convertible=false (หน้าจอต้องขึ้น "—" ไม่ใช่ ฿0)',
    shop.convertible === false);
  check('แต่ยังเก็บยอดสกุลจริงไว้ให้เห็น', shop.native.get('KRW') === 84000);

  const drink = rows.find(row => row.name === 'เครื่องดื่ม');
  check('หมวดที่แปลงได้ ติดธง convertible=true', drink.convertible === true);

  const none = categoryTotals([{ currency: 'JPY', amount: 500, categories: [] }], yen, canConvert);
  check('บิลที่ไม่ระบุหมวด ตกไปอยู่ "อื่น ๆ" ไม่ใช่หายไป', none[0].name === 'อื่น ๆ' && round(none[0].thb) === 115);
}

console.log('\n── ล็อตเติมเงิน · เรียงและคิดเรท ──────');
{
  /* จำลองการ "ลืมจดแล้วมาใส่ย้อนหลัง" — ล็อตวันที่ 2 ธ.ค. ถูกบันทึกทีหลังสุด
     (id ใหญ่กว่า) แต่ต้องไปอยู่ล่างสุดของรายการเพราะเกิดก่อน */
  const lots = [
    { id: 'F-002', date: '2026-12-15', thb: 12500, foreign: 50000 },
    { id: 'F-003', date: '2026-12-02', thb: 23000, foreign: 100000 },
    { id: 'F-001', date: '2026-12-20', thb: 5000, foreign: 19000 }
  ];
  const sorted = sortLotsNewestFirst(lots);
  check('🔑 เรียงตามวันที่จริง ใหม่ → เก่า ไม่ใช่ลำดับที่บันทึก',
    sorted.map(lot => lot.date).join(',') === '2026-12-20,2026-12-15,2026-12-02',
    sorted.map(lot => lot.date).join(','));
  check('ล็อตที่บันทึกทีหลังแต่วันที่เก่าสุด ต้องอยู่ล่างสุด', sorted[2].id === 'F-003');
  check('⚠️ ไม่แก้อาร์เรย์ต้นฉบับ (กัน re-render แล้วลำดับเพี้ยนสะสม)', lots[0].id === 'F-002');

  const rate = weightedRate(lots);
  check('🔑 เรทเฉลี่ยถ่วงน้ำหนัก ไม่ใช่ค่าเฉลี่ยของเรทแต่ละครั้ง',
    Math.abs(rate - 40500 / 169000) < 1e-9, String(rate));
  check('ค่าเฉลี่ยธรรมดาจะได้คนละค่า — ยืนยันว่าไม่ได้ใช้วิธีนั้น',
    Math.abs(rate - (0.25 + 0.23 + 5000 / 19000) / 3) > 0.001);
  check('🔑 บันทึกย้อนหลังไม่ทำให้เรทเพี้ยน — สลับลำดับแล้วได้ค่าเดิม',
    Math.abs(weightedRate(sorted) - rate) < 1e-12);
  check('ยังไม่มีล็อตเลย → คืน null ไม่ใช่ 0 (0 แปลว่าเงินไม่มีค่า)',
    weightedRate([]) === null);
  check('มีล็อตแต่ยอดต่างประเทศเป็น 0 → null ไม่ใช่หารด้วยศูนย์',
    weightedRate([{ id: 'F-9', date: '2026-12-01', thb: 100, foreign: 0 }]) === null);
}

console.log('\n── ตัวกรองรายการบิล (ประเภท · คนจ่าย · วันที่) ──────');
{
  const sample = [
    { id:'b1', date:'2026-12-18', payerId:'north', ownerId:'north', shared:true },
    { id:'b2', date:'2026-12-18', payerId:'puii',  ownerId:'puii',  shared:false },
    { id:'b3', date:'2026-12-19', payerId:'north', ownerId:'trip',  shared:false },
    { id:'b4', date:'2026-12-19', payerId:'north', ownerId:'north', shared:true }
  ];
  const opts = extra => ({ viewerId:'north', isTripOnly: id => id === 'trip', ...extra });
  const ids = rows => rows.map(row => row.id).join(',');

  check('ไม่กรองอะไรเลย → ได้ครบทุกใบ', ids(filterBills(sample, opts()).visible) === 'b1,b2,b3,b4');
  check('ไม่กรองอะไรเลย → ธง filtering เป็น false', filterBills(sample, opts()).filtering === false);

  check('กรองประเภท "ร่วม"', ids(filterBills(sample, opts({ type:'shared' })).visible) === 'b1,b4');
  check('กรอง "ของฉัน" ดูที่คนจ่าย ไม่ใช่เจ้าของยอด',
    ids(filterBills(sample, opts({ type:'mine' })).visible) === 'b1,b3,b4');
  check('กรอง "เฉพาะทริป" ดูที่เจ้าของยอด', ids(filterBills(sample, opts({ type:'trip-only' })).visible) === 'b3');

  check('🔑 ประเภท + คนจ่าย ทำงานร่วมกันแบบ "และ" ไม่ใช่ "หรือ"',
    ids(filterBills(sample, opts({ type:'shared', payerId:'north' })).visible) === 'b1,b4');
  check('🔑 ครบทั้งสามชั้นพร้อมกัน',
    ids(filterBills(sample, opts({ type:'shared', payerId:'north', date:'2026-12-19' })).visible) === 'b4');
  check('ชุดที่ตัดกันแล้วไม่เหลืออะไร → ได้อาร์เรย์ว่าง ไม่ใช่คืนทั้งหมด',
    filterBills(sample, opts({ type:'trip-only', payerId:'puii' })).visible.length === 0);

  const shared = filterBills(sample, opts({ type:'shared' }));
  check('🔑 จำนวนในตัวเลือกวันที่นับหลังกรองประเภทแล้ว ไม่ใช่นับจากบิลทั้งหมด',
    shared.dateCounts.get('2026-12-18') === 1 && shared.dateCounts.get('2026-12-19') === 1,
    JSON.stringify([...shared.dateCounts]));
  check('⚠️ ถ้านับจากบิลทั้งหมดจะได้ 2 — ยืนยันว่าไม่ได้นับแบบนั้น',
    filterBills(sample, opts()).dateCounts.get('2026-12-18') === 2);
  check('วันที่ไม่มีบิลตรงเงื่อนไขเลย ไม่โผล่ในตัวเลือก',
    !filterBills(sample, opts({ type:'trip-only' })).dates.includes('2026-12-18'),
    filterBills(sample, opts({ type:'trip-only' })).dates.join(','));

  const stale = filterBills(sample, opts({ type:'trip-only', date:'2026-12-18' }));
  check('🔑 วันที่ที่เลือกไว้แต่ตกจากเงื่อนไข ยังอยู่ในตัวเลือกพร้อมเลข 0',
    stale.dateCounts.get('2026-12-18') === 0 && stale.visible.length === 0,
    JSON.stringify([...stale.dateCounts]));
  check('⚠️ ไม่รีเซ็ตวันที่เงียบ ๆ — ผู้ใช้ต้องเห็นว่าทำไมหน้าถึงว่าง',
    stale.dates.includes('2026-12-18'));

  check('วันที่เรียงใหม่ → เก่า', filterBills(sample, opts()).dates.join(',') === '2026-12-19,2026-12-18');
  check('exceptDate ไม่ถูกกรองด้วยวันที่ (ใช้เป็นฐานนับ)',
    filterBills(sample, opts({ date:'2026-12-19' })).exceptDate.length === 4);
  check('เลือกวันอย่างเดียวก็นับว่ากำลังกรองอยู่',
    filterBills(sample, opts({ date:'2026-12-19' })).filtering === true);
  check('⚠️ ไม่แก้อาร์เรย์ต้นฉบับ', ids(sample) === 'b1,b2,b3,b4');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exit(fail ? 1 : 0);
