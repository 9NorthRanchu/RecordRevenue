# นำเข้า Expense2 — ขั้นตอนสำหรับ North

ทุกอย่างรันจากโฟลเดอร์ `RecordRevenue` · ไฟล์ทั้งหมดอยู่ใน `import-expense2/`

## สถานะตอนเริ่ม (จาก backup-before-import.sql 7 ก.ย. 2026 16:04)

ฐานข้อมูล**ไม่มีรายการบัญชีเลย** (Transactions = 0) · มี Entities 10 (S01–S10) · Contacts 86 · Categories 22 · Accounts 1 (YOUTRIP)
→ ไม่ต้องลบอะไร นำเข้าใหม่ได้เลย · ไฟล์ `backup-before-import.sql` คือจุดกู้คืนถ้าต้องถอย

## ขั้นที่ 1 — นำเข้า (คำสั่งเดียว · ราว 5–10 นาที)

```
bash import-expense2/run-import.sh
```

สคริปต์จะรันตามลำดับ: เพิ่มคอลัมน์ 2 ช่อง → master (Entities · Accounts · Categories) → ข้อมูล 12 ไฟล์ · ไฟล์ละ 2,500 คำสั่ง
หยุดทันทีถ้าไฟล์ไหนล้มเหลว และบอกว่าไฟล์ไหน · **รันซ้ำได้ปลอดภัย** — ทุกคำสั่งเป็น INSERT OR IGNORE / UPDATE ของที่เข้าแล้วจะไม่ซ้ำ

## ขั้นที่ 2 — ตรวจเร็ว (2 นาที)

```
bash import-expense2/verify-quick.sh
```

พิมพ์ตัวเลข 6 ชุดบนจอ · ค่าที่ต้องได้เขียนไว้ในหัวข้อแต่ละชุด

## ขั้นที่ 3 — ตรวจสมบูรณ์ 10 ข้อ (ส่งไฟล์ให้ระบบ หรือรันเอง)

```
npx wrangler d1 export record-revenue-db --remote --output import-expense2/backup-after-import.sql
python3 import-expense2/verify_import.py import-expense2/backup-after-import.sql
```

ต้องขึ้น **🎉 ผ่านครบ 10 ข้อ** · (สคริปต์นี้ทดสอบกับฐานจำลองที่โหลด schema จริง + SQL ชุดเดียวกันแล้ว ผ่าน 10/10)

## ขั้นที่ 4 — เปิดแอปดู

ล็อกอิน 9North → แดชบอร์ด → เลือกปี 2024 · ควรเห็นรายจ่ายราว 3.76 ล้าน (รวมรายจ่ายบริษัท) · รายได้ราว 3.91 ล้าน
หน้าหมวดหมู่จะมีหมวดใหม่ 44 หมวด ([T01] Food & Beverage … [L02] Puii 100K …) และ Entity ใหม่ 3 ราย (North ส่วนตัว · [X01] Lottery · [X02] MaemorBerDee)

## สิ่งที่ตัดสินใจแทนไปก่อน (แก้ทีหลังได้ในหน้าตั้งค่า ไม่ต้องนำเข้าใหม่)

| เรื่อง | ที่ทำไป | แก้ที่ไหน |
|---|---|---|
| เจ้าของบัญชีทุกบัญชี | `North (ส่วนตัว)` ยกเว้น A25 Puii Bank → [S06] PUII | ตั้งค่า → บัญชี → เปลี่ยน Entity |
| ประเภทบัญชี | C01–C07 = บัตรเครดิต · A01/A16–A22/A24 = เงินสด/วอลเล็ต · ที่เหลือ = ธนาคาร | ตั้งค่า → บัญชี |
| ชื่อ Entity ใหม่ | `North (ส่วนตัว)` | ตั้งค่า → Entity → แก้ชื่อ |
| สิทธิ์ | ให้ 9North เห็น Entity ใหม่ทั้ง 3 · Puii ยังไม่มีสิทธิ์ Entity ใด (เหมือนก่อนนำเข้า) | ตั้งค่า → ผู้ใช้ |
| หมวด AP (AR) / AP (AR) Customer / Lotto / Lotto P'Na | ไม่ตั้ง default_type — ทิศทางเงินของแต่ละแถวเป็นตัวบอกรับ/จ่าย | — |
| Z03 | สร้างหมวดไว้ตามที่ North นิยาม แม้ไฟล์นี้ยังไม่มีข้อมูล | — |

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | คืออะไร |
|---|---|
| `sql/00-alter.sql` | เพิ่มคอลัมน์ `head_owner` `group_detail` ใน TransactionDetails (เก็บรหัสดิบจากไฟล์ทุกแถว) |
| `sql/01-master.sql` | Entities 3 · UserPermissions 3 · Accounts 34 · Categories ปรับ 19 + เพิ่ม 44 |
| `sql/10-data-01…12.sql` | Transactions 14,143 + TransactionDetails 15,162 |
| `import-expected.json` | ตัวเลขที่ต้องได้ (ใช้โดย verify_import.py) |
| `build_import.py` | ตัวสร้าง SQL จาก Expense2.xlsx — ถ้าไฟล์ต้นทางเปลี่ยน รันใหม่ได้ |
| `mapping-master-Expense2.xlsx` | สมุดจับคู่ + ตัวเลขควบคุมต่อบัญชี (สูตร) |
| `วิเคราะห์การนำเข้า-Expense2.md` | รายงานวิเคราะห์ฉบับเต็ม |

---

## รันทั้งระบบในเครื่องตัวเอง (ไม่แตะ Cloudflare · ใช้ตอนโควตา D1 เต็ม หรือจะทดลองอะไรก็ได้)

ทุกคำสั่งรันจากโฟลเดอร์ `RecordRevenue`

```
# 1) สร้างฐานจำลองในเครื่องจากสำเนาจริง (ครั้งแรกครั้งเดียว · เก็บไว้ที่ .wrangler/state)
npx wrangler d1 execute record-revenue-db --local --file=import-expense2/backup-before-import.sql
bash import-expense2/run-import.sh --local

# 2) เปิดเซิร์ฟเวอร์ API ในเครื่อง (ปล่อยหน้าต่างนี้ทิ้งไว้)
npx wrangler dev

# 3) เปิดอีกหน้าต่าง terminal — เปิดหน้าเว็บ (ปล่อยทิ้งไว้เหมือนกัน)
npx wrangler pages dev frontend --port 8788
```

แล้วเปิดเบราว์เซอร์ที่ **http://localhost:8788** → ล็อกอินด้วยรหัสเดิม (ผู้ใช้ถูกคัดลอกมาจากสำเนา)
หน้าเว็บที่เปิดจาก localhost จะยิงไปที่ API ในเครื่อง (`localhost:8787`) เอง ไม่ไปแตะของจริง

- ข้อมูลที่แก้ในโหมดนี้อยู่ในเครื่องเท่านั้น · ถ้าอยากเอาขึ้นของจริง ต้อง export แล้วนำเข้าอีกที
- โค้ดที่แก้ deploy ขึ้นของจริงได้ตามปกติด้วย `deploy.sh` (deploy ไม่ใช้โควตา D1)
- หยุด: กด Ctrl+C ในสองหน้าต่างนั้น
