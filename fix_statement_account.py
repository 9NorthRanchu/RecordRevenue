import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# 1. Update getDebtTransactions to use account name
pattern = re.compile(r"window\.getDebtTransactions = function\(debt\) \{.*?\};", re.DOTALL)

new_func = """window.getDebtTransactions = function(debt) {
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
            let accountName = '-';
            if (tx.account_id && AppState.accounts) {
                const acc = AppState.accounts.find(a => a.id == tx.account_id);
                if (acc) accountName = acc.name;
            }
            
            txs.push({
                date: tx.date,
                statement_desc: accountName,
                principal: principal,
                interest: interest
            });
        }
    });
    return txs;
};"""

app = pattern.sub(new_func, app)

# 2. Remove "ฟุ้งๆ" (blur) from table container
app = app.replace("background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(12px); border-radius: 12px; border: 1px solid rgba(255,255,255,0.8); overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);", "background: #ffffff; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);")

# 3. Remove "Edit" button
edit_btn = """<button style="border: 1px solid #94a3b8; background: transparent; padding: 6px 16px; border-radius: 8px; font-weight: 500; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.9rem;">
                                <i class="fa-solid fa-pencil"></i> Edit
                            </button>"""
app = app.replace(edit_btn, "")

# Remove any plus buttons near the title if there are any in viewDebtDetails
plus_btn = """<button style="border: 1px solid #94a3b8; background: transparent; padding: 6px 12px; border-radius: 8px; font-weight: 500; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.9rem;">
                                <i class="fa-solid fa-plus"></i> Add
                            </button>"""
app = app.replace(plus_btn, "")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed Statement to Account, removed blur, removed Edit button.")
