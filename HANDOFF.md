# RecordRevenue — สรุปสถานะ / สิ่งที่ค้าง (Handoff)

โปรเจกต์: Cloudflare Pages (frontend) + Cloudflare Worker (backend) + D1 (`record-revenue-db`)
- Frontend: `frontend/index.html`, `frontend/app.js`, `frontend/style.css`
- Backend: `backend/src/index.js` (deploy ที่ root ด้วย `npx wrangler deploy` — main อยู่ใน wrangler.json)
- URL: https://record-revenue-web.pages.dev · API: https://record-revenue.9nimz.workers.dev

## ⚠️ เรื่องด่วน — ล็อกอินไม่ได้ (User not found)
- ในตาราง Users มี admin คนเดียว: **user_id = `9North`**, email `nimz.4.april@gmail.com`, role admin
- session เดิมล็อกอินด้วย user_id เก่าที่ไม่มีแล้ว → backend หาไม่เจอ → โหลดข้อมูลไม่ขึ้น (ข้อมูลจริงยังอยู่ครบ)
- **แก้: ออกจากระบบ แล้วล็อกอินใหม่ด้วย 9North** (email + password ที่ตั้งไว้)
- ดู/ตั้งรหัส: `check_status.sql`, หรือ `UPDATE Users SET password='...' WHERE user_id='9North';`

## Deploy ที่ยังค้าง (ควรทำ)
เวอร์ชันไฟล์ล่าสุด: `style.css?v=120`, `app.js?v=153` (อยู่ใน index.html)
```
npx wrangler deploy                    # backend (มี endpoint ใหม่: /api/reset, /api/users/delete, restore replace, budgets, planned-expenses, wht/detail, dashboard/summary)
npx wrangler pages deploy frontend     # frontend
```
แล้ว hard refresh (Cmd+Shift+R)

## Migration ที่ต้องรัน (ถ้ายังไม่รัน)
```
npx wrangler d1 execute record-revenue-db --remote --file=add_dashboard_tables_v2.sql   # CategoryBudgets + PlannedExpenses
```
(add_investment_behavior.sql = รันแล้ว · Accounts.account_type/credit_limit/statement_day/due_day = รันแล้ว)

## ไฟล์ SQL ที่เตรียมไว้
- `clear_transactions.sql` — ล้างเฉพาะธุรกรรม เก็บ master data (ยังไม่ได้รัน — รันเมื่อพร้อมล้างเพื่อ import ใหม่)
- `check_status.sql` / `check_users.sql` — ตรวจสถานะ/รายชื่อ user

## งานดีไซน์ที่ค้าง
- **หน้า TRIPS**: เลือกดีไซน์การ์ดใหม่ค้างอยู่ (ตัวเลือก A = ภาพเต็ม+ชื่อบนภาพ, B = ภาพย่อ+แถบงบ) — ยังไม่ได้ลงโค้ดจริง
  - โค้ด render ทริปอยู่ใน `frontend/app.js` (loadTrips / renderTrips)

## โมเดลข้อมูลสำคัญ (กันสับสน)
- **Owner/Entity = Company** (บริษัทผู้รับรายการ) · label UI ใช้คำว่า "Company"
- **Member/User** = คนบันทึกรายการ (`Transactions.created_by_user_id`) · เป็นมิติความเป็นเจ้าของ
- Member ↔ Company เป็น many-to-many ผ่าน `UserPermissions`
- Dashboard ตัวกรองบนสุด = Member (ไม่ใช่ Company)
- ยอดบัญชีคำนวณสดจาก `SUM(Transactions.total_amount WHERE status='CONFIRMED')` (คอลัมน์ Accounts.balance ไม่ใช้)
- เงินลงทุน = `behavior='ASSET' + sub_behavior='INVESTMENT'` (แก้ CHECK constraint บน D1 ไม่ได้ เลยใช้ sub_behavior)

## ข้อควรระวังตอนแก้โค้ด
- ทุกครั้งที่แก้ frontend ให้ bump เลข `?v=` ใน index.html (กัน cache)
- D1 แก้ CHECK constraint / DROP คอลัมน์ที่มี FK อ้างถึงไม่ได้ (ใช้ ADD COLUMN แทน)
- node --check ก่อน deploy เสมอ
