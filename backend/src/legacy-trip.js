// ═══════════════════════════════════════════════════════════════
// ระบบทริปรุ่นเก่า (Legacy Trip) — ใช้กับหน้าเว็บเก่า app.js / travel.js เท่านั้น
// แยกออกจาก index.js เมื่อ 2026-10-07 เพื่อให้สมุดจดค่าใช้จ่ายแก้ได้โดยไม่แตะทริป
// แอปทริปปัจจุบัน (Enjoy Life Trip) ใช้ /api/unified-trip ใน unified-trip.js ไม่ใช่ไฟล์นี้
// คืน null ถ้าไม่ใช่ path ของตัวเอง (แบบเดียวกับ handleUnifiedTrip)
// ═══════════════════════════════════════════════════════════════

// คำนวณยอดกระเป๋าทริป: funded = ตั้งต้น + ทุกล็อตเติม, spent = Σบิล,
// เรทเฉลี่ยถ่วงน้ำหนัก = Σบาท ÷ Σเงินตปท. (ไม่ขึ้นกับลำดับ/วันที่บันทึก)
async function computeTripWallets(env, projectId) {
  const wallets = await env.DB.prepare(`
    SELECT w.*,
      (w.initial_balance_foreign + COALESCE((SELECT SUM(foreign_amount) FROM TripWalletFundings f WHERE f.wallet_id=w.wallet_id),0)) AS funded_foreign,
      (w.initial_balance_thb     + COALESCE((SELECT SUM(thb_amount)     FROM TripWalletFundings f WHERE f.wallet_id=w.wallet_id),0)) AS funded_thb,
      COALESCE((SELECT SUM(COALESCE(amount_foreign, amount_thb, 0)) FROM TripExpenses e WHERE e.wallet_id=w.wallet_id AND IFNULL(e.approved,1)!=0),0) AS spent_foreign
    FROM TripWallets w WHERE w.project_id = ? ORDER BY w.created_at ASC
  `).bind(projectId).all();
  return (wallets.results || []).map(w => {
    const ff = Number(w.funded_foreign) || 0;
    const ft = Number(w.funded_thb) || 0;
    const sf = Number(w.spent_foreign) || 0;
    const avg_rate = ff > 0 ? ft / ff : 0;            // บาทต่อ 1 หน่วยเงินตปท.
    const leftover_foreign = ff - sf;
    return { ...w, avg_rate, leftover_foreign, leftover_thb: leftover_foreign * avg_rate };
  });
}

// สรุปยอดปิดทริป: ล็อกค่าบาทของแต่ละบิลด้วยเรทเฉลี่ยของกระเป๋า → รวมต่อ member/caption
async function computeTripCloseSummary(env, projectId) {
  const wallets = await computeTripWallets(env, projectId);
  const wmap = {}; wallets.forEach(w => { wmap[w.wallet_id] = w; });
  const exp = await env.DB.prepare(`
    SELECT e.*, c.name AS cat_name, cp.type_id AS caption_id, cp.name AS caption_name,
           u.name AS member_name
    FROM TripExpenses e
    LEFT JOIN Categories c ON e.category_id = c.category_id
    LEFT JOIN Captions   cp ON c.caption_id = cp.type_id
    LEFT JOIN Users      u ON e.member_id = u.user_id
    WHERE e.project_id = ? AND IFNULL(e.type,'EXPENSE') != 'TOPUP' AND IFNULL(e.approved,1) != 0
  `).bind(projectId).all().catch(() => ({ results: [] }));

  const bills = (exp.results || []).map(e => {
    const w = wmap[e.wallet_id];
    const avg = w && Number(w.avg_rate) > 0 ? Number(w.avg_rate) : 0;
    const hasForeign = e.amount_foreign != null && Number(e.amount_foreign) > 0;
    const final_thb = (hasForeign && avg > 0) ? Number(e.amount_foreign) * avg : Number(e.amount_thb || 0);
    return { ...e, final_thb: Math.round(final_thb * 100) / 100, used_rate: avg };
  });

  // รวมต่อ member (คนจ่าย) + แยก caption
  const members = {};
  bills.forEach(b => {
    const mid = b.member_id || 'unknown';
    if (!members[mid]) members[mid] = { member_id: mid, member_name: b.member_name || 'ไม่ระบุ', total_thb: 0, byCaption: {} };
    members[mid].total_thb += b.final_thb;
    const cap = b.caption_name || b.cat_name || 'ไม่ระบุหมวด';
    members[mid].byCaption[cap] = (members[mid].byCaption[cap] || 0) + b.final_thb;
  });

  const funded_thb  = wallets.reduce((s, w) => s + Number(w.funded_thb || 0), 0);
  const spent_thb   = bills.reduce((s, b) => s + b.final_thb, 0);
  const leftover_thb = wallets.reduce((s, w) => s + (Number(w.exclude_on_close) === 1 ? 0 : Number(w.leftover_thb || 0)), 0);
  const kept_thb    = wallets.reduce((s, w) => s + (Number(w.exclude_on_close) === 1 ? Number(w.leftover_thb || 0) : 0), 0);
  const diff = funded_thb - (spent_thb + leftover_thb + kept_thb);

  return {
    wallets, bills,
    members: Object.values(members),
    totals: {
      funded_thb: Math.round(funded_thb * 100) / 100,
      spent_thb: Math.round(spent_thb * 100) / 100,
      leftover_thb: Math.round(leftover_thb * 100) / 100,
      kept_thb: Math.round(kept_thb * 100) / 100,
      diff: Math.round(diff * 100) / 100
    },
    balanced: Math.abs(diff) < 1
  };
}

// ตรวจว่า user อยู่ครอบครัวเดียวกับทริปก่อนแก้ข้อมูลการเงิน
async function getAccessibleTrip(env, userId, projectId) {
  if (!userId || !projectId) return null;
  return env.DB.prepare(`
    SELECT p.project_id, p.family_id, p.status
    FROM Projects p
    JOIN Users u ON u.user_id = ?
    WHERE p.project_id = ? AND p.family_id = u.family_id
  `).bind(userId, projectId).first();
}

// บัญชีพักเป็น Accounts ที่ระบบสร้างและไม่ให้ผู้ใช้จัดการเอง
// ใช้ยอด THB ใน ledger ส่วนยอดสกุลต่างประเทศยังคงคำนวณจาก TripWalletFundings/TripExpenses
async function ensureTripHoldingAccount(env, wallet, sourceAccount) {
  const existing = await env.DB.prepare(`SELECT account_id, entity_id FROM TripHoldingAccounts WHERE wallet_id=?`).bind(wallet.wallet_id).first();
  if (existing) {
    if (existing.entity_id !== sourceAccount.entity_id) throw new Error('กระเป๋าทริปนี้ผูกกับ owner คนละรายกับบัญชีต้นทาง');
    return existing.account_id;
  }
  const accountId = `THA-${wallet.wallet_id}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance, account_type)
                    VALUES (?, ?, ?, 'Trip Holding', NULL, 0, 'TRIP_HOLDING')`)
      .bind(accountId, sourceAccount.entity_id, `🔒 ${wallet.name} · ${wallet.currency}`),
    env.DB.prepare(`INSERT INTO TripHoldingAccounts (wallet_id, project_id, account_id, entity_id, currency)
                    VALUES (?, ?, ?, ?, ?)`)
      .bind(wallet.wallet_id, wallet.project_id, accountId, sourceAccount.entity_id, wallet.currency)
  ]);
  return accountId;
}

async function getTransferCategory(env, familyId) {
  const row = await env.DB.prepare(
    `SELECT c.category_id FROM Categories c JOIN Captions cp ON c.caption_id=cp.type_id
     WHERE c.family_id=? AND cp.behavior='TRANSFER' LIMIT 1`
  ).bind(familyId).first();
  return row ? row.category_id : 'Cat_Uncategorized';
}


export async function handleLegacyTrip(request, env, url, corsHeaders, authUserId) {
  // Trip Stops API
  if (url.pathname === '/api/trip-stops') {
    const projectId = url.searchParams.get('projectId');
    
    if (request.method === 'GET') {
      if (!projectId) return new Response(JSON.stringify({error: 'Missing projectId'}), {status: 400, headers: {...corsHeaders, 'Content-Type': 'application/json'}});
      const stops = await env.DB.prepare(`SELECT * FROM TripStops WHERE project_id = ? ORDER BY stop_date ASC, time ASC`).bind(projectId).all();
      return new Response(JSON.stringify(stops.results), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
    }
    
    if (request.method === 'POST') {
      const { stop_id, project_id, stop_date, time, end_time, city, accommodation, restaurants, notes, location_type, parent_stop_id, icon, icon_asset, is_main_day, marker_color, header_color, font_size, text_color, time_color, border_color, label_position } = await request.json();
      
      const b_stop_date = stop_date || null;
      const b_time = time || null;
      const b_end_time = end_time || null;
      const b_city = city || null;
      const b_accommodation = accommodation || null;
      const b_restaurants = restaurants || null;
      const b_notes = notes || null;
      const b_location_type = location_type || null;
      const b_parent_stop_id = parent_stop_id || null;
      const b_icon = icon || null;
      const b_icon_asset = icon_asset || null;
      const b_is_main_day = is_main_day ? 1 : 0;
      const b_marker_color = marker_color || null;
      const b_header_color = header_color || null;
      const b_font_size = font_size || null;
      const b_text_color = text_color || null;
      const b_time_color = time_color || null;
      const b_border_color = border_color || null;
      const b_label_position = label_position || null;

      if (stop_id) {
        const existing = await env.DB.prepare(`SELECT * FROM TripStops WHERE stop_id = ?`).bind(stop_id).first();
        if (existing) {
          await env.DB.prepare(`
            UPDATE TripStops SET stop_date=?, time=?, end_time=?, city=?, accommodation=?, restaurants=?, notes=?, location_type=?, parent_stop_id=?, icon=?, icon_asset=?, is_main_day=?, marker_color=?, header_color=?, font_size=?, text_color=?, time_color=?, border_color=?, label_position=? WHERE stop_id=?
          `).bind(b_stop_date, b_time, b_end_time, b_city, b_accommodation, b_restaurants, b_notes, b_location_type, b_parent_stop_id, b_icon, b_icon_asset, b_is_main_day, b_marker_color, b_header_color, b_font_size, b_text_color, b_time_color, b_border_color, b_label_position, stop_id).run();
          return new Response(JSON.stringify({success: true}), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
        }
      }
      const newId = stop_id || crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO TripStops (stop_id, project_id, stop_date, time, end_time, city, accommodation, restaurants, notes, location_type, parent_stop_id, icon, icon_asset, is_main_day, marker_color, header_color, font_size, text_color, time_color, border_color, label_position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(newId, project_id, b_stop_date, b_time, b_end_time, b_city, b_accommodation, b_restaurants, b_notes, b_location_type, b_parent_stop_id, b_icon, b_icon_asset, b_is_main_day, b_marker_color, b_header_color, b_font_size, b_text_color, b_time_color, b_border_color, b_label_position).run();
      return new Response(JSON.stringify({success: true, stop_id: newId}), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
    }
    
    if (request.method === 'DELETE') {
      const { stop_id } = await request.json();
      // Also delete children (up to a reasonable depth or simply delete where parent is this stop)
      // Since it can be deeply nested, a simple approach is to fetch all stops and find all descendants, then delete them all.
      // For now, let's recursively delete 5 levels deep
      let idsToDelete = [stop_id];
      for(let i=0; i<5; i++) {
         const placeholders = idsToDelete.map(() => '?').join(',');
         const children = await env.DB.prepare(`SELECT stop_id FROM TripStops WHERE parent_stop_id IN (${placeholders})`).bind(...idsToDelete).all();
         if(children.results.length === 0) break;
         idsToDelete = idsToDelete.concat(children.results.map(r => r.stop_id));
      }
      
      const deletePlaceholders = idsToDelete.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM TripStops WHERE stop_id IN (${deletePlaceholders})`).bind(...idsToDelete).run();
      return new Response(JSON.stringify({success: true, deleted_count: idsToDelete.length}), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
    }
  }


  // ==========================================
  // TRAVEL EXPENSE TRACKER (TRIPS) ENDPOINTS
  // ==========================================

  if (url.pathname === '/api/trips' && request.method === 'GET') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const trips = await env.DB.prepare(`
      SELECT p.project_id, p.name, p.status, p.start_date, p.end_date, p.destination, p.members, p.total_budget, p.trip_password, p.route_data, p.created_at, p.theme_banner, p.theme_thumb, p.theme_icon, p.color_theme,
             (
               COALESCE((SELECT SUM(amount) FROM TransactionDetails WHERE project_id = p.project_id), 0) +
               COALESCE((SELECT SUM(amount_thb) FROM TripExpenses WHERE project_id = p.project_id AND type = 'EXPENSE'), 0)
             ) AS total_spent
      FROM Projects p
      WHERE p.family_id = ?
      ORDER BY p.start_date DESC, p.created_at DESC
    `).bind(userCheck.family_id).all();
    
    return new Response(JSON.stringify(trips.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips' && request.method === 'POST') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const data = await request.json();
    const { project_id, name, status, start_date, end_date, destination, members, total_budget, trip_password, theme_banner, theme_icon, theme_thumb, color_theme, highlights, active_currencies } = data;
    
    if (project_id) {
      await env.DB.prepare(`
        UPDATE Projects 
        SET name=?, status=?, start_date=?, end_date=?, destination=?, members=?, total_budget=?, trip_password=?, highlights=?, active_currencies=?
        WHERE project_id=? AND family_id=?
      `).bind(name, status || 'active', start_date || null, end_date || null, destination || null, members || null, total_budget || 0, trip_password || null, highlights || null, active_currencies || null, project_id, userCheck.family_id).run();
      
      if (theme_banner || theme_icon || theme_thumb || color_theme) {
         await env.DB.prepare(`
           UPDATE Projects SET theme_banner=COALESCE(?, theme_banner), theme_thumb=COALESCE(?, theme_thumb), theme_icon=COALESCE(?, theme_icon), color_theme=COALESCE(?, color_theme)
           WHERE project_id=? AND family_id=?
         `).bind(theme_banner || null, theme_thumb || null, theme_icon || null, color_theme || null, project_id, userCheck.family_id).run();
      }

      return new Response(JSON.stringify({ success: true, project_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      const new_id = 'TRP-' + Date.now();
      await env.DB.prepare(`
        INSERT INTO Projects (project_id, family_id, name, status, start_date, end_date, destination, members, total_budget, trip_password, theme_banner, theme_thumb, theme_icon, color_theme, highlights, active_currencies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(new_id, userCheck.family_id, name, status || 'active', start_date || null, end_date || null, destination || null, members || null, total_budget || 0, trip_password || null, theme_banner || null, theme_thumb || null, theme_icon || null, color_theme || null, highlights || null, active_currencies || null).run();
      return new Response(JSON.stringify({ success: true, project_id: new_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (url.pathname === '/api/trips/routes' && request.method === 'POST') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const { project_id, route_data } = await request.json();
    await env.DB.prepare(`
      UPDATE Projects 
      SET route_data=?
      WHERE project_id=? AND family_id=?
    `).bind(JSON.stringify(route_data || []), project_id, userCheck.family_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/delete' && request.method === 'POST') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const { project_id } = await request.json();
    await env.DB.prepare(`DELETE FROM Projects WHERE project_id=? AND family_id=?`).bind(project_id, userCheck.family_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/theme' && request.method === 'PUT') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const { project_id, theme_banner, theme_thumb, theme_icon } = await request.json();
    await env.DB.prepare(`
      UPDATE Projects SET theme_banner=?, theme_thumb=?, theme_icon=?
      WHERE project_id=? AND family_id=?
    `).bind(theme_banner || null, theme_thumb || null, theme_icon || null, project_id, userCheck.family_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/members' && request.method === 'PUT') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const { project_id, members } = await request.json();
    await env.DB.prepare(`
      UPDATE Projects SET members=?
      WHERE project_id=? AND family_id=?
    `).bind(members || null, project_id, userCheck.family_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/guest-login' && request.method === 'POST') {
    const { trip_password } = await request.json();
    const trip = await env.DB.prepare(`SELECT project_id FROM Projects WHERE trip_password = ? AND trip_password IS NOT NULL AND trip_password != ''`).bind(trip_password).first();
    if (!trip) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid Password' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, project_id: trip.project_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  
  if (url.pathname === '/api/travel' && request.method === 'GET') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    
    const trip = await env.DB.prepare(`SELECT * FROM Projects WHERE project_id = ? AND family_id = ?`).bind(projectId, userCheck.family_id).first();
    if (!trip) {
      return new Response(JSON.stringify({ success: false, error: 'Not Found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const expenses = await env.DB.prepare(`
      SELECT * FROM TripExpenses
      WHERE project_id = ?
      ORDER BY expense_date DESC, created_at DESC
    `).bind(projectId).all();
    
    const stops = await env.DB.prepare(`SELECT * FROM TripStops WHERE project_id = ? ORDER BY stop_date ASC, time ASC, created_at ASC`).bind(projectId).all();
    const wallets = await computeTripWallets(env, projectId);
    const documents = await env.DB.prepare(`SELECT * FROM TripDocuments WHERE project_id = ? ORDER BY created_at ASC`).bind(projectId).all();

    return new Response(JSON.stringify({ success: true, trip, expenses: expenses.results, stops: stops.results, wallets, documents: documents.results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (url.pathname === '/api/trips/guest' && request.method === 'POST') {
    const { project_id, trip_password } = await request.json();
    const trip = await env.DB.prepare(`SELECT * FROM Projects WHERE project_id = ? AND trip_password = ?`).bind(project_id, trip_password).first();
    if (!trip) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid ID or Password' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const expenses = await env.DB.prepare(`
      SELECT * FROM TripExpenses
      WHERE project_id = ?
      ORDER BY expense_date DESC, created_at DESC
    `).bind(project_id).all();

    const stops = await env.DB.prepare(`SELECT * FROM TripStops WHERE project_id = ? ORDER BY stop_date ASC, time ASC, created_at ASC`).bind(project_id).all();
    const wallets = await computeTripWallets(env, project_id);
    const documents = await env.DB.prepare(`SELECT * FROM TripDocuments WHERE project_id = ? ORDER BY created_at ASC`).bind(project_id).all();

    return new Response(JSON.stringify({ success: true, trip, expenses: expenses.results, stops: stops.results, wallets, documents: documents.results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trip-expenses' && request.method === 'GET') {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    
    const expenses = await env.DB.prepare(`
      SELECT te.*, c.name as category_name, a.name as account_name
      FROM TripExpenses te
      LEFT JOIN Categories c ON te.category_id = c.category_id
      LEFT JOIN Accounts a ON te.paid_from_account_id = a.account_id
      WHERE te.project_id = ?
      ORDER BY te.expense_date DESC, te.created_at DESC
    `).bind(projectId).all();
    
    return new Response(JSON.stringify(expenses.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trip-expenses' && request.method === 'POST') {
    const data = await request.json();
    const { trip_expense_id, project_id, expense_date, member_id, category_id, amount_foreign, amount_thb, stop_id, paid_from_account_id, latitude, longitude, receipt_image_url, note, type, wallet_id, approved } = data;
    
    if (!project_id || !expense_date || amount_thb === undefined) {
       return new Response('Missing required fields', { status: 400, headers: corsHeaders });
    }
    
    const txType = type || 'EXPENSE';
    const b_wallet_id = wallet_id || null;
    const b_approved = approved !== undefined ? approved : 1;

    if (trip_expense_id) {
      await env.DB.prepare(`
        UPDATE TripExpenses
        SET expense_date=?, member_id=?, category_id=?, amount_foreign=?, amount_thb=?, stop_id=?, paid_from_account_id=?, latitude=?, longitude=?, receipt_image_url=?, note=?, type=?, wallet_id=?, approved=?
        WHERE trip_expense_id=? AND project_id=?
      `).bind(expense_date, member_id || null, category_id || null, amount_foreign || null, amount_thb, stop_id || null, paid_from_account_id || null, latitude || null, longitude || null, receipt_image_url || null, note || null, txType, b_wallet_id, b_approved, trip_expense_id, project_id).run();
      return new Response(JSON.stringify({ success: true, trip_expense_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      const new_id = 'TEXP-' + Date.now();
      await env.DB.prepare(`
        INSERT INTO TripExpenses (trip_expense_id, project_id, expense_date, member_id, category_id, amount_foreign, amount_thb, stop_id, paid_from_account_id, latitude, longitude, receipt_image_url, note, type, wallet_id, approved)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(new_id, project_id, expense_date, member_id || null, category_id || null, amount_foreign || null, amount_thb, stop_id || null, paid_from_account_id || null, latitude || null, longitude || null, receipt_image_url || null, note || null, txType, b_wallet_id, b_approved).run();
      return new Response(JSON.stringify({ success: true, trip_expense_id: new_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (url.pathname === '/api/trip-expenses/delete' && request.method === 'POST') {
    const { trip_expense_id } = await request.json();
    await env.DB.prepare(`DELETE FROM TripExpenses WHERE trip_expense_id=?`).bind(trip_expense_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Approve pending guest expenses
  if (url.pathname === '/api/trip-expenses/approve' && request.method === 'POST') {
    const userId = authUserId;
    const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const { trip_expense_id } = await request.json();
    await env.DB.prepare(`UPDATE TripExpenses SET approved=1 WHERE trip_expense_id=?`).bind(trip_expense_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // CRUD for TripWallets
  if (url.pathname === '/api/wallets' && request.method === 'GET') {
    const userId = authUserId;
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    if (!await getAccessibleTrip(env, userId, projectId)) return new Response(JSON.stringify({ error: 'ไม่พบทริป หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const out = await computeTripWallets(env, projectId);
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/wallets' && request.method === 'POST') {
    const userId = authUserId;
    const data = await request.json();
    const { wallet_id, project_id, name, currency, initial_balance_foreign, initial_balance_thb, exclude_on_close } = data;
    
    if (!project_id || !String(name || '').trim() || !String(currency || '').trim()) {
      return new Response(JSON.stringify({ error: 'ต้องระบุชื่อกระเป๋าและสกุลเงิน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const trip = await getAccessibleTrip(env, userId, project_id);
    if (!trip) return new Response(JSON.stringify({ error: 'ไม่พบทริป หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (trip.status === 'closed' || trip.status === 'closing') return new Response(JSON.stringify({ error: 'ทริปนี้ปิดแล้ว จึงแก้ไขกระเป๋าไม่ได้' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const foreign = Number(initial_balance_foreign || 0);
    const thb = Number(initial_balance_thb || 0);
    if (!Number.isFinite(foreign) || !Number.isFinite(thb) || foreign < 0 || thb < 0) {
      return new Response(JSON.stringify({ error: 'ยอดตั้งต้นต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const b_exclude = exclude_on_close ? 1 : 0;

    if (wallet_id) {
      await env.DB.prepare(`
        UPDATE TripWallets
        SET name=?, currency=?, initial_balance_foreign=?, initial_balance_thb=?, exclude_on_close=?
        WHERE wallet_id=? AND project_id=?
      `).bind(String(name).trim(), String(currency).trim().toUpperCase(), foreign, thb, b_exclude, wallet_id, project_id).run();
      return new Response(JSON.stringify({ success: true, wallet_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      if (foreign !== 0 || thb !== 0) return new Response(JSON.stringify({ error: 'สร้างกระเป๋าใหม่ต้องเริ่มที่ 0; กรุณาใช้การเติมเงินเพื่อให้มี transfer สองฝั่ง' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const new_id = 'WL-' + Date.now();
      await env.DB.prepare(`
        INSERT INTO TripWallets (wallet_id, project_id, name, currency, initial_balance_foreign, initial_balance_thb, exclude_on_close)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(new_id, project_id, String(name).trim(), String(currency).trim().toUpperCase(), foreign, thb, b_exclude).run();
      return new Response(JSON.stringify({ success: true, wallet_id: new_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (url.pathname === '/api/wallets/delete' && request.method === 'POST') {
    const userId = authUserId;
    const { wallet_id } = await request.json();
    const wallet = await env.DB.prepare(`SELECT project_id FROM TripWallets WHERE wallet_id=?`).bind(wallet_id).first();
    if (!wallet || !await getAccessibleTrip(env, userId, wallet.project_id)) return new Response(JSON.stringify({ error: 'ไม่พบกระเป๋า หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    await env.DB.batch([
      env.DB.prepare(`UPDATE TripExpenses SET wallet_id=NULL WHERE wallet_id=?`).bind(wallet_id),
      env.DB.prepare(`DELETE FROM TripWalletFundings WHERE wallet_id=?`).bind(wallet_id),
      env.DB.prepare(`DELETE FROM TripWallets WHERE wallet_id=?`).bind(wallet_id)
    ]);
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── Trip Finance P1: เติมเงินเข้ากระเป๋าทริป (หลายรอบ + เรท) ──
  // สร้าง Transaction จริง (ลดบัญชีต้นทาง) + บันทึกล็อตการเติม + อัปเดตเรทเฉลี่ยอัตโนมัติ
  if (url.pathname === '/api/trips/fund' && request.method === 'POST') {
    const userId = authUserId;
    const me = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!me) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const fid = me.family_id;

    const b = await request.json();
    const { project_id, wallet_id, source_account_id, thb_amount, foreign_amount, currency, funding_date, note } = b;
    if (!project_id || !wallet_id || !thb_amount) {
      return new Response(JSON.stringify({ error: 'ต้องระบุ project_id, wallet_id, thb_amount' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const trip = await getAccessibleTrip(env, userId, project_id);
    if (!trip) return new Response(JSON.stringify({ error: 'ไม่พบทริป หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (trip.status === 'closed' || trip.status === 'closing') return new Response(JSON.stringify({ error: 'ทริปนี้ปิดแล้ว จึงเติมเงินไม่ได้' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const wallet = await env.DB.prepare(`SELECT wallet_id, project_id, name, currency FROM TripWallets WHERE wallet_id=? AND project_id=?`).bind(wallet_id, project_id).first();
    if (!wallet) return new Response(JSON.stringify({ error: 'กระเป๋าเงินไม่อยู่ในทริปนี้' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!source_account_id) return new Response(JSON.stringify({ error: 'ต้องเลือกบัญชีต้นทาง เพื่อบันทึกการโอนเข้ากระเป๋าทริป' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const sourceAccount = await env.DB.prepare(`SELECT a.account_id, a.entity_id FROM Accounts a JOIN Entities e ON a.entity_id=e.entity_id WHERE a.account_id=? AND e.family_id=? AND IFNULL(a.account_type,'BANK') != 'TRIP_HOLDING'`).bind(source_account_id, fid).first();
    if (!sourceAccount) return new Response(JSON.stringify({ error: 'บัญชีต้นทางไม่อยู่ในครอบครัวนี้ หรือเป็นบัญชีพักทริป' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const thb = Math.abs(Number(thb_amount));
    const suppliedForeign = foreign_amount === undefined || foreign_amount === null || foreign_amount === '' ? null : Math.abs(Number(foreign_amount));
    const foreign = String(wallet.currency || '').toUpperCase() === 'THB' ? thb : suppliedForeign;
    if (!Number.isFinite(thb) || thb <= 0 || !Number.isFinite(foreign) || foreign <= 0) {
      return new Response(JSON.stringify({ error: 'จำนวนเงินต้องมากกว่า 0 และกระเป๋าเงินต่างประเทศต้องระบุจำนวนเงินที่ได้รับ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const rate = foreign > 0 ? thb / foreign : 1;              // บาทต่อ 1 หน่วยเงินตปท.
    const fdate = funding_date || new Date().toISOString().substring(0, 10);
    const fundingId = 'TWF-' + Date.now();

    // 1) โอนสองฝั่ง: บัญชีจริงลดลง → บัญชีพักของ wallet เพิ่มขึ้น
    const holdingAccountId = await ensureTripHoldingAccount(env, wallet, sourceAccount);
    const linkedTxId = 'TXF-' + Date.now();
    const holdingTxId = 'TXH-' + Date.now();
    const transferId = 'TTF-' + Date.now();
    const ops = [];
    const fundCat = await getTransferCategory(env, fid);
    ops.push(
      env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id)
                      VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
        .bind(linkedTxId, source_account_id, fdate, -thb, `โอนเข้ากระเป๋าทริป${currency ? ' (' + currency + ')' : ''}`, userId),
      env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type)
                      VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER')`)
        .bind(`DTF-${Date.now()}`, linkedTxId, -thb, fundCat, project_id, note || `เติมเงินทริป @${rate.toFixed(4)}`),
      env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id)
                      VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
        .bind(holdingTxId, holdingAccountId, fdate, thb, `รับโอนเข้ากระเป๋าทริป${currency ? ' (' + currency + ')' : ''}`, userId),
      env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type)
                      VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER')`)
        .bind(`DTH-${Date.now()}`, holdingTxId, thb, fundCat, project_id, note || `เติมเงินทริป @${rate.toFixed(4)}`),
      env.DB.prepare(`INSERT INTO TripTransfers (transfer_id, project_id, from_account_id, to_account_id, from_transaction_id, to_transaction_id, amount_thb, transfer_kind, target_wallet_id)
                      VALUES (?, ?, ?, ?, ?, ?, ?, 'FUND', ?)`)
        .bind(transferId, project_id, source_account_id, holdingAccountId, linkedTxId, holdingTxId, thb, wallet_id)
    );

    // 2) บันทึกล็อตการเติมพร้อมรายการบัญชีใน batch เดียว; ห้ามเงียบเมื่อบันทึกไม่สำเร็จ
    ops.push(env.DB.prepare(`INSERT INTO TripWalletFundings
        (funding_id, wallet_id, project_id, funding_date, thb_amount, foreign_amount, rate, source_account_id, linked_transaction_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(fundingId, wallet_id, project_id, fdate, thb, foreign, rate, source_account_id || null, linkedTxId, note || null));
    await env.DB.batch(ops);

    return new Response(JSON.stringify({ success: true, funding_id: fundingId, rate, linked_transaction_id: linkedTxId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // รายการล็อตการเติมของกระเป๋า (สำหรับแสดง/ลบ)
  if (url.pathname === '/api/trips/fundings' && request.method === 'GET') {
    const walletId = url.searchParams.get('walletId');
    const projectId = url.searchParams.get('projectId');
    let rows;
    if (walletId) rows = await env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE wallet_id=? ORDER BY funding_date ASC, created_at ASC`).bind(walletId).all();
    else if (projectId) rows = await env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=? ORDER BY funding_date ASC, created_at ASC`).bind(projectId).all();
    else return new Response('Missing walletId or projectId', { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify(rows.results || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ลบล็อตการเติม (คืนรายการบัญชีที่ผูกไว้ด้วย)
  if (url.pathname === '/api/trips/fundings/delete' && request.method === 'POST') {
    const { funding_id } = await request.json();
    const f = await env.DB.prepare(`SELECT linked_transaction_id FROM TripWalletFundings WHERE funding_id=?`).bind(funding_id).first();
    if (f && f.linked_transaction_id) {
      await env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id=?`).bind(f.linked_transaction_id).run().catch(()=>{});
      await env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id=?`).bind(f.linked_transaction_id).run().catch(()=>{});
    }
    await env.DB.prepare(`DELETE FROM TripWalletFundings WHERE funding_id=?`).bind(funding_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 8.2 TripStops API
  if (url.pathname === '/api/trips/stops' && request.method === 'GET') {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    const stops = await env.DB.prepare(`SELECT * FROM TripStops WHERE project_id = ? ORDER BY stop_date ASC, time ASC, created_at ASC`).bind(projectId).all();
    return new Response(JSON.stringify(stops.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  if (url.pathname === '/api/trips/stops' && request.method === 'POST') {
    const { stop_id, project_id, stop_date, time, city, accommodation, restaurants, notes, is_starred, latitude, longitude, is_main_day, marker_color, header_color, font_size, text_color, time_color, border_color, label_position } = await request.json();
    const b_is_main_day = is_main_day ? 1 : 0;
    if (stop_id) {
      await env.DB.prepare(`
        UPDATE TripStops SET stop_date=?, time=?, city=?, accommodation=?, restaurants=?, notes=?, is_starred=?, latitude=?, longitude=?, is_main_day=?, marker_color=?, header_color=?, font_size=?, text_color=?, time_color=?, border_color=?, label_position=?
        WHERE stop_id=? AND project_id=?
      `).bind(stop_date || null, time || null, city || null, accommodation || null, JSON.stringify(restaurants || []), notes || null, is_starred ? 1 : 0, latitude || null, longitude || null, b_is_main_day, marker_color || null, header_color || null, font_size || null, text_color || null, time_color || null, border_color || null, label_position || null, stop_id, project_id).run();
      return new Response(JSON.stringify({ success: true, stop_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      const new_id = 'STOP-' + Date.now();
      await env.DB.prepare(`
        INSERT INTO TripStops (stop_id, project_id, stop_date, time, city, accommodation, restaurants, notes, is_starred, latitude, longitude, is_main_day, marker_color, header_color, font_size, text_color, time_color, border_color, label_position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(new_id, project_id, stop_date || null, time || null, city || null, accommodation || null, JSON.stringify(restaurants || []), notes || null, is_starred ? 1 : 0, latitude || null, longitude || null, b_is_main_day, marker_color || null, header_color || null, font_size || null, text_color || null, time_color || null, border_color || null, label_position || null).run();
      return new Response(JSON.stringify({ success: true, stop_id: new_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (url.pathname === '/api/trips/stops/delete' && request.method === 'POST') {
    const { stop_id } = await request.json();
    await env.DB.prepare(`DELETE FROM TripStops WHERE stop_id=?`).bind(stop_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/stops/star' && request.method === 'PUT') {
    const { stop_id, is_starred } = await request.json();
    await env.DB.prepare(`UPDATE TripStops SET is_starred=? WHERE stop_id=?`).bind(is_starred ? 1 : 0, stop_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 8.3 TripBudgets API
  if (url.pathname === '/api/trips/budgets' && request.method === 'GET') {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    const budgets = await env.DB.prepare(`
      SELECT tb.*, c.name as category_name
      FROM TripBudgets tb
      JOIN Categories c ON tb.category_id = c.category_id
      WHERE tb.project_id = ?
    `).bind(projectId).all();
    return new Response(JSON.stringify(budgets.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/budgets' && request.method === 'POST') {
    const { project_id, budgets } = await request.json(); // budgets is array of { category_id, amount }
    // For simplicity, delete old budgets and insert new
    await env.DB.prepare(`DELETE FROM TripBudgets WHERE project_id=?`).bind(project_id).run();
    for (const b of budgets) {
      const new_id = 'BUDG-' + Date.now() + Math.floor(Math.random()*1000);
      await env.DB.prepare(`INSERT INTO TripBudgets (budget_id, project_id, category_id, amount) VALUES (?, ?, ?, ?)`).bind(new_id, project_id, b.category_id, b.amount).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 8.4 TripDocuments API
  if (url.pathname === '/api/trips/documents' && request.method === 'GET') {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    const docs = await env.DB.prepare(`SELECT * FROM TripDocuments WHERE project_id = ?`).bind(projectId).all();
    return new Response(JSON.stringify(docs.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/trips/documents' && request.method === 'POST') {
    const { document_id, project_id, related_entity_id, file_url, description, type } = await request.json();
    const new_id = document_id || ('DOC-' + Date.now());
    if (document_id) {
       await env.DB.prepare(`UPDATE TripDocuments SET related_entity_id=?, file_url=?, description=?, type=? WHERE document_id=?`).bind(related_entity_id || null, file_url, description || null, type || 'general', document_id).run();
    } else {
       await env.DB.prepare(`INSERT INTO TripDocuments (document_id, project_id, related_entity_id, file_url, description, type) VALUES (?, ?, ?, ?, ?, ?)`).bind(new_id, project_id, related_entity_id || null, file_url, description || null, type || 'general').run();
    }
    return new Response(JSON.stringify({ success: true, document_id: new_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (url.pathname === '/api/trips/documents/delete' && request.method === 'POST') {
    const { document_id } = await request.json();
    await env.DB.prepare(`DELETE FROM TripDocuments WHERE document_id=?`).bind(document_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Wallet ปลายทางที่เลือกได้เมื่อต้องย้ายเงินเหลือไปทริปถัดไป
  if (url.pathname === '/api/trips/wallet-options' && request.method === 'GET') {
    const userId = authUserId;
    const sourceProjectId = url.searchParams.get('projectId');
    const sourceTrip = await getAccessibleTrip(env, userId, sourceProjectId);
    if (!sourceTrip) return new Response(JSON.stringify({ error: 'ไม่พบทริป หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const rows = await env.DB.prepare(`
      SELECT w.wallet_id, w.project_id, w.name, w.currency, p.name AS trip_name, p.status
      FROM TripWallets w JOIN Projects p ON p.project_id=w.project_id
      WHERE p.family_id=? AND p.project_id != ? AND p.status IN ('active','planned')
      ORDER BY p.start_date ASC, p.name ASC, w.name ASC
    `).bind(sourceTrip.family_id, sourceProjectId).all();
    return new Response(JSON.stringify(rows.results || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 8.5 Trip Settlement — สรุปก่อนปิด (พรีวิว ไม่แก้ข้อมูล)
  if (url.pathname === '/api/trips/close-preview' && request.method === 'GET') {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
    const summary = await computeTripCloseSummary(env, projectId);
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 8.5 Trip Settlement — ปิดทริปจริง (ต้องยืนยัน confirm='CLOSE')
  if ((url.pathname === '/api/trips/close' || url.pathname === '/api/trips/settle') && request.method === 'POST') {
    const userId = authUserId;
    const me = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
    if (!me) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const body = await request.json();
    const { project_id, confirm, leftover_actions = {} } = body;
    if (confirm !== 'CLOSE') return new Response(JSON.stringify({ error: "ต้องยืนยันด้วย confirm='CLOSE'" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const trip = await getAccessibleTrip(env, userId, project_id);
    if (!trip) return new Response(JSON.stringify({ error: 'ไม่พบทริป หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (trip.status !== 'active') return new Response(JSON.stringify({ error: 'ปิดได้เฉพาะทริปที่กำลังดำเนินอยู่ และทริปนี้ถูกปิดหรือกำลังปิดแล้ว' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let summary = await computeTripCloseSummary(env, project_id);
    if (!summary.balanced) return new Response(JSON.stringify({ error: 'ยอดทริปไม่สมดุล จึงยังปิดทริปไม่ได้', summary }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const overdrawn = summary.wallets.filter(w => Number(w.leftover_foreign || 0) < -0.005);
    if (overdrawn.length) return new Response(JSON.stringify({ error: 'มีกระเป๋าที่ใช้เกินยอดเติม จึงยังปิดทริปไม่ได้', overdrawn_wallets: overdrawn.map(w => w.name) }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // จองการปิดทริปก่อนเขียนรายการ เพื่อกันการกดยืนยัน/เรียก API ซ้ำจนเกิดรายการซ้ำ
    const claim = await env.DB.prepare(`UPDATE Projects SET status='closing' WHERE project_id=? AND family_id=? AND status='active'`).bind(project_id, me.family_id).run();
    if (!claim.meta || claim.meta.changes !== 1) return new Response(JSON.stringify({ error: 'ทริปนี้กำลังถูกปิดหรือถูกปิดไปแล้ว' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // คำนวณซ้ำหลังจอง เพื่อให้ใช้ข้อมูลล่าสุดก่อนสร้างรายการจริง
    summary = await computeTripCloseSummary(env, project_id);
    const wmap = {}; summary.wallets.forEach(w => wmap[w.wallet_id] = w);
    const now = Date.now();
    const today = new Date().toISOString().substring(0, 10);
    const ops = [];
    const report = { posted_bills: 0, reversed_fundings: 0, refunded_thb: 0, kept_wallets: [] };

    // หาบัญชีต้นทางเริ่มต้นและบัญชีพักของแต่ละกระเป๋า
    const fundings = await env.DB.prepare(`SELECT * FROM TripWalletFundings WHERE project_id=? ORDER BY created_at ASC`).bind(project_id).all().catch(() => ({ results: [] }));
    const walletSrc = {};
    (fundings.results || []).forEach(f => { if (!walletSrc[f.wallet_id] && f.source_account_id) walletSrc[f.wallet_id] = f.source_account_id; });
    const holdingRows = await env.DB.prepare(`SELECT wallet_id, account_id FROM TripHoldingAccounts WHERE project_id=?`).bind(project_id).all();
    const walletHolding = {}; (holdingRows.results || []).forEach(h => { walletHolding[h.wallet_id] = h.account_id; });
    const firstAcct = await env.DB.prepare(`SELECT a.account_id FROM Accounts a JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=? LIMIT 1`).bind(me.family_id).first();
    const fallbackAcct = firstAcct ? firstAcct.account_id : null;

    // เตรียมการย้ายเงินเหลือไป wallet ของทริปอื่น (ต้องเป็นสกุลเดียวกัน)
    const carryPlans = [];
    for (const w of summary.wallets) {
      const amount = Math.round(Number(w.leftover_thb || 0) * 100) / 100;
      const action = leftover_actions[w.wallet_id] || { mode: 'RETURN' };
      if (amount <= 0.005 || action.mode !== 'MOVE_TO_WALLET') continue;
      const targetWalletId = action.target_wallet_id;
      const target = await env.DB.prepare(`
        SELECT w.wallet_id, w.project_id, w.name, w.currency
        FROM TripWallets w JOIN Projects p ON p.project_id=w.project_id
        WHERE w.wallet_id=? AND p.family_id=? AND p.status IN ('active','planned') AND p.project_id != ?
      `).bind(targetWalletId, me.family_id, project_id).first();
      if (!target || String(target.currency).toUpperCase() !== String(w.currency).toUpperCase()) {
        await env.DB.prepare(`UPDATE Projects SET status='active' WHERE project_id=? AND status='closing'`).bind(project_id).run();
        return new Response(JSON.stringify({ error: `ปลายทางของ ${w.name} ต้องเป็นกระเป๋าในทริปอื่นที่ใช้สกุล ${w.currency} เดียวกัน` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const fromAccountId = walletHolding[w.wallet_id];
      if (!fromAccountId) {
        await env.DB.prepare(`UPDATE Projects SET status='active' WHERE project_id=? AND status='closing'`).bind(project_id).run();
        return new Response(JSON.stringify({ error: `กระเป๋า ${w.name} ยังไม่มีบัญชีพัก จึงย้ายเงินเหลือไม่ได้` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const sourceHolding = await env.DB.prepare(`SELECT account_id, entity_id FROM Accounts WHERE account_id=?`).bind(fromAccountId).first();
      const targetHoldingId = await ensureTripHoldingAccount(env, target, sourceHolding);
      carryPlans.push({ source: w, target, fromAccountId, targetHoldingId, amount, foreign: Number(w.leftover_foreign || 0), rate: Number(w.avg_rate || 0) });
    }

    // ห้ามปิดแบบข้ามบิล: ถ้าไม่มีบัญชีที่จะลงรายการ ต้องให้ผู้ใช้แก้ก่อน
    const unpostableBills = summary.bills.filter(b => {
      if (b.wallet_id) return !walletHolding[b.wallet_id];
      return !(b.paid_from_account_id || fallbackAcct);
    });
    if (unpostableBills.length) {
      await env.DB.prepare(`UPDATE Projects SET status='active' WHERE project_id=? AND status='closing'`).bind(project_id).run();
      return new Response(JSON.stringify({ error: 'มีบิลที่ไม่มีบัญชีพักหรือบัญชีผู้จ่ายสำหรับลงรายการ กรุณาเติมเงินเข้ากระเป๋าหรือระบุบัญชีก่อนปิดทริป', unpostable_bills: unpostableBills.map(b => b.trip_expense_id) }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // หมวดโอน (TRANSFER) สำหรับรายการคืนเงินพักทริป
    const tc = await env.DB.prepare(`SELECT c.category_id FROM Categories c JOIN Captions cp ON c.caption_id=cp.type_id WHERE c.family_id=? AND cp.behavior='TRANSFER' LIMIT 1`).bind(me.family_id).first();
    const transferCat = tc ? tc.category_id : 'Cat_Uncategorized';

    let i = 0;
    // 1) ย้ายเงินเหลือระหว่างบัญชีพัก พร้อมย้าย funding lot ที่คงต้นทุนเดิม
    for (const c of carryPlans) {
      const outTx = `TXC-${now}-${i}`, inTx = `TXN-${now}-${i}`, dOut = `DTC-${now}-${i}`, dIn = `DTN-${now}-${i}`;
      const transferId = `TTC-${now}-${i}`, outFundingId = `TWF-CO-${now}-${i}`, inFundingId = `TWF-CI-${now}-${i}`; i++;
      ops.push(
        env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
          .bind(outTx, c.fromAccountId, today, -c.amount, `ปิดทริป: ย้ายเงินเหลือไป ${c.target.name}`, userId),
        env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type) VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER')`)
          .bind(dOut, outTx, -c.amount, transferCat, project_id, `ย้ายเงินเหลือไป ${c.target.project_id}/${c.target.wallet_id}`),
        env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
          .bind(inTx, c.targetHoldingId, today, c.amount, `รับเงินเหลือจากทริป ${project_id}`, userId),
        env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type) VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER')`)
          .bind(dIn, inTx, c.amount, transferCat, c.target.project_id, `รับเงินเหลือจาก ${project_id}/${c.source.wallet_id}`),
        env.DB.prepare(`INSERT INTO TripTransfers (transfer_id, project_id, from_account_id, to_account_id, from_transaction_id, to_transaction_id, amount_thb, transfer_kind, source_wallet_id, target_wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'CARRY_FORWARD', ?, ?)`)
          .bind(transferId, project_id, c.fromAccountId, c.targetHoldingId, outTx, inTx, c.amount, c.source.wallet_id, c.target.wallet_id),
        env.DB.prepare(`INSERT INTO TripWalletFundings (funding_id, wallet_id, project_id, funding_date, thb_amount, foreign_amount, rate, linked_transaction_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(outFundingId, c.source.wallet_id, project_id, today, -c.amount, -c.foreign, c.rate, outTx, `ย้ายไป ${c.target.project_id}/${c.target.wallet_id}`),
        env.DB.prepare(`INSERT INTO TripWalletFundings (funding_id, wallet_id, project_id, funding_date, thb_amount, foreign_amount, rate, linked_transaction_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(inFundingId, c.target.wallet_id, c.target.project_id, today, c.amount, c.foreign, c.rate, inTx, `ย้ายมาจาก ${project_id}/${c.source.wallet_id}`)
      );
      report.kept_wallets.push({ name: c.source.name, currency: c.source.currency, leftover_foreign: c.foreign, leftover_thb: c.amount, moved_to: c.target.name });
    }

    // 2) คืนเฉพาะเงินเหลือที่ไม่ได้ย้าย: บัญชีพัก → บัญชีจริงต้นทาง
    for (const w of summary.wallets) {
      const amount = Math.round(Number(w.leftover_thb || 0) * 100) / 100;
      if ((leftover_actions[w.wallet_id] || {}).mode === 'MOVE_TO_WALLET') continue;
      const fromAcct = walletHolding[w.wallet_id], toAcct = walletSrc[w.wallet_id];
      if (amount <= 0.005) continue;
      if (!fromAcct || !toAcct) {
        await env.DB.prepare(`UPDATE Projects SET status='active' WHERE project_id=? AND status='closing'`).bind(project_id).run();
        return new Response(JSON.stringify({ error: `กระเป๋า ${w.name} ไม่มีบัญชีพักหรือบัญชีปลายทางสำหรับคืนเงิน` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const outTx = `TXR-${now}-${i}`, inTx = `TXI-${now}-${i}`, dOut = `DTR-${now}-${i}`, dIn = `DTI-${now}-${i}`, transferId = `TTR-${now}-${i}`; i++;
      ops.push(env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
        .bind(outTx, fromAcct, today, -amount, 'ปิดทริป: โอนเงินเหลือออกจากบัญชีพัก', userId));
      ops.push(env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type) VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER')`)
        .bind(dOut, outTx, -amount, transferCat, project_id, 'ปิดทริป: คืนเงินเหลือจากกระเป๋าทริป'));
      ops.push(env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
        .bind(inTx, toAcct, today, amount, 'ปิดทริป: รับเงินเหลือจากบัญชีพัก', userId));
      ops.push(env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type) VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER')`)
        .bind(dIn, inTx, amount, transferCat, project_id, 'ปิดทริป: รับคืนเงินเหลือ'));
      ops.push(env.DB.prepare(`INSERT INTO TripTransfers (transfer_id, project_id, from_account_id, to_account_id, from_transaction_id, to_transaction_id, amount_thb, transfer_kind, source_wallet_id)
                              VALUES (?, ?, ?, ?, ?, ?, ?, 'REFUND', ?)`)
        .bind(transferId, project_id, fromAcct, toAcct, outTx, inTx, amount, w.wallet_id));
      report.reversed_fundings++;
      report.refunded_thb += amount;
    }

    // 3) ลงบิลจากบัญชีพักของ wallet (หรือบัญชีผู้จ่ายถ้าเป็นบิลที่ไม่ได้ใช้ wallet)
    for (const b of summary.bills) {
      const acct = b.wallet_id ? walletHolding[b.wallet_id] : (b.paid_from_account_id || fallbackAcct);
      // ล็อกค่าบาทสุดท้ายลงบิล
      ops.push(env.DB.prepare(`UPDATE TripExpenses SET amount_thb=? WHERE trip_expense_id=?`).bind(b.final_thb, b.trip_expense_id));
      if (!acct) continue;
      const txId = `TXE-${now}-${i}`, dId = `DTE-${now}-${i}`; i++;
      const desc = (b.note || b.cat_name || 'ค่าใช้จ่ายทริป');
      ops.push(env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, date, total_amount, statement_desc, status, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'WEB_GRID', ?)`)
        .bind(txId, acct, b.expense_date || today, -Math.abs(b.final_thb), `ทริป: ${desc}`, b.member_id || userId));
      ops.push(env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, category_id, project_id, note, type) VALUES (?, ?, ?, ?, ?, ?, 'EXPENSE')`)
        .bind(dId, txId, -Math.abs(b.final_thb), b.category_id || 'Cat_Uncategorized', project_id, b.note || null));
      report.posted_bills++;
    }

    // 4) ปิดทริป (ต้องเป็นสถานะที่จองไว้เท่านั้น)
    ops.push(env.DB.prepare(`UPDATE Projects SET status='closed' WHERE project_id=? AND status='closing'`).bind(project_id));

    // รันเป็นชุดเดียว; ไม่ทำ fallback ทีละคำสั่ง เพราะจะทิ้งข้อมูลการเงินไว้เพียงบางส่วน
    try { await env.DB.batch(ops); }
    catch (e) {
      await env.DB.prepare(`UPDATE Projects SET status='active' WHERE project_id=? AND status='closing'`).bind(project_id).run().catch(() => {});
      throw e;
    }

    report.refunded_thb = Math.round(report.refunded_thb * 100) / 100;
    return new Response(JSON.stringify({ success: true, summary, report }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return null;
}
