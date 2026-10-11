import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# Fix debt.debt_id to use debt.debt_id || debt.id
app = app.replace("debt.debt_id", "(debt.debt_id || debt.id)")
# Wait, replacing inside a template literal '${debt.debt_id}' might break if I just replace it blindly.
# Let's replace specific occurrences.

# In renderDebtsDashboard:
# onclick="viewDebtDetails('${debt.debt_id}')" -> onclick="viewDebtDetails('${debt.debt_id || debt.id}')"
app = app.replace("onclick=\"viewDebtDetails('${debt.debt_id}')\"", "onclick=\"viewDebtDetails('${debt.debt_id || debt.id}')\"")

# window.debtsHistoryCache[debt.debt_id] -> window.debtsHistoryCache[debt.debt_id || debt.id]
app = app.replace("window.debtsHistoryCache[debt.debt_id]", "window.debtsHistoryCache[debt.debt_id || debt.id]")

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed Debt ID.")
