# RecordRevenue — Handoff (ส่งต่อ AI ตัวใหม่)

อัปเดตล่าสุด: 2026-07-22 · โปรเจกต์ = แอปการเงินครอบครัว + ท่องเที่ยว (ไทย)
Stack: Cloudflare Pages (frontend) + Cloudflare Worker (backend) + D1 (`record-revenue-db`, id `3112e08d-db8b-428c-925d-91fb50f50de4`)

- Frontend: `frontend/index.html`, `frontend/app.js`, `frontend/style.css`
- Backend: `backend/src/index.js` (deploy ที่ root — `main` อยู่ใน `wrangler.json`)
- URL: https://record-revenue-web.pages.dev · API: https://record-revenue.9nimz.workers.dev
- เวอร์ชันไฟล์ล่าสุดใน index.html: `style.css?v=120`, `app.js?v=157`

---

## 🚀 ต้อง DEPLOY + รัน SQL (ค้างอยู่ — ยังไม่ได้ทำ)
```
cd "<โฟลเดอร์ RecordRevenue>"
npx wrangler d1 execute record-revenue-db --remote --file=add_trip_wallet_fundings.sql   # ตาราง TripWalletFundings (ใหม่)
npx wrangler d1 execute record-revenue-db --remote --file=add_dashboard_tables_v2.sql     # CategoryBudgets + PlannedExpenses (ถ้ายังไม่รัน)
npx wrangler deploy                 # backend
npx wrangler pages deploy frontend  # frontend
```
เสร็จแล้ว hard refresh (Cmd+Shift+R)

---

## ✅ ทำเสร็จรอบล่าสุด (session นี้)

### 1) แก้บั๊ก: เข้าหน้ารายละเอียดทริปแล้ว "โหลดข้อมูลทริปล้มเหลว" (จอว่าง)
- **สาเหตุ:** `openTripDetail()` / `renderTripDetailModal()` ใน app.js อ้าง element `#view-trip-detail` ที่ไม่มีจริง → throw
- **แก้แล้ว:** เปลี่ยนไปใช้ element จริง = แผงขวา `#travel-details-panel` + `.trip-detail-content` (แก้ทั้ง open/close/render)
- layout หน้า TRIPS = 2 คอลัมน์: ซ้าย `#travel-trips-list` (การ์ด), ขวา `#travel-details-panel` (`display:none` จนกดการ์ด), มี `#travel-empty-state`

### 2) การ์ดทริปดีไซน์ใหม่ (kawaii)
- ใน `renderTripsView()` (app.js ~9007): ขอบมน 22px, แบนเนอร์ไล่เฉด, ป้ายชื่อลอย, badge สถานะ (Ongoing/Incoming/Memory), ไอคอนไฮไลต์, จำนวนวัน, **แถบงบประมาณ** (สีเขียว→ส้ม→แดงตาม %), hover เด้ง

### 3) ระบบการเงินทริป (Trip Finance) — P1 + P3 เสร็จ
สเปกเต็มอยู่ใน `TRIP_FINANCE_DESIGN.md` (อ่านก่อนแก้ต่อ)

**แนวคิด:** ทริป = "กระเป๋าเงินแยก" เติมจากบัญชีจริง → ใช้จ่ายหลายสกุล → ปิดทริปสรุปเข้าบัญชีหลัก
เรท = **เฉลี่ยถ่วงน้ำหนักทั้งทริป** (Σบาท ÷ Σเงินตปท. ทุกล็อต) ไม่ขึ้นกับลำดับ/วันที่บันทึก

**Schema ใหม่:** `TripWalletFundings` (funding_id, wallet_id, project_id, funding_date, thb_amount, foreign_amount, rate, source_account_id, linked_transaction_id, note) — ไฟล์ `add_trip_wallet_fundings.sql`

**Backend endpoints ใหม่ (backend/src/index.js):**
- helper `computeTripWallets(env, projectId)` (module-level, บนสุดไฟล์) → คืน wallet + `funded_foreign/funded_thb/spent_foreign/avg_rate/leftover_foreign/leftover_thb`. ใช้ใน `/api/wallets` GET และ `/api/travel` (ทั้ง GET และ guest POST)
- helper `computeTripCloseSummary(env, projectId)` → สรุปปิดทริป (ล็อกค่าบาทบิลด้วย avg_rate, รวมต่อ member/caption, totals, balanced)
- `POST /api/trips/fund` — เติมเงิน: สร้าง Transaction จริงหักบัญชีต้นทาง (−thb, type TRANSFER, tag project_id) + insert TripWalletFundings
- `GET /api/trips/fundings?walletId=|projectId=` , `POST /api/trips/fundings/delete`
- `GET /api/trips/close-preview?projectId=` — พรีวิวสรุป (ไม่แก้ข้อมูล)
- `POST /api/trips/close` (และ alias `/api/trips/settle`) — ต้อง `confirm:'CLOSE'`: ล็อกค่าบาทบิล → กลับรายการเติม (คืนเงินเข้าบัญชี) → ลงบิลเป็นรายจ่ายบัญชีหลักของ member (คนจ่าย) ตาม category → ปิดทริป `status='closed'`. กระเป๋าที่ `exclude_on_close=1` = เก็บเงินเหลือไว้ทริปหน้า (ไม่คืน)

**Frontend (app.js):**
- การ์ดกระเป๋า (expenses tab) โชว์ funded/spent/leftover + chip เรทเฉลี่ย
- ปุ่ม **💰 เติมเงิน** → `openFundWalletModal()` (เลือกบัญชี+บาท+สกุล+คำนวณเรทสด)
- ปุ่ม **🧮 คิดเงิน** → `openTripCalcModal()` (เครื่องคิดเลขแปลงเงินสองทางด้วยเรทเฉลี่ยทริป)
- ปุ่ม **🔒 ปิดทริป** (เฉพาะทริป active) → `openCloseTripModal()` แสดงสรุป+ตรวจสมดุล → ยืนยัน → `/api/trips/close`
- `openTripDetail()` เซ็ต `TravelState.wallets = data.wallets`

**การบัญชีตอนปิด (double-entry, net worth ถูกต้อง):** −เติม (ตอน fund) +คืน (ตอนปิด) −บิลต่อคน = −ใช้จริงสุทธิ

---

## ⏭️ ยังเหลือ (Phase ต่อไป)
- **P4 — ทดสอบด้วยตัวเลขจริง**: หลัง deploy ลองเติมเงินหลายสกุล/หลายรอบ + บันทึกบิล + ปิดทริป แล้วเช็คว่า balanced ✅ และยอดบัญชีถูก
- **P3b (ยังไม่ทำ)**: การ "ยกกระเป๋าไปทริปหน้า" (exclude_on_close) ตอนนี้แค่ไม่คืนเงิน + note ในรายงาน ยังไม่ได้ย้ายเป็นกระเป๋าตั้งต้นทริปถัดไปอัตโนมัติ
- **จุดแวะ (TripStops) บนการ์ด/ไทม์ไลน์**: ยังไม่ได้เพิ่มบนการ์ดหน้า list

---

## 🧠 โมเดลข้อมูลสำคัญ (กันสับสน)
- **Owner/Entity = Company** (บริษัทผู้รับรายการ) · label UI = "Company"
- **Member/User** = คนบันทึกรายการ (`Transactions.created_by_user_id`) = มิติความเป็นเจ้าของ
- Member ↔ Company = many-to-many ผ่าน `UserPermissions`
- Dashboard ตัวกรองบนสุด = **Member** (ไม่ใช่ Company)
- ยอดบัญชี = คำนวณสดจาก `SUM(Transactions.total_amount WHERE status='CONFIRMED')` (คอลัมน์ `Accounts.balance` ไม่ใช้/dead)
- เงินลงทุน = `behavior='ASSET' + sub_behavior='INVESTMENT'` (แก้ CHECK บน D1 ไม่ได้)
- ทริป 3 สถานะ: `active`=Ongoing, `planned`=Incoming, `closed`=Memory

### รูปแบบ insert รายการหลัก (สำคัญมาก)
- `Transactions`: transaction_id, account_id, date, total_amount (เซ็น +/−), statement_desc, status('CONFIRMED'), source('WEB_GRID'|'LINE_SLIP'|'PDF_IMPORT'), created_by_user_id
- `TransactionDetails`: detail_id, transaction_id, amount, category_id (**NOT NULL**, default `'Cat_Uncategorized'`), project_id, note, type('INCOME'|'EXPENSE'|'TRANSFER'|'DEBIT_AR'|'CREDIT_AR'|'OTHER')
- Categories → Captions: `c.caption_id = cp.type_id` ; caption มี `cp.name`, `cp.behavior`
- Users: `u.name` ; TripExpenses: member_id(=คนจ่าย), category_id, amount_foreign, amount_thb, wallet_id, paid_from_account_id, approved

---

## ⚠️ ล็อกอิน
- Users มี admin เดียว: **user_id = `9North`**, email `nimz.4.april@gmail.com`, role admin
- ถ้า "User not found / โหลดไม่ขึ้น" = session ถือ user_id เก่า → **ออกแล้วล็อกอินใหม่ด้วย 9North** (ข้อมูลจริงยังอยู่ครบ)

## ไฟล์ SQL / เอกสาร
- `add_trip_wallet_fundings.sql` — ตาราง TripWalletFundings (ยังไม่รัน)
- `add_dashboard_tables_v2.sql` — CategoryBudgets + PlannedExpenses
- `clear_transactions.sql` — ล้างเฉพาะธุรกรรม เก็บ master data
- `check_status.sql` / `check_users.sql` — ตรวจสถานะ/user
- `TRIP_FINANCE_DESIGN.md` — สเปกเต็มระบบการเงินทริป (ต้องอ่านก่อนทำ P4/P3b)

## ข้อควรระวังตอนแก้โค้ด
- แก้ frontend → bump `?v=` ใน index.html เสมอ (กัน cache) · Cloudflare Pages ไม่สนใจ query string (ไฟล์ที่ serve = ที่ deploy ล่าสุด)
- D1: แก้ CHECK / DROP คอลัมน์ที่มี FK อ้างถึงไม่ได้ → ใช้ ADD COLUMN / CREATE TABLE ใหม่
- backend เป็น ES module — เช็ค syntax: `cp backend/src/index.js /tmp/x.mjs && node --check /tmp/x.mjs`
- frontend: `node --check frontend/app.js`
- element หน้าทริปจริง: `#travel-trips-list`, `#travel-details-panel`, `.trip-detail-content`, `#travel-empty-state` (อย่าใช้ `#view-trip-detail` — ไม่มี)
