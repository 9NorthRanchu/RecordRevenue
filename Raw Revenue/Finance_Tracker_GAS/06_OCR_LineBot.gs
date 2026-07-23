// ============================================================
// 06_OCR_LineBot.gs — LINE Bot webhook + OCR + Confirmation Card
// ============================================================
// FLOW ใหม่:
//   ส่งสลิป → OCR → cache data → ส่ง Confirmation Card
//   → user กด ✅ ยืนยัน → addToStaging() → ส่ง Success card
//   → user กด ❌ ยกเลิก → ลบ cache → แจ้งยกเลิก
// ============================================================

const LINE_API   = 'https://api.line.me/v2/bot/message/reply';
const LINE_MEDIA = 'https://api-data.line.me/v2/bot/message/';

// ── doPost — entry point ──────────────────────────────────────
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var body = JSON.parse(e.postData.contents);
    var events = body.events || [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      try {
        if (ev.type === 'message' && ev.message.type === 'image') _handleImage(ev);
        else if (ev.type === 'message' && ev.message.type === 'text') _handleText(ev);
        else if (ev.type === 'postback') _handlePostback(ev);
      } catch(e2) { Logger.log('event err: ' + e2); }
    }
  } catch(e1) {
    Logger.log('doPost err: ' + e1);
  } finally {
    lock.releaseLock();
  }
  return;
}

// ── LINE HMAC-SHA256 signature verification ───────────────────
function _verifyLineSignature(body, signature) {
  const secret = getConfig('LINE_CHANNEL_SECRET');
  if (!secret) {
    Logger.log('LINE_CHANNEL_SECRET not set — skipping signature check');
    return true;
  }
  if (!signature) return false;
  try {
    const hmac = Utilities.computeHmacSha256Signature(body, secret, Utilities.Charset.UTF_8);
    return Utilities.base64Encode(hmac) === signature;
  } catch(e) {
    Logger.log('Signature error: ' + e);
    return false;
  }
}

// ── Handle slip image — parse → cache → send Confirmation Card ──
function _handleImage(ev) {
  const token      = getConfig('LINE_CHANNEL_TOKEN');
  const folderId   = getConfig('SLIP_FOLDER_ID');
  const msgId      = ev.message.id;
  const replyToken = ev.replyToken;
  const lineUid    = (ev.source && ev.source.userId) ? ev.source.userId : '';

  // Multi-user: look up member by LINE UID; sheetId '' = bound SS (single-user fallback)
  var member  = lineUid ? getMemberByUid(lineUid) : null;
  var sheetId = member ? member.sheetId : '';

  try {
    // Download image from LINE
    const resp = UrlFetchApp.fetch(LINE_MEDIA + msgId + '/content', {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      throw new Error('LINE image download failed: HTTP ' + resp.getResponseCode());
    }
    const imageBlob = resp.getBlob().setName(msgId + '.jpg');

    // Save to Drive
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const file   = folder.createFile(imageBlob);
    const fileId = file.getId();

    // OCR
    const ocrText = extractTextFromImage(fileId);
    const banks   = analyzeBankTransaction(ocrText);
    const amount  = parseAmount(ocrText);
    const date    = parseSmartDate(ocrText) || formatDate(new Date());
    const note    = parseNote(ocrText);
    const transId = generateTransId();

    // ✋ ยังไม่ push ไป staging — เก็บ cache ไว้ก่อน (6 ชม.)
    const stagingData = {
      transId    : transId,
      date       : date,
      accountOut : banks.source      || '',
      accountIn  : banks.destination || '',
      detail     : note,
      grossAmount: amount,
      status     : STATUS.PENDING,
      source     : 'slip',
      slipImage  : 'https://drive.google.com/file/d/' + fileId,
      _sheetId   : sheetId,  // member's TB sheet ('' = bound SS)
    };
    CacheService.getScriptCache().put(
      'slip_' + transId,
      JSON.stringify(stagingData),
      21600  // 6 hours
    );

    // ส่ง Confirmation Card ให้ user กดยืนยัน
    _replyConfirmCard(replyToken, token, transId, date, amount, banks.source, banks.destination, note, banks.bankName);

  } catch(err) {
    Logger.log('_handleImage error: ' + err);
    try {
      _sendTextReply(replyToken, getConfig('LINE_CHANNEL_TOKEN'),
        '⚠️ ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่อีกครั้ง\n(' + String(err).substring(0, 80) + ')');
    } catch(e2) { Logger.log('Reply error: ' + e2); }
  }
}

// ── Handle postback (✅ confirm / ❌ cancel) ──────────────────
function _handlePostback(ev) {
  const token      = getConfig('LINE_CHANNEL_TOKEN');
  const replyToken = ev.replyToken;
  const data       = (ev.postback && ev.postback.data) ? ev.postback.data : '';

  // Parse: "action=confirm&key=TRANS-xxx"
  var params = {};
  data.split('&').forEach(function(p) {
    var kv = p.split('=');
    if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
  });

  var action  = params['action'] || '';
  var transId = params['key']    || '';

  if (action === 'edit' && transId) {
    // เก็บ state ว่า user นี้กำลัง edit transId อะไร (30 นาที)
    var lineUid2 = (ev.source && ev.source.userId) ? ev.source.userId : 'unknown';
    CacheService.getScriptCache().put('edit_' + lineUid2, transId, 1800);
    _sendTextReply(replyToken, token,
      '✏️ พิมพ์ค่าที่ต้องการแก้ไข (สามารถส่งหลายค่าพร้อมกัน):\n\n' +
      'จำนวน=2000\n' +
      'จาก=ชื่อบัญชีต้นทาง\n' +
      'ถึง=ชื่อบัญชีปลายทาง\n' +
      'วันที่=2026-06-18\n' +
      'note=ข้อความ\n\n' +
      'เช่น: จำนวน=2000 ถึง=KBank-9122');
    return;

  } else if (action === 'confirm' && transId) {
    // ดึงข้อมูลจาก cache
    var cached = CacheService.getScriptCache().get('slip_' + transId);
    if (!cached) {
      _sendTextReply(replyToken, token,
        '⚠️ หมดเวลายืนยัน (เกิน 6 ชั่วโมง)\nกรุณาส่งสลิปใหม่อีกครั้ง');
      return;
    }
    var stagingData = JSON.parse(cached);
    var memberSheetId = stagingData._sheetId || '';
    delete stagingData._sheetId; // clean before saving to sheet

    // ✅ push ไป TB_Staging (member's sheet if multi-user)
    addToStaging(stagingData, memberSheetId);
    CacheService.getScriptCache().remove('slip_' + transId);

    // Deep link → Web App
    var webAppUrl = getConfig('WEB_APP_URL');
    var deepLink  = webAppUrl ? webAppUrl + '?page=staging&id=' + transId : '';
    _sendSuccessReply(replyToken, token, stagingData, deepLink);

  } else if (action === 'cancel' && transId) {
    CacheService.getScriptCache().remove('slip_' + transId);
    _sendTextReply(replyToken, token,
      '🗑️ ยกเลิกแล้ว — สลิปนี้จะไม่ถูกบันทึก\nถ้าต้องการบันทึก ส่งรูปสลิปใหม่อีกครั้ง');

  } else {
    _sendTextReply(replyToken, token, '⚠️ คำสั่งไม่ถูกต้อง');
  }
}

// ── Handle text command ───────────────────────────────────────
function _handleText(ev) {
  const txt     = ev.message.text.trim().toLowerCase();
  const token   = getConfig('LINE_CHANNEL_TOKEN');
  const lineUid = (ev.source && ev.source.userId) ? ev.source.userId : '';
  var member    = lineUid ? getMemberByUid(lineUid) : null;
  var sheetId   = member ? member.sheetId : '';
  var reply     = '';

  // ── Edit mode: ถ้าผู้ใช้กำลังแก้ไขข้อมูลสลิป ──
  var editTransId = CacheService.getScriptCache().get('edit_' + lineUid);
  if (editTransId) {
    var cached2 = CacheService.getScriptCache().get('slip_' + editTransId);
    if (cached2) {
      var slip = JSON.parse(cached2);
      // parse "จำนวน=2000 จาก=xxx ถึง=yyy วันที่=2026-06-18 note=zzz"
      var pairs = ev.message.text.match(/(\S+)=([^\s=]+(?:\s+[^\s=]+)*?)(?=\s+\S+=|$)/g) || [];
      var changed = [];
      pairs.forEach(function(pair) {
        var idx = pair.indexOf('=');
        var k = pair.substring(0, idx).trim();
        var v = pair.substring(idx + 1).trim();
        if (k === 'จำนวน' || k === 'amount') { slip.grossAmount = parseFloat(v.replace(/,/g,'')); changed.push('จำนวน'); }
        else if (k === 'จาก' || k === 'from') { slip.accountOut = v; changed.push('จาก'); }
        else if (k === 'ถึง' || k === 'to') { slip.accountIn = v; changed.push('ถึง'); }
        else if (k === 'วันที่' || k === 'date') { slip.date = v; changed.push('วันที่'); }
        else if (k === 'note' || k === 'หมายเหตุ') { slip.detail = v; changed.push('note'); }
      });
      if (changed.length > 0) {
        CacheService.getScriptCache().put('slip_' + editTransId, JSON.stringify(slip), 21600);
        CacheService.getScriptCache().remove('edit_' + lineUid);
        // ส่ง confirmation card ใหม่พร้อมข้อมูลที่แก้ไขแล้ว
        _replyConfirmCard(ev.replyToken, token, editTransId,
          slip.date, slip.grossAmount, slip.accountOut, slip.accountIn, slip.detail, '');
      } else {
        _sendTextReply(ev.replyToken, token,
          '⚠️ ไม่พบข้อมูลที่ต้องการแก้ไข\nรูปแบบ: จำนวน=2000 หรือ ถึง=KBank-9122');
      }
      return;
    } else {
      CacheService.getScriptCache().remove('edit_' + lineUid);
    }
  }

  if (txt === 'สรุป' || txt === 'summary') {
    const s = getStats(sheetId);
    reply = '📊 สรุปประจำเดือน ' + (s.month || '') +
            '\n💰 รายรับ: ฿' + (s.totalIn  || 0).toLocaleString() +
            '\n💸 รายจ่าย: ฿' + (s.totalOut || 0).toLocaleString() +
            '\n📥 รอ Review: ' + (s.pending || 0) + ' รายการ' +
            '\n🔄 Transfer รอจับคู่: ' + (s.unmatched || 0);
  } else if (txt === 'pending' || txt === 'รอ') {
    reply = '📥 รายการรอ Review: ' + getStagingItems({ status: STATUS.PENDING }, sheetId).length + ' รายการ';
  } else {
    reply = '💡 คำสั่ง:\n• สรุป — ยอดเดือนนี้\n• pending — รายการรอ Review\n• ส่งรูปสลิป — บันทึกอัตโนมัติ (มียืนยันก่อน)';
  }

  _sendTextReply(ev.replyToken, token, reply);
}

// ══════════════════════════════════════════════════════════════
// OCR
// ══════════════════════════════════════════════════════════════
function extractTextFromImage(fileId) {
  try {
    const imageFile = DriveApp.getFileById(fileId);
    const resource  = { title: 'ocr_temp_' + fileId, mimeType: imageFile.getMimeType() };
    const docFile   = Drive.Files.insert(resource, imageFile.getBlob(), { ocr: true, ocrLanguage: 'th' });
    const text      = DocumentApp.openById(docFile.id).getBody().getText();
    Drive.Files.remove(docFile.id);
    return text;
  } catch(e) {
    Logger.log('OCR error: ' + e);
    return '';
  }
}

// ── Analyze bank accounts from OCR text ──────────────────────
function analyzeBankTransaction(ocrText) {
  const clean = ocrText.replace(/\s/g, '').toLowerCase();
  const lower = ocrText.toLowerCase();

  var appOwner = 'รอระบุ';
  var bankName = '';

  // ── Bank detection (เรียงจากเฉพาะเจาะจง → กว้าง) ──
  if (clean.includes('kplus') || clean.includes('kbiz') ||
      lower.includes('กสิกร') || lower.includes('kasikorn')) {
    appOwner = 'KBank';  bankName = 'ธนาคารกสิกรไทย';

  } else if (clean.includes('scbeasy') || clean.includes('scb') ||
             lower.includes('ไทยพาณิชย์') || lower.includes('siam commercial')) {
    appOwner = 'SCB';    bankName = 'ธนาคารไทยพาณิชย์';

  } else if (clean.includes('krungthai') || clean.includes('ktbnext') ||
             lower.includes('กรุงไทย') || lower.includes('เป๋าตัง') || clean.includes('paotang')) {
    appOwner = 'KTB';    bankName = 'ธนาคารกรุงไทย';

  } else if (clean.includes('krungsri') || lower.includes('กรุงศรี') ||
             lower.includes('อยุธยา')   || lower.includes('ayudhya') ||
             clean.includes('kma')       || clean.includes('bay')) {
    // BAY = Bank of Ayudhya = กรุงศรีอยุธยา
    appOwner = 'BAY';    bankName = 'ธนาคารกรุงศรีอยุธยา';

  } else if (clean.includes('bualuang') || lower.includes('บัวหลวง') ||
             lower.includes('bangkokbank') || clean.includes('bbl') ||
             lower.includes('ธนาคารกรุงเทพ')) {
    appOwner = 'BBL';    bankName = 'ธนาคารกรุงเทพ';

  } else if (clean.includes('truemoney') || lower.includes('ทรูมันนี่') ||
             lower.includes('วอลเล็ท')   || lower.includes('wallet')) {
    appOwner = 'TrueMoney'; bankName = 'TrueMoney Wallet';
  }

  // Match against MD_Accounts OCR_Keywords
  const ws = getSS().getSheetByName(SHEET_NAMES.MD_ACCOUNTS);
  var matches = [];
  if (ws && ws.getLastRow() > 1) {
    const data = ws.getRange(2, 1, ws.getLastRow() - 1, 7).getValues();
    data.forEach(function(row) {
      const accName    = row[3];
      const keywordStr = String(row[6] || '');
      const keywords   = keywordStr.split(',').map(function(k) {
        return k.trim().toLowerCase().replace(/[\s\-]/g, '');
      });
      for (var k = 0; k < keywords.length; k++) {
        if (keywords[k] && clean.includes(keywords[k])) {
          if (!matches.find(function(m) { return m.name === accName; })) {
            matches.push({ name: accName });
          }
          break;
        }
      }
    });
  }

  var source = 'รอระบุ', destination = 'รอระบุ';
  if (matches.length >= 2) {
    source = matches[0].name; destination = matches[1].name;
  } else if (matches.length === 1) {
    var found   = matches[0].name;
    var isOwner = appOwner !== 'รอระบุ' && found.toLowerCase().includes(appOwner.toLowerCase());
    if (isOwner) { source = found; }
    else { source = appOwner; destination = found; }
  } else if (appOwner !== 'รอระบุ') {
    source = appOwner;
  }

  return { source: source, destination: destination, bankName: bankName };
}

// ── Parse helpers ─────────────────────────────────────────────
function parseAmount(text) {
  // Priority 1: labeled amount keywords (รองรับ multiline)
  var labelPatterns = [
    /(?:จำนวนเงิน|ยอดโอน|ยอดชำระ|ยอดรวม|ยอดสุทธิ|จำนวน|total\s*amount|amount)[^\d]*([\d,]+(?:\.\d{1,2})?)/i,
    /฿\s*([\d,]+(?:\.\d{1,2})?)/,
    /([\d,]+(?:\.\d{2}))\s*(?:บาท|THB|baht)/i,
  ];
  for (var i = 0; i < labelPatterns.length; i++) {
    var m = text.match(labelPatterns[i]);
    if (m) {
      var v = parseFloat(m[1].replace(/,/g, ''));
      if (v > 0 && v < 10000000) return v;
    }
  }
  // Priority 2: comma-formatted numbers with 2 decimal places e.g. "2,000.00"
  var commaDecimals = (text.match(/[\d,]+\.\d{2}/g) || [])
    .map(function(s) { return parseFloat(s.replace(/,/g, '')); })
    .filter(function(v) { return v >= 1 && v <= 9999999; });
  if (commaDecimals.length) return Math.max.apply(null, commaDecimals);
  // Priority 3: plain numbers with 2 decimal places
  var decimals = (text.match(/\d+\.\d{2}/g) || [])
    .map(function(s) { return parseFloat(s); })
    .filter(function(v) { return v >= 1 && v <= 9999999; });
  if (decimals.length) return Math.max.apply(null, decimals);
  // Fallback
  var all = (text.match(/[\d,]+/g) || [])
    .map(function(s) { return parseFloat(s.replace(/,/g, '')); })
    .filter(function(v) { return v >= 1 && v <= 999999; });
  return all.length ? Math.max.apply(null, all) : 0;
}

function parseNote(text) {
  var m = text.match(/(?:บันทึก|note|memo|ข้อความ|หมายเหตุ)[:\s]*(.+)/i);
  return m ? m[1].trim().substring(0, 100) : '';
}

function parseSmartDate(text) {
  var m;
  var MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
                 jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

  // Format: "18 Jun 26" / "18 Jun 2026" / "18 June 2026"
  m = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/);
  if (m) {
    var mo = MONTHS[m[2].toLowerCase().substring(0,3)];
    if (mo) {
      var d = parseInt(m[1]), y = normalizeYear(parseInt(m[3]));
      return y + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    }
  }
  // Format: "Jun 18, 2026" / "June 18 2026"
  m = text.match(/([A-Za-z]{3,9})\s+(\d{1,2})[,\s]+(\d{2,4})/);
  if (m) {
    var mo2 = MONTHS[m[1].toLowerCase().substring(0,3)];
    if (mo2) {
      var d2 = parseInt(m[2]), y2 = normalizeYear(parseInt(m[3]));
      return y2 + '-' + String(mo2).padStart(2,'0') + '-' + String(d2).padStart(2,'0');
    }
  }
  // Format: DD/MM/YYYY or DD-MM-YYYY
  m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    var d3 = parseInt(m[1]), mo3 = parseInt(m[2]), y3 = normalizeYear(parseInt(m[3]));
    if (d3 > 31 || mo3 > 12) { var tmp = d3; d3 = mo3; mo3 = tmp; }
    return y3 + '-' + String(mo3).padStart(2,'0') + '-' + String(d3).padStart(2,'0');
  }
  // Format: YYYY-MM-DD
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return null;
}

function normalizeYear(y) {
  if (y > 2400) return y - 543;
  if (y < 100)  return y < 57 ? y + 2000 : y + 1900;
  return y;
}

// ══════════════════════════════════════════════════════════════
// Flex Message Builders
// ══════════════════════════════════════════════════════════════

// Confirmation Card — รอ user กดยืนยัน
function _replyConfirmCard(replyToken, token, transId, date, amount, src, dst, note, bankName) {
  var amtStr = Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' บาท';
  var body = {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      contents: [
        { type:'text', text:'📸 ตรวจสอบสลิป', weight:'bold', color:'#FFFFFF', size:'md' },
        bankName ? { type:'text', text: bankName, color:'rgba(255,255,255,0.75)', size:'xs' } : null,
      ].filter(Boolean),
      backgroundColor: '#E65100',
      paddingAll: '12px',
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type:'text', text:'กรุณาตรวจสอบข้อมูลก่อนยืนยัน', size:'xs', color:'#888888' },
        { type:'separator', margin:'sm' },
        _flexRow('วันที่',   String(date)),
        _flexRow('จำนวน',   amtStr, '#C62828'),
        _flexRow('จาก',     src || 'รอระบุ'),
        _flexRow('ถึง',     dst || 'รอระบุ'),
        note ? _flexRow('Note', note) : null,
        { type:'separator', margin:'sm' },
        { type:'text', text: transId, size:'xxs', color:'#BBBBBB' },
      ].filter(Boolean),
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        {
          type: 'button', height: 'sm', style: 'primary', color: '#2E7D32',
          action: { type: 'postback', label: '✅ ยืนยันบันทึก', data: 'action=confirm&key=' + transId },
        },
        {
          type: 'box', layout: 'horizontal', spacing: 'sm',
          contents: [
            {
              type: 'button', height: 'sm', style: 'secondary', flex: 1,
              action: { type: 'postback', label: '✏️ แก้ไข', data: 'action=edit&key=' + transId },
            },
            {
              type: 'button', height: 'sm', style: 'secondary', flex: 1,
              action: { type: 'postback', label: '❌ ยกเลิก', data: 'action=cancel&key=' + transId },
            },
          ],
        },
      ],
    },
  };

  UrlFetchApp.fetch(LINE_API, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'flex', altText: 'ตรวจสอบสลิป: ' + amtStr, contents: body }],
    }),
    muteHttpExceptions: true,
  });
}

// Success Card — หลัง user กด ✅ ยืนยัน
function _sendSuccessReply(replyToken, token, data, deepLink) {
  var amtStr = Number(data.grossAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' บาท';
  var body = {
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      contents: [{ type: 'text', text: '✅ บันทึกสำเร็จ', weight: 'bold', color: '#FFFFFF', size: 'md' }],
      backgroundColor: '#1565C0',
      paddingAll: '12px',
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        _flexRow('วันที่',  String(data.date)),
        _flexRow('จำนวน',  amtStr, '#C62828'),
        _flexRow('จาก',    data.accountOut || '-'),
        _flexRow('ถึง',    data.accountIn  || '-'),
        data.detail ? _flexRow('Note', data.detail) : null,
        { type: 'separator', margin: 'sm' },
        { type: 'text', text: 'รายการรออยู่ใน Staging — กด Review เพื่อตรวจสอบ', size: 'xs', color: '#888888', wrap: true },
      ].filter(Boolean),
    },
    footer: deepLink ? {
      type: 'box', layout: 'vertical',
      contents: [{
        type: 'button', height: 'sm', style: 'primary', color: '#1565C0',
        action: { type: 'uri', label: '🔍 Review ใน FinTrack', uri: deepLink },
      }],
    } : undefined,
  };

  UrlFetchApp.fetch(LINE_API, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'flex', altText: '✅ บันทึกสำเร็จ: ' + amtStr, contents: body }],
    }),
    muteHttpExceptions: true,
  });
}

// ── Utility ───────────────────────────────────────────────────
function _flexRow(label, value, valueColor) {
  return {
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: String(value), size: 'sm', weight: 'bold', flex: 3,
        wrap: true, color: valueColor || '#333333' },
    ],
  };
}

function _sendTextReply(replyToken, token, text) {
  UrlFetchApp.fetch(LINE_API, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }],
    }),
    muteHttpExceptions: true,
  });
}
