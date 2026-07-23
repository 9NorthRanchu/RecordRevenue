import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

missing_code = """}

window.prefillDebtTransaction = function(debtId) {
    const d = AppState.debts.find(x => x.id === debtId || x.debt_id === debtId);
    if(!d) return;
    
    // Setup Draft
    AppState.draftHistoryTx = {
        tx_id: null,
        date: new Date().toISOString().split('T')[0],
        total_amount: 0,
        account_name: '',
        details: []
    };
    
    // Push principal row"""

app = app.replace("}\n    \n    // Push principal row", missing_code)

with open(app_js_path, 'w') as f:
    f.write(app)

print("Restored missing code")
