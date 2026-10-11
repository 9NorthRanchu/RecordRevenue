import re

file_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/backend/src/index.js"
with open(file_path, 'r') as f:
    content = f.read()

# Update the UPDATE statement
content = content.replace(
    "UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?",
    "UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?, icon_type=?"
)

# Update the UPDATE values
content = content.replace(
    "data.start_balance, data.installment_amount, data.start_date, data.debt_id",
    "data.start_balance, data.installment_amount, data.start_date, data.icon_type || 'credit_card', data.debt_id"
)

# Update the INSERT statement
content = content.replace(
    "INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date)",
    "INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date, icon_type)"
)

# Update the INSERT values
content = content.replace(
    "data.start_balance, data.installment_amount, data.start_date)",
    "data.start_balance, data.installment_amount, data.start_date, data.icon_type || 'credit_card')"
)

with open(file_path, 'w') as f:
    f.write(content)

print("Backend index.js patched.")
