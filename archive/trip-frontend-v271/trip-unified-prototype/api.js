/* ── Live data adapter ────────────────────────────────────────────────
   แปลงข้อมูลจาก GET /api/unified-trip ให้เป็นรูปที่ prototype ใช้อยู่

   เปิดใช้ด้วย query string เท่านั้น ไม่ใช่ค่าเริ่มต้น:
     index.html?live=1&projectId=TRP-1783943254256
   ไม่ใส่ = ใช้ข้อมูลตัวอย่างเหมือนเดิมทุกประการ

   ตัวตนมาจาก session ที่ล็อกอินไว้ในแอปหลัก (โดเมนเดียวกัน)
   `?userId=` เหลือไว้เป็นทางลัดสำหรับทดสอบเท่านั้น */

const TripApi = (() => {
  const params = new URLSearchParams(location.search);

  /* ผู้ใช้ที่ล็อกอินอยู่ — แอปหลักเก็บไว้ที่ localStorage คีย์ logged_in_user
     (จำในเครื่องตามอายุ token 30 วัน เพื่อให้ลิงก์ตรงใช้บนมือถือได้เลย)
     อยู่โดเมนเดียวกัน (record-revenue-web.pages.dev) จึงอ่านต่อได้เลย
     ยังอ่าน sessionStorage เป็นทางสำรองสำหรับแท็บที่ล็อกอินค้างแบบเก่า */
  const sessionUserId = () => {
    try {
      const raw = localStorage.getItem('logged_in_user') || sessionStorage.getItem('logged_in_user');
      return raw ? (JSON.parse(raw).user_id || '') : '';
    } catch {
      return '';
    }
  };

  /* token ที่แอปหลักเก็บไว้ตอนล็อกอิน — โดเมนเดียวกันจึงอ่านต่อได้
     ถ้ามี token เซิร์ฟเวอร์จะเชื่อ token ไม่ใช่ x-user-id ที่ปลอมได้ */
  const sessionToken = () => {
    try { return localStorage.getItem('session_token') || sessionStorage.getItem('session_token') || ''; } catch { return ''; }
  };

  const fromSession = sessionUserId();
  const fromUrl = params.get('userId') || '';

  const config = {
    enabled: params.get('live') === '1',
    base: params.get('api') || 'https://record-revenue.9nimz.workers.dev',
    projectId: params.get('projectId') || '',
    // session มาก่อน URL เสมอ — ใครใส่ ?userId= ของคนอื่นมาก็ไม่ทับของที่ล็อกอินจริง
    userId: fromSession || fromUrl,
    userSource: sessionToken() ? 'token' : (fromSession ? 'session' : (fromUrl ? 'url' : 'none')),
    /* 🔴 ผู้ร่วมทริปที่ล็อกอินด้วยรหัสมี token ของตัวเอง แต่ไม่มี user_id
       ของระบบบัญชีครอบครัว — ถ้าดูแค่ userSource จะนับว่า "ไม่มีตัวตน"
       แล้วลิงก์เดียวจะเด้งเขากลับไปหน้าใส่รหัสวนไม่รู้จบ
       ตัวจริงอ่านจาก localStorage ตอนเรียก ไม่ใช่ค่าที่จำไว้ตอนโหลด
       เพราะ join.html เขียนค่านี้ลงไปหลังจากหน้านั้นโหลดไปแล้ว */
    get hasIdentity() {
      if (sessionToken() || sessionUserId() || fromUrl) return true;
      try { return Boolean(localStorage.getItem('trip_member_token')); } catch { return false; }
    }
  };

  /* ไอคอนในฐานเก็บได้ทั้งชื่อไฟล์เปล่าและ path เต็ม — ทำให้เป็น path เดียวกัน
     ถ้าไม่มีเลยคืน null ให้ผู้เรียกตัดสินใจ ไม่ใช่เดาไอคอนให้ */
  const iconPath = (value, fallback) => {
    if (!value) return fallback;
    return value.includes('/') ? value : `art/icons/${value}`;
  };

  const lower = value => String(value || '').toLowerCase();

  /* ⚠️ theme_banner ในฐานเก็บ path แบบสัมพัทธ์ที่อิงจากโฟลเดอร์ frontend/
        (เช่น 'assets/images/banner_japan.jpg') แต่หน้านี้อยู่ลึกลงไปอีกชั้น
        ถ้าใช้ตรง ๆ จะชี้ไป trip-unified-prototype/assets/... ซึ่งไม่มี → รูปแตก
     ปล่อยผ่านเฉพาะ URL เต็ม · data: · path จาก root · และของที่ถอยขึ้นไปแล้ว */
  const bannerPath = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:|data:|blob:|\/|\.\.\/)/.test(raw)) return raw;
    /* ⚠️ 'art/…' คือคลังรูปของหน้านี้เอง (frontend/trip-unified-prototype/art/)
       ห้ามเติม ../ เด็ดขาด ไม่งั้นจะชี้ออกไปที่ frontend/art/ ซึ่งไม่มีอยู่จริง
       อาการที่เกิด: เลือกรูปจากคลังแล้วเห็นรูปปกติ (เพราะตอนนั้นใช้ path ดิบ)
       แต่พอรีเฟรช รูปหายกลายเป็นช่องว่าง เพราะอ่านกลับมาแล้วโดนเติม ../
       (ไล่หาสาเหตุนี้อยู่นาน เพราะดูเหมือนปัญหาการบันทึก ทั้งที่บันทึกถูกต้อง) */
    if (raw.startsWith('art/')) return raw;
    // ที่เหลือคือรูปของแอปหลักซึ่งเก็บ path อิงจากโฟลเดอร์ frontend/ — หน้านี้ลึกกว่าหนึ่งชั้น
    return `../${raw}`;
  };

  /* แปลงเป็นรูปของ prototype ทีละก้อน
     ชื่อฟิลด์ต่างกันคนละแบบ (snake_case ↔ camelCase) จึงแมปตรง ๆ ที่เดียว
     แทนที่จะให้แต่ละหน้าจอไปรู้จักชื่อฝั่งฐานเอง */
  function toPrototypeState(payload) {
    const members = (payload.members || []).map(row => ({
      id: row.member_id,
      name: row.display_name,
      ledgerMode: row.ledger_mode || 'MAIN',
      role: row.role || 'สมาชิก',
      admin: Boolean(row.is_admin),
      // รูปประจำตัว · ว่าง = หน้าจอถอยไปใช้ตัวอักษรตัวแรกของชื่อ
      avatar: row.avatar_url ? iconPath(row.avatar_url, '') : '',
      userId: row.user_id || '',
      managedBy: row.managed_by || '',
      // ตั้งรหัสผู้ร่วมทริปแล้วหรือยัง · เซิร์ฟเวอร์ไม่ส่งค่า hash ออกมาเลย
      hasPasscode: Boolean(row.has_passcode)
    }));

    const wallets = (payload.wallets || []).map(row => ({
      id: row.wallet_id,
      ownerId: row.owner_member_id,
      label: row.name,
      currency: row.currency,
      icon: iconPath(row.icon_url, 'art/icons/wallet_classic.svg'),
      lockedRate: row.locked_rate ?? null,
      /* 🔴 เคยลืมอ่านสองช่องนี้กลับมา (แก้ 2026-08-22)
         เซิร์ฟเวอร์บันทึก exclude_on_close ถูกต้องมาตลอด แต่หน้าจอไม่เคยอ่านกลับ
         พอ refreshFromServer() เสร็จ ค่าจึงกลายเป็น undefined → ช่องติ๊ก
         "ยกยอดไปทริปหน้า" เด้งกลับเป็นไม่ติ๊กทุกครั้ง ทั้งที่ฐานข้อมูลบันทึกแล้ว
         เป็นบั๊กที่ดูเหมือน "กดไม่ติด" แต่จริง ๆ คือ "บันทึกติดแล้วอ่านไม่กลับ" */
      excludeOnClose: Boolean(row.exclude_on_close),
      colorHue: row.color_hue ?? null,
      kind: row.kind === 'CREDIT' ? 'CREDIT' : 'CASH',
      accountId: row.account_id || ''
    }));

    // ล็อตเติมเงินซ้อนอยู่ในกระเป๋าแต่ละใบ ต้องคลี่ออกมาเป็นรายการเดียว
    const fundings = (payload.wallets || []).flatMap(wallet =>
      (wallet.fundings || []).map(lot => ({
        id: lot.funding_id,
        walletId: lot.wallet_id,
        date: lot.funding_date || '',
        thb: lot.thb_amount || 0,
        foreign: lot.foreign_amount || 0,
        note: lot.note || '',
        // ลำดับที่ผู้ใช้จัดเองในหน้ากระเป๋า · ใช้คิวเลขชุดเดียวกับบิล
        sortOrder: lot.sort_order ?? null
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
      /* ชื่อกับไอคอนของบรรทัดหมวดถูกเซิร์ฟเวอร์เติมสดจาก preset ปัจจุบันมาแล้ว
         หน้าจอจึงใช้ค่าที่ได้ตรง ๆ ไม่ต้องไปจับคู่กับรายการย่อยเองอีกรอบ */
      categories: (row.categories || []).map(line => ({
        name: line.label || 'อื่น ๆ',
        categoryId: line.category_id || '',
        presetId: line.preset_id || '',
        icon: line.icon_url || '',
        amount: line.amount_foreign || 0
      })),
      visibility: lower(row.visibility) || 'trip',
      shared: Boolean(row.is_shared),
      splitMode: lower(row.split_mode) || 'equal',
      participants: (row.participants || []).map(p => ({
        memberId: p.member_id, amount: p.amount_foreign || 0
      })),
      receiptUrl: row.receipt_image_url || '',
      /* จุดแวะที่บิลนี้เกิดขึ้น — ว่างได้ · เดิมตรงนี้เป็น null ตายตัวเพราะฐาน
         ไม่มีคอลัมน์ ทำให้ยอด "ใช้วันนี้" กรองไม่เจออะไรเลยและได้ ฿0 ตลอด */
      activityId: row.stop_id || null,
      // ลำดับที่ผู้ใช้จัดเอง · null = ยังไม่เคยจัด (หน้าจอดันไปท้ายของวันนั้น)
      sortOrder: row.sort_order ?? null,
      /* 🔴 ยอดบาทจริงของบิลบัตรเครดิตที่เคยกรอกไว้ตอนปิดทริป
         เดิมเซิร์ฟเวอร์บันทึกลง TripExpenses.settled_thb แต่ตรงนี้ไม่เคยอ่านกลับ
         → เปิดทริปกลับมาแก้ทีไร ช่องยอดจริงว่างเปล่าทุกครั้ง ต้องนั่งกรอกใหม่
         ทั้งที่ตัวเลขอยู่ในฐานข้อมูลแล้ว (บั๊กชุดเดียวกับ exclude_on_close) */
      settledThb: row.settled_thb ?? null
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
    const dayTitleByDate = Object.fromEntries((payload.day_plans || []).map(row => [row.plan_date, row.title]));
    [...(payload.stops || [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        || String(a.time || '').localeCompare(String(b.time || '')))
      .forEach(stop => {
        const date = stop.stop_date || 'ไม่ระบุวัน';
        (byDate[date] ||= []).push(stop);
      });

    /* 🔴 วันในแผน = วันที่มีจุดแวะ **รวมกับ** วันที่ถูกลงทะเบียนไว้ใน TripDayPlans
       (2026-09-07) — เดิมเอาจากจุดแวะอย่างเดียว ผลคือวันเปล่าไม่มีตัวตน
       สร้างไม่ได้ แก้ไม่ได้ ลบไม่ได้ · ตอนนี้เพิ่มวันไว้ก่อนแล้วค่อยเติมสถานที่ได้ */
    Object.keys(dayTitleByDate).forEach(date => { byDate[date] ||= []; });

    /* การจองของจุดแวะ (2026-09-15) — เซิร์ฟเวอร์ส่งแยกเป็น bookings[] ประกบเข้า
       activity.booking ตรงนี้ · ไม่มี = null · คงชื่อคอลัมน์ snake_case ตามฐาน
       เพราะฟอร์มส่งกลับทั้งก้อนเหมือนเดิม จะได้ไม่ต้องแปลงไปกลับสองรอบ */
    const bookingByStop = {};
    (payload.bookings || []).forEach(row => { bookingByStop[row.stop_id] = row; });

    const planDays = Object.keys(byDate).sort().map((date, index) => ({
      id: `stop-day-${date}`,
      day: index + 1,
      city: byDate[date].find(s => s.city)?.city || byDate[date][0]?.name_en || '—',
      date,
      title: dayTitleByDate[date] || '',
      activities: byDate[date].map(stop => ({
        id: stop.stop_id,
        time: stop.time || '',
        endTime: stop.end_time || '',
        name: stop.name_th || stop.name_en || stop.city || 'จุดแวะ',
        detail: stop.notes || stop.accommodation || '',
        /* 🔴 ต้องเป็นชื่อที่ตรงกับตัวเลือกใน #activityTag เป๊ะ ๆ (North 2026-09-07)
           เดิมส่ง 'สถานที่' ซึ่งไม่มีในลิสต์ (ลิสต์เขียนว่า 'สถานที่หลัก')
           select จึงกลายเป็นช่องว่างเปล่าทุกครั้งที่เปิดแก้ไขของเดิม
           ลำดับการอ่าน: ค่าที่บันทึกไว้จริง → เดาจาก accommodation (ข้อมูลก่อน
           มีคอลัมน์ stop_tag) → 'สถานที่หลัก' · ห้ามคืนค่าว่าง */
        tag: stop.stop_tag || (stop.accommodation ? 'ที่พัก' : 'สถานที่หลัก'),
        cost: '—',
        bills: 'ยังไม่ผูกบิล',
        image: stop.icon_asset || '',
        /* พิกัดจริงของจุดแวะ — ได้มาตอนระบบอากาศ geocode ชื่อสถานที่แล้วเขียนกลับลงฐาน
           null ได้ (สถานที่ที่หาพิกัดไม่เจอ) แผนที่จะข้ามจุดนั้นไป ไม่ใช่วางที่ 0,0
           ซึ่งจะกลายเป็นหมุดกลางมหาสมุทรแอตแลนติกแล้วดึงกรอบแผนที่เพี้ยนทั้งทริป */
        lat: Number.isFinite(Number(stop.latitude)) ? Number(stop.latitude) : null,
        lon: Number.isFinite(Number(stop.longitude)) ? Number(stop.longitude) : null,
        /* งบที่ตั้งไว้ · null = ยังไม่ได้ตั้งงบ ต่างจาก 0 = ตั้งใจว่าไม่เสียเงิน
           หน้าจอต้องแสดงสองอย่างนี้ต่างกัน จึงห้ามยุบเป็น 0 */
        plannedCost: stop.planned_cost == null ? null : Number(stop.planned_cost),
        plannedCurrency: stop.planned_currency || '',
        mapcode: stop.mapcode || '',
        openTime: stop.open_time || '',
        closeTime: stop.close_time || '',
        // เลขวันหยุด 0–6 ตาม Date.getDay() · ว่าง = เปิดทุกวัน
        closedDays: String(stop.closed_days || '').split(',').filter(Boolean).map(Number),
        visitStatus: String(stop.visit_status || 'PLANNED').toUpperCase(),
        skippedReason: stop.skipped_reason || '',
        highlight: stop.highlight_text || '',
        city: stop.city || '',
        booking: bookingByStop[stop.stop_id] || null
      }))
    }));

    return {
      members, wallets, fundings, tripCurrencies, bills, tripLog, planDays,
      presence: Object.fromEntries((payload.presence || []).map(row => [row.member_id, {
        sharing: Boolean(row.is_sharing),
        at: row.checked_in_at ? new Date(row.checked_in_at).getTime() : null,
        place: row.place_label || '',
        status: row.status || 'arrived',
        stopId: row.stop_id || null,
        lat: row.latitude == null ? null : Number(row.latitude),
        lon: row.longitude == null ? null : Number(row.longitude)
      }])),
      viewerId: payload.viewer?.member_id || null,
      tripClosed: Boolean(payload.trip?.closed),
      postingDate: payload.trip?.posting_date || '',
      tripName: payload.trip?.name || '',
      tripStartDate: payload.trip?.start_date || '',
      tripEndDate: payload.trip?.end_date || '',
      tripStage: payload.trip?.trip_stage || 'ONGOING',
      // ว่าง = ให้หน้าจอเลือกธีมเริ่มต้นเอง ฐานไม่ตัดสินแทน
      themeId: payload.trip?.theme_id || '',
      // เคยโพสต์เข้าบัญชีจริงหรือยัง — ใช้ตัดสินว่าปุ่มลบทริปกดได้ไหม
      // (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นตอนลบจริงอยู่ดี ไม่ได้พึ่งแค่ตัวนี้)
      postedToLedger: (payload.closures || []).some(c => Boolean(c.linked_transaction_id)),
      projectId: payload.trip?.project_id || '',
      /* ⚠️ theme_banner ต้องมาก่อน banner_url เสมอ — เพราะ theme_banner คือช่อง
         เดียวที่หน้านี้เขียนลงไป (ดู saveBanner) ส่วน banner_url เป็นคอลัมน์เก่า
         จากหน้า TRIPS รุ่นก่อนที่ไม่มีอะไรเขียนแล้ว
         เดิมเรียงสลับกัน ผลคือ: บันทึกรูปใหม่สำเร็จจริง (ขึ้นข้อความ "บันทึกถาวร")
         แต่พอรีเฟรช ระบบหยิบ banner_url ค่าเก่ามาแสดงทับ — ดูเหมือนรูปหาย
         ทั้งที่ยังอยู่ในฐาน (เจอจริง 2026-08-11) */
      banner: bannerPath(payload.trip?.theme_banner || payload.trip?.banner_url),
      ledgerCategories: payload.ledger_categories || [],
      /* รายการค่าใช้จ่ายย่อยของทริปนี้ — ปุ่มที่ฟอร์มจดบิลใช้เลือก
         แต่ละอันมีชื่อ+ไอคอนของตัวเอง แล้วชี้ไปหมวดบัญชีหนึ่งหมวด */
      /* เอกสารทั้งทริป — เซิร์ฟเวอร์แนบชื่อสถานที่มาให้แล้ว (stop_name)
         หน้าจอจึงจัดกลุ่มตามสถานที่ได้เลยโดยไม่ต้องจับคู่เอง */
      documents: (payload.documents || []).map(row => ({
        id: row.doc_id,
        stopId: row.stop_id || '',
        stopName: row.stop_name || '',
        name: row.name,
        url: row.url,
        kind: row.kind || 'link',
        contentType: row.content_type || '',
        sizeBytes: row.size_bytes || 0
      })),
      presets: (payload.presets || []).map(row => ({
        id: row.preset_id,
        label: row.label,
        icon: row.icon_url || '',
        categoryId: row.category_id || '',
        categoryName: row.category_name || '',
        sortOrder: row.sort_order ?? 0
      })),
      netLedgerThb: payload.ledger?.net_thb ?? 0,
      hiddenExpenseCount: payload.meta?.hidden_expense_count ?? 0,
      /* สิทธิ์จัดการทริป — เซิร์ฟเวอร์คิดให้แล้ว (รวมผู้ดูแลระบบครอบครัว
         ที่ไม่ได้เป็นสมาชิกทริป) หน้าจอห้ามเดาซ้ำจากรายชื่อสมาชิกอย่างเดียว */
      canManageTrip: Boolean(payload.meta?.can_manage_trip),
      canViewTripData: payload.meta?.can_view_trip_data !== false,
      canManageMembers: Boolean(payload.meta?.can_manage_members),
      canManageSharedSettings: Boolean(payload.meta?.can_manage_shared_settings),
      // เข้ามาด้วยรหัสผู้ร่วมทริปหรือไม่ — ใช้ซ่อนปุ่มที่กดไปก็โดนปฏิเสธ
      isGuest: Boolean(payload.meta?.is_guest)
    };
  }

  /* token มาก่อน x-user-id เสมอ · ยังส่ง x-user-id ไปด้วยเพื่อให้ใช้ได้
     ระหว่างที่เซิร์ฟเวอร์ยังอยู่ในช่วงเปลี่ยนผ่าน */
  /* token ของผู้ร่วมทริป (เข้าด้วยรหัสจาก join.html) — เก็บคนละคีย์กับ
     session ของระบบครอบครัวโดยตั้งใจ จะได้ไม่เตะกันเองในเครื่องเดียวกัน */
  const memberToken = () => {
    try { return localStorage.getItem('trip_member_token') || ''; } catch { return ''; }
  };

  function authHeaders() {
    const token = sessionToken();
    /* สมาชิกครอบครัวมาก่อนเสมอ — ถ้าเครื่องนี้ล็อกอินระบบบัญชีไว้ ให้ใช้สิทธิ์นั้น
       ไม่ใช่สิทธิ์ผู้ร่วมทริปซึ่งแคบกว่า (เจ้าของเครื่องจะได้ไม่งงว่าทำไมทำอะไรไม่ได้)
       ผู้ร่วมทริปไม่มี x-user-id เลย เพราะไม่ได้เป็นผู้ใช้ของระบบ */
    if (token) return { 'x-user-id': config.userId, Authorization: `Bearer ${token}` };
    const guest = memberToken();
    if (guest) return { Authorization: `Bearer ${guest}` };
    return { 'x-user-id': config.userId };
  }

  async function fetchTrip() {
    if (!config.projectId) throw new Error('ต้องระบุ projectId ใน URL');
    // มี token ก็พอ เซิร์ฟเวอร์รู้เองว่าเป็นใคร ไม่ต้องพึ่ง userId ฝั่งหน้าจอ
    /* ผู้ร่วมทริปไม่มี userId และไม่มี session ของระบบครอบครัว — มีแต่ token
       ของตัวเอง จึงต้องนับเป็น "ล็อกอินแล้ว" ด้วย ไม่งั้นจะโดนด่านนี้ปัดตกทั้งที่
       เข้าระบบมาถูกต้อง */
    if (!config.userId && !sessionToken() && !memberToken()) {
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
  async function send(method, path, { body, query = '', projectId = config.projectId } = {}) {
    const url = `${config.base}/api/unified-trip${path}?projectId=${encodeURIComponent(projectId)}${query}`;
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
    receipt_image_url: bill.receiptUrl || null,
    /* จุดแวะที่บิลนี้เกิดขึ้น — ทำให้หน้าบิลบอกได้ว่า "จ่ายที่ไหน"
       และหน้าแผนเที่ยวบอกได้ว่าจุดนี้ใช้เงินไปเท่าไรเทียบกับงบที่ตั้งไว้
       ฟอร์มมีช่องนี้มานานแล้ว แต่ค่าไม่เคยถูกส่งขึ้นเซิร์ฟเวอร์เลย */
    stop_id: bill.activityId || null,
    visibility: String(bill.visibility || 'trip').toUpperCase(),
    is_shared: Boolean(bill.shared),
    split_mode: String(bill.splitMode || 'equal').toUpperCase(),
    categories: (bill.categories || []).map(row => ({
      label: row.name,
      category_id: row.categoryId || undefined,
      // ผูกกลับไปที่รายการย่อยของทริป เพื่อให้แก้ชื่อ/ไอคอนทีหลังแล้วบิลนี้เปลี่ยนตาม
      preset_id: row.presetId || undefined,
      amount_foreign: row.amount
    })),
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
      exclude_on_close: Boolean(wallet.excludeOnClose),
      // CASH = เติมเงินก่อนใช้ · CREDIT = บัตรเครดิต ยอดบาทจริงมาตอนปิดทริป
      kind: wallet.kind || 'CASH',
      account_id: wallet.accountId || null,
      // ⚠️ ?? ไม่ใช่ || — องศา 0 คือสีแดง ไม่ใช่ "ไม่ได้เลือกสี"
      color_hue: wallet.colorHue ?? null
    }
  });

  /* ⚠️ ไม่ส่ง rate ขึ้นไป — เซิร์ฟเวอร์คำนวณ thb ÷ foreign เอง
     ถ้าหน้าจอส่งไปด้วย เลขที่เก็บอาจไม่ตรงกับเงินที่จ่ายจริง */
  const saveFunding = lot => send('POST', '/fundings', {
    body: {
      /* id ที่ขึ้นต้นด้วย f- คือของที่หน้าจอตั้งเองในโหมดตัวอย่าง ยังไม่เคยขึ้นเซิร์ฟเวอร์
         ส่งขึ้นไปจะกลายเป็น 404 "ไม่พบรายการที่จะแก้ไข" ทั้งที่ตั้งใจจะเพิ่มใหม่ */
      funding_id: lot.id && !lot.id.startsWith('f-') ? lot.id : undefined,
      wallet_id: lot.walletId, thb_amount: lot.thb, foreign_amount: lot.foreign,
      funding_date: lot.date, note: lot.note || null
    }
  });
  const removeFunding = id => send('DELETE', '/fundings', { query: `&id=${encodeURIComponent(id)}` });
  const removeWallet = id => send('DELETE', '/wallets', { query: `&id=${encodeURIComponent(id)}` });

  /* ส่งลำดับทั้งชุด ไม่ใช่ส่งทีละคู่ที่สลับ — "ครั้งสุดท้ายชนะ" เข้าใจง่ายกว่า
     และไม่มีสถานะกลางที่ผิดเมื่อมีคนแก้พร้อมกัน */
  const reorderExpenses = ids => send('POST', '/expenses/reorder', { body: { order: ids } });

  /* หน้ากระเป๋าแสดงบิลกับการเติมเงินปนกัน ลำดับจึงต้องข้ามสองตารางได้
     items = [{ kind:'bill'|'fund', id }] เรียงตามที่ต้องการให้เห็นบนจอ */
  const reorderActivity = items => send('POST', '/activity/reorder', { body: { order: items } });

  /* เพิ่ม/แก้สมาชิกในทริป — ผู้ดูแลเท่านั้น (เซิร์ฟเวอร์ตรวจอีกชั้น)
     ⚠️ id ที่ขึ้นต้นด้วย m- คือของที่หน้าจอตั้งเองในโหมดตัวอย่าง ยังไม่เคยขึ้นเซิร์ฟเวอร์
        ส่งขึ้นไปจะได้ 404 ทั้งที่ตั้งใจจะเพิ่มใหม่ */
  const saveMember = member => send('POST', '/members', {
    body: {
      member_id: member.id && !member.id.startsWith('m-') ? member.id : undefined,
      display_name: member.name, role: member.role || null,
      ledger_mode: member.ledgerMode || 'MAIN', is_admin: Boolean(member.admin),
      avatar_url: member.avatar || null,
      // ผูกบัญชีครอบครัว (บังคับเมื่อ MAIN) · ผู้ดูแลรายคน (ไม่บังคับ)
      user_id: member.userId || null,
      managed_by: member.managedBy || null
    }
  });
  const removeMember = id => send('DELETE', '/members', { query: `&id=${encodeURIComponent(id)}` });

  /* ปิดทริป — ยอดที่ลงบัญชีเซิร์ฟเวอร์คิดเองจากผู้ร่วมจ่ายจริง หน้าจอไม่ส่งขึ้นไป
     บัญชีปลายทางก็เช่นกัน: มาจากบัญชีที่ผูกไว้กับกระเป๋าที่จ่ายบิลใบนั้น
     ไม่ใช่ค่าที่หน้าจอส่งมา จึงไม่มีทางลืมส่งแล้วเงียบไปทั้งก้อนเหมือนเดิม

     เงินเหลือค่าเริ่มต้นคือ "ปล่อยไว้" (KEEP) ไม่ต้องตอบก่อนปิดอีกแล้ว */
  const closeTrip = ({ postingDate, lines, reason, settlements, fxCategoryId }) => send('POST', '/closures', {
    body: {
      posting_date: postingDate, reason: reason || null,
      // ยอดบาทจริงของบิลบัตรเครดิต — กรอกทีละบิลเพราะธนาคารแปลงค่าเงินทีละรายการ
      settlements: settlements || [],
      // หมวดตั้งต้นของ FX — แต่ละกระเป๋าแทนที่ด้วยของตัวเองได้
      fx_category_id: fxCategoryId || null,
      lines: lines.map(line => {
        if (line.mode === 'carry') {
          return { wallet_id: line.walletId, disposition: 'CARRY',
                   carry_currency: line.carryCurrency, carry_amount: line.carryAmount };
        }
        // ปล่อยไว้ = ไม่แตะเงินเลย ไม่มียอดรับคืน ไม่มีกำไร/ขาดทุน จึงไม่ต้องมีบัญชีหรือหมวด
        if (line.mode === 'keep') {
          return { wallet_id: line.walletId, disposition: 'KEEP' };
        }
        /* 🔴 บัญชี/หมวดของกำไร-ขาดทุนติดมากับบรรทัดของกระเป๋าใบนั้น
           ห้ามรวมข้ามกระเป๋า — แต่ละใบแลกคืนเข้าคนละบัญชีได้ */
        return { wallet_id: line.walletId, disposition: 'RETURN', received_thb: line.receivedThb,
                 fx_account_id: line.fxAccountId || null, fx_category_id: line.fxCategoryId || null };
      })
    }
  });

  const reopenTrip = reason => send('POST', '/closures/reopen', { body: { reason } });

  /* ชื่อทริป/ช่วงวันที่/ประเภท — ส่งเฉพาะช่องที่กรอกมา ช่องว่างแปลว่า "ไม่ระบุ"
     ไม่ใช่ "ลบของเดิม" ฝั่งเซิร์ฟเวอร์คงค่าเดิมไว้ถ้าไม่ส่งคีย์นั้นมา
     tripStage ไม่ส่งมา = ไม่แตะประเภทเดิม (ตัวเลือก Ongoing/Dream/Memory) */
  const saveTripMeta = ({ name, startDate, endDate, tripStage, themeId }) => send('POST', '/trip', {
    body: {
      name, start_date: startDate || '', end_date: endDate || '',
      ...(tripStage !== undefined ? { trip_stage: tripStage } : {}),
      // themeId ไม่ส่งมา = ไม่แตะธีมเดิม (เหมือน tripStage)
      ...(themeId !== undefined ? { theme_id: themeId } : {})
    }
  });

  /* ── หน้ารวมทริป (Ongoing/Dream/Memory) ─────────────────────────────
     สามอันนี้ไม่ผูกกับทริปใดทริปหนึ่ง ไม่ต้องมี projectId ใน URL
     ใช้ได้แม้เปิดหน้านี้แบบไม่มี ?projectId= เลย (เช่นหน้ารวมทริป) */
  const listTrips = () => send('GET', '/trips', {});

  const createTrip = ({ name, startDate, endDate, tripStage }) => send('POST', '/trips', {
    body: { name, start_date: startDate || '', end_date: endDate || '', trip_stage: tripStage || 'DREAM' }
  });

  /* ลบทริปนี้ — เซิร์ฟเวอร์เองจะปฏิเสธถ้าทริปนี้เคยโพสต์เข้าบัญชีจริงแล้ว
     (409 พร้อมข้อความอธิบาย) หน้าจอไม่ต้องเดาเงื่อนไขเอง ส่งต่อ error ตรง ๆ */
  const deleteTrip = (projectId = config.projectId) => send('DELETE', '/trip', { projectId });

  /* แบนเนอร์เก็บที่ Projects.theme_banner ตัวเดียวกับที่แอปหลักใช้
     จะได้ไม่มีสองที่เก็บรูปคนละอันแล้วขัดกัน · ส่ง path ตามที่เห็นบนจอ
     ฝั่งเซิร์ฟเวอร์ตัด ../ นำหน้าออกก่อนเก็บ เพราะแอปหลักอ่านจากอีกระดับ */
  const saveBanner = url => send('POST', '/trip', { body: { theme_banner: url } });

  /* จุดแวะ — id ที่ prototype สร้างเองขึ้นต้นด้วย activity- ไม่ใช่ของจริงในฐาน
     ต้องไม่ส่งขึ้นไป ไม่งั้นเซิร์ฟเวอร์จะหาไม่เจอแล้วตอบ 404 ทั้งที่เป็นการสร้างใหม่ */
  const saveStop = ({ id, dayDate, time, endTime, name, detail, tag, icon, visitStatus, skippedReason, highlight, plannedCost, plannedCurrency, mapcode, openTime, closeTime, closedDays, booking }) => send('POST', '/stops', {
    body: {
      stop_id: id && !id.startsWith('activity-') ? id : undefined,
      stop_date: dayDate,
      time: time || undefined,
      end_time: endTime || undefined,
      name_th: name,
      notes: detail,
      accommodation: tag === 'ที่พัก' ? detail || name : undefined,
      /* ประเภทถูกเก็บจริงแล้วตั้งแต่ 2026-09-07 (คอลัมน์ TripStops.stop_tag)
         accommodation ข้างบนยังต้องส่งต่อไป เพราะของเก่าทั้งฐานใช้ช่องนั้นบอก
         "ที่พัก" อยู่ และหน้าอื่นยังอ่านจากตรงนั้น */
      stop_tag: tag || undefined,
      icon_asset: icon || undefined,
      visit_status: visitStatus || undefined,
      skipped_reason: skippedReason || undefined,
      highlight_text: highlight,
      /* '' = ล้างงบทิ้ง · undefined = ไม่แตะของเดิม — สองอย่างนี้ต้องต่างกัน
         ไม่งั้นเปิดฟอร์มแล้วกดบันทึกเฉย ๆ จะไปล้างงบที่ตั้งไว้โดยไม่ตั้งใจ */
      planned_cost: plannedCost === undefined ? undefined : (plannedCost === '' ? '' : Number(plannedCost)),
      planned_currency: plannedCurrency || undefined,
      mapcode: mapcode === undefined ? undefined : mapcode,
      open_time: openTime === undefined ? undefined : openTime,
      close_time: closeTime === undefined ? undefined : closeTime,
      closed_days: closedDays === undefined ? undefined : (closedDays || []).join(','),
      /* การจอง: undefined = ไม่แตะ · null = ลบ · object = สร้าง/แก้ (กติกาเดียวกับเซิร์ฟเวอร์) */
      booking
    }
  });
  const removeStop = id => send('DELETE', '/stops', { query: `&id=${encodeURIComponent(id)}` });

  /* ส่งลำดับทั้งชุด ไม่ใช่ทีละแถว — ลากทีเดียวกระทบหลายแถว ถ้ายิงทีละอันแล้ว
     ขาดกลางคัน ลำดับในฐานจะค้างครึ่ง ๆ ไม่ตรงกับที่เห็นบนจอ */
  const reorderStops = stops => send('POST', '/stops/order', { body: { stops } });
  const saveDayTitle = (planDate, title) => send('POST', '/days', {
    body: { plan_date:planDate, title }
  });
  /* เพิ่ม/แก้ "วัน" ในแผน (2026-09-07) — วันมีตัวตนของตัวเองแล้ว ไม่ต้องมี
     สถานที่ก่อนถึงจะมีวันได้ · newDate มีค่า = ย้ายวัน (พาจุดแวะไปด้วยทั้งหมด) */
  const saveDay = ({ date, title = '', newDate = '' }) => send('POST', '/days', {
    body: { plan_date: date, title, new_plan_date: newDate || '' }
  });
  // ลบไม่ได้ถ้ายังมีสถานที่ในวันนั้น — เซิร์ฟเวอร์ตอบ 409 พร้อมบอกจำนวน
  const removeDay = date => send('DELETE', '/days', { query: `&date=${encodeURIComponent(date)}` });

  /* ── รายการค่าใช้จ่ายย่อยของทริป ─────────────────────────────────────
     ชื่อ+ไอคอน+หมวดบัญชีที่ผูก · id ที่หน้าจอสร้างเองขึ้นต้นด้วย new- ไม่ใช่ของจริง
     ในฐาน ต้องไม่ส่งขึ้นไป ไม่งั้นเซิร์ฟเวอร์จะหาไม่เจอแล้วตอบ 404 ตอนสร้างใหม่ */
  const savePreset = ({ id, label, icon, categoryId, sortOrder }) => send('POST', '/presets', {
    body: {
      preset_id: id && !id.startsWith('new-') ? id : undefined,
      label, icon_url: icon || null,
      category_id: categoryId || null,
      sort_order: sortOrder ?? 0
    }
  });
  const removePreset = id => send('DELETE', '/presets', { query: `&id=${encodeURIComponent(id)}` });

  /* คัดลอกรายการทั้งชุดจากทริปอื่น — คืน { copied, skipped } เพื่อให้หน้าจอ
     บอกผลได้ตรง ๆ ว่าได้มากี่รายการ และข้ามไปกี่รายการเพราะชื่อซ้ำ */
  /* ผู้ดูแลตั้ง/ล้างรหัสของสมาชิก · ส่งรหัสว่าง = ถอนสิทธิ์ (เตะ session เดิมออกด้วย) */
  const setMemberPasscode = (memberId, passcode) => send('POST', '/members/passcode', {
    body: { member_id: memberId, passcode }
  });

  /* ออกจากระบบผู้ร่วมทริป — ลบเฉพาะ token ของตัวเอง ไม่แตะ session ครอบครัว */
  const signOutMember = () => {
    try {
      localStorage.removeItem('trip_member_token');
      localStorage.removeItem('trip_member_name');
    } catch {}
  };

  const copyPresets = fromProjectId => send('POST', '/presets/copy', {
    body: { from_project_id: fromProjectId }
  });

  /* ── เอกสารประจำทริป ─────────────────────────────────────────────────
     ใบจอง ตั๋ว ประกัน — ผูกกับจุดแวะ (stopId) หรือเว้นว่าง = ระดับทริป
     kind: 'file' = อัปโหลดเข้าระบบแล้ว · 'link' = ลิงก์ภายนอก เช่น Google Drive */
  const saveDocument = ({ id, stopId, name, url, kind, contentType, sizeBytes }) =>
    send('POST', '/documents', {
      body: {
        doc_id: id || undefined,
        stop_id: stopId || '',
        name, url, kind: kind || 'link',
        content_type: contentType || undefined,
        size_bytes: sizeBytes || undefined
      }
    });
  const removeDocument = id => send('DELETE', '/documents', { query: `&id=${encodeURIComponent(id)}` });

  /* พยากรณ์อากาศของวันหนึ่ง ๆ — คืน { available, kind: 'forecast'|'historical', … }
     kind สำคัญมาก: historical = ค่าเฉลี่ยปีก่อน ไม่ใช่พยากรณ์ ห้ามแสดงปนกัน */
  const weatherFor = (date, stopId = '') => send('GET', '/weather', {
    query: `&date=${encodeURIComponent(date)}${stopId ? `&stopId=${encodeURIComponent(stopId)}` : ''}`
  });

  /* เติมพิกัดให้จุดแวะที่ยังไม่มี — หน้าแผนที่เรียกก่อนวาดหมุด
     offset = จำนวนจุดที่รอบก่อนค้นไม่เจอ (ต้องข้ามไป ไม่งั้นวนค้นซ้ำจุดเดิม)
     คืน { filled, failed, scanned, remaining } */
  const geocodeStops = (offset = 0) =>
    send('GET', '/geocode-stops', { query: `&offset=${offset}` });

  /* ระยะ/เวลาขับจริงระหว่างจุดที่ติดกันในวันเดียวกัน (OSRM · แคชฝั่งเซิร์ฟเวอร์)
     คืน { legs: [{from_stop_id,to_stop_id,meters,seconds,source}], remaining }
     ⚠️ source='straight' = OSRM ตอบไม่ได้ ค่านี้เป็นการประมาณจากเส้นตรง
        หน้าจอต้องเขียนกำกับให้ต่างจากค่าจริง */
  const routeLegs = () => send('GET', '/route', {});

  /* เช็กอินของสมาชิกคนปัจจุบัน · ไม่ส่ง member_id เพราะเซิร์ฟเวอร์ยึดตัวตน
     จาก session เท่านั้น ป้องกันการเช็กอินแทนคนอื่น */
  const checkIn = ({ stopId, latitude, longitude }) => send('POST', '/presence', {
    body: {
      stop_id: stopId,
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined
    }
  });

  /* อัปโหลดไฟล์เอกสาร — ใช้ทางเดียวกับรูป แต่ไม่ผ่าน canvas เพราะ PDF
     ย่อขนาดไม่ได้และไม่ควรแตะต้องเนื้อไฟล์ ส่งขึ้นตรง ๆ ตามต้นฉบับ */
  /* คลังรูปที่อัปโหลดเอง — ลิสต์ได้ทุกคน แต่ลบได้เฉพาะผู้ดูแลระบบครอบครัว
     (เซิร์ฟเวอร์คืน can_delete มาให้ หน้าจอใช้ตัดสินว่าจะโชว์ปุ่มลบไหม) */
  /* ⚠️ ทั้งสองเส้นทางนี้ผูกกับ "ครอบครัว" ไม่ใช่ทริป — เซิร์ฟเวอร์เช็คก่อนด่าน
     projectId อยู่แล้ว การที่ send() แนบ ?projectId= มาด้วยจึงไม่มีผล */
  /* บัญชีในครอบครัว — ใช้เป็นตัวเลือกตอนผูกสมาชิกที่ลงบัญชีหลัก */
  const listFamilyUsers = () => send('GET', '/family-users');
  /* บัญชีเงินฝากในครอบครัว — ใช้ผูกกับกระเป๋าว่าเงินก้อนนี้ออกจากบัญชีไหน */
  const listFamilyAccounts = () => send('GET', '/family-accounts');

  const listUploadedIcons = () => send('GET', '/icon-upload');
  const removeUploadedIcon = key => send('DELETE', '/icon-upload', {
    query: `&key=${encodeURIComponent(key)}`
  });

  const uploadDocument = file => uploadIcon(file, file.name);

  /* ── ไอคอนที่ครอบครัวอัปโหลดเอง ───────────────────────────────────────
     อัปโหลดไฟล์จริงขึ้น R2 บนเซิร์ฟเวอร์ คืน URL ถาวรที่ทุกคนในครอบครัว
     เห็นเหมือนกัน ต่างจาก data: URL เดิมที่เห็นเฉพาะเบราว์เซอร์ที่อัปโหลด
     ไม่ผ่าน send() เพราะต้องส่ง multipart ไม่ใช่ JSON */
  const uploadIcon = async (blob, filename) => {
    const form = new FormData();
    form.append('file', blob, filename || 'icon.webp');
    const response = await fetch(`${config.base}/api/unified-trip/icon-upload`, {
      method: 'POST', headers: authHeaders(), body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `อัปโหลดไม่สำเร็จ (${response.status})`);
    return payload.url;
  };

  /* ไอคอนประจำหมวดค่าใช้จ่าย — ผูกกับ Categories.icon_asset ของครอบครัว
     ไม่ใช่ของทริปใดทริปหนึ่ง ทุกทริปในครอบครัวเห็นชุดเดียวกัน */
  const loadCategoryIcons = () => send('GET', '/category-icons', {});
  const saveCategoryIcon = (categoryId, iconUrl) => send('POST', '/category-icons', {
    body: { category_id: categoryId, icon_url: iconUrl }
  });

  return {
    config, fetchTrip, toPrototypeState, toExpenseBody,
    saveExpense, removeExpense, saveCurrency, removeCurrency,
    saveMember, removeMember, saveWallet, removeWallet, reorderExpenses, reorderActivity, saveFunding, removeFunding, closeTrip, reopenTrip,
    saveStop, removeStop, reorderStops, saveDayTitle, saveDay, removeDay, saveTripMeta, saveBanner,
    listTrips, createTrip, deleteTrip, authHeaders, sessionToken, bannerPath,
    uploadIcon, listFamilyUsers, listFamilyAccounts, listUploadedIcons, removeUploadedIcon, loadCategoryIcons, saveCategoryIcon, savePreset, removePreset, copyPresets,
    saveDocument, removeDocument, uploadDocument, weatherFor, geocodeStops, routeLegs, checkIn,
    setMemberPasscode, memberToken, signOutMember
  };
})();
