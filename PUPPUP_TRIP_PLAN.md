# PupPup Trip — Data Mapping + แผนต่อ API

อัปเดต: 2026-07-25 · Prototype: `frontend/puppup-prototype/` (static, ยังไม่ต่อ API ตามกติกาใน HANDOFF.md)

---

## 1. สรุปฟอนต์ที่ใช้ (เทียบตัวอักษรจาก mockup แล้ว)

| บทบาท | ฟอนต์ | น้ำหนัก | หลักฐาน |
|---|---|---|---|
| หัวข้อไทย (บิล / แผนเที่ยว / จัดการทริป) | **Noto Sans Thai Looped** | 800 | หัวกลมชัด ขนาดวงกลมและความหนาตรงกับ mockup แทบทับกันสนิท |
| ข้อความไทยทั่วไป | **Anuphan** | 400–700 | ไม่มีหัว ทรงแคบ รูป ส/ย/ร/ด ตรงกับ mockup มากกว่า Noto Sans Thai, IBM Plex, Sarabun, Prompt, Krub |
| อักษรอังกฤษ + ตัวเลขทั้งหมด | **Poppins** | 400–700 | `a` แบบ single-story ใน "Japan Family Trip" ล็อกคำตอบไว้ที่ Poppins |

ทั้งสามตัวเป็น Google Fonts และถูก **self-host เป็น .woff2 ไว้ใน `frontend/puppup-prototype/fonts/` แล้ว** (รวม 116 KB) ไม่ต้องพึ่ง CDN

**ขนาดอักษร** ไม่ได้เดา — วัด bounding box ของข้อความจริงในไฟล์ mockup ทีละจุด (~50 จุด) แล้ว fit หาขนาดฟอนต์ที่ให้ความกว้างเท่ากัน ค่าที่ได้เขียนไว้ตรงๆ ใน `prototype.css`

**Canvas** = 869px (เท่าไฟล์ mockup 1:1) มีปุ่มซูม 50/62/80/100% บน toolbar

### จังหวะ banner มาตรฐาน (บังคับใช้เหมือนกันทั้ง 4 หน้า)

mockup ต้นฉบับให้ banner มาไม่เท่ากัน (495 / 470 / 420 / 470 px และหน้าแผนเที่ยวไม่มี status bar)
จึงกำหนดมาตรฐานใหม่ให้สลับหน้าแล้วหัวไม่ขยับ:

| ระยะ (y บน canvas 869px) | ค่า |
|---|---|
| ความสูง banner | **470px** ทุกหน้า |
| status bar | 0–78 (มีครบทุกหน้า) |
| หัวข้อหลัก | top **96** · ไทย 68px / Latin 50px (top 106) |
| บรรทัดรอง (ชมพู) | top **188** |
| ชิปวันที่ + จำนวนคน | top **240** สูง 56 |
| พื้นที่ภาพประกอบที่เหลือ | 296–470 (174px) |
| **การ์ดใบแรก** | top **486** (banner 470 + ระยะห่าง 16) |
| **ขอบซ้าย/ขวาของการ์ดทุกใบ** | **26px** (การ์ดกว้าง 817px) |

CSS อยู่ที่คลาส `.hero-title` / `.hero-sub` / `.hero-chip` ใน `prototype.css` — แก้ที่เดียวมีผลทั้ง 4 หน้า

การปรับที่ตามมา:
- `hero_bills.png` ตัดขอบบน 25px (ท้องฟ้าล้วน) · `hero_wallet.png` ยืดแถบพื้นดินล่างจาก 420 → 470
- **ปุ่ม back หน้าจัดการทริป** ย้ายมาอยู่ซ้ายมือหัวข้อบรรทัดเดียวกัน (mockup วางไว้เหนือหัวข้อ) — เพื่อให้หัวข้อทุกหน้าอยู่ y เดียวกัน
- **หมุดแผนที่หน้าแผนเที่ยว** ขยับลงมาอยู่ช่วง 298–462 ให้พ้น header · ปรับเส้นประตาม
- ขนาดหัวข้อไทยปรับให้เท่ากันที่ 68px ทุกหน้า (mockup ให้มา 78 / 53 / 71 ไม่เท่ากัน)

---

## 2. ไอคอน / ภาพประกอบ

ทั้งหมดตัดจากไฟล์ mockup ที่ส่งมา → `frontend/puppup-prototype/art/` (46 ไฟล์)

- **hero 4 ภาพ** — ลบตัวอักษรที่ฝังในภาพออกด้วย inpainting (OpenCV TELEA) แล้ววางข้อความจริงทับด้วย HTML → ข้อความเปลี่ยนตามข้อมูลจริงได้
- **หมุดแผนที่ + เส้นประ** ใน hero_plan วาดใหม่เป็น SVG → เปลี่ยนสี/ตำแหน่ง/ชื่อเมืองตามข้อมูลจริงได้
- **ไอคอนเส้น** (ปฏิทิน, คน, ตา, นาฬิกา, chevron, nav, toggle) วาดเป็น SVG inline → คมทุกความละเอียด
- **ไอคอนภาพวาด** (ราเมง, รถไฟ, โรงแรม, ตะกร้า, วัด, Tokyo Tower, กล้อง, กระเป๋าเดินทาง, ธง, อากาศ) เป็น PNG ตัดจาก mockup

---

## 3. Data mapping — แต่ละจุดใน mockup ดึงจากไหน

### 3.1 หน้า บิล

| UI | แหล่งข้อมูล | สถานะ |
|---|---|---|
| ชื่อทริป + วันที่ + จำนวนคน | `Projects.name / start_date / end_date / members` | ✅ |
| ภาพ hero | `Projects.theme_banner` | ✅ |
| ยอดรวม ¥ (สลับสกุลได้ด้วยชิป) | `Projects.display_currency` + `TripWallets` ต่อสกุล | 🆕 คอลัมน์ใหม่ |
| ≈ ฿ | `amount_foreign × wallet.avg_rate` (จาก `computeTripWallets`) | ✅ |
| โดนัท % ต่อหมวด | `TripExpenses → Categories → Captions` | ✅ |
| สี + ไอคอนหมวด | `Categories.color / icon_asset` | 🆕 คอลัมน์ใหม่ |
| ชิปกรองหมวด | เดียวกัน | ✅ |
| ชื่อบิล | `TripExpenses.note` | ✅ |
| ชิปสถานที่ "Asakusa, Tokyo" | `TripExpenses.stop_id → TripStops.city` + ไต่ `parent_stop_id` ขึ้นไปหาเมือง | ✅ |
| สีชิปสถานที่ | `TripStops.marker_color` | ✅ |
| ผู้จ่าย | `TripExpenses.member_id → Users.name` | ✅ |
| ไอคอนกลมของบิล | `TripExpenses.icon_asset` (fallback → `Categories.icon_asset`) | 🆕 คอลัมน์ใหม่ |
| ยอด ¥ / ≈ ฿ | `amount_foreign` / `amount_thb` | ✅ |
| FAB เพิ่มบิล | `POST /api/trip-expenses` | ✅ |

### 3.2 หน้า แผนเที่ยว

| UI | แหล่งข้อมูล | สถานะ |
|---|---|---|
| หมุดเมือง + ช่วงวัน | `GROUP BY TripStops.city`, `MIN/MAX(stop_date)` | ✅ |
| ตำแหน่ง x/y ของหมุด + เส้นประ | `Projects.route_data` (JSON `[{city,x,y}]`) | ✅ ใช้คอลัมน์เดิม |
| สีหมุด | `TripStops.marker_color` | ✅ |
| การ์ด "วัน N" + เมือง + วันที่ | คำนวณจาก `stop_date − start_date` | ✅ |
| ภาพประกอบเมือง | `TripStops.icon_asset` | ✅ |
| **อากาศ เช้า/บ่าย/ค่ำ + %ฝน** | **Open-Meteo API** → cache ใน `TripDayWeather` | 🆕 ตารางใหม่ |
| กลุ่มสถานที่ (Asakusa) + คำอธิบาย | `TripStops` ตัวแม่ · `city` + `notes` | ✅ |
| ชื่อกิจกรรม EN + (ไทย) | `TripStops.name_en` / `name_th` | 🆕 คอลัมน์ใหม่ |
| เวลาเริ่ม + ระยะเวลา | `time` + `end_time` → คำนวณส่วนต่าง | ✅ |
| ปุ่มเพิ่มกิจกรรม / เพิ่มสถานที่ | `POST /api/trip-stops` (รองรับ `parent_stop_id` แล้ว) | ✅ |

**Open-Meteo** — ฟรี ไม่ต้องใช้ API key:
```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &hourly=temperature_2m,precipitation_probability,weather_code
  &timezone=Asia%2FTokyo&start_date=…&end_date=…
```
Worker เลือกชั่วโมง 08:00 / 14:00 / 20:00 เป็น เช้า/บ่าย/ค่ำ แล้วเขียนลง `TripDayWeather`
ข้อจำกัด: พยากรณ์ล่วงหน้าได้ ~16 วัน — ทริปในอดีต (Memory) ให้ใช้ endpoint `archive-api.open-meteo.com` แทน, ทริปที่ไกลเกิน 16 วันให้ซ่อนแถบอากาศ

### 3.2.1 สีของจุดแวะ (`--pin`)

`.place-sec` มี CSS variable `--pin` ตัวเดียวคุมทั้ง **หมุด · เส้นไทม์ไลน์ · วงกลมบนเส้น · ขีดต่อไปหาการ์ด · ปุ่มเพิ่มกิจกรรม**
ตอนต่อ API ให้ set จาก `TripStops.marker_color` ของจุดแวะนั้น:

```html
<section class="place-sec" style="--pin:#7C63E0">…</section>
```

เฉดอ่อน/เข้มคำนวณเองด้วย `color-mix()` ไม่ต้องส่งสีมาหลายค่า

### 3.3 หน้า กระเป๋าเงิน

| UI | แหล่งข้อมูล | สถานะ |
|---|---|---|
| ยอดรวมทริป + ≈ ฿ | `computeTripWallets()` | ✅ |
| ชิป THB/JPY/USD + ธง + ยอด | `TripWallets` GROUP BY currency · ธงจาก currency code | ✅ |
| ติ๊กถูก (สกุลที่เลือก) | `Projects.display_currency` | 🆕 |
| สร้างกระเป๋าใหม่ | `POST /api/wallets` | ✅ |
| เติมเงินเข้าทริป | `POST /api/trips/fund` | ✅ |
| badge "ใช้งานอยู่" | `TripWallets.is_active` | 🆕 |
| เรทเฉลี่ย ฿/¥ | `avg_rate` | ✅ |
| เติมแล้ว / ใช้ไป / คงเหลือ | `funded_foreign / spent_foreign / leftover_foreign` | ✅ |
| รายการล่าสุด | `TripExpenses ORDER BY expense_date DESC LIMIT 3` | ✅ |

### 3.4 หน้า จัดการทริป

| UI | แหล่งข้อมูล | สถานะ |
|---|---|---|
| สมาชิกทริป + บทบาท | `Projects.members` (JSON — เพิ่ม field `role` ในแต่ละ object) | ✅ |
| งบประมาณ | `Projects.total_budget` | ✅ |
| เอกสาร | `COUNT(TripDocuments)` | ✅ |
| สกุลเงินหลัก | `Projects.base_currency` | 🆕 |
| แจ้งเตือนอากาศ (toggle) | `Projects.weather_alert` | 🆕 |
| รูปภาพ banner (4 ตัวเลือก) | `Projects.theme_banner` + คลัง `art/banner_*.png` | ✅ |
| ปิดทริปนี้ | `POST /api/trips/close` | ✅ |

---

## 4. Endpoint ที่ต้องเพิ่มใน Worker

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| `GET` | `/api/trips/weather?projectId=&date=` | คืน `TripDayWeather` ของทริป · ถ้า cache เก่ากว่า 3 ชม. ให้ยิง Open-Meteo แล้วอัปเดต |
| `PUT` | `/api/trips/settings` | บันทึก `base_currency`, `display_currency`, `weather_alert`, `latitude/longitude` |
| `PUT` | `/api/wallets/active` | สลับ `is_active` (ทริปเดียวมี active ได้ทีละกระเป๋า) |
| `PUT` | `/api/categories/appearance` | บันทึก `color` + `icon_asset` ของหมวด |
| `POST` | `/api/assets/upload` | อัปโหลดไอคอนเข้า R2 → คืน public URL (ยังไม่ได้ provision R2 — ดู HANDOFF) |

---

## 5. ลำดับงานถัดไป (อย่าข้ามขั้น — ตามกติกาใน HANDOFF.md)

1. **ผู้ใช้ review prototype ทีละหน้า** → เก็บ feedback → แก้ static จนผ่าน  ← **อยู่ตรงนี้**
2. รัน `add_puppup_trip_fields.sql` กับ D1 remote
3. เพิ่ม endpoint ตามตารางข้อ 4 + deploy Worker
4. สร้าง `frontend/puppup/` แล้วย้าย component ที่ผ่านแล้ว **ทีละหน้า** (แนะนำเรียง: กระเป๋าเงิน → บิล → แผนเที่ยว → จัดการทริป เพราะ backend พร้อมมากที่สุดไปน้อยที่สุด)
5. ทำ visual comparison กับ mockup ทุกครั้งก่อนปิดแต่ละหน้า
6. **ห้ามแตะ `frontend/app.js` trip renderer เดิม**

---

## 6. ข้อสังเกตที่ต้องตัดสินใจตอน migrate

- **Bottom nav ใน mockup 4 ภาพไม่ตรงกัน** (ทริป/วอลเล็ต/บิล/แผน vs แผนเที่ยว/รายจ่าย/สรุปค่าใช้จ่าย/เพิ่มเติม) — prototype เลือกใช้ชุดของหน้าบิล (ทริป / วอลเล็ต / บิล / แผน) เพราะแมปกับ 4 หน้าได้ตรงที่สุด
- **ขนาดอักษรบางจุดใน mockup เล็กมาก** (legend โดนัท ≈ 14px บน canvas 869px) เพราะเป็นภาพ AI ที่ไม่ได้อิง metric อุปกรณ์จริง — prototype ทำตาม mockup เป๊ะ แต่ตอนขึ้น production ควรกำหนด type scale ใหม่ให้อ่านง่ายบนจอ 390pt
- **การ์ดใบแรกหน้าจัดการทริป** ใน mockup ซ้อนใต้สติกเกอร์กระเป๋าเดินทาง 31px — prototype วางต่อกันพอดี (ไม่ซ้อน) เพราะสติกเกอร์ถูกฝังอยู่ในภาพ hero · ถ้าต้องการซ้อนเป๊ะ ต้องแยกสติกเกอร์เป็น PNG พื้นหลังโปร่งก่อน
