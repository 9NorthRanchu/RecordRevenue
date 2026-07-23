import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Replace ฿ with empty string in renderDebtsDashboard and viewDebtDetails
app = app.replace(">฿${formatCurrency", ">${formatCurrency")
app = app.replace("฿${formatCurrency", "${formatCurrency")

# Fix potential AppState.contacts undefined error
app = app.replace("AppState.contacts.find", "(AppState.contacts || []).find")

with open(app_js_path, 'w') as f:
    f.write(app)

print("Removed Baht symbol and fixed AppState.contacts")
