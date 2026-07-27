# Hunsa Trip

Hunsa Trip คือเว็บแอปใหม่ที่แยก UI ออกจาก RecordRevenue เดิมโดยสิ้นเชิง แต่ใช้ API contract ของระบบ Trip เดิมได้ทันที

## โครงสร้าง

- `../frontend/hunsa/` — Mobile-first Hunsa Trip UI (เปิดผ่านเมนู Hunsa Trip หลัง TRIPS)
- `backend/` — สำเนา Cloudflare Worker และ schema ที่เป็นจุดเริ่มต้นสำหรับ backend แยก

## เริ่มใช้งาน

เปิด `frontend/index.html` หรือ serve โฟลเดอร์ frontend ด้วย static server แล้วตั้งค่า user id หากต้องการต่อข้อมูลจริง:

```js
localStorage.setItem('hunsa_user_id', 'USER_ID_เดิม')
```

ค่า API เริ่มต้นชี้ไปที่ backend เดิมเพื่อให้ย้ายทีละขั้นได้ โดยตั้ง `hunsa_api_base` เพื่อเปลี่ยนไปยัง Worker ของ Hunsa Trip เมื่อ deploy backend ใหม่แล้ว

## หลักการ

UI ไม่ reuse HTML/CSS/renderer Trip ของ RecordRevenue เดิม และสื่อสารกับ backend ผ่าน `/api/trips` และ `/api/travel` เท่านั้น

> Backend copy ยังตั้งใจไม่ deploy: `wrangler.json` จะไม่ชี้ไปยัง D1 ของ RecordRevenue เดิม เพื่อป้องกันการเขียนข้อมูลข้ามระบบโดยไม่ตั้งใจ ต้องสร้าง D1 ใหม่และใส่ database id ก่อน deploy API ของ Hunsa Trip.
