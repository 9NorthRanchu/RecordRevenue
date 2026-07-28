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
import { fileURLToPath } from 'node:url';

/* รับได้ทั้ง playwright เต็มตัวและ playwright-core เพื่อให้รันได้ทั้งบนเครื่อง
   ที่ลงปกติและใน CI ที่ลงแบบบาง */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }

/* path ต้องอิงจากตำแหน่งไฟล์นี้ ไม่ใช่ค่าคงที่ ไม่งั้นย้ายเครื่องแล้วรันไม่ได้
   ⚠️ ต้องใช้ fileURLToPath ไม่ใช่ new URL(...).pathname เพราะ pathname เก็บเป็น
      URL-encoded — โฟลเดอร์ที่มีช่องว่างจะกลายเป็น %20 แล้วหาไฟล์ไม่เจอ
      (เจอจริงกับ path "My Drive/Anti Gravity/…" หน้าขึ้นมาว่างเปล่าทั้งหน้า) */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8099);
const BASE = `http://localhost:${PORT}`;

/* ล้มตั้งแต่ต้นถ้าหาไฟล์ไม่เจอ ดีกว่าปล่อยให้รัน 40 เคสกับหน้าเปล่า ๆ
   แล้วได้ error กำกวมว่า "หาปุ่มไม่เจอ" ซึ่งชี้ผิดที่ */
if (!existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`หา index.html ไม่เจอที่ ${ROOT} — เทสนี้ต้องอยู่ในโฟลเดอร์เดียวกับ prototype`);
  process.exit(1);
}

// API ปลอมที่คืนรูปเดียวกับของจริง เพื่อทดสอบหน้าจอโดยไม่แตะฐานจริง
const PAYLOAD = {
  trip: { project_id:'TRP-9', name:'Hokkaido 2026', start_date:'2026-12-17', end_date:'2026-12-27',
          closed:false, posting_date:'', banner_url:'', status:'active' },
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

const readBody = req => new Promise(resolve => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => resolve(JSON.parse(raw || '{}')));
});
const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type':'application/json' });
  res.end(JSON.stringify(data));
};

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
        // ¥1,000 หารสองคน ปัด 2 ตำแหน่ง เศษ 0.01 ไปที่ admin — รวมต้องได้ 1,000 พอดี
        participants: [{ member_id:'TM-1', amount_foreign: body.amount_foreign / 2 + 0.01 },
                       { member_id:'TM-2', amount_foreign: body.amount_foreign / 2 - 0.01 }],
        rate:0.234, rate_source:'actual'
      }];
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ ok:true, trip_expense_id:'TE-NEW', created:true,
        residual: 0.01, residual_member_id:'TM-1', rate:0.234, rate_source:'actual' }));
    });
  }
  if (url.pathname === '/api/unified-trip/currencies' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'currency', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      const at = PAYLOAD.currencies.findIndex(c => c.code === body.code);
      const row = { code: body.code, symbol: body.symbol, label: body.label,
                    plan_rate: body.plan_rate, is_base: body.is_base ? 1 : 0, icon_url: body.icon_url };
      if (at >= 0) PAYLOAD.currencies[at] = row; else PAYLOAD.currencies.push(row);
      sendJson(res, 200, { ok:true, code: body.code });
    });
  }
  if (url.pathname === '/api/unified-trip/currencies' && req.method === 'DELETE') {
    const code = url.searchParams.get('code');
    posted.push({ kind:'currency-delete', code });
    if (failNextWrite) return sendJson(res, 409, { error: failNextWrite });
    PAYLOAD.currencies = PAYLOAD.currencies.filter(c => c.code !== code);
    return sendJson(res, 200, { ok:true, deleted: code });
  }
  if (url.pathname === '/api/unified-trip/wallets' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'wallet', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      const at = PAYLOAD.wallets.findIndex(w => w.wallet_id === body.wallet_id);
      const row = { wallet_id: body.wallet_id || 'W-NEW', name: body.name, currency: body.currency,
                    owner_member_id: body.owner_member_id, icon_url: body.icon_url,
                    exclude_on_close: body.exclude_on_close ? 1 : 0, locked_rate:null,
                    fundings:[], funded_foreign:0, funded_thb:0, spent_foreign:0,
                    leftover_foreign:0, rate:0.23, rate_source:'planned' };
      if (at >= 0) PAYLOAD.wallets[at] = { ...PAYLOAD.wallets[at], ...row }; else PAYLOAD.wallets.push(row);
      sendJson(res, 200, { ok:true, wallet_id: row.wallet_id, created: at < 0 });
    });
  }
  if (url.pathname === '/api/unified-trip/fundings' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'funding', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      const wallet = PAYLOAD.wallets.find(w => w.wallet_id === body.wallet_id);
      wallet.fundings = [...wallet.fundings, { funding_id:'F-NEW', wallet_id: body.wallet_id,
        funding_date: body.funding_date, thb_amount: body.thb_amount,
        foreign_amount: body.foreign_amount, note: body.note }];
      wallet.funded_thb += body.thb_amount;
      wallet.funded_foreign += body.foreign_amount;
      wallet.rate = wallet.funded_thb / wallet.funded_foreign;
      wallet.rate_source = 'actual';
      sendJson(res, 200, { ok:true, funding_id:'F-NEW', lot_rate: body.thb_amount / body.foreign_amount,
                           wallet_rate: wallet.rate });
    });
  }
  if (url.pathname === '/api/unified-trip/closures' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'close', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      PAYLOAD.trip.closed = true;
      PAYLOAD.trip.status = 'closed';
      PAYLOAD.trip.posting_date = body.posting_date;
      PAYLOAD.closures = [...PAYLOAD.closures, { closure_id:'TC-1', entry_type:'CLOSE',
        posting_date: body.posting_date, ledger_total: 1170, trip_only_total: 0,
        fx_result: 30, carried_thb: 0, reverses_id:null, reason: body.reason,
        performed_by:'TM-1', created_at:'2027-01-10 10:00:00', lines: [] }];
      PAYLOAD.ledger.net_thb = 1170;
      sendJson(res, 200, { ok:true, closure_id:'TC-1', posting_date: body.posting_date,
        ledger_total:1170, trip_only_total:0, fx_result:30, carried_thb:0, net_ledger_thb:1170 });
    });
  }
  if (url.pathname === '/api/unified-trip/closures/reopen' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'reopen', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      PAYLOAD.trip.closed = false;
      PAYLOAD.trip.status = 'active';
      PAYLOAD.closures = [...PAYLOAD.closures, { closure_id:'TC-2', entry_type:'REOPEN',
        posting_date:'2027-01-10', ledger_total:-1170, trip_only_total:0, fx_result:-30,
        carried_thb:0, reverses_id:'TC-1', reason: body.reason, performed_by:'TM-1',
        created_at:'2027-01-11 09:00:00', lines: [] }];
      PAYLOAD.ledger.net_thb = 0;
      sendJson(res, 200, { ok:true, closure_id:'TC-2', reverses:'TC-1',
        posting_date:'2027-01-10', ledger_total:-1170, net_ledger_thb:0 });
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
check('โหมดปกติไม่มีป้ายเตือนข้อมูลตัวอย่างโผล่มา', await page.locator('.demo-flag').count() === 0);
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

// header เดิมเขียนวันที่ของข้อมูลตัวอย่างไว้ตายตัว ต้องถูกทับด้วยของจริง
check('ชื่อทริปใน header เป็นของจริง',
  (await page.textContent('#tripTitle')) === 'Hokkaido 2026', await page.textContent('#tripTitle'));
check('ช่วงวันที่ใน header เป็นของจริง ไม่ใช่ ก.พ. 2027',
  (await page.textContent('#tripDates')).includes('2569') || (await page.textContent('#tripDates')).includes('2026'),
  await page.textContent('#tripDates'));
check('ไม่มีวันที่ของข้อมูลตัวอย่างหลงเหลือใน header',
  !(await page.textContent('#tripDates')).includes('2570'), await page.textContent('#tripDates'));
check('ติดป้ายว่าพยากรณ์อากาศยังเป็นข้อมูลตัวอย่าง',
  (await page.textContent('.weather-card .demo-flag')).includes('ข้อมูลตัวอย่าง'));
check('ติดป้ายว่าแผนเที่ยวยังเป็นข้อมูลตัวอย่าง',
  (await page.textContent('#screen-plan .demo-flag')).includes('ข้อมูลตัวอย่าง'));

const body = await page.textContent('body');
check('เห็นบิลจากฐาน', body.includes('ราเมงซัปโปโร'));
check('ไม่มีบิลตัวอย่างหลงเหลือ', !body.includes('Hotel Sounkyo'));
check('เห็นกระเป๋าจากฐาน', body.includes('เงินสดเยน'));
check('เห็นสมาชิกจากฐาน', body.includes('Puii'));
check('ไม่มีสมาชิกตัวอย่างหลงเหลือ', !body.includes('Ann') && !body.includes('Mew'));

check('ปุ่มเพิ่มค่าใช้จ่ายเปิดให้เขียนแล้ว', !(await page.locator('.add-expense').first().isDisabled()));
check('ทุกส่วนเปิดให้เขียนลงฐานจริงแล้ว',
  await page.evaluate(() => Object.values(LIVE_WRITABLE).every(Boolean)),
  await page.evaluate(() => JSON.stringify(LIVE_WRITABLE)));
const note = await page.locator('.trip-locked-note').first().innerText();
check('ทริปยังเปิดอยู่ → ป้ายต้องไม่บอกว่า "ทริปนี้ปิดแล้ว"',
  note.includes('โหมดข้อมูลจริง') && !note.includes('ทริปนี้ปิดแล้ว'), note);
check('ป้ายบอกชัดว่าบันทึกลงฐานจริง', note.includes('ลงฐานจริง'), note);

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
    return bill && bill.participants.some(p => p.amount === 500.01);
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

console.log('\n── กระเป๋า · สกุลเงิน · เติมเงิน (ข้อมูลจริง) ──');
await page.goto(`${BASE}/index.html?live=1&projectId=TRP-9&userId=9North&api=${BASE}`,
  { waitUntil:'domcontentloaded' });
await page.waitForSelector('#liveBar.live-bar--live', { timeout: 5000 });
posted.length = 0;

await page.locator('[data-screen="wallets"]:visible').first().click();
await page.waitForTimeout(200);
check('ปุ่มเพิ่มกระเป๋าปลดล็อกแล้ว', !(await page.locator('#addWallet').first().isDisabled()));
check('ปุ่มเพิ่มสกุลเงินปลดล็อกแล้ว', !(await page.locator('#addCurrency').first().isDisabled()));
// สกุลเงินอยู่บนหน้าจอ "เพิ่มเติม" ไม่ใช่หน้ากระเป๋า ต้องย้ายหน้าก่อนกด

await page.locator('#addWallet:visible').first().click();
await page.waitForTimeout(200);
await page.fill('#walletLabel', 'กระเป๋าใหม่จากจอ');
await page.locator('#walletForm button[type=submit], #walletForm .primary-btn').first().click();
await page.waitForTimeout(600);
const walletBody = posted.find(p => p.kind === 'wallet') || {};
check('ยิงสร้างกระเป๋าขึ้นเซิร์ฟเวอร์', Boolean(walletBody.name), JSON.stringify(posted));
check('แมปชื่อกระเป๋าถูก', walletBody.name === 'กระเป๋าใหม่จากจอ', walletBody.name);
check('เจ้าของเป็น member_id จริง', String(walletBody.owner_member_id).startsWith('TM-'), walletBody.owner_member_id);
check('ไม่ส่ง wallet_id ตอนสร้างใหม่', walletBody.wallet_id === undefined, String(walletBody.wallet_id));
check('กระเป๋าใหม่ขึ้นบนจอ', (await page.textContent('body')).includes('กระเป๋าใหม่จากจอ'));

await page.locator('[data-screen="more"]:visible').first().click();
await page.waitForTimeout(250);
await page.locator('#addCurrency:visible').first().click();
await page.waitForTimeout(200);
await page.fill('#currencyCode', 'krw');
await page.fill('#currencySymbol', '₩');
await page.fill('#currencyLabel', 'วอนเกาหลี');
await page.fill('#currencyRate', '0.026');
await page.locator('#currencyForm button[type=submit], #currencyForm .primary-btn').first().click();
await page.waitForTimeout(600);
const currencyBody = posted.find(p => p.kind === 'currency') || {};
check('ยิงเพิ่มสกุลเงินขึ้นเซิร์ฟเวอร์', currencyBody.code === 'KRW', JSON.stringify(currencyBody));
check('แมป plan_rate ถูก (ไม่ใช่ชื่อ planRate)', currencyBody.plan_rate === 0.026, String(currencyBody.plan_rate));
check('สกุลใหม่ไม่ถูกตั้งเป็นสกุลหลักโดยบังเอิญ', !currencyBody.is_base, String(currencyBody.is_base));

// สกุลหลักไม่มีปุ่มแก้ไขเลย จึงไม่มีทางถูกลดชั้นเป็นสกุลธรรมดาจากหน้าจอ
check('สกุลหลักไม่มีปุ่มแก้ไข ป้องกันการเผลอลดชั้น',
  await page.locator('[data-edit-currency="THB"]').count() === 0);

// แก้สกุลที่ไม่ใช่สกุลหลัก แล้ว is_base ต้องยังเป็นเท็จ ไม่ใช่หายไปเฉย ๆ
await page.locator('[data-edit-currency="JPY"]:visible').first().click();
await page.waitForTimeout(250);
await page.fill('#currencyLabel', 'เยนญี่ปุ่น (แก้)');
await page.locator('#currencyForm button[type=submit], #currencyForm .primary-btn').first().click();
await page.waitForTimeout(600);
const jpyEdit = posted.filter(p => p.kind === 'currency').pop() || {};
check('แก้สกุลเดิมแล้วส่ง code เดิมกลับไป ไม่สร้างซ้ำ', jpyEdit.code === 'JPY', JSON.stringify(jpyEdit));
check('สถานะสกุลหลักถูกส่งไปตามของเดิม ไม่ถูกเดาใหม่', jpyEdit.is_base === false, String(jpyEdit.is_base));
check('ชื่อใหม่ขึ้นบนจอ', (await page.textContent('body')).includes('เยนญี่ปุ่น (แก้)'));

await page.locator('[data-screen="wallets"]:visible').first().click();
await page.waitForTimeout(250);
await page.locator('[data-fund-wallet]:visible').first().click();
await page.waitForTimeout(250);
await page.fill('#fundThb', '2500');
await page.fill('#fundForeign', '10000');
await page.locator('#fundForm button[type=submit], #fundForm .primary-btn').first().click();
await page.waitForTimeout(600);
const fundBody = posted.find(p => p.kind === 'funding') || {};
check('ยิงเติมเงินขึ้นเซิร์ฟเวอร์', fundBody.thb_amount === 2500, JSON.stringify(fundBody));
check('ไม่ส่ง rate ขึ้นไป ปล่อยให้เซิร์ฟเวอร์คิดเอง', fundBody.rate === undefined, String(fundBody.rate));
check('เรทเฉลี่ยบนจออัปเดตตามที่เซิร์ฟเวอร์คืนมา',
  await page.evaluate(() => Math.abs(walletRate('W-1') - 4840 / 20000) < 1e-9),
  String(await page.evaluate(() => walletRate('W-1'))));

// เซิร์ฟเวอร์ปฏิเสธการเติมเงิน → ต้องไม่ปิดฟอร์ม และโชว์เหตุผลจริง
failNextWrite = 'เติมเงินเข้ากระเป๋าของคนอื่นได้เฉพาะผู้ดูแลทริป';
await page.locator('[data-screen="wallets"]:visible').first().click();
await page.waitForTimeout(250);
await page.locator('[data-fund-wallet]:visible').first().click();
await page.waitForTimeout(250);
await page.fill('#fundThb', '100');
await page.fill('#fundForeign', '400');
await page.locator('#fundForm button[type=submit], #fundForm .primary-btn').first().click();
await page.waitForTimeout(600);
check('เติมเงินล้ม → โชว์เหตุผลจากเซิร์ฟเวอร์',
  (await page.textContent('#fundError')).includes('ผู้ดูแลทริป'), await page.textContent('#fundError'));
check('เติมเงินล้ม → ฟอร์มยังเปิดอยู่', await page.locator('#fundDialog').isVisible());
failNextWrite = null;
await page.keyboard.press('Escape');

console.log('\n── ปิดทริป · เปิดกลับ (ข้อมูลจริง) ─────────────');
await page.goto(`${BASE}/index.html?live=1&projectId=TRP-9&userId=9North&api=${BASE}`,
  { waitUntil:'domcontentloaded' });
await page.waitForSelector('#liveBar.live-bar--live', { timeout: 5000 });
posted.length = 0;

// ปุ่มปิดทริปอยู่บนหน้าจอ "เพิ่มเติม"
await page.locator('[data-screen="more"]:visible').first().click();
await page.waitForTimeout(250);
await page.locator('#closePreview:visible').first().click();
await page.waitForTimeout(500);

// เงินเหลือทุกกระเป๋าต้องบอกว่าจะเอาไปไหน — กรอกยอดที่แลกกลับได้
const received = page.locator('#settlementRows input[type="text"], #settlementRows input[inputmode]').first();
if (await received.count()) { await received.fill('1200'); await page.waitForTimeout(300); }
await page.fill('#postingDate', '2027-01-10');
await page.waitForTimeout(200);
await page.locator('#closeAck').check();
await page.waitForTimeout(200);
await page.locator('#confirmClose').click();
await page.waitForTimeout(800);

const closeBody = posted.find(p => p.kind === 'close') || {};
check('ยิงปิดทริปขึ้นเซิร์ฟเวอร์', Boolean(closeBody.posting_date), JSON.stringify(posted));
check('ส่งวันลงบัญชีที่ผู้ใช้เลือก ไม่ใช่วันจบทริป', closeBody.posting_date === '2027-01-10', closeBody.posting_date);
check('ส่ง disposition ของทุกกระเป๋าที่มีเงินเหลือ',
  Array.isArray(closeBody.lines) && closeBody.lines.length > 0 &&
  closeBody.lines.every(l => ['RETURN','CARRY'].includes(l.disposition)), JSON.stringify(closeBody.lines));
check('ไม่ส่งยอดที่ลงบัญชีขึ้นไป ปล่อยให้เซิร์ฟเวอร์คิดจากผู้ร่วมจ่ายจริง',
  closeBody.ledger_total === undefined, String(closeBody.ledger_total));
check('ทริปกลายเป็นสถานะปิดบนจอ', await page.evaluate(() => tripClosed === true));
check('ป้ายเปลี่ยนเป็นข้อความของทริปที่ปิดแล้ว',
  (await page.locator('.trip-locked-note').first().innerText()).includes('ปิดแล้ว'));
check('ปิดแล้วเพิ่มบิลไม่ได้', await page.locator('.add-expense').first().isDisabled());

await page.locator('#reopenTrip:visible').first().click();
await page.waitForTimeout(300);
await page.fill('#reopenReason', 'ลืมบันทึกค่าใช้จ่าย');
await page.locator('#reopenForm button[type=submit], #reopenForm .primary-btn').first().click();
await page.waitForTimeout(800);
const reopenBody = posted.find(p => p.kind === 'reopen') || {};
check('ยิงเปิดทริปกลับขึ้นเซิร์ฟเวอร์', reopenBody.reason === 'ลืมบันทึกค่าใช้จ่าย', JSON.stringify(reopenBody));
check('หน้าจอไม่เลือกเองว่าจะกลับรายการไหน ปล่อยให้เซิร์ฟเวอร์หา',
  Object.keys(reopenBody).filter(k => k !== 'kind' && k !== 'reason').length === 0, JSON.stringify(reopenBody));
check('ทริปกลับมาแก้ได้', await page.evaluate(() => tripClosed === false));
check('เพิ่มบิลได้อีกครั้ง', !(await page.locator('.add-expense').first().isDisabled()));
check('สมุดปิดทริปมีทั้งแถวปิดและแถวกลับ',
  await page.evaluate(() => tripLog.length === 2 && tripLog[1].type === 'reopen'),
  await page.evaluate(() => JSON.stringify(tripLog.map(e => e.type))));
check('ยอดสุทธิกลับเป็น 0 หลังเปิดกลับ',
  await page.evaluate(() => tripLog.reduce((sum, e) => sum + e.ledgerTotal, 0) === 0));

console.log(`\n${fail === 0 ? '✅' : '❌'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
