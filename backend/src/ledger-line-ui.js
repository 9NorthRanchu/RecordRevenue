// ═══════════════════════════════════════════════════════════════
// หน้าตาข้อความ LINE ของสมุดจด (Flex Message) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
//
//   การ์ดเดียวแยกเรื่องชัด: หัวสีตามชนิด (จ่าย/รับ/โอน/รอเลือกบัญชี) · ยอดตัวใหญ่ ·
//   แถว วันที่ / บัญชี / คู่ค้า / บันทึกช่วยจำ / หมวด · ปุ่มยืนยัน เปลี่ยนหมวด แก้ไข
//   ชื่อบัญชี/หมวดแสดงแบบไม่มีรหัส ([A02] BK KBANK → BK KBANK)
// ═══════════════════════════════════════════════════════════════

const THEME = {
  OUT: { bg: '#FF6B6B', soft: '#FFF1F1', icon: '💸', word: 'จ่ายเงิน' },
  IN: { bg: '#12B886', soft: '#E6FCF5', icon: '💰', word: 'รับเงิน' },
  TRANSFER: { bg: '#4C6EF5', soft: '#EDF2FF', icon: '🔁', word: 'โอนระหว่างบัญชี' },
  ASK: { bg: '#F59F00', soft: '#FFF9DB', icon: '🧾', word: 'สลิปใหม่' },
  DONE: { bg: '#20C997', soft: '#E6FCF5', icon: '✅', word: 'บันทึกแล้ว' },
  CASH: { bg: '#7950F2', soft: '#F3F0FF', icon: '🪙', word: 'จดเงินสด' },
};
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/* "[A02] BK KBANK" → "BK KBANK" · "[T01] Food & Beverage" → "Food & Beverage" */
export const displayName = name => String(name || '').replace(/^\s*\[[^\]]+\]\s*/, '').trim() || String(name || '');
export const moneyText = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export function thaiDate(date, time) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date || '-';
  const t = String(time || '').slice(0, 5);
  return `${Number(m[3])} ${MONTHS.at(Number(m[2]) - 1)} ${Number(m[1]) + 543}${t ? ` · ${t} น.` : ''}`;
}

const row = (label, value, opts = {}) => ({
  type: 'box', layout: 'horizontal', spacing: 'md', contents: [
    { type: 'text', text: label, size: 'sm', color: '#868E96', flex: 3 },
    { type: 'text', text: clip(value || '-', 120), size: 'sm', color: opts.color || '#212529', flex: 7, wrap: true,
      weight: opts.bold ? 'bold' : 'regular', align: 'end' },
  ],
});

const btn = (label, action, style = 'secondary', color) => ({
  type: 'button', style, height: 'sm', ...(color ? { color } : {}), action: { ...action, label: clip(label, 40) },
});
export const postback = (data, displayText) => ({ type: 'postback', data, ...(displayText ? { displayText: clip(displayText, 300) } : {}) });
export const uri = link => ({ type: 'uri', uri: link });

/* การ์ดรายการ
   kind: OUT | IN | TRANSFER | ASK | DONE | CASH · rows: [[ป้าย, ค่า, {bold,color}]] · buttons: ปุ่มเรียงลงล่าง */
export function txCard({ kind, status, amount, rows = [], note, buttons = [] }) {
  const th = THEME[kind] || THEME.OUT;
  const bubble = {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: th.bg, paddingAll: '16px', spacing: 'xs', contents: [
      { type: 'text', text: `${th.icon} ${th.word}${status ? ` · ${status}` : ''}`, color: '#FFFFFF', size: 'sm', weight: 'bold' },
      { type: 'text', text: `฿${moneyText(amount)}`, color: '#FFFFFF', size: 'xxl', weight: 'bold' },
    ] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', contents: [
      ...rows.flatMap((r, i) => [...(i ? [{ type: 'separator', color: '#F1F3F5' }] : []), row(r[0], r[1], r[2] || {})]),
      ...(note ? [{ type: 'box', layout: 'vertical', backgroundColor: th.soft, cornerRadius: '8px', paddingAll: '10px', margin: 'md',
        contents: [{ type: 'text', text: note, size: 'xs', color: '#495057', wrap: true }] }] : []),
    ] },
  };
  if (buttons.length) {
    bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: buttons };
  }
  return bubble;
}

export const flexMessage = (altText, bubble, quickItems) => ({
  type: 'flex', altText: clip(altText, 380), contents: bubble,
  ...(quickItems?.length ? { quickReply: { items: quickItems.slice(0, 13) } } : {}),
});

/* ปุ่มมาตรฐานของรายการที่รอยืนยัน */
export function confirmButtons(docId, editUrl, theme = 'OUT') {
  return [
    btn('✓ ยืนยันบันทึก', postback(`inbox|accept|${docId}`, 'ยืนยันบันทึก'), 'primary', THEME[theme]?.bg || THEME.OUT.bg),
    { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
      btn('🗂️ เปลี่ยนหมวด', postback(`inbox|cats|${docId}`, 'เปลี่ยนหมวด')),
      btn('✏️ แก้ไข', uri(editUrl)),
    ] },
    btn('ไม่ต้องบันทึก', postback(`inbox|dismiss|${docId}`, 'ไม่ต้องบันทึก'), 'link'),
  ];
}

/* ปุ่มเลือกบัญชี: ชื่อเต็มแบบไม่มีรหัส · มากสุด 6 ปุ่ม ที่เหลือไปหน้าแก้ไข (มีช่องค้นหา) */
export function accountButtons(docId, options, editUrl) {
  const list = options.slice(0, 6).map(o =>
    btn(`${o.side === 'IN' ? 'รับเข้า' : 'จ่ายจาก'} ${displayName(o.name)}`,
      postback(`inbox|account|${docId}|${o.account_id}|${o.side}`, `${o.side === 'IN' ? 'รับเข้า' : 'จ่ายจาก'} ${displayName(o.name)}`),
      'secondary'));
  return [...list,
    btn('🔎 บัญชีอื่น / แก้ไขรายละเอียด', uri(editUrl), 'link'),
    btn('ไม่ต้องบันทึก', postback(`inbox|dismiss|${docId}`, 'ไม่ต้องบันทึก'), 'link')];
}

/* ทางลัดเปลี่ยนหมวดในแชท: หมวดที่ใช้บ่อยของทิศทางนี้ + ปุ่มค้นหาหมวดอื่นในหน้าแก้ไข */
export function categoryQuickItems(docId, cats, editUrl) {
  return [
    ...cats.slice(0, 12).map(c => ({ type: 'action', action: {
      type: 'postback', label: clip(displayName(c.name), 20), data: `inbox|setcat|${docId}|${c.category_id}`,
      displayText: `หมวด: ${clip(displayName(c.name), 60)}` } })),
    { type: 'action', action: { type: 'uri', label: '🔎 หมวดอื่น…', uri: editUrl } },
  ];
}
