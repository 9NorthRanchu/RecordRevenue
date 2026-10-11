import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

# Add the button back to the Settings header
html = html.replace(
    '<h4>📝 ตั้งค่าโปรไฟล์หนี้สิน (Debt Profiles)</h4>',
    '<h4>📝 ตั้งค่าโปรไฟล์หนี้สิน (Debt Profiles)</h4>\n                                    <button class="btn btn-primary" onclick="showDebtModal()"><i class="fa-solid fa-plus"></i> เพิ่มสัญญาหนี้</button>'
)

with open(html_path, 'w') as f:
    f.write(html)
print("Button restored")
