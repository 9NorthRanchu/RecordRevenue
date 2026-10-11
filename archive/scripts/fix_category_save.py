import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace('setting-category-account-type', 'setting-category-caption')
app = app.replace('group-setting-account-type', 'group-setting-caption')

with open(app_js_path, 'w') as f:
    f.write(app)

print("Fixed")
