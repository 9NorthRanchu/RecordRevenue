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
  ledger_categories: [
    { category_id:'CAT-FOOD', category_name:'ค่าอาหาร', caption_id:'CAP-EXP', caption_name:'Expense', behavior:'EXPENSE' },
    { category_id:'CAT-STAY', category_name:'ค่าที่พัก', caption_id:'CAP-EXP', caption_name:'Expense', behavior:'EXPENSE' }
  ],
  stops: [
    { stop_id:'S-1', stop_date:'2026-12-17', time:'10:20', sort_order:1, city:'Kushiro',
      name_en:'Kushiro Airport', name_th:'สนามบินคุชิโระ', notes:'รับรถเช่า', icon_asset:'' },
    { stop_id:'S-2', stop_date:'2026-12-17', time:'15:00', sort_order:2, city:'Kushiro',
      name_en:'Hotel', name_th:'เช็กอินที่พัก', accommodation:'Kushiro Prince', icon_asset:'' },
    { stop_id:'S-3', stop_date:'2026-12-18', time:'09:00', sort_order:1, city:'Lake Akan',
      name_en:'Lake Akan', name_th:'ทะเลสาบอาคัง', notes:'มาริโมะ', icon_asset:'' }
  ],
  presence: [], closures: [],
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
  if (url.pathname === '/api/unified-trip/stops' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'stop', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      const at = PAYLOAD.stops.findIndex(s2 => s2.stop_id === body.stop_id);
      const row = { stop_id: body.stop_id || 'S-NEW', stop_date: body.stop_date, time: body.time || '',
                    sort_order: 99, city:'', name_th: body.name_th, name_en:'',
                    notes: body.notes || '', accommodation: body.accommodation || '', icon_asset:'' };
      if (at >= 0) PAYLOAD.stops[at] = { ...PAYLOAD.stops[at], ...row }; else PAYLOAD.stops.push(row);
      sendJson(res, 200, { ok:true, stop_id: row.stop_id, created: at < 0 });
    });
  }
  if (url.pathname === '/api/unified-trip/stops/order' && req.method === 'POST') {
    return readBody(req).then(body => {
      posted.push({ kind:'order', ...body });
      if (failNextWrite) return sendJson(res, 400, { error: failNextWrite });
      body.stops.forEach(item => {
        const row = PAYLOAD.stops.find(s2 => s2.stop_id === item.stop_id);
        if (row) { row.sort_order = item.sort_order; if (item.stop_date) row.stop_date = item.stop_date; }
      });
      sendJson(res, 200, { ok:true, updated: body.stops.length });
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

const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1228/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport:{width:420,height:900} });
page.on('pageerror', e => console.log('[pageerror]', String(e)));
page.on('console', m => { if (m.type()==='error') console.log('[console]', m.text()); });
await page.goto(`${BASE}/index.html?live=1&projectId=TRP-9&userId=9North&api=${BASE}`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
console.log('liveBar:', await page.textContent('#liveBar').catch(()=>'(ไม่มี)'));
await browser.close(); server.close(); process.exit(0);
