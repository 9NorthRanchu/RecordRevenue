import { parseAiJson } from './ai-json.js';
// ═══════════════════════════════════════════════════════════════════════
// 📱 wePAY จากรูปหน้าจอ (2026-10-31 · North: "ส่วนใหญ่เติมเงินมือถือ · มีเงินเข้าก่อน · บางรายการได้เงินคืน เช่น จ่าย 10 ได้คืน 0.1")
//  POST /api/wepay/read  (body = ไฟล์รูปดิบ · Content-Type = image/*) → AI อ่านทุกแถวในรูป
//   หน้า "รายการล่าสุด": เติมเงินมือถือ (เบอร์ ยอด เงินคืน วันเวลา) · หน้า "กล่องข้อความ": เงินเข้ากระเป๋า / เติมเงิน / เงินคืน / แพ็กเกจ
//  ส่งไฟล์ดิบไป Gemini Files API (ไม่แปลง base64 ในเซิร์ฟเวอร์ → ไม่กิน CPU) เหมือนอ่านสลิป
// ═══════════════════════════════════════════════════════════════════════
import { geminiGenerate } from './ledger-inbox.js';
const json = (data, cors, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const WEPAY_PROMPT = `You read screenshots of the Thai "wePAY" mobile top-up app. Return ONLY JSON:
{"screen":"history"|"inbox"|"other","items":[{"kind":"topup"|"deposit"|"refund"|"package"|"other","phone":"0649364168"|null,"operator":"AIS"|"dtac"|"TRUE"|"other"|null,
"amount":10.00,"refund":0.10|null,"datetime":"2025-11-03T10:56:24","balance":105.97|null,"text":"short original text"}]}
Screens:
- "history" (รายการล่าสุด / รายการเติมเงินมือถือ): each card = one top-up: operator name (เอไอเอส วัน-ทู-คอล! = AIS, ดีแทคเติมเงิน = dtac, ทรูมูฟ = TRUE), phone number, "จำนวนเงิน" = amount, "เงินคืน" = refund, date-time. kind = "topup".
- "inbox" (กล่องข้อความ): each message:
  "ท่านได้รับการเติมเงิน 100.00 บาท ยอดเงินคงเหลือ 105.97 บาท" → kind "deposit", amount 100, balance 105.97
  "เติมเงิน 10.00บ. ให้หมายเลข 0919566166 สำเร็จ" → kind "topup", phone, amount 10, refund null
  "ท่านได้รับเงินคืน 0.10 บาท จากบริการเอไอเอส วัน-ทู-คอล!" → kind "refund", amount 0.10, operator AIS
  "Your top up transaction of 5.00 Baht 30 days to 0996399153 is successful." → kind "package", phone, amount 5
Dates: Thai Buddhist year. 4-digit 2568 → 2025, 2569 → 2026. 2-digit "69" → 2569 → 2026, "68" → 2025. Months: ม.ค.=01 ก.พ.=02 มี.ค.=03 เม.ย.=04 พ.ค.=05 มิ.ย.=06 ก.ค.=07 ส.ค.=08 ก.ย.=09 ต.ค.=10 พ.ย.=11 ธ.ค.=12.
Output datetime as ISO "YYYY-MM-DDTHH:MM:SS" (seconds 00 if not shown).
Skip any card or message that is cut off at the top or bottom edge so that its amount OR date-time is not fully visible. Ignore the header/footer, buttons, version text and the overlapping page title.
Keep the order as shown on screen (top to bottom).`;

/* วันเวลาจาก AI: รับทั้ง "2026-03-03T21:06:06" และ "2026-03-03 21:06" · ปี พ.ศ. (≥2400) → ค.ศ. (2026-10-31 · กันแถวหายเงียบ ๆ) */
export function normDt(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(v || '').trim()); if (!m) return null;
  const y = +m[1] >= 2400 ? +m[1] - 543 : +m[1];
  return `${y}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`;
}
export async function handleWepay({ url, request, env, cors, authUserId }) {
  if (url.pathname !== '/api/wepay/read' || request.method !== 'POST') return null;
  if (!authUserId) return json({ error: 'Unauthorized' }, cors, 401);
  const mime = (request.headers.get('Content-Type') || 'image/jpeg').split(';')[0];
  if (!/^image\//.test(mime)) return json({ error: 'ส่งได้เฉพาะรูปภาพ' }, cors, 400);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 12_000_000) return json({ error: 'รูปใหญ่เกิน 12MB' }, cors, 413);
  try {
    let out;
    if (env.__wepayOverride) out = await env.__wepayOverride(bytes, mime);   // เทสเท่านั้น
    else {
      if (!env.GEMINI_API_KEY) throw new Error('ยังไม่ได้ตั้ง GEMINI_API_KEY');
      const base = 'https://generativelanguage.googleapis.com';
      let part = null;
      const up = await fetch(`${base}/upload/v1beta/files?key=${env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'X-Goog-Upload-Protocol': 'raw', 'Content-Type': mime }, body: bytes });
      if (up.ok) { const uri = (await up.json())?.file?.uri; if (uri) part = { fileData: { mimeType: mime, fileUri: uri } }; }
      if (!part) throw new Error('อัปโหลดรูปให้ AI ไม่สำเร็จ');
      const res = await geminiGenerate(env, env.GEMINI_MODEL || 'gemini-3.1-flash-lite', { contents: [{ parts: [{ text: WEPAY_PROMPT }, part] }], generationConfig: { responseMimeType: 'application/json' } });
      if (!res.ok) throw new Error(`AI อ่านรูปไม่สำเร็จ (${res.status})`);
      const text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      out = parseAiJson(text);
    }
    const items = (Array.isArray(out?.items) ? out.items : []).map(x => ({
      kind: ['topup', 'deposit', 'refund', 'package'].includes(x.kind) ? x.kind : 'other',
      phone: String(x.phone || '').replace(/\D/g, '').slice(0, 10) || null,
      operator: x.operator || null, amount: Math.abs(Number(x.amount) || 0), refund: x.refund == null ? null : Math.abs(Number(x.refund) || 0),
      datetime: normDt(x.datetime),
      balance: x.balance == null ? null : Number(x.balance), text: String(x.text || '').slice(0, 120) })).filter(x => x.amount > 0 && x.datetime);
    return json({ screen: out?.screen || 'other', items }, cors);
  } catch (e) { return json({ error: e.message }, cors, 502); }
}
