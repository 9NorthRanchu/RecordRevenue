#!/bin/bash
# ติดตั้งระบบปิดเดือนบนฐานข้อมูลจริง (ตาราง + trigger ล็อก) — รันครั้งเดียว รันซ้ำได้ปลอดภัย
# ใช้: bash setup-period-close.sh
set -u
cd "$(dirname "$0")" || exit 1
npx wrangler d1 execute record-revenue-db --remote --file backend/db/migrations/2026-10-11-period-close.sql 2>&1 | grep -Ei "error|success|rows_written|executed" | head -5
echo
echo "▶ ตรวจ: trigger ล็อกเดือน (ควรได้ 8)"
npx wrangler d1 execute record-revenue-db --remote --json --command "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_period_%'" 2>/dev/null | grep -o '"n": [0-9]*'
