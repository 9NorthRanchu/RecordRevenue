# คู่มือใช้ Terminal — RecordRevenue (สำหรับ Mac)

## 1) เปิด Terminal
- กด `Cmd + Space` → พิมพ์ `Terminal` → Enter
- จะเห็นบรรทัดประมาณ `DNorth@Puiis-MacBook-Air ~ %`  (` % ` = พร้อมรับคำสั่ง)

## 2) คำสั่งพื้นฐานที่ใช้บ่อย
| คำสั่ง | ทำอะไร |
|---|---|
| `pwd` | บอกว่าตอนนี้อยู่โฟลเดอร์ไหน |
| `ls` | ดูรายชื่อไฟล์ในโฟลเดอร์ |
| `ls -la` | ดูไฟล์ทั้งหมด (รวมไฟล์ซ่อน เช่น .gitignore) |
| `cd โฟลเดอร์` | เข้าไปในโฟลเดอร์ |
| `cd ..` | ถอยออกมา 1 ชั้น |
| `clear` | ล้างหน้าจอ |

**เคล็ดลับ:**
- กด **ลูกศรขึ้น ↑** = เรียกคำสั่งก่อนหน้ากลับมา (ไม่ต้องพิมพ์ใหม่)
- กด **Tab** = เติมชื่อไฟล์/โฟลเดอร์อัตโนมัติ
- กด **Ctrl + C** = หยุดคำสั่งที่กำลังรัน/ค้าง

## 3) เข้าโฟลเดอร์โปรเจกต์ (ทำทุกครั้งที่เปิด Terminal ใหม่)
Path มีเว้นวรรค ต้องใส่เครื่องหมาย `"..."` ครอบ:
```
cd "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue"
```
**วิธีง่ายกว่า:** พิมพ์ `cd ` (มีเว้นวรรค 1 ที) แล้ว **ลากโฟลเดอร์ RecordRevenue จาก Finder มาวางในหน้าต่าง Terminal** → มันจะเติม path ให้เอง → กด Enter

**ตรวจว่าอยู่ถูกที่:** พิมพ์ `ls` แล้วต้องเห็น `backend`, `frontend`, `wrangler.json`

## 4) Git — บันทึกจุดเช็คพอยต์
**ตั้งครั้งแรกครั้งเดียว:**
```
git config --global user.name "North"
git config --global user.email "nimz.4.april@gmail.com"
git init
git add .
git commit -m "จุดเริ่มต้น RecordRevenue"
```
**ใช้ประจำ (ก่อนสลับ AI / หลังทำเสร็จ):**
```
git add .
git commit -m "อธิบายสั้นๆ ว่าแก้อะไร"
```
**ดู / ย้อน:**
```
git log --oneline          ดูประวัติจุดเช็คพอยต์
git status                 ดูว่าแก้ไฟล์อะไรไปบ้าง
git restore ชื่อไฟล์         ทิ้งการแก้ไฟล์นั้น กลับจุดล่าสุด
git reset --hard <id>      ย้อนทั้งโปรเจกต์กลับไป commit นั้น (ใช้ id จาก git log)
```

## 5) Deploy ขึ้นเว็บจริง (Cloudflare)
```
npx wrangler deploy                    # backend (โค้ด API)
npx wrangler pages deploy frontend     # frontend (หน้าเว็บ)
```
- ครั้งแรกที่ใช้ `npx` อาจถามติดตั้ง → พิมพ์ `y` แล้ว Enter
- ถ้ายังไม่ได้ล็อกอิน Cloudflare: `npx wrangler login` (เปิดเบราว์เซอร์ให้กด Allow)
- หลัง deploy frontend เสร็จ → เปิดเว็บแล้ว **hard refresh: `Cmd + Shift + R`**

## 6) รันคำสั่งกับฐานข้อมูล (D1)
**รันไฟล์ .sql:**
```
npx wrangler d1 execute record-revenue-db --remote --file=ชื่อไฟล์.sql
```
**รันคำสั่งสั้นๆ บรรทัดเดียว:**
```
npx wrangler d1 execute record-revenue-db --remote --command "SELECT user_id, name, role FROM Users;"
```
- `--remote` = ฐานข้อมูลจริงบนคลาวด์ (ถ้าไม่ใส่ = ฐานข้อมูลทดสอบในเครื่อง)
- ผลลัพธ์เป็นตารางจะขึ้น **เหนือ** บรรทัดสรุปท้าย (ถ้ายาวให้เลื่อนขึ้นดู)

## 7) เช็คโค้ดก่อน deploy (กันพัง)
```
node --check frontend/app.js       # เช็ค syntax frontend (ถ้าไม่ error = ผ่าน)
```

## 8) ปัญหาที่เจอบ่อย + วิธีแก้
| อาการ | แก้ยังไง |
|---|---|
| `no such file or directory` | ยังไม่ได้ `cd` เข้าโฟลเดอร์ หรือ path ไม่มี `"..."` ครอบ |
| `command not found: npx` | ยังไม่ได้ติดตั้ง Node.js → โหลดจาก nodejs.org |
| คำสั่งค้าง ไม่ตอบ | กด `Ctrl + C` เพื่อหยุด แล้วลองใหม่ |
| deploy แล้วเว็บไม่เปลี่ยน | ยังไม่ hard refresh (`Cmd+Shift+R`) หรือลืม deploy frontend |
| `Authentication error` (wrangler) | รัน `npx wrangler login` ใหม่ |

## 9) Cheat Sheet — งานที่ทำบ่อย
```
# เปิดงาน
cd "/Users/DNorth/.../RecordRevenue"     (ลากโฟลเดอร์มาวางแทนได้)
ls                                        (เช็คว่าอยู่ถูกที่)

# เซฟจุดเช็คพอยต์
git add . && git commit -m "..."

# ขึ้นเว็บ
npx wrangler deploy
npx wrangler pages deploy frontend

# แก้ฐานข้อมูล
npx wrangler d1 execute record-revenue-db --remote --file=xxx.sql
```
