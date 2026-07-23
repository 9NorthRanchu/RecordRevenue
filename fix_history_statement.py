import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Replace getDebtTransactions
pattern = re.compile(r"window\.getDebtTransactions = function\(debt\) \{.*?\};", re.DOTALL)

new_func = """window.getDebtTransactions = function(debt) {
    if (!AppState.transactions) return [];
    let txs = [];
    AppState.transactions.forEach(tx => {
        let principal = 0;
        let interest = 0;
        let involved = false;
        let detailNote = "";
        if (tx.details) {
            tx.details.forEach(det => {
                if (det.contact_id == debt.contact_id) {
                    if (debt.principal_category_id && det.category_id == debt.principal_category_id) {
                        principal += Number(det.amount || 0);
                        if(det.note) detailNote = det.note;
                        involved = true;
                    }
                    if (debt.interest_category_id && det.category_id == debt.interest_category_id) {
                        interest += Number(det.amount || 0);
                        if(det.note) detailNote = det.note;
                        involved = true;
                    }
                }
            });
        }
        if (involved) {
            let stmt = detailNote || tx.statement_desc || '';
            if (stmt === 'นำเข้าข้อมูลด่วน' || stmt === 'Imported Transaction') stmt = detailNote || '-';
            txs.push({
                date: tx.date,
                statement_desc: stmt,
                principal: principal,
                interest: interest
            });
        }
    });
    return txs;
};"""

app = pattern.sub(new_func, app)

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed Statement Column.")
