// ============================================================
// 07_StatementImport.gs — CSV Statement parsers
// รองรับ: KBank, SCB, KTB, Krungsri, Credit Card
// ============================================================

// ── Batch import — single setValues() call instead of N appendRow() ──
function importCSV(csvContent, bankType, defaultAccount) {
  if (!csvContent || csvContent.length > 2000000) {
    return { success: false, error: 'ไฟล์ใหญ่เกินไปหรือว่างเปล่า (max 2MB)' };
  }
  var rows = _parseCSV(csvContent);
  var bank = (bankType || 'kbank').toLowerCase();

  var parseFn = {
    kbank: _parseKBank, scb: _parseSCB, ktb: _parseKTB,
    krungsri: _parseKrungsri, bbl: _parseBBL,
    cc: _parseCreditCard, creditcard: _parseCreditCard,
  }[bank];
  if (!parseFn) return { success: false, error: 'ไม่รู้จักธนาคาร: ' + bankType };

  var parsed = parseFn(rows);
  var source = bank + '_stmt';
  var now    = nowStr();
  var ws     = getUserSheet(SHEET_NAMES.TB_STAGING, ''); // CSV import → bound SS (single-user; pass sheetId for multi-user)

  var batchRows = [];
  var added = 0, skipped = 0, dupSkipped = 0;

  parsed.forEach(function(data) {
    if (!data.date || !data.grossAmount) { skipped++; return; }
    if (!data.accountOut && !data.accountIn) data.accountOut = defaultAccount || '';
    data.source = source;

    // Build the full row array
    var row = _buildStagingRow(data, now);

    // Duplicate check against TB_Transactions + TB_Staging
    var dup = checkDuplicate(row);
    if (dup.isDuplicate) {
      row[C.STATUS-1] = STATUS.DUPLICATE + '_' + dup.matchId;
      dupSkipped++;
    }
    batchRows.push(row);
    added++;
  });

  // Single batch write — no GAS timeout risk
  if (batchRows.length > 0) {
    var lastRow = ws.getLastRow();
    ws.getRange(lastRow + 1, 1, batchRows.length, TOTAL_COLS).setValues(batchRows);
    // Run transfer matching once after all rows are inserted
    autoMatchTransfers();
  }

  return {
    success   : true,
    added     : added,
    skipped   : skipped,
    duplicates: dupSkipped,
    total     : parsed.length,
  };
}

// ── PDF Statement Import — Drive OCR ─────────────────────────
// ต้องเปิด Drive API Advanced Service ใน GAS Editor:
//   Services → Drive API → Add
// fileId: Google Drive file ID ของ PDF statement
// bankType: 'kbank'|'scb'|'ktb'|'krungsri'|'bbl'|'cc'
// defaultAccount: ชื่อบัญชีหลัก (ถ้า OCR ไม่ระบุ)
// sheetId: member's TB sheet ('' = bound SS)
function importPDF(fileId, bankType, defaultAccount, sheetId) {
  var docId = '';
  try {
    if (!fileId) return { success: false, error: 'กรุณาระบุ File ID' };

    // 1. OCR PDF → Google Doc (requires Drive Advanced Service)
    var resource = {
      title   : 'OCR_stmt_' + fileId,
      mimeType: MimeType.GOOGLE_DOCS,
    };
    var ocrFile = Drive.Files.copy(resource, fileId, { ocr: true, ocrLanguage: 'th' });
    docId = ocrFile.id;

    // 2. Extract text
    var doc  = DocumentApp.openById(docId);
    var text = doc.getBody().getText();

    // 3. Clean up temp doc
    DriveApp.getFileById(docId).setTrashed(true);
    docId = '';

    // 4. Convert to row arrays (split by 2+ spaces or tab)
    var lines = text.split('\n')
      .map(function(l){ return l.replace(/\r/g,'').trim(); })
      .filter(Boolean);
    var rows = lines.map(function(l){
      // Try tab-split first; fall back to 2+ consecutive spaces
      return l.indexOf('\t') >= 0 ? l.split('\t') : l.split(/  +/);
    });

    // 5. Parse with existing bank parser
    var bank   = (bankType || 'kbank').toLowerCase();
    var parseFn = {
      kbank    : _parseKBank,
      scb      : _parseSCB,
      ktb      : _parseKTB,
      krungsri : _parseKrungsri,
      bbl      : _parseBBL,
      cc       : _parseCreditCard,
      creditcard: _parseCreditCard,
    }[bank];
    if (!parseFn) return { success: false, error: 'ไม่รู้จักธนาคาร: ' + bankType };

    var parsed  = parseFn(rows);
    var source  = bank + '_pdf';
    var now     = nowStr();
    var ws      = getUserSheet(SHEET_NAMES.TB_STAGING, sheetId);

    var batchRows = [];
    var added = 0, skipped = 0, dupSkipped = 0;

    parsed.forEach(function(data) {
      if (!data.date || !data.grossAmount) { skipped++; return; }
      if (!data.accountOut && !data.accountIn) data.accountOut = defaultAccount || '';
      data.source = source;
      var row = _buildStagingRow(data, now);
      var dup = checkDuplicate(row, sheetId);
      if (dup.isDuplicate) {
        row[C.STATUS-1] = STATUS.DUPLICATE + '_' + dup.matchId;
        dupSkipped++;
      }
      batchRows.push(row);
      added++;
    });

    if (batchRows.length > 0) {
      ws.getRange(ws.getLastRow()+1, 1, batchRows.length, TOTAL_COLS).setValues(batchRows);
      autoMatchTransfers(sheetId);
    }

    return {
      success   : true,
      added     : added,
      skipped   : skipped,
      duplicates: dupSkipped,
      total     : parsed.length,
      rawLines  : lines.length,
    };

  } catch(e) {
    // Clean up temp doc on error
    if (docId) { try { DriveApp.getFileById(docId).setTrashed(true); } catch(e2){} }
    return { success: false, error: 'PDF import error: ' + String(e) };
  }
}

// ── Parse Drive URL / shared link → file ID ──────────────────
function _extractDriveFileId(urlOrId) {
  if (!urlOrId) return '';
  // Already an ID (no slashes, no dots, alphanumeric + dash + underscore)
  if (/^[A-Za-z0-9_\-]{25,}$/.test(urlOrId.trim())) return urlOrId.trim();
  // Extract from URL patterns:
  //   /file/d/{id}/   or   id={id}
  var m = urlOrId.match(/\/file\/d\/([A-Za-z0-9_\-]+)/);
  if (m) return m[1];
  m = urlOrId.match(/[?&]id=([A-Za-z0-9_\-]+)/);
  if (m) return m[1];
  m = urlOrId.match(/\/d\/([A-Za-z0-9_\-]+)/);
  if (m) return m[1];
  return urlOrId.trim();
}

// ── Build one staging row array from a data object ──────────
// Shared by importCSV (batch) and addToStaging (single row)
function _buildStagingRow(data, now) {
  var transId = data.transId || generateTransId();
  now = now || nowStr();
  var s = sanitizeInput;
  var row = new Array(TOTAL_COLS).fill('');

  row[C.TRANS_ID-1]    = transId;
  row[C.DATE-1]        = data.date        || formatDate(new Date());
  row[C.HEAD_OWNER-1]  = s(data.headOwner   || '');
  row[C.ACCOUNT_OUT-1] = s(data.accountOut  || '');
  row[C.ACCOUNT_IN-1]  = s(data.accountIn   || '');
  row[C.CUSTOMER-1]    = s(data.customer    || '');
  row[C.GROUP_DETAIL-1]= s(data.groupDetail || '');
  row[C.CATEGORY-1]    = s(data.category    || '');
  row[C.SUB_CATEGORY-1]= s(data.subCategory || '');
  row[C.DETAIL-1]      = s(data.detail      || '');
  row[C.TRIP_TAG-1]    = s(data.tripTag     || '');
  row[C.GROSS_AMOUNT-1]= safeFloat(data.grossAmount);
  row[C.FEE-1]         = safeFloat(data.fee);
  row[C.WHT_RATE-1]    = safeFloat(data.whtRate);
  row[C.WHT_AMOUNT-1]  = safeFloat(data.whtAmount);
  row[C.NET_AMOUNT-1]  = safeFloat(data.netAmount);
  row[C.TRANSFER_REF-1]= s(data.transferRef || '');
  row[C.STATUS-1]      = data.status      || STATUS.PENDING;
  row[C.SOURCE-1]      = s(data.source    || 'manual');
  row[C.SLIP_IMAGE-1]  = data.slipImage   || '';
  row[C.REF_NO-1]      = s(data.refNo     || '');
  row[C.INVOICE_ID-1]  = s(data.invoiceId || '');
  row[C.RECEIPT_ID-1]  = s(data.receiptId || '');
  row[C.CREATED_AT-1]  = now;

  // Recalculate WHT if not pre-computed
  if (!data.whtAmount && row[C.GROSS_AMOUNT-1] && row[C.WHT_RATE-1]) {
    row[C.WHT_AMOUNT-1] = Math.round(row[C.GROSS_AMOUNT-1] * row[C.WHT_RATE-1]) / 100;
  }
  if (!data.netAmount) {
    row[C.NET_AMOUNT-1] = row[C.GROSS_AMOUNT-1] - row[C.FEE-1] - row[C.WHT_AMOUNT-1];
  }
  return row;
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
