// ====================================================================
// 🚀 Google Sheets Apps Script: ดึงข้อมูลดิบจาก Cloudflare D1
// ====================================================================
// คัดลอกโค้ดนี้ไปวางในเมนู Extensions > Apps Script ในสเปรดชีตของคุณ
// และกำหนดค่าตัวแปรด้านล่างนี้ให้ตรงกับ Worker URL ของคุณ

const CLOUDFLARE_WORKER_URL = "https://record-revenue.9nimz.workers.dev";
const USER_ID = "Usr_A"; // ID ผู้ใช้ที่สิทธิ์ของชีตนี้ต้องการจำลองดึงข้อมูล

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("☁️ Cloudflare Sync")
    .addItem("🔄 ดึงข้อมูลธุรกรรมล่าสุด (Sync D1)", "syncTransactionsFromD1")
    .addToUi();
}

function syncTransactionsFromD1() {
  const ui = SpreadsheetApp.getUi();
  try {
    // 1. ดึงข้อมูลตารางหลัก Transactions
    const txData = fetchFromCloudflare("Transactions");
    writeToSheet("Transactions_D1", txData);

    // 2. ดึงข้อมูลตารางย่อย TransactionDetails
    const detailsData = fetchFromCloudflare("TransactionDetails");
    writeToSheet("TransactionDetails_D1", detailsData);

    ui.alert("✅ สำเร็จ", "ดึงข้อมูลจาก Cloudflare D1 ลงชีตเรียบร้อยแล้ว!", ui.ButtonSet.OK);
  } catch (error) {
    ui.alert("❌ ข้อผิดพลาด", "ไม่สามารถดึงข้อมูลได้: " + error.message, ui.ButtonSet.OK);
  }
}

function fetchFromCloudflare(tableName) {
  const url = `${CLOUDFLARE_WORKER_URL}/api/export?table=${tableName}`;
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "x-user-id": USER_ID
    },
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`HTTP ${responseCode}: ${responseText}`);
  }

  return JSON.parse(responseText);
}

function writeToSheet(sheetName, jsonData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  // สร้างชีตใหม่หากยังไม่มี
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear(); // ล้างข้อมูลเก่า
  }

  if (jsonData.length === 0) {
    sheet.getRange(1, 1).setValue("ไม่มีข้อมูลในตารางนี้");
    return;
  }

  // ดึงหัวคอลัมน์จากคีย์แรก
  const headers = Object.keys(jsonData[0]);
  sheet.appendRow(headers);

  // เตรียมแถวข้อมูลทั้งหมด
  const rows = [];
  for (let i = 0; i < jsonData.length; i++) {
    const row = [];
    for (let j = 0; j < headers.length; j++) {
      const val = jsonData[i][headers[j]];
      // แปลงพวกอ็อบเจกต์หรือค่าว่าง
      row.push(val === null || val === undefined ? "" : val);
    }
    rows.push(row);
  }

  // เขียนข้อมูลลงสเปรดชีตแบบทีเดียว (Batch write) เพื่อความรวดเร็ว
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  
  // ตกแต่งหัวคอลัมน์เล็กน้อย
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#E0F7FA")
    .setHorizontalAlignment("center");
    
  sheet.autoResizeColumns(1, headers.length);
}
