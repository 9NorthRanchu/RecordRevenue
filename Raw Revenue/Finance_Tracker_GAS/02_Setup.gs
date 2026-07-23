// ============================================================
// 02_Setup.gs — One-time setup: สร้าง Sheets + Master Data
// วิธีใช้: เปิด Apps Script → เลือก setupAll → กด Run
// ============================================================

function setupAll() {
  Logger.log('=== Finance Tracker Setup ===');
  createAllSheets();
  populateMasterData();
  protectHeaders();
  Logger.log('✅ Setup complete! Sheets: ' + getSS().getSheets().map(function(s){return s.getName();}).join(', '));
  SpreadsheetApp.getUi().alert(
    '✅ Setup เสร็จแล้ว!\n\n' +
    'สร้าง ' + getSS().getSheets().length + ' sheets\n\n' +
    'ขั้นตอนต่อไป:\n' +
    '1. รัน setupScriptProperties() เพื่อตั้งค่าเริ่มต้น\n' +
    '2. ไปที่ Project Settings → Script Properties → กรอก Token จริง\n' +
    '3. กรอก MD_HeadOwners, MD_Accounts, MD_Customers\n' +
    '4. Deploy Web App'
  );
}

// ── ตั้งค่า Script Properties ครั้งแรก ───────────────────────
// รันครั้งเดียว: GAS Editor → เลือก setupScriptProperties → Run
// จากนั้นไปแก้ค่าจริงใน: Project Settings → Script Properties
function setupScriptProperties() {
  var ss = getSS();
  var defaults = {
    FINANCE_SHEET_ID       : ss.getId(),
    LINE_CHANNEL_TOKEN     : 'YOUR_LINE_CHANNEL_ACCESS_TOKEN',
    LINE_CHANNEL_SECRET    : 'YOUR_LINE_CHANNEL_SECRET',
    LINE_CHANNEL_ID        : 'YOUR_LINE_CHANNEL_ID',
    APP_PIN                : '1234',
    WEB_APP_URL            : 'PASTE_AFTER_DEPLOY',
    SLIP_FOLDER_ID         : 'YOUR_GOOGLE_DRIVE_FOLDER_ID',
    TIMEZONE               : 'Asia/Bangkok',
    DEFAULT_WHT_RATE       : '3',
    TRANSFER_MATCH_DAYS    : '1',
    TRANSFER_FEE_TOLERANCE : '100',
    DUPLICATE_WINDOW_DAYS  : '1',
    APPSHEET_APP_ID        : '',
  };

  // setProperties(props, deleteAllOthers=false) — ไม่ลบ key ที่มีอยู่แล้ว
  PropertiesService.getScriptProperties().setProperties(defaults, false);

  var msg = '✅ Script Properties ตั้งค่าแล้ว!\n\n' +
    'ขั้นตอนต่อไป:\n' +
    '1. ไปที่ ⚙ Project Settings → Script Properties\n' +
    '2. แก้ไขค่าต่อไปนี้:\n' +
    '   • LINE_CHANNEL_TOKEN — จาก LINE Developers Console\n' +
    '   • LINE_CHANNEL_SECRET — จาก LINE Developers Console\n' +
    '   • APP_PIN — รหัส PIN ที่ต้องการ\n' +
    '   • SLIP_FOLDER_ID — ID ของ Google Drive folder\n' +
    '   • WEB_APP_URL — ใส่หลัง Deploy แล้ว\n\n' +
    'FINANCE_SHEET_ID ตั้งให้อัตโนมัติแล้ว: ' + ss.getId();

  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

// ── Header definitions ───────────────────────────────────────
const TB_HEADERS = [
  'Trans_ID','Date','Head_Owner','Account_Out','Account_In','Customer',
  'Group_Detail','Category','Sub_Category','Detail','Trip_Tag',
  'Gross_Amount','Fee','WHT_Rate','WHT_Amount','Net_Amount',
  'Transfer_Ref','Status','Source','Slip_Image','Ref_No',
  'Invoice_ID','Receipt_ID','Created_At'
];

function createAllSheets() {
  const ss = getSS();
  const order = [
    SHEET_NAMES.TB_STAGING, SHEET_NAMES.TB_TRANSACTIONS,
    SHEET_NAMES.MD_HEAD_OWNERS, SHEET_NAMES.MD_ACCOUNTS,
    SHEET_NAMES.MD_CATEGORIES, SHEET_NAMES.MD_SUBCATEGORIES,
    SHEET_NAMES.MD_CUSTOMERS, SHEET_NAMES.MD_TRIPS,
    SHEET_NAMES.RPT_BALANCE,
    // CONFIG sheet ถูกแทนที่ด้วย Script Properties แล้ว
  ];

  // Remove default Sheet1 if empty
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
  if (def && def.getLastRow() <= 1) {
    if (ss.getSheets().length > 1) ss.deleteSheet(def);
  }

  order.forEach(function(name){ getOrCreateSheet(name); });

  // TB_Staging
  _initTBSheet(SHEET_NAMES.TB_STAGING, '📥 Staging — รอ Review', '#1565C0');
  // TB_Transactions
  _initTBSheet(SHEET_NAMES.TB_TRANSACTIONS, '✅ Transactions — ยืนยันแล้ว', '#0277BD');

  // MD sheets
  _setHeaders(SHEET_NAMES.MD_HEAD_OWNERS,
    ['Owner_ID','Name','Type','Tax_ID','Description','Active'], '#2E7D32');
  _setHeaders(SHEET_NAMES.MD_ACCOUNTS,
    ['Acc_ID','Owner_ID','Bank','Acc_Name','Acc_No','Acc_Type',
     'OCR_Keywords','Opening_Balance','Credit_Limit','Currency','Note'], '#2E7D32');
  _setHeaders(SHEET_NAMES.MD_CATEGORIES,
    ['Cat_ID','Group_Detail','Category_Name','Icon','Default_Flow','Note'], '#388E3C');
  _setHeaders(SHEET_NAMES.MD_SUBCATEGORIES,
    ['SubCat_ID','Cat_ID','Category_Name','SubCat_Name','Note'], '#388E3C');
  _setHeaders(SHEET_NAMES.MD_CUSTOMERS,
    ['Cust_ID','Name_TH','Name_EN','Tax_ID','Branch','Contact_Name',
     'Email','Tel','Line_ID','Note'], '#1B5E20');
  _setHeaders(SHEET_NAMES.MD_TRIPS,
    ['Trip_ID','Trip_Name','Start_Date','End_Date','Destination',
     'Travelers','Budget','Currency','Note'], '#1B5E20');
  _setHeaders(SHEET_NAMES.RPT_BALANCE,
    ['Acc_ID','Acc_Name','Bank','Acc_Type','Opening_Bal','Total_IN',
     'Total_OUT','Fee_Total','Current_Balance','Credit_Limit','Available_Credit'], '#4A148C');
  // CONFIG sheet ไม่สร้างแล้ว — ใช้ Script Properties แทน (setupScriptProperties)

  Logger.log('Sheets created.');
}

function _initTBSheet(name, note, color) {
  const ws = getSheet(name);
  ws.setTabColor(color);
  ws.getRange(1,1,1,TB_HEADERS.length).setValues([TB_HEADERS]);
  const hdr = ws.getRange(1,1,1,TB_HEADERS.length);
  hdr.setFontWeight('bold').setFontColor('#FFFFFF')
     .setBackground(color === '#1565C0' ? '#1565C0' : '#0277BD')
     .setHorizontalAlignment('center');
  ws.setFrozenRows(1);
  ws.setColumnWidth(1,150); ws.setColumnWidth(2,110); ws.setColumnWidth(10,250);
  ws.setColumnWidth(20,200);
}

function _setHeaders(name, headers, color) {
  const ws = getSheet(name);
  ws.setTabColor(color);
  ws.getRange(1,1,1,headers.length).setValues([headers]);
  ws.getRange(1,1,1,headers.length)
    .setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground(color).setHorizontalAlignment('center');
  ws.setFrozenRows(1);
}

// populateConfig() ถูกแทนที่ด้วย setupScriptProperties() แล้ว

function populateMasterData() {
  _populateMDAccounts();
  _populateMDCategories();
  _populateMDSubCategories();
  Logger.log('Master Data populated.');
}

function _populateMDAccounts() {
  const ws = getSheet(SHEET_NAMES.MD_ACCOUNTS);
  if (ws.getLastRow() > 1) { Logger.log('MD_Accounts: already has data, skip.'); return; }
  const rows = [
    ['ACC001','OWN001','KBank',     '⚠️ KBank-[ชื่อ]-ออมทรัพย์',    'xxx-x-xxxxx-x','Saving',     'kplus,kbiz,กสิกร,kasikorn,k plus',0,0,'THB',''],
    ['ACC002','OWN001','SCB',       '⚠️ SCB-[ชื่อ]-ออมทรัพย์',      'xxx-xxxxxx-x', 'Saving',     'scb,ไทยพาณิชย์,easy,scbeasy',    0,0,'THB',''],
    ['ACC003','OWN001','KTB',       '⚠️ KTB-[ชื่อ]-ออมทรัพย์',      'xxx-x-xxxxx-x','Saving',     'krungthai,ktb,กรุงไทย,next,kma',  0,0,'THB',''],
    ['ACC004','OWN001','Krungsri',  '⚠️ Krungsri-[ชื่อ]-ออมทรัพย์', 'xxx-x-xxxxx-x','Saving',     'krungsri,กรุงศรี,bay',            0,0,'THB',''],
    ['ACC005','OWN001','BBL',       '⚠️ BBL-[ชื่อ]-ออมทรัพย์',      'xxx-x-xxxxx-x','Saving',     'bualuang,bangkokbank,bbl,กรุงเทพ',0,0,'THB',''],
    ['ACC006','OWN001','TrueMoney', '⚠️ TrueMoney Wallet',           'xxx-xxx-xxxx', 'Wallet',     'truemoney,ทรูมันนี่,วอลเล็ท',    0,0,'THB',''],
    ['ACC007','OWN002','KBank',     '⚠️ KBank-[ชื่อ2]-ออมทรัพย์',   'xxx-x-xxxxx-x','Saving',     'kplus,กสิกร,kasikorn',            0,0,'THB',''],
    ['ACC008','OWN003','KBank',     '⚠️ KBank-[บริษัท]-กระแสรายวัน','xxx-x-xxxxx-x','Current',    'kbiz,กสิกร',                      0,0,'THB','บัญชีบริษัท'],
    ['ACC009','OWN003','SCB',       '⚠️ SCB-[บริษัท]-ออมทรัพย์',    'xxx-xxxxxx-x', 'Saving',     'scb,ไทยพาณิชย์',                 0,0,'THB','บัญชีบริษัท'],
    ['ACC010','OWN001','KBank',     '⚠️ KBank-[ชื่อ]-บัตรเครดิต',   'xxxx-xxxx-xxxx-xxxx','CreditCard','kbank credit,กสิกร เครดิต',0,50000,'THB','CC'],
    ['ACC011','OWN001','SCB',       '⚠️ SCB-[ชื่อ]-บัตรเครดิต',     'xxxx-xxxx-xxxx-xxxx','CreditCard','scb credit,ไทยพาณิชย์ เครดิต',0,50000,'THB','CC'],
  ];
  ws.getRange(2,1,rows.length,rows[0].length).setValues(rows);
}

function _populateMDCategories() {
  const ws = getSheet(SHEET_NAMES.MD_CATEGORIES);
  if (ws.getLastRow() > 1) { Logger.log('MD_Categories: already has data, skip.'); return; }
  const rows = [
    ['CAT001','Expense','อาหาร',             '🍜','OUT','อาหารทุกมื้อ ร้านอาหาร ส่งอาหาร'],
    ['CAT002','Expense','เดินทาง',           '🚇','OUT','BTS MRT Grab Taxi น้ำมัน ค่าจอดรถ'],
    ['CAT003','Expense','ตั๋วเครื่องบิน',   '✈️','OUT','ตั๋วทุกสายการบิน domestic/international'],
    ['CAT004','Expense','ที่พัก/โรงแรม',    '🏨','OUT','โรงแรม Airbnb Resort'],
    ['CAT005','Expense','ลานสกี',           '⛷️','OUT','บัตรลานสกี อุปกรณ์เช่า ski lesson'],
    ['CAT006','Expense','ของขวัญ/ของฝาก',  '🎁','OUT','ของฝาก ของขวัญ ของที่ระลึก'],
    ['CAT007','Expense','ช้อปปิ้ง',         '🛍️','OUT','เสื้อผ้า แฟชั่น ของใช้ Duty Free'],
    ['CAT008','Expense','สาธารณูปโภค',     '💡','OUT','ค่าไฟ ค่าน้ำ อินเทอร์เน็ต โทรศัพท์'],
    ['CAT009','Expense','สุขภาพ',          '🏥','OUT','ยา คลินิก โรงพยาบาล ฟิตเนส'],
    ['CAT010','Expense','บันเทิง',         '🎬','OUT','โรงภาพยนตร์ คอนเสิร์ต ท่องเที่ยว'],
    ['CAT011','Expense','ค่าใช้จ่ายธุรกิจ','💼','OUT','ค่าบัญชี ซอฟต์แวร์ Office Supplies'],
    ['CAT012','Expense','ค่าเช่า/ผ่อน',   '🏠','OUT','ค่าเช่าบ้าน ผ่อนรถ ผ่อนทรัพย์สิน'],
    ['CAT013','Expense','ประกัน',          '🛡️','OUT','ประกันชีวิต สุขภาพ รถ'],
    ['CAT014','Expense','การศึกษา',       '📚','OUT','ค่าเรียน หนังสือ คอร์สออนไลน์'],
    ['CAT015','Expense','อื่นๆ',           '📋','OUT','ค่าใช้จ่ายที่ไม่อยู่ในหมวดอื่น'],
    ['CAT101','Income', 'รายได้ค่าบริการ', '💰','IN', 'รับเงินค่าบริการจากลูกค้า (มี WHT)'],
    ['CAT102','Income', 'เงินเดือน',       '💵','IN', 'เงินเดือนจากนายจ้าง'],
    ['CAT103','Income', 'ดอกเบี้ย',       '🏦','IN', 'ดอกเบี้ยเงินฝาก'],
    ['CAT104','Income', 'เงินปันผล',      '📈','IN', 'เงินปันผลหุ้น กองทุน'],
    ['CAT105','Income', 'รายได้อื่นๆ',    '💫','IN', 'รายได้ที่ไม่อยู่ในหมวดอื่น'],
    ['CAT201','Transfer','โอนเงิน',        '🔄','',  'โอนระหว่างบัญชีตัวเอง/ครอบครัว/บริษัท'],
    ['CAT301','AR',      'ลูกหนี้',        '📤','IN', 'เงินที่ลูกค้าค้างชำระ'],
    ['CAT401','AP',      'เจ้าหนี้',       '📥','OUT','เงินที่เราค้างจ่าย'],
  ];
  ws.getRange(2,1,rows.length,rows[0].length).setValues(rows);
}

function _populateMDSubCategories() {
  const ws = getSheet(SHEET_NAMES.MD_SUBCATEGORIES);
  if (ws.getLastRow() > 1) { Logger.log('MD_SubCategories: already has data, skip.'); return; }
  const rows = [
    ['SUB001','CAT001','อาหาร','อาหารเช้า',''],
    ['SUB002','CAT001','อาหาร','อาหารกลางวัน',''],
    ['SUB003','CAT001','อาหาร','อาหารเย็น',''],
    ['SUB004','CAT001','อาหาร','Delivery (GrabFood/Foodpanda)',''],
    ['SUB005','CAT001','อาหาร','กาแฟ/เครื่องดื่ม',''],
    ['SUB006','CAT002','เดินทาง','BTS/MRT',''],
    ['SUB007','CAT002','เดินทาง','Grab/Taxi',''],
    ['SUB008','CAT002','เดินทาง','น้ำมันรถ',''],
    ['SUB009','CAT002','เดินทาง','ค่าจอดรถ',''],
    ['SUB010','CAT003','ตั๋วเครื่องบิน','ในประเทศ',''],
    ['SUB011','CAT003','ตั๋วเครื่องบิน','ต่างประเทศ',''],
    ['SUB012','CAT004','ที่พัก/โรงแรม','โรงแรม',''],
    ['SUB013','CAT004','ที่พัก/โรงแรม','Airbnb',''],
    ['SUB014','CAT005','ลานสกี','บัตรลานสกี',''],
    ['SUB015','CAT005','ลานสกี','เช่าอุปกรณ์สกี',''],
    ['SUB016','CAT005','ลานสกี','Ski Lesson',''],
    ['SUB017','CAT007','ช้อปปิ้ง','เสื้อผ้า/แฟชั่น',''],
    ['SUB018','CAT007','ช้อปปิ้ง','Duty Free',''],
    ['SUB019','CAT008','สาธารณูปโภค','ค่าไฟ',''],
    ['SUB020','CAT008','สาธารณูปโภค','ค่าน้ำ',''],
    ['SUB021','CAT008','สาธารณูปโภค','อินเทอร์เน็ต',''],
    ['SUB022','CAT008','สาธารณูปโภค','โทรศัพท์มือถือ',''],
    ['SUB023','CAT009','สุขภาพ','ยา/เภสัชกรรม',''],
    ['SUB024','CAT009','สุขภาพ','หมอ/คลินิก',''],
    ['SUB025','CAT009','สุขภาพ','โรงพยาบาล',''],
    ['SUB026','CAT009','สุขภาพ','ฟิตเนส/ยิม',''],
    ['SUB027','CAT010','บันเทิง','โรงภาพยนตร์',''],
    ['SUB028','CAT010','บันเทิง','คอนเสิร์ต/อีเวนต์',''],
    ['SUB029','CAT011','ค่าใช้จ่ายธุรกิจ','ค่าบัญชี/ภาษี',''],
    ['SUB030','CAT011','ค่าใช้จ่ายธุรกิจ','Software/Subscription',''],
    ['SUB031','CAT101','รายได้ค่าบริการ','บัญชีรายเดือน',''],
    ['SUB032','CAT101','รายได้ค่าบริการ','ตรวจสอบบัญชี',''],
    ['SUB033','CAT101','รายได้ค่าบริการ','ยื่นภาษี',''],
    ['SUB034','CAT101','รายได้ค่าบริการ','ที่ปรึกษา',''],
  ];
  ws.getRange(2,1,rows.length,rows[0].length).setValues(rows);
}

function protectHeaders() {
  [SHEET_NAMES.TB_STAGING, SHEET_NAMES.TB_TRANSACTIONS].forEach(function(name){
    const ws = getSheet(name);
    const protection = ws.getRange(1,1,1,TOTAL_COLS).protect();
    protection.setDescription('Header row — do not edit');
    protection.setWarningOnly(true);
  });
}
