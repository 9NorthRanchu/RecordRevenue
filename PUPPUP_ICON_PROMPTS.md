# PupPup Trip — Prompt สำหรับ generate ไอคอนเพิ่ม

ไอคอนที่มีอยู่แล้ว (ตัดจาก mockup) อยู่ใน `frontend/puppup-prototype/art/`
ไฟล์นี้คือสูตรสำหรับสร้าง **ชุดใหม่ให้เข้ากันแบบแยกไม่ออก**

---

## กฎเหล็ก 4 ข้อ

1. **generate ทีละแผ่นรวมหลายไอคอน** (grid 3×3 หรือ 4×4) ไม่ใช่ทีละอัน — สไตล์จะสม่ำเสมอกว่ามาก แล้วค่อยตัดแยก
2. **พื้นหลังขาวล้วน** เสมอ (ห้ามโปร่งใส/ห้ามลายฉากหลัง) เพราะเราตัดเป็นสี่เหลี่ยมแล้วครอบวงกลมด้วย CSS
3. ระบุ **ขนาดสุดท้าย 256×256 px ต่อช่อง** และให้ไอคอนกินพื้นที่ ~70% ของช่อง
4. ล็อกจานสีด้วย hex เสมอ — นี่คือสิ่งที่ทำให้ชุดใหม่ "เข้ากัน" มากที่สุด

---

## จานสีมาตรฐาน (สกัดจาก mockup)

```
ชมพู   #F382A1   ฟ้า    #79ACF5   ม่วง   #9D82EE
เขียว  #A3D2AB   ส้ม    #F8BC71   แดง    #E2574C
เหลือง #F5C451   น้ำเงินเข้ม #16294D  เทาอ่อน #DCE3EC
```

---

## PROMPT A — ไอคอนกลมสำหรับ "บิล / หมวดหมู่ / รายการล่าสุด"

> ใช้สร้างไอคอนแบบเดียวกับ ราเมง / รถไฟ / โรงแรม / ตะกร้าของฝาก

```
A 3x3 grid of 9 flat-illustration app icons on a pure white background.

Each icon sits centered inside its own soft pastel circle badge that fills
about 88% of its grid cell. The subject fills about 70% of the circle.

STYLE — must be identical across all 9:
- flat vector illustration, soft rounded shapes, no gradients except a very
  subtle two-tone shading on each object
- thin darker outline of the object's own colour, roughly 3px at 256px scale
- soft, friendly, kawaii Japanese-travel sticker look
- no text, no letters, no numbers, no drop shadow outside the circle
- clean white background between cells, no borders, no grid lines

PALETTE — use only these:
pink #F382A1, blue #79ACF5, purple #9D82EE, green #A3D2AB,
orange #F8BC71, red #E2574C, yellow #F5C451, navy #16294D, light grey #DCE3EC
Circle badge = the icon's main colour at 18% opacity on white.

SUBJECTS (left to right, top to bottom):
1. <หัวข้อ 1>
2. <หัวข้อ 2>
...
9. <หัวข้อ 9>

Output 768x768 px, each cell exactly 256x256 px.
```

**ตัวอย่างชุดหัวข้อที่น่าจะได้ใช้ต่อ:**
`ซูชิจานเดียว` · `ถ้วยชาเขียวมัทฉะ` · `เครื่องบิน` · `แท็กซี่` · `รถบัสนำเที่ยว` ·
`เรือเฟอร์รี่` · `ออนเซ็น` · `บ้านพักไรออกัง` · `ตั๋วเข้าชม` · `ตู้กาชาปอง` ·
`ร่มกันฝน` · `ยาและเวชภัณฑ์` · `ซิมการ์ด/WiFi` · `ตู้ล็อกเกอร์` · `ค่าธรรมเนียม/ATM`

---

## PROMPT B — ภาพประกอบสถานที่ (rounded-square) สำหรับไทม์ไลน์แผนเที่ยว

> ใช้สร้างแบบเดียวกับ Senso-ji / Nakamise / Sumida River

```
A 3x3 grid of 9 flat-illustration landmark tiles on a pure white background.

Each tile is a rounded square (corner radius ~14% of the tile) filled with a
very light sky-blue to cream gradient background, with a single landmark
illustration centered inside filling about 75% of the tile.

STYLE — identical across all 9:
- flat vector illustration, soft pastel Japanese travel-guide look
- gentle two-tone shading, thin darker outline on the main structure
- tiny simple foreground details only (a few trees, a small cloud, water line)
- no people, no text, no letters, no numbers, no logos
- clean white background between tiles, no borders

PALETTE — use only these:
pink #F382A1, blue #79ACF5, purple #9D82EE, green #A3D2AB,
orange #F8BC71, red #E2574C, yellow #F5C451, navy #16294D, light grey #DCE3EC
Tile background = #EAF4FC fading to #FBF6EE.

SUBJECTS (left to right, top to bottom):
1. <สถานที่ 1>
...
9. <สถานที่ 9>

Output 768x768 px, each tile exactly 256x256 px.
```

---

## PROMPT C — สติกเกอร์ตกแต่ง (มีขอบขาว) สำหรับ hero / มุมการ์ด

> ใช้สร้างแบบเดียวกับ กล้อง+รูป, กระเป๋าเดินทาง, กระเป๋าสตางค์+เหรียญ

```
A 2x3 grid of 6 die-cut sticker illustrations on a pure white background.

Each sticker has a thick clean white outline (about 8px at 256px scale) all
the way around the subject, like a printed vinyl sticker, with a very soft
grey drop shadow just under the white edge.

STYLE — identical across all 6:
- flat vector illustration, soft pastel, kawaii Japanese travel look
- gentle two-tone shading, thin darker outline inside the white border
- slightly tilted, playful composition
- no text, no letters, no numbers

PALETTE — use only these:
pink #F382A1, blue #79ACF5, purple #9D82EE, green #A3D2AB,
orange #F8BC71, red #E2574C, yellow #F5C451, navy #16294D

SUBJECTS:
1. <สติกเกอร์ 1>
...
6. <สติกเกอร์ 6>

Output 512x768 px, each cell exactly 256x256 px.
```

---

## PROMPT D — ภาพ hero / banner ทริป (แผนที่การ์ตูน)

```
A wide illustrated travel map banner, 1738x990 px, in soft pastel flat
vector style — the same look as a children's picture-book map.

CONTENT: a stylised map of <ประเทศ/ภูมิภาค> as a cream-coloured landmass
(#FBF3E6) surrounded by pale blue water (#CFE9F5), scattered with small
rounded trees, hills and a few famous landmarks of the region rendered as
little stickers with thin white outlines.

RULES:
- absolutely NO text, NO letters, NO numbers, NO labels, NO map pins
- keep the LEFT THIRD of the image visually calm and uncluttered
  (headline text will be placed there later)
- landmarks concentrated in the right half
- soft, low-contrast, no harsh shadows

PALETTE: cream #FBF3E6, water #CFE9F5, sky #D8EEF8,
foliage #A8D5B5 and #7FBF95, roof red #E2574C, roof teal #6BA79B,
blossom pink #F5B9CC, snow white #FFFFFF
```

> ข้อสำคัญ: ต้องย้ำ **"NO text, NO map pins"** ให้หนัก เพราะ hero ทั้ง 4 ภาพเดิม
> มีตัวอักษรฝังมาด้วย และต้องเสียเวลาลบออกด้วย inpainting ทีหลัง

---

## หลังได้ไฟล์มาแล้ว

วางไฟล์ที่ generate ไว้ที่ `frontend/puppup-prototype/art/incoming/` แล้วบอกผม
ผมจะตัดเป็นไฟล์เดี่ยว ตั้งชื่อตาม convention เดิม (`ic_*`, `cat_*`, `act_*`, `st_*`, `banner_*`)
ปรับขนาด/ครอปให้ตรงกริดของ mockup แล้วต่อเข้ากับ `Categories.icon_asset` / `TripStops.icon_asset`
