// ============================================================
// 03_StagingService.gs — CRUD for TB_Staging + TB_Transactions
// ============================================================

// ── Add single row to TB_Staging ─────────────────────────────
// Uses _buildStagingRow() from 07_StatementImport.gs
// sheetId: optional — member's personal sheet; omit for single-user / admin
function addToStaging(data, sheetId) {
  const row     = _buildStagingRow(data);
  const transId = row[C.TRANS_ID-1];

  // Duplicate check
  const dup = checkDuplicate(row, sheetId);
  if (dup.isDuplicate) {
    row[C.STATUS-1] = STATUS.DUPLICATE + '_' + dup.matchId;
  }

  // If Transfer and not duplicate → mark unmatched, then auto-match
  if (row[C.GROUP_DETAIL-1] === 'Transfer' && !String(row[C.STATUS-1]).startsWith('Duplicate')) {
    row[C.STATUS-1] = STATUS.TRANSFER_UNMATCHED;
  }

  getUserSheet(SHEET_NAMES.TB_STAGING, sheetId).appendRow(row);

  if (row[C.GROUP_DETAIL-1] === 'Transfer' && !String(row[C.STATUS-1]).startsWith('Duplicate')) {
    autoMatchTransfers(sheetId);
  }

  return transId;
}

// ── Get staging items for Web App ────────────────────────────
function getStagingItems(filter, sheetId) {
  filter = filter || {};
  const ws     = getUserSheet(SHEET_NAMES.TB_STAGING, sheetId);
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
function classifyAndConfirm(transId, classifyData, sheetId) {
  const ws   = getUserSheet(SHEET_NAMES.TB_STAGING, sheetId);
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
    getUserSheet(SHEET_NAMES.TB_TRANSACTIONS, sheetId).appendRow(row);

    // Update staging row status to Done
    ws.getRange(i+1, C.STATUS).setValue(STATUS.DONE);

    Logger.log('Confirmed: ' + transId);
    return { success: true, transId: transId };
  }
  return { success: false, error: 'Trans_ID not found: ' + transId };
}

// ── Update staging row fields (raw key→value map) ────────────
function updateStagingRow(transId, updates, sheetId) {
  const ws   = getUserSheet(SHEET_NAMES.TB_STAGING, sheetId);
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

// ── Save details back to TB_Staging WITHOUT moving to Transactions ──
// Same data shape as classifyData but keeps row in staging.
// Status stays as-is (Pending/Transfer_Matched/NeedReview etc.)
function updateStagingDetails(transId, classifyData, sheetId) {
  const ws   = getUserSheet(SHEET_NAMES.TB_STAGING, sheetId);
  const data = ws.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][C.TRANS_ID-1] !== transId) continue;

    var row = data[i].slice();
    // Apply field updates (same as classifyAndConfirm but no status change)
    if (classifyData.headOwner  !== undefined) row[C.HEAD_OWNER-1]   = classifyData.headOwner;
    if (classifyData.accountOut !== undefined) row[C.ACCOUNT_OUT-1]  = classifyData.accountOut;
    if (classifyData.accountIn  !== undefined) row[C.ACCOUNT_IN-1]   = classifyData.accountIn;
    if (classifyData.customer   !== undefined) row[C.CUSTOMER-1]     = classifyData.customer;
    if (classifyData.groupDetail !== undefined) row[C.GROUP_DETAIL-1]= classifyData.groupDetail;
    if (classifyData.category   !== undefined) row[C.CATEGORY-1]     = classifyData.category;
    if (classifyData.subCategory !== undefined) row[C.SUB_CATEGORY-1]= classifyData.subCategory;
    if (classifyData.detail     !== undefined) row[C.DETAIL-1]       = classifyData.detail;
    if (classifyData.tripTag    !== undefined) row[C.TRIP_TAG-1]     = classifyData.tripTag;
    if (classifyData.whtRate    !== undefined) {
      row[C.WHT_RATE-1]   = safeFloat(classifyData.whtRate);
      row[C.WHT_AMOUNT-1] = Math.round(row[C.GROSS_AMOUNT-1] * row[C.WHT_RATE-1]) / 100;
      row[C.NET_AMOUNT-1] = row[C.GROSS_AMOUNT-1] - row[C.FEE-1] - row[C.WHT_AMOUNT-1];
    }
    // Do NOT change status — row stays in staging for reconciliation

    // Write updated values back to the staging row
    ws.getRange(i+1, 1, 1, TOTAL_COLS).setValues([row]);

    Logger.log('Details saved (still in staging): ' + transId);
    return { success: true, transId: transId };
  }
  return { success: false, error: 'Trans_ID not found: ' + transId };
}

// ── Dashboard stats (single-pass — reads TB_Staging once) ─────
function getStats(sheetId) {
  // Count all staging statuses in one read instead of 3 separate calls
  const allItems = getStagingItems({}, sheetId);
  var pending = 0, unmatched = 0, needReview = 0;
  allItems.forEach(function(it) {
    if (it.status === STATUS.PENDING)              pending++;
    else if (it.status === STATUS.TRANSFER_UNMATCHED) unmatched++;
    else if (it.status === STATUS.NEED_REVIEW)    needReview++;
  });

  const txWs   = getUserSheet(SHEET_NAMES.TB_TRANSACTIONS, sheetId);
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

// ── Account balance summary from TB_Transactions ──────────────
// Returns [{account, totalIn, totalOut, net}] for the given month (YYYY-MM)
// or current month if omitted.
function getAccountBalances(sheetId, yearMonth) {
  const txWs   = getUserSheet(SHEET_NAMES.TB_TRANSACTIONS, sheetId);
  const txLast = txWs.getLastRow();
  if (txLast < 2) return [];

  var filterYear, filterMonth;
  if (yearMonth) {
    var parts = yearMonth.split('-');
    filterYear  = parseInt(parts[0], 10);
    filterMonth = parseInt(parts[1], 10) - 1; // 0-based
  } else {
    var now = new Date();
    filterYear  = now.getFullYear();
    filterMonth = now.getMonth();
  }

  var accMap = {};
  var txData = txWs.getRange(2, 1, txLast-1, TOTAL_COLS).getValues();
  txData.forEach(function(r) {
    var d = new Date(r[C.DATE-1]);
    if (d.getFullYear() !== filterYear || d.getMonth() !== filterMonth) return;
    var gross = safeFloat(r[C.GROSS_AMOUNT-1]);
    var net   = safeFloat(r[C.NET_AMOUNT-1]);
    var aOut  = r[C.ACCOUNT_OUT-1];
    var aIn   = r[C.ACCOUNT_IN-1];
    if (aOut) {
      if (!accMap[aOut]) accMap[aOut] = { account: aOut, totalIn: 0, totalOut: 0 };
      accMap[aOut].totalOut += gross;
    }
    if (aIn) {
      if (!accMap[aIn]) accMap[aIn] = { account: aIn, totalIn: 0, totalOut: 0 };
      accMap[aIn].totalIn += net;
    }
  });

  return Object.values(accMap).map(function(a) {
    return { account: a.account, totalIn: Math.round(a.totalIn), totalOut: Math.round(a.totalOut),
             net: Math.round(a.totalIn - a.totalOut) };
  });
}

// ── Get dropdown data for Web App ─────────────────────────────
// All dropdowns come from MD_* (master SS) — no sheetId needed
function getDropdowns() {
  function sheetCol(sheetName, col) {
    const ws   = getMasterSS().getSheetByName(sheetName);
    if (!ws || ws.getLastRow() < 2) return [];
    return ws.getRange(2, col, ws.getLastRow()-1, 1).getValues()
             .map(function(r){ return r[0]; }).filter(function(v){ return v; });
  }

  const catWs = getMasterSS().getSheetByName(SHEET_NAMES.MD_CATEGORIES);
  const cats  = {};   // groupDetail → [catNames]
  const subCatWs = getMasterSS().getSheetByName(SHEET_NAMES.MD_SUBCATEGORIES);
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
