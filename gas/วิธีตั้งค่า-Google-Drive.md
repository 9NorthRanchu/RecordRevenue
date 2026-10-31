# ตั้งค่าเก็บไฟล์ใน Google Drive (ทำครั้งเดียว · ~5 นาที)

1. เปิด https://script.google.com ด้วยบัญชี **nimz.4.april@gmail.com** → **New project** → ตั้งชื่อ `RecordRevenue Drive`
2. ลบโค้ดเดิมใน `Code.gs` ทิ้ง → วางโค้ดทั้งไฟล์จาก `gas/RecordRevenueDrive.gs`
3. แก้บรรทัด `const SECRET = '...'` เป็นรหัสลับยาว ๆ ของคุณเอง (อย่างน้อย 8 ตัว เช่น สุ่มตัวอักษร 20 ตัว) → กด 💾 Save
4. เลือกฟังก์ชัน `setup` ด้านบน → กด ▶ **Run** → Google ขอสิทธิ์ → **Review permissions** → เลือกบัญชี → **Advanced** → **Go to RecordRevenue Drive (unsafe)** → **Allow**
   (เป็นโค้ดของคุณเอง Google จึงขึ้นคำเตือนแบบนี้ · ได้โฟลเดอร์ `RecordRevenue` ใน Drive)
5. มุมขวาบน **Deploy → New deployment** → ⚙️ เลือก **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**  (ปลอดภัยเพราะทุกคำขอต้องมีรหัสลับ)
   → **Deploy** → คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)
6. ในแอป RecordRevenue: **ตั้งค่า → 💾 Backup/Restore → เก็บไฟล์ใน Google Drive** → วาง URL + รหัสลับ → **บันทึก + ทดสอบ** → ต้องขึ้น ✅ เชื่อมต่อสำเร็จ

ถ้าแก้โค้ด Apps Script ภายหลัง: Deploy → **Manage deployments** → ✏️ → Version: **New version** → Deploy (URL เดิมใช้ต่อได้)
