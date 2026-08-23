# Prompt สำหรับสร้างไอคอน — Unified Trip (2026-08-11)

เอกสารนี้คือสูตรสำหรับ generate ภาพด้วย Gemini / ChatGPT แล้วอัปโหลดกลับเข้าแอป
สไตล์ที่เลือกไว้: **kawaii · สีแบนล้วน · กรอบขาวหนา · เงาทึบยกชั้น**

---

## กฎเหล็ก 5 ข้อ (อ่านก่อนเริ่ม)

1. **generate ทีละแผ่นรวมหลายไอคอน** (grid 3×3 หรือ 2×3) ไม่ใช่ทีละอัน
   สไตล์จะสม่ำเสมอกว่ามาก แล้วค่อยตัดแยกทีหลัง
2. **พื้นหลังขาวล้วน** เสมอ ห้ามโปร่งใส ห้ามมีลายฉากหลัง
   (แอปครอบมุมโค้งและใส่กรอบขาวให้เองด้วย CSS อยู่แล้ว)
3. **ห้ามมีตัวอักษร ตัวเลข หรือโลโก้** ในภาพเด็ดขาด — ต้องย้ำในทุก prompt
   เพราะโมเดลชอบใส่มาเอง แล้วต้องมาลบทีหลัง
4. **ล็อกจานสีด้วยรหัส hex เสมอ** นี่คือสิ่งที่ทำให้ไอคอนชุดใหม่เข้ากับของเดิมมากที่สุด
5. ระบุ **ขนาดสุดท้ายต่อช่อง** และให้ตัวไอคอนกินพื้นที่ราว 70% ของช่อง
   เว้นขอบไว้ ไม่งั้นเวลาแอปครอบมุมโค้งจะโดนตัดขอบภาพ

---

## ขนาดภาพที่แอปใช้ (ตัดให้ตรงตามนี้)

| ใช้ที่ไหน | ขนาด | ทรง | หมายเหตุ |
|---|---|---|---|
| ไอคอนค่าใช้จ่าย | **192 × 192** | วงกลม | แสดงเป็นวงกลมในรายการบิล เนื้อหาสำคัญต้องอยู่กลางภาพ |
| ไอคอนสกุลเงิน | **192 × 192** | วงกลม | เต็มวงกลม ไม่ต้องเว้นขอบ ควรมีสีเด่นประจำสกุล |
| ไอคอนสถานที่ | **256 × 256** | สี่เหลี่ยมมุมโค้ง | ใช้ในแผนเที่ยว เว้นขอบรอบภาพเล็กน้อย |
| ไอคอนกระเป๋าเงิน | **256 × 256** | สี่เหลี่ยมมุมโค้ง | แสดงบนการ์ดกระเป๋า |
| แบนเนอร์ทริป | **1920 × 810** | แนวนอน 2.37:1 | หมุดและเส้นทางถูกวางทับด้วยโค้ด **ห้ามมีชื่อสถานที่ในภาพ** |

> แอปย่อและครอบให้อัตโนมัติตอนอัปโหลด ถ้าขนาดไม่ตรงเป๊ะไม่เป็นไร
> แต่ **อัตราส่วน** ต้องถูก ไม่งั้นภาพจะถูกครอบจนเสียองค์ประกอบ

**เพดานขนาดไฟล์**: รูป 3 MB · PDF 15 MB

---

## จานสีตามธีม (เลือกชุดเดียวต่อการ generate หนึ่งครั้ง)

### ❄ Hokkaido ฤดูหนาว
```
ฟ้าเข้ม   #1F6FA8    ฟ้าสด   #3AA5D9    ฟ้าอ่อน  #DFF2FB
ทอง      #F0B429    ทองอ่อน #FFF0CF    เขียว    #2F9E6B
เขียวอ่อน #CFEEE0    ม่วงน้ำเงิน #4F63C4  ครีม    #FFF8EE
```

### 🌸 Fuji ซากุระ
```
ชมพูเข้ม #C72C6E    ชมพูสด #E8629C    ชมพูอ่อน #FFE4F0
ม่วง     #8B4FD4    ม่วงอ่อน #E4D6FF   เขียว    #2F9E6B
เขียวอ่อน #E0F7E6    ทอง    #F0B429    ครีม     #FFF8EE
```

---

## PROMPT A — ไอคอนค่าใช้จ่าย (192×192 · วงกลม)

> ใช้กับ "รายการค่าใช้จ่ายในทริปนี้" เช่น ราเมง ขนม ค่ารถไฟ ของฝาก

```
A 3x3 grid of 9 flat-illustration app icons on a pure white background.

STYLE — must be identical across all 9:
- kawaii Japanese sticker style, flat solid colors only, NO gradients
- thick white outline (about 8px at 256px scale) around each subject,
  like a die-cut vinyl sticker
- a solid drop shadow directly below each subject in a darker shade of
  its own color, offset about 6px down, no blur
- very rounded, chunky, friendly shapes
- clean white background between cells, no borders, no grid lines
- NO text, NO letters, NO numbers, NO logos, NO watermarks

PALETTE — use only these hex colors:
[วางจานสีของธีมที่เลือกจากด้านบน]

SUBJECTS (left to right, top to bottom):
1. <หัวข้อ 1>
2. <หัวข้อ 2>
...
9. <หัวข้อ 9>

Output 576x576 px total, each cell exactly 192x192 px.
```

**ชุดหัวข้อที่น่าจะได้ใช้**
`ราเมง` · `ซูชิ` · `ขนมหวาน` · `กาแฟ` · `เบียร์` · `รถไฟ` · `แท็กซี่` ·
`เครื่องบิน` · `รถเช่า` · `โรงแรม` · `ออนเซ็น` · `ตั๋วเข้าชม` · `ของฝาก` ·
`ซูเปอร์มาร์เก็ต` · `ตู้กาชาปอง` · `ค่าธรรมเนียม/ATM` · `ยาและเวชภัณฑ์` · `ซิม/WiFi`

---

## PROMPT B — ไอคอนสถานที่ (256×256 · สี่เหลี่ยมมุมโค้ง)

> ใช้ในแผนเที่ยว เช่น Lake Akan, Akanko Ainu Kotan, สนามบิน

```
A 3x3 grid of 9 flat-illustration landmark tiles on a pure white background.

Each tile is a rounded square (corner radius about 14% of the tile).

STYLE — identical across all 9:
- kawaii Japanese travel sticker style, flat solid colors, NO gradients
- thick white outline around the whole scene, like a die-cut sticker
- solid drop shadow below, darker shade of the main color, no blur
- simple foreground details only: a few rounded trees, one small cloud,
  a water line — keep it readable at small size
- NO people faces, NO text, NO letters, NO numbers, NO logos

PALETTE — use only these hex colors:
[วางจานสีของธีมที่เลือก]

SUBJECTS (left to right, top to bottom):
1. <สถานที่ 1>
...
9. <สถานที่ 9>

Output 768x768 px, each tile exactly 256x256 px.
```

---

## PROMPT C — ไอคอนกระเป๋าเงิน (256×256 · สี่เหลี่ยมมุมโค้ง)

```
A 2x3 grid of 6 flat-illustration wallet icons on a pure white background.

STYLE — identical across all 6:
- kawaii sticker style, flat solid colors, NO gradients
- thick white outline, solid drop shadow below in a darker shade, no blur
- chunky rounded shapes, friendly and simple
- NO text, NO letters, NO numbers, NO card brand logos

PALETTE — use only these hex colors:
[วางจานสีของธีมที่เลือก]

SUBJECTS:
1. billfold wallet
2. coin purse
3. card holder
4. travel pouch with zipper
5. money envelope
6. small cloth drawstring bag

Output 512x768 px, each cell exactly 256x256 px.
```

---

## PROMPT D — ไอคอนสกุลเงิน (192×192 · วงกลมเต็ม)

```
A 3x3 grid of 9 flat coin icons on a pure white background.

Each coin fills its entire cell as a perfect circle, edge to edge.

STYLE — identical across all 9:
- kawaii sticker style, flat solid colors, NO gradients
- thick white ring outline around each coin
- solid drop shadow below in a darker shade, no blur
- each coin has ONE distinct base color so they are easy to tell apart
- the currency symbol may appear as a simple engraved shape, but
  NO other text, NO country names, NO numbers, NO flags

PALETTE — use only these hex colors:
[วางจานสีของธีมที่เลือก]

SUBJECTS (currency symbols): ¥ yen, ฿ baht, $ dollar, € euro,
₩ won, £ pound, ¥ yuan, S$ singapore dollar, A$ australian dollar

Output 576x576 px, each cell exactly 192x192 px.
```

---

## PROMPT E — แบนเนอร์ทริป (1920×810 · แนวนอน)

```
A wide illustrated travel map banner, 1920x810 px, kawaii flat-vector style
like a children's picture-book map. Flat solid colors, NO gradients.

CONTENT: a stylised map of <ประเทศ/ภูมิภาค> as a cream-colored landmass
surrounded by pale blue water, scattered with small rounded trees, hills,
and a few famous landmarks of the region drawn as little stickers with
thin white outlines.

RULES — these matter most:
- absolutely NO text, NO letters, NO numbers, NO labels, NO map pins
  (the app draws all place names and route lines on top with code)
- keep the LEFT THIRD visually calm and uncluttered
- landmarks concentrated in the right half
- soft, low contrast, no harsh shadows — route lines will sit on top
  and must stay readable

PALETTE — use only these hex colors:
[วางจานสีของธีมที่เลือก] + cream #FBF3E6, water #CFE9F5
```

> ⚠️ ย้ำเรื่อง **NO text, NO map pins** ให้หนัก — แบนเนอร์ชุดก่อนมีตัวอักษรฝังมา
> ทุกใบ แล้วต้องเสียเวลาลบทีหลัง

---

## หลังได้ไฟล์มาแล้ว

1. ตัดเป็นไฟล์เดี่ยวตามขนาดในตารางด้านบน
2. อัปโหลดในแอปตามจุดนี้:
   - **ไอคอนค่าใช้จ่าย** → เพิ่มเติม → รายการค่าใช้จ่ายในทริปนี้ → แก้ไข → เลือกไอคอน
   - **ไอคอนสถานที่** → แผนเที่ยว → แก้ไขสถานที่ → เลือกไอคอน
   - **ไอคอนกระเป๋า** → กระเป๋า → ปุ่ม 🎨 บนการ์ด
   - **ไอคอนสกุลเงิน** → เพิ่มเติม → สกุลเงินในทริป → แก้ไข
   - **แบนเนอร์** → วันนี้ → ปุ่ม 🖼️ เปลี่ยนแบนเนอร์
3. ระบบย่อ ครอบ และอัปโหลดขึ้น R2 ให้เอง ทุกคนในครอบครัวเห็นเหมือนกัน

## ข้อควรระวังตอน generate

- **Gemini กับ ChatGPT ตีความ "flat, no gradients" ไม่เหมือนกัน** ถ้าได้ภาพมามีไล่สี
  ให้เพิ่มประโยค `Use only solid fills. Do not use any gradient, glow, or soft shading.`
- ถ้าได้ตัวอักษรติดมา ให้สั่ง regenerate อย่าเสียเวลา inpaint — มักจะโผล่ที่อื่นแทน
- ขอทีละ 9 ช่องกำลังดี มากกว่านั้นคุณภาพต่อช่องจะตก
- **generate ธีมละรอบ** อย่าปนจานสี Hokkaido กับ Sakura ในภาพเดียว

---

# 👤 รูปประจำตัวสมาชิก (2026-08-23)

ใช้ในหน้า "คนและสิทธิ์" · ตัวกรองรายคนในหน้าบิล · การ์ดรายคน · แถบสถานะสมาชิก

## สเปกที่แอปใช้

| หัวข้อ | ค่า |
|---|---|
| ขนาด | **192 × 192 px** (จัตุรัส 1 : 1) |
| ทรง | **วงกลม** — แอปครอบเป็นวงให้เอง |
| ไฟล์ | PNG พื้นโปร่งใส (หรือ WebP) |
| ขนาดจริงบนจอ | **22–44 px เท่านั้น** |

## 🔴 กฎที่สำคัญที่สุดของรูปชุดนี้

**รูปจะถูกย่อเหลือ 22–44 px** เล็กกว่าไอคอนหมวดค่าใช้จ่ายเกือบครึ่ง
นั่นแปลว่า:

1. **ต้องเป็นหัวไหล่เท่านั้น ห้ามเป็นคนเต็มตัว** — คนเต็มตัวย่อแล้วกลายเป็นจุดสี
2. **ใบหน้ากินพื้นที่ 65–75% ของวง** ไม่ใช่ 40% แบบภาพถ่ายโปรไฟล์ทั่วไป
3. **รายละเอียดเล็กกว่า 6 px ในภาพต้นฉบับจะหายหมด** — ห้ามใส่ลายเสื้อ ต่างหูเล็ก ๆ กระดุม
4. **แต่ละใบต้องต่างกันที่ "ทรงผม + สีพื้นหลัง" เป็นหลัก** ไม่ใช่ต่างที่รายละเอียดหน้า
   เพราะที่ 26 px คนแยกออกได้แค่ทรงกับสีเท่านั้น
5. ห้ามมีตัวอักษร ตัวเลข โลโก้ (กฎเดิมของทั้งเอกสาร)

## Prompt สำหรับ generate (ทีเดียว 9 ใบ)

```
A 3x3 grid of 9 kawaii avatar portraits, flat 2D vector illustration.

STYLE
- Flat solid colours only. No gradients, no 3D shading, no outlines other
  than a subtle 3px darker line where hair meets face.
- Head-and-shoulders only, cropped at the chest. NOT full body.
- The face fills about 70% of each cell. Large simple eyes, small smile,
  soft pink blush circles on both cheeks.
- Each portrait sits on its own SOLID PASTEL CIRCLE that fills the cell.

VARIATION (this is what makes them distinguishable when tiny)
Give each of the 9 a clearly different HAIRSTYLE and a different
BACKGROUND CIRCLE COLOUR:
short hair / bob / top bun / curly afro / cap / long straight hair /
beard / round glasses / headscarf

BACKGROUND CIRCLE PALETTE (use each once, exact hex)
#F6BFD0  #C8E5ED  #F0DFBF  #C4E3CD  #D6D2F5
#FAD4C0  #BFE3E8  #F3D9F0  #DCE7F7

SKIN TONES: vary naturally across #FFE7D3 #F7D9BE #E0B48C #C08A5E

HARD RULES
- Pure white background BETWEEN the cells, no pattern, no border, no frame.
- NO text, NO numbers, NO logos, NO watermark anywhere.
- NO tiny details: no earrings, no buttons, no shirt patterns, no freckles.
  Anything smaller than 6px will disappear when the image is scaled down.
- Each cell 512x512, final grid 1536x1536.
```

## ทำต่ออย่างไรหลังได้ภาพมา

1. เปิดแอป → หน้าจัดการ → **คนและสิทธิ์** → กด ✏️ ที่ชื่อคน → **เลือกรูป**
2. ในกล่องเลือกรูป กด **อัปโหลด** แล้วเลือกแผ่นรวมที่ได้มา
3. ตัวตัดภาพในแอปจะหั่นแผ่น 3×3 ให้เอง ลบพื้นขาวเป็นโปร่งใส แล้วย่อเป็น 192×192
4. เลือกใบที่ต้องการ → กดบันทึก

> ถ้าตัดแล้วได้ทั้งแผ่นเป็นชิ้นเดียว แปลว่าพื้นหลังระหว่างช่องไม่ขาวสนิท
> ให้ generate ใหม่โดยย้ำว่า **pure white background between the cells**

## ชุดสำรองที่มีอยู่แล้ว

ระหว่างยังไม่ได้ generate มี SVG หน้าคนแบบแบน 8 แบบให้เลือกได้ทันที
(`art/icons/member_*.svg` — ผมสั้น · ผมบ๊อบ · มัดจุก · ผมหยิก · ใส่หมวก · ผมยาว · มีหนวดเครา · ใส่แว่น)
เป็นเวกเตอร์จึงคมทุกขนาด แต่หน้าตาเรียบกว่าชุดที่ generate เอง

**ไม่เลือกรูปเลยก็ได้** — ระบบจะใช้ตัวอักษรตัวแรกของชื่อบนวงกลมสีประจำตัวเหมือนเดิม
