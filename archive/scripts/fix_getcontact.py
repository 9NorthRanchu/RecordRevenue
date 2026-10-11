import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix getContact -> AppState.contacts.find
app = app.replace("getContact(debt.contact_id)", "(AppState.contacts || []).find(c => c.contact_id === debt.contact_id)")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed getContact.")
