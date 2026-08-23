#!/bin/bash
# Deploy ทั้งระบบ — รันได้จากที่ไหนก็ได้
#
# ใช้: bash "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/deploy.sh"
#
# 🔴 ทำไมต้องมีไฟล์นี้ (2026-08-23):
#    คำสั่ง deploy ต้องรันจากโฟลเดอร์โปรเจกต์เท่านั้น เพราะ:
#      · wrangler.json อยู่ที่ root (บอกว่า main อยู่ไหน)
#      · pages deploy อ้าง path "frontend" แบบสัมพัทธ์
#      · wrangler ตัวจริงอยู่ใน node_modules ของโปรเจกต์
#    รันจาก ~ แล้วจะเจอสามอาการนี้ ซึ่งดูไม่ออกว่าเกี่ยวกับ cd:
#      · bash: setup-db.sh: No such file or directory
#      · ENOENT: scandir '/Users/DNorth/frontend'
#      · npx ไปโหลด wrangler ใหม่ แล้วชนเรื่องสิทธิ์ที่ /Users/DNorth/.Trash
#
#    บรรทัดล่างนี้ทำให้สคริปต์ cd เข้าโฟลเดอร์ของตัวเองก่อนเสมอ
#    รันจากที่ไหนก็ได้ผลเหมือนกัน

set -e
cd "$(dirname "$0")"
echo "▶ โฟลเดอร์โปรเจกต์: $(pwd)"
echo

# 🔴 ตรวจหน้าเว็บก่อนเสมอ และหยุดทันทีถ้าไม่ผ่าน (set -e ด้านบนทำให้หยุดเอง)
#    เพราะบั๊กที่ทำให้ทั้งแอปเข้าไม่ได้ (เรียกฟังก์ชันที่ถูกลบไปแล้ว)
#    เทสฝั่งเซิร์ฟเวอร์จับไม่ได้เลย — เคย deploy หลุดขึ้นไปจริงมาแล้ว
echo "▶ 1/5 ตรวจหน้าเว็บ (อ่านโค้ด)"
node check-frontend.mjs

echo
echo "▶ 2/5 ตรวจหน้าเว็บ (รันจริง)"
node check-frontend-runtime.mjs

echo
echo "▶ 3/5 เตรียมฐานข้อมูล"
bash setup-db.sh

echo
echo "▶ 4/5 Deploy backend (Cloudflare Worker)"
npx wrangler deploy

echo
echo "▶ 5/5 Deploy frontend (Cloudflare Pages)"
npx wrangler pages deploy frontend --project-name record-revenue-web

echo
echo "✅ เสร็จแล้ว"
echo "   หน้าเว็บ: https://record-revenue-web.pages.dev"
echo "   API    : https://record-revenue.9nimz.workers.dev"
