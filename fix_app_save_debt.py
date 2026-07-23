import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

old_payload = """    const payload = {
        type: document.getElementById('debt-type').value,"""
new_payload = """    const payload = {
        debt_id: id || null,
        type: document.getElementById('debt-type').value,"""
app = app.replace(old_payload, new_payload)

old_fetch = """        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE}/api/debts/${id}` : `${API_BASE}/api/debts`;
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
            body: JSON.stringify(payload)
        });"""
new_fetch = """        const res = await fetch(`${API_BASE}/api/debts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
            body: JSON.stringify(payload)
        });"""
app = app.replace(old_fetch, new_fetch)

with open(app_js_path, 'w') as f:
    f.write(app)
print("Patched app.js saveDebtProfile")
