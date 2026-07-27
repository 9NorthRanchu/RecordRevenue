/* ═══════════════════════════════════════════════════════════════════════
   ทดสอบโหมดข้อมูลจริง (?live=1) ด้วยเบราว์เซอร์จริง

     npm i -D playwright && npx playwright install chromium
     node frontend/trip-unified-prototype/live-mode.test.mjs

   เสิร์ฟไฟล์ prototype เอง + API ปลอมที่คืน "รูปเดียวกับของจริง"
   **ไม่ยิงฐานจริงเลย** จึงรันซ้ำได้ตลอดโดยไม่แตะข้อมูลใคร

   ตั้งค่าเพิ่มได้ด้วย env ถ้าจำเป็น:
     CHROME_PATH=/path/to/chrome   ระบุ browser เอง (ปกติไม่ต้อง)
     PORT=8099                     เปลี่ยนพอร์ตถ้าชนกับอย่างอื่น
   ═══════════════════════════════════════════════════════════════════════ */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/* รับได้ทั้ง playwright เต็มตัวและ playwright-core เพื่อให้รันได้ทั้งบนเครื่อง
   ที่ลงปกติและใน CI ที่ลงแบบบาง */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }

// path ต้องอิงจากตำแหน่งไฟล์นี้ ไม่ใช่ค่าคงที่ ไม่งั้นย้ายเครื่องแล้วรันไม่ได้
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8099);
const BASE = `http://localhost:${PORT}`;

// API ปลอมที่คืนรูปเดียวกับของจริง เพื่อทดสอบหน้าจอโดยไม่แตะฐานจริง
const PAYLOAD = {
  trip: { project_id:'TRP-9', name:'Hokkaido 2026', end_date:'2026-12-27', closed:false,
          posting_date:'', banner_url:'', status:'active' },
  viewer: { member_id:'TM-1', display_name:'North', is_admin:1, ledger_mode:'MAIN' },
  members: [
    { member_id:'TM-1', display_name:'North', ledger_mode:'MAIN', role:'ผู้ดูแล', is_admin:1 },
    { member_id:'TM-2', display_name:'Puii',  ledger_mode:'TRIP_ONLY', role:'สมาชิก', is_admin:0 }
  ],
  currencies: [
    { code:'THB', symbol:'฿', label:'บาทไทย', plan_rate:1, is_base:1, icon_url:null },
    { code:'JPY', symbol:'¥', label:'เยนญี่ปุ่น', plan_rate:0.23, is_base:0, icon_url:null }
  ],
  wallets: [{
    wallet_id:'W-1', name:'เงินสดเยน', currency:'JPY', owner_member_id:'TM-1',
    icon_url:'wallet_classic.svg', locked_rate:null,
    fundings:[{ funding_id:'F-1', wallet_id:'W-1', funding_date:'2026-12-17',
                thb_amount:2340, foreign_amount:10000, note:'แลกที่สนามบิน' }],
    funded_foreign:10000, funded_thb:2340, spent_foreign:5000, leftover_foreign:5000,
    rate:0.234, rate_source:'actual'
  }],
  expenses: [{
    trip_expense_id:'TE-1', note:'ราเมงซัปโปโร', amount_foreign:5000, currency_code:'JPY',
    member_id:'TM-1', owner_member_id:'TM-1', wallet_id:'W-1', expense_date:'2026-12-18',
    visibility:'TRIP', is_shared:1, split_mode:'EQUAL',
    categories:[{ label:'อาหาร', amount_foreign:5000 }],
    participants:[{ member_id:'TM-1', amount_foreign:2500 },{ member_id:'TM-2', amount_foreign:2500 }],
    rate:0.234, rate_source:'actual', amount_thb_computed:1170
  }],
  stops: [], presence: [], closures: [],
  ledger: { net_thb: 0, net_trip_only_thb: 0 },
  meta: { viewer_is_admin:true, hidden_expense_count:2 }
};

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };

const posted = [];   // เก็บ body ที่หน้าจอส่งมา ไว้ตรวจว่าแมปฟิลด์ถูกไหม
let failNextWrite = null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/unified-trip/expenses' && req.method === 'POST') {
    let raw = '';
    req.on('data', c => { raw += c; });
    return req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      posted.push(body);
      if (failNextWrite) {
        res.writeHead(400, { 'Content-Type':'application/json' });
        return res.end(JSON.stringify({ error: failNextWrite }));
      }
      // จำลองว่าเซิร์ฟเวอร์เป็นคนหารและเกลี่ยเศษ — หน้าจอต้องใช้ผลนี้ ไม่ใช่ของตัวเอง
      PAYLOAD.expenses = [...PAYLOAD.expenses, {
        trip_expense_id:'TE-NEW', note: body.note, amount_foreign: body.amount_foreign,
        currency_code: body.currency_code, member_id: body.member_id,
        owner_member_id: body.owner_member_id, wallet_id: body.wallet_id,
        expense_date: body.expense_date, visibility: body.visibility,
        is_shared: body.is_shared ? 1 : 0, split_mode: body.split_mode,
        categories: (body.categories||[]).map(c => ({ label:c.label, amount_foreign:c.amount_foreign })),
        participants: [{ member_id:'TM-1', amount_foreign:333.34 },
                       { member_id:'TM-2', amount_foreign:333.33 }],
        rate:0.234, rate_source:'actual'
      }];
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ ok:true, trip_expense_id:'TE-NEW', created:true,
        residual: 0.01, residual_member_id:'TM-1', rate:0.234, rate_source:'actual' }));
    });
  }
  if (url.pathname === '/api/unified-trip') {
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify(PAYLOAD));
  }
  if (url.pathname === '/api/fail') {
    res.writeHead(404, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify({ error:'ไม่พบทริปนี้ หรือไม่มีสิทธิ์เข้าถึง' }));
  }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  const parent = path.resolve(ROOT, '..');
  const alt = path.join(parent, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
  const target = existsSync(file) ? file : (existsSync(alt) ? alt : null);
  if (!target) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
});
await new Promise(r => server.listen(PORT, r));

/* ปกติไม่ต้องระบุ browser — playwright หาเองได้ · CHROME_PATH มีไว้เผื่อ
   สภาพแวดล้อมที่ลง browser ไว้คนละที่เท่านั้น */
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

let pass = 0, fail = 0;
const check = (name, cond, detail='') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
};

console.log('\n── โหมดปกติ (ไม่ใส่ ?live) ─────────────────────');
await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(600);
check('ไม่มีแถบข้อมูลจริง', await page.locator('#liveBar').count() === 0);
check('ยังเห็นบิลตัวอย่าง', (await page.locator('.bill-card, .expense-card, [data-bill-id]').count()) > 0
  || (await page.textContent('body')).includes('Hotel Sounkyo'));
check('ปุ่มเพิ่มค่าใช้จ่ายยังกดได้', !(await page.locator('.add-expense').first().isDisabled()));

console.log('\n── โหมดข้อมูลจริง ──────────────────────────────');
await page.goto(`${BASE}/index.html?live=1&projectId=TRP-9&userId=9North&api=${BASE}`,
  { waitUntil:'domcontentloaded' });
await page.waitForSelector('#liveBar.live-bar--live', { timeout: 5000 });
const bar = await page.textContent('#liveBar');
check('แถบแดงบอกว่าเป็นข้อมูลจริง', bar.includes('ข้อมูลจริง'), bar);
check('แถบบอกชื่อทริปจริง', bar.includes('Hokkaido 2026'), bar);
check('แถบบอกจำนวนบิลที่ถูกซ่อน', bar.includes('ซ่อนจากคุณ 2'), bar);
check('แถบเดิมที่เขียนว่า "ข้อมูลจำลอง" ถูกแก้ ไม่ขัดกับความจริง',
  !(await page.textContent('.prototype-note')).includes('ข้อมูลจำลอง'),
  await page.textContent('.prototype-note'));

const body = await page.textContent('body');
check('เห็นบิลจากฐาน', body.includes('ราเมงซัปโปโร'));
check('ไม่มีบิลตัวอย่างหลงเหลือ', !body.includes('Hotel Sounkyo'));
check('เห็นกระเป๋าจากฐาน', body.includes('เงินสดเยน'));
check('เห็นสมาชิกจากฐาน', body.includes('Puii'));
check('ไม่มีสมาชิกตัวอย่างหลงเหลือ', !body.includes('Ann') && !body.includes('Mew'));

check('ปุ่มเพิ่มค่าใช้จ่ายเปิดให้เขียนแล้ว', !(await page.locator('.add-expense').first().isDisabled()));
check('ปุ่มเพิ่มกระเป๋าถูกล็อก', await page.locator('#addWallet').isDisabled());
check('ปุ่มเพิ่มสกุลเงินถูกล็อก', await page.locator('#addCurrency').isDisabled());
const note = await page.locator('.trip-locked-note').first().innerText();
check('ป้ายบอกเหตุผลถูกต้อง ไม่ใช่ "ทริปปิดแล้ว"',
  note.includes('โหมดข้อมูลจริง') && !note.includes('ทริปนี้ปิดแล้ว'), note);
check('ป้ายบอกชัดว่าส่วนไหนเขียนได้ ส่วนไหนยังไม่ได้',
  note.includes('บันทึกบิล') && note.includes('กระเป๋า'), note);

// เช็คด้วยค่าที่มีเฉพาะในข้อมูลจริงเท่านั้น ไม่ใช่ค่าที่ข้อมูลตัวอย่างก็มี
check('ไม่เขียนข้อมูลจริงลง localStorage',
  await page.evaluate(() => {
    const raw = localStorage.getItem('unified-trip-prototype') || '';
    return !raw.includes('ราเมงซัปโปโร') && !raw.includes('W-1') && !raw.includes('TM-1');
  }));

// เรทต้องมาจากล็อตจริง 2340/10000 = 0.234 ไม่ใช่ plan 0.23
check('เรทคำนวณจากล็อตจริง (0.234) ไม่ใช่เรทประมาณการ',
  await page.evaluate(() => Math.abs(walletRate('W-1') - 0.234) < 1e-9));
check('ผู้ใช้ที่กำลังดูคือสมาชิกจริงในทริป', await page.evaluate(() => viewerId) === 'TM-1');

console.log('\n── เขียนบิลลงฐานจริง ───────────────────────────');
/* กรอกฟอร์มให้ครบทั้ง 3 ขั้น เหมือนคนใช้จริง
   ต้องเลือก .add-expense ที่มองเห็นอยู่ ไม่ใช่ตัวแรกใน DOM เพราะปุ่มนี้มี
   อยู่หลายหน้าจอ ตัวที่ซ่อนอยู่จะกดไม่ได้ */
async function fillBill(amount, title) {
  await page.locator('.add-expense:visible').first().click();
  await page.waitForTimeout(250);
  await page.fill('#expenseAmount', String(amount));
  await page.fill('#expenseDescription', title);
  await page.locator('.sheet-step.active .next-step').click();      // → ขั้นหมวด
  await page.waitForTimeout(200);
  await page.locator('#splitRows .split-row .category-amount').first().fill(String(amount));
  await page.locator('.sheet-step.active .next-step').click();      // → ขั้นแบ่งจ่าย
  await page.waitForTimeout(250);
}

await fillBill(1000, 'บิลทดสอบเขียน');
check('ปุ่มบันทึกกดได้เมื่อกรอกครบ', !(await page.locator('#saveExpense').isDisabled()));
await page.locator('#saveExpense').click();
await page.waitForTimeout(700);

check('ยิง POST ขึ้นเซิร์ฟเวอร์จริง', posted.length === 1, JSON.stringify(posted));
const sent = posted[0] || {};
check('แมปยอดถูก', sent.amount_foreign === 1000, JSON.stringify(sent));
check('แมปสกุลถูก', sent.currency_code === 'JPY', sent.currency_code);
check('visibility ถูกแปลงเป็นตัวใหญ่', /^[A-Z]+$/.test(sent.visibility || ''), sent.visibility);
check('split_mode ถูกแปลงเป็นตัวใหญ่', /^[A-Z]+$/.test(sent.split_mode || ''), sent.split_mode);
check('ใช้ member_id จริงจากฐาน ไม่ใช่ id ของข้อมูลตัวอย่าง',
  String(sent.owner_member_id).startsWith('TM-'), sent.owner_member_id);
check('ไม่ส่งยอดผู้ร่วมจ่ายเมื่อหารเท่ากัน (ให้เซิร์ฟเวอร์คิด)',
  (sent.participants || []).every(p => p.amount_foreign === undefined), JSON.stringify(sent.participants));
check('ไม่ส่ง trip_expense_id ตอนสร้างใหม่', sent.trip_expense_id === undefined, String(sent.trip_expense_id));

const afterWrite = await page.textContent('body');
check('บิลใหม่ขึ้นบนจอหลังบันทึก', afterWrite.includes('บิลทดสอบเขียน'));
check('ใช้ยอดที่เซิร์ฟเวอร์เกลี่ยเศษแล้ว ไม่ใช่ที่หน้าจอคิดเอง',
  await page.evaluate(() => {
    const bill = bills.find(b => b.id === 'TE-NEW');
    return bill && bill.participants.some(p => p.amount === 333.34);
  }));
check('บอกผู้ใช้ว่าเศษไปตกที่ใคร',
  (await page.locator('.toast, #toast, [class*=toast]').first().textContent().catch(() => '')).includes('เศษ'),
  await page.locator('.toast, #toast, [class*=toast]').first().textContent().catch(() => '-'));

console.log('\n── console (เฉพาะเส้นทางที่ควรสำเร็จ) ───────────────────────');
{
  const real = errors.filter(e => !/favicon/.test(e));
  check('ไม่มี error ใน console', real.length === 0, real.join(' | '));
  errors.length = 0;   // เฟสถัดไปตั้งใจให้ล้มเหลว จึงนับแยก
}

// เซิร์ฟเวอร์ปฏิเสธ → ต้องไม่ปิดฟอร์ม และต้องโชว์เหตุผลจากเซิร์ฟเวอร์ตามจริง
failNextWrite = 'ยอดหมวดรวม 900 ไม่เท่ากับยอดบิล 1000';
await fillBill(2000, 'บิลที่จะถูกปฏิเสธ');
await page.locator('#saveExpense').click();
await page.waitForTimeout(600);
const warn = await page.textContent('#saveWarning');
check('บอกเหตุผลจากเซิร์ฟเวอร์ตามจริง ไม่ใช่ข้อความกลาง ๆ',
  warn.includes('ยอดหมวดรวม 900'), warn);
check('ฟอร์มยังเปิดอยู่ให้แก้ต่อ', await page.locator('#expenseSheet').isVisible());
check('ไม่มีบิลผีขึ้นบนจอ', !(await page.textContent('body')).includes('บิลที่จะถูกปฏิเสธ'));
failNextWrite = null;
await page.keyboard.press('Escape');

console.log('\n── API ล้มเหลว ─────────────────────────────────');
await page.goto(`${BASE}/index.html?live=1&projectId=TRP-9&userId=x&api=${BASE}/api/fail`,
  { waitUntil:'domcontentloaded' });
await page.waitForTimeout(900);
const errBar = await page.textContent('#liveBar').catch(() => '');
check('บอกชัดว่าโหลดไม่สำเร็จ', errBar.includes('ไม่สำเร็จ'), errBar);
check('บอกว่าตัวเลขที่เห็นเป็นข้อมูลตัวอย่าง', errBar.includes('ข้อมูลตัวอย่าง'), errBar);
check('ไม่ล็อกปุ่มเมื่อยังเป็นข้อมูลตัวอย่าง', !(await page.locator('.add-expense').first().isDisabled()));

check('error ที่เกิดตอน API ล้มเป็นตัวที่เราตั้งใจ log เอง',
  errors.some(e => e.includes('เรียก API ไม่สำเร็จ')), errors.join(' | '));

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
