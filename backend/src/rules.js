// ═══════════════════════════════════════════════════════════════════════
// ⚡ กฎอัตโนมัติ (v257 · 2026-11-01 · North: "ทำเลย" — ร้าน/ผู้รับที่ยืนยันหมวดเดิมซ้ำ → ยืนยันให้เองตอนนำเข้า ไม่ต้องผ่านรอตรวจ)
//  กฎ = ทิศ (OUT/IN) + ผู้รับ/ร้าน (payeeKey ของ statementKey — ตรงกับ PendGroups.keyOf ใน app.js) [+ บัญชี] → หมวด · Company · คู่ค้า
//  Company ในกฎว่าง → ใช้ Company เริ่มต้นของบัญชี (Accounts.tx_entity_id)
//  GET  /api/rules          → { rules, suggestions } (แนะนำ: ยืนยันแล้ว ≥ 3 ครั้ง หมวดเดียวกัน ≥ 90%)
//  POST /api/rules/save     { dir, payee, category_id, entity_id?, contact_id?, account_id? } (ซ้ำ = แก้กฎเดิม)
//  POST /api/rules/delete   { rule_id } · POST /api/rules/toggle { rule_id, active }
//  POST /api/rules/apply    → รายการรอตรวจจาก statement (PDF_IMPORT · บรรทัดย่อยเดียว) ที่ตรงกฎ → ใส่หมวด + ยืนยัน
// ═══════════════════════════════════════════════════════════════════════
import { SIGNED_AMOUNT_SQL } from './stmt-report.js';
import { ensureTxEntityCol } from './account-defaults.js';

const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const PAYEE_DROP = new Set(['bay', 'scb', 'kbank', 'ktb', 'bbl', 'ttb', 'gsb', 'kma', 'baac', 'uob', 'cimb', 'lhb', 'ghb', 'tisco', 'kkp', 'พร้อมเพย์', 'promptpay', 'x', 'for', 'tha', 'th', 'bangkok']);
export const statementKey = desc => { const k = String(desc || '').toLowerCase().replace(/[x*]{2,}/g, ' ').replace(/[0-9]+/g, ' ').replace(/[^a-z฀-๿]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); return k.length >= 3 ? k : null; };
export const payeeKey = k => { const p = String(k || '').split(' ').filter(w => w && !PAYEE_DROP.has(w)).join(' '); return p.length >= 3 ? p : null; };
export const ruleKeyOf = desc => { const k = statementKey(desc); return k ? (payeeKey(k) || k) : null; };

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AutoRules (rule_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, dir TEXT NOT NULL, payee TEXT NOT NULL, account_id TEXT,
    category_id TEXT NOT NULL, entity_id TEXT, contact_id TEXT, type TEXT, active INTEGER DEFAULT 1, hits INTEGER DEFAULT 0, sample TEXT, created_by TEXT, created_at TEXT)`).run();
  try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_autorules_fam ON AutoRules(family_id, dir, payee)`).run(); } catch { /* */ }
  await ensureTxEntityCol(env);
  ready = true;
}
async function typeOf(env, catId, amt) {
  const c = await env.DB.prepare(`SELECT * FROM Categories WHERE category_id = ?`).bind(catId).first();
  return ['INCOME', 'EXPENSE', 'TRANSFER'].includes(c?.default_type) ? c.default_type : (amt < 0 ? 'EXPENSE' : 'INCOME');
}

export async function handleRules({ url, request, env, cors, authUserId }) {
  const p = url.pathname;
  if (p !== '/api/rules' && !p.startsWith('/api/rules/')) return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  await ensure(env);
  const me = await env.DB.prepare(`SELECT user_id, family_id FROM Users WHERE user_id = ?`).bind(authUserId).first();
  if (!me) return json({ error: 'Unauthorized' }, cors, 401);
  const accRows = ((await env.DB.prepare(`SELECT a.account_id, a.tx_entity_id FROM Accounts a JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?`).bind(authUserId).all()).results) || [];
  const accs = new Map(accRows.map(a => [a.account_id, a]));
  const ruleList = async () => ((await env.DB.prepare(`SELECT * FROM AutoRules WHERE family_id = ? ORDER BY hits DESC, created_at DESC`).bind(me.family_id).all()).results) || [];
  const pendingRows = async () => {
    const ids = [...accs.keys()], out = [];
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      out.push(...((((await env.DB.prepare(`SELECT t.transaction_id, t.account_id, t.statement_desc, ROUND(${SIGNED_AMOUNT_SQL}, 2) AS amt,
          (SELECT COUNT(*) FROM TransactionDetails d WHERE d.transaction_id = t.transaction_id) AS nd
        FROM Transactions t WHERE t.status = 'PENDING_REVIEW' AND t.source = 'PDF_IMPORT' AND t.account_id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || [])));
    }
    return out.filter(r => r.nd <= 1);
  };
  /* กฎที่ใช้กับรายการ: กฎเฉพาะบัญชีก่อน แล้วกฎทั่วไป */
  const matcher = rules => { const m = new Map(); for (const r of rules.filter(r => r.active)) m.set(`${r.dir}|${r.payee}|${r.account_id || ''}`, r);
    return t => { const k = ruleKeyOf(t.statement_desc); if (!k) return null; const dir = t.amt < 0 ? 'OUT' : 'IN'; return m.get(`${dir}|${k}|${t.account_id}`) || m.get(`${dir}|${k}|`) || null; }; };

  if (p === '/api/rules' && request.method === 'GET') {
    const rules = await ruleList(), pend = await pendingRows(), match = matcher(rules);
    const pendBy = {}; for (const t of pend) { const k = ruleKeyOf(t.statement_desc); if (k) { const kk = (t.amt < 0 ? 'OUT|' : 'IN|') + k; pendBy[kk] = (pendBy[kk] || 0) + 1; } }
    const ruleHits = {}; for (const t of pend) { const r = match(t); if (r) ruleHits[r.rule_id] = (ruleHits[r.rule_id] || 0) + 1; }
    /* แนะนำจากประวัติที่ยืนยันแล้ว (บรรทัดย่อยเดียว มีหมวด) */
    const hist = ((await env.DB.prepare(`SELECT t.statement_desc, t.total_amount, MIN(d.category_id) AS category_id, MIN(d.contact_id) AS contact_id, MIN(d.entity_id) AS entity_id, COUNT(d.detail_id) AS n_lines, MAX(t.date) AS last
        FROM Transactions t JOIN Accounts a ON a.account_id = t.account_id JOIN UserPermissions up ON up.entity_id = a.entity_id AND up.user_id = ?
        JOIN TransactionDetails d ON d.transaction_id = t.transaction_id
        WHERE t.status = 'CONFIRMED' AND t.statement_desc IS NOT NULL
        GROUP BY t.transaction_id HAVING n_lines = 1 AND category_id IS NOT NULL AND category_id != 'Cat_Uncategorized' AND category_id != 'Bank_Transfer'
        ORDER BY t.date DESC LIMIT 5000`).bind(authUserId).all()).results) || [];
    const g = {};
    for (const h of hist) { const k = ruleKeyOf(h.statement_desc); if (!k) continue; const kk = (Number(h.total_amount) < 0 ? 'OUT|' : 'IN|') + k;
      const x = g[kk] ||= { n: 0, cats: {}, sample: h.statement_desc }; x.n++;
      const c = x.cats[h.category_id] ||= { n: 0, ent: {}, con: {} }; c.n++; if (h.entity_id) c.ent[h.entity_id] = (c.ent[h.entity_id] || 0) + 1; if (h.contact_id) c.con[h.contact_id] = (c.con[h.contact_id] || 0) + 1; }
    const have = new Set(rules.map(r => `${r.dir}|${r.payee}`)), top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const suggestions = [];
    for (const [kk, x] of Object.entries(g)) {
      if (x.n < 3 || have.has(kk)) continue;
      const [cat, c] = Object.entries(x.cats).sort((a, b) => b[1].n - a[1].n)[0];
      if (c.n / x.n < 0.9) continue;
      const [dir, payee] = [kk.slice(0, kk.indexOf('|')), kk.slice(kk.indexOf('|') + 1)];
      const ent = top(c.ent), con = top(c.con);
      suggestions.push({ dir, payee, category_id: cat, entity_id: ent && c.ent[ent] / c.n >= 0.9 ? ent : null, contact_id: con && c.con[con] / c.n >= 0.9 ? con : null,
        history: x.n, share: Math.round(c.n / x.n * 100), pending: pendBy[kk] || 0, sample: x.sample });
    }
    suggestions.sort((a, b) => b.pending - a.pending || b.history - a.history);
    return json({ rules: rules.map(r => ({ ...r, pending: ruleHits[r.rule_id] || 0 })), suggestions: suggestions.slice(0, 200), pending_total: pend.length }, cors);
  }

  if (p === '/api/rules/save' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const list = Array.isArray(b.rules) ? b.rules : [b], saved = [];
    for (const x of list.slice(0, 300)) {
      const dir = x.dir === 'IN' ? 'IN' : 'OUT', payee = String(x.payee || '').trim().toLowerCase().slice(0, 60);
      if (payee.length < 3 || !x.category_id) return json({ error: 'กฎต้องมีชื่อผู้รับ/ร้าน และหมวด' }, cors, 400);
      if (!(await env.DB.prepare(`SELECT 1 FROM Categories WHERE category_id = ? AND (family_id = ? OR family_id IS NULL)`).bind(x.category_id, me.family_id).first())) return json({ error: `ไม่พบหมวด ${x.category_id}` }, cors, 400);
      if (x.account_id && !accs.has(x.account_id)) return json({ error: 'ไม่มีสิทธิ์ใช้บัญชีนี้' }, cors, 403);
      const acc = x.account_id || null;
      const old = await env.DB.prepare(`SELECT rule_id FROM AutoRules WHERE family_id = ? AND dir = ? AND payee = ? AND IFNULL(account_id,'') = ?`).bind(me.family_id, dir, payee, acc || '').first();
      const id = old?.rule_id || `RULE-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const type = await typeOf(env, x.category_id, dir === 'OUT' ? -1 : 1);
      if (old) await env.DB.prepare(`UPDATE AutoRules SET category_id = ?, entity_id = ?, contact_id = ?, type = ?, active = 1, sample = COALESCE(?, sample) WHERE rule_id = ?`)
        .bind(x.category_id, x.entity_id || null, x.contact_id || null, type, x.sample ? String(x.sample).slice(0, 120) : null, id).run();
      else await env.DB.prepare(`INSERT INTO AutoRules (rule_id, family_id, dir, payee, account_id, category_id, entity_id, contact_id, type, active, hits, sample, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,0,?,?,?)`)
        .bind(id, me.family_id, dir, payee, acc, x.category_id, x.entity_id || null, x.contact_id || null, type, x.sample ? String(x.sample).slice(0, 120) : null, authUserId, new Date().toISOString()).run();
      saved.push(id);
    }
    return json({ success: true, saved }, cors);
  }
  if (p === '/api/rules/delete' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare(`DELETE FROM AutoRules WHERE rule_id = ? AND family_id = ?`).bind(String(b.rule_id || ''), me.family_id).run();
    return json({ success: true }, cors);
  }
  if (p === '/api/rules/toggle' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare(`UPDATE AutoRules SET active = ? WHERE rule_id = ? AND family_id = ?`).bind(b.active ? 1 : 0, String(b.rule_id || ''), me.family_id).run();
    return json({ success: true }, cors);
  }
  if (p === '/api/rules/apply' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const rules = (await ruleList()).filter(r => !b.rule_ids || b.rule_ids.includes(r.rule_id)), match = matcher(rules);
    const ops = [], hits = {}, now = Date.now().toString(36);
    let n = 0;
    for (const t of await pendingRows()) {
      const r = match(t); if (!r) continue;
      const ent = r.entity_id || accs.get(t.account_id)?.tx_entity_id || null, amt = Number(t.amt);
      const type = r.type === 'TRANSFER' ? 'TRANSFER' : (amt < 0 ? 'EXPENSE' : 'INCOME');
      if (t.nd) ops.push(env.DB.prepare(`UPDATE TransactionDetails SET category_id = ?, entity_id = ?, contact_id = COALESCE(?, contact_id), type = ?, amount = ? WHERE transaction_id = ?`).bind(r.category_id, ent, r.contact_id || null, type, amt, t.transaction_id));
      else ops.push(env.DB.prepare(`INSERT INTO TransactionDetails (detail_id, transaction_id, amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type) VALUES (?,?,?,0,0,?,?,?,NULL,NULL,?)`).bind(`DT-RULE-${now}-${n}`, t.transaction_id, amt, r.category_id, ent, r.contact_id || null, type));
      ops.push(env.DB.prepare(`UPDATE Transactions SET status = 'CONFIRMED', total_amount = ? WHERE transaction_id = ?`).bind(amt, t.transaction_id));
      hits[r.rule_id] = (hits[r.rule_id] || 0) + 1; n++;
    }
    for (const [id, c] of Object.entries(hits)) ops.push(env.DB.prepare(`UPDATE AutoRules SET hits = IFNULL(hits,0) + ? WHERE rule_id = ?`).bind(c, id));
    for (let i = 0; i < ops.length; i += 100) await env.DB.batch(ops.slice(i, i + 100));
    return json({ success: true, applied: n, by_rule: hits }, cors);
  }
  return null;
}
