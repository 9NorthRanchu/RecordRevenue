import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace('transform: scale(1.35);', 'transform: scale(1.05);')

with open(app_js_path, 'w') as f:
    f.write(app)
print("Patched image scales to 1.05")
