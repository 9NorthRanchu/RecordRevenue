import os
BASE = '/sessions/intelligent-laughing-bardeen/mnt/Self Money/Finance_Tracker_GAS'
def w(filename, content):
    with open(os.path.join(BASE, filename), 'w', encoding='utf-8') as f:
        f.write(content.lstrip('\n'))
    print(f'✓ {filename} ({len(content):,} chars)')

# ════════════════════════════════════════════════════════════════════
# 06_OCR_LineBot.gs
# ════════════════════════════════════════════════════════════════════
w('06_OCR_LineBot.gs', r'''
// ============================================================
// 06_OCR_LineBot.gs — LINE Bot webhook + OCR (adapted from code2.txt)
// CHANNEL_ACCESS_TOKEN อ่านจาก CONFIG sheet
// ============================================================

const LINE_API   = 'https://api.line.me/v2/bot/message/reply';
const LINE_MEDIA = 'https://api-data.line.me/v2/bot/message/';

function doPost(e) {
  try {
    const events = JSON.parse(e.postData.contents).events;
    events.forEach(function(ev){
      if (ev.type === 'message') {
        if (ev.message.type === 'image') _handleImage(ev);
        else if (ev.message.type === 'text') _handleText(ev);
      }
    });
  } catch(err) {
    Logger.log('doPost error: ' + err);
  }
  return ContentService.createTextOutput('OK');
}

// ── Handle slip image ─────────────────────────────────────────
function _handleImage(ev) {
  const token   = getConfig('LINE_CHANNEL_TOKEN');
  const folderId = getConfig('SLIP_FOLDER_ID');
  const msgId   = ev.message.id;
  const replyToken = ev.replyToken;

  // Download image from LINE
  const imageBlob = UrlFetchApp.fetch(LINE_MEDIA + msgId + '/content', {
    headers: { Authorization: 'Bearer ' + token }
  }).getBlob().setName(msgId + '.jpg');

  // Save to Drive
  const folder   = DriveApp.getFolderById(folderId);
  const file     = folder.createFile(imageBlob);
  const fileId   = file.getId();

  // OCR
  const ocrText  = extractTextFromImage(fileId);
  const banks    = analyzeBankTransaction(ocrText);
  const amount   = parseAmount(ocrText);
  const date     = parseSmartDate(ocrText) || formatDate(new Date());
  const note     = parseNote(ocrText);
  const transId  = generateTransId();

  // Save to TB_Staging
  addToStaging({
    transId    : transId,
    date       : date,
    accountOut : banks.source      || '',
    accountIn  : banks.destination || '',
    detail     : note,
    grossAmount: amount,
    status     : STATUS.PENDING,
    source     : 'slip',
    slipImage  : 'https://drive.google.com/file/d/' + fileId,
  });

  // Reply to LINE
  const appId = getConfig('APPSHEET_APP_ID');
  const deepLink = appId
    ? 'https://www.appsheet.com/start/' + appId + '#view=TB_Staging&filter=Trans_ID%3D' + transId
    : '';

  _replyFlex(replyToken, token, transId, date, amount, banks.source, banks.destination, note, deepLink);
}

// ── Handle text command ───────────────────────────────────────
function _handleText(ev) {
  const txt   = ev.message.text.trim().toLowerCase();
  const token = getConfig('LINE_CHANNEL_TOKEN');
  var reply   = '';

  if (txt === 'สรุป' || txt === 'summary') {
    const s = getStats();
    reply = '📊 สรุปประจำเดือน ' + s.month +
            '\n💰 รายรับ: ฿' + s.totalIn.toLocaleString() +
            '\n💸 รายจ่าย: ฿' + s.totalOut.toLocaleString() +
            '\n📥 รอ Review: ' + s.pending + ' รายการ' +
            '\n🔄 Transfer รอจับคู่: ' + s.unmatched;
  } else if (txt === 'pending' || txt === 'รอ') {
    reply = '📥 รายการรอ Review: ' + getStagingItems({status: STATUS.PENDING}).length + ' รายการ';
  } else {
    reply = '💡 คำสั่ง:\n• สรุป — ยอดเดือนนี้\n• pending — รายการรอ Review\n• ส่งรูปสลิป — บันทึกรายจ่ายอัตโนมัติ';
  }

  UrlFetchApp.fetch(LINE_API, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: ev.replyToken,
      messages: [{ type: 'text', text: reply }]
    })
  });
}

// ── OCR via Google Docs ───────────────────────────────────────
function extractTextFromImage(fileId) {
  try {
    const imageFile = DriveApp.getFileById(fileId);
    const resource  = {
      title    : 'ocr_temp_' + fileId,
      mimeType : imageFile.getMimeType()
    };
    const options = {
      ocr        : true,
      ocrLanguage: 'th'
    };
    const docFile = Drive.Files.insert(resource, imageFile.getBlob(), options);
    const text    = DocumentApp.openById(docFile.id).getBody().getText();
    Drive.Files.remove(docFile.id); // cleanup
    return text;
  } catch(e) {
    Logger.log('OCR error: ' + e);
    return '';
  }
}

// ── Analyze bank accounts from OCR text ──────────────────────
function analyzeBankTransaction(ocrText) {
  const clean = ocrText.replace(/\s/g,'').toLowerCase();
  const lower = ocrText.toLowerCase();

  var appOwner = 'รอระบุ';
  if (clean.includes('kplus')||clean.includes('kbiz')||lower.includes('กสิกร')) appOwner='KBank';
  else if (clean.includes('scb')||lower.includes('ไทยพาณิชย์')||clean.includes('easy')) appOwner='SCB';
  else if (clean.includes('krungsri')||lower.includes('กรุงศรี')) appOwner='Krungsri';
  else if (clean.includes('truemoney')||lower.includes('วอลเล็ท')) appOwner='TrueMoney';
  else if (clean.includes('bualuang')||lower.includes('bangkokbank')) appOwner='BBL';
  else if (clean.includes('krungthai')||lower.includes('next')) appOwner='KTB';

  // Match against MD_Accounts keywords
  const ws = getSS().getSheetByName(SHEET_NAMES.MD_ACCOUNTS);
  var matches = [];
  if (ws && ws.getLastRow() > 1) {
    const data = ws.getRange(2,1,ws.getLastRow()-1,7).getValues();
    data.forEach(function(row, idx){
      const accName    = row[3];
      const keywordStr = String(row[6] || '');
      const keywords   = keywordStr.split(',').map(function(k){ return k.trim().toLowerCase().replace(/[\s\-]/g,''); });
      for (var k=0; k<keywords.length; k++) {
        if (keywords[k] && clean.includes(keywords[k])) {
          if (!matches.find(function(m){ return m.name===accName; })) {
            matches.push({ name: accName, idx: idx });
          }
          break;
        }
      }
    });
  }

  var source='รอระบุ', destination='รอระบุ';
  if (matches.length >= 2) {
    source=matches[0].name; destination=matches[1].name;
  } else if (matches.length === 1) {
    var found = matches[0].name;
    var isOwner = (appOwner!=='รอระบุ') && found.toLowerCase().includes(appOwner.toLowerCase());
    if (isOwner) { source=found; }
    else { source=appOwner; destination=found; }
  } else if (appOwner!=='รอระบุ') {
    source=appOwner;
  }

  return { source: source, destination: destination };
}

// ── Parse helpers (from code2.txt) ───────────────────────────
function parseAmount(text) {
  var matches = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})/g);
  if (!matches) return 0;
  var amounts = matches.map(function(m){ return parseFloat(m.replace(/,/g,'')); });
  return Math.max.apply(null, amounts);
}

function parseNote(text) {
  var m = text.match(/(?:บันทึก|note|memo|ข้อความ|หมายเหตุ)[:\s]*(.+)/i);
  return m ? m[1].trim().substring(0,100) : '';
}

function parseSmartDate(text) {
  var m;
  // Thai format: วันที่ DD/MM/BBBB หรือ DD/MM/BB
  m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    var d=parseInt(m[1]), mo=parseInt(m[2]), y=normalizeYear(parseInt(m[3]));
    if (d>31||mo>12) { var tmp=d; d=mo; mo=tmp; }
    return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  // ISO format
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return null;
}

function normalizeYear(y) {
  if (y > 2400) return y - 543;   // พ.ศ. → ค.ศ.
  if (y < 100)  return y < 57 ? y + 2000 : y + 1900;
  return y;
}

// ── Reply Flex message ────────────────────────────────────────
function _replyFlex(replyToken, token, transId, date, amount, src, dst, note, deepLink) {
  var body = {
    type    : 'bubble',
    size    : 'kilo',
    header  : {
      type    : 'box',
      layout  : 'vertical',
      contents: [{ type:'text', text:'📸 บันทึกสำเร็จ', weight:'bold', color:'#FFFFFF', size:'md' }],
      backgroundColor: '#1565C0',
      paddingAll: '12px',
    },
    body: {
      type   : 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type:'box', layout:'horizontal', contents:[
          { type:'text', text:'Trans ID', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:transId, size:'sm', weight:'bold', flex:3, wrap:true }
        ]},
        { type:'box', layout:'horizontal', contents:[
          { type:'text', text:'วันที่', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:String(date), size:'sm', flex:3 }
        ]},
        { type:'box', layout:'horizontal', contents:[
          { type:'text', text:'จำนวน', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:'฿'+Number(amount).toLocaleString(), size:'sm', weight:'bold', color:'#D32F2F', flex:3 }
        ]},
        { type:'box', layout:'horizontal', contents:[
          { type:'text', text:'จาก', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:src||'-', size:'sm', flex:3, wrap:true }
        ]},
        { type:'box', layout:'horizontal', contents:[
          { type:'text', text:'ถึง', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:dst||'-', size:'sm', flex:3, wrap:true }
        ]},
        note ? { type:'box', layout:'horizontal', contents:[
          { type:'text', text:'Note', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:note, size:'sm', flex:3, wrap:true }
        ]} : null,
      ].filter(Boolean)
    },
    footer: deepLink ? {
      type:'box', layout:'vertical',
      contents:[{
        type:'button', action:{ type:'uri', label:'🔍 Review ใน AppSheet', uri: deepLink },
        style:'primary', color:'#1565C0', height:'sm'
      }]
    } : undefined,
  };

  UrlFetchApp.fetch(LINE_API, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type:'flex', altText:'บันทึกสำเร็จ: ฿'+amount, contents: body }]
    })
  });
}
''')

# ════════════════════════════════════════════════════════════════════
# 07_StatementImport.gs
# ════════════════════════════════════════════════════════════════════
w('07_StatementImport.gs', r'''
// ============================================================
// 07_StatementImport.gs — CSV Statement parsers
// รองรับ: KBank, SCB, KTB, Krungsri, Credit Card
// ============================================================

function importCSV(csvContent, bankType, defaultAccount) {
  var rows  = _parseCSV(csvContent);
  var parsed = [];

  switch ((bankType||'').toLowerCase()) {
    case 'kbank':   parsed = _parseKBank(rows);    break;
    case 'scb':     parsed = _parseSCB(rows);       break;
    case 'ktb':     parsed = _parseKTB(rows);       break;
    case 'krungsri': parsed = _parseKrungsri(rows); break;
    case 'bbl':     parsed = _parseBBL(rows);       break;
    case 'cc':
    case 'creditcard': parsed = _parseCreditCard(rows); break;
    default: return { success: false, error: 'Unknown bank type: ' + bankType };
  }

  var added = 0, skipped = 0;
  parsed.forEach(function(row) {
    if (!row.date || !row.grossAmount) { skipped++; return; }
    if (!row.accountOut && !row.accountIn) {
      row.accountOut = defaultAccount || '';
    }
    row.source = bankType.toLowerCase() + '_stmt';
    addToStaging(row);
    added++;
  });

  // Run transfer matcher after bulk import
  autoMatchTransfers();

  return { success: true, added: added, skipped: skipped, total: parsed.length };
}

// ── CSV parser ────────────────────────────────────────────────
function _parseCSV(text) {
  var lines  = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  var result = [];
  lines.forEach(function(line){
    if (!line.trim()) return;
    var cols = [], cur = '', inQ = false;
    for (var i=0; i<line.length; i++) {
      var ch = line[i];
      if (ch==='"') { inQ=!inQ; }
      else if (ch===',' && !inQ) { cols.push(cur.trim()); cur=''; }
      else { cur+=ch; }
    }
    cols.push(cur.trim());
    result.push(cols);
  });
  return result;
}

// ── KBank CSV ─────────────────────────────────────────────────
// Format: วันที่, รายการ, ถอน/จ่าย, ฝาก/รับ, คงเหลือ, หมายเหตุ
function _parseKBank(rows) {
  var results = [];
  // Skip header rows (find first row with date pattern)
  var dataStart = 0;
  for (var i=0; i<Math.min(10,rows.length); i++) {
    if (/\d{2}\/\d{2}\/\d{4}/.test(rows[i][0]||'')) { dataStart=i; break; }
  }
  for (var i=dataStart; i<rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !/\d/.test(r[0])) continue;
    var date   = parseSmartDate(r[0]);
    var debit  = safeFloat((r[2]||'').replace(/,/g,''));
    var credit = safeFloat((r[3]||'').replace(/,/g,''));
    var detail = (r[1]||'').trim();
    if (!date) continue;

    var row = {
      date        : date,
      detail      : detail,
      groupDetail : '',
      category    : '',
      status      : STATUS.PENDING,
    };
    if (debit > 0) {
      row.grossAmount = debit;
      row.accountOut  = 'ระบุบัญชี KBank';
      row.groupDetail = 'Expense';
    } else if (credit > 0) {
      row.grossAmount = credit;
      row.accountIn   = 'ระบุบัญชี KBank';
      row.groupDetail = 'Income';
    } else continue;

    // Auto-detect Transfer
    if (/โอน|transfer|ทรานส์/i.test(detail)) row.groupDetail = 'Transfer';

    results.push(row);
  }
  return results;
}

// ── SCB CSV ───────────────────────────────────────────────────
// Format: Date, Time, Description, Withdrawal, Deposit, Balance
function _parseSCB(rows) {
  var results = [];
  var dataStart = 0;
  for (var i=0; i<Math.min(10,rows.length); i++) {
    if (/\d{2}\/\d{2}\/\d{2,4}/.test(rows[i][0]||'')) { dataStart=i; break; }
  }
  for (var i=dataStart; i<rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !/\d/.test(r[0])) continue;
    var date   = parseSmartDate(r[0] + ' ' + (r[1]||''));
    var detail = (r[2]||'').trim();
    var debit  = safeFloat((r[3]||'').replace(/,/g,''));
    var credit = safeFloat((r[4]||'').replace(/,/g,''));
    if (!date) continue;

    var row = { date: date, detail: detail, status: STATUS.PENDING, groupDetail: '' };
    if (debit > 0) {
      row.grossAmount = debit;
      row.accountOut  = 'ระบุบัญชี SCB';
      row.groupDetail = 'Expense';
    } else if (credit > 0) {
      row.grossAmount = credit;
      row.accountIn   = 'ระบุบัญชี SCB';
      row.groupDetail = 'Income';
    } else continue;
    if (/โอน|transfer/i.test(detail)) row.groupDetail = 'Transfer';
    results.push(row);
  }
  return results;
}

// ── KTB CSV ───────────────────────────────────────────────────
function _parseKTB(rows) {
  var results = [];
  var dataStart = 0;
  for (var i=0; i<Math.min(15,rows.length); i++) {
    if (/\d{2}\/\d{2}\/\d{4}/.test(rows[i][0]||'')) { dataStart=i; break; }
  }
  for (var i=dataStart; i<rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !/\d/.test(r[0])) continue;
    var date   = parseSmartDate(r[0]);
    var detail = (r[1]||'').trim();
    var debit  = safeFloat((r[2]||'').replace(/,/g,''));
    var credit = safeFloat((r[3]||'').replace(/,/g,''));
    if (!date) continue;

    var row = { date: date, detail: detail, status: STATUS.PENDING, groupDetail: '' };
    if (debit > 0) {
      row.grossAmount = debit; row.accountOut = 'ระบุบัญชี KTB'; row.groupDetail = 'Expense';
    } else if (credit > 0) {
      row.grossAmount = credit; row.accountIn = 'ระบุบัญชี KTB'; row.groupDetail = 'Income';
    } else continue;
    if (/โอน|transfer/i.test(detail)) row.groupDetail = 'Transfer';
    results.push(row);
  }
  return results;
}

// ── Krungsri CSV ──────────────────────────────────────────────
function _parseKrungsri(rows) {
  var results = [];
  var dataStart = 0;
  for (var i=0; i<Math.min(15,rows.length); i++) {
    if (/\d{2}\/\d{2}\/\d{4}/.test(rows[i][0]||'')) { dataStart=i; break; }
  }
  for (var i=dataStart; i<rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !/\d/.test(r[0])) continue;
    var date = parseSmartDate(r[0]);
    var detail = (r[1]||'').trim();
    var amount = safeFloat((r[2]||'').replace(/[,\+\-]/g,''));
    var sign   = (r[2]||'').includes('-') ? 'debit' : 'credit';
    if (!date || !amount) continue;

    var row = { date: date, detail: detail, status: STATUS.PENDING, grossAmount: amount };
    if (sign === 'debit') {
      row.accountOut = 'ระบุบัญชี Krungsri'; row.groupDetail = 'Expense';
    } else {
      row.accountIn = 'ระบุบัญชี Krungsri'; row.groupDetail = 'Income';
    }
    if (/โอน|transfer/i.test(detail)) row.groupDetail = 'Transfer';
    results.push(row);
  }
  return results;
}

// ── BBL CSV ───────────────────────────────────────────────────
function _parseBBL(rows) {
  return _parseKBank(rows); // similar format, reuse KBank parser
}

// ── Credit Card CSV ───────────────────────────────────────────
// Format: วันที่รายการ, ร้านค้า, จำนวนเงิน (THB), สกุลเงินต้นทาง, ...
function _parseCreditCard(rows) {
  var results = [];
  var dataStart = 0;
  for (var i=0; i<Math.min(15,rows.length); i++) {
    if (/\d{2}\/\d{2}\/\d{4}/.test(rows[i][0]||'')) { dataStart=i; break; }
  }
  for (var i=dataStart; i<rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !/\d/.test(r[0])) continue;
    var date   = parseSmartDate(r[0]);
    var detail = (r[1]||'').trim();
    var amount = safeFloat((r[2]||'').replace(/,/g,''));
    if (!date || amount <= 0) continue;

    results.push({
      date        : date,
      detail      : detail,
      grossAmount : amount,
      accountOut  : 'ระบุบัตรเครดิต',
      groupDetail : 'Expense',
      category    : '',
      status      : STATUS.PENDING,
    });
  }
  return results;
}
''')

# ════════════════════════════════════════════════════════════════════
# 08_WebApp.gs
# ════════════════════════════════════════════════════════════════════
w('08_WebApp.gs', r'''
// ============================================================
// 08_WebApp.gs — Web App entry point
// doGet() → serve HTML
// API functions called via google.script.run from browser
// ============================================================

function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile('WebApp')
    .setTitle('💰 Finance Tracker — Staging Inbox')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── API: called by google.script.run ─────────────────────────

function api_getPageData() {
  return {
    stats   : getStats(),
    staging : getStagingItems({ status: STATUS.PENDING }),
    dropdowns: getDropdowns(),
  };
}

function api_getStagingItems(filter) {
  return getStagingItems(filter || {});
}

function api_classify(transId, data) {
  return classifyAndConfirm(transId, data || {});
}

function api_skipItem(transId) {
  return updateStagingRow(transId, { STATUS: STATUS.NEED_REVIEW });
}

function api_addManual(data) {
  try {
    var transId = addToStaging(data);
    return { success: true, transId: transId };
  } catch(e) {
    return { success: false, error: String(e) };
  }
}

function api_importCSV(csvContent, bankType, defaultAccount) {
  return importCSV(csvContent, bankType, defaultAccount);
}

function api_getStats() {
  return getStats();
}

function api_getConfirmed(limit) {
  const ws   = getSheet(SHEET_NAMES.TB_TRANSACTIONS);
  const last = ws.getLastRow();
  if (last < 2) return [];
  const take = Math.min(limit || 50, last - 1);
  const data = ws.getRange(last - take + 1, 1, take, TOTAL_COLS).getValues();
  return data.reverse().map(function(row){
    return {
      transId    : row[C.TRANS_ID-1],
      date       : row[C.DATE-1] ? formatDate(row[C.DATE-1]) : '',
      headOwner  : row[C.HEAD_OWNER-1],
      accountOut : row[C.ACCOUNT_OUT-1],
      accountIn  : row[C.ACCOUNT_IN-1],
      customer   : row[C.CUSTOMER-1],
      groupDetail: row[C.GROUP_DETAIL-1],
      category   : row[C.CATEGORY-1],
      detail     : row[C.DETAIL-1],
      grossAmount: row[C.GROSS_AMOUNT-1],
      netAmount  : row[C.NET_AMOUNT-1],
    };
  });
}
''')

print("Part 2 done")
