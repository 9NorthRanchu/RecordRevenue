import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Update showDebtModal to use formatCurrency
old_show = "document.getElementById('debt-start-balance').value = d.start_balance;"
new_show = "document.getElementById('debt-start-balance').value = formatCurrency(d.start_balance);"
app = app.replace(old_show, new_show)

old_show2 = "document.getElementById('debt-installment').value = d.installment_amount || '';"
new_show2 = "document.getElementById('debt-installment').value = d.installment_amount ? formatCurrency(d.installment_amount) : '';"
app = app.replace(old_show2, new_show2)

# Update saveDebtProfile to use parseFormattedNum
old_save = "start_balance: document.getElementById('debt-start-balance').value,"
new_save = "start_balance: parseFormattedNum(document.getElementById('debt-start-balance').value),"
app = app.replace(old_save, new_save)

old_save2 = "installment_amount: document.getElementById('debt-installment').value || null,"
new_save2 = "installment_amount: document.getElementById('debt-installment').value ? parseFormattedNum(document.getElementById('debt-installment').value) : null,"
app = app.replace(old_save2, new_save2)

with open(app_js_path, 'w') as f:
    f.write(app)
print("app.js inputs formatted")
