import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# 1. Add fetchTransactions function
fetch_tx_func = """
window.fetchTransactions = async function() {
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
        if (res.ok) {
            AppState.transactions = await res.json();
        }
    } catch (e) {
        console.error("Error fetching transactions", e);
    }
};
"""
if "window.fetchTransactions" not in app:
    app = app.replace("window.getDebtTransactions = function", fetch_tx_func + "\nwindow.getDebtTransactions = function")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed fetchTransactions.")
