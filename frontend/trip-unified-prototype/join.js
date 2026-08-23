/* ── หน้าเข้าร่วมทริปสำหรับผู้ร่วมทริป (join.html) ────────────────────
   คนที่ไม่มีบัญชีของระบบบัญชีครอบครัว เข้าด้วย "รหัสของตัวเอง" ที่ผู้ดูแลตั้งให้
   เปิดจากลิงก์: join.html?projectId=TRP-xxxx

   ⚠️ token ที่ได้เก็บแยกคีย์จาก session ของระบบครอบครัว (trip_member_token)
      ห้ามเก็บทับคีย์เดิมเด็ดขาด ไม่งั้นการเข้าทริปด้วยรหัสผู้ร่วมทริปจะไป
      เตะสมาชิกครอบครัวที่ล็อกอินอยู่ในเครื่องเดียวกันออก */

const $ = (selector, root = document) => root.querySelector(selector);
const params = new URLSearchParams(location.search);
const projectId = params.get('projectId') || '';

function fail(message) {
  $('#joinLoading').hidden = true;
  $('#joinForm').hidden = true;
  const box = $('#joinBlocked');
  box.hidden = false;
  box.textContent = message;
}

async function loadMembers() {
  if (!projectId) return fail('ลิงก์ไม่ถูกต้อง — ขาดรหัสทริป ให้ขอลิงก์ใหม่จากผู้ดูแลทริป');

  try {
    const response = await fetch(
      `${TripApi.config.base}/api/unified-trip/members/login?projectId=${encodeURIComponent(projectId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `โหลดไม่สำเร็จ (${response.status})`);

    if (payload.trip_name) $('#joinTripName').textContent = payload.trip_name;
    if (!payload.members?.length) {
      return fail('ทริปนี้ยังไม่ได้เปิดให้เข้าด้วยรหัส — ให้ผู้ดูแลทริปตั้งรหัสให้คุณก่อน');
    }

    $('#joinMember').innerHTML = payload.members
      .map(member => `<option value="${member.member_id}">${member.display_name}</option>`).join('');
    $('#joinLoading').hidden = true;
    $('#joinForm').hidden = false;
  } catch (error) {
    fail(`เปิดหน้านี้ไม่สำเร็จ: ${error.message}`);
  }
}

$('#joinForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#joinSubmit');
  const errorBox = $('#joinError');
  errorBox.textContent = '';
  button.disabled = true;
  button.textContent = 'กำลังเข้าใช้งาน…';

  try {
    const response = await fetch(
      `${TripApi.config.base}/api/unified-trip/members/login?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: $('#joinMember').value, passcode: $('#joinPasscode').value })
      });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'รหัสไม่ถูกต้อง');

    try {
      localStorage.setItem('trip_member_token', payload.token);
      localStorage.setItem('trip_member_name', payload.name || '');
    } catch {
      // เบราว์เซอร์ที่ปิด localStorage (โหมดส่วนตัวบางตัว) — บอกตรง ๆ ดีกว่าพาเข้าไปแล้วเด้งออก
      throw new Error('เบราว์เซอร์นี้ไม่ให้บันทึกข้อมูลเข้าสู่ระบบ · ลองเปิดในหน้าต่างปกติ');
    }
    /* กลับไปหน้าที่ผู้ใช้ตั้งใจเปิดตั้งแต่แรก (ลิงก์เดียวทั้งทริป · 2026-08-23)
       🔴 รับเฉพาะ path ในโดเมนเดียวกันเท่านั้น ไม่ใช่ URL อะไรก็ได้
          ไม่งั้นส่งลิงก์ที่มี ?next=https://เว็บปลอม แล้วพาคนออกไปหลังใส่รหัสได้ */
    const wanted = new URLSearchParams(location.search).get('next') || '';
    let target = `index.html?live=1&projectId=${encodeURIComponent(projectId)}`;
    if (wanted) {
      try {
        const url = new URL(wanted, location.href);
        if (url.origin === location.origin) target = url.pathname + url.search + url.hash;
      } catch { /* next ที่แปลงเป็น URL ไม่ได้ ถือว่าไม่มี */ }
    }
    location.href = target;
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
    button.textContent = 'เข้าใช้งาน';
  }
});

loadMembers();
