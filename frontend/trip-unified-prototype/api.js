/* ── Live data adapter ────────────────────────────────────────────────
   แปลงข้อมูลจาก GET /api/unified-trip ให้เป็นรูปที่ prototype ใช้อยู่

   เปิดใช้ด้วย query string เท่านั้น ไม่ใช่ค่าเริ่มต้น:
     index.html?live=1&projectId=TRP-1783943254256
   ไม่ใส่ = ใช้ข้อมูลตัวอย่างเหมือนเดิมทุกประการ

   ตัวตนมาจาก session ที่ล็อกอินไว้ในแอปหลัก (โดเมนเดียวกัน)
   `?userId=` เหลือไว้เป็นทางลัดสำหรับทดสอบเท่านั้น */

const TripApi = (() => {
  const params = new URLSearchParams(location.search);

  /* ผู้ใช้ที่ล็อกอินอยู่ — แอปหลักเก็บไว้ที่ sessionStorage คีย์ logged_in_user
     อยู่โดเมนเดียวกัน (record-revenue-web.pages.dev) จึงอ่านต่อได้เลย

     ⚠️ sessionStorage แยกตามแท็บ ถ้าเปิดหน้านี้ในแท็บใหม่จะไม่เห็นการล็อกอิน
        ต้องกดลิงก์จากในแอปในแท็บเดิม หรือใช้ ?userId= สำหรับทดสอบ */
  const sessionUserId = () => {
    try {
      const raw = sessionStorage.getItem('logged_in_user');
      return raw ? (JSON.parse(raw).user_id || '') : '';
    } catch {
      return '';
    }
  };

  /* token ที่แอปหลักเก็บไว้ตอนล็อกอิน — โดเมนเดียวกันจึงอ่านต่อได้
     ถ้ามี token เซิร์ฟเวอร์จะเชื่อ token ไม่ใช่ x-user-id ที่ปลอมได้ */
  const sessionToken = () => {
    try { return sessionStorage.getItem('session_token') || ''; } catch { return ''; }
  };

  const fromSession = sessionUserId();
  const fromUrl = params.get('userId') || '';

  const config = {
    enabled: params.get('live') === '1',
    base: params.get('api') || 'https://record-revenue.9nimz.workers.dev',
    projectId: params.get('projectId') || '',
    // session มาก่อน URL เสมอ — ใครใส่ ?userId= ของคนอื่นมาก็ไม่ทับของที่ล็อกอินจริง
    userId: fromSession || fromUrl,
    userSource: sessionToken() ? 'token' : (fromSession ? 'session' : (fromUrl ? 'url' : 'none'))
  };

  /* ไอคอนในฐานเก็บได้ทั้งชื่อไฟล์เปล่าและ path เต็ม — ทำให้เป็น path เดียวกัน
     ถ้าไม่มีเลยคืน null ให้ผู้เรียกตัดสินใจ ไม่ใช่เดาไอคอนให้ */
  const iconPath = (value, fallback) => {
    if (!value) return fallback;
    return value.includes('/') ? value : `art/icons/${value}`;
  };

  const lower = value => String(value || '').toLowerCase();

  /* แปลงเป็นรูปของ prototype ทีละก้อน
     ชื่อฟิลด์ต่างกันคนละแบบ (snake_case ↔ camelCase) จึงแมปตรง ๆ ที่เดียว
     แทนที่จะให้แต่ละหน้าจอไปรู้จักชื่อฝั่งฐานเอง */
  function toPrototypeState(payload) {
    const members = (payload.members || []).map(row => ({
      id: row.member_id,
      name: row.display_name,
      ledgerMode: row.ledger_mode || 'MAIN',
      role: row.role || 'สมาชิก',
      admin: Boolean(row.is_admin)
    }));

    const wallets = (payload.wallets || []).map(row => ({
      id: row.wallet_id,
      ownerId: row.owner_member_id,
      label: row.name,
      currency: row.currency,
      icon: iconPath(row.icon_url, 'art/icons/wallet_classic.svg'),
      lockedRate: row.locked_rate ?? null
    }));

    // ล็อตเติมเงินซ้อนอยู่ในกระเป๋าแต่ละใบ ต้องคลี่ออกมาเป็นรายการเดียว
    const fundings = (payload.wallets || []).flatMap(wallet =>
      (wallet.fundings || []).map(lot => ({
        id: lot.funding_id,
        walletId: lot.wallet_id,
        date: lot.funding_date || '',
        thb: lot.thb_amount || 0,
        foreign: lot.foreign_amount || 0,
        note: lot.note || ''
      })));

    const tripCurrencies = (payload.currencies || []).map(row => ({
      code: row.code,
      symbol: row.symbol,
      label: row.label || row.code,
      planRate: row.plan_rate,
      base: Boolean(row.is_base),
      icon: iconPath(row.icon_url, `art/icons/coin_${lower(row.code)}.svg`)
    }));

    const bills = (payload.expenses || []).map(row => ({
      id: row.trip_expense_id,
      title: row.note || 'บิล',
      amount: row.amount_foreign || 0,
      currency: row.currency_code,
      payerId: row.member_id,
      ownerId: row.owner_member_id,
      walletId: row.wallet_id,
      date: row.expense_date,
      categories: (row.categories || []).map(line => ({
        name: line.label || 'อื่น ๆ', amount: line.amount_foreign || 0
      })),
      visibility: lower(row.visibility) || 'trip',
      shared: Boolean(row.is_shared),
      splitMode: lower(row.split_mode) || 'equal',
      participants: (row.participants || []).map(p => ({
        memberId: p.member_id, amount: p.amount_foreign || 0
      })),
      activityId: null
    }));

    // สมุดปิดทริป: ปิดเป็นบวก เปิดกลับเป็นลบของครั้งที่กลับ
    // ยอดสุทธิคือผลบวกของทุกแถว หน้าจอจึงต้องได้ทุกแถว ไม่ใช่แถวล่าสุด
    const tripLog = (payload.closures || []).map(row => ({
      type: lower(row.entry_type),
      at: row.created_at,
      by: row.performed_by,
      reason: row.reason || '',
      postingDate: row.posting_date || '',
      ledgerTotal: row.ledger_total || 0,
      tripOnlyTotal: row.trip_only_total || 0,
      reversalOf: row.reverses_id || ''
    }));

    /* จุดแวะจริง → แผนเที่ยวรายวัน
       ⚠️ ไม่ใส่ weather เลย เพราะฐานไม่มีข้อมูลพยากรณ์ · หน้าจอจะขึ้นว่า
          "ยังไม่มีข้อมูล" แทนที่จะโชว์ตัวเลขของข้อมูลตัวอย่างค้างไว้
       เรียงตาม sort_order ก่อน แล้วค่อยเวลา — เวลาชนกันได้ ลำดับจึงต้องมีตัวตัดสิน */
    const byDate = {};
    [...(payload.stops || [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        || String(a.time || '').localeCompare(String(b.time || '')))
      .forEach(stop => {
        const date = stop.stop_date || 'ไม่ระบุวัน';
        (byDate[date] ||= []).push(stop);
      });

    const planDays = Object.keys(byDate).sort().map((date, index) => ({
      id: `stop-day-${date}`,
      day: index + 1,
      city: byDate[date].find(s => s.city)?.city || byDate[date][0]?.name_en || '—',
      date,
      activities: byDate[date].map(stop => ({
        id: stop.stop_id,
        time: stop.time || '',
        name: stop.name_th || stop.name_en || stop.city || 'จุดแวะ',
        detail: stop.notes || stop.accommodation || '',
        tag: stop.accommodation ? 'ที่พัก' : 'สถานที่',
        cost: '—',
        bills: 'ยังไม่ผูกบิล',
        image: stop.icon_asset || ''
      }))
    }));

    return {
      members, wallets, fundings, tripCurrencies, bills, tripLog, planDays,
      viewerId: payload.viewer?.member_id || null,
      tripClosed: Boolean(payload.trip?.closed),
      postingDate: payload.trip?.posting_date || '',
      tripName: payload.trip?.name || '',
      tripStartDate: payload.trip?.start_date || '',
      tripEndDate: payload.trip?.end_date || '',
      banner: payload.trip?.banner_url || payload.trip?.theme_banner || '',
      netLedgerThb: payload.ledger?.net_thb ?? 0,
      hiddenExpenseCount: payload.meta?.hidden_expense_count ?? 0
    };
  }

  /* token มาก่อน x-user-id เสมอ · ยังส่ง x-user-id ไปด้วยเพื่อให้ใช้ได้
     ระหว่างที่เซิร์ฟเวอร์ยังอยู่ในช่วงเปลี่ยนผ่าน */
  function authHeaders() {
    const headers = { 'x-user-id': config.userId };
    const token = sessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function fetchTrip() {
    if (!config.projectId) throw new Error('ต้องระบุ projectId ใน URL');
    // มี token ก็พอ เซิร์ฟเวอร์รู้เองว่าเป็นใคร ไม่ต้องพึ่ง userId ฝั่งหน้าจอ
    if (!config.userId && !sessionToken()) {
      throw new Error('ยังไม่ได้ล็อกอิน — เปิดแอปหลักแล้วล็อกอินก่อน จากนั้นเปิดหน้านี้ในแท็บเดิม');
    }
    const url = `${config.base}/api/unified-trip?projectId=${encodeURIComponent(config.projectId)}`;
    const response = await fetch(url, { headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `เรียก API ไม่สำเร็จ (${response.status})`);
    return toPrototypeState(payload);
  }

  /* ── เขียนกลับ ───────────────────────────────────────────────────────
     เปิดทีละส่วน ตอนนี้มีแค่บิล · ข้อความ error จากเซิร์ฟเวอร์ถูกส่งต่อ
     ตามจริง ไม่แปลงเป็นข้อความกลาง ๆ เพราะฝั่งเซิร์ฟเวอร์บอกสาเหตุไว้ละเอียด
     กว่าที่หน้าจอจะเดาเองได้ (เช่น "ยอดหมวดรวม 900 ไม่เท่ากับยอดบิล 1000") */
  async function send(method, path, { body, query = '' } = {}) {
    const url = `${config.base}/api/unified-trip${path}?projectId=${encodeURIComponent(config.projectId)}${query}`;
    const response = await fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `บันทึกไม่สำเร็จ (${response.status})`);
    return payload;
  }

  /* แปลงบิลรูป prototype → รูปที่ API รับ
     ⚠️ ไม่ส่งยอดของผู้ร่วมจ่ายเมื่อเป็นการหารเท่ากัน — ปล่อยให้เซิร์ฟเวอร์
        คำนวณและปัดเศษเอง จะได้ไม่มีสองที่คิดเลขแล้วได้คนละคำตอบ */
  const toExpenseBody = bill => ({
    trip_expense_id: bill.id && !bill.id.startsWith('bill-') ? bill.id : undefined,
    expense_date: bill.date || new Date().toISOString().slice(0, 10),
    amount_foreign: bill.amount,
    currency_code: bill.currency,
    member_id: bill.payerId,
    owner_member_id: bill.ownerId,
    wallet_id: bill.walletId || null,
    note: bill.title,
    icon_url: bill.image || null,
    visibility: String(bill.visibility || 'trip').toUpperCase(),
    is_shared: Boolean(bill.shared),
    split_mode: String(bill.splitMode || 'equal').toUpperCase(),
    categories: (bill.categories || []).map(row => ({ label: row.name, amount_foreign: row.amount })),
    participants: (bill.participants || []).map(row =>
      String(bill.splitMode).toLowerCase() === 'equal'
        ? { member_id: row.memberId }
        : { member_id: row.memberId, amount_foreign: row.amount, percent: row.percent })
  });

  const saveExpense = bill => send('POST', '/expenses', { body: toExpenseBody(bill) });
  const removeExpense = id => send('DELETE', '/expenses', { query: `&id=${encodeURIComponent(id)}` });

  const saveCurrency = currency => send('POST', '/currencies', {
    body: {
      code: currency.code, symbol: currency.symbol, label: currency.label,
      plan_rate: currency.planRate, is_base: Boolean(currency.base), icon_url: currency.icon || null
    }
  });
  const removeCurrency = code => send('DELETE', '/currencies', { query: `&code=${encodeURIComponent(code)}` });

  const saveWallet = wallet => send('POST', '/wallets', {
    body: {
      wallet_id: wallet.id && !wallet.id.startsWith('w-') ? wallet.id : undefined,
      name: wallet.label, currency: wallet.currency,
      owner_member_id: wallet.ownerId, icon_url: wallet.icon || null,
      exclude_on_close: Boolean(wallet.excludeOnClose)
    }
  });

  /* ⚠️ ไม่ส่ง rate ขึ้นไป — เซิร์ฟเวอร์คำนวณ thb ÷ foreign เอง
     ถ้าหน้าจอส่งไปด้วย เลขที่เก็บอาจไม่ตรงกับเงินที่จ่ายจริง */
  const saveFunding = lot => send('POST', '/fundings', {
    body: {
      wallet_id: lot.walletId, thb_amount: lot.thb, foreign_amount: lot.foreign,
      funding_date: lot.date, note: lot.note || null
    }
  });
  const removeFunding = id => send('DELETE', '/fundings', { query: `&id=${encodeURIComponent(id)}` });

  /* ปิดทริป — ต้องบอกทุกกระเป๋าที่มีเงินเหลือว่าจะเอาไปไหน ไม่งั้นเซิร์ฟเวอร์
     ปฏิเสธ (เงินที่ไม่ได้ระบุจะหายจากบัญชีเงียบ ๆ)
     ยอดที่ลงบัญชีเซิร์ฟเวอร์คิดเองจากผู้ร่วมจ่ายจริง หน้าจอไม่ส่งขึ้นไป */
  const closeTrip = ({ postingDate, lines, reason }) => send('POST', '/closures', {
    body: {
      posting_date: postingDate, reason: reason || null,
      lines: lines.map(line => line.mode === 'carry'
        ? { wallet_id: line.walletId, disposition: 'CARRY',
            carry_currency: line.carryCurrency, carry_amount: line.carryAmount }
        : { wallet_id: line.walletId, disposition: 'RETURN', received_thb: line.receivedThb })
    }
  });

  const reopenTrip = reason => send('POST', '/closures/reopen', { body: { reason } });

  /* จุดแวะ — id ที่ prototype สร้างเองขึ้นต้นด้วย activity- ไม่ใช่ของจริงในฐาน
     ต้องไม่ส่งขึ้นไป ไม่งั้นเซิร์ฟเวอร์จะหาไม่เจอแล้วตอบ 404 ทั้งที่เป็นการสร้างใหม่ */
  const saveStop = ({ id, dayDate, time, name, detail, tag, icon }) => send('POST', '/stops', {
    body: {
      stop_id: id && !id.startsWith('activity-') ? id : undefined,
      stop_date: dayDate,
      time: time || undefined,
      name_th: name,
      notes: detail,
      accommodation: tag === 'ที่พัก' ? detail || name : undefined,
      icon_asset: icon || undefined
    }
  });
  const removeStop = id => send('DELETE', '/stops', { query: `&id=${encodeURIComponent(id)}` });

  /* ส่งลำดับทั้งชุด ไม่ใช่ทีละแถว — ลากทีเดียวกระทบหลายแถว ถ้ายิงทีละอันแล้ว
     ขาดกลางคัน ลำดับในฐานจะค้างครึ่ง ๆ ไม่ตรงกับที่เห็นบนจอ */
  const reorderStops = stops => send('POST', '/stops/order', { body: { stops } });

  return {
    config, fetchTrip, toPrototypeState, toExpenseBody,
    saveExpense, removeExpense, saveCurrency, removeCurrency,
    saveWallet, saveFunding, removeFunding, closeTrip, reopenTrip,
    saveStop, removeStop, reorderStops
  };
})();
