#!/bin/bash
# ตั้งให้ R2 ลบรูป/เอกสารที่ส่งเข้ากล่อง (ledger-docs/) อัตโนมัติเมื่อครบ 30 วัน — North เลือกแบบ ข (2026-10-11)
# ไม่แตะไฟล์อื่นในถัง (ไอคอน/รูปทริป) · รันครั้งเดียวพอ รันซ้ำจะบอกว่ามีกฎชื่อนี้แล้ว
# ใช้: bash setup-r2-lifecycle.sh
set -u
cd "$(dirname "$0")" || exit 1
npx wrangler r2 bucket lifecycle add record-revenue-icons ledger-docs-30d ledger-docs/ --expire-days 30 --force
echo
echo "▶ กฎที่ตั้งไว้ตอนนี้:"
npx wrangler r2 bucket lifecycle list record-revenue-icons
