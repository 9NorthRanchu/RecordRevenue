import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Replace start balance input
old_balance = '<input type="number" step="0.01" id="debt-start-balance" class="form-control" placeholder="0.00" style="background: rgba(255,255,255,0.7); border-radius: 8px;" required>'
new_balance = '<input type="text" inputmode="decimal" id="debt-start-balance" class="form-control" placeholder="0.00" style="background: rgba(255,255,255,0.7); border-radius: 8px;" onfocus="this.value = parseFormattedNum(this.value) || \'\'" onblur="this.value = formatCurrency(parseFormattedNum(this.value))" required>'
html = html.replace(old_balance, new_balance)

# Replace installment input
old_install = '<input type="number" step="0.01" id="debt-installment" class="form-control" placeholder="0.00" style="background: rgba(255,255,255,0.7); border-radius: 8px;">'
new_install = '<input type="text" inputmode="decimal" id="debt-installment" class="form-control" placeholder="0.00" style="background: rgba(255,255,255,0.7); border-radius: 8px;" onfocus="this.value = parseFormattedNum(this.value) || \'\'" onblur="this.value = formatCurrency(parseFormattedNum(this.value))">'
html = html.replace(old_install, new_install)

with open(html_path, 'w') as f:
    f.write(html)
print("index.html inputs formatted")
