# 📋 Finance Tracker — คู่มือติดตั้งทีละขั้นตอน

---

## ภาพรวมระบบ

```
LINE Bot (ส่งสลิป)  ──┐
Statement CSV Import ──┼──► TB_Staging (รอ Review) ──► Web App Classify ──► TB_Transactions ──► Looker Studio
Manual Entry (Web App)─┘
```

---

## ขั้นตอนที่ 1 — สร้าง Google Sheet ใหม่

1. เปิด [Google Drive](https://drive.google.com) → **New → Google Sheets**
2. ตั้งชื่อ: **Finance Tracker**
3. Copy **Sheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/ ▶ [SHEET_ID_อยู่ตรงนี้] ◀ /edit
   ```
4. บันทึก Sheet ID ไว้ใช้ใน Step 3

---

## ขั้นตอนที่ 2 — เพิ่ม GAS Script

1. ใน Google Sheet → เมนู **Extensions → Apps Script**
2. ลบ code เดิมทั้งหมด (ใน Code.gs)
3. สร้างไฟล์ใหม่ทีละไฟล์ตามนี้:

### วิธีสร้างไฟล์ใน Apps Script:
- คลิก **+** ข้าง "Files" ทางซ้าย → **Script**
- ตั้งชื่อตามที่กำหนด (ไม่ต้องใส่ `.gs`) → Enter

### ไฟล์ที่ต้องสร้าง (ตามลำดับ):

| ชื่อไฟล์ | คัดลอกจาก |
|---|---|
| `01_Config` | `01_Config.gs` |
| `02_Setup` | `02_Setup.gs` |
| `03_StagingService` | `03_StagingService.gs` |
| `04_DuplicateCheck` | `04_DuplicateCheck.gs` |
| `05_TransferMatcher` | `05_TransferMatcher.gs` |
| `06_OCR_LineBot` | `06_OCR_LineBot.gs` |
| `07_StatementImport` | `07_StatementImport.gs` |
| `08_WebApp` | `08_WebApp.gs` |

4. คลิก **+** → **HTML** → ตั้งชื่อ `WebApp` → คัดลอก code จาก `WebApp.html`

### ⚠️ สำคัญ: ลบ Code.gs เริ่มต้นออก
- คลิกขวาที่ `Code.gs` → **Delete**

---

## ขั้นตอนที่ 3 — เพิ่ม Drive API

1. ใน Apps Script → ด้านซ้าย คลิก **Services** (icon +)
2. ค้นหา **Google Drive API** → เลือก version **v2** → **Add**
   > ⚠️ ต้องใช้ v2 เท่านั้น (ฟังก์ชัน OCR ต้องการ `Drive.Files.insert`)

---

## ขั้นตอนที่ 4 — Run setupAll()

1. ใน Apps Script → เลือกไฟล์ `02_Setup`
2. เลือก function **`setupAll`** จาก dropdown บน toolbar
3. คลิก **▶ Run**
4. ครั้งแรก: ระบบจะขอ Permission → คลิก **Review Permissions** → Allow

✅ หลัง Run สำเร็จ:
- Google Sheet จะมี 10 sheets
- Master Data (Categories, SubCategories, Accounts) จะถูกกรอกอัตโนมัติ
- มี popup แจ้ง "Setup เสร็จแล้ว"

---

## ขั้นตอนที่ 5 — กรอก Master Data (สำคัญมาก)

### MD_HeadOwners — เจ้าของบัญชี
| Owner_ID | Name | Type |
|---|---|---|
| OWN001 | ชื่อคุณ | Personal |
| OWN002 | ชื่อคู่สมรส/สมาชิก | Personal |
| OWN003 | ชื่อบริษัท 1 | Company |

### MD_Accounts — บัญชีธนาคาร
แก้ไขช่องสีเหลือง:
- **Acc_Name**: ตั้งชื่อสั้นๆ เช่น `KBank-North-YYY5` (เลข 4 ตัวท้าย)
- **Acc_No**: เลขบัญชี (ใส่ครบหรือ mask ได้ เช่น `xxx-x-xx123-x`)
- **OCR_Keywords**: คำที่จะใช้จับบัญชีจากสลิป (เซ็ตไว้แล้ว แก้ถ้าต้องการ)
- **Opening_Balance**: ยอดเงิน ณ วันเริ่มใช้งาน

### MD_Customers — ลูกค้า
กรอก:
- **Cust_ID**: CU001, CU002, ...
- **Name_TH**: ชื่อบริษัท/บุคคล (ภาษาไทย)
- **Tax_ID**: เลขภาษี 13 หลัก (สำคัญสำหรับ ภงด.53)

### CONFIG — ตั้งค่าระบบ
กรอกค่าในคอลัมน์ VALUE:
```
FINANCE_SHEET_ID      → [Sheet ID จาก Step 1]
LINE_CHANNEL_TOKEN    → [Channel Access Token จาก LINE Developers]
LINE_CHANNEL_SECRET   → [Channel Secret จาก LINE Developers — ใช้ verify signature]
WEB_APP_URL           → [URL หลัง Deploy — ใส่ทีหลังได้]
SLIP_FOLDER_ID        → [Drive Folder ID เก็บสลิป — ว่างไว้ = เก็บที่ My Drive]
```

> ⚠️ LINE_CHANNEL_SECRET อยู่ที่ LINE Developers Console → Messaging API → **Channel Secret** (คนละค่ากับ Channel Access Token)
> ⚠️ ห้ามแชร์ Sheet นี้ เพราะ Token อยู่ใน CONFIG

---

## ขั้นตอนที่ 6 — Deploy Web App

1. ใน Apps Script → คลิก **Deploy** (มุมขวาบน) → **New deployment**
2. คลิก ⚙️ icon → เลือก **Web app**
3. ตั้งค่า:
   - **Description**: Finance Tracker v1.0
   - **Execute as**: Me
   - **Who has access**: **Only myself** (หรือ Anyone ถ้าต้องการให้คนอื่นใช้ด้วย)
4. คลิก **Deploy** → Copy **Web app URL**
5. เปิด URL นั้นในเบราว์เซอร์ → จะเห็น Staging Inbox

### บันทึก URL ใน CONFIG sheet:
```
WEB_APP_URL  →  [URL ที่ได้จาก Deploy]
```

---

## ขั้นตอนที่ 7 — ตั้งค่า LINE Bot (ถ้าใช้)

1. ไปที่ [LINE Developers Console](https://developers.line.biz)
2. เปิด Messaging API Channel
3. Copy **Channel Access Token** → ใส่ใน CONFIG → `LINE_CHANNEL_TOKEN`
4. ตั้ง **Webhook URL**:
   - ใน Apps Script → Deploy → จะมี URL สำหรับ `doPost`
   - ใส่ URL นี้ใน LINE Developers → **Webhook URL**
   - เปิด **Use webhook**

> 💡 URL ของ doPost กับ doGet เป็นเดียวกัน — GAS แยกให้อัตโนมัติ

---

## ขั้นตอนที่ 8 — ทดสอบระบบ

### Test 1: Manual Entry
1. เปิด Web App URL
2. ไปที่ **Manual Entry**
3. กรอกรายการทดสอบ → คลิก **บันทึก**
4. ไปที่ **Staging Inbox** → ควรเห็นรายการที่เพิ่ง Add

### Test 2: Classify
1. ใน Staging Inbox → คลิก **Classify**
2. เลือก Head Owner, Group, Category → คลิก **Confirm**
3. ไปที่ **Confirmed** → ควรเห็นรายการย้ายมา
4. เปิด Google Sheet → TB_Transactions → ควรมีข้อมูล

### Test 3: Import CSV
1. Download Statement CSV จากธนาคาร
2. ไปที่ **Import CSV** → เลือกธนาคาร → อัปโหลดไฟล์
3. Preview → คลิก **Import**
4. ตรวจสอบใน Staging Inbox

### Test 4: LINE Bot
1. เพิ่ม LINE Bot เป็นเพื่อน
2. ส่งรูปสลิปโอนเงิน
3. Bot ควร Reply กลับมาพร้อมข้อมูลที่อ่านได้
4. ตรวจสอบใน Staging Inbox

---

## ขั้นตอนที่ 9 — เชื่อม Looker Studio (Dashboard)

1. ไปที่ [Looker Studio](https://lookerstudio.google.com)
2. **Create → Report → Google Sheets**
3. เลือก Finance Tracker Sheet → เลือก `TB_Transactions`
4. สร้าง charts ที่ต้องการ:
   - Bar chart: ค่าใช้จ่ายต่อ Category ต่อเดือน
   - Line chart: รายรับ-รายจ่ายต่อเดือน
   - Scorecard: ยอดรวมเดือนนี้
   - Table: Top 10 ค่าใช้จ่าย

---

## ขั้นตอนที่ 10 — Migrate Old Data (ถ้ามี)

ถ้าไฟล์ Old Data.xlsx เปิดได้:
1. Copy ข้อมูลจาก Old Data.xlsx
2. Map columns ให้ตรงกับ TB_Transactions headers
3. Set `Source` = `migrated`, `Status` = `Done`
4. Paste ลงใน TB_Transactions โดยตรง (ข้ามขั้นตอน Staging)

---

## การอัปเดต Code ในอนาคต

เมื่อต้องการแก้ไข:
1. แก้ code ใน Apps Script
2. **Deploy → Manage deployments → Edit (✏️) → Version: New version → Deploy**
3. URL เดิมจะยังใช้งานได้ (ไม่เปลี่ยน)

---

## ปัญหาที่พบบ่อย

| ปัญหา | วิธีแก้ |
|---|---|
| `Sheet "TB_Staging" not found` | Run `setupAll()` อีกครั้ง |
| OCR ไม่ทำงาน | ตรวจสอบว่า Enable Drive API v2 แล้ว |
| LINE Bot ไม่ตอบ | ตรวจสอบ LINE_CHANNEL_TOKEN ใน CONFIG |
| Web App ขึ้น "Error" | เปิด Apps Script → Executions → ดู error log |
| WHT ไม่คำนวณ | ตรวจสอบ Gross_Amount ไม่เป็น 0 |
| Transfer ไม่ match | ตรวจสอบ TRANSFER_FEE_TOLERANCE ใน CONFIG (default 100 บาท) |

---

## สรุปไฟล์ทั้งหมด

```
Finance_Tracker_GAS/
├── 01_Config.gs          — Constants, helpers
├── 02_Setup.gs           — สร้าง Sheets + Master Data (รัน 1 ครั้ง)
├── 03_StagingService.gs  — CRUD Staging + Transactions
├── 04_DuplicateCheck.gs  — ตรวจซ้ำ
├── 05_TransferMatcher.gs — จับคู่ Transfer อัตโนมัติ
├── 06_OCR_LineBot.gs     — LINE Bot + OCR สลิป
├── 07_StatementImport.gs — Import CSV (KBank/SCB/KTB/Krungsri/BBL/CC)
├── 08_WebApp.gs          — doGet() + API functions
├── WebApp.html           — Staging Inbox Web App UI
└── SETUP_GUIDE.md        — คู่มือนี้
```
