# RecordRevenue — พิมพ์เขียวโครงการ (PROJECT.md)

> สรุปทั้งโครงการตั้งแต่เริ่มจนถึง v281 (1 พ.ย. 2569) · ใช้เป็นพิมพ์เขียวสำหรับสร้างโปรเจกต์ใหม่
> รายละเอียดรายวันอยู่ใน `HANDOFF.md` · ไฟล์นี้คือภาพรวมที่ "สร้างใหม่ได้จากศูนย์"

## สารบัญ
- ส่วน A — โครงการคืออะไร (เป้าหมาย ผู้ใช้ ขอบเขต)
- ส่วน B — แนวคิดบัญชีและการไหลของข้อมูล
- ส่วน C — Backend · ฐานข้อมูล · API · โครงสร้างพื้นฐาน
- ส่วน D — Frontend · หน้าจอ · ระบบออกแบบ · มือถือ
- ส่วน E — ประวัติ · การตัดสินใจ · บั๊กและบทเรียน · งานค้าง · กติกาการทำงาน
- ส่วน F — แผนสร้างโปรเจกต์ใหม่ทีละขั้น (พิมพ์เขียว)

---

# ส่วน A — โครงการคืออะไร

## เป้าหมาย
สมุดบัญชีรายรับ–รายจ่ายของครอบครัวและธุรกิจของ North (เจ้าของ BKP สำนักงานบัญชี) บนเว็บ ใช้ได้ทั้ง PC / iPad / iPhone
- นำเข้า statement ธนาคาร/บัตรเครดิต (PDF) ด้วย parser + AI (Gemini) → รายการ "รอตรวจ" → ผู้ใช้จัดหมวด/Company/คู่ค้า → ยืนยัน
- รับสลิป/หลักฐานผ่าน LINE bot และหน้าเว็บ · เก็บไฟล์ใน Google Drive (ผ่าน Apps Script) / R2
- ตรวจยอดคงเหลือกับธนาคาร (Balance Check) · รายงาน (ภาพรวม, ผู้รับ/ผู้จ่าย, ยอดสะสม statement, ภาษีหัก ณ ที่จ่าย, งบทดลอง)
- ทะเบียน: หนี้สิน (บ้าน/รถ/อื่น/ให้ยืม) · ทรัพย์สิน · ประกัน · บัตร · ลูกหนี้/เจ้าหนี้
- หลายผู้ใช้ในครอบครัวเดียว: ผู้ดูแล (admin) เห็น/แก้ทั้งหมด · สมาชิก (member) เห็นของตัวเอง + Company ที่ได้สิทธิ์

## ผู้ใช้และปริมาณงาน
- ผู้ใช้จริง 2 คน (North + Puii) · ~20 รายการ/วัน · งานใหญ่ครั้งคราว = นำเข้าย้อนหลัง ~1 ปีในวันเดียว
- หลาย Company: North ส่วนตัว, Me Bookkeeper, Me Prach, Me Sor Sim ฯลฯ

## ขอบเขตที่ "ไม่ทำ" แล้ว
- ระบบทริป (Hunsa / PupPup / Enjoy Life Trip) สร้างแล้ว **ยกเลิกใน v271** (API คืน 410 · ล้างข้อมูลได้จาก ตั้งค่า › Backup)
- แอปใหม่ `ledger/*.html` ที่สร้างคู่ขนาน — North สั่ง 12 ต.ค. 69 "กลับไปใช้ของเดิมทั้งหมด" → แอปหลักคือ `frontend/index.html + app.js` ตัวเดียว
- ปิดเดือน (period close) ฝั่งหน้าจอ — ยกเลิก 15 ต.ค. 69 (ฝั่ง backend ยังอยู่)
- GoogleSheetsSync — เลิกใช้

---

# ส่วน B — แนวคิดบัญชีและการไหลของข้อมูล

## หน่วยข้อมูลหลัก
| สิ่ง | ความหมาย | หมายเหตุ |
|---|---|---|
| Entity = **Company** | ข้อมูลประกอบว่ารายการเป็นของบริษัท/บุคคลไหน | UI เรียก "Company" ไม่ใช่ "Owner" |
| Account | บัญชีเงินจริง: ธนาคาร / บัตรเครดิต / เงินสด / wallet | มี Company เริ่มต้นต่อบัญชีได้ |
| Caption (AccountType) | กลุ่มหมวด มี behavior: REVENUE / EXPENSE / ASSET / LIABILITY / TRANSFER · sub_behavior INVESTMENT | ตัดสินว่าเป็นเงินเข้า/ออก/โอน |
| Category | หมวดย่อยใต้ Caption | ใช้ในบรรทัดย่อยของรายการ |
| Contact | คู่ค้า / ผู้รับ / ผู้จ่าย / เจ้าหนี้ / ลูกหนี้ | ตั้งค่า › Customer |
| Transaction | รายการ 1 บรรทัดของบัญชี (วันที่ เวลา ยอดรวม ข้อความ statement) | สถานะ PENDING_REVIEW → CONFIRMED |
| TransactionDetail | บรรทัดย่อย (แยกยอดได้หลายบรรทัด): หมวด, Company, คู่ค้า, ยอด, ค่าธรรมเนียม, WHT, note | ผลรวมต้องเท่ากับยอดรายการ |
| Debt / Asset / Insurance | ทะเบียนติดตาม ผูกกับหมวด + คู่ค้า | คำนวณจากบรรทัดย่อยที่ยืนยันแล้ว |

## การไหลของข้อมูล
```
PDF statement / สลิป LINE / รูป wePAY / พิมพ์เอง
        │  parser เฉพาะธนาคาร → ถ้าไม่ได้ ใช้ AI (Gemini) อ่าน
        ▼
Transactions (PENDING_REVIEW) ── กันซ้ำ (file_hash / ยอด+วัน+บัญชี) ── จับคู่สลิป ↔ statement (คะแนน ≥70 นำห่าง ≥20)
        │  ผู้ใช้ในหน้า "รอตรวจ": หมวด · Company · คู่ค้า · แยกบรรทัด · ⇄ โอนระหว่างบัญชี · 🪄 เติมจากประวัติ · กฎอัตโนมัติ
        ▼
Transactions (CONFIRMED) ──► รายงาน · ยอดคงเหลือเทียบธนาคาร · หนี้/ทรัพย์สิน/ประกัน · ภาพรวมครอบครัว
```

## กติกาเงินที่สำคัญ
- โอนระหว่างบัญชีไม่ใช่รายรับ/รายจ่าย: จับคู่ยอดเท่ากัน คนละบัญชี ห่าง ≤ 2 วัน
- ยอดยกมา (opening balance) เป็นบรรทัดพิเศษ `DT-OB-*` ไม่นับในรายงาน/หนี้
- หนี้: คงเหลือ = ยอดเริ่ม − เงินต้นที่จ่าย (บรรทัดหมวดเงินต้น LIABILITY + คู่ค้า = เจ้าหนี้ + CONFIRMED + วันที่ ≥ วันเริ่ม) · ดอกเบี้ยแยกหมวด EXPENSE
- เปลี่ยนชื่อในตั้งค่า → รายการเดิมเปลี่ยนตาม (อ้างด้วย ID) · เปลี่ยน ID → cascade ทุกตาราง (id-cascade.js)
- ปุ่ม "+ เพิ่ม" สร้าง draft ในเครื่องเท่านั้น จะบันทึกเมื่อมีข้อมูลจริง (กันขยะค้างในรอตรวจ)

---

# ส่วน C — Backend · ฐานข้อมูล · API · โครงสร้างพื้นฐาน

## 1. สถาปัตยกรรมและโครงสร้างพื้นฐาน

### 1.1 ภาพรวม
RecordRevenue เป็นเว็บแอป serverless บน Cloudflare ทั้งหมด ไม่มีเซิร์ฟเวอร์ของตัวเอง

```
 เบราว์เซอร์ (Pages: frontend/)  ──HTTPS + Bearer token──►  Worker "record-revenue" (backend/src/index.js)
 LINE Messaging API ──webhook──►  /api/line-webhook                 │
                                                                    ├─► D1  (binding DB  = record-revenue-db)
 Cron ทุก 5 นาที ──scheduled()──► processQueue()                     ├─► R2  (binding ICONS = record-revenue-icons)
                                                                    ├─► Google Gemini API (อ่านสลิป/statement/wePAY)
                                                                    ├─► LINE API (reply/push/bot info/ดึงรูป)
                                                                    └─► Google Apps Script (เก็บไฟล์ลง Google Drive)
```

| ส่วนประกอบ | รายละเอียด |
|---|---|
| Cloudflare Pages | โปรเจกต์ `record-revenue-web` · deploy โฟลเดอร์ `frontend/` · URL `https://record-revenue-web.pages.dev` |
| Cloudflare Worker | ชื่อ `record-revenue` · entry `backend/src/index.js` · `compatibility_date` `2026-06-16` · URL `https://record-revenue.9nimz.workers.dev` |
| D1 (SQLite) | binding `DB` · database_name `record-revenue-db` (database_id อยู่ใน wrangler.json) |
| R2 | binding `ICONS` · bucket `record-revenue-icons` · เก็บไฟล์เอกสารใต้ prefix `ledger-docs/{family_id}/{doc_id}.{ext}` (เดิมใช้เก็บไอคอน/รูปทริปด้วย) · ตั้ง lifecycle ลบไฟล์อัตโนมัติ 30 วัน (ข้อความในโค้ด retryDoc: "ระบบลบไฟล์อัตโนมัติหลัง 30 วัน") |
| Cron Trigger | `*/5 * * * *` → `scheduled()` เรียก `processQueue(env, null, 6)` อ่านเอกสารสถานะ `QUEUED` สูงสุด 6 ใบต่อรอบ ผ่าน `ctx.waitUntil` |
| แผนบริการ | Workers Paid ($5) หลัง rows_read เกินโควตาฟรี (6.15M/5M ต่อวัน เมื่อ 11 ต.ค. 69) |

### 1.2 wrangler.json (โครงที่ต้องสร้างใหม่)
```json
{
  "name": "record-revenue",
  "main": "backend/src/index.js",
  "compatibility_date": "2026-06-16",
  "d1_databases": [{ "binding": "DB", "database_name": "record-revenue-db", "database_id": "<uuid>" }],
  "r2_buckets":   [{ "binding": "ICONS", "bucket_name": "record-revenue-icons" }],
  "triggers": { "crons": ["*/5 * * * *"] }
}
```

### 1.3 Secrets / ตัวแปรสภาพแวดล้อม (ชื่อเท่านั้น — ตั้งด้วย `wrangler secret put`)
| ชื่อ | ใช้ที่ | หมายเหตุ |
|---|---|---|
| `GEMINI_API_KEY` | ledger-inbox.js, index.js, wepay.js | จำเป็น · ไม่มี = อ่านเอกสารไม่ได้ |
| `GEMINI_MODEL` | ทุกจุดที่เรียก AI | ค่าเริ่มต้น `gemini-3.1-flash-lite` |
| `GEMINI_STATEMENT_MODEL` | extractStatement | ถ้าไม่ตั้งใช้ `GEMINI_MODEL` |
| `GEMINI_FALLBACK_MODELS` | geminiGenerate | คั่นด้วย `,` · ค่าเริ่มต้น `gemini-flash-latest,gemini-2.5-flash,gemini-flash-lite-latest` |
| `LINE_CHANNEL_ACCESS_TOKEN` | reply/push/ดึงรูป/bot info | |
| `LINE_CHANNEL_SECRET` | ตรวจลายเซ็น webhook (HMAC-SHA256) | ไม่ตั้ง = ยอมรับทุกคำขอ (ควรตั้ง) |
| `LINK_SECRET` | เซ็นลิงก์แก้ไขด่วนจาก LINE | ไม่ตั้ง → ใช้ LINE_CHANNEL_SECRET → GEMINI_API_KEY → `'dev-only'` |
| `LIFF_ID` | ลิงก์แก้ไขด่วนแบบ LIFF | ไม่ตั้ง = เปิดหน้าเว็บ `/ledger/quick.html` |
| `WEB_APP_URL` | สร้างลิงก์กลับหน้าเว็บ | ค่าเริ่มต้น `https://record-revenue-web.pages.dev` |
| `env.__*` (`__fetch`, `__today`, `__extractOverride`, `__statementOverride`) | เทสเท่านั้น | ไม่ต้องตั้งใน production |

ค่าที่เก็บในฐานข้อมูลแทน secret: URL + รหัสลับของ Google Apps Script (ตาราง `AppSettings` keys `drive_url`, `drive_secret`, `drive_last_ok`) — ไม่ส่งรหัสลับกลับหน้าเว็บ

### 1.4 ขั้นตอน deploy (`deploy.sh` — `set -e` หยุดทันทีเมื่อขั้นใดล้ม)
1. `cd "$(dirname "$0")"` — ต้องรันจากโฟลเดอร์โปรเจกต์ (wrangler.json, path `frontend`, wrangler ใน node_modules)
2. `node check-frontend.mjs` — ตรวจโค้ดหน้าเว็บแบบอ่าน (เรียกฟังก์ชันที่ถูกลบ ฯลฯ)
3. `node check-frontend-runtime.mjs` — รันหน้าเว็บจริง (jsdom/playwright)
4. `bash setup-db.sh` — migration แบบ idempotent (ดูข้อ 2.4)
5. `npx wrangler deploy` — Worker
6. `npx wrangler pages deploy frontend --project-name record-revenue-web` — Pages

package.json: devDependencies `wrangler ^4.101.0`, `playwright ^1.62.0` · dependencies `jsdom ^29.1.1` · `"type": "commonjs"` (src ไม่ใช่ module ในมุม Node → เทสต้องคัดลอกไปโฟลเดอร์ชั่วคราวที่มี `{"type":"module"}`)

### 1.5 โครงสร้างโฟลเดอร์
```
/
├─ wrangler.json · package.json · deploy.sh · setup-db.sh
├─ check-frontend.mjs · check-frontend-runtime.mjs
├─ frontend/                     (Pages: index.html + app.js เป็นแอปหลัก · ledger/quick.html ฯลฯ)
└─ backend/
   ├─ db/schema.sql              (โครงเริ่มต้นรุ่นแรก — ล้าสมัยบางส่วน ดูข้อ 2.1)
   ├─ db/migrations/002…005, 2026-10-11-period-close.sql
   ├─ src/                       (Worker: index.js + โมดูลย่อย 28 ไฟล์)
   └─ test/*.test.mjs            (node:sqlite in-memory จำลอง D1)
```

### 1.6 ลำดับ routing ใน `fetch()` (index.js)
1. CORS: `Access-Control-Allow-Origin: *`, methods `GET, POST, PUT, DELETE, OPTIONS`, headers `Content-Type, Authorization, x-user-id, X-RR-Meta`, expose `X-RR-Enc, X-RR-Mime`, `Access-Control-Max-Age: 7200` · `OPTIONS` ตอบทันที
2. `resolveUserId()` (session.js) — error ฐานข้อมูลตรงนี้ → `dbErrorResponse` (JSON + CORS ไม่ใช่หน้า 1101)
3. `handleTripPurge` (ทุก path ทริปตอบ 410) → `handleLineInfo` → `handleLedgerInbox` (รวม `/api/line-webhook`, `/api/inbox/quick/*` ที่ไม่ต้องล็อกอิน)
4. `/api/logout`, `/api/login` (สาธารณะ)
5. **ประตูเดียว**: ไม่มี `authUserId` → 401 ทุก route ที่เหลือ
6. โมดูล: stmt-report → revenue-chart → acc-overview → family → loans → transfers → detail-notes → account-defaults → rules → insurance → similar → wepay → drive
7. route ที่เขียนใน index.js เอง → ไม่ตรง = 404 JSON
8. `catch` ทั้งหมด → `dbErrorResponse`: `PERIOD_CLOSED` → 409 · ข้อความโควตา/overloaded/timeout → 503 `DB_UNAVAILABLE` · อื่น ๆ → 500 `SERVER_ERROR` (ไม่ส่ง stack)

---

## 2. ฐานข้อมูล (D1) — ตารางทั้งหมด

### 2.1 หมายเหตุสำคัญเรื่อง schema
- `schema.sql` เป็นรุ่นแรก **ไม่ตรงกับฐานจริงหลายจุด**: ฐานจริงใช้ `Captions.type_id` เป็น PK (schema.sql เขียน `caption_id`) และมี `Captions.sub_behavior`; `Accounts` มี `pdf_password, account_type, credit_limit, statement_day, due_day`; `TransactionDetails` มีคอลัมน์เก่า `head_owner, group_detail`; `Contacts` มี `entity_id, members`; `Users` มี `ledger_mode` (ยุคทริป) — คอลัมน์เหล่านี้ไม่มีไฟล์ migration ในชุดนี้ ถ้าสร้างโปรเจกต์ใหม่ต้องรวมไว้ใน schema ตั้งต้น
- ตาราง `Sessions`, `PlannedExpenses`, `CategoryBudgets` ใช้งานจริงแต่ไม่มี DDL ในโค้ด (ต้องสร้างเอง — คอลัมน์อนุมานจากคำสั่ง INSERT/SELECT ด้านล่าง)
- D1 ไม่มี `ADD COLUMN IF NOT EXISTS` → โมดูลตรวจ `PRAGMA table_info` ก่อน ALTER แล้วจำผลด้วยตัวแปร `ready` ระดับโมดูล (ต่อ isolate)
- CHECK constraint ของ `Transactions.status/source` และ `Captions.behavior` แก้บน D1 ไม่ได้ → ค่าใหม่ถูกเก็บแบบเลี่ยง (เช่น INVESTMENT เก็บเป็น `behavior='ASSET' + sub_behavior='INVESTMENT'`; `STATEMENT_PDF`/`RESTORE_EXCEL` map เป็น `PDF_IMPORT`)

### 2.2 ตารางหลัก (บัญชี)

| ตาราง | PK | คอลัมน์สำคัญ | หน้าที่ |
|---|---|---|---|
| **Families** | family_id | name, created_at | กลุ่มครอบครัว = ขอบเขตข้อมูลหลัก (master data แชร์ในครอบครัว) |
| **Users** | user_id | family_id→Families, name, email UNIQUE, line_user_id UNIQUE, role (`admin`/`member`), password (`pbkdf2$sha256$…` หรือข้อความเก่า), ledger_mode, created_at | ผู้ใช้ · ล็อกอินด้วย email/user_id/name |
| **Entities** | entity_id | family_id, name, is_company (0 ส่วนตัว / 1 บริษัท) | "Company" (UI เดิมเรียก Owner/Head Owner) เจ้าของบัญชีและบรรทัดรายการ |
| **UserPermissions** | (user_id, entity_id) | — | สิทธิ์ คน↔Company (many-to-many) · เป็นตัวกรองหลักของทุก query |
| **Accounts** | account_id | entity_id→Entities, name (มักขึ้นต้น `[A02] …`), bank_name, account_number, balance (ไม่ใช้ — คำนวณสด), pdf_password, account_type (`BANK`/`CASH`/`CREDIT`/`TRIP_HOLDING`), credit_limit, statement_day, due_day, **tx_entity_id** (runtime), **import_format** JSON (runtime) | บัญชีเงิน/บัตร/เงินสด ("Statement") |
| **Captions** | type_id | family_id (NULL = ระบบ), name, behavior CHECK(`REVENUE`,`EXPENSE`,`ASSET`,`LIABILITY`,`TRANSFER`), sub_behavior (`INVESTMENT`), default_entity_id, default_contact_id, default_type | หมวดหลัก/ประเภทบัญชี (API เรียก account-types) |
| **Categories** | category_id | family_id, name, caption_id→Captions.type_id, default_entity_id, default_contact_id, default_type (`INCOME`/`EXPENSE`/`TRANSFER`), icon_asset | หมวดย่อย · หมวดระบบ: `Cat_Uncategorized`, `Bank_Transfer`, `CAT-OB-{fid}` |
| **Contacts** | contact_id | family_id, name, contact_type CHECK(`CUSTOMER`,`VENDOR`,`OTHER`), entity_id, members (JSON user_ids · NULL = ทุกคน) | คู่ค้า/ลูกหนี้/เจ้าหนี้รายตัว |
| **Projects** | project_id | family_id, name, status, members JSON, … (ฟิลด์ทริปเดิม) | โปรเจกต์/ทริป (ทริปถูกล้างใน v271; `TRP-%` = ทริป) |
| **Transactions** | transaction_id | account_id→Accounts, ref_code, date (YYYY-MM-DD), time, total_amount, statement_desc, status CHECK(`PENDING_REVIEW`,`CONFIRMED`), source CHECK(`LINE_SLIP`,`LINE_TEXT`,`PDF_IMPORT`,`WEB_GRID`), slip_image_url, created_by_user_id, created_at, **stmt_id, stmt_seq, stmt_balance** (runtime) | หัวรายการ = 1 บรรทัดเคลื่อนไหวของบัญชี |
| **TransactionDetails** | detail_id | transaction_id→Transactions (CASCADE), amount, fee, wht, category_id, entity_id, contact_id, project_id, note, type (`DEBIT_AR`,`CREDIT_AR`,`INCOME`,`EXPENSE`,`TRANSFER`,`OTHER`) | บรรทัดย่อย (split) |
| **Settlements** | settlement_id | parent_detail_id (ตั้งหนี้), child_detail_id (ชำระ), settled_amount (FK CASCADE ทั้งสอง) | ตัดชำระลูกหนี้/เจ้าหนี้บางส่วน/ทั้งหมด |
| **Debts** | debt_id | family_id, name, type (`PAYABLE`/`RECEIVABLE`), contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date, icon_type, status (`active`/`closed`/`deleted`), entity_id, members + (runtime, loans.js) kind (`HOME`/`CAR`/`OTHER`/`LEND`), lender, original_amount, interest_rate, rate_type (`REDUCING`/`FLAT`), term_months, due_day, asset_ref, note, closed_date, created_at | ทะเบียนหนี้/เงินกู้/ผ่อน |
| **Sessions** | token_hash | user_id, expires_at | session token (เก็บ SHA-256) |
| **CategoryBudgets** | budget_id | family_id, category_id, entity_id, period_type, period, amount, note, updated_at | งบประมาณต่อหมวด |
| **PlannedExpenses** | plan_id (UUID) | family_id, entity_id, category_id, contact_id, title, icon, amount, due_date, recurrence (`NONE`/…), recurrence_end, note, status (`OPEN`/`DONE`), done_date, linked_transaction_id, created_by_user_id, updated_at | แผนรายจ่ายล่วงหน้า (กด done → สร้างงวดถัดไปถ้ามี recurrence) |

### 2.3 ตารางของสมุดจด / โมดูลใหม่
| ตาราง | PK | คอลัมน์สำคัญ | สร้างโดย | หน้าที่ |
|---|---|---|---|---|
| **LedgerDocs** | doc_id (`DOC-…`) | family_id, uploaded_by, source (`WEB`/`LINE`), file_key (R2), file_hash (SHA-256 hex), mime, file_name, doc_type, status, extracted JSON, suggestion JSON, transaction_id, error, created_at, updated_at | setup-db.sh | กล่องรับเอกสาร · status: `QUEUED` `READING` `NEEDS_ACCOUNT` `NEEDS_CHOICE` `SUGGESTED` `STORED` `ERROR` `DONE` `DISMISSED` |
| **LedgerDocLinks** | (doc_id, transaction_id) | role (`MATCHED`/`CREATED`/`ATTACHED`…) | setup-db.sh | เอกสาร↔รายการ (หลายต่อหลาย) |
| **LedgerRules** | rule_id · UNIQUE(family_id, kind, rkey) | kind, rkey, value (JSON/ข้อความ), hits | setup-db.sh | หน่วยความจำ: kind `ACCOUNT` (ธนาคาร+เลขท้าย→บัญชี), `PARTY` (คู่ค้า→template บรรทัด), `DEFAULT_CASH`, `ASSET_REG` (หมวดที่นับเป็นทรัพย์สิน), `REV_OWNER`/`REV_ACCOUNT`/`REV_CONTACT`/`REV_SETTING` (ผังรายได้) |
| **LedgerStatements** | stmt_id | family_id, account_id, period_from, period_to, opening_balance, closing_balance, line_count, **lines** (JSON ทุกบรรทัด + สถานะ), file_name, created_by, extra (runtime) | setup-db.sh | statement ฝั่งกล่องรับเอกสาร (เก็บบรรทัดเป็น JSON แถวเดียว เพราะเขียนทีละบรรทัดไม่ไหวบน D1) · สถานะบรรทัด `NEW` `MATCHED` `CREATED` `IGNORED` `DUPLICATE` |
| **StatementImports** | stmt_id | account_id, period_from, period_to, opening, closing, line_count, file_name, source_kind, created_by, created_at | runtime (stmt-report.js) | หัว statement ฝั่งหน้านำเข้าของแอปหลัก · รายการชี้กลับด้วย `Transactions.stmt_id` |
| **AccountCheckpoints** | (account_id, as_of) | balance (เครื่องหมายแบบระบบ: บัตรค้าง = ลบ), source (`STATEMENT`/`MANUAL`), created_by, created_at | setup-db.sh + runtime | ยอดตามธนาคาร ณ วันที่ ใช้เทียบยอดระบบ |
| **LedgerPeriods** | (family_id, period YYYY-MM) | status (`CLOSED`/`OPEN`), closed_by, closed_at, reopened_by, reopened_at, snapshot JSON | migration 2026-10-11 | ปิดเดือน |
| **LedgerPeriodLog** | log_id (`PL-…`) | family_id, period, action (`CLOSE`/`REOPEN`), user_id, note, created_at | migration | ประวัติปิด/เปิดเดือน |
| **OpeningSets** | set_id | family_id, name, entity_id, date, anchor_account_id, lines JSON, created_by/at, updated_by/at | runtime (opening.js) + setup | ชุดยอดยกมา |
| **AssetGroups** | group_id | family_id, name, sort | runtime (assets.js) | กลุ่มย่อยทรัพย์สิน |
| **AssetItems** | asset_id · detail_id UNIQUE | family_id, source (`TX`/`OPENING`), name, purchase_date, amount, category_id, group_id, entity_id, account_id, note, status (`ACTIVE`/…), writeoff_date, expense_category_id, writeoff_tx, writeoff_amount, writeoff_note, location, location_note, warranty_until | runtime | ทะเบียนทรัพย์สิน (ไม่มีค่าเสื่อม) |
| **AppSettings** | (family_id, skey) | svalue, updated_at | runtime (drive.js, assets.js) | ค่าตั้งต่อครอบครัว: `drive_url`, `drive_secret`, `drive_last_ok`, `asset_locations` |
| **DriveFiles** | file_id (`DF-…`) | family_id, drive_id, name, mime, size, kind (`statement`/`slip`/`expense`/`missing`), account_id, file_hash (`r2:<key>` สำหรับสลิปจาก R2), url | runtime | ไฟล์ที่เก็บใน Google Drive |
| **DriveLinks** | (file_id, ref_type, ref_id) | ref_type `stmt`/`tx`/`asset`/`debt`/`ins` | runtime | ผูกไฟล์ Drive กับข้อมูล |
| **AutoRules** | rule_id (`RULE-…`) | family_id, dir (`OUT`/`IN`), payee, account_id (NULL=ทุกบัญชี), category_id, entity_id, contact_id, type, active, hits, sample, created_by, created_at | runtime (rules.js) | กฎยืนยันอัตโนมัติ |
| **InsurancePolicies** | policy_id (`INS-…`) | family_id, kind (`PERSON`/`ASSET`), name, insurer, policy_no, insured, asset_id, sum_insured, premium, pay_freq (`YEAR`/`HALF`/`QUARTER`/`MONTH`/`SINGLE`), first_due, pay_until, cover_start, cover_end, cover_note, tax_type (`LIFE`/`HEALTH`/`HEALTH_PARENT`/`PENSION`/`NONE`), category_id, contact_id, entity_id, note, status | runtime (insurance.js) | กรมธรรม์ |
| **RevenueChart** | row_id | family_id, owner, code (ลูกค้า), name, tax_month, invoice_no/date, receipt_no/date, type (`Account`/`Audit`/`Service`), service, fee, wht, other, total, paid, bank_fee, account_label, note, matched_tx, imported_at | runtime (revenue-chart.js) | ผังเก็บรายได้ BKP สำหรับจับเงินเข้า |
| **Trip\*** (TripStops, TripExpenses, TripMembers, TripWallets, …21 ตาราง) | — | — | schema.sql + setup-db.sh | **ระบบทริปยกเลิกแล้ว (v271)** ลบด้วย `/api/admin/trip-purge` · โครงใหม่ไม่ต้องสร้าง |

### 2.4 migration และการสร้างตอน runtime
- `setup-db.sh`: ยิงทีละคำสั่งด้วย `wrangler d1 execute record-revenue-db --remote --command` แล้วมองข้อความ `duplicate column` / `already exists` เป็นสำเร็จ (ไม่ใช้ `--file` เพราะ `--file` หยุดที่ error แรก) · ยกเว้นไฟล์ trigger ปิดเดือนที่ต้องใช้ `--file` (มี `;` ใน trigger) · ท้ายสคริปต์ตรวจรายชื่อตาราง/คอลัมน์ · จบด้วย `PRAGMA optimize`
- migrations 002–005: เพิ่ม `Contacts.members`, `Debts.entity_id`, `Debts.members`, `TransactionDetails.type`
- runtime (ensure-on-first-use): `Accounts.tx_entity_id` (+ seed ค่าเริ่มต้นตามชื่อบัญชี), `Accounts.import_format`, `Transactions.stmt_id/stmt_seq/stmt_balance`, `StatementImports`, `AccountCheckpoints`, `AutoRules`, `InsurancePolicies`, `RevenueChart`, `OpeningSets`, `AssetGroups/AssetItems` (+ location, location_note, warranty_until), `AppSettings`, `DriveFiles/DriveLinks`, คอลัมน์เงินกู้ใน `Debts`, `LedgerStatements.extra`

### 2.5 Trigger ล็อกเดือนที่ปิด (2026-10-11-period-close.sql)
`BEFORE INSERT/UPDATE/DELETE` บน `Transactions`, `TransactionDetails` และ `INSERT/DELETE` บน `Settlements` (ฝั่ง child) — ถ้า `substr(date,1,7)` ของรายการ (ทั้งค่าเก่าและใหม่) อยู่ใน `LedgerPeriods` ของครอบครัวเดียวกัน (เดินผ่าน Accounts→Entities.family_id) และ `status='CLOSED'` → `RAISE(ABORT, 'PERIOD_CLOSED: …')` · โค้ดแปลงข้อความนี้เป็น HTTP 409 `code: PERIOD_CLOSED` · `INSERT OR REPLACE` ที่ย้ายวันที่ออกจากเดือนปิด trigger มองไม่เห็น → ตรวจด้วย `isMonthClosed()` ในโค้ดเพิ่ม

### 2.6 โมเดลบัญชีหลัก
- **กติกาเครื่องหมาย**: เงินออกเป็นลบ เงินเข้าเป็นบวก · บรรทัดย่อยเครื่องหมายเดียวกับหัว · fee/wht ถูกหักออกจากยอดย่อย: `total_amount = Σ (amount − sign(amount)·(|fee|+|wht|))` (ตรวจใน POST /api/transactions ยอมคลาดเคลื่อน < 0.01 · ยกเว้น source `WEB_GRID` ที่ยังแก้ไม่เสร็จ) · บัตรเครดิต: ใช้จ่าย = ลบ, จ่ายบัตร/คืนเงิน = บวก → ยอดติดลบ = หนี้บัตร
- **ข้อมูลรุ่นเก่า**: รายการรอตรวจที่นำเข้ารุ่นเก่าเก็บยอดจ่ายเป็นบวก → ทุกการคิดยอดใช้ `SIGNED_AMOUNT_SQL` (stmt-report.js): ถ้า `PENDING_REVIEW` และยอด > 0 และมีบรรทัด `type='EXPENSE'` → กลับเครื่องหมาย
- **ยอดบัญชี** = Σ total_amount ของ `CONFIRMED` (บางรายงานรวมรอตรวจ) — ไม่ใช้คอลัมน์ `Accounts.balance`
- **behavior ของ Caption** กำหนดความหมาย: `REVENUE`/`EXPENSE` = รับ/จ่าย · `ASSET`/`LIABILITY` = ลูกหนี้/เจ้าหนี้ (outstanding, parties) ยกเว้น `sub_behavior='INVESTMENT'` (เงินลงทุนไม่ใช่ลูกหนี้) · `TRANSFER` = ไม่นับรับ-จ่าย (โอน, ยอดยกมา, บัญชีพัก)
- **type ของ Detail**: `INCOME`/`CREDIT_AR` = รับ · `EXPENSE`/`DEBIT_AR` = จ่าย · `TRANSFER` = ข้าม · ถ้า type ไม่ชัด ใช้ behavior ของ caption
- **หมวดทรัพย์สิน** (LedgerRules `ASSET_REG`) ถูกตัดออกจาก "รายจ่าย" และ "ลูกหนี้" ในรายงาน
- **Company สองระดับ**: `Accounts.entity_id` = เจ้าของบัญชี (ใช้ตัดสิทธิ์) · `TransactionDetails.entity_id` = Company ของบรรทัด (ใช้ในรายงานรับ-จ่ายต่อ Company) · `Accounts.tx_entity_id` = ค่าเริ่มต้นให้บรรทัดจากบัญชีนั้น
- **รหัสที่มีความหมาย**: `TX-<ms>` (รายการทั่วไป), `DT-<rand>`, `TX-OB-{set}-A{n}` / `TX-OB-{set}-J` / `DT-OB-*` (ยอดยกมา), `TX-TRF-*`/`DT-TRF-*` (โอน), `DT-RULE-*` (กฎ), `TX-WO-{asset_id}` (ตัดจำหน่าย), `STL-*`, `DBT<ms>`, `DOC-<ms>-<uuid8>`, `CAP-OB-{fid}`/`CAT-OB-{fid}` (บัญชีพักยอดยกมา)

### 2.7 แผนภาพความสัมพันธ์ (ER แบบข้อความ)
```
Families 1─┬─* Users ─*──────────────┐
           │                        UserPermissions (user_id, entity_id)
           ├─* Entities (Company) ──*┘
           │      └─1─* Accounts ─1─* Transactions ─1─* TransactionDetails ─*─1 Categories ─*─1 Captions
           │               │   │            │  │            │  │  │                   (behavior/sub_behavior)
           │               │   │            │  │            │  │  └─ contact_id → Contacts
           │               │   │            │  │            │  └──── entity_id  → Entities (Company ของบรรทัด)
           │               │   │            │  │            └─ Settlements (parent_detail ↔ child_detail)
           │               │   │            │  └─ stmt_id → StatementImports
           │               │   │            └─ LedgerDocLinks *─1 LedgerDocs (R2 file_key)
           │               │   ├─* AccountCheckpoints   ├─* LedgerStatements (lines JSON → transaction_id)
           │               │   └─ DriveLinks/DriveFiles  
           ├─* Contacts · Categories · Captions · Projects
           ├─* Debts (contact, principal/interest category, entity, asset_ref)
           ├─* InsurancePolicies (category, contact, entity, asset_id → AssetItems)
           ├─* AssetItems (detail_id → TransactionDetails, group_id → AssetGroups, writeoff_tx → Transactions)
           ├─* OpeningSets (lines JSON → account/category/contact/debt)
           ├─* LedgerPeriods / LedgerPeriodLog · LedgerRules · AutoRules · AppSettings
           ├─* RevenueChart (matched_tx → Transactions) · CategoryBudgets · PlannedExpenses
Sessions (token_hash) *─1 Users
```

---

## 3. API ทั้งหมด

สัญลักษณ์สิทธิ์: **สาธารณะ** = ไม่ต้องล็อกอิน · **ล็อกอิน** = Bearer token · **บัญชี** = ต้องมีสิทธิ์บัญชีผ่าน UserPermissions · **ครอบครัว** = กรองด้วย family_id · **Admin** = `role='admin'`

### 3.1 ระบบ / ตัวตน (index.js, session.js, line-info.js, trip-purge.js)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| OPTIONS | * | CORS preflight | สาธารณะ |
| POST | /api/login | `{username,password}` → หา Users ด้วย email/user_id/name (ไม่สนตัวพิมพ์) → ตรวจ PBKDF2 → อัปเกรด hash ถ้าจำเป็น → ออก token 30 วัน · คืน user + allowed_entities | สาธารณะ |
| POST | /api/logout | ลบ session ฝั่งเซิร์ฟเวอร์ | token |
| GET | /api/line/bot-info | ถาม LINE `/v2/bot/info` → basicId/premiumId/addUrl (แคช 6 ชม.) | ล็อกอิน |
| GET/POST | /api/admin/trip-purge | GET นับข้อมูลทริป · POST `{confirm:'ลบทริป'}` คืน backup แล้วลบ | Admin |
| * | /api/(trips\|travel\|trip-*\|unified-trip\|wallets)/… | 410 "ระบบทริปปิดใช้งานแล้ว" | — |
| GET | /api/export | 410 (ปิดแล้ว) | ล็อกอิน |

### 3.2 รายการ (index.js)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | /api/transactions | รายการ+บรรทัดย่อย · query `status, startDate, endDate, month=YYYY-MM, search, id, limit, count=1` · ไม่ระบุช่วง = 500 ล่าสุด (`limit=0` = ทั้งหมด) | บัญชี |
| POST | /api/transactions | สร้าง/แก้ (INSERT OR REPLACE + ลบ/ใส่ details ใน batch) · ตรวจยอดรวม · กันซ้ำ · ตรวจเดือนปิด · รักษา Settlements · `check_only`, `match_existing`, `dup_idx`, `stmt_id/stmt_seq/stmt_balance` | บัญชี |
| POST | /api/transactions/confirm | → CONFIRMED | บัญชี |
| POST | /api/transactions/unconfirm | → PENDING_REVIEW (ห้ามเดือนปิด) | บัญชี |
| POST | /api/transactions/delete | ลบหัว+บรรทัด แล้วล้างหัว statement ที่ว่าง | บัญชี |
| POST | /api/transactions/bulk-delete | ลบได้เฉพาะ PENDING_REVIEW ≤ 3000 ต่อครั้ง (ชุดละ 90) | บัญชี |
| GET | /api/transactions/category-hints | คำใบ้หมวดจาก 3000 รายการยืนยันล่าสุด (บรรทัดเดียว) ต่อคีย์ข้อความธนาคาร/ผู้รับ | บัญชี |
| POST | /api/bulk-import | นำเข้าหลายรายการ (สถานะ CONFIRMED/PENDING) เฉพาะบัญชีของตน | บัญชี |
| POST | /api/slip-ocr | `{imageBase64}` → Gemini อ่านสลิป (เส้นทางเก่า) | ล็อกอิน |
| POST | /api/statement-ocr | `{pdfBase64 \| imagesBase64[]}` → Gemini อ่าน statement (อ่านซ้ำ 1 ครั้งถ้า JSON เสีย) | ล็อกอิน |
| GET | /api/accounts/balance-at | `account_id,date` → ยอดระบบก่อนวันนั้น (รวมรอตรวจ) + จำนวน + first_date | บัญชี |
| POST | /api/accounts/checkpoint | บันทึกยอดตามธนาคาร `{account_id,as_of,balance,source}` | บัญชี |
| GET | /api/accounts/checkpoints | จุดล่าสุดต่อบัญชี + ยอดระบบ ณ วันนั้น + diff | บัญชี |
| GET | /api/outstanding_ar | บรรทัด ASSET/LIABILITY (ไม่รวม INVESTMENT) ที่ยังตัดชำระไม่ครบ | บัญชี |
| POST | /api/settlements | ตัดชำระ `{parent_detail_id, child_detail_id, settled_amount}` (ทั้งคู่ต้องเป็นของตน) | บัญชี |
| GET | /api/stats/date-range | วันแรก/สุดท้าย/จำนวนรายการของครอบครัว (ต่อบัญชีด้วยดัชนี) | ครอบครัว |

### 3.3 Master data / ตั้งค่า / ผู้ใช้ (index.js)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | /api/account-types | Captions ของครอบครัว + ระบบ | ครอบครัว |
| GET | /api/categories | Categories + caption_name/behavior | ครอบครัว |
| GET | /api/contacts | Contacts กรองด้วย members | ครอบครัว |
| GET | /api/projects | Projects กรองด้วย members | ครอบครัว |
| GET | /api/entities | Company ที่ผู้ใช้มีสิทธิ์ | บัญชี |
| GET | /api/accounts | บัญชีที่มีสิทธิ์ + ยอด CONFIRMED (subquery GROUP BY ครั้งเดียว) ยกเว้น TRIP_HOLDING | บัญชี |
| GET | /api/settings | รวมทุก list ในครั้งเดียว (admin เห็นทุก contact/project · เรียก ensureAdminScope) | ครอบครัว |
| POST | /api/settings/save | `{type: account\|entity\|caption\|category\|contact\|project, old_id, new_id, …}` สร้าง/แก้ · เปลี่ยนรหัส = id-cascade · ตรวจว่าเป็นของครอบครัว | ครอบครัว |
| POST | /api/settings/delete | ลบ master data (ตรวจว่ายังมีของใช้อยู่ เช่น หมวดใต้ caption) | Admin |
| GET/POST | /api/users | GET สมาชิกครอบครัว · POST สร้าง/แก้ (hash รหัส, เว้นว่าง = รหัสเดิม, allowed_entities) | GET ครอบครัว · POST Admin |
| POST | /api/users/delete | ลบสมาชิก (`preview` ดูผลก่อน) · ห้ามลบตัวเอง/แอดมินคนสุดท้าย | Admin |
| POST | /api/reset | ล้างข้อมูล `scope: transactions\|all` (เปิดเดือนปิดอัตโนมัติก่อน, ลบแบบ child-first, scope family) | Admin |
| GET | /api/backup/full | สำรองทั้งครอบครัว (กรองวันที่ได้) | Admin |
| POST | /api/restore/full | กู้คืน `mode: replace\|merge` · ตรวจไฟล์ครบก่อนลบ · ห้ามถ้ามีเดือนปิด | Admin |
| GET | /api/export/flat | ส่งออก 1 แถวต่อ TransactionDetail พร้อม join ทั้งหมด | ครอบครัว |
| GET/POST/DELETE | /api/budgets, /api/budgets/{id} | งบประมาณต่อหมวด (upsert ตาม category+entity+period) | ครอบครัว |
| GET/POST/PUT/DELETE | /api/planned-expenses, /{id}, /{id}/done | แผนรายจ่าย · done = ผูกรายการ + สร้างงวดถัดไป | ครอบครัว |

### 3.4 รายงาน (index.js, acc-overview.js, family.js, stmt-report.js)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | /api/reports/outstanding | ลูกหนี้/เจ้าหนี้คงค้างต่อคู่ค้า (`contactId`) | บัญชี |
| GET | /api/reports/trial-balance | งบทดลองต่อหมวด (`entityId`) Dr = ยอดลบ, Cr = ยอดบวก | ต้องมีสิทธิ์ Company นั้น |
| GET | /api/reports/wht | สรุปหัก ณ ที่จ่ายรายเดือน (ช่วงวันที่แทน strftime) | บัญชี |
| GET | /api/wht/detail | รายละเอียด WHT `month, direction=received\|withheld` | บัญชี |
| GET | /api/dashboard/summary | แดชบอร์ด `period=month\|year\|all, month=YYYY-MM\|latest, member` → รับ/จ่าย/ลงทุน/งบ/AR/AP/WHT/แผน | ครอบครัว + สิทธิ์ |
| GET | /api/accounts/overview | ต่อบัญชีในเดือน: ยอดยกมา/ยกไป, รับ/จ่าย, รอตรวจ, ยอดธนาคาร, รายวัน, ล่าสุด 3 รายการ | บัญชี |
| GET | /api/family/overview | ภาพรวมครอบครัว ส่วนตัว vs ธุรกิจ ต่อสมาชิก + กิจกรรมล่าสุด | บัญชี (admin เห็นทั้งหมด) |
| GET | /api/reports/statement-running | ยอดก่อนช่วง + ทุกรายการในช่วง + หัว statement + checkpoints (หน้าเว็บคิดยอดสะสม) | บัญชี |

### 3.5 Statement / ซ้ำ / โอน / กฎ (stmt-report.js, transfers.js, rules.js, detail-notes.js, account-defaults.js, similar.js, wepay.js)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | /api/accounts/import-format | จำรูปแบบนำเข้าต่อบัญชี (kind BANK/CARD, issuer, parser, read, cat) | บัญชี |
| POST | /api/statements/header | สร้าง/หา stmt_id (statement เดิม = บัญชีเดียวกัน ช่วงทับ ยอดยกไปเท่า) · `check_only` | บัญชี |
| POST | /api/statements/sync | "ไฟล์คือความจริง": ลบรายการรอตรวจ PDF_IMPORT ที่เกินจำนวนในไฟล์ หรือเครื่องหมายกลับด้าน | บัญชี |
| POST | /api/statements/delete | ลบหัว statement (`with_rows` = ลบรายการรอตรวจของชุดนั้นด้วย) | บัญชี |
| GET | /api/transactions/duplicates | คู่ "รอตรวจจาก statement" ↔ "ยืนยันแล้วไม่มีเวลา/ไม่มี stmt" ยอดเท่า ทิศเดียวกัน ห่าง ≤3 วัน | บัญชี |
| POST | /api/transactions/merge | รวมคู่ซ้ำ: เก็บรายการเดิม + เติมข้อมูลธนาคาร + ลบบรรทัดรอตรวจ | บัญชี |
| GET | /api/transfers/suggest | คู่ที่น่าเป็นการโอนระหว่างบัญชีเรา (รอตรวจ) | บัญชี |
| POST | /api/transfers/apply | `{pairs:[{out_id,in_id}]}` ≤300 คู่ หรือ `{transaction_id, counter_account_id?, create_counter?}` | บัญชี |
| GET | /api/rules | กฎ + คำแนะนำ + จำนวนรอตรวจที่ตรงกฎ | ครอบครัว |
| POST | /api/rules/save · /delete · /toggle · /apply | จัดการกฎ · apply = ใส่หมวด+ยืนยันรายการ PDF_IMPORT ที่ตรง | ครอบครัว |
| POST | /api/transactions/fill-detail-notes | เติม Detail ว่างจากข้อความ statement (รอตรวจ บรรทัดเดียว) | บัญชี |
| GET | /api/accounts/tx-defaults | Company เริ่มต้นต่อบัญชี | บัญชี |
| POST | /api/accounts/tx-default | ตั้ง `tx_entity_id` | บัญชี |
| POST | /api/transactions/apply-company-defaults | ใส่ Company เริ่มต้นให้รายการรอตรวจ PDF_IMPORT | บัญชี |
| GET | /api/transactions/similar | รายการใกล้เคียง + summary หมวด/Company/คู่ค้า + `include_pending=1` + เตือนจ่ายซ้ำ (`amount,date`) | บัญชี |
| POST | /api/wepay/read | body = รูปดิบ → AI อ่านหน้าจอแอป wePAY (เติมเงิน/เงินเข้า/เงินคืน) | ล็อกอิน |
| POST | /api/wepay/fix-notes | เติมเบอร์ใน Detail รายการ wePAY รอตรวจรุ่นเก่า | บัญชี |

### 3.6 ผังรายได้ / หนี้ / ประกัน / Drive
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | /api/revenue-chart/import | นำเข้าผังรายได้ทีละ ≤300 แถว (`reset` ชุดแรกลบแถวที่ยังไม่ถูกใช้) | ครอบครัว |
| GET | /api/revenue-chart/summary | สรุปผัง | ครอบครัว |
| POST | /api/revenue-chart/map | ผูก OWNER→Company, บัญชีเงินเข้า→Account, หมวดเงินรับแทน (เก็บ LedgerRules REV_*) | ครอบครัว |
| POST | /api/revenue-chart/suggest | เสนอแถวให้เงินเข้ารอตรวจ ≤80 รายการ | บัญชี |
| POST | /api/revenue-chart/apply | แตกบรรทัดตามแถวที่เลือก (ยังรอตรวจ) + จอง matched_tx + สร้างคู่ค้าถ้าไม่มี | บัญชี |
| GET | /api/loans/overview | สัญญาหนี้ + งวดถัดไป + ดอกเบี้ยปีนี้ + ตารางจ่าย 60 วัน + ลดหย่อนดอกเบี้ยบ้าน | ดูข้อ 5 |
| POST | /api/loans/save · /close | บันทึก/ปิด/เปิดหนี้ | ดูข้อ 5 |
| GET | /api/loans/detail?id= | การจ่ายรายบรรทัด + คงเหลือหลังจ่าย | ดูข้อ 5 |
| GET | /api/insurance/overview | กรมธรรม์ + สถานะเบี้ย + ปฏิทิน 12 เดือน + ลดหย่อนภาษี | ดูข้อ 5 |
| POST | /api/insurance/save · /close · /delete | จัดการกรมธรรม์ (delete = status `deleted`) | ดูข้อ 5 |
| GET/POST | /api/drive/config | GET สถานะ (URL ถูกปิดบางส่วน) · POST ตั้ง URL+secret (ping ก่อนบันทึก) | GET ครอบครัว · POST Admin |
| POST | /api/drive/test | ping Apps Script | ครอบครัว |
| POST | /api/drive/upload | body base64 (text/plain + header `X-RR-Meta`) หรือ JSON · กันอัปซ้ำด้วย hash · ≤20MB · ผูก links | ครอบครัว (+บัญชีถ้าระบุ) |
| POST | /api/drive/sync-slips | สำเนาไฟล์สลิปจาก R2 ไป Drive ≤8 ไฟล์/~3MB ต่อครั้ง | ครอบครัว |
| POST | /api/drive/unlink · GET /api/drive/files · GET /api/drive/file?id= | ยกเลิกผูก · รายการไฟล์ · เปิดไฟล์ (เซิร์ฟเวอร์ดึงจาก Drive ส่ง base64 + header `X-RR-Enc`/`X-RR-Mime`) | ครอบครัว |

### 3.7 กล่องรับเอกสาร + LINE (ledger-inbox.js และโมดูลย่อยที่มันเรียก)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | /api/line-webhook | รับ event LINE (ตรวจ `x-line-signature`) ตอบ OK ทันทีแล้วทำงานใน waitUntil | ลายเซ็น LINE |
| GET | /api/inbox/quick/{doc_id}[/file] | หน้าแก้ไขด่วนจากปุ่ม LINE ใช้ token ลงนาม `t=exp.sig` (14 วัน) | ลิงก์ลงนาม |
| GET | /api/inbox?status=open\|all | เอกสาร + รายการที่ผูก | ครอบครัว |
| POST | /api/inbox/upload | multipart `file` (หลายไฟล์) + `account_id/side` (บังคับบัญชี) + `defer=1` (เข้าคิว) | ครอบครัว |
| POST | /api/inbox/process-queue · GET /api/inbox/queue | อ่านคิว 1–4 ใบ · สถานะคิว | ครอบครัว |
| POST | /api/inbox/cash | `{text}` หรือ `{amount,note,account_id}` บันทึกเงินสด | ครอบครัว |
| GET | /api/inbox/file/{doc_id} | ไฟล์ต้นฉบับจาก R2 | ครอบครัว |
| POST | /api/inbox/{doc_id}/retry | อ่านใหม่จากไฟล์ใน R2 | ครอบครัว |
| POST | /api/inbox/{doc_id}/(accept\|link\|account\|dismiss\|rematch\|learn\|fields\|unmatch\|pick\|review) | การกระทำกับเอกสาร | ครอบครัว + บัญชี |
| POST | /api/inbox/{doc_id}/edit | แก้วันที่/บัญชี/บรรทัด/ยืนยัน | ครอบครัว + บัญชี |
| GET | /api/inbox/meta | บัญชี/Company/หมวด/คู่ค้าที่ใช้ได้ | บัญชี |
| GET | /api/inbox/report?kind=pnl\|wht\|tb\|export&from&to&entity | รายงาน (เฉพาะยืนยัน) · export ≤ 62 วัน | บัญชี |
| GET | /api/inbox/parties · /parties/{c:contact\|k:category} | ลูกหนี้/เจ้าหนี้ + ความเคลื่อนไหว + ยอดสะสม | บัญชี |
| POST | /api/inbox/contacts | เพิ่มคู่ค้า | ครอบครัว |
| GET | /api/inbox/history?month&account&q | ประวัติทุกสถานะ (q ไม่มี month = ค้นทุกเดือน 300 รายการ) | บัญชี |
| POST | /api/inbox/tx/{id}/edit\|delete | แก้/ลบรายการ | บัญชี |
| POST | /api/inbox/import-rows | นำเข้า Excel กลุ่มละ 8 | บัญชี |
| POST | /api/inbox/manual | เพิ่มรายการเอง (รอยืนยัน) | บัญชี |
| POST | /api/inbox/statement | multipart account_id + file (PDF/รูป ≤30 ไฟล์, ≤40MB) → AI | บัญชี |
| POST | /api/inbox/statement/lines | นำเข้าบรรทัดจาก Excel/PDF_TEXT (ไม่ใช้ AI) ≤3000 บรรทัด | บัญชี |
| GET | /api/inbox/statements · /statements/{id} | รายการ statement · บรรทัด + สถานะ + ยอดเทียบ + walk | บัญชี |
| POST | /api/inbox/statements/{id}/create · /delete · /line/{line_id} | สร้างรายการจากบรรทัด NEW (ทีละ 8) · ลบ statement · `action: match\|ignore\|reset` | บัญชี |
| GET | /api/inbox/periods · /periods/{YYYY-MM}/check | รายการเดือน 13 เดือน (≤36) + log · เช็กลิสต์ปิดเดือน | ครอบครัว |
| POST | /api/inbox/periods/{YYYY-MM}/close · /reopen | ปิด/เปิดเดือน (reopen ต้องมีเหตุผล ≥3 ตัวอักษร) | Admin |
| GET | /api/inbox/cards · /api/inbox/loans | บัตรเครดิต (รอบบิล) · เงินกู้แบบเดิม | บัญชี |
| GET/POST | /api/inbox/assets, /assets/categories, /locations, /opening, /move, /groups[/{id}[/delete]], /{asset_id}, /{asset_id}/(delete\|restore\|writeoff\|undo) | ทะเบียนทรัพย์สิน | ครอบครัว (ตั้งหมวดทรัพย์สิน = admin) |
| GET/POST | /api/inbox/opening · /opening/{set_id}/delete | ยอดยกมา | บัญชีที่มีสิทธิ์ |

---

## 4. โมดูลฝั่งเซิร์ฟเวอร์

### 4.1 index.js (3,119 บรรทัด)
- `scheduled()` + `fetch()` + route หลักตามข้อ 3.2–3.4
- **POST /api/transactions — อัลกอริทึมกันซ้ำ** (แยกตาม source):
  - `PDF_IMPORT` (ไม่ใช่การแก้รายการเดิม): (1) `match_existing` + รหัสเดิมมีอยู่ = บรรทัดเดิม ข้าม (2) `ref_code` ซ้ำในบัญชี (3) บัญชี+วัน+เวลา+|ยอด|+เครื่องหมายตรง+ข้อความตรง โดยใช้ `OFFSET dup_idx` (บรรทัดเหมือนกันหลายบรรทัดในไฟล์ → ซ้ำเมื่อในระบบมีถึงตัวที่ n) (4) มีเวลา → วัน+เวลาถึงนาที+ยอด (กัน statement ช่วงทับซ้อน) (5) จับคู่สลิป/รายการจดเอง (LINE_SLIP/LINE_TEXT/WEB_GRID หรือ CONFIRMED ไม่มีเวลา ไม่มี stmt) ยอดเท่า เครื่องหมายเดียวกัน ±3 วัน — ผู้สมัครใกล้สุดต้องชนะชัด → อัปเดตรายการเดิมให้ใช้วัน/ข้อความธนาคาร, `source='PDF_IMPORT'`, ย้ายข้อความเดิมไปหมายเหตุ · ซ้ำ = ตอบ `skipped/duplicate` แต่ยังเติม `stmt_*` ให้รายการเดิม
  - อื่น ๆ: บัญชี+วัน+ยอดตรงกับรายการอื่น (ยอด 0 ไม่นับ) → 409 (หรือคืน `isDuplicate` เมื่อ `check_only`)
  - บันทึก: `INSERT OR REPLACE` หัว + `DELETE` details + INSERT details ใหม่ + ops จาก `planSettlementKeep` ใน `DB.batch` เดียว · คง `stmt_*` เดิมถ้าไม่ส่งมา
- **category-hints**: คีย์ = ทิศ (`OUT`/`IN`) + `statementKey(desc)` (ตัวเล็ก ตัดเลข/xx/สัญลักษณ์ ≤60 ตัว) และคีย์ผู้รับ `payeeKey` (ตัดชื่อธนาคาร/พร้อมเพย์) · ให้คำใบ้เมื่อหมวดเดียวกันทุกครั้ง หรือ ≥3 ครั้งและหมวดเดียวกัน ≥60%
- **settings/save**: ตรวจ `OWN_SQL` ว่าเป็นของครอบครัว · INVESTMENT → `behavior=ASSET, sub_behavior=INVESTMENT` · บัญชีบัตร CREDIT เก็บ credit_limit/statement_day/due_day · เปลี่ยนรหัส = `idCascade` + `PRAGMA defer_foreign_keys = true` ใน batch เดียว · entity_members = แก้ UserPermissions
- **AI เส้นทางเก่า**: `runGeminiOCR` (สลิป base64), `runGeminiStatement` (อ่านซ้ำ 1 ครั้งเมื่อ SyntaxError) ผ่าน `geminiGenerate` + `parseAiJson`
- **LINE สรุปยอด (hooks.summary)**: ข้อความ "วันนี้/today", "เมื่อวาน/yesterday", "รายวัน/daily" (7 วัน) อื่น ๆ = Flex สรุปเดือน (`sendMonthlySummaryFlex`) · เวลาไทย = UTC+7
- `dbErrorResponse` — ดูข้อ 1.6

### 4.2 session.js
`createSession` สุ่ม 32 ไบต์ → base64url, เก็บ `SHA-256(token)` ใน Sessions อายุ 30 วัน · `resolveUserId`: มี Bearer → ต้องตรงและยังไม่หมดอายุ (ไม่ตกไปใช้ x-user-id) · `ALLOW_HEADER_FALLBACK = false` (ปิดตั้งแต่ 2026-10-11) · `revokeSession` · `purgeExpiredSessions` (เรียกแบบไม่รอตอนล็อกอิน)

### 4.3 auth.js
PBKDF2-SHA256 ผ่าน Web Crypto 100,000 รอบ, salt 16 ไบต์, key 256 บิต · รูปแบบ `pbkdf2$sha256$<iter>$<salt-b64>$<hash-b64>` · `verifyPassword` รองรับรหัสข้อความเก่า (เทียบเวลาคงที่) และคืน `needsUpgrade` (เก่า หรือรอบน้อยกว่าปัจจุบัน) · `upgradeStoredPassword` ทำหลังล็อกอินสำเร็จ (ล้มไม่กระทบ) · ห้าม log รหัส/hash

### 4.4 family.js — โมเดลสิทธิ์ครอบครัว
- `ensureAdminScope(userId)`: ถ้า admin → `INSERT OR IGNORE` UserPermissions ให้ทุก Entity ในครอบครัว (Company ที่สร้างทีหลังก็เห็น)
- `/api/family/overview`: ส่วนตัว = `is_company=0`, ธุรกิจ = 1 · รับ/จ่ายจากบรรทัดยืนยันตาม `d.entity_id` (ไม่นับ TRANSFER, INVESTMENT, หมวดทรัพย์สิน) · เจ้าของ Company ส่วนตัว = ผู้ใช้ที่ไม่ใช่ admin คนเดียวที่มีสิทธิ์ ไม่งั้นเป็น admin · member เห็นเฉพาะผู้ใช้ที่แชร์ Company กัน · activity 12 กลุ่มล่าสุด (ต่อคน/บัญชี/source/status/ชั่วโมง)

### 4.5 ledger-inbox.js (2,322 บรรทัด) — กล่องรับเอกสาร + LINE bot
- **ingestFile**: รับ JPG/PNG/WEBP/HEIC/PDF ≤15MB · SHA-256 กันไฟล์ซ้ำในครอบครัว (ซ้ำที่ค้าง READING/ERROR → อ่านใหม่) · เก็บ R2 → แถว LedgerDocs (`QUEUED` ถ้า defer) → `extractDocument` → `processDoc`
- **extractDocument**: อัปโหลดไบต์ดิบไป Gemini Files API (`upload/v1beta/files`, `X-Goog-Upload-Protocol: raw`) แล้วอ้าง `fileUri` (ไม่ base64 → ประหยัด CPU) · ล้ม → `inlineData` base64 ทีละ 32KB · prompt `EXTRACT_PROMPT` แยก doc_type `SLIP/RECEIPT/ORDER/ORDER_LIST/CARD_STATEMENT/BANK_STATEMENT/LIST/OTHER`, แปลง พ.ศ.→ค.ศ., เก็บเลขบัญชีปิดบังตามที่พิมพ์ · `responseMimeType: application/json`
- **geminiGenerate (AI fallback)**: รุ่นหลักลอง 3 ครั้ง รุ่นสำรองละ 2 ครั้ง เมื่อได้ 429/500/503/504 (รอ 2s, 4s) · 400/404 → ข้ามไปรุ่นถัดไป · อื่น (401/403) → คืนทันที
- **processQueue** (cron + ปุ่ม): คืนเอกสาร READING ค้าง >15 นาทีเป็น QUEUED → จอง `QUEUED→READING` แบบ atomic (เช็ก `meta.changes`) → `retryDoc`
- **processDoc**: SLIP → `processSlip` · RECEIPT/ORDER → `processSupporting` (หลักฐานประกอบ: ผูกเมื่อยอดตรงทุกสตางค์และมีรายการเดียว = ATTACHED) · ORDER_LIST → `processOrderList` (จับทีละ order, ข้าม cancelled/refunded หรือจับเงินคืน) · statement/LIST → STORED พร้อมคำแนะนำให้ใช้ "นำเข้า Statement"
- **processSlip**: หาบัญชีฝั่งผู้โอน/ผู้รับด้วย `resolveSideAccount` (1. LedgerRules ACCOUNT คีย์ ธนาคาร+เลขท้าย 4 2. เลขท้าย 4 + ธนาคารตรง ตัวเดียว 3. `maskedAccountMatch` เทียบทีละหลักกับเลขเต็ม) → `slipDirection` (OUT/IN/TRANSFER/UNKNOWN; UNKNOWN = `NEEDS_ACCOUNT`) → ทุกขา: `findCandidates` + `decideMatch` → auto = ผูก/แนบสลิปกับรายการเดิม · choose = `NEEDS_CHOICE` · none = สร้างรายการรอยืนยันพร้อม `suggestLines` (template จาก PARTY rule → `proposeLines`) · memo บนสลิป = Detail
- **recordCash**: `parseCashText` ("65 กาแฟ", "ข้าว 50 kbank") · ยืนยันอัตโนมัติเมื่อ PARTY rule ของคำนั้น hits ≥ 2
- **runAction/reviewAction**: accept (ยืนยัน + เรียน template/บัญชี), link, account (บอกบัญชี → ประมวลผลใหม่), dismiss (ลบเฉพาะรายการที่เอกสารสร้างเองและยังไม่ยืนยัน), rematch, learn, fields, unmatch, pick, review
- **Statement ระยะ 2**: `importStatement` (AI, `STATEMENT_PROMPT`, `maxOutputTokens: 60000`, MAX_TOKENS → แนะนำแยกไฟล์) หรือ `importStatementLines` (Excel 8 คอลัมน์ / PDF_TEXT) → `saveStatement`: แปลง deposit−withdrawal เป็นยอดมีเครื่องหมาย → `fixStatementSigns` → บรรทัดที่เคยมีใน statement ทับช่วงอื่น (`lineKey` = วัน|ยอด|ยอดคงเหลือ|ข้อความ 40 ตัว) = `DUPLICATE` → `matchStatementLines` กับรายการในบัญชี = `MATCHED` → `accountNumberCheck` · `statementView` ตรวจซ้ำว่ารายการที่จับคู่ยังอยู่ (ไม่อยู่ = กลับเป็น NEW), `walkStatement`, ผลรวม vs (ยอดปิด−ยอดยกมา), ยอดระบบ vs ยอดปิด · `createFromStatement` สร้างทีละ 8 บรรทัดด้วยรหัสคงที่ต่อบรรทัด (สร้างซ้ำไม่ได้)
- **LINE webhook**: ตรวจ HMAC → loop ทุก event → ผู้ใช้ไม่รู้จัก = ตอบ LINE ID ให้ไปเพิ่มในเมนูสมาชิก · image/file → ดึงจาก `api-data.line.me` → ingestFile → การ์ด Flex · postback `inbox|action|docId|arg|side` (cats, setcat, accept, link, account, dismiss) · ข้อความ "อ่านใหม่/retry" · ข้อความเงินสด · อื่น ๆ → summary ใน index.js
- **ลิงก์แก้ไขด่วน**: `HMAC-SHA256(secret, "{docId}.{exp}")` base64url 32 ตัว, อายุ 14 วัน · LIFF ถ้ามี `LIFF_ID`
- อื่น ๆ: `historyList`, `editTransaction`/`deleteTransaction`, `listParties`/`partyLedger` (key `c:` contact / `k:` category, เฉพาะ ASSET/LIABILITY ไม่รวม INVESTMENT), `reportData` (pnl/wht/tb/export), `importRows` (ทีละ 8), `adoptPendingTransactions` (รับรายการรอตรวจที่ยังไม่มีเอกสารเข้ากล่อง ทีละ 25), `inChunks` (`D1_PARAMS = 90`)

### 4.6 ledger-match.js — ฟังก์ชันล้วน (ไม่แตะฐาน)
- `bankKey` (ชื่อธนาคารไทย/อังกฤษ/ย่อ → รหัสเดียว; บัตร/กระเป๋าที่ชื่อซ้อนธนาคารตรวจก่อน), `last4`, `maskedAccountMatch`, `accountHintKey`, `partyKey`, `parseCashText`, `slipDirection`
- `scoreCandidate(ev, tx)`: ยอดต้องเท่าเป๊ะ (≤0.005) ไม่งั้น 0 · ref ตรง = 100 · วันเดียวกันเวลาห่าง ≤10 นาที = 90 · วันเดียวกัน = 70 · ห่าง 1 วัน = 50 · 2 วัน = 35 · >2 วัน = 0
- `decideMatch`: auto เมื่อคะแนนสูงสุด ≥70 และนำอันดับสอง ≥20 · มีผู้สมัคร = choose (≤5) · ไม่มี = none (ข้ามที่ linked แล้ว)
- `balanceGap(total, details)` = total − Σ(amount − fee − wht)
- `proposeLines`: (1) template รวมพอดี → ใช้ตรง (2) ไม่พอดี → แบ่งตามสัดส่วน share แล้ว gross-up WHT (`gross = net·share/(1−rate)`, rate ≤ 15%) เศษสตางค์ใส่บรรทัดแรก (3) ไม่มี template → บรรทัดเดียว fallback · `templateFromDetails` สร้าง share/wht_rate
- `fixStatementSigns`: เชื่อยอดคงเหลือมากกว่าทิศที่ AI เดา — ถ้า |Δbalance| = |amount| แต่เครื่องหมายต่าง → กลับ · คืน flipped, opening, closing, sum, gap
- `walkStatement`: ยอด[i] = ยอด[i−1] + amount · คืนแถวที่ไม่ลง (`bad`) โดยมี `alt` กันนับซ้ำเมื่อแถวก่อนผิดแถวเดียว
- `accountNumberCheck` → `MATCH`/`MISMATCH`/null · `statementPartyKey` · `matchStatementLines`: จัดกลุ่มตามยอด + ref → คะแนน ≥35 → เลือกคู่คะแนนสูงสุด/วันใกล้สุดทั้งฉบับแบบ greedy ไม่ซ้ำ

### 4.7 ledger-line-ui.js
Flex Message ล้วน: ธีมสี OUT (แดง 💸), IN (เขียว 💰), TRANSFER (น้ำเงิน 🔁), รอเลือกบัญชี · `txCard`, `confirmButtons`, `accountButtons`, `categoryQuickItems`, `postback`, `displayName` (ตัด `[A02] ` ออก), `moneyText`, `thaiDate`

### 4.8 stmt-report.js
`SIGNED_AMOUNT_SQL` · `ensureStmtCols` (คอลัมน์ stmt_*, StatementImports, import_format, ดัชนี `idx_tx_stmt`, `idx_tx_acc_date`) · `stmtFields` (ตรวจ stmt_id `^[\w-]{4,60}$`) · `cleanupStatementHeaders` (หัวที่ไม่เหลือรายการ → ลบ + ลบ AccountCheckpoints source STATEMENT ในช่วง period_from..period_to+10 วัน) · header/sync/delete/duplicates/merge/statement-running ตามข้อ 3.5 · duplicates: ทั้งสองฝั่งมีเลขยาว ≥9 หลักแต่ไม่มีตัวตรงกัน = คนละรายการ (เช่น wePAY คนละเบอร์) · จับคู่ greedy เรียง gap

### 4.9 transfers.js
หมวด `Bank_Transfer` (ต้องมีอยู่แล้ว) · `pairTransfers`: ขาออก (ลบ) กับขาเข้า (บวก) ยอดเท่ากัน คนละบัญชี ห่าง ≤2 วัน · เรียง วันห่าง → เวลาห่าง (เฉพาะวันเดียวกันที่มีเวลา) → รหัส · greedy ไม่ใช้ซ้ำ · `ambiguous` เมื่อมีผู้สมัคร >1 · apply: แทนบรรทัดด้วยบรรทัดเดียว `TRANSFER` (note "โอนไป …/รับโอนจาก …"), ยืนยันทั้งสองขา · ขาเดียว: หาคู่รอตรวจในบัญชีปลายทาง ±2 วันก่อน → ไม่เจอ + `create_counter` สร้างขาอีกฝั่ง `TX-TRF-*` (รอตรวจ) → ไม่งั้นตั้งเป็นโอนขาเดียว

### 4.10 rules.js — กฎอัตโนมัติ
คีย์กฎ = `dir|ruleKeyOf(desc)|account_id` (ruleKeyOf = payeeKey(statementKey) หรือ statementKey) · กฎเฉพาะบัญชีมาก่อนกฎทั่วไป · **คำแนะนำ**: จาก 5000 รายการยืนยันล่าสุด (บรรทัดเดียว ไม่ใช่ Uncategorized/Bank_Transfer) ต้องมี **≥3 ครั้ง และหมวดเดียวกัน ≥90%** · Company/คู่ค้าในคำแนะนำใส่เมื่อซ้ำ ≥90% · เรียงตามจำนวนรอตรวจที่ตรง · apply: เฉพาะ PENDING_REVIEW + PDF_IMPORT + บรรทัด ≤1 → ใส่หมวด (Company ว่าง = `Accounts.tx_entity_id`), type ตามทิศ (หรือ TRANSFER), ยืนยัน, เพิ่ม hits · batch ละ 100

### 4.11 similar.js
`simTokens`: คำ ≥3 ตัว ตัด stop words ธนาคาร/ทั่วไป เลือก 3 คำยาวสุด · ค้น LIKE ใน statement_desc/note/ชื่อคู่ค้า (300 แถว) · คะแนน: ข้อความเหมือนทั้งบรรทัด +6, ต่อคำ +2, ชื่อผู้รับ +3, บัญชีเดียวกัน +1, ทิศเดียวกัน +1 / ทิศตรงข้าม −2 · แสดง ≥2 คะแนน 8 รายการ · summary = combo ที่ใช้บ่อยสุดในกลุ่มคะแนน ≥4 (n ≥2) · note ใช้เมื่อซ้ำ ≥ครึ่งกลุ่ม · pending (≤50) ต้องตรงทุกคำ · dup: ยอดเท่า ±3 วัน + (ผู้รับเดียวกัน หรือ บัญชีเดียวกัน ≤1 วัน ยอด ≥100) และเลขยาว ≥9 หลักต้องตรงถ้ามีทั้งสองฝั่ง

### 4.12 wepay.js
`WEPAY_PROMPT` แยกหน้า history/inbox → items kind `topup/deposit/refund/package` · `normDt` แปลง พ.ศ. ≥2400 → ค.ศ. · ส่งไฟล์ดิบเข้า Gemini Files API

### 4.13 loans.js — หนี้สินที่ติดตาม
- `lines()`: บรรทัดยืนยันในหมวดเงินต้น/ดอกเบี้ย (+คู่ค้าถ้าระบุ) ตั้งแต่ start_date ไม่รวม `DT-OB-%` · member จำกัดตาม Company ที่มีสิทธิ์
- `loanSummary`: sign = +1 (RECEIVABLE) / −1 (PAYABLE) · ชำระเงินต้น = Σ sign·amount · ดอกเบี้ย = Σ|amount| (ถ้าหมวดดอกเบี้ย = หมวดเงินต้น ไม่แยก) · คงเหลือ = start_balance − ชำระ · progress จาก original_amount · งวดที่จ่าย ≈ จำนวนเดือนที่มีการจ่ายเงินต้น · งวดเหลือ = ceil(คงเหลือ/ค่างวด) · **สถานะงวด** จาก due_day: งวดถือว่าจ่ายเมื่อมีการจ่ายช่วง −20 ถึง +10 วันของวันครบกำหนด → `PAID` / `OVERDUE` (เลยกำหนด หรืองวดก่อนยังไม่จ่าย) / `UPCOMING` / `DUE_SOON` (≤7 วัน)
- `splitInstallment`: ดอกเบี้ยงวด = REDUCING: คงเหลือ × rate/12 · FLAT: ยอดกู้ × rate/12 (ไม่เกินค่างวด)
- overview: ตารางจ่าย 60 วัน (สูงสุด 3 งวด/สัญญา ลดคงเหลือทีละงวด), totals, ดอกเบี้ยบ้าน (`kind=HOME`) ลดหย่อนได้ไม่เกิน 100,000
- `debtOutstanding` ใช้ในทะเบียนทรัพย์สิน (หนี้ที่ผูก `asset_ref`)

### 4.14 cards-loans.js (เส้นทาง /api/inbox/cards, /api/inbox/loans)
`cycleDates(today, statementDay, dueDay)`: วันตัดรอบล่าสุด ≤ วันนี้ (วันเกินจำนวนวันของเดือน → วันสุดท้าย), รอบก่อน, รอบถัดไป, วันครบกำหนด (ถ้า ≤ วันตัดรอบ → เดือนถัดไป) · บัตร: billed = หนี้ ณ วันตัดรอบ, due_left = billed − จ่ายเข้าหลังตัดรอบ, spent_this_cycle, available = วงเงิน + ยอด(ลบ) · สถานะ `NO_CYCLE/NO_BILL/PAID/UNPAID/OVERDUE/DUE_SOON(≤7)/UPCOMING` · เงินกู้แบบเดิม: PAYABLE ชำระ = −Σเงินต้น, RECEIVABLE = +Σ, คงเหลือ = ตั้งต้น − ชำระ (คิดฝั่งเซิร์ฟเวอร์ทั้งหมด)

### 4.15 insurance.js
- `matchPayments`: รายการจ่ายยืนยัน (amount < 0) ย้อนหลัง 2 ปี หมวดเดียวกัน (+คู่ค้าถ้าระบุ) ยอดต่างจากเบี้ยต่องวด ≤ max(1 บาท, 3%) · เรียงตาม diff แล้ว greedy (รายการเดียวใช้ได้กรมธรรม์เดียว)
- `premiumStatus`: งวดห่าง 12/per เดือน, หน้าต่าง = min(45, step×15) วัน · หางวดปัจจุบัน · มีการจ่ายในหน้าต่าง = PAID แล้วเลื่อนไปงวดถัด · เลย pay_until = `PAID_UP` · `OVERDUE` / `DUE_SOON` (≤30) / `UPCOMING` · ปฏิทินงวดค้าง 12 เดือนข้างหน้า
- `taxDeduction`: สุขภาพ ≤25,000 · ชีวิต+สุขภาพ ≤100,000 · สุขภาพพ่อแม่ ≤15,000 · บำนาญ ≤200,000
- cover_status: `ACTIVE/EXPIRING (≤90 วัน)/EXPIRED/CLOSED`

### 4.16 period-close.js — ปิดเดือน
`checkPeriod` ต้องผ่านทุกข้อ: (1) ไม่มี PENDING_REVIEW ในเดือน (2) ไม่มี LedgerDocs ค้าง (`READING/NEEDS_ACCOUNT/NEEDS_CHOICE/SUGGESTED/STORED/ERROR`) ที่ลงวันที่เดือนนี้หรืออ่านวันที่ไม่ออก (3) ไม่มีบรรทัดยืนยันที่ยัง `Cat_Uncategorized` (4) ทุกบัญชีที่ไม่ใช่ CASH และมีรายการในเดือน: มี LedgerStatements ครอบเดือน, ไม่มีบรรทัด `NEW` ในเดือน, ยอดระบบ ณ period_to = closing_balance (บัตร CREDIT ยอมเครื่องหมายกลับ) (5) `openingIssues`: ชุดยอดยกมาที่เริ่ม ≤ สิ้นเดือนต้องสมดุลและไม่มีรายการก่อนวันเริ่ม · `closePeriod` (admin, เดือนที่จบแล้วเท่านั้น) เก็บ snapshot ยอดทุกบัญชี ณ สิ้นเดือน + log · `reopenPeriod` (admin + เหตุผล) · `isMonthClosed`, `isPeriodClosedError`, `PERIOD_CLOSED_MSG`

### 4.17 opening.js — ยอดยกมา
ชุด = ชื่อ + Company + วันเริ่ม (+ anchor_account) · บรรทัด kind `ACC` (บัญชี), `CAT` (หมวด+คู่ค้า), `LOAN` (สัญญา Debts — ตั้ง start_balance/start_date) แต่ละบรรทัดระบุ `DR`/`CR` · บัญชี/สัญญา 1 ตัวอยู่ได้ชุดเดียว · คู่กับ "บัญชีพักยอดยกมา" (`CAP-OB-{fid}` behavior TRANSFER / `CAT-OB-{fid}` สร้างให้อัตโนมัติ) → บัญชีพัก = ΣDr − ΣCr ต้องเป็น 0 · สร้างรายการจริง CONFIRMED `ref_code='OPENING'`: ACC → `TX-OB-{set}-A{n}` ในบัญชีนั้น · CAT/LOAN → `TX-OB-{set}-J` ในบัญชีบันทึก ยอดรวม 0 (เดบิต = ยอดย่อยติดลบ) · แก้ชุด = ลบรายการเดิมแล้วสร้างใหม่ใน batch เดียว (ติดล็อกเดือนปิด → 409) · ทุกคนแก้ได้เฉพาะบัญชี/สัญญาที่มีสิทธิ์

### 4.18 assets.js — ทะเบียนทรัพย์สิน
admin ติ๊กหมวดที่นับเป็นทรัพย์สิน (LedgerRules `ASSET_REG`) → บรรทัดยืนยันในหมวดนั้นขึ้นทะเบียนอัตโนมัติ (`source='TX'`, วันที่/ยอดอ่านสดจากรายการ) · `OPENING` = กรอกเอง · กลุ่มย่อย (ลบกลุ่ม → ไม่ระบุกลุ่ม) · ที่ตั้ง (ค่าเริ่มต้น Chaiyapruk, Villaggio, Pattaya, Element, Condo · เก็บ AppSettings `asset_locations` ≤50) · ลบ: OPENING ลบจริง / TX ซ่อน (restore ได้) · **ตัดจำหน่าย**: รายการ `TX-WO-{asset_id}` ยอดรวม 0 ในบัญชีที่ซื้อ: บรรทัด +มูลค่า หมวดทรัพย์สิน (TRANSFER) และ −มูลค่า หมวดค่าใช้จ่ายที่เลือก · undo ได้ถ้าเดือนยังไม่ปิด · สรุปมูลค่ารวม, หนี้ที่ผูก, ส่วนของเรา · export `IS_ASSET_SQL`, `assetCategorySet`

### 4.19 revenue-chart.js — ผังเก็บรายได้ BKP
ยอดโอนของลูกค้า = ค่าบริการ − WHT + เงินรับแทน · `matchRevenue(tx)`: เฉพาะเงินเข้า (>0) แถวที่ยังไม่ถูกใช้ วันอ้างอิง (receipt > invoice > tax_month) ห่าง ≤120 วัน · ชุด 1 แถว หรือ 2–4 แถวของลูกค้า (code) เดียวกัน (จาก 12 แถวล่าสุด, bitmask) · `scoreSet`: ต้องไม่เกินยอดเข้าและขาดไม่เกิน 50 บาท (ค่าธรรมเนียมธนาคาร) · เท่าเป๊ะ 60 / ไม่เป๊ะ 35 · มีใบเสร็จห่าง ≤3 วัน +25, ≤15 +12, ≤45 +4, >120 ตัดทิ้ง · บัญชีตรง +10 / ไม่ตรง −25 · ชื่อลูกค้าอยู่ในข้อความธนาคาร +15 · หลายแถว −5 ต่อแถวเพิ่ม · คืน 3 อันดับ · `linesFromRows`: บรรทัดค่าบริการ (หมวด = type, wht, Company ตาม OWNER, คู่ค้าตาม code) + บรรทัดเงินรับแทน + ค่าธรรมเนียมธนาคารในบรรทัดแรก · ใช้ `planSettlementKeep`

### 4.20 drive.js — Google Drive ผ่าน Apps Script
`callGas` POST `text/plain` JSON `{action, …, secret}` (`redirect: follow` รับ 302 ของ Google) · `callGasData` ต่อสตริง base64 เข้า body ตรง ๆ (ไม่ parse/decode ในเซิร์ฟเวอร์ — ประหยัด CPU; ตรวจไม่มี `"`/`\`) · action ที่ใช้: `ping`, `upload`(path, name, mime, description) และดึงไฟล์ · โฟลเดอร์: `Statement/<ชื่อบัญชี>/<ปี>` · `Slip|Expense/<ชื่อบัญชี>/<ปี-เดือน>` · URL ต้องตรง `^https://script.google.com/macros/s/[\w-]+/exec$`, secret ≥8 ตัว · PDF ล็อกรหัสเก็บต้นฉบับ หน้าเว็บปลดตอนเปิดด้วยรหัสของบัญชี · sync-slips: ไฟล์ R2 หมดอายุ → บันทึก kind `missing` กันวนหา

### 4.21 โมดูลเล็ก
- **settle-keep.js** `planSettlementKeep(txId, newDetails)`: ก่อนลบ/ใส่ details ใหม่ จำ Settlements ที่ผูกบรรทัดของรายการ · บรรทัดใหม่ที่ หมวด+คู่ค้า+ยอด ตรงบรรทัดเดิม → ใช้ detail_id เดิม · มีบรรทัดที่ผูกการตัดชำระแต่ถูกแก้ → ปฏิเสธ (ให้ยกเลิกการตัดชำระก่อน) · คืน ops `INSERT OR IGNORE` Settlements กลับใน batch เดียวกัน
- **id-cascade.js** `idCascade(type, old, new)`: อ่าน `sqlite_master` + `PRAGMA table_info` ทุกตาราง (ยกเว้น Trip*) แล้ว UPDATE ทุกคอลัมน์ในกลุ่ม: account `account_id, anchor_account_id, counter_account_id, pay_account_id, linked_account_id` · entity `entity_id, tx_entity_id, default_entity_id` · category `category_id, expense_category_id, interest_category_id, principal_category_id, default_category_id` · contact `contact_id, default_contact_id` · caption `caption_id` + แก้ JSON `OpeningSets.lines` · รวม batch เดียวกับการเปลี่ยน PK
- **account-defaults.js**: `ensureTxEntityCol` (ALTER + seed ตามชื่อบัญชี), tx-defaults/tx-default/apply-company-defaults
- **detail-notes.js** `stmtDetailNote(desc)`: แยกด้วย ` · ` ตัด `++` ท้าย, `-`, `DESC :` ≤200 ตัว (ต้องตรงกับ app.js)
- **acc-overview.js**: query รวม (aggregate, daily, recent 3, ยอดธนาคารจาก StatementImports/AccountCheckpoints) ต่อเดือน · ค่าเริ่มต้น = เดือนล่าสุดที่มีรายการ
- **ai-json.js** `parseAiJson`: ตัด ``` → ตัดหลัง `}` สุดท้าย → ลบ `,` ก่อน `}`/`]` → ตัด object ใน `transactions`/`items` ที่เสียทิ้ง (`_repaired` = จำนวนที่ตัด) → ยังไม่ได้ = SyntaxError (ผู้เรียกอ่านซ้ำ 1 ครั้ง)
- **line-info.js**: bot info แคช 6 ชม. ใน memory
- **trip-purge.js**: `TRIP_PATH` regex → 410 · purge: ตัด project_id ทริปออกจาก TransactionDetails, ลบทุกตาราง `Trip*`, Projects ทริป (`TRP-%` หรือมี TripStops/TripExpenses), บัญชี TRIP_HOLDING ที่ไม่มีรายการ, ผู้ใช้ `ledger_mode='TRIP_ONLY'` ที่ไม่เคยสร้างรายการ · batch ละ 50 · คืน backup ทั้งหมดในคำตอบ
- **unified-trip.js / legacy-trip.js**: ระบบทริปเดิม (ยกเลิก v271 — index.js ไม่ import แล้ว)

---

## 5. ความปลอดภัยและสิทธิ์

### 5.1 ขั้นตอนยืนยันตัวตน
1. `POST /api/login` → ตรวจรหัส (PBKDF2 / ข้อความเก่าแล้วอัปเกรด) · ข้อความ error เดียวกันทั้ง "ไม่มีผู้ใช้" และ "รหัสผิด"
2. ได้ `token` (256 บิต base64url) + `token_expires_at` (30 วัน) — ฐานเก็บเฉพาะ SHA-256
3. ทุกคำขอส่ง `Authorization: Bearer <token>` · token ผิด/หมดอายุ → 401 (ไม่ fallback ไป `x-user-id`; `ALLOW_HEADER_FALLBACK=false`)
4. `POST /api/logout` ลบ session ฝั่งเซิร์ฟเวอร์

### 5.2 ประตูเดียว (2026-10-11)
หลัง `/api/login` ทุก route ต้องมี `authUserId` · ข้อยกเว้นที่ไม่ใช้ token: `/api/line-webhook` (ใช้ลายเซ็น LINE HMAC เมื่อตั้ง `LINE_CHANNEL_SECRET`) และ `/api/inbox/quick/*` (ลิงก์ลงนาม HMAC ต่อเอกสาร อายุ 14 วัน) · `/api/export` ปิด (410) · `/api/slip-ocr`, `/api/statement-ocr` ต้องล็อกอิน (กันใช้โควตา AI)

### 5.3 การแยกข้อมูล (isolation)
- **ระดับบัญชี**: `canUseAccount(accId)` = `Accounts JOIN UserPermissions ON entity_id WHERE user_id` · `canWriteTx` (รหัสที่มีอยู่ต้องเป็นบัญชีที่มีสิทธิ์ — กันเขียนทับรายการคนอื่นด้วย INSERT OR REPLACE) · `ownTx`, `ownDetail` · ทุก query รายการ JOIN UserPermissions
- **ระดับครอบครัว**: master data/ตั้งค่า/กฎ/หนี้/ประกัน/Drive/ปิดเดือน กรอง `family_id` ของผู้ใช้ · `OWN_SQL` ตรวจก่อนแก้/ลบ · Captions/Categories ที่ `family_id IS NULL` = ของระบบใช้ร่วม
- **ระดับรายชื่อ (members JSON)**: Contacts, Projects, Debts — NULL/[] = ทุกคนในครอบครัว · มีรายชื่อ = เฉพาะ user ในรายชื่อ (admin เห็นทั้งหมดในหน้าตั้งค่า)

### 5.4 ระดับสิทธิ์ (admin vs member)
| ความสามารถ | admin | member |
|---|---|---|
| เห็น Company | ทุก Company ในครอบครัว (`ensureAdminScope` เติมสิทธิ์ให้เองใน /api/settings, /api/family/overview) | เฉพาะที่ได้รับใน UserPermissions |
| รายการ/บัญชี | ตามสิทธิ์ Company (=ทั้งหมด) | ตามสิทธิ์ Company |
| สร้าง/แก้สมาชิก, ลบสมาชิก (ห้ามลบตัวเอง/แอดมินคนสุดท้าย) | ✓ | ✗ |
| ลบ master data, reset, backup/restore, trip-purge | ✓ | ✗ |
| ตั้งค่า Google Drive | ✓ | ใช้งานได้ ตั้งค่าไม่ได้ |
| ปิด/เปิดเดือน | ✓ | ดูเช็กลิสต์ได้ |
| ตั้งหมวดทรัพย์สิน | ✓ | ✗ |
| หนี้/ประกัน | เห็นทั้งหมด | Company ของรายการอยู่ในสิทธิ์ (หรือไม่ระบุ) + อยู่ใน members (หนี้) |
| แก้ master data (settings/save) | ✓ | ✓ (เฉพาะของครอบครัว) |
| ยอดยกมา | ✓ | เฉพาะบัญชี/สัญญาที่มีสิทธิ์ |

### 5.5 อื่น ๆ
- ล็อกเดือนที่ปิดด้วย trigger ระดับฐานข้อมูล (กันได้ทุกเส้นทาง) + `isMonthClosed` ในโค้ด · restore/reset ตรวจเดือนปิด
- error ไม่ส่ง stack · รหัสลับ Apps Script ไม่ส่งกลับหน้าเว็บ (URL ถูกปิดบางส่วน)
- ไฟล์ใน R2 เข้าถึงผ่าน `/api/inbox/file/{id}` ที่ตรวจ family เท่านั้น
- restore แบบ replace ตรวจไฟล์ครบก่อนลบของเดิม

---

## 6. ประสิทธิภาพและโควตา D1

### 6.1 บริบท
ผู้ใช้ 2 คน ~20 รายการ/วัน + นำเข้าย้อนหลัง 1 ปี (ราว 14,143 รายการ) · 1 บรรทัด statement ≈ 15–20 แถวที่เขียน · ต้นเหตุเกินโควตา (11 ต.ค. 69): เปิดแอป 1 ครั้งอ่าน ~670k แถว (`/api/accounts` 481k) จาก correlated subquery ไม่มีดัชนี และ `strftime`/`LIKE` ที่ใช้ดัชนีไม่ได้

### 6.2 ดัชนี
| ดัชนี | ตาราง (คอลัมน์) |
|---|---|
| idx_transactions_account_date, idx_tx_acc_date | Transactions(account_id, date) |
| idx_transactions_ref | Transactions(ref_code) |
| idx_tx_acc_status_amt | Transactions(account_id, status, total_amount) — covering สำหรับยอดบัญชี |
| idx_tx_status_date | Transactions(status, date) |
| idx_tx_desc | Transactions(statement_desc) |
| idx_tx_stmt | Transactions(stmt_id) |
| idx_td_category | TransactionDetails(category_id) |
| idx_settle_parent | Settlements(parent_detail_id, settled_amount) |
| idx_userperm_entity | UserPermissions(entity_id, user_id) |
| idx_ledgerdocs_family_status, idx_ledgerdocs_hash | LedgerDocs(family_id, status, created_at) · (family_id, file_hash) |
| idx_ledgerdoclinks_tx | LedgerDocLinks(transaction_id) |
| idx_ledgerstatements_account | LedgerStatements(account_id, period_to) |
| idx_stmtimports_acc | StatementImports(account_id, period_to) |
| idx_periodlog_family | LedgerPeriodLog(family_id, created_at) |
| idx_opening_family, idx_asset_items_family | OpeningSets(family_id, date) · AssetItems(family_id, status) |
| idx_autorules_fam, idx_revchart_fam | AutoRules(family_id, dir, payee) · RevenueChart(family_id, code) |
| idx_drivefiles_hash, idx_drivelinks_ref | DriveFiles(family_id, file_hash) · DriveLinks(ref_type, ref_id) |
+ `PRAGMA optimize` หลังสร้างดัชนี

### 6.3 แนวปฏิบัติใน query
- ช่วงวันที่ใช้ `date >= ? AND date < ?` แทน `strftime()` (ใช้ดัชนีได้) · `month=YYYY-MM` แปลงเป็นช่วง
- `/api/transactions` ไม่ระบุช่วง → จำกัด 500 รายการล่าสุด · `?count=1` นับฝั่งเซิร์ฟเวอร์
- ยอดบัญชีคิดด้วย subquery `GROUP BY account_id` ครั้งเดียว ไม่ใช่ต่อแถว · `/api/stats/date-range` หา MIN/MAX/COUNT ต่อบัญชีด้วยดัชนี
- `/api/settings` รวมหลาย query เป็นรอบเดียว (เดิม 7 รอบต่อกัน)
- `topCategories` ดูแค่ 1,500 บรรทัดล่าสุด · category-hints 3,000 · rules 5,000 · similar 300

### 6.4 ขีดจำกัดพารามิเตอร์และ batch
- **D1 รับ ≤100 bound parameters ต่อ statement** → แบ่ง `IN (...)` ชุดละ 90 (`D1_PARAMS = 90`, bulk-delete, transfers, rules, statements/sync, trip-purge)
- `DB.batch` แบ่งชุด: 100 (rules/apply, fill-detail-notes), 50 (trip-purge) · สร้างจาก statement ทีละ 8 บรรทัด (`CREATE_CHUNK`), import-rows ทีละ 8, adopt ทีละ 25, revenue import ≤300 แถว/ครั้ง
- statement เก็บบรรทัดเป็น JSON แถวเดียว (ลดจำนวนคำสั่งเขียน)
- เขียนหลายตารางที่ต้องสำเร็จพร้อมกันใช้ `DB.batch` (atomic): บันทึกรายการ + Settlements, โอนสองขา, ปิดเดือน + log, เปลี่ยนรหัส + cascade

### 6.5 CPU / เวลา
- ส่งไฟล์ดิบไป Gemini Files API แทน base64 · base64 ทีละ 32KB เมื่อจำเป็น · Drive ต่อสตริง base64 ตรงเข้า body · sync-slips ≤3MB/ครั้ง
- LINE webhook ตอบ OK ทันที + `ctx.waitUntil`
- คิวเอกสาร (`defer=1`) + cron ทุก 5 นาที แทนการอ่านทุกไฟล์ในคำขอเดียว

### 6.6 แคช
- ตัวแปร `ready` ระดับโมดูล — ไม่ PRAGMA/CREATE ซ้ำในทุกคำขอของ isolate เดียวกัน
- bot-info แคช 6 ชม. · CORS preflight แคช 7200 วินาที
- category-hints / rules คิดสดต่อคำขอ (ไม่มีแคชถาวร)

---

## 7. การทดสอบ

### 7.1 วิธีการ
- ใช้ `node:sqlite` (`DatabaseSync(':memory:')`) สร้างตารางจำลอง แล้วห่อเป็นวัตถุแบบ D1 (`prepare().bind().first()/all()/run()` + `batch`)
- เพราะ `package.json` เป็น commonjs → เทสคัดลอก `backend/src/*.js` ไปโฟลเดอร์ชั่วคราวที่มี `{"type":"module"}` แล้ว import `index.js` (เรียก `worker.fetch(new Request(...), env)`)
- AI/LINE/Apps Script จำลองด้วย `env.__extractOverride`, `env.__statementOverride`, `env.__fetch`, `fetchImpl`, `env.__today`
- รันทีละไฟล์: `node backend/test/<ชื่อ>.test.mjs` (ต้องใช้ Node ที่มี `node:sqlite`) · `npm run test:api` รันเฉพาะ session, auth, unified-trip-write

### 7.2 รายการไฟล์เทส
| ไฟล์ | ครอบคลุม |
|---|---|
| security.test.mjs | ประตูล็อกอิน: export/categories/slip-ocr/statement-ocr/outstanding ไม่ล็อกอิน = 401, x-user-id ปลอม = 401, export = 410, categories/captions เฉพาะครอบครัว, settlement ข้ามครอบครัว 404, เขียนทับรายการบัญชีอื่น 403, bulk-import ไม่แตะของคนอื่น, login ยังสาธารณะ, quota → 503 JSON ไม่มี stack |
| endpoints.test.mjs | endpoint ที่ปรับลดการอ่าน (ระยะ 1): ผลลัพธ์ถูก + ใช้ดัชนีจริง |
| session.test.mjs | ออก/ตรวจ/เพิกถอน token, หมดอายุ, ไม่ fallback x-user-id |
| auth.test.mjs | hash/verify PBKDF2, รหัสข้อความเก่า + needsUpgrade, เทียบเวลาคงที่ |
| family.test.mjs | ensureAdminScope, ภาพรวม admin vs member, ส่วนตัว/ธุรกิจร่วม, กิจกรรมล่าสุด, member ไม่ได้สิทธิ์เพิ่ม |
| ledger-inbox.test.mjs | กล่องรับเอกสาร + เครื่องจับคู่ ระยะ 1 (ฟังก์ชันใน ledger-match และ flow สลิป/เงินสด) |
| slip-review.test.mjs | หน้าตรวจสลิป action fields/unmatch/pick/review + กรณีสลิปจริง |
| statement-walk.test.mjs | walkStatement, accountNumberCheck, แก้ตัวเลข, นำเข้า Excel |
| stmt-report.test.mjs | หัว statement, stmt_* รายบรรทัด, statement-running, ลบหัวที่ว่าง |
| period.test.mjs | ปิดเดือน: trigger ล็อก, เช็กลิสต์ต้องผ่านครบ, reopen |
| opening.test.mjs | ยอดยกมา: ชุดตามเจ้าของ, บัญชีพัก Dr/Cr, รายการก่อนวันเริ่ม |
| assets.test.mjs | ทะเบียนทรัพย์สิน, ตัดจำหน่ายไปหมวดค่าใช้จ่าย, undo |
| cards-loans.test.mjs | รอบบิลบัตรเครดิต, เงินกู้/ผ่อนแบบเดิม, ลบสมาชิก (preview) |
| loans.test.mjs | loanSummary, สถานะงวด, splitInstallment |
| insurance.test.mjs | matchPayments, premiumStatus, taxDeduction |
| transfers.test.mjs | pairTransfers, apply คู่/ขาเดียว/สร้างขาอีกฝั่ง |
| rules.test.mjs | คำแนะนำกฎ (≥3, ≥90%), save/apply |
| similar-wepay.test.mjs | รายการใกล้เคียง, เตือนจ่ายซ้ำ, wePAY normDt/อ่าน |
| revenue-chart.test.mjs | matchRevenue, linesFromRows, import/apply |
| acc-overview.test.mjs | /api/accounts/overview |
| drive.test.mjs | Google Drive ผ่าน Apps Script จำลอง (config/upload/reuse hash) |
| id-cascade.test.mjs | เปลี่ยนรหัส ID ตามไปทุกตาราง + OpeningSets.lines |
| trip-purge.test.mjs | ทริป API = 410, purge นับ/ยืนยัน/สำรอง/ไม่แตะรายการ |
| unified-trip-write.test.mjs | ฝั่งเขียนของ Unified Trip (537 assertion — ระบบยกเลิกแล้ว) |

### 7.3 ตรวจหน้าเว็บก่อน deploy
`check-frontend.mjs` (static) และ `check-frontend-runtime.mjs` (รันจริง) อยู่ใน pipeline ของ deploy.sh — เทสฝั่งเซิร์ฟเวอร์จับบั๊กหน้าเว็บที่เรียกฟังก์ชันที่ถูกลบไม่ได้

---

# ส่วน D — Frontend · หน้าจอ · ระบบออกแบบ · มือถือ

## โครงสร้างไฟล์หน้าเว็บและลำดับการโหลด

### ภาพรวม
- หน้าเว็บเป็น **Single-Page App แบบ vanilla JS** (ไม่มี framework, ไม่มี bundler) อยู่ในโฟลเดอร์ `frontend/` และ deploy ขึ้น **Cloudflare Pages** (โปรเจกต์ `record-revenue-web`) ด้วยคำสั่ง `npx wrangler pages deploy frontend --project-name record-revenue-web`
- หน้า HTML มีหน้าเดียวคือ `index.html` (~1,874 บรรทัด) ข้างในมี **ทุกหน้าจอ (section.content-view) และทุก modal** อยู่ครบแล้ว JS ทำหน้าที่แค่ซ่อน/แสดง
- หน้าเว็บเรียก API ที่ Cloudflare Worker `https://record-revenue.9nimz.workers.dev` (ดูหัวข้อ API_BASE ในส่วนโมดูล)

### ไฟล์ใน `frontend/`
| ไฟล์ | ขนาด/บทบาท |
|---|---|
| `index.html` | โครงหน้าทั้งหมด: หน้าล็อกอิน, เมนูซ้าย (desktop), header, 11 section ของหน้าจอ, เมนูล่างมือถือ, แผ่น "เพิ่มเติม", modal ทุกตัว (`tx-modal`, `settlement-modal`, `setting-modal`, `user-modal`, `debt-modal`, `plan-modal`, `budget-modal`) |
| `app.js` | **ไฟล์เดียว 17,466 บรรทัด (~1.3MB)** รวมทุกตรรกะของหน้าเว็บ (โหลดเป็น `app.js?v=281`) |
| `travel.js` | โค้ดระบบทริปเดิม (`travel.js?v=105`) ยังโหลดอยู่ แม้ระบบทริปปิดแล้วตั้งแต่ v271 — มี `getUserIdHeader` ซ้ำกับ app.js (app.js โหลดทีหลังจึงชนะ) · *ไฟล์นี้ไม่อยู่ในชุดที่ extract มา* |
| `style.css` | CSS ฐานเดิมของแอป (`?v=129`) · *ไม่อยู่ในชุดที่ extract มา* |
| `ui-a.css` | หน้าตาแบบ A "ม่วงนุ่ม" + แบบ C "โหมดมืด" (1,008 บรรทัด, `?v=50`) ทำงานเมื่อ `body.ui-a` |
| `font-mali.css` | บังคับฟอนต์ Mali ทั้งแอป + กฎ "อ่านง่าย" v271 (ตัวเล็กสุด 14px, ช่องกรอก ≥40px) (`?v=5`) · *ไม่อยู่ในชุดที่ extract มา* |
| `mobile.css` | กฎมือถือ ≤768px ล้วน ๆ (288 บรรทัด, `?v=8`) — **โหลดท้ายสุด** |
| `_headers` | ตั้ง `Cache-Control: no-cache` ให้ `/` และ `/index.html` |

### ลำดับการโหลดใน `<head>` (สำคัญ — ลำดับ = ลำดับความสำคัญของ CSS)
1. Google Fonts ชุดใหญ่: Inter, Prompt, Noto Sans Thai, Sarabun, Kanit, Mitr, Nunito Sans, Anuphan (ใช้ในธีมต่าง ๆ)
2. Font Awesome 6.4.0 จาก cdnjs (`fa-solid`, `fa-regular`, `fa-brands`) — ไอคอนทั้งแอป
3. `style.css?v=129` → CSS ฐาน
4. `ui-a.css?v=50` → ทับด้วยหน้าตาแบบ A/C
5. `preconnect fonts.gstatic.com` + Google Fonts **Mali** (300–700) — ฟอนต์หลักทั้งแอปตั้งแต่ 2026-10-31
6. `font-mali.css?v=5` → บังคับ Mali + กฎอ่านง่าย
7. `mobile.css?v=8` → **ท้ายสุด** เพื่อให้กฎมือถือชนะทุกไฟล์

### สคริปต์ (ท้าย `<body>` ทั้งหมดใช้ `defer`)
ย้ายมาท้ายหน้า + `defer` ตั้งแต่ 2026-10-30 เพื่อให้หน้าขึ้นก่อนโดยไม่ต้องรอไลบรารี ~2MB:
- `pdf-lib@1.17.1` (unpkg) + `pdf.js 3.11.174` (cdnjs, ตั้ง `workerSrc` ใน `onload`) — เปิด/ปลดรหัส PDF statement และดึงข้อความจาก PDF ในเบราว์เซอร์
- `sweetalert2@11.26.25` — กล่องยืนยัน/ฟอร์มย่อย (`Swal.fire`)
- `chart.js@4.5.1` — กราฟ
- `xlsx-js-style@1.2.0` — อ่าน/เขียน Excel (ประกาศ `XLSX` ตัวเดียว; ตัด `xlsx-latest` ~900KB ออกแล้ว 2026-10-30)
- `travel.js?v=105` แล้ว `app.js?v=281`

### Cache-busting
- ทุกไฟล์ในเครื่องอ้างด้วย `?v=<เลข>` และ **ต้องบั๊มเลขทุกครั้งที่แก้ไฟล์** (Cloudflare Pages ไม่สนใจ query string แต่เบราว์เซอร์แคชแยกตาม URL)
- `index.html` ถูกตั้ง `no-cache` ผ่าน `_headers` เพื่อให้ได้เลข `?v=` ใหม่ทุกครั้ง
- **ป้ายเวอร์ชันมุมจอ (`#app-ver`)**: แสดง `v<เลขของ app.js ที่รันอยู่>` และทุก 5 นาทีดึง `/index.html?ver=<เวลา>` (`cache: 'no-store'`) มาเทียบ — ถ้าเลข `app.js?v=` บนเซิร์ฟเวอร์ใหม่กว่า ป้ายเปลี่ยนเป็นสีแดง "มีเวอร์ชันใหม่ กดเพื่อโหลด" (เกิดจากเคสจริง: North นำเข้าข้อมูลด้วยแอปเวอร์ชันเก่าที่เบราว์เซอร์จำไว้)

### ธีม
- ธีมเก็บที่ **`<body data-theme="...">`** (ไม่ใช่ `<html>`) — `applyTheme(t)` ตั้ง `data-theme` แล้วสลับ class:
  - `body.ui-a` เมื่อธีมเป็น `purple` หรือ `dark` (ใช้หน้าตาใหม่ใน ui-a.css)
  - `body.ui-dark` เมื่อธีม `dark`
- ธีมที่รองรับ (`VALID_THEMES`): `purple` (ค่าเริ่มต้น "ม่วงนุ่ม"), `dark`, `kawaii`, `sakura`, `fuji`, `hokkaido`, `anime`, `ghibli` (6 ตัวหลังเป็นธีมเก่า ui-a.css ไม่แตะ)
- จำค่าที่ `localStorage['app-theme2']` (เปลี่ยนชื่อคีย์เพื่อให้ทุกคนเริ่มที่ purple)
- ที่เลือกธีมมีหลายจุด แต่ทุกจุดยิงไปที่ `#theme-selector` ตัวเดียว (`bindSettingsTheme()`): PC = select ท้ายเมนูซ้าย · iPad = ปุ่ม 🎨 เปิด `#theme-pop` · มือถือ = ท้ายแผ่น "เพิ่มเติม" (`.ms-theme`) และหน้าตั้งค่ามือถือ (`StHome`)
- ⚠️ กฎ "เฉพาะธีมสว่าง" ต้องเขียน `body:not([data-theme="dark"])` เพราะธีมอยู่ที่ body

### ลำดับเริ่มทำงาน (DOMContentLoaded)
`initTheme()` → `bindSettingsTheme()` → ผูกปุ่มย่อเมนูซ้าย → `initApp()` → `bindNavigation()` → `bindActions()` → `bindGridInputEvents()` → `bindModalEvents()` → `bindPDFUpload()` → `bindPendingPageActions()` → `bindBackupRestore()` → `bindFlatExport()`

`initApp()`:
1. อ่าน `localStorage['logged_in_user']` (สำรอง `sessionStorage`) → ใส่ `AppState.userId/userName/userRole/familyId/allowedEntities`
2. ซ่อนหน้าล็อกอิน แสดง `#workspace` · แสดง/ซ่อน `.admin-only` ตาม role · จอ ≤992px แสดง `.bottom-nav`
3. `fetchMasterData()` → `checkScheduledBackup()` (admin) → 8 วินาทีต่อมา `DriveStore.syncSlips(false)`
4. ถ้า URL มี `?txId=` (ลิงก์จาก LINE) → `switchView('pending')` ไม่งั้น `switchView('dashboard')`
- `goNewHomeIfDefault()` ถูกปิด (`return false`) ตั้งแต่ 2026-10-12 — North สั่งกลับมาใช้แอปเดิมเป็นหลัก ไม่พาไป `ledger/home.html`

---

## หน้าจอทั้งหมด (Views)

### กลไกการสลับหน้า
- ทุกหน้าเป็น `<section id="view-<ชื่อ>" class="content-view">` · `switchView(name)`:
  - `grid-input` ถูกรวมเข้า `pending` แล้ว (เรียกชื่อเก่า = ไปหน้ารอตรวจ)
  - ตั้ง `AppState.activeView` และ **`document.body.dataset.view = name`** (CSS ใช้ `body[data-view="..."]` เช่นซ่อน header ซ้ำในหน้าภาพรวม/มือถือ)
  - ปิดแผ่น `#more-sheet` · หน้า settings บนจอ >768px ล็อก `.main-content` ไม่ให้เลื่อน (เลื่อนในกรอบด้านใน + `fitSettingsHeight()` วัดความสูงจริง) · มือถือเลื่อนทั้งหน้า (v274)
  - ใส่ class `active` ให้ `.nav-item[data-target=name]` · ซ่อน/แสดง section · ตั้งชื่อหัว `#page-title` จาก `titleMap`
  - แสดงแถบปุ่มใน header เฉพาะหน้า: `#pending-import-actions` + `#pending-filter-container` (หน้ารอตรวจ), `#history-filter-container` (หน้าประวัติ)
  - เรียกตัวโหลดของหน้า: dashboard→`loadDashboard()` · cards→`CardsView.open()` · assets→`AssetsView.open()` · insurance→`InsView.load()` · pending→`loadPending()` · history→`loadHistory()` · debtor→`DebtorView.open()` · reports→`loadReports()` · settings→`loadSettings(); fitSettingsHeight(); StHome.enter()`
- เมนู: desktop = `aside.sidebar .sidebar-nav` · มือถือ = `nav.bottom-nav` 5 ปุ่ม (ภาพรวม · รอตรวจ+badge · ➕เพิ่ม · ประวัติ · เพิ่มเติม) · ปุ่ม "เพิ่ม" ตั้ง `AppState._createNewAfterLoad = true` แล้วไปหน้ารอตรวจเพื่อสร้างการ์ดใหม่ · แผ่น `#more-sheet` (grid 3 คอลัมน์) มี ลูกหนี้/เจ้าหนี้ · บัตร & เงินกู้ · ทรัพย์สิน · ประกัน · รายงาน · บอท LINE · ตั้งค่า + เลือกธีม
- เมนูหลัก desktop (แนวคิด ข 2026-10-30): **6 หน้า** ภาพรวม · รอตรวจ (badge `#badge-pending`) · ประวัติ · ลูกหนี้/เจ้าหนี้ · รายงาน · ตั้งค่า แล้วคั่น "อื่น ๆ" (`.nav-minor`): บัตร & เงินกู้ · ทรัพย์สิน · ประกัน
- ใต้เมนูซ้ายมีกล่อง QR บอท LINE (`#line-qr-box`, แสดงเมื่อโหลด `/api/line/bot-info` สำเร็จ) และท้ายสุด select ธีม + ปุ่มออกจากระบบ

### 0. หน้าล็อกอิน (`#login-page`)
- ช่อง "อีเมล หรือ ชื่อผู้ใช้" + รหัสผ่าน · Enter ที่ช่องผู้ใช้ → ไปช่องรหัส · Enter ที่รหัส → เข้าสู่ระบบ
- `POST /api/login {username, password}` → ได้ `{user, token}` → เก็บ `localStorage['logged_in_user']` และ `localStorage['session_token']` (ค้างได้ตามอายุ token 30 วัน — North ยืนยันเลือก 2026-08-02)
- ออกจากระบบ: `POST /api/logout` (Bearer token, ไม่รอผล) แล้วลบทั้ง localStorage/sessionStorage
- ส่วน "สำหรับเพื่อนร่วมทริป" (Trip Password) ซ่อนไว้ตั้งแต่ v271 (`.trip-retired`)

### 1. ภาพรวม / หน้าแรก (`#view-dashboard` → `#dv2-root`)
- ข้อมูลหลัก: `GET /api/dashboard/summary?month=<YYYY-MM|latest>&period=<month|year|all>&member=<ALL|user_id>` — ครั้งแรกขอ `latest` (เดือนล่าสุดที่มีรายการ ไม่ใช่เดือนปัจจุบัน เพราะเคยทำให้หน้าแรกว่างทั้งที่มีข้อมูลหมื่นกว่ารายการ) + นับรอตรวจ (`dv2LoadPendingCount`)
- สถานะเก็บใน `DashState` (month, year, period, member, data, range, openWht, ปฏิทินแผน)
- **ตัวกรองบนสุด = สมาชิก (Member)** ไม่ใช่ Company · เลือก รายเดือน/รายปี/ทั้งหมด · ปุ่ม ‹ › เปลี่ยนเดือน/ปี · โหลดใหม่
- Desktop (`dv2Render`): แถบบน (`dv2TopBar`) → KPI (`dv2Kpis`) → **ครอบครัว & ธุรกิจ** (`#fam-home` โดย `FamView`) → **การ์ดบัญชี** (`#acc-home` โดย `AccView.home`) → Statement · บัตรเครดิต · ลงทุน → โดนัทรายรับ/รายจ่าย + Top 5 เงินไปไหน → งบประมาณ → ค่าเฉลี่ย · ลูกหนี้ (AR) · เจ้าหนี้ (AP) → การ์ดภาษีหัก ณ ที่จ่าย (ถูกหัก/หักไว้, กางรายเดือนได้) → **แผนรายจ่ายล่วงหน้า** (ปฏิทินรายเดือน + รายการใกล้ถึง)
- มือถือ (`dv2RenderPhone`, ภาพรวมแบบ ก v276): หัว "ภาพรวม" + select สมาชิก · select ช่วงเวลา + ‹ › · การ์ด "คงเหลือสุทธิ" ใบเดียว (รับ/จ่าย 2 ช่อง + "ข้อมูลถึง") · แถบส้ม "⏰ รอตรวจ n รายการ ไปตรวจ ›" · บัญชีแบบสั้น 3 รายการ + ดูทั้งหมด · โดนัทรายจ่าย · หัวข้อรองเป็น `<details class="mh-acc">` พับไว้ (ครอบครัว & ธุรกิจ · รายรับตามหมวด · Statement/บัตร/ลงทุน · งบประมาณ · เฉลี่ย/ลูกหนี้/เจ้าหนี้ · ภาษีหัก ณ ที่จ่าย · แผนรายจ่าย)
- **ครอบครัว & ธุรกิจ (`FamView`)**: `GET /api/family/overview?period=...` · แท็บ admin: ทั้งครอบครัว / ของฉัน / ธุรกิจ · member: ของฉัน / ธุรกิจที่ร่วม · KPI รับ/จ่าย/สุทธิ แยกส่วนตัว-ธุรกิจ · การ์ดสมาชิก (avatar สีจาก hash ของ user_id, บัญชีส่วนตัว·รอตรวจ, ธุรกิจที่ร่วม, เตือนถ้ายังไม่มีสิทธิ์ใน Company) · ตารางธุรกิจ (ใครใช้ได้, บัญชี·รอตรวจ, รับ/จ่าย) · "ใครบันทึกอะไรล่าสุด" (แหล่ง: นำเข้า statement / สลิป LINE / ข้อความ LINE / บันทึกเอง / นำเข้า Excel)
- **การ์ดบัญชี (`AccView.home`)**: `GET /api/accounts/overview` · ยอด · % ตรวจครบ · ไม่ตรงธนาคาร/ขาดบรรทัด · กราฟแท่งรายวัน · 3 รายการล่าสุด · คลิกไปหน้ารายละเอียดบัญชี
- modal ที่ใช้: `#plan-modal` (แผนรายจ่าย: ไอคอน emoji, รายการ, จำนวน, วันครบกำหนด, Company, ทำซ้ำ NONE/MONTHLY/QUARTERLY/YEARLY, หมวด, หมายเหตุ → `/api/planned-expenses`) · `#budget-modal` (งบต่อหมวดต่อเดือน → `/api/budgets`)

### 1b. รายละเอียดบัญชี (`#view-account` → `#av-detail`, โดย `AccView.open`)
- เลือกเดือน · ยกมา/รับ/จ่าย/ยกไป (เทียบ ระบบ vs ธนาคาร) · โดนัทรับ-จ่าย · สรุปความตรงกัน · รายการเดินบัญชีพร้อมยอดคงเหลือรายบรรทัด · แก้รายการได้ (`AccView.edit`) · ส่งออก Excel/PDF (ใช้ตัวส่งออกของ `StmtReport`)
- API: `/api/accounts/overview`, `/api/reports/statement-running`

### 2. รอตรวจ (`#view-pending`) — หน้าที่ใช้งานหนักที่สุด
โครง: `#pending-hero` (ส่วนหัว) → `#line-docs-panel` (สลิป LINE ที่ต้องเลือก) → `#pending-status-summary-container` (ตรวจยอดคงเหลือต่อบัญชี) → `#pending-cards-container` (การ์ด)

**โหลด (`loadPending`)**
- `GET /api/transactions?status=PENDING_REVIEW&limit=0` (limit=0 = เอาทั้งหมด; เดิมได้ 500 ล่าสุด รายการย้อนหลังหาไม่เจอ) → `AppState.pendingTransactions`
- พร้อมกัน (ไม่รอ): `AccDefaults.load()` (`/api/accounts/tx-defaults` = Company เริ่มต้นต่อบัญชี) · `DupPairs.load()` (`/api/transactions/duplicates`) · `TransferPairs.load()` (`/api/transfers/suggest`) · `SlipQueue.check()` · งานซ่อมข้อมูลครั้งเดียว (`/api/transactions/fill-detail-notes`, `/api/wepay/fix-notes` ครั้งเดียวต่อ session; `/api/transactions/apply-company-defaults` ครั้งเดียวต่อเครื่อง) — เสร็จแล้วค่อยวาดใหม่ถ้ามีผล
- แล้ว `renderPendingTransactions()` + `renderPendingHero()` + `LineSlips.load()` + (มือถือ) `PendReview.mount(); PendCardA.scan(); PendHeroPhone()`

**ส่วนหัว (`renderPendingHero`)**
- ปุ่มนำเข้าใหญ่ 4 ช่อง: ① **นำเข้า Statement** (PDF ธนาคาร/บัตร · ภาพแคป TrueMoney/Shopee, เลือกบัญชีได้หรือไม่เลือกถ้าหลายไฟล์) ② **นำเข้า Excel ▾** (เป็นรอตรวจ+ตรวจซ้ำ / ข้อมูลเก่าจำนวนมาก → รอตรวจ / ข้อมูลเก่า → ยืนยันเลย / ดาวน์โหลดแม่แบบ) ③ **เพิ่มรายการเอง** ④ **สลิป / ใบเสร็จ / Order** (เลือกได้หลายร้อยรูป อัปไว้ก่อน ระบบทยอยอ่าน)
- แถบเครื่องมือ (`.ph-tools`): 🪄 เติมหมวดจากประวัติ · 🏷️ ใส่หมวดหลายรายการ · 💾 บันทึกทั้งหมดที่พร้อม · ⚡ กฎอัตโนมัติ · 👥 โหมดจัดกลุ่ม · ตัวกรอง 📎 มีสลิป / ไม่มีสลิป · 🔁 อาจซ้ำ n + รวมทั้งหมด · ⇄ โอน n + ยืนยันทั้งหมด · 🧾 สลิปที่ยังไม่จับคู่ · ป้ายคิวอ่านรูป · 👥 ผังรายได้ · 🗑️ ลบทั้งชุดที่นำเข้า
- KPI 4 ใบ: รอตรวจ n · รวมรายรับ (รอตรวจ) · รวมรายจ่าย (รอตรวจ) · ผลนำเข้าล่าสุด (จาก `localStorage['rr_last_import']`)
- หมายเหตุ: ปุ่มเดิมในแถบ header (`#btn-trigger-statement-upload`, `#btn-pending-upload-csv`, `#bulk-import-file-input` ฯลฯ) ยังเป็นตัวทำงานจริง ปุ่มใหม่แค่ `.click()` ปุ่มเดิม และสะท้อนสถานะด้วย MutationObserver

**การ์ดรายการ (การ์ดแบบ ก / desktop)** — `.tx-card[data-txid][data-accid]`
- หัวการ์ด: วันที่ (`.rr-dwrap .rr-date`) · เวลา · ชื่อบัญชี/เลือกบัญชี · **ยอด statement** (`.input-stmt-amount`, ติดลบแสดงเป็นวงเล็บ) · Detail จาก statement (`.input-stmt-note`) · สีหัวตามทิศ (`header-expense` / `header-income`)
- **รายการย่อย (sub-lines / split)** `.sub-row-item` หลายแถว ต่อแถว: Caption (ประเภทหลัก) · Category · Company (entity) · Customer (contact) · ยอด (`.input-amount`) · ค่าธรรมเนียม (`.input-fee`) · ภาษีหัก ณ ที่จ่าย (`.input-wht`) · หมายเหตุ · ปุ่มเพิ่ม/ลบ/เลื่อนแถว
- สถานะยอด (`.zero-sum-status`): ✅ เมื่อ |ยอด statement| = Σ(|ยอดย่อย| − ค่าธรรมเนียม − ภาษี) (ต่างได้ ≤0.01)
- ปุ่มต่อการ์ด: บันทึก+ยืนยัน · ลบ · 🔎 รายการใกล้เคียง (`Similar`) · ⇄ โอนระหว่างบัญชี · 📎 ดูสลิป (รูปย่อโหลดเมื่อเลื่อนมาเห็น `SlipThumbs`) · แถบ 🔁 อาจซ้ำ (รวมเป็นรายการเดียว) · แถบ ⇄ คู่โอน · แถบ 👥 ผังรายได้ "[ใช้]"
- บันทึก: `getCardPayload(card)` → `POST /api/transactions` แล้ว `POST /api/transactions/confirm {transaction_id}` → `removePendingCardLocal()` (ลบการ์ดในเครื่อง ไม่โหลดใหม่ทั้งหน้า)
- แก้ระหว่างพิมพ์: `autoSaveCard(card)` บันทึกเป็น PENDING_REVIEW อัตโนมัติ (debounce)
- **กฎการ์ดร่าง (v275)**: ปุ่ม "+ เพิ่ม" **ไม่ยิง API** — สร้าง `{ _draft: true, source: 'WEB_GRID' }` ในเครื่อง (`data-draft="1"`) · `autoSaveCard` ข้ามถ้ายอดทุกช่อง = 0 (`isEmptyDraftCard`) · บันทึกครั้งแรกสำเร็จ → `draftSaved()` ลบสถานะร่าง · ไม่กรอกแล้วออก/รีเฟรช = การ์ดหายเอง ไม่ค้างในรอตรวจ · ลบการ์ดร่าง = ลบในเครื่อง
- **วาดแบบทยอย (⚡ 2026-10-30/11-01)**: มีการ์ดได้ ~2,000 ใบ แต่ละใบมี select หลายตัว → วาด 30 ใบแรกทันที ที่เหลือทีละ 40 ใบเมื่อเลื่อนถึง sentinel `.pend-more` (IntersectionObserver rootMargin 600px) · ปุ่มทำทีละหลายรายการต้อง `await AppState._pendingRenderRest()` ก่อน (วาดให้ครบ) · ใช้ `_pendingRenderToken` กันการวาดเก่าทับรอบใหม่
- ตัวกรอง/เรียง: บัญชี (`#pending-account-filter`), เรียงวันที่ Z-A/A-Z (`#pending-sort-filter`), ตัวกรองสลิป `AppState.pendingSlipFilter` = `ALL|SLIP|NOSLIP|DUP|TRF` · TRF จัดคู่ขาออก/ขาเข้าให้อยู่ติดกัน
- **⌨️ Tab ในการ์ด (v255)**: Tab/Shift+Tab วนเฉพาะช่องในการ์ดรอตรวจ ข้ามกล่อง Similar/แถบซ้ำ/แถบโอน และเลือกข้อความทั้งช่อง

**เครื่องมือทำหลายรายการ**
- 🪄 **เติมหมวดจากประวัติ (`autofillFromHistory`)**: `GET /api/transactions/category-hints` → ใช้เฉพาะคำใบ้ที่ "มั่นใจ" (ผู้รับ/ร้านเดียวกันเคยบันทึกหมวดเดียวกันทุกครั้ง) จับด้วย `statementKey(desc)` และ `payeeKey()` แยกทิศ IN/OUT → `Similar.applyToCard()` · การ์ดที่เติมมีกรอบเขียว (`data-autofill`) · **ไม่บันทึกให้** ผู้ใช้ตรวจแล้วกดบันทึกเอง
- 🏷️ **ใส่หมวดหลายรายการ (`bulkCategorize`)**: Swal ฟอร์ม "ข้อความมีคำว่า" + หมวด (จัดกลุ่มตาม Caption) + Company/คู่ค้า (ไม่บังคับ) + "เฉพาะที่ยังไม่มีหมวด" · นับการ์ดที่ตรงสด ๆ
- 💾 **บันทึกทั้งหมดที่พร้อม (`bulkSaveReady`)**: การ์ดที่มี Caption+หมวดครบทุกแถวและ ✅ → บันทึก+ยืนยันด้วย **worker 3 ตัวขนานกัน** · สลิปที่มากับ LINE ส่ง `POST /api/inbox/{id}/learn`
- 👥 **โหมดจัดกลุ่ม (`PendGroups`)**: กลุ่ม = ผู้รับ/ร้านเดียวกัน ทิศเดียวกัน (`OUT|`/`IN|` + payeeKey) · แถบกลุ่มเรียงจากมากไปน้อย · กดกลุ่ม = กรองเหลือกลุ่มนั้น · เลือกหมวด/Company/คู่ค้า "ใส่ให้ทั้งกลุ่ม" → "บันทึก+ยืนยันทั้งกลุ่ม"
- 🔁 **รายการซ้ำ (`DupPairs`)**: บรรทัด statement รอตรวจที่ซ้ำกับรายการยืนยันเดิม (ข้อมูลเก่าจาก Excel ไม่มีเวลา) → "รวมเป็นรายการเดียว" = เก็บรายการเดิม (หมวดที่ยืนยันไว้) + เติมเวลา/ข้อความธนาคาร · `POST /api/transactions/merge`
- ⇄ **โอนระหว่างบัญชี (`TransferPairs`)**: ก. ปุ่ม ⇄ บนการ์ด → เลือกบัญชีอีกฝั่ง → ตั้ง `Bank_Transfer` + ยืนยัน · ข. ระบบหาคู่: ออกบัญชีหนึ่ง+เข้าอีกบัญชี ยอดเท่ากัน ห่าง ≤2 วัน · ค. อีกฝั่งไม่มี statement (เงินสด/กระเป๋า) → ติ๊ก "สร้างรายการฝั่งนั้นให้" · คู่ที่ผู้ใช้ปฏิเสธจำใน `localStorage['rr_trf_no']` · `POST /api/transfers/apply`
- ⚡ **กฎอัตโนมัติ (`AutoRules`)**: หน้าต่างดู/เพิ่ม/ปิดกฎ + แนะนำจากประวัติ · `/api/rules`, `/api/rules/save|toggle|delete|apply`
- 🧾 **สลิปที่ยังไม่จับคู่ (`SlipReview`)**: ซ้าย = รูปสลิป · ขวา = ข้อมูลที่ AI อ่าน (แก้ได้) + รายการที่จับคู่ได้ทุกบัญชี + หมวด → ✓ ยืนยัน · โอนระหว่างบัญชีของเรา = 2 ขา ไม่ต้องเลือกหมวด · `GET /api/inbox?status=all`, `POST /api/inbox/{id}/(fields|unmatch|pick|review|account|dismiss)`
- 📲 **สลิปจาก LINE ที่ต้องช่วยเลือก (`LineSlips`, `#line-docs-panel`)**: แสดงเฉพาะสถานะ `NEEDS_ACCOUNT` / `NEEDS_CHOICE` / `ERROR` / `READING` / `STORED` · `POST /api/inbox/{id}/(account|link|dismiss|retry)`
- 📥 **คิวอ่านรูป (`SlipQueue`, v260)**: เลือก >3 รูป → ย่อรูปในเบราว์เซอร์ (≤2000px, JPEG 0.85 ด้วย canvas) แล้วอัปเก็บอย่างเดียว (`/api/inbox/upload`) · ระหว่างเปิดแอปเรียก `/api/inbox/process-queue` ต่อเนื่อง 2 ทาง · อ่านแล้วยอด/วันที่ตรง → แนบรูปให้รายการ (📎)
- 👥 **ผังรายได้ (`RevenueChart`)**: นำเข้า .xlsx ผังเก็บรายได้ BKP · ผูก OWNER → บริษัท · การ์ดเงินเข้าที่ยอดตรง (รวมหลายเดือนได้) ขึ้นแถบ "[ใช้]" · `/api/revenue-chart/(import|summary|map|suggest|apply)`
- 📱 **wePAY จากรูปหน้าจอ (`WePay`)**: อ่านรูป (AI `/api/wepay/read`) → รวม/ตัดซ้ำ → ตรวจก่อนนำเข้า → เข้ารอตรวจของบัญชี wePAY (`ref_code` กันซ้ำ)
- 🗑️ ลบทั้งชุดที่นำเข้า (`deleteImportBatch`, `/api/transactions/bulk-delete`)

**ตรวจยอดคงเหลือ (Balance Check, `renderSharedStatusSummary`)**
- การ์ดเล็กต่อบัญชี ย่อ/ขยายได้ (`localStorage['rr_bk_open']`) · "📝 ใส่ยอดธนาคาร" (วันที่ + ยอด; บัตรเครดิตใส่ยอดค้างเป็นบวก แล้วกลับเป็นลบภายใน) → `POST /api/accounts/checkpoint {account_id, as_of, balance, source:'MANUAL'}` · แสดง ธนาคาร ณ วัน vs ระบบ ณ วัน → ✅ ตรง / ⚠️ ต่าง + ปุ่ม ⚖️ ปรับยอดยกมาให้เท่าธนาคาร (`reconcileAccount`)

**รอตรวจบนมือถือ (แบบ ข, v276)** — แถบโหมด `.pr-modes` (sticky) 3 โหมด จำใน `localStorage['rr_pend_mode_v276']` (ค่าเริ่ม `one`):
- 🎯 **ทีละรายการ (`PendReview`, mode B)**: แถบความคืบหน้า n/ทั้งหมด · การ์ดใหญ่: วันที่·เวลา·บัญชี · **ยอดตัวใหญ่** (แดง/เขียว) · ข้อความธนาคาร · 📎 ดูสลิป · 💡 "เคยบันทึก n ครั้ง: หมวด·Company·คู่ค้า — แตะเพื่อใช้" (AI fill จากประวัติ `Similar.fetch` → `/api/transactions/similar`) · **ชิปหมวด ≤6 อัน** (จัดอันดับ: ใช้ในหน้านี้ ×5 จาก `localStorage['rr_rv_use_v276']` + ความถี่จาก `DashState.data` + อยู่ทิศเดียวกัน +3 + ตรงกับคำแนะนำ +100000 · บังคับมี `Bank_Transfer`) + select "🔍 หมวดอื่น…" · **ชิป Company ≤4 อัน** (Company เริ่มต้นของบัญชีมาก่อน) + "Company อื่น…" · "+ คู่ค้า · ค่าธรรมเนียม · ภาษี" (คู่ค้าค้นด้วย `<datalist>`) · **"+ แยกหลายรายการ"** (เพิ่มส่วน; ส่วนแรกเริ่มที่ครึ่งหนึ่ง) · `rebalance()`: **ส่วนสุดท้ายรับยอดที่เหลือ** + บวกค่าธรรมเนียม/ภาษีของตัวเองกลับ · แสดง "แบ่งครบแล้ว ✓" / "ยังเหลือ x" · ปุ่ม `ข้าม ›` · `🗑` · `✓ บันทึก แล้วไปต่อ` · พรีวิว "ถัดไป: ..." · เลือกหมวดที่มี `default_entity_id/default_contact_id` → เติมให้ถ้ายังว่าง
  - ตรวจก่อนบันทึก: ทุกส่วนต้องมีหมวดและยอด ≠ 0 · ยอดที่แบ่งต้องครบ (≤0.01) · type มาจาก `category.default_type` หรือ `caption_behavior` (REVENUE→INCOME, EXPENSE→EXPENSE) ไม่งั้นตามเครื่องหมาย
  - บันทึกด้วย payload รูปเดียวกับ `getCardPayload()` → `POST /api/transactions` + `/confirm`
- 📋 **ทั้งหมด**: การ์ดเดิมจัดแบบ ก (`PendCardA`): รายการย่อย >1 → แต่ละแถวย่อเป็นบรรทัดสรุป `.pa-sum` (เลข · หมวด · Company·คู่ค้า · ยอด) แตะเพื่อเปิดแก้ทีละแถว · แถบ `.pa-meter` แสดงสัดส่วนที่แบ่งแล้ว
- 🏪 **ตามร้าน**: = โหมดจัดกลุ่มเดิม (`AppState.pendingGroupMode`)
- ส่วนหัวมือถือ (`PendHeroPhone`): ปุ่มนำเข้า 4 ช่องแถวเดียว (ซ่อนคำอธิบาย/select) · ปุ่มเครื่องมือรวมใน "🧰 เครื่องมือ ▾" (ชิปตัวกรองสลิปยังแสดง) · KPI 3 ใบ
- กด "+ เพิ่ม" บนมือถือ → สลับไปโหมดทั้งหมดให้ (การ์ดร่างอยู่ในโหมดนั้น)

### 3. ประวัติ (`#view-history`, `loadHistory` + `HistUI`)
- `GET /api/transactions?status=CONFIRMED&month=&startDate=&endDate=...` + ตัวกรอง เดือน/ช่วงวันที่/ค้นหา/บัญชี/Caption/หมวด/Company/Customer + เรียง
- หน้าตาแบบ ก (v247, 2026-10-31): รายการแบ่งตามวัน · แถวมี เวลา · บัญชี · ข้อความธนาคาร · หมายเหตุ · Company · สลิป · หมวด · ยอด · ป้าย "ไม่มีหมวด" · KPI ด้านบน (`renderHistoryKpis`) · ตัวกรองลัด: ยังไม่มีหมวด / มีสลิป / จดเอง · แผงขวา: สรุป + หลักฐาน (ไฟล์ Drive) + ประวัติผู้รับ + **กลับไปรอตรวจ** (`/api/transactions/unconfirm`)
- แก้รายการ: `openTransactionModalFromHistory` → `#tx-modal` (บัญชี, วันที่, ยอดรวมตามสลิป, Ref Code, แถว split ผ่าน `addSplitRow`/`validateSplitSums`, ส่วนตัดชำระหนี้ Settlement)
- ส่งออกรายการที่แสดงเป็น Excel (`exportHistoryShown` → ไฟล์ `ประวัติรายการ-YYYY-MM-DD.xlsx`)

### 4. ลูกหนี้/เจ้าหนี้ (`#view-debtor`, `DebtorView` + `DebtUI`)
- แท็บ: `DEBT` 💸 หนี้สินที่ติดตาม · `AR` ลูกหนี้ (เขาติดเรา) · `AP` เจ้าหนี้ (เราติดเขา) · `SUM` สรุป · `LOAN` ทะเบียนเดิม
- ลูกหนี้/เจ้าหนี้คิดจากรายการจริงในหมวดสินทรัพย์/หนี้สิน (หักที่ตัดชำระแล้ว): ซ้าย = รายชื่อ + ยอดค้าง · ขวา = ไทม์ไลน์ ยืม/คืน · `GET /api/inbox/parties`, `/api/inbox/parties/{key}`
- หนี้สินที่ติดตาม (`DebtUI`): หนี้บ้าน/รถ/อื่น ๆ (ไม่รวมบัตรเครดิต) การ์ดต่อสัญญา: คงเหลือ · ความคืบหน้า · งวด · ดอกเบี้ย/เงินต้นปีนี้ · งวดถัดไป · กำหนดจ่าย 60 วัน · API `/api/loans/overview|detail|save|close`
- ทะเบียนเดิม (LOAN): แผงซ้าย ACCOUNTS + แท็บ RECEIVABLE/PAYABLE + แผงรายละเอียด (`renderDebtsDashboard`, `viewDebtDetails`) · `/api/debts`
- modal `#debt-modal`: ไอคอน (ชุด Zodiac/Hokkaido/China/Japan/Mascot/One Piece จาก `ICON_SETS`) · Type (PAYABLE เรากู้มา / RECEIVABLE เราให้ยืม) · ชื่อ · ใครเห็นหนี้นี้ (ไม่เลือก = ทุกคน) · เจ้าหนี้/ลูกหนี้ (Contacts) · วันเริ่ม · ยอดเริ่ม · ค่างวด/เดือน · **หมวดเงินต้น**: PAYABLE แสดงเฉพาะหมวด LIABILITY (v281 ตัดหมวดนอกกลุ่มออก หนี้เดิมที่ผูกผิดจะขึ้นว่างให้เลือกใหม่), RECEIVABLE เฉพาะ ASSET (ไม่รวม INVESTMENT) · **หมวดดอกเบี้ย**: PAYABLE = EXPENSE, RECEIVABLE = REVENUE (`debtCatsBy`, `debtFillDropdowns`)

### 5. รายงาน (`#view-reports` → `#rep-home`, `RepHome`, แบบ ข. v271)
- เลย์เอาต์: **เมนูซ้าย** (`.rp-side`) + ช่องขวา (`.rp-bar` หัวรายงาน + `#rp-dyn` เนื้อหาที่สร้างใหม่ + `#rp-slot` ช่องวาง section เดิม) · จำรายงานล่าสุด `localStorage['rr_rep_view_v271']` · จอ <900px เมนูกลายเป็นแถบเลื่อนด้านบน (sticky)
- เมนู:
  1. 📊 **ภาพรวม** (`ie`): KPI รายรับรวม/รายจ่ายรวม/สุทธิ/จำนวนรายการ + โดนัท SVG + ตาราง จำนวนเงิน/สัดส่วน สำหรับรายจ่ายและรายรับตามหมวด (เกิน 7 หมวด → 6 + "อื่น ๆ")
  2. 👥 **ผู้รับ / ผู้จ่าย** (`payee`): จัดกลุ่มตามคู่ค้า (ถ้ามี) ไม่งั้นตามข้อความรายการ (ตัดเลขท้าย) · คอลัมน์ Payee/Count/Paid/Received/Top category · ค้นหา · 20 อันดับแรก/ทั้งหมด · กดชื่อ = กางรายเดือน
  3. 📒 **ยอดสะสม statement** (`stmt`, `StmtReport`): เลือกบัญชี+ช่วงวันที่ · `GET /api/reports/statement-running` · ยอดคงเหลือรายบรรทัดแบบมุมธนาคาร (บัตรเครดิต = ยอดค้างเป็นบวก) · ตรวจ ① บรรทัดแรกที่ยอดสะสม "เริ่มต่าง" จากยอดที่ธนาคารพิมพ์ ② ยกมา/ยกไปเทียบระบบ ③ รายการในช่วงที่ไม่มีใน statement ④ บรรทัดในระบบน้อยกว่าในไฟล์ ⑤ ช่วงวันที่ไม่มี statement · legend สี (เริ่มต่าง/ไม่มีใน statement/ต่อเนื่อง) · ติ๊กลบบางรายการ · ลบ statement ทั้งฉบับ (เฉพาะรอตรวจ) `/api/statements/delete`
  4. ％ **ภาษีหัก ณ ที่จ่าย** (`wht`): เลือกเดือน + Company → `runWhtReport()` → `/api/reports/wht` (ตาราง วันที่ · ลูกค้าผู้หักภาษี · เจ้าของรายได้ · ยอดก่อนภาษี · ภาษีที่หัก · เลขที่สลิป)
  5. ⚖️ **งบทดลอง** (`tb`): เลือก Entity → `runTrialBalanceReport()` → `/api/reports/trial-balance` (หมวดบัญชี · ประเภท · เดบิต · เครดิต · ยอดรวมดุล)
- ภาพรวม/ผู้รับ ใช้ข้อมูล `/api/dashboard/summary?member=ALL` ชุดเดียวกับหน้าภาพรวม · เลือก รายเดือน/รายปี/ทั้งหมด + ‹ ›
- **ส่งออกทุกรายงาน**: Excel ผ่าน `xlsx-js-style` (`toXlsx`: แปลงข้อความตัวเลขรูป `1,234.00`/`(1,234.00)` เป็นตัวเลขจริง ตั้ง format `#,##0.00_);[Red](#,##0.00)` และความกว้างคอลัมน์อัตโนมัติ) · PDF = **เปิดหน้าต่างใหม่ทันทีตอนกด** (กัน iPhone บล็อกป๊อปอัป) แล้วเขียน HTML A4 ฟอนต์ Sarabun + ปุ่ม 🖨️ พิมพ์/บันทึกเป็น PDF
- section เดิม (`#report-wht-section`, `#report-tb-section`, `#report-stmt-section`) **ไม่สร้างใหม่** แต่ย้าย DOM เข้า/ออก `#rp-slot` เพื่อเก็บค่าตัวกรองและ event เดิม · `.reports-tabs` เดิมซ่อนไว้ · รายงานทริป/โปรเจกต์ถูกเอาออก (v271)

### 6. ตั้งค่า (`#view-settings`)
- โหลด: `GET /api/settings` (+ `GET /api/users` ถ้า admin, ดึงพร้อมกัน) → `AppState.settings` → `renderSettingsTabs()` + `setupSettingsEvents()` + เรียงคอลัมน์ได้ (`initTableSorting`) + ปรับความกว้างคอลัมน์ได้ (`initSettingsResizableColumns`)
- admin สลับมุมมอง "ดูทั้งหมด / ดูเฉพาะของฉัน" (`setSettingsViewMode`, `AppState.settingsViewMode`)
- บันทึก/ลบข้อมูลหลัก: `#setting-modal` → `saveSettingItem()` → `POST /api/settings/save` · ลบ `POST /api/settings/delete` · **เปลี่ยนรหัส ID ได้** (v275 เซิร์ฟเวอร์ cascade อัปเดตทุกตารางที่อ้างรหัสนั้น · รหัสซ้ำได้ 400)
- ทุกแท็บมีปุ่ม ส่งออก/นำเข้า Excel ของตาราง (`exportSettingExcel`, `importSettingExcel`)
- POST ไปที่ `/api/(settings|users|contacts|projects|categories|entities|restore|reset)` → ตัวห่อ fetch ล้างแคช `mdcache:*` ใน sessionStorage อัตโนมัติ

แท็บ (`.settings-tab[data-settings-tab]`):
| แท็บ | ชื่อปุ่ม | คอลัมน์/ฟิลด์หลัก |
|---|---|---|
| `entities` | 👑 Company | รหัส ID · Company · สมาชิกผู้ถือ · ประเภท (ส่วนตัว/ธุรกิจ = `is_company`) · การจัดการ |
| `contacts` | 👥 Customer | รหัส ID · ชื่อคู่ค้า · ประเภทคู่ค้า |
| `captions` | 🏷️ Caption | รหัส ID · ชื่อประเภทหลัก · พฤติกรรม (Behavior: REVENUE/EXPENSE/ASSET/LIABILITY/INVESTMENT…) · Default Company · Default Customer |
| `categories` | 🗂️ Categories | รหัส ID · ชื่อประเภทย่อย · ผูกกับประเภทหลัก · Default Company · Default Customer |
| `accounts` | 💳 Statement | รหัส ID · เจ้าของ (Company) · ชื่อบัญชี · ธนาคาร · เลขที่บัญชี · ยอดปัจจุบัน · ผู้มีสิทธิ์ใช้งาน · ฟิลด์ในฟอร์ม: **Company เริ่มต้นของรายการ** (`tx_entity_id`), **รหัสผ่าน PDF**, ประเภทบัญชี, ข้อมูลบัตรเครดิต (`dv2ToggleCreditFields`), สมาชิกที่เข้าถึงได้ |
| `users` (admin) | 👨‍👩‍👧‍👦 Member | การ์ดสมาชิก (grid auto-fill 300px) → `#user-modal` |
| `debts` | 📝 ทะเบียนหนี้สิน | ตารางสัญญาหนี้ → `#debt-modal` |
| `opening-balances` | ⚖️ ยอดยกมา | `OB` (ดูด้านล่าง) |
| `backup` | 💾 Backup/Restore | ดูด้านล่าง |

- **สมาชิก & สิทธิ์ (`#user-modal`, `UserForm`, v273)**: หัวม่วง + ตัวอักษรย่อ · 4 ส่วนมีเลข: ① ข้อมูลเข้าใช้ (ชื่อผู้ใช้, ชื่อแสดง, อีเมล, รหัสผ่าน + ปุ่มดูรหัส; **แก้สมาชิกเดิมเว้นรหัสว่าง = ใช้รหัสเดิม**) ② ระดับสิทธิ์เป็นการ์ด 2 ใบ สมาชิก/ผู้ดูแล (select เดิม `#user-role-select` ซ่อนไว้ sync) ③ Company ที่เข้าถึงได้เป็นการ์ดติ๊ก แยก 👤 ส่วนตัว / 🏢 ธุรกิจ + ค้นหา + เลือกทั้งหมด/ล้าง + "เลือก n จาก m" (admin = ซ่อนเครื่องมือและแจ้งว่าเข้าถึงทุก Company อัตโนมัติ) ④ เชื่อม LINE: LINE User ID + ตรวจรูปแบบ (U + 32 ตัว) · บันทึก `saveUserItem()` → `/api/users` (payload เดิม) · ลบ `/api/users/delete`
- **ยอดยกมา (`OB`, `#ob-root`)**: ชุดยอดยกมาตามเจ้าของ + วันที่เริ่ม (แต่ละคนเริ่มคนละวันได้) · ทุกบรรทัดระบุ เดบิต/เครดิต · ส่วนต่างไป "บัญชีพักยอดยกมา" ต้องเป็น 0 (Dr = Cr) · แถบสรุปติดล่าง (sticky) · API `GET/POST /api/inbox/opening`, `POST /api/inbox/opening/{set_id}/delete`, `GET /api/inbox/meta`, `GET /api/inbox/loans`
- **Backup/Restore (`settings-backup`)** เรียงจากบน:
  1. 🧳 **ล้างข้อมูลทริป** (admin, `TripPurge`): "ตรวจข้อมูลทริป" `GET /api/admin/trip-purge` (นับแถวต่อตาราง, ชื่อทริป, รายการในสมุดที่ผูกทริป) → ปุ่มลบ → `window.prompt` ต้องพิมพ์ **`ลบทริป`** ให้ตรง → `POST /api/admin/trip-purge {confirm:'ลบทริป'}` → ดาวน์โหลด `trip-backup-YYYY-MM-DD.json` อัตโนมัติ
  2. 📁 **Google Drive** (`DriveStore.renderCard`, `#drive-card`): ตั้งค่า/ทดสอบการเชื่อม (`/api/drive/config|test`) · อัปไฟล์ต้นฉบับ statement หลังนำเข้า (ไม่บล็อกการนำเข้า ไฟล์เดิมไม่อัปซ้ำ) · ซิงก์สลิป LINE (`/api/drive/sync-slips`) · เปิดดูไฟล์ (`DriveView`, PDF ล็อกรหัสปลดด้วยรหัสของบัญชีตอนเปิด)
  3. **Export แบบ Flat** (1 แถว = 1 รายการย่อย; เลือก statement + ช่วงวันที่ → Excel/CSV, `/api/export/flat`)
  4. **Export ฐานข้อมูลทั้งหมด** (`/api/backup/full`, ช่วงวันที่ได้)
  5. **สำรองอัตโนมัติตามรอบ** (`rr_backup_schedule` ใน localStorage, `checkScheduledBackup` ตอนเปิดแอป admin เท่านั้น)
  6. **Import / กู้คืน** (แม่แบบ 2 ชีต / แม่แบบ Flat, `/api/restore/full`)
  7. ดูโครงสร้างฐานข้อมูล (`renderSchemaViewer`, `DB_SCHEMA`)
  8. **Danger Zone**: ล้างเฉพาะรายการ / ล้างทั้งหมด (`resetData`, `/api/reset`)
- **QR บอท LINE (`LineQR`)**: รอจน `AppState.userId` มี (เช็กทุก 1.5 วินาที) → `GET /api/line/bot-info` → สร้างรูป QR จาก `api.qrserver.com` ด้วย `addUrl` จริง (เดิมเขียนตายตัว `@recordrevenue` ซึ่งไม่ใช่บอทจริง) · แสดงทุกคน · มือถือ = "บอท LINE" ในแผ่นเพิ่มเติม
- **ธีม**: ย้ายออกจากหน้าตั้งค่า desktop แล้ว (v274) — ดูหัวข้อธีม · มือถือมีในหน้า StHome
- **ตั้งค่าบนมือถือ (แบบ ข, `StHome`, v276)**: เมนูแบบหน้าตั้งค่า iPhone: การ์ดผู้ใช้ (ม่วง gradient + ปุ่มสลับมุมมองถ้า admin) → กลุ่ม "ข้อมูลหลัก" (Company, Statement, Customer, Caption, Categories พร้อมจำนวน) · "สมาชิก & การเงิน" (สมาชิก (admin), ทะเบียนหนี้สิน, ยอดยกมา) · "ระบบ" (สำรอง/Google Drive) · "ธีม" · แตะ = กดแท็บเดิมให้ + แถบ "‹ ตั้งค่า" (sticky) · `decorate()`: **ตารางกลายเป็นการ์ด** (ใส่ `td[data-label]` จากหัวคอลัมน์, คอลัมน์ "ชื่อ…" เป็นหัวการ์ด `td.st-title`, คอลัมน์สุดท้าย = แถวปุ่ม) · ช่องค้นหาในหัวข้อ · ปุ่ม Excel ย้ายไปใต้ปุ่ม `⋯` · MutationObserver ใช้ "ลายเซ็น" ข้อมูลกันวาดวน

### 7. บัตร & เงินกู้ (`#view-cards`, `CardsView`)
- ย้ายมาจาก `ledger/cards.html` (2026-10-15) โค้ดเดิมแทบไม่เปลี่ยน แค่ผูกกับ `#view-cards` · มี `<style>` scoped ของตัวเอง (`--ink`, `--brand`, ...) ที่ ui-a.css แมปเข้ากับตัวแปรธีม
- แท็บ `#cl-tabs`: 💳 บัตรเครดิต · 🏦 เงินกู้ / ผ่อน · API กลุ่ม `/api/inbox/cards`, `/api/inbox/loans`, `/api/loans/*`
- นำเข้า statement บัตรเครดิต: `parseCardStatement` → `importCardStatement` (รอบบิล `cardCycle`)

### 8. ทรัพย์สิน (`#view-assets`, `AssetsView`)
- ย้ายมาจาก `ledger/assets.html` · แท็บ `#as-tabs`: 🏷️ มีอยู่ (`ACTIVE`) · 📦 ตัดจำหน่ายแล้ว (`WRITTEN_OFF`) · 🙈 ซ่อนไว้ (`REMOVED`) · API `/api/inbox/assets`, `/api/inbox/meta`, `/api/drive/files`

### 9. ประกัน (`#view-insurance` → `#ins-root`, `InsView`, v259)
- สรุป: เบี้ยต่อปี · ต้องจ่ายใน 60 วัน · หมดอายุใน 90 วัน · ลดหย่อนภาษีปีนี้ · การ์ดกรมธรรม์ + ปฏิทินเบี้ย 12 เดือน · API `/api/insurance/overview|save|close`

### 10. การนำเข้า statement (flow)
1. เลือกบัญชี (ไม่บังคับถ้าหลายไฟล์) → เลือกไฟล์ PDF/รูป (`#statement-pdf-input`, multiple)
2. **หลาย PDF** → `batchImportStatements()`: หาบัญชีจากเลขในไฟล์ (`statementAccountMatches`; เจอหลายบัญชี → ไฟล์บัตรเลือกบัญชีประเภท CREDIT, statement ธนาคารเลือกที่ไม่ใช่บัตร)
3. เปิด PDF ในเบราว์เซอร์ (`openStatementPdf`): ลองรหัสผ่านของบัญชี (`statementPdfPasswords`), pdf-lib/pdf.js (มีทางสำรองสำหรับ AES-256) → ดึงข้อความ
4. ตัวอ่าน: **ลอง `parseCardStatement` ก่อนเสมอ** ไม่ใช่บัตรค่อยใช้ `parseTextStatement` (`detectStatementIssuer` ระบุธนาคาร) · อ่านไม่ได้ → AI `/api/statement-ocr`
5. **อ่านได้แล้วไม่ส่ง AI ซ้ำ (v269)**: ขั้นหลังอ่านครอบด้วย `noAi(what, fn)` → ถ้า error ให้ alert ไม่ fallback ไป AI เงียบ ๆ
6. `statementPrecheck(accId, info)`: เทียบเลขบัญชีในไฟล์กับบัญชีที่เลือก (เตือนถ้าเป็นของบัญชีอื่น) · ช่วงวันที่ · ยอดเข้า/ออก · ยอดยกมาในไฟล์เทียบระบบ ณ วันแรก (`/api/accounts/balance-at`) → เสนอสร้างยอดยกมาถ้ายังไม่มีรายการก่อนหน้า
7. `importStatementRows()` → `POST /api/transactions` (source `PDF_IMPORT`) + หัว statement `/api/statements/header` + จุดตรวจยอด `/api/accounts/checkpoint` (source `STATEMENT`) + `/api/statements/sync` · กันซ้ำด้วย ref/hash (`generateTxId`, `simpleHash`)
8. หลังนำเข้า: เก็บผล `rr_last_import` (imported/merged/skipped) · `DriveStore.saveStatement` อัปต้นฉบับ · `rematchWaitingDocs()` จับคู่สลิปที่รออยู่
- Excel: `parseExcelFileToPending` (รอตรวจ + ตรวจซ้ำ) · `bulkImportExcelFile` → `/api/bulk-import` พร้อม overlay ความคืบหน้า `#bulk-import-overlay` ("อย่าปิดหน้าเว็บระหว่างนำเข้า")

### 11. ปิดงวด (period close)
- **ไม่พบหน้าจอ/ฟังก์ชัน "ปิดงวด" ในโค้ดหน้าเว็บที่ได้รับ** (ค้น `ปิดงวด`, `lock`, `period close` ไม่เจอในแอปหลัก) — สิ่งที่ใกล้เคียงคือ **จุดตรวจยอดธนาคาร** (`/api/accounts/checkpoint(s)`) + Balance Check + รายงานยอดสะสม statement · กลไก "ล็อกเมื่อปิด" ที่เจอใน HANDOFF เป็นของระบบทริปที่ปิดไปแล้ว (`blockedByClose()`, `financeLocked()`) ถ้าสร้างใหม่ควรออกแบบปิดงวดเป็นฟีเจอร์แยก

### หน้าที่ถูกปิด/ค้างในโค้ด
- `view-travel`, modal ทริป, รายงานทริป, เมนู TRIPS, ล็อกอินเพื่อนร่วมทริป — ถูกเอาออก v271 (สำเนาใน `archive/trip-frontend-v271`) แต่ **ฟังก์ชันทริปใน app.js (บรรทัด ~11330–15220: `TravelState`, `loadTrips`, `renderTripsView`, `closeTrip`, `scanSlipWithAI`…) ยังอยู่ แต่ไม่มีทางเรียก**
- `#view-grid-input` + `#grid-input-actions` ยังอยู่ใน HTML แต่ `switchView` ส่งไป pending
- `#settings-projects` (แท็บโปรเจกต์) มี section แต่ไม่มีปุ่มแท็บ

---

## โมดูล JavaScript หลัก

### รูปแบบโค้ด
- ไฟล์เดียว `app.js` ผสม 2 สไตล์: (1) **ฟังก์ชัน global แบบเดิม** (~400 ฟังก์ชัน เช่น `loadPending`, `renderPendingTransactions`, `dv2*` สำหรับ dashboard) และ (2) **โมดูล IIFE** `const X = (() => { ...; return {...}; })(); window.X = X;` สำหรับฟีเจอร์ใหม่ (2026-10 ขึ้นไป) — HTML เรียกผ่าน `onclick="X.fn()"` จึงต้องผูก `window.X`
- เกือบทุกโมดูลประกาศ helper ซ้ำของตัวเอง: `esc()` (escape HTML), `fm()` (ตัวเลข 2 ตำแหน่ง ติดลบเป็นวงเล็บ), `r2()` (ปัด 2 ตำแหน่ง), `dTh()` (วันที่ไทย พ.ศ. 2 หลัก), `clean()` (ตัดรหัส `[XXX] ` หน้าชื่อ)
- HTML สร้างด้วย template string แล้วใส่ `innerHTML` ทั้งก้อน · ใช้ `MutationObserver` หลายจุดเพื่อ "แต่ง" DOM หลังโค้ดเดิมวาด (StHome, PendCardA, PendHeroPhone, ปุ่มนำเข้า)

### API และการยืนยันตัวตน
- **`API_BASE`** (IIFE): ค่าปกติ `https://record-revenue.9nimz.workers.dev` · เปิดจาก `localhost/127.0.0.1` → `http://localhost:8787` (`wrangler dev`) อัตโนมัติ · `?api=<url>` override จำใน `sessionStorage['api_base_override']` (เฉพาะแท็บนั้น กันค้างไปโดนของจริง)
- **ไม่มีฟังก์ชัน `api()` กลาง** — ทุกที่เรียก `fetch(\`${API_BASE}/api/...\`)` ตรง ๆ (ส่วนใหญ่ใส่ header `x-user-id: encodeURIComponent(getUserIdHeader())`; โมดูลใหม่บางตัวไม่ใส่)
- **ตัวห่อ `window.fetch` (`attachTokenToApiCalls`)** ทำงานกับทุกคำขอที่ขึ้นต้นด้วย `API_BASE` เท่านั้น (ไม่ส่ง token ไปโดเมนอื่น เช่น CDN):
  - เติม `Authorization: Bearer <token>` (token จาก `localStorage['session_token']` สำรอง sessionStorage) — เหตุผล: มีจุดเรียก fetch กับ `x-user-id` 71 จุด แก้ทีละจุดเสี่ยงตกหล่น · `x-user-id` ยังส่งช่วงเปลี่ยนผ่าน
  - POST/PUT ไปยัง `/api/(settings|users|contacts|projects|categories|entities|restore|reset)` → ล้างแคช `mdcache:*`
  - **timeout ด้วย AbortController**: 180 วินาทีสำหรับ `ocr|backup|restore|bulk-import|upload|statement` · 45 วินาทีสำหรับที่เหลือ → toast "เซิร์ฟเวอร์ตอบช้าเกินไป"
  - **503** → toast "ฐานข้อมูลไม่พร้อมชั่วคราว" (ไม่ซ้ำภายใน 15 วินาที)
  - **401** (ยกเว้น login/logout) → กดปุ่ม logout ให้ + toast "หมดเวลาการเข้าใช้งาน" ครั้งเดียวต่อการโหลด (เคสจริง 2026-10-08: token 30 วันหมด หน้าตั้งค่าว่างเหมือนข้อมูลหาย)
- `getUserIdHeader()`: `AppState.userId` → `localStorage['current_user_id']` → **fallback `'Puii'`** (ควรเอาออกถ้าสร้างใหม่)
- **ตัววัดความเร็ว (`perfProbe`)**: `?perf=1` เปิด (จำใน localStorage `rr_perf`), `?perf=0` ปิด → กล่องมุมซ้ายล่าง: เวลาตอบของทุก `/api/` (สีตาม >600/>1500ms), ขนาด KB, จำนวนครั้งที่หน้าค้าง >200ms (ตัวจับเวลาทุก 100ms) · ใช้เทียบ Safari กับเบราว์เซอร์อื่น
- `showToast(message, type)`: success เขียว / error แดง / info น้ำเงิน · จอ ≤992px ยกขึ้น 90px เหนือเมนูล่าง · หาย 3 วินาที

### สถานะกลาง
- **`AppState`**: `userId, userName, userRole ('admin'|'member'), familyId, allowedEntities, categories, captions, contacts, projects, accounts, entities, debts, settingsViewMode, settings{entities,contacts,captions,categories,debts,projects,accounts,users}, pendingTransactions` + ฟิลด์ที่เพิ่มทีหลังแบบไดนามิก: `activeView, pendingSlipFilter, pendingGroupMode, pendingGroupKey, _pendingRenderToken, _pendingRenderRest, _pendingIO, _pendingAt, _createNewAfterLoad, _openXlsMenu, accTxEntity`
- **`fetchMasterData()`**: ดึงพร้อมกัน `/api/account-types` (captions), `/api/categories`, `/api/contacts`, `/api/projects`, `/api/entities` (**แคช sessionStorage 10 นาที**, คีย์ `mdcache:<url>`) และ `/api/accounts` (**ไม่แคช** เพราะยอดเปลี่ยนทุกครั้งที่ยืนยัน) → เติม dropdown ตัวกรองหน้าประวัติ → `updatePendingBadge()` (`/api/transactions?status=PENDING_REVIEW&count=1` นับอย่างเดียว)
- **`DashState`**: สถานะหน้าภาพรวม (month, year, period, range, member, data, openWht, openPlanIdx, selPlanDay, ownerColor, planMonths, pendingCount)

### โมดูล/กลุ่มฟังก์ชันสำคัญ
| ชื่อ | ประมาณบรรทัด | หน้าที่ |
|---|---|---|
| `ICON_SETS`, `switchIconTab`, `renderIconGrid` | 2–80 | ชุดไอคอนรูปภาพสำหรับโปรไฟล์หนี้ |
| `formatCurrency`, `formatStatementAmountInput`, `formatNumberWithCommas`, `parseAmountInput` | 228–270 | รูปแบบตัวเลข: ลบ = `(1,234.00)` · `parseAmountInput` รับ `(x)` และ `-x` ตัด comma |
| `applyTheme`, `initTheme`, `bindSettingsTheme` | 300–335 | ธีม |
| `getRowPayload`, `FLAT_COLUMNS`, `fetchFlatData`, `bindFlatExport` | 366–560 | payload แถวกริดเดิม + ส่งออก flat |
| `DB_SCHEMA`, `BACKUP_SHEET_MAP`, `runFullBackup`, `bindBackupRestore`, `downloadTemplate2Sheet`, `downloadTemplateFlat` | 628–1140 | สำรอง/กู้คืน/แม่แบบ |
| `initApp`, `bindNavigation`, `switchView`, `fitSettingsHeight`, `fetchMasterData`, `updatePendingBadge` | 1146–1565 | เริ่มแอป/ล็อกอิน/นำทาง |
| `DashState` + `dv2*` (~70 ฟังก์ชัน), `dv2Render`, `dv2RenderPhone`, `loadDashboard` | 1567–2665 | หน้าภาพรวม + แผนรายจ่าย + งบ + WHT + zoom รายการ |
| `renderPendingHero`, `autofillFromHistory`, `bulkCategorize`, `bulkSaveReady` | 2308–2480 | ส่วนหัวรอตรวจ + ทำหลายรายการ |
| `autoSaveCard`, `updateCardSum`, `updateCardStyle`, `addInlineSubRow`, `getCardPayload`, `createNewPendingCard`, `isEmptyDraftCard`, `draftSaved`, `loadPending`, `renderPendingTransactions`, `removePendingCardLocal` | 2754–3685 | การ์ดรอตรวจ |
| `renderSharedStatusSummary`, `bankCheckHtml`, `recordBankBalance`, `reconcileAccount` | 3694–3830, 7481–7590 | Balance Check |
| `loadHistory`, `openTransactionModalFromHistory`, `renderHistoryDetail` | 3895–4490 | ประวัติ (ส่วนเดิม) |
| `loadGridInput`, `createGridCard`, `saveGridCard`… | 4539–5360 | กริดเดิม (รวมเข้ารอตรวจแล้ว) |
| `loadReports`, `runWhtReport`, `runTrialBalanceReport`, `runProjectReport` | 5409–5580 | รายงานเดิม |
| `openTransactionModal`, `addSplitRow`, `validateSplitSums`, `openSettlementModal` | 5584–5970 | `#tx-modal` / ตัดชำระหนี้ |
| `loadSettings`, `renderSettingsTabs`, `openSettingModal`, `saveSettingItem`, `deleteSettingItem`, `openUserModal`, `saveUserItem`, `resetData` | 5972–8185 | ตั้งค่า |
| **`UserForm`** | 6839 | ฟอร์มสมาชิก v273: `renderEnts` (การ์ด Company แยกส่วนตัว/ธุรกิจ), `count`, `role`, `filter`, `all`, `lineSt`, `after` |
| `detectStatementIssuer`, `parseTextStatement`, `parseCardStatement`, `importCardStatement`, `openStatementPdf`, `statementPrecheck`, `importStatementRows`, `batchImportStatements`, `bindPDFUpload`, `uploadSlipFiles`, `payeeKey`, `statementKey` | 7124–8150 | นำเข้า statement/สลิป · `statementKey()` = ข้อความรายการที่ทำให้เป็นมาตรฐาน · `payeeKey()` = ชื่อผู้รับไม่ขึ้นกับธนาคาร (มี `PAYEE_DROP` ตัดชื่อธนาคาร) |
| `initResizableColumns`, `initDraggableColumns`, `saveColumnOrder` | 8185–8430 | ปรับ/ลากคอลัมน์ จำใน localStorage |
| `exportSettingExcel`, `importSettingExcel`, `parseExcelFileToPending`, `bulkImportExcelFile` | 8428–9370 | Excel |
| **`OB`** | 9380 | ยอดยกมา |
| **`LineSlips`** | 9632 | สลิป LINE ที่ต้องช่วยเลือก |
| `showSlip` | 9701 | เปิดดูรูปสลิป (ไฟล์ต้องแนบ token → ดึงเป็น blob) |
| **`DebtorView`**, **`DebtUI`** | 9720, 9793 | ลูกหนี้/เจ้าหนี้ + หนี้สินที่ติดตาม |
| **`FamView`** | 9902 | ครอบครัว & ธุรกิจ |
| **`HistUI`**, `renderHistoryKpis`, `exportHistoryShown` | 9948–10055 | หน้าประวัติแบบใหม่ |
| **`CardsView`**, **`AssetsView`**, **`InsView`** | 10057, 10232, 10537 | บัตร&เงินกู้ · ทรัพย์สิน · ประกัน (`open()` ครั้งเดียวด้วยธง `started`) |
| `fetchDebts`, `renderDebtsSettings`, `debtCatsBy`, `debtFillDropdowns`, `showDebtModal`, `saveDebtProfile`, `renderDebtsDashboard`, `viewDebtDetails` | 10672–11330 | ทะเบียนหนี้ |
| `TravelState` + ฟังก์ชันทริป | 11330–15220 | โค้ดตาย (ระบบทริปปิด) |
| **`StmtReport`** | 15224 | รายงานยอดสะสม statement + Excel/PDF |
| **`SlipReview`**, **`SlipThumbs`** | 15497, 15672 | ตรวจสลิปทีละใบ · รูปย่อ lazy (IntersectionObserver rootMargin 200px, แคช Map) |
| **`RevenueChart`** | 15693 | ผังรายได้ BKP |
| **`DupPairs`**, **`TransferPairs`** | 15795, 15842 | คู่ซ้ำ · คู่โอน (`load/decorate/applyAll/openFor/of/count/list`) |
| **`AccDefaults`** | 15931 | `load()` → `/api/accounts/tx-defaults` · `of(accId)` = Company เริ่มต้นของบัญชี |
| **`PendGroups`** | 15941 | โหมดจัดกลุ่มผู้รับ/ร้าน (`keyOf`, `sizes`, `panel`) |
| **`AutoRules`** | 16019 | กฎอัตโนมัติ |
| **`SlipQueue`** | 16071 | อัปรูปไว้ก่อน อ่านทีหลัง |
| Tab handler, `applyRowValues`, `stmtDetailNote` | 16121–16145 | Tab ในการ์ด, ตัดข้อความ statement เป็น Detail |
| **`DateType`** | 16149 | ทุก `input[type=date]` → ช่องพิมพ์ `วว/ดด/ปปปป` ต่อเนื่อง (ใส่ `/` ให้เอง, รับปี พ.ศ., 6 หลัก = ปี 2 หลัก) + ปุ่ม 📅 เปิดปฏิทินเดิม · ช่องเดิมยังอยู่ (ซ่อน) ค่า `YYYY-MM-DD` เหมือนเดิม (override `value` descriptor) |
| **`AccView`** | 16213 | การ์ดบัญชีหน้าแรก + หน้ารายละเอียดบัญชี (`home/open/edit/excel/pdf`) |
| ป้ายเวอร์ชัน `appVersionBadge` | 16465 | `#app-ver` |
| **`RepHome`** | 16496 | หน้ารายงานแบบ ข. (`load/render/select/exp/shift/period/pq/pAll/pOpen`) |
| **`DriveStore`**, **`DriveView`** | 16698, 16782 | Google Drive (ผ่าน Apps Script ฝั่งเซิร์ฟเวอร์) |
| **`Similar`** | 16829 | รายการใกล้เคียง/ประวัติผู้รับเดียวกัน (`fetch`, `applyToCard`, `watchCard`) แคช Map · `/api/transactions/similar` |
| **`WePay`** | 16972 | นำเข้า wePAY จากรูป |
| **`TripPurge`** | 17060 | ล้างข้อมูลทริป (`check`, `run`) |
| **`LineQR`** | 17096 | QR บอท LINE |
| **`StHome`** | 17120 | ตั้งค่ามือถือแบบ ข (`enter/render/open/back/decorate`) |
| **`PendReview`** | 17208 | รอตรวจมือถือทีละรายการ (`mount/render/mode/set/setContact/addSplit/delSplit/openSplit/showMore/useSim/next/reset/del/save`) |
| **`PendCardA`** | 17401 | การ์ดแบบ ก มือถือ (`scan`, `sync`) |
| **`PendHeroPhone()`** | 17437 | ส่วนหัวรอตรวจมือถือ |
| focusin zero-clear | 17455–17466 | ดูหัวข้อมือถือ |

### คีย์ localStorage/sessionStorage ที่ใช้ (ควรรวบรวมเป็นที่เดียวถ้าสร้างใหม่)
`session_token`, `logged_in_user`, `current_user_id`, `app-theme2`, `rr_perf`, `rr_last_import`, `rr_bk_open`, `rr_trf_no`, `rr_pend_mode_v276`, `rr_rv_use_v276`, `rr_rep_view_v271`, `rr_backup_schedule`, `rr_cofix_v256`, `unified-trip-last` (เก่า) · sessionStorage: `mdcache:*`, `api_base_override`, `rr_dnfix`, `rr_wpfix`, `rr_classic`

---

## ระบบออกแบบ (Design system)

### ที่มา
- หน้าตาแบบ A "ม่วงนุ่ม" (ค่าเริ่มต้นตั้งแต่ 2026-10-15) และแบบ C "โหมดมืด" — North เลือกจาก mockup งาน 001–006 · หน้าใหม่ ๆ ออกแบบจาก mockup ที่ North เลือกทีละหน้า (ก./ข./ค.)
- ฟอนต์: ui-a.css ตั้ง `body.ui-a { font-family: 'Anuphan','Noto Sans Thai' }` แต่ `font-mali.css` (โหลดทีหลัง) บังคับ **Mali** ทั้งแอปตั้งแต่ 2026-10-31 · PDF รายงานใช้ Sarabun · หน้า cards/assets เดิมใช้ Anuphan

### Token สี (ui-a.css)
| token | purple (สว่าง) | dark |
|---|---|---|
| `--primary-color` / `-light` / `-dark` | `#5F3DC4` / `#7950F2` / `#4C2FA8` | `#7C5CFF` / `#9B82FF` / `#B9A8FF` |
| `--success-color` | `#087F5B` | `#2FD07A` |
| `--danger-color` | `#C92A2A` | `#FF5C5C` |
| `--warning-color` | `#F59F00` | `#FFB020` |
| `--background-color` | `#F4F1FC` | `#0E1016` |
| `--bg-gradient` | `165deg #F7F4FF→#EFEAFD→#F5F2FF` | `#0E1016→#121522` |
| `--card-bg` / `--border-color` | `#FFFFFF` / `#E9E3FA` | `#171A24` / `#262B3A` |
| `--text-primary` / `--text-secondary` | `#1E1B2E` / `#5C5872` | `#E9ECF4` / `#9AA3B6` |
| `--dv-hero` | `135deg #5F3DC4→#7950F2→#9775FA` | `#2A2F45→#1C2031` |
| `--dv-pos` / `--dv-neg` | `#087F5B` / `#C92A2A` | `#2FD07A` / `#FF5C5C` |
| `--dv-chipbg` / `--dv-chipon` | `#F1EDFE` / `#6D4AE0` | `#202536` / `#3B4566` |
| `--dv-r` (มุมการ์ด) | `18px` | `18px` |
| `--ui-side` (เมนูซ้าย) | gradient `#5F3DC4→#7950F2` | `#12141C` |
| `--ui-mute` / `--ui-mute2` (ข้อความรอง, v271) | `#5C5872` / `#6E6888` | `#B3ADCB` / `#9A94B3` |
- dark ตั้ง `color-scheme: dark`
- mobile.css มีชุด token ของตัวเอง: `--mp:#6741D9` (ม่วงหลัก) `--mpl:#F3F0FF` `--mb:#E5DBFF` (เส้นขอบ) `--mt:#1E1B2E` (ตัวอักษร) `--mm:#5C5872` (ตัวรอง) `--mcard:#fff` `--mbg2:#FAF8FF` + ชุดมืดใต้ `body[data-theme="dark"]`
- สีความหมาย: `.neg` `#C92A2A` (มืด `#FF8787`) · `.pos` `#087F5B` (มืด `#63E6BE`) · `.warn` `#D9480F`
- ชุดสีกราฟ: dashboard `DV2_PAL = ['#7950F2','#20C997','#FF922B','#4DABF7','#F06595','#ADB5BD']` · รายงานรายจ่าย `#FA5252,#FF922B,#FCC419,#7950F2,#339AF0,#40C057,#ADB5BD` · รายรับ `#40C057,#339AF0,#FCC419,...` · avatar สมาชิก `#7950F2,#E64980,#1C7ED6,#0CA678,#F76707,#AE3EC9`
- ไอคอน KPI: กล่องสี่เหลี่ยมมุมมน (`.dv2-kic`) พื้นสีโปร่ง 12–15% ของสีหลัก เช่น `rgba(240,82,82,.12)`/`#E03131`

### กฎอ่านง่าย (v271 + v278)
- ตัวหนังสือเล็กสุด **14px** บนจอใหญ่ (font-mali.css) · มือถือขั้นต่ำ **13–13.5px**
- ข้อความรองต้องใช้ `var(--ui-mute)` แทน `#868E96` (คอนทราสต์บนพื้นขาวแค่ 3.3:1) — แทนไปแล้ว 38 จุด
- สีจางใน `style=""` ปรับให้เข้มขึ้น · ช่องกรอกสูง ≥40px
- ตัวเลขเงินใช้ `font-variant-numeric: tabular-nums`, `white-space: nowrap` · ลบแสดงในวงเล็บ (ไม่ใส่ + หน้าตัวเลขบวก — North 2026-10-30) · ปีแสดงเป็น พ.ศ.
- ตรวจด้วยสคริปต์วัดขนาด/คอนทราสต์ 3 ขนาดจอ (สว่าง: ตัวเล็ก 3,841→~13 จุด, สีจาง 287→~3)

### คอมโพเนนต์
- **การ์ด**: `.glass` (ในธีม ui-a = พื้น `--card-bg` ไม่เบลอ, ขอบ 1px `--border-color`, เงา `0 6px 18px rgba(95,61,196,.05)`) · `.dv2-card`, `.dv2-sec` + grid `.dv2-g1/g2/g3` (≤900px เหลือ 1 คอลัมน์) · `.dv2-kpis` (4 → 2 คอลัมน์ ≤900px)
- **ชิป**: `.dv2-chip`, `.pr-chip` (pill มุม 999px, ขอบ 1.5px, `.on` = ขอบม่วง + พื้น `--mpl`), `.ph-slipf` (ตัวกรอง) · ปุ่มช่วงเวลา `.rb-per`
- **การ์ดรายการรอตรวจ** `.tx-card` → `.tx-card-header` + `.sub-row-item` (`.sub-row-grid`) + `.tx-card-footer` · desktop grid v270: `92px · Company .65fr · Customer .55fr · Category 1fr · Amount minmax(150px,.75fr) · 84 · 92 · 84` · ช่องย่อย 15px สูง 34px · label 12px · หัวการ์ด 16px ยอด 17px · วันที่หัวการ์ดกว้าง 150px
- **โดนัท**: SVG วาดเอง (`circle` + `stroke-dasharray`, r=52, stroke 20) พร้อมยอดรวมตรงกลาง (RepHome) และ `dv2Donut`
- **Modal**: `.modal > .modal-content(.glass/.modal-sm) > .modal-header/.modal-body/.modal-footer` ปิดด้วย `.close-modal` · บนมือถือกลายเป็น **bottom sheet** (ดูหัวข้อมือถือ) · `#more-sheet` และ `#theme-pop` เป็นแผ่นจากล่างเสมอ (มุมบน 22px, padding ล่าง + safe-area)
- **กล่องยืนยัน/ฟอร์มสั้น**: SweetAlert2 (`Swal.fire` พร้อม `html`, `preConfirm`, `showValidationMessage`) · ที่เก่ากว่าใช้ `alert/confirm/prompt` ตรง ๆ
- **Toast**: `showToast` (สร้าง div fixed ล่างจอ)
- **การ์ดตั้งค่ามือถือ**: `.st-lst` / `.st-row` (ไอคอนกล่องสี 36px + ชื่อ + คำอธิบาย + จำนวน + `›`)
- **`<details class="mh-acc">`**: หัวข้อพับได้บนมือถือ (ซ่อน marker, ลูกศร `›` หมุน 90°)
- **Responsive tiers** (ui-a.css): คอม (>1180px เมนูซ้ายเต็ม) · **iPad 769–1180px** เมนูซ้ายเหลือไอคอน กว้าง 84px (ซ่อนข้อความ/QR/ธีม/badge, ซ่อนเมนูล่าง) · **มือถือ ≤768px** ซ่อนเมนูซ้าย ใช้เมนูล่าง grid 5 ช่อง สูง 64px ปุ่ม "เพิ่ม" เป็นวงกลม 40px ลอยขึ้น −14px

---

## รองรับมือถือ (iPhone/iPad)

### Breakpoint
- **`isPhone() = matchMedia('(max-width:768px)').matches`** — ตัวตัดสินหลักทั้ง JS และ CSS (`mobile.css` เกือบทุกกฎอยู่ใน `@media (max-width:768px)`; PC/iPad ไม่กระทบ)
- iPad = 769–1180px (เมนูไอคอน) · บางจุดใช้ 992px (แสดงเมนูล่าง/ตำแหน่ง toast), 900/899px (รายงาน), 760px/600px/560px/420px/380px สำหรับ grid ย่อย
- JS ฟัง `matchMedia('(max-width:768px)').change` เพื่อวาดใหม่เมื่อหมุนจอ/ย่อหน้าต่าง: ภาพรวม (`dv2Render`, `AccView.home`, `FamView.load`) และรอตรวจ (`PendReview.mount`, `PendCardA.scan`, `PendHeroPhone`)
- หน้ามือถือที่ทำแยก (v276): ภาพรวมแบบ ก (`dv2RenderPhone`) · ตั้งค่าแบบ ข (`StHome`) · รอตรวจแบบ ข (`PendReview` + `PendCardA` + `PendHeroPhone`) · บนมือถือซ่อน `.top-header` ในหน้า dashboard/settings/pending (หน้ามีหัวของตัวเอง)

### กฎที่ต้องคงไว้
1. **ช่องกรอกทุกช่อง font-size 16px บนมือถือ** — iPhone ซูมเองเมื่อแตะช่อง <16px · ครอบคลุม `.content-view input/select/textarea`, `.modal`, `#more-sheet`, `#theme-pop`, การ์ดรอตรวจ (ต้องใช้ selector `#view-pending #pending-cards-container .tx-card ...` เพื่อชนะกฎ v270 ที่ตั้ง 15px)
2. **ขนาดเป้าแตะ**: ปุ่มทั่วไป ≥40px (`min-height:40px`), ปุ่มหลัก 44–52px (`.pr-btns button` 52px, `.pr-modes` 44px, ปุ่มปิด modal 44×44), ไอคอนปฏิทินในช่องวันที่ 36px
3. **ห้ามหน้าเลื่อนซ้าย-ขวา (v277)**: `html, body { overflow-x:hidden; overscroll-behavior-x:none }` · `.workspace, .main-content, .content-view { max-width:100vw; min-width:0; overflow-x:clip }` · ลูกทุกชั้น `max-width:100%; min-width:0; box-sizing:border-box` · `img/canvas/svg max-width:100%` · ตารางกว้างเลื่อนในกรอบตัวเอง (`.table-responsive { overflow-x:auto; overscroll-behavior-x:contain }`)
4. **flex/grid ลูกต้องมี `min-width:0`** — บทเรียน v279: `.mh-accb` เป็น flex column ลูกไม่มี min-width:0 → การ์ดครอบครัวกว้างตามข้อความยาว ล้นจอ (และ v277 ตัดส่วนเกินทิ้ง) · แก้: ทุกชั้นใน `#fam-home` min-width:0, ข้อความ `overflow-wrap:anywhere`, `white-space:normal`
5. **หน้าที่ล็อกความสูงต้องเลื่อนได้**: `#view-history, #view-debtor, #view-cards, #view-assets, #view-insurance, #view-reports, #view-account { height:auto; overflow:visible }` · ประวัติเดิมตั้ง `height: calc(100vh - 85px)` และ inner `overflow-y:auto` → บนมือถือปลดออกหมด · หน้าตั้งค่าไม่ล็อก `.main-content` บนมือถือ (v274)
6. **เว้นที่ท้ายหน้าให้เมนูล่าง (v279)**: `.main-content { padding-bottom: calc(110px + env(safe-area-inset-bottom)); scroll-padding-bottom: เท่ากัน }` · ป้ายเวอร์ชันยกขึ้น `calc(86px + safe-area)` · toast ยก 90px
7. **safe-area**: เมนูล่าง `padding-bottom: env(safe-area-inset-bottom)` · แผ่นล่างทุกตัว padding ล่าง + safe-area · footer ของ modal sticky ชดเชย safe-area
8. **Modal → bottom sheet (v277)**: `.modal:not(.hidden)` จัดชิดล่าง, `z-index:5000` (เหนือเมนูล่าง — เดิมเมนูล่างบังปุ่มบันทึก) · `.modal-content` กว้าง 100%, สูงไม่เกิน `100dvh - 10px`, เลื่อนในตัว (`-webkit-overflow-scrolling:touch; overscroll-behavior:contain`), มุมบน 22px · **หัว modal และ footer (ปุ่มบันทึก) sticky** · label ใน modal ไม่เป็นตัวพิมพ์ใหญ่ทั้งหมด, ช่องไม่เป็นสีเทา
9. **ตารางตั้งค่า → การ์ด** บนมือถือ (StHome.decorate + CSS: `thead` ซ่อน, `tr` เป็น grid 2 คอลัมน์, `td[data-label]::before` แสดงชื่อคอลัมน์)
10. **PDF/ป๊อปอัปบน iPhone**: เปิด `window.open('', '_blank')` **ทันทีในจังหวะกด** แล้วค่อยเขียนเนื้อหา ไม่งั้น Safari บล็อก

### พฤติกรรมช่องตัวเลข (zero-clearing, v278)
- North: "พิมพ์ตัวเลขแล้วมี 0 แสดงเพิ่มมา" (ช่องเริ่มเป็น `0.00` แตะแล้วพิมพ์ตัวเลขต่อท้าย)
- ตัวจัดการ `focusin` ระดับ document สำหรับ `.input-stmt-amount, .input-amount, .input-fee, .input-wht, .grid-tx-amount, .grid-fee, .grid-wht, .pr-f input[inputmode="decimal"]`:
  - ค่าเป็น 0 → **ล้างให้ว่าง**
  - มีตัวเลข → **เลือกข้อความทั้งหมด** (ตั้ง `_selAll`) และใน `mouseup`/`touchend` แรก (capture) คงการเลือกไว้ (กันเบราว์เซอร์ย้ายเคอร์เซอร์ไปจุดที่แตะ) — แบบเดียวกับช่องวันที่ v255
- ช่องเงินใช้ `type="text" inputmode="decimal"` (ไม่ใช่ `type=number`) + `onfocus` แปลงเป็นตัวเลขดิบ (`parseFormattedNum`) / `onblur` ใส่ comma
- ทดสอบ: 250 → 250.00 · ค่าธรรมเนียม 15 → 15.00 · พิมพ์ทับ 300 → 300.00

### อื่น ๆ บนมือถือ
- `.pr-modes` และแถบ "‹ ตั้งค่า" เป็น sticky top
- แถบเครื่องมือรอตรวจเลื่อนแนวนอนได้ ซ่อน scrollbar (`scrollbar-width:none`)
- รายงาน: เมนูซ้ายกลายเป็นแถบเลื่อนบน (<900px) · ตัวกรองยอดสะสม statement วางวันที่เริ่ม–ถึงคู่กัน
- ผลตรวจ v278: สคริปต์ตรวจ 29 หน้า/หน้าต่าง ที่ 390 และ 375px (ล้นจอ · ปุ่ม <34px · ช่องกรอก <16px · ตัวหนังสือ <13px) — เหลือปุ่มเล็ก 1–2 จุดที่ยอมรับได้
- ทดสอบมือถือจริงด้วย Playwright ที่ 390px (เช่น v276: แยก 2 ส่วน 292.04 + 292.05 = 584.09 บันทึก POST+confirm ถูก, จำนวน 200→199)

---

## การตรวจก่อน deploy

`deploy.sh` รันตามลำดับและหยุดทันทีเมื่อขั้นใดล้ม (`set -e`): ① `node check-frontend.mjs` ② `node check-frontend-runtime.mjs` ③ `bash setup-db.sh` ④ `npx wrangler deploy` (Worker) ⑤ `npx wrangler pages deploy frontend --project-name record-revenue-web` — เหตุผลที่ต้องตรวจหน้าเว็บก่อน: บั๊ก "เรียกฟังก์ชันที่ถูกลบไปแล้ว" ทำให้ทั้งแอปเข้าไม่ได้ และเทสฝั่งเซิร์ฟเวอร์จับไม่ได้ (เคยหลุดขึ้น production จริง) · กติกา: ก่อนบอกว่า "เสร็จ" ต้องรันทั้งสองไฟล์ + เทส backend ให้ผ่าน แล้ว North รัน `deploy.sh` เอง

### `check-frontend.mjs` (ตรวจแบบอ่านโค้ด, ไม่ต้องรัน)
เขียนใหม่ v271 (เดิมตรวจแค่หน้าทริป ไม่เคยตรวจแอปหลัก):
1. **syntax** ของทุกสคริปต์ในเครื่องที่ index.html อ้าง (`new vm.Script(src)`)
2. **ฟังก์ชันที่ถูกเรียกแต่ไม่มีการประกาศ** — จับชื่อที่ขึ้นต้นด้วย `render|paint|open|sync|load|apply|build|refresh|update|show|close` + ตัวพิมพ์ใหญ่ แล้วเทียบกับชื่อที่ประกาศ (`function x`, `const/let/var x =`, `window.x =`, destructuring) ยกเว้นที่มี guard `typeof x === 'function'`
3. **`onclick/oninput/onchange/...` ใน HTML เรียกชื่อที่ไม่มี** (ตัด string ออกก่อน, มีรายการ built-in เช่น `Swal`, `XLSX`, `alert`)
4. **ไฟล์ที่ index.html อ้าง** (`src/href` .js/.css/.png/.svg/.jpg/.webp/.ico/.json) ต้องมีอยู่จริง
5. **ปีกกา CSS ครบ** ทุกไฟล์ `.css` (ตัด comment และ string ก่อนนับ `{` `}`) — ปีกกาขาดทำให้กฎท้ายไฟล์หายทั้งบล็อก
- ผิดข้อใด → exit 1 พร้อมรายการ ❌

### `check-frontend-runtime.mjs` (รันจริงใน jsdom)
- โหลด `index.html` (ตัด `<script src>` ออก) ใน JSDOM (`runScripts:'dangerously'`, `pretendToBeVisual`)
- ใส่ตัวหลอก: `matchMedia` (matches=false = โหมด desktop), `scrollTo`, `alert/confirm/prompt`, `scrollIntoView`, canvas `getContext`, `IntersectionObserver`, `ResizeObserver`, `Swal`, `Chart`, `XLSX`, `pdfjsLib`, `PDFLib`
- `fetch` หลอกคืน `{ok:true}` + JSON ว่างที่มีทุกคีย์เป็น array ว่าง (`results, data, accounts, entities, ...`) — ไม่ยิงเน็ตจริง
- ใส่สคริปต์ในเครื่องตามลำดับใน index.html (travel.js → app.js) → ยิง `DOMContentLoaded` → รอ 400ms → ต้องไม่มี error/unhandledrejection (ข้าม "Could not parse CSS" / "Not implemented")
- แล้ว **`switchView()` ทุก section `view-*`** ทีละหน้า รอ 150ms ต้องไม่มี error ใหม่
- ⚠️ ข้อจำกัดที่ระบุไว้ในไฟล์: jsdom ไม่มี layout — ผ่านตรงนี้ไม่ได้แปลว่าหน้าตาบนมือถือถูก (ต้องทดสอบด้วย Playwright/สคริปต์วัดแยก) · `matchMedia` หลอกเป็น false จึง **ไม่ได้รันเส้นทางมือถือ** (`dv2RenderPhone`, `PendReview`, `StHome`)
- จุดที่สคริปต์ทั้งสอง **จับไม่ได้**: comment `//` ท้ายบรรทัดที่ไปปิดโค้ดส่วนที่เหลือ (syntax ยังถูก) — ดูบทเรียนด้านล่าง

---

## ข้อแนะนำถ้าสร้างใหม่

### โครงสร้างโค้ด
1. **แตก `app.js` (17,466 บรรทัด, 1.3MB, ~400 ฟังก์ชัน global + ~40 โมดูล IIFE) เป็นไฟล์ตามหน้าจอ/ฟีเจอร์** ด้วย ES modules (`<script type="module">`) — คอมเมนต์ในโค้ดเองระบุชื่อไฟล์เดิมไว้แล้ว (`// opening_balance.js`, `// line_slips.js`, `// debtor_view.js`, `// slip_review.js`, `// revenue_chart.js`, `// dup_pairs.js` ...) ใช้เป็นแนวแบ่งได้ · ตอนนี้ทุกอย่างโหลดแม้ไม่ได้ใช้ และโค้ดทริป ~3,900 บรรทัดเป็นโค้ดตาย
2. **ทำ API client กลางตัวเดียว** (`api.get/post` ที่ใส่ Bearer token, timeout, จัดการ 401/503, parse JSON, โยน error มาตรฐาน) แทนการเรียก `fetch` ตรง ๆ หลายร้อยจุดที่ใส่ header ไม่เท่ากัน · เลิกส่ง `x-user-id` และเลิก fallback `'Puii'` ใน `getUserIdHeader()`
3. **รวม helper ที่ซ้ำ** (`esc`, `fm`, `r2`, `dTh`, `clean`, `signed`) เป็นโมดูล util เดียว — ตอนนี้แต่ละโมดูลประกาศซ้ำ ทำให้รูปแบบตัวเลข/วันที่เพี้ยนกันได้
4. **แยก state ต่อหน้า + render จาก state** แทนการอ่านค่าจาก DOM (`getCardPayload` อ่าน select ในการ์ด) และแทนการ "แต่ง DOM ทีหลัง" ด้วย MutationObserver (StHome, PendCardA, PendHeroPhone, สะท้อนปุ่มเดิม) ที่ต้องมีลายเซ็นกันวาดวน
5. **ออกแบบมือถือเป็นคอมโพเนนต์ตั้งแต่แรก** แทนการซ่อนของเดิมด้วย `!important` (mobile.css เกือบทุกบรรทัดใช้ `!important` เพื่อชนะ inline style)
6. **เลิก inline style ใน HTML** — `index.html` มี `style="..."` ยาวมาก (เช่น `.top-header style="display:flex"` ทำให้กฎซ่อนหัวใน ui-a.css ไม่เคยทำงาน — บันทึกใน v271) · ใช้ class + token
7. **ใช้ Swal/ไลบรารีชุดเดียวสำหรับยืนยัน** แทน `alert/confirm/prompt` ปนกัน
8. รวมคีย์ localStorage ทั้งหมดไว้ที่เดียวพร้อมเวอร์ชัน (ตอนนี้กระจัดกระจาย เช่น `_v276`, `_v271`)

### กติกา UX ที่ North ตัดสินใจแล้ว (ต้องคงไว้)
- **กฎการ์ดร่าง (empty-draft rule)**: "+ เพิ่ม" ต้องไม่สร้างรายการบนเซิร์ฟเวอร์จนกว่าจะมีข้อมูลจริง (ยอด ≠ 0) · ร่างว่างหายเองเมื่อออก/รีเฟรช
- **ตัวกรองหน้าแรกเป็น "สมาชิก"** ไม่ใช่ Company · คำว่า "Owner/Entity" ในหน้าจอให้เรียก **"Company"** · Contacts เรียก **"Customer"** · Accounts ในตั้งค่าเรียก **"Statement"**
- หน้าแรกเปิดที่ **เดือนล่าสุดที่มีข้อมูล** ไม่ใช่เดือนปัจจุบัน
- ลิงก์จาก LINE (`?txId=`) เปิดหน้ารอตรวจ
- ตัวเลขติดลบเป็นวงเล็บ ไม่มี + หน้าตัวเลขบวก · ปีแสดง พ.ศ.
- เติมหมวดอัตโนมัติต้อง "เติมให้ดู" แล้วให้คนกดบันทึกเอง (กรอบเขียว) ไม่บันทึกแทน
- ลบข้อมูลอันตรายต้องพิมพ์คำยืนยัน (เช่น `ลบทริป`) และดาวน์โหลดไฟล์สำรองก่อน
- หนี้: หมวดเงินต้นของเจ้าหนี้ = LIABILITY เท่านั้น · ดอกเบี้ย = EXPENSE

### ประสิทธิภาพ (บทเรียนจาก production)
- **รายการรอตรวจหลักพันใบ** (เคยถึง 1,969 ใบ = select หลายแสนตัว ทำให้ทุกหน้าช้าตาม) → ต้อง virtualize/วาดตามการเลื่อน ตั้งแต่แรก และทุกคำสั่ง "ทำทั้งหมด" ต้องทำงานกับข้อมูล ไม่ใช่กับ DOM ที่วาดแล้ว (ตอนนี้ต้องเรียก `_pendingRenderRest()` ให้วาดครบก่อน)
- โหลดไลบรารีหนัก (pdf.js, xlsx, chart.js) แบบ lazy เฉพาะตอนใช้ (ตอนนี้ defer แต่ยังโหลดทุกครั้ง)
- ข้อมูลหลักที่เปลี่ยนไม่บ่อยแคชได้ (ทำแล้ว 10 นาที) แต่ยอดบัญชีห้ามแคช · ใช้ endpoint นับอย่างเดียว (`count=1`) สำหรับ badge
- งานเสริมหลังโหลด (หาคู่ซ้ำ/คู่โอน) ไม่ควรบล็อกการวาดครั้งแรก
- ใช้ `?perf=1` วัด Safari โดยเฉพาะ (North: "บน Safari ช้ามาก")

### บทเรียนจากบั๊กจริง
- **ห้ามใส่ comment `//` ท้ายบรรทัดที่มีโค้ดต่อในบรรทัดเดียวกัน** (โดยเฉพาะใน template/โค้ดที่ถูกบีบเป็นบรรทัดเดียว) — v268: `//` ท้ายบรรทัดใน `rowCells` ไปปิดโค้ดที่เหลือ ทำให้คอลัมน์รายงานยอดสะสมเลื่อน 2 ช่อง และ check-frontend จับไม่ได้เพราะ syntax ยังถูก → ใช้ `/* */` หรือขึ้นบรรทัดใหม่ (โค้ดปัจจุบันใช้ `/* */` ท้ายบรรทัดเป็นส่วนใหญ่)
- **อ่านได้แล้วห้าม fallback ไป AI เงียบ ๆ** เมื่อขั้นถัดไป error (v269) — แสดง error ให้เห็น
- **ID ใน HTML ที่โค้ดอ้างต้องมีจริง** — v277: `openSettingModal` ตั้ง `#setting-default-type` ที่ไม่มีใน HTML → error ตอนแก้ Caption/Category · ควรมีเครื่องตรวจ `getElementById('x')` เทียบกับ id ใน HTML
- **401 ต้องพาไปหน้าล็อกอิน** ไม่ใช่แสดงหน้าว่าง (เคยทำให้เข้าใจว่าข้อมูลหาย)
- **ป้ายเวอร์ชัน + no-cache index.html** จำเป็น เพราะผู้ใช้เคยใช้ JS เก่าที่เบราว์เซอร์แคชไว้นำเข้าข้อมูล
- การแก้สมาชิกโดยเว้นรหัสว่างต้อง = ไม่เปลี่ยนรหัส (เคยถูกตั้งเป็น `1234` เงียบ ๆ)
- ตัวตรวจ runtime ควรรันทั้ง **โหมด desktop และมือถือ** (ตั้ง `matchMedia` matches=true อีกรอบ) และเพิ่มการทดสอบ layout จริงด้วย Playwright ที่ 390/375px, 820/1024px, 1440px (สิ่งที่ทำมือมาตลอดใน v272–v279)
- ธีมอยู่ที่ `body[data-theme]` — selector ธีมต้องเขียนตามนั้น (หรือย้ายไป `html` ให้สม่ำเสมอ) · `applyTheme` พยายามตั้ง `meta[name="theme-color"]` แต่ใน index.html ไม่มี meta นี้ (ถ้าสร้างใหม่ควรใส่ เพื่อแถบสถานะ iPhone)
- `travel.js` ประกาศฟังก์ชันชื่อซ้ำกับ app.js (ตัวที่โหลดทีหลังชนะ) — เลี่ยงชื่อ global ซ้ำด้วย module scope

---

# ส่วน E — ประวัติ · การตัดสินใจ · บทเรียน · งานค้าง · กติกา

## ลำดับเหตุการณ์ของโครงการ

> ที่มา: `HANDOFF.md` (ส่วนบนสุด = ต.ค. 69 · กลางไฟล์ = ก.ค.–ก.ย. 69 · ท้ายไฟล์ = 11 ต.ค. → v281 วันที่ 1 พ.ย. 69), สรุป project docs 2 ฉบับ และ `TERMINAL_GUIDE.md`
> ปี = ค.ศ. 2026 (พ.ศ. 2569) · เลข "v" = เลข cache-bust ของ `frontend/app.js?v=` ซึ่งใช้เป็นเลขรุ่นของแอปหลัก

### ภาพรวมเป็นช่วง

| ช่วง | ธีมหลัก | ผลลัพธ์ |
|---|---|---|
| ก่อน ก.ค. – 23 ก.ค. | แอปสมุดบัญชีครอบครัวเดิม (`frontend/index.html` + `app.js` ไฟล์เดียว ~13,000 บรรทัด · `backend/src/index.js` ~3,600 บรรทัด) | ใช้งานจริงมาตลอด · มีคู่มือ Terminal (23 ก.ค.) สอน git / deploy / D1 ให้ North รันเอง |
| 25 ก.ค. – 28 ก.ค. | ระบบการเงินทริป + ต้นแบบหน้าทริปหลายรุ่น (Hunsa → PupPup → Prototype Trip → Unified Trip) + ความปลอดภัย (hash รหัส, session token) | Unified Trip เชื่อม D1 จริง (`?live=1`) · เทส 330 เคส |
| 7 ส.ค. – 23 ส.ค. | ขยาย Unified Trip: preset ค่าใช้จ่าย, ธีม, อัปโหลดรูป, เอกสาร, ผู้ร่วมทริปมีรหัสเอง, อากาศจริง, แผนที่จริง, ระยะขับ, กระเป๋า/ปิดทริปลงบัญชีจริง, โครงสิทธิ์ | 23 ส.ค. North สั่ง **พักระบบทริป** · เทส 674 เคส |
| 3 ก.ย. – 15 ก.ย. | แก้บั๊กสิทธิ์ทริป, deploy "Enjoy Life Trip" + มาสคอต Momo, "วัน" มีตัวตนในฐาน, นำเข้าข้อมูลจริง Expense2 (14,143 รายการ), D1 ฟรีเทียร์เต็มครั้งแรก, การจองของจุดแวะ + หน้าพิมพ์ | ข้อมูลจริงเข้าระบบครั้งแรก |
| 7 ต.ค. – 12 ต.ค. | "ยกเครื่องสมุดจด": แยกทริปออก, กล่องรับเอกสาร + LINE Bot รุ่นใหม่, ชุดหน้าใหม่ `frontend/ledger/*`, D1 เกินโควตาครั้งที่ 2, ปิดช่องโหว่, ปิดเดือน, บัตร/เงินกู้, ทรัพย์สิน, ยอดยกมา | 12 ต.ค. North สั่ง **กลับไปใช้แอปเดิมเป็นหลัก** |
| 12 ต.ค. – 15 ต.ค. | ย้ายของดีจาก `ledger/` เข้าแอปเดิม · ยกเลิกปิดเดือน · ปรับหน้าตาแบบ A (ม่วงนุ่ม) / C (โหมดมืด) | เหลือ `ledger/quick.html` หน้าเดียว (หน้าแก้สลิปจาก LINE) |
| 30 ต.ค. (v195–v221) | ตรวจยอดคงเหลือ, รายงานยอดสะสมต่อ statement, ตรวจสลิปทีละใบ, ผังรายได้ BKP, ตัวอ่าน statement/ใบแจ้งยอดบัตรจากตัวหนังสือ PDF หลายธนาคาร, นำเข้าหลายไฟล์, ความเร็ว, แนวคิดหน้าตา ข "ตามบัญชี" (ร่วมกับ ChatGPT) | ระบบนำเข้า statement ครบวงจร |
| 31 ต.ค. (v222–v254) | จำรูปแบบนำเข้าต่อบัญชี, Google Drive ผ่าน Apps Script, ฟอนต์ Mali, wePAY, รายการใกล้เคียง/เติมหมวดจากประวัติ, เตือนจ่ายซ้ำ, Balance Check, ประวัติแบบใหม่, ครอบครัว & ธุรกิจ, หนี้สินที่ติดตาม, โอนระหว่างบัญชี | — |
| 1 พ.ย. (v255–v281) | ความลื่นหน้ารอตรวจ, Company เริ่มต้นต่อบัญชี, กฎอัตโนมัติ, ทรัพย์สิน/ประกัน, คิวอ่านรูป + cron, ORDER_LIST (Shopee/Lazada/LINE MAN), ตัวอ่านกรุงไทย, **v271 ปิดระบบทริปถาวร**, หน้าสิทธิ์ใหม่, เปลี่ยน ID ตามทุกตาราง, ชุดมือถือ (mobile.css), หนี้ผูก Liability | 1 พ.ย. North สั่งสรุปเป็นพิมพ์เขียว `PROJECT.md` |

### รายละเอียดตามลำดับเวลา

#### ช่วงก่อน ก.ค. – ปลาย ก.ค. 2026 (ระบบเดิม + ทริปรุ่นแรก)
- สแตก: Cloudflare Pages (frontend) + Worker (backend) + D1 `record-revenue-db` (id `3112e08d-…`) · เว็บ `https://record-revenue-web.pages.dev` · API `https://record-revenue.9nimz.workers.dev`
- ผู้ใช้ admin เดียวในตาราง Users: `9North` (role admin) · ผู้ใช้อื่น: Puii, XinXin (สมาชิกทริป)
- โมเดลข้อมูลหลัก (ยืนยันแล้ว): Owner/Entity = **Company** (ป้าย UI = "Company") · Member/User = คนบันทึก (`Transactions.created_by_user_id`) · Member↔Company = many-to-many ผ่าน `UserPermissions` · ตัวกรองบนสุดของแดชบอร์ด = Member · ยอดบัญชีคำนวณสดจาก `SUM(Transactions.total_amount WHERE status='CONFIRMED')` (`Accounts.balance` ไม่ใช้) · เงินลงทุน = `behavior='ASSET' + sub_behavior='INVESTMENT'`
- 23 ก.ค.: `TERMINAL_GUIDE.md` — คู่มือ Terminal สำหรับ Mac ของ North (cd โฟลเดอร์ใน Google Drive, git, `npx wrangler deploy`, `pages deploy`, `d1 execute --remote`)
- ~25 ก.ค. — **Trip Finance P1 + P3** (`TRIP_FINANCE_DESIGN.md`): ทริป = "กระเป๋าเงินแยก" เติมจากบัญชีจริง → ใช้จ่ายหลายสกุล → ปิดทริปสรุปเข้าบัญชีหลัก · ตาราง `TripWalletFundings` · `POST /api/trips/fund`, `/api/trips/close` (ต้อง `confirm:'CLOSE'`) · เรท = เฉลี่ยถ่วงน้ำหนักทั้งทริป (Σบาท ÷ Σเงินตปท.) · การ์ดทริป kawaii · frontend `app.js?v=169`
- 25 ก.ค.: เพิ่มความปลอดภัยการเติมเงิน/ปิดทริป (ตรวจสิทธิ์ทริป, batch เดียว, สถานะ `closing` กันกดซ้ำ) · migration `add_hunsa_trip_stop_fields.sql` รันบน remote
- **Hunsa Trip** (ต้นแบบหน้าทริปจาก mockup 4 ภาพ) → North ไม่ยอมรับความเหมือน → สั่งหยุดดัดแปลง UI Trip เดิม และตั้งกติกา "static prototype ก่อน ต่อ API ทีหลัง"
- **PupPup Trip** แทน Hunsa: สร้างจาก mockup แบบ 1:1 (canvas 869px, ตัดไอคอน 46 ไฟล์, ฟอนต์ Noto Sans Thai Looped / Anuphan / Poppins)
- 26 ก.ค. — เมนู **"Prototype Trip"** เชื่อม PupPup กับข้อมูลจริงผ่าน endpoint เดิม (เฟส 1–4: แผนที่ + หมุด, แท็บ 4 หน้า, ฟอร์มจุดแวะ, ฟอร์มบิล/เติมเงิน)
- 27 ก.ค. — **Unified Trip Static Prototype** (`frontend/trip-unified-prototype/`) รวม 3 หน้าทริปเดิม · รันสคีมา `add_unified_trip_schema.sql` (7 ตาราง + 16 คอลัมน์) และ `migrate_trip_members.sql` (8 แถว) บน remote · `GET /api/unified-trip` deploy แล้ว
- 27 ก.ค. — **เหตุการณ์ความปลอดภัย**: `git add -A` กวาดไฟล์ dump ที่มีรหัสผ่านข้อความธรรมดาขึ้น GitHub → แก้ด้วยการเปลี่ยนรหัส + `.gitignore`
- 28 ก.ค. — endpoint ฝั่งเขียนครบ (บิล/กระเป๋า/สกุลเงิน/เติมเงิน/ปิดทริป/เปิดกลับ/จุดแวะ) · prototype อ่านข้อมูลจริง `?live=1` · รหัสผ่าน PBKDF2-SHA256 100,000 รอบ (อัปเกรดอัตโนมัติตอนล็อกอิน) · session token (`session.js`) พร้อมสวิตช์ `ALLOW_HEADER_FALLBACK` · เทส 330 เคส

#### ส.ค. 2026 (ขยาย Unified Trip)
- 7–11 ส.ค.: `TripExpensePresets` (รายการค่าใช้จ่ายย่อยต่อทริป) · ธีมต่อทริป (`Projects.theme_id` + `themes.css`) · อัปโหลดรูปเอง `TripAssets` (ไม่ต้องมี R2) · เอกสารประจำทริป `TripDocuments`
- 10 ส.ค.: ปรับมือถือ (ตัดแถบ "โหมดข้อมูลจริง" ที่ซ้ำ 3 ที่, ปุ่มลอยเดียว, เผื่อพื้นที่ล่าง 150px)
- 11 ส.ค.: ผู้ร่วมทริปเข้าด้วยรหัสของตัวเอง (`join.html?projectId=…`) ไม่ใช้ `Projects.trip_password` เดิม (ข้อความธรรมดา)
- 17 ส.ค.: อากาศจริงจาก **Open-Meteo** (ฟรี ไม่ต้องมี key) + แผนที่จริง (Leaflet) · ตัดภาพรวมไอคอนเป็นไฟล์แยก · คลังไอคอนของ North
- 18 ส.ค.: deploy ทั้ง backend/frontend · เทส 491 เคส
- 20 ส.ค.: หน้าแผนเที่ยวใหม่ + ระยะขับจริง + งบต่อจุด (`add_plan_costs_and_legs.sql`)
- 22 ส.ค.: หน้ากระเป๋าใหม่, แก้ล็อตเติมเงิน · **เจอบั๊ก `wrangler d1 execute --file` หยุดที่ error แรก** → เกิด `setup-db.sh` (ยิงทีละคำสั่ง)
- 23 ส.ค. (หลายรอบ): `deploy.sh` (cd เข้าโฟลเดอร์เอง) · ย้ายลิงก์/ลบทริปให้ถูกหัวข้อ · ตั้งรหัสรายคน · สีประจำกระเป๋า (`color_hue`) · ลำดับบิล (`sort_order`) · หน้าจัดการทริป 3 รอบ · รูปประจำตัวสมาชิก · คลังรูป · โครงสิทธิ์ใหม่ (MAIN / TRIP_ONLY / `managed_by`) · **ปิดทริปแล้วเงินเข้าสมุดบัญชีจริง** (เดิมไม่ลงบัญชีเลยสักบาท) · ผู้ดูแลทริปเห็นกระเป๋าทุกใบ
- **23 ส.ค. — North: "ตอนนี้ระบบทริปน่าจะหยุดไว้ก่อน จะขอสร้าง chat ใหม่ เพื่อต่องานเรื่องจดค่าใช้จ่ายหลัก"** · commit ล่าสุด `fc61075` · เทส 674 เคส

#### ก.ย. 2026 (deploy ทริป + ข้อมูลจริงเข้าระบบ)
- 3 ก.ย.: รัดกุมสิทธิ์ (พบว่ามีอีก session แก้ไฟล์ชุดเดียวกัน) — ผู้ดูแลครอบครัวที่ไม่ใช่สมาชิกทริปแตะข้างในไม่ได้ · `meta` บอกสิทธิ์รายเรื่อง · `tripId()` ใช้ `crypto.randomUUID()` · deploy 4 ก.ย.
- 3 ก.ย. รอบสอง: แก้ "ผู้ดูแลที่เข้าทางลิงก์+รหัสแก้อะไรไม่ได้" + บั๊ก `financeLocked()` เรียกเปล่า · เทส 705 เคส
- 7 ก.ย. (9 รอบในวันเดียว): "วัน" มีตัวตนในฐาน (`TripDayPlans` = ทะเบียนวัน) · ย้ายสถานที่ข้ามวัน · บันทึกแล้วต้องอยู่วันเดิม · แถบวันเลื่อนได้ · ช่องเวลา CSS · ฟอร์มสถานที่ใหม่ · ประเภทจุดแวะเก็บจริง (`stop_tag`) · **deploy "Enjoy Life Trip"** + มาสคอต **Momo** · **นำเข้า Expense2.xlsx** (14,143 รายการ / 15,162 รายการย่อย · Entity ใหม่ `Ent_North`, `Ent_X01`, `Ent_X02` · หมวดใหม่ 44 · บัญชี 34) · เทส backend 618 + UI 105
- 8 ก.ย.: แดชบอร์ดเลือกช่วง เดือน/ปี/ทั้งหมด + "ข้อมูลถึงวันไหน" + หน้าขยาย · **D1 ฟรีเทียร์เต็มครั้งแรก** (rows_read 7.95M/5M · rows_written 116k/100k) → แก้ query · North เลือก **อยู่ฟรีเทียร์ต่อ** · North สั่งลบข้อมูลที่ไม่ได้มาจาก Excel
- 15 ก.ย.: การจองของจุดแวะ (`TripBookings` จาก Trip.xlsx — ไม่นำเข้าไฟล์ North กรอกเอง) + สกุลเงินต่อจุด + หน้าพิมพ์ A4 (`print.html`) · เทส unified-trip 616
- 16 ก.ย.: ลบ Debts ทดสอบ 3 แถว

#### 7–12 ต.ค. 2026 (ยกเครื่องสมุดจด)
- 7 ต.ค.: บันทึกสถานะรวมก่อนย้ายแชท · North เลือก "สมุดจดทำใหม่ทั้งหมด · ใช้ฐานเดิมร่วมกับทริป · เริ่มระยะ 0+1" · จุดสำรอง git `b359719` · ลบ Debts BAY Chaiyapruk
  - ระยะ 0: ย้ายทางเข้าทริปรุ่นเก่าออกจาก `index.js` → `legacy-trip.js` (`index.js` 3,684 → ~2,870 บรรทัด)
  - ระยะ 1: `ledger-match.js` + `ledger-inbox.js` (กล่องรับเอกสาร + LINE webhook ใหม่) · ตาราง `LedgerDocs` `LedgerDocLinks` `LedgerRules` · สลิปเก็บ R2 `ledger-docs/{family}/` · เทส ledger-inbox 84
  - แก้บั๊กหน้าแก้ไขสมาชิก (เว้นรหัสว่าง → ถูกเปลี่ยนเป็น 1234 เงียบ ๆ) `app.js?v=178`
- 8 ต.ค.: token หมดอายุ = หน้าว่าง → fetch wrapper เจอ 401 พากลับหน้าล็อกอิน (v179) · สลิป LINE ค้าง READING → ส่งไบต์ดิบขึ้น Gemini Files API · คำสั่งสรุปทาง LINE พังมาตลอด (โค้ด LINE ไม่เคยรันบน production)
- 10 ต.ค.: Gemini 403 (API key) · ต้นเหตุสลิปค้างจริง = "Canceled" → `ctx.waitUntil` · การ์ด LINE Flex + หน้าแก้ไขด่วน `ledger/quick.html` (ลิงก์เซ็น HMAC 14 วัน) · LIFF · **หน้าเว็บ "กล่องรอเคลียร์" `ledger/index.html`** + นำเข้า statement ระยะ 2 (`LedgerStatements` เก็บบรรทัดเป็น JSON) · เปิดให้ Puii · รวม "รอตรวจสอบ" เข้ากล่อง + `ledger/home.html` · นำเข้า Excel ย้ายเข้ากล่อง · ประวัติใหม่ · **ปิดเมนู Enjoy Life Trip** (comment) ข้อมูลไม่ลบ
- 11 ต.ค.: ลูกหนี้/เจ้าหนี้ใหม่ · รายงานใหม่ `ledger/reports.html` · ตั้งค่าใหม่ `ledger/settings.html` · **D1 rows_read 6.15M/5M ต่อวัน** (ครั้งที่ 2) → `diag-d1.sh`, `add-indexes.sh` → จ่าย Workers Paid $5 (ตาม project docs) · ระยะ 0 ปิดช่องโหว่ (ประตูล็อกอินเดียว, `/api/export` → 410, `ALLOW_HEADER_FALLBACK=false`) · ระยะ 1 ลดการอ่าน (index, cache 10 นาที, ย่อรูป, R2 lifecycle 30 วัน) · ระยะ 2 ความเสถียร (`settle-keep.js`, IN-list ≤90, fetch timeout) · ระยะ 3 จัดบ้าน (ย้ายไฟล์ใช้ครั้งเดียว 182 ไฟล์เข้า `archive/`) + หน้าแรก = `ledger/home.html` · **ปิดเดือน** (`period-close.js` + 8 trigger) · บัตรเครดิต + เงินกู้ (`cards-loans.js`)
- 12 ต.ค.: ทะเบียนทรัพย์สิน (`assets.js` · แบบที่ 3 ไม่มีค่าเสื่อม) · ธีมสีหน้าใหม่ `ledger/theme.js` · ล้างข้อมูลแบบมี preview · รายงานทรัพย์สิน · **ยอดยกมา** (`opening.js`, `OpeningSets`, บัญชีพักยอดยกมา Dr/Cr) · ซ่อนเมนู "(แบบเดิม)" · นำเข้า statement หน้าใหม่ให้ทำงานแบบหน้าเก่า (ส่ง PDF ทั้งไฟล์, ลองใหม่ 3 ครั้ง, `geminiGenerate` สลับรุ่นสำรอง) · ด่านเดินยอดคงเหลือ (`walkStatement`) + เทียบเลขบัญชี + นำเข้า Excel 8 คอลัมน์ · ⭐ **อ่าน PDF statement จากตัวหนังสือไม่ใช้ AI** (KBANK 462 รายการ ตรงยอดธนาคารถึงสตางค์ ~1 วินาที)
- **12 ต.ค. — North สั่ง "ปรับของเดิมให้ดีขึ้น ไม่ใช่ทำใหม่"** → เมนูกลับเป็นชุดเดิม · `goNewHomeIfDefault()` ปิด · ย้าย `parseTextStatement` / รหัส PDF / เช็คเลขบัญชี / `geminiGenerate` เข้าแอปเดิม · เริ่มย้ายยอดยกมา → ปิดเดือน → บัตร & เงินกู้ → ทรัพย์สิน เข้าแอปเดิม

#### 15 ต.ค. 2026 (รวมกลับเข้าแอปเดิม)
- พื้นที่ทำงานร่วมกับ ChatGPT สำหรับภาพ/ไอคอน (`ภาพและไอคอน (ChatGPT)/`)
- North: สลิป LINE เข้า "รอตรวจสอบ" ของแอปเดิม · **ยกเลิกฟีเจอร์ปิดเดือน** (ลบเมนู/โค้ด PC ออกจากแอปเดิม · โค้ดอยู่ใน commit `c1ee3c6` · backend + trigger ยังอยู่)
- บัตร & เงินกู้ + ทรัพย์สิน ย้ายเข้าแอปเดิม (สคริปต์ prefix CSS) · `ledger/cards.html`, `assets.html` เลิกใช้
- ปรับหน้าตารอบ 1: `ui-a.css` ธีม A ม่วงนุ่ม (ค่าเริ่มต้น) + C โหมดมืด · 3 ขนาดจอ (คอม/iPad/มือถือเมนูล่าง 5 ปุ่ม) · ภาพรวม `dv2Render` ใหม่
- ปรับหน้าตารอบ 2: ประวัติ · ลูกหนี้/เจ้าหนี้ (`DebtorView`) · รายงาน · ตั้งค่า · `ledger/home|index|reports|settings.html` เลิกใช้ → เหลือ `ledger/quick.html` + `theme.js`
- นำเข้า statement ปลอดภัยขึ้น (`statementPrecheck`, ลบทั้งชุด `bulk-delete`, `match_existing` กับสลิป ±3 วัน) · อ่านภาพแคป/บัตร/กระเป๋าเงิน · จำหมวด (`category-hints`) · ใส่หมวดหลายรายการ · บันทึกทั้งหมดที่พร้อม · ยอดยกมาจาก statement · `app.js?v=194`

#### 30 ต.ค. 2026 (v195–v221 · วันทำงานหนักที่สุด)
- v195 ตรวจยอดคงเหลือ (`AccountCheckpoints`) · เริ่มแชทใหม่ + วงจรงานออกแบบกับ ChatGPT (`design.md`)
- โจทย์ใหม่ 7 ข้อจาก North (รายงานยอดสะสม, จับคู่สลิป, ผังรายได้, หน้าตากับ GPT, จำรูปแบบนำเข้า, Shopee/Lazada)
- v196 รายงานยอดสะสมต่อ statement (Excel + PDF · `stmt-report.js` · คอลัมน์ `stmt_id/stmt_seq/stmt_balance`)
- v197 ตรวจสลิปทีละใบ · v198 North เลือก "statement เป็นตัวตั้ง สลิปเป็นหลักฐานประกอบ" · v199 ผังรายได้ (`revenue-chart.js` · ไฟล์จริง 2,316 แถว จับถูกอันดับ 1: 258/318)
- North เลือกแนวคิดหน้าตา **ข "ตามบัญชี"** · งานออกแบบ 008/009/010 ผ่าน · หน้ารายงานเลือก **แบบ B โดนัท + ตาราง**
- v200 รายการซ้ำ + หน้ารอตรวจโหลดครบ (`limit=0`) + merge · v201 ใบแจ้งยอดบัตรหลายบัตรในไฟล์เดียว (`parseCardStatement`) · v202 นำเข้าหลายไฟล์ (ตรวจ 4 ชั้น) · v203 ลบหัว statement ค้าง · v204 แก้นำเข้าไฟล์ซ้ำแล้วซ้ำ (`dup_idx`, `/api/statements/sync`) · v205 ขีดดำขอบกระดาษถูกอ่านเป็น "l" · v206 ซื้อ/คืนยอดเท่ากันวันเดียวกันหาย
- v207–v208 หน้า "บัญชีของฉัน" (`acc-overview.js`, `AccView`) · v209 ตั้งค่าเร็วขึ้น · v210 KBank อังกฤษ "Beginning Balance" · v211 ทั้งแอปเร็วขึ้น (ตัด xlsx-latest ~900KB, defer) · v212 เปิดหน้าต่างตั้งค่า 9.9 วิ → 0.015 วิ · v213 SCB ออมทรัพย์ · v214–v217 CardX · v218 ป้ายเวอร์ชัน + `_headers` no-cache · v219 KTC · v220 หน้ารายงานแบบ B + เมนูหลัก 6 หน้า · v221 กดแถวในหน้าบัญชีเพื่อแก้รายการ

#### 31 ต.ค. 2026 (v222–v254)
- v222 จำรูปแบบนำเข้าต่อบัญชี (`Accounts.import_format`, `detectStatementIssuer`) · v223 **Google Drive ผ่าน Apps Script** (`drive.js`, `gas/RecordRevenueDrive.gs`) · v224 สลิป LINE + หลักฐานหลายไฟล์ → Drive · v225 Drive แยกตามบัญชี + **ฟอนต์ Mali ทั้งแอป** (รอบ 2: ตัวใหญ่/เข้มขึ้น)
- v226–v228 wePAY จากรูปหน้าจอ (`wepay.js`) + รายการใกล้เคียง (`similar.js`) + แถบประวัติทุกการ์ด + เลือกรายการรอตรวจที่น่าจะเหมือนกัน · v229 เติมหมวดจากประวัติ (ไม่ใช้ยอดเงินหาประวัติ ตามที่ North สั่ง) · v230 เตือนอาจจ่ายซ้ำ
- v231–v236 Balance Check (ตาราง → การ์ดเล็ก ย่อ/ขยาย → ครบดีเทลแต่แน่น · ป้ายอังกฤษ Recorded/Wait/Total/Bank) · North เลือกคงฟอนต์ตัวเลข Mali · PDF รายงานคง Sarabun · v237 wePAY ผ่านปุ่ม statement + `parseAiJson` ซ่อม JSON
- v238 ตรวจข้อมูลจริง (รอตรวจ 500 · ไม่มีหมวด 377) → STOP words + `payeeKey()` · v239 Safari ช้า (`Access-Control-Max-Age 7200` + `?perf=1`) · v240–v246 wePAY พร้อมกัน 4 รูป, ref_code ชนกัน, ปุ่มซ้ำหาย, เลขเบอร์, ไม่ทับ Company, ยอดสะสมเรียงตามเวลา + ลบได้
- v247 หน้าประวัติแบบใหม่ (แบบ ก.) + บัตรเปลี่ยนเลข · v248 กรุงศรี · North ตอบเรื่องครอบครัว (สิทธิ์ 2 ระดับ) · v249 **ครอบครัว & ธุรกิจ** (`family.js`, `ensureAdminScope`) · v250 กรุงศรีออมทรัพย์ · v251 **หนี้สินที่ติดตาม** (`loans.js`) · v252 iPad ฟอร์มล้น + กรุงศรี HomePro · v253 **โอนระหว่างบัญชีของเรา** (`transfers.js`) · v254 PDF ตัวหนังสือหมุน 90° (กรุงไทย)

#### 1 พ.ย. 2026 (v255–v281)
- v255 รอตรวจวาดทีละ 30/40 (จริง 1,969 ใบ) + ช่องวันที่พิมพ์ได้ (`DateType`) + Detail = ข้อความ statement · v256 Company เริ่มต้นต่อบัญชี (`Accounts.tx_entity_id`) + โหมดจัดกลุ่มผู้รับ · v257 **กฎอัตโนมัติ** (`rules.js`, `AutoRules`)
- v258 ทรัพย์สิน: ที่ตั้ง (Chaiyapruk, Villaggio, Pattaya, Element, Condo) · หนี้ที่ผูก · ไฟล์แนบ · v259 **ประกัน** (`insurance.js` · ลดหย่อนภาษี)
- v260 อัปรูปไว้ก่อนอ่านทีหลัง (สถานะ `QUEUED` + `scheduled()` cron ทุก 5 นาที) · v261–v264 รูปเดียวหลาย order (`ORDER_LIST`), LINE MAN/Grab, order ยกเลิก, Shopee คืนเงินบางส่วน, ยอดที่ใช้จับคู่
- v265–v267 กรุงไทย: คอลัมน์ภาษี, ตัวเลขฟอนต์ฝัง Ř–š, statement 2 ฉบับช่วงทับกัน · v268 **บั๊กคอมเมนต์ `//`** · v269 อ่านได้แล้วไม่ส่ง AI ซ้ำ (`noAi`) · v270 การ์ดรอตรวจตัวใหญ่ขึ้น
- **v271 — ปิดระบบทริป**: `trip-purge.js` ตอบ 410 ทุก path ทริป · `/api/admin/trip-purge` ลบตาราง Trip* (คืน backup JSON) · ย้ายหน้า/เทสทริปไป `archive/trip-frontend-v271/` · ข้อมูลจริงก่อนลบ 2 ทริป (Hokkaido 2026, สวิตเซอร์แลนด์) · รายการในสมุดที่ผูกทริป = 0 · พร้อมกัน: เขียน `check-frontend*.mjs` ใหม่ให้ตรวจแอปหลัก · รายงานแบบ ข. (เมนูซ้าย + ช่องขวา) · อ่านง่ายทุกหน้า (ตัวเล็กสุด 14px) · QR บอท LINE จริงจาก `/v2/bot/info`
- v272 ตัวกรองยอดสะสมบรรทัดเดียว · v273 หน้าแก้ไขสมาชิก/สิทธิ์ใหม่ · v274 ตั้งค่ามือถือเลื่อนได้ + ธีมย้ายไปเมนู · v275 **เปลี่ยน ID ตามไปทุกตาราง** (`id-cascade.js`) + ปุ่ม "+ เพิ่ม" ไม่สร้างรายการว่าง · v276 ชุดมือถือ (`mobile.css`: ภาพรวมแบบ ก · ตั้งค่าแบบ ข · รอตรวจแบบ ข) · v277 ไม่เลื่อนซ้าย-ขวา + modal เป็นแผ่นจากล่าง · v278 ตรวจ iPhone 29 หน้า + ช่องตัวเลขมี 0 ค้าง · v279 การ์ดครอบครัวเกินจอ · v280–v281 หนี้สินผูก Liability (หมวดเงินต้นแสดงเฉพาะ LIABILITY)
- 1 พ.ย.: North สั่งสรุปโครงการทั้งหมดเป็นพิมพ์เขียว → `PROJECT.md`

### ตัวเลขอ้างอิงตามช่วงเวลา

| วันที่ | ตัวเลข | ที่มา |
|---|---|---|
| 25 ก.ค. | `app.js?v=169` | deploy รอบ Trip Finance |
| 28 ก.ค. | เทส 330 เคส (session 22 · auth 27 · unified-trip-write 176 · live UI 105) | สรุป 28 ก.ค. |
| 18 ส.ค. | เทส 491 เคส | สถานะ 18 ส.ค. |
| 23 ส.ค. | เทส 674 เคส · `app.js?v=124` (ทริป) `api.js?v=47` `style.css?v=157` · commit `fc61075` | พักระบบทริป |
| 3 ก.ย. | เทส 705 เคส | รอบสิทธิ์ |
| 7 ก.ย. | เทส 723 เคส (unified-trip-write 569 + UI 105 + อื่น ๆ) · ข้อมูลจริง 14,143 รายการ | Enjoy Life Trip + Expense2 |
| 8 ก.ย. | D1 rows_read 7.95M/5M · rows_written 116k/100k · เทส backend 728 | วิกฤติโควตาครั้งที่ 1 |
| 7 ต.ค. | `index.js` 3,684 → ~2,870 บรรทัด · เทส ledger-inbox 84 · unified-trip 616 · `app.js?v=178` | ระยะ 0+1 |
| 11 ต.ค. | D1 rows_read 6.15M/5M ต่อวัน · `/api/accounts` ~481k แถว/ครั้ง · ย้ายไฟล์ 182 ไฟล์เข้า archive | วิกฤติโควตาครั้งที่ 2 |
| 15 ต.ค. | `app.js?v=194` `ui-a.css?v=11` · ทดสอบผ่านครบ 13 ชุด | รวมกลับแอปเดิม |
| 30 ต.ค. | v195 → v221 (27 รุ่นในวันเดียว) | — |
| 31 ต.ค. | v222 → v254 · ข้อมูลจริง: รอตรวจ 500 · ไม่มีหมวด 377 · ผู้รับไม่ซ้ำ 185 | — |
| 1 พ.ย. | v255 → v281 · รอตรวจจริง 1,969 ใบ · ledger-inbox 225 เคส · trip-purge 30 · id-cascade 22 | — |
| ปริมาณใช้งาน | ผู้ใช้ 2 คน ~20 รายการ/วัน + นำเข้าย้อนหลัง 1 ปี · 1 บรรทัด statement ≈ 15–20 แถวที่เขียน | project docs |

---

## การตัดสินใจสำคัญของเจ้าของ (North)

### ทิศทางผลิตภัณฑ์

| วันที่ | การตัดสินใจ | เหตุผล / คำพูดของ North |
|---|---|---|
| ปลาย ก.ค. | หยุดดัดแปลง UI Trip เดิม ทำ static prototype ให้ตรง mockup ก่อน แล้วค่อยต่อ API ทีละหน้า | หน้าจอ Hunsa/Trip "กลายเป็น web dashboard และไม่ตรงภาพ mockup mobile" |
| ปลาย ก.ค. | ห้ามแก้/replace หน้า `Trip`, `PupPup Trip`, `Prototype Trip` production เดิม | เก็บของเดิมไว้ใช้ได้ระหว่างทำของใหม่ |
| 23 ส.ค. | พักระบบทริป | "ตอนนี้ระบบทริปน่าจะหยุดไว้ก่อน จะขอสร้าง chat ใหม่ เพื่อต่องานเรื่องจดค่าใช้จ่ายหลัก" |
| 15 ก.ย. | การจองจาก Trip.xlsx ไม่นำเข้าไฟล์ — North กรอกในเว็บเอง | คำตอบข้อ 8.4 |
| 7 ต.ค. | สมุดจดทำใหม่ทั้งหมด · ใช้ฐานเดิมร่วมกับทริป · เริ่มระยะ 0+1 | แผน "ยกเครื่องสมุดจดค่าใช้จ่าย" |
| 10 ต.ค. | ปรับ UX/UI ทั้งแอปแบบทำใหม่ทีละหน้า (ภาพรวม → ประวัติ → ลูกหนี้ → รายงาน → ตั้งค่า) · ปิดเมนู Enjoy Life Trip (ข้อมูลไม่ลบ) | ใช้แอปเดิมได้ระหว่างทาง |
| 12 ต.ค. | ซ่อนหน้าเก่า (เลือก ก.) | — |
| **12 ต.ค.** | **กลับไปใช้แอปเดิมเป็นหลัก** — ย้ายของดีจาก `ledger/` เข้า `app.js` แล้วลบหน้า ledger | **"ปรับของเดิมให้ดีขึ้น ไม่ใช่ทำใหม่"** |
| 12 ต.ค. | ลำดับย้าย: ยอดยกมา → ปิดเดือน → บัตร & เงินกู้ → ทรัพย์สิน | North เลือก |
| 15 ต.ค. | สลิป LINE เข้า "รอตรวจสอบ" แอปเดิม (1ก) · **ยกเลิกฟีเจอร์ปิดเดือน** | — |
| 15 ต.ค. | หน้าตาแบบ A ม่วงนุ่ม = ค่าเริ่มต้น · แบบ C = ธีมโหมดมืด | — |
| 30 ต.ค. | งานออกแบบ/ภาพทำร่วมกับ ChatGPT ผ่าน `design.md` · "ดูจนพอใจก่อนทำ" | — |
| 30 ต.ค. | **statement เป็นตัวตั้ง สลิปเป็นหลักฐานประกอบ** (เลือก ก) | — |
| 30 ต.ค. | แนวคิดหน้าตา **ข "ตามบัญชี"** · หน้ารายงาน **แบบ B โดนัท + ตาราง** | หน้ารายงานแบบฟองวงกลม "ดูงง" |
| 30 ต.ค. | หน้าบัญชีไม่ใส่ ฿ และไม่ใส่ + หน้าตัวเลข | — |
| 1 พ.ย. (v271) | **ปิดระบบทริปถาวร** ลบข้อมูลทริปออกจากฐาน (มี backup JSON) | — |
| 1 พ.ย. | มือถือ: ภาพรวมแบบ ก · ตั้งค่าแบบ ข · รอตรวจแบบ ข (+ การ์ดแบบ ก) | เลือกจาก mockup |

### เงิน / บัญชี

| เรื่อง | การตัดสินใจ | คำพูด / เหตุผล |
|---|---|---|
| รูปแบบตัวเลข (ทั้งแอป) | ทศนิยม 2 ตำแหน่ง · `,` หลักพัน · ติดลบใส่วงเล็บ `(1,234.56)` สีแดง `#c92a2a` | "ใช้ทั้งแอป" · ต้องใช้ง่ายบน Mac/PC/iPad/iPhone |
| อัตราแลกเปลี่ยนทริป | เรทเฉลี่ยถ่วงน้ำหนักทั้งทริป ไม่สนลำดับ/วันที่ · ห้ามเดาเรท (ไม่มีข้อมูล = `null`) | บันทึกย้อนหลังต้องได้ผลเดียวกัน |
| เงินทริปออกจากบัญชีเมื่อไร | **ตอนปิดทริป เฉพาะยอดที่ใช้จริง** แยกบรรทัดตาม Category · เงินเหลือไม่ต้องทำอะไร (KEEP เป็นค่าเริ่มต้น) | North อธิบายเอง 23 ส.ค. |
| กำไร/ขาดทุนค่าเงิน | เกิดตอนแลกคืนจริงเท่านั้น และลงใต้ Caption ค่าใช้จ่าย | "จะเกิดขึ้นเมื่อแลกเงินคืน เช่นจบทริป…" · "กำไรขาดทุนก็ให้ไปเพิ่มหรือลดค่าใช้จ่าย" |
| หมวดของบิลทริป | ทุก Caption ใช้ได้ (ไม่บังคับฝั่งค่าใช้จ่าย) | "ไปตปท.…" (ซื้อของเป็นสินทรัพย์ได้) |
| ผู้ดูแลทริป | คนสร้างทริปคือ admin และเพิ่ม admin ได้ · admin แก้/ลบ/เพิ่มได้ทั้งหมด | "คนสร้างทริปคือ admin และสามารถอนุญาตให้ใครเป็น admin เพิ่มได้…" |
| ลิงก์/ลบทริป | ลบทริปอยู่ในข้อมูลทริป · ลิงก์อยู่ใน "คนและสิทธิ์" | "ทำไม ลิงค์กับลบทริปถึงอยู่หน้าเดียวกัน…" |
| Head Owner ใน Expense2 | A/C = บัญชี · S/X = Entity · T/G/R/B/L/Z = Category · W = Contact | North นิยาม |
| ข้อมูลที่ไม่ได้มาจาก Excel | ลบ (8 ก.ย.) · Debts ทดสอบ 3 แถวลบ 16 ก.ย. · BAY Chaiyapruk ลบ 7 ต.ค. | — |
| โควตา D1 | 8 ก.ย. เลือก **ไม่จ่าย ใช้ฟรีต่อ** (เทียบ Supabase แล้วไม่คุ้มย้าย) → 11 ต.ค. เกินอีก จ่าย Workers Paid $5 | Supabase หยุดถ้าไม่ใช้ 7 วัน · Pro $25 · ต้องแปลง query เป็น Postgres |
| GoogleSheetsSync | เลิกใช้ → ปิด `ALLOW_HEADER_FALLBACK` ได้ | North ยืนยัน 11 ต.ค. |
| ปิดเดือน | เลือก 1ก ล็อกแน่น + 2ก ต้องผ่านครบ (11 ต.ค.) → ยกเลิกทั้งฟีเจอร์ 15 ต.ค. | — |
| ทรัพย์สิน | แบบรอบ 2: ไม่มีค่าเสื่อม · มียอดยกมา · มีกลุ่มย่อย (แบบแรกมีค่าเสื่อม ยกเลิก) | — |
| ยอดยกมา | 1ก (นับในรับ-จ่าย) · 2ก (เตือนรายการก่อนวันเริ่ม) · 3ข (สิทธิ์ตามบัญชี) + บัญชีพักแบบ Dr/Cr | — |
| เป๋าตัง/ไทยช่วยไทย | บันทึกยอดจ่ายจริง (เช่น 80) ส่วนลดรัฐไปอยู่ในโน้ต | — |
| ผังรายได้ | `customertest.xlsx` = ไฟล์สุดท้าย นำเข้าครั้งเดียว · ใช้เพื่อบันทึกเท่านั้น | — |
| ที่เก็บไฟล์ | Google Drive ผ่าน **Apps Script** (เลือก ก.) บัญชี nimz.4.april@gmail.com · PDF ล็อกรหัสเก็บต้นฉบับ ถอดตอนดู · แยกโฟลเดอร์ตามบัญชี | "แยกตาม Statement" |
| wePAY | เงินคืนหักออกจากยอด (1ก) · รูป "รายการล่าสุด" + "กล่องข้อความ" (2ก) · ทุกเบอร์หมวดเดียว (3ข) | — |
| ประวัติ/เติมหมวด | หาประวัติจากผู้รับ/ผู้จ่าย + ทิศทาง เท่านั้น ไม่ใช้จำนวนเงิน | North สั่ง (v229) |
| "ใช้อันนี้" | เปลี่ยน category ไม่ทับ Company | "ใช้อันนี้ ให้เปลี่ยน category ไม่ใช่เปลี่ยนที่ company" (v245) |
| สิทธิ์ครอบครัว | 2 ระดับ: เจ้าของ/ผู้ดูแลเห็นและแก้ได้ทั้งหมด · user เห็นเฉพาะของตัวเอง + ธุรกิจที่ร่วม · ทำภาพรวม+สิทธิ์ก่อน แล้วหนี้สิน/ทรัพย์สิน/ประกัน | North 1ก + 2ก (v248) |
| เปลี่ยนชื่อคู่ค้า | เปลี่ยนตามทุกรายการ (เก็บ contact_id) | — |
| หนี้สิน | "หนี้สินต้องเป็นเจ้าหนี้ ให้ไปผูกกับ Liability" → หมวดเงินต้นแสดงเฉพาะ LIABILITY (v281) | — |
| โอนระหว่างบัญชี | ทำครบ ก + ข + ค (แนะนำคู่, ยืนยันสองขา, สร้างขาฝั่งเงินสด) | v253 |
| ฟอนต์ | Mali ทั้งแอป · ตัวเลขคง Mali · PDF รายงานคง Sarabun · "ตัวอักษรเล็กเกินไป จางเกินไป" → ขยาย/เข้มขึ้น | v225, v233 |
| Balance Check | การ์ดเล็ก ย่อ/ขยาย ค่าเริ่มต้นย่อ "เพราะส่วนสำคัญคือรายการรอบันทึก" · ใช้ภาษาอังกฤษ/ตัวย่อได้ | v231–v234 |

---

## บั๊กสำคัญและบทเรียน

### ฐานข้อมูล / D1 / SQL

1. **`wrangler d1 execute --file` หยุดที่ error แรก** — ไฟล์ migration ที่มี ALTER หลายบรรทัด ถ้าตัวหนึ่งชน `duplicate column` บรรทัดหลังจากนั้นไม่เคยถูกรัน แต่ error บอกแค่ "คอลัมน์ซ้ำ" ทำให้เข้าใจว่ารันแล้ว · ผลจริง: `TripLegs`, `TripMemberSessions`, `TripMembers.passcode_hash` ไม่เคยถูกสร้าง ระบบผู้ร่วมทริปใช้ไม่ได้มาตลอด
   → **กติกา**: migration ต้องยิงทีละคำสั่ง (`setup-db.sh` ที่มองข้าม "ซ้ำ" และพิมพ์คอลัมน์/ตารางที่พบจริง) และต้องรันซ้ำได้ปลอดภัย
2. **`backend/db/schema.sql` ไม่ตรงกับ production** — `Captions` ใช้ `type_id` ไม่ใช่ `caption_id` → `no such column` · **กติกา**: ดู `sqlite_master` / `pragma_table_info` ของจริงก่อนเขียน SQL ทุกครั้ง
3. **schema จำลองในเทสต้องลอกจากฐานจริง (รวม CHECK)** — เคยเทสผ่านหมดแต่พังบนของจริง
4. **ไฟล์ migration ในโปรเจกต์ไม่ได้แปลว่าถูกรันแล้ว** — `add_puppup_trip_fields.sql` ไม่เคยรัน · ตรวจด้วย `pragma_table_info` ก่อนเสมอ
5. **D1 แก้ CHECK ไม่ได้ และ DROP คอลัมน์ที่มี FK ไม่ได้** → migration เป็นแบบเพิ่มอย่างเดียว (ADD COLUMN / CREATE TABLE) · CHECK จริง: `Transactions.source` ได้แค่ LINE_SLIP/LINE_TEXT/PDF_IMPORT/WEB_GRID · `status` แค่ PENDING_REVIEW/CONFIRMED
6. **`ALTER TABLE ADD COLUMN` ไม่มี `IF NOT EXISTS`** — `duplicate column name` = เคยรันแล้ว
7. **D1 จำกัด ~100 พารามิเตอร์ต่อคำสั่ง** → `IN (...)` แบ่งชุดละ 90 (`inChunks`)
8. **D1 แผนฟรีจำกัดคำสั่งต่อคำขอ (~50)** → `LedgerStatements` เก็บบรรทัดเป็น JSON ในคอลัมน์เดียว · สร้างรายการทีละ 8 บรรทัด · adopt ทีละ 25 · นำเข้า Excel ทีละ 8 ชุด
9. **`UNION ALL` เกิน ~5 ชั้น** → `too many terms in compound SELECT` · และ `VALUES (...) AS n(col)` ไม่รองรับ → ใช้ `SELECT … UNION ALL` สั้น ๆ หลายคำสั่ง
10. **`wrangler --file` ไม่พิมพ์ผล SELECT** → ใช้ `--command`
11. **D1 rows_read ระเบิด (ครั้งที่ 1: 7.95M/5M · 8 ก.ย.)** — `/api/transactions` รับ `?month=` แต่ไม่อ่าน → ดึง 14,143 รายการทุกครั้ง · `substr(t.date,1,7)=?` ทำให้ใช้ index ไม่ได้ · subquery ยอดต่อบัญชี × 34 บัญชี
    → **กติกา**: ช่วงวันที่ใช้ `date >= ? AND date < ?` (ห้าม substr/strftime/LIKE กับคอลัมน์ที่มี index) · ไม่ระบุช่วง = จำกัด 500 รายการ · รวมยอดด้วย `GROUP BY` รอบเดียว
12. **D1 rows_read ครั้งที่ 2 (6.15M/5M · 11 ต.ค.)** — correlated subquery ยอดคงเหลือใน `/api/settings` และ `/api/accounts` อ่าน ~481,000 แถว/ครั้ง (70% ของทั้งหมด) · เปิดแอป 1 ครั้งอ่าน ~670k แถว
    → แก้ด้วย index (`idx_tx_acc_status_amt`, `idx_tx_status_date`, `idx_td_category` ฯลฯ) + `PRAGMA optimize` + ยืนยันด้วย `EXPLAIN QUERY PLAN` (SCAN → SEARCH USING COVERING INDEX) · มีเทส `endpoints.test.mjs` ตรวจแผนคำสั่งว่าใช้ดัชนี · `diag-d1.sh` ดู insights ได้แม้โควตาเต็ม · **rows_written เกิน** เพราะนำเข้า 29k แถว × index (ครั้งเดียว)
13. **`INSERT OR REPLACE` ไม่ยิง DELETE trigger** และลบลิงก์ที่ไม่ได้ส่งมา — การ์ดรอตรวจเดิมไม่ส่ง `slip_image_url` → ลิงก์สลิปหาย · ต้องส่งทุกคอลัมน์กลับ หรือเช็กล็อกเอง
14. **ลบแล้วใส่บรรทัดย่อยใหม่ทำให้ Settlements (การตัดชำระ) หาย** (FK cascade) → `settle-keep.js` จำแล้วใส่กลับใน batch เดียว · บรรทัดที่ตัดชำระแล้วถูกแก้ยอด → 409
15. **เปลี่ยน ID ด้วย INSERT ใหม่ + ลบเก่า** → คอลัมน์ที่เพิ่มทีหลังหาย (เช่น `Accounts.tx_entity_id`) และตารางใหม่ยังชี้รหัสเก่า → `id-cascade.js`: batch เดียว `PRAGMA defer_foreign_keys` + UPDATE ทุกตาราง/คอลัมน์ที่เก็บรหัสนั้น (อ่านจาก `sqlite_master` + `table_info`) + JSON ใน `OpeningSets.lines`
16. **`ORDER BY sort_order` กับ NULL** — SQLite เรียง NULL มาก่อน → ใช้ `COALESCE(sort_order, 999999)`
17. **ล้างข้อมูล (`/api/reset`) เคยข้าม error เงียบ ๆ** ลบครึ่ง ๆ กลาง ๆ → error อื่นที่ไม่ใช่ "no such table" ต้องหยุดทันที · restore แบบ replace ต้องตรวจไฟล์ก่อนล้าง (ไฟล์มีรายการ < ครึ่งของระบบ → 409 ขอยืนยัน)
18. **regex ตรวจ "โควตาเต็ม" กว้างเกินไป** จับ `D1_ERROR` ทั่วไปเป็น 503 → ทำให้แคบ · error ทั้งหมดผ่าน `dbErrorResponse()` ไม่ส่ง stack

### การเงิน / ตรรกะบัญชี

19. **ปิด → เปิด → ปิดทริป โพสต์ซ้ำ ฿14,052** → ต้องมีแถวกลับ (REOPEN วันที่เดิม) และยอดที่เข้าบัญชี = `SUM(ledger_total)` ทุกแถว ไม่ใช่แถวล่าสุด
20. **ปิดทริปไม่ลงบัญชีเลยสักบาท แต่ toast ขึ้นว่า "ยอดถูกบันทึกเข้าบัญชีจริง"** — โพสต์เมื่อมี `account_id` แต่หน้าจอไม่เคยส่ง · เครื่องหมายบวก (ยอดคงเหลือจะเพิ่ม) · **กติกา**: ข้อความยืนยันต้องพูดสิ่งที่เกิดจริง (นับจำนวนรายการที่เขียนจริง)
21. **สูตรเครื่องหมาย**: ข้อมูลจริง `ยอดหัว = Σยอดย่อย − Σfee − Σwht` (fee บวกเสมอ · wht เครื่องหมายเดียวกับยอดย่อย) แต่ฟอร์มกรอกมือเดิมใช้ `|หัว|=|ย่อย|+|fee|+|wht|` และแบบฟอร์ม Excel เดิมคิดค่าธรรมเนียมกลับด้าน
22. **แดชบอร์ดนับเงินโอนเป็นรายรับ** (2,462 แถว) เพราะดูแค่ Caption behavior → จัดฝั่งด้วย `d.type` ก่อน (INCOME/CREDIT_AR รับ · EXPENSE/DEBIT_AR จ่าย · TRANSFER ไม่นับ)
23. **หมวดที่ JOIN ไม่ติด = แถวหายจากทุกสรุปเงียบ ๆ** → ตรวจว่าหมวดมีจริงและเป็นของครอบครัวนี้ทุกครั้งที่เขียน
24. **หนึ่ง Transaction ผูกได้บัญชีเดียว** — เติมจากสองบัญชีต้องแตกเป็นสองใบ
25. **เดาค่าเงียบ ๆ** (`fundedForeign ? … : exchangeRate`) → คืน `null` ให้จอบอกว่าตีมูลค่าไม่ได้ · ปิดทริปทั้งที่มีเงินเหลือแต่ไม่บอกปลายทาง → 400 · **กติกา**: "ล้มเหลวต้องดัง"
26. **หารบิล**: เศษไปรวมคนเดียว (admin → เจ้าของบิล → คนแรก) ไม่กระจายทีละสตางค์ · เศษติดลบได้ · MANUAL ไม่เกลี่ยเศษ
27. **ยอดเงินกู้หน้าเก่าสูตรกลับด้าน** (`start_balance − Σprincipal` ผิดเครื่องหมายเมื่อจ่ายคืนเป็นยอดลบ) → คงเหลือ = start_balance − (−Σเงินต้น)
28. **รายงาน WHT เดิมกรอง `wht > 0`** → ฝั่ง "เราหัก" (ติดลบ) ไม่เคยแสดง

### นำเข้า statement / OCR / AI

29. **รหัสรายการ (`generateTxId`) ชนกัน** หลายแบบ: ใช้ยอดบวกเสมอ → ซื้อ/คืนยอดเท่ากันวันเดียวกันทับกัน (v206) · ปัดยอดเป็นบาท → 129.75 กับ 130.00 ชนกัน (v248) · ตัด ref_code 10 ตัวแรก → wePAY ทั้งเดือนรหัสเดียว (v241)
    → **กติกา**: รหัสต้องมาจากยอดติดเครื่องหมายเต็มสตางค์ + ลำดับซ้ำในไฟล์ (`dup_idx`) + ref เต็ม (hash)
30. **ตรวจซ้ำด้วยลำดับบรรทัด (`stmt_seq`)** พังเมื่อไฟล์อ่านได้ครบกว่าเดิม ลำดับเลื่อน → ทุกบรรทัดดูใหม่ (v204) → ใช้ `dup_idx` (ลำดับของรายการที่เหมือนกันทุกช่อง) · หัว statement หาของเดิมด้วย บัญชี + ช่วงทับ + ยกไปเท่ากัน ไม่ใช่วันที่ตรงเป๊ะ · "ไฟล์คือความจริง" (`/api/statements/sync`)
31. **AI สลับช่องเข้า/ออก, อ่านตก, รวม 2 บรรทัดที่หน้าตาเหมือนกัน** (กรุงไทย v266) → เชื่อ "ยอดคงเหลือ" (`fixStatementSigns`) · ด่านเดินยอด `walkStatement` (เดินไม่ลง = 409 ห้ามสร้าง) · **ใช้ตัวอ่านตัวหนังสือ PDF ก่อน AI** (ต้องตรง ≥95%)
32. **error หลังอ่านสำเร็จทำให้ตกไปส่ง AI อ่านซ้ำเงียบ ๆ** (v269) → `noAi()` แสดง error แทน fallback
33. **ตัวอ่าน PDF เจอของแปลก**: ขีดดำขอบกระดาษอ่านเป็น "l"/"ll" (v205) · เครื่องหมายลบวาดแยกไม่อยู่ในชั้นตัวหนังสือ (CardX v217 → ดูขอบขวา) · ตัวหนังสือหมุน 90° (กรุงไทย JasperReports v254) · ตัวเลขฟอนต์ฝัง Ř–š (v266) · ฟอนต์ไทยเข้ารหัส "Ñ¯Ï…" (กรุงศรี HomePro v252) · ป้ายไทยแตกเป็นชิ้น (กรุงศรี v248) · วันที่+เวลา(+รายการ) อยู่ช่องเดียว (SCB v213, กรุงศรีออม v250) · "Beginning Balance" ภาษาอังกฤษ (v210) · คอลัมน์ภาษีกรุงไทย (v265)
34. **ตัวอ่าน statement ธนาคารอ่านใบแจ้งยอดบัตรผิด** (บรรทัดสรุป CardX = 1 รายการ, บรรทัดเครดิตบูโร KTC) → **ลองตัวอ่านบัตรก่อน** ไม่ใช่บัตรค่อยใช้ตัวอ่านธนาคาร
35. **ใบแจ้งยอดบัตรหลายบัตรในไฟล์เดียวถูกรวมเข้าบัญชีเดียว** → แยกตามหัว "เลขที่บัตร" · บัญชีเดียวมีเลขซ้ำกับบัตร (A23 vs C06) → เลือกตามประเภทไฟล์ · บัตรเปลี่ยนเลข → ช่องเลขบัญชีรับหลายเลข
36. **หัว statement + จุดตรวจยอดค้าง** หลังลบรายการที่นำเข้าผิดบัญชี → `cleanupStatementHeaders` อัตโนมัติ
37. **ข้อความธนาคารถูกทับด้วยชื่อ Caption** ตอนบันทึกการ์ด → นำเข้าไฟล์เดิมซ้ำแล้วกันซ้ำไม่ได้ · เก็บข้อความธนาคารเดิมเสมอ
38. **`match_existing` จับเฉพาะ LINE/WEB_GRID** ไม่รวมข้อมูลเก่าจาก Excel → สร้างซ้ำ · statement 2 ฉบับช่วงทับกัน ข้อความต่างกัน → ใช้ บัญชี+วัน+เวลาถึงนาที+ยอด เป็นตัวตัดสินเมื่อมีเวลา
39. **AI ตอบ JSON เพี้ยน/ขาด** → `parseAiJson` (ตัด ```, comma ท้าย, แถวไม่จบ) + ให้ AI อ่านใหม่ 1 ครั้ง · Gemini 503 high demand → ลองซ้ำ 3 ครั้งแล้วสลับรุ่นสำรอง (`GEMINI_FALLBACK_MODELS`) · 401/403 แจ้งทันที (key)
40. **ข้อจำกัดรุ่นเก่าของหน้า statement ใหม่**: แปลง PDF เป็นรูปเสมอ + ไม่ลองใหม่ → ล้มง่าย · PDF ไม่มีรหัสให้ส่งทั้งไฟล์ · มีรหัสค่อยแปลงเป็นรูป · ลองรหัสตามลำดับ (ช่องกรอก → บัญชีที่เลือก → ธนาคารเดียวกัน → ทุกบัญชี)

### LINE / Workers / เบื้องหลัง

41. **สลิป LINE ค้าง READING** — เดาตอนแรกว่าเกิน CPU ~10ms (แก้โดยส่งไบต์ดิบขึ้น Gemini Files API) แต่ต้นเหตุจริงจาก `wrangler tail` คือ `POST /api/line-webhook - Canceled` (LINE ตัดสายเพราะรอนาน) → ตอบ OK ทันที แล้วทำงานต่อด้วย `ctx.waitUntil` · **บทเรียน**: ดู log จริงก่อนสรุปสาเหตุ
42. **โค้ด LINE ทั้งหมดไม่เคยรันบน production** (ไม่มี secret) → คำสั่งสรุปพัง (อ้าง `cp.behavior` ไม่ JOIN, `tx.details` ที่ไม่มี) · อ่านแค่ event แรก · **บทเรียน**: โค้ดที่ไม่เคยถูกใช้จริงให้ถือว่ายังไม่ทำงาน
43. **QR บอท LINE เขียนตายตัว `@recordrevenue`** (ไม่ใช่บอทจริง) → ถาม `/v2/bot/info` เอา basicId จริง
44. **อ่านรูปจำนวนมาก** → อัปไว้ก่อน (`QUEUED`) แล้วให้ cron `*/5 * * * *` + หน้าเว็บอ่านต่อ · READING ค้าง >15 นาที คืนเป็น QUEUED

### Frontend / UI

45. **`//` คอมเมนต์ท้ายบรรทัดที่มีโค้ดต่อ** ปิดโค้ดที่เหลือในบรรทัดเดียวกัน → คอลัมน์รายงานยอดสะสมเลื่อน 2 ช่อง (v268) · syntax ยังถูก ตัวตรวจไม่จับ · **กติกา**: ห้ามใส่ `//` ท้ายบรรทัดที่มีโค้ดต่อ ใช้ `/* */`
46. **ฟังก์ชันที่ถูกลบแต่ชื่อยังถูกเรียก** (`renderMemberAccess`) → ทั้งแอปพัง ทั้งที่ `node --check` และเทส backend ผ่านหมด · และ `check-frontend*.mjs` เดิมตรวจแค่หน้าทริป **ไม่เคยตรวจแอปหลัก** (พบ v271) → **กติกา**: มีด่านอ่านโค้ด (ฟังก์ชันไม่มีประกาศ, `#id` ไม่มีใน HTML, onclick ชื่อไม่มี, ปีกกา CSS) + ด่านรันจริงใน jsdom เปิดทุกหน้า ก่อน deploy ทุกครั้ง
47. **ธีมตั้งที่ `<body data-theme>` ไม่ใช่ `<html>`/`:root`** → กฎ "เฉพาะธีมสว่าง" ต้องใช้ `body:not([data-theme="dark"])` · โหมดมืดต้องใช้ตัวแปรสีธีม ไม่ใช่พื้นขาวตายตัว
48. **selector ที่ไม่เคยตรงอะไรเลย** — `.topbar>div:nth-child(2)` (ลูกที่ 2 คือ `<button>`) · `.top-header` มี `style="display:flex"` inline → กฎซ่อนใน CSS ไม่เคยทำงาน · **บทเรียน**: ตรวจบนจอจริงว่ากฎมีผล
49. **CSS specificity ทับกัน** — `#planEditor select` (id) ชนะทุก class → ช่องเวลาบานเป็นสองกล่อง · ห้ามแก้ด้วย `!important` ให้แก้ที่ต้นทาง · ห้ามผูกสไตล์ฟอร์มกับชื่อฟอร์มทีละอัน (ฟอร์มใหม่จะหลุด)
50. **ชื่อ "พื้นที่" ผิด/ลืมส่งใน `financeLocked()` / `blockedByClose()`** (`'bills'` แทน `'expenses'`, เรียกเปล่า) → ล็อกทุกอย่างเงียบ ๆ ปุ่ม ＋ ตาย → ชื่อไม่รู้จักต้อง `console.error`
51. **`select.value` ที่ไม่ตรง option ไม่ throw แค่กลายเป็นว่าง** (`'สถานที่'` vs `'สถานที่หลัก'`) → ตรวจว่าค่ามีใน options ก่อน
52. **เพิ่มฟิลด์ใหม่ต้องไล่ครบ 4 จุด: ตาราง · เขียน · อ่าน · แมปที่ตัวแปลง (`api.js`)** — ขาดจุดสุดท้าย = "บันทึกติดแต่อ่านไม่กลับ" (`exclude_on_close`) · `?? ` ไม่ใช่ `||` กับค่าที่เป็น 0 ได้ (`color_hue`)
53. **วันที่สองรูปแบบ** (ISO vs ข้อความไทย) เข้า `new Date()` → RangeError ตั้งแต่วาดรอบแรก ทำให้ฟังก์ชันถัดไปตายเงียบ → เช็ค `/^\d{4}-\d{2}-\d{2}$/` ก่อนคำนวณ
54. **`font:` shorthand ล้าง `font-family`** → ภาษาไทยเป็นสี่เหลี่ยม · `scrollIntoView` ไม่ทำงานกับ `display:none` · `transform-box` ของ SVG ต้อง `fill-box` · render ใหม่ใน `dragover` ทำลาย node ที่ลาก · `<img>` ต้อง `draggable="false"` · HTML5 drag-and-drop ใช้บนมือถือไม่ได้
55. **Safari เข้ารหัส WebP ผ่าน canvas ไม่ได้** ถอยเป็น PNG เงียบ ๆ → ตรวจ `blob.type` จริง แล้วถอยไป JPEG
56. **ค่า state "กำลังแก้" ไม่ถูกล้าง** (`editingFundingId`, `editingBillId`) → เพิ่มใหม่ไปทับของเก่า · `applyLiveState()` ตั้ง `activePlanDayId = planDays[0].id` ตายตัว → เด้งกลับวันแรกทุกครั้งที่บันทึก
57. **ข้อมูลตัวอย่างค้างบนจอ** (`renderTodayWeather` ผูก dayId ตัวอย่าง → return เงียบ ปล่อยตัวเลขเดิม) · ป้าย "ข้อมูลจำลอง" ค้างบนข้อมูลจริง → **กติกา**: ข้อความบนจอต้องตรงกับข้อมูลจริง · ห้ามอ้างว่าอากาศ/ตำแหน่งเป็นข้อมูลจริงถ้าไม่ได้ดึงจริง
58. **ช่องตัวเลขมี 0 ค้าง** พิมพ์แล้วได้ "0250" (v278) → focusin: ค่า 0 → ว่าง · มีค่า → เลือกทั้งหมด · ช่องกรอก ≥16px บนมือถือกัน iPhone ซูมเอง
59. **มือถือ**: ลูก flex column ไม่มี `min-width:0` → การ์ดกว้างเกินจอ (v279) · ล็อก `overflow:hidden` ของ main ทำให้ตั้งค่าเลื่อนไม่ได้ (v274) · ท้ายหน้าถูกเมนูล่างบัง → padding-bottom + safe-area · modal ต้อง z-index เหนือเมนูล่าง
60. **เบราว์เซอร์ North รันแอปเก่า** (แท็บค้าง/แคช) ทั้งที่เซิร์ฟเวอร์เป็นรุ่นใหม่ (v218) → ป้ายเวอร์ชัน + ตรวจ index.html ทุก 5 นาที + `_headers` `Cache-Control: no-cache` · **กติกา**: แก้ frontend ต้อง bump `?v=` และไฟล์ที่ใช้ร่วมกันต้องเลขเดียวกันทุกหน้า (เคยมี join.html ค้าง api.js?v=24)
61. **ปุ่ม "+ เพิ่ม" POST รายการว่างทันที** → ใช้การ์ดร่างในเครื่อง (`_draft`) บันทึกเมื่อมียอดจริง (v275)
62. **หน้าแก้ไขสมาชิกเว้นรหัสว่าง → หน้าจอส่ง '1234'** รหัสถูกเปลี่ยนเงียบ ๆ → เว้นว่าง = ใช้รหัสเดิม

### ประสิทธิภาพ

63. **`innerHTML +=` ในลูป** (รายชื่อคู่ค้า 1,500) → ช้ากำลังสอง เปิดหน้าต่างตั้งค่า 9.9 วิ → ใช้ `map().join` เหลือ 0.015 วิ (แก้ 14 จุด)
64. **วาดการ์ดรอตรวจครบทุกใบ** (จริง 1,969 ใบ) ค้างใน DOM ทำให้ทุกหน้าช้า → วาด 30 ใบแรก + ทีละ 40 เมื่อเลื่อนถึง (IntersectionObserver) · ยืนยัน/ลบเอาการ์ดออกในเครื่อง ไม่โหลดใหม่ทั้งหมด · ฟังก์ชันที่ต้องใช้ทุกใบให้วาดครบก่อน
65. **หน้ารอตรวจ/ประวัติโหลดแค่ 500 ล่าสุดโดยไม่รู้ตัว** → รายการ "หาไม่เจอ" · ต้องบอกบนจอ หรือส่ง `limit=0` เมื่อจำเป็น
66. **สคริปต์หนักใน `<head>`** (xlsx-latest ~900KB ซ้ำกับ xlsx-js-style) → ตัดทิ้ง + `defer` ทุกสคริปต์ · ล็อกเวอร์ชัน CDN (pdf-lib@1.17.1, sweetalert2@11.26.25, chart.js@4.5.1)
67. **Safari ช้าเพราะ preflight CORS ทุกคำขอ** (มี Authorization) → `Access-Control-Max-Age 7200` · มีตัววัด `?perf=1`
68. **`GET /api/settings` ยิงทีละคำสั่ง + ยอดบัญชีไล่ทีละบัญชี** → `Promise.all` + `GROUP BY` ครั้งเดียว · แคชข้อมูลหลัก 10 นาทีใน sessionStorage และล้างเมื่อ POST
69. **แดชบอร์ดโหมดปี/ทั้งหมด ส่งรายการย่อยทั้งหมด (~15k แถว ≈ 4MB)** → ควรรวมฝั่งเซิร์ฟเวอร์ (รายงานใหม่รวมใน SQL ด้วย GROUP BY)

### สิทธิ์ / ความปลอดภัย

70. **`ALLOW_HEADER_FALLBACK = true`** — ใครรู้ `user_id` ก็ `curl -H "x-user-id: …"` อ่านการเงินทั้งครอบครัวได้ → ปิด 11 ต.ค. หลังเลิก GoogleSheetsSync · **กติกา**: ประตูล็อกอินเดียวหลัง `/api/login` ทุก route ต้องมี `authUserId` ไม่งั้น 401
71. **endpoint เดิมไม่ตรวจเจ้าของ** — `/api/transactions/confirm|delete` (delete ไม่ลบ TransactionDetails ด้วย) · `/api/reports/trial-balance` · `/api/export` · settings save/delete ข้ามครอบครัว · bulk-import เขียนทับ transaction_id ของบัญชีอื่นได้ → helper `canUseAccount`, `canWriteTx`, `familyOf`, `deny` + `security.test.mjs`
72. **สิทธิ์ฝั่งเขียนถูกแต่ฝั่งอ่านไม่ส่งข้อมูล** (ผู้ดูแลทริปไม่เห็นกระเป๋าคนอื่น · `managed_by` ใช้ไม่ได้ 100%) → **กติกา**: ทุกครั้งที่ให้สิทธิ์เขียน ต้องไล่ฝั่งอ่าน และฟังก์ชันสิทธิ์ฝั่งเซิร์ฟเวอร์กับหน้าจอต้องเหมือนกันเป๊ะ ("เห็นปุ่มแต่กดแล้ว 403" = ผู้ใช้อ่านว่าแอปพัง)
73. **ตัวตนผู้ร่วมทริปขึ้นมาแทนเงียบ ๆ** เมื่อ session ครอบครัวหมด (token ที่จำไว้ถาวร) และถูกลดสิทธิ์เป็นไม่ใช่ admin → ต้องบอกสถานะบนจอ + มีปุ่มออก
74. **id ที่เดาได้** (`Date.now()+Math.random()`) → `crypto.randomUUID()` · ไม่เชื่อ id จาก client (ตรวจว่าแถวอยู่ในทริป/ครอบครัวนี้จริง) · ไม่รับ `rate` จาก client · `?next=` รับเฉพาะ path โดเมนเดียวกัน
75. **token หมดอายุ (30 วัน) = หน้าว่าง** ทุกคำขอ 401 แต่จอไม่รู้ตัว → fetch wrapper พากลับหน้าล็อกอินพร้อมเหตุผล
76. **`alert` แสดงรหัส PDF** → ลบออก · `/api/settings` ไม่ส่งรหัสลับ Drive กลับ · R2 `serveIcon` ปฏิเสธ key ที่ไม่ขึ้นต้น `icons/` หรือ `db/` (ห้ามถอด) · ไฟล์สลิปเปิดได้เฉพาะคนในครอบครัวที่ล็อกอิน
77. **ค่าใน HTTP header ใส่ภาษาไทยไม่ได้** (ByteString)
78. **sessionStorage ไม่ข้ามแท็บ** → ลิงก์ไปหน้าทริปต้องเปิดในแท็บเดิม ห้าม `target="_blank"` และไม่ใส่ `userId` ใน URL

### Deploy / สภาพแวดล้อม / git

79. **รันคำสั่ง deploy นอกโฟลเดอร์โปรเจกต์** ได้อาการที่ดูไม่ออกว่าเกี่ยวกับ `cd` (`setup-db.sh: No such file`, `ENOENT scandir /Users/DNorth/frontend`, permission error `.Trash`) → `deploy.sh` มี `cd "$(dirname "$0")"` บรรทัดแรก (ตรวจ 2 ชั้น → setup-db.sh → Worker → Pages)
80. **ต้องรัน ALTER ก่อน deploy worker** ที่เขียนคอลัมน์ใหม่ ไม่งั้นบันทึกไม่ได้ทั้งระบบ (`no such column: stop_tag`) · ทางเลือก: ตารางสร้างเองตอนเรียกครั้งแรก (`ensureStmtCols`, AccountCheckpoints, AssetItems ฯลฯ)
81. **ห้าม `git add -A`** — root มี dump ฐานข้อมูลจริงที่มีรหัสผ่าน เคยขึ้น GitHub · แก้ด้วยการเปลี่ยนรหัส ไม่ใช่ลบ commit · `.gitignore` ใส่ "Claude outputs/" (statement จริง), `_to_delete/`, `ภาพและไอคอน (ChatGPT)/`
82. **โปรเจกต์อยู่ใน Google Drive** → `HEAD.lock`/`index.lock` ค้าง · ไฟล์เป็น cloud-only (`not a git repository`, `wrangler Operation timed out`) → Make available offline · แนะนำย้ายไป `~/Projects/RecordRevenue` (ยังไม่ทำ)
83. **`new URL(import.meta.url).pathname`** เข้ารหัส path มีช่องว่าง (`My Drive`) → ใช้ `fileURLToPath` · `.gitignore` ใช้ `node_modules` (ไม่มี `/`) เพราะจับ symlink ไม่ได้
84. **หลาย chat แก้ไฟล์ชุดเดียวกัน** (พบ 3 ก.ย.) และ container ถูกล้าง (`/tmp/rr4` หายหลัง 3 สัปดาห์) → stage ไฟล์จากเครื่อง North มาเทียบก่อนแก้ทุกครั้ง
85. **`device_commit_files` แคชตาม stagedPath** — commit ซ้ำชื่อเดิมเขียนเนื้อหาเก่าลงเครื่อง → ตั้งชื่อ stage ใหม่ทุกครั้ง + ตรวจ md5 หลัง commit · รอให้ mount ฝั่ง VM อัปเดตก่อนแก้ต่อ
86. **`wrangler dev` เสิร์ฟแค่ backend** ต้องเสิร์ฟ `frontend/` แยก (`npx serve .`) · sandbox บางที่รัน wrangler ไม่ได้ (esbuild ไม่ตรง)
87. **เทสผ่านหมดไม่ได้แปลว่าหน้าเว็บเปิดได้/สวย** — jsdom ไม่มี layout · งานที่ไม่เคยเห็นหน้าจอจริงต้องขอภาพจาก North · ใช้ Playwright + mock API ตรวจหน้าตา 3 ขนาดจอ (และสคริปต์วัดขนาดตัวอักษร/คอนทราสต์/ล้นจอ)

---

## สิ่งที่ยังค้าง / ไอเดียถัดไป

### ค้างที่ North ต้องทำเอง (ข้อมูลจริง)
- ลบ statement ที่นำเข้าด้วยวิธีเก่า (รอตรวจ) แล้วนำเข้าใหม่: C04 กรุงศรี เม.ย./พ.ค./มิ.ย. 69 (v248) · A15 กรุงไทย ฉบับ 2601_2603, 2511_2601 (v265), 2604_2606 (v266), 06–08/69 `…0MO31` (v267), 06/01–08/13 `4TNJL` แล้วนำเข้า 2606_2608 ใหม่ (v269)
- A08 กรุงศรีออมทรัพย์: กด "+ Add bank balance" 29/05/2026 = 12,943.01 แทนการนำเข้าซ้ำ (v250)
- A23 Planet SCB น่าจะใส่เลขบัตรผิด (v216)
- กรอกเลขบัญชีเต็มใน ตั้งค่า→บัญชี เพื่อให้รู้บัญชีจากสลิปได้ตั้งแต่ใบแรก (`Accounts.account_number` เคยว่างทุกบัญชี)
- Puii ยังไม่มีสิทธิ์ Company ใด → สร้าง "Puii (ส่วนตัว)" (ไม่ใช่บริษัท) + ให้สิทธิ์ + ธุรกิจที่ร่วม (v249) · ผูก LINE ID ของ 9North/Puii (เคยว่างทั้งคู่)
- หนี้เดิมที่ผูกหมวดเงินต้นนอกกลุ่ม Liability จะขึ้นว่าง ต้องเลือกใหม่ (v281)
- `git rm` หน้า ledger ที่เลิกใช้ · commit จุดกู้คืน (เคยค้างหลายรอบ)
- รัน `setup-r2-lifecycle.sh` (ลบ `ledger-docs/` อัตโนมัติ 30 วัน) — ระบุว่า North ต้องรัน
- deploy งาน 15–30 ต.ค. (ระบุค้างเมื่อ 30 ต.ค.)

### ค้างในโค้ด / ข้อเสนอที่ยังไม่ทำ
- เลือกหมวดเงินต้นในหน้ารอตรวจแล้วแยกต้น/ดอกอัตโนมัติจาก `splitInstallment()` (ข้อเสนอล่าสุด 1 พ.ย.)
- Full Backup/Restore ยังไม่พา `stmt_*` ไปด้วย · statement ที่นำเข้าก่อน v196 ไม่มียอดรายบรรทัด (นำเข้าไฟล์เดิมซ้ำเพื่อเติม) · บัตรเครดิตไม่มียอดรายบรรทัด เทียบได้แค่ยกมา/ยกไป
- ไฟล์สแกน (ไม่มีตัวหนังสือ) ในการนำเข้าหลายไฟล์ ต้องนำเข้าทีละไฟล์ผ่าน AI · ตัวอ่าน PDF ไม่ใช้ AI ครอบคลุมเฉพาะธนาคาร/บัตรที่ทดสอบแล้ว (KBank, SCB, CardX, KTC, กรุงศรี, กรุงไทย)
- ปุ่มเล็ก 1–2 จุดบนมือถือ (ลิงก์ในหน้าหนี้, ปุ่มย้อนในรายละเอียดบัญชี) — ยอมรับได้
- `travel.js` ยังโหลดอยู่ และฟังก์ชันทริปใน `app.js` ยังอยู่แต่ไม่มีทางเรียก (หลัง v271) — ทำความสะอาดได้
- `users/delete` และ `/api/reset` ยังทำทีละคำสั่ง (ใช้น้อย admin เท่านั้น) · bulk-import ยังไม่ใช้ `settle-keep`
- backend `period-close` + trigger ยังอยู่ (ไม่มีผลถ้าไม่มีเดือนที่ปิด) แต่ฟีเจอร์ถูกยกเลิกแล้ว
- ปิดเดือนข้อ statements ใช้ `LedgerStatements` แต่แอปเดิมนำเข้า statement เป็นรายการรอตรวจตรง ๆ (ค้างตัดสินใจ 12 ต.ค. — ก่อนยกเลิกฟีเจอร์)
- กันลบหมวดที่มีรายการอ้างถึง · ปุ่มรวม/ย้ายหมวด (ของเก่าเปลี่ยนตาม) — ค้างจากรอบ Expense2
- `xlsx` บางจุดเคยยังเป็น `xlsx-latest` (ตรวจเวอร์ชันไม่ได้ ณ 15 ต.ค.) ต่อมาตัดทิ้งใน v211 เหลือ xlsx-js-style 1.2.0
- ย้าย `.git` / โปรเจกต์ออกจาก Google Drive ไป `~/Projects/RecordRevenue` + ใช้ GitHub เป็นที่สำรอง
- รอภาพจาก Safari (ตัววัด `?perf=1`) เพื่อแก้ความช้าเฉพาะ Safari ตรงจุด (v239)
- ไอเดียจาก ChatGPT/งานออกแบบ: ชุดไอคอนหมวด (ระบุใน 009)

### หมายเหตุ
- ระบบทริปถูกปิดและลบข้อมูลแล้วใน v271 — งานค้างฝั่งทริปทั้งหมด (CARRY สร้างล็อตจริง, ระบบหลายทริป, ปุ่ม "บันทึกลงสมุดจด" จากการจอง, ลากบนจอสัมผัส, สิทธิ์ดูอย่างเดียว) ไม่ต้องทำต่อ เว้นแต่ North จะเปิดกลับ (โค้ดอยู่ใน `archive/trip-frontend-v271/` และ backup JSON)

---

## กติกาการทำงานกับ North

### การสื่อสาร
- คุย **ภาษาไทยเท่านั้น** · North ไม่ใช่โปรแกรมเมอร์ → อธิบายเป็นภาษาคน ไม่ใช้ศัพท์โค้ดโดยไม่จำเป็น
- ตอบสั้น ตรงประเด็น อย่าอธิบายยาว
- **ไม่ใช้ AskUserQuestion** → ถามเป็นข้อความธรรมดา ใส่ตัวเลือก **ก. / ข. / ค.** (North ตอบแบบ "1ก 2ก 3ข", "ก + ข + ค")
- งานหน้าตา: ทำ mockup ให้เลือกก่อน ("ดูจนพอใจก่อนทำ") · ส่งภาพเทียบให้เลือก (เช่น ฟอนต์ตัวเลข Mali/Inter/IBM Plex/Sarabun) · รักษาโทนภาพ/ฟอนต์/แผนที่ที่ North เลือก

### คำสั่งและการ deploy
- **คำสั่ง terminal ทั้งหมด North รันเอง** — AI ให้คำสั่ง ห้ามรันแทน (ยกเว้นอ่านไฟล์บนเครื่องเพื่อดู) · คำสั่ง D1/deploy ส่งให้ North เสมอ
- **อย่ารัน migration หรือ deploy โดยไม่ได้รับคำสั่ง**
- deploy: `bash deploy.sh` (ตรวจ 2 ชั้น → setup-db.sh → Worker → Pages) · ทางเข้าโฟลเดอร์: `cd "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue"` (หรือ `cd ` แล้วลากโฟลเดอร์จาก Finder มาวาง) · หลัง deploy frontend ให้ hard refresh `Cmd+Shift+R`
- migration ใหม่ = เพิ่ม `step "SQL" "ชื่อที่อ่านเข้าใจ"` ใน `setup-db.sh` (หรือให้ตารางสร้างเองตอนเรียกครั้งแรก) — ห้ามใช้ `--file`

### ก่อนแก้ไฟล์
- **stage ไฟล์จากเครื่อง North มาเทียบก่อนทุกครั้ง** (อีกแชทอาจแก้ไปแล้ว) ห้ามทับด้วยสำเนาเก่าใน container (container ถูกล้างได้ทุกเมื่อ)
- `device_commit_files`: ตั้งชื่อไฟล์ stage ใหม่ทุกครั้ง แล้วตรวจ md5 ในเครื่องหลัง commit
- ตรวจของจริงก่อนเชื่อไฟล์ — schema, ผล API, ตำแหน่ง element บนจอ · **ห้ามเดาจากอาการเวลาดีบัก — query ค่าจริงในฐานก่อนเสมอ** (ใช้ `--command` แบบอ่านอย่างเดียว เช่น `diag-account.sh`, `diag-d1.sh`)
- ก่อนสร้างตาราง/คอลัมน์ใหม่ เช็คก่อนว่ามีอยู่แล้วไหม (`TripDocuments` เคยชนชื่อ)

### ก่อนบอกว่า "เสร็จ"
- รัน `node check-frontend.mjs` · `node check-frontend-runtime.mjs` · เทส backend ทุกชุด (`backend/test/*.test.mjs`) ให้ผ่านหมดใน container ก่อน แล้วให้ North รัน `deploy.sh`
- bump `?v=` ของไฟล์ที่แก้ (และไฟล์ที่ใช้ร่วมกันต้องเลขเดียวกันทุกหน้า — ตัวตรวจเช็คให้)
- ตรวจหน้าตาด้วย Playwright + API จำลอง ที่ คอม / iPad / มือถือ (390/375px) เพราะเทส backend ไม่ได้รัน `app.js` และ jsdom ไม่มี layout
- เทสต้องจับ "ความหมาย" ไม่ใช่แค่ "ไม่ error" (เช่น ยอดจากสองเส้นทางต้องเท่ากัน)

### หลักการออกแบบที่ North ยึด
- ตัวเลข: ทศนิยม 2 ตำแหน่ง · `,` หลักพัน · ติดลบใส่วงเล็บสีแดง (แบบบัญชี) · หน้าบัญชีไม่ใส่ ฿ และไม่ใส่ +
- ใช้งานง่ายบน Mac / PC / iPad / iPhone · หน้าภาพรวมตัวหนังสือน้อย ใช้ไอคอน เห็นทั้งระบบ
- ตัวหนังสือต้องไม่เล็ก/จางเกินไป (ฟอนต์ Mali · ตัวเล็กสุด 14px · ช่องกรอกมือถือ 16px)
- ล้มเหลวต้องดัง: 400/409 พร้อมเหตุผลที่บอกทางแก้ ดีกว่าเดาค่าแล้วผ่านไปเงียบ ๆ · ข้อความบนจอต้องตรงกับข้อมูลจริง
- อย่าอ้างว่าข้อมูลอากาศ/ตำแหน่งเป็นข้อมูลจริงถ้าไม่ได้ดึงมาจริง · อย่าฝังชื่อ/หมุดลงภาพ banner ให้ overlay ด้วยโค้ด
- เปิดของทีละส่วน (เช่น สวิตช์ `LIVE_WRITABLE`) · เก็บหน้าเก่าไว้เปิดฉุกเฉินได้ (`index.html?classic=1`) ระหว่างย้าย

### บันทึกงาน
- อัปเดต `HANDOFF.md` ทุกรอบ (ใส่เลขรุ่น `app.js?v=` / `ui-a.css?v=`, เทสที่ผ่าน, สิ่งที่ North ต้องทำ) · North สั่ง "บันทึกก่อนย้ายแชท"
- งานภาพ/ออกแบบกับ ChatGPT: Claude เขียน prompt ใน `ภาพและไอคอน (ChatGPT)/design.md` + `requests/` + `STATUS.md` → North สั่ง GPT → Claude ตรวจภาพเทียบ prompt → ผ่านคัดเข้า `คลังภาพ/` · ไม่ผ่านเขียน "รอบแก้"

---

# ส่วน F — แผนสร้างโปรเจกต์ใหม่ทีละขั้น (พิมพ์เขียว)

> ลำดับนี้กลั่นจากสิ่งที่ทำจริง + บทเรียนข้างบน · ทำทีละเฟส แต่ละเฟสจบด้วยเทสและ deploy ได้

## เฟส 0 — วางรากฐาน (วันแรก)
1. สร้าง repo: `backend/` (Worker), `frontend/` (Pages), `backend/test/`, `archive/`, `.gitignore` ที่กันไฟล์การเงินจริงตั้งแต่แรก (statement, รูป, ไฟล์ export)
2. `wrangler.json` ที่ root: Worker + D1 binding `DB` + R2 binding + cron
3. `deploy.sh` ที่ `cd "$(dirname "$0")"` เองเสมอ และ `set -e`: ตรวจหน้าเว็บ (อ่านโค้ด) → ตรวจหน้าเว็บ (รันจริง) → เตรียม DB → deploy Worker → deploy Pages
4. `setup-db.sh` ยิง SQL **ทีละคำสั่ง** (มองข้าม "duplicate column / already exists") — ห้ามใช้ `--file` ไฟล์เดียวที่มี ALTER หลายบรรทัด
5. **schema.sql ตั้งต้นต้องตรงกับฐานจริง** — รวมตารางที่โค้ดเดิมสร้างตอน runtime และตารางที่ไม่มีคำสั่งสร้าง (Sessions, PlannedExpenses, CategoryBudgets) · PK ของ Captions คือ `type_id`
6. ดัชนีตั้งแต่ต้น: Transactions(family/account, date), TransactionDetails(transaction_id), (category_id), (contact_id) · หลีกเลี่ยง `strftime()`/`LIKE '%..'` ใน WHERE — เก็บวันที่เป็น ISO แล้วเทียบช่วง

## เฟส 1 — ตัวตนและสิทธิ์
- Users / Families / UserPermissions(entity) / Sessions · ประตูล็อกอินเดียว ทุก `/api/*` ต้องผ่าน session (ห้าม fallback header)
- ทุก query กรอง `family_id` · admin เห็นทั้งหมด · member เห็น Company ที่ได้สิทธิ์ + ของตัวเอง · ทะเบียนมีช่อง "ใครเห็น" (members JSON)
- เทส security ตั้งแต่เฟสนี้ (ข้ามครอบครัว / ไม่ล็อกอิน / member แก้ของคนอื่น)

## เฟส 2 — Master data (ตั้งค่า)
- Company · Account (ประเภท ธนาคาร/บัตร/เงินสด, เลขบัญชีหลายเลขคั่น `,`, Company เริ่มต้น) · Caption (behavior) · Category · Contact · User
- แก้ชื่อ = เปลี่ยนตามทุกที่ (อ้าง ID) · แก้ ID = cascade ใน batch เดียว + `PRAGMA defer_foreign_keys`
- หน้าตั้งค่าแบบการ์ด + ค้นหา (มือถือ) · นำเข้า/ส่งออก Excel

## เฟส 3 — รายการและหน้ารอตรวจ (หัวใจของระบบ)
- Transactions + TransactionDetails · สถานะ PENDING_REVIEW/CONFIRMED · ผลรวมบรรทัดย่อย = ยอดรายการ
- หน้ารอตรวจ: PC = การ์ดหลายใบ (วาดตามการเลื่อน รองรับพันใบ) · มือถือ = ทีละรายการ + สลับดูรายการทั้งหมดได้
- แยกบรรทัด, ⇄ โอน, ⚠️ อาจซ้ำ, 🔁 รวมซ้ำ, 🪄 เติมจากประวัติ, โหมดจัดกลุ่มผู้รับ, Tab เดินเฉพาะช่องกรอก, ช่องวันที่พิมพ์ต่อเนื่อง (พ.ศ. ได้), ช่องตัวเลขโฟกัสแล้วล้าง 0/เลือกทั้งหมด
- draft จาก "+ เพิ่ม" ไม่บันทึกจนกว่ามีข้อมูล

## เฟส 4 — นำเข้า statement / สลิป
- parser เฉพาะธนาคาร (KBank, SCB, KTB รวมหน้าหมุน 90°, Krungsri, HomePro, CardX, KTC) → ถ้าไม่สำเร็จจึงใช้ AI · **ถ้า parser สำเร็จต้องไม่ไหลไป AI** (ตัวห่อ `noAi`)
- จำรูปแบบนำเข้าต่อบัญชี · ยอดยกมา/ยกไปของ statement เป็น checkpoint สำหรับ Balance Check
- กันซ้ำด้วย file_hash + เงื่อนไขรายการ · งานใหญ่ทำทีละชุด (~2,000 บรรทัด/คลิก) หยุดแล้วทำต่อได้ไม่ซ้อน
- LINE bot (webhook ตรวจลายเซ็น) รับสลิป · wePAY จากรูปหน้าจอ · Drive ผ่าน Apps Script (secret อยู่ฝั่ง server เท่านั้น) · รูปย่อก่อนอัปโหลด · R2 lifecycle 30 วัน

## เฟส 5 — ยอดคงเหลือและรายงาน
- Balance Check: Recorded / Wait / Total / Bank + Match/Mismatch ต่อบัญชี
- รายงานเมนูซ้าย: ภาพรวม · ผู้รับ/ผู้จ่าย · ยอดสะสม statement (เทียบธนาคาร) · WHT · งบทดลอง · ปุ่ม Excel/PDF บรรทัดเดียว
- ภาพรวมครอบครัว/ธุรกิจในหน้าแรก · ตัวกรองบนสุดคือสมาชิก (Member) ไม่ใช่ Company

## เฟส 6 — ทะเบียนติดตาม
- หนี้สิน (เจ้าหนี้ = Contact · เงินต้น = หมวด LIABILITY · ดอกเบี้ย = EXPENSE · งวด/วันครบกำหนด/ลดหย่อนดอกเบี้ยบ้าน)
- ทรัพย์สิน (ที่ตั้ง, รับประกัน, หนี้ที่ผูก, ไฟล์แนบ) · ประกัน (เบี้ย, ความถี่, จับคู่การจ่ายจากหมวด, ปฏิทิน 12 เดือน) · บัตร
- กฎอัตโนมัติ (แนะนำเมื่อ ≥3 ครั้ง หมวดเดียว ≥90%)

## เฟส 7 — มือถือและการอ่านง่าย (ทำคู่ไปตลอด ไม่ใช่ทีหลัง)
- `mobile.css` โหลดท้ายสุด · `@media (max-width:768px)` · input 16px (กัน iOS zoom) · ปุ่มแตะ ≥44px · `overflow-x: clip` กันหน้าเลื่อนข้าง · modal เป็น bottom sheet · padding ล่างเผื่อ bottom nav + safe-area · การ์ด/grid ใส่ `min-width:0`
- ธีมอยู่ที่ `<body data-theme>` · กฎเฉพาะสว่างใช้ `body:not([data-theme="dark"])`
- เทสอัตโนมัติด้วย Playwright + mock API ที่ 390/375 px ทุกหน้า (ตัวหนังสือเล็ก, contrast, ล้นจอ, เนื้อหาซ่อนหลังเมนูล่าง)

## สิ่งที่ควรทำต่างจากเดิม (ถ้าสร้างใหม่)
- แยก `app.js` (17k บรรทัด) และ `index.js` (3k บรรทัด) เป็นโมดูลตั้งแต่แรก (router + module ต่อหน้าจอ / ต่อกลุ่ม API)
- schema เดียวเป็นความจริง + migration มีเลขลำดับ แทนการ ALTER ตอน runtime กระจายหลายไฟล์
- ใส่ป้ายภาษาไทยตั้งแต่ต้น (เช่น "เจ้าหนี้" ไม่ใช่ "Contact")
- แคชข้อมูล master ฝั่ง client + endpoint สรุปที่อ่านแถวน้อย (บทเรียนโควตา D1)
- เทสหน้าเว็บ (อ่านโค้ด + รันจริง) อยู่ใน deploy ตั้งแต่วันแรก

---

*ปรับปรุงล่าสุด: 2026-11-01 · v281 · ไฟล์นี้รวบรวมจาก HANDOFF.md, โค้ดใน backend/src และ frontend, และ project docs*
