import { handleUnifiedTrip } from './unified-trip.js';
import { handleLegacyTrip } from './legacy-trip.js';
import { handleLedgerInbox, geminiGenerate } from './ledger-inbox.js';
import { planSettlementKeep } from './settle-keep.js';
import { isMonthClosed, isPeriodClosedError, PERIOD_CLOSED_MSG } from './period-close.js';
import { IS_ASSET_SQL, assetCategorySet } from './assets.js';
import { verifyPassword, upgradeStoredPassword, hashPassword, isHashed } from './auth.js';
import { createSession, revokeSession, resolveUserId, bearerFrom, purgeExpiredSessions } from './session.js';
import { handleStmtReport, ensureStmtCols, stmtFields, cleanupStatementHeaders } from './stmt-report.js';
import { handleRevenueChart } from './revenue-chart.js';
// backend/src/index.js

export default {
  async fetch(request, env, ctx) {
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

    /* ระบุตัวตน "ที่เดียว" แล้วส่งต่อให้ทุก route ใช้
       เดิมแต่ละ route อ่าน x-user-id เองแล้วเชื่อทันที รวม 45 จุด ซึ่งแปลว่า
       ถ้าจะเพิ่มการตรวจสอบต้องแก้ทั้ง 45 จุดและพลาดจุดเดียวก็รั่วทั้งระบบ */
    /* D1 ล่ม/เกินโควตา ตรงนี้เคยโยน error นอก try → Cloudflare ตอบหน้า 1101 ไม่มี CORS
       หน้าเว็บเลยเห็นแค่ "เชื่อมต่อไม่ได้" · ตอนนี้ตอบเป็น JSON ที่อ่านรู้เรื่อง (2026-10-11) */
    let authUserId = '';
    try { authUserId = await resolveUserId(request, env); }
    catch (err) { return dbErrorResponse(err, corsHeaders); }

    try {
      // Unified Trip (โมดูลแยก) — คืน null ถ้าไม่ใช่ path ของตัวเอง จึงไม่กระทบ route เดิม
      const unified = await handleUnifiedTrip(request, env, url, corsHeaders, authUserId);
      if (unified) return unified;

      // ทริปรุ่นเก่า (หน้าเว็บเก่า) — แยกไฟล์แล้ว คืน null ถ้าไม่ใช่ path ของตัวเอง
      const legacyTrip = await handleLegacyTrip(request, env, url, corsHeaders, authUserId);
      if (legacyTrip) return legacyTrip;

      // กล่องรับเอกสาร + LINE Bot รุ่นใหม่ (ledger-inbox.js) — รับ /api/line-webhook และ /api/inbox/*
      // คำสั่งสรุป (วันนี้/เมื่อวาน/รายวัน/เดือน) ยังใช้โค้ดเดิมในไฟล์นี้ผ่าน hooks.summary
      const inbox = await handleLedgerInbox(request, env, url, corsHeaders, authUserId, { summary: lineSummaryReply, waitUntil: ctx?.waitUntil ? p => ctx.waitUntil(p) : null });
      if (inbox) return inbox;

      /* ออกจากระบบ — ลบ token ทิ้งฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ลบในเบราว์เซอร์
         ถ้าลบแค่ฝั่งหน้าจอ token ที่หลุดไปแล้วจะยังใช้ได้จนหมดอายุ */
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        await revokeSession(env, bearerFrom(request));
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 0. Login Endpoint
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (!username || !password) {
          return new Response(JSON.stringify({ error: 'กรุณากรอกผู้ใช้และรหัสผ่าน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        /* ⚠️ ห้ามใส่ password ลงใน SQL อีกต่อไป — พอเก็บเป็น hash แล้ว
           การเทียบด้วย `AND password = ?` จะไม่มีวันตรง ต้องดึงผู้ใช้ด้วย
           ชื่อ/อีเมลก่อน แล้วค่อยตรวจรหัสในโค้ด */
        const user = await env.DB.prepare(`
          SELECT * FROM Users
          WHERE LOWER(email) = LOWER(?) OR LOWER(user_id) = LOWER(?) OR LOWER(name) = LOWER(?)
          LIMIT 1
        `).bind(username, username, username).first();

        const check = user
          ? await verifyPassword(password, user.password)
          : { ok: false, needsUpgrade: false };

        if (!user || !check.ok) {
          // ข้อความเดียวกันทั้งกรณีไม่มีผู้ใช้และรหัสผิด จะได้ไม่บอกใบ้ว่าชื่อไหนมีอยู่จริง
          return new Response(JSON.stringify({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        /* รหัสถูกต้องแต่ยังเก็บแบบเก่า → เขียนทับด้วย hash เดี๋ยวนี้เลย
           ทำหลังยืนยันตัวตนแล้วเท่านั้น และล้มเหลวก็ไม่กระทบการล็อกอิน */
        if (check.needsUpgrade) {
          await upgradeStoredPassword(env, user.user_id, password);
        }

        // Fetch user permissions
        const perms = await env.DB.prepare(`SELECT entity_id FROM UserPermissions WHERE user_id = ?`).bind(user.user_id).all();
        const allowedEntities = perms.results.map(p => p.entity_id);

        /* ออก token ให้ตรงนี้ — จุดเดียวในระบบที่พิสูจน์ตัวตนด้วยรหัสผ่านจริง
           ล้มเหลวไม่ทำให้ล็อกอินพัง เพราะยังมี fallback x-user-id อยู่ช่วงเปลี่ยนผ่าน */
        let session = null;
        try {
          session = await createSession(env, user.user_id);
          purgeExpiredSessions(env);   // ไม่ต้องรอ
        } catch (error) {
          console.error('ออก session token ไม่สำเร็จ', error.message);
        }

        return new Response(JSON.stringify({
          success: true,
          token: session?.token || null,
          token_expires_at: session?.expiresAt || null,
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

      /* 🔒 ประตูเดียว (2026-10-11): ทุก route ด้านล่างนี้ต้องล็อกอิน
         เดิมบาง route ไม่ตรวจเลย (export, outstanding_ar, settlements, categories, slip-ocr ...)
         ใครรู้ URL ก็ดึงข้อมูลหรือใช้โควตา AI ได้ */
      if (!authUserId) {
        return new Response(JSON.stringify({ error: 'กรุณาเข้าสู่ระบบ' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      /* บัญชีนี้ผู้ใช้มีสิทธิ์ไหม (ผ่านบริษัทที่เห็น) · ใช้ดัชนี ไม่สแกนตาราง */
      const canUseAccount = async (accId) => !!(accId && await env.DB.prepare(
        `SELECT 1 FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id WHERE a.account_id = ? AND up.user_id = ?`
      ).bind(accId, authUserId).first());
      /* รหัสรายการนี้ ถ้ามีอยู่แล้ว ต้องเป็นของบัญชีที่ผู้ใช้มีสิทธิ์ (กันเขียนทับรายการคนอื่น) */
      const canWriteTx = async (txId) => {
        if (!txId) return true;
        const ex = await env.DB.prepare(`SELECT account_id FROM Transactions WHERE transaction_id = ?`).bind(txId).first();
        return !ex || await canUseAccount(ex.account_id);
      };
      const familyOf = async () => (await env.DB.prepare(`SELECT family_id FROM Users WHERE user_id = ?`).bind(authUserId).first())?.family_id || null;
      const deny = (msg, status = 403) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      /* 📒 หัว statement + รายงานยอดสะสมต่อ statement (2026-10-30 · stmt-report.js) */
      { const sr = await handleStmtReport({ url, request, env, cors: corsHeaders, authUserId, canUseAccount, deny }); if (sr) return sr; }
      /* 👥 ผังเก็บรายได้ BKP → จับเงินเข้า (2026-10-30 · revenue-chart.js) */
      { const rc = await handleRevenueChart({ url, request, env, cors: corsHeaders, authUserId, canUseAccount, deny }); if (rc) return rc; }

      // 2. OCR Test Endpoint (Direct Web Upload)
      if (url.pathname === '/api/slip-ocr' && request.method === 'POST') {
        const body = await request.json();
        const { imageBase64 } = body;
        if (!imageBase64) {
          return new Response(JSON.stringify({ error: 'Missing imageBase64' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const ocrData = await runGeminiOCR(imageBase64, env);
        return new Response(JSON.stringify(ocrData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/statement-ocr' && request.method === 'POST') {
        const body = await request.json();
        const { pdfBase64, imagesBase64 } = body;
        if (!pdfBase64 && (!imagesBase64 || imagesBase64.length === 0)) {
          return new Response(JSON.stringify({ error: 'Missing pdfBase64 or imagesBase64' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        try {
          const statementData = await runGeminiStatement(pdfBase64, imagesBase64, env);
          return new Response(JSON.stringify(statementData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      
      // 3. Transactions CRUD
      if (url.pathname === '/api/transactions') {
        const userId = authUserId;
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (request.method === 'GET') {
          const statusFilter = url.searchParams.get('status');
          let startDate = url.searchParams.get('startDate');
          let endDate = url.searchParams.get('endDate');
          const search = url.searchParams.get('search');
          /* 2026-09-08 · ฟรีเทียร์ D1 เต็ม (5M rows_read/วัน) — หน้าประวัติส่ง ?month= มาตลอด
             แต่ฝั่งนี้ไม่เคยอ่าน จึงดึง 14,143 รายการ + รายการย่อยทั้งหมดทุกครั้งที่เปิดหน้า
             · รองรับ month=YYYY-MM (แปลงเป็นช่วงวันที่ให้ index ใช้ได้)
             · ไม่ระบุช่วง/คำค้น → จำกัดเฉพาะ 500 รายการล่าสุด (limit= ปรับได้ · limit=0 = ทั้งหมด) */
          const monthParam = url.searchParams.get('month');
          if (monthParam && /^\d{4}-\d{2}$/.test(monthParam) && !startDate && !endDate) {
            startDate = `${monthParam}-01`;
            const [yy, mm] = monthParam.split('-').map(Number);
            endDate = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`;
            endDate = new Date(new Date(endDate) - 86400000).toISOString().substring(0, 10);
          }
          /* ?count=1 → นับอย่างเดียว (ป้ายตัวเลข "รอตรวจ") ไม่ต้องดึงรายการทั้งหมดมานับในเบราว์เซอร์ */
          if (url.searchParams.get('count') === '1') {
            const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM Transactions t
                JOIN Accounts a ON t.account_id = a.account_id JOIN UserPermissions up ON a.entity_id = up.entity_id
               WHERE up.user_id = ?${statusFilter ? ' AND t.status = ?' : ''}`).bind(...(statusFilter ? [userId, statusFilter] : [userId])).first();
            return new Response(JSON.stringify({ count: c?.n || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          const limitParam = url.searchParams.get('limit');
          const noRange = !startDate && !endDate && !search;
          const limit = limitParam !== null ? Math.max(0, parseInt(limitParam, 10) || 0) : (noRange ? 500 : 0);
          
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

          if (limit > 0) {
            /* จำกัดที่ "รายการ" ไม่ใช่ "แถวย่อย" — ไม่งั้นรายการที่มีหลายแถวย่อยจะถูกตัดขาดกลางคัน */
            query += ` AND t.transaction_id IN (
              SELECT t2.transaction_id FROM Transactions t2
              JOIN Accounts a2 ON t2.account_id = a2.account_id
              JOIN UserPermissions up2 ON a2.entity_id = up2.entity_id
              WHERE up2.user_id = ?${statusFilter ? ' AND t2.status = ?' : ''}
              ORDER BY t2.date DESC, t2.created_at DESC LIMIT ${limit})`;
            params.push(userId);
            if (statusFilter) params.push(statusFilter);
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

          /* เดาหมวดจากรายการที่เคยยืนยัน (2026-10-11 แก้ให้เบา)
             เดิม: 1 คำสั่งต่อรายการรอตรวจ + OR ข้ามสองคอลัมน์ → สแกนทั้งตาราง ~27k แถว/รายการ
             ใหม่: ค้นทีละคีย์ที่ไม่ซ้ำ (ใช้ดัชนี) · จำกัด 30 คีย์ · เฉพาะบัญชีที่ผู้ใช้เห็น */
          const AM_SQL = col => `SELECT d.category_id, d.contact_id, d.project_id, d.entity_id, d.note, c.name as category_name, co.name as contact_name
                 FROM Transactions t2
                 JOIN Accounts a2 ON a2.account_id = t2.account_id JOIN UserPermissions up2 ON up2.entity_id = a2.entity_id AND up2.user_id = ?
                 JOIN TransactionDetails d ON t2.transaction_id = d.transaction_id
                 JOIN Categories c ON d.category_id = c.category_id
                 LEFT JOIN Contacts co ON d.contact_id = co.contact_id
                 WHERE t2.${col} = ? AND +t2.status = 'CONFIRMED'   -- เครื่องหมาย + บังคับให้ใช้ดัชนีของ ${col} ไม่ใช่ดัชนีสถานะ
                 ORDER BY t2.date DESC LIMIT 1`;
          const amCache = new Map();
          const lookup = async (col, val) => {
            const key = col + '|' + val;
            if (amCache.has(key)) return amCache.get(key);
            if (amCache.size >= 30) return null;
            const m = await env.DB.prepare(AM_SQL(col)).bind(userId, val).first();
            amCache.set(key, m || null);
            return m || null;
          };
          for (const tx of result) {
            if (tx.status !== 'PENDING_REVIEW') continue;
            const m = (tx.ref_code ? await lookup('ref_code', tx.ref_code) : null)
              || (tx.statement_desc ? await lookup('statement_desc', tx.statement_desc) : null);
            if (m) tx.auto_match = m;
          }

          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const { transaction_id, account_id, ref_code, date, time, statement_desc, total_amount, status, source, slip_image_url, details, check_only } = body;
          /* 📒 มาจาก statement ไหน · ลำดับบรรทัด · ยอดคงเหลือที่ธนาคารพิมพ์ (2026-10-30) */
          await ensureStmtCols(env);
          const stmt = stmtFields(body);
          const fillStmt = id => stmt.stmt_id ? env.DB.prepare(`UPDATE Transactions SET stmt_id = COALESCE(stmt_id, ?), stmt_seq = CASE WHEN stmt_id IS NULL OR stmt_id = ? THEN ? ELSE stmt_seq END,
              stmt_balance = CASE WHEN stmt_id IS NULL OR stmt_id = ? THEN COALESCE(?, stmt_balance) ELSE stmt_balance END WHERE transaction_id = ?`)
            .bind(stmt.stmt_id, stmt.stmt_id, stmt.stmt_seq, stmt.stmt_id, stmt.stmt_balance, id).run() : null;
          
          // Map invalid sources to allowed values under DB constraints
          let mappedSource = source || 'WEB_GRID';
          if (mappedSource === 'STATEMENT_PDF' || mappedSource === 'RESTORE_EXCEL') {
            mappedSource = 'PDF_IMPORT';
          }

          if (!account_id || !date || total_amount === undefined || !details || !details.length) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          /* บัญชีต้องเป็นของผู้ใช้ และถ้าแก้รายการเดิม รายการนั้นต้องเป็นของผู้ใช้ด้วย (2026-10-11) */
          if (!(await canUseAccount(account_id))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
          if (!(await canWriteTx(transaction_id))) return deny('ไม่มีสิทธิ์แก้รายการนี้');
          /* INSERT OR REPLACE ย้ายวันที่ออกจากเดือนที่ปิดได้โดย trigger ไม่เห็น → เช็กวันที่เดิมเองตรงนี้ */
          if (transaction_id) {
            const old = await env.DB.prepare(`SELECT account_id, date FROM Transactions WHERE transaction_id = ?`).bind(transaction_id).first();
            if (old && await isMonthClosed(env, old.account_id, old.date)) return deny(PERIOD_CLOSED_MSG, 409);
          }
          if (await isMonthClosed(env, account_id, date)) return deny(PERIOD_CLOSED_MSG, 409);

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
            /* 2026-10-15: ไม่นับตัวเอง (กดบันทึกการ์ดเดิมเคยถูกมองว่า "ซ้ำ" แล้วไม่บันทึก)
               และเทียบยอดแบบไม่สนเครื่องหมาย (รายการนำเข้าเก่าเก็บยอดบวก · ใหม่เก็บติดลบตามจริง) */
            const selfId = transaction_id || '';
            if (ref_code) {
              dupTx = await env.DB.prepare(
                `SELECT transaction_id, date, total_amount, status, statement_desc FROM Transactions WHERE account_id = ? AND ref_code = ? AND transaction_id != ?`
              ).bind(account_id, ref_code, selfId).first();
            }
            if (!dupTx) {
              dupTx = await env.DB.prepare(`
                SELECT transaction_id, date, total_amount, status, statement_desc FROM Transactions
                WHERE account_id = ?
                  AND date = ?
                  AND (time = ? OR (time IS NULL AND ? IS NULL))
                  AND ABS(ABS(total_amount) - ABS(?)) < 0.01
                  AND (statement_desc = ? OR (statement_desc IS NULL AND ? IS NULL))
                  AND transaction_id != ?
                  /* 2026-10-30: รายการเหมือนกันทุกช่องหลายบรรทัดในไฟล์ (ใบแจ้งยอดบัตรไม่มีเวลา · ร้านเดิม ยอดเดิม วันเดิม)
                     dup_idx = บรรทัดนี้เป็นตัวที่เท่าไรของรายการเหมือนกันในไฟล์ (0,1,2…) → ซ้ำก็ต่อเมื่อในระบบมีถึงตัวนั้นแล้ว
                     (เดิมใช้ลำดับบรรทัด stmt_seq → นำเข้าไฟล์เดิมที่อ่านได้ครบกว่าเดิม ลำดับเลื่อน → สร้างซ้ำ) */
                ORDER BY created_at, transaction_id LIMIT 1 OFFSET ?
              `).bind(account_id, date, time||null, time||null, total_amount, statement_desc||null, statement_desc||null, selfId, Math.max(0, parseInt(body.dup_idx, 10) || 0)).first();
            }
            /* จับคู่กับสลิป/รายการที่บันทึกไว้ก่อน (2026-10-15 · North: "สลิป รอ match กับ statement")
               บรรทัด statement ที่ยอด+บัญชีตรงกับรายการจาก LINE/พิมพ์เอง ภายใน ±3 วัน → ไม่สร้างใหม่ (กันซ้ำ)
               แต่ปรับรายการเดิมให้ใช้วันที่/ข้อความของธนาคาร และนับว่ามี statement ยืนยันแล้ว (source = PDF_IMPORT) */
            if (!dupTx && body.match_existing) {
              const day = 864e5, base = Date.parse(String(date).slice(0, 10));
              const from = new Date(base - 3 * day).toISOString().slice(0, 10), to = new Date(base + 3 * day).toISOString().slice(0, 10);
              const cands = (await env.DB.prepare(`SELECT transaction_id, date, total_amount, status, statement_desc, source FROM Transactions
                  WHERE account_id = ? AND (source IN ('LINE_SLIP','LINE_TEXT','WEB_GRID')
                    /* 2026-10-30: ข้อมูลเก่าที่ยืนยันแล้ว (นำเข้า Excel/จดไว้ก่อน · ไม่มีเวลา · ไม่ได้มาจาก statement) ก็จับคู่ได้ ไม่สร้างซ้ำ */
                    OR (status = 'CONFIRMED' AND (time IS NULL OR time = '') AND (stmt_id IS NULL OR stmt_id = '')))
                    AND date >= ? AND date <= ?
                    AND ABS(ABS(total_amount) - ABS(?)) < 0.01 AND ((total_amount < 0) = (? < 0)) AND transaction_id != ?`)
                .bind(account_id, from, to + ' 23:59:59', total_amount, total_amount, selfId).all()).results || [];
              const dist = c => Math.abs(Date.parse(String(c.date).slice(0, 10)) - base);
              cands.sort((a, b) => dist(a) - dist(b));
              if (cands.length && (cands.length === 1 || dist(cands[0]) < dist(cands[1]))) {
                const c = cands[0];
                if (!(await isMonthClosed(env, account_id, c.date))) {
                  /* รายการเดิมที่ยืนยันแล้ว: ข้อความเดิม (ที่คนจดไว้) ย้ายไปหมายเหตุถ้ายังว่าง ก่อนใช้ข้อความธนาคาร */
                  if (c.status === 'CONFIRMED' && c.statement_desc) await env.DB.prepare(`UPDATE TransactionDetails SET note = ? WHERE transaction_id = ? AND (note IS NULL OR note = '')
                      AND (SELECT COUNT(*) FROM TransactionDetails x WHERE x.transaction_id = ?) = 1`).bind(c.statement_desc, c.transaction_id, c.transaction_id).run();
                  await env.DB.prepare(`UPDATE Transactions SET date = ?, time = COALESCE(?, time), statement_desc = ?, source = 'PDF_IMPORT', ref_code = COALESCE(ref_code, ?) WHERE transaction_id = ?`)
                    .bind(date, time || null, statement_desc || c.statement_desc || null, ref_code || null, c.transaction_id).run();
                  await fillStmt(c.transaction_id);
                  return new Response(JSON.stringify({ success: true, skipped: true, merged: true, existingId: c.transaction_id,
                    message: `จับคู่กับรายการเดิม: ${String(c.date).slice(0, 10)} | ${fmtAmt(c.total_amount)} | ${c.statement_desc || '-'} (${c.status})` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
              }
            }
            if (dupTx) {
              await fillStmt(dupTx.transaction_id);   // นำเข้า statement เดิมซ้ำ → เติมยอดรายบรรทัดให้รายการเดิม
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
          /* แก้รายการเดิม (INSERT OR REPLACE ลบแถวเก่า) → คง stmt_* เดิมไว้ถ้าไม่ได้ส่งมา */
          const prevStmt = stmt.stmt_id ? null : await env.DB.prepare(`SELECT stmt_id, stmt_seq, stmt_balance FROM Transactions WHERE transaction_id = ?`).bind(txId).first();
          const keepStmt = stmt.stmt_id ? stmt : { stmt_id: prevStmt?.stmt_id ?? null, stmt_seq: prevStmt?.stmt_seq ?? null, stmt_balance: prevStmt?.stmt_balance ?? null };
          
          // Transaction Block using D1 Batch
          const statements = [
            env.DB.prepare(`
              INSERT OR REPLACE INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id, stmt_id, stmt_seq, stmt_balance)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(txId, account_id, ref_code || null, date, time || null, total_amount, statement_desc || null, txStatus, mappedSource, slip_image_url || null, userId, keepStmt.stmt_id, keepStmt.stmt_seq, keepStmt.stmt_balance),
            
            env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(txId)
          ];

          /* กันการตัดชำระลูกหนี้/เจ้าหนี้หายตอนแก้รายการ (ดู settle-keep.js) */
          const keep = await planSettlementKeep(env, txId, details);
          if (keep.error) return new Response(JSON.stringify({ error: keep.error }), { status: keep.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          for (const d of details) {
            const detailId = d.detail_id || 'DT-' + Math.random().toString(36).substring(2, 11);
            statements.push(
              env.DB.prepare(`
                INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, contact_id, project_id, note, entity_id, type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(detailId, txId, d.amount, d.fee || 0, d.wht || 0, d.category_id || 'Cat_Uncategorized', d.contact_id || null, d.project_id || null, d.note || null, d.entity_id || null, d.type || 'OTHER')
            );
          }

          statements.push(...keep.ops);
          await env.DB.batch(statements);
          return new Response(JSON.stringify({ success: true, transaction_id: txId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // 4. Confirm Transaction
      /* ยืนยัน/ลบ: ต้องเป็นรายการในบัญชีที่ผู้ใช้มีสิทธิ์ (เดิมไม่ตรวจ — ใครล็อกอินก็ยืนยัน/ลบรายการไหนก็ได้ · แก้ 2026-10-10) */
      const ownTx = async (txId) => authUserId && txId ? await env.DB.prepare(`SELECT t.transaction_id FROM Transactions t
          JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
          WHERE t.transaction_id = ? AND up.user_id = ?`).bind(txId, authUserId).first() : null;
      if (url.pathname === '/api/transactions/confirm' && request.method === 'POST') {
        const { transaction_id } = await request.json();
        if (!(await ownTx(transaction_id))) return new Response(JSON.stringify({ error: 'ไม่พบรายการ หรือไม่มีสิทธิ์' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        await env.DB.prepare(`UPDATE Transactions SET status = 'CONFIRMED' WHERE transaction_id = ?`).bind(transaction_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 5. Delete Transaction
      /* 💰 ยอดในระบบ ณ ก่อนวันที่กำหนด (2026-10-15) — ใช้ตรวจ "ยอดยกมา" ของ statement ก่อนนำเข้า
         นับทั้งที่ยืนยันแล้วและรอตรวจ (statement ช่วงก่อนหน้าอาจยังไม่ได้กดยืนยัน) · count = จำนวนรายการก่อนวันนั้น */
      if (url.pathname === '/api/accounts/balance-at' && request.method === 'GET') {
        const acc = url.searchParams.get('account_id') || '', date = String(url.searchParams.get('date') || '').slice(0, 10);
        if (!acc || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response(JSON.stringify({ error: 'ต้องระบุ account_id และ date (YYYY-MM-DD)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (!(await canUseAccount(acc))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
        /* รายการนำเข้ารุ่นเก่าที่รอตรวจเก็บยอดจ่ายเป็นบวก → ใช้ประเภทจากบรรทัดย่อยกลับเครื่องหมาย */
        const r = await env.DB.prepare(`SELECT ROUND(COALESCE(SUM(CASE WHEN t.status = 'PENDING_REVIEW' AND t.total_amount > 0
              AND EXISTS (SELECT 1 FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id AND d.type = 'EXPENSE') THEN -t.total_amount ELSE t.total_amount END), 0), 2) AS balance,
            COUNT(*) AS n, SUM(CASE WHEN t.transaction_id LIKE 'TX-OB-%' THEN 1 ELSE 0 END) AS n_opening,
            MIN(CASE WHEN t.transaction_id NOT LIKE 'TX-OB-%' THEN substr(t.date, 1, 10) END) AS first_date
          FROM Transactions t WHERE t.account_id = ? AND t.date < ?`).bind(acc, date).first();
        return new Response(JSON.stringify({ balance: r?.balance || 0, count: r?.n || 0, opening_rows: r?.n_opening || 0, first_date: r?.first_date || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      /* 📄 ยอดตามธนาคาร (2026-10-30 · North: "ตรวจว่าข้อมูลตรงกับยอดคงเหลือที่ถูกต้องไหม")
         เก็บยอดยกไปของ statement ล่าสุด (หรือที่พิมพ์เอง) ต่อบัญชี → เทียบกับยอดในระบบ (ยืนยัน + รอตรวจ) ณ สิ้นวันเดียวกัน
         balance เก็บเครื่องหมายแบบระบบ: บัตรเครดิตค้างชำระ = ติดลบ */
      if (url.pathname === '/api/accounts/checkpoint' || url.pathname === '/api/accounts/checkpoints') {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AccountCheckpoints (account_id TEXT NOT NULL, as_of TEXT NOT NULL, balance REAL NOT NULL,
          source TEXT, created_by TEXT, created_at TEXT, PRIMARY KEY (account_id, as_of))`).run();
      }
      if (url.pathname === '/api/accounts/checkpoint' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const acc = String(b.account_id || ''), asOf = String(b.as_of || '').slice(0, 10), bal = Number(b.balance);
        if (!acc || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(bal)) return new Response(JSON.stringify({ error: 'ต้องระบุ account_id, as_of (YYYY-MM-DD) และ balance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (!(await canUseAccount(acc))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
        const src = ['STATEMENT', 'MANUAL'].includes(b.source) ? b.source : 'MANUAL';
        await env.DB.prepare(`INSERT OR REPLACE INTO AccountCheckpoints (account_id, as_of, balance, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(acc, asOf, Math.round(bal * 100) / 100, src, authUserId, new Date().toISOString()).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/accounts/checkpoints' && request.method === 'GET') {
        /* ล่าสุดต่อบัญชี (เฉพาะบัญชีที่มีสิทธิ์) + ยอดในระบบ ณ สิ้นวัน as_of · รายการนำเข้ารุ่นเก่าที่รอตรวจ (จ่ายเก็บเป็นบวก) กลับเครื่องหมาย */
        const rows = (await env.DB.prepare(`SELECT c.account_id, c.as_of, c.balance AS bank, c.source,
            (SELECT ROUND(COALESCE(SUM(CASE WHEN t.status = 'PENDING_REVIEW' AND t.total_amount > 0
                AND EXISTS (SELECT 1 FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id AND d.type = 'EXPENSE') THEN -t.total_amount ELSE t.total_amount END), 0), 2)
              FROM Transactions t WHERE t.account_id = c.account_id AND substr(t.date, 1, 10) <= c.as_of) AS system
          FROM AccountCheckpoints c JOIN Accounts a ON a.account_id = c.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
          WHERE c.as_of = (SELECT MAX(c2.as_of) FROM AccountCheckpoints c2 WHERE c2.account_id = c.account_id)`).bind(authUserId).all()).results || [];
        const out = rows.map(r => ({ ...r, system: r.system || 0, diff: Math.round(((r.bank || 0) - (r.system || 0)) * 100) / 100 }));
        return new Response(JSON.stringify({ checkpoints: out }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      /* 🏷️ จำหมวดจากรายการเดิม (2026-10-15): ข้อความธนาคาร/ร้านเดียวกัน → หมวด·คู่ค้า·Company ที่เคยยืนยัน (ล่าสุดชนะ)
         ดูจาก 3000 รายการยืนยันล่าสุดที่มีบรรทัดย่อยเดียวและระบุหมวดแล้ว · คีย์ = ข้อความตัดตัวเลข/สัญลักษณ์ (statementKey) */
      if (url.pathname === '/api/transactions/category-hints' && request.method === 'GET') {
        const rows = (await env.DB.prepare(`SELECT t.statement_desc, t.total_amount, MIN(d.category_id) AS category_id, MIN(d.contact_id) AS contact_id, MIN(d.entity_id) AS entity_id,
            MIN(d.type) AS type, MIN(d.note) AS note, COUNT(d.detail_id) AS n_lines
          FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
          JOIN TransactionDetails d ON d.transaction_id = t.transaction_id
          WHERE t.status = 'CONFIRMED' AND t.statement_desc IS NOT NULL
          GROUP BY t.transaction_id HAVING n_lines = 1 AND category_id IS NOT NULL AND category_id != 'Cat_Uncategorized'
          ORDER BY t.date DESC LIMIT 3000`).bind(authUserId).all()).results || [];
        const hints = {};
        for (const r of rows) {
          const k = statementKey(r.statement_desc); if (!k) continue;
          const dir = (Number(r.total_amount) < 0 || r.type === 'EXPENSE') ? 'OUT' : 'IN', key = dir + '|' + k;
          if (!hints[key]) hints[key] = { category_id: r.category_id, contact_id: r.contact_id || null, entity_id: r.entity_id || null, type: r.type || null, n: 0 };
          hints[key].n++;
        }
        return new Response(JSON.stringify({ hints }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      /* ลบหลายรายการ "รอตรวจสอบ" พร้อมกัน (2026-10-15 · ลบทั้งชุด statement ที่นำเข้าผิดบัญชี)
         ลบได้เฉพาะ PENDING_REVIEW ของบัญชีที่มีสิทธิ์ · สูงสุด 3000 รายการต่อครั้ง */
      if (url.pathname === '/api/transactions/bulk-delete' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ids = [...new Set((body.transaction_ids || []).map(String))].slice(0, 3000);
        if (!ids.length) return new Response(JSON.stringify({ error: 'ไม่มีรายการที่เลือก' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        let deleted = 0; const touchedStmt = new Set();
        for (let i = 0; i < ids.length; i += 90) {
          const chunk = ids.slice(i, i + 90), marks = chunk.map(() => '?').join(',');
          const ok = ((await env.DB.prepare(`SELECT t.transaction_id FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id
              JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
              WHERE t.status = 'PENDING_REVIEW' AND t.transaction_id IN (${marks})`).bind(authUserId, ...chunk).all()).results || []).map(r => r.transaction_id);
          if (!ok.length) continue;
          const m2 = ok.map(() => '?').join(',');
          await ensureStmtCols(env);
          ((await env.DB.prepare(`SELECT DISTINCT stmt_id FROM Transactions WHERE stmt_id IS NOT NULL AND transaction_id IN (${m2})`).bind(...ok).all()).results || []).forEach(r => touchedStmt.add(r.stmt_id));
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id IN (${m2})`).bind(...ok),
            env.DB.prepare(`DELETE FROM LedgerDocLinks WHERE transaction_id IN (${m2})`).bind(...ok),
            env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id IN (${m2}) AND status = 'PENDING_REVIEW'`).bind(...ok),
          ]);
          deleted += ok.length;
        }
        /* ลบทั้งชุด statement → หัว statement + จุดตรวจยอดของชุดนั้นหายตาม (2026-10-30 · นำเข้าผิดบัญชีแล้วลบ หัวไม่ค้าง) */
        const headersRemoved = touchedStmt.size ? await cleanupStatementHeaders(env, [...touchedStmt]) : 0;
        return new Response(JSON.stringify({ success: true, deleted, requested: ids.length, headers_removed: headersRemoved }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/transactions/delete' && request.method === 'POST') {
        const { transaction_id } = await request.json();
        if (!(await ownTx(transaction_id))) return new Response(JSON.stringify({ error: 'ไม่พบรายการ หรือไม่มีสิทธิ์' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // ลบรายการย่อยด้วย (เดิมลบแค่หัว รายการย่อยค้างในฐาน)
        await ensureStmtCols(env);
        const delStmt = (await env.DB.prepare(`SELECT stmt_id FROM Transactions WHERE transaction_id = ?`).bind(transaction_id).first())?.stmt_id;
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id = ?`).bind(transaction_id),
          env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id = ?`).bind(transaction_id),
        ]);
        if (delStmt) await cleanupStatementHeaders(env, [delStmt]);
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
          JOIN Accounts acc ON acc.account_id = t.account_id
          JOIN UserPermissions upx ON upx.entity_id = acc.entity_id AND upx.user_id = ?
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
        const result = await env.DB.prepare(query).bind(authUserId).all();
        return new Response(JSON.stringify(result.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 7. Settlements
      if (url.pathname === '/api/settlements' && request.method === 'POST') {
        const body = await request.json();
        const { parent_detail_id, child_detail_id, settled_amount } = body;
        
        if (!parent_detail_id || !child_detail_id || !settled_amount) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        /* ทั้งรายการตั้งหนี้และรายการชำระ ต้องอยู่ในบัญชีที่ผู้ใช้มีสิทธิ์ */
        const ownDetail = async (id) => !!(await env.DB.prepare(`SELECT 1 FROM TransactionDetails d
            JOIN Transactions t ON t.transaction_id = d.transaction_id
            JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
            WHERE d.detail_id = ? AND up.user_id = ?`).bind(id, authUserId).first());
        if (!(await ownDetail(parent_detail_id)) || !(await ownDetail(child_detail_id))) return deny('ไม่พบรายการ หรือไม่มีสิทธิ์', 404);

        const settlement_id = 'STL-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        await env.DB.prepare(`
          INSERT INTO Settlements (settlement_id, parent_detail_id, child_detail_id, settled_amount)
          VALUES (?, ?, ?, ?)
        `).bind(settlement_id, parent_detail_id, child_detail_id, settled_amount).run();
        
        return new Response(JSON.stringify({ success: true, settlement_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 6. Master Data Endpoints
      if (url.pathname === '/api/account-types') {
        const types = await env.DB.prepare(`SELECT * FROM Captions WHERE family_id = ? OR family_id IS NULL ORDER BY behavior, name`).bind(await familyOf()).all();
        return new Response(JSON.stringify(types.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/categories') {
        const categories = await env.DB.prepare(`
          SELECT c.*, at.name as caption_name, at.behavior as caption_behavior 
          FROM Categories c
          JOIN Captions at ON c.caption_id = at.type_id
          WHERE c.family_id = ? OR c.family_id IS NULL
          ORDER BY at.name, c.name
        `).bind(await familyOf()).all();
        return new Response(JSON.stringify(categories.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/contacts') {
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const data = await request.json();
        await env.DB.prepare('DELETE FROM Debts WHERE debt_id=? AND family_id=?').bind(data.debt_id, userCheck.family_id).run();
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/accounts') {
        const userId = authUserId;
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
        const userId = authUserId;
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
        // ตรวจสิทธิ์บริษัท (เดิมไม่ตรวจ — ใครก็ขอดูงบทดลองของบริษัทไหนก็ได้ · แก้ 2026-10-11)
        const tbPerm = authUserId ? await env.DB.prepare(`SELECT 1 AS ok FROM UserPermissions WHERE user_id = ? AND entity_id = ?`).bind(authUserId, entityId).first() : null;
        if (!tbPerm) return new Response(JSON.stringify({ error: 'ไม่มีสิทธิ์ดูบริษัทนี้' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
        const userId = authUserId;
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

        if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
          /* ช่วงวันที่แทน strftime() เพื่อให้ใช้ดัชนีวันที่ได้ */
          const [yy, mm] = yearMonth.split('-').map(Number);
          query += ` AND t.date >= ? AND t.date < ?`;
          params.push(`${yearMonth}-01`, `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`);
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
      /* ปิดแล้ว (2026-10-11): ดึงทั้งตารางของทุกครอบครัว ไม่ตรวจสิทธิ์ และไม่มีหน้าไหนใช้
         ส่งออกข้อมูลให้ใช้ /api/export/flat หรือหน้า "รายงาน → ส่งออก" แทน */
      if (url.pathname === '/api/export') {
        return deny('ปิดใช้งานแล้ว — ใช้หน้า รายงาน → ส่งออก', 410);
      }
      if (url.pathname === '/api/export-disabled-legacy') {
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
        const userId = authUserId;
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
        const userId = authUserId;
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

        /* แก้/ลบได้เฉพาะข้อมูลของครอบครัวตัวเอง (เดิมไม่ตรวจ · แก้ 2026-10-11) */
        const OWN_SQL = {
          account: `SELECT 1 AS ok FROM Accounts a JOIN Entities e ON e.entity_id = a.entity_id WHERE a.account_id = ? AND e.family_id = ?`,
          entity: `SELECT 1 AS ok FROM Entities WHERE entity_id = ? AND family_id = ?`,
          caption: `SELECT 1 AS ok FROM Captions WHERE type_id = ? AND (family_id = ? OR family_id IS NULL)`,
          category: `SELECT 1 AS ok FROM Categories WHERE category_id = ? AND (family_id = ? OR family_id IS NULL)`,
          contact: `SELECT 1 AS ok FROM Contacts WHERE contact_id = ? AND family_id = ?`,
          project: `SELECT 1 AS ok FROM Projects WHERE project_id = ? AND family_id = ?`,
        };
        if (old_id && OWN_SQL[type] && !(await env.DB.prepare(OWN_SQL[type]).bind(old_id, userCheck.family_id).first())) {
          return new Response(JSON.stringify({ error: 'ไม่พบข้อมูลนี้ในครอบครัวของคุณ' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (type === 'account' && body_entity_id && !(await env.DB.prepare(OWN_SQL.entity).bind(body_entity_id, userCheck.family_id).first())) {
          return new Response(JSON.stringify({ error: 'ไม่พบบริษัทนี้ในครอบครัวของคุณ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck || userCheck.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = userCheck.family_id;
        const body = await request.json();
        const stats = {};

        // โหมด replace = ล้างข้อมูลครอบครัวก่อน (เก็บ Users/Families) แล้วค่อยนำเข้า
        // → กู้กลับไปสภาพเดิมเป๊ะ (ลบแถวที่ไม่มีในไฟล์ backup ด้วย)
        /* 🛡️ กันล้างข้อมูลด้วยไฟล์ที่ไม่ครบ (2026-10-11): โหมด replace ลบของเดิมก่อนแล้วค่อยใส่ใหม่
           ถ้าไฟล์ว่าง/เสีย/ไม่มีรายการ จะเหลือฐานข้อมูลว่างเปล่า → ตรวจไฟล์ก่อนลบ
           และ "กู้ซ้ำด้วยไฟล์เดิม" ปลอดภัยเสมอ (ใส่แบบแทนที่ทับของเดิม) ถ้าล้มกลางทางให้กดกู้อีกครั้ง */
        /* มีเดือนที่ปิดแล้ว → กู้ข้อมูลทับไม่ได้ (จะไปแก้ตัวเลขในเดือนที่ปิด) ให้เปิดเดือนก่อน */
        const closedAny = await env.DB.prepare(`SELECT period FROM LedgerPeriods WHERE family_id = ? AND status = 'CLOSED' LIMIT 1`).bind(fid).first().catch(() => null);
        if (closedAny) {
          return new Response(JSON.stringify({ error: `มีเดือนที่ปิดบัญชีแล้ว (${closedAny.period}) — เปิดเดือนก่อนจึงจะกู้ข้อมูลได้` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (body.mode === 'replace') {
          const nTx = Array.isArray(body.transactions) ? body.transactions.length : 0;
          const nAcc = Array.isArray(body.accounts) ? body.accounts.length : 0;
          const nEnt = Array.isArray(body.entities) ? body.entities.length : 0;
          const current = await env.DB.prepare(`SELECT COUNT(*) AS n FROM Transactions t JOIN Accounts a ON t.account_id=a.account_id JOIN Entities e ON a.entity_id=e.entity_id WHERE e.family_id=?`).bind(fid).first();
          if (!nEnt || !nAcc || (!nTx && (current?.n || 0) > 0)) {
            return new Response(JSON.stringify({ error: `ไฟล์สำรองไม่ครบ (บริษัท ${nEnt} · บัญชี ${nAcc} · รายการ ${nTx}) — ไม่ล้างข้อมูลเดิม ตรวจไฟล์แล้วลองใหม่` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          if (nTx < (current?.n || 0) * 0.5 && !body.confirm_shrink) {
            return new Response(JSON.stringify({ error: `ไฟล์มีรายการ ${nTx} แต่ในระบบมี ${current.n} — น้อยกว่าครึ่ง ถ้าตั้งใจจริงให้ยืนยันอีกครั้ง`, needs_confirm: true }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
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
        const userId = authUserId;
        const me = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!me || me.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ลบสมาชิกได้' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { user_id: target, preview } = await request.json();
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
        /* preview = ดูก่อนว่าจะลบอะไร (หน้าตั้งค่าใหม่ใช้ยืนยันกับผู้ใช้) */
        if (preview) return new Response(JSON.stringify({ preview: true, report }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        /* มีเดือนที่ปิดแล้ว → ลบข้อมูลบริษัทไม่ได้ (เดิมจะลบได้ครึ่ง ๆ เพราะข้าม error เงียบ) */
        if (soleIds.length) {
          const closedAny = await env.DB.prepare(`SELECT period FROM LedgerPeriods WHERE family_id = ? AND status = 'CLOSED' LIMIT 1`).bind(me.family_id).first().catch(() => null);
          if (closedAny) return new Response(JSON.stringify({ error: `มีเดือนที่ปิดบัญชีแล้ว (${closedAny.period}) — ลบสมาชิกที่ถือบริษัทคนเดียวไม่ได้ ต้องเปิดเดือนก่อน` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

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

      // 15.2 Reset data (Admin only) — ล้างธุรกรรม หรือ ล้างทั้งหมด (ปรับ 2026-10-12)
      //   scope = 'transactions' → ลบรายการ/บรรทัดย่อย/การตัดชำระ + เอกสารในกล่องรอเคลียร์ + statement + ทะเบียนทรัพย์สินที่มาจากรายการ (เก็บ master data)
      //   scope = 'all'          → ลบทุกอย่างของครอบครัว ยกเว้น Users + Families (+ ประวัติปิด/เปิดเดือน เก็บไว้ตรวจย้อนหลัง)
      //   preview: true → ไม่ลบ แค่บอกจำนวน · มีเดือนที่ปิดแล้ว ต้องส่ง reopen_closed: true (ระบบเปิดเดือนให้ก่อนลบ + บันทึกประวัติ)
      if (url.pathname === '/api/reset' && request.method === 'POST') {
        const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const me = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(authUserId).first();
        if (!me || me.role !== 'admin') return J({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ล้างข้อมูลได้' }, 403);
        const body = await request.json().catch(() => ({}));
        const scope = body.scope === 'all' ? 'all' : body.scope === 'transactions' ? 'transactions' : null;
        if (!scope) return J({ error: 'เลือกขอบเขตการล้าง (transactions หรือ all)' }, 400);
        const fid = me.family_id;
        const famAcc = `SELECT a.account_id FROM Accounts a JOIN Entities e ON a.entity_id = e.entity_id WHERE e.family_id = ?`;
        const cnt = async (sql) => { try { return (await env.DB.prepare(sql).bind(fid).first())?.n || 0; } catch { return 0; } };
        const closed = await (async () => { try { return ((await env.DB.prepare(`SELECT period FROM LedgerPeriods WHERE family_id = ? AND status = 'CLOSED' ORDER BY period`).bind(fid).all()).results || []).map(r => r.period); } catch { return []; } })();
        const summary = {
          scope, closed_periods: closed,
          transactions: await cnt(`SELECT COUNT(*) AS n FROM Transactions WHERE account_id IN (${famAcc})`),
          docs: await cnt(`SELECT COUNT(*) AS n FROM LedgerDocs WHERE family_id = ?`),
          statements: await cnt(`SELECT COUNT(*) AS n FROM LedgerStatements WHERE family_id = ?`),
          accounts: await cnt(`SELECT COUNT(*) AS n FROM Accounts WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id = ?)`),
          categories: await cnt(`SELECT COUNT(*) AS n FROM Categories WHERE family_id = ?`),
        };
        if (body.preview) return J({ preview: true, ...summary });
        if (body.confirm !== 'RESET') return J({ error: 'ต้องยืนยันด้วยรหัส RESET' }, 400);
        if (closed.length && body.reopen_closed !== true) return J({ error: `มี ${closed.length} เดือนที่ปิดบัญชีแล้ว — ต้องยืนยันให้ระบบเปิดเดือนก่อนล้าง`, code: 'HAS_CLOSED', closed_periods: closed }, 409);
        const now = new Date().toISOString();
        const pre = [];
        if (closed.length) {
          pre.push(...closed.map(p => [`INSERT INTO LedgerPeriodLog (log_id, family_id, period, action, user_id, note, created_at) VALUES ('PL-RESET-' || ? || '-' || ?, ?, ?, 'REOPEN', ?, ?, ?)`,
            [p, Date.now().toString(36), fid, p, authUserId, `เปิดอัตโนมัติก่อนล้างข้อมูล (${scope})`, now]]));
        }
        pre.push([`DELETE FROM LedgerPeriods WHERE family_id = ?`, [fid]]);
        // ลำดับ child-first · ทุกคำสั่ง scope ด้วย family_id
        const txSteps = [
          [`DELETE FROM Settlements WHERE parent_detail_id IN (SELECT d.detail_id FROM TransactionDetails d JOIN Transactions t ON d.transaction_id = t.transaction_id WHERE t.account_id IN (${famAcc})) OR child_detail_id IN (SELECT d.detail_id FROM TransactionDetails d JOIN Transactions t ON d.transaction_id = t.transaction_id WHERE t.account_id IN (${famAcc}))`, [fid, fid]],
          [`DELETE FROM TransactionDetails WHERE transaction_id IN (SELECT transaction_id FROM Transactions WHERE account_id IN (${famAcc}))`, [fid]],
          [`DELETE FROM Transactions WHERE account_id IN (${famAcc})`, [fid]],
          [`DELETE FROM LedgerDocLinks WHERE doc_id IN (SELECT doc_id FROM LedgerDocs WHERE family_id = ?)`, [fid]],
          [`DELETE FROM LedgerDocs WHERE family_id = ?`, [fid]],
          [`DELETE FROM LedgerStatements WHERE family_id = ?`, [fid]],
          [`DELETE FROM OpeningSets WHERE family_id = ?`, [fid]],
          [`DELETE FROM AssetItems WHERE family_id = ? AND source = 'TX'`, [fid]],
          [`UPDATE AssetItems SET status = 'ACTIVE', writeoff_date = NULL, expense_category_id = NULL, writeoff_tx = NULL, writeoff_amount = NULL, writeoff_note = NULL, account_id = NULL WHERE family_id = ?`, [fid]],
        ];
        const masterSteps = [
          [`DELETE FROM TripDocuments WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, [fid]],
          [`DELETE FROM TripBudgets   WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, [fid]],
          [`DELETE FROM TripStops     WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, [fid]],
          [`DELETE FROM TripExpenses  WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, [fid]],
          [`DELETE FROM TripWallets   WHERE project_id IN (SELECT project_id FROM Projects WHERE family_id=?)`, [fid]],
          [`DELETE FROM PlannedExpenses WHERE family_id=?`, [fid]],
          [`DELETE FROM CategoryBudgets WHERE family_id=?`, [fid]],
          [`DELETE FROM Debts     WHERE family_id=?`, [fid]],
          [`DELETE FROM AssetItems WHERE family_id=?`, [fid]],
          [`DELETE FROM AssetGroups WHERE family_id=?`, [fid]],
          [`DELETE FROM LedgerRules WHERE family_id=?`, [fid]],
          [`DELETE FROM Accounts  WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id=?)`, [fid]],
          [`DELETE FROM Categories WHERE family_id=?`, [fid]],
          [`DELETE FROM Captions   WHERE family_id=?`, [fid]],
          [`DELETE FROM Contacts   WHERE family_id=?`, [fid]],
          [`DELETE FROM Projects   WHERE family_id=?`, [fid]],
          [`DELETE FROM UserPermissions WHERE entity_id IN (SELECT entity_id FROM Entities WHERE family_id=?)`, [fid]],
          [`DELETE FROM Entities   WHERE family_id=?`, [fid]],
        ];
        const steps = [...pre, ...txSteps, ...(scope === 'all' ? masterSteps : [])];
        // รันทีละคำสั่ง · ข้ามเฉพาะกรณีตารางไม่มี (ฐานเก่า) — error อื่นหยุดทันทีและแจ้ง
        let done = 0; const skipped = [];
        for (const [sql, args] of steps) {
          try { await env.DB.prepare(sql).bind(...args).run(); done++; }
          catch (e) {
            const msg = String(e?.message || e);
            if (/no such table/i.test(msg)) { skipped.push(sql.trim().split(/\s+/)[2]); continue; }
            console.error('reset failed at', sql.slice(0, 80), msg);
            return J({ error: `ล้างข้อมูลไม่ครบ (หยุดที่ ${sql.trim().split(/\s+/)[2]}): ${msg}`, steps_done: done }, 500);
          }
        }
        return J({ success: true, ...summary, steps_done: done, skipped });
      }

      // 13.5. Settings Delete Endpoint
      if (url.pathname === '/api/settings/delete' && request.method === 'POST') {
        const userId = authUserId;
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck || userCheck.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบข้อมูลหลักได้' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await request.json();
        const { type, id } = body;

        /* ลบได้เฉพาะข้อมูลของครอบครัวตัวเอง (เดิมไม่ตรวจ · แก้ 2026-10-11) */
        const OWN_SQL = {
          account: `SELECT 1 AS ok FROM Accounts a JOIN Entities e ON e.entity_id = a.entity_id WHERE a.account_id = ? AND e.family_id = ?`,
          entity: `SELECT 1 AS ok FROM Entities WHERE entity_id = ? AND family_id = ?`,
          caption: `SELECT 1 AS ok FROM Captions WHERE type_id = ? AND (family_id = ? OR family_id IS NULL)`,
          category: `SELECT 1 AS ok FROM Categories WHERE category_id = ? AND (family_id = ? OR family_id IS NULL)`,
          contact: `SELECT 1 AS ok FROM Contacts WHERE contact_id = ? AND family_id = ?`,
          project: `SELECT 1 AS ok FROM Projects WHERE project_id = ? AND family_id = ?`,
        };
        if (type && id && OWN_SQL[type] && !(await env.DB.prepare(OWN_SQL[type]).bind(id, userCheck.family_id).first())) {
          return new Response(JSON.stringify({ error: 'ไม่พบข้อมูลนี้ในครอบครัวของคุณ' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
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
        const userId = authUserId;
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
          
          if (!user_id || !name || !email) {
            return new Response(JSON.stringify({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          /* แก้สมาชิกเดิมโดยเว้นช่องรหัสว่าง = ใช้รหัสเดิม (2026-10-07)
             เดิมหน้าจอส่ง '1234' แทนค่าว่าง → แค่เข้าไปใส่ LINE ID รหัสก็ถูกเปลี่ยนเป็น 1234 เงียบ ๆ */
          let existingPassword = null;
          if (!password) {
            const existing = await env.DB.prepare(`SELECT password FROM Users WHERE user_id = ? AND family_id = ?`)
              .bind(old_user_id || user_id, userCheck.family_id).first();
            existingPassword = existing?.password || null;
            if (!existingPassword) {
              return new Response(JSON.stringify({ error: 'สมาชิกใหม่ต้องตั้งรหัสผ่าน' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }

          /* รหัสที่มาจากฟอร์มเป็นข้อความธรรมดา ต้อง hash ก่อนเก็บเสมอ
             ถ้าหน้าจอส่งค่าที่ hash แล้วกลับมา (เช่นกรณีแก้ผู้ใช้โดยไม่เปลี่ยนรหัส)
             ต้องไม่ hash ซ้ำ ไม่งั้นรหัสเดิมจะใช้ไม่ได้ทันที */
          const storedPassword = existingPassword || (isHashed(password) ? password : await hashPassword(password));

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
            `).bind(user_id, userCheck.family_id, name, email, storedPassword, role || 'member', line_user_id || null));

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
            `).bind(user_id, userCheck.family_id, name, email, storedPassword, role || 'member', line_user_id || null));
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

      // 20. Stats: date range of available transaction data
      if (url.pathname === '/api/stats/date-range' && request.method === 'GET') {
        const userId = authUserId;
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const fid = userCheck.family_id;
        /* หาวันแรก/วันสุดท้ายทีละบัญชีด้วยดัชนี (account_id, date) = อ่านบัญชีละ 2 แถว
           จำนวนรายการนับจากดัชนี covering · เดิมสแกน ~42k แถว/ครั้ง (2026-10-11) */
        const result = await env.DB.prepare(`
          SELECT MIN(x.mn) AS min_date, MAX(x.mx) AS max_date, SUM(x.n) AS total_count FROM (
            SELECT (SELECT MIN(date) FROM Transactions WHERE account_id = a.account_id) AS mn,
                   (SELECT MAX(date) FROM Transactions WHERE account_id = a.account_id) AS mx,
                   (SELECT COUNT(*) FROM Transactions WHERE account_id = a.account_id) AS n
              FROM Accounts a JOIN Entities e ON a.entity_id = e.entity_id WHERE e.family_id = ?) x
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
        const userId = authUserId;
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await request.json();
        const { transactions, status: importStatus } = body;

        if (!Array.isArray(transactions) || transactions.length === 0) {
          return new Response(JSON.stringify({ error: 'transactions array is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const txStatus = (importStatus === 'CONFIRMED') ? 'CONFIRMED' : 'PENDING_REVIEW';
        /* สิทธิ์ (2026-10-11): ใช้ได้เฉพาะบัญชีของผู้ใช้ และห้ามเขียนทับรายการของบัญชีอื่น */
        const myAccounts = new Set(((await env.DB.prepare(`SELECT a.account_id FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id WHERE up.user_id = ?`).bind(userId).all()).results || []).map(r => r.account_id));
        const givenIds = [...new Set(transactions.map(t => t && t.transaction_id).filter(Boolean))];
        const foreignIds = new Set(), closedIds = new Set();
        /* จำผลต่อ บัญชี+เดือน — นำเข้าหลายพันแถวจะไม่ยิงคำถามซ้ำ (เพดาน 1,000 คำสั่งต่อครั้ง) */
        const closedMemo = new Map();
        const monthClosed = async (acc, d) => { const k = acc + '|' + String(d || '').slice(0, 7); if (!closedMemo.has(k)) closedMemo.set(k, await isMonthClosed(env, acc, d)); return closedMemo.get(k); };
        for (let i = 0; i < givenIds.length; i += 90) {
          const part = givenIds.slice(i, i + 90);
          const rows = (await env.DB.prepare(`SELECT transaction_id, account_id, date FROM Transactions WHERE transaction_id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results || [];
          for (const r of rows) {
            if (!myAccounts.has(r.account_id)) foreignIds.add(r.transaction_id);
            else if (await monthClosed(r.account_id, r.date)) closedIds.add(r.transaction_id);
          }
        }
        const savedIds = [];
        const errorList = [];
        const stmts = [];

        for (const tx of transactions) {
          const { transaction_id, account_id, date, total_amount, statement_desc, details } = tx;

          if (!account_id || !date || total_amount === undefined || !Array.isArray(details) || details.length === 0) {
            errorList.push({ transaction_id: transaction_id || '?', error: 'Missing required fields (account_id/date/total_amount/details)' });
            continue;
          }

          if (!myAccounts.has(account_id) || (transaction_id && foreignIds.has(transaction_id))) {
            errorList.push({ transaction_id: transaction_id || '?', error: 'ไม่มีสิทธิ์ใช้บัญชีหรือรายการนี้' });
            continue;
          }
          if (await monthClosed(account_id, date) || (transaction_id && closedIds.has(transaction_id))) {
            errorList.push({ transaction_id: transaction_id || '?', error: PERIOD_CLOSED_MSG });
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
        const userId = authUserId;
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
              AND t.date >= ? AND t.date < ?
              AND ${direction === 'withheld' ? 'd.amount < 0' : 'd.amount >= 0'}
            ORDER BY t.date DESC`
        ).bind(...allowed, `${month}-01`, (() => { const [yy, mm] = month.split('-').map(Number); return `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`; })()).all();

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
        const userId = authUserId;
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const u = await env.DB.prepare(`SELECT family_id, role FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!u) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const fid    = u.family_id;
        /* ช่วงเวลา (2026-09-08 · North: "หน้านี้ไม่แสดงผลลัพธ์")
           เดิมดูได้ทีละเดือนเท่านั้น และเริ่มที่เดือนปัจจุบันเสมอ — ข้อมูลจริงที่นำเข้า
           จบที่ พ.ย. 2025 หน้าแรกจึงว่างเปล่าทั้งที่มีรายการ 14,143 รายการ
           · period = month (ค่าเริ่มต้น) | year | all
           · month=latest → เดือนล่าสุดที่มีรายการจริง (ใช้ตอนเปิดหน้าครั้งแรก) */
        const period = ['month', 'year', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'month';
        let   month  = url.searchParams.get('month') || new Date().toISOString().substring(0, 7); // YYYY-MM
        // ตัวกรองหลัก = Member (สมาชิก) ไม่ใช่ Company (ประกาศไว้ตรงนี้ก่อน เพราะ scope ใช้หา latest)
        const member = url.searchParams.get('member') || url.searchParams.get('entity') || 'ALL';
        //   Member ↔ Company เป็น many-to-many ผ่าน UserPermissions
        //   1 สมาชิกเป็นเจ้าของหลายบริษัท หรือหลายสมาชิกร่วมกันเป็นเจ้าของบริษัทเดียวได้

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
        /* รวมยอด/วันล่าสุด/จำนวน ด้วยการอ่าน Transactions รอบเดียว (GROUP BY) แทน subquery ต่อบัญชี 3 ชุด */
        const accounts = await env.DB.prepare(
          `SELECT a.account_id, a.name, a.bank_name,
                  ROUND(COALESCE(s.bal, 0), 2) AS balance,
                  IFNULL(a.account_type,'BANK') AS account_type,
                  IFNULL(a.credit_limit,0)      AS credit_limit,
                  a.statement_day, a.due_day,
                  a.entity_id, e.name AS entity_name,
                  substr(s.last_date, 1, 10) AS last_date, substr(s.first_date, 1, 10) AS first_date,
                  IFNULL(s.n, 0) AS tx_count
             FROM Accounts a
             LEFT JOIN Entities e ON a.entity_id = e.entity_id
             LEFT JOIN (SELECT t.account_id, SUM(t.total_amount) AS bal, MIN(t.date) AS first_date, MAX(t.date) AS last_date, COUNT(*) AS n
                          FROM Transactions t
                         WHERE t.status = 'CONFIRMED' AND t.account_id IN (SELECT account_id FROM Accounts WHERE entity_id IN (${ph}))
                         GROUP BY t.account_id) s
                    ON s.account_id = a.account_id
            WHERE a.entity_id IN (${ph})`
        ).bind(...scope, ...scope).all();

        // ── 0) ช่วงข้อมูลที่มีจริง — คำนวณจากผลรวมรายบัญชีข้างบน ไม่ต้องอ่านตารางซ้ำ (2026-10-11) ──
        const accRows = accounts.results || [];
        const firsts = accRows.map(r => r.first_date).filter(Boolean).sort();
        const lasts  = accRows.map(r => r.last_date).filter(Boolean).sort();
        const range = { first_date: firsts[0] || null, last_date: lasts[lasts.length - 1] || null,
                        count: accRows.reduce((n, r) => n + (r.tx_count || 0), 0) };
        if (month === 'latest') month = range.last_date ? range.last_date.substring(0, 7) : new Date().toISOString().substring(0, 7);
        const year = month.substring(0, 4);
        // dateWhere/dateArgs ใช้กับทุก query ที่จำกัดช่วงเวลา
        /* ใช้ช่วง >= / < แทน substr() เพื่อให้ idx_transactions_date ทำงาน — substr() บังคับสแกนทั้งตาราง
           (14k แถวต่อ query × หลาย query ต่อการเปิดหน้า = ฟรีเทียร์ D1 เต็มใน 1 วัน · 2026-09-08) */
        const nextMonth = (() => { const [yy, mm] = month.split('-').map(Number); return `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}`; })();
        const dateWhere = period === 'all' ? '' : ' AND t.date >= ? AND t.date < ?';
        const dateArgs  = period === 'all' ? [] : (period === 'year' ? [`${year}-01-01`, `${Number(year) + 1}-01-01`] : [`${month}-01`, `${nextMonth}-01`]);


        // ── 2) รายการในเดือนที่เลือก (แยกตาม behavior) ──
        // entity_id/entity_name = Company (Owner) ผู้รับรายได้/ค่าใช้จ่าย
        // user_id/user_name     = สมาชิกที่บันทึกรายการ (Transactions.created_by_user_id) — ใช้แสดง "ใครทำรายการ"
        const detailRows = await env.DB.prepare(
          `SELECT t.transaction_id, t.date, t.statement_desc,
                  d.detail_id, d.amount, d.fee, d.wht, d.note,
                  d.category_id, c.name AS category_name,
                  cp.behavior, cp.sub_behavior, d.type AS dtype,
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
              AND t.status = 'CONFIRMED'${dateWhere}`
        ).bind(...scope, ...dateArgs).all();

        /* จัดฝั่งรับ/จ่าย: ดู d.type ก่อน (INCOME · EXPENSE · TRANSFER · CREDIT_AR · DEBIT_AR)
           เดิมดูแค่ Caption behavior → เงินโอนระหว่างบัญชี ยอดยกมา บัญชีพัก (Caption Asset)
           ถูกนับเป็น "รายรับ" ทั้งหมด และเงินกู้ (Liability) ถูกนับเป็น "รายจ่าย"
           ข้อมูลจริงมีรายการโอน 2,462 แถว — ถ้าไม่แยก ตัวเลขรายรับจะบวมหลายล้าน
           แถวเก่าที่ไม่มี type ยังใช้กติกาเดิม (behavior) เหมือนเดิม */
        const income = [], expense = [], investment = [];
        const assetCats = await assetCategorySet(env, fid);   // หมวดทะเบียนทรัพย์สิน: ซื้อ ≠ รายจ่าย (2026-10-12)
        for (const r of detailRows.results) {
          if (assetCats.has(r.category_id)) continue;
          const isInv = r.sub_behavior === 'INVESTMENT';
          const typ = String(r.dtype || '').toUpperCase();
          const row = {
            detail_id: r.detail_id, date: r.date, amount: r.amount,
            title: r.note || r.category_name || r.statement_desc || '-',
            category_id: r.category_id, category_name: r.category_name,
            entity_id: r.entity_id, entity_name: r.entity_name,
            contact_name: r.contact_name,
            user_id: r.user_id, user_name: r.user_name || '-'
          };
          if (isInv) investment.push(row);
          else if (typ === 'INCOME' || typ === 'CREDIT_AR') income.push(row);
          else if (typ === 'EXPENSE' || typ === 'DEBIT_AR') expense.push(row);
          else if (typ === 'TRANSFER') continue;                 // โอน/ยกมา/บัญชีพัก/กู้-คืน ไม่ใช่รับหรือจ่าย
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
            WHERE t.status = 'CONFIRMED'${dateWhere}
              AND cp.behavior IN ('EXPENSE','LIABILITY')
              AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'
              AND IFNULL(d.type,'') NOT IN ('TRANSFER','INCOME','CREDIT_AR')
              AND NOT ${IS_ASSET_SQL('d')}
              AND c.family_id = ?
            GROUP BY d.category_id`
        ).bind(...dateArgs, fid).all();

        const budgetRows = period === 'all' ? { results: [] } : await env.DB.prepare(
          period === 'year'
            ? `SELECT category_id, SUM(amount) AS budget FROM CategoryBudgets
                WHERE family_id = ? AND period_type='YEARLY' AND period = ? GROUP BY category_id`
            : `SELECT category_id, SUM(amount) AS budget FROM CategoryBudgets
                WHERE family_id = ? AND ((period_type='MONTHLY' AND period = ?) OR (period_type='YEARLY' AND period = ?))
                GROUP BY category_id`
        ).bind(...(period === 'year' ? [fid, year] : [fid, month, year])).all().catch(() => ({ results: [] }));

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
             FROM Captions cp
             CROSS JOIN Categories c ON c.caption_id = cp.type_id
             CROSS JOIN TransactionDetails d ON d.category_id = c.category_id   -- เริ่มจากหมวดลูกหนี้/เจ้าหนี้ (idx_td_category)
             JOIN Transactions t ON d.transaction_id = t.transaction_id
             JOIN Accounts a     ON t.account_id = a.account_id
             LEFT JOIN Contacts co ON d.contact_id = co.contact_id
             LEFT JOIN Entities e  ON d.entity_id  = e.entity_id
            WHERE a.entity_id IN (${ph})
              AND t.status = 'CONFIRMED'
              AND cp.behavior IN ('ASSET','LIABILITY')
              AND IFNULL(cp.sub_behavior,'') != 'INVESTMENT'
              AND NOT (cp.behavior = 'ASSET' AND IFNULL(d.type,'') = 'TRANSFER')
              AND NOT ${IS_ASSET_SQL('d')}
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
              AND t.date >= ? AND t.date < ?
            ORDER BY t.date DESC`
        ).bind(...scope, `${year}-01-01`, `${Number(year) + 1}-01-01`).all();

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
          month, period, range, member,
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
      return dbErrorResponse(err, corsHeaders);
    }
  }
};

/* แปลง error เป็นข้อความที่หน้าเว็บแสดงได้ · ไม่ส่ง stack (เผยโครงสร้างโค้ด)
   D1 เกินโควตา/ล่ม → 503 พร้อมบอกให้ลองใหม่ แทน 500 ที่ดูเหมือนโปรแกรมพัง */
function dbErrorResponse(err, corsHeaders) {
  const msg = String(err?.message || err || '');
  if (isPeriodClosedError(msg)) {
    return new Response(JSON.stringify({ error: PERIOD_CLOSED_MSG, code: 'PERIOD_CLOSED' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  console.error('API error:', msg, err?.stack);
  /* เฉพาะอาการ "ฐานข้อมูลไม่พร้อม" จริง ๆ — error อื่นของ D1 (เช่น constraint) ไม่นับเป็น 503 */
  const quota = /quota|exceeded|rows? (read|written)|overloaded|network connection lost|timed? ?out|storage operation|reset because its code was updated/i.test(msg);
  return new Response(JSON.stringify({
    error: quota ? 'ฐานข้อมูลไม่พร้อมชั่วคราว (โควตาเต็มหรือระบบหนาแน่น) กรุณาลองใหม่อีกครั้ง' : (msg || 'เกิดข้อผิดพลาด'),
    code: quota ? 'DB_UNAVAILABLE' : 'SERVER_ERROR'
  }), { status: quota ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/* คีย์ของข้อความธนาคาร: ตัดเลขบัญชี/เลขอ้างอิง/วันที่/สัญลักษณ์ → เหลือชื่อร้าน/คู่โอน (ใช้คู่กับ statementKey ใน app.js) */
function statementKey(desc) {
  const k = String(desc || '').toLowerCase().replace(/[x*]{2,}/g, ' ').replace(/[0-9]+/g, ' ').replace(/[^a-z\u0e00-\u0e7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return k.length >= 3 ? k : null;
}

async function runGeminiStatement(pdfBase64, imagesBase64, env) {
  const apiKey = env?.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on Cloudflare Workers.');
  }

  /* 2026-10-15 (North): นอกจาก statement ธนาคาร ต้องอ่าน ใบแจ้งยอดบัตรเครดิต · ภาพแคปประวัติกระเป๋าเงิน (TrueMoney, ShopeePay, Rabbit LINE Pay)
     · ภาพแคปรายการสั่งซื้อ Shopee/Lazada ได้ด้วย — ทุกแบบออกมาเป็น "รายการเงินเข้า/ออกของบัญชีนั้น" ชุดเดียวกัน */
  const year = new Date(Date.now() + 7 * 3600e3).getUTCFullYear();
  const prompt = `You are an expert Thai financial assistant.
The input is ONE of: a bank statement, a credit card statement (ใบแจ้งยอดบัตรเครดิต), screenshots of an e-wallet history
(TrueMoney Wallet, ShopeePay, Rabbit LINE Pay, K PLUS / mobile banking history), or screenshots of an online shop order list (Shopee, Lazada).
It may be a PDF file or several page images/screenshots of the same account. Extract EVERY money movement row (no summary/total rows) and the account number.

- account_number: the account / card / wallet number printed (masked like "xxxx-xxxx-xxxx-1234" or a phone number for wallets). null if none.
- source_kind: "BANK" | "CREDIT_CARD" | "E_WALLET" | "SHOP_ORDERS"
- opening_balance: the balance brought forward printed at the start (ยอดยกมา / Previous balance / ยอดค้างชำระงวดก่อน), null if not printed.
- closing_balance: the ending balance printed (ยอดยกไป / ยอดคงเหลือ / New balance / ยอดที่ต้องชำระ), null if not printed. Use positive numbers (amount owed on a card is positive).
- transactions: for each row:
  1. date: YYYY-MM-DD. Convert Buddhist year (2569 or 69) to Christian (2026). If the screenshot shows no year, use ${year} (or ${year - 1} if that date would be in the future).
  2. time: HH:MM:SS, "00:00:00" if not shown.
  3. type: "EXPENSE" for money leaving this account/card/wallet (purchase, payment to merchant, transfer out, withdrawal, fee, top-up spent, Shopee order paid);
     "INCOME" for money coming in (deposit, salary, refund, cashback, top-up INTO the wallet, credit card payment received / ชำระบัตร).
  4. amount: positive number.
  5. ref_code: reference / order number / transaction id if shown, else null.
  6. statement_desc: merchant / counterparty / description as printed (e.g. "Shopee", "7-Eleven", "เติมเงินจาก KBank", "TR to 123456").
  7. note: product name(s) for shop orders or other short memo, else null.
  8. balance: the running balance printed on that same row (ยอดคงเหลือ / Balance) exactly as printed, positive number; null if the row has no balance column (most credit cards, shop orders).
Ignore rows that are opening balance, closing balance, totals, minimum payment, credit limit, or cancelled/failed orders.

Output ONLY a valid JSON object:
{"account_number":"...","source_kind":"BANK","opening_balance":null,"closing_balance":null,"transactions":[{"date":"YYYY-MM-DD","time":"HH:MM:SS","type":"INCOME","amount":123.45,"ref_code":null,"statement_desc":"...","note":null,"balance":null}]}
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

  // AI ไม่ว่าง (503/429) → ลองซ้ำ แล้วสลับรุ่นสำรองอัตโนมัติ (geminiGenerate · 2026-10-12)
  const response = await geminiGenerate(env, env.GEMINI_MODEL || 'gemini-3.1-flash-lite', {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const resData = await response.json();
  const textResult = resData.candidates[0].content.parts[0].text;
  return JSON.parse(textResult.trim());
}

async function runGeminiOCR(imageBase64, env) {
  const apiKey = env?.GEMINI_API_KEY;
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

  // AI ไม่ว่าง (503/429) → ลองซ้ำ แล้วสลับรุ่นสำรองอัตโนมัติ (geminiGenerate · 2026-10-12)
  const response = await geminiGenerate(env, env.GEMINI_MODEL || 'gemini-3.1-flash-lite', {
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
    });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const resData = await response.json();
  const textResult = resData.candidates[0].content.parts[0].text;
  return JSON.parse(textResult.trim());
}

// ==========================================
// 💬 LINE BOT WEBHOOK HANDLER
// ==========================================
/* คำสั่งสรุปทาง LINE (วันนี้ · เมื่อวาน · รายวัน · อื่น ๆ = สรุปเดือน)
   ส่วนรับสลิป/จดเงินสดย้ายไป ledger-inbox.js แล้ว (2026-10-07) — ที่นี่เหลือแค่สรุป */
async function lineSummaryReply(event, user, env) {
  const replyToken = event.replyToken;
  const lowerText = String(event.message?.text || '').trim().toLowerCase();
  const tzOffset = 7 * 60 * 60 * 1000; // Bangkok time
  const todayStr = new Date(Date.now() + tzOffset).toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() + tzOffset - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  {
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
  
  /* แยกรับ/จ่ายด้วย d.type แบบเดียวกับแดชบอร์ด (2026-10-08)
     เดิมอ้าง cp.behavior โดยไม่ได้ JOIN Captions → "no such column cp.behavior" ทุกครั้ง
     · รายจ่ายเก็บเป็นลบ จึงกลับเครื่องหมาย · โอนระหว่างบัญชี/ลูกหนี้ไม่นับ */
  const [yy, mm] = currentMonthStr.split('-').map(Number);
  const nextMonthStr = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, '0')}`;
  const query = `
    SELECT
      SUM(CASE WHEN d.type = 'INCOME' THEN d.amount ELSE 0 END) as income,
      SUM(CASE WHEN d.type = 'EXPENSE' THEN -d.amount ELSE 0 END) as expense
    FROM Transactions t
    JOIN Accounts a ON t.account_id = a.account_id
    JOIN UserPermissions up ON a.entity_id = up.entity_id
    JOIN TransactionDetails d ON t.transaction_id = d.transaction_id
    WHERE up.user_id = ?
      AND t.date >= ? AND t.date < ?
      AND t.status = 'CONFIRMED'
  `;
  const result = await env.DB.prepare(query).bind(user.user_id, `${currentMonthStr}-01`, `${nextMonthStr}-01`).first();
  
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
                uri: env.WEB_APP_URL || "https://record-revenue-web.pages.dev"
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
      t.time,
      d.amount,
      d.type,
      d.note,
      c.name as category_name
    FROM Transactions t
    JOIN Accounts a ON t.account_id = a.account_id
    JOIN UserPermissions up ON a.entity_id = up.entity_id
    JOIN TransactionDetails d ON t.transaction_id = d.transaction_id
    LEFT JOIN Categories c ON d.category_id = c.category_id
    WHERE up.user_id = ?
      AND t.date >= ? AND t.date < ?
      AND t.status = 'CONFIRMED'
    ORDER BY t.date ASC, t.time ASC, t.created_at ASC
  `;
  const nextDay = new Date(Date.parse(dateStr) + 864e5).toISOString().slice(0, 10);
  const result = await env.DB.prepare(query).bind(userId, dateStr, nextDay).all();
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
    // เวลาอยู่ในช่อง time (ของใหม่) หรือต่อท้ายวันที่ (ของเก่า)
    const timePart = (tx.time || (tx.date.includes(' ') ? tx.date.split(' ')[1] : '') || '').substring(0, 5);
    const timeDisplay = timePart ? `[${timePart}] ` : '';

    const amountVal = Math.abs(tx.amount);
    const line = `- ${timeDisplay}${tx.account_name}: ${amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿ (${tx.note || '-'} - หมวด ${tx.category_name || '-'})\n`;

    // แยกด้วยชนิดของบรรทัดย่อย (เดิมอ้าง tx.details ที่ไม่มีอยู่จริง → พังทุกครั้ง)
    if (tx.type === 'INCOME') {
      incomeText += line;
      totalIncome += tx.amount;
    } else if (tx.type === 'EXPENSE') {
      expenseText += line;
      totalExpense += -tx.amount;
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
      SUM(CASE WHEN d.type = 'INCOME' THEN d.amount ELSE 0 END) as income,
      SUM(CASE WHEN d.type = 'EXPENSE' THEN -d.amount ELSE 0 END) as expense
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
