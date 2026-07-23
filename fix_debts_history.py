import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# 1. Add getDebtTransactions function
get_tx_func = """
window.getDebtTransactions = function(debt) {
    if (!AppState.transactions) return [];
    let txs = [];
    AppState.transactions.forEach(tx => {
        let principal = 0;
        let interest = 0;
        let involved = false;
        if (tx.details) {
            tx.details.forEach(det => {
                if (det.contact_id == debt.contact_id) {
                    if (debt.principal_category_id && det.category_id == debt.principal_category_id) {
                        principal += Number(det.amount || 0);
                        involved = true;
                    }
                    if (debt.interest_category_id && det.category_id == debt.interest_category_id) {
                        interest += Number(det.amount || 0);
                        involved = true;
                    }
                }
            });
        }
        if (involved) {
            txs.push({
                date: tx.date,
                statement_desc: tx.statement_desc,
                principal: principal,
                interest: interest
            });
        }
    });
    return txs;
};
"""
if "window.getDebtTransactions" not in app:
    app = app.replace("async function renderDebtsDashboard()", get_tx_func + "\nasync function renderDebtsDashboard()")

# 2. Replace window.debtsHistoryCache[...] with window.getDebtTransactions(debt)
app = re.sub(r"const txs = window\.debtsHistoryCache\[.*?\] \|\| window\.debtsHistoryCache\[.*?\] \|\| \[\];", "const txs = window.getDebtTransactions(debt);", app)
app = re.sub(r"const txs = window\.debtsHistoryCache\[.*?\] \|\| \[\];", "const txs = window.getDebtTransactions(debt);", app)

# 3. Fix viewName === 'debtor' navigation
# Old: else if (viewName === 'debtor') loadDebtor();
# New: else if (viewName === 'debtor') { Promise.all([fetchDebts(), fetchTransactions()]).then(() => renderDebtsDashboard()); }
app = app.replace("else if (viewName === 'debtor') loadDebtor();", "else if (viewName === 'debtor') { Promise.all([fetchDebts(), fetchTransactions()]).then(() => renderDebtsDashboard()); }")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed Debts History.")
