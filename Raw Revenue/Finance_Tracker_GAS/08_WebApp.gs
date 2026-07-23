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

// Multi-user: get active members list (for login screen)
function api_getMembers() {
  return getMembers().map(function(m){
    return { memberId: m.memberId, name: m.name, hasPin: m.hasPin };
  });
}

// Multi-user: verify PIN and return sheetId + name
// Falls back to CONFIG APP_PIN in single-user mode (no MD_Members)
function api_verifyMemberPin(memberId, pin) {
  try {
    return verifyMemberPin(memberId, pin);
  } catch(e) {
    return { ok: false, sheetId: '', name: '', error: String(e) };
  }
}

// Legacy single-user PIN check (kept for backward compatibility)
function api_verifyPin(pin) {
  var stored = getConfig('APP_PIN');
  if (!stored) return true;
  return String(pin).trim() === String(stored).trim();
}

// ── Data APIs — all accept optional sheetId (member's TB sheet) ──

function api_getPageData(sheetId) {
  return {
    stats    : getStats(sheetId),
    staging  : getStagingItems({}, sheetId),
    dropdowns: getDropdowns(),
  };
}

function api_getStagingItems(filter, sheetId) {
  return getStagingItems(filter || {}, sheetId);
}

function api_classify(transId, data, sheetId) {
  return classifyAndConfirm(transId, _sanitizeData(data || {}), sheetId);
}

// Save details back to staging (no move to Transactions)
function api_updateDetails(transId, data, sheetId) {
  try {
    return updateStagingDetails(transId, _sanitizeData(data || {}), sheetId);
  } catch(e) {
    return { success: false, error: String(e) };
  }
}

function api_skipItem(transId, sheetId) {
  return updateStagingRow(transId, { STATUS: STATUS.NEED_REVIEW }, sheetId);
}

function api_addManual(data, sheetId) {
  try {
    var transId = addToStaging(_sanitizeData(data || {}), sheetId);
    return { success: true, transId: transId };
  } catch(e) {
    return { success: false, error: String(e) };
  }
}

function api_importCSV(csvContent, bankType, defaultAccount) {
  return importCSV(csvContent, bankType, defaultAccount);
}

// Phase 3: PDF import via Drive OCR
// urlOrId: Google Drive file URL หรือ file ID
// ต้องเปิด Drive API Advanced Service ใน GAS Editor ก่อนใช้งาน
function api_importPDF(urlOrId, bankType, defaultAccount, sheetId) {
  try {
    var fileId = _extractDriveFileId(urlOrId || '');
    if (!fileId) return { success: false, error: 'ไม่พบ File ID — กรุณาวาง URL หรือ ID ของไฟล์ PDF ใน Google Drive' };
    return importPDF(fileId, bankType, defaultAccount || '', sheetId || '');
  } catch(e) {
    return { success: false, error: String(e) };
  }
}

// Phase 4: Batch entry — save multiple rows in one call
// rows: [{date, headOwner, groupDetail, category, accountOut, accountIn, detail, grossAmount, ...}]
function api_addBatch(rows, sheetId) {
  var success = 0, failed = 0, errors = [];
  (rows || []).forEach(function(row, i) {
    try {
      if (!row.grossAmount || !row.groupDetail) {
        failed++;
        errors.push('แถว '+(i+1)+': ขาด groupDetail หรือ grossAmount');
        return;
      }
      addToStaging(_sanitizeData(row), sheetId);
      success++;
    } catch(e) {
      failed++;
      errors.push('แถว '+(i+1)+': '+String(e));
    }
  });
  return { success: success, failed: failed, errors: errors };
}

function api_getStats(sheetId) {
  return getStats(sheetId);
}

// ── Confirmed transactions ────────────────────────────────────

function api_getConfirmed(limit, sheetId) {
  const ws   = getUserSheet(SHEET_NAMES.TB_TRANSACTIONS, sheetId);
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

// Edit a confirmed transaction (update row in TB_Transactions directly)
function api_editConfirmed(transId, data, sheetId) {
  try {
    var clean = _sanitizeData(data || {});
    var ws    = getUserSheet(SHEET_NAMES.TB_TRANSACTIONS, sheetId);
    var vals  = ws.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (vals[i][C.TRANS_ID-1] !== transId) continue;
      var row = vals[i].slice();
      if (clean.headOwner  !== undefined) row[C.HEAD_OWNER-1]   = clean.headOwner;
      if (clean.accountOut !== undefined) row[C.ACCOUNT_OUT-1]  = clean.accountOut;
      if (clean.accountIn  !== undefined) row[C.ACCOUNT_IN-1]   = clean.accountIn;
      if (clean.customer   !== undefined) row[C.CUSTOMER-1]     = clean.customer;
      if (clean.groupDetail !== undefined) row[C.GROUP_DETAIL-1]= clean.groupDetail;
      if (clean.category   !== undefined) row[C.CATEGORY-1]     = clean.category;
      if (clean.subCategory !== undefined) row[C.SUB_CATEGORY-1]= clean.subCategory;
      if (clean.detail     !== undefined) row[C.DETAIL-1]       = clean.detail;
      if (clean.tripTag    !== undefined) row[C.TRIP_TAG-1]     = clean.tripTag;
      if (clean.whtRate    !== undefined) {
        row[C.WHT_RATE-1]   = safeFloat(clean.whtRate);
        row[C.WHT_AMOUNT-1] = Math.round(row[C.GROSS_AMOUNT-1] * row[C.WHT_RATE-1]) / 100;
        row[C.NET_AMOUNT-1] = row[C.GROSS_AMOUNT-1] - safeFloat(row[C.FEE-1]) - row[C.WHT_AMOUNT-1];
      }
      ws.getRange(i+1, 1, 1, TOTAL_COLS).setValues([row]);
      return { success: true, transId: transId };
    }
    return { success: false, error: 'Trans_ID not found: ' + transId };
  } catch(e) {
    return { success: false, error: String(e) };
  }
}

// ── Account balances ──────────────────────────────────────────

function api_getAccountBalances(sheetId, yearMonth) {
  try {
    return getAccountBalances(sheetId, yearMonth);
  } catch(e) {
    return [];
  }
}

// ── Sanitize all string fields in a data object ───────────────
function _sanitizeData(data) {
  var STRING_FIELDS = [
    'headOwner','accountOut','accountIn','customer','groupDetail',
    'category','subCategory','detail','tripTag','transferRef',
    'refNo','invoiceId','receiptId','source',
  ];
  var out = Object.assign({}, data);
  STRING_FIELDS.forEach(function(k){
    if (out[k] !== undefined) out[k] = sanitizeInput(out[k]);
  });
  return out;
}
