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
  MD_MEMBERS       : 'MD_Members',        // Multi-user: MEMBER_ID|NAME|LINE_UID|SHEET_ID|PIN|ACTIVE
  RPT_BALANCE      : 'RPT_AccountBalance',
  // CONFIG sheet ถูกแทนที่ด้วย Script Properties แล้ว
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
let _propsCache  = null;

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

// Master SS — bound spreadsheet (MD_* + CONFIG live here, always)
function getMasterSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

// User SS — member's personal sheet (TB_Staging + TB_Transactions)
// sheetId = null/'' → falls back to bound SS (single-user / admin mode)
function getUserSS(sheetId) {
  if (sheetId) {
    try { return SpreadsheetApp.openById(sheetId); }
    catch(e) { throw new Error('ไม่สามารถเปิด sheet ของสมาชิก: ' + e); }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// TB_* sheets come from user's SS; MD_*/CONFIG always from master SS
function getUserSheet(name, sheetId) {
  var ss = name.startsWith('TB_') ? getUserSS(sheetId) : getMasterSS();
  var ws = ss.getSheetByName(name);
  if (!ws) throw new Error('Sheet "' + name + '" not found' + (sheetId ? ' (member sheet)' : '') + ' — run setupAll() first.');
  return ws;
}

function getSheet(name) {
  const ws = getSS().getSheetByName(name);
  if (!ws) throw new Error('Sheet "' + name + '" not found — run setupAll() first.');
  return ws;
}

function getOrCreateSheet(name) {
  const ss = getSS();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ── Multi-user: Member helpers ────────────────────────────────
// MD_Members columns: MEMBER_ID(1) NAME(2) LINE_UID(3) SHEET_ID(4) PIN(5) ACTIVE(6)
function getMembers() {
  var ws = getMasterSS().getSheetByName(SHEET_NAMES.MD_MEMBERS);
  if (!ws || ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow()-1, 6).getValues()
    .filter(function(r){ return r[5] === true || String(r[5]).toUpperCase() === 'TRUE' || r[5] === 1; })
    .map(function(r){
      return { memberId: String(r[0]), name: String(r[1]), lineUid: String(r[2]),
               sheetId: String(r[3]), hasPin: !!r[4] };
    });
}

function getMemberByUid(lineUid) {
  var members = getMembers();
  for (var i = 0; i < members.length; i++) {
    if (members[i].lineUid === lineUid) return members[i];
  }
  return null; // UID ไม่พบ → ใช้ master SS (backward compat)
}

function verifyMemberPin(memberId, pin) {
  var ws = getMasterSS().getSheetByName(SHEET_NAMES.MD_MEMBERS);
  if (!ws || ws.getLastRow() < 2) {
    // ไม่มี MD_Members → single-user mode ใช้ CONFIG APP_PIN
    var stored = getConfig('APP_PIN');
    if (!stored) return { ok: true, sheetId: '', name: 'Admin' };
    return { ok: String(pin).trim() === String(stored).trim(), sheetId: '', name: 'Admin' };
  }
  var data = ws.getRange(2, 1, ws.getLastRow()-1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(memberId)) {
      var storedPin = String(data[i][4] || '');
      var ok = storedPin === '' || String(pin).trim() === storedPin;
      return { ok: ok, sheetId: String(data[i][3]), name: String(data[i][1]) };
    }
  }
  return { ok: false, sheetId: '', name: '' };
}

// ── Config — อ่านจาก Script Properties (Project Settings → Script Properties) ──
// วิธีตั้งค่า: GAS Editor → ⚙ Project Settings → Script Properties → Add row
// Keys: LINE_CHANNEL_TOKEN, LINE_CHANNEL_SECRET, LINE_CHANNEL_ID,
//       APP_PIN, WEB_APP_URL, SLIP_FOLDER_ID, TIMEZONE,
//       DEFAULT_WHT_RATE, TRANSFER_MATCH_DAYS, TRANSFER_FEE_TOLERANCE,
//       DUPLICATE_WINDOW_DAYS, FINANCE_SHEET_ID, APPSHEET_APP_ID
function getConfig(key) {
  if (!_propsCache) {
    try {
      _propsCache = PropertiesService.getScriptProperties().getProperties();
    } catch(e) {
      Logger.log('getConfig (PropertiesService) error: ' + e);
      _propsCache = {};
    }
  }
  return key ? (_propsCache[key] || '') : _propsCache;
}

// บันทึกค่าเดียว (ใช้ใน setupScriptProperties หรือ admin)
function setConfig(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
  _propsCache = null; // clear cache
}

// บันทึกหลายค่าพร้อมกัน
function setConfigAll(obj) {
  var props = {};
  Object.keys(obj).forEach(function(k){ props[k] = String(obj[k]); });
  PropertiesService.getScriptProperties().setProperties(props, false);
  _propsCache = null; // clear cache
}

function generateTransId() {
  // Use milliseconds + 4-digit random to prevent collision during batch imports
  const d   = new Date();
  const p   = function(n,w){ return String(n).padStart(w||2,'0'); };
  const ms  = p(d.getMilliseconds(), 3);
  const rnd = p(Math.floor(Math.random() * 9999), 4);
  return 'TX-' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) +
         '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
         '-' + ms + rnd;
}

// ── Input sanitization — prevent formula injection in Sheets ──
// Strings starting with =, +, -, @, tab are prefixed with apostrophe.
function sanitizeInput(v) {
  if (typeof v !== 'string') return v;
  v = v.trim().slice(0, 500); // cap at 500 chars
  if (/^[=+\-@\t]/.test(v)) v = "'" + v;
  return v;
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
