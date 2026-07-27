// backend/src/index.js

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 0. Login Endpoint
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (!username || !password) {
          return new Response(JSON.stringify({ error: 'กรุณากรอกผู้ใช้และรหัสผ่าน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const user = await env.DB.prepare(`
          SELECT * FROM Users WHERE (LOWER(email) = LOWER(?) OR LOWER(user_id) = LOWER(?) OR LOWER(name) = LOWER(?)) AND password = ?
        `).bind(username, username, username, password).first();
        
        if (!user) {
          return new Response(JSON.stringify({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Fetch user permissions
        const perms = await env.DB.prepare(`SELECT entity_id FROM UserPermissions WHERE user_id = ?`).bind(user.user_id).all();
        const allowedEntities = perms.results.map(p => p.entity_id);

        return new Response(JSON.stringify({
          success: true,
          user: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            family_id: user.family_id,
            allowed_entities: allowedEntities
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 1. LINE Webhook Endpoint
      if (url.pathname === '/api/line-webhook' && request.method === 'POST') {
        return await handleLineWebhook(request, env);
      }

      // 2. OCR Test Endpoint (Direct Web Upload)
      if (url.pathname === '/api/slip-ocr' && request.method === 'POST') {
        const body = await request.json();
        const { imageBase64 } = body;
        if (!imageBase64) {
          return new Response(JSON.stringify({ error: 'Missing imageBase64' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const ocrData = await runGeminiOCR(imageBase64, env.GEMINI_API_KEY);
        return new Response(JSON.stringify(ocrData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/statement-ocr' && request.method === 'POST') {
        const body = await request.json();
        const { pdfBase64, imagesBase64 } = body;
        if (!pdfBase64 && (!imagesBase64 || imagesBase64.length === 0)) {
          return new Response(JSON.stringify({ error: 'Missing pdfBase64 or imagesBase64' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        try {
          const statementData = await runGeminiStatement(pdfBase64, imagesBase64, env.GEMINI_API_KEY);
          return new Response(JSON.stringify(statementData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      
      // Trip Stops API
      if (url.pathname === '/api/trip-stops') {
        const projectId = url.searchParams.get('projectId');
        
        if (request.method === 'GET') {
          if (!projectId) return new Response(JSON.stringify({error: 'Missing projectId'}), {status: 400, headers: {...corsHeaders, 'Content-Type': 'application/json'}});
          const stops = await env.DB.prepare(`SELECT * FROM TripStops WHERE project_id = ? ORDER BY stop_date ASC, time ASC`).bind(projectId).all();
          return new Response(JSON.stringify(stops.results), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
        }
        
        if (request.method === 'POST') {
          const { stop_id, project_id, stop_date, time, city, accommodation, restaurants, notes, location_type, parent_stop_id, icon, is_main_day, marker_color, header_color, font_size, text_color, time_color, border_color, label_position } = await request.json();
          
          const b_stop_date = stop_date || null;
          const b_time = time || null;
          const b_city = city || null;
          const b_accommodation = accommodation || null;
          const b_restaurants = restaurants || null;
          const b_notes = notes || null;
          const b_location_type = location_type || null;
          const b_parent_stop_id = parent_stop_id || null;
          const b_icon = icon || null;
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
                UPDATE TripStops SET stop_date=?, time=?, city=?, accommodation=?, restaurants=?, notes=?, location_type=?, parent_stop_id=?, icon=?, is_main_day=?, marker_color=?, header_color=?, font_size=?, text_color=?, time_color=?, border_color=?, label_position=? WHERE stop_id=?
              `).bind(b_stop_date, b_time, b_city, b_accommodation, b_restaurants, b_notes, b_location_type, b_parent_stop_id, b_icon, b_is_main_day, b_marker_color, b_header_color, b_font_size, b_text_color, b_time_color, b_border_color, b_label_position, stop_id).run();
              return new Response(JSON.stringify({success: true}), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
            }
          }
          const newId = stop_id || crypto.randomUUID();
          await env.DB.prepare(`
            INSERT INTO TripStops (stop_id, project_id, stop_date, time, city, accommodation, restaurants, notes, location_type, parent_stop_id, icon, is_main_day, marker_color, header_color, font_size, text_color, time_color, border_color, label_position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(newId, project_id, b_stop_date, b_time, b_city, b_accommodation, b_restaurants, b_notes, b_location_type, b_parent_stop_id, b_icon, b_is_main_day, b_marker_color, b_header_color, b_font_size, b_text_color, b_time_color, b_border_color, b_label_position).run();
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

      // 3. Transactions CRUD
      if (url.pathname === '/api/transactions') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (request.method === 'GET') {
          const statusFilter = url.searchParams.get('status');
          const startDate = url.searchParams.get('startDate');
          const endDate = url.searchParams.get('endDate');
          const search = url.searchParams.get('search');
          
          let query = `
            SELECT 
              t.transaction_id, t.account_id, t.ref_code, t.date, t.time, t.statement_desc, t.total_amount, t.status, t.source, t.slip_image_url, t.created_by_user_id, t.created_at,
              a.name as account_name, a.bank_name,
              d.detail_id, d.amount, d.fee, d.wht, d.category_id, d.entity_id, d.contact_id, d.project_id, d.note, cp.type_id as caption_id, cp.behavior as behavior, cp.sub_behavior as sub_behavior,
              c.name as category_name, co.name as contact_name, p.name as project_name
            FROM Transactions t
            JOIN Accounts a ON t.account_id = a.account_id
            JOIN UserPermissions up ON a.entity_id = up.entity_id
            LEFT JOIN TransactionDetails d ON t.transaction_id = d.transaction_id
            LEFT JOIN Categories c ON d.category_id = c.category_id
            LEFT JOIN Contacts co ON d.contact_id = co.contact_id
            LEFT JOIN Projects p ON d.project_id = p.project_id
            LEFT JOIN Captions cp ON c.caption_id = cp.type_id
            WHERE up.user_id = ?
          `;
          const params = [userId];

          if (statusFilter) {
            query += ` AND t.status = ?`;
            params.push(statusFilter);
          }
          if (startDate) {
            query += ` AND t.date >= ?`;
            params.push(startDate);
          }
          if (endDate) {
            query += ` AND t.date <= ?`;
            params.push(endDate);
          }
          if (search) {
            query += ` AND (t.ref_code LIKE ? OR t.transaction_id LIKE ? OR d.note LIKE ? OR c.name LIKE ? OR co.name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
          }

          query += ` ORDER BY t.date DESC, t.created_at DESC`;
          const txs = await env.DB.prepare(query).bind(...params).all();

          // Group by transaction_id in JS (insertion order of Map keys preserves sorted SQL results)
          const txMap = new Map();
          for (const row of txs.results) {
            if (!txMap.has(row.transaction_id)) {
              txMap.set(row.transaction_id, {
                transaction_id: row.transaction_id,
                account_id: row.account_id,
                ref_code: row.ref_code,
                date: row.date,
                time: row.time,
                statement_desc: row.statement_desc,
                total_amount: row.total_amount,
                status: row.status,
                source: row.source,
                slip_image_url: row.slip_image_url,
                created_by_user_id: row.created_by_user_id,
                created_at: row.created_at,
                account_name: row.account_name,
                bank_name: row.bank_name,
                details: []
              });
            }

            if (row.detail_id) {
              const tx = txMap.get(row.transaction_id);
              const exists = tx.details.some(d => d.detail_id === row.detail_id);
              if (!exists) {
                tx.details.push({
                  detail_id: row.detail_id,
                  transaction_id: row.transaction_id,
                  amount: row.amount,
                  fee: row.fee,
                  wht: row.wht,
                  category_id: row.category_id,
                  entity_id: row.entity_id,
                  contact_id: row.contact_id,
                  project_id: row.project_id,
                  note: row.note,
                  caption_id: row.caption_id,
                  behavior: row.behavior,
                  category_name: row.category_name,
                  contact_name: row.contact_name,
                  project_name: row.project_name
                });
              }
            }
          }

          const result = Array.from(txMap.values());

          // Perform auto-match queries sequentially ONLY for PENDING_REVIEW transactions (usually very small list)
          for (const tx of result) {
            if (tx.status === 'PENDING_REVIEW' && (tx.statement_desc || tx.ref_code)) {
               const matchQuery = `
                 SELECT d.category_id, d.contact_id, d.project_id, d.entity_id, d.note, c.name as category_name, co.name as contact_name
                 FROM Transactions t2
                 JOIN TransactionDetails d ON t2.transaction_id = d.transaction_id
                 JOIN Categories c ON d.category_id = c.category_id
                 LEFT JOIN Contacts co ON d.contact_id = co.contact_id
                 WHERE t2.status = 'CONFIRMED' 
                   AND ((t2.statement_desc = ? AND t2.statement_desc IS NOT NULL AND t2.statement_desc != '') 
                        OR (t2.ref_code = ? AND t2.ref_code IS NOT NULL AND t2.ref_code != ''))
                 ORDER BY t2.date DESC LIMIT 1
               `;
               const match = await env.DB.prepare(matchQuery).bind(tx.statement_desc || '', tx.ref_code || '').first();
               if (match) {
                 tx.auto_match = match;
               }
            }
          }

          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const { transaction_id, account_id, ref_code, date, time, statement_desc, total_amount, status, source, slip_image_url, details, check_only } = body;
          
          // Map invalid sources to allowed values under DB constraints
          let mappedSource = source || 'WEB_GRID';
          if (mappedSource === 'STATEMENT_PDF' || mappedSource === 'RESTORE_EXCEL') {
            mappedSource = 'PDF_IMPORT';
          }

          if (!account_id || !date || total_amount === undefined || !details || !details.length) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Validate Sub-transactions Sum (signed model: net = amount - sign(amount)*(|fee|+|wht|))
          let totalCalculated = 0;
          for (const d of details) {
            const amt = Number(d.amount || 0);
            const s = amt >= 0 ? 1 : -1;
            const fee = Math.abs(Number(d.fee || 0));
            const wht = Math.abs(Number(d.wht || 0));
            totalCalculated += amt - s * (fee + wht);
          }

          // Allow small floating point rounding error (< 0.01)
          // WEB_GRID cards are works-in-progress — skip balance check so auto-save works mid-edit
          if (mappedSource !== 'WEB_GRID' && Math.abs(totalCalculated - Number(total_amount)) > 0.01) {
            const fmt = (n) => { const a = Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); return n < 0 ? `(${a})` : a; };
            return new Response(JSON.stringify({
              error: `ผลรวมรายการย่อย ${fmt(totalCalculated)} ไม่เท่ากับยอด Statement ${fmt(Number(total_amount))}`,
              detailsSum: totalCalculated,
              totalAmount: total_amount
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // ── Duplicate Check (split by source) ─────────────────────────────
          const fmtAmt = (n) => { const a = Math.abs(Number(n)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); return Number(n)<0?`(${a})`:a; };

          if (mappedSource === 'PDF_IMPORT') {
            // PDF: check by ref_code (if present) OR (account+date+time+amount+statement_desc)
            let dupTx = null;
            if (ref_code) {
              dupTx = await env.DB.prepare(
                `SELECT transaction_id, date, total_amount, status, statement_desc FROM Transactions WHERE account_id = ? AND ref_code = ?`
              ).bind(account_id, ref_code).first();
            }
            if (!dupTx) {
              dupTx = await env.DB.prepare(`
                SELECT transaction_id, date, total_amount, status, statement_desc FROM Transactions
                WHERE account_id = ?
                  AND date = ?
                  AND (time = ? OR (time IS NULL AND ? IS NULL))
                  AND ABS(total_amount - ?) < 0.01
                  AND (statement_desc = ? OR (statement_desc IS NULL AND ? IS NULL))
              `).bind(account_id, date, time||null, time||null, total_amount, statement_desc||null, statement_desc||null).first();
            }
            if (dupTx) {
              return new Response(JSON.stringify({
                success: true, skipped: true,
                duplicate: true,
                message: `ซ้ำ: ${dupTx.date} | ${fmtAmt(dupTx.total_amount)} | ${dupTx.statement_desc || '-'} (${dupTx.status})`,
                existingId: dupTx.transaction_id
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          } else {
            // Non-PDF (WEB_GRID etc.): check (account+date+amount) against OTHER transactions only.
            // NOTE: a matching transaction_id means this is an UPDATE of the same record — not a duplicate.
            let dupTx = null;
            // Zero-amount rows are blank/in-progress cards — never treat them as duplicates
            if (Math.abs(Number(total_amount)) > 0.01) {
              dupTx = await env.DB.prepare(
                `SELECT transaction_id, date, total_amount, status FROM Transactions
                 WHERE account_id = ? AND date = ? AND ABS(total_amount - ?) < 0.01
                   AND transaction_id != ?`
              ).bind(account_id, date, total_amount, transaction_id || '').first();
            }
            if (dupTx) {
              const dupInfo = { isDuplicate: true, date: dupTx.date, amount: dupTx.total_amount, status: dupTx.status, existingId: dupTx.transaction_id };
              if (check_only) {
                return new Response(JSON.stringify(dupInfo), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
              return new Response(JSON.stringify({ error: `พบรายการซ้ำ: วันที่ ${dupTx.date} จำนวน ${fmtAmt(dupTx.total_amount)} (${dupTx.status})`, ...dupInfo }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            if (check_only) {
              return new Response(JSON.stringify({ isDuplicate: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
          // ── End Duplicate Check ───────────────────────────────────────────

          const txId = transaction_id || 'TX-' + Date.now();
          const txStatus = status || 'PENDING_REVIEW';
          
          // Transaction Block using D1 Batch
          const statements = [
            env.DB.prepare(`
              INSERT OR REPLACE INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(txId, account_id, ref_code || null, date, time || null, total_amount, statement_desc || null, txStatus, mappedSource, slip_image_url || null, userId),
            
            env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(txId)
          ];

          for (const d of details) {
            const detailId = d.detail_id || 'DT-' + Math.random().toString(36).substring(2, 11);
            statements.push(
              env.DB.prepare(`
                INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, contact_id, project_id, note, entity_id, type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(detailId, txId, d.amount, d.fee || 0, d.wht || 0, d.category_id || 'Cat_Uncategorized', d.contact_id || null, d.project_id || null, d.note || null, d.entity_id || null, d.type || 'OTHER')
            );
          }

          await env.DB.batch(statements);
          return new Response(JSON.stringify({ success: true, transaction_id: txId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // 4. Confirm Transaction
      if (url.pathname === '/api/transactions/confirm' && request.method === 'POST') {
        const { transaction_id } = await request.json();
        await env.DB.prepare(`UPDATE Transactions SET status = 'CONFIRMED' WHERE transaction_id = ?`).bind(transaction_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 5. Delete Transaction
      if (url.pathname === '/api/transactions/delete' && request.method === 'POST') {
        const { transaction_id } = await request.json();
        await env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id = ?`).bind(transaction_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 6. Outstanding AR/AP
      if (url.pathname === '/api/outstanding_ar' && request.method === 'GET') {
        const query = `
          SELECT
            d.detail_id, d.transaction_id, t.date, d.amount, d.note, cp.behavior as behavior, cp.type_id as caption_id,
            c.name as category_name, co.name as contact_name, e.name as entity_name,
            IFNULL(SUM(s.settled_amount), 0) as settled_total,
            (d.amount - IFNULL(SUM(s.settled_amount), 0)) as remaining_amount
          FROM TransactionDetails d
          JOIN Transactions t ON d.transaction_id = t.transaction_id
          JOIN Categories c ON d.category_id = c.category_id
          JOIN Captions cp ON c.caption_id = cp.type_id
          LEFT JOIN Contacts co ON d.contact_id = co.contact_id
          LEFT JOIN Entities e ON d.entity_id = e.entity_id
          LEFT JOIN Settlements s ON d.detail_id = s.parent_detail_id
          WHERE cp.behavior IN ('ASSET', 'LIABILITY')
            AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'   /* เงินลงทุนไม่ใช่ลูกหนี้ */
            AND t.status = 'CONFIRMED'
          GROUP BY d.detail_id
          HAVING remaining_amount > 0 OR remaining_amount < 0
          ORDER BY t.date ASC
        `;
        const result = await env.DB.prepare(query).all();
        return new Response(JSON.stringify(result.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 7. Settlements
      if (url.pathname === '/api/settlements' && request.method === 'POST') {
        const body = await request.json();
        const { parent_detail_id, child_detail_id, settled_amount } = body;
        
        if (!parent_detail_id || !child_detail_id || !settled_amount) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const settlement_id = 'STL-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        await env.DB.prepare(`
          INSERT INTO Settlements (settlement_id, parent_detail_id, child_detail_id, settled_amount)
          VALUES (?, ?, ?, ?)
        `).bind(settlement_id, parent_detail_id, child_detail_id, settled_amount).run();
        
        return new Response(JSON.stringify({ success: true, settlement_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 6. Master Data Endpoints
      if (url.pathname === '/api/account-types') {
        const types = await env.DB.prepare(`SELECT * FROM Captions ORDER BY behavior, name`).all();
        return new Response(JSON.stringify(types.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/categories') {
        const categories = await env.DB.prepare(`
          SELECT c.*, at.name as caption_name, at.behavior as caption_behavior 
          FROM Categories c
          JOIN Captions at ON c.caption_id = at.type_id
          ORDER BY at.name, c.name
        `).all();
        return new Response(JSON.stringify(categories.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/contacts') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = userId ? await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first() : null;
        if (!userCheck) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const allContacts = await env.DB.prepare(`SELECT * FROM Contacts WHERE family_id = ? ORDER BY name`).bind(userCheck.family_id).all();
        const filtered = allContacts.results.filter(c => {
          if (!c.members) return true;
          try {
            const m = JSON.parse(c.members);
            if (!Array.isArray(m) || m.length === 0) return true;
            return m.includes(userId);
          } catch { return true; }
        });
        return new Response(JSON.stringify(filtered), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/projects') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = userId ? await env.DB.prepare(`SELECT family_id, role FROM Users WHERE user_id = ?`).bind(userId).first() : null;
        if (!userCheck) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const allProjects = await env.DB.prepare(`SELECT * FROM Projects WHERE family_id = ? ORDER BY name`).bind(userCheck.family_id).all();
        const filtered = allProjects.results.filter(p => {
          if (!p.members) return true;
          try {
            const members = JSON.parse(p.members);
            if (!Array.isArray(members) || members.length === 0) return true;
            return members.includes(userId);
          } catch { return true; }
        });
        return new Response(JSON.stringify(filtered), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/entities') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const entities = await env.DB.prepare(`
          SELECT e.* 
          FROM Entities e
          JOIN UserPermissions up ON e.entity_id = up.entity_id
          WHERE up.user_id = ?
          ORDER BY e.name
        `).bind(userId).all();
        return new Response(JSON.stringify(entities.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      if (url.pathname === '/api/debts' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const allDebts = await env.DB.prepare(`SELECT * FROM Debts WHERE family_id = ? ORDER BY name`).bind(userCheck.family_id).all();
        const filtered = allDebts.results.filter(d => {
          if (!d.members) return true;
          try {
            const m = JSON.parse(d.members);
            if (!Array.isArray(m) || m.length === 0) return true;
            return m.includes(userId);
          } catch { return true; }
        });
        return new Response(JSON.stringify(filtered), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/debts' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const data = await request.json();
        const debtMembersJson = data.debt_members && data.debt_members.length > 0 ? JSON.stringify(data.debt_members) : null;
        if (data.debt_id) {
          await env.DB.prepare(`
            UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?, icon_type=?, members=COALESCE(?,members)
            WHERE debt_id=? AND family_id=?
          `).bind(data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.icon_type, debtMembersJson, data.debt_id, userCheck.family_id).run();
        } else {
          const debt_id = 'DBT' + Date.now();
          await env.DB.prepare(`
            INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date, icon_type, members)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(debt_id, userCheck.family_id, data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.icon_type || 'zodiac_1.png', debtMembersJson).run();
        }
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/debts/delete' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const data = await request.json();
        await env.DB.prepare('DELETE FROM Debts WHERE debt_id=? AND family_id=?').bind(data.debt_id, userCheck.family_id).run();
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/accounts') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const accounts = await env.DB.prepare(`
          SELECT a.account_id, a.entity_id, a.name, a.bank_name, a.account_number, a.pdf_password, e.name as entity_name,
                 ROUND(COALESCE((SELECT SUM(t.total_amount) FROM Transactions t WHERE t.account_id = a.account_id AND t.status = 'CONFIRMED'), 0), 2) as balance
          FROM Accounts a
          JOIN Entities e ON a.entity_id = e.entity_id
          JOIN UserPermissions up ON e.entity_id = up.entity_id
          WHERE up.user_id = ? AND IFNULL(a.account_type,'BANK') != 'TRIP_HOLDING'
          ORDER BY e.name, a.name
        `).bind(userId).all();
        return new Response(JSON.stringify(accounts.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 7. AR/AP Debtor/Creditor Outstanding Report
      if (url.pathname === '/api/reports/outstanding') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const contactId = url.searchParams.get('contactId');
        
        let query = `
          SELECT 
            co.name as contact_name,
            co.contact_id,
            d.detail_id,
            d.amount,
            d.note,
            t.date,
            e.name as entity_name,
            -- Calculate remaining balance after settlements
            d.amount - COALESCE((SELECT SUM(settled_amount) FROM Settlements WHERE parent_detail_id = d.detail_id), 0) as remaining_amount
          FROM TransactionDetails d
          JOIN Transactions t ON d.transaction_id = t.transaction_id
          JOIN Accounts a ON t.account_id = a.account_id
          JOIN Entities e ON a.entity_id = e.entity_id
          JOIN UserPermissions up ON e.entity_id = up.entity_id
          JOIN Contacts co ON d.contact_id = co.contact_id
          JOIN Categories c ON d.category_id = c.category_id
          JOIN Captions cp ON c.caption_id = cp.type_id
          WHERE up.user_id = ? AND cp.behavior IN ('ASSET', 'LIABILITY')
            AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'   /* เงินลงทุนไม่ใช่ลูกหนี้ */
            AND t.status = 'CONFIRMED'
        `;
        const params = [userId];
        
        if (contactId) {
          query += ` AND co.contact_id = ?`;
          params.push(contactId);
        }

        query += ` ORDER BY t.date DESC`;
        const outstandingItems = await env.DB.prepare(query).bind(...params).all();
        
        // Filter out fully paid items in javascript
        const outstanding = outstandingItems.results.filter(item => item.remaining_amount > 0.01);
        
        return new Response(JSON.stringify(outstanding), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 9. Trial Balance Report
      if (url.pathname === '/api/reports/trial-balance') {
        const entityId = url.searchParams.get('entityId');
        if (!entityId) {
          return new Response(JSON.stringify({ error: 'Missing entityId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Calculates sum of Dr (debit) and Cr (credit) grouped by Category
        const trialBalance = await env.DB.prepare(`
          SELECT 
            c.name as category_name,
            at.behavior as category_type,
            at.name as caption_name,
            SUM(CASE WHEN d.amount < 0 THEN ABS(d.amount) ELSE 0 END) as debit,
            SUM(CASE WHEN d.amount > 0 THEN d.amount ELSE 0 END) as credit
          FROM TransactionDetails d
          JOIN Transactions t ON d.transaction_id = t.transaction_id
          JOIN Categories c ON d.category_id = c.category_id
          JOIN Captions at ON c.caption_id = at.type_id
          JOIN Accounts a ON t.account_id = a.account_id
          WHERE a.entity_id = ? AND t.status = 'CONFIRMED'
          GROUP BY c.category_id
        `).bind(entityId).all();

        return new Response(JSON.stringify(trialBalance.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 10. Withholding Tax (WHT) Monthly Report
      if (url.pathname === '/api/reports/wht') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const yearMonth = url.searchParams.get('month'); // Format: YYYY-MM
        
        let query = `
          SELECT 
            t.date,
            co.name as contact_name,
            e.name as entity_name,
            d.amount as amount_before_tax,
            d.wht as wht_amount,
            t.ref_code
          FROM TransactionDetails d
          JOIN Transactions t ON d.transaction_id = t.transaction_id
          JOIN Accounts a ON t.account_id = a.account_id
          JOIN Entities e ON a.entity_id = e.entity_id
          JOIN UserPermissions up ON e.entity_id = up.entity_id
          JOIN Contacts co ON d.contact_id = co.contact_id
          WHERE up.user_id = ? AND d.wht > 0 AND t.status = 'CONFIRMED'
        `;
        const params = [userId];

        if (yearMonth) {
          query += ` AND strftime('%Y-%m', t.date) = ?`;
          params.push(yearMonth);
        }

        const entityId = url.searchParams.get('entityId');
        if (entityId) {
          query += ` AND e.entity_id = ?`;
          params.push(entityId);
        }

        query += ` ORDER BY t.date ASC`;
        const whtReport = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify(whtReport.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 11. Database Export Endpoint (For Google Sheets sync)
      if (url.pathname === '/api/export') {
        const table = url.searchParams.get('table') || 'Transactions';
        const validTables = ['Transactions', 'TransactionDetails', 'Accounts', 'Entities', 'Categories', 'Contacts', 'Projects', 'Settlements'];
        if (!validTables.includes(table)) {
          return new Response(JSON.stringify({ error: 'Invalid table name' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const data = await env.DB.prepare(`SELECT * FROM ${table}`).all();
        return new Response(JSON.stringify(data.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 12. Settings Get All Lists
      if (url.pathname === '/api/settings' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const familyId = userCheck.family_id;

        const entities = await env.DB.prepare(`SELECT * FROM Entities WHERE family_id = ? ORDER BY name`).bind(familyId).all();
        // admin sees all contacts; member sees shared + contacts where they are in members
        const allContactsForSettings = await env.DB.prepare(`SELECT * FROM Contacts WHERE family_id = ? ORDER BY name`).bind(familyId).all();
        const contacts = { results: userCheck.role === 'admin' ? allContactsForSettings.results : allContactsForSettings.results.filter(c => {
          if (!c.members) return true;
          try { const m = JSON.parse(c.members); return !Array.isArray(m) || m.length === 0 || m.includes(userId); } catch { return true; }
        })};
        const captions = await env.DB.prepare(`SELECT * FROM Captions WHERE family_id = ? ORDER BY behavior, name`).bind(familyId).all();
        const categories = await env.DB.prepare(`
          SELECT c.*, at.name as caption_name 
          FROM Categories c
          JOIN Captions at ON c.caption_id = at.type_id
          WHERE c.family_id = ? ORDER BY at.name, c.name
        `).bind(familyId).all();
        const allProjectsForSettings = await env.DB.prepare(`SELECT * FROM Projects WHERE family_id = ? ORDER BY name`).bind(familyId).all();
        // admin sees all; member sees shared + trips they're a member of
        const projects = { results: userCheck.role === 'admin' ? allProjectsForSettings.results : allProjectsForSettings.results.filter(p => {
          if (!p.members) return true;
          try { const m = JSON.parse(p.members); return !Array.isArray(m) || m.length === 0 || m.includes(userId); } catch { return true; }
        })};
        
        // For accounts, join with Entities to filter by family_id
        const accounts = await env.DB.prepare(`
          SELECT a.account_id, a.entity_id, a.name, a.bank_name, a.account_number, a.pdf_password, e.name as entity_name,
                 IFNULL(a.account_type,'BANK') AS account_type,
                 IFNULL(a.credit_limit,0)      AS credit_limit,
                 a.statement_day, a.due_day,
                 ROUND(COALESCE((SELECT SUM(t.total_amount) FROM Transactions t WHERE t.account_id = a.account_id AND t.status = 'CONFIRMED'), 0), 2) as balance
          FROM Accounts a
          JOIN Entities e ON a.entity_id = e.entity_id
          WHERE e.family_id = ? AND IFNULL(a.account_type,'BANK') != 'TRIP_HOLDING'
          ORDER BY e.name, a.name
        `).bind(familyId).all();

        // Get user permissions mappings to show in Owner tab
        const entityUsers = await env.DB.prepare(`
          SELECT up.entity_id, u.name as user_name, u.user_id
          FROM UserPermissions up
          JOIN Users u ON up.user_id = u.user_id
          WHERE u.family_id = ?
        `).bind(familyId).all();

        return new Response(JSON.stringify({
          entities: entities.results,
          contacts: contacts.results,
          captions: captions.results,
          categories: categories.results,
          projects: projects.results,
          accounts: accounts.results,
          entity_users: entityUsers.results
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 13. Settings Save Endpoint (Add/Edit with Cascade Update)
      if (url.pathname === '/api/settings/save' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await request.json();
        const { type, old_id, new_id, name, bank_name, account_number, pdf_password, is_company, category_type, contact_type, project_status, project_members, contact_members, entity_members, entity_id: body_entity_id, default_entity_id, default_contact_id, default_type, account_type, credit_limit, statement_day, due_day } = body;

        // helper: ทำความสะอาดค่าบัตรเครดิต
        const accType = ['BANK','CASH','CREDIT'].includes(String(account_type||'').toUpperCase()) ? String(account_type).toUpperCase() : 'BANK';
        const credLimit = accType === 'CREDIT' ? (Number(credit_limit) || 0) : 0;
        const stmtDay = (statement_day !== undefined && statement_day !== null && statement_day !== '') ? Number(statement_day) : null;
        const dueDay  = (due_day !== undefined && due_day !== null && due_day !== '') ? Number(due_day) : null;
        // รายชื่อสมาชิกผู้ถือ Company (ถ้าไม่ส่งมา/ว่าง = เฉพาะผู้สร้าง)
        const entMembers = (Array.isArray(entity_members) && entity_members.length > 0) ? entity_members : null;

        // UI ส่ง 'INVESTMENT' มาเป็นตัวเลือกเดียว แต่ DB เก็บแยก 2 คอลัมน์
        // (behavior มี CHECK constraint ที่ไม่มีค่า INVESTMENT — แก้ไม่ได้บน D1)
        const capBehavior = String(category_type || 'EXPENSE').toUpperCase().trim() === 'INVESTMENT' ? 'ASSET' : (category_type || 'EXPENSE');
        const capSub      = String(category_type || '').toUpperCase().trim() === 'INVESTMENT' ? 'INVESTMENT' : null;

        if (!type || !new_id || !name) {
          return new Response(JSON.stringify({ error: 'กรุณากรอกข้อมูลหลักให้ครบถ้วน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const statements = [];

        // CASE 1: Create New Master Data Item
        if (!old_id) {
          let dupCheckQuery = '';
          if (type === 'account') dupCheckQuery = 'SELECT account_id FROM Accounts WHERE account_id = ?';
          else if (type === 'entity') dupCheckQuery = 'SELECT entity_id FROM Entities WHERE entity_id = ?';
          else if (type === 'caption') dupCheckQuery = 'SELECT type_id FROM Captions WHERE type_id = ?';
          else if (type === 'category') dupCheckQuery = 'SELECT category_id FROM Categories WHERE category_id = ?';
          else if (type === 'contact') dupCheckQuery = 'SELECT contact_id FROM Contacts WHERE contact_id = ?';
          else if (type === 'project') dupCheckQuery = 'SELECT project_id FROM Projects WHERE project_id = ?';

          const dup = await env.DB.prepare(dupCheckQuery).bind(new_id).first();
          if (dup) {
            return new Response(JSON.stringify({ error: `รหัส ID "${new_id}" ซ้ำในระบบ กรุณาใช้รหัสอื่น` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          if (type === 'account') {
            statements.push(
              env.DB.prepare(`INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance, pdf_password, account_type, credit_limit, statement_day, due_day) VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?)`).bind(new_id, body_entity_id || default_entity_id || null, name, bank_name || null, account_number || null, pdf_password || null, accType, credLimit, stmtDay, dueDay)
            );
          } else if (type === 'entity') {
            statements.push(
              env.DB.prepare(`
                INSERT INTO Entities (entity_id, family_id, name, is_company)
                VALUES (?, ?, ?, ?)
              `).bind(new_id, userCheck.family_id, name, Number(is_company || 0))
            );
            // สมาชิกผู้ถือ Company (many-to-many) — ถ้าไม่เลือก = ผู้สร้างคนเดียว
            const ownerList = entMembers || [userId];
            for (const uid of ownerList) {
              statements.push(
                env.DB.prepare(`INSERT OR IGNORE INTO UserPermissions (user_id, entity_id) VALUES (?, ?)`).bind(uid, new_id)
              );
            }
          } else if (type === 'caption') {
            statements.push(
              env.DB.prepare(`
                INSERT INTO Captions (type_id, family_id, name, behavior, sub_behavior, default_entity_id, default_contact_id, default_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(new_id, userCheck.family_id, name, capBehavior, capSub, default_entity_id || null, default_contact_id || null, default_type || null)
            );
          } else if (type === 'category') {
            statements.push(
              env.DB.prepare(`
                INSERT INTO Categories (category_id, family_id, name, caption_id, default_entity_id, default_contact_id, default_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).bind(new_id, userCheck.family_id, name, category_type, default_entity_id || null, default_contact_id || null, default_type || null) // here category_type holds the caption_id
            );
          } else if (type === 'contact') {
            const contactMembersJson = contact_members && contact_members.length > 0 ? JSON.stringify(contact_members) : null;
            statements.push(
              env.DB.prepare(`
                INSERT INTO Contacts (contact_id, family_id, name, contact_type, members)
                VALUES (?, ?, ?, ?, ?)
              `).bind(new_id, userCheck.family_id, name, contact_type || 'CUSTOMER', contactMembersJson)
            );
          } else if (type === 'project') {
            statements.push(
              env.DB.prepare(`
                INSERT INTO Projects (project_id, family_id, name, status, members)
                VALUES (?, ?, ?, ?, ?)
              `).bind(new_id, userCheck.family_id, name, project_status || 'active', project_members ? JSON.stringify(project_members) : null)
            );
          }
        } 
        // CASE 2: Edit Existing Item (Update or Cascade ID Update)
        else {
          const isIdChanged = (old_id !== new_id);

          if (type === 'account') {
            if (isIdChanged) {
              statements.push(env.DB.prepare(`UPDATE Transactions SET account_id = ? WHERE account_id = ?`).bind(new_id, old_id));
              statements.push(
                env.DB.prepare(`
                  INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance, pdf_password, account_type, credit_limit, statement_day, due_day)
                  SELECT ?, COALESCE(?, entity_id), ?, ?, ?, balance, ?, ?, ?, ?, ? FROM Accounts WHERE account_id = ?
                `).bind(new_id, body_entity_id || null, name, bank_name || null, account_number || null, pdf_password || null, accType, credLimit, stmtDay, dueDay, old_id)
              );
              statements.push(env.DB.prepare(`DELETE FROM Accounts WHERE account_id = ?`).bind(old_id));
            } else {
              statements.push(
                env.DB.prepare(`
                  UPDATE Accounts SET name = ?, bank_name = ?, account_number = ?, pdf_password = ?, entity_id = COALESCE(?, entity_id), account_type = ?, credit_limit = ?, statement_day = ?, due_day = ? WHERE account_id = ?
                `).bind(name, bank_name || null, account_number || null, pdf_password || null, body_entity_id || null, accType, credLimit, stmtDay, dueDay, old_id)
              );
            }
          } else if (type === 'entity') {
            if (isIdChanged) {
              statements.push(env.DB.prepare(`UPDATE Accounts SET entity_id = ? WHERE entity_id = ?`).bind(new_id, old_id));
              statements.push(env.DB.prepare(`UPDATE TransactionDetails SET entity_id = ? WHERE entity_id = ?`).bind(new_id, old_id));
              statements.push(env.DB.prepare(`UPDATE UserPermissions SET entity_id = ? WHERE entity_id = ?`).bind(new_id, old_id));
              statements.push(
                env.DB.prepare(`
                  INSERT INTO Entities (entity_id, family_id, name, is_company)
                  SELECT ?, family_id, ?, ? FROM Entities WHERE entity_id = ?
                `).bind(new_id, name, Number(is_company || 0), old_id)
              );
              statements.push(env.DB.prepare(`DELETE FROM Entities WHERE entity_id = ?`).bind(old_id));
            } else {
              statements.push(
                env.DB.prepare(`
                  UPDATE Entities SET name = ?, is_company = ? WHERE entity_id = ?
                `).bind(name, Number(is_company || 0), old_id)
              );
            }
            // ปรับสมาชิกผู้ถือ Company ให้ตรงกับที่เลือก (เฉพาะเมื่อส่ง entity_members มา)
            if (entMembers) {
              const targetId = new_id;
              statements.push(env.DB.prepare(`DELETE FROM UserPermissions WHERE entity_id = ?`).bind(targetId));
              for (const uid of entMembers) {
                statements.push(env.DB.prepare(`INSERT OR IGNORE INTO UserPermissions (user_id, entity_id) VALUES (?, ?)`).bind(uid, targetId));
              }
            }
          } else if (type === 'caption') {
            if (isIdChanged) {
              statements.push(env.DB.prepare(`UPDATE Categories SET caption_id = ? WHERE caption_id = ?`).bind(new_id, old_id));
              statements.push(
                env.DB.prepare(`
                  INSERT INTO Captions (type_id, family_id, name, behavior, sub_behavior, default_entity_id, default_contact_id, default_type)
                  SELECT ?, family_id, ?, ?, ?, ?, ?, ? FROM Captions WHERE type_id = ?
                `).bind(new_id, name, capBehavior, capSub, default_entity_id || null, default_contact_id || null, default_type || null, old_id)
              );
              statements.push(env.DB.prepare(`DELETE FROM Captions WHERE type_id = ?`).bind(old_id));
            } else {
              statements.push(
                env.DB.prepare(`
                  UPDATE Captions SET name = ?, behavior = ?, sub_behavior = ?, default_entity_id = ?, default_contact_id = ?, default_type = ? WHERE type_id = ?
                `).bind(name, capBehavior, capSub, default_entity_id || null, default_contact_id || null, default_type || null, old_id)
              );
            }
          } else if (type === 'category') {
            if (isIdChanged) {
              statements.push(env.DB.prepare(`UPDATE TransactionDetails SET category_id = ? WHERE category_id = ?`).bind(new_id, old_id));
              statements.push(
                env.DB.prepare(`
                  INSERT INTO Categories (category_id, family_id, name, caption_id, default_entity_id, default_contact_id, default_type)
                  SELECT ?, family_id, ?, ?, ?, ?, ? FROM Categories WHERE category_id = ?
                `).bind(new_id, name, category_type, default_entity_id || null, default_contact_id || null, default_type || null, old_id)
              );
              statements.push(env.DB.prepare(`DELETE FROM Categories WHERE category_id = ?`).bind(old_id));
            } else {
              statements.push(
                env.DB.prepare(`
                  UPDATE Categories SET name = ?, caption_id = ?, default_entity_id = ?, default_contact_id = ?, default_type = ? WHERE category_id = ?
                `).bind(name, category_type, default_entity_id || null, default_contact_id || null, default_type || null, old_id)
              );
            }
          } else if (type === 'contact') {
            const contactMembersJson = contact_members !== undefined
              ? (contact_members && contact_members.length > 0 ? JSON.stringify(contact_members) : null)
              : undefined;
            if (isIdChanged) {
              statements.push(env.DB.prepare(`UPDATE TransactionDetails SET contact_id = ? WHERE contact_id = ?`).bind(new_id, old_id));
              statements.push(
                env.DB.prepare(`
                  INSERT INTO Contacts (contact_id, family_id, name, contact_type, members)
                  SELECT ?, family_id, ?, ?, COALESCE(?, members) FROM Contacts WHERE contact_id = ?
                `).bind(new_id, name, contact_type || 'CUSTOMER', contactMembersJson !== undefined ? contactMembersJson : null, old_id)
              );
              statements.push(env.DB.prepare(`DELETE FROM Contacts WHERE contact_id = ?`).bind(old_id));
            } else {
              statements.push(
                env.DB.prepare(`
                  UPDATE Contacts SET name = ?, contact_type = ?, members = COALESCE(?, members) WHERE contact_id = ?
                `).bind(name, contact_type || 'CUSTOMER', contactMembersJson !== undefined ? contactMembersJson : null, old_id)
              );
            }
          } else if (type === 'project') {
            const membersJson = project_members !== undefined ? JSON.stringify(project_members || []) : null;
            if (isIdChanged) {
              statements.push(env.DB.prepare(`UPDATE TransactionDetails SET project_id = ? WHERE project_id = ?`).bind(new_id, old_id));
              statements.push(
                env.DB.prepare(`
                  INSERT INTO Projects (project_id, family_id, name, status, members)
                  SELECT ?, family_id, ?, ?, COALESCE(?, members) FROM Projects WHERE project_id = ?
                `).bind(new_id, name, project_status || 'active', membersJson, old_id)
              );
              statements.push(env.DB.prepare(`DELETE FROM Projects WHERE project_id = ?`).bind(old_id));
            } else {
              statements.push(
                env.DB.prepare(`
                  UPDATE Projects SET name = ?, status = ?, members = COALESCE(?, members) WHERE project_id = ?
                `).bind(name, project_status || 'active', membersJson, old_id)
              );
            }
          }
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 13.7. Flat Export — 1 row per TransactionDetail with all joins
      if (url.pathname === '/api/export/flat' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const fid = userCheck.family_id;
        const startDate = url.searchParams.get('startDate') || null;
        const endDate   = url.searchParams.get('endDate')   || null;
        const accountId = url.searchParams.get('accountId') || null;
        const status    = url.searchParams.get('status')    || null;

        let where = `WHERE e_acc.family_id = ?`;
        const params = [fid];
        if (startDate) { where += ` AND t.date >= ?`; params.push(startDate); }
        if (endDate)   { where += ` AND t.date <= ?`; params.push(endDate); }
        if (accountId) { where += ` AND t.account_id = ?`; params.push(accountId); }
        if (status)    { where += ` AND t.status = ?`; params.push(status); }

        const rows = await env.DB.prepare(`
          SELECT
            t.date,
            t.time,
            a.name        AS account_name,
            e_acc.name    AS account_entity,
            t.statement_desc,
            t.ref_code,
            t.total_amount,
            t.status,
            t.source,
            d.amount      AS detail_amount,
            d.fee,
            d.wht,
            COALESCE(d.type, '') AS detail_type,
            cap.name      AS caption_name,
            cat.name      AS category_name,
            co.name       AS contact_name,
            ent.name      AS entity_name,
            p.name        AS project_name,
            d.note,
            t.transaction_id,
            d.detail_id
          FROM Transactions t
          JOIN Accounts a       ON t.account_id = a.account_id
          JOIN Entities e_acc   ON a.entity_id  = e_acc.entity_id
          LEFT JOIN TransactionDetails d ON d.transaction_id = t.transaction_id
          LEFT JOIN Categories cat ON d.category_id = cat.category_id
          LEFT JOIN Captions cap   ON cat.caption_id = cap.type_id
          LEFT JOIN Contacts co    ON d.contact_id  = co.contact_id
          LEFT JOIN Entities ent   ON d.entity_id   = ent.entity_id
          LEFT JOIN Projects p     ON d.project_id  = p.project_id
          ${where}
          ORDER BY t.date DESC, t.time DESC, t.transaction_id, d.detail_id
        `).bind(...params).all();

        return new Response(JSON.stringify(rows.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 14. Full Database Backup (admin only)
      if (url.pathname === '/api/backup/full' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck || userCheck.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = userCheck.family_id;
        const startDate = url.searchParams.get('startDate') || null;
        const endDate = url.searchParams.get('endDate') || null;

        let txWhere = `WHERE t.account_id IN (SELECT account_id FROM Accounts a JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`;
        const txParams = [fid];
        if (startDate) { txWhere += ` AND t.date >= ?`; txParams.push(startDate); }
        if (endDate) { txWhere += ` AND t.date <= ?`; txParams.push(endDate); }

        const [entities, accounts, captions, categories, contacts, projects, debts, transactions, txDetails, settlements, tripStops, tripExpenses, userPerms] = await Promise.all([
          env.DB.prepare(`SELECT * FROM Entities WHERE family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT a.* FROM Accounts a JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT * FROM Captions WHERE family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT * FROM Categories WHERE family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT * FROM Contacts WHERE family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT * FROM Projects WHERE family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT * FROM Debts WHERE family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT t.* FROM Transactions t ${txWhere} ORDER BY t.date DESC, t.created_at DESC`).bind(...txParams).all(),
          env.DB.prepare(`SELECT d.* FROM TransactionDetails d JOIN Transactions t ON d.transaction_id=t.transaction_id ${txWhere} ORDER BY d.detail_id`).bind(...txParams).all(),
          env.DB.prepare(`SELECT s.* FROM Settlements s JOIN TransactionDetails d ON s.parent_detail_id=d.detail_id JOIN Transactions t ON d.transaction_id=t.transaction_id ${txWhere}`).bind(...txParams).all(),
          env.DB.prepare(`SELECT ts.* FROM TripStops ts JOIN Projects p ON ts.project_id=p.project_id WHERE p.family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT te.* FROM TripExpenses te JOIN Projects p ON te.project_id=p.project_id WHERE p.family_id=?`).bind(fid).all(),
          env.DB.prepare(`SELECT up.* FROM UserPermissions up JOIN Entities e ON up.entity_id=e.entity_id WHERE e.family_id=?`).bind(fid).all(),
        ]);

        return new Response(JSON.stringify({
          exported_at: new Date().toISOString(),
          family_id: fid,
          entities: entities.results,
          accounts: accounts.results,
          captions: captions.results,
          categories: categories.results,
          contacts: contacts.results,
          projects: projects.results,
          debts: debts.results,
          transactions: transactions.results,
          transaction_details: txDetails.results,
          settlements: settlements.results,
          trip_stops: tripStops.results,
          trip_expenses: tripExpenses.results,
          user_permissions: userPerms.results,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 15. Full Database Restore / Upsert (admin only)
      if (url.pathname === '/api/restore/full' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck || userCheck.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = userCheck.family_id;
        const body = await request.json();
        const stats = {};

        // โหมด replace = ล้างข้อมูลครอบครัวก่อน (เก็บ Users/Families) แล้วค่อยนำเข้า
        // → กู้กลับไปสภาพเดิมเป๊ะ (ลบแถวที่ไม่มีในไฟล์ backup ด้วย)
        if (body.mode === 'replace') {
          const wipe = async (sql) => { try { await env.DB.prepare(sql).bind(fid).run(); } catch (e) { /* ข้ามตารางที่ไม่มี */ } };
          await wipe(`DELETE FROM Settlements WHERE parent_detail_id IN (SELECT d.detail_id FROM TransactionDetails d JOIN Transactions t ON d.transaction_id=t.transaction_id JOIN Accounts a ON t.account_id=a.account_id JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`);
          await wipe(`DELETE FROM TransactionDetails WHERE transaction_id IN (SELECT t.transaction_id FROM Transactions t JOIN Accounts a ON t.account_id=a.account_id JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`);
          await wipe(`DELETE FROM Transactions WHERE account_id IN (SELECT a.account_id FROM Accounts a JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`);
          await wipe(`DELETE FROM TripDocuments WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`);
          await wipe(`DELETE FROM TripBudgets WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`);
          await wipe(`DELETE FROM TripStops WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`);
          await wipe(`DELETE FROM TripExpenses WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`);
          await wipe(`DELETE FROM PlannedExpenses WHERE family_id=?`);
          await wipe(`DELETE FROM CategoryBudgets WHERE family_id=?`);
          await wipe(`DELETE FROM Debts WHERE family_id=?`);
          await wipe(`DELETE FROM Accounts WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id=?)`);
          await wipe(`DELETE FROM Categories WHERE family_id=?`);
          await wipe(`DELETE FROM Captions WHERE family_id=?`);
          await wipe(`DELETE FROM Contacts WHERE family_id=?`);
          await wipe(`DELETE FROM Projects WHERE family_id=?`);
          await wipe(`DELETE FROM UserPermissions WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id=?)`);
          await wipe(`DELETE FROM Entities WHERE family_id=?`);
          stats.mode = 'replace';
        }

        // Helper: upsert rows for a table
        const upsert = async (rows, sql, mapper) => {
          if (!rows || rows.length === 0) return 0;
          const stmts = rows.map(r => env.DB.prepare(sql).bind(...mapper(r, fid)));
          // Batch in chunks of 100
          let count = 0;
          for (let i = 0; i < stmts.length; i += 100) {
            await env.DB.batch(stmts.slice(i, i + 100));
            count += Math.min(100, stmts.length - i);
          }
          return count;
        };

        // Upsert in FK-safe order
        stats.entities = await upsert(body.entities,
          `INSERT OR REPLACE INTO Entities (entity_id, family_id, name, is_company, created_at) VALUES (?,?,?,?,?)`,
          (r) => [r.entity_id, fid, r.name, r.is_company ?? 0, r.created_at || new Date().toISOString()]);

        stats.accounts = await upsert(body.accounts,
          `INSERT OR REPLACE INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance, pdf_password, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          (r) => [r.account_id, r.entity_id, r.name, r.bank_name || null, r.account_number || null, r.balance || 0, r.pdf_password || null, r.created_at || new Date().toISOString()]);

        stats.captions = await upsert(body.captions,
          `INSERT OR REPLACE INTO Captions (type_id, family_id, name, behavior, sub_behavior, default_entity_id, default_contact_id, default_type, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          (r) => {
            const raw = String(r.behavior || 'EXPENSE').toUpperCase().trim();
            const beh = raw === 'INVESTMENT' ? 'ASSET' : raw;
            const sub = raw === 'INVESTMENT' ? 'INVESTMENT' : (r.sub_behavior || null);
            return [r.type_id, fid, r.name, beh, sub, r.default_entity_id || null, r.default_contact_id || null, r.default_type || null, r.created_at || new Date().toISOString()];
          });

        stats.categories = await upsert(body.categories,
          `INSERT OR REPLACE INTO Categories (category_id, family_id, name, caption_id, default_entity_id, default_contact_id, default_type, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          (r) => [r.category_id, fid, r.name, r.caption_id, r.default_entity_id || null, r.default_contact_id || null, r.default_type || null, r.created_at || new Date().toISOString()]);

        stats.contacts = await upsert(body.contacts,
          `INSERT OR REPLACE INTO Contacts (contact_id, family_id, name, contact_type, members, created_at) VALUES (?,?,?,?,?,?)`,
          (r) => [r.contact_id, fid, r.name, r.contact_type || 'CUSTOMER', r.members || null, r.created_at || new Date().toISOString()]);

        stats.projects = await upsert(body.projects,
          `INSERT OR REPLACE INTO Projects (project_id, family_id, name, status, members, created_at) VALUES (?,?,?,?,?,?)`,
          (r) => [r.project_id, fid, r.name, r.status || 'active', r.members || null, r.created_at || new Date().toISOString()]);

        stats.debts = await upsert(body.debts,
          `INSERT OR REPLACE INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date, icon_type, status, members, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          (r) => [r.debt_id, fid, r.name, r.type, r.contact_id, r.principal_category_id, r.interest_category_id || null, r.start_balance, r.installment_amount || null, r.start_date || null, r.icon_type || 'zodiac_1.png', r.status || 'active', r.members || null, r.created_at || new Date().toISOString()]);

        stats.transactions = await upsert(body.transactions,
          `INSERT OR REPLACE INTO Transactions (transaction_id, account_id, date, time, total_amount, statement_desc, ref_code, status, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          (r) => [r.transaction_id, r.account_id, r.date, r.time || null, r.total_amount, r.statement_desc || null, r.ref_code || null, r.status || 'CONFIRMED', r.source || 'MANUAL', r.created_at || new Date().toISOString()]);

        stats.transaction_details = await upsert(body.transaction_details,
          `INSERT OR REPLACE INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          (r) => [r.detail_id, r.transaction_id, r.amount, r.fee || 0, r.wht || 0, r.category_id, r.entity_id || null, r.contact_id || null, r.project_id || null, r.note || null, r.type || 'OTHER', r.created_at || new Date().toISOString()]);

        stats.settlements = await upsert(body.settlements,
          `INSERT OR REPLACE INTO Settlements (settlement_id, parent_detail_id, child_detail_id, settled_amount, created_at) VALUES (?,?,?,?,?)`,
          (r) => [r.settlement_id, r.parent_detail_id, r.child_detail_id, r.settled_amount, r.created_at || new Date().toISOString()]);

        stats.trip_stops = await upsert(body.trip_stops,
          `INSERT OR REPLACE INTO TripStops (stop_id, project_id, stop_date, time, city, accommodation, restaurants, notes, location_type, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          (r) => [r.stop_id, r.project_id, r.stop_date || null, r.time || null, r.city || null, r.accommodation || null, r.restaurants || null, r.notes || null, r.location_type || null, r.created_at || new Date().toISOString()]);

        stats.trip_expenses = await upsert(body.trip_expenses,
          `INSERT OR REPLACE INTO TripExpenses (trip_expense_id, project_id, expense_date, member_id, amount, category, note, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          (r) => [r.trip_expense_id, r.project_id, r.expense_date, r.member_id || null, r.amount, r.category || null, r.note || null, r.created_at || new Date().toISOString()]);

        // สิทธิ์เข้าถึงบริษัท (ต้องกู้คืนด้วย ไม่งั้นสมาชิกจะไม่เห็นข้อมูลหลัง replace)
        stats.user_permissions = await upsert(body.user_permissions,
          `INSERT OR IGNORE INTO UserPermissions (user_id, entity_id) VALUES (?,?)`,
          (r) => [r.user_id, r.entity_id]);

        return new Response(JSON.stringify({ success: true, stats }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 15.1 Delete Member (Admin only) — ลบสมาชิกออกจากครอบครัว
      if (url.pathname === '/api/users/delete' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const me = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!me || me.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ลบสมาชิกได้' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { user_id: target } = await request.json();
        if (!target) return new Response(JSON.stringify({ error: 'กรุณาระบุสมาชิกที่ต้องการลบ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (target === userId) return new Response(JSON.stringify({ error: 'ลบตัวเองไม่ได้' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const victim = await env.DB.prepare(`SELECT role FROM Users WHERE user_id = ? AND family_id = ?`).bind(target, me.family_id).first();
        if (!victim) return new Response(JSON.stringify({ error: 'ไม่พบสมาชิกนี้ในครอบครัว' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (victim.role === 'admin') {
          const admins = await env.DB.prepare(`SELECT COUNT(*) AS n FROM Users WHERE family_id = ? AND role = 'admin'`).bind(me.family_id).first();
          if ((admins?.n || 0) <= 1) {
            return new Response(JSON.stringify({ error: 'ลบไม่ได้ — ต้องมี Admin อย่างน้อย 1 คนในครอบครัว' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
        // แยก Company ของสมาชิกคนนี้เป็น 2 กลุ่ม:
        //   sole   = ถือคนเดียว → ลบข้อมูลทั้งหมด (ธุรกรรม/บัญชี/บริษัท) = "ข้อมูลของ user นี้"
        //   shared = ถือร่วมกับคนอื่น → เก็บไว้ แค่ถอนสิทธิ์ของ user นี้ = "ข้อมูลที่ใช้ร่วมกัน"
        const ownRows = await env.DB.prepare(
          `SELECT e.entity_id, e.name,
                  (SELECT COUNT(*) FROM UserPermissions up2 WHERE up2.entity_id = e.entity_id) AS owner_count
             FROM Entities e
             JOIN UserPermissions up ON up.entity_id = e.entity_id AND up.user_id = ?
            WHERE e.family_id = ?`
        ).bind(target, me.family_id).all();
        const soleEntities   = ownRows.results.filter(r => (r.owner_count || 0) <= 1);
        const sharedEntities = ownRows.results.filter(r => (r.owner_count || 0) > 1);
        const soleIds = soleEntities.map(r => r.entity_id);

        const report = { deleted_companies: soleEntities.map(r => r.name), kept_shared_companies: sharedEntities.map(r => r.name) };

        // 1) ลบข้อมูลของบริษัทที่ถือคนเดียว (child-first)
        if (soleIds.length > 0) {
          const ph = soleIds.map(() => '?').join(',');
          const runSafe = async (sql, binds) => { try { await env.DB.prepare(sql).bind(...binds).run(); } catch (e) { /* ข้ามตารางที่ไม่มี */ } };
          await runSafe(`DELETE FROM Settlements WHERE parent_detail_id IN (SELECT d.detail_id FROM TransactionDetails d JOIN Transactions t ON d.transaction_id=t.transaction_id JOIN Accounts a ON t.account_id=a.account_id WHERE a.entity_id IN (${ph}))`, soleIds);
          await runSafe(`DELETE FROM TransactionDetails WHERE transaction_id IN (SELECT t.transaction_id FROM Transactions t JOIN Accounts a ON t.account_id=a.account_id WHERE a.entity_id IN (${ph}))`, soleIds);
          await runSafe(`DELETE FROM Transactions WHERE account_id IN (SELECT account_id FROM Accounts WHERE entity_id IN (${ph}))`, soleIds);
          // ตัดการอ้างอิงจากตารางอื่นก่อนลบ Entities (กัน FK)
          await runSafe(`UPDATE TransactionDetails SET entity_id = NULL WHERE entity_id IN (${ph})`, soleIds);
          await runSafe(`UPDATE Captions   SET default_entity_id = NULL WHERE default_entity_id IN (${ph})`, soleIds);
          await runSafe(`UPDATE Categories SET default_entity_id = NULL WHERE default_entity_id IN (${ph})`, soleIds);
          await runSafe(`DELETE FROM PlannedExpenses WHERE entity_id IN (${ph})`, soleIds);
          await runSafe(`DELETE FROM CategoryBudgets WHERE entity_id IN (${ph})`, soleIds);
          await runSafe(`DELETE FROM Accounts WHERE entity_id IN (${ph})`, soleIds);
          await runSafe(`DELETE FROM UserPermissions WHERE entity_id IN (${ph})`, soleIds);
          await runSafe(`DELETE FROM Entities WHERE entity_id IN (${ph})`, soleIds);
        }

        // 2) บริษัทที่ถือร่วม: โอนธุรกรรมที่ user นี้บันทึกไว้ให้ Admin (คงประวัติ), แล้วถอนสิทธิ์ + ลบ user
        await env.DB.batch([
          env.DB.prepare(`UPDATE Transactions SET created_by_user_id = ? WHERE created_by_user_id = ?`).bind(userId, target),
          env.DB.prepare(`DELETE FROM UserPermissions WHERE user_id = ?`).bind(target),
          env.DB.prepare(`DELETE FROM Users WHERE user_id = ?`).bind(target)
        ]);
        return new Response(JSON.stringify({ success: true, reassigned_to: userId, report }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 15.2 Reset data (Admin only) — ล้างธุรกรรม หรือ ล้างทั้งหมด
      //   scope = 'transactions' → ลบเฉพาะ Transactions/Details/Settlements (เก็บ master data)
      //   scope = 'all'          → ลบทุกอย่างของครอบครัว ยกเว้น Users + Families
      if (url.pathname === '/api/reset' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const me = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!me || me.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ล้างข้อมูลได้' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { scope, confirm } = await request.json();
        if (confirm !== 'RESET') {
          return new Response(JSON.stringify({ error: 'ต้องยืนยันด้วยรหัส RESET' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = me.family_id;
        const txFam = `account_id IN (SELECT a.account_id FROM Accounts a JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`;

        // ลำดับ child-first เพื่อไม่ให้ FK พัง — ทุกคำสั่ง scope ด้วย family_id
        const txSteps = [
          [`DELETE FROM Settlements WHERE parent_detail_id IN (SELECT d.detail_id FROM TransactionDetails d JOIN Transactions t ON d.transaction_id=t.transaction_id JOIN Accounts a ON t.account_id=a.account_id JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`, fid],
          [`DELETE FROM TransactionDetails WHERE transaction_id IN (SELECT t.transaction_id FROM Transactions t JOIN Accounts a ON t.account_id=a.account_id JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?)`, fid],
          [`DELETE FROM Transactions WHERE ${txFam}`, fid],
        ];
        const masterSteps = [
          [`DELETE FROM TripDocuments WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, fid],
          [`DELETE FROM TripBudgets   WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, fid],
          [`DELETE FROM TripStops     WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, fid],
          [`DELETE FROM TripExpenses  WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, fid],
          [`DELETE FROM TripWallets   WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, fid],
          [`DELETE FROM PlannedExpenses WHERE family_id=?`, fid],
          [`DELETE FROM CategoryBudgets WHERE family_id=?`, fid],
          [`DELETE FROM Debts     WHERE family_id=?`, fid],
          [`DELETE FROM Accounts  WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id=?)`, fid],
          [`DELETE FROM Categories WHERE family_id=?`, fid],
          [`DELETE FROM Captions   WHERE family_id=?`, fid],
          [`DELETE FROM Contacts   WHERE family_id=?`, fid],
          [`DELETE FROM Projects   WHERE family_id=?`, fid],
          [`DELETE FROM UserPermissions WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id=?)`, fid],
          [`DELETE FROM Entities   WHERE family_id=?`, fid],
        ];
        const steps = scope === 'all' ? [...txSteps, ...masterSteps] : txSteps;

        // รันทีละคำสั่ง + ข้าม error กรณีตารางไม่มี (เช่น TripWallets)
        let done = 0; const skipped = [];
        for (const [sql, arg] of steps) {
          try { await env.DB.prepare(sql).bind(arg).run(); done++; }
          catch (e) { skipped.push(sql.split(' ')[2] + ': ' + e.message); }
        }
        return new Response(JSON.stringify({ success: true, scope, steps_done: done, skipped }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 13.5. Settings Delete Endpoint
      if (url.pathname === '/api/settings/delete' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const userCheck = await env.DB.prepare(`SELECT role FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck || userCheck.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบข้อมูลหลักได้' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await request.json();
        const { type, id } = body;

        if (!type || !id) {
          return new Response(JSON.stringify({ error: 'กรุณาระบุประเภทและรหัสข้อมูลที่ต้องการลบ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const statements = [];

        if (type === 'project') {
          statements.push(env.DB.prepare(`UPDATE TransactionDetails SET project_id = NULL WHERE project_id = ?`).bind(id));
          statements.push(env.DB.prepare(`DELETE FROM Projects WHERE project_id = ?`).bind(id));
        } else if (type === 'entity') {
          const countAccounts = await env.DB.prepare(`SELECT COUNT(*) as count FROM Accounts WHERE entity_id = ?`).bind(id).first();
          if (countAccounts && countAccounts.count > 0) {
            return new Response(JSON.stringify({ error: 'ไม่สามารถลบ Owner นี้ได้ เนื่องจากมีบัญชีการเงินเชื่อมโยงอยู่' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          statements.push(env.DB.prepare(`UPDATE TransactionDetails SET entity_id = NULL WHERE entity_id = ?`).bind(id));
          statements.push(env.DB.prepare(`DELETE FROM UserPermissions WHERE entity_id = ?`).bind(id));
          statements.push(env.DB.prepare(`DELETE FROM Entities WHERE entity_id = ?`).bind(id));
        } else if (type === 'contact') {
          statements.push(env.DB.prepare(`UPDATE TransactionDetails SET contact_id = NULL WHERE contact_id = ?`).bind(id));
          statements.push(env.DB.prepare(`DELETE FROM Contacts WHERE contact_id = ?`).bind(id));
        } else if (type === 'category') {
          const countDetails = await env.DB.prepare(`SELECT COUNT(*) as count FROM TransactionDetails WHERE category_id = ?`).bind(id).first();
          if (countDetails && countDetails.count > 0) {
            return new Response(JSON.stringify({ error: 'ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากมีการบันทึกธุรกรรมโดยใช้หมวดหมู่นี้แล้ว' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          statements.push(env.DB.prepare(`DELETE FROM Categories WHERE category_id = ?`).bind(id));
        } else if (type === 'account') {
          const countTxs = await env.DB.prepare(`SELECT COUNT(*) as count FROM Transactions WHERE account_id = ?`).bind(id).first();
          if (countTxs && countTxs.count > 0) {
            return new Response(JSON.stringify({ error: 'ไม่สามารถลบบัญชีนี้ได้ เนื่องจากมีการทำธุรกรรมไปแล้ว' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          statements.push(env.DB.prepare(`DELETE FROM Accounts WHERE account_id = ?`).bind(id));
        } else if (type === 'caption') {
          const countCats = await env.DB.prepare(`SELECT COUNT(*) as count FROM Categories WHERE caption_id = ?`).bind(id).first();
          if (countCats && countCats.count > 0) {
            return new Response(JSON.stringify({ error: 'ไม่สามารถลบประเภทหลักนี้ได้ เนื่องจากมีประเภทย่อยเชื่อมโยงอยู่' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          statements.push(env.DB.prepare(`DELETE FROM Captions WHERE type_id = ?`).bind(id));
        } else {
          return new Response(JSON.stringify({ error: 'ประเภทข้อมูลไม่ถูกต้อง' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        try {
          await env.DB.batch(statements);
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (err) {
          return new Response(JSON.stringify({ error: `ล้มเหลว: ${err.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // 14. Users Management
      if (url.pathname === '/api/users') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (request.method === 'GET') {
          const users = await env.DB.prepare(`
            SELECT user_id, family_id, name, email, line_user_id, role, created_at 
            FROM Users 
            WHERE family_id = ?
            ORDER BY name
          `).bind(userCheck.family_id).all();

          const perms = await env.DB.prepare(`
            SELECT up.user_id, up.entity_id 
            FROM UserPermissions up
            JOIN Users u ON up.user_id = u.user_id
            WHERE u.family_id = ?
          `).bind(userCheck.family_id).all();

          const result = users.results.map(u => {
            u.allowed_entities = perms.results
              .filter(p => p.user_id === u.user_id)
              .map(p => p.entity_id);
            return u;
          });

          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (request.method === 'POST') {
          if (userCheck.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'สิทธิ์ไม่เพียงพอ (เฉพาะผู้ดูแลระบบ)' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          const body = await request.json();
          const { user_id, old_user_id, name, email, password, role, line_user_id, allowed_entities } = body;
          
          if (!user_id || !name || !email || !password) {
            return new Response(JSON.stringify({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          const statements = [];

          if (old_user_id && old_user_id !== user_id) {
            // Check duplicate for new user_id
            const dup = await env.DB.prepare(`SELECT user_id FROM Users WHERE user_id = ?`).bind(user_id).first();
            if (dup) {
              return new Response(JSON.stringify({ error: `รหัส User ID "${user_id}" ซ้ำในระบบ กรุณาใช้รหัสอื่น` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            // Rename Old User email and line_user_id to satisfy unique constraints during batch
            statements.push(env.DB.prepare(`
              UPDATE Users 
              SET email = email || '_old', line_user_id = NULL 
              WHERE user_id = ?
            `).bind(old_user_id));

            // Insert new user row first (so new user_id exists for foreign key references)
            statements.push(env.DB.prepare(`
              INSERT INTO Users (user_id, family_id, name, email, password, role, line_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(user_id, userCheck.family_id, name, email, password, role || 'member', line_user_id || null));

            // Update in permissions & transactions
            statements.push(env.DB.prepare(`UPDATE UserPermissions SET user_id = ? WHERE user_id = ?`).bind(user_id, old_user_id));
            statements.push(env.DB.prepare(`UPDATE Transactions SET created_by_user_id = ? WHERE created_by_user_id = ?`).bind(user_id, old_user_id));
            
            // Delete old user row
            statements.push(env.DB.prepare(`DELETE FROM Users WHERE user_id = ?`).bind(old_user_id));
          } else {
            // Insert or replace / update
            statements.push(env.DB.prepare(`
              INSERT OR REPLACE INTO Users (user_id, family_id, name, email, password, role, line_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(user_id, userCheck.family_id, name, email, password, role || 'member', line_user_id || null));
          }

          // Clear permissions for this user (old or new ID)
          statements.push(env.DB.prepare(`DELETE FROM UserPermissions WHERE user_id = ?`).bind(user_id));

          if (allowed_entities && allowed_entities.length) {
            for (const entId of allowed_entities) {
              statements.push(
                env.DB.prepare(`INSERT INTO UserPermissions (user_id, entity_id) VALUES (?, ?)`).bind(user_id, entId)
              );
            }
          }

          await env.DB.batch(statements);
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // ==========================================
      // TRAVEL EXPENSE TRACKER (TRIPS) ENDPOINTS
      // ==========================================

      if (url.pathname === '/api/trips' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        
        const { project_id } = await request.json();
        await env.DB.prepare(`DELETE FROM Projects WHERE project_id=? AND family_id=?`).bind(project_id, userCheck.family_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/trips/theme' && request.method === 'PUT') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

        const { trip_expense_id } = await request.json();
        await env.DB.prepare(`UPDATE TripExpenses SET approved=1 WHERE trip_expense_id=?`).bind(trip_expense_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // CRUD for TripWallets
      if (url.pathname === '/api/wallets' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const projectId = url.searchParams.get('projectId');
        if (!projectId) return new Response('Missing projectId', { status: 400, headers: corsHeaders });
        if (!await getAccessibleTrip(env, userId, projectId)) return new Response(JSON.stringify({ error: 'ไม่พบทริป หรือไม่มีสิทธิ์เข้าถึง' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const out = await computeTripWallets(env, projectId);
        return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/wallets' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
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

      // 20. Stats: date range of available transaction data
      if (url.pathname === '/api/stats/date-range' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = userCheck.family_id;
        const result = await env.DB.prepare(`
          SELECT MIN(t.date) AS min_date, MAX(t.date) AS max_date, COUNT(*) AS total_count
          FROM Transactions t
          JOIN Accounts a ON t.account_id = a.account_id
          JOIN Entities e ON a.entity_id = e.entity_id
          WHERE e.family_id = ?
        `).bind(fid).first();
        return new Response(JSON.stringify({
          min_date: result.min_date || null,
          max_date: result.max_date || null,
          total_count: result.total_count || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── BULK IMPORT ──────────────────────────────────────────────────────
      // POST /api/bulk-import
      // Body: { transactions: [...], status: 'PENDING_REVIEW' | 'CONFIRMED' }
      // Each transaction: { transaction_id, account_id, date, total_amount, statement_desc, details: [...] }
      // Returns: { saved, skipped, errors: [] }
      // Uses INSERT OR REPLACE — safe to re-import same data (idempotent)
      if (url.pathname === '/api/bulk-import' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await request.json();
        const { transactions, status: importStatus } = body;

        if (!Array.isArray(transactions) || transactions.length === 0) {
          return new Response(JSON.stringify({ error: 'transactions array is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const txStatus = (importStatus === 'CONFIRMED') ? 'CONFIRMED' : 'PENDING_REVIEW';
        const savedIds = [];
        const errorList = [];
        const stmts = [];

        for (const tx of transactions) {
          const { transaction_id, account_id, date, total_amount, statement_desc, details } = tx;

          if (!account_id || !date || total_amount === undefined || !Array.isArray(details) || details.length === 0) {
            errorList.push({ transaction_id: transaction_id || '?', error: 'Missing required fields (account_id/date/total_amount/details)' });
            continue;
          }

          const txId = transaction_id || ('BLK-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));

          stmts.push(
            env.DB.prepare(`
              INSERT OR REPLACE INTO Transactions
                (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'WEB_GRID', NULL, ?)
            `).bind(
              txId,
              account_id,
              tx.ref_code || null,
              date,
              tx.time || null,
              total_amount,
              statement_desc || tx.note || null,
              txStatus,
              userId
            )
          );

          // Delete old details then re-insert (clean replace)
          stmts.push(env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(txId));

          for (const d of details) {
            const detailId = d.detail_id || ('DT-' + Math.random().toString(36).substring(2, 11));
            const amt = Number(d.amount || 0);
            stmts.push(
              env.DB.prepare(`
                INSERT INTO TransactionDetails
                  (detail_id, transaction_id, amount, fee, wht, category_id, contact_id, project_id, note, entity_id, type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                detailId,
                txId,
                amt,
                Number(d.fee || 0),
                Number(d.wht || 0),
                d.category_id || 'Cat_Uncategorized',
                d.contact_id || null,
                d.project_id || null,
                d.note || null,
                d.entity_id || null,
                d.type || (amt >= 0 ? 'INCOME' : 'EXPENSE')
              )
            );
          }

          savedIds.push(txId);
        }

        // D1 batch limit ~100 statements — chunk to avoid limits
        const CHUNK = 100;
        for (let i = 0; i < stmts.length; i += CHUNK) {
          await env.DB.batch(stmts.slice(i, i + CHUNK));
        }

        return new Response(JSON.stringify({
          success: true,
          saved:   savedIds.length,
          skipped: transactions.length - savedIds.length - errorList.length,
          errors:  errorList
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // ── END BULK IMPORT ──────────────────────────────────────────────────


      // ══════════════════════════════════════════════════════════════════
      // BUDGETS — /api/budgets  (CategoryBudgets CRUD)
      // ══════════════════════════════════════════════════════════════════
      if (url.pathname === '/api/budgets' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const periodType = url.searchParams.get('period_type') || 'MONTHLY';
        const period      = url.searchParams.get('period') || new Date().toISOString().substring(0, 7);
        const rows = await env.DB.prepare(
          `SELECT b.*, c.name AS category_name, e.name AS entity_name
             FROM CategoryBudgets b
             LEFT JOIN Categories c ON b.category_id = c.category_id
             LEFT JOIN Entities   e ON b.entity_id   = e.entity_id
            WHERE b.family_id = ? AND b.period_type = ? AND b.period = ?
            ORDER BY c.name`
        ).bind(u.family_id, periodType, period).all().catch(() => ({ results: [] }));
        return new Response(JSON.stringify({ budgets: rows.results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/budgets' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const body = await request.json();
        const { category_id, entity_id, period_type, period, amount, note } = body;
        if (!category_id || !period_type || !period) {
          return new Response(JSON.stringify({ error: 'category_id, period_type, period จำเป็นต้องระบุ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // upsert: หมวดเดียว + entity เดียว + รอบเดียว → แก้ยอดเดิมแทน
        const existing = await env.DB.prepare(
          `SELECT budget_id FROM CategoryBudgets
            WHERE family_id = ? AND category_id = ? AND IFNULL(entity_id,'-') = IFNULL(?, '-')
              AND period_type = ? AND period = ?`
        ).bind(u.family_id, category_id, entity_id || null, period_type, period).first();

        let budgetId;
        if (existing) {
          budgetId = existing.budget_id;
          await env.DB.prepare(
            `UPDATE CategoryBudgets SET amount = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE budget_id = ?`
          ).bind(amount || 0, note || null, budgetId).run();
        } else {
          budgetId = crypto.randomUUID();
          await env.DB.prepare(
            `INSERT INTO CategoryBudgets (budget_id, family_id, category_id, entity_id, period_type, period, amount, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(budgetId, u.family_id, category_id, entity_id || null, period_type, period, amount || 0, note || null).run();
        }
        return new Response(JSON.stringify({ success: true, budget_id: budgetId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.startsWith('/api/budgets/') && request.method === 'DELETE') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const budgetId = url.pathname.split('/').pop();
        await env.DB.prepare(`DELETE FROM CategoryBudgets WHERE budget_id = ? AND family_id = ?`).bind(budgetId, u.family_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ══════════════════════════════════════════════════════════════════
      // PLANNED EXPENSES — /api/planned-expenses  (แผนรายจ่ายล่วงหน้า)
      // ══════════════════════════════════════════════════════════════════
      if (url.pathname === '/api/planned-expenses' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const status = url.searchParams.get('status'); // OPEN | DONE | CANCELLED | (blank = all)
        let sql = `SELECT p.*, e.name AS entity_name, c.name AS category_name, co.name AS contact_name
                     FROM PlannedExpenses p
                     LEFT JOIN Entities   e  ON p.entity_id   = e.entity_id
                     LEFT JOIN Categories c  ON p.category_id = c.category_id
                     LEFT JOIN Contacts   co ON p.contact_id  = co.contact_id
                    WHERE p.family_id = ?`;
        const args = [u.family_id];
        if (status) { sql += ` AND p.status = ?`; args.push(status); }
        sql += ` ORDER BY p.due_date`;
        const rows = await env.DB.prepare(sql).bind(...args).all().catch(() => ({ results: [] }));
        return new Response(JSON.stringify({ plans: rows.results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/planned-expenses' && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const body = await request.json();
        const { entity_id, category_id, contact_id, title, icon, amount, due_date, recurrence, recurrence_end, note } = body;
        if (!title || !amount || !due_date) {
          return new Response(JSON.stringify({ error: 'title, amount, due_date จำเป็นต้องระบุ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const planId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO PlannedExpenses
             (plan_id, family_id, entity_id, category_id, contact_id, title, icon, amount, due_date, recurrence, recurrence_end, note, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          planId, u.family_id, entity_id || null, category_id || null, contact_id || null,
          title, icon || null, amount, due_date, recurrence || 'NONE', recurrence_end || null, note || null, userId
        ).run();
        return new Response(JSON.stringify({ success: true, plan_id: planId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.startsWith('/api/planned-expenses/') && url.pathname.endsWith('/done') && request.method === 'POST') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const planId = url.pathname.split('/')[3];
        const body = await request.json().catch(() => ({}));
        await env.DB.prepare(
          `UPDATE PlannedExpenses SET status = 'DONE', done_date = ?, linked_transaction_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE plan_id = ? AND family_id = ?`
        ).bind(body.done_date || new Date().toISOString().substring(0, 10), body.linked_transaction_id || null, planId, u.family_id).run();

        // ถ้าเป็นแผนที่เกิดซ้ำ (recurrence != NONE) → สร้างงวดถัดไปอัตโนมัติ
        const plan = await env.DB.prepare(`SELECT * FROM PlannedExpenses WHERE plan_id = ?`).bind(planId).first();
        if (plan && plan.recurrence && plan.recurrence !== 'NONE') {
          const d = new Date(plan.due_date + 'T00:00:00');
          if (plan.recurrence === 'MONTHLY')   d.setMonth(d.getMonth() + 1);
          if (plan.recurrence === 'QUARTERLY') d.setMonth(d.getMonth() + 3);
          if (plan.recurrence === 'YEARLY')    d.setFullYear(d.getFullYear() + 1);
          const nextDate = d.toISOString().substring(0, 10);
          const notExpired = !plan.recurrence_end || nextDate <= plan.recurrence_end;
          if (notExpired) {
            await env.DB.prepare(
              `INSERT INTO PlannedExpenses
                 (plan_id, family_id, entity_id, category_id, contact_id, title, icon, amount, due_date, recurrence, recurrence_end, note, created_by_user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), plan.family_id, plan.entity_id, plan.category_id, plan.contact_id,
              plan.title, plan.icon, plan.amount, nextDate, plan.recurrence, plan.recurrence_end, plan.note, plan.created_by_user_id
            ).run();
          }
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.startsWith('/api/planned-expenses/') && request.method === 'PUT') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const planId = url.pathname.split('/').pop();
        const body = await request.json();
        const { entity_id, category_id, contact_id, title, icon, amount, due_date, recurrence, recurrence_end, note } = body;
        await env.DB.prepare(
          `UPDATE PlannedExpenses SET
             entity_id = ?, category_id = ?, contact_id = ?, title = ?, icon = ?,
             amount = ?, due_date = ?, recurrence = ?, recurrence_end = ?, note = ?, updated_at = CURRENT_TIMESTAMP
           WHERE plan_id = ? AND family_id = ?`
        ).bind(
          entity_id || null, category_id || null, contact_id || null, title, icon || null,
          amount, due_date, recurrence || 'NONE', recurrence_end || null, note || null, planId, u.family_id
        ).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname.startsWith('/api/planned-expenses/') && request.method === 'DELETE') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const planId = url.pathname.split('/').pop();
        await env.DB.prepare(`DELETE FROM PlannedExpenses WHERE plan_id = ? AND family_id = ?`).bind(planId, u.family_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ══════════════════════════════════════════════════════════════════
      // WHT — /api/wht/detail?month=YYYY-MM&direction=received|withheld
      // รายละเอียดรายเดือน สำหรับหน้า drill-down + export
      // ══════════════════════════════════════════════════════════════════
      if (url.pathname === '/api/wht/detail' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        const u = await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const permRows = await env.DB.prepare(
          `SELECT e.entity_id FROM Entities e JOIN UserPermissions up ON e.entity_id = up.entity_id WHERE up.user_id = ?`
        ).bind(userId).all();
        let allowed = permRows.results.map(r => r.entity_id);
        if (allowed.length === 0) allowed = ['__none__'];
        const ph = allowed.map(() => '?').join(',');

        const month     = url.searchParams.get('month') || new Date().toISOString().substring(0, 7);
        const direction = url.searchParams.get('direction') || 'received'; // received = amount>=0, withheld = amount<0

        const rows = await env.DB.prepare(
          `SELECT t.date, d.detail_id, d.amount, d.wht, ABS(d.amount) AS base,
                  IFNULL(d.note, c.name) AS title,
                  d.entity_id, e.name AS company,
                  co.name AS customer,
                  t.created_by_user_id AS user_id, ux.name AS user_name
             FROM TransactionDetails d
             JOIN Transactions t ON d.transaction_id = t.transaction_id
             JOIN Accounts a     ON t.account_id = a.account_id
             LEFT JOIN Categories c ON d.category_id = c.category_id
             LEFT JOIN Entities  e  ON d.entity_id  = e.entity_id
             LEFT JOIN Contacts  co ON d.contact_id = co.contact_id
             LEFT JOIN Users     ux ON t.created_by_user_id = ux.user_id
            WHERE a.entity_id IN (${ph})
              AND t.status = 'CONFIRMED'
              AND IFNULL(d.wht,0) > 0
              AND substr(t.date,1,7) = ?
              AND ${direction === 'withheld' ? 'd.amount < 0' : 'd.amount >= 0'}
            ORDER BY t.date DESC`
        ).bind(...allowed, month).all();

        const list = rows.results.map(r => ({
          date: (r.date || '').substring(0, 10),
          title: r.title || '-',
          company: r.company || '-',
          customer: r.customer || '-',
          base: r.base, wht: r.wht,
          entity_id: r.entity_id,
          user_id: r.user_id, user_name: r.user_name || '-'
        }));
        return new Response(JSON.stringify({ month, direction, rows: list }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ══════════════════════════════════════════════════════════════════
      // DASHBOARD v2 — /api/dashboard/summary?month=YYYY-MM&entity=<id|ALL>
      // คืนข้อมูลทุกการ์ดในคำขอเดียว
      // ══════════════════════════════════════════════════════════════════
      if (url.pathname === '/api/dashboard/summary' && request.method === 'GET') {
        const userId = decodeURIComponent(request.headers.get('x-user-id') || '');
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const u = await env.DB.prepare(`SELECT family_id, role FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const fid    = u.family_id;
        const month  = url.searchParams.get('month') || new Date().toISOString().substring(0, 7); // YYYY-MM
        const year   = month.substring(0, 4);
        // ตัวกรองหลัก = Member (สมาชิก) ไม่ใช่ Company
        //   Member ↔ Company เป็น many-to-many ผ่าน UserPermissions
        //   1 สมาชิกเป็นเจ้าของหลายบริษัท หรือหลายสมาชิกร่วมกันเป็นเจ้าของบริษัทเดียวได้
        const member = url.searchParams.get('member') || url.searchParams.get('entity') || 'ALL';

        // Entity ที่ผู้ดูปัจจุบันมีสิทธิ์เห็น (ขอบเขตความปลอดภัย)
        const permRows = await env.DB.prepare(
          `SELECT e.entity_id, e.name FROM Entities e
             JOIN UserPermissions up ON e.entity_id = up.entity_id
            WHERE up.user_id = ? ORDER BY e.name`
        ).bind(userId).all();
        let allowed = permRows.results.map(r => r.entity_id);
        if (allowed.length === 0) allowed = ['__none__'];

        // สมาชิกในครอบครัว + บริษัทที่แต่ละคนเป็นเจ้าของ (ใช้ทำปุ่มกรองด้านบน)
        const memberRows = await env.DB.prepare(
          `SELECT u2.user_id, u2.name,
                  (SELECT GROUP_CONCAT(up.entity_id) FROM UserPermissions up WHERE up.user_id = u2.user_id) AS entity_ids
             FROM Users u2 WHERE u2.family_id = ? ORDER BY u2.name`
        ).bind(fid).all();
        const members = memberRows.results.map(m => ({
          user_id: m.user_id, name: m.name,
          entity_ids: (m.entity_ids || '').split(',').filter(Boolean)
        }));

        // scope = บริษัทของสมาชิกที่เลือก ∩ สิทธิ์ผู้ดู · ALL = ทุกบริษัทที่ผู้ดูเห็น
        let scope = allowed;
        if (member !== 'ALL') {
          const mem = members.find(m => m.user_id === member);
          const memEntities = mem ? mem.entity_ids : [];
          scope = memEntities.filter(e => allowed.includes(e));
          if (scope.length === 0) scope = ['__none__'];
        }
        const ph = scope.map(() => '?').join(',');

        // ── 1) บัญชี: แยก BANK/CASH กับ CREDIT ──
        // balance คำนวณสดจาก SUM(Transactions.total_amount) เหมือน /api/accounts
        // (คอลัมน์ Accounts.balance ไม่ได้ถูกอัปเดตที่ไหนเลย ใช้ไม่ได้)
        const accounts = await env.DB.prepare(
          `SELECT a.account_id, a.name, a.bank_name,
                  ROUND(COALESCE((SELECT SUM(t.total_amount) FROM Transactions t
                                   WHERE t.account_id = a.account_id AND t.status = 'CONFIRMED'), 0), 2) AS balance,
                  IFNULL(a.account_type,'BANK') AS account_type,
                  IFNULL(a.credit_limit,0)      AS credit_limit,
                  a.statement_day, a.due_day,
                  a.entity_id, e.name AS entity_name
             FROM Accounts a
             LEFT JOIN Entities e ON a.entity_id = e.entity_id
            WHERE a.entity_id IN (${ph})`
        ).bind(...scope).all();

        // ── 2) รายการในเดือนที่เลือก (แยกตาม behavior) ──
        // entity_id/entity_name = Company (Owner) ผู้รับรายได้/ค่าใช้จ่าย
        // user_id/user_name     = สมาชิกที่บันทึกรายการ (Transactions.created_by_user_id) — ใช้แสดง "ใครทำรายการ"
        const detailRows = await env.DB.prepare(
          `SELECT t.transaction_id, t.date, t.statement_desc,
                  d.detail_id, d.amount, d.fee, d.wht, d.note,
                  d.category_id, c.name AS category_name,
                  cp.behavior, cp.sub_behavior,
                  d.entity_id, e.name AS entity_name,
                  d.contact_id, co.name AS contact_name,
                  t.created_by_user_id AS user_id, ux.name AS user_name
             FROM TransactionDetails d
             JOIN Transactions t  ON d.transaction_id = t.transaction_id
             JOIN Accounts a      ON t.account_id = a.account_id
             LEFT JOIN Categories c  ON d.category_id = c.category_id
             LEFT JOIN Captions  cp  ON c.caption_id  = cp.type_id
             LEFT JOIN Entities  e   ON d.entity_id   = e.entity_id
             LEFT JOIN Contacts  co  ON d.contact_id  = co.contact_id
             LEFT JOIN Users     ux  ON t.created_by_user_id = ux.user_id
            WHERE a.entity_id IN (${ph})
              AND t.status = 'CONFIRMED'
              AND substr(t.date,1,7) = ?`
        ).bind(...scope, month).all();

        const income = [], expense = [], investment = [];
        for (const r of detailRows.results) {
          const isInv = r.sub_behavior === 'INVESTMENT';
          const row = {
            detail_id: r.detail_id, date: r.date, amount: r.amount,
            title: r.note || r.category_name || r.statement_desc || '-',
            category_id: r.category_id, category_name: r.category_name,
            entity_id: r.entity_id, entity_name: r.entity_name,
            contact_name: r.contact_name,
            user_id: r.user_id, user_name: r.user_name || '-'
          };
          if (isInv) investment.push(row);
          else if (r.behavior === 'REVENUE' || r.behavior === 'ASSET') income.push(row);
          else if (r.behavior === 'EXPENSE' || r.behavior === 'LIABILITY') expense.push(row);
        }

        // ── 3) เงินไปไหน: ค่าใช้จ่ายจริงต่อหมวด เทียบงบ (รวมทั้งครอบครัวเสมอ) ──
        const spentRows = await env.DB.prepare(
          `SELECT d.category_id, c.name AS category_name,
                  SUM(ABS(d.amount)) AS spent
             FROM TransactionDetails d
             JOIN Transactions t ON d.transaction_id = t.transaction_id
             JOIN Categories c   ON d.category_id = c.category_id
             JOIN Captions  cp   ON c.caption_id  = cp.type_id
            WHERE t.status = 'CONFIRMED'
              AND substr(t.date,1,7) = ?
              AND cp.behavior IN ('EXPENSE','LIABILITY')
              AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'
              AND c.family_id = ?
            GROUP BY d.category_id`
        ).bind(month, fid).all();

        const budgetRows = await env.DB.prepare(
          `SELECT category_id, SUM(amount) AS budget
             FROM CategoryBudgets
            WHERE family_id = ?
              AND ((period_type='MONTHLY' AND period = ?) OR (period_type='YEARLY' AND period = ?))
            GROUP BY category_id`
        ).bind(fid, month, year).all().catch(() => ({ results: [] }));

        const budMap = {};
        for (const b of budgetRows.results) budMap[b.category_id] = b.budget;
        const budget = spentRows.results.map(s => ({
          category_id: s.category_id, category_name: s.category_name,
          spent: s.spent, budget: budMap[s.category_id] || 0
        }));
        // หมวดที่ตั้งงบไว้แต่ยังไม่ได้ใช้เงิน
        for (const b of budgetRows.results) {
          if (!spentRows.results.some(s => s.category_id === b.category_id)) {
            budget.push({ category_id: b.category_id, category_name: b.category_id, spent: 0, budget: b.budget });
          }
        }
        budget.sort((a, z) => z.spent - a.spent);

        // ── 4) ลูกหนี้ / เจ้าหนี้ (ไม่รวมเงินลงทุน) ──
        const arap = await env.DB.prepare(
          `SELECT cp.behavior,
                  IFNULL(co.name, c.name) AS party,
                  d.entity_id, e.name AS entity_name,
                  SUM(d.amount - IFNULL((SELECT SUM(s.settled_amount) FROM Settlements s
                                          WHERE s.parent_detail_id = d.detail_id), 0)) AS remaining,
                  COUNT(*) AS cnt
             FROM TransactionDetails d
             JOIN Transactions t ON d.transaction_id = t.transaction_id
             JOIN Accounts a     ON t.account_id = a.account_id
             JOIN Categories c   ON d.category_id = c.category_id
             JOIN Captions  cp   ON c.caption_id  = cp.type_id
             LEFT JOIN Contacts co ON d.contact_id = co.contact_id
             LEFT JOIN Entities e  ON d.entity_id  = e.entity_id
            WHERE a.entity_id IN (${ph})
              AND t.status = 'CONFIRMED'
              AND cp.behavior IN ('ASSET','LIABILITY')
              AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'
            GROUP BY cp.behavior, party, d.entity_id
           HAVING ABS(remaining) > 0.01`
        ).bind(...scope).all();

        const ar = [], ap = [];
        for (const r of arap.results) {
          const item = { party: r.party, count: r.cnt, amount: Math.abs(r.remaining),
                         entity_id: r.entity_id, entity_name: r.entity_name };
          (r.behavior === 'ASSET' ? ar : ap).push(item);
        }
        ar.sort((a, z) => z.amount - a.amount);
        ap.sort((a, z) => z.amount - a.amount);

        // ── 5) ภาษีหัก ณ ที่จ่าย — แยกตามทิศทางเงิน ──
        //     amount > 0 = รายรับ → เราถูกหัก
        //     amount < 0 = รายจ่าย → เราหักไว้นำส่ง
        //     company/customer = Company(Owner)/Customer(Contact) ตาม setting
        //     user_id/user_name = สมาชิกที่บันทึกรายการ — ใช้แสดงคอลัมน์ "User"
        const whtRows = await env.DB.prepare(
          `SELECT substr(t.date,1,7) AS mo, t.date,
                  d.wht, ABS(d.amount) AS base, d.amount,
                  IFNULL(d.note, c.name) AS title,
                  d.entity_id, e.name AS company,
                  co.name AS customer,
                  t.created_by_user_id AS user_id, ux.name AS user_name
             FROM TransactionDetails d
             JOIN Transactions t ON d.transaction_id = t.transaction_id
             JOIN Accounts a     ON t.account_id = a.account_id
             LEFT JOIN Categories c ON d.category_id = c.category_id
             LEFT JOIN Entities  e  ON d.entity_id  = e.entity_id
             LEFT JOIN Contacts  co ON d.contact_id = co.contact_id
             LEFT JOIN Users     ux ON t.created_by_user_id = ux.user_id
            WHERE a.entity_id IN (${ph})
              AND t.status = 'CONFIRMED'
              AND IFNULL(d.wht,0) > 0
              AND substr(t.date,1,4) = ?
            ORDER BY t.date DESC`
        ).bind(...scope, year).all();

        const whtIn = [], whtOut = [];
        for (const r of whtRows.results) {
          const row = { mo: r.mo, date: (r.date || '').substring(0, 10), title: r.title || '-',
                        company: r.company || '-', customer: r.customer || '-',
                        base: r.base, wht: r.wht, entity_id: r.entity_id,
                        user_id: r.user_id, user_name: r.user_name || '-' };
          (Number(r.amount) >= 0 ? whtIn : whtOut).push(row);
        }

        // ── 6) แผนรายจ่ายล่วงหน้า ──
        // entity_name = Company ที่วางแผนจ่ายให้ (จากฟอร์ม) · user_name = สมาชิกที่สร้างแผนนี้ (created_by_user_id)
        const planRows = await env.DB.prepare(
          `SELECT p.*, e.name AS entity_name, c.name AS category_name, ux.name AS user_name
             FROM PlannedExpenses p
             LEFT JOIN Entities   e  ON p.entity_id   = e.entity_id
             LEFT JOIN Categories c  ON p.category_id = c.category_id
             LEFT JOIN Users      ux ON p.created_by_user_id = ux.user_id
            WHERE p.family_id = ? AND p.status = 'OPEN'
            ORDER BY p.due_date`
        ).bind(fid).all().catch(() => ({ results: [] }));
        const plans = planRows.results.filter(p => member === 'ALL' || !p.entity_id || scope.includes(p.entity_id));

        return new Response(JSON.stringify({
          month, member,
          members,
          entities: permRows.results,
          accounts: accounts.results,
          income, expense, investment,
          budget, ar, ap,
          wht: { received: whtIn, withheld: whtOut },
          plans
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });


    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }
};

async function runGeminiStatement(pdfBase64, imagesBase64, apiKey) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on Cloudflare Workers.');
  }

  const prompt = `You are an expert financial assistant.
Extract all transaction records and the statement owner's bank account number from the provided bank statement PDF.
The statement may be from Kasikornbank (KBank) or Krungthai Bank (KTB) or other Thai banks.

Identify the following information:
- account_number: The bank account number of this statement (e.g., "123-4-56789-0" or "X-XXXXX-123-4"). If not found, output null.
- transactions: Array of transaction records. For each transaction, identify:
  1. date: The transaction date in format YYYY-MM-DD. Convert year to Christian era (e.g. 2569 or 26 -> 2026).
  2. time: The transaction time in format HH:MM:SS. If time is not provided, use "00:00:00".
  3. type: Either "INCOME" (for deposits/receive/ฝากเงิน) or "EXPENSE" (for withdrawals/transfer/ถอนเงิน/ชำระเงิน/หักบัญชี).
  4. amount: The transaction amount as a positive decimal number.
  5. ref_code: The reference code, transaction ID, if available.
  6. statement_desc: The raw bank description, channel, or statement note (e.g. "TR to 123456789", "เพื่อชำระ Ref X9042").
  7. note: Any additional memo if present, otherwise null.

Output ONLY a valid JSON object matching this schema:
{
  "account_number": "...",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM:SS",
      "type": "INCOME" | "EXPENSE",
      "amount": 123.45,
      "ref_code": "...",
      "statement_desc": "...",
      "note": "..."
    },
    ...
  ]
}
Do not wrap the JSON in markdown code blocks.`;

  let parts = [{ text: prompt }];

  if (pdfBase64) {
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: cleanBase64
      }
    });
  } else if (imagesBase64 && imagesBase64.length > 0) {
    for (const imgBase64 of imagesBase64) {
      const cleanImg = imgBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanImg
        }
      });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const payload = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  };

  let response;
  let attempt = 0;
  const maxRetries = 3;
  let errText = '';

  while (attempt < maxRetries) {
    response = await fetch(url, payload);
    if (response.ok) break;

    errText = await response.text();
    if (response.status === 503 || response.status === 429) {
      attempt++;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        continue;
      }
    }
    break;
  }

  if (!response || !response.ok) {
    throw new Error(`Gemini API error: ${response?.status} - ${errText}`);
  }

  const resData = await response.json();
  const textResult = resData.candidates[0].content.parts[0].text;
  return JSON.parse(textResult.trim());
}

async function runGeminiOCR(imageBase64, apiKey) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on Cloudflare Workers.');
  }

  // We remove the data:image/jpeg;base64, prefix if it exists
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const prompt = `You are an expert OCR parser for Thai bank transfer slips.
Extract the following information from the provided slip image:
1. date: The transaction date in format YYYY-MM-DD. If year is in Buddhist era (e.g. 2568), convert it to Christian era (2025).
2. time: The transaction time in format HH:MM:SS.
3. amount: The transaction amount as a decimal number.
4. fee: The fee as a decimal number (0 if none).
5. sender_name: The name of the sender.
6. receiver_name: The name of the receiver.
7. sender_bank: The bank name of the sender (e.g. KBank, SCB, BAY, KTB, BBL, etc.).
8. receiver_bank: The bank name of the receiver (e.g. KBank, SCB, BAY, KTB, BBL, etc.).
9. ref_code: The reference code or transaction ID.
10. note: Any memo/note/ช่วยจำ written on the slip (null if none).

Output ONLY a valid JSON object matching this schema:
{
  "date": "YYYY-MM-DD",
  "time": "HH:MM:SS",
  "amount": 123.45,
  "fee": 0.0,
  "sender_name": "...",
  "receiver_name": "...",
  "sender_bank": "...",
  "receiver_bank": "...",
  "ref_code": "...",
  "note": "..."
}
Do not wrap the JSON in markdown code blocks.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const payload = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  };

  let response;
  let attempt = 0;
  const maxRetries = 3;
  let errText = '';

  while (attempt < maxRetries) {
    response = await fetch(url, payload);
    if (response.ok) break;

    errText = await response.text();
    if (response.status === 503 || response.status === 429) {
      attempt++;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        continue;
      }
    }
    break;
  }

  if (!response || !response.ok) {
    throw new Error(`Gemini API error: ${response?.status} - ${errText}`);
  }

  const resData = await response.json();
  const textResult = resData.candidates[0].content.parts[0].text;
  return JSON.parse(textResult.trim());
}

// ==========================================
// 💬 LINE BOT WEBHOOK HANDLER
// ==========================================
async function handleLineWebhook(request, env) {
  const body = await request.json();
  const event = body.events[0];
  if (!event) {
    return new Response('OK');
  }

  const replyToken = event.replyToken;
  const lineUserId = event.source.userId;

  // 1. Look up user by line_user_id
  const user = await env.DB.prepare(`SELECT * FROM Users WHERE line_user_id = ?`).bind(lineUserId).first();
  
  if (!user) {
    // Reply explaining how to register this LINE user ID
    const explainText = `❌ ขออภัย ไม่พบการลงทะเบียน LINE User ID นี้ในระบบ\n\nLINE ID ของคุณคือ:\n${lineUserId}\n\nกรุณาใช้ LINE ID นี้ไปเพิ่มในเมนู "สมาชิกครอบครัว" บนหน้าเว็บไซต์ระบบ เพื่อเปิดใช้งานระบบรายงานและอ่านสลิปครับ`;
    await replyLineText(replyToken, explainText, env);
    return new Response('OK');
  }

  // Handle Image Message (Slip upload via LINE)
  if (event.type === 'message' && event.message.type === 'image') {
    const messageId = event.message.id;

    // 1. Fetch image bytes from LINE
    const lineImgUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const lineRes = await fetch(lineImgUrl, {
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (!lineRes.ok) {
      throw new Error(`Failed to fetch image from LINE: ${lineRes.status}`);
    }
    const blob = await lineRes.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to Base64
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Image = btoa(binary);

    // 2. OCR using Gemini
    let ocrResult;
    try {
      ocrResult = await runGeminiOCR(base64Image, env.GEMINI_API_KEY);
    } catch (err) {
      await replyLineText(replyToken, `❌ เกิดข้อผิดพลาดในการอ่านสลิปด้วย AI: ${err.message}`, env);
      return new Response('OK');
    }

    // 3. Match Account based on OCR receiver/sender bank or keywords
    const accounts = await env.DB.prepare(`SELECT * FROM Accounts`).all();
    let matchedAccountId = 'Acc_A_Cash'; // Fallback Default
    let matchedBank = 'Cash';
    
    // Match based on bank keyword search
    for (const acc of accounts.results) {
      if (acc.bank_name && ocrResult.receiver_bank && ocrResult.receiver_bank.toLowerCase().includes(acc.bank_name.toLowerCase())) {
        matchedAccountId = acc.account_id;
        matchedBank = acc.bank_name;
        break;
      }
    }

    // 4. Check Duplicate
    const dupCheck = await env.DB.prepare(`
      SELECT transaction_id FROM Transactions 
      WHERE account_id = ? AND date = ? AND total_amount = ?
    `).bind(matchedAccountId, ocrResult.date, ocrResult.amount).first();

    if (dupCheck) {
      await replyLineText(replyToken, `⚠️ ตรวจพบรายการซ้ำซ้อนในระบบ:\nวันที่: ${ocrResult.date} ${ocrResult.time || ''}\nยอดเงิน: ${ocrResult.amount.toLocaleString()} บาท\n(รายการนี้ไม่ได้รับการบันทึกเพิ่ม)`, env);
      return new Response('OK');
    }

    // 5. Save Transaction as PENDING_REVIEW
    const txId = 'TX-' + Date.now();
    
    // Check if there is a note, save it as transaction detail
    const detailId = 'DT-' + Math.random().toString(36).substring(2, 11);
    const categoryId = ocrResult.amount > 0 ? 'Cat_Account' : 'Cat_Food'; // Simple guesses
    const detailType = ocrResult.amount > 0 ? 'INCOME' : 'EXPENSE';

    const statements = [
      env.DB.prepare(`
        INSERT INTO Transactions (transaction_id, account_id, ref_code, date, total_amount, status, source, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'PENDING_REVIEW', 'LINE_SLIP', ?)
      `).bind(txId, matchedAccountId, ocrResult.ref_code || null, ocrResult.date + ' ' + (ocrResult.time || '00:00:00'), ocrResult.amount, user.user_id),
      
      env.DB.prepare(`
        INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, note, type)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `).bind(detailId, txId, ocrResult.amount, ocrResult.fee || 0, categoryId, ocrResult.note || 'บันทึกสลิปอัตโนมัติ', detailType)
    ];

    await env.DB.batch(statements);

    // 6. Send Flex Message reply to LINE
    const webEditLink = `${env.WEB_APP_URL || 'https://recordrevenue.pages.dev'}?txId=${txId}`;
    await replyLineFlex(replyToken, txId, webEditLink, ocrResult, matchedBank, env);
  }

  // Handle Text Message (Summary requests or Manual Entry)
  if (event.type === 'message' && event.message.type === 'text') {
    const textMsg = event.message.text.trim();
    const lowerText = textMsg.toLowerCase();

    const tzOffset = 7 * 60 * 60 * 1000; // Bangkok time
    const localNow = new Date(Date.now() + tzOffset);
    const todayStr = localNow.toISOString().slice(0, 10);
    const localYesterday = new Date(Date.now() + tzOffset - 24 * 60 * 60 * 1000);
    const yesterdayStr = localYesterday.toISOString().slice(0, 10);

    // 1. Check for Manual Entry format (e.g., "เงินสด + กินข้าว + 50")
    if (textMsg.includes('+')) {
      const parts = textMsg.split('+').map(s => s.trim());
      const accountKeyword = parts[0];
      const amountStr = parts[parts.length - 1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      const note = parts.length > 2 ? parts.slice(1, -1).join(' + ') : (parts.length === 2 ? 'บันทึกผ่าน LINE' : '');
      
      if (isNaN(amount)) {
        await replyLineText(replyToken, `❌ รูปแบบจำนวนเงินไม่ถูกต้อง (ต้องเป็นตัวเลข)\nตัวอย่าง: เงินสด + กินข้าว + 50`, env);
        return new Response('OK');
      }

      try {
        // Match Account
        const accounts = await env.DB.prepare(`
          SELECT a.* FROM Accounts a
          JOIN UserPermissions up ON a.entity_id = up.entity_id
          WHERE up.user_id = ?
        `).bind(user.user_id).all();
        
        let matchedAccountId = null;
        let matchedBank = accountKeyword;
        for (const acc of accounts.results) {
          if (
            acc.name.toLowerCase().includes(accountKeyword.toLowerCase()) || 
            (acc.bank_name && acc.bank_name.toLowerCase().includes(accountKeyword.toLowerCase()))
          ) {
            matchedAccountId = acc.account_id;
            matchedBank = acc.bank_name || acc.name;
            break;
          }
        }

        if (!matchedAccountId && accounts.results.length > 0) {
          matchedAccountId = accounts.results[0].account_id; // Fallback
        } else if (!matchedAccountId) {
          matchedAccountId = 'Acc_A_Cash';
        }

        const txId = 'TX-' + Date.now();
        const detailId = 'DT-' + Math.random().toString(36).substring(2, 11);
        const categoryId = amount > 0 ? 'Cat_Account' : 'Cat_Food'; // Fallback
        const detailType = amount > 0 ? 'INCOME' : 'EXPENSE';

        const ocrResultFormat = {
          date: todayStr,
          time: localNow.toISOString().slice(11, 19),
          amount: amount,
          fee: 0,
          receiver_bank: matchedBank,
          sender_bank: '',
          ref_code: 'LINE_TEXT_ENTRY',
          note: note
        };

        const statements = [
          env.DB.prepare(`
            INSERT INTO Transactions (transaction_id, account_id, ref_code, date, total_amount, status, source, created_by_user_id)
            VALUES (?, ?, ?, ?, ?, 'PENDING_REVIEW', 'LINE_TEXT', ?)
          `).bind(txId, matchedAccountId, ocrResultFormat.ref_code, ocrResultFormat.date + ' ' + ocrResultFormat.time, amount, user.user_id),
          
          env.DB.prepare(`
            INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, note, type)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
          `).bind(detailId, txId, amount, 0, categoryId, note, detailType)
        ];

        await env.DB.batch(statements);

        const webEditLink = `${env.WEB_APP_URL || 'https://recordrevenue.pages.dev'}?txId=${txId}`;
        await replyLineFlex(replyToken, txId, webEditLink, ocrResultFormat, matchedBank, env);
      } catch (err) {
        await replyLineText(replyToken, `❌ เกิดข้อผิดพลาดในการบันทึก: ${err.message}`, env);
      }
      return new Response('OK');
    }

    // 2. Handle Summary Commands
    try {
      if (lowerText === 'วันนี้' || lowerText === 'today') {
        const report = await getDailySummaryText(user.user_id, todayStr, 'วันนี้', env);
        await replyLineTextWithQuickReplies(replyToken, report, env);
      } else if (lowerText === 'เมื่อวาน' || lowerText === 'yesterday') {
        const report = await getDailySummaryText(user.user_id, yesterdayStr, 'เมื่อวาน', env);
        await replyLineTextWithQuickReplies(replyToken, report, env);
      } else if (lowerText === 'รายวัน' || lowerText === 'daily' || lowerText.includes('สรุปรายวัน') || lowerText.includes('ยอดรายวัน')) {
        const report = await get7DayBreakdownText(user.user_id, env);
        await replyLineTextWithQuickReplies(replyToken, report, env);
      } else {
        await sendMonthlySummaryFlex(replyToken, user, env);
      }
    } catch (err) {
      await replyLineText(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}`, env);
    }
  }

  return new Response('OK');
}

// Helper: LINE Text Reply
async function replyLineText(replyToken, text, env) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const body = {
    replyToken,
    messages: [{ type: 'text', text }]
  };
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
}

// Helper: LINE Text Reply with Quick Replies
async function replyLineTextWithQuickReplies(replyToken, text, env) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const body = {
    replyToken,
    messages: [{
      type: 'text',
      text: text,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: 'สรุปวันนี้', text: 'สรุปวันนี้' } },
          { type: 'action', action: { type: 'message', label: 'สรุปเมื่อวาน', text: 'สรุปเมื่อวาน' } },
          { type: 'action', action: { type: 'message', label: 'รายวัน (7 วัน)', text: 'รายวัน' } },
          { type: 'action', action: { type: 'message', label: 'สรุปเดือนนี้', text: 'สรุปเดือนนี้' } }
        ]
      }
    }]
  };
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
}

// Helper: LINE Monthly Summary Flex Message
async function sendMonthlySummaryFlex(replyToken, user, env) {
  const tzOffset = 7 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() + tzOffset);
  const todayStr = localNow.toISOString().slice(0, 10);
  const currentMonthStr = todayStr.substring(0, 7); // "YYYY-MM"
  
  // Query totals
  const query = `
    SELECT 
      SUM(CASE WHEN cp.behavior IN ('REVENUE', 'ASSET')
                AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'
               THEN d.amount ELSE 0 END) as income,
      SUM(CASE WHEN cp.behavior IN ('EXPENSE', 'LIABILITY') THEN d.amount ELSE 0 END) as expense
    FROM Transactions t
    JOIN Accounts a ON t.account_id = a.account_id
    JOIN UserPermissions up ON a.entity_id = up.entity_id
    JOIN TransactionDetails d ON t.transaction_id = d.transaction_id
    WHERE up.user_id = ?
      AND t.date LIKE ?
      AND t.status = 'CONFIRMED'
  `;
  const result = await env.DB.prepare(query).bind(user.user_id, `${currentMonthStr}%`).first();
  
  const income = result.income || 0;
  const expense = result.expense || 0;
  const net = income - expense;
  const netColor = net >= 0 ? "#2ecc71" : "#e74c3c";
  const netSign = net >= 0 ? "+" : "";

  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const currentMonthThai = thaiMonths[localNow.getMonth()] + " " + (localNow.getFullYear() + 543);

  const payload = {
    replyToken,
    messages: [{
      type: "flex",
      altText: `สรุปยอดเงินเดือน ${thaiMonths[localNow.getMonth()]}`,
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#2c3e50",
          contents: [
            { type: "text", text: "📊 สรุปยอดเงินส่วนตัว", weight: "bold", color: "#ffffff", size: "md" },
            { type: "text", text: `คุณ ${user.name}`, color: "#bdc3c7", size: "xs", margin: "xs" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "text", text: `ประจำเดือน: ${currentMonthThai}`, size: "sm", color: "#888888" },
            { type: "box", layout: "vertical", margin: "md", contents: [
                { type: "text", text: "คงเหลือสุทธิ (Net Balance)", size: "xs", color: "#aaaaaa" },
                { type: "text", text: `${netSign}${net.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`, size: "xxl", weight: "bold", color: netColor }
              ]},
            { type: "separator", margin: "md" },
            { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: [
                { type: "box", layout: "horizontal", contents: [
                    { type: "text", text: "🟢 รายรับรวม (Income):", size: "sm", color: "#666666" },
                    { type: "text", text: `+${income.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`, size: "sm", weight: "bold", color: "#2ecc71", align: "end" }
                  ]},
                { type: "box", layout: "horizontal", contents: [
                    { type: "text", text: "🔴 รายจ่ายรวม (Expense):", size: "sm", color: "#666666" },
                    { type: "text", text: `-${expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`, size: "sm", weight: "bold", color: "#e74c3c", align: "end" }
                  ]}
              ]}
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "link",
              action: {
                type: "uri",
                label: "🌐 เข้าสู่ระบบจัดการบัญชี",
                uri: env.WEB_APP_URL || "https://recordrevenue.pages.dev"
              }
            }
          ]
        }
      },
      quickReply: {
        items: [
          {
            type: "action",
            action: { type: "message", label: "สรุปวันนี้", text: "สรุปวันนี้" }
          },
          {
            type: "action",
            action: { type: "message", label: "สรุปเมื่อวาน", text: "สรุปเมื่อวาน" }
          },
          {
            type: "action",
            action: { type: "message", label: "รายวัน (7 วัน)", text: "รายวัน" }
          },
          {
            type: "action",
            action: { type: "message", label: "สรุปเดือนนี้", text: "สรุปเดือนนี้" }
          }
        ]
      }
    }]
  };

  const url = 'https://api.line.me/v2/bot/message/reply';
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload)
  });
}

// Helper: Calculate daily summary text
async function getDailySummaryText(userId, dateStr, dateLabel, env) {
  const query = `
    SELECT 
      t.date,
      a.name as account_name,
      d.amount,
      
      d.note,
      c.name as category_name
    FROM Transactions t
    JOIN Accounts a ON t.account_id = a.account_id
    JOIN UserPermissions up ON a.entity_id = up.entity_id
    JOIN TransactionDetails d ON t.transaction_id = d.transaction_id
    JOIN Categories c ON d.category_id = c.category_id
    WHERE up.user_id = ?
      AND t.date LIKE ?
      AND t.status = 'CONFIRMED'
    ORDER BY t.date ASC, t.created_at ASC
  `;
  const result = await env.DB.prepare(query).bind(userId, `${dateStr}%`).all();
  const txs = result.results;

  const displayDate = dateStr.split('-').reverse().join('/'); // "DD/MM/YYYY"
  
  if (txs.length === 0) {
    return `📅 รายงานประจำวัน (${dateLabel}): ${displayDate}\n\nไม่มีรายการบันทึกรายได้/ค่าใช้จ่ายที่ยืนยันแล้วในวันนี้ครับ`;
  }

  let incomeText = '';
  let expenseText = '';
  let totalIncome = 0;
  let totalExpense = 0;

  txs.forEach(tx => {
    const timePart = tx.date.includes(' ') ? tx.date.split(' ')[1].substring(0, 5) : '';
    const timeDisplay = timePart ? `[${timePart}] ` : '';
    
    const amountVal = Math.abs(tx.amount);
    const line = `- ${timeDisplay}${tx.account_name}: ${amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿ (${tx.note || '-'} - หมวด ${tx.category_name})\n`;
    
    if (tx.details.some(d => d.behavior === 'REVENUE' || d.behavior === 'ASSET')) {
      incomeText += line;
      totalIncome += amountVal;
    } else if (tx.details.some(d => d.behavior === 'EXPENSE' || d.behavior === 'LIABILITY')) {
      expenseText += line;
      totalExpense += amountVal;
    }
  });

  let msg = `📅 รายงานประจำวัน (${dateLabel}): ${displayDate}\n\n`;
  
  msg += `🔹 รายการรายรับ (Income):\n`;
  msg += incomeText ? incomeText : `- ไม่มีรายการ\n`;
  msg += `\n`;
  
  msg += `🔸 รายการรายจ่าย (Expense):\n`;
  msg += expenseText ? expenseText : `- ไม่มีรายการ\n`;
  
  const net = totalIncome - totalExpense;
  const netSign = net >= 0 ? '+' : '';

  msg += `\n----------------------\n`;
  msg += `🟢 รายรับรวม: ${totalIncome.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท\n`;
  msg += `🔴 รายจ่ายรวม: ${totalExpense.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท\n`;
  msg += `คงเหลือสุทธิ: ${netSign}${net.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;

  return msg;
}

// Helper: Calculate 7 day daily breakdown text
async function get7DayBreakdownText(userId, env) {
  const tzOffset = 7 * 60 * 60 * 1000;
  const sevenDaysAgo = new Date(Date.now() + tzOffset - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const query = `
    SELECT 
      substr(t.date, 1, 10) as date_only,
      SUM(CASE WHEN cp.behavior IN ('REVENUE', 'ASSET')
                AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'
               THEN d.amount ELSE 0 END) as income,
      SUM(CASE WHEN cp.behavior IN ('EXPENSE', 'LIABILITY') THEN d.amount ELSE 0 END) as expense
    FROM Transactions t
    JOIN Accounts a ON t.account_id = a.account_id
    JOIN UserPermissions up ON a.entity_id = up.entity_id
    JOIN TransactionDetails d ON t.transaction_id = d.transaction_id
    WHERE up.user_id = ?
      AND t.date >= ?
      AND t.status = 'CONFIRMED'
    GROUP BY date_only
    ORDER BY date_only DESC
  `;
  const result = await env.DB.prepare(query).bind(userId, sevenDaysAgoStr).all();
  const rows = result.results;

  if (rows.length === 0) {
    return `📊 สรุปยอดรายวัน (7 วันล่าสุด)\n\nไม่พบรายการรายรับรายจ่ายที่ยืนยันแล้วในช่วง 7 วันที่ผ่านมาครับ`;
  }

  let msg = `📊 สรุปยอดรายวัน (7 วันล่าสุด)\n\n`;
  rows.forEach(row => {
    const displayDate = row.date_only.split('-').reverse().slice(0, 2).join('/'); // "DD/MM"
    const net = row.income - row.expense;
    const netSign = net >= 0 ? '+' : '';
    msg += `📅 ${displayDate}: 🟢 +${row.income.toLocaleString()} | 🔴 -${row.expense.toLocaleString()} (สุทธิ: ${netSign}${net.toLocaleString()} ฿)\n`;
  });
  
  return msg;
}

// Helper: LINE Flex Message Reply for Slip OCR
async function replyLineFlex(replyToken, txId, editLink, ocr, matchedBank, env) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  const displayNote = ocr.note ? ocr.note : "-";
  const displayDate = ocr.date ? ocr.date.split('-').reverse().join('/') : "-";
  
  const payload = {
    replyToken,
    messages: [{
      type: "flex",
      altText: "อ่านสลิปโอนเงินสำเร็จและรอบันทึกผล",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "📷 อ่านสลิปสำเร็จ (รอบันทึก)", weight: "bold", size: "lg", color: "#FF9800" },
            { type: "text", text: `Ref: ${txId}`, size: "xxs", color: "#aaaaaa", margin: "xs" },
            { type: "separator", margin: "md" },
            { 
              type: "box", 
              layout: "vertical", 
              margin: "md", 
              spacing: "sm",
              contents: [
                { type: "text", text: `📅 วันที่โอน: ${displayDate} ${ocr.time || ''}`, size: "sm", weight: "bold" },
                { type: "box", layout: "baseline", contents: [
                    { type: "text", text: "📤 ผู้โอน:", size: "sm", color: "#888888", flex: 2 },
                    { type: "text", text: ocr.sender_name || "-", size: "sm", color: "#000000", flex: 4 }
                  ]},
                { type: "box", layout: "baseline", contents: [
                    { type: "text", text: "📥 ผู้รับ:", size: "sm", color: "#888888", flex: 2 },
                    { type: "text", text: ocr.receiver_name || matchedBank, size: "sm", color: "#000000", flex: 4, weight: "bold" }
                  ]},
                { type: "separator", margin: "sm" },
                { type: "box", layout: "baseline", margin: "sm", contents: [
                    { type: "text", text: "💰 ยอดเงิน:", size: "sm", color: "#888888", flex: 2 },
                    { type: "text", text: ocr.amount.toLocaleString() + " บาท", size: "sm", color: "#ff5500", flex: 4, weight: "bold" }
                  ]},
                { type: "box", layout: "baseline", contents: [
                    { type: "text", text: "📝 บันทึก:", size: "sm", color: "#888888", flex: 2 },
                    { type: "text", text: displayNote, size: "sm", color: "#666666", flex: 4, wrap: true }
                  ]}
              ]
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            { "type": "button", "style": "primary", "action": { "type": "uri", "label": "✏️ ตรวจสอบ & ยืนยันรายการ", "uri": editLink } }
          ]
        }
      }
    }]
  };

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload)
  });
}
