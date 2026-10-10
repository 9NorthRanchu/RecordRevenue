// ═══════════════════════════════════════════════════════════════
// กล่องรับเอกสารของสมุดจด (Inbox) + LINE Bot รุ่นใหม่ — ระยะ 1 (2026-10-07)
//
//   ทุกหลักฐาน (สลิป ใบเสร็จ order ข้อความเงินสด) เข้าทางเดียว:
//     เก็บไฟล์ → AI อ่าน → หาบัญชีของเรา → จับคู่รายการเดิมก่อน → ไม่เจอค่อยสร้างใหม่
//   หลักฐานไม่เคยสร้างรายการซ้ำ: สลิปที่มาก่อน statement จะถูก statement จับคู่ทีหลัง (ระยะ 2)
//
//   POST /api/line-webhook                   — LINE (ตรวจลายเซ็นเมื่อตั้ง LINE_CHANNEL_SECRET)
//   GET  /api/inbox?status=open|all          — รายการเอกสาร + รายการเงินที่ผูกอยู่
//   POST /api/inbox/upload                   — multipart field "file" (หลายไฟล์ได้) · account_id/side ไม่บังคับ
//   POST /api/inbox/cash                     — { text } หรือ { amount, note, account_id }
//   GET  /api/inbox/file/{doc_id}            — ไฟล์ต้นฉบับ (ต้องล็อกอิน · ครอบครัวเดียวกันเท่านั้น)
//   POST /api/inbox/{doc_id}/accept          — ยืนยัน (แก้บรรทัดย่อยได้ด้วย { details })
//   POST /api/inbox/{doc_id}/link            — { transaction_id } ผูกกับรายการเดิมที่เลือก
//   POST /api/inbox/{doc_id}/account         — { account_id, side: 'OUT'|'IN' } บอกว่าบัญชีไหนของเรา
//   POST /api/inbox/{doc_id}/dismiss         — ไม่ต้องบันทึก
//   POST /api/inbox/{doc_id}/edit            — { date, account_id, details[], confirm } แก้/แตกบรรทัดจากหน้ากล่องรอเคลียร์
//   GET  /api/inbox/meta                     — บัญชี/บริษัท/หมวด/คู่ค้าที่ใช้ได้ (สำหรับหน้าเว็บ)
//   POST /api/inbox/manual                   — { date, time?, account_id, amount (เข้า + / ออก −), note } เพิ่มรายการเอง → รอยืนยัน
//   ── ระยะ 2: statement ──
//   POST /api/inbox/statement                — multipart: account_id + file (รูปหน้า statement หลายรูป)
//   GET  /api/inbox/statements               — statement ที่นำเข้าแล้ว
//   GET  /api/inbox/statements/{id}          — บรรทัด + สถานะจับคู่ + รายการที่มีในระบบแต่ไม่มีใน statement + ยอดเทียบ
//   POST /api/inbox/statements/{id}/create   — { line_ids? } สร้างรายการรอยืนยันจากบรรทัดที่ยังไม่มีในระบบ
//   POST /api/inbox/statements/{id}/line/{line_id} — { action: match|ignore|reset, transaction_id }
//   POST /api/inbox/statements/{id}/delete   — ลบ statement (ไม่ลบรายการที่สร้างไปแล้ว)
//
//   ตาราง (setup-db.sh): LedgerDocs · LedgerDocLinks · LedgerRules
//   ไฟล์อยู่ใน R2 (binding ICONS) ใต้ ledger-docs/ — serveIcon ของทริปปฏิเสธ prefix นี้แล้ว
//   ⚠️ Transactions.source/status ในฐานจริงมี CHECK — ใช้ได้แค่ค่าเดิม:
//      source: LINE_SLIP · LINE_TEXT · PDF_IMPORT · WEB_GRID · status: PENDING_REVIEW · CONFIRMED
// ═══════════════════════════════════════════════════════════════
import {
  round2, bankKey, last4, accountHintKey, partyKey, parseCashText, slipDirection,
  scoreCandidate, decideMatch, balanceGap, proposeLines, templateFromDetails,
  fixStatementSigns, statementPartyKey, matchStatementLines,
} from './ledger-match.js';
import {
  displayName, moneyText, thaiDate, txCard, flexMessage, confirmButtons, accountButtons, categoryQuickItems, postback,
} from './ledger-line-ui.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
const OPEN_STATUSES = ['READING', 'NEEDS_ACCOUNT', 'NEEDS_CHOICE', 'SUGGESTED', 'STORED', 'ERROR'];
const UNCATEGORIZED = 'Cat_Uncategorized';
const TRANSFER_CATEGORY = 'Bank_Transfer';
const SUMMARY_WORDS = /^(สรุป|ยอด|วันนี้|เมื่อวาน|รายวัน|เดือน|today|yesterday|daily|month|help|เมนู)/i;

const json = (data, cors, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const newId = prefix => `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parse = (s, fallback = null) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const nowIso = () => new Date().toISOString();
const bangkokNow = () => new Date(Date.now() + 7 * 3600e3).toISOString();   // YYYY-MM-DDTHH:MM:SS (เวลาไทย)

// ───────────────────────── entry ─────────────────────────
export async function handleLedgerInbox(request, env, url, cors, userId, hooks = {}) {
  const path = url.pathname;
  if (path === '/api/line-webhook' && request.method === 'POST') return handleLineWebhook(request, env, { ...hooks, origin: url.origin });

  // หน้าแก้ไขด่วนที่เปิดจากปุ่มใน LINE — ไม่ต้องล็อกอิน ใช้ลิงก์ที่ระบบเซ็นไว้ต่อเอกสาร (อายุ 14 วัน)
  const quick = path.match(/^\/api\/inbox\/quick\/([\w-]+)(\/file)?$/);
  if (quick) return handleQuick(request, env, url, cors, quick[1], !!quick[2]);
  if (path !== '/api/inbox' && !path.startsWith('/api/inbox/')) return null;

  const user = userId ? await env.DB.prepare(`SELECT * FROM Users WHERE user_id=?`).bind(userId).first() : null;
  if (!user) return json({ error: 'กรุณาเข้าสู่ระบบ' }, cors, 401);

  try {
    if (path === '/api/inbox' && request.method === 'GET') return json(await listInbox(env, user, url), cors);

    if (path === '/api/inbox/upload' && request.method === 'POST') {
      let form;
      try { form = await request.formData(); } catch { return json({ error: 'อ่านไฟล์ที่อัปโหลดไม่สำเร็จ' }, cors, 400); }
      const files = form.getAll('file').filter(f => f && typeof f !== 'string');
      if (!files.length) return json({ error: 'ไม่พบไฟล์ (field "file")' }, cors, 400);
      const forced = form.get('account_id')
        ? { account_id: String(form.get('account_id')), side: String(form.get('side') || 'OUT') } : null;
      const results = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        results.push(await ingestFile(env, user, { bytes, mime: file.type, name: file.name, source: 'WEB', forced }));
      }
      return json({ results }, cors, 201);
    }

    if (path === '/api/inbox/cash' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const out = await recordCash(env, user, body, 'WEB');
      return json(out, cors, out.error ? 400 : 201);
    }

    const fileMatch = path.match(/^\/api\/inbox\/file\/([\w-]+)$/);
    if (fileMatch && request.method === 'GET') return serveDocFile(env, user, fileMatch[1], cors);

    const retry = path.match(/^\/api\/inbox\/([\w-]+)\/retry$/);
    if (retry && request.method === 'POST') {
      const out = await retryDoc(env, user, retry[1]);
      return json(out, cors, out.error ? (out.status || 400) : 200);
    }

    if (path === '/api/inbox/meta' && request.method === 'GET') return json(await inboxMeta(env, user), cors);
    if (path === '/api/inbox/manual' && request.method === 'POST') {
      const out = await createManual(env, user, await request.json().catch(() => ({})));
      return json(out, cors, out.error ? (out.status || 400) : 201);
    }

    if (path === '/api/inbox/statement' && request.method === 'POST') {
      let form;
      try { form = await request.formData(); } catch { return json({ error: 'อ่านไฟล์ที่อัปโหลดไม่สำเร็จ' }, cors, 400); }
      const files = form.getAll('file').filter(f => f && typeof f !== 'string');
      const out = await importStatement(env, user, {
        account_id: String(form.get('account_id') || ''), file_name: String(form.get('file_name') || files[0]?.name || ''),
        files: await Promise.all(files.map(async f => ({ bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || 'image/jpeg' }))),
      });
      return json(out, cors, out.error ? (out.status || 400) : 201);
    }
    if (path === '/api/inbox/statements' && request.method === 'GET') return json(await listStatements(env, user), cors);
    const stmt = path.match(/^\/api\/inbox\/statements\/([\w-]+)(?:\/(create|delete|line)(?:\/([\w-]+))?)?$/);
    if (stmt) {
      const [, stmtId, sub, lineId] = stmt;
      let out;
      if (!sub && request.method === 'GET') out = await statementView(env, user, stmtId);
      else if (sub === 'create' && request.method === 'POST') out = await createFromStatement(env, user, stmtId, await request.json().catch(() => ({})));
      else if (sub === 'delete' && request.method === 'POST') out = await deleteStatement(env, user, stmtId);
      else if (sub === 'line' && lineId && request.method === 'POST') out = await statementLineAction(env, user, stmtId, lineId, await request.json().catch(() => ({})));
      else return json({ error: 'Not Found' }, cors, 404);
      return json(out, cors, out.error ? (out.status || 400) : 200);
    }

    const edit = path.match(/^\/api\/inbox\/([\w-]+)\/edit$/);
    if (edit && request.method === 'POST') {
      const out = await editDoc(env, user, edit[1], await request.json().catch(() => ({})));
      return json(out, cors, out.error ? (out.status || 400) : 200);
    }

    const act = path.match(/^\/api\/inbox\/([\w-]+)\/(accept|link|account|dismiss)$/);
    if (act && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const out = await runAction(env, user, act[1], act[2], body);
      return json(out, cors, out.error ? (out.status || 400) : 200);
    }
    return json({ error: 'Not Found' }, cors, 404);
  } catch (err) {
    return json({ error: err.message }, cors, 500);
  }
}

// ───────────────────────── ข้อมูลพื้นฐาน ─────────────────────────
async function permittedAccounts(env, user) {
  const rows = await env.DB.prepare(`
    SELECT a.account_id, a.name, a.bank_name, a.account_number, a.entity_id, a.account_type, a.pdf_password
    FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id
    WHERE up.user_id = ? ORDER BY a.account_id`).bind(user.user_id).all();
  return rows.results || [];
}

async function loadRules(env, familyId, kind) {
  const rows = await env.DB.prepare(`SELECT rkey, value, hits FROM LedgerRules WHERE family_id=? AND kind=?`).bind(familyId, kind).all();
  const map = new Map();
  for (const r of rows.results || []) map.set(r.rkey, { value: parse(r.value, r.value), hits: r.hits });
  return map;
}
async function getRule(env, familyId, kind, rkey) {
  if (!rkey) return null;
  const r = await env.DB.prepare(`SELECT value, hits FROM LedgerRules WHERE family_id=? AND kind=? AND rkey=?`)
    .bind(familyId, kind, rkey).first();
  return r ? { value: parse(r.value, r.value), hits: r.hits } : null;
}
async function saveRule(env, familyId, kind, rkey, value) {
  if (!rkey) return;
  await env.DB.prepare(`
    INSERT INTO LedgerRules (rule_id, family_id, kind, rkey, value, hits, updated_at) VALUES (?,?,?,?,?,1,?)
    ON CONFLICT(family_id, kind, rkey) DO UPDATE SET value=excluded.value, hits=LedgerRules.hits+1, updated_at=excluded.updated_at`)
    .bind(newId('RULE'), familyId, kind, rkey, typeof value === 'string' ? value : JSON.stringify(value), nowIso()).run();
}

/* บัญชีของเราฝั่งนี้ของสลิปคือบัญชีไหน
   1) กฎที่จำไว้ (ธนาคาร + เลขท้าย 4 ตัวที่เห็นบนสลิป → บัญชี) — เรียนจากตอนที่คนเลือกให้ครั้งแรก
   2) เลขบัญชีในหน้าตั้งค่าบัญชี (ถ้ากรอกไว้) ตรงทั้งธนาคารและเลขท้าย */
function resolveSideAccount(side, accounts, accountRules) {
  if (!side) return null;
  const key = accountHintKey(side.bank, side.account);
  if (key && accountRules.has(key)) {
    const id = accountRules.get(key).value;
    if (accounts.some(a => a.account_id === id)) return id;
  }
  const b = bankKey(side.bank), l = last4(side.account);
  if (!b || !l) return null;
  const hits = accounts.filter(a => last4(a.account_number) === l && bankKey(a.bank_name) === b);
  return hits.length === 1 ? hits[0].account_id : null;
}

// ───────────────────────── รับไฟล์ ─────────────────────────
async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* แปลงเป็น base64 ทีละก้อน 32 KB — แบบวนทีละไบต์ของเดิมกิน CPU มาก (Workers ฟรีมีเพดาน CPU) */
function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export async function ingestFile(env, user, { bytes, mime, name, source, forced }) {
  mime = String(mime || '').split(';')[0].trim().toLowerCase() || 'image/jpeg';
  if (!MIME_EXT[mime]) return { error: `ยังไม่รองรับไฟล์ชนิด ${mime} (รับ JPG · PNG · WEBP · HEIC · PDF)` };
  if (bytes.length > MAX_FILE_BYTES) return { error: 'ไฟล์ใหญ่เกิน 15 MB' };

  // ไฟล์เดิมเป๊ะส่งซ้ำ (กดส่งสองรอบ / ส่งทั้งใน LINE และเว็บ) → ไม่บันทึกซ้ำ
  const hash = await sha256Hex(bytes);
  const dup = await env.DB.prepare(`SELECT * FROM LedgerDocs WHERE family_id=? AND file_hash=? LIMIT 1`).bind(user.family_id, hash).first();
  // ส่งรูปเดิมซ้ำเพราะครั้งก่อนค้าง/อ่านไม่สำเร็จ → อ่านใหม่ให้เลย แทนที่จะตอบว่า "เคยส่งแล้ว"
  if (dup && ['READING', 'ERROR'].includes(dup.status) && dup.file_key) return retryDoc(env, user, dup.doc_id);
  if (dup) return { duplicate: true, doc: publicDoc(dup) };

  const docId = newId('DOC');
  const fileKey = `ledger-docs/${user.family_id}/${docId}.${MIME_EXT[mime]}`;
  if (env.ICONS) await env.ICONS.put(fileKey, bytes, { httpMetadata: { contentType: mime } });
  await env.DB.prepare(`
    INSERT INTO LedgerDocs (doc_id, family_id, uploaded_by, source, file_key, file_hash, mime, file_name, status, created_at)
    VALUES (?,?,?,?,?,?,?,?, 'READING', ?)`)
    .bind(docId, user.family_id, user.user_id, source, env.ICONS ? fileKey : null, hash, mime, name || null, nowIso()).run();

  let extracted;
  try {
    extracted = await extractDocument(env, bytes, mime);
  } catch (err) {
    await setDoc(env, docId, { status: 'ERROR', error: String(err.message).slice(0, 500) });
    return { doc: publicDoc(await getDoc(env, user, docId)), outcome: 'ERROR', error: err.message };
  }
  await setDoc(env, docId, { doc_type: String(extracted.doc_type || 'OTHER').toUpperCase(), extracted: JSON.stringify(extracted) });
  return processDoc(env, user, docId, { forced });
}

async function getDoc(env, user, docId) {
  return env.DB.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=? AND family_id=?`).bind(docId, user.family_id).first();
}
async function setDoc(env, docId, fields) {
  const keys = Object.keys(fields);
  await env.DB.prepare(`UPDATE LedgerDocs SET ${keys.map(k => `${k}=?`).join(', ')}, updated_at=? WHERE doc_id=?`)
    .bind(...keys.map(k => fields[k]), nowIso(), docId).run();
}
function publicDoc(d) {
  if (!d) return null;
  return { doc_id: d.doc_id, source: d.source, doc_type: d.doc_type, status: d.status, mime: d.mime,
    file_name: d.file_name, has_file: !!d.file_key, created_at: d.created_at, error: d.error,
    transaction_id: d.transaction_id, extracted: parse(d.extracted, null), suggestion: parse(d.suggestion, null) };
}

// ───────────────────────── AI อ่านเอกสาร ─────────────────────────
const EXTRACT_PROMPT = `You read Thai financial documents for a family bookkeeping app.
First decide doc_type:
  "SLIP" = bank/e-wallet transfer or payment slip (has sender & receiver)
  "RECEIPT" = shop receipt / tax invoice
  "ORDER" = online order / purchase confirmation (Shopee, Lazada, stock or fund order)
  "CARD_STATEMENT" = credit card statement
  "BANK_STATEMENT" = bank account statement
  "OTHER" = anything else
Then extract (use null when not present). Dates in YYYY-MM-DD, convert Buddhist year (2568 or 68) to Christian (2025). Time HH:MM:SS.
Return ONLY JSON:
{"doc_type":"SLIP","date":"YYYY-MM-DD","time":"HH:MM:SS","amount":0,"fee":0,"currency":"THB",
 "sender":{"name":"","bank":"","account":""},"receiver":{"name":"","bank":"","account":""},
 "ref_code":"","memo":"","merchant":"","items":[{"name":"","qty":1,"amount":0}],"vat":0,"total":0,
 "statement_period":"","due_date":""}
For SLIP keep masked account numbers exactly as printed (e.g. "xxx-x-x1234-x"). amount is positive.`;

/* ⚠️ Workers แผนฟรีให้เวลา CPU ต่อคำขอแค่ ~10 ms
   แปลงรูปสลิปเป็น base64 แล้วยัดใส่ JSON ก้อนใหญ่ = เกินเพดาน → ระบบถูกตัดกลางทาง
   เอกสารค้างสถานะ READING และ LINE ไม่ได้รับคำตอบเลย (เจอจริง 2026-10-08)
   วิธีแก้: ส่ง "ไบต์ดิบ" ขึ้น Gemini Files API ตรง ๆ (ไม่ต้องแปลง ไม่กิน CPU)
   แล้วอ้างถึงไฟล์ด้วย fileUri · ถ้าอัปโหลดไม่ได้ค่อยถอยไปใช้ base64 แบบเดิม */
async function extractDocument(env, bytes, mime) {
  if (env.__extractOverride) return env.__extractOverride(bytes, mime);   // ใช้ในเทสเท่านั้น
  if (!env.GEMINI_API_KEY) throw new Error('ยังไม่ได้ตั้ง GEMINI_API_KEY');
  const base = 'https://generativelanguage.googleapis.com';
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  let filePart = null;
  try {
    const up = await fetch(`${base}/upload/v1beta/files?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Protocol': 'raw', 'Content-Type': mime },
      body: bytes,
    });
    if (up.ok) {
      const info = await up.json();
      const uri = info?.file?.uri;
      if (uri) filePart = { fileData: { mimeType: mime, fileUri: uri } };
    }
  } catch { /* ถอยไปใช้ base64 */ }
  if (!filePart) filePart = { inlineData: { mimeType: mime, data: toBase64(bytes) } };

  const res = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: EXTRACT_PROMPT }, filePart] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    // แนบเหตุผลจาก Google มาด้วย (เช่น key ถูกปิด/หมดอายุ) — ตัวเลขอย่างเดียวไล่ปัญหาไม่ได้ (เจอ 403 จริง 2026-10-10)
    let reason = '';
    try { const e = await res.json(); reason = e?.error?.message || e?.error?.status || ''; } catch { /* ไม่มีรายละเอียด */ }
    throw new Error(`AI อ่านเอกสารไม่สำเร็จ (${res.status})${reason ? ': ' + String(reason).slice(0, 160) : ''}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return normalizeExtract(JSON.parse(text.trim().replace(/^```json\s*|```$/g, '')));
}

/* อ่านเอกสารที่ค้างอยู่ใหม่ (READING ที่ถูกตัดกลางทาง หรือ ERROR) จากไฟล์ใน R2 */
export async function retryDoc(env, user, docId) {
  const doc = await getDoc(env, user, docId);
  if (!doc) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  if (!['READING', 'ERROR'].includes(doc.status)) return { doc: publicDoc(doc), outcome: 'ALREADY', status: 409 };
  const obj = doc.file_key && env.ICONS ? await env.ICONS.get(doc.file_key) : null;
  if (!obj) return { error: 'ไม่พบไฟล์ต้นฉบับ', status: 404 };
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let extracted;
  try {
    extracted = await extractDocument(env, bytes, doc.mime || 'image/jpeg');
  } catch (err) {
    await setDoc(env, docId, { status: 'ERROR', error: String(err.message).slice(0, 500) });
    return { doc: publicDoc(await getDoc(env, user, docId)), outcome: 'ERROR', error: err.message };
  }
  await setDoc(env, docId, { doc_type: String(extracted.doc_type || 'OTHER').toUpperCase(), extracted: JSON.stringify(extracted), error: null });
  return processDoc(env, user, docId, {});
}

export function normalizeExtract(out) {
  out = out || {};
  out.amount = round2(Math.abs(Number(out.amount) || Number(out.total) || 0));
  out.fee = round2(Math.abs(Number(out.fee) || 0));
  return out;
}

// ───────────────────────── ประมวลผลเอกสาร ─────────────────────────
async function processDoc(env, user, docId, { forced } = {}) {
  const doc = await getDoc(env, user, docId);
  const ex = normalizeExtract(parse(doc.extracted, {}));
  const type = String(ex.doc_type || 'OTHER').toUpperCase();
  if (type === 'SLIP' || (ex.amount && (ex.sender?.name || ex.receiver?.name) && !['RECEIPT', 'ORDER'].includes(type))) {
    return processSlip(env, user, doc, ex, forced);
  }
  if ((type === 'RECEIPT' || type === 'ORDER') && ex.amount) return processSupporting(env, user, doc, ex);
  const note = type === 'BANK_STATEMENT' || type === 'CARD_STATEMENT'
    ? 'เก็บไว้แล้ว · การนำเข้า statement ทั้งฉบับจะมาในระยะ 2' : 'เก็บไว้แล้ว · ยังไม่รู้ว่าเป็นรายการเงินไหน';
  await setDoc(env, docId, { status: 'STORED', suggestion: JSON.stringify({ note }) });
  return { doc: publicDoc(await getDoc(env, user, docId)), outcome: 'STORED' };
}

function shiftDate(date, days) {
  const t = Date.parse(String(date || '').slice(0, 10));
  return Number.isFinite(t) ? new Date(t + days * 864e5).toISOString().slice(0, 10) : '0000-00-00';
}

const CANDIDATE_COLS = `t.transaction_id, t.account_id, t.date, t.time, t.total_amount, t.ref_code, t.status, t.statement_desc,
  (SELECT COUNT(*) FROM LedgerDocLinks l WHERE l.transaction_id = t.transaction_id AND l.role IN ('MATCHED','CREATED')) AS linked`;

async function findCandidates(env, accountIds, ev) {
  if (!accountIds.length) return [];
  const marks = accountIds.map(() => '?').join(',');
  // ช่วงวันที่ใช้ >= / < เพื่อให้ดัชนีวันที่ทำงาน (บทเรียนโควตา D1 เดือน ก.ย.)
  const rows = await env.DB.prepare(`SELECT ${CANDIDATE_COLS} FROM Transactions t
    WHERE t.account_id IN (${marks}) AND t.date >= ? AND t.date < ? AND ABS(t.total_amount - ?) < 0.005`)
    .bind(...accountIds, shiftDate(ev.date, -3), shiftDate(ev.date, 4), ev.signedAmount).all();
  const list = rows.results || [];
  if (ev.ref) {
    const byRef = await env.DB.prepare(`SELECT ${CANDIDATE_COLS} FROM Transactions t
      WHERE t.ref_code = ? AND t.account_id IN (${marks})`).bind(ev.ref, ...accountIds).all();
    for (const r of byRef.results || []) if (!list.some(x => x.transaction_id === r.transaction_id)) list.push(r);
  }
  return list.map(tx => ({ ...tx, linked: Number(tx.linked) > 0, score: scoreCandidate(ev, tx) }));
}

async function processSlip(env, user, doc, ex, forced) {
  const accounts = await permittedAccounts(env, user);
  const accountRules = await loadRules(env, user.family_id, 'ACCOUNT');
  let fromId = resolveSideAccount(ex.sender, accounts, accountRules);
  let toId = resolveSideAccount(ex.receiver, accounts, accountRules);
  if (forced?.account_id && accounts.some(a => a.account_id === forced.account_id)) {
    if (forced.side === 'IN') toId = forced.account_id; else fromId = forced.account_id;
  }
  const direction = slipDirection(fromId, toId);
  const date = ex.date || bangkokNow().slice(0, 10);

  if (direction === 'UNKNOWN') {
    const options = accountOptions(accounts, ex);
    await setDoc(env, doc.doc_id, { status: 'NEEDS_ACCOUNT', suggestion: JSON.stringify({ direction, options }) });
    return { doc: publicDoc(await getDoc(env, user, doc.doc_id)), outcome: 'NEEDS_ACCOUNT', options };
  }

  // เงินออก: ยอดสลิป + ค่าธรรมเนียม · เงินเข้า: ยอดสลิป · โอนระหว่างบัญชีเรา = ทั้งสองขา
  const legs = [];
  if (fromId) legs.push({ side: 'OUT', account_id: fromId, signedAmount: -round2(ex.amount + (ex.fee || 0)), counter: toId });
  if (toId) legs.push({ side: 'IN', account_id: toId, signedAmount: round2(ex.amount), counter: fromId });

  const results = [];
  for (const leg of legs) {
    const ev = { signedAmount: leg.signedAmount, date, time: ex.time, ref: ex.ref_code || null };
    const decision = decideMatch(await findCandidates(env, [leg.account_id], ev));
    if (decision.kind === 'auto') {
      await linkDoc(env, doc.doc_id, decision.best.transaction_id, 'MATCHED');
      results.push({ side: leg.side, account_id: leg.account_id, kind: 'MATCHED', transaction_id: decision.best.transaction_id });
    } else if (decision.kind === 'choose') {
      results.push({ side: leg.side, account_id: leg.account_id, kind: 'CHOOSE',
        choices: decision.list.map(c => ({ transaction_id: c.transaction_id, date: c.date, total_amount: c.total_amount,
          statement_desc: c.statement_desc, score: c.score })) });
    } else {
      const account = accounts.find(a => a.account_id === leg.account_id);
      const party = leg.side === 'OUT' ? ex.receiver?.name : ex.sender?.name;
      const lines = await suggestLines(env, user, { total: leg.signedAmount, fee: leg.side === 'OUT' ? ex.fee || 0 : 0,
        party, direction, counterAccount: leg.counter, entity: account?.entity_id });
      // บันทึกช่วยจำบนสลิป = รายละเอียดของรายการ (North ขอ 2026-10-10) · ไม่มีก็ใช้ชื่อคู่ค้า
      if (ex.memo && lines.lines[0]) lines.lines[0].note = String(ex.memo).slice(0, 200);
      const txId = await createTransaction(env, user, {
        account_id: leg.account_id, date, time: ex.time || null, total_amount: leg.signedAmount, ref_code: ex.ref_code || null,
        statement_desc: slipDesc(ex, leg.side), source: 'LINE_SLIP', status: 'PENDING_REVIEW',
        slip_image_url: doc.file_key ? `/api/inbox/file/${doc.doc_id}` : null, details: lines.lines,
      });
      await linkDoc(env, doc.doc_id, txId, 'CREATED');
      results.push({ side: leg.side, account_id: leg.account_id, kind: 'CREATED', transaction_id: txId, how: lines.how, party: party || null });
    }
  }
  const status = results.some(r => r.kind === 'CHOOSE') ? 'NEEDS_CHOICE'
    : results.some(r => r.kind === 'CREATED') ? 'SUGGESTED' : 'DONE';
  await setDoc(env, doc.doc_id, { status, suggestion: JSON.stringify({ direction, legs: results }),
    transaction_id: results.find(r => r.transaction_id)?.transaction_id || null });
  return { doc: publicDoc(await getDoc(env, user, doc.doc_id)), outcome: status === 'DONE' ? 'MATCHED' : status, legs: results };
}

function slipDesc(ex, side) {
  const other = side === 'OUT' ? ex.receiver : ex.sender;
  const word = side === 'OUT' ? 'โอนให้' : 'รับจาก';
  return [word, other?.name, other?.bank ? `(${other.bank})` : '', ex.memo ? `· ${ex.memo}` : ''].filter(Boolean).join(' ').slice(0, 200);
}

function accountOptions(accounts, ex) {
  const sb = bankKey(ex.sender?.bank), rb = bankKey(ex.receiver?.bank);
  const pick = (b, side) => accounts.filter(a => b && bankKey(a.bank_name) === b).slice(0, 5)
    .map(a => ({ account_id: a.account_id, name: a.name, side }));
  const out = [...pick(sb, 'OUT'), ...pick(rb, 'IN')];
  return out.length ? out
    : accounts.filter(a => !/^C/.test(a.account_id)).slice(0, 6).map(a => ({ account_id: a.account_id, name: a.name, side: 'OUT' }));
}

async function suggestLines(env, user, { total, fee, party, direction, counterAccount, entity }) {
  if (direction === 'TRANSFER') {
    // ขาออก: ยอดย่อย = ยอดหัว + fee (fee บวก ทำให้หัวติดลบมากขึ้น) · ขาเข้า: ยอดเท่าหัว
    const amount = round2(total < 0 ? total + fee : total);
    return { how: 'transfer', lines: [{ category_id: TRANSFER_CATEGORY, entity_id: entity || null, type: 'TRANSFER',
      head_owner: counterAccount, amount, fee: round2(fee), wht: 0, note: `โอนระหว่างบัญชี ${counterAccount || ''}`.trim() }] };
  }
  const rule = await getRule(env, user.family_id, 'PARTY', partyKey(party));
  return proposeLines({ total, fee, template: rule?.value || null,
    fallback: { category_id: UNCATEGORIZED, entity_id: entity || null, type: total < 0 ? 'EXPENSE' : 'INCOME', note: party || '' } });
}

/* ใบเสร็จ / order: ไม่ใช่ตัวเงินเข้าออกเอง แต่เป็นหลักฐานประกอบ → ผูกกับรายการจ่ายที่ยอดตรง (ทุกบัญชีที่มีสิทธิ์) */
async function processSupporting(env, user, doc, ex) {
  const accounts = await permittedAccounts(env, user);
  const ev = { signedAmount: -round2(ex.amount), date: ex.date || bangkokNow().slice(0, 10), time: ex.time, ref: null };
  const all = await findCandidates(env, accounts.map(a => a.account_id), ev);
  // ใบเสร็จผูกซ้อนกับรายการที่มีสลิปแล้วได้ — ไม่นับว่า "ถูกใช้ไปแล้ว"
  const decision = decideMatch(all.map(c => ({ ...c, linked: false })));
  if (decision.kind === 'auto') {
    await linkDoc(env, doc.doc_id, decision.best.transaction_id, 'SUPPORT');
    await setDoc(env, doc.doc_id, { status: 'DONE', transaction_id: decision.best.transaction_id,
      suggestion: JSON.stringify({ attached_to: decision.best.transaction_id }) });
    return { doc: publicDoc(await getDoc(env, user, doc.doc_id)), outcome: 'ATTACHED', transaction_id: decision.best.transaction_id };
  }
  await setDoc(env, doc.doc_id, { status: 'STORED', suggestion: JSON.stringify({
    note: 'เก็บไว้แล้ว · จะผูกกับรายการจ่ายเมื่อเจอยอดที่ตรง',
    choices: (decision.list || []).map(c => ({ transaction_id: c.transaction_id, date: c.date, total_amount: c.total_amount })) }) });
  return { doc: publicDoc(await getDoc(env, user, doc.doc_id)), outcome: 'STORED' };
}

async function linkDoc(env, docId, txId, role) {
  await env.DB.prepare(`INSERT OR IGNORE INTO LedgerDocLinks (doc_id, transaction_id, role, created_at) VALUES (?,?,?,?)`)
    .bind(docId, txId, role, nowIso()).run();
}

async function createTransaction(env, user, t) {
  const txId = newId('TX');
  const ops = [env.DB.prepare(`
    INSERT INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(txId, t.account_id, t.ref_code, t.date, t.time, round2(t.total_amount), t.statement_desc || null, t.status, t.source,
      t.slip_image_url || null, user.user_id)];
  for (const d of t.details) ops.push(detailInsert(env, txId, d));
  await env.DB.batch(ops);
  return txId;
}
function detailInsert(env, txId, d) {
  return env.DB.prepare(`
    INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type, head_owner)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(newId('DT'), txId, round2(d.amount), round2(d.fee || 0), round2(d.wht || 0), d.category_id || UNCATEGORIZED,
      d.entity_id || null, d.contact_id || null, d.project_id || null, d.note || null,
      d.type || (d.amount < 0 ? 'EXPENSE' : 'INCOME'), d.head_owner || null);
}

// ───────────────────────── เงินสด ─────────────────────────
export async function recordCash(env, user, body, source) {
  let amount = Number(body.amount), note = body.note || '', hint = '';
  if (body.text) {
    const p = parseCashText(body.text);
    if (!p) return { error: 'อ่านไม่ออก ลองพิมพ์แบบ "กาแฟ 65"' };
    ({ amount, note } = p); hint = p.accountHint;
  }
  if (!(amount > 0)) return { error: 'จำนวนเงินต้องมากกว่า 0' };
  const accounts = await permittedAccounts(env, user);
  let account = body.account_id ? accounts.find(a => a.account_id === body.account_id) : null;
  if (!account && hint) {
    const h = hint.toLowerCase(), hb = bankKey(hint);
    account = accounts.find(a => a.name.toLowerCase().includes(h) || a.account_id.toLowerCase() === h)
      || accounts.find(a => hb && bankKey(a.bank_name) === hb);
  }
  if (!account) {
    const def = await getRule(env, user.family_id, 'DEFAULT_CASH', user.user_id);
    account = accounts.find(a => a.account_id === def?.value) || accounts.find(a => bankKey(a.bank_name) === 'CASH');
  }
  if (!account) return { error: 'ยังไม่มีบัญชีเงินสดที่คุณมีสิทธิ์ใช้' };

  const rule = await getRule(env, user.family_id, 'PARTY', partyKey(note));
  const total = -round2(amount);
  const lines = proposeLines({ total, template: rule?.value || null,
    fallback: { category_id: UNCATEGORIZED, entity_id: account.entity_id, type: 'EXPENSE', note } });
  for (const l of lines.lines) if (!l.note) l.note = note;
  // ยืนยันให้เองเมื่อเคยยืนยันหมวดของคำนี้มาแล้ว 2 ครั้งขึ้นไป — ครั้งแรก ๆ ให้คนดูก่อน
  const confident = (rule?.hits || 0) >= 2;
  const now = bangkokNow();
  const txId = await createTransaction(env, user, {
    account_id: account.account_id, date: body.date || now.slice(0, 10), time: now.slice(11, 19), total_amount: total,
    ref_code: null, statement_desc: note || 'เงินสด', source: source === 'LINE' ? 'LINE_TEXT' : 'WEB_GRID',
    status: confident ? 'CONFIRMED' : 'PENDING_REVIEW', details: lines.lines,
  });
  const docId = newId('DOC');
  await env.DB.prepare(`INSERT INTO LedgerDocs (doc_id, family_id, uploaded_by, source, doc_type, status, extracted, suggestion, transaction_id, created_at)
    VALUES (?,?,?,?, 'CASH', ?, ?, ?, ?, ?)`)
    .bind(docId, user.family_id, user.user_id, source, confident ? 'DONE' : 'SUGGESTED',
      JSON.stringify({ amount, note, account_id: account.account_id }),
      JSON.stringify({ direction: 'OUT', party: note, legs: [{ side: 'OUT', account_id: account.account_id, kind: 'CREATED', transaction_id: txId, how: lines.how }] }),
      txId, nowIso()).run();
  await linkDoc(env, docId, txId, 'CREATED');
  return { doc_id: docId, transaction_id: txId, account: { account_id: account.account_id, name: account.name },
    amount, note, auto_confirmed: confident, category_id: lines.lines[0]?.category_id, how: lines.how };
}

// ───────────────────────── การกระทำของคน ─────────────────────────
export async function runAction(env, user, docId, action, body = {}) {
  const doc = await getDoc(env, user, docId);
  if (!doc) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  const links = (await env.DB.prepare(`SELECT l.transaction_id, l.role, t.status FROM LedgerDocLinks l
    LEFT JOIN Transactions t ON t.transaction_id = l.transaction_id WHERE l.doc_id=?`).bind(docId).all()).results || [];
  // ลบได้เฉพาะรายการที่เอกสารนี้สร้างเองและยังไม่ยืนยัน — ไม่แตะรายการจาก statement เด็ดขาด
  const createdPending = links.filter(l => l.role === 'CREATED' && l.status === 'PENDING_REVIEW');

  if (action === 'dismiss') {
    for (const l of createdPending) await deleteTx(env, l.transaction_id);
    await env.DB.prepare(`DELETE FROM LedgerDocLinks WHERE doc_id=? AND role='CREATED'`).bind(docId).run();
    await setDoc(env, docId, { status: 'DISMISSED' });
    // รายการที่สร้างจาก statement แล้วกด "ไม่ต้องบันทึก" → บรรทัดนั้นใน statement นับว่าข้ามแล้ว
    if (doc.doc_type === 'STATEMENT_LINE') await markStatementLine(env, user, parse(doc.extracted, {}), { status: 'IGNORED', transaction_id: null });
    return { ok: true, status: 'DISMISSED' };
  }

  if (action === 'account') {
    const accounts = await permittedAccounts(env, user);
    if (!accounts.some(a => a.account_id === body.account_id)) return { error: 'ไม่มีสิทธิ์ใช้บัญชีนี้', status: 403 };
    const side = body.side === 'IN' ? 'IN' : 'OUT';
    const ex = parse(doc.extracted, {});
    const party = side === 'IN' ? ex.receiver : ex.sender;
    await saveRule(env, user.family_id, 'ACCOUNT', accountHintKey(party?.bank, party?.account), body.account_id);
    for (const l of createdPending) await deleteTx(env, l.transaction_id);
    await env.DB.prepare(`DELETE FROM LedgerDocLinks WHERE doc_id=?`).bind(docId).run();
    return processDoc(env, user, docId, { forced: { account_id: body.account_id, side } });
  }

  if (action === 'link') {
    const tx = await env.DB.prepare(`SELECT t.transaction_id FROM Transactions t JOIN Accounts a ON a.account_id=t.account_id
      JOIN UserPermissions up ON up.entity_id=a.entity_id WHERE t.transaction_id=? AND up.user_id=?`)
      .bind(body.transaction_id, user.user_id).first();
    if (!tx) return { error: 'ไม่พบรายการที่เลือก', status: 404 };
    for (const l of createdPending) await deleteTx(env, l.transaction_id);
    await env.DB.prepare(`DELETE FROM LedgerDocLinks WHERE doc_id=? AND role='CREATED'`).bind(docId).run();
    await linkDoc(env, docId, body.transaction_id, ['SLIP', 'CASH'].includes(doc.doc_type) ? 'MATCHED' : 'SUPPORT');
    await setDoc(env, docId, { status: 'DONE', transaction_id: body.transaction_id });
    return { ok: true, status: 'DONE', transaction_id: body.transaction_id };
  }

  if (action === 'accept') {
    if (!createdPending.length) {
      if (['NEEDS_ACCOUNT', 'NEEDS_CHOICE'].includes(doc.status)) return { error: 'ต้องเลือกบัญชีหรือรายการก่อน', status: 409 };
      await setDoc(env, docId, { status: 'DONE' });
      return { ok: true, status: 'DONE' };
    }
    if (body.details) {
      if (createdPending.length !== 1) return { error: 'แก้บรรทัดย่อยได้ทีละรายการ', status: 400 };
      const txId = createdPending[0].transaction_id;
      const head = await env.DB.prepare(`SELECT total_amount FROM Transactions WHERE transaction_id=?`).bind(txId).first();
      const total = body.total_amount != null ? round2(body.total_amount) : round2(head.total_amount);
      const gap = balanceGap(total, body.details);
      if (Math.abs(gap) >= 0.005) return { error: `ยอดยังไม่ลงตัว ขาด/เกิน ${money(gap)} บาท`, gap, status: 400 };
      const ops = [env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id=?`).bind(txId),
        env.DB.prepare(`UPDATE Transactions SET total_amount=? WHERE transaction_id=?`).bind(total, txId)];
      for (const d of body.details) ops.push(detailInsert(env, txId, d));
      await env.DB.batch(ops);
    }
    for (const l of createdPending) {
      await env.DB.prepare(`UPDATE Transactions SET status='CONFIRMED' WHERE transaction_id=?`).bind(l.transaction_id).run();
    }
    await learnFromDoc(env, user, doc, createdPending.map(l => l.transaction_id));
    await setDoc(env, docId, { status: 'DONE' });
    return { ok: true, status: 'DONE' };
  }
  return { error: 'ไม่รู้จักคำสั่งนี้' };
}

async function deleteTx(env, txId) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id=? AND transaction_id IN
      (SELECT transaction_id FROM Transactions WHERE transaction_id=? AND status='PENDING_REVIEW')`).bind(txId, txId),
    env.DB.prepare(`DELETE FROM Transactions WHERE transaction_id=? AND status='PENDING_REVIEW'`).bind(txId),
  ]);
}

/* จำสิ่งที่คนยืนยัน: คู่ค้านี้ → บรรทัดย่อยแบบนี้ (ไม่จำการโอนระหว่างบัญชี · ไม่จำบรรทัดที่ยังไม่ระบุหมวด) */
async function learnFromDoc(env, user, doc, txIds) {
  const sug = parse(doc.suggestion, {}), ex = parse(doc.extracted, {});
  // บัญชีของเราแต่ละขาที่คนยืนยันแล้ว → จำ (ธนาคาร+เลขท้าย) ไว้ ครั้งหน้าไม่ต้องถาม
  // (รวมกรณีเลือกบัญชีตอนอัปโหลดในเว็บ ซึ่งไม่ผ่านปุ่ม "บัญชีไหน")
  for (const leg of sug.legs || []) {
    const side = leg.side === 'IN' ? ex.receiver : ex.sender;
    if (doc.doc_type === 'SLIP' && leg.account_id) await saveRule(env, user.family_id, 'ACCOUNT', accountHintKey(side?.bank, side?.account), leg.account_id);
  }
  if (sug.direction === 'TRANSFER') return;
  const party = doc.doc_type === 'CASH' ? ex.note : (sug.direction === 'IN' ? ex.sender?.name : ex.receiver?.name);
  const key = doc.doc_type === 'STATEMENT_LINE' ? statementPartyKey(party) : partyKey(party);
  if (!key || !txIds.length) return;
  const rows = await env.DB.prepare(`SELECT amount, fee, wht, category_id, entity_id, contact_id, type, note
    FROM TransactionDetails WHERE transaction_id=?`).bind(txIds[0]).all();
  const details = (rows.results || []).filter(d => d.category_id !== UNCATEGORIZED);
  if (!details.length) return;
  await saveRule(env, user.family_id, 'PARTY', key, templateFromDetails(details));
}

// ───────────────────────── รายการในกล่อง ─────────────────────────
async function listInbox(env, user, url) {
  const all = url.searchParams.get('status') === 'all';
  if (!all) await adoptPendingTransactions(env, user);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);
  const marks = OPEN_STATUSES.map(() => '?').join(',');
  let docs = (await env.DB.prepare(`SELECT * FROM LedgerDocs WHERE family_id=? ${all ? '' : `AND status IN (${marks})`}
    ORDER BY created_at DESC LIMIT ?`).bind(user.family_id, ...(all ? [] : OPEN_STATUSES), limit).all()).results || [];
  if (!docs.length) return { docs: [] };
  const ids = docs.map(d => d.doc_id);
  const links = (await env.DB.prepare(`SELECT l.doc_id, l.role, t.transaction_id, t.account_id, t.date, t.time, t.total_amount,
      t.status, t.statement_desc FROM LedgerDocLinks l JOIN Transactions t ON t.transaction_id=l.transaction_id
      WHERE l.doc_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
  /* รายการถูกยืนยัน/ลบจากเมนูเก่า ("รอตรวจสอบ" ในแอปหลัก) → ปิดเอกสารในกล่องให้ตรงกัน ไม่ค้างซ้ำสองที่ */
  if (!all) {
    const sync = [];
    for (const d of docs) {
      if (d.status !== 'SUGGESTED') continue;
      const mine = links.filter(l => l.doc_id === d.doc_id && l.role === 'CREATED');
      const next = !mine.length ? 'DISMISSED' : mine.every(l => l.status === 'CONFIRMED') ? 'DONE' : null;
      if (next) { d.status = next; sync.push(env.DB.prepare(`UPDATE LedgerDocs SET status=?, updated_at=? WHERE doc_id=?`).bind(next, nowIso(), d.doc_id)); }
    }
    if (sync.length) await env.DB.batch(sync);
    docs = docs.filter(d => OPEN_STATUSES.includes(d.status));
    if (!docs.length) return { docs: [] };
  }
  const txIds = [...new Set(links.map(l => l.transaction_id))];
  const details = txIds.length ? (await env.DB.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id IN (${txIds.map(() => '?').join(',')})`)
    .bind(...txIds).all()).results || [] : [];
  return { docs: docs.map(d => ({ ...publicDoc(d),
    transactions: links.filter(l => l.doc_id === d.doc_id)
      .map(l => ({ ...l, details: details.filter(x => x.transaction_id === l.transaction_id) })) })) };
}

async function serveDocFile(env, user, docId, cors) {
  const doc = await getDoc(env, user, docId);
  if (!doc?.file_key || !env.ICONS) return new Response('not found', { status: 404, headers: cors });
  const obj = await env.ICONS.get(doc.file_key);
  if (!obj) return new Response('not found', { status: 404, headers: cors });
  const headers = new Headers(cors);
  headers.set('Content-Type', doc.mime || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(obj.body, { headers });
}

// ───────────────────────── LINE ─────────────────────────
async function verifyLineSignature(env, raw, signature) {
  if (!env.LINE_CHANNEL_SECRET) return true;      // ยังไม่ตั้ง secret = ยอมรับแบบเดิม (ควรตั้ง)
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LINE_CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return toBase64(new Uint8Array(mac)) === signature;
}

/* LINE ส่งหลาย event มาในครั้งเดียวได้ (ส่งรูป 5 รูปพร้อมกัน) — ของเดิมอ่านแค่ตัวแรก รูปที่เหลือหายเงียบ */
async function handleLineWebhook(request, env, hooks) {
  const raw = await request.text();
  if (!(await verifyLineSignature(env, raw, request.headers.get('x-line-signature')))) {
    return new Response('bad signature', { status: 401 });
  }
  const body = parse(raw, {});
  const work = (async () => {
    for (const event of body.events || []) {
      try { await handleLineEvent(env, event, hooks); }
      catch (err) { if (event.replyToken) await lineReply(env, event.replyToken, `❌ มีข้อผิดพลาด: ${err.message}`); }
    }
  })();
  /* ตอบ LINE "OK" ทันที แล้วทำงานต่อเบื้องหลัง (ctx.waitUntil)
     LINE รอคำตอบไม่นาน — ถ้าเราอ่านสลิปกับ AI นานกว่านั้น LINE ตัดสาย แล้ว Cloudflare
     ยกเลิกงานทั้งหมดกลางทาง (log ขึ้น "Canceled") → เอกสารค้าง + บอทเงียบ (เจอจริง 2026-10-10)
     reply token ยังใช้ได้หลังตอบ OK ไปแล้ว จึงส่งผลกลับได้ตามปกติ */
  if (hooks.waitUntil) { hooks.waitUntil(work); return new Response('OK'); }
  await work;
  return new Response('OK');
}

async function handleLineEvent(env, event, hooks) {
  const token = event.replyToken;
  const lineUserId = event.source?.userId;
  if (!token || !lineUserId) return;
  const user = await env.DB.prepare(`SELECT * FROM Users WHERE line_user_id=?`).bind(lineUserId).first();
  if (!user) {
    await lineReply(env, token, `ยังไม่พบบัญชีของคุณในระบบ\n\nLINE ID ของคุณคือ:\n${lineUserId}\n\nนำไปเพิ่มในเมนู "สมาชิกครอบครัว" บนเว็บก่อนนะครับ`);
    return;
  }

  if (event.type === 'postback') {
    const [ns, action, docId, arg, side] = String(event.postback?.data || '').split('|');
    if (ns !== 'inbox') return;
    const link = await editLinkFor(env, hooks, docId);
    if (action === 'cats') {                                       // เปิดทางลัดเลือกหมวด
      const doc = await getDoc(env, user, docId);
      if (!doc) return lineReply(env, token, '⚠️ ไม่พบเอกสารนี้');
      const dir = parse(doc.suggestion, {})?.legs?.[0]?.side === 'IN' ? 'INCOME' : 'EXPENSE';
      const cats = await topCategories(env, user.family_id, dir, 12);
      return lineReplyMessages(env, token, [{ type: 'text', text: '🗂️ เลือกหมวด (หรือกด "หมวดอื่น…" เพื่อค้นหา)',
        quickReply: { items: categoryQuickItems(docId, cats, link) } }]);
    }
    if (action === 'setcat') {                                     // เปลี่ยนหมวดแล้วโชว์การ์ดใหม่ (ยังไม่ยืนยัน)
      const out = await applyEdits(env, user, docId, { category_id: arg, confirm: false });
      if (out.error) return lineReply(env, token, `⚠️ ${out.error}`);
      return replyCard(env, token, user, docId, hooks, { status: 'เปลี่ยนหมวดแล้ว' });
    }
    const body = action === 'account' ? { account_id: arg, side } : action === 'link' ? { transaction_id: arg } : {};
    const out = await runAction(env, user, docId, action, body);
    if (out.error) return lineReply(env, token, `⚠️ ${out.error}`);
    if (action === 'dismiss') return lineReply(env, token, '🗑️ ไม่บันทึกรายการนี้แล้ว');
    if (action === 'accept' || action === 'link') return replyCard(env, token, user, docId, hooks, { done: true });
    return replyOutcome(env, token, user, out, hooks);             // account → ประมวลผลใหม่แล้ว ตอบผลรอบใหม่
  }

  if (event.type !== 'message') return;
  const msg = event.message || {};
  if (msg.type === 'image' || msg.type === 'file') {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${msg.id}/content`, {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` } });
    if (!res.ok) return lineReply(env, token, `❌ ดึงไฟล์จาก LINE ไม่สำเร็จ (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const out = await ingestFile(env, user, { bytes, mime: res.headers.get('content-type') || 'image/jpeg',
      name: msg.fileName || null, source: 'LINE' });
    return replyOutcome(env, token, user, out, hooks);
  }
  if (msg.type === 'text') {
    const text = String(msg.text || '').trim();
    // "อ่านใหม่" → อ่านเอกสารล่าสุดที่ค้าง/อ่านไม่สำเร็จซ้ำ (ทีละใบ)
    if (/^(อ่านใหม่|ลองใหม่|retry)$/i.test(text)) {
      const stuck = (await env.DB.prepare(`SELECT doc_id FROM LedgerDocs WHERE family_id=? AND uploaded_by=? AND status IN ('READING','ERROR')
        AND file_key IS NOT NULL ORDER BY created_at DESC LIMIT 5`).bind(user.family_id, user.user_id).all()).results || [];
      if (!stuck.length) return lineReply(env, token, '👍 ไม่มีเอกสารค้างครับ');
      const out = await retryDoc(env, user, stuck[0].doc_id);
      if (stuck.length > 1) out.note = `ยังค้างอีก ${stuck.length - 1} ใบ พิมพ์ "อ่านใหม่" อีกครั้ง`;
      return replyOutcome(env, token, user, out, hooks);
    }
    // ข้อความที่หน้าแก้ไข (LIFF) ส่งเข้าแชทแทนผู้ใช้หลังบันทึก → ตอบการ์ดล่าสุดที่เพิ่งแก้
    if (/^(✅ บันทึกแล้ว|🗑️ ไม่บันทึก)/.test(text)) {
      const last = await env.DB.prepare(`SELECT doc_id, status FROM LedgerDocs WHERE family_id=? AND uploaded_by=? AND status IN ('DONE','DISMISSED')
        ORDER BY updated_at DESC LIMIT 1`).bind(user.family_id, user.user_id).first();
      if (!last || last.status === 'DISMISSED') return;
      return replyCard(env, token, user, last.doc_id, hooks, { done: true, note: '✏️ แก้ไขจากหน้าเว็บแล้ว' });
    }
    if (!SUMMARY_WORDS.test(text) && parseCashText(text)) {
      const out = await recordCash(env, user, { text }, 'LINE');
      if (out.error) return lineReply(env, token, `⚠️ ${out.error}`);
      return replyCard(env, token, user, out.doc_id, hooks, out.auto_confirmed ? { done: true } : {});
    }
    if (hooks.summary) return hooks.summary(event, user, env);
  }
}

async function categoryName(env, id) {
  if (!id || id === UNCATEGORIZED) return 'ยังไม่ระบุ';
  const r = await env.DB.prepare(`SELECT name FROM Categories WHERE category_id=?`).bind(id).first();
  return displayName(r?.name || id);
}

/* หมวดที่ใช้บ่อยของทิศทางนี้ (ดูจาก 1,500 บรรทัดล่าสุด — ไม่สแกนทั้งตาราง) แล้วต่อด้วยหมวดที่เหลือ */
async function topCategories(env, familyId, type, limit = 200) {
  const all = (await env.DB.prepare(`SELECT category_id, name, default_type FROM Categories
    WHERE (family_id = ? OR family_id IS NULL) AND category_id != ?`).bind(familyId, UNCATEGORIZED).all()).results || [];
  const uses = (await env.DB.prepare(`SELECT category_id, COUNT(*) AS n FROM
    (SELECT category_id FROM TransactionDetails WHERE type = ? ORDER BY rowid DESC LIMIT 1500) GROUP BY category_id`)
    .bind(type).all()).results || [];
  const n = new Map(uses.map(u => [u.category_id, u.n]));
  return all.map(c => ({ ...c, uses: n.get(c.category_id) || 0 }))
    .sort((a, b) => (b.uses - a.uses) || ((b.default_type === type) - (a.default_type === type)) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}

// ───────────────────────── ลิงก์แก้ไขด่วน (เซ็นต่อเอกสาร) ─────────────────────────
const LINK_DAYS = 14;
async function linkSig(env, docId, exp) {
  const secret = env.LINK_SECRET || env.LINE_CHANNEL_SECRET || env.GEMINI_API_KEY || 'dev-only';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${docId}.${exp}`)));
  return toBase64(mac).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
export async function signDocLink(env, docId) {
  const exp = Math.floor(Date.now() / 1000) + LINK_DAYS * 86400;
  return `${exp}.${await linkSig(env, docId, exp)}`;
}
async function verifyDocLink(env, docId, token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return (await linkSig(env, docId, Number(exp))) === sig;
}
async function editLinkFor(env, hooks, docId) {
  const web = env.WEB_APP_URL || 'https://record-revenue-web.pages.dev';
  const api = hooks?.origin ? `&api=${encodeURIComponent(hooks.origin)}` : '';
  const q = `doc=${encodeURIComponent(docId)}&t=${await signDocLink(env, docId)}${api}`;
  /* มี LIFF (ตั้ง env LIFF_ID) → เปิดเป็นหน้าต่างใน LINE: บันทึกแล้วปิดเอง + ส่งข้อความเข้าแชทได้
     ไม่มี → เปิดหน้าเว็บธรรมดา แล้วระบบ push การ์ดใหม่เข้าแชทแทน */
  if (env.LIFF_ID) return `https://liff.line.me/${env.LIFF_ID}?${q}&lid=${encodeURIComponent(env.LIFF_ID)}`;
  return `${web}/ledger/quick.html?${q}`;
}

async function handleQuick(request, env, url, cors, docId, wantFile) {
  if (!(await verifyDocLink(env, docId, url.searchParams.get('t')))) return json({ error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' }, cors, 403);
  const raw = await env.DB.prepare(`SELECT * FROM LedgerDocs WHERE doc_id=?`).bind(docId).first();
  const user = raw && await env.DB.prepare(`SELECT * FROM Users WHERE user_id=?`).bind(raw.uploaded_by).first();
  if (!raw || !user) return json({ error: 'ไม่พบเอกสารนี้' }, cors, 404);
  if (wantFile) return serveDocFile(env, user, docId, cors);
  try {
    if (request.method === 'GET') return json(await quickView(env, user, docId), cors);
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const out = body.action === 'dismiss' ? await runAction(env, user, docId, 'dismiss') : await applyEdits(env, user, docId, body);
      /* แก้จากหน้าเว็บธรรมดา → ส่งการ์ดใหม่เข้าแชทให้เห็นผลทันที
         ถ้าเปิดผ่าน LIFF หน้าเว็บจะส่งข้อความ "✅ บันทึกแล้ว…" เข้าแชทเอง แล้วบอทตอบการ์ด (ฟรี ไม่กินโควตา push) */
      if (!out.error && body.via !== 'liff') {
        try {
          if (body.action === 'dismiss') {
            if (user.line_user_id) await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
              body: JSON.stringify({ to: user.line_user_id, messages: [{ type: 'text', text: '🗑️ ไม่บันทึกรายการนี้แล้ว' }] }) });
          } else await pushCard(env, user, docId, { origin: url.origin }, { done: true, note: '✏️ แก้ไขจากหน้าเว็บแล้ว' });
        } catch { /* ส่งเข้าแชทไม่ได้ไม่ทำให้การบันทึกล้ม */ }
      }
      return json(out, cors, out.error ? (out.status || 400) : 200);
    }
    return json({ error: 'Not Found' }, cors, 404);
  } catch (err) {
    return json({ error: err.message }, cors, 500);
  }
}

async function quickView(env, user, docId) {
  const doc = await getDoc(env, user, docId);
  const sug = parse(doc.suggestion, {}) || {};
  const link = (await env.DB.prepare(`SELECT l.transaction_id FROM LedgerDocLinks l WHERE l.doc_id=? ORDER BY l.role='CREATED' DESC LIMIT 1`)
    .bind(docId).first())?.transaction_id;
  const tx = link ? await env.DB.prepare(`SELECT * FROM Transactions WHERE transaction_id=?`).bind(link).first() : null;
  const details = tx ? (await env.DB.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id=?`).bind(tx.transaction_id).all()).results || [] : [];
  const side = sug.legs?.[0]?.side || (tx && tx.total_amount > 0 ? 'IN' : 'OUT');
  const accounts = (await permittedAccounts(env, user)).map(a => ({ account_id: a.account_id, name: displayName(a.name), bank_name: a.bank_name }));
  const categories = (await topCategories(env, user.family_id, side === 'IN' ? 'INCOME' : 'EXPENSE'))
    .map(c => ({ category_id: c.category_id, name: displayName(c.name), default_type: c.default_type, uses: c.uses }));
  return { doc: publicDoc(doc), user: { name: user.name }, side, direction: sug.direction || side,
    options: sug.options || [], tx, details, accounts, categories,
    pending: !!tx && tx.status === 'PENDING_REVIEW', can_edit_amount: details.length <= 1 };
}

/* แก้รายการจากการ์ด LINE / หน้าแก้ไขด่วน แล้วยืนยัน (confirm:false = แก้อย่างเดียว)
   ใช้ได้กับรายการที่ระบบสร้างและยังรอยืนยัน · แตกหลายบรรทัดแล้ว แก้ยอด/หมวดต้องไปหน้าเว็บเต็ม */
export async function applyEdits(env, user, docId, e = {}) {
  let doc = await getDoc(env, user, docId);
  if (!doc) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  const accounts = await permittedAccounts(env, user);
  if (e.account_id && !accounts.some(a => a.account_id === e.account_id)) return { error: 'ไม่มีสิทธิ์ใช้บัญชีนี้', status: 403 };

  if (doc.status === 'NEEDS_ACCOUNT') {
    if (!e.account_id) return { error: 'เลือกบัญชีก่อน', status: 400 };
    const r = await runAction(env, user, docId, 'account', { account_id: e.account_id, side: e.side === 'IN' ? 'IN' : 'OUT' });
    if (r.error) return r;
    if (r.outcome === 'MATCHED') return { ok: true, status: 'DONE', matched: true };
    doc = await getDoc(env, user, docId);
  }
  const links = (await env.DB.prepare(`SELECT l.transaction_id FROM LedgerDocLinks l JOIN Transactions t ON t.transaction_id=l.transaction_id
    WHERE l.doc_id=? AND l.role='CREATED' AND t.status='PENDING_REVIEW'`).bind(docId).all()).results || [];
  if (!links.length) return { error: 'รายการนี้บันทึกหรือยกเลิกไปแล้ว', status: 409 };

  if (links.length === 1) {
    const txId = links[0].transaction_id;
    const head = await env.DB.prepare(`SELECT * FROM Transactions WHERE transaction_id=?`).bind(txId).first();
    const lines = (await env.DB.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id=?`).bind(txId).all()).results || [];
    const sign = head.total_amount < 0 ? -1 : 1;
    const amountChanged = e.amount != null && Number(e.amount) > 0 && Math.abs(round2(Math.abs(e.amount)) - Math.abs(head.total_amount)) >= 0.005;
    if (lines.length > 1 && (amountChanged || e.category_id)) return { error: 'รายการนี้แตกหลายบรรทัด แก้ยอด/หมวดในหน้าเว็บเต็ม', status: 400 };
    const total = amountChanged ? round2(sign * Math.abs(e.amount)) : head.total_amount;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : head.date;
    const accountId = e.account_id || head.account_id;
    const ops = [env.DB.prepare(`UPDATE Transactions SET total_amount=?, date=?, account_id=? WHERE transaction_id=?`)
      .bind(total, date, accountId, txId)];
    if (lines.length === 1) {
      const l = lines[0];
      let type = l.type;
      if (e.category_id) {
        const cat = await env.DB.prepare(`SELECT default_type FROM Categories WHERE category_id=?`).bind(e.category_id).first();
        if (!cat) return { error: 'ไม่พบหมวดนี้', status: 400 };
        if (['INCOME', 'EXPENSE', 'TRANSFER'].includes(cat.default_type)) type = cat.default_type;
      }
      // ยอดย่อย = ยอดหัว + fee + wht (สูตรเดียวกับข้อมูลจริง)
      ops.push(env.DB.prepare(`UPDATE TransactionDetails SET amount=?, category_id=?, type=?, note=? WHERE detail_id=?`)
        .bind(round2(total + (l.fee || 0) + (l.wht || 0)), e.category_id || l.category_id, type,
          e.note != null ? String(e.note).slice(0, 200) : l.note, l.detail_id));
    } else if (e.note != null) {
      ops.push(env.DB.prepare(`UPDATE TransactionDetails SET note=? WHERE detail_id=?`).bind(String(e.note).slice(0, 200), lines[0].detail_id));
    }
    await env.DB.batch(ops);
    if (accountId !== head.account_id) {                           // ให้การเรียนรู้บัญชีใช้บัญชีที่คนแก้
      const sug = parse(doc.suggestion, {}) || {};
      for (const leg of sug.legs || []) if (leg.transaction_id === txId) leg.account_id = accountId;
      await setDoc(env, docId, { suggestion: JSON.stringify(sug) });
    }
  }
  if (e.confirm === false) return { ok: true, status: 'EDITED' };
  return runAction(env, user, docId, 'accept', {});
}

// ───────────────────────── การ์ดตอบกลับ ─────────────────────────
/* การ์ดของเอกสาร 1 ใบ จากสถานะปัจจุบันในฐาน (ใช้ทั้งหลังอ่านสลิป จดเงินสด เปลี่ยนหมวด ยืนยัน) */
async function replyCard(env, token, user, docId, hooks, opts = {}) {
  const messages = await buildCard(env, user, docId, hooks, opts);
  return messages ? lineReplyMessages(env, token, messages) : lineReply(env, token, '⚠️ ไม่พบเอกสารนี้');
}
/* ส่งการ์ดล่าสุดเข้าแชทเอง (Push API) — ใช้หลังแก้จากหน้าเว็บที่ไม่ได้เปิดผ่าน LIFF
   เพราะการ์ดเก่าในแชทแก้ไม่ได้ ต้องส่งใบใหม่ให้เห็นค่าที่ถูกต้อง · ⚠️ นับโควตาข้อความ push ของ LINE OA */
async function pushCard(env, user, docId, hooks, opts = {}) {
  if (!user.line_user_id || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  const messages = await buildCard(env, user, docId, hooks, opts);
  if (!messages) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to: user.line_user_id, messages }),
  });
}
async function buildCard(env, user, docId, hooks, { done = false, status: statusText, note } = {}) {
  const doc = await getDoc(env, user, docId);
  if (!doc) return null;
  const ex = parse(doc.extracted, {}) || {};
  const sug = parse(doc.suggestion, {}) || {};
  const legs = sug.legs || [];
  const txId = legs.find(l => l.transaction_id)?.transaction_id || doc.transaction_id;
  const tx = txId ? await env.DB.prepare(`SELECT * FROM Transactions WHERE transaction_id=?`).bind(txId).first() : null;
  const lines = tx ? (await env.DB.prepare(`SELECT * FROM TransactionDetails WHERE transaction_id=?`).bind(tx.transaction_id).all()).results || [] : [];
  const accounts = await permittedAccounts(env, user);
  const accName = id => displayName(accounts.find(a => a.account_id === id)?.name || id || '-');
  const link = await editLinkFor(env, hooks, docId);
  const isCash = doc.doc_type === 'CASH';
  const kind = done || doc.status === 'DONE' ? 'DONE' : sug.direction === 'TRANSFER' ? 'TRANSFER' : isCash ? 'CASH' : (legs[0]?.side === 'IN' ? 'IN' : 'OUT');
  const amount = Math.abs(tx?.total_amount ?? ex.amount ?? 0);
  const learned = legs.some(l => String(l.how || '').startsWith('template'));
  const cats = lines.length > 1 ? `แตก ${lines.length} บรรทัด` : await categoryName(env, lines[0]?.category_id);
  const rows = [['📅 วันที่', thaiDate(tx?.date || ex.date, tx?.time || ex.time)]];
  if (sug.direction === 'TRANSFER') {
    rows.push(['🏦 จาก', accName(legs.find(l => l.side === 'OUT')?.account_id)], ['🏦 เข้า', accName(legs.find(l => l.side === 'IN')?.account_id)]);
  } else if (legs[0]?.side === 'IN') {
    rows.push(['🏦 เข้าบัญชี', accName(tx?.account_id || legs[0]?.account_id)], ['👤 จาก', ex.sender?.name || '-']);
  } else {
    rows.push(['🏦 จากบัญชี', accName(tx?.account_id || legs[0]?.account_id)]);
    if (!isCash) rows.push(['👤 ให้', ex.receiver?.name || '-']);
  }
  rows.push(['📝 รายการ', lines[0]?.note || ex.memo || ex.note || '-']);
  rows.push(['🗂️ หมวด', `${cats}${learned && !done ? ' ✨' : ''}`, { bold: true, color: cats === 'ยังไม่ระบุ' ? '#E03131' : '#212529' }]);
  const hint = note || (done ? null : cats === 'ยังไม่ระบุ' ? 'กด "เปลี่ยนหมวด" ก่อนยืนยัน ครั้งหน้าระบบจะจำให้'
    : learned ? '✨ หมวดนี้ระบบจำจากครั้งก่อน' : null);
  const bubble = txCard({ kind, status: done ? '' : (statusText || (doc.status === 'DONE' ? '' : 'รอยืนยัน')), amount, rows, note: hint,
    buttons: done || doc.status === 'DONE' ? [] : confirmButtons(docId, link, kind) });
  return [flexMessage(`${done || doc.status === 'DONE' ? 'บันทึกแล้ว' : 'รอยืนยัน'} ฿${moneyText(amount)}`, bubble)];
}

async function replyOutcome(env, token, user, out, hooks = {}) {
  const extra = out.note || null;
  const say = text => lineReply(env, token, extra ? `${text}\n\n${extra}` : text);
  if (out.error && !out.doc) return say(`⚠️ ${out.error}`);
  if (out.duplicate) return say('🔁 เอกสารนี้เคยส่งมาแล้ว ไม่บันทึกซ้ำครับ');
  const doc = out.doc, ex = doc?.extracted || {}, id = doc?.doc_id;
  switch (out.outcome) {
    case 'ERROR': return say(`❌ อ่านเอกสารไม่สำเร็จ แต่เก็บไฟล์ไว้แล้ว\n${out.error || ''}\nพิมพ์ "อ่านใหม่" เพื่อลองอีกครั้ง`);
    case 'NEEDS_ACCOUNT': {
      const link = await editLinkFor(env, hooks, id);
      const party = p => [p?.name, p?.bank, p?.account].filter(Boolean).join(' · ') || '-';
      const bubble = txCard({ kind: 'ASK', status: 'เลือกบัญชีของเรา', amount: ex.amount, rows: [
        ['📅 วันที่', thaiDate(ex.date, ex.time)], ['👤 ผู้โอน', party(ex.sender)], ['👤 ผู้รับ', party(ex.receiver)],
        ['📝 รายการ', ex.memo || '-'],
      ], note: `${extra ? extra + '\n' : ''}ตอบครั้งเดียว ครั้งหน้าระบบจำบัญชีนี้ให้`, buttons: accountButtons(id, out.options || [], link) });
      return lineReplyMessages(env, token, [flexMessage(`สลิปใหม่ ฿${moneyText(ex.amount)} เลือกบัญชี`, bubble)]);
    }
    case 'MATCHED': return replyCard(env, token, user, id, hooks, { done: true, note: `จับคู่กับรายการเดิมแล้ว แนบสลิปเป็นหลักฐาน${extra ? '\n' + extra : ''}` });
    case 'ATTACHED': return say(`📎 แนบเอกสารกับรายการจ่าย ฿${moneyText(ex.amount)} แล้ว`);
    case 'STORED': return say(`📎 ${doc.suggestion?.note || 'เก็บเอกสารไว้แล้ว'}`);
    case 'NEEDS_CHOICE': {
      const leg = (out.legs || []).find(l => l.kind === 'CHOOSE');
      const choices = (leg?.choices || []).slice(0, 4);
      const bubble = txCard({ kind: 'ASK', status: 'เจอยอดตรงกันหลายรายการ', amount: ex.amount,
        rows: choices.map((c, i) => [`${i + 1}.`, `${thaiDate(c.date)} ${c.statement_desc || ''}`]),
        buttons: [...choices.map((c, i) => ({ type: 'button', style: 'secondary', height: 'sm',
          action: { ...postback(`inbox|link|${id}|${c.transaction_id}`, `เลือกรายการที่ ${i + 1}`), label: `เลือกรายการที่ ${i + 1}` } })),
        { type: 'button', style: 'link', height: 'sm', action: { ...postback(`inbox|dismiss|${id}`, 'ไม่ต้องบันทึก'), label: 'ไม่ต้องบันทึก' } }] });
      return lineReplyMessages(env, token, [flexMessage(`เลือกรายการที่ตรงกับ ฿${moneyText(ex.amount)}`, bubble)]);
    }
    case 'SUGGESTED': return replyCard(env, token, user, id, hooks, { note: extra });
    default: return say('📥 รับเอกสารแล้ว');
  }
}

async function lineReplyMessages(env, replyToken, messages) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
}
async function lineReply(env, replyToken, text) {
  return lineReplyMessages(env, replyToken, [{ type: 'text', text: String(text).slice(0, 4900) }]);
}

// ═══════════════════════════════════════════════════════════════
// หน้าเว็บกล่องรอเคลียร์ (2026-10-10)
// ═══════════════════════════════════════════════════════════════
async function permittedEntities(env, user) {
  return (await env.DB.prepare(`SELECT up.entity_id, COALESCE(e.name, up.entity_id) AS name, e.is_company FROM UserPermissions up
    LEFT JOIN Entities e ON e.entity_id = up.entity_id WHERE up.user_id = ? ORDER BY name`).bind(user.user_id).all()).results || [];
}

/* ข้อมูลประกอบหน้าเว็บ: บัญชี บริษัท หมวด (เรียงตามที่ใช้บ่อย) คู่ค้า */
async function inboxMeta(env, user) {
  const [accounts, entities, outCats, inCats] = await Promise.all([
    permittedAccounts(env, user), permittedEntities(env, user),
    topCategories(env, user.family_id, 'EXPENSE', 2000), topCategories(env, user.family_id, 'INCOME', 2000)]);
  const usesIn = new Map(inCats.map(c => [c.category_id, c.uses]));
  let captions = new Map();                                        // "หัวข้อ" ของหมวด (กลุ่ม) — ใช้ค้นหา/แสดงในตัวเลือกหมวด
  try {
    captions = new Map(((await env.DB.prepare(`SELECT c.category_id, at.name FROM Categories c JOIN Captions at ON at.type_id = c.caption_id
      WHERE c.family_id = ? OR c.family_id IS NULL`).bind(user.family_id).all()).results || []).map(r => [r.category_id, displayName(r.name)]));
  } catch { /* ไม่มีตารางหัวข้อ */ }
  let contacts = [];
  try {
    const rows = (await env.DB.prepare(`SELECT contact_id, name, contact_type, members FROM Contacts WHERE family_id=? ORDER BY name`)
      .bind(user.family_id).all()).results || [];
    contacts = rows.filter(c => {
      if (user.role === 'admin' || !c.members) return true;
      try { const m = JSON.parse(c.members); return !Array.isArray(m) || !m.length || m.includes(user.user_id); } catch { return true; }
    }).map(({ members, ...c }) => c);
  } catch { /* ไม่มีตารางคู่ค้า */ }
  return {
    user: { user_id: user.user_id, name: user.name, role: user.role },
    accounts: accounts.map(a => ({ account_id: a.account_id, name: displayName(a.name), bank_name: a.bank_name, entity_id: a.entity_id,
      account_type: a.account_type || 'BANK', pdf_password: a.pdf_password || null })),
    entities: entities.map(e => ({ entity_id: e.entity_id, name: displayName(e.name), is_company: e.is_company })),
    categories: outCats.map(c => ({ category_id: c.category_id, name: displayName(c.name), default_type: c.default_type,
      group: captions.get(c.category_id) || '', uses_out: c.uses, uses_in: usesIn.get(c.category_id) || 0 })),
    contacts,
    uncategorized: UNCATEGORIZED, transfer_category: TRANSFER_CATEGORY,
  };
}

/* แก้รายการที่รอยืนยัน: วันที่ · บัญชี · บรรทัดย่อยทั้งหมด (แตกหลายบริษัท/หลายหมวด/หัก ณ ที่จ่าย)
   details ส่งมาแบบมีเครื่องหมายตามข้อมูลจริง (เงินออก = ลบ) · ต้องลงตัวกับยอดหัวเป๊ะ
   confirm:true = ยืนยันต่อเลย (ระบบจำแบบการแตกบรรทัดของคู่ค้านี้ไว้ใช้ครั้งหน้า) */
export async function editDoc(env, user, docId, e = {}) {
  const doc = await getDoc(env, user, docId);
  if (!doc) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  const links = (await env.DB.prepare(`SELECT l.transaction_id FROM LedgerDocLinks l JOIN Transactions t ON t.transaction_id=l.transaction_id
    WHERE l.doc_id=? AND l.role='CREATED' AND t.status='PENDING_REVIEW'`).bind(docId).all()).results || [];
  if (!links.length) return { error: 'รายการนี้บันทึกหรือยกเลิกไปแล้ว', status: 409 };
  if (links.length > 1 && (e.details || e.account_id)) return { error: 'รายการโอนระหว่างบัญชีแก้ได้แค่วันที่', status: 400 };
  const accounts = await permittedAccounts(env, user);
  if (e.account_id && !accounts.some(a => a.account_id === e.account_id)) return { error: 'ไม่มีสิทธิ์ใช้บัญชีนี้', status: 403 };

  const ops = [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : null;
  for (const { transaction_id: txId } of links) {
    if (date) ops.push(env.DB.prepare(`UPDATE Transactions SET date=? WHERE transaction_id=?`).bind(date, txId));
  }
  const txId = links[0].transaction_id;
  if (e.account_id) ops.push(env.DB.prepare(`UPDATE Transactions SET account_id=? WHERE transaction_id=?`).bind(e.account_id, txId));

  if (e.details) {
    if (!Array.isArray(e.details) || !e.details.length) return { error: 'ต้องมีอย่างน้อย 1 บรรทัด', status: 400 };
    if (e.details.length > 40) return { error: 'แตกได้ไม่เกิน 40 บรรทัด', status: 400 };
    const head = await env.DB.prepare(`SELECT total_amount FROM Transactions WHERE transaction_id=?`).bind(txId).first();
    // ยอดหัวแก้ได้เฉพาะรายการที่คนจดเอง (ไม่มีหลักฐานจากธนาคาร) · สลิป/statement ยอดต้องตรงหลักฐาน
    if (e.total_amount != null && ['MANUAL', 'CASH'].includes(doc.doc_type)) {
      const t = round2(e.total_amount);
      if (!t) return { error: 'ยอดต้องไม่เป็นศูนย์', status: 400 };
      head.total_amount = t;
      ops.push(env.DB.prepare(`UPDATE Transactions SET total_amount=? WHERE transaction_id=?`).bind(t, txId));
    }
    const entIds = new Set((await permittedEntities(env, user)).map(x => x.entity_id));
    const cats = new Map(((await env.DB.prepare(`SELECT category_id, default_type FROM Categories WHERE family_id=? OR family_id IS NULL`)
      .bind(user.family_id).all()).results || []).map(c => [c.category_id, c.default_type]));
    const clean = [];
    for (const d of e.details) {
      const amount = round2(d.amount);
      if (!amount) return { error: 'ยอดแต่ละบรรทัดต้องไม่เป็นศูนย์', status: 400 };
      const cat = d.category_id || UNCATEGORIZED;
      if (cat !== UNCATEGORIZED && !cats.has(cat)) return { error: `ไม่พบหมวด ${cat}`, status: 400 };
      if (d.entity_id && !entIds.has(d.entity_id)) return { error: 'ไม่มีสิทธิ์ใช้บริษัทนี้', status: 403 };
      const dt = cats.get(cat);
      clean.push({ amount, fee: round2(Math.abs(d.fee || 0)), wht: round2(d.wht || 0), category_id: cat,
        entity_id: d.entity_id || null, contact_id: d.contact_id || null, project_id: d.project_id || null,
        note: String(d.note || '').slice(0, 200), head_owner: d.head_owner || null,
        type: ['INCOME', 'EXPENSE', 'TRANSFER'].includes(dt) ? dt : (amount < 0 ? 'EXPENSE' : 'INCOME') });
    }
    const gap = balanceGap(head.total_amount, clean);
    if (Math.abs(gap) >= 0.005) return { error: `ยอดยังไม่ลงตัว ขาด/เกิน ${money(gap)} บาท`, gap, status: 400 };
    ops.push(env.DB.prepare(`DELETE FROM TransactionDetails WHERE transaction_id=?`).bind(txId));
    for (const d of clean) ops.push(detailInsert(env, txId, d));
  }
  if (ops.length) await env.DB.batch(ops);
  if (e.account_id) {                                              // ให้การเรียนรู้บัญชีใช้บัญชีที่คนเลือก
    const sug = parse(doc.suggestion, {}) || {};
    for (const leg of sug.legs || []) if (leg.transaction_id === txId) leg.account_id = e.account_id;
    await setDoc(env, docId, { suggestion: JSON.stringify(sug) });
  }
  if (e.confirm) return runAction(env, user, docId, 'accept', {});
  return { ok: true, status: 'EDITED' };
}

// ═══════════════════════════════════════════════════════════════
// ระยะ 2: นำเข้า statement → จับคู่ → สร้างรายการที่ขาด → กระทบยอด (2026-10-10)
//
//   ⚠️ D1 แผนฟรีจำกัดจำนวนคำสั่งต่อคำขอ (~50) → บรรทัด statement เก็บเป็น JSON ในแถวเดียว
//      และการสร้างรายการทำทีละชุด (CREATE_CHUNK บรรทัดต่อคำขอ) หน้าเว็บเรียกซ้ำจนครบ
//   สถานะบรรทัด: MATCHED (มีในระบบแล้ว) · NEW (ยังไม่มี) · CREATED (สร้างรอยืนยันแล้ว)
//                IGNORED (ข้าม) · DUPLICATE (อยู่ใน statement ฉบับก่อนแล้ว)
// ═══════════════════════════════════════════════════════════════
const CREATE_CHUNK = 8;
const STATEMENT_PROMPT = `You read a Thai bank account or credit-card statement (one or more page images, in page order).
Return ONLY JSON:
{"bank":"","account_number":"","period_from":"YYYY-MM-DD","period_to":"YYYY-MM-DD","opening_balance":null,"closing_balance":null,
 "lines":[{"date":"YYYY-MM-DD","time":"HH:MM:SS","description":"","ref_code":"","withdrawal":0,"deposit":0,"balance":null}]}
Rules:
- List EVERY transaction row in printed order across all pages. Skip headers, page totals and summary rows.
- A "balance brought forward / ยอดยกมา" row is not a transaction: put its amount in opening_balance.
- withdrawal = money OUT (ถอน, โอนออก, ชำระ, หักบัญชี, Debit, DR). deposit = money IN (ฝาก, รับโอน, Credit, CR). Put 0 on the empty side. Both are positive numbers.
- Credit card statement: purchases and fees are withdrawal, payments and refunds are deposit, balance null.
- balance = the running balance printed on that row, else null. closing_balance = last balance shown (or statement ending balance).
- Dates YYYY-MM-DD; convert Buddhist year (2569 or 69) to Christian (2026). time HH:MM:SS or null.
- description = the details/channel text as printed, including the counterparty name if shown. ref_code = reference number if shown else null.`;

async function extractStatement(env, files) {
  if (env.__statementOverride) return env.__statementOverride(files);           // ใช้ในเทสเท่านั้น
  if (!env.GEMINI_API_KEY) throw new Error('ยังไม่ได้ตั้ง GEMINI_API_KEY');
  const base = 'https://generativelanguage.googleapis.com';
  const model = env.GEMINI_STATEMENT_MODEL || env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const parts = [{ text: STATEMENT_PROMPT }];
  for (const f of files) {                                                     // ส่งไบต์ดิบ (ไม่แปลง base64 → ไม่กิน CPU)
    let part = null;
    try {
      const up = await fetch(`${base}/upload/v1beta/files?key=${env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'X-Goog-Upload-Protocol': 'raw', 'Content-Type': f.mime }, body: f.bytes });
      const uri = up.ok ? (await up.json())?.file?.uri : null;
      if (uri) part = { fileData: { mimeType: f.mime, fileUri: uri } };
    } catch { /* ถอยไปใช้ base64 */ }
    parts.push(part || { inlineData: { mimeType: f.mime, data: toBase64(f.bytes) } });
  }
  const res = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 60000 } }),
  });
  if (!res.ok) {
    let reason = '';
    try { const e = await res.json(); reason = e?.error?.message || e?.error?.status || ''; } catch { /* ไม่มีรายละเอียด */ }
    throw new Error(`AI อ่าน statement ไม่สำเร็จ (${res.status})${reason ? ': ' + String(reason).slice(0, 160) : ''}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') || '{}';
  return JSON.parse(text.trim().replace(/^```json\s*|```$/g, ''));
}

const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : null;
const lineKey = l => `${l.date}|${round2(l.amount).toFixed(2)}|${l.balance == null ? '' : round2(l.balance).toFixed(2)}|${String(l.description || '').replace(/\s+/g, '').toLowerCase().slice(0, 40)}`;

async function loadStatement(env, user, stmtId) {
  const st = await env.DB.prepare(`SELECT * FROM LedgerStatements WHERE stmt_id=? AND family_id=?`).bind(stmtId, user.family_id).first();
  if (!st) return null;
  const account = (await permittedAccounts(env, user)).find(a => a.account_id === st.account_id);
  if (!account) return null;
  return { st, account, lines: parse(st.lines, []) || [] };
}
async function saveStatementLines(env, stmtId, lines) {
  await env.DB.prepare(`UPDATE LedgerStatements SET lines=?, updated_at=? WHERE stmt_id=?`).bind(JSON.stringify(lines), nowIso(), stmtId).run();
}
/* บรรทัดใน statement อื่น ๆ ของบัญชีนี้ที่ช่วงวันซ้อนกัน → รายการที่ถูกจองไปแล้ว + บรรทัดที่เคยนำเข้า */
async function overlappingStatements(env, accountId, from, to, exceptId = '') {
  const rows = (await env.DB.prepare(`SELECT stmt_id, lines FROM LedgerStatements WHERE account_id=? AND stmt_id != ?
    AND IFNULL(period_from,'0000') <= ? AND IFNULL(period_to,'9999') >= ?`).bind(accountId, exceptId, shiftDate(to, 3), shiftDate(from, -3)).all()).results || [];
  const usedTx = new Set(), keys = new Map();
  for (const r of rows) for (const l of parse(r.lines, []) || []) {
    if (l.transaction_id && ['MATCHED', 'CREATED'].includes(l.status)) usedTx.add(l.transaction_id);
    if (l.status !== 'DUPLICATE') keys.set(lineKey(l), (keys.get(lineKey(l)) || 0) + 1);
  }
  return { usedTx, keys };
}

export async function importStatement(env, user, { account_id, files, file_name }) {
  const account = (await permittedAccounts(env, user)).find(a => a.account_id === account_id);
  if (!account) return { error: 'เลือกบัญชีที่มีสิทธิ์ใช้ก่อน', status: 403 };
  if (!files?.length) return { error: 'ไม่พบไฟล์ statement', status: 400 };
  if (files.length > 30) return { error: 'ส่งได้ไม่เกิน 30 หน้าต่อครั้ง', status: 400 };
  if (files.reduce((s, f) => s + f.bytes.length, 0) > 40 * 1024 * 1024) return { error: 'ไฟล์รวมใหญ่เกิน 40 MB', status: 400 };

  let ex;
  try { ex = await extractStatement(env, files); } catch (err) { return { error: err.message, status: 502 }; }
  const raw = (ex?.lines || []).map(l => ({
    date: validDate(l.date), time: /^\d{1,2}:\d{2}/.test(String(l.time || '')) ? String(l.time).slice(0, 8) : null,
    description: String(l.description || '').trim().slice(0, 200), ref_code: l.ref_code ? String(l.ref_code).trim().slice(0, 60) : null,
    amount: round2((Number(l.deposit) || 0) - (Number(l.withdrawal) || 0)),
    balance: l.balance == null || l.balance === '' || !Number.isFinite(Number(l.balance)) ? null : round2(l.balance),
  })).filter(l => l.date && l.amount);
  if (!raw.length) return { error: 'ไม่พบรายการใน statement (ลองรูปที่ชัดขึ้น หรือส่งทีละหน้า)', status: 422 };

  const fixed = fixStatementSigns(raw, ex.opening_balance, ex.closing_balance);
  const dates = fixed.lines.map(l => l.date).sort();
  const from = validDate(ex.period_from) && validDate(ex.period_from) <= dates[0] ? ex.period_from : dates[0];
  const to = validDate(ex.period_to) && validDate(ex.period_to) >= dates.at(-1) ? ex.period_to : dates.at(-1);

  // บรรทัดที่เคยนำเข้าจาก statement ฉบับอื่นแล้ว (อัปโหลดซ้ำ / ช่วงทับกัน) → ไม่สร้างซ้ำ
  const { usedTx, keys } = await overlappingStatements(env, account_id, from, to);
  const lines = fixed.lines.map((l, i) => ({ line_id: `L${i + 1}`, idx: i + 1, ...l, status: 'NEW', transaction_id: null, doc_id: null, score: null }));
  for (const l of lines) {
    const k = lineKey(l);
    if (keys.get(k) > 0) { keys.set(k, keys.get(k) - 1); l.status = 'DUPLICATE'; }
  }
  const txs = ((await env.DB.prepare(`SELECT transaction_id, date, time, total_amount, ref_code, status FROM Transactions
    WHERE account_id=? AND date >= ? AND date < ?`).bind(account_id, shiftDate(from, -3), shiftDate(to, 4)).all()).results || [])
    .filter(t => !usedTx.has(t.transaction_id));
  const open = lines.filter(l => l.status === 'NEW').map(l => ({ ...l, key: l.line_id }));
  const matches = matchStatementLines(open, txs);
  for (const l of lines) {
    const m = matches.get(l.line_id);
    if (m) Object.assign(l, { status: 'MATCHED', transaction_id: m.transaction_id, score: m.score });
  }
  const stmtId = newId('STM');
  await env.DB.prepare(`INSERT INTO LedgerStatements (stmt_id, family_id, account_id, period_from, period_to, opening_balance, closing_balance,
    line_count, lines, file_name, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(stmtId, user.family_id, account_id, from, to, fixed.opening, fixed.closing, lines.length, JSON.stringify(lines),
      String(file_name || '').slice(0, 120) || null, user.user_id, nowIso(), nowIso()).run();
  const view = await statementView(env, user, stmtId);
  return { ...view, import: { flipped: fixed.flipped, read: raw.length } };
}

export async function listStatements(env, user) {
  const accounts = await permittedAccounts(env, user);
  const ids = accounts.map(a => a.account_id);
  if (!ids.length) return { statements: [] };
  const rows = (await env.DB.prepare(`SELECT stmt_id, account_id, period_from, period_to, opening_balance, closing_balance, line_count, lines, file_name, created_at
    FROM LedgerStatements WHERE family_id=? AND account_id IN (${ids.map(() => '?').join(',')}) ORDER BY period_to DESC, created_at DESC LIMIT 100`)
    .bind(user.family_id, ...ids).all()).results || [];
  return { statements: rows.map(({ lines, ...r }) => {
    const ls = parse(lines, []) || [];
    const count = s => ls.filter(l => l.status === s).length;
    return { ...r, account_name: displayName(accounts.find(a => a.account_id === r.account_id)?.name || r.account_id),
      matched: count('MATCHED'), created: count('CREATED'), new: count('NEW'), ignored: count('IGNORED'), duplicate: count('DUPLICATE') };
  }) };
}

export async function statementView(env, user, stmtId) {
  const s = await loadStatement(env, user, stmtId);
  if (!s) return { error: 'ไม่พบ statement นี้', status: 404 };
  const { st, account, lines } = s;
  // รายการในระบบช่วงเดียวกัน (กว้างกว่า 7 วัน เผื่อเลือกจับคู่เอง)
  const txs = (await env.DB.prepare(`SELECT t.transaction_id, t.date, t.time, t.total_amount, t.ref_code, t.status, t.statement_desc, t.source,
      (SELECT d.note FROM TransactionDetails d WHERE d.transaction_id=t.transaction_id LIMIT 1) AS note,
      (SELECT d.category_id FROM TransactionDetails d WHERE d.transaction_id=t.transaction_id LIMIT 1) AS category_id
    FROM Transactions t WHERE t.account_id=? AND t.date >= ? AND t.date < ?`)
    .bind(st.account_id, shiftDate(st.period_from, -7), shiftDate(st.period_to, 8)).all()).results || [];
  const byId = new Map(txs.map(t => [t.transaction_id, t]));
  let changed = false;
  for (const l of lines) {                                         // รายการถูกลบไปแล้ว → กลับเป็น "ยังไม่มีในระบบ"
    if (['MATCHED', 'CREATED'].includes(l.status) && l.transaction_id && !byId.has(l.transaction_id)) {
      const still = await env.DB.prepare(`SELECT 1 AS x FROM Transactions WHERE transaction_id=?`).bind(l.transaction_id).first();
      if (!still) { Object.assign(l, { status: 'NEW', transaction_id: null, doc_id: null, score: null }); changed = true; }
    }
  }
  if (changed) await saveStatementLines(env, stmtId, lines);
  const { usedTx } = await overlappingStatements(env, st.account_id, st.period_from, st.period_to, stmtId);
  const mine = new Set(lines.filter(l => l.transaction_id).map(l => l.transaction_id));
  const free = txs.filter(t => !mine.has(t.transaction_id) && !usedTx.has(t.transaction_id));
  const catIds = [...new Set(txs.map(t => t.category_id).filter(Boolean))];
  const catNames = new Map(catIds.length ? ((await env.DB.prepare(`SELECT category_id, name FROM Categories WHERE category_id IN (${catIds.map(() => '?').join(',')})`)
    .bind(...catIds).all()).results || []).map(c => [c.category_id, displayName(c.name)]) : []);
  const txOut = t => t && { transaction_id: t.transaction_id, date: t.date, time: t.time, total_amount: t.total_amount, status: t.status,
    desc: t.note || t.statement_desc || '', category: t.category_id === UNCATEGORIZED ? 'ยังไม่ระบุ' : (catNames.get(t.category_id) || t.category_id || ''), source: t.source };
  const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  const outLines = lines.map(l => ({ ...l, tx: txOut(byId.get(l.transaction_id)),
    candidates: l.status === 'NEW' ? free.filter(t => Math.abs(round2(t.total_amount) - l.amount) < 0.005 && dayGap(t.date, l.date) <= 7)
      .sort((a, b) => dayGap(a.date, l.date) - dayGap(b.date, l.date)).slice(0, 3).map(txOut) : [] }));
  const systemOnly = free.filter(t => t.date >= st.period_from && t.date <= st.period_to).sort((a, b) => a.date.localeCompare(b.date)).map(txOut);

  const bal = await env.DB.prepare(`SELECT ROUND(COALESCE(SUM(CASE WHEN status='CONFIRMED' THEN total_amount END),0),2) AS confirmed,
      ROUND(COALESCE(SUM(CASE WHEN status='PENDING_REVIEW' THEN total_amount END),0),2) AS pending
    FROM Transactions WHERE account_id=? AND date <= ?`).bind(st.account_id, st.period_to).first();
  const counted = lines.filter(l => l.status !== 'DUPLICATE');
  const sum = round2(lines.reduce((x, l) => x + l.amount, 0));
  const count = k => lines.filter(l => l.status === k).length;
  return {
    statement: { stmt_id: st.stmt_id, account_id: st.account_id, period_from: st.period_from, period_to: st.period_to,
      opening_balance: st.opening_balance, closing_balance: st.closing_balance, file_name: st.file_name, created_at: st.created_at },
    account: { account_id: account.account_id, name: displayName(account.name), bank_name: account.bank_name },
    lines: outLines, system_only: systemOnly,
    summary: {
      total: lines.length, matched: count('MATCHED'), created: count('CREATED'), new: count('NEW'), ignored: count('IGNORED'), duplicate: count('DUPLICATE'),
      sum_in: round2(counted.filter(l => l.amount > 0).reduce((x, l) => x + l.amount, 0)),
      sum_out: round2(counted.filter(l => l.amount < 0).reduce((x, l) => x + l.amount, 0)),
      // ผลรวมทุกบรรทัดต้องเท่ากับ ยอดปิด − ยอดยกมา · ไม่เท่า = AI อ่านตก/อ่านเกิน
      read_gap: st.opening_balance != null && st.closing_balance != null ? round2(st.closing_balance - st.opening_balance - sum) : null,
      system_confirmed: bal?.confirmed ?? 0, system_pending: bal?.pending ?? 0,
      // ยอดในระบบ ณ วันสุดท้ายของ statement เทียบกับยอดปิดของธนาคาร (นับรายการรอยืนยันด้วย)
      balance_gap: st.closing_balance != null ? round2(st.closing_balance - (bal?.confirmed ?? 0) - (bal?.pending ?? 0)) : null,
    },
  };
}

/* สร้างรายการรอยืนยันจากบรรทัดที่ยังไม่มีในระบบ — ทีละ CREATE_CHUNK บรรทัด (คืน remaining ให้หน้าเว็บเรียกต่อ)
   ใช้แบบที่จำของคู่ค้า (คีย์จากคำอธิบายใน statement) · ยืนยันเองเมื่อคู่ค้านี้เคยยืนยันแบบเดิม ≥ 3 ครั้ง */
export async function createFromStatement(env, user, stmtId, body = {}) {
  const s = await loadStatement(env, user, stmtId);
  if (!s) return { error: 'ไม่พบ statement นี้', status: 404 };
  const { account, lines } = s;
  const want = Array.isArray(body.line_ids) && body.line_ids.length ? new Set(body.line_ids) : null;
  const todo = lines.filter(l => l.status === 'NEW' && (!want || want.has(l.line_id)));
  const batch = todo.slice(0, CREATE_CHUNK);
  const rules = await loadRules(env, user.family_id, 'PARTY');
  let created = 0, confirmed = 0;
  for (const l of batch) {
    const side = l.amount > 0 ? 'IN' : 'OUT';
    const rule = rules.get(statementPartyKey(l.description));
    const template = rule?.value && typeof rule.value === 'object' ? rule.value : null;
    const proposal = proposeLines({ total: l.amount, template,
      fallback: { category_id: UNCATEGORIZED, entity_id: account.entity_id, type: l.amount > 0 ? 'INCOME' : 'EXPENSE', note: l.description } });
    for (const d of proposal.lines) if (!d.note) d.note = l.description;
    const confident = (rule?.hits || 0) >= 3 && proposal.how === 'template-exact';
    const txId = newId('TX'), docId = newId('DOC');
    const party = { name: l.description };
    const ops = [env.DB.prepare(`INSERT INTO Transactions (transaction_id, account_id, ref_code, date, time, total_amount, statement_desc, status, source, slip_image_url, created_by_user_id)
      VALUES (?,?,?,?,?,?,?,?, 'PDF_IMPORT', NULL, ?)`).bind(txId, account.account_id, l.ref_code || null, l.date, l.time || null, round2(l.amount),
        l.description || null, confident ? 'CONFIRMED' : 'PENDING_REVIEW', user.user_id),
      ...proposal.lines.map(d => detailInsert(env, txId, d)),
      env.DB.prepare(`INSERT INTO LedgerDocs (doc_id, family_id, uploaded_by, source, doc_type, status, extracted, suggestion, transaction_id, created_at)
        VALUES (?,?,?, 'WEB', 'STATEMENT_LINE', ?, ?, ?, ?, ?)`).bind(docId, user.family_id, user.user_id, confident ? 'DONE' : 'SUGGESTED',
        JSON.stringify({ doc_type: 'STATEMENT_LINE', stmt_id: stmtId, line_id: l.line_id, date: l.date, time: l.time, amount: Math.abs(l.amount),
          memo: l.description, ref_code: l.ref_code, ...(side === 'IN' ? { sender: party } : { receiver: party }) }),
        JSON.stringify({ direction: side, party: l.description, legs: [{ side, account_id: account.account_id, kind: 'CREATED', transaction_id: txId, how: proposal.how }] }),
        txId, nowIso()),
      env.DB.prepare(`INSERT OR IGNORE INTO LedgerDocLinks (doc_id, transaction_id, role) VALUES (?,?, 'CREATED')`).bind(docId, txId)];
    await env.DB.batch(ops);
    Object.assign(l, { status: 'CREATED', transaction_id: txId, doc_id: docId });
    created++; if (confident) confirmed++;
  }
  if (created) await saveStatementLines(env, stmtId, lines);
  return { ok: true, created, auto_confirmed: confirmed, remaining: todo.length - batch.length };
}

/* จับคู่เอง / ข้าม / คืนสถานะ ของบรรทัดเดียว */
export async function statementLineAction(env, user, stmtId, lineId, body = {}) {
  const s = await loadStatement(env, user, stmtId);
  if (!s) return { error: 'ไม่พบ statement นี้', status: 404 };
  const l = s.lines.find(x => x.line_id === lineId);
  if (!l) return { error: 'ไม่พบบรรทัดนี้', status: 404 };
  if (body.action === 'match') {
    const tx = await env.DB.prepare(`SELECT transaction_id, total_amount FROM Transactions WHERE transaction_id=? AND account_id=?`)
      .bind(body.transaction_id, s.st.account_id).first();
    if (!tx) return { error: 'ไม่พบรายการในบัญชีนี้', status: 404 };
    if (Math.abs(round2(tx.total_amount) - l.amount) >= 0.005) return { error: 'ยอดไม่เท่ากัน จับคู่ไม่ได้', status: 400 };
    if (s.lines.some(x => x !== l && x.transaction_id === tx.transaction_id)) return { error: 'รายการนี้จับคู่กับบรรทัดอื่นแล้ว', status: 409 };
    Object.assign(l, { status: 'MATCHED', transaction_id: tx.transaction_id, score: null });
  } else if (body.action === 'ignore') {
    if (l.status === 'CREATED') return { error: 'สร้างรายการไปแล้ว — กด "ไม่ต้องบันทึก" ที่รายการในกล่องแทน', status: 409 };
    Object.assign(l, { status: 'IGNORED', transaction_id: null });
  } else if (body.action === 'reset') {
    if (l.status === 'CREATED') return { error: 'สร้างรายการไปแล้ว', status: 409 };
    Object.assign(l, { status: 'NEW', transaction_id: null, score: null });
  } else return { error: 'ไม่รู้จักคำสั่งนี้', status: 400 };
  await saveStatementLines(env, stmtId, s.lines);
  return { ok: true, line: l };
}

export async function deleteStatement(env, user, stmtId) {
  const s = await loadStatement(env, user, stmtId);
  if (!s) return { error: 'ไม่พบ statement นี้', status: 404 };
  await env.DB.prepare(`DELETE FROM LedgerStatements WHERE stmt_id=?`).bind(stmtId).run();
  return { ok: true };
}

/* อัปเดตบรรทัดของ statement จากเอกสาร STATEMENT_LINE (เช่น กด "ไม่ต้องบันทึก" ในกล่อง) */
async function markStatementLine(env, user, ex, fields) {
  if (!ex?.stmt_id || !ex?.line_id) return;
  try {
    const s = await loadStatement(env, user, ex.stmt_id);
    const l = s?.lines.find(x => x.line_id === ex.line_id);
    if (!l) return;
    Object.assign(l, fields);
    await saveStatementLines(env, ex.stmt_id, s.lines);
  } catch { /* ยังไม่มีตาราง statement — ข้าม */ }
}

// ═══════════════════════════════════════════════════════════════
// รวมเมนู "รอตรวจสอบ" เดิมเข้ากล่อง (2026-10-10)
// ═══════════════════════════════════════════════════════════════
const ADOPT_CHUNK = 25;   // D1 แผนฟรีจำกัดคำสั่งต่อคำขอ → รับเข้ากล่องทีละชุด (เปิดหน้าครั้งถัดไปรับต่อ)

/* รายการ "รอตรวจสอบ" ที่มาจากทางเดิม (นำเข้า PDF แบบเก่า · Excel/Bulk · จดในแอปหลัก · LINE รุ่นเก่า)
   ยังไม่มีเอกสารในกล่อง → สร้างเอกสารให้ (ไม่แตะตัวรายการ) เพื่อให้ยืนยัน/แก้/แตกบรรทัดได้ที่เดียว */
export async function adoptPendingTransactions(env, user) {
  let rows;
  try {
    rows = (await env.DB.prepare(`SELECT t.transaction_id, t.account_id, t.date, t.time, t.total_amount, t.statement_desc, t.source, t.ref_code,
        (SELECT d.note FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id LIMIT 1) AS note
      FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id
      WHERE up.user_id = ? AND t.status = 'PENDING_REVIEW'
        AND NOT EXISTS (SELECT 1 FROM LedgerDocLinks l WHERE l.transaction_id = t.transaction_id)
      ORDER BY t.date DESC LIMIT ?`).bind(user.user_id, ADOPT_CHUNK).all()).results || [];
  } catch { return 0; }
  if (!rows.length) return 0;
  const ops = [];
  for (const t of rows) {
    const side = t.total_amount > 0 ? 'IN' : 'OUT';
    const desc = String(t.note || t.statement_desc || '').slice(0, 200);
    const docType = t.source === 'PDF_IMPORT' ? 'STATEMENT_LINE' : t.source === 'WEB_GRID' ? 'MANUAL' : 'LEGACY';
    const party = { name: desc };
    const docId = newId('DOC');
    ops.push(env.DB.prepare(`INSERT INTO LedgerDocs (doc_id, family_id, uploaded_by, source, doc_type, status, extracted, suggestion, transaction_id, created_at)
      VALUES (?,?,?, 'WEB', ?, 'SUGGESTED', ?, ?, ?, ?)`).bind(docId, user.family_id, user.user_id, docType,
      JSON.stringify({ doc_type: docType, adopted: true, date: t.date, time: t.time, amount: Math.abs(t.total_amount), memo: desc, ref_code: t.ref_code,
        ...(side === 'IN' ? { sender: party } : { receiver: party }) }),
      JSON.stringify({ direction: side, party: desc, legs: [{ side, account_id: t.account_id, kind: 'CREATED', transaction_id: t.transaction_id, how: 'adopted' }] }),
      t.transaction_id, `${t.date}T${(t.time || '00:00:00').slice(0, 8)}Z`));
    ops.push(env.DB.prepare(`INSERT OR IGNORE INTO LedgerDocLinks (doc_id, transaction_id, role) VALUES (?,?, 'CREATED')`).bind(docId, t.transaction_id));
  }
  await env.DB.batch(ops);
  return rows.length;
}

/* เพิ่มรายการเอง (แทนปุ่ม "+ Add Item" ของหน้าเดิม) → รอยืนยัน แล้วหน้าเว็บเปิดตัวแก้ให้ใส่หมวด/แตกบรรทัด */
export async function createManual(env, user, b = {}) {
  const account = (await permittedAccounts(env, user)).find(a => a.account_id === b.account_id);
  if (!account) return { error: 'เลือกบัญชีที่มีสิทธิ์ใช้', status: 403 };
  const amount = round2(b.amount);
  if (!amount) return { error: 'ใส่ยอดเงิน', status: 400 };
  const date = validDate(b.date) || bangkokNow().slice(0, 10);
  const time = /^\d{1,2}:\d{2}/.test(String(b.time || '')) ? String(b.time).slice(0, 5) + ':00' : bangkokNow().slice(11, 19);
  const note = String(b.note || '').trim().slice(0, 200);
  const side = amount > 0 ? 'IN' : 'OUT';
  const rule = note ? await getRule(env, user.family_id, 'PARTY', partyKey(note)) : null;
  const proposal = proposeLines({ total: amount, template: rule?.value && typeof rule.value === 'object' ? rule.value : null,
    fallback: { category_id: UNCATEGORIZED, entity_id: account.entity_id, type: side === 'IN' ? 'INCOME' : 'EXPENSE', note } });
  for (const d of proposal.lines) if (!d.note) d.note = note;
  const txId = await createTransaction(env, user, { account_id: account.account_id, date, time, total_amount: amount, ref_code: null,
    statement_desc: note || null, source: 'WEB_GRID', status: 'PENDING_REVIEW', details: proposal.lines });
  const docId = newId('DOC');
  const party = { name: note };
  await env.DB.prepare(`INSERT INTO LedgerDocs (doc_id, family_id, uploaded_by, source, doc_type, status, extracted, suggestion, transaction_id, created_at)
    VALUES (?,?,?, 'WEB', 'MANUAL', 'SUGGESTED', ?, ?, ?, ?)`).bind(docId, user.family_id, user.user_id,
    JSON.stringify({ doc_type: 'MANUAL', date, time, amount: Math.abs(amount), memo: note, ...(side === 'IN' ? { sender: party } : { receiver: party }) }),
    JSON.stringify({ direction: side, party: note, legs: [{ side, account_id: account.account_id, kind: 'CREATED', transaction_id: txId, how: proposal.how }] }),
    txId, nowIso()).run();
  await linkDoc(env, docId, txId, 'CREATED');
  return { ok: true, doc_id: docId, transaction_id: txId, how: proposal.how };
}
