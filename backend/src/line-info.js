// ═══════════════════════════════════════════════════════════════════════
// 📱 GET /api/line/bot-info (v271 · North: "QR Code bot ใช้งานได้หรือไม่")
//  QR ในเมนูซ้ายเดิมเขียนตายตัวเป็น @recordrevenue (ไม่ใช่ ID จริงของบอท)
//  ตอนนี้ถาม LINE ตรง ๆ ด้วย LINE_CHANNEL_ACCESS_TOKEN → ได้ basicId จริง แล้วหน้าเว็บสร้าง QR จากค่านี้
// ═══════════════════════════════════════════════════════════════════════
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
let cache = null;

export async function handleLineInfo({ url, env, cors, authUserId, fetchImpl = fetch }) {
  if (url.pathname !== '/api/line/bot-info') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  if (cache && Date.now() - cache.at < 6 * 3600e3) return json(cache.data, cors);
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ ok: false, error: 'ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN' }, cors);
  try {
    const r = await fetchImpl('https://api.line.me/v2/bot/info', { headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.basicId) return json({ ok: false, error: `LINE ตอบ ${r.status}: ${j.message || 'ไม่มี basicId'}` }, cors);
    const id = j.premiumId || j.basicId;
    const data = { ok: true, basicId: j.basicId, premiumId: j.premiumId || null, displayName: j.displayName || '', pictureUrl: j.pictureUrl || '',
      addUrl: `https://line.me/R/ti/p/${encodeURIComponent(id)}` };
    cache = { at: Date.now(), data };
    return json(data, cors);
  } catch (e) { return json({ ok: false, error: 'ติดต่อ LINE ไม่ได้: ' + (e.message || e) }, cors); }
}
export const _resetLineInfoCache = () => { cache = null; };
