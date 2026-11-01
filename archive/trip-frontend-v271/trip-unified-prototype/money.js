/* ── การหารเงินและสรุปยอด — ตรรกะล้วน ไม่แตะ DOM ────────────────────────
   แยกไฟล์เพราะนี่คือ "เงินจริงของคน" ถ้าคำนวณผิดคนจะโอนผิดจริง
   ต้องเทสได้โดยไม่ต้องมีเบราว์เซอร์ → backend/test/money.test.mjs

   ทุกฟังก์ชันรับ toBaht(bill) เข้ามา ไม่ไปอ่านเรทเอง เพราะเรทผูกกับ
   "กระเป๋า" ไม่ใช่สกุลเงิน (กระเป๋าเยนสองใบที่เติมคนละวันต้นทุนต่างกัน)
   ผู้เรียกจึงเป็นคนตัดสินว่าบิลใบนี้คิดด้วยเรทไหน */

/* ยอดรวมแยกตามสกุลจริง — คนจำได้ว่าจ่ายเยนไปเท่าไร ไม่ได้จำเป็นบาท
   เรียงจากมากไปน้อยเพื่อให้สกุลหลักของทริปอยู่ซ้ายสุดเสมอ */
function totalsByCurrency(bills) {
  const map = new Map();
  bills.forEach(bill => {
    const code = bill.currency || '—';
    map.set(code, (map.get(code) || 0) + (bill.amount || 0));
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/* ใครควักเท่าไร และใครต้องรับผิดชอบเท่าไร

   paid    = เงินที่คนนั้นควักออกจากกระเป๋าจริง
   balance = (ส่วนที่ต้องรับผิดชอบ) − (ที่ควักไป)
             บวก = ยังติดคนอื่น · ลบ = ควักเกิน รอรับคืน

   ⚠️ บิลที่ไม่แชร์ ตกเป็นภาระของ **เจ้าของเงิน** (ownerId) ไม่ใช่คนจ่าย
      เพราะ North ควักแทน Puii ได้ — เงินเป็นของ Puii แต่ North เป็นคนจ่าย
      ถ้าคิดที่คนจ่าย Puii จะไม่เคยติดใครเลยทั้งที่ใช้เงินไปจริง */
function settlementRows(memberIds, bills, toBaht) {
  const paid = new Map();
  const owed = new Map();
  const add = (map, id, value) => { if (id) map.set(id, (map.get(id) || 0) + value); };

  bills.forEach(bill => {
    const thb = toBaht(bill) || 0;
    add(paid, bill.payerId, thb);

    const parts = bill.participants || [];
    if (bill.shared && parts.length) {
      /* แบ่งตามสัดส่วนที่บันทึกไว้จริง ไม่ใช่หารเท่ากันเสมอ
         คนกินเยอะจ่ายเยอะเป็นเรื่องปกติของการกินข้าวด้วยกัน
         ถ้าไม่มีการระบุสัดส่วนเลย (ทุกคนเป็น 0) จึงค่อยหารเท่า */
      const share = parts.reduce((sum, row) => sum + (row.amount || 0), 0);
      parts.forEach(row => add(owed, row.memberId,
        share > 0 ? thb * (row.amount || 0) / share : thb / parts.length));
    } else {
      add(owed, bill.ownerId || bill.payerId, thb);
    }
  });

  return memberIds.map(id => ({
    memberId: id,
    paid: paid.get(id) || 0,
    balance: (owed.get(id) || 0) - (paid.get(id) || 0)
  }));
}

/* จับคู่ลูกหนี้กับเจ้าหนี้ให้เกิดรายการโอนน้อยที่สุด

   ไล่จากคนที่ติดมากสุดไปหาคนที่ควักเกินมากสุด — คน 4 คนที่ต่างคนต่างจ่าย
   ถ้าให้ทุกคนโอนหาทุกคนจะได้ 12 รายการ แต่วิธีนี้เหลือ 2–3 รายการ
   ซึ่งเป็นเรื่องใหญ่ของจริงตอนนั่งเคลียร์เงินกันหลังจบทริป

   EPSILON = 1 บาท · เศษต่ำกว่านี้ไม่คุ้มโอน และมักเกิดจากการปัดทศนิยม */
const SETTLE_EPSILON = 1;

function planTransfers(rows) {
  const debtors = rows.filter(row => row.balance > SETTLE_EPSILON)
    .map(row => ({ ...row })).sort((a, b) => b.balance - a.balance);
  const payees = rows.filter(row => row.balance < -SETTLE_EPSILON)
    .map(row => ({ ...row, balance: -row.balance })).sort((a, b) => b.balance - a.balance);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < payees.length) {
    const amount = Math.min(debtors[i].balance, payees[j].balance);
    transfers.push({ from: debtors[i].memberId, to: payees[j].memberId, amount });
    debtors[i].balance -= amount;
    payees[j].balance -= amount;
    if (debtors[i].balance <= SETTLE_EPSILON) i += 1;
    if (payees[j].balance <= SETTLE_EPSILON) j += 1;
  }
  return transfers;
}

/* รวมยอดตามหมวด — คืนทั้งยอดบาทและยอดสกุลจริง
   convertible = มีอย่างน้อยหนึ่งบิลในหมวดนี้ที่ตีเป็นบาทได้
   หมวดที่ convertible = false ต้องแสดง "—" ไม่ใช่ "฿ 0"
   เพราะ ฿0 แปลว่าไม่ได้ใช้เงิน ซึ่งคนละเรื่องกับ "ใช้แล้วแต่ตีมูลค่าไม่ได้" */
function categoryTotals(bills, toBaht, canConvert) {
  const groups = new Map();
  bills.forEach(bill => {
    const lines = bill.categories?.length
      ? bill.categories
      : [{ name: 'อื่น ๆ', icon: '', amount: bill.amount }];
    // บาทต่อหนึ่งหน่วยของสกุลนั้น — ใช้เกลี่ยยอดบาทลงแต่ละบรรทัดหมวด
    const perUnit = bill.amount ? (toBaht(bill) || 0) / bill.amount : 0;
    const ok = canConvert(bill);
    lines.forEach(line => {
      const key = line.name || 'อื่น ๆ';
      const row = groups.get(key)
        || { name: key, icon: line.icon || '', thb: 0, native: new Map(), convertible: false };
      row.icon = row.icon || line.icon || '';
      row.thb += (line.amount || 0) * perUnit;
      row.native.set(bill.currency, (row.native.get(bill.currency) || 0) + (line.amount || 0));
      if (ok) row.convertible = true;
      groups.set(key, row);
    });
  });
  return [...groups.values()].sort((a, b) => b.thb - a.thb);
}

/* เรียงล็อตเติมเงิน ใหม่ → เก่า ตาม "วันที่ที่เกิดขึ้นจริง"
   ไม่ใช่ลำดับที่บันทึกลงระบบ — คนมักลืมจดแล้วมาใส่ย้อนหลังทีหลัง
   id ใช้ตัดสินเมื่อวันที่ชนกัน (มี timestamp อยู่ในตัว) */
function sortLotsNewestFirst(lots) {
  return [...lots].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.id || '').localeCompare(String(a.id || '')));
}

/* เรทเฉลี่ยถ่วงน้ำหนักของกระเป๋าใบหนึ่ง = บาทที่จ่ายรวม ÷ เงินต่างประเทศที่ได้รวม

   🔴 ไม่ใช่ค่าเฉลี่ยของเรทแต่ละครั้ง — เงินก้อนใหญ่ต้องมีน้ำหนักมากกว่า
      เติม ¥100,000 ที่ 0.23 กับ ¥50,000 ที่ 0.25 → 0.2367 ไม่ใช่ 0.24

   ⚠️ ผลลัพธ์ไม่ขึ้นกับลำดับของล็อต (เป็นผลรวมหารผลรวม) การบันทึกย้อนหลัง
      จึงไม่ทำให้ตัวเลขเก่าเพี้ยน — แต่ต้องมีเทสยืนยัน ไม่ใช่เชื่อว่าจริง
   คืน null เมื่อยังไม่มีล็อตเลย ให้ผู้เรียกตัดสินใจ ไม่ใช่เดาเรทให้ */
function weightedRate(lots) {
  if (!lots.length) return null;
  const foreign = lots.reduce((sum, lot) => sum + (lot.foreign || 0), 0);
  if (!foreign) return null;
  return lots.reduce((sum, lot) => sum + (lot.thb || 0), 0) / foreign;
}

/* ── ตัวกรองรายการบิลสามชั้น (2026-08-22) ─────────────────────────────
   ประเภท · คนจ่าย · วันที่ — ทำงานร่วมกันแบบ "และ" ทั้งหมด

   🔴 จำนวนที่เขียนกำกับในตัวเลือกวันที่ ต้องนับ "หลังกรองประเภทและคนจ่ายแล้ว"
      ไม่ใช่นับจากบิลทั้งหมด · เดิมนับผิด จึงขึ้น "2 รายการ" ทั้งที่เลือก
      "ค่าใช้จ่ายร่วม" ไว้แล้ววันนั้นไม่มีบิลร่วมเลย — กดแล้วได้หน้าว่าง
      โดยมีตัวเลขที่ดูน่าเชื่อถือยืนยันว่ามีของ ซึ่งแย่กว่าไม่บอกอะไรเลย

   แยกออกมาเป็นตรรกะล้วนเพื่อให้เทสได้โดยไม่ต้องมีเบราว์เซอร์ */
function filterBills(bills, options) {
  const { type = 'all', payerId = '', date = '', viewerId = '', isTripOnly = () => false } = options || {};

  const byType = bill => {
    if (type === 'shared') return Boolean(bill.shared);
    if (type === 'mine') return bill.payerId === viewerId;
    if (type === 'trip-only') return isTripOnly(bill.ownerId);
    return true;
  };

  // ผ่านทุกชั้น "ยกเว้นวันที่" — ใช้เป็นฐานนับของตัวเลือกวันที่
  const exceptDate = bills.filter(byType).filter(bill => !payerId || bill.payerId === payerId);
  const visible = exceptDate.filter(bill => !date || bill.date === date);

  const dateCounts = new Map();
  exceptDate.forEach(bill => {
    if (bill.date) dateCounts.set(bill.date, (dateCounts.get(bill.date) || 0) + 1);
  });
  /* วันที่ถูกเลือกไว้แต่ตกจากรายการเพราะตัวกรองอื่น ยังต้องอยู่ในตัวเลือก
     พร้อมเลข 0 — ดีกว่ารีเซ็ตเงียบ ๆ เพราะผู้ใช้จะได้เห็นว่าทำไมหน้าถึงว่าง */
  if (date && !dateCounts.has(date)) dateCounts.set(date, 0);

  return {
    exceptDate,
    visible,
    dateCounts,
    dates: [...dateCounts.keys()].sort().reverse(),
    filtering: type !== 'all' || Boolean(payerId) || Boolean(date)
  };
}

if (typeof module !== 'undefined') {
  module.exports = { totalsByCurrency, settlementRows, planTransfers, categoryTotals,
    sortLotsNewestFirst, weightedRate, filterBills, SETTLE_EPSILON };
}
