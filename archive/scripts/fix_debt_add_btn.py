import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

old_btn = 'onclick="document.querySelector(\'.nav-item[data-target=\\\'settings\\\']\').click(); setTimeout(() => openSettingModal(\'account\'), 500);"'
new_btn = 'onclick="showDebtModal()"'

if old_btn in html:
    html = html.replace(old_btn, new_btn)
else:
    print("WARNING: Could not find old button text.")

with open(html_path, 'w') as f:
    f.write(html)

print("Button fixed")
