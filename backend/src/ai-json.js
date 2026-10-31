/* 🩹 AI ตอบ JSON เพี้ยนบางครั้ง (2026-10-31 North: "Expected ':' after property name in JSON at position 10570")
   → ลองซ่อม (ตัด ``` · ตัดส่วนเกินหลัง } สุดท้าย · ลบ , ก่อน } ]) · ยังไม่ได้ → ให้ AI อ่านใหม่อีก 1 ครั้ง */
export function parseAiJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* ซ่อมต่อ */ }
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  if (a >= 0 && z > a) t = t.slice(a, z + 1);
  t = t.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(t); } catch { /* ซ่อมแบบตัดแถวที่เสีย */ }
  /* ตัดรายการใน transactions ทีละตัวจากท้าย จนกว่าจะอ่านได้ (แถวท้ายที่ AI พิมพ์ไม่จบ) */
  const m = t.match(/"(?:transactions|items)"\s*:\s*\[/);
  if (m) {
    const head = t.slice(0, m.index + m[0].length), body = t.slice(m.index + m[0].length);
    const objs = []; let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < body.length; i++) { const c = body[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') { if (depth++ === 0) start = i; } else if (c === '}') { if (--depth === 0 && start >= 0) { objs.push(body.slice(start, i + 1)); start = -1; } } else if (c === ']' && depth === 0) break; }
    const good = objs.filter(o => { try { JSON.parse(o); return true; } catch { return false; } });
    const tailIdx = body.search(/\]\s*,\s*"/), tail = tailIdx >= 0 ? body.slice(tailIdx + 1).replace(/^\s*,/, ',') : '}';
    for (const tl of [tail, '}']) { try { const out = JSON.parse(head + good.join(',') + ']' + (tl.trim().startsWith(',') ? tl : '}')); out._repaired = objs.length - good.length; return out; } catch { /* ต่อ */ } }
  }
  throw new SyntaxError('AI ตอบข้อมูลไม่สมบูรณ์');
}

