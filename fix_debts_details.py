import re

# 1. Fix Button
html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

old_btn = 'onclick="document.getElementById(\'nav-settings\').click(); setTimeout(() => openSettingModal(\'account\'), 500);"'
new_btn = 'onclick="document.querySelector(\'.nav-item[data-target=\\\'settings\\\']\').click(); setTimeout(() => openSettingModal(\'account\'), 500);"'
html = html.replace(old_btn, new_btn)

with open(html_path, 'w') as f:
    f.write(html)


# 2. Fix % Paid color
app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

old_paid = '<div style="font-size: 0.65rem; color: #94a3b8; text-align: right; margin-top: 4px; font-weight: 600;">${progressPct.toFixed(0)}% Paid</div>'
new_paid = '<div style="font-size: 0.75rem; color: ${currentDebtTab === \'RECEIVABLE\' ? \'#10b981\' : \'#f43f5e\'}; text-align: right; margin-top: 4px; font-weight: 800; text-shadow: 0 1px 2px rgba(255,255,255,0.8);">${progressPct.toFixed(0)}% Paid</div>'

app = app.replace(old_paid, new_paid)

with open(app_js_path, 'w') as f:
    f.write(app)

print("Fixed")
