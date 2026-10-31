# RecordRevenue — Handoff (ส่งต่อ AI ตัวใหม่)

อัปเดตล่าสุด: 2026-10-10 (กล่องรอเคลียร์ + statement) · โปรเจกต์ = แอปการเงินครอบครัว + ท่องเที่ยว (ไทย)
Stack: Cloudflare Pages (frontend) + Cloudflare Worker (backend) + D1 (`record-revenue-db`, id `3112e08d-db8b-428c-925d-91fb50f50de4`)

## 📥 2026-10-10 — กล่องรอเคลียร์ (เว็บ) + นำเข้า statement (ระยะ 2) + เปิดให้ Puii

**หน้าเว็บใหม่ `frontend/ledger/index.html`** (เมนู "กล่องรอเคลียร์ · Statement" ในแอปหลัก · ใช้ session_token เดียวกัน)
- แท็บ 📥 รอเคลียร์: การ์ดทุกเอกสาร · ยืนยัน/ไม่บันทึก/อ่านใหม่/เลือกบัญชี/เลือกรายการ · ยืนยันทั้งหมดที่พร้อม · อัปโหลดหลายไฟล์ (ลากวางได้) · จดเงินสด "กาแฟ 65"
- ตัวแก้/แตกบรรทัด: หลายบริษัท/หลายหมวด/หัก ณ ที่จ่าย (ปุ่ม 1/2/3/5%)/ค่าธรรมเนียม/คู่ค้า · แถบ "เหลืออีก x บาท" · ยืนยันแล้วระบบจำแบบแตกของคู่ค้านั้น
- แท็บ 🏦 Statement: เลือกบัญชี → PDF ถอดรหัสในเครื่อง (pdf.js · รหัสจาก Accounts.pdf_password) แปลงเป็นรูปทีละหน้า → ส่ง `/api/inbox/statement`
- ปุ่มเมนูในแอปหลักใช้ `data-href` (แก้ handler .nav-item ใน app.js · v=180)

**API ใหม่ (ledger-inbox.js)**: `GET /api/inbox/meta` · `POST /api/inbox/{doc}/edit` (date, account_id, details[] แบบมีเครื่องหมาย, confirm) · `POST /api/inbox/statement` · `GET /api/inbox/statements[/{id}]` · `POST .../create` (ทีละ 8 บรรทัด คืน remaining) · `.../line/{L}` (match|ignore|reset) · `.../delete`
- ตารางใหม่ `LedgerStatements` (setup-db.sh) — **บรรทัดเก็บเป็น JSON ในคอลัมน์ lines** เพราะ D1 แผนฟรีจำกัดคำสั่งต่อคำขอ (~50) · ห้ามเปลี่ยนเป็นเขียนทีละแถวโดยไม่คิดเรื่องนี้
- เครื่องหมายเข้า/ออกเชื่อ "ยอดคงเหลือ" (`fixStatementSigns`) — แก้ปัญหา AI ใส่ช่องสลับ · `read_gap` ≠ 0 = AI อ่านตก/เกิน
- จับคู่ (`matchStatementLines`): ยอดเท่ากันเป๊ะ ±2 วัน หรือ ref ตรง · เลือกคู่คะแนนสูงสุดทั้งฉบับ · รายการที่ statement ฉบับอื่นจองแล้วไม่ใช้ซ้ำ · บรรทัดที่เคยนำเข้า = DUPLICATE
- บรรทัดที่ยังไม่มี → สร้าง Transactions (source PDF_IMPORT, PENDING_REVIEW) + LedgerDocs doc_type `STATEMENT_LINE` (ไม่มีไฟล์) → เข้ากล่องรอเคลียร์ · คีย์จำคู่ค้า `statementPartyKey` (ไม่สนเลขบัญชี) · ยืนยันเองเมื่อคู่ค้านี้ยืนยันแบบเดิม ≥3 ครั้ง
- กด "ไม่ต้องบันทึก" ที่รายการจาก statement → บรรทัดนั้นเป็น IGNORED
- ยังไม่ทำ: ปิดเดือน (ล็อกงวด) · statement บัตรเครดิตแยกตามรอบบิล (ระยะ 3)

**ตัดสินใจเพิ่ม (North 2026-10-10)**: ปรับ UX/UI ทั้งแอปแบบ **ทำใหม่ทีละหน้า** ในสไตล์เดียวกับกล่องรอเคลียร์ (แอปเดิมใช้ได้ระหว่างทาง) ลำดับ ภาพรวม → ประวัติ → ลูกหนี้/เจ้าหนี้ → รายงาน → ตั้งค่า · "รอตรวจสอบ" จะรวมเข้ากล่องรอเคลียร์ · **ปิดเมนู Enjoy Life Trip** (comment ใน index.html) ข้อมูลทริปไม่ลบ รอเชื่อมภายหลัง
- **รูปแบบตัวเลข (North สั่ง ใช้ทั้งแอป)**: ทศนิยม 2 ตำแหน่ง · มี , หลักพัน · ติดลบใส่วงเล็บ (1,234.56) และสีต่าง (แดง #c92a2a) · ต้องใช้งานง่ายบน Mac/PC/iPad/iPhone · หน้าภาพรวมตัวหนังสือน้อย ใช้ไอคอน เห็นทั้งระบบ (mockup: Design artifact "ภาพรวมสมุดจด 5 แบบ" ชุดแรก+ชุดสอง)
- กล่องซิงก์กับเมนูเก่า: listInbox ปิดเอกสาร SUGGESTED เองเมื่อรายการถูกยืนยัน (DONE) หรือลบ (DISMISSED) จาก "รอตรวจสอบ"
- ⚠️ ของเก่า `/api/transactions/confirm` และ `/delete` ไม่ตรวจสิทธิ์เจ้าของ และ delete ไม่ลบ TransactionDetails — แก้ตอนทำหน้าใหม่

**รวม "รอตรวจสอบ" เข้ากล่อง + หน้าภาพรวมใหม่ (2026-10-10 ค่ำ)**
- `adoptPendingTransactions`: listInbox สร้าง LedgerDocs ให้รายการ PENDING_REVIEW ที่มาจากทางเดิม (Excel/Bulk · PDF เก่า · จดในแอปหลัก) ทีละ 25 (ADOPT_CHUNK — โควตา D1) · doc_type: PDF_IMPORT→STATEMENT_LINE · WEB_GRID→MANUAL · อื่น→LEGACY
- `POST /api/inbox/manual` เพิ่มรายการเอง (ใช้แบบที่จำของชื่อรายการ) · editDoc แก้ยอดหัวได้เฉพาะ MANUAL/CASH
- meta หมวดมี `group` (ชื่อหัวข้อ Captions) · ปุ่มแอปหลัก: "เพิ่มรายการ" มือถือ → `ledger/index.html?add=1`
- หน้า `ledger/index.html`: สีม่วง (แบบ 4) · ตัวเลขวงเล็บ · กรองบัญชี/เรียงวันที่/สรุปเข้า-ออก · จอ ≥1024px ตัวแก้เป็นแผงขวา · คีย์ลัด ↑↓ Enter E Esc · `#stmt` เปิดแท็บ statement
- หน้า `ledger/home.html` ภาพรวมใหม่ (ใช้ /api/dashboard/summary เดิม + /api/inbox + /api/inbox/statements): เคลียร์ก่อน (รอเคลียร์/ไม่มีหมวด/บัญชีติดลบ/statement เดือนก่อน) · เงินที่มี · เดือนนี้ · สินทรัพย์/หนี้สิน/สุทธิ · สรุปทุกบริษัท · บัญชี/บัตร
- เมนูแอปหลัก: "ภาพรวม (ใหม่)" · "กล่องรอเคลียร์" (มีตัวเลข badge-pending) · หน้าเดิมเหลือ "ภาพรวม (แบบเดิม)" และ "นำเข้า Excel (หน้าเดิม)" จนกว่าจะย้าย Excel import
- ความปลอดภัย: `/api/transactions/confirm|delete` ตรวจสิทธิ์บัญชีแล้ว · delete ลบ TransactionDetails ด้วย · ลบ alert ที่โชว์รหัส PDF ใน app.js
- **นำเข้า Excel ย้ายแล้ว** (ปุ่ม 📊 ในกล่อง): `POST /api/inbox/import-rows` ทีละ 8 ชุด · คอลัมน์ A–L เหมือนแบบฟอร์มเดิม · ใช้สูตรสมุดจด (ค่าธรรมเนียมรายจ่าย = จ่ายเพิ่ม: 10,000 + 10 = (10,010.00) — แบบฟอร์มเดิมคิดกลับด้าน) · ข้ามรายการซ้ำ (บัญชี+วันที่+ยอด+หมายเหตุ) · ติ๊ก Bulk = CONFIRMED ไม่ผ่านกล่อง · doc_type EXCEL · ปุ่มแบบฟอร์มสร้าง xlsx ในเบราว์เซอร์ (xlsx@0.18.5 จาก jsdelivr/cdnjs) · เมนู "รอตรวจสอบ/นำเข้า Excel" เดิมปิดแล้ว · ลิงก์เก่า ?txId= → ledger/index.html
- **ประวัติใหม่** = แท็บ 📜 ใน ledger/index.html (`#hist`): `GET /api/inbox/history?month=&account=&q=` (IN (...) แบ่งชุดละ 90 — D1 จำกัด 100 พารามิเตอร์) · แก้/แตกบรรทัด/ลบรายการที่ยืนยันแล้ว `POST /api/inbox/tx/{id}/edit|delete` (ยอดหัวแก้ได้เฉพาะ WEB_GRID/LINE_TEXT) · เมนูแอปหลัก "ประวัติ (ใหม่)" + "ประวัติธุรกรรม (แบบเดิม)" ยังเก็บ (มี export)
- `diag-account.sh A04` ตรวจบัญชียอดผิด (อ่านอย่างเดียว): แยกที่มา · ยอดสะสมรายเดือน · เครื่องหมายหัว/บรรทัดขัดกัน · ก้อนใหญ่

**ลูกหนี้/เจ้าหนี้ใหม่ (2026-10-11)** = แท็บ 🤝 ใน ledger/index.html (`#debt`)
- `GET /api/inbox/parties` ยอดค้างต่อราย จากบรรทัดในหมวดที่ Captions.behavior = ASSET (ลูกหนี้) / LIABILITY (เจ้าหนี้) · ไม่นับ INVESTMENT · ไม่นับ ASSET+TRANSFER · เฉพาะ CONFIRMED · หัก Settlements เดิม · 1 ราย = contact (ไม่มี = หมวด) · ลูกหนี้ค้าง = −Σamount · เจ้าหนี้ค้าง = +Σamount
- `GET /api/inbox/parties/{c:contact|k:category}` ความเคลื่อนไหว + ยอดสะสม · `POST /api/inbox/contacts` เพิ่มคู่ค้า (ชื่อซ้ำใช้ของเดิม)
- `createManual` รับ category_id/contact_id/entity_id/confirm:true → บรรทัดเดียวตามนั้น สถานะ CONFIRMED (ใช้กับ ให้ยืม · รับคืน · ยืมมา · จ่ายคืน)
- meta หมวดมี behavior/sub_behavior · home.html ใช้ยอด parties ชุดเดียวกัน
- ตาราง Debts เดิม (ทะเบียนสัญญาผ่อน) ยังไม่แตะ · หน้าเดิมคิดยอด start_balance − Σprincipal (เครื่องหมายผิดถ้าจ่ายคืนเป็นยอดลบ) — ถ้าจะย้ายต้องคุยกับ North
- เมนูแอปหลัก: "ลูกหนี้/เจ้าหนี้ (ใหม่)" + "ทะเบียนลูกหนี้/เจ้าหนี้ (แบบเดิม)"

**รายงานใหม่ (2026-10-11)** = `frontend/ledger/reports.html` (เมนู "รายงาน (ใหม่)" · เดิมยังอยู่เป็น "(แบบเดิม)")
- `GET /api/inbox/report?kind=pnl|wht|tb|export&from&to&entity` (เฉพาะ CONFIRMED · บัญชีที่มีสิทธิ์ · entity = บริษัทของบรรทัด) · รวมยอดใน SQL (GROUP BY) ประหยัด CPU
- pnl: จัดฝั่งด้วย d.type แบบภาพรวม (INCOME/CREDIT_AR รับ · EXPENSE/DEBIT_AR จ่าย · TRANSFER ไม่นับ · INVESTMENT แยก) · ดูตามหมวด(จัดกลุ่มหัวข้อ)/บริษัท
- wht: 2 ฝั่ง ถูกหัก/เราหัก · ⚠️ ของเดิม (/api/reports/wht, /api/wht/detail) กรอง wht > 0 → ฝั่งเราหัก (wht ติดลบ) ไม่เคยแสดง
- tb: เดบิต/เครดิตต่อหมวด · export: ทีละเดือน ≤ 3,000 แถว · Excel ตัวเลข #,##0.00;(#,##0.00)
- แก้ของเดิม: /api/reports/trial-balance ตรวจสิทธิ์บริษัทแล้ว
- ยังไม่ย้าย: รายงานทริป/โปรเจกต์ (เมนูทริปปิดอยู่)

**Puii**: ไม่ต้องแก้โค้ด — บอทตอบ LINE ID ให้คนที่ยังไม่ผูก · สิทธิ์เห็นบัญชีมาจาก UserPermissions (ติ๊ก Puii ใน Company ที่หน้าตั้งค่า)

## 🚀 2026-10-07 (ค่ำ) — เริ่มยกเครื่องสมุดจด: ระยะ 0 + ระยะ 1 (หลังบ้าน) — **อ่านก่อนหัวข้อถัดไป**

แผนเต็มอยู่ใน Claude Doc "ยกเครื่องสมุดจดค่าใช้จ่าย RecordRevenue" (https://claude.ai/code/artifact/9f4b715a-fb59-4d44-9950-e861d014f1fb)
North เลือก: หน้าเว็บสมุดจด**ทำใหม่ทั้งหมด** · **ใช้ฐานเดิมร่วมกับทริป** · เริ่ม**ระยะ 0+1** · ลบ Debts BAY Chaiyapruk แล้ว (North รัน) · จุดสำรอง git `b359719`

**ระยะ 0 — แยกทริปออกจากสมุดจด (เสร็จ · ยังไม่ deploy)**
- ทางเข้าทริปรุ่นเก่า (`/api/trips/*` `/api/trip-stops` `/api/travel` `/api/wallets` `/api/trip-expenses`) + ฟังก์ชันช่วย 5 ตัว ย้ายจาก `index.js` → **`backend/src/legacy-trip.js`** (`handleLegacyTrip` คืน null ถ้าไม่ใช่ path ตัวเอง) · ใช้กับหน้าเว็บเก่า app.js/travel.js เท่านั้น
- แอปทริปปัจจุบัน (Enjoy Life Trip) ใช้ `/api/unified-trip` ใน `unified-trip.js` — ไม่ถูกแตะ
- ตรวจ: เรียก 9 path เทียบก่อน/หลังแยก ผลเหมือนกันทุกตัว · `index.js` 3,684 → ~2,870 บรรทัด
- จุดที่ทริปเขียนลงสมุดจด (สัญญา — แก้ต้องตกลงก่อน): `unified-trip.js` INSERT Transactions/TransactionDetails 3 จุด (ปิดทริป · เปิดกลับ · เติมกระเป๋า) + UPDATE Categories 1 จุด

**ระยะ 1 — กล่องรับเอกสาร + LINE Bot รุ่นใหม่ (หลังบ้านเสร็จ · ยังไม่ deploy · หน้าเว็บกล่องยังไม่ทำ)**
- `backend/src/ledger-match.js` ฟังก์ชันล้วน: อ่านข้อความเงินสด · ชื่อธนาคาร/เลขท้าย · คะแนนจับคู่ · เสนอบรรทัดย่อยจากแบบที่จำ (แตกหลายบริษัท + หัก ณ ที่จ่าย + สัดส่วน)
- `backend/src/ledger-inbox.js`: `/api/line-webhook` (แทนของเดิม) · `/api/inbox` · `/upload` · `/cash` · `/file/{id}` · `/{id}/accept|link|account|dismiss`
- ตารางใหม่ (setup-db.sh): `LedgerDocs` `LedgerDocLinks` (role CREATED/MATCHED/SUPPORT) `LedgerRules` (kind ACCOUNT/PARTY/DEFAULT_CASH) + ดัชนี `Transactions(account_id,date)` `Transactions(ref_code)`
- ไฟล์สลิปเก็บใน R2 (binding ICONS) ใต้ `ledger-docs/{family}/` เปิดได้เฉพาะคนในครอบครัวที่ล็อกอิน · `serveIcon` ของทริปปฏิเสธทุก key ที่ไม่ขึ้นต้น `icons/` หรือ `db/` แล้ว (ห้ามถอด)
- LINE: อ่านทุก event (เดิมอ่านแค่ตัวแรก) · ตรวจลายเซ็นเมื่อมี secret `LINE_CHANNEL_SECRET` · สลิป→จับคู่/สร้างรอยืนยัน + ปุ่ม ✓ ถูกต้อง/ไม่ต้องบันทึก · ไม่รู้บัญชี→ถามครั้งเดียวแล้วจำ · "กาแฟ 65"→จดเงินสด (ยืนยันเองเมื่อคำนั้นเคยยืนยัน ≥2 ครั้ง) · "วันนี้/เมื่อวาน/รายวัน/อื่น ๆ" → สรุปเดิม (`lineSummaryReply` ใน index.js)
- กติกาเครื่องหมาย (ตรวจจากข้อมูลจริง): `ยอดหัว = Σยอดย่อย − Σfee − Σwht` · fee บวกเสมอ · **wht เครื่องหมายเดียวกับยอดย่อย** (รายจ่าย -9,990 หัก -280.09 → หัว -9,709.91)
- ⚠️ CHECK ในฐานจริง: Transactions.source ได้แค่ LINE_SLIP/LINE_TEXT/PDF_IMPORT/WEB_GRID · status ได้แค่ PENDING_REVIEW/CONFIRMED
- ⚠️ ข้อมูลจริง: `Users.line_user_id` ของ 9North และ Puii **ว่างทั้งคู่** → ต้องผูก LINE ก่อนใช้ · `Accounts.account_number` ว่างทุกบัญชี → ระบบเรียนจากการเลือกบัญชีครั้งแรกแทน
- เทส: `backend/test/ledger-inbox.test.mjs` 84 เคส (schema ลอกจากฐานจริงรวม CHECK) · เทสทั้งหมดผ่าน: auth 27 · ledger-inbox 84 · money 54 · session 22 · slice 33 · unified-trip 616

**แก้บั๊กหน้าแก้ไขสมาชิก (ต้องทำก่อนให้ North ใส่ LINE ID)**: เดิมแก้สมาชิกแล้วเว้นรหัสว่าง → หน้าจอส่ง '1234' → รหัสถูกเปลี่ยนเป็น 1234 เงียบ ๆ · ตอนนี้แก้สมาชิกเดิมเว้นรหัสว่าง = ใช้รหัสเดิม (backend `/api/users` POST + app.js `openUserModal`/`saveUserItem`) · `app.js?v=178`

**token หมดอายุ = หน้าว่าง (2026-10-08)**: หน้าตั้งค่าว่างเปล่า ตรวจแล้วฐานปกติ (Entities 13) · สาเหตุ = token ใน localStorage อายุ 30 วันหมด → ทุกคำขอได้ 401 แต่หน้าจอไม่รู้ตัว · แก้: ตัวห่อ fetch ใน app.js เจอ 401 → พากลับหน้าล็อกอิน + บอกเหตุผล · `app.js?v=179`

**สลิปจาก LINE ค้าง READING ไม่มีคำตอบ (2026-10-08)**: เงินสดผ่าน · สลิปค้าง = น่าจะเกินเพดาน CPU ~10ms ของ Workers ฟรี ตอนแปลงรูปเป็น base64 ใส่ JSON · แก้: ส่งไบต์ดิบขึ้น Gemini Files API (`/upload/v1beta/files` header `X-Goog-Upload-Protocol: raw`) แล้วอ้าง `fileUri` · อัปไม่ได้ค่อยถอยไป base64 · เพิ่ม `retryDoc` + `/api/inbox/{id}/retry` + พิมพ์ "อ่านใหม่" ใน LINE = อ่านเอกสาร READING/ERROR ล่าสุดซ้ำทีละใบ · ยังไม่ยืนยันด้วย log จริง ถ้ายังเงียบให้ดู `npx wrangler tail` · เทส ledger-inbox 91

**คำสั่งสรุปทาง LINE พังมาตลอด (2026-10-08)**: `sendMonthlySummaryFlex` `get7DayBreakdownText` อ้าง `cp.behavior` โดยไม่ JOIN Captions · `getDailySummaryText` อ้าง `tx.details` ที่ไม่มี → แก้ทั้งสามให้แยกรับ/จ่ายด้วย `d.type` (INCOME / EXPENSE กลับเครื่องหมาย) + ช่วงวันที่แทน LIKE · ทดสอบด้วย node:sqlite ผ่าน "วันนี้/รายวัน/เดือน" · บทเรียน: บอท LINE ไม่เคยใช้งานจริงมาก่อน (ไม่มี secret) โค้ดเดิมฝั่ง LINE ทั้งหมดไม่เคยถูกรันบน production

**Gemini ตอบ 403 (2026-10-10)**: หลังเปลี่ยนเป็น Files API ระบบไม่ถูกตัดแล้ว (ตอบ LINE ได้) แต่ Gemini ปฏิเสธ 403 = ปัญหา API key (ปิด/หมดอายุ/ถูกจำกัด) · ให้ North สร้าง key ใหม่ที่ aistudio.google.com/apikey แล้ว `npx wrangler secret put GEMINI_API_KEY` · error ตอนนี้แนบเหตุผลจาก Google มาใน LINE ด้วย · ส่งรูปเดิมที่ค้าง READING/ERROR ซ้ำ = อ่านใหม่ให้เอง (ไม่ตอบว่าซ้ำ) · เทส ledger-inbox 94

**ต้นเหตุจริงของสลิปค้าง = "Canceled" (2026-10-10)**: `wrangler tail` ขึ้น `POST /api/line-webhook - Canceled` → LINE ตัดสายเพราะรอคำตอบนานเกิน (อ่านสลิปกับ AI หลายวินาที) แล้ว Cloudflare ยกเลิกงานกลางทาง (ไม่ใช่เพดาน CPU อย่างที่เดาตอนแรก) · แก้: `index.js` รับ `ctx` แล้วส่ง `waitUntil` ใน hooks → webhook ตอบ OK ทันที ทำงานต่อเบื้องหลัง แล้วส่งผลด้วย reply token · เทส ledger-inbox 96

**การ์ด LINE + หน้าแก้ไขด่วน (2026-10-10 · North ขอ)**: บันทึกช่วยจำบนสลิป → `TransactionDetails.note` · ตอบ LINE เป็น Flex card (`backend/src/ledger-line-ui.js`) แยกแถว วันที่/บัญชี/คู่ค้า/รายการ/หมวด · ปุ่ม ยืนยัน · เปลี่ยนหมวด (quick reply หมวดใช้บ่อย 12 อัน + "หมวดอื่น…") · แก้ไข · ไม่ต้องบันทึก · ชื่อบัญชี/หมวดแสดงไม่มีรหัส · เลือกบัญชีเป็นปุ่มชื่อ (≤6) + "บัญชีอื่น" · หน้าแก้ไข `frontend/ledger/quick.html` (ไม่ต้องล็อกอิน · ลิงก์เซ็น HMAC ต่อเอกสาร 14 วัน · secret = LINK_SECRET → LINE_CHANNEL_SECRET → GEMINI_API_KEY) แก้วันที่ ยอด รายการ บัญชี (ค้นหาได้) หมวด (ค้นหาได้ เรียงตามใช้บ่อย) แล้วยืนยัน+เรียนรู้ · API `/api/inbox/quick/{doc}[?/file]?t=` · `applyEdits()` ใช้ร่วมกับปุ่มเปลี่ยนหมวด · ⚠️ แก้ไฟล์ผ่าน device_commit_files แล้วต้องรอ/ตรวจว่า mount ฝั่ง VM อัปเดตก่อนแก้ต่อ (เคยเขียนทับด้วยสำเนาเก่า) · เทส ledger-inbox 113

**หลังแก้ในหน้าเว็บ (2026-10-10)**: การ์ดเก่าในแชทแก้ไม่ได้ → (1) ไม่มี LIFF: หน้าเว็บส่ง `via:'web'` เซิร์ฟเวอร์ push การ์ด "บันทึกแล้ว" ค่าใหม่เข้าแชท (กินโควตา push) + หน้าเว็บลอง window.close() · (2) ตั้ง secret `LIFF_ID`: ปุ่มแก้ไขเปิด `https://liff.line.me/{LIFF_ID}?doc=..&t=..&lid=..` หน้าเว็บโหลด LIFF SDK แล้ว `liff.sendMessages("✅ บันทึกแล้ว…")` + `liff.closeWindow()` · บอทเห็นข้อความขึ้นต้น "✅ บันทึกแล้ว" → ตอบการ์ดของเอกสารล่าสุดที่ DONE (reply ฟรี) · LIFF ต้องสร้างใน LINE Login channel (provider เดียวกับบอท) scope `chat_message.write` endpoint `/ledger/quick.html`
**สถานะ LIFF (2026-10-10)**: North สร้าง LIFF แล้ว (LINE Login channel แยก · Size Full · scope profile + chat_message.write · Add friend On Normal · Published) และตั้ง secret `LIFF_ID` แล้ว · การ์ดที่ส่งก่อนตั้ง LIFF ยังใช้ลิงก์เว็บแบบเดิม

⚠️ **device_commit_files แคชตาม stagedPath** — commit ซ้ำด้วยชื่อไฟล์ stage เดิมจะเขียนเนื้อหาเก่าลงเครื่อง (เจอจริง) → ตั้งชื่อไฟล์ stage ใหม่ทุกครั้ง แล้วตรวจ md5 ในเครื่องหลัง commit

**ถัดไป**: North deploy (`bash deploy.sh`) + ตั้ง `LINE_CHANNEL_SECRET` + ผูก LINE ID → ทดลองส่งสลิปจริง · ระยะ 1 ส่วนหน้าเว็บ: หน้า "กล่องรอเคลียร์" ใหม่ (การ์ดปัด · หน้าแตกรายการพร้อมแถบ "เหลืออีก x บาท") ในโฟลเดอร์ใหม่ `frontend/ledger/`

## 🧭 2026-10-07 — สถานะรวม + งานถัดไป (North สั่งบันทึกก่อนย้ายแชท) — **อ่านส่วนนี้ก่อน**

### กติกาการทำงานกับ North (ยังใช้ทุกข้อ)
- คุย**ภาษาไทยเท่านั้น** · North ไม่ใช่โปรแกรมเมอร์ อธิบายเป็นภาษาคน ไม่ใช้ศัพท์โค้ดโดยไม่จำเป็น
- **คำสั่ง terminal ทั้งหมด North รันเอง** — AI ให้คำสั่ง ห้ามรันแทน (ยกเว้นอ่านไฟล์บนเครื่องเพื่อดู) · คำสั่ง D1/deploy ส่งให้ North เสมอ
- ก่อนแก้ไฟล์ **stage ไฟล์จากเครื่อง North มาเทียบก่อนทุกครั้ง** (อีกแชทอาจแก้ไปแล้ว) ห้ามทับด้วยสำเนาเก่าใน container (container ถูกล้างได้ทุกเมื่อ — รอบนี้ /tmp/rr4 หายไปทั้งหมดหลัง 3 สัปดาห์)
- ก่อนบอกว่า "เสร็จ": รัน `node check-frontend.mjs` · `node check-frontend-runtime.mjs` · เทส backend 5 ชุด (`backend/test/*.test.mjs`) ให้ผ่านหมดใน container ก่อน แล้ว North รัน `deploy.sh`
- North ไม่ชอบ AskUserQuestion → ถามเป็นข้อความธรรมดา ใส่ตัวเลือก ก./ข./ค.
- cache-bust: `api.js` `style.css` `themes.css` ต้องมี `?v=` เท่ากันใน index/trips/join (และ print.html ใช้ api.js เวอร์ชันเดียวกัน) — `check-frontend.mjs` ตรวจให้
- เข้าโฟลเดอร์โปรเจกต์: `cd "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue"`
- deploy: `bash deploy.sh` (ตรวจ 2 ชั้น → setup-db.sh → Worker → Pages) · เว็บ `https://record-revenue-web.pages.dev` · API `https://record-revenue.9nimz.workers.dev`

### สถานะ production (ตรวจ 2026-10-07)
- รอบ "การจองของจุดแวะ + หน้าพิมพ์" (2026-09-15) **deploy แล้ว** — `trip-unified-prototype/print.html` ขึ้นบน production
- ฐานข้อมูล: ตาราง `TripBookings` ถูกสร้างผ่าน setup-db.sh ตอน deploy (ถ้าสงสัย: `npx wrangler d1 execute record-revenue-db --remote --command "SELECT name FROM sqlite_master WHERE name='TripBookings';"`)
- สมุดจดค่าใช้จ่าย: ข้อมูล Expense2 ครบ 14,143 รายการ · ข้อมูลทดสอบที่ไม่ได้มาจาก Excel **ลบแล้ว** (Debts 3 แถว ลบ 2026-09-16)
- **ค้างตัดสินใจ**: Debts `DBT1784261675514` "BAY Chaiyapruk" เจ้าหนี้ 4,000,000 เริ่ม 2026-07-01 สร้างในแอป 2026-07-17 (ไม่ได้มาจาก Excel · หมวดเงินต้น/ดอกเบี้ย = AP__AR ซึ่งไม่มีแล้ว) — North ยังไม่บอกว่าลบหรือเก็บ · ถ้าลบ: `npx wrangler d1 execute record-revenue-db --remote --command "DELETE FROM Debts WHERE debt_id='DBT1784261675514';"` · ถ้าเก็บ ต้องแก้หมวดในหน้าหนี้สิน
- ทริป Hokkaido 2026 (`TRP-1783943254256`) เดินทาง 17–28 ธ.ค. 2026 · ในระบบ end_date ยังเป็น 27 ธ.ค. — North ต้องแก้เป็น 28 ธ.ค. ในหน้าตั้งค่าทริปเอง · ยังไม่ได้กรอกการจอง 15 รายการจาก Trip.xlsx (โรงแรม 11 · ไฟลท์ 4) — North จะกรอกเองในเว็บ (ไม่นำเข้าจากไฟล์ ตามที่ตกลง)
- โควตา D1 ฟรี: เคยเกินวันที่ 2026-09-08 (แก้ query แล้ว) · North เลือกอยู่ฟรีเทียร์ · **ยังไม่ได้ตรวจซ้ำว่าเดือน ต.ค. ยังเกินไหม** — ดูใน Cloudflare dashboard → D1 → record-revenue-db → Metrics
- git: โค้ดที่แก้ตั้งแต่ commit `fc61075` **ยังไม่ได้ commit เลยหลายรอบ** — ควรให้ North รัน `git add -A && git commit -m "trip bookings + print + expense2 import + dashboard"` เก็บจุดกู้คืน

### งานถัดไป (เรียงตามที่เสนอ North 2026-10-07 · North ยังไม่ได้เลือก)
- **ก. ใช้ของจริง** — North กรอกการจอง 15 รายการเข้าทริป Hokkaido แล้วกดพิมพ์ → เก็บ feedback มาปรับ (ตัวอย่างข้อมูลครบอยู่ใน `trip-import/Trip-mapping.xlsx` แผ่น "ข้อมูลหลังแปลง") · เส้นตายยกเลิกฟรีโรงแรมเริ่ม 25 พ.ย. 2026 ระบบจะเตือนเองเมื่อกรอกแล้ว
- **ข. ระยะ 2 — ปุ่ม "บันทึกลงสมุดจด" จากการจอง** — สร้างรายการ Dr. ค่าที่พัก/ค่าเดินทาง · Cr. บัตรเครดิต (เลือกบัญชี C01–C07) · `TransactionDetails.project_id` = ทริป · เก็บ `TripBookings.linked_transaction_id` + `pay_account_id` · **ต้องตั้งหมวด "ค่าที่พัก" "ค่าเดินทาง" ในสมุดจดก่อน** (ตอนนี้ไม่มี) · ยังไม่มีบัญชีบัตร KTC (ไฟล์ใช้ "KTC" 3 แถว) — ถ้าทำข้อนี้ต้องเพิ่ม `[C08] KTC Credit Card`
- **ค. งานค้างสมุดจด**: (1) ตัวตรวจยอดฟอร์มกรอกมือใช้สูตร |หัว|=|ย่อย|+|fee|+|wht| แต่ข้อมูลจริงใช้ หัว=ย่อย−fee−wht (2) กันลบหมวดที่มีรายการอ้างถึง (3) ปุ่มรวม/ย้ายหมวด (ของเก่าเปลี่ยนตาม — North ถามไว้) (4) Puii ยังไม่มีสิทธิ์ Entity ใด (5) แดชบอร์ดช่วง ปี/ทั้งหมด ส่งรายการย่อยทั้งหมด (~4MB) ควรสรุปฝั่งเซิร์ฟเวอร์
- **ง. ระบบ**: ตรวจโควตา D1 เดือนใหม่ · commit git · Workers Paid $5/เดือน ถ้าโควตายังเกิน (North เลือกฟรีไว้ก่อน)

### ไฟล์/โฟลเดอร์ที่ต้องรู้
- `HANDOFF.md` (ไฟล์นี้) · `import-expense2/` (นำเข้า Expense2 + README-นำเข้า.md + วิธีรันทั้งระบบในเครื่อง) · `trip-import/` (วิเคราะห์ Trip.xlsx · แบบ · mockup · SQL ตาราง TripBookings · รูปของจริง)
- สมุดจด: `frontend/index.html` `app.js` `style.css` · `backend/src/index.js` · ทริป: `frontend/trip-unified-prototype/` · `backend/src/unified-trip.js` · เทส `backend/test/`
- ตัวตรวจ: `check-frontend.mjs` `check-frontend-runtime.mjs` (jsdom) · deploy: `deploy.sh` → `setup-db.sh` (migration แบบยิงทีละคำสั่ง รันซ้ำได้)

---

## 🆕 2026-09-15 — การจองของจุดแวะ (จาก Trip.xlsx) + สกุลเงินต่อจุด + หน้าพิมพ์ A4

North ส่งตาราง Trip.xlsx (แผนเที่ยว + สมุดจองในแผ่นเดียว) แล้วให้ออกแบบให้ระบบทริปรองรับ
วิเคราะห์/แบบ/mockup อยู่ที่ `trip-import/` (ออกแบบ-ทริป-จาก-Trip.xlsx.md · mockup-booking-ui.html)
**ไม่มีการนำเข้าข้อมูลจากไฟล์** — North สร้างจุดแวะในเว็บเองตามเดิม (คำตอบ 8.4)

### ฐานข้อมูล
- ตารางใหม่ `TripBookings` ผูก 1:1 กับ `TripStops` (`stop_id UNIQUE`) — สร้างผ่าน `setup-db.sh`
  (deploy.sh รันให้) หรือ `trip-import/sql/add_trip_bookings.sql` · setup-db.sh เพิ่ม `TripStops.stop_tag` ให้ด้วยแล้ว
- คอลัมน์: kind (HOTEL/FLIGHT/TRANSPORT/TICKET/OTHER) · status (CONFIRMED/BACKUP/CANCELLED) · vendor · ref_no (ข้อความเสมอ)
  · check_in/check_out · depart_from/arrive_to/arrive_time · room_desc/view_desc/size_sqm · travelers + adults/children/child_ages
  · inc_breakfast/inc_lunch/inc_dinner/has_parking/has_laundry (1/0/NULL=ไม่ทราบ) · pay_status (UNPAID/PAID/PAY_AT_VENUE)
  · pay_date · pay_account_id (ยังไม่ใช้ · ระยะ 2) · pay_method (ข้อความอิสระ เช่น "3696"/"KTC") · cancel_deadline · linked_transaction_id
- 🔴 **ราคาไม่อยู่ในตารางนี้** — ใช้ `TripStops.planned_cost/planned_currency` ที่เดียว

### เซิร์ฟเวอร์ (`backend/src/unified-trip.js`)
- `POST /stops` รับ `body.booking`: ไม่ส่ง = ไม่แตะ · `null` = ลบ · object = สร้าง/แก้ (upsert ตาม stop_id)
  ตรวจค่าก่อนแตะฐาน (`normalizeBooking`) → การจองผิด = จุดแวะไม่ถูกบันทึกด้วย
- ลบจุดแวะ / ลบทริป → ลบการจองตาม (batch) · bundle GET คืน `bookings: []` (ไม่ JOIN เพราะชื่อคอลัมน์ชนกัน)
- เทส `unified-trip-write.test.mjs` บล็อก "การจองของจุดแวะ" 24 เคส → รวม 616 ✅

### หน้าจอ (`frontend/trip-unified-prototype/`)
- `api.js` v53: ประกบ `activity.booking` (snake_case ตามฐาน) · `saveStop` ส่ง `booking` · เพิ่ม `activity.city`
- ฟอร์มแก้ไข (index.html/app.js v136/style.css v167): ช่องงบมี `#activityCurrency` (สกุลของทริป + THB เสมอ · North: เลือกได้ตามประเทศ)
  · กล่อง `<details id="bookingBox">` พับไว้ · ช่องเปลี่ยนตามชนิด (`.bk-hotel` / `.bk-travel`) · ปุ่มบริการ 3 สถานะ (`data-state` 1/0/"")
  · ส่วนจ่ายเงินล่างสุด · `readBookingForm()` คืน object / null (ล้างหมด = ลบ) / undefined (ไม่เคยมีและไม่กรอก)
  · ประเภท "ที่พัก" ของใหม่ → เวลาตั้งต้น 15:00 (เวลาไปถึง · North 8.5) และเช็กอิน = วันของจุดแวะ
- การ์ดในแผน: `bookingTags()` (เลขจอง · ห้อง · ผู้เข้าพัก · จ่ายแล้ว/ยังไม่จ่าย · ยกเลิกฟรีถึง · ไอคอนบริการ)
  · สำรอง = `.booking-backup` (เส้นประ + ริบบิ้น) · ที่พักหลายคืน → การ์ดเงา `.plan-ghost` ในวันถัดไป (ไม่ใช่ .plan-item · แตะแล้วไปวันเช็กอิน)
  · `#bookingAlert` เส้นตายยกเลิกฟรีที่ใกล้ที่สุด (≤14 วัน · ≤3 วัน = สีด่วน · รวมของสำรอง) · `#bookingSummary` (คืน/ไฟลท์/จ่ายแล้ว/ยอด นับเฉพาะยืนยัน) + ปุ่มพิมพ์
- `print.html` (ใหม่): A4 · ใช้ `TripApi.fetchTrip()` ชุดเดียวกับหน้าแผน · แผนรายวัน + ตารางที่พัก + การเดินทาง + ปฏิทินเงิน
  · ตัวเลือก รวมสำรอง / บรรทัดจดมือ / ปฏิทินเงิน · เปิดจากปุ่ม "พิมพ์แผน" (`print.html` + query เดิม)
- `check-frontend-runtime.mjs` บล็อก "การจองของจุดแวะ" 34 เคส · ช่องเวลาที่ 5 (`#bookingArrive`) ถูกยกเว้นจากเทส "4 ช่อง"

### ยังไม่ทำ (ระยะ 2 ตามที่ North ตกลง)
- ปุ่ม "บันทึกลงสมุดจด" จากการจอง (Dr. ค่าที่พัก/ค่าเดินทาง · Cr. บัตรเครดิต · ติดป้ายทริป) — ต้องตั้งหมวดค่าที่พัก/ค่าเดินทางในสมุดจดก่อน
- ทริป Hokkaido ตั้ง end_date = 27 ธ.ค. แต่ไฟลท์กลับถึง 28 ธ.ค. — North แก้เองในหน้าตั้งค่าทริป

## 🆕 2026-09-07 — Deploy Enjoy Life Trip + แก้ feedback หลังใช้งานจริง

### สถานะ production

- Worker รุ่นใหม่ deploy แล้วเวลา 2026-09-07 04:17 UTC (version `67585b96-dbf8-4e69-9a60-48ef691b56f5`)
- Pages deploy รอบชุด Momo/Enjoy Life Trip แล้ว และ deploy แก้ feedback ล่าสุดแล้ว:
  `https://da0e645a.record-revenue-web.pages.dev`
  (หน้าใช้งานหลัก: `https://record-revenue-web.pages.dev`)
- `deploy.sh` เริ่มได้ถึง Worker แต่ log หยุดก่อนขั้น Pages จึงต้อง deploy Pages แยกด้วย
  `npx wrangler pages deploy frontend --project-name record-revenue-web` — สำเร็จแล้ว
- `setup-db.sh` พบ API ผิดพลาดชั่วคราว 1 คำสั่งที่ `TripStops.planned_cost` แต่ตรวจผลท้ายสคริปต์
  ยืนยันว่าคอลัมน์/ตารางที่จำเป็นครบทั้งหมด จึงไม่ใช่ migration ค้าง

### Feedback ที่แก้และ deploy แล้ว

1. **วันที่ของแต่ละ Stop บนหน้ารวมทริป**
   - API ส่ง `stop_date` มาครบอยู่แล้ว แต่ `trips.js` ไม่เคยแสดงมัน
   - เพิ่ม `stopDateLabel()` และ `<time class="trip-stop-date">` ใต้ชื่อ Stop
   - วันที่ ISO แสดงแบบไทยย่อ; ค่าเก่าหรือวันที่ว่างแสดง `ยังไม่กำหนดวัน` ไม่ให้มี
     `Invalid Date`
   - ปรับความกว้างการ์ด Stop เป็น 84px และเพิ่ม style วันที่
   - cache-bust: `trips.css?v=20`, `trips.js?v=9`

2. **ลบเอกสารแล้วค้างบนหน้าจอจนต้อง refresh**
   - API ลบจากฐานสำเร็จ แต่ UI รอ `refreshFromServer()` ทั้งทริปและผลบนจอไม่ทันที
   - หลัง `TripApi.removeDocument()` สำเร็จแล้ว ให้ลบออกจาก `tripDocuments` โดยตรง
     แล้ว render คลังเอกสาร, เอกสารของ Stop ที่กำลังเปิด และตัวนับสรุปใหม่ทันที
   - ถ้า API ล้มเหลว จะไม่เปลี่ยน state และเปิดปุ่มลบกลับให้

### จุดใช้งานที่ควรปรับ UX ต่อ (ยังไม่ได้ทำ)

- ฟอร์ม Stop มีช่อง `วันที่` จริง แต่เป็น `<select id="activityDay">` ที่เลือกจากวันในแผน
  ไม่ใช่ปฏิทินกรอกตรง ๆ จึงหาไม่เจอและสร้างความสับสน
- ปัจจุบันผู้ใช้ต้องเข้า **แผนเที่ยว → เพิ่มสถานที่ → เลือก "วันที่"**; ถ้าต้องการวันใหม่
  ต้องกด **เพิ่มวัน** ก่อน แล้วค่อยเพิ่ม Stop
- ข้อเสนอที่ North รับทราบ: เปลี่ยนเป็น input แบบปฏิทินในฟอร์ม Stop แล้วจัดกลุ่มแผนตามวัน
  อัตโนมัติ โดยคง dropdown/การจัดลำดับเดิมเฉพาะเมื่อมีประโยชน์

### ผลตรวจหลังแก้ feedback

```
node --check frontend/trip-unified-prototype/trips.js   ✅
node --check frontend/trip-unified-prototype/app.js     ✅
node check-frontend.mjs                                 ✅
node check-frontend-runtime.mjs                         ✅
git diff --check                                        ✅
```

> `npm test` ผ่านเต็มก่อนแก้ feedback นี้: backend 618 เคส + UI 105 เคส
> (การแก้ล่าสุดแตะ frontend เท่านั้น; ถ้าจะทำงานต่อรอบใหญ่ ให้รัน `npm test` อีกรอบ)

### อาการ “โหลดรายการทริปไม่สำเร็จ” หลัง deploy

- ตรวจ endpoint production แล้ว API ตอบตามปกติ; เมื่อไม่มี session จะตอบ 401 พร้อม
  `ยังไม่ได้ล็อกอิน หรือ token หมดอายุ`
- หน้า `trips.html` ถูกออกแบบให้ต้องใช้ `logged_in_user` หรือ `session_token` จากหน้าแอปหลัก
  ในแท็บ/โดเมนเดียวกัน; ให้ล็อกอินแอปหลักก่อน แล้วกดเมนู Enjoy Life Trip ใหม่
- ถ้าล็อกอินใหม่แล้วยังเกิด ต้องเก็บข้อความ error จริง/HTTP status ก่อนเดาแก้ต่อ

## 🆕 2026-09-07 — ตรวจการเชื่อมระบบค่าใช้จ่าย ↔ Enjoy Life Trip + Momo

**สถานะ:** ชุดภาพ/ชื่อ/เทส UI deploy แล้วเมื่อ 2026-09-07 และมี deploy หน้าเว็บ
แก้ feedback ล่าสุดตามหัวข้อด้านบนแล้ว

- ยืนยันเส้นทางบัญชีครบ: บิลทริป → preset/category → Caption ของสมุดหลัก →
  กระเป๋าที่ผูก `Accounts.account_id` → ปิดทริปสร้าง `Transactions` และ
  `TransactionDetails.project_id` → เปิดกลับสร้างรายการกลับครบทุก transaction
- บัญชีให้เลือกในทริปกรองด้วย `UserPermissions` และไม่ส่ง `TRIP_HOLDING` กลับมา
- ชุดทดสอบ backend ครอบคลุมหลายบัญชี, บัตรเครดิต, สินทรัพย์, FX, KEEP/CARRY/RETURN
  และการเปิดกลับจนยอดสุทธิเป็นศูนย์
- แก้ `live-mode.test.mjs` ที่ค้างอยู่กับ UI รุ่นเก่า (รอแถบ success ที่ถูกถอดแล้ว,
  ใช้ category selector/ช่องเวลา/แผงจัดการแบบเก่า) ให้ตรงกับหน้าจอปัจจุบัน
  ผลล่าสุด **105 ผ่าน · 0 ไม่ผ่าน** รวม flow จดบิล เติมเงิน ปิดทริป และเปิดกลับ
- เปลี่ยนชื่อที่เมนูหลักเป็น **Enjoy Life Trip** และเพิ่มไอคอนแอป
- เพิ่มมาสคอต **Momo** นักเวทนักเดินทางต้นฉบับ โทนม่วง–coral–mint–ทอง
  แบบ 3D สีสดใส โดยไม่ใช้ตัวละคร/ตรา/เครื่องแต่งกายจากแฟรนไชส์ Harry Potter
- asset ใหม่:
  `frontend/trip-unified-prototype/art/momo-mascot-v1.png`
  และ `frontend/trip-unified-prototype/art/enjoy-life-trip-icon-v1.png`
- cache-bust ของ `style.css` เป็น **v161** ตรงกันทั้ง index/trips/join

ผลตรวจล่าสุด:

```
session 22 · auth 27 · unified-trip-write 569 · live UI 105 = 723 เคส ผ่านหมด
node check-frontend.mjs          ✅
node check-frontend-runtime.mjs  ✅
git diff --check                ✅
```

⚠️ ก่อน deploy รอบถัดไปให้ใช้ `deploy.sh` ตามเดิม และควรตรวจภาพ Momo บนจอจริง
ทั้งมือถือกับเดสก์ท็อปอีกครั้ง เพราะ jsdom/Playwright assertions ไม่ตัดสินความสวยงามแทนคน

🔴 **`backend/db/schema.sql` เป็นแบบร่าง ไม่ตรงกับฐาน production — อย่าเชื่อ**

ตัวอย่างที่ทำให้พังมาแล้ว: `Captions` ในฐานจริงใช้ **`type_id`** เป็น primary key ไม่ใช่ `caption_id` ตามที่ schema.sql เขียนไว้ · เขียน SQL ตามไฟล์นั้นแล้วได้ `no such column: caption_id`

**ก่อนเขียน SQL หรือ query ที่แตะตารางไหน ให้ดูของจริงก่อนเสมอ**

```
npx wrangler d1 execute record-revenue-db --remote --command \
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('ตารางที่จะใช้');"
```

และ **schema จำลองในไฟล์เทสต้องลอกจากของจริง** ไม่ใช่จาก schema.sql ไม่งั้นเทสจะผ่านหมดแต่พังบน production

🔴 **เทส 674 เคสผ่าน ไม่ได้แปลว่าหน้าเว็บเปิดได้** — เทสทั้งหมดอยู่ฝั่ง backend
ไม่มีอะไรรัน `app.js` เลย บั๊กที่ฆ่าทั้งแอปจึงหลุดผ่านได้สบาย ๆ

เกิดจริง 2026-08-23: ลบฟังก์ชัน `renderMemberAccess()` ทิ้งตอนยุบการ์ดลิงก์ทริป
ไปรวมกับแถวสมาชิก แต่ชื่อมันยังค้างอยู่ในลิสต์ที่วนเรียกใน `applyLiveState()`
→ throw ก่อนข้อมูลจริงจะถูกใส่ → ทั้งแอปขึ้นแถบแดง
`Can't find variable: renderMemberAccess` แล้วตกกลับไปโชว์ข้อมูลตัวอย่าง
`node --check` ผ่าน เทสผ่านหมด ไม่มีอะไรเตือนเลย

**ทางกัน — ด่านสองชั้น ที่ `deploy.sh` เรียกให้เองก่อน deploy และหยุดถ้าไม่ผ่าน:**

`node check-frontend.mjs` — *อ่านโค้ด* ตรวจ 5 อย่าง ทุกข้อคือบั๊กที่เคยเกิดจริง:
ฟังก์ชันที่เรียกแต่ไม่มีการประกาศ · `$('#id')` ที่ไม่มีใน HTML ·
`data-*` ที่สร้างแล้วไม่มีใครอ่าน (= ปุ่มกดแล้วเงียบ) · ปีกกา CSS ไม่ครบ ·
เลข cache-bust ของไฟล์ที่ใช้ร่วมกันไม่ตรงกัน 3 หน้า

`node check-frontend-runtime.mjs` — *รันจริง* เอา app.js ไปรันใน jsdom
แล้วดักทุก error พร้อมกดปุ่มจริงทดสอบ · จับได้ทันทีที่เขียนอีกหนึ่งบั๊กที่หลุด
ทั้ง syntax check และเทสทั้งหมด: `nextPlanDate()` ยัดวันที่ภาษาไทย
`'8 ก.พ. 2027'` (รูปแบบของข้อมูลตัวอย่าง) เข้า `new Date()` → Invalid Date →
`.toISOString()` โยน RangeError ตั้งแต่การวาดรอบแรก ทำให้ `renderBills()` กับ
`renderJourneyPreview()` ที่เขียนไว้ถัดไป**ไม่ทำงานเลย ตายเงียบสนิท**

🔴 `day.date` มีสองรูปแบบเสมอ: ISO ในโหมดข้อมูลจริง · ข้อความไทยในข้อมูลตัวอย่าง
ก่อนเอาไปคำนวณต้องเช็ค `/^\d{4}-\d{2}-\d{2}$/` ทุกครั้ง ห้ามเชื่อว่า "มีค่า = ใช้ได้"

**ลบฟังก์ชัน แก้ CSS ด้วยสคริปต์ หรือแตะ app.js เมื่อไร ให้รันทั้งสองตัวก่อนบอก North ว่าเสร็จ**

- Frontend: `frontend/index.html`, `frontend/app.js`, `frontend/style.css`
- Backend: `backend/src/index.js` (deploy ที่ root — `main` อยู่ใน `wrangler.json`)
- URL: https://record-revenue-web.pages.dev · API: https://record-revenue.9nimz.workers.dev
- เวอร์ชัน cache-bust: `frontend/index.html` → `style.css?v=129` `travel.js?v=105` `app.js?v=177` · `trip-unified-prototype/` ทั้ง 3 หน้า (index/trips/join) → `style.css?v=166` `themes.css?v=18` `api.js?v=52` · index เพิ่ม `money.js?v=3` `slice-engine.js?v=2` `app.js?v=135` · trips เพิ่ม `trips.css?v=20` `trips.js?v=9` · join เพิ่ม `join.js?v=2`
  ⚠️ **ไฟล์ที่ใช้ร่วมกัน (`api.js` `style.css` `themes.css`) ต้องใช้เลขเดียวกันทั้ง 3 หน้า** — Cloudflare Pages ไม่สนใจ query string แต่เบราว์เซอร์แคชแยกตาม URL ถ้าเลขไม่ตรง หน้าที่เลขเก่ากว่าจะยังได้ไฟล์เก่าค้างในแคช (เคยหลุดมาแล้ว: join.html ค้างที่ api.js?v=24 ขณะที่ index อยู่ v31 → ผู้ร่วมทริปได้โค้ดเก่า)


---

# 🆕 2026-09-08 — แดชบอร์ดหลัก: เลือกช่วงเวลา · หน้าขยาย · "ข้อมูลถึงวันไหน"

North (หลังนำเข้า Expense2 สำเร็จ): *"หน้านี้ไม่แสดงผลลัพธ์ สินทรัพย์ รายรับ รายจ่าย … ข้อมูลตัวเล็กเกินไป
ต้องการให้มีปุ่ม พอกดไปแล้วเห็นการ์ดในแต่ละเรื่องและตัวเลขชัดเจน … และบอกด้วยว่าข้อมูลถึงวันไหน"*

## ทำไมหน้าแรกว่างทั้งที่มีข้อมูล 14,143 รายการ

แดชบอร์ดดูได้ **ทีละเดือน** และเริ่มที่ **เดือนปัจจุบัน** เสมอ · ข้อมูลจริงจบ 7 พ.ย. 2025 → ก.ย. 2026 ว่างเปล่า
ยอดคงเหลือ (Statement/Credit) ขึ้นเพราะไม่ผูกกับเดือน

## ที่แก้ — `backend/src/index.js` `/api/dashboard/summary`

- `period=month|year|all` (ค่าเริ่มต้น month) · `month=latest` → เดือนล่าสุดที่มีรายการจริง
- คืน `range {first_date,last_date,count}` และต่อบัญชี `last_date` `tx_count`
- 🔴 **จัดฝั่งรับ/จ่ายด้วย `d.type` ก่อน** (INCOME/CREDIT_AR → รับ · EXPENSE/DEBIT_AR → จ่าย · TRANSFER → ไม่นับ)
  เดิมดูแค่ Caption behavior → **เงินโอน 2,462 แถว ยอดยกมา บัญชีพัก (Asset) ถูกนับเป็นรายรับ** และเงินกู้ (Liability) เป็นรายจ่าย
  แถวเก่าที่ไม่มี type ยังใช้กติกาเดิม
- "เงินไปไหน" ไม่นับ TRANSFER/INCOME · ลูกหนี้/เจ้าหนี้ ไม่นับ Asset ที่เป็น TRANSFER (Liability ยังอยู่)
- งบ: month = MONTHLY+YEARLY · year = YEARLY · all = ไม่เทียบงบ

## `frontend/app.js` + `style.css`

- `DashState.period/range` · เปิดครั้งแรกขอ `month=latest` แล้วตั้งเดือน/ปีตามที่เซิร์ฟเวอร์ตอบ
- แถบบน: ชิป **เดือน / ปี / ทั้งหมด** · ลูกศรเลื่อนเดือนหรือปีตามโหมด · ป้าย "📅 ข้อมูลถึง …"
- Hero: บรรทัด "ข้อมูลถึง … · N รายการ"
- ปุ่ม 🔍 มุมขวาบนของการ์ด Statement · Credit · Investment · รายรับ · รายจ่าย · เงินไปไหน → `dv2Zoom(kind)`
  หน้าขยาย `#dv2-zoom` (สร้างครั้งแรกแล้วใช้ซ้ำ · Esc/แตะพื้นหลังปิด · มือถือเต็มจอ)
  ตัวเลขรวม 2.8rem · แถวละ 1.12rem · Statement บอก "รายการล่าสุด <วันที่> · N รายการ" ต่อบัญชี
- ปุ่มขยายเป็น `position:absolute` (ไม่งั้นหัวข้อ 3 ชิ้นใน h3 flex-wrap ตกบรรทัด) · h3 ที่มีปุ่มได้ `padding-right:38px` ผ่าน `:has()`
- `dv2Avg` เฉลี่ยต่อวันตามจำนวนวันจริงของปี/ช่วงทั้งหมด

ตรวจด้วย Chromium (mock data) ที่ 1280/414px · เทส backend 728 ผ่าน

## รอบสอง (วันเดียวกัน) — การ์ดรายรับ/รายจ่าย/Investment สรุปตามหมวด

North: *"สินทรัพย์ investment รายรับ รายจ่าย อยากให้สรุปมาเป็นแบบ Category ตอนนี้เหมือนแยกรายการออกมา"*
- `dv2ByCat(rows, valueFn)` รวมรายการเป็นหมวด (เรียงตาม |ยอด|) · การ์ดทั้งสามแสดง "หมวด · N รายการ · ยอด"
- หน้าขยาย: แถวหมวดกดเปิด/ปิดรายการข้างใน (`dv2ZoomToggle` · `.dv2-zoom-items[hidden]`)
- เวอร์ชัน `style.css?v=129` `app.js?v=175`

⚠️ โหมด "ปี"/"ทั้งหมด" ส่งรายการย่อยทั้งช่วงมาที่หน้าจอ (ทั้งหมด ≈ 15k แถว ≈ 4MB) — ยังไม่ได้ทำสรุปฝั่งเซิร์ฟเวอร์ ถ้าช้าบนมือถือค่อยย้ายการรวมหมวดไปฝั่ง API

## 🔴 D1 ฟรีเทียร์เต็ม (2026-09-08 · rows_read 7.95M/5M · rows_written 116k/100k)

อีเมลจาก Cloudflare: ระบบตอบ error จนถึง 2026-09-09 00:00 UTC (07:00 ไทย) · rows_written เกินเพราะนำเข้า 29k แถว × index (ครั้งเดียว)
rows_read เกินเพราะ query ที่สแกนทั้งตารางซ้ำ ๆ — พอมีข้อมูล 14k รายการแล้วเห็นผลทันที:

| ต้นเหตุ | เดิม | แก้เป็น |
|---|---|---|
| `/api/transactions` GET หน้าประวัติ | ส่ง `?month=` มาแต่ฝั่งเซิร์ฟเวอร์ไม่อ่าน → ดึง **ทั้ง 14,143 รายการ + รายการย่อย** ทุกครั้งที่เปิดหน้า | รองรับ `month` (แปลงเป็นช่วง `>= <`) · ไม่ระบุช่วง/คำค้น → **500 รายการล่าสุด** (`limit=` ปรับ · `limit=0` = ทั้งหมด) · หน้าจอส่ง `limit=0` เองเมื่อผู้ใช้ใส่ตัวกรองฝั่งจอ + ขึ้นป้าย "แสดง 500 รายการล่าสุด" |
| แดชบอร์ด: `substr(t.date,1,7) = ?` (5 จุด) | substr ทำให้ `idx_transactions_date` ใช้ไม่ได้ → สแกน 14k แถวต่อ query | `t.date >= ? AND t.date < ?` (EXPLAIN: SEARCH USING INDEX) |
| แดชบอร์ด: ยอดคงเหลือต่อบัญชี | subquery ต่อบัญชี 3 ชุด (bal · last_date · count) × 34 บัญชี | JOIN กับ `GROUP BY account_id` อ่านรอบเดียว |
| `/api/wht/detail` | substr | ช่วงวันที่ |

ยังเหลือที่สแกนทั้งตารางโดยธรรมชาติ: ลูกหนี้/เจ้าหนี้คงค้าง (15k รายการย่อย ต่อการเปิดแดชบอร์ด 1 ครั้ง) · `/api/accounts` subquery ต่อบัญชี (ใช้ index แล้ว ≈ 14k) · export/backup
ประมาณหลังแก้: เปิดแดชบอร์ด ≈ 35k rows_read · หน้าประวัติ ≈ 3k → ฟรีเทียร์พอใช้ (5M/วัน ≈ 100+ ครั้ง/วัน)
ทางเลือกถ้าเกินอีก: Workers Paid $5/เดือน (25B reads) — North เลือก **ไม่จ่าย ใช้ฟรีต่อ** (2026-09-08)
เทียบ Supabase ให้แล้ว: ไม่คุ้มย้าย (ฟรีเทียร์หยุดถ้าไม่ใช้ 7 วัน · Pro $25 · ต้องแปลง query ทั้งระบบเป็น Postgres)

**รันในเครื่องได้แล้ว** (`app.js` v177): เปิดจาก localhost → API_BASE = `http://localhost:8787` อัตโนมัติ (หรือ `?api=` เก็บใน sessionStorage)
· `run-import.sh --local` / `verify-quick.sh --local` เขียนลงฐานจำลอง `.wrangler/state` · ขั้นตอนเต็มอยู่ท้าย `import-expense2/README-นำเข้า.md`

## ข้อมูลที่ไม่ได้มาจาก Excel (North สั่งลบ 2026-09-08)
Debts ทดสอบ 3 แถว (`6666` `มานะ` `adds`) ลบได้ · `BAY Chaiyapruk 4,000,000` (WA09) ดูเป็นของจริง — ถามก่อน
คงไว้: YOUTRIP (ผูกกับกระเป๋าทริป Hokkaido) · หมวด Travel_* / Cash (ระบบทริป) · W98 W99 · S04 S08

⚠️ FontAwesome ไอคอนลูกศรไม่โหลดใน harness ออฟไลน์ (ปุ่มเป็นเม็ดเปล่า) — บน production ปกติ

---

# 🆕 2026-09-07 (รอบเก้า) — นำเข้าข้อมูลจริงสมุดจดค่าใช้จ่าย (Expense2.xlsx)

ทุกอย่างอยู่ใน **`import-expense2/`** · อ่าน `README-นำเข้า.md` และ `วิเคราะห์การนำเข้า-Expense2.md` ก่อนแตะ

**ข้อเท็จจริงสำคัญ**
- ก่อนนำเข้า ฐานจริง (export 7 ก.ย. 16:04 = `backup-before-import.sql`) **ไม่มี Transactions เลย** — North ล้างข้อมูลเก่าไปแล้ว
- ไฟล์ Expense2 = 14,143 รายการ / 15,162 รายการย่อย · `RefCode` 13 ตัวแรก = รายการ · 2 ตัวท้าย = ลำดับย่อย
- สมดุล 100%: `Statement Amount = −ΣAmount − Fee − ΣWHT` · ในระบบเก็บ `amount = −Amount` (เงินเข้า = บวก เหมือนยอดหัว)
  → กติกาตรวจ: `total_amount = Σamount − Σfee − Σwht` **(หน้าจอกรอกมือใช้สูตร |หัว| = |ย่อย|+|fee|+|wht| ซึ่งไม่ตรงกัน — งานค้าง)**
- **Head Owner** ในไฟล์ถูกแยกเป็น 3 ช่องของระบบ (North นิยาม): A/C = บัญชี · S/X = Entity · T/G/R/B/L/Z = Category (id = รหัส) · W = Contact
- คอลัมน์ใหม่ `TransactionDetails.head_owner` + `group_detail` เก็บรหัสดิบทุกแถว — จัดหมวดใหม่ได้เสมอโดยไม่ต้องกลับไปหา Excel
- Entity ใหม่: `Ent_North` (ส่วนตัว) · `Ent_X01` Lottery · `Ent_X02` MaemorBerDee (+ UserPermissions ให้ 9North) · Categories ใหม่ 44 · Accounts 34 (A25 = Puii Bank · Z00 = รายการปรับปรุงไม่ผ่านธนาคาร)
- `type` ของรายการย่อย: INCOME/EXPENSE/TRANSFER · AP(AR) ใช้ CREDIT_AR/DEBIT_AR ตามทิศทางเงิน · X-entity ใช้ทิศทางเงิน

**ขั้นตอน**: `bash import-expense2/run-import.sh` (รันซ้ำได้ · INSERT OR IGNORE) → `verify-quick.sh` → export แล้ว `python3 verify_import.py` ต้องผ่าน 10/10
(ทดสอบ SQL ชุดจริงกับ SQLite ที่โหลด schema จริงแล้ว ผ่าน 10/10 ก่อนส่ง)

**งานค้างที่เกิดจากรอบนี้**: (1) ตัวตรวจยอดในหน้าจอกรอกมือใช้สูตรคนละแบบกับข้อมูลจริง (fee/WHT) (2) ปุ่ม "รวม/ย้ายหมวดหมู่" ยังไม่มี (3) แอปยังไม่กันการลบหมวดที่มีรายการอ้างถึง (4) Puii ยังไม่มีสิทธิ์ Entity ใด

---

# 🆕 2026-09-07 (รอบแปด) — ประเภทของจุดแวะถูกเก็บจริงแล้ว (คอลัมน์ใหม่)

North เลือก **ทางเลือก ก.** จากที่เสนอไว้ในรอบเจ็ด: *"ก. เก็บประเภทจริง"*

## 🔴 ต้องรัน ALTER TABLE **ก่อน** deploy worker

Worker รุ่นใหม่เขียนคอลัมน์ `stop_tag` ทุกครั้งที่บันทึกจุดแวะ ถ้า deploy ก่อน
เพิ่มคอลัมน์ = **บันทึกจุดแวะไม่ได้เลยทั้งทริป** (`no such column: stop_tag`)

```
npx wrangler d1 execute record-revenue-db --remote --command \
  "ALTER TABLE TripStops ADD COLUMN stop_tag TEXT;"
```

ตรวจว่าขึ้นแล้ว:

```
npx wrangler d1 execute record-revenue-db --remote --command \
  "SELECT sql FROM sqlite_master WHERE name='TripStops';"
```

## ที่แก้

**`backend/src/unified-trip.js` · `writeStop()`**

```js
const stopTag = String(body.stop_tag || '').trim().slice(0, 40);
```

- INSERT เพิ่มคอลัมน์ `stop_tag`
- UPDATE ใช้กติกาเดียวกับช่องอื่น: `body.stop_tag === undefined ? existing.stop_tag : stopTag || null`
  → **ไม่ส่งมา = ไม่แตะของเดิม · ส่งค่าว่าง = ตั้งใจล้าง** สองอย่างนี้ห้ามยุบเป็นอันเดียว
  (ฝั่งอื่นที่เขียน Stop โดยไม่รู้เรื่องประเภท เช่นเช็กอิน จะได้ไม่ล้างของที่คนตั้งไว้)
- ⚠️ **ไม่ล็อกเป็นรายการตายตัวฝั่งเซิร์ฟเวอร์** คุมแค่ความยาว 40 ตัว —
  เผื่อทางเลือก ข. (ให้ผู้ใช้แก้รายการประเภทเองได้) จะได้ไม่ต้องแก้ backend อีก

**`api.js`** — ส่ง `stop_tag: tag || undefined` ตอนบันทึก · อ่านกลับตามลำดับ:

```js
tag: stop.stop_tag || (stop.accommodation ? 'ที่พัก' : 'สถานที่หลัก'),
```

ข้อมูลเก่าที่ยังไม่มี `stop_tag` จึงยังเดาจาก `accommodation` ได้เหมือนเดิม
ไม่มีจุดแวะไหนกลายเป็นช่องว่าง · `accommodation` ยังถูกส่งต่อไปด้วย เพราะทั้งฐาน
และหน้าอื่นยังใช้ช่องนั้นบอก "ที่พัก" อยู่

**`backend/test/unified-trip-write.test.mjs`** — schema จำลองเพิ่ม `stop_tag TEXT`
(ลอกให้ตรงกับ production หลัง ALTER) และเพิ่มหัวข้อ **"ประเภทของจุดแวะ"** 5 เคส

## เทส

`session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 592 = **728**`
· `check-frontend.mjs` และ `check-frontend-runtime.mjs` ผ่านทั้งคู่
(เพิ่ม 2 เคสฝั่งหน้าเว็บ: ต้องส่ง `stop_tag` ขึ้นไป และต้องอ่าน `stop.stop_tag` กลับมา)

## ไฟล์ที่แก้

`backend/src/unified-trip.js` · `backend/test/unified-trip-write.test.mjs` ·
`api.js` (`?v=52` — บั๊มทั้ง 3 หน้า) · `index.html` · `trips.html` · `join.html` ·
`check-frontend-runtime.mjs`

---

# 🆕 2026-09-07 (รอบเจ็ด) — จัดฟอร์มสถานที่ใหม่ + เจอบั๊ก "ประเภท" ว่างเปล่า

North: *"หน้าแก้ไข ตามรูป จัดหน้าจอใหม่ให้สวยงาม กระชับ ใช้กับมือถือสะดวกด้วย ·
ประเภท สามารถแก้ไขเพิ่มเติมได้จากส่วนไหน"*

## 1) โครงฟอร์มใหม่

เดิม 12 แถวน้ำหนักเท่ากันหมด เรียงลงมายาวจนต้องเลื่อนหาปุ่มบันทึก

โครงใหม่ = **หัวติดบน · เนื้อหาเลื่อนในตัวเอง · ปุ่มบันทึกติดล่างเสมอ**

```
.plan-editor  flex column
├ .pe-head    หัวเรื่อง + ปุ่มปิด        (อยู่กับที่)
├ .pe-body    ช่องกรอกทั้งหมด           (overflow:auto)
└ .pe-foot    ข้อความ error + ปุ่ม      (อยู่กับที่)
```

| เปลี่ยน | เหตุผล |
|---|---|
| `เวลา` + `เวลาสิ้นสุด` → บรรทัดเดียว `[09:00] → [10:00]` | สองช่องนี้อ่านคู่กันเสมอ แยกคนละแถวทำให้ต้องกวาดตาสองรอบ |
| `เวลาเปิด` + `เวลาปิด` → บรรทัดเดียวเหมือนกัน | เหตุผลเดียวกัน · ประหยัดไป 2 แถว |
| `วันที่` + `ประเภท` อยู่แถวเดียวกัน | ทั้งคู่เป็น select สั้น ๆ |
| หัวข้อคั่น `.pe-divider` 2 อัน | บอกเป็นกลุ่มว่า "เวลาทำการ" กับ "รายละเอียดเพิ่มเติม" ไม่กรอกก็ได้ — ดีกว่าเขียน "(ไม่บังคับ)" ต่อท้ายทุกช่อง |
| มือถือ: เต็มจอ ไม่มีขอบ ไม่มีมุมโค้ง | กล่องลอยที่สูงเกือบเต็มจออยู่แล้ว เสียพื้นที่ขอบฟรี ๆ · ปุ่มบันทึกอยู่ล่างจอ ระยะนิ้วโป้งพอดี |

⚠️ **มือถือต้องใช้ `#planEditor.plan-editor` (id)** — `themes.css` โหลดทีหลังและมี
`.dialog{border:4px solid…;border-radius:28px}` น้ำหนักเท่ากัน ถ้าใช้แค่ class
แผ่นเต็มจอจะยังมีกรอบหนากับมุมโค้งค้างอยู่

## 2) 🔴 บั๊ก: ช่อง "ประเภท" ว่างเปล่าทุกครั้งที่เปิดแก้ไขของเดิม

ในภาพที่ North ส่งมา ช่องประเภทว่าง ทั้งที่เป็นสถานที่ที่บันทึกไว้แล้ว

ต้นเหตุ: `api.js` ส่งค่ามาว่า **`'สถานที่'`** แต่ตัวเลือกในฟอร์มเขียนว่า
**`'สถานที่หลัก'`** · การเซ็ต `select.value` ด้วยค่าที่ไม่ตรง option ไหนเลย
ไม่ throw อะไร มันแค่กลายเป็นช่องว่าง — **ตายเงียบสนิท**

แก้สองชั้น:
1. `api.js` ส่ง `'สถานที่หลัก'` ให้ตรงลิสต์
2. `openPlanEditor()` ตรวจว่าค่าที่จะเซ็ตมีใน options จริงไหม ไม่มีก็ถอยไป
   `'สถานที่หลัก'` — กันข้อมูลเก่าจากรุ่นไหนก็ได้ ไม่ใช่แก้แค่ที่ต้นทาง

## ⏸️ เรื่องที่ยังไม่ได้ทำ — ประเภทยังไม่ถูกบันทึกจริง

North ถามว่า *"ประเภท แก้ไขเพิ่มเติมได้จากส่วนไหน"* คำตอบตอนนี้คือ **ไม่ได้เลย**

- ตัวเลือกทั้ง 5 (สถานที่หลัก · กิจกรรมย่อย · การเดินทาง · อาหาร · ที่พัก)
  เป็น `<option>` ที่**เขียนตายตัวใน `index.html`**
- แย่กว่านั้น: **`TripStops` ไม่มีคอลัมน์เก็บประเภท** · `saveStop()` แปลงเป็น
  `accommodation` เฉพาะตอนเลือก "ที่พัก" เท่านั้น ที่เหลือถูกทิ้งหมด
  → เลือก "อาหาร" แล้วกดบันทึก เปิดกลับมาจะกลายเป็น "สถานที่หลัก"

ทางเลือกที่เสนอ North ไว้ (ยังไม่ได้ตัดสิน):
- **ก.** เพิ่มคอลัมน์ `stop_tag TEXT` ใน `TripStops` → ประเภทถูกบันทึกจริง
  (ต้องรัน `ALTER TABLE` หนึ่งคำสั่ง)
- **ข.** ก. + ให้แก้รายการประเภทเองได้ในตั้งค่าทริป (เหมือน `TripPresets`)
- **ค.** ไม่ต้องเก็บ ใช้เป็นแค่ป้ายชั่วคราวบนจอเหมือนตอนนี้

## เทส

`check-frontend-runtime.mjs` เพิ่มหัวข้อ **"ฟอร์มสถานที่: โครงใหม่"** 8 เคส
รวมเคสที่ยิงค่าประเภทประหลาดเข้าไปแล้วดูว่า select ยังไม่ว่าง

ครบชุด: `session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 587 = 723`
· ตรวจของจริงด้วย Chromium ที่ 1280 / 414 px

## ไฟล์ที่แก้

`index.html` (โครงฟอร์ม) · `style.css` (`?v=166`) · `app.js` (`?v=135`) ·
`api.js` (`?v=51` — บั๊มทั้ง 3 หน้า) · `check-frontend-runtime.mjs`

---

# 🆕 2026-09-07 (รอบหก) — ช่องเวลาให้กระชับ + เวลาเปิดปิดมีค่าตั้งต้น

North ส่งภาพฟอร์มเพิ่มสถานที่มา: *"เวลา ทั้ง 4 จุดให้กระชับกว่านี้ ชม. นาที
รวมอยู่ด้วยกันเลือกเลื่อนได้ ชม. หรือ นาที · เวลาเปิด ปิด default เปิด 9.00 ปิด 18.00"*

## 1) ช่องเวลาบานเป็นสองกล่อง — เป็นบั๊ก CSS ไม่ใช่ดีไซน์

`.time-picker` ออกแบบไว้ตั้งแต่ 2026-08-22 ให้เป็น **กรอบเดียว** มี `select`
โปร่งใสไร้ขอบสองตัวข้างใน (ชม. / นาที) และมีลูกศรอันเดียวท้ายกรอบ

แต่บนจอจริงมันกลายเป็นสองกล่องใหญ่ มีลูกศรของตัวเองคนละอัน **บวกลูกศรของกรอบ
นอกอีกอันเป็นสาม** เพราะโดนกฎอื่นทับสองชั้น:

| กฎที่ทับ | น้ำหนัก | ทำอะไร |
|---|---|---|
| `.time-picker select` (บรรทัด ~1169) | 0,1,1 | ตั้งใจให้ไร้ขอบ — **แพ้** |
| `.dialog select` (บรรทัด ~1974) | 0,1,1 | เท่ากันแต่อยู่ทีหลัง → ชนะ · ใส่ขอบ + ลูกศร + padding 36px |
| `#planEditor select` (บรรทัด ~1080) | **1,0,1** | เป็น id → ชนะทุก class ไม่ว่ากี่ตัว |

🔴 **บทเรียน: กฎที่ "เขียนถูกแล้ว" ยังแพ้ได้ด้วยลำดับและ id** — เวลาแก้ CSS
ในไฟล์ที่ยาวขนาดนี้ ต้องไล่ดูว่ามีกฎ id หรือกฎที่อยู่ท้ายกว่าครอบอยู่ไหม
ห้ามแก้ด้วย `!important` (กติกาที่เขียนไว้ท้ายไฟล์แล้ว) ให้เจาะจงให้ชนะแทน:

```css
#planEditor .time-picker select,      /* 1,1,1 — ชนะ #planEditor select */
.dialog .time-picker select,
.bottom-sheet .time-picker select,
.screen .time-picker select{ border:0;background-image:none;… }
```

พร้อมกันนั้นย่อกรอบให้พอดีตัว (`width:max-content;min-width:126px`) จากเดิม
`width:100%` ที่กินเต็มคอลัมน์ทั้งที่ข้างในมีแค่ `09 : 00`

**ผลลัพธ์:** `[ 09 : 00 ⌄ ]` กรอบเดียว กว้างประมาณ 1 ใน 3 ของเดิม ·
กดที่เลข ชม. เลื่อนเลือกชั่วโมง · กดที่เลขนาทีเลื่อนเลือกนาที (ทีละ 5 นาที)

## 2) เวลาเปิด–ปิด มีค่าตั้งต้น 09:00 / 18:00

`openPlanEditor()` เดิมเว้นว่างไว้ทั้งคู่ · ตอนนี้ใส่ให้ **เฉพาะตอนเพิ่มสถานที่ใหม่**

```js
const brandNew = !activity;
setTimeValue('activityOpen',  activity?.openTime  || (brandNew ? '09:00' : ''));
setTimeValue('activityClose', activity?.closeTime || (brandNew ? '18:00' : ''));
```

🔴 **ห้ามยัดค่าตั้งต้นตอนแก้ของเดิม** — ถ้าเจ้าของตั้งใจเว้นเวลาเปิดปิดไว้
(หรือเคยลบทิ้ง) แล้วเราเติมให้ทุกครั้งที่เปิดฟอร์ม แค่เปิดมาดูแล้วกดบันทึก
ก็เขียนเวลาที่เขาไม่ได้ตั้งลงฐานไปเลย · มีเทสล็อกไว้แล้ว

## เทส

`check-frontend-runtime.mjs` เพิ่มหัวข้อ **"ช่องเวลา: กระชับ + มีค่าตั้งต้น"** 6 เคส
รวมเคสที่อ่าน `style.css` ตรง ๆ ว่ายังมี `#planEditor .time-picker select` อยู่ไหม
— เพราะ jsdom ไม่โหลด CSS จึงจับบั๊กหน้าตาแบบนี้เองไม่ได้

ตรวจของจริงด้วย Chromium ที่ 1280 / 414 px: ช่องเวลาเป็นกรอบเดียวมีลูกศรเดียว
ทั้งสี่จุด · เวลาเปิดปิดขึ้น 09:00 / 18:00 ให้เอง

ครบชุด: `session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 587 = 723`
· `check-frontend.mjs` และ `check-frontend-runtime.mjs` ผ่านทั้งคู่

## ไฟล์ที่แก้

`app.js` (`?v=134`) · `style.css` (`?v=165` — บั๊มทั้ง index/trips/join) ·
`index.html` · `check-frontend-runtime.mjs`

---

# 🆕 2026-09-07 (รอบห้า) — แถบวันเลื่อนซ้ายขวาได้

North ส่งภาพหน้าจอมาพร้อมคำว่า *"ให้วันที่เลื่อนไปมาได้ด้วย · หมายถึงส่วนนี้"*
— ชี้ที่ **แถบการ์ดวัน** บนหัวหน้าแผนเที่ยว

## อาการ

ทริป Hokkaido มี 11 วัน แถบวันจึงยาวเกินจอเสมอ · ในภาพที่ North ส่งมา การ์ด
"Day 06" โดนตัดครึ่งค้างอยู่ริมซ้าย และ**ไม่มีอะไรบนจอบอกว่าเลื่อนได้**

ต้นเหตุ: `#screen-plan .day-tabs` ตั้ง `scrollbar-width:none` ไว้ตั้งแต่ต้น
(สกรอลบาร์แนวนอนหน้าตาไม่เข้ากับธีม) — แถบเลื่อนได้จริงมาตลอด แต่ไม่มีสัญญาณ
ใด ๆ บอก บนเดสก์ท็อปที่ไม่มีนิ้วให้ปัด จึงเท่ากับเลื่อนไม่ได้

🔴 **บทเรียนซ้ำรอบสาม: ของที่ทำได้แต่ไม่มีอะไรบอกว่าทำได้ = ทำไม่ได้**

## ที่แก้ — เปิดทางไว้ครบทุกแบบที่คนจะลอง

`index.html` ครอบ `#planDayTabs` ด้วย `.day-strip` แล้วใส่ปุ่มลูกศรสองข้าง:

```html
<div class="day-strip" id="planDayStrip">
  <button class="day-scroll prev" id="dayScrollPrev">‹</button>
  <div class="day-tabs" id="planDayTabs"></div>
  <button class="day-scroll next" id="dayScrollNext">›</button>
</div>
```

| ทาง | ทำงานเมื่อไร |
|---|---|
| ปุ่ม ‹ › | เดสก์ท็อป · เลื่อนทีละ 80% ของความกว้างจอ (เหลือการ์ดเดิมค้างไว้ให้รู้ว่ามาจากไหน) |
| ลากด้วยเมาส์ | เฉพาะ `pointerType === 'mouse'` — นิ้วปัดได้เองอยู่แล้ว ดักด้วยจะไปสู้กับระบบ |
| หมุนล้อเมาส์ | แนวตั้ง → เลื่อนแนวนอน · **สุดทางแล้วปล่อยให้หน้าเลื่อนลงตามปกติ** ไม่งั้นเมาส์ค้างอยู่ตรงนี้แล้วเลื่อนหน้าไม่ลงเลย |
| ปัดนิ้ว | มือถือ (ของเดิม) — ปุ่มลูกศรถูกซ่อนด้วย CSS ที่ ≤640px เพราะมีแต่บังการ์ด |

**สัญญาณบนจอ** — `updateDayStrip()` ใส่คลาส `can-prev` / `can-next` ให้ `.day-strip`
ตามตำแหน่งที่เลื่อนอยู่ · ปุ่มและเงาจางที่ขอบจะโผล่เฉพาะข้างที่ยังมีวันซ่อนอยู่
ทริปสั้น ๆ ที่แถบไม่ล้นจอจึงไม่มีลูกศรลอยมาบังการ์ด

🔴 **จุดที่พังง่ายที่สุด: ลากแล้วปล่อยมือตรงการ์ดวันไหน = กดเลือกวันนั้น**
แก้ด้วยการกลืน `click` ทิ้งหนึ่งครั้งหลังลากจริง (ขยับเกิน 6px) ผ่าน listener
แบบ capture บนแถบ · และล้างธงทุกครั้งที่ `pointerdown` ไม่งั้นจะไปกลืนการกด
ครั้งถัดไปที่ไม่เกี่ยวกัน = แถบวันกดไม่ได้ทั้งแถบ
ระหว่างลากยังปิด `pointer-events` ของลูก ๆ ด้วย (`.day-tabs.dragging>*`)

## เทส

`check-frontend-runtime.mjs` เพิ่มหัวข้อ **"แถบวันเลื่อนซ้ายขวาได้"** 9 เคส
ครอบคลุมทั้งสี่สถานะของปุ่ม (ซ้ายสุด / กลาง / ขวาสุด / แถบไม่ล้นจอ)
และสองเคสสำคัญ: ลากแล้วต้องไม่เปลี่ยนวัน · กดเฉย ๆ ต้องยังเปลี่ยนวันได้

⚠️ jsdom ไม่มี layout (`scrollWidth`/`clientWidth` = 0 เสมอ) และไม่มี `PointerEvent`
เทสจึงป้อนขนาดปลอมด้วย `Object.defineProperty` แล้วเรียก `updateDayStrip()` ตรง ๆ
และสร้าง `MouseEvent` แล้วแปะ `pointerType` เอง

ตรวจของจริงด้วย Chromium (Playwright) ที่ 1280 / 900 / 414 px:
เลื่อนได้จริง · ปุ่มโผล่/หายถูกข้าง · มือถือไม่มีปุ่มโผล่มาบัง

ครบชุด: `session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 587 = 723`
· `check-frontend.mjs` และ `check-frontend-runtime.mjs` ผ่านทั้งคู่

## ไฟล์ที่แก้

`app.js` (`?v=133`) · `style.css` (`?v=164` — ต้องบั๊มทั้ง index/trips/join) ·
`index.html` · `check-frontend-runtime.mjs`

---

# 🆕 2026-09-07 (รอบสี่) — บันทึกแล้วต้องอยู่วันเดิม ไม่เด้งกลับวันแรก

North: *"ตอนนี้หากมีการแก้ไข ระบบชอบกลับไปตรงวันที่แรก ให้ยังอยู่ส่วนเดิมสิ"*

## ต้นเหตุ — บรรทัดเดียวใน `applyLiveState()`

ทุกการบันทึกในโหมดข้อมูลจริงจบด้วยเส้นทางเดียวกันเสมอ:

```
submitLive() → refreshFromServer() → applyLiveState(ของจริงชุดใหม่)
```

และใน `applyLiveState()` มีบรรทัด `activePlanDayId = planDays[0].id` เขียนไว้ตายตัว
ผลคือ **ไม่ว่าจะแก้อะไร** (เพิ่มสถานที่ · แก้ชื่อวัน · ย้ายลำดับ · จดบิล) จอแผนเที่ยว
จะเด้งกลับวันแรกทุกครั้ง ต้องเลื่อนแท็บวันกลับมาเองใหม่ทุกรอบ

อาการเดียวกันเกิดที่ **แถบสรุปใต้แบนเนอร์** ด้วย — `buildLiveJourney()` ตั้ง
`previewJourneyIndex = actualJourneyIndex` (= "วันนี้") ทุกครั้ง แล้ว `applyLiveState`
ยังสั่ง `renderJourneyPreview(actualJourneyIndex)` ทับซ้ำอีกชั้น

## ที่แก้

**`app.js`** — เพิ่มตัวจำวันไว้ข้าง ๆ `activePlanDayId`:

```js
let planFocusDate = '';
const focusPlanDate   = date => { planFocusDate = String(date || ''); };
const takePlanFocusDate = () => { const d = planFocusDate; planFocusDate = ''; return d; };
function pickPlanDayId(wantedDate) { /* ตรงตัว → ใกล้ที่สุด → วันแรก */ }
```

`applyLiveState()` เปลี่ยนเป็น:

```js
const stayDate = takePlanFocusDate() || planDays.find(d => d.id === activePlanDayId)?.date || '';
planDays.length = 0; planDays.push(...state.planDays);
activePlanDayId = pickPlanDayId(stayDate);
```

**ทำไมต้องมี "ตัวใบ้" (`focusPlanDate`) ไม่ใช่แค่จำ id เดิม** — id ของวันคือ
`stop-day-<วันที่>` ซึ่ง**เปลี่ยนตามวันที่** สองกรณีที่ id เดิมหายไปจากชุดใหม่:

| กรณี | ต้องไปไหน | ใครตั้งตัวใบ้ |
|---|---|---|
| ย้ายวัน 19 → 25 ธ.ค. | วันที่ 25 (ไม่ใช่วันแรก) | `#dayForm` submit → `focusPlanDate(date)` |
| เพิ่มสถานที่ลงวันอื่นจากในฟอร์ม | วันของสถานที่นั้น | `savePlanItemLive()` → `focusPlanDate(targetDay?.date)` |
| ลบวันที่กำลังดูอยู่ | วันที่ใกล้ที่สุดที่ยังเหลือ | ไม่ต้องใบ้ — `pickPlanDayId` หาเอง |

ตัวใบ้ **ใช้ครั้งเดียวแล้วล้างทิ้ง** (`takePlanFocusDate`) ถ้าปล่อยค้าง มันจะไปลากจอ
กลับวันเดิมตอน refresh รอบถัดไปที่ไม่เกี่ยวกันเลย

**แถบสรุปใต้แบนเนอร์** — `buildLiveJourney()` จำ `dayId` ที่กำลังเปิดดูไว้ก่อนสร้าง
`journeyStops` ชุดใหม่ ถ้ายังมีอยู่ก็กลับไปช่องนั้น ไม่งั้นค่อยตกไปเป็น "วันนี้"
และ `applyLiveState` เรียก `renderJourneyPreview(previewJourneyIndex)` แทนของเดิม

## ที่ยังคงเดิมโดยตั้งใจ

- **ย้ายสถานที่ข้ามวัน** → อยู่วันต้นทางต่อ ไม่ตามไปวันปลายทาง — เพื่อให้ย้ายหลายจุด
  ติด ๆ กันได้ · toast บอกอยู่แล้วว่าของไปอยู่วันไหน
- **เปิดทริปครั้งแรก** → ยังเริ่มที่วันแรกเหมือนเดิม (ไม่มีวันเดิมให้จำ)
- `activeWalletId` ไม่มีปัญหานี้ — `renderWallets()` ล้างให้เฉพาะตอนกระเป๋านั้นหายไปจริง
- `selectedActivityId` และหน้าจอที่เปิดอยู่ ไม่เคยถูก `applyLiveState` แตะ

## เทส

`check-frontend-runtime.mjs` เพิ่มหัวข้อ **"บันทึกแล้วต้องอยู่วันเดิม"** 8 เคส
รวมเคสที่ล็อกไว้ตรง ๆ ว่า `activePlanDayId = planDays[0].id` **ห้ามกลับมา**

พิสูจน์ด้วย jsdom เรียก `applyLiveState()` ซ้ำจริง ๆ (เหมือนหลังกดบันทึก):

```
เปิดทริปครั้งแรก      → stop-day-2026-12-17   ✅ วันแรก
อยู่วันที่ 20 แล้วบันทึก → stop-day-2026-12-20   ✅ อยู่ที่เดิม (เดิมเด้งไป 17)
ย้าย 20 → 25          → stop-day-2026-12-25   ✅ ตามไปวันใหม่
ลบวันที่ 21 ทิ้ง        → stop-day-2026-12-19   ✅ วันใกล้สุด ไม่ใช่วันแรก
```

ครบชุด: `session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 587 = 723`
· `check-frontend.mjs` และ `check-frontend-runtime.mjs` ผ่านทั้งคู่

## ไฟล์ที่แก้

`frontend/trip-unified-prototype/app.js` (`?v=132`) · `index.html` · `check-frontend-runtime.mjs`

---

# 🆕 2026-09-07 (รอบสาม) — ย้ายสถานที่ข้ามวันให้หาเจอ + ป้ายวันบอกวันที่จริง

## ย้ายสถานที่ไปวันอื่น — **มีอยู่แล้ว แต่หาไม่เจอ**

North: *"ให้เลื่อนสถานที่ไปยัง day อื่นได้"*

ตรวจแล้ว **ความสามารถนี้ทำงานได้ถูกต้องมาตลอด** (ทดสอบใน jsdom โหมดข้อมูลจริง:
เลือกการ์ด → กดวันปลายทาง → ยิง `POST /stops/order` พร้อม `stop_date` ใหม่ ถูกต้องครบ)

**ปัญหาคือหาไม่เจอ** — ต้องเลื่อนลงไปท้ายหน้าถึงจะเห็นแถบ `#crossDayMove`
และต้องแตะการ์ดเพื่อ "เลือก" ก่อนปุ่มถึงจะกดได้ · สองจังหวะที่ไม่มีอะไรบนการ์ดบอกใบ้เลย

🔴 **บทเรียน: ปุ่มที่มีอยู่แต่หาไม่เจอ เท่ากับไม่มี** — อย่ารีบสรุปว่า "ทำไม่ได้"
ให้ทำซ้ำอาการก่อนเสมอ ของที่ผู้ใช้บอกว่าไม่มี อาจแค่อยู่ในที่ที่ไม่มีใครมอง

**แก้:** เพิ่มปุ่ม 📅 ลงในแถวปุ่มบนการ์ดสถานที่ (ข้าง ✏️ 🚫 ▲ ▼ 🗑️)
กดแล้วเลือกสถานที่นั้นให้เอง + เลื่อนจอไปที่แถบเลือกวันปลายทาง + ไฮไลต์แถบให้เห็น
**ใช้กลไกเดิมทั้งหมด ไม่เพิ่มสถานะใหม่** — แก้แค่เรื่อง "หาเจอ" · ทริปที่มีวันเดียวปุ่มถูก disable

## ป้ายวันต้องบอก "วันที่" ไม่ใช่ Day 01

North: *"ให้วันที่แก้ไข หรือวันที่เพิ่มสถานที่ ให้ระบุด้วยว่าเป็นวันที่เท่าไร แทน Day 1 Day 2"*

`Day 03` ลอย ๆ ไม่ได้บอกว่าคือวันไหนของจริง คนต้องเลื่อนไปเทียบกับแท็บวันเอง

เพิ่ม helper `dayOptionLabel(day)` — **วันที่จริงมาก่อน เลข Day เป็นตัวรอง**
(`18 ธ.ค. 2026 · Day 02 · Hakodate`) ใช้ที่:

- ช่องเลือกวันในฟอร์มเพิ่ม/แก้สถานที่ (`#activityDay`)
- ปุ่มวันปลายทางของการย้ายข้ามวัน (`#moveDayTargets`)
- หัวเรื่องฟอร์ม "เพิ่มสถานที่ใน …" และปุ่มท้ายรายการ `#addPlaceFoot`

🔴 **ทุกที่ที่ให้เลือกหรือบอก "วัน" ต้องมีวันที่จริงกำกับ** — มีเทสคุมไว้แล้ว

**ผลตรวจ**: 723 เคส ผ่านหมด · `check-frontend.mjs` ✅ · `check-frontend-runtime.mjs` ✅
(เพิ่มหัวข้อ "ย้ายข้ามวัน · ป้ายวันบอกวันที่" 5 เคส)


---

# 🆕 2026-09-07 (รอบสอง) — "วัน" มีตัวตนของตัวเองแล้ว · เพิ่ม/แก้/ลบวันได้

North: *"เพิ่มวัน เพิ่มสถานที่ ต่างกันอย่างไร · ถ้าเพิ่มวันเฉย ๆ ให้ลบการตั้งค่า
ในส่วนอื่นออก และมีให้ลบ หรือแก้ไขวันด้วย"*

**คำตอบตอนนั้นคือ: ไม่ต่างกันเลย** — สองปุ่มเปิดฟอร์มเดียวกันเป๊ะ

```js
$('#addPlace').addEventListener('click',   () => openPlanEditor());
$('#addPlanDay').addEventListener('click', () => openPlanEditor(null, nextPlanDate()));
```

ต่างกันแค่ตั้งช่อง "วัน" ให้ล่วงหน้า · ที่เหลือคือฟอร์มเพิ่มสถานที่ทั้งดุ้น
(ชื่อสถานที่ เวลา งบ mapcode เวลาเปิด-ปิด วันหยุด) ทั้งที่คนแค่อยากเพิ่มวัน

## 🔴 ต้นเหตุ: "วัน" ไม่เคยมีตัวตนในฐานข้อมูล

เดิม `planDays` สร้างจาก `TripStops.stop_date` ล้วน ๆ · `TripDayPlans` ให้ได้แค่
"ชื่อวัน" ของวันที่มีจุดแวะอยู่แล้ว → **วันที่ไม่มีสถานที่ = ไม่มีอยู่จริง**
จึงเพิ่มวันเปล่าไม่ได้ · แก้วันไม่ได้ · ลบวันไม่ได้ และปุ่มเพิ่มวันต้องยืมฟอร์มสถานที่มาใช้

## สิ่งที่เปลี่ยน

🔴 **`TripDayPlans` เปลี่ยนความหมาย** จาก "ที่เก็บชื่อวัน" → **"ทะเบียนวันของทริป"**
มีแถว = วันนั้นมีอยู่จริง แม้ยังไม่มีสถานที่ · ชื่อวันกลายเป็นช่องเสริม (ว่างได้)

⚠️ **ห้ามกลับไปลบแถวเมื่อชื่อว่างอีก** — เดิม `writeDayPlan` ทำแบบนั้น
ผลคือคนล้างชื่อวันแล้ว **วันหายไปทั้งวัน** ซึ่งเป็นของหายโดยไม่มีใครสั่งลบ

| | เดิม | ตอนนี้ |
|---|---|---|
| ปุ่ม **เพิ่มวัน** | ฟอร์มเพิ่มสถานที่เต็ม ๆ | `#dayDialog` — **สองช่องเท่านั้น: วันที่ + ชื่อวัน** |
| วันเปล่า | สร้างไม่ได้ | สร้างและค้างไว้ได้ รอเติมสถานที่ทีหลัง |
| **แก้ไขวัน** | ไม่มี | ปุ่ม ✏️ บนแท็บวัน — แก้วันที่/ชื่อวัน |
| **ลบวัน** | ไม่มี | ปุ่มลบในฟอร์มวัน |

### 🔴 กติกาที่ต้องไม่ถูกถอดออกภายหลัง

1. **ลบวันที่ยังมีสถานที่อยู่ไม่ได้** → 409 พร้อมบอกจำนวน (North เลือกเอง)
   กติกาเดียวกับ "กระเป๋าที่มีบิลผูกอยู่ ลบไม่ได้" — ของที่ยังมีลูกอยู่
   ต้องให้คนจัดการลูกก่อน ไม่ใช่ลบเป็นทอด ๆ เงียบ ๆ
   หน้าจอบอกตั้งแต่ตอนเปิดฟอร์ม (ปุ่มขึ้นว่า "ลบไม่ได้ · มี N สถานที่") ไม่ใช่รอให้กดแล้วค่อยเจอ

2. **ย้ายวัน = จุดแวะไปด้วยทั้งหมด** (`UPDATE TripStops SET stop_date`)
   ถ้าย้ายแต่ป้ายวัน จุดแวะจะค้างวันเก่าแล้ว **วันเก่าโผล่กลับมาเองโดยไม่มีใครสั่งให้มี**

3. **ย้ายไปชนวันที่มีอยู่แล้วไม่ได้** → 409 · ถ้าปล่อยผ่าน จุดแวะสองวันจะถูกยุบรวมกัน
   เงียบ ๆ แล้วแยกกลับไม่ได้อีกเลย

4. **`#dayDialog` ต้องอยู่ในลิสต์ของ `closeLayers()`** — หน้าต่างที่เปิดได้แต่ปิดไม่ลง
   บนจอดูเหมือนแอปค้าง (มีเทสคุมไว้แล้ว)

### API

- `POST /api/unified-trip/days` — `{ plan_date, title, new_plan_date? }`
  `new_plan_date` มีค่า = ย้ายวัน · คืน `moved_stops` มาบอกจำนวนที่ย้าย
- `DELETE /api/unified-trip/days?date=YYYY-MM-DD` — **ของใหม่** · 409 ถ้ายังมีสถานที่

### เทส

- backend `unified-trip-write` **587 เคส** (เพิ่ม 17): วันเปล่า · ลบวันเปล่า ·
  ลบวันที่มีของ → 409 · ย้ายวันพาจุดแวะไปด้วย · ย้ายชนวันเดิม → 409 · ล้างชื่อแล้ววันไม่หาย
- `check-frontend-runtime.mjs` เพิ่มหัวข้อ **"ฟอร์มของวันแยกจากฟอร์มสถานที่"** 7 เคส
  ล็อกไว้ว่าฟอร์มวันต้องมีแค่สองช่อง และสองปุ่มต้องพาไปคนละที่

**ผลตรวจเต็ม**: `session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 587`
= **723 เคส ผ่านหมด** · `check-frontend.mjs` ✅ · `check-frontend-runtime.mjs` ✅


---

# 📍 สถานะ ณ 2026-09-07 — อ่านก่อนเริ่มงาน

## ✅ deploy แล้ว · สถานะ deploy ก่อนหน้า (รายละเอียดล่าสุดดูหัวข้อบนสุด)

- งานสามรอบของ 23 ส.ค. → deploy 24 ส.ค.
- งานสองรอบของ 3 ก.ย. (รัดกุมสิทธิ์ + แก้ตัวล็อก) → **deploy 4 ก.ย.**
- หลัง 3 ก.ย. มีชุด Enjoy Life Trip/Momo และ feedback Stop/เอกสารเพิ่มเข้ามาแล้ว
  และ deploy ตามลำดับที่บันทึกไว้บนสุด

### ผลตรวจเต็มรูปแบบ (รันกับไฟล์ที่อยู่บนดิสก์จริง)

```
session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 569   = 705 เคส ผ่านหมด
node check-frontend.mjs          ✅ ผ่านทั้งหมด
node check-frontend-runtime.mjs  ✅ ผ่านทั้งหมด (รวมหัวข้อ "ตัวล็อกสิทธิ์" 10 เคสใหม่)
```

เลขเวอร์ชันปัจจุบัน: `style.css?v=161` `themes.css?v=18` `api.js?v=49` `app.js?v=129`
(ตรงกันครบทั้ง 3 หน้า)

## 🔴 ยังไม่ได้ commit git — 16 ไฟล์ (รวม asset ใหม่) ตั้งแต่ `fc61075`

```
HANDOFF.md
check-frontend-runtime.mjs
backend/src/unified-trip.js
backend/test/unified-trip-write.test.mjs
frontend/trip-unified-prototype/{api.js, app.js, index.html, join.html,
                                 live-mode.test.mjs, style.css, trips.html}
```

ของทั้งหมดอยู่บน Google Drive ที่เดียว ไม่มีประวัติให้ย้อนถ้าแก้ผิดทับ
⚠️ ช่วงนี้มี **มากกว่าหนึ่ง chat** แก้ไฟล์ชุดเดียวกัน (พบเมื่อ 3 ก.ย. ว่าไฟล์บนดิสก์
ต่างจากที่ session ก่อนหน้าทิ้งไว้) — ยิ่งไม่มีประวัติยิ่งเสี่ยง
🔴 **ก่อนแก้อะไร ให้ตรวจก่อนเสมอว่าไฟล์บนดิสก์ยังตรงกับที่ตัวเองจำไว้ไหม**
อย่าเขียนทับด้วยสำเนาเก่าที่ถืออยู่

## ✅ คำถาม "ทำไมผู้ดูแลแก้ไม่ได้" — ปิดจบแล้ว (ดูหัวข้อ 3 ก.ย. รอบสอง)

North ยืนยันอาการ: ในทริป Hokkaido 2026 กดเพิ่มจุดท่องเที่ยวแล้วขึ้นว่า
*"ผู้ร่วมทริปทำรายการนี้ไม่ได้"* → **เข้าทริปด้วยรหัสจากลิงก์ ไม่ใช่ล็อกอินบัญชีครอบครัว**
ไม่เกี่ยวกับเรื่องผู้ดูแลครอบครัว/สมาชิกทริปที่เขียนไว้ข้างล่างนี้เลย

### 🔴 "ผู้ดูแล" มีสองแบบ และคนละสิทธิ์กัน — ต้นเหตุของความสับสนนี้

| | เก็บที่ไหน | ทำอะไรได้ |
|---|---|---|
| **ผู้ดูแลทริป** | `TripMembers.is_admin` ของ*ทริปนั้น* | ทุกอย่างในทริปนั้น — กระเป๋า บิล สมาชิก ปิดทริป |
| **ผู้ดูแลระบบครอบครัว** | `Users.role='admin'` | แก้ชื่อ/วันที่/ธีม + ลบทริป เท่านั้น · **แตะเงินไม่ได้เลย** |

ด่านเกือบทุกอันเช็ค `ctx.viewer?.is_admin` อย่างเดียว มีแค่ 3 จุดที่ยอม `ctx.familyAdmin` ด้วย
(บรรทัด 317 · 1050 · 1469 = แก้ข้อมูลทริป/ลบทริป) · `canActFor()` **ไม่ดู familyAdmin เลย**

🔴 คนที่ไม่ได้เป็นสมาชิกของทริปนั้น → `ctx.viewer` เป็น undefined → 403 แทบทุกอย่าง
แม้จะเป็นผู้ดูแลระบบครอบครัวก็ตาม

**หลักฐานจากฐานจริง (23 ส.ค.)**: ทริป "สวิตเซอร์แลนด์" มีสมาชิกแค่ Puii คนเดียว
**ไม่มีแถวของ North เลย** → ถ้าที่ North ลองแก้คือทริปนั้น นี่คือคำตอบ

### ทางแก้ที่เสนอไว้ (รอ North เลือก)

- **ก.** เพิ่ม North เป็นสมาชิก+ผู้ดูแลของทริปนั้น — **ไม่ต้องแก้โค้ด** ใช้ได้ทันที
- **ข.** ให้ผู้ดูแลระบบครอบครัวมีสิทธิ์เท่าผู้ดูแลทริปทุกทริปอัตโนมัติ —
  ต้องแก้ราว 10 จุดที่เช็ค `ctx.viewer?.is_admin` อย่างเดียว

⚠️ ถ้าคำตอบคือทริปที่ North เป็นผู้ดูแลอยู่แล้ว (เช่น Hokkaido) แปลว่ามีบั๊กตัวอื่น
คนละเรื่องกับที่อธิบายไว้ข้างบนทั้งหมด — อย่าเพิ่งแก้ตามนี้

## เรื่องอื่นที่เสนอไว้แล้วยังไม่ได้ทำ (ไม่ใช่บั๊ก — รอ North ตัดสิน)

1. **บิลที่ตั้งเป็น PRIVATE ผู้ดูแลยังมองไม่เห็น** — `canSee()` ไม่มีข้อยกเว้นให้ admin
   ตั้งใจไม่แตะ เพราะคนที่กดตั้งเป็นส่วนตัวคาดหวังว่ามันเป็นส่วนตัวจริง
   ถ้าจะเปลี่ยน **ต้องแก้ข้อความบนฟอร์มบิลพร้อมกัน** ไม่งั้นคือผิดสัญญาที่หน้าจอให้ไว้

2. ~~`listFamilyAccounts()` หลวมสองข้อ~~ → **แก้แล้วในรอบ 3 ก.ย.** (ดูหัวข้อถัดไป)

3. **ตัวเลขในหน้าปิดทริป/หน้าสรุปการหารเงินยังไม่มีทศนิยม** — ใช้ `fmtAmount()`
   ซึ่งใช้กับ *จำนวนบิล/จำนวนวัน* ด้วย ("3.00 บิล" ผิดความหมาย) ถ้าจะให้ยอดเงินตรงนั้น
   มีทศนิยม ต้องแยกตัวจัดรูปของ "เงิน" ออกจาก "จำนวนนับ" ก่อน


---

# 🆕 2026-09-03 (รอบสอง) — ผู้ดูแลที่เข้าทางลิงก์+รหัส แก้อะไรไม่ได้

**อาการ**: North เป็นผู้ดูแลทริป Hokkaido 2026 แต่กดเพิ่มจุดท่องเที่ยวแล้วขึ้น
*"ผู้ร่วมทริปทำรายการนี้ไม่ได้ · ต้องให้ผู้ดูแลทริปเป็นคนทำ"*

**ทำซ้ำได้แล้วในเบราว์เซอร์จำลอง** (`repro-live.mjs` / `repro-guest.mjs` — ไม่ได้ commit
เป็นสคริปต์ชั่วคราว แต่ตรรกะถูกย้ายไปอยู่ใน `check-frontend-runtime.mjs` ถาวรแล้ว)

## 🔴 สาเหตุที่ 1 — เข้าทางลิงก์+รหัส = ถูกลดสิทธิ์เสมอ แม้เป็นผู้ดูแล

เซิร์ฟเวอร์บังคับ `is_admin = 0` โดยตั้งใจเมื่อเข้ามาด้วย token ผู้ร่วมทริป
(*"สิทธิ์ผู้ดูแลต้องมาพร้อมการยืนยันตัวตนที่แข็งแรงกว่านี้"*) แล้ว allow-list
ปล่อยผ่านแค่ `/expenses` กับ `/presence` → เพิ่มจุดแวะ แก้แผน จัดการสมาชิก ไม่ได้ทั้งหมด

**กติกาเลือกตัวตนใน `authHeaders()`** — session บัญชีครอบครัวมาก่อน · ไม่มีถึงใช้ token
ผู้ร่วมทริป · ⚠️ เครื่องที่เคยใส่รหัสจากลิงก์จะจำ token ไว้ถาวร พอ session ครอบครัว
หมดอายุ **ตัวตนผู้ร่วมทริปจะขึ้นมาแทนเงียบ ๆ**

สามอย่างที่ทำให้หาสาเหตุไม่เจอ (แก้แล้วทั้งหมด):
- `liveIsGuest` ถูกส่งมาและเก็บใส่ตัวแปรแล้ว **แต่ไม่มีใครอ่าน** → จอไม่บอกว่าทำไม
- ปุ่มเพิ่มสถานที่ยังเปิดฟอร์มให้กรอกจนเสร็จ แล้วค่อยไปตายตอนกดบันทึก
- `signOutMember()` มีใน `api.js` มานาน **แต่ไม่มีปุ่มไหนเรียก** — เข้าแล้วออกไม่ได้

## 🔴 สาเหตุที่ 2 — `financeLocked()` เรียกเปล่า ๆ = ล็อกทุกอย่างในโหมดข้อมูลจริง

```js
const locked = financeLocked();                       // ← ลืมใส่ชื่อพื้นที่
document.body.classList.toggle('trip-closed', locked);
```

`LIVE_WRITABLE[undefined]` เป็น undefined → `!undefined` = true → **true เสมอ**
→ `body.trip-closed` ติดค้าง → CSS `body.trip-closed .mobile-fab{pointer-events:none}`
→ **ปุ่ม ＋ ลอยบนมือถือตายสนิทตลอดเวลา** โดยไม่มี error ให้เห็น

🔴 **นี่คือบั๊กชนิดเดียวกับที่ไฟล์นี้เคยจดไว้แล้ว** (`blockedByClose()` ส่ง `'bills'`
ที่จริงคือ `'expenses'`) — ครั้งนั้นพิมพ์ผิด ครั้งนี้ลืมใส่ไปเลย

## สิ่งที่แก้

| | เดิม | ตอนนี้ |
|---|---|---|
| `financeLocked()` ไม่ส่ง area | ล็อกทุกอย่างในโหมดข้อมูลจริง | = "ทริปปิดหรือยัง" เท่านั้น |
| ชื่อ area ที่ไม่รู้จัก | ล็อกเงียบ ๆ | `console.error` + ถอยไปใช้ `tripClosed` |
| ผู้ร่วมทริป | ปุ่มเปิดฟอร์มได้ แล้วเจอ 403 ตอนบันทึก | ปุ่มถูกล็อกพร้อมบอกเหตุผล + `openPlanEditor()` ตรวจซ้ำในตัว |
| จอบอกสถานะ | ไม่บอกเลย | แถบ `#guestNote` ใต้ topbar + ปุ่ม **ออกจากระบบผู้ร่วมทริป** |

- `GUEST_WRITABLE = { expenses: true }` ฝั่งหน้าจอ 🔴 **ต้องตรงกับ `GUEST_WRITABLE`
  ฝั่งเซิร์ฟเวอร์เสมอ** — เปิดกว้างกว่าเมื่อไรคือให้คนกรอกฟอร์มฟรีแล้วโดนปฏิเสธ
- `lockReason(area)` รับพื้นที่แล้ว จะได้ไม่ขึ้น "ทริปนี้ปิดแล้ว" ทั้งที่ทริปยังเปิดอยู่
- `#addPlaceFoot` ถูกล็อกพร้อม `#addPlace` (เดิมล็อกแค่ตัวเดียว)

## เทสที่ล็อกไว้กันเกิดซ้ำ

เพิ่มหัวข้อ **"ตัวล็อกสิทธิ์"** ใน `check-frontend-runtime.mjs` — 10 เคส คุมทั้ง
`financeLocked()` เปล่า ๆ · ชื่อพื้นที่มั่ว · แผนเที่ยวยังแก้ได้หลังปิดทริป ·
สิทธิ์ผู้ร่วมทริปครบทุกพื้นที่ · แถบบอกสถานะ · ปุ่มออกจากระบบ

**ผลตรวจเต็ม**: `session 22 · auth 27 · money 54 · slice-engine 33 · unified-trip-write 569`
= **705 เคส ผ่านหมด** · `check-frontend.mjs` ✅ · `check-frontend-runtime.mjs` ✅

## วิธีแก้เฉพาะหน้าสำหรับผู้ใช้ (ถ้ายังไม่ได้ deploy)

ล็อกอินบัญชีครอบครัวที่ `record-revenue-web.pages.dev` บนเบราว์เซอร์เครื่องนั้นก่อน
แล้วค่อยเปิดทริป — ตัวตนบัญชีครอบครัวจะมาก่อน token ผู้ร่วมทริปทันที


---

# 🆕 2026-09-03 — รัดกุมเรื่องสิทธิ์ (แก้จากอีก session · deploy 4 ก.ย. แล้ว)

งานชุดนี้ **ไม่ได้ทำใน session ที่เขียนหัวข้อ 23 ส.ค.** — พบตอนตรวจโค้ดวันที่ 3 ก.ย.
ว่าไฟล์บนดิสก์ต่างจากที่ session นั้นทิ้งไว้ · เทสผ่านหมด 705 เคส

## 🔴 ผู้ดูแลครอบครัวที่ไม่ได้เป็นสมาชิกทริป — ขอบเขตชัดเจนแล้ว

เพิ่มด่านก่อนเข้าทุก sub-route ใน `handleUnifiedTrip()`:

| สถานะผู้เรียก | ผลลัพธ์ |
|---|---|
| ไม่ใช่สมาชิกทริป และไม่ใช่ผู้ดูแลครอบครัว | **404** — ไม่บอกด้วยซ้ำว่าทริปมีอยู่ |
| ผู้ดูแลครอบครัว แต่ไม่ได้เป็นสมาชิกทริป | `POST`/`DELETE /trip` (แก้ชื่อ-วันที่ · ลบทริป) ได้เท่านั้น<br>เขียนอย่างอื่น → **403** · `GET` sub-route → **403**<br>`GET` ตัวหลัก → payload เปล่าที่มีแต่ชื่อทริป (`phase: 'read-only'`) |
| สมาชิกทริป | เหมือนเดิม |

**นี่คือคำตอบของคำถามที่ North ถามค้างไว้** — ผู้ดูแลครอบครัวเห็นชื่อทริปที่ตัวเอง
ไม่ได้เป็นสมาชิก แต่แตะข้างในไม่ได้เลย มีไว้กู้ "ทริปกำพร้า" ที่ไม่มีสมาชิกผูกบัญชีเท่านั้น

## `meta` บอกสิทธิ์แยกเป็นรายเรื่อง ไม่ใช่ก้อนเดียว

`can_view_trip_data` · `can_manage_trip` · `can_manage_members` · `can_manage_shared_settings`

หน้าจออ่านค่าเหล่านี้แทนการเดาจาก `admin` เอง (`liveCanManageMembers` /
`liveCanManageSharedSettings`) — ปุ่มเพิ่ม-แก้สมาชิก และปุ่มเพิ่ม-แก้สกุลเงิน
ซ่อนตามสิทธิ์จริงจากเซิร์ฟเวอร์ 🔴 **สองฝั่งต้องตรงกันเสมอ** ไม่งั้นได้อาการ
"เห็นปุ่มแต่กดแล้ว 403" ซึ่งผู้ใช้อ่านว่าแอปพัง

## แก้จุดที่เคยรายงานไว้ว่าหลวม

`listFamilyAccounts()` — ช่อง "เงินก้อนนี้ออกจากบัญชีไหน"
- `JOIN UserPermissions` แล้ว → เห็นเฉพาะบัญชีที่ตัวเองมีสิทธิ์ ไม่ใช่ทุกบัญชีในครอบครัว
- ตัดบัญชีพักที่ระบบสร้างเอง (`account_type = 'TRIP_HOLDING'`) ออกจากลิสต์
- ส่ง `account_type` กลับไปด้วย

## อื่น ๆ

- `tripId(prefix)` ใช้ `crypto.randomUUID()` แทน `Date.now()+Math.random()`
  🔴 id ที่เดาได้ = คนอื่นยิง id ถูกแล้วเขียนทับข้อมูลข้ามทริปได้
- **โหมดข้อมูลจริงสลับ "ดูในมุมมองของคนอื่น" ไม่ได้แล้ว** — `viewerId` คือตัวตนที่
  เซิร์ฟเวอร์ยืนยันแล้ว ไม่ใช่ตัวกรองไว้ทดลองดูหน้าจอ (เหลือไว้เฉพาะโหมดตัวอย่าง)


---

# 🆕 2026-08-23 (รอบสี่) — ผู้ดูแลทริปเห็นและแก้กระเป๋าของทุกคนได้

North: *"คนสร้างทริปคือ admin และสามารถอนุญาตให้ใครเป็น admin เพิ่มได้
เพื่อการดูแลและจัดการทริป ถ้าเป็น admin แล้วก็สามารถแก้ไข เปลี่ยนแปลง ลบ เพิ่ม ได้ทั้งหมด"*

## 🔴 บั๊ก: สิทธิ์ฝั่งเขียนถูก แต่ฝั่งอ่านไม่เคยส่งข้อมูลไปให้

`GET /api/unified-trip` กรองกระเป๋าเหลือเฉพาะของผู้ดูเอง **โดยไม่มีข้อยกเว้นให้ใครเลย**
ขณะที่ `canActFor()` อนุญาตให้ผู้ดูแลทริปและ `managed_by` เขียนได้มานานแล้ว

ผลที่เกิดจริง:
- ผู้ดูแลทริปคนที่สองแก้/ลบ/เติมเงินกระเป๋าของคนอื่นไม่ได้ เพราะ **มองไม่เห็น**
- `managed_by` ("ให้คนนี้จดกระเป๋าแทนฉัน") **ใช้ไม่ได้เลย 100%** ด้วยเหตุผลเดียวกัน

**บทเรียน**: ทุกครั้งที่ให้สิทธิ์ฝั่งเขียน ต้องไล่ดูฝั่งอ่านด้วยเสมอว่าส่งของไปให้หรือยัง
สิทธิ์ที่ให้แล้วแต่ไม่มีข้อมูลให้ทำงานด้วย = ไม่มีสิทธิ์ และไม่มี error อะไรฟ้องเลย

## กติกาใหม่ (ฝั่งอ่านกับฝั่งเขียนต้องตรงกันเป๊ะ)

| ผู้ดู | เห็นกระเป๋าใบไหน |
|---|---|
| เจ้าของ | ของตัวเอง |
| **ผู้ดูแลทริป** (`TripMembers.is_admin=1`) | **ทุกใบ** |
| ผู้ดูแลรายคน (`managed_by`) | ของคนที่ตัวเองดูแล |
| สมาชิกธรรมดา | ของตัวเองเท่านั้น (ไม่เปลี่ยน) |

- เซิร์ฟเวอร์: `walletVisible()` ใน `unified-trip.js` (ที่เดิมคือ `.filter(row => ... === viewer?.member_id)`)
- หน้าจอ: `canSeeWallet()` ใน `app.js` — 🔴 **สองตัวนี้ต้องเหมือนกันเสมอ**
  ต่างเมื่อไรจะได้อาการ "เห็นแต่กดไม่ได้" หรือ "กดได้แต่ของไม่โผล่"
- การ์ดกระเป๋าที่ไม่ใช่ของผู้ดูมีป้าย `👤 ชื่อเจ้าของ` — ผู้ดูแลเห็นหลายใบพร้อมกัน
  ถ้าไม่มีป้ายจะเติมเงินหรือลบผิดใบโดยไม่รู้ตัว เพราะทุกใบหน้าตาเหมือนกันหมด

## ⚠️ สิ่งที่ยัง **ไม่** เปลี่ยน

**บิลที่ตั้งเป็น PRIVATE ผู้ดูแลยังมองไม่เห็น** (`canSee()` ไม่มีข้อยกเว้นให้ admin)
ตั้งใจไม่แตะ เพราะคนที่กดตั้งบิลเป็นส่วนตัวคาดหวังว่ามันเป็นส่วนตัวจริง ๆ
การเปิดให้เห็นเงียบ ๆ คือการผิดสัญญาที่หน้าจอเคยให้ไว้ · ถ้า North อยากให้เปลี่ยน
ต้องเปลี่ยนข้อความบนฟอร์มบิลพร้อมกันด้วย

เทส: **565 เคส ผ่านหมด** (เพิ่มเคสผู้ดูแลเห็นทุกใบ · สมาชิกธรรมดายังเห็นเฉพาะของตัวเอง ·
ผู้ดูแลรายคนเห็นของคนที่ตัวเองดูแลแต่ไม่เห็นของคนอื่น)


---

# 🆕 2026-08-23 (รอบสาม) — ลบล็อตเติมเงินจากรายการล่าสุด + ตัวเลขเงินมีทศนิยม

## ลบ/แก้ล็อตเติมเงินได้จาก "รายการล่าสุด"

เดิมทำได้เฉพาะในประวัติที่ซ่อนอยู่ในการ์ดกระเป๋า ต้องกดเข้าไปอีกชั้น
ทั้งที่ "รายการล่าสุด" คือที่ที่คนเห็นล็อตเติมเงินบ่อยที่สุด

- ปุ่ม ✏️ / 🗑️ โผล่เฉพาะแถวชนิด `fund` และเฉพาะตอนทริปยังไม่ปิด (`financeLocked('fundings')`)
- 🔴 ตรรกะการลบถูกดึงออกมาเป็น `deleteFundingLot(id)` + `bindLotActions(container)`
  **ห้ามเขียนซ้ำสองชุด** — วันหนึ่งจะมีที่หนึ่งลืมถามยืนยันหรือลืมเช็คว่าทริปปิดอยู่
  ซึ่งคือการลบเงินโดยไม่มีใครตั้งใจ · ตอนนี้ผูกไว้ที่ `#walletGrid` และ `#walletActivity`
- API มีอยู่แล้ว: `DELETE /api/unified-trip/fundings?id=`

## ยอดเงินทุกที่: คั่นหลักพัน + ทศนิยม 2 หลัก

North: *"ปรับตัวเลขที่เป็นหลักพัน มี , และมีทศนิยม 2 หลัก"*

`unitAmount()` เดิมปัดเศษทิ้งทั้งหมด (¥5,000 ไม่ใช่ ¥5,000.00) ด้วยเหตุผลว่าอ่านเร็วกว่า
— เปลี่ยนเป็นทศนิยม 2 หลักเสมอ · `unitBaht` และ `nativeAmount` ตามไปด้วยทันที
(ทั้งสามตัวใช้กับ "เงิน" อย่างเดียว รวม 40 กว่าจุดบนหน้ากระเป๋าและหน้าบิล)

🔴 **สิ่งที่ห้ามเปลี่ยนตาม**
- `fmtAmount()` — ใช้กับ *จำนวนบิล / จำนวนวัน* ด้วย "3.00 บิล" คือตัวเลขที่ผิดความหมาย
- **เรท** ยังเป็น `toFixed(4)` เพราะเป็นอัตรา ไม่ใช่ยอดเงิน · ปัดเป็น 2 หลักแล้ว
  0.2384 กับ 0.2350 จะกลายเป็น 0.24 เท่ากัน ทั้งที่ยอดบาทต่างกันจริง

## ช่องกรอกเงินคั่นหลักพันให้เอง

`attachMoneyInput(selector)` — พิมพ์ `56000` ออกจากช่องเห็น `56,000.00` กลับเข้าไปแก้เห็น `56000`
ใช้กับ `#fundThb` `#fundForeign` `#expenseAmount`

🔴 **ทำตอน `blur` ไม่ใช่ตอนพิมพ์** — แทรกจุลภาคระหว่างพิมพ์ทำให้เคอร์เซอร์กระโดด
พิมพ์ผิดง่ายกว่าเดิมมาก · และเวลาใส่ค่าลงช่องด้วยโปรแกรม (เปิดฟอร์มแก้ไข)
ต้องใช้ `paintMoneyInput()` เพราะ `blur` ไม่เกิดขึ้นเอง

⚠️ ทุกจุดที่อ่านค่ากลับใช้ `.replace(/[^\d.]/g, '')` อยู่แล้ว จุลภาคจึงไม่กระทบการคำนวณ


---

# 🆕 2026-08-23 (รอบสอง) — ปิดทริปแล้วเงินเข้าสมุดบัญชีจริง

North ขอให้ตรวจว่า "ปิดทริปแล้วค่าใช้จ่ายวิ่งไปอยู่ใต้ Caption/Category ถูกไหม
มีข้ามไหม" · คำตอบคือ **ไม่มีอะไรวิ่งไปเลย** และเจออีก 6 เรื่องระหว่างทาง

## 🔴 หลักการเงินของทริป — ตามที่ North อธิบายเอง (ทับของเดิมในไฟล์นี้)

```
สมุดบัญชีหลัก (North บันทึกเอง)
   Kbank ──โอน/ถอน──▶ บัญชี "เงินรอเที่ยว"      ← ตอนซื้อเงิน ตปท.
                            │  ผูกไว้ที่กระเป๋า
ฝั่งทริป   กระเป๋าเงิน (ใส่ยอดเอง) ◀──┘
        └──ตอนปิดทริป──▶ ตัดเงินออกจากบัญชีนั้น **เฉพาะยอดที่ใช้จริง**
                          แยกบรรทัดย่อยตาม Category (Caption ตามมาเอง)
   เงินเหลือ → ไม่ต้องทำอะไร ค้างเป็นยอดในบัญชีนั้นไว้ใช้ทริปหน้า
```

🔴 **ข้อ 1 ของหัวข้อ "การเงินตอนปิดทริป — โครงใหม่" ที่เขียนว่า "เงินออกจากบัญชี
ตอนเติมเงิน" — ยังไม่เคยถูกทำ และตอนนี้ตกลงกันใหม่ว่าเงินออก *ตอนปิดทริป***
เติมเงินไม่แตะสมุดบัญชี · ที่เขียนไว้ว่า "บัญชีผูกที่กระเป๋า" นั้นถูกแล้วและตอนนี้ใช้จริง

## สิ่งที่แก้

| ปัญหา | เดิม | ตอนนี้ |
|---|---|---|
| **ปิดทริปไม่ลงบัญชีเลยสักบาท** | โพสต์ก็ต่อเมื่อ `body.account_id` ถูกส่งมา แต่หน้าจอ**ไม่เคยส่ง** ขณะที่ toast ขึ้นว่า "ยอดถูกบันทึกเข้าบัญชีจริง" | บัญชีปลายทางมาจาก `TripWallets.account_id` ของกระเป๋าที่จ่ายบิลใบนั้น จึงไม่มีอะไรต้องถามและไม่มีทางลืมส่ง |
| **เครื่องหมายกลับด้านกับสมุดหลัก** | ยอดหัวและยอดย่อยเป็น **บวก** → ยอดคงเหลือบัญชีจะ **เพิ่ม** เท่ายอดที่ใช้ไป | ติดลบทั้งคู่ ตรงกับ signed model ของ `frontend/app.js` (`positive=income, negative=expense`) |
| **บังคับหมวดต้องเป็นฝั่งค่าใช้จ่าย** | `behavior='EXPENSE'` ทั้งตอนบันทึกบิลและตอนส่งผังบัญชีให้ฟอร์ม | ทุก Caption · North: *"ไปตปท.ฉันอาจซื้อกล้อง คอมพิวเตอร์ ในทริปฉันจะสร้างรายการ และผูกกับ caption ฝั่งสินทรัพย์ก็ได้"* |
| **`type` ของรายการย่อย** | ยัด `'EXPENSE'` ตายตัว | มาจาก `Categories.default_type` เหมือนที่สมุดหลักทำ |
| **บัตรเครดิตผูกบัญชีไม่ได้** | บังคับ `account_id = null` → บิลบัตรไม่มีปลายทาง ลงบัญชีไม่ได้ทั้งก้อน | ผูกบัญชีบัตรเครดิตในสมุดหลักได้ |
| **เงินเหลือบังคับต้องตอบ** | ไม่บอกว่าจะเอาไปไหน = ปิดไม่ได้ | เพิ่ม `KEEP` = **ปล่อยไว้** และเป็นค่าเริ่มต้น |
| **ประตูหลัง** | `default_category_id` / `category_map` รับมาโดยไม่ตรวจอะไรเลย · `fx_category_id` ตรวจแค่ "ไม่ว่าง" | ตัดสองตัวแรกทิ้ง · FX ตรวจว่าเป็นหมวดของครอบครัวนี้จริง |
| **เปิดทริปกลับ กลับไม่ครบ** | เก็บ `linked_transaction_id` ได้ใบเดียว → ใบ FX ค้างในสมุดบัญชีตลอดไป | เก็บทุกใบคั่นด้วยจุลภาค · กลับครบ · รายการกลับคัดลอก `entity_id` และ `type` ของเดิมมาด้วย |

## 🔴 กติกาที่ต้องไม่ถูกถอดออกภายหลัง

1. **Caption ไม่เคยถูกส่งไปไหน** — ทุกหน้าสรุปอ่านจาก `Categories.caption_id` เสมอ
   กติกา "ห้ามข้าม Caption" จึงเกิดเองโดยโครงสร้าง **ตราบใดที่ `category_id` มีอยู่จริง**
   ด่านที่ต้องมีคือ "หมวดต้องมีอยู่และเป็นของครอบครัวนี้" ไม่ใช่ "หมวดต้องเป็นฝั่งค่าใช้จ่าย"

2. **หมวดที่ JOIN ไม่ติดคือหายนะเงียบ** — ทุกหน้าสรุป `JOIN Categories` ถ้า id ไม่มีจริง
   แถวนั้นถูกตัดทิ้งทั้งหมด เหลือแต่ยอดในบัญชีที่ขยับโดยไม่มีอะไรอธิบายได้
   จึงตรวจซ้ำตอนปิดทริปอีกรอบ ไม่ใช่เชื่อว่าตรวจตอนบันทึกบิลไปแล้ว

3. **หนึ่ง Transaction ผูกได้บัญชีเดียว** — ทริปที่เติมเงินจากสองบัญชีต้องแตกเป็นสองใบ
   ยัดรวมใบเดียวแล้วยอดคงเหลือของทั้งสองบัญชีจะเพี้ยน โดยยอดรวมทั้งครอบครัวยังถูก

4. **กระเป๋าที่ไม่ผูกบัญชี = ปิดทริปไม่ได้** (400 พร้อมบอกชื่อกระเป๋า)
   ปล่อยผ่านเมื่อไร ยอดของกระเป๋าใบนั้นหายจากสมุดบัญชีเงียบ ๆ

5. **กำไร/ขาดทุนค่าเงินเกิดตอนแลกคืนจริงเท่านั้น** — North: *"จะเกิดขึ้นเมื่อแลกเงินคืน
   เช่นจบทริป เปลี่ยนจาก JPY เป็น THB จะเป็นการตัดสินใจหลังสิ้นสุดทริป"*
   ปล่อยไว้ (KEEP) และยกไปทริปหน้า (CARRY) ยังไม่รับรู้ทั้งคู่
   และมันลงใต้ Caption **ค่าใช้จ่าย** เสมอ — North: *"กำไรขาดทุนก็ให้ไปเพิ่มหรือลดค่าใช้จ่าย"*
   เพราะเนื้อหาสาระคือ "ค่าใช้จ่ายบางรายการบันทึกไม่ถูกเรท" ไม่ใช่รายได้

6. **ข้อความยืนยันต้องพูดสิ่งที่เกิดขึ้นจริง** — `submitLive()` รับฟังก์ชันได้แล้ว
   toast ของการปิดทริปบอกจำนวนรายการที่เขียนลงสมุดบัญชีจริง ไม่ใช่คำรับรองลอย ๆ
   (ครั้งหนึ่งเคยขึ้นว่า "ยอดถูกบันทึกเข้าบัญชีจริง" ทั้งที่ไม่มีอะไรถูกเขียนเลย)

## เทส

`backend/test/unified-trip-write.test.mjs` → **563 เคส ผ่านหมด** (เดิม 538)
เคสใหม่คุม: เครื่องหมายติดลบ · บัญชีมาจากกระเป๋า · แตกใบตามบัญชี ·
หมวดสินทรัพย์ไปอยู่ใต้ Caption สินทรัพย์ · `type` มาจาก `default_type` ·
KEEP ไม่สร้าง FX · เปิดกลับแล้วยอดสุทธิเป็น 0 สนิททุกใบ

⚠️ schema จำลองในไฟล์เทสเพิ่ม `CAP-AST` (Asset) และ `CAT-ASSET` (`default_type='ASSET'`)


---

# ⏸️ 2026-08-23 — พักงานระบบทริปไว้ตรงนี้

North: **"ตอนนี้ระบบทริปน่าจะหยุดไว้ก่อน จะขอสร้าง chat ใหม่ เพื่อต่องานเรื่องจดค่าใช้จ่ายหลัก"**

**สถานะ:** ระบบทริปทำงานได้ครบ เทสผ่านหมด ไม่มีงานค้างกลางคัน

เวอร์ชันล่าสุด: `app.js?v=124` `api.js?v=47` `style.css?v=157`
เทส 674 เคสผ่าน (auth 27 · money 54 · session 22 · slice-engine 33 · unified-trip-write 538)

## ⚠️ commit ล่าสุดคือ `fc61075` — งานหลังจากนั้นยังไม่ได้ commit

`fc61075 ระบบทริป: กระเป๋า สมาชิก สิทธิ์ ปิดทริป + ด่านตรวจหน้าเว็บ`
ตอนเขียนหัวข้อนี้ (23 ส.ค. รอบสอง) working tree สะอาดจริง
**แต่งานรอบสอง/สาม/สี่ที่ทำหลังจากนั้นยังค้างอยู่ 10 ไฟล์** — ดูหัวข้อ 📍 2026-09-03 ด้านบน

## เรื่องที่รู้อยู่แล้วว่ายังไม่ได้ทำ (ไม่ใช่บั๊ก — ยังไม่มีใครขอ)

- **ลากสลับลำดับบนจอสัมผัสไม่ได้** — ใช้ HTML5 drag-and-drop ซึ่งมือถือไม่รองรับ
  บนมือถือจึงเรียงลำดับใหม่ไม่ได้เลย (บิล · รายการในกระเป๋า · แผนเที่ยว)
- **สิทธิ์แบบ "ดูอย่างเดียว"** — North เคยถามถึง ยังไม่มีในระบบ
  ตอนนี้มีแค่ ผู้ดูแล / สมาชิกที่จดของตัวเองได้
- **ตรวจหน้าตาอัตโนมัติไม่ได้** — jsdom ไม่มี layout engine
  บั๊กแบบ "ตัวอักษรทับกัน" ต้องมีคนมองจอถึงจะเห็น (เจอมาแล้ว 2026-08-23)


---

# 🆕 2026-08-23 — ย้ายลิงก์/ลบทริปให้ถูกหัวข้อ + ตั้งรหัสรายคนเป็นหน้าต่างจริง

North: **"ทำไม ลิงค์กับลบทริปถึงอยู่หน้าเดียวกัน ลบทริป ควรอยู่ในข้อมูลทริป
และลิงค์ควรอยู่ใน คนและสิทธิ์"**

หัวข้อ **"ลิงก์และลบทริป" ถูกยกเลิก** — มันรวมของสองเรื่องที่ไม่เกี่ยวกันไว้ด้วยกัน
เพียงเพราะ "อันตรายเหมือนกัน" ผลคือคนหาลิงก์ไม่เจอ เพราะไม่มีใครคิดว่าลิงก์
ที่ต้องส่งให้เพื่อนจะไปซ่อนอยู่ใต้ป้ายเตือนสีแดงคู่กับปุ่มลบ

- ปุ่ม **ลบทริป** → ท้ายหัวข้อ **ข้อมูลทริป** (ใน `.danger-zone` ที่มีเส้นคั่น อยู่หลังปุ่มบันทึก)
- ช่อง **ลิงก์เข้าทริป** → หัวข้อ **คนและสิทธิ์** ที่เดียว
- `#directTripLink` / `#copyDirectLink` **ถูกลบทิ้ง** เหลือ `#joinLink` ช่องเดียวทั้งแอป
  🔴 ห้ามเพิ่มช่องลิงก์ที่สองกลับมาอีก — สองช่องที่คำนวณคนละที่คือที่มาของการส่งผิดลิงก์ให้ผิดคน
- คำอธิบายของหัวข้อเดิมถูกแบ่งไปอยู่ `MANAGE_INFO.trip` (เรื่องลบ) และ `MANAGE_INFO.people` (เรื่องลิงก์)

**ตั้งรหัสรายคน** — North: *"ควรมีให้เพิ่มรหัสพาสของแต่ละคนได้ ที่จะเข้าลิงค์นั้นได้"*

ของเดิมมีอยู่แล้วแต่ใช้ `prompt()` ของเบราว์เซอร์ ซึ่งมีปัญหาจริงสามข้อ:
Safari บนมือถือขึ้นเป็นแถบเล็ก ๆ บนสุดจอ มองไม่เห็นว่ากำลังตั้งให้ใคร ·
ไม่มี `type=password` ไม่มีช่องยืนยันซ้ำ พิมพ์ผิดแล้วรู้ตัวตอนเจ้าตัวเข้าไม่ได้ ·
คัดลอกลิงก์กับรหัสไปส่งต่อในทีเดียวไม่ได้

เปลี่ยนเป็น `#passcodeDialog` ของเราเอง: สองช่องต้องตรงกัน · อย่างน้อย 6 ตัว ·
ติ๊กดูรหัสที่พิมพ์ได้ · ปุ่ม **คัดลอกลิงก์พร้อมรหัส** (อ่านรหัสจากช่องที่พิมพ์
ไม่ใช่จากเซิร์ฟเวอร์ เพราะเซิร์ฟเวอร์เก็บแต่ค่าที่เข้ารหัสแล้ว) ·
ปุ่ม **ถอนสิทธิ์** ย้ายเข้ามาอยู่ในหน้าต่างนี้ แถวสมาชิกจึงเหลือปุ่มเดียว
(สองปุ่มติดกันบนแถวแคบในมือถือกดพลาดง่ายเกินไป)

## ตั้งรหัสได้ทุกคน และย้ายมาอยู่ในฟอร์มแก้ไข

North: **"ในส่วนผู้ใช้ที่มีบัญชีหลัก ให้ตั้งรหัสเข้าใช้ได้ด้วย เอาไว้หน้าเดียวกับแก้ไข
ได้ไหม แล้วแสดงข้อมูลไว้"**

🔴 **ผมเคยเข้าใจผิดและเขียนไว้ผิดในไฟล์นี้เอง** ว่ารหัส "ไม่มีผล" กับคนที่ผูกบัญชีครอบครัว
ความจริงคือ `memberLogin()` ฝั่งเซิร์ฟเวอร์**ไม่เคยอ่าน `user_id` เลย** —
ใครมี `passcode_hash` ก็ล็อกอินด้วยรหัสได้ ไม่ว่าจะผูกบัญชีไว้หรือไม่

สำหรับคนที่มีบัญชีครอบครัวอยู่แล้ว รหัสจึงเป็น **"ประตูที่สอง"** ไม่ใช่ประตูเดียว
(ใช้ตอนอยู่บนเครื่องที่ไม่ได้ล็อกอินบัญชีครอบครัว) — ต่างจากผู้ร่วมทริปที่รหัสคือทางเข้าทางเดียว
ป้ายบนแถวสมาชิกจึงแยกสองเรื่องนี้ออกจากกัน: `👤 บัญชีครอบครัว` กับ `🔑 มีรหัส`

⚠️ ผลข้างเคียงที่ต้องรู้: ตั้งรหัสให้คน MAIN = เปิดทางเข้าเพิ่มให้บัญชีที่ยอดไหลเข้า
สมุดบัญชีครอบครัวจริง · รหัสหลุด = คนนอกจดบิลในนามเขาได้ · ถอนได้ตลอดและเขายังเข้าผ่านบัญชีตัวเองได้เหมือนเดิม

`#passcodeDialog` **ถูกยุบทิ้ง** — ช่องรหัสย้ายเข้าไปอยู่ใน `#memberForm` เป็นบล็อก
`.access-block` 🔴 บนแถวสมาชิก**ไม่มีปุ่มรหัส** — North: "ตั้งรหัสเอาออก มีอยู่ในแก้ไขแล้วไง" · ✏️ คือปุ่มเดียว แถวมีหน้าที่บอกสถานะเท่านั้น
บันทึกด้วยปุ่มเดียว: `saveMember()` แล้วค่อย `setMemberPasscode()` ถ้ากรอกรหัสมา
🔴 คนใหม่ต้องใช้ `member_id` ที่เซิร์ฟเวอร์คืนมา ไม่ใช่ `m-...` ที่ฝั่งนี้ตั้งชั่วคราว ไม่งั้นได้ 404

`readNewPasscode()` คืน 3 ค่า: `null` = เว้นว่าง ไม่แตะรหัสเดิม · `false` = กรอกมาแต่ไม่ผ่าน
(หยุดทั้งการบันทึก ไม่ใช่บันทึกชื่อแล้วทิ้งรหัสเงียบ ๆ) · string = ตั้งรหัสนี้
**"เว้นว่าง = ไม่แตะรหัสเดิม" สำคัญมาก** — ถ้าพลาดเป็น "ล้างรหัส" คนจะแก้ชื่อสมาชิก
แล้วรหัสเขาหายไปโดยไม่มีใครตั้งใจ · มีเทสคุมไว้ใน `check-frontend-runtime.mjs`

เพิ่ม helper `openDialog(selector)` — 🔴 หน้าต่างใหม่ทุกอันต้องถูกเพิ่มในลิสต์ของ
`closeLayers()` ด้วย ไม่งั้นเปิดได้แต่ปิดไม่ลง ซึ่งบนจอดูเหมือนแอปค้าง


---

# 🆕 2026-08-22 — หน้ากระเป๋าใหม่ + แก้ล็อตเติมเงิน + ด่านกันลบกระเป๋า

**ยังไม่ deploy** · เทสรวม **674 เคส ผ่านหมด**
(auth 27 · money 54 · session 22 · slice-engine 33 · unified-trip-write 538)

## สิ่งที่เพิ่ม

| งาน | ไฟล์ |
|---|---|
| `DELETE /api/unified-trip/wallets?id=` พร้อมด่านกัน | `backend/src/unified-trip.js` → `deleteWallet()` |
| `POST /fundings` รับ `funding_id` เพื่อ **แก้ล็อตเดิม** | `backend/src/unified-trip.js` → `writeFunding()` |
| หน้ากระเป๋าใหม่: การ์ดแยกใบ · สีตามสกุล · ปุ่มไอคอน 4 สี · ประวัติรายกระเป๋า | `frontend/trip-unified-prototype/app.js` `style.css` (บล็อก v31) |
| `symbolFor()` รองรับทุกสกุล ไม่ใช่แค่ ฿ กับ ¥ | `app.js` |

## 🔴 กติกาที่ต้องไม่ถูกถอดออกภายหลัง

1. **กระเป๋าที่มีบิลผูกอยู่ ลบไม่ได้** → ตอบ 409 พร้อมบอกจำนวนบิล
   เหตุผล: บิลอ้างกระเป๋าเพื่อหาเรทต้นทุน ถ้ากระเป๋าหาย บิลเก่าจะตีเป็นบาทไม่ได้
   **ยอดรวมทริปจะลดลงเงียบ ๆ และการหารเงินจะเพี้ยนโดยไม่มีอะไรฟ้อง**

2. **`rate` ไม่รับจาก client ทั้งตอนสร้างและตอนแก้** — คำนวณ `thb ÷ foreign` เสมอ
   (มีเทสยิง `rate: 99` เข้าไปทั้งสองทางเพื่อยืนยัน)

3. **ย้ายล็อตข้ามกระเป๋าไม่ได้** → 409 · เรทเฉลี่ยของกระเป๋าสองใบจะเปลี่ยนพร้อมกัน
   และยอดบาทของบิลเก่าที่ผูกอยู่จะขยับตามโดยไม่มีใครตั้งใจ · อยากย้ายให้ลบแล้วสร้างใหม่

4. **แก้ล็อตต้องเช็คว่าล็อตอยู่ในทริปนี้จริง** ไม่ใช่เชื่อ `funding_id` ที่ส่งมา
   ไม่งั้นเดา id แล้วแก้ล็อตของทริปอื่นได้

5. หน้าจอ: `editingFundingId` / `editingWalletId` **ต้องถูกล้างทุกครั้งที่เปิดฟอร์มแบบเพิ่มใหม่**
   ไม่งั้นการเติมเงินครั้งถัดไปจะไปทับล็อตเก่าเงียบ ๆ (บั๊กชนิดเดียวกับ `editingBillId`)

6. ตัวอย่างเรทในฟอร์มตอนแก้ไข **ต้องหักล็อตเดิมออกก่อน** ไม่งั้นนับซ้ำสองรอบ
   แล้วโชว์เรทเฉลี่ยที่ไม่มีทางเกิดขึ้นจริงหลังกดบันทึก

## 🔴 บั๊กที่แก้แล้ว: "ยกยอดไปทริปหน้า" ติ๊กแล้วไม่ติด

เซิร์ฟเวอร์บันทึก `exclude_on_close` ถูกต้องมาตลอด และ `GET` ก็ส่งกลับมาด้วย
(`...row` spread) แต่ **`api.js` ไม่เคยอ่านช่องนี้ลงใน state ของหน้าจอ**

ผลคือหลัง `refreshFromServer()` ค่ากลายเป็น `undefined` → ช่องติ๊กเด้งกลับทุกครั้ง
ดูเหมือน "กดไม่ติด" ทั้งที่จริงคือ "บันทึกติดแล้วแต่อ่านไม่กลับ"

**บทเรียน**: การเพิ่มฟิลด์ใหม่ต้องไล่ครบ 4 จุดเสมอ — ตาราง · เขียน · อ่าน · แมปที่ `api.js`
ขาดจุดที่ 4 คือบั๊กที่หายากที่สุด เพราะฐานข้อมูลถูกต้องทุกอย่าง

## 🆕 สีประจำกระเป๋า (`TripWallets.color_hue`)

เก็บเป็น **องศาสี 0–359** ไม่ใช่รหัสสี `#rrggbb` โดยตั้งใจ
ความสว่าง/ความอิ่มสีถูกกำหนดใน CSS ที่เดียว (`hsl(var(--wc) 78% 84%)`)
ทุกสีจึงพาสเทลเท่ากันและตัวหนังสือบนพื้นนั้นอ่านออกเสมอ
ถ้าให้ผู้ใช้เลือกรหัสสีเต็ม เลือกสีเข้มทีเดียวตัวเลขบนการ์ดจะหายไปทันที

ค่านอกช่วง/ไม่ใช่ตัวเลข → เก็บ `null` (หน้าจอถอยไปใช้สีตามสกุลเงิน)
⚠️ ใช้ `??` ไม่ใช่ `||` ทุกที่ที่อ่านค่านี้ — องศา 0 คือสีแดง ไม่ใช่ "ไม่ได้เลือก"

**ต้องรัน `bash setup-db.sh` ก่อน deploy รอบนี้** (เพิ่มคอลัมน์ `color_hue` และ `sort_order`)

## 🆕 ลำดับบิลที่ผู้ใช้จัดเอง (`TripExpenses.sort_order`)

`POST /api/unified-trip/expenses/reorder` รับ `{ order: [id, …] }` **ทั้งชุด**
ไม่ใช่ส่งทีละคู่ที่สลับ — "ครั้งสุดท้ายชนะ" เข้าใจง่ายและไม่มีสถานะกลางที่ผิด
เมื่อมีคนแก้พร้อมกัน · ไล่เลข 10, 20, 30 … เว้นช่องเผื่อแทรก
กรองเฉพาะ id ที่อยู่ในทริปนี้จริง (เดา id แล้วเขียนทับข้ามทริปไม่ได้)

⚠️ `ORDER BY … COALESCE(sort_order, 999999) ASC` — บิลที่ยังไม่เคยจัดลำดับมีค่า NULL
ซึ่ง SQLite เรียงมาก่อนทุกค่า ถ้าไม่ดักไว้ บิลใหม่จะแทรกขึ้นหัวรายการของวันนั้นเสมอ

🔴 **ลากได้เฉพาะภายในวันเดียวกัน** — วันที่ของบิลคือข้อมูลทางบัญชี
ไม่ใช่แค่ตำแหน่งในรายการ ลากข้ามวันแล้วเปลี่ยนวันที่ให้คือสิ่งที่ผู้ใช้ไม่ได้ตั้งใจ

## 🔴 บั๊ก: ชื่อ "พื้นที่" ที่พิมพ์ผิดใน blockedByClose() ล็อกทุกอย่างเงียบ ๆ

`financeLocked(area)` คืน `true` เมื่อ `liveMode && !LIVE_WRITABLE[area]`
ถ้าส่งชื่อพื้นที่ที่**ไม่มีอยู่ในตาราง** เช่น `'bills'` (ของจริงคือ `'expenses'`)
ผลคือ **ล็อกเสมอในโหมดข้อมูลจริง** โดยไม่มี error ให้เห็น

เจอจาก: ลากสลับลำดับบิลไม่ได้เลย และปุ่มลบบิลขึ้น "ทริปถูกล็อก" ทั้งที่ทริปยังเปิดอยู่

**ชื่อพื้นที่ที่ใช้ได้มีแค่**: `expenses` `wallets` `currencies` `fundings` `closing` `plan`
เพิ่มพื้นที่ใหม่ต้องเติมคีย์ใน `LIVE_WRITABLE` ด้วยเสมอ

⚠️ อีกจุดที่ทำให้ลากไม่ได้: `<img>` เป็น draggable โดยธรรมชาติ
ถ้าไม่ใส่ `draggable="false"` การเริ่มลากจากไอคอนจะกลายเป็นการลาก "รูป"
แทนที่จะลากการ์ด — ซึ่งเป็นจุดที่คนเล็งลากมากที่สุดพอดี

## 🆕 หน้าจัดการทริปออกแบบใหม่ (2026-08-23)

North เลือก **แบบ B — การ์ดพับได้** จาก 3 แบบที่เสนอ

เดิมเป็นการ์ด 9 ใบเรียงยาว แต่ละใบมีย่อหน้าอธิบาย 2–4 บรรทัดอยู่บนสุด
ต้องเลื่อนจอ 3–4 หน้าจึงเห็นครบ ทั้งที่คนเข้ามาแก้จริงมักแค่เรื่องเดียว

ตอนนี้: **แถบสรุปทริป** ด้านบน (สมาชิก · สกุลเงิน · กระเป๋า · บิล · จุดแวะ · เอกสาร · สถานะ)
แล้วตามด้วย **7 การ์ดพับได้** — ทริป · คนและสิทธิ์ · เงิน · เอกสาร · ธีมสี · ปิดทริป · ลิงก์และพื้นที่อันตราย

- คำอธิบายทั้งหมดย้ายไปอยู่ใน `MANAGE_INFO` (app.js) เปิดด้วยปุ่ม ⓘ ที่มุมขวาบนของแต่ละการ์ด
- สถานะพับ/กางจำไว้ใน `localStorage` คีย์ `rr-trip-manage-open`
  (เป็นความชอบของเครื่องนี้ ไม่ใช่ข้อมูลทริป — เก็บบนเซิร์ฟเวอร์จะไปทับของคนอื่นในทริปเดียวกัน)
- การ์ด "ข้อมูล prototype" ถูกยุบเข้าไปในการ์ดพื้นที่อันตราย และ **ซ่อนทั้งก้อนในโหมดข้อมูลจริง**

### 🔴 ข้อควรระวังของหน้านี้

1. **ตัวเลขบนแถบสรุปคำนวณสดทุกครั้งใน `renderManageSummary()` ห้าม hardcode**
   ข้อมูลตัวอย่างที่ฝังไว้แล้วไม่มีใครเขียนทับ คือบั๊กที่อันตรายที่สุดในแอปนี้
2. **ปุ่ม ⓘ ต้องไม่เป็นลูกของปุ่มหัวข้อ** — ปุ่มซ้อนปุ่มเป็น HTML ที่ไม่ถูกต้อง
   เบราว์เซอร์จะย้ายมันออกมาเอง แล้ว layout เพี้ยนแบบหาสาเหตุยากมาก
   (จึงวางเป็น `position:absolute` ทับมุมขวาบนแทน)
3. **การ์ดที่พับต้อง `display:none` ไม่ใช่ `height:0`** — ฟอร์มที่ยังอยู่ใน tab order
   ทำให้กด Tab แล้วโฟกัสหายเข้าไปในการ์ดที่มองไม่เห็น
4. `renderManageSummary()` ถูกเรียกท้าย `fillTripMetaForm()` ด้วย เพราะแถบสรุปอ่านชื่อ/วันที่
   จากฟอร์ม ถ้าเรียกแต่ใน `renderBills()` ตอนโหลดรอบแรกจะขึ้น "ทริปนี้" ทั้งที่ข้อมูลมาแล้ว

## 🆕 หน้าจัดการทริป รอบ 3 — ตารางการ์ดสี + แถบเตือน (2026-08-23)

North เลือก **"เอา B เป็นโครงแล้วเอาแถบเตือนของ C มาแปะบนสุด"** จาก 3 แบบที่เสนอ

- **แถบเตือน "ที่ควรดูตอนนี้"** บนสุด — คำนวณสดใน `renderManageAlerts()`
  เตือนเฉพาะเรื่องที่ *ทำให้ตัวเลขผิด* หรือ *ทำให้ใช้งานไม่ได้*
  (กระเป๋าไม่มีเรท · บิลตีเป็นบาทไม่ได้ · ยังไม่ตั้งวันเดินทาง · มีบิลแต่ไม่มีกระเป๋า · ไม่มีจุดแวะ · ทริปปิดแล้ว)
  ⚠️ ถ้าเตือนทุกเรื่องที่ยังไม่ครบ แถบนี้จะเต็มตลอดเวลาแล้วคนจะเลิกอ่าน
  กดที่แถบเตือนแล้วกระโดดเข้าหัวข้อที่เกี่ยวข้องเลย
- **ตารางการ์ดสี** — มือถือ 2 คอลัมน์ (เห็นครบ 7 หัวข้อในจอเดียว) · จอกว้าง 4 คอลัมน์
  การ์ด "ลิงก์และลบทริป" กินเต็มแถวล่างสุด แยกจากปุ่มที่กดบ่อย
  ไม่ให้นิ้วพลาดไปโดนตอนกวาดหาหัวข้ออื่น
- มือถือ: กดการ์ด → ตารางหายไป เหลือแผงเนื้อหา + ปุ่ม "‹ หัวข้อทั้งหมด"
  จอกว้าง: ตารางอยู่บน แผงอยู่ล่าง เห็นพร้อมกัน

### ประวัติสองรอบก่อน (อย่าย้อนกลับไป)

| รอบ | แบบ | ทำไมถึงเปลี่ยน |
|---|---|---|
| 1 | การ์ดพับได้ | ต้องกดกางทีละใบกว่าจะเจอของที่จะแก้ |
| 2 | เมนูซ้าย + แถบเลื่อนแนวนอนบนมือถือ | 🔴 หัวข้อที่ 5–7 อยู่นอกจอ ไม่มีอะไรบอกว่ามีต่อ · ตัวนับถูกซ่อนเพราะไม่มีที่ |

## (เดิม) หน้าจัดการทริป รอบ 2 — เมนูหัวข้อ + แผงเนื้อหา

รอบแรกทำเป็นการ์ดพับได้ · North: **"ดูใช้งานยาก"** — ต้องกดกางทีละใบกว่าจะเจอของที่จะแก้
รอบนี้เลือกหัวข้อครั้งเดียวแล้วเนื้อหาโผล่ทันที ไม่มีขั้นกางอีกชั้น

- จอกว้าง = เมนูซ้าย (sticky) · มือถือ = แถบเลื่อนแนวนอนด้านบน
- 7 หัวข้อ: ข้อมูลทริป · คนและสิทธิ์ · เงินและหมวด · เอกสาร · ธีมสี · ปิดทริป · ลิงก์และลบทริป
- หัวข้อที่เปิดค้างจำไว้ใน `localStorage` คีย์ `rr-trip-manage-panel`
- คำอธิบายอยู่ที่ปุ่ม "ⓘ อธิบายหัวข้อนี้" ในหัวแผง (ข้อความอยู่ใน `MANAGE_INFO`)

## 🆕 เพิ่ม/แก้/ลบสมาชิกในทริป

`POST /members` · `DELETE /members?id=` — **ผู้ดูแลทริปเท่านั้น**
ถ้าใครก็เพิ่มสมาชิกได้ ก็เท่ากับเพิ่มคนที่เห็นบิลที่แชร์ทั้งทริปได้เอง = รั่วข้อมูลการเงินคนอื่น

🔴 กติกาที่ต้องไม่ถูกถอดออก

1. **ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน** — ถอดสิทธิ์คนสุดท้าย → 409
   ทริปที่ไม่มีผู้ดูแลเลยจะแก้อะไรไม่ได้อีก รวมถึงแต่งตั้งผู้ดูแลคนใหม่
2. **`ledger_mode` ที่ไม่รู้จักต้องตกเป็น `MAIN`** ไม่ใช่เขียนตามที่ส่งมา
   ค่าพิมพ์ผิดจะทำให้ยอดหายจากบัญชีจริงตอนปิดทริปโดยไม่มีอะไรฟ้อง
3. **ลบตัวเองไม่ได้** และ **คนที่มีบิล/กระเป๋า/ส่วนแบ่งผูกอยู่ ลบไม่ได้** (409 พร้อมบอกว่าติดตรงไหน)
   ถ้าลบไป บิลจะอ้างถึงคนที่ไม่มีตัวตน ยอดหารเงินจะเพี้ยนเงียบ ๆ
4. `member_id` ตั้งฝั่งเซิร์ฟเวอร์เสมอตอนสร้าง ไม่รับจาก client

## 🎨 ช่องเลือก (select) ทั้งแอปเป็นกรอบขาวเหมือนช่องกรอก

`appearance:none` + ลูกศร SVG ของเราเอง · ครอบ `.screen` `.dialog` `.bottom-sheet` `.sheet-step`
สไตล์เทาที่เคยติดมากับแท็กใน `trips.html` ถูกย้ายไป `trips.css` แล้ว
⚠️ **ห้ามแก้ด้วย `!important`** — ให้แก้ที่ต้นทาง ไม่งั้นรอบหน้าจะทับกันไปเรื่อย ๆ

## 🔴 ปุ่มปิด × ไม่อยู่ตรงกลาง + ปุ่มท้ายฟอร์มทับข้อมูล (แก้ 2026-08-23)

เป็นกับ **ทุก dialog ในแอป (17 ใบ)** พร้อมกัน เพราะเป็นปัญหาที่ CSS กลาง ไม่ใช่ทีละหน้า

| อาการ | สาเหตุจริง |
|---|---|
| × ไม่อยู่กลางปุ่ม | ปุ่มกว้าง 34px แต่ไม่ได้สั่งจัดกึ่งกลางแนวตั้ง ตัวอักษรจึงวางบน baseline ตามปกติ และตัว `×` เองมีกรอบตัวอักษรที่ไม่สมมาตร |
| ปุ่มท้ายฟอร์มทับข้อมูล | `.sheet-actions` ไม่มี `margin-top` เลย + เงาของ `.primary-btn` (`0 6px 15px`) ฟุ้งขึ้นไปทับอีก |
| ช่องกรอกบางฟอร์มกรอบเหลี่ยม ป้ายอยู่ข้าง | สไตล์ช่องกรอกผูกกับ `.editor-grid` เท่านั้น ฟอร์มที่ไม่ได้ใช้คลาสนั้นเลยได้ของดิบจากเบราว์เซอร์ |

**วิธีแก้ที่ใช้**
- `×` เปลี่ยนเป็น **SVG** (`.ico-x`) + `place-items:center` — ตรงกลางจริงทุกเบราว์เซอร์
  และคมทุกความละเอียด ไม่ขึ้นกับฟอนต์ที่เครื่องนั้นมี
- `.dialog .sheet-actions` ได้ `margin-top:18px` + เส้นคั่น + `flex-wrap`
- ปุ่มลบ (`.danger-btn`) ถูกดันไปซ้ายสุดด้วย `margin-right:auto`
  — ปุ่มลบที่อยู่ติดปุ่มยืนยันคือเหตุผลอันดับหนึ่งที่คนกดลบโดยไม่ตั้งใจ
- ช่องกรอกใช้กฎกลาง `.dialog input / textarea / select` ขนาด 15px กรอบมนเหมือนกันหมด

⚠️ **ห้ามผูกสไตล์ฟอร์มกับชื่อฟอร์มทีละอัน** — ฟอร์มใหม่ที่เพิ่มทีหลังจะหลุดทันที
แล้วจะกลับมาเป็นแบบนี้อีกโดยไม่มีใครสังเกต
⚠️ `style="…"` ที่ติดมากับแท็กใน HTML ถูกย้ายมาเป็นคลาสหมดแล้ว (`.stack-form`)
เจอที่ไหนอีกให้ย้ายมาไฟล์ CSS ไม่ใช่ทับด้วย `!important`

## 🆕 รูปประจำตัวสมาชิก (`TripMembers.avatar_url`) — 2026-08-23

แสดงแทนตัวอักษรตัวแรกในทุกที่ที่มีคน: หน้าคนและสิทธิ์ · ตัวกรองรายคนในหน้าบิล ·
การ์ดรายคน · ใครติดใคร · แถบสถานะสมาชิก

- เลือกจากคลัง (หมวด `member`) หรืออัปโหลดเองผ่านกล่องเลือกรูปเดิม
- **ไม่เลือกก็ได้** — ถอยไปใช้ตัวอักษรตัวแรก + สีประจำตัวเหมือนเดิม
  ⚠️ ห้ามเปลี่ยนเป็นวงกลมว่าง คนที่ยังไม่ตั้งรูปมักเป็นคนที่เพิ่งถูกเพิ่มเข้ามา
  ซึ่งเป็นตอนที่ต้องแยกให้ออกจากคนอื่นมากที่สุดพอดี
- ชุดสำรอง 8 แบบเป็น SVG (`art/icons/member_*.svg`) คมทุกขนาดเพราะเป็นเวกเตอร์
- **prompt สำหรับ generate ชุดจริงอยู่ใน `ICON_PROMPTS.md` หัวข้อ "รูปประจำตัวสมาชิก"**

### 🔴 ข้อจำกัดที่ต่างจากไอคอนหมวดอื่น

รูปนี้ถูกย่อเหลือ **22–44 px** เล็กกว่าไอคอนหมวดค่าใช้จ่ายเกือบครึ่ง
จึงต้องเป็น **หัวไหล่เท่านั้น ห้ามคนเต็มตัว** และต้องต่างกันที่ **ทรงผม + สีพื้นหลัง**
ไม่ใช่ต่างที่รายละเอียดใบหน้า — ที่ 26 px คนแยกออกได้แค่ทรงกับสีเท่านั้น

## 🆕 หัวข้อ "การสร้างภาพ" ในหน้าจัดการ (2026-08-23)

การ์ดที่ 8 ในหน้าจัดการ — รวมทุกอย่างที่ต้องรู้ตอน generate ไอคอนด้วย AI
กฎ 5 ข้อ · ตารางขนาด · prompt พร้อมคัดลอก 6 หมวด (`ART_PROMPTS` ใน app.js)

🔴 **ตารางขนาดสร้างสดจาก `assetSpecs` ห้ามพิมพ์ตัวเลขซ้ำลงในหน้านี้**
ถ้าวันหลังเปลี่ยนสเปกในโค้ดแล้วหน้านี้ยังโชว์เลขเก่า คนจะ generate ตามเลขที่ผิด
แล้วภาพถูกครอบจนเสียองค์ประกอบ — โดยไม่มีอะไรฟ้องเลย

⚠️ ปุ่มคัดลอกดักกรณีไม่มี `navigator.clipboard` ไว้ด้วย (Safari เก่า / ไม่ใช่ https)
ถ้าไม่ดัก ปุ่มจะกดแล้วเงียบสนิทโดยไม่มีอะไรบอกว่าล้มเหลว — จะถอยไปเลือกข้อความให้แทน

เนื้อหาเดียวกันอยู่ใน `ICON_PROMPTS.md` สำหรับตอนอ่านนอกแอป
**แก้ที่ไหนต้องแก้อีกที่ด้วย** (ยอมให้ซ้ำเพราะไฟล์ .md ใช้ตอนไม่ได้เปิดแอป)

## 🆕 คลังรูปที่อัปโหลดเอง · ลบได้เฉพาะผู้ดูแล (2026-08-23)

`GET /icon-upload` ลิสต์รูปของครอบครัว · `DELETE /icon-upload?key=` ลบ

🔴 **ลบได้เฉพาะ `Users.role = 'admin'` ของครอบครัวนั้น** — ไม่ใช่ผู้ดูแลทริป
รูปเป็นของใช้ร่วมกันทั้งครอบครัว ถ้าใครก็ลบได้ คนหนึ่งลบทิ้ง
ไอคอนของอีกคนที่ใช้อยู่จะกลายเป็นรูปแตกทันที

🔴 **ต้องเช็คว่าคีย์อยู่ในขอบเขตครอบครัวตัวเองจริง** ไม่ใช่เชื่อค่าที่ส่งมา
(`icons/{familyId}/…` หรือ `TripAssets.family_id`) และกัน `..` กันไต่ path

⚠️ **แก้บั๊กที่ค้างมานาน**: รูปที่อัปโหลดถูก `unshift` เข้า `assetLibrary`
ในหน่วยความจำเท่านั้น รีเฟรชแล้วหายจากคลัง (ตัวไฟล์ยังอยู่บนเซิร์ฟเวอร์
แต่หาไม่เจอเพื่อใช้ซ้ำ) — ตอนนี้โหลดจากเซิร์ฟเวอร์ทุกครั้งที่เปิดกล่องเลือกรูป

### 🔴 บทเรียน: ตัวจำลอง R2 ในเทสต้องมีเมธอดครบ

R2 shim ในเทสเคยมีแค่ `put`/`get` พอโค้ดเริ่มใช้ `list`/`head`/`delete`
เทสพังด้วยข้อความ **`TypeError: e is not a function`** ที่ชี้ไปยัง bundle base64
— หาสาเหตุยากมากเพราะ error ไม่ได้บอกเลยว่าปัญหาอยู่ที่ตัวจำลอง ไม่ใช่ที่โค้ด
**เพิ่มการเรียก binding ใหม่เมื่อไร ต้องเติมเมธอดใน shim ด้วยเสมอ**

⚠️ อีกจุด: `.all().catch(...)` ใช้ไม่ได้ — D1 บางรุ่นและตัวจำลองคืนอ็อบเจ็กต์ธรรมดา
ไม่ใช่ Promise ทำให้ `.catch` ไม่ใช่ฟังก์ชันแล้วพังทั้งคำขอ · ใช้ `try/catch` แทน

## 🆕 โครงสิทธิ์ใหม่: บัญชีหลัก / เฉพาะทริป / ผู้ดูแลรายคน (2026-08-23)

North ตั้งคำถามที่ตรงจุดมาก: *"ถ้าจะลงบัญชีหลัก ต้องไปดึงข้อมูลจากบัญชีหลักมา
ว่าเป็นสมาชิกอยู่แล้ว ไม่งั้นระบบจะปิดบัญชีได้ยังไง"*

**สิ่งที่พบตอนตรวจ**: การปิดทริปรวมยอดของทุกคนที่เป็น MAIN เป็น *ก้อนเดียว*
แล้วลงบัญชี *บัญชีเดียว* ที่คนปิดทริปเลือก ไม่ได้แยกลงบัญชีของแต่ละคน
→ ปิดทริปได้แม้ MAIN member ไม่มีบัญชี **แต่ MAIN เป็นแค่ป้าย ไม่มีการตรวจอะไรเลย**
ตั้งผิดแล้วไม่มีอะไรฟ้อง จนกระทั่งยอดเข้าบัญชีจริงมากกว่าที่ควร

### กติกาที่ตกลงและทำแล้ว

| เรื่อง | กติกา |
|---|---|
| `ledger_mode = MAIN` | **บังคับผูก `user_id`** กับบัญชีในครอบครัวเดียวกับทริป · หนึ่งบัญชีผูกได้คนเดียวต่อทริป (ซ้ำ → 409) |
| `ledger_mode = TRIP_ONLY` | ไม่ต้องมีบัญชี · **ล้าง `user_id` ทิ้งเสมอ** ไม่ใช่ปล่อยค่าเก่าค้าง |
| `managed_by` | ผู้ดูแลรายคน — จดบิล เติมเงิน แก้/ลบกระเป๋าแทนคนนั้นได้ |
| ลิงก์ | **เหลือลิงก์เดียวทั้งทริป** ใช้ได้ทั้งบัญชีครอบครัวและผู้ร่วมทริป |

### 🔴 กติกาที่ต้องไม่ถูกถอดออก

1. **TRIP_ONLY ต้องล้าง `user_id`** — คนที่เคยเป็น MAIN แล้วเปลี่ยนเป็น TRIP_ONLY
   ถ้าไม่ล้าง จะยังล็อกอินด้วยบัญชีครอบครัวเข้ามาเห็นทริปได้เหมือนเดิม
2. **หนึ่งบัญชีต่อหนึ่งสมาชิกต่อทริป** — ผูกซ้ำแล้วระบบจะไม่รู้ว่าตอนล็อกอิน
   ควรเป็นสมาชิกคนไหน สิทธิ์การมองเห็นจะเพี้ยนแบบสุ่ม
3. **`managed_by` ให้สิทธิ์เฉพาะกับคนที่ระบุ ไม่ใช่ทั้งทริป**
   ยายตั้ง North เป็นผู้ดูแล ไม่ได้แปลว่า North แตะกระเป๋าของ Puii ได้ด้วย
   (ใช้ `canActFor()` ที่เดียว — ห้ามเขียนเช็คสิทธิ์ซ้ำเองในแต่ละ handler)
4. **ลิงก์เดียวเช็คจาก `config.hasIdentity` ไม่ใช่ `userSource`**
   ผู้ร่วมทริปมี `trip_member_token` แต่ไม่มี `user_id` ของระบบครอบครัว
   ถ้าดูแค่ `userSource` จะเด้งเขากลับหน้าใส่รหัส **วนไม่รู้จบ**
5. **`?next=` รับเฉพาะ path ในโดเมนเดียวกัน** ไม่งั้นส่งลิงก์ที่มี
   `?next=https://เว็บปลอม` แล้วพาคนออกไปหลังใส่รหัสได้

## 🆕 การเงินตอนปิดทริป — โครงใหม่ (2026-08-23)

North ถามสามคำถามที่ตรงจุดมาก แล้วตกลงกันได้ตามนี้

### 1. บัญชีเงินฝากผูกที่ "กระเป๋า" ไม่ใช่ถามตอนปิด

`TripWallets.account_id` — กระเป๋าคือ *แหล่งเงิน* อยู่แล้ว
เงินสดเยนที่ถอนจากบัญชี A กับ YouTrip ที่ตัดจากบัญชี B เป็นคนละแหล่งจริง ๆ
และเงินออกจากบัญชี **ตอนเติมเงิน** ไม่ใช่ตอนปิดทริป
ถ้าถามตอนปิดทีเดียว ทริปที่ใช้สองบัญชีจะแยกไม่ได้ ต้องยัดรวมเป็นบัญชีเดียว

### 2. ลงบัญชีแยก "หมวด × คน"

`TransactionDetails.entity_id` (คอลัมน์มีอยู่แล้ว ไม่ต้อง migrate)
ปิดทริปหนึ่งครั้งยังเป็น **1 Transaction** เหมือนเดิม แต่บรรทัดย่อยแตกตามหมวด × คน

🔴 คิดจาก `TripExpenseParticipants` **รายคน** ไม่ใช่คูณสัดส่วนรวมทีเดียว
บิลที่หารไม่เท่ากันจะได้ยอดต่อคนที่ผิด ถ้าใช้สัดส่วนเฉลี่ย
⚠️ คนที่ `TRIP_ONLY` **ข้ามไปเลย** ไม่ใช่ลงเป็นยอด 0 — ยอดของเขาไม่ควรปรากฏ
ในสมุดบัญชีจริงในรูปแบบใดทั้งสิ้น

### 3. บัตรเครดิต (`TripWallets.kind = 'CREDIT'`) — กรอกยอดจริง **ทีละบิล**

🔴 **ไม่ผูกบัญชีเงินฝาก · ตอนปิดทริปต้องกรอกยอดบาทที่ถูกเรียกเก็บจริง
   ของ *ทุกบิล* ไม่กรอกครบ = ปิดทริปไม่ได้** (400 พร้อมบอกว่าขาดบิลไหนบ้าง)

🔴 **ทำไมต้องทีละบิล ไม่ใช่ยอดรวมต่อบัตร**
ธนาคารแปลงค่าเงิน *ทีละรายการ* ตามวันที่รูดจริง ไม่ใช่เรทเดียวทั้งบิล
ถ้ากรอกยอดรวมแล้วเฉลี่ยเรทให้ทุกบิล **ยอดรวมจะถูกก็จริง แต่ยอดรายหมวด
และรายคนจะเพี้ยน** — ค่าอาหารที่รูดวันเรทแย่กับค่าโรงแรมที่รูดวันเรทดี
จะถูกปรับให้เท่ากัน ซึ่งไม่ตรงกับความจริงทั้งคู่

ยอดที่กรอกเก็บไว้ที่ `TripExpenses.settled_thb` — เปิดทริปกลับมาปิดใหม่ไม่ต้องกรอกซ้ำ
`TripClosureLines.settled_thb` เก็บยอดรวมต่อกระเป๋าไว้ตรวจย้อน
⚠️ **ไม่คิดเป็นกำไร/ขาดทุนอัตราแลกเปลี่ยน** เพราะไม่เคยถือเงินสกุลนั้น
ส่วนต่างจากเรทประมาณการเป็นแค่ "การประมาณที่คลาดเคลื่อน" ไม่ใช่ผลกำไร
(ต่างจาก travel card / เงินสด ที่ถือเงินไว้จริงแล้วค่าเงินขยับ → เป็น FX จริง)

### 4. กำไร/ขาดทุนอัตราแลกเปลี่ยน — **Transaction คนละใบ + บัญชีของตัวเอง**

เดิมคำนวณไว้แต่ **ไม่เคยถูกลงสมุดบัญชี** — เงินหายจากบัญชีโดยไม่มีรายการรองรับ

ตอนนี้ต้องระบุ **ทั้ง `fx_account_id` และ `fx_category_id`** ไม่ครบ = ปิดไม่ได้

🔴 **ต้องเป็น Transaction คนละใบกับค่าใช้จ่าย** เพราะหนึ่ง Transaction ผูกได้บัญชีเดียว
และมันเป็นเหตุการณ์คนละอันจริง ๆ:
· ค่าใช้จ่าย = เงินออกจากบัญชีที่เติมเข้ากระเป๋า
· กำไร/ขาดทุน = ตอนแลกเงินที่เหลือกลับ เข้าบัญชีที่รับเงินคืน (อาจคนละใบ)

### 🔴 แยก **รายกระเป๋า** ห้ามรวมข้ามกระเป๋า (North 2026-08-23)

*"ค่าใช้จ่ายอาจรวมกันได้ แต่ผลต่างของจำนวนเงินของแต่ละกระเป๋ารวมกันไม่ได้
ไม่งั้นยอดของแต่ละกระเป๋าจะไม่ตรงความเป็นจริง"*

**หนึ่งกระเป๋าที่มีผลต่าง = หนึ่ง Transaction** พร้อมบัญชีของตัวเอง
บัญชีตั้งต้น = `TripWallets.account_id` ของกระเป๋าใบนั้น (เงินคืนกลับที่เดิม)
แก้ได้ตอนปิดผ่าน `lines[].fx_account_id` / `lines[].fx_category_id`

⚠️ ถ้ารวมเป็นก้อนเดียวแล้วลงบัญชีเดียว **ยอดคงเหลือของแต่ละบัญชีจะไม่ตรง
กับความจริง — และไม่มีอะไรฟ้อง เพราะยอดรวมทั้งครอบครัวยังถูก**
(มีเทสยืนยันว่ากระเป๋า A กำไร ฿40 เข้า ACC-1 · B ขาดทุน ฿100 เข้า ACC-2
ไม่ใช่ −฿60 ก้อนเดียว)

🔴 ห้ามเกลี่ยเข้าไปในค่าใช้จ่ายแต่ละหมวด — ถ้าเกลี่ย จะดูไม่ออกเลยว่าปีนี้
ขาดทุนค่าเงินไปเท่าไร และยอดหมวดอาหารจะเพี้ยนไปด้วยเหตุที่ไม่ใช่อาหาร
ถ้ามี FX แต่ไม่ระบุหมวด → **ปฏิเสธ** ไม่ใช่ยัดเข้าหมวดอื่น (ยัดเข้าหมวดไหนก็ผิดหมด)

## 🆕 รวมการเข้าใช้งานเข้ากับแถวสมาชิก (2026-08-23)

North ถามว่าการ์ด "ให้ผู้ร่วมทริปเข้าใช้งาน" เป็นแค่ช่องทางเข้าใช่ไหม
และคนที่มีบัญชีครอบครัวถอนสิทธิ์ไปก็ยังเข้าได้ใช่ไหม — **ถูกทั้งสองข้อ**

`passcode_hash` มีไว้ให้คนที่ **ไม่มี** บัญชีครอบครัวเข้าได้เท่านั้น
ระบบหาตัวตนจาก `TripMembers.user_id` ก่อนเสมอ → คนที่ผูกบัญชีไว้
**ถอนรหัสไปก็ยังเข้าได้เหมือนเดิม** ปุ่มนั้นสำหรับเขาจึงไม่มีผลอะไรเลย

### สิ่งที่แก้

- ตัดการ์ด "ให้ผู้ร่วมทริปเข้าใช้งาน" ทิ้ง — เหลือลิงก์อย่างเดียวไว้บนสุด
- ย้ายปุ่ม **ให้สิทธิ์เข้าใช้ / ตั้งรหัสใหม่ / ถอนสิทธิ์** มาไว้ในแถวสมาชิก
- แถวสมาชิกมีป้ายบอกสถานะ: `👤 บัญชีครอบครัว` · `🔑 มีรหัสแล้ว` · `— ยังเข้าไม่ได้`
- เพิ่ม `has_passcode` ใน payload (**ไม่ส่ง `passcode_hash` ออกไปเลย**
  หน้าจอต้องรู้แค่ว่าตั้งรหัสแล้วหรือยัง ไม่ควรได้เห็นค่า hash แม้จะแฮชแล้ว)

🔴 **คนที่ผูกบัญชีครอบครัวไว้ ไม่โชว์ปุ่มรหัสเลย** — ปุ่มที่กดแล้วไม่มีผล
คือปุ่มที่ทำให้คนไม่เชื่อปุ่มอื่นในหน้าเดียวกัน
🔴 **ห้ามมีรายชื่อสมาชิกสองชุดในหน้าเดียวอีก** — แก้คนละที่คือที่มาของความสับสน

⚠️ ยังไม่มีสิทธิ์ "ดูอย่างเดียว" — ทุกคนที่เข้ามาได้ จดค่าใช้จ่ายของตัวเองได้

## ยังไม่ได้ทำ

- **ยังไม่เคย git commit** — งานทั้งหมดตั้งแต่ `6a5fba4` อยู่บน Google Drive อย่างเดียว
- **ยังไม่เคยเปิดดูด้วยเบราว์เซอร์จริง** — สภาพแวดล้อมที่ทำงานไม่มีเบราว์เซอร์
  ตรวจได้แค่ syntax + ว่า id ที่ `app.js` เรียกมีอยู่จริงใน `index.html`

---

# 📍 สถานะ ณ 2026-08-18 — อ่านก่อนเริ่มงาน

**deploy ขึ้น production แล้วทั้ง backend และ frontend** · เทส **491 เคส ผ่านหมด**

```
node backend/test/session.test.mjs
node backend/test/auth.test.mjs
node backend/test/unified-trip-write.test.mjs
node backend/test/slice-engine.test.mjs
```

**คำสั่ง deploy — ใช้ `deploy.sh` เท่านั้น (รันจากที่ไหนก็ได้)**
```
bash "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/deploy.sh"
```

## 🔴 ทำไมต้องมี deploy.sh (2026-08-23)

คำสั่งสามบรรทัดเดิมต้อง `cd` เข้าโฟลเดอร์โปรเจกต์ก่อนเสมอ ซึ่งลืมกันบ่อยมาก
รันจาก `~` แล้วจะได้สามอาการที่ **ดูไม่ออกเลยว่าเกี่ยวกับ `cd`**:

| อาการที่เห็น | สาเหตุจริง |
|---|---|
| `bash: setup-db.sh: No such file or directory` | ไฟล์อยู่ที่ root ของโปรเจกต์ ไม่ใช่ `~` |
| `ENOENT: scandir '/Users/DNorth/frontend'` | `pages deploy frontend` อ้าง path แบบสัมพัทธ์ |
| `permission error … /Users/DNorth/.Trash` | ไม่เจอ `node_modules` → `npx` ไปโหลด wrangler ใหม่ แล้วชนเรื่องสิทธิ์ |

`deploy.sh` มี `cd "$(dirname "$0")"` อยู่บรรทัดแรก จึงเข้าโฟลเดอร์ตัวเองก่อนเสมอ
รันจากที่ไหนก็ได้ผลเหมือนกัน · ถ้าจะรันทีละคำสั่งเอง **ต้อง `cd` เข้าโปรเจกต์ก่อน**

## 🔴 `wrangler d1 execute --file` หยุดที่ error แรก — ห้ามใช้กับ migration

เจอจริง 2026-08-22 และเสียเวลาไปหลายรอบกว่าจะรู้ตัว

ไฟล์ migration ที่เขียนเป็น ALTER หลายบรรทัดแล้วค่อย `CREATE TABLE` ท้ายไฟล์
จะ **พังเงียบ ๆ** เมื่อ ALTER ตัวใดตัวหนึ่งชนว่า `duplicate column`
— บรรทัดหลังจากนั้นไม่เคยถูกรันเลย และ error ที่เห็นบอกแค่ "คอลัมน์ซ้ำ"
ซึ่งดูเหมือนไม่มีอะไรผิด คนอ่านจึงเข้าใจว่า "รันไปแล้ว" ทั้งที่ของครึ่งหลังหายไป

ผลที่เกิดจริง: `TripLegs` ไม่เคยถูกสร้าง · `TripMemberSessions` กับ
`TripMembers.passcode_hash` ไม่เคยถูกเพิ่ม → ระบบผู้ร่วมทริปใช้ไม่ได้มาตลอด
โดยไม่มีใครรู้ เพราะเทสใช้ schema จำลองที่มีคอลัมน์ครบอยู่แล้ว

**ให้ใช้ `setup-db.sh` แทน** — ยิงทีละคำสั่ง มองข้าม "ซ้ำ" เป็นเรื่องปกติ
รันซ้ำกี่รอบก็ปลอดภัย และพิมพ์รายการคอลัมน์/ตารางที่พบจริงออกมาให้ตรวจ
เพิ่ม migration ใหม่ = เติม `step "SQL" "ชื่อที่อ่านเข้าใจ"` ลงในสคริปต์นั้น

⚠️ อีกข้อ: D1 จำกัดจำนวนชั้น `UNION ALL` ในคำสั่งเดียว (ราว 5 ชั้น)
เกินกว่านั้นได้ `too many terms in compound SELECT` — แยกเป็นหลายคำสั่งสั้น ๆ

### ⏭️ สิ่งที่ยังไม่ได้ยืนยัน — ทำต่อจากตรงนี้
งาน 4 อย่างล่าสุดเขียนโดย **ไม่เคยเห็นหน้าจอจริงเรนเดอร์เลยสักครั้ง**
(สภาพแวดล้อมที่เขียนไม่มีเบราว์เซอร์ · เทสคุมได้แค่ตรรกะ ไม่ใช่หน้าตา)
ให้ขอภาพหน้าจอจาก North ก่อนทำอะไรต่อ:

1. การ์ด "กิจกรรมถัดไป" — ต้องเป็นสถานที่จริง ไม่ใช่ "Akanko Ainu Kotan · 14:30"
2. แถบใต้แบนเนอร์ — ต้องเป็นวันของทริปจริง ไม่ใช่ "DAY 03 · Lake Akan → Lake Kussharo"
3. "ใช้วันนี้" — เคยเป็น ฿0 เสมอ ต้องขึ้นยอดจริงแล้ว
4. ปุ่ม 🗺️ แผนที่จริง — Leaflet ยังไม่เคยถูกเรนเดอร์จริง **โอกาสเพี้ยนสูงสุดในบรรดา 4 ข้อ**
   (ขนาดกล่อง · ตำแหน่งป้ายชื่อบนหมุด · การวัดขนาดตอนกล่องยัง hidden)

### 🧭 วิธีทำงานกับ North
- คุยภาษาไทยทั้งหมด · North ไม่ใช่โปรแกรมเมอร์ และเป็นคนรันคำสั่งใน terminal เอง
- อย่าอธิบายยาว · ตอบสั้น ตรงประเด็น
- **ห้ามเดาจากอาการเวลาดีบัก** — query ค่าจริงในฐานก่อนเสมอ (เสียเวลาไปหลายรอบเพราะข้อนี้)
- ถ้าจะสร้างตาราง/คอลัมน์ใหม่ ให้เช็คก่อนว่ามีอยู่แล้วไหม (`TripDocuments` เคยชนชื่อกับของเดิม)

---

# 🆕 สิ่งที่เปลี่ยนไประหว่าง 2026-08-07 → 08-11 (อ่านก่อนส่วนเก่า)

ส่วนด้านล่างที่ลงวันที่ 2026-07-28 ยังใช้ได้เป็นส่วนใหญ่ แต่ข้อมูลบางอย่างล้าสมัยแล้ว
หัวข้อนี้คือของใหม่ทั้งหมด · เทสตอนนี้ **491 เคส ผ่านหมด** (ดูคำสั่งรันในหมวด "สถานะ" ด้านบน)

## A. รายการค่าใช้จ่ายย่อยประจำทริป — `TripExpensePresets`

**แนวคิดสำคัญที่สุดของรอบนี้** ก่อนหน้านี้เคยทำ "ไอคอนต่อหมวดบัญชี" ซึ่งผิด — ถูกรื้อทิ้งแล้ว

โครงที่ถูกต้องมีสองชั้น:

- `Categories` = ผังบัญชีระดับ **ครอบครัว** ใช้ร่วมทุกทริป (ของเดิม ไม่แตะ)
- `TripExpensePresets` = ปุ่มที่ผู้ใช้ตั้งเอง ระดับ **ทริป** — มีชื่อกับไอคอนของตัวเอง แล้วชี้ไป `category_id` หนึ่งหมวด

หลายรายการชี้หมวดเดียวกันได้ เช่น ราเมง/ขนม/เครื่องดื่ม → หมวด "อาหาร" ทั้งหมด
และแต่ละทริปมีชุดของตัวเอง (Hokkaido กับ Beijing ไม่ปนกัน)

⚠️ **บิลอ้าง `TripExpenseCategories.preset_id` ไม่ได้ก๊อปชื่อ/ไอคอนไปเก็บ**
ตอนอ่านกลับ เซิร์ฟเวอร์เติม label/icon สดจาก preset ปัจจุบัน — แก้ชื่อหรือไอคอนทีเดียว
บิลเก่าทุกใบในทริปเปลี่ยนตามทันที **ห้ามเปลี่ยนกลับไปเก็บค่าตายตัว** เพราะจะเสียคุณสมบัตินี้ไป
ลบ preset แล้วบิลเก่ายังอยู่ครบ (คลาย `preset_id` แล้วคง `label` เดิมไว้เป็นข้อความ)

ฟอร์มจดบิลในโหมดข้อมูลจริงเลือกจาก preset ช่องเดียว (หมวดบัญชีผูกมาในตัวแล้ว)
โหมดตัวอย่างยังใช้รายชื่อหมวดตายตัวเหมือนเดิม

- SQL: `add_trip_expense_presets.sql` (รันแล้ว)
- API: `POST/DELETE /api/unified-trip/presets` · GET มากับ payload หลัก (`payload.presets`)
- UI: หน้า "เพิ่มเติม" → การ์ด "รายการค่าใช้จ่ายในทริปนี้"

**คัดลอกจากทริปอื่น** (`POST /presets/copy`) — ทริปใหม่เริ่มจากศูนย์แปลว่าจดบิลไม่ได้เลย
จึงมีปุ่ม "คัดลอกจากทริปอื่น" ดึงทั้งชุดมาจากทริปในครอบครัวเดียวกัน
คัดลอกแล้วเป็น **คนละแถว** (แก้/ลบไม่กระทบต้นทาง) และข้ามชื่อที่ซ้ำ จึงกดซ้ำได้ไม่เกิดของซ้ำซ้อน

## B. ธีมสีเลือกได้ต่อทริป — `Projects.theme_id` + `themes.css`

`themes.css` แบ่งเป็นสองส่วน **ห้ามปนกัน**:
1. บล็อก `[data-theme="…"]` มีแต่ตัวแปรสี ไม่มีกฎ layout
2. กฎหน้าตาแบบ kawaii เขียนครั้งเดียว อ้างตัวแปรล้วน ๆ

**เพิ่มธีมใหม่ = แก้ 3 ที่ ไม่ต้องแตะฐานข้อมูล**
1. บล็อกตัวแปรใน `themes.css`
2. `TRIP_THEMES` ใน `backend/src/unified-trip.js` (กันค่ามั่ว)
3. `TRIP_THEMES` ใน `frontend/trip-unified-prototype/app.js` (ชื่อ+แถบสีตัวอย่าง)

ปัจจุบันมี `hokkaido` (ฟ้าน้ำแข็ง/ทอง) กับ `sakura` (ชมพู/ม่วง/เขียว) · ค่าว่าง = ใช้ hokkaido
ธีมตั้งที่ `<html data-theme>` ไม่ใช่ `<body>` เพื่อให้พื้นหลังไล่สีกินเต็มจอ

⚠️ **ทุกคู่สีผ่าน WCAG AA แล้ว** — เพิ่มธีมใหม่ต้องเช็กด้วย โดยเฉพาะตัวอักษรขาวบนพื้นสีเต็ม
สีสดอย่างเดียวไม่พอ (ชมพู/เขียวสดกับขาวได้แค่ ~2-3:1) จึงมี `--warm-deep` / `--fresh-deep`
ไว้ใช้เฉพาะกรณีนั้น และไล่สีทุกอันต้องจบที่เฉดเข้ม ไม่ใช่เฉดอ่อน

- SQL: `add_trip_theme.sql` (รันแล้ว)

## C. อัปโหลดรูปเองได้ — `TripAssets` (ไม่ต้องมี R2)

บัญชี Cloudflare นี้ **ยังไม่ได้เปิดใช้ R2** (ต้องเปิดผ่าน Dashboard เท่านั้น)
โค้ดจึงรองรับสองทาง: มี `env.ICONS` (R2) ก็ใช้ R2 · ไม่มีก็เก็บไบต์ลง D1 ตาราง `TripAssets`
ถ้าวันหลังเปิด R2 ระบบสลับไปเองอัตโนมัติ รูปเก่าในD1 ยังเปิดได้ตามปกติ

- `POST /api/unified-trip/icon-upload` (multipart field `file`) → คืน URL สั้น
- `GET /api/unified-trip/icon/{key}` — **ไม่ต้องล็อกอิน** เพราะ `<img src>` แนบ Authorization ไม่ได้
  คีย์ขึ้นต้น `db/` = อ่านจาก D1 · อย่างอื่น = อ่านจาก R2
- เพดาน: R2 3 MB · D1 700 KB (D1 เป็นฐานข้อมูล ไม่ใช่ที่เก็บไฟล์ แถวใหญ่ทำให้ทั้งฐานช้า)
- SQL: `add_trip_assets.sql` (รันแล้ว)

⚠️ `Projects.theme_banner` **ไม่รับ `data:` URL** (ยาวเป็นแสนตัวอักษร ทำให้แถวบวม)
รูปที่อัปโหลดต้องผ่าน `/icon-upload` ก่อน แล้วเก็บ URL สั้นที่ได้

## C2. เอกสารประจำทริป — `TripDocuments` (2026-08-11)

🔴 **ใช้ตาราง `TripDocuments` ที่มีอยู่เดิม ไม่ได้สร้างใหม่** — แอปหลัก
(`backend/src/index.js` → `/api/trips/documents`) ใช้ตารางเดียวกันนี้อยู่แล้ว
เอกสารจึงเป็นชุดเดียวกันทั้งสองแอป

⚠️ บทเรียน: ครั้งแรกผมเขียน `CREATE TABLE IF NOT EXISTS TripDocuments` ใหม่ทับ
โดยไม่ตรวจว่ามีอยู่แล้ว · `IF NOT EXISTS` ทำให้ผ่านไปเงียบ ๆ แล้วไปพังที่
`CREATE INDEX` (`no such column: stop_id`) — **ก่อนตั้งชื่อตารางใหม่ ให้ grep
ทั้งโปรเจกต์ก่อนเสมอ** โดยเฉพาะ `backup-before-trip-finance.sql` ซึ่งเป็น
ภาพถ่ายของฐาน production จริง

ชื่อคอลัมน์เดิมไม่ตรงกับที่หน้าทริปใช้ จึงแปลงชื่อใน SQL ตอน GET ทีเดียว:
`document_id→doc_id` · `related_entity_id→stop_id` · `description→name` · `file_url→url`
(`related_entity_id` เก็บได้ทั้ง stop_id และ trip_expense_id — join กับ TripStops
จึงคืน `stop_name` เฉพาะอันที่เป็นจุดแวะจริง)

`add_trip_documents.sql` เติมแค่ 3 คอลัมน์: `kind` · `content_type` · `size_bytes`
เอกสารเก่าที่ไม่มี `kind` ถือเป็น `link` โดยอัตโนมัติ (มีเทสครอบ)

ผูกกับ **จุดแวะ** เป็นหลัก · เว้นว่าง = เอกสารระดับทริป (เช่นประกันทั้งทริป)

เก็บได้สองแบบในตารางเดียว ต่างกันที่คอลัมน์ `kind`:
- `file` = อัปโหลดเข้าระบบ (R2) · url ชี้ไป `/api/unified-trip/icon/…`
- `link` = ลิงก์ภายนอก เช่น Google Drive · ระบบไม่ได้ถือไฟล์เอง

⚠️ **URL รับเฉพาะ `http(s)://`** — ปฏิเสธ `javascript:` และ `data:` เพราะลิงก์นี้
ถูกเอาไปใส่ `href` ให้สมาชิกคนอื่นในทริปกด (มีเทสครอบไว้แล้ว ห้ามผ่อนกฎนี้)
ฝั่งหน้าจอใช้ `rel="noopener noreferrer"` ด้วยเหตุผลเดียวกัน

⚠️ **ลบเอกสาร = ลบแค่แถวในฐาน ไม่ลบไฟล์บน R2** — ไฟล์เดียวอาจถูกอ้างจากหลายที่
ลบทิ้งเลยจะทำให้อีกที่พังเงียบ ๆ · R2 ฟรี 10 GB ไม่คุ้มเสี่ยงเพื่อประหยัดพื้นที่

**ลบจุดแวะแล้วเอกสารไม่หายตาม** (มีเทสยืนยัน) — กลายเป็นเอกสารระดับทริปแทน

- SQL: `add_trip_documents.sql`
- API: `POST/DELETE /api/unified-trip/documents` · GET มากับ payload (`payload.documents` พร้อม `stop_name`)
- UI: ฟอร์มแก้สถานที่ (แนบ/ดู) · การ์ด "คลังเอกสาร" ในหน้าเพิ่มเติม (จัดกลุ่มตามสถานที่) · ป้าย 📎 ในรายการแผน
- อัปโหลด PDF ใช้ทางเดียวกับรูป (`/icon-upload`) เพดาน 15 MB เมื่อมี R2

## C3. ผู้ร่วมทริปเข้าใช้งานด้วยรหัสของตัวเอง (2026-08-11)

Puii/XinXin เข้าได้โดย **ไม่ต้องมีบัญชีของระบบบัญชีครอบครัว** — ผู้ดูแลตั้งรหัส
รายคน แล้วส่งลิงก์ `join.html?projectId=…` ให้

🔴 **ไม่ใช้ `Projects.trip_password` เดิม** (ยังอยู่ในฐาน แต่ระบบใหม่ไม่แตะ) เพราะ
เก็บรหัสเป็นข้อความธรรมดา · ใช้รหัสเดียวทั้งทริป (เพิกถอนทีละคนไม่ได้) · ไม่ออก token

**โครงสร้าง**
- `TripMembers.passcode_hash` — PBKDF2 ผ่าน `auth.js` · ว่าง = คนนั้นเข้าไม่ได้
- `TripMemberSessions` — **แยกจากตาราง `Sessions` ของระบบครอบครัวโดยตั้งใจ**
  คนละระดับสิทธิ์ ถ้าปนกันจะมีวันที่ token ผู้ร่วมทริปหลุดผ่านด่านของสมาชิกครอบครัว
- token เก็บเป็น SHA-256 · ผูกกับ **ทริปเดียว + สมาชิกคนเดียว** ใช้ข้ามทริปไม่ได้
- ฝั่ง localStorage เก็บคีย์ `trip_member_token` **คนละคีย์กับ `session_token`**
  ไม่งั้นการเข้าด้วยรหัสผู้ร่วมทริปจะไปเตะสมาชิกครอบครัวออกจากเครื่องเดียวกัน

**สิทธิ์ — เขียนเป็น allow-list ห้ามเปลี่ยนเป็น deny-list**
```js
if (ctx.guest && request.method !== 'GET') {
  const GUEST_WRITABLE = ['/expenses'];   // ← เพิ่ม endpoint ใหม่ต้องมาเติมที่นี่
```
endpoint ใหม่จะถูกห้ามอัตโนมัติ บังคับให้คิดเรื่องสิทธิ์ทุกครั้ง ถ้าเป็น deny-list
จะมีวันที่ลืมแล้วเปิดช่องโดยไม่รู้ตัว · `is_admin` ถูกบังคับเป็น 0 เสมอสำหรับ guest
แม้สมาชิกคนนั้นจะเป็น admin ของทริปก็ตาม

**ถอนสิทธิ์/เปลี่ยนรหัส = ลบ session เดิมทิ้งทันที** ไม่งั้นคนที่ล็อกอินค้างยังใช้ได้อีก 30 วัน

⚠️ **บั๊กที่เทสจับได้ ห้ามพลาดซ้ำ**: `verifyPassword()` คืน `{ ok, needsUpgrade }`
**ไม่ใช่ boolean** — เขียน `if (!await verifyPassword(...))` แล้ว object เป็นจริงเสมอ
→ **รหัสผิดก็เข้าได้ทุกครั้ง** ต้องอ่าน `.ok` เท่านั้น

- SQL: `add_trip_member_access.sql`
- API: `GET/POST /members/login` (ไม่ต้องล็อกอิน) · `POST /members/passcode` (admin)
- UI: `join.html` + `join.js` · การ์ด "ให้ผู้ร่วมทริปเข้าใช้งาน" ในหน้าเพิ่มเติม
- เทสความปลอดภัย 33 เคสในหมวดท้ายไฟล์เทส — **อย่าลบ** ทุกเคสที่ขึ้นต้น ⚠️ คือ
  "สิ่งที่ต้องทำไม่ได้"

### ⚠️ ตัวโหลดเทสกับ import
เทสโหลด `unified-trip.js` ผ่าน data: URL ซึ่ง resolve `import './auth.js'` ไม่ได้
และเปลี่ยนเป็น file:// ก็ไม่ผ่านเพราะ `backend/package.json` เป็น commonjs
ตัวโหลดจึงฝังไฟล์ที่ถูก import เป็น data: URL ซ้อนอีกชั้น (ดูหัวไฟล์เทส)
**ถ้า auth.js เริ่มมี import ของตัวเองเมื่อไหร่ ต้องทำให้เป็น recursive**
อาการเวลาพัง: เทสพ่น base64 ของซอร์สออกมาแทน error ที่อ่านออก

## C4. อากาศจริง + แผนที่จริง (2026-08-17)

### พยากรณ์อากาศ — Open-Meteo
เลือกเจ้านี้เพราะ **ฟรี ไม่ต้องใช้ API key ไม่ต้องผูกบัตร** โควตา 10,000 ครั้ง/วัน
(AccuWeather ฟรี 50 ครั้ง/วัน แต่ต้องเรียก Locations API ก่อนทุกครั้ง = เหลือจริง ~25 จุด/วัน
Google Weather API ฟรี 10,000/เดือน แต่ต้องมี Google Cloud billing ผูกบัตร)

เป็นโมเดลแบบ **กริดทั่วโลก ไม่ใช่รายชื่อสถานี** — หมู่บ้านเล็ก ๆ ที่ไม่มีสถานีตรวจอากาศ
ก็ได้ค่า จึงไม่ต้องมีตรรกะ "ถ้าไม่มีเมืองนี้ให้ใช้เมืองใกล้เคียง" · จุดที่พังได้จริงคือ
**หาพิกัดจากชื่อไม่เจอ** (geocoding) ไม่ใช่ "ไม่มีข้อมูลอากาศของเมืองนั้น"

🔴 **`kind: 'forecast'` กับ `'historical'` ห้ามแสดงปนกัน** — Open-Meteo พยากรณ์ล่วงหน้า
ได้ ~16 วัน วันที่ไกลกว่านั้นระบบถอยไปใช้ **ค่าเฉลี่ยของช่วงเดียวกันปีก่อน** ซึ่ง
**ไม่ใช่พยากรณ์** ถ้าคนอ่านสลับกันแล้วไปจัดกระเป๋าตามนั้นจะเสียหายจริง ป้ายบนจอจึงเขียน
ตรง ๆ ว่า "⚠️ ไม่ใช่พยากรณ์" พร้อมปีอ้างอิง ไม่ใช่ดอกจันตัวเล็ก
- API: `GET /api/unified-trip/weather?date=YYYY-MM-DD`
- แคชผลตามวันไว้ใน `weatherCache` (Map) ฝั่งหน้าจอ — สลับแท็บไปมาไม่ยิงซ้ำ
- บริการล่ม → ตอบ `available:false` **ไม่ใช่ 500** ทั้งหน้าจะได้ไม่พังเพราะการ์ดใบเดียว

### แผนที่จริง — Leaflet + OpenStreetMap
ของเดิมคือ **ภาพวาดฮอกไกโดที่ฝังหมุด 11 จุดเป็นพิกัด SVG ตายตัวใน index.html**
ทริปปักกิ่งจึงเห็นหมุด Sapporo/Otaru ทับภาพตัวเอง และสถานที่ที่เพิ่มใหม่ไม่มีหมุดเลย
ตอนนี้วาดจาก `TripStops.latitude/longitude` จริง (ปุ่ม 🗺️ สลับกับภาพแบนเนอร์ · จำค่าไว้ใน
`localStorage['unified-trip-mapview']`) · **ภาพวาดกับ SVG เดิมยังอยู่ ไม่ได้ลบ**

- Leaflet โหลดจาก CDN แบบ lazy ตอนกดครั้งแรก — ไม่กดก็ไม่โหลด
- `GET /api/unified-trip/geocode-stops?offset=N` เติมพิกัดครั้งละ `GEOCODE_BATCH` = 12 จุด
  (เพดาน subrequest ของ Worker) · คืน `{filled, failed, scanned, remaining}`
- 🔴 **`offset` ต้องสะสมจาก `failed` ไม่ใช่ `scanned`** — จุดที่ค้นชื่อไม่เจอจะไม่มีพิกัด
  จึงค้างอยู่หัวคิวตลอด ถ้าไม่ข้ามมัน จุดท้ายคิวที่ค้นได้จะไม่มีวันถูกเรียกถึง
  ทริปที่มีสถานที่ชื่อแปลก 12 จุดจะได้แผนที่ว่างเปล่าตลอดกาล (มีเทสคุมเคสนี้)
- จุดที่ค้นไม่เจอเก็บเป็น **NULL ไม่ใช่ 0,0** — 0,0 คือกลางอ่าวกินี จะดึงกรอบแผนที่เพี้ยนทั้งทริป
- ⚠️ `drawTripMap` มีธง `mapDrawing` กันเรียกซ้อน: drawTripMap → fillMissingCoords →
  refreshFromServer → applyLiveState → refreshTripMap → drawTripMap … วนไม่จบ
- ⚠️ ป้ายเตือนบนแผนที่ต้องแปะที่ `.map-hero` **ไม่ใช่ในกล่อง `#tripMap`** เพราะ pane ของ
  Leaflet ใช้ z-index 400+ ป้ายที่วางข้างในจะถูกแผนที่ทับจนมองไม่เห็น
- ⚠️ เปิดครั้งแรกตอนกล่องยัง `hidden` Leaflet วัดขนาดได้ 0×0 → ต้อง `invalidateSize()` หลังโชว์
- ระยะทางที่แสดงทุกที่คือ **เส้นตรง (haversine)** ไม่ใช่ระยะขับ — ขับจริงมักไกลกว่า 20–40%
  ป้ายจึงต้องเขียนว่า "วัดเส้นตรง" เสมอ ไม่งั้นคนคำนวณเวลาออกเดินทางผิด
- `/geocode-stops` เป็น GET ผู้ร่วมทริป (guest) จึงเรียกได้ ไม่ต้องรอผู้ดูแล — ตั้งใจให้เป็นแบบนั้น

## C5. ตัดภาพรวมหลายไอคอนเป็นไฟล์แยก (2026-08-17)

Gemini/ChatGPT สร้างไอคอนออกมาเป็น **แผ่นเดียวมีหลายชิ้นเรียงกัน** ถ้าให้ผู้ใช้ไป
ครอปเองทีละชิ้น ชุด 12 ไอคอน = 12 รอบ · ระบบจึงหาช่องว่างระหว่างชิ้นแล้วตัดให้

- ตรรกะอยู่ใน **`frontend/trip-unified-prototype/slice-engine.js`** (ไม่แตะ DOM)
  แยกไฟล์เพื่อให้เทสได้จริง → `backend/test/slice-engine.test.mjs` (31 เคส)
- อัปโหลดรูปในกล่องเลือกไอคอน → ถ้าแยกได้ ≥ 2 ชิ้น เด้งเข้าหน้าตัดอัตโนมัติ
  (แบนเนอร์ข้ามไป มันเป็นภาพเต็มกรอบใบเดียว) · มีปุ่ม "ใช้ทั้งภาพเป็นไอคอนเดียว" ถอยได้
- **วิธี**: ฉายจำนวนพิกเซลที่ไม่ใช่พื้นหลังลงแกน x/y (projection profile)
  ชิ้น = แถบแนวตั้ง × แถบแนวนอน แล้ว `trimBox` ตัดขอบว่างของแต่ละชิ้นอีกที

**ทดสอบกับภาพจริงของ North แล้ว (10 แผ่น 2026-08-17)** — 9 แผ่นได้ครบ 9 ชิ้น
แผ่นกระเป๋าตังค์ได้ 6 ชิ้น รวม 87 ไอคอน ตัดถูกทุกชิ้น ใช้เวลาแผ่นละ ~15 ms

🔴 **สามกับดักที่เทสจับได้ตอนเขียน — อย่าแก้กลับ**
1. **ห้ามเดาพื้นหลังจาก 4 มุมแล้วเฉลี่ย** ภาพจาก AI มักมีกรอบเส้นบางรอบผืน
   มุมทั้งสี่เป็นสีกรอบ → ระบบคิดว่าพื้นหลังคือสีกรอบ → พื้นขาวข้างในกลายเป็น
   "เนื้อหา" ทั้งหมด → ทั้งแผ่นถูกตัดเป็นชิ้นเดียว
   ตอนนี้เก็บตัวอย่างเป็นวงรอบขอบ (เว้นเข้ามา 3%) แล้วใช้ **สีที่พบบ่อยที่สุด**
2. **เกณฑ์กรองสัญญาณรบกวนต้องไม่ต่ำกว่า 3** เส้นกรอบบน+ล่างให้ค่าพอดี 2
   ทุกคอลัมน์ ถ้าเกณฑ์เป็น 2 จะไม่มีคอลัมน์ไหนเป็นศูนย์ → รวมเป็นชิ้นเดียวอีก
   และการฉายทำ **สองรอบ** (หาคอลัมน์ก่อน → นับแถวเฉพาะคอลัมน์ที่รอด → ย้อนกลับ)
   เพื่อไม่ให้เส้นกรอบแนวตั้งไปปนเปื้อนโปรไฟล์ของแถว
3. **เส้นตารางคั่นช่อง** (เจอในแผ่นกระเป๋าตังค์จริง) ทำให้ได้ 1 ชิ้นแทน 6
   แก้ด้วย `wipeSeparators()` ที่ลบเฉพาะเส้นที่ **พาดเกือบตลอดแกน (≥90%) และบาง (≤1%)**
   ⚠️ **ห้ามแก้ด้วยการยกเกณฑ์กรองให้สูงขึ้น** — เกณฑ์ที่สูงพอจะฆ่าเส้นคั่น ก็สูงพอ
   จะตัดส่วนผอมของตัวไอคอนเอง (ก้านช้อน ขาแก้วเบียร์) แล้วหั่นไอคอนเป็นสองชิ้นตรงเอว
   มีเทส "ไอคอนคอผอม (ขาแก้ว 8 px) ไม่ถูกหั่นกลางตัว" เฝ้าจุดนี้ไว้

**ข้อจำกัดที่รู้อยู่ (มีเทสคุมไว้ว่าเป็นแบบนี้จริง)**
- ไอคอนติดกันสนิทไม่มีช่องว่าง → รวมเป็นชิ้นเดียว ต้องใช้โหมด **ตัดเป็นตาราง แถว×คอลัมน์**
- แผ่นที่มี **ชื่อกำกับใต้ไอคอน** → ตัวหนังสือกลายเป็นชิ้นแยก (ได้ชิ้นเป็นสองเท่า)
  จึงต้องมีหน้าให้เลือกทีละชิ้น **ห้ามเปลี่ยนเป็นเพิ่มทั้งหมดอัตโนมัติ**
- ลบพื้นหลังใช้ไล่ระดับ alpha ในช่วง `BG_THRESHOLD`…×2 ไม่ใช่ตัดขาดที่ค่าเดียว
  ตัดขาดจะได้ขอบหยักเป็นฟันเลื่อยเพราะขอบไอคอนถูก anti-alias มา
- อัปโหลดเรียงตัวทีละชิ้น **ห้ามยิงพร้อมกัน** — 12 คำขอพร้อมกันเสี่ยงโดนจำกัดอัตรา
  แล้วบางชิ้นหายเงียบ · ชิ้นที่อัปโหลดไม่สำเร็จจะไม่ถูกใส่เข้าคลัง และบอกเลขชิ้นที่พลาด

## C6. คลังไอคอนของ North + แถบสรุปวันตามข้อมูลจริง (2026-08-18)

**คลังไอคอน 93 ชิ้น** อยู่ใน `frontend/trip-unified-prototype/art/gen/` (WebP รวม 1.9 MB)
ตัดจากแผ่นรวมที่ North สร้างด้วย Gemini/ChatGPT โดยใช้ `slice-engine.js` ตัวเดียวกับในแอป
ลบพื้นขาวเป็นโปร่งใส · ย่อพอดีสเปกของแต่ละหมวด (`assetSpecs`)
ประกาศเป็น `GEN` / `GEN_WALLET2` ใน app.js แล้วกระจายเข้า `assetLibrary` ด้วย spread
→ **ผู้ใช้ไม่ต้องอัปโหลดเอง** ค่าใช้จ่าย 36 · สถานที่ 36 · กระเป๋าเงิน 12 · สกุลเงิน 9

จะเพิ่มชุดใหม่: ตัดไฟล์ลง `art/gen/` แล้วเติมรายการใน `GEN` — ไม่ต้องแตะฐานข้อมูล

**🔴 `journeyStops` ในโหมดข้อมูลจริง**
เดิมโหมดข้อมูลจริงใช้ตาราง `journeyStops` ของข้อมูลตัวอย่าง (11 หมุดบนภาพวาดฮอกไกโด)
ต่อไปทั้งดุ้น ผลคือ:
- แถบใต้แบนเนอร์เขียน "DAY 03 · Lake Akan → Lake Kussharo" ทุกทริป
- **"ใช้วันนี้" เป็น ฿0 เสมอ** เพราะ `dayId = 'day3'` ไม่มีอยู่ใน `planDays` จริง
  → หา activity ของวันไม่เจอ → กรองบิลออกหมด → ตัวเลขผิดเงียบ ๆ ไม่มี error

`buildLiveJourney()` สร้างตารางใหม่จากวันจริง และหา "วันนี้" จากวันที่จริง
ไม่ใช่ `actualJourneyIndex = 1` ที่ฝังไว้ · ต้องเรียก **ก่อน** `renderMoneyStrip()`
⚠️ `journeyStops` กับ `actualJourneyIndex` เป็น `let` แล้ว ห้ามเปลี่ยนกลับเป็น `const`
⚠️ จำนวนหมุด SVG (11) ไม่เท่ากับจำนวนวันจริงอีกต่อไป โค้ดที่ไล่หมุดต้องเช็คก่อนเสมอ
   และหมุดจะถูกซ่อนอัตโนมัติถ้าแบนเนอร์ไม่ใช่ภาพวาดฮอกไกโดที่มากับระบบ

**🔴 การ์ด "กิจกรรมถัดไป" ก็เคยเป็นข้อความตายตัวใน index.html เหมือนกัน**
ทุกทริปเห็น "14:30 · Akanko Ainu Kotan · ออกในอีก 35 นาที" ทั้งที่เป็นการ์ดเด่นที่สุด
บนหน้าแรก · `renderNextActivity()` เขียนให้แล้ว เรียกจากท้าย `renderJourneyPreview()`
- "ถัดไป" ตัดสินจาก **นาฬิกาจริงเทียบเวลาในแผน** ไม่ใช่กิจกรรมแรกของวัน
  เลยเวลาหมดแล้วต้องขึ้น "วันนี้เดินทางครบแล้ว" ไม่ใช่วนกลับไปโชว์อันแรก
  ซึ่งเท่ากับบอกให้ไปที่ที่ไปมาแล้วเมื่อเช้า
- ดูวันที่ไม่ใช่วันนี้จริง → นาฬิกาไม่เกี่ยว โชว์กิจกรรมแรกแล้วเขียนหัวว่า "แผนของวันที่ N"
- ปุ่ม "เปิดเส้นทาง" ใช้ **พิกัด** ไม่ใช่ชื่อ (ชื่อไทยค้นในกูเกิลแมปที่ญี่ปุ่นมักไม่เจอ)
  ไม่มีพิกัด = ปุ่มถูกปิด

**บทเรียนรวมของหมวดนี้**: ข้อมูลตัวอย่างที่ฝังไว้ใน HTML/JS แล้วไม่มีใครเขียนทับ
คือบั๊กที่อันตรายที่สุดในแอปนี้ — ไม่มี error ไม่มีช่องว่าง คนอ่านแล้วเชื่อว่าเป็นของจริง
เจอมาแล้ว 4 จุด (แถบสรุปวัน · ใช้วันนี้ · หมุดแผนที่ · กิจกรรมถัดไป)
**เพิ่มอะไรใหม่บนหน้าจอ ให้ถามทุกครั้งว่า "โหมดข้อมูลจริงมีใครเขียนทับค่านี้ไหม"**

## C7. หน้าแผนเที่ยวใหม่ + ระยะขับจริง + งบต่อจุด (2026-08-20)

ทำตาม mockup ที่ North ส่งมา · **SQL: `add_plan_costs_and_legs.sql`**

**🔴 บั๊กที่เจอระหว่างทำ — "ใช้วันนี้" เป็น ฿0 มาตลอด**
`TripExpenses` ไม่เคยมีคอลัมน์ `stop_id` และ `api.js` ส่ง `activityId: null` ตายตัว
โค้ดที่กรอง `todayActivityIds.includes(bill.activityId)` จึงไม่เคยเจออะไรเลย
(เคยแก้เรื่อง "หาวันนี้ผิด" ไปรอบหนึ่งแล้วรายงานว่าจบ ทั้งที่ยังไม่จบ — ต้นเหตุจริงอยู่ลึกกว่านั้น)
ตอนนี้นับสองทาง: บิลที่ผูก `stop_id` ของวันนั้น **หรือ** บิลที่ `expense_date` ตรงกับวันนั้น
วันที่เชื่อถือได้เสมอ ส่วนการผูกจุดเป็นของเสริมที่คนอาจไม่กรอก

**งบต่อจุด — `TripStops.planned_cost` / `planned_currency`**
⚠️ `null` (ไม่ได้ตั้งงบ) กับ `0` (ตั้งใจว่าไม่เสียเงิน) **ต้องต่างกัน** ห้ามยุบเป็นค่าเดียว
ฝั่ง API: `planned_cost: ''` = ล้างงบทิ้ง · `undefined` = ไม่แตะของเดิม
ถ้าเผลอส่ง `''` แทน `undefined` การกดบันทึกเฉย ๆ จะไปล้างงบที่ตั้งไว้
ช่อง `#activityCost` มีในฟอร์มมานานแล้วแต่ **ไม่เคยถูกบันทึกที่ไหนเลย** — ตอนนี้ลงฐานจริง

**ระยะ/เวลาขับจริง — OSRM (`GET /api/unified-trip/route`)**
- `https://router.project-osrm.org` ฟรี ไม่ต้องใช้ key **แต่เป็นเซิร์ฟเวอร์สาธารณะ ไม่มี SLA**
- แคชลง `TripLegs` (คีย์ = คู่จุด) ยิงได้ครั้งละ `LEG_BATCH` = 10 คู่ ตามเพดาน subrequest ของ Worker
- 🔴 **`source` ต้องติดไปกับข้อมูลเสมอ**: `'osrm'` = ระยะขับจริง · `'straight'` = OSRM ตอบไม่ได้
  จึงประมาณจากเส้นตรง ×1.3 ที่ 45 กม./ชม. · หน้าจอต้องเขียน "(ประมาณ)" กำกับ
  **ห้ามโชว์ค่าประมาณเป็นค่าจริง** คนใช้ตัวเลขนี้ตัดสินใจว่าจะออกเดินทางกี่โมง
- ต่อเฉพาะคู่จุดที่อยู่ **วันเดียวกัน** — ข้ามวันไม่ใช่การขับต่อเนื่อง (มีเทสคุม)

**หน้าแผนเที่ยว** — แถบวันแบบการ์ด (`Day 01 / 4 จุด · 24 ก.ค.`) + ปุ่มเพิ่มวัน ·
การ์ดสรุปวันสีครีมพร้อมชื่อแผน เส้นทาง และชิปสรุป (จุด/เวลา/ระยะขับ/อากาศ/เอกสาร) ·
ไทม์ไลน์ที่มีเวลา+ระยะเวลาที่อยู่ ป้ายกำกับ (จุดเริ่มต้น/ที่พัก/ของเด็ด/งบ/ใช้/เอกสาร) ·
ป้ายระยะทางคั่นระหว่างการ์ด · แถบแผนสำรองจากจุดที่ถูกข้าม

⚠️ **"วัน" ไม่มีตารางของตัวเอง** — เกิดจากวันที่ของจุดแวะ ปุ่ม "เพิ่มวัน" จึงเป็นแค่การเพิ่ม
ตัวเลือก `new:YYYY-MM-DD` ในฟอร์มชั่วคราว วันจะมีจริงเมื่อบันทึกจุดแรกของวันนั้น
(ถ้าสร้างวันเปล่าไว้ก่อนจะได้วันร้างที่ลบไม่ได้)

## D. กับดักที่เสียเวลาไปมาก — อ่านก่อนแก้เรื่องรูป

**1. `bannerPath()` ใน api.js เติม `../` ผิดชั้น**
คลังรูปของหน้าทริปอยู่ที่ `frontend/trip-unified-prototype/art/` และเก็บใน DB เป็น `art/xxx.png`
เดิมโค้ดเติม `../` ให้ทุก path ที่ไม่ใช่ URL เต็ม → กลายเป็น `../art/xxx.png` ซึ่งไม่มีอยู่จริง
อาการหลอกมาก: เลือกรูปแล้วเห็นปกติ (ใช้ path ดิบ) แต่พอรีเฟรชรูปหาย ดูเหมือนบันทึกไม่ติด
ทั้งที่ค่าในฐานถูกต้องตลอด · แก้แล้วโดยยกเว้น path ที่ขึ้นต้น `art/`

**2. Safari เข้ารหัส WebP ผ่าน canvas ไม่ได้**
`canvas.toBlob(cb,'image/webp')` บน Safari จะถอยไปใช้ PNG **เงียบ ๆ ไม่มี error**
แบนเนอร์ 1920×810 เป็น PNG โตหลาย MB เกินเพดาน → อัปโหลดถูกปฏิเสธ
`normaliseUpload()` จึงต้องตรวจ `blob.type` ที่ได้จริง ไม่ใช่เชื่อว่าได้ตามที่ขอ แล้วถอยไป JPEG

**3. อ่านแบนเนอร์ต้องเอา `theme_banner` ก่อน `banner_url`**
`banner_url` เป็นคอลัมน์เก่าที่ไม่มีอะไรเขียนแล้ว ถ้าเรียงสลับจะบังค่าใหม่

**บทเรียน**: ตอนดีบักเรื่อง "บันทึกแล้วหาย" ให้ query ค่าจริงในฐานก่อนเสมอ อย่าเดาจากอาการ
```
npx wrangler d1 execute record-revenue-db --remote --command "SELECT theme_banner FROM Projects WHERE …"
```

## E. ปรับการใช้งานบนมือถือ (2026-08-10)

- **ตัดแถบ "โหมดข้อมูลจริง" ออกทั้งหมด** (เดิมมี 3 ที่พูดเรื่องเดียวกัน กินจอ ~4 แถว)
  เหลือแถบเฉพาะตอนมีปัญหาจริง: โหลดข้อมูลจริงล้มเหลว · ตัวตนมาจาก `?userId=` ไม่ใช่การล็อกอิน
  ป้าย "ทริปนี้ปิดแล้ว" โชว์เฉพาะตอนทริปปิดจริง
- ปุ่ม "จดค่าใช้จ่าย" เหลือปุ่มลอยอันเดียวบนมือถือ (เดิมซ้ำกับปุ่มในการ์ด)
- เผื่อพื้นที่ล่าง 150px (เดิม 100px พอแค่แถบเมนู ไม่พอสำหรับปุ่มลอย)
- หัวจอ: ใช้ `.trip-heading` แทน `.topbar>div:nth-child(2)` ซึ่งเป็น selector ที่**ไม่เคยตรงกับอะไรเลย**
  (ลูกคนที่ 2 ของ topbar คือ `<button>` ไม่ใช่ `<div>`) ชื่อทริปกับวันที่จึงเคยไหลต่อกันเป็นบรรทัดเดียว
- เส้นทางบนแผนที่: แยกด้วยสี + ความหนา + ลายเส้น พร้อมรัศมีขาวรอบตัว เพื่อให้อ่านออก
  บนพื้นหลังทุกแบบ (แบนเนอร์เปลี่ยนเป็นภาพถ่ายอะไรก็ได้ จะเลือกสีให้เข้ากับภาพที่ยังไม่รู้ว่าคืออะไรไม่ได้)

## F. สิ่งแวดล้อมที่เจอปัญหาบ่อย

**Google Drive + git**: โปรเจกต์อยู่บน Google Drive stream ทำให้ไฟล์กลายเป็น "cloud-only" เป็นระยะ
อาการ: `git status` บอก `not a git repository` ทั้งที่ `.git` มีอยู่ · `npx wrangler` ขึ้น `Operation timed out`
แก้: Finder → คลิกขวาโฟลเดอร์ → **Make available offline** แล้วรอโหลดเสร็จ
ทางแก้ถาวรที่แนะนำแต่ยังไม่ได้ทำ: ย้ายไป `~/Projects/RecordRevenue` แล้วใช้ GitHub เป็นที่สำรอง

---

# 📍 อ่านตรงนี้ก่อน — สรุปสำหรับ AI ตัวใหม่ (2026-07-28)

## 1. โปรเจกต์นี้คืออะไร

แอปการเงินครอบครัว (ภาษาไทย) ที่มีสองส่วนหลัก

1. **สมุดบัญชีครอบครัว** — `frontend/index.html` + `frontend/app.js` (ไฟล์เดียว ~13,000 บรรทัด) ต่อกับ `backend/src/index.js` (~3,600 บรรทัด) · ของเดิมที่ใช้งานจริงมาตลอด
2. **Unified Trip** — `frontend/trip-unified-prototype/` ระบบบันทึกค่าใช้จ่ายและแผนการท่องเที่ยว **นี่คืองานหลักของช่วงที่ผ่านมา และตอนนี้เชื่อมฐานข้อมูลจริงครบทุกส่วนแล้ว**

ทริปจริงที่กำลังเตรียม: **Hokkaido 2026 · 17–27 ธ.ค. 2026 · `TRP-1783943254256`** สมาชิก North (admin) / Puii / XinXin

## 2. สถานะจริง ณ ตอนนี้

| ส่วน | สถานะ |
|---|---|
| สคีมา Unified Trip (7 ตาราง + 16 คอลัมน์) | ✅ รันบน production แล้ว |
| ย้ายสมาชิกจาก `Projects.members` (JSON) → `TripMembers` | ✅ 8 แถว |
| `GET /api/unified-trip` | ✅ deploy แล้ว |
| endpoint ฝั่งเขียนทั้งหมด (บิล/กระเป๋า/สกุลเงิน/เติมเงิน/ปิดทริป/จุดแวะ) | ✅ เขียนเสร็จ ผ่านเทส |
| prototype เชื่อมฐานจริงด้วย `?live=1` | ✅ ครบทุกหน้า |
| hash รหัสผ่าน (PBKDF2) | ✅ deploy แล้ว · อัปเกรดอัตโนมัติตอนล็อกอิน |
| session token แทน `x-user-id` | ✅ เขียนเสร็จ · **ยังไม่ deploy** |
| โพสต์การปิดทริปเข้าบัญชีจริง | ✅ เขียนเสร็จ · **ยังไม่ deploy** |
| หมวดท่องเที่ยวในผังบัญชี | ⏳ SQL พร้อม · **ยังไม่รัน** |

**สิ่งที่ค้างอยู่ตอนส่งต่อ** (ดูรายละเอียดข้อ 8)

```
npx wrangler d1 execute record-revenue-db --remote --file=add_sessions_table.sql
npx wrangler d1 execute record-revenue-db --remote --file=add_closure_ledger_link.sql
npx wrangler d1 execute record-revenue-db --remote --file=add_trip_stop_naming.sql
npx wrangler d1 execute record-revenue-db --remote --file=add_travel_categories_preview.sql
npx wrangler d1 execute record-revenue-db --remote --file=add_travel_categories.sql
npm test
git add -- HANDOFF.md package.json add_*.sql backend/ frontend/
git commit -m "..." && git push
npx wrangler deploy
npx wrangler pages deploy frontend --project-name record-revenue-web
```

## 3. แผนที่ไฟล์

### Backend (Cloudflare Worker · deploy จาก root ด้วย `wrangler.json`)

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/src/index.js` | route เดิมทั้งหมด · **ระบุตัวตนที่เดียว** ด้วย `const authUserId = await resolveUserId(...)` แล้วส่งต่อทุก route |
| `backend/src/unified-trip.js` | Unified Trip ทั้งหมด (อ่าน + เขียน) · แยกไฟล์โดยตั้งใจเพราะ `index.js` ยาวและเสิร์ฟทั้งระบบ · คืน `null` เมื่อไม่ใช่ path ตัวเอง |
| `backend/src/auth.js` | hash/ตรวจรหัสผ่าน + อัปเกรดของเก่า |
| `backend/src/session.js` | ออก/ตรวจ/ยกเลิก session token · มีสวิตช์ `ALLOW_HEADER_FALLBACK` |

### Frontend

| ไฟล์ | หน้าที่ |
|---|---|
| `frontend/app.js` | แอปหลัก · มี **fetch interceptor** ที่แนบ `Authorization` อัตโนมัติ (แทนการแก้ 71 จุด) |
| `frontend/trip-unified-prototype/index.html` | โครงหน้า 5 จอ: วันนี้ · แผนเที่ยว · บิล · กระเป๋า · เพิ่มเติม |
| เมนูเข้าหน้าทริป | อยู่ใน `frontend/index.html` ชื่อ **Unified Trip** ถัดจาก Hunsa Trip · ⚠️ ต้องเป็นลิงก์ธรรมดาที่เปิด**ในแท็บเดิม** ห้าม `target="_blank"` เพราะ `sessionStorage` ไม่ข้ามแท็บ · และไม่ใส่ `userId` ใน URL |
| `frontend/trip-unified-prototype/app.js` | ตรรกะทั้งหมดของ prototype |
| `frontend/trip-unified-prototype/api.js` | **ตัวแปลงชั้นเดียว** ระหว่าง snake_case ของฐาน ↔ camelCase ของหน้าจอ · ที่เดียวที่รู้จักชื่อฟิลด์ฝั่งฐาน |
| `frontend/trip-unified-prototype/art/icons/` | ไอคอนกระเป๋า 8 แบบ (256×256) + เหรียญ 12 สกุล (192×192) |

⚠️ **แก้ frontend ต้อง bump `?v=` ใน `index.html` เสมอ** — Cloudflare Pages ไม่สนใจ query string แต่เบราว์เซอร์สน

## 4. Unified Trip — โครงสร้างข้อมูลและกติกา

### สามมิติของเงินในบิลใบเดียว (สำคัญที่สุด)

```
member_id        = คนจ่าย        (มือที่ควักเงิน)
owner_member_id  = เจ้าของเงิน   ← ตัวนี้ตัดสินว่าลงบัญชีหลักไหม
wallet_id        = กระเป๋าที่ตัด  (เงินออกจากไหนจริง)
```

ทั้งสามเป็นคนละอย่างได้ — North รูดบัตรตัวเอง จ่ายแทนบิลที่จริง ๆ เป็นค่าใช้จ่ายของ Ann
**ยอดที่แต่ละคนรับผิดชอบมาจาก `TripExpenseParticipants` เท่านั้น ไม่ใช่จาก `member_id`**

### `ledger_mode` ของสมาชิก

- `MAIN` → ยอดของคนนี้เข้าบัญชีหลักตอนปิดทริป
- `TRIP_ONLY` → เก็บในประวัติทริปอย่างเดียว ไม่แตะสมุดบัญชี

### อัตราแลกเปลี่ยน — 4 สถานะ

| สถานะ | ที่มา |
|---|---|
| `base` | สกุลหลักของทริป (THB = 1) |
| `actual` | Σ THB ÷ Σ foreign ของทุกล็อตเติมเงิน |
| `planned` | `plan_rate` ที่ตั้งไว้ตอนวางแผน (ยังไม่มีล็อตจริง) |
| `locked` | ค่าที่แช่ไว้ตอนปิดทริป |

🔑 **เรทเฉลี่ยไม่สนใจลำดับและวันที่โดยเจตนา** — บันทึกเติมเงินย้อนหลังให้ผลเดียวกับบันทึกตอนนั้น
🔑 **ห้ามเดาเรทเด็ดขาด** — ไม่มีข้อมูลให้คืน `null` แล้วให้หน้าจอบอกว่ายังตีมูลค่าไม่ได้ ห้ามใส่ค่าคงที่แทน

### การปิดทริป — จุดที่พังง่ายที่สุดทั้งระบบ

```
ปิดครั้งแรก   CLOSE   +585   posting_date 2027-01-10
เปิดกลับ      REOPEN  −585   posting_date 2027-01-10  ← วันเดิม ไม่ใช่วันนี้
ปิดอีกครั้ง   CLOSE   +819   posting_date 2027-01-15
                     ─────
สุทธิ                  819   ✅
```

**ยอดที่เข้าบัญชี = `SUM(ledger_total)` ของทุกแถว ไม่ใช่แถวล่าสุด** — ถ้าไม่มีแถวกลับจะกลายเป็น 1,404 คือโพสต์ซ้ำ

- หา CLOSE ที่จะกลับด้วย `NOT EXISTS (SELECT 1 FROM TripClosures r WHERE r.reverses_id = c.closure_id)` ไม่ใช่แถวล่าสุดเฉย ๆ
- `RETURN` (แลกกลับเป็นบาท) = **รับรู้กำไรขาดทุน** `fx = received_thb − thb_cost`
- `CARRY` (ยกไปทริปหน้า) = **ยังไม่รับรู้** ต้นทุนย้ายไปทั้งก้อน · รับรู้ตรงนี้ = รับรู้กำไรที่ยังไม่เกิดจริง
- ปิดทั้งที่มีเงินเหลือแล้วไม่บอกว่าจะเอาไปไหน → **400** ไม่งั้นเงินก้อนนั้นหายจากบัญชีเงียบ ๆ

### การหารบิล

- ทศนิยม 2 ตำแหน่ง · **เศษไปรวมที่คนเดียว ไม่กระจาย** (กระจายทีละสตางค์แล้วยอดไม่ตรงใบเสร็จ)
- ลำดับผู้รับเศษ: **admin → เจ้าของบิล → คนแรกในรายการ** ต้องมีคนรับเสมอ
- เศษ **ติดลบก็ได้** — ¥10.01 ÷ 2 ปัดขึ้นทั้งคู่เป็น 5.01 = 10.02 เกินมา 0.01 ต้องหักคืน
- `EQUAL`/`PERCENT` เซิร์ฟเวอร์คำนวณเอง · `MANUAL` **ไม่เกลี่ยเศษให้** เพราะตัวเลขที่คนพิมพ์เองต้องบวกได้ตรงยอดบิล

## 5. ความปลอดภัย — สถานะและสิ่งที่ค้าง

| เรื่อง | สถานะ |
|---|---|
| รหัสผ่าน | ✅ PBKDF2-SHA256 100,000 รอบ · อัปเกรดของเก่าอัตโนมัติตอนล็อกอิน (~9 ms) |
| session token | ✅ เขียนเสร็จ · 🔁 `ALLOW_HEADER_FALLBACK = true` **ช่องโหว่เดิมยังเปิดอยู่** |
| กรอง visibility | ✅ ทำที่เซิร์ฟเวอร์ ไม่ใช่ที่ client |

🔴 **ช่องที่ยังเปิดอยู่**: ตราบใดที่ `ALLOW_HEADER_FALLBACK = true` ใครรู้ `user_id` ก็ `curl` อ่านข้อมูลการเงินทั้งครอบครัวได้โดยไม่ต้องมีรหัสผ่าน

**วิธีปิด** — หลัง deploy แล้วรอ 1–2 วันให้ทุกอุปกรณ์ล็อกอินใหม่:
1. เปิด DevTools → Network ดูว่าคำขอมี `Authorization: Bearer` ครบ
2. เปลี่ยนเป็น `false` ใน `backend/src/session.js` → deploy
3. ยืนยัน `curl -H "x-user-id: 9North" .../api/unified-trip?projectId=...` ต้องได้ **401**

## 6. เทส — 330 เคส · ไม่แตะฐานจริงเลยสักตัว

```
npm test            # ทุกชุด
npm run test:api    # 225 เคส · ไม่ต้องลงอะไรเพิ่ม
npm run test:ui     # 105 เคส · ต้องมี playwright
```

| ชุด | เคส |
|---|---|
| `backend/test/session.test.mjs` | 22 |
| `backend/test/auth.test.mjs` | 27 |
| `backend/test/unified-trip-write.test.mjs` | 176 |
| `frontend/trip-unified-prototype/live-mode.test.mjs` | 105 |

**รูปแบบที่ใช้**: sqlite ในหน่วยความจำ (`node:sqlite`) + shim ที่เลียน API ของ D1 · โหลดไฟล์ต้นทางผ่าน `data:` URL เพื่อให้ทดสอบ **ไฟล์จริง** เสมอ ไม่ใช่สำเนา · ชุด UI เสิร์ฟไฟล์เอง + API ปลอมที่คืนรูปเดียวกับของจริง

⚠️ **schema จำลองในไฟล์เทสต้องลอกจากฐาน production** ไม่ใช่จาก `backend/db/schema.sql` — เคยพลาดจนเทสผ่านหมดแต่พังบนของจริง

## 7. บั๊กที่เคยเจอ — อย่าให้กลับมา

**ตัวเลข / บัญชี**

- ปิด→เปิด→ปิด **โพสต์ซ้ำ ฿14,052** → ต้องมีแถวกลับ
- `fundedForeign ? fundedThb/fundedForeign : exchangeRate` → เดาเรทเงียบ ๆ · ตอนนี้คืน `null`
- `is_admin` ผูกกับ `j.key = 0` → ทริปที่ช่องแรกว่างจะไม่มี admin เลย · แก้ด้วย `ROW_NUMBER()`
- ล็อกทริปตอนแรกปิดแค่ 2 ปุ่ม บิลยังเพิ่มได้และยอดยังขยับ

**หน้าจอ**

- `transform-box` ของ SVG ค่าเริ่มต้นคือ `view-box` → `transform-origin:center` = กลางแผนที่ทั้งใบ ทำให้วงคลื่นลอยข้ามจอ · ต้องใส่ `transform-box:fill-box`
- `renderTodayWeather` ผูกกับ `dayId` ของข้อมูลตัวอย่าง พอเปลี่ยนเป็นวันจริง id ไม่ตรง ฟังก์ชัน `return` เงียบ ๆ แล้ว**ปล่อยตัวเลขเดิมค้าง** (อันตรายกว่าพังให้เห็น)
- `refreshQuickAdd()` เขียนทับ `#saveWarning` → ต้องเขียนข้อความ error **หลัง** เรียกมัน
- `openSheet()` เรียก `blockedByClose()` โดยไม่ระบุ area → ฟอร์มเปิดมาแต่ไม่มีแถวหมวดและรายชื่อคน
- `let liveMode` ประกาศซ้ำ → ทั้งไฟล์พังเงียบ ๆ · และต้องประกาศ **บนสุด** เพราะ `applyTripLock()` ใช้ตั้งแต่ render แรก
- `font:` shorthand ล้าง `font-family` → ภาษาไทยกลายเป็นสี่เหลี่ยม
- `scrollIntoView` ไม่ทำงานกับ element ที่ `display:none`
- ลากเรียงแล้วเรียก `renderPlanWorkspace()` ใน `dragover` → ทำลาย node ที่กำลังลาก

**สคีมา / เครื่องมือ**

- 🔴 **`backend/db/schema.sql` ไม่ตรงกับ production** — `Captions` ใช้ `type_id` ไม่ใช่ `caption_id`
- 🔴 **ไฟล์ migration ในโปรเจกต์ไม่ได้ถูกรันทุกไฟล์** — `add_hunsa_trip_stop_fields.sql` เคยรัน แต่ `add_puppup_trip_fields.sql` **ไม่เคย** · `TripStops` จึงมี `end_time`/`icon_asset` แต่ไม่มี `name_th`/`name_en`/`sort_order` · **การมีไฟล์อยู่ในโปรเจกต์ไม่ได้แปลว่ามันถูกใช้แล้ว** ตรวจด้วย `pragma_table_info` ก่อนเสมอ
- `wrangler --file` **ไม่พิมพ์ผล SELECT** ต้องใช้ `--command` ถ้าอยากเห็นผล
- `ALTER TABLE ADD COLUMN` ไม่มี `IF NOT EXISTS` — รันซ้ำได้ `duplicate column name` ซึ่งแปลว่าเคยรันแล้ว
- D1 **แก้ CHECK ไม่ได้** และ **DROP คอลัมน์ที่มี FK ไม่ได้** → migration ต้องเป็นแบบเพิ่มอย่างเดียว
- `VALUES (...) AS n(col)` ไม่รองรับใน SQLite รุ่นเก่า → ใช้ `SELECT ... UNION ALL`
- `new URL(import.meta.url).pathname` เก็บแบบ URL-encoded → path ที่มีช่องว่าง (`My Drive`) พัง ต้องใช้ `fileURLToPath`
- ค่าใน HTTP header เป็น ByteString **ใส่ภาษาไทยไม่ได้**

**git / สภาพแวดล้อม**

- 🔴 **ห้ามใช้ `git add -A`** — root มี dump ฐานข้อมูลจริงหลายไฟล์ เคยกวาดไฟล์ที่มีรหัสผ่านขึ้น GitHub มาแล้ว (แก้ด้วยการเปลี่ยนรหัส ไม่ใช่ลบ commit)
- `.git` อยู่ใน Google Drive → `HEAD.lock` / `index.lock` ค้างบ่อย · ลบทิ้งได้ถ้าไม่มี git process รันอยู่
- `.gitignore` ใช้ `node_modules` (ไม่มี `/` ท้าย) เพราะ `node_modules/` จับ symlink ไม่ได้

## 8. งานที่ยังไม่เสร็จ

| งาน | ทำไมยังไม่ทำ |
|---|---|
| **รัน migration 3 ไฟล์ + deploy** | รอผู้ใช้ยืนยัน (ดูข้อ 2) |
| **ปิด `ALLOW_HEADER_FALLBACK`** | รอให้ทุกอุปกรณ์ล็อกอินใหม่ก่อน |
| **หน้าจอเลือกบัญชีปลายทางตอนปิดทริป** | API รับ `account_id` แล้ว แต่ยังไม่มี UI · ไม่ส่ง = ไม่โพสต์เข้าบัญชี |
| **`CARRY` สร้างล็อตเติมเงินจริงในทริปถัดไป** | รอมีทริปปลายทาง · ตอนสร้างต้องใช้ `thb = thb_cost` **ห้ามคิดใหม่จาก `foreign × เรทปัจจุบัน`** |
| **พยากรณ์อากาศจริง** | ยังไม่ได้เชื่อมบริการใด · ตอนนี้ขึ้นว่า "ยังไม่มีข้อมูล" อย่างซื่อสัตย์ |
| **ระบบหลายทริป** | prototype ยังผูกกับทริปเดียวผ่าน `?projectId=` |
| **ผูกบิลกับจุดแวะ** | `TripExpenses.stop_id` มีอยู่แล้วในฐาน · หน้าแผนเที่ยวยังขึ้น "ยังไม่ผูกบิล" ทุกจุด ทั้งที่ทำได้เลย |
| **ลบไฟล์ที่ไม่ใช้แล้ว** | `map-compare.html` · `map-variants.css` · `map-variants.js` · `frontend/trip-unified-prototype/_probe.mjs` |
| **ย้าย `.git` ออกจาก Google Drive** | ความเสี่ยงระยะยาว |

## 9. กติกาที่ผู้ใช้ตั้งไว้ (ห้ามฝ่าฝืน)

- **อย่าแก้หรือ replace หน้า `Trip`, `PupPup Trip`, `Prototype Trip` production เดิม**
- **อย่ารัน migration หรือ deploy โดยไม่ได้รับคำสั่ง**
- **รักษาโทนภาพ/ฟอนต์/แผนที่ที่ผู้ใช้เลือก**
- **อย่าฝังชื่อ/หมุดใหม่ลง banner** — ให้ overlay ด้วยโค้ด
- **อย่าอ้างว่าข้อมูลอากาศ/ตำแหน่งเป็นข้อมูลจริง** ถ้าระบบไม่ได้ไปดึงมาจริง
- ตัวเลขหลักพันใส่ `,` · ตัวเลขติดลบใส่วงเล็บ `(1,234)` แบบบัญชี

## 10. วิธีทำงานที่ได้ผลกับโปรเจกต์นี้

1. **ตรวจของจริงก่อนเชื่อไฟล์** — schema, ผลลัพธ์ API, ตำแหน่ง element บนจอ · การเดาแล้วเขียนโค้ดตามทำให้เสียเวลาซ้ำหลายรอบ
2. **เขียนเทสที่จับ "ความหมาย" ไม่ใช่แค่ "ไม่ error"** — เทสที่ดีที่สุดในชุดนี้คือตัวที่บังคับให้ยอดจากสองเส้นทางคำนวณตรงกัน
3. **เปิดของทีละส่วน** — `LIVE_WRITABLE` ทำให้เปิดการเขียนทีละหน้าได้โดยไม่ต้องเสี่ยงทั้งระบบ
4. **ล้มเหลวต้องดัง** — 400 พร้อมเหตุผลที่บอกทางแก้ ดีกว่าเดาค่าให้แล้วผ่านไปเงียบ ๆ
5. **ข้อความบนจอต้องตรงกับข้อมูลที่แสดงอยู่จริง** — ป้าย "ข้อมูลจำลอง" ที่ค้างอยู่บนข้อมูลจริงอันตรายกว่าไม่มีป้าย

---

## ⭐ จุดส่งต่องานล่าสุดที่สุด — Unified Trip Static Prototype (2026-07-27)

> ⚠️ **หัวข้อนี้เป็นบันทึกช่วงที่ยังเป็น static prototype** เก็บไว้เพื่อดูเหตุผลเบื้องหลังการออกแบบ UI  
> **สถานะปัจจุบันไม่ใช่แบบนี้แล้ว** — ตอนนี้เชื่อม API/D1 ครบทุกส่วนผ่าน `?live=1` (ดูสรุปด้านบน)

### เป้าหมาย

ในระบบมีหน้าทริป 3 แบบเดิมคือ `Trip`, `PupPup Trip`, `Prototype Trip` ซึ่งมี requirement ใกล้กันแต่ layout ยังไม่ตอบโจทย์ ผู้ใช้ต้องการออกแบบหน้าเดียวใหม่ให้:

- สวย เรียบง่าย เป็นระเบียบ ใช้งานง่าย
- รองรับแผนเดินทาง + ค่าใช้จ่าย + กระเป๋าเงิน + สมาชิก + สภาพอากาศ
- ใช้โทนสีจาก mockup 4 ภาพเดิม แต่ **ไม่คัดลอก layout หรือข้อมูลจากภาพ**
- ใช้ฟอนต์ไทยแบบมีหัว
- แผนที่เป็นภาพวาดพาสเทล texture ละมุน มีภูมิศาสตร์จริง และวางหมุด/ชื่อ/เส้นทางด้วยโค้ดเพื่อเปลี่ยนตามแผนได้

### Source of truth ของ prototype ล่าสุด

- โฟลเดอร์: `frontend/trip-unified-prototype/`
- ไฟล์หลัก:
  - `frontend/trip-unified-prototype/index.html`
  - `frontend/trip-unified-prototype/style.css`
  - `frontend/trip-unified-prototype/app.js`
- Assets:
  - `art/hokkaido-illustrated-clean.png` — ภาพแผนที่ปัจจุบันจากไฟล์ผู้ใช้ `Generated image 1 (13).png`
  - `art/hokkaido-illustrated-landmarks.png` — ภาพเวอร์ชันเก่า มีชื่อสถานที่ฝังในภาพ
  - `art/hokkaido-texture-map.png` — ภาพที่สร้างด้วย ImageGen
  - ใช้ไอคอนเสริมจาก `frontend/puppup-prototype/art/`
- Local URL: `http://localhost:4173/trip-unified-prototype/`
- รัน local:
  ```bash
  cd "<โฟลเดอร์ RecordRevenue>"
  python3 -m http.server 4173 --directory frontend
  ```
- cache bust ของ prototype ล่าสุด: `style.css?v=31`, `app.js?v=33`

### 💱 นโยบายอัตราแลกเปลี่ยน (ตอบคำถามผู้ใช้ 2026-07-27 — ยืนยันแล้ว)

**สูตร: เฉลี่ยถ่วงน้ำหนักทั้งทริป ต่อกระเป๋า** — `walletRate(walletId)` = Σ THB ÷ Σ foreign ของทุก funding lot ในกระเป๋านั้น · **ไม่สนใจวันที่และลำดับการบันทึกโดยเจตนา**

เคสที่ผู้ใช้ถาม: แลกเงินจริง 1/7 แต่บันทึกย้อนหลังวันที่ 6 หลังจากจดค่าใช้จ่ายวัน 1–5 ไปแล้ว
→ **บันทึกเมื่อไหร่ก็ให้ผลเหมือนกัน** เพราะเรทคำนวณใหม่ทั้งก้อนทุกครั้ง ไม่ใช่สะสมทีละรายการ (idempotent)
→ ผลข้างเคียงที่ยอมรับ: ค่าใช้จ่ายเก่าถูก**ตีมูลค่าบาทใหม่ย้อนหลัง** ตัวเลขจะขยับจนกว่าจะปิดทริป ซึ่งตรงกับ production ที่ล็อกค่าบาทบิลด้วย avg_rate ตอน close เท่านั้น
→ พิจารณา FIFO ตามวันที่แลกจริงแล้ว **ไม่เลือก** (ให้ผลต่างราว 1–2% และ backend production ต้องแก้ตามด้วย)

**เรทประมาณการรายสกุล + ป้ายบอกที่มา (เพิ่ม 2026-07-27 ค่ำ)**

`tripCurrencies[]` เก็บสกุลเงินของทริปพร้อม `planRate` (บาทต่อ 1 หน่วย) แก้ไข/เพิ่ม/ลบได้จากหน้า "เพิ่มเติม" → การ์ด "สกุลเงินในทริป" · ลบไม่ได้ถ้ายังมีกระเป๋าใช้สกุลนั้น · THB เป็น `base:true` แก้ไม่ได้

`rateInfo(currencyCode, walletId)` คืน **ทั้งค่าและที่มา** เพราะเลขเปล่า ๆ แยกไม่ออกว่าเป็นเรทจริงหรือเรทเดา:

| source | เมื่อไหร่ | ป้ายที่แสดง |
|---|---|---|
| `base` | สกุลหลักของทริป (THB) | ไม่มี |
| `actual` | มี funding lot จริง | **เรทยังไม่นิ่ง · จะล็อกตอนปิดทริป** |
| `planned` | ยังไม่เติมเงิน แต่มี `planRate` | **เรทประมาณการ · ยังไม่มีการเติมเงินจริง** |
| `locked` | `tripClosed = true` | ล็อกแล้วเมื่อปิดทริป |
| `none` | ไม่มีทั้งสองอย่าง | ยังคำนวณมูลค่าเป็นบาทไม่ได้ (ไม่นับในยอดรวม) |

ตอบคำถาม "ควรเติมเงินก่อนไหมเพื่อไม่ให้ใช้ default": **ไม่ต้องแล้ว** — ตั้ง `planRate` ของสกุลนั้นไว้ตอนวางแผน ระบบจะใช้เรทประมาณการพร้อมป้ายกำกับ แล้วสลับไปใช้เรทเฉลี่ยจริงเองทันทีที่มี funding lot แรก · `tripClosed` ยังเป็น flag เปล่า ยังไม่มี flow ปิดทริปจริงมาเซ็ต

**สองเคสที่ต้องเตือน (ทำแล้ว)**

1. `leftover < 0` (ใช้เกินยอดเติมที่บันทึกไว้) → `.wallet-warn` บอกว่า "น่าจะยังบันทึกการเติมเงินไม่ครบ" **ไม่ใช่** "ใช้เงินเกินตัว" พร้อมบอกว่าบันทึกย้อนหลังได้
2. ไม่มี funding lot เลย → `walletRate()` คืน **null** และ UI บอกว่า "ยังคำนวณมูลค่าเป็นบาทไม่ได้"
   ⚠️ **ห้ามใส่ fallback ไปค่าคงที่ `exchangeRate` (0.232) เด็ดขาด** — โค้ดเดิมเคยทำ ทำให้ผู้ใช้เห็นตัวเลขบาทที่ดูน่าเชื่อถือแต่ระบบเดาเอง · หน้าบิลมี `#billNotice` เตือนจำนวนบิลที่ยังตีมูลค่าไม่ได้ด้วย

**ผลข้างเคียงที่ตามมา**: `billBaht()` ใช้เรทของกระเป๋าที่บิลนั้นตัดเงิน ไม่ใช่ค่าคงที่ทั้งทริปอีกต่อไป ยอดรวม seed จึงเปลี่ยนจาก ฿26,100 → **฿26,126** (กระเป๋า North เรท 0.2328, กระเป๋า Ann เรท 0.2320) · บรรทัดแปลงค่าเงินใน Quick Add ก็ใช้เรทของกระเป๋าที่เลือกแล้วเช่นกัน
- ทั้งโฟลเดอร์ `frontend/trip-unified-prototype/` และ assets ใต้ `frontend/puppup-prototype/art/` ยังเป็น **untracked** ตาม `git status`; ห้ามเผลอลบทิ้ง

### Requirement ที่ตกลงกับผู้ใช้แล้ว

#### การเงินและสิทธิ์

1. สมาชิกแต่ละคนมีกระเป๋า YouTrip/Travel Card ของตัวเอง แยกยอดและประวัติ
2. ต้องบันทึกทั้ง:
   - คนจ่าย
   - เจ้าของเงินที่ถูกใช้
   - กระเป๋าที่ตัดเงินจริง
3. ต้องสรุปได้ว่าแต่ละคนจ่ายบิลใด
4. บิลหนึ่งแบ่งหลายหมวดได้
5. ค่าอาหาร/ที่พัก/รายการร่วม เปิดให้สมาชิกเห็นได้
6. visibility มีแนวคิด:
   - `PRIVATE` — เจ้าของเห็น
   - `TRIP` — ทุกคนในทริปเห็น
   - `SELECTED` — เฉพาะผู้เกี่ยวข้องเห็น
7. ค่าใช้จ่ายร่วมแยกจาก visibility:
   - เปิดให้เห็นอย่างเดียวได้ โดยไม่จำเป็นต้องหาร
   - หากหาร รองรับ equal/manual/percent ใน design data model ภายหลัง
8. สมาชิกบางคนไม่ใช้ระบบบัญชีประจำวัน:
   - เป็น `TRIP ONLY`
   - สร้างกระเป๋าเอง จดบิล และเห็นทริปได้
   - บิลแชร์ยังเปิดให้คนอื่นเห็นได้
   - เมื่อปิดทริป ค่าใช้จ่ายของคนนี้เก็บในประวัติทริป แต่ **ไม่ post ลงบัญชีหลัก**
9. ก่อนปิดทริปต้องมี close preview แยก:
   - ลงบัญชีหลัก
   - เก็บเฉพาะประวัติทริป

#### แผนเดินทาง อากาศ และ location

1. แสดงกิจกรรมถัดไปเด่นชัด
2. สภาพอากาศตามวันและสถานที่หลัก แบ่งเช้า/บ่าย/ค่ำ
3. แชร์ตำแหน่งแบบ `เช็กอินและแชร์ขณะเปิดแอป` เท่านั้น ไม่ใช่ background tracking
4. สมาชิก A/B เห็นความคืบหน้าการเดินทางของกันและกันเมื่อเจ้าตัวเปิดแชร์
5. สถานที่หลักและกิจกรรมย่อยสลับลำดับหรือย้ายข้ามวันได้ รองรับเปลี่ยนแผนหน้างาน
6. สถานที่อนาคตทั้งหมดแสดงจาง ๆ บนแผนเพื่อให้เห็นเส้นทางและสร้างความตื่นเต้น

#### เส้นทาง Hokkaido

ลำดับหลัก:

`Kushiro → Lake Akan → Lake Kussharo → Sounkyo → Obihiro → Furano → Jozankei → Niseko → Otaru → Sapporo → Chitose Airport`

แลนด์มาร์ก/กิจกรรมที่ผู้ใช้ระบุ:

- Kushiro ตลาดปลา
- Kitakitsune Farm
- Lake Akan
- Akanko Ainu Kotan
- Asahidake Ropeway
- Shirahige Waterfall
- Nusamai Bridge
- Moor Onsen

### Visual direction ที่ผู้ใช้ยืนยัน

- พาสเทลอ่อน: ฟ้า ชมพู เขียวอ่อน ครีม ลาเวนเดอร์
- card สีขาว ขอบบาง เงานุ่ม
- ไอคอน 2D sticker ญี่ปุ่นคาวาอี้ มีเส้นขอบขาว
- banner เป็นแผนที่ท่องเที่ยว texture watercolor/illustrated ไม่แบนแข็ง
- ต้องเห็นแนวชายฝั่ง ภูเขา ทะเลสาบ และรูปทรงเกาะจริงชัดเจน
- ตัวอักษรไทยแบบมีหัว:
  - หัวข้อ: Noto Sans Thai Looped
  - body: Anuphan
  - อังกฤษ/ตัวเลข: Poppins
- ภาพ banner ปัจจุบันเป็นอัตราส่วนประมาณ `2.37:1`; container ถูกปรับให้เต็มความกว้างและวางกรอบ Day ใต้ภาพ
- หมุด ชื่อสถานที่ และเส้นทางต้องเป็น HTML/SVG/code overlay ไม่ฝังในภาพ เพื่อแก้ตามแผนได้

### โครงหน้าปัจจุบัน

Navigation เดสก์ท็อปเป็น side rail และ mobile เป็น bottom navigation:

1. `วันนี้`
   - banner แผนที่เต็มความกว้าง
   - หมุด 11 จุด + เส้นทาง SVG
   - past/current/next/future มี visual state ต่างกัน
   - คลิกหมุดอนาคตเพื่อ preview Day/เส้นทางได้
   - กรอบ Day อยู่ใต้ภาพ
   - กิจกรรมถัดไป
   - presence/location ของสมาชิก
   - weather เช้า/บ่าย/ค่ำ
   - ใช้วันนี้ + งบคงเหลือ
2. `แผนเที่ยว`
   - Day 3–6 มีข้อมูล mock
   - สลับวัน
   - ลากเรียง หรือใช้ปุ่มขึ้น/ลง
   - เลือกกิจกรรมแล้วย้ายข้ามวัน
   - weather overview ต่อวัน
   - เพิ่มสถานที่ผ่าน dialog
   - แก้ไขกิจกรรมเดิม
   - ฟอร์มมีชื่อ วัน เวลา ประเภท งบ JPY รายละเอียด
   - เมื่อ save จะย้ายไปวันที่เลือก เรียงตามเวลา และอัปเดตจำนวนจุด
3. `บิล`
   - summary รวมทั้งทริป / North จ่ายจริง / TRIP ONLY
   - filter ทั้งหมด / ค่าใช้จ่ายร่วม / ของฉัน / เฉพาะทริป
   - รายการแสดง payer, owner, visibility, shared และผล posting
4. `กระเป๋า`
   - กระเป๋า YouTrip JPY/THB ส่วนตัวของ North
   - ยอดเติม ใช้ เหลือ และรายการล่าสุด
5. `เพิ่มเติม`
   - สมาชิกและสิทธิ์
   - แสดง North/Nimz เป็นบัญชีหลัก
   - Ann เป็น TRIP ONLY
   - close-trip preview

### Interaction ที่ทำและทดสอบผ่านแล้ว

- responsive desktop/mobile เบื้องต้น
- เปิดทุก screen ผ่าน navigation
- หมุดและชื่อสถานที่วางด้วย SVG/code
- กดหมุด/ใช้ Enter เพื่อ preview สถานที่อนาคต
- ย้าย `Akanko Ainu Kotan` จาก Day 3 ไป Day 4
- จำนวนจุดต่อวันอัปเดตถูกต้อง
- เลื่อนกิจกรรมขึ้น/ลง
- เพิ่ม `Nusamai Bridge Sunset` ผ่านฟอร์มไป Day 4 พร้อมเวลา รายละเอียด และ ¥1,200
- ระบบเรียงตามเวลาและแก้ชื่อรายการเดิมได้
- `node --check frontend/trip-unified-prototype/app.js` ผ่านก่อนเริ่มแก้ bills รอบล่าสุด
- การทดสอบ browser ใช้ local static server เท่านั้น ไม่ยิง production API

### ✅ รอบ 2026-07-27 (บ่าย) — ทดสอบผ่านครบแล้ว ไม่ต้องทำซ้ำ

รอบก่อนหน้าค้างไว้ที่ "รอทดสอบ bills" — **ทดสอบครบแล้วด้วย Chromium (Playwright) 25 assertion ผ่านทั้งหมด ไม่มี console error** จึงข้ามลำดับทดสอบ 1–6 ด้านล่างไปได้เลย

**บั๊กสายตาที่แก้แล้ว**

- `.map-hero` เคยเป็น `aspect-ratio:1.9/1` แต่ภาพ + viewBox เป็น `1931/814` (2.372) → ภาพถูก `object-fit:cover` ครอปข้าง ส่วน SVG letterbox แนวตั้ง **หมุดจึงไม่ทับแลนด์มาร์กมาตลอด** แก้เป็น `aspect-ratio:1931/814` + `object-fit:contain` ครบทั้ง base และ breakpoint 900/640 (สองอันหลังเคยล็อก `height:390px`/`350px` ทับ aspect-ratio ไว้) — พิกัด `data-x/data-y` เดิมถูกต้องอยู่แล้วทุกจุด ไม่ต้องแก้
- **ฟอนต์ Anuphan ไม่เคยถูกโหลด** ทั้งที่เป็น body font ตามสเปก เพิ่ม `@font-face` 400–700 (ไฟล์อยู่ที่ `../puppup-prototype/fonts/anuphan-thai-*.woff2`) แล้วตั้ง body = `Poppins, Anuphan` (Poppins ก่อนเพื่อให้ตัวเลข/อังกฤษคงทรง ส่วนไทยตกไป Anuphan รายตัวอักษร)
- ⚠️ **กับดักที่ต้องระวัง**: rule ที่ใช้ `font:` shorthand จะล้าง font-family ที่ตั้งไว้ทิ้ง — `.prototype-note` และกลุ่ม `.eyebrow` โดนเข้าเต็ม ๆ ข้อความไทยหล่นไปฟอนต์ระบบ ถ้าเพิ่ม rule ใหม่ที่ใช้ shorthand ต้องใส่ Anuphan ใน stack ด้วยเสมอ
- พาสเทลพาส: แยก `--pink` (ใช้เป็นสีพื้นเท่านั้น) ออกจาก `--pink-ink` ใหม่สำหรับตัวหนังสือ เพราะ `#ff668d` บนขาว = 2.79:1 ตก AA · ตอนนี้ทุกจุดที่เคยตกผ่านหมด (eyebrow 4.95, ชื่อสถานที่อนาคต 5.11, ข้อความรอง 4.90)
- `.day-summary` ที่ ≤640px เหลือ 2 คอลัมน์แต่มีลูก 3 ตัว → ปุ่ม "ดูแผนวันนี้" ถูกบีบเป็นคำละบรรทัด (rule เก่า `.day-summary>button` ไม่ match แล้วเพราะปุ่มย้ายเข้า `.day-summary-actions`) แก้ให้ actions span เต็มแถว

**Quick Add + data model (ตอบ requirement การเงินข้อ 2–4, 8)**

- เพิ่ม `members[]` (มี `ledgerMode: MAIN | TRIP_ONLY`) และ `wallets[]` (มี `ownerId`, `currency`) ใน `app.js`
- bill shape ใหม่: `{payerId, ownerId, walletId, categories:[{name,amount}], visibility, shared, participantIds[], currency, activityId}` — **`tripOnly` ไม่เก็บเป็นฟิลด์แล้ว** คำนวณจาก `ledgerMode` ของ `ownerId` แทนการอ่านสตริง `"· TRIP ONLY"` ในชื่อ
- ฟอร์มแยก 3 มิติจริง: เลือกกระเป๋าแล้วเดา payer/owner ให้ แต่หยุดเดาทันทีที่ผู้ใช้แก้ฟิลด์นั้นเอง (`payerTouched`/`ownerTouched`)
- ปุ่ม `＋ เพิ่มหมวด` มี handler แล้ว (เดิมตาย) เพิ่ม/ลบแถวได้ เติมยอดคงเหลืออัตโนมัติ และ **บล็อกการบันทึกเมื่อผลรวมหมวด ≠ ยอดบิล**
- บรรทัดแปลงค่าเงิน / ยอดหารต่อคน / รายชื่อผู้เกี่ยวข้อง คำนวณสดทั้งหมด (เดิม hardcode) และล้างฟอร์มทุกครั้งที่เปิด
- `canSee()` กรองตาม visibility ก่อน render — บิล PRIVATE ของคนอื่นไม่เข้า DOM เลย
- `billBaht()` แยกกระเป๋า THB ออกจาก JPY ไม่ให้คูณเรทซ้ำ

**อื่น ๆ**

- ลากเรียงกิจกรรม: ย้าย reorder จาก `dragover` (ซึ่งเรียก `renderPlanWorkspace()` แล้วทำลายโหนดที่กำลังลาก → drag พังทันที) ไปทำที่ `drop` แทน · `dragover` เหลือแค่วาดเส้น `.drop-before/.drop-after` · ลบ handler ซ้ำที่ผูกกับโหนดตายแล้วออก
- localStorage คีย์ `unified-trip-prototype` มี `STORAGE_VERSION` (ตอนนี้ = 2) ถ้าเปลี่ยน bill shape อีก **ต้อง bump** ไม่งั้นข้อมูลเก่าจะ render เพี้ยน · ปุ่มคืนค่าตัวอย่างอยู่ที่หน้า "เพิ่มเติม"
- ไฟล์ `map-compare.html` + `map-variants.css/js` = ตัวเทียบแผนที่มือถือ 3 แบบ **ผู้ใช้เลือก "คงแบบเดิม"** แล้ว ไฟล์เหล่านี้ไม่ถูกโหลดจาก `index.html` ลบทิ้งได้

### ✅ รอบ 2026-07-27 (เย็น) — แผน 12 วัน · รูปแบบตัวเลข · คลังรูปภาพ

**หมุด ↔ วัน และแผนเต็ม 12 วัน**

- `journeyStops[]` มีฟิลด์ `dayId` ชี้ไปที่ `planDays` โดยตรง — เลิก join ด้วยเลขวัน เพราะเส้นทางมี 11 หมุดบน 12 วัน และ Kushiro กินสองวัน (Day 01–02) ทำให้เลขวันไม่ match
- `planDays` เต็ม Day 1–12 พร้อมกิจกรรม 2–3 รายการทุกวัน และ object `weather` ที่มี `feels`/`periods[]`/`tip` ครบทุกวัน
- `#openSelectedPlan` สลับ `activePlanDayId` จริงแล้ว (เดิมแค่เปลี่ยนหน้าจอ)
- การ์ดอากาศหน้า "วันนี้" render จาก `planDays[].weather` และเปลี่ยนตามหมุดที่เลือก พร้อมป้าย "พยากรณ์ล่วงหน้า" เมื่อไม่ใช่วันปัจจุบัน
- ⚠️ `scrollIntoView` ไม่ทำงานกับ element ที่ `display:none` — แท็บวันต้องเลื่อนเข้าจอใน `showScreen()` หลังหน้าจอแสดงแล้ว ไม่ใช่ใน `renderPlanWorkspace()`

**รูปแบบตัวเลข (กติกาจากผู้ใช้)**

- `fmtAmount(value, symbol)` — หลักพันมีคอมมา และ **จำนวนติดลบอยู่ในวงเล็บ** ไม่ใช้เครื่องหมายลบ เช่น `(¥24,000)`
- ใช้ทั่วทั้ง bills/summary/quick add/plan cost/wallet activity
- **ยกเว้นอุณหภูมิ** ยังใช้ `−6°` ตามเดิม เพราะ `(6)°` จะอ่านเป็นตัวเลขบัญชี ไม่ใช่สภาพอากาศ — ถ้าผู้ใช้ต้องการให้เปลี่ยนด้วยค่อยแก้

**คลังรูปภาพ 3 ชนิด (`openAssetPicker`)**

- dialog เดียวใช้ร่วมกัน มี `assetSpecs` กำหนดขนาดของแต่ละชนิดและ**แสดงขนาดให้ผู้ใช้เห็นในหน้าเลือก**:
  - `banner` 1920 × 810 px (2.37 : 1) — เปลี่ยนได้ทั้งทริปเดิม (ปุ่มบนแผนที่ + หน้าเพิ่มเติม) และทริปใหม่ (`#newTripDialog`)
  - `place` 256 × 256 px — สี่เหลี่ยมมุมโค้ง ใช้ในฟอร์มแผนเที่ยว
  - `expense` 192 × 192 px — วงกลม ใช้ใน Quick Add ขั้น 2
- **เพิ่ม 2 ชนิดเมื่อ 2026-07-27 ค่ำ**:
  - `wallet` 256 × 256 px สี่เหลี่ยมมุมโค้ง — ปุ่ม 🎨 บนการ์ดกระเป๋า · เก็บที่ `wallets[].icon`
  - `currency` 192 × 192 px วงกลม — ในฟอร์มสกุลเงิน · เก็บที่ `tripCurrencies[].icon`
  - ไอคอนชุดแรกเป็น **SVG ที่ generate ขึ้นเอง** ใน `art/icons/` (กระเป๋า 8 แบบ `wallet_*.svg` · เหรียญ 12 สกุล `coin_*.svg`) เพิ่มไฟล์ใหม่แล้วเติมรายการใน `assetLibrary` ได้เลย
  - พิมพ์รหัสสกุลที่รู้จัก (JPY/THB/USD/EUR/KRW/GBP/CNY/SGD/AUD/TWD/VND/MYR) ในฟอร์มสกุลเงิน ระบบจะเลือกเหรียญให้อัตโนมัติผ่าน `CURRENCY_ICON_BY_CODE`
  - ⚠️ `DEFAULT_ICONS` / `CURRENCY_ICON_BY_CODE` ต้องประกาศ **บนสุดของไฟล์** เพราะ `let currencyIcon = DEFAULT_ICONS.currency` เป็น statement ระดับ top-level — วางไว้ท้ายไฟล์แล้วเจอ TDZ `Cannot access 'DEFAULT_ICONS' before initialization` หน้ากระเป๋าว่างทั้งหน้า
- อัปโหลดเองได้ · `normaliseUpload()` วาดลง canvas ครอบกึ่งกลางเป็นขนาดตามสเปกแล้วแปลงเป็น webp — บังคับขนาดจริงและทำให้ dataURL เล็กพอเก็บลง localStorage (ทดสอบ: ภาพ 1000×1000 → 192×192 ขนาด 1 KB)
- `bill.image` เป็น override ถ้าไม่เลือกจะ fallback ไปไอคอนตามหมวดเหมือนเดิม
- ⚠️ กับดักที่เจอและแก้แล้ว 3 จุด:
  1. `#assetConfirm` ต้อง `closeLayers()` **ก่อน** เรียก callback ไม่งั้น callback เปิดฟอร์มเดิมแล้วโดนปิดซ้ำทันที
  2. `openAssetPicker()` ต้อง `closeLayers()` ตอนเริ่ม เพราะถูกเรียกจาก dialog อื่นที่ z-index เท่ากัน (`#newTripDialog` อยู่หลังใน DOM เลยบัง) · `.asset-picker` จึงตั้ง `z-index:54`
  3. ปุ่ม "ยกเลิก" ห้ามใช้ class `dialog-close` เพราะ class นั้นเป็น `position:absolute` ของปุ่ม × — ใช้ `.close-layer` แทน

**แก้ฟอนต์แบบถาวร**

แทนที่จะไล่แก้ทีละ rule ที่ใช้ `font:` shorthand ตอนนี้ลงทะเบียน Anuphan **ภายใต้ชื่อ family `Poppins`** พร้อม `unicode-range:U+0E01-0E5B` — ทุก rule ที่ใช้ Poppins จึงได้อักษรไทยอัตโนมัติ รวมถึง rule ที่จะเขียนเพิ่มในอนาคต (แก้เคส `.plan-cost small` ที่ขึ้นเป็นกล่องสี่เหลี่ยม)

**สถานะทดสอบ**: Playwright/Chromium ผ่านครบ 60 assertion · ไม่มี console error · ครอบคลุม bills flow, drag & drop, หมุด↔วัน, 12 วัน, รูปแบบตัวเลข, ทั้ง 3 picker, อัปโหลด, สร้างทริปใหม่ และ persistence

### ✅ รอบ 2026-07-27 (ค่ำ) — กระเป๋าเงินจริง · สลับมุมมองสมาชิก · split 3 แบบ

**สลับมุมมองผู้ใช้ (`viewerId`)**

- `CURRENT_MEMBER_ID` (const) กลายเป็น `viewerId` (let) สลับได้จากหน้า "เพิ่มเติม" → กดชื่อสมาชิก
- ใช้ตรวจกติกาการมองเห็นได้จริง แทนที่จะเชื่อว่าถูก — ทดสอบยืนยันแล้วว่าสลับเป็น Ann จะ **ไม่เห็นบิล PRIVATE ของ North** แต่ยังเห็นบิลที่แชร์กับทริป และเห็นกระเป๋าตัวเองใบเดียว

**หน้ากระเป๋าคำนวณจากข้อมูลจริง**

- เพิ่ม `fundings[]` (funding lot ต่อกระเป๋า) + `walletSummary()` คืน funded/spent/leftover/avg rate
- **เรทเฉลี่ยเป็นแบบถ่วงน้ำหนัก Σ THB ÷ Σ foreign ทุกล็อต** ตรงกับวิธีของ `computeTripWallets()` ฝั่ง production (ทดสอบ: 58,200 ÷ 250,000 = ฿0.2328/¥)
- แสดงเฉพาะกระเป๋าที่ `viewerId` เป็นเจ้าของ · ประวัติรวมทั้งบิลที่ตัดจากกระเป๋าและรายการเติมเงิน
- ⚠️ ตอนย้าย row เข้า wrapper `#walletActivity` ทำให้ rule เดิม `.wallet-activity>div` ไปจับ wrapper แทน row → ทุกแถวเรียงเป็นแนวนอน แก้ด้วย `.wallet-activity #walletActivity>div` แล้ว

**money-strip ผูกกับบิลจริง**

"ใช้วันนี้" = ผลรวมบิลที่ `activityId` อยู่ในกิจกรรมของวันปัจจุบัน (seed bills ผูก activityId ไว้แล้ว) · "เหลืองบ" = `TRIP_BUDGET_THB` − ยอดรวมที่มองเห็นได้ และเปลี่ยนเป็นสีแดงเมื่อติดลบ

**split mode ครบ 3 แบบ (requirement 7)**

- `equal` / `manual` / `percent` เลือกจาก segmented ใน Quick Add ขั้น 3
- `manual` กรอกเป็นสกุลของบิล ต้องรวมเท่ายอดบิล · `percent` ต้องรวม 100% · ไม่ครบ = บล็อกการบันทึกพร้อมบอกว่าขาด/เกินเท่าไร
- สลับโหมดแล้ว seed ค่าจาก equal ให้ก่อน ผู้ใช้จะได้แก้จากสถานะที่ถูกต้อง
- ทุกโหมดลงเอยเป็น `participants:[{memberId, amount}]` รูปแบบเดียว ส่วนอื่นของแอปไม่ต้องรู้ว่าใช้โหมดไหน
- **bill shape เปลี่ยน**: `participantIds[]` → `participants[{memberId,amount}]` + `splitMode` · `STORAGE_VERSION` = **4**

**สถานะทดสอบ**: 71 assertion ผ่าน ไม่มี console error

### ✅ รอบ 2026-07-27 (ดึก) — เติมเงิน · เพิ่มกระเป๋า · ปิดทริปจริง

**เติมเงิน (`#fundDialog`)** — ปุ่ม "＋ เติมเงิน" บนการ์ดกระเป๋าใช้งานได้แล้ว กรอกยอดบาท + ยอดสกุลนั้น + วันที่ · พรีวิวบอก **เรทของล็อตนี้** และ **เรทเฉลี่ยหลังเติม** เทียบกับเรทเดิม (ทดสอบ: เติม ฿25,000 = ¥100,000 ทำให้เฉลี่ยขยับ 0.2328 → 0.2377)

**เพิ่มกระเป๋า (`#walletDialog`)** — ชื่อ + สกุลเงิน + ไอคอน · เจ้าของคือ `viewerId` ปัจจุบัน · dropdown เรียงสกุลต่างประเทศไว้ก่อน THB เพราะกระเป๋าทริปมักเป็นสกุลต่างประเทศ ถ้าปล่อย THB อยู่บนสุดจะกลายเป็นค่า default เงียบ ๆ

**ปิดทริป (`computeCloseSummary()`)** — เลิกใช้ตัวเลขตายใน HTML แล้ว

- ยอดของแต่ละคนมาจาก `participants[]` **ไม่ใช่จากคนจ่าย** (คนจ่ายแค่ออกเงินให้ก่อน)
- แยกตาม `ledgerMode`: MAIN → ลงบัญชีหลัก · TRIP_ONLY → เก็บเฉพาะประวัติทริป
- แสดงเงินเหลือรายกระเป๋าที่จะคืนเข้าบัญชีต้นทาง
- **บล็อกการปิด** พร้อมบอกเหตุผลราย ๆ เมื่อ: ยอดที่แบ่งไม่ตรงยอดบิล · บิลตีมูลค่าไม่ได้ · กระเป๋าใช้เกินยอดเติม
- ยืนยันแล้ว → เขียน `wallets[].lockedRate` แช่เรทไว้ · `tripClosed = true` · ป้ายทุกที่เปลี่ยนเป็น **"ล็อกแล้วเมื่อปิดทริป"** · ปุ่มเติมเงินและปิดทริปถูกปิดใช้งาน · สถานะอยู่ข้าม reload

`STORAGE_VERSION` = **7** (เพิ่ม `wallets`, `tripClosed`, `tripCurrencies`)

**สถานะทดสอบ**: 17 assertion ของรอบนี้ผ่านหมด · regression ของ bills flow และ rate policy ผ่าน · ไม่มี console error

**การล็อกหลังปิดทริป (`applyTripLock` / `blockedByClose`)**

รอบแรกล็อกแค่ปุ่มเติมเงินกับปุ่มปิดทริป — **ยังเพิ่มบิลใหม่ได้ และยอดรวมขยับจริง** ทั้งที่หน้าจอบอกว่าล็อกแล้ว (`lockedRate` ล็อกแค่เรท ไม่ได้ล็อกตัวรายการ) แก้แล้วโดยแยกให้ชัดว่าอะไรคือ "ตัวเลขการเงิน" และอะไรคือ "เนื้อหา"

| ล็อก 🔒 | ยังแก้ได้ |
|---|---|
| จดค่าใช้จ่าย (ทุกปุ่ม + FAB) | แผนเที่ยว เพิ่ม/ลบ/ลากเรียง |
| เติมเงิน · เพิ่มกระเป๋า | เปลี่ยนแบนเนอร์ |
| เพิ่ม/แก้/ลบสกุลเงิน | เปลี่ยนไอคอนกระเป๋า |
| ปิดทริปซ้ำ | สลับมุมมองสมาชิก |

- ป้องกันสองชั้น: ปุ่ม `disabled` + `title` บอกเหตุผล **และ** handler เรียก `blockedByClose()` ซ้ำ — ทดสอบด้วยการ `b.disabled=false` ผ่าน JS แล้วกด ยังเปิดฟอร์มไม่ได้และ `bills.length` ไม่เปลี่ยน
- แถบ `.trip-locked-note` ขึ้นบนหน้าบิล/กระเป๋า/เพิ่มเติม · `#billNotice` เปลี่ยนข้อความเป็น "เรทถูกล็อกไว้ที่ค่าตอนปิดทริป" (เดิมยังขึ้น "เรทยังไม่นิ่ง" ทั้งที่ปิดไปแล้ว)

**วันลงบัญชี (`postingDate`) — แยกจากวันจบทริป**

วันที่จบทริปกับวันที่ลงบัญชีเป็นคนละเรื่อง เช่นจบทริป 27/12 แต่สรุปยอดจริง 10/1 ซึ่ง**ตกคนละปีบัญชี** ฟอร์มปิดทริปจึงมีช่องเลือกวันลงบัญชี default = `TRIP_END_DATE` และเตือนอัตโนมัติ 3 กรณี:

- ข้ามเดือน → "คนละเดือนบัญชี · จะไปอยู่ในงวด <เดือน>"
- ข้ามปี → "คนละปีบัญชี"
- ย้อนก่อนวันจบทริป → เตือนให้ตรวจซ้ำ

`postingDate` ถูกเก็บใน `tripLog` ของการปิดครั้งนั้น ไม่ใช่แค่ตัวแปรลอย

**Reopen เฉพาะ admin (`isAdmin`)**

- `members[].admin` เป็น flag ใหม่ (ตอนนี้มีแค่ North) · ปุ่ม "เปิดทริปกลับ" โผล่เมื่อ `tripClosed` และ disabled พร้อม tooltip เมื่อผู้ดูที่ไม่ใช่ admin — handler เช็กซ้ำอีกชั้น ทดสอบด้วยการปลด `disabled` ผ่าน JS แล้วยังเปิดไม่ได้
- **บังคับระบุเหตุผล ≥ 5 ตัวอักษร** เก็บลง `tripLog`
- เปิดกลับแล้ว: ลบ `wallets[].lockedRate` (เรทกลับมาขยับ) · `tripClosed = false` · `postingDate` ล้าง · ปุ่มการเงินกลับมาใช้ได้
- `tripLog[]` เป็น append-only แสดงในหน้า "เพิ่มเติม" เรียงล่าสุดบนสุด บันทึกทั้งการปิดและการเปิดกลับพร้อมชื่อผู้ทำ — **การปิดครั้งเก่าไม่ถูกลบ** เพื่อให้ตามรอยได้

`STORAGE_VERSION` = **8** (เพิ่ม `postingDate`, `tripLog`)

**⭐ ปิด → เปิดกลับ → ปิดใหม่ ต้องใช้ reversal (สำคัญมาก ห้ามทำพลาด)**

รอบแรกที่ทำ reopen บันทึกแค่เหตุผล **ไม่มีตัวเลข** และการปิดแต่ละครั้งบันทึก **ยอดเต็ม** ทั้งคู่ → ถ้า backend โพสต์ตาม log ตรง ๆ จะได้ ฿14,052 + ฿16,380 = **฿30,433 ทั้งที่ยอดจริงคือ ฿16,380** (ลงบัญชีซ้ำเท่ากับยอดปิดครั้งแรกพอดี)

แก้แล้วด้วยวิธี **กลับรายการ แล้วลงใหม่เต็ม** ตรงกับสเปก P6 เดิมที่เขียนว่า "สร้าง reversal ของ settlement เดิม (ไม่ลบ ledger)"

- ทุก entry ใน `tripLog` มี `ledgerTotal` / `tripOnlyTotal` **แบบมีเครื่องหมาย** — `close` เป็นบวก · `reopen` เป็นลบเท่ายอดของการปิดครั้งที่กำลังกลับ
- **`reopen.postingDate` = `postingDate` ของการปิดครั้งนั้น** (ไม่ใช่วันที่กดเปิดกลับ) เพื่อให้งวดที่รายงานไปแล้วถูกล้างในงวดเดิม — ตามที่ผู้ใช้เลือก
- ยอดที่เข้าบัญชีจริง = **ผลรวมทุก entry** ไม่ใช่ยอดของครั้งล่าสุด · UI แสดงเป็นบรรทัด "ยอดสุทธิที่อยู่ในบัญชีจริง"
- dialog เปิดกลับบอกล่วงหน้าว่าจะกลับรายการเท่าไร ลงวันไหน ก่อนกดยืนยัน
- ทดสอบ 2 รอบเต็ม (ปิด→เปิด→ปิด→เปิด→ปิด): ผลสุทธิ = ยอดปิดล่าสุดทุกครั้ง ไม่มีการลบ entry เก่า

⚠️ **เมื่อเชื่อม backend จริง**: อย่าให้ `/api/trips/close` โพสต์ยอดเต็มโดยไม่เช็กว่าเคยปิดมาก่อน — ต้องอ่าน `tripLog` แล้วโพสต์ reversal ก่อนเสมอ

**ขั้นยืนยันก่อนปิดทริป** — เพิ่ม checkbox `#closeAck` ที่ **ย้ำยอดจริง**ในข้อความ ("จะลงบัญชีหลัก ฿14,052 และเก็บเฉพาะประวัติทริป ฿12,074") ปุ่มยืนยันเริ่มต้นเป็น disabled เสมอ ติ๊กแล้วจึงกดได้ · ถอนติ๊กก็กลับไป disabled

**Presence / ตำแหน่งสมาชิก (requirement เดิมข้อ 3–4 ที่ค้างมาตลอด)**

`presence[memberId] = { sharing, at, place, status }` — **เก็บ timestamp ไม่ใช่พิกัดสด** โดยเจตนา เพราะ requirement คือ "เช็กอินและแชร์ขณะเปิดแอป" ไม่ใช่ background tracking · ถ้าไม่มีอะไรมารีเฟรช ข้อมูลจะค่อย ๆ เสื่อมเป็น "ข้อมูลเก่า N นาที · แอปอาจปิดอยู่" แทนที่จะทำเหมือนยังตามตัวอยู่

- 4 สถานะ: `live` (≤ `PRESENCE_FRESH_MINUTES` = 15) · `stale` (เกิน 15 นาที) · `idle` (เปิดแชร์แต่ยังไม่เช็กอิน) · `off` (ไม่แชร์)
- ปิดแชร์ → ล้าง `at`/`place` ทันที ตำแหน่งเดิมหายจากมุมมองคนอื่น และเช็กอินไม่ได้จนกว่าจะเปิดใหม่
- ข้อความ consent บอกตรง ๆ ว่า "เฉพาะขณะเปิดแอปเท่านั้น ไม่มีการติดตามเบื้องหลัง"
- สลับ `viewerId` แล้วเห็นมุมของคนนั้น — ทดสอบยืนยันว่า Ann ที่ปิดแชร์ยังเห็นความคืบหน้าของ North ที่เปิดแชร์ไว้ (requirement ข้อ 4)

`STORAGE_VERSION` = **9** (เพิ่ม `presence`)

**สถานะทดสอบรวมทั้งโปรเจกต์**: ~130 assertion ผ่าน ครอบคลุม bills flow · drag & drop · หมุด↔วัน · รูปแบบตัวเลข · picker ทั้ง 5 ชนิด · นโยบายเรท 4 สถานะ · กระเป๋า/เติมเงิน/ปิดทริป · reversal 2 รอบ · การล็อกหลังปิด · presence · ไม่มี console error

### ✅ `add_unified_trip_schema.sql` — รันบน **remote สำเร็จแล้ว** 2026-07-27

รัน `--remote` แล้ว: 34 queries · 44 rows written · ไม่มี error · ตรวจซ้ำด้วย `pragma_table_info` ได้ครบ **7 ตาราง · 8 · 3 · 2 · 3 คอลัมน์ ตรงทุกแถว** · ทุกคำสั่งเป็น `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX` / `ADD COLUMN` เท่านั้น (6+1 CREATE TABLE · 6 INDEX · 10 ADD COLUMN) — ไม่มี DROP/RENAME/DELETE/UPDATE สักคำสั่ง (`ON DELETE CASCADE` ใน FK ไม่นับ)

**ทดสอบแล้วบน SQLite ในหน่วยความจำ** โดยจำลองสคีมาเดิมจาก `backup-before-trip-finance.sql` แล้วรันไฟล์ทับ: ผ่านทั้งไฟล์ · ตารางใหม่ 7 ตาราง · คอลัมน์ครบทุกตัว · แล้ว insert ข้อมูลจริงตามที่ prototype ใช้เพื่อยืนยันว่า
- ปิด→เปิด→ปิด ได้ยอดสุทธิ ฿16,380 = ยอดปิดล่าสุด (ไม่ลงซ้ำ)
- `SUM(TripExpenseParticipants.amount_foreign)` = `TripExpenses.amount_foreign`

**ของเดิมที่ใช้ได้เลย ไม่ต้องสร้างใหม่** (ตรวจจาก backup แล้ว): `TripWallets.exclude_on_close` · `TripWallets.initial_balance_foreign/thb` · `TripWalletFundings` ครบทุกคอลัมน์ · `TripTransfers.transfer_kind` **มี `CARRY_FORWARD` รออยู่แล้ว** · `Projects.route_data` · `Projects.theme_banner`

**ช่องว่างจริง 3 ข้อที่ migration นี้ปิด**

1. `TripExpenses.member_id` มีแค่ "คนจ่าย" — ไม่มีเจ้าของเงิน visibility หรือการหาร → เพิ่ม 8 คอลัมน์ + `TripExpenseParticipants` + `TripExpenseCategories`
2. สมาชิกทริปเป็น JSON ใน `Projects.members` ใส่ `ledger_mode`/`is_admin` ไม่ได้ → `TripMembers`
3. ไม่มีที่เก็บผลการปิดทริป ตามรอย reversal ไม่ได้ → `TripClosures` (append-only, `reverses_id` ชี้กลับ) + `TripClosureLines` (การจัดการเงินเหลือ + `fx_amount`)

**⚠️ อย่าตั้งชื่อว่า `TripSettlements`** — ฐานนี้มี `Settlements` อยู่แล้ว ซึ่งคือ **การหักล้างหนี้ AR** (`parent_detail_id` ↔ `child_detail_id`, ใช้ใน backend 12 จุด) คนละเรื่องกับการปิดทริปโดยสิ้นเชิง จึงใช้ `TripClosures` / `TripClosureLines` แทนเพื่อไม่ให้สับสนภายหลัง

**สคีมา remote ยืนยันแล้ว 2026-07-27** (`SELECT name FROM sqlite_master`): มี 25 ตาราง · `TripWallets` `TripWalletFundings` `TripTransfers` `TripHoldingAccounts` `TripIconAssets` ครบตามบันทึก · **ไม่มีตารางใดใน 7 ตารางใหม่ชนกับของเดิม**

**⚠️ ฐาน local ตามหลัง remote อยู่หลาย migration** (พบ 2026-07-27)

รัน `--local` แล้วได้ `no such table: TripWallets` เพราะ **`create_wallets_and_permissions.sql` เคยรันแต่ `--remote` ไม่เคยรัน `--local`** ฐาน local จึงไม่มี `TripWallets`/`TripWalletFundings` → ใช้ซ้อมไม่ได้จนกว่าจะไล่ migration ย้อนหลังให้ครบ

ผลคือ `add_unified_trip_schema.sql` **รันบน local ไปแล้วบางส่วน** (หัวข้อ 1–3 สำเร็จ: `TripMembers` · `TripCurrencies` · `TripExpenseCategories` · `TripExpenseParticipants` + 8 คอลัมน์บน `TripExpenses`) แล้วหยุดที่หัวข้อ 4

→ จึงแยก **`add_unified_trip_schema_part2.sql`** = หัวข้อ 4–7 ที่เหลือ ทดสอบแล้วว่ารันต่อจากสถานะนั้นได้พอดี
→ บน **remote ที่ยังไม่เคยรันอะไรเลย** ให้ใช้ไฟล์เต็ม `add_unified_trip_schema.sql` ไฟล์เดียวจบ

⚠️ `ALTER TABLE ... ADD COLUMN` ไม่มี `IF NOT EXISTS` ใน SQLite — รันไฟล์เดิมซ้ำจะได้ `duplicate column name` แล้วคำสั่งที่เหลือไม่ถูกรันต่อ (ข้อมูลไม่เสีย) ถ้าเจอให้ตัดเฉพาะส่วนที่ยังไม่ได้รัน

⚠️ **wrangler `--file` ไม่พิมพ์ผล SELECT** (เป็น bulk import) — อย่าใส่ SELECT ตรวจผลไว้ในไฟล์แล้วหวังจะเห็นผล ใช้ `--command` แยกต่างหากสำหรับทุกอย่างที่ต้องดูผลลัพธ์ · เสียเวลาไป 2 รอบเพราะเรื่องนี้

**ยังไม่ได้ทำ (ต่อจากนี้)**

### ✅ `backend/src/unified-trip.js` — API adapter เฟส 1 (อ่านอย่างเดียว · **deploy แล้ว** 2026-07-27)

`GET /api/unified-trip?projectId=` + header `x-user-id` → คืนทริป · สมาชิก · สกุลเงิน · กระเป๋า(พร้อมเรทและยอด) · บิล(พร้อม categories/participants) · stops · presence · closures · ยอดสุทธิ

**แตะ `index.js` แค่ 5 บรรทัด** — import 1 + dispatch 4 บรรทัดบนสุดของ `try` ตรรกะทั้งหมดอยู่ในโมดูลแยก เพราะ `index.js` ยาว 3,568 บรรทัดและเสิร์ฟทั้งระบบ · `handleUnifiedTrip()` คืน `null` เมื่อไม่ใช่ path ตัวเอง route เดิมจึงทำงานต่อตามปกติ (ทดสอบแล้ว)

⚠️ **กรอง visibility ที่เซิร์ฟเวอร์ ไม่ใช่ที่ client** — prototype กรองฝั่ง client ซึ่งพอสำหรับข้อมูลจำลอง แต่กับข้อมูลจริงถ้าส่งบิลทุกใบไปแล้วค่อยซ่อน ใครเปิด network tab ก็อ่านได้หมด · กระเป๋าก็กรองด้วย `owner_member_id` เช่นกัน

**ทดสอบแล้ว 20 assertion** ด้วย D1 ปลอมใน Node (`node test.mjs`) ครอบคลุม: North ไม่เห็นบิล PRIVATE ของ Ann · ไม่เห็นกระเป๋าของ Ann · เรท actual 0.2328 vs planned 0.2320 · ยอดสุทธิ closures = ฿16,380 ไม่ใช่ผลบวกของ CLOSE ทั้งสอง · 401 เมื่อไม่มี x-user-id · 404 คนนอกครอบครัว · 405 เมื่อ POST · null เมื่อเป็น path อื่น

**deploy แล้ว** worker version `e3a5ca26-c812-4a07-8824-c993020703d0` · ยิงจริงผ่าน:

```
curl -H "x-user-id: 9North" ".../api/unified-trip?projectId=TRP-1783943254256"
```

คืน `viewer` = North (`TM-TRP-1783943254256-0`, is_admin 1 — ผูก `user_id='9North'` เรียบร้อยแล้ว) · members 3 คน · `currencies/wallets/expenses` เป็น array ว่างซึ่งถูกต้อง เพราะทริปนี้ยังไม่มีข้อมูลในตารางใหม่ · `stops` คืนจุดแวะเดิม 2 จุด

⚠️ **หมายเหตุ**: ทริป Hokkaido จริงมีวันที่ **2026-12-17 ถึง 2026-12-27** ไม่ใช่ ก.พ. 2027 ตามที่ prototype จำลองไว้ · `TRIP_END_DATE` ใน prototype เป็นข้อมูลสมมติ ตอนสลับมาใช้ API จริงต้องอ่านจาก `Projects.end_date`

**ยังไม่ทำ**: prototype ยังใช้ localStorage อยู่ ยังไม่สลับมาเรียก API นี้

### ✅ endpoint ฝั่งเขียน เฟส 2 — สกุลเงิน + กระเป๋า (2026-07-27 · **ยังไม่ deploy**)

เรียงจากเสี่ยงน้อยไปมากโดยตั้งใจ: สองตัวนี้ **ไม่แตะ ledger เลย** จึงทำก่อน · บิลและการปิดทริปยังไม่เปิด เพราะเป็นสองตัวที่เขียนตัวเลขเข้าบัญชีจริงและต้องมี reversal ให้ถูกก่อน

| endpoint | สิทธิ์ |
|---|---|
| `POST /api/unified-trip/currencies` | **admin เท่านั้น** — `plan_rate` เปลี่ยนวิธีตีมูลค่าเงินของทุกคนในทริป ไม่ใช่แค่ของคนที่กด |
| `DELETE /api/unified-trip/currencies?code=` | admin · ลบสกุลหลักไม่ได้ · ลบสกุลที่ยังมีกระเป๋าใช้อยู่ไม่ได้ |
| `POST /api/unified-trip/wallets` | สมาชิกสร้าง/แก้ **ของตัวเอง**ได้ · ทำให้คนอื่นได้เฉพาะ admin |

กติกาที่บังคับฝั่งเซิร์ฟเวอร์:

- **ทริปปิดแล้ว → 409 ทุก write** ตัวเลขถูกรายงานเข้าบัญชีไปแล้ว ต้องเปิดทริปกลับก่อน
- `plan_rate ≤ 0` หรือไม่ส่งมา → 400 · **ไม่แอบเติม 0 ให้** (เรท 0 = เงินไม่มีมูลค่า ซึ่งแย่กว่าการปฏิเสธ)
- สร้างกระเป๋าด้วยสกุลที่ยังไม่ได้ตั้งในทริป → 400 ไม่งั้นจะได้กระเป๋าที่ตีมูลค่าไม่ได้
- เปลี่ยนสกุลของกระเป๋าที่เติมเงินไปแล้ว → 409 เพราะเรทเฉลี่ยจะไร้ความหมายทันที
- `viewer` ที่ใช้ตรวจสิทธิ์ฝั่งเขียน = ตัวเดียวกับที่ GET ใช้กรอง (`loadContext`) จะได้ไม่มีกรณี "อ่านเห็นแต่เขียนไม่ได้"

🐞 **บั๊กที่การทดสอบจับได้ — upsert ทับกระเป๋าคนอื่นเงียบ ๆ**

ตอนแรกเขียนเป็น `INSERT ... ON CONFLICT(wallet_id) DO UPDATE` ตัวเดียวจบ โดยสร้าง id จาก `TW-{projectId}-{Date.now()}` · `Date.now()` ชนกันได้จริงเมื่อสองคำสั่งเกิดในมิลลิวินาทีเดียวกัน ผลคือ **การสร้างกระเป๋าใหม่กลายเป็นการทับกระเป๋าของคนอื่น พร้อมเปลี่ยนเจ้าของ โดยไม่มี error ให้เห็น**

แก้ด้วยการ **แยก INSERT กับ UPDATE ออกจากกัน**: ไม่มี `wallet_id` มา = สร้างใหม่ด้วย `INSERT` ล้วน (id ชน = error ดังกว่าเงียบ) · มี `wallet_id` = `UPDATE` ที่ตรวจเจ้าของก่อน

**ทดสอบด้วย** `node backend/test/unified-trip-write.test.mjs` · ใช้ sqlite ในหน่วยความจำ (`node:sqlite`) + shim ที่เลียน API ของ D1 · **ไม่แตะฐานจริงทั้ง local และ remote** · โหลด `src/unified-trip.js` ผ่าน data: URL จึงทดสอบไฟล์จริงเสมอ ไม่ใช่สำเนา · มีเคสสร้าง 20 ใบรวดเดียวเพื่อกันบั๊ก id ชนกลับมา

**deploy แล้ว** worker version `585f545e-c935-49b2-b66c-f0e1a8fd99cd` · ทริป Hokkaido ตั้ง THB(base) + JPY + กระเป๋าเยนลงฐานจริงแล้ว

### ✅ endpoint บิล — `POST/DELETE /api/unified-trip/expenses` (2026-07-27 · **ยังไม่ deploy**)

ตัวแรกที่แตะ ledger กติกาทุกข้อจึงบังคับที่เซิร์ฟเวอร์ ไม่ใช่ที่ฟอร์ม

**สามมิติของเงินในบิลใบเดียว แยกกันจริง** — `member_id` = คนจ่าย (มือที่ควักเงิน) · `owner_member_id` = เจ้าของค่าใช้จ่าย ตัวนี้ตัดสินว่าลงบัญชีหลักไหม · `wallet_id` = กระเป๋าที่ตัดเงินจริง · ยอดที่แต่ละคนรับผิดชอบมาจาก `TripExpenseParticipants` เท่านั้น ไม่ใช่จาก `member_id`

**สิทธิ์**: แก้/ลบได้เฉพาะ **เจ้าของเงินกับ admin** — คนจ่ายแทนแก้ไม่ได้ เพราะยอดที่เข้าบัญชีเป็นของเจ้าของเงิน ไม่ใช่ของคนที่ควักก่อน · บันทึกบิลให้คนอื่นเป็นเจ้าของได้เฉพาะ admin

**การหาร — ทศนิยม 2 ตำแหน่ง เศษไปที่ admin**

- `EQUAL` และ `PERCENT` คำนวณที่เซิร์ฟเวอร์เอง ไม่รับตัวเลขจาก client
- ¥1,000 ÷ 3 → **333.33 · 333.33 · 333.34** โดย 0.01 ตกที่ admin ผลรวมตรงยอดบิลพอดี
- เศษไปรวมที่**คนเดียว ไม่กระจาย** เพราะถ้ากระจายทีละสตางค์ ยอดของแต่ละคนจะไม่ตรงกับที่เห็นในใบเสร็จ
- ลำดับผู้รับเศษ: **admin → เจ้าของบิล → คนแรกในรายการ** ต้องมีคนรับเสมอ ไม่ปล่อยหาย (admin ไม่ได้ร่วมทุกบิล)
- เศษ**ติดลบก็ได้** เช่น ¥10.01 ÷ 2 ปัดขึ้นทั้งคู่เป็น 5.01 = 10.02 เกินมา 0.01 ต้องหักคืนที่ผู้รับเศษ
- API คืน `residual` กับ `residual_member_id` กลับมาด้วย เพื่อให้หน้าจอบอกได้ว่าเศษไปตกที่ใคร — ถ้าเงียบไว้ คนที่รับเศษจะเห็นยอดตัวเองไม่ตรงกับคนอื่นโดยไม่รู้สาเหตุ
- `MANUAL` **ไม่มีการเกลี่ยเศษให้** — ตัวเลขที่คนพิมพ์เองต้องบวกได้ตรงยอดบิล ถ้าระบบไปแก้ให้เงียบ ๆ คนกรอกจะไม่รู้ว่ายอดที่ตัวเองตั้งใจเพี้ยนไปแล้ว
- `round2()` คูณ 100 แล้วปัดก่อนหาร เลี่ยงกรณีคลาสสิกอย่าง 1.005 ที่ปัดผิดเพราะ float · epsilon = 0.005 (ครึ่งสตางค์) ผ่อนให้เฉพาะความคลาดเคลื่อนของ float ไม่ใช่ให้ยอดเพี้ยนได้

**ที่ปฏิเสธ**: ยอด ≤ 0 · วันที่ไม่ใช่ YYYY-MM-DD · ยอดหมวดหรือยอดผู้ร่วมจ่ายไม่เท่ายอดบิล · ชื่อผู้ร่วมจ่ายซ้ำ · คนนอกทริป · สกุลที่ไม่ได้ตั้งในทริป · กระเป๋าคนละสกุลกับบิล · **ตัดเงินจากกระเป๋าของคนอื่น** (ยอดคงเหลือจะเพี้ยน) · `SELECTED` ที่มีคนเดียว (นั่นคือ `PRIVATE`)

⚠️ **`TripExpenses.amount_thb` เป็น NOT NULL มาแต่เดิม** และหน้าอื่นในระบบยังอ่านอยู่ จึงต้องใส่ค่าเสมอ — แต่**ห้ามใส่ 0 เมื่อไม่รู้เรท** เพราะเท่ากับบันทึกว่าของฟรี · ถ้าไม่มีเรทเลยจะ **400** ไปเลย · ค่าที่เก็บเป็นภาพนิ่ง ณ ตอนบันทึก ตัวเลขที่ใช้จริงคือค่าที่ GET คำนวณสด และค่าที่ล็อกตอนปิดทริป

**batch = atomic** — บิลกับหมวด/ผู้ร่วมจ่ายเข้า-ออกพร้อมกัน มีเทสที่จงใจทำให้พังกลางชุดแล้วยืนยันว่าไม่มีบิลกำพร้าเหลือ · การแก้บิลใช้วิธีลบลูกทั้งหมดแล้วเขียนใหม่ ง่ายและถูกกว่าการ diff ทีละแถว

### ✅ endpoint เติมเงิน — `POST/DELETE /api/unified-trip/fundings` (2026-07-28)

ล็อตเติมเงินคือ**ที่มาของเรทจริงทั้งหมด** ถ้าไม่มีตัวนี้ ทุกอย่างจะค้างอยู่ที่ `plan_rate` ตลอดทริป (`planned` ไม่มีวันกลายเป็น `actual`)

- ⚠️ **`rate` ไม่รับจาก client เด็ดขาด** คำนวณเป็น `thb ÷ foreign` เสมอ · ถ้าปล่อยให้ส่งมา ตัวเลขที่เก็บอาจไม่ตรงกับเงินที่จ่ายจริง แล้วต้นทุนตอนปิดทริปจะเพี้ยนโดยไม่มีใครจับได้ · มีเทสยิง `rate: 99` เข้ามาแล้วยืนยันว่าถูกเมิน
- `foreign_amount = 0` → 400 (กันหารด้วยศูนย์ที่จะทำให้เรทกลายเป็น Infinity)
- API คืน **`wallet_rate` = ค่าเฉลี่ยใหม่ของทั้งกระเป๋า** ไม่ใช่แค่เรทของล็อตที่เพิ่งใส่ เพราะยอดบาทของบิลทุกใบในกระเป๋านั้นขยับตามค่าเฉลี่ย ไม่ใช่ตามล็อตล่าสุด
- เติมเงินเข้ากระเป๋าคนอื่นได้เฉพาะ admin
- **ล็อตที่ยกยอดมาจากทริปก่อน (`carried_from_closure_id`) ลบไม่ได้ → 409** ต้องไปเปิดทริปต้นทางกลับแล้วแก้ที่นั่น ไม่งั้นต้นทุนที่ยกมาจะหายไปจากทั้งสองทริปพร้อมกัน
- มีเทสยืนยันว่า**บันทึกย้อนหลังให้ผลเท่าเดิม** — ล็อตลงวันที่ 1 ธ.ค. ใส่ทีหลังล็อตวันที่ 20 ธ.ค. แล้วค่าเฉลี่ยยังตรง เพราะสูตรเป็น Σthb ÷ Σforeign ไม่สนลำดับและวันที่

**ทดสอบแล้วรวม 102 เคส**

### ✅ ปิดทริป · เปิดกลับ — `POST /api/unified-trip/closures` + `/closures/reopen` (2026-07-28)

ตัวเดียวในระบบที่โพสต์ตัวเลขเข้าบัญชีจริง จึงเป็นจุดที่พังง่ายที่สุด

🔑 **กติกาแกนกลาง: ยอดที่เข้าบัญชี = `SUM(ledger_total)` ของทุกแถว ไม่ใช่แถวล่าสุด**

```
ปิดครั้งแรก   CLOSE   +585   posting_date 2027-01-10
เปิดกลับ      REOPEN  −585   posting_date 2027-01-10  ← วันเดิม ไม่ใช่วันนี้
ปิดอีกครั้ง   CLOSE   +819   posting_date 2027-01-15
                     ─────
สุทธิ                  819   ✅  (ถ้าไม่มีแถวกลับจะกลายเป็น 1,404 = โพสต์ซ้ำ)
```

- แถวกลับใช้ **`posting_date` เดิมของครั้งที่กลับ** เพราะรายการกลับต้องหักล้างในงวดเดียวกับที่โพสต์ไป ไม่ใช่งวดที่กดเปิดกลับ
- หา CLOSE ที่จะกลับด้วย `NOT EXISTS (SELECT 1 FROM TripClosures r WHERE r.reverses_id = c.closure_id)` — ไม่ใช่แถวล่าสุดเฉย ๆ ไม่งั้นจะไปกลับแถวที่กลับไปแล้ว
- เปิดกลับ **บังคับกรอกเหตุผล** เพราะรายการกลับทางบัญชีต้องอธิบายได้
- routing: `/closures/reopen` ต้องอยู่ **ก่อน** ด่าน "ทริปปิดแล้วห้ามเขียน" ไม่งั้นจะไม่มีทางเปิดกลับได้เลย

**เงินเหลือในกระเป๋า** — ปิดทั้งที่ยังมีเงินเหลือแล้วไม่บอกว่าจะเอาไปไหน → **400** ถ้าปล่อยผ่าน เงินก้อนนั้นจะหายจากบัญชีเงียบ ๆ

| disposition | ผล |
|---|---|
| `RETURN` แลกกลับเป็นบาท | **รับรู้กำไรขาดทุนตรงนี้** `fx = received_thb − thb_cost` |
| `CARRY` ยกไปทริปหน้า | **ยังไม่รับรู้** `fx = 0` ต้นทุนย้ายไปทั้งก้อน — รับรู้ตรงนี้ = รับรู้กำไรที่ยังไม่เกิดจริง |

**ล็อกเรทตอนปิด** — เขียน `TripWallets.locked_rate` + `TripExpenses.settled_rate/settled_amount_thb` ลงกับตัวข้อมูลเอง ไม่ใช่คำนวณใหม่ตอนอ่าน เพื่อให้ยอดที่รายงานไปแล้วนิ่งแม้มีคนไปแก้ล็อตเติมเงินทีหลัง · **เปิดกลับจะล้างค่าเหล่านี้** ให้กลับไปคำนวณสด

**ยอดแยกตาม `ledger_mode` ของเจ้าของยอด** (จาก `TripExpenseParticipants`) ไม่ใช่ของคนจ่าย — `MAIN` → `ledger_total` · `TRIP_ONLY` → `trip_only_total` แยกไว้ต่างหาก ไม่เข้าบัญชีหลัก

**ทดสอบแล้วรวม 133 เคส** — รวมวงจร ปิด→เปิด→ปิด→เปิด→ปิด สองรอบเต็ม ยืนยันว่าสุทธิยังเป็น 819 เท่าเดิมทุกครั้ง

### ✅ prototype อ่านข้อมูลจริงได้แล้ว — `?live=1` (2026-07-28 · `api.js?v=1` · `app.js?v=34` · `style.css?v=32`)

```
index.html?live=1&projectId=TRP-1783943254256&userId=9North
```

**ไม่ใส่ = ข้อมูลตัวอย่างเหมือนเดิมทุกประการ** ไม่มีอะไรเปลี่ยนสำหรับคนที่เปิดหน้าธรรมดา

`api.js` แมป snake_case ของฝั่งฐาน → camelCase ของ prototype ที่เดียว แทนที่จะให้แต่ละหน้าจอไปรู้จักชื่อฝั่งฐานเอง · ล็อตเติมเงินซ้อนอยู่ใน `wallets[].fundings` ต้องคลี่ออกมาเป็นรายการเดียว

**เปิดการเขียนทีละส่วน ไม่ใช่ทีเดียวทั้งหน้า** — `LIVE_WRITABLE` ใน `app.js` คุมว่าส่วนไหนเขียนลงฐานได้แล้ว

| ส่วน | สถานะ |
|---|---|
| บิล · กระเป๋า · สกุลเงิน · เติมเงิน · ปิดทริป/เปิดกลับ | ✅ เขียนลงฐานจริงครบทุกส่วนแล้ว |

**ปิดทริปในโหมดข้อมูลจริง**

- วันลงบัญชีต้องมาจาก `Projects.end_date` (เก็บใน `liveTripEndDate`) **ไม่ใช่ `TRIP_END_DATE`** ซึ่งเป็นค่าสมมติของข้อมูลตัวอย่าง (ก.พ. 2027) — เผลอใช้ตัวนั้นจะลงบัญชีผิดงวดไปทั้งทริป
- หน้าจอส่งแค่ `posting_date` + `lines` (disposition ของทุกกระเป๋าที่มีเงินเหลือ) · **ไม่ส่งยอดที่ลงบัญชีขึ้นไป** ปล่อยให้เซิร์ฟเวอร์คิดจาก `TripExpenseParticipants` จริง
- เปิดกลับส่งแค่ `reason` · **หน้าจอไม่เลือกเองว่าจะกลับรายการปิดครั้งไหน** ปล่อยให้เซิร์ฟเวอร์หา ไม่งั้นสองที่อาจเลือกคนละแถว
- ป้ายล็อกมี **สามสถานะ** ไม่ใช่สอง: ปิดแล้ว(จริง) · ปิดแล้ว(ตัวอย่าง) · เปิดอยู่แต่เป็นข้อมูลจริง — ถ้ารวบเหลือสองจะมีกรณีที่ป้ายบอกว่า "ทริปปิดแล้ว" ทั้งที่ทริปยังเปิดอยู่ (พลาดมาแล้ว)

`applyTripLock()` ผูกปุ่มแต่ละตัวกับ area ของตัวเอง ไม่ใช่สถานะรวมของทั้งหน้า — ไม่งั้นพอเปิดทีละส่วน ปุ่มจะยังถูกล็อกทั้งแถบทั้งที่ API พร้อมแล้ว (พลาดมาแล้วรอบหนึ่ง)

`submitLive()` เป็นตัวกลางของทุกฟอร์ม: ส่ง → ดึงใหม่ทั้งชุด → ปิดฟอร์ม · **ล้มเหลว = ไม่ปิดฟอร์ม** และแสดงเหตุผลจากเซิร์ฟเวอร์ตามจริง เช่น "ยังมีกระเป๋า 2 ใบใช้สกุล JPY อยู่" ซึ่งบอกทางแก้ไปในตัว ดีกว่าข้อความกลาง ๆ ที่หน้าจอเดาเอง

จุดที่ระวังเป็นพิเศษ:

- **แก้สกุลเงินต้องส่ง `is_base` เดิมกลับไปด้วย** ไม่งั้นสกุลหลักจะถูกลดชั้นเป็นสกุลธรรมดา · UI ไม่มีปุ่มแก้ให้สกุลหลักอยู่แล้ว แต่โค้ดอ่านค่าเดิมมาส่งด้วยเป็นชั้นที่สอง
- **เติมเงินไม่ส่ง `rate`** ปล่อยให้เซิร์ฟเวอร์คิด `thb ÷ foreign` เอง
- **ช่องติ๊ก "ยกเว้นตอนปิดทริป" ล้มเหลว = คืนค่าติ๊กกลับ** ไม่ปล่อยให้จอโชว์สถานะที่ไม่ตรงกับฐาน

`blockedByClose(area)` รับชื่อส่วนเป็นพารามิเตอร์ · **ไม่ส่ง area = ถือว่ายังไม่เปิด** ปลอดภัยไว้ก่อน

- `saveState()` ถูกปิดทันทีในโหมดนี้ ไม่งั้นข้อมูลจริงจะไปทับ localStorage ของโหมดตัวอย่าง แล้วพอกลับมาโหมดปกติจะเห็นตัวเลขจริงปนอยู่
- ส่วนที่ยังไม่เปิดถูกล็อกด้วย `applyTripLock()` — ถ้าไม่ล็อก คนใช้จะแก้บนจอแล้วเข้าใจว่าบันทึกลงฐานแล้ว ทั้งที่หายตอน reload
- แถบบนสุดที่เขียนว่า "ข้อมูลจำลอง ไม่เชื่อมบัญชีจริง" **ถูกแก้ข้อความในโหมดนี้** เพราะกลายเป็นคำที่ผิดทันที

**เขียนบิลแล้วดึงใหม่ทั้งชุด ไม่แก้อาร์เรย์ฝั่งหน้าจอเอง** — เซิร์ฟเวอร์เป็นคนปัดเศษ เกลี่ยเศษให้ admin และคิดเรทเฉลี่ยใหม่ ถ้าหน้าจอเดาผลลัพธ์เอง ตัวเลขบนจอกับในฐานจะค่อย ๆ ห่างกันโดยไม่มีใครรู้ · toast บอกด้วยว่าเศษไปตกที่ใคร

⚠️ **`refreshQuickAdd()` เขียนทับ `#saveWarning`** — ตอน handle error ต้องเขียนข้อความจากเซิร์ฟเวอร์ **หลัง** เรียกมัน ไม่งั้นเหตุผลที่บันทึกไม่ผ่านจะถูกลบทิ้งทันทีจนคนใช้ไม่เห็นอะไรเลย (เจอจากเทสเบราว์เซอร์)

⚠️ **`.add-expense` มีอยู่ 3 ที่ในหน้า** เวลาเขียนเทสต้องเลือก `:visible` ไม่ใช่ `.first()` เพราะตัวแรกใน DOM อาจอยู่บนหน้าจอที่ซ่อนอยู่
- **ข้อความในป้ายล็อกแยกจากกัน** `LIVE_LOCK_REASON` vs `TRIP_LOCK_REASON` ไม่งั้นจะขึ้นว่า "ทริปนี้ปิดแล้ว" ทั้งที่ทริปยังเปิดอยู่
- แถบแดงบนสุดบอกชื่อทริป · จำนวนบิล · ยอดสุทธิ · จำนวนบิลที่ถูกซ่อนจากผู้ใช้คนนี้ · ตั้งใจให้เด่นจนมองข้ามไม่ได้ เพราะความต่างระหว่างข้อมูลตัวอย่างกับเงินจริงต้องไม่ต้องเดา
- **โหลดไม่สำเร็จต้องบอกให้ชัดว่ากำลังดูข้อมูลตัวอย่างอยู่** ไม่ใช่เงียบแล้วปล่อยให้เข้าใจผิดว่าตัวเลขบนจอมาจากฐานจริง

⚠️ `let liveMode` ต้องประกาศ**บนสุดของ app.js** เพราะ `applyTripLock()` ถูกเรียกตั้งแต่ render รอบแรก ถ้าประกาศไว้ท้ายไฟล์จะชน TDZ (เคยพลาดมาแล้วรอบหนึ่ง เจอตอนรันเบราว์เซอร์จริง)

**ข้อความบนจอต้องตรงกับข้อมูลที่กำลังแสดง**

- ชื่อทริปกับช่วงวันที่ใน header/side-rail เป็นข้อความคงที่ใน HTML (`8–19 ก.พ. 2027`) → โหมดข้อมูลจริงเขียนทับด้วย `Projects.name` + `start_date`/`end_date` ไม่งั้นหัวหน้าจอจะขัดกับตัวเลขทั้งหน้าที่อยู่ข้างล่าง
- `tripEndISO()` แทน `TRIP_END_DATE` ทุกที่ที่เตือนเรื่องงวดบัญชี — ไม่งั้นจะเตือนเทียบกับวันจบทริปของข้อมูลตัวอย่าง
- **แผนเที่ยวอ่านจาก `TripStops` จริงแล้ว** จัดกลุ่มตาม `stop_date` เรียงด้วย `sort_order` ก่อนแล้วค่อยเวลา (เวลาชนกันได้ ลำดับจึงต้องมีตัวตัดสิน) · ทริปที่ยังไม่มีจุดแวะจะคงแผนตัวอย่างไว้พร้อมป้ายบอก จะได้ไม่เห็นหน้าว่างเปล่า
- **แก้แผนเที่ยวลงฐานจริงได้แล้ว** — `POST /stops` · `DELETE /stops?id=` · `POST /stops/order`
  - **สมาชิกทุกคนแก้ได้ ไม่ต้องเป็น admin หรือเจ้าของ** เพราะแผนเที่ยวไม่ใช่เรื่องเงิน
  - **ทริปที่ปิดแล้วก็ยังแก้แผนได้** — การปิดทริปล็อกเฉพาะตัวเลขที่รายงานเข้าบัญชี ไม่ควรห้ามแก้บันทึกการเดินทางย้อนหลัง · routing ฝั่งเซิร์ฟเวอร์วาง `/stops` ไว้ **ก่อน**ด่านทริปปิด และ `financeLocked('plan')` ฝั่งหน้าจอก็ยกเว้นให้เหมือนกัน — **สองฝั่งต้องตรงกัน** ไม่งั้นจะกดได้แต่บันทึกไม่ผ่าน
  - จัดลำดับส่ง **ทั้งชุดทุกวัน** ในคำสั่งเดียว ไม่ใช่ทีละแถว — ลากทีเดียวกระทบหลายแถว ถ้ายิงทีละอันแล้วขาดกลางคัน ลำดับในฐานจะค้างครึ่ง ๆ ไม่ตรงกับที่เห็นบนจอ · `sort_order` นับใหม่จาก 1 ทุกวัน
  - ⚠️ id ที่ prototype สร้างเอง (`activity-…`) **ห้ามส่งขึ้นไป** ไม่งั้นเซิร์ฟเวอร์หาไม่เจอแล้วตอบ 404 ทั้งที่เป็นการสร้างใหม่
- ⚠️ **ไม่แต่งพยากรณ์อากาศขึ้นมาเอง** — วันที่มาจากฐานไม่มีคีย์ `weather` เลย การ์ดอากาศจะขึ้นว่า "ยังไม่มีข้อมูล" และกล่องอากาศในหน้าแผนถูกซ่อน · ตรงกับ guardrail เดิม "อย่าอ้างว่า weather/location เป็นข้อมูลจริง"
- ⚠️ `renderTodayWeather` ผูกกับ `dayId` ของแผนตัวอย่าง พอเปลี่ยนเป็นวันจริงแล้ว id ไม่ตรงกัน ฟังก์ชันจะ `return` ทันทีและ**ปล่อยตัวเลขเดิมค้างบนจอ** จึงต้องสั่ง render ใหม่เองหลังเปลี่ยน `planDays` (เจอจากเทส)

**รู้ว่าเป็นใครจาก session ที่ล็อกอินแล้ว** — อ่าน `sessionStorage.logged_in_user` ที่แอปหลักเขียนไว้ (โดเมนเดียวกัน) · `?userId=` เหลือไว้เป็นทางลัดสำหรับทดสอบเท่านั้น และ **session ชนะ URL เสมอ** ใครยัด `?userId=` ของคนอื่นมาก็ไม่ทับ · ถ้ามาจาก URL แถบบนจะขึ้นคำเตือนว่า "ระบุตัวตนจาก URL ไม่ใช่การล็อกอิน"

⚠️ `sessionStorage` แยกตามแท็บ — เปิดหน้านี้ในแท็บใหม่จะไม่เห็นการล็อกอิน ต้องกดลิงก์จากในแอปในแท็บเดิม

### ✅ Session token — `backend/src/session.js` + `add_sessions_table.sql` (2026-07-28)

**ปัญหาเดิม**: ทุก endpoint อ่าน `x-user-id` แล้วเชื่อทันทีโดยไม่ตรวจอะไรเลย รวม **45 จุด** · ใครรู้ `user_id` ของคนในบ้านก็ `curl` อ่านข้อมูลการเงินทั้งครอบครัวได้โดยไม่ต้องมีรหัสผ่าน และแอปเปิดสาธารณะอยู่บน pages.dev

**สิ่งที่เปลี่ยน**

- ล็อกอินสำเร็จ → ออก token สุ่ม 256 บิต อายุ 30 วัน · ฐานเก็บ **SHA-256 ของ token ไม่ใช่ตัว token** (ฐานหลุดก็สวมสิทธิ์ไม่ได้ · token สุ่มอยู่แล้วจึงไม่ต้อง PBKDF2 แบบรหัสผ่านที่คนตั้งเอง)
- **ระบุตัวตนที่เดียวใน `index.js`** (`const authUserId = await resolveUserId(...)`) แล้วส่งต่อให้ทุก route · เดิม 45 จุดอ่าน header เองซึ่งแปลว่าถ้าจะเพิ่มการตรวจสอบต้องแก้ทั้ง 45 จุด พลาดจุดเดียวก็รั่วทั้งระบบ
- `unified-trip.js` **เลิกอ่าน header เอง** รับ `userId` เป็นพารามิเตอร์แทน จะได้ไม่มีสองที่ตัดสินว่าใครเป็นใครคนละแบบ
- `/api/logout` ลบ token ฝั่งเซิร์ฟเวอร์ ไม่ใช่ลบแค่ในเบราว์เซอร์ — ถ้าลบแค่ฝั่งหน้าจอ token ที่หลุดไปแล้วจะยังใช้ได้จนหมดอายุ
- frontend **ห่อ `fetch` ที่เดียว** แนบ `Authorization` อัตโนมัติ แทนการไล่แก้ 71 จุดที่เรียก API (พลาดจุดเดียวก็กลับไปใช้ทางไม่ปลอดภัยเงียบ ๆ) · ไม่แนบให้คำขอที่ไปโดเมนอื่น กัน token รั่ว

⚠️ **จุดที่พลาดง่ายที่สุด — token ที่ใช้ไม่ได้ต้องไม่ตกไปใช้ `x-user-id` ต่อ** ไม่งั้นคนที่ถือ token หมดอายุจะยังเข้าได้ด้วยการเดา `user_id` = เท่ากับไม่ได้แก้อะไรเลย · มีเทสจับเคสนี้โดยเฉพาะ

🔁 **ยังอยู่ในช่วงเปลี่ยนผ่าน** — `ALLOW_HEADER_FALLBACK = true` ใน `session.js` ยังยอมรับ `x-user-id` เมื่อไม่มี token เพื่อให้หน้าเว็บเก่าไม่พัง **ตราบใดที่ยังเป็น true ช่องโหว่เดิมยังเปิดอยู่**

ปิดช่องเมื่อยืนยันว่าทุกหน้าส่ง token แล้ว:
1. ล็อกอินใหม่ทุกอุปกรณ์ (token ออกตอนล็อกอินเท่านั้น)
2. เปิด DevTools → Network ดูว่าคำขอมี `Authorization: Bearer` ครบ
3. เปลี่ยน `ALLOW_HEADER_FALLBACK` เป็น `false` → deploy
4. ทดสอบว่า `curl -H "x-user-id: 9North" .../api/unified-trip?projectId=...` ต้องได้ **401**

**ทดสอบแล้ว 22 เคส** — `node backend/test/session.test.mjs`

**ทดสอบแล้ว 106 เคสด้วย Chromium จริง**

### รันเทสทั้งหมด

```
npm test            # ทุกชุด (331 เคส)
npm run test:api    # 225 — ไม่ต้องลงอะไรเพิ่ม
npm run test:ui     # 106 — ต้องมี playwright
```

| ชุด | เคส | ครอบคลุม |
|---|---|---|
| `backend/test/session.test.mjs` | 22 | session token |
| `backend/test/auth.test.mjs` | 27 | hash รหัสผ่าน |
| `backend/test/unified-trip-write.test.mjs` | 176 | API ฝั่งเขียนทั้งหมด |
| `frontend/trip-unified-prototype/live-mode.test.mjs` | 106 | หน้าจอจริงบน Chromium |

**ทุกชุดไม่แตะฐานจริง** ทั้ง local และ remote

### ✅ ปิดทริปโพสต์เข้าบัญชีจริงได้แล้ว — `add_closure_ledger_link.sql` (2026-07-28)

**1 Transaction ต่อการปิดหนึ่งครั้ง · รายการย่อยแยกตามหมวด**

- โพสต์**เฉพาะเมื่อส่ง `account_id` มา** · ไม่ส่ง = เก็บใน `TripClosures` อย่างเดียวเหมือนเดิม จะได้ไม่เผลอเขียนลงสมุดบัญชีโดยไม่ตั้งใจ
- 🔑 **ผูกหมวดกับสมุดบัญชีตั้งแต่ตอนบันทึกบิล ไม่ใช่ตอนปิดทริป** — ฟอร์มบิลมีช่อง "ผูกกับสมุดบัญชี" ต่อหนึ่งแถวหมวด เลือกจากผังบัญชีจริง จัดกลุ่มด้วย `<optgroup>` ตาม Caption
  - **คนที่จดบิลรู้ดีที่สุดว่ามันคือค่าอะไร** ส่วนคนปิดทริปมาทีหลังต้องมานั่งเดา — จึงย้ายการตัดสินใจไปไว้ที่คนที่รู้
  - ตรวจตั้งแต่ตอนบันทึก: หมวดต้องมีอยู่จริง · อยู่ในครอบครัวเดียวกัน · และอยู่ใต้ Caption ที่ `behavior = 'EXPENSE'` (ผูกกับหมวดฝั่งรายได้ = 400)
  - `GET /api/unified-trip` ส่ง `ledger_categories` มาให้ฟอร์มเลือก (เฉพาะฝั่งค่าใช้จ่าย)
  - ตอนปิดทริปยังมี `category_map` / `default_category_id` เป็นตาข่ายรับของเก่าที่บันทึกไว้ก่อนมีช่องนี้ · จับคู่ไม่ได้ = **ปฏิเสธพร้อมบอกว่าหมวดไหน** ดีกว่ายัดลง "อื่น ๆ" แล้วงบรวมเพี้ยนโดยไม่มีใครรู้
- ⚠️ **ยอดคิดตามสัดส่วนของคนที่ `ledger_mode = MAIN` เท่านั้น** บิล ¥5,000 ที่หารกับคน TRIP_ONLY ครึ่งหนึ่ง เข้าบัญชีแค่ครึ่งเดียว
- **เปิดทริปกลับ = โพสต์รายการติดลบ ไม่ลบของเดิม** — สมุดบัญชีมีแต่เพิ่ม ไม่มีลบ ไม่งั้นงบที่พิมพ์ออกไปแล้วจะอธิบายไม่ได้ว่ารายการหายไปไหน · ลงวันเดียวกับรายการเดิม
- `Transactions.source` มี CHECK จำกัด 4 ค่าและ D1 แก้ CHECK ไม่ได้ จึงใช้ `WEB_GRID` ซึ่งแปลว่า "สร้างจากหน้าเว็บ" — ใกล้เคียงที่สุดและไม่ผิดความจริง

🔑 **ตัวตรวจที่แข็งแรงที่สุดในชุดนี้**: ยอดที่โพสต์เข้าบัญชีกับ `ledger_total` ใน `TripClosures` คำนวณคนละทาง (ทางหนึ่งไล่ตามผู้ร่วมจ่าย อีกทางไล่ตามหมวด) เทสบังคับให้ได้เลขเดียวกัน

⚠️ **ผังบัญชีของบ้านนี้เป็นหมวดเชิงธุรกิจล้วน** (Audit · Service · Salary · Revenue · Expense · Forex …) ไม่มีหมวดท่องเที่ยว — ตอนใช้จริงต้องเลือกว่าจะเพิ่มหมวดใหม่หรือใช้ `Expense` หมวดเดียว

**ยังไม่ทำ**: หน้าจอยังไม่มีที่ให้เลือก **บัญชีปลายทาง** (`account_id`) ตอนปิดทริป — ตอนนี้ต้องส่งผ่าน API เท่านั้น ถ้าไม่ส่งก็ไม่โพสต์เข้าบัญชี — `node frontend/trip-unified-prototype/live-mode.test.mjs` · เสิร์ฟไฟล์เอง + API ปลอมที่คืนรูปเดียวกับของจริง **ไม่ยิงฐานจริงเลย** · ครอบคลุมทั้งโหมดปกติ · โหมดจริง · กรณี API ล้ม · และ console สะอาด

💡 บทเรียนจากการเขียนเทสรอบนี้: ตอนแรกตั้งชื่อบิลใน payload ทดสอบว่า "มื้อเย็นร้านปู" ซึ่ง**ตรงกับชื่อบิลในข้อมูลตัวอย่าง** ทำให้ assertion ผ่านทั้งที่ไม่ได้พิสูจน์อะไร — ค่าที่ใช้เช็คต้องมีเฉพาะในฝั่งที่กำลังทดสอบเท่านั้น

**ยังไม่ทำ**: `CARRY` บันทึกเจตนาไว้ใน `TripClosureLines` แล้ว แต่**ยังไม่สร้างล็อตเติมเงินจริงในทริปถัดไป** (ต้องรอมีทริปปลายทางก่อน) · ตอนสร้างต้องใช้ `thb = thb_cost` เท่านั้น **ห้ามคิดใหม่จาก `foreign × เรทปัจจุบัน`** ไม่งั้นต้นทุนจะเปลี่ยนระหว่างทาง · และยังไม่มีคู่ `Transactions`/`TransactionDetails` จริง มีแต่ตัวเลขใน `TripClosures`

---

### ✅ รหัสผ่านเก็บเป็น hash แล้ว — `backend/src/auth.js` (2026-07-28)

PBKDF2-SHA256 · 100,000 รอบ · salt สุ่ม 16 ไบต์ · ผ่าน Web Crypto ที่ Workers มีอยู่แล้ว ไม่ต้องลง dependency

```
pbkdf2$sha256$100000$<salt-base64>$<hash-base64>
```

🔑 **ไม่ migrate ทั้งตารางทีเดียว — อัปเกรดทีละคนตอนล็อกอินสำเร็จ**

hash ย้อนกลับเป็นข้อความเดิมไม่ได้ ถ้าแปลงทั้งตารางพร้อมกันแล้วมีอะไรผิด จะไม่มีใครล็อกอินได้เลยและกู้ไม่ได้ · วิธีนี้รหัสเก่ายังใช้ได้ตามปกติ พอใครล็อกอินผ่าน ระบบเขียนทับด้วย hash ให้เอง **ไม่มีช่วงที่ใครเข้าไม่ได้ ไม่ต้องรีเซ็ตรหัสใคร**

- ⚠️ `/api/login` **เลิกใส่ password ลงใน SQL แล้ว** — พอเก็บเป็น hash การเทียบ `AND password = ?` จะไม่มีวันตรง ต้องดึงผู้ใช้ด้วยชื่อ/อีเมลก่อนแล้วตรวจในโค้ด
- ตอบข้อความเดียวกันทั้งกรณีไม่มีผู้ใช้และรหัสผิด จะได้ไม่บอกใบ้ว่าชื่อไหนมีอยู่จริง
- เทียบแบบ **เวลาคงที่** ทั้งสองเส้นทาง — ออกจากลูปทันทีที่เจอไบต์ต่างกันจะทำให้เดาทีละไบต์ได้จากการจับเวลา
- endpoint จัดการผู้ใช้ hash ก่อนเก็บเสมอ · `isHashed()` กันการ hash ซ้ำเวลาแก้ผู้ใช้โดยไม่เปลี่ยนรหัส (ถ้า hash ซ้ำ รหัสเดิมจะใช้ไม่ได้ทันที)
- อัปเกรดล้มเหลว **ไม่ทำให้ล็อกอินพัง** เป็นงานเบื้องหลัง ครั้งหน้าลองใหม่เอง

**ทดสอบแล้ว 27 เคส** — `node backend/test/auth.test.mjs` · วัดเวลาด้วย: ตรวจรหัสหนึ่งครั้ง **~9 ms** อยู่ในเพดาน CPU ของ Worker สบาย ๆ

ตรวจว่าอัปเกรดแล้วหรือยังโดยไม่ต้องแสดงรหัส:

```sql
SELECT user_id, LENGTH(password) AS len,
       (password LIKE 'pbkdf2$%') AS hashed FROM Users;
```

⚠️ **เวลาแก้รหัสผ่านผ่าน wrangler ให้ใช้ heredoc เท่านั้น** — zsh กิน `!` ใน double quote และ single quote ซ้อนกันไม่ได้ (เคยพังมาแล้ว: `unrecognized token: "9North"`)

```bash
cat > /tmp/pw.sql <<'SQL'
UPDATE Users SET password = 'รหัสใหม่' WHERE user_id = '9North';
SQL
npx wrangler d1 execute record-revenue-db --remote --file=/tmp/pw.sql
rm /tmp/pw.sql
```

ตรวจโดยไม่ต้องแสดงรหัส: `SELECT user_id, LENGTH(password) AS len, (password = TRIM(password)) AS clean FROM Users;`

🔴 **บทเรียนความปลอดภัย 2026-07-27 — อย่าใช้ `git add -A` ในโปรเจกต์นี้**

`git add -A` กวาด `backup-before-trip-finance.sql` เข้า git ซึ่งมีแถว `INSERT INTO "Users"` **เก็บรหัสผ่านเป็นข้อความธรรมดา** และ commit นั้นถูก push ขึ้น GitHub ไปแล้วก่อนจะรู้ตัว → ต้องเปลี่ยนรหัสผ่าน + `push --force-with-lease` ทับ

- `.gitignore` เพิ่ม `backup-before-trip-finance.sql` · `backend/db/live_backup.sql` · `backend/db/seed_historical_data.sql` แล้ว (รวม ~17 MB ของ dump ข้อมูลจริง)
- **ต่อไปให้ระบุไฟล์ทีละตัว** หรืออย่างน้อยรัน `git status` ดูก่อนเสมอ — root ของโปรเจกต์นี้มี dump ฐานข้อมูลจริงวางอยู่หลายไฟล์
- ⚠️ commit ที่ถูก force-push ทับยังเข้าถึงได้ผ่าน SHA บน GitHub อีกระยะจนกว่าจะ garbage collect การเปลี่ยนรหัสผ่านจึงเป็นการแก้ที่แท้จริง ไม่ใช่การลบ commit

🔒 **git ใน Google Drive ล็อกไฟล์**: `git commit` ล้มด้วย `cannot lock ref 'HEAD': .git/HEAD.lock: File exists` เพราะ Drive sync จับไฟล์ค้าง · แก้ด้วยการลบ lock ที่ค้าง (ดูว่าไม่มี git process รันอยู่ก่อน) · เป็นความเสี่ยงระยะยาวของการวาง `.git` ไว้ในโฟลเดอร์ที่ sync

⚠️ `backend/src/index.js` มีงาน security ของ 2026-07-25 **ค้างอยู่ 244 บรรทัดที่ยังไม่ commit** (`getAccessibleTrip` ฯลฯ) — commit ล่าสุดคือ `d2b8712` ถ้า deploy จะติดไปด้วย ควรตรวจก่อน

- ขั้นถัดไป: deploy แล้วยิงทดสอบด้วยข้อมูลจริง ก่อนเขียน endpoint ฝั่ง write
### ✅ `migrate_trip_members.sql` — รันบน **remote สำเร็จแล้ว** 2026-07-27

ผลจริง: **8 แถว** จาก 6 ทริป · ทุกทริปมี admin คนเดียวถ้วน · ตรงกับ preview ทุกแถว

| ทริป | สมาชิก |
|---|---|
| ็Hokkaido 2026 | North (ผู้ดูแล) · Puii · XinXin |
| อีก 5 ทริป | ทริปทดสอบชื่อมั่ว (`asdfsadf`, `ฟหกดฟหก`) ทริปละ 1 คน |

⚠️ **ยังไม่มีใครผูก `user_id`** — ทุกแถวเป็น NULL ต้องรัน UPDATE เองเพื่อผูก `9North` เข้ากับสมาชิกที่ใช่ ไม่งั้นล็อกอินแล้วระบบไม่รู้ว่าเป็นสมาชิกคนไหน

คู่กับ `migrate_trip_members_preview.sql` (อ่านอย่างเดียว ดูก่อนว่าจะสร้างแถวอะไร)

- `Projects.members` (JSON array ของชื่อ) → แถวใน `TripMembers` · **ไม่แตะ `Projects.members` เดิม** โค้ดที่ยังอ่านฟิลด์นั้นอยู่จึงไม่พัง
- `member_id` = `TM-{project_id}-{index}` คงที่ · `INSERT OR IGNORE` → รันซ้ำได้ไม่สร้างซ้ำ · ถอนได้ด้วย `DELETE FROM TripMembers WHERE member_id LIKE 'TM-%'`
- ข้าม JSON ที่พัง/ว่าง/NULL และชื่อที่เป็นช่องว่าง (ข้อมูลจริงมีขยะทดสอบอยู่)
- 🐛 **บั๊กที่เจอตอนทดสอบ**: เดิมให้ `is_admin` กับ `j.key = 0` — ถ้าช่องแรกเป็นชื่อว่าง (เช่น `["  ","Mew"]`) ทริปนั้นจะ**ไม่มี admin เลย = ไม่มีใครเปิดทริปกลับได้** แก้เป็น `ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY key)` ซึ่งนับเฉพาะแถวที่ผ่าน WHERE แล้ว → admin ตกที่คนแรกที่ใช้ได้จริง

**สิ่งที่ไฟล์นี้ไม่ทำโดยตั้งใจ** (ต้องตั้งเองทีหลัง มีคำสั่งตัวอย่างท้ายไฟล์)

- `user_id` เว้น NULL ทั้งหมด — ฐานนี้มี `Users` แค่ `9North` (name = `9North`) ซึ่ง**ไม่ตรงกับชื่อใน `members` เลย** ถ้าเดาจับคู่แล้วผิด = ให้สิทธิ์คนหนึ่งเห็นบิลส่วนตัวของอีกคน
- `ledger_mode` ตั้ง `MAIN` ให้ทุกคน — ข้อมูลเดิมไม่มีอะไรบอกได้ว่าใครเป็น TRIP_ONLY
- `is_admin` ให้คนแรก เป็นการเดาที่แก้ง่ายด้วย UPDATE เดียว
- reversal ยังเป็นตัวเลขใน `tripLog` เท่านั้น ยังไม่ได้สร้าง Transaction/TransactionDetails คู่จริงแบบ double-entry
- **`exclude_on_close` ทำแล้วฝั่ง prototype** (`wallets[].excludeOnClose`) — production ยังบล็อกการปิดเมื่อกระเป๋าแบบนี้มีเงินเหลือ (P3b) แต่ prototype แสดงพฤติกรรมที่ควรเป็นแล้ว:
  - toggle บนการ์ดกระเป๋า เฉพาะสกุลต่างประเทศ (บาทไม่ต้องยก) · ล็อกเมื่อปิดทริป
  - close preview แยกเป็น 2 ก้อน: **คืนเข้าบัญชีต้นทาง** กับ **ยกยอดไปทริปหน้า** — กระเป๋าที่ยกยอดจะไม่ถูกนับซ้ำในก้อนคืน
  - `tripLog` เก็บ `carried[{walletId, foreign, thbCost, rate}]` — **เก็บทั้งจำนวนเงินตราและต้นทุนบาท** เพราะทริปหน้าต้องรับเงินก้อนนี้ด้วยต้นทุนเดิม ไม่ใช่ตีมูลค่าใหม่ตามเรทวันปิด ไม่งั้นจะเกิดกำไร/ขาดทุนอัตราแลกเปลี่ยนที่ไม่มีอยู่จริง
  - ⚠️ ตอนต่อ backend: carry-forward ต้องสร้าง funding lot ของทริปถัดไปด้วย `thb = thbCost` เดิม **ห้ามคำนวณใหม่จาก foreign × เรทปัจจุบัน**

**💱 กำไร/ขาดทุนอัตราแลกเปลี่ยนที่เกิดขึ้นจริง (`settlementPlan` / `settlementResults`)**

เดิมพรีวิวปิดทริปแสดง "¥10,000 ≈ ฿2,320" เสมือนแลกคืนได้เท่าต้นทุนพอดี **ซึ่งไม่เคยเกิดขึ้นจริง** ตอนนี้แต่ละกระเป๋ามีแถวจัดการเงินเหลือใน dialog ปิดทริป เลือกได้ 2 ทาง

| ทาง | กรอกอะไร | ผลทางบัญชี |
|---|---|---|
| **แลกคืนเข้าบัญชี** | ยอดบาทที่ **ได้รับกลับมาจริง** | `fx = received − thbCost` → **กำไร/ขาดทุนที่เกิดขึ้นจริงของทริปนั้น** |
| **ยกไปทริปหน้า · คงสกุลเดิม** | — | fx = 0 · ต้นทุนยกไปทั้งก้อน |
| **ยกไปทริปหน้า · แลกข้ามสกุล** | จำนวนที่ได้ในสกุลใหม่ | fx = 0 · **ไม่ผ่านเงินบาทจึงยังไม่ realise** ต้นทุนเดิมโอนไปกับเงินก้อนใหม่ |

- ค่าตั้งต้นของแต่ละแถวมาจาก `wallets[].excludeOnClose` (วางแผนไว้ล่วงหน้าที่การ์ดกระเป๋า แล้วมาสรุปจริงตอนปิด)
- `tripLog` ของการปิดเก็บ `fxResult` รวม และ `returned[{receivedThb, thbCost, fx}]` รายกระเป๋า
- ⚠️ ตอนต่อ backend: `fxResult` ต้องลงเป็นรายการ **กำไร/ขาดทุนอัตราแลกเปลี่ยน** แยกจากค่าใช้จ่ายทริป ไม่ใช่ยัดรวมเป็นค่าใช้จ่าย ไม่งั้นยอดใช้จ่ายของทริปจะเพี้ยน
- 🐛 แก้ระหว่างทาง: `.dialog` เดิมมี `max-height` เฉพาะที่ ≤640px พอ dialog ปิดทริปยาวขึ้น checkbox ยืนยันหลุดออกนอกจอบนเดสก์ท็อปและกดไม่ได้ · ตอนนี้ `.dialog{max-height:calc(100vh - 40px);overflow:auto}` ทุกขนาดจอ
- "สร้างทริปใหม่" ยังเป็นระดับเปลี่ยนหัวเรื่อง+แบนเนอร์ ยังไม่มีระบบหลายทริปจริง
- **หมุดสมาชิกบนแผนที่ทำแล้ว** (`renderPresenceMap` · `<g id="presenceLayer">` ใน SVG) — `presence[].stopIndex` ผูกกับ index ของ `.journey-pin` เลยใช้พิกัดชุดเดียวกับหมุดสถานที่ ไม่ต้องมี calibration แยก
  - ขึ้นเฉพาะคนที่ `sharing` และเช็กอินแล้ว · หมุดที่ข้อมูลเก่าจะ**จางและขอบประ** ไม่ใช่หายไป เพราะการหายไปสื่อว่า "ออกจากพื้นที่แล้ว" ซึ่งข้อมูลบอกไม่ได้
  - หลายคนที่จุดเดียวกันกระจายเป็นวงรอบหมุด (`seat` × 46°) ไม่ทับกัน
  - เช็กอินขณะดูวันไหน หมุดจะไปอยู่ที่ stop ของวันนั้น
  - `.ping` มี `prefers-reduced-motion` guard
- presence ยังไม่มีพิกัด GPS จริง (ผูกกับ stop ของแผน ไม่ใช่ lat/lng)
- ปิดทริปยังไม่สร้าง ledger entry อะไรจริง เป็นเพียงการสรุป + ล็อกเรท
- ยังไม่รองรับ `exclude_on_close` (เก็บเงินเหลือไว้ทริปหน้า) ที่ production มี
- "สร้างทริปใหม่" ยังเป็นระดับเปลี่ยนหัวเรื่อง+แบนเนอร์ ยังไม่มีระบบหลายทริปจริง
- presence/location ของสมาชิกยังเป็น mock
- ยังไม่เชื่อม API/D1 ตาม guardrail

### งานล่าสุดที่เพิ่งเขียน แต่ถูกหยุดก่อนทดสอบครบ (⚠️ ล้าสมัยแล้ว — ดูส่วนด้านบน)

ผู้ใช้สั่งให้ทำ handoff ระหว่างกำลังเชื่อม Quick Add → หน้า Bills:

- `index.html` bump เป็น `v=10`
- เพิ่ม id ให้ช่อง amount/description/owner/category
- เปลี่ยน bill cards และ bill table เป็นพื้นที่ render แบบ dynamic
- เพิ่ม `bills[]`, `renderBills()`, filter และ summary calculation ใน `app.js`
- Save Quick Add ตอนนี้ตั้งใจให้:
  - อ่าน amount/title/categories/owner/visibility/shared/จำนวนคน
  - สร้างบิลใหม่ใน memory
  - ระบุ `tripOnly` จาก owner ที่มีคำว่า `TRIP ONLY`
  - ไปหน้า Bills
  - recalculation ยอดรวมทันที
- seed bills:
  - Hotel Sounkyo — Ann — TRIP ONLY — shared
  - มื้อเย็นร้านปู — North — main ledger — shared
  - ของฝากส่วนตัว — North — main ledger — private
- exchange rate mock = `0.232 THB/JPY`
- แก้ asset เครื่องดื่มให้ fallback ไป `st_camera2.png` แล้ว เพราะไม่มี `ic_coffee.png`

**สำคัญ:** รอบทดสอบ bills ถูก interrupt หลังเปิดหน้าเว็บสำเร็จ แต่ก่อนกด Quick Add ครบ 3 ขั้น ดังนั้น AI ถัดไปต้องทำตามลำดับ:

1. รัน:
   ```bash
   node --check frontend/trip-unified-prototype/app.js
   ```
2. เปิด local URL และ hard reload
3. ทดสอบ Quick Add ของ North:
   - save ¥24,000
   - ต้องไปหน้า Bills
   - บิลใหม่ต้องอยู่บนสุด
   - ต้องเป็น `ลงบัญชีหลัก`
   - summary รวมและ North จ่ายจริงต้องเพิ่ม
4. ทดสอบ Quick Add ของ `Ann · TRIP ONLY`:
   - บิลต้องมองเห็นตาม visibility
   - ต้องขึ้น `เฉพาะทริป`
   - ต้องเพิ่มเฉพาะยอดรวม + TRIP ONLY
   - ต้องไม่เพิ่มยอด North จ่ายจริง
5. ทดสอบ filter ทั้ง 4
6. ตรวจ console error และ responsive
7. หากทุกอย่างผ่าน ค่อยทำต่อเรื่อง multi-category allocation validation และ persistence

### ข้อจำกัดของ prototype ปัจจุบัน

- state อยู่ใน JavaScript memory; reload แล้วรายการ/แผนที่เพิ่มจะกลับค่า mock
- ยังไม่มี localStorage
- ยังไม่เชื่อม `/api/travel`, D1, weather provider หรือ realtime location
- weather และ member location เป็น mock
- Quick Add ยังไม่มี validation ว่า sum ของหลายหมวดเท่ากับยอดบิล
- UI มี equal split mock; manual/percent ยังเป็น requirement/data design แต่ยังไม่มี form
- day plan มีข้อมูลละเอียดเพียง Day 3–6 แม้แผนที่มี 11 จุด
- ยังไม่มี conflict handling หากสมาชิกหลายคนแก้แผนพร้อมกัน
- ยังไม่ deploy production

### Data model ที่แนะนำเมื่อผู้ใช้อนุมัติ prototype

อย่ายัดทุกอย่างลง `TripExpenses` แถวเดียว ควรแยกอย่างน้อย:

- `TripMembers`
  - `member_id`, `project_id`, `user_id`, `role`, `ledger_mode`
  - `ledger_mode = MAIN | TRIP_ONLY`
  - location permission + last check-in
- `TripWallets`
  - owner member, currency, card/provider, visibility
- `TripExpenses`
  - payer member, money owner member, wallet, currency, total, visibility, shared flag, stop/activity
- `TripExpenseCategories`
  - expense id, category id, amount/percent
- `TripExpenseParticipants`
  - expense id, member id, split mode, owed amount, visibility participant
- `TripStops`
  - day/date, parent stop, order, time range, coordinates, main/sub type, flexible status
- `TripWeatherSnapshots`
  - stop/date/period/provider/condition/temp/precipitation/wind/fetched_at
- `TripPresence`
  - member, lat/lng, status, check-in, expires_at

หลัก permission:

- wallet balance/history: owner + authorized admin only
- shared bill: members allowed by visibility
- TRIP ONLY expense: visible/settled inside trip but excluded from main-ledger posting
- location: opt-in, visible only while app is open, expire stale data

### ลำดับงานแนะนำหลัง bills ผ่าน

1. ทำ multi-category validation + เพิ่ม/ลบ category row
2. ทำ split mode equal/manual/percent และตรวจยอดครบ
3. ทำ bill detail/edit พร้อม audit-friendly status
4. ทำ localStorage เฉพาะ prototype เพื่อให้ review ข้าม reload ได้
5. เติม Day 1–12 และผูก map pin → day tab จริง
6. ทำ weather state/loading/error/last updated
7. ทำ location consent + stale/offline states
8. review UX กับผู้ใช้
9. หลังผู้ใช้อนุมัติเท่านั้น จึงออก migration/API adapter และค่อยเชื่อมระบบจริงทีละหน้า

### Guardrails สำหรับ AI ตัวถัดไป

- อย่าแก้หรือ replace หน้า `Trip`, `PupPup Trip`, `Prototype Trip` production เดิมในตอนนี้
- อย่ายิง endpoint การเงิน production จาก unified prototype
- อย่ารัน migration หรือ deploy โดยไม่ได้รับคำสั่ง
- รักษาโทนภาพ/ฟอนต์/แผนที่ที่ผู้ใช้เลือก
- อย่าฝังชื่อ/หมุดใหม่ลง banner; ให้ overlay ด้วย code
- อย่าอ้างว่า weather/location เป็นข้อมูลจริง
- ก่อนแก้ production backend ให้อ่าน `TRIP_FINANCE_DESIGN.md` และส่วน security ใน handoff เดิม

---

## 🆕 "Prototype Trip" — เมนูใหม่ เชื่อม PupPup Trip กับข้อมูลจริงแล้ว (2026-07-26, เฟส 1)

- เมนูใหม่ในแถบหลัก `data-target="puppup"` → section `#view-puppup` → render โดย `frontend/puppup-trip.js` ลง `#ppRoot`
- ไฟล์ใหม่: `frontend/puppup-trip.css`, `frontend/puppup-trip.js` (โหลดหลัง `app.js` ใน `index.html`, ใช้ global `getTravelApiBase()`/`getUserIdHeader()`/`formatTripDate` ร่วมกับแอปเดิม)
- **เป็นหน้าแยกต่างหาก ไม่ได้แทนที่ `tripUiItineraryScreen`/`renderTripDetailModal` เดิมใน `app.js`** ตามที่ผู้ใช้ต้องการ (หน้า Trip เดิมยังอยู่เหมือนเดิมทุกประการ)
- ดึงข้อมูลจริงผ่าน `GET /api/trips` (เลือกทริป) แล้ว `GET /api/travel?projectId=` (ทริป+stops+expenses) — **ไม่ได้เพิ่ม endpoint หรือ column ใหม่**, ใช้ของเดิมที่มีอยู่ทั้งหมด
- แผนที่ + ปักหมุด: ใช้ภาพ `puppup-prototype/art/hero_plan_hokkaido5.png` + ตาราง calibration คงที่ 3 จุด (Sounkyo/Lake Akan/Kushiro) จับคู่ด้วยการจับ keyword ในชื่อ `TripStops.city/accommodation/notes` — **ใช้ได้แม่นยำเฉพาะทริปที่ชื่อ/ปลายทางเข้าเงื่อนไข hokkaido เท่านั้น** ทริปอื่นจะยังไม่มีหมุด (มีข้อความแจ้งในหน้าเว็บอยู่แล้ว)
- ผู้ใช้ลากหมุดแก้ตำแหน่งได้ (ปุ่ม "แก้หมุด") → บันทึกจริงผ่าน `POST /api/trips/routes` ลงคอลัมน์ `Projects.route_data` (คอลัมน์/endpoint นี้มีอยู่แล้วในระบบ ไม่ใช่ของใหม่)
- ยอดใช้จ่ายต่อวัน/ต่อกิจกรรม: sum `TripExpenses` ที่ `stop_id` ตรงกับ `TripStops.stop_id` ของกิจกรรม/สถานที่นั้น (type EXPENSE บวก, REFUND ลบ, TOPUP ไม่นับ)
- **เฟส 2 (ทำแล้วในรอบเดียวกัน)**: เพิ่ม tab สลับ 4 หน้าในหน้าเดียวกัน (ทริป/วอลเล็ต/บิล/ตั้งค่า) ต่อข้อมูลจริงจาก `data.wallets`/`data.expenses`/`data.documents` ที่ `/api/travel` คืนมาอยู่แล้ว — **แต่ Bills/Wallet/Settings ทำแบบ "โทนเดียวกับดีไซน์" ไม่ได้ pixel-perfect ตาม mockup เท่า Plan tab** (ใช้ class ชื่อใหม่ เช่น `.walletcard`,`.bicon`,`.setrow` ไม่ได้ก็อปจาก prototype.css ทั้งหมด) และเป็น read-only ล้วน — แก้ไขสมาชิก/งบ/ปิดทริป/เพิ่มบิล/เติมเงิน ยังต้องใช้หน้า TRIPS เดิม
- **เฟส 3 (ทำแล้ว)**: ฟอร์มเพิ่ม/แก้ไข/ลบจุดแวะ (สถานที่หลัก + กิจกรรมย่อย) เขียนจริงผ่าน `POST/DELETE /api/trip-stops` (endpoint hyphenated ตาม HANDOFF เดิม ไม่ใช่ `/api/trips/stops`) — กดที่ place-head/act-row เพื่อแก้ไข, ปุ่ม "+" เพื่อเพิ่มสถานที่ใหม่ (สร้างวันใหม่อัตโนมัติถ้าเลือกวันที่ยังไม่มี) หรือเพิ่มกิจกรรมในสถานที่นั้น
  - **สำคัญ**: endpoint นี้เป็น full UPDATE (เขียนทับทุกคอลัมน์ ไม่ใช่ partial patch) โค้ดฝั่ง frontend จึงต้อง merge ค่าฟิลด์เดิมของ stop ก่อนส่ง ไม่งั้นฟิลด์ที่ฟอร์มนี้ไม่ได้แก้ (icon_asset, header_color ฯลฯ) จะถูกล้างเป็น null — แก้ไว้แล้วใน `ppOpenStopForm()`
  - ทดสอบ flow เพิ่ม/แก้/ลบ ครบด้วย jsdom + mock fetch (ไม่ใช่ browser จริง) ยืนยัน payload ถูกต้องทุกกรณีรวมถึงกรณี edit ต้องคง marker_color เดิม — แต่ยังไม่เคยเห็น UI นี้ในเบราว์เซอร์จริงเช่นเดิม
- **เฟส 4 (ทำแล้ว)**: ฟอร์ม "เพิ่มบิล" (`POST /api/trip-expenses` — เขียนแค่ตาราง TripExpenses อย่างเดียว ปลอดภัย ไม่กระทบบัญชีอื่น) ใช้ `AppState.categories`/`AppState.wallets` จริงของครอบครัว ไม่ใช้ hardcoded category list; และฟอร์ม "เติมเงินกระเป๋า" (`POST /api/trips/fund`)
  - **⚠️ /api/trips/fund เขียนบัญชีจริงของครอบครัวแบบ double-entry** (Transactions/TransactionDetails คู่กัน + TripWalletFundings) ไม่ใช่แค่ตัวเลขในทริป — ฟอร์มบังคับเลือก "บัญชีต้นทาง" จาก `AppState.accounts` จริง (กรอง `account_type=TRIP_HOLDING` ออกตามที่ backend เช็คเหมือนกัน) และ validate ฝั่ง frontend ก่อนว่ากระเป๋าเงินต่างประเทศต้องกรอกจำนวนเงินสกุลนั้นจริง (ไม่ให้ backend reject เฉยๆ)
  - ทดสอบด้วย jsdom + mock ทั้งสองฟอร์มแล้ว (payload ถูก, ตัวกรองบัญชีถูก, validation ทำงาน) แต่ **ยังไม่เคยยิงเข้า production จริง** — ก่อนใช้งานจริงควรลองเติมเงินทดสอบยอดเล็กๆ ก่อน แล้วเช็คว่ายอดบัญชีจริง/TripWalletFundings ตรงกับที่คาด
- **ยังไม่ทำ**: ข้อมูลอากาศ (`/api/travel` ยังไม่คืน weatherData จริง), การปิดทริป (settlement) จากหน้านี้โดยตรง (ยังใช้หน้า TRIPS เดิม — ตั้งใจไม่แตะเพราะเป็นเรื่องการเงินอ่อนไหว)
- **ทดสอบ**: สภาพแวดล้อมที่แก้โค้ดนี้รัน `wrangler dev`/`wrangler deploy` ไม่ได้ (esbuild binary ไม่ตรง sandbox) — ยังไม่เคยเห็นหน้านี้ render จริงบนเบราว์เซอร์ ต้อง `wrangler pages deploy frontend` (หรือรัน dev server เอง) แล้วเข้าเมนู "Prototype Trip" เพื่อตรวจก่อนใช้งานจริง
- **สถานะทดสอบล่าสุด (2026-07-26)**: ผู้ใช้เริ่มทดสอบ local — รัน `npx wrangler dev` แล้ว (backend ready ที่ `http://localhost:8787`) แต่ยังไม่เห็นเมนู "Prototype Trip" เพราะ **`wrangler dev` เสิร์ฟแค่ backend API เท่านั้น ไม่เสิร์ฟไฟล์ frontend** ต้องรันคนละ terminal แยกต่างหากเพื่อเสิร์ฟ `frontend/` ด้วย:
  ```bash
  # terminal 1 (ปล่อยรันค้างไว้)
  cd "<โฟลเดอร์ RecordRevenue>" && npx wrangler dev

  # terminal 2 (แยกหน้าต่างใหม่ ปล่อยรันค้างไว้เช่นกัน)
  cd "<โฟลเดอร์ RecordRevenue>/frontend" && npx serve .
  ```
  แล้วเปิด URL ที่ `npx serve` แสดง (เช่น `http://localhost:3000`) ไม่ใช่ `:8787` — โค้ด `getTravelApiBase()` เช็ค `window.location.hostname === 'localhost'` แล้วชี้ไป `:8787` ให้อัตโนมัติอยู่แล้ว ไม่ต้องแก้อะไรเพิ่ม
  - **ยังรอผลทดสอบจริงจากผู้ใช้อยู่** (ยังไม่ยืนยันว่าเมนูขึ้น/แผนที่-ฟอร์มทำงานถูกต้องในเบราว์เซอร์จริง) — เซสชันถัดไปควรถามผู้ใช้ก่อนว่าทดสอบผ่านหรือเจอปัญหาอะไรเพิ่ม ก่อนเขียนโค้ดต่อ

---

## 🟢 จุดส่งต่องานล่าสุด — PupPup Trip (แทนที่ Hunsa Trip)

- Prototype: `frontend/puppup-prototype/` · เปิดที่ `https://record-revenue-web.pages.dev/puppup-prototype/`
- **สร้างจาก mockup 4 ภาพที่ผู้ใช้ให้ (Generated image 1–4.png) แบบ 1:1** — canvas 869px เท่าไฟล์ต้นฉบับ มีปุ่มซูมบน toolbar
- ไอคอน/ภาพประกอบ **ตัดจาก mockup โดยตรง** 46 ไฟล์ใน `puppup-prototype/art/` (hero ลบตัวอักษรที่ฝังในภาพออกด้วย inpainting แล้ววาง text จริงทับด้วย HTML)
- ฟอนต์ (เทียบ letterform จาก mockup แล้ว, self-host ใน `puppup-prototype/fonts/`):
  - หัวข้อไทย = **Noto Sans Thai Looped 800**
  - ไทยทั่วไป = **Anuphan 400–700**
  - อังกฤษ + ตัวเลข = **Poppins 400–700**
  - ขนาดอักษรทุกจุดวัดจาก mockup แล้ว fit หาค่าจริง (ไม่ได้เดา)
- เทียบภาพ mockup ↔ prototype: `frontend/puppup-prototype/COMPARE_mockup_vs_prototype.png`
- เอกสารประกอบ: `PUPPUP_TRIP_PLAN.md` (data mapping + endpoint ที่ต้องเพิ่ม) · `PUPPUP_ICON_PROMPTS.md` (prompt สร้างไอคอนเพิ่ม) · `add_puppup_trip_fields.sql` (**ยังไม่ได้รัน**)
- **ยังไม่ต่อ API โดยเจตนา** — รอผู้ใช้ review ทีละหน้าก่อน ตามกติกาด้านล่าง

---

## 🔴 กติกาเดิม + Hunsa Trip (พักไว้ — ใช้ PupPup แทนแล้ว)

ผู้ใช้สั่งให้ **หยุดดัดแปลง UI Trip เดิม** เพราะหลายรอบที่ผ่านมาหน้าจอ Hunsa/Trip กลายเป็น web dashboard และไม่ตรงภาพ mockup mobile ที่ผู้ใช้ให้มา

### กติกาการทำงานที่ผู้ใช้ยืนยัน

1. สร้างและอนุมัติ **static visual prototype** ให้ตรง mockup ก่อนเสมอ
2. Prototype **ห้ามต่อ API / database / modal เดิม** จนกว่าผู้ใช้จะอนุมัติหน้าตา
3. เมื่อหน้าตาผ่านแล้วจึงย้ายเฉพาะ component ที่ผ่าน ไปเชื่อม backend ทีละหน้า
4. ห้าม reuse layout, CSS หรือ renderer หน้า `TRIPS` เดิมเพื่อสร้าง Hunsa
5. ระหว่าง review ให้ปรับทีละหน้าและ deploy เพื่อให้ผู้ใช้เทียบภาพได้

### Prototype ที่เป็น source of truth ของ UI ตอนนี้

- Path: `frontend/hunsa-prototype/`
- URL canonical: `https://record-revenue-web.pages.dev/hunsa-prototype/`
- Preview ล่าสุด: `https://e9b50abe.record-revenue-web.pages.dev/hunsa-prototype/`
- ไฟล์: `index.html`, `prototype.css`, `prototype.js`
- เป็น UI แบบ static 4 หน้าที่สลับด้วย bottom navigation: `bills`, `plan`, `wallet`, `settings`
- **ยังไม่มี API หรือข้อมูลจริงโดยเจตนา**; ข้อมูล Japan Family Trip เป็น mock data สำหรับตรวจ visual เท่านั้น
- ผู้ใช้ต้องการ mobile canvas กว้างประมาณ 430px เป็นหลัก; บนเว็บให้แสดง canvas นี้กึ่งกลาง ไม่ใช่ dashboard สองคอลัมน์
- ฟอนต์ที่ผู้ใช้ให้และต้องใช้กับ prototype:
  - `frontend/hunsa-prototype/fonts/WanathitDemo.ttf` — หัวข้อ/ชื่อเด่น
  - `frontend/hunsa-prototype/fonts/SalapaoDemo.ttf` — body, การ์ด, ข้อความไทย
  - `prototype.css` มี `@font-face` แล้ว
- Reference images ที่ผู้ใช้ให้ (ต้นฉบับอยู่ `/Users/DNorth/Downloads/`):
  - `Generated image 3.png` = Bills
  - `Generated image 2.png` = Itinerary
  - `Generated image 1.png` = Wallet
  - `Generated image 4.png` = Settings

### สิ่งที่ต้องทำต่อสำหรับ Hunsa (ลำดับที่ถูกต้อง)

1. ให้ผู้ใช้ review `hunsa-prototype` ก่อน และเก็บ feedback แบบ page-by-page
2. ปรับ static prototype จนผู้ใช้บอกว่าผ่าน — ห้ามเริ่มต่อ API ก่อน
3. หลังผ่าน: สร้าง component/data adapter ใหม่ใต้ `frontend/hunsa/` แล้ว map API เพียงหน้าเดียวต่อรอบ
4. อย่าแก้ `frontend/app.js` trip renderer เพื่อหวังให้เหมือน Hunsa
5. ก่อน migrate ต้องทำ visual comparison กับ mockup (structure, font, spacing, hero/map, card, navigation) ไม่ใช่ตรวจแค่ functional

### Hunsa implementation ที่มีอยู่ (ไม่ใช่ source of truth และพักไว้ก่อน)

- Path: `frontend/hunsa/`; เข้าได้ผ่านเมนู `Hunsa Trip` ใต้ `TRIPS` ใน `frontend/index.html`
- ใช้ session Family Finance เดิมผ่าน query `?user=...` และเรียก API เดิม
- UI นี้ถูก deploy ไว้ แต่ **ผู้ใช้ไม่ยอมรับความเหมือนของดีไซน์**; อย่าขยายหรือ refactor ต่อจนกว่า prototype จะผ่าน
- `HunsaTrip/` เป็นพื้นที่คัดลอก backend/schema ช่วงแรก ไม่ได้เป็น runtime ที่ deploy และมี asset ซ้ำ; อย่าใช้เป็น frontend source ใหม่

### ข้อมูลจริง / backend ที่พร้อมแล้วสำหรับ integration ภายหลัง

- Migration `add_hunsa_trip_stop_fields.sql` **รัน remote สำเร็จแล้ว** เมื่อ 2026-07-25:
  - `TripStops.end_time TEXT`
  - `TripStops.icon_asset TEXT`
  - `TripIconAssets` metadata table (เก็บ URL ของไอคอนต่อ family)
- Worker deploy แล้ว: `https://record-revenue.9nimz.workers.dev`, version `364f74d4-0746-4480-9807-6e4b3a9329c3`
- Endpoint ที่ใช้สำหรับ integration itinerary: `GET|POST|DELETE /api/trip-stops`
  - รองรับ `parent_stop_id` (สถานที่หลัก → กิจกรรมย่อย), `time`, `end_time`, `icon`, `icon_asset`, `notes`
  - DELETE ลบ descendants ได้
- **R2 icon upload ยังไม่ทำ**: อย่าอ้างว่าผู้ใช้นำเข้าไฟล์ภาพเข้าคลังได้แล้ว ต้อง provision/bind R2 + ทำ upload endpoint + UI ก่อน
- Production TripStops มีข้อมูลทดสอบชื่อเพี้ยน เช่น `dดกดกด`, `กดกหดฟหก`; UI แสดงตามข้อมูลจริง จึงไม่ควร hardcode Asakusa/Tokyo ใน runtime

### Deploy ล่าสุด

```bash
cd "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue"
npx wrangler deploy
npx wrangler pages deploy frontend --project-name record-revenue-web
```

- Pages preview ล่าสุด: `https://e9b50abe.record-revenue-web.pages.dev`
- ทุกครั้งที่ deploy frontend ไฟล์ `hunsa-prototype/` จะถูกส่งไปพร้อม `frontend/`
- `wrangler pages deploy` เตือนว่า root `wrangler.json` ไม่มี `pages_build_output_dir` แต่ CLI ignore config และ deploy ได้; ไม่ใช่ blocker

---

## 🚀 Deploy / SQL ล่าสุด (ทำแล้ว 2026-07-25)
```
cd "<โฟลเดอร์ RecordRevenue>"
npx wrangler d1 execute record-revenue-db --remote --file=add_trip_wallet_fundings.sql   # ตาราง TripWalletFundings (ใหม่)
npx wrangler d1 execute record-revenue-db --remote --file=add_dashboard_tables_v2.sql     # CategoryBudgets + PlannedExpenses (ถ้ายังไม่รัน)
npx wrangler deploy                 # backend
npx wrangler pages deploy frontend  # frontend
```
ตารางจาก `add_trip_wallet_fundings.sql` และ `add_trip_holding_accounts.sql` มีอยู่ใน D1 แล้ว และ deploy Worker + Pages แล้ว (frontend `app.js?v=169`) · เมื่อแก้ frontend รอบถัดไปให้ deploy ใหม่และ hard refresh (Cmd+Shift+R)

## 🔒 ความปลอดภัย/ความถูกต้องที่เพิ่มเมื่อ 2026-07-25

- `POST /api/trips/fund` ตรวจว่า user เข้าถึงทริปได้จริง, กระเป๋าอยู่ในทริปเดียวกัน และบัญชีต้นทางเป็นของครอบครัวเดียวกันก่อนสร้างรายการ
- รายการเติมเงินและ Transaction ที่ผูกกันถูกเขียนด้วย D1 batch เดียว และจะไม่กลืน error แล้วบันทึกเพียงบางส่วน
- `POST /api/trips/close` ปิดได้เฉพาะทริป `active` ของครอบครัวเดียวกัน, จองสถานะเป็น `closing` เพื่อกันการกดยืนยันซ้ำ และจะไม่ fallback เขียนทีละคำสั่งเมื่อ batch ล้มเหลว
- ระบบปฏิเสธการปิดหากยอดไม่สมดุล, กระเป๋าใช้เกินยอดเติม หรือมีบิลที่ไม่มีบัญชีสำหรับลงรายการ
- **P3b ยังไม่รองรับ:** หาก wallet ที่ตั้ง `exclude_on_close=1` ยังมีเงินเหลือ ระบบจะไม่อนุญาตให้ปิดทริป เพื่อป้องกันการลงบัญชีซ้ำ/ยอดทรัพย์สินผิด ต้องปิดตัวเลือกนี้หรือใช้ยอดให้หมดก่อน

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
- **P5 — บัญชีพักทริป + ย้ายเงินเหลือ**: deploy แล้ว: funding เป็น transfer สองฝั่ง, ตัดรายจ่ายจากบัญชีพัก, ปิดทริปเลือกคืนเงินหรือย้ายยอดคงเหลือไป wallet สกุลเดียวกันของ active/planned trip ได้ พร้อมสร้าง carry-forward funding lot ที่คงต้นทุนเดิม
- **P6 — เปิด Memory กลับ (Reopen)**: admin ระบุเหตุผล, สร้าง reversal ของ settlement เดิม (ไม่ลบ ledger), แล้วเปลี่ยนทริปกลับเป็น active เพื่อแก้ไขก่อนปิดใหม่
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
- `add_trip_wallet_fundings.sql` — ตาราง TripWalletFundings (รันใน D1 แล้วตามบันทึก deploy ก่อนหน้า)
- `add_hunsa_trip_stop_fields.sql` — Hunsa: `end_time`, `icon_asset`, `TripIconAssets` (รัน remote แล้ว 2026-07-25)
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

## 2026-10-11 (ต่อ) — หน้าตั้งค่าใหม่ `frontend/ledger/settings.html`
- ใช้ API เดิม: GET /api/settings · POST /api/settings/save · POST /api/settings/delete (admin) · GET/POST /api/users (บันทึก = admin)
- แท็บ: บัญชี (ธนาคาร/เงินสด/บัตรเครดิต + รหัส PDF) · บริษัท (สมาชิกที่เห็น) · หมวด (หัวข้อ+หมวด) · คู่ค้า · สมาชิก (admin) · อื่น ๆ (ลิงก์หน้าเดิม: สำรองข้อมูล/ธีม/โปรเจกต์)
- ยังไม่มีในหน้าใหม่: ลบสมาชิก, โปรเจกต์/ทริป, สำรองข้อมูล → ใช้ "ตั้งค่าระบบ (แบบเดิม)"
- backend: /api/settings/save และ /delete กันแก้/ลบ/สร้างข้ามครอบครัว (OWN_SQL) — ทดสอบมือแล้ว: แก้ของครอบครัวอื่น 404, สร้างบัญชีใส่บริษัทคนอื่น 400
- เมนูแอปหลัก: "ตั้งค่า (ใหม่)" + "ตั้งค่าระบบ (แบบเดิม)"; ทุกหน้า ledger มีลิงก์ ตั้งค่า
- อ่านง่ายบน Mac/PC: ทุกหน้า ledger (ยกเว้น quick.html) มี @media ≥1024px + pointer:fine → `html{zoom:1.1/1.2/1.3}` ตามความกว้าง (1024/1280/1600), --muted เข้มขึ้น, ปิด antialiased · กล่องรอเคลียร์กว้าง 880px บนจอใหญ่ · มือถือ/iPad ไม่เปลี่ยน

## 2026-10-11 — D1 rows_read เกินโควตา (6.15M/5M ต่อวัน)
- `diag-d1.sh [1d|7d|31d]` = wrangler d1 insights เรียงตาม rows_read (ใช้ได้แม้โควตาเต็ม)
- ต้นเหตุ: ยอดคงเหลือ `(SELECT SUM(total_amount) FROM Transactions WHERE account_id=a.account_id AND status='CONFIRMED')` ใน /api/settings และ /api/accounts อ่าน ~481,000 แถว/ครั้ง (สแกนทั้งตารางทุกบัญชี) = 70% ของทั้งหมด · listParties/dashboard arap (Settlements subquery) ~100–124k/ครั้ง
- แก้: `add-indexes.sh` (และเพิ่มใน setup-db.sh) — idx_tx_acc_status_amt, idx_tx_status_date, idx_td_tx, idx_td_category, idx_settle_parent, idx_userperm_entity + PRAGMA optimize · EXPLAIN QUERY PLAN ยืนยันเปลี่ยน SCAN → SEARCH USING COVERING INDEX

## 2026-10-11 — ระยะ 0 ปิดช่องโหว่ (index.js)
- ประตูเดียวหลัง /api/login: ทุก route ใน index.js ต้องมี authUserId ไม่งั้น 401 (trip/inbox/LINE webhook อยู่ก่อนประตู จัดการสิทธิ์เอง)
- helper: canUseAccount, canWriteTx, familyOf, deny
- /api/export → 410 (ไม่มีหน้าไหนใช้) · outstanding_ar จำกัดด้วย UserPermissions · settlements POST ตรวจทั้งสองบรรทัด · categories/account-types กรองครอบครัว
- POST /api/transactions + /bulk-import: ตรวจบัญชีเป็นของผู้ใช้ + ห้ามเขียนทับ transaction_id ของบัญชีอื่น
- resolveUserId อยู่ใน try แล้ว · error ทั้งหมดผ่าน dbErrorResponse(): ไม่ส่ง stack, D1 เกินโควตา/ล่ม → 503 code DB_UNAVAILABLE
- เทส: backend/test/security.test.mjs (20 เคส)
- ALLOW_HEADER_FALLBACK = false แล้ว (North ยืนยันเลิกใช้ GoogleSheetsSync) — x-user-id อย่างเดียวเข้าไม่ได้ ต้องมี Bearer token · quick.html (ลิงก์ลงชื่อ) และ guest.html (ทริป) ถูกจัดการก่อนประตู ไม่กระทบ

## 2026-10-11 — ระยะ 1 ลดการอ่าน + รูป + นำเข้าทำต่อได้
backend
- GET /api/transactions?count=1 → {count} (ป้าย badge) · auto-match: ค้นทีละคีย์ ref_code/statement_desc (+t2.status บังคับใช้ดัชนีคีย์) จำกัด 30 คีย์ เฉพาะบัญชีที่เห็น
- /api/stats/date-range: MIN/MAX/COUNT ต่อบัญชีผ่านดัชนี · /api/reports/wht: month เป็นช่วงวันที่ (เลิก strftime)
- dashboard/summary: ยอดบัญชี GROUP BY เฉพาะบัญชีใน scope + first_date · range คำนวณจากผลรายบัญชี (ตัด query rangeRow) · arap เริ่มจาก Captions→Categories→Details (CROSS JOIN, idx_td_category)
- ledger-inbox PARTY_FROM ใช้ CROSS JOIN แบบเดียวกัน (~124k → หลักร้อย) · reportData ≤ 731 วัน
- createFromStatement: รหัสคงที่ TX-{stmt}-{line} / DOC-{stmt}-{line} + เช็กมีอยู่แล้ว → กดซ้ำหลังหยุดกลางทางไม่ซ้อน (เทสแล้ว)
- retryDoc: ไฟล์หาย → บอกว่าลบอัตโนมัติหลัง 30 วัน
- ดัชนีเพิ่ม: idx_tx_desc · ลบซ้ำ idx_td_tx (มี idx_transactiondetails_tx_id) — อยู่ใน add-indexes.sh (รันซ้ำได้)
frontend
- app.js v183: แคชข้อมูลหลัก 10 นาทีใน sessionStorage (mdcache:) ยกเว้น /api/accounts · ล้างเมื่อ POST settings/users/contacts/... (ใน fetch wrapper) และใน ledger/settings.html · badge ใช้ count=1 · backup อัตโนมัติล้มแล้วพัก 6 ชม.
- ledger/index.html: shrinkImage() ย่อรูป >350KB เป็น JPEG 1600px q0.82 (statement 2200px q0.85) ก่อนอัปโหลด · สร้างรายการจาก statement ได้สูงสุด ~2,000 บรรทัด/คลิก + ข้อความทำต่อเมื่อหยุดกลางทาง
- R2: `setup-r2-lifecycle.sh` ลบ ledger-docs/ อัตโนมัติ 30 วัน (North ต้องรัน)
- เทสใหม่: backend/test/endpoints.test.mjs (ผลถูก + แผนคำสั่งใช้ดัชนี)

## 2026-10-11 — ระยะ 2 ความเสถียร
- settle-keep.js: planSettlementKeep(env, txId, newDetails) — ก่อนลบบรรทัดย่อยเพื่อใส่ใหม่ จำ Settlements ที่ผูกไว้ · บรรทัดใหม่ที่ หมวด+คู่ค้า+ยอด ตรงกับบรรทัดเดิม → ใช้ detail_id เดิม · ใส่ Settlements กลับใน batch เดียวกัน · ถ้าบรรทัดที่ตัดชำระแล้วถูกแก้ยอด/หมวด/คู่ค้า → 409 ให้ยกเลิกการตัดชำระก่อน
  ใช้ใน: POST /api/transactions (index.js), editTransaction + editDoc + ยืนยันพร้อมแก้บรรทัด (ledger-inbox.js) · detailInsert รับ d.detail_id ได้แล้ว
  (bulk-import ยังไม่ใส่ — ใช้กับรายการใหม่เป็นหลัก)
- listInbox / statementView: IN (...) ใช้ inChunks (≤90 พารามิเตอร์)
- restore/full โหมด replace: ตรวจไฟล์ก่อนล้าง (ต้องมีบริษัท+บัญชี, มีรายการถ้าระบบมีอยู่) · ไฟล์มีรายการ < ครึ่งของระบบ → 409 needs_confirm (app.js ถามยืนยันแล้วส่ง confirm_shrink)
- หน้าเว็บ: ทุกหน้า ledger มี fetch timeout (40 วิ / งาน AI-นำเข้า 180 วิ) + ข้อความ error ภาษาคน · app.js v184: timeout 45/180 วิ + แจ้ง 503 "ฐานข้อมูลไม่พร้อมชั่วคราว"
- เทส endpoints.test.mjs เพิ่ม: การตัดชำระไม่หายตอนแก้ (FK cascade จริง), กู้ข้อมูลไฟล์ไม่ครบไม่ล้าง
- ยังไม่ทำ: users/delete และ /api/reset ยังทีละคำสั่ง (ใช้น้อย, admin เท่านั้น) · .catch(()=>[]) ใน dashboard (เฉพาะตารางงบ/แผนที่อาจไม่มี)

## 2026-10-11 — ระยะ 3 จัดบ้าน + หน้าแรกใหม่
- ย้ายไฟล์ใช้ครั้งเดียว 182 ไฟล์จากโฟลเดอร์หลัก → archive/scripts (139) · archive/sql (40) · archive/misc (3) — ตรวจแล้วไม่มีโค้ดอ้างถึง (เว้น link_trip_members.sql ที่ข้อความในทริปอ้างชื่อ → คงไว้ที่เดิม)
  · archive/sql/backup-before-trip-finance.sql (ข้อมูลจริง) เพิ่มใน .gitignore แล้ว · ไม่มีไฟล์ใหม่หลุดเข้า git (ทุกไฟล์ที่ย้ายเคย track อยู่แล้ว)
- หน้าแรก = ledger/home.html: app.js goNewHomeIfDefault() เรียกตอนเปิดแอป (ล็อกอินค้าง) และหลังล็อกอิน · ข้ามเมื่อ ?classic=1 (จำใน sessionStorage rr_classic ทั้งแท็บ), ?txId, หรือมี #hash · ปุ่ม "แอปหลัก" ในหน้า ledger → ../index.html?classic=1 · app.js v185

## 2026-10-11 — ปิดเดือน (North เลือก 1ก ล็อกแน่น + 2ก ต้องผ่านครบ)
- backend/src/period-close.js: checkPeriod / listPeriods / close (admin) / reopen (admin + เหตุผล ≥3 ตัวอักษร) · route /api/inbox/periods… (เรียกจาก handleLedgerInbox)
  · เงื่อนไขปิด: ไม่มี PENDING ในเดือน · ไม่มีเอกสารค้างในกล่องที่ลงวันที่เดือนนั้น/อ่านวันที่ไม่ออก · ไม่มีบรรทัด Cat_Uncategorized · ทุกบัญชี BANK/CREDIT ที่มีรายการในเดือน: มี statement ทับเดือน + บรรทัดในเดือนไม่เหลือ NEW + ยอดระบบ ณ period_to = closing_balance (CREDIT ยอมรับเครื่องหมายกลับ) · เงินสดไม่ตรวจ statement
  · ปิดได้เฉพาะเดือนที่จบแล้ว · เก็บ snapshot ยอดทุกบัญชี ณ สิ้นเดือน · LedgerPeriodLog เก็บประวัติปิด/เปิด
- ล็อกที่ฐานข้อมูล: backend/db/migrations/2026-10-11-period-close.sql (ตาราง + 8 trigger บน Transactions / TransactionDetails / Settlements[ฝั่ง child]) → RAISE 'PERIOD_CLOSED: …'
  · ทดสอบกับ wrangler d1 --local แล้ว (สร้างได้ + บล็อกจริง) · ติดตั้ง: `bash setup-period-close.sh` (หรือ setup-db.sh ซึ่งรันไฟล์นี้ด้วย --file)
  · index.js: dbErrorResponse แปลง PERIOD_CLOSED → 409 · POST /api/transactions เช็กวันที่เดิม+ใหม่เอง (INSERT OR REPLACE ไม่ยิง DELETE trigger) · bulk-import เช็กต่อบัญชี+เดือน (memo) · restore/full ปฏิเสธถ้ามีเดือนปิด
  · ledger-inbox json() แปลง error PERIOD_CLOSED ทุกจุด → 409 ข้อความคน
  · quota regex ของ dbErrorResponse แคบลง (ไม่จับ D1_ERROR ทั่วไปเป็น 503)
- หน้า frontend/ledger/close.html (เมนู "ปิดเดือน" ทุกหน้า ledger + แอปหลัก) · เทส backend/test/period.test.mjs (25 เคส)

## 2026-10-11 — บัตรเครดิต + เงินกู้/ผ่อน + ย้ายตั้งค่าที่เหลือ
- backend/src/cards-loans.js (route ผ่าน handleLedgerInbox): GET /api/inbox/cards · /api/inbox/loans · /api/inbox/loans/{debt_id}
  · บัตร: cycleDates(today, statement_day, due_day) → last_cut / due / next_cut · billed = หนี้ ณ วันตัดรอบ (date < cut+1) · due_left = billed − ยอดเข้าบัตรหลังตัดรอบ · spent_this_cycle · status OVERDUE/DUE_SOON(≤7วัน)/UPCOMING/PAID/NO_BILL/NO_CYCLE · วันนี้ = เวลาไทย (env.__today ใช้ในเทส)
  · เงินกู้: ใช้ตาราง Debts เดิม · ชำระแล้ว = −Σเงินต้น (PAYABLE) / +Σ (RECEIVABLE) · คงเหลือ = start_balance − ชำระแล้ว (แก้สูตรกลับด้านของหน้าเก่า) · นับเฉพาะ CONFIRMED, contact + หมวดเงินต้น/ดอกเบี้ย, date ≥ start_date · หมวดดอกเบี้ย = หมวดเงินต้น → นับเป็นเงินต้นทั้งหมด + เตือน · เคารพ members
  · บันทึก/ลบสัญญาใช้ /api/debts และ /api/debts/delete เดิม
- frontend/ledger/cards.html (แท็บ 💳 บัตร / 🏦 เงินกู้ · #loans) · home.html งานค้างเพิ่ม "บัตรใกล้/เลยกำหนด" (โหลด /api/inbox/cards ครั้งเดียวต่อหน้า) · เมนู "บัตร & เงินกู้" ทุกหน้า + แอปหลัก
- settings.html แท็บอื่น ๆ: สำรองข้อมูล (xlsx เหมือนแอปเดิม) · กู้ข้อมูล (เพิ่ม/อัปเดต หรือแทนที่ + พิมพ์ RESET + ยืนยันกรณีไฟล์เล็กกว่าครึ่ง) · โปรเจกต์ (เพิ่ม/แก้/ลบ) · แท็บสมาชิก: ลบสมาชิก (ดูก่อนว่าบริษัทไหนจะถูกลบ + พิมพ์รหัสยืนยัน)
- /api/users/delete: รับ preview:true (ไม่ลบ คืน report) · มีเดือนปิด + มีบริษัทที่ถือคนเดียว → 409
- ยังอยู่หน้าเดิม: ธีม · ล้างข้อมูล (/api/reset) · ทะเบียนหนี้แบบเดิม (เมนู "แบบเดิม" ยังอยู่)
- เทส backend/test/cards-loans.test.mjs (15 เคส)

## 2026-10-12 — ทะเบียนทรัพย์สิน (แบบที่ North กำหนด รอบ 2: ไม่มีค่าเสื่อม · ยอดยกมา · กลุ่มย่อย)
- (แบบแรกมีค่าเสื่อม → ยกเลิก · แบบที่สองใช้ AssetWriteoffs → แทนด้วย AssetItems ก่อน deploy · ไม่มีในประวัติ git)
- หมวดที่นับเป็นทรัพย์สิน = LedgerRules kind='ASSET_REG' rkey=category_id (ผู้ดูแลเลือก) — North สร้างหมวด "ทรัพย์สิน" ใต้กลุ่มสินทรัพย์แล้วติ๊ก
- ตาราง (สร้างเองตอนเรียกครั้งแรก + อยู่ใน setup-db.sh):
  · AssetItems: source 'TX' (จากรายการจ่ายจริง, detail_id UNIQUE, id = AS-{detail_id}) | 'OPENING' (ยอดยกมา กรอกเอง)
    status ACTIVE | WRITTEN_OFF | REMOVED (ซ่อน, เฉพาะ TX) · group_id · writeoff_* · TX: วันที่/จำนวนเงิน/หมวด อ่านสดจากรายการจริง
  · AssetGroups: กลุ่มย่อย (อุปกรณ์ช่าง ฯลฯ) — ลบกลุ่มแล้วรายการ group_id = NULL
- sync: ทุกครั้งที่ GET ทะเบียน → INSERT OR IGNORE บรรทัด CONFIRMED ยอดติดลบในหมวดทรัพย์สินที่ยังไม่มี (ข้าม DT-WO-*) · ซ่อนแล้วไม่กลับมาเอง
- route (backend/src/assets.js): GET /api/inbox/assets · POST /assets/categories (admin) · /opening · /move {asset_ids, group_id} · /groups · /groups/{id} · /groups/{id}/delete
  · /assets/{asset_id} แก้ไข (ชื่อ/กลุ่ม/หมายเหตุ ทุกแบบ · วันที่/จำนวนเงิน/หมวด เฉพาะยอดยกมาที่ยังไม่ตัด) · /{id}/delete (ยอดยกมา = ลบจริง, TX = ซ่อน) · /{id}/restore
  · /{id}/writeoff {date, expense_category_id, note, account_id (ยอดยกมาต้องมี)} → TX-WO-{asset_id} ยอดรวม 0 · DT-WO-{id}-A +มูลค่า หมวดทรัพย์สิน TRANSFER · DT-WO-{id}-E −มูลค่า หมวดค่าใช้จ่าย EXPENSE · ห้ามก่อนวันได้มา · ปลายทางต้องไม่ใช่หมวดทรัพย์สิน · ติดล็อกปิดเดือน → 409
  · /{id}/undo ลบรายการปรับปรุง กลับเป็น ACTIVE
- หมวดทรัพย์สินถูกตัดออกจาก: รายงาน pnl (reportData), dashboard รายรับ/รายจ่าย + งบหมวด (spentRows) + arap, ลูกหนี้ (PARTY_WHERE) — IS_ASSET_SQL / assetCategorySet
- frontend/ledger/assets.html: แท็บ มีอยู่/ตัดจำหน่ายแล้ว/ซ่อนไว้ · ค้นหา · เรียงวันที่ (สลับได้) · ชิปกลุ่ม · ติ๊กเลือกหลายรายการแล้วย้ายกลุ่ม · ปุ่ม แก้ไข/ตัดจำหน่าย/ลบ · ＋ ยอดยกมา · จัดการกลุ่ม
- home.html สินทรัพย์รวมนับ totals.value (ยังไม่ตัดจำหน่าย รวมยอดยกมา) · เมนู "ทรัพย์สิน" ทุกหน้า + แอปหลัก
- เทส backend/test/assets.test.mjs (45 เคส) · ledger-inbox.test.mjs แทน import แบบเรียกซ้ำแล้ว (assets.js → period-close.js)

## 2026-10-12 — ย้ายของที่เหลือจากแอปหลัก (ข) + รายงานทรัพย์สิน (ค)
- ธีมสีหน้าใหม่: `frontend/ledger/theme.js` (โหลดท้าย <head> ทุกหน้า ledger/*) · เลือกที่ ตั้งค่า → อื่น ๆ → ธีมสี · เก็บ localStorage 'ledger-theme' (ต่อเครื่อง)
  · หลักการ: หน้าเขียนสีม่วงไว้ → theme.js แทนรหัสสีม่วงใน <style> และ style="" (MutationObserver) ด้วยสีธีม · สีเขียว/แดงของตัวเลขไม่เปลี่ยน
  · เพิ่มสีม่วงใหม่ในหน้าใด ๆ ให้ใช้ var(--brand) หรือรหัสใน KEYS ของ theme.js
- ล้างข้อมูล: ตั้งค่า → อื่น ๆ → ล้างข้อมูล (ผู้ดูแล) · ดูจำนวนก่อน (preview) → สำรอง Excel อัตโนมัติ → พิมพ์ RESET → มีเดือนปิดต้องติ๊กยืนยัน
  · /api/reset (index.js 15.2) เขียนใหม่: preview · HAS_CLOSED 409 ถ้ามีเดือนปิดแต่ไม่ส่ง reopen_closed · เปิดเดือนให้ + บันทึก LedgerPeriodLog · ลบ LedgerPeriods ของครอบครัว
    scope transactions: + LedgerDocs/Links, LedgerStatements, AssetItems(TX), รีเซ็ตการตัดจำหน่ายของยอดยกมา · scope all: + AssetItems/Groups, LedgerRules
    error อื่นที่ไม่ใช่ "no such table" หยุดทันที (เดิมข้ามเงียบ ๆ ทำให้ลบครึ่ง ๆ กลาง ๆ)
- หน้าเดิม: แท็บทะเบียนหนี้สินมีป้ายชี้ไป cards.html · แท็บยอดยกมาเดิม (ไม่เคยบันทึกจริง — console.log) มีป้ายเตือน · Danger Zone ชี้ไปหน้าใหม่
- รายงาน → แท็บ 🏷️ ทรัพย์สิน: ยกมา + ได้มา − ตัดจำหน่าย = คงเหลือ ตามกลุ่ม · ตัดจำหน่ายรายเดือน (แยกหมวดค่าใช้จ่าย) · ได้มาในช่วง · Excel 5 แท็บ (toXlsxSheets)
  · คำนวณในหน้าจาก /api/inbox/assets · ไม่นับ REMOVED · กรองบริษัทด้วย entity_id
- เทส: period.test.mjs +7 เคส (ล้างข้อมูล)

## 2026-10-12 — ยอดยกมา (North: 1ก 2ก 3ข + บัญชีพักแบบ Dr/Cr)
- หน้า `frontend/ledger/opening.html` (ตั้งค่า → อื่น ๆ → ยอดยกมา) · backend `backend/src/opening.js` · ตาราง OpeningSets (สร้างเอง + setup-db.sh)
- "ชุดยอดยกมา" = ชื่อ + เจ้าของ (entity) + วันที่เริ่ม — แต่ละคนเริ่มคนละวันได้ · บัญชี/สัญญาเงินกู้ อยู่ได้ชุดเดียว
- บรรทัด: ACC (บัญชี) · CAT (หมวด + คู่ค้า) · LOAN (Debts) — ทุกบรรทัดมีฝั่ง DR/CR · ส่วนต่างลง "บัญชีพักยอดยกมา" (CAT-OB-{fid} ใต้ caption CAP-OB-{fid} behavior TRANSFER สร้างอัตโนมัติ) → ต้องเป็น 0
- สร้างรายการจริง: TX-OB-{set}-A{n} (ยอดบัญชี) · TX-OB-{set}-J (ยอดรวม 0 ในบัญชีที่ใช้บันทึก) · detail DT-OB-… · ref_code 'OPENING'
  · ฝั่งบรรทัดย่อย: เดบิต = ยอดลบ · เครดิต = ยอดบวก · type: EXPENSE/INCOME ตาม behavior (1ก นับในรับ-จ่าย) · ASSET/LIABILITY → DEBIT_AR/CREDIT_AR · TRANSFER
  · LOAN → หมวดเงินต้น + คู่ค้าของสัญญา · ตั้ง Debts.start_balance/start_date = ยอดยกมา · debtLines ข้าม DT-OB-% (ไม่นับเป็นการจ่าย)
  · ทะเบียนทรัพย์สิน sync ข้าม DT-OB-%
- แก้ชุด = ลบ TX-OB-{set}-% แล้วสร้างใหม่ใน batch เดียว · เดือนปิดแล้ว → 409
- 2ก: เตือนรายการก่อนวันเริ่ม (pre_start) + ปิดเดือนข้อ 5 'opening' (openingIssues ใน opening.js)
- 3ข: สิทธิ์ตาม UserPermissions ของบัญชี · แก้/ลบชุดได้เมื่อมีสิทธิ์ทุกบัญชีในชุด
- หน้า: บัญชีกรองตามเจ้าของ (ติ๊กแสดงทุกบัญชีได้) · บรรทัดหมวดเลือกฝั่งตาม behavior · วางจาก Excel (ชื่อบัญชี/หมวด · คู่ค้า · เดบิต · เครดิต · หมายเหตุ) · แถบสรุปเดบิต/เครดิต/บัญชีพักสด
- ล้างข้อมูล: ลบ OpeningSets ด้วย · ledger-inbox.test.mjs: แทน import เรียกซ้ำรองรับ period-close → opening
- เทส backend/test/opening.test.mjs (26 เคส) · period.test.mjs ปรับเป็น 5 ข้อ

## 2026-10-12 — ซ่อนหน้าเก่า (North เลือก ก.)
- frontend/index.html: เมนู "(แบบเดิม)" 5 รายการ (ภาพรวม ประวัติ ทะเบียนลูกหนี้ รายงาน ตั้งค่า) ย้ายเข้า comment — โค้ด/ข้อมูลยังอยู่ครบ เปิดกลับได้
  · ป้าย "(ใหม่)" เอาออก · เพิ่มเมนู ยอดยกมา + ทริป (Enjoy Life Trip → trip-unified-prototype/trips.html)
  · เมนูล่างมือถือ: หน้าแรก/ประวัติ/ลูกหนี้/รายงาน/ตั้งค่า ชี้ไปหน้าใหม่
- หน้าใหม่ทุกหน้า: ปุ่ม "แอปหลัก" (../index.html?classic=1) → "ทริป" (../trip-unified-prototype/trips.html)
- หน้าเก่ายังเปิดฉุกเฉินได้ที่ index.html?classic=1 (ไม่มีลิงก์จากหน้าไหนแล้ว)

## 2026-10-12 — นำเข้า statement หน้าใหม่ ให้ทำงานแบบหน้าเก่า
- เทียบกับหน้าเก่า (app.js → /api/statement-ocr): หน้าเก่าส่ง PDF ทั้งไฟล์ให้ AI · ลองใหม่ 3 ครั้งเมื่อ AI ไม่ว่าง (429/503) · มีรหัสผ่านค่อยแปลงเป็นรูป (scale 2.0 · 0.85)
  หน้าใหม่เดิม: แปลงทุก PDF เป็นรูปเสมอ (1.7 · 0.82) · ไม่ลองใหม่ (AI ไม่ว่างครั้งเดียว = ล้ม) · อัปโหลดทีละหน้า
- แก้: ledger/index.html importStatement → PDF ไม่มีรหัส (ไม่พบ /Encrypt) ส่งทั้งไฟล์ (application/pdf) · มีรหัส → รูป 2.0/0.85
  ledger-inbox.js extractStatement → อัปโหลดพร้อมกัน · ลองใหม่ 3 ครั้ง (429/500/503/504) · JSON ขาด/ยาวเกิน → ข้อความไทยชัดเจน
- ต่างจากหน้าเก่าโดยตั้งใจ: อ่านแล้วแสดงหน้า statement ให้จับคู่ก่อน → กด "➕ สร้างรายการจาก … บรรทัดที่ยังไม่มี" จึงเข้าไปเป็นรอยืนยัน (หน้าเก่าสร้างทันที ไม่จับคู่ ทำให้ซ้ำกับสลิป)
- รหัสผ่าน PDF (เพิ่ม 2026-10-12 ตามที่ North แจ้ง): ลองรหัสตามลำดับ ช่องที่กรอก → รหัสของบัญชีที่เลือก → บัญชีธนาคารเดียวกัน → บัญชีอื่นทั้งหมดที่ตั้งรหัสไว้ (ตั้งค่า → บัญชี → รหัสผ่าน PDF) · ไม่ตรงเลย → ขึ้นช่องให้กรอกเอง
  ทดสอบ Playwright: PDF เข้ารหัส AES-256 + บัญชีที่เลือกรหัสผิด → ใช้รหัสบัญชีอื่นได้ ส่งเป็นรูป · PDF ไม่มีรหัส → ส่งทั้งไฟล์ application/pdf
- AI ไม่ว่าง (503 high demand ของ gemini-3.1-flash-lite — North เจอจริง 12 ต.ค.): เพิ่ม geminiGenerate ใน ledger-inbox.js ใช้ทั้งอ่านสลิป/เอกสาร และ statement
  รุ่นหลักลอง 3 ครั้ง → สลับรุ่นสำรอง gemini-flash-latest → gemini-2.5-flash → gemini-flash-lite-latest (ครั้งละ 2) · 400/404 ข้ามรุ่น · 401/403 แจ้งทันที
  ตั้งรุ่นสำรองเองได้: secret GEMINI_FALLBACK_MODELS (คั่น ,) · ลองครบแล้วยังไม่ว่าง → ข้อความไทย "รอ 2–3 นาทีแล้วส่งใหม่"

## 2026-10-12 — statement: ด่านเดินยอดคงเหลือ + เทียบเลขบัญชี + นำเข้า Excel (ประยุกต์จากระบบ BKP · North เลือก ก ข)
- อ้างอิง: "Claude outputs/STATEMENT-FORMATS.md" · "โครงนำเข้า-statement-อ้างอิง-2569-10-12.md" (ระบบ bookkeeper-hub)
- ledger-match.js: walkStatement(lines, opening) — ยอด[i] = ยอด[i-1] + เข้า − ออก · ชี้แถวผิด {line_id, expected, diff}
  (แถวก่อนอ่านยอดคงเหลือผิดตัวเดียว → แถวถัดไปที่เดินจากค่าที่ควรเป็นไม่ถูกชี้ซ้ำ) · accountNumberCheck(read, mine) → MATCH/MISMATCH/null
- ledger-inbox.js:
  · importStatement → saveStatement(env,user,account,ex,file_name,source) ใช้ร่วม PDF/EXCEL · LedgerStatements.extra (JSON: source, account_number_read, account_check) — ALTER อัตโนมัติ + setup-db.sh
  · POST /api/inbox/statement/lines {account_id, file_name, lines:[{date ISO, time, description, credit, debit, balance, detail, channel}], opening_balance} — ไม่ใช้ AI · ห้ามเข้า+ออกแถวเดียว/ติดลบ · ≤3000 แถว
  · statementView: lines[].walk_err · summary.walk_bad/walk_checked/walk_possible · statement.source/account_check/account_number_read
  · createFromStatement: เดินไม่ลง → 409 code WALK (ห้ามสร้างจนแก้) · line action 'fix' {amount?, balance?} · line 'OPENING' fix {balance} แก้ยอดยกมา
- ledger/index.html แท็บ Statement: ปุ่ม 📊 นำเข้าจาก Excel + ⬇️ แม่แบบ (8 คอลัมน์ตามตำแหน่ง A–H · วันที่ พ.ศ./ค.ศ./YY · วันที่อ่านไม่ได้ = ไม่รับทั้งไฟล์)
  · หน้า statement: แบนเนอร์เลขบัญชีไม่ตรง · เดินยอด (แดง/เขียว) · แก้ยอดยกมา · แถวแดง + ✏️ แก้ยอด/คงเหลือ · ปุ่มสร้างล็อกจนเดินลง · ตัวกรอง "⚠️ เดินไม่ลง"
- เทส backend/test/statement-walk.test.mjs (19 เคส) · Playwright: Excel ดี/เสีย · แถวแดง → แก้ → ปุ่มสร้างกลับมา
- ค. (ตัวอ่าน PDF ไม่ใช้ AI) ยังไม่ทำ — รอไฟล์ bookkeeper-hub-20260924.bundle หรือ e-Statement ตัวอย่าง
- ⭐ อ่าน PDF statement จากตัวหนังสือในไฟล์ โดยไม่ใช้ AI (ข้อ ค. บางส่วน · ทดสอบกับ KBANK e-Statement ของ North 14 หน้า 462 รายการ)
  · ledger/index.html parseTextStatement(pdf): pdf.js getTextContent → จัดบรรทัดตาม y · แถวขึ้นต้นด้วยวันที่ · ตัวเลขเงินขวาสุด = คงเหลือ · ทิศจากผลต่างคงเหลือ (ต้องตรง ≥95% ไม่งั้นไปใช้ AI)
    "ยอดยกมา" แถวแรก = opening (หน้าถัดไปซ้ำ ข้าม) · บรรทัดต่อ (x ตรงคอลัมน์รายละเอียด) ต่อท้ายข้อความ · หาเลขบัญชีรูปแบบ 000-0-00000-0
  · ผล: ฝาก 88 = 816,232.60 · ถอน 374 = 811,845.91 ตรงกับยอดที่ธนาคารพิมพ์ถึงสตางค์ · ใช้เวลา ~1 วินาทีในเบราว์เซอร์
  · ส่งผ่าน POST /api/inbox/statement/lines (source PDF_TEXT + opening/closing/account_number) → ด่านเดินยอดเดิม · ไม่ผ่าน/ไม่มีตัวหนังสือ → ถอยไป AI ตามเดิม
  · ไฟล์ติดรหัส: openPdfDoc ลองไม่ใส่รหัส → รหัสในช่อง/บัญชี (pdfPasswords) แล้วอ่านตัวหนังสือในเครื่องได้เลย
- .gitignore: "Claude outputs/" (มี statement จริง)

## 2026-10-12 · กลับไปใช้แอปเดิมเป็นหลัก (North สั่ง: "ปรับของเดิมให้ดีขึ้น ไม่ใช่ทำใหม่")
- frontend/index.html: เมนูข้าง + เมนูล่างมือถือ กลับเป็นชุดเดิม (แดชบอร์ด/รอตรวจสอบ/ประวัติ/ลูกหนี้/ทริป/รายงาน/ตั้งค่า) · goNewHomeIfDefault() ปิดแล้ว (return false)
- ย้ายของดีจาก ledger/ เข้า app.js (bindPDFUpload หน้า "รอตรวจสอบ"):
  · parseTextStatement — อ่าน e-Statement จากตัวหนังสือใน PDF ไม่ใช้ AI (ทดสอบ KBANK 462 รายการ ตรงยอดธนาคาร) · ไม่ผ่าน → ใช้ AI เดิม
  · statementPdfPasswords/openStatementPdf — ลองรหัสบัญชีที่เลือก → ธนาคารเดียวกัน → ทุกบัญชี
  · เช็คเลขบัญชีในไฟล์ vs บัญชีที่เลือก · importStatementRows ส่งพร้อมกัน 6 ทาง (กันซ้ำด้วย generateTxId เดิม)
- backend index.js: runGeminiStatement / runGeminiOCR ใช้ geminiGenerate (ลองซ้ำ + สลับรุ่นสำรอง) แก้ 503
- หน้า ledger/ ที่ยังเหลือ (cards, assets, opening, close) ลิงก์กลับแอปหลักแล้ว · จะย้ายเข้าแอปเดิมทีละอย่าง แล้วค่อยลบ

## 2026-10-12 · ย้าย ก. ขั้น 1–2 เข้าแอปเดิม (North เลือกลำดับ: ยอดยกมา → ปิดเดือน → บัตร & เงินกู้ → ทรัพย์สิน)
- ยอดยกมา → แท็บ "⚖️ ยอดยกมา" ในตั้งค่าแอปเดิม (เดิมแท็บนี้บันทึกไม่ได้ — \${} ถูก escape) · app.js ส่วน `// opening_balance.js` (OB) · กล่อง #ob-root
- ปิดเดือน → เมนูใหม่ "ปิดเดือน" (view-close) · app.js ส่วน `// period_close.js` (PC) · ปุ่ม "ไปแก้" → หน้าในแอปเดิม (FIX map) · openSettingsTab(tab)
- ledger/opening.html, ledger/close.html เลิกใช้ (ลิงก์ในหน้า ledger อื่นชี้ ../index.html แล้ว) — ให้ North `git rm`
- ⚠️ ค้างตัดสินใจ: (1) สลิป LINE ไหลเข้า LedgerDocs → UI อยู่ ledger/index.html เท่านั้น (2) ปิดเดือนข้อ statements ใช้ LedgerStatements แต่แอปเดิมนำเข้า statement เป็นรายการรอตรวจสอบตรง ๆ → ข้อนี้ไม่ผ่านถ้านำเข้าทางแอปเดิม

## 2026-10-15 · พื้นที่ทำงานร่วมกับ ChatGPT (ภาพ/ไอคอน)
- โฟลเดอร์ `ภาพและไอคอน (ChatGPT)/` (อยู่ใน .gitignore) · Claude เขียนคำสั่งใน requests/ · ChatGPT เซฟภาพใน outputs/ · ทะเบียน STATUS.md กันงานซ้ำ · กติกาใน README-สำหรับ-ChatGPT.md
- ภาพที่เลือกแล้ว Claude คัดลอกเข้า frontend/assets แล้วกรอก "ใช้ในแอปที่" ใน STATUS.md

## 2026-10-15 · North ตัดสินใจ: 1ก สลิป LINE เข้า "รอตรวจสอบ" แอปเดิม · ยกเลิกฟีเจอร์ปิดเดือน
- สลิป LINE ที่จับบัญชีได้ → เป็น Transactions PENDING_REVIEW อยู่แล้ว (processSlip) → เห็นในรอตรวจสอบ · การ์ดมีปุ่ม 📎 (showSlip ดึง /api/inbox/file/{doc} แบบมี token)
- app.js `// line_slips.js` (LineSlips) กล่องบนสุดของรอตรวจสอบ: เอกสารสถานะ NEEDS_ACCOUNT / NEEDS_CHOICE / ERROR / READING / STORED → ปุ่มเลือกบัญชี / ผูกรายการ / อ่านใหม่ / ไม่ต้องบันทึก · เรียก GET /api/inbox?adopt=0 (ใหม่: ไม่ดึงรายการรอตรวจเข้ากล่อง)
- แก้บั๊ก: บันทึกการ์ดรอตรวจสอบเดิมไม่ส่ง slip_image_url → INSERT OR REPLACE ลบลิงก์สลิปทิ้ง · ตอนนี้ส่งกลับแล้ว (cardEl.dataset.slip)
- ยกเลิกปิดเดือน: ลบเมนู + view-close + โค้ด PC ออกจากแอปเดิม (โค้ดเดิมอยู่ใน commit c1ee3c6) · backend period-close + trigger ยังอยู่ ไม่มีผลถ้าไม่มีเดือนที่ปิด
- ledger/quick.html เก็บไว้ = หน้าแก้สลิปที่เปิดจากการ์ดใน LINE (ส่วนหนึ่งของ LINE ไม่ใช่หน้าแอป)
- mockup: 007 ยกเลิก · เมนูใน prompt เหลือ 7 รายการ · 002 เพิ่มกล่องสลิป LINE

## 2026-10-15 · บัตร & เงินกู้ + ทรัพย์สิน ย้ายเข้าแอปเดิม (ข. ก่อนปรับหน้าตาตาม mockup A / โหมดมืด C)
- เมนูใหม่ในแอปเดิม: "บัตร & เงินกู้" (view-cards · app.js CardsView) · "ทรัพย์สิน" (view-assets · app.js AssetsView) ต่อจากลูกหนี้/เจ้าหนี้
- ย้ายด้วยสคริปต์ ~/obport/port.py (ในเครื่อง VM ของ session): CSS เดิม prefix ด้วย #view-cards / #view-assets · id #view/#tabs → #cl-view/#cl-tabs, #as-view/#as-tabs · หน้าต่าง/toast ต่อเข้า ROOT แทน body · โค้ดหน้าเดิมแทบไม่แก้
- ลิงก์ ?txId= จาก LINE เก่า → เปิด "รอตรวจสอบ" ของแอปเดิม (เดิมพาไป ledger/index.html)
- ledger/cards.html, ledger/assets.html เลิกใช้ → git rm · หน้า ledger ที่เหลือ: home, index, reports, settings (ซ้ำกับแอปเดิม จะลบตอนปรับหน้าตา) · quick.html (หน้าแก้สลิปจากการ์ด LINE เก็บไว้)
- ยังค้างในแอปเดิม: ปุ่มล้างข้อมูลในตั้งค่ายังชี้ ledger/settings.html · มือถือยังไม่มีเมนูบัตร/ทรัพย์สิน (จะทำตอนปรับเมนูล่างตาม mockup: 5 ปุ่ม + "เพิ่มเติม")
- ถัดไป: ปรับหน้าตาตาม mockup แบบ A ทีละหน้า + โหมดมืด (แบบ C) ในตั้งค่า → ธีม

## 2026-10-15 · ปรับหน้าตารอบ 1 (แบบ A ม่วงนุ่ม = ค่าเริ่มต้น · แบบ C = ธีม "โหมดมืด")
- ไฟล์ใหม่ frontend/ui-a.css (โหลดหลัง style.css): ธีม data-theme="purple" / "dark" + body.ui-a / body.ui-dark (applyTheme ใน app.js) · ธีมเก่า 6 แบบยังเลือกได้ ไม่ถูกแตะ
- จำธีมด้วยคีย์ใหม่ localStorage 'app-theme2' (ทุกคนเริ่มที่ purple)
- 3 ขนาดจอ: คอม = เมนูซ้ายเต็ม · 769–1180px (iPad) = เมนูซ้ายไอคอน · ≤768px = เมนูล่าง 5 ปุ่ม (ภาพรวม · รอตรวจ · ＋เพิ่ม · ประวัติ · เพิ่มเติม) + แผ่น #more-sheet (ลูกหนี้ บัตร ทรัพย์สิน ทริป รายงาน ตั้งค่า)
- ภาพรวม (dv2Render): แถว KPI 4 ใบ (dv2Kpis · รอตรวจนับจาก ?count=1) → เงินฝาก/บัตร/ลงทุน → วงกลมรายรับ/รายจ่าย (dv2Donut, conic-gradient) + เงินไปไหน 5 อันดับ (dv2Top5) → งบ → เฉลี่ย/ลูกหนี้/เจ้าหนี้ → ภาษีหัก ณ ที่จ่าย → แผน · ตัวกรองสมาชิกย้ายขึ้นแถบบน · หัวกลางซ่อนในหน้าภาพรวม (body[data-view])
- รอตรวจสอบ: #pending-hero (renderPendingHero) ปุ่มใหญ่ 3 ปุ่มเรียกปุ่มเดิม (ซ่อน #pending-import-actions ใน ui-a) + KPI 4 ใบ · ความคืบหน้านำเข้าสะท้อนจากปุ่มเดิม (MutationObserver) · ผลนำเข้าล่าสุด localStorage 'rr_last_import' · การ์ดรายการหัวสีอ่อน · มือถือแถวย่อยเป็น 2 คอลัมน์
- ทดสอบหน้าตาด้วย Playwright ใน cloud (scratchpad/shot.mjs + mock API) — ไอคอน FontAwesome ไม่ขึ้นในเครื่องทดสอบ (CDN)
- ถัดไป: ประวัติ → ลูกหนี้ → รายงาน → ตั้งค่า (+ ย้ายปุ่มล้างข้อมูล) → ลบ ledger/home, index, reports, settings

## 2026-10-15 · ปรับหน้าตารอบ 2 (ประวัติ · ลูกหนี้/เจ้าหนี้ · รายงาน · ตั้งค่า) + เลิกใช้หน้า ledger ที่เหลือ
- ประวัติ: #history-kpis (renderHistoryKpis) จำนวน/รับ/จ่าย + ปุ่มส่งออก Excel รายการที่กรองอยู่ (exportHistoryShown) · ตัวกรองเป็นกริด · มือถือ 2 คอลัมน์
- ลูกหนี้/เจ้าหนี้: DebtorView (app.js `// debtor_view.js`) ใช้ /api/inbox/parties + /parties/{key} · แท็บ สรุป/ลูกหนี้/เจ้าหนี้/สัญญาเงินกู้ (= หน้าทะเบียนหนี้แบบเดิม .debts-neumorph-dashboard ซ่อน/แสดงตามแท็บ)
- รายงาน: แท็บเป็นการ์ดไอคอน (.rt-ic/.rt-tx) · ตารางเลื่อนแนวนอนบนมือถือ
- ตั้งค่า: แท็บเป็นการ์ด · แถบเลือกธีม .st-theme (bindSettingsTheme → #theme-selector) · resetData ยกระดับ: preview จำนวน + closed_periods → RESET → สำรอง → ลบ (reopen_closed)
- เลิกใช้: frontend/ledger/home.html, index.html, reports.html, settings.html → git rm · เหลือ ledger/quick.html + theme.js (หน้าแก้สลิปจากการ์ด LINE)
- โหมดมืด: บัตร & เงินกู้/ทรัพย์สิน ใช้ตัวแปรสีของธีม (--ink/--bg/--brand → ธีม) + ทับพื้นขาวตายตัว · หัวข้อตั้งค่า sticky ใช้สีการ์ด (ui-a.css v7)

## 2026-10-15 · นำเข้า statement ปลอดภัยขึ้น + จับคู่สลิป/ใบเสร็จ (North: นำเข้าผิดบัญชี)
- ตรวจก่อนนำเข้า statementPrecheck (ทั้งทางอ่านเองและทาง AI): เลขบัญชีในไฟล์ vs บัญชีที่เลือก · ไม่ตรงแต่ตรงบัญชีอื่น → ปุ่ม "นำเข้าเข้า <บัญชีนั้น>" · สรุปช่วงวันที่/จำนวน/เข้า-ออก/ยอดยกมา-ยกไป ทุกครั้ง
- ลบทั้งชุดที่นำเข้า: pendingImportBatches (บัญชีเดียวกัน + created_at ห่าง ≤15 นาที) → POST /api/transactions/bulk-delete (เฉพาะ PENDING_REVIEW ของบัญชีที่มีสิทธิ์ · ≤3000 · ลบ details + LedgerDocLinks)
- ยอดนำเข้า statement เก็บติดเครื่องหมายจริงแล้ว (จ่าย = ลบ) · dedupe PDF เทียบ ABS + ไม่นับตัวเอง (เดิมกดบันทึกการ์ดอาจถูกมองว่าซ้ำตัวเอง)
- การ์ดรอตรวจ: บันทึกแล้วเก็บข้อความธนาคารเดิม (dataset.desc) ไม่ทับด้วยชื่อ Caption — เดิมทำให้นำเข้าไฟล์เดิมซ้ำแล้วกันซ้ำไม่ได้
- match_existing: บรรทัด statement ยอด+ทิศ+บัญชีตรงกับรายการ LINE_SLIP/LINE_TEXT/WEB_GRID ภายใน ±3 วัน (ใกล้สุดตัวเดียว) → ไม่สร้างใหม่ ปรับรายการเดิมเป็นวันที่/ข้อความธนาคาร source=PDF_IMPORT (เก็บรูปสลิป)
- findCandidates (สลิปมาทีหลัง) จับคู่รายการนำเข้ารุ่นเก่าที่ยอดเป็นบวกได้ · action ใหม่ POST /api/inbox/{doc}/rematch (STORED/NEEDS_CHOICE) · หลังนำเข้าเรียก rematchWaitingDocs อัตโนมัติ
- รอตรวจสอบ: ปุ่ม "สลิป / ใบเสร็จ" อัปโหลดหลายไฟล์จากเว็บ (uploadSlipFiles → /api/inbox/upload ทีละไฟล์ พร้อมกัน 2)
- เทสต์เพิ่ม: endpoints (+5) · ledger-inbox (+1)

## 2026-10-15 (ต่อ) · อ่านภาพแคป/บัตรเครดิต/กระเป๋าเงิน + ข้อเสนอ ก–จ
- นำเข้า Statement รับ PDF + ภาพหลายภาพ (input multiple, image/*): ภาพ → ย่อ ≤1800px → /api/statement-ocr imagesBase64 → precheck → import · prompt runGeminiStatement รองรับ BANK / CREDIT_CARD / E_WALLET (TrueMoney, ShopeePay, Rabbit LINE Pay) / SHOP_ORDERS (Shopee, Lazada) + ปีหายในภาพแคป = ปีปัจจุบัน
- EXTRACT_PROMPT (สลิป/ใบเสร็จ): e-wallet = SLIP · ออเดอร์เดียว = ORDER · ภาพหลายรายการ = LIST → STORED พร้อมข้อความให้ใช้ปุ่มนำเข้า Statement
- ก. จำหมวด: GET /api/transactions/category-hints (3000 รายการยืนยันล่าสุด บรรทัดเดียว มีหมวด → key "OUT|IN" + statementKey) · importStatementRows เติม category/contact/entity/type · statementKey ต้องเหมือนกันทั้ง app.js และ index.js
- ข. รอตรวจสอบ: "🏷️ ใส่หมวดหลายรายการ" (bulkCategorize: คำในข้อความธนาคาร → หมวด/Company/คู่ค้า แถวย่อยแรก) · "💾 บันทึกทั้งหมดที่พร้อม" (bulkSaveReady: Caption+หมวดครบ + ✅ → POST + confirm ทีละ 3)
- การ์ดที่หมวดมาจากระบบ → เลือก Caption ให้จากหมวด (initialCaptionId)
- ค. action ใหม่ POST /api/inbox/{doc}/learn → learnFromDoc · เรียกหลังยืนยันการ์ดที่มีสลิป (slipDocIdOf) ทั้งทีละใบและบันทึกทั้งหมด
- ง. ล็อกเวอร์ชัน CDN: pdf-lib@1.17.1 · sweetalert2@11.26.25 · chart.js@4.5.1 (xlsx ยังเป็น xlsx-latest — ตรวจเวอร์ชันจากเครื่องนี้ไม่ได้)
- จ. renderSharedStatusSummary ใช้ AppState.pendingTransactions ที่เพิ่งโหลด (≤15 วิ) ไม่ดึงซ้ำ

## 2026-10-15 (ต่อ) · ยอดยกมาจาก statement + เมนูนำเข้า Excel
- สาเหตุ "บัญชีไม่รวมยอดยกมา": ตัวอ่าน statement ข้ามบรรทัด "ยอดยกมา" (ไม่ใช่รายการ) → ยอดบัญชี = ผลรวมการเคลื่อนไหวเท่านั้น จนกว่าจะใส่ชุดยอดยกมา
- GET /api/accounts/balance-at?account_id&date → ยอดก่อนวันนั้น (ยืนยัน + รอตรวจ · กลับเครื่องหมายรายการนำเข้าเก่าที่จ่ายแต่เก็บบวก) + count
- statementPrecheck: เทียบยอดยกมาในไฟล์ (บัตรเครดิต = ติดลบ) กับ balance-at(วันแรก) · count=0 → ติ๊ก "สร้างยอดยกมา" (POST /api/inbox/opening ชุดใหม่ 1 บัญชี ณ วันแรก) · ไม่ตรง → เตือนแดง · ตรง → ✅
- prompt statement-ocr คืน opening_balance / closing_balance แล้ว (ทาง AI/ภาพแคปใช้ตรวจยอดยกมาได้)
- เมนู "นำเข้า Excel ▾" ในการ์ด: รอตรวจ · ข้อมูลเก่า→รอตรวจ · ข้อมูลเก่า→ยืนยันเลย · แม่แบบ (เรียกปุ่มเดิมที่ซ่อน) · ย้าย #bulk-import-overlay ไป body (เดิมถูกซ่อนตามแถบหัว) · หน้าประวัติมีปุ่ม "นำเข้า Excel" พาไปเปิดเมนู

## 2026-10-15 — ยอดหน้า "รอตรวจสอบ"/แผง ไม่ตรงยอดยกมา
- สาเหตุ: (1) สรุปบัญชีหน้ารอตรวจใช้ยอด AppState.accounts ที่ค้าง (2) แผงนับเฉพาะ CONFIRMED (3) บัญชีที่นำเข้าก่อนมีระบบเช็คยอดยกมา ยังไม่มีชุดยอดยกมา
- แก้: renderSharedStatusSummary ดึง /api/accounts สด, ป้ายแยก ยืนยันแล้ว/รอตรวจ/รวม, ปุ่ม "⚖️ ปรับให้ตรงธนาคาร" → reconcileAccount() ปรับบรรทัด ACC ในชุดยอดยกมาเดิม หรือสร้างชุดใหม่ ณ first_date
- backend: /api/accounts/balance-at คืน first_date เพิ่ม
- app.js?v=194, ui-a.css?v=11 · ทดสอบผ่านครบ 13 ชุด + check-frontend ทั้ง 2

## 2026-10-30 — ตรวจยอดคงเหลือ (หน้ารอตรวจสอบ)
- การ์ดบัญชีหน้ารอตรวจ: 🏦 ยืนยันแล้ว / ⏳ รอตรวจ / 💰 รวมตอนนี้ + 📄 ยอดธนาคาร ณ วันที่ เทียบ 🧮 ระบบ ณ วันเดียวกัน → ✅ ตรง / ⚠️ ต่าง + ปุ่ม ⚖️ ปรับยอดยกมาให้ตรง
- ยอดธนาคารมาจาก: ยอดยกไปของ statement ที่นำเข้า (อัตโนมัติ · window._rrCheckpoint ตั้งใน statementPrecheck ส่งใน importStatementRows) หรือ 📝 ใส่เอง (วันที่+ยอด) · บัตรเครดิตเก็บติดลบ
- ปุ่ม ➕ ทุกบัญชี แสดงบัญชีที่ไม่มีรายการรอตรวจด้วย
- backend: ตาราง AccountCheckpoints (สร้างเองตอนเรียก + setup-db.sh) · POST /api/accounts/checkpoint · GET /api/accounts/checkpoints (ล่าสุดต่อบัญชี + ยอดระบบ ณ สิ้นวัน)
- หน้าอื่นที่มียอดคงเหลือ: แผง (ยืนยันแล้วเท่านั้น), ตั้งค่า→บัญชี (ยืนยันแล้วเท่านั้น)
- app.js?v=195 · ui-a.css?v=12 · ทดสอบผ่านครบ (endpoints 33)

## 2026-10-30 — ทำงานร่วมกับ ChatGPT (ออกแบบ/ภาพ) · เริ่มแชทใหม่
- North จะย้ายไปแชทใหม่ · งานออกแบบ/ปรับโครงสร้างหน้าตาทำร่วมกับ ChatGPT
- วงจร: North สั่ง Claude ออกแบบ → Claude เขียน prompt ใน `ภาพและไอคอน (ChatGPT)/design.md` (+ requests/ + STATUS 📝) → บอก North → North สั่ง GPT "ทำตาม design.md" → GPT เซฟ outputs/ → North บอก Claude "GPT เสร็จแล้ว" → Claude ตรวจภาพเทียบ prompt → ไม่ผ่าน: เขียน "รอบแก้" ใน design.md + STATUS 🔁 แล้วบอก North · ผ่าน: คัดเข้า `คลังภาพ/`
- ค้าง: (1) North ยังไม่ได้ deploy งาน 15–30 ต.ค. (ตรวจยอดคงเหลือ/ปรับยอดยกมา) (2) ระบบเก็บไฟล์ลง Google Drive รอคำตอบ 4 ข้อ (วิธีเชื่อม Apps Script/OAuth · บัญชี Google · PDF ล็อกรหัส · เก็บสลิปด้วยไหม)

## 2026-10-30 (ต่อ) · โจทย์ใหม่ 7 ข้อ + เปิดงานออกแบบ 008
- North ขอ: (1) รายงาน Excel/PDF ยอดสะสมต่อ statement หารายการขาด (2) จับคู่สลิปจากภาพ (วันที่ เวลา โน้ต) + หน้าตรวจก่อนยืนยัน · ส่งจาก iPhone หรือ Google Drive (3) ผูกผังเก็บรายได้กับเงินเข้า (เพื่อบันทึกเท่านั้น) (4) ปรับโครงสร้างหน้าตากับ GPT — ดูจนพอใจก่อนทำ (6) จำรูปแบบนำเข้าต่อ statement (บัตรเครดิตก็เป็น statement) (7) จับคู่ภาพแคป Shopee/Lazada/แอปจ่ายเงิน
- Google Drive: บัญชี nimz.4.april@gmail.com · PDF ล็อกรหัส = เก็บต้นฉบับ ระบบถอดรหัสให้อัตโนมัติตอนเปิดดู · เก็บ statement + ใบแจ้งหนี้ + สลิป + รูปค่าใช้จ่าย (หลายรูป, รูป/PDF) · วิธีเชื่อม รอ North ตัดสิน (อธิบาย Apps Script vs OAuth แล้ว)
- เปิดงาน 008 ใน design.md (3 แนวคิดโครงสร้าง ก/ข/ค · หน้าแรก + ตรวจสลิป) · เลขถัดไป 009
- ข้อสังเกต: ยอดคงเหลือรายบรรทัดของ statement (AI อ่านได้ใน fixStatementSigns) ยังไม่ได้เก็บลงรายการ → รายงานข้อ 1 ต้องเริ่มเก็บ

## 2026-10-30 (ต่อ) · 📒 รายงานยอดสะสมต่อ statement (Excel + PDF) — เสร็จในโค้ด รอ deploy
- หน้า รายงาน → แท็บใหม่ "ยอดสะสม statement": เลือกบัญชี (หรือทุกบัญชี) + ช่วงวันที่ → ดู / Excel / PDF · รวมยืนยัน + รอตรวจ · บัตรเครดิตแสดงยอดค้างเป็นบวก (มุมธนาคาร)
- ตรวจให้: ① ยอดสะสมระบบ vs ยอดคงเหลือที่ธนาคารพิมพ์ทุกบรรทัด → "เริ่มต่าง" (แดง) = รายการขาด/เกินก่อนบรรทัดนั้น ② ยกมา/ยกไป vs หัว statement ③ รายการในช่วง statement ที่ไม่มีใน statement (เหลือง · อาจซ้ำ/ผิดบัญชี/สลิปยังไม่จับคู่ + "อาจซ้ำกับบรรทัด n") ④ ในระบบมีน้อยกว่าบรรทัดในไฟล์ ⑤ ช่วงวันที่ไม่มี statement
- Excel: แผ่น "สรุป" + 1 แผ่นต่อ statement (ยกมา/รายการ/ยกไป · ตัวเลขติดลบวงเล็บแดง) · PDF: หน้าต่างพิมพ์ A4 แนวนอน (เปิดหน้าต่างทันทีตอนกด กัน iPhone บล็อก)
- backend: `backend/src/stmt-report.js` · คอลัมน์ใหม่ Transactions.stmt_id / stmt_seq / stmt_balance + ตาราง StatementImports (สร้างเองครั้งแรกที่เรียก ไม่ต้องรันคำสั่ง) · POST /api/statements/header (statement เดิม = ใช้ id เดิม) · GET /api/reports/statement-running
- POST /api/transactions: รับ stmt_* · แก้การ์ดแล้ว stmt_* ไม่หาย · จับคู่สลิปเดิม → สลิปได้ stmt_* · **นำเข้า statement เดิมซ้ำ = เติมยอดรายบรรทัดย้อนหลังให้รายการเดิม** (ยังข้ามซ้ำเหมือนเดิม)
- นำเข้า 3 ทาง (PDF ตัวหนังสือ / AI PDF / ภาพ) ส่งหัว statement + ยอดรายบรรทัด · prompt AI เพิ่มช่อง balance
- ข้อจำกัด: statement ที่นำเข้าก่อนหน้านี้ไม่มียอดรายบรรทัด → จัดกลุ่มตามเดือน เทียบได้แค่จุดตรวจ (หรือนำเข้าไฟล์เดิมซ้ำเพื่อเติม) · บัตรเครดิตไม่มียอดรายบรรทัด เทียบยกมา/ยกไป · Full Backup/Restore ยังไม่พา stmt_* ไปด้วย
- เทส: backend/test/stmt-report.test.mjs (17) + ชุดเดิมผ่านครบ · app.js?v=196 · ui-a.css?v=13 · ทดสอบหน้าตา iPhone/คอม + Excel/PDF ด้วยข้อมูลจำลองแล้ว
- North ส่งตัวอย่าง: สลิป 10 ใบ (K+ · KBIZ · SCB · กรุงศรี · เป๋าตังไทยช่วยไทย) · ใบแจ้งยอดบัตร กรุงศรี 30/11/25 + KBank Shopee 20/02/26 · ผังรายได้ customertest.xlsx (ทะเบียนใบแจ้งหนี้/ใบเสร็จ BKP ~2,358 แถว: Code ลูกค้า · OWNER · Type Account/Audit/Service · ค่าบริการ · WHT · รวม · บัญชีที่เงินเข้า · Receipt Date)

## 2026-10-30 (ต่อ) · 🧾 ตรวจสลิปทีละใบ + จับคู่สลิปดีขึ้น — เสร็จในโค้ด รอ deploy (app.js v197)
- North ตอบ: เป๋าตัง/ไทยช่วยไทย = บันทึกยอดจ่ายจริง (80) · ผังรายได้ customertest.xlsx = ไฟล์สุดท้าย (นำเข้าครั้งเดียว) · Google Drive = Apps Script · ลำดับงานให้ Claude เลือก
- หน้ารอตรวจสอบ → ปุ่ม "🧾 ตรวจสลิปทีละใบ" (และเปิดเองหลังอัปโหลดสลิป): รูปซ้าย · สรุปยอด/วันเวลา/ผู้โอน→ผู้รับ/บันทึกช่วยจำ · รายการที่จับคู่ทุกขา (✅ ตรง statement / 🆕 สร้างรอตรวจ / ❓ เลือก) · หมวด + รายละเอียด · ✓ ยืนยัน · ✕ ไม่บันทึก · ‹ › · ✏️ แก้ข้อมูลที่อ่าน (วันที่ เวลา ยอด ค่าธรรมเนียม บันทึก บัญชีฝั่งออก/เข้า) แล้วจับคู่ใหม่
- backend ledger-inbox.js: action ใหม่ fields / unmatch (ไม่ใช่รายการนี้ → ไม่จับรายการนั้นอีก) / pick / review (ยืนยันทุกขาพร้อมหมวด · โอนระหว่างบัญชี = Bank_Transfer อัตโนมัติ · แก้บรรทัดเดียวในที่ ไม่ลบ detail กันตัดชำระหาย)
- จับคู่ statement ได้ → แนบรูปสลิป + บันทึกช่วยจำให้รายการนั้น (ไม่ทับของเดิม) · ตัดคู่แล้วเอารูปออก
- เลขบัญชีบนสลิปที่ปิดหลักท้าย (KBank xxx-x-x2210-x · กรุงศรี XXX-1-71696-X) เทียบทีละตำแหน่งกับเลขเต็ม (maskedAccountMatch) · ชื่อธนาคารไม่ตรงแต่เลขตรงบัญชีเดียว → ใช้ได้ · alias ใหม่ CARDX / KTC / PAOTANG (มาก่อน SCB/KTB)
- prompt อ่านสลิป: ยอด = จ่ายจริง (ส่วนลดรัฐ → subsidy_note ลงโน้ต) · จ่ายบัตร: receiver.account = เลขบัตร · เป๋าตัง · shop_category
- ⚠️ ต้องกรอกเลขบัญชีเต็มใน ตั้งค่า→บัญชี (account_number) ให้ระบบรู้บัญชีจากสลิปได้เองตั้งแต่ใบแรก
- เทส: backend/test/slip-review.test.mjs (24 · ใช้กรณีสลิปจริง) · ทุกชุดผ่าน · ทดสอบหน้าจอ iPhone/คอมด้วยสลิปจริง (mock)
- งาน 008 GPT v1: หน้าตรวจสลิป 3 ภาพผ่าน · หน้าแรกชื่อไฟล์สลับ (kc-home = แนวคิด ข) + ไม่มีแนวคิด ค → เขียนรอบแก้ 1 (home v2 × 3) · STATUS 🔁
- งานถัดไป: ผังรายได้ (ข้อ 3) → จำรูปแบบนำเข้า (ข้อ 6) → Google Drive Apps Script

## 2026-10-30 (ต่อ) · North เลือก ก: statement เป็นตัวตั้ง สลิปเป็นหลักฐานประกอบ (app.js v198 · ui-a.css v14)
- หน้ารอตรวจสอบ: การ์ดที่มีสลิปแนบมีแถบเหลือง รูปย่อสลิป (โหลดเฉพาะการ์ดที่เห็น · SlipThumbs) + บันทึกช่วยจำ · กดเปิดสลิป · ชิปกรอง "📎 มีสลิป n / ไม่มีสลิป n" (AppState.pendingSlipFilter)
- ปุ่ม/หน้า "🧾 สลิปที่ยังไม่จับคู่" = เฉพาะสลิปสถานะ READING/NEEDS_ACCOUNT/NEEDS_CHOICE/SUGGESTED/STORED/ERROR (ที่จับคู่แล้วตรวจในหน้ารอตรวจสอบ) · หลังอัปโหลดเปิดให้เฉพาะเมื่อมีใบที่ยังไม่จับคู่
- backend: สลิปจับคู่ statement ได้ + คู่ค้าเคยยืนยันแบบบรรทัดเดียว → ใส่หมวด/บริษัท/คู่ค้าให้บรรทัด statement ที่ยังไม่มีหมวด (ยังรอตรวจ) · เทส slip-review 25
- ไฟล์ว่าง backend/test/slip-review.test.mjs.tmp ย้ายไป `_to_delete/` (ลบไม่ได้ · เพิ่ม `_to_delete/` ใน .gitignore)
- งาน 008 รอบแก้ 1: STATUS = 🎨 กำลังสร้าง (12:17 ยังไม่มีไฟล์ v2 ในโฟลเดอร์)

## 2026-10-30 (ต่อ) · 👥 ผังรายได้ → จับเงินเข้า (app.js v199 · ui-a.css v15) + งาน 008 ตรวจผ่าน
- backend `revenue-chart.js` + ตาราง RevenueChart (สร้างเอง) · /api/revenue-chart/import (ชุด ≤300 · reset ลบเฉพาะแถวที่ยังไม่ใช้) · summary · map (REV_OWNER / REV_ACCOUNT / REV_SETTING advance_category ใน LedgerRules) · suggest (≤80 รายการ) · apply
- จับคู่: ยอด "รวม" (หรือ "ยอดชำระ") = เงินเข้า · แถวเดียว หรือ 2–4 แถวลูกค้าเดียวกัน (โอนหลายเดือน) ±120 วัน · ยอมค่าธรรมเนียมธนาคาร ≤50 · คะแนน: วันรับเงิน ±3 วัน, บัญชีที่เงินเข้าตรง, ชื่อลูกค้าอยู่ในข้อความธนาคาร
- apply: บรรทัดค่าบริการ (หมวด = Type: Account/Audit/Service · หัก ณ ที่จ่าย · บริษัท = OWNER ที่ผูก · คู่ค้า = ลูกค้า สร้างใหม่ถ้าไม่มี) + บรรทัดเงินรับแทน (= รวม − (ค่าบริการ − WHT) · หมวดที่ตั้ง) · ยังรอตรวจ · จองแถว matched_tx
- หน้า: ปุ่ม "👥 ผังรายได้" ในหน้ารอตรวจสอบ (นำเข้า .xlsx + ผูก OWNER/บัญชี/หมวดเงินรับแทน) · การ์ดเงินเข้ามีแถบเขียว "👥 CODE ชื่อ … [ใช้]" ≤3 ตัวเลือก
- ทดสอบไฟล์จริง: 2,316 แถว (รหัสแถวซ้ำ 69 → ต่อท้าย #n) · ปี 2569 จับถูกอันดับ 1: 258/318 (ที่เหลือส่วนใหญ่ยอดเท่ากันหลายเดือน → ให้เลือก) · เทส revenue-chart.test.mjs 21
- งาน 008 รอบแก้ 1 (home v2 × 3) ตรวจผ่าน → STATUS "รอ North เลือกแนวคิด" · ส่งภาพเทียบ 008-v2-compare ให้ North

## 2026-10-30 (ต่อ) · North เลือกแนวคิด ข "ตามบัญชี" · เปิดงาน 009
- 008 → 📌 เลือก ข · คัดเข้า `คลังภาพ/mockup-ที่เลือก/`: 008-ข-ตามบัญชี-หน้าแรก (ต้นแบบหลัก) · 008-ข-ตรวจสลิป · 008-ค-ฟองหมวด (ใช้ในหน้ารายงาน) · 008-ก-ปุ่มส่งเข้า (ใช้เป็นหน้าต่างปุ่ม ＋)
- งาน 009 (📝): แนวคิด ข 7 หน้า คอม+iPhone: รายละเอียดบัญชี (แถบเดือน statement + ยอดสะสม vs ธนาคาร) · รอตรวจ · หน้าต่าง ＋ · ประวัติ · ลูกหนี้/เจ้าหนี้ · รายงาน · ตั้งค่า · ถัดไป: iPad + โหมดมืด C · ชุดไอคอนหมวด
- North: เปลี่ยนชื่อคู่ค้าในตั้งค่า → เปลี่ยนตามทุกรายการ (เก็บ contact_id อยู่แล้ว) · แก้รายการรายตัวที่หน้าประวัติ → ผังรายได้จำ Code → คู่ค้า (LedgerRules REV_CONTACT) ไม่สร้างคู่ค้าซ้ำหลังเปลี่ยนชื่อ · เทส revenue-chart 22

## 2026-10-30 (ต่อ) · งาน 009 ผ่าน · เปิดงาน 010
- 009 (แนวคิด ข 7 หน้า) ตรวจผ่าน → `คลังภาพ/mockup-ที่เลือก/009-*.png` · ข้อสังเกตแก้ตอนทำจริง: หน้าบัญชีเมนูซ้ายเลือกผิด + แถบ "เริ่มต่าง" ต้องอยู่ที่บรรทัด · ประวัติใช้ปี ค.ศ. · การ์ด "ยอดสะสม" ในรายงานต้องเป็นรายงาน statement
- 010 (📝): iPad 4 หน้า (หน้าแรก · บัญชี · รอตรวจ · รายงาน) + โหมดมืด C 2 หน้า + 010-7 แก้หน้าบัญชี (v2)
- North: หน้ารายงานแบบฟองวงกลมดูงง → งาน 010 เพิ่มรายงาน 3 แบบให้เลือก (A แถบแนวนอน · B โดนัท+ตาราง · C แนวโน้มรายเดือน) · iPad รายงานรอเลือกแบบก่อน

## 2026-10-30 (ต่อ) · 🔁 รายการซ้ำ + หน้ารอตรวจโหลดครบ (app.js v200 · ui-a.css v16)
- North ส่งภาพรายงาน Kbank 6282222106 พ.ย. 68: รายการซ้ำ (ข้อมูลเก่าที่ยืนยันแล้ว ไม่มีเวลา เช่น "Ppuy 1.11.25" Lotto 158 · กับบรรทัด statement ที่รอตรวจ "K PLUS โอนไป… 158 16:04") + หาในประวัติ/รอตรวจไม่เจอ
- สาเหตุ ①: match_existing ตอนนำเข้า statement จับได้แค่ LINE_SLIP/LINE_TEXT/WEB_GRID ไม่รวมข้อมูลเก่าที่นำเข้าจาก Excel (source PDF_IMPORT) → สร้างซ้ำ · ②: หน้ารอตรวจโหลดแค่ 500 รายการล่าสุด (GET ไม่มีช่วงวันที่ = limit 500) · หน้าประวัติไม่เลือกเดือน/ไม่ค้นหา = 500 ล่าสุด
- แก้: หน้ารอตรวจ `&limit=0` (ทั้ง loadPending และสรุปตรวจยอด) · นำเข้าใหม่จับคู่กับรายการที่ยืนยันแล้วที่ไม่มีเวลา+ไม่ได้มาจาก statement ด้วย (ข้อความเดิมย้ายไปหมายเหตุ)
- ของที่ซ้ำแล้ว: GET /api/transactions/duplicates (คู่ 1:1 · ยอดเท่า เครื่องหมายเดียวกัน ±3 วัน) · POST /api/transactions/merge (≤100 คู่ · เก็บรายการเดิม+หมวด · เติมเวลา/ข้อความธนาคาร/ref/stmt_*/สลิป · ย้ายลิงก์สลิป · ลบบรรทัดซ้ำ) · หน้ารอตรวจ: ชิป "🔁 อาจซ้ำ n" (กรอง) + ปุ่ม "รวมรายการซ้ำทั้งหมด" + แถบส้มบนการ์ด "รวมเป็นรายการเดียว" · รายงานยอดสะสม: แถวเหลือง "🔁 อาจซ้ำกับบรรทัด n"
- เทส stmt-report 22 · ทุกชุดผ่าน
- 010 v1: ผ่าน 010-1 · 010-3 · 010-7 (คัดเข้าคลัง) · ไม่ผ่าน 010-2 (เมนู/ไม่มียอดธนาคาร) · 010-5/6 (ภาษาอังกฤษ คนละแอป) → รอบแก้ 1 · รายงาน A/B/C รอ North เลือก
- North เลือกหน้ารายงาน แบบ B โดนัท + ตาราง → คลังภาพ · เพิ่ม 010-4 iPad รายงาน B ในรอบแก้ 1
- 010 รอบแก้ 1 ผ่าน (010-2 v2 · 010-5 v2 · 010-6 v2 → คลังภาพ) · เหลือ 010-4 iPad รายงาน B (รอบแก้ 2)

## 2026-10-30 (ต่อ) · 💳 ใบแจ้งยอดบัตรเครดิตหลายบัตรในไฟล์เดียว (app.js v201)
- North: ใบแจ้งยอด KBank (KBGC_…_251220.pdf) มี 2 บัตร (4221…3000 KBANK-SHOPEE · 4417…9042 BLUE) · ยอด − = ชำระ/คืนเงิน · นำเข้าเลือกได้บัญชีเดียว → เดิมระบบส่ง AI อ่าน แล้วรวมทั้ง 2 บัตรเข้าบัญชีเดียว (ผิด)
- ใหม่: `parseCardStatement(pdf)` อ่านจากตัวหนังสือ (ไม่ใช้ AI) แยกตามหัว "เลขที่บัตร" · PREVIOUS BALANCE / TOTAL BALANCE ต่อบัตร · แถว = วันใช้บัตร วันบันทึก รายละเอียด ยอด · บวก = ใช้จ่าย · ลบ = เงินเข้า (PAYMENT/ชำระ/ขอบคุณ → note "ชำระบัตร" หมวด Bank_Transfer · ที่เหลือ → "คืนเงิน/ยกเลิกรายการ") · ไม่รับแถวหลัง TOTAL BALANCE (ตัวอย่างคิดดอกเบี้ย/ใบนำฝาก)
- `importCardStatement`: หน้าต่างสรุปทีละบัตร (ยกมา · ใช้จ่าย · เงินเข้า · ยกไป · ✅ ยอดเดินตรง) + เลือกบัญชีบัตร (เดาจากเลขบัตรในตั้งค่า หรือ 4 ตัวท้ายของบัญชี CREDIT) → statementPrecheck ทีละบัตร → importStatementRows (หัว statement แยกบัตร · จุดตรวจยอด = ยอดค้าง ณ วันสรุปยอด)
- ทดสอบไฟล์จริง: KBank ธ.ค. 68 (18 + 2 รายการ) และ ก.พ. 69 (23 + 1) ยอดเดินตรงทุกบัตร · กรุงศรี 30/11/25 อ่านได้ 11 รายการ แต่ไม่มียอดยกมา/ยกไป (ข้อความไทยในไฟล์เพี้ยน)

## 2026-10-30 (ต่อ) · 📚 นำเข้า statement หลายไฟล์พร้อมกัน (app.js v202)
- North เลือก ก · ปุ่มนำเข้า statement เลือก PDF ได้หลายไฟล์ → `batchImportStatements` (ไม่ต้องเลือกบัญชีก่อน · ไฟล์เดียวยังต้องเลือกเหมือนเดิม)
- อ่านเฉพาะไฟล์ที่มีตัวหนังสือ: ธนาคาร (parseTextStatement) / บัตร (parseCardStatement · หลายบัตร = หลายแถว) · ไฟล์สแกน → แจ้งให้นำเข้าทีละไฟล์ (AI)
- ตรวจ 4 ชั้นในตารางก่อนนำเข้า: ① เลขบัญชี/บัตร → บัญชี (statementAccountMatches · บัตร = 4 ตัวท้ายของบัญชี CREDIT) ไม่เจอ = เลือกเอง ② ยอดเดินในไฟล์ ③ ต่อเนื่อง: ยกมา = ยกไปไฟล์ก่อน (บัญชีเดียวกัน) / = ยอดระบบ ณ วันแรก · บอกช่วงที่น่าจะขาด statement ④ ซ้ำ: ไฟล์ซ้ำในชุด (SHA-256) ข้าม · เคยนำเข้าแล้ว (POST /api/statements/header check_only) ไม่ติ๊กให้ · รายการซ้ำรายบรรทัด = ระบบข้าม/จับคู่ตามเดิม
- นำเข้าเรียงตามบัญชี → วันที่ · จุดตรวจยอดต่อไฟล์ · สรุปผลทุกไฟล์ · ทดสอบด้วยไฟล์จริง 4 ไฟล์ (KBank ธ.ค./ก.พ. + ไฟล์ซ้ำ + กรุงศรี) ผ่าน · เทส stmt-report 24

## 2026-10-30 (ต่อ) · หัว statement ค้างหลังลบรายการที่นำเข้าผิดบัญชี (app.js v203)
- North: รายงาน KBank PTT Credit Card 9042 มี "23/11/68–17/12/68 · 0 รายการ · ไม่มีรายการในระบบ · ขาด 18 บรรทัด" = ใบแจ้งยอดบัตร Shopee 3000 ที่นำเข้าผิดบัญชีแล้วลบรายการไป → หัว statement + จุดตรวจยอด (ยอดตามธนาคาร) ยังค้าง
- แก้: `cleanupStatementHeaders` (stmt-report.js) ลบหัวที่ไม่เหลือรายการ + จุดตรวจยอด source STATEMENT ของบัญชีนั้นในช่วง statement (+10 วัน) · เรียกอัตโนมัติจาก bulk-delete (ลบทั้งชุด) และลบรายการเดี่ยว · POST /api/statements/delete (ลบเองเมื่อ 0 รายการ · มีรายการ = 409) · รายงาน: ปุ่ม "🗑️ ลบหัว statement นี้" บนกลุ่มที่ไม่มีรายการ
- ช่วงขาด statement ในรายงาน: ตัดสินจากยอดต่อกัน (ยกไป = ยกมาถัดไป → ไม่ขาด) · ไม่มียอด → ห่าง > 35 วัน (เดิมเตือนทุกช่องว่างวันที่ → เตือนเกินจริงกับใบแจ้งยอดบัตร)
- ใบแจ้งยอดบัตร: หัว statement ใช้รอบบัญชี (วันสรุปยอดเดือนก่อน+1 → วันสรุปยอด · cardCycle) · importStatementRows รับ meta.period_from/period_to
- เทส stmt-report 28
- 2026-10-30 17:30 · North: ใบแจ้งยอด Shopee 3000 รอบ พ.ค. 69 นำเข้าแล้วขาด 1 รายการ (13/05/26 (FOR SHOPEE) 134.00) · วิธี: นำเข้าไฟล์เดิมซ้ำ (หัว statement ใช้ id เดิม · บรรทัดที่มีแล้วถูกข้าม · ที่ขาดถูกเพิ่ม) · แก้ช่องโหว่: ตรวจซ้ำแบบ PDF ไม่นับบรรทัดอื่นใน statement เดียวกัน (stmt_id เดียวกัน stmt_seq ต่าง) เป็นรายการซ้ำ (ใบแจ้งยอดบัตรไม่มีเวลา · ร้านเดิมยอดเดิมวันเดิม 2 ครั้งเคยถูกข้าม) · เทส stmt-report 30

## 2026-10-30 (ต่อ) · ❗แก้บั๊กนำเข้าไฟล์เดิมซ้ำแล้วเกิดรายการซ้ำ + หัว statement ซ้อน (app.js v204)
- North นำเข้าใบแจ้งยอด Shopee C07 พ.ค./มิ.ย. ซ้ำ: "นำเข้า 33 / 41" (ควรเป็นมีอยู่แล้ว) + มิ.ย. มีหัว 2 อัน (20/05–19/06 · 0 รายการ · ขาด 41 กับ 20/05–20/06 · 40 รายการ) · รายการ 134.00 ที่ขาดยังไม่เข้า
- สาเหตุ ①: เงื่อนไขที่ใส่เมื่อ 17:30 (บรรทัด stmt_id เดียวกัน stmt_seq ต่าง = ไม่ซ้ำ) → ไฟล์อ่านได้ครบกว่าเดิม ลำดับบรรทัดเลื่อน → ทุกบรรทัดถูกมองว่าใหม่ ② หัว statement หาของเดิมด้วยวันที่ตรงเป๊ะ → เปลี่ยนรอบบัตร (cardCycle) แล้วไม่เจอ
- แก้: ตรวจซ้ำด้วย dup_idx (ลำดับของรายการเหมือนกันทุกช่องภายในไฟล์ · ซ้ำเมื่อในระบบมีถึงตัวนั้นแล้ว · OFFSET) แทน stmt_seq · หัวเดิม = บัญชีเดียวกัน + ช่วงทับกัน + ยกไปเท่ากัน (เลือกหัวที่มีรายการมากสุด · หัวทับกันที่ว่างลบทิ้ง) · POST /api/statements/sync (ไฟล์คือความจริง: รายการเหมือนกันในช่วงไฟล์ที่ระบบมีมากกว่าไฟล์ → ลบส่วนเกินเฉพาะรอตรวจ PDF_IMPORT ตัวที่สร้างทีหลัง) เรียกอัตโนมัติก่อนนำเข้าทุก statement · สรุปผลบอก "มีอยู่แล้ว n · 🧹 ลบที่ซ้ำ n · ➕ รายการที่เพิ่ม"
- เทส stmt-report 34 · ยังไม่รู้สาเหตุที่ 134.00 (13/05/26) ไม่ถูกอ่าน — ขอไฟล์ PDF พ.ค. จาก North

## 2026-10-30 · แก้บรรทัดบัตรเครดิตหาย (13/05/26 134.00)
- สาเหตุ: ขีดดำขอบซ้ายกระดาษใน PDF KBank ถูก pdf.js อ่านเป็นตัว "l"/"ll" (x≈17) อยู่บรรทัดเดียวกับรายการ → หลังเรียง x ตัวแรกไม่ใช่วันที่ → parseCardStatement ข้ามบรรทัด
- แก้: กรอง item ที่เป็น /^[lI|]{1,4}$/ ทิ้งทั้งใน parseCardStatement และ parseTextStatement
- ทดสอบ 3 ไฟล์ KBGC (251220, 260220, 260520): ยอดยกมา+รายการ = ยอดปิด ตรงทุกบัตร (260520 Shopee 34 แถว)
- app.js?v=205

## 2026-10-30 · ซื้อ/คืนเงินยอดเท่ากันวันเดียวกัน หาย 1 แถว (ไฟล์ 260620: 20/05 1,139 กับ -1,139)
- สาเหตุ 1: importStatementRows ส่ง tx.amount (บวกเสมอ) เข้า generateTxId → รหัสชนกัน → แถวคืนเงิน INSERT OR REPLACE ทับแถวซื้อ (บรรทัดเหมือนกันทุกช่องก็ชนเช่นกัน)
- สาเหตุ 2: เช็กซ้ำ PDF ใน backend เทียบยอดแบบไม่สนเครื่องหมาย
- แก้: รหัสใช้ยอดติดเครื่องหมาย + ต่อท้าย _dup_idx · เช็กซ้ำต้องเครื่องหมายตรง (รองรับรายการเก่าเก็บบวก+EXPENSE) · นำเข้า (match_existing) แล้วรหัสมีอยู่แล้ว → ข้าม ไม่เขียนทับหมวด/สถานะ
- เทสต์ stmt-report 36 ผ่าน · app.js?v=206

## 2026-10-30 · งาน 010 ผ่านครบ → เริ่มทำหน้าจริงแนวคิด ข "ตามบัญชี" (Phase 1)
- 010-4 (iPad รายงาน B) ผ่าน → คลังภาพ/mockup-ที่เลือก/010-4-ipad-รายงาน-B.png · design.md = ไม่มีงานค้าง
- backend/src/acc-overview.js ใหม่: GET /api/accounts/overview?month=YYYY-MM (ยกมา/ยกไป ระบบ · รับ/จ่าย · รอตรวจ · ยอดธนาคารจากหัว statement/checkpoint · บรรทัดขาด · รายวัน · 3 ล่าสุด) · เทสต์ backend/test/acc-overview.test.mjs (10)
- app.js: AccView — การ์ด "บัญชีของฉัน" ในหน้าภาพรวม (ใต้ KPI) + หน้า view-account (เลือกเดือน · ยกมา/รับ/จ่าย/ยกไป ระบบ vs ธนาคาร · โดนัท · สรุปความตรงกัน · ตารางยอดคงเหลือรายบรรทัด · มือถือเป็นรายการย่อ · Excel/PDF ใช้ StmtReport)
- ui-a.css: .av-* (รองรับธีมม่วง/มืด · iPad · มือถือ) · app.js?v=207 · ui-a.css?v=17
- ต่อไป (Phase 2+): เมนูใหม่ 6 หน้า · หน้ารายงานแบบ B · iPad เมนูไอคอน · แก้รายการจากแถวในหน้าบัญชี
- North 2026-10-30: หน้าบัญชีไม่ใส่ ฿ และไม่ใส่ + หน้าตัวเลข (v=208)

## 2026-10-30 · ทำให้หน้าตั้งค่าเร็วขึ้น (North: "ระบบช้า ตอนแก้ตั้งค่า เพิ่มเลข statement รหัส")
- GET /api/settings: 7 คำสั่งยิงพร้อมกัน (Promise.all) · ยอดบัญชีคิดครั้งเดียว GROUP BY (เดิมไล่ทีละบัญชี) · /api/accounts ใช้แบบเดียวกัน
- saveSetting: ปิดหน้าต่างทันที + toast แทน alert · ล้างแคช mdcache · loadSettings กับ fetchMasterData พร้อมกัน · loadSettings ดึง /api/users พร้อมกัน
- initTableSorting: กันผูก event หัวคอลัมน์ซ้ำทุกครั้งที่บันทึก
- index ใหม่ (สร้างอัตโนมัติใน ensureStmtCols): Transactions(stmt_id), Transactions(account_id, date)
- app.js?v=209

## 2026-10-30 · statement KBank อังกฤษ: แถวแรกเงินเข้ากลายเป็นเงินออก (ยอดสะสมต่าง 4,268 = 2×2,134)
- สาเหตุ: parseTextStatement ไม่รู้จัก "Beginning Balance" → ไม่มียอดยกมา → แถวแรกเดาเป็นออกเสมอ
- แก้: OPEN_RE + Beginning/Opening Balance · CLOSE_RE + Ending/Closing Balance · แถวแรกไม่มียอดยกมา → ดูคำ (Deposit/รับ/ฝาก = เข้า)
- /api/statements/sync: ลบบรรทัดรอตรวจจาก statement ที่เหมือนกันทุกช่องแต่เครื่องหมายกลับด้าน (ไฟล์ไม่มีแบบนั้น) · เทสต์ stmt-report 37
- app.js?v=210

## 2026-10-30 · ทำให้ทั้งแอปเร็วขึ้น (North: "เครื่องช้าระบบช้า")
- index.html: ตัด xlsx-latest (~900KB · xlsx-js-style ประกาศ XLSX ทับอยู่แล้ว) · pdf-lib/pdf.js ย้ายจาก <head> ไปท้ายหน้า · ทุกสคริปต์ defer (workerSrc ตั้งใน onload)
- รอตรวจ: วาด 30 การ์ดแรกทันที ที่เหลือทยอยทีละ 40 (ได้ครบทุกใบ) · ไม่รอ DupPairs ก่อนวาด
- ยืนยัน/ลบการ์ด: เอาการ์ดออกในเครื่อง (removePendingCardLocal) + toast — ไม่โหลด/วาดรอตรวจทั้งหมดใหม่
- ทดสอบเปิด index.html จริง (Playwright + API จำลอง 400 การ์ด): 30 ใบแรก ~0.1 วิ · ครบ 400 ~0.6 วิ · ไม่มี error · XLSX = xlsx-js-style 1.2.0
- app.js?v=211

## 2026-10-30 · ตรวจความช้าหน้าตั้งค่า (North: "บันทึกช้าและค้างนาน โดยเฉพาะตั้งค่า")
- วัดด้วย Playwright (คู่ค้า 1,500 · หมวด 300 · บัญชี 40): เปิดหน้าต่างแก้ไขตั้งค่า 9.9 วิ → 0.015 วิ · บันทึก 0.18 วิ · เปิดหน้าตั้งค่า 0.14 วิ
- สาเหตุ: openSettingModal ใส่ตัวเลือกคู่ค้าด้วย innerHTML += ในลูป (ต้องสร้างใหม่ทั้งช่องทุกรอบ = ช้ากำลังสอง) — แก้ทุกจุดแบบเดียวกันในไฟล์ 14 จุด (map().join)
- การ์ดรอตรวจ: ช่องคู่ค้าใส่เฉพาะที่เลือก · รายชื่อเต็มเติมตอนกด (fillContactSelect · ใช้ก่อนตั้งค่าด้วยโค้ดด้วย)
- backend /api/settings/save ตรวจแล้ว: คำสั่งเดียว (batch) ไม่ใช่ตัวช้า
- app.js?v=212

## 2026-10-30 · statement SCB ออมทรัพย์ (AcctSt_2601_Jan26.pdf) นำเข้าไม่ได้ "ไม่พบตารางรายการ"
- สาเหตุ: วันที่+เวลาอยู่ช่องเดียว "05/01/26 22:02" · บรรทัดยอดยกมา (BALANCE BROUGHT FORWARD) ไม่มีวันที่
- แก้ parseTextStatement: แยกช่องวันที่+เวลา · บรรทัดไม่มีวันที่ที่เป็นยอดยกมา/ยกไป (เงิน 1 ช่อง) → เก็บเป็น opening/closing
- ทดสอบไฟล์จริง: 4 รายการ ยกมา 68.14 ยกไป 272.37 ทิศทางตรงยอดคงเหลือ 4/4 · ยอดรวมตรง TOTAL Debit/Credit · บัตร KBank เดิมยังได้ 42/2 แถวตรง
- app.js?v=213

## 2026-10-30 · ใบแจ้งยอดบัตร CardX (SCB เดิม · 2025Nov-E.pdf) นำเข้าได้แล้ว
- เดิม: "ไม่พบรายการในใบแจ้งยอด" — วันที่รายการ D/M ไม่มีปี · วันสรุปยอดอยู่บรรทัดถัดจากหัวข้อ CLOSING DATE · บรรทัด "Payment received" ไม่มีเครื่องหมายลบ
- แก้ parseCardStatement: DM + เติมปีจากวันสรุปยอด (เดือนเกิน = ปีก่อน) · wantStmtDate · Payment received → ติดลบ · ชื่อประเภทบัตรจากบรรทัดเลขบัตร
- ทดสอบ: CardX 2 แถว ยกมา 57,770.73 + รายการ = ยกไป 51,000 ✅ · บัตร KBank 4 ไฟล์เดิมยังตรงทุกบัตร · Krungsri ผลเหมือนเดิม
- app.js?v=214

## 2026-10-30 · CardX นำเข้าผิด (หัว 18/11/68–18/11/68 · 1 รายการ 51,000 ไม่มีรายละเอียด · ยอดธนาคาร 4,080 = ยอดขั้นต่ำ)
- สาเหตุ: นำเข้าลองตัวอ่าน statement ธนาคาร (parseTextStatement) ก่อน → อ่านบรรทัดสรุป "18/11/25 51,000.00 4,080.00 08/12/25" เป็น 1 รายการ (ไม่มีอะไรให้เดินยอดตรวจ จึงผ่าน)
- แก้: ทั้งนำเข้าไฟล์เดียวและหลายไฟล์ ลอง parseCardStatement ก่อน ไม่ใช่บัตรค่อยใช้ parseTextStatement · ตรวจแล้ว SCB ออมทรัพย์ยังไปตัวอ่านธนาคาร · Krungsri ผลเหมือนเดิม
- /api/statements/delete + with_rows: ลบรายการรอตรวจ (PDF_IMPORT) ของ statement นั้น + หัว · ไม่แตะที่ยืนยันแล้ว · ปุ่ม "🗑️ ลบ statement นี้ (รอตรวจ N)" ในรายงานยอดสะสม · เทสต์ stmt-report 40
- app.js?v=215

## 2026-10-30 · นำเข้าหลายไฟล์ CardX "หาบัญชีจากเลขในไฟล์ไม่เจอ"
- สาเหตุ: เลข 3565 18XX XXXX 9607 อยู่ทั้ง C06 (บัตร SCB JCB) และ A23 Planet SCB (บัญชีธนาคาร) → เจอ 2 บัญชี = ให้เลือกเอง · และ /api/accounts ไม่ส่ง account_type ทำให้ทางสำรองหาบัตรจากเลข 4 ตัวท้ายใช้ไม่ได้
- แก้: findAcc เจอหลายบัญชี → ไฟล์บัตรเลือกบัญชีประเภทบัตร / statement ธนาคารเลือกที่ไม่ใช่บัตร · /api/accounts ส่ง account_type, credit_limit
- แจ้ง North: A23 น่าจะใส่เลขบัตรผิด
- app.js?v=216

## 2026-10-30 · CardX ก.ค. 69: "C4DJ_TRXN0_CC IPP Setup -29,720" เข้าเป็นใช้จ่าย + วันที่เป็นวันบันทึก
- เครื่องหมายลบไม่อยู่ในชั้นตัวหนังสือ (วาดแยก) · สังเกต: ตัวเลขติดลบขอบขวา 580.64 ตัวบวก 584.00
- parseCardStatement: เก็บขอบขวา (r) · ยอดเดินไม่ตรง → กลับเครื่องหมายแถวที่ขอบขวาสั้นกว่าคอลัมน์ 1.5–8 จุด ใช้เฉพาะเมื่อกลับแล้วยอดเดินตรง
- หัวตาราง POSTING ก่อน TRANSACTION (CardX) → ใช้วันที่คอลัมน์สอง (วันเกิดรายการ) · KBank ไม่เปลี่ยน
- IPP → หมายเหตุ "แปลงเป็นผ่อนชำระ (IPP)"
- ทดสอบ: CardX ก.ค. ✅ พ.ย. ✅ · KBank 4 ไฟล์ทุกบัตร ✅ วันที่เดิม · app.js?v=217

## 2026-10-30 · นำเข้า CardX ก.ค. แล้ว "ยังไม่ได้" — ตรวจ DB: ข้อมูลที่นำเข้า 22:19 ยังเป็นวิธีอ่านเก่า (13/07, IPP เป็นจ่าย) ทั้งที่เซิร์ฟเวอร์ v217 → เบราว์เซอร์ North รันแอปเก่า (แท็บเปิดค้าง/แคช)
- ป้ายเวอร์ชันมุมซ้ายล่าง (#app-ver) · เช็ก index.html ทุก 5 นาที → ถ้ามีใหม่ ป้ายแดง "กดเพื่อโหลด"
- frontend/_headers: Cache-Control no-cache สำหรับ / และ /index.html
- app.js?v=218

## 2026-10-30 · ใบแจ้งยอดบัตร KTC (202511_4304450800543128.pdf) — เดิมถูกตัวอ่านธนาคารอ่านบรรทัดเครดิตบูโรหน้า 2 (31/10/25 222,500) เป็นรายการ
- parseCardStatement: เลขบัตรคั่นขีด "4304-45XX-XXXX-3128" · เงิน "- 120.00" · ยกมา "ยอดเรียกเก็บรอบที่แล้ว" · ยกไป "สรุปยอดรอบนี้" (ก่อนหัวบัตร → ย้ายจาก loose) · บัตรใบเดียวที่บรรทัดเลขบัตรมีวงเงิน → ใช้เลขบัตรแรก · ประเภทบัตรจาก TYPE OF CARD
- ทดสอบ: KTC 10 รายการ ยกมา 120 ยกไป 64,965 ✅ · CardX 2 ไฟล์ ✅ · KBank ✅ · SCB ออมทรัพย์ยังไปตัวอ่านธนาคาร ✅
- app.js?v=219

## 2026-10-30 · แนวคิด ข ส่วนที่ 2: หน้ารายงานแบบ B + เมนูหลัก 6 หน้า
- RepHome (app.js) + #rep-home บนสุดของ view-reports: รายจ่าย/รายรับตามหมวด (โดนัท + ตาราง จำนวนเงิน/สัดส่วน · 6 หมวดใหญ่ + อื่น ๆ) · รายเดือน/รายปี/ทั้งหมด · ข้อมูล /api/dashboard/summary
- การ์ด 4 ใบ Excel/PDF: ยอดสะสม statement (ปุ่มเดิม sr-xlsx/sr-pdf) · ภาษีหัก ณ ที่จ่าย (runWhtReport → ตาราง) · งบทดลอง (runTrialBalanceReport → ตาราง) · รายรับ-รายจ่าย (จากโดนัท) · ชื่อไฟล์ Excel เป็นอังกฤษ (ชื่อไทยหายตอนดาวน์โหลด)
- เมนูซ้าย: ภาพรวม · รอตรวจ · ประวัติ · ลูกหนี้/เจ้าหนี้ · รายงาน · ตั้งค่า + "อื่น ๆ" (บัตร & เงินกู้ · ทรัพย์สิน · ทริป)
- ป้ายเวอร์ชันย้ายไปมุมขวาล่าง · ซ่อนหัวหน้าซ้ำในหน้ารายงาน
- ทดสอบ Playwright index.html จริง (คอม/iPad/มือถือ) + ดาวน์โหลด Excel 2 แบบ + PDF · ไม่มี error · app.js?v=220 ui-a.css?v=18
- เหลือ: กดแถวในหน้ารายละเอียดบัญชีเพื่อแก้รายการ · โหมดมืดหน้าใหม่ตรวจกับของจริง

## 2026-10-30 · แนวคิด ข: กดแถวในหน้ารายละเอียดบัญชี → แก้รายการ
- AccView.edit(txId): GET /api/transactions?id= (ใหม่) → หน้าต่างแก้ หมวด/Company/คู่ค้า/หมายเหตุ + ติ๊ก "ยืนยันรายการนี้ด้วย" (รอตรวจ) → POST เดิมทั้งแถว (คงวันที่ เวลา ข้อความธนาคาร ที่มา stmt) → /confirm · หลายรายการย่อย → พาไปหน้ารอตรวจ/ประวัติ
- backend: GET /api/transactions ?id= · รายละเอียดส่ง type ด้วย · แก้รายการ PDF_IMPORT เดิม (มีรหัสแล้ว ไม่ใช่การนำเข้า) ไม่เช็กซ้ำ (เดิมบรรทัดเหมือนกันทุกช่องแก้แล้วถูกมองว่าซ้ำ) และไม่ตกไปเช็กแบบ WEB_GRID
- เทสต์ stmt-report 43 · Playwright: กดแถว → หน้าต่างแก้ → บันทึก + ยืนยัน ✅ · app.js?v=221 ui-a.css?v=19

## 2026-10-31 · 📌 จำรูปแบบนำเข้าต่อบัญชี (North ข้อ 6) + ตรวจโหมดมืดกับข้อมูลจริง
- Accounts.import_format (JSON: kind CARD|BANK · issuer · parser · read · at) เพิ่มอัตโนมัติใน ensureStmtCols · POST /api/accounts/import-format · /api/accounts ส่ง import_format
- detectStatementIssuer(text): CardX · KTC · KBank · SCB · Krungsri · BBL · KTB · ttb · ตัวอ่านทั้ง 2 คืน issuer
- importStatementRows(meta.format, meta.walk): นำเข้าสำเร็จ + ยอดเดินไม่ผิด → จำ · ส่งจาก 3 ทาง (บัตรไฟล์เดียว · ธนาคารไฟล์เดียว · หลายไฟล์)
- นำเข้าหลายไฟล์: fmtCheck → ประเภทบัญชีไม่ตรงกับไฟล์ (บัตร↔ธนาคาร) หรือไม่ตรงกับที่จำไว้ = ⚠️ ไม่ติ๊กให้ · ผู้ออกเปลี่ยน = เตือนเหลือง · ตรง = "📌 รูปแบบเดิม …"
- ทดสอบไฟล์จริง 3 ไฟล์ (CardX ก.ค. · SCB ออม · KTC): จับบัญชีถูก · SCB ที่ตั้งบัญชีเป็นบัตร → ไม่นำเข้า · เทสต์ acc-overview 13
- โหมดมืด (ข้อมูลจริงในเบราว์เซอร์ Claude ของ North · v214): การ์ดบัญชี + หน้ารายละเอียดอ่านได้ดี · แก้ป้าย ตรงกัน/ไม่ตรงกัน ในโหมดมืด · คืนธีมม่วงแล้ว
- app.js?v=222 ui-a.css?v=20

## 2026-10-31 · 📁 เก็บไฟล์ใน Google Drive ผ่าน Apps Script (North เลือก ก.)
- gas/RecordRevenueDrive.gs (North วางเองใน script.google.com · SECRET · โฟลเดอร์ RecordRevenue/Statement/<บัญชี>/<ปี> · Slip/Expense/<ปี-เดือน> · get/trash เฉพาะไฟล์ใต้ RecordRevenue) + gas/วิธีตั้งค่า-Google-Drive.md
- backend/src/drive.js: AppSettings (drive_url/secret ต่อครอบครัว · ไม่ส่งรหัสลับกลับ) · DriveFiles + DriveLinks · /api/drive/config (GET/POST admin + ping) · /test · /upload (hash เดิม = ผูกเพิ่ม ไม่อัปซ้ำ · ≤20MB) · /files · /file (เซิร์ฟเวอร์ดึงจาก Drive) · statement-running หัว statement มี files · เทสต์ drive.test.mjs 13 (Apps Script จำลองผ่าน env.__fetch)
- app.js: DriveStore (การ์ดตั้งค่าใน Backup/Restore · อัปไฟล์ต้นฉบับหลังนำเข้า statement ทั้ง 3 ทาง · คิวทีละไฟล์) · DriveView (เปิดดู · PDF ล็อกรหัส → ลองรหัสบัญชี ปลดตอนดูเท่านั้น · ดาวน์โหลดต้นฉบับ) · ปุ่ม 📎 ในรายงานยอดสะสม + หน้ารายละเอียดบัญชี
- importStatementRows คืน stmtId · importCardStatement รับ fileObj
- ยังไม่ทำ: สลิป LINE/รูปค่าใช้จ่ายหลายรูปต่อรายการลง Drive (มีโครงแล้ว kind slip/expense + link tx)
- app.js?v=223 ui-a.css?v=21

## 2026-10-31 · 📁 สลิป LINE + หลักฐานหลายไฟล์ต่อรายการ → Google Drive
- POST /api/drive/sync-slips: LedgerDocs ที่ผูกรายการแล้ว (R2 ledger-docs/ ลบเองใน 30 วัน) → สำเนาลง Drive Slip/<ปี-เดือน> ทีละ 8 · hash "r2:<key>" · ไฟล์ R2 หมดอายุแล้ว = จดเป็น kind missing (ไม่วนหา) · ผูก DriveLinks tx
- POST /api/drive/unlink · /files ไม่นับ missing · statement-running ส่ง n_files ต่อรายการ
- หน้าเว็บ: เปิดแอป 8 วิ → DriveStore.syncSlips (เงียบ · ทีละชุดจนหมด) · ปุ่ม "🧾 สำเนาสลิป LINE ลง Drive" ในการ์ดตั้งค่า
- หน้าต่างแก้รายการ (หน้ารายละเอียดบัญชี): 📎 หลักฐาน — ไฟล์เดิม (เปิด/✕ เลิกผูก) + แนบรูป/PDF หลายไฟล์ (ถ่ายรูปได้) → Drive Expense/<ปี-เดือน> · คอลัมน์หลักฐานแสดง 📎n
- เทสต์ drive 18 · Playwright แนบ 2 ไฟล์ + เลิกผูก 1 ✅ · app.js?v=224 ui-a.css?v=22

## 2026-10-31 · Drive แยกตาม Statement (บัญชี) + ฟอนต์ Mali ทั้งแอป
- drive.js: Slip/<บัญชี>/<ปี-เดือน> · Expense/<บัญชี>/<ปี-เดือน> · Statement/<บัญชี>/<ปี> (North: "แยกตาม Statement") · ไฟล์ที่อัปไปก่อนหน้านี้อยู่ที่เดิม
- frontend/font-mali.css (ลิงก์ Google Fonts Mali 300–700) ใส่ใน index.html · guest.html · ledger/quick.html · trip-unified-prototype (index/trips/join/map-compare) · ยกเว้นไอคอน Font Awesome · Chart.js ใช้ Mali · ตัวหนังสือเล็กไม่ต่ำกว่า 12px · print.html/PDF รายงานยังใช้ Sarabun (เอกสารพิมพ์)
- ทดสอบ Playwright (ฟอนต์ Mali จริงจาก @fontsource): รายงาน · หน้าบัญชี (คอม/มือถือ) · หน้าต่างแก้รายการ อ่านชัด · app.js?v=225 font-mali.css?v=2
- 2026-10-31 รอบ 2 (North: "ตัวอักษรเล็กเกินไป จางเกินไป"): font-mali.css → html 17px · น้ำหนักพื้น 500 · หัวตาราง/ตัวหนา 700 · ตาราง ≥15px · ตัวเล็ก ≥12.5px · --text-secondary เข้มขึ้นทุกธีมสว่าง (Fuji/Hokkaido #2F3A52) · เมนูซ้ายใหญ่ขึ้น · แท็บตั้งค่าขึ้นบรรทัดใหม่แทนตัดชื่อ (คอม) · font-mali.css?v=4

## 2026-10-31 · 📱 wePAY จากรูปหน้าจอ + 🔎 รายการใกล้เคียง
- North ตอบ: 1ก เงินคืนหักออกจากยอด · 2ก รูป "รายการล่าสุด" + หาเงินเข้ากระเป๋าจาก "กล่องข้อความ" · 3ข ทุกเบอร์หมวดเดียว ใช้หมวดเดิมครั้งต่อไป · บัญชี [A17] WePay มีแล้ว
- backend/src/wepay.js: POST /api/wepay/read (รูปดิบ → Gemini Files API · WEPAY_PROMPT แยก history/inbox · topup/deposit/refund/package · ปี พ.ศ.→ค.ศ.)
- app.js WePay: เมนู นำเข้า → "wePAY (รูปหน้าจอ)" หลายรูป · merge: เติมเงินจากรายการล่าสุด · กล่องข้อความ = เงินเข้ากระเป๋า + เติมเงินที่ไม่มีในรายการล่าสุด (±10 นาที ตัดซ้ำ · จับเงินคืน ±3 นาที) · ตรวจก่อนนำเข้า · ref_code WP… กันซ้ำ · หมวดจำใน import_format.cat · เงินเข้า = Bank_Transfer
- importStatementRows: tx.category_id/detail_type กำหนดหมวดจากตัวนำเข้าได้
- backend/src/similar.js: GET /api/transactions/similar (desc/name/amount/account_id/exclude) → รายการยืนยันแล้วที่คล้าย (คำในข้อความธนาคาร/หมายเหตุ/คู่ค้า + ยอด + บัญชี) สูงสุด 8 + summary ใช้บ่อยสุด (≥2 ครั้ง)
- app.js Similar: ปุ่ม 🔎 ที่การ์ดรอตรวจ (กดใช้ → เติมหัวข้อ/หมวด/Company/คู่ค้า/รายละเอียด แถวแรก) · หน้าต่างแก้รายการ (กล่องใช้บ่อย + ประวัติ) · ตรวจสลิป (ใช้ชื่อผู้รับ/ร้านจากสลิป → เติมหมวด + รายละเอียด)
- เทสต์ similar-wepay 7 · Playwright: กดใช้บ่อย → เติมหมวด/Company/หมายเหตุ ✅ · wePAY 2 รูป → 6 รายการ ตัดซ้ำ + จับเงินคืนถูก ✅ · app.js?v=226 ui-a.css?v=23
- 2026-10-31 (North: "แสดงประวัติ = ค่าใช้จ่ายและรายรับทั้งหมด ที่จะบันทึกของทุก statement"): ทุกการ์ดรอตรวจมีแถบประวัติใต้หัวการ์ดเอง (Similar.watchCard · โหลดเมื่อเลื่อนมาเห็น · IntersectionObserver) · ค้นทุกบัญชี · /similar รับ sign (ทิศเดียวกันได้คะแนนก่อน รับ/จ่ายสลับ −2) · ทดสอบ 200 การ์ด → ยิงแค่การ์ดที่เห็น · app.js?v=227 ui-a.css?v=24
- 2026-10-31 (North: "click รายการรอตรวจ → แสดงประวัติ + รายการรอตรวจอื่นที่คาดว่าเป็นรายการเดียวกัน"): กดที่การ์ด → Similar.expand · /similar?include_pending=1 คืน pending (ข้อความตรงทุกคำค้น · ทิศเดียวกัน · ≤50) · กล่อง ⏳ เลือกได้ · "📋 ใช้รายละเอียดของการ์ดนี้กับที่เลือก" · "✅ ใช้ + ยืนยันการ์ดนี้และที่เลือก" (getCardPayload → POST → confirm → เอาการ์ดออก) · Playwright: 4 รายการเติมถูก ยืนยัน 5 ✅ · เทสต์ similar-wepay 8 · app.js?v=228 ui-a.css?v=25

## v229 — เติมหมวดจากประวัติ (2026-10-31)
- backend category-hints: ให้คำแนะนำเฉพาะเมื่อประวัติสม่ำเสมอ (หมวดเดียวทุกครั้ง หรือ ≥3 ครั้งและหมวดเดียวกัน ≥60%); Company/ผู้ติดต่อ เอาชุดที่พบบ่อยสุดในหมวดนั้น
- similar.js: summary.note แสดงเฉพาะเมื่อซ้ำ ≥ ครึ่งหนึ่งของกลุ่ม
- frontend: ปุ่ม #ph-autofill "🪄 เติมหมวดจากประวัติ" → autofillFromHistory() เติมหมวด/Company/ผู้ติดต่อให้การ์ดรอตรวจที่ยังไม่มีหมวด (ไม่ยืนยันอัตโนมัติ), applyToCard(card,v,quiet) ไม่โชว์ toast ซ้ำตอนเติมหลายการ์ด
- ทดสอบ: Playwright af.cjs (200 การ์ด เติมถูก ไม่มี error), backend tests ผ่าน
- (v229 เพิ่ม) similar.js: ไม่ใช้จำนวนเงินในการหา/ให้คะแนนประวัติแล้ว — ดูจากผู้รับ/ผู้จ่าย (ข้อความรายการ/ชื่อ/คู่ค้า) + ทิศทางรับ/จ่าย เท่านั้น ตามที่ North สั่ง
