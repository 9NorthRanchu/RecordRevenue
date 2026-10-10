// ═══════════════════════════════════════════════════════════════
// เครื่องจับคู่ของสมุดจด — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล ทดสอบได้ตรง ๆ
//
//   กติกาเครื่องหมาย (ตรงกับข้อมูลจริง 14,143 รายการ):
//     ยอดหัว (total_amount) = Σ ยอดย่อย − ค่าธรรมเนียม − Σ หัก ณ ที่จ่าย
//     เงินออกเป็นลบ เงินเข้าเป็นบวก · ยอดย่อยเครื่องหมายเดียวกับยอดหัว
//     ค่าธรรมเนียมเก็บเป็นบวกเสมอ · หัก ณ ที่จ่ายเครื่องหมายเดียวกับยอดย่อย
//     (ตรวจจากข้อมูลจริง: รายจ่าย -9,990 หัก -280.09 → ยอดหัว -9,709.91)
// ═══════════════════════════════════════════════════════════════

export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* ชื่อธนาคารบนสลิปมีได้หลายแบบ (ไทย/อังกฤษ/ย่อ) → รหัสเดียว */
const BANK_ALIASES = [
  ['KBANK', ['kbank', 'kasikorn', 'กสิกร', 'k plus', 'k+', 'kplus']],
  ['SCB', ['scb', 'ไทยพาณิชย์', 'siam commercial']],
  ['KTB', ['ktb', 'กรุงไทย', 'krungthai', 'krung thai']],
  ['BBL', ['bbl', 'กรุงเทพ', 'bangkok bank', 'bualuang']],
  ['BAY', ['bay', 'กรุงศรี', 'krungsri', 'krung sri', 'ayudhya']],
  ['KKP', ['kkp', 'เกียรตินาคิน', 'kiatnakin']],
  ['GHB', ['ghb', 'อาคารสงเคราะห์', 'ธอส']],
  ['GSB', ['gsb', 'ออมสิน']],
  ['TTB', ['ttb', 'ทหารไทย', 'tmb', 'ธนชาต', 'thanachart']],
  ['TRUEMONEY', ['truemoney', 'true money', 'ทรูมันนี่', 'true wallet']],
  ['CASH', ['cash', 'เงินสด']],
];
export function bankKey(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return '';
  for (const [key, words] of BANK_ALIASES) if (words.some(w => t.includes(w))) return key;
  return t.replace(/[^a-z0-9ก-๙]/g, '').toUpperCase().slice(0, 16);
}

/* เลขบัญชีบนสลิปมักถูกปิดบางส่วน (xxx-x-x1234-x) → เอาเลขที่มองเห็นท้ายสุด 4 ตัว */
export function last4(text) {
  const digits = String(text || '').replace(/[^0-9]/g, '');
  return digits.length >= 3 ? digits.slice(-4) : '';
}

export const accountHintKey = (bank, account) => {
  const b = bankKey(bank), l = last4(account);
  return b && l ? `${b}|${l}` : '';
};

/* ชื่อคู่ค้า → คีย์สำหรับจำ (ตัดคำนำหน้า ช่องว่าง จุด) */
export function partyKey(name) {
  return String(name || '').toLowerCase()
    .replace(/^(นาย|นาง|นางสาว|น\.ส\.|mr\.?|mrs\.?|ms\.?|miss|บจก\.?|บริษัท|หจก\.?|ร้าน)\s*/u, '')
    .replace(/(จำกัด|\(มหาชน\)|co\.?,?\s*ltd\.?|limited)/gu, '')
    .replace(/[\s.,'"()\-_/]+/g, '')
    .slice(0, 40);
}

/* ข้อความเงินสดจาก LINE/แอป
     "กาแฟ 65" · "65 กาแฟ" · "ข้าวมันไก่ 50 kbank" · "เงินสด + กินข้าว + 50" (รูปแบบเดิม)
   คืน null ถ้าไม่ใช่ข้อความจดเงิน (เช่น "วันนี้" ที่เป็นคำสั่งสรุป) */
export function parseCashText(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 120) return null;
  const num = s => parseFloat(String(s).replace(/,/g, ''));
  if (raw.includes('+')) {
    const parts = raw.split('+').map(s => s.trim()).filter(Boolean);
    const amount = num(parts[parts.length - 1]);
    if (parts.length < 2 || !(amount > 0)) return null;
    return { amount: round2(amount), note: parts.length > 2 ? parts.slice(1, -1).join(' ') : '', accountHint: parts[0] };
  }
  const m = raw.match(/^(.*?)(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|บ\.|฿)?(.*)$/u);
  if (!m) return null;
  const amount = num(m[2]);
  const before = m[1].trim(), after = m[3].trim();
  if (!(amount > 0)) return null;
  if (!before && !after) return null;                // ตัวเลขเปล่า ๆ ไม่รู้ว่าค่าอะไร
  // "65 กาแฟ" → note อยู่ข้างหลัง · "ข้าว 50 kbank" → คำท้ายที่เป็นชื่อธนาคาร/บัญชี = บัญชี
  let note = before || after, accountHint = '';
  if (before && after) {
    if (bankKey(after) && BANK_ALIASES.some(([k]) => k === bankKey(after))) accountHint = after;
    else note = `${before} ${after}`;
  }
  return { amount: round2(amount), note: note.trim(), accountHint };
}

/* ทิศทางของสลิป จากบัญชีของเราที่ระบุได้ฝั่งผู้โอน/ผู้รับ */
export function slipDirection(fromAccountId, toAccountId) {
  if (fromAccountId && toAccountId) return 'TRANSFER';
  if (fromAccountId) return 'OUT';
  if (toAccountId) return 'IN';
  return 'UNKNOWN';
}

const dayDiff = (a, b) => Math.abs((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 864e5);
const minutes = t => {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/* คะแนนความเป็นคู่กันของหลักฐาน 1 ชิ้นกับรายการที่มีอยู่
   (ยอดต้องเท่ากันเป๊ะก่อน ไม่งั้นได้ 0 — ค่าธรรมเนียมคิดไว้ในยอดที่ส่งมาแล้ว) */
export function scoreCandidate(ev, tx) {
  if (Math.abs(round2(tx.total_amount) - round2(ev.signedAmount)) > 0.005) return 0;
  if (ev.ref && tx.ref_code && String(tx.ref_code).trim() === String(ev.ref).trim()) return 100;
  const d = dayDiff(ev.date, tx.date);
  if (!(d <= 2)) return 0;
  if (d === 0) {
    const a = minutes(ev.time), b = minutes(tx.time || String(tx.date).slice(11));
    if (a != null && b != null && Math.abs(a - b) <= 10) return 90;
    return 70;
  }
  return d <= 1 ? 50 : 35;
}

/* ตัดสินจากผู้สมัครทั้งหมด:
     auto   = มีตัวเดียวที่คะแนน ≥ 70 และนำห่างตัวที่สอง ≥ 20 → จับคู่ให้เลย
     choose = มีหลายตัวสูสี → ให้คนเลือก
     none   = ไม่มีคู่ → สร้างรายการใหม่ */
export function decideMatch(candidates) {
  const list = candidates.filter(c => c.score > 0 && !c.linked).sort((a, b) => b.score - a.score);
  if (!list.length) return { kind: 'none', list: [] };
  const [first, second] = list;
  if (first.score >= 70 && (!second || first.score - second.score >= 20)) return { kind: 'auto', best: first, list };
  return { kind: 'choose', list: list.slice(0, 5) };
}

/* ตรวจยอด: หัว = Σย่อย − Σfee − Σwht (ปัดทศนิยม 2 ตำแหน่ง) */
export function balanceGap(total, details) {
  const sum = (details || []).reduce((s, d) => s + (Number(d.amount) || 0) - (Number(d.fee) || 0) - (Number(d.wht) || 0), 0);
  return round2(round2(total) - round2(sum));
}

/* เสนอบรรทัดย่อยสำหรับเงินก้อนใหม่
     template = แบบที่จำไว้ของคู่ค้านี้ { lines:[{category_id, entity_id, contact_id, type, amount, wht, share, wht_rate, note}] }
   1) แบบเดิมรวมแล้วเท่ายอดพอดี → ใช้ตามนั้นทุกบรรทัด (ลูกค้าจ่ายค่าบริการประจำ)
   2) ไม่เท่า → แบ่งตามสัดส่วนเดิม แล้วถอดหัก ณ ที่จ่ายกลับ (gross-up) ให้ยอดลงตัว
   3) ไม่มีแบบ → บรรทัดเดียวตามค่าตั้งต้น */
export function proposeLines({ total, fee = 0, template, fallback }) {
  const sign = total < 0 ? -1 : 1;
  fee = round2(Math.abs(fee));
  const clean = l => ({ category_id: l.category_id, entity_id: l.entity_id || null, contact_id: l.contact_id || null,
    type: l.type, note: l.note || '' });
  const lines = template?.lines?.length ? template.lines : null;
  // Σnet (ยอดหลังหักภาษีของทุกบรรทัด) ที่ต้องได้ — เงินเข้า: total + fee · เงินออก: |total| − fee
  const netNeeded = sign > 0 ? round2(total + fee) : round2(Math.abs(total) - fee);
  if (lines) {
    const exact = lines.map((l, i) => ({ ...clean(l), amount: round2(sign * Math.abs(l.amount || 0)),
      wht: round2(sign * Math.abs(l.wht || 0)), fee: i === 0 ? fee : 0 }));
    if (Math.abs(balanceGap(total, exact)) < 0.005) return { lines: exact, how: 'template-exact' };
    const shares = lines.map(l => Number(l.share) || 0);
    const shareSum = shares.reduce((x, y) => x + y, 0) || 1;
    const out = lines.map((l, i) => {
      const rate = Math.min(Math.max(Number(l.wht_rate) || 0, 0), 0.15);
      const gross = round2(netNeeded * (shares[i] / shareSum) / (1 - rate));
      return { ...clean(l), amount: round2(sign * gross), wht: round2(sign * gross * rate), fee: i === 0 ? fee : 0 };
    });
    out[0].amount = round2(out[0].amount + balanceGap(total, out));   // เศษสตางค์จากการปัดเข้าบรรทัดแรก
    return { lines: out, how: 'template-scaled' };
  }
  return { lines: [{ ...fallback, amount: round2(sign * netNeeded), fee, wht: 0 }], how: 'fallback' };
}

/* สร้างแบบจำ (template) จากบรรทัดที่คนยืนยันแล้ว */
export function templateFromDetails(details) {
  const ds = (details || []).filter(d => Number(d.amount));
  const gross = ds.reduce((s, d) => s + Math.abs(Number(d.amount)), 0) || 1;
  return {
    lines: ds.map(d => ({
      category_id: d.category_id, entity_id: d.entity_id || null, contact_id: d.contact_id || null,
      type: d.type, note: d.note || '',
      amount: round2(Math.abs(Number(d.amount))), wht: round2(Math.abs(Number(d.wht) || 0)),
      share: Math.round(Math.abs(Number(d.amount)) / gross * 1e6) / 1e6,
      wht_rate: Math.abs(Number(d.amount)) ? Math.round(Math.abs(Number(d.wht) || 0) / Math.abs(Number(d.amount)) * 1e4) / 1e4 : 0,
    })),
  };
}

// ───────────────────────── Statement (ระยะ 2) ─────────────────────────

/* เครื่องหมายของแต่ละบรรทัดใน statement — เชื่อ "ยอดคงเหลือ" มากกว่าที่ AI เดาว่าเข้า/ออก
   (ปัญหาเดิมของการนำเข้า: AI ใส่เข้า/ออกสลับ ยอดในระบบเลยกลับเครื่องหมาย)
   lines: [{ amount (บวก=เข้า ลบ=ออก ตามที่ AI อ่าน), balance (ยอดคงเหลือหลังรายการ หรือ null) }]
   คืน { lines (แก้เครื่องหมายแล้ว), flipped: จำนวนที่กลับ, opening, closing, sum, gap }
   gap ≠ 0 = ผลรวมไม่เท่ากับ (ยอดปิด − ยอดยกมา) → AI อาจอ่านตกหรืออ่านเกินบางบรรทัด */
export function fixStatementSigns(lines, opening = null, closing = null) {
  const out = (lines || []).map(l => ({ ...l, amount: round2(l.amount), balance: l.balance == null || l.balance === '' ? null : round2(l.balance) }));
  let prev = opening == null || opening === '' ? null : round2(opening);
  if (prev == null && out.length && out[0].balance != null) prev = round2(out[0].balance - out[0].amount);
  const startBalance = prev;
  let flipped = 0;
  for (const l of out) {
    if (l.balance != null && prev != null) {
      const diff = round2(l.balance - prev);
      if (Math.abs(Math.abs(diff) - Math.abs(l.amount)) < 0.01 && Math.sign(diff) !== Math.sign(l.amount) && diff !== 0) {
        l.amount = diff; flipped++;
      } else if (!l.amount && diff) l.amount = diff;
    }
    prev = l.balance != null ? l.balance : (prev == null ? null : round2(prev + l.amount));
  }
  const sum = round2(out.reduce((s, l) => s + l.amount, 0));
  const end = closing == null || closing === '' ? (out.length ? out[out.length - 1].balance : null) : round2(closing);
  const gap = startBalance != null && end != null ? round2(end - startBalance - sum) : null;
  return { lines: out, flipped, opening: startBalance, closing: end, sum, gap };
}

/* คีย์จำคู่ค้าจากคำอธิบายใน statement ("TR fr 123-4-56789 นาย ก" → "นายก" ไม่สนตัวเลข/รหัส) */
export function statementPartyKey(desc) {
  const s = String(desc || '').toLowerCase()
    .replace(/x{2,}[\dx-]*/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\b(tr|trf|transfer|fr|from|to|ref|promptpay|pp|mobile|internet|atm|k plus|kplus|scb easy|online)\b/g, ' ');
  const t = s.replace(/(โอนเงิน|รับโอน|โอนออก|ถอนเงิน|ฝากเงิน|ชำระเงิน|ชำระ|หักบัญชี|พร้อมเพย์|เพื่อ)/g, ' ')
    .replace(/(^|\s)x+(?=\s|$)/g, ' ').replace(/[\s.,:;'"()\-_/]+/g, ' ').trim();
  return partyKey(t).slice(0, 40);
}

/* จับคู่บรรทัด statement กับรายการที่มีในบัญชีเดียวกัน (ยอดเท่ากันเป๊ะ · วันห่างไม่เกิน 2 วัน · หรือเลขอ้างอิงตรง)
   เลือกคู่ที่คะแนนสูงสุดก่อนทั้งฉบับ (ยอดซ้ำกันหลายรายการ → คู่ที่วัน/เวลาใกล้กว่าได้ก่อน)
   คืน Map(key → { transaction_id, score }) */
export function matchStatementLines(lines, txs) {
  // จัดกลุ่มตามยอดก่อน — เทียบเฉพาะยอดเดียวกัน (Workers แผนฟรีมีเวลา CPU น้อย)
  const byAmount = new Map(), byRef = new Map();
  for (const tx of txs || []) {
    const k = round2(tx.total_amount).toFixed(2);
    if (!byAmount.has(k)) byAmount.set(k, []);
    byAmount.get(k).push(tx);
    if (tx.ref_code) byRef.set(String(tx.ref_code).trim(), tx);
  }
  const pairs = [];
  for (const l of lines || []) {
    const ev = { date: l.date, time: l.time, ref: l.ref_code, signedAmount: l.amount };
    const pool = [...(byAmount.get(round2(l.amount).toFixed(2)) || [])];
    const r = l.ref_code && byRef.get(String(l.ref_code).trim());
    if (r && !pool.includes(r)) pool.push(r);
    for (const tx of pool) {
      const score = scoreCandidate(ev, tx);
      if (score >= 35) pairs.push({ key: l.key, tx: tx.transaction_id, score, gap: dayDiff(l.date, tx.date) });
    }
  }
  pairs.sort((a, b) => (b.score - a.score) || (a.gap - b.gap));
  const usedLine = new Set(), usedTx = new Set(), out = new Map();
  for (const p of pairs) {
    if (usedLine.has(p.key) || usedTx.has(p.tx)) continue;
    usedLine.add(p.key); usedTx.add(p.tx);
    out.set(p.key, { transaction_id: p.tx, score: p.score });
  }
  return out;
}
