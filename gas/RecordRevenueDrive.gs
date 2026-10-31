/**
 * RecordRevenue → Google Drive (2026-10-31)
 * วางโค้ดนี้ทั้งไฟล์ใน Apps Script (script.google.com) ของบัญชี nimz.4.april@gmail.com
 * แล้วเปลี่ยน SECRET ด้านล่างเป็นรหัสลับของคุณเอง (ใส่รหัสเดียวกันในแอป → ตั้งค่า → Backup/Restore → Google Drive)
 *
 * ทำอะไร: รับไฟล์จากเซิร์ฟเวอร์ RecordRevenue แล้วเก็บในโฟลเดอร์ "RecordRevenue" ของ Drive
 *   RecordRevenue/Statement/<บัญชี>/<ปี>/ไฟล์.pdf   (statement · ใบแจ้งยอดบัตร · เก็บไฟล์ต้นฉบับ รวมไฟล์ที่ล็อกรหัส)
 *   RecordRevenue/Slip/<ปี-เดือน>/…                 (สลิป · ใบเสร็จ · รูปค่าใช้จ่าย)
 * ปลอดภัย: ทุกคำขอต้องมี SECRET ตรง · อ่าน/ลบได้เฉพาะไฟล์ที่อยู่ใต้โฟลเดอร์ RecordRevenue เท่านั้น
 */
const SECRET = 'เปลี่ยนเป็นรหัสลับยาวๆ-ของคุณ';
const ROOT_NAME = 'RecordRevenue';

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SECRET || SECRET.indexOf('เปลี่ยนเป็น') === 0) return out_({ error: 'ยังไม่ได้ตั้ง SECRET ในโค้ด Apps Script' });
    if (b.secret !== SECRET) return out_({ error: 'รหัสลับไม่ตรง' });
    const root = root_();
    if (b.action === 'ping') return out_({ ok: true, root: root.getUrl(), user: Session.getEffectiveUser().getEmail() });
    if (b.action === 'upload') {
      if (!b.data || !b.name) return out_({ error: 'ไม่มีไฟล์' });
      const folder = path_(root, b.path || []);
      const blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'application/octet-stream', safe_(b.name));
      const f = folder.createFile(blob);
      if (b.description) f.setDescription(String(b.description).slice(0, 500));
      return out_({ ok: true, id: f.getId(), url: f.getUrl(), size: f.getSize(), folder: folder.getUrl() });
    }
    if (b.action === 'get') {
      const f = DriveApp.getFileById(b.id);
      if (!under_(f, root)) return out_({ error: 'ไฟล์นี้ไม่ได้อยู่ในโฟลเดอร์ RecordRevenue' });
      return out_({ ok: true, name: f.getName(), mime: f.getMimeType(), data: Utilities.base64Encode(f.getBlob().getBytes()) });
    }
    if (b.action === 'trash') {
      const f = DriveApp.getFileById(b.id);
      if (!under_(f, root)) return out_({ error: 'ไฟล์นี้ไม่ได้อยู่ในโฟลเดอร์ RecordRevenue' });
      f.setTrashed(true);   // ย้ายไปถังขยะของ Drive (กู้คืนได้ 30 วัน)
      return out_({ ok: true });
    }
    return out_({ error: 'ไม่รู้จักคำสั่ง ' + b.action });
  } catch (err) {
    return out_({ error: String(err && err.message || err) });
  }
}

function doGet() { return out_({ ok: true, app: 'RecordRevenue Drive', note: 'ใช้ผ่านแอป RecordRevenue เท่านั้น' }); }

function root_() {
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
}
function path_(root, parts) {
  let cur = root;
  (parts || []).map(safe_).filter(String).slice(0, 6).forEach(function (name) {
    const it = cur.getFoldersByName(name);
    cur = it.hasNext() ? it.next() : cur.createFolder(name);
  });
  return cur;
}
function under_(file, root) {
  const rootId = root.getId(), seen = {};
  let q = [];
  const ps = file.getParents(); while (ps.hasNext()) q.push(ps.next());
  for (let i = 0; i < 200 && q.length; i++) {
    const f = q.shift(); if (f.getId() === rootId) return true; if (seen[f.getId()]) continue; seen[f.getId()] = 1;
    const up = f.getParents(); while (up.hasNext()) q.push(up.next());
  }
  return false;
}
function safe_(s) { return String(s || '').replace(/[\\/:*?"<>|#%]+/g, '_').trim().slice(0, 120); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** กด ▶ Run ฟังก์ชันนี้ 1 ครั้งหลังวางโค้ด เพื่อให้ Google ขอสิทธิ์ใช้ Drive และสร้างโฟลเดอร์ RecordRevenue */
function setup() { const r = root_(); Logger.log('โฟลเดอร์: ' + r.getUrl()); }
