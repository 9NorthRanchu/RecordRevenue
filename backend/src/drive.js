// ═══════════════════════════════════════════════════════════════════════
// 📁 เก็บไฟล์ใน Google Drive ผ่าน Apps Script ของ North (2026-10-31 · North เลือก ก. Apps Script)
//  · เซิร์ฟเวอร์ถือ URL + รหัสลับของ Apps Script (ตาราง AppSettings ต่อครอบครัว · ไม่ส่งรหัสลับกลับหน้าเว็บ)
//  · หน้าเว็บส่งไฟล์ (base64) มาที่นี่ → ส่งต่อ Apps Script → เก็บ id/url ใน DriveFiles · ผูกกับ statement/รายการผ่าน DriveLinks
//  · ไฟล์เดิม (hash เดียวกัน) ไม่อัปซ้ำ แค่ผูกเพิ่ม · เปิดดู: GET /api/drive/file?id= (เซิร์ฟเวอร์ดึงจาก Drive ให้)
//  · ไฟล์ PDF ที่ล็อกรหัส เก็บต้นฉบับไว้ · หน้าเว็บปลดรหัสตอนเปิดดูด้วยรหัสของบัญชี (ไม่ปลดก่อนเก็บ)
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS AppSettings (family_id TEXT NOT NULL, skey TEXT NOT NULL, svalue TEXT, updated_at TEXT, PRIMARY KEY (family_id, skey))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS DriveFiles (file_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, drive_id TEXT NOT NULL, name TEXT, mime TEXT, size INTEGER,
      kind TEXT, account_id TEXT, file_hash TEXT, url TEXT, created_by TEXT, created_at TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_drivefiles_hash ON DriveFiles(family_id, file_hash)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS DriveLinks (file_id TEXT NOT NULL, ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, created_at TEXT, PRIMARY KEY (file_id, ref_type, ref_id))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_drivelinks_ref ON DriveLinks(ref_type, ref_id)`),
  ]);
  ready = true;
}
export { ensure as ensureDrive };

async function getCfg(env, fam) {
  const rows = ((await env.DB.prepare(`SELECT skey, svalue FROM AppSettings WHERE family_id = ? AND skey IN ('drive_url','drive_secret','drive_last_ok')`).bind(fam).all()).results) || [];
  return Object.fromEntries(rows.map(r => [r.skey, r.svalue]));
}
async function setCfg(env, fam, kv) {
  const now = new Date().toISOString();
  await env.DB.batch(Object.entries(kv).map(([k, v]) => env.DB.prepare(`INSERT OR REPLACE INTO AppSettings (family_id, skey, svalue, updated_at) VALUES (?, ?, ?, ?)`).bind(fam, k, v, now)));
}
/* เรียก Apps Script (POST → Google ส่ง 302 ไปหน้าผลลัพธ์ · fetch ตามให้เอง) */
export async function callGas(cfg, body, fetchImpl = fetch) {
  if (!cfg.drive_url || !cfg.drive_secret) throw new Error('ยังไม่ได้ตั้งค่า Google Drive');
  const r = await fetchImpl(cfg.drive_url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, secret: cfg.drive_secret }), redirect: 'follow' });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(/<html/i.test(t) ? 'Apps Script ตอบเป็นหน้าเว็บ — ตรวจว่า Deploy เป็น Web app และให้ "Anyone" เข้าถึงได้' : 'Apps Script ตอบไม่ถูกต้อง'); }
  if (j.error) throw new Error(j.error);
  return j;
}

export async function handleDrive({ url, request, env, cors, authUserId, canUseAccount, deny, fetchImpl }) {
  const p = url.pathname;
  if (!p.startsWith('/api/drive/')) return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  await ensure(env);
  const u = await env.DB.prepare(`SELECT family_id, role FROM Users WHERE user_id = ?`).bind(authUserId).first();
  if (!u) return json({ error: 'Unauthorized' }, cors, 401);
  const fam = u.family_id, gas = b => callGas(cfg, b, fetchImpl);
  let cfg = await getCfg(env, fam);

  if (p === '/api/drive/config' && request.method === 'GET')
    return json({ configured: !!(cfg.drive_url && cfg.drive_secret), url: cfg.drive_url ? cfg.drive_url.replace(/(\/s\/.{6}).+(.{6}\/exec)$/, '$1…$2') : null, last_ok: cfg.drive_last_ok || null }, cors);

  if (p === '/api/drive/config' && request.method === 'POST') {
    if (u.role !== 'admin') return deny('เฉพาะ Admin ตั้งค่า Google Drive ได้');
    const b = await request.json().catch(() => ({}));
    const urlIn = String(b.url || '').trim(), sec = String(b.secret || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(urlIn)) return json({ error: 'URL ต้องเป็นของ Apps Script และลงท้ายด้วย /exec' }, cors, 400);
    if (sec.length < 8 && !cfg.drive_secret) return json({ error: 'รหัสลับต้องยาวอย่างน้อย 8 ตัว' }, cors, 400);
    const next = { drive_url: urlIn, drive_secret: sec || cfg.drive_secret };
    let ping; try { ping = await callGas(next, { action: 'ping' }, fetchImpl); } catch (e) { return json({ error: 'เชื่อมต่อไม่สำเร็จ: ' + e.message }, cors, 400); }
    await setCfg(env, fam, { ...next, drive_last_ok: new Date().toISOString() });
    return json({ success: true, root: ping.root, user: ping.user }, cors);
  }

  if (p === '/api/drive/test' && request.method === 'POST') {
    try { const r = await gas({ action: 'ping' }); await setCfg(env, fam, { drive_last_ok: new Date().toISOString() }); return json({ success: true, root: r.root, user: r.user }, cors); }
    catch (e) { return json({ error: e.message }, cors, 400); }
  }

  if (p === '/api/drive/upload' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const links = (Array.isArray(b.links) ? b.links : []).filter(l => ['stmt', 'tx'].includes(l?.type) && l.id).slice(0, 20);
    if (b.account_id && !(await canUseAccount(String(b.account_id)))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    const hash = String(b.hash || '').slice(0, 64) || null;
    let file = hash ? await env.DB.prepare(`SELECT * FROM DriveFiles WHERE family_id = ? AND file_hash = ?`).bind(fam, hash).first() : null;
    const reused = !!file;
    if (!file) {
      if (!b.data || !b.name) return json({ error: 'ไม่มีไฟล์' }, cors, 400);
      if (String(b.data).length > 28_000_000) return json({ error: 'ไฟล์ใหญ่เกิน 20MB' }, cors, 413);
      const kind = ['statement', 'slip', 'expense'].includes(b.kind) ? b.kind : 'statement';
      const acc = b.account_id ? await env.DB.prepare(`SELECT name FROM Accounts WHERE account_id = ?`).bind(String(b.account_id)).first() : null;
      const ym = /^\d{4}-\d{2}/.test(b.date || '') ? String(b.date).slice(0, 7) : new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
      const path = kind === 'statement' ? ['Statement', acc?.name || b.account_id || 'ไม่ระบุบัญชี', ym.slice(0, 4)] : [kind === 'slip' ? 'Slip' : 'Expense', ym];
      let up; try { up = await gas({ action: 'upload', path, name: String(b.name).slice(0, 150), mime: b.mime || 'application/octet-stream', data: b.data, description: b.description || '' }); }
      catch (e) { return json({ error: 'อัปโหลดไป Drive ไม่สำเร็จ: ' + e.message }, cors, 502); }
      file = { file_id: 'DF-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), family_id: fam, drive_id: up.id, name: String(b.name).slice(0, 150), mime: b.mime || null,
        size: up.size || null, kind, account_id: b.account_id || null, file_hash: hash, url: up.url || null, created_by: authUserId, created_at: new Date().toISOString() };
      await env.DB.prepare(`INSERT INTO DriveFiles (file_id, family_id, drive_id, name, mime, size, kind, account_id, file_hash, url, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(file.file_id, fam, file.drive_id, file.name, file.mime, file.size, file.kind, file.account_id, file.file_hash, file.url, file.created_by, file.created_at).run();
    }
    if (links.length) await env.DB.batch(links.map(l => env.DB.prepare(`INSERT OR IGNORE INTO DriveLinks (file_id, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?)`).bind(file.file_id, l.type, String(l.id), new Date().toISOString())));
    return json({ success: true, reused, file: { file_id: file.file_id, name: file.name, url: file.url, mime: file.mime } }, cors);
  }

  /* 🧾 สลิป/เอกสารจาก LINE (เก็บใน R2) → สำเนาลง Drive (2026-10-31) · ทีละไม่เกิน 8 ไฟล์ต่อครั้ง (หน้าเว็บเรียกซ้ำจนหมด)
     ผูกกับรายการที่สลิปนั้นจับคู่อยู่ · hash = "r2:<file_key>" กันอัปซ้ำ */
  if (p === '/api/drive/sync-slips' && request.method === 'POST') {
    if (!cfg.drive_url) return json({ error: 'ยังไม่ได้ตั้งค่า Google Drive' }, cors, 400);
    if (!env.ICONS) return json({ error: 'ไม่พบที่เก็บไฟล์สลิป' }, cors, 500);
    const pendingSql = `FROM LedgerDocs d WHERE d.family_id = ? AND d.file_key IS NOT NULL AND d.file_key != ''
        AND EXISTS (SELECT 1 FROM LedgerDocLinks l WHERE l.doc_id = d.doc_id)
        AND NOT EXISTS (SELECT 1 FROM DriveFiles f WHERE f.family_id = d.family_id AND f.file_hash = 'r2:' || d.file_key)`;
    const docs = ((await env.DB.prepare(`SELECT d.doc_id, d.file_key, d.mime, d.file_name, d.doc_type, d.created_at ${pendingSql} ORDER BY d.created_at LIMIT 8`).bind(fam).all()).results) || [];
    let done = 0, missing = 0; const errors = [];
    for (const d of docs) {
      const links = ((await env.DB.prepare(`SELECT l.transaction_id, t.account_id, t.date FROM LedgerDocLinks l JOIN Transactions t ON t.transaction_id = l.transaction_id WHERE l.doc_id = ?`).bind(d.doc_id).all()).results) || [];
      const obj = await env.ICONS.get(d.file_key);
      const hash = 'r2:' + d.file_key, now = new Date().toISOString();
      if (!obj) {   // ไฟล์ใน R2 หมดอายุแล้ว → จดไว้ว่าไม่มี จะได้ไม่วนหาอีก
        await env.DB.prepare(`INSERT INTO DriveFiles (file_id, family_id, drive_id, name, mime, kind, file_hash, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind('DF-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), fam, '', d.file_name || d.doc_id, d.mime, 'missing', hash, authUserId, now).run();
        missing++; continue;
      }
      const buf = new Uint8Array(await obj.arrayBuffer()); let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const ym = String(links[0]?.date || d.created_at || now).slice(0, 7);
      const ext = /pdf/.test(d.mime || '') ? '.pdf' : /png/.test(d.mime || '') ? '.png' : '.jpg';
      const name = (d.file_name && /\.\w{2,4}$/.test(d.file_name) ? d.file_name : `${String(links[0]?.date || d.created_at || '').slice(0, 10)}_${d.doc_type || 'SLIP'}_${d.doc_id.slice(-6)}${ext}`);
      try {
        const up = await gas({ action: 'upload', path: ['Slip', ym], name, mime: d.mime || 'image/jpeg', data: btoa(bin), description: `RecordRevenue ${d.doc_id}` });
        const fid = 'DF-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.DB.batch([env.DB.prepare(`INSERT INTO DriveFiles (file_id, family_id, drive_id, name, mime, size, kind, account_id, file_hash, url, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(fid, fam, up.id, name, d.mime || null, up.size || null, 'slip', links[0]?.account_id || null, hash, up.url || null, authUserId, now),
          ...links.map(l => env.DB.prepare(`INSERT OR IGNORE INTO DriveLinks (file_id, ref_type, ref_id, created_at) VALUES (?, 'tx', ?, ?)`).bind(fid, l.transaction_id, now))]);
        done++;
      } catch (e) { errors.push(e.message); break; }
    }
    const remaining = (await env.DB.prepare(`SELECT COUNT(*) AS n ${pendingSql}`).bind(fam).first())?.n || 0;
    return json({ success: !errors.length, done, missing, remaining, error: errors[0] || null }, cors);
  }

  /* ✂️ เลิกผูกไฟล์กับรายการ (ไฟล์ใน Drive ยังอยู่) */
  if (p === '/api/drive/unlink' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const f = await env.DB.prepare(`SELECT file_id, account_id FROM DriveFiles WHERE file_id = ? AND family_id = ?`).bind(String(b.file_id || ''), fam).first();
    if (!f) return json({ error: 'ไม่พบไฟล์' }, cors, 404);
    if (f.account_id && !(await canUseAccount(f.account_id))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    await env.DB.prepare(`DELETE FROM DriveLinks WHERE file_id = ? AND ref_type = ? AND ref_id = ?`).bind(f.file_id, String(b.ref_type || ''), String(b.ref_id || '')).run();
    return json({ success: true }, cors);
  }

  if (p === '/api/drive/files' && request.method === 'GET') {
    const t = url.searchParams.get('ref_type'), ids = String(url.searchParams.get('ref_ids') || '').split(',').filter(Boolean).slice(0, 90);
    if (!['stmt', 'tx'].includes(t) || !ids.length) return json({ files: [] }, cors);
    const rows = ((await env.DB.prepare(`SELECT l.ref_id, f.file_id, f.name, f.mime, f.size, f.url, f.kind, f.created_at FROM DriveLinks l JOIN DriveFiles f ON f.file_id = l.file_id
        WHERE l.ref_type = ? AND l.ref_id IN (${ids.map(() => '?').join(',')}) AND f.family_id = ? AND f.drive_id != '' ORDER BY f.created_at`).bind(t, ...ids, fam).all()).results) || [];
    return json({ files: rows }, cors);
  }

  if (p === '/api/drive/file' && request.method === 'GET') {
    const f = await env.DB.prepare(`SELECT * FROM DriveFiles WHERE file_id = ? AND family_id = ?`).bind(url.searchParams.get('id') || '', fam).first();
    if (!f) return json({ error: 'ไม่พบไฟล์' }, cors, 404);
    if (f.account_id && !(await canUseAccount(f.account_id))) return deny('ไม่มีสิทธิ์ใช้บัญชีนี้');
    let g; try { g = await gas({ action: 'get', id: f.drive_id }); } catch (e) { return json({ error: 'ดึงไฟล์จาก Drive ไม่สำเร็จ: ' + e.message }, cors, 502); }
    const bin = Uint8Array.from(atob(g.data), c => c.charCodeAt(0));
    return new Response(bin, { headers: { ...cors, 'Content-Type': g.mime || f.mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name || 'file')}` } });
  }
  return null;
}
