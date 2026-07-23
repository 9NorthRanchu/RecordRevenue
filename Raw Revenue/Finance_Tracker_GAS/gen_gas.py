import os

BASE = '/sessions/intelligent-laughing-bardeen/mnt/Self Money/Finance_Tracker_GAS'
os.makedirs(BASE, exist_ok=True)

def w(filename, content):
    path = os.path.join(BASE, filename)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.lstrip('\n'))
    print(f'✓ {filename} ({len(content):,} chars)')

# ════════════════════════════════════════════════════════════════════
# 01_Config.gs
# ════════════════════════════════════════════════════════════════════
w('01_Config.gs', '''
// ============================================================
// 01_Config.gs — Finance Tracker v1.0
// Constants, helpers, config reader
// ============================================================

const SHEET_NAMES = {
  TB_STAGING       : 'TB_Staging',
  TB_TRANSACTIONS  : 'TB_Transactions',
  MD_HEAD_OWNERS   : 'MD_HeadOwners',
  MD_ACCOUNTS      : 'MD_Accounts',
  MD_CATEGORIES    : 'MD_Categories',
  MD_SUBCATEGORIES : 'MD_SubCategories',
  MD_CUSTOMERS     : 'MD_Customers',
  MD_TRIPS         : 'MD_Trips',
  RPT_BALANCE      : 'RPT_AccountBalance',
  CONFIG           : 'CONFIG',
};

// Column index (1-based) ใน TB_Staging / TB_Transactions
const C = {
  TRANS_ID:1, DATE:2, HEAD_OWNER:3, ACCOUNT_OUT:4, ACCOUNT_IN:5,
  CUSTOMER:6, GROUP_DETAIL:7, CATEGORY:8, SUB_CATEGORY:9, DETAIL:10,
  TRIP_TAG:11, GROSS_AMOUNT:12, FEE:13, WHT_RATE:14, WHT_AMOUNT:15,
  NET_AMOUNT:16, TRANSFER_REF:17, STATUS:18, SOURCE:19, SLIP_IMAGE:20,
  REF_NO:21, INVOICE_ID:22, RECEIPT_ID:23, CREATED_AT:24,
};
const TOTAL_COLS = 24;

const STATUS = {
  PENDING            : 'Pending',
  TRANSFER_UNMATCHED : 'Transfer_Unmatched',
  TRANSFER_MATCHED   : 'Transfer_Matched',
  NEED_REVIEW        : 'NeedReview',
  DUPLICATE          : 'Duplicate',
  DONE               : 'Done',
};

let _configCache = null;

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name) {
  const ws = getSS().getSheetByName(name);
  if (!ws) throw new Error('Sheet "' + name + '" not found — run setupAll() first.');
  return ws;
}

function getOrCreateSheet(name) {
  const ss = getSS();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getConfig(key) {
  if (!_configCache) {
    _configCache = {};
    try {
      const ws = getSS().getSheetByName(SHEET_NAMES.CONFIG);
      if (ws) {
        const data = ws.getDataRange().getValues();
        data.forEach(function(r){ if (r[0]) _configCache[r[0]] = r[1]; });
      }
    } catch(e) { Logger.log('getConfig error: ' + e); }
  }
  return key ? (_configCache[key] || '') : _configCache;
}

function generateTransId() {
  const d = new Date();
  const p = function(n){ return String(n).padStart(2,'0'); };
  return 'TX-' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) +
         '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function formatDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.getFullYear() + '-' +
         String(dt.getMonth()+1).padStart(2,'0') + '-' +
         String(dt.getDate()).padStart(2,'0');
}

function nowStr() {
  const d = new Date();
  const p = function(n){ return String(n).padStart(2,'0'); };
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+
         ' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}

function safeFloat(v) {
  const n = parseFloat(String(v).replace(/,/g,''));
  return isNaN(n) ? 0 : n;
}
''')

# ════════════════════════════════════════════════════════════════════
# 02_Setup.gs
# ════════════════════════════════════════════════════════════════════
w('02_Setup.gs', '''
// ============================================================
// 02_Setup.gs — One-time setup: สร้าง Sheets + Master Data
// วิธีใช้: เปิด Apps Script → เลือก setupAll → กด Run
// ============================================================

function setupAll() {
  Logger.log('=== Finance Tracker Setup ===');
  createAllSheets();
  populateConfig();
  populateMasterData();
  protectHeaders();
  Logger.log('✅ Setup complete! Sheets: ' + getSS().getSheets().map(function(s){return s.getName();}).join(', '));
  SpreadsheetApp.getUi().alert('✅ Setup เสร็จแล้ว!\\n\\nสร้าง ' + getSS().getSheets().length + ' sheets\\n\\nขั้นตอนต่อไป:\\n1. กรอก MD_HeadOwners (ชื่อเจ้าของ)\\n2. กรอก MD_Accounts (ชื่อบัญชี + เลขบัญชี)\\n3. กรอก MD_Customers (ลูกค้า + Tax ID)\\n4. กรอก CONFIG (Sheet ID, LINE Token)\\n5. Deploy Web App');
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
    SHEET_NAMES.RPT_BALANCE, SHEET_NAMES.CONFIG,
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
  _setHeaders(SHEET_NAMES.CONFIG, ['KEY','VALUE','หมายเหตุ'], '#37474F');

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

function populateConfig() {
  const ws = getSheet(SHEET_NAMES.CONFIG);
  if (ws.getLastRow() > 1) { Logger.log('CONFIG already populated, skip.'); return; }
  const rows = [
    ['FINANCE_SHEET_ID',     '⚠️ ใส่ Sheet ID ของไฟล์นี้',        'เปิด Sheet → URL → .../d/[ID]/edit'],
    ['LINE_CHANNEL_TOKEN',   '⚠️ ใส่ LINE Channel Access Token',    'LINE Developers → Messaging API'],
    ['SLIP_FOLDER_ID',       '1rjPnfbyBIwRT9h5_0sHcOtDwtr-5ec1i',  'Folder เก็บสลิป (จาก code2.txt)'],
    ['APPSHEET_APP_ID',      '694e79b0-5ad4-47f1-b6d4-ef9095c9996c','AppSheet App ID (จาก code2.txt)'],
    ['OLD_BILLING_SHEET_ID', '1WsGIYSkkyFsvdm6iCLKrnOsbDf1Gy5vr4ZDkp85pQDE','Invoice system เดิม'],
    ['TIMEZONE',             'Asia/Bangkok',                          'GMT+7'],
    ['DEFAULT_WHT_RATE',     '3',                                    'อัตรา WHT default (%)'],
    ['TRANSFER_MATCH_DAYS',  '1',                                    '±N วัน สำหรับ Transfer matching'],
    ['TRANSFER_FEE_TOLERANCE','100',                                  'ค่าธรรมเนียมโอนสูงสุด (บาท)'],
    ['DUPLICATE_WINDOW_DAYS','1',                                    '±N วัน สำหรับเช็คซ้ำ'],
    ['WEB_APP_URL',          '⚠️ ใส่หลัง Deploy',                   'GAS → Deploy → Web App → URL'],
  ];
  ws.getRange(2,1,rows.length,3).setValues(rows);
}

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
''')

# ════════════════════════════════════════════════════════════════════
# 03_StagingService.gs
# ════════════════════════════════════════════════════════════════════
w('03_StagingService.gs', '''
// ============================================================
// 03_StagingService.gs — CRUD for TB_Staging + TB_Transactions
// ============================================================

// ── Add row to TB_Staging ─────────────────────────────────────
function addToStaging(data) {
  // data = object with keys matching TB_HEADERS
  const transId = data.transId || generateTransId();
  const now     = nowStr();

  const row = new Array(TOTAL_COLS).fill('');
  row[C.TRANS_ID-1]    = transId;
  row[C.DATE-1]        = data.date        || formatDate(new Date());
  row[C.HEAD_OWNER-1]  = data.headOwner   || '';
  row[C.ACCOUNT_OUT-1] = data.accountOut  || '';
  row[C.ACCOUNT_IN-1]  = data.accountIn   || '';
  row[C.CUSTOMER-1]    = data.customer    || '';
  row[C.GROUP_DETAIL-1]= data.groupDetail || '';
  row[C.CATEGORY-1]    = data.category    || '';
  row[C.SUB_CATEGORY-1]= data.subCategory || '';
  row[C.DETAIL-1]      = data.detail      || '';
  row[C.TRIP_TAG-1]    = data.tripTag     || '';
  row[C.GROSS_AMOUNT-1]= safeFloat(data.grossAmount);
  row[C.FEE-1]         = safeFloat(data.fee);
  row[C.WHT_RATE-1]    = safeFloat(data.whtRate);
  row[C.WHT_AMOUNT-1]  = safeFloat(data.whtAmount);
  row[C.NET_AMOUNT-1]  = safeFloat(data.netAmount);
  row[C.TRANSFER_REF-1]= data.transferRef || '';
  row[C.STATUS-1]      = data.status      || STATUS.PENDING;
  row[C.SOURCE-1]      = data.source      || 'manual';
  row[C.SLIP_IMAGE-1]  = data.slipImage   || '';
  row[C.REF_NO-1]      = data.refNo       || '';
  row[C.INVOICE_ID-1]  = data.invoiceId   || '';
  row[C.RECEIPT_ID-1]  = data.receiptId   || '';
  row[C.CREATED_AT-1]  = now;

  // Recalculate WHT and Net if not provided
  if (!data.whtAmount && row[C.GROSS_AMOUNT-1] && row[C.WHT_RATE-1]) {
    row[C.WHT_AMOUNT-1] = Math.round(row[C.GROSS_AMOUNT-1] * row[C.WHT_RATE-1]) / 100;
  }
  if (!data.netAmount) {
    row[C.NET_AMOUNT-1] = row[C.GROSS_AMOUNT-1] - row[C.FEE-1] - row[C.WHT_AMOUNT-1];
  }

  // Check duplicate
  const dup = checkDuplicate(row);
  if (dup.isDuplicate) {
    row[C.STATUS-1] = STATUS.DUPLICATE + '_' + dup.matchId;
  }

  getSheet(SHEET_NAMES.TB_STAGING).appendRow(row);

  // Auto-match transfer
  if (row[C.GROUP_DETAIL-1] === 'Transfer' && row[C.STATUS-1] !== STATUS.DUPLICATE) {
    row[C.STATUS-1] = STATUS.TRANSFER_UNMATCHED;
    // Update status in sheet
    const ws = getSheet(SHEET_NAMES.TB_STAGING);
    const lastRow = ws.getLastRow();
    ws.getRange(lastRow, C.STATUS).setValue(STATUS.TRANSFER_UNMATCHED);
    autoMatchTransfers();
  }

  return transId;
}

// ── Get staging items for Web App ────────────────────────────
function getStagingItems(filter) {
  filter = filter || {};
  const ws     = getSheet(SHEET_NAMES.TB_STAGING);
  const last   = ws.getLastRow();
  if (last < 2) return [];

  const data   = ws.getRange(2, 1, last-1, TOTAL_COLS).getValues();
  const items  = [];
  const statusFilter = filter.status || '';
  const ownerFilter  = filter.owner  || '';

  data.forEach(function(row, i) {
    if (!row[C.TRANS_ID-1]) return;
    const s = row[C.STATUS-1];
    if (statusFilter && s !== statusFilter) return;
    if (ownerFilter && row[C.HEAD_OWNER-1] !== ownerFilter) return;

    items.push({
      rowNum       : i + 2,
      transId      : row[C.TRANS_ID-1],
      date         : row[C.DATE-1] ? formatDate(row[C.DATE-1]) : '',
      headOwner    : row[C.HEAD_OWNER-1],
      accountOut   : row[C.ACCOUNT_OUT-1],
      accountIn    : row[C.ACCOUNT_IN-1],
      customer     : row[C.CUSTOMER-1],
      groupDetail  : row[C.GROUP_DETAIL-1],
      category     : row[C.CATEGORY-1],
      subCategory  : row[C.SUB_CATEGORY-1],
      detail       : row[C.DETAIL-1],
      tripTag      : row[C.TRIP_TAG-1],
      grossAmount  : row[C.GROSS_AMOUNT-1],
      fee          : row[C.FEE-1],
      whtRate      : row[C.WHT_RATE-1],
      whtAmount    : row[C.WHT_AMOUNT-1],
      netAmount    : row[C.NET_AMOUNT-1],
      transferRef  : row[C.TRANSFER_REF-1],
      status       : s,
      source       : row[C.SOURCE-1],
      slipImage    : row[C.SLIP_IMAGE-1],
      createdAt    : row[C.CREATED_AT-1] ? String(row[C.CREATED_AT-1]) : '',
    });
  });
  return items;
}

// ── Classify + confirm one row to TB_Transactions ─────────────
function classifyAndConfirm(transId, classifyData) {
  const ws   = getSheet(SHEET_NAMES.TB_STAGING);
  const data = ws.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][C.TRANS_ID-1] !== transId) continue;

    // Apply classify data
    var row = data[i].slice();
    if (classifyData.headOwner)   row[C.HEAD_OWNER-1]   = classifyData.headOwner;
    if (classifyData.accountOut !== undefined) row[C.ACCOUNT_OUT-1]  = classifyData.accountOut;
    if (classifyData.accountIn  !== undefined) row[C.ACCOUNT_IN-1]   = classifyData.accountIn;
    if (classifyData.customer)    row[C.CUSTOMER-1]     = classifyData.customer;
    if (classifyData.groupDetail) row[C.GROUP_DETAIL-1] = classifyData.groupDetail;
    if (classifyData.category)    row[C.CATEGORY-1]     = classifyData.category;
    if (classifyData.subCategory !== undefined) row[C.SUB_CATEGORY-1]= classifyData.subCategory;
    if (classifyData.detail !== undefined)      row[C.DETAIL-1]      = classifyData.detail;
    if (classifyData.tripTag !== undefined)     row[C.TRIP_TAG-1]    = classifyData.tripTag;
    if (classifyData.whtRate !== undefined) {
      row[C.WHT_RATE-1]   = safeFloat(classifyData.whtRate);
      row[C.WHT_AMOUNT-1] = Math.round(row[C.GROSS_AMOUNT-1] * row[C.WHT_RATE-1]) / 100;
      row[C.NET_AMOUNT-1] = row[C.GROSS_AMOUNT-1] - row[C.FEE-1] - row[C.WHT_AMOUNT-1];
    }
    row[C.STATUS-1] = STATUS.DONE;

    // Copy to TB_Transactions
    getSheet(SHEET_NAMES.TB_TRANSACTIONS).appendRow(row);

    // Update staging row status to Done
    ws.getRange(i+1, C.STATUS).setValue(STATUS.DONE);

    Logger.log('Confirmed: ' + transId);
    return { success: true, transId: transId };
  }
  return { success: false, error: 'Trans_ID not found: ' + transId };
}

// ── Update staging row fields ─────────────────────────────────
function updateStagingRow(transId, updates) {
  const ws   = getSheet(SHEET_NAMES.TB_STAGING);
  const data = ws.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][C.TRANS_ID-1] !== transId) continue;
    Object.keys(updates).forEach(function(colName){
      const colIdx = C[colName.toUpperCase()];
      if (colIdx) ws.getRange(i+1, colIdx).setValue(updates[colName]);
    });
    return { success: true };
  }
  return { success: false, error: 'Not found: ' + transId };
}

// ── Dashboard stats ───────────────────────────────────────────
function getStats() {
  const pending    = getStagingItems({ status: STATUS.PENDING }).length;
  const unmatched  = getStagingItems({ status: STATUS.TRANSFER_UNMATCHED }).length;
  const needReview = getStagingItems({ status: STATUS.NEED_REVIEW }).length;

  const txWs   = getSheet(SHEET_NAMES.TB_TRANSACTIONS);
  const txLast = txWs.getLastRow();
  const confirmed = txLast > 1 ? txLast - 1 : 0;

  // Total income / expense this month
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  let totalIn = 0, totalOut = 0;

  if (txLast > 1) {
    const txData = txWs.getRange(2, 1, txLast-1, TOTAL_COLS).getValues();
    txData.forEach(function(r){
      const d = new Date(r[C.DATE-1]);
      if (d.getMonth() !== month || d.getFullYear() !== year) return;
      const g = r[C.GROUP_DETAIL-1];
      const n = safeFloat(r[C.NET_AMOUNT-1]);
      if (g === 'Income') totalIn  += n;
      if (g === 'Expense') totalOut += n;
    });
  }

  return {
    pending     : pending,
    unmatched   : unmatched,
    needReview  : needReview,
    confirmed   : confirmed,
    totalIn     : Math.round(totalIn),
    totalOut    : Math.round(totalOut),
    month       : (month+1) + '/' + year,
  };
}

// ── Get dropdown data for Web App ─────────────────────────────
function getDropdowns() {
  function sheetCol(sheetName, col) {
    const ws   = getSS().getSheetByName(sheetName);
    if (!ws || ws.getLastRow() < 2) return [];
    return ws.getRange(2, col, ws.getLastRow()-1, 1).getValues()
             .map(function(r){ return r[0]; }).filter(function(v){ return v; });
  }

  const catWs = getSS().getSheetByName(SHEET_NAMES.MD_CATEGORIES);
  const cats  = {};   // groupDetail → [catNames]
  const subCatWs = getSS().getSheetByName(SHEET_NAMES.MD_SUBCATEGORIES);
  const subCats  = {}; // catName → [subCatNames]

  if (catWs && catWs.getLastRow() > 1) {
    const rows = catWs.getRange(2,1,catWs.getLastRow()-1,6).getValues();
    rows.forEach(function(r){
      const gd = r[1], cn = r[2];
      if (!cats[gd]) cats[gd] = [];
      cats[gd].push(cn);
    });
  }
  if (subCatWs && subCatWs.getLastRow() > 1) {
    const rows = subCatWs.getRange(2,1,subCatWs.getLastRow()-1,5).getValues();
    rows.forEach(function(r){
      const cn = r[2], sc = r[3];
      if (!subCats[cn]) subCats[cn] = [];
      subCats[cn].push(sc);
    });
  }

  return {
    headOwners  : sheetCol(SHEET_NAMES.MD_HEAD_OWNERS, 2),
    accounts    : sheetCol(SHEET_NAMES.MD_ACCOUNTS, 4),
    customers   : sheetCol(SHEET_NAMES.MD_CUSTOMERS, 2),
    trips       : sheetCol(SHEET_NAMES.MD_TRIPS, 1),
    groupDetails: ['Expense','Income','Transfer','AR','AP'],
    categories  : cats,
    subCategories: subCats,
  };
}
''')

# ════════════════════════════════════════════════════════════════════
# 04_DuplicateCheck.gs
# ════════════════════════════════════════════════════════════════════
w('04_DuplicateCheck.gs', '''
// ============================================================
// 04_DuplicateCheck.gs — ตรวจซ้ำก่อน add to staging
// Logic: Account + Amount + Date ±N days
// ============================================================

function checkDuplicate(newRow) {
  const tolerance = parseInt(getConfig('DUPLICATE_WINDOW_DAYS')) || 1;
  const newDate   = new Date(newRow[C.DATE-1]);
  const newAmt    = safeFloat(newRow[C.GROSS_AMOUNT-1]);
  const newAccOut = newRow[C.ACCOUNT_OUT-1];
  const newAccIn  = newRow[C.ACCOUNT_IN-1];
  const newGrp    = newRow[C.GROUP_DETAIL-1];

  // Transfer pair is NOT a duplicate — skip transfer check
  if (newGrp === 'Transfer') return { isDuplicate: false };

  // Check TB_Transactions first (confirmed data)
  const result = _scanForDuplicate(
    SHEET_NAMES.TB_TRANSACTIONS, newDate, newAmt, newAccOut, newAccIn, tolerance
  );
  if (result.isDuplicate) return result;

  // Then check TB_Staging (pending data)
  return _scanForDuplicate(
    SHEET_NAMES.TB_STAGING, newDate, newAmt, newAccOut, newAccIn, tolerance
  );
}

function _scanForDuplicate(sheetName, newDate, newAmt, newAccOut, newAccIn, tolerance) {
  const ws   = getSS().getSheetByName(sheetName);
  if (!ws || ws.getLastRow() < 2) return { isDuplicate: false };

  const data = ws.getRange(2, 1, ws.getLastRow()-1, TOTAL_COLS).getValues();

  for (var i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row[C.TRANS_ID-1]) continue;

    // Skip Done duplicates (already flagged)
    if (String(row[C.STATUS-1]).startsWith('Duplicate')) continue;

    const rowDate = new Date(row[C.DATE-1]);
    if (isNaN(rowDate.getTime())) continue;

    const dayDiff = Math.abs((newDate - rowDate) / (1000 * 60 * 60 * 24));
    if (dayDiff > tolerance) continue;

    const rowAmt = safeFloat(row[C.GROSS_AMOUNT-1]);
    if (Math.abs(rowAmt - newAmt) > 0.01) continue;

    if (row[C.ACCOUNT_OUT-1] !== newAccOut) continue;
    if (newAccIn && row[C.ACCOUNT_IN-1] !== newAccIn) continue;

    return {
      isDuplicate: true,
      matchId    : row[C.TRANS_ID-1],
      matchSheet : sheetName,
    };
  }
  return { isDuplicate: false };
}
''')

# ════════════════════════════════════════════════════════════════════
# 05_TransferMatcher.gs
# ════════════════════════════════════════════════════════════════════
w('05_TransferMatcher.gs', '''
// ============================================================
// 05_TransferMatcher.gs — จับคู่ Transfer อัตโนมัติ
// เงื่อนไข: Group_Detail=Transfer + Amount ±ค่าธรรมเนียม + Date ±1 วัน
// ============================================================

function autoMatchTransfers() {
  const ws     = getSheet(SHEET_NAMES.TB_STAGING);
  const last   = ws.getLastRow();
  if (last < 3) return;

  const data   = ws.getRange(2, 1, last-1, TOTAL_COLS).getValues();
  const tolerance = parseInt(getConfig('TRANSFER_MATCH_DAYS'))    || 1;
  const feeTol    = parseFloat(getConfig('TRANSFER_FEE_TOLERANCE')) || 100;

  // Collect unmatched transfer rows
  var unmatched = [];
  data.forEach(function(row, i) {
    if (row[C.GROUP_DETAIL-1] !== 'Transfer') return;
    if (row[C.TRANSFER_REF-1]) return; // already matched
    if (row[C.STATUS-1] === STATUS.DONE) return;
    unmatched.push({ rowNum: i+2, data: row });
  });

  if (unmatched.length < 2) return;

  var matched = {};

  for (var i = 0; i < unmatched.length; i++) {
    if (matched[i]) continue;
    for (var j = i+1; j < unmatched.length; j++) {
      if (matched[j]) continue;

      var a = unmatched[i];
      var b = unmatched[j];

      if (_isTransferPair(a.data, b.data, tolerance, feeTol)) {
        var ref = _generateTransferRef();

        ws.getRange(a.rowNum, C.TRANSFER_REF).setValue(ref);
        ws.getRange(b.rowNum, C.TRANSFER_REF).setValue(ref);
        ws.getRange(a.rowNum, C.STATUS).setValue(STATUS.TRANSFER_MATCHED);
        ws.getRange(b.rowNum, C.STATUS).setValue(STATUS.TRANSFER_MATCHED);

        Logger.log('Transfer matched: ' + ref + ' (' + a.data[C.TRANS_ID-1] + ' ↔ ' + b.data[C.TRANS_ID-1] + ')');
        matched[i] = matched[j] = true;
        break;
      }
    }
  }
}

function _isTransferPair(rowA, rowB, dayTol, feeTol) {
  // 1. Date within tolerance
  var dateA = new Date(rowA[C.DATE-1]);
  var dateB = new Date(rowB[C.DATE-1]);
  if (isNaN(dateA) || isNaN(dateB)) return false;
  var dayDiff = Math.abs((dateA - dateB) / (1000*60*60*24));
  if (dayDiff > dayTol) return false;

  // 2. Amount within fee tolerance
  var amtA = safeFloat(rowA[C.GROSS_AMOUNT-1]);
  var amtB = safeFloat(rowB[C.GROSS_AMOUNT-1]);
  if (Math.abs(amtA - amtB) > feeTol) return false;

  // 3. Cross-account: one out → the other in
  var outA = rowA[C.ACCOUNT_OUT-1];
  var inA  = rowA[C.ACCOUNT_IN-1];
  var outB = rowB[C.ACCOUNT_OUT-1];
  var inB  = rowB[C.ACCOUNT_IN-1];

  // A sent from X, B received at X  (outA matches inB or outB matches inA)
  if (outA && inB && outA === inB) return true;
  if (outB && inA && outB === inA) return true;

  // Both have only out → different accounts (e.g. statement shows only OUT side)
  if (outA && outB && outA !== outB) {
    // Match if amounts are within tolerance (fee deducted)
    return true;
  }

  return false;
}

function _generateTransferRef() {
  var d = new Date();
  var p = function(n){ return String(n).padStart(2,'0'); };
  return 'TRF-' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + '-' +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
''')

print("Part 1 done")
