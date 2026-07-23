// ============================================================
// 04_DuplicateCheck.gs — ตรวจซ้ำก่อน add to staging
// Logic: Account + Amount + Date ±N days
// ============================================================

function checkDuplicate(newRow, sheetId) {
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
    SHEET_NAMES.TB_TRANSACTIONS, newDate, newAmt, newAccOut, newAccIn, tolerance, sheetId
  );
  if (result.isDuplicate) return result;

  // Then check TB_Staging (pending data)
  return _scanForDuplicate(
    SHEET_NAMES.TB_STAGING, newDate, newAmt, newAccOut, newAccIn, tolerance, sheetId
  );
}

function _scanForDuplicate(sheetName, newDate, newAmt, newAccOut, newAccIn, tolerance, sheetId) {
  const ws   = getUserSheet(sheetName, sheetId);
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
