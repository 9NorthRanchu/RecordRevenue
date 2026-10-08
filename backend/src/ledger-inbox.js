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
//
//   ตาราง (setup-db.sh): LedgerDocs · LedgerDocLinks · LedgerRules
//   ไฟล์อยู่ใน R2 (binding ICONS) ใต้ ledger-docs/ — serveIcon ของทริปปฏิเสธ prefix นี้แล้ว
//   ⚠️ Transactions.source/status ในฐานจริงมี CHECK — ใช้ได้แค่ค่าเดิม:
//      source: LINE_SLIP · LINE_TEXT · PDF_IMPORT · WEB_GRID · status: PENDING_REVIEW · CONFIRMED
// ═══════════════════════════════════════════════════════════════
import {
  round2, bankKey, last4, accountHintKey, partyKey, parseCashText, slipDirection,
  scoreCandidate, decideMatch, balanceGap, proposeLines, templateFromDetails,
} from './ledger-match.js';

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
  if (path === '/api/line-webhook' && request.method === 'POST') return handleLineWebhook(request, env, hooks);
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
    SELECT a.account_id, a.name, a.bank_name, a.account_number, a.entity_id, a.account_type
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
  if (!res.ok) throw new Error(`AI อ่านเอกสารไม่สำเร็จ (${res.status})`);
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
  const key = partyKey(party);
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
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);
  const marks = OPEN_STATUSES.map(() => '?').join(',');
  const docs = (await env.DB.prepare(`SELECT * FROM LedgerDocs WHERE family_id=? ${all ? '' : `AND status IN (${marks})`}
    ORDER BY created_at DESC LIMIT ?`).bind(user.family_id, ...(all ? [] : OPEN_STATUSES), limit).all()).results || [];
  if (!docs.length) return { docs: [] };
  const ids = docs.map(d => d.doc_id);
  const links = (await env.DB.prepare(`SELECT l.doc_id, l.role, t.transaction_id, t.account_id, t.date, t.time, t.total_amount,
      t.status, t.statement_desc FROM LedgerDocLinks l JOIN Transactions t ON t.transaction_id=l.transaction_id
      WHERE l.doc_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
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
  for (const event of body.events || []) {
    try { await handleLineEvent(env, event, hooks); }
    catch (err) { if (event.replyToken) await lineReply(env, event.replyToken, `❌ มีข้อผิดพลาด: ${err.message}`); }
  }
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
    const body = action === 'account' ? { account_id: arg, side } : action === 'link' ? { transaction_id: arg } : {};
    const out = await runAction(env, user, docId, action, body);
    if (out.error) return lineReply(env, token, `⚠️ ${out.error}`);
    if (action === 'dismiss') return lineReply(env, token, '🗑️ ไม่บันทึกรายการนี้แล้ว');
    if (action === 'accept' || action === 'link') return lineReply(env, token, '✅ บันทึกเรียบร้อย');
    return replyOutcome(env, token, user, out);                 // account → ประมวลผลใหม่แล้ว ตอบผลรอบใหม่
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
    return replyOutcome(env, token, user, out);
  }
  if (msg.type === 'text') {
    const text = String(msg.text || '').trim();
    // "อ่านใหม่" → อ่านเอกสารล่าสุดที่ค้าง/อ่านไม่สำเร็จซ้ำ (ทีละใบ เพื่อไม่ให้เกินเพดาน CPU)
    if (/^(อ่านใหม่|ลองใหม่|retry)$/i.test(text)) {
      const stuck = (await env.DB.prepare(`SELECT doc_id FROM LedgerDocs WHERE family_id=? AND uploaded_by=? AND status IN ('READING','ERROR')
        AND file_key IS NOT NULL ORDER BY created_at DESC LIMIT 5`).bind(user.family_id, user.user_id).all()).results || [];
      if (!stuck.length) return lineReply(env, token, '👍 ไม่มีเอกสารค้างครับ');
      const out = await retryDoc(env, user, stuck[0].doc_id);
      if (stuck.length > 1) out.note = `ยังค้างอีก ${stuck.length - 1} ใบ พิมพ์ \"อ่านใหม่\" อีกครั้ง`;
      return replyOutcome(env, token, user, out);
    }
    if (!SUMMARY_WORDS.test(text) && parseCashText(text)) {
      const out = await recordCash(env, user, { text }, 'LINE');
      if (out.error) return lineReply(env, token, `⚠️ ${out.error}`);
      const cat = await categoryName(env, out.category_id);
      return lineReply(env, token,
        `${out.auto_confirmed ? '✅ บันทึกแล้ว' : '📝 จดไว้แล้ว รอยืนยัน'}\n${out.note || 'เงินสด'} ${money(out.amount)} บาท\nจาก ${out.account.name}\nหมวด: ${cat}`,
        out.auto_confirmed ? [] : [qr('✓ ถูกต้อง', `inbox|accept|${out.doc_id}`), qr('ไม่ต้องบันทึก', `inbox|dismiss|${out.doc_id}`)]);
    }
    if (hooks.summary) return hooks.summary(event, user, env);
  }
}

async function categoryName(env, id) {
  if (!id || id === UNCATEGORIZED) return 'ยังไม่ระบุ (เลือกในเว็บ)';
  const r = await env.DB.prepare(`SELECT name FROM Categories WHERE category_id=?`).bind(id).first();
  return r?.name || id;
}

const qr = (label, data) => ({ type: 'action', action: { type: 'postback', label: label.slice(0, 20), data, displayText: label.slice(0, 20) } });

async function replyOutcome(env, token, user, out) {
  // ข้อความแถมท้าย (เช่น "ยังค้างอีก 2 ใบ") ต่อท้ายทุกคำตอบ — reply token ใช้ได้ครั้งเดียว ส่งแยกไม่ได้
  const say = (text, quick) => lineReply(env, token, out.note ? `${text}\n\n${out.note}` : text, quick);
  const web = env.WEB_APP_URL || 'https://record-revenue-web.pages.dev';
  if (out.error && !out.doc) return say(`⚠️ ${out.error}`);
  if (out.duplicate) return say('🔁 เอกสารนี้เคยส่งมาแล้ว ไม่บันทึกซ้ำครับ');
  const doc = out.doc, ex = doc?.extracted || {}, id = doc?.doc_id;
  const amountLine = ex.amount ? `${money(ex.amount)} บาท${ex.date ? ` · ${ex.date}` : ''}` : '';
  switch (out.outcome) {
    case 'ERROR': return say(`❌ อ่านเอกสารไม่สำเร็จ แต่เก็บไฟล์ไว้แล้ว\n${out.error || ''}\nพิมพ์ "อ่านใหม่" เพื่อลองอีกครั้ง`);
    case 'NEEDS_ACCOUNT':
      return say(`🧾 ${amountLine}\n${ex.sender?.name || '?'} → ${ex.receiver?.name || '?'}\nเป็นบัญชีไหนของเราครับ? (ตอบครั้งเดียว ครั้งหน้าจำให้)`,
        [...out.options.slice(0, 11).map(o => qr(`${o.side === 'IN' ? 'รับเข้า' : 'จ่ายจาก'} ${o.account_id}`, `inbox|account|${id}|${o.account_id}|${o.side}`)),
          qr('ไม่ต้องบันทึก', `inbox|dismiss|${id}`)]);
    case 'MATCHED': return say(`✅ จับคู่กับรายการเดิมแล้ว\n${amountLine}\nแนบสลิปเป็นหลักฐานเรียบร้อย`);
    case 'ATTACHED': return say(`📎 แนบเอกสารกับรายการจ่าย ${amountLine} แล้ว`);
    case 'STORED': return say(`📎 ${doc.suggestion?.note || 'เก็บเอกสารไว้แล้ว'}`);
    case 'NEEDS_CHOICE': {
      const leg = (out.legs || []).find(l => l.kind === 'CHOOSE');
      const choices = (leg?.choices || []).slice(0, 4);
      return lineReply(env, token,
        `🤔 ${amountLine}\nเจอรายการที่ยอดตรงกันหลายรายการ เลือกอันที่ใช่ครับ\n${choices.map((c, i) => `${i + 1}. ${c.date} ${c.statement_desc || ''}`).join('\n')}`,
        [...choices.map((c, i) => qr(`${i + 1}. ${String(c.date).slice(5, 10)} ${money(Math.abs(c.total_amount))}`, `inbox|link|${id}|${c.transaction_id}`)),
          qr('ไม่ต้องบันทึก', `inbox|dismiss|${id}`)]);
    }
    case 'SUGGESTED': {
      const legs = out.legs || [];
      const created = legs.find(l => l.kind === 'CREATED');
      const accounts = await permittedAccounts(env, user);
      const accName = accId => accounts.find(a => a.account_id === accId)?.name || accId;
      const head = doc.suggestion?.direction === 'TRANSFER'
        ? `🔁 โอนระหว่างบัญชี ${amountLine}\n${legs.map(l => accName(l.account_id)).join(' → ')}`
        : created?.side === 'IN' ? `💰 รับเงิน ${amountLine}\nเข้า ${accName(created.account_id)}\nจาก ${ex.sender?.name || '-'}`
        : `💸 จ่าย ${amountLine}\nจาก ${accName(created?.account_id)}\nให้ ${ex.receiver?.name || '-'}`;
      const first = await env.DB.prepare(`SELECT category_id FROM TransactionDetails WHERE transaction_id=? LIMIT 1`).bind(created?.transaction_id).first();
      const learned = String(created?.how || '').startsWith('template') ? ' (จำจากครั้งก่อน)' : '';
      return say(`${head}\nหมวด: ${await categoryName(env, first?.category_id)}${learned}\n\nแก้/แตกรายการในเว็บ: ${web}?txId=${created?.transaction_id}`,
        [qr('✓ ถูกต้อง', `inbox|accept|${id}`), qr('ไม่ต้องบันทึก', `inbox|dismiss|${id}`)]);
    }
    default: return say('📥 รับเอกสารแล้ว');
  }
}

async function lineReply(env, replyToken, text, quick = []) {
  const message = { type: 'text', text: String(text).slice(0, 4900) };
  if (quick.length) message.quickReply = { items: quick.slice(0, 13) };
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
}
