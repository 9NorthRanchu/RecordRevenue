import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/backend/src/index.js"
with open(app_js_path, 'r') as f:
    app = f.read()

old_update = """          await env.DB.prepare(`
            UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?, icon_type=?
            WHERE debt_id=? AND family_id=?
          `).bind(data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.debt_id, userCheck.family_id).run();"""

new_update = """          await env.DB.prepare(`
            UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?, icon_type=?
            WHERE debt_id=? AND family_id=?
          `).bind(data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.icon_type, data.debt_id, userCheck.family_id).run();"""

app = app.replace(old_update, new_update)

old_insert = """          await env.DB.prepare(`
            INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date, icon_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(debt_id, userCheck.family_id, data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null).run();"""

new_insert = """          await env.DB.prepare(`
            INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date, icon_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(debt_id, userCheck.family_id, data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.icon_type || 'zodiac_1.png').run();"""

app = app.replace(old_insert, new_insert)

# And wait! Did I implement the PUT method for updating debts?
# The code in frontend app.js uses PUT!
#         const method = id ? 'PUT' : 'POST';
#         const url = id ? `${API_BASE}/api/debts/${id}` : `${API_BASE}/api/debts`;
# Let's check if the backend has PUT for debts!

with open(app_js_path, 'w') as f:
    f.write(app)

print("Patched backend")
