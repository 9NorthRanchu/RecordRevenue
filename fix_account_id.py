import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace("const acc = AppState.accounts.find(a => a.id == tx.account_id);", "const acc = AppState.accounts.find(a => a.account_id == tx.account_id);")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed a.id to a.account_id.")
