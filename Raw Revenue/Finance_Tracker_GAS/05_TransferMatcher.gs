// ============================================================
// 05_TransferMatcher.gs — จับคู่ Transfer อัตโนมัติ
// เงื่อนไข: Group_Detail=Transfer + Amount ±ค่าธรรมเนียม + Date ±1 วัน
// ============================================================

function autoMatchTransfers(sheetId) {
  const ws     = getUserSheet(SHEET_NAMES.TB_STAGING, sheetId);
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
