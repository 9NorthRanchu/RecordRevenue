import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

html = html.replace('<label for="entity-name">ชื่อ Company</label>', '<label for="setting-name" id="setting-name-label">ชื่อรายการ (Name)</label>')

with open(html_path, 'w') as f:
    f.write(html)

print("HTML fixed")
