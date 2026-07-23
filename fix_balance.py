import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix 1: Fetch transactions in renderDebtsDashboard
old_render = """async function renderDebtsDashboard() {
    await fetchDebts();
    const container = document.getElementById("debts-cards-container");
    if (!container) return;
    container.innerHTML = '';
    
    // We assume AppState.transactions contains history. We need to calculate remaining balances.
    // For now we'll do a rough calculation using start_balance and any transactions linked to the principal_category_id.
"""

new_render = """async function renderDebtsDashboard() {
    await fetchDebts();
    
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
        if (res.ok) AppState.transactions = await res.json();
    } catch (e) { console.error(e); }

    const container = document.getElementById("debts-cards-container");
    if (!container) return;
    container.innerHTML = '';
    
    // We assume AppState.transactions contains history. We need to calculate remaining balances.
    // For now we'll do a rough calculation using start_balance and any transactions linked to the principal_category_id.
"""

app = app.replace(old_render, new_render)

# Fix 2: Use det.amount instead of det.fee
app = app.replace('principalPaid += Number(det.fee || 0);', 'principalPaid += Number(det.amount || 0);')
app = app.replace('currentBalance -= Number(det.fee || 0);', 'currentBalance -= Number(det.amount || 0);')
app = app.replace('interestPaid += Number(det.fee || 0);', 'interestPaid += Number(det.amount || 0);')


with open(app_js_path, 'w') as f:
    f.write(app)
print("Balance logic fixed")
